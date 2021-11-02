/*
 * GNU AGPL-3.0 License
 *
 * Modified Work Copyright (c) 2021 - present core.ai . All rights reserved.
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


    var FileSystemError     = require("filesystem/FileSystemError"),
        MockFileSystemModel = require("./MockFileSystemModel");

    // A sychronous model of a file system
    var _model;

    // Watcher change callback function
    var _changeCallback;

    // Watcher offline callback function
    var _offlineCallback;

    // Indicates whether, by default, the FS should perform UNC Path normalization
    var _normalizeUNCPathsDefault = false;

    // Indicates whether, by default, the FS should perform watch and unwatch recursively
    var _recursiveWatchDefault = true;

    // Callback hooks, set in when(). See when() for more details.
    var _hooks;

    function _getHookEntry(method, path) {
        return _hooks[method] && _hooks[method][path];
    }

    function _getCallback(method, path, cb) {
        var entry = _getHookEntry(method, path),
            result = entry && entry(cb);

        if (!result) {
            result = cb;
        }
        return result;
    }

    function showOpenDialog(allowMultipleSelection, chooseDirectories, title, initialPath, fileTypes, callback) {
        // Not implemented
        callback(null, null);
    }

    function showSaveDialog(title, initialPath, proposedNewFilename, callback) {
        // Not implemented
        callback(null, null);
    }

    function exists(path, callback) {
        var cb = _getCallback("exists", path, callback);
        cb(null, _model.exists(path));
    }

    function readdir(path, callback) {
        var cb = _getCallback("readdir", path, callback);

        if (!_model.exists(path)) {
            cb(FileSystemError.NOT_FOUND);
            return;
        }

        var contents = _model.readdir(path),
            trimmedPath = path.substring(0, path.length - 1),
            stats = contents.map(function (name) {
                return _model.stat(trimmedPath + name);
            });

        cb(null, contents, stats, []);
    }

    function mkdir(path, mode, callback) {
        if (typeof (mode) === "function") {
            callback = mode;
            mode = null;
        }

        var cb = _getCallback("mkdir", path, callback);

        if (_model.exists(path)) {
            cb(FileSystemError.ALREADY_EXISTS);
        } else {
            _model.mkdir(path);
            cb(null, _model.stat(path));
        }
    }

    function rename(oldPath, newPath, callback) {
        var cb = _getCallback("rename", oldPath, callback);

        if (_model.exists(newPath)) {
            cb(FileSystemError.ALREADY_EXISTS);
        } else if (!_model.exists(oldPath)) {
            cb(FileSystemError.NOT_FOUND);
        } else {
            _model.rename(oldPath, newPath);
            cb(null);
        }
    }

    function stat(path, callback) {
        var cb = _getCallback("stat", path, callback);

        if (!_model.exists(path)) {
            cb(FileSystemError.NOT_FOUND);
        } else {
            cb(null, _model.stat(path));
        }
    }

    function readFile(path, options, callback) {
        if (typeof (options) === "function") {
            callback = options;
            options = null;
        }

        var cb = _getCallback("readFile", path, callback);

        if (!_model.exists(path)) {
            cb(FileSystemError.NOT_FOUND);
        } else {
            cb(null, _model.readFile(path), "UTF-8", false, _model.stat(path));
        }
    }

    function writeFile(path, data, options, callback) {
        if (typeof (options) === "function") {
            callback = options;
            options = null;
        }

        var cb = _getCallback("writeFile", path, callback);

        if (_model.exists(path) && options.hasOwnProperty("expectedHash") && options.expectedHash !== _model.stat(path)._hash) {
            if (options.hasOwnProperty("expectedContents")) {
                if (options.expectedContents !== _model.readFile(path)) {
                    cb(FileSystemError.CONTENTS_MODIFIED);
                    return;
                }
            } else {
                cb(FileSystemError.CONTENTS_MODIFIED);
                return;
            }
        }

        _model.writeFile(path, data);
        cb(null, _model.stat(path));
    }

    function unlink(path, callback) {
        var cb = _getCallback("unlink", path, callback);

        if (!_model.exists(path)) {
            cb(FileSystemError.NOT_FOUND);
        } else {
            _model.unlink(path);
            cb(null);
        }
    }

    function initWatchers(changeCallback, offlineCallback) {
        _changeCallback = changeCallback;
        _offlineCallback = offlineCallback;
    }

    function watchPath(path, ignored, callback) {
        var cb = _getCallback("watchPath", path, callback);

        _model.watchPath(path);
        cb(null);
    }

    function unwatchPath(path, ignored, callback) {
        var cb = _getCallback("unwatchPath", path, callback);
        _model.unwatchPath(path);
        cb(null);
    }

    function unwatchAll(callback) {
        var cb = _getCallback("unwatchAll", null, callback);
        _model.unwatchAll();
        cb(null);
    }


    exports.showOpenDialog  = showOpenDialog;
    exports.showSaveDialog  = showSaveDialog;
    exports.exists          = exists;
    exports.readdir         = readdir;
    exports.mkdir           = mkdir;
    exports.rename          = rename;
    exports.stat            = stat;
    exports.readFile        = readFile;
    exports.writeFile       = writeFile;
    exports.unlink          = unlink;
    exports.initWatchers    = initWatchers;
    exports.watchPath       = watchPath;
    exports.unwatchPath     = unwatchPath;
    exports.unwatchAll      = unwatchAll;

    exports.normalizeUNCPaths = _normalizeUNCPathsDefault;
    exports.recursiveWatch = _recursiveWatchDefault;

    // Test methods
    exports.reset = function () {
        _model = new MockFileSystemModel();
        _hooks = {};
        _changeCallback = null;
        _offlineCallback = null;

        _model.on("change", function (event, path) {
            if (_changeCallback) {
                var cb = _getCallback("change", path, _changeCallback);
                cb(path, _model.stat(path));
            }
        });

        exports.normalizeUNCPaths = _normalizeUNCPathsDefault;
        exports.recursiveWatch = _recursiveWatchDefault;

        // Allows unit tests to manipulate the filesystem directly in order to
        // simulate external change events
        exports._model = _model;
    };

    // Simulate file watchers going offline
    exports.goOffline = function () {
        if (_offlineCallback) {
            _offlineCallback();
        }
    };

    /**
     * Add callback hooks to be used when specific methods are called with a
     * specific path.
     *
     * @param {string} method The name of the method. The special name "change"
     *          may be used to hook the "change" event handler as well.
     * @param {string} path The path that must be matched
     * @param {function} getCallback A function that has one parameter and
     *           must return a callback function.
     *
     * Here is an example that delays the callback by 300ms when writing a file
     * named "/foo.txt".
     *
     * function delayedCallback(cb) {
     *     return function () {
     *         var args = arguments;
     *         setTimeout(function () {
     *             cb.apply(null, args);
     *         }, 300);
     *     };
     * }
     *
     * MockFileSystem.when("writeFile", "/foo.txt", delayedCallback);
     */
    exports.when = function (method, path, getCallback) {
        if (!_hooks[method]) {
            _hooks[method] = {};
        }
        _hooks[method][path] = getCallback;
    };
});
