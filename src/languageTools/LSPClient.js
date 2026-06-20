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
 * LSPClient - browser-side Language Server Protocol client (desktop only).
 *
 * This is the thin, modern replacement for the legacy `LanguageClientWrapper` + NodeDomain
 * transport. It owns a single shared `ph-lsp` NodeConnector and a multi-server registry
 * keyed by `serverId`, and talks to the Node-side `src-node/lsp-client.js`.
 *
 * Language extensions only call `registerLanguageServer(config)`; this module then:
 *   - lazily loads the node LSP module on demand (keeps boot fast),
 *   - spawns + `initialize`s the server,
 *   - instantiates the standard providers from `DefaultProviders` (completion, signatureHelp,
 *     definition, references, diagnostics) plus the `HoverProvider`, and registers each with
 *     its Phoenix manager (CodeHintManager, ParameterHintsManager, JumpToDefManager,
 *     FindReferencesManager, CodeInspection, QuickViewManager),
 *   - drives document lifecycle through `DocumentSync`.
 *
 * Each `LanguageClient` exposes exactly the method surface `DefaultProviders` expects
 * (`getServerCapabilities`, `requestHints`, `requestParameterHints`, `gotoDefinition`,
 * `findReferences`, plus the new `requestHover`). All translation between Phoenix
 * `{line, ch}` / VFS paths and LSP `{line, character}` / `file://` URIs (including the
 * `/tauri` virtual-path prefix used by the desktop build) happens here so the providers stay
 * transport-agnostic.
 *
 * @module languageTools/LSPClient
 */

/* eslint max-len: ["error", { "code": 120 }] */
define(function (require, exports, module) {


    const NodeConnector         = require("NodeConnector"),
        NodeUtils               = require("utils/NodeUtils"),
        ProjectManager          = require("project/ProjectManager"),
        DocumentManager         = require("document/DocumentManager"),
        FileUtils               = require("file/FileUtils"),
        PathConverters          = require("languageTools/PathConverters"),
        DefaultProviders        = require("languageTools/DefaultProviders"),
        HoverProvider           = require("languageTools/HoverProvider"),
        DocumentSync            = require("languageTools/DocumentSync"),
        DocumentHighlight       = require("languageTools/DocumentHighlight"),
        LanguageManager         = require("language/LanguageManager"),
        CodeHintManager         = require("editor/CodeHintManager"),
        ParameterHintsManager   = require("features/ParameterHintsManager"),
        JumpToDefManager        = require("features/JumpToDefManager"),
        FindReferencesManager   = require("features/FindReferencesManager"),
        QuickViewManager        = require("features/QuickViewManager"),
        CodeInspection          = require("language/CodeInspection");

    const LSP_CONNECTOR_ID = "ph-lsp";
    // Relative path required on the node side (resolved from src-node/utils.js). Lazy-loads the
    // node LSP module the first time we connect, so node boot is unaffected.
    const NODE_LSP_MODULE = "./lsp-client";
    // LSP providers register above the built-in (e.g. Tern) providers so the language server
    // wins when it is available, falling back gracefully when it is not.
    const DEFAULT_PRIORITY = 1;

    let connectorPromise = null;
    let connector = null;
    const clients = new Map(); // serverId -> LanguageClient

    // ------------------------------------------------------------------------------------------
    // Path / coordinate translation (VFS <-> real OS path <-> file:// URI)
    // ------------------------------------------------------------------------------------------

    function _toPlatformPath(vfsPath) {
        if (window.fs && window.fs.getTauriPlatformPath) {
            const platformPath = window.fs.getTauriPlatformPath(vfsPath);
            if (platformPath) {
                return platformPath;
            }
        }
        return vfsPath;
    }

    function _toVirtualPath(platformPath) {
        if (window.fs && window.fs.getTauriVirtualPath) {
            return window.fs.getTauriVirtualPath(platformPath);
        }
        return platformPath;
    }

    /** Convert a Phoenix VFS path to the `file://` URI the server understands (real OS path). */
    function pathToServerUri(vfsPath) {
        return PathConverters.pathToUri(_toPlatformPath(vfsPath));
    }

    /** Convert a server `file://` URI (real OS path) back to a VFS-based `file://` URI. */
    function serverUriToVfsUri(serverUri) {
        const platformPath = PathConverters.uriToPath(serverUri);
        return PathConverters.pathToUri(_toVirtualPath(platformPath));
    }

    function _markupToString(documentation) {
        if (!documentation) {
            return "";
        }
        if (typeof documentation === "string") {
            return documentation;
        }
        return documentation.value || "";
    }

    function _paramLabel(signatureLabel, paramLabel) {
        if (Array.isArray(paramLabel)) {
            // LSP allows [start, end] offsets into the signature label.
            return signatureLabel.substring(paramLabel[0], paramLabel[1]);
        }
        return paramLabel;
    }

    function _normalizeLocation(loc) {
        if (!loc) {
            return null;
        }
        const uri = loc.uri || loc.targetUri;
        const range = loc.range || loc.targetSelectionRange || loc.targetRange;
        if (!uri || !range) {
            return null;
        }
        return { uri: serverUriToVfsUri(uri), range: range };
    }

    // ------------------------------------------------------------------------------------------
    // Shared connector (lazy)
    // ------------------------------------------------------------------------------------------

    function getConnector() {
        if (!connectorPromise) {
            connectorPromise = (async function () {
                // Lazy-load the node LSP module on first use so it does not slow node boot.
                await NodeUtils._loadNodeExtensionModule(NODE_LSP_MODULE);
                connector = NodeConnector.createNodeConnector(LSP_CONNECTOR_ID, {});
                connector.on("lspNotification", _onLspNotification);
                connector.on("serverExit", _onServerExit);
                connector.on("serverError", _onServerError);
                return connector;
            }());
        }
        return connectorPromise;
    }

    function _onLspNotification(_event, data) {
        if (!data) {
            return;
        }
        const client = clients.get(data.serverId);
        if (!client) {
            return;
        }
        if (client._stopping) {
            // The server is shutting down/restarting. Ignore any late messages it emits during the
            // teardown window so stale diagnostics from the dying instance don't leak into the fresh
            // one that replaces it (both share the same serverId).
            return;
        }
        if (data.method === "textDocument/publishDiagnostics" && client.lintingProvider) {
            const params = data.params || {};
            // Rewrite the URI to a VFS-based URI so the linting provider keys results by the
            // same path CodeInspection uses (editor.document.file._path).
            const vfsUri = serverUriToVfsUri(params.uri);
            let diagnostics = params.diagnostics || [];
            // Let the language config drop diagnostics that don't make sense for a given file
            // (e.g. TypeScript's "needs a declaration file" suggestions in a plain JS file).
            const filterFn = client.config && client.config.filterDiagnostics;
            if (filterFn && diagnostics.length) {
                const vfsPath = PathConverters.uriToPath(vfsUri);
                const language = LanguageManager.getLanguageForPath(vfsPath);
                diagnostics = filterFn(diagnostics, {
                    languageId: language && language.getId(),
                    filePath: vfsPath
                });
            }
            client.lintingProvider.setInspectionResults({
                uri: vfsUri,
                diagnostics: diagnostics
            });
        }
    }

    const MAX_AUTO_RESTARTS = 3;

    function _onServerExit(_event, data) {
        const client = data && clients.get(data.serverId);
        if (!client) {
            return;
        }
        client.capabilities = null;
        DocumentSync.clearServer(client);
        if (client._stopping) {
            return; // Intentional stop/restart - do not auto-restart here.
        }
        // Unexpected crash - log it loudly (with the server's stderr) so failures are never
        // silent, then self-heal with a bounded backoff to recover without a reload.
        console.error("[LSP] server '" + data.serverId + "' exited unexpectedly (code=" + data.code +
            (data.signal ? ", signal=" + data.signal : "") + ")." +
            (data.stderr ? "\n--- server stderr ---\n" + data.stderr : ""));
        client._crashCount = (client._crashCount || 0) + 1;
        if (client._crashCount > MAX_AUTO_RESTARTS) {
            console.error("[LSP]", client.serverId, "exited repeatedly; not restarting");
            return;
        }
        setTimeout(function () {
            if (!clients.has(client.serverId) || client.capabilities) {
                return;
            }
            _startAndInit(client).then(function () {
                client._crashCount = 0;
                DocumentSync.openSupportedDocuments(client);
            }).catch(function (err) {
                console.error("[LSP] auto-restart failed", client.serverId, err && (err.message || err));
            });
        }, 1000 * client._crashCount);
    }

    function _onServerError(_event, data) {
        if (data) {
            console.error("[LSP] server error", data.serverId, data.error);
        }
    }

    // ------------------------------------------------------------------------------------------
    // LanguageClient - one per server, exposes the provider-facing method surface
    // ------------------------------------------------------------------------------------------

    function LanguageClient(serverId, languages, config) {
        this.serverId = serverId;
        this.languages = languages;
        this.config = config;
        this.capabilities = null;
    }

    LanguageClient.prototype.getServerCapabilities = function () {
        return this.capabilities;
    };

    LanguageClient.prototype.uriForPath = function (vfsPath) {
        return pathToServerUri(vfsPath);
    };

    LanguageClient.prototype._request = function (method, params) {
        const serverId = this.serverId;
        return getConnector().then(function (conn) {
            return conn.execPeer("sendRequest", { serverId: serverId, method: method, params: params });
        });
    };

    LanguageClient.prototype._notify = function (method, params) {
        const serverId = this.serverId;
        return getConnector().then(function (conn) {
            return conn.execPeer("sendNotification", { serverId: serverId, method: method, params: params });
        }).catch(function (err) {
            // Notifications are best-effort (the server may be restarting). Don't let it become an
            // unhandled rejection, but still surface it as a warning so we are not blind.
            console.warn("[LSP] notification '" + method + "' failed:", err && (err.message || err));
        });
    };

    // Document lifecycle notifications used by DocumentSync.
    LanguageClient.prototype.notifyDidOpen = function (uri, languageId, version, text) {
        return this._notify("textDocument/didOpen", {
            textDocument: { uri: uri, languageId: languageId, version: version, text: text }
        });
    };
    LanguageClient.prototype.notifyDidChange = function (uri, version, text) {
        return this._notify("textDocument/didChange", {
            textDocument: { uri: uri, version: version },
            contentChanges: [{ text: text }]
        });
    };
    LanguageClient.prototype.notifyDidClose = function (uri) {
        return this._notify("textDocument/didClose", { textDocument: { uri: uri } });
    };

    function _positionOf(cursorPos) {
        return { line: cursorPos.line, character: cursorPos.ch };
    }

    // Build a cache key identifying the current completion "context": the file, line, the column
    // where the word under the cursor starts, and the text on the line before that word. While the
    // user types/moves within the same word, this key stays constant, so we can reuse the server's
    // (complete) result and filter client-side instead of re-querying. That avoids slow late
    // responses rebuilding the list mid-navigation.
    function _completionContextKey(filePath, pos) {
        const doc = DocumentManager.getOpenDocumentForPath(filePath);
        if (!doc) {
            return null;
        }
        const lineText = doc.getLine(pos.line) || "";
        let start = pos.ch;
        while (start > 0 && /[\w$]/.test(lineText.charAt(start - 1))) {
            start--;
        }
        return filePath + "|" + pos.line + "|" + lineText.substring(0, start);
    }

    LanguageClient.prototype.requestHints = function (params) {
        const self = this;
        const deferred = $.Deferred();
        (async function () {
            try {
                // Reuse the cached (complete) completion list while still in the same completion
                // context, so typing/cursor-moves within a word don't re-hit the server.
                const ctxKey = _completionContextKey(params.filePath, params.cursorPos);
                if (ctxKey && self._completionCache && self._completionCache.key === ctxKey) {
                    deferred.resolve({ items: self._completionCache.items });
                    return;
                }
                await DocumentSync.flush(self, params.filePath);
                const result = await self._request("textDocument/completion", {
                    textDocument: { uri: self.uriForPath(params.filePath) },
                    position: _positionOf(params.cursorPos)
                });
                const isIncomplete = !!(result && !Array.isArray(result) && result.isIncomplete);
                const items = (result && (result.items || result)) || [];
                items.forEach(function (item) {
                    // Keep the full server item (its `data` is needed for completionItem/resolve);
                    // just coerce documentation to a string for inline display.
                    item.documentation = _markupToString(item.documentation);
                });
                // Only cache a complete list (an incomplete one must be re-queried as the user types).
                self._completionCache = (ctxKey && !isIncomplete) ? { key: ctxKey, items: items } : null;
                deferred.resolve({ items: items });
            } catch (err) {
                console.warn("[LSP] request failed:", err && (err.message || err));
                deferred.reject(err);
            }
        }());
        return deferred.promise();
    };

    LanguageClient.prototype.requestParameterHints = function (params) {
        const self = this;
        const deferred = $.Deferred();
        (async function () {
            try {
                await DocumentSync.flush(self, params.filePath);
                const result = await self._request("textDocument/signatureHelp", {
                    textDocument: { uri: self.uriForPath(params.filePath) },
                    position: _positionOf(params.cursorPos)
                });
                if (!result || !result.signatures || !result.signatures.length) {
                    deferred.reject();
                    return;
                }
                const signatures = result.signatures.map(function (sig) {
                    return {
                        documentation: _markupToString(sig.documentation) || sig.label,
                        parameters: (sig.parameters || []).map(function (p) {
                            return {
                                label: _paramLabel(sig.label, p.label),
                                documentation: _markupToString(p.documentation)
                            };
                        })
                    };
                });
                deferred.resolve({ signatures: signatures, activeParameter: result.activeParameter });
            } catch (err) {
                console.warn("[LSP] request failed:", err && (err.message || err));
                deferred.reject(err);
            }
        }());
        return deferred.promise();
    };

    LanguageClient.prototype.gotoDefinition = function (params) {
        const self = this;
        const deferred = $.Deferred();
        (async function () {
            try {
                await DocumentSync.flush(self, params.filePath);
                const result = await self._request("textDocument/definition", {
                    textDocument: { uri: self.uriForPath(params.filePath) },
                    position: _positionOf(params.cursorPos)
                });
                if (!result || (Array.isArray(result) && !result.length)) {
                    deferred.reject();
                    return;
                }
                if (Array.isArray(result)) {
                    const locations = result.map(_normalizeLocation).filter(Boolean);
                    if (!locations.length) {
                        deferred.reject();
                        return;
                    }
                    deferred.resolve(locations);
                } else {
                    deferred.resolve(_normalizeLocation(result));
                }
            } catch (err) {
                console.warn("[LSP] request failed:", err && (err.message || err));
                deferred.reject(err);
            }
        }());
        return deferred.promise();
    };

    LanguageClient.prototype.findReferences = function (params) {
        const self = this;
        const deferred = $.Deferred();
        (async function () {
            try {
                await DocumentSync.flush(self, params.filePath);
                const result = await self._request("textDocument/references", {
                    textDocument: { uri: self.uriForPath(params.filePath) },
                    position: _positionOf(params.cursorPos),
                    context: { includeDeclaration: true }
                });
                const locations = Array.isArray(result) ? result.map(_normalizeLocation).filter(Boolean) : [];
                deferred.resolve(locations);
            } catch (err) {
                console.warn("[LSP] request failed:", err && (err.message || err));
                deferred.reject(err);
            }
        }());
        return deferred.promise();
    };

    LanguageClient.prototype.resolveCompletion = function (item) {
        const deferred = $.Deferred();
        if (!this.capabilities || !this.capabilities.completionProvider ||
                !this.capabilities.completionProvider.resolveProvider) {
            return deferred.resolve(item).promise(); // server can't enrich items
        }
        this._request("completionItem/resolve", item).then(function (resolved) {
            const out = resolved || item;
            out.documentation = _markupToString(out.documentation);
            deferred.resolve(out);
        }, function () {
            deferred.resolve(item); // fall back to the unresolved item
        });
        return deferred.promise();
    };

    LanguageClient.prototype.documentHighlight = function (params) {
        const self = this;
        const deferred = $.Deferred();
        (async function () {
            try {
                await DocumentSync.flush(self, params.filePath);
                const result = await self._request("textDocument/documentHighlight", {
                    textDocument: { uri: self.uriForPath(params.filePath) },
                    position: _positionOf(params.cursorPos)
                });
                deferred.resolve(Array.isArray(result) ? result : []);
            } catch (err) {
                console.warn("[LSP] request failed:", err && (err.message || err));
                deferred.reject(err);
            }
        }());
        return deferred.promise();
    };

    LanguageClient.prototype.requestHover = function (params) {
        const self = this;
        const deferred = $.Deferred();
        (async function () {
            try {
                await DocumentSync.flush(self, params.filePath);
                const result = await self._request("textDocument/hover", {
                    textDocument: { uri: self.uriForPath(params.filePath) },
                    position: _positionOf(params.cursorPos)
                });
                deferred.resolve(result);
            } catch (err) {
                console.warn("[LSP] request failed:", err && (err.message || err));
                deferred.reject(err);
            }
        }());
        return deferred.promise();
    };

    // ------------------------------------------------------------------------------------------
    // Server lifecycle + provider registration
    // ------------------------------------------------------------------------------------------

    function _projectRootPath() {
        const root = ProjectManager.getProjectRoot();
        return root ? root.fullPath : null;
    }

    function _clientCapabilities() {
        return {
            textDocument: {
                synchronization: {
                    dynamicRegistration: false,
                    didSave: true,
                    willSave: false,
                    willSaveWaitUntil: false
                },
                completion: {
                    dynamicRegistration: false,
                    completionItem: {
                        snippetSupport: false,
                        documentationFormat: ["markdown", "plaintext"]
                    }
                },
                hover: { dynamicRegistration: false, contentFormat: ["markdown", "plaintext"] },
                signatureHelp: {
                    dynamicRegistration: false,
                    signatureInformation: { documentationFormat: ["markdown", "plaintext"] }
                },
                definition: { dynamicRegistration: false },
                references: { dynamicRegistration: false },
                publishDiagnostics: { relatedInformation: false }
            },
            workspace: { workspaceFolders: true, configuration: false }
        };
    }

    // The UI language the user has Phoenix set to (e.g. "en", "fr", "ja"), forwarded to the
    // server so it can localize its messages. Falls back to English when unavailable.
    function _uiLocale() {
        return (typeof brackets !== "undefined" && brackets.getLocale && brackets.getLocale()) || "en";
    }

    async function _startAndInit(client) {
        const config = client.config;
        const conn = await getConnector();
        const rootVfsPath = (config.rootUriProvider && config.rootUriProvider()) || _projectRootPath();
        const rootUri = rootVfsPath ? pathToServerUri(rootVfsPath) : null;
        const rootName = rootVfsPath ? FileUtils.getBaseName(rootVfsPath) : "root";

        await conn.execPeer("startServer", {
            serverId: client.serverId,
            command: config.command,
            args: config.args || ["--stdio"],
            rootUri: rootUri
        });

        const initResult = await conn.execPeer("sendRequest", {
            serverId: client.serverId,
            method: "initialize",
            params: {
                processId: null,
                // LSP InitializeParams.locale - the UI language to localize server messages
                // (diagnostics, hover/quick-info) in. vtsls forwards this to tsserver, which ships
                // localized messages for many locales and falls back to English for unknown ones.
                locale: _uiLocale(),
                rootUri: rootUri,
                workspaceFolders: rootUri ? [{ uri: rootUri, name: rootName }] : null,
                capabilities: _clientCapabilities(),
                initializationOptions: config.initializationOptions || {}
            }
        });
        client.capabilities = (initResult && initResult.capabilities) || {};

        await conn.execPeer("sendNotification", {
            serverId: client.serverId,
            method: "initialized",
            params: {}
        });
    }

    function _registerProviders(client) {
        const langs = client.languages;

        client.codeHints = new DefaultProviders.CodeHintsProvider(client);
        client.parameterHints = new DefaultProviders.ParameterHintsProvider(client);
        client.jumpToDef = new DefaultProviders.JumpToDefProvider(client);
        client.references = new DefaultProviders.ReferencesProvider(client);
        client.lintingProvider = new DefaultProviders.LintingProvider();
        client.lintingProvider._validateOnType = true;
        // recorded so the provider can tell whether it is still a participating inspector before nudging a
        // re-run on async diagnostics.
        client.lintingProvider._inspectionProviderName = client.serverId;
        client.hover = new HoverProvider.HoverProvider(client);

        CodeHintManager.registerHintProvider(client.codeHints, langs, DEFAULT_PRIORITY);
        ParameterHintsManager.registerHintProvider(client.parameterHints, langs, DEFAULT_PRIORITY);
        JumpToDefManager.registerJumpToDefProvider(client.jumpToDef, langs, DEFAULT_PRIORITY);
        FindReferencesManager.registerFindReferencesProvider(client.references, langs, DEFAULT_PRIORITY);
        QuickViewManager.registerQuickViewProvider(client.hover, langs);

        langs.forEach(function (lang) {
            CodeInspection.register(lang, {
                name: client.lintingProvider._inspectionProviderName,
                scanFileAsync: function (text, fullPath) {
                    // Diagnostics are pushed asynchronously by the server (publishDiagnostics),
                    // so never block the scan waiting for them - return whatever is cached now and
                    // let setInspectionResults() trigger a re-scan when fresh diagnostics arrive.
                    // (Blocking here would surface CodeInspection's 10s "timed out" error.)
                    const cached = client.lintingProvider.getInspectionResults(text, fullPath);
                    return $.Deferred().resolve(cached || { errors: [] }).promise();
                }
            });
        });
    }

    /**
     * Register and start a language server, wiring all providers into the editor.
     *
     * @param {Object} config
     * @param {string} config.serverId - unique id for the server (e.g. "typescript")
     * @param {string} config.command - server binary (resolved from node_modules/.bin then PATH)
     * @param {string[]} [config.args=["--stdio"]] - server arguments
     * @param {string[]} config.languages - Phoenix language ids this server handles
     * @param {Object} [config.initializationOptions] - LSP initializationOptions for the server
     * @param {Object} [config.languageIdMap] - map of Phoenix langId -> LSP languageId
     * @param {function(string, Editor):boolean} [config.shouldAutoTrigger] - decides whether a
     *        typed character should implicitly open the hint list. Receives (implicitChar, editor).
     *        When omitted, a generic default is used (identifier chars + the server's non-whitespace
     *        triggerCharacters). Explicit invocation (Ctrl-Space) always shows hints regardless.
     * @param {function():string} [config.rootUriProvider] - returns the workspace root VFS path
     * @return {Promise<LanguageClient|null>} the client, or null if it could not be started
     */
    async function registerLanguageServer(config) {
        if (clients.has(config.serverId)) {
            return clients.get(config.serverId);
        }
        const client = new LanguageClient(config.serverId, config.languages, config);
        // Register eagerly so a publishDiagnostics arriving during init is not dropped.
        clients.set(config.serverId, client);
        try {
            await _startAndInit(client);
            _registerProviders(client);
            DocumentSync.init();
            DocumentSync.registerClient(client);
            DocumentSync.openSupportedDocuments(client);
            DocumentHighlight.init();
            DocumentHighlight.registerClient(client);
            return client;
        } catch (err) {
            console.error("[LSP] failed to start server", config.serverId, err && (err.message || err));
            clients.delete(config.serverId);
            return null;
        }
    }

    /**
     * Stop a running language server and restart it (e.g. on project switch) with the current
     * workspace root. Provider registrations are preserved; only the server process is recycled.
     *
     * @param {string} serverId
     * @return {Promise<void>}
     */
    // How long to wait for a server to acknowledge a graceful `shutdown` before we hard-kill it.
    // Healthy servers reply in well under this; the cap is a failsafe so a slow/buggy/hung server
    // can't stall the restart indefinitely.
    const SHUTDOWN_TIMEOUT_MS = 3000;

    // Resolve/reject with `promise`, but reject with a timeout error if it doesn't settle in `ms`.
    function _withTimeout(promise, ms) {
        return new Promise(function (resolve, reject) {
            const timer = setTimeout(function () {
                reject(new Error("timeout"));
            }, ms);
            promise.then(function (value) {
                clearTimeout(timer);
                resolve(value);
            }, function (err) {
                clearTimeout(timer);
                reject(err);
            });
        });
    }

    async function restartLanguageServer(serverId) {
        const client = clients.get(serverId);
        if (!client) {
            return;
        }
        await stopServerProcess(client);
        try {
            await _startAndInit(client);
            DocumentSync.openSupportedDocuments(client);
            // The find-references command's enabled state is computed on file switch; on a project
            // switch that happens while the server is still restarting (capabilities not yet
            // available), so it would be left disabled. Now that the server is back with its
            // capabilities, refresh it for the active file so "Find Usages" works without requiring
            // another file switch.
            FindReferencesManager.setMenuItemStateForLanguage();
        } catch (err) {
            console.error("[LSP] failed to restart server", serverId, err && (err.message || err));
        }
    }

    async function stopServerProcess(client) {
        const conn = await getConnector();
        client._stopping = true; // Suppress auto-restart for this intentional stop.
        // Clear capabilities and document tracking up front so that, during the teardown
        // down-window, no feature/sync request treats the server as alive and no failed didOpen
        // leaves a stale "open" entry that would block the post-restart re-sync.
        client.capabilities = null;
        client._completionCache = null;
        DocumentSync.clearServer(client);
        // Attempt a graceful LSP shutdown - some servers need it to flush state or clean up child
        // processes - but BOUND it. The `shutdown` request blocks until the server replies, and a
        // busy or cold server can be slow (or never reply), which would stall the restart; on a
        // project switch we'd end up waiting for the old server to finish booting just to tell it to
        // die, then cold-start a new one (a double penalty on slow CI). Give it a short budget, then
        // hard-kill regardless. The `exit` notification expects no reply, so it stays cheap.
        try {
            await _withTimeout(
                conn.execPeer("sendRequest", { serverId: client.serverId, method: "shutdown", params: null }),
                SHUTDOWN_TIMEOUT_MS);
            await conn.execPeer("sendNotification", { serverId: client.serverId, method: "exit", params: null });
        } catch (e) {
            // Timed out, or the server is already dead - fall through to the hard stop.
        }
        await conn.execPeer("stopServer", { serverId: client.serverId });
        client._stopping = false;
    }

    exports.registerLanguageServer = registerLanguageServer;
    exports.restartLanguageServer = restartLanguageServer;
    exports.pathToServerUri = pathToServerUri;
    exports.serverUriToVfsUri = serverUriToVfsUri;
});
