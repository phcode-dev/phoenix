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

/*jslint forin: true */

/**
 * CSSAgent keeps track of loaded style sheets and allows reloading them
 * from a {Document}.
 *
 * CSSAgent dispatches styleSheetAdded and styleSheetRemoved events, passing
 * the URL for the added/removed style sheet.
 */
define(function CSSAgent(require, exports, module) {


    var _ = require("thirdparty/lodash");

    var Inspector       = require("LiveDevelopment/Inspector/Inspector"),
        EventDispatcher = require("utils/EventDispatcher"),
        PathUtils       = require("thirdparty/path-utils/path-utils");

    /**
     * Stylesheet details
     * @type {Object.<string, CSS.CSSStyleSheetHeader>}
     */
    var _styleSheetDetails = {};

    /**
     * Is getAllStyleSheets() API defined? - This is undefined until we test for API
     * @type {boolean}
     */
    var _getAllStyleSheetsNotFound;

    /**
     * Create a canonicalized version of the given URL, stripping off query strings and hashes.
     * @param {string} url the URL to canonicalize
     * @return the canonicalized URL
     */
    function _canonicalize(url) {
        return PathUtils.parseUrl(url).hrefNoSearch;
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
            _styleSheetDetails = {};
        }
    }

    /**
     * Get the style sheets for a url
     * @param {string} url
     * @return {Object.<string, CSSStyleSheetHeader>}
     */
    function styleForURL(url) {
        var styleSheetId, styles = {};
        url = _canonicalize(url);
        for (styleSheetId in _styleSheetDetails) {
            if (_styleSheetDetails[styleSheetId].canonicalizedURL === url) {
                styles[styleSheetId] = _styleSheetDetails[styleSheetId];
            }
        }
        return styles;
    }

    /**
     * Reload a CSS style sheet from a document
     * @param {Document} document
     * @param {string=} newContent new content of every stylesheet. Defaults to doc.getText() if omitted
     * @return {jQuery.Promise}
     */
    function reloadCSSForDocument(doc, newContent) {
        var styles = styleForURL(doc.url),
            styleSheetId,
            deferreds = [];

        if (newContent === undefined) {
            newContent = doc.getText();
        }
        for (styleSheetId in styles) {
            deferreds.push(Inspector.CSS.setStyleSheetText(styles[styleSheetId].styleSheetId, newContent));
        }
        if (!deferreds.length) {
            console.error("Style Sheet for document not loaded: " + doc.url);
            return new $.Deferred().reject().promise();
        }
        // return master deferred
        return $.when.apply($, deferreds);
    }

    /**
     * Empties a CSS style sheet given a document that has been deleted
     * @param {Document} document
     * @return {jQuery.Promise}
     */
    function clearCSSForDocument(doc) {
        return reloadCSSForDocument(doc, "");
    }

    /**
     * @private
     * @param {jQuery.Event} event
     * @param {header: CSSStyleSheetHeader}
     */
    function _styleSheetAdded(event, res) {
        var url             = _canonicalize(res.header.sourceURL),
            existing        = styleForURL(res.header.sourceURL),
            styleSheetId    = res.header.styleSheetId,
            duplicate;

        // detect duplicates
        duplicate = _.some(existing, function (styleSheet) {
            return styleSheet && styleSheet.styleSheetId === styleSheetId;
        });
        if (duplicate) {
            return;
        }

        _styleSheetDetails[styleSheetId] = res.header;
        _styleSheetDetails[styleSheetId].canonicalizedURL = url; // canonicalized URL

        exports.trigger("styleSheetAdded", url, res.header);
    }

    /**
     * @private
     * @param {jQuery.Event} event
     * @param {styleSheetId: StyleSheetId}
     */
    function _styleSheetRemoved(event, res) {
        var header = _styleSheetDetails[res.styleSheetId];

        delete _styleSheetDetails[res.styleSheetId];

        exports.trigger("styleSheetRemoved", header.canonicalizedURL, header);
    }

    /**
     * @private
     * Attempt to use deleted API CSS.getAllStyleSheets
     * @param {jQuery.Event} event
     * @param {frameId: Network.FrameId}
     */
    function _onFrameStoppedLoading(event, res) {
        var regexChromeUA,
            userAgent,
            uaMatch;

        // Check for undefined so user agent string is only parsed once
        if (_getAllStyleSheetsNotFound === undefined) {
            regexChromeUA = /Chrome\/(\d+)\./;  // Example: "... Chrome/34.0.1847.131 ..."
            userAgent     = Inspector.getUserAgent();
            uaMatch       = userAgent.match(regexChromeUA);

            // If we have user agent string, and Chrome is >= 34, then don't use getAllStyleSheets
            if (uaMatch && parseInt(uaMatch[1], 10) >= 34) {
                _getAllStyleSheetsNotFound = true;
                Inspector.Page.off("frameStoppedLoading.CSSAgent", _onFrameStoppedLoading);
                return;
            }
        }

        // Manually fire getAllStyleSheets since it will be removed from
        // Inspector.json in a future update
        Inspector.send("CSS", "getAllStyleSheets").done(function (res) {
            res.headers.forEach(function (header) {
                // _styleSheetAdded will ignore duplicates
                _getAllStyleSheetsNotFound = false;
                _styleSheetAdded(null, { header: header });
            });
        }).fail(function (err) {
            // Disable getAllStyleSheets if the first call fails
            _getAllStyleSheetsNotFound = (err.code === -32601);
            Inspector.Page.off("frameStoppedLoading.CSSAgent", _onFrameStoppedLoading);
        });
    }

    /** Enable the domain */
    function enable() {
        return Inspector.CSS.enable();
    }

    /** Initialize the agent */
    function load() {
        Inspector.Page.on("frameNavigated.CSSAgent", _onFrameNavigated);
        Inspector.CSS.on("styleSheetAdded.CSSAgent", _styleSheetAdded);
        Inspector.CSS.on("styleSheetRemoved.CSSAgent", _styleSheetRemoved);

        // getAllStyleSheets was deleted beginning with Chrome 34
        if (!_getAllStyleSheetsNotFound) {
            Inspector.Page.on("frameStoppedLoading.CSSAgent", _onFrameStoppedLoading);
        }
    }

    /** Clean up */
    function unload() {
        Inspector.Page.off(".CSSAgent");
        Inspector.CSS.off(".CSSAgent");
    }


    EventDispatcher.makeEventDispatcher(exports);

    // Export public functions
    exports.enable = enable;
    exports.styleForURL = styleForURL;
    exports.reloadCSSForDocument = reloadCSSForDocument;
    exports.clearCSSForDocument = clearCSSForDocument;
    exports.load = load;
    exports.unload = unload;
});
