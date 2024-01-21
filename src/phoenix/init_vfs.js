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
        /**
         * Converts a phoenix virtual serving url to absolute path in file system or null
         * http://localhost:8000/src/phoenix/vfs/fs/app/extensions/user/themesforbrackets/requirejs-config.json
         * to /fs/app/extensions/user/themesforbrackets/requirejs-config.json
         * @param fullURL
         * @returns {string|null}
         */
        getPathForVirtualServingURL: function (fullURL) {
            if(Phoenix.browser.isTauri) {
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
            if(Phoenix.browser.isTauri) {
                if(fullPath.startsWith(tauriAssetServeDir)){
                    const platformPath = fs.getTauriPlatformPath(fullPath)
                        .replace(/\\/g, "/"); // windows style paths to unix style c:\x\y to c:/x/y
                    return decodeURIComponent(window.__TAURI__.tauri.convertFileSrc(platformPath));
                }
                return null;
            }
            return window.fsServerUrl.slice(0, -1) + fullPath;
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
        fs: fsLib,
        path: pathLib
    };
    Phoenix.fs = fsLib;
    Phoenix.path = pathLib;

    return Phoenix.VFS;
}

const _SAMPLE_HTML = `<!DOCTYPE html>
<html>
    <head>
        <title>Phoenix Editor for the web</title>
    </head>
 
    <body>
        <h1>Welcome to Phoenix</h1>
        <p> Modern, Open-source, IDE For The Web.</p>
    </body>
</html>`;

// always resolves even if error
function _tryCreateDefaultProject() {
    // Create phoenix app dirs
    // Create Phoenix default project if it doesnt exist
    return new Promise((resolve)=>{
        let projectDir = Phoenix.VFS.getDefaultProjectDir();
        Phoenix.VFS.exists(projectDir, (exists)=>{
            if(!exists){
                Phoenix.VFS.ensureExistsDir(projectDir, (err)=>{
                    if(err){
                        logger.reportError(err, "Error creating default project");
                    }
                    let indexFile = Phoenix.VFS.path.normalize(`${projectDir}/index.html`);
                    Phoenix.VFS.fs.writeFile(indexFile, _SAMPLE_HTML, 'utf8', ()=>{});
                    resolve();
                });
                return;
            }
            resolve();
        });
    });
}

async function setupAppSupportAndExtensionsDir() {
    if(Phoenix.browser.isTauri) {
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
    if(Phoenix.browser.isTauri) {
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
    await _tryCreateDefaultProject();
    console.log("Documents dir setup done");
}

async function setupTempDir() {
    if(Phoenix.browser.isTauri) {
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
const _FS_ERROR_MESSAGE = 'Oops. Phoenix could not be started due to missing file system library.';
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

