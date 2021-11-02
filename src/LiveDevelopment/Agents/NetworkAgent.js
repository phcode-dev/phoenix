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
 * NetworkAgent tracks all resources loaded by the remote debugger. Use
 * `wasURLRequested(url)` to query whether a resource was loaded.
 */
define(function NetworkAgent(require, exports, module) {


    var Inspector = require("LiveDevelopment/Inspector/Inspector");

    var _urlRequested = {}; // url -> request info

    /** Return the URL without the query string
     * @param {string} URL
     */
    function _urlWithoutQueryString(url) {
        var index = url.search(/[#\?]/);
        if (index >= 0) {
            url = url.substr(0, index);
        }
        return url;
    }

    /** Return the resource information for a given URL
     * @param {string} url
     */
    function wasURLRequested(url) {
        return _urlRequested && _urlRequested[url];
    }

    function _logURL(url) {
        _urlRequested[_urlWithoutQueryString(url)] = true;
    }

    // WebInspector Event: Network.requestWillBeSent
    function _onRequestWillBeSent(event, res) {
        // res = {requestId, frameId, loaderId, documentURL, request, timestamp, initiator, stackTrace, redirectResponse}
        _logURL(res.request.url);
    }

    function _reset() {
        _urlRequested = {};
    }

    // WebInspector Event: Page.frameNavigated
    function _onFrameNavigated(event, res) {
        // res = {frame}
        // Clear log when navigating to a new page, but not if an iframe was loaded
        if (!res.frame.parentId) {
            _reset();
        }
        _logURL(res.frame.url);
    }

    /**
     * Enable the inspector Network domain
     * @return {jQuery.Promise} A promise resolved when the Network.enable() command is successful.
     */
    function enable() {
        return Inspector.Network.enable();
    }

    /** Initialize the agent */
    function load() {
        Inspector.Page.on("frameNavigated.NetworkAgent", _onFrameNavigated);
        Inspector.Network.on("requestWillBeSent.NetworkAgent", _onRequestWillBeSent);
    }

    /** Unload the agent */
    function unload() {
        _reset();
        Inspector.Page.off(".NetworkAgent");
        Inspector.Network.off(".NetworkAgent");
    }

    // Export public functions
    exports.wasURLRequested = wasURLRequested;
    exports.enable = enable;
    exports.load = load;
    exports.unload = unload;
});
