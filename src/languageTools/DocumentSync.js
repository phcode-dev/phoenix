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
 * `didChange` is debounced and sends the full document text (simple and correct; incremental
 * sync can be added later). Before any feature request, `flush()` sends the latest pending
 * change synchronously so the server's view matches the cursor.
 *
 * @module languageTools/DocumentSync
 */
define(function (require, exports, module) {


    const DocumentManager = require("document/DocumentManager"),
        EditorManager = require("editor/EditorManager");

    const CHANGE_DEBOUNCE_MS = 400;

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
        const state = { client: client, version: 1, open: true, pendingTimer: null, lastSentText: text };
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
        state.version += 1;
        state.lastSentText = text;
        client.notifyDidChange(client.uriForPath(vfsPath), state.version, text);
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

    function _onDocumentChange(event, doc) {
        const client = _clientForDoc(doc);
        if (!client) {
            return;
        }
        const state = tracked.get(doc.file.fullPath);
        if (!state || !state.open) {
            _open(client, doc);
            return;
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
        DocumentManager.getAllOpenDocuments().forEach(function (doc) {
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
