/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 * Original work Copyright (c) 2018 - 2021 Adobe Systems Incorporated. All rights reserved.
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


    const FileSystemError = require("filesystem/FileSystemError"),
        FileSystemStats = require("filesystem/FileSystemStats"),
        NodeUtils = require("utils/NodeUtils");

    const SESSION_START_TIME = new Date();

    /**
     * Create a new file stat. See the FileSystemStats class for more details.
     *
     * @param {!string} fullPath The full path for this File.
     * @return {FileSystemStats} stats.
     */
    function _getStats(uri) {
        return new FileSystemStats({
            isFile: true,
            mtime: SESSION_START_TIME.toISOString(),
            size: 0,
            realPath: uri,
            hash: uri
        });
    }

    function _getFileName(filePath) {
        var fileName = filePath.split('/').pop();

        if (!fileName.trim()) {
            fileName = filePath.trim().slice(0, -1);
            fileName = fileName.split('/').pop();
        }

        return fileName;
    }

    /**
     * Model for a RemoteFile.
     *
     * This class should *not* be instantiated directly. Use FileSystem.getFileForPath
     *
     * See the FileSystem class for more details.
     *
     * @constructor
     * @param {!string} fullPath The full path for this File.
     * @param {!FileSystem} fileSystem The file system associated with this File.
     */
    function RemoteFile(protocol, fullPath, fileSystem) {
        this._isFile = true;
        this._isDirectory = false;
        this.readOnly = true;
        this._path = fullPath;
        this._stat = _getStats(fullPath);
        this._id = fullPath;
        this._name = _getFileName(fullPath);
        this._fileSystem = fileSystem;
        this.donotWatch = true;
        this.protocol = protocol;
        this.encodedPath = fullPath;
    }

    // Add "fullPath", "name", "parent", "id", "isFile" and "isDirectory" getters
    Object.defineProperties(RemoteFile.prototype, {
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
     * Helpful toString for debugging and equality check purposes
     */
    RemoteFile.prototype.toString = function () {
        return "[RemoteFile " + this._path + "]";
    };

    /**
     * Returns the stats for the remote entry.
     *
     * @param {function (?string, FileSystemStats=)} callback Callback with a
     *      FileSystemError string or FileSystemStats object.
     */
    RemoteFile.prototype.stat = function (callback) {
        if (this._stat) {
            callback(null, this._stat);
        } else {
            callback(FileSystemError.NOT_FOUND);
        }
    };

    RemoteFile.prototype.constructor = RemoteFile;

    /**
     * Cached contents of this file. This value is nullable but should NOT be undefined.
     * @private
     * @type {?string}
     */
    RemoteFile.prototype._contents = null;


    /**
     * @private
     * @type {?string}
     */
    RemoteFile.prototype._encoding = "utf8";

    /**
     * @private
     * @type {?bool}
     */
    RemoteFile.prototype._preserveBOM = false;


    /**
     * Clear any cached data for this file. Note that this explicitly does NOT
     * clear the file's hash.
     * @private
     */
    RemoteFile.prototype._clearCachedData = function () {
        // no-op
    };

    function _nodeConnectorRead(url, encoding, successCB, errorCB) {
        NodeUtils.fetchURLText(url, encoding)
            .then(successCB)
            .catch(err=>{
                console.error("failed fetch url: ", url, err);
                errorCB(err);
            });
    }

    function isTauriResource(url) {
        const startingURLs = [
            "phtauri://", "https://phtauri.localhost", "asset://", "https://asset.localhost",
            "tauri://", "https://tauri.localhost"
        ];
        for(let start of startingURLs){
            if(url.startsWith(start)){
                return true;
            }
        }
        return false;
    }

    function _remoteRead(url, encoding, successCB, errorCB) {
        if(Phoenix.isNativeApp && !isTauriResource(url)) {
            _nodeConnectorRead(url, encoding, successCB, errorCB);
            return;
        }
        let xmlhttp = new XMLHttpRequest();
        xmlhttp.open("GET", url, true);
        xmlhttp.responseType = "arraybuffer";

        xmlhttp.onload = function(oEvent) {
            const arrayBuffer = xmlhttp.response;
            try {
                successCB(iconv.decode(Buffer.from(arrayBuffer), encoding));
            } catch (err) {
                errorCB(err);
            }
        };

        xmlhttp.onerror = function (err) {
            errorCB(err);
        };
        xmlhttp.send();
    }

    /**
     * Reads a remote file.
     *
     * @param {Object=} options Currently unused.
     * @param {function (err?, ?string, string=, FileSystemStats=)} callback Callback that is passed the
     *              FileSystemError string or the file's contents and its stats.
     */
    RemoteFile.prototype.read = function (options, callback) {
        if (typeof (options) === "function") {
            callback = options;
            options = {};
        }
        this._encoding = options.encoding || "utf8";

        if (this._contents !== null && this._stat) {
            callback(null, this._contents, this._encoding, this._stat);
            return;
        }

        var self = this;
        _remoteRead(this.fullPath, this._encoding, function (data) {
            self._contents = data;
            callback(null, data, self._encoding, self._stat);
        }, function (e) {
            callback(FileSystemError.NOT_FOUND);
        });
    };

    /**
     * Write a file.
     *
     * @param {string} data Data to write.
     * @param {object=} options Currently unused.
     * @param {function (?string, FileSystemStats=)=} callback Callback that is passed the
     *              FileSystemError string or the file's new stats.
     */
    RemoteFile.prototype.write = function (data, encoding, callback) {
        if (typeof (encoding) === "function") {
            callback = encoding;
        }
        callback(FileSystemError.NOT_FOUND);
    };

    RemoteFile.prototype.exists = function (callback) {
        callback(null, true);
    };

    RemoteFile.prototype.unlink = function (callback) {
        callback(FileSystemError.NOT_FOUND);
    };

    RemoteFile.prototype.rename = function (newName, callback) {
        callback(FileSystemError.NOT_FOUND);
    };

    RemoteFile.prototype.moveToTrash = function (callback) {
        callback(FileSystemError.NOT_FOUND);
    };

    // Export this class
    module.exports = RemoteFile;
});
