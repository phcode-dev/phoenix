/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 * Acknowledgements: https://github.com/bpedro/node-fs
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
/*global fs, Phoenix, logger*/
/*eslint no-console: 0*/
/*eslint strict: ["error", "global"]*/

/** Setup virtual file system. This happens before any code of phoenix is loaded.
 * The virtual file system is rooted at /
 * Application support folder that stores app data is /app/
 * Local user storage space is mounted at path /local/
 * Trash storage space is mounted at path /trash/
 *
 * This module should be functionally as light weight as possible with minimal deps as it is a shell component.
 * **/

let extensionDIR,
    appSupportDIR,
    tauriAssetServeDir,
    tauriAssetServeBaseURL,
    documentsDIR,
    tempDIR,
    userProjectsDir;

function _setupVFS(fsLib, pathLib){
    Phoenix.VFS = {
        getRootDir: () => '/fs/',
        getMountDir: () => '/mnt/',
        getTauriDir: () => '/tauri/',
        getAppSupportDir: () => appSupportDIR,
        getExtensionDir: () => extensionDIR,
        getUserExtensionDir: () => `${extensionDIR}user`,
        getDevExtensionDir: () => `${extensionDIR}dev`,
        getDevTempExtensionDir: () => `${extensionDIR}devTemp`,
        getTempDir: () => tempDIR,
        getTauriAssetServeDir: () => tauriAssetServeDir,
        getUserDocumentsDirectory: () => documentsDIR,
        getUserProjectsDirectory: () => userProjectsDir,
        _getVirtualDocumentsDirectory: () => '/fs/local/',
        getDefaultProjectDir: () => `${userProjectsDir}default project/`,
        ensureTrailingSlash: function (path) {
            if(!path.endsWith("/")) {
                return `${path}/`;
            }
            return path;
        },
        /**
         * Gets the tauri virtual path given a platform path.
         * @throws Error If the system path cannot be converted to virtualPath
         */
        getTauriVirtualPath: fs.getTauriVirtualPath,
        /**
         * Check if a given full path is located in the users local machine drive. For eg. fs access paths are accounted
         * as local disc path, as well as tauri fs paths.
         * @param fullPath
         */
        isLocalDiscPath: function (fullPath) {
            if(fullPath &&
                (fullPath.startsWith(Phoenix.VFS.getTauriDir()) || fullPath.startsWith(Phoenix.VFS.getMountDir()) )){
                return true;
            }
            return false;
        },
        ensureExistsDir: function (path, cb) {
            Phoenix.VFS.exists(path, (exists) =>{
                // We have to do the exists check explicitly here instead of only using fs.mkdir call check EEXIST code
                // as trying to call mkdir on `/mnt/someFolder` will throw an error even if the mount point exists.
                // mount points can only be created by the mount call.
                if(exists){
                    cb();
                    return;
                }
                Phoenix.fs.mkdirs(path, 0o755, true, function(err) {
                    if (err && err.code !== 'EEXIST') {
                        cb(err);
                    }
                    cb();
                });
            });
        },
        ensureExistsDirAsync: async function (path) {
            return new Promise((resolve, reject)=>{
                Phoenix.VFS.ensureExistsDir(path, (err) =>{
                    if(err){
                        reject(err);
                    } else {
                        resolve();
                    }
                });
            });
        },
        /**
         * Converts a phoenix virtual serving url to absolute path in file system or null
         * http://localhost:8000/src/phoenix/vfs/fs/app/extensions/user/themesforbrackets/requirejs-config.json
         * to /fs/app/extensions/user/themesforbrackets/requirejs-config.json
         * @param fullURL
         * @returns {string|null}
         */
        getPathForVirtualServingURL: function (fullURL) {
            if(Phoenix.isNativeApp) {
                if(fullURL.startsWith(tauriAssetServeBaseURL)){
                    const assetRelativePath = decodeURIComponent(fullURL.replace(tauriAssetServeBaseURL, ""))
                        .replace(/\\/g, "/"); // replace windows path forward slashes \ to /
                    return `${tauriAssetServeDir}${assetRelativePath}`;
                }
                return null;
            }
            if(window.fsServerUrl && fullURL.startsWith(window.fsServerUrl)){
                return fullURL.replace(window.fsServerUrl, "/");
            }
            return null;
        },
        getVirtualServingURLForPath: function (fullPath) {
            if(Phoenix.isNativeApp) {
                if(fullPath.startsWith(tauriAssetServeDir)){
                    const platformPath = fs.getTauriPlatformPath(fullPath)
                        .replace(/\\/g, "/"); // windows style paths to unix style c:\x\y to c:/x/y
                    return decodeURIComponent(window.__TAURI__.tauri.convertFileSrc(platformPath));
                }
                return null;
            }
            return window.fsServerUrl.slice(0, -1) + fullPath;
        },
        exists: function (path, cb) {
            fs.stat(path, function (err, stats){
                if (stats && !err) {
                    cb(true);
                } else {
                    cb(false);
                }
            });
        },
        existsAsync: async function (path) {
            return new Promise((resolve)=>{
                Phoenix.VFS.exists(path, (exists) =>{
                    resolve(exists);
                });
            });
        },
        /**
         * Deletes a file/dir asynchronously. resolves on success or rejects on error.
         *
         * @function
         * @param {string} filePath - The path of the file/dir to be deleted.
         * @returns {Promise<Object>} A promise that resolves on success or rejects on error.
         */
        unlinkAsync: async function (filePath) {
            return new Promise((resolve, reject)=>{
                fs.unlink(filePath, (err)=>{
                    if (err) {
                        reject(err);
                    } else {
                        resolve();
                    }
                });
            });
        },
        /**
         * deletes a file/dir asynchronously, always resolves, never rejects.
         *
         * @function
         * @param {string} filePath - The path of the file/dir to be deleted.
         * @returns {Promise<Object>} A promise that resolves to an object containing either
         * an `error` property if there is an error, or just {} on success.
         */
        unlinkResolves: async function (filePath) {
            return new Promise((resolve)=>{
                fs.unlink(filePath, (error)=>{
                    if(error){
                        resolve({error: error});
                        return;
                    }
                    resolve({});
                });
            });
        },
        /**
         * Reads the contents of a file asynchronously, always resolves, never rejects.
         * Mainly use to read config and other files.
         * This should not be used for reading project files that are being edited, for that use file system APIs
         * as that apis will be able to deal with files being edited in the editor.
         *
         * @function
         * @param {string} filePath - The path of the file to be read.
         * @param {string} encoding - The encoding to use for reading the file.
         * @returns {Promise<Object>} A promise that resolves to an object containing either
         * an `error` property if there is an error, or a `data` property with the file contents.
         */
        readFileResolves: function (filePath, encoding) {
            return new Promise((resolve)=>{
                fs.readFile(filePath, encoding, function (error, data) {
                    if(error){
                        resolve({error: error});
                        return;
                    }
                    resolve({data: data});
                });
            });
        },
        /**
         * Reads the contents of a file asynchronously, resolves with content or rejects with error.
         * Mainly use to read config and other files.
         * This should not be used for reading project files that are being edited, for that use file system APIs
         * as that apis will be able to deal with files being edited in the editor.
         *
         * @param {string} filePath - The path to the file to be read.
         * @param {string} encoding - The encoding format to use when reading the file.
         * @returns {Promise<string>} A promise that resolves with the file data when the read is successful,
         * or rejects with an error if the read operation fails.
         */
        readFileAsync: function (filePath, encoding) {
            return new Promise((resolve, reject)=>{
                fs.readFile(filePath, encoding, function (error, data) {
                    if(error){
                        reject(error);
                        return;
                    }
                    resolve(data);
                });
            });
        },
        /**
         * Asynchronously writes data to a file, replacing the file if it already exists.
         * Mainly use to write config and other files.
         * This should not be used for write project files that are being edited, for that use file system APIs
         * as that apis will be able to deal with files being edited in the editor.
         *
         * @param {string} filePath - The path of the file where the data should be written.
         * @param {string} content - The data to write into the file.
         * @param {string} encoding - The character encoding to use when writing the file.
         * @returns {Promise<void>} A promise that resolves when the file has been successfully written,
         *  or rejects with an error if the operation fails.
         */
        writeFileAsync: function (filePath, content, encoding) {
            return new Promise((resolve, reject) => {
                fs.writeFile(filePath, content, encoding, (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve();
                    }
                });
            });
        },
        fs: fsLib,
        path: pathLib
    };
    Phoenix.fs = fsLib;
    Phoenix.path = pathLib;

    return Phoenix.VFS;
}

async function setupAppSupportAndExtensionsDir() {
    if(Phoenix.isNativeApp) {
        appSupportDIR = fs.getTauriVirtualPath(window._tauriBootVars.appLocalDir);
        if(!appSupportDIR.endsWith("/")){
            appSupportDIR = `${appSupportDIR}/`;
        }
        tauriAssetServeDir = `${appSupportDIR}assets/`;
        tauriAssetServeBaseURL = decodeURIComponent(window.__TAURI__.tauri.convertFileSrc(
            fs.getTauriPlatformPath(tauriAssetServeDir)))
            .replace(/\\/g, "/"); // windows style paths to unix style c:\x\y to c:/x/y
        extensionDIR = `${tauriAssetServeDir}extensions/`;
        // in tauri, the /fs/ folder is not a requirement for boot, so we won't fait for it.
        // also this creates wired indexed db lock bugs in tauri where the boot leads to a blank screen.
        Phoenix.VFS.ensureExistsDirAsync(Phoenix.VFS.getRootDir())
            .catch(console.error);
    } else {
        appSupportDIR = '/fs/app/';
        extensionDIR = `${appSupportDIR}extensions/`;
        await Phoenix.VFS.ensureExistsDirAsync(Phoenix.VFS.getRootDir());
    }
    await Promise.all([
        Phoenix.VFS.ensureExistsDirAsync(Phoenix.VFS.getAppSupportDir()),
        Phoenix.VFS.ensureExistsDirAsync(Phoenix.VFS.getExtensionDir()),
        Phoenix.VFS.ensureExistsDirAsync(Phoenix.VFS.getUserExtensionDir()),
        Phoenix.VFS.ensureExistsDirAsync(Phoenix.VFS.getDevExtensionDir()),
        Phoenix.VFS.ensureExistsDirAsync(Phoenix.VFS.getDevTempExtensionDir())
    ]);
}

async function setupDocumentsDir() {
    if(Phoenix.isNativeApp) {
        documentsDIR = fs.getTauriVirtualPath(window._tauriBootVars.documentDir);
        if(!documentsDIR.endsWith("/")){
            documentsDIR = `${documentsDIR}/`;
        }
        const appName = window._tauriBootVars.appname;
        userProjectsDir = `${documentsDIR}${appName}/`;
    } else {
        documentsDIR = Phoenix.VFS._getVirtualDocumentsDirectory();
        userProjectsDir = documentsDIR;
    }
    await Phoenix.VFS.ensureExistsDirAsync(documentsDIR);
    console.log("Documents dir setup done");
}

async function setupTempDir() {
    if(Phoenix.isNativeApp) {
        tempDIR = fs.getTauriVirtualPath(window._tauriBootVars.tempDir);
        if(!tempDIR.endsWith("/")){
            tempDIR = `${tempDIR}/`;
        }
        const appName = window._tauriBootVars.appname;
        tempDIR = `${tempDIR}${appName}/`;
    } else {
        tempDIR = '/temp/';
    }
    await Phoenix.VFS.ensureExistsDirAsync(tempDIR);
    console.log("Temp dir setup done");
}

const _createAppDirs = async function () {
    console.log("Waiting for tauri boot variables...");
    if(window._tauriBootVarsPromise) {
        await window._tauriBootVarsPromise;
    }
    console.log("Creating appdirs...");
    // Create phoenix app dirs
    await Promise.all([
        setupAppSupportAndExtensionsDir(),
        setupDocumentsDir(),
        setupTempDir()
    ]);
    console.log("Appdirs created...");
};


const CORE_LIB_GUARD_INTERVAL = 5000;
const _FS_ERROR_MESSAGE = (Phoenix.isNativeApp && Phoenix.platform === "mac") ?
    'Oops. Could not start due to missing file system library.\n\nPhoenix Code requires `macOS 12 Monterey` or higher' :
    'Oops. Could not start due to missing file system library.' +
    '\n\nPlease use a modern browser (released within the last 4 years).';
export default function initVFS() {
    if(!window.fs || !window.path || !window.Phoenix){
        window.alert(_FS_ERROR_MESSAGE);
        throw new Error(_FS_ERROR_MESSAGE);
    }
    const savedfs = window.fs, savedPath = window.path;
    setInterval(()=>{
        if(window.fs !== savedfs){
            console.error("window.fs overwrite detected!! Some extension may have corrupted this." +
                " attempting to revert to original lib.");
            window.fs=savedfs;
        }
        if(window.path !== savedPath){
            console.error("window.path overwrite detected!! Some extension may have corrupted this." +
                " attempting to revert to original lib.");
            window.path=savedPath;
        }

    }, CORE_LIB_GUARD_INTERVAL);

    _setupVFS(window.fs, window.path);
    window._phoenixfsAppDirsCreatePromise = _createAppDirs();
}

