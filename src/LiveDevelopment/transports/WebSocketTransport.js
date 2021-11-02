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
 * This transport provides a WebSocket connection between Brackets and a live browser preview.
 * This is just a thin wrapper around the Node extension (WebSocketTransportDomain) that actually
 * provides the WebSocket server and handles the communication. We also rely on an injected script in
 * the browser for the other end of the transport.
 */

define(function (require, exports, module) {


    var FileUtils           = require("file/FileUtils"),
        NodeDomain          = require("utils/NodeDomain"),
        EditorManager       = require("editor/EditorManager"),
        HTMLInstrumentation = require("language/HTMLInstrumentation");

    // The node extension that actually provides the WebSocket server.

    var domainPath = FileUtils.getNativeBracketsDirectoryPath() + "/" + FileUtils.getNativeModuleDirectoryPath(module) + "/node/WebSocketTransportDomain";

    var WebSocketTransportDomain = new NodeDomain("webSocketTransport", domainPath);

    // Events

    WebSocketTransportDomain.on("message", function (obj, message) {
        console.log("WebSocketTransport - event - message" + " - " + message);
        var editor = EditorManager.getActiveEditor(),
            position = HTMLInstrumentation.getPositionFromTagId(editor, parseInt(message, 10));
        if (position) {
            editor.setCursorPos(position.line, position.ch, true);
        }
    });

    function createWebSocketServer(port) {
        WebSocketTransportDomain.exec("start", parseInt(port, 10));
    }

    function closeWebSocketServer() {
        WebSocketTransportDomain.exec("close");
    }

    exports.createWebSocketServer = createWebSocketServer;
    exports.closeWebSocketServer  = closeWebSocketServer;
});
