/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
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
/*global BroadcastChannel*/
/*eslint no-console: 0*/
/*eslint strict: ["error", "global"]*/


import {Errors} from "./errno.js";
import MountPointsStore from "./mount_point_storage.js";
import Constants from "./constants.js";

const MOUNT_POINT_CHANGED_NOTIFICATION = 'PHOENIX_MOUNT_POINT_CHANGED_NOTIFICATION';

let MAX_NUM_MOUNTS = 1000000;
let _channel = null;

/**
 * Check if the given path is a subpath of the '/mnt' folder.
 * @param path
 */
function isMountSubPath(path) {
    if (typeof path !== 'string') {
        return false;
    }
    let mntSubPathStart = '/mnt/';
    if (path) {
        path = window.path.normalize(path);
        if (path.startsWith(mntSubPathStart) && path.length > mntSubPathStart.length) {
            return true;
        }
    }
    return false;
}

/**
 * Check if the given path is '/mnt' folder.
 * @param path
 */
function isMountPath(path) {
    if (typeof path !== 'string') {
        return false;
    }
    if (path) {
        path = window.path.normalize(path);
        if (path === Constants.MOUNT_POINT_ROOT) {
            return true;
        }
    }
    return false;
}


function _setupBroadcastChannel() {
    if(_channel){
        return;
    }
    if(typeof BroadcastChannel === 'undefined'){
        /* eslint no-console: 0 */
        console.warn('window.BroadcastChannel not supported. Mount point changes wont reflect across tabs.');
        return;
    }
    _channel = new BroadcastChannel(MOUNT_POINT_CHANGED_NOTIFICATION);
}

function _broadcastMountPointChanged() {
    _setupBroadcastChannel();
    _channel.postMessage(MOUNT_POINT_CHANGED_NOTIFICATION);
}

function _listenToMountPointChanges () {
    _setupBroadcastChannel();
    _channel.onmessage = async function(event) {
        if(event.data === MOUNT_POINT_CHANGED_NOTIFICATION) {
            await MountPointsStore.refreshMountPoints();
        }
    };
}

/**
 * Checks if the given handleToMount is same as or a subdir of all existing mounts
 * @param handleToMount
 * @returns {*[]} array of details of handleToMount relative to existing mount
 * @private
 */
function _resolveFileHandle(handleToMount) {
    let allMountPointResolutions = [];
    const currentMounts = MountPointsStore.getMountPoints();
    for (const [mountName, handle] of Object.entries(currentMounts)) {
        allMountPointResolutions.push(new Promise((resolve) => {
            const isSameEntryPromise = handle.isSameEntry(handleToMount);
            const isSubEntryPromise = handle.resolve(handleToMount);
            Promise.all([isSameEntryPromise, isSubEntryPromise]).then((mountDetail=>{
                let isSameEntry = mountDetail[0] || false;
                let subPathList = mountDetail[1] || [];
                resolve({
                    existingMountName: mountName,
                    isSameEntry: isSameEntry,
                    subPath: subPathList.join('/')
                });
            }));
        }));
    }
    return allMountPointResolutions;
}

function _getPathIfAlreadyMounted(handleToMount) {
    return new Promise((resolve) => {
        let allMountPointResolutions = _resolveFileHandle(handleToMount);
        Promise.all(allMountPointResolutions).then(values => {
            for(let i=0; i<values.length; i++) {
                let mountName = values[i].existingMountName;
                if(values[i].isSameEntry) {
                    resolve(`${Constants.MOUNT_POINT_ROOT}/${mountName}`);
                    return;
                } else if(values[i].subPath.length >= 1) {
                    resolve(`${Constants.MOUNT_POINT_ROOT}/${mountName}/${values[i].subPath}`);
                    return;
                }
            }
            resolve(null);
        });
    });
}

function _getNewMountName(handleToMount) {
    let name = handleToMount.name;
    const currentMounts = MountPointsStore.getMountPoints();
    if(!currentMounts[name]) {
        return name;
    }
    for(let i=0; i<MAX_NUM_MOUNTS; i++) {
        let mountName = `${name}_${i}`;
        if(!currentMounts[mountName]){
            return mountName;
        }
    }
}

/**
 * If the new handle is the same as or a subdir of an existing mount, we return the existing mount path
 * resolved to the given handle. Eg, if a folder `a` with subdir `b` is mounted to `mnt/a`;if we try to mount subdir `b`
 * then, we will return `mnt/a/b` as `b` is a subdirectory of an already mounted directory.
 * @param handleToMount
 * @param currentMounts {mountName1:handle1, ...}
 * @private
 */
function _mountHandle(handleToMount) {
    return new Promise(async (resolve, reject) => {
        let path = await _getPathIfAlreadyMounted(handleToMount);
        if(path){
            resolve(path);
        } else {
            let mountName = _getNewMountName(handleToMount);
            if(!mountName) {
                reject('Mount name not fount');
            } else {
                await MountPointsStore.addMountPoint(mountName, handleToMount);
                resolve(`${Constants.MOUNT_POINT_ROOT}/${mountName}`);
            }
        }
    });
}

function mountNativeFolder(optionalDirHandle, callback) {
    if(!callback) {
        callback = optionalDirHandle;
        optionalDirHandle = null;
    }
    let mountedPath = null;
    let error = null;
    MountPointsStore.refreshMountPoints()
        .then(() => optionalDirHandle || window.showDirectoryPicker())
        .then((directoryHandle) => _mountHandle(directoryHandle))
        .then( mountPath => mountedPath = mountPath)
        .then(() => _broadcastMountPointChanged())
        .catch(function (err) {
            error = new Errors.ENOTMOUNTED(err);
        }).finally(()=>{
            if(callback) {
                callback(error, [mountedPath]);
            } else if (error) {
                throw new Errors.ENOTMOUNTED(error);
            }
        });
}

async function _verifyDirNodeCanBeRead(handle) {
    try {
        if(handle.kind === Constants.KIND_DIRECTORY){
            let entries = handle.entries();
            await entries.next();
        }
        return null;
    } catch (e) {
        if(e.code === e.NOT_FOUND_ERR){
            return new Errors.ENOENT(`Dir does not exist ${handle.name}`, e);
        } else {
            return new Errors.EIO(`Phoenix fs could not read directory ${handle.name}`, e);
        }
    }
}

async function _findLeafNode(currentNode, pathArray, currentIndex, callback) {
    let pathLength = pathArray.length;
    let error = await _verifyDirNodeCanBeRead(currentNode);
    if(error){
        callback(error);
        return;
    }
    if(currentIndex === pathLength) {
        callback(null, currentNode);
    } else {
        let childName = pathArray[currentIndex];
        let childDirHandle = null;
        let childFileHandle = null;
        try {
            childDirHandle = await currentNode.getDirectoryHandle(childName);
        } catch (e) {
            // do nothing
        }
        try {
            childFileHandle = await currentNode.getFileHandle(childName);
        } catch (e) {
            // do nothing
        }

        if(childFileHandle && currentIndex === pathLength - 1) {
            // the last node is a file
            callback(null, childFileHandle);
        } else if(childDirHandle) {
            _findLeafNode(childDirHandle, pathArray, currentIndex + 1, callback);
        } else {
            let path= pathArray.join('/');
            callback(new Errors.ENOENT('File/Dir does not exist: ', path));
        }
    }
}

async function _verifyOrRequestPermission(fileHandle, callback) {
    const options = {
        mode: 'read'
    };

    // Check if permission was already granted. If so, return true.
    try {
        let status = await fileHandle.queryPermission(options);
        if (status === 'granted') {
            callback(true);
            return;
        }
        status = await fileHandle.requestPermission(options);
        if (status === 'granted') {
            callback(true);
        } else {
            callback(false);
        }
    } catch(e){
        callback(false);
    }
}

function getHandleFromPath(normalisedPath, callback) {
    const pathNodes = normalisedPath.split('/');
    const currentMounts = MountPointsStore.getMountPoints();
    if(pathNodes.length < 3 || pathNodes[0] !== '' || pathNodes[1] !== 'mnt'){
        callback(new Errors.EINVAL('Cannot operate on path ' + normalisedPath));
    }
    let mountPoint = currentMounts[pathNodes[2]];
    if(!mountPoint) {
        callback(new Errors.ENOENT('Path does not exist: ', normalisedPath));
        return;
    }
    _verifyOrRequestPermission(mountPoint, (permitted)=>{
        if(permitted){
            _findLeafNode(mountPoint, pathNodes, 3, callback);
        } else {
            callback(new Errors.EACCES('permission denied on path: ' + normalisedPath));
        }
    });
}

async function getHandleFromPathIfPresent(normalisedPath) {
    return new Promise(resolve => {
        getHandleFromPath(normalisedPath, (err, handle) =>{
            if(err) {
                resolve(null);
            } else {
                resolve(handle);
            }
        });
    });
}

function getMountPoints() {
    return MountPointsStore.getMountPoints();
}

function refreshMountPoints() {
    return MountPointsStore.refreshMountPoints();
}

_listenToMountPointChanges();

const Mounts = {
    mountNativeFolder,
    isMountPath,
    isMountSubPath,
    getHandleFromPath,
    getMountPoints,
    refreshMountPoints,
    getHandleFromPathIfPresent
};

export default Mounts;
