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
 * DocumentHighlight - highlights every occurrence of the symbol under the cursor in the active
 * editor, via the LSP `textDocument/documentHighlight` request. This is the generic, multi-language
 * replacement for the Tern-only "highlight references under cursor" feature
 * (extensions/default/JavaScriptRefactoring/HighLightReferences.js).
 *
 * It works for any registered language server that advertises `documentHighlightProvider`. Marks
 * reuse the same visual style as the legacy feature (Editor.getMarkOptionMatchingRefs()).
 *
 * @module languageTools/DocumentHighlight
 */
define(function (require, exports, module) {


    const EditorManager = require("editor/EditorManager"),
        Editor = require("editor/Editor").Editor;

    const HIGHLIGHT_MARKER = "lsp-document-highlight";
    const REQUEST_DEBOUNCE_MS = 150;

    // Token types we never highlight on (comments/strings/numbers aren't symbols).
    const SKIP_TOKEN_TYPES = ["comment", "string", "number"];

    let initialized = false;
    const registeredClients = [];   // LanguageClient[]
    let lastTokenKey = null;
    let debounceTimer = null;
    let requestSeq = 0;

    function _clientForEditor(editor) {
        if (!editor) {
            return null;
        }
        const langId = editor.document.getLanguage().getId();
        for (let i = 0; i < registeredClients.length; i++) {
            const c = registeredClients[i];
            if (c.capabilities && c.capabilities.documentHighlightProvider &&
                    c.languages.indexOf(langId) !== -1) {
                return c;
            }
        }
        return null;
    }

    function _hasSingleCursor(editor) {
        const selections = editor.getSelections();
        if (selections.length > 1) {
            return false; // multi-cursor: don't highlight
        }
        const start = selections[0].start, end = selections[0].end;
        return start.line === end.line && start.ch === end.ch; // a caret, not a range
    }

    function _cursorActivity(_evt, editor) {
        const client = _clientForEditor(editor);
        if (!client) {
            return;
        }
        if (!_hasSingleCursor(editor)) {
            editor.clearAllMarks(HIGHLIGHT_MARKER);
            lastTokenKey = null;
            return;
        }

        const pos = editor.getCursorPos();
        const token = editor.getToken(pos);
        const tokenKey = pos.line + ":" + (token ? token.start + ":" + token.string : pos.ch);
        if (tokenKey === lastTokenKey) {
            return; // still on the same token - keep existing marks
        }

        editor.clearAllMarks(HIGHLIGHT_MARKER);
        lastTokenKey = tokenKey;

        if (!token || !token.string || !/[\w$]/.test(token.string) ||
                (token.type && SKIP_TOKEN_TYPES.indexOf(token.type) !== -1)) {
            return;
        }

        if (debounceTimer) {
            clearTimeout(debounceTimer);
        }
        const seq = ++requestSeq;
        debounceTimer = setTimeout(function () {
            debounceTimer = null;
            client.documentHighlight({ filePath: editor.document.file._path, cursorPos: pos })
                .done(function (highlights) {
                    // Ignore stale responses (cursor moved / another request issued / editor changed).
                    if (seq !== requestSeq || EditorManager.getActiveEditor() !== editor) {
                        return;
                    }
                    if (!highlights || !highlights.length) {
                        return;
                    }
                    editor.operation(function () {
                        highlights.forEach(function (h) {
                            if (!h || !h.range) {
                                return;
                            }
                            editor.markText(HIGHLIGHT_MARKER,
                                { line: h.range.start.line, ch: h.range.start.character },
                                { line: h.range.end.line, ch: h.range.end.character },
                                Editor.getMarkOptionMatchingRefs());
                        });
                    });
                })
                .fail(function () { /* no highlights for this position */ });
        }, REQUEST_DEBOUNCE_MS);
    }

    function _activeEditorChanged(evt, current, previous) {
        if (previous) {
            previous.off("cursorActivity.lspHighlight");
        }
        if (current) {
            current.off("cursorActivity.lspHighlight");
            current.on("cursorActivity.lspHighlight", _cursorActivity);
            lastTokenKey = null;
            _cursorActivity(evt, current);
        }
    }

    /**
     * Attach the active-editor / cursor listeners. Safe to call multiple times.
     */
    function init() {
        if (initialized) {
            return;
        }
        initialized = true;
        EditorManager.on("activeEditorChange", _activeEditorChanged);
        const editor = EditorManager.getActiveEditor();
        if (editor) {
            _activeEditorChanged(null, editor, null);
        }
    }

    /**
     * Register a client so its languages get cursor-based occurrence highlighting.
     * @param {Object} client - a LanguageClient
     */
    function registerClient(client) {
        if (registeredClients.indexOf(client) === -1) {
            registeredClients.push(client);
        }
        // Re-evaluate the current editor now that a new server is available.
        const editor = EditorManager.getActiveEditor();
        if (editor) {
            lastTokenKey = null;
            _cursorActivity(null, editor);
        }
    }

    exports.init = init;
    exports.registerClient = registerClient;
    exports.HIGHLIGHT_MARKER = HIGHLIGHT_MARKER;
});
