/* eslint-disable no-invalid-this */
define(function (require, exports, module) {
    const AppInit = require("utils/AppInit");
    const MainViewManager = require("view/MainViewManager");
    const EditorManager = require("editor/EditorManager");
    const FileSystem = require("filesystem/FileSystem");
    const PreferencesManager = require("preferences/PreferencesManager");
    const CommandManager = require("command/CommandManager");
    const Commands = require("command/Commands");
    const DocumentManager = require("document/DocumentManager");

    const Global = require("./global");
    const Helper = require("./helper");
    const Preference = require("./preference");
    const MoreOptions = require("./more-options");
    const Overflow = require("./overflow");
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
     * @returns {$.Element} the tab element
     */
    function createTab(entry) {
        if (!$tabBar) {
            return;
        }

        // set up all the necessary properties
        const activeEditor = EditorManager.getActiveEditor();
        const activePath = activeEditor ? activeEditor.document.file.fullPath : null;
        const isActive = entry.path === activePath; // if the file is the currently active file
        const isDirty = Helper._isFileModified(FileSystem.getFileForPath(entry.path)); // if the file is dirty

        // Create the tab element with the structure we need
        // tab name is written as a separate div because it may include directory info which we style differently
        const $tab = $(
            `<div class="tab ${isActive ? 'active' : ''} ${isDirty ? 'dirty' : ''}" 
            data-path="${entry.path}" 
            title="${entry.path}">
            <div class="tab-icon"></div>
            <div class="tab-name"></div>
            <div class="tab-close"><i class="fa-solid fa-times"></i></div>
        </div>`);

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

        return $tab;
    }


    /**
     * Sets up the tab bar
     */
    function setupTabBar() {
        // this populates the working sets
        getAllFilesFromWorkingSet();

        // if no files are present in a pane, we want to hide the tab bar for that pane
        const $firstTabBar = $('#phoenix-tab-bar');
        const $secondTabBar = $('#phoenix-tab-bar-2');

        if (Global.firstPaneWorkingSet.length === 0 && ($('#phoenix-tab-bar'))) {
            Helper._hideTabBar($('#phoenix-tab-bar'), $('#overflow-button'));
        }

        if (Global.secondPaneWorkingSet.length === 0 && ($('#phoenix-tab-bar-2'))) {
            Helper._hideTabBar($('#phoenix-tab-bar-2'), $('#overflow-button-2'));
        }

        // get the count of tabs that we want to display in the tab bar (from preference settings)
        // from preference settings or working set whichever smaller
        let tabsCountP1 = Math.min(Global.firstPaneWorkingSet.length, Preference.tabBarNumberOfTabs);
        let tabsCountP2 = Math.min(Global.secondPaneWorkingSet.length, Preference.tabBarNumberOfTabs);

        // the value is generally '-1', but we check for less than 0 so that it can handle edge cases gracefully
        // if the value is negative then we display all tabs
        if (Preference.tabBarNumberOfTabs < 0) {
            tabsCountP1 = Global.firstPaneWorkingSet.length;
            tabsCountP2 = Global.secondPaneWorkingSet.length;
        }

        // get the active editor and path once to reuse for both panes
        const activeEditor = EditorManager.getActiveEditor();
        const activePath = activeEditor ? activeEditor.document.file.fullPath : null;

        // handle the first pane tabs
        if (Global.firstPaneWorkingSet.length > 0 && tabsCountP1 > 0 && $firstTabBar.length) {
            // get the top n entries for the first pane
            let displayedEntries = Global.firstPaneWorkingSet.slice(0, tabsCountP1);

            // if the active file isn't already visible but exists in the working set, force-include it
            if (activePath && !displayedEntries.some(entry => entry.path === activePath)) {
                let activeEntry = Global.firstPaneWorkingSet.find(entry => entry.path === activePath);
                if (activeEntry) {
                    // replace the last tab with the active file.
                    displayedEntries[displayedEntries.length - 1] = activeEntry;
                }
            }

            // add each tab to the first pane's tab bar
            displayedEntries.forEach(function (entry) {
                $firstTabBar.append(createTab(entry));
                Overflow.toggleOverflowVisibility("first-pane");
            });
        }

        // for second pane tabs
        if (Global.secondPaneWorkingSet.length > 0 && tabsCountP2 > 0 && $secondTabBar.length) {
            let displayedEntries2 = Global.secondPaneWorkingSet.slice(0, tabsCountP2);

            if (activePath && !displayedEntries2.some(entry => entry.path === activePath)) {
                let activeEntry = Global.secondPaneWorkingSet.find(entry => entry.path === activePath);
                if (activeEntry) {
                    displayedEntries2[displayedEntries2.length - 1] = activeEntry;
                }
            }

            displayedEntries2.forEach(function (entry) {
                $secondTabBar.append(createTab(entry));
                Overflow.toggleOverflowVisibility("second-pane");
            });
        }
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

        if ($('.not-editor').length === 1) {
            $tabBar = $(TabBarHTML);
            // since we need to add the tab bar before the editor area, we target the `.not-editor` class
            $(".not-editor").before($tabBar);
        } else if ($('.not-editor').length === 2) {
            $tabBar = $(TabBarHTML);
            $tabBar2 = $(TabBarHTML2);

            // eq(0) is for the first pane and eq(1) is for the second pane
            $(".not-editor").eq(0).before($tabBar);
            $(".not-editor").eq(1).before($tabBar2);
        }

        setupTabBar();
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
    }


    /**
     * Handle close button click on tabs
     * This function will remove the file from the working set
     *
     * @param {String} filePath - path of the file to close
     */
    function handleTabClose(filePath) {
        // Logic: First open the file we want to close, then close it and finally restore focus
        // Why? Because FILE_CLOSE removes the currently active file from the working set

        // Get the current active editor to restore focus later
        const currentActiveEditor = EditorManager.getActiveEditor();
        const currentActivePath = currentActiveEditor ? currentActiveEditor.document.file.fullPath : null;

        // Only need to open the file first if it's not the currently active one
        if (currentActivePath !== filePath) {
            // open the file we want to close
            CommandManager.execute(Commands.FILE_OPEN, { fullPath: filePath })
                .done(function () {
                    // close it
                    CommandManager.execute(Commands.FILE_CLOSE)
                        .done(function () {
                            // If we had a different file active before, restore focus to it
                            if (currentActivePath && currentActivePath !== filePath) {
                                CommandManager.execute(Commands.FILE_OPEN, { fullPath: currentActivePath });
                            }
                        })
                        .fail(function (error) {
                            console.error("Failed to close file:", filePath, error);
                        });
                })
                .fail(function (error) {
                    console.error("Failed to open file for closing:", filePath, error);
                });
        } else {
            // if it's already the active file, just close it
            CommandManager.execute(Commands.FILE_CLOSE)
                .fail(function (error) {
                    console.error("Failed to close file:", filePath, error);
                });
        }
    }


    /**
     * handle click events on the tabs to open the file
     */
    function handleTabClick() {

        // delegate event handling for both tab bars
        $(document).on("click", ".tab", function (event) {
            // check if the clicked element is the close button
            if ($(event.target).hasClass('fa-times') || $(event.target).closest('.tab-close').length) {
                // Get the file path from the data-path attribute of the parent tab
                const filePath = $(this).attr("data-path");
                if (filePath) {
                    handleTabClose(filePath);
                    // Prevent default behavior
                    event.preventDefault();
                    event.stopPropagation();
                }
                return;
            }

            // Get the file path from the data-path attribute
            const filePath = $(this).attr("data-path");

            if (filePath) {
                // we need to determine which pane the tab belongs to
                const isSecondPane = $(this).closest("#phoenix-tab-bar-2").length > 0;
                const paneId = isSecondPane ? "second-pane" : "first-pane";

                // Set the active pane and open the file
                MainViewManager.setActivePaneId(paneId);
                CommandManager.execute(Commands.FILE_OPEN, { fullPath: filePath });

                // Prevent default behavior
                event.preventDefault();
                event.stopPropagation();
            }
        });

        // Add contextmenu (right-click) handler
        $(document).on("contextmenu", ".tab", function (event) {
            event.preventDefault();
            event.stopPropagation();

            // Determine which pane the tab belongs to
            const isSecondPane = $(this).closest("#phoenix-tab-bar-2").length > 0;
            const paneId = isSecondPane ? "second-pane" : "first-pane";

            // Show context menu at mouse position
            MoreOptions.showMoreOptionsContextMenu(paneId, event.pageX, event.pageY);
        });
    }


    /**
     * Registers the event handlers
     */
    function registerHandlers() {

        // pane handlers
        MainViewManager.off("activePaneChange paneCreate paneDestroy paneLayoutChange", createTabBar);
        MainViewManager.on("activePaneChange paneCreate paneDestroy paneLayoutChange", createTabBar);

        // editor handlers
        EditorManager.off("activeEditorChange", createTabBar);
        EditorManager.on("activeEditorChange", createTabBar);

        // when working set changes, recreate the tab bar
        // we listen to all of these events to ensure that the tab bar is always up to date
        // refer to `MainViewManager.js` for more details
        MainViewManager.on("workingSetAdd", createTabBar);
        MainViewManager.on("workingSetRemove", createTabBar);
        MainViewManager.on("workingSetSort", createTabBar);
        MainViewManager.on("workingSetMove", createTabBar);
        MainViewManager.on("workingSetAddList", createTabBar);
        MainViewManager.on("workingSetRemoveList", createTabBar);
        MainViewManager.on("workingSetUpdate", createTabBar);
        MainViewManager.on("_workingSetDisableAutoSort", createTabBar);


        // file dirty flag change handler
        DocumentManager.on("dirtyFlagChange", function (event, doc) {
            const filePath = doc.file.fullPath;

            // Update UI
            const $tab = $tabBar.find(`.tab[data-path="${filePath}"]`);
            $tab.toggleClass('dirty', doc.isDirty);

            // Also update the $tab2 if it exists
            if ($tabBar2) {
                const $tab2 = $tabBar2.find(`.tab[data-path="${filePath}"]`);
                $tab2.toggleClass('dirty', doc.isDirty);
            }

            // Update the working set data
            // First pane
            for (let i = 0; i < Global.firstPaneWorkingSet.length; i++) {
                if (Global.firstPaneWorkingSet[i].path === filePath) {
                    Global.firstPaneWorkingSet[i].isDirty = doc.isDirty;
                    break;
                }
            }

            // Second pane
            for (let i = 0; i < Global.secondPaneWorkingSet.length; i++) {
                if (Global.secondPaneWorkingSet[i].path === filePath) {
                    Global.secondPaneWorkingSet[i].isDirty = doc.isDirty;
                    break;
                }
            }
        });
    }


    /**
     * This is called when the tab bar preference is changed
     * It takes care of creating or cleaning up the tab bar
     */
    function preferenceChanged() {
        Preference.tabBarEnabled = PreferencesManager.get(Preference.PREFERENCES_TAB_BAR).showTabBar;
        Preference.tabBarNumberOfTabs = PreferencesManager.get(Preference.PREFERENCES_TAB_BAR).numberOfTabs;

        // preference should be enabled and number of tabs should be greater than 0
        if (Preference.tabBarEnabled && Preference.tabBarNumberOfTabs !== 0) {
            createTabBar();
        } else {
            cleanupTabBar();
        }
    }



    AppInit.appReady(function () {

        PreferencesManager.on("change", Preference.PREFERENCES_TAB_BAR, preferenceChanged);
        // calling preference changed here itself to check if the tab bar is enabled,
        // because if it is enabled, preferenceChange automatically calls createTabBar
        preferenceChanged();

        // this should be called at the last as everything should be setup before registering handlers
        registerHandlers();

        // handle when a single tab gets clicked
        handleTabClick();

        Overflow.init();
    });
});
