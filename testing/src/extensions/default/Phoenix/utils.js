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

    function _copyZippedItemToFS(path, item, destProjectDir, flattenFirstLevel) {
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

    /**
     *
     * @param zipData binary UInt8Array zip data
     * @param projectDir To extract to
     * @param flattenFirstLevel if set to true, then if zip contents are nested inside a directory, the nexted dir will
     * be removed in the path structure in destination. For Eg. some Zip may contain a `contents` folder inside the zip
     * which has all the contents. If we blindly extract the zio, all the contents will be placed inside a `contents`
     * folder in root and not the root dir itself.
     * See a sample zip file here: https://api.github.com/repos/StartBootstrap/startbootstrap-grayscales/zipball
     * @returns {Promise}
     */
    function unzipFileToLocation(zipData, projectDir, flattenFirstLevel = false) {
        if(!projectDir.endsWith('/')){
            projectDir = projectDir + "/";
        }
        return new Promise((resolve, reject)=>{
            JSZip.loadAsync(zipData).then(function (zip) {
                let keys = Object.keys(zip.files);
                let allPromises=[];
                keys.forEach(path => {
                    allPromises.push(_copyZippedItemToFS(path, zip.files[path], projectDir, flattenFirstLevel));
                });
                Promise.all(allPromises).then(()=>{
                    console.log("Unzip complete: ", projectDir);
                    resolve();
                }).catch(err=>{
                    console.error('unzip failed', err);
                    reject(err);
                });
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
                    unzipFileToLocation(data, projectDir, flattenFirstLevel)
                        .then(resolve)
                        .catch(reject);
                }
            });
        });
    }
    exports.unzipFileToLocation = unzipFileToLocation;
    exports.unzipURLToLocation = unzipURLToLocation;
});
