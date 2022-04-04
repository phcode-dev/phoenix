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


/*global fs, Phoenix, process*/
/*eslint no-console: 0*/
/*eslint strict: ["error", "global"]*/
/* jshint ignore:start */

define(function (require, exports, module) {

    const EventDispatcher = require("utils/EventDispatcher"),
        EVENT_PLUGIN_PANEL_SHOWN = "plugin-panel-shown-event",
        EVENT_PLUGIN_PANEL_HIDDEN = "plugin-panel-hidden-event";

    /**
     * Represents a panel below the editor area (a child of ".content").
     * @constructor
     * @param {!jQueryObject} $panel  The entire panel, including any chrome, already in the DOM.
     * @param {!string} id  Unique id for this panel. Use package-style naming, e.g. "myextension.panelname". will
     *      overwrite an existing panel id if present.
     * @param {!jQueryObject} $toolbarIcon An icon that should be present in main-toolbar to associate this panel to.
     *      The panel will be shown only if the icon is visible on the toolbar and the user clicks on the icon.
     * @param {number=} minWidth  Minimum width of panel in px.
     * @param {?number=} initialSize  Optional Initial size of panel in px. If not given, panel will use minsize
     *      or current size.
     */
    function Panel($panel, id, $toolbarIcon, minWidth, initialSize) {
        this.$panel = $panel;
        this.panelID = id;
        this.$toolbarIcon = $toolbarIcon;
        this.minWidth = minWidth;
        this.$mainPluginPanel = $("#main-plugin-panel");
        this.initialSize = initialSize;
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
        return this.$panel.is(":visible");
    };

    /**
     * Shows the panel
     */
    Panel.prototype.show = function () {
        this.$toolbarIcon.addClass("selected-button");
        this.$panel.show();
        exports.trigger(EVENT_PLUGIN_PANEL_SHOWN, this.panelID);
    };

    /**
     * Hides the panel
     */
    Panel.prototype.hide = function () {
        this.$toolbarIcon.removeClass("selected-button");
        this.$panel.hide();
        exports.trigger(EVENT_PLUGIN_PANEL_HIDDEN, this.panelID);
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


    EventDispatcher.makeEventDispatcher(exports);

    // Public API
    exports.Panel = Panel;
    //events
    exports.EVENT_PLUGIN_PANEL_HIDDEN = EVENT_PLUGIN_PANEL_HIDDEN;
    exports.EVENT_PLUGIN_PANEL_SHOWN = EVENT_PLUGIN_PANEL_SHOWN;
});
