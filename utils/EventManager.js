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
 * The global EventManager can be used to register named EventDispatchers so that events
 * can be triggered from anywhere without using require context.
 *
 * A global `window.EventManager` object is made available in phoenix that can be called anytime after AppStart.
 *
 * ## Usage
 * For Eg. Let's say we have an extension `drawImage` installed that wants to expose custom functionality to phoenix.
 * The Extension will first register named EventHandler like this:
 * ```js
 * // in drawImage/someExtensionModule.js module within the extension, do the following:
 * const EventDispatcher = brackets.getModule("utils/EventDispatcher"),
 * EventManager = brackets.getModule("utils/EventManager");
 * EventDispatcher.makeEventDispatcher(exports);
 *
 * EventManager.registerEventHandler("drawImageHandler", exports);
 * ```
 * Once the event handler is registered, we can trigger events on the named handler anywhere in phoenix
 * (inside or outside the extension) by using:
 *
 * ```js
 * EventManager.triggerEvent("drawImageHandler", "someEventName", "param1", "param2", ...);
 * ```
 * @module utils/EventManager
 */
define(function (require, exports, module) {

    const _eventHandlerMap = {};
    /**
     * Registers a named EventHandler. Event handlers are created using the call:
     * `EventDispatcher.makeEventDispatcher(Command.prototype);`
     *
     * @example <caption>To register a close dialogue event handler in an extension:</caption>
     * // in close-dialogue.js module winthin the extension, do the following:
     * const EventDispatcher = brackets.getModule("utils/EventDispatcher"),
     * EventDispatcher.makeEventDispatcher(exports);
     *
     * EventManager.registerEventHandler("closeDialogueHandler", exports);
     * // Once the event handler is registered, see triggerEvent API on how to raise events
     *
     * @param {string} handlerName a unique name of the handler.
     * @param {object} eventDispatcher An EventDispatcher that will be used to trigger events.
     * @return {boolean}
     * @type {function}
     */
    function registerEventHandler(handlerName, eventDispatcher) {
        if(_eventHandlerMap[handlerName]){
            console.error("Duplicate EventManager registration for event, overwriting event handler: ", handlerName);
        }
        _eventHandlerMap[handlerName] = eventDispatcher;
    }

    /**
     * Returns true is an EventHandler of the given name exists.
     * @param {string} handlerName
     * @return {boolean}
     * @type {function}
     */
    function isExistsEventHandler(handlerName) {
        return _eventHandlerMap[handlerName] !== undefined;
    }

    /**
     * Triggers an event on the named event handler.
     *
     * @example <caption>To trigger an event to the `closeDialogue` event handler registered above</caption>
     * // anywhere in code, do the following:
     * const EventManager = brackets.getModule("utils/EventManager");
     * EventManager.triggerEvent("closeDialogueHandler", "someEvent", "param1", "param2", ...);
     *
     * @param {string} handlerName
     * @param eventName the event name as recognised by the handler. this is usually a string.
     * @param eventParams Can be a comma seperated list of args or a single argument.
     * @type {function}
     */
    function triggerEvent(handlerName, eventName, ...eventParams) {
        let handler = _eventHandlerMap[handlerName];
        if(!handler){
            console.error(`Could not locate handler for: ${handlerName} eventName: ${eventName} event: ${eventParams}`);
            return;
        }
        handler.trigger(eventName, ...eventParams);
    }

    // Public API
    exports.registerEventHandler = registerEventHandler;
    exports.isExistsEventHandler = isExistsEventHandler;
    exports.triggerEvent = triggerEvent;
});
