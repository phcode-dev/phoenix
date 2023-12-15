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

/*global EventDispatcher*/

const WebSocket = require('ws');

const nodeConnectorIDMap = {};
const nodeExecHandlerMap = {};
let currentCommandID = 0;
const pendingExecPromiseMap = {};
const pendingPeerNodeConnectorSetupResolveMap = {};
const isPeerNodeConnectorSetupMap = {};

/**
 *
 * @param metadata {Object} Max size can be 4GB
 * @param bufferData {ArrayBuffer} [optional]
 * @return {ArrayBuffer}
 * @private
 */
function mergeMetadataAndArrayBuffer(metadata, bufferData) {
    if (bufferData instanceof ArrayBuffer) {
        metadata.hasBufferData = true;
    }
    bufferData = bufferData || new ArrayBuffer(0);
    if (typeof metadata !== 'object') {
        throw new Error("metadata should be an object, but was " + typeof metadata);
    }
    if (!(bufferData instanceof ArrayBuffer)) {
        throw new Error("Expected bufferData to be an instance of ArrayBuffer, but was " + typeof bufferData);
    }

    const metadataString = JSON.stringify(metadata);
    const metadataUint8Array = new TextEncoder().encode(metadataString);
    const metadataBuffer = metadataUint8Array.buffer;
    const sizePrefixLength = 4; // 4 bytes for a 32-bit integer

    if (metadataBuffer.byteLength > 4294000000) {
        throw new Error("metadata too large. Should be below 4,294MB, but was " + metadataBuffer.byteLength);
    }

    const concatenatedBuffer = new ArrayBuffer(sizePrefixLength + metadataBuffer.byteLength + bufferData.byteLength);
    const concatenatedUint8Array = new Uint8Array(concatenatedBuffer);

    // Write the length of metadataBuffer as a 32-bit integer
    new DataView(concatenatedBuffer).setUint32(0, metadataBuffer.byteLength, true);

    // Copy the metadataUint8Array and bufferData (if provided) to the concatenatedUint8Array
    concatenatedUint8Array.set(metadataUint8Array, sizePrefixLength);
    if (bufferData.byteLength > 0) {
        concatenatedUint8Array.set(new Uint8Array(bufferData), sizePrefixLength + metadataBuffer.byteLength);
    }

    return concatenatedBuffer;
}

function splitMetadataAndBuffer(concatenatedBuffer) {
    if(!(concatenatedBuffer instanceof ArrayBuffer)){
        throw new Error("Expected ArrayBuffer message from websocket");
    }
    const sizePrefixLength = 4;
    const buffer1Length = new DataView(concatenatedBuffer).getUint32(0, true); // Little endian

    const buffer1 = concatenatedBuffer.slice(sizePrefixLength, sizePrefixLength + buffer1Length);
    const metadata = JSON.parse(new TextDecoder().decode(buffer1));
    let buffer2;
    if (concatenatedBuffer.byteLength > sizePrefixLength + buffer1Length) {
        buffer2 = concatenatedBuffer.slice(sizePrefixLength + buffer1Length);
    }
    if(!buffer2 && metadata.hasBufferData) {
        // This happens if the sender is sending 0 length buffer. So we have to create an empty buffer here
        buffer2 = new ArrayBuffer(0);
    }

    return {
        metadata,
        bufferData: buffer2
    };
}


const WS_COMMAND = {
    RESPONSE: "response",
    EXEC: "exec",
    EVENT: "event",
    LARGE_DATA_SOCKET_ANNOUNCE: "largeDataSock",
    CONTROL_SOCKET_ANNOUNCE: "controlSock",
    NODE_CONNECTOR_ANNOUNCE: "nodeConnectorCreated"
};

const LARGE_DATA_THRESHOLD = 2*1024*1024; // 2MB
// binary data larger than 2MB is considered large data and we will try to send it through a large data web socket
// if present. A client typically makes 2 websockets, one for small control data and another for large data transport.
// so large data transfers won't block/put pressure on the control websocket.
let controlSocketMain = null,
    largeDataSocketMain = null;

const MAX_PENDING_SEND_BUFFER = 10000;
let pendingSendBuffer = [];

function _drainPendingSendBuffer() {
    const copyPendingSendBuffer = pendingSendBuffer;
    // empty to prevent race conditions
    pendingSendBuffer = [];
    while (copyPendingSendBuffer.length > 0) {
        const {commandObject, dataBuffer} = copyPendingSendBuffer.pop();
        _sendWithAppropriateSocket(commandObject, dataBuffer);
    }
}

function _sendWithAppropriateSocket(commandObject, dataBuffer) {
    let socketToUse = controlSocketMain || largeDataSocketMain;
    if(!socketToUse){
        // We got a send event before a websocket connection is established by phcode. Queue it to send later.
        if(pendingSendBuffer.length > MAX_PENDING_SEND_BUFFER){
            throw new Error("Too many node ws messages queued before a node connection was established from phcode.");
        }
        pendingSendBuffer.push({commandObject, dataBuffer});
        return;
    }
    if(dataBuffer && dataBuffer.byteLength > LARGE_DATA_THRESHOLD && largeDataSocketMain) {
        socketToUse = largeDataSocketMain;
    }
    socketToUse.send(mergeMetadataAndArrayBuffer(commandObject, dataBuffer));
}

function _sendCommand(commandCode, dataObjectToSend = null, dataBuffer = null) {
    currentCommandID++;
    const commandID = currentCommandID;
    const command = {
        commandCode: commandCode,
        commandID: commandID,
        data: dataObjectToSend
    };
    _sendWithAppropriateSocket(command, dataBuffer);
    return commandID;
}

function _sendExec(nodeConnectorID, commandID, execHandlerFnName, dataObjectToSend = null, dataBuffer = null) {
    const command = {
        nodeConnectorID: nodeConnectorID,
        commandID: commandID,
        execHandlerFnName,
        commandCode: WS_COMMAND.EXEC,
        data: dataObjectToSend
    };
    _sendWithAppropriateSocket(command, dataBuffer);
}

/**
 *
 * @param defaultWS If specified, will use the given socket.
 * @param metadata
 * @param dataObjectToSend
 * @param dataBuffer {ArrayBuffer}
 * @private
 */
function _sendExecResponse(defaultWS, metadata, dataObjectToSend = null, dataBuffer = null) {
    const response = {
        originalCommand: metadata.commandCode,
        commandCode: WS_COMMAND.RESPONSE,
        commandID: metadata.commandID,
        error: metadata.error,
        data: dataObjectToSend
    };
    let socketToUse = defaultWS || controlSocketMain;
    if(dataBuffer && dataBuffer.byteLength > LARGE_DATA_THRESHOLD && largeDataSocketMain) {
        socketToUse = largeDataSocketMain;
    }
    socketToUse.send(mergeMetadataAndArrayBuffer(response, dataBuffer));
}

function _sendEvent(nodeConnectorID, eventName, dataObjectToSend = null, dataBuffer = null) {
    const event = {
        nodeConnectorID,
        eventName,
        commandCode: WS_COMMAND.EVENT,
        data: dataObjectToSend
    };
    _sendWithAppropriateSocket(event, dataBuffer);
}

function _sendError(defaultWS, metadata, err= { }, defaultMessage = "Operation failed! ") {
    metadata.error = {
        message: err.message || defaultMessage,
        code: err.code,
        stack: err.stack
    };
    _sendExecResponse(defaultWS, metadata);
}

function _execNodeConnectorFn(ws, metadata, dataBuffer) {
    const nodeConnectorID = metadata.nodeConnectorID;
    const execHandlerFnName = metadata.execHandlerFnName;
    const moduleExports = nodeExecHandlerMap[nodeConnectorID];
    if(!moduleExports){
        throw new Error("Unable to find moduleExports to exec function for "+ JSON.stringify(metadata));
    }
    try{
        if(typeof moduleExports[execHandlerFnName] !== 'function'){
            throw new Error("execHandlerFnName: " + execHandlerFnName
                + " no such function in node connector module: " + nodeConnectorID);
        }
        const response = moduleExports[execHandlerFnName](metadata.data, dataBuffer);
        if(!(response instanceof Promise)) {
            throw new Error(`execHandlerFnName: ${nodeConnectorID}::${execHandlerFnName} : ` +
                + " is expected to return a promise that resolve to (data, optional_arrayBuffer)");
        }
        response
            .then((responseData, responseDataBuffer)=>{
                _sendExecResponse(ws, metadata, responseData, responseDataBuffer);
            }).catch(err =>{
                _sendError(ws, metadata, err,
                    `Node Error executing function in: ${nodeConnectorID}:${execHandlerFnName}`);
            });
    } catch (e) {
        _sendError(ws, metadata, e, "Node Could not execute function in: " + nodeConnectorID);
    }
}

function _triggerEvent(ws, metadata, dataBuffer) {
    const nodeConnectorID = metadata.nodeConnectorID;
    const nodeConnector = nodeConnectorIDMap[nodeConnectorID];
    if(!nodeConnector){
        throw new Error("Unable to find nodeConnectorID to _triggerEvent for "+ JSON.stringify(metadata));
    }
    nodeConnector.trigger(metadata.eventName, metadata.data, dataBuffer);
}

function processWSCommand(ws, metadata, dataBuffer) {
    try{
        switch (metadata.commandCode) {
        case WS_COMMAND.LARGE_DATA_SOCKET_ANNOUNCE:
            console.log("node-connector: Large Data Transfer Socket established");
            ws.isLargeData = true;
            largeDataSocketMain = ws;
            _drainPendingSendBuffer();
            return;
        case WS_COMMAND.CONTROL_SOCKET_ANNOUNCE:
            console.log("node-connector: Control Socket established");
            ws.isLargeData = false;
            controlSocketMain = ws;
            _drainPendingSendBuffer();
            return;
        case WS_COMMAND.NODE_CONNECTOR_ANNOUNCE:
            const nodeConnectorID = metadata.data;
            // this message signals that a node connector with the given nodeConnectorID is setup at the other side.
            if(pendingPeerNodeConnectorSetupResolveMap[nodeConnectorID]) {
                // this means that createNodeConnector in this side is waiting for this message. So resolve it.
                pendingPeerNodeConnectorSetupResolveMap[nodeConnectorID]();
            }
            isPeerNodeConnectorSetupMap[nodeConnectorID] = true;
            return;
        case WS_COMMAND.EXEC:
            _execNodeConnectorFn(ws, metadata, dataBuffer);
            return;
        case WS_COMMAND.EVENT:
            _triggerEvent(ws, metadata, dataBuffer);
            return;
        case WS_COMMAND.RESPONSE:
            const commandID = metadata.commandID;
            const pendingExecPromise = pendingExecPromiseMap[commandID];
            if(!pendingExecPromise){
                throw new Error("Unable to find response handler for "+ JSON.stringify(metadata));
            }
            if(metadata.error) {
                pendingExecPromise.reject(metadata.error);
            } else {
                pendingExecPromise.resolve(metadata.data, dataBuffer);
            }
            break;
        default: console.error("unknown command: "+ metadata);
        }
    } catch (e) {
        console.error(e);
    }
}

/*Returns a promise that resolves when a node connector for the given nodeConnectorID is created in the other side*/
function _waitForPeerNodeConnector(nodeConnectorID) {
    if(isPeerNodeConnectorSetupMap[nodeConnectorID]){
        return Promise.resolve();
    }
    return new Promise((resolve)=>{
        pendingPeerNodeConnectorSetupResolveMap[nodeConnectorID] = resolve;
    });
}

async function createNodeConnector(nodeConnectorID, moduleExports) {
    if(nodeConnectorIDMap[nodeConnectorID]) {
        throw new Error("A node connector of the name is already registered: " + nodeConnectorID);
    }

    nodeExecHandlerMap[nodeConnectorID] = moduleExports;
    const newNodeConnector = {
        /**
         * Executes a peer function with specified parameters.
         *
         * @param {string} execHandlerFnName - The name of the function to execute on the peer.
         * @param {Object|string|null} dataObjectToSend - Optional data to send along with the function call.
         * @param {ArrayBuffer|null} dataBuffer - Optional binary data to send along with the function call.
         *
         * @returns {Promise} - A promise that resolves or rejects based on the result of the function execution.
         *
         * @throws {Error} - If `dataBuffer` is provided and is not an instance of `ArrayBuffer`.
         */
        execPeer: function (execHandlerFnName, dataObjectToSend = null, dataBuffer = null) {
            if (dataBuffer && !(dataBuffer instanceof ArrayBuffer)) {
                throw new Error("execPeer should be called with exactly 3 arguments (FnName:string, data:Object|string, buffer:ArrayBuffer)");
            }
            return new Promise((resolve, reject) =>{
                currentCommandID ++;
                pendingExecPromiseMap[currentCommandID] = {resolve, reject};
                _sendExec(nodeConnectorID, currentCommandID, execHandlerFnName, dataObjectToSend, dataBuffer);
            });
        },
        /**
         * Triggers an event to be sent to a peer.
         *
         * @param {string} eventName - The name of the event to trigger.
         * @param {Object|string|null} dataObjectToSend - Optional data associated with the event. Can be an object, string, or null.
         * @param {ArrayBuffer|null} dataBuffer - Optional binary data associated with the event. Must be an ArrayBuffer or null.
         *
         * @throws {Error} Throws an error if dataBuffer is provided but is not an ArrayBuffer.
         */
        triggerPeer: function (eventName, dataObjectToSend = null, dataBuffer = null) {
            if (dataBuffer && !(dataBuffer instanceof ArrayBuffer)) {
                throw new Error("triggerPeer should be called with exactly 3 arguments (eventName:string, data:Object|string, buffer:ArrayBuffer)");
            }
            _sendEvent(nodeConnectorID, eventName, dataObjectToSend, dataBuffer);
        }
    };
    EventDispatcher.makeEventDispatcher(newNodeConnector);
    nodeConnectorIDMap[nodeConnectorID] = newNodeConnector;

    // now if phoenix is waiting for WS_COMMAND.NODE_CONNECTOR_ANNOUNCE to setup node connector on its side, we
    // raise it here. If phoenix NODE_CONNECTOR_ANNOUNCE call happens after this fn is called in node, then
    // it will be handled at processWSCommand fn.
    const peerConnectionPromise = _waitForPeerNodeConnector(nodeConnectorID);
    _sendCommand(WS_COMMAND.NODE_CONNECTOR_ANNOUNCE, nodeConnectorID);
    await peerConnectionPromise;
    return newNodeConnector;
}

function processWebSocketMessage(ws, message) {
    const {metadata, bufferData} = splitMetadataAndBuffer(message);
    processWSCommand(ws, metadata, bufferData);
}

function CreateNodeConnectorWSServer(server, wssPath) {
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
        console.log('node-connector: Websocket Client connected');
        ws.binaryType = 'arraybuffer';

        // Listen for messages from the client
        ws.on('message', (message) => {
            //console.log(`node-connector: Received message ${message} of size: ${message.byteLength}, type: ${typeof message}, isArrayBuffer: ${message instanceof ArrayBuffer}, isBuffer: ${Buffer.isBuffer(message)}`);
            processWebSocketMessage(ws, message);
        });

        ws.on('error', console.error);

        // Handle disconnection
        ws.on('close', () => {
            if(ws.isLargeData && largeDataSocketMain === ws){
                largeDataSocketMain = null;
                console.warn('node-connector: Websocket Client disconnected: Large data Socket');
            } else if(!ws.isLargeData && controlSocketMain === ws){
                controlSocketMain = null;
                console.warn('node-connector: Websocket Client disconnected: control Socket');
            }
        });
    });
}

exports.CreateNodeConnectorWSServer = CreateNodeConnectorWSServer;
exports.createNodeConnector = createNodeConnector;
