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



define(function (require, exports, module) {

    // Brackets modules.
    const _ = require("thirdparty/lodash"),
        EditorManager = require('editor/EditorManager'),
        ColorUtils = require('utils/ColorUtils'),
        AppInit = require("utils/AppInit"),
        Editor = require("editor/Editor").Editor,
        PreferencesManager = require("preferences/PreferencesManager"),
        MainViewManager = require("view/MainViewManager"),
        Commands = require("command/Commands"),
        CommandManager = require("command/CommandManager"),
        Strings = require("strings");

    // Extension variables.
    const COLOR_REGEX = ColorUtils.COLOR_REGEX,    // used to match color
        COLOR_LANGUAGES = ["css", "scss", "less", "sass", "stylus", "html", "svg", "jsx", "tsx",
            "php", "ejs", "erb_html", "pug"];

    const SVG_REGEX = /(:[^;]*;?|(?:fill|stroke|stop-color|flood-color|lighting-color|background-color|border-color|from|to)\s*=\s*(['"]?)[^'";]*\2)/g,
        CSS_REGEX = /:[^;]*;?/g; // the last semi colon is optional.


    function _isAlphanumeric(char) {
        return /^[a-z0-9-@$]$/i.test(char);
    }

    function _isColor(segment, colorInSegment, colorIndex) {
        const previousChar = colorIndex === 0 ? "" : segment.charAt(colorIndex - 1);
        const endIndex = colorIndex + colorInSegment.length;
        const nextChar = endIndex === segment.length ? "" : segment.charAt(endIndex);
        return !_isAlphanumeric(previousChar) && !_isAlphanumeric(nextChar);
    }

    /**
     * Detects all valid colors in the entire file.
     *
     * @param {Editor} editor - The editor instance
     * @return {Set<string>} A set of unique valid color values in the file
     */
    function _getAllColors(editor) {
        const nLen = editor.lineCount();

        // store the colors that are used in the file
        const allColors = new Set();

        // Loop through all lines in the file
        for (let i = 0; i < nLen; i++) {
            const lineText = editor.getLine(i);
            const languageID = editor.document.getLanguage().getId();

            // Skip null or excessively long lines
            if (!lineText || lineText.length > 1000) {
                continue;
            }

            const valueRegex = languageID === "svg" ? SVG_REGEX : CSS_REGEX;

            // Find all color matches in the line
            const colorMatches = [...lineText.matchAll(valueRegex)].flatMap(match =>
                [...match[0].matchAll(COLOR_REGEX)].map(colorMatch => colorMatch[0])
            );

            // Add only valid colors to the set
            colorMatches.forEach(color => {
                if (_isColor(lineText, color)) {
                    allColors.add(color);
                }
            });
        }

        return allColors;
    }


    /**
     * Function that gets triggered when any change occurs on the editor
     *
     * @param {Editor} editor the editor instance
     */
    function onChanged(_evt, editor) {
        console.log('------------------------------');
        console.log('------------------------------');
        console.log(editor);
        console.log('------------------------------');
        console.log('------------------------------');

        const allColors = _getAllColors(editor);

        console.log('------------------------------');
        console.log('------------------------------');
        console.log(allColors);
        console.log('------------------------------');
        console.log('------------------------------');
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
                    oldEditor.off("change", onChanged);
                }
                newEditor.off("change", onChanged);
                newEditor.on("change", onChanged);
            }
        });

        // Handle the currently active editor at initialization
        const activeEditor = EditorManager.getActiveEditor();
        if (activeEditor) {
            activeEditor.off("change", onChanged);
            activeEditor.on("change", onChanged);
        }
    }

    // init after appReady
    AppInit.appReady(function () {
        registerHandlers();
    });
});

