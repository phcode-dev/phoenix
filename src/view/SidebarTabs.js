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

// @INCLUDE_IN_API_DOCS

/**
 * SidebarTabs manages multiple tab panes within the sidebar. Tab buttons are
 * rendered into the `#centralControlBar` element (the left control bar). The
 * module provides an API for registering tabs, associating DOM content with
 * tabs, and switching between them.
 *
 * Existing sidebar children that are not explicitly associated with a tab via
 * `addToTab` are treated as belonging to the default "Files" tab. This means
 * extensions that add DOM nodes to the sidebar will continue to work without
 * any code changes.
 *
 * Tab switching works purely by toggling the `.sidebar-tab-hidden` CSS class
 * (`display: none !important`). No DOM reparenting or detaching occurs, so
 * cached jQuery/DOM references held by extensions remain valid.
 * @module view/SidebarTabs
 */
define(function (require, exports, module) {

    const AppInit              = require("utils/AppInit"),
        EventDispatcher      = require("utils/EventDispatcher"),
        PreferencesManager   = require("preferences/PreferencesManager"),
        Strings              = require("strings");

    // --- Constants -----------------------------------------------------------

    /**
     * The built-in Files tab id.
     * @const {string}
     */
    const SIDEBAR_TAB_FILES = "sidebar-tab-files";

    // Inline SVG icons for the control bar — all use fill="currentColor" so
    // they inherit the button's text color. viewBoxes are cropped tightly
    // around the path content for consistent visual sizing.
    const ICON_FILES = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="128 64 384 512"><path fill="currentColor" d="M304 112L192 112C183.2 112 176 119.2 176 128L176 512C176 520.8 183.2 528 192 528L448 528C456.8 528 464 520.8 464 512L464 272L376 272C336.2 272 304 239.8 304 200L304 112zM444.1 224L352 131.9L352 200C352 213.3 362.7 224 376 224L444.1 224zM128 128C128 92.7 156.7 64 192 64L325.5 64C342.5 64 358.8 70.7 370.8 82.7L493.3 205.3C505.3 217.3 512 233.6 512 250.6L512 512C512 547.3 483.3 576 448 576L192 576C156.7 576 128 547.3 128 512L128 128z"/></svg>';

    const ICON_SEARCH = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path fill="currentColor" d="M416 208c0 45.9-14.9 88.3-40 122.7L502.6 457.4c12.5 12.5 12.5 32.8 0 45.3s-32.8 12.5-45.3 0L330.7 376c-34.4 25.2-76.8 40-122.7 40C93.1 416 0 322.9 0 208S93.1 0 208 0S416 93.1 416 208zM208 352a144 144 0 1 0 0-288 144 144 0 1 0 0 288z"/></svg>';

    /**
     * Preferred sidebar width (px) when a non-files tab (e.g. AI) is
     * first activated. Applied once if the current width is narrower.
     * @const {number}
     */
    const AI_TAB_GOOD_WIDTH = 450;

    /** Preference key used to track whether the initial width bump has been applied. */
    const PREF_AI_WIDTH_SET_INITIAL = "aiTabWidthSetInitial";

    // --- Events --------------------------------------------------------------

    /**
     * Fired when a new tab is registered via `addTab`.
     * @const {string}
     */
    const EVENT_TAB_ADDED = "tabAdded";

    /**
     * Fired when a tab is removed via `removeTab`.
     * @const {string}
     */
    const EVENT_TAB_REMOVED = "tabRemoved";

    /**
     * Fired when the active tab changes via `setActiveTab`.
     * @const {string}
     */
    const EVENT_TAB_CHANGED = "tabChanged";

    // --- Private state -------------------------------------------------------

    /** @type {jQuery}
     * @private */
    let $controlBar;

    /** @type {jQuery}
     * @private */
    let $navTabBar;

    /** @type {jQuery}
     * @private*/
    let $sidebar;

    /**
     * Ordered array of registered tab descriptors.
     * Each entry: { id, label, iconClass, priority, $tabItem }
     * @type {Array}
     * @private
     */
    const _tabs = [];

    /**
     * Map from tabId -> array of DOM elements (not jQuery) associated with
     * that tab via `addToTab`.
     * @type {Object.<string, Array.<Element>>}
     * @private
     */
    const _tabContent = {};

    /**
     * Set of DOM elements that were appended to #sidebar by `addToTab` (i.e.
     * they were NOT already children of #sidebar). Used so `removeFromTab` can
     * decide whether to also detach the node from the DOM.
     * @type {Set.<Element>}
     * @private
     */
    const _appendedNodes = new Set();

    /**
     * Currently active tab id.
     * @type {string}
     * @private
     */
    let _activeTabId = SIDEBAR_TAB_FILES;

    // --- IDs to always exclude from visibility toggling ----------------------

    const _EXCLUDED_IDS = { "mainNavBar": true, "navTabBar": true };

    /**
     * CSS classes that mark structural/resizer elements which must never be
     * hidden by tab switching.
     * @private
     */
    const _EXCLUDED_CLASSES = ["horz-resizer", "vert-resizer"];

    // --- Private helpers -----------------------------------------------------

    /**
     * Returns true if a sidebar child node should never be touched by tab
     * switching (e.g. nav bars, resizer handles).
     * @private
     */
    function _isExcludedNode(node) {
        if (_EXCLUDED_IDS[node.id]) {
            return true;
        }
        for (let i = 0; i < _EXCLUDED_CLASSES.length; i++) {
            if (node.classList.contains(_EXCLUDED_CLASSES[i])) {
                return true;
            }
        }
        return false;
    }

    /**
     * Rebuild the tab bar DOM to reflect current _tabs (sorted by priority).
     * @private
     */
    function _rebuildTabBar() {
        if (!$controlBar) {
            return;
        }
        $controlBar.empty();
        _tabs.sort(function (a, b) { return a.priority - b.priority; });

        // Render tab buttons
        _tabs.forEach(function (tab) {
            const iconMarkup = tab.iconHTML || '<i class="' + tab.iconClass + '"></i>';
            const $item = $('<a href="#" class="ccb-btn ccb-tab-btn" data-tab-id="' + tab.id + '" title="' + tab.label + '">' +
                iconMarkup +
                '</a>');
            if (tab.id === _activeTabId && $sidebar && $sidebar.is(":visible")) {
                $item.addClass("active");
            }
            tab.$tabItem = $item;
            $controlBar.append($item);
        });

        // Render the search button
        $controlBar.append('<a href="#" id="searchNav" class="ccb-btn" title="' +
            Strings.CMD_FIND_IN_FILES + '">' + ICON_SEARCH + '</a>');

        // Also rebuild the sidebar chip bar
        if ($navTabBar) {
            $navTabBar.empty();
            _tabs.forEach(function (tab) {
                const iconMarkup = tab.iconHTML || '<i class="' + tab.iconClass + '"></i>';
                const $chip = $('<div class="sidebar-tab" data-tab-id="' + tab.id + '">' +
                    iconMarkup +
                    '<span>' + tab.label + '</span>' +
                    '</div>');
                if (tab.id === _activeTabId) {
                    $chip.addClass("active");
                }
                $navTabBar.append($chip);
            });
            if (_tabs.length >= 2) {
                $navTabBar.addClass("has-tabs");
            } else {
                $navTabBar.removeClass("has-tabs");
            }
        }
    }

    /**
     * Returns true if the given node is explicitly associated with the
     * specified tab.
     * @private
     */
    function _isNodeInTab(node, tabId) {
        return _tabContent[tabId] && _tabContent[tabId].indexOf(node) !== -1;
    }

    /**
     * Returns true if the given node is explicitly associated with ANY
     * registered tab.
     * @private
     */
    function _isNodeInAnyTab(node) {
        const tabIds = Object.keys(_tabContent);
        for (let i = 0; i < tabIds.length; i++) {
            if (_tabContent[tabIds[i]].indexOf(node) !== -1) {
                return true;
            }
        }
        return false;
    }

    /**
     * Apply visibility for the currently active tab. Hides/shows sidebar
     * children as appropriate.
     *
     * A node can be associated with multiple tabs. It is visible if any of
     * its associated tabs is the active tab. Unassociated nodes default to
     * the files tab.
     * @private
     */
    function _applyTabVisibility() {
        if (!$sidebar || !$sidebar.length) {
            return;
        }

        const children = $sidebar.children().toArray();

        if (_activeTabId === SIDEBAR_TAB_FILES) {
            // Files tab: show nodes that are in the files tab content OR
            // unassociated (not in any tab). Hide nodes that are exclusively
            // in other tabs.
            const filesNodes = new Set(_tabContent[SIDEBAR_TAB_FILES] || []);

            children.forEach(function (child) {
                if (_isExcludedNode(child)) {
                    return; // never touch these
                }
                if (filesNodes.has(child) || !_isNodeInAnyTab(child)) {
                    child.classList.remove("sidebar-tab-hidden");
                } else {
                    child.classList.add("sidebar-tab-hidden");
                }
            });
        } else {
            // Non-files tab: show nodes associated with this tab, hide
            // everything else (except excluded nodes).
            const activeNodes = new Set(_tabContent[_activeTabId] || []);

            children.forEach(function (child) {
                if (_isExcludedNode(child)) {
                    return;
                }
                if (activeNodes.has(child)) {
                    child.classList.remove("sidebar-tab-hidden");
                } else {
                    child.classList.add("sidebar-tab-hidden");
                }
            });
        }
    }

    // --- Public API ----------------------------------------------------------

    /**
     * Register a new sidebar tab.
     *
     * @param {string} id       Unique tab identifier
     * @param {string} label    Display text shown in the tab bar
     * @param {string} iconClass  FontAwesome (or other) icon class string
     * @param {Object} [options]
     * @param {number} [options.priority=100]  Lower values appear further left
     */
    function addTab(id, label, iconClass, options) {
        options = options || {};

        // Prevent duplicate registrations
        for (let i = 0; i < _tabs.length; i++) {
            if (_tabs[i].id === id) {
                return;
            }
        }

        const tab = {
            id: id,
            label: label,
            iconClass: iconClass,
            iconHTML: options.iconHTML || null,
            priority: options.priority !== undefined ? options.priority : 100,
            $tabItem: null
        };
        _tabs.push(tab);
        _tabContent[id] = _tabContent[id] || [];

        _rebuildTabBar();
        exports.trigger(EVENT_TAB_ADDED, id);
    }

    /**
     * Associate a DOM node (or jQuery element) with a tab. If the node is not
     * already a child of `#sidebar`, it is appended. If the tab is not the
     * currently active tab, the node is immediately hidden.
     *
     * @param {string} tabId    The tab to associate with
     * @param {jQuery|Element} $content  DOM node or jQuery wrapper
     */
    function addToTab(tabId, $content) {
        const node = $content instanceof $ ? $content[0] : $content;
        if (!node) {
            return;
        }

        // Ensure content array exists
        if (!_tabContent[tabId]) {
            _tabContent[tabId] = [];
        }

        // Avoid duplicate association
        if (_tabContent[tabId].indexOf(node) !== -1) {
            return;
        }

        _tabContent[tabId].push(node);

        // If not already in sidebar, append it
        if (!$sidebar[0].contains(node)) {
            $sidebar.append(node);
            _appendedNodes.add(node);
        }

        // Show/hide based on whether the node belongs to the active tab.
        // A node may be in multiple tabs, so only hide it if none of its
        // associated tabs is the currently active one.
        if (tabId === _activeTabId || _isNodeInTab(node, _activeTabId)) {
            node.classList.remove("sidebar-tab-hidden");
        } else {
            node.classList.add("sidebar-tab-hidden");
        }
    }

    /**
     * Remove a DOM node's association with a tab. If the node was appended by
     * `addToTab` (was not originally in the sidebar) and is no longer
     * associated with any tab, it is also removed from the DOM.
     *
     * @param {string} tabId    The tab to disassociate from
     * @param {jQuery|Element} $content  DOM node or jQuery wrapper
     */
    function removeFromTab(tabId, $content) {
        const node = $content instanceof $ ? $content[0] : $content;
        if (!node || !_tabContent[tabId]) {
            return;
        }

        const idx = _tabContent[tabId].indexOf(node);
        if (idx === -1) {
            return;
        }

        _tabContent[tabId].splice(idx, 1);

        if (_isNodeInAnyTab(node)) {
            // Node is still in other tab(s) — re-evaluate its visibility
            _applyTabVisibility();
        } else if (_appendedNodes.has(node)) {
            // Node was appended by addToTab and is no longer in any tab —
            // remove it from the DOM
            $(node).remove();
            _appendedNodes.delete(node);
        } else {
            // Originally in sidebar and no longer in any tab — make it
            // visible again so it reverts to default (files tab) behavior
            node.classList.remove("sidebar-tab-hidden");
        }
    }

    /**
     * Remove a tab entirely. Only succeeds if all content has been removed via
     * `removeFromTab` first. Returns false if content still exists.
     *
     * @param {string} id  The tab id to remove
     * @return {boolean} true if removed, false if content still associated
     */
    function removeTab(id) {
        if (id === SIDEBAR_TAB_FILES) {
            return false; // cannot remove the built-in files tab
        }

        if (_tabContent[id] && _tabContent[id].length > 0) {
            return false;
        }

        let removed = false;
        for (let i = _tabs.length - 1; i >= 0; i--) {
            if (_tabs[i].id === id) {
                _tabs.splice(i, 1);
                removed = true;
                break;
            }
        }

        if (removed) {
            delete _tabContent[id];

            // If the removed tab was active, switch back to files
            if (_activeTabId === id) {
                _activeTabId = SIDEBAR_TAB_FILES;
            }

            _rebuildTabBar();
            _applyTabVisibility();
            exports.trigger(EVENT_TAB_REMOVED, id);
        }

        return removed;
    }

    /**
     * Switch the active sidebar tab. Shows nodes associated with the target
     * tab, hides all others.
     *
     * @param {string} id  The tab id to activate
     */
    function setActiveTab(id) {
        // Verify the tab exists
        let found = false;
        for (let i = 0; i < _tabs.length; i++) {
            if (_tabs[i].id === id) {
                found = true;
                break;
            }
        }
        if (!found) {
            return;
        }

        const previousTabId = _activeTabId;
        _activeTabId = id;

        // Update active class on tab items in the control bar
        if ($controlBar) {
            $controlBar.find(".ccb-tab-btn").removeClass("active");
            if ($sidebar && $sidebar.is(":visible")) {
                $controlBar.find('.ccb-tab-btn[data-tab-id="' + id + '"]').addClass("active");
            }
        }

        // Update active class on sidebar chip tabs
        if ($navTabBar) {
            $navTabBar.find(".sidebar-tab").removeClass("active");
            $navTabBar.find('.sidebar-tab[data-tab-id="' + id + '"]').addClass("active");
        }

        _applyTabVisibility();

        // One-time sidebar width bump when switching to a non-files tab
        if (id !== SIDEBAR_TAB_FILES && $sidebar && $sidebar.length) {
            if (!PreferencesManager.getViewState(PREF_AI_WIDTH_SET_INITIAL)) {
                const SidebarView = require("project/SidebarView");
                if (SidebarView.getWidth() < AI_TAB_GOOD_WIDTH) {
                    SidebarView.resize(AI_TAB_GOOD_WIDTH);
                }
                PreferencesManager.setViewState(PREF_AI_WIDTH_SET_INITIAL, true);
            }
        }

        if (previousTabId !== id) {
            exports.trigger(EVENT_TAB_CHANGED, id, previousTabId);
        }
    }

    /**
     * Get the currently active tab id.
     * @return {string}
     */
    function getActiveTab() {
        return _activeTabId;
    }

    /**
     * Get an array of all registered tab descriptors.
     * @typedef {Object} TabDescriptor
     * @property {string} id - Unique tab identifier
     * @property {string} label - Display text shown in the tab bar
     * @property {string} iconClass - Icon class string
     * @property {number} priority - Sort priority (lower = further left)
     *
     * @return {Array<TabDescriptor>}
     */
    function getAllTabs() {
        return _tabs.map(function (tab) {
            return {
                id: tab.id,
                label: tab.label,
                iconClass: tab.iconClass,
                priority: tab.priority
            };
        });
    }

    // --- Initialization ------------------------------------------------------

    function _updateTabActiveStates() {
        if ($controlBar) {
            $controlBar.find(".ccb-tab-btn").removeClass("active");
            if ($sidebar && $sidebar.is(":visible")) {
                $controlBar.find('.ccb-tab-btn[data-tab-id="' + _activeTabId + '"]').addClass("active");
            }
        }
        if ($navTabBar) {
            $navTabBar.find(".sidebar-tab").removeClass("active");
            $navTabBar.find('.sidebar-tab[data-tab-id="' + _activeTabId + '"]').addClass("active");
        }
    }

    AppInit.htmlReady(function () {
        $sidebar = $("#sidebar");
        $controlBar = $("#centralControlBar");

        // Create the sidebar chip tab bar and insert after #mainNavBar
        $navTabBar = $('<div id="navTabBar"></div>');
        $sidebar.find("#mainNavBar").after($navTabBar);

        // Register the built-in Files tab
        addTab(SIDEBAR_TAB_FILES, "Files", "", { priority: 0, iconHTML: ICON_FILES });

        // VSCode-style toggle: clicking the active tab hides sidebar,
        // clicking an inactive tab shows sidebar and switches to that tab.
        $controlBar.on("click", ".ccb-tab-btn", function (e) {
            e.preventDefault();
            const tabId = $(this).attr("data-tab-id");
            if (!tabId) {
                return;
            }
            const sidebarVisible = $sidebar.is(":visible");
            if (sidebarVisible && tabId === _activeTabId) {
                const CommandManager = require("command/CommandManager");
                const Commands = require("command/Commands");
                CommandManager.execute(Commands.VIEW_HIDE_SIDEBAR);
            } else if (!sidebarVisible) {
                const CommandManager = require("command/CommandManager");
                const Commands = require("command/Commands");
                CommandManager.execute(Commands.VIEW_HIDE_SIDEBAR);
                setActiveTab(tabId);
            } else {
                setActiveTab(tabId);
            }
        });

        // Sidebar chip tab clicks just switch tabs (sidebar is already visible)
        $navTabBar.on("click", ".sidebar-tab", function () {
            const tabId = $(this).attr("data-tab-id");
            if (tabId) {
                setActiveTab(tabId);
            }
        });

        // Update active states when sidebar is shown/hidden
        $sidebar.on("panelCollapsed.sidebarTabs", function () {
            _updateTabActiveStates();
        });
        $sidebar.on("panelExpanded.sidebarTabs", function () {
            _updateTabActiveStates();
        });
    });

    // --- Make this module an EventDispatcher ----------------------------------

    EventDispatcher.makeEventDispatcher(exports);

    // --- Exports -------------------------------------------------------------

    exports.SIDEBAR_TAB_FILES  = SIDEBAR_TAB_FILES;
    exports.EVENT_TAB_ADDED    = EVENT_TAB_ADDED;
    exports.EVENT_TAB_REMOVED  = EVENT_TAB_REMOVED;
    exports.EVENT_TAB_CHANGED  = EVENT_TAB_CHANGED;

    exports.addTab             = addTab;
    exports.addToTab           = addToTab;
    exports.removeFromTab      = removeFromTab;
    exports.removeTab          = removeTab;
    exports.setActiveTab       = setActiveTab;
    exports.getActiveTab       = getActiveTab;
    exports.getAllTabs          = getAllTabs;
});
