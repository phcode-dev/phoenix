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
/*global fs*/
/*eslint no-console: 0*/
/*eslint strict: ["error", "global"]*/

import initFsLib from "./fslib.js";

/** Setup virtual file system. This happens before any code of phoenix is loaded.
 * The virtual file system is rooted at /
 * Application support folder that stores app data is /app/
 * Local user storage space is mounted at path /local/
 * Trash storage space is mounted at path /trash/
 *
 * This module should be functionally as light weight as possible with minimal deps as it is a shell component.
 * **/

function _setupVFS(Phoenix, fsLib, pathLib){
    Phoenix.VFS = {
        getRootDir: () => '/fs/',
        getAppSupportDir: () => '/fs/app/',
        getLocalDir: () => '/fs/local/',
        getTrashDir: () => '/fs/trash/',
        getDefaultProjectDir: () => '/fs/local/default project/',
        getUserDocumentsDirectory: () => '/fs/local/Documents/',
        ensureExistsDir: function (path, cb) {
            fs.mkdir(path, function(err) {
                if (err && err.code !== 'EEXIST') {
                    cb(err);
                }
                cb();
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


const _FS_ERROR_MESSAGE = 'Oops. Phoenix could not be started due to missing file system library.';

const alertError = function (message, err){
    window.alert(message);
    throw new Error(err || message);
};

const errorCb = function (err){
    if(err) {
        alertError(_FS_ERROR_MESSAGE, err);
    }
};

const _createAppDirs = function (vfs) {
    // Create phoenix app dirs
    vfs.ensureExistsDir(vfs.getRootDir(), errorCb);
    vfs.ensureExistsDir(vfs.getAppSupportDir(), errorCb);
    vfs.ensureExistsDir(vfs.getLocalDir(), errorCb);
    vfs.ensureExistsDir(vfs.getTrashDir(), errorCb);
};

const _SAMPLE_HTML = `<!DOCTYPE html>
<html>
    <head>
        <title>Phoenix Editor for the web</title>
    </head>
 
    <body>
        <h1>Welcome to Phoenix</h1>
        <p> Phoenix is in alpha and is under active development.</p>
        <p> Use Google Chrome/ Microsoft Edge/ Opera browser for opening projects in your system using the 
         [File Menu > Open Folder] Option or by pressing Ctrl+Shift+O/ cmd+shift+O shortcut</p>
    </body>
</html>`;

const _createDefaultProject = function (vfs, Phoenix) {
    // Create phoenix app dirs
    // Create Phoenix default project if it doesnt exist
    let projectDir = vfs.getDefaultProjectDir();
    Phoenix.firstBoot = false;
    vfs.exists(projectDir, (exists)=>{
        if(!exists){
            vfs.ensureExistsDir(projectDir, errorCb);
            let indexFile = vfs.path.normalize(`${projectDir}/index.html`);
            Phoenix.firstBoot = true;
            fs.writeFile(indexFile, _SAMPLE_HTML, 'utf8', errorCb);
        }
    });
};

export default function init(Phoenix, FilerLib) {
    if(!FilerLib || !Phoenix){
        alertError(_FS_ERROR_MESSAGE);
    }

    initFsLib(Phoenix, FilerLib);

    const vfs = _setupVFS(Phoenix, window.fs, window.path);
    _createAppDirs(vfs);
    _createDefaultProject(vfs, Phoenix);
}

