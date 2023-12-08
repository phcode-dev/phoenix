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

const readline = require('readline');
const http = require('http');
const net = require('net');
const PhoenixFS = require('@phcode/fs/dist/phoenix-fs');

function randomNonce(byteLength) {
    const randomBuffer = new Uint8Array(byteLength);
    crypto.getRandomValues(randomBuffer);

    // Define the character set for the random string
    const charset = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

    // Convert the ArrayBuffer to a case-sensitive random string with numbers
    let randomId = '';
    Array.from(randomBuffer).forEach(byte => {
        randomId += charset[byte % charset.length];
    });

    return randomId;
}

const COMMAND_RESPONSE_PREFIX = 'phnodeResp:';
// Generate a random 64-bit url. This should take 100 million+ of years to crack with current http connection speed.
const PHOENIX_FS_URL = `/PhoenixFS${randomNonce(8)}`;
const PHOENIX_NODE_URL = `/PhoenixNode${randomNonce(8)}`;

const savedConsoleLog = console.log;

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

let serverPortResolve;
const serverPortPromise = new Promise((resolve) => { serverPortResolve = resolve; });

let orphanExitTimer = setTimeout(()=>{
    process.exit(1);
}, 60000);

function _sendResponse(responseMessage, commandID) {
    savedConsoleLog(COMMAND_RESPONSE_PREFIX + JSON.stringify({
        message: responseMessage,
        commandID
    }) + "\n");
}

function processCommand(line) {
    try{
        let jsonCmd = JSON.parse(line);
        switch (jsonCmd.commandCode) {
        case "terminate": process.exit(0); return;
        case "heartBeat":
            clearTimeout(orphanExitTimer);
            orphanExitTimer = setTimeout(()=>{
                process.exit(1);
            }, 60000);
            return;
        case "ping": _sendResponse("pong", jsonCmd.commandID); return;
        case "setDebugMode":
            if(jsonCmd.commandData) {
                console.log = savedConsoleLog;
                console.log("Debug Mode Enabled");
            } else {
                console.log = function () {}; // swallow logs
            }
            _sendResponse("done", jsonCmd.commandID); return;
        case "getEndpoints":
            serverPortPromise.then(port =>{
                _sendResponse({
                    port,
                    phoenixFSURL: `ws://localhost:${port}${PHOENIX_FS_URL}`,
                    phoenixNodeURL: `ws://localhost:${port}${PHOENIX_NODE_URL}`
                }, jsonCmd.commandID);
            });
            return;
        default: console.error("unknown command: "+ line);
        }
    } catch (e) {
        console.error(e);
    }
}

rl.on('line', (line) => {
    processCommand(line);
});

function getFreePort() {
    return new Promise((resolve)=>{
        const server = net.createServer();

        server.listen(0, () => {
            const port = server.address().port;
            server.close(() => {
                resolve(port);
            });
        });
    });
}

// Create an HTTP server
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('WebSocket server running');
});

getFreePort().then((port) => {
    console.log('Server Opened on port: ', port);

    PhoenixFS.CreatePhoenixFsServer(server, PHOENIX_FS_URL);
    // PhoenixFS.setDebugMode(true); // uncomment this line to enable more logging in phoenix fs lib

    // Start the HTTP server on port 3000
    server.listen(port, () => {
        serverPortResolve(port);
        console.log(`Server running on http://localhost:${port}`);
        console.log(`Phoenix node tauri FS url is ws://localhost:${port}${PHOENIX_FS_URL}`);
    });

});
