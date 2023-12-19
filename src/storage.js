/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 * Original work Copyright (c) 2012 - 2021 Adobe Systems Incorporated. All rights reserved.
 *
 * This program is free software: you can redistribute it and/or modify it
 * under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT
 * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
 * FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License
 * for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see https://opensource.org/licenses/AGPL-3.0.
 *
 */

// The main persistent storage apis used to store preferences, setting etc. This is synced across all running phoenix
// tabs in the browser and processes in the desktop app.
// Data is eventually consistent with sync delays up to a few seconds.

/*global EventDispatcher*/

function setupGlobalStorageBrowser() {

    const PH_LOCAL_STORE_PREFIX = "Ph_";
    const PHOENIX_STORAGE_BROADCAST_CHANNEL_NAME = "ph-storage";
    const EXTERNAL_CHANGE_BROADCAST_INTERVAL = 500;
    const EXTERNAL_CACHE_CLEAR_INTERVAL = 2000;
    // Since this is a sync API, performance is critical. So we use a memory map in cache. This limits the size
    // of what can be stored in this storage as if fully in memory.
    const CHANGE_TYPE_EXTERNAL = "External",
        CHANGE_TYPE_INTERNAL = "Internal";
    const MGS_CHANGE = 'change';
    const cache = {};
    let pendingBroadcast = {},
        watchExternalKeys = {},
        externalWatchKeyList = [];

    const storageChannel = new BroadcastChannel(PHOENIX_STORAGE_BROADCAST_CHANNEL_NAME);
    function _broadcastPendingChanges() {
        storageChannel.postMessage({type: MGS_CHANGE, keys: Object.keys(pendingBroadcast)});
        pendingBroadcast = {};
    }
    setInterval(_broadcastPendingChanges, EXTERNAL_CHANGE_BROADCAST_INTERVAL);
    // Listen for messages on the channel
    storageChannel.onmessage = (event) => {
        const message = event.data;
        if(message.type === MGS_CHANGE){
            for(let key of message.keys){
                PhStore.trigger(key, CHANGE_TYPE_EXTERNAL);
                delete cache[key]; // clear cache for changed data
            }
        }
    };

    setInterval(()=>{
        for(let key of externalWatchKeyList){
            delete cache[key];
        }
    }, EXTERNAL_CACHE_CLEAR_INTERVAL);

    /**
     * Retrieves the value associated with the specified key from the browser's local storage.
     *
     * @param {string} key - The key to retrieve the value for.
     * @returns {object|null} - The value associated with the specified key. Returns null if the key does not exist.
     */
    function getItem(key) {
        let cachedResult = cache[key];
        if(cachedResult){
            return cachedResult;
        }
        const jsonStr = localStorage.getItem(PH_LOCAL_STORE_PREFIX + key);
        if(jsonStr === null){
            return null;
        }
        try {
            cachedResult = JSON.parse(jsonStr);
            cache[key] = cachedResult;
            return cachedResult;
        } catch (e) {
            return null;
        }
    }

    /**
     * Sets the value of a specified key in the localStorage.
     *
     * @param {string} key - The key to set the value for.
     * @param {*} value - The value to be stored. Can be any valid JSON serializable data type.
     *
     */
    function setItem(key, value) {
        localStorage.setItem(PH_LOCAL_STORE_PREFIX + key, JSON.stringify(value));
        cache[key] = value;
        if(watchExternalKeys[key]){
            pendingBroadcast[key] = true;
        }
        PhStore.trigger(key, CHANGE_TYPE_INTERNAL);
    }

    /**
     * Enables monitoring of external changes to the specified key when there are multiple Phoenix windows/instances.
     * By default, PhStore.on(<key name>, fn) only triggers for key value changes within the current instance.
     * Calling this function will activate change events when changes occur in other instances as well.
     * Note that there may be eventual consistent delays of up to 1 second.
     *
     * @param {string} key - The key to observe changes for.
     */

    function watchExternalChanges(key) {
        watchExternalKeys[key] = true;
        externalWatchKeyList = Object.keys(watchExternalKeys);
    }

    /**
     * If there are multiple phoenix windows/instances, This function will stop watching changes
     * made by other phoenix instances for this key.
     *
     * @param {string} key - The key for which changes are being observed.
     */
    function unwatchExternalChanges(key) {
        delete watchExternalKeys[key];
        externalWatchKeyList = Object.keys(watchExternalKeys);
    }


    const PhStore = {
        getItem,
        setItem,
        watchExternalChanges,
        unwatchExternalChanges
    };
    EventDispatcher.makeEventDispatcher(PhStore);
    window.PhStore = PhStore;
}

function setupGlobalStorageTauri(){
    // todo passing in browser storage for now. we should change this for tauri.
    setupGlobalStorageBrowser();
}

if(Phoenix.browser.isTauri){
    setupGlobalStorageTauri();
} else {
    setupGlobalStorageBrowser();
}
