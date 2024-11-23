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

// Adapted from https://github.com/lkcampbell/brackets-indent-guides by Lance Campbell.

/*jslint vars: true, plusplus: true, devel: true, regexp: true, nomen: true, indent: 4, maxerr: 50 */

define(function (require, exports, module) {

    const PreferencesManager  = require("preferences/PreferencesManager"),
        Menus               = require("command/Menus"),
        Editor              = require("editor/Editor").Editor,
        EditorManager       = require("editor/EditorManager"),
        AppInit             = require("utils/AppInit"),
        Commands            = require("command/Commands"),
        CommandManager      = require("command/CommandManager"),
        MainViewManager     = require("view/MainViewManager"),
        Strings             = require("strings");

    const COMMAND_NAME    = Strings.CMD_TOGGLE_INDENT_GUIDES,
        COMMAND_ID      = Commands.TOGGLE_INDENT_GUIDES,
        GUIDE_CLASS     = "phcode-indent-guides",
        GUIDE_CLASS_NONE     = "phcode-indent-guides-none";

    const PREFERENCES_EDITOR_INDENT_GUIDES = "editor.indentGuides",
        PREFERENCES_EDITOR_INDENT_HIDE_FIRST = "editor.indentHideFirst";

    // Define extension preferences
    let enabled     = true,
        hideFirst   = false;

    PreferencesManager.definePreference(PREFERENCES_EDITOR_INDENT_GUIDES, "boolean", enabled, {
        description: Strings.DESCRIPTION_INDENT_GUIDES_ENABLED
    });

    PreferencesManager.definePreference(PREFERENCES_EDITOR_INDENT_HIDE_FIRST, "boolean", hideFirst, {
        description: Strings.DESCRIPTION_HIDE_FIRST
    });

    // CodeMirror overlay code
    function _createOverlayObject(spaceUnits) {
        return {
            _spaceUnits: spaceUnits,
            _cmRefreshPending: false,
            token: function (stream, _state) {
                let char        = "",
                    colNum      = 0,
                    isTabStart  = false;

                char    = stream.next();
                colNum  = stream.column();

                // Check for "hide first guide" preference
                if ((hideFirst) && (colNum === 0)) {
                    return null;
                }

                if (char === "\t") {
                    return enabled? GUIDE_CLASS : GUIDE_CLASS_NONE;
                }

                if (char !== " ") {
                    stream.skipToEnd();
                    return null;
                }

                isTabStart = (colNum % this._spaceUnits) === 0 ? true : false;

                if ((char === " ") && (isTabStart)) {
                    return enabled? GUIDE_CLASS : GUIDE_CLASS_NONE;
                }
                return null;
            },
            flattenSpans: false
        };
    }

    function applyPreferences() {
        enabled     = PreferencesManager.get(PREFERENCES_EDITOR_INDENT_GUIDES);
        hideFirst   = PreferencesManager.get(PREFERENCES_EDITOR_INDENT_HIDE_FIRST);
    }

    function updateUI() {
        const editor  = EditorManager.getActiveEditor();
        if(!editor || !editor._codeMirror) {
            return;
        }
        const cm = editor._codeMirror;
        if(!editor.__indentGuidesOverlay) {
            editor.__indentGuidesOverlay = _createOverlayObject(Editor.getSpaceUnits(editor.document.file.fullPath));
        }
        function _reRenderOverlay() {
            cm.removeOverlay(editor.__indentGuidesOverlay);
            cm.addOverlay(editor.__indentGuidesOverlay);
        }
        editor.off(Editor.EVENT_OPTION_CHANGE+".indentGuide");
        editor.on(Editor.EVENT_OPTION_CHANGE+".indentGuide", ()=>{
            const newSpaceUnits = Editor.getSpaceUnits(editor.document.file.fullPath);
            if(newSpaceUnits !== editor.__indentGuidesOverlay._spaceUnits){
                editor.__indentGuidesOverlay._spaceUnits = newSpaceUnits;
                if(EditorManager.getActiveEditor() === editor){
                    console.log("space units changed, refreshing indent guides for",
                        newSpaceUnits, editor.document.file.fullPath);
                    _reRenderOverlay();
                }
            }
        });

        let shouldRerender = false;
        if(!cm.__indentGuidesOverlayAttached){
            cm.addOverlay(editor.__indentGuidesOverlay);
            cm.__indentGuidesOverlayAttached = editor.__indentGuidesOverlay;
            cm.__overlayEnabled = enabled;
        } else if(cm.__indentGuidesOverlayAttached &&
            cm.__indentGuidesOverlayAttached !== editor.__indentGuidesOverlay) {
            cm.removeOverlay(cm.__indentGuidesOverlayAttached);
            cm.addOverlay(editor.__indentGuidesOverlay);
            cm.__overlayEnabled = enabled;
        } else if (shouldRerender || cm.__overlayEnabled !== enabled) {
            cm.__overlayEnabled = enabled;
            _reRenderOverlay();
            console.log("Refreshing indent guides");
        }
    }

    function handleToggleGuides() {
        enabled = !enabled;
        PreferencesManager.set(PREFERENCES_EDITOR_INDENT_GUIDES, enabled);
    }

    function preferenceChanged() {
        applyPreferences();
        updateUI();
        CommandManager.get(COMMAND_ID)
            .setChecked(enabled);
    }

    // Initialize extension
    AppInit.appReady(function () {
        // Register command and add to menu
        CommandManager.register(COMMAND_NAME, COMMAND_ID, handleToggleGuides);
        Menus.getMenu(Menus.AppMenuBar.VIEW_MENU)
            .addMenuItem(COMMAND_ID, "", Menus.AFTER, Commands.TOGGLE_RULERS);

        // Set up event listeners
        PreferencesManager.on("change", PREFERENCES_EDITOR_INDENT_GUIDES, preferenceChanged);
        PreferencesManager.on("change", PREFERENCES_EDITOR_INDENT_HIDE_FIRST, preferenceChanged);

        MainViewManager.on("currentFileChange", updateUI);
        EditorManager.on("activeEditorChange", updateUI);

        // Apply preferences and draw indent guides
        preferenceChanged();
    });
});