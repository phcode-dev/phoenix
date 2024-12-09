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
        DUMMY_GUTTER_CLASS   = "CodeMirror-colorGutter-none",
        SINGLE_COLOR_PREVIEW_CLASS   = "ico-cssColorPreview",
        MULTI_COLOR_PREVIEW_CLASS   = "ico-multiple-cssColorPreview",
        COLOR_PREVIEW_GUTTER_PRIORITY = 200,
        COLOR_LANGUAGES= ["css", "scss", "less", "sass", "stylus", "html", "svg", "jsx", "tsx",
            "php", "ejs", "erb_html", "pug"];


    // For preferences settings, to toggle this feature on/off
    const PREFERENCES_CSS_COLOR_PREVIEW = "colorPreview";
    let enabled = true; // by default:- on

    PreferencesManager.definePreference(PREFERENCES_CSS_COLOR_PREVIEW, "boolean", enabled, {
        description: Strings.DESCRIPTION_CSS_COLOR_PREVIEW
    });


    /**
     * Gets all the colors that are to be displayed
     *
     * Makes sure that the feature is enabled and editor is active, if yes:
     * Calls showGutter function to display the color marks on the gutter
     */
    function showColorMarks() {
        if (!enabled) {
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
     *
     * @param {activeEditor} editor
     * @param {Array.<object>} _results An array of objects which stores
     *   all the line numbers and the colors to be displayed on that line.
     * @param {Boolean} update marks whether this function is called when some lines
     *  are updated or when the whole file is re-updated. Defaults to false.
     */
    function showGutters(editor, _results, update = false) {
        if (editor && enabled) {
            // if the file is updated we don't need to clear the gutter
            // as it will clear all the existing markers.
            if(!update) {
                editor.clearGutter(GUTTER_NAME); // clear color markers
            }
            _addDummyGutterMarkerIfNotExist(editor, editor.getCursorPos().line);

            // Only add markers if enabled
            if (enabled) {
                const colorGutters = _.sortBy(_results, "lineNumber");

                colorGutters.forEach(function (obj) {
                    let $marker;
                    if (obj.colorValues.length === 1) {
                        // Single color preview
                        $marker = $("<i>")
                            .addClass(SINGLE_COLOR_PREVIEW_CLASS)
                            .css('background-color', obj.colorValues[0]);

                        editor.setGutterMarker(obj.lineNumber, GUTTER_NAME, $marker[0]);
                        $marker.click((event)=>{
                            event.preventDefault();
                            event.stopPropagation();
                            _colorIconClicked(editor, obj.lineNumber, obj.colorValues[0]);
                        });
                    } else {
                        // Multiple colors preview
                        $marker = $("<div>").addClass(MULTI_COLOR_PREVIEW_CLASS);

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

    function _addDummyGutterMarkerIfNotExist(editor, line) {
        let marker = editor.getGutterMarker(line, GUTTER_NAME);
        if(!marker){
            let $marker = $('<div>')
                .addClass(DUMMY_GUTTER_CLASS);
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
            if (newEditor && newEditor.isGutterActive(GUTTER_NAME)) {
                newEditor.off("cursorActivity.colorPreview");
                newEditor.on("cursorActivity.colorPreview", _cursorActivity);
                // Unbind the previous editor's change event if it exists
                if (oldEditor) {
                    oldEditor.off("change", onChanged);
                }
                newEditor.off("change", onChanged);
                newEditor.on("change", onChanged);
                showColorMarks();
                _cursorActivity(null, newEditor);
            }
        });

        // Handle the currently active editor at initialization
        const activeEditor = EditorManager.getActiveEditor();
        if (activeEditor) {
            activeEditor.off("change", onChanged);
            activeEditor.on("change", onChanged);
            showColorMarks();
            _cursorActivity(null, activeEditor);
        }
    }

    /**
     * Checks for preference changes, to enable/disable the feature
     */
    function preferenceChanged() {
        const value = PreferencesManager.get(PREFERENCES_CSS_COLOR_PREVIEW);
        enabled = value;
        if (!value) {
            Editor.unregisterGutter(GUTTER_NAME);
        } else {
            Editor.registerGutter(GUTTER_NAME, COLOR_PREVIEW_GUTTER_PRIORITY, COLOR_LANGUAGES);
            // to dynamically add color to all active editors
            addColorMarksToAllEditors();
        }
    }

    /**
     * Detects valid colors in a given line of text
     *
     * @param {Editor} editor - The editor instance
     * @param {number} lineNumber - The line number to check
     * @return {Array<{color: string, index: number}>} An array of valid color values with their indices
     */
    function detectValidColorsInLine(editor, lineNumber) {
        const lineText = editor.getLine(lineNumber);

        // to make sure that code doesn't break when lineText is null.
        if (!lineText) {
            return [];
        }

        const valueRegex = /:[^;]*;/g;
        const validColors = [];

        // Find all property value sections in the line
        const lineMatches = [...lineText.matchAll(valueRegex)];

        for (const lineMatch of lineMatches) {
            // Find colors within each property value
            const colorMatches = [...lineMatch[0].matchAll(COLOR_REGEX)];

            colorMatches.forEach(colorMatch => {
                const colorIndex = lineMatch.index + colorMatch.index;

                // Check if the color is within a comment
                const token = editor.getToken({ line: lineNumber, ch: colorIndex }, true);

                // If the token is not a comment, add the color
                if (token.type !== "comment") {
                    validColors.push({
                        color: colorMatch[0],
                        index: colorIndex
                    });
                }
            });
        }

        // Return up to 4 colors
        return validColors.slice(0, 4).map(item => item.color);
    }

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

        // Match colors and push into an array
        for (let i = 0; i < nLen; i++) {
            const colors = detectValidColorsInLine(editor, i);

            // If valid colors found, add to the results
            if (colors.length > 0) {
                aColors.push({
                    lineNumber: i,
                    colorValues: colors
                });
            }
        }

        return aColors;
    }


    /**
     * Responsible to update the color marks only on the modified lines
     *
     * @param {Editor} editor the editor instance
     * @param {Number} fromLineNumber modification start from line number
     * @param {Number} toLineNumber modification upto line number
     * @return {Array.<Object>} an array of objects with all the line nos and,
     *  the colors to be added on those lines
     */
    function updateColorMarks(editor, fromLineNumber, toLineNumber) {
        const aColors = [];

        // Match colors and push into an array for modified lines
        for (let i = fromLineNumber; i <= toLineNumber; i++) {
            const colors = detectValidColorsInLine(editor, i);

            // If no valid colors, clear the gutter marker
            if (colors.length === 0) {
                editor.setGutterMarker(i, GUTTER_NAME, "");
            } else {
                aColors.push({
                    lineNumber: i,
                    colorValues: colors
                });
            }
        }

        return aColors;
    }


    /**
     * Function that gets triggered when any change occurs on the editor
     *
     * @param {Editor} instance the codemirror instance
     * @param {Object} changeObj an object that has properties regarding the line changed and type of change
     */
    function onChanged(instance, changeObj) {

        const editor = EditorManager.getActiveEditor();

        // for insertion and deletion, update the changed lines
        if(changeObj.origin === '+input' || changeObj.origin === '+delete') {
            // make sure that the required properties exist and in the form they are expected to be
            if(changeObj.from.line && changeObj.to.line && changeObj.from.line <= changeObj.to.line) {
                const aColors = updateColorMarks(editor, changeObj.from.line, changeObj.to.line);
                showGutters(editor, aColors, true);
            } else {
                showColorMarks();
            }

        } else { // for any complex operation like, cut, paste etc, we re-update the whole file
            showColorMarks();
        }

    }

    // init after appReady
    AppInit.appReady(function () {
        PreferencesManager.on("change", PREFERENCES_CSS_COLOR_PREVIEW, preferenceChanged);
        preferenceChanged();
        registerHandlers();
    });
});

