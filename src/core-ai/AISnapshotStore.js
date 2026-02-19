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
 * AI Snapshot Store — content-addressable store and snapshot/restore logic
 * for tracking file states across AI responses. Extracted from AIChatPanel
 * to separate data/logic concerns from the DOM/UI layer.
 */
define(function (require, exports, module) {

    const DocumentManager = require("document/DocumentManager"),
        CommandManager   = require("command/CommandManager"),
        Commands         = require("command/Commands"),
        FileSystem       = require("filesystem/FileSystem");

    // --- Private state ---
    const _contentStore = {};        // hash → content string (content-addressable dedup)
    let _snapshots = [];             // flat: _snapshots[i] = { filePath: hash|null }
    let _lastSnapshotAfter = {};     // cumulative state after last completed response
    let _pendingBeforeSnap = {};     // built during current response: filePath → hash|null
    let _initialSnapshotCreated = false;  // has the initial (pre-AI) snapshot been pushed?
    let _undoApplied = false;

    // --- Path utility ---

    /**
     * Convert a real filesystem path back to a VFS path that Phoenix understands.
     */
    function realToVfsPath(realPath) {
        // If it already looks like a VFS path, return as-is
        if (realPath.startsWith("/tauri/") || realPath.startsWith("/mnt/")) {
            return realPath;
        }
        // Desktop builds use /tauri/ prefix
        if (Phoenix.isNativeApp) {
            return "/tauri" + realPath;
        }
        return realPath;
    }

    // --- Content-addressable store ---

    function _hashContent(str) {
        let h = 0x811c9dc5;  // FNV-1a
        for (let i = 0; i < str.length; i++) {
            h ^= str.charCodeAt(i); // eslint-disable-line no-bitwise
            h = (h * 0x01000193) >>> 0; // eslint-disable-line no-bitwise
        }
        return h.toString(36);
    }

    function storeContent(content) {
        const hash = _hashContent(content);
        _contentStore[hash] = content;
        return hash;
    }

    // --- File operations ---

    /**
     * Save a document's current content to disk so editors and disk stay in sync.
     * @param {Document} doc - Brackets document to save
     * @return {$.Promise}
     */
    function saveDocToDisk(doc) {
        const d = new $.Deferred();
        const file = doc.file;
        const content = doc.getText();
        file.write(content, function (err) {
            if (err) {
                console.error("[AI UI] Save to disk failed:", doc.file.fullPath, err);
                d.reject(err);
            } else {
                doc.notifySaved();
                d.resolve();
            }
        });
        return d.promise();
    }

    /**
     * Close a document tab (if open) and delete the file from disk.
     * Used during restore to remove files that were created by the AI.
     * @param {string} filePath - real filesystem path
     * @return {$.Promise}
     */
    function _closeAndDeleteFile(filePath) {
        const result = new $.Deferred();
        const vfsPath = realToVfsPath(filePath);
        const file = FileSystem.getFileForPath(vfsPath);

        const openDoc = DocumentManager.getOpenDocumentForPath(vfsPath);
        if (openDoc) {
            if (openDoc.isDirty) {
                openDoc.setText("");
            }
            CommandManager.execute(Commands.FILE_CLOSE, { file: file, _forceClose: true })
                .always(function () {
                    file.unlink(function (err) {
                        if (err) {
                            result.reject(err);
                        } else {
                            result.resolve();
                        }
                    });
                });
        } else {
            file.unlink(function (err) {
                if (err) {
                    result.reject(err);
                } else {
                    result.resolve();
                }
            });
        }

        return result.promise();
    }

    /**
     * Create or update a file with the given content.
     * @param {string} filePath - real filesystem path
     * @param {string} content - content to set
     * @return {$.Promise}
     */
    function _createOrUpdateFile(filePath, content) {
        const result = new $.Deferred();
        const vfsPath = realToVfsPath(filePath);

        function _setContent() {
            DocumentManager.getDocumentForPath(vfsPath)
                .done(function (doc) {
                    try {
                        doc.setText(content);
                        saveDocToDisk(doc).always(function () {
                            CommandManager.execute(Commands.CMD_OPEN, { fullPath: vfsPath });
                            result.resolve();
                        });
                    } catch (err) {
                        result.reject(err);
                    }
                })
                .fail(function (err) {
                    result.reject(err || new Error("Could not open document"));
                });
        }

        const file = FileSystem.getFileForPath(vfsPath);
        file.exists(function (existErr, exists) {
            if (exists) {
                _setContent();
            } else {
                file.write("", function (writeErr) {
                    if (writeErr) {
                        result.reject(new Error("Could not create file: " + writeErr));
                        return;
                    }
                    _setContent();
                });
            }
        });

        return result.promise();
    }

    // --- Snapshot logic ---

    /**
     * Apply a snapshot to files. hash=null means delete the file.
     * @param {Object} snapshot - { filePath: hash|null }
     * @return {$.Promise} resolves with errorCount
     */
    function _applySnapshot(snapshot) {
        const result = new $.Deferred();
        const filePaths = Object.keys(snapshot);
        const promises = [];
        let errorCount = 0;
        filePaths.forEach(function (fp) {
            const hash = snapshot[fp];
            const p = hash === null
                ? _closeAndDeleteFile(fp)
                : _createOrUpdateFile(fp, _contentStore[hash]);
            p.fail(function () { errorCount++; });
            promises.push(p);
        });
        if (promises.length === 0) {
            return result.resolve(0).promise();
        }
        $.when.apply($, promises).always(function () { result.resolve(errorCount); });
        return result.promise();
    }

    // --- Public API ---

    /**
     * Record a file's pre-edit state into the pending snapshot and back-fill
     * existing snapshots. Called once per file per response (first edit wins).
     * @param {string} filePath - real filesystem path
     * @param {string} previousContent - content before edit
     * @param {boolean} isNewFile - true if the file was created by this edit
     */
    function recordFileBeforeEdit(filePath, previousContent, isNewFile) {
        if (!_pendingBeforeSnap.hasOwnProperty(filePath)) {
            const hash = isNewFile ? null : storeContent(previousContent);
            _pendingBeforeSnap[filePath] = hash;
            // Back-fill all existing snapshots with this file's pre-AI state
            _snapshots.forEach(function (snap) {
                if (snap[filePath] === undefined) {
                    snap[filePath] = hash;
                }
            });
            // Also back-fill _lastSnapshotAfter
            if (_lastSnapshotAfter[filePath] === undefined) {
                _lastSnapshotAfter[filePath] = hash;
            }
        }
    }

    /**
     * Create the initial snapshot (snapshot 0) capturing file state before any
     * AI edits. Called once per session on the first edit.
     * @return {number} the snapshot index (always 0)
     */
    function createInitialSnapshot() {
        const snap = Object.assign({}, _lastSnapshotAfter);
        _snapshots.push(snap);
        _initialSnapshotCreated = true;
        return 0;
    }

    /**
     * @return {boolean} whether the initial snapshot has been created this session
     */
    function isInitialSnapshotCreated() {
        return _initialSnapshotCreated;
    }

    /**
     * Finalize snapshot state when a response completes.
     * Builds an "after" snapshot from current document content for edited files,
     * pushes it, and resets transient tracking variables.
     * @return {number} the after-snapshot index, or -1 if no edits happened
     */
    function finalizeResponse() {
        let afterIndex = -1;
        if (Object.keys(_pendingBeforeSnap).length > 0) {
            // Build "after" snapshot = current _lastSnapshotAfter + current content of edited files
            const afterSnap = Object.assign({}, _lastSnapshotAfter);
            Object.keys(_pendingBeforeSnap).forEach(function (fp) {
                const vfsPath = realToVfsPath(fp);
                const openDoc = DocumentManager.getOpenDocumentForPath(vfsPath);
                if (openDoc) {
                    afterSnap[fp] = storeContent(openDoc.getText());
                }
            });
            _snapshots.push(afterSnap);
            _lastSnapshotAfter = afterSnap;
            afterIndex = _snapshots.length - 1;
        }
        _pendingBeforeSnap = {};
        _undoApplied = false;
        return afterIndex;
    }

    /**
     * Restore files to the state captured in a specific snapshot.
     * @param {number} index - index into _snapshots
     * @param {Function} onComplete - callback(errorCount)
     */
    function restoreToSnapshot(index, onComplete) {
        if (index < 0 || index >= _snapshots.length) {
            onComplete(0);
            return;
        }
        _applySnapshot(_snapshots[index]).done(function (errorCount) {
            onComplete(errorCount);
        });
    }

    /**
     * @return {boolean} whether undo has been applied (latest summary clicked)
     */
    function isUndoApplied() {
        return _undoApplied;
    }

    /**
     * @param {boolean} val
     */
    function setUndoApplied(val) {
        _undoApplied = val;
    }

    /**
     * @return {number} number of snapshots
     */
    function getSnapshotCount() {
        return _snapshots.length;
    }

    /**
     * Clear all snapshot state. Called when starting a new session.
     */
    function reset() {
        Object.keys(_contentStore).forEach(function (k) { delete _contentStore[k]; });
        _snapshots = [];
        _lastSnapshotAfter = {};
        _pendingBeforeSnap = {};
        _initialSnapshotCreated = false;
        _undoApplied = false;
    }

    exports.realToVfsPath = realToVfsPath;
    exports.saveDocToDisk = saveDocToDisk;
    exports.storeContent = storeContent;
    exports.recordFileBeforeEdit = recordFileBeforeEdit;
    exports.createInitialSnapshot = createInitialSnapshot;
    exports.isInitialSnapshotCreated = isInitialSnapshotCreated;
    exports.finalizeResponse = finalizeResponse;
    exports.restoreToSnapshot = restoreToSnapshot;
    exports.isUndoApplied = isUndoApplied;
    exports.setUndoApplied = setUndoApplied;
    exports.getSnapshotCount = getSnapshotCount;
    exports.reset = reset;
});
