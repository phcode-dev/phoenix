/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 * Original work Copyright (c) 2024 [cmgddd](https://github.com/cmgddd/Brackets-css-color-preview). All rights reserved.
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


/* Displays a color preview in the gutter for any file containing color values */
/* Styles on `styles/brackets.less` file */

define(function (require, exports, module) {

    // Brackets modules.
    const _                 = require("thirdparty/lodash"),
        EditorManager       = require('editor/EditorManager'),
        ColorUtils          = require('utils/ColorUtils'),
        AppInit             = require("utils/AppInit"),
        Editor              = require("editor/Editor").Editor,
        PreferencesManager  = require("preferences/PreferencesManager"),
        MainViewManager     = require("view/MainViewManager"),
        Commands            = require("command/Commands"),
        CommandManager      = require("command/CommandManager"),
        Strings             = require("strings");

    // Extension variables.
    const COLOR_REGEX       = ColorUtils.COLOR_REGEX,    // used to match color
        GUTTER_NAME          = "CodeMirror-colorGutter",
        COLOR_PREVIEW_GUTTER_PRIORITY = 200,
        COLOR_LANGUAGES= ["css", "scss", "less", "sass", "stylus", "html", "svg", "jsx", "tsx",
            "php", "ejs", "erb_html", "pug"];


    // For preferences settings, to toggle this feature on/off
    const PREFERENCES_CSS_COLOR_PREVIEW = "CSSColorPreview";
    let enabled = true; // by default:- on

    PreferencesManager.definePreference(PREFERENCES_CSS_COLOR_PREVIEW, "boolean", enabled, {
        description: Strings.DESCRIPTION_CSS_COLOR_PREVIEW
    });

    /**
     * Responsible to get all the colors and their respective line numbers.
     *
     * @param {Editor} editor
     * @return {Array.<Object>} an array of objects with all the line nos and,
     *  the colors to be added on those lines
     */
    function _getAllColorsAndLineNums(editor) {

        const nLen = editor.lineCount();
        const aColors = [];

        // match colors and push into an array
        for (let i = 0; i < nLen; i++) {
            let lineText = editor.getLine(i);

            if ((lineText.indexOf('/*') !== -1) || (lineText.indexOf('*/') !== -1)) {
                continue;
            } else {
                let regx = /:[^;]*;/g;

                lineText = lineText.match(regx);
                if (lineText) {
                    let tempColors = lineText[0].match(COLOR_REGEX);
                    // Support up to 4 colors
                    if (tempColors && tempColors.length > 0) {
                        let colors = tempColors.slice(0, 4);
                        aColors.push({
                            lineNumber: i,
                            colorValues: colors
                        });
                    }
                }
            }
        }

        return aColors;
    }

    /**
     * Gets all the colors that are to be displayed
     *
     * Makes sure that the feature is enabled and editor is active, if yes:
     * Calls showGutter function to display the color marks on the gutter
     */
    function showColorMarks() {
        if (!enabled) {
            removeColorMarks();
            return;
        }

        const editor = EditorManager.getActiveEditor();
        if (editor) {
            showGutters(editor, _getAllColorsAndLineNums(editor));
        }
    }


    /**
     * To add the color marks on the gutter of all the active editors
     * This function is called when the user toggles the
     * CssColorPreview preference and set it to true
     */
    function addColorMarksToAllEditors() {
        const allActiveEditors = MainViewManager.getAllViewedEditors();

        allActiveEditors.forEach((activeEditor) => {
            const currEditor = activeEditor.editor;
            if(currEditor) {
                const aColors = _getAllColorsAndLineNums(currEditor);
                showGutters(currEditor, aColors);
            }
        });
    }

    /**
     * To remove the color marks from the gutter of all the active editors
     */
    function removeColorMarks() {

        const allActiveEditors = MainViewManager.getAllViewedEditors();

        allActiveEditors.forEach((activeEditor) => {
            const currEditor = activeEditor.editor;
            if(currEditor) {
                currEditor.clearGutter(GUTTER_NAME);
            }
        });
    }


    /**
     * To move the cursor to the color text and display the color quick edit
     * @param {Editor} editor the codemirror instance
     * @param {Number} lineNumber the line number that is clicked
     * @param {string} colorValue the color value clicked
     */
    function _colorIconClicked(editor, lineNumber, colorValue) {
        const lineText = editor.getLine(lineNumber);
        const colorIndex = lineText.indexOf(colorValue);
        const currentPos = editor.getCursorPos(false, "start");
        if(!(currentPos.line === lineNumber && currentPos.ch === colorIndex)) {
            editor.setCursorPos(lineNumber, colorIndex);
            editor.focus();
        }

        // Added a 50ms delay with setTimeout to make sure the quick edit menu toggles correctly.
        // Without it, closing the menu trigger text selection, reopening the menu.
        setTimeout(() => {
            CommandManager.execute(Commands.TOGGLE_QUICK_EDIT);
        }, 50);
    }

    /**
     * To display the color marks on the gutter
     * @param {activeEditor} editor
     * @param {Array.<object>} _results An array of objects which stores
     *   all the line numbers and the colors to be displayed on that line.
     */
    function showGutters(editor, _results) {
        if (editor && enabled) {
            initGutter(editor);
            const cm = editor._codeMirror;
            editor.clearGutter(GUTTER_NAME); // clear color markers
            _addDummyGutterMarkerIfNotExist(editor, editor.getCursorPos().line);

            // Only add markers if enabled
            if (enabled) {
                cm.colorGutters = _.sortBy(_results, "lineNumber");

                cm.colorGutters.forEach(function (obj) {
                    let $marker;
                    if (obj.colorValues.length === 1) {
                        // Single color preview
                        $marker = $("<i>")
                            .addClass("ico-cssColorPreview")
                            .css('background-color', obj.colorValues[0]);

                        editor.setGutterMarker(obj.lineNumber, GUTTER_NAME, $marker[0]);
                        $marker.click((event)=>{
                            event.preventDefault();
                            event.stopPropagation();
                            _colorIconClicked(editor, obj.lineNumber, obj.colorValues[0]);
                        });
                    } else {
                        // Multiple colors preview
                        $marker = $("<div>").addClass("ico-multiple-cssColorPreview");

                        // Positions for up to 4 colors in grid
                        const positions = [
                            { top: 0, left: 0 },
                            { top: 0, right: 0 },
                            { bottom: 0, right: 0 },
                            { bottom: 0, left: 0 }
                        ];

                        obj.colorValues.forEach((color, index) => {
                            if (index < 4) {
                                const $colorBox = $("<div>")
                                    .addClass("color-box")
                                    .css({
                                        'background-color': color,
                                        ...positions[index]
                                    });
                                $colorBox.click((event)=>{
                                    event.preventDefault();
                                    event.stopPropagation();
                                    _colorIconClicked(editor, obj.lineNumber, color);
                                });
                                $marker.append($colorBox);
                            }
                        });

                        editor.setGutterMarker(obj.lineNumber, GUTTER_NAME, $marker[0]);
                    }
                });
            }

        }
    }


    /**
     * Initialize the gutter
     * @param {activeEditor} editor
     */
    function initGutter(editor) {
        if (!Editor.isGutterRegistered(GUTTER_NAME)) {
            // we should restrict the languages here to Editor.registerGutter(..., ["css", "less", "scss", etc..]);
            // TODO we should show the gutter in those languages only if a color is present in that file.
            Editor.registerGutter(GUTTER_NAME, COLOR_PREVIEW_GUTTER_PRIORITY, COLOR_LANGUAGES);
        }
    }

    function _addDummyGutterMarkerIfNotExist(editor, line) {
        let marker = editor.getGutterMarker(line, GUTTER_NAME);
        if(!marker){
            let $marker = $('<div>')
                .addClass(GUTTER_NAME);
            editor.setGutterMarker(line, GUTTER_NAME, $marker[0]);
        }
    }

    function _cursorActivity(_evt, editor){
        // this is to prevent a gutter gap in the active line if there is no color on this line.
        _addDummyGutterMarkerIfNotExist(editor, editor.getCursorPos().line);
    }

    /**
     * Register all the required handlers
     */
    function registerHandlers() {
        // Remove previous listeners to avoid multiple binding issue
        EditorManager.off("activeEditorChange", onChanged);

        // Add listener for all editor changes
        EditorManager.on("activeEditorChange", function (event, newEditor, oldEditor) {
            if (newEditor) {
                // todo: only attach if the color gutter is present as we disable it in certain languages
                newEditor.off("cursorActivity.colorPreview");
                newEditor.on("cursorActivity.colorPreview", _cursorActivity);
                // Unbind the previous editor's change event if it exists
                if (oldEditor) {
                    const oldCM = oldEditor._codeMirror;
                    if (oldCM) {
                        oldCM.off("change", onChanged);
                    }
                }

                // Bind change event to the new editor
                const cm = newEditor._codeMirror;
                if (cm) {
                    cm.on("change", onChanged);
                }

                showColorMarks();
            }
        });

        // Handle the currently active editor at initialization
        const activeEditor = EditorManager.getActiveEditor();
        if (activeEditor) {
            const cm = activeEditor._codeMirror;
            if (cm) {
                cm.on("change", onChanged);
            }
            showColorMarks();
        }

    }

    /**
     * Checks for preference changes, to enable/disable the feature
     */
    function preferenceChanged() {
        const value = PreferencesManager.get(PREFERENCES_CSS_COLOR_PREVIEW);
        enabled = value;
        if (!value) {
            // to dynamically remove color to all active editors
            removeColorMarks();
        } else {
            // to dynamically add color to all active editors
            addColorMarksToAllEditors();
        }
    }

    /**
     * Function that gets triggered when any change occurs on the editor
     */
    function onChanged() {
        showColorMarks();
    }

    /**
     * Driver function, runs at the start of the program
     */
    function init() {
        // preferenceChanged calls 'showColorMarks' or 'removeColorMarks'
        preferenceChanged();
        registerHandlers();
    }

    // init after appReady
    AppInit.appReady(function () {
        PreferencesManager.on("change", PREFERENCES_CSS_COLOR_PREVIEW, preferenceChanged);
        init();
    });
});

