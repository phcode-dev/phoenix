/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 * modified by core.ai, based on work by David Humphrey <david.humphrey@senecacolleage.ca> (@humphd)
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

/* global workbox, importScripts, Serve, HtmlFormatter, Config*/
importScripts('phoenix/virtualfs.js');
importScripts('phoenix/virtualServer/mime-types.js');
importScripts('phoenix/virtualServer/config.js');
importScripts('phoenix/virtualServer/content-type.js');
importScripts('phoenix/virtualServer/webserver.js');
importScripts('https://storage.googleapis.com/workbox-cdn/releases/6.4.1/workbox-sw.js');

const _debugSWCacheLogs = false; // change debug to true to see more logs
const CACHE_FILE_NAME = "cacheManifest.json";
const CACHE_FS_PATH = `/${CACHE_FILE_NAME}`;

workbox.setConfig({debug: _debugSWCacheLogs});

const Route = workbox.routing.Route;
// other strategies include CacheFirst, NetworkFirst Etc..
const cacheFirst = workbox.strategies.CacheFirst;
const StaleWhileRevalidate = workbox.strategies.StaleWhileRevalidate;
const ExpirationPlugin = workbox.expiration.ExpirationPlugin;
const CacheExpiration = workbox.expiration.CacheExpiration;
const DAYS_30_IN_SEC = 60 * 60 * 24 * 30;
const CACHE_NAME_EVERYTHING = "everything"; // This is referenced in index.html as well if you are changing te name.
const CACHE_NAME_CORE_SCRIPTS = "coreScripts";
const CACHE_NAME_EXTERNAL = "external";
const ExpirationManager ={
    "everything": new CacheExpiration(CACHE_NAME_EVERYTHING, {
            maxAgeSeconds: DAYS_30_IN_SEC
        }),
    "coreScripts": new CacheExpiration(CACHE_NAME_CORE_SCRIPTS, {
            maxAgeSeconds: DAYS_30_IN_SEC
        }),
    "external": new CacheExpiration(CACHE_NAME_EXTERNAL, {
        maxAgeSeconds: DAYS_30_IN_SEC
    })
};

function _debugCacheLog(...args) {
    if(_debugSWCacheLogs){
        console.log(...args);
    }
}

self._debugLivePreviewLog = function (...args) {
    if(self._debugSWLivePreviewLogs){ // this is set from the debug menu
        console.log(...args);
    }
}

function _removeParams(url) {
    if(url.indexOf( "?")>-1){
        url = url.substring( 0, url.indexOf( "?")); // remove query string params
    }
    if(location.href.indexOf( "#")>-1){
        url = url.substring( 0, url.indexOf( "#")); // remove hrefs in page
    }
    return url;
}

// service worker controlling route base url. This will be something like https://phcode.dev/ or http://localhost:8000/
let baseURL = location.href;
baseURL = _removeParams(location.href);
if(location.href.indexOf( "/")>-1){
    // http://phcode.dev/index.html -> http://phcode.dev
    baseURL = baseURL.substring( 0, baseURL.lastIndexOf( "/"));
}
if(!baseURL.endsWith('/')){
    baseURL = baseURL + '/';
}
console.log("Service worker: base URL is: ", baseURL);

const CACHE_MANIFEST_URL = `${baseURL}${CACHE_FILE_NAME}`;
console.log("Service worker: cache manifest URL is: ", CACHE_MANIFEST_URL);

// this is the base url where our file system virtual server lives. http://phcode.dev/phoenix/vfs in phoenix or
// http://localhost:8000/phoenix/vfs in dev builds
const virtualServerBaseURL = `${baseURL}${Config.route}`;
console.log("Service worker: Virtual server base URL is: ", virtualServerBaseURL);

// Route with trailing slash (i.e., /path/into/filesystem)
const wwwRegex = new RegExp(`${Config.route}(/.*)`);
// Route minus the trailing slash

function _isVirtualServing(url) {
    return url.startsWith(virtualServerBaseURL);
}

function _shouldVirtualServe(request) {
    return _isVirtualServing(request.url.href);
}

workbox.routing.registerRoute(
    _shouldVirtualServe,
    ({url}) => {
        // Pull the filesystem path off the url
        let path = url.pathname.match(wwwRegex)[1];
        // Deal with encoding in the filename (e.g., spaces as %20)
        path = decodeURI(path);

        const download = false;
        // commented Allow passing `?download` or `dl` to have the file downloaded vs. displayed
        // url.searchParams.get('download') !== null ||
        // url.searchParams.get('dl') !== null;
        let phoenixInstanceID;
        if(path.startsWith("/PHOENIX_LIVE_PREVIEW_")){
            let pathSplit = path.split("/");
            phoenixInstanceID = pathSplit[1].replace("PHOENIX_LIVE_PREVIEW_","");
            pathSplit.shift();pathSplit.shift();
            path = `/${pathSplit.join("/")}`;
        }

        return Serve.serve(path, download, phoenixInstanceID);
    },
    'GET'
);

// Redirect if missing the / on our expected route
workbox.routing.registerRoute(
    _shouldVirtualServe,
    ({url}) => {
        url.pathname = `${Config.route}/`;
        return Promise.resolve(Response.redirect(url, 302));
    },
    'GET'
);

function _updateTTL(cacheName, urls) {
    // this is needed for workbox to purge cache by ttl. purge behaviour is not part of w3c spec, but done by workbox.
    // cache.addall browser api will not update expiry ttls that workbox lib needs. So we add it here.
    console.log(`Service worker: Updating expiry for ${urls.length} urls in cache: ${cacheName}`);
    for(let url of urls){
        ExpirationManager[cacheName].updateTimestamp(url);
    }
}

function _getCurrentCacheManifest() {
    return new Promise((resolve)=>{
        fs.readFile(CACHE_FS_PATH, "utf8", function (err, data) {
            if (err) {
                resolve(null);
            } else {
                resolve(JSON.parse(data));
            }
        });
    });
}
function _putCurrentCacheManifest(manifestObject) {
    return new Promise((resolve)=>{
        fs.writeFile(CACHE_FS_PATH, JSON.stringify(manifestObject, null, 2), "UTF8", function (err) {
            if (err) {
                console.error("Service worker: Failed while writing cache manifest", err);
            }
            resolve(null);
        });
    });
}
function _getNewCacheManifest() {
    return new Promise((resolve) => {
        fetch(CACHE_MANIFEST_URL)
            .then((response) => response.json())
            .then((data) => resolve(data))
            .catch(err =>{
                console.error("Service worker: could not fetch cache manifest for app updates", err);
                resolve(null);
            });
    });
}

function _fixCache(currentCacheManifest, newCacheManifest) {
    const currentCacheKeys = Object.keys(currentCacheManifest);
    const newCacheKeys = Object.keys(newCacheManifest);
    console.log(`Service worker: Fixing Stale Cache Entries in ${CACHE_NAME_EVERYTHING}. num cache entries in manifest:
    current: ${currentCacheKeys.length} new: ${newCacheKeys.length}`);
    return new Promise((resolve, reject) => {
        caches.open(CACHE_NAME_EVERYTHING).then((cache) => {
            cache.keys().then(async (keys) => {
                console.log("Service worker: Number of cached entries in everything cache: ", keys.length);
                let changedContentURLs = [], deletePromises = [];
                keys.forEach((request, _index, _array) => {
                    let relativeURL = _removeParams(request.url);
                    relativeURL = relativeURL.substring(baseURL.length, relativeURL.length);
                    if(!newCacheManifest[relativeURL]){
                        _debugCacheLog("Service worker: entry renewed as deleted", relativeURL);
                        deletePromises.push(cache.delete(request));
                        return;
                    }
                    if(currentCacheManifest[relativeURL] !== newCacheManifest[relativeURL]){
                        _debugCacheLog("Service worker: entry renewed as changed", relativeURL);
                        deletePromises.push(cache.delete(request));
                        changedContentURLs.push(request.url);
                    }
                });
                console.log(`Service worker: deleting ${deletePromises.length} stale cache entries in ${CACHE_NAME_EVERYTHING}`);
                await Promise.all(deletePromises);
                console.log(`Service worker: updating cache for ${changedContentURLs.length} in ${CACHE_NAME_EVERYTHING}`);
                cache.addAll(changedContentURLs).then(()=>{
                    console.log(`Service worker: cache refresh complete for ${changedContentURLs.length} URLS in ${CACHE_NAME_EVERYTHING}`);
                    _updateTTL(CACHE_NAME_EVERYTHING, changedContentURLs);
                    resolve(changedContentURLs.length);
                }).catch(err=>{
                    console.error(`Service worker: cache refresh failed for ${changedContentURLs.length} URLS in ${CACHE_NAME_EVERYTHING}`, err);
                    reject();
                });
            });
        }).catch(reject);
    });
}

let refreshInProgress = false;
async function _refreshCache(event) {
    if(refreshInProgress){
        console.log("Another cache refresh is in progress, ignoring.");
        return;
    }
    refreshInProgress = true;
    try{
        console.log("Service worker: Refreshing browser cache for app updates.");
        const currentCacheManifest = await _getCurrentCacheManifest();
        const newCacheManifest = await _getNewCacheManifest();
        if(!newCacheManifest){
            console.log("Service worker: could not fetch new cache manifest. Cache refresh will not be done.");
            refreshInProgress = false;
            return;
        }
        if(!currentCacheManifest && newCacheManifest){
            console.log(`Service worker: Fresh install, writing cache manifest with ${Object.keys(newCacheManifest).length} entries`);
            await _putCurrentCacheManifest(newCacheManifest);
            refreshInProgress = false;
            return;
        }
        const updatedFilesCount = await _fixCache(currentCacheManifest, newCacheManifest);
        await _putCurrentCacheManifest(newCacheManifest);
        event.ports[0].postMessage({updatedFilesCount});
    } catch (e) {
        console.error("Service worker: error while refreshing cache", e);
    }
    refreshInProgress = false;
}

addEventListener('message', (event) => {
    // NB: Do not expect anything to persist in the service worker variables, the service worker may be reset at
    // any time by the browser if it is not in use, and only load it when required. This means that if there is a
    // long inactivity in the page, even if the tab is opened, the service worker will be unloaded by chrome. Then will
    // be re-enabled when needed. Hens some of our stored variables transferred from browser tabs was being erased
    // leading to live preview failures before. Use indexDB persistent storage only inside worker is you want to keep
    // track of data transferred from the main browser tabs, never hold it in variables here!
    let eventType = event.data && event.data.type;
    switch (eventType) {
        case 'SKIP_WAITING': self.skipWaiting(); break;
        case 'INIT_PHOENIX_CONFIG':
            Config.debug = event.data.debugMode;
            self._debugSWLivePreviewLogs = event.data.logLivePreview;
            self.__WB_DISABLE_DEV_LOGS = Config.debug && _debugSWCacheLogs;
            event.ports[0].postMessage({baseURL}); break;
        case 'REFRESH_CACHE': _refreshCache(event); break;
        case 'setInstrumentedURLs': self.Serve.setInstrumentedURLs(event); return true;
        default:
            let msgProcessed = self.Serve && self.Serve.processVirtualServerMessage &&
                self.Serve.processVirtualServerMessage(event);
            if(!msgProcessed){
                console.error("Service worker cannot process, received unknown message: ", event);
            }
    }
});

function _isCacheableExternalUrl(url) {
    let EXTERNAL_URLS = [
        'https://storage.googleapis.com/workbox-cdn/'
    ];
    for(let start of EXTERNAL_URLS){
        if(url.startsWith(start)){
            return true;
        }
    }
    return false;
}

// queue cache update

const DONT_CACHE_BASE_URLS = [
    `${location.origin}/src/`, `${location.origin}/test/`, `${location.origin}/dist/`, // https://phcode.dev/src or other
    // https://phcode.dev/subfolder/src/ or other when phoenix is loaded from https://phcode.dev/subfolder/index.html
    `${baseURL}src/`, `${baseURL}test/`, `${baseURL}dist/`, `${baseURL}cacheManifest.json`];
function _isNotCacheableUrl(url) {
    for(let start of DONT_CACHE_BASE_URLS){
        if(url.startsWith(start)){
            return true;
        }
    }
    return false;
}

// we always try to load main worker scripts and index html from core scripts cache which uses stale while revalidate
// to get aggressive updates.
const CORE_SCRIPTS_URLS = [`${location.origin}/index.html`, `${location.origin}/`, // https://phcode.dev/src or other
    `${location.origin}/virtual-server-main.js`, `${location.origin}/phoenix/virtual-server-loader.js`,
    // https://phcode.dev/subfolder/src/ or other when phoenix is loaded from https://phcode.dev/subfolder/index.html
    `${baseURL}index.html`, `${baseURL}`,
    `${baseURL}virtual-server-main.js`, `${baseURL}phoenix/virtual-server-loader.js`];
function _isCoreScript(url) {
    for(let coreScript of CORE_SCRIPTS_URLS){
        if(url === coreScript){
            return true;
        }
    }
    return false;
}

function _belongsToEverythingCache(request) {
    // now do url checks, Remove # ,http://localhost:9000/dist/styles/images/sprites.svg#leftArrowDisabled.
    // we cache entries with query string parameters in static pages with base url starting with phoenix base
    let href = request.url.split("#")[0];
    if(request.destination === 'video' || request.destination === 'audio'){
        _debugCacheLog("Not Caching audio/video URL: ", request);
        return false;
    }
    if(_isNotCacheableUrl(href)){
        _debugCacheLog("Not Caching un cacheable URL in everything cache: ", request);
        return false;
    }
    if(_isCoreScript(href)){
        _debugCacheLog("Not Caching core scripts in everything cache: ", request);
        return false;
    }
    if(_isCacheableExternalUrl(href)){
        _debugCacheLog("Not Caching external url in everything cache: ", request);
        return false;
    }
    let disAllowedExtensions =  /.zip$|.map$/i;
    if(href.startsWith(baseURL) && !disAllowedExtensions.test(href)) {
        return true;
    }
    _debugCacheLog("Not Caching URL: ", request);
    return false;
}

// handle all document
const allCachedRoutes = new Route(({ request }) => {
    return (request.method === 'GET'
        && _belongsToEverythingCache(request) && !_isVirtualServing(request.url));
}, new cacheFirst({
    cacheName: CACHE_NAME_EVERYTHING,
    plugins: [
        new ExpirationPlugin({
            maxAgeSeconds: DAYS_30_IN_SEC,
            purgeOnQuotaError: true
        })
    ]
}));

// core scripts route
const freshnessPreferredRoutes = new Route(({ request }) => {
    return request.method === 'GET' && _isCoreScript(request.url) && !_isVirtualServing(request.url);
}, new StaleWhileRevalidate({
    cacheName: CACHE_NAME_CORE_SCRIPTS,
    plugins: [
        new ExpirationPlugin({
            maxAgeSeconds: DAYS_30_IN_SEC,
            purgeOnQuotaError: true
        })
    ]
}));

// scripts with a different origin like third party libs
const externalCachedRoutes = new Route(({ request }) => {
    return request.method === 'GET' && _isCacheableExternalUrl(request.url) && !_isVirtualServing(request.url);
}, new StaleWhileRevalidate({
    cacheName: CACHE_NAME_EXTERNAL,
    plugins: [
        new ExpirationPlugin({
            maxAgeSeconds: DAYS_30_IN_SEC,
            purgeOnQuotaError: true
        })
    ]
}));

workbox.routing.registerRoute(allCachedRoutes);
workbox.routing.registerRoute(freshnessPreferredRoutes);
workbox.routing.registerRoute(externalCachedRoutes);

workbox.core.clientsClaim();
