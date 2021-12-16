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
/*global navigator*/
/*eslint no-console: 0*/
/*eslint strict: ["error", "global"]*/


/** Sets up a web server for the local phoenix virtual file system root.
 * Based on https://github.com/humphd/nohost
 *
 * This module should be functionally as light weight as possible with minimal deps as it is a shell component.
 * **/


import { Workbox } from 'https://storage.googleapis.com/workbox-cdn/releases/4.0.0/workbox-window.prod.mjs';

function getRoute(){
    const pathName = window.location.pathname;
    const basePath = pathName.substring(0, pathName.lastIndexOf("/"));
    return `${basePath}/phoenix/vfs`;
}

window.fsServerUrl = window.location.origin + getRoute();

function serverReady() {
    console.log(`Server ready! Serving files on url: ${window.location.origin + getRoute()}`);
}

function serverInstall() {
    console.log('Web server Worker installed.');
}

/**
 * Register the nohost service worker, passing `route` or other options.
 */
if ('serviceWorker' in navigator) {
    console.log(window.location.href);

    const wb = new Workbox(`virtual-server-main.js?route=${getRoute()}`);
    // for debug, use this URL`nohost-sw.js?debug&route=${basePath}/phoenix/vfs`

    // Wait on the server to be fully ready to handle routing requests
    wb.controlling.then(serverReady);

    // Deal with first-run install, if necessary
    wb.addEventListener('installed', (event) => {
        if(!event.isUpdate) {
            serverInstall();
        }
    });

    wb.register();
}

