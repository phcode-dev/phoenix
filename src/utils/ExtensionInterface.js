/*
 * GNU AGPL-3.0 License
 *
 * Modified Work Copyright (c) 2021 - present core.ai . All rights reserved.
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

/*global less */
// jshint ignore: start

/**
 * ExtensionInterface defines utility methods for communicating between extensions safely.
 * See <doc link here for more details on how to use this API>
 */
define(function (require, exports, module) {
    const EVENT_EXTENSION_INTERFACE_REGISTERED = "extensionInterfaceRegistered";

    let EventDispatcher = require("utils/EventDispatcher");

    let _extensionInterfaceMap = {};

    /**
     * Registers a named extension interface. Will overwrite if an interface of the same name is already present.
     * @param {string} extensionInterfaceName
     * @param {Object} interfaceObject
     */
    function registerExtensionInterface(extensionInterfaceName, interfaceObject) {
        _extensionInterfaceMap[extensionInterfaceName] = interfaceObject;
        exports.trigger(EVENT_EXTENSION_INTERFACE_REGISTERED, extensionInterfaceName, interfaceObject);
    }

    /**
     * Returns true is an interface of the given name exists.
     * @param {string} extensionInterfaceName
     * @return {boolean}
     */
    function isExistsExtensionInterface(extensionInterfaceName) {
        return _extensionInterfaceMap[extensionInterfaceName] !== undefined;
    }

    /**
     * Returns a promise that gets resolved only when an ExtensionInterface of the given name is registered. Use this
     * getter to get hold of extensions interface predictably.
     * @param extensionInterfaceName
     * @return {Promise}
     */
    function waitAndGetExtensionInterface(extensionInterfaceName) {
        return new Promise((resolve, reject)=>{
            let registrationEventHandler = function (event, registeredInterfaceName, interfaceObj) {
                if(registeredInterfaceName === extensionInterfaceName){
                    exports.off(EVENT_EXTENSION_INTERFACE_REGISTERED, registrationEventHandler);
                    resolve(interfaceObj);
                }
            };
            exports.on(EVENT_EXTENSION_INTERFACE_REGISTERED, registrationEventHandler);
        });
    }

    EventDispatcher.makeEventDispatcher(exports);
    // Public API
    exports.registerExtensionInterface = registerExtensionInterface;
    exports.waitAndGetExtensionInterface = waitAndGetExtensionInterface;
    exports.isExistsExtensionInterface = isExistsExtensionInterface;
    // Events
    exports.EVENT_EXTENSION_INTERFACE_REGISTERED = EVENT_EXTENSION_INTERFACE_REGISTERED;
});
