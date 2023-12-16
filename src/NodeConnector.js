/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 * Original work Copyright (c) 2012 - 2021 Adobe Systems Incorporated. All rights reserved.
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

// @INCLUDE_IN_API_DOCS

/**
 * Node Connector Communication Module
 *
 * This module simplifies communication between Node.js and Phoenix (phcode). A `NodeConnector` acts as an intermediary,
 * allowing you to execute functions in Node.js from Phoenix and vice versa. You can use the `execPeer` method to call
 * functions on the other side and handle communication seamlessly. Use `triggerPeer` to trigger events
 * on the other side.
 *
 * ## Setting Up a `NodeConnector`
 *
 * To establish communication between two modules, such as `x.js` in Phoenix and `y.js` in Node.js, follow these steps:
 *
 * ### Create `NodeConnector` in Phoenix (`x.js`)
 *
 * ```js
 * const NodeConnector = require('NodeConnector');
 * const XY_NODE_CONNECTOR_ID = 'ext_x_y'; // Use a unique ID
 * let nodeConnector;
 *
 * const nodeConnectedPromise = NodeConnector.createNodeConnector(XY_NODE_CONNECTOR_ID, exports).then(connector => {
 *   nodeConnector = connector;
 * });
 *
 * exports.modifyImage = async function(imageName, imageArrayBuffer) {
 *   // Perform image operations with the imageArrayBuffer
 *   // To return an ArrayBuffer, return an object with a `buffer` key.
 *   return {
 *     operationDone: 'colored, cropped',
 *     buffer: imageArrayBuffer,
 *   };
 * };
 * ```
 *
 * ### Create `NodeConnector` in Node.js (`y.js`)
 *
 * ```js
 * const XY_NODE_CONNECTOR_ID = 'ext_x_y'; // Use the same unique ID
 * let nodeConnector;
 *
 * const nodeConnectedPromise = global.createNodeConnector(XY_NODE_CONNECTOR_ID, exports).then(connector => {
 *   nodeConnector = connector;
 * });
 *
 * exports.getPWDRelative = async function(subPath) {
 *   return process.cwd + '/' + subPath;
 * };
 * ```
 *
 * With these steps, a `NodeConnector` is set up, enabling two-way communication.
 *
 * ## Executing Functions
 *
 * To call a Node.js function from Phoenix, use the `execPeer` method. Ensure that `nodeConnector` is set before using it.
 *
 * ```js
 * // In `x.js` (Phoenix)
 * await nodeConnectedPromise;
 * const fullPath = await nodeConnector.execPeer('getPWDRelative', 'sub/path.html');
 * ```
 *
 * To execute a Phoenix function from Node.js and transfer binary data, pass an optional ArrayBuffer.
 *
 * ```js
 * // In `y.js` (Node.js)
 * await nodeConnectedPromise;
 * const { operationDone, buffer } = await nodeConnector.execPeer('modifyImage', {name:'theHills.png'}, imageAsArrayBuffer);
 * ```
 *
 * ## Event Handling
 *
 * The `NodeConnector` object implements all the APIs supported by `utils/EventDispatcher`. You can trigger and listen
 * to events between Node.js and Phoenix using the `triggerPeer` and `on` methods.
 *
 * ```js
 * // In `y.js` (Node.js)
 * nodeConnector.on('phoenixProjectOpened', (_event, projectPath) => {
 *   console.log(projectPath);
 * });
 * ```
 *
 * To raise an event from Phoenix to Node.js:
 *
 * ```js
 * // In `x.js` (Phoenix)
 * nodeConnector.triggerPeer('phoenixProjectOpened', '/x/project/folder');
 * ```
 *
 * To Switch off events
 * ```js
 * nodeConnector.off('phoenixProjectOpened'); // will switch off all event handlers of that name.
 * ```
 *
 * To selectively switch off event handlers, please see reference for `utils/EventDispatcher` module.
 *
 * ### Handling ArrayBuffer Data in Function Execution
 *
 * When executing functions that send or receive binary data, ensure that the functions are asynchronous and accept an
 * optional ArrayBuffer as a parameter. To return binary data, use an object with a `buffer` key.
 *
 * Example of calling a function in Node.js with binary data transfer:
 *
 * ```js
 * // In `y.js` (Node.js)
 * await nodeConnectedPromise;
 * const { operationDone, buffer } = await nodeConnector.execPeer('modifyImage', {name:'name.png'}, imageArrayBuffer);
 * ```
 *
 * ### Handling ArrayBuffer Data in Event Handling
 *
 * Use the `triggerPeer` method to send binary data in events. Include the ArrayBuffer as an optional parameter.
 *
 * Example of sending binary data in an event from Phoenix to Node.js:
 *
 * ```js
 * // In `x.js` (Phoenix)
 * const imageArrayBuffer = getSomeImageArrayBuffer(); // Get the ArrayBuffer
 * nodeConnector.triggerPeer('imageEdited', 'name.png', imageArrayBuffer);
 * ```
 *
 * * ## Caveats
 *
 * - Be cautious when sending large binary data, as it may affect performance and memory usage.
 * - Properly handle exceptions and errors when executing functions to maintain robust communication.
 * - Functions called with `execPeer` and `triggerPeer` must be asynchronous and accept a single argument. An optional
 *   second argument can be used to transfer large binary data as an ArrayBuffer.
 *
 * For more event handling operations and details, refer to the documentation for the `utils/EventDispatcher` module.
 *
 * @module NodeConnector
 */


define(function (require, exports, module) {
    /**
     * Creates a new node connector with the specified ID and module exports.
     *
     * Returns a promise that resolves to an NodeConnector Object (which is an EventDispatcher with
     * additional `execPeer` and `triggerPeer` methods. `peer` here means, if you are executing `execPeer`
     * in Phoenix, it will execute the named function in node side, and vice versa.
     * The promise will be resolved only after a call to `createNodeConnector` on the other side with the
     * same `nodeConnectorID` is made. This is so that once the  promise is resolved, you can right away start
     * two-way communication (exec function, send/receive events) with the other side.
     *
     * - execPeer: A function that executes a peer function with specified parameters.
     * - triggerPeer: A function that triggers an event to be sent to a peer.
     * - Also contains all the APIs supported by `utils/EventDispatcher` module.
     *
     * @param {string} nodeConnectorID - The unique identifier for the new node connector.
     * @param {Object} moduleExports - The exports of the module that contains the functions to be executed on the other side.
     *
     * @returns {{execPeer:function, triggerPeer:function, trigger:function, on:function, off:function, one:function}} - A NodeConnector Object. Also contains all the APIs supported by `utils/EventDispatcher` module.
     *
     * @throws {Error} - If a node connector with the same ID already exists/invalid args passed.
     */
    function createNodeConnector(nodeConnectorID, moduleExports) {
        return window.PhNodeEngine.createNodeConnector(nodeConnectorID, moduleExports);
    }

    /**
     * Checks if Node.js Engine is available.
     *
     * @returns {boolean} Returns true if Node.js Engine is available.
     */
    function isNodeAvailable() {
        return !!window.PhNodeEngine;
    }

    exports.createNodeConnector = createNodeConnector;
    exports.isNodeAvailable = isNodeAvailable;
});
