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

// @INCLUDE_IN_API_DOCS

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

    let _popUps = [], addPopupInProgress = false,
        currentEventPopups = [];

    /**
     * Add Esc key handling for a popup DOM element.
     *
     * @param {!jQuery} $popUp jQuery object for the DOM element pop-up
     * @param {function} removeHandler Pop-up specific remove (e.g. display:none or DOM removal)
     * @param {?Boolean} autoRemove - Specify true to indicate the PopUpManager should
     *      remove the popup from the _popUps array when the popup is closed. Specify false
     *      when the popup is always persistant in the _popUps array.
     * @param {object} options
     * @param {boolean} [options.popupManagesFocus] - set to true if the popup manages focus restore on close
     * @param {boolean} [options.closeCurrentPopups] - set to true if you want to dismiss all exiting popups before
     *              adding this. Useful when this should be the only popup visible.
     *
     */
    function addPopUp($popUp, removeHandler, autoRemove, options) {
        autoRemove = autoRemove || false;
        options = options || {};
        addPopupInProgress = true;
        if(options.closeCurrentPopups) {
            closeAllPopups();
        }
        const popupManagesFocus = options.popupManagesFocus || false;

        _popUps.push($popUp[0]);
        $popUp.data("PopUpManager-autoRemove", autoRemove);
        $popUp.data("PopUpManager-popupManagesFocus", popupManagesFocus);
        $popUp.data("PopUpManager-removeHandler", removeHandler);
        addPopupInProgress = false;
    }

    function handleSelectionEvents($popUp, options = {}) {
        const {keyboardEventHandler, enableSearchFilter} = options;
        currentEventPopups.push({
            $popUp,
            keyboardEventHandler,
            enableSearchFilter
        });
        if(currentEventPopups.length > 1){
            console.error(`${currentEventPopups.length} popups are visible while handling keyboard events!`,
                "Possible popup event handler leak. Only 1 popup event handler is expected at this time.");
        }
        if(enableSearchFilter && !$popUp.find(".sticky-li-top").length) {
            $popUp.prepend(
                `<li class="sticky-li-top forced-hidden">
                    <a class='stylesheet-link'><i class="fa fa-search" aria-hidden="true"></i>&nbsp;&nbsp;
                    <span class="searchTextSpan"></span></a>
                </li>`);
        }
        $popUp.off("keydown", _processSelectionEvent);
        $popUp.on("keydown", _processSelectionEvent);
        $popUp.focus();
        function _selectItem() {
            $popUp.find(".selected").removeClass("selected");
            $(this).addClass("selected");
        }
        function _unselectItem() {
            $(this).removeClass("selected");
        }
        $popUp
            .off("mouseenter", "a", _selectItem)
            .off("mouseleave", "a", _unselectItem);
        $popUp
            .on("mouseenter", "a", _selectItem)
            .on("mouseleave", "a", _unselectItem);
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
        let popupManagesFocus = $popUp.data("PopUpManager-popupManagesFocus");
        if(!popupManagesFocus && !addPopupInProgress){
            // We need to have a focus manager to correctly manage focus
            // between editors and other UI elements.
            // For now we set focus here if the popup doesnt manage the focus itself
            MainViewManager.focusActivePane();
        }

        let handlerIndex = currentEventPopups.findIndex(item => item.$popUp.is($popUp));
        if(handlerIndex >= 0){
            currentEventPopups.splice(handlerIndex, 1);
            searchStr = "";
            $popUp.off("keydown", _processSelectionEvent);
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
     * @private
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

                    removePopUp($popUp);
                    return true;
                }

                break;
            }
        }
    }

    let searchStr ="";
    /**
     * hides all elements in popup that doesn't match the given search string, also shows the search bar in popup
     * @param $popup
     * @param searchString
     */
    function _filterDropdown($popup, searchString) {
        searchStr = searchString;
        const $stickyLi = $popup.find('li.sticky-li-top');
        if(!$stickyLi.length){
            console.error("Search filter element not found! Please call" +
                " PopUpManager.handleSelectionEvents with enableSearchFilter option.");
            return;
        }
        if(searchString){
            $stickyLi.removeClass("forced-hidden");
        } else {
            $stickyLi.addClass("forced-hidden");
        }

        $popup.find('li').each(function(index, li) {
            if(index === 0){
                // this is the top search box itself
                return;
            }
            const $li = $(li);
            if(!$li.text().toLowerCase().includes(searchString.toLowerCase())){
                $li.addClass("forced-hidden");
            } else {
                $li.removeClass("forced-hidden");
            }
        });

        if(searchString) {
            $stickyLi.removeClass('forced-hidden');
            $stickyLi.find('.searchTextSpan').text(searchString);
        } else {
            $stickyLi.addClass('forced-hidden');
        }
    }


    /**
     * Selects the next or previous item in the popup.
     * @param {number} direction  +1 for next, -1 for prev
     * @param $popUp
     */
    function selectNextItem(direction, $popUp) {
        const $selectedItem = $popUp.find(".selected");
        let $links   = $popUp.find("a:visible").not(function() {
                return $(this).closest('.sticky-li-top').length > 0;
            }),
            nextIndex    = 0;
        const selectedIndex = $links.index($selectedItem);
        if(selectedIndex >= 0){
            // the selected item is visible, move from this index
            nextIndex = (selectedIndex + direction) % $links.length;
        } else if(direction === -1) {
            // nothing is selected and reverse direction, select the last element
            nextIndex = $links.length - 1;
        } else {
            // nothing is selected, select the first element
            nextIndex = 0;
        }
        if(searchStr && $links.length === 0){
            // no search result, only the top search field visible
            return;
        }

        const $newItem = $links.eq(nextIndex);
        if ($selectedItem) {
            $selectedItem.removeClass("selected");
        }
        $newItem.addClass("selected");
    }

    function _processSelectionEvent(event) {
        const {$popUp, keyboardEventHandler} = currentEventPopups[currentEventPopups.length - 1];
        if(!$popUp || !$popUp.is(":visible")){
            return false;
        }
        if(keyboardEventHandler) {
            const processed = keyboardEventHandler(event, $popUp);
            if(processed){
                return true;
            }
        }
        var keyHandled = false;

        switch (event.keyCode) {
        case KeyEvent.DOM_VK_UP:
            selectNextItem(-1, $popUp);
            keyHandled = true;
            break;
        case KeyEvent.DOM_VK_DOWN:
            selectNextItem(+1, $popUp);
            keyHandled = true;
            break;
        case KeyEvent.DOM_VK_ENTER:
        case KeyEvent.DOM_VK_RETURN:
            const $dropdownItem = $popUp.find(".selected");
            if ($dropdownItem) {
                $dropdownItem.trigger("click");
            }
            keyHandled = true;
            break;
        }

        if(keyHandled){
            event.stopImmediatePropagation();
            event.preventDefault();
            return keyHandled;
        } else if((event.ctrlKey || event.metaKey) && event.key === 'v') {
            Phoenix.app.clipboardReadText().then(text=>{
                searchStr += text;
                _filterDropdown($popUp, searchStr);
            });
            keyHandled = true;
        } else if (event.key.length === 1) {
            searchStr += event.key;
            keyHandled = true;
        } else if (event.key === 'Backspace') {
            // Remove the last character when Backspace is pressed
            searchStr  = searchStr.slice(0, -1);
            keyHandled = true;
        } else {
            // bubble up, not for us to handle
            return false;
        }
        _filterDropdown($popUp, searchStr);

        if (keyHandled) {
            event.stopImmediatePropagation();
            event.preventDefault();
        }
        return keyHandled;
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

        return removeCurrentPopUp(keyEvent);
    }

    /**
     * A menu is being popped up, so remove any menu that is currently popped up
     * @private
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

    function closeAllPopups() {
        removeCurrentPopUp();
    }

    EventDispatcher.makeEventDispatcher(exports);

    exports.addPopUp            = addPopUp;
    exports.handleSelectionEvents = handleSelectionEvents;
    exports.selectNextItem = selectNextItem;
    exports.removePopUp         = removePopUp;
    exports.closeAllPopups      = closeAllPopups;
    exports.listenToContextMenu = listenToContextMenu;
});
