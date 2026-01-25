/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
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

/*
 * This file manages the more options context menu.
 * The more options context menu is shown when a tab is right-clicked
 */
define(function (require, exports, module) {
    const CommandManager = require("command/CommandManager");
    const Commands = require("command/Commands");
    const MainViewManager = require("view/MainViewManager");
    const Menus = require("command/Menus");
    const Strings = require("strings");

    // command IDs from working files - we reuse it here with different labels
    // Close Others Above = Close Tabs to the Left
    // Close Others Below = Close Tabs to the Right
    // Close All (in pane) = Close All Tabs
    const FILE_CLOSE_ABOVE = "file.close_above";
    const FILE_CLOSE_BELOW = "file.close_below";
    const FILE_CLOSE_ALL = "file.close_all_in_pane";

    // stores the context of the right-clicked tab (which file, which pane)
    // this is set inside the showMoreOptionsContextMenu. read that func for more details
    let _currentTabContext = { filePath: null, paneId: null };

    /**
     * this function is called before the context menu is shown
     * it updates the menu items based on the current tab context
     * so we only show the relevant options
     */
    function _updateMenuItems() {
        // PIN/UNPIN logic: update label based on current state
        const isPinned = MainViewManager.isPathPinned(
            _currentTabContext.paneId,
            _currentTabContext.filePath
        );

        const pinCommand = CommandManager.get(Commands.FILE_PIN);
        pinCommand.setName(isPinned ? Strings.CMD_FILE_UNPIN : Strings.CMD_FILE_PIN);

        // update Close Above/Below/All labels for TabBar context
        const closeAboveCmd = CommandManager.get(FILE_CLOSE_ABOVE);
        const closeBelowCmd = CommandManager.get(FILE_CLOSE_BELOW);
        const closeAllCmd = CommandManager.get(FILE_CLOSE_ALL);
        closeAboveCmd.setName(Strings.CLOSE_TABS_TO_THE_LEFT);
        closeBelowCmd.setName(Strings.CLOSE_TABS_TO_THE_RIGHT);
        closeAllCmd.setName(Strings.CLOSE_ALL_TABS);

        // Enable/disable Close Left/Right/All based on tab position and pinned files
        const workingSetList = MainViewManager.getWorkingSet(_currentTabContext.paneId);
        const targetIndex = MainViewManager.findInWorkingSet(
            _currentTabContext.paneId,
            _currentTabContext.filePath
        );
        const lastIndex = workingSetList.length - 1;

        // we disable the bulk closing menu items if there are no files to close
        // for 'Close Tabs to the Left', if the first tab is selected or all tabs to the left are pinned
        // for 'Close Tabs to the Right', if the last tab is selected or all tabs to the right are pinned
        // for 'Close All Tabs', if all tabs are pinned
        const isPrevTabPinned = targetIndex > 0 &&
            MainViewManager.isPathPinned(_currentTabContext.paneId, workingSetList[targetIndex - 1].fullPath);
        const isLastTabPinned = lastIndex >= 0 &&
            MainViewManager.isPathPinned(_currentTabContext.paneId, workingSetList[lastIndex].fullPath);

        closeAboveCmd.setEnabled(targetIndex > 0 && !isPrevTabPinned);
        closeBelowCmd.setEnabled(targetIndex < lastIndex && !isLastTabPinned);
        closeAllCmd.setEnabled(!isLastTabPinned);
    }

    /**
     * this function is called from Tabbar/main.js when a tab is right clicked
     * it is responsible to show the context menu and also set the currentTabContext
     * @param {String} paneId - the id of the pane ["first-pane", "second-pane"]
     * @param {String} filePath - the path of the file that was right-clicked
     * @param {Number} x - the x coordinate for positioning the menu
     * @param {Number} y - the y coordinate for positioning the menu
     */
    function showMoreOptionsContextMenu(paneId, filePath, x, y) {
        _currentTabContext.filePath = filePath;
        _currentTabContext.paneId = paneId;

        const contextMenu = Menus.getContextMenu("tabbar-context-menu");
        const event = $.Event("contextmenu", { pageX: x, pageY: y });
        contextMenu.open(event);
    }


    /**
     * this is the main function, it gets called only once on load from TabBar/main.js
     * this registers the context menu and add the menu items inside it
     */
    function init() {
        // Use commands from CloseOthers extension with TabBar-specific labels (via setName in _updateMenuItems)
        const menu = Menus.registerContextMenu("tabbar-context-menu");
        menu.addMenuItem(Commands.FILE_CLOSE);
        menu.addMenuItem(FILE_CLOSE_ABOVE);  // updated label: "Close Tabs to the Left"
        menu.addMenuItem(FILE_CLOSE_BELOW);  // updated label: "Close Tabs to the Right"
        menu.addMenuItem(FILE_CLOSE_ALL);    // updated label: "Close All Tabs"
        menu.addMenuDivider();
        menu.addMenuItem(Commands.FILE_PIN);
        menu.addMenuDivider();
        menu.addMenuItem(Commands.FILE_RENAME);
        menu.addMenuItem(Commands.FILE_DELETE);
        menu.addMenuItem(Commands.NAVIGATE_SHOW_IN_FILE_TREE);
        menu.addMenuDivider();
        menu.addMenuItem(Commands.FILE_REOPEN_CLOSED);

        // _updateMenuItems function disables the button which are not needed for the current tab
        // and those items are then hidden by the menu system automatically because of the hideWhenCommandDisabled flag
        menu.on("beforeContextMenuOpen", _updateMenuItems);
    }

    module.exports = {
        showMoreOptionsContextMenu,
        init
    };
});
