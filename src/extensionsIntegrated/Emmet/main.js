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


    const markupSnippetsList = Object.keys(Emmet.markupSnippets);
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
            // Include the valid Emmet characters such as : + * >
            if (/[a-zA-Z0-9:+*>!\-@#}{]/.test(char)) {
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

    function updateAbbrInEditor(editor, wordObj, expandedAbbr) {

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
                editor.document.replaceRange(
                    expandedAbbr,
                    wordObj.start,
                    wordObj.end
                );
                return true;
            }

        }

        // replace the existing abbreviation with the expanded version
        editor.document.replaceRange(
            expandedAbbr,
            wordObj.start,
            wordObj.end
        );
    }


    function isExpandable(editor, word, config) {

        if (markupSnippetsList.includes(word) || htmlTags.includes(word)) {
            const expanded = Emmet.expandAbbreviation(word, config);

            if (word !== expanded) {
                return expanded;
            }
        }

        return false;
    }


    function driver(editor, keyboardEvent) {
        const config = createConfig(editor);

        if (config) {
            if (config.syntax === "html") {
                const wordObj = getWordBeforeCursor(editor);
                if (wordObj.word) {
                    const expandedAbbr = isExpandable(editor, wordObj.word, config);
                    if (expandedAbbr) {
                        updateAbbrInEditor(editor, wordObj, expandedAbbr);
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
        if (keyboardEvent.key !== "Tab") {
            return false;
        }

        // this function leads the process
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
