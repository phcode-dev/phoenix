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
    const FileSystem = require("filesystem/FileSystem");
    const PreferencesManager = require("preferences/PreferencesManager");
    const FileUtils = require("file/FileUtils");
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
     * this function checks if the TabBar is currently enabled or not (no. of tabs is 0 means tab bar is disabled)
     * @returns {boolean} true if TabBar is enabled and should be active
     */
    function isTabBarActive() {
        return Preference.tabBarEnabled && Preference.tabBarNumberOfTabs !== 0;
    }

    /**
     * This function is responsible to take all the files from the working set and gets the working sets ready
     * This is placed here instead of helper.js because it modifies the working sets
     */
    function getAllFilesFromWorkingSet() {
        if (!isTabBarActive()) {
            return;
        }

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
        const isActive = entry.path === activePathInPane;

        // Current active pane (used to determine whether to add the blue underline)
        const currentActivePane = MainViewManager.getActivePaneId();
        const isPaneActive = paneId === currentActivePane;

        const isDirty = Helper._isFileModified(FileSystem.getFileForPath(entry.path));
        const isPlaceholder = entry.isPlaceholder === true;

        let gitStatus = ""; // this will be shown in the tooltip when a tab is hovered
        let gitStatusClass = ""; // for styling

        if (window.phoenixGitEvents && window.phoenixGitEvents.TabBarIntegration) {
            const TabBarIntegration = window.phoenixGitEvents.TabBarIntegration;

            // find the Git status
            // if untracked we add the git-new class and U char
            // if modified we add the git-modified class and M char
            if (TabBarIntegration.isUntracked(entry.path)) {
                gitStatus = "Untracked";
                gitStatusClass = "git-new";
            } else if (TabBarIntegration.isModified(entry.path)) {
                gitStatus = "Modified";
                gitStatusClass = "git-modified";
            }
        }

        // create tab with all the appropriate classes
        const $tab = $(
            `<div class="tab 
            ${isActive ? "active" : ""}
            ${isDirty ? "dirty" : ""}
            ${isPlaceholder ? "placeholder" : ""}
            ${gitStatusClass}"
            data-path="${entry.path}" 
            title="${Phoenix.app.getDisplayPath(entry.path)}${gitStatus ? " (" + gitStatus + ")" : ""}">
            <div class="tab-icon"></div>
            <div class="tab-name"></div>
            <div class="tab-close"><i class="fa-solid fa-times"></i></div>
        </div>`
        );

        // Add the file icon
        const $icon = Helper._getFileIcon(entry);
        $tab.find(".tab-icon").append($icon);

        // Check if we have a directory part in the displayName
        const $tabName = $tab.find(".tab-name");
        if (entry.displayName && entry.displayName !== entry.name) {
            // Split the displayName into directory and filename parts
            const parts = entry.displayName.split("/");
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
            $tab.addClass("active-in-inactive-pane");
        }

        // if this is a placeholder tab in inactive pane, we need to use the brown styling
        // instead of the blue one for active tabs
        if (isPlaceholder && isActive && !isPaneActive) {
            $tab.removeClass("active");
            $tab.addClass("active-in-inactive-pane");
        }

        return $tab;
    }

    /**
     * Creates the tab bar and adds it to the DOM
     */
    function createTabBar() {
        if (!isTabBarActive()) {
            cleanupTabBar();
            return;
        }

        // clean up any existing tab bars first and start fresh
        cleanupTabBar();

        const $paneHeader = $(".pane-header");
        if ($paneHeader.length === 1) {
            $tabBar = $(TabBarHTML);
            // since we need to add the tab bar before the editor which has .not-editor class
            $(".pane-header").after($tabBar);
            $("#overflow-button").attr("title", Strings.TABBAR_SHOW_HIDDEN_TABS);
            WorkspaceManager.recomputeLayout(true);
            updateTabs();
        } else if ($paneHeader.length === 2) {
            $tabBar = $(TabBarHTML);
            $tabBar2 = $(TabBarHTML2);

            // eq(0) is for the first pane and eq(1) is for the second pane
            // TODO: Fix bug where the tab bar gets hidden inside the editor in horizontal split
            $paneHeader.eq(0).after($tabBar);
            $paneHeader.eq(1).after($tabBar2);
            $("#overflow-button").attr("title", Strings.TABBAR_SHOW_HIDDEN_TABS);
            $("#overflow-button-2").attr("title", Strings.TABBAR_SHOW_HIDDEN_TABS);
            WorkspaceManager.recomputeLayout(true);
            updateTabs();
        }
    }

    /**
     * This function updates the tabs in the tab bar
     * It is called when the working set changes. So instead of creating a new tab bar, we just update the existing one
     */
    function updateTabs() {
        if (!isTabBarActive()) {
            return;
        }

        // Get all files from the working set. refer to `global.js`
        getAllFilesFromWorkingSet();

        // just to make sure that the number of tabs is not set to 0
        if (Preference.tabBarNumberOfTabs === 0) {
            cleanupTabBar();
            return;
        }

        // Check for active files not in working set in any pane
        const activePane = MainViewManager.getActivePaneId();
        const firstPaneFile = MainViewManager.getCurrentlyViewedFile("first-pane");
        const secondPaneFile = MainViewManager.getCurrentlyViewedFile("second-pane");

        // when a file is opened from the filetree and is not present in the working set, then it is a placeholder
        let firstPanePlaceholder = null;
        let secondPanePlaceholder = null;

        // Check if active file in first pane is not in the working set
        if (firstPaneFile && !Global.firstPaneWorkingSet.some((entry) => entry.path === firstPaneFile.fullPath)) {
            firstPanePlaceholder = {
                path: firstPaneFile.fullPath,
                name: firstPaneFile.name,
                isPlaceholder: true,
                displayName: firstPaneFile.name // for now we initialize with name, will check for duplicates later
            };
        }

        // Check if active file in second pane is not in the working set
        if (secondPaneFile && !Global.secondPaneWorkingSet.some((entry) => entry.path === secondPaneFile.fullPath)) {
            secondPanePlaceholder = {
                path: secondPaneFile.fullPath,
                name: secondPaneFile.name,
                isPlaceholder: true,
                displayName: secondPaneFile.name
            };
        }

        // check for duplicate file names between placeholder tabs and working set entries
        if (firstPanePlaceholder) {
            // if any working set file has the same name as the placeholder
            const hasDuplicate = Global.firstPaneWorkingSet.some((entry) => entry.name === firstPanePlaceholder.name);

            if (hasDuplicate) {
                // extract directory name from path
                const path = firstPanePlaceholder.path;
                const parentDir = FileUtils.getDirectoryPath(path);
                const dirParts = parentDir.split("/");
                const parentDirName = dirParts[dirParts.length - 2] || "";

                // Update displayName with directory
                firstPanePlaceholder.displayName = parentDirName + "/" + firstPanePlaceholder.name;
            }
        }

        if (secondPanePlaceholder) {
            const hasDuplicate = Global.secondPaneWorkingSet.some((entry) => entry.name === secondPanePlaceholder.name);

            if (hasDuplicate) {
                const path = secondPanePlaceholder.path;
                const parentDir = FileUtils.getDirectoryPath(path);
                const dirParts = parentDir.split("/");
                const parentDirName = dirParts[dirParts.length - 2] || "";

                secondPanePlaceholder.displayName = parentDirName + "/" + secondPanePlaceholder.name;
            }
        }

        // Create tab bar if there's a placeholder or a file in the working set
        if (
            (Global.firstPaneWorkingSet.length > 0 || firstPanePlaceholder) &&
            (!$("#phoenix-tab-bar").length || $("#phoenix-tab-bar").is(":hidden"))
        ) {
            createTabBar();
        }

        if (
            (Global.secondPaneWorkingSet.length > 0 || secondPanePlaceholder) &&
            (!$("#phoenix-tab-bar-2").length || $("#phoenix-tab-bar-2").is(":hidden"))
        ) {
            createTabBar();
        }

        const $firstTabBar = $("#phoenix-tab-bar");
        // Update first pane's tabs
        if ($firstTabBar.length) {
            $firstTabBar.empty();
            if (Global.firstPaneWorkingSet.length > 0 || firstPanePlaceholder) {
                // get the count of tabs that we want to display in the tab bar (from preference settings)
                // from preference settings or working set whichever smaller
                let tabsCountP1 = Math.min(Global.firstPaneWorkingSet.length, Preference.tabBarNumberOfTabs);

                // the value is generally '-1', but we check for less than 0 so that it can handle edge cases gracefully
                // if the value is negative then we display all tabs
                if (Preference.tabBarNumberOfTabs < 0) {
                    tabsCountP1 = Global.firstPaneWorkingSet.length;
                }

                let displayedEntries = [];

                // check if active file is in the working set but would be excluded by tab count
                if (firstPaneFile && Preference.tabBarNumberOfTabs > 0) {
                    const activeFileIndex = Global.firstPaneWorkingSet.findIndex(
                        (entry) => entry.path === firstPaneFile.fullPath
                    );

                    if (activeFileIndex >= 0 && activeFileIndex >= Preference.tabBarNumberOfTabs) {
                        // active file is in working set but would be excluded by tab count
                        // Show active file and one less from the top N files
                        displayedEntries = [
                            ...Global.firstPaneWorkingSet.slice(0, Preference.tabBarNumberOfTabs - 1),
                            Global.firstPaneWorkingSet[activeFileIndex]
                        ];
                    } else {
                        // Active file is either not in working set or already included in top N files
                        displayedEntries = Global.firstPaneWorkingSet.slice(0, tabsCountP1);
                    }
                } else {
                    displayedEntries = Global.firstPaneWorkingSet.slice(0, tabsCountP1);
                }

                // Add working set tabs
                displayedEntries.forEach(function (entry) {
                    $firstTabBar.append(createTab(entry, "first-pane"));
                });

                // Add placeholder tab if needed
                if (firstPanePlaceholder) {
                    $firstTabBar.append(createTab(firstPanePlaceholder, "first-pane"));
                }
            }
        }

        const $secondTabBar = $("#phoenix-tab-bar-2");
        // Update second pane's tabs
        if ($secondTabBar.length) {
            $secondTabBar.empty();
            if (Global.secondPaneWorkingSet.length > 0 || secondPanePlaceholder) {
                let tabsCountP2 = Math.min(Global.secondPaneWorkingSet.length, Preference.tabBarNumberOfTabs);
                if (Preference.tabBarNumberOfTabs < 0) {
                    tabsCountP2 = Global.secondPaneWorkingSet.length;
                }

                let displayedEntries2 = [];

                if (secondPaneFile && Preference.tabBarNumberOfTabs > 0) {
                    const activeFileIndex = Global.secondPaneWorkingSet.findIndex(
                        (entry) => entry.path === secondPaneFile.fullPath
                    );

                    if (activeFileIndex >= 0 && activeFileIndex >= Preference.tabBarNumberOfTabs) {
                        displayedEntries2 = [
                            ...Global.secondPaneWorkingSet.slice(0, Preference.tabBarNumberOfTabs - 1),
                            Global.secondPaneWorkingSet[activeFileIndex]
                        ];
                    } else {
                        displayedEntries2 = Global.secondPaneWorkingSet.slice(0, tabsCountP2);
                    }
                } else {
                    displayedEntries2 = Global.secondPaneWorkingSet.slice(0, tabsCountP2);
                }

                // Add working set tabs
                displayedEntries2.forEach(function (entry) {
                    $secondTabBar.append(createTab(entry, "second-pane"));
                });

                // Add placeholder tab if needed
                if (secondPanePlaceholder) {
                    $secondTabBar.append(createTab(secondPanePlaceholder, "second-pane"));
                }
            }
        }

        // if no files are present in a pane and no placeholder, we want to hide the tab bar for that pane
        if (Global.firstPaneWorkingSet.length === 0 && !firstPanePlaceholder && $("#phoenix-tab-bar")) {
            Helper._hideTabBar($("#phoenix-tab-bar"), $("#overflow-button"));
        }

        if (Global.secondPaneWorkingSet.length === 0 && !secondPanePlaceholder && $("#phoenix-tab-bar-2")) {
            Helper._hideTabBar($("#phoenix-tab-bar-2"), $("#overflow-button-2"));
        }

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
        DragDrop.init($("#phoenix-tab-bar"), $("#phoenix-tab-bar-2"));
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
            // Get the file path from the data-path attribute of the parent tab
            const filePath = $(this).attr("data-path");
            if (!filePath) { return; }

            // determine the pane inside which the tab belongs
            const isSecondPane = $(this).closest("#phoenix-tab-bar-2").length > 0;
            const paneId = isSecondPane ? "second-pane" : "first-pane";

            // get the file object
            const fileObj = FileSystem.getFileForPath(filePath);

            // check if the clicked element is the close button
            if ($(event.target).hasClass("fa-times") || $(event.target).closest(".tab-close").length) {
                event.preventDefault();
                event.stopPropagation();

                CommandManager.execute(Commands.FILE_CLOSE, { file: fileObj, paneId: paneId }); // close the file
            }
        });

        // open tab on mousedown event
        $(document).on("mousedown", ".phoenix-tab-bar .tab", function (event) {
            // to prevent right-clicks from making the tab active
            if (event.button === 2) { return; }

            if ($(event.target).hasClass("fa-times") || $(event.target).closest(".tab-close").length) {
                return;
            }

            // Get the file path from the data-path attribute of the parent tab
            const filePath = $(this).attr("data-path");
            if (!filePath) { return; }

            // determine the pane inside which the tab belongs
            const isSecondPane = $(this).closest("#phoenix-tab-bar-2").length > 0;
            const paneId = isSecondPane ? "second-pane" : "first-pane";

            // get the file object
            const fileObj = FileSystem.getFileForPath(filePath);
            const currentActivePane = MainViewManager.getActivePaneId();
            const isPaneActive = paneId === currentActivePane;
            const currentFile = MainViewManager.getCurrentlyViewedFile(currentActivePane);

            // if the clicked tab is a placeholder tab, we add it to the working set
            if ($(this).hasClass("placeholder")) {
                MainViewManager.addToWorkingSet(paneId, fileObj);
            }

            // clicked tab is already active, don't do anything
            if (isPaneActive && currentFile && currentFile.fullPath === filePath) { return; }
            CommandManager.execute(Commands.FILE_OPEN, { fullPath: filePath, paneId: paneId });
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
            MoreOptions.showMoreOptionsContextMenu(paneId, filePath, event.pageX, event.pageY);
        });
    }

    // debounce is used to prevent rapid consecutive calls to updateTabs,
    // which was causing integration tests to fail in Firefox. Without it,
    // the event fires too frequently when switching editors, leading to unexpected behavior
    const debounceUpdateTabs = _.debounce(updateTabs, 2);

    /**
     * This function is responsible to add the placeholder tab to the working set (if user press save on it)
     * @param {Event} event
     * @param {String} commandId - the command id, to make sure we check it do the operation only on file save
     */
    function onFileSave(event, commandId) {
        if (!isTabBarActive()) {
            return;
        }

        if (commandId === Commands.FILE_SAVE || commandId === Commands.FILE_SAVE_ALL) {
            const activePane = MainViewManager.getActivePaneId();
            const currentFile = MainViewManager.getCurrentlyViewedFile(activePane);

            if (currentFile) {
                const filePath = currentFile.fullPath;

                // check if this file is currently shown as a placeholder in any pane
                const isFirstPanePlaceholder =
                    MainViewManager.getCurrentlyViewedFile("first-pane") &&
                    MainViewManager.getCurrentlyViewedFile("first-pane").fullPath === filePath &&
                    !Global.firstPaneWorkingSet.some((entry) => entry.path === filePath);

                const isSecondPanePlaceholder =
                    MainViewManager.getCurrentlyViewedFile("second-pane") &&
                    MainViewManager.getCurrentlyViewedFile("second-pane").fullPath === filePath &&
                    !Global.secondPaneWorkingSet.some((entry) => entry.path === filePath);

                // if it's a placeholder tab, we add it to the working set
                if (isFirstPanePlaceholder) {
                    const fileObj = FileSystem.getFileForPath(filePath);
                    MainViewManager.addToWorkingSet("first-pane", fileObj);
                }

                if (isSecondPanePlaceholder) {
                    const fileObj = FileSystem.getFileForPath(filePath);
                    MainViewManager.addToWorkingSet("second-pane", fileObj);
                }
            }
        }
    }

    /**
     * Registers the event handlers
     */
    function _registerHandlers() {
        // For pane layout changes, recreate the entire tab bar container
        MainViewManager.on("paneCreate paneDestroy paneLayoutChange", createTabBar);

        // For active pane changes, update only the tabs
        MainViewManager.on("activePaneChange", debounceUpdateTabs);

        // For editor changes, update only the tabs.
        MainViewManager.on(MainViewManager.EVENT_CURRENT_FILE_CHANGE, debounceUpdateTabs);

        // to listen for the Git status changes
        // make sure that the git extension is available
        if (window.phoenixGitEvents && window.phoenixGitEvents.EventEmitter) {
            window.phoenixGitEvents.EventEmitter.on("GIT_FILE_STATUS_CHANGED", debounceUpdateTabs);
        }

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

        // listen for file save commands, needed to add placeholder tab to the working set
        CommandManager.off("beforeExecuteCommand", onFileSave);
        CommandManager.on("beforeExecuteCommand", onFileSave);

        // File dirty flag change handling
        DocumentManager.on("dirtyFlagChange", function (event, doc) {
            if (!isTabBarActive()) {
                return;
            }

            const filePath = doc.file.fullPath;

            // Update UI
            if ($tabBar) {
                const $tab = $tabBar.find(`.tab[data-path="${filePath}"]`);
                $tab.toggleClass("dirty", doc.isDirty);

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
                $tab2.toggleClass("dirty", doc.isDirty);

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

        if (isTabBarActive()) {
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
        CommandManager.register(Strings.CMD_TOGGLE_TABBAR, Commands.TOGGLE_TABBAR, () => {
            const currentPref = PreferencesManager.get(Preference.PREFERENCES_TAB_BAR);
            PreferencesManager.set(Preference.PREFERENCES_TAB_BAR, {
                ...currentPref,
                showTabBar: !currentPref.showTabBar
            });
        });
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
        $(document).on("wheel", "#phoenix-tab-bar, #phoenix-tab-bar-2", handleMouseWheel);
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

        MoreOptions.init();
        Overflow.init();
        DragDrop.init($("#phoenix-tab-bar"), $("#phoenix-tab-bar-2"));

        // setup the mouse wheel scrolling
        setupTabBarScrolling();
    });
});
