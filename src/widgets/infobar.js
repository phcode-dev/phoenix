/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 * Original work Copyright (c) 2018 - 2021 Adobe Systems Incorporated. All rights reserved.
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


    var MainViewManager     = require("view/MainViewManager"),
        Mustache            = require("thirdparty/mustache/mustache"),
        EventDispatcher     = require("utils/EventDispatcher"),
        InfoBarHtml         = require("text!htmlContent/infobar-template.html"),
        _                   =  require("thirdparty/lodash");

    EventDispatcher.makeEventDispatcher(exports);

    // Key handlers for buttons in UI
    var ESC_KEY   = 27; // keycode for escape key

    /**
     * Generates the json to be used by Mustache for rendering
     * @param   {object}   msgObj - json object containing message information to be displayed
     * @returns {object} - the generated json object
     */
    function generateJsonForMustache(msgObj) {
        var msgJsonObj = {};
        if (msgObj.type) {
            msgJsonObj.type = "'" + msgObj.type + "'";
        }
        msgJsonObj.title = msgObj.title;
        msgJsonObj.description = msgObj.description;
        return msgJsonObj;
    }
    /**
     * Removes and cleans up the info bar from DOM
     */
    function cleanInfoBar() {
        var $infoBar = $('#info-bar-template');
        if ($infoBar.length > 0) {
            $infoBar.remove();
        }
        $(window.document).off("keydown.InfoBarTemplateDoc");
        $(window).off('resize.InfoBarTemplate');
    }

    /**
     * Displays the Info Bar UI
     * @param   {object} msgObj - json object containing message info to be displayed
     *
     */
    function showInfoBar(msgObj) {
        var jsonToMustache = generateJsonForMustache(msgObj),
            $infoBarElement = $(Mustache.render(InfoBarHtml, jsonToMustache));

        cleanInfoBar(); //Remove an already existing info bar, if any
        $infoBarElement.prependTo(".content");

        var $infoBar = $('#info-bar-template'),
            $infoContent = $infoBar.find('#info-content'),
            $contentContainer = $infoBar.find('#content-container'),
            $iconContainer = $infoBar.find('#icon-container'),
            $closeIconContainer = $infoBar.find('#close-icon-container'),
            $heading = $infoBar.find('#heading'),
            $description = $infoBar.find('#description'),
            $closeIcon = $infoBar.find('#close-icon');

        if ($infoContent.length > 0) {
            if ($infoContent[0].scrollWidth > $infoContent.innerWidth()) {
            //Text has over-flown, show the info content as tooltip message
                if ($contentContainer.length > 0 &&
                        $heading.length > 0 &&
                        $description.length > 0) {
                    $contentContainer.attr("title", $heading.text() + $description.text());
                }
            }
        }
        // Content Container Width between Icon Container and Button Container or Close Icon Container
        // will be assigned when window will be rezied.
        var resizeContentContainer = function () {
            if($infoContent.length > 0 && $contentContainer.length > 0 && $infoBar.length > 0) {
                var newWidth = $infoBar.outerWidth() - 38;
                if($iconContainer.length > 0) {
                    newWidth = newWidth - $iconContainer.outerWidth();
                }
                if($closeIconContainer.length > 0) {
                    newWidth = newWidth - $closeIconContainer.outerWidth();
                }

                $contentContainer.css({
                    "maxWidth": newWidth
                });
            }
        };

        resizeContentContainer();
        $(window).on('resize.InfoBarTemplate', _.debounce(resizeContentContainer, 150));

        //Event handlers on the Info Bar
        // Click and key handlers on Close button
        if ($closeIcon.length > 0) {
            $closeIcon.click(function () {
                cleanInfoBar();
                MainViewManager.focusActivePane();
            });
        }
        $(window.document).on("keydown.InfoBarTemplateDoc", function (event) {
            var code = event.which;
            if (code === ESC_KEY) {
                // Keyboard input of Esc key on Info Bar dismisses and removes the bar
                cleanInfoBar();
                MainViewManager.focusActivePane();
                event.stopImmediatePropagation();
            }
        });
    }
    exports.showInfoBar = showInfoBar;
});
