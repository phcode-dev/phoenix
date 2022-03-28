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

define(function (require, exports, module) {
    "use strict";

    // Load dependent modules
    var EditorManager       = require("editor/EditorManager");

    /**
     * @constructor
     *
     */
    function InlineWidget() {
        var self = this;

        // create the outer wrapper div
        this.htmlContent = window.document.createElement("div");
        this.$htmlContent = $(this.htmlContent).addClass("inline-widget");
        this.$htmlContent.append("<div class='shadow top' />")
            .append("<div class='shadow bottom' />");

        this.$htmlContent.on("keydown", function (e) {
            if (e.keyCode === 27) {
                self.close();
                e.stopImmediatePropagation();
            }
        });
    }
    InlineWidget.prototype.htmlContent = null;
    InlineWidget.prototype.$htmlContent = null;
    InlineWidget.prototype.id = null;
    InlineWidget.prototype.hostEditor = null;

    /**
     * Initial height of inline widget in pixels. Can be changed later via hostEditor.setInlineWidgetHeight()
     * @type {number}
     */
    InlineWidget.prototype.height = 0;

    /**
     * Closes this inline widget and all its contained Editors
     */
    InlineWidget.prototype.close = function () {
        var shouldMoveFocus = this._editorHasFocus();
        EditorManager.closeInlineWidget(this.hostEditor, this, shouldMoveFocus);
        // closeInlineWidget() causes our onClosed() handler to be called
    };

    /**
     * Called any time inline is closed, whether manually or automatically
     */
    InlineWidget.prototype.onClosed = function () {
        // do nothing - base implementation
    };

    /**
     * Called once content is parented in the host editor's DOM. Useful for performing tasks like setting
     * focus or measuring content, which require htmlContent to be in the DOM tree.
     */
    InlineWidget.prototype.onAdded = function () {
        // do nothing - base implementation
    };

    /**
     * @param {Editor} hostEditor
     */
    InlineWidget.prototype.load = function (hostEditor) {
        this.hostEditor = hostEditor;

        // TODO: incomplete impelementation. It's not clear yet if InlineTextEditor
        // will fuction as an abstract class or as generic inline editor implementation
        // that just shows a range of text. See CSSInlineEditor.css for an implementation of load()
    };


    /**
     * Called when the editor containing the inline is made visible.
     */
    InlineWidget.prototype.onParentShown = function () {
        // do nothing - base implementation
    };

    exports.InlineWidget = InlineWidget;

});
