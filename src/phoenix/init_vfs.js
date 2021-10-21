/*
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 * Acknowledgements: https://github.com/bpedro/node-fs
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
/*global fs, Phoenix, process*/
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
    return undefined;
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

const _createDefaultProject = function (vfs) {
    // Create phoenix app dirs
    // Create Phoenix default project if it doesnt exist
    vfs.exists(vfs.getDefaultProjectDir(), (exists)=>{
        if(!exists){
            vfs.ensureExistsDir(vfs.getDefaultProjectDir(), errorCb);
            let projectDir = vfs.getDefaultProjectDir();
            let indexFile = vfs.path.normalize(`${projectDir}/index.html`);
            vfs.fs.stat(indexFile, function (err){
                if (err && err.code === 'ENOENT') {
                    fs.writeFile(indexFile, _SAMPLE_HTML, 'utf8', errorCb);
                }
            });
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
    _createDefaultProject(vfs);
}

