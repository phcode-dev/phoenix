define(function (require, exports, module) {
    const CodeHintManager = require("editor/CodeHintManager");

    const Global = require("./global");
    const Driver = require("./driver");
    const Helper = require("./helper");
    const SnippetCursorManager = require("./snippetCursorManager");

    /**
     * Constructor
     */
    function SnippetHints() {}

    /**
     * Determines whether any custom snippets hints are available
     *
     * @param {Editor} editor - the editor instance
     * @param {string} implicitChar - null if the hinting request was explicit,
     * or a single character that represents the last insertion and that indicates an implicit
     * hinting request.
     *
     * @return {boolean} - true if hints are available else false
     */
    SnippetHints.prototype.hasHints = function (editor, implicitChar) {
        this.editor = editor;

        // we don't need to show any hints if user explicitly asks for it
        if (implicitChar === null) {
            return false;
        }

        // extract the actual word, because getWordBeforeCursor returns an object
        const wordInfo = Driver.getWordBeforeCursor();
        if (!wordInfo || !wordInfo.word) {
            return false;
        }

        const word = wordInfo.word.toLowerCase();
        const fileExtension = Helper.getCurrentFileExtension(editor);

        // check if there's at least one exact match - this is the same logic as in driver.js
        return Helper.hasExactMatchingSnippet(word, fileExtension);
    };

    /**
     * Returns a list of all the available snippet hints
     * this only gets executed if 'hasHints' returned true
     *
     * @returns {Object} - this object is what is displayed by the code hint manager. it is in the format
     *                    {
     *                    hints: <JQuery Object>,
     *                    selectInitial: true,
     *                    handleWideResults: false
     *                    }
     *                    1. hints: array of hints, each element is a jquery
     *                    2. selectInital: true because we want that the first hint should be    selected by default
     *                    3. handleWideResults: false as we don't want the result string to stretch width of display
     */
    SnippetHints.prototype.getHints = function (implicitChar) {
        const result = [];

        const wordInfo = Driver.getWordBeforeCursor();
        if (!wordInfo || !wordInfo.word) {
            return null;
        }

        const word = wordInfo.word.toLowerCase();
        const fileExtension = Helper.getCurrentFileExtension(this.editor);

        // find all matching snippets (including prefix matches) - same logic as driver.js
        const matchingSnippets = Helper.getMatchingSnippets(word, fileExtension);

        if (matchingSnippets.length > 0) {
            matchingSnippets.forEach((snippet) => {
                const $hintItem = Helper.createHintItem(snippet.abbreviation, wordInfo.word, snippet.description);
                result.push($hintItem);
            });

            return {
                hints: result,
                selectInitial: true,
                handleWideResults: false
            };
        }

        return null;
    };

    /**
     * Inserts the given hint into the current editor context.
     * @param {string} hint - unused variable because we fetch the abbreviation again
     */
    SnippetHints.prototype.insertHint = function (hint) {
        const cursor = this.editor.getCursorPos();
        const word = Driver.getWordBeforeCursor();
        const start = { line: word.line, ch: word.ch + 1 };
        const end = cursor;

        const matchedItem = Global.SnippetHintsList.find((snippet) => snippet.abbreviation === word.word);

        // Use the new cursor manager for snippet insertion with tab stops
        SnippetCursorManager.insertSnippetWithTabStops(this.editor, matchedItem.templateText, start, end);

        return false;
    };

    /**
     * the initialization function
     * called inside the appInit inside the main.js
     */
    function init() {
        const snippetHints = new SnippetHints();
        CodeHintManager.registerHintProvider(snippetHints, ["all"], 10);
    }

    exports.init = init;
});
