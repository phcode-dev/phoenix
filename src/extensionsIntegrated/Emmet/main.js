
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
    });
});
