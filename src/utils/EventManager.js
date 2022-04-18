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

/**
 * Exposes named events and triggers a named event manager as required.
 * See <doc link here for more details on how to use this API>
 */
define(function (require, exports, module) {

    const _eventHandlerMap = {};
    /**
     * Returns true is an interface of the given name exists.
     * @param {string} handlerName a unique name of the handler.
     * @param {object} eventDispatcher An EventDispatcher that will be used to trigger events.
     * @return {boolean}
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
     */
    function isExistsEventHandler(handlerName) {
        return _eventHandlerMap[handlerName] !== undefined;
    }

    /**
     * Triggers an event on the named event handler.
     * @param handlerName
     * @param eventName
     * @param eventParams Can be a comma seperated list of args or a single argument.
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
