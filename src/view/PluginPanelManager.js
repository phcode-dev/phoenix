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

    const EventDispatcher     = require("utils/EventDispatcher"),
          CommandManager      = require("command/CommandManager");

    /**
     * The "#main-toolbar": to the right side holding plugin panels and icons
     * @type {jQueryObject}
     */
    let $mainToolbar;

    /**
     * The "#main-plugin-panel": The plugin panel main container
     * @type {jQueryObject}
     */
    let $mainPluginPanel;

    const EVENT_PLUGIN_PANEL_SHOW = "plugin-panel-show-event",
        EVENT_PLUGIN_PANEL_HIDE = "plugin-panel-hide-event";

    /**
     * Creates a new resizable plugin panel associated with the given toolbar icon. Panel is initially invisible.
     * The panel's size & visibility are automatically saved & restored. Only one panel can be associated with a
     * toolbar icon.
     *
     * @param {!string} id  Unique id for this panel. Use package-style naming, e.g. "myextension.panelname"
     * @param {!jQueryObject} $panel  DOM content to use as the panel. Need not be in the document yet. Must have an id
     *      attribute, for use as a preferences key.
     * @param {number=} minSize  Minimum height of panel in px.
     * @param {!jQueryObject} $toolbarIcon An icon that should be present in main-toolbar to associate this panel to.
     *      The panel will be shown only if the icon is visible on the toolbar and the user clicks on the icon.
     * @return {!Panel}
     */
    function createPluginPanel(id, $panel, minSize, $toolbarIcon) {
    }

    function showPluginPanel(id) {
        exports.trigger(EVENT_PLUGIN_PANEL_SHOW);
    }

    function hidePluginPanel(id) {
        exports.trigger(EVENT_PLUGIN_PANEL_HIDE);
    }

    function init() {
        $mainToolbar = $("#main-toolbar");
        $mainPluginPanel = $("#main-plugin-panel");
    }


    EventDispatcher.makeEventDispatcher(exports);

    // Public API
    exports.init = init;
    exports.createPluginPanel = createPluginPanel;
    exports.showPluginPanel = showPluginPanel;
    exports.hidePluginPanel = hidePluginPanel;
    // public events
    exports.EVENT_PLUGIN_PANEL_SHOW = EVENT_PLUGIN_PANEL_SHOW;
    exports.EVENT_PLUGIN_PANEL_HIDE = EVENT_PLUGIN_PANEL_HIDE;
});
