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

    exports.SnippetHintsList = SnippetHintsList;
    exports.getWordBeforeCursor = getWordBeforeCursor;
    exports.handleSaveBtnClick = handleSaveBtnClick;
});
