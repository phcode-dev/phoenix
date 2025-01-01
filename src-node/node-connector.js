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

/**
 * node-connector Module
 *
 * This module manages core communication between Phoenix and the Node(`phnode`) instance. A similar implementation
 * exists on the Phoenix side, which can be found in `src/node-loader.js`.
 *
 * WebSocket Server Setup:
 *
 * - When Node starts, a WebSocket server is created at the path `/PhoenixNode<RandomString>`.
 *   This server is established using the `CreateNodeConnectorWSServer` function below.
 *
 * - The server waits for the establishment of two WebSocket connections:
 *   1. Control Socket: Used primarily for sending messages below 2 MB in size.
 *   2. Large Data Socket: Used for transmitting data above 2 MB, preventing large data transfers from
 *      blocking the control socket queue. Phoenix establishes both sockets and specifies the connected
 *      socket type as the first message.
 *
 * Node Connector Creation:
 *
 * - Named Node Connectors serve as the foundation for further communication between Node and Phoenix.
 *   A named Node Connector can be created only once via the `global.createNodeConnector` API in node and
 *   `createNodeConnector` API in `NodeConnector` module. Note that multiple `NodeConnector` can be created with
 *   different names.
 *
 * - The API returns Node Connector object that can be immediately used to execute `execPeer` and `triggerPeer` APIs.
 *   When the Node Connector with the same ID is opened on the other side (Phoenix), it will receive the events.
 *
 * Note:  Events or execPeer requests will be queued for upto 10 seconds to give time for the connector to be
 *  created at the other end before it calls quites and rejects all exec requests at timeout.
 *
 * Usage:
 *
 * - Once a `nodeConnector` is obtained, events can be raised, listened to, and functions can be executed
 *   on the other side of the connector.
 *
 */

const WebSocket = require('ws');
const {splitMetadataAndBuffer, mergeMetadataAndArrayBuffer} = require('./ws-utils');

const nodeConnectorIDMap = {};
const nodeExecHandlerMap = {};
let currentCommandID = 0;
// This holds the list {resolve, reject} for all waiting exec functions executed with execPeer here.
const pendingExecPromiseMap = {};

// If a NodeConnector has been created on this end, we can promptly process events and exec messages. However,
// in cases where a NodeConnector hasn't been created yet on this end, we temporarily queue execs and event triggers
// for up to 10 seconds. This approach ensures that the other side remains unaware of the status of the NodeConnector
// at both ends, allowing them to initiate message transmission via the WebSocket as soon as they invoke the
// createNodeConnector API on their side.

// Timeout duration for NodeConnector creation (10 seconds)
const NODE_CONNECTOR_CREATE_TIMEOUT = 10000;
// Max number of messages to queue for a single node connector.
const MAX_QUEUE_LENGTH = 2000;

// These arrays hold queues of event and exec messages received from the other side while a NodeConnector
// was not yet created on this end. Messages are queued for up to 10 seconds.
const pendingNodeConnectorExecMap = {};
const pendingNodeConnectorEventMap = {};

// This timer clears the pending maps above if a NodeConnector is not created within 10 seconds.
const isTimerRunningMap = {};

const WS_COMMAND = {
    RESPONSE: "response",
    EXEC: "exec",
    EVENT: "event",
    LARGE_DATA_SOCKET_ANNOUNCE: "largeDataSock",
    CONTROL_SOCKET_ANNOUNCE: "controlSock"
};

const WS_ERR_CODES = {
    NO_SUCH_FN: "NoSuchFn"
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
    for(let i=0; i<copyPendingSendBuffer.length; i++) {
        // Execute in order as we received the event
        const {commandObject, dataBuffer} = copyPendingSendBuffer[i];
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
        message: typeof err === "string" ? err : err.message || defaultMessage,
        code: err.code,
        stack: err.stack
    };
    _sendExecResponse(defaultWS, metadata);
}

function _isObject(variable) {
    return typeof variable === 'object' && variable !== null;
}

function _extractBuffer(result) {
    if(_isObject(result) && result.buffer instanceof ArrayBuffer) {
        const buffer = result.buffer;
        delete result.buffer;
        return buffer;
    }
    return null;
}

function _isJSONStringifiable(result) {
    try {
        JSON.stringify(result);
        return true;
    } catch (e){
        return false;
    }
}

function _errNClearQueue(nodeConnectorID) {
    const pendingExecList = pendingNodeConnectorExecMap[nodeConnectorID];
    pendingNodeConnectorExecMap[nodeConnectorID] = [];
    for(let i=0; i<pendingExecList.length; i++) {
        const {ws, metadata} = pendingExecList[i];
        _sendError(ws, metadata,
            new Error(`NodeConnector ${nodeConnectorID} not found to exec function ${metadata.execHandlerFnName}`));
    }
}

function _queueExec(nodeConnectorID, ws, metadata, bufferData) {
    let pendingExecList = pendingNodeConnectorExecMap[nodeConnectorID];
    if(!pendingExecList){
        pendingExecList = [];
        pendingNodeConnectorExecMap[nodeConnectorID] = pendingExecList;
    }
    if(pendingExecList.length > MAX_QUEUE_LENGTH) {
        _sendError(ws, metadata,
            new Error(`Too Many exec while waiting for NodeConnector ${nodeConnectorID} creation to exec fn ${metadata.execHandlerFnName}`));
        return;
    }
    pendingExecList.push({ws, metadata, bufferData});
    if(!isTimerRunningMap[nodeConnectorID]){
        isTimerRunningMap[nodeConnectorID] = true;
        setTimeout(() => {
            // the node connector was not established
            isTimerRunningMap[nodeConnectorID] = false;
            _errNClearQueue(nodeConnectorID);
        }, NODE_CONNECTOR_CREATE_TIMEOUT);
    }
}

function _drainExecQueue(nodeConnectorID) {
    let pendingExecList = pendingNodeConnectorExecMap[nodeConnectorID] || [];
    pendingNodeConnectorExecMap[nodeConnectorID] = [];
    for(let i=0; i<pendingExecList.length; i++) {
        const {ws, metadata, bufferData} = pendingExecList[i];
        _execNodeConnectorFn(ws, metadata, bufferData);
    }
}

function _execNodeConnectorFn(ws, metadata, dataBuffer) {
    const nodeConnectorID = metadata.nodeConnectorID;
    const execHandlerFnName = metadata.execHandlerFnName;
    const moduleExports = nodeExecHandlerMap[nodeConnectorID];
    if(!moduleExports){
        // node connector not yet created. Queue it.
        _queueExec(nodeConnectorID, ws, metadata, dataBuffer);
        return;
    }
    try{
        if(typeof moduleExports[execHandlerFnName] !== 'function'){
            const err = new Error("execHandlerFnName: " + execHandlerFnName
                + " no such function in node connector module: " + nodeConnectorID);
            err.code = WS_ERR_CODES.NO_SUCH_FN;
            throw err;
        }
        const response = moduleExports[execHandlerFnName](metadata.data, dataBuffer);
        if(!(response instanceof Promise)) {
            throw new Error(`execHandlerFnName: ${nodeConnectorID}::${execHandlerFnName} : `
                + " is expected to return a promise that resolve to (data, optional_arrayBuffer)");
        }
        response
            .then((result)=>{
                const buffer = _extractBuffer(result);
                if(!_isJSONStringifiable(result)) {
                    throw new Error(`execHandlerFnName: ${nodeConnectorID}::${execHandlerFnName} : `
                        + " is expected to return a promise that resolve to an object that can be JSON.stringify -ed. To pass an array buffer, use resolve({buffer:arrayBufferObj})");
                }
                _sendExecResponse(ws, metadata, result, buffer);
            }).catch(err =>{
                _sendError(ws, metadata, err,
                    `Node Error executing function in: ${nodeConnectorID}:${execHandlerFnName}`);
            });
    } catch (e) {
        _sendError(ws, metadata, e, "Node Could not execute function in: " + nodeConnectorID);
    }
}

function _queueEvent(nodeConnectorID, ws, metadata, bufferData) {
    let pendingEventList = pendingNodeConnectorEventMap[nodeConnectorID];
    if(!pendingEventList){
        pendingEventList = [];
        pendingNodeConnectorEventMap[nodeConnectorID] = pendingEventList;
    }
    if(pendingEventList.length > MAX_QUEUE_LENGTH) {
        _sendError(ws, metadata,
            new Error(`Too Many events: ${metadata.eventName} while waiting for NodeConnector ${nodeConnectorID} creation`));
        return;
    }
    pendingEventList.push({ws, metadata, bufferData});
    if(!isTimerRunningMap[nodeConnectorID]){
        isTimerRunningMap[nodeConnectorID] = true;
        setTimeout(() => {
            // the node connector was not established
            isTimerRunningMap[nodeConnectorID] = false;
            _errNClearQueue(nodeConnectorID);
        }, NODE_CONNECTOR_CREATE_TIMEOUT);
    }
}

function _drainEventQueue(nodeConnectorID) {
    let pendingEventList = pendingNodeConnectorEventMap[nodeConnectorID] || [];
    pendingNodeConnectorEventMap[nodeConnectorID] = [];
    for(let i=0; i<pendingEventList.length; i++) {
        const {ws, metadata, bufferData} = pendingEventList[i];
        _triggerEvent(ws, metadata, bufferData);
    }
}

function _triggerEvent(ws, metadata, dataBuffer) {
    const nodeConnectorID = metadata.nodeConnectorID;
    const nodeConnector = nodeConnectorIDMap[nodeConnectorID];
    if(!nodeConnector){
        // node connector not yet created. Queue it.
        _queueEvent(nodeConnectorID, ws, metadata, dataBuffer);
        return;
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
                const error = new Error(metadata.error.message, {cause: metadata.error.stack});
                error.code = metadata.error.code;
                error.phoenixStack = metadata.error.stack;
                pendingExecPromise.reject(error);
            } else {
                const result = metadata.data;
                if(dataBuffer instanceof ArrayBuffer) {
                    result.buffer = dataBuffer;
                }
                pendingExecPromise.resolve(result);
            }
            delete pendingExecPromiseMap[commandID];
            break;
        default: console.error("unknown command: "+ metadata);
        }
    } catch (e) {
        console.error(e);
    }
}

function createNodeConnector(nodeConnectorID, moduleExports) {
    if(nodeConnectorIDMap[nodeConnectorID]) {
        throw new Error("A node connector of the name is already registered: " + nodeConnectorID);
    }
    if(!_isObject(moduleExports) || !nodeConnectorID) {
        throw new Error("Invalid Argument. Expected createNodeConnector(string, module/Object) for " + nodeConnectorID);
    }

    nodeExecHandlerMap[nodeConnectorID] = moduleExports;
    const newNodeConnector = {
        /**
         * Executes a peer function with specified parameters. Most of the time you would use dataObjectToSend to send
         * simple JSON serializable objects. But in the event you have to send a binary ArrayBuffer, you can use
         * the optional `dataBuffer` field. Note that at this time, you can only send and receive a single binary buffer
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
            if ((dataBuffer && !(dataBuffer instanceof ArrayBuffer)) || dataObjectToSend instanceof ArrayBuffer) {
                throw new Error("execPeer should be called with exactly 3 or less arguments (FnName:string, data:Object|string, buffer:ArrayBuffer)");
            }
            if (dataBuffer instanceof ArrayBuffer && !_isObject(dataObjectToSend)) {
                throw new Error("execPeer second argument should be an object if sending binary data (FnName:string, data:Object, buffer:ArrayBuffer)");
            }
            return new Promise((resolve, reject) =>{
                currentCommandID ++;
                pendingExecPromiseMap[currentCommandID] = {resolve, reject};
                _sendExec(nodeConnectorID, currentCommandID, execHandlerFnName, dataObjectToSend, dataBuffer);
            });
        },
        /**
         * Triggers an event to be sent to a peer. Most of the time you would use dataObjectToSend to send
         * simple JSON serializable objects. But in the event you have to send a binary ArrayBuffer, you can use
         * the optional `dataBuffer` field. Note that at this time, you can only send and receive a single binary buffer
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

    // At this point, it's possible that a node connector has been created on the other end, and it might have sent
    // us exec and trigger events that need to be processed. These events will be queued for execution, and we will
    // handle them after the current event loop call.
    // We use a setTimeout with a zero-millisecond delay to ensure that the event queues are drained during the
    // next tick of the event loop.
    setTimeout(() => {
        _drainExecQueue(nodeConnectorID);
        _drainEventQueue(nodeConnectorID);
    }, 0);


    // At this time, the node connector at the other side may not be created, but it is still safe to use this
    // node connector now as the events will be queued at the other end for up to 10 seconds for a node connector
    // to be created at the other end.
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
global.createNodeConnector = createNodeConnector; //Add to global namespace for future node extensions
