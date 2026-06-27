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
 * DocumentSync - drives LSP textDocument lifecycle (didOpen / didChange / didClose) from
 * Phoenix document events.
 *
 * Open/close are ref-counted for free: Phoenix creates a `Document` on first reference and
 * disposes it (firing `beforeDocumentDelete`) only when the last editor/working-set reference
 * is gone, so a file open in multiple panes is opened once and closed once.
 *
 * `didChange` is debounced. When the server advertises incremental sync, the edits made during
 * the debounce window are accumulated and sent as ordered LSP range edits (so a keystroke ships a
 * tiny payload instead of the whole file); otherwise it falls back to sending the full document
 * text. Any change record that can't be mapped to a range forces a one-off full resync for safety.
 * Before any feature request, `flush()` sends the latest pending change synchronously so the
 * server's view matches the cursor.
 *
 * @module languageTools/DocumentSync
 */
define(function (require, exports, module) {


    const DocumentManager = require("document/DocumentManager"),
        EditorManager = require("editor/EditorManager");

    const CHANGE_DEBOUNCE_MS = 400;

    // LSP TextDocumentSyncKind values we care about.
    const SYNC_FULL = 1,
        SYNC_INCREMENTAL = 2;

    // The sync mode the server asked for. `textDocumentSync` is either a number or an object with a
    // `change` field; anything that isn't explicitly Incremental is treated as full sync (the safe,
    // always-correct default - e.g. a server that omits the capability).
    function _syncKind(client) {
        const tds = client && client.capabilities && client.capabilities.textDocumentSync;
        if (tds === undefined || tds === null) {
            return SYNC_FULL;
        }
        const kind = (typeof tds === "object") ? tds.change : tds;
        return (kind === SYNC_INCREMENTAL) ? SYNC_INCREMENTAL : SYNC_FULL;
    }

    // Map a Phoenix/CodeMirror change list to LSP incremental contentChanges. CodeMirror delivers the
    // batch in order, each record's {from,to} already relative to the text after the previous records
    // applied - which is exactly how LSP replays contentChanges - so a straight 1:1 map is correct.
    // Returns null if any record can't be mapped, signalling the caller to fall back to a full resync.
    function _toIncrementalChanges(changeList) {
        if (!changeList || !changeList.length) {
            return null;
        }
        const changes = [];
        for (let i = 0; i < changeList.length; i++) {
            const c = changeList[i];
            if (!c || !c.from || !c.to || !c.text) {
                return null;
            }
            changes.push({
                range: {
                    start: { line: c.from.line, character: c.from.ch },
                    end: { line: c.to.line, character: c.to.ch }
                },
                text: c.text.join("\n")
            });
        }
        return changes;
    }

    let initialized = false;
    const registeredClients = [];     // LanguageClient[]
    const tracked = new Map();        // vfsPath -> { client, version, open, pendingTimer }

    function _isSupported(client, doc) {
        if (!client || !client.capabilities || !doc) {
            return false;
        }
        if (doc.isUntitled && doc.isUntitled()) {
            return false;
        }
        return client.languages.indexOf(doc.getLanguage().getId()) !== -1;
    }

    function _clientForDoc(doc) {
        for (let i = 0; i < registeredClients.length; i++) {
            if (_isSupported(registeredClients[i], doc)) {
                return registeredClients[i];
            }
        }
        return null;
    }

    function _lspLanguageId(client, doc) {
        const langId = doc.getLanguage().getId();
        const map = client.config && client.config.languageIdMap;
        return (map && map[langId]) || langId;
    }

    function _open(client, doc) {
        const vfsPath = doc.file.fullPath;
        const text = doc.getText();
        const state = {
            client: client, version: 1, open: true, pendingTimer: null, lastSentText: text,
            pendingChanges: [],  // accumulated LSP incremental edits since the last send
            fullResync: false    // set when an unmappable change forces a full-text send
        };
        tracked.set(vfsPath, state);
        client.notifyDidOpen(client.uriForPath(vfsPath), _lspLanguageId(client, doc), state.version, text);
    }

    function _change(client, doc) {
        const vfsPath = doc.file.fullPath;
        const state = tracked.get(vfsPath);
        if (!state || !state.open) {
            _open(client, doc);
            return;
        }
        const text = doc.getText();
        let contentChanges;
        if (!state.fullResync && _syncKind(client) === SYNC_INCREMENTAL && state.pendingChanges.length) {
            contentChanges = state.pendingChanges; // tiny per-edit payloads
        } else {
            contentChanges = [{ text: text }];     // full-document sync (default, or safety fallback)
        }
        state.version += 1;
        state.lastSentText = text;
        state.pendingChanges = [];
        state.fullResync = false;
        client.notifyDidChange(client.uriForPath(vfsPath), state.version, contentChanges);
    }

    function _close(doc) {
        const vfsPath = doc.file.fullPath;
        const state = tracked.get(vfsPath);
        if (!state) {
            return;
        }
        if (state.pendingTimer) {
            clearTimeout(state.pendingTimer);
        }
        state.client.notifyDidClose(state.client.uriForPath(vfsPath));
        tracked.delete(vfsPath);
    }

    function _onDocumentChange(event, doc, changeList) {
        const client = _clientForDoc(doc);
        if (!client) {
            return;
        }
        const state = tracked.get(doc.file.fullPath);
        if (!state || !state.open) {
            _open(client, doc);
            return;
        }
        // Accumulate the edits so the debounced send (or a flush() before a feature request) can
        // replay them as incremental ranges. If the server wants full sync, or a record can't be
        // mapped, fall back to a full-text resync for this cycle.
        if (!state.fullResync && _syncKind(client) === SYNC_INCREMENTAL) {
            const mapped = _toIncrementalChanges(changeList);
            if (mapped) {
                for (let i = 0; i < mapped.length; i++) {
                    state.pendingChanges.push(mapped[i]);
                }
            } else {
                state.fullResync = true;
                state.pendingChanges = [];
            }
        }
        if (state.pendingTimer) {
            clearTimeout(state.pendingTimer);
        }
        state.pendingTimer = setTimeout(function () {
            state.pendingTimer = null;
            _change(client, doc);
        }, CHANGE_DEBOUNCE_MS);
    }

    function _onAfterDocumentCreate(event, doc) {
        const client = _clientForDoc(doc);
        if (client && !tracked.has(doc.file.fullPath)) {
            _open(client, doc);
        }
    }

    function _onBeforeDocumentDelete(event, doc) {
        _close(doc);
    }

    function _onDocumentRefreshed(event, doc) {
        if (!tracked.has(doc.file.fullPath)) {
            return;
        }
        // Treat a refresh-from-disk as close + reopen so the server resyncs from a version 1.
        _close(doc);
        const client = _clientForDoc(doc);
        if (client) {
            _open(client, doc);
        }
    }

    function _onActiveEditorChange(event, current) {
        // Safety net: guarantee the document the user is actually looking at is synced, even if its
        // afterDocumentCreate happened while the server was (re)starting (e.g. session-restored
        // files on a project switch).
        if (!current || !current.document) {
            return;
        }
        const doc = current.document;
        const client = _clientForDoc(doc);
        const state = tracked.get(doc.file.fullPath);
        if (client && (!state || !state.open)) {
            _open(client, doc);
        }
    }

    /**
     * Attach the document lifecycle listeners. Safe to call multiple times.
     */
    function init() {
        if (initialized) {
            return;
        }
        initialized = true;
        DocumentManager.on(DocumentManager.EVENT_DOCUMENT_CHANGE, _onDocumentChange);
        DocumentManager.on(DocumentManager.EVENT_AFTER_DOCUMENT_CREATE, _onAfterDocumentCreate);
        DocumentManager.on(DocumentManager.EVENT_BEFORE_DOCUMENT_DELETE, _onBeforeDocumentDelete);
        DocumentManager.on(DocumentManager.EVENT_DOCUMENT_REFRESHED, _onDocumentRefreshed);
        EditorManager.on("activeEditorChange", _onActiveEditorChange);
    }

    /**
     * Register a client so its languages participate in document sync.
     * @param {Object} client - a LanguageClient
     */
    function registerClient(client) {
        if (registeredClients.indexOf(client) === -1) {
            registeredClients.push(client);
        }
    }

    /**
     * Send didOpen for any already-open documents that this client supports. Used when a server
     * starts (or restarts) after documents are already open.
     * @param {Object} client - a LanguageClient
     */
    function openSupportedDocuments(client) {
        const docs = DocumentManager.getAllOpenDocuments().slice();
        // Belt-and-suspenders: the file the user is actually looking at - e.g. a session-restored
        // document at app start - may not yet appear in getAllOpenDocuments() at the moment the
        // server finishes starting. Include the active editor's document explicitly so it is synced
        // immediately, instead of only after the next file switch (which is what triggered the
        // activeEditorChange safety net before).
        const activeEditor = EditorManager.getActiveEditor();
        if (activeEditor && activeEditor.document && docs.indexOf(activeEditor.document) === -1) {
            docs.push(activeEditor.document);
        }
        docs.forEach(function (doc) {
            if (_isSupported(client, doc)) {
                // Always (re)send didOpen with the current content. This is called right after a
                // server (re)start, so any prior tracking is stale and must not be trusted - e.g.
                // a didOpen that failed during a restart's down-window would otherwise leave the
                // file marked "open" but absent from the new server.
                _open(client, doc);
            }
        });
    }

    /**
     * Ensure the server has the latest content for a file before a feature request: opens the
     * document if needed and flushes any pending debounced change immediately.
     * @param {Object} client - a LanguageClient
     * @param {string} vfsPath - the document's VFS path
     * @return {Promise<void>}
     */
    function flush(client, vfsPath) {
        return new Promise(function (resolve) {
            const doc = DocumentManager.getOpenDocumentForPath(vfsPath);
            if (!doc) {
                resolve();
                return;
            }
            const state = tracked.get(vfsPath);
            if (!state || !state.open) {
                _open(client, doc);
            } else {
                // Always clear any pending debounce and send if the document text differs from what
                // the server last received. Gating on `pendingTimer` alone is racy: EVENT_DOCUMENT_CHANGE
                // has multiple listeners and the feature request (e.g. completion on ".") can reach
                // flush() before _onDocumentChange has set the timer, leaving the server a keystroke
                // behind - so a member completion ("console.") would be answered against stale text
                // ("console") and return globals.
                if (state.pendingTimer) {
                    clearTimeout(state.pendingTimer);
                    state.pendingTimer = null;
                }
                if (doc.getText() !== state.lastSentText) {
                    _change(client, doc);
                }
            }
            resolve();
        });
    }

    /**
     * Forget all documents tracked for a client (used when its server stops/restarts). Does not
     * send didClose since the server is going away.
     * @param {Object} client - a LanguageClient
     */
    function clearServer(client) {
        tracked.forEach(function (state, vfsPath) {
            if (state.client === client) {
                if (state.pendingTimer) {
                    clearTimeout(state.pendingTimer);
                }
                tracked.delete(vfsPath);
            }
        });
    }

    exports.init = init;
    exports.registerClient = registerClient;
    exports.openSupportedDocuments = openSupportedDocuments;
    exports.flush = flush;
    exports.clearServer = clearServer;
});
