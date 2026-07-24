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
 * ServerInstaller - on-demand acquisition of the Python tooling: the Pyrefly language server
 * (MIT, by Meta) and the Ruff formatter (MIT, by Astral). Both are single self-contained Rust
 * binaries distributed as per-platform wheels on PyPI - neither is on npm and neither needs a
 * Python runtime. Ruff is used ONLY by the Beautify command (a standalone `ruff format` call,
 * see Beautifier.js); it is NOT wired into the LSP framework.
 *
 * A ~25MB combined download is too big to bundle for one language, so like PHP/Intelephense it
 * installs on demand - AUTOMATICALLY, on the first python file opened (autoInstall): the pinned
 * wheels for this platform+arch are resolved through the PyPI JSON API, downloaded,
 * sha256-verified and extracted - all node-side (NodeUtils.downloadFile/extractZipFile; a wheel
 * is a plain zip). The install is announced only through the status-bar task, whose popup is
 * opened so the download is always visible, with a stop (x) icon to cancel it (cancel = no
 * retry until the next app launch; the master pref is the durable opt-out). Offline is a
 * non-event: install silently waits for connectivity. Real failures roll back the partial
 * install, turn the task red (with a retry icon) and raise a toast. Works identically on
 * Windows, macOS and Linux.
 *
 * Layout under <appSupport>/lspServers/:
 *   pyrefly/installed.json                                  (version marker, written on success)
 *   pyrefly/pyrefly-<version>.data/scripts/pyrefly[.exe]    (the language server binary)
 *   ruff/installed.json
 *   ruff/ruff-<version>.data/scripts/ruff[.exe]             (the formatter binary)
 *
 * Version upgrades: bumping a pin makes the next start detect the marker mismatch and reinstall
 * just the out-of-date unit silently (consent already given). The pins are exact and downloads
 * sha256-verified against PyPI, so installs are deterministic. The same mechanism transparently
 * completes older installs when a new unit is added (e.g. ruff arriving after pyrefly).
 *
 * @module extensions/default/PythonSupport/ServerInstaller
 */
define(function (require, exports, module) {


    const NodeUtils = brackets.getModule("utils/NodeUtils"),
        NotificationUI = brackets.getModule("widgets/NotificationUI"),
        TaskManager = brackets.getModule("features/TaskManager"),
        PreferencesManager = brackets.getModule("preferences/PreferencesManager"),
        Metrics = brackets.getModule("utils/Metrics"),
        StringUtils = brackets.getModule("utils/StringUtils"),
        Strings = brackets.getModule("strings");

    // Exact tested pins - never ranges. The wheels are sha256-verified against PyPI's manifest,
    // so what we tested is byte-for-byte what users get. The authoritative values live in
    // src/config.json (config.lsp_server_pins) so the scheduled update-lsp-pins workflow can bump
    // them per release; the literals here are only a fallback for exotic boot states.
    const _PINS = (brackets.config && brackets.config.lsp_server_pins) || {};
    if (!_PINS.pyrefly || !_PINS.ruff) {
        // appConfig.js is generated from src/config.json by the build - a missing pins block
        // means a stale/broken build; scream so a developer can't miss it. The literal
        // fallbacks below keep things limping along.
        window.alert("[PythonSupport] lsp_server_pins missing from AppConfig - " +
            "stale build? Run npm run build.");
    }
    const PYREFLY_VERSION = _PINS.pyrefly || "1.1.1";
    const RUFF_VERSION = _PINS.ruff || "0.15.20";
    const PREF_PYTHON_CODE_INTELLIGENCE = "python.codeIntelligence";

    // The independently pinned/installed pieces. `pkg` is the PyPI package name; the binary of a
    // wheel build lives at <pkg>-<version>.data/scripts/<pkg>[.exe].
    const UNITS = {
        pyrefly: { pkg: "pyrefly", version: PYREFLY_VERSION },
        ruff: { pkg: "ruff", version: RUFF_VERSION }
    };

    let _onInstalled = null;        // main.js callback: ({binaryPath, upgraded}) => void
    let _inFlight = null;           // single-flight install promise
    let _cancelledThisSession = false;  // user hit the task's stop icon - no retry until relaunch
    let _cancelRequested = false;   // stop clicked while an install is in flight
    let _activeDownload = null;     // cancellable handle of the in-flight NodeUtils.downloadFile
    let _onlineRetryArmed = false;  // one-shot window "online" retry listener armed

    function _installDirVfs(unit) {
        return Phoenix.VFS.getAppSupportDir() + "lspServers/" + unit.pkg + "/";
    }

    // wheel-relative path of the unit's binary (/-separated)
    function _binaryRelPath(unit) {
        const exe = brackets.platform === "win" ? ".exe" : "";
        return unit.pkg + "-" + unit.version + ".data/scripts/" + unit.pkg + exe;
    }

    function _binaryVfs(unit) {
        return _installDirVfs(unit) + _binaryRelPath(unit);
    }

    function _markerVfs(unit) {
        return _installDirVfs(unit) + "installed.json";
    }

    function _binaryPlatformPath(unit) {
        return Phoenix.fs.getTauriPlatformPath(_binaryVfs(unit));
    }

    /**
     * The platform (real disk) path of the Pyrefly language server binary, for spawning.
     * @return {string}
     */
    function getBinaryPlatformPath() {
        return _binaryPlatformPath(UNITS.pyrefly);
    }

    /**
     * The platform (real disk) path of the Ruff binary - used only by the Beautify command.
     * @return {string}
     */
    function getRuffBinaryPlatformPath() {
        return _binaryPlatformPath(UNITS.ruff);
    }

    async function _unitState(unit) {
        const binExists = await Phoenix.VFS.existsAsync(_binaryVfs(unit));
        if (binExists) {
            try {
                const marker = JSON.parse(await Phoenix.VFS.readFileAsync(_markerVfs(unit), "utf8"));
                return { installed: true, pinMatches: marker.version === unit.version };
            } catch (e) {
                return { installed: true, pinMatches: false };
            }
        }
        // binary of the CURRENT pin absent, but a marker means an older version is installed
        // (its binary path carries its version) - report installed so the upgrade is silent.
        const markerExists = await Phoenix.VFS.existsAsync(_markerVfs(unit));
        return { installed: markerExists, pinMatches: false };
    }

    /**
     * Combined install state. `installed` keys off pyrefly (its presence is the consent signal);
     * anything less than every unit present at its exact pin reports pinMatches false, which the
     * caller treats as "complete/upgrade silently" - that is also how a ruff-less older install
     * transparently gains ruff.
     * @return {Promise<{installed: boolean, pinMatches: boolean}>}
     */
    async function installedState() {
        const pyrefly = await _unitState(UNITS.pyrefly);
        const ruff = await _unitState(UNITS.ruff);
        return {
            installed: pyrefly.installed,
            pinMatches: pyrefly.pinMatches && ruff.installed && ruff.pinMatches
        };
    }

    // ----- install mechanics ----------------------------------------------------------------------

    /**
     * The PyPI wheel tag for this machine. Phoenix desktop ships win/mac/linux on
     * x64 + arm64 - anything else has no wheel we can pick safely.
     * @return {Promise<string>}
     */
    async function _wheelTag() {
        const platform = brackets.platform;
        const arch = String(await Phoenix.app.getPlatformArch() || "").toLowerCase();
        const isX64 = arch === "x86_64" || arch === "x64" || arch === "amd64";
        const isArm64 = arch === "aarch64" || arch === "arm64";
        if (platform === "win") {
            if (isX64) {
                return "win_amd64";
            }
            if (isArm64) {
                return "win_arm64";
            }
        } else if (platform === "mac") {
            if (isArm64) {
                return "macosx_11_0_arm64";
            }
            if (isX64) {
                return "macosx_10_12_x86_64";
            }
        } else if (platform === "linux") {
            if (isX64) {
                return "manylinux_2_17_x86_64.manylinux2014_x86_64";
            }
            if (isArm64) {
                return "manylinux_2_17_aarch64.manylinux2014_aarch64";
            }
        }
        throw new Error("no " + Object.keys(UNITS).join("/") + " build for " + platform + "/" + arch);
    }

    /**
     * Resolve a unit's pinned wheel download URL and sha256 from the PyPI JSON API (CORS-open).
     * @return {Promise<{url: string, sha256: string}>}
     */
    async function _resolveWheel(unit, tag) {
        const metaUrl = "https://pypi.org/pypi/" + unit.pkg + "/" + unit.version + "/json";
        const response = await fetch(metaUrl);
        if (!response.ok) {
            throw new Error("PyPI metadata fetch failed with HTTP " + response.status);
        }
        const meta = await response.json();
        const wheel = (meta.urls || []).find(function (u) {
            return u.filename && u.filename.endsWith(".whl") && u.filename.indexOf(tag) !== -1;
        });
        if (!wheel) {
            throw new Error("no " + unit.pkg + " " + unit.version + " wheel for " + tag);
        }
        return { url: wheel.url, sha256: wheel.digests && wheel.digests.sha256 };
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

    // Real-failure surface (per product decision): a subtle toast in addition to the red task,
    // so the user learns setup failed even with the Tasks popup closed.
    function _showFailureToast(message) {
        const $tpl = $("<div>").text(message);
        NotificationUI.createToastFromTemplate(Strings.PYTHON_INSTALL_TITLE, $tpl, {
            dismissOnClick: true,
            toastStyle: NotificationUI.NOTIFICATION_STYLES_CSS_CLASS.SUBTLE,
            autoCloseTimeS: 30,
            instantOpen: true
        });
    }

    // Download + extract one unit's wheel, reporting progress in [pctFrom, pctTo] of `task`.
    async function _installUnit(unit, tag, task, pctFrom, pctTo) {
        const wheel = await _resolveWheel(unit, tag);
        if (_cancelRequested) {
            const cancelErr = new Error("install cancelled");
            cancelErr.cancelled = true;
            throw cancelErr;
        }
        // any older version's tree is dead weight (paths carry the version) - wipe it all
        await Phoenix.VFS.unlinkAsync(_installDirVfs(unit)).catch(function () {});
        const destDir = Phoenix.fs.getTauriPlatformPath(_installDirVfs(unit));
        const wheelFile = Phoenix.fs.getTauriPlatformPath(_installDirVfs(unit) + "download.whl");
        const downloadShare = (pctTo - pctFrom) * 0.85;   // extraction takes the rest
        _activeDownload = NodeUtils.downloadFile(wheel.url, wheelFile, {
            sha256: wheel.sha256,
            progress: function (transferred, total) {
                if (total > 0) {
                    task.setProgressPercent(Math.round(pctFrom + (transferred / total) * downloadShare));
                }
            }
        });
        try {
            await _activeDownload;
        } finally {
            _activeDownload = null;
        }
        // a wheel is a plain zip; extraction restores the archive's unix exec bits, and the
        // explicit chmod below covers archives that lost them
        await NodeUtils.extractZipFile(wheelFile, destDir);
        await NodeUtils.setExecutableBits(_binaryPlatformPath(unit));
        await Phoenix.VFS.unlinkAsync(_installDirVfs(unit) + "download.whl").catch(function () {});
        const ok = await Phoenix.VFS.existsAsync(_binaryVfs(unit));
        if (!ok) {
            throw new Error(unit.pkg + " binary missing after wheel extraction");
        }
        await Phoenix.VFS.writeFileAsync(_markerVfs(unit),
            JSON.stringify({ version: unit.version }, null, 4), "utf8");
        task.setProgressPercent(pctTo);
    }

    async function _doInstall() {
        const state = await installedState();
        if (state.installed && state.pinMatches) {
            return { binaryPath: getBinaryPlatformPath(), upgraded: false };
        }
        const upgrading = state.installed;
        _cancelRequested = false;
        let currentUnit = null;     // the unit being installed, for rollback on failure/cancel
        // Status-bar task with real download progress. Its popup is OPENED for every install -
        // with no consent dialog anymore, visibility is the transparency: the user must be able
        // to see any download we start. The stop icon cancels it.
        const task = TaskManager.addNewTask(Strings.PYTHON_INSTALL_TITLE, Strings.PYTHON_INSTALLING,
            "<i class='fa-brands fa-python'></i>", {
                progressPercent: 2,
                onStopClick: function () {
                    _cancelledThisSession = true;   // no auto-retry until the next app launch
                    _cancelRequested = true;
                    if (_activeDownload) {
                        _activeDownload.cancel().catch(function () {});
                    }
                },
                onRetryClick: function () {
                    task.close();
                    installNow();
                }
            });
        task.showStopIcon(Strings.PYTHON_INSTALL_STOP);
        task.show();
        try {
            const tag = await _wheelTag();
            // only the units that are missing or off-pin - a version bump of one tool does not
            // re-download the other
            const pending = [];
            for (const key of Object.keys(UNITS)) {
                const unitState = await _unitState(UNITS[key]);
                if (!(unitState.installed && unitState.pinMatches)) {
                    pending.push(UNITS[key]);
                }
            }
            task.setProgressPercent(5);
            const span = 90 / (pending.length || 1);
            for (let i = 0; i < pending.length; i++) {
                currentUnit = pending[i];
                await _installUnit(pending[i], tag, task, Math.round(5 + i * span),
                    Math.round(5 + (i + 1) * span));
            }
            currentUnit = null;
            task.setProgressPercent(100);
            task.setMessage(Strings.PYTHON_INSTALL_DONE);
            task.setSucceded(); // (sic - TaskManager's exported name)
            setTimeout(task.close, 4000);
            Metrics.countEvent("lsp", "pyInst", upgrading ? "upOk" : "ok");
            return { binaryPath: getBinaryPlatformPath(), upgraded: upgrading };
        } catch (err) {
            const message = (err && err.message) || String(err);
            // rollback: a half-installed unit must not survive - installedState would otherwise
            // misread it. Fully-installed units (marker written) are untouched.
            if (currentUnit) {
                await Phoenix.VFS.unlinkAsync(_installDirVfs(currentUnit)).catch(function () {});
            }
            const cancelled = _cancelRequested || (err && err.cancelled) || /cancelled/i.test(message);
            if (cancelled) {
                // user's own decision - no red state, no toast
                Metrics.countEvent("lsp", "pyInst", "cancel");
                task.close();
                return null;
            }
            if (_isNetworkError(err) || !navigator.onLine) {
                // QUIET path: offline is normal life, not an error. Retry when connectivity
                // returns (same session) or on the next launch.
                Metrics.countEvent("lsp", "pyInst", "waitNet");
                task.setMessage(Strings.PYTHON_INSTALL_WAITING_NETWORK);
                setTimeout(task.close, 4000);
                _armOnlineRetry();
                return null;
            }
            console.error("[PythonSupport] install failed", err);
            Metrics.countEvent("lsp", "pyInst", "fail");
            window.logger && window.logger.reportError(err, "[PythonSupport] LSP install failed");
            task.setFailed();
            task.setMessage(StringUtils.format(Strings.PYTHON_INSTALL_FAILED, message));
            task.showRestartIcon();
            task.show();
            _showFailureToast(StringUtils.format(Strings.PYTHON_INSTALL_FAILED, message));
            setTimeout(task.close, 30000);
            return null;
        } finally {
            _activeDownload = null;
        }
    }

    /**
     * Install (or upgrade) now - single-flighted. On success, notifies the onInstalled callback so
     * the language server can start immediately.
     * @return {Promise<?{binaryPath: string, upgraded: boolean}>} null on failure
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
     *  - never in test windows (suites call installNow() explicitly; opening a .py fixture must
     *    not start surprise downloads),
     *  - master pref false = durable opt-out,
     *  - user cancelled this session = wait for the next launch,
     *  - offline = wait silently for connectivity (one-shot window "online" retry).
     * @return {Promise<?{binaryPath: string, upgraded: boolean}>} null when skipped/failed
     */
    function autoInstall() {
        if (typeof Phoenix !== "undefined" && Phoenix.isTestWindow) {
            return Promise.resolve(null);
        }
        if (_cancelledThisSession ||
                PreferencesManager.get(PREF_PYTHON_CODE_INTELLIGENCE) === false) {
            return Promise.resolve(null);
        }
        if (!navigator.onLine) {
            _armOnlineRetry();
            return Promise.resolve(null);
        }
        return installNow();
    }

    /**
     * Wipe the whole install and reacquire it - self-repair for a supposedly-installed server
     * that fails to start (binary corrupt beyond the existence checks). The onInstalled callback
     * re-registers the server on success.
     * @return {Promise<?{binaryPath: string, upgraded: boolean}>} null on failure
     */
    async function repairInstall() {
        for (const key of Object.keys(UNITS)) {
            await Phoenix.VFS.unlinkAsync(_installDirVfs(UNITS[key])).catch(function () {});
        }
        return installNow();
    }

    /**
     * @param {{onInstalled: function({binaryPath: string, upgraded: boolean})}} options
     */
    function init(options) {
        _onInstalled = (options && options.onInstalled) || null;
    }

    exports.init = init;
    exports.installedState = installedState;
    exports.installNow = installNow;
    exports.autoInstall = autoInstall;
    exports.repairInstall = repairInstall;
    exports.getBinaryPlatformPath = getBinaryPlatformPath;
    exports.getRuffBinaryPlatformPath = getRuffBinaryPlatformPath;
    exports.PYREFLY_VERSION = PYREFLY_VERSION;
    exports.RUFF_VERSION = RUFF_VERSION;
    exports.PREF_PYTHON_CODE_INTELLIGENCE = PREF_PYTHON_CODE_INTELLIGENCE;
});
