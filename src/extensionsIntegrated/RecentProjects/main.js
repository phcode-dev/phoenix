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

define(function (require, exports, module) {


    // Brackets modules
    const ProjectManager          = require("project/ProjectManager"),
        SidebarView             = require("project/SidebarView"),
        PreferencesManager      = require("preferences/PreferencesManager"),
        Commands                = require("command/Commands"),
        CommandManager          = require("command/CommandManager"),
        Menus                   = require("command/Menus"),
        FileSystem              = require("filesystem/FileSystem"),
        AppInit                 = require("utils/AppInit"),
        KeyEvent                = require("utils/KeyEvent"),
        FileUtils               = require("file/FileUtils"),
        PopUpManager            = require("widgets/PopUpManager"),
        Strings                 = require("strings"),
        Mustache                = require("thirdparty/mustache/mustache"),
        ProjectsMenuTemplate    = require("text!./htmlContent/projects-menu.html"),
        ExtensionInterface = require("utils/ExtensionInterface");

    const RECENT_PROJECTS_INTERFACE = "Extn.Phoenix.recentProjects";

    ExtensionInterface.registerExtensionInterface(RECENT_PROJECTS_INTERFACE, exports);
    const RECENT_PROJECT_STATE = "recentProjects";

    /** @const {number} Maximum number of displayed recent projects */
    var MAX_PROJECTS = 20;

    /** @type {$.Element} jQuery elements used for the dropdown menu */
    let $dropdown;

    /**
     * Get the stored list of recent projects, fixing up paths as appropriate.
     * Warning: unlike most paths in Brackets, these lack a trailing "/"
     */
    function getRecentProjects() {
        var recentProjects = PreferencesManager.getViewState(RECENT_PROJECT_STATE) || [],
            i;

        for (i = 0; i < recentProjects.length; i++) {
            // We have to canonicalize & then de-canonicalize the path here, since our pref format uses no trailing "/"
            recentProjects[i] = FileUtils.stripTrailingSlash(ProjectManager.updateWelcomeProjectPath(recentProjects[i] + "/"));
        }
        return recentProjects;
    }

    /**
     * Add a project to the stored list of recent projects, up to MAX_PROJECTS.
     */
    function add() {
        const projectToAdd = ProjectManager.getProjectRoot().fullPath;
        if(projectToAdd === ProjectManager.getPlaceholderProjectPath()){
            return;
        }
        var root = FileUtils.stripTrailingSlash(projectToAdd),
            recentProjects = getRecentProjects(),
            index = recentProjects.indexOf(root);

        if (index !== -1) {
            recentProjects.splice(index, 1);
        }
        recentProjects.unshift(root);
        if (recentProjects.length > MAX_PROJECTS) {
            recentProjects = recentProjects.slice(0, MAX_PROJECTS);
        }
        PreferencesManager.setViewState(RECENT_PROJECT_STATE, recentProjects);
    }

    function removeFromRecentProject(fullPath) {
        fullPath = FileUtils.stripTrailingSlash(fullPath);
        let recentProjects = getRecentProjects(),
            index = recentProjects.indexOf(fullPath),
            newProjects = [],
            i;
        for (i = 0; i < recentProjects.length; i++) {
            if (i !== index) {
                newProjects.push(recentProjects[i]);
            }
        }
        PreferencesManager.setViewState(RECENT_PROJECT_STATE, newProjects);
    }

    /**
     * Handles the Key Down events
     * @param {KeyboardEvent} event
     * @param $popUp
     * @return {boolean} True if the key was handled
     */
    function _handlePopupKeyEvents(event, $popUp) {
        if(event.keyCode === KeyEvent.DOM_VK_DELETE){
            event.stopPropagation();
            const $selectedItem = $popUp.find(".selected");
            if ($selectedItem.length && $selectedItem.data("path")) {
                // Remove the project from the preferences.
                removeFromRecentProject($selectedItem.data("path"));
                PopUpManager.selectNextItem(+1, $popUp);
                $selectedItem.closest("li").remove();

                if (getRecentProjects().length === 1) {
                    $dropdown.find(".divider").remove();
                }
            }
            return true;
        }
    }


    /**
     * Close the dropdown.
     */
    function closeDropdown() {
        // Since we passed "true" for autoRemove to addPopUp(), this will
        // automatically remove the dropdown from the DOM. Also, PopUpManager
        // will call cleanupDropdown().
        if ($dropdown) {
            PopUpManager.removePopUp($dropdown);
        }
    }

    /**
     * Remove the various event handlers that close the dropdown. This is called by the
     * PopUpManager when the dropdown is closed.
     */
    function cleanupDropdown() {
        $("html").off("click", closeDropdown);
        $("#project-files-container").off("scroll", closeDropdown);
        $("#titlebar .nav").off("click", closeDropdown);
        $dropdown = null;
    }

    function openProjectWithPath(fullPath) {
        return new Promise((resolve, reject)=>{
            ProjectManager.openProject(fullPath)
                .then(resolve)
                .fail(function () {
                    // Remove the project from the list only if it does not exist on disk
                    var recentProjects = getRecentProjects(),
                        index = recentProjects.indexOf(fullPath);
                    if (index === -1) {
                        reject();
                        return;
                    }
                    FileSystem.resolve(fullPath, function (err, item) {
                        if (err) {
                            removeFromRecentProject(fullPath);
                        }
                        reject();
                    });
                });
        });
    }

    /**
     * Adds the click and mouse enter/leave events to the dropdown
     */
    function _handleListEvents() {
        $dropdown
            .on("click", ".recent-project-delete", function (e) {
                // Don't let the click bubble upward.
                e.stopPropagation();

                // Remove the project from the preferences.
                removeFromRecentProject($(this).parent().data("path"));
                $(this).closest("li").remove();

                if (getRecentProjects().length === 1) {
                    $dropdown.find(".divider").remove();
                }
            })
            .on("click", "a", function () {
                var $link = $(this),
                    id    = $link.attr("id"),
                    path  = $link.data("path");

                if (path) {
                    openProjectWithPath(path);
                    closeDropdown();

                } else if (id === "open-folder-link") {
                    CommandManager.execute(Commands.FILE_OPEN_FOLDER);
                } else if (id === "new-project-link") {
                    CommandManager.execute(Commands.FILE_NEW_PROJECT);
                } else if (id === "download-project-link") {
                    CommandManager.execute(Commands.FILE_DOWNLOAD_PROJECT);
                }

            });
    }

    /**
     * Parses the path and returns an object with the full path, the folder name and the path without the folder.
     * @param {string} fullPath The full path to the folder.
     * @return {{path: string, folder: string, rest: string}}
     */
    function renderPath(fullPath) {
        let parentDirPath = Phoenix.VFS.ensureTrailingSlash(window.path.dirname(fullPath));
        let rest;
        if(parentDirPath.startsWith(Phoenix.VFS.getTauriDir())) {
            rest = " - " + window.fs.getTauriPlatformPath(parentDirPath);
        } else if(parentDirPath.startsWith(Phoenix.VFS.getMountDir())) {
            const displayPath = parentDirPath.replace(Phoenix.VFS.getMountDir(), "");
            if(displayPath){
                rest = " - " + displayPath;
            }
        } else {
            rest = " - " + Strings.PROJECT_FROM_BROWSER_TERSE;
        }

        return {path: fullPath, folder: window.path.basename(fullPath), rest: rest};
    }

    /**
     * Create the list of projects in the dropdown menu.
     * @return {string} The html content
     */
    function renderList() {
        const recentProjects = getRecentProjects(),
            downloadProjectCommand = CommandManager.get(Commands.FILE_DOWNLOAD_PROJECT),
            currentProject = FileUtils.stripTrailingSlash(ProjectManager.getProjectRoot().fullPath),
            templateVars   = {
                projectList: [],
                Strings: Strings,
                downloadProjectClass: downloadProjectCommand.getEnabled() ? "": "forced-hidden"
            };

        recentProjects.forEach(function (root) {
            if (root !== currentProject) {
                templateVars.projectList.push(renderPath(root));
            }
        });

        return Mustache.render(ProjectsMenuTemplate, templateVars);
    }

    /**
     * Show or hide the recent projects dropdown.
     *
     * @param {{pageX:number, pageY:number}} position - the absolute position where to open the dropdown
     */
    function showDropdown(position) {
        // If the dropdown is already visible, just return (so the root click handler on html
        // will close it).
        if ($dropdown) {
            return;
        }

        Menus.closeAll();

        $dropdown = $(renderList())
            .css({
                left: position.pageX,
                top: position.pageY
            })
            .appendTo($("body"));

        PopUpManager.addPopUp($dropdown, cleanupDropdown, true, {closeCurrentPopups: true});
        PopUpManager.handleSelectionEvents($dropdown, {
            enableSearchFilter: true,
            keyboardEventHandler: _handlePopupKeyEvents
        });

        // TODO: should use capture, otherwise clicking on the menus doesn't close it. More fallout
        // from the fact that we can't use the Boostrap (1.4) dropdowns.
        $("html").on("click", closeDropdown);

        // Hide the menu if the user scrolls in the project tree. Otherwise the Lion scrollbar
        // overlaps it.
        // TODO: This duplicates logic that's already in ProjectManager (which calls Menus.close()).
        // We should fix this when the popup handling is centralized in PopupManager, as well
        // as making Esc close the dropdown. See issue #1381.
        $("#project-files-container").on("scroll", closeDropdown);

        // Note: PopUpManager will automatically hide the sidebar in other cases, such as when a
        // command is run, Esc is pressed, or the menu is focused.

        // Hacky: if we detect a click in the menubar, close ourselves.
        // TODO: again, we should have centralized popup management.
        $("#titlebar .nav").on("click", closeDropdown);

        _handleListEvents();
    }

    // Initialize extension
    AppInit.appReady(function () {
        PreferencesManager.stateManager.definePreference(RECENT_PROJECT_STATE, 'array', [])
            .watchExternalChanges();
        ProjectManager.on("projectOpen", add);
        ProjectManager.on("beforeProjectClose", add);
        // add the current project at startup.
        add();
    });

    AppInit.htmlReady(function () {
        $("#project-dropdown-toggle .dropdown-arrow").removeClass("forced-hidden");

        var cmenuAdapter = {
            open: showDropdown,
            close: closeDropdown,
            isOpen: function () {
                return !!$dropdown;
            }
        };
        Menus.ContextMenu.assignContextMenuToSelector("#project-dropdown-toggle", cmenuAdapter);
    });

    exports.getRecentProjects = getRecentProjects;
    exports.openProjectWithPath = openProjectWithPath;
    exports.removeFromRecentProject = removeFromRecentProject;
});
