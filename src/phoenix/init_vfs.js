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

function _setupVFS(fsLib, pathLib){
    Phoenix.VFS = {
        getRootDir: () => '/fs/',
        getMountDir: () => '/mnt/',
        getAppSupportDir: () => '/fs/app/',
        getExtensionDir: () => '/fs/app/extensions/',
        getLocalDir: () => '/fs/local/',
        getTempDir: () => '/temp/',
        getTrashDir: () => '/fs/trash/',
        getDefaultProjectDir: () => '/fs/local/default project/',
        getUserDocumentsDirectory: () => '/fs/local/Documents/',
        ensureExistsDir: function (path, cb) {
            Phoenix.VFS.exists(path, (exists) =>{
                // We have to do the exists check explicitly here instead of only using fs.mkdir call check EEXIST code
                // as trying to call mkdir on `/mnt/someFolder` will throw an error even if the mount point exists.
                // mount points can only be created by the mount call.
                if(exists){
                    cb();
                    return;
                }
                fs.mkdirs(path, 777, true, function(err) {
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
         * @param fullPath
         * @returns {string|null}
         */
        getPathForVirtualServingURL: function (fullPath) {
            if(window.fsServerUrl && fullPath.startsWith(window.fsServerUrl)){
                return fullPath.replace(window.fsServerUrl, "/");
            }
            return null;
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
        path: pathLib,
        getFsEncoding: _getFsEncoding
    };
    Phoenix.fs = fsLib;
    Phoenix.path = pathLib;

    return Phoenix.VFS;
}

const _getFsEncoding = function (encoding){
    const encodingStr = encoding.toLowerCase();
    switch (encodingStr){
    case "utf8":
    case "utf-8":
        return "utf8";
    case "ascii":
        return "ascii";
    case "hex":
        return "hex";
    case "ucs2":
    case "ucs-2":
        return "ucs2";
    case "utf16le":
    case "utf-16le":
        return "utf16le";
    case "binary":
        return "binary";
    case "latin1":
        return "latin1";
    case "ISO8859-1":
        return "ISO8859-1";
    }
    return encoding;
};

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
                    Phoenix.VFS.fs.writeFile(indexFile, _SAMPLE_HTML, 'utf8');
                    resolve();
                });
                return;
            }
            resolve();
        });
    });
}

const _createAppDirs = function () {
    // Create phoenix app dirs
    return Promise.all([
        Phoenix.VFS.ensureExistsDirAsync(Phoenix.VFS.getRootDir()),
        Phoenix.VFS.ensureExistsDirAsync(Phoenix.VFS.getAppSupportDir()),
        Phoenix.VFS.ensureExistsDirAsync(Phoenix.VFS.getLocalDir()),
        Phoenix.VFS.ensureExistsDirAsync(Phoenix.VFS.getTrashDir()),
        Phoenix.VFS.ensureExistsDirAsync(Phoenix.VFS.getTempDir()),
        Phoenix.VFS.ensureExistsDirAsync(Phoenix.VFS.getExtensionDir()),
        Phoenix.VFS.ensureExistsDirAsync(Phoenix.VFS.getExtensionDir()+"user"),
        Phoenix.VFS.ensureExistsDirAsync(Phoenix.VFS.getExtensionDir()+"dev"),
        _tryCreateDefaultProject()
    ]);
};


const _FS_ERROR_MESSAGE = 'Oops. Phoenix could not be started due to missing file system library.';
export default function initVFS() {
    if(!window.fs || !window.path || !window.Phoenix){
        window.alert(_FS_ERROR_MESSAGE);
        throw new Error(_FS_ERROR_MESSAGE);
    }

    _setupVFS(window.fs, window.path);
    window._phoenixfsAppDirsCreatePromise = _createAppDirs();
}

