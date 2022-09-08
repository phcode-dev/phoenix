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

/* global workbox, importScripts, Serve, JSONFormatter, HtmlFormatter, Config*/
importScripts('phoenix/virtualfs.js');
importScripts('phoenix/virtualServer/mime-types.js');
importScripts('phoenix/virtualServer/config.js');
importScripts('phoenix/virtualServer/content-type.js');
importScripts('phoenix/virtualServer/webserver.js');
importScripts('phoenix/virtualServer/json-formatter.js');
importScripts('phoenix/virtualServer/html-formatter.js');
importScripts('https://storage.googleapis.com/workbox-cdn/releases/6.4.1/workbox-sw.js');

const VIRTUAL_SERVER_URLS = [];

const _debugSWCacheLogs = false; // change debug to true to see more logs

workbox.setConfig({debug: _debugSWCacheLogs && Config.debug});

const Route = workbox.routing.Route;
// other strategies include CacheFirst, NetworkFirst Etc..
const cacheFirst = workbox.strategies.CacheFirst;
const StaleWhileRevalidate = workbox.strategies.StaleWhileRevalidate;
const ExpirationPlugin = workbox.expiration.ExpirationPlugin;
const CacheExpiration = workbox.expiration.CacheExpiration;
const DAYS_30_IN_SEC = 60 * 60 * 24 * 30;
const CACHE_REFRESH_SCHEDULE_TIME = 10 * 1000;
const CACHE_NAME_EVERYTHING = "everything";
const CACHE_NAME_CORE_SCRIPTS = "coreScripts";
const ExpirationManager ={
    "everything": new CacheExpiration(CACHE_NAME_EVERYTHING, {
            maxAgeSeconds: DAYS_30_IN_SEC
        }),
    "coreScripts": new CacheExpiration(CACHE_NAME_CORE_SCRIPTS, {
            maxAgeSeconds: DAYS_30_IN_SEC
        })
};

let recentlyAccessedURLS = {};

function _debugCacheLog(...args) {
    if(_debugSWCacheLogs){
        console.log(...args);
    }
}

// service worker controlling route base url. This will be something like https://phcode.dev/ or http://localhost:8000/
let baseURL = location.href;
if(location.href.indexOf( "?")>-1){
    baseURL = location.href.substring( 0, location.href.indexOf( "?")); // remove query string params
}
if(location.href.indexOf( "#")>-1){
    baseURL = baseURL.substring( 0, baseURL.indexOf( "#")); // remove hrefs in page
}
if(location.href.indexOf( "/")>-1){
    baseURL = baseURL.substring( 0, baseURL.lastIndexOf( "/"));
}
console.log("Service worker: base URL is: ", baseURL);

// this is the base url where our file system virtual server lives. http://phcode.dev/phoenix/vfs in phoenix or
// http://localhost:8000/phoenix/vfs in dev builds
const virtualServerBaseURL = `${baseURL}${Config.route}`;
console.log("Service worker: Virtual server base URL is: ", virtualServerBaseURL);

// Cache base URL is different from baseURL. Phoenix only cache pages routed at the origin https://Something.x.y/ .
// If we try to load phoenix from another url, say https://Something.x.y/dev/phoenix.html, That will never have its own
// cache and rely on the top level service worker to cache. For Eg, any of the sub urls
// that also hosts development versions of phoenix like phcode.dev/src/index.html will not recursively end up in cache.
const cacheBaseURL = `${location.origin}`;
console.log("service worker: cache base URL:", cacheBaseURL);

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

        // Allow passing `?json` on URL to get back JSON vs. raw response
        const formatter =
            url.searchParams.get('json') !== null
                ? JSONFormatter
                : HtmlFormatter;

        const download = false;
        // commented Allow passing `?download` or `dl` to have the file downloaded vs. displayed
        // url.searchParams.get('download') !== null ||
        // url.searchParams.get('dl') !== null;

        return Serve.serve(path, formatter, download);
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

// cache and offline access route
function _clearCache() {
    caches.open(CACHE_NAME_EVERYTHING).then((cache) => {
        cache.keys().then((keys) => {
            keys.forEach((request, index, array) => {
                cache.delete(request);
            });
        });
    });
}

async function _updateTTL(cacheName, urls) {
    // this is needed for workbox to purge cache by ttl. purge behaviour is not part of w3c spec, but done by workbox.
    // cache.addall browser api will not update expiry ttls that workbox lib needs. So we add it here.
    console.log(`Service worker: Updating expiry for ${urls.length} urls in cache: ${cacheName}`);
    for(let url of urls){
        ExpirationManager[cacheName].updateTimestamp(url);
    }
}

function _refreshCacheNow(cacheName) {
    console.log("Service worker: Refreshing cache: ", cacheName);
    caches.open(cacheName).then((cache) => {
        cache.keys().then((keys) => {
            let cacheURLS = [];
            keys.forEach((request, index, array) => {
                cacheURLS.push(request.url);
            });
            console.log(`Service worker: Filtering caching from ${cacheURLS.length} URLS in ${cacheName}`);
            cacheURLS = cacheURLS.filter(url => recentlyAccessedURLS[url] === true);
            recentlyAccessedURLS = {};
            console.log(`Service worker: scheduling cache update for ${cacheURLS.length} filtered URLS in ${cacheName}`);
            cache.addAll(cacheURLS).then(()=>{
                console.log(`Service worker: cache refresh complete for ${cacheURLS.length} URLS in ${cacheName}`);
                _updateTTL(cacheName, cacheURLS);
            }).catch(err=>{
                console.error(`Service worker: cache refresh failed for ${cacheURLS.length} URLS in ${cacheName}`, err);
            });
        });
    });
}

function _refreshCache(event) {
    console.log("Service worker: Scheduling Refreshing cache in ms:", CACHE_REFRESH_SCHEDULE_TIME);
    setTimeout(()=>{
        _refreshCacheNow(CACHE_NAME_EVERYTHING);
    }, CACHE_REFRESH_SCHEDULE_TIME);
    event.ports[0].postMessage("cache refresh scheduled");
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
        case 'GET_SW_BASE_URL': event.ports[0].postMessage(cacheBaseURL); break;
        case 'CLEAR_CACHE': _clearCache(); break;
        case 'REFRESH_CACHE': _refreshCache(event); break;
        default: console.error("Service worker cannot process, received unknown message: ", event);
    }
});

function _isCacheableThirdPartyUrl(url) {
    let THIRD_PARTY_URLS = [
        'https://storage.googleapis.com/workbox-cdn/'
    ];
    for(let start of THIRD_PARTY_URLS){
        if(url.startsWith(start)){
            return true;
        }
    }
    return false;
}

const DONT_CACHE_BASE_URLS = [`${cacheBaseURL}/src/`, `${cacheBaseURL}/test/`, `${cacheBaseURL}/dist/`];
function _isNotCacheableUrl(url) {
    for(let start of DONT_CACHE_BASE_URLS){
        if(url.startsWith(start)){
            return true;
        }
    }
    return false;
}

// we always try to load main worker scripts and index html from core
const CORE_SCRIPTS_URLS = [`${cacheBaseURL}/index.html`, `${cacheBaseURL}/`,
    `${cacheBaseURL}/virtual-server-main.js`, `${cacheBaseURL}/phoenix/virtual-server-loader.js`];
function _isCoreScript(url) {
    for(let coreScript of CORE_SCRIPTS_URLS){
        if(url === coreScript){
            return true;
        }
    }
    return false;
}

function _shouldCache(request) {
    // now do url checks, Remove # ,http://localhost:9000/dist/styles/images/sprites.svg#leftArrowDisabled.
    // we cache entries with query string parameters in static pages with base url starting with phoenix base
    let href = request.url.split("#")[0];
    if(request.destination === 'video' || request.destination === 'audio'){
        _debugCacheLog("Not Caching audio/video URL: ", request);
        return false;
    }
    if(_isNotCacheableUrl(href)){
        _debugCacheLog("Not Caching un cacheable URL: ", request);
        return false;
    }
    if(_isCoreScript(href)){
        _debugCacheLog("Not Caching core scripts: ", request);
        return false;
    }
    let disAllowedExtensions =  /.zip$|.map$/i;
    if(request.method === 'GET' && _isCacheableThirdPartyUrl(href)) {
        return true;
    }
    if(request.method === 'GET' && href.startsWith(cacheBaseURL) && !disAllowedExtensions.test(href)) {
        return true;
    }
    _debugCacheLog("Not Caching URL: ", request);
    return false;
}

// handle all document
const allCachedRoutes = new Route(({ request }) => {
    let shouldCache = _shouldCache(request) && !_isVirtualServing(request.url);
    if(shouldCache){
        recentlyAccessedURLS[request.url] = true;
    }
    return shouldCache;
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
    return _isCoreScript(request.url) && !_isVirtualServing(request.url);
}, new StaleWhileRevalidate({
    cacheName: CACHE_NAME_CORE_SCRIPTS,
    plugins: [
        new ExpirationPlugin({
            maxAgeSeconds: DAYS_30_IN_SEC,
            purgeOnQuotaError: true
        })
    ]
}));

workbox.routing.registerRoute(allCachedRoutes);
workbox.routing.registerRoute(freshnessPreferredRoutes);

workbox.core.clientsClaim();
