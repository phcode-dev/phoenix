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

/**
 * Editor instance helpers for editor preferences. Only to be used from Editor.js.
 */

define(function (require, exports, module) {

    const PreferencesManager = require("preferences/PreferencesManager"),
        Strings              = require("strings"),
        ValidationUtils    = require("utils/ValidationUtils"),
        _                  = require("thirdparty/lodash");

    const CLOSE_BRACKETS      = "closeBrackets",
        CLOSE_TAGS          = "closeTags",
        DRAG_DROP           = "dragDropText",
        HIGHLIGHT_MATCHES   = "highlightMatches",
        LINEWISE_COPY_CUT   = "lineWiseCopyCut",
        SCROLL_PAST_END     = "scrollPastEnd",
        SHOW_CURSOR_SELECT  = "showCursorWhenSelecting",
        SHOW_LINE_NUMBERS   = "showLineNumbers",
        SMART_INDENT        = "smartIndent",
        SOFT_TABS           = "softTabs",
        SPACE_UNITS         = "spaceUnits",
        STYLE_ACTIVE_LINE   = "styleActiveLine",
        TAB_SIZE            = "tabSize",
        AUTO_TAB_SPACES     = "autoTabSpaces",
        UPPERCASE_COLORS    = "uppercaseColors",
        USE_TAB_CHAR        = "useTabChar",
        WORD_WRAP           = "wordWrap",
        AUTO_HIDE_SEARCH    = "autoHideSearch",
        INDENT_LINE_COMMENT   = "indentLineComment",
        INPUT_STYLE         = "inputStyle";

    /**
     * Constants
     * @type {number}
     */
    const MIN_SPACE_UNITS         =  1,
        MIN_TAB_SIZE            =  1,
        DEFAULT_SPACE_UNITS     =  4,
        DEFAULT_TAB_SIZE        =  4,
        AUTO_TAB_SIZE           =  4,
        MAX_SPACE_UNITS         = 10,
        MAX_TAB_SIZE            = 10,
        MAX_AUTO_TAB_UNITS      = 4;

    const LINE_NUMBER_GUTTER = "CodeMirror-linenumbers",
        LINE_NUMBER_GUTTER_PRIORITY     = 100,
        CODE_FOLDING_GUTTER_PRIORITY    = 1000;

    PreferencesManager.definePreference(CLOSE_BRACKETS,     "boolean", true, {
        description: Strings.DESCRIPTION_CLOSE_BRACKETS
    });

    // CodeMirror, html mode, set some tags do not close automatically.
    // We do not initialize "dontCloseTags" because otherwise we would overwrite the default behavior of CodeMirror.
    PreferencesManager.definePreference(CLOSE_TAGS,         "object", { whenOpening: true, whenClosing: true, indentTags: [] }, {
        description: Strings.DESCRIPTION_CLOSE_TAGS,
        keys: {
            dontCloseTags: {
                type: "array",
                description: Strings.DESCRIPTION_CLOSE_TAGS_DONT_CLOSE_TAGS
            },
            whenOpening: {
                type: "boolean",
                description: Strings.DESCRIPTION_CLOSE_TAGS_WHEN_OPENING,
                initial: true
            },
            whenClosing: {
                type: "boolean",
                description: Strings.DESCRIPTION_CLOSE_TAGS_WHEN_CLOSING,
                initial: true
            },
            indentTags: {
                type: "array",
                description: Strings.DESCRIPTION_CLOSE_TAGS_INDENT_TAGS
            }
        }
    });
    PreferencesManager.definePreference(DRAG_DROP,          "boolean", true, {
        description: Strings.DESCRIPTION_DRAG_DROP_TEXT
    });
    PreferencesManager.definePreference(HIGHLIGHT_MATCHES,  "boolean", false, {
        description: Strings.DESCRIPTION_HIGHLIGHT_MATCHES,
        keys: {
            showToken: {
                type: "boolean",
                description: Strings.DESCRIPTION_HIGHLIGHT_MATCHES_SHOW_TOKEN,
                initial: false
            },
            wordsOnly: {
                type: "boolean",
                description: Strings.DESCRIPTION_HIGHLIGHT_MATCHES_WORDS_ONLY,
                initial: false
            }
        }
    });
    PreferencesManager.definePreference(LINEWISE_COPY_CUT,  "boolean", true, {
        description: Strings.DESCRIPTION_LINEWISE_COPY_CUT
    });
    PreferencesManager.definePreference(SCROLL_PAST_END,    "boolean", false, {
        description: Strings.DESCRIPTION_SCROLL_PAST_END
    });
    PreferencesManager.definePreference(SHOW_CURSOR_SELECT, "boolean", false, {
        description: Strings.DESCRIPTION_SHOW_CURSOR_WHEN_SELECTING
    });
    PreferencesManager.definePreference(SHOW_LINE_NUMBERS,  "boolean", true, {
        description: Strings.DESCRIPTION_SHOW_LINE_NUMBERS
    });
    PreferencesManager.definePreference(SMART_INDENT,       "boolean", true, {
        description: Strings.DESCRIPTION_SMART_INDENT
    });
    PreferencesManager.definePreference(SOFT_TABS,          "boolean", true, {
        description: Strings.DESCRIPTION_SOFT_TABS
    });
    PreferencesManager.definePreference(SPACE_UNITS,        "number", DEFAULT_SPACE_UNITS, {
        validator: _.partialRight(ValidationUtils.isIntegerInRange, MIN_SPACE_UNITS, MAX_SPACE_UNITS),
        description: Strings.DESCRIPTION_SPACE_UNITS
    });
    PreferencesManager.definePreference(STYLE_ACTIVE_LINE,  "boolean", true, {
        description: Strings.DESCRIPTION_STYLE_ACTIVE_LINE
    });
    PreferencesManager.definePreference(TAB_SIZE,           "number", DEFAULT_TAB_SIZE, {
        validator: _.partialRight(ValidationUtils.isIntegerInRange, MIN_TAB_SIZE, MAX_TAB_SIZE),
        description: Strings.DESCRIPTION_TAB_SIZE
    });
    PreferencesManager.definePreference(AUTO_TAB_SPACES,    "boolean", true, {
        description: Strings.DESCRIPTION_AUTO_TAB_SPACE
    });
    PreferencesManager.definePreference(UPPERCASE_COLORS,   "boolean", false, {
        description: Strings.DESCRIPTION_UPPERCASE_COLORS
    });
    PreferencesManager.definePreference(USE_TAB_CHAR,       "boolean", false, {
        description: Strings.DESCRIPTION_USE_TAB_CHAR
    });
    PreferencesManager.definePreference(WORD_WRAP,          "boolean", false, {
        description: Strings.DESCRIPTION_WORD_WRAP
    });

    PreferencesManager.definePreference(AUTO_HIDE_SEARCH,   "boolean", false, {
        description: Strings.DESCRIPTION_SEARCH_AUTOHIDE
    });

    PreferencesManager.definePreference(INDENT_LINE_COMMENT,  "boolean", true, {
        description: Strings.DESCRIPTION_INDENT_LINE_COMMENT
    });
    PreferencesManager.definePreference(INPUT_STYLE,  "string", "textarea", {
        description: Strings.DESCRIPTION_INPUT_STYLE
    });

    function isValidTabSize (size) {
        return ValidationUtils.isIntegerInRange(size, MIN_TAB_SIZE, MAX_TAB_SIZE);
    }

    function isValidSpaceUnit (size) {
        return ValidationUtils.isIntegerInRange(size, MIN_SPACE_UNITS, MAX_SPACE_UNITS);
    }

    function init(cmOptions) {
        // Mappings from Brackets preferences to CodeMirror options
        cmOptions[CLOSE_BRACKETS]     = "autoCloseBrackets";
        cmOptions[CLOSE_TAGS]         = "autoCloseTags";
        cmOptions[DRAG_DROP]          = "dragDrop";
        cmOptions[HIGHLIGHT_MATCHES]  = "highlightSelectionMatches";
        cmOptions[LINEWISE_COPY_CUT]  = "lineWiseCopyCut";
        cmOptions[SCROLL_PAST_END]    = "scrollPastEnd";
        cmOptions[SHOW_CURSOR_SELECT] = "showCursorWhenSelecting";
        cmOptions[SHOW_LINE_NUMBERS]  = "lineNumbers";
        cmOptions[SMART_INDENT]       = "smartIndent";
        cmOptions[SPACE_UNITS]        = "indentUnit";
        cmOptions[STYLE_ACTIVE_LINE]  = "styleActiveLine";
        cmOptions[TAB_SIZE]           = "tabSize";
        cmOptions[USE_TAB_CHAR]       = "indentWithTabs";
        cmOptions[WORD_WRAP]          = "lineWrapping";
        cmOptions[INPUT_STYLE]        = "inputStyle";
    }

    exports.CLOSE_BRACKETS      = CLOSE_BRACKETS;
    exports.CLOSE_TAGS          = CLOSE_TAGS;
    exports.DRAG_DROP           = DRAG_DROP;
    exports.HIGHLIGHT_MATCHES   = HIGHLIGHT_MATCHES;
    exports.LINEWISE_COPY_CUT   = LINEWISE_COPY_CUT;
    exports.SCROLL_PAST_END     = SCROLL_PAST_END;
    exports.SHOW_CURSOR_SELECT  = SHOW_CURSOR_SELECT;
    exports.SHOW_LINE_NUMBERS   = SHOW_LINE_NUMBERS;
    exports.SMART_INDENT        = SMART_INDENT;
    exports.SOFT_TABS           = SOFT_TABS;
    exports.SPACE_UNITS         = SPACE_UNITS;
    exports.STYLE_ACTIVE_LINE   = STYLE_ACTIVE_LINE;
    exports.TAB_SIZE            = TAB_SIZE;
    exports.AUTO_TAB_SPACES     = AUTO_TAB_SPACES;
    exports.UPPERCASE_COLORS    = UPPERCASE_COLORS;
    exports.USE_TAB_CHAR        = USE_TAB_CHAR;
    exports.WORD_WRAP           = WORD_WRAP;
    exports.AUTO_HIDE_SEARCH    = AUTO_HIDE_SEARCH;
    exports.INDENT_LINE_COMMENT = INDENT_LINE_COMMENT;
    exports.INPUT_STYLE         = INPUT_STYLE;

    exports.MIN_SPACE_UNITS         =  MIN_SPACE_UNITS;
    exports.MIN_TAB_SIZE            =  MIN_TAB_SIZE;
    exports.DEFAULT_SPACE_UNITS     =  DEFAULT_SPACE_UNITS;
    exports.DEFAULT_TAB_SIZE        =  DEFAULT_TAB_SIZE;
    exports.MAX_SPACE_UNITS         = MAX_SPACE_UNITS;
    exports.MAX_TAB_SIZE            = MAX_TAB_SIZE;
    exports.AUTO_TAB_SIZE           = AUTO_TAB_SIZE;
    exports.MAX_AUTO_TAB_UNITS      = MAX_AUTO_TAB_UNITS;

    exports.LINE_NUMBER_GUTTER = LINE_NUMBER_GUTTER;
    exports.LINE_NUMBER_GUTTER_PRIORITY     = LINE_NUMBER_GUTTER_PRIORITY;
    exports.CODE_FOLDING_GUTTER_PRIORITY    = CODE_FOLDING_GUTTER_PRIORITY;

    exports.init =init;
    exports.isValidTabSize = isValidTabSize;
    exports.isValidSpaceUnit = isValidSpaceUnit;
});
