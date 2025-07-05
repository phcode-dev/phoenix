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
    const DropdownButton = require("widgets/DropdownButton");
    const Strings = require("strings");
    const CommandManager = require("command/CommandManager");
    const Commands = require("command/Commands");
    const FileSystem = require("filesystem/FileSystem");

    const Global = require("./global");

    // List of items to show in the context menu
    // Strings defined in `src/nls/root/strings.js`
    const items = [
        Strings.CLOSE_TAB,
        Strings.CLOSE_TABS_TO_THE_LEFT,
        Strings.CLOSE_TABS_TO_THE_RIGHT,
        Strings.CLOSE_SAVED_TABS,
        Strings.CLOSE_ALL_TABS,
        "---",
        Strings.CMD_FILE_RENAME,
        Strings.CMD_FILE_DELETE,
        Strings.CMD_SHOW_IN_TREE,
        "---",
        Strings.REOPEN_CLOSED_FILE
    ];

    /**
     * "CLOSE TAB"
     * this function handles the closing of the tab that was right-clicked
     *
     * @param {String} filePath - path of the file to close
     * @param {String} paneId - the id of the pane in which the file is present
     */
    function handleCloseTab(filePath, paneId) {
        if (filePath) {
            // Get the file object using FileSystem
            const fileObj = FileSystem.getFileForPath(filePath);

            // Execute close command with file object and pane ID
            CommandManager.execute(Commands.FILE_CLOSE, { file: fileObj, paneId: paneId });
        }
    }

    /**
     * "CLOSE ALL TABS"
     * This will close all tabs in the specified pane
     *
     * @param {String} paneId - the id of the pane ["first-pane", "second-pane"]
     */
    function handleCloseAllTabs(paneId) {
        if (!paneId) {
            return;
        }

        let workingSet;
        workingSet = paneId === "first-pane" ? Global.firstPaneWorkingSet : Global.secondPaneWorkingSet;
        if (!workingSet || workingSet.length === 0) {
            return;
        }

        // close each file in the pane, start from the rightmost [to avoid index shifts]
        for (let i = workingSet.length - 1; i >= 0; i--) {
            const fileObj = FileSystem.getFileForPath(workingSet[i].path);
            CommandManager.execute(Commands.FILE_CLOSE, { file: fileObj, paneId: paneId });
        }
    }

    /**
     * "CLOSE SAVED TABS"
     * This will close all tabs that are not dirty in the specified pane
     *
     * @param {String} paneId - the id of the pane ["first-pane", "second-pane"]
     */
    function handleCloseSavedTabs(paneId) {
        if (!paneId) {
            return;
        }

        let workingSet;
        workingSet = paneId === "first-pane" ? Global.firstPaneWorkingSet : Global.secondPaneWorkingSet;
        if (!workingSet || workingSet.length === 0) {
            return;
        }

        // get all those entries that are not dirty
        const unmodifiedEntries = workingSet.filter((entry) => !entry.isDirty);

        // close each non-dirty file in the pane
        for (let i = unmodifiedEntries.length - 1; i >= 0; i--) {
            const fileObj = FileSystem.getFileForPath(unmodifiedEntries[i].path);
            CommandManager.execute(Commands.FILE_CLOSE, { file: fileObj, paneId: paneId });
        }
    }

    /**
     * "CLOSE TABS TO THE LEFT"
     * This function is responsible for closing all tabs to the left of the right-clicked tab
     *
     * @param {String} filePath - path of the file that was right-clicked
     * @param {String} paneId - the id of the pane in which the file is present
     */
    function handleCloseTabsToTheLeft(filePath, paneId) {
        if (!filePath) {
            return;
        }

        let workingSet;
        workingSet = paneId === "first-pane" ? Global.firstPaneWorkingSet : Global.secondPaneWorkingSet;
        if (!workingSet) {
            return;
        }

        // find the index of the current file in the working set
        const currentIndex = workingSet.findIndex((entry) => entry.path === filePath);

        if (currentIndex > 0) {
            // we only proceed if there are tabs to the left
            // get all files to the left of the current file
            const filesToClose = workingSet.slice(0, currentIndex);

            // Close each file, starting from the rightmost [to avoid index shifts]
            for (let i = filesToClose.length - 1; i >= 0; i--) {
                const fileObj = FileSystem.getFileForPath(filesToClose[i].path);
                CommandManager.execute(Commands.FILE_CLOSE, { file: fileObj, paneId: paneId });
            }
        }
    }

    /**
     * "CLOSE TABS TO THE RIGHT"
     * This function is responsible for closing all tabs to the right of the right-clicked tab
     *
     * @param {String} filePath - path of the file that was right-clicked
     * @param {String} paneId - the id of the pane in which the file is present
     */
    function handleCloseTabsToTheRight(filePath, paneId) {
        if (!filePath) {
            return;
        }

        let workingSet;
        workingSet = paneId === "first-pane" ? Global.firstPaneWorkingSet : Global.secondPaneWorkingSet;
        if (!workingSet) {
            return;
        }

        // get the index of the current file in the working set
        const currentIndex = workingSet.findIndex((entry) => entry.path === filePath);
        // only proceed if there are tabs to the right
        if (currentIndex !== -1 && currentIndex < workingSet.length - 1) {
            // get all files to the right of the current file
            const filesToClose = workingSet.slice(currentIndex + 1);

            for (let i = filesToClose.length - 1; i >= 0; i--) {
                const fileObj = FileSystem.getFileForPath(filesToClose[i].path);
                CommandManager.execute(Commands.FILE_CLOSE, { file: fileObj, paneId: paneId });
            }
        }
    }

    /**
     * "REOPEN CLOSED FILE"
     * This just calls the reopen closed file command. everthing else is handled there
     * TODO: disable the command if there are no closed files, look into the file menu
     */
    function reopenClosedFile() {
        CommandManager.execute(Commands.FILE_REOPEN_CLOSED);
    }

    /**
     * "RENAME FILE"
     * This function handles the renaming of the file that was right-clicked
     *
     * @param {String} filePath - path of the file to rename
     */
    function handleFileRename(filePath) {
        if (filePath) {
            // First ensure the sidebar is visible so users can see the rename action
            CommandManager.execute(Commands.SHOW_SIDEBAR);

            // Get the file object using FileSystem
            const fileObj = FileSystem.getFileForPath(filePath);

            // Execute the rename command with the file object
            CommandManager.execute(Commands.FILE_RENAME, { file: fileObj });
        }
    }

    /**
     * "DELETE FILE"
     * This function handles the deletion of the file that was right-clicked
     *
     * @param {String} filePath - path of the file to delete
     */
    function handleFileDelete(filePath) {
        if (filePath) {
            // Get the file object using FileSystem
            const fileObj = FileSystem.getFileForPath(filePath);

            // Execute the delete command with the file object
            CommandManager.execute(Commands.FILE_DELETE, { file: fileObj });
        }
    }

    /**
     * "SHOW IN FILE TREE"
     * This function handles showing the file in the file tree
     *
     * @param {String} filePath - path of the file to show in file tree
     */
    function handleShowInFileTree(filePath) {
        if (filePath) {
            // First ensure the sidebar is visible so users can see the file in the tree
            CommandManager.execute(Commands.SHOW_SIDEBAR);

            // Get the file object using FileSystem
            const fileObj = FileSystem.getFileForPath(filePath);

            // Execute the show in tree command with the file object
            CommandManager.execute(Commands.NAVIGATE_SHOW_IN_FILE_TREE, { file: fileObj });
        }
    }

    /**
     * This function is called when a tab is right-clicked
     * This will show the more options context menu
     *
     * @param {String} paneId - the id of the pane ["first-pane", "second-pane"]
     * @param {Number} x - the x coordinate for positioning the menu
     * @param {Number} y - the y coordinate for positioning the menu
     * @param {String} filePath - [optional] the path of the file that was right-clicked
     */
    function showMoreOptionsContextMenu(paneId, x, y, filePath) {
        const dropdown = new DropdownButton.DropdownButton("", items);

        // Append to document body for absolute positioning
        $("body").append(dropdown.$button);

        // Position the dropdown at the mouse coordinates
        dropdown.$button.css({
            position: "absolute",
            left: x + "px",
            top: y + "px",
            zIndex: 1000
        });

        // Add a custom class to override the max-height, not sure why a scroll bar was coming but this did the trick
        dropdown.dropdownExtraClasses = "tabbar-context-menu";

        dropdown.showDropdown();

        $(".tabbar-context-menu").css("max-height", "300px");

        // handle the option selection
        dropdown.on("select", function (e, item) {
            _handleSelection(item, filePath, paneId);
        });

        // Remove the button after the dropdown is hidden
        dropdown.$button.css({
            display: "none"
        });
    }

    /**
     * Handles the selection of an option in the more options context menu
     *
     * @param {String} item - the item being selected
     * @param {String} filePath - the path of the file that was right-clicked
     * @param {String} paneId - the id of the pane ["first-pane", "second-pane"]
     */
    function _handleSelection(item, filePath, paneId) {
        switch (item) {
        case Strings.CLOSE_TAB:
            handleCloseTab(filePath, paneId);
            break;
        case Strings.CLOSE_TABS_TO_THE_LEFT:
            handleCloseTabsToTheLeft(filePath, paneId);
            break;
        case Strings.CLOSE_TABS_TO_THE_RIGHT:
            handleCloseTabsToTheRight(filePath, paneId);
            break;
        case Strings.CLOSE_ALL_TABS:
            handleCloseAllTabs(paneId);
            break;
        case Strings.CLOSE_SAVED_TABS:
            handleCloseSavedTabs(paneId);
            break;
        case Strings.CMD_FILE_RENAME:
            handleFileRename(filePath);
            break;
        case Strings.CMD_FILE_DELETE:
            handleFileDelete(filePath);
            break;
        case Strings.CMD_SHOW_IN_TREE:
            handleShowInFileTree(filePath);
            break;
        case Strings.REOPEN_CLOSED_FILE:
            reopenClosedFile();
            break;
        }
    }

    module.exports = {
        showMoreOptionsContextMenu
    };
});
