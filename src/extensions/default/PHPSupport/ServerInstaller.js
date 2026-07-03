/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 *
 * This program is free software: you can redistribute it and/or modify it
 * under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT
 * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
 * FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License
 * for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see https://opensource.org/licenses/AGPL-3.0.
 *
 */

/**
 * ServerInstaller - on-demand acquisition of the Intelephense PHP language server.
 *
 * Intelephense is proprietary freeware: its license permits individual users to pair it with an
 * LSP-capable editor but forbids redistributing/bundling it. So it is NOT part of the app - the
 * user consents via an unobtrusive prompt (a toast plus a Problems-panel row, mirroring the
 * TypeScript enable flow) and a pinned version is then npm-installed from the public registry
 * into the app-data directory (the user acquires it personally - the license's intended use).
 * Installation runs as a status-bar TASK (TaskManager) with progress, using the bundled npm via
 * the existing node plumbing (NodeUtils._npmInstallInFolder) - no system npm or PHP runtime
 * needed. Works identically on Windows, macOS and Linux (no shell, no .bin shims).
 *
 * Layout under <appSupport>/lspServers/intelephense/:
 *   package.json                                     (written by us, exact version pin)
 *   node_modules/intelephense/lib/intelephense.js    (the server entry)
 *   cache/                                           (intelephense index cache - storagePath)
 *
 * Version upgrades: bumping INTELEPHENSE_VERSION makes the next start detect the pin mismatch,
 * wipe node_modules + lockfile, reinstall silently (consent already given) and pass clearCache
 * to the server once.
 *
 * @module extensions/default/PHPSupport/ServerInstaller
 */
define(function (require, exports, module) {


    const NodeUtils = brackets.getModule("utils/NodeUtils"),
        ProjectManager = brackets.getModule("project/ProjectManager"),
        NativeApp = brackets.getModule("utils/NativeApp"),
        NotificationUI = brackets.getModule("widgets/NotificationUI"),
        TaskManager = brackets.getModule("features/TaskManager"),
        PreferencesManager = brackets.getModule("preferences/PreferencesManager"),
        StringUtils = brackets.getModule("utils/StringUtils"),
        Strings = brackets.getModule("strings");

    const INTELEPHENSE_VERSION = "1.18.5";
    const PREF_PHP_CODE_INTELLIGENCE = "php.codeIntelligence";

    const INTELEPHENSE_HOME_URL = "https://intelephense.com";

    let _onInstalled = null;        // main.js callback: ({entryPath, upgraded}) => void
    let _inFlight = null;           // single-flight install promise
    const _promptShownForProject = new Set();   // prompt toast: once per project per session
    let _promptToast = null;
    let _panelRowDismissed = false; // Problems-panel row dismissed this session

    function _installDirVfs() {
        return Phoenix.VFS.getAppSupportDir() + "lspServers/intelephense/";
    }

    function _entryVfs() {
        return _installDirVfs() + "node_modules/intelephense/lib/intelephense.js";
    }

    function _packageJsonVfs() {
        return _installDirVfs() + "package.json";
    }

    /**
     * The platform (real disk) path of the server entry script, for spawning.
     * @return {string}
     */
    function getEntryPlatformPath() {
        return Phoenix.fs.getTauriPlatformPath(_entryVfs());
    }

    /**
     * The platform path of the index-cache directory handed to the server as storagePath.
     * No trailing separator - safest across platforms and path joins inside the server.
     * @return {string}
     */
    function getCachePlatformPath() {
        return Phoenix.fs.getTauriPlatformPath(_installDirVfs() + "cache");
    }

    /**
     * @return {Promise<{installed: boolean, pinMatches: boolean}>}
     */
    async function installedState() {
        const entryExists = await Phoenix.VFS.existsAsync(_entryVfs());
        if (!entryExists) {
            return { installed: false, pinMatches: false };
        }
        try {
            const pkgText = await Phoenix.VFS.readFileAsync(_packageJsonVfs(), "utf8");
            const pinned = JSON.parse(pkgText).dependencies.intelephense;
            return { installed: true, pinMatches: pinned === INTELEPHENSE_VERSION };
        } catch (e) {
            return { installed: true, pinMatches: false };
        }
    }

    // ----- install mechanics ----------------------------------------------------------------------

    async function _writePinnedPackageJson() {
        const pkg = {
            name: "phcode-php-tooling",
            private: true,
            description: "Locally installed PHP language server for Phoenix Code. Managed automatically.",
            dependencies: {}
        };
        pkg.dependencies.intelephense = INTELEPHENSE_VERSION;
        await Phoenix.VFS.writeFileAsync(_packageJsonVfs(), JSON.stringify(pkg, null, 4), "utf8");
    }

    // Upgrade: wipe the old tree first - a stale package-lock.json vs rewritten package.json makes
    // the node-side `npm ci` branch fail on manifest mismatch.
    async function _wipeForUpgrade() {
        try {
            await Phoenix.VFS.unlinkAsync(_installDirVfs() + "node_modules");
        } catch (e) {
            // didn't exist - fine
        }
        try {
            await Phoenix.VFS.unlinkAsync(_installDirVfs() + "package-lock.json");
        } catch (e) {
            // didn't exist - fine
        }
    }

    async function _doInstall() {
        const state = await installedState();
        if (state.installed && state.pinMatches) {
            return { entryPath: getEntryPlatformPath(), upgraded: false };
        }
        const upgrading = state.installed;
        hidePanelRow();
        // Status-bar task: visible progress the user can track from anywhere in the app. npm gives
        // no byte-level progress through execFile, so this advances by phase.
        const task = TaskManager.addNewTask(Strings.PHP_INSTALL_TITLE, Strings.PHP_INSTALLING,
            "<i class='fa-brands fa-php'></i>", { progressPercent: 5 });
        task.show();
        try {
            if (upgrading) {
                await _wipeForUpgrade();
            }
            task.setProgressPercent(15);
            await Phoenix.VFS.ensureExistsDirAsync(_installDirVfs());
            await Phoenix.VFS.ensureExistsDirAsync(_installDirVfs() + "cache/");
            await _writePinnedPackageJson();
            task.setProgressPercent(25);
            const platformDir = Phoenix.fs.getTauriPlatformPath(_installDirVfs());
            await NodeUtils._npmInstallInFolder(platformDir);
            task.setProgressPercent(90);
            const ok = await Phoenix.VFS.existsAsync(_entryVfs());
            if (!ok) {
                throw new Error("intelephense entry missing after npm install");
            }
            task.setProgressPercent(100);
            task.setMessage(Strings.PHP_INSTALL_DONE);
            task.setSucceded(); // (sic - TaskManager's exported name)
            setTimeout(task.close, 4000);
            return { entryPath: getEntryPlatformPath(), upgraded: upgrading };
        } catch (err) {
            const message = (err && err.message) || String(err);
            task.setFailed();
            task.setMessage(StringUtils.format(Strings.PHP_INSTALL_FAILED, message));
            setTimeout(task.close, 10000);
            return null;
        }
    }

    /**
     * Install (or upgrade) now - single-flighted. On success, notifies the onInstalled callback so
     * the language server can start immediately.
     * @return {Promise<?{entryPath: string, upgraded: boolean}>} null on failure
     */
    function installNow() {
        if (_inFlight) {
            return _inFlight;
        }
        _inFlight = _doInstall().then(function (result) {
            if (result && _onInstalled) {
                _onInstalled(result);
            }
            return result;
        }).finally(function () {
            _inFlight = null;
        });
        return _inFlight;
    }

    // ----- consent UI: prompt toast + Problems-panel row (mirrors the TS enable affordances) ------

    function _dismissPromptToast() {
        if (_promptToast) {
            _promptToast.close();
            _promptToast = null;
        }
    }

    function _showPromptToast() {
        const root = ProjectManager.getProjectRoot();
        const rootPath = (root && root.fullPath) || "";
        if (_promptShownForProject.has(rootPath)) {
            return;
        }
        _promptShownForProject.add(rootPath);
        const $tpl = $("<div class='ts-code-intel-toast'>");
        $("<div class='ts-code-intel-msg'>").text(Strings.PHP_INSTALL_MESSAGE).appendTo($tpl);
        // credit where due (and where premium lives) - not license-required, just right
        $("<a class='php-intel-powered-by'>").text(Strings.PHP_POWERED_BY_INTELEPHENSE)
            .attr("href", "#")
            .on("click", function (e) {
                e.preventDefault();
                e.stopPropagation();
                NativeApp.openURLInDefaultBrowser(INTELEPHENSE_HOME_URL);
            })
            .appendTo($tpl);
        const $btns = $("<div class='ts-code-intel-buttons'>").appendTo($tpl);
        const $install = $("<button class='ts-code-intel-action'>")
            .text(Strings.PHP_INSTALL_ENABLE).appendTo($btns);
        const $later = $("<button class='ts-code-intel-action'>")
            .text(Strings.PHP_INSTALL_NOT_NOW).appendTo($btns);
        // SUBTLE like the TS enable toast - quiet, theme-matching surface where the link-style
        // action buttons read clearly. The Problems-panel row provides the persistent affordance
        // if the toast is missed.
        _promptToast = NotificationUI.createToastFromTemplate(Strings.PHP_INSTALL_TITLE, $tpl, {
            dismissOnClick: false, autoCloseTimeS: 45, instantOpen: true,
            toastStyle: NotificationUI.NOTIFICATION_STYLES_CSS_CLASS.SUBTLE
        });
        $install.on("click", function () {
            _dismissPromptToast();
            installNow();
        });
        $later.on("click", function () {
            _dismissPromptToast();
        });
    }

    function _ensurePanelRow() {
        const $panel = $("#problems-panel");
        if (!$panel.length) {
            return null;
        }
        let $row = $panel.find(".php-intel-panel-row");
        if ($row.length) {
            return $row;
        }
        // reuse the TS row's styling; the extra class scopes our own lookups
        $row = $("<div class='ts-code-intel-panel-row php-intel-panel-row'>").hide();
        $("<span class='ts-code-intel-panel-text'>").text(Strings.PHP_PANEL_TEXT).appendTo($row);
        $("<button class='btn btn-mini primary ts-code-intel-panel-enable'>")
            .text(Strings.PHP_INSTALL_ENABLE)
            .on("click", function () {
                installNow();
            })
            .appendTo($row);
        $("<a class='ts-code-intel-panel-close'>")
            .attr("title", Strings.PHP_INSTALL_NOT_NOW).html("&times;")
            .on("click", function () {
                _panelRowDismissed = true; // session-only: reappears next launch
                $row.hide();
            })
            .appendTo($row);
        $panel.children(".toolbar").after($row);
        return $row;
    }

    /**
     * Hide the Problems-panel install row (e.g. once an install starts or completes).
     */
    function hidePanelRow() {
        const $row = $("#problems-panel .php-intel-panel-row");
        if ($row.length) {
            $row.hide();
        }
    }

    /**
     * Show/hide the Problems-panel install row for the current state. Call on active-editor and
     * project changes with whether a PHP DOCUMENT is active.
     * @param {boolean} phpDocumentActive
     */
    function updatePanelRow(phpDocumentActive) {
        if (typeof Phoenix !== "undefined" && Phoenix.isTestWindow) {
            return;
        }
        const $row = _ensurePanelRow();
        if (!$row) {
            return;
        }
        if (!phpDocumentActive || _panelRowDismissed || _inFlight ||
                PreferencesManager.get(PREF_PHP_CODE_INTELLIGENCE) === false) {
            $row.hide();
            return;
        }
        installedState().then(function (state) {
            if (state.installed) {
                $row.hide();
            } else {
                $row.show();
            }
        });
    }

    /**
     * Offer the install to the user: one-per-session prompt toast + the persistent Problems-panel
     * row. Call when a PHP document is active but the server is not installed.
     * @param {boolean} phpDocumentActive
     */
    function offerInstallUI(phpDocumentActive) {
        if (typeof Phoenix !== "undefined" && Phoenix.isTestWindow) {
            return;
        }
        _showPromptToast();
        updatePanelRow(phpDocumentActive);
    }

    /**
     * @param {{onInstalled: function({entryPath: string, upgraded: boolean})}} options
     */
    function init(options) {
        _onInstalled = (options && options.onInstalled) || null;
    }

    exports.init = init;
    exports.installedState = installedState;
    exports.installNow = installNow;
    exports.offerInstallUI = offerInstallUI;
    exports.updatePanelRow = updatePanelRow;
    exports.hidePanelRow = hidePanelRow;
    exports.getEntryPlatformPath = getEntryPlatformPath;
    exports.getCachePlatformPath = getCachePlatformPath;
    exports.INTELEPHENSE_VERSION = INTELEPHENSE_VERSION;
    exports.PREF_PHP_CODE_INTELLIGENCE = PREF_PHP_CODE_INTELLIGENCE;
});
