/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
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
