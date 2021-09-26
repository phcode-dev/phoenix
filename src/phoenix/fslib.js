/*
 * Copyright (c) 2021 - present core.ai . All rights reserved.
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

import {Errors} from "./errno.js";
import NativeFS from "./fslib_native.js";
import Constants from "./constants.js";

let filerLib = null;

/**
 * Offers functionality similar to mkdir -p
 *
 * Asynchronous operation. No arguments other than a possible exception
 * are given to the completion callback.
 */
function mkdir_p (fsLib, path, mode, callback, position) {
    const osSep = '/';
    const parts = filerLib.path.normalize(path).split(osSep);

    mode = mode || process.umask();
    position = position || 0;

    if (position >= parts.length) {
        return callback();
    }

    var directory = parts.slice(0, position + 1).join(osSep) || osSep;
    fsLib.stat(directory, function(err) {
        if (err === null) {
            mkdir_p(fsLib, path, mode, callback, position + 1);
        } else {
            fsLib.mkdir(directory, mode, function (err) {
                if (err && err.code !== 'EEXIST') {
                    return callback(err);
                } else {
                    mkdir_p(fsLib, path, mode, callback, position + 1);
                }
            });
        }
    });
}

function _ensure_mount_directory() {
    fileSystemLib.mkdirs(Constants.MOUNT_POINT_ROOT);
    NativeFS.refreshMountPoints();
}


const fileSystemLib = {
    mountNativeFolder: async function (...args) {
        NativeFS.mountNativeFolder(...args);
    },
    readdir: function (...args) {
        filerLib.fs.readdir(...args);
    },
    stat: function (...args) {
        filerLib.fs.stat(...args);
    },
    readFile: function (...args) {
        filerLib.fs.readFile(...args);
    },
    writeFile: function (...args) {
        filerLib.fs.writeFile(...args);
    },
    mkdir: function (...args) {
        filerLib.fs.mkdir(...args);
    },
    rename: function (...args) {
        filerLib.fs.rename(...args);
    },
    unlink: function (...args) {
        filerLib.fs.unlink(...args);
    },
    showSaveDialog: function () {
        throw new Errors.ENOSYS('Phoenix fs showSaveDialog function not yet supported.');
    },
    watch: function () {
        throw new Errors.ENOSYS('Phoenix fs watch function not yet supported.');
    },
    moveToTrash: function () {
        throw new Errors.ENOSYS('Phoenix fs moveToTrash function not yet supported.');
    },
    mkdirs: function (path, mode, recursive, callback) {
        if (typeof recursive !== 'boolean') {
            callback = recursive;
            recursive = false;
        }

        if (typeof callback !== 'function') {
            callback = function () {};
        }

        if (!recursive) {
            fileSystemLib.mkdir(path, mode, callback);
        } else {
            mkdir_p(fileSystemLib, path, mode, callback);
        }
    }
};

export default function initFsLib(Phoenix, FilerLib) {
    filerLib = FilerLib;
    window.path = FilerLib.path;
    window.fs = fileSystemLib;

    _ensure_mount_directory();
}
