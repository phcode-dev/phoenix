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
// This transport provides a web socket mechanism. It's injected separately from the
// protocol handler so that the transport can be changed separately.

(function (global) {

    function _debugLog(...args) {
        if(window.LIVE_PREVIEW_DEBUG_ENABLED) {
            console.log(...args);
        }
    }

    const clientID = "" + Math.round( Math.random()*1000000000);

    const worker = new Worker(window.LIVE_DEV_REMOTE_WORKER_SCRIPTS_FILE_NAME);
    worker.onmessage = (event) => {
        const type = event.data.type;
        switch (type) {
        case 'REDIRECT_PAGE': location.href = event.data.URL; break;
        default: console.error("Live Preview page loader: received unknown message from worker:", event);
        }
    };
    worker.postMessage({
        type: "setupBroadcast",
        broadcastChannel: window.LIVE_PREVIEW_BROADCAST_CHANNEL_ID,
        clientID});

    const WebSocketTransport = {
        _channelOpen: false,
        // message channel used to communicate with service worker
        _broadcastMessageChannel: null,

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
            // message channel to phoenix connect on load itself. The channel id is injected from phoenix
            // via LivePreviewTransport.js while serving the instrumented html file
            self._broadcastMessageChannel = new BroadcastChannel(window.LIVE_PREVIEW_BROADCAST_CHANNEL_ID);
            self._broadcastMessageChannel.postMessage({
                type: 'BROWSER_CONNECT',
                url: global.location.href,
                clientID: clientID
            });

            // Listen to the response
            self._broadcastMessageChannel.onmessage = (event) => {
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
                    self._broadcastMessageChannel.close();
                    if (self._callbacks && self._callbacks.close) {
                        self._callbacks.close();
                    }
                    break;
                }
            };

            self._channelOpen = true;
            if (self._callbacks && self._callbacks.connect) {
                self._callbacks.connect();
            }

            // attach to browser tab/window closing event so that we send a cleanup request
            // to the service worker for the comm ports
            addEventListener( 'beforeunload', function() {
                if(self._channelOpen){
                    self._channelOpen = false;
                    self._broadcastMessageChannel.postMessage({
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
            const self = this;
            self._broadcastMessageChannel.postMessage({
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
    global._Brackets_LiveDev_Transport = WebSocketTransport;
}(this));
