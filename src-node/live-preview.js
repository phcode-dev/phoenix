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

/**
 * live-preview Module
 *
 * This module manages live preview server and messaging components. This is mainly a proxy for
 * live preview content and inter tab messaging and actual control and logic lies in phoenix instance.
 *
 */

const WebSocket = require('ws');
const NodeConnector = require("./node-connector");
const LIVE_SERVER_NODE_CONNECTOR_ID = "ph_live_server";
const liveServerConnector = NodeConnector.createNodeConnector(LIVE_SERVER_NODE_CONNECTOR_ID, exports);

function processWebSocketMessage(ws, message) {
    const data = JSON.parse(message);
    switch (data.type) {
    default: console.error("live-preview: Unknown socket message: ", message);
    }
}

function CreateLivePreviewWSServer(server, wssPath) {
    // Create a WebSocket server by passing the HTTP server instance to WebSocket.Server
    const wss = new WebSocket.Server({
        noServer: true,
        perMessageDeflate: false, // dont compress to improve performance and since we are on localhost.
        maxPayload: 2048 * 1024 * 1024 // 2GB Max message payload size
    });

    server.on('upgrade', (request, socket, head) => {
        const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;
        if (pathname === wssPath) {
            wss.handleUpgrade(request, socket, head, (ws) => {
                wss.emit('connection', ws, request);
            });
        } else {
            // Not handling the upgrade here. Let the next listener deal with it.
        }
    });

    // Set up a connection listener
    wss.on('connection', (ws) => {
        console.log('live-preview: Websocket Client connected');

        // Listen for messages from the client
        ws.on('message', (message) => {
            //console.log(`node-connector: Received message ${message} of size: ${message.byteLength}, type: ${typeof message}, isArrayBuffer: ${message instanceof ArrayBuffer}, isBuffer: ${Buffer.isBuffer(message)}`);
            processWebSocketMessage(ws, message);
        });

        ws.on('error', console.error);

        // Handle disconnection
        ws.on('close', () => {
            console.log('live-preview: Websocket Client disconnected');
        });
    });
}

exports.CreateLivePreviewWSServer = CreateLivePreviewWSServer;
