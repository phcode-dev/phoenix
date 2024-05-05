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

/*global path, jsPromise, catchToNull*/

define(function (require, exports, module) {
    const EventDispatcher = require("utils/EventDispatcher"),
        ExtensionLoader = require("utils/ExtensionLoader"),
        FileUtils        = require("file/FileUtils"),
        NodeUtils        = require("utils/NodeUtils"),
        Package  = require("extensibility/Package"),
        FileSystem = require("filesystem/FileSystem"),
        FileSystemError = require("filesystem/FileSystemError"),
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

    async function _validateAndNpmInstallIfNodeExtension(nodeExtPath) {
        const packageJSONFile = FileSystem.getFileForPath(path.join(nodeExtPath, "package.json"));
        let packageJson = await catchToNull(jsPromise(FileUtils.readAsText(packageJSONFile)),
            "package.json not found for installing extension, trying to continue "+ nodeExtPath);
        try{
            if(packageJson){
                packageJson = JSON.parse(packageJson);
            }
        } catch (e) {
            console.error("Error parsing package json for extension", nodeExtPath, e);
            return null; // let it flow, we are only concerned of node extensions
        }
        if(!packageJson || !packageJson.nodeConfig || !packageJson.nodeConfig.main){
            // legacy extensions can be loaded with no package.json
            // else if no node config, or node main is not defined, we just treat it as a non node extension
            return null;
        }
        if(packageJson.nodeConfig.nodeIsRequired && !Phoenix.isNativeApp) {
            return "Extension can only be installed in native builds!";
        }
        if(!Phoenix.isNativeApp){
            return null;
        }
        let nodeMainFile = path.join(nodeExtPath, packageJson.nodeConfig.main);
        let file = FileSystem.getFileForPath(nodeMainFile);
        let isExists = await file.existsAsync();
        if(!isExists){
            console.error("Extension cannot be installed; could not find node main file: ",
                nodeMainFile, packageJson.nodeConfig.main);
            return "Extension is broken, (Err: node main file not found)";
        }

        let npmInstallFolder = packageJson.nodeConfig.npmInstall;
        if(!npmInstallFolder) {
            return null;
        }
        npmInstallFolder = path.join(nodeExtPath, packageJson.nodeConfig.npmInstall);
        const nodeModulesFolder = path.join(npmInstallFolder, "node_modules");
        let directory = FileSystem.getDirectoryForPath(npmInstallFolder);
        isExists = await directory.existsAsync();
        if(!isExists){
            console.error("Extension cannot be installed; could not find folder to run npm install: ",
                npmInstallFolder);
            return "Extension is broken, (Err: node source folder not found)";
        }

        const nodePackageJson = path.join(npmInstallFolder, "package.json");
        let nodePackageFile = FileSystem.getFileForPath(nodePackageJson);
        isExists = await nodePackageFile.existsAsync();
        if(!isExists){
            console.error("Extension cannot be installed; could not find package.json file to npm install in: ",
                npmInstallFolder);
            return "Extension is broken, (Err: it's node package.json not found)";
        }

        directory = FileSystem.getDirectoryForPath(nodeModulesFolder);
        isExists = await directory.existsAsync();
        if(isExists) {
            console.error("Could not install extension as the extension has node_modules folder in" +
                " the package", nodeModulesFolder, "Extensions that defines a nodeConfig.npmInstall" +
                " path should not package node_modules!");
            return "Extension is broken. (Err: cannot npm install inside extension folder" +
                " as it already has node_modules)";
        }
        const npmInstallPlatformPath = Phoenix.fs.getTauriPlatformPath(npmInstallFolder);
        return NodeUtils._npmInstallInFolder(npmInstallPlatformPath);
    }

    function install(path, destinationDirectory, config) {
        const d = new $.Deferred();
        // if we reached here in phoenix, install succeeded
        _validateAndNpmInstallIfNodeExtension(path)
            .then(validationErr =>{
                if(validationErr) {
                    d.resolve({
                        name: _getExtensionName(config.nameHint),
                        installationStatus: Package.InstallationStatuses.FAILED,
                        errors: [validationErr]
                    });
                    return;
                }
                d.resolve({
                    name: _getExtensionName(config.nameHint),
                    installationStatus: Package.InstallationStatuses.INSTALLED,
                    installedTo: path
                });
            }).catch(err=>{
                console.error("Error installing extension", err);
                d.resolve({
                    name: _getExtensionName(config.nameHint),
                    installationStatus: Package.InstallationStatuses.FAILED,
                    errors: ["Error installing extension"]
                });
            });
        return d.promise();
    }

    function _markForDeleteOnRestart(extensionDirectory) {
        let file = FileSystem.getFileForPath(
            path.join(extensionDirectory.fullPath, ExtensionLoader._DELETED_EXTENSION_FILE_MARKER));
        return jsPromise(FileUtils.writeText(file, "This extension is marked for delete on restart of phcode", true));
    }

    /**
     * Removes the extension at the given path.
     *
     * @param {string} extensionPath The absolute path to the extension to remove.
     * @return {$.Promise} A promise that's resolved when the extension is removed, or
     *     rejected if there was an error.
     */
    function remove(extensionPath) {
        const d = new $.Deferred();
        const extensionDirectory = FileSystem.getDirectoryForPath(extensionPath);
        extensionDirectory.unlink(err=>{
            if(err && err !== FileSystemError.NOT_FOUND){ // && err !== enoent
                // if we cant delete the extension, we will try to mark the extension to be removed on restart.
                // This can happen in windows with node extensions where nodejs holds fs locks on the node folder.
                _markForDeleteOnRestart(extensionDirectory)
                    .then(d.resolve)
                    .catch(d.reject);
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
