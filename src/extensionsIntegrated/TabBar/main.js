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
    const CommandManager = require("command/CommandManager");
    const Commands = require("command/Commands");
    const KeyBindingManager = require("command/KeyBindingManager");
    const DocumentManager = require("document/DocumentManager");
    const EditorManager = require("editor/EditorManager");
    const WorkspaceManager = require("view/WorkspaceManager");
    const WorkingSetView = require("project/WorkingSetView");
    const FileViewController = require("project/FileViewController");
    const ViewUtils = require("utils/ViewUtils");
    const Menus = require("command/Menus");
    const Strings = require("strings");

    const Preference = require("./preference");
    const Overflow = require("./overflow");
    const DragDrop = require("./drag-drop");

    /**
     * One TabBarView per open pane, keyed by the pane id ('first-pane' or 'second-pane')
     * @type {Object<string, TabBarView>}
     */
    const _views = {};

    // panes with a pending update. updates come in bursts (opening a file adds it to the working set,
    // changes the current file and maybe the active pane) so they are collected and done once per tick
    const _pendingPanes = new Set();
    let _updateTimer = null;

    // the git status of a file shows up as a class on its tab and in the tooltip
    const GIT_STATUS = {
        ignored: { className: "git-ignored", label: Strings.FILE_IGNORED },
        untracked: { className: "git-new", label: Strings.FILE_UNTRACKED },
        modified: { className: "git-modified", label: Strings.FILE_MODIFIED }
    };

    /**
     * this function checks if the TabBar is currently enabled or not (no. of tabs is 0 means tab bar is disabled)
     * @returns {boolean} true if TabBar is enabled and should be active
     */
    function isTabBarActive() {
        return Preference.tabBarEnabled && Preference.tabBarNumberOfTabs !== 0;
    }

    /**
     * checks whether a file is dirty or not
     * @param {string} path - the full path of the file
     * @return {boolean}
     */
    function _isDirty(path) {
        const doc = DocumentManager.getOpenDocumentForPath(path);
        return Boolean(doc && doc.isDirty);
    }

    /**
     * the git status of the file, if the git extension is around and knows about it
     * ignored is checked first as it takes precedence over the other two
     * @param {string} path - the full path of the file
     * @return {?{className: string, label: string}}
     */
    function _getGitStatus(path) {
        const git = window.phoenixGitEvents && window.phoenixGitEvents.TabBarIntegration;
        if (!git) {
            return null;
        }
        if (git.isIgnored && git.isIgnored(path)) {
            return GIT_STATUS.ignored;
        }
        if (git.isUntracked(path)) {
            return GIT_STATUS.untracked;
        }
        if (git.isModified(path)) {
            return GIT_STATUS.modified;
        }
        return null;
    }

    /**
     * the working set files that get a tab, honouring the numberOfTabs preference (-1 means all of them)
     * the active file always gets a tab even when it is past the limit, it then takes the spot of the last one
     *
     * @param {Array<File>} workingSet - the pane's working set
     * @param {?string} currentPath - the full path of the file shown in the pane
     * @return {Array<{file: File, placeholder: boolean}>}
     */
    function _getVisibleEntries(workingSet, currentPath) {
        const limit = Preference.tabBarNumberOfTabs;
        let files = workingSet;

        if (limit > 0 && workingSet.length > limit) {
            const activeIndex = workingSet.findIndex((file) => file.fullPath === currentPath);
            files = activeIndex >= limit
                ? workingSet.slice(0, limit - 1).concat(workingSet[activeIndex])
                : workingSet.slice(0, limit);
        }

        return files.map((file) => ({ file: file, placeholder: false }));
    }

    /**
     * when two tabs in the same pane have the same file name, both get the directory name in front
     * of the file name, same as what the working set does
     *
     * @param {Array<{file: File}>} entries - the tabs of the pane
     * @return {Map<string, string>} full path -> directory label, only for the duplicates
     */
    function _getDuplicateDirLabels(entries) {
        const filesByName = new Map();
        entries.forEach(({ file }) => {
            const list = filesByName.get(file.name);
            if (list) {
                list.push(file);
            } else {
                filesByName.set(file.name, [file]);
            }
        });

        const labels = new Map();
        filesByName.forEach((files) => {
            if (files.length < 2) {
                return;
            }
            ViewUtils.getDirNamesForDuplicateFiles(files).forEach((dirName, i) => {
                const parts = dirName.split("/");
                labels.set(files[i].fullPath, parts.length > 3
                    ? `${parts[0]}/…/${parts[parts.length - 1]}`
                    : dirName);
            });
        });

        return labels;
    }

    /**
     * Responsible for creating the tab element
     * Note: this creates a tab (for a single file) not the tab bar. The file icon is added here as well,
     * everything else that can change (name, active, dirty...) is filled in by _updateTab
     *
     * @param {File} file - the file the tab is for
     * @returns {HTMLElement} the tab element
     */
    function _createTab(file) {
        const tab = document.createElement("div");
        tab.className = "tab";
        tab.setAttribute("data-path", file.fullPath);
        tab.setAttribute("draggable", "true");
        tab.innerHTML = '<div class="tab-icon"></div><div class="tab-name"></div>' +
            '<div class="tab-close"><i class="fa-solid fa-times"></i></div>';

        WorkingSetView.useIconProviders({ fullPath: file.fullPath, name: file.name, isFile: true }, $(tab.firstChild));
        return tab;
    }

    /**
     * brings a tab in line with the file it represents. Only the things that actually changed touch the DOM
     *
     * @param {HTMLElement} tab - the tab element
     * @param {{file: File, placeholder: boolean}} entry
     * @param {{active: boolean, pinned: boolean, dirLabel: ?string}} state
     */
    function _updateTab(tab, entry, state) {
        const file = entry.file;
        const classes = tab.classList;

        classes.toggle("active", state.active);
        classes.toggle("placeholder", entry.placeholder);
        classes.toggle("pinned", state.pinned);
        classes.toggle("dirty", _isDirty(file.fullPath));
        _applyGitStatus(tab, file.fullPath);

        // the label is remembered on the element so the name is only re-rendered when it changes
        const label = state.dirLabel ? `${state.dirLabel}/${file.name}` : file.name;
        if (tab.dataset.label !== label) {
            tab.dataset.label = label;
            const $name = $(tab.children[1]);
            if (state.dirLabel) {
                $name.html(`<span class="tab-dirname">${_.escape(state.dirLabel)}/</span>${_.escape(file.name)}`);
            } else {
                $name.text(file.name);
            }
        }

        // a pinned tab can't be closed from the tab itself, the close button makes way for the pin
        const control = tab.children[2];
        if (control.classList.contains("tab-pin") !== state.pinned) {
            control.className = state.pinned ? "tab-pin" : "tab-close";
            control.innerHTML = state.pinned
                ? '<i class="pinned-file-icon"></i>'
                : '<i class="fa-solid fa-times"></i>';
            control.removeAttribute("title");
        }
    }

    /**
     * sets the git status class of the tab and the tooltip (file path with the git status in brackets)
     *
     * @param {HTMLElement} tab - the tab element
     * @param {string} path - the full path of the file
     */
    function _applyGitStatus(tab, path) {
        const status = _getGitStatus(path);
        const className = status ? status.className : "";

        if (tab.dataset.git !== className) {
            tab.dataset.git = className;
            tab.classList.remove("git-ignored", "git-new", "git-modified");
            if (className) {
                tab.classList.add(className);
            }
            tab.title = Phoenix.app.getDisplayPath(path) + (status ? ` (${status.label})` : "");
        }
    }

    /**
     * The tab bar of a single pane. It keeps a map from file path to tab element, so a change
     * only touches the tabs that changed. The bar is never thrown away and rebuilt.
     *
     * @param {string} paneId - 'first-pane' or 'second-pane'
     */
    function TabBarView(paneId) {
        this.paneId = paneId;
        this.tabs = new Map();
        this.activePath = null;
        this.visible = false;

        // the element ids are what the rest of the app knows the tab bars by
        const suffix = paneId === MainViewManager.FIRST_PANE ? "" : "-2";
        this.$container = $(
            `<div class="tab-bar-container" data-pane-id="${paneId}">
                <div id="phoenix-tab-bar${suffix}" class="phoenix-tab-bar"></div>
                <div id="overflow-button${suffix}" class="overflow-button hidden">
                    <i class="fa-solid fa-chevron-down"></i>
                </div>
            </div>`
        ).hide();
        this.bar = this.$container.children(".phoenix-tab-bar")[0];
        this.$overflowButton = this.$container.children(".overflow-button")
            .attr("title", Strings.TABBAR_SHOW_HIDDEN_TABS);

        // the tab bar sits between the pane header and the editor
        $(`#${paneId} .pane-header`).after(this.$container);

        // a resize (sidebar, live preview panel, window...) only changes whether all the tabs still fit.
        // The check waits for the next frame because showing or hiding the overflow button changes the
        // width of the bar itself, and doing that inside the observer callback makes the browser report
        // an undelivered resize loop
        this.overflowCheckPending = false;
        this.resizeObserver = new ResizeObserver(() => {
            if (this.overflowCheckPending) {
                return;
            }
            this.overflowCheckPending = true;
            window.requestAnimationFrame(() => {
                this.overflowCheckPending = false;
                this.updateOverflowButton();
            });
        });
        this.resizeObserver.observe(this.bar);

        // MainViewManager only announces current file changes for the active pane, so the pane is asked
        // directly as well. Otherwise a file that opens in the other pane (like the next file after its
        // current tab is closed) would sit there without an active tab
        this.pane = MainViewManager._getPane(paneId);
        this.pane.on("currentViewChange.tabbar", () => _scheduleUpdate(paneId));
    }

    /**
     * removes the tab bar from the pane
     */
    TabBarView.prototype.destroy = function () {
        this.pane.off(".tabbar");
        this.resizeObserver.disconnect();
        this.$container.remove();
        this.tabs.clear();
        if (this.visible) {
            WorkspaceManager.recomputeLayout();
        }
    };

    /**
     * This function updates the tabs in the tab bar so that they match the pane's working set
     * existing tabs are reused and moved around, only new files get a new tab and only files
     * that left the working set lose theirs
     */
    TabBarView.prototype.update = function () {
        const paneId = this.paneId;
        const workingSet = MainViewManager.getWorkingSet(paneId);
        const currentFile = MainViewManager.getCurrentlyViewedFile(paneId);
        const currentPath = currentFile ? currentFile.fullPath : null;
        const entries = _getVisibleEntries(workingSet, currentPath);

        // when a file is opened from the filetree and is not present in the working set, then it is a placeholder
        // and gets a tab at the end. But when the current file was just closed it isn't in the working set
        // either while the next file is still being opened, that one had a real tab a moment ago so it's not
        // a placeholder, its tab simply goes away
        const inWorkingSet = workingSet.some((file) => file.fullPath === currentPath);
        const previousTab = currentPath && this.tabs.get(currentPath);
        const wasWorkingSetTab = previousTab && !previousTab.classList.contains("placeholder");
        if (currentFile && !inWorkingSet && !wasWorkingSetTab) {
            entries.push({ file: currentFile, placeholder: true });
        }

        // if no files are present in the pane and no placeholder, we hide the tab bar for that pane
        // the layout is only recomputed when this actually changes as the editor height depends on it
        const show = entries.length > 0;
        if (show !== this.visible) {
            this.visible = show;
            this.$container.toggle(show);
            WorkspaceManager.recomputeLayout();
        }

        const keep = new Set(entries.map((entry) => entry.file.fullPath));
        this.tabs.forEach((tab, path) => {
            if (!keep.has(path)) {
                tab.remove();
                this.tabs.delete(path);
            }
        });

        const dirLabels = _getDuplicateDirLabels(entries);
        const bar = this.bar;
        entries.forEach((entry, index) => {
            const path = entry.file.fullPath;
            let tab = this.tabs.get(path);
            if (!tab) {
                tab = _createTab(entry.file);
                this.tabs.set(path, tab);
            }

            _updateTab(tab, entry, {
                active: path === currentPath,
                pinned: !entry.placeholder && MainViewManager.isPathPinned(paneId, path),
                dirLabel: dirLabels.get(path)
            });

            // the tabs before this one are already in order, so this one just has to land at its index
            if (bar.children[index] !== tab) {
                bar.insertBefore(tab, bar.children[index] || null);
            }
        });

        // the active tab in the pane that doesn't have the focus is styled differently
        this.$container.toggleClass("inactive-pane", MainViewManager.getActivePaneId() !== paneId);
        this.updateOverflowButton();

        // we scroll only in the active pane
        // this is because, lets say we have a same file in both the panes
        // then when the file is opened in one of the pane and is towards the end of the tab bar,
        // then we need to show the scrolling animation only on that pane and not on both the panes
        if (currentPath !== this.activePath) {
            this.activePath = currentPath;
            if (MainViewManager.getActivePaneId() === paneId) {
                this.scrollActiveTabIntoView();
            }
        }
    };

    /**
     * the overflow button is shown when the tabs don't fit in the bar
     * the button itself takes room from the bar once it is showing, so the tabs are measured against
     * the full width. Otherwise a bar that would fit fine without the button would keep it forever
     */
    TabBarView.prototype.updateOverflowButton = function () {
        const bar = this.bar;
        const buttonWidth = this.$overflowButton.hasClass("hidden") ? 0 : this.$overflowButton[0].offsetWidth;
        this.$overflowButton.toggleClass("hidden", bar.scrollWidth <= bar.clientWidth + buttonWidth);
    };

    /**
     * Scrolls the tab bar to the active tab, if it isn't fully visible already
     */
    TabBarView.prototype.scrollActiveTabIntoView = function () {
        const tab = this.activePath && this.tabs.get(this.activePath);
        if (!tab || !this.visible) {
            return;
        }

        const bar = this.bar;
        const barRect = bar.getBoundingClientRect();
        const tabRect = tab.getBoundingClientRect();
        let scrollLeft = bar.scrollLeft;

        if (tabRect.left < barRect.left) {
            scrollLeft += tabRect.left - barRect.left - 10;
        } else if (tabRect.right > barRect.right) {
            scrollLeft += tabRect.right - barRect.right + 10;
        } else {
            return;
        }

        bar.scrollTo({ left: scrollLeft, behavior: Preference.tabBarSmoothScroll ? "smooth" : "auto" });
    };

    /**
     * toggles the dirty dot on the tab of the file
     *
     * @param {string} path - the full path of the file
     * @param {boolean} isDirty
     */
    TabBarView.prototype.setDirty = function (path, isDirty) {
        const tab = this.tabs.get(path);
        if (tab) {
            tab.classList.toggle("dirty", isDirty);
        }
    };

    /**
     * re-reads the git status of every tab
     */
    TabBarView.prototype.refreshGitStatus = function () {
        this.tabs.forEach((tab, path) => _applyGitStatus(tab, path));
    };

    /**
     * marks the tab a context menu is open for, so it is clear what the menu acts on while the
     * active tab stays where it was
     * @param {?string} path - the full path of the file, or null to clear the mark
     */
    TabBarView.prototype.setContextPath = function (path) {
        const previous = this.bar.querySelector(".tab.context");
        if (previous) {
            previous.classList.remove("context");
        }
        const tab = path && this.tabs.get(path);
        if (tab) {
            tab.classList.add("context");
        }
    };

    function _forEachView(callback) {
        Object.keys(_views).forEach((paneId) => callback(_views[paneId]));
    }

    /**
     * marks the pane's tab bar for an update in the next tick
     * @param {string} paneId
     */
    function _scheduleUpdate(paneId) {
        if (!paneId || !_views[paneId]) {
            return;
        }
        _pendingPanes.add(paneId);
        if (_updateTimer === null) {
            _updateTimer = window.setTimeout(_flushUpdates, 0);
        }
    }

    function _flushUpdates() {
        _updateTimer = null;
        _pendingPanes.forEach((paneId) => {
            if (_views[paneId]) {
                _views[paneId].update();
            }
        });
        _pendingPanes.clear();
    }

    /**
     * Creates the tab bar for the pane and adds it to the DOM
     * @param {string} paneId
     */
    function _createView(paneId) {
        if (_views[paneId] || !$(`#${paneId} .pane-header`).length) {
            return;
        }
        _views[paneId] = new TabBarView(paneId);
        _scheduleUpdate(paneId);
    }

    function _destroyView(paneId) {
        if (_views[paneId]) {
            _views[paneId].destroy();
            delete _views[paneId];
        }
        _pendingPanes.delete(paneId);
    }

    /**
     * the pane a tab or an overflow button belongs to
     * @param {HTMLElement} element - an element inside a tab bar container
     * @return {string} the pane id
     */
    function _paneIdOf(element) {
        return element.closest(".tab-bar-container").getAttribute("data-pane-id");
    }

    function _focusEditor() {
        // the mousedown that got us here hasn't finished yet, focusing right away would get undone
        setTimeout(function () {
            const editor = EditorManager.getActiveEditor();
            if (editor) {
                editor.focus();
            }
        }, 0);
    }

    /**
     * shows the file of the tab in its pane. the file is opened on mousedown rather than click so
     * switching files feels instant
     *
     * @param {string} path - the full path of the file
     * @param {string} paneId - the pane the tab is in
     */
    function _openTab(path, paneId) {
        const activePaneId = MainViewManager.getActivePaneId();

        // clicked tab is already active, just focus the editor
        if (paneId === activePaneId && MainViewManager.getCurrentlyViewedPath(activePaneId) === path) {
            _focusEditor();
            return;
        }

        CommandManager.execute(Commands.FILE_OPEN, { fullPath: path, paneId: paneId }).always(_focusEditor);
    }

    /**
     * tooltip text with the command's keyboard shortcut appended, if it has one
     * there can be more than 1 keybinding for a command as one is default and other one is user-set
     * we take the last one as that is the user created keybinding
     *
     * @param {string} text - the tooltip text
     * @param {string} commandId
     * @return {string}
     */
    function _withShortcut(text, commandId) {
        const bindings = KeyBindingManager.getKeyBindings(commandId);
        const binding = bindings[bindings.length - 1];
        const shortcut = binding ? KeyBindingManager.formatKeyDescriptor(binding.displayKey || binding.key) : "";
        return shortcut ? `${text} (${shortcut})` : text;
    }

    /**
     * handle click events on the tabs to open/close/pin the file
     * all the handlers are delegated from the document so they don't have to be rebound when tabs come and go
     */
    function _registerTabHandlers() {
        const TAB = ".phoenix-tab-bar .tab";

        $(document).on("mousedown", TAB, function (event) {
            // right clicks are for the context menu and the close/pin icons have their own click handler
            if (event.which === 3 || $(event.target).closest(".tab-close, .tab-pin").length) {
                return;
            }

            const path = this.getAttribute("data-path");
            const paneId = _paneIdOf(this);

            // middle click closes the tab, except for pinned ones so they don't get closed by accident
            if (event.which === 2) {
                event.preventDefault();
                if (!MainViewManager.isPathPinned(paneId, path)) {
                    CommandManager.execute(Commands.FILE_CLOSE, {
                        file: FileSystem.getFileForPath(path),
                        paneId: paneId
                    });
                }
                return;
            }

            // if the clicked tab is a placeholder tab, we add it to the working set
            if (this.classList.contains("placeholder")) {
                MainViewManager.addToWorkingSet(paneId, FileSystem.getFileForPath(path));
            }
            _openTab(path, paneId);
        });

        $(document).on("click", ".phoenix-tab-bar .tab-close", function (event) {
            event.preventDefault();
            event.stopPropagation();
            const tab = this.parentNode;
            CommandManager.execute(Commands.FILE_CLOSE, {
                file: FileSystem.getFileForPath(tab.getAttribute("data-path")),
                paneId: _paneIdOf(tab)
            });
        });

        $(document).on("click", ".phoenix-tab-bar .tab-pin", function (event) {
            event.preventDefault();
            event.stopPropagation();
            const tab = this.parentNode;
            CommandManager.execute(Commands.FILE_PIN, {
                file: FileSystem.getFileForPath(tab.getAttribute("data-path")),
                paneId: _paneIdOf(tab),
                pinned: false
            });
        });

        // the tooltips carry the keyboard shortcut, which the user can change, so they are built on hover
        $(document).on("mouseenter", ".phoenix-tab-bar .tab-close", function () {
            this.title = _withShortcut(Strings.CLOSE_TAB_TOOLTIP, Commands.FILE_CLOSE);
        });
        $(document).on("mouseenter", ".phoenix-tab-bar .tab-pin", function () {
            this.title = _withShortcut(Strings.UNPIN_TAB, Commands.FILE_PIN);
        });

        // Add the contextmenu (right-click) handler
        // the menu acts on the right-clicked tab, the active tab stays where it is
        $(document).on("contextmenu", TAB, function (event) {
            event.preventDefault();
            event.stopPropagation();

            const path = this.getAttribute("data-path");
            FileViewController.setWorkingSetContext(FileSystem.getFileForPath(path), _paneIdOf(this));
            Menus.getContextMenu(Menus.ContextMenuIds.FILE_TABS_CONTEXT_MENU)
                .open({ pageX: event.pageX, pageY: event.pageY });
        });

        // a click on the empty part of the bar, not on a tab, opens the tab bar settings
        $(document).on("click contextmenu", ".phoenix-tab-bar", function (event) {
            if (event.target !== this) {
                return;
            }
            event.preventDefault();
            event.stopPropagation();
            Menus.getContextMenu(Menus.ContextMenuIds.FILE_TABS_SETTINGS_MENU)
                .open({ pageX: event.pageX, pageY: event.pageY });
        });

        // the mouse wheel scrolls the tabs sideways. A trackpad already gives a sideways delta,
        // that one is taken as is and the up/down delta is multiplied to get a decent scroll amount
        $(document).on("wheel", ".phoenix-tab-bar", function (event) {
            const wheel = event.originalEvent;
            this.scrollLeft += (wheel.deltaX || 0) + wheel.deltaY * 2.5;
        });
    }

    /**
     * This function is responsible to add the placeholder tab to the working set (if user press save on it)
     * @param {Event} event
     * @param {String} commandId - the command id, to make sure we check it do the operation only on file save
     */
    function _onBeforeCommand(event, commandId) {
        if (!isTabBarActive() || (commandId !== Commands.FILE_SAVE && commandId !== Commands.FILE_SAVE_ALL)) {
            return;
        }

        const savedPath = commandId === Commands.FILE_SAVE
            ? MainViewManager.getCurrentlyViewedPath(MainViewManager.ACTIVE_PANE)
            : null;

        MainViewManager.getPaneIdList().forEach((paneId) => {
            const file = MainViewManager.getCurrentlyViewedFile(paneId);
            const isPlaceholder = file && MainViewManager.findInWorkingSet(paneId, file.fullPath) === -1;
            if (isPlaceholder && (!savedPath || file.fullPath === savedPath)) {
                MainViewManager.addToWorkingSet(paneId, file);
            }
        });
    }

    /**
     * Registers the event handlers
     */
    function _registerHandlers() {
        MainViewManager.on("paneCreate", function (event, paneId) {
            if (isTabBarActive()) {
                _createView(paneId);
            }
        });
        MainViewManager.on("paneDestroy", function (event, paneId) {
            _destroyView(paneId);
        });

        MainViewManager.on("workingSetAdd", function (event, file, index, paneId) {
            _scheduleUpdate(paneId);
        });
        MainViewManager.on("workingSetAddList", function (event, files, paneId) {
            _scheduleUpdate(paneId);
        });
        MainViewManager.on("workingSetRemove", function (event, file, suppressRedraw, paneId) {
            // suppressRedraw means the file is about to be put back under another name (save as),
            // the add that follows takes care of the redraw
            if (!suppressRedraw) {
                _scheduleUpdate(paneId);
            }
        });
        MainViewManager.on("workingSetRemoveList", function (event, files, paneId) {
            _scheduleUpdate(paneId);
        });
        MainViewManager.on("workingSetSort workingSetUpdate", function (event, paneId) {
            _scheduleUpdate(paneId);
        });
        MainViewManager.on("workingSetMove", function (event, file, sourcePaneId, destinationPaneId) {
            _scheduleUpdate(sourcePaneId);
            _scheduleUpdate(destinationPaneId);
        });

        MainViewManager.on(MainViewManager.EVENT_CURRENT_FILE_CHANGE,
            function (event, newFile, newPaneId, oldFile, oldPaneId) {
                _scheduleUpdate(newPaneId);
                _scheduleUpdate(oldPaneId);
            });
        MainViewManager.on("activePaneChange", function (event, newPaneId, oldPaneId) {
            _scheduleUpdate(newPaneId);
            _scheduleUpdate(oldPaneId);
        });

        DocumentManager.on("dirtyFlagChange", function (event, doc) {
            const path = doc.file.fullPath;
            _forEachView((view) => view.setDirty(path, doc.isDirty));
        });

        // to listen for the Git status changes
        // make sure that the git extension is available
        if (window.phoenixGitEvents && window.phoenixGitEvents.EventEmitter) {
            window.phoenixGitEvents.EventEmitter.on("GIT_FILE_STATUS_CHANGED", function () {
                _forEachView((view) => view.refreshGitStatus());
            });
        }

        CommandManager.on("beforeExecuteCommand", _onBeforeCommand);

        FileViewController.on("workingSetContextChange", function (event, context) {
            _forEachView((view) => view.setContextPath(
                context && context.paneId === view.paneId ? context.file.fullPath : null));
        });
    }

    /**
     * This is called when the tab bar preference is changed either,
     * from the preferences file or the menu bar
     * It takes care of creating or cleaning up the tab bars
     */
    function _preferenceChanged() {
        const prefs = PreferencesManager.get(Preference.PREFERENCES_TAB_BAR);
        Preference.tabBarEnabled = prefs.showTabBar;
        Preference.tabBarNumberOfTabs = prefs.numberOfTabs;
        Preference.tabBarSmoothScroll = Boolean(prefs.smoothScroll);

        // Update menu checkmarks
        CommandManager.get(Commands.TOGGLE_TABBAR).setChecked(prefs.showTabBar);
        CommandManager.get(Commands.TOGGLE_TABBAR_SMOOTH_SCROLL).setChecked(Preference.tabBarSmoothScroll);
        NUMBER_OF_TABS_CHOICES.forEach((count) => {
            CommandManager.get(_numberOfTabsCommandId(count)).setChecked(prefs.numberOfTabs === count);
        });

        if (isTabBarActive()) {
            MainViewManager.getPaneIdList().forEach(_createView);
            Object.keys(_views).forEach(_scheduleUpdate);
        } else {
            Object.keys(_views).forEach(_destroyView);
        }
    }

    // the choices offered in the settings menu for how many tabs to show, -1 means all of them
    const NUMBER_OF_TABS_CHOICES = [-1, 5, 10, 15, 20];
    const HIDE_TABBAR_COMMAND = "tabbar.hide";

    function _numberOfTabsCommandId(count) {
        return count === -1 ? "tabbar.numberOfTabs.all" : "tabbar.numberOfTabs." + count;
    }

    /**
     * changes one key of the tab bar preference
     * @param {string} key - the key to change
     * @param {*} value - the new value
     */
    function _setPreference(key, value) {
        const currentPref = PreferencesManager.get(Preference.PREFERENCES_TAB_BAR);
        PreferencesManager.set(Preference.PREFERENCES_TAB_BAR, {
            ...currentPref,
            [key]: value
        });
    }

    /**
     * Registers the commands,
     * for toggling the tab bar from the menu bar and the tab bar settings
     */
    function _registerCommands() {
        CommandManager.register(Strings.CMD_TOGGLE_TABBAR, Commands.TOGGLE_TABBAR,
            () => _setPreference("showTabBar", !Preference.tabBarEnabled));
        CommandManager.register(Strings.CMD_TOGGLE_TABBAR_SMOOTH_SCROLL, Commands.TOGGLE_TABBAR_SMOOTH_SCROLL,
            () => _setPreference("smoothScroll", !Preference.tabBarSmoothScroll));
        CommandManager.register(Strings.CMD_HIDE_TABBAR, HIDE_TABBAR_COMMAND,
            () => _setPreference("showTabBar", false));
        NUMBER_OF_TABS_CHOICES.forEach((count) => {
            CommandManager.register(count === -1 ? Strings.TABBAR_ALL_TABS : String(count),
                _numberOfTabsCommandId(count), () => _setPreference("numberOfTabs", count));
        });
    }

    /**
     * the settings menu that opens from the empty part of the tab bar
     */
    function _registerSettingsMenu() {
        const menu = Menus.registerContextMenu(Menus.ContextMenuIds.FILE_TABS_SETTINGS_MENU);
        menu.addMenuItem(Commands.TOGGLE_TABBAR_SMOOTH_SCROLL);
        menu.addMenuDivider();
        const countMenu = menu.addSubMenu(Strings.TABBAR_NUMBER_OF_TABS, "tabbar-number-of-tabs-submenu");
        NUMBER_OF_TABS_CHOICES.forEach((count) => countMenu.addMenuItem(_numberOfTabsCommandId(count)));
        menu.addMenuDivider();
        menu.addMenuItem(HIDE_TABBAR_COMMAND);
    }

    AppInit.appReady(function () {
        _registerCommands();
        _registerSettingsMenu();

        // add the toggle tab bar command to the view menu
        const viewMenu = Menus.getMenu(Menus.AppMenuBar.VIEW_MENU);
        viewMenu.addMenuItem(Commands.TOGGLE_TABBAR, "", Menus.AFTER, Commands.VIEW_HIDE_SIDEBAR);

        _registerHandlers();
        _registerTabHandlers();
        Overflow.init();
        DragDrop.init();

        PreferencesManager.on("change", Preference.PREFERENCES_TAB_BAR, _preferenceChanged);
        // calling preference changed here itself to check if the tab bar is enabled,
        // because if it is enabled, it creates the tab bars for the open panes
        _preferenceChanged();
    });
});
