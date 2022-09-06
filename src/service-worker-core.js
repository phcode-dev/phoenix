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


/* global workbox, Config, VIRTUAL_SERVER_URLS*/
importScripts('https://storage.googleapis.com/workbox-cdn/releases/6.4.1/workbox-sw.js');
const _debugSWCacheLogs = false; // change debug to true to see more logs

workbox.setConfig({debug: _debugSWCacheLogs && Config.debug});

const cacheBaseURL = `${location.origin}`;
const Route = workbox.routing.Route;
// other strategies include CacheFirst, NetworkFirst Etc..
const StaleWhileRevalidate = workbox.strategies.StaleWhileRevalidate;
const ExpirationPlugin = workbox.expiration.ExpirationPlugin;
const DAYS_30_IN_SEC = 60 * 60 * 24 * 30;
const CACHE_NAME_EVERYTHING = "everything";

function _debugCacheLog(...args) {
    if(_debugSWCacheLogs){
        console.log(...args);
    }
}

function _clearCache() {
    caches.open(CACHE_NAME_EVERYTHING).then((cache) => {
        cache.keys().then((keys) => {
            keys.forEach((request, index, array) => {
                cache.delete(request);
            });
        });
    });
}

const DONT_CACHE_BASE_URLS = [`${cacheBaseURL}/src/`, `${cacheBaseURL}/test/`, `${cacheBaseURL}/dist/`];

function _registerVirtualServerURL(event) {
    let fsServerUrl = event.data.fsServerUrl;
    console.log("service worker: adding virtual web server service worker: ", fsServerUrl);
    if(!DONT_CACHE_BASE_URLS.includes(fsServerUrl)) {
        DONT_CACHE_BASE_URLS.push(fsServerUrl);
    }
    if(!VIRTUAL_SERVER_URLS.includes(fsServerUrl)) {
        VIRTUAL_SERVER_URLS.push(fsServerUrl);
    }
    event.ports[0].postMessage(fsServerUrl);
    console.log("service worker: dont cache urls updates: ", DONT_CACHE_BASE_URLS);
}

addEventListener('message', (event) => {
    let eventType = event.data && event.data.type;
    switch (eventType) {
    case 'SKIP_WAITING': self.skipWaiting(); break;
    case 'GET_SW_BASE_URL': event.ports[0].postMessage(cacheBaseURL); break;
    case 'CLEAR_CACHE': _clearCache(); break;
    case 'REGISTER_FS_SERVER_URL': _registerVirtualServerURL(event); break;
    default: console.error("Service worker cannot process, received unknown message: ", event);
    }
});

console.log("service worker base URL:", cacheBaseURL);

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

function _isNotCacheableUrl(url) {
    for(let start of DONT_CACHE_BASE_URLS){
        if(url.startsWith(start)){
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
    return _shouldCache(request);
}, new StaleWhileRevalidate({
    cacheName: CACHE_NAME_EVERYTHING,
    plugins: [
        new ExpirationPlugin({
            maxAgeSeconds: DAYS_30_IN_SEC
        })
    ]
}));

workbox.routing.registerRoute(allCachedRoutes);
