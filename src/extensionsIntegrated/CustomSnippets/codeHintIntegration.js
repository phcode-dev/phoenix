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

    const Global = require("./global");
    const Driver = require("./driver");
    const SnippetCursorManager = require("./snippetCursorManager");

    /**
     * Handler object for the CodeHintManager API
     * This provides the interface for showing custom snippets at the top of hint lists
     */
    const CustomSnippetsHandler = {
        /**
         * Prepend custom snippets to the hint response
         * @param {Object} response - The original hint response from the current provider
         * @param {Editor} editor - The current editor instance
         * @return {Object} - The modified response with custom snippets added to the front
         */
        prepend: function (response, editor) {
            if (!response || !response.hints) {
                return response;
            }

            try {
                // check if the response already contains custom snippet hints to avoid duplicates
                // this is needed because sometimes when there are no default hints present then the
                // SnippetCodeHints.js shows some hints, so we don't want to duplicate hints
                if (Array.isArray(response.hints) && response.hints.length > 0) {
                    const hasCustomSnippets = response.hints.some((hint) => {
                        return (
                            (hint && hint.hasClass && hint.hasClass("emmet-hint")) ||
                            (hint && hint.attr && hint.attr("data-isCustomSnippet"))
                        );
                    });

                    if (hasCustomSnippets) {
                        return response; // already has custom snippets, don't need to add again
                    }
                }

                const wordInfo = Driver.getWordBeforeCursor();
                if (!wordInfo || !wordInfo.word) {
                    return response;
                }

                const needle = wordInfo.word.toLowerCase();
                const Helper = require("./helper");

                // check if there's at least one exact match using language context detection
                if (!Helper.hasExactMatchingSnippet(needle, editor)) {
                    return response;
                }

                // get all matching snippets using language context detection
                const matchingSnippets = Helper.getMatchingSnippets(needle, editor);

                // if we have matching snippets, prepend them to the hints
                if (matchingSnippets.length > 0) {
                    const customSnippetHints = matchingSnippets.map((snippet) => {
                        return Helper.createHintItem(snippet.abbreviation, needle, snippet.description);
                    });

                    // create a new response with custom snippets at the top
                    const newResponse = $.extend({}, response);
                    if (Array.isArray(response.hints)) {
                        newResponse.hints = customSnippetHints.concat(response.hints);
                    } else {
                        newResponse.hints = customSnippetHints.concat([response.hints]);
                    }

                    return newResponse;
                }
            } catch (e) {
                console.log("Error checking custom snippets:", e);
            }

            return response;
        },

        /**
         * Handle selection of custom snippet hints
         * @param {jQuery} hint - The selected hint element
         * @param {Editor} editor - The current editor instance
         * @param {Function} endSession - Function to end the current hint session
         * @return {boolean} - true if handled, false otherwise
         */
        handleHintSelection: function (hint, editor, endSession) {
            // check if the hint is a custom snippet
            if (hint && hint.jquery && hint.attr("data-isCustomSnippet")) {
                // handle custom snippet insertion
                const abbreviation = hint.attr("data-val");
                if (Global.SnippetHintsList) {
                    const matchedSnippet = Global.SnippetHintsList.find(
                        (snippet) => snippet.abbreviation === abbreviation
                    );
                    if (matchedSnippet) {
                        // replace the typed abbreviation with the template text using cursor manager
                        const wordInfo = Driver.getWordBeforeCursor();
                        const start = { line: wordInfo.line, ch: wordInfo.ch + 1 };
                        const end = editor.getCursorPos();

                        SnippetCursorManager.insertSnippetWithTabStops(editor, matchedSnippet.templateText, start, end);

                        endSession();
                        return true; // handled
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

    /**
     * Clean up the integration
     * This should be called when the extension is being disabled/unloaded
     */
    function cleanup() {
        CodeHintManager.clearHintsAtTop();
    }

    exports.init = init;
    exports.cleanup = cleanup;
});
