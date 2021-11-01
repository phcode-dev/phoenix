/*
 * GNU AGPL-3.0 License
 *
 * Modified work Copyright (c) 2021 - present Core.ai
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
