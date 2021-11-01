/*
 * GNU AGPL-3.0 License
 *
 * Modified work Copyright (c) 2021 - present Core.ai
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

    const wb = new Workbox(`nohost-sw.js?route=${getRoute()}`);
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
    navigator.serviceWorker.register("service-worker.js");
    initPWA();
}


let deferredPrompt;
function initPWA () {

    window.addEventListener('beforeinstallprompt', (e) => {
        // Prevent the mini-infobar from appearing on mobile
        e.preventDefault();
        // Stash the event so it can be triggered later.
        deferredPrompt = e;
        // Update UI notify the user they can install the PWA
        showInstallPromotion();
        // Optionally, send analytics event that PWA install promo was shown.
        console.log(`'beforeinstallprompt' event was fired.`);
    });
}

const btn = window.document.createElement("button");

function showInstallPromotion() {
    btn.innerHTML = "Install App";
    btn.type = "submit";
    btn.name = "installBtn";
    btn.style.position = 'fixed';
    btn.style.bottom = '20px';
    btn.style.right = '100px';
    btn.style.padding = '10px';
    btn.style.background = 'whitesmoke';
    btn.style.boxShadow = '0 0 11px rgb(33 33 33 / 20%)';
    btn.addEventListener('click', async () => {
        // Hide the app provided install promotion
        hideInstallPromotion();
        // Show the install prompt
        deferredPrompt.prompt();
        // Wait for the user to respond to the prompt
        const { outcome } = await deferredPrompt.userChoice;
        // Optionally, send analytics event with outcome of user choice
        console.log(`User response to the install prompt: ${outcome}`);
        // We've used the prompt, and can't use it again, throw it away
        deferredPrompt = null;
    });
    setTimeout(() => {window.document.body.appendChild(btn);}, 2000);
}

function hideInstallPromotion() {
    window.document.body.removeChild(btn);
}
