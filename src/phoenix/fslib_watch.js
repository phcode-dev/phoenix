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
/*global BroadcastChannel*/
/*eslint no-console: 0*/
/*eslint strict: ["error", "global"]*/


let _channel = null;
let _watchListeners = [];
let _globmatch = null;

const WATCH_EVENT_NOTIFICATION = 'PHOENIX_WATCH_EVENT_NOTIFICATION';
const WATCH_EVENT_CREATED = 'created';
const WATCH_EVENT_DELETED = 'deleted';
const WATCH_EVENT_CHANGED = 'changed';

function _setupBroadcastChannel() {
    if(_channel){
        return;
    }
    if(typeof BroadcastChannel === 'undefined'){
        /* eslint no-console: 0 */
        console.warn('window.BroadcastChannel not supported. File system watch events across tabs wont be synced.');
        return;
    }
    _channel = new BroadcastChannel(WATCH_EVENT_NOTIFICATION);
}

function _setupGlobeMatcher(){
    if(_globmatch){
        return;
    }
    _globmatch = require("thirdparty/globmatch");
}

function _broadcastWatchEvent(event) {
    _setupBroadcastChannel();
    _channel.postMessage(event);
}

function _isAnIgnoredPath(path, ignoreGlobList) {
    _setupGlobeMatcher();
    if(ignoreGlobList && ignoreGlobList.length > 0){
        for (const glob of ignoreGlobList){
            if (_globmatch(path, glob)) {
                return true;
            }
        }
    }
    return false;
}

function _isSameOrSubDirectory(parent, child) {
    return !(window.path.relative(parent, child).startsWith('..'));
}

// event{ path, eventName}
function _processFsWatchEvent(event, broadcast=true) {
    if(broadcast){
        _broadcastWatchEvent(event);
    }
    for (const listener of _watchListeners){
        if(listener.callback
            && _isSameOrSubDirectory(listener.path, event.path)
            && !_isAnIgnoredPath(event.path, listener.ignoreGlobList)){
            listener.callback(event.event, event.parentDirPath, event.entryName, event.path);
        }
    }
}

function _listenToExternalFsWatchEvents() {
    _setupBroadcastChannel();
    _channel.onmessage = async function(event) {
        console.log("External fs watch event: ", event.data);
        _processFsWatchEvent(event.data, false);
    };
}

function watch(path, ignoreGlobList, changeCallback, callback) {
    if(changeCallback){
        _watchListeners.push({
            path: path,
            ignoreGlobList: ignoreGlobList,
            callback: changeCallback
        });
    }
    callback();
}

function _triggerEvent(path, eventType) {
    let pathLib = window.path;
    path = pathLib.normalize(path);
    let event = {
        event: eventType,
        parentDirPath: `${pathLib.dirname(path)}/`,
        entryName: pathLib.basename(path),
        path: path
    };
    _processFsWatchEvent(event);
}

function reportUnlinkEvent(path) {
    _triggerEvent(path, WATCH_EVENT_DELETED);
}

function reportChangeEvent(path) {
    _triggerEvent(path, WATCH_EVENT_CHANGED);
}

function reportCreateEvent(path) {
    _triggerEvent(path, WATCH_EVENT_CREATED);
}

function unwatch(path, callback) {
    _watchListeners = _watchListeners.filter(function (item) {
        return item.path !== path;
    });
    callback();
}

function unwatchAll(callback) {
    _watchListeners =[];
    callback();
}

_listenToExternalFsWatchEvents();

const FsWatch = {
    watch,
    unwatch,
    unwatchAll,
    reportUnlinkEvent,
    reportChangeEvent,
    reportCreateEvent
};

export default FsWatch;
