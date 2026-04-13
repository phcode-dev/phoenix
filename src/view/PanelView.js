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
        PreferencesManager = require("preferences/PreferencesManager"),
        Resizer = require("utils/Resizer"),
        DropdownButton = require("widgets/DropdownButton"),
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

    /** @type {boolean} Whether the bottom panel is currently maximized */
    let _isMaximized = false;

    /**
     * Pixel threshold for detecting near-maximize state during resize.
     * If the editor holder height is within this many pixels of zero, the
     * panel is treated as maximized. Keeps the maximize icon responsive
     * during drag without being overly sensitive.
     * @const
     * @type {number}
     */
    const MAXIMIZE_THRESHOLD = 2;

    /**
     * Minimum panel height (matches Resizer minSize) used as a floor
     * when computing a sensible restore height.
     * @const
     * @type {number}
     */
    const MIN_PANEL_HEIGHT = 200;

    /** Preference key for persisting the maximize state across reloads. */
    const PREF_BOTTOM_PANEL_MAXIMIZED = "bottomPanelMaximized";

    /** @type {number|null} The panel height before maximize, for restore */
    let _preMaximizeHeight = null;

    /** @type {jQueryObject} The editor holder element, passed from WorkspaceManager */
    let _$editorHolder = null;

    /** @type {function} recomputeLayout callback from WorkspaceManager */
    let _recomputeLayout = null;

    /** @type {string|null} The default/quick-access panel ID */
    let _defaultPanelId = null;

    /** @type {jQueryObject} The "+" button inside the tab overflow area */
    let _$addBtn = null;

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
    /**
     * Build a tab element for a panel.
     * @param {Panel} panel
     * @param {boolean} isActive
     * @return {jQueryObject}
     * @private
     */
    function _buildTab(panel, isActive) {
        let title = panel._tabTitle || _getPanelTitle(panel.panelID, panel.$panel);
        // Default panel (Tools) tab is not draggable — it's a fixed slot, not a user tab
        const isDefault = panel.panelID === _defaultPanelId;
        let $tab = $('<div class="bottom-panel-tab"></div>')
            .toggleClass('bottom-panel-tab-default', isDefault)
            .attr('draggable', isDefault ? 'false' : 'true')
            .toggleClass('active', isActive)
            .attr('data-panel-id', panel.panelID);
        const iconSrc = panel._options.iconSvg || "styles/images/panel-icon-default.svg";
        const $icon = $('<span class="bottom-panel-tab-icon panel-titlebar-icon"></span>');
        const maskUrl = "url('" + iconSrc + "')";
        $icon[0].style.maskImage = maskUrl;
        $icon[0].style.webkitMaskImage = maskUrl;
        $tab.append($icon);
        $tab.append($('<span class="bottom-panel-tab-title"></span>').text(title));
        $tab.append($('<span class="bottom-panel-tab-close-btn">&times;</span>').attr('title', Strings.CLOSE));
        return $tab;
    }

    function _updateBottomPanelTabBar() {
        if (!_$tabsOverflow) {
            return;
        }
        // Detach the add button before emptying to preserve its event handlers
        if (_$addBtn) {
            _$addBtn.detach();
        }
        _$tabsOverflow.empty();

        _openIds.forEach(function (panelId) {
            let panel = _panelMap[panelId];
            if (!panel) {
                return;
            }
            _$tabsOverflow.append(_buildTab(panel, panelId === _activeId));
        });

        // Re-append the Tools button at the end
        if (_$addBtn) {
            _$tabsOverflow.append(_$addBtn);
        }
        _updateAddButtonVisibility();
        _checkTabOverflow();
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
        let $tab = _buildTab(panel, panelId === _activeId);
        // Insert before the Tools button so it stays at the end
        if (_$addBtn && _$addBtn.parent().length) {
            _$addBtn.before($tab);
        } else {
            _$tabsOverflow.append($tab);
        }
        _updateAddButtonVisibility();
        _checkTabOverflow();
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
        _updateAddButtonVisibility();
        _checkTabOverflow();
    }

    /**
     * Set up drag-and-drop tab reordering on the bottom panel tab bar.
     * Uses a vertical line indicator matching the file tab bar UX.
     * @private
     */
    function _initDragAndDrop() {
        let draggedTab = null;
        let $indicator = $('<div class="tab-drag-indicator"></div>');
        $("body").append($indicator);

        function getDropPosition(targetTab, mouseX) {
            const rect = targetTab.getBoundingClientRect();
            return mouseX < rect.left + rect.width / 2;
        }

        function updateIndicator(targetTab, insertBefore) {
            if (!targetTab) {
                $indicator.hide();
                return;
            }
            const rect = targetTab.getBoundingClientRect();
            $indicator.css({
                position: "fixed",
                left: (insertBefore ? rect.left : rect.right) + "px",
                top: rect.top + "px",
                height: rect.height + "px",
                width: "2px",
                zIndex: 10001
            }).show();
        }

        function cleanup() {
            if (draggedTab) {
                $(draggedTab).removeClass("bottom-panel-tab-dragging");
            }
            draggedTab = null;
            $indicator.hide();
            _$tabBar.find(".bottom-panel-tab").removeClass("drag-target");
        }

        _$tabBar.on("dragstart", ".bottom-panel-tab", function (e) {
            // Default panel (Tools) tab is never draggable
            if ($(this).data("panel-id") === _defaultPanelId) {
                e.preventDefault();
                return;
            }
            draggedTab = this;
            e.originalEvent.dataTransfer.effectAllowed = "move";
            e.originalEvent.dataTransfer.setData("application/x-phoenix-panel-tab", "1");
            $(this).addClass("bottom-panel-tab-dragging");
        });

        _$tabBar.on("dragend", ".bottom-panel-tab", function () {
            setTimeout(cleanup, 50);
        });

        _$tabBar.on("dragover", ".bottom-panel-tab", function (e) {
            if (!draggedTab || this === draggedTab) {
                return;
            }
            // Don't allow dropping onto the default panel (Tools) tab
            if ($(this).data("panel-id") === _defaultPanelId) {
                return;
            }
            e.preventDefault();
            e.originalEvent.dataTransfer.dropEffect = "move";
            _$tabBar.find(".bottom-panel-tab").removeClass("drag-target");
            $(this).addClass("drag-target");
            updateIndicator(this, getDropPosition(this, e.originalEvent.clientX));
        });

        _$tabBar.on("dragleave", ".bottom-panel-tab", function (e) {
            const related = e.originalEvent.relatedTarget;
            if (!$(this).is(related) && !$(this).has(related).length) {
                $(this).removeClass("drag-target");
            }
        });

        _$tabBar.on("drop", ".bottom-panel-tab", function (e) {
            e.preventDefault();
            e.stopPropagation();
            if (!draggedTab || this === draggedTab) {
                cleanup();
                return;
            }
            let draggedId = $(draggedTab).data("panel-id");
            let targetId = $(this).data("panel-id");
            let fromIdx = _openIds.indexOf(draggedId);
            let toIdx = _openIds.indexOf(targetId);
            if (fromIdx === -1 || toIdx === -1) {
                cleanup();
                return;
            }
            const insertBefore = getDropPosition(this, e.originalEvent.clientX);
            _openIds.splice(fromIdx, 1);
            let newIdx = _openIds.indexOf(targetId);
            if (!insertBefore) {
                newIdx++;
            }
            _openIds.splice(newIdx, 0, draggedId);
            cleanup();
            _updateBottomPanelTabBar();
            _updateActiveTabHighlight();
        });
    }

    /**
     * Check if the tab bar is overflowing and collapse tabs to icons if so.
     * Only collapses tabs that have an icon available.
     * @private
     */
    /** @type {jQueryObject} Overflow dropdown button */
    let _$overflowBtn = null;

    function _checkTabOverflow() {
        if (!_$tabBar) {
            return;
        }
        // Remove collapsed state first to measure true width
        _$tabBar.removeClass("bottom-panel-tabs-collapsed");
        const isOverflowing = _$tabsOverflow[0].scrollWidth > _$tabsOverflow[0].clientWidth;
        _$tabBar.toggleClass("bottom-panel-tabs-collapsed", isOverflowing);

        // Check if still overflowing after collapse
        const stillOverflowing = isOverflowing &&
            _$tabsOverflow[0].scrollWidth > _$tabsOverflow[0].clientWidth;

        // Show/hide overflow button
        if (_$overflowBtn) {
            _$overflowBtn.toggle(stillOverflowing);
        }

        // Show tooltip on hover only in collapsed mode (title text is hidden)
        _$tabBar.find(".bottom-panel-tab").each(function () {
            const $tab = $(this);
            if (isOverflowing) {
                $tab.attr("title", $tab.find(".bottom-panel-tab-title").text());
            } else {
                $tab.removeAttr("title");
            }
        });
    }

    /**
     * Get the list of hidden (not fully visible) panel tabs.
     * @return {Array<{panelId: string, title: string}>}
     * @private
     */
    function _getHiddenTabs() {
        const hidden = [];
        const barRect = _$tabsOverflow[0].getBoundingClientRect();
        _$tabsOverflow.find(".bottom-panel-tab").each(function () {
            const tabRect = this.getBoundingClientRect();
            const isVisible = tabRect.left >= barRect.left &&
                tabRect.right <= (barRect.right + 2);
            if (!isVisible) {
                const $tab = $(this);
                hidden.push({
                    panelId: $tab.data("panel-id"),
                    title: $tab.find(".bottom-panel-tab-title").text()
                });
            }
        });
        return hidden;
    }

    /** @type {DropdownButton.DropdownButton} */
    let _overflowDropdown = null;

    /**
     * Show a dropdown menu listing hidden panel tabs.
     * Uses the same DropdownButton widget as the file tab bar overflow.
     * @private
     */
    function _showOverflowMenu() {
        // If dropdown is already open, close it (toggle behavior)
        if (_overflowDropdown) {
            _overflowDropdown.closeDropdown();
            _overflowDropdown = null;
            return;
        }

        const hidden = _getHiddenTabs();
        if (!hidden.length) {
            return;
        }

        _overflowDropdown = new DropdownButton.DropdownButton("", hidden, function (item) {
            const panel = _panelMap[item.panelId];
            const iconSrc = (panel && panel._options && panel._options.iconSvg)
                || "styles/images/panel-icon-default.svg";
            const iconStyle = "width:14px;height:14px;margin-right:6px;vertical-align:middle;"
                + "mask-image:url('" + iconSrc + "');-webkit-mask-image:url('" + iconSrc + "')";
            const iconHtml = '<span class="panel-titlebar-icon" style="' + iconStyle + '"></span>';
            const activeClass = item.panelId === _activeId ? ' style="font-weight:600"' : '';
            return {
                html: '<div class="dropdown-tab-item"' + activeClass + '>'
                    + iconHtml + '<span>' + item.title + '</span></div>',
                enabled: true
            };
        });

        _overflowDropdown.dropdownExtraClasses = "dropdown-overflow-menu";

        // Position at the overflow button
        const btnRect = _$overflowBtn[0].getBoundingClientRect();
        $("body").append(_overflowDropdown.$button);
        _overflowDropdown.$button.css({
            position: "absolute",
            left: btnRect.left + "px",
            top: (btnRect.top - 2) + "px",
            zIndex: 1000
        });

        _overflowDropdown.showDropdown();

        _overflowDropdown.on("select", function (e, item) {
            const panel = _panelMap[item.panelId];
            if (panel) {
                panel.show();
                // Scroll the newly active tab into view
                const $tab = _$tabsOverflow.find('.bottom-panel-tab[data-panel-id="' + item.panelId + '"]');
                if ($tab.length) {
                    $tab[0].scrollIntoView({inline: "nearest"});
                }
            }
        });

        // Clean up reference when dropdown closes
        _overflowDropdown.on(DropdownButton.EVENT_DROPDOWN_CLOSED, function () {
            if (_overflowDropdown) {
                _overflowDropdown.$button.remove();
                _overflowDropdown = null;
            }
        });
    }

    /**
     * Show or hide the "+" button based on whether the default panel is active.
     * The button is hidden when the default panel is the active tab (since
     * clicking "+" would be a no-op) and shown otherwise.
     * @private
     */
    function _updateAddButtonVisibility() {
        if (!_$addBtn) {
            return;
        }
        if (_defaultPanelId && _activeId === _defaultPanelId) {
            _$addBtn.hide();
        } else {
            _$addBtn.show();
        }
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
        _updateAddButtonVisibility();
    }


    /**
     * Represents a panel below the editor area (a child of ".content").
     * @constructor
     * @param {!jQueryObject} $panel  The entire panel, including any chrome, already in the DOM.
     * @param {string} id  Unique panel identifier.
     * @param {string=} title  Optional display title for the tab bar.
     */
    /**
     * @param {jQueryObject} $panel
     * @param {string} id
     * @param {string=} title
     * @param {Object=} options
     * @param {string=} options.iconSvg   Path to an SVG icon (e.g. "styles/images/icon.svg").
     */
    function Panel($panel, id, title, options) {
        this.$panel = $panel;
        this.panelID = id;
        this._tabTitle = _getPanelTitle(id, $panel, title);
        this._options = options || {};
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
     * Registers an async handler that is called before the panel is closed via user interaction (e.g. clicking the
     * tab close button). The handler should return `true` to allow the close, or `false` to prevent it.
     * @param {function|null} handler An async function returning a boolean, or null to clear the handler.
     */
    Panel.prototype.registerOnCloseRequestedHandler = function (handler) {
        if (this._onCloseRequestedHandler && handler) {
            console.warn(`onCloseRequestedHandler already registered for panel: ${this.panelID}. will be overwritten`);
        }
        this._onCloseRequestedHandler = handler;
    };

    /**
     * Requests the panel to hide, invoking the registered onCloseRequested handler first (if any).
     * If the handler returns false, the panel stays open. If it returns true or no handler is
     * registered, `hide()` is called.
     * @return {Promise<boolean>} Resolves to true if the panel was hidden, false if prevented.
     */
    Panel.prototype.requestClose = async function () {
        if (this._onCloseRequestedHandler) {
            const allowed = await this._onCloseRequestedHandler();
            if (!allowed) {
                return false;
            }
        }
        this.hide();
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
                restoreIfMaximized();
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
     * Attempts to focus the panel. Override this in panels that support focus
     * (e.g. terminal). The default implementation returns false.
     * @return {boolean} true if the panel accepted focus, false otherwise
     */
    Panel.prototype.focus = function () {
        return false;
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
     * @param {jQueryObject} $editorHolder  The editor holder element (for maximize height calculation).
     * @param {function} recomputeLayoutFn  Callback to trigger workspace layout recomputation.
     * @param {string} defaultPanelId  The ID of the default/quick-access panel.
     */
    function init($container, $tabBar, $tabsOverflow, $editorHolder, recomputeLayoutFn, defaultPanelId) {
        _$container = $container;
        _$tabBar = $tabBar;
        _$tabsOverflow = $tabsOverflow;
        _$editorHolder = $editorHolder;
        _recomputeLayout = recomputeLayoutFn;
        _defaultPanelId = defaultPanelId;

        // Create the "Tools" button inside the scrollable tabs area.
        _$addBtn = $('<span class="bottom-panel-add-btn" draggable="false" title="' + Strings.BOTTOM_PANEL_DEFAULT_TITLE + '">'
            + '<img class="app-drawer-tab-icon" draggable="false" src="styles/images/app-drawer.svg"'
            + ' style="width:12px;height:12px;vertical-align:middle;margin-right:4px">'
            + Strings.BOTTOM_PANEL_DEFAULT_TITLE + '</span>');
        _$tabsOverflow.append(_$addBtn);

        // Tab bar click handlers
        _$tabBar.on("click", ".bottom-panel-tab-close-btn", function (e) {
            e.stopPropagation();
            let panelId = $(this).closest(".bottom-panel-tab").data("panel-id");
            if (panelId) {
                let panel = _panelMap[panelId];
                if (panel) {
                    panel.requestClose();
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
            // Scroll clicked tab into view if partially hidden
            this.scrollIntoView({inline: "nearest"});
        });

        _initDragAndDrop();

        // Overflow button for hidden tabs (inserted between tabs and action buttons)
        _$overflowBtn = $('<span class="bottom-panel-overflow-btn" title="' + Strings.TABBAR_SHOW_HIDDEN_TABS + '">'
            + '<i class="fa-solid fa-chevron-down"></i></span>');
        _$overflowBtn.hide();
        _$tabBar.find(".bottom-panel-tab-bar-actions").before(_$overflowBtn);
        _$overflowBtn.on("click", function (e) {
            e.stopPropagation();
            _showOverflowMenu();
        });

        // "+" button opens the default/quick-access panel
        _$addBtn.on("click", function (e) {
            e.stopPropagation();
            if (_defaultPanelId && _panelMap[_defaultPanelId]) {
                _panelMap[_defaultPanelId].show();
            }
        });

        // Hide-panel button collapses the container but keeps tabs intact.
        // Maximize state is preserved so the panel re-opens maximized.
        _$tabBar.on("click", ".bottom-panel-hide-btn", function (e) {
            e.stopPropagation();
            if (_$container.is(":visible")) {
                Resizer.hide(_$container[0]);
            }
        });

        // Maximize/restore toggle button
        _$tabBar.on("click", ".bottom-panel-maximize-btn", function (e) {
            e.stopPropagation();
            _toggleMaximize();
        });

        // Double-click on empty tab bar area toggles maximize.
        // Exclude tabs themselves, action buttons, and the add button.
        _$tabBar.on("dblclick", function (e) {
            if ($(e.target).closest(".bottom-panel-tab, .bottom-panel-tab-close-btn, .bottom-panel-hide-btn, .bottom-panel-maximize-btn, .bottom-panel-add-btn").length) {
                return;
            }
            _toggleMaximize();
        });

        // Observe the outer tab bar container so that only external resizes
        // (e.g. window resize) trigger a re-check. Observing _$tabsOverflow
        // would cause an infinite loop in WebKit because _checkTabOverflow
        // toggles classes that change _$tabsOverflow's size.
        new ResizeObserver(_checkTabOverflow).observe(_$tabBar[0]);

        // Restore maximize state from preferences (survives reload).
        _isMaximized = PreferencesManager.getViewState(PREF_BOTTOM_PANEL_MAXIMIZED) === true;

        // When the container expands, re-apply maximize if the preference
        // says we were maximized (covers both minimize→show and reload).
        _$container.on("panelExpanded", function () {
            if (_isMaximized) {
                // Defer to let all synchronous panelExpanded handlers
                // (including WorkspaceManager's recomputeLayout) finish first.
                setTimeout(function () {
                    let maxHeight = (_$editorHolder ? _$editorHolder.height() : 0) +
                        _$container.height();
                    _$container.height(maxHeight);
                    _updateMaximizeButton();
                    if (_recomputeLayout) {
                        _recomputeLayout();
                    }
                }, 0);
            }
        });
    }

    /**
     * Toggle maximize/restore of the bottom panel.
     * @private
     */
    function _toggleMaximize() {
        if (!_$container || !_$container.is(":visible")) {
            return;
        }
        if (_isMaximized) {
            _restorePanel();
        } else {
            _maximizePanel();
        }
    }

    /**
     * Maximize the bottom panel to fill all available vertical space.
     * @private
     */
    function _maximizePanel() {
        _preMaximizeHeight = _$container.height();
        let maxHeight = _$editorHolder.height() + _$container.height();
        _$container.height(maxHeight);
        _isMaximized = true;
        PreferencesManager.setViewState(PREF_BOTTOM_PANEL_MAXIMIZED, true);
        _updateMaximizeButton();
        if (_recomputeLayout) {
            _recomputeLayout();
        }
    }

    /**
     * Compute a sensible panel height for restore when the saved height is
     * missing or indistinguishable from the maximized height.
     * Returns roughly one-third of the total available space, floored at
     * MIN_PANEL_HEIGHT so the panel never restores too small.
     * @return {number}
     * @private
     */
    function _getDefaultRestoreHeight() {
        let totalHeight = (_$editorHolder ? _$editorHolder.height() : 0) +
            (_$container ? _$container.height() : 0);
        return Math.max(MIN_PANEL_HEIGHT, Math.round(totalHeight / 3));
    }

    /**
     * Return true if the given height is effectively the same as the
     * maximized height (within MAXIMIZE_THRESHOLD).
     * @param {number} height
     * @return {boolean}
     * @private
     */
    function _isNearMaxHeight(height) {
        let totalHeight = (_$editorHolder ? _$editorHolder.height() : 0) +
            (_$container ? _$container.height() : 0);
        return (totalHeight - height) <= MAXIMIZE_THRESHOLD;
    }

    /**
     * Restore the bottom panel to its pre-maximize height.
     * If the saved height is missing (e.g. maximize was triggered by
     * drag-to-max) or was essentially the same as the maximized height,
     * a sensible default (≈ 1/3 of available space) is used instead so
     * that the restore feels like a visible change.
     * @private
     */
    function _restorePanel() {
        let restoreHeight;
        if (_preMaximizeHeight !== null && !_isNearMaxHeight(_preMaximizeHeight)) {
            restoreHeight = _preMaximizeHeight;
        } else {
            restoreHeight = _getDefaultRestoreHeight();
        }
        _$container.height(restoreHeight);
        _isMaximized = false;
        _preMaximizeHeight = null;
        PreferencesManager.setViewState(PREF_BOTTOM_PANEL_MAXIMIZED, false);
        _updateMaximizeButton();
        if (_recomputeLayout) {
            _recomputeLayout();
        }
    }

    /**
     * Update the maximize button icon and tooltip based on current state.
     * @private
     */
    function _updateMaximizeButton() {
        if (!_$tabBar) {
            return;
        }
        let $btn = _$tabBar.find(".bottom-panel-maximize-btn");
        let $icon = $btn.find("i");
        if (_isMaximized) {
            $icon.removeClass("fa-regular fa-square")
                .addClass("fa-regular fa-window-restore");
            $btn.attr("title", Strings.BOTTOM_PANEL_RESTORE);
        } else {
            $icon.removeClass("fa-regular fa-window-restore")
                .addClass("fa-regular fa-square");
            $btn.attr("title", Strings.BOTTOM_PANEL_MAXIMIZE);
        }
    }

    /**
     * Exit maximize state without resizing (for external callers like drag-resize).
     * Clears internal maximize state and resets the button icon.
     */
    function exitMaximizeOnResize() {
        if (!_isMaximized) {
            return;
        }
        _isMaximized = false;
        _preMaximizeHeight = null;
        PreferencesManager.setViewState(PREF_BOTTOM_PANEL_MAXIMIZED, false);
        _updateMaximizeButton();
    }

    /**
     * Enter maximize state during a drag-resize that reaches the maximum
     * height. No pre-maximize height is stored because the user arrived
     * here via continuous dragging; a sensible default will be computed if
     * they later click the Restore button.
     */
    function enterMaximizeOnResize() {
        if (_isMaximized) {
            return;
        }
        _isMaximized = true;
        _preMaximizeHeight = null;
        PreferencesManager.setViewState(PREF_BOTTOM_PANEL_MAXIMIZED, true);
        _updateMaximizeButton();
    }

    /**
     * Restore the container's CSS height to the pre-maximize value and clear maximize state.
     * Must be called BEFORE Resizer.hide() so the Resizer reads the correct height.
     * If not maximized, this is a no-op.
     * When the saved height is near-max or unknown, a sensible default is used.
     */
    function restoreIfMaximized() {
        if (!_isMaximized) {
            return;
        }
        if (_preMaximizeHeight !== null && !_isNearMaxHeight(_preMaximizeHeight)) {
            _$container.height(_preMaximizeHeight);
        } else {
            _$container.height(_getDefaultRestoreHeight());
        }
        _isMaximized = false;
        _preMaximizeHeight = null;
        PreferencesManager.setViewState(PREF_BOTTOM_PANEL_MAXIMIZED, false);
        _updateMaximizeButton();
    }

    /**
     * Returns true if the bottom panel is currently maximized.
     * @return {boolean}
     */
    function isMaximized() {
        return _isMaximized;
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
            restoreIfMaximized();
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

    /**
     * Returns the currently active (visible) bottom panel, or null if none.
     * @return {Panel|null}
     */
    function getActiveBottomPanel() {
        if (_activeId && _panelMap[_activeId]) {
            return _panelMap[_activeId];
        }
        return null;
    }

    /**
     * Cycle to the next open bottom panel tab. If the container is hidden
     * or no panels are open, does nothing and returns false.
     * @return {boolean} true if a panel switch occurred
     */
    function showNextPanel() {
        if (_openIds.length <= 0) {
            return false;
        }
        const currentIdx = _activeId ? _openIds.indexOf(_activeId) : -1;
        const nextIdx = (currentIdx + 1) % _openIds.length;
        const nextPanel = _panelMap[_openIds[nextIdx]];
        if (nextPanel) {
            nextPanel.show();
        }
        return true;
    }

    EventDispatcher.makeEventDispatcher(exports);

    // Public API
    exports.Panel = Panel;
    exports.init = init;
    exports.getOpenBottomPanelIDs = getOpenBottomPanelIDs;
    exports.getActiveBottomPanel = getActiveBottomPanel;
    exports.showNextPanel = showNextPanel;
    exports.hideAllOpenPanels = hideAllOpenPanels;
    exports.exitMaximizeOnResize = exitMaximizeOnResize;
    exports.enterMaximizeOnResize = enterMaximizeOnResize;
    exports.restoreIfMaximized = restoreIfMaximized;
    exports.isMaximized = isMaximized;
    exports.MAXIMIZE_THRESHOLD = MAXIMIZE_THRESHOLD;
    //events
    exports.EVENT_PANEL_HIDDEN = EVENT_PANEL_HIDDEN;
    exports.EVENT_PANEL_SHOWN = EVENT_PANEL_SHOWN;
    exports.PANEL_TYPE_BOTTOM_PANEL = PANEL_TYPE_BOTTOM_PANEL;
});
