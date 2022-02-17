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
        WorkspaceManager = require("view/WorkspaceManager");

    const PLUGIN_ID_PANEL_MAP = {};

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

    /**
     * The ".content" vertical stack (editor + all header/footer panels)
     * @type {jQueryObject}
     */
    var $windowContent;

    const EVENT_PLUGIN_PANEL_SHOWN = "plugin-panel-shown-event",
        EVENT_PLUGIN_PANEL_HIDDEN = "plugin-panel-hidden-event",
        MAIN_TOOLBAR_WIDTH = 30;

    /**
     * Creates a new resizable plugin panel associated with the given toolbar icon. Panel is initially invisible.
     * The panel's size & visibility are automatically saved & restored. Only one panel can be associated with a
     * toolbar icon.
     *
     * @param {!string} id  Unique id for this panel. Use package-style naming, e.g. "myextension.panelname". will
     *      overwrite an existing panel id if present.
     * @param {!jQueryObject} $panel  DOM content to use as the panel. Need not be in the document yet. Must have an id
     *      attribute, for use as a preferences key.
     * @param {number=} minSize  Minimum height of panel in px.
     * @param {!jQueryObject} $toolbarIcon An icon that should be present in main-toolbar to associate this panel to.
     *      The panel will be shown only if the icon is visible on the toolbar and the user clicks on the icon.
     * @return {!Panel}
     */
    function createPluginPanel(id, $panel, minSize, $toolbarIcon) {
        if(!$toolbarIcon){
            throw new Error("invalid $toolbarIcon provided to create createPluginPanel");
        }

        $mainPluginPanel.appendChild($panel);

        // The api for plugin panel manager should be very close to bottom panel to allow eazy migration
        // TODO: make all plugin panel apis private? and just reuse api in workspace manager. Will help eazy
        // migration to plugin panel.
        // panelIDMap[id] = new Panel($panel, minSize);
        // panelIDMap[id].panelID = id;
        //
        // return panelIDMap[id];
    }

    function showPluginPanel(id) {
        Resizer.makeResizable($mainToolbar, Resizer.DIRECTION_HORIZONTAL, Resizer.POSITION_LEFT, MAIN_TOOLBAR_WIDTH,
            true, undefined, true, undefined, $(".content"));
        WorkspaceManager.recomputeLayout(true);
        exports.trigger(EVENT_PLUGIN_PANEL_SHOWN, id);
    }

    function hidePluginPanel(id) {
        $mainToolbar.css('width', MAIN_TOOLBAR_WIDTH);
        $windowContent.css('right', MAIN_TOOLBAR_WIDTH);
        WorkspaceManager.recomputeLayout(true);
        Resizer.removeSizable($mainToolbar[0]);
        exports.trigger(EVENT_PLUGIN_PANEL_HIDDEN, id);
    }

    function init() {
        $mainToolbar = $("#main-toolbar");
        $windowContent = $(".content");
        $mainPluginPanel = $("#main-plugin-panel");
    }


    EventDispatcher.makeEventDispatcher(exports);

    // Public API
    exports.init = init;
    exports.createPluginPanel = createPluginPanel;
    exports.showPluginPanel = showPluginPanel;
    exports.hidePluginPanel = hidePluginPanel;
    // public events
    exports.EVENT_PLUGIN_PANEL_SHOWN = EVENT_PLUGIN_PANEL_SHOWN;
    exports.EVENT_PLUGIN_PANEL_HIDDEN = EVENT_PLUGIN_PANEL_HIDDEN;
});
