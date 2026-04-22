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
    const ICON_FILES = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="64 96 545 416"><path fill="currentColor" d="M129.5 480C118.7 480 111 469.5 114.2 459.2L164.2 299.2C166.3 292.5 172.5 288 179.5 288L559 288C569.8 288 577.5 298.5 574.3 308.8L524.3 468.8C522.1 475.5 516 480 509 480L129.5 480zM256.2 512L509 512C530 512 548.6 498.4 554.8 478.3L604.8 318.3C614.5 287.4 591.4 256 559 256L179.6 256C158.6 256 140 269.6 133.8 289.7L96.2 409.6L96.2 160C96.2 142.3 110.5 128 128.2 128L266.9 128C273.8 128 280.6 130.2 286.1 134.4L324.5 163.2C335.6 171.5 349.1 176 362.9 176L480.2 176C497.9 176 512.2 190.3 512.2 208L544.2 208C544.2 172.7 515.5 144 480.2 144L362.9 144C356 144 349.2 141.8 343.7 137.6L305.3 108.8C294.2 100.5 280.8 96 266.9 96L128.2 96C92.9 96 64.2 124.7 64.2 160L64.2 448C64.2 483.3 92.9 512 128.2 512L256.2 512z"/></svg>';

    const ICON_SEARCH = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path fill="currentColor" d="M416 208c0 45.9-14.9 88.3-40 122.7L502.6 457.4c12.5 12.5 12.5 32.8 0 45.3s-32.8 12.5-45.3 0L330.7 376c-34.4 25.2-76.8 40-122.7 40C93.1 416 0 322.9 0 208S93.1 0 208 0S416 93.1 416 208zM208 352a144 144 0 1 0 0-288 144 144 0 1 0 0 288z"/></svg>';

    const ICON_DESIGN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 21 21"><path fill="currentColor" d="M19.8301 13.3181L19.8253 13.2941L17.7493 6.36938C17.461 5.41309 16.7305 4.65382 15.7791 4.33666L3.07815 0.0790007C2.66007 -0.0603584 2.20355 -0.0123035 1.82872 0.199138L9.29645 7.66686C9.48867 7.614 9.68569 7.58998 9.89233 7.58998C11.1658 7.58998 12.199 8.62316 12.199 9.89661C12.199 11.1701 11.1658 12.2032 9.89233 12.2032C8.61888 12.2032 7.5857 11.1701 7.5857 9.89661C7.5857 9.68997 7.61453 9.48814 7.66258 9.30073L0.199661 1.833C-0.0117809 2.20783 -0.0598357 2.65955 0.0795234 3.08243L4.33718 15.7833C4.65435 16.73 5.41362 17.4653 6.36991 17.7536L13.2946 19.8295L13.3186 19.8344L19.8301 13.3229V13.3181Z"/><line x1="14.1513" y1="20.5938" x2="20.5906" y2="14.1064" stroke="currentColor" stroke-width="1.15332"/></svg>';

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

        // Detach persistent buttons so cached references and click handlers survive rebuilds.
        const $searchNav = $controlBar.find("#searchNav").detach();
        const $designBtn = $controlBar.find("#ccbDesignModeBtn").detach();

        $controlBar.empty();
        _tabs.sort(function (a, b) { return a.priority - b.priority; });

        // Render the design mode button first
        if ($designBtn.length) {
            $controlBar.append($designBtn);
        } else {
            $controlBar.append('<a href="#" id="ccbDesignModeBtn" class="ccb-btn" title="' +
                Strings.CCB_SWITCH_TO_DESIGN_MODE + '">' + ICON_DESIGN + '</a>');
        }

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

        // Re-attach or create the search button
        if ($searchNav.length) {
            $controlBar.append($searchNav);
        } else {
            $controlBar.append('<a href="#" id="searchNav" class="ccb-btn" title="' +
                Strings.CMD_FIND_IN_FILES + '">' + ICON_SEARCH + '</a>');
        }

        // Also rebuild the sidebar chip bar
        if ($navTabBar) {
            $navTabBar.empty();
            _tabs.forEach(function (tab, index) {
                if (index > 0) {
                    $navTabBar.append('<div class="nav-tab-divider"></div>');
                }
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

        // Design mode button click
        $controlBar.on("click", "#ccbDesignModeBtn", function (e) {
            e.preventDefault();
            const CommandManager = require("command/CommandManager");
            const Commands = require("command/Commands");
            CommandManager.execute(Commands.VIEW_TOGGLE_DESIGN_MODE);
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
