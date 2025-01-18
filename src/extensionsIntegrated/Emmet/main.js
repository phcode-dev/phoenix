define(function (require, exports, module) {

    const AppInit = require("utils/AppInit");
    const EditorManager = require("editor/EditorManager");
    const KeyBindingManager = require("command/KeyBindingManager");
    const CommandManager = require("command/CommandManager");
    const PreferencesManager = require("preferences/PreferencesManager");
    const Strings = require("strings");

    const Emmet = require("thirdparty/emmet");

    // For preferences settings, to toggle this feature on/off
    const PREFERENCES_EMMET = "emmet";
    let enabled = true;  // by default:- on

    PreferencesManager.definePreference(PREFERENCES_EMMET, "boolean", enabled, {
        description: Strings.DESCRIPTION_EMMET
    });


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
            if (/[a-zA-Z0-9:+*>!\-@.#]/.test(char)) {
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
     * Responsible to create the configuration based on the file type.
     * Config is an object with two properties, type & snytax.
     * This is required by the Emmet API to distinguish between HTML & Stylesheets
     *
     * @param {Editor} editor - The editor instance
     * @returns {Object} Object with two properties 'syntax' and 'type'
     */
    function createConfig(editor) {

        const config = {};
        const fileType = editor.document.getLanguage().getId();
        if (fileType === 'css' || fileType === 'scss' || fileType === 'less') {
            config.syntax = "css";
            config.type = "stylesheet";
        } else {
            config.syntax = "html";
            config.type = "markup";
        }

        return config;

    }

    /**
     * 
     *
     * @param {Editor} editor - The editor instance
     * @param {Object} word - The word object, refer to `getWordBeforeCursor` function
     * @param {Object} config - The config object, refer to `createConfig` function
     * @returns {Boolean} True if the abbr is successfully expanded else False.
     */
    function expandMarkupAbbr(editor, word, config) {
        // the Emmet api, this requires a string which is to be expanded and config object
        // to differentiate between markup and stylesheets
        const expanded = Emmet.expandAbbreviation(word.word, config);

        if (expanded) {

            // replace the existing abbreviation with the expanded version
            editor.document.replaceRange(
                expanded,
                word.start,
                word.end
            );
            return true;
        }

        return false;
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
                newEditor.on("keydown", handleKeyEvent);
            }
        });
    }

    /**
     * Function that gets triggered when any key is pressed.
     *
     * @param {Event} event - unused event detail
     * @param {Editor} instance - the editor instance
     * @param {Object} keyboardEvent - an object that has properties related to the keyboard,
     *  mainly the key that is pressed (keyboardEvent.key)
     * @returns {Boolean} True if abbreviation is expanded else false
     */
    function handleKeyEvent(event, instance, keyboardEvent) {
        // make sure that the feature is enabled
        if (enabled) {
            if (keyboardEvent.key !== "Tab") {
                return false;
            }

            // the word and config both are objects. Refer to their respective functions for clear structure
            const word = getWordBeforeCursor(instance);
            const config = createConfig(instance);

            if (config.type === "markup") {

                // if abbreviation is expanded, we prevent the default working of the button
                if (expandMarkupAbbr(instance, word, config)) {
                    keyboardEvent.preventDefault();
                    return true;
                }
            } else {
                //
            }

            // Let the default behavior handle it
            return false;
        }
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
