/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
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

/*global Phoenix, fs*/

function nodeLoader() {
    const phcodeExecHandlerMap = {};
    const nodeConnectorIDMap = {};
    const pendingExecPromiseMap = {};
    const pendingPeerNodeConnectorSetupResolveMap = {};
    const isPeerNodeConnectorSetupMap = {};
    let currentCommandID = 1; // should be greater than 0!
    let wssEndpoint, controlSocket, dataSocket;
    const SOCKET_TYPE_DATA = "data",
        SOCKET_TYPE_CONTROL = "control";
    const LARGE_DATA_THRESHOLD = 2*1024*1024; // 2MB
    const MAX_RECONNECT_BACKOFF_TIME_MS = 1000;

    const WS_COMMAND = {
        RESPONSE: "response",
        EXEC: "exec",
        EVENT: "event",
        LARGE_DATA_SOCKET_ANNOUNCE: "largeDataSock",
        CONTROL_SOCKET_ANNOUNCE: "controlSock",
        NODE_CONNECTOR_ANNOUNCE: "nodeConnectorCreated"
    };

    const WS_ERR_CODES = {
        NO_SUCH_FN: "NoSuchFn"
    };

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

    function _isSocketOpen(socket) {
        return socket && socket.readyState === WebSocket.OPEN;
    }

    function _sendWithAppropriateSocket(commandObject, dataBuffer) {
        let socketToUse = controlSocket || dataSocket;
        const atleastOneSocketUsable = _isSocketOpen(controlSocket) || _isSocketOpen(dataSocket);
        if(!socketToUse || !atleastOneSocketUsable){
            // We got a send event before a websocket connection is established by phcode. Queue it to send later.
            if(pendingSendBuffer.length > MAX_PENDING_SEND_BUFFER){
                throw new Error("Too many node ws messages queued before a node connection was established to phnode.");
            }
            pendingSendBuffer.push({commandObject, dataBuffer});
            return;
        }
        if(dataBuffer && dataBuffer.byteLength > LARGE_DATA_THRESHOLD && dataSocket && _isSocketOpen(dataSocket)) {
            socketToUse = dataSocket;
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
        let socketToUse = defaultWS || controlSocket;
        if(dataBuffer && dataBuffer.byteLength > LARGE_DATA_THRESHOLD && dataSocket) {
            socketToUse = dataSocket;
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

    function _execPhcodeConnectorFn(ws, metadata, dataBuffer) {
        const nodeConnectorID = metadata.nodeConnectorID;
        const execHandlerFnName = metadata.execHandlerFnName;
        const moduleExports = phcodeExecHandlerMap[nodeConnectorID];
        if(!moduleExports){
            throw new Error("Unable to find moduleExports to exec function for "+ JSON.stringify(metadata));
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
                    + " is expected to return a promise that resolve to ({data, ?buffer})");
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
                    `Error executing function in: ${nodeConnectorID}:${execHandlerFnName}`);
            });
        } catch (e) {
            _sendError(ws, metadata, e, "Phcode Could not execute function in: " + nodeConnectorID);
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
                _execPhcodeConnectorFn(ws, metadata, dataBuffer);
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
                    error.nodeStack = metadata.error.stack;
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

        phcodeExecHandlerMap[nodeConnectorID] = moduleExports;
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
                    throw new Error("execPeer should be called with exactly 3 arguments or less (FnName:string, data:Object|string, buffer:ArrayBuffer)");
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
        window.EventDispatcher.makeEventDispatcher(newNodeConnector);
        nodeConnectorIDMap[nodeConnectorID] = newNodeConnector;

        // now if phoenix is waiting for WS_COMMAND.NODE_CONNECTOR_ANNOUNCE to setup node connector on its side, we
        // raise it here. If phoenix NODE_CONNECTOR_ANNOUNCE call happens after this fn is called in node, then
        // it will be handled at processWSCommand fn.
        const peerConnectionPromise = _waitForPeerNodeConnector(nodeConnectorID);
        _sendCommand(WS_COMMAND.NODE_CONNECTOR_ANNOUNCE, nodeConnectorID);
        await peerConnectionPromise;
        return newNodeConnector;
    }

    function _silentlyCloseSocket(socket) {
        if(!socket) {
            return;
        }
        try{
            socket.autoReconnect = false;
            socket.close();
        } catch (e) {
            console.error("node-loader: ", e);
        }
    }

    function _wait(timeMS) {
        return new Promise((resolve)=>{
            setTimeout(resolve, timeMS);
        });
    }

    async function _establishAndMaintainConnection(socketType, firstConnectCB) {
        let ws = new WebSocket(wssEndpoint);
        ws.binaryType = 'arraybuffer';
        ws.autoReconnect = true;
        const resolved = false;
        while(ws.autoReconnect) {
            let wsClosePromiseResolve;
            const wsClosePromise = new Promise((resolve) => {wsClosePromiseResolve = resolve;});
            if(socketType === SOCKET_TYPE_CONTROL) {
                controlSocket = ws;
            } else {
                ws.isLargeDataWS = true;
                dataSocket = ws;
            }
            // eslint-disable-next-line no-loop-func
            ws.addEventListener("open", () =>{
                ws.backoffTime = 0;
                if(!resolved) {
                    firstConnectCB();
                }
                if(ws.isLargeDataWS){
                    _sendCommand(WS_COMMAND.LARGE_DATA_SOCKET_ANNOUNCE);
                } else {
                    _sendCommand(WS_COMMAND.CONTROL_SOCKET_ANNOUNCE);
                }
                _drainPendingSendBuffer();
            });

            // eslint-disable-next-line no-loop-func
            ws.addEventListener('message', function (event) {
                const {metadata, bufferData} = splitMetadataAndBuffer(event.data);
                processWSCommand(ws, metadata, bufferData);
            });

            ws.addEventListener('error', function (event) {
                console.error("PhoenixFS websocket error event: ", event);
            });

            ws.addEventListener('close', function () {
                wsClosePromiseResolve();
            });
            await wsClosePromise;
            const backoffTime = Math.min(ws.backoffTime * 2, MAX_RECONNECT_BACKOFF_TIME_MS) || 1;
            ws.backoffTime = backoffTime;
            await _wait(backoffTime);
            if(ws.autoReconnect) {
                ws = new WebSocket(wssEndpoint);
                ws.backoffTime = backoffTime;
                ws.binaryType = 'arraybuffer';
                ws.autoReconnect = true;
            }
        }
    }

    async function setNodeWSEndpoint(websocketEndpoint) {
        return new Promise((resolve, reject)=>{
            if(websocketEndpoint === wssEndpoint) {
                reject(new Error("A connection on the same websocket address is in progress: " + websocketEndpoint));
            }
            _silentlyCloseSocket(controlSocket);
            controlSocket = null;
            _silentlyCloseSocket(dataSocket);
            dataSocket = null;
            wssEndpoint = websocketEndpoint;
            let resolved = false;
            function firstConnectCB() {
                if(!resolved){
                    resolve();
                    resolved = true;
                }
            }
            _establishAndMaintainConnection(SOCKET_TYPE_CONTROL, firstConnectCB);
            _establishAndMaintainConnection(SOCKET_TYPE_DATA, firstConnectCB);
        });
    }


    window.nodeSetupDonePromise = new Promise((resolve, reject) =>{
        const NODE_COMMANDS = {
            TERMINATE: "terminate",
            PING: "ping",
            SET_DEBUG_MODE: "setDebugMode",
            HEART_BEAT: "heartBeat",
            GET_ENDPOINTS: "getEndpoints"
        };
        const COMMAND_RESPONSE_PREFIX = 'phnodeResp:';
        let command, child;
        let resolved = false;
        let commandID = 0, pendingCommands = {};
        const PHNODE_PREFERENCES_KEY = "PhNode.Prefs";
        function setInspectEnabled(enabled) {
            const prefs = JSON.parse(localStorage.getItem(PHNODE_PREFERENCES_KEY) || "{}");
            prefs.inspectEnabled = enabled;
            localStorage.setItem(PHNODE_PREFERENCES_KEY, JSON.stringify(prefs));
        }
        function isInspectEnabled() {
            const prefs = JSON.parse(localStorage.getItem(PHNODE_PREFERENCES_KEY) || "{}");
            return !!prefs.inspectEnabled;
        }

        function getRandomNumber(min, max) {
            return Math.floor(Math.random() * (max - min + 1)) + min;
        }

        window.__TAURI__.path.resolveResource("src-node/index.js")
            .then(async nodeSrcPath=>{
                const inspectPort = Phoenix.isTestWindow ? getRandomNumber(5000, 50000) : 9229;
                const argsArray = isInspectEnabled() ? [`--inspect=${inspectPort}`, nodeSrcPath] : [nodeSrcPath, ''];
                command = window.__TAURI__.shell.Command.sidecar('phnode', argsArray);
                command.on('close', data => {
                    window.isNodeTerminated = true;
                    console.log(`PhNode: command finished with code ${data.code} and signal ${data.signal}`);
                    if(!resolved) {
                        reject("PhNode: closed - Terminated.");
                    }
                });
                command.on('error', error => console.error(`PhNode: command error: "${error}"`));
                command.stdout.on('data', line => {
                    if(line){
                        if(line.startsWith(COMMAND_RESPONSE_PREFIX)){
                            // its a js response object
                            line = line.replace(COMMAND_RESPONSE_PREFIX, "");
                            const jsonMsg = JSON.parse(line);
                            pendingCommands[jsonMsg.commandID].resolve(jsonMsg.message);
                            delete pendingCommands[jsonMsg.commandID];
                        } else {
                            console.log(`PhNode: ${line}`);
                        }
                    }
                });
                command.stderr.on('data', line => console.error(`PhNode: ${line}`));
                child = await command.spawn();

                const execNode = function (commandCode, commandData) {
                    if(window.isNodeTerminated){
                        return Promise.reject("Node is terminated! Cannot execute: " + commandCode);
                    }
                    const newCommandID = commandID ++;
                    child.write(JSON.stringify({
                        commandCode: commandCode, commandID: newCommandID, commandData
                    }) + "\n");
                    let resolveP, rejectP;
                    const promise = new Promise((resolve, reject) => { resolveP = resolve; rejectP=reject; });
                    pendingCommands[newCommandID]= {resolve: resolveP, reject: rejectP};
                    return promise;
                };

                window.PhNodeEngine = {
                    createNodeConnector,
                    setInspectEnabled,
                    isInspectEnabled,
                    terminateNode: function () {
                        if(!window.isNodeTerminated) {
                            execNode(NODE_COMMANDS.TERMINATE);
                        }
                    },
                    getInspectPort: function () {
                        return inspectPort;
                    }
                };

                execNode(NODE_COMMANDS.GET_ENDPOINTS)
                    .then(message=>{
                        fs.setNodeWSEndpoint(message.phoenixFSURL);
                        fs.forceUseNodeWSEndpoint(true);
                        setNodeWSEndpoint(message.phoenixNodeURL);
                        resolve(message);
                    });
                execNode(NODE_COMMANDS.SET_DEBUG_MODE, window.debugMode);
                setInterval(()=>{
                    if(!window.isNodeTerminated) {
                        execNode(NODE_COMMANDS.HEART_BEAT);
                    }
                }, 10000);
            });
    });
}

if(Phoenix.browser.isTauri) {
    nodeLoader();
}
