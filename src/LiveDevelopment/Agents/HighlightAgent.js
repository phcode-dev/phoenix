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
 * HighlightAgent dispatches events for highlight requests from in-browser
 * highlight requests, and allows highlighting nodes and rules in the browser.
 *
 * Trigger "highlight" when a node should be highlighted
 */
define(function HighlightAgent(require, exports, module) {


    var DOMAgent        = require("LiveDevelopment/Agents/DOMAgent"),
        EventDispatcher = require("utils/EventDispatcher"),
        Inspector       = require("LiveDevelopment/Inspector/Inspector"),
        LiveDevelopment = require("LiveDevelopment/LiveDevelopment"),
        RemoteAgent     = require("LiveDevelopment/Agents/RemoteAgent"),
        _               = require("thirdparty/lodash");

    var _highlight = {}; // active highlight

    // Remote Event: Highlight
    function _onRemoteHighlight(event, res) {
        var node;
        if (res.value === "1") {
            node = DOMAgent.nodeWithId(res.nodeId);
        }
        exports.trigger("highlight", node);
    }

    /** Hide in-browser highlighting */
    function hide() {
        switch (_highlight.type) {
        case "node":
            Inspector.DOM.hideHighlight();
            break;
        case "css":
            RemoteAgent.call("hideHighlight");
            break;
        }
        _highlight = {};
    }

    /** Highlight a single node using DOM.highlightNode
     * @param {DOMNode} node
     */
    function node(n) {
        if (!LiveDevelopment.config.experimental) {
            return;
        }

        if (!Inspector.config.highlight) {
            return;
        }

        // go to the parent of a text node
        if (n && n.type === 3) {
            n = n.parent;
        }

        // node cannot be highlighted
        if (!n || !n.nodeId || n.type !== 1) {
            return hide();
        }

        // node is already highlighted
        if (_highlight.type === "node" && _highlight.ref === n.nodeId) {
            return;
        }

        // highlight the node
        _highlight = {type: "node", ref: n.nodeId};
        Inspector.DOM.highlightNode(n.nodeId, Inspector.config.highlightConfig);
    }

    /** Highlight all nodes affected by a CSS rule
     * @param {string} rule selector
     */
    function rule(name) {
        if (_highlight.ref === name) {
            return;
        }
        hide();
        _highlight = {type: "css", ref: name};
        RemoteAgent.call("highlightRule", name);
    }

    /** Highlight all nodes with 'data-brackets-id' value
     * that matches id, or if id is an array, matches any of the given ids.
     * @param {string|Array<string>} value of the 'data-brackets-id' to match,
     * or an array of such.
     */
    function domElement(ids) {
        var selector = "";
        if (!Array.isArray(ids)) {
            ids = [ids];
        }
        _.each(ids, function (id) {
            if (selector !== "") {
                selector += ",";
            }
            selector += "[data-brackets-id='" + id + "']";
        });
        rule(selector);
    }

    /**
     * Redraw active highlights
     */
    function redraw() {
        RemoteAgent.call("redrawHighlights");
    }

    /** Initialize the agent */
    function load() {
        if (LiveDevelopment.config.experimental) {
            RemoteAgent.on("highlight.HighlightAgent", _onRemoteHighlight);
        }
    }

    /** Clean up */
    function unload() {
        if (LiveDevelopment.config.experimental) {
            RemoteAgent.off(".HighlightAgent");
        }
    }


    EventDispatcher.makeEventDispatcher(exports);

    // Export public functions
    exports.hide = hide;
    exports.node = node;
    exports.rule = rule;
    exports.domElement = domElement;
    exports.redraw = redraw;
    exports.load = load;
    exports.unload = unload;
});
