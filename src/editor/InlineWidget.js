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

define(function (require, exports, module) {


    // Load dependent modules
    var EditorManager       = require("editor/EditorManager"),
        EventDispatcher     = require("utils/EventDispatcher"),
        KeyEvent            = require("utils/KeyEvent");

    /**
     * @constructor
     *
     */
    function InlineWidget() {
        var self = this;

        // create the outer wrapper div
        this.htmlContent = window.document.createElement("div");
        this.$htmlContent = $(this.htmlContent).addClass("inline-widget").attr("tabindex", "-1");
        this.$htmlContent.append("<div class='shadow top' />")
            .append("<div class='shadow bottom' />")
            .append("<a href='#' class='close no-focus'>&times;</a>");

        // create the close button
        this.$closeBtn = this.$htmlContent.find(".close");
        this.$closeBtn.click(function (e) {
            self.close();
            e.stopImmediatePropagation();
        });

        this.$htmlContent.on("keydown", function (e) {
            if (e.keyCode === KeyEvent.DOM_VK_ESCAPE) {
                self.close();
                e.stopImmediatePropagation();
            }
        });
    }
    InlineWidget.prototype.htmlContent = null;
    InlineWidget.prototype.$htmlContent = null;
    InlineWidget.prototype.id = null;
    InlineWidget.prototype.hostEditor = null;
    EventDispatcher.makeEventDispatcher(InlineWidget.prototype);

    /**
     * Initial height of inline widget in pixels. Can be changed later via hostEditor.setInlineWidgetHeight()
     * @type {number}
     */
    InlineWidget.prototype.height = 0;

    /**
     * Closes this inline widget and all its contained Editors
     * @return {$.Promise} A promise that's resolved when the widget is fully closed.
     */
    InlineWidget.prototype.close = function () {
        return EditorManager.closeInlineWidget(this.hostEditor, this);
        // closeInlineWidget() causes our onClosed() handler to be called
    };

    /**
     * @return {boolean} True if any part of the inline widget is focused
     */
    InlineWidget.prototype.hasFocus = function () {
        var focusedItem = window.document.activeElement,
            htmlContent = this.$htmlContent[0];
        return $.contains(htmlContent, focusedItem) || htmlContent === focusedItem;
    };

    /**
     * Called any time inline is closed, whether manually or automatically.
     */
    InlineWidget.prototype.onClosed = function () {
        this.trigger("close");
    };

    /**
     * Called once content is parented in the host editor's DOM. Useful for performing tasks like setting
     * focus or measuring content, which require htmlContent to be in the DOM tree.
     *
     * IMPORTANT: onAdded() MUST be overridden to call hostEditor.setInlineWidgetHeight() at least once to
     * set the initial height (required to animate it open). The widget will never open otherwise.
     */
    InlineWidget.prototype.onAdded = function () {
        this.trigger("add");
    };

    /**
     * @param {Editor} hostEditor
     */
    InlineWidget.prototype.load = function (hostEditor) {
        this.hostEditor = hostEditor;
    };

    /**
     * Called when the editor containing the inline is made visible.
     */
    InlineWidget.prototype.onParentShown = function () {
        // do nothing - base implementation
    };

    /**
     * Called when the parent editor does a full refresh--for example, when the font size changes.
     */
    InlineWidget.prototype.refresh = function () {
        // do nothing - base implementation
    };

    exports.InlineWidget = InlineWidget;

});
