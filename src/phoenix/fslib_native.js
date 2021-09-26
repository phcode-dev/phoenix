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
/*global Blob, Response, TextDecoder, buffer*/
/*eslint no-console: 0*/
/*eslint strict: ["error", "global"]*/

import Mounts from "./fslib_mounts.js";
import {Errors} from "./errno.js";
import Constants from "./constants.js";
import Utils from "./utils.js";


async function listDir(handle, callback) {
    let dirEntryNames = [];
    for await (const [key] of handle.entries()) {
        dirEntryNames.push(key);
    }
    callback(null, dirEntryNames);
}


async function _mkdir(paretDirHandle, dirName, callback) {
    try {
        await paretDirHandle.getDirectoryHandle(dirName, { create: true });
        callback(null);
    } catch (e) {
        callback(new Errors.EIO('Filer native fs function not yet supported.', e));
    }
}


function mkdir(path, mode, callback) {
    if (arguments.length < 4) {
        callback = mode;
    }

    path = window.path.normalize(path);
    let dirname= window.path.dirname(path);
    let subdirName= window.path.basename(path);
    Mounts.getHandleFromPath(dirname, (err, handle) => {
        if(err){
            callback(err);
        } else if (handle.kind === Constants.KIND_FILE) {
            callback(new Errors.ENOTDIR('Parent path is not a directory.'));
        }else {
            _mkdir(handle, subdirName, callback);
        }
    });
}


function readdir(path, options, callback) {
    path = window.path.normalize(path);
    if (typeof options !== 'function') {
        throw new Errors.ENOSYS('Filer readdir options are not yet supported');
    }
    callback = options;

    if(path === Constants.MOUNT_POINT_ROOT ) {
        let mountedFolders = Object.keys(Mounts.getMountPoints());
        callback(null, mountedFolders);
    } else {
        Mounts.getHandleFromPath(path, (err, handle) => {
            if(err){
                callback(err);
            } else if (handle.kind === Constants.KIND_FILE) {
                callback(new Errors.ENOTDIR('Path is not a directory.'));
            }else {
                listDir(handle, callback);
            }
        });
    }
}

async function _getFileContents(fileHandle, encoding, callback) {
    encoding = encoding || 'utf-8';
    try {
        let file = await fileHandle.getFile();
        let blob = new Blob([await file.text()]);
        let buffer = await new Response(blob).arrayBuffer();
        let decoded_string = new TextDecoder(encoding).decode(buffer);
        callback(null, decoded_string);
    } catch (e) {
        callback(e);
    }
}

function _validateFileOptions(options, enc, fileMode){
    if(!options) {
        options = { encoding: enc, flag: fileMode };
    } else if(typeof options === 'function') {
        options = { encoding: enc, flag: fileMode };
    } else if(typeof options === 'string') {
        options = { encoding: options, flag: fileMode };
    }
    return options;
}

function readFile(path, options, callback) {
    path = window.path.normalize(path);

    callback = arguments[arguments.length - 1];
    options = _validateFileOptions(options, null, 'r');

    Mounts.getHandleFromPath(path, (err, handle) => {
        if(err){
            callback(err);
        } else if (handle.kind === Constants.KIND_DIRECTORY) {
            callback(new Errors.EISDIR('Path is a directory.'));
        }else {
            _getFileContents(handle, options.encoding, callback);
        }
    });
}


function stat(path, callback) {
    path = window.path.normalize(path);
    Mounts.getHandleFromPath(path, (err, handle) => {
        if(err){
            callback(err);
        } else {
            Utils.createStatObject(path, handle).then(stat => {
                callback(null, stat);
            }).catch( err => {
                callback(err);
            });
        }
    });
}


async function _writeFileWithName(paretDirHandle, fileName, encoding, data, callback) {
    encoding = encoding || 'utf-8';
    try {
        const newFileHandle = await paretDirHandle.getFileHandle(fileName, { create: true });
        const writable = await newFileHandle.createWritable();
        await writable.write(data);
        await writable.close();
        callback(null);
    } catch (e) {
        callback(e);
    }
}

function writeFile (path, data, options, callback) {
    callback = arguments[arguments.length - 1];
    options = _validateFileOptions(options, 'utf8', 'w');
    if(!buffer.Buffer.isBuffer(data)) {
        if(typeof data === 'number') {
            data = '' + data;
        }
        data = data || '';
        if(typeof data !== 'string') {
            data = buffer.Buffer.from(data.toString());
        } else {
            data = buffer.Buffer.from(data || '', options.encoding || 'utf8');
        }
    }

    path = window.path.normalize(path);
    let dirname= window.path.dirname(path);
    let fileName= window.path.basename(path);
    Mounts.getHandleFromPath(dirname, (err, handle) => {
        if(err){
            callback(err);
        } else if (handle.kind === Constants.KIND_FILE) {
            callback(new Errors.ENOTDIR('Parent path is not a directory.'));
        }else {
            _writeFileWithName(handle, fileName, options.encoding, data, callback);
        }
    });
}

function mountNativeFolder(...args) {
    Mounts.mountNativeFolder(...args);
}

function refreshMountPoints() {
    Mounts.refreshMountPoints();
}

const NativeFS = {
    mountNativeFolder,
    refreshMountPoints,
    mkdir,
    readdir,
    stat,
    readFile,
    writeFile
};

export default NativeFS;
