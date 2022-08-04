/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 * Original work Copyright (c) 2017 - 2021 Adobe Systems Incorporated. All rights reserved.
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

/*eslint-env node */
/*jslint node: true */



var fs = require("fs"),
    _dirtyFilesCache = {};

/**
 * Clears the cache for dirty file paths
 */
function clearDirtyFilesCache() {
    _dirtyFilesCache = {};
}

/**
 * Updates the files cache with fullpath when dirty flag changes for a document
 * If the doc is being marked as dirty then an entry is created in the cache
 * If the doc is being marked as clean then the corresponsing entry gets cleared from cache
 *
 * @param {String} name - fullpath of the document
 * @param {boolean} action - whether the document is dirty
 */
function updateDirtyFilesCache(name, action) {
    if (action) {
        _dirtyFilesCache[name] = true;
    } else {
        if (_dirtyFilesCache[name]) {
            delete _dirtyFilesCache[name];
        }
    }
}

/**
 * Extract content locally from the file system used fs.readFile()
 *
 * @param {String} fileName - fullpath of the document
 * @param {Function} callback - callback handle to post the content back
 */
function _readFile(fileName, callback) {
    fs.readFile(fileName, "utf8", function (err, data) {
        var content = "";
        if (!err) {
            content = data;
        }
        callback.apply(null, [fileName, content]);
    });
}

/**
 * Extracts file content for the given file name(1st param) and invokes the callback handle(2nd param) with
 * extracted file content. Content can be extracted locally from the file system used fs.readFile()
 * or conditionally from main context(brackets main thread) by using the 3rd param
 *
 * @param {String} fileName - fullpath of the document
 * @param {Function} callback - callback handle to post the content back
 * @param {Object} extractFromMainContext - content request handle wrapper from main thread
 */
function extractContent(fileName, callback, extractFromMainContext) {
    // Ask the main thread context to provide the updated file content
    // We can't yet use node io to read, to utilize shells encoding detection
    extractFromMainContext.apply(null, [fileName]);
}

exports.extractContent = extractContent;
exports.clearFilesCache = clearDirtyFilesCache;
exports.updateFilesCache = updateDirtyFilesCache;

