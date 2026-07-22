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
        CodeInspection          = require("language/CodeInspection"),
        EventDispatcher         = require("utils/EventDispatcher");

    EventDispatcher.makeEventDispatcher(exports);

    /**
     * Fired when a language server has finished (re)starting and is now serving/linting its languages.
     * Handler args: `{ serverId, languages }`. Exposed for extensions that want to react to a server
     * becoming available - it's loaded lazily, so they can't observe its startup directly.
     * @const {string}
     */
    const EVENT_LANGUAGE_SERVER_STARTED = "languageServerStarted";

    /**
     * Fired when a language server's process has stopped. Note a normal project switch does NOT stop
     * the server - it is repointed in place via workspace/didChangeWorkspaceFolders. This fires only
     * when the process is actually recycled: the restart fallback (for servers that can't change
     * workspace folders live) and manual restarts, each followed by EVENT_LANGUAGE_SERVER_STARTED once
     * back up. Handler args: `{ serverId, languages }`.
     * @const {string}
     */
    const EVENT_LANGUAGE_SERVER_STOPPED = "languageServerStopped";

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
            const vfsPath = PathConverters.uriToPath(vfsUri);
            const language = LanguageManager.getLanguageForPath(vfsPath);
            const langId = language && language.getId();
            let diagnostics = params.diagnostics || [];
            // Let the language config drop diagnostics that don't make sense for a given file
            // (e.g. TypeScript's "needs a declaration file" suggestions in a plain JS file).
            const filterFn = client.config && client.config.filterDiagnostics;
            if (filterFn && diagnostics.length) {
                diagnostics = filterFn(diagnostics, { languageId: langId, filePath: vfsPath });
            }
            client.lintingProvider.setInspectionResults({
                uri: vfsUri,
                diagnostics: diagnostics
            });
            // Hand the RAW diagnostics (setInspectionResults flattens them, losing range/code/data)
            // to the quickfix layer, which idle-fetches textDocument/codeAction fixes for them and
            // decorates the cached results - see LintingProvider.updateQuickFixes.
            client.lintingProvider.updateQuickFixes(vfsPath, diagnostics);
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
                _announceServerStarted(client);
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

    /**
     * Whether this client serves the given editor's DOCUMENT. Feature providers are selected by the
     * language at the cursor (e.g. "javascript" inside an HTML <script> or a markdown ```js fence),
     * so without this check they would claim requests in host documents the server never syncs -
     * returning nothing while starving lower-priority providers (Tern) that can actually serve them.
     * @param {Editor} editor
     * @return {boolean}
     */
    LanguageClient.prototype.servesDocument = function (editor) {
        if (!editor || this.languages.indexOf(editor.document.getLanguage().getId()) === -1) {
            return false;
        }
        // Optional per-file opt-out (config.documentFilter): lets a server decline specific files
        // of a language it otherwise serves, so lower-priority specialised providers can win there
        // (e.g. the JSON server yields Phoenix preference files to PrefsCodeHints).
        if (this.config && typeof this.config.documentFilter === "function" &&
                !this.config.documentFilter(editor.document.file.fullPath)) {
            return false;
        }
        return true;
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
            // Log AND re-throw: callers must be able to react to a lost notification (DocumentSync
            // flags a full resync when a didChange never reached the server - swallowing here would
            // leave the server's copy silently divergent). Fire-and-forget callers attach their own
            // no-op catch.
            console.warn("[LSP] notification '" + method + "' failed:", err && (err.message || err));
            throw err;
        });
    };

    /**
     * Send an arbitrary LSP notification to this client's server (e.g. a feature module pushing
     * `workspace/didChangeConfiguration` after start). Best-effort: failures are logged, never
     * thrown.
     * @param {string} method - LSP notification method name
     * @param {Object} params - notification params
     * @return {Promise<void>}
     */
    LanguageClient.prototype.sendCustomNotification = function (method, params) {
        return this._notify(method, params).catch(function () {
            // already logged in _notify; custom notifications are fire-and-forget
        });
    };

    // Document lifecycle notifications used by DocumentSync.
    LanguageClient.prototype.notifyDidOpen = function (uri, languageId, version, text) {
        return this._notify("textDocument/didOpen", {
            textDocument: { uri: uri, languageId: languageId, version: version, text: text }
        });
    };
    // `contentChanges` is the LSP array the caller (DocumentSync) builds: either a single full-text
    // entry [{ text }] for full sync, or an ordered list of incremental edits [{ range, text }, ...]
    // when the server advertises incremental sync.
    LanguageClient.prototype.notifyDidChange = function (uri, version, contentChanges) {
        return this._notify("textDocument/didChange", {
            textDocument: { uri: uri, version: version },
            contentChanges: contentChanges
        });
    };
    LanguageClient.prototype.notifyDidClose = function (uri) {
        return this._notify("textDocument/didClose", { textDocument: { uri: uri } }).catch(function () {
            // ignorable: if the close never arrived the server is usually gone/restarting anyway,
            // and (re)start resyncs documents from scratch
        });
    };

    function _positionOf(cursorPos) {
        return { line: cursorPos.line, character: cursorPos.ch };
    }

    // Describe the completion "context" at a position:
    //  - key: identifies the word being typed - file, line, and the text on the line before the
    //    column where that word starts. Stays constant while typing/moving within one word.
    //  - query: the part of the word already typed before the cursor.
    //  - anchored: whether the word start sits directly after a trigger-ish non-space character
    //    (".", "->", "::") rather than after whitespace/line start.
    function _completionContext(filePath, pos) {
        const doc = DocumentManager.getOpenDocumentForPath(filePath);
        if (!doc) {
            return null;
        }
        const lineText = doc.getLine(pos.line) || "";
        let start = pos.ch;
        while (start > 0 && /[\w$]/.test(lineText.charAt(start - 1))) {
            start--;
        }
        return {
            key: filePath + "|" + pos.line + "|" + lineText.substring(0, start),
            query: lineText.substring(start, pos.ch),
            anchored: start > 0 && /\S/.test(lineText.charAt(start - 1))
        };
    }

    LanguageClient.prototype.requestHints = function (params) {
        const self = this;
        const deferred = $.Deferred();
        (async function () {
            try {
                // Reuse the cached completion list while typing forward within one word, so every
                // keystroke doesn't re-hit the server. Reuse is only sound when the cached list is
                // a candidate SUPERSET of what the current query would return, so it needs ALL of:
                //  - the same context key (same file/line/word-start),
                //  - the current query extending the query the list was fetched with, and
                //  - that fetched query being non-empty OR anchored to a trigger char: a member
                //    list after "." / "->" is a closed set, but what a server answers at a BARE
                //    position is an arbitrary relevance selection, NOT a superset. intelephense
                //    answers a blank line with a grab-bag of symbols (marked complete!) which,
                //    if reused, swallows every later keystroke on that line (e.g. typing is_int
                //    showed no is_int because a stale blank-line list was being refiltered).
                const ctx = _completionContext(params.filePath, params.cursorPos);
                const cached = self._completionCache;
                if (ctx && cached && cached.key === ctx.key &&
                        ctx.query.startsWith(cached.query) &&
                        (cached.query || cached.anchored)) {
                    deferred.resolve({ items: cached.items });
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
                // Only cache a complete, NON-EMPTY list (an incomplete one must be re-queried as
                // the user types; an empty one has nothing to refilter - and some servers answer
                // empty at a bare position yet answer fully once a prefix exists). The fetched
                // query + anchoring are stored so the reuse check above can prove superset-ness.
                self._completionCache = (ctx && !isIncomplete && items.length)
                    ? { key: ctx.key, query: ctx.query, anchored: ctx.anchored, items: items }
                    : null;
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
                        // Full signature string (e.g. "getTableIndexes(tableName: any): Promise<…>") -
                        // the provider derives the function name from it for the parameter-hint popup.
                        label: sig.label,
                        documentation: _markupToString(sig.documentation) || sig.label,
                        parameters: (sig.parameters || []).map(function (p) {
                            return {
                                label: _paramLabel(sig.label, p.label),
                                documentation: _markupToString(p.documentation)
                            };
                        })
                    };
                });
                deferred.resolve({
                    signatures: signatures,
                    activeSignature: result.activeSignature,
                    activeParameter: result.activeParameter
                });
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

    /**
     * Quickfix code actions for the given range's diagnostics (LSP textDocument/codeAction).
     * Server-agnostic: gated on the server's codeActionProvider capability (boolean or object).
     * @param {{filePath:string, range:Object, diagnostics:Array<Object>}} params - `range` is an LSP
     *      range ({start:{line,character}, end:{...}}) and `diagnostics` the raw LSP diagnostics to
     *      pass as context (servers key their fixes off these).
     * @return {jQuery.Promise} resolves the server's (CodeAction|Command)[] or []
     */
    LanguageClient.prototype.requestCodeActions = function (params) {
        const self = this;
        const deferred = $.Deferred();
        if (!this.capabilities || !this.capabilities.codeActionProvider) {
            return deferred.resolve([]).promise(); // server offers no code actions
        }
        (async function () {
            try {
                await DocumentSync.flush(self, params.filePath);
                const result = await self._request("textDocument/codeAction", {
                    textDocument: { uri: self.uriForPath(params.filePath) },
                    range: params.range,
                    context: {
                        diagnostics: params.diagnostics || [],
                        only: ["quickfix"]
                    }
                });
                deferred.resolve(Array.isArray(result) ? result : []);
            } catch (err) {
                console.warn("[LSP] request failed:", err && (err.message || err));
                deferred.reject(err);
            }
        }());
        return deferred.promise();
    };

    /**
     * Fill in a CodeAction's deferred properties (typically `edit`) via codeAction/resolve. We don't
     * advertise resolveSupport, so conformant servers inline edits and this is never needed - it
     * exists for servers that defer anyway, gated on their codeActionProvider.resolveProvider.
     * Mirrors resolveCompletion: always resolves, falling back to the unresolved action.
     * @param {Object} action - the CodeAction as returned by requestCodeActions
     * @return {jQuery.Promise}
     */
    LanguageClient.prototype.resolveCodeAction = function (action) {
        const deferred = $.Deferred();
        const provider = this.capabilities && this.capabilities.codeActionProvider;
        if (!provider || !provider.resolveProvider) {
            return deferred.resolve(action).promise();
        }
        this._request("codeAction/resolve", action).then(function (resolved) {
            deferred.resolve(resolved || action);
        }, function () {
            deferred.resolve(action);
        });
        return deferred.promise();
    };

    // ------------------------------------------------------------------------------------------
    // Server lifecycle + provider registration
    // ------------------------------------------------------------------------------------------

    function _projectRootPath() {
        const root = ProjectManager.getProjectRoot();
        return root ? root.fullPath : null;
    }

    function _clientCapabilities(config) {
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
                        // Off by default: our hint insertion is plain text. A server config can opt
                        // in (completionSnippetSupport) when the server refuses to offer completion
                        // without it - vscode-json-language-server does - and the CodeHintsProvider
                        // strips snippet placeholders on insert for such items.
                        snippetSupport: !!(config && config.completionSnippetSupport),
                        documentationFormat: ["markdown", "plaintext"],
                        // LSP 3.16: servers only lazily fill (via completionItem/resolve) the
                        // properties the client declares here - intelephense returns empty
                        // completion docs without it. We resolve the highlighted item for the
                        // docs popup, so declare exactly what that popup consumes.
                        resolveSupport: { properties: ["documentation", "detail"] },
                        // We render labelDetails.detail/description (e.g. the source module of an
                        // auto-import) so otherwise-identical labels are distinguishable - see the
                        // CodeHintsProvider renderer.
                        labelDetailsSupport: true
                    }
                },
                hover: { dynamicRegistration: false, contentFormat: ["markdown", "plaintext"] },
                signatureHelp: {
                    dynamicRegistration: false,
                    signatureInformation: { documentationFormat: ["markdown", "plaintext"] }
                },
                definition: { dynamicRegistration: false },
                references: { dynamicRegistration: false },
                publishDiagnostics: { relatedInformation: false },
                codeAction: {
                    dynamicRegistration: false,
                    // Literal CodeAction support (title/kind/edit) - without this servers degrade to
                    // bare Commands, which carry no WorkspaceEdit we could apply. resolveSupport is
                    // deliberately NOT advertised: conformant servers then inline `edit` in the
                    // codeAction response, sparing a codeAction/resolve round-trip per fix.
                    codeActionLiteralSupport: {
                        codeActionKind: { valueSet: ["quickfix"] }
                    }
                }
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
        // Remember the active workspace folder so a later project switch can hand the server the
        // delta (removed old, added new) via workspace/didChangeWorkspaceFolders - see
        // changeWorkspaceRoot - instead of a full restart.
        client.rootUri = rootUri;
        client.rootName = rootName;

        await conn.execPeer("startServer", {
            serverId: client.serverId,
            command: config.command,
            args: config.args || ["--stdio"],
            rootUri: rootUri,
            workspaceConfiguration: config.workspaceConfiguration,
            suppressStderrPattern: config.suppressStderrPattern
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
                capabilities: _clientCapabilities(config),
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
        // The quickfix layer requests textDocument/codeAction through this client (capability-gated
        // inside requestCodeActions), keeping the provider itself transport-agnostic.
        client.lintingProvider._quickFixClient = client;
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
     * Announce that `client`'s server has (re)started and is now serving its languages: notify
     * listeners (EVENT_LANGUAGE_SERVER_STARTED) and re-run inspection so any linter that defers to a
     * language server (e.g. JSHint -> the TS service) drops its now-redundant results - even on a
     * clean file, where the server's empty publishDiagnostics wouldn't trigger a re-run. Called from
     * every path that brings a server up: initial registration, restart, and crash auto-restart.
     */
    function _announceServerStarted(client) {
        exports.trigger(EVENT_LANGUAGE_SERVER_STARTED, {
            serverId: client.serverId,
            languages: client.languages
        });
        CodeInspection.requestRun();
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
     * @param {function(string):boolean} [config.documentFilter] - per-file opt-out: given a file's
     *        full path, return false to make this server decline the file even though its language
     *        matches (e.g. the JSON server yields Phoenix pref files to PrefsCodeHints).
     * @param {boolean} [config.completionSnippetSupport] - advertise snippet support in the client
     *        completion capability. Only for servers that refuse to offer completion without it
     *        (vscode-json-language-server); snippet placeholders are stripped on insert.
     * @param {Object} [config.workspaceConfiguration] - settings tree served node-side to the
     *        server's workspace/configuration pulls, sections resolved by dotted path (e.g.
     *        pyrefly pulls section "python" despite our capabilities saying we have none, and
     *        treats the default null answer as "all diagnostics off").
     * @param {function(Array):Array} [config.filterDiagnostics] - server-specific post-filter for
     *        published diagnostics
     * @param {string} [config.suppressStderrPattern] - regex source (string, not RegExp - it
     *        crosses the node connector); stderr lines matching it are dropped from the live
     *        console log. Opt in for servers that narrate every request on stderr (pyrefly uses
     *        "^\\s*INFO\\b"); the full stderr is still kept node-side for crash reports.
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
            _announceServerStarted(client);
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

    /**
     * Re-point a running server at the current project root WITHOUT restarting it, by sending
     * `workspace/didChangeWorkspaceFolders` (remove the old folder, add the new one). This avoids
     * the cold start a full restart pays on every project switch. Generic: servers that don't
     * advertise live workspace-folder change support transparently fall back to a full restart.
     * The open documents themselves are re-synced by DocumentSync's normal editor-change handling.
     * @param {string} serverId
     * @return {Promise<void>}
     */
    async function changeWorkspaceRoot(serverId) {
        const client = clients.get(serverId);
        if (!client) {
            return;
        }
        // Resolve the target root FIRST: a redundant call for the same root must be a cheap no-op and
        // must never restart (this can be called often - e.g. once per editor switch). This check has
        // to precede the restart fallbacks below, or a same-root call to a server that lacks live
        // workspace-folder support would pointlessly recycle the process.
        const newVfsPath = (client.config.rootUriProvider && client.config.rootUriProvider()) || _projectRootPath();
        const newUri = newVfsPath ? pathToServerUri(newVfsPath) : null;
        const oldUri = client.rootUri || null;
        if (newUri === oldUri) {
            return; // same workspace - nothing to do
        }
        // Not up yet (e.g. the project switched before init finished) - a (re)start picks up the
        // current root on its own.
        if (!client.capabilities) {
            return restartLanguageServer(serverId);
        }
        const wf = client.capabilities.workspace && client.capabilities.workspace.workspaceFolders;
        // Per the LSP spec changeNotifications is `boolean | string` (a static flag or a dynamic
        // registration id); either truthy form means the server accepts live folder changes.
        const supportsLiveChange = !!(wf && wf.supported && wf.changeNotifications);
        if (!supportsLiveChange) {
            return restartLanguageServer(serverId);
        }
        const conn = await getConnector();
        const added = newUri ? [{ uri: newUri, name: FileUtils.getBaseName(newVfsPath) }] : [];
        const removed = oldUri ? [{ uri: oldUri, name: client.rootName || FileUtils.getBaseName(oldUri) }] : [];
        await conn.execPeer("sendNotification", {
            serverId: serverId,
            method: "workspace/didChangeWorkspaceFolders",
            params: { event: { added: added, removed: removed } }
        });
        client.rootUri = newUri;
        client.rootName = newVfsPath ? FileUtils.getBaseName(newVfsPath) : null;
        // Capabilities are unchanged (no restart), but the active file is now in the new project -
        // refresh the find-references menu state for that context.
        FindReferencesManager.setMenuItemStateForLanguage();
    }

    async function restartLanguageServer(serverId) {
        const client = clients.get(serverId);
        if (!client) {
            return;
        }
        await stopServerProcess(client);
        try {
            await _startAndInit(client);
            _announceServerStarted(client);
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
        exports.trigger(EVENT_LANGUAGE_SERVER_STOPPED, {
            serverId: client.serverId,
            languages: client.languages
        });
    }

    /**
     * Whether a successfully-initialised language server is currently providing diagnostics
     * (linting) for the given Phoenix language id. Gated on `capabilities` - which is only set
     * after a successful `initialize` - so a server that failed to start does not suppress a
     * fallback linter (e.g. JSHint). Returns false in the browser, where no servers are registered.
     *
     * @param {string} languageId - Phoenix language id (e.g. "javascript")
     * @return {boolean}
     */
    function isLintingProviderActive(languageId) {
        for (const client of clients.values()) {
            if (client.lintingProvider && client.capabilities && client.languages &&
                    client.languages.indexOf(languageId) !== -1) {
                return true;
            }
        }
        return false;
    }

    exports.registerLanguageServer = registerLanguageServer;
    exports.restartLanguageServer = restartLanguageServer;
    exports.changeWorkspaceRoot = changeWorkspaceRoot;
    exports.pathToServerUri = pathToServerUri;
    exports.serverUriToVfsUri = serverUriToVfsUri;
    exports.isLintingProviderActive = isLintingProviderActive;
    exports.EVENT_LANGUAGE_SERVER_STARTED = EVENT_LANGUAGE_SERVER_STARTED;
    exports.EVENT_LANGUAGE_SERVER_STOPPED = EVENT_LANGUAGE_SERVER_STOPPED;
});
