/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
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

/*globals Phoenix, JSZip, Filer*/

define(function (require, exports, module) {

    const ignoredFolders = [ "__MACOSX" ];

    async function _ensureExistsAsync(path) {
        return new Promise((resolve, reject)=>{
            Phoenix.VFS.ensureExistsDir(path, (err)=>{
                if(err){
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }

    function _copyZippedItemToFS(path, item, destProjectDir, flattenFirstLevel, zipControl) {
        return new Promise(async (resolve, reject) =>{ // eslint-disable-line
            try {
                let destPath = `${destProjectDir}${path}`;
                if(flattenFirstLevel){
                    // contents/index.html to index.html
                    let newPath = path.substr(path.indexOf("/") + 1);
                    destPath = `${destProjectDir}${newPath}`;
                    console.log(destPath);
                }
                if(item.dir){
                    await _ensureExistsAsync(destPath);
                    resolve(destPath);
                } else {
                    await _ensureExistsAsync(window.path.dirname(destPath));
                    item.async("uint8array").then(function (data) {
                        if(zipControl && !zipControl.continueExtraction){
                            reject("aborted");
                            return;
                        }
                        window.fs.writeFile(destPath, Filer.Buffer.from(data), writeErr=>{
                            if(writeErr){
                                reject(writeErr);
                            } else {
                                resolve(destPath);
                            }
                        });
                    }).catch(error=>{
                        reject(error);
                    });
                }
            } catch (e) {
                reject(e);
            }
        });
    }

    function _isNestedContentDir(zip) {
        let keys = Object.keys(zip.files);
        let rootEntries = {};
        for(let path of keys){
            let filePath = path.endsWith("/") ? path.slice(0, -1) : path; // trim last slah if present
            let item = zip.files[path];
            if(!item.dir && !filePath.includes("/")) { // file in root folder means not nested zip
                return false;
            }
            let baseName = filePath.split("/")[0];
            if(!ignoredFolders.includes(baseName)){
                rootEntries[baseName] = true;
            }
        }
        if(Object.keys(rootEntries).length === 1) {
            // lone content folder
            return true;
        }
        return false;
    }

    /**
     * extracts a given binary zip data array to given location
     * @param zipData binary UInt8Array zip data
     * @param projectDir To extract to
     * @param flattenFirstLevel if set to true, then if zip contents are nested inside a directory, the nexted dir will
     * be removed in the path structure in destination. For Eg. some Zip may contain a `contents` folder inside the zip
     * which has all the contents. If we blindly extract the zio, all the contents will be placed inside a `contents`
     * folder in root and not the root dir itself.
     * See a sample zip file here: https://api.github.com/repos/StartBootstrap/startbootstrap-grayscales/zipball
     * @param {function(doneCount: number, totalCount: number)} [progressControlCallback] A function that can be used
     * to view the progress and stop further extraction. The function will be invoked with (doneCount, totalCount).
     * The function should return `false` if further extraction needs to be stopped. If nothing or `true` is returned,
     * it will continue extraction.
     * @returns {Promise}
     */
    function unzipBinDataToLocation(zipData, projectDir, flattenFirstLevel = false, progressControlCallback) {
        if(!projectDir.endsWith('/')){
            projectDir = projectDir + "/";
        }
        return new Promise((resolve, reject)=>{
            JSZip.loadAsync(zipData).then(async function (zip) {
                let keys = Object.keys(zip.files);
                try{
                    const extractBatchSize = 500;
                    const isNestedContent = _isNestedContentDir(zip);
                    let extractError;
                    let totalCount = keys.length,
                        doneCount = 0,
                        extractPromises = [],
                        zipControl = {
                            continueExtraction: true
                        };
                    function _unzipProgress() {
                        doneCount ++;
                        if(progressControlCallback){
                            zipControl.continueExtraction = zipControl.continueExtraction
                                && progressControlCallback(doneCount, totalCount);
                        }
                    }
                    function _extractFailed(err) {
                        extractError = err || "extract failed";
                    }
                    for(let path of keys){
                        // This is intentionally batched as fs access api hangs on large number of file access
                        let extractPromise = _copyZippedItemToFS(path, zip.files[path], projectDir,
                            isNestedContent && flattenFirstLevel, zipControl);
                        // eslint-disable-next-line no-loop-func
                        extractPromise.then(_unzipProgress)
                            .catch(_extractFailed);
                        extractPromises.push(extractPromise);
                        if(extractPromises.length === extractBatchSize){
                            await Promise.allSettled(extractPromises);
                            extractPromises = [];
                        }
                        if(zipControl.continueExtraction === false){
                            reject(`Extraction cancelled by progress controller`);
                            return;
                        }
                        if(extractError){
                            reject(extractError);
                            return;
                        }
                    }
                    if(extractPromises.length) {
                        await Promise.allSettled(extractPromises);
                    }
                    if(extractError){
                        reject(extractError);
                        return;
                    }
                    console.log("Unzip complete: ", projectDir);
                    resolve();
                } catch (err) {
                    console.error('unzip failed', err);
                    reject(err);
                }
            });
        });
    }

    /**
     *
     * @param url the zip fle URL
     * @param projectDir To extract to
     * @param flattenFirstLevel if set to true, then if zip contents are nested inside a directory, the nexted dir will
     * be removed in the path structure in destination. For Eg. some Zip may contain a `contents` folder inside the zip
     * which has all the contents. If we blindly extract the zio, all the contents will be placed inside a `contents`
     * folder in root and not the root dir itself.
     * See a sample zip file here: https://api.github.com/repos/StartBootstrap/startbootstrap-grayscales/zipball
     * @returns {Promise}
     */
    function unzipURLToLocation(url, projectDir, flattenFirstLevel = false) {
        return new Promise((resolve, reject)=>{
            window.JSZipUtils.getBinaryContent(url, async function(err, data) {
                if(err) {
                    console.error(`could not load zip from URL: ${url}\n `, err);
                    reject();
                } else {
                    unzipBinDataToLocation(data, projectDir, flattenFirstLevel)
                        .then(resolve)
                        .catch(reject);
                }
            });
        });
    }
    exports.unzipBinDataToLocation = unzipBinDataToLocation;
    exports.unzipURLToLocation = unzipURLToLocation;
});
