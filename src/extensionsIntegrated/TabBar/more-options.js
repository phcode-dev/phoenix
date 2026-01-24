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
    const FileSystem = require("filesystem/FileSystem");
    const MainViewManager = require("view/MainViewManager");
    const Menus = require("command/Menus");
    const Strings = require("strings");

    const Global = require("./global");

    // these are Tab bar specific commands for the context menu
    // not added in the Commands.js as Tab bar is not a core module but an extension
    // read init function
    const TABBAR_CLOSE_TABS_LEFT = "tabbar.closeTabsLeft";
    const TABBAR_CLOSE_TABS_RIGHT = "tabbar.closeTabsRight";
    const TABBAR_CLOSE_SAVED_TABS = "tabbar.closeSavedTabs";
    const TABBAR_CLOSE_ALL = "tabbar.closeAllTabs";

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
    }

    // gets the working set (list of open files) for the given pane
    function _getWorkingSet(paneId) {
        return paneId === "first-pane" ? Global.firstPaneWorkingSet : Global.secondPaneWorkingSet;
    }

    // closes files from right to left to avoid index shifts during iteration
    function _closeFiles(files, paneId) {
        for (let i = files.length - 1; i >= 0; i--) {
            const fileObj = FileSystem.getFileForPath(files[i].path);
            CommandManager.execute(Commands.FILE_CLOSE, { file: fileObj, paneId: paneId });
        }
    }

    // executes a command with the right-clicked tab's file as the target
    function _executeWithFileContext(commandId, options = {}) {
        if (_currentTabContext.filePath) {
            // we need to get the file object from the file path, as the commandManager expects the file object
            const fileObj = FileSystem.getFileForPath(_currentTabContext.filePath);
            CommandManager.execute(commandId, { file: fileObj, ...options });
        }
    }

    // **Close All Tabs**
    // closes all tabs in the pane where the tab was right-clicked
    function handleCloseAllTabs() {
        const workingSet = _getWorkingSet(_currentTabContext.paneId);
        if (workingSet && workingSet.length !== 0) {
            // close everything in the pane
            _closeFiles(workingSet, _currentTabContext.paneId);
        }
    }

    // **Close Saved Tabs**
    // closes all saved tabs (not dirty) in the pane
    function handleCloseSavedTabs() {
        const workingSet = _getWorkingSet(_currentTabContext.paneId);
        if (workingSet && workingSet.length !== 0) {
            // filter out dirty tabs, only close the saved ones
            const savedTabs = workingSet.filter(entry => !entry.isDirty);
            _closeFiles(savedTabs, _currentTabContext.paneId);
        }
    }

    // **Close Tabs to the Left**
    // closes all tabs to the left of the right-clicked tab
    function handleCloseTabsToTheLeft() {
        const workingSet = _getWorkingSet(_currentTabContext.paneId);
        if (!workingSet) { return; }

        // find where the right-clicked tab is in the list
        const currentIndex = workingSet.findIndex(entry => entry.path === _currentTabContext.filePath);
        if (currentIndex > 0) {
            // slice from start to currentIndex (not including currentIndex)
            _closeFiles(workingSet.slice(0, currentIndex), _currentTabContext.paneId);
        }
    }

    // **Close Tabs to the Right**
    // closes all tabs to the right of the right-clicked tab
    function handleCloseTabsToTheRight() {
        const workingSet = _getWorkingSet(_currentTabContext.paneId);
        if (!workingSet) { return; }

        // find where the right-clicked tab is in the list
        const currentIndex = workingSet.findIndex(entry => entry.path === _currentTabContext.filePath);
        if (currentIndex !== -1 && currentIndex < workingSet.length - 1) {
            // slice from currentIndex+1 to end
            _closeFiles(workingSet.slice(currentIndex + 1), _currentTabContext.paneId);
        }
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
        // these are the tab bar specific commands
        CommandManager.register(Strings.CLOSE_TABS_TO_THE_LEFT, TABBAR_CLOSE_TABS_LEFT, handleCloseTabsToTheLeft);
        CommandManager.register(Strings.CLOSE_TABS_TO_THE_RIGHT, TABBAR_CLOSE_TABS_RIGHT, handleCloseTabsToTheRight);
        CommandManager.register(Strings.CLOSE_SAVED_TABS, TABBAR_CLOSE_SAVED_TABS, handleCloseSavedTabs);
        CommandManager.register(Strings.CLOSE_ALL_TABS, TABBAR_CLOSE_ALL, handleCloseAllTabs);

        // these commands already exist for working files, just reusing them
        const menu = Menus.registerContextMenu("tabbar-context-menu");
        menu.addMenuItem(Commands.FILE_CLOSE);
        menu.addMenuItem(TABBAR_CLOSE_TABS_LEFT);
        menu.addMenuItem(TABBAR_CLOSE_TABS_RIGHT);
        menu.addMenuItem(TABBAR_CLOSE_SAVED_TABS);
        menu.addMenuItem(TABBAR_CLOSE_ALL);
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
