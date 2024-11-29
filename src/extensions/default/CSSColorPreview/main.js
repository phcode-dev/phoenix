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


/* Displays a color preview in the gutter for any file containing color values */

define(function (require, exports, module) {

    // Brackets modules.
    var _ = brackets.getModule("thirdparty/lodash"),
        EditorManager = brackets.getModule('editor/EditorManager'),
        ExtensionUtils = brackets.getModule("utils/ExtensionUtils"),
        ColorUtils = brackets.getModule('utils/ColorUtils'),
        AppInit = brackets.getModule("utils/AppInit"),
        PreferencesManager = brackets.getModule("preferences/PreferencesManager"),
        Strings = brackets.getModule("strings"),

        // Extension variables.
        COLOR_REGEX = ColorUtils.COLOR_REGEX,    // used to match color
        gutterName = "CodeMirror-colorGutter";

    ExtensionUtils.loadStyleSheet(module, "main.css");

    const PREFERENCES_CSS_COLOR_PREVIEW = "CSSColorPreview";
    let enabled = true;

    PreferencesManager.definePreference(PREFERENCES_CSS_COLOR_PREVIEW, "boolean", enabled, {
        description: Strings.DESCRIPTION_CSS_COLOR_PREVIEW
    });

    var CssColorPreview = {

        // Get editor
        getEditor: function () {
            return EditorManager.getActiveEditor();
        },

        // show color preview
        showColorMarks: function () {
            // Check if the extension is enabled
            if (!enabled) {
                CssColorPreview.removeColorMarks();
                return;
            }

            var editor = CssColorPreview.getEditor();
            if (editor) {

                var cm = editor._codeMirror;
                var nLen = cm.lineCount();
                var aColors = [];

                // match colors and push into an array
                for (var i = 0; i < nLen; i++) {
                    var lineText = cm.getLine(i);

                    if ((lineText.indexOf('/*') !== -1) || (lineText.indexOf('*/') !== -1)) {
                        continue;
                    } else {
                        var regx = /:.*?;/g;
                        lineText = lineText.match(regx);
                        if (lineText) {
                            var tempColors = lineText[0].match(COLOR_REGEX);
                            // Support up to 4 colors
                            if (tempColors && tempColors.length > 0) {
                                var colors = tempColors.slice(0, 4);
                                aColors.push({
                                    lineNumber: i,
                                    colorValues: colors
                                });
                            }
                        }
                    }
                }

                CssColorPreview.showGutters(editor, aColors);
            }
        },

        onChanged: function () {
            CssColorPreview.showColorMarks();
        },

        init: function () {
            CssColorPreview.showColorMarks();
            CssColorPreview.registerHandlers();
        },

        registerHandlers: function () {
            // Remove previous listeners to avoid multiple binding issue
            EditorManager.off("activeEditorChange", CssColorPreview.onChanged);

            // Add listener for all editor changes
            EditorManager.on("activeEditorChange", function (event, newEditor, oldEditor) {
                if (newEditor) {
                    // Unbind the previous editor's change event if it exists
                    if (oldEditor) {
                        var oldCM = oldEditor._codeMirror;
                        if (oldCM) {
                            oldCM.off("change", CssColorPreview.onChanged);
                        }
                    }

                    // Bind change event to the new editor
                    var cm = newEditor._codeMirror;
                    if (cm) {
                        cm.on("change", CssColorPreview.onChanged);
                    }

                    CssColorPreview.showColorMarks();
                }
            });
        },

        initGutter: function (editor) {

            var cm = editor._codeMirror;
            var gutters = cm.getOption("gutters").slice(0);
            var str = gutters.join('');
            if (str.indexOf(gutterName) === -1) {
                gutters.unshift(gutterName);
                cm.setOption("gutters", gutters);
            }
        },

        showGutters: function (editor, _results) {
            if (editor && enabled) {
                CssColorPreview.initGutter(editor);
                var cm = editor._codeMirror;
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
        },

        // Method to remove colors when disabled
        removeColorMarks: function () {
            var editor = CssColorPreview.getEditor();
            if (editor) {
                var cm = editor._codeMirror;
                cm.clearGutter(gutterName);
            }
        }
    };

    function preferenceChanged() {
        let value = PreferencesManager.get(PREFERENCES_CSS_COLOR_PREVIEW);
        enabled = value;
        if (!value) {
            CssColorPreview.removeColorMarks();
        } else {
            CssColorPreview.showColorMarks();
        }
    }

    // init after appReady
    AppInit.appReady(function () {
        PreferencesManager.on("change", PREFERENCES_CSS_COLOR_PREVIEW, preferenceChanged);
        setTimeout(CssColorPreview.init, 1000);
    });

});

