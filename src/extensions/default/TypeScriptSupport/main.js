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
 * TypeScript / JavaScript language support via the bundled `vtsls` language server.
 *
 * This extension is intentionally thin: all the heavy lifting lives in the shared
 * `languageTools/LSPClient` module, which it loads lazily (only on desktop, only once Node is
 * ready) so it never slows down boot. It just declares which languages map to which server and
 * what initialization options vtsls needs.
 */
/*global path*/
define(function (require, exports, module) {


    const AppInit = brackets.getModule("utils/AppInit"),
        ProjectManager = brackets.getModule("project/ProjectManager"),
        DocumentManager = brackets.getModule("document/DocumentManager"),
        EditorManager = brackets.getModule("editor/EditorManager"),
        FileSystem = brackets.getModule("filesystem/FileSystem"),
        NodeConnector = brackets.getModule("NodeConnector"),
        CodeIntelligence = require("./CodeIntelligence");

    const SERVER_ID = "typescript";
    const SUPPORTED_LANGUAGES = ["javascript", "typescript", "jsx", "tsx"];

    // Phoenix language id -> LSP languageId
    const LANGUAGE_ID_MAP = {
        javascript: "javascript",
        typescript: "typescript",
        jsx: "javascriptreact",
        tsx: "typescriptreact"
    };

    // vtsls-specific initialization options (mirrors the configuration Zed/VS Code use).
    const INITIALIZATION_OPTIONS = {
        vtsls: {
            experimental: {
                completion: {
                    enableServerSideFuzzyMatch: true,
                    entriesLimit: 5000
                }
            },
            autoUseWorkspaceTsdk: true
        }
    };

    // --- "implicit any" diagnostics gating for plain JavaScript -----------------------------------
    //
    // tsserver runs its language service over JS too, and emits the "noImplicitAny" family of
    // diagnostics - including 7016 "Could not find a declaration file for module ... implicitly has
    // an 'any' type. Try `npm i --save-dev @types/...`". For a pure-JS developer who never opted
    // into type-checking, these are noise, so we suppress them for javascript/jsx UNLESS the project
    // opts into type-checking via `checkJs` (tsconfig/jsconfig) or a per-file `// @ts-check`. This
    // mirrors how VS Code only surfaces JS type diagnostics once you opt in. Real errors/warnings,
    // unused-symbol/deprecation hints, and all type *intelligence* (hover/completion) are untouched.
    const IMPLICIT_ANY_CODES = new Set([
        7005, 7006, 7008, 7009, 7010, 7011, 7015, 7016, 7017, 7018, 7019,
        7022, 7023, 7024, 7025, 7026, 7031, 7033, 7034
    ]);
    const SUPPRESS_LANGUAGES = ["javascript", "jsx"];
    const TS_CONFIG_FILES = ["tsconfig.json", "jsconfig.json"];

    // Whether the current project opts into type-checking its JS (compilerOptions.checkJs).
    let projectChecksJs = false;

    /**
     * Strip JSONC comments and trailing commas so tsconfig/jsconfig can be JSON.parse'd. Good enough
     * for reading a flag (does not handle `//` inside string values - rare in these configs).
     * @param {string} str
     * @return {string}
     */
    function _stripJsonComments(str) {
        str = str || "";
        str = str.replace(/\/\*(?:(?!\*\/)[\s\S])*\*\//g, "");  // block comments
        str = str.replace(/\/\/[^\n\r]*/g, "");                 // line comments
        str = str.replace(/,(\s*[}\]])/g, "$1");                // trailing commas
        return str;
    }

    /**
     * Read tsconfig.json/jsconfig.json at the project root and resolve whether compilerOptions.checkJs
     * is enabled. Does not follow `extends` (a project that only inherits checkJs from a base config
     * is rare; can be added later). Mirrors the simple root-config reads ESLint/JSHint do.
     * @return {Promise<boolean>}
     */
    function _detectProjectCheckJs() {
        const root = ProjectManager.getProjectRoot();
        if (!root) {
            return Promise.resolve(false);
        }
        const rootPath = root.fullPath;
        return Promise.all(TS_CONFIG_FILES.map(function (name) {
            return new Promise(function (resolve) {
                FileSystem.getFileForPath(path.join(rootPath, name)).read(function (err, content) {
                    if (err || !content) {
                        resolve(false);
                        return;
                    }
                    try {
                        const cfg = JSON.parse(_stripJsonComments(content));
                        resolve(!!(cfg && cfg.compilerOptions && cfg.compilerOptions.checkJs));
                    } catch (e) {
                        resolve(false);
                    }
                });
            });
        })).then(function (results) {
            return results.indexOf(true) !== -1;
        });
    }

    function _refreshCheckJs() {
        const scanningRoot = ProjectManager.getProjectRoot() && ProjectManager.getProjectRoot().fullPath;
        _detectProjectCheckJs().then(function (checks) {
            // Ignore a stale result if the project switched while we were reading.
            const nowRoot = ProjectManager.getProjectRoot() && ProjectManager.getProjectRoot().fullPath;
            if (scanningRoot === nowRoot) {
                projectChecksJs = checks;
            }
        });
    }

    /**
     * True if an open JS file opts into type-checking with a leading `// @ts-check` (and not
     * `// @ts-nocheck`). Only checks already-open documents - diagnostics are virtually always for
     * the file being edited.
     * @param {string} filePath
     * @return {boolean}
     */
    function _fileHasTsCheck(filePath) {
        const doc = DocumentManager.getOpenDocumentForPath(filePath);
        if (!doc) {
            return false;
        }
        const head = doc.getText().slice(0, 1000);
        if (/@ts-nocheck\b/.test(head)) {
            return false;
        }
        return /@ts-check\b/.test(head);
    }

    /**
     * Drop "implicit any" diagnostics for plain JS/JSX files that haven't opted into type-checking.
     * @param {Array<Object>} diagnostics - raw LSP diagnostics
     * @param {{languageId:string, filePath:string}} ctx
     * @return {Array<Object>}
     */
    function filterDiagnostics(diagnostics, ctx) {
        if (SUPPRESS_LANGUAGES.indexOf(ctx.languageId) === -1) {
            return diagnostics; // typescript/tsx (or anything else) - never filtered
        }
        if (projectChecksJs || _fileHasTsCheck(ctx.filePath)) {
            return diagnostics; // opted into typed JS - keep everything
        }
        return diagnostics.filter(function (d) {
            const code = (typeof d.code === "string") ? parseInt(d.code, 10) : d.code;
            return !IMPLICIT_ANY_CODES.has(code);
        });
    }

    let registered = false;
    let lspClientPromise = null;

    /**
     * Asynchronously load the shared LSP framework on demand (keeps boot fast - these modules
     * are not part of the boot dependency graph). Memoized; retries once to ride out any
     * module-load race during startup.
     * @return {Promise<Object>} the languageTools/LSPClient module
     */
    function loadLSPClient() {
        if (!lspClientPromise) {
            lspClientPromise = new Promise(function (resolve, reject) {
                brackets.getModule(["languageTools/LSPClient"], resolve, function () {
                    // Retry once - clear the require error state and try again on next tick.
                    setTimeout(function () {
                        brackets.getModule(["languageTools/LSPClient"], resolve, reject);
                    }, 500);
                });
            });
        }
        return lspClientPromise;
    }

    /**
     * LSP only runs in the desktop app where the Node engine is available.
     * @return {boolean}
     */
    function canRun() {
        return Phoenix.isNativeApp && NodeConnector.isNodeAvailable();
    }

    /**
     * Resolve once the Node engine is ready (it is started lazily after boot).
     * @param {number} timeout - max time to wait in ms
     * @return {Promise<boolean>}
     */
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

    async function start() {
        if (registered || !canRun()) {
            return;
        }
        const ready = await waitForNodeReady(30000);
        if (!ready) {
            console.error("[TypeScriptSupport] Node not ready - LSP disabled");
            return;
        }
        // Lazy-load the LSP framework only when we actually need it.
        const LSPClient = await loadLSPClient();
        const client = await LSPClient.registerLanguageServer({
            serverId: SERVER_ID,
            command: "vtsls",
            args: ["--stdio"],
            languages: SUPPORTED_LANGUAGES,
            languageIdMap: LANGUAGE_ID_MAP,
            initializationOptions: INITIALIZATION_OPTIONS,
            filterDiagnostics: filterDiagnostics
        });
        if (client) {
            registered = true;
        }
    }

    // Begin loading the LSP framework as soon as the (desktop-only) extension loads - the reliable
    // moment for module loading - so it is ready by the time we first need it. This only loads the
    // module; it does not spawn the server (that happens lazily, on the first served-language file).
    if (canRun()) {
        loadLSPClient();
    }

    /**
     * True when the active editor holds a language this server handles (JS/TS/JSX/TSX).
     * @return {boolean}
     */
    function _isServedLanguageActive() {
        const editor = EditorManager.getActiveEditor();
        return !!(editor && SUPPORTED_LANGUAGES.indexOf(editor.getLanguageForSelection().getId()) !== -1);
    }

    let starting = false;
    let pendingRepoint = false;     // a project switch happened; repoint once a served file is active there
    let initErrorReported = false;  // start() is retried lazily, so report a failure to telemetry only once

    /**
     * Lazily start the language server when a served-language file is active, and - only right after a
     * project switch - repoint the running server at the new root. Mirrors VS Code's onLanguage model:
     * a project with no JS/TS file opened never spawns vtsls; switching to a non-JS project leaves the
     * idle server where it was; and plain file switches within a project never touch the
     * workspace-folder / restart machinery (so they can't interfere with a crash auto-restart).
     */
    function _ensureServerForActiveEditor() {
        if (!canRun() || !_isServedLanguageActive()) {
            return;
        }

        // Not running yet: lazily start it (a fresh start already points at the current project root).
        if (!registered) {
            if (starting) {
                return; // a start kicked off by a previous activeEditorChange is still in flight
            }
            starting = true;
            pendingRepoint = false;
            start().catch(function (err) {
                if (!initErrorReported) {
                    initErrorReported = true;
                    window.logger && window.logger.reportError(err, "[TypeScriptSupport] LSP init failed");
                }
            }).finally(function () {
                starting = false;
            });
            return;
        }

        // Running: repoint at the current project, but only when a project switch armed it - never on
        // ordinary file switches.
        if (pendingRepoint) {
            pendingRepoint = false;
            loadLSPClient().then(function (LSPClient) {
                LSPClient.changeWorkspaceRoot(SERVER_ID);
            });
        }
    }

    AppInit.appReady(function () {
        if (!canRun()) {
            return;
        }
        _refreshCheckJs();

        // Offer project-wide code intelligence (creates a default ts/jsconfig) when a JS/TS file is
        // opened in a project that has no config yet. Projects that already carry one are silent.
        CodeIntelligence.init({
            supportedLanguages: SUPPORTED_LANGUAGES,
            restartServer: function () {
                if (registered) {
                    loadLSPClient().then(function (LSPClient) {
                        LSPClient.restartLanguageServer(SERVER_ID);
                    });
                }
            }
        });

        // Lazily start / repoint the server from the active editor's language (VS Code's onLanguage
        // model). Evaluate the editor already open at startup (session restore), then track switches.
        EditorManager.on("activeEditorChange", _ensureServerForActiveEditor);
        _ensureServerForActiveEditor();

        // On project switch: re-evaluate checkJs and arm a one-shot repoint. The actual repoint
        // (workspace/didChangeWorkspaceFolders, no restart) happens the next time a served-language
        // file is active - here if one already is, otherwise on the activeEditorChange as the new
        // project's file opens. Plain file switches within a project never set this, so they don't
        // repoint.
        ProjectManager.on(ProjectManager.EVENT_PROJECT_OPEN, function () {
            _refreshCheckJs();
            pendingRepoint = true;
            _ensureServerForActiveEditor();
        });

        // Pick up a tsconfig/jsconfig being added, edited, or removed at the project root.
        ProjectManager.on(ProjectManager.EVENT_PROJECT_CHANGED_OR_RENAMED_PATH, function (_evt, changedPath) {
            const root = ProjectManager.getProjectRoot();
            if (root && TS_CONFIG_FILES.some(function (name) {
                return changedPath === path.join(root.fullPath, name);
            })) {
                _refreshCheckJs();
            }
        });
    });
});
