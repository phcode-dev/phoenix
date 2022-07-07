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


    // Load Brackets modules
    var InlineWidget        = brackets.getModule("editor/InlineWidget").InlineWidget;

    // Load tempalte
    var inlineEditorTemplate = require("text!InlineImageViewer.html");

    function InlineImageViewer(fileName, fullPath) {
        this.fileName = fileName;
        this.fullPath = fullPath;
        InlineWidget.call(this);
    }
    InlineImageViewer.prototype = Object.create(InlineWidget.prototype);
    InlineImageViewer.prototype.constructor = InlineImageViewer;
    InlineImageViewer.prototype.parentClass = InlineWidget.prototype;

    InlineImageViewer.prototype.fileName = null;
    InlineImageViewer.prototype.fullPath = null;
    InlineImageViewer.prototype.$wrapperDiv = null;
    InlineImageViewer.prototype.$image = null;

    InlineImageViewer.prototype.load = function (hostEditor) {
        InlineImageViewer.prototype.parentClass.load.apply(this, arguments);

        this.$wrapperDiv = $(inlineEditorTemplate);

        // TODO (jason-sanjose): Use handlebars.js and update template to
        // use expressions instead e.g. {{filename}}
        // Header
        $(this.$wrapperDiv.find("span")).text(this.fileName);

        // Image
        this.$image = $(this.$wrapperDiv.find("img")).attr("src", this.fullPath);

        this.$htmlContent.append(this.$wrapperDiv);
        this.$htmlContent.click(this.close.bind(this));
    };

    InlineImageViewer.prototype.onAdded = function () {
        InlineImageViewer.prototype.parentClass.onAdded.apply(this, arguments);
        window.setTimeout(this._sizeEditorToContent.bind(this));
    };

    InlineImageViewer.prototype._sizeEditorToContent = function () {
        // TODO: image might not be loaded yet--need to listen for load event and update then.
        this.hostEditor.setInlineWidgetHeight(this, this.$wrapperDiv.height() + 20, true);
        this.$image.css("opacity", 1);
    };

    module.exports = InlineImageViewer;
});
