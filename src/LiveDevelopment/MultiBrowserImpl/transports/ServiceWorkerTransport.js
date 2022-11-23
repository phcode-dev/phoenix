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

// This transport provides a connection between Brackets and a live browser preview via service worker
// as the intermediary. We also rely on an injected script in the browser for the other end of the transport.

define(function (require, exports, module) {


    const EventDispatcher = require("utils/EventDispatcher");

    // The script that will be injected into the previewed HTML to handle the other side of the socket connection.
    const ServiceWorkerTransportRemote = require("text!LiveDevelopment/BrowserScripts/ServiceWorkerTransportRemote.js");

    /**
     * Returns the script that should be injected into the browser to handle the other end of the transport.
     * @return {string}
     */
    function getRemoteScript() {
        return "<script>\n" +
            ServiceWorkerTransportRemote +
            "</script>\n";
    }

    // Events - setup the service worker communication channel.
    let _swMessageChannel = null;

    EventDispatcher.makeEventDispatcher(exports);

    // Exports
    exports.getRemoteScript = getRemoteScript;

    exports.start = function () {
        _swMessageChannel = new MessageChannel();// message channel to the service worker
        // connect on load itself. First we initialize the channel by sending the port to the Service Worker (this also
        // transfers the ownership of the port)
        navigator.serviceWorker.controller.postMessage({
            type: 'PHOENIX_CONNECT'
        }, [_swMessageChannel.port2]);
        // attach to browser tab/window closing event so that we send a cleanup request
        // to the service worker for the comm ports
        addEventListener( 'beforeunload', function() {
            navigator.serviceWorker.controller.postMessage({
                type: 'PHOENIX_CLOSE'
            });
        });


        // Listen to the response
        _swMessageChannel.port1.onmessage = (event) => {
            // Print the result
            console.log("Live Preview: Phoenix received event from Browser preview tab/iframe: ", event.data);
            const type = event.data.type;
            switch (type) {
            case 'getInstrumentedContent': exports.trigger(type, event.data); break;
            case 'BROWSER_CONNECT': exports.trigger('connect', [event.data.clientID, event.data.url]); break;
            case 'BROWSER_MESSAGE': exports.trigger('message', [event.data.clientID, event.data.message]); break;
            case 'BROWSER_CLOSE': exports.trigger('close', [event.data.clientID]); break;
            default: console.error("ServiceWorkerTransport received unknown message from service worker", event);
            }
        };
    };

    exports.close = function () {
        // no-op the connection to service worker is never broken even though live preview may be on or off.
    };

    exports.send = function (...args) {
        navigator.serviceWorker.controller.postMessage({
            type: 'PHOENIX_SEND',
            args
        });
    };

});
