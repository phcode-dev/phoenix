/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
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


    const AppInit             = require("utils/AppInit"),
        Editor              = require("editor/Editor").Editor,
        Commands            = require("command/Commands"),
        CommandManager      = require("command/CommandManager"),
        PreferencesManager  = require("preferences/PreferencesManager"),
        Strings             = require("strings"),
        EditorManager       = require("editor/EditorManager"),
        MainViewManager     = require("view/MainViewManager"),
        WorkspaceManager    = require("view/WorkspaceManager"),
        _                   = require("thirdparty/lodash");

    // Constants for the preferences referred to in this file
    const SHOW_LINE_NUMBERS = "showLineNumbers",
        STYLE_ACTIVE_LINE = "styleActiveLine",
        WORD_WRAP         = "wordWrap",
        CLOSE_BRACKETS    = "closeBrackets",
        AUTO_HIDE_SEARCH  = "autoHideSearch";

    const PREFERENCES_EDITOR_RULERS = "editor.rulers",
        PREFERENCES_EDITOR_RULERS_ENABLED = "editor.rulersEnabled";
    PreferencesManager.definePreference(PREFERENCES_EDITOR_RULERS_ENABLED, "boolean", true, {
        description: Strings.DESCRIPTION_RULERS_ENABLED
    });
    PreferencesManager.definePreference(PREFERENCES_EDITOR_RULERS, "array", [100], {
        description: Strings.DESCRIPTION_RULERS_COLUMNS
    });
    /**
     * @private
     *
     * Maps from preference names to the command names needed to update the checked status.
     */
    let _optionMapping = {};
    _optionMapping[SHOW_LINE_NUMBERS] = Commands.TOGGLE_LINE_NUMBERS;
    _optionMapping[STYLE_ACTIVE_LINE] = Commands.TOGGLE_ACTIVE_LINE;
    _optionMapping[WORD_WRAP] = Commands.TOGGLE_WORD_WRAP;
    _optionMapping[CLOSE_BRACKETS] = Commands.TOGGLE_CLOSE_BRACKETS;
    _optionMapping[AUTO_HIDE_SEARCH] = Commands.TOGGLE_SEARCH_AUTOHIDE;
    _optionMapping[PREFERENCES_EDITOR_RULERS_ENABLED] = Commands.TOGGLE_RULERS;



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

    const rulerEvents = {
        "activeEditorChange": true,
        "change": true,
        "workingSetMove": true,
        "paneLayoutChange": true,
        "workspaceUpdateLayout": true
    };

    // rulers code adapted from guidelines extension by
    // "Jake Knerr <jake@yellowhangar.com> (https://github.com/jakeknerr)"
    function _createGuidelines(event) {
        const rulerColumns = PreferencesManager.get(PREFERENCES_EDITOR_RULERS) || [];
        const rulersEnabled = PreferencesManager.get(PREFERENCES_EDITOR_RULERS_ENABLED);
        if( !rulersEnabled || !rulerEvents[event.type] || !rulerColumns.length){
            return;
        }
        // initially I thought I could add the guideline to each pane alone and
        // not editor instances, however this doesn't work because then the
        // guideline does not scroll; must add a guideline to each editor
        // instance

        // loop through each scroller; get the height of each scroller so that
        // the guideline can be sized to at least fill the viewport
        const scrollers = $("div.CodeMirror-scroll");
        scrollers.each(function() {
            const scroller = $(this);
            const minHeight = scroller.height();

            // add the guideline to the sizer; this will also add guidelines to
            // inline editors
            const jSizer = scroller.find("> div.CodeMirror-sizer");

            // reuse guidelines if possible
            let guideline = jSizer.find("> div.guideline");
            if (!guideline || guideline.length < 1) {
                // add the guideline; notice that you must include a <pre> tag
                // because when line numbers are disabled, brackets introduces a
                // style .show-line-padding that will indent <pre> tags based on
                // the theme;
                jSizer.append(
                    '<div class="guideline" tabindex="-1">' +
                    '<pre class></pre>' +
                    '</div>'
                );
                guideline = jSizer.find("> div.guideline");
            }
            // apply the user selected line color and column
            const preTag = guideline.find('> pre');
            preTag.css('-webkit-mask-position', rulerColumns[0] + 'ch 0');

            // set the minimum height to the scroller height
            guideline.css("min-height", minHeight + "px");

        });
    }

    CommandManager.register(Strings.CMD_TOGGLE_LINE_NUMBERS, Commands.TOGGLE_LINE_NUMBERS, _getToggler(SHOW_LINE_NUMBERS));
    CommandManager.register(Strings.CMD_TOGGLE_ACTIVE_LINE, Commands.TOGGLE_ACTIVE_LINE, _getToggler(STYLE_ACTIVE_LINE));
    CommandManager.register(Strings.CMD_TOGGLE_WORD_WRAP, Commands.TOGGLE_WORD_WRAP, _getToggler(WORD_WRAP));
    CommandManager.register(Strings.CMD_TOGGLE_CLOSE_BRACKETS, Commands.TOGGLE_CLOSE_BRACKETS, _getToggler(CLOSE_BRACKETS));
    CommandManager.register(Strings.CMD_TOGGLE_SEARCH_AUTOHIDE, Commands.TOGGLE_SEARCH_AUTOHIDE, _getToggler(AUTO_HIDE_SEARCH));
    CommandManager.register(Strings.CMD_TOGGLE_RULERS, Commands.TOGGLE_RULERS, _getToggler(PREFERENCES_EDITOR_RULERS_ENABLED));

    function _init() {
        _.each(_optionMapping, function (commandName, prefName) {
            CommandManager.get(commandName).setChecked(PreferencesManager.get(prefName));
        });

        if (!Editor.getShowLineNumbers()) {
            Editor._toggleLinePadding(true);
        }

        // fires for inline editor creation;
        EditorManager.on('activeEditorChange', _createGuidelines);
        // theme changes, font changes, folding, line-numbers; should catch settings
        // that change the gutter width
        PreferencesManager.on("change", (event)=>{
            $("div.guideline").remove();
            _createGuidelines(event);
        });

        // fires when panes are created; works even when the pane isn't focused;
        // will not fire for inline editors; will add the guideline when a pane
        // is created but not focused; the primary pane will not dispatch this event
        // when it is created;
        // MainViewManager.on('paneCreate', eventHandler);

        // handles the situation when a file is moved to a new pane but not focused
        MainViewManager.on('workingSetMove', _createGuidelines);

        // catches layout when pane orientation changes; layout event doesn't fire for
        // this oddly
        MainViewManager.on("paneLayoutChange", _createGuidelines);

        // doesn't fire for inline editor, new files, or as the scrollable content
        // changes, orientation changes; surprisingly not that useful; however,
        // will catch resizes that make the guideline extend out of the viewable
        // region and trigger scrolling
        WorkspaceManager.on("workspaceUpdateLayout", _createGuidelines);
    }

    AppInit.htmlReady(_init);
});
