define(function (require, exports, module) {
    const AppInit = require("utils/AppInit");
    const MainViewManager = require("view/MainViewManager");
    const EditorManager = require("editor/EditorManager");
    const FileSystem = require("filesystem/FileSystem");
    const PreferencesManager = require("preferences/PreferencesManager");
    const CommandManager = require("command/CommandManager");
    const Commands = require("command/Commands");


    const Helper = require("./helper");
    const Preference = require("./preference");
    const TabBarHTML = require("text!./html/tabbar-pane.html");
    const TabBarHTML2 = require("text!./html/tabbar-second-pane.html");


    /**
     * This array's represents the current working set
     * It holds all the working set items that are to be displayed in the tab bar
     * Properties of each object:
     * path: {String} full path of the file
     * name: {String} name of the file
     * isFile: {Boolean} whether the file is a file or a directory
     * isDirty: {Boolean} whether the file is dirty
     * isPinned: {Boolean} whether the file is pinned
     * displayName: {String} name to display in the tab (may include directory info for duplicate files)
     */
    let firstPaneWorkingSet = [];
    let secondPaneWorkingSet = [];


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
        firstPaneWorkingSet = [];
        secondPaneWorkingSet = [];

        // this gives the list of panes. When both panes are open, it will be ['first-pane', 'second-pane']
        const paneList = MainViewManager.getPaneIdList();

        // to make sure atleast one pane is open
        if (paneList && paneList.length > 0) {

            // this gives the working set of the first pane
            const currFirstPaneWorkingSet = MainViewManager.getWorkingSet(paneList[0]);

            for (let i = 0; i < currFirstPaneWorkingSet.length; i++) {
                // MainViewManager.getWorkingSet gives the working set of the first pane,
                // but it has lot of details we don't need. Hence we use Helper._getRequiredDataFromEntry
                firstPaneWorkingSet.push(Helper._getRequiredDataFromEntry(currFirstPaneWorkingSet[i]));
            }
            // if there are duplicate file names, we update the displayName to include the directory
            Helper._handleDuplicateFileNames(firstPaneWorkingSet);

            // check if second pane is open
            if (paneList.length > 1) {
                const currSecondPaneWorkingSet = MainViewManager.getWorkingSet(paneList[1]);

                for (let i = 0; i < currSecondPaneWorkingSet.length; i++) {
                    secondPaneWorkingSet.push(Helper._getRequiredDataFromEntry(currSecondPaneWorkingSet[i]));
                }
                Helper._handleDuplicateFileNames(secondPaneWorkingSet);

            }
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
            `<div class="tab ${isActive ? 'active' : ''}" 
            data-path="${entry.path}" 
            title="${entry.path}">
            <div class="tab-icon"></div>
            <div class="tab-name"></div>
            <div class="tab-close"><i class="fa-solid fa-xmark"></i></div>
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

        // make sure there is atleast one file in the first pane working set
        if (firstPaneWorkingSet.length > 0) {
            for (let i = 0; i < firstPaneWorkingSet.length; i++) {
                // Note: here we add the element to the tab bar directly and not the tab-container
                $('#phoenix-tab-bar').append(createTab(firstPaneWorkingSet[i]));
            }
        }

        if (secondPaneWorkingSet.length > 0) {
            for (let i = 0; i < secondPaneWorkingSet.length; i++) {
                $('#phoenix-tab-bar-2').append(createTab(secondPaneWorkingSet[i]));
            }
        }
    }


    /**
     * Creates the tab bar and adds it to the DOM
     */
    function createTabBar() {
        if (!Preference.tabBarEnabled || !EditorManager.getActiveEditor()) {
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
     * When any change is made to the working set, we just recreate the tab bar
     * The changes may be adding/removing a file or changing the active file
     */
    function workingSetChanged() {
        cleanupTabBar();
        createTabBar();
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
     * handle click events on the tabs to open the file or close the tab
     */
    function handleTabClick() {

        // delegate event handling for both tab bars
        $(document).on("click", ".tab", function (event) {
            // check if the clicked element is the close button
            if ($(event.target).hasClass('fa-xmark') || $(event.target).closest('.tab-close').length) {
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
        MainViewManager.on("workingSetAdd", workingSetChanged);
        MainViewManager.on("workingSetRemove", workingSetChanged);
        MainViewManager.on("workingSetListChange", workingSetChanged);

    }


    /**
     * This is called when the tab bar preference is changed
     * It takes care of creating or cleaning up the tab bar
     *
     * TODO: handle the number of tabs functionality
     */
    function preferenceChanged() {
        Preference.tabBarEnabled = PreferencesManager.get(Preference.PREFERENCES_TAB_BAR).showTabBar;
        Preference.tabBarNumberOfTabs = PreferencesManager.get(Preference.PREFERENCES_TAB_BAR).numberOfTabs;

        if (Preference.tabBarEnabled) {
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
    });
});


// TODO: Bug (when we have two panes and one pane gets empty by closing all files in it, the other pane tab bar also gets removed)