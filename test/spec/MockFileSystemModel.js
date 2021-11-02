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


    var FileSystemStats = require("filesystem/FileSystemStats"),
        EventDispatcher = require("utils/EventDispatcher");

    // Initial file system data.
    var _initialData = {
        "/": {
            isFile: false,
            mtime: new Date()
        },
        "/file1.txt": {
            isFile: true,
            mtime: new Date(),
            contents: "File 1 Contents"
        },
        "/file2.txt": {
            isFile: true,
            mtime: new Date(),
            contents: "File 2 Contents"
        },
        "/subdir/": {
            isFile: false,
            mtime: new Date()
        },
        "/subdir/file3.txt": {
            isFile: true,
            mtime: new Date(),
            contents: "File 3 Contents"
        },
        "/subdir/file4.txt": {
            isFile: true,
            mtime: new Date(),
            contents: "File 4 Contents"
        },
        "/subdir/child/": {
            isFile: false,
            mtime: new Date()
        },
        "/subdir/child/file5.txt": {
            isFile: true,
            mtime: new Date(),
            contents: "File 5 Contents"
        }
    };

    function _parentPath(path) {
        // trim off the trailing slash if necessary
        if (path[path.length - 1] === "/") {
            path = path.substring(0, path.length - 1);
        }

        if (path[path.length - 1] !== "/") {
            path = path.substr(0, path.lastIndexOf("/") + 1);
        }

        return path;
    }

    function MockFileSystemModel() {
        this._data = {};
        $.extend(this._data, _initialData);
        this._watchedPaths = {};
    }
    EventDispatcher.makeEventDispatcher(MockFileSystemModel.prototype);

    MockFileSystemModel.prototype.stat = function (path) {
        var entry = this._data[path];

        if (entry) {
            return new FileSystemStats({
                isFile: entry.isFile,
                mtime: entry.mtime,
                size: entry.contents ? entry.contents.length : 0,
                hash: entry.mtime.getTime()
            });
        }
        return null;

    };

    MockFileSystemModel.prototype.exists = function (path) {
        return !!this._data[path];
    };

    MockFileSystemModel.prototype._isPathWatched = function (path) {
        return Object.keys(this._watchedPaths).some(function (watchedPath) {
            return path.indexOf(watchedPath) === 0;
        });
    };

    MockFileSystemModel.prototype._sendWatcherNotification = function (path) {
        if (this._isPathWatched(path)) {
            this.trigger("change", path);
        }
    };

    MockFileSystemModel.prototype._sendDirectoryWatcherNotification = function (path) {
        this._sendWatcherNotification(_parentPath(path));
    };

    MockFileSystemModel.prototype.mkdir = function (path) {
        this._data[path] = {
            isFile: false,
            mtime: new Date()
        };

        this._sendDirectoryWatcherNotification(path);
    };

    MockFileSystemModel.prototype.readFile = function (path) {
        return this.exists(path) ? this._data[path].contents : null;
    };

    MockFileSystemModel.prototype.writeFile = function (path, contents) {
        var exists = this.exists(path);

        this._data[path] = {
            isFile: true,
            contents: contents,
            mtime: new Date()
        };

        if (exists) {
            this._sendWatcherNotification(path);
        } else {
            this._sendDirectoryWatcherNotification(path);
        }
    };

    MockFileSystemModel.prototype.unlink = function (path) {
        var entry;
        for (entry in this._data) {
            if (this._data.hasOwnProperty(entry)) {
                if (entry.indexOf(path) === 0) {
                    delete this._data[entry];
                }
            }
        }

        this._sendDirectoryWatcherNotification(path);
    };

    MockFileSystemModel.prototype.rename = function (oldPath, newPath) {
        this._data[newPath] = this._data[oldPath];
        delete this._data[oldPath];
        if (!this._data[newPath].isFile) {
            var entry, i,
                toDelete = [];

            for (entry in this._data) {
                if (this._data.hasOwnProperty(entry)) {
                    if (entry.indexOf(oldPath) === 0) {
                        this._data[newPath + entry.substr(oldPath.length)] = this._data[entry];
                        toDelete.push(entry);
                    }
                }
            }
            for (i = toDelete.length; i; i--) {
                delete this._data[toDelete.pop()];
            }
        }

        this._sendDirectoryWatcherNotification(oldPath);
    };

    MockFileSystemModel.prototype.readdir = function (path) {
        var entry,
            contents = [];

        for (entry in this._data) {
            if (this._data.hasOwnProperty(entry)) {
                var isDir = false;
                if (entry[entry.length - 1] === "/") {
                    entry = entry.substr(0, entry.length - 1);
                    isDir = true;
                }
                if (entry !== path &&
                        entry.indexOf(path) === 0 &&
                        entry.lastIndexOf("/") === path.lastIndexOf("/")) {
                    contents.push(entry.substr(entry.lastIndexOf("/")) + (isDir ? "/" : ""));
                }
            }
        }

        return contents;
    };

    MockFileSystemModel.prototype.watchPath = function (path) {
        this._watchedPaths[path] = true;
    };

    MockFileSystemModel.prototype.unwatchPath = function (path) {
        delete this._watchedPaths[path];
    };

    MockFileSystemModel.prototype.unwatchAll = function () {
        this._watchedPaths = {};
    };

    module.exports = MockFileSystemModel;
});
