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

/*global appshell, Phoenix*/
/*eslint-env es6*/
// jshint ignore: start

define(function (require, exports, module) {


    var FileUtils           = require("file/FileUtils"),
        FileSystemStats     = require("filesystem/FileSystemStats"),
        FileSystemError     = require("filesystem/FileSystemError");

    /**
     * @const
     */
    var FILE_WATCHER_BATCH_TIMEOUT = 200;   // 200ms - granularity of file watcher changes

    /**
     * Callback to notify FileSystem of watcher changes
     * @type {?function(string, FileSystemStats=)}
     */
    var _changeCallback;

    /**
     * Callback to notify FileSystem if watchers stop working entirely
     * @type {?function()}
     */
    var _offlineCallback;

    /** Timeout used to batch up file watcher changes (setTimeout() return value) */
    var _changeTimeout;

    /**
     * Pending file watcher changes - map from fullPath to flag indicating whether we need to pass stats
     * to _changeCallback() for this path.
     * @type {!Object.<string, boolean>}
     */
    var _pendingChanges = {};

    /**
     * Enqueue a file change event for eventual reporting back to the FileSystem.
     *
     * @param {string} changedPath The path that was changed
     * @param {object} stats Stats coming from the underlying watcher, if available
     * @private
     */
    function _enqueueChange(changedPath, stats) {
        _pendingChanges[changedPath] = stats;
        if (!_changeTimeout) {
            _changeTimeout = window.setTimeout(function () {
                if (_changeCallback) {
                    Object.keys(_pendingChanges).forEach(function (path) {
                        _changeCallback(path, _pendingChanges[path]);
                    });
                }

                _changeTimeout = null;
                _pendingChanges = {};
            }, FILE_WATCHER_BATCH_TIMEOUT);
        }
    }

    /**
     * Register Event handler for file system change event
     *
     * @param {string} pathToWatch the path that is being watched
     * @param {string} eventEmitter
     * * @param {string=} fullPath The full path that has changed
     * @private
     */
    function _registerChangeEventListeners(pathToWatch, eventEmitter) {
        function reloadParentDirContents({path}) {
            const changedPath = path;
            let pathToReload = _normalise_path(changedPath);
            if(pathToReload !== pathToWatch) {
                // if the changed path is the path being watched itself, we don't issue reload on its parent.
                // else file/directory was created/deleted; fire change on parent to reload contents
                pathToReload = appshell.path.dirname(changedPath);
            }
            _enqueueChange(`${pathToReload}/`, null);
        }
        eventEmitter.on(appshell.fs.WATCH_EVENTS.ADD_FILE, reloadParentDirContents);
        eventEmitter.on(appshell.fs.WATCH_EVENTS.ADD_DIR, reloadParentDirContents);
        eventEmitter.on(appshell.fs.WATCH_EVENTS.UNLINK_DIR, reloadParentDirContents);
        eventEmitter.on(appshell.fs.WATCH_EVENTS.UNLINK_FILE, reloadParentDirContents);
        eventEmitter.on(appshell.fs.WATCH_EVENTS.CHANGE, ({path})=>{
            const changedPath = path;
            stat(changedPath, (err, newStat) => {
                // fire change event irrespective of error. if err, stat will be null.
                _enqueueChange(changedPath, newStat);
            });
        });
    }

    /**
     * Initialize file watching for this filesystem, using the supplied
     * changeCallback to provide change notifications. The first parameter of
     * changeCallback specifies the changed path (either a file or a directory);
     * if this parameter is null, it indicates that the implementation cannot
     * specify a particular changed path, and so the callers should consider all
     * paths to have changed and to update their state accordingly. The second
     * parameter to changeCallback is an optional FileSystemStats object that
     * may be provided in case the changed path already exists and stats are
     * readily available. The offlineCallback will be called in case watchers
     * are no longer expected to function properly. All watched paths are
     * cleared when the offlineCallback is called.
     *
     * @param {function(?string, FileSystemStats=)} changeCallback
     * @param {function()=} offlineCallback
     */
    function initWatchers(changeCallback, offlineCallback) {
        _changeCallback = changeCallback;
        _offlineCallback = offlineCallback;

        if (_offlineCallback) {
            _offlineCallback();
        }
    }

    const _watchEventListeners = {};

    /**
     * Start providing change notifications for the file or directory at the
     * given path, calling back asynchronously with a possibly null FileSystemError
     * string when the initialization is complete. Notifications are provided
     * using the changeCallback function provided by the initWatchers method.
     * Note that change notifications are only provided recursively for directories
     * when the recursiveWatch property of this module is true.
     *
     * @param {string} pathToWatch
     * @param {Array<string>|string} ignored
     * @param {function(?string)=} callback
     */
    function watchPath(pathToWatch, ignored, callback) {
        console.log('Watch path: ', pathToWatch, ignored);
        pathToWatch = _normalise_path(pathToWatch);
        appshell.fs.watchAsync(pathToWatch, ignored)
            .then(eventEmitter=>{
                _watchEventListeners[pathToWatch] = eventEmitter;
                _registerChangeEventListeners(pathToWatch, eventEmitter);
                callback(null);
            })
            .catch(err=>{
                callback(_mapError(err));
            });
    }
    /**
     * Stop providing change notifications for the file or directory at the
     * given path, calling back asynchronously with a possibly null FileSystemError
     * string when the operation is complete.
     * This function needs to mirror the signature of watchPath
     * because of FileSystem.prototype._watchOrUnwatchEntry implementation.
     *
     * @param {string} pathBeingWatched
     * @param {Array<string>} ignored
     * @param {function(?string)=} callback
     */
    function unwatchPath(pathBeingWatched, ignored, callback) {
        console.log('unwatch path: ', pathBeingWatched);
        pathBeingWatched = _normalise_path(pathBeingWatched);
        const eventEmitter = _watchEventListeners[pathBeingWatched];
        delete _watchEventListeners[pathBeingWatched];
        appshell.fs.unwatchAsync(eventEmitter)
            .then(()=>{
                callback(null);
            }).catch(err=>{
                callback(_mapError(err));
            });
    }

    /**
     * Stop providing change notifications for all previously watched files and
     * directories, optionally calling back asynchronously with a possibly null
     * FileSystemError string when the operation is complete.
     *
     * @param {function(?string)=} callback
     */
    function unwatchAll(callback) {
        const allUnwatchPromises = [];
        for(let pathBeingWatched of Object.keys(_watchEventListeners)) {
            const eventEmitter = _watchEventListeners[pathBeingWatched];
            delete _watchEventListeners[pathBeingWatched];
            allUnwatchPromises.push(appshell.fs.unwatchAsync(eventEmitter));
        }
        Promise.all(allUnwatchPromises).then(()=>{
            callback(null);
        }).catch(err=>{
            callback(_mapError(err));
        });
    }


    /**
     * Convert appshell error codes to FileSystemError values.
     *
     * @param {?number} err An appshell error code
     * @return {?string} A FileSystemError string, or null if there was no error code.
     * @private
     */
    function _mapError(err) {
        if (!err) {
            return null;
        }

        const FS_ERROR_CODES = window.Phoenix.app.ERR_CODES.FS_ERROR_CODES;
        console.log('appshell fs error: ', err);

        switch (err.code) {
        case FS_ERROR_CODES.EINVAL:
            return FileSystemError.INVALID_PARAMS;
        case FS_ERROR_CODES.ENOENT:
            return FileSystemError.NOT_FOUND;
        case FS_ERROR_CODES.EIO:
            return FileSystemError.NOT_READABLE;
        case FS_ERROR_CODES.EROFS:
            return FileSystemError.NOT_WRITABLE;
        case FS_ERROR_CODES.ECHARSET:
            return FileSystemError.UNSUPPORTED_ENCODING;
        case FS_ERROR_CODES.ENOSPC:
            return FileSystemError.OUT_OF_SPACE;
        case FS_ERROR_CODES.EEXIST:
            return FileSystemError.ALREADY_EXISTS;
        case FS_ERROR_CODES.ECHARSET:
            return FileSystemError.ENCODE_FILE_FAILED;
        case FS_ERROR_CODES.ECHARSET:
            return FileSystemError.DECODE_FILE_FAILED;
        case FS_ERROR_CODES.ECHARSET:
            return FileSystemError.UNSUPPORTED_UTF16_ENCODING;
        }

        console.error('unknown error: ', err);
        return FileSystemError.UNKNOWN;
    }

    /**
     * Normalises path.
     *
     * @param {string} path The path to normalise
     * @return {string} Normalised path.
     * @private
     */
    function _normalise_path(path) {
        return window.Phoenix.VFS.path.normalize(path);
    }

    /**
     * Convert a callback to one that transforms its first parameter from an
     * appshell error code to a FileSystemError string.
     *
     * @param {function(?number)} cb A callback that expects an appshell error code
     * @return {function(?string)} A callback that expects a FileSystemError string
     * @private
     */
    function _wrap(cb) {
        return function (err) {
            var args = Array.prototype.slice.call(arguments);
            args[0] = _mapError(args[0]);
            cb.apply(null, args);
        };
    }

    /**
     * Display an open-files dialog to the user and call back asynchronously with
     * either a FileSystmError string or an array of path strings, which indicate
     * the entry or entries selected.
     *
     * @param {boolean} allowMultipleSelection
     * @param {boolean} chooseDirectories
     * @param {string} title
     * @param {string} initialPath
     * @param {Array.<string>=} fileTypes
     * @param {function(?string, Array.<string>=)} callback
     */
    function showOpenDialog(allowMultipleSelection, chooseDirectories, title, initialPath, fileTypes, callback) {
        const wrappedCallback = _wrap(callback);
        if(Phoenix.browser.isTauri){
            appshell.fs.openTauriFilePickerAsync({
                multiple: allowMultipleSelection,
                directory: chooseDirectories,
                title,
                defaultPath: Phoenix.fs.getTauriPlatformPath(initialPath),
                filters: fileTypes ? [{
                    name: "openDialog",
                    extensions: fileTypes || []
                }] : undefined
            }).then(directory => {
                if(!directory) {
                    wrappedCallback(FileSystemError.NOT_READABLE);
                    return;
                }
                if(typeof directory === 'string') {
                    wrappedCallback(null, [directory]);
                    return;
                }
                wrappedCallback(null, directory); // is an array of paths
            }).catch(wrappedCallback);
            return;
        }
        appshell.fs.mountNativeFolder(wrappedCallback);
    }

    /**
     * Display a save-file dialog and call back asynchronously with either a
     * FileSystemError string or the path to which the user has chosen to save
     * the file. If the dialog is cancelled, the path string will be empty.
     *
     * @param {string} title
     * @param {string} initialPath
     * @param {string} proposedNewFilename
     * @param {function(?string, string=)} callback
     */
    function showSaveDialog(title, initialPath, proposedNewFilename, callback) {
        appshell.fs.showSaveDialog(title, initialPath, proposedNewFilename, _wrap(callback));
    }

    function _createStatObject(stats, realPath) {
        const hash = stats.mtime? stats.mtime.getTime() : null;
        var options = {
            isFile: stats.isFile(),
            mtime: stats.mtime,
            size: stats.size,
            realPath: stats.realPath || realPath,
            hash: hash
        };
        return  new FileSystemStats(options);
    }

    /**
     * Stat the file or directory at the given path, calling back
     * asynchronously with either a FileSystemError string or the entry's
     * associated FileSystemStats object.
     *
     * @param {string} path
     * @param {function(?string, FileSystemStats=)} callback
     */
    function stat(path, callback) {
        console.log('stat: ', path);
        path = _normalise_path(path);
        appshell.fs.stat(path, function (err, stats) {
            if (err) {
                callback(_mapError(err));
            } else {
                var fsStats = _createStatObject(stats, path);
                callback(null, fsStats);
            }
        });
    }

    /**
     * Determine whether a file or directory exists at the given path by calling
     * back asynchronously with either a FileSystemError string or a boolean,
     * which is true if the file exists and false otherwise. The error will never
     * be FileSystemError.NOT_FOUND; in that case, there will be no error and the
     * boolean parameter will be false.
     *
     * @param {string} path
     * @param {function(?string, boolean)} callback
     */
    function exists(path, callback) {
        console.log('exists: ', path);
        path = _normalise_path(path);
        stat(path, function (err) {
            if (err) {
                if (err === FileSystemError.NOT_FOUND) {
                    callback(null, false);
                } else {
                    callback(err);
                }
                return;
            }

            callback(null, true);
        });
    }

    /**
     * Determine whether a file or directory exists at the given path by calling
     * back asynchronously with either a FileSystemError string or a boolean,
     * which is true if the file exists and false otherwise. The error will never
     * be FileSystemError.NOT_FOUND; in that case, there will be no error and the
     * boolean parameter will be false.
     *
     * @param {string} path
     * @param {function(?string, boolean)} callback
     */
    function existsAsync(path) {
        console.log('exists: ', path);
        return new Promise(function (resolve, reject) {
            exists(path, function (err, existStatus) {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(existStatus);
            });
        });
    }

    /**
     * Read the contents of the directory at the given path, calling back
     * asynchronously either with a FileSystemError string or an array of
     * FileSystemEntry objects along with another consistent array, each index
     * of which either contains a FileSystemStats object for the corresponding
     * FileSystemEntry object in the second parameter or a FileSystemError
     * string describing a stat error.
     *
     * @param {string} path
     * @param {function(?string, Array.<FileSystemEntry>=, Array.<string|FileSystemStats>=)} callback
     */
    function readdir(path, callback) {
        console.log('readdir: ', path);
        path = _normalise_path(path);
        appshell.fs.readdir(path, {withFileTypes: true}, function (err, stats) {
            if (err) {
                callback(_mapError(err));
                return;
            }

            var count = stats.length;
            if (!count) {
                callback(null, [], []);
                return;
            }

            let contents = [],
                statsObject =[];

            stats.forEach(function (entryStat) {
                contents.push(entryStat.name);
                let entryPath = `${path}/${entryStat.name}`;
                statsObject.push(_createStatObject(entryStat, entryPath));
            });
            callback(null, contents, statsObject);
        });
    }

    /**
     * Create a directory at the given path, and call back asynchronously with
     * either a FileSystemError string or a stats object for the newly created
     * directory. The octal mode parameter is optional; if unspecified, the mode
     * of the created directory is implementation dependent.
     *
     * @param {string} path
     * @param {number=} mode The base-eight mode of the newly created directory.
     * @param {function(?string, FileSystemStats=)=} callback
     */
    function mkdir(path, mode, callback) {
        console.log('mkdir: ', path);
        path = _normalise_path(path);
        if (typeof mode === "function") {
            callback = mode;
            mode = 0o755;
        }
        appshell.fs.mkdirs(path, mode, true, function (err) {
            if (err) {
                callback(_mapError(err));
            } else {
                stat(path, function (err, stat) {
                    callback(err, stat);
                });
            }
        });
    }

    /**
     * copies a file/folder path from src to destination recursively. follows unix copy semantics mostly.
     * As with unix copy, the destination path may not be exactly the `dst` path provided.
     * Eg. copy("/a/b", "/a/x") -> will copy to `/a/x/b` if folder `/a/x` exists. If dst `/a/x` not exists,
     * then copy will honor the given destination `/a/x`
     *
     * @param {string} src Absolute path of file or directory to copy
     * @param {string} dst Absolute path of file or directory destination
     * @param {function(err, string)} callback Callback with err or stat of copied destination.
     */
    function copy(src, dst, callback) {
        console.log('copy: ', src);
        src = _normalise_path(src);
        dst = _normalise_path(dst);
        appshell.fs.copy(src, dst, function (err, copiedPath) {
            if (err) {
                callback(_mapError(err));
            } else {
                stat(copiedPath, function (err, stat) {
                    callback(err, stat);
                });
            }
        });
    }

    /**
     * Rename the file or directory at oldPath to newPath, and call back
     * asynchronously with a possibly null FileSystemError string.
     *
     * @param {string} oldPath
     * @param {string} newPath
     * @param {function(?string)=} callback
     */
    function rename(oldPath, newPath, callback) {
        console.log('rename: ', oldPath, ' to ', newPath);
        oldPath = _normalise_path(oldPath);
        newPath = _normalise_path(newPath);
        appshell.fs.rename(oldPath, newPath, _wrap(callback));
    }

    /**
     * Read the contents of the file at the given path, calling back
     * asynchronously with either a FileSystemError string, or with the data and
     * the FileSystemStats object associated with the read file. The options
     * parameter can be used to specify an encoding (default "utf8"), and also
     * a cached stats object that the implementation is free to use in order
     * to avoid an additional stat call.
     *
     * Note: if either the read or the stat call fails then neither the read data
     * nor stat will be passed back, and the call should be considered to have failed.
     * If both calls fail, the error from the read call is passed back.
     *
     * @param {string} path
     * @param {{encoding: string=, stat: FileSystemStats=}} options
     * @param {function(?string, string=, FileSystemStats=)} callback
     */
    function readFile(path, options, callback) {
        console.log('Reading file: ', path);
        path = _normalise_path(path);
        var encoding = window.Phoenix.VFS.getFsEncoding(options.encoding) || "utf8";

        // callback to be executed when the call to stat completes
        //  or immediately if a stat object was passed as an argument
        function doReadFile(stat) {
            if (stat.size > (FileUtils.MAX_FILE_SIZE)) {
                callback(FileSystemError.EXCEEDS_MAX_FILE_SIZE);
            } else {
                appshell.fs.readFile(path, encoding, function (_err, _data, encoding, preserveBOM) {
                    if (_err) {
                        callback(_mapError(_err));
                    } else {
                        callback(null, _data, encoding, preserveBOM, stat);
                    }
                });
            }
        }

        if (options.stat) {
            doReadFile(options.stat);
        } else {
            exports.stat(path, function (_err, _stat) {
                if (_err) {
                    callback(_err);
                } else {
                    doReadFile(_stat);
                }
            });
        }
    }
    /**
     * Write data to the file at the given path, calling back asynchronously with
     * either a FileSystemError string or the FileSystemStats object associated
     * with the written file and a boolean that indicates whether the file was
     * created by the write (true) or not (false). If no file exists at the
     * given path, a new file will be created. The options parameter can be used
     * to specify an encoding (default "utf8"), an octal mode (default
     * unspecified and implementation dependent), and a consistency hash, which
     * is used to the current state of the file before overwriting it. If a
     * consistency hash is provided but does not match the hash of the file on
     * disk, a FileSystemError.CONTENTS_MODIFIED error is passed to the callback.
     *
     * @param {string} path
     * @param {string} data
     * @param {{encoding : string=, mode : number=, expectedHash : object=, expectedContents : string=}} options
     * @param {function(?string, FileSystemStats=, boolean)} callback
     */
    function writeFile(path, data, options, callback) {
        console.log('Write file: ', path);
        path = _normalise_path(path);
        var encoding = window.Phoenix.VFS.getFsEncoding(options.encoding) || "utf8",
            preserveBOM = options.preserveBOM;

        function _finishWrite(created) {
            appshell.fs.writeFile(path, data, encoding, preserveBOM, function (err) {
                if (err) {
                    callback(_mapError(err));
                } else {
                    stat(path, function (err, stat) {
                        callback(err, stat, created);
                    });
                }
            });
        }

        stat(path, function (err, stats) {
            if (err) {
                switch (err) {
                case FileSystemError.NOT_FOUND:
                    _finishWrite(true);
                    break;
                default:
                    callback(err);
                }
                return;
            }

            if (options.hasOwnProperty("expectedHash") && options.expectedHash !== stats._hash) {
                console.error("Blind write attempted: ", path, stats._hash, options.expectedHash);

                if (options.hasOwnProperty("expectedContents")) {
                    appshell.fs.readFile(path, encoding, function (_err, _data) {
                        if (_err || _data !== options.expectedContents) {
                            callback(FileSystemError.CONTENTS_MODIFIED);
                            return;
                        }

                        _finishWrite(false);
                    });
                    return;
                }
                callback(FileSystemError.CONTENTS_MODIFIED);
                return;

            }

            _finishWrite(false);
        });
    }

    /**
     * Unlink (i.e., permanently delete) the file or directory at the given path,
     * calling back asynchronously with a possibly null FileSystemError string.
     * Directories will be unlinked even when non-empty.
     *
     * @param {string} path
     * @param {function(string)=} callback
     */
    function unlink(path, callback) {
        console.log('delete file: ', path);
        path = _normalise_path(path);
        appshell.fs.unlink(path, function (err) {
            callback(_mapError(err));
        });
    }

    /**
     * Move the file or directory at the given path to a system dependent trash
     * location, calling back asynchronously with a possibly null FileSystemError
     * string. Directories will be moved even when non-empty.
     *
     * @param {string} path
     * @param {function(string)=} callback
     */
    function moveToTrash(path, callback) {
        console.log('Trash file: ', path);
        path = _normalise_path(path);
        appshell.fs.moveToTrash(path, function (err) {
            callback(_mapError(err));
        });
    }

    // Export public API
    exports.showOpenDialog  = showOpenDialog;
    exports.showSaveDialog  = showSaveDialog;
    exports.exists          = exists;
    exports.existsAsync     = existsAsync;
    exports.readdir         = readdir;
    exports.mkdir           = mkdir;
    exports.rename          = rename;
    exports.copy            = copy;
    exports.stat            = stat;
    exports.readFile        = readFile;
    exports.writeFile       = writeFile;
    exports.unlink          = unlink;
    exports.moveToTrash     = moveToTrash;
    exports.initWatchers    = initWatchers;
    exports.watchPath       = watchPath;
    exports.unwatchPath     = unwatchPath;
    exports.unwatchAll      = unwatchAll;
    exports.pathLib         = window.Phoenix.VFS.path;

    /**
     * Indicates whether or not the filesystem should expect and normalize UNC
     * paths. If set, then //server/directory/ is a normalized path; otherwise the
     * filesystem will normalize it to /server/directory. Currently, UNC path
     * normalization only occurs on Windows.
     *
     * @type {boolean}
     */
    exports.normalizeUNCPaths = brackets.platform === "win";
});
