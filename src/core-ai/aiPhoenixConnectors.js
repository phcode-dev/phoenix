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
        FileSystem       = require("filesystem/FileSystem"),
        SnapshotStore    = require("core-ai/AISnapshotStore"),
        Strings          = require("strings");

    // filePath → previous content before edit, for undo/snapshot support
    const _previousContentMap = {};

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

        return {
            activeFile: activeFilePath,
            workingSet: workingSetPaths,
            livePreviewFile: livePreviewFile
        };
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

    exports.getEditorState = getEditorState;
    exports.takeScreenshot = takeScreenshot;
    exports.getFileContent = getFileContent;
    exports.applyEditToBuffer = applyEditToBuffer;
    exports.getPreviousContent = getPreviousContent;
    exports.clearPreviousContentMap = clearPreviousContentMap;
});
