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

/**
 * The FileSystemStats represents a particular FileSystemEntry's stats.
 */
define(function (require, exports, module) {


    /**
     * @constructor
     * @param {{isFile: boolean, mtime: Date, size: Number, realPath: ?string, hash: object}} options
     */
    function FileSystemStats(options) {
        var isFile = options.isFile;

        this._isFile = isFile;
        this._isDirectory = !isFile;
        // in case of stats transferred over a node-domain,
        // mtime will have JSON-ified value which needs to be restored
        this._mtime = options.mtime instanceof Date ? options.mtime : new Date(options.mtime);
        this._size = options.size;
        // hash is a property introduced by brackets and it's calculated
        // as a valueOf modification time -> calculate here if it's not present
        this._hash = options.hash || this._mtime.valueOf();

        var realPath = options.realPath;
        if (realPath) {
            if (!isFile && realPath[realPath.length - 1] !== "/") {
                realPath += "/";
            }

            this._realPath = realPath;
        }
    }

    // Add "isFile", "isDirectory", "mtime" and "size" getters
    Object.defineProperties(FileSystemStats.prototype, {
        "isFile": {
            get: function () { return this._isFile; },
            set: function () { throw new Error("Cannot set isFile"); }
        },
        "isDirectory": {
            get: function () { return this._isDirectory; },
            set: function () { throw new Error("Cannot set isDirectory"); }
        },
        "mtime": {
            get: function () { return this._mtime; },
            set: function () { throw new Error("Cannot set mtime"); }
        },
        "size": {
            get: function () { return this._size; },
            set: function () { throw new Error("Cannot set size"); }
        },
        "realPath": {
            get: function () { return this._realPath; },
            set: function () { throw new Error("Cannot set realPath"); }
        }
    });

    /**
     * Whether or not this is a stats object for a file
     * @type {boolean}
     */
    FileSystemStats.prototype._isFile = false;

    /**
     * Whether or not this is a stats object for a directory
     * @type {boolean}
     */
    FileSystemStats.prototype._isDirectory = false;

    /**
     * Modification time for a file
     * @type {Date}
     */
    FileSystemStats.prototype._mtime = null;

    /**
     * Size in bytes of a file
     * @type {Number}
     */
    FileSystemStats.prototype._size = null;

    /**
     * Consistency hash for a file
     * @type {object}
     */
    FileSystemStats.prototype._hash = null;

    /**
     * The canonical path of this file or directory ONLY if it is a symbolic link,
     * and null otherwise.
     *
     * @type {?string}
     */
    FileSystemStats.prototype._realPath = null;

    module.exports = FileSystemStats;
});
