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

/*jslint regexp: true */

/**
 * RemoteAgent defines and provides an interface for custom remote functions
 * loaded from RemoteFunctions. Remote commands are executed via
 * `call(name, varargs)`.
 *
 * Remote events are dispatched as events on this object.
 */
define(function RemoteAgent(require, exports, module) {


    var LiveDevelopment     = require("LiveDevelopment/LiveDevelopment"),
        EventDispatcher     = require("utils/EventDispatcher"),
        Inspector           = require("LiveDevelopment/Inspector/Inspector"),
        RemoteFunctions     = require("text!LiveDevelopment/Agents/RemoteFunctions.js"),
        PreferencesManager  = require("preferences/PreferencesManager");

    var _load; // deferred load
    var _objectId; // the object id of the remote object
    var _intervalId; // interval used to send keepAlive events

    // WebInspector Event: DOM.attributeModified
    function _onAttributeModified(event, res) {
        // res = {nodeId, name, value}
        var matches = /^data-ld-(.*)/.exec(res.name);
        if (matches) {
            exports.trigger(matches[1], res);
        }
    }

    function _call(objectId, method, varargs) {
        console.assert(objectId, "Attempted to call remote method without objectId set.");
        var args = Array.prototype.slice.call(arguments, 2),
            callback,
            deferred = new $.Deferred();

        // if the last argument is a function it is the callback function
        if (typeof args[args.length - 1] === "function") {
            callback = args.pop();
        }

        // Resolve node parameters
        args = args.map(function (arg) {
            if (arg && arg.nodeId) {
                return arg.resolve();
            }

            return arg;
        });

        $.when.apply(undefined, args).done(function onResolvedAllNodes() {
            var params = [];

            args.forEach(function (arg) {
                if (arg.objectId) {
                    params.push({objectId: arg.objectId});
                } else {
                    params.push({value: arg});
                }
            });

            Inspector.Runtime.callFunctionOn(objectId, method, params, undefined, callback)
                .then(deferred.resolve, deferred.reject);
        });

        return deferred.promise();
    }

    /** Call a remote function
     * The parameters are passed on to the remote functions. Nodes are resolved
     * and sent as objectIds.
     * @param {string} function name
     */
    function call(method, varargs) {
        var argsArray = [_objectId, "_LD." + method];

        if (arguments.length > 1) {
            argsArray = argsArray.concat(Array.prototype.slice.call(arguments, 1));
        }

        return _call.apply(null, argsArray);
    }

    function _stopKeepAliveInterval() {
        if (_intervalId) {
            window.clearInterval(_intervalId);
            _intervalId = null;
        }
    }

    function _startKeepAliveInterval() {
        _stopKeepAliveInterval();

        _intervalId = window.setInterval(function () {
            call("keepAlive");
        }, 1000);
    }

    // WebInspector Event: Page.frameNavigated
    function _onFrameNavigated(event, res) {
        // res = {frame}
        // Re-inject RemoteFunctions when navigating to a new page, but not if an iframe was loaded
        if (res.frame.parentId) {
            return;
        }

        _stopKeepAliveInterval();

        // inject RemoteFunctions
        var command = "window._LD=" + RemoteFunctions + "(" + JSON.stringify(LiveDevelopment.config) + "," + PreferencesManager.get("livedev.wsPort") + ");";

        Inspector.Runtime.evaluate(command, function onEvaluate(response) {
            if (response.error || response.wasThrown) {
                _load.reject(response.error);
            } else {
                _objectId = response.result.objectId;
                _load.resolve();

                _startKeepAliveInterval();
            }
        });
    }

    /** Initialize the agent */
    function load() {
        _load = new $.Deferred();
        Inspector.Page.on("frameNavigated.RemoteAgent", _onFrameNavigated);
        Inspector.Page.on("frameStartedLoading.RemoteAgent", _stopKeepAliveInterval);
        Inspector.DOM.on("attributeModified.RemoteAgent", _onAttributeModified);

        return _load.promise();
    }

    /** Clean up */
    function unload() {
        Inspector.Page.off(".RemoteAgent");
        Inspector.DOM.off(".RemoteAgent");
        _stopKeepAliveInterval();
    }


    EventDispatcher.makeEventDispatcher(exports);

    // Export public functions
    exports.call = call;
    exports.load = load;
    exports.unload = unload;
});
