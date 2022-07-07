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

/*jslint regexp: true */

/**
 * LiveCSSDocument manages a single CSS source document
 *
 * # EDITING
 *
 * Editing the document will cause the style sheet to be reloaded in the browser,
 * which immediately updates the appearance of the rendered document.
 *
 * # HIGHLIGHTING
 *
 * DOM nodes corresponding to the rule at the current cursor position are highlighted.
 *
 * # EVENTS
 *
 * LiveCSSDocument dispatches these events:
 *  deleted - When the file for the underlying Document has been deleted. The
 *      2nd argument to the listener will be this LiveCSSDocument.
 */
define(function LiveCSSDocumentModule(require, exports, module) {


    var _               = require("thirdparty/lodash"),
        CSSUtils        = require("language/CSSUtils"),
        EventDispatcher = require("utils/EventDispatcher"),
        LiveDocument    = require("LiveDevelopment/MultiBrowserImpl/documents/LiveDocument"),
        PathUtils       = require("thirdparty/path-utils/path-utils");

    /**
     * @constructor
     * @see LiveDocument
     * @param {LiveDevProtocol} protocol The protocol to use for communicating with the browser.
     * @param {function(string): string} urlResolver A function that, given a path on disk, should return
     *     the URL that Live Development serves that path at.
     * @param {Document} doc The Brackets document that this live document is connected to.
     * @param {?Editor} editor If specified, a particular editor that this live document is managing.
     *     If not specified initially, the LiveDocument will connect to the editor for the given document
     *     when it next becomes the active editor.
     */
    var LiveCSSDocument = function LiveCSSDocument(protocol, urlResolver, doc, editor, roots) {
        LiveDocument.apply(this, arguments);

        // Add a ref to the doc since we're listening for change events
        this.doc.addRef();
        this.onChange = this.onChange.bind(this);
        this.onDeleted = this.onDeleted.bind(this);

        this.doc.on("change.LiveCSSDocument", this.onChange);
        this.doc.on("deleted.LiveCSSDocument", this.onDeleted);
        if (editor) {
            this._attachToEditor(editor);
        }
    };

    LiveCSSDocument.prototype = Object.create(LiveDocument.prototype);
    LiveCSSDocument.prototype.constructor = LiveCSSDocument;
    LiveCSSDocument.prototype.parentClass = LiveDocument.prototype;

    EventDispatcher.makeEventDispatcher(LiveCSSDocument.prototype);

    /**
     * @override
     * Closes the live document, terminating its connection to the browser.
     */
    LiveCSSDocument.prototype.close = function () {
        this.doc.off(".LiveCSSDocument");
        this.doc.releaseRef();
        this.parentClass.close.call(this);
    };

    /**
     * When the user edits the file, update the stylesheet in the browser and redraw highlights.
     */
    LiveCSSDocument.prototype._updateBrowser = function () {
        var i,
            docUrl = this.doc.url;

        // Determines whether an url() line contains a relative or absolute URL, and makes
        // the URL absolute to the CSS file if it is relative
        function makeUrlsRelativeToCss(match, quotationMark, url) {
            if (PathUtils.isRelativeUrl(url)) {
                var absUrl = PathUtils.makeUrlAbsolute(url, docUrl);
                return "url(" + quotationMark + absUrl + quotationMark + ")";
            }
            return match;
        }

        for (i = 0; i < this.roots.length; i++) {
            if (docUrl !== this.roots[i].toString()) {
                // if it's not directly included through <link>,
                // reload the original doc
                this.trigger("updateDoc", this.roots[i]);
            } else {
                var docText = this.doc.getText();

                // Replace all occurrences of url() where the URL is relative to the CSS file with
                // an absolute URL so it is relative to the CSS file, not the HTML file (see #11936)
                docText = docText.replace(/\burl\(\s*(["']?)([^)\n]+)\1\s*\)/ig, makeUrlsRelativeToCss);
                this.protocol.setStylesheetText(docUrl, docText);
            }
        }
        this.redrawHighlights();
    };

    /**
     * @override
     * Update the highlights in the browser based on the cursor position.
     */
    LiveCSSDocument.prototype.updateHighlight = function () {
        if (this.isHighlightEnabled() && this.editor) {
            var editor = this.editor,
                selectors = [];
            _.each(this.editor.getSelections(), function (sel) {
                var selector = CSSUtils.findSelectorAtDocumentPos(editor, (sel.reversed ? sel.end : sel.start));
                if (selector) {
                    selectors.push(selector);
                }
            });
            if (selectors.length) {
                this.highlightRule(selectors.join(","));
            } else {
                this.hideHighlight();
            }
        }
    };

    /**
     * @override
     * Returns true if document edits appear live in the connected browser.
     * @return {boolean}
     */
    LiveCSSDocument.prototype.isLiveEditingEnabled = function () {
        return true;
    };

    /** Event Handlers *******************************************************/

    /**
     * @private
     * Handles edits to the document. Updates the stylesheet in the browser.
     * @param {$.Event} event
     * @param {Editor} editor
     * @param {Object} change
     */
    LiveCSSDocument.prototype.onChange = function (event, editor, change) {
        this._updateBrowser();
    };

    /**
     * @private
     * Handles when the associated CSS document is deleted on disk. Removes the
     * stylesheet from the browser and shuts down the live document.
     * @param {$.Event} event
     */
    LiveCSSDocument.prototype.onDeleted = function (event) {
        // TODO Need to add protocol API to remove the stylesheet from the document.
        //CSSAgent.clearCSSForDocument(this.doc);

        // shut down, since our Document is now dead
        this.close();
        this.trigger("deleted", [this]);
    };

    // Only used for unit testing.
    LiveCSSDocument.prototype.getSourceFromBrowser = function () {
        var deferred = new $.Deferred();

        this.protocol.getStylesheetText(this.doc.url)
            .then(function (res) {
                deferred.resolve(res.text);
            }, deferred.reject);

        return deferred.promise();
    };

    // Export the class
    module.exports = LiveCSSDocument;
});
