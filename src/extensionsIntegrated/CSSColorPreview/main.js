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
        COLOR_MARK_NAME = "colorMarker",
        COLOR_PREVIEW_GUTTER_PRIORITY = 200,
        COLOR_LANGUAGES= ["css", "scss", "less", "sass", "stylus", "html", "svg", "jsx", "tsx",
            "php", "ejs", "erb_html", "pug"];

    const SVG_REGEX = /(:[^;]*;?|(?:fill|stroke|stop-color|flood-color|lighting-color|background-color|border-color|from|to)\s*=\s*(['"]?)[^'";]*\2)/g,
        CSS_REGEX = /:[^;]*;?/g; // the last semi colon is optional.


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
        if (editor && editor.isGutterActive(GUTTER_NAME)) {
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
     * @param {Editor} editor
     * @param {Array.<object>} _results An array of objects which stores
     *   all the line numbers and the colors to be displayed on that line.
     * @param {Boolean} update marks whether this function is called when some lines
     *  are updated or when the whole file is re-updated. Defaults to false.
     */
    function showGutters(editor, _results, update = false) {
        if (editor && enabled) {
            editor.operation(()=>{
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
                        let lineHandle;
                        let $marker;
                        if (obj.colorValues.length === 1) {
                            // Single color preview
                            $marker = $("<i>")
                                .addClass(SINGLE_COLOR_PREVIEW_CLASS)
                                .css('background-color', obj.colorValues[0].color);
                            lineHandle = editor.setGutterMarker(obj.lineNumber, GUTTER_NAME, $marker[0]);

                            $marker.click((event)=>{
                                event.preventDefault();
                                event.stopPropagation();
                                _colorIconClicked(editor, lineHandle.lineNo(), obj.colorValues[0].color);
                            });
                        } else {
                            // Multiple colors preview
                            $marker = $("<div>").addClass(MULTI_COLOR_PREVIEW_CLASS);
                            lineHandle = editor.setGutterMarker(obj.lineNumber, GUTTER_NAME, $marker[0]);

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
                                            'background-color': color.color,
                                            ...positions[index]
                                        });
                                    $colorBox.click((event)=>{
                                        event.preventDefault();
                                        event.stopPropagation();
                                        _colorIconClicked(editor, lineHandle.lineNo(), color.color);
                                    });
                                    $marker.append($colorBox);
                                }
                            });
                        }
                        $marker.mouseenter(event=>{
                            event.preventDefault();
                            event.stopPropagation();
                            _applyInlineColor(editor, lineHandle.lineNo());
                        });
                        $marker.mouseleave(event=>{
                            event.preventDefault();
                            event.stopPropagation();
                            editor.clearAllMarks(COLOR_MARK_NAME);
                        });
                    });
                }
            });
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
        if(editor._currentlyColorMarkedLine){
            editor.clearAllMarks(COLOR_MARK_NAME);
            editor._currentlyColorMarkedLine = null;
        }
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
            activeEditor.off("cursorActivity.colorPreview");
            activeEditor.on("cursorActivity.colorPreview", _cursorActivity);
            showColorMarks();
            _cursorActivity(null, activeEditor);
        }
    }

    function _colorMark(editor, from, to, color) {
        editor.markText(COLOR_MARK_NAME, from, to, {
            css: `
      --bg-color-mark: ${color};
      background: var(--bg-color-mark);
      color: lch(from var(--bg-color-mark) calc((50 - l) * infinity) 0 0);
    `
        });
    }

    function _applyInlineColor(editor, line) {
        editor._currentlyColorMarkedLine = line;
        editor.clearAllMarks(COLOR_MARK_NAME);
        const colors = detectValidColorsInLine(editor, line);
        for(let color of colors){
            _colorMark(editor, {line, ch: color.index}, {line, ch: color.index + color.color.length},
                color.color);
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

    const STYLE_PARSE_LANGUAGES = {
        php: true,
        jsx: true,
        tsx: true
    };
    function _isInStyleAttr(editor, token) {
        while(token.type === "string") {
            const currentToken = token;
            token = editor.getPreviousToken({line: token.line, ch: token.start}, true);
            if(currentToken.line === token.line &&
                currentToken.start === token.start && currentToken.end === token.end) {
                // reached start of file
                break;
            }
        }
        return token.type === "attribute" && token.string === "style";
    }

    function _shouldProcessToken(editor, token, pos) {
        const languageID = editor.document.getLanguage().getId();
        if(languageID === "html") {
            return editor.getLanguageForPosition(pos).getId() === "css";
        } else if (STYLE_PARSE_LANGUAGES[languageID]) {
            // unfortunately the codemirror mode doesn't support css detection in attributes in php files right now
            return token.type !== "comment" && _isInStyleAttr(editor, token);
        }
        return token.type !== "comment";
    }

    function isAlphanumeric(char) {
        return /^[a-z0-9-@$]$/i.test(char);
    }
    function _isColor(segment, colorInSegment, colorIndex) {
        const previousChar = colorIndex === 0 ? "" :  segment.charAt(colorIndex-1);
        const endIndex = colorIndex + colorInSegment.length;
        const nextChar = endIndex === segment.length ? "" :  segment.charAt(endIndex);
        return !isAlphanumeric(previousChar) && !isAlphanumeric(nextChar);
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
        const languageID = editor.document.getLanguage().getId();

        // to make sure that code doesn't break when lineText is null.
        if (!lineText || lineText.length > 1000) { // too long lines we cant scan, maybe minified?
            return [];
        }

        const valueRegex = languageID === "svg" ? SVG_REGEX: CSS_REGEX;
        const validColors = [];

        // Find all property value sections in the line
        const lineMatches = [...lineText.matchAll(valueRegex)];

        for (const lineMatch of lineMatches) {
            // Find colors within each property value
            const colorMatches = [...lineMatch[0].matchAll(COLOR_REGEX)];

            colorMatches.forEach(colorMatch => {
                const colorIndex = lineMatch.index + colorMatch.index;
                // this will also allow color name like vars eg: --red-main or @heading-green. we need to omit those
                if(!_isColor(lineMatch[0], colorMatch[0], colorMatch.index)) {
                    return;
                }

                // Check if the color is within a comment
                const token = editor.getToken({ line: lineNumber, ch: colorIndex }, true);

                // If the token is not a comment, add the color
                if (_shouldProcessToken(editor, token, { line: lineNumber, ch: colorIndex })) {
                    validColors.push({
                        color: colorMatch[0],
                        index: colorIndex
                    });
                }
            });
        }

        // Return up to 4 colors
        return validColors;
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
     * @param _evt unused event detail
     * @param {Editor} instance the editor instance
     * @param {Object} changeList an object that has properties regarding the line changed and type of change
     */
    function onChanged(_evt, instance, changeList) {
        // for insertion and deletion, update the changed lines
        if(!changeList || !changeList.length) {
            return;
        }
        const changeObj = changeList[0];
        if(changeList.length === 1 && changeObj.origin === '+input' || changeObj.origin === '+delete') {
            // we only do the diff updates on single key type input/delete and not bulk changes
            // somehow the performance degrades if we do the diff logic on large blocks.
            if(changeObj.from.line && changeObj.to.line && changeObj.from.line <= changeObj.to.line) {
                let toLine = changeObj.to.line;
                if(changeObj.text && changeObj.text.length) {
                    toLine = changeObj.from.line + changeObj.text.length;
                }
                const aColors = updateColorMarks(instance, changeObj.from.line, Math.max(changeObj.to.line, toLine));
                showGutters(instance, aColors, true);
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

