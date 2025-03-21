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
    const MainViewManager = require("view/MainViewManager");

    const Global = require("./global");

    // List of items to show in the context menu
    // Strings defined in `src/nls/root/strings.js`
    const items = [
        Strings.CLOSE_TAB,
        Strings.CLOSE_ACTIVE_TAB,
        Strings.CLOSE_ALL_TABS,
        Strings.CLOSE_UNMODIFIED_TABS,
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
            CommandManager.execute(
                Commands.FILE_CLOSE,
                { file: fileObj, paneId: paneId }
            );
        }
    }


    /**
     * "CLOSE ACTIVE TAB"
     * this closes the currently active tab
     * doesn't matter if the context menu is opened from this tab or some other tab
     */
    function handleCloseActiveTab() {
        // This simply executes the FILE_CLOSE command without parameters
        // which will close the currently active file
        CommandManager.execute(Commands.FILE_CLOSE);
    }


    /**
     * "CLOSE ALL TABS"
     * This will close all tabs no matter whether they are in first pane or second pane
     */
    function handleCloseAllTabs() {
        CommandManager.execute(Commands.FILE_CLOSE_ALL);
    }


    /**
     * "CLOSE UNMODIFIED TABS"
     * This will close all tabs that are not modified
     */
    function handleCloseUnmodifiedTabs() {
        const paneList = MainViewManager.getPaneIdList();

        // for the first pane
        if (paneList.length > 0 && Global.firstPaneWorkingSet.length > 0) {
            // get all those entries that are not dirty
            const unmodifiedEntries = Global.firstPaneWorkingSet.filter(entry => !entry.isDirty);

            // close each unmodified file in the first pane
            unmodifiedEntries.forEach(entry => {
                const fileObj = FileSystem.getFileForPath(entry.path);
                CommandManager.execute(
                    Commands.FILE_CLOSE,
                    { file: fileObj, paneId: "first-pane" }
                );
            });
        }

        // for second pane
        if (paneList.length > 1 && Global.secondPaneWorkingSet.length > 0) {
            const unmodifiedEntries = Global.secondPaneWorkingSet.filter(entry => !entry.isDirty);

            unmodifiedEntries.forEach(entry => {
                const fileObj = FileSystem.getFileForPath(entry.path);
                CommandManager.execute(
                    Commands.FILE_CLOSE,
                    { file: fileObj, paneId: "second-pane" }
                );
            });
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

        dropdown.showDropdown();

        // handle the option selection
        dropdown.on("select", function (e, item, index) {
            _handleSelection(index, filePath, paneId);
        });

        // Remove the button after the dropdown is hidden
        dropdown.$button.css({
            display: "none"
        });
    }

    /**
     * Handles the selection of an option in the more options context menu
     *
     * @param {Number} index - the index of the selected option
     * @param {String} filePath - the path of the file that was right-clicked
     * @param {String} paneId - the id of the pane ["first-pane", "second-pane"]
     */
    function _handleSelection(index, filePath, paneId) {
        switch (index) {
        case 0:
            // Close tab (the one that was right-clicked)
            handleCloseTab(filePath, paneId);
            break;
        case 1:
            // Close active tab
            handleCloseActiveTab();
            break;
        case 2:
            // Close all tabs
            handleCloseAllTabs();
            break;
        case 3:
            // Close unmodified tabs
            handleCloseUnmodifiedTabs();
            break;
        case 5:
            // Reopen closed file
            reopenClosedFile();
            break;
        }
    }

    module.exports = {
        showMoreOptionsContextMenu
    };
});
