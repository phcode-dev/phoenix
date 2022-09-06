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
/*eslint strict: ["error", "global"]*/


/** Sets up a web server for the local phoenix virtual file system root.
 * Based on https://github.com/humphd/nohost
 *
 * This module should be functionally as light weight as possible with minimal deps as it is a shell component.
 * **/


import {Workbox} from 'https://storage.googleapis.com/workbox-cdn/releases/6.4.1/workbox-window.prod.mjs';

function getRoute(){
    const pathName = window.location.pathname;
    const basePath = pathName.substring(0, pathName.lastIndexOf("/"));
    return `${basePath}/phoenix/vfs`;
}

window.fsServerUrl = window.location.origin + getRoute();

function _isServiceWorkerLoaderPage() {
    // only http(s)://x.y.z/ or http(s)://x.y.z/index.html can load service worker, or localhost/src for dev builds
    let indexUrl = `${location.origin}/index.html`,
        baseUrl = `${location.origin}/`,
        devURL = 'http://localhost:8000/src/';
    return (location.href === baseUrl || location.href === indexUrl || location.href === devURL);
}

async function shouldUpdate() {
    // service workers are always updated in phoenix instantly.
    return true;
}

/**
 * Register Phoenix PWA and nohost web server service worker, passing `route` or other options.
 */
if (_isServiceWorkerLoaderPage() && 'serviceWorker' in navigator) {
    console.log("Service worker loader: Loading  from page...", window.location.href);
    const wb = new Workbox(`virtual-server-main.js?debug=${window.logToConsolePref === 'true'}&route=${getRoute()}`);

    function serverReady() {
        console.log(`Service worker loader: Registering virtual web server on url: ${window.fsServerUrl}`);
        wb.messageSW({
            type: 'REGISTER_FS_SERVER_URL',
            fsServerUrl: window.fsServerUrl
        }).then((fsServerUrl)=>{
            console.log(`Service worker loader: Server ready! Serving files on url: ${fsServerUrl}`);
        }).catch(err=>{
            console.error("Service worker loader: Error while registering virtual server with service worker", err);
        });
    }

    function serverInstall() {
        console.log('Service worker loader: Web server Worker installed.');
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
        console.log("Service worker loader: A new service worker is pending load. Trying to update the worker now.");
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
