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

/**
 * We need to set this up in a worker as if the user is debugging a live preview page, the heartbeat messages will
 * be blocked in main thread, but fine in isolated worker thread.
 * @private
 */


let _livePreviewNavigationChannel;
let _livePreviewWebSocket, _livePreviewWebSocketOpen = false;
let livePreviewDebugModeEnabled = false;
function _debugLog(...args) {
    if(livePreviewDebugModeEnabled) {
        console.log(...args);
    }
}

/**
 *
 * @param metadata {Object} Max size can be 4GB
 * @param bufferData {ArrayBuffer?} [optional]
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

let messageQueue = [];

function _sendMessage(message) {
    if(_livePreviewWebSocket && _livePreviewWebSocketOpen) {
        _livePreviewWebSocket.send(mergeMetadataAndArrayBuffer(message));
    } else if(_livePreviewNavigationChannel){
        _livePreviewNavigationChannel.postMessage(message);
    } else {
        livePreviewDebugModeEnabled && console.warn("No Channels available for live preview worker messaging," +
            " queueing request, waiting for channel..");
        messageQueue.push(message);
    }
}

function flushPendingMessages() {
    const savedMessageQueue = messageQueue;
    messageQueue = [];
    for(let message of savedMessageQueue){
        _sendMessage(message);
    }
}

function _setupHearbeatMessenger(clientID) {
    function _sendOnlineHeartbeat() {
        _sendMessage({
            type: 'TAB_ONLINE',
            clientID,
            URL: location.href
        });
    }
    _sendOnlineHeartbeat();
    setInterval(()=>{
        _sendOnlineHeartbeat();
    }, 3000);
}

function _setupBroadcastChannel(broadcastChannel, clientID) {
    _livePreviewNavigationChannel=new BroadcastChannel(broadcastChannel);
    _livePreviewNavigationChannel.onmessage = (event) => {
        const type = event.data.type;
        switch (type) {
        case 'TAB_ONLINE': break; // do nothing. This is a loopback message from another live preview tab
        default: postMessage(event.data); break;
        }
    };
    _setupHearbeatMessenger(clientID);
}

function _setupWebsocketChannel(wssEndpoint, clientID) {
    _debugLog("live preview worker websocket url: ", wssEndpoint);
    _livePreviewWebSocket = new WebSocket(wssEndpoint);
    _livePreviewWebSocket.binaryType = 'arraybuffer';
    _livePreviewWebSocket.addEventListener("open", () =>{
        _debugLog("live preview worker websocket opened", wssEndpoint);
        _livePreviewWebSocketOpen = true;
        _sendMessage({
            type: 'CHANNEL_TYPE',
            channelName: 'livePreviewChannel',
            pageLoaderID: clientID
        });
        flushPendingMessages();
        _setupHearbeatMessenger(clientID);
    });

    _livePreviewWebSocket.addEventListener('message', function (event) {
        const message = event.data;
        const {metadata} = splitMetadataAndBuffer(message);
        _debugLog("Live Preview worker socket channel: Browser received event from Phoenix: ", metadata);
        const type = metadata.type;
        switch (type) {
        case 'TAB_ONLINE': break; // do nothing. This is a loopback message from another live preview tab
        default: postMessage(metadata); break;
        }
    });

    _livePreviewWebSocket.addEventListener('error', function (event) {
        console.error("Live Preview worker socket channel: error event: ", event);
    });

    _livePreviewWebSocket.addEventListener('close', function () {
        _livePreviewWebSocketOpen = false;
        _debugLog("Live Preview worker websocket closed");
    });
}

function updateTitleAndFavicon(event) {
    _sendMessage({
        type: 'UPDATE_TITLE_AND_ICON',
        title: event.data.title,
        faviconBase64: event.data.faviconBase64,
        URL: location.href
    });
}

onmessage = (event) => {
    const type = event.data.type;
    switch (type) {
    case 'setupPhoenixComm':
        livePreviewDebugModeEnabled = event.data.livePreviewDebugModeEnabled;
        if(event.data.broadcastChannel) {
            _setupBroadcastChannel(event.data.broadcastChannel, event.data.clientID);
        } else if(event.data.websocketChannelURL) {
            _setupWebsocketChannel(event.data.websocketChannelURL, event.data.clientID);
        } else {
            console.error("No live preview worker communication channels! ", event.data);
        }
        break;
    case 'updateTitleIcon': updateTitleAndFavicon(event); break;
    case 'livePreview': _sendMessage(event.data.message); break;
    default: console.error("Live Preview page worker: received unknown event:", event);
    }
};
