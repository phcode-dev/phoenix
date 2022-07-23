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
        EVENT_PANEL_SHOWN = "panelShown",
        EVENT_PANEL_HIDDEN = "panelHidden",
        PANEL_TYPE_PLUGIN_PANEL = "pluginPanel";

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
        if(!this.isVisible() && this.canBeShown()){
            this.$toolbarIcon.addClass("selected-button");
            this.$panel.show();
            exports.trigger(EVENT_PANEL_SHOWN, this.panelID);
        }
    };

    /**
     * Hides the panel
     */
    Panel.prototype.hide = function () {
        if(this.isVisible()){
            this.$toolbarIcon.removeClass("selected-button");
            this.$panel.hide();
            exports.trigger(EVENT_PANEL_HIDDEN, this.panelID);
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
     * gets the Panle's type
     * @return {string}
     */
    Panel.prototype.getPanelType = function () {
        return PANEL_TYPE_PLUGIN_PANEL;
    };

    EventDispatcher.makeEventDispatcher(exports);

    // Public API
    exports.Panel = Panel;
    //events
    exports.EVENT_PANEL_HIDDEN = EVENT_PANEL_HIDDEN;
    exports.EVENT_PANEL_SHOWN = EVENT_PANEL_SHOWN;
    exports.PANEL_TYPE_PLUGIN_PANEL = PANEL_TYPE_PLUGIN_PANEL;
});
