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

define(function (require, exports, module) {


    const Menus               = brackets.getModule("command/Menus"),
        CommandManager      = brackets.getModule("command/CommandManager"),
        Commands            = brackets.getModule("command/Commands"),
        MainViewManager     = brackets.getModule("view/MainViewManager"),
        WorkingSetView      = brackets.getModule("project/WorkingSetView"),
        Strings             = brackets.getModule("strings"),
        PreferencesManager  = brackets.getModule("preferences/PreferencesManager"),
        workingSetListCmenu = Menus.getContextMenu(Menus.ContextMenuIds.WORKING_SET_CONTEXT_MENU),
        fileTabsCmenu       = Menus.getContextMenu(Menus.ContextMenuIds.FILE_TABS_CONTEXT_MENU);

    // Constants
    const closeOthers           = "file.close_others",
        closeAbove              = "file.close_above",
        closeBelow              = "file.close_below",
        closeAll                = "file.close_all_in_pane";

    // the order in which the items appear in the menus, right after "Close"
    const MENU_ORDER = [closeAbove, closeOthers, closeBelow, closeAll];

    // the working set is a vertical list and the tab bar a horizontal one, so the same commands get
    // different names depending on which of the two menus is open
    const workingSetNames = {
        [closeAbove]: Strings.CMD_FILE_CLOSE_ABOVE,
        [closeOthers]: Strings.CMD_FILE_CLOSE_OTHERS,
        [closeBelow]: Strings.CMD_FILE_CLOSE_BELOW,
        [closeAll]: Strings.CMD_FILE_CLOSE_ALL
    };
    const fileTabNames = {
        [closeAbove]: Strings.CLOSE_TABS_TO_THE_LEFT,
        [closeOthers]: Strings.CLOSE_OTHER_TABS,
        [closeBelow]: Strings.CLOSE_TABS_TO_THE_RIGHT,
        [closeAll]: Strings.CLOSE_ALL_TABS
    };

    // Global vars and preferences
    const prefs = PreferencesManager.getExtensionPrefs("closeOthers");
    let menuEntriesShown = {};

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
     * The files of the pane's working set that the command would close for the given target file.
     * Pinned files are never closed by these commands. A file that is only previewed (not in the working
     * set) counts as sitting after the last working set file, which is where the tab bar shows it, and
     * "Close All" closes the preview as well.
     * @param {string} paneId - the pane to look in, or ACTIVE_PANE
     * @param {string} mode - one of the close command ids
     * @param {string} targetPath - full path of the file the command is relative to
     * @return {Array.<File>}
     */
    function getFilesToClose(paneId, mode, targetPath) {
        const workingSetList = MainViewManager.getWorkingSet(paneId),
            files = [];

        let targetIndex = MainViewManager.findInWorkingSet(paneId, targetPath);
        const isPreview = targetIndex === -1;
        if (isPreview) {
            targetIndex = workingSetList.length;
        }

        const start = (mode === closeBelow) ? (targetIndex + 1) : 0,
            end = (mode === closeAbove) ? targetIndex : workingSetList.length;

        for (let i = start; i < end; i++) {
            if (mode === closeOthers && i === targetIndex) {
                continue;
            }
            if (!MainViewManager.isPathPinned(paneId, workingSetList[i].fullPath)) {
                files.push(workingSetList[i]);
            }
        }

        if (mode === closeAll && isPreview) {
            const previewFile = MainViewManager.getCurrentlyViewedFile(paneId);
            if (previewFile && previewFile.fullPath === targetPath) {
                files.push(previewFile);
            }
        }

        return files;
    }

    /**
     * The file the close commands are relative to and the pane it is in: the item a working set or
     * tab bar menu was opened on, else the current file of the active pane
     * @return {{file: ?File, paneId: string}}
     */
    function getTarget() {
        const paneId = WorkingSetView.getContextPaneId() || MainViewManager.ACTIVE_PANE,
            file = WorkingSetView.getContext() || MainViewManager.getCurrentlyViewedFile(paneId);
        return { file: file, paneId: paneId };
    }

    /**
     * Handle the different Close commands
     * @param {string} mode
     */
    function handleClose(mode) {
        const target = getTarget();
        if (!target.file) {
            return;
        }

        const files = getFilesToClose(target.paneId, mode, target.file.fullPath);
        if (files.length) {
            return CommandManager.execute(Commands.FILE_CLOSE_LIST, {fileList: files});
        }
    }

    /**
     * Names the menu items for the menu that is opening and disables the ones that have nothing to close
     * @param {boolean} forFileTabs - true when the tab bar menu is opening, false for the working set menu
     */
    function contextMenuOpenHandler(forFileTabs) {
        const target = getTarget(),
            file = target.file,
            paneId = target.paneId,
            names = forFileTabs ? fileTabNames : workingSetNames;

        MENU_ORDER.forEach(function (commandId) {
            const command = CommandManager.get(commandId);
            command.setName(names[commandId]);
            command.setEnabled(Boolean(file) && getFilesToClose(paneId, commandId, file.fullPath).length > 0);
        });
    }


    /**
     * Returns which menu items should be shown, as per the preferences. "Close All" is always shown.
     * @return {Object.<string, boolean>}
     */
    function getPreferences() {
        // It's senseless to look prefs up for the current file, instead look them up for
        // the current project (or globally)
        return {
            [closeBelow]: prefs.get("below",  PreferencesManager.CURRENT_PROJECT),
            [closeOthers]: prefs.get("others", PreferencesManager.CURRENT_PROJECT),
            [closeAbove]: prefs.get("above",  PreferencesManager.CURRENT_PROJECT),
            [closeAll]: true
        };
    }

    /**
     * Adds the enabled menu items to both context menus in a fixed order right after "Close" and
     * removes the ones that were switched off in the preferences
     */
    function syncMenuItems() {
        const show = getPreferences();

        [workingSetListCmenu, fileTabsCmenu].forEach(function (cmenu) {
            let previous = Commands.FILE_CLOSE;
            MENU_ORDER.forEach(function (commandId) {
                if (menuEntriesShown[commandId]) {
                    cmenu.removeMenuItem(commandId);
                }
                if (show[commandId]) {
                    cmenu.addMenuItem(commandId, "", Menus.AFTER, previous);
                    previous = commandId;
                }
            });
        });

        menuEntriesShown = show;
    }

    /**
     * Register the Commands and add the Menu Items, if required
     */
    function initializeCommands() {
        CommandManager.register(Strings.CMD_FILE_CLOSE_BELOW, closeBelow, function () {
            return handleClose(closeBelow);
        }, { supportsDesignMode: true });
        CommandManager.register(Strings.CMD_FILE_CLOSE_OTHERS, closeOthers, function () {
            return handleClose(closeOthers);
        }, { supportsDesignMode: true });
        CommandManager.register(Strings.CMD_FILE_CLOSE_ABOVE, closeAbove, function () {
            return handleClose(closeAbove);
        }, { supportsDesignMode: true });
        CommandManager.register(Strings.CMD_FILE_CLOSE_ALL, closeAll, function () {
            return handleClose(closeAll);
        }, { supportsDesignMode: true });

        syncMenuItems();
    }


    // Initialize using the prefs
    initializeCommands();

    // Add a context menu open handler
    workingSetListCmenu.on("beforeContextMenuOpen", function () {
        contextMenuOpenHandler(false);
    });
    fileTabsCmenu.on("beforeContextMenuOpen", function () {
        contextMenuOpenHandler(true);
    });

    prefs.on("change", syncMenuItems);
});
