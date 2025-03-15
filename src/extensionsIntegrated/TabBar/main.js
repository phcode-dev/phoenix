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
    const WorkspaceManager = require("view/WorkspaceManager");

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

        // set up all the necessary properties
        const activeEditor = EditorManager.getActiveEditor();
        const activePath = activeEditor ? activeEditor.document.file.fullPath : null;

        const currentActivePane = MainViewManager.getActivePaneId();
        // if the file is the currently active file
        // also verify that the tab belongs to the active pane
        const isActive = (entry.path === activePath && paneId === currentActivePane);
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
        // this populates the working sets present in `global.js`
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
                $firstTabBar.append(createTab(entry, "first-pane"));
                Overflow.toggleOverflowVisibility("first-pane");
                setTimeout(function () {
                    Overflow.scrollToActiveTab($firstTabBar);
                }, 0);
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
                $secondTabBar.append(createTab(entry, "second-pane"));
                Overflow.toggleOverflowVisibility("second-pane");
                setTimeout(function () {
                    Overflow.scrollToActiveTab($secondTabBar);
                }, 0);
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
            // since we need to add the tab bar before the editor which has .not-editor class
            // we target the `.not-editor` class and add the tab bar before it
            $(".not-editor").before($tabBar);
            setTimeout(function () {
                WorkspaceManager.recomputeLayout(true);
            }, 0);

        } else if ($('.not-editor').length === 2) {
            $tabBar = $(TabBarHTML);
            $tabBar2 = $(TabBarHTML2);

            // eq(0) is for the first pane and eq(1) is for the second pane
            // here #editor-holder cannot be used as in split view, we only have one #editor-holder
            // so, right now we are using .not-editor. Maybe we need to look for some better selector
            // TODO: Fix bug where the tab bar gets hidden inside the editor in horizontal split
            $(".not-editor").eq(0).before($tabBar);
            $(".not-editor").eq(1).before($tabBar2);
            setTimeout(function () {
                WorkspaceManager.recomputeLayout(true);
            }, 0);
        }

        setupTabBar();
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
        if (Global.firstPaneWorkingSet.length === 1 || Global.secondPaneWorkingSet.length === 1) {
            createTabBar();
            return;
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
                return;
            }

            // Get the file path from the data-path attribute
            const filePath = $(this).attr("data-path");

            if (filePath) {
                CommandManager.execute(Commands.FILE_OPEN, { fullPath: filePath });

                // Prevent default behavior
                event.preventDefault();
                event.stopPropagation();
            }
        });

        // Add the contextmenu (right-click) handler
        $(document).on("contextmenu", ".tab", function (event) {
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


    /**
     * Registers the event handlers
     */
    function registerHandlers() {
        // For pane layout changes, recreate the entire tab bar container
        MainViewManager.off("paneCreate paneDestroy paneLayoutChange", createTabBar);
        MainViewManager.on("paneCreate paneDestroy paneLayoutChange", createTabBar);

        // For active pane changes, update only the tabs
        MainViewManager.off("activePaneChange", updateTabs);
        MainViewManager.on("activePaneChange", updateTabs);

        // For editor changes, update only the tabs.
        EditorManager.off("activeEditorChange", updateTabs);
        EditorManager.on("activeEditorChange", updateTabs);

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
        DragDrop.init($('#phoenix-tab-bar'), $('#phoenix-tab-bar-2'));
    });
});
