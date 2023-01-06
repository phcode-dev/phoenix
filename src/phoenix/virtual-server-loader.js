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
/*eslint no-console: 0*/
/*global logger*/
/*eslint strict: ["error", "global"]*/


/** Sets up a web server for the local phoenix virtual file system root.
 * Based on https://github.com/humphd/nohost
 *
 * This module should be functionally as light weight as possible with minimal deps as it is a shell component.
 *
 * This file is always loaded fresh from network if available bypassing cache to help better resilience
 * against stale caches in service worker. So you can assume that this file will get loaded in its most recent
 * form despite the cache state in the browser.
 * **/


import {Workbox} from 'https://storage.googleapis.com/workbox-cdn/releases/6.4.1/workbox-window.prod.mjs';

function _getBaseURL() {
    let baseURL = window.location.href;
    if(location.href.indexOf( "?")>-1){
        baseURL = location.href.substring( 0, location.href.indexOf( "?")); // remove query string params
    }
    if(location.href.indexOf( "#")>-1){
        baseURL = baseURL.substring( 0, baseURL.indexOf( "#")); // remove hrefs in page
    }
    if(location.href.indexOf( "/")>-1){
        baseURL = baseURL.substring( 0, baseURL.lastIndexOf( "/"));
    }
    if(!baseURL.endsWith('/')){
        baseURL = baseURL + '/';
    }
    return baseURL;
}

function getRoute(){
    return `phoenix/vfs`;
}

window.fsServerUrl = _getBaseURL() + getRoute() + "/";

function _isServiceWorkerLoaderPage() {
    // only http(s)://x.y.z/ or http(s)://x.y.z/index.html can load service worker, or localhost/src for dev builds
    const indexUrl = `${location.origin}/index.html`,
        baseUrl = `${location.origin}/`,
        devURL = 'http://localhost:8000/src/',
        currentURL = _getBaseURL();
    console.log("currentURL", currentURL, indexUrl, baseUrl, devURL);
    return (currentURL === baseUrl || currentURL === indexUrl || currentURL === devURL);
}

async function shouldUpdate() {
    // service workers are always updated in phoenix instantly.
    return true;
}

/**
 * Register Phoenix PWA and nohost web server service worker, passing `route` or other options.
 */
if (_isServiceWorkerLoaderPage() && 'serviceWorker' in navigator) {
    logger.leaveTrail("Service worker loader: Loading  from page..." + window.location.href);
    // We cannot realistically change the url of the service worker without causing major problems in service worker
    // load. We will have to unregister and load a new service worker and there is no way to stop the already running
    // service worker. As such, the below debug=false is unused, but kept there for legacy purposes to not change
    // sw url without bombing the installation base.
    // debug=false below is unused and kept for the above reason!!!!!
    const wb = new Workbox(`virtual-server-main.js?debug=false&route=${getRoute()}`, {
        // https://developer.chrome.com/blog/fresher-sw/#updateviacache
        updateViaCache: 'none'
    });

    let isServerReady = false;

    window.Phoenix.cache = {};

    // refreshServiceWorkerCache should be done after app load to prevent mixed js script content load. Ie,
    // if we do the cache reset now, some scripts loaded may be from cache and some from the new version.
    window.refreshServiceWorkerCache = function (doneCB) {
        if(!isServerReady){
            setTimeout(()=>{
                window.refreshServiceWorkerCache(doneCB);
            }, 100);
            return;
        }
        logger.leaveTrail(`Service worker loader: triggering REFRESH_CACHE`);
        wb.messageSW({
            type: 'REFRESH_CACHE'
        }).then(({updatedFilesCount})=>{
            logger.leaveTrail(`Service worker loader: refresh cache updatedFilesCount: `+ updatedFilesCount);
            window.Phoenix.cache.updatePendingReloadReason = "refreshCache";
            window.Phoenix.cache.updatedFilesCount = updatedFilesCount || 0;
            if(doneCB) {
                doneCB();
            }
        }).catch(err=>{
            console.error("Service worker loader: Error while triggering refresh cache", err);
            if(doneCB) {
                doneCB("REFRESH_CACHE Error");
            }
        });
    };

    // Hoist service worker comm to window for everyone be able to communicate with the sw.
    window.messageSW = function (params) {
        return wb.messageSW(params);
    };

    function serverReady() {
        console.log('Service worker loader: Server ready.');
        isServerReady = true;
        wb.messageSW({
            type: 'INIT_PHOENIX_CONFIG',
            debugMode: window.logger.logToConsolePref === 'true',
            logLivePreview: window.logger.loggingOptions.logLivePreview
        }).then((config)=>{
            logger.leaveTrail(
                `Service worker loader: Server ready! Service worker inited at base url: ${config.baseURL}`);
        }).catch(err=>{
            console.error("Service worker loader: Error while init of service worker", err);
        });
    }

    function serverInstall() {
        logger.leaveTrail('Service worker loader: Web server Worker installed.');
    }

    const showSkipWaitingPrompt = async (event) => {
        // Assuming the user accepted the update, set up a listener
        // that will reload the page as soon as the previously waiting
        // service worker has taken control.

        // When `event.wasWaitingBeforeRegister` is true, a previously
        // updated service worker is still waiting.
        // You may want to customize the UI prompt accordingly.

        // This code assumes your app has a promptForUpdate() method,
        // which returns true if the user wants to update.
        // Implementing this is app-specific; some examples are:
        // https://open-ui.org/components/alert.research or
        // https://open-ui.org/components/toast.research
        const updateAccepted = await shouldUpdate();

        if (updateAccepted) {
            wb.messageSkipWaiting();
        }
    };

    // Add an event listener to detect when the registered
    // service worker has installed but is waiting to activate.
    wb.addEventListener('waiting', (event) => {
        logger.leaveTrail("Service worker loader: A new service worker is pending load. Trying to update worker now.");
        window.Phoenix.cache.updatePendingReloadReason = "skipWait";
        showSkipWaitingPrompt(event);
    });

    wb.controlling.then(serverReady);

    // Deal with first-run install, if necessary
    wb.addEventListener('installed', (event) => {
        if(!event.isUpdate) {
            serverInstall();
        }
    });

    wb.register();
}
