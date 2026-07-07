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
        ModalBar = brackets.getModule("widgets/ModalBar").ModalBar,
        NotificationUI = brackets.getModule("widgets/NotificationUI"),
        Dialogs = brackets.getModule("widgets/Dialogs"),
        DefaultDialogs = brackets.getModule("widgets/DefaultDialogs"),
        TaskManager = brackets.getModule("features/TaskManager"),
        PreferencesManager = brackets.getModule("preferences/PreferencesManager"),
        StringUtils = brackets.getModule("utils/StringUtils"),
        Strings = brackets.getModule("strings");

    const INTELEPHENSE_VERSION = "1.18.5";
    const PREF_PHP_CODE_INTELLIGENCE = "php.codeIntelligence";

    const INTELEPHENSE_HOME_URL = "https://intelephense.com";

    // once-per-lifetime: the first time the install bar shows, a dialog is raised over it so the
    // offer cannot be missed. Never shown again (even on cancel) - the bar remains the
    // ongoing affordance.
    const STATE_INSTALL_DIALOG_SHOWN = "php.installDialogShown";

    let _onInstalled = null;        // main.js callback: ({entryPath, upgraded}) => void
    let _inFlight = null;           // single-flight install promise
    // projects where the user clicked "Not Now" - the bar stops reappearing there for the
    // session. Until then it returns on every php file switch (closing on switch-away is not a
    // dismissal - only the explicit button is).
    const _promptDismissedForProject = new Set();
    let _promptBar = null;          // the ModalBar install prompt, when showing
    let _promptBarTip = null;       // the benefits tooltip binding on the bar's info icon
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

    function _closePromptBar() {
        if (_promptBarTip) {
            _promptBarTip.detach();
            _promptBarTip = null;
        }
        if (_promptBar) {
            _promptBar.close();
            _promptBar = null;
        }
    }

    function _benefitRows() {
        return [
            [Strings.PHP_BENEFIT_COMPLETIONS, Strings.PHP_BENEFIT_COMPLETIONS_SUB],
            [Strings.PHP_BENEFIT_DOCS, Strings.PHP_BENEFIT_DOCS_SUB],
            [Strings.PHP_BENEFIT_ERRORS, Strings.PHP_BENEFIT_ERRORS_SUB],
            [Strings.PHP_BENEFIT_NAV, Strings.PHP_BENEFIT_NAV_SUB]
        ];
    }

    // Compact benefits card for the bar's (i) icon - term -> what it means, one line each.
    function _benefitsTipHtml() {
        const $tip = $("<div>");
        $("<div class='ph-tip-title'>").text(Strings.PHP_INSTALL_TITLE).appendTo($tip);
        const $rows = $("<div class='ph-tip-rows'>").appendTo($tip);
        _benefitRows().forEach(function (row) {
            $("<span class='ph-tip-term'>").text(row[0]).appendTo($rows);
            $("<span class='ph-tip-def'>").text(row[1]).appendTo($rows);
        });
        return $tip.html();
    }

    // The very first offer ever also raises a dialog over the bar - the bar alone is easy to
    // miss. One shot per install (lifetime): cancelling leaves only the bar from then on.
    // Deliberately terse: one line + an (i) whose hover card lists what it provides (same
    // rich tooltip as the bar's info icon).
    function _maybeShowFirstTimeDialog() {
        const stateManager = PreferencesManager.stateManager;
        if (stateManager.get(STATE_INSTALL_DIALOG_SHOWN)) {
            return;
        }
        stateManager.set(STATE_INSTALL_DIALOG_SHOWN, true);
        const $body = $("<div>");
        const $text = $("<p>").appendTo($body);
        $("<span>").text(Strings.PHP_INSTALL_DIALOG_TEXT).appendTo($text);
        $text.append("&nbsp;");
        $("<i class='fa-solid fa-circle-info lsp-install-dialog-info'>").appendTo($text);
        $("<p class='lsp-install-dialog-later'>").text(Strings.PHP_INSTALL_LATER_INFO).appendTo($body);
        // quiet colophon crediting (and linking) the server this rides on
        const $credit = $("<p class='lsp-install-dialog-credit'>").appendTo($body);
        $("<span>").text(Strings.LSP_INSTALL_POWERED_BY + " ").appendTo($credit);
        $("<a href='#' data-href='" + INTELEPHENSE_HOME_URL + "'>").text("Intelephense").appendTo($credit);
        const dialog = Dialogs.showModalDialog(DefaultDialogs.DIALOG_ID_INFO, Strings.PHP_INSTALL_DIALOG_TITLE,
            $body.html(), [
                {
                    className: Dialogs.DIALOG_BTN_CLASS_NORMAL,
                    id: Dialogs.DIALOG_BTN_CANCEL,
                    text: Strings.PHP_INSTALL_NOT_NOW
                },
                {
                    className: Dialogs.DIALOG_BTN_CLASS_PRIMARY,
                    id: Dialogs.DIALOG_BTN_OK,
                    text: Strings.PHP_INSTALL_ENABLE
                }
            ]);
        const benefitsTip = NotificationUI.attachRichTooltip(
            dialog.getElement().find(".lsp-install-dialog-info"), _benefitsTipHtml(), { showDelayMs: 150 });
        // the body went in as serialized HTML, so link handling is delegated on the live dialog
        dialog.getElement().on("click", "a[data-href]", function (e) {
            e.preventDefault();
            NativeApp.openURLInDefaultBrowser($(e.currentTarget).attr("data-href"));
        });
        // the download size sits at the decision point - in the footer, left of the buttons -
        // so the cost is read exactly when the user weighs Install (store-style metadata chip)
        const $size = $("<span class='lsp-install-dialog-size'>");
        $("<i class='fa-solid fa-download'>").appendTo($size);
        $size.append(document.createTextNode(" " + Strings.PHP_INSTALL_DIALOG_SIZE));
        $size.prependTo(dialog.getElement().find(".modal-footer"));
        dialog.done(function (id) {
            benefitsTip.detach();
            if (id === Dialogs.DIALOG_BTN_OK) {
                _closePromptBar();
                installNow();
            }
            // on cancel the bar stays - it is the ongoing affordance
        });
    }

    // A find-bar-style banner across the top of the editor - impossible to miss on the file that
    // triggered it, but passive (autoClose false: clicking back into the code doesn't dismiss it).
    function _showPromptBar() {
        const root = ProjectManager.getProjectRoot();
        const rootPath = (root && root.fullPath) || "";
        if (_promptDismissedForProject.has(rootPath) || _promptBar) {
            return;
        }
        // built as detached DOM then serialized (ModalBar takes an HTML string); all click
        // handling is delegated on the live bar root below
        const $tpl = $("<div class='lsp-install-bar'>");
        $("<span class='lsp-install-bar-text'>").text(Strings.PHP_INSTALL_MESSAGE).appendTo($tpl);
        $("<i class='fa-solid fa-circle-info lsp-install-bar-info'>").appendTo($tpl);
        // credit where due (and where premium lives) - not license-required, just right
        $("<a class='lsp-install-bar-powered-by' href='#'>").text(Strings.PHP_POWERED_BY_INTELEPHENSE)
            .appendTo($tpl);
        $("<button class='btn btn-mini lsp-install-bar-later'>")
            .text(Strings.PHP_INSTALL_NOT_NOW).appendTo($tpl);
        $("<button class='btn btn-mini primary lsp-install-bar-install'>")
            .text(Strings.PHP_INSTALL_ENABLE).appendTo($tpl);

        _promptBar = new ModalBar($tpl[0].outerHTML, false);
        const $bar = _promptBar.getRoot();
        _promptBarTip = NotificationUI.attachRichTooltip(
            $bar.find(".lsp-install-bar-info"), _benefitsTipHtml(), { showDelayMs: 150 });
        $bar.on("click", ".lsp-install-bar-install", function () {
            _closePromptBar();
            installNow();
        });
        $bar.on("click", ".lsp-install-bar-later", function () {
            const projRoot = ProjectManager.getProjectRoot();
            _promptDismissedForProject.add((projRoot && projRoot.fullPath) || "");
            _closePromptBar();
        });
        $bar.on("click", ".lsp-install-bar-powered-by", function (e) {
            e.preventDefault();
            NativeApp.openURLInDefaultBrowser(INTELEPHENSE_HOME_URL);
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
        if (!phpDocumentActive) {
            _closePromptBar();  // the bar belongs to the php file that triggered it
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
        if (phpDocumentActive) {
            _showPromptBar();
            _maybeShowFirstTimeDialog();
        }
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
