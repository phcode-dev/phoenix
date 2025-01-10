
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
        CSSUtils = require("language/CSSUtils"),
        CodeHintManager = require("editor/CodeHintManager"),
        Strings = require("strings");

    // Extension variables.
    const COLOR_REGEX = ColorUtils.COLOR_REGEX,    // used to match color
        COLOR_LANGUAGES = ["css", "scss", "less", "sass", "stylus", "html", "svg", "jsx", "tsx",
            "php", "ejs", "erb_html", "pug"];

    const SVG_REGEX = /(:[^;]*;?|(?:fill|stroke|stop-color|flood-color|lighting-color|background-color|border-color|from|to)\s*=\s*(['"]?)[^'";]*\2)/g,
        CSS_REGEX = /:[^;]*;?/g; // the last semi colon is optional.

    let editor = null;
    let typed = "";
    let cursorInfo = null;

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
 * Creates HTML preview for a color hint
 */
    function createColorPreview(color) {
        return `<div style='display: inline-block; margin-right: 5px; height: 10px; width: 10px; background: ${color};'></div>${color}`;
    }

    /**
     * Checks if hints should be shown
     */
    function hasHints(editorInstance, implicitChar) {
        editor = editorInstance;
        return implicitChar ? implicitChar === "#" : false;
    }

    /**
     * Returns the list of hints
     */
    function getHints(implicitChar) {
        const cursor = editor.getCursorPos();
        cursorInfo = CSSUtils.getInfoAtPos(editor, cursor);

        if (!cursorInfo.values[0]) {
            return null;
        }

        typed = cursorInfo.values[0].trim();

        // Get all colors and create previews
        const colors = _getAllColors(editor);
        const filter = typed.substr(1).toLowerCase();

        const hints = Array.from(colors)
            .filter(color => color.toLowerCase().includes(filter))
            .map(color => createColorPreview(color));

        return {
            hints: hints,
            match: null,
            selectInitial: true,
            handleWideResults: false
        };
    }

    /**
     * Inserts the selected color
     */
    function insertHint(hint) {
        const offset = cursorInfo.offset - 1;
        const color = hint.substring(hint.lastIndexOf(">") + 1);
        const pos = editor.getCursorPos();
        const start = { line: pos.line, ch: pos.ch - offset };

        editor._codeMirror.replaceRange(color, start, pos);
    }


    /**
     * Function that gets triggered when any change occurs on the editor
     *
     * @param _evt unused event detail
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
        // registerHandlers();
        const hintProvider = {
            hasHints: hasHints,
            getHints: getHints,
            insertHint: insertHint
        };

        CodeHintManager.registerHintProvider(hintProvider, ["css", "scss", "less", "sass", "stylus", "html", "svg", "jsx", "tsx"], 0);
    });
});

