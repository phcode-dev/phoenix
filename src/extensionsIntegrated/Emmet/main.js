
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
        console.log(getWordBeforeCursor(instance));
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
