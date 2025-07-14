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
    const CodeHintManager = require("editor/CodeHintManager");
    const EditorManager = require("editor/EditorManager");
    const Metrics = require("utils/Metrics");

    const Global = require("./global");
    const Driver = require("./driver");
    const Helper = require("./helper");
    const SnippetCursorManager = require("./snippetCursorManager");

    /**
     * Handler object for the CodeHintManager API
     * This provides the interface for showing custom snippets at the top of hint lists
     */
    const CustomSnippetsHandler = {
        /**
         * Determines whether any custom snippets hints are available
         * @param {Editor} editor - The current editor instance
         * @param {string} implicitChar - The last character typed (null if explicit request)
         * @return {boolean} - true if hints are available, false otherwise
         */
        hasHints: function (editor, implicitChar) {
            // We only show hints for implicit requests (when user is typing)
            if (implicitChar === null) {
                return false;
            }

            try {
                const needle = Driver.getWordBeforeCursor();
                if (!needle || !needle.word) {
                    return false;
                }

                // Check if there's at least one exact match using language context detection
                const hasMatch = Helper.hasExactMatchingSnippet(needle.word.toLowerCase(), editor);
                return hasMatch;
            } catch (e) {
                return false;
            }
        },

        /**
         * Get custom snippet hints to show at the top of the hint list
         * @param {Editor} editor - The current editor instance
         * @param {string} implicitChar - The last character typed (null if explicit request)
         * @return {Object} - The hint response object with hints array
         */
        getHints: function (editor, implicitChar) {
            try {
                const needle = Driver.getWordBeforeCursor();
                if (!needle || !needle.word) {
                    return null;
                }

                const word = needle.word.toLowerCase();

                // Check if there's at least one exact match using language context detection
                if (!Helper.hasExactMatchingSnippet(word, editor)) {
                    return null;
                }

                // Get all matching snippets using language context detection
                const matchingSnippets = Helper.getMatchingSnippets(word, editor);

                if (matchingSnippets.length > 0) {
                    const customSnippetHints = matchingSnippets.map((snippet) => {
                        return Helper.createHintItem(snippet.abbreviation, needle.word, snippet.description);
                    });

                    return {
                        hints: customSnippetHints,
                        selectInitial: true,
                        handleWideResults: false
                    };
                }
            } catch (e) {
                console.log("Error getting custom snippets:", e);
            }

            return null;
        },

        /**
         * Handle insertion of custom snippet hints
         * @param {jQuery} hint - The selected hint element
         * @return {boolean} - true if handled, false otherwise
         */
        insertHint: function (hint) {
            // check if the hint is a custom snippet
            if (hint && hint.jquery && hint.attr("data-isCustomSnippet")) {
                // handle custom snippet insertion
                const abbreviation = hint.attr("data-val");
                if (Global.SnippetHintsList) {
                    const matchedSnippet = Global.SnippetHintsList.find(
                        (snippet) => snippet.abbreviation === abbreviation
                    );
                    if (matchedSnippet) {
                        // Get current editor from EditorManager since it's not passed
                        const editor = EditorManager.getFocusedEditor();

                        if (editor) {
                            // to track the usage metrics
                            const fileCategory = Helper.categorizeFileExtensionForMetrics(matchedSnippet.fileExtension);
                            Metrics.countEvent(Metrics.EVENT_TYPE.EDITOR, "snipt", `use.${fileCategory}`);

                            // replace the typed abbreviation with the template text using cursor manager
                            const wordInfo = Driver.getWordBeforeCursor();
                            const start = { line: wordInfo.line, ch: wordInfo.ch + 1 };
                            const end = editor.getCursorPos();

                            SnippetCursorManager.insertSnippetWithTabStops(
                                editor,
                                matchedSnippet.templateText,
                                start,
                                end
                            );
                            return true; // handled
                        }
                    }
                }
            }

            return false; // not handled
        }
    };

    /**
     * Initialize the code hint integration
     * This should be called during extension initialization
     */
    function init() {
        // Register our handler with the CodeHintManager API
        CodeHintManager.showHintsAtTop(CustomSnippetsHandler);
    }

    exports.init = init;
});
