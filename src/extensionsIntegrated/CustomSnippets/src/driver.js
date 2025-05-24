define(function (require, exports, module) {
    const EditorManager = require("editor/EditorManager");

    const Helper = require("./helper");
    const UIHelper = require("./UIHelper");

    /**
     * This is an array of objects. this will store the list of all the snippets
     * it is an array of objects stored in the format
     * [{
     * abbreviation: 'clg',
     * description: 'console log shortcut',
     * templateText: 'console.log()',
     * fileExtension: '.js, .css'
     * }]
     */
    const SnippetHintsList = [];


    /**
     * This function handles the save button click handler
     * it does all the chores like fetching the data from the required fields, adding it to snippet list and all that
     */
    function handleSaveBtnClick() {
        const snippetData = Helper.getSnippetData();
        if (shouldAddSnippetToList(snippetData)) {
            SnippetHintsList.push(snippetData);
            Helper.clearAllInputFields();
            Helper.toggleSaveButtonDisability();
        } else {
            UIHelper.showDuplicateAbbreviationError(snippetData.abbreviation);
        }
    }

    /**
     * This function is to check whether we can add the new snippet to the snippets list
     * because we don't want to add the new snippet if a snippet already exists with the same abbreviation
     * @param   {object}  snippetData - the snippet data object
     * @returns {boolean} - true if we can add the new snippet to the list otherwise false
     */
    function shouldAddSnippetToList(snippetData) {
        const matchedItem = SnippetHintsList.find((snippet) => snippet.abbreviation === snippetData.abbreviation);

        if (matchedItem) {
            return false;
        }
        return true;
    }

    /**
     * This function is responsible to get the word before the cursor
     * this is required to check whether something matches the snippet list
     * @returns {object} - an object in the format {word: 'pluto', line: 10, ch: 2}
     */
    function getWordBeforeCursor() {
        const editor = EditorManager.getActiveEditor();
        if (!editor) {
            return;
        }

        const pos = editor.getCursorPos();
        let word = ""; // this will store the actual word before the cursor
        let i = pos.ch - 1; // index of the char right before the cursor
        const breakWordAt = ["", " "]; // we need to break the loop when we encounter this char's

        while (i >= 0) {
            const char = editor.getCharacterAtPosition({ line: pos.line, ch: i });
            if (breakWordAt.includes(char)) {
                break;
            }
            word = char + word;
            i--;
        }

        return {
            word: word,
            line: pos.line,
            ch: i
        };
    }

    /**
     * This function is called from CodeHintManager.js because of how Phoenix handles hinting.
     *
     * Here’s the problem:
     * When a provider returns true for `hasHints`, it locks in that provider for the entire hinting session
     * until it returns false. If the user types something like ‘clg’, and the default JavaScript provider
     * is already active, the CodeHintManager won’t even ask the custom snippets provider if it has hints.
     *
     * To fix that, what we did is that when hints are shown we just ask the custom snippets if it has any relevant hint
     * If it does, this function prepends them to the existing list of hints.
     *
     * @param {Object} response - The original hint response from the current provider
     * @param {Editor} editor - The current editor instance
     * @return {Object} - The modified response with custom snippets added to the front
     */
    function prependCustomSnippets(response, editor) {
        if (!response || !response.hints) {
            return response;
        }

        try {
            // check if the response already contains custom snippet hints to avoid duplicates
            // this is needed because sometimes when there are no default hints present then the
            // SnippetCodeHints.js shows some hints, so we don't want to duplicate hints
            if (Array.isArray(response.hints) && response.hints.length > 0) {
                const hasCustomSnippets = response.hints.some(hint => {
                    return (hint && hint.hasClass && hint.hasClass('emmet-hint')) ||
                           (hint && hint.attr && hint.attr('data-isCustomSnippet'));
                });

                if (hasCustomSnippets) {
                    return response; // already has custom snippets, don't need to add again
                }
            }

            const wordInfo = getWordBeforeCursor();
            if (!wordInfo || !wordInfo.word) {
                return response;
            }

            const needle = wordInfo.word.toLowerCase();

            // get the current file extension
            const filePath = editor.document?.file?.fullPath;
            let fileExtension = null;
            if (filePath) {
                fileExtension = filePath.substring(filePath.lastIndexOf(".")).toLowerCase();
            }

            // first, check if there's at least one exact match - only show snippets if there is
            // the logic is:
            // lets say we have 2 snippets 'clg' ang 'clgi'
            // now if user types 'cl' in the editor then we don't show the snippets
            // but when user types 'clg' then we show the clg snippet
            // and we also check if there are any more snippets starting with this and we show all of them
            const hasExactMatch = SnippetHintsList.some((snippet) => {
                if (snippet.abbreviation.toLowerCase() === needle) {
                    if (snippet.fileExtension.toLowerCase() === "all") {
                        return true;
                    }

                    // check if current file extension is supported
                    if (fileExtension) {
                        const supportedExtensions = snippet.fileExtension
                            .toLowerCase()
                            .split(",")
                            .map((ext) => ext.trim());
                        return supportedExtensions.some((ext) => ext === fileExtension);
                    }
                }
                return false;
            });

            if (!hasExactMatch) {
                return response;
            }

            // now find all matching snippets (including prefix matches)
            const matchingSnippets = SnippetHintsList.filter((snippet) => {
                if (snippet.abbreviation.toLowerCase().startsWith(needle)) {
                    if (snippet.fileExtension.toLowerCase() === "all") {
                        return true;
                    }

                    if (fileExtension) {
                        const supportedExtensions = snippet.fileExtension
                            .toLowerCase()
                            .split(",")
                            .map((ext) => ext.trim());
                        return supportedExtensions.some((ext) => ext === fileExtension);
                    }
                }
                return false;
            });

            // if we have matching snippets, prepend them to the hints
            if (matchingSnippets.length > 0) {
                const customSnippetHints = matchingSnippets.map((snippet) => {
                    return Helper.createHintItem(snippet.abbreviation);
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
    }

    exports.SnippetHintsList = SnippetHintsList;
    exports.getWordBeforeCursor = getWordBeforeCursor;
    exports.handleSaveBtnClick = handleSaveBtnClick;
    exports.prependCustomSnippets = prependCustomSnippets;
});
