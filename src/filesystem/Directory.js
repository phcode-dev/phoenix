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

define(function (require, exports, module) {


    const FileSystemEntry = require("filesystem/FileSystemEntry"),
        FileSystem = require("filesystem/FileSystem");

    /*
     * Model for a file system Directory.
     *
     * This class should *not* be instantiated directly. Use FileSystem.getDirectoryForPath,
     * FileSystem.resolve, or Directory.getContents to create an instance of this class.
     *
     * Note: Directory.fullPath always has a trailing slash.
     *
     * See the FileSystem class for more details.
     *
     * @constructor
     * @param {!string} fullPath The full path for this Directory.
     * @param {!FileSystem} fileSystem The file system associated with this Directory.
     */
    function Directory(fullPath, fileSystem) {
        this._isDirectory = true;
        FileSystemEntry.call(this, fullPath, fileSystem);
    }

    Directory.prototype = Object.create(FileSystemEntry.prototype);
    Directory.prototype.constructor = Directory;
    Directory.prototype.parentClass = FileSystemEntry.prototype;

    /**
     * The contents of this directory. This "private" property is used by FileSystem.
     * @type {Array<FileSystemEntry>}
     */
    Directory.prototype._contents = null;

    /**
     * The stats for the contents of this directory, such that this._contentsStats[i]
     * corresponds to this._contents[i].
     * @type {Array.<FileSystemStats>}
     */
    Directory.prototype._contentsStats = null;

    /**
     * The stats errors for the contents of this directory.
     * @type {object.<string: string>} fullPaths are mapped to FileSystemError strings
     */
    Directory.prototype._contentsStatsErrors = null;

    /**
     * Clear any cached data for this directory. By default, we clear the contents
     * of immediate children as well, because in some cases file watchers fail
     * provide precise change notifications. (Sometimes, like after a "git
     * checkout", they just report that some directory has changed when in fact
     * many of the file within the directory have changed.
     *
     * @private
     * @param {boolean=} preserveImmediateChildren
     */
    Directory.prototype._clearCachedData = function (preserveImmediateChildren) {
        FileSystemEntry.prototype._clearCachedData.apply(this);

        if (!preserveImmediateChildren) {
            if (this._contents) {
                this._contents.forEach(function (child) {
                    child._clearCachedData(true);
                });
            } else {
                // No cached _contents, but child entries may still exist.
                // Scan the full index to catch all of them.
                var dirPath = this.fullPath;
                this._fileSystem._index.visitAll(function (entry) {
                    if (entry.parentPath === dirPath) {
                        entry._clearCachedData(true);
                    }
                });
            }
        }

        this._contents = undefined;
        this._contentsStats = undefined;
        this._contentsStatsErrors = undefined;
    };

    /**
     * Apply each callback in a list to the provided arguments. Callbacks
     * can throw without preventing other callbacks from being applied.
     *
     * @private
     * @param {Array.<function>} callbacks The callbacks to apply
     * @param {Array} args The arguments to which each callback is applied
     */
    function _applyAllCallbacks(callbacks, args) {
        if (callbacks.length > 0) {
            var callback = callbacks.pop();
            try {
                callback.apply(undefined, args);
            } finally {
                _applyAllCallbacks(callbacks, args);
            }
        }
    }

    /**
     * Returns true if is a directory exists and is empty.
     *
     * @return {Promise<boolean>} True if directory is empty and it exists, else false.
     */
    Directory.prototype.isEmptyAsync = function () {
        let that = this;
        return new Promise((resolve, reject)=>{
            that.getContents((err, contents) =>{
                if(err){
                    reject(err);
                    return;
                }
                resolve(contents.length === 0);
            });
        });
    };

    /**
     * Recursively deletes all empty subdirectories within the current directory. If all subdirectories are empty,
     * the current directory itself will be deleted.
     * A directory is considered empty if it doesn't contain any files in its subtree.
     *
     * If a subtree contains a large number of nested subdirectories and no files, the whole tree will be deleted.
     * Only branches that contain a file will be retained.
     *
     * @returns {Promise<void>} A Promise that resolves when the operation is finished
     * @throws {FileSystemError} If an error occurs while accessing the filesystem
     *
     * @example
     *
     * await dir.unlinkEmptyDirectoryAsync();
     */
    Directory.prototype.unlinkEmptyDirectoryAsync = async function () {
        let that = this;
        let {entries} = await that.getContentsAsync();
        for(let entry of entries){
            if(entry.isDirectory) {
                await entry.unlinkEmptyDirectoryAsync();
            }
        }
        let isEmpty = await that.isEmptyAsync();
        if(isEmpty){
            await that.unlinkAsync();
        }
    };

    /**
     * Read the contents of a Directory, returns a promise. It filters out all files
     * that are not shown in the file tree by default, unless the filterNothing option is specified.
     *
     * @param {boolean} filterNothing - is specified, will return a true contents of dir as shown in disc,
     *      weather it is shown in the file tree or not. Can be used for backup/restore flows.
     *
     * @return {Promise<{entries: FileSystemEntry, contentStats: FileSystemStats, contentsStatsErrors}>} An object
     * with attributes - entries(an array of file system entries), contentStats and contentsStatsErrors(a map from
     * content name to error if there is any).
     */
    Directory.prototype.getContentsAsync = function (filterNothing= false) {
        let that = this;
        return new Promise((resolve, reject)=>{
            that.getContents((err, contents, entriesStats, entriesStatsErrors) =>{
                if(err){
                    reject(err);
                    return;
                }
                resolve({entries: contents, entriesStats, entriesStatsErrors});
            }, filterNothing);
        });
    };

    /**
     * Read the contents of a Directory. It filters out all files
     * that are not shown in the file tree by default, unless the filterNothing option is specified.
     *
     * @param {function (?string, Array.<FileSystemEntry>=, Array.<FileSystemStats>=, Object.<string, string>=)} callback
     *          Callback that is passed an error code or the stat-able contents
     *          of the directory along with the stats for these entries and a
     *          fullPath-to-FileSystemError string map of unstat-able entries
     *          and their stat errors. If there are no stat errors then the last
     *          parameter shall remain undefined.
     * @param {boolean} filterNothing - is specified, will return a true contents of dir as shown in disc,
     *      weather it is shown in the file tree or not. Can be used for backup/restore flows.
     */
    Directory.prototype.getContents = function (callback, filterNothing = false) {
        if(!filterNothing) {
            if (this._contentsCallbacks) {
                // There is already a pending call for this directory's contents.
                // Push the new callback onto the stack and return.
                this._contentsCallbacks.push(callback);
                return;
            }

            // Return cached contents if the directory is watched
            // we only cache filtered results, if unfiltered results are needed, do a disc lookup again
            // as filterNothing is usually used by disc backup flows.
            if (this._contents) {
                callback(null, this._contents, this._contentsStats, this._contentsStatsErrors);
                return;
            }

            this._contentsCallbacks = [callback];
        }

        this._impl.readdir(this.fullPath, function (err, names, stats) {
            var contents = [],
                contentsStats = [],
                contentsStatsErrors;

            if (err) {
                this._clearCachedData();
            } else {
                // Use the "relaxed" parameter to _isWatched because it's OK to
                // cache data even while watchers are still starting up
                var watched = this._isWatched(true);

                names.forEach(function (name, index) {
                    var entryPath = this.fullPath + name;

                    var entryStats = stats[index];
                    if (FileSystem.fileTreeFilter(name) || filterNothing) {
                        var entry;

                        // Note: not all entries necessarily have associated stats.
                        if (typeof entryStats === "string") {
                            // entryStats is an error string
                            if (contentsStatsErrors === undefined) {
                                contentsStatsErrors = {};
                            }
                            contentsStatsErrors[entryPath] = entryStats;
                        } else {
                            // entryStats is a FileSystemStats object
                            if (entryStats.isFile) {
                                entry = this._fileSystem.getFileForPath(entryPath);
                            } else {
                                entry = this._fileSystem.getDirectoryForPath(entryPath);
                            }

                            if (watched) {
                                entry._stat = entryStats;
                            }

                            contents.push(entry);
                            contentsStats.push(entryStats);
                        }
                    }
                }, this);

                if (watched && !filterNothing) {
                    this._contents = contents;
                    this._contentsStats = contentsStats;
                    this._contentsStatsErrors = contentsStatsErrors;
                }
            }

            if(!filterNothing){
                // Reset the callback list before we begin calling back so that
                // synchronous reentrant calls are handled correctly.
                var currentCallbacks = this._contentsCallbacks;

                this._contentsCallbacks = null;

                // Invoke all saved callbacks
                var callbackArgs = [err, contents, contentsStats, contentsStatsErrors];
                _applyAllCallbacks(currentCallbacks, callbackArgs);
            } else {
                callback(err, contents, contentsStats, contentsStatsErrors);
            }
        }.bind(this));
    };

    /**
     * Create a directory and returns a promise that will resolve to a stat
     *
     * @return {Promise<FileSystemStats>} resolves to the stats of the newly created dir.
     */
    Directory.prototype.createAsync = function () {
        let that = this;
        return new Promise((resolve, reject)=>{
            that.create((err, stat)=>{
                if(err){
                    reject(err);
                    return;
                }
                resolve(stat);
            });
        });
    };

    /**
     * Create a directory
     *
     * @param {function (?string, FileSystemStats=)=} callback Callback resolved with a
     *      FileSystemError string or the stat object for the created directory.
     */
    Directory.prototype.create = function (callback) {
        callback = callback || function () {};

        // Block external change events until after the write has finished
        this._fileSystem._beginChange();

        this._impl.mkdir(this._path, function (err, stat) {
            if (err) {
                this._clearCachedData();
                try {
                    callback(err);
                    return;
                } finally {
                    // Unblock external change events
                    this._fileSystem._endChange();
                }
            }

            var parent = this._fileSystem.getDirectoryForPath(this.parentPath);

            // Update internal filesystem state
            if (this._isWatched()) {
                this._stat = stat;
            }

            this._fileSystem._handleDirectoryChange(parent, function (added, removed) {
                try {
                    callback(null, stat);
                } finally {
                    if (parent._isWatched()) {
                        this._fileSystem._fireChangeEvent(parent, added, removed);
                    }
                    // Unblock external change events
                    this._fileSystem._endChange();
                }
            }.bind(this));
        }.bind(this));
    };

    // Export this class
    module.exports = Directory;
});
