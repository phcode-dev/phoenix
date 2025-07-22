define(function (require, exports, module) {
    const HTMLInstrumentation = require("LiveDevelopment/MultiBrowserImpl/language/HTMLInstrumentation");
    const LiveDevMultiBrowser = require("LiveDevelopment/LiveDevMultiBrowser");

    /**
     * this is a helper function to find the content boundaries in HTML
     * @param {string} html - The HTML string to parse
     * @return {Object} - Object with openTag and closeTag properties
     */
    function _findContentBoundaries(html) {
        const openTagEnd = html.indexOf('>') + 1;
        const closeTagStart = html.lastIndexOf('<');

        if (openTagEnd > 0 && closeTagStart > openTagEnd) {
            return {
                openTag: html.substring(0, openTagEnd),
                closeTag: html.substring(closeTagStart)
            };
        }

        return null;
    }

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
        const currLiveDoc = LiveDevMultiBrowser.getCurrentLiveDoc();
        if(!currLiveDoc || !currLiveDoc.editor || !message.tagId) {
            return;
        }

        const editor = currLiveDoc.editor;
        const range = HTMLInstrumentation.getPositionFromTagId(editor, message.tagId);
        if (!range) {
            return;
        }

        const text = editor.getTextBetween(range.from, range.to);
        let splittedText;

        // we need to find the content boundaries to find exactly where the content starts and where it ends
        const boundaries = _findContentBoundaries(text);
        if (boundaries) {
            splittedText = [boundaries.openTag, boundaries.closeTag];
        }

        // if the text split was done successfully, apply the edit
        if (splittedText && splittedText.length === 2) {
            const finalText = splittedText[0] + message.newContent + splittedText[1];
            editor.replaceRange(finalText, range.from, range.to);
        } else {
            console.error("Live preview text edit operation failed.");
        }
    }

    /**
     * This function is responsible to duplicate an element from the source code
     * @param {Number} tagId - the data-brackets-id of the DOM element
     */
    function _duplicateElementInSourceByTagId(tagId) {
        // this is to get the currently live document that is being served in the live preview
        const currLiveDoc = LiveDevMultiBrowser.getCurrentLiveDoc();
        if(!currLiveDoc) {
            return;
        }

        const editor = currLiveDoc.editor;
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
        const indent = editor.getTextBetween({ line: range.from.line, ch: 0 }, range.from);

        // make sure there is only indentation and no text before it
        if (indent.trim() === "") {
            // this is the position where we need to insert
            // we're giving the char as 0 because since we insert a new line using '\n'
            // that's why writing any char value will not work, as the line is empty
            // and codemirror doesn't allow to insert at a column (ch) greater than the length of the line
            // So, the logic is to just append the indent before the text at this insertPos
            const insertPos = {
                line: range.from.line + (range.to.line - range.from.line + 1),
                ch: 0
            };

            editor.replaceRange("\n", range.to);
            editor.replaceRange(indent + text, insertPos);
        } else {
            // if there is some text, we just add the duplicated text right next to it
            editor.replaceRange(text, range.from);
        }
    }

    /**
     * This function is responsible to delete an element from the source code
     * @param {Number} tagId - the data-brackets-id of the DOM element
     */
    function _deleteElementInSourceByTagId(tagId) {
        // this is to get the currently live document that is being served in the live preview
        const currLiveDoc = LiveDevMultiBrowser.getCurrentLiveDoc();
        if(!currLiveDoc) {
            return;
        }

        const editor = currLiveDoc.editor;
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
