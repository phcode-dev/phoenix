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


    const EventDispatcher = require("utils/EventDispatcher"),
        Metrics = require("utils/Metrics");

    const METRIC_SEND_INTERVAL_MS = 1000;

    let transportMessagesCount = 0,
        transportMessagesSizeB = 0;

    // mix panel and Google Analytics is sending too many request and seems to not have client side aggregation
    // like core analytics. So we do our own aggregation and send metrics only atmost once a second.
    // We could remove this once we moe fully to core analytics.
    setInterval(()=>{
        if(transportMessagesCount > 0){
            Metrics.countEvent(Metrics.EVENT_TYPE.LIVE_PREVIEW, "transport", "msgCount", transportMessagesCount);
            Metrics.countEvent(Metrics.EVENT_TYPE.LIVE_PREVIEW, "transport", "msgSizeB", transportMessagesSizeB);
            transportMessagesCount = 0;
            transportMessagesSizeB = 0;
        }
    }, METRIC_SEND_INTERVAL_MS);

    // The script that will be injected into the previewed HTML to handle the other side of the socket connection.
    const ServiceWorkerTransportRemote = require("text!LiveDevelopment/BrowserScripts/ServiceWorkerTransportRemote.js");

    // Events - setup the service worker communication channel.
    const BROADCAST_CHANNEL_ID = `${Math.round( Math.random()*1000000000000)}_livePreview`;
    let _broadcastChannel = new BroadcastChannel(BROADCAST_CHANNEL_ID);

    /**
     * Returns the script that should be injected into the browser to handle the other end of the transport.
     * @return {string}
     */
    function getRemoteScript() {
        return "<script>\n" +
            `window.LIVE_PREVIEW_BROADCAST_CHANNEL_ID = "${BROADCAST_CHANNEL_ID}";\n` +
            `window.LIVE_PREVIEW_DEBIG_ENABLED = ${window.loggingOptions.logLivePreview};\n` +
            ServiceWorkerTransportRemote +
            "</script>\n";
    }

    EventDispatcher.makeEventDispatcher(exports);

    // Exports
    exports.getRemoteScript = getRemoteScript;

    exports.start = function () {
        // Listen to the response
        // attach to browser tab/window closing event so that we send a cleanup request
        // to the service worker for the comm ports
        addEventListener( 'beforeunload', function() {
            _broadcastChannel.postMessage({
                type: 'PHOENIX_CLOSE'
            });
        });
        _broadcastChannel.onmessage = (event) => {
            window.loggingOptions.livePreview.log(
                "Live Preview: Phoenix received event from Browser preview tab/iframe: ", event.data);
            const type = event.data.type;
            switch (type) {
            case 'BROWSER_CONNECT': exports.trigger('connect', [event.data.clientID, event.data.url]); break;
            case 'BROWSER_MESSAGE':
                const message = event.data.message || "";
                exports.trigger('message', [event.data.clientID, message]);
                transportMessagesSizeB = transportMessagesSizeB + message.length;
                break;
            case 'BROWSER_CLOSE': exports.trigger('close', [event.data.clientID]); break;
            default: console.error("ServiceWorkerTransport received unknown message from Browser preview:", event);
            }
            transportMessagesCount++;
        };
    };

    exports.close = function () {
        // no-op the broadcast channel is never broken even though live preview may be on or off.
    };

    exports.send = function (...args) {
        _broadcastChannel.postMessage({
            type: 'MESSAGE_FROM_PHOENIX',
            args
        });
    };

});
