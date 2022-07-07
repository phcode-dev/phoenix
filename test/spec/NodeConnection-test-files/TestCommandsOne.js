/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 * Original work Copyright (c) 2013 - 2021 Adobe Systems Incorporated. All rights reserved.
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

/*jslint vars: true, plusplus: true, devel: true, nomen: true, indent: 4,
maxerr: 50, node: true */
/*global */

(function () {
    "use strict";

    /**
     * @private
     * @type {DomainManager}
     * The DomainManager passed in at init.
     */
    var _domainManager = null;

    /**
     * @private
     * Handler for test.reverse command. Reverses the specified string
     * @param {string} s String to reverse.
     * @return {string} Reversed string
     */
    function cmdTestReverse(s) {
        return s.split("").reverse().join("");
    }

    /**
     * @private
     * Handler for test.log command. Calls console.log.
     * @param {string} s String to log
     */
    function cmdTestLog(s) {
        console.log(s);
    }

    /**
     * @private
     * Handler for test.raiseException command. Raises an exception.
     * @param {string} m Message for the Error object that is raised.
     */
    function cmdRaiseException(m) {
        throw new Error(m);
    }

    /**
     * @private
     * Emit eventOne
     */
    function emitEventOne() {
        _domainManager.emitEvent("test", "eventOne", ["foo", "bar"]);
    }

    /**
     * @private
     * Emit eventTwo
     */
    function emitEventTwo() {
        _domainManager.emitEvent("test", "eventOne", ["foo", "bar"]);
    }

    /**
     * Initializes the test domain with several test commands.
     * @param {DomainManager} DomainManager The DomainManager for the server
     */
    function init(DomainManager) {
        _domainManager = DomainManager;
        if (!_domainManager.hasDomain("test")) {
            _domainManager.registerDomain("test", {major: 0, minor: 1});
        }
        _domainManager.registerCommand(
            "test",
            "reverse",
            cmdTestReverse,
            false,
            "reverses the specified string",
            [{name: "s", type: "string"}],
            [{name: "reversedString", type: "string"}]
        );
        _domainManager.registerCommand(
            "test",
            "log",
            cmdTestLog,
            false,
            "calls console.log with the specified message",
            [{name: "message", type: "string"}],
            [] // no return
        );
        _domainManager.registerCommand(
            "test",
            "raiseException",
            cmdRaiseException,
            false,
            "raises a new exception with the specified message",
            [{name: "message", type: "string"}],
            [] // no return
        );
        _domainManager.registerEvent(
            "test",
            "eventOne",
            [
                {name: "argOne", type: "string"},
                {name: "argTwo", type: "string"}
            ]
        );
        _domainManager.registerEvent(
            "test",
            "eventTwo",
            [
                {name: "argOne", type: "boolean"},
                {name: "argTwo", type: "boolean"}
            ]
        );
        _domainManager.registerCommand(
            "test",
            "emitEventOne",
            emitEventOne,
            false,
            "emit eventOne"
        );
        _domainManager.registerCommand(
            "test",
            "emitEventTwo",
            emitEventTwo,
            false,
            "emit eventTwo"
        );
    }

    exports.init = init;

}());
