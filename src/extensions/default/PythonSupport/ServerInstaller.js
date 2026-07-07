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
 * installs on demand: the user consents via the find-bar prompt / first-time dialog /
 * Problems-panel row, then the pinned wheels for this platform+arch are resolved through the
 * PyPI JSON API, downloaded, sha256-verified and extracted - all node-side
 * (NodeUtils.downloadFile/extractZipFile; a wheel is a plain zip). Download progress streams
 * into a status-bar task. Works identically on Windows, macOS and Linux.
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

    // Exact tested pins - never ranges. The wheels are sha256-verified against PyPI's manifest,
    // so what we tested is byte-for-byte what users get. Upgrades are a deliberate pin bump here.
    const PYREFLY_VERSION = "1.1.1";
    const RUFF_VERSION = "0.15.20";
    const PREF_PYTHON_CODE_INTELLIGENCE = "python.codeIntelligence";

    const PYREFLY_HOME_URL = "https://pyrefly.org";
    const RUFF_HOME_URL = "https://docs.astral.sh/ruff/";

    // The independently pinned/installed pieces. `pkg` is the PyPI package name; the binary of a
    // wheel build lives at <pkg>-<version>.data/scripts/<pkg>[.exe].
    const UNITS = {
        pyrefly: { pkg: "pyrefly", version: PYREFLY_VERSION },
        ruff: { pkg: "ruff", version: RUFF_VERSION }
    };

    // once-per-lifetime: the first time the install bar shows, a dialog is raised over it so the
    // offer cannot be missed. Never shown again (even on cancel) - the bar remains the
    // ongoing affordance.
    const STATE_INSTALL_DIALOG_SHOWN = "python.installDialogShown";

    let _onInstalled = null;        // main.js callback: ({binaryPath, upgraded}) => void
    let _inFlight = null;           // single-flight install promise
    // projects where the user clicked "Not Now" - the bar stops reappearing there for the
    // session. Until then it returns on every python file switch (closing on switch-away is not
    // a dismissal - only the explicit button is).
    const _promptDismissedForProject = new Set();
    let _promptBar = null;          // the ModalBar install prompt, when showing
    let _promptBarTip = null;       // the benefits tooltip binding on the bar's info icon
    let _panelRowDismissed = false; // Problems-panel row dismissed this session

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

    // Download + extract one unit's wheel, reporting progress in [pctFrom, pctTo] of `task`.
    async function _installUnit(unit, tag, task, pctFrom, pctTo) {
        const wheel = await _resolveWheel(unit, tag);
        // any older version's tree is dead weight (paths carry the version) - wipe it all
        await Phoenix.VFS.unlinkAsync(_installDirVfs(unit)).catch(function () {});
        const destDir = Phoenix.fs.getTauriPlatformPath(_installDirVfs(unit));
        const wheelFile = Phoenix.fs.getTauriPlatformPath(_installDirVfs(unit) + "download.whl");
        const downloadShare = (pctTo - pctFrom) * 0.85;   // extraction takes the rest
        await NodeUtils.downloadFile(wheel.url, wheelFile, {
            sha256: wheel.sha256,
            progress: function (transferred, total) {
                if (total > 0) {
                    task.setProgressPercent(Math.round(pctFrom + (transferred / total) * downloadShare));
                }
            }
        });
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
        hidePanelRow();
        // Status-bar task the user can track from anywhere; the downloads stream real progress.
        const task = TaskManager.addNewTask(Strings.PYTHON_INSTALL_TITLE, Strings.PYTHON_INSTALLING,
            "<i class='fa-brands fa-python'></i>", { progressPercent: 2 });
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
                await _installUnit(pending[i], tag, task, Math.round(5 + i * span),
                    Math.round(5 + (i + 1) * span));
            }
            task.setProgressPercent(100);
            task.setMessage(Strings.PYTHON_INSTALL_DONE);
            task.setSucceded(); // (sic - TaskManager's exported name)
            setTimeout(task.close, 4000);
            return { binaryPath: getBinaryPlatformPath(), upgraded: upgrading };
        } catch (err) {
            const message = (err && err.message) || String(err);
            task.setFailed();
            task.setMessage(StringUtils.format(Strings.PYTHON_INSTALL_FAILED, message));
            setTimeout(task.close, 10000);
            return null;
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

    // ----- consent UI: find-bar prompt + first-time dialog + Problems-panel row -------------------

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
            [Strings.PYTHON_BENEFIT_COMPLETIONS, Strings.PYTHON_BENEFIT_COMPLETIONS_SUB],
            [Strings.PYTHON_BENEFIT_DOCS, Strings.PYTHON_BENEFIT_DOCS_SUB],
            [Strings.PYTHON_BENEFIT_ERRORS, Strings.PYTHON_BENEFIT_ERRORS_SUB],
            [Strings.PYTHON_BENEFIT_NAV, Strings.PYTHON_BENEFIT_NAV_SUB],
            [Strings.PYTHON_BENEFIT_FORMAT, Strings.PYTHON_BENEFIT_FORMAT_SUB]
        ];
    }

    // Compact benefits card for the bar's (i) icon - term -> what it means, one line each.
    function _benefitsTipHtml() {
        const $tip = $("<div>");
        $("<div class='ph-tip-title'>").text(Strings.PYTHON_INSTALL_TITLE).appendTo($tip);
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
        $("<span>").text(Strings.PYTHON_INSTALL_DIALOG_TEXT).appendTo($text);
        $text.append("&nbsp;");
        $("<i class='fa-solid fa-circle-info lsp-install-dialog-info'>").appendTo($text);
        $("<p class='lsp-install-dialog-later'>").text(Strings.PYTHON_INSTALL_LATER_INFO).appendTo($body);
        // quiet colophon crediting (and linking) the tools this rides on
        const $credit = $("<p class='lsp-install-dialog-credit'>").appendTo($body);
        $("<span>").text(Strings.LSP_INSTALL_POWERED_BY + " ").appendTo($credit);
        $("<a href='#' data-href='" + PYREFLY_HOME_URL + "'>").text("Pyrefly").appendTo($credit);
        $credit.append(document.createTextNode(" · "));
        $("<a href='#' data-href='" + RUFF_HOME_URL + "'>").text("Ruff").appendTo($credit);
        const dialog = Dialogs.showModalDialog(DefaultDialogs.DIALOG_ID_INFO, Strings.PYTHON_INSTALL_DIALOG_TITLE,
            $body.html(), [
                {
                    className: Dialogs.DIALOG_BTN_CLASS_NORMAL,
                    id: Dialogs.DIALOG_BTN_CANCEL,
                    text: Strings.PYTHON_INSTALL_NOT_NOW
                },
                {
                    className: Dialogs.DIALOG_BTN_CLASS_PRIMARY,
                    id: Dialogs.DIALOG_BTN_OK,
                    text: Strings.PYTHON_INSTALL_ENABLE
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
        $size.append(document.createTextNode(" " + Strings.PYTHON_INSTALL_DIALOG_SIZE));
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
        $("<span class='lsp-install-bar-text'>").text(Strings.PYTHON_INSTALL_MESSAGE).appendTo($tpl);
        $("<i class='fa-solid fa-circle-info lsp-install-bar-info'>").appendTo($tpl);
        // credit where due - not license-required, just right
        $("<a class='lsp-install-bar-powered-by' href='#'>").text(Strings.PYTHON_POWERED_BY_PYREFLY)
            .appendTo($tpl);
        $("<button class='btn btn-mini lsp-install-bar-later'>")
            .text(Strings.PYTHON_INSTALL_NOT_NOW).appendTo($tpl);
        $("<button class='btn btn-mini primary lsp-install-bar-install'>")
            .text(Strings.PYTHON_INSTALL_ENABLE).appendTo($tpl);

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
            NativeApp.openURLInDefaultBrowser(PYREFLY_HOME_URL);
        });
    }

    function _ensurePanelRow() {
        const $panel = $("#problems-panel");
        if (!$panel.length) {
            return null;
        }
        let $row = $panel.find(".py-intel-panel-row");
        if ($row.length) {
            return $row;
        }
        // reuse the TS row's styling; the extra class scopes our own lookups
        $row = $("<div class='ts-code-intel-panel-row py-intel-panel-row'>").hide();
        $("<span class='ts-code-intel-panel-text'>").text(Strings.PYTHON_PANEL_TEXT).appendTo($row);
        $("<button class='btn btn-mini primary ts-code-intel-panel-enable'>")
            .text(Strings.PYTHON_INSTALL_ENABLE)
            .on("click", function () {
                installNow();
            })
            .appendTo($row);
        $("<a class='ts-code-intel-panel-close'>")
            .attr("title", Strings.PYTHON_INSTALL_NOT_NOW).html("&times;")
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
        const $row = $("#problems-panel .py-intel-panel-row");
        if ($row.length) {
            $row.hide();
        }
    }

    /**
     * Show/hide the Problems-panel install row for the current state. Call on active-editor and
     * project changes with whether a Python DOCUMENT is active.
     * @param {boolean} pythonDocumentActive
     */
    function updatePanelRow(pythonDocumentActive) {
        if (typeof Phoenix !== "undefined" && Phoenix.isTestWindow) {
            return;
        }
        const $row = _ensurePanelRow();
        if (!$row) {
            return;
        }
        if (!pythonDocumentActive) {
            _closePromptBar();  // the bar belongs to the python file that triggered it
        }
        if (!pythonDocumentActive || _panelRowDismissed || _inFlight ||
                PreferencesManager.get(PREF_PYTHON_CODE_INTELLIGENCE) === false) {
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
     * Offer the install to the user: the find-bar prompt (plus a once-ever dialog over it) + the
     * persistent Problems-panel row. Call when a Python document is active but the server is not
     * installed.
     * @param {boolean} pythonDocumentActive
     */
    function offerInstallUI(pythonDocumentActive) {
        if (typeof Phoenix !== "undefined" && Phoenix.isTestWindow) {
            return;
        }
        if (pythonDocumentActive) {
            _showPromptBar();
            _maybeShowFirstTimeDialog();
        }
        updatePanelRow(pythonDocumentActive);
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
    exports.offerInstallUI = offerInstallUI;
    exports.updatePanelRow = updatePanelRow;
    exports.hidePanelRow = hidePanelRow;
    exports.getBinaryPlatformPath = getBinaryPlatformPath;
    exports.getRuffBinaryPlatformPath = getRuffBinaryPlatformPath;
    exports.PYREFLY_VERSION = PYREFLY_VERSION;
    exports.RUFF_VERSION = RUFF_VERSION;
    exports.PREF_PYTHON_CODE_INTELLIGENCE = PREF_PYTHON_CODE_INTELLIGENCE;
});
