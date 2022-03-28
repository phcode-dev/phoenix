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

/**
 * Defines hooks to assist with module initialization.
 *
 * This module defines 3 methods for client modules to attach callbacks:
 *    - htmlReady - When the main application template is rendered
 *    - extensionsLoaded - When the extension manager has loaded all extensions
 *    - appReady - When Brackets completes loading all modules and extensions
 *
 * These are *not* jQuery events. Each method is similar to $(document).ready
 * in that it will call the handler immediately if brackets is already done
 * loading.
 */
define(function (require, exports, module) {


    /*
     * Fires when the base htmlContent/main-view.html is loaded
     * @type {string}
     * @const
     */
    var HTML_READY  = "htmlReady";

    /*
     * Fires when all extensions are loaded
     * @type {string}
     * @const
     */
    var APP_READY   = "appReady";

    /*
     * Fires after extensions have been loaded
     * @type {string}
     * @const
     */
    var EXTENSIONS_LOADED = "extensionsLoaded";

    /*
     * Map of each state's trigger
     * @type {Object.<string, boolean>}
     * @private
     */
    var _status      = { HTML_READY: false, APP_READY: false, EXTENSIONS_LOADED: false };

    /*
     * Map of callbacks to states
     * @type {Object.<string, Array.<function()>>}
     * @private
     */
    var _callbacks   = {};

    _callbacks[HTML_READY]        = [];
    _callbacks[APP_READY]         = [];
    _callbacks[EXTENSIONS_LOADED] = [];


    /*
     * calls the specified handler inside a try/catch handler
     * @param {function()} handler - the callback to call
     * @private
     */
    function _callHandler(handler) {
        try {
            // TODO (issue 1034): We *could* use a $.Deferred for this, except deferred objects enter a broken
            // state if any resolution callback throws an exception. Since third parties (e.g. extensions) may
            // add callbacks to this, we need to be robust to exceptions
            handler();
        } catch (e) {
            console.error("Exception when calling a 'brackets done loading' handler: " + e);
            console.log(e.stack);
        }
    }

    /*
     * dispatches the event by calling all handlers registered for that type
     * @param {string} type - the event type to dispatch (APP_READY, EXTENSIONS_READY, HTML_READY)
     * @private
     */
    function _dispatchReady(type) {
        var i,
            myHandlers = _callbacks[type];

        // mark this status complete
        _status[type] = true;

        for (i = 0; i < myHandlers.length; i++) {
            _callHandler(myHandlers[i]);
        }

        // clear all callbacks after being called
        _callbacks[type] = [];
    }

    /*
     * adds a callback to the list of functions to call for the specified event type
     * @param {string} type - the event type to dispatch (APP_READY, EXTENSIONS_READY, HTML_READY)
     * @param {function} handler - callback funciton to call when the event is triggered
     * @private
     */
    function _addListener(type, handler) {
        if (_status[type]) {
            _callHandler(handler);
        } else {
            _callbacks[type].push(handler);
        }
    }

    /**
     * Adds a callback for the ready hook. Handlers are called after
     * htmlReady is done, the initial project is loaded, and all extensions are
     * loaded.
     * @param {function} handler - callback function to call when the event is fired
     */
    function appReady(handler) {
        _addListener(APP_READY, handler);
    }

    /**
     * Adds a callback for the htmlReady hook. Handlers are called after the
     * main application html template is rendered.
     * @param {function} handler - callback function to call when the event is fired
     */
    function htmlReady(handler) {
        _addListener(HTML_READY, handler);
    }

    /**
     * Adds a callback for the extensionsLoaded hook. Handlers are called after the
     * extensions have been loaded
     * @param {function} handler - callback function to call when the event is fired
     */
    function extensionsLoaded(handler) {
        _addListener(EXTENSIONS_LOADED, handler);
    }

    // Public API
    exports.appReady = appReady;
    exports.htmlReady = htmlReady;
    exports.extensionsLoaded = extensionsLoaded;

    exports.HTML_READY = HTML_READY;
    exports.APP_READY = APP_READY;
    exports.EXTENSIONS_LOADED = EXTENSIONS_LOADED;

    // Unit Test API
    exports._dispatchReady = _dispatchReady;
});
