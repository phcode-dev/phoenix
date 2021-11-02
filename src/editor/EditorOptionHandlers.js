/*
 * GNU AGPL-3.0 License
 *
 * Modified Work Copyright (c) 2021 - present core.ai . All rights reserved.
 * Original work Copyright (c) 2013 - 2021 Adobe Systems Incorporated. All rights reserved.
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

define(function (require, exports, module) {


    var AppInit             = require("utils/AppInit"),
        Editor              = require("editor/Editor").Editor,
        Commands            = require("command/Commands"),
        CommandManager      = require("command/CommandManager"),
        PreferencesManager  = require("preferences/PreferencesManager"),
        Strings             = require("strings"),
        _                   = require("thirdparty/lodash");

    // Constants for the preferences referred to in this file
    var SHOW_LINE_NUMBERS = "showLineNumbers",
        STYLE_ACTIVE_LINE = "styleActiveLine",
        WORD_WRAP         = "wordWrap",
        CLOSE_BRACKETS    = "closeBrackets",
        AUTO_HIDE_SEARCH  = "autoHideSearch";


    /**
     * @private
     *
     * Maps from preference names to the command names needed to update the checked status.
     */
    var _optionMapping = {};
    _optionMapping[SHOW_LINE_NUMBERS] = Commands.TOGGLE_LINE_NUMBERS;
    _optionMapping[STYLE_ACTIVE_LINE] = Commands.TOGGLE_ACTIVE_LINE;
    _optionMapping[WORD_WRAP] = Commands.TOGGLE_WORD_WRAP;
    _optionMapping[CLOSE_BRACKETS] = Commands.TOGGLE_CLOSE_BRACKETS;
    _optionMapping[AUTO_HIDE_SEARCH] = Commands.TOGGLE_SEARCH_AUTOHIDE;



    /**
     * @private
     *
     * Updates the command checked status based on the preference name given.
     *
     * @param {string} name Name of preference that has changed
     */
    function _updateCheckedState(name) {
        var mapping = _optionMapping[name];
        if (!mapping) {
            return;
        }
        CommandManager.get(mapping).setChecked(PreferencesManager.get(name));
    }

    // Listen to preference changes for the preferences we care about
    Object.keys(_optionMapping).forEach(function (preference) {
        PreferencesManager.on("change", preference, function () {
            _updateCheckedState(preference);
        });
    });

    /**
     * @private
     * Creates a function that will toggle the named preference.
     *
     * @param {string} prefName Name of preference that should be toggled by the function
     */
    function _getToggler(prefName) {
        return function () {
            PreferencesManager.set(prefName, !PreferencesManager.get(prefName));
        };
    }

    function _init() {
        _.each(_optionMapping, function (commandName, prefName) {
            CommandManager.get(commandName).setChecked(PreferencesManager.get(prefName));
        });

        if (!Editor.getShowLineNumbers()) {
            Editor._toggleLinePadding(true);
        }
    }

    CommandManager.register(Strings.CMD_TOGGLE_LINE_NUMBERS, Commands.TOGGLE_LINE_NUMBERS, _getToggler(SHOW_LINE_NUMBERS));
    CommandManager.register(Strings.CMD_TOGGLE_ACTIVE_LINE, Commands.TOGGLE_ACTIVE_LINE, _getToggler(STYLE_ACTIVE_LINE));
    CommandManager.register(Strings.CMD_TOGGLE_WORD_WRAP, Commands.TOGGLE_WORD_WRAP, _getToggler(WORD_WRAP));
    CommandManager.register(Strings.CMD_TOGGLE_CLOSE_BRACKETS, Commands.TOGGLE_CLOSE_BRACKETS, _getToggler(CLOSE_BRACKETS));
    CommandManager.register(Strings.CMD_TOGGLE_SEARCH_AUTOHIDE, Commands.TOGGLE_SEARCH_AUTOHIDE, _getToggler(AUTO_HIDE_SEARCH));

    AppInit.htmlReady(_init);
});
