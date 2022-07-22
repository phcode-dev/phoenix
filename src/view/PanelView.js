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
        Resizer = require("utils/Resizer"),
        EVENT_PANEL_HIDDEN = 'panelHidden',
        EVENT_PANEL_SHOWN = 'panelShown',
        PANEL_TYPE_BOTTOM_PANEL = "bottomPanel";

    /**
     * Represents a panel below the editor area (a child of ".content").
     * @constructor
     * @param {!jQueryObject} $panel  The entire panel, including any chrome, already in the DOM.
     */
    function Panel($panel, id) {
        this.$panel = $panel;
        this.panelID = id;
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
        if(!this.isVisible()){
            Resizer.show(this.$panel[0]);
            exports.trigger(EVENT_PANEL_SHOWN, this.panelID);
        }
    };

    /**
     * Hides the panel
     */
    Panel.prototype.hide = function () {
        if(this.isVisible()){
            Resizer.hide(this.$panel[0]);
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
        return PANEL_TYPE_BOTTOM_PANEL;
    };

    EventDispatcher.makeEventDispatcher(exports);

    // Public API
    exports.Panel = Panel;
    //events
    exports.EVENT_PANEL_HIDDEN = EVENT_PANEL_HIDDEN;
    exports.EVENT_PANEL_SHOWN = EVENT_PANEL_SHOWN;
    exports.PANEL_TYPE_BOTTOM_PANEL = PANEL_TYPE_BOTTOM_PANEL;
});
