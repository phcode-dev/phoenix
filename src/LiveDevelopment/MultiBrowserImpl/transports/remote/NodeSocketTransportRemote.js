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

    const WebSocketTransport = {
        _channelOpen: false,
        _clientID: Math.round( Math.random()*1000000000),
        // message channel used to communicate with service worker
        _swMessageChannel: null,

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
         * Connects to the NodeSocketTransport in Brackets at the given WebSocket URL.
         */
        connect: function () {
            const self = this;
            self._swMessageChannel = new MessageChannel();// message channel to the service worker
            // connect on load itself. First we initialize the channel by sending the port to the Service Worker (this also
            // transfers the ownership of the port)
            navigator.serviceWorker.controller.postMessage({
                type: 'BROWSER_CONNECT',
                url: global.location.href,
                clientID: self._clientID
            }, [self._swMessageChannel.port2]);

            // Listen to the response
            self._swMessageChannel.port1.onmessage = (event) => {
                // Print the result
                console.log("Browser received event from worker: ", event.data);
                const type = event.data.type;
                console.log(event);
                switch (type) {
                case 'MESSAGE_FROM_PHOENIX': console.log("[Brackets LiveDev] Got message: " + event.data);
                    if (self._callbacks && self._callbacks.message) {
                        self._callbacks.message(event.data.message);
                    }
                    break;
                case 'CLOSE': console.log("[Brackets LiveDev] Got message: " + event.data);
                    self._channelOpen = false;
                    self._swMessageChannel.port1.close();
                    if (self._callbacks && self._callbacks.close) {
                        self._callbacks.close();
                    }
                    break;
                default: console.error("Unknown event type for event", event);
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
                    navigator.serviceWorker.controller.postMessage({
                        type: 'BROWSER_CLOSE',
                        clientID: self._clientID
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
            navigator.serviceWorker.controller.postMessage({
                type: 'BROWSER_MESSAGE',
                clientID: self._clientID,
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
