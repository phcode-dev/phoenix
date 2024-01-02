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

    const PH_LOCAL_STORE_PREFIX = "Ph_";
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
        if(window.nodeSetupDonePromise){
            window.nodeSetupDonePromise.then(nodeConfig =>{
                const STORAGE_NODE_CONNECTOR_ID = "ph_storage";
                storageNodeConnector = window.PhNodeEngine.createNodeConnector(
                    STORAGE_NODE_CONNECTOR_ID, nodeStoragePhoenixApis);
                storageNodeConnector.execPeer("openDB", window._tauriBootVars.appLocalDir);
                if(Phoenix.isTestWindow) {
                    window.storageNodeConnector = storageNodeConnector;
                }
                storageNodeConnector.on(EVENT_CHANGED, (_evt, changedKV)=>{
                    commitExternalChanges(changedKV);
                });
            });
        } else {
            alert("Critical Error! Node Storage could not be started.");
        }
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
        if(Phoenix.isTestWindow || isDesktop){
            // in tauri, once we load the db dump from file, we dont ever touch the storage apis again for
            // get operations. This is because in tauri, the get operation is async via node. in future,
            // we can write a async refresh key api to update values that has been cached if the need arises.
            // but rn, there is no need for the same as every phoenix instance will use its own cached storage
            // that guarantees read after write constancy within an instance, and for external changes, use watch.
            return null;
        }
        const jsonStr = localStorage.getItem(PH_LOCAL_STORE_PREFIX + key);
        if(jsonStr === null){
            return null;
        }
        try {
            cachedResult = JSON.parse(jsonStr);
            cache[key] = cachedResult;
            return JSON.parse(cachedResult.v); // clone. JSON.Parse is faster than structured object clone.
        } catch (e) {
            return null;
        }
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
            }
            if(window.debugMode || isBrowser) {
                // in debug mode, we write to local storage in tauri and browser builds for eazy debug of storage.
                localStorage.setItem(PH_LOCAL_STORE_PREFIX + key, JSON.stringify(valueToStore));
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
        if(isDesktop) {
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
        if(isDesktop) {
            storageNodeConnector.execPeer("unwatchExternalChanges", key);
        }
    }

    function setupFirstBoot() {
        const firstBootTime = getItem(FIRST_BOOT_TIME);
        if(!firstBootTime){
            window.Phoenix.firstBoot = true;
            setItem(FIRST_BOOT_TIME, Date.now());
        }
    }

    const storageReadyPromise = new Promise((resolve) => {
        if(isBrowser || Phoenix.isTestWindow){
            // in browsers its immediately ready as we use localstorage
            // in tests, immediately resolve with empty storage.
            resolve();
            setupFirstBoot();
            return;
        }
        // In tauri, we have to read it from app local data dump(which is usually written at app close time. This
        // will help the storage to quick start from a json dump instead of waiting for node to boot up and init lmdb)
        window._tauriStorageRestorePromise
            .then((jsonData)=>{
                cache = JSON.parse(jsonData);
                setupFirstBoot();
            })
            .finally(resolve);
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
        _storageBootstrapTime: Date.now() - Phoenix.startTime
    };
    if(Phoenix.isTestWindow) {
        PhStore._setTestKey = function (testKey) {
            _testKey = testKey;
        };
    }
    EventDispatcher.makeEventDispatcher(PhStore);
    window.PhStore = PhStore;
}());
