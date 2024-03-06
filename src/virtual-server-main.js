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

workbox.setConfig({debug: _debugSWCacheLogs});

const Route = workbox.routing.Route;
// other strategies include CacheFirst, NetworkFirst Etc..
const cacheFirst = workbox.strategies.CacheFirst;
const StaleWhileRevalidate = workbox.strategies.StaleWhileRevalidate;
const ExpirationPlugin = workbox.expiration.ExpirationPlugin;
const DAYS_30_IN_SEC = 60 * 60 * 24 * 30;
const CACHE_NAME_EVERYTHING = "everythingV2"; // this is used in index.html as well, if changing the cache name.
const CACHE_NAME_CORE_SCRIPTS = "coreScripts";
const CACHE_NAME_EXTERNAL = "external";
const WEB_CACHE_FILE_PATH = "/webCacheVersion.txt";

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
    `${location.origin}/cacheManifest.json`, `${location.origin}/web-cache/`,
    // https://phcode.dev/subfolder/src/ or other when phoenix is loaded from https://phcode.dev/subfolder/index.html
    `${baseURL}src/`, `${baseURL}test/`, `${baseURL}dist/`,
    `${baseURL}cacheManifest.json`, `${baseURL}web-cache/`,
];
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
    if(!href.startsWith(baseURL)){
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

// handle all document caches

/**
 * The everything cache holds as the name indicates, every web asset that is not external urls and core scripts.
 * Also excluded are vfs locations and `/web-cache` paths.
 * When phoenix is started afresh, the default cache CACHE_NAME_EVERYTHING is used. When phoenix is updated,
 * the latest cache name to use will be updated in WEB_CACHE_FILE_PATH file.
 */

let _everythingCache, _version, _everythingCacheName;
function _getLatestCacheName() {
    return new Promise(resolve=>{
        fs.readFile(WEB_CACHE_FILE_PATH, "utf8", (err, version)=>{
            if(err || !version){
                resolve(CACHE_NAME_EVERYTHING);
                return;
            }
            _version = version;
            resolve(version);
        });
    });
}

async function _updateEverythingCache() {
    const cacheToUse = await _getLatestCacheName();
    if(_everythingCacheName === cacheToUse && _everythingCache) {
        return _everythingCache;
    }
    console.log("Service Worker: Using cache", cacheToUse);
    _everythingCache = await caches.open(cacheToUse);
    _everythingCacheName = cacheToUse;
    return _everythingCache;
}

fs.watchAsync(WEB_CACHE_FILE_PATH)
    .then(watcher=>{
        watcher.on(fs.WATCH_EVENTS.ADD_FILE, _updateEverythingCache);
        watcher.on(fs.WATCH_EVENTS.CHANGE, _updateEverythingCache);
    }).catch(console.error);

async function _getEverythingCache() {
    if(_everythingCache){
        return _everythingCache;
    }
    return await _updateEverythingCache();
}
const everythingCacheHandler = async ({request, event}) => {
    let cache = await _getEverythingCache();
    let cachedResponse = await cache.match(new URL(request.url));

    if (cachedResponse) {
        return cachedResponse;
    }

    const versionedBase = `${baseURL}web-cache/${_version}`;
    _debugCacheLog("cache miss, fetching", request.url, "versioned base is", versionedBase);

    // Modify request URL if it matches the updated version
    let versionedURL = request.url;
    // if the url we got starts with versionedBase, then it means that if from a fetch request from this handler
    // itself during a cache miss, in which case, we should service the request without redirecting again
    let shouldCache = false;
    if (_version && !versionedURL.startsWith(versionedBase) && versionedURL.startsWith(baseURL)) {
        shouldCache = true;
        versionedURL = versionedURL.replace(baseURL, `${baseURL}web-cache/${_version}/`);
    }

    // Fetch the updated URL
    let fetchResponse = await fetch(versionedURL, {method: 'GET'});
    if(fetchResponse.ok && shouldCache){
        const responseToCache = fetchResponse.clone();
        // Cache the response under the original request URL
        const responseBlob = await responseToCache.blob();
        const newResponse = new Response(responseBlob, {
            status: responseToCache.status,
            statusText: responseToCache.statusText,
            headers: responseToCache.headers
        });
        event.waitUntil(cache.put(new URL(request.url), newResponse));
    } else if(!fetchResponse.ok){
        fetchResponse = await fetch(request.url, {method: 'GET'});
        // we don't cache this as CDN might not deliver build consistency without version.
    }

    return fetchResponse;
};

const allCachedRoutes = new Route(({ request }) => {
    return (request.method === 'GET'
        && _belongsToEverythingCache(request) && !_isVirtualServing(request.url));
}, everythingCacheHandler);

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
