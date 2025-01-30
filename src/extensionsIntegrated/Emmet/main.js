define(function (require, exports, module) {
    const AppInit = require("utils/AppInit");
    const EditorManager = require("editor/EditorManager");
    // const KeyBindingManager = require("command/KeyBindingManager");
    //const CommandManager = require("command/CommandManager");
    const PreferencesManager = require("preferences/PreferencesManager");
    const Strings = require("strings");

    const Emmet = require("thirdparty/emmet");

    // For preferences settings, to toggle this feature on/off
    const PREFERENCES_EMMET = "emmet";
    let enabled = true; // by default:- on

    PreferencesManager.definePreference(PREFERENCES_EMMET, "boolean", enabled, {
        description: Strings.DESCRIPTION_EMMET
    });

    /**
     * A list of all the markup snippets that can be expanded.
     * For ex: 'link:css', 'iframe'
     * They expand differently as compared to normal tags.
     */
    const markupSnippetsList = Object.keys(Emmet.markupSnippets);

    /**
     * A list of all the HTML tags that expand like normal tags
     */
    const htmlTags = [
        "a", "abbr", "address", "area", "article", "aside", "audio", "b", "base",
        "bdi", "bdo", "blockquote", "body", "br", "button", "canvas", "caption",
        "cite", "code", "col", "colgroup", "data", "datalist", "dd", "del",
        "details", "dfn", "dialog", "div", "dl", "dt", "em", "embed", "fieldset",
        "figcaption", "figure", "footer", "form", "h1", "h2", "h3", "h4", "h5",
        "h6", "head", "header", "hgroup", "hr", "html", "i", "iframe", "img",
        "input", "ins", "kbd", "label", "legend", "li", "link", "main", "map",
        "mark", "meta", "meter", "nav", "noscript", "object", "ol", "optgroup",
        "option", "output", "p", "param", "picture", "pre", "progress", "q",
        "rp", "rt", "ruby", "s", "samp", "script", "section", "select", "small",
        "source", "span", "strong", "style", "sub", "summary", "sup", "table",
        "tbody", "td", "template", "textarea", "tfoot", "th", "thead", "time",
        "title", "tr", "track", "u", "ul", "var", "video", "wbr"
    ];

    /**
     * A list of all those symbols which if present in a word, that word can be expanded
     */
    const positiveSymbols = [
        '!',  // document generator
        '>',  // Child Selector
        '+',  // Adjacent Sibling Selector
        '^',  // Parent Selector
        '*',  // Multiplication (Repeat Element)
        '[',
        ']', // Attributes
        '{',
        '}', // Text Content
        '(',
        ')', // Group
        '&'   // Current Element Reference
    ];

    /**
     * A list of all those symbols which if present in a word, that word cannot be expanded
     */
    const negativeSymbols = [
        '/',     // closing tag
        '<'    // tag inital
    ];



    /**
     * Responsible to create the configuration based on the file type.
     * Config is an object with two properties, type & snytax.
     * This is required by the Emmet API to distinguish between HTML & Stylesheets
     *
     * @param {Editor} editor - The editor instance
     * @returns {Object | False} Object with two properties 'syntax' and 'type'
     */
    function createConfig(editor) {
        const fileType = editor.document.getLanguage().getId();

        if (fileType === "html") {
            return { syntax: "html", type: "markup" };
        }

        if (fileType === "css" || fileType === "scss" || fileType === "less") {
            return { syntax: "css", type: "stylesheet" };
        }

        return false;
    }

    /**
     * Responsible to get the current word before cursor
     *
     * @param {Editor} editor - The editor instance
     * @returns {Object} an object in the format :
     * {
     *      word: "",   // the word before the cursor
     *      start: {line: Number, ch: Number},
     *      end: {line: Number, ch: Number}
     * }
     */
    function getWordBeforeCursor(editor) {
        const pos = editor.getCursorPos();
        const line = editor.document.getLine(pos.line);
        let start = pos.ch;

        // Look backwards
        while (start > 0) {
            const char = line.charAt(start - 1);
            // Include all the valid emmet characters
            if (/[a-zA-Z0-9:+*<>/!\-@#}{]/.test(char)) {
                start--;
            } else {
                break;
            }
        }

        return {
            word: line.substring(start, pos.ch),
            start: { line: pos.line, ch: start },
            end: pos
        };
    }


    /**
     * Calculate the indentation level for the current line
     *
     * @param {Editor} editor - the editor instance
     * @param {Object} position - position object with line number
     * @returns {String} - the indentation string
     */
    function getLineIndentation(editor, position) {
        const line = editor.document.getLine(position.line);
        const match = line.match(/^\s*/);
        return match ? match[0] : '';
    }


    /**
     * Adds proper indentation to multiline Emmet expansion
     *
     * @param {String} expandedText - the expanded Emmet abbreviation
     * @param {String} baseIndent - the base indentation string
     * @returns {String} - properly indented text
     */
    function addIndentation(expandedText, baseIndent) {
        // Split into lines, preserve empty lines
        const lines = expandedText.split(/(\r\n|\n)/g);

        // Process each line
        let result = '';
        let isFirstLine = true;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            // If it's a newline character, just add it
            if (line === '\n' || line === '\r\n') {
                result += line;
                continue;
            }

            // Skip indenting empty lines
            if (line.trim() === '') {
                result += line;
                continue;
            }

            // Don't indent the first line as it inherits the current indent
            if (isFirstLine) {
                result += line;
                isFirstLine = false;
            } else {
                // Add base indent plus the existing indent in the expanded text
                result += baseIndent + line;
            }
        }

        return result;
    }



    /**
     * Find the position where cursor should be placed after expansion
     * Looks for patterns like '><', '""', ''
     *
     * @param {Editor} editor - The editor instance
     * @param {String} indentedAbbr - the indented abbreviation
     * @param {Object} startPos - Starting position {line, ch} of the expansion
     * @returns {Object | false} - Cursor position {line, ch} or false if no pattern found
     */
    function findCursorPosition(editor, indentedAbbr, startPos) {
        const totalLines = startPos.line + indentedAbbr.split('\n').length;

        for (let i = startPos.line; i < totalLines; i++) {
            const line = editor.document.getLine(i);

            for (let j = 0; j < line.length - 1; j++) {
                const pair = line[j] + line[j + 1];

                if (pair === '><' || pair === '""' || pair === "''") {
                    return { line: i, ch: j + 1 };
                }
            }
        }

        return false;
    }



    /**
     * This function is responsible to replace the abbreviation in the editor,
     * with its expanded version
     *
     * @param {Editor} editor - the editor instance
     * @param {Object} wordObj -  an object in the format :
     * {
     *      word: "",   // the word before the cursor
     *      start: {line: Number, ch: Number},
     *      end: {line: Number, ch: Number}
     * }
     * @param {String} expandedAbbr - the expanded version of abbr that will replace the abbr
     */
    function updateAbbrInEditor(editor, wordObj, expandedAbbr) {
        // Get the current line's indentation
        const baseIndent = getLineIndentation(editor, wordObj.start);

        // Add proper indentation to the expanded abbreviation
        const indentedAbbr = addIndentation(expandedAbbr, baseIndent);

        // Handle the special case for curly braces
        // this check is added because in some situations such as
        // `ul>li{Hello}` and the cursor is before the closing braces right after 'o',
        // then when this is expanded it results in an extra closing braces at the end.
        // so we remove the extra '}' from the end
        if (wordObj.word.includes('{')) {
            const pos = editor.getCursorPos();
            const line = editor.document.getLine(pos.line);
            const char = line.charAt(wordObj.end.ch);

            if (char === '}') {
                wordObj.end.ch += 1;
            }

        }

        // Replace the abbreviation
        editor.document.replaceRange(
            indentedAbbr,
            wordObj.start,
            wordObj.end
        );

        // Calculate and set the new cursor position
        const cursorPos = findCursorPosition(editor, indentedAbbr, wordObj.start);
        if (cursorPos) {
            editor.setCursorPos(cursorPos.line, cursorPos.ch);
        }
    }


    /**
     * This function checks whether the abbreviation can be expanded or not.
     * There are a lot of cases to check:
     * There should not be any negative symbols
     * The abbr should be either in htmlTags or in markupSnippetsList
     * For other cases such as 'ul>li', we will check if there is any,
     * positive word. This is done to handle complex abbreviations such as,
     * 'ul>li' or 'li*3{Hello}'. So we check if the word includes any positive symbols.
     *
     * @param {Editor} editor - the editor instance
     * @param {String} word - the abbr
     * @param {Object} config - the config object, to make sure it is a valid file type,
     * refer to createConfig function for more info about config object.
     * @returns {String | false} - returns the expanded abbr, and if cannot be expanded, returns false
     */
    function isExpandable(editor, word, config) {

        // make sure that word doesn't contain any negativeSymbols
        if (negativeSymbols.some(symbol => word.includes(symbol))) {
            return false;
        }

        // the word must be either in markupSnippetsList, htmlList or it must have a positive symbol
        if (markupSnippetsList.includes(word) ||
            htmlTags.includes(word) ||
            positiveSymbols.some(symbol => word.includes(symbol))) {
            const expanded = Emmet.expandAbbreviation(word, config);
            return expanded;
        }

        return false;
    }


    /**
     * Responsible to handle the flow of the program
     *
     * @param {Editor} editor - the editor instance
     * @param {Object} keyboardEvent - the keyboard event object
     */
    function driver(editor, keyboardEvent) {
        const config = createConfig(editor);

        if (config) {

            // to make sure it is an html file
            if (config.syntax === "html") {
                const wordObj = getWordBeforeCursor(editor);

                // make sure we donot have empty spaces
                if (wordObj.word.trim()) {

                    const expandedAbbr = isExpandable(editor, wordObj.word, config);
                    if (expandedAbbr) {
                        updateAbbrInEditor(editor, wordObj, expandedAbbr);

                        // prevent the default working of the 'tab' key
                        keyboardEvent.preventDefault();
                    }
                }
            }
        }
    }

    /**
     * Function that gets triggered when any key is pressed.
     * We only want to look for 'tab' key events
     *
     * @param {Event} event - unused event detail
     * @param {Editor} editor - the editor instance
     * @param {Object} keyboardEvent - an object that has properties related to the keyboard,
     *  mainly the key that is pressed (keyboardEvent.key)
     * @returns {Boolean} True if abbreviation is expanded else false
     */
    function handleKeyEvent(event, editor, keyboardEvent) {
        if (!enabled) {
            return false;
        }

        // if not a 'tab' key press, ignore
        if (keyboardEvent.key !== "Tab") {
            return false;
        }

        // the function that drives the flow of the program
        driver(editor, keyboardEvent);
    }

    /**
     * Register all the required handlers
     */
    function registerHandlers() {
        // Get the current active editor and attach the change listener
        const activeEditor = EditorManager.getActiveEditor();
        if (activeEditor) {
            activeEditor.on("keydown", handleKeyEvent);
        }

        // Listen for active editor changes, to attach the handler to new editor
        EditorManager.on("activeEditorChange", function (event, newEditor, oldEditor) {
            if (oldEditor) {
                // Remove listener from old editor
                oldEditor.off("keydown", handleKeyEvent);
            }
            if (newEditor) {
                // Add listener to new editor
                newEditor.off("change", handleKeyEvent);
                newEditor.on("keydown", handleKeyEvent);
            }
        });
    }

    /**
     * Checks for preference changes, to enable/disable the feature
     */
    function preferenceChanged() {
        const value = PreferencesManager.get(PREFERENCES_EMMET);
        enabled = value;
    }

    AppInit.appReady(function () {
        // Set up preferences
        PreferencesManager.on("change", PREFERENCES_EMMET, preferenceChanged);
        preferenceChanged();

        registerHandlers();
    });
});
