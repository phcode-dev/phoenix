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

/* eslint-disable no-invalid-this */
define(function (require, exports, module) {
    const _ = require("thirdparty/lodash");
    const AppInit = require("utils/AppInit");
    const MainViewManager = require("view/MainViewManager");
    const EditorManager = require("editor/EditorManager");
    const FileSystem = require("filesystem/FileSystem");
    const PreferencesManager = require("preferences/PreferencesManager");
    const CommandManager = require("command/CommandManager");
    const Commands = require("command/Commands");
    const DocumentManager = require("document/DocumentManager");
    const WorkspaceManager = require("view/WorkspaceManager");
    const Menus = require("command/Menus");
    const Strings = require("strings");

    const Global = require("./global");
    const Helper = require("./helper");
    const Preference = require("./preference");
    const MoreOptions = require("./more-options");
    const Overflow = require("./overflow");
    const DragDrop = require("./drag-drop");
    const TabBarHTML = require("text!./html/tabbar-pane.html");
    const TabBarHTML2 = require("text!./html/tabbar-second-pane.html");



    /**
     * This holds the tab bar element
     * For tab bar structure, refer to `./html/tabbar-pane.html` and `./html/tabbar-second-pane.html`
     * $tabBar is for the first pane and $tabBar2 is for the second pane
     *
     * @type {$.Element}
     */
    let $tabBar = null;
    let $tabBar2 = null;


    /**
     * This function is responsible to take all the files from the working set and gets the working sets ready
     * This is placed here instead of helper.js because it modifies the working sets
     */
    function getAllFilesFromWorkingSet() {
        Global.firstPaneWorkingSet = [];
        Global.secondPaneWorkingSet = [];

        // this gives the list of panes. When both panes are open, it will be ['first-pane', 'second-pane']
        const paneList = MainViewManager.getPaneIdList();

        // to make sure atleast one pane is open
        if (paneList && paneList.length > 0) {

            // this gives the working set of the first pane
            const currFirstPaneWorkingSet = MainViewManager.getWorkingSet(paneList[0]);

            for (let i = 0; i < currFirstPaneWorkingSet.length; i++) {
                // MainViewManager.getWorkingSet gives the working set of the first pane,
                // but it has lot of details we don't need. Hence we use Helper._getRequiredDataFromEntry
                Global.firstPaneWorkingSet.push(Helper._getRequiredDataFromEntry(currFirstPaneWorkingSet[i]));
            }
            // if there are duplicate file names, we update the displayName to include the directory
            Helper._handleDuplicateFileNames(Global.firstPaneWorkingSet);

            // check if second pane is open
            if (paneList.length > 1) {
                const currSecondPaneWorkingSet = MainViewManager.getWorkingSet(paneList[1]);

                for (let i = 0; i < currSecondPaneWorkingSet.length; i++) {
                    Global.secondPaneWorkingSet.push(Helper._getRequiredDataFromEntry(currSecondPaneWorkingSet[i]));
                }
                Helper._handleDuplicateFileNames(Global.secondPaneWorkingSet);
            }

            // Update dirty status for files in the first pane working set
            Global.firstPaneWorkingSet.forEach(function (entry) {
                const doc = DocumentManager.getOpenDocumentForPath(entry.path);
                if (doc) {
                    entry.isDirty = doc.isDirty;
                }
            });

            // Update dirty status for files in the second pane working set
            Global.secondPaneWorkingSet.forEach(function (entry) {
                const doc = DocumentManager.getOpenDocumentForPath(entry.path);
                if (doc) {
                    entry.isDirty = doc.isDirty;
                }
            });
        }
    }



    /**
     * Responsible for creating the tab element
     * Note: this creates a tab (for a single file) not the tab bar
     *
     * @param {Object} entry - the working set entry
     * @param {String} paneId - the pane id 'first-pane' or 'second-pane'
     * @returns {$.Element} the tab element
     */
    function createTab(entry, paneId) {
        if (!$tabBar || !paneId) {
            return;
        }

        // get the current active file for this specific pane
        const activeFileInPane = MainViewManager.getCurrentlyViewedFile(paneId);
        const activePathInPane = activeFileInPane ? activeFileInPane.fullPath : null;

        // Check if this file is active in its pane
        const isActive = (entry.path === activePathInPane);

        // Current active pane (used to determine whether to add the blue underline)
        const currentActivePane = MainViewManager.getActivePaneId();
        const isPaneActive = (paneId === currentActivePane);

        const isDirty = Helper._isFileModified(FileSystem.getFileForPath(entry.path));

        // create tab with active class
        const $tab = $(
            `<div class="tab 
                ${isActive ? 'active' : ''} 
                ${isDirty ? 'dirty' : ''}" data-path="${entry.path}" title="${entry.path}">
                <div class="tab-icon"></div>
                <div class="tab-name"></div>
                <div class="tab-close"><i class="fa-solid fa-times"></i></div>
            </div>`
        );

        // Add the file icon
        const $icon = Helper._getFileIcon(entry);
        $tab.find('.tab-icon').append($icon);

        // Check if we have a directory part in the displayName
        const $tabName = $tab.find('.tab-name');
        if (entry.displayName && entry.displayName !== entry.name) {
            // Split the displayName into directory and filename parts
            const parts = entry.displayName.split('/');
            const dirName = parts[0];
            const fileName = parts[1];

            // create the HTML for different styling for directory and filename
            $tabName.html(`<span class="tab-dirname">${dirName}/</span>${fileName}`);
        } else {
            // Just the filename
            $tabName.text(entry.name);
        }

        // only add the underline class if this is both active AND in the active pane
        if (isActive && !isPaneActive) {
            // if it's active but in a non-active pane, we add a special class
            // to style differently in CSS to indicate that it's active but not in the active pane
            $tab.addClass('active-in-inactive-pane');
        }

        return $tab;
    }


    /**
     * Creates the tab bar and adds it to the DOM
     */
    function createTabBar() {
        if (!Preference.tabBarEnabled || Preference.numberOfTabs === 0) {
            return;
        }

        // clean up any existing tab bars first and start fresh
        cleanupTabBar();

        const $paneHeader = $('.pane-header');
        if ($paneHeader.length === 1) {
            $tabBar = $(TabBarHTML);
            // since we need to add the tab bar before the editor which has .not-editor class
            $(".pane-header").after($tabBar);
            WorkspaceManager.recomputeLayout(true);
            updateTabs();

        } else if ($paneHeader.length === 2) {
            $tabBar = $(TabBarHTML);
            $tabBar2 = $(TabBarHTML2);

            // eq(0) is for the first pane and eq(1) is for the second pane
            // TODO: Fix bug where the tab bar gets hidden inside the editor in horizontal split
            $paneHeader.eq(0).after($tabBar);
            $paneHeader.eq(1).after($tabBar2);
            WorkspaceManager.recomputeLayout(true);
            updateTabs();
        }
    }


    /**
     * This function updates the tabs in the tab bar
     * It is called when the working set changes. So instead of creating a new tab bar, we just update the existing one
     */
    function updateTabs() {
        // Get all files from the working set. refer to `global.js`
        getAllFilesFromWorkingSet();

        // When there is only one file, we enforce the creation of the tab bar
        // this is done because, given the situation:
        // In a vertical split, when no files are present in 'second-pane' so the tab bar is hidden.
        // Now, when the user adds a file in 'second-pane', the tab bar should be shown but since updateTabs() only,
        // updates the tabs, so the tab bar never gets created.
        if (Global.firstPaneWorkingSet.length === 1 &&
            (!$('#phoenix-tab-bar').length || $('#phoenix-tab-bar').is(':hidden'))) {
            createTabBar();
        }

        if (Global.secondPaneWorkingSet.length === 1 &&
            (!$('#phoenix-tab-bar-2').length || $('#phoenix-tab-bar-2').is(':hidden'))) {
            createTabBar();
        }

        const $firstTabBar = $('#phoenix-tab-bar');
        // Update first pane's tabs
        if ($firstTabBar.length) {
            $firstTabBar.empty();
            if (Global.firstPaneWorkingSet.length > 0) {

                // get the count of tabs that we want to display in the tab bar (from preference settings)
                // from preference settings or working set whichever smaller
                let tabsCountP1 = Math.min(Global.firstPaneWorkingSet.length, Preference.tabBarNumberOfTabs);

                // the value is generally '-1', but we check for less than 0 so that it can handle edge cases gracefully
                // if the value is negative then we display all tabs
                if (Preference.tabBarNumberOfTabs < 0) {
                    tabsCountP1 = Global.firstPaneWorkingSet.length;
                }

                let displayedEntries = Global.firstPaneWorkingSet.slice(0, tabsCountP1);

                const activeEditor = EditorManager.getActiveEditor();
                const activePath = activeEditor ? activeEditor.document.file.fullPath : null;
                if (activePath && !displayedEntries.some(entry => entry.path === activePath)) {
                    let activeEntry = Global.firstPaneWorkingSet.find(entry => entry.path === activePath);
                    if (activeEntry) {
                        displayedEntries[displayedEntries.length - 1] = activeEntry;
                    }
                }
                displayedEntries.forEach(function (entry) {
                    $firstTabBar.append(createTab(entry, "first-pane"));
                });
            }
        }

        const $secondTabBar = $('#phoenix-tab-bar-2');
        // Update second pane's tabs
        if ($secondTabBar.length) {
            $secondTabBar.empty();
            if (Global.secondPaneWorkingSet.length > 0) {

                let tabsCountP2 = Math.min(Global.secondPaneWorkingSet.length, Preference.tabBarNumberOfTabs);
                if (Preference.tabBarNumberOfTabs < 0) {
                    tabsCountP2 = Global.secondPaneWorkingSet.length;
                }

                let displayedEntries2 = Global.secondPaneWorkingSet.slice(0, tabsCountP2);
                const activeEditor = EditorManager.getActiveEditor();
                const activePath = activeEditor ? activeEditor.document.file.fullPath : null;
                if (activePath && !displayedEntries2.some(entry => entry.path === activePath)) {
                    let activeEntry = Global.secondPaneWorkingSet.find(entry => entry.path === activePath);
                    if (activeEntry) {
                        displayedEntries2[displayedEntries2.length - 1] = activeEntry;
                    }
                }
                displayedEntries2.forEach(function (entry) {
                    $secondTabBar.append(createTab(entry, "second-pane"));
                });
            }
        }

        // if no files are present in a pane, we want to hide the tab bar for that pane
        if (Global.firstPaneWorkingSet.length === 0 && ($('#phoenix-tab-bar'))) {
            Helper._hideTabBar($('#phoenix-tab-bar'), $('#overflow-button'));
        }

        if (Global.secondPaneWorkingSet.length === 0 && ($('#phoenix-tab-bar-2'))) {
            Helper._hideTabBar($('#phoenix-tab-bar-2'), $('#overflow-button-2'));
        }

        const activePane = MainViewManager.getActivePaneId();

        // Now that tabs are updated, scroll to the active tab if necessary.
        if ($firstTabBar.length) {
            Overflow.toggleOverflowVisibility("first-pane");

            // we scroll only in the active pane
            // this is because, lets say we have a same file in both the panes
            // then when the file is opened in one of the pane and is towards the end of the tab bar,
            // then we need to show the scrolling animation only on that pane and not on both the panes
            if (activePane === "first-pane") {
                setTimeout(function () {
                    Overflow.scrollToActiveTab($firstTabBar);
                }, 0);
            }
        }

        if ($secondTabBar.length) {
            Overflow.toggleOverflowVisibility("second-pane");
            if (activePane === "second-pane") {
                setTimeout(function () {
                    Overflow.scrollToActiveTab($secondTabBar);
                }, 0);
            }
        }

        // handle drag and drop
        DragDrop.init($('#phoenix-tab-bar'), $('#phoenix-tab-bar-2'));
    }


    /**
     * Removes existing tab bar and cleans up
     */
    function cleanupTabBar() {
        if ($tabBar) {
            $tabBar.remove();
            $tabBar = null;
        }
        if ($tabBar2) {
            $tabBar2.remove();
            $tabBar2 = null;
        }
        // Also check for any orphaned tab bars that might exist
        $(".tab-bar-container").remove();
        WorkspaceManager.recomputeLayout(true);
    }


    /**
     * handle click events on the tabs to open the file
     */
    function handleTabClick() {

        // delegate event handling for both tab bars
        $(document).on("click", ".phoenix-tab-bar .tab", function (event) {
            // check if the clicked element is the close button
            if ($(event.target).hasClass('fa-times') || $(event.target).closest('.tab-close').length) {
                // Get the file path from the data-path attribute of the parent tab
                const filePath = $(this).attr("data-path");

                if (filePath) {
                    // determine the pane inside which the tab belongs
                    const isSecondPane = $(this).closest("#phoenix-tab-bar-2").length > 0;
                    const paneId = isSecondPane ? "second-pane" : "first-pane";

                    // get the file object
                    const fileObj = FileSystem.getFileForPath(filePath);
                    // close the file
                    CommandManager.execute(
                        Commands.FILE_CLOSE,
                        { file: fileObj, paneId: paneId }
                    );

                    // Prevent default behavior
                    event.preventDefault();
                    event.stopPropagation();
                }
            }
        });

        // delegate event handling for both tab bars
        $(document).on("mousedown", ".phoenix-tab-bar .tab", function (event) {
            if ($(event.target).hasClass('fa-times') || $(event.target).closest('.tab-close').length) {
                return;
            }
            // Get the file path from the data-path attribute
            const filePath = $(this).attr("data-path");

            if (filePath) {
                // determine the pane inside which the tab belongs
                const isSecondPane = $(this).closest("#phoenix-tab-bar-2").length > 0;
                const paneId = isSecondPane ? "second-pane" : "first-pane";
                const currentActivePane = MainViewManager.getActivePaneId();
                const isPaneActive = (paneId === currentActivePane);
                const currentFile = MainViewManager.getCurrentlyViewedFile(currentActivePane);
                if(isPaneActive && currentFile && currentFile.fullPath === filePath) {
                    return;
                }
                CommandManager.execute(Commands.FILE_OPEN, { fullPath: filePath, paneId: paneId });

                // We dont prevent default behavior here to enable drag and drop of this tab
            }
        });

        // Add the contextmenu (right-click) handler
        $(document).on("contextmenu", ".phoenix-tab-bar .tab", function (event) {
            event.preventDefault();
            event.stopPropagation();

            // get the file path from the data-path attribute
            const filePath = $(this).attr("data-path");

            // determine which pane the tab belongs to
            const isSecondPane = $(this).closest("#phoenix-tab-bar-2").length > 0;
            const paneId = isSecondPane ? "second-pane" : "first-pane";

            // show the context menu at mouse position
            MoreOptions.showMoreOptionsContextMenu(paneId, event.pageX, event.pageY, filePath);
        });
    }


    // debounce is used to prevent rapid consecutive calls to updateTabs,
    // which was causing integration tests to fail in Firefox. Without it,
    // the event fires too frequently when switching editors, leading to unexpected behavior
    const debounceUpdateTabs = _.debounce(updateTabs, 2);

    /**
     * Registers the event handlers
     */
    function _registerHandlers() {
        // For pane layout changes, recreate the entire tab bar container
        MainViewManager.on("paneCreate paneDestroy paneLayoutChange", createTabBar);

        // For active pane changes, update only the tabs
        MainViewManager.on("activePaneChange", updateTabs);

        // For editor changes, update only the tabs.
        MainViewManager.on(MainViewManager.EVENT_CURRENT_FILE_CHANGE, debounceUpdateTabs);

        // For working set changes, update only the tabs.
        const events = [
            "workingSetAdd",
            "workingSetRemove",
            "workingSetSort",
            "workingSetMove",
            "workingSetAddList",
            "workingSetRemoveList",
            "workingSetUpdate",
            "_workingSetDisableAutoSort"
        ];
        MainViewManager.off(events.join(" "), updateTabs);
        MainViewManager.on(events.join(" "), updateTabs);

        // When the sidebar UI changes, update the tabs to ensure the overflow menu is correct
        $("#sidebar").off("panelCollapsed panelExpanded panelResizeEnd", updateTabs);
        $("#sidebar").on("panelCollapsed panelExpanded panelResizeEnd", updateTabs);

        // also update the tabs when the main plugin panel resizes
        // main-plugin-panel[0] = live preview panel
        new ResizeObserver(updateTabs).observe($("#main-plugin-panel")[0]);

        // File dirty flag change handling
        DocumentManager.on("dirtyFlagChange", function (event, doc) {
            const filePath = doc.file.fullPath;

            // Update UI
            if ($tabBar) {
                const $tab = $tabBar.find(`.tab[data-path="${filePath}"]`);
                $tab.toggleClass('dirty', doc.isDirty);


                // Update the working set data
                // First pane
                for (let i = 0; i < Global.firstPaneWorkingSet.length; i++) {
                    if (Global.firstPaneWorkingSet[i].path === filePath) {
                        Global.firstPaneWorkingSet[i].isDirty = doc.isDirty;
                        break;
                    }
                }
            }


            // Also update the $tab2 if it exists
            if ($tabBar2) {
                const $tab2 = $tabBar2.find(`.tab[data-path="${filePath}"]`);
                $tab2.toggleClass('dirty', doc.isDirty);

                // Second pane
                for (let i = 0; i < Global.secondPaneWorkingSet.length; i++) {
                    if (Global.secondPaneWorkingSet[i].path === filePath) {
                        Global.secondPaneWorkingSet[i].isDirty = doc.isDirty;
                        break;
                    }
                }
            }
        });
    }


    /**
     * This is called when the tab bar preference is changed either,
     * from the preferences file or the menu bar
     * It takes care of creating or cleaning up the tab bar
     */
    function preferenceChanged() {
        const prefs = PreferencesManager.get(Preference.PREFERENCES_TAB_BAR);
        Preference.tabBarEnabled = prefs.showTabBar;
        Preference.tabBarNumberOfTabs = prefs.numberOfTabs;

        // Update menu checkmark
        CommandManager.get(Commands.TOGGLE_TABBAR).setChecked(prefs.showTabBar);

        if (Preference.tabBarEnabled && Preference.tabBarNumberOfTabs !== 0) {
            createTabBar();
        } else {
            cleanupTabBar();
        }
    }

    /**
     * Registers the commands,
     * for toggling the tab bar from the menu bar
     */
    function _registerCommands() {
        CommandManager.register(
            Strings.CMD_TOGGLE_TABBAR,
            Commands.TOGGLE_TABBAR,
            () => {
                const currentPref = PreferencesManager.get(Preference.PREFERENCES_TAB_BAR);
                PreferencesManager.set(Preference.PREFERENCES_TAB_BAR, {
                    ...currentPref,
                    showTabBar: !currentPref.showTabBar
                });
            }
        );
    }

    /**
     * this function sets up mouse wheel scrolling functionality for the tab bars
     * when the mouse wheel is scrolled up, the tab bar will scroll to the left
     * when its scrolled down, the tab bar will scroll to the right
     */
    function setupTabBarScrolling() {

        // common  handler for both the tab bars
        function handleMouseWheel(e) {
            // get the tab bar element that is being scrolled
            const $scrolledTabBar = $(this);

            // A negative deltaY means scrolling up so we need to scroll to the left,
            // positive means scrolling down so we need to scroll to the right
            // here we calculate the scroll amount (pixels)
            // and multiply by 2.5 for increasing the scroll amount
            const scrollAmount = e.originalEvent.deltaY * 2.5;

            // calculate the new scroll position
            const newScrollLeft = $scrolledTabBar.scrollLeft() + scrollAmount;

            // apply the new scroll position
            $scrolledTabBar.scrollLeft(newScrollLeft);
        }

        // attach the wheel event handler to both tab bars
        $(document).on('wheel', '#phoenix-tab-bar, #phoenix-tab-bar-2', handleMouseWheel);
    }

    AppInit.appReady(function () {
        _registerCommands();

        // add the toggle tab bar command to the view menu
        const viewMenu = Menus.getMenu(Menus.AppMenuBar.VIEW_MENU);
        viewMenu.addMenuItem(Commands.TOGGLE_TABBAR, "", Menus.AFTER, Commands.VIEW_HIDE_SIDEBAR);

        PreferencesManager.on("change", Preference.PREFERENCES_TAB_BAR, preferenceChanged);
        // calling preference changed here itself to check if the tab bar is enabled,
        // because if it is enabled, preferenceChange automatically calls createTabBar
        preferenceChanged();

        // this should be called at the last as everything should be setup before registering handlers
        _registerHandlers();

        // handle when a single tab gets clicked
        handleTabClick();

        Overflow.init();
        DragDrop.init($('#phoenix-tab-bar'), $('#phoenix-tab-bar-2'));

        // setup the mouse wheel scrolling
        setupTabBarScrolling();
    });
});
