/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 * Original work Copyright (c) 2012 - 2021 Adobe Systems Incorporated. All rights reserved.
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

/*
 * This file houses all the preferences used across Phoenix.
 *
 * To use:
 * ```
 * const AllPreferences = brackets.getModule("preferences/AllPreferences");
 * function preferenceChanged() {
       enabled = PreferencesManager.get(AllPreferences.EMMET);
   }
 * PreferencesManager.on("change", AllPreferences.EMMET, preferenceChanged);
   preferenceChanged();
 * ```
 * NB: JSDOC/Comments marked with * are required for adding the option to Menu
 */

define(function (require, exports, module) {
    const PreferencesManager = require("preferences/PreferencesManager");
    const Strings = require("strings");
    const Menus = require("command/Menus");
    const AppInit = require("utils/AppInit");
    const CommandManager = require("command/CommandManager");
    const Commands = require("command/Commands");

    // * list of all the commands
    const EMMET_COMMAND_ID = "edit.emmet";
    const emmetCommand = CommandManager.register(Strings.CMD_TOGGLE_EMMET, EMMET_COMMAND_ID, toggleEmmet);


    // list of all the preferences
    const PREFERENCES_LIST = {
        EMMET: "emmet"
    };


    // define Emmet in preferences file
    PreferencesManager.definePreference(PREFERENCES_LIST.EMMET, "boolean", true, {
        description: Strings.DESCRIPTION_EMMET
    });


    // * emmet helper function to toggle emmet preferences
    function toggleEmmet() {
        PreferencesManager.set(PREFERENCES_LIST.EMMET, !PreferencesManager.get(PREFERENCES_LIST.EMMET));
        emmetCommand.setChecked(PreferencesManager.get(PREFERENCES_LIST.EMMET));
    }


    AppInit.appReady(function () {
        // * Register the command and add it to Menu bar
        emmetCommand.setChecked(PreferencesManager.get(PREFERENCES_LIST.EMMET));
        var menu = Menus.getMenu(Menus.AppMenuBar.EDIT_MENU);

        menu.addMenuItem(EMMET_COMMAND_ID);
    });

    module.exports = PREFERENCES_LIST;
});
