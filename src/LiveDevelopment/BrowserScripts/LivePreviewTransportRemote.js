/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 * Original work Copyright (c) 2014 - 2021 Adobe Systems Incorporated. All rights reserved.
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

// This is a transport injected into the browser via a script that handles the low
// level communication between the live development protocol handlers on both sides.
// The actual communication to phoenix is done via the loaded web worker below. We just post/receive all
// messages that should be sent/received by live preview to the worker. The worker will use broadcast
// channels in browser and web sockets in desktop builds to rely on the message to phoenix.
/**
 * Communication Architecture in PHCode.dev Browser Environment
 * ------------------------------------------------------------
 *
 * First of all I like to apologize for this complexity, it is how it is due to the browser standards security
 * policy, intelligent tracking prevention in browsers and the inherent multiprocess communication problem.
 * The dining philosophers can however take rest as the mechanism is fully lockless thanks to how js handles events.
 *
 * Overview:
 * PHCode.dev operates with a multi-iframe setup to facilitate communication between different components
 * within the same domain(phcode.dev) and cross domain(phcode.dev<>phcode.live). Live previews have to be domain
 * isolated to phcode.live domain so that malicious project live previews doesn't steal phcode.dev cookies and
 * take control of the users account by just opening a live preview.
 * This setup includes a preview page(phcode.dev/live-preview-loader.html), a server iframe (phcode.live), and an actual
 * preview iframe where the user's code is rendered(phcode.live/user/projoject/live/preview.html).
 *
 * Components:
 * 1. Preview Page (phcode.dev):
 *    - Serves as the primary interface for the user. The actual tab.
 *    - Hosts two iframes: the server iframe and the actual preview iframe.
 *
 * 2. Server Iframe (phcode.live):
 *    - Responsible for installing a service worker for virtual server, sandboxed to its specific tab.
 *    - Acts as an intermediary in the communication chain.
 *
 * 3. Actual Preview Iframe: (phcode.live/user/projoject/live/preview.html)
 *    - Renders the user's code.
 *    - Utilizes a broadcast channel within the web worker to send messages. We use a web worker so
 *      that live preview tab hearbeat messages are sent to the editor even if the user is debugging
 *      the page causing js execution to halt in the debugging thread but not the worker thread.
 *
 * Communication Flow:
 * 1. Messages originate from the Actual Preview Iframe, where the user's script is loaded.
 * 2. These messages are sent to the Live Preview Server Iframe via a broadcast channel in the service worker.
 * 3. The Server Iframe then relays these messages to the parent PHCode.dev frame.
 * 4. Finally, the PHCode.dev frame forwards these messages to the PHCode.dev editor page.
 *    - This step occurs if the editor page is loaded in a different tab and not as an in-editor live preview panel.
 *
 * Note on Communication Constraints and Solutions:
 * ------------------------------------------------
 *  Cross-Domain Communication Limitations:
 *  - The default security model of web browsers restricts cross-domain communication as a measure to preserve security.
 *  - This means that iframes from different domains cannot freely communicate with each other due to
 *    browser-enforced sandboxing.
 *
 *  Use of Broadcast Channels within the Same Domain:
 *  - To circumvent these cross-domain communication restrictions, PHCode.dev employs broadcast channels within
 *    the same domain.
 *
 *  Solution for Cross-Domain Communication:
 *  - The architecture is designed to avoid direct cross-domain communication, which is restricted by
 *    the browser's security model.
 *  - Instead, a 'hoola hoop' method is used where the server Iframe (phcode.live) relays broadcast channel
 *    messages in phcode.live to its cross domain parent window phcode.dev through window post message apis.
 *  - The parent PHCode.dev frame further communicates with the PHCode.dev editor page, if its in a different tab.
 *
 *  Working within Browser Security Framework:
 *  - This approach allows the system to operate within the browser's security constraints.
 *  - It eliminates the need for server-side assistance, thus enabling instant live preview
 *    feedback in a purely client-side setting.
 **/


(function (global) {

    // The below line will be replaced with the transport scripts provided by the static server at
    // LivePreviewTransport.js:getRemoteScript() This is so that the actual live preview page doesnt get hold of
    // any phoenix web socket or broadcast channel ids from this closure programatically for security.

    //Replace dynamic section start
    const TRANSPORT_CONFIG={};
    //Replace dynamic section end

    function _debugLog(...args) {
        if(window.LIVE_PREVIEW_DEBUG_ENABLED) {
            console.log(...args);
        }
    }

    const clientID = "" + Math.round( Math.random()*1000000000);

    const worker = new Worker(TRANSPORT_CONFIG.LIVE_DEV_REMOTE_WORKER_SCRIPTS_FILE_NAME);
    let _workerMessageProcessor;
    worker.onmessage = (event) => {
        const type = event.data.type;
        switch (type) {
        case 'REDIRECT_PAGE': location.href = event.data.URL; break;
        default:
            if(_workerMessageProcessor){
                return _workerMessageProcessor(event);
            }
            console.error("Live Preview page loader: received unknown message from worker:", event);
        }
    };
    // message channel to phoenix connect on load itself. The channel id is injected from phoenix
    // via LivePreviewTransport.js while serving the instrumented html file
    worker.postMessage({
        type: "setupPhoenixComm",
        livePreviewDebugModeEnabled: TRANSPORT_CONFIG.LIVE_PREVIEW_DEBUG_ENABLED,
        broadcastChannel: TRANSPORT_CONFIG.LIVE_PREVIEW_BROADCAST_CHANNEL_ID, // in browser this will be present, but not in tauri
        websocketChannelURL: TRANSPORT_CONFIG.LIVE_PREVIEW_WEBSOCKET_CHANNEL_URL, // in tauri this will be present. not in browser
        clientID
    });
    function _postLivePreviewMessage(message) {
        worker.postMessage({type: "livePreview", message});
    }
    let sentTitle, sentFavIconURL;

    function convertImgToBase64(url, callback) {
        if(!url){
            callback(null);
            return;
        }
        let canvas = document.createElement('CANVAS');
        const ctx = canvas.getContext('2d');
        const img = new Image();
        img.crossOrigin = 'Anonymous';
        img.onload = function() {
            canvas.height = img.height;
            canvas.width = img.width;
            ctx.drawImage(img, 0, 0);
            const dataURL = canvas.toDataURL();
            callback(dataURL);
            canvas = null;
        };
        img.src = url;
    }

    setInterval(()=>{
        const favIcon = document.querySelector("link[rel~='icon']");
        const faviconUrl = favIcon && favIcon.href;
        if(sentFavIconURL !== faviconUrl){
            sentFavIconURL = faviconUrl;
            convertImgToBase64(faviconUrl, function(base64) {
                if(!base64){
                    base64 = "favicon.ico";
                }
                worker.postMessage({
                    type: "updateTitleIcon",
                    faviconBase64: base64
                });
            });
        }

        if(sentTitle!== document.title) {
            sentTitle = document.title;
            worker.postMessage({
                type: "updateTitleIcon",
                title: document.title
            });
        }
    }, 1000);

    global._Brackets_LiveDev_Transport = {
        _channelOpen: false,

        /**
         * @private
         * An object that contains callbacks to handle various transport events. See `setCallbacks()`.
         * @type {?{connect: ?function, message: ?function(string), close: ?function}}
         */
        _callbacks: null,

        /**
         * Sets the callbacks that should be called when various transport events occur. All callbacks
         * are optional, but you should at least implement "message" or nothing interesting will happen :)
         * @param {?{connect: ?function, message: ?function(string), close: ?function}} callbacks
         *      The callbacks to set.
         *      connect - called when a connection is established to Brackets
         *      message(msgStr) - called with a string message sent from Brackets
         *      close - called when Brackets closes the connection
         */
        setCallbacks: function (callbacks) {
            this._callbacks = callbacks;
        },

        /**
         * Connects to the LivePreviewTransport in Brackets.
         */
        connect: function () {
            const self = this;

            // Listen to the response
            _workerMessageProcessor = (event) => {
                // Print the result
                _debugLog("Live Preview: Browser received event from Phoenix: ", JSON.stringify(event.data));
                const type = event.data.type;
                switch (type) {
                case 'BROWSER_CONNECT': break; // do nothing. This is a loopback message from another live preview tab
                case 'BROWSER_MESSAGE': break; // do nothing. This is a loopback message from another live preview tab
                case 'BROWSER_CLOSE': break; // do nothing. This is a loopback message from another live preview tab
                case 'MESSAGE_FROM_PHOENIX':
                    if (self._callbacks && self._callbacks.message) {
                        const clientIDs = event.data.clientIDs,
                            message = event.data.message;
                        if(clientIDs.includes(clientID) || clientIDs.length === 0){
                            // clientIDs.length = 0 if the message is intended for all clients
                            self._callbacks.message(message);
                        }
                    }
                    break;
                case 'PHOENIX_CLOSE':
                    self._channelOpen = false;
                    if (self._callbacks && self._callbacks.close) {
                        self._callbacks.close();
                    }
                    break;
                }
            };
            _postLivePreviewMessage({
                type: 'BROWSER_CONNECT',
                url: global.location.href,
                clientID: clientID
            });
            self._channelOpen = true;
            if (self._callbacks && self._callbacks.connect) {
                self._callbacks.connect();
            }

            // attach to browser tab/window closing event so that we send a cleanup request
            // to the service worker for the comm ports
            addEventListener( 'beforeunload', function() {
                if(self._channelOpen){
                    self._channelOpen = false;
                    _postLivePreviewMessage({
                        type: 'BROWSER_CLOSE',
                        clientID: clientID
                    });
                }
            });
        },

        /**
         * Sends a message over the transport.
         * @param {string} msgStr The message to send.
         */
        send: function (msgStr) {
            _postLivePreviewMessage({
                type: 'BROWSER_MESSAGE',
                clientID: clientID,
                message: msgStr
            });
        },

        /**
         * Establish web socket connection.
         */
        enable: function () {
            this.connect();
        }
    };

    function getAbsoluteUrl(url) {
        // Check if the URL is already absolute
        if (/^(?:[a-z]+:)?\/\//i.test(url)) {
            return url; // The URL is already absolute
        }

        // If not, create an absolute URL using the current page's location as the base
        const absoluteUrl = new URL(url, window.location.href);
        return absoluteUrl.href;
    }

    // This is only for tauri builds where the live preview is embedded in the phoenix editor iframe. on clicking
    // any urls that needs to be open in a browser window, we execute this. In browser, this is no-op as there is
    // no corresponding listener attached in phoenix browser server.
    document.addEventListener('click', function(event) {
        if (event.target.tagName === 'A' && (event.target.target === '_blank')) {
            const href = getAbsoluteUrl(event.target.getAttribute('href'));
            window.parent.postMessage({
                handlerName: "ph-liveServer",
                eventName: 'embeddedIframeHrefClick',
                href: href
            }, "*");
        }
    });
}(this));
