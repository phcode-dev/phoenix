/*
 * This file manages the more options context menu.
 * The more option button is present at the right side of the tab bar.
 * When clicked, it will show the more options context menu.
 * which will have various options related to the tab bar
 */
define(function (require, exports, module) {
    const DropdownButton = require("widgets/DropdownButton");
    const Strings = require("strings");
    const MainViewManager = require("view/MainViewManager");
    const CommandManager = require("command/CommandManager");
    const Commands = require("command/Commands");

    const Global = require("./global");
    const Helper = require("./helper");

    // List of items to show in the context menu
    // Strings defined in `src/nls/root/strings.js`
    const items = [
        Strings.CLOSE_ALL_TABS,
        Strings.CLOSE_UNMODIFIED_TABS,
        Strings.REOPEN_CLOSED_FILE
    ];


    /**
     * This function is called when the close all tabs option is selected from the context menu
     * This will close all tabs no matter whether they are in first pane or second pane
     */
    function handleCloseAllTabs() {
        CommandManager.execute(Commands.FILE_CLOSE_ALL);
    }

    /**
     * Called when the close unmodified tabs option is selected from the context menu
     * This will close all tabs that are not modified
     * TODO: implement the functionality
     */
    function handleCloseUnmodifiedTabs() {

        // pass
    }

    /**
     * Called when the reopen closed file option is selected from the context menu
     * This just calls the reopen closed file command. everthing else is handled there
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
     */
    function showMoreOptionsContextMenu(paneId, x, y) {
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
            if (index === 0) {
                handleCloseAllTabs();
            } else if (index === 1) {
                handleCloseUnmodifiedTabs();
            } else if (index === 2) {
                reopenClosedFile();
            }
        });

        // Remove the button after the dropdown is hidden
        dropdown.$button.css({
            display: "none"
        });
    }

    module.exports = {
        showMoreOptionsContextMenu
    };
});
