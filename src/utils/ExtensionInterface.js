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

/*global less */
// jshint ignore: start

// @INCLUDE_IN_API_DOCS

/**
 * ExtensionInterface defines utility methods for communicating between extensions safely.
 * A global `window.ExtensionInterface` object is made available in phoenix that can be called anytime after AppStart.
 *
 * ## Usage
 * For Eg. You may have two extensions installed say `angular` extension which has to call functions made available by
 * `angular-cli` Extension.
 *
 * For Making this possible, the `angular-cli` extension makes a named interface available with the ExtensionInterface
 * module and `angular` extension can get hold of the interface as and when the extension gets loaded.
 *
 * @example
 * ```js
 * // in angular-cli extension, make a file say cli-interface.js module within the extension, do the following:
 * const ExtensionInterface = brackets.getModule("utils/ExtensionInterface"),
 * // You can replace exports with any object you want to expose outside the extension really.
 * ExtensionInterface.registerExtensionInterface("angularCli", exports);
 * ```
 * Once the interface is registered, the angular extension can get hold of the interface with the following code
 * (inside or outside the extension) by using:
 *
 * @example
 * ```js
 * let angularCli;
 * ExtensionInterface.waitAndGetExtensionInterface("angularCli").then(interfaceObj=> angularCli = interfaceObj);
 * if(angularCli){ // check if angular cli is avilable
 * angularCli.callSomeFunction();
 * }
 * ```
 *
 * **Note** that the `angularCli` interface is async populated as and when the cli extension is loaded and the
 * interface made available.
 *
 * **NBB:** Do Not use `await waitAndGetExtensionInterface` on tol level require as the module loading might fail.
 *
 * @module utils/ExtensionInterface
 */

define(function (require, exports, module) {
    const EVENT_EXTENSION_INTERFACE_REGISTERED = "extensionInterfaceRegistered";

    /* standard named interfaces registered by default extensions*/
    const _DEFAULT_EXTENSIONS_INTERFACE_NAMES = {
        PHOENIX_LIVE_PREVIEW: "Extn.Phoenix.livePreview"
    };

    let EventDispatcher = require("utils/EventDispatcher");

    let _extensionInterfaceMap = {};

    /**
     * Registers a named extension interface. Will overwrite if an interface of the same name is already present.
     *
     * To register an interface `angularCli`
     * ExtensionInterface.registerExtensionInterface("angularCli", exports);
     *
     * @param {string} extensionInterfaceName
     * @param {Object} interfaceObject
     * @type {function}
     */
    function registerExtensionInterface(extensionInterfaceName, interfaceObject) {
        _extensionInterfaceMap[extensionInterfaceName] = interfaceObject;
        exports.trigger(EVENT_EXTENSION_INTERFACE_REGISTERED, extensionInterfaceName, interfaceObject);
    }

    /**
     * Returns true is an interface of the given name exists.
     * @param {string} extensionInterfaceName
     * @return {boolean}
     * @type {function}
     */
    function isExistsExtensionInterface(extensionInterfaceName) {
        return _extensionInterfaceMap[extensionInterfaceName] !== undefined;
    }

    /**
     * Returns a promise that gets resolved only when an ExtensionInterface of the given name is registered. Use this
     * getter to get hold of extensions interface predictably.
     *
     * To get a registered interface `angularCli`
     * ```js
     * let angularCli;
     * ExtensionInterface.waitAndGetExtensionInterface("angularCli").then(interfaceObj=> angularCli = interfaceObj);
     * if(angularCli){ // check if angular cli is avilable
     * angularCli.callSomeFunction();
     * }
     * ```
     *
     * @param extensionInterfaceName
     * @return {Promise}
     * @type {function}
     */
    function waitAndGetExtensionInterface(extensionInterfaceName) {
        return new Promise((resolve, reject)=>{
            if(isExistsExtensionInterface(extensionInterfaceName)){
                resolve(_extensionInterfaceMap[extensionInterfaceName]);
                return;
            }
            let resolveIfInterfaceRegistered = function (event, registeredInterfaceName, interfaceObj) {
                if(registeredInterfaceName === extensionInterfaceName){
                    exports.off(EVENT_EXTENSION_INTERFACE_REGISTERED, resolveIfInterfaceRegistered);
                    resolve(interfaceObj);
                }
            };
            exports.on(EVENT_EXTENSION_INTERFACE_REGISTERED, resolveIfInterfaceRegistered);
        });
    }

    EventDispatcher.makeEventDispatcher(exports);

    // private API to be used inside phoenix codebase only
    exports._DEFAULT_EXTENSIONS_INTERFACE_NAMES = _DEFAULT_EXTENSIONS_INTERFACE_NAMES;

    // Public API
    exports.registerExtensionInterface = registerExtensionInterface;
    exports.waitAndGetExtensionInterface = waitAndGetExtensionInterface;
    exports.isExistsExtensionInterface = isExistsExtensionInterface;

    // Events
    exports.EVENT_EXTENSION_INTERFACE_REGISTERED = EVENT_EXTENSION_INTERFACE_REGISTERED;
});
