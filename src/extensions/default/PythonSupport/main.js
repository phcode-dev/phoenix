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
 * PythonSupport - Python code intelligence via the Pyrefly language server (MIT, by Meta):
 * completion with docs, hover, signature help, jump-to-definition, find references, type-error
 * diagnostics and quick fixes, all through the shared LSP framework. Desktop only.
 *
 * The server is a single ~13MB Rust binary too large to bundle for one language - see
 * ServerInstaller for the automatic on-demand PyPI wheel download flow (announced through the
 * status-bar task; the master pref is the opt-out).
 *
 * @module extensions/default/PythonSupport/main
 */
define(function (require, exports, module) {


    const AppInit = brackets.getModule("utils/AppInit"),
        ProjectManager = brackets.getModule("project/ProjectManager"),
        EditorManager = brackets.getModule("editor/EditorManager"),
        PreferencesManager = brackets.getModule("preferences/PreferencesManager"),
        NodeConnector = brackets.getModule("NodeConnector"),
        Strings = brackets.getModule("strings"),
        ServerInstaller = require("./ServerInstaller"),
        Beautifier = require("./Beautifier");

    const SERVER_ID = "python";
    const SUPPORTED_LANGUAGES = ["python"];

    // Master switch - the durable opt-out of the automatic install; setting it back to true
    // re-triggers the auto-install on the open python file.
    PreferencesManager.definePreference(ServerInstaller.PREF_PYTHON_CODE_INTELLIGENCE, "boolean", true, {
        description: Strings.DESCRIPTION_PYTHON_CODE_INTELLIGENCE
    });

    let lspClientPromise = null;
    let registered = false;
    let starting = false;
    let pendingRepoint = false;
    let initErrorReported = false;
    let _repairAttempted = false;   // one self-repair (wipe + reinstall) per session
    let _client = null;

    function canRun() {
        return Phoenix.isNativeApp && NodeConnector.isNodeAvailable();
    }

    function loadLSPClient() {
        if (!lspClientPromise) {
            lspClientPromise = new Promise(function (resolve, reject) {
                brackets.getModule(["languageTools/LSPClient"], resolve, function () {
                    setTimeout(function () {
                        brackets.getModule(["languageTools/LSPClient"], resolve, reject);
                    }, 500);
                });
            });
        }
        return lspClientPromise;
    }

    function waitForNodeReady(timeout) {
        return new Promise(function (resolve) {
            const deadline = Date.now() + timeout;
            (function check() {
                if (NodeConnector.isNodeReady()) {
                    resolve(true);
                } else if (Date.now() > deadline) {
                    resolve(false);
                } else {
                    setTimeout(check, 300);
                }
            }());
        });
    }

    async function _registerServer(binaryPath) {
        if (registered) {
            return;
        }
        const LSPClient = await loadLSPClient();
        const client = await LSPClient.registerLanguageServer({
            serverId: SERVER_ID,
            command: binaryPath,                // absolute native binary, spawned as-is
            args: ["lsp"],
            languages: SUPPORTED_LANGUAGES,
            languageIdMap: { python: "python" },
            initializationOptions: {},
            // pyrefly pulls the "python" section and treats a null answer as everything-off;
            // "default" mode gives full type diagnostics. A project's own pyrefly.toml /
            // pyproject.toml stays authoritative over this.
            workspaceConfiguration: {
                python: { pyrefly: { typeCheckingMode: "default" } }
            },
            // pyrefly narrates every request on stderr at INFO level - keep that out of the console
            suppressStderrPattern: "^\\s*INFO\\b"
        });
        if (client) {
            registered = true;
            _client = client;
        }
    }

    async function start() {
        if (registered || !canRun()) {
            return;
        }
        const ready = await waitForNodeReady(30000);
        if (!ready) {
            console.error("[PythonSupport] Node not ready - Python LSP disabled");
            return;
        }
        const state = await ServerInstaller.installedState();
        if (!state.installed || !state.pinMatches) {
            // acquire (or complete/upgrade) the tooling automatically - announced only through
            // the status-bar task. autoInstall's guards (pref off, user cancelled this session,
            // offline, test window) decide whether anything actually runs; its onInstalled
            // callback registers the server.
            await ServerInstaller.autoInstall();
            return;
        }
        await _registerServer(ServerInstaller.getBinaryPlatformPath());
        if (!registered && !_repairAttempted && !Phoenix.isTestWindow) {
            // Self-repair: the marker said installed but the server would not start (binary
            // corrupt beyond the existence checks). Wipe and reacquire once per session - the
            // onInstalled callback re-registers on success. A second failure surfaces through
            // the installer's normal failure UX.
            _repairAttempted = true;
            console.error("[PythonSupport] installed server failed to start - reinstalling");
            await ServerInstaller.repairInstall();
        }
    }

    /**
     * True when the active editor's DOCUMENT is Python.
     * @return {boolean}
     */
    function _isPythonDocumentActive() {
        const editor = EditorManager.getActiveEditor();
        if (!editor || !editor.document) {
            return false;
        }
        return editor.document.getLanguage().getId() === "python";
    }

    function _ensureServerForActiveEditor() {
        if (!canRun() || !_isPythonDocumentActive()) {
            return;
        }
        if (PreferencesManager.get(ServerInstaller.PREF_PYTHON_CODE_INTELLIGENCE) === false) {
            return;
        }
        if (!registered) {
            if (starting) {
                return;
            }
            starting = true;
            pendingRepoint = false;
            start().catch(function (err) {
                if (!initErrorReported) {
                    initErrorReported = true;
                    window.logger && window.logger.reportError(err, "[PythonSupport] Python LSP init failed");
                }
            }).finally(function () {
                starting = false;
            });
            return;
        }
        if (pendingRepoint) {
            pendingRepoint = false;
            loadLSPClient().then(function (LSPClient) {
                LSPClient.changeWorkspaceRoot(SERVER_ID);
            });
        }
    }

    // Pre-warm the framework module (not the server) as soon as the extension loads.
    if (canRun()) {
        loadLSPClient();
    }

    AppInit.appReady(function () {
        if (!canRun()) {
            return;
        }

        ServerInstaller.init({
            onInstalled: function (result) {
                _registerServer(result.binaryPath).catch(function (err) {
                    window.logger && window.logger.reportError(err, "[PythonSupport] start after install failed");
                });
            }
        });
        // Beautify-command formatting via a standalone ruff call (not part of the LSP wiring)
        Beautifier.init();

        EditorManager.on("activeEditorChange.pythonSupport", function () {
            _ensureServerForActiveEditor();
        });
        _ensureServerForActiveEditor();

        ProjectManager.on(ProjectManager.EVENT_PROJECT_OPEN + ".pythonSupport", function () {
            pendingRepoint = true;
            _ensureServerForActiveEditor();
        });

        // Master switch flipped back on (e.g. after an earlier opt-out): auto-install again on
        // the currently open python file.
        PreferencesManager.on("change", ServerInstaller.PREF_PYTHON_CODE_INTELLIGENCE, function () {
            if (PreferencesManager.get(ServerInstaller.PREF_PYTHON_CODE_INTELLIGENCE) !== false) {
                _ensureServerForActiveEditor();
            }
        });
    });

    // for tests
    exports._ensureServerForActiveEditor = _ensureServerForActiveEditor;
    exports._getClient = function () {
        return _client;
    };
    exports.SERVER_ID = SERVER_ID;
});
