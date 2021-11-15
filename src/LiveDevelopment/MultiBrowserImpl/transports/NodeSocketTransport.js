/*
 * GNU AGPL-3.0 License
 *
 * Modified Work Copyright (c) 2021 - present core.ai . All rights reserved.
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

// This transport provides a WebSocket connection between Brackets and a live browser preview.
// This is just a thin wrapper around the Node extension (NodeSocketTransportDomain) that actually
// provides the WebSocket server and handles the communication. We also rely on an injected script in
// the browser for the other end of the transport.

define(function (require, exports, module) {


    var FileUtils       = require("file/FileUtils"),
        EventDispatcher = require("utils/EventDispatcher"),
        NodeDomain      = require("utils/NodeDomain");

    // The script that will be injected into the previewed HTML to handle the other side of the socket connection.
    var NodeSocketTransportRemote = require("text!LiveDevelopment/MultiBrowserImpl/transports/remote/NodeSocketTransportRemote.js");

    // The node extension that actually provides the WebSocket server.

    var domainPath = FileUtils.getNativeBracketsDirectoryPath() + "/" + FileUtils.getNativeModuleDirectoryPath(module) + "/node/NodeSocketTransportDomain";

    var NodeSocketTransportDomain = new NodeDomain("nodeSocketTransport", domainPath);

    // This must match the port declared in NodeSocketTransportDomain.js.
    // TODO: randomize this?
    var SOCKET_PORT = 8123;

    /**
     * Returns the script that should be injected into the browser to handle the other end of the transport.
     * @return {string}
     */
    function getRemoteScript() {
        return "<script>\n" +
            NodeSocketTransportRemote +
            "this._Brackets_LiveDev_Socket_Transport_URL = 'ws://localhost:" + SOCKET_PORT + "';\n" +
            "</script>\n";
    }

    // Events

    // We can simply retrigger the events we receive from the node domain directly, since they're in
    // the same format expected by clients of the transport.

    ["connect", "message", "close"].forEach(function (type) {
        NodeSocketTransportDomain.on(type, function () {
            console.log("NodeSocketTransport - event - " + type + " - " + JSON.stringify(Array.prototype.slice.call(arguments, 1)));
            // Remove the event object from the argument list.
            exports.trigger(type, Array.prototype.slice.call(arguments, 1));
        });
    });

    EventDispatcher.makeEventDispatcher(exports);

    // Exports
    exports.getRemoteScript = getRemoteScript;

    // Proxy the node domain methods directly through, since they have exactly the same
    // signatures as the ones we're supposed to provide.
    ["start", "send", "close"].forEach(function (method) {
        exports[method] = function () {
            var args = Array.prototype.slice.call(arguments);
            args.unshift(method);
            console.log("NodeSocketTransport - " + args);
            NodeSocketTransportDomain.exec.apply(NodeSocketTransportDomain, args);
        };
    });

});
