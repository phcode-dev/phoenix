/*
 * GNU AGPL-3.0 License
 *
 * Modified Work Copyright (c) 2021 - present core.ai . All rights reserved.
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

define(function (require, exports, module) {


    var Menus               = brackets.getModule("command/Menus"),
        CommandManager      = brackets.getModule("command/CommandManager"),
        Commands            = brackets.getModule("command/Commands"),
        MainViewManager     = brackets.getModule("view/MainViewManager"),
        Strings             = brackets.getModule("strings"),
        PreferencesManager  = brackets.getModule("preferences/PreferencesManager"),
        workingSetListCmenu = Menus.getContextMenu(Menus.ContextMenuIds.WORKING_SET_CONTEXT_MENU);

    // Constants
    var closeOthers             = "file.close_others",
        closeAbove              = "file.close_above",
        closeBelow              = "file.close_below";

    // Global vars and preferences
    var prefs                   = PreferencesManager.getExtensionPrefs("closeOthers"),
        menuEntriesShown        = {};

    prefs.definePreference("below",  "boolean", true, {
        description: Strings.DESCRIPTION_CLOSE_OTHERS_BELOW
    });
    prefs.definePreference("others", "boolean", true, {
        description: Strings.DESCRIPTION_CLOSE_OTHERS
    });
    prefs.definePreference("above",  "boolean", true, {
        description: Strings.DESCRIPTION_CLOSE_OTHERS_ABOVE
    });


    /**
     * Handle the different Close Other commands
     * @param {string} mode
     */
    function handleClose(mode) {
        var targetIndex  = MainViewManager.findInWorkingSet(MainViewManager.ACTIVE_PANE, MainViewManager.getCurrentlyViewedPath(MainViewManager.ACTIVE_PANE)),
            workingSetList = MainViewManager.getWorkingSet(MainViewManager.ACTIVE_PANE),
            start        = (mode === closeBelow) ? (targetIndex + 1) : 0,
            end          = (mode === closeAbove) ? (targetIndex) : (workingSetList.length),
            files        = [],
            i;

        for (i = start; i < end; i++) {
            if ((mode === closeOthers && i !== targetIndex) || (mode !== closeOthers)) {
                files.push(workingSetList[i]);
            }
        }

        CommandManager.execute(Commands.FILE_CLOSE_LIST, {fileList: files});
    }

    /**
     * Enable/Disable the menu items depending on which document is selected in the working set
     */
    function contextMenuOpenHandler() {
        var file = MainViewManager.getCurrentlyViewedFile(MainViewManager.ACTIVE_PANE);

        if (file) {
            var targetIndex  = MainViewManager.findInWorkingSet(MainViewManager.ACTIVE_PANE, file.fullPath),
                workingSetListSize = MainViewManager.getWorkingSetSize(MainViewManager.ACTIVE_PANE);

            if (targetIndex === workingSetListSize - 1) { // hide "Close Others Below" if the last file in Working Files is selected
                CommandManager.get(closeBelow).setEnabled(false);
            } else {
                CommandManager.get(closeBelow).setEnabled(true);
            }

            if (workingSetListSize === 1) { // hide "Close Others" if there is only one file in Working Files
                CommandManager.get(closeOthers).setEnabled(false);
            } else {
                CommandManager.get(closeOthers).setEnabled(true);
            }

            if (targetIndex === 0) { // hide "Close Others Above" if the first file in Working Files is selected
                CommandManager.get(closeAbove).setEnabled(false);
            } else {
                CommandManager.get(closeAbove).setEnabled(true);
            }
        }
    }


    /**
     * Returns the preferences used to add/remove the menu items
     * @return {{closeBelow: boolean, closeOthers: boolean, closeAbove: boolean}}
     */
    function getPreferences() {
        // It's senseless to look prefs up for the current file, instead look them up for
        // the current project (or globally)
        return {
            closeBelow: prefs.get("below",  PreferencesManager.CURRENT_PROJECT),
            closeOthers: prefs.get("others", PreferencesManager.CURRENT_PROJECT),
            closeAbove: prefs.get("above",  PreferencesManager.CURRENT_PROJECT)
        };
    }

    /**
     * When the preferences changed, add/remove the required menu items
     */
    function prefChangeHandler() {
        var prefs = getPreferences();

        if (prefs.closeBelow !== menuEntriesShown.closeBelow) {
            if (prefs.closeBelow) {
                workingSetListCmenu.addMenuItem(closeBelow, "", Menus.AFTER, Commands.FILE_CLOSE);
            } else {
                workingSetListCmenu.removeMenuItem(closeBelow);
            }
        }

        if (prefs.closeOthers !== menuEntriesShown.closeOthers) {
            if (prefs.closeOthers) {
                workingSetListCmenu.addMenuItem(closeOthers, "", Menus.AFTER, Commands.FILE_CLOSE);
            } else {
                workingSetListCmenu.removeMenuItem(closeOthers);
            }
        }

        if (prefs.closeAbove !== menuEntriesShown.closeAbove) {
            if (prefs.closeAbove) {
                workingSetListCmenu.addMenuItem(closeAbove, "", Menus.AFTER, Commands.FILE_CLOSE);
            } else {
                workingSetListCmenu.removeMenuItem(closeAbove);
            }
        }

        menuEntriesShown = prefs;
    }

    /**
     * Register the Commands and add the Menu Items, if required
     */
    function initializeCommands() {
        var prefs = getPreferences();

        CommandManager.register(Strings.CMD_FILE_CLOSE_BELOW, closeBelow, function () {
            handleClose(closeBelow);
        });
        CommandManager.register(Strings.CMD_FILE_CLOSE_OTHERS, closeOthers, function () {
            handleClose(closeOthers);
        });
        CommandManager.register(Strings.CMD_FILE_CLOSE_ABOVE, closeAbove, function () {
            handleClose(closeAbove);
        });

        if (prefs.closeBelow) {
            workingSetListCmenu.addMenuItem(closeBelow, "", Menus.AFTER, Commands.FILE_CLOSE);
        }
        if (prefs.closeOthers) {
            workingSetListCmenu.addMenuItem(closeOthers, "", Menus.AFTER, Commands.FILE_CLOSE);
        }
        if (prefs.closeAbove) {
            workingSetListCmenu.addMenuItem(closeAbove, "", Menus.AFTER, Commands.FILE_CLOSE);
        }
        menuEntriesShown = prefs;
    }


    // Initialize using the prefs
    initializeCommands();

    // Add a context menu open handler
    workingSetListCmenu.on("beforeContextMenuOpen", contextMenuOpenHandler);

    prefs.on("change", prefChangeHandler);
});
