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

/*jslint vars: true, plusplus: true, devel: true, nomen: true, indent: 4, maxerr: 50, node: true */
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
     * Handler for test.reverseAsync command. Reverses the specified string
     * and then returns the result asynconously.
     * @param {string} s String to reverse.
     * @param {Function} cb Callback function of the form cb(err, response)
     */
    function cmdTestReverseAsync(s, cb) {
        var result = s.split("").reverse().join("");
        process.nextTick(function () {
            cb(null, result);
        });
    }

    /**
     * @private
     * Handler for test.reverseAsyncWithProgress command. Reverses the specified string
     * and then returns the result asynconously, but launches progress event before that.
     * @param {string} s String to reverse.
     * @param {Function} cb Callback function of the form cb(err, response)
     * @param {Function} pcb Progress callback function of the form pcb(message)
     */
    function cmdTestReverseAsyncWithProgress(s, cb, pcb) {
        var result = s.split("").reverse().join("");
        process.nextTick(function () {
            pcb("progress");
            process.nextTick(function () {
                cb(null, result);
            });
        });
    }

    /**
     * Initializes the test domain with an additional test command.
     * @param {DomainManager} DomainManager The DomainManager for the server
     */
    function init(DomainManager) {
        _domainManager = DomainManager;
        if (!_domainManager.hasDomain("test")) {
            _domainManager.registerDomain("test", {major: 0, minor: 1});
        }
        _domainManager.registerCommand(
            "test",
            "reverseAsync",
            cmdTestReverseAsync,
            true,
            "reverses the specified string using an async call on the server",
            [{name: "s", type: "string"}],
            [{name: "reversedString", type: "string"}]
        );
        _domainManager.registerCommand(
            "test",
            "reverseAsyncWithProgress",
            cmdTestReverseAsyncWithProgress,
            true,
            "reverses the specified string using an async call on the server and calls a progress event before",
            [{name: "s", type: "string"}],
            [{name: "reversedString", type: "string"}]
        );
    }

    exports.init = init;

}());
