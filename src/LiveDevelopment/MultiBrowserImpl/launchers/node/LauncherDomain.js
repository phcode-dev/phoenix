/*
 * GNU AGPL-3.0 License
 *
 * Modified Work Copyright (c) 2021 - present core.ai . All rights reserved.
 * Original work Copyright (c) 2014 - 2021 Adobe Systems Incorporated. All rights reserved.
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

/*eslint-env node */
/*jslint node: true */


var open = require("opn");

/**
 * @private
 * The Brackets domain manager for registering node extensions.
 * @type {?DomainManager}
 */
var _domainManager;

/**
 * Launch the given URL in the system default browser.
    * TODO: it now launching just on default browser, add launchers for specific browsers.
 * @param {string} url
 */
function _cmdLaunch(url) {
    open(url);
}


/**
 * Initializes the domain and registers commands.
 * @param {DomainManager} domainManager The DomainManager for the server
 */
function init(domainManager) {
    _domainManager = domainManager;
    if (!domainManager.hasDomain("launcher")) {
        domainManager.registerDomain("launcher", {major: 0, minor: 1});
    }
    domainManager.registerCommand(
        "launcher",      // domain name
        "launch",       // command name
        _cmdLaunch,     // command handler function
        false,          // this command is synchronous in Node
        "Launches a given HTML file in the browser for live development",
        [
            { name: "url", type: "string", description: "file:// url to the HTML file" },
            { name: "browser", type: "string", description: "browser name"}
        ],
        []
    );
}

exports.init = init;
