define(function (require, exports, module) {
    const EditorManager = require("editor/EditorManager");
    const HTMLInstrumentation = require("LiveDevelopment/MultiBrowserImpl/language/HTMLInstrumentation");

    /**
     * this function handles the text edit in the source code when user updates the text in the live preview
     * @param {Object} message - the message object
     *      {
     *          livePreviewEditEnabled: true,
                element: the DOM element that was modified,
                oldContent: the text that was present before the edit,
                newContent: the new text,
                tagId: data-brackets-id of the DOM element,
                livePreviewTextEdit: true
            }
    *
    * The logic is: get the text in the editor using the tagId. split that text using the old content
    * join the text back and add the new content in between
    */
    function _editTextInSource(message) {
        const editor = EditorManager.getActiveEditor();
        if (!editor || !message.tagId) {
            return;
        }

        // this will give us the start pos and end pos of the DOM element in the source code
        // can be referenced using range.from and range.to
        const range = HTMLInstrumentation.getPositionFromTagId(editor, message.tagId);
        if (!range) {
            return;
        }

        // this is the actual source code for the element that we need to duplicate
        const text = editor.getTextBetween(range.from, range.to);
        // split the text as we want to remove the old content from the source code
        // for ex: if we have <h1>hello</h1> then splitting from hello will give us [<h1>, </h1>]
        const splittedText = text.split(message.oldContent);

        // so now we just merge the whole thing back replacing the old content with the new one
        const finalText = splittedText[0] + message.newContent + splittedText[1];

        editor.replaceRange(finalText, range.from, range.to);
    }

    /**
     * This function is responsible to duplicate an element from the source code
     * @param {Number} tagId - the data-brackets-id of the DOM element
     */
    function _duplicateElementInSourceByTagId(tagId) {
        const editor = EditorManager.getActiveEditor();
        if (!editor || !tagId) {
            return;
        }

        // this will give us the start pos and end pos of the DOM element in the source code
        // can be referenced using range.from and range.to
        const range = HTMLInstrumentation.getPositionFromTagId(editor, tagId);
        if (!range) {
            return;
        }

        // this is the actual source code for the element that we need to duplicate
        const text = editor.getTextBetween(range.from, range.to);
        // this is the indentation on the line
        const indent = editor.getTextBetween({line: range.from.line, ch: 0}, range.from);

        // this is the position where we need to insert
        // we're giving the char as 0 because since we insert a new line using '\n'
        // that's why writing any char value will not work, as the line is empty
        // and codemirror doesn't allow to insert at a column (ch) greater than the length of the line
        // So, the logic is to just append the indent before the text at this insertPos
        const insertPos = {
            line: range.from.line + (range.to.line - range.from.line + 1),
            ch: 0
        };

        editor.replaceRange('\n', range.to);
        editor.replaceRange(indent + text, insertPos);
    }

    /**
     * This function is responsible to delete an element from the source code
     * @param {Number} tagId - the data-brackets-id of the DOM element
     */
    function _deleteElementInSourceByTagId(tagId) {
        const editor = EditorManager.getActiveEditor();
        if (!editor || !tagId) {
            return;
        }

        // this will give us the start pos and end pos of the DOM element in the source code
        // can be referenced using range.from and range.to
        const range = HTMLInstrumentation.getPositionFromTagId(editor, tagId);
        if (!range) {
            return;
        }

        editor.replaceRange("", range.from, range.to);
    }

    /**
     * This is the main function that is exported.
     * it will be called by LiveDevProtocol when it receives a message from RemoteFunctions.js using MessageBroker
     * Refer to: `handleOptionClick` function in the RemoteFunctions.js and `_receive` function in LiveDevProtocol.js
     *
     * @param {Object} message - this is the object that is passed by RemoteFunctions.js using MessageBroker
     * this object will be in the format
     * {
                livePreviewEditEnabled: true,
                tagId: tagId,
                delete || duplicate || livePreviewTextEdit: true
        }
    * these are the main properties that are passed through the message
     */
    function handleLivePreviewEditOperation(message) {
        if (!message.element || !message.tagId) {
            return;
        }

        // just call the required functions
        if (message.delete) {
            _deleteElementInSourceByTagId(message.tagId);
        } else if (message.duplicate) {
            _duplicateElementInSourceByTagId(message.tagId);
        } else if (message.livePreviewTextEdit) {
            _editTextInSource(message);
        }
    }

    exports.handleLivePreviewEditOperation = handleLivePreviewEditOperation;
});
