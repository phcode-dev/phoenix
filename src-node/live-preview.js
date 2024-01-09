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
const http = require('http');
const {splitMetadataAndBuffer, mergeMetadataAndArrayBuffer} = require('./ws-utils');
const NodeConnector = require("./node-connector");
const LIVE_SERVER_NODE_CONNECTOR_ID = "ph_live_server";
const liveServerConnector = NodeConnector.createNodeConnector(LIVE_SERVER_NODE_CONNECTOR_ID, exports);

const navigationSockets = [];

let server;
const localhostOnly = 'localhost';
let currentProjectRoot, currentProjectPort;

/**
 * starts the live preview static server at given port.
 *
 * @param desiredPort
 * @param { RequestListener } requestListener
 * @return {Promise} resolves if server successfully opened on port, else rejects
 */
function startServerAtPort(desiredPort, requestListener) {
    let resolved = false;
    return new Promise((resolve)=>{
        if(server) {
            server.close(() => {
                console.log(`Live Preview static Server on port ${server.address().port} closed.`);
            });
        }
        server = http.createServer(requestListener);
        server.listen(desiredPort, localhostOnly, () => {
            const port = server.address().port;
            console.log(`Live Preview static Server is running on http://${localhostOnly}:${port}`);
            resolved = true;
            resolve(port);
        });

        server.on('error', (error) => {
            console.error('Live Preview static Server error:', error);
            if(!resolved){
                resolve(null);
            }
        });

    });
}

async function startOrRestartServerAtPort(desiredPort, requestListener) {
    desiredPort = desiredPort || 0;
    let port = await startServerAtPort(desiredPort, requestListener);
    if(!port){
        // the port is not available, pick a random port
        port = await startServerAtPort(0, requestListener);
    }
    return port;
}

function messageAllWebSockets(socketList, data) {
    for(let socket of socketList){
        try{
            socket.send(data);
        } catch (e) {
            console.error("Failed sending to socket", socket, e);
        }
    }
}

/**
 * @param {IncomingMessage} req
 * @param {ServerResponse} res
 */
function serverRequestListener(req, res) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
}

async function startStaticServer({projectRoot, preferredPort}) {
    console.log("Live Preview: starting static server for project at port", projectRoot, preferredPort);
    const port = await startOrRestartServerAtPort(preferredPort, serverRequestListener);
    currentProjectPort = port;
    currentProjectRoot = projectRoot;
    return {
        port
    };
}

async function navMessageProjectOpened(message) {
    messageAllWebSockets(navigationSockets, mergeMetadataAndArrayBuffer(message));
}

async function navRedirectAllTabs(message) {
    messageAllWebSockets(navigationSockets, mergeMetadataAndArrayBuffer(message));
}

function processWebSocketMessage(ws, message) {
    const {metadata, bufferData} = splitMetadataAndBuffer(message);
    switch (metadata.type) {
    case 'CHANNEL_TYPE':
        if(metadata.channelName === 'navigationChannel' && !navigationSockets.includes(ws)) {
            ws.channelName = 'navigationChannel';
            ws.pageLoaderID = metadata.pageLoaderID;
            navigationSockets.push(ws);
        }
        return;
    case 'TAB_LOADER_ONLINE':
        liveServerConnector.execPeer('tabLoaderOnline', metadata);
        return;
    default: console.error("live-preview: Unknown socket message: ", metadata);
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
        ws.binaryType = 'arraybuffer';

        // Listen for messages from the client
        ws.on('message', (message) => {
            //console.log(`node-connector: Received message ${message} of size: ${message.byteLength}, type: ${typeof message}, isArrayBuffer: ${message instanceof ArrayBuffer}, isBuffer: ${Buffer.isBuffer(message)}`);
            processWebSocketMessage(ws, message);
        });

        ws.on('error', console.error);

        // Handle disconnection
        ws.on('close', () => {
            console.log('live-preview: Websocket Client disconnected', ws.channelName);
            const index = navigationSockets.findIndex(navs => navs === ws);
            if (index !== -1) {
                navigationSockets.splice(index, 1);
            }
        });
    });
}

exports.CreateLivePreviewWSServer = CreateLivePreviewWSServer;
exports.navMessageProjectOpened = navMessageProjectOpened;
exports.navRedirectAllTabs = navRedirectAllTabs;
exports.startStaticServer = startStaticServer;
