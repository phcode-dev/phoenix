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
 * Phoenix Node Connector Initialization
 *
 * This module initializes the Phoenix Node Connector, which is used to establish communication
 * between the Phoenix and Tauri Node Sidecar. The Phoenix Node Connector manages the
 * lifecycle of the `phnode` instance and handles handshake, process commands, and WebSocket
 * connections.
 *
 * Initialization Steps:
 *
 * 1. Phoenix loads this module with Tauri Node Sidecar, and an initial handshake occurs via stdio connectors.
 *    During this handshake, web server URLs for Phoenix Node FS and node connector APIs are exchanged.
 *
 * 2. WebSockets are started for further communication. A dynamically detected free port is used for the server.
 *    A random URL prefix is generated to obfuscate the localhost URL and enhance security.
 *
 * Security Considerations:
 *
 * - **Port Scanning Attacks**: Port scanning attacks from external sources to discover localhost URLs
 *   are a security concern. To mitigate this risk, we use a large random URL prefix, making it impossible for
 *   attackers to guess the URL with brute force scans.
 *
 * Available Commands:
 *
 * The following commands are supported by the Phoenix Node Connector during its lifecycle:
 *
 * - `getEndpoints`: Retrieves available endpoints.
 * - `terminate`: Terminates the Phoenix Node Connector.
 * - ... (See the full list in the `processCommand` function below)
 *
 * Please refer to the `node-connector.js` file in this directory for details on the
 * Node Connector architecture and implementation were the majority of the
 * communication between phoenix and node happens.
 *
 */

require("./NodeEventDispatcher");
const lmdb = require("./lmdb");
const readline = require('readline');
const http = require('http');
const mime = require('mime-types');
const os = require('os');
const fs= require("fs");
const path = require('path');
const PhoenixFS = require('@phcode/fs/dist/phoenix-fs');
const NodeConnector = require("./node-connector");
const LivePreview = require("./live-preview");
const MediaServer = require("./media-server");
const CliConnector = require("./ai-cli-connector");
require("./test-connection");
require("./utils");
require("./terminal");
require("./git/cli");
// Note: "./lsp-client" is intentionally NOT required here. It is lazy-loaded on demand the
// first time the desktop LSP client is used (via NodeUtils._loadNodeExtensionModule), so the
// LSP framework adds nothing to node boot time. See src/languageTools/LSPClient.js.
require("./claude-code-agent");
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

let debugMode = false;
const COMMAND_RESPONSE_PREFIX = 'phnodeResp_1!5$:'; // a string thats not likely to just start with in stdio
const COMMAND_ERROR_PREFIX = 'phnodeErr_1!5$:';
// Generate a random 64-bit url. This should take 100 million+ of years to crack with current http connection speed.
const PHOENIX_FS_URL = `/PhoenixFS${randomNonce(8)}`;
const PHOENIX_STATIC_SERVER_URL = `/Static${randomNonce(8)}`;
const PHOENIX_NODE_URL = `/PhoenixNode${randomNonce(8)}`;
const PHOENIX_LIVE_PREVIEW_COMM_URL = `/PreviewComm${randomNonce(8)}`;
const PHOENIX_AUTO_AUTH_URL = `/AutoAuth${randomNonce(8)}`;
const PHOENIX_MEDIA_URL = `/Media${randomNonce(8)}`;

const savedConsoleLog = console.log;

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

let serverPortResolve;
const serverPortPromise = new Promise((resolve) => { serverPortResolve = resolve; });

function _sendResponse(responseMessage, commandID) {
    savedConsoleLog(COMMAND_RESPONSE_PREFIX + JSON.stringify({
        message: responseMessage,
        commandID
    }) + "\n");
}

let nodeBinPath='', nodeSrcPath='';
if(path.isAbsolute(process.argv[0])){
    nodeBinPath = path.dirname(process.argv[0]);
}
if(path.isAbsolute(process.argv[1])){
    nodeSrcPath = path.dirname(process.argv[1]);
}
const userHomeDir = os.homedir();

function _stripSensitiveInfo(message) {
    message = message || '';
    // remove sensitive user path info from stack
    message = nodeSrcPath && message.replace(nodeSrcPath, '');// this should be first in order due to a windows path quirk
    message = nodeBinPath && message.replace(nodeBinPath, '');
    message = userHomeDir && message.replace(userHomeDir, '');
    return message;
}

function _sendError(err, type) {
    err.stack = err.stack || "";
    savedConsoleLog(COMMAND_ERROR_PREFIX + JSON.stringify({
        message: _stripSensitiveInfo(err.message),
        stack: _stripSensitiveInfo(err.stack),
        code: err.code,
        type: type
    }) + "\n");
}

process.on('unhandledRejection', (reason, promise) => {
    // we dont exit here.
    console.error('Unhandled PhNode Promise Rejection:', reason);
    _sendError(reason, "unhandledRejection");
});
process.on('uncaughtException', (error) => {
    // we dont exit here.
    console.error('Uncaught PhNode Exception:', error);
    _sendError(error, "uncaughtException");
});

// In the child process
process.on('disconnect', () => {
    console.log('Parent process exited, exiting.');
    process.exit(1);
});

rl.on('close', () => {
    console.log('Parent input stream is closed');
    process.exit(1);
});

// Opt-in watchdog for test processes; disabled by default. node-loader.js arms
// it for Phoenix.isTestWindow, and SpecRunnerUtils refreshes the runner and its
// test window. Normal editor sessions never send setIdleExit.
//
// Tauri owns this process and holds stdin open after the spawning page goes away.
// A terminate command sent during beforeunload can be lost, leaving Node and its
// LSP servers running. Test runs accept timeout-based cleanup for these orphans.
// Keep this disabled in normal editor sessions: sleep, page suspension or long
// pauses can stop heartbeats even though the page still exists. Expiry can then
// trigger a Node crash dialog after wake. Earlier heartbeat/socket orphan checks
// were removed for sleep-related crashes in a1e660cb5 and ba5800d93.
let _idleExitMs = 0;
let _idleExitTimer = null;

function _shutdown(reason) {
    CliConnector.close();
    lmdb.dumpDBToFileAndCloseDB()
        .catch(console.error)
        .finally(() => {
            console.log(reason);
            process.exit(0);
        });
}

function _refreshIdleExit() {
    if (!_idleExitMs) {
        return;
    }
    if (_idleExitTimer) {
        clearTimeout(_idleExitTimer);
    }
    _idleExitTimer = setTimeout(() => {
        _shutdown(`No command for ${_idleExitMs}ms, the page that spawned us is gone.`);
    }, _idleExitMs);
    // never let this timer alone hold the process up
    if (_idleExitTimer.unref) {
        _idleExitTimer.unref();
    }
}

function processCommand(line) {
    try{
        let jsonCmd = JSON.parse(line);
        // any command at all is proof the page is still there
        _refreshIdleExit();
        switch (jsonCmd.commandCode) {
        case "setIdleExit":
            _idleExitMs = Number(jsonCmd.commandData) || 0;
            if (!_idleExitMs && _idleExitTimer) {
                clearTimeout(_idleExitTimer);
                _idleExitTimer = null;
            }
            _refreshIdleExit();
            _sendResponse(_idleExitMs, jsonCmd.commandID);
            return;
        case "terminate":
            _shutdown("Node terminated by phcode.");
            return;
        case "ping": _sendResponse("pong", jsonCmd.commandID); return;
        case "setDebugMode":
            debugMode = jsonCmd.commandData;
            if(debugMode) {
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
                    phoenixNodeURL: `ws://localhost:${port}${PHOENIX_NODE_URL}`,
                    isGitHubActions: !!process.env.GITHUB_ACTIONS,
                    staticServerURL: `http://localhost:${port}${PHOENIX_STATIC_SERVER_URL}`,
                    livePreviewCommURL: `ws://localhost:${port}${PHOENIX_LIVE_PREVIEW_COMM_URL}`,
                    autoAuthURL: `http://localhost:${port}${PHOENIX_AUTO_AUTH_URL}`,
                    mediaURL: `http://localhost:${port}${PHOENIX_MEDIA_URL}`
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

const localhostOnly = 'localhost';

const AUTH_CONNECTOR_ID = "ph_auth";
const EVENT_CONNECTED = "connected";
let verificationCode = null;
async function setVerificationCode(code) {
    verificationCode = code;
}
const nodeConnector = NodeConnector.createNodeConnector(AUTH_CONNECTOR_ID, {
    setVerificationCode
});

const ALLOWED_ORIGIN = 'https://account.phcode.dev';
function autoAuth(req, res) {
    const origin = req.headers.origin;
    // localhost dev of loginService is not allowed here to not leak to production. So autoAuth is not available in
    // dev builds.
    const isAllowedOrigin = !origin || (ALLOWED_ORIGIN === origin);
    if(!isAllowedOrigin){
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('Forbidden origin');
        return;
    }
    if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Allow-Private-Network', 'true');
        res.writeHead(204);
        res.end();
        return;
    }
    // Remove '/AutoAuth<rand>' from the beginning of the URL and construct file path
    const url = new URL(req.url, `http://${req.headers.host}`);
    const cleanPath = url.pathname.replace(PHOENIX_AUTO_AUTH_URL, '');
    // Check if the request is for the autoVerifyCode endpoint
    if (cleanPath === `/autoVerifyCode` && req.method === 'GET') {
        origin && res.setHeader('Access-Control-Allow-Origin', origin);
        if(!verificationCode) {
            res.setHeader('Content-Type', 'text/plain');
            res.writeHead(404);
            res.end('Not Found');
            return;
        }
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Allow-Private-Network', 'true');
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ code: verificationCode }));
        verificationCode = null; // verification code is only returned once
    } else if (cleanPath === `/appVerified` && req.method === 'GET') {
        nodeConnector.triggerPeer(EVENT_CONNECTED, "ok");
        origin && res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Allow-Private-Network', 'true');
        res.setHeader('Content-Type', 'application/json');
        res.end("ok");
    } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
    }
}

// Create an HTTP server
const server = http.createServer((req, res) => {
    if (CliConnector.handleRequest(req, res)) { return; }
    if (req.url.startsWith(PHOENIX_STATIC_SERVER_URL)) {
        // Remove '/Static<rand>' from the beginning of the URL and construct file path
        const url = new URL(req.url, `http://${req.headers.host}`);
        const cleanPath = url.pathname.replace(PHOENIX_STATIC_SERVER_URL, '');
        if(cleanPath.startsWith("/externalProject")) {
            // Special Live Preview for External Project Files
            // ------------------------------------------------
            // Overview:
            // - This feature allows for the preview of files that are not part of the current project.
            //   It's specifically for files that users open in the editor but which are outside the scope
            //   of the project being worked on. Useful when users want to quickly view or edit files that are not
            //   part of the project without integrating them into the project's environment.
            return LivePreview.serverExternalProjectResource(req, res);
        }

        const filePath = path.join(__dirname, 'www', cleanPath);
        fs.readFile(filePath, (err, data) => {
            if (err) {
                if (err.code === 'ENOENT' || err.code === 'EISDIR') {
                    // File not found
                    res.writeHead(404);
                    res.end('Not Found');
                } else {
                    // Other server errors
                    res.writeHead(500);
                    res.end('Server Error');
                }
            } else {
                // Successfully read the file
                res.writeHead(200, {
                    'Content-Type': mime.lookup(filePath),
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, PUT, PATCH, DELETE',
                    'Access-Control-Allow-Headers': 'X-Requested-With,content-type',
                    "Cache-Control": "no-store"
                });
                res.end(data);
            }
        });

    } else if (req.url.startsWith(PHOENIX_AUTO_AUTH_URL)) {
        return autoAuth(req, res);
    } else if (req.url.startsWith(PHOENIX_MEDIA_URL)) {
        // Video and audio the editor has opened, streamed from disk with byte
        // range support so the media element can seek. See media-server.js.
        const mediaURL = new URL(req.url, `http://${req.headers.host}`);
        return MediaServer.serveMedia(req, res, mediaURL);
    }else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
    }
});

PhoenixFS.CreatePhoenixFsServer(server, PHOENIX_FS_URL);
NodeConnector.CreateNodeConnectorWSServer(server, PHOENIX_NODE_URL);
// PhoenixFS.setDebugMode(true); // uncomment this line to enable more logging in phoenix fs lib

LivePreview.CreateLivePreviewWSServer(server, PHOENIX_LIVE_PREVIEW_COMM_URL);
CliConnector.attach(server);
process.on("exit", CliConnector.close);
// Start the HTTP server on port 3000
server.listen(0, localhostOnly, () => {
    const port = server.address().port;
    savedConsoleLog('Server Opened on port: ', port);
    savedConsoleLog(`Server running on http://localhost:${port}`);
    savedConsoleLog(`Phoenix node Static Server url is http://localhost:${port}${PHOENIX_STATIC_SERVER_URL}`);
    savedConsoleLog(`Phoenix node tauri FS url is ws://localhost:${port}${PHOENIX_FS_URL}`);
    savedConsoleLog(`Phoenix node connector url is ws://localhost:${port}${PHOENIX_NODE_URL}`);
    savedConsoleLog(`Phoenix live preview comm url is ws://localhost:${port}${PHOENIX_LIVE_PREVIEW_COMM_URL}`);
    savedConsoleLog(`Phoenix AutoAuth url is ws://localhost:${port}${PHOENIX_AUTO_AUTH_URL}`);
    savedConsoleLog(`Phoenix media url is http://localhost:${port}${PHOENIX_MEDIA_URL}`);
    serverPortResolve(port);
});
