define(function (require, exports, module) {
    const PreferencesManager = require("preferences/PreferencesManager");

    const Global = require("./global");

    // create extension preferences
    const prefs = PreferencesManager.getExtensionPrefs("CustomSnippets");

    // define preference for storing snippets
    prefs.definePreference("snippetsList", "array", [], {
        description: "List of custom code snippets"
    });

    /**
     * Load snippets from preferences
     * This is called on startup to restore previously saved snippets
     */
    function loadSnippetsFromState() {
        try {
            const savedSnippets = prefs.get("snippetsList");
            if (Array.isArray(savedSnippets)) {
                // clear existing snippets and load from saved state
                Global.SnippetHintsList.length = 0;
                Global.SnippetHintsList.push(...savedSnippets);
            }
        } catch (e) {
            console.error("something went wrong when trying to load custom snippets from preferences:", e);
        }
    }

    /**
     * Save snippets to preferences
     * This is called whenever snippets are modified
     */
    function saveSnippetsToState() {
        try {
            prefs.set("snippetsList", [...Global.SnippetHintsList]);
        } catch (e) {
            console.error("something went wrong when saving custom snippets to preferences:", e);
        }
    }

    exports.loadSnippetsFromState = loadSnippetsFromState;
    exports.saveSnippetsToState = saveSnippetsToState;
});
