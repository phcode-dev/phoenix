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
 * JsonLsp - boots the vscode-json-language-server for schema-aware JSON intelligence:
 * completion for known config files (package.json fields, tsconfig options, ...), hover docs
 * from schema descriptions, and validation diagnostics in the Problems panel.
 *
 * Mirrors TypeScriptSupport's lazy-start model: the server is only spawned once a JSON file is
 * the active editor, and a project switch repoints the running server instead of restarting it.
 * Desktop-only (the server is a node process). After every server (re)start the curated schema
 * associations are pushed via workspace/didChangeConfiguration - the server itself downloads and
 * caches the schemas over http(s).
 *
 * @module extensionsIntegrated/JSONSupport/JsonLsp
 */
define(function (require, exports, module) {


    const EditorManager = require("editor/EditorManager"),
        ProjectManager = require("project/ProjectManager"),
        NodeConnector = require("NodeConnector"),
        SchemaAssociations = require("./schemaAssociations");

    const SERVER_ID = "json";
    const SUPPORTED_LANGUAGES = ["json"];

    let lspClientPromise = null;
    let client = null;              // the LanguageClient once registered
    let registered = false;
    let starting = false;
    let pendingRepoint = false;
    let initErrorReported = false;
    // Test hook: when set, pushed instead of the curated table (lets integration tests use a
    // file:// schema so schema features are verifiable without internet access).
    let _schemaAssociationsOverride = null;

    /**
     * LSP only runs in the desktop app where the Node engine is available.
     * @return {boolean}
     */
    function canRun() {
        return Phoenix.isNativeApp && NodeConnector.isNodeAvailable();
    }

    // Lazy-load the LSP framework so it stays out of the boot dependency graph. Memoized; retries
    // once to ride out any module-load race during startup (same pattern as TypeScriptSupport).
    function loadLSPClient() {
        if (!lspClientPromise) {
            lspClientPromise = new Promise(function (resolve, reject) {
                require(["languageTools/LSPClient"], resolve, function () {
                    setTimeout(function () {
                        require(["languageTools/LSPClient"], resolve, reject);
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

    /**
     * Push the JSON server's settings: validation on, formatting off (Phoenix has its own
     * formatters) and the schema-association table. Sent after EVERY server up-transition -
     * initial start, manual/project restart, and crash auto-restart - since a fresh server
     * process starts with no configuration.
     */
    function _pushConfiguration() {
        if (!client) {
            return;
        }
        client.sendCustomNotification("workspace/didChangeConfiguration", {
            settings: {
                json: {
                    validate: { enable: true },
                    format: { enable: false },
                    schemas: _schemaAssociationsOverride || SchemaAssociations.SCHEMA_ASSOCIATIONS
                }
            }
        });
    }

    async function start() {
        if (registered || !canRun()) {
            return;
        }
        const ready = await waitForNodeReady(30000);
        if (!ready) {
            console.error("[JSONSupport] Node not ready - JSON LSP disabled");
            return;
        }
        const LSPClient = await loadLSPClient();

        // Re-push configuration on every later up-transition (manual restart, crash auto-restart)
        // - a fresh server process starts with no settings. The INITIAL start is covered by the
        // direct push below instead: this event fires inside registerLanguageServer, before its
        // result is assigned to `client`, so the handler would see client === null and skip.
        LSPClient.on(LSPClient.EVENT_LANGUAGE_SERVER_STARTED + ".jsonSupport", function (_evt, data) {
            if (data.serverId === SERVER_ID) {
                _pushConfiguration();
            }
        });

        client = await LSPClient.registerLanguageServer({
            serverId: SERVER_ID,
            command: "vscode-json-language-server",
            args: ["--stdio"],
            languages: SUPPORTED_LANGUAGES,
            // The server is comment-tolerant in jsonc mode. Real-world tsconfig/.eslintrc commonly
            // carry comments, so serve ALL json documents as jsonc - package.json with comments is
            // invalid for npm, but schema validation still applies and the npm CLI reports that
            // case better than a squiggly storm would.
            languageIdMap: { json: "jsonc" },
            initializationOptions: {
                provideFormatter: false
                // handledSchemaProtocols deliberately unset: the server then fetches http/https
                // schema URLs itself (NodeJS http) - no client-side schema proxying needed.
            },
            // The JSON server refuses to offer completion unless the client supports snippets
            // (its completions insert `"key": $1` templates). Our insertHint expands snippets via
            // TabstopManager, so this is safe to advertise for this server.
            completionSnippetSupport: true,
            // Yield Phoenix preference files to PrefsCodeHints (priority 0) - it hints actual
            // preference keys/values there, which beats generic schema completion.
            documentFilter: function (fullPath) {
                const name = fullPath.substring(fullPath.lastIndexOf("/") + 1);
                return !/^\.?(brackets|phcode)\.json$/.test(name);
            }
        });
        if (client) {
            registered = true;
            _pushConfiguration();
        }
    }

    function _isServedLanguageActive() {
        const editor = EditorManager.getActiveEditor();
        if (!editor) {
            return false;
        }
        return SUPPORTED_LANGUAGES.indexOf(editor.getLanguageForSelection().getId()) !== -1;
    }

    /**
     * Lazily start the server when a JSON file is active; repoint (not restart) the running server
     * after a project switch. Same onLanguage model as TypeScriptSupport - projects that never
     * open a JSON file never spawn the server.
     */
    function _ensureServerForActiveEditor() {
        if (!canRun() || !_isServedLanguageActive()) {
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
                    window.logger && window.logger.reportError(err, "[JSONSupport] JSON LSP init failed");
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

    /**
     * Wire the lazy-start lifecycle. Call from appReady; no-ops outside the desktop app.
     */
    function init() {
        if (!canRun()) {
            return;
        }
        loadLSPClient(); // pre-warm the framework module (not the server)
        EditorManager.on("activeEditorChange.jsonSupport", _ensureServerForActiveEditor);
        _ensureServerForActiveEditor();
        ProjectManager.on(ProjectManager.EVENT_PROJECT_OPEN + ".jsonSupport", function () {
            pendingRepoint = true;
            _ensureServerForActiveEditor();
        });
    }

    /**
     * Test hook - override the schema associations (e.g. with a file:// fixture schema) and
     * re-push to the running server. Pass null to restore the curated table.
     * @param {?Array<{fileMatch: string[], url: string}>} associations
     */
    function _setTestSchemaAssociations(associations) {
        _schemaAssociationsOverride = associations;
        _pushConfiguration();
    }

    exports.init = init;
    exports.canRun = canRun;
    exports.SERVER_ID = SERVER_ID;
    exports._setTestSchemaAssociations = _setTestSchemaAssociations;
});
