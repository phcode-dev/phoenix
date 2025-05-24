define(function (require, exports, module) {
    const CodeHintManager = require("editor/CodeHintManager");

    const Global = require("./global");
    const Driver = require("./driver");
    const Helper = require("./helper");

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
        const word = Driver.getWordBeforeCursor().word;

        const matchedItem = Global.SnippetHintsList.find((snippet) => snippet.abbreviation === word);

        if (matchedItem) {
            // If fileExtension is "all", we need to show the hint in all the files
            if (matchedItem.fileExtension.toLowerCase() === "all") {
                return true;
            }

            // get current file extension
            const filePath = editor.document?.file?.fullPath;
            if (filePath) {
                const fileExtension = filePath.substring(filePath.lastIndexOf(".")).toLowerCase();

                // Check if snippet's fileExtension includes current file extension
                // Snippet's fileExtension is expected to be comma-separated list like ".js, .html"
                const supportedExtensions = matchedItem.fileExtension
                    .toLowerCase()
                    .split(",")
                    .map((ext) => ext.trim());

                // this returns true if current file's extension is in the list of supported extensions
                return supportedExtensions.some((ext) => ext === fileExtension);
            }
        }

        return false;
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

        const word = Driver.getWordBeforeCursor().word;
        const matchedItem = Global.SnippetHintsList.find((snippet) => snippet.abbreviation === word);

        if (matchedItem) {
            const $hintItem = Helper.createHintItem(matchedItem.abbreviation, word);
            result.push($hintItem);
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
        const start = { line: word.line, ch: word.ch };
        const end = cursor;

        const matchedItem = Global.SnippetHintsList.find((snippet) => snippet.abbreviation === word.word);
        this.editor.document.replaceRange(matchedItem.templateText, start, end);

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
