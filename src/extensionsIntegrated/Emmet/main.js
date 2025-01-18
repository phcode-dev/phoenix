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
     * @param {Editor} editor - The editor instance
     * @returns {string} word before cursor
     */
    function getWordBeforeCursor(editor) {
        const pos = editor.getCursorPos();
        const line = editor.document.getLine(pos.line);
        let start = pos.ch;

        // Look backwards
        while (start > 0) {
            const char = line.charAt(start - 1);
            // Include ':' and other valid Emmet characters
            if (/[a-zA-Z0-9:\-@#]/.test(char)) {
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
        if(fileType === 'css' || fileType === 'scss' || fileType === 'less') {
            config.syntax = "css";
            config.type = "stylesheet";
        } else {
            config.syntax = "html";
            config.type = "markup";
        }

        return config;

    }


    /**
     * Register all the required handlers
     */
    function registerHandlers() {
        // Get the current active editor and attach the change listener
        const activeEditor = EditorManager.getActiveEditor();
        if (activeEditor) {
            activeEditor.on("change", onChanged);
        }

        // Listen for active editor changes, to attach the handler to new editor
        EditorManager.on("activeEditorChange", function (event, newEditor, oldEditor) {
            if (oldEditor) {
                // Remove listener from old editor
                oldEditor.off("change", onChanged);
            }
            if (newEditor) {
                // Add listener to new editor
                newEditor.on("change", onChanged);
            }
        });
    }

    /**
     * Function that gets triggered when any change occurs on the editor
     *
     * @param _evt unused event detail
     * @param {Editor} instance the editor instance
     * @param {Object} changeList an object that has properties regarding the line changed and type of change
     */
    function onChanged(_evt, instance, changeList) {
        // make sure that the feature is enabled
        if(enabled) {
            const word = getWordBeforeCursor(instance);
            const config = createConfig(instance);

            console.log(word);
            console.log(config);
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
