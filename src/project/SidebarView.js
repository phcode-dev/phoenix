/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 * Original work Copyright (c) 2012 - 2021 Adobe Systems Incorporated. All rights reserved.
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

/*global Phoenix*/

// @INCLUDE_IN_API_DOCS

/**
 * The view that controls the showing and hiding of the sidebar.
 *
 * Although the sidebar view doesn't dispatch any events directly, it is a
 * resizable element (../utils/Resizer.js), which means it can dispatch Resizer
 * events.  For example, if you want to listen for the sidebar showing
 * or hiding itself, set up listeners for the corresponding Resizer events,
 * panelCollapsed and panelExpanded:
 *
 *      $("#sidebar").on("panelCollapsed", ...);
 *      $("#sidebar").on("panelExpanded", ...);
 */
define(function (require, exports, module) {


    var AppInit             = require("utils/AppInit"),
        ProjectManager      = require("project/ProjectManager"),
        PreferencesManager  = require("preferences/PreferencesManager"),
        WorkingSetView      = require("project/WorkingSetView"),
        MainViewManager     = require("view/MainViewManager"),
        CommandManager      = require("command/CommandManager"),
        Commands            = require("command/Commands"),
        Strings             = require("strings"),
        Resizer             = require("utils/Resizer"),
        _                   = require("thirdparty/lodash");

    // These vars are initialized by the htmlReady handler
    // below since they refer to DOM elements
    var $sidebar,
        $splitViewMenu,
        $projectTitle,
        $projectFilesContainer,
        $workingSetViewsContainer;

    var _cmdSplitNone,
        _cmdSplitVertical,
        _cmdSplitHorizontal,
        _cmdToggleWorkingSet,
        _cmdToggleFileTabs;

    /**
     * @private
     * Update project title when the project root changes
     */
    function _updateProjectTitle() {
        var displayName = ProjectManager.getProjectRoot().name;
        var fullPath = ProjectManager.getProjectRoot().fullPath;

        if (displayName === "" && fullPath === "/") {
            displayName = "/";
        }

        $projectTitle.html(_.escape(displayName));
        $projectTitle.attr("title", Phoenix.app.getDisplayLocation(fullPath));

        // Trigger a scroll on the project files container to
        // reposition the scroller shadows and avoid issue #2255
        $projectFilesContainer.trigger("scroll");
    }

    /**
     * Toggle sidebar visibility.
     */
    function toggle() {
        Resizer.toggle($sidebar);
    }

    /**
     * Show the sidebar.
     */
    function show() {
        Resizer.show($sidebar);
    }

    /**
     * Hide the sidebar.
     */
    function hide() {
        Resizer.hide($sidebar);
    }

    /**
     * Returns the visibility state of the sidebar.
     * @return {boolean} true if element is visible, false if it is not visible
     */
    function isVisible() {
        return Resizer.isVisible($sidebar);
    }

    /**
     * Update state of working set
     * @private
     */
    function _updateWorkingSetState() {
        let enabled = false;

        if (MainViewManager.getPaneCount() === 1 &&
                MainViewManager.getWorkingSetSize(MainViewManager.ACTIVE_PANE) === 0) {
            $workingSetViewsContainer.hide();
        } else {
            $workingSetViewsContainer.show();
            enabled = true;
        }
        CommandManager.get(Commands.CMD_WORKINGSET_SORT_BY_ADDED).setEnabled(enabled);
        CommandManager.get(Commands.CMD_WORKINGSET_SORT_BY_NAME).setEnabled(enabled);
        CommandManager.get(Commands.CMD_WORKINGSET_SORT_BY_TYPE).setEnabled(enabled);
        CommandManager.get(Commands.CMD_WORKING_SORT_TOGGLE_AUTO).setEnabled(enabled);
    }

    /**
     * Update state of splitview and option elements
     * @private
     */
    function _updateUIStates() {
        var spriteIndex,
            layoutScheme = MainViewManager.getLayoutScheme();

        if (layoutScheme.columns > 1) {
            spriteIndex = 1;
        } else if (layoutScheme.rows > 1) {
            spriteIndex = 2;
        } else {
            spriteIndex = 0;
        }

        // SplitView Menu
        _cmdSplitNone.setChecked(spriteIndex === 0);
        _cmdSplitVertical.setChecked(spriteIndex === 1);
        _cmdSplitHorizontal.setChecked(spriteIndex === 2);

        // Options icon
        _updateWorkingSetState();
    }

    /**
     * Handle No Split Command
     * @private
     */
    function _handleSplitViewNone() {
        MainViewManager.setLayoutScheme(1, 1);
    }

    /**
     * Handle Vertical Split Command
     * @private
     */
    function _handleSplitViewVertical() {
        MainViewManager.setLayoutScheme(1, 2);
    }

    /**
     * Handle Horizontal Split Command
     * @private
     */
    function _handleSplitViewHorizontal() {
        MainViewManager.setLayoutScheme(2, 1);
    }

    /**
     * Handle Toggle Working Set Command
     * @private
     */
    function _handleToggleWorkingSet() {
        const isCurrentlyShown = PreferencesManager.get("showWorkingSet");
        PreferencesManager.set("showWorkingSet", !isCurrentlyShown);
        CommandManager.get(Commands.CMD_TOGGLE_SHOW_WORKING_SET).setChecked(!isCurrentlyShown);
    }

    /**
     * Handle Toggle File Tabs Command
     * @private
     */
    function _handleToggleFileTabs() {
        const prefs = PreferencesManager.get("tabBar.options");
        const willBeShown = !prefs.showTabBar;
        PreferencesManager.set("tabBar.options", {
            showTabBar: willBeShown,
            numberOfTabs: prefs.numberOfTabs
        });
        CommandManager.get(Commands.CMD_TOGGLE_SHOW_FILE_TABS).setChecked(willBeShown);
    }

    // Initialize items dependent on HTML DOM
    AppInit.htmlReady(function () {
        $sidebar                  = $("#sidebar");
        $splitViewMenu            = $sidebar.find(".working-set-splitview-btn");
        $projectTitle             = $sidebar.find("#project-title");
        $projectFilesContainer    = $sidebar.find("#project-files-container");
        $workingSetViewsContainer = $sidebar.find("#working-set-list-container");

        // apply working set visibility immediately
        // this is needed because otherwise when the working set is hidden there is a flashing issue
        if (!PreferencesManager.get("showWorkingSet")) {
            $workingSetViewsContainer.addClass("working-set-hidden");
        }

        // init
        $sidebar.on("panelResizeStart", function (evt, width) {
            $sidebar.find(".sidebar-selection-extension").css("display", "none");
            $sidebar.find(".scroller-shadow").css("display", "none");
        });

        $sidebar.on("panelResizeUpdate", function (evt, width) {
            ProjectManager._setFileTreeSelectionWidth(width);
        });

        $sidebar.on("panelResizeEnd", function (evt, width) {
            $sidebar.find(".sidebar-selection-extension").css("display", "block").css("left", width);
            $sidebar.find(".scroller-shadow").css("display", "block");
            $projectFilesContainer.triggerHandler("scroll");
            WorkingSetView.syncSelectionIndicator();
        });

        $sidebar.on("panelCollapsed", function (evt, width) {
            CommandManager.get(Commands.VIEW_HIDE_SIDEBAR).setName(Strings.CMD_SHOW_SIDEBAR);
        });

        $sidebar.on("panelExpanded", function (evt, width) {
            WorkingSetView.refresh();
            $sidebar.find(".scroller-shadow").css("display", "block");
            $sidebar.find(".sidebar-selection-extension").css("left", width);
            $projectFilesContainer.triggerHandler("scroll");
            WorkingSetView.syncSelectionIndicator();
            CommandManager.get(Commands.VIEW_HIDE_SIDEBAR).setName(Strings.CMD_HIDE_SIDEBAR);
        });

        // AppInit.htmlReady in utils/Resizer executes before, so it's possible that the sidebar
        // is collapsed before we add the event. Check here initially
        if (!$sidebar.is(":visible")) {
            $sidebar.trigger("panelCollapsed");
        }

        // wire up an event handler to monitor when panes are created
        MainViewManager.on("paneCreate", function (evt, paneId) {
            WorkingSetView.createWorkingSetViewForPane($workingSetViewsContainer, paneId);
        });

        MainViewManager.on("paneLayoutChange", function () {
            _updateUIStates();
        });

        MainViewManager.on("workingSetAdd workingSetAddList workingSetRemove workingSetRemoveList workingSetUpdate", function () {
            _updateWorkingSetState();
        });

        // create WorkingSetViews for each pane already created
        _.forEach(MainViewManager.getPaneIdList(), function (paneId) {
            WorkingSetView.createWorkingSetViewForPane($workingSetViewsContainer, paneId);
        });

        _updateUIStates();

        // Tooltips
        $splitViewMenu.attr("title", Strings.GEAR_MENU_TOOLTIP);

        _cmdToggleWorkingSet.setChecked(PreferencesManager.get("showWorkingSet"));
        _cmdToggleFileTabs.setChecked(PreferencesManager.get("tabBar.options").showTabBar);

        // to listen for tab bar preference changes from the preferences file
        // because if user toggles the state of tab bar visibility either from the view menu or the preferences file
        // we need to update the checked state here too
        PreferencesManager.on("change", "tabBar.options", function () {
            const prefs = PreferencesManager.get("tabBar.options");
            _cmdToggleFileTabs.setChecked(prefs.showTabBar);
        });

        // Define the preference to decide whether to show the working set or not
        PreferencesManager.definePreference("showWorkingSet", "boolean", true, {
            description: Strings.DESCRIPTION_SHOW_WORKING_SET
        })
            .on("change", function () {
                // 'working-set-list-container' is the id of the main working set element which we need to hide/show
                const $workingSet = $(document.getElementById("working-set-list-container"));
                const getPref = PreferencesManager.get("showWorkingSet");

                if(getPref) {
                    // refer to brackets.less file for styles
                    $workingSet.removeClass("working-set-hidden");
                } else {
                    $workingSet.addClass("working-set-hidden");
                }

                // update the menu item checked state to match the preference
                _cmdToggleWorkingSet.setChecked(getPref);
            });
    });

    ProjectManager.on("projectOpen", _updateProjectTitle);

    /**
     * Register Command Handlers
     * @private
     */
    _cmdSplitNone       = CommandManager.register(Strings.CMD_SPLITVIEW_NONE,       Commands.CMD_SPLITVIEW_NONE,       _handleSplitViewNone);
    _cmdSplitVertical   = CommandManager.register(Strings.CMD_SPLITVIEW_VERTICAL,   Commands.CMD_SPLITVIEW_VERTICAL,   _handleSplitViewVertical);
    _cmdSplitHorizontal = CommandManager.register(Strings.CMD_SPLITVIEW_HORIZONTAL, Commands.CMD_SPLITVIEW_HORIZONTAL, _handleSplitViewHorizontal);
    _cmdToggleWorkingSet = CommandManager.register(Strings.CMD_TOGGLE_SHOW_WORKING_SET, Commands.CMD_TOGGLE_SHOW_WORKING_SET, _handleToggleWorkingSet);
    _cmdToggleFileTabs = CommandManager.register(Strings.CMD_TOGGLE_SHOW_FILE_TABS, Commands.CMD_TOGGLE_SHOW_FILE_TABS, _handleToggleFileTabs);

    CommandManager.register(Strings.CMD_TOGGLE_SIDEBAR, Commands.VIEW_HIDE_SIDEBAR, toggle);
    CommandManager.register(Strings.CMD_SHOW_SIDEBAR, Commands.SHOW_SIDEBAR, show);
    CommandManager.register(Strings.CMD_HIDE_SIDEBAR, Commands.HIDE_SIDEBAR, hide);

    /**
     * Programmatically resize the sidebar to the given width. Persists
     * the new size so it is restored on reload, resyncs the drag handle,
     * and fires `panelResizeEnd`.
     *
     * @param {number} width  Desired sidebar width in pixels
     */
    function resize(width) {
        if (!$sidebar || !$sidebar.length) {
            return;
        }
        width = Math.round(width);
        $sidebar.width(width);
        $(".content").css("left", width);
        Resizer.resyncSizer($sidebar);
        var sidebarPrefs = PreferencesManager.getViewState("sidebar") || {};
        sidebarPrefs.size = width;
        PreferencesManager.setViewState("sidebar", sidebarPrefs);
        $sidebar.trigger("panelResizeEnd", [width]);
    }

    /**
     * Get the current sidebar width in pixels. Returns the CSS width
     * even if the sidebar is hidden (so the value can be restored later).
     *
     * @return {number}
     */
    function getWidth() {
        if (!$sidebar || !$sidebar.length) {
            return 0;
        }
        return $sidebar.width();
    }

    // Define public API
    exports.toggle      = toggle;
    exports.show        = show;
    exports.hide        = hide;
    exports.isVisible   = isVisible;
    exports.resize      = resize;
    exports.getWidth    = getWidth;
});
