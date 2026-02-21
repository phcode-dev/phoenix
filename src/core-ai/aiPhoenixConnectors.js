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
 * NodeConnector handlers for bridging the node-side Claude Code agent with
 * the Phoenix browser runtime. Handles editor state queries, screenshot
 * capture, file content reads, and edit application to document buffers.
 *
 * Called via execPeer from src-node/claude-code-agent.js and
 * src-node/mcp-editor-tools.js.
 */
define(function (require, exports, module) {

    const DocumentManager  = require("document/DocumentManager"),
        CommandManager   = require("command/CommandManager"),
        Commands         = require("command/Commands"),
        MainViewManager  = require("view/MainViewManager"),
        EditorManager    = require("editor/EditorManager"),
        FileSystem       = require("filesystem/FileSystem"),
        LiveDevProtocol  = require("LiveDevelopment/MultiBrowserImpl/protocol/LiveDevProtocol"),
        LiveDevMain      = require("LiveDevelopment/main"),
        WorkspaceManager = require("view/WorkspaceManager"),
        SnapshotStore    = require("core-ai/AISnapshotStore"),
        EventDispatcher  = require("utils/EventDispatcher"),
        Strings          = require("strings");

    // filePath → previous content before edit, for undo/snapshot support
    const _previousContentMap = {};

    // Last screenshot base64 data, for displaying in tool indicators
    let _lastScreenshotBase64 = null;

    // --- Editor state ---

    /**
     * Get the current editor state: active file, working set, live preview file.
     * Called from the node-side MCP server via execPeer.
     */
    function getEditorState() {
        const activeFile = MainViewManager.getCurrentlyViewedFile(MainViewManager.ACTIVE_PANE);
        const workingSet = MainViewManager.getWorkingSet(MainViewManager.ALL_PANES);

        let activeFilePath = null;
        if (activeFile) {
            activeFilePath = activeFile.fullPath;
            if (activeFilePath.startsWith("/tauri/")) {
                activeFilePath = activeFilePath.replace("/tauri", "");
            }
        }

        const workingSetPaths = workingSet.map(function (file) {
            let p = file.fullPath;
            if (p.startsWith("/tauri/")) {
                p = p.replace("/tauri", "");
            }
            return p;
        });

        let livePreviewFile = null;
        const $panelTitle = $("#panel-live-preview-title");
        if ($panelTitle.length) {
            livePreviewFile = $panelTitle.attr("data-fullPath") || null;
            if (livePreviewFile && livePreviewFile.startsWith("/tauri/")) {
                livePreviewFile = livePreviewFile.replace("/tauri", "");
            }
        }

        const result = {
            activeFile: activeFilePath,
            workingSet: workingSetPaths,
            livePreviewFile: livePreviewFile
        };

        // Include cursor/selection info from the active editor
        const editor = EditorManager.getActiveEditor();
        if (editor) {
            const doc = editor.document;
            const totalLines = doc.getLine(doc.getText().split("\n").length - 1) !== undefined
                ? doc.getText().split("\n").length : 0;

            if (editor.hasSelection()) {
                const sel = editor.getSelection();
                let selectedText = editor.getSelectedText();
                if (selectedText.length > 10000) {
                    selectedText = selectedText.slice(0, 10000) + "...(truncated, use Read tool for full content)";
                }
                result.cursorInfo = {
                    hasSelection: true,
                    startLine: sel.start.line + 1,
                    endLine: sel.end.line + 1,
                    selectedText: selectedText,
                    totalLines: totalLines
                };
            } else {
                const cursor = editor.getCursorPos();
                const lineNum = cursor.line;
                const lineText = doc.getLine(lineNum) || "";
                // Include a few surrounding lines for context
                const contextStart = Math.max(0, lineNum - 2);
                const contextEnd = Math.min(totalLines - 1, lineNum + 2);
                const MAX_LINE_LEN = 200;
                const contextLines = [];
                for (let i = contextStart; i <= contextEnd; i++) {
                    const prefix = (i === lineNum) ? "> " : "  ";
                    let text = doc.getLine(i) || "";
                    if (text.length > MAX_LINE_LEN) {
                        text = text.slice(0, MAX_LINE_LEN) + "...";
                    }
                    contextLines.push(prefix + (i + 1) + ": " + text);
                }
                const trimmedLineText = lineText.length > MAX_LINE_LEN
                    ? lineText.slice(0, MAX_LINE_LEN) + "..." : lineText;
                result.cursorInfo = {
                    hasSelection: false,
                    line: lineNum + 1,
                    column: cursor.ch + 1,
                    lineText: trimmedLineText,
                    context: contextLines.join("\n"),
                    totalLines: totalLines
                };
            }
        }

        return result;
    }

    // --- Screenshot ---

    /**
     * Take a screenshot of the Phoenix editor window.
     * Called from the node-side MCP server via execPeer.
     * @param {Object} params - { selector?: string }
     * @return {{ base64: string|null, error?: string }}
     */
    function takeScreenshot(params) {
        const deferred = new $.Deferred();
        if (!Phoenix || !Phoenix.app || !Phoenix.app.screenShotBinary) {
            deferred.resolve({ base64: null, error: "Screenshot API not available" });
            return deferred.promise();
        }
        Phoenix.app.screenShotBinary(params.selector || undefined)
            .then(function (bytes) {
                let binary = "";
                const chunkSize = 8192;
                for (let i = 0; i < bytes.length; i += chunkSize) {
                    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
                    binary += String.fromCharCode.apply(null, chunk);
                }
                const base64 = btoa(binary);
                _lastScreenshotBase64 = base64;
                exports.trigger("screenshotCaptured", base64);
                deferred.resolve({ base64: base64 });
            })
            .catch(function (err) {
                deferred.resolve({ base64: null, error: err.message || String(err) });
            });
        return deferred.promise();
    }

    // --- File content ---

    /**
     * Check if a file has unsaved changes in the editor and return its content.
     * Used by the node-side Read hook to serve dirty buffer content to Claude.
     */
    function getFileContent(params) {
        const vfsPath = SnapshotStore.realToVfsPath(params.filePath);
        const doc = DocumentManager.getOpenDocumentForPath(vfsPath);
        if (doc && doc.isDirty) {
            return { isDirty: true, content: doc.getText() };
        }
        return { isDirty: false, content: null };
    }

    // --- Edit application ---

    /**
     * Apply a single edit to a document buffer and save to disk.
     * Called immediately when Claude's Write/Edit is intercepted, so
     * subsequent Reads see the new content both in the buffer and on disk.
     * @param {Object} edit - {file, oldText, newText}
     * @return {$.Promise} resolves with {previousContent} for undo support
     */
    function _applySingleEdit(edit) {
        const result = new $.Deferred();
        const vfsPath = SnapshotStore.realToVfsPath(edit.file);

        function _applyToDoc() {
            DocumentManager.getDocumentForPath(vfsPath)
                .done(function (doc) {
                    try {
                        const previousContent = doc.getText();
                        if (edit.oldText === null) {
                            // Write (new file or full replacement)
                            doc.setText(edit.newText);
                        } else {
                            // Edit — find oldText and replace
                            const docText = doc.getText();
                            const idx = docText.indexOf(edit.oldText);
                            if (idx === -1) {
                                result.reject(new Error(Strings.AI_CHAT_EDIT_NOT_FOUND));
                                return;
                            }
                            const startPos = doc.posFromIndex(idx);
                            const endPos = doc.posFromIndex(idx + edit.oldText.length);
                            doc.replaceRange(edit.newText, startPos, endPos);
                        }
                        // Open the file in the editor and save to disk
                        CommandManager.execute(Commands.CMD_OPEN, { fullPath: vfsPath });
                        SnapshotStore.saveDocToDisk(doc).always(function () {
                            result.resolve({ previousContent: previousContent });
                        });
                    } catch (err) {
                        result.reject(err);
                    }
                })
                .fail(function (err) {
                    result.reject(err || new Error("Could not open document"));
                });
        }

        if (edit.oldText === null) {
            // Write — file may not exist yet. Only create on disk if it doesn't
            // already exist, to avoid triggering "external change" warnings.
            const file = FileSystem.getFileForPath(vfsPath);
            file.exists(function (existErr, exists) {
                if (exists) {
                    // File exists — just open and set content, no disk write
                    _applyToDoc();
                } else {
                    // New file — create on disk first so getDocumentForPath works
                    file.write("", function (writeErr) {
                        if (writeErr) {
                            result.reject(new Error("Could not create file: " + writeErr));
                            return;
                        }
                        _applyToDoc();
                    });
                }
            });
        } else {
            // Edit — file must already exist
            _applyToDoc();
        }

        return result.promise();
    }

    /**
     * Apply an edit to the editor buffer immediately (called by node-side hooks).
     * The file appears as a dirty tab so subsequent Reads see the new content.
     * @param {Object} params - {file, oldText, newText}
     * @return {Promise<{applied: boolean, error?: string}>}
     */
    function applyEditToBuffer(params) {
        const deferred = new $.Deferred();
        _applySingleEdit(params)
            .done(function (result) {
                if (result && result.previousContent !== undefined) {
                    _previousContentMap[params.file] = result.previousContent;
                }
                deferred.resolve({ applied: true });
            })
            .fail(function (err) {
                deferred.resolve({ applied: false, error: err.message || String(err) });
            });
        return deferred.promise();
    }

    // --- Previous content map access (used by AIChatPanel for snapshot tracking) ---

    /**
     * Get the previous content recorded for a file before the last edit.
     * @param {string} filePath
     * @return {string|undefined}
     */
    function getPreviousContent(filePath) {
        return _previousContentMap[filePath];
    }

    /**
     * Clear all recorded previous content entries (called on new session).
     */
    function clearPreviousContentMap() {
        Object.keys(_previousContentMap).forEach(function (key) {
            delete _previousContentMap[key];
        });
    }

    /**
     * Get the last captured screenshot as base64 PNG.
     * @return {string|null}
     */
    function getLastScreenshot() {
        return _lastScreenshotBase64;
    }

    // --- Live preview JS execution ---

    /**
     * Execute JavaScript in the live preview iframe.
     * Reuses the pattern from phoenix-builder-client.js: fast path if connected,
     * otherwise auto-opens live preview and waits for connection.
     * @param {Object} params - { code: string }
     * @return {$.Promise} resolves with { result } or { error }
     */
    function execJsInLivePreview(params) {
        const deferred = new $.Deferred();

        function _evaluate() {
            LiveDevProtocol.evaluate(params.code)
                .done(function (evalResult) {
                    deferred.resolve({ result: JSON.stringify(evalResult) });
                })
                .fail(function (err) {
                    deferred.resolve({ error: (err && err.message) || String(err) || "evaluate() failed" });
                });
        }

        // Fast path: already connected
        if (LiveDevProtocol.getConnectionIds().length > 0) {
            _evaluate();
            return deferred.promise();
        }

        // Need to ensure live preview is open and connected
        const panel = WorkspaceManager.getPanelForID("live-preview-panel");
        if (!panel || !panel.isVisible()) {
            CommandManager.execute("file.liveFilePreview");
        } else {
            LiveDevMain.openLivePreview();
        }

        // Wait for a live preview connection (up to 30s)
        const TIMEOUT = 30000;
        const POLL_INTERVAL = 500;
        let settled = false;
        let pollTimer = null;

        function cleanup() {
            settled = true;
            if (pollTimer) {
                clearInterval(pollTimer);
                pollTimer = null;
            }
            LiveDevProtocol.off("ConnectionConnect.aiExecJsLivePreview");
        }

        const timeoutTimer = setTimeout(function () {
            if (settled) { return; }
            cleanup();
            deferred.resolve({ error: "Timed out waiting for live preview connection (30s)" });
        }, TIMEOUT);

        function onConnected() {
            if (settled) { return; }
            cleanup();
            clearTimeout(timeoutTimer);
            _evaluate();
        }

        LiveDevProtocol.on("ConnectionConnect.aiExecJsLivePreview", onConnected);

        // Safety-net poll in case the event was missed
        pollTimer = setInterval(function () {
            if (settled) {
                clearInterval(pollTimer);
                return;
            }
            if (LiveDevProtocol.getConnectionIds().length > 0) {
                onConnected();
            }
        }, POLL_INTERVAL);

        return deferred.promise();
    }

    // --- Editor control ---

    /**
     * Control the editor: open/close files, set cursor, set selection.
     * Called from the node-side MCP server via execPeer.
     * @param {Object} params - { operation, filePath, startLine, startCh, endLine, endCh, line, ch }
     * @return {$.Promise} resolves with { success: true } or { success: false, error: "..." }
     */
    function controlEditor(params) {
        const deferred = new $.Deferred();
        const vfsPath = SnapshotStore.realToVfsPath(params.filePath);

        switch (params.operation) {
        case "open":
            CommandManager.execute(Commands.CMD_OPEN, { fullPath: vfsPath })
                .done(function () { deferred.resolve({ success: true }); })
                .fail(function (err) { deferred.resolve({ success: false, error: String(err) }); });
            break;

        case "close": {
            const file = FileSystem.getFileForPath(vfsPath);
            CommandManager.execute(Commands.FILE_CLOSE, { file: file, _forceClose: true })
                .done(function () { deferred.resolve({ success: true }); })
                .fail(function (err) { deferred.resolve({ success: false, error: String(err) }); });
            break;
        }

        case "openInWorkingSet":
            CommandManager.execute(Commands.CMD_ADD_TO_WORKINGSET_AND_OPEN, { fullPath: vfsPath })
                .done(function () { deferred.resolve({ success: true }); })
                .fail(function (err) { deferred.resolve({ success: false, error: String(err) }); });
            break;

        case "setSelection":
            CommandManager.execute(Commands.CMD_OPEN, { fullPath: vfsPath })
                .done(function () {
                    const editor = EditorManager.getActiveEditor();
                    if (editor) {
                        editor.setSelection(
                            { line: params.startLine - 1, ch: params.startCh - 1 },
                            { line: params.endLine - 1, ch: params.endCh - 1 },
                            true
                        );
                        deferred.resolve({ success: true });
                    } else {
                        deferred.resolve({ success: false, error: "No active editor after opening file" });
                    }
                })
                .fail(function (err) { deferred.resolve({ success: false, error: String(err) }); });
            break;

        case "setCursorPos":
            CommandManager.execute(Commands.CMD_OPEN, { fullPath: vfsPath })
                .done(function () {
                    const editor = EditorManager.getActiveEditor();
                    if (editor) {
                        editor.setCursorPos(params.line - 1, params.ch - 1, true);
                        deferred.resolve({ success: true });
                    } else {
                        deferred.resolve({ success: false, error: "No active editor after opening file" });
                    }
                })
                .fail(function (err) { deferred.resolve({ success: false, error: String(err) }); });
            break;

        default:
            deferred.resolve({ success: false, error: "Unknown operation: " + params.operation });
        }

        return deferred.promise();
    }

    exports.getEditorState = getEditorState;
    exports.takeScreenshot = takeScreenshot;
    exports.getFileContent = getFileContent;
    exports.applyEditToBuffer = applyEditToBuffer;
    exports.getPreviousContent = getPreviousContent;
    exports.clearPreviousContentMap = clearPreviousContentMap;
    exports.getLastScreenshot = getLastScreenshot;
    exports.execJsInLivePreview = execJsInLivePreview;
    exports.controlEditor = controlEditor;

    EventDispatcher.makeEventDispatcher(exports);
});
