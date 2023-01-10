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

/*global path*/

define(function (require, exports, module) {
    const EventDispatcher = require("utils/EventDispatcher"),
        ExtensionLoader = require("utils/ExtensionLoader"),
        Package  = require("extensibility/Package"),
        FileSystem = require("filesystem/FileSystem"),
        ZipUtils = require("utils/ZipUtils");
    EventDispatcher.makeEventDispatcher(exports);

    const EVENT_DOWNLOAD_FILE_PROGRESS = "DownloadProgress",
        EVENT_EXTRACT_FILE_PROGRESS = "ExtractProgress",
        downloadCancelled = {};

    function _unzipExtension(data, projectPath, flattenFirstLevelInZip, progressCb) {
        return new Promise((resolve, reject)=>{
            ZipUtils.unzipBinDataToLocation(data, projectPath, flattenFirstLevelInZip, progressCb)
                .then(resolve)
                .catch(reject);
        });
    }

    function _getExtensionName(fileNameHint) {
        let guessedName = path.basename(fileNameHint, ".zip"); //Eg. c/x/rain.monokai-dark-soda-1.0.9.zip is input
        guessedName = guessedName.substring(0, guessedName.lastIndexOf("-"));
        return guessedName; //rain.monokai-dark-soda
    }

    function downloadFile(downloadId, {url, filenameHint, destinationDirectory}, _proxy) {
        const d = new $.Deferred();
        let guessedName = _getExtensionName(filenameHint);
        destinationDirectory = destinationDirectory || ExtensionLoader.getUserExtensionPath();
        console.log("Download extension", downloadId, url, filenameHint, guessedName);
        window.JSZipUtils.getBinaryContent(url, {
            callback: async function(err, data) {
                if(downloadCancelled[downloadId]){
                    d.reject();
                    delete downloadCancelled[downloadId];
                } else if(err) {
                    console.error("could not download extension zip file!", err);
                    d.reject();
                } else {
                    function _progressCB(done, total) {
                        exports.trigger(EVENT_EXTRACT_FILE_PROGRESS, done, total);
                        return !downloadCancelled[downloadId]; // continueExtraction id not download cancelled
                    }
                    FileSystem.getFileForPath(destinationDirectory + "/" + guessedName).unlink(()=>{
                        // we dont mind the error if there is any to delete the folder
                        console.log("[Extension] extracting", downloadId, url, filenameHint, guessedName);
                        _unzipExtension(data, destinationDirectory + "/" + guessedName, true, _progressCB)
                            .then(()=>{
                                console.log("[Extension] extraction done", downloadId, url, filenameHint, guessedName);
                                d.resolve(destinationDirectory + "/" + guessedName);
                            })
                            .catch((extractErr)=>{
                                console.error("Error extracting extension zip, cleaning up", extractErr);
                                FileSystem.getFileForPath(destinationDirectory + "/" + guessedName)
                                    .unlink((unlinkError)=>{
                                        if(unlinkError){
                                            console.error("Error cleaning up extenstion folder: ",
                                                destinationDirectory + "/" + unlinkError);
                                        }
                                        d.reject();
                                    });
                            });
                    });
                }
            },
            progress: function (status){
                if(status.percent === 100) {
                    exports.trigger(EVENT_EXTRACT_FILE_PROGRESS, 0);
                    return;
                }
                exports.trigger(EVENT_DOWNLOAD_FILE_PROGRESS, status.percent || 0);
            },
            abortCheck: function () {
                return downloadCancelled[downloadId];
            }
        });
        return d.promise();
    }

    function abortDownload(downloadId) {
        downloadCancelled[downloadId] = true;
    }

    function install(path, destinationDirectory, config) {
        const d = new $.Deferred();
        // if we reached here in phoenix, install succeded
        d.resolve({
            name: _getExtensionName(config.nameHint),
            installationStatus: Package.InstallationStatuses.INSTALLED,
            installedTo: path
        });
        return d.promise();
    }

    /**
     * Removes the extension at the given path.
     *
     * @param {string} path The absolute path to the extension to remove.
     * @return {$.Promise} A promise that's resolved when the extension is removed, or
     *     rejected if there was an error.
     */
    function remove(path) {
        const d = new $.Deferred();
        FileSystem.getFileForPath(path).unlink(err=>{
            if(err){
                d.reject();
                return;
            }
            d.resolve();
        });
        return d.promise();
    }

    exports.downloadFile = downloadFile;
    exports.abortDownload = abortDownload;
    exports.install = install;
    exports.remove = remove;
    exports.update = install;
    exports.EVENT_DOWNLOAD_FILE_PROGRESS = EVENT_DOWNLOAD_FILE_PROGRESS;
    exports.EVENT_EXTRACT_FILE_PROGRESS = EVENT_EXTRACT_FILE_PROGRESS;
});
