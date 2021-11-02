/*
 * GNU AGPL-3.0 License
 *
 * Modified Work Copyright (c) 2021 - present core.ai . All rights reserved.
 * Original work Copyright (c) 2017 - 2021 Adobe Systems Incorporated. All rights reserved.
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
 * WebSocketTransportDomain creates a websocket server for Live Preview
 * It receives the message containing tagID from the Remote Client(onClick)
 * and emits an event which is listened by WebSocketTransport which
 * brings the cursor to the tag corresponding to that particular tagID
 */

/*eslint-env node */
/*jslint node: true */


var WebSocketServer = require("ws").Server;

/**
 * @private
 * The WebSocket server we listen for incoming connections on.
 * @type {?WebSocketServer}
 */
var _wsServer;

/**
 * @private
 * The Brackets domain manager for registering node extensions.
 * @type {?DomainManager}
 */
var _domainManager;

/**
 * @private
 * Creates the WebSocketServer and handles incoming connections.
 */
function _createServer(socketPort) {
    if (!_wsServer) {
        // TODO: make port configurable, or use random port
        _wsServer = new WebSocketServer({port: socketPort});
        _wsServer.on("connection", function (ws) {
            ws.on("message", function (msg) {
                console.log("WebSocketServer - received - " + msg);
                var msgObj;
                try {
                    msgObj = JSON.parse(msg);
                } catch (e) {
                    console.error("webSocketTransport: Error parsing message: " + msg);
                    return;
                }

                if (msgObj.type === "message") {
                    _domainManager.emitEvent("webSocketTransport", "message", msgObj.message);
                } else {
                    console.error("webSocketTransport: Got bad socket message type: " + msg);
                }
            }).on("error", function (e) {
                console.error("webSocketTransport: Error on socket : " + e);
            }).on("close", function () {
                console.log("webSocketTransport closed");
            });
        }).on("error", function (e) {
            console.error("webSocketTransport: Error on live preview server creation: " + e);
        });
    }
}

/**
 * Initializes the socket server.
 * @param {number} port
 */
function _cmdStart(port) {
    _createServer(port);
}

/**
 * Kill the WebSocketServer
 */
function _cmdClose() {
    if (_wsServer) {
        _wsServer.close();
        _wsServer = null;
    }
}

/**
 * Initializes the domain and registers commands.
 * @param {DomainManager} domainManager The DomainManager for the server
 */
function init(domainManager) {
    _domainManager = domainManager;
    if (!domainManager.hasDomain("webSocketTransport")) {
        domainManager.registerDomain("webSocketTransport", {major: 0, minor: 1});
    }

    domainManager.registerEvent(
        "webSocketTransport",
        "message",
        [
            {
                name: "msg",
                type: "string",
                description: "JSON message from client page"
            }
        ]
    );

    domainManager.registerCommand(
        "webSocketTransport",       // domain name
        "start",                    // command name
        _cmdStart,                  // command handler function
        false,                      // this command is synchronous in Node
        "Creates the WS server",
        [
            {
                name: "port",
                type: "number",
                description: "Port on which server needs to listen"
            }
        ],
        []
    );

    domainManager.registerCommand(
        "webSocketTransport",       // domain name
        "close",                    // command name
        _cmdClose,                  // command handler function
        false,                      // this command is synchronous in Node
        "Kills the websocket server",
        []
    );
}

exports.init = init;
