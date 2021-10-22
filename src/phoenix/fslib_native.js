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


async function _listDir(handle, callback) {
    let dirEntryNames = [];
    for await (const [key] of handle.entries()) {
        dirEntryNames.push(key);
    }
    if(callback){
        callback(null, dirEntryNames);
    }
    return dirEntryNames;
}


async function _mkdir(paretDirHandle, dirName, callback) {
    try {
        let childDirHandle = await paretDirHandle.getDirectoryHandle(dirName, { create: true });
        if(callback){
            callback(null);
        }
        return childDirHandle;
    } catch (e) {
        if(callback){
            callback(new Errors.EIO('Filer native fs function not yet supported.', e));
        }
        throw new Errors.EIO('Filer native fs function not yet supported.', e);
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
                _listDir(handle, callback);
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

async function _deleteEntry(dirHandle, entryNameToDelete, callback, recursive=true){
    try {
        await dirHandle.removeEntry(entryNameToDelete, { recursive: recursive });
        callback();
    } catch (err) {
        callback(err);
    }
}

async function unlink(path, callback) {
    path = window.path.normalize(path);
    let dirPath= window.path.dirname(path);
    let baseName= window.path.basename(path);
    Mounts.getHandleFromPath(dirPath, async (err, dirHandle) => {
        if(err){
            callback(err);
        } else {
            _deleteEntry(dirHandle, baseName, callback);
        }
    });
}

async function _getDestinationHandle(dst, srcBaseName, handleKindToCreate) {
    return new Promise(async (resolve, reject) => {
        dst = window.path.normalize(dst);
        let dirPath= window.path.dirname(dst);
        let dstBaseName= window.path.basename(dst);
        let dstHandle = await Mounts.getHandleFromPathIfPresent(dst);
        let dstParentHandle = await Mounts.getHandleFromPathIfPresent(dirPath);
        if (dstHandle && dstHandle.kind === Constants.KIND_FILE) {
            reject(new Errors.EEXIST(`Destination file already exists: ${dst}`));
        } else if (dstHandle && dstHandle.kind === Constants.KIND_DIRECTORY
            && handleKindToCreate === Constants.KIND_FILE) {
            const fileHandle = await dstHandle.getFileHandle(srcBaseName, {create: true});
            resolve(fileHandle);
        } else if (dstHandle && dstHandle.kind === Constants.KIND_DIRECTORY
            && handleKindToCreate === Constants.KIND_DIRECTORY) {
            let dstChildHandle = await Mounts.getHandleFromPathIfPresent(`${dst}/${srcBaseName}`);
            if(dstChildHandle){
                reject(new Errors.EEXIST(`Copy destination already exists: ${dst}/${srcBaseName}`));
                return;
            }
            const directoryHandle = await dstHandle.getDirectoryHandle(srcBaseName, {create: true});
            resolve(directoryHandle);
        } else if (!dstHandle && dstParentHandle && dstParentHandle.kind === Constants.KIND_DIRECTORY
            && handleKindToCreate === Constants.KIND_FILE) {
            const fileHandle = await dstParentHandle.getFileHandle(dstBaseName, {create: true});
            resolve(fileHandle);
        } else if (!dstHandle && dstParentHandle && dstParentHandle.kind === Constants.KIND_DIRECTORY
            && handleKindToCreate === Constants.KIND_DIRECTORY) {
            const fileHandle = await dstParentHandle.getDirectoryHandle(dstBaseName, {create: true});
            resolve(fileHandle);
        } else {
            reject(new Errors.ENOENT(`Copy destination doesnt exist: ${dst}`));
        }
    });
}

async function _copyFileFromHandles(srcFileHandle, dstHandle, optionalName) {
    // TODO Add retry mechanisms when copying large folders
    try {
        if(optionalName){
            dstHandle = await dstHandle.getFileHandle(optionalName, {create: true});
        }
        const srcFile = await srcFileHandle.getFile();
        const srcStream = await srcFile.stream();
        const writable = await dstHandle.createWritable();
        await srcStream.pipeTo(writable);
    } catch (e) {
        console.error(`Error while copying ${dstHandle.name}/${optionalName} : ${e}`);
        throw e;
    }
}

async function _copyFileWithHandle(srcFileHandle, dst, srcFileName, callback) {
    try {
        let dstHandle = await _getDestinationHandle(dst, srcFileName, Constants.KIND_FILE);
        await _copyFileFromHandles(srcFileHandle, dstHandle);
        callback();
    } catch (e) {
        callback(e);
    }
}

async function _treeCopy(srcFolderHandle, dstFolderHandle, recursive) {
    let allDonePromises = [];
    for await (const [key, srcHandle] of srcFolderHandle.entries()) {
        if (srcHandle.kind === Constants.KIND_FILE) {
            allDonePromises.push(_copyFileFromHandles(srcHandle, dstFolderHandle, key));
        } else if (srcHandle.kind === Constants.KIND_DIRECTORY) {
            const childDirHandle = await _mkdir(dstFolderHandle, key);
            if(recursive && childDirHandle){
                allDonePromises.push(_treeCopy(srcHandle, childDirHandle, recursive));
            }
        }
    }
    await Promise.all(allDonePromises);
}

async function _copyFolderWithHandle(srcFolderHandle, dst, srcFileName, callback, recursive) {
    try {
        let dstFolderHandle = await _getDestinationHandle(dst, srcFileName, Constants.KIND_DIRECTORY);
        await _treeCopy(srcFolderHandle, dstFolderHandle, recursive);
        callback();
    } catch (e) {
        callback(e);
    }
}

async function copy(src, dst, callback, recursive = true) {
    let srcFile = window.path.normalize(src);
    let srcFileName= window.path.basename(srcFile);
    Mounts.getHandleFromPath(srcFile, async (err, srcHandle) => {
        if(err){
            callback(err);
        } else if (srcHandle.kind === Constants.KIND_FILE) {
            return _copyFileWithHandle(srcHandle, dst, srcFileName, callback);
        } else if (srcHandle.kind === Constants.KIND_DIRECTORY) {
            return _copyFolderWithHandle(srcHandle, dst, srcFileName, callback, recursive);
        } else {
            callback(new Errors.EIO(`Cannot copy src: ${srcFile}`));
        }
    });
}

async function rename(oldPath, newPath, cb) {
    copy(oldPath, newPath, err => {
        if(err) {
            cb(err);
        } else {
            setTimeout(()=>{
                unlink(oldPath, cb);
            }, 0);
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
    writeFile,
    unlink,
    copy,
    rename
};

export default NativeFS;
