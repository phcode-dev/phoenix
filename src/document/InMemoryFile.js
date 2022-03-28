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

/**
 * Represents a file that will never exist on disk - a placeholder backing file for untitled Documents. NO ONE
 * other than DocumentManager should create instances of InMemoryFile. It is valid to test for one (`instanceof
 * InMemoryFile`), but it's better to check `doc.isUntitled` where possible.
 *
 * Attempts to read/write an InMemoryFile will always fail, and exists() always yields false. InMemoryFile.fullPath
 * is just a placeholder, and should not be displayed anywhere in the UI; fullPath IS guaranteed to be unique, however.
 *
 * An InMemoryFile is not added to the filesystem index, so if you ask the filesystem anything about this
 * object, it won't know what you're talking about (`filesystem.getFileForPath(someInMemFile.fullPath)` will not
 * return someInMemFile).
 */
define(function (require, exports, module) {


    var File            = require("filesystem/File"),
        FileSystemError = require("filesystem/FileSystemError");

    function InMemoryFile(fullPath, fileSystem) {
        File.call(this, fullPath, fileSystem);
    }

    InMemoryFile.prototype = Object.create(File.prototype);
    InMemoryFile.prototype.constructor = InMemoryFile;
    InMemoryFile.prototype.parentClass = File.prototype;

    // Stub out invalid calls inherited from File

    /**
     * Reject any attempts to read the file.
     *
     * Read a file as text.
     *
     * @param {Object=} options Currently unused.
     * @param {function (number, string, object)} callback
     */
    InMemoryFile.prototype.read = function (options, callback) {
        if (typeof (options) === "function") {
            callback = options;
        }
        callback(FileSystemError.NOT_FOUND);
    };

    /**
     * Rejects any attempts to write the file.
     *
     * @param {string} data Data to write.
     * @param {string=} encoding Encoding for data. Defaults to UTF-8.
     * @param {!function (err, object)} callback Callback that is passed the
     *              error code and the file's new stats if the write is successful.
     */
    InMemoryFile.prototype.write = function (data, encoding, callback) {
        if (typeof (encoding) === "function") {
            callback = encoding;
        }
        callback(FileSystemError.NOT_FOUND);
    };


    // Stub out invalid calls inherited from FileSystemEntry

    InMemoryFile.prototype.exists = function (callback) {
        callback(null, false);
    };

    InMemoryFile.prototype.stat = function (callback) {
        callback(FileSystemError.NOT_FOUND);
    };

    InMemoryFile.prototype.unlink = function (callback) {
        callback(FileSystemError.NOT_FOUND);
    };

    InMemoryFile.prototype.rename = function (newName, callback) {
        callback(FileSystemError.NOT_FOUND);
    };

    InMemoryFile.prototype.moveToTrash = function (callback) {
        callback(FileSystemError.NOT_FOUND);
    };

    // Export this class
    module.exports = InMemoryFile;
});
