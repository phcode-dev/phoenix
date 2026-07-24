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
 * LSP-capable editor but forbids redistributing/bundling it. So it is NOT part of the app - a
 * pinned version is npm-installed AUTOMATICALLY on the first php file opened (autoInstall) from
 * the public registry into the app-data directory (the user's machine acquires it locally - the
 * license's intended use). Installation runs as a status-bar TASK (TaskManager) whose popup is
 * opened so the download is always visible, with a stop (x) icon to cancel (cancel = no retry
 * until the next app launch; the master pref is the durable opt-out). It uses the bundled npm
 * via the existing node plumbing (NodeUtils._npmInstallInFolder) - no system npm or PHP runtime
 * needed. Offline is a non-event: install silently waits for connectivity. Real failures roll
 * back the partial tree, turn the task red (with a retry icon) and raise a toast. Works
 * identically on Windows, macOS and Linux (no shell, no .bin shims).
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
        NotificationUI = brackets.getModule("widgets/NotificationUI"),
        TaskManager = brackets.getModule("features/TaskManager"),
        PreferencesManager = brackets.getModule("preferences/PreferencesManager"),
        Metrics = brackets.getModule("utils/Metrics"),
        StringUtils = brackets.getModule("utils/StringUtils"),
        Strings = brackets.getModule("strings");

    // Exact tested pin - never a range. The authoritative value lives in src/config.json
    // (config.lsp_server_pins) so the scheduled update-lsp-pins workflow can bump it per
    // release; the literal here is only a fallback for exotic boot states.
    const _PINS = (brackets.config && brackets.config.lsp_server_pins) || {};
    if (!_PINS.intelephense) {
        // appConfig.js is generated from src/config.json by the build - a missing pins block
        // means a stale/broken build; scream so a developer can't miss it. The literal
        // fallback below keeps things limping along.
        window.alert("[PHPSupport] lsp_server_pins missing from AppConfig - " +
            "stale build? Run npm run build.");
    }
    const INTELEPHENSE_VERSION = _PINS.intelephense || "1.18.5";
    const PREF_PHP_CODE_INTELLIGENCE = "php.codeIntelligence";

    let _onInstalled = null;        // main.js callback: ({entryPath, upgraded}) => void
    let _inFlight = null;           // single-flight install promise
    let _cancelledThisSession = false;  // user hit the task's stop icon - no retry until relaunch
    let _cancelRequested = false;   // stop clicked while an install is in flight
    let _activeNpmInstall = null;   // cancellable handle of the in-flight npm install
    let _onlineRetryArmed = false;  // one-shot window "online" retry listener armed

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

    // Wipe the npm artifacts (node_modules + lockfile) but keep cache/ (the index cache) and let
    // package.json be rewritten. Used before every install (a stale package-lock.json vs the
    // rewritten package.json makes the node-side `npm ci` branch fail on manifest mismatch, and
    // a half-written node_modules from an interrupted run must not survive) and as the rollback
    // after a failed/cancelled install.
    async function _wipeTree() {
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

    // Errors that mean "the network is unavailable", not "the install is broken". These take the
    // QUIET path: offline must be a non-event, not a recurring red failure on every launch.
    const NETWORK_ERROR_RE = new RegExp(
        "failed to fetch|fetch failed|load failed|ENOTFOUND|ETIMEDOUT|ECONNRESET|ECONNREFUSED|" +
        "EAI_AGAIN|ENETUNREACH|getaddrinfo|network", "i");
    function _isNetworkError(err) {
        return NETWORK_ERROR_RE.test((err && err.message) || String(err));
    }

    // One-shot: retry the auto-install as soon as connectivity returns in this session.
    function _armOnlineRetry() {
        if (_onlineRetryArmed) {
            return;
        }
        _onlineRetryArmed = true;
        window.addEventListener("online", function () {
            _onlineRetryArmed = false;
            autoInstall();
        }, { once: true });
    }

    // Real-failure surface (in addition to the red task): the user learns setup failed even with
    // the Tasks popup closed.
    function _showFailureToast(message) {
        const $tpl = $("<div>").text(message);
        NotificationUI.createToastFromTemplate(Strings.PHP_INSTALL_TITLE, $tpl, {
            dismissOnClick: true,
            toastStyle: NotificationUI.NOTIFICATION_STYLES_CSS_CLASS.SUBTLE,
            autoCloseTimeS: 30,
            instantOpen: true
        });
    }

    async function _doInstall() {
        const state = await installedState();
        if (state.installed && state.pinMatches) {
            return { entryPath: getEntryPlatformPath(), upgraded: false };
        }
        const upgrading = state.installed;
        _cancelRequested = false;
        // Status-bar task whose popup is OPENED for every install - with no consent dialog
        // anymore, visibility is the transparency: the user must be able to see any download we
        // start. npm gives no byte-level progress through execFile, so this advances by phase.
        const task = TaskManager.addNewTask(Strings.PHP_INSTALL_TITLE, Strings.PHP_INSTALLING,
            "<i class='fa-brands fa-php'></i>", {
                progressPercent: 5,
                onStopClick: function () {
                    _cancelledThisSession = true;   // no auto-retry until the next app launch
                    _cancelRequested = true;
                    if (_activeNpmInstall) {
                        _activeNpmInstall.cancel().catch(function () {});
                    }
                },
                onRetryClick: function () {
                    task.close();
                    installNow();
                }
            });
        task.showStopIcon(Strings.PHP_INSTALL_STOP);
        task.show();
        try {
            // wipe-first: half-written trees from interrupted runs (and old versions on upgrade)
            // must not confuse npm or the entry check
            await _wipeTree();
            task.setProgressPercent(15);
            await Phoenix.VFS.ensureExistsDirAsync(_installDirVfs());
            await Phoenix.VFS.ensureExistsDirAsync(_installDirVfs() + "cache/");
            await _writePinnedPackageJson();
            task.setProgressPercent(25);
            if (_cancelRequested) {
                const cancelErr = new Error("install cancelled");
                cancelErr.cancelled = true;
                throw cancelErr;
            }
            const platformDir = Phoenix.fs.getTauriPlatformPath(_installDirVfs());
            _activeNpmInstall = NodeUtils._npmInstallInFolder(platformDir);
            try {
                await _activeNpmInstall;
            } finally {
                _activeNpmInstall = null;
            }
            task.setProgressPercent(90);
            const ok = await Phoenix.VFS.existsAsync(_entryVfs());
            if (!ok) {
                throw new Error("intelephense entry missing after npm install");
            }
            task.setProgressPercent(100);
            task.setMessage(Strings.PHP_INSTALL_DONE);
            task.setSucceded(); // (sic - TaskManager's exported name)
            setTimeout(task.close, 4000);
            Metrics.countEvent("lsp", "phpInst", upgrading ? "upOk" : "ok");
            return { entryPath: getEntryPlatformPath(), upgraded: upgrading };
        } catch (err) {
            const message = (err && err.message) || String(err);
            // rollback: a half-installed tree must not survive (the entry check keys "installed")
            await _wipeTree();
            const cancelled = _cancelRequested || (err && err.cancelled) || /cancelled/i.test(message);
            if (cancelled) {
                // user's own decision - no red state, no toast
                Metrics.countEvent("lsp", "phpInst", "cancel");
                task.close();
                return null;
            }
            if (_isNetworkError(err) || !navigator.onLine) {
                // QUIET path: offline is normal life, not an error. Retry when connectivity
                // returns (same session) or on the next launch.
                Metrics.countEvent("lsp", "phpInst", "waitNet");
                task.setMessage(Strings.PHP_INSTALL_WAITING_NETWORK);
                setTimeout(task.close, 4000);
                _armOnlineRetry();
                return null;
            }
            console.error("[PHPSupport] install failed", err);
            Metrics.countEvent("lsp", "phpInst", "fail");
            window.logger && window.logger.reportError(err, "[PHPSupport] LSP install failed");
            task.setFailed();
            task.setMessage(StringUtils.format(Strings.PHP_INSTALL_FAILED, message));
            task.showRestartIcon();
            task.show();
            _showFailureToast(StringUtils.format(Strings.PHP_INSTALL_FAILED, message));
            setTimeout(task.close, 30000);
            return null;
        } finally {
            _activeNpmInstall = null;
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

    /**
     * Auto-install without any consent UI - the status-bar task (opened popup, stop icon) is the
     * announcement. Guards, in order:
     *  - never in test windows (suites call installNow() explicitly; opening a .php fixture must
     *    not start surprise downloads),
     *  - master pref false = durable opt-out,
     *  - user cancelled this session = wait for the next launch,
     *  - offline = wait silently for connectivity (one-shot window "online" retry).
     * @return {Promise<?{entryPath: string, upgraded: boolean}>} null when skipped/failed
     */
    function autoInstall() {
        if (typeof Phoenix !== "undefined" && Phoenix.isTestWindow) {
            return Promise.resolve(null);
        }
        if (_cancelledThisSession ||
                PreferencesManager.get(PREF_PHP_CODE_INTELLIGENCE) === false) {
            return Promise.resolve(null);
        }
        if (!navigator.onLine) {
            _armOnlineRetry();
            return Promise.resolve(null);
        }
        return installNow();
    }

    /**
     * Wipe the whole install (including the index cache) and reacquire it - self-repair for a
     * supposedly-installed server that fails to start (entry corrupt beyond the existence check).
     * The onInstalled callback re-registers the server on success.
     * @return {Promise<?{entryPath: string, upgraded: boolean}>} null on failure
     */
    async function repairInstall() {
        await Phoenix.VFS.unlinkAsync(_installDirVfs()).catch(function () {});
        return installNow();
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
    exports.autoInstall = autoInstall;
    exports.repairInstall = repairInstall;
    exports.getEntryPlatformPath = getEntryPlatformPath;
    exports.getCachePlatformPath = getCachePlatformPath;
    exports.INTELEPHENSE_VERSION = INTELEPHENSE_VERSION;
    exports.PREF_PHP_CODE_INTELLIGENCE = PREF_PHP_CODE_INTELLIGENCE;
});
