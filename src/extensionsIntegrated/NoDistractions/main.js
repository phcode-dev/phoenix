/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 * Original work Copyright (c) 2015 - 2021 Adobe Systems Incorporated. All rights reserved.
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

/*global Phoenix*/

define(function (require, exports, module) {


    const AppInit                 = require("utils/AppInit"),
        Menus               = require("command/Menus"),
        CommandManager      = require("command/CommandManager"),
        Commands            = require("command/Commands"),
        Strings             = require("strings"),
        PreferencesManager  = require("preferences/PreferencesManager"),
        ViewUtils           = require("utils/ViewUtils"),
        KeyBindingManager   = require("command/KeyBindingManager"),
        Metrics             = require("utils/Metrics"),
        WorkspaceManager    = require("view/WorkspaceManager");

    // Constants
    const PREFS_PURE_CODE           = "noDistractions",
        CMD_TOGGLE_PURE_CODE      = "view.togglePureCode",
        CMD_TOGGLE_FULLSCREEN     = "view.toggleFullscreen",
        CMD_TOGGLE_PANELS         = "view.togglePanels";

    //key binding keys
    const togglePureCodeKey         = "Shift-F11",
        toggleFullScreenKey = "F11",
        toggleFullScreenKeyMac = "Cmd-F11",
        togglePanelsKey           = "Ctrl-Shift-1",
        togglePanelsKeyMac        = "Cmd-Shift-1",
        togglePanelsKey_EN        = "Ctrl-Shift-~",
        togglePanelsKeyMac_EN     = "Cmd-Shift-~";

    //locals
    let _previouslyOpenPanelIDs = [],
        panelsToggled = false,
        layoutUpdated = false;

    /**
     * @private
     * Updates the command checked status based on the preference for noDestraction mode
     */
    function _updateCheckedState() {
        CommandManager.get(CMD_TOGGLE_PURE_CODE).setChecked(PreferencesManager.get(PREFS_PURE_CODE));
        Phoenix.app.isFullscreen().then(isFullScreen =>{
            CommandManager.get(CMD_TOGGLE_FULLSCREEN).setChecked(isFullScreen);
        });
    }

    /**
     * @private
     * toggles noDisraction preference
     */
    function _togglePureCode() {
        PreferencesManager.set(PREFS_PURE_CODE, !PreferencesManager.get(PREFS_PURE_CODE));
        Metrics.countEvent(Metrics.EVENT_TYPE.UI, 'noDistractions', 'toggle');
    }

    async function _toggleFullScreen() {
        Metrics.countEvent(Metrics.EVENT_TYPE.UI, 'fullscreen', 'toggle');
        Phoenix.app.isFullscreen().then(isFullScreen =>{
            Phoenix.app.setFullscreen(!isFullScreen)
                .then(_updateCheckedState);
        });
    }

    /**
     * hide all open panels
     */
    function _hidePanelsIfRequired() {
        var panelIDs = WorkspaceManager.getAllPanelIDs();
        _previouslyOpenPanelIDs = [];
        panelIDs.forEach(function (panelID) {
            var panel = WorkspaceManager.getPanelForID(panelID);
            if (panel && panel.isVisible()) {
                panel.hide();
                _previouslyOpenPanelIDs.push(panelID);
            }
        });
    }

    /**
     * show all open panels that was previously hidden by _hidePanelsIfRequired()
     */
    function _showPanelsIfRequired() {
        var panelIDs = _previouslyOpenPanelIDs;
        panelIDs.forEach(function (panelID) {
            var panel = WorkspaceManager.getPanelForID(panelID);
            if (panel) {
                panel.show();
            }
        });
        _previouslyOpenPanelIDs = [];
    }

    function _updateLayout() {
        layoutUpdated = true;
        panelsToggled = false;
    }

    /**
     * We toggle panels in certain cases only :
     * 1. if a panel is shown, toggle can hide it, and successive toggle can show the panel and repeat.
     * 2. if a panel is hidden by toggle, and say the workspace changed making another panel visible by some operation;
     * we reset toggle states so that toggle would hide the panel already present in the workspace.
     * The already hidden panel should not be shown in the specific case for better UX.
     */
    function _togglePanels() {
        panelsToggled = !panelsToggled;
        if (panelsToggled) {
            _hidePanelsIfRequired();
            layoutUpdated = false;
            panelsToggled = true;
        } else if (!layoutUpdated) {
            _showPanelsIfRequired();
        }

        Metrics.countEvent(Metrics.EVENT_TYPE.UI, 'noDistractions', 'togglePanels');
    }

    PreferencesManager.definePreference(PREFS_PURE_CODE, "boolean", false, {
        description: Strings.DESCRIPTION_PURE_CODING_SURFACE
    });

    WorkspaceManager.on(WorkspaceManager.EVENT_WORKSPACE_PANEL_SHOWN, _updateLayout);

    /**
     * Register the Commands , add the Menu Items and key bindings
     */
    AppInit.appReady(function () {
        CommandManager.register(Strings.CMD_TOGGLE_PURE_CODE, CMD_TOGGLE_PURE_CODE, _togglePureCode);
        CommandManager.register(Strings.CMD_TOGGLE_FULLSCREEN, CMD_TOGGLE_FULLSCREEN, _toggleFullScreen);
        CommandManager.register(Strings.CMD_TOGGLE_PANELS, CMD_TOGGLE_PANELS, _togglePanels);

        Menus.getMenu(Menus.AppMenuBar.VIEW_MENU).addMenuItem(CMD_TOGGLE_PANELS, "", Menus.AFTER, Commands.VIEW_HIDE_SIDEBAR);
        Menus.getMenu(Menus.AppMenuBar.VIEW_MENU).addMenuItem(CMD_TOGGLE_PURE_CODE, togglePureCodeKey, Menus.AFTER, CMD_TOGGLE_PANELS);
        Menus.getMenu(Menus.AppMenuBar.VIEW_MENU).addMenuItem(CMD_TOGGLE_FULLSCREEN, [ {key: toggleFullScreenKey}, {key: toggleFullScreenKeyMac, platform: "mac"} ], Menus.AFTER, CMD_TOGGLE_PURE_CODE);

        //default toggle panel shortcut was ctrl+shift+` as it is present in one vertical line in the keyboard. However, we later learnt
        //from IQE team than non-English keyboards does not have the ` char. So added one more shortcut ctrl+shift+1 which will be preferred
        KeyBindingManager.addBinding(CMD_TOGGLE_PANELS, [ {key: togglePanelsKey}, {key: togglePanelsKeyMac, platform: "mac"} ]);
        KeyBindingManager.addBinding(CMD_TOGGLE_PANELS, [ {key: togglePanelsKey_EN}, {key: togglePanelsKeyMac_EN, platform: "mac"} ]);

        PreferencesManager.on("change", PREFS_PURE_CODE, function () {
            if (PreferencesManager.get(PREFS_PURE_CODE)) {
                ViewUtils.hideMainToolBar();
                CommandManager.execute(Commands.HIDE_SIDEBAR);
                _hidePanelsIfRequired();
            } else {
                ViewUtils.showMainToolBar();
                CommandManager.execute(Commands.SHOW_SIDEBAR);
                _showPanelsIfRequired();
            }
            _updateCheckedState();
        });
    });

});
