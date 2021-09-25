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
/*global idb*/
/*eslint no-console: 0*/
/*eslint strict: ["error", "global"]*/

/**
 * Persists serialised mounted native file system handles to indexed db to usage across tabs and sessions.
**/
import Constants from "./constants.js";

const PHOENIX_MOUNTS_DB_NAME = 'PHOENIX_MOUNTS';
const STORE_NAME = 'FS_ACCESS';
const MOUNT_POINTS_KEY = 'MOUNT_POINTS';
const VERSION_1 = 1;

let db = null;
let _currentMounts = {};

async function _ensureDB(){
    if(db) {
        return;
    }
    db = await idb.openDB(PHOENIX_MOUNTS_DB_NAME, VERSION_1, {
        upgrade(db) {
            db.createObjectStore(STORE_NAME);
        }
    });

}

async function addMountPoint(mountName, handle) {
    await _ensureDB();
    const tx = db.transaction(STORE_NAME, Constants.IDB_RW_TYPE);
    const store = tx.objectStore(STORE_NAME);
    _currentMounts = (await store.get(MOUNT_POINTS_KEY)) || {};
    _currentMounts[mountName] = handle;
    await store.put(_currentMounts, MOUNT_POINTS_KEY);
    await tx.done;
}

async function refreshMountPoints() {
    await _ensureDB();
    const tx = db.transaction(STORE_NAME, Constants.IDB_RW_TYPE);
    const store = tx.objectStore(STORE_NAME);
    _currentMounts = (await store.get(MOUNT_POINTS_KEY)) || {};
    await tx.done;
    return _currentMounts;
}

function getMountPoints() {
    return _currentMounts;
}

const MountPointsStore = {
    addMountPoint,
    getMountPoints,
    refreshMountPoints
};

export default MountPointsStore;
