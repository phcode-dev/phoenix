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
        PreferencesManager  = require("preferences/PreferencesManager"),
        MainViewManager     = require("view/MainViewManager"),
        Strings             = require("strings");

    // Extension variables.
    const COLOR_REGEX       = ColorUtils.COLOR_REGEX,    // used to match color
        gutterName          = "CodeMirror-colorGutter";


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

        const cm = editor._codeMirror;
        const nLen = cm.lineCount();
        const aColors = [];

        // match colors and push into an array
        for (let i = 0; i < nLen; i++) {
            let lineText = cm.getLine(i);

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

            const aColors = _getAllColorsAndLineNums(editor);
            showGutters(editor, aColors);

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
                const cm = currEditor._codeMirror;
                cm.clearGutter(gutterName);
            }
        });
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
            cm.clearGutter(gutterName); // clear color markers

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

                        cm.setGutterMarker(obj.lineNumber, gutterName, $marker[0]);
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
                                $marker.append($colorBox);
                            }
                        });

                        cm.setGutterMarker(obj.lineNumber, gutterName, $marker[0]);
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

        const cm = editor._codeMirror;
        const gutters = cm.getOption("gutters").slice(0);
        let str = gutters.join('');
        if (str.indexOf(gutterName) === -1) {
            gutters.unshift(gutterName);
            cm.setOption("gutters", gutters);
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
            if (newEditor) {
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

