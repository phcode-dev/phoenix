define(function (require, exports, module) {
    // Brackets modules
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
        CodeHintManager = require("editor/CodeHintManager");

    const COLOR_PROPERTIES = [
        "color",
        "background-color",
        "border-color",
        "border-top-color",
        "border-right-color",
        "border-bottom-color",
        "border-left-color",
        "outline-color",
        "text-decoration-color",
        "text-emphasis-color",
        "text-shadow",
        "box-shadow",
        "background",
        "border",
        "border-top",
        "border-right",
        "border-bottom",
        "border-left"
    ];

    let editor = null;
    let cursorInfo = null;

    // Add helper functions from the second file
    function _isAlphanumeric(char) {
        return /^[a-z0-9-@$]$/i.test(char);
    }

    function _isColor(segment, colorInSegment, colorIndex) {
        const previousChar = colorIndex === 0 ? "" : segment.charAt(colorIndex - 1);
        const endIndex = colorIndex + colorInSegment.length;
        const nextChar = endIndex === segment.length ? "" : segment.charAt(endIndex);
        return !_isAlphanumeric(previousChar) && !_isAlphanumeric(nextChar);
    }

    function _isColorProperty(propertyName) {
        return COLOR_PROPERTIES.includes(propertyName.toLowerCase());
    }

    function _getAllColors(editor) {
        const allColors = new Set();
        const nLen = editor.lineCount();

        for (let i = 0; i < nLen; i++) {
            const lineText = editor.getLine(i);
            if (!lineText || lineText.length > 1000) {
                continue;
            }

            // Match color values
            const colorMatches = lineText.match(ColorUtils.COLOR_REGEX);
            if (colorMatches) {
                colorMatches.forEach(color => {
                    // Replace isValidColor with _isColor check
                    const colorIndex = lineText.indexOf(color);
                    if (colorIndex !== -1 && _isColor(lineText, color, colorIndex)) {
                        allColors.add(color);
                    }
                });
            }
        }

        return allColors;
    }

    function hasHints(editorInstance, implicitChar) {
        editor = editorInstance;
        const cursor = editor.getCursorPos();
        cursorInfo = CSSUtils.getInfoAtPos(editor, cursor);

        return (cursorInfo.context === CSSUtils.PROP_VALUE &&
                (implicitChar === ":" || !implicitChar) &&
                _isColorProperty(cursorInfo.name));
    }

    function getHints() {
        const colors = _getAllColors(editor);
        // Add common color keywords
        ColorUtils.COLOR_NAMES.forEach(color => colors.add(color));
        // Add special color values
        colors.add('transparent');
        colors.add('currentColor');

        const hints = Array.from(colors).map(color => ({
            text: color,
            color: color,
            stringRanges: [{text: color, matched: false}]
        }));

        return {
            hints: hints.map(hint => {
                const $hintObj = $('<span>')
                    .addClass("brackets-css-hints")
                    .text(hint.text);

                return ColorUtils.formatColorHint($hintObj, hint.color);
            }),
            match: null,
            selectInitial: true,
            handleWideResults: false
        };
    }

    function insertHint(hint) {
        const color = $(hint).data("color") || hint.text;
        const cursor = editor.getCursorPos();
        const start = {
            line: cursor.line,
            ch: cursor.ch - (cursorInfo.offset || 0)
        };
        editor._codeMirror.replaceRange(color, start, cursor);
        return false;
    }

    AppInit.appReady(function () {
        const hintProvider = {
            hasHints: hasHints,
            getHints: getHints,
            insertHint: insertHint
        };
        CodeHintManager.registerHintProvider(hintProvider, ["css", "scss", "less", "sass", "stylus", "html", "svg", "jsx", "tsx"], 2);
    });
});