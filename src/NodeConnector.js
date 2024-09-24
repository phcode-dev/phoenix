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
 * @example
 * ```js
 * const NodeConnector = require('NodeConnector');
 * const XY_NODE_CONNECTOR_ID = 'ext_x_y'; // Use a unique ID
 * let nodeConnector = NodeConnector.createNodeConnector(XY_NODE_CONNECTOR_ID, exports);
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
 * @example
 * ```js
 * const XY_NODE_CONNECTOR_ID = 'ext_x_y'; // Use the same unique ID
 * let nodeConnector = global.createNodeConnector(XY_NODE_CONNECTOR_ID, exports);
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
 * To call a Node.js function from Phoenix, use the `execPeer` method.
 *
 * @example
 * ```js
 * // In `x.js` (Phoenix)
 * const fullPath = await nodeConnector.execPeer('getPWDRelative', 'sub/path.html');
 * ```
 *
 * To execute a Phoenix function from Node.js and transfer binary data, pass an optional ArrayBuffer.
 *
 * @example
 * ```js
 * // In `y.js` (Node.js)
 * const { operationDone, buffer } = await nodeConnector.execPeer('modifyImage', {name:'theHills.png'}, imageAsArrayBuffer);
 * ```
 *
 * ## Event Handling
 *
 * The `NodeConnector` object implements all the APIs supported by `utils/EventDispatcher`. You can trigger and listen
 * to events between Node.js and Phoenix using the `triggerPeer` and (`on`, `one` or `off`) methods.
 *
 * @example
 * ```js
 * // In `y.js` (Node.js)
 * nodeConnector.on('phoenixProjectOpened', (_event, projectPath) => {
 *   console.log(projectPath);
 * });
 *
 * nodeConnector.one('phoenixProjectOpened', (_event, projectPath) => {
 *   console.log(projectPath + "will be received only once");
 * });
 * ```
 *
 * To raise an event from Phoenix to Node.js:
 *
 * @example
 * ```js
 * // In `x.js` (Phoenix)
 * nodeConnector.triggerPeer('phoenixProjectOpened', '/x/project/folder');
 * ```
 *
 * To Switch off events
 * @example
 * ```js
 * nodeConnector.off('phoenixProjectOpened'); // will switch off all event handlers of that name.
 * ```
 *
 * By Default, all events handlers with the eventName is removed when you call `nodeConnector.off(eventName)` fn.
 * To selectively switch off event handlers, please see reference for `utils/EventDispatcher` module.
 *
 * ### Handling ArrayBuffer Data in Function Execution
 *
 * When executing functions that send or receive binary data, ensure that the functions are asynchronous and accept an
 * optional ArrayBuffer as a parameter. To return binary data, use an object with a `buffer` key.
 *
 * Example of calling a function in Node.js with binary data transfer:
 *
 * @example
 * ```js
 * // In `y.js` (Node.js)
 * const { operationDone, buffer } = await nodeConnector.execPeer('modifyImage', {name:'name.png'}, imageArrayBuffer);
 * ```
 *
 * ### Handling ArrayBuffer Data in Event Handling
 *
 * Use the `triggerPeer` method to send binary data in events. Include the ArrayBuffer as an optional parameter.
 *
 * Example of sending binary data in an event from Phoenix to Node.js:
 *
 * @example
 * ```js
 * // In `x.js` (Phoenix)
 * const imageArrayBuffer = getSomeImageArrayBuffer(); // Get the ArrayBuffer
 * nodeConnector.triggerPeer('imageEdited', 'name.png', imageArrayBuffer);
 * ```
 * ## Caveats
 * - Be cautious when sending large binary data, as it may affect performance and memory usage. Transferring large
 *   data is fully supported, but be mindful of performance.
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
     * Returns a NodeConnector Object (which is an EventDispatcher with
     * additional `execPeer` and `triggerPeer` methods. `peer` here means, if you are executing `execPeer`
     * in Phoenix, it will execute the named function in node side, and vice versa. You can right away start
     * using `execPeer`, `triggerPeer`(to send/receive events) APIs without waiting to check if the
     * other side nodeConnector is created.
     *
     * Note: If the NodeConnector has not been created on the other end, requests made with `execPeer` or
     * `triggerPeer` will be temporarily queued for up to 10 seconds to allow time for the connector to be created.
     * If the connector is not created within this timeout period, all queued `execPeer` requests will be rejected,
     * and all queued events will be dropped. It is recommended to call the `createNodeConnector` API on both ends
     * within a timeframe of less than 10 seconds(ideally same time) for seamless communication.
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
     * Checks if Node.js Engine is available. (returns true even if the node instance is terminated)
     *
     * @returns {boolean} Returns true if Node.js Engine is available.
     */
    function isNodeAvailable() {
        return !!window.PhNodeEngine;
    }

    /**
     * Node is available and is ready to exec requests
     * @return {boolean}
     */
    function isNodeReady() {
        return isNodeAvailable() && window.isNodeReady;
    }

    /**
     * Terminate the PhNodeEngine node if it is available. Else does nothing.
     *
     * @return {Promise} promise that resolves when node process is terminated and exits.
     */
    function terminateNode() {
        if(isNodeAvailable()){
            return window.PhNodeEngine.terminateNode();
        }
        return Promise.resolve("Node not available to terminate");
    }

    /**
     * Sets weather to enable node inspector in next boot.
     *
     * @param {boolean} enabled - true to enable, else false.
     */
    function setInspectEnabled(enabled) {
        window.PhNodeEngine.setInspectEnabled(enabled);
    }

    /**
     * Returns whether node inspector is enabled. If node is not present, always returns false.
     *
     * @returns {boolean} True if inspect mode is enabled, false otherwise.
     */
    function isInspectEnabled() {
        if(isNodeAvailable()){
            return window.PhNodeEngine.isInspectEnabled();
        }
        return false;
    }

    /**
     * Retrieves the node inspector port for the Phoenix Node.js engine.
     *
     * @returns {number} The inspection port number.
     */
    function getInspectPort() {
        return window.PhNodeEngine.getInspectPort();
    }

    exports.createNodeConnector = createNodeConnector;
    exports.isNodeAvailable = isNodeAvailable;
    exports.isNodeReady = isNodeReady;
    exports.terminateNode = terminateNode;
    exports.isInspectEnabled = isInspectEnabled;
    exports.setInspectEnabled = setInspectEnabled;
    exports.getInspectPort = getInspectPort;
});
