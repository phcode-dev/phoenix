/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 * Original work Copyright (c) 2013 - 2021 Adobe Systems Incorporated. All rights reserved.
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

/*global Phoenix*/

/**
 * Initializes the default brackets menu items.
 */
define(function (require, exports, module) {
    const EditorManager       = require("editor/EditorManager"),
        AppInit             = require("utils/AppInit"),
        MainViewManager      = require("view/MainViewManager"),
        Menus = require("command/Menus"),
        Keys                = require("command/Keys");

    const CONTROL_NAV_OVERLAY_ID = "ctrl-nav-overlay";
    let overlay;

    let lastEditorWithFocus, overlayMode = false;

    function startOverlayMode(targetId) {
        // Find the target div and the overlay div
        if(!targetId){
            targetId = MainViewManager.getActivePaneId() || "first-pane";
        }
        const target = document.getElementById(targetId);

        lastEditorWithFocus = EditorManager.getActiveEditor();
        if (target && overlay) {
            // Get the position and dimensions of the target div
            const rect = target.getBoundingClientRect();
            // Set the overlay div's styles to match the target's dimensions and position
            overlay.style.left = rect.left + 'px';
            overlay.style.top = rect.top + 'px';
            overlay.style.width = rect.width + 'px';
            overlay.style.height = rect.height + 'px';
            overlay.classList.remove('forced-hidden'); // Remove the class that hides the overlay
            overlay.classList.add('hide-cursor'); // Remove the class that hides the overlay
            overlay.focus();
            overlayMode = true;
            document.addEventListener('click', exitOverlayMode, true);
        }
    }

    function exitOverlayMode() {
        const overlay = document.getElementById(CONTROL_NAV_OVERLAY_ID);
        overlay.classList.add('forced-hidden'); // Remove the class that hides the overlay
        overlayMode = false;
        if(lastEditorWithFocus){
            lastEditorWithFocus.focus();
        }
        document.removeEventListener('click', exitOverlayMode, true);
    }

    function processOverlayKeyboardEvent(event) {
        let processed = false;
        switch (event.key) {
        case Keys.KEY.ARROW_UP:
            exitOverlayMode();
            Menus.openMenu();
            processed = true;
            break;
        case Keys.KEY.ESCAPE:
        default:
            exitOverlayMode();
            processed = true;
            break;
        }
        if(processed){
            event.stopPropagation();
            event.preventDefault();
        }
        return processed;
    }

    function isInOverlayMode() {
        return overlayMode;
    }

    AppInit.htmlReady(function () {
        overlay = document.getElementById(CONTROL_NAV_OVERLAY_ID);
    });

    exports.processOverlayKeyboardEvent = processOverlayKeyboardEvent;
    exports.startOverlayMode = startOverlayMode;
    exports.exitOverlayMode = exitOverlayMode;
    exports.isInOverlayMode = isInOverlayMode;
});
