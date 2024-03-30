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
 * This handles the overlay mode
 */
define(function (require, exports, module) {
    const EditorManager       = require("editor/EditorManager"),
        AppInit             = require("utils/AppInit"),
        MainViewManager      = require("view/MainViewManager"),
        Commands            = require("command/Commands"),
        CommandManager      = require("command/CommandManager"),
        Menus = require("command/Menus"),
        Strings     = require("strings"),
        Metrics              = require("utils/Metrics"),
        Keys                = require("command/Keys");

    const CONTROL_NAV_OVERLAY_ID = "ctrl-nav-overlay";
    let overlay;

    let paneToFocusOnExit, overlayMode = false,
        overlayOrderCentralElement, currentOverlayElement;

    function showOverlay(targetId) {
        // Find the target div and the overlay div
        Metrics.countEvent(Metrics.EVENT_TYPE.KEYBOARD, "ctrlx3", "showOverlay");
        if(!targetId){
            console.error("No target ID for selecting overlay. Ignoring");
            return;
        }
        const targetElement = document.getElementById(targetId);

        paneToFocusOnExit = MainViewManager.getActivePaneId();
        if (targetElement && overlay) {
            // Get the position and dimensions of the target div
            const rect = targetElement.getBoundingClientRect();
            // Set the overlay div's styles to match the target's dimensions and position
            overlay.style.left = rect.left + 'px';
            overlay.style.top = rect.top + 'px';
            overlay.style.width = rect.width + 'px';
            overlay.style.height = rect.height + 'px';
            overlay.classList.remove('forced-hidden'); // Remove the class that hides the overlay
            overlay.classList.add('hide-cursor'); // Remove the class that hides the overlay
            overlay.focus();
            overlayMode = true;
            Menus.closeAll();
            document.addEventListener('click', exitOverlayMode, true);
        }
    }

    function startOverlayMode() {
        overlayOrderCentralElement = calculateUINavOrder();
        currentOverlayElement = overlayOrderCentralElement;
        showOverlay(overlayOrderCentralElement.htmlID);
    }

    const ELEM_TYPE_PANE = "pane",
        ELEM_TYPE_TOP_MENU = "topMenu";
    function addElementUp(element, upElement) {
        element.up = upElement;
        upElement.down = element;
    }

    function addElementRight(element, rightElement) {
        element.right = rightElement;
        rightElement.left = element;
    }

    function calculateUINavOrder() {
        const firstPane = {
            type: ELEM_TYPE_PANE,
            htmlID: MainViewManager.FIRST_PANE
        };
        const secondPane = {
            type: ELEM_TYPE_PANE,
            htmlID: MainViewManager.SECOND_PANE
        };
        addElementUp(firstPane, {type: ELEM_TYPE_TOP_MENU});
        const paneLayout = MainViewManager.getLayoutScheme();
        if(paneLayout.rows === 2){
            addElementUp(secondPane, firstPane);
        } else if(paneLayout.columns === 2){
            addElementRight(firstPane, secondPane);
            addElementUp(secondPane, {type: ELEM_TYPE_TOP_MENU});
        }
        const startingPane = MainViewManager.getActivePaneId() || "first-pane";
        if(startingPane === MainViewManager.FIRST_PANE){
            return firstPane;
        }
        return secondPane;
    }

    function exitOverlayMode() {
        const overlay = document.getElementById(CONTROL_NAV_OVERLAY_ID);
        overlay.classList.add('forced-hidden'); // Remove the class that hides the overlay
        overlayMode = false;
        if(paneToFocusOnExit){
            MainViewManager.setActivePaneId(paneToFocusOnExit);
        }
        document.removeEventListener('click', exitOverlayMode, true);
    }

    function processOverlayKeyboardEvent(event) {
        const upElement = currentOverlayElement.up;
        const downElement = currentOverlayElement.down;
        const leftElement = currentOverlayElement.left;
        const rightElement = currentOverlayElement.right;
        switch (event.key) {
        case Keys.KEY.ARROW_UP:
            if(upElement && upElement.type === ELEM_TYPE_TOP_MENU){
                exitOverlayMode();
                Menus.openMenu();
            } else if(upElement && upElement.type === ELEM_TYPE_PANE){
                currentOverlayElement = upElement;
                showOverlay(upElement.htmlID);
            }
            break;
        case Keys.KEY.ARROW_DOWN:
            if(downElement && downElement.type === ELEM_TYPE_PANE){
                currentOverlayElement = downElement;
                showOverlay(downElement.htmlID);
            }
            break;
        case Keys.KEY.ARROW_LEFT:
            if(leftElement && leftElement.type === ELEM_TYPE_PANE){
                currentOverlayElement = leftElement;
                showOverlay(leftElement.htmlID);
            }
            break;
        case Keys.KEY.ARROW_RIGHT:
            if(rightElement && rightElement.type === ELEM_TYPE_PANE){
                currentOverlayElement = rightElement;
                showOverlay(rightElement.htmlID);
            }
            break;
        case Keys.KEY.RETURN:
        case Keys.KEY.ENTER:
            if(currentOverlayElement && currentOverlayElement.type === ELEM_TYPE_PANE){
                MainViewManager.setActivePaneId(currentOverlayElement.htmlID);
                paneToFocusOnExit = MainViewManager.getActivePaneId();
                exitOverlayMode();
            }
            break;
        case Keys.KEY.ESCAPE:
        default:
            exitOverlayMode();
            break;
        }
        event.stopPropagation();
        event.preventDefault();
        return true;
    }

    function isInOverlayMode() {
        return overlayMode;
    }

    AppInit.htmlReady(function () {
        overlay = document.getElementById(CONTROL_NAV_OVERLAY_ID);
        const overlayTextElement = document.getElementById("overlay-instruction-text");
        overlayTextElement.textContent = Strings.KEYBOARD_OVERLAY_TEXT;
    });

    AppInit.appReady(function () {
        CommandManager.register(Strings.CMD_KEYBOARD_NAV_OVERLAY,
            Commands.CMD_KEYBOARD_NAV_UI_OVERLAY, startOverlayMode);
        const viewMenu = Menus.getMenu(Menus.AppMenuBar.VIEW_MENU);
        viewMenu.addMenuItem(Commands.CMD_KEYBOARD_NAV_UI_OVERLAY, 'Ctrl-P',
            Menus.AFTER, Commands.VIEW_TOGGLE_INSPECTION);
    });

    exports.processOverlayKeyboardEvent = processOverlayKeyboardEvent;
    exports.startOverlayMode = startOverlayMode;
    exports.exitOverlayMode = exitOverlayMode;
    exports.isInOverlayMode = isInOverlayMode;
});
