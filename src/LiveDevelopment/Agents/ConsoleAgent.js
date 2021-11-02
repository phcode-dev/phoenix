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

/**
 * ConsoleAgent forwards all console message from the remote console to the
 * local console.
 */
define(function ConsoleAgent(require, exports, module) {


    var Inspector = require("LiveDevelopment/Inspector/Inspector");

    var _lastMessage; // {Console.ConsoleMessage} the last received message

    /** Log a remote message to the local console
     * @param {Console.ConsoleMessage} message
     */
    function _log(message) {
        var level = message.level;
        if (level === "warning") {
            level = "warn";
        }
        var text = "ConsoleAgent: " + message.text;
        if (message.url) {
            text += " (url: " + message.url + ")";
        }
        if (message.stackTrace) {
            var callFrame = message.stackTrace[0];
            text += " in " + callFrame.functionName + ":" + callFrame.columnNumber;
        }
        console[level](text);
    }

    // WebInspector Event: Console.messageAdded
    function _onMessageAdded(event, res) {
        // res = {message}
        _lastMessage = res.message;
        _log(_lastMessage);
    }

    // WebInspector Event: Console.messageRepeatCountUpdated
    function _onMessageRepeatCountUpdated(event, res) {
        // res = {count}
        if (_lastMessage) {
            _log(_lastMessage);
        }
    }

    // WebInspector Event: Console.messagesCleared
    function _onMessagesCleared(event, res) {
        // res = {}
    }

    /**
     * Enable the inspector Console domain
     * @return {jQuery.Promise} A promise resolved when the Console.enable() command is successful.
     */
    function enable() {
        return Inspector.Console.enable();
    }

    /** Initialize the agent */
    function load() {
        Inspector.Console
            .on("messageAdded.ConsoleAgent", _onMessageAdded)
            .on("messageRepeatCountUpdated.ConsoleAgent", _onMessageRepeatCountUpdated)
            .on("messagesCleared.ConsoleAgent", _onMessagesCleared);
    }

    /** Clean up */
    function unload() {
        Inspector.Console.off(".ConsoleAgent");
    }

    // Export public functions
    exports.enable = enable;
    exports.load = load;
    exports.unload = unload;
});
