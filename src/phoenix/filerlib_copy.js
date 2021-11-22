/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
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
/*global fs*/
/*eslint no-console: 0*/
/*eslint strict: ["error", "global"]*/


import ERR_CODES, {Errors} from "./errno.js";

const ERROR_CODES = ERR_CODES.ERROR_CODES;

async function _stat(path) {
    return new Promise(async (resolve, reject) => {
        fs.stat(path, async (err, stat) => {
            if(err && err.code === ERROR_CODES.ENOENT){
                resolve(null);
            } else if(err) {
                reject(err);
            } else {
                resolve(stat);
            }
        });
    });
}

async function _mrdirIfNotPresent(path) {
    return new Promise(async (resolve, reject) => {
        fs.mkdir(path, async (err) => {
            err && err.code !== ERROR_CODES.EEXIST?
                reject(err):
                resolve();
        });
    });
}

async function _readDir(path) {
    return new Promise(async (resolve, reject) => {
        fs.readdir(path, async (err, listing) => {
            if(err) {
                reject(err);
            } else {
                resolve(listing);
            }
        });
    });
}

async function _copyFileContents(src, dst) {
    return new Promise(async (resolve, reject) => {
        fs.readFile(src, async (err, data) => {
            if(err) {
                reject(err);
            } else {
                fs.writeFile(dst, data, function (writeErr) {
                    writeErr?
                        reject(writeErr):
                        resolve();
                });
            }
        });
    });
}

async function _copyFile(srcFile, dst) {
    let dstStat = await _stat(dst);
    if(!dstStat){
        let parentDir= window.path.dirname(dst);
        let dstFileName= window.path.basename(dst);
        dstStat = await _stat(parentDir);
        if(dstStat && dstStat.isDirectory()){
            let dstFilePath =`${parentDir}/${dstFileName}`;
            await _copyFileContents(srcFile, dstFilePath);
            return;
        } else {
            throw new Errors.EIO(`_copyFile Cannot create destination file: ${dst}`);
        }
    }

    let srcFileName= window.path.basename(srcFile);
    if(dstStat && dstStat.isDirectory()){
        let dstFilePath =`${dst}/${srcFileName}`;
        await _copyFileContents(srcFile, dstFilePath);
    } else if(dstStat && dstStat.isFile()){
        throw new Errors.EEXIST(`_copyFile Destination file already exists: ${dst}`);
    } else {
        throw new Errors.EIO(`_copyFile Cannot copy file, unknown destination: ${srcFile} to ${dst}`);
    }
}

async function _copyTree(src, dst) {
    let srcEntries = await _readDir(src);
    for(let entry of srcEntries){
        let entryPath = `${src}/${entry}`;
        let dstPath = `${dst}/${entry}`;
        let srcStat = await _stat(entryPath);
        if(srcStat.isFile()){
            await _copyFileContents(entryPath, dstPath);
        } else { //dir
            await _mrdirIfNotPresent(dstPath);
            await _copyTree(entryPath, dstPath);
        }
    }
}

async function _copyFolder(srcFolder, dst) {
    let dstStat = await _stat(dst);
    if(dstStat && dstStat.isFile()){
        throw new Errors.EEXIST(`Destination file already exists: ${dst}`);
    } else if(dstStat && dstStat.isDirectory()){
        await _copyTree(srcFolder, dst);
    } else {
        throw new Errors.ENONET(`Destination folder does not exist: ${dst}`);
    }
}

async function copy(src, dst, callback, recursive = true) {
    try {
        let srcStat = await _stat(src);
        if(!srcStat){
            callback(new Errors.EIO(`Cannot copy src: ${src}`));
            return;
        }
        if (srcStat.isFile()) {
            await _copyFile(src, dst);
            callback(null);
        } else if (srcStat.isDirectory()) {
            await _copyFolder(src, dst);
            callback(null);
        }
    } catch (e) {
        callback(new Errors.EIO(`${e}: Cannot copy src: ${src} to ${dst}`));
    }
}

function filerCopy(src, dst, cb) {
    copy(window.path.normalize(src), window.path.normalize(dst), cb);
}

export default filerCopy;
