/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 * Original work Copyright (c) 2013 - 2021 Adobe Systems Incorporated. All rights reserved.
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

/*
 * To ensure cache coherence, current and future asynchronous state-changing
 * operations of FileSystemEntry and its subclasses should implement the
 * following high-level sequence of steps:
 *
 * 1. Block external filesystem change events;
 * 2. Execute the low-level state-changing operation;
 * 3. Update the internal filesystem state, including caches;
 * 4. Apply the callback;
 * 5. Fire an appropriate internal change notification; and
 * 6. Unblock external change events.
 *
 * Note that because internal filesystem state is updated first, both the original
 * caller and the change notification listeners observe filesystem state that is
 * current w.r.t. the operation. Furthermore, because external change events are
 * blocked before the operation begins, listeners will only receive the internal
 * change event for the operation and not additional (or possibly inconsistent)
 * external change events.
 *
 * State-changing operations that block external filesystem change events must
 * take care to always subsequently unblock the external change events in all
 * control paths. It is safe to assume, however, that the underlying impl will
 * always apply the callback with some value.

 * Caches should be conservative. Consequently, the entry's cached data should
 * always be cleared if the underlying impl's operation fails. This is the case
 * event for read-only operations because an unexpected failure implies that the
 * system is in an unknown state. The entry should communicate this by failing
 * where appropriate, and should not use the cache to hide failure.
 *
 * Only watched entries should make use of cached data because change events are
 * only expected for such entries, and change events are used to granularly
 * invalidate out-of-date caches.
 *
 * By convention, callbacks are optional for asynchronous, state-changing
 * operations, but required for read-only operations. The first argument to the
 * callback should always be a nullable error string from FileSystemError.
 */
define(function (require, exports, module) {


    var FileSystemError = require("filesystem/FileSystemError"),
        WatchedRoot     = require("filesystem/WatchedRoot");

    var VISIT_DEFAULT_MAX_DEPTH = 100,
        VISIT_DEFAULT_MAX_ENTRIES = 200000;

    /* Counter to give every entry a unique id */
    var nextId = 0;

    /**
     * Model for a file system entry. This is the base class for File and Directory,
     * and is never used directly.
     *
     * See the File, Directory, and FileSystem classes for more details.
     *
     * @constructor
     * @param {string} path The path for this entry.
     * @param {FileSystem} fileSystem The file system associated with this entry.
     */
    function FileSystemEntry(path, fileSystem) {
        this._setPath(path);
        this._fileSystem = fileSystem;
        this._id = nextId++;
    }

    // Add "fullPath", "name", "parent", "id", "isFile" and "isDirectory" getters
    Object.defineProperties(FileSystemEntry.prototype, {
        "fullPath": {
            get: function () { return this._path; },
            set: function () { throw new Error("Cannot set fullPath"); }
        },
        "name": {
            get: function () { return this._name; },
            set: function () { throw new Error("Cannot set name"); }
        },
        "parentPath": {
            get: function () { return this._parentPath; },
            set: function () { throw new Error("Cannot set parentPath"); }
        },
        "id": {
            get: function () { return this._id; },
            set: function () { throw new Error("Cannot set id"); }
        },
        "isFile": {
            get: function () { return this._isFile; },
            set: function () { throw new Error("Cannot set isFile"); }
        },
        "isDirectory": {
            get: function () { return this._isDirectory; },
            set: function () { throw new Error("Cannot set isDirectory"); }
        },
        "_impl": {
            get: function () { return this._fileSystem._impl; },
            set: function () { throw new Error("Cannot set _impl"); }
        }
    });

    /**
     * Cached stat object for this file.
     * @type {?FileSystemStats}
     */
    FileSystemEntry.prototype._stat = null;

    /**
     * Parent file system.
     * @type {!FileSystem}
     */
    FileSystemEntry.prototype._fileSystem = null;

    /**
     * The path of this entry.
     * @type {string}
     */
    FileSystemEntry.prototype._path = null;

    /**
     * The name of this entry.
     * @type {string}
     */
    FileSystemEntry.prototype._name = null;

    /**
     * The parent of this entry.
     * @type {string}
     */
    FileSystemEntry.prototype._parentPath = null;

    /**
     * Whether or not the entry is a file
     * @type {boolean}
     */
    FileSystemEntry.prototype._isFile = false;

    /**
     * Whether or not the entry is a directory
     * @type {boolean}
     */
    FileSystemEntry.prototype._isDirectory = false;

    /**
     * Cached copy of this entry's watched root
     * @type {entry: File|Directory, filter: function(FileSystemEntry):boolean, active: boolean}
     */
    FileSystemEntry.prototype._watchedRoot = undefined;

    /**
     * Cached result of _watchedRoot.filter(this.name, this.parentPath).
     * @type {boolean}
     */
    FileSystemEntry.prototype._watchedRootFilterResult = undefined;

    /**
     * Determines whether or not the entry is watched.
     * @param {boolean=} relaxed If falsey, the method will only return true if
     *      the watched root is fully active. If true, the method will return
     *      true if the watched root is either starting up or fully active.
     * @return {boolean}
     */
    FileSystemEntry.prototype._isWatched = function (relaxed) {
        var watchedRoot = this._watchedRoot,
            filterResult = this._watchedRootFilterResult;

        if (!watchedRoot) {
            watchedRoot = this._fileSystem._findWatchedRootForPath(this._path);

            if (watchedRoot) {
                this._watchedRoot = watchedRoot;
                if (watchedRoot.entry !== this) { // avoid creating entries for root's parent
                    var parentEntry = this._fileSystem.getDirectoryForPath(this._parentPath);
                    if (parentEntry._isWatched() === false) {
                        filterResult = false;
                    } else {
                        filterResult = watchedRoot.filter(this._name, this._parentPath);
                    }
                } else { // root itself is watched
                    filterResult = true;
                }
                this._watchedRootFilterResult = filterResult;
            }
        }

        if (watchedRoot) {
            if (watchedRoot.status === WatchedRoot.ACTIVE ||
                    (relaxed && watchedRoot.status === WatchedRoot.STARTING)) {
                return filterResult;
            }
                // We had a watched root, but it's no longer active, so it must now be invalid.
            this._watchedRoot = undefined;
            this._watchedRootFilterResult = false;
            this._clearCachedData();

        }
        return false;
    };

    /**
     * Update the path for this entry
     * @private
     * @param {String} newPath
     */
    FileSystemEntry.prototype._setPath = function (newPath) {
        var parts = newPath.split("/");
        if (this.isDirectory) {
            parts.pop(); // Remove the empty string after last trailing "/"
        }
        this._name = parts[parts.length - 1];
        parts.pop(); // Remove name

        if (parts.length > 0) {
            this._parentPath = parts.join("/") + "/";
        } else {
            // root directories have no parent path
            this._parentPath = null;
        }

        this._path = newPath;

        var watchedRoot = this._watchedRoot;
        if (watchedRoot) {
            if (newPath.indexOf(watchedRoot.entry.fullPath) === 0) {
                // Update watchedRootFilterResult
                this._watchedRootFilterResult = watchedRoot.filter(this._name, this._parentPath);
            } else {
                // The entry was moved outside of the watched root
                this._watchedRoot = null;
                this._watchedRootFilterResult = false;
            }
        }
    };

    /**
     * Clear any cached data for this entry
     * @private
     */
    FileSystemEntry.prototype._clearCachedData = function () {
        this._stat = undefined;
    };

    /**
     * Helpful toString for debugging purposes
     */
    FileSystemEntry.prototype.toString = function () {
        return "[" + (this.isDirectory ? "Directory " : "File ") + this._path + "]";
    };

    /**
     * Check to see if the entry exists on disk. Note that there will NOT be an
     * error returned if the file does not exist on the disk; in that case the
     * error parameter will be null and the boolean will be false. The error
     * parameter will only be truthy when an unexpected error was encountered
     * during the test, in which case the state of the entry should be considered
     * unknown.
     *
     * @param {function (?string, boolean)} callback Callback with a FileSystemError
     *      string or a boolean indicating whether or not the file exists.
     */
    FileSystemEntry.prototype.exists = function (callback) {
        if (this._stat) {
            callback(null, true);
            return;
        }

        this._impl.exists(this._path, function (err, exists) {
            if (err) {
                this._clearCachedData();
                callback(err);
                return;
            }

            if (!exists) {
                this._clearCachedData();
            }

            callback(null, exists);
        }.bind(this));
    };

    /**
     * Async version of exists API. Returns true or false if the entry exists. or error rejects.
     */
    FileSystemEntry.prototype.existsAsync = async function () {
        let that = this;
        return new Promise((resolve, reject)=>{
            that.exists((err, exists)=>{
                if(err){
                    reject(err);
                } else {
                    resolve(exists);
                }
            });
        });

    };

    /**
     * Returns the stats for the entry.
     *
     * @param {function (?string, FileSystemStats=)} callback Callback with a
     *      FileSystemError string or FileSystemStats object.
     */
    FileSystemEntry.prototype.stat = function (callback) {
        if (this._stat) {
            callback(null, this._stat);
            return;
        }

        this._impl.stat(this._path, function (err, stat) {
            if (err) {
                this._clearCachedData();
                callback(err);
                return;
            }

            if (this._isWatched()) {
                this._stat = stat;
            }

            callback(null, stat);
        }.bind(this));
    };

    /**
     * Returns a promise that resolves to the stats for the entry.
     *
     * @return {Promise<FileSystemStats>}
     */
    FileSystemEntry.prototype.statAsync = async function () {
        let that = this;
        return new Promise((resolve, reject)=>{
            that.stat((err, stat)=>{
                if(err){
                    reject(err);
                } else {
                    resolve(stat);
                }
            });
        });
    };

    function _ensureTrailingSlash(path) {
        if (path[path.length - 1] !== "/") {
            path += "/";
        }

        return path;
    }

    /**
     * Rename this entry.
     *
     * @param {string} newFullPath New path & name for this entry.
     * @param {function (?string)=} callback Callback with a single FileSystemError
     *      string parameter.
     */
    FileSystemEntry.prototype.rename = function (newFullPath, callback) {
        callback = callback || function () {};
        if(this.isDirectory){
            newFullPath = _ensureTrailingSlash(newFullPath);
        }

        // Block external change events until after the write has finished
        this._fileSystem._beginChange();

        this._impl.rename(this._path, newFullPath, function (err) {
            var oldFullPath = this._path;

            try {
                if (err) {
                    this._clearCachedData();
                    callback(err);
                    return;
                }

                // Update internal filesystem state
                this._fileSystem._handleRename(oldFullPath, newFullPath, this.isDirectory);

                try {
                    // Notify the caller
                    callback(null);
                } finally {
                    // Notify rename listeners
                    this._fileSystem._fireRenameEvent(oldFullPath, newFullPath);
                }
            } finally {
                // Unblock external change events
                this._fileSystem._endChange();
            }
        }.bind(this));
    };

    /**
     * Permanently delete this entry. For Directories, this will delete the directory
     * and all of its contents. For reversible delete, see moveToTrash().
     *
     * @return {Promise<>} a promise that resolves when delete is success or rejects.
     */
    FileSystemEntry.prototype.unlinkAsync = function () {
        let that = this;
        return new Promise((resolve, reject)=>{
            that.unlink((err)=>{
                if(err){
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    };

    /**
     * Permanently delete this entry. For Directories, this will delete the directory
     * and all of its contents. For reversible delete, see moveToTrash().
     *
     * @param {function (?string)=} callback Callback with a single FileSystemError
     *      string parameter.
     */
    FileSystemEntry.prototype.unlink = function (callback) {
        callback = callback || function () {};

        // Block external change events until after the write has finished
        this._fileSystem._beginChange();

        this._clearCachedData();
        this._impl.unlink(this._path, function (err) {
            var parent = this._fileSystem.getDirectoryForPath(this.parentPath);

            // Update internal filesystem state
            this._fileSystem._handleDirectoryChange(parent, function (added, removed) {
                try {
                    // Notify the caller
                    callback(err);
                } finally {
                    if (parent._isWatched()) {
                        // Notify change listeners
                        this._fileSystem._fireChangeEvent(parent, added, removed);
                    }

                    // Unblock external change events
                    this._fileSystem._endChange();
                }
            }.bind(this));
        }.bind(this));
    };

    /**
     * Move this entry to the trash. If the underlying file system doesn't support move
     * to trash, the item is permanently deleted.
     *
     * @param {function (?string)=} callback Callback with a single FileSystemError
     *      string parameter.
     */
    FileSystemEntry.prototype.moveToTrash = function (callback) {
        if (!this._impl.moveToTrash) {
            this.unlink(callback);
            return;
        }

        callback = callback || function () {};

        // Block external change events until after the write has finished
        this._fileSystem._beginChange();

        this._clearCachedData();
        this._impl.moveToTrash(this._path, function (err) {
            var parent = this._fileSystem.getDirectoryForPath(this.parentPath);

            // Update internal filesystem state
            this._fileSystem._handleDirectoryChange(parent, function (added, removed) {
                try {
                    // Notify the caller
                    callback(err);
                } finally {
                    if (parent._isWatched()) {
                        // Notify change listeners
                        this._fileSystem._fireChangeEvent(parent, added, removed);
                    }

                    // Unblock external change events
                    this._fileSystem._endChange();
                }
            }.bind(this));
        }.bind(this));
    };

    /**
     * Private helper function for FileSystemEntry.visit that requires sanitized options.
     *
     * @private
     * @param {FileSystemStats} stats - the stats for this entry
     * @param {{string: boolean}} visitedPaths - the set of fullPaths that have already been visited
     * @param {function(FileSystemEntry): boolean} visitor - A visitor function, which is
     *      applied to descendent FileSystemEntry objects. If the function returns false for
     *      a particular Directory entry, that directory's descendents will not be visited.
     * @param {{maxDepth: number, maxEntries: number, sortList: boolean}} options
     * @returns {Promise<>} that resolves when the visit is complete
     */
    FileSystemEntry.prototype._visitHelper = function (stats, visitedPaths, visitor, options, _currentDepth = 0) {
        return new Promise((resolve, reject)=>{
            const self = this;
            let maxDepth = options.maxDepth,
                maxEntries = options.maxEntries,
                sortList = options.sortList,
                totalPathsVisited = visitedPaths._totalPathsVisited || 0;

            if (self.isDirectory) {
                var currentPath = stats.realPath || self.fullPath;

                if (visitedPaths.hasOwnProperty(currentPath)) {
                    // Link cycle detected
                    resolve();
                    return;
                }

                visitedPaths[currentPath] = true;
            }

            if (visitedPaths._totalPathsVisited >= maxEntries) {
                reject(FileSystemError.TOO_MANY_ENTRIES);
                return;
            }

            visitedPaths._totalPathsVisited = totalPathsVisited + 1;
            let shouldVisitChildren = visitor(self);
            if (!shouldVisitChildren || self.isFile || _currentDepth >= maxDepth) {
                resolve();
                return;
            }

            self.getContents(async function (err, entries, entriesStats) {
                if (err) {
                    reject(err);
                    return;
                }

                for(let i=0; i<entriesStats.length; i++){
                    entries[i]._entryStats = entriesStats[i];
                }

                //sort entries if required
                if (sortList) {
                    function compare(entry1, entry2) {
                        return entry1._name.toLocaleLowerCase().localeCompare(entry2._name.toLocaleLowerCase());
                    }
                    entries = entries.sort(compare);
                }

                try{
                    for(let entry of entries){
                        // this is left intentionally serial to prevent a chrome crash bug when large number of fs
                        // access APIs are called. Try to make this parallel in the future after verifying on a large
                        // folder with more than 100K entries.
                        await entry._visitHelper(entry._entryStats, visitedPaths, visitor, options, _currentDepth + 1);
                    }
                    resolve();
                } catch (e) {
                    reject(e);
                }
            });
        });
    };

    /**
     * Visit this entry and its descendents with the supplied visitor function.
     * Correctly handles symbolic link cycles and options can be provided to limit
     * search depth and total number of entries visited. No particular traversal
     * order is guaranteed; instead of relying on such an order, it is preferable
     * to use the visit function to build a list of visited entries, sort those
     * entries as desired, and then process them. Whenever possible, deep
     * filesystem traversals should use this method.
     *
     * @param {function(FileSystemEntry): boolean} visitor - A visitor function, which is
     *      applied to this entry and all descendent FileSystemEntry objects. If the function returns
     *      false for a particular Directory entry, that directory's descendents will not be visited.
     * @param {{maxDepth: number=, maxEntries: number=}=} options
     * @param {function(?string)=} callback Callback with single FileSystemError string parameter.
     */
    FileSystemEntry.prototype.visit = function (visitor, options, callback) {
        let self = this;
        if (typeof options === "function") {
            callback = options;
            options = {};
        } else {
            if (options === undefined) {
                options = {};
            }

            callback = callback || function () {};
        }

        if (options.maxDepth === undefined) {
            options.maxDepth = VISIT_DEFAULT_MAX_DEPTH;
        }

        if (options.maxEntries === undefined) {
            options.maxEntries = VISIT_DEFAULT_MAX_ENTRIES;
        }

        self.stat(function (err, stats) {
            if (err) {
                callback(err);
                return;
            }

            self._visitHelper(stats, {}, visitor, options)
                .then(()=>{
                    callback(null);
                })
                .catch((err)=>{
                    callback(err);
                });
        });
    };

    // Export this class
    module.exports = FileSystemEntry;
});
