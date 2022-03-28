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
 * ScriptAgent tracks all executed scripts, defines internal breakpoints, and
 * interfaces with the remote debugger.
 */
define(function ScriptAgent(require, exports, module) {


    var Inspector = require("LiveDevelopment/Inspector/Inspector");
    var DOMAgent = require("LiveDevelopment/Agents/DOMAgent");

    var _load; // the load promise
    var _urlToScript; // url -> script info
    var _idToScript; // id -> script info
    var _insertTrace; // the last recorded trace of a DOM insertion

    // TODO: should the parameter to this be an ID rather than a URL?
    /** Get the script information for a given url
     * @param {string} url
     */
    function scriptWithId(url) {
        return _idToScript[url];
    }

    // TODO: Strip off query/hash strings from URL (see CSSAgent._canonicalize())
    /** Get the script information for a given url
     * @param {string} url
     */
    function scriptForURL(url) {
        return _urlToScript[url];
    }

    // DOMAgent Event: Document root loaded
    function _onGetDocument(event, res) {
        Inspector.DOMDebugger.setDOMBreakpoint(res.root.nodeId, "subtree-modified");
        _load.resolve();
    }

    // WebInspector Event: DOM.childNodeInserted
    function _onChildNodeInserted(event, res) {
        // res = {parentNodeId, previousNodeId, node}
        if (_insertTrace) {
            var node = DOMAgent.nodeWithId(res.node.nodeId);
            node.trace = _insertTrace;
            _insertTrace = undefined;
        }
    }

    // TODO: Strip off query/hash strings from URL (see CSSAgent._canonicalize())
    // WebInspector Event: Debugger.scriptParsed
    function _onScriptParsed(event, res) {
        // res = {scriptId, url, startLine, startColumn, endLine, endColumn, isContentScript, sourceMapURL}
        _idToScript[res.scriptId] = res;
        _urlToScript[res.url] = res;
    }

    // WebInspector Event: Debugger.scriptFailedToParse
    function _onScriptFailedToParse(event, res) {
        // res = {url, scriptSource, startLine, errorLine, errorMessage}
    }

    // WebInspector Event: Debugger.paused
    function _onPaused(event, res) {
        // res = {callFrames, reason, data}
        switch (res.reason) {

        // Exception
        case "exception":
            Inspector.Debugger.resume();
            // var callFrame = res.callFrames[0];
            // var script = scriptWithId(callFrame.location.scriptId);
            break;

        // DOMBreakpoint
        case "DOM":
            Inspector.Debugger.resume();
            if (res.data.type === "subtree-modified" && res.data.insertion === true) {
                _insertTrace = res.callFrames;
            }
            break;
        }

    }

    function _reset() {
        _urlToScript = {};
        _idToScript = {};
    }

    /**
     * @private
     * WebInspector Event: Page.frameNavigated
     * @param {jQuery.Event} event
     * @param {frame: Frame} res
     */
    function _onFrameNavigated(event, res) {
        // Clear maps when navigating to a new page, but not if an iframe was loaded
        if (!res.frame.parentId) {
            _reset();
        }
    }

    /** Initialize the agent */
    function load() {
        _reset();
        _load = new $.Deferred();

        var enableResult = new $.Deferred();

        Inspector.Debugger.enable().done(function () {
            Inspector.Debugger.setPauseOnExceptions("uncaught").done(function () {
                enableResult.resolve();
            });
        });

        Inspector.Page.on("frameNavigated.ScriptAgent", _onFrameNavigated);
        DOMAgent.on("getDocument.ScriptAgent", _onGetDocument);
        Inspector.Debugger
            .on("scriptParsed.ScriptAgent", _onScriptParsed)
            .on("scriptFailedToParse.ScriptAgent", _onScriptFailedToParse)
            .on("paused.ScriptAgent", _onPaused);
        Inspector.DOM.on("childNodeInserted.ScriptAgent", _onChildNodeInserted);

        return $.when(_load.promise(), enableResult.promise());
    }

    /** Clean up */
    function unload() {
        _reset();
        Inspector.Page.off(".ScriptAgent");
        DOMAgent.off(".ScriptAgent");
        Inspector.Debugger.off(".ScriptAgent");
        Inspector.DOM.off(".ScriptAgent");
    }

    // Export public functions
    exports.scriptWithId = scriptWithId;
    exports.scriptForURL = scriptForURL;
    exports.load = load;
    exports.unload = unload;
});
