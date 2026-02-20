/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 *
 * This program is free software: you can redistribute it and/or modify it under
 * the terms of the GNU Affero General Public License as published by the Free
 * Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY;
 * without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 * See the GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License along
 * with this program. If not, see https://opensource.org/licenses/AGPL-3.0.
 *
 */

// @INCLUDE_IN_API_DOCS

/*global fs, Phoenix, process*/
/*eslint no-console: 0*/
/*eslint strict: ["error", "global"]*/
/* jshint ignore:start */

define(function (require, exports, module) {

    const EventDispatcher = require("utils/EventDispatcher"),
        Resizer = require("utils/Resizer"),
        Strings = require("strings");

    /**
     * Event when panel is hidden
     * @type {string}
     * @constant
     */
    const EVENT_PANEL_HIDDEN = 'panelHidden';

    /**
     * Event when panel is shown
     * @type {string}
     * @constant
     */
    const EVENT_PANEL_SHOWN = 'panelShown';

    /**
     * type for bottom panel
     * @type {string}
     * @constant
     */
    const PANEL_TYPE_BOTTOM_PANEL = 'bottomPanel';

    // --- Module-level tab state ---

    /** @type {Object.<string, Panel>} Maps panel ID to Panel instance */
    let _panelMap = {};

    /** @type {jQueryObject} The single container wrapping all bottom panels */
    let _$container;

    /** @type {jQueryObject} The tab bar inside the container */
    let _$tabBar;

    /** @type {jQueryObject} Scrollable area holding the tab elements */
    let _$tabsOverflow;

    /** @type {string[]} Ordered list of currently open (tabbed) panel IDs */
    let _openIds = [];

    /** @type {string|null} The panel ID of the currently visible (active) tab */
    let _activeId = null;

    // --- Tab helper functions ---

    /**
     * Resolve the display title for a bottom panel tab.
     * Uses the explicit title if provided, then checks for a .toolbar .title
     * DOM element in the panel, and finally derives a name from the panel id.
     * @param {string} id  The panel registration ID
     * @param {jQueryObject} $panel  The panel's jQuery element
     * @param {string=} title  Explicit title passed to createBottomPanel
     * @return {string}
     * @private
     */
    function _getPanelTitle(id, $panel, title) {
        if (title) {
            return title;
        }
        let $titleEl = $panel.find(".toolbar .title");
        if ($titleEl.length && $.trim($titleEl.text())) {
            return $.trim($titleEl.text());
        }
        let label = id.replace(new RegExp("[-_.]", "g"), " ").split(" ")[0];
        return label.charAt(0).toUpperCase() + label.slice(1);
    }

    /**
     * Full rebuild of the tab bar DOM from _openIds.
     * Call this when tabs are added, removed, or renamed.
     * @private
     */
    function _updateBottomPanelTabBar() {
        if (!_$tabsOverflow) {
            return;
        }
        _$tabsOverflow.empty();

        _openIds.forEach(function (panelId) {
            let panel = _panelMap[panelId];
            if (!panel) {
                return;
            }
            let title = panel._tabTitle || _getPanelTitle(panelId, panel.$panel);
            let isActive = (panelId === _activeId);
            let $tab = $('<div class="bottom-panel-tab"></div>')
                .toggleClass('active', isActive)
                .attr('data-panel-id', panelId);
            $tab.append($('<span class="bottom-panel-tab-title"></span>').text(title));
            $tab.append($('<span class="bottom-panel-tab-close-btn">&times;</span>').attr('title', Strings.CLOSE));
            _$tabsOverflow.append($tab);
        });
    }

    /**
     * Swap the .active class on the tab bar without rebuilding the DOM.
     * @private
     */
    function _updateActiveTabHighlight() {
        if (!_$tabBar) {
            return;
        }
        _$tabBar.find(".bottom-panel-tab").each(function () {
            let $tab = $(this);
            if ($tab.data("panel-id") === _activeId) {
                $tab.addClass("active");
            } else {
                $tab.removeClass("active");
            }
        });
    }

    /**
     * Append a single tab to the tab bar for the given panel.
     * Use instead of _updateBottomPanelTabBar() when adding one tab.
     * @param {string} panelId
     * @private
     */
    function _addTabToBar(panelId) {
        if (!_$tabsOverflow) {
            return;
        }
        let panel = _panelMap[panelId];
        if (!panel) {
            return;
        }
        let title = panel._tabTitle || _getPanelTitle(panelId, panel.$panel);
        let isActive = (panelId === _activeId);
        let $tab = $('<div class="bottom-panel-tab"></div>')
            .toggleClass('active', isActive)
            .attr('data-panel-id', panelId);
        $tab.append($('<span class="bottom-panel-tab-title"></span>').text(title));
        $tab.append($('<span class="bottom-panel-tab-close-btn">&times;</span>').attr('title', Strings.CLOSE));
        _$tabsOverflow.append($tab);
    }

    /**
     * Remove a single tab from the tab bar by panel ID.
     * Use instead of _updateBottomPanelTabBar() when removing one tab.
     * @param {string} panelId
     * @private
     */
    function _removeTabFromBar(panelId) {
        if (!_$tabsOverflow) {
            return;
        }
        _$tabsOverflow.find('.bottom-panel-tab[data-panel-id="' + panelId + '"]').remove();
    }

    /**
     * Switch the active tab to the given panel. Does not show/hide the container.
     * @param {string} panelId
     * @private
     */
    function _switchToTab(panelId) {
        if (_activeId === panelId) {
            return;
        }
        // Remove active class from current
        if (_activeId) {
            let prevPanel = _panelMap[_activeId];
            if (prevPanel) {
                prevPanel.$panel.removeClass("active-bottom-panel");
            }
        }
        // Set new active
        _activeId = panelId;
        let newPanel = _panelMap[panelId];
        if (newPanel) {
            newPanel.$panel.addClass("active-bottom-panel");
        }
        _updateActiveTabHighlight();
    }


    /**
     * Represents a panel below the editor area (a child of ".content").
     * @constructor
     * @param {!jQueryObject} $panel  The entire panel, including any chrome, already in the DOM.
     * @param {string} id  Unique panel identifier.
     * @param {string=} title  Optional display title for the tab bar.
     */
    function Panel($panel, id, title) {
        this.$panel = $panel;
        this.panelID = id;
        this._tabTitle = _getPanelTitle(id, $panel, title);
        _panelMap[id] = this;
    }

    /**
     * Dom node holding the rendered panel
     * @type {jQueryObject}
     */
    Panel.prototype.$panel = null;

    /**
     * Determines if the panel is visible
     * @return {boolean} true if visible, false if not
     */
    Panel.prototype.isVisible = function () {
        return (_activeId === this.panelID) && _$container && _$container.is(":visible");
    };

    /**
     * Registers a call back function that will be called just before panel is shown. The handler should return true
     * if the panel can be shown, else return false and the panel will not be shown.
     * @param {function|null} canShowHandlerFn function that should return true of false if the panel can be shown/not.
     * or null to clear the handler.
     * @return {boolean} true if visible, false if not
     */
    Panel.prototype.registerCanBeShownHandler = function (canShowHandlerFn) {
        if(this.canBeShownHandler && canShowHandlerFn){
            console.warn(`canBeShownHandler already registered for panel: ${this.panelID}. will be overwritten`);
        }
        this.canBeShownHandler = canShowHandlerFn;
    };

    /**
     * Returns true if th panel can be shown, else false.
     * @return {boolean}
     */
    Panel.prototype.canBeShown = function () {
        let self = this;
        if(self.canBeShownHandler){
            return self.canBeShownHandler();
        }
        return true;
    };

    /**
     * Shows the panel
     */
    Panel.prototype.show = function () {
        if (!this.canBeShown() || !_$container) {
            return;
        }
        let panelId = this.panelID;
        let isOpen = _openIds.indexOf(panelId) !== -1;
        let isActive = (_activeId === panelId);

        if (isOpen && isActive) {
            // Already open and active — just ensure container is visible
            if (!_$container.is(":visible")) {
                Resizer.show(_$container[0]);
                exports.trigger(EVENT_PANEL_SHOWN, panelId);
            }
            return;
        }
        if (isOpen && !isActive) {
            // Open but not active - switch tab and ensure container is visible
            _switchToTab(panelId);
            if (!_$container.is(":visible")) {
                Resizer.show(_$container[0]);
            }
            exports.trigger(EVENT_PANEL_SHOWN, panelId);
            return;
        }
        // Not open: add to open set
        _openIds.push(panelId);

        // Show container if it was hidden
        if (!_$container.is(":visible")) {
            Resizer.show(_$container[0]);
        }

        _switchToTab(panelId);
        _addTabToBar(panelId);
        exports.trigger(EVENT_PANEL_SHOWN, panelId);
    };

    /**
     * Hides the panel
     */
    Panel.prototype.hide = function () {
        let panelId = this.panelID;
        let idx = _openIds.indexOf(panelId);
        if (idx === -1) {
            // Not open - no-op
            return;
        }

        // Remove from open set
        _openIds.splice(idx, 1);
        this.$panel.removeClass("active-bottom-panel");

        let wasActive = (_activeId === panelId);
        let activatedId = null;

        if (wasActive && _openIds.length > 0) {
            let nextIdx = Math.min(idx, _openIds.length - 1);
            activatedId = _openIds[nextIdx];
            _activeId = null; // clear so _switchToTab runs
            _switchToTab(activatedId);
        } else if (wasActive) {
            // No more tabs - hide the container
            _activeId = null;
            if (_$container) {
                Resizer.hide(_$container[0]);
            }
        }

        _removeTabFromBar(panelId);

        // Always fire HIDDEN for the closed panel first
        exports.trigger(EVENT_PANEL_HIDDEN, panelId);

        // Then fire SHOWN for the newly activated tab, if any
        if (activatedId) {
            exports.trigger(EVENT_PANEL_SHOWN, activatedId);
        }
    };

    /**
     * Sets the panel's visibility state
     * @param {boolean} visible true to show, false to hide
     */
    Panel.prototype.setVisible = function (visible) {
        if (visible) {
            this.show();
        } else {
            this.hide();
        }
    };

    /**
     * Updates the display title shown in the tab bar for this panel.
     * @param {string} newTitle  The new title to display.
     */
    Panel.prototype.setTitle = function (newTitle) {
        this._tabTitle = newTitle;
        if (_$tabsOverflow) {
            _$tabsOverflow.find('.bottom-panel-tab[data-panel-id="' + this.panelID + '"] .bottom-panel-tab-title')
                .text(newTitle);
        }
    };

    /**
     * Destroys the panel, removing it from the tab bar, internal maps, and the DOM.
     * After calling this, the Panel instance should not be reused.
     */
    Panel.prototype.destroy = function () {
        if (_openIds.indexOf(this.panelID) !== -1) {
            this.hide();
        }
        delete _panelMap[this.panelID];
        this.$panel.remove();
    };

    /**
     * gets the Panel's type
     * @return {string}
     */
    Panel.prototype.getPanelType = function () {
        return PANEL_TYPE_BOTTOM_PANEL;
    };

    /**
     * Initializes the PanelView module with references to the bottom panel container DOM elements.
     * Called by WorkspaceManager during htmlReady.
     * @param {jQueryObject} $container  The bottom panel container element.
     * @param {jQueryObject} $tabBar  The tab bar element inside the container.
     * @param {jQueryObject} $tabsOverflow  The scrollable area holding tab elements.
     */
    function init($container, $tabBar, $tabsOverflow) {
        _$container = $container;
        _$tabBar = $tabBar;
        _$tabsOverflow = $tabsOverflow;

        // Tab bar click handlers
        _$tabBar.on("click", ".bottom-panel-tab-close-btn", function (e) {
            e.stopPropagation();
            let panelId = $(this).closest(".bottom-panel-tab").data("panel-id");
            if (panelId) {
                let panel = _panelMap[panelId];
                if (panel) {
                    panel.hide();
                }
            }
        });

        _$tabBar.on("click", ".bottom-panel-tab", function (e) {
            let panelId = $(this).data("panel-id");
            if (panelId && panelId !== _activeId) {
                let panel = _panelMap[panelId];
                if (panel) {
                    panel.show();
                }
            }
        });

        // Hide-panel button collapses the container but keeps tabs intact
        _$tabBar.on("click", ".bottom-panel-hide-btn", function (e) {
            e.stopPropagation();
            if (_$container.is(":visible")) {
                Resizer.hide(_$container[0]);
            }
        });
    }

    /**
     * Returns a copy of the currently open bottom panel IDs in tab order.
     * @return {string[]}
     */
    function getOpenBottomPanelIDs() {
        return _openIds.slice();
    }

    /**
     * Hides every open bottom panel tab in a single batch
     * @return {string[]} The IDs of panels that were open (useful for restoring later).
     */
    function hideAllOpenPanels() {
        if (_openIds.length === 0) {
            return [];
        }
        let closedIds = _openIds.slice();

        // Remove visual active state from every panel
        for (let i = 0; i < closedIds.length; i++) {
            let panel = _panelMap[closedIds[i]];
            if (panel) {
                panel.$panel.removeClass("active-bottom-panel");
            }
        }

        // Clear internal state BEFORE hiding the container so the
        // panelCollapsed handler sees an empty _openIds and doesn't
        // redundantly update the stacks.
        _openIds = [];
        _activeId = null;

        if (_$container && _$container.is(":visible")) {
            Resizer.hide(_$container[0]);
        }

        _updateBottomPanelTabBar();

        // Fire one EVENT_PANEL_HIDDEN per panel for stack tracking.
        // No intermediate EVENT_PANEL_SHOWN events are emitted.
        for (let i = 0; i < closedIds.length; i++) {
            exports.trigger(EVENT_PANEL_HIDDEN, closedIds[i]);
        }

        return closedIds;
    }

    EventDispatcher.makeEventDispatcher(exports);

    // Public API
    exports.Panel = Panel;
    exports.init = init;
    exports.getOpenBottomPanelIDs = getOpenBottomPanelIDs;
    exports.hideAllOpenPanels = hideAllOpenPanels;
    //events
    exports.EVENT_PANEL_HIDDEN = EVENT_PANEL_HIDDEN;
    exports.EVENT_PANEL_SHOWN = EVENT_PANEL_SHOWN;
    exports.PANEL_TYPE_BOTTOM_PANEL = PANEL_TYPE_BOTTOM_PANEL;
});
