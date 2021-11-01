/*
 * GNU AGPL-3.0 License
 * 
 * Modified work Copyright (c) 2021 - present Core.ai
 *
 * This program is free software: you can redistribute it and/or modify it under 
 * the terms of the GNU Affero General Public License as published by the Free 
 * Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY;
 * without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 * See the GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License along
 * with this program. If not, see https://opensource.org/licenses/AGPL-3.0.
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
