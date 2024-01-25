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
        MainViewManager         = require("view/MainViewManager"),
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
    PreferencesManager.stateManager.definePreference(RECENT_PROJECT_STATE, 'array', [])
        .watchExternalChanges();

    /** @const {string} Recent Projects commands ID */
    let TOGGLE_DROPDOWN = "recentProjects.toggle";

    /** @const {number} Maximum number of displayed recent projects */
    var MAX_PROJECTS = 20;

    /** @type {$.Element} jQuery elements used for the dropdown menu */
    var $dropdownItem,
        $dropdown,
        $links;

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
        var root = FileUtils.stripTrailingSlash(ProjectManager.getProjectRoot().fullPath),
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

    /**
     * Check the list of items to see if any of them are hovered, and if so trigger a mouseenter.
     * Normally the mouseenter event handles this, but when a previous item is deleted and the next
     * item moves up to be underneath the mouse, we don't get a mouseenter event for that item.
     */
    function checkHovers(pageX, pageY) {
        $dropdown.children().each(function () {
            var offset = $(this).offset(),
                width  = $(this).outerWidth(),
                height = $(this).outerHeight();

            if (pageX >= offset.left && pageX <= offset.left + width &&
                    pageY >= offset.top && pageY <= offset.top + height) {
                $(".recent-folder-link", this).triggerHandler("mouseenter");
            }
        });
    }

    function removeFromRecentProject(fullPath) {
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
     * Create the "delete" button that shows up when you hover over a project.
     */
    function renderDelete() {
        return $("<div id='recent-folder-delete' class='trash-icon'>&times;</div>")
            .mouseup(function (e) {
                // Don't let the click bubble upward.
                e.stopPropagation();

                // Remove the project from the preferences.
                removeFromRecentProject($(this).parent().data("path"));
                $(this).closest("li").remove();
                checkHovers(e.pageX, e.pageY);

                if (getRecentProjects().length === 1) {
                    $dropdown.find(".divider").remove();
                }
            });
    }

    /**
     * Hide the delete button.
     */
    function removeDeleteButton() {
        $("#recent-folder-delete").remove();
    }

    /**
     * Show the delete button over a given target.
     */
    function addDeleteButton($target) {
        removeDeleteButton();
        renderDelete()
            .css("top", $target.position().top + 6)
            .appendTo($target);
    }


    /**
     * Selects the next or previous item in the list
     * @param {number} direction  +1 for next, -1 for prev
     */
    function selectNextItem(direction) {
        let $links   = $dropdown.find("a:visible"),
            index    = $dropdownItem ? $links.index($dropdownItem) : (direction > 0 ? -1 : 0),
            $newItem = $links.eq((index + direction) % $links.length);

        if(searchStr && $links.length === 1){
            // no search result, only the top search field visible
            return;
        }
        if($newItem.parent().hasClass("sticky-li-top")) {
            if(index === -1){
                index = 0;
            }
            $newItem = $links.eq((index + direction) % $links.length);
        }
        if ($dropdownItem) {
            $dropdownItem.removeClass("selected");
        }
        $newItem.addClass("selected");

        $dropdownItem = $newItem;
        removeDeleteButton();
    }

    let searchStr ="";
    /**
     * hides all elements in popup that doesn't match the given search string, also shows the search bar in popup
     * @param searchString
     */
    function filterDropdown(searchString) {
        searchStr = searchString;
        const $stickyLi = $dropdown.find('li.sticky-li-top');
        if(searchString){
            $stickyLi.removeClass("forced-hidden");
        } else {
            $stickyLi.addClass("forced-hidden");
        }

        $dropdown.find('li').each(function(index, li) {
            if(index === 0){
                // this is the top search box itself
                return;
            }
            const $li = $(li);
            if(!$li.text().toLowerCase().includes(searchString.toLowerCase())){
                $li.addClass("forced-hidden");
            } else {
                $li.removeClass("forced-hidden");
            }
        });

        if(searchString) {
            $stickyLi.removeClass('forced-hidden');
            $stickyLi.find('.searchTextSpan').text(searchString);
        } else {
            $stickyLi.addClass('forced-hidden');
        }
    }

    /**
     * Deletes the selected item and
     * move the focus to next item in list.
     *
     * @return {boolean} TRUE if project is removed
     */
    function removeSelectedItem(e) {
        var recentProjects = getRecentProjects(),
            $cacheItem = $dropdownItem,
            index = recentProjects.indexOf($cacheItem.data("path"));

        // When focus is not on project item
        if (index === -1) {
            return false;
        }

        // remove project
        recentProjects.splice(index, 1);
        PreferencesManager.setViewState(RECENT_PROJECT_STATE, recentProjects);
        checkHovers(e.pageX, e.pageY);

        if (recentProjects.length === 1) {
            $dropdown.find(".divider").remove();
        }
        selectNextItem(+1);
        $cacheItem.closest("li").remove();
        return true;
    }

    /**
     * Handles the Key Down events
     * @param {KeyboardEvent} event
     * @return {boolean} True if the key was handled
     */
    function keydownHook(event) {
        var keyHandled = false;

        switch (event.keyCode) {
        case KeyEvent.DOM_VK_UP:
            selectNextItem(-1);
            keyHandled = true;
            break;
        case KeyEvent.DOM_VK_DOWN:
            selectNextItem(+1);
            keyHandled = true;
            break;
        case KeyEvent.DOM_VK_ENTER:
        case KeyEvent.DOM_VK_RETURN:
            if ($dropdownItem) {
                $dropdownItem.trigger("click");
            }
            keyHandled = true;
            break;
        case KeyEvent.DOM_VK_DELETE:
            if ($dropdownItem) {
                removeSelectedItem(event);
                keyHandled = true;
            }
            break;
        }

        if(keyHandled){
            event.stopImmediatePropagation();
            event.preventDefault();
            return keyHandled;
        } else if((event.ctrlKey || event.metaKey) && event.key === 'v') {
            Phoenix.app.clipboardReadText().then(text=>{
                searchStr += text;
                filterDropdown(searchStr);
            });
            keyHandled = true;
        } else if (event.key.length === 1) {
            searchStr += event.key;
            keyHandled = true;
        } else if (event.key === 'Backspace') {
            // Remove the last character when Backspace is pressed
            searchStr  = searchStr.slice(0, -1);
            keyHandled = true;
        } else {
            // bubble up, not for us to handle
            return false;
        }
        filterDropdown(searchStr);

        if (keyHandled) {
            event.stopImmediatePropagation();
            event.preventDefault();
        }
        return keyHandled;
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
        searchStr = "";
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

        MainViewManager.focusActivePane();

        $(window).off("keydown", keydownHook);
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
                            recentProjects.splice(index, 1);
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

            })
            .on("mouseenter", "a", function () {
                if ($dropdownItem) {
                    $dropdownItem.removeClass("selected");
                }
                $dropdownItem = $(this).addClass("selected");

                if ($dropdownItem.hasClass("recent-folder-link")) {
                    // Note: we can't depend on the event here because this can be triggered
                    // manually from checkHovers().
                    addDeleteButton($(this));
                }
            })
            .on("mouseleave", "a", function () {
                var $link = $(this).removeClass("selected");

                if ($link.get(0) === $dropdownItem.get(0)) {
                    $dropdownItem = null;
                }
                if ($link.hasClass("recent-folder-link")) {
                    removeDeleteButton();
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

        PopUpManager.addPopUp($dropdown, cleanupDropdown, true);

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
        $(window).on("keydown", keydownHook);
    }


    /**
     * Show or hide the recent projects dropdown from the toogle command.
     */
    function handleKeyEvent() {
        if (!$dropdown) {
            if (!SidebarView.isVisible()) {
                SidebarView.show();
            }

            $("#project-dropdown-toggle").trigger("click");

            $dropdown.focus();
            $links = $dropdown.find("a");
            // By default, select the most recent project (which is at the top of the list underneath Open Folder),
            // but if there are none, select Open Folder instead.
            $dropdownItem = $links.eq($links.length > 1 ? 1 : 0);
            $dropdownItem.addClass("selected");

            // If focusing the dropdown caused a modal bar to close, we need to refocus the dropdown
            window.setTimeout(function () {
                $dropdown.focus();
            }, 0);
        }
    }

    // Register command handlers
    CommandManager.register(Strings.CMD_TOGGLE_RECENT_PROJECTS, TOGGLE_DROPDOWN, handleKeyEvent);

    // Initialize extension
    AppInit.appReady(function () {
        ProjectManager.on("projectOpen", add);
        ProjectManager.on("beforeProjectClose", add);
    });

    AppInit.htmlReady(function () {
        $("#project-title")
            .wrap("<div id='project-dropdown-toggle' class='btn-alt-quiet'></div>")
            .after("<span class='dropdown-arrow'></span>");

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
