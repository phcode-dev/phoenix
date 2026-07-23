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
        TokenUtils = brackets.getModule("utils/TokenUtils"),
        CodeIntelligence = require("./CodeIntelligence"),
        ConfigPanel = require("./ConfigPanel");

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
    let _client = null;
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

    // A body-opening "{" is preceded by "=>" (arrow body), ")" (function/if/for/switch body) or a
    // bare block keyword; an object-literal "{" follows "(", ",", ":", "=", "return", "[", ...
    const BRACE_BODY_MARKERS = /^(=>|\)|do|else|try|finally)$/;

    // Lines longer than this are minified-style code. The backward token walk re-tokenizes a
    // line's prefix on every step (O(length^2) per line), which on a single huge line can freeze
    // the UI for seconds - so such lines are never token-scanned.
    const PARAM_SCAN_MAX_LINE_LENGTH = 2000;

    // Plain-character backward scan over a small window - used only on minified-style lines where
    // tokenizing is too expensive. True when the cursor sits directly inside a call's argument
    // parens (an unmatched "(" appears before any unmatched "{"), e.g. right after typing `foo(`.
    // Quotes/comments are not understood - best effort, bounded blast radius on minified code.
    function _atCallHeadPlainText(lineText, ch) {
        const windowStart = Math.max(0, ch - 200);
        let parenDepth = 0,
            braceDepth = 0;
        for (let i = ch - 1; i >= windowStart; i--) {
            const c = lineText.charAt(i);
            if (c === ")") {
                parenDepth++;
            } else if (c === "(") {
                if (parenDepth > 0) {
                    parenDepth--;
                } else {
                    return true; // directly inside a call's parens
                }
            } else if (c === "}") {
                braceDepth++;
            } else if (c === "{") {
                if (braceDepth > 0) {
                    braceDepth--;
                } else {
                    return false; // some brace scope encloses the cursor first - not at a call head
                }
            }
        }
        return false; // cannot tell within the window
    }

    // True when the cursor sits inside a `{...}` FUNCTION BODY nested within the surrounding
    // call's argument list - e.g. `on("x", () => { <cursor> })`. Object-literal arguments
    // (`css({ color: <cursor> })`) deliberately do NOT match: their active-parameter highlight is
    // genuinely useful, and their opening brace is distinguishable by the token before it.
    // Bounded token-based backward scan; string/comment tokens are ignored.
    function _inFunctionBodyInsideArgs(editor) {
        const cursor = editor.getCursorPos();
        const cursorLineText = editor.document.getLine(cursor.line) || "";
        if (cursorLineText.length > PARAM_SCAN_MAX_LINE_LENGTH) {
            // Minified-style line: token-scanning it would freeze the UI, so don't. Suppress the
            // popup there UNLESS the cursor sits right at a call head (just typed `foo(` / moving
            // between a call's parens) - that much a cheap plain-text window can decide.
            return !_atCallHeadPlainText(cursorLineText, cursor.ch);
        }
        const ctx = TokenUtils.getInitialContext(editor._codeMirror, cursor);
        let parenDepth = 0,
            braceDepth = 0,
            unmatchedBrace = false,
            scanned = 0,
            first = true;
        while (scanned++ < 2000) {
            // The initial context token is the one directly BEFORE/at the cursor (e.g. the "(" the
            // user just typed in `console.log(|`). It must take part in the bracket accounting -
            // skipping it would match the wrong parens and misclassify the position.
            if (first) {
                first = false;
            } else {
                // About to cross into the previous line (mirrors movePrevToken's own condition)?
                // Bail out BEFORE paying to tokenize it if it is minified-style huge - fail open,
                // the hint then behaves as it did before this gate existed.
                if (ctx.pos.ch <= 0 || ctx.token.start <= 0) {
                    if (ctx.pos.line <= 0) {
                        break;
                    }
                    const prevLineText = editor.document.getLine(ctx.pos.line - 1) || "";
                    if (prevLineText.length > PARAM_SCAN_MAX_LINE_LENGTH) {
                        return false;
                    }
                }
                if (!TokenUtils.movePrevToken(ctx)) {
                    break;
                }
            }
            const type = ctx.token.type || "";
            if (type.indexOf("string") !== -1 || type.indexOf("comment") !== -1) {
                continue;
            }
            const text = ctx.token.string.trim();
            if (!text) {
                continue;
            }
            if (unmatchedBrace) {
                // The token preceding an unmatched "{" tells whether it opened a function body
                // (suppress) or a literal (keep scanning outward for the call paren).
                if (BRACE_BODY_MARKERS.test(text)) {
                    return true;
                }
                unmatchedBrace = false;
                // fall through - this token still takes part in normal bracket accounting
            }
            if (text === "}") {
                braceDepth++;
            } else if (text === "{") {
                if (braceDepth > 0) {
                    braceDepth--;
                } else {
                    unmatchedBrace = true;
                }
            } else if (text === ")") {
                parenDepth++;
            } else if (text === "(") {
                if (parenDepth > 0) {
                    parenDepth--;
                } else {
                    return false; // reached the enclosing call's "(" directly - a real arg position
                }
            }
        }
        return false;
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
            filterDiagnostics: filterDiagnostics,
            // tsserver treats a whole callback argument INCLUDING its body as "inside the call" -
            // veto signature help there so the parent call's hint doesn't show (or stick around)
            // while coding inside a callback like `on("x", () => { | })`.
            shouldShowParameterHints: function (editor) {
                return !_inFunctionBodyInsideArgs(editor);
            }
        });
        if (client) {
            registered = true;
            _client = client;
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
        if (!editor) {
            return false;
        }
        return SUPPORTED_LANGUAGES.indexOf(editor.getLanguageForSelection().getId()) !== -1;
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

        // Friendly settings UI for the project's ts/jsconfig - a bottom panel that auto-shows when
        // the root config file is being viewed (see ConfigPanel).
        ConfigPanel.init();

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

    if (Phoenix.isTestWindow) {
        // the registered LanguageClient (null until the server has started) - lets integration
        // tests drive the LSP providers/requests directly
        exports._getClient = function () {
            return _client;
        };
        // the parameter-hint body-gate internals, exported so tests can table-drive the
        // classification of cursor contexts without a server round-trip per case
        exports._inFunctionBodyInsideArgs = _inFunctionBodyInsideArgs;
        exports._atCallHeadPlainText = _atCallHeadPlainText;
    }
});
