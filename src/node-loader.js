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

/*global Phoenix, fs, logger*/

function nodeLoader() {
    const nodeLoadstartTime = Date.now();
    const phcodeExecHandlerMap = {};
    const nodeConnectorIDMap = {};
    // This holds the list {resolve, reject} for all waiting exec functions executed with execPeer here.
    const pendingExecPromiseMap = {};
    let currentCommandID = 1; // should be greater than 0!
    let wssEndpoint, controlSocket, dataSocket;
    const SOCKET_TYPE_DATA = "data",
        SOCKET_TYPE_CONTROL = "control";
    const LARGE_DATA_THRESHOLD = 2*1024*1024; // 2MB
    const MAX_RECONNECT_BACKOFF_TIME_MS = 1000;

    // If a NodeConnector has been created on this end, we can promptly process events and exec messages. However,
    // in cases where a NodeConnector hasn't been created yet on this end, we temporarily queue execs and event triggers
    // for up to 10 seconds. This approach ensures that the other side remains unaware of the status of the
    // NodeConnector at both ends, allowing them to initiate message transmission via the WebSocket as soon as they
    // invoke the createNodeConnector API on their side.

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
        // Using a for...of loop for better readability
        for(let {commandObject, dataBuffer} of copyPendingSendBuffer) {
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

    function _errNClearQueue(nodeConnectorID) {
        const pendingExecList = pendingNodeConnectorExecMap[nodeConnectorID];
        pendingNodeConnectorExecMap[nodeConnectorID] = [];
        for(const { ws, metadata } of pendingExecList) {
            _sendError(
                ws, metadata,
                new Error(`NodeConnector ${nodeConnectorID} not found to exec function ${metadata.execHandlerFnName}`)
            );
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
        for(const {ws, metadata, bufferData} of pendingExecList) {
            _execPhcodeConnectorFn(ws, metadata, bufferData);
        }
    }

    function _execPhcodeConnectorFn(ws, metadata, dataBuffer) {
        const nodeConnectorID = metadata.nodeConnectorID;
        const execHandlerFnName = metadata.execHandlerFnName;
        const moduleExports = phcodeExecHandlerMap[nodeConnectorID];
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
        for(const {ws, metadata, bufferData} of pendingEventList) {
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

    function createNodeConnector(nodeConnectorID, moduleExports) {
        if(nodeConnectorIDMap[nodeConnectorID]) {
            throw new Error("A node connector of the name is already registered: " + nodeConnectorID);
        }
        if(!_isObject(moduleExports) || !nodeConnectorID) {
            throw new Error("Invalid Argument. Expected createNodeConnector(string, module/Object) for " + nodeConnectorID);
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
        window.EventDispatcher.makeEventDispatcher(newNodeConnector);
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
        const COMMAND_RESPONSE_PREFIX = 'phnodeResp_1!5$:'; // a string thats not likely to just start with in
        const COMMAND_ERROR_PREFIX = 'phnodeErr_1!5$:';
        let command, child;
        let resolved = false;
        let commandID = 0, pendingCommands = {};
        const PHNODE_PREFERENCES_KEY = "PhNode.Prefs";
        function setInspectEnabled(enabled) {
            // cannot use PhStore instead of localStorage here as this is required at boot. Should be fine
            // as this to use non-persistent local storage(due to safari ITP) here as this is a debug flag.
            const prefs = JSON.parse(localStorage.getItem(PHNODE_PREFERENCES_KEY) || "{}");
            prefs.inspectEnabled = enabled;
            localStorage.setItem(PHNODE_PREFERENCES_KEY, JSON.stringify(prefs));
        }
        function isInspectEnabled() {
            // cannot use PhStore instead of localStorage here as this is required at boot.
            const prefs = JSON.parse(localStorage.getItem(PHNODE_PREFERENCES_KEY) || "{}");
            return !!prefs.inspectEnabled;
        }

        function getRandomNumber(min, max) {
            return Math.floor(Math.random() * (max - min + 1)) + min;
        }

        let nodeTerminationResolve;
        const nodeTerminationPromise = new Promise((resolve) => { nodeTerminationResolve = resolve;});

        // createNodeConnector can me immediately used after this, no need to wait for node nodeSetupDonePromise
        // All messages to be sent to node will be queued and sent when node comes online in its time.
        window.PhNodeEngine = {
            createNodeConnector,
            setInspectEnabled,
            isInspectEnabled
        };

        window.__TAURI__.path.resolveResource("src-node/index.js")
            .then(async nodeSrcPath=>{
                // node is designed such that it is not required at boot time to lower startup time.
                // Keep this so to increase boot speed.
                const inspectPort = Phoenix.isTestWindow ? getRandomNumber(5000, 50000) : 9229;
                const argsArray = isInspectEnabled() ? [`--inspect=${inspectPort}`, nodeSrcPath] : [nodeSrcPath, ''];
                command = window.__TAURI__.shell.Command.sidecar('phnode', argsArray);
                command.on('close', data => {
                    window.isNodeTerminated = true;
                    nodeTerminationResolve();
                    console.log(`PhNode: command finished with code ${data.code} and signal ${data.signal}`);
                    if(!resolved) {
                        reject("PhNode: closed - Terminated.");
                    }
                });
                command.on('error', error => {
                    window.isNodeTerminated = true;
                    nodeTerminationResolve();
                    console.error(`PhNode: command error: "${error}"`);
                    if(!resolved) {
                        logger.reportError(error, `PhNode failed to start!`);
                        reject("PhNode: closed - Terminated.");
                    }
                });
                command.stdout.on('data', line => {
                    if(line){
                        if(line.startsWith(COMMAND_RESPONSE_PREFIX)){
                            // its a js response object
                            line = line.replace(COMMAND_RESPONSE_PREFIX, "");
                            const jsonMsg = JSON.parse(line);
                            pendingCommands[jsonMsg.commandID].resolve(jsonMsg.message);
                            delete pendingCommands[jsonMsg.commandID];
                        } else if(line.startsWith(COMMAND_ERROR_PREFIX)){
                            // its a js response object
                            line = line.replace(COMMAND_ERROR_PREFIX, "");
                            const err = JSON.parse(line);
                            logger.reportError(err, `PhNode ${err.type}:${err.code?err.code:''}`);
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

                window.PhNodeEngine.terminateNode = function () {
                    if(!window.isNodeTerminated) {
                        execNode(NODE_COMMANDS.TERMINATE);
                    }
                    return nodeTerminationPromise;
                };
                window.PhNodeEngine.getInspectPort = function () {
                    return inspectPort;
                };

                execNode(NODE_COMMANDS.GET_ENDPOINTS)
                    .then(message=>{
                        fs.setNodeWSEndpoint(message.phoenixFSURL);
                        fs.forceUseNodeWSEndpoint(true);
                        setNodeWSEndpoint(message.phoenixNodeURL);
                        resolve(message);
                        // node is designed such that it is not required at boot time to lower startup time.
                        // Keep this so to increase boot speed.
                        window.PhNodeEngine._nodeLoadTime = Date.now() - nodeLoadstartTime;
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
