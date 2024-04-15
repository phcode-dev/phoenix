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

/** The main persistent storage apis used to store preferences, setting etc. This is synced across all running phoenix
 * tabs in the browser and processes in the desktop app.
 * Data is eventually consistent with sync delays up to a few seconds.
 *
 * Storage API that seamlessly works in both web browsers and Tauri. In web browsers, the API utilizes local storage,
 * providing a consistent and reliable key-value store for small configuration data with persistence guarantees and
 * efficient read-write performance. It's important to note that this storage API is not suitable for storing
 * large data, such as file content or debug-related information.
 *
 * Features:
 * - Synchronous reads with in-memory caching for optimized performance.
 * - Read-after-write consistency within a single instance.
 * - Eventual consistency (within approximately 3 seconds) when used across multiple processes or tabs.
 *
 * The motivation behind implementing this unified storage API is to address the limitations and potential data loss
 * issues associated with using local storage and IndexedDB in our desktop builds. Specifically, certain scenarios,
 * like WebKit's data clearing in Linux and macOS Tauri builds as part of Intelligent Tracking Prevention (ITP),
 * could lead to data loss.
 *
 * The main aim is to have data durability guarantees in desktop builds.
 * In bowser, we can only overcome this if we have cloud login. Eventually we can have a cloud backend that will sync
 * with this storage implementation.
 */

/*global EventDispatcher*/

import {set, entries, createStore} from './thirdparty/idb-keyval.js';

(function setupGlobalStorage() {
    if(window.PhStore){
        console.error(`window.PhStore already setup. Ignoring.`);
        return;
    }
    const EVENT_CHANGED = "change";
    const FIRST_BOOT_TIME = "firstBootTime";
    let storageNodeConnector;
    let _testKey;
    let nodeStoragePhoenixApis = {};
    const isBrowser = !Phoenix.browser.isTauri;
    const isDesktop = Phoenix.browser.isTauri;
    const PHSTORE_DB = "PhStore";
    const PHSTORE_STORE_NAME = "KVStore";
    let idbStore;

    function _getIDBStorage() {
        if(!idbStore){
            idbStore = createStore(PHSTORE_DB, PHSTORE_STORE_NAME);
        }
        return idbStore;
    }

    const PHOENIX_STORAGE_BROADCAST_CHANNEL_NAME = "ph-storage";
    const EXTERNAL_CHANGE_BROADCAST_INTERVAL = 500;
    // Since this is a sync API, performance is critical. So we use a memory map in cache. This limits the size
    // of what can be stored in this storage as if fully in memory.
    const CHANGE_TYPE_EXTERNAL = "External",
        CHANGE_TYPE_INTERNAL = "Internal";
    const MGS_CHANGE = 'change';
    let cache = {};
    // map from watched keys that was set in this instance to
    // modified time and value - key->{t,v}
    let pendingBroadcastKV = {},
        watchExternalKeys = {}; // boolean map

    function commitExternalChanges(changedKV) {
        for(let key of Object.keys(changedKV)){
            // we only update the key and trigger if the key is being watched here.
            // If unwatched keys are updated from another window, for eg, theme change pulled in from a new
            // theme installed in another window cannot be applied in this window. So the code has to
            // explicitly support external changes by calling watchExternalChanges API.
            if(watchExternalKeys[key]) {
                const externalChange = changedKV[key]; // {t,v} in new value, t = changed time
                // if the change time of the external event we got is more recent than what we have,
                // only then accept the change. else we have more recent data.
                if(!cache[key] || (externalChange.t > cache[key].t)) {
                    cache[key] = externalChange;
                    PhStore.trigger(key, CHANGE_TYPE_EXTERNAL);
                }
            }
        }
    }

    if(isDesktop){
        const STORAGE_NODE_CONNECTOR_ID = "ph_storage";
        storageNodeConnector = window.PhNodeEngine.createNodeConnector(
            STORAGE_NODE_CONNECTOR_ID, nodeStoragePhoenixApis);
        window._tauriBootVarsPromise.then(()=>{
            storageNodeConnector.execPeer("openDB", window._tauriBootVars.appLocalDir);
        });
        if(Phoenix.isTestWindow) {
            window.storageNodeConnector = storageNodeConnector;
        }
        storageNodeConnector.on(EVENT_CHANGED, (_evt, changedKV)=>{
            commitExternalChanges(changedKV);
        });
    }

    if(isBrowser) {
        const storageChannel = new BroadcastChannel(PHOENIX_STORAGE_BROADCAST_CHANNEL_NAME);
        setInterval(()=>{
            // broadcast all changes made to watched keys in this instance to others
            storageChannel.postMessage({type: MGS_CHANGE, keys: pendingBroadcastKV});
            pendingBroadcastKV = {};

        }, EXTERNAL_CHANGE_BROADCAST_INTERVAL);
        // Listen for messages on the channel
        storageChannel.onmessage = (event) => {
            const message = event.data;
            if(message.type === MGS_CHANGE){
                commitExternalChanges(message.keys);
            }
        };
    }

    /**
     * Retrieves the value associated with the specified key from the browser's local storage.
     *
     * @param {string} key - The key to retrieve the value for.
     * @returns {string|number|boolean|object|null} - The value associated with the specified key. Returns null if the key does not exist.
     */
    function getItem(key) {
        let cachedResult = cache[key];
        if(cachedResult){
            return JSON.parse(cachedResult.v);
        }
        // once we load the db dump from file, we dont ever touch the storage apis again for
        // get operations. This is because in, the get operation is async (via node or indexedDB). in future,
        // we can write a async refresh key api to update values that has been cached if the need arises.
        // but rn, there is no need for the same as every phoenix instance will use its own cached storage
        // that guarantees read after write constancy within an instance, and for external changes, use watch.
        return null;
    }

    /**
     * Sets the value of a specified key in the localStorage.
     *
     * @param {string} key - The key to set the value for.
     * @param {string|number|boolean|object} value - The value to be stored. Can be any valid JSON serializable data type.
     *
     */
    function setItem(key, value) {
        const valueToStore = {
            t: Date.now(), // modified time
            // we store value as string here as during get operation, we can use json.parse to clone instead of
            // using slower structured object clone.
            v: JSON.stringify(value)
        };
        if(!Phoenix.isTestWindow || key === _testKey) {
            if(isDesktop) {
                storageNodeConnector.execPeer("putItem", {key, value: valueToStore});
                // this is an in-memory tauri store that takes care of multi window case, since we have a single
                // instance, all windows share this and can reconstruct the full view from the dumb file + this map
                // when the editor boots up instead of having to write the dump file frequently.
                window.__TAURI__.invoke('put_item', { key, value: JSON.stringify(valueToStore) });
            }
            if(window.debugMode || isBrowser) {
                // in debug mode, we write to browser storage in tauri and browser builds for eazy debug of storage.
                set(key, valueToStore, _getIDBStorage());
            }
        }
        cache[key] = valueToStore;
        if(watchExternalKeys[key] && isBrowser){
            // Broadcast channel is only used in browser, in tauri with multiple tauri process windows,
            // BroadcastChnnel wont work. So we poll LMDB for changes in tauri.
            pendingBroadcastKV[key] = valueToStore;
        }
        PhStore.trigger(key, CHANGE_TYPE_INTERNAL);
    }

    /**
     * Removes an item from storage. This will trigger a change notification on removal if watchers are attached.
     * Watchers are unaffected on removal, you will still get notifications if the key gets created in the future.
     *
     * @param {string} key - The key to remove
     */
    function removeItem(key) {
        setItem(key, null);
    }

    /**
     * Enables best effort monitoring of external changes to the specified key when there are multiple Phoenix
     * windows/instances. By default, PhStore.on(<key name>, fn) only triggers for key value changes within
     * the current instance. Calling this function will activate change events when changes occur in other
     * instances as well. Note that this is a best effort service, there may be eventual consistent delays of
     * up to 1 second or the event may not be received at all.
     *
     * @param {string} key - The key to observe changes for.
     */

    function watchExternalChanges(key) {
        watchExternalKeys[key] = true;
        if(isDesktop && (!Phoenix.isTestWindow || key === _testKey)) {
            const t = (cache[key] && cache[key].t ) || 0;
            storageNodeConnector.execPeer("watchExternalChanges", {key, t});
        }
    }

    /**
     * If there are multiple phoenix windows/instances, This function will stop watching changes
     * made by other phoenix instances for this key.
     *
     * @param {string} key - The key for which changes are being observed.
     */
    function unwatchExternalChanges(key) {
        delete watchExternalKeys[key];
        if(isDesktop && (!Phoenix.isTestWindow || key === _testKey)) {
            storageNodeConnector.execPeer("unwatchExternalChanges", key);
        }
    }

    function setupFirstBoot() {
        try{
            const firstBootTime = getItem(FIRST_BOOT_TIME);
            if(!firstBootTime){
                window.Phoenix.firstBoot = true;
                setItem(FIRST_BOOT_TIME, Date.now());
            }
            // legacy first boot. can be removed after sep 2024
            // this was the original thing we used before we migrated to phStore.
            let legacyKey = "healthData.firstUseDay";
            if(localStorage.getItem(legacyKey)){
                window.Phoenix.firstBoot = false;
            }
        } catch (e) {
            console.error(e);
        }
    }

    const storageReadyPromise = new Promise((resolve) => {
        if(Phoenix.isTestWindow){
            // in test window, we will always use blank storage to init.
            resolve();
            return;
        }
        if(isDesktop){
            async function mergeTauriInMemoryStorage() {
                // The tauri storeage is mainly used in multi window case, where if there are 2+ windows, each window
                // is till live and has not commited the dump file to disc(they only do that on exit or 30 every secs).
                // so the dump file may be stale after window._tauriStorageRestorePromise in the case.
                // we merge the local memory cache maintained at tauri rust side to address this.
                try {
                    const map = await window.__TAURI__.invoke('get_all_items') || {};
                    for(const key of Object.keys(map)){
                        cache[key] = JSON.parse(map[key]);
                    }
                } catch (e) {
                    console.error(e);
                }
                // we never fail, boot with blank storage
                setupFirstBoot();
                resolve();
            }
            // In tauri, we have to read it from app local data dump(which is usually written at app close time. This
            // will help the storage to quick start from a json dump instead of waiting for node to boot up and init lmdb)
            window._tauriStorageRestorePromise
                .then((jsonData)=>{
                    if(jsonData){
                        cache = JSON.parse(jsonData);
                    }
                })
                .catch(console.error)
                .finally(mergeTauriInMemoryStorage);
            return;
        }
        // Use browser default storage- IndexedDB
        entries(_getIDBStorage())
            .then(kvArrayAll=>{
                for(let kvArray of kvArrayAll) {
                    // Get all entries in the store. Each entry is an array of [key, value].
                    // Eg: [[123, 456], ['hello', 'world']]
                    cache[kvArray[0]] = kvArray[1];
                }
            })
            .catch(console.error)
            .finally(()=>{
                setupFirstBoot();
                resolve();
            }); // we never fail, boot with blank storage
    });
    const _PHSTORE_BOOT_DESKTOP_ZOOM_SCALE_KEY = "desktopZoomScale";

    storageReadyPromise
        .then(()=>{
            // do things to do that are critical to user experience here
            // We try to set window zoom as early as possible to prevent zoom flicker
            const zoomFactor = PhStore.getItem(_PHSTORE_BOOT_DESKTOP_ZOOM_SCALE_KEY) || 1;
            if(Phoenix.browser.isTauri){
                window.__TAURI__.tauri.invoke("zoom_window", {scaleFactor: zoomFactor});
            }
        });
    /**
     * Waits till all pending changes are written to disk. This will not trigger a flush operation, but just waits
     * on db to flush all operations to disk that has happened till this call.
     * @returns {Promise<void>|Promise|*}
     */
    async function flushDB() {
        if(isDesktop) {
            // since node connector web socket messages are queued, sending this message will only execute after all
            // outstanding messages are sent to node with web socket.
            await storageNodeConnector.execPeer("flushDB");
        }
    }

    const PhStore = {
        getItem,
        setItem,
        removeItem,
        flushDB,
        watchExternalChanges,
        unwatchExternalChanges,
        storageReadyPromise,
        // private APIs
        _storageBootstrapTime: Date.now() - Phoenix.startTime,
        _PHSTORE_BOOT_DESKTOP_ZOOM_SCALE_KEY,
        CHANGE_TYPE_INTERNAL,
        CHANGE_TYPE_EXTERNAL
    };
    if(Phoenix.isTestWindow) {
        PhStore._setTestKey = function (testKey) {
            _testKey = testKey;
        };
    }
    EventDispatcher.makeEventDispatcher(PhStore);
    window.PhStore = PhStore;
}());
