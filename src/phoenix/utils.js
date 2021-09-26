/*
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the "Software"),
 * to deal in the Software without restriction, including without limitation
 * the rights to use, copy, modify, merge, publish, distribute, sublicense,
 * and/or sell copies of the Software, and to permit persons to whom the
 * Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
 * DEALINGS IN THE SOFTWARE.
 *
 */

// jshint ignore: start
/*eslint no-console: 0*/
/*eslint strict: ["error", "global"]*/

import Constants from "./constants.js";

function _dateFromMs(ms) {
    if(ms === null || ms === undefined){
        return null;
    }
    return new Date(Number(ms));
}

function Stats(path, fileNode, devName) {
    this.dev = devName;
    this.node = fileNode.id;
    this.type = fileNode.type;
    this.size = fileNode.size;
    this.nlinks = fileNode.nlinks;
    // Date objects
    this.atime = _dateFromMs(fileNode.atime);
    this.mtime = _dateFromMs(fileNode.mtime);
    this.ctime = _dateFromMs(fileNode.ctime);
    // Unix timestamp MS Numbers
    this.atimeMs = fileNode.atime;
    this.mtimeMs = fileNode.mtime;
    this.ctimeMs = fileNode.ctime;
    this.version = fileNode.version;
    this.mode = fileNode.mode;
    this.name = window.path.basename(path);
}

Stats.prototype.isFile = function() {
    return this.type === Constants.NODE_TYPE_FILE;
};

Stats.prototype.isDirectory = function() {
    return this.type === Constants.NODE_TYPE_DIRECTORY;
};

Stats.prototype.isSymbolicLink = function() {
    return this.type === Constants.NODE_TYPE_SYMBOLIC_LINK;
};

// These will always be false in Filer.
Stats.prototype.isSocket          =
    Stats.prototype.isFIFO            =
        Stats.prototype.isCharacterDevice =
            Stats.prototype.isBlockDevice     =
                function() {
                    return false;
                };

function _getType(handle) {
    switch (handle.kind) {
    case Constants.KIND_FILE: return Constants.NODE_TYPE_FILE;
    case Constants.KIND_DIRECTORY: return Constants.NODE_TYPE_DIRECTORY;
    default: return null;
    }
}

async function _getDetails(nativeFsHandle) {
    let file = null;
    let details = {};
    switch (nativeFsHandle.kind) {
    case Constants.KIND_FILE:
        file = await nativeFsHandle.getFile();
        details.size = file.size;
        details.mtime = file.lastModified;
        return details;
    case Constants.KIND_DIRECTORY:
    default:
        return details;
    }
}

const createStatObject = async function (path, handle) {
    let details = await _getDetails(handle);
    let fileDetails = {
        type: _getType(handle),
        size: details.size,
        mtime: details.mtime
    };
    return new Stats(path, fileDetails, Constants.MOUNT_DEVICE_NAME);
};

const Utils = {
    createStatObject
};

export default Utils;
