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
