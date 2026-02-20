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
 *
 * Content is stored in memory during an AI turn and flushed to disk at
 * finalizeResponse() time. Reads check memory first, then fall back to disk.
 * A per-instance heartbeat + GC mechanism cleans up stale instance data.
 */
define(function (require, exports, module) {

    const DocumentManager = require("document/DocumentManager"),
        CommandManager   = require("command/CommandManager"),
        Commands         = require("command/Commands"),
        FileSystem       = require("filesystem/FileSystem"),
        ProjectManager   = require("project/ProjectManager");

    // --- Constants ---
    const HEARTBEAT_INTERVAL_MS = 60 * 1000;
    const STALE_THRESHOLD_MS = 10 * 60 * 1000;

    // --- Disk store state ---
    let _instanceDir;           // "<appSupportDir>/instanceData/<instanceId>/"
    let _aiSnapDir;             // "<appSupportDir>/instanceData/<instanceId>/aiSnap/"
    let _heartbeatIntervalId = null;
    let _diskReady = false;
    let _diskReadyResolve;
    const _diskReadyPromise = new Promise(function (resolve) {
        _diskReadyResolve = resolve;
    });

    // --- Private state ---
    const _memoryBuffer = {};       // hash → content (in-memory during AI turn)
    const _writtenHashes = new Set(); // hashes confirmed on disk
    let _snapshots = [];             // flat: _snapshots[i] = { filePath: hash|null }
    let _pendingBeforeSnap = {};     // built during current response: filePath → hash|null
    const _pendingDeleted = new Set();   // file paths deleted during current response
    const _readFiles = {};               // filePath → raw content string (files AI has read)
    let _isTracking = false;             // true while AI is streaming

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
        if (!_writtenHashes.has(hash) && !_memoryBuffer[hash]) {
            _memoryBuffer[hash] = content;
        }
        return hash;
    }

    // --- Disk store ---

    function _initDiskStore() {
        const appSupportDir = Phoenix.VFS.getAppSupportDir();
        const instanceId = Phoenix.PHOENIX_INSTANCE_ID;
        _instanceDir = appSupportDir + "instanceData/" + instanceId + "/";
        _aiSnapDir = _instanceDir + "aiSnap/";
        Phoenix.VFS.ensureExistsDirAsync(_aiSnapDir)
            .then(function () {
                _diskReady = true;
                _diskReadyResolve();
            })
            .catch(function (err) {
                console.error("[AISnapshotStore] Failed to init disk store:", err);
                // _diskReadyPromise stays pending — heartbeat/GC never fire
            });
    }

    function _flushToDisk() {
        if (!_diskReady) {
            return;
        }
        const hashes = Object.keys(_memoryBuffer);
        hashes.forEach(function (hash) {
            const content = _memoryBuffer[hash];
            const file = FileSystem.getFileForPath(_aiSnapDir + hash);
            file.write(content, {blind: true}, function (err) {
                if (err) {
                    console.error("[AISnapshotStore] Flush failed for hash " + hash + ":", err);
                    // Keep in _memoryBuffer so reads still work
                } else {
                    _writtenHashes.add(hash);
                    delete _memoryBuffer[hash];
                }
            });
        });
    }

    function _readContent(hash) {
        // Check memory buffer first (content may not have flushed yet)
        if (_memoryBuffer.hasOwnProperty(hash)) {
            return Promise.resolve(_memoryBuffer[hash]);
        }
        // Read from disk
        return new Promise(function (resolve, reject) {
            const file = FileSystem.getFileForPath(_aiSnapDir + hash);
            file.read(function (err, data) {
                if (err) {
                    reject(err);
                } else {
                    resolve(data);
                }
            });
        });
    }

    function _readFileFromDisk(vfsPath) {
        return new Promise(function (resolve, reject) {
            const file = FileSystem.getFileForPath(vfsPath);
            file.read(function (err, data) {
                if (err) { reject(err); } else { resolve(data); }
            });
        });
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

        function _unlinkFile() {
            file.unlink(function (err) {
                if (err) {
                    // File already gone — desired state achieved, treat as success
                    file.exists(function (_existErr, exists) {
                        if (!exists) {
                            result.resolve();
                        } else {
                            result.reject(err);
                        }
                    });
                } else {
                    result.resolve();
                }
            });
        }

        const openDoc = DocumentManager.getOpenDocumentForPath(vfsPath);
        if (openDoc) {
            if (openDoc.isDirty) {
                openDoc.setText("");
            }
            CommandManager.execute(Commands.FILE_CLOSE, { file: file, _forceClose: true })
                .always(_unlinkFile);
        } else {
            _unlinkFile();
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
                            CommandManager.execute(Commands.CMD_OPEN, { fullPath: vfsPath })
                                .always(function () {
                                    result.resolve();
                                });
                        });
                    } catch (err) {
                        result.reject(err);
                    }
                })
                .fail(function (err) {
                    result.reject(err || new Error("Could not open document"));
                });
        }

        function _createThenSet() {
            const file = FileSystem.getFileForPath(vfsPath);
            file.write("", function (writeErr) {
                if (writeErr) {
                    result.reject(new Error("Could not create file: " + writeErr));
                    return;
                }
                _setContent();
            });
        }

        const file = FileSystem.getFileForPath(vfsPath);
        file.exists(function (existErr, exists) {
            if (exists) {
                // File may appear to exist due to stale FS cache after a
                // delete+recreate cycle. Try opening first; if it fails,
                // recreate the file on disk and retry.
                DocumentManager.getDocumentForPath(vfsPath)
                    .done(function (doc) {
                        try {
                            doc.setText(content);
                            saveDocToDisk(doc).always(function () {
                                CommandManager.execute(Commands.CMD_OPEN, { fullPath: vfsPath })
                                    .always(function () {
                                        result.resolve();
                                    });
                            });
                        } catch (err) {
                            result.reject(err);
                        }
                    })
                    .fail(function () {
                        _createThenSet();
                    });
            } else {
                _createThenSet();
            }
        });

        return result.promise();
    }

    // --- Snapshot logic ---

    /**
     * Apply a snapshot to files. hash=null means delete the file.
     * Reads content from memory buffer first, then disk.
     * @param {Object} snapshot - { filePath: hash|null }
     * @return {Promise<number>} resolves with errorCount
     */
    async function _applySnapshot(snapshot) {
        const filePaths = Object.keys(snapshot);
        if (filePaths.length === 0) {
            return 0;
        }
        const promises = filePaths.map(function (fp) {
            const hash = snapshot[fp];
            if (hash === null) {
                return _closeAndDeleteFile(fp);
            }
            return _readContent(hash).then(function (content) {
                return _createOrUpdateFile(fp, content);
            });
        });
        const results = await Promise.allSettled(promises);
        let errorCount = 0;
        results.forEach(function (r) {
            if (r.status === "rejected") { errorCount++; }
        });
        return errorCount;
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
        }
    }

    /**
     * Record a file the AI has read, storing its content hash for potential
     * delete/rename tracking. If the file is later deleted, this content
     * can be promoted into a snapshot for restore.
     * @param {string} filePath - real filesystem path
     * @param {string} content - file content at read time
     */
    function recordFileRead(filePath, content) {
        _readFiles[filePath] = content;
    }

    /**
     * Record that a file has been deleted during this response.
     * If the file hasn't been tracked yet, its previousContent is stored
     * and back-filled into existing snapshots.
     * @param {string} filePath - real filesystem path
     * @param {string} previousContent - content before deletion
     */
    function recordFileDeletion(filePath, previousContent) {
        if (!_pendingBeforeSnap.hasOwnProperty(filePath)) {
            const hash = storeContent(previousContent);
            _pendingBeforeSnap[filePath] = hash;
            _snapshots.forEach(function (snap) {
                if (snap[filePath] === undefined) {
                    snap[filePath] = hash;
                }
            });
        }
        _pendingDeleted.add(filePath);
    }

    /**
     * Create the initial snapshot (snapshot 0) capturing file state before any
     * AI edits. Called once per session on the first edit.
     * @return {number} the snapshot index (always 0)
     */
    function createInitialSnapshot() {
        _snapshots.push({});
        return 0;
    }

    /**
     * Finalize snapshot state when a response completes.
     * Builds an "after" snapshot from current document content for edited files,
     * pushes it, and resets transient tracking variables.
     * Flushes in-memory content to disk for long-term storage.
     *
     * Priority for each file:
     * 1. If in _pendingDeleted → null
     * 2. If doc is open → storeContent(openDoc.getText())
     * 3. Fallback: read from disk → storeContent(content)
     * 4. If disk read fails (file gone) → null
     *
     * @return {Promise<number>} the after-snapshot index, or -1 if no edits happened
     */
    async function finalizeResponse() {
        let afterIndex = -1;
        if (Object.keys(_pendingBeforeSnap).length > 0) {
            const afterSnap = Object.assign({}, _snapshots[_snapshots.length - 1]);
            const editedPaths = Object.keys(_pendingBeforeSnap);
            for (let i = 0; i < editedPaths.length; i++) {
                const fp = editedPaths[i];
                if (_pendingDeleted.has(fp)) {
                    afterSnap[fp] = null;
                    continue;
                }
                const vfsPath = realToVfsPath(fp);
                const openDoc = DocumentManager.getOpenDocumentForPath(vfsPath);
                if (openDoc) {
                    afterSnap[fp] = storeContent(openDoc.getText());
                } else {
                    try {
                        const content = await _readFileFromDisk(vfsPath);
                        afterSnap[fp] = storeContent(content);
                    } catch (e) {
                        afterSnap[fp] = null;
                    }
                }
            }
            _snapshots.push(afterSnap);
            afterIndex = _snapshots.length - 1;
        }
        _pendingBeforeSnap = {};
        _pendingDeleted.clear();
        _flushToDisk();
        return afterIndex;
    }

    /**
     * Restore files to the state captured in a specific snapshot.
     * @param {number} index - index into _snapshots
     * @param {Function} onComplete - callback(errorCount)
     */
    async function restoreToSnapshot(index, onComplete) {
        if (index < 0 || index >= _snapshots.length) {
            onComplete(0);
            return;
        }
        const errorCount = await _applySnapshot(_snapshots[index]);
        onComplete(errorCount);
    }

    // --- FS event tracking ---

    function _onProjectFileChanged(_event, entry, addedInProject, removedInProject) {
        if (!removedInProject || !removedInProject.length) { return; }
        removedInProject.forEach(function (removedEntry) {
            if (!removedEntry.isFile) { return; }
            const fp = removedEntry.fullPath;
            // Check if AI has edited this file (already in snapshots)
            const isEdited = _pendingBeforeSnap.hasOwnProperty(fp) ||
                _snapshots.some(function (snap) { return snap.hasOwnProperty(fp); });
            if (isEdited) {
                _pendingDeleted.add(fp);
                return;
            }
            // Check if AI has read this file (raw content available)
            if (_readFiles.hasOwnProperty(fp)) {
                // Promote from read-tracked to snapshot-tracked, then mark deleted
                const hash = storeContent(_readFiles[fp]);
                _pendingBeforeSnap[fp] = hash;
                _snapshots.forEach(function (snap) {
                    if (snap[fp] === undefined) {
                        snap[fp] = hash;
                    }
                });
                _pendingDeleted.add(fp);
            }
        });
    }

    function _onProjectFileRenamed(_event, oldPath, newPath) {
        // Update _pendingBeforeSnap
        if (_pendingBeforeSnap.hasOwnProperty(oldPath)) {
            _pendingBeforeSnap[newPath] = _pendingBeforeSnap[oldPath];
            delete _pendingBeforeSnap[oldPath];
        }
        // Update _pendingDeleted
        if (_pendingDeleted.has(oldPath)) {
            _pendingDeleted.delete(oldPath);
            _pendingDeleted.add(newPath);
        }
        // Update all snapshots
        _snapshots.forEach(function (snap) {
            if (snap.hasOwnProperty(oldPath)) {
                snap[newPath] = snap[oldPath];
                delete snap[oldPath];
            }
        });
        // Update _readFiles
        if (_readFiles.hasOwnProperty(oldPath)) {
            _readFiles[newPath] = _readFiles[oldPath];
            delete _readFiles[oldPath];
        }
    }

    function startTracking() {
        if (_isTracking) { return; }
        _isTracking = true;
        ProjectManager.on("projectFileChanged", _onProjectFileChanged);
        ProjectManager.on("projectFileRenamed", _onProjectFileRenamed);
    }

    function stopTracking() {
        if (!_isTracking) { return; }
        _isTracking = false;
        ProjectManager.off("projectFileChanged", _onProjectFileChanged);
        ProjectManager.off("projectFileRenamed", _onProjectFileRenamed);
    }

    /**
     * @return {number} number of snapshots
     */
    function getSnapshotCount() {
        return _snapshots.length;
    }

    /**
     * Clear all snapshot state. Called when starting a new session.
     * Also deletes and recreates the aiSnap directory on disk.
     */
    function reset() {
        Object.keys(_memoryBuffer).forEach(function (k) { delete _memoryBuffer[k]; });
        _writtenHashes.clear();
        _snapshots = [];
        _pendingBeforeSnap = {};
        _pendingDeleted.clear();
        Object.keys(_readFiles).forEach(function (k) { delete _readFiles[k]; });
        stopTracking();

        // Delete and recreate aiSnap directory
        if (_diskReady && _aiSnapDir) {
            const dir = FileSystem.getDirectoryForPath(_aiSnapDir);
            dir.unlink(function (err) {
                if (err) {
                    console.error("[AISnapshotStore] Failed to delete aiSnap dir:", err);
                }
                Phoenix.VFS.ensureExistsDirAsync(_aiSnapDir).catch(function (e) {
                    console.error("[AISnapshotStore] Failed to recreate aiSnap dir:", e);
                });
            });
        }
    }

    // --- Heartbeat ---

    function _writeHeartbeat() {
        if (!_diskReady || !_instanceDir) {
            return;
        }
        const file = FileSystem.getFileForPath(_instanceDir + "heartbeat");
        file.write(String(Date.now()), {blind: true}, function (err) {
            if (err) {
                console.error("[AISnapshotStore] Heartbeat write failed:", err);
            }
        });
    }

    function _startHeartbeat() {
        _diskReadyPromise.then(function () {
            _writeHeartbeat();
            _heartbeatIntervalId = setInterval(_writeHeartbeat, HEARTBEAT_INTERVAL_MS);
        });
    }

    function _stopHeartbeat() {
        if (_heartbeatIntervalId !== null) {
            clearInterval(_heartbeatIntervalId);
            _heartbeatIntervalId = null;
        }
    }

    // --- Garbage Collection ---

    function _runGarbageCollection() {
        _diskReadyPromise.then(function () {
            const appSupportDir = Phoenix.VFS.getAppSupportDir();
            const instanceDataBaseDir = appSupportDir + "instanceData/";
            const ownId = Phoenix.PHOENIX_INSTANCE_ID;
            const baseDir = FileSystem.getDirectoryForPath(instanceDataBaseDir);
            baseDir.getContents(function (err, entries) {
                if (err) {
                    console.error("[AISnapshotStore] GC: failed to list instanceData:", err);
                    return;
                }
                const now = Date.now();
                entries.forEach(function (entry) {
                    if (!entry.isDirectory || entry.name === ownId) {
                        return;
                    }
                    const heartbeatFile = FileSystem.getFileForPath(
                        instanceDataBaseDir + entry.name + "/heartbeat"
                    );
                    heartbeatFile.read(function (readErr, data) {
                        let isStale = false;
                        if (readErr) {
                            // No heartbeat file — treat as stale
                            isStale = true;
                        } else {
                            const ts = parseInt(data, 10);
                            if (isNaN(ts) || (now - ts) > STALE_THRESHOLD_MS) {
                                isStale = true;
                            }
                        }
                        if (isStale) {
                            entry.unlink(function (unlinkErr) {
                                if (unlinkErr) {
                                    console.error("[AISnapshotStore] GC: failed to remove stale dir "
                                        + entry.name + ":", unlinkErr);
                                }
                            });
                        }
                    });
                });
            }, true); // true = filterNothing
        });
    }

    // --- Module init ---
    _initDiskStore();
    _startHeartbeat();
    _runGarbageCollection();
    window.addEventListener("beforeunload", _stopHeartbeat);

    exports.realToVfsPath = realToVfsPath;
    exports.saveDocToDisk = saveDocToDisk;
    exports.storeContent = storeContent;
    exports.recordFileBeforeEdit = recordFileBeforeEdit;
    exports.recordFileRead = recordFileRead;
    exports.recordFileDeletion = recordFileDeletion;
    exports.createInitialSnapshot = createInitialSnapshot;
    exports.finalizeResponse = finalizeResponse;
    exports.restoreToSnapshot = restoreToSnapshot;
    exports.getSnapshotCount = getSnapshotCount;
    exports.startTracking = startTracking;
    exports.stopTracking = stopTracking;
    exports.reset = reset;
});
