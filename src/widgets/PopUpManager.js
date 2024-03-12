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
 * Utilities for managing pop-ups.
 */
define(function (require, exports, module) {


    let AppInit         = require("utils/AppInit"),
        EventDispatcher = require("utils/EventDispatcher"),
        WorkspaceManager = require("view/WorkspaceManager"),
        CommandManager  = require("command/CommandManager"),
        MainViewManager     = require("view/MainViewManager"),
        KeyEvent        = require("utils/KeyEvent");

    let _popUps = [];

    /**
     * Add Esc key handling for a popup DOM element.
     *
     * @param {!jQuery} $popUp jQuery object for the DOM element pop-up
     * @param {function} removeHandler Pop-up specific remove (e.g. display:none or DOM removal)
     * @param {?Boolean} autoRemove - Specify true to indicate the PopUpManager should
     *      remove the popup from the _popUps array when the popup is closed. Specify false
     *      when the popup is always persistant in the _popUps array.
     * @param {object} options
     * @param {boolean} options.popupManagesFocus - set to true if the popup manages focus restore on close
     *
     */
    function addPopUp($popUp, removeHandler, autoRemove, options) {
        autoRemove = autoRemove || false;
        options = options || {};
        const popupManagesFocus = options.popupManagesFocus || false;

        _popUps.push($popUp[0]);
        $popUp.data("PopUpManager-autoRemove", autoRemove);
        $popUp.data("PopUpManager-popupManagesFocus", popupManagesFocus);
        $popUp.data("PopUpManager-removeHandler", removeHandler);
    }

    /**
     * Remove Esc key handling for a pop-up. Removes the pop-up from the DOM
     * if the pop-up is currently visible and was not originally attached.
     *
     * @param {!jQuery} $popUp
     */
    function removePopUp($popUp) {
        // check visible first to help protect against recursive calls
        // via removeHandler
        if ($popUp.find(":visible").length > 0) {
            let removeHandler = $popUp.data("PopUpManager-removeHandler");
            if (removeHandler) {
                removeHandler();
            }
        }

        // check index after removeHandler is done processing to protect
        // against recursive calls
        let index = _popUps.indexOf($popUp[0]);
        if (index >= 0) {
            let autoRemove = $popUp.data("PopUpManager-autoRemove");
            if (autoRemove) {
                $popUp.remove();
                _popUps.splice(index, 1);
            }
        }
    }

    /**
     * Remove Esc key handling for a pop-up. Removes the pop-up from the DOM
     * if the pop-up is currently visible and was not originally attached.
     *
     * @param {KeyboardEvent=} keyEvent (optional)
     */
    function removeCurrentPopUp(keyEvent) {
        // allow the popUp to prevent closing
        let $popUp,
            i,
            event = new $.Event("popUpClose");

        for (i = _popUps.length - 1; i >= 0; i--) {
            $popUp = $(_popUps[i]);

            if ($popUp.find(":visible").length > 0) {
                $popUp.trigger(event);

                if (!event.isDefaultPrevented()) {
                    // Stop the DOM event from propagating
                    if (keyEvent) {
                        keyEvent.stopImmediatePropagation();
                    }

                    let popupManagesFocus = $popUp.data("PopUpManager-popupManagesFocus");
                    removePopUp($popUp);

                    if(!popupManagesFocus){
                        // We need to have a focus manager to correctly manage focus
                        // between editors and other UI elements.
                        // For now we set focus here if the popup doesnt manage the focus itself
                        MainViewManager.focusActivePane();
                    }
                }

                break;
            }
        }
    }

    function _keydownCaptureListener(keyEvent) {
        // Escape key or Alt key (Windows-only)
        if (keyEvent.keyCode !== KeyEvent.DOM_VK_ESCAPE &&
                !(keyEvent.keyCode === KeyEvent.DOM_VK_ALT && brackets.platform === "win")) {
            return;
        }

        // Don't dismiss the popup if both Ctrl and Alt keys are pressed.
        if (keyEvent.keyCode === KeyEvent.DOM_VK_ALT && keyEvent.ctrlKey) {
            return;
        }

        removeCurrentPopUp(keyEvent);
    }

    /**
     * A menu is being popped up, so remove any menu that is currently popped up
     */
    function _beforeMenuPopup() {
        removeCurrentPopUp();
    }

    function _dontToggleWorkspacePanel() {
        for(let popUp of _popUps){
            let $popUp = $(popUp);
            if ($popUp.find(":visible").length > 0) {
                return true;
            }
        }
        return false;
    }

    /**
     * Context menus are also created in AppInit.htmlReady(), so they may not
     * yet have been created when we get our AppInit.htmlReady() callback, so
     * we provide this method to tell us when to start listening for their events
     *
     * @param {ContextMenu} contextMenu
     */
    function listenToContextMenu(contextMenu) {
        contextMenu.on("beforeContextMenuOpen", _beforeMenuPopup);
    }

    AppInit.htmlReady(function () {
        // Register for events
        window.document.body.addEventListener("keydown", _keydownCaptureListener, true);
        exports.on("beforeMenuPopup", _beforeMenuPopup);

        // Close all popups when a command is executed
        CommandManager.on("beforeExecuteCommand", function (event, commandId) {
            removeCurrentPopUp();
        });

        WorkspaceManager.addEscapeKeyEventHandler("PopUpManager", _dontToggleWorkspacePanel);
    });


    EventDispatcher.makeEventDispatcher(exports);

    exports.addPopUp            = addPopUp;
    exports.removePopUp         = removePopUp;
    exports.listenToContextMenu = listenToContextMenu;
});
