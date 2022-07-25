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
 * Editor instance helpers for showing error popups. Only to be used from Editor.js.
 */

define(function (require, exports, module) {

    const AnimationUtils     = require("utils/AnimationUtils"),
        PopUpManager = require("widgets/PopUpManager"),
        ViewUtils = require("utils/ViewUtils");
    /**
     * ****** Update actual public API doc in Editor.js *****
     *
     * Display temporary popover message at current cursor position. Display message above
     * cursor if space allows, otherwise below.
     *
     * @param {string} errorMsg Error message to display
     */
    function displayErrorMessageAtCursor(errorMsg) {
        var arrowBelow, cursorPos, cursorCoord, popoverRect,
            top, left, clip, arrowCenter, arrowLeft,
            // eslint-disable-next-line no-invalid-this
            self = this,
            POPOVER_MARGIN = 10,
            POPOVER_ARROW_HALF_WIDTH = 10,
            POPOVER_ARROW_HALF_BASE = POPOVER_ARROW_HALF_WIDTH + 3; // 3 is border radius

        function _removeListeners() {
            self.off(".msgbox");
        }

        // PopUpManager.removePopUp() callback
        function _clearMessagePopover() {
            if (self._$messagePopover && self._$messagePopover.length > 0) {
                // self._$messagePopover.remove() is done by PopUpManager
                self._$messagePopover = null;
            }
            _removeListeners();
        }

        // PopUpManager.removePopUp() is called either directly by this closure, or by
        // PopUpManager as a result of another popup being invoked.
        function _removeMessagePopover() {
            if (self._$messagePopover) {
                PopUpManager.removePopUp(self._$messagePopover);
            }
        }

        function _addListeners() {
            self
                .on("blur.msgbox",           _removeMessagePopover)
                .on("change.msgbox",         _removeMessagePopover)
                .on("cursorActivity.msgbox", _removeMessagePopover)
                .on("update.msgbox",         _removeMessagePopover);
        }

        // Only 1 message at a time
        if (self._$messagePopover) {
            _removeMessagePopover();
        }

        // Make sure cursor is in view
        cursorPos = self.getCursorPos();
        self._codeMirror.scrollIntoView(cursorPos);

        // Determine if arrow is above or below
        cursorCoord = self._codeMirror.charCoords(cursorPos);

        // Assume popover height is max of 2 lines
        arrowBelow = (cursorCoord.top > 100);

        // Text is dynamic, so build popover first so we can measure final width
        self._$messagePopover = $("<div/>").addClass("popover-message").appendTo($("body"));
        if (!arrowBelow) {
            $("<div/>").addClass("arrowAbove").appendTo(self._$messagePopover);
        }
        $("<div/>").addClass("text").appendTo(self._$messagePopover).html(errorMsg);
        if (arrowBelow) {
            $("<div/>").addClass("arrowBelow").appendTo(self._$messagePopover);
        }

        // Estimate where to position popover.
        top = (arrowBelow) ? cursorCoord.top - self._$messagePopover.height() - POPOVER_MARGIN
            : cursorCoord.bottom + POPOVER_MARGIN;
        left = cursorCoord.left - (self._$messagePopover.width() / 2);

        popoverRect = {
            top: top,
            left: left,
            height: self._$messagePopover.height(),
            width: self._$messagePopover.width()
        };

        // See if popover is clipped on any side
        clip = ViewUtils.getElementClipSize($("#editor-holder"), popoverRect);

        // Prevent horizontal clipping
        if (clip.left > 0) {
            left += clip.left;
        } else if (clip.right > 0) {
            left -= clip.right;
        }

        // Popover text and arrow are positioned individually
        self._$messagePopover.css({"top": top, "left": left});

        // Position popover arrow centered over/under cursor...
        arrowCenter = cursorCoord.left - left;

        // ... but don't let it slide off text box
        arrowCenter = Math.min(popoverRect.width - POPOVER_ARROW_HALF_BASE,
            Math.max(arrowCenter, POPOVER_ARROW_HALF_BASE));

        arrowLeft = arrowCenter - POPOVER_ARROW_HALF_WIDTH;
        if (arrowBelow) {
            self._$messagePopover.find(".arrowBelow").css({"margin-left": arrowLeft});
        } else {
            self._$messagePopover.find(".arrowAbove").css({"margin-left": arrowLeft});
        }

        // Add listeners
        PopUpManager.addPopUp(this._$messagePopover, _clearMessagePopover, true);
        _addListeners();

        // Animate open
        AnimationUtils.animateUsingClass(self._$messagePopover[0], "animateOpen").done(function () {
            // Make sure we still have a popover
            if (self._$messagePopover && self._$messagePopover.length > 0) {
                self._$messagePopover.addClass("open");

                // Don't add scroll listeners until open so we don't get event
                // from scrolling cursor into view
                self.on("scroll.msgbox", _removeMessagePopover);

                // Animate closed -- which includes delay to show message
                AnimationUtils.animateUsingClass(self._$messagePopover[0], "animateClose", 6000)
                    .done(_removeMessagePopover);
            }
        });
    }

    exports.displayErrorMessageAtCursor =displayErrorMessageAtCursor;
});
