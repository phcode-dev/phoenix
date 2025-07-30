define(function (require, exports, module) {
    const HTMLInstrumentation = require("LiveDevelopment/MultiBrowserImpl/language/HTMLInstrumentation");
    const LiveDevMultiBrowser = require("LiveDevelopment/LiveDevMultiBrowser");
    const CodeMirror = require("thirdparty/CodeMirror/lib/codemirror");

    /**
     * this is a helper function to find the content boundaries in HTML
     * @param {string} html - The HTML string to parse
     * @return {Object} - Object with openTag and closeTag properties
     */
    function _findContentBoundaries(html) {
        const openTagEnd = html.indexOf(">") + 1;
        const closeTagStart = html.lastIndexOf("<");

        if (openTagEnd > 0 && closeTagStart >= openTagEnd) {
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
        if (!currLiveDoc || !currLiveDoc.editor || !message.tagId) {
            return;
        }

        const editor = currLiveDoc.editor;
        // get the start range from the getPositionFromTagId function
        // and we get the end range from the findMatchingTag function
        // NOTE: we cannot get the end range from getPositionFromTagId
        // because on non-beautified code getPositionFromTagId may not provide correct end position
        const startRange = HTMLInstrumentation.getPositionFromTagId(editor, message.tagId);
        if(!startRange) {
            return;
        }

        const endRange = CodeMirror.findMatchingTag(editor._codeMirror, startRange.from);
        if (!endRange) {
            return;
        }

        const startPos = startRange.from;
        const endPos = endRange.close.to;

        const text = editor.getTextBetween(startPos, endPos);
        let splittedText;

        // we need to find the content boundaries to find exactly where the content starts and where it ends
        const boundaries = _findContentBoundaries(text);
        if (boundaries) {
            splittedText = [boundaries.openTag, boundaries.closeTag];
        }

        // if the text split was done successfully, apply the edit
        if (splittedText && splittedText.length === 2) {
            const finalText = splittedText[0] + message.newContent + splittedText[1];
            editor.replaceRange(finalText, startPos, endPos);
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
        if (!currLiveDoc) {
            return;
        }

        const editor = currLiveDoc.editor;
        if (!editor || !tagId) {
            return;
        }

        // get the start range from the getPositionFromTagId function
        // and we get the end range from the findMatchingTag function
        // NOTE: we cannot get the end range from getPositionFromTagId
        // because on non-beautified code getPositionFromTagId may not provide correct end position
        const startRange = HTMLInstrumentation.getPositionFromTagId(editor, tagId);
        if(!startRange) {
            return;
        }

        const endRange = CodeMirror.findMatchingTag(editor._codeMirror, startRange.from);
        if (!endRange) {
            return;
        }

        const startPos = startRange.from;
        const endPos = endRange.close.to;

        // this is the actual source code for the element that we need to duplicate
        const text = editor.getTextBetween(startPos, endPos);
        // this is the indentation on the line
        const indent = editor.getTextBetween({ line: startPos.line, ch: 0 }, startPos);

        editor.document.batchOperation(function () {
            // make sure there is only indentation and no text before it
            if (indent.trim() === "") {
                // this is the position where we need to insert
                // we're giving the char as 0 because since we insert a new line using '\n'
                // that's why writing any char value will not work, as the line is emptys
                // and codemirror doesn't allow to insert at a column (ch) greater than the length of the line
                // So, the logic is to just append the indent before the text at this insertPos
                const insertPos = {
                    line: startPos.line + (endPos.line - startPos.line + 1),
                    ch: 0
                };

                editor.replaceRange("\n", endPos);
                editor.replaceRange(indent + text, insertPos);
            } else {
                // if there is some text, we just add the duplicated text right next to it
                editor.replaceRange(text, startPos);
            }
        });
    }

    /**
     * This function is responsible to delete an element from the source code
     * @param {Number} tagId - the data-brackets-id of the DOM element
     */
    function _deleteElementInSourceByTagId(tagId) {
        // this is to get the currently live document that is being served in the live preview
        const currLiveDoc = LiveDevMultiBrowser.getCurrentLiveDoc();
        if (!currLiveDoc) {
            return;
        }

        const editor = currLiveDoc.editor;
        if (!editor || !tagId) {
            return;
        }

        // get the start range from the getPositionFromTagId function
        // and we get the end range from the findMatchingTag function
        // NOTE: we cannot get the end range from getPositionFromTagId
        // because on non-beautified code getPositionFromTagId may not provide correct end position
        const startRange = HTMLInstrumentation.getPositionFromTagId(editor, tagId);
        if(!startRange) {
            return;
        }

        const endRange = CodeMirror.findMatchingTag(editor._codeMirror, startRange.from);
        if (!endRange) {
            return;
        }

        const startPos = startRange.from;
        const endPos = endRange.close.to;

        editor.document.batchOperation(function () {
            editor.replaceRange("", startPos, endPos);

            // since we remove content from the source, we want to clear the extra line
            if(startPos.line !== 0 && !(editor.getLine(startPos.line).trim())) {
                const prevLineText = editor.getLine(startPos.line - 1);
                const chPrevLine = prevLineText ? prevLineText.length : 0;
                editor.replaceRange("", {line: startPos.line - 1, ch: chPrevLine}, startPos);
            }
        });
    }

    /**
     * This function is responsible for moving an element from one position to another in the source code
     * it is called when there is drag-drop in the live preview
     * @param {Number} sourceId - the data-brackets-id of the element being moved
     * @param {Number} targetId - the data-brackets-id of the target element where to move
     * @param {Boolean} insertAfter - whether to insert the source element after the target element
     */
    function _moveElementInSource(sourceId, targetId, insertAfter) {
        // this is to get the currently live document that is being served in the live preview
        const currLiveDoc = LiveDevMultiBrowser.getCurrentLiveDoc();
        if (!currLiveDoc) {
            return;
        }

        const editor = currLiveDoc.editor;
        if (!editor || !sourceId || !targetId) {
            return;
        }

        // position of source and target elements in the editor
        const sourceRange = HTMLInstrumentation.getPositionFromTagId(editor, sourceId);
        const targetRange = HTMLInstrumentation.getPositionFromTagId(editor, targetId);

        if (!sourceRange || !targetRange) {
            return;
        }

        const sourceText = editor.getTextBetween(sourceRange.from, sourceRange.to);
        const targetIndent = editor.getTextBetween({ line: targetRange.from.line, ch: 0 }, targetRange.from);

        // Check if source is before target to determine order of operations
        // check if the source is before target or after the target
        // we need this because
        // If source is before target → we need to insert first, then remove
        // If target is before source → remove first, then insert
        const sourceBeforeTarget =
            sourceRange.from.line < targetRange.from.line ||
            (sourceRange.from.line === targetRange.from.line && sourceRange.from.ch < targetRange.from.ch);

        // this function is to clean up the empty lines after an element is removed
        function cleanupAfterRemoval(range) {
            const lineToCheck = range.from.line;

            // check if the line where element was removed is now empty
            if (lineToCheck < editor.lineCount()) {
                const currentLineText = editor.getLine(lineToCheck);
                if (currentLineText && currentLineText.trim() === "") {
                    // remove the empty line
                    const lineStart = { line: lineToCheck, ch: 0 };
                    const lineEnd = { line: lineToCheck + 1, ch: 0 };
                    editor.replaceRange("", lineStart, lineEnd);
                }
            }

            // also we need to check the previous line if it became empty
            if (lineToCheck > 0) {
                const prevLineText = editor.getLine(lineToCheck - 1);
                if (prevLineText && prevLineText.trim() === "") {
                    const lineStart = { line: lineToCheck - 1, ch: 0 };
                    const lineEnd = { line: lineToCheck, ch: 0 };
                    editor.replaceRange("", lineStart, lineEnd);
                }
            }
        }

        // this function is to make sure that we insert elements with proper indentation
        function insertElementWithIndentation(insertPos, insertAfterMode, useTargetIndent) {
            const indent = useTargetIndent ? targetIndent : targetIndent;

            if (insertAfterMode) {
                // Insert after the target element
                editor.replaceRange("\n" + indent + sourceText, insertPos);
            } else {
                // Insert before the target element
                const insertLine = insertPos.line;
                const lineStart = { line: insertLine, ch: 0 };

                // Get current line content to preserve any existing indentation structure
                const currentLine = editor.getLine(insertLine);

                if (currentLine && currentLine.trim() === "") {
                    // the line is empty, replace it entirely
                    editor.replaceRange(indent + sourceText, lineStart, { line: insertLine, ch: currentLine.length });
                } else {
                    // the line has content, insert before it
                    editor.replaceRange(indent + sourceText + "\n", lineStart);
                }
            }
        }

        // creating a batch operation so that undo in live preview works fine
        editor.document.batchOperation(function () {
            if (sourceBeforeTarget) {
                // this handles the case when source is before target: insert first, then remove
                if (insertAfter) {
                    const insertPos = {
                        line: targetRange.to.line,
                        ch: targetRange.to.ch
                    };
                    insertElementWithIndentation(insertPos, true, true);
                } else {
                    // insert before target
                    insertElementWithIndentation(targetRange.from, false, true);
                }

                // Now remove the source element (NOTE: the positions have shifted)
                const updatedSourceRange = HTMLInstrumentation.getPositionFromTagId(editor, sourceId);
                if (updatedSourceRange) {
                    editor.replaceRange("", updatedSourceRange.from, updatedSourceRange.to);
                    cleanupAfterRemoval(updatedSourceRange);
                }
            } else {
                // This handles the case when target is before source: remove first, then insert
                // Store source range before removal
                const originalSourceRange = { ...sourceRange };

                // Remove the source element first
                editor.replaceRange("", sourceRange.from, sourceRange.to);
                cleanupAfterRemoval(originalSourceRange);

                // Recalculate target range after source removal as the positions have shifted
                const updatedTargetRange = HTMLInstrumentation.getPositionFromTagId(editor, targetId);
                if (!updatedTargetRange) {
                    return;
                }

                if (insertAfter) {
                    const insertPos = {
                        line: updatedTargetRange.to.line,
                        ch: updatedTargetRange.to.ch
                    };
                    insertElementWithIndentation(insertPos, true, true);
                } else {
                    // Insert before target
                    insertElementWithIndentation(updatedTargetRange.from, false, true);
                }
            }
        });
    }

    /**
     * This function is to handle the undo redo operation in the live preview
     * @param {String} undoOrRedo - "undo" when to undo, and "redo" for redo
     */
    function handleUndoRedoOperation(undoOrRedo) {
        const currLiveDoc = LiveDevMultiBrowser.getCurrentLiveDoc();
        if (!currLiveDoc || !currLiveDoc.editor) {
            return;
        }

        const editor = currLiveDoc.editor;

        if (undoOrRedo === "undo") {
            editor.undo();
        } else if (undoOrRedo === "redo") {
            editor.redo();
        }
    }

    /**
     * This is the main function that is exported.
     * it will be called by LiveDevProtocol when it receives a message from RemoteFunctions.js
     * or LiveDevProtocolRemote.js (for undo) using MessageBroker
     * Refer to: `handleOptionClick` function in the RemoteFunctions.js and `_receive` function in LiveDevProtocol.js
     *
     * @param {Object} message - this is the object that is passed by RemoteFunctions.js using MessageBroker
     * this object will be in the format
     * {
                livePreviewEditEnabled: true,
                tagId: tagId,
                delete || duplicate || livePreviewTextEdit: true
                undoLivePreviewOperation: true (this property is available only for undo operation)

                sourceId: sourceId, (these are for move (drag & drop))
                targetId: targetId,
                insertAfter: boolean, (whether to insert after the target element)
                move: true
        }
    * these are the main properties that are passed through the message
     */
    function handleLivePreviewEditOperation(message) {
        // handle move(drag & drop)
        if (message.move && message.sourceId && message.targetId) {
            _moveElementInSource(message.sourceId, message.targetId, message.insertAfter);
            return;
        }

        if (!message.element || !message.tagId) {
            // check for undo
            if (message.undoLivePreviewOperation || message.redoLivePreviewOperation) {
                message.undoLivePreviewOperation ? handleUndoRedoOperation("undo") : handleUndoRedoOperation("redo");
            }
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
