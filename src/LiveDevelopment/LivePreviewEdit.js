define(function (require, exports, module) {
    const HTMLInstrumentation = require("LiveDevelopment/MultiBrowserImpl/language/HTMLInstrumentation");
    const LiveDevMultiBrowser = require("LiveDevelopment/LiveDevMultiBrowser");
    const CodeMirror = require("thirdparty/CodeMirror/lib/codemirror");

    /**
     * This function is to sync text content changes between the original source code
     * and the live preview DOM after a text edit operation
     *
     * @param {String} oldContent - the original source code from the editor
     * @param {String} newContent - the DOM element's outerHTML after editing in live preview
     * @returns {String} - the updated content that should replace the original code in the editor
     *
     * NOTE: This function is a bit complex to read, read this jsdoc to understand the flow:
     *
     * First, we parse both the old and new content using DOMParser to get proper HTML DOM structures
     * Then we compare each element and text node between the old and new content
     *
     * the main goal is that we ONLY want to update text content, and not element nodes or their attributes
     * because if we allow element/attribute changes, the browser might try to fix the HTML
     * to make it syntactically correct or to make it efficient, which would mess up the user's original code
     * We don't want that - we need to respect how the user wrote their code
     * For example: if user wrote <div style="color: red blue green yellow"></div>
     * The browser sees this is invalid CSS and would remove the color attribute entirely
     * We want to keep that invalid code as it is because it's what the user wanted to do
     *
     * Here's how the comparison works:
     * - if both nodes are text: update the old text with the new text
     * - if both nodes are elements: we recursively check their children (for nested content)
     * - if old is text, new is element: replace text with element (like when user adds <br>)
     * - if old is element, new is text: replace element with text (like when user removes <br>)
     * note: when adding new elements (like <br> tags), we only copy the tag name and content,
     *   never the attributes, to avoid internal Phoenix properties leaking into user's code
     */
    function _syncTextContentChanges(oldContent, newContent) {
        const parser = new DOMParser();
        const oldDoc = parser.parseFromString(oldContent, "text/html");
        const newDoc = parser.parseFromString(newContent, "text/html");

        // as DOM parser will add the complete html structure with the HTML tags and all,
        // so we just need to get the main content
        const oldRoot = oldDoc.body;
        const newRoot = newDoc.body;

        // here oldNode and newNode are full HTML elements which are direct children of the body tag
        function syncText(oldNode, newNode) {
            if (!oldNode || !newNode) {
                return;
            }

            // if both the oldNode and newNode has text, replace the old node's text content with the new one
            if (oldNode.nodeType === Node.TEXT_NODE && newNode.nodeType === Node.TEXT_NODE) {
                oldNode.nodeValue = newNode.nodeValue;

            } else if (
                // if both have element node, then we recursively get their child elements
                // this is so that we can get & update the text content in deeply nested DOM
                oldNode.nodeType === Node.ELEMENT_NODE &&
                newNode.nodeType === Node.ELEMENT_NODE
            ) {

                const oldChildren = oldNode.childNodes;
                const newChildren = newNode.childNodes;

                const minLength = Math.min(oldChildren.length, newChildren.length);

                for (let i = 0; i < minLength; i++) {
                    syncText(oldChildren[i], newChildren[i]);
                }

                // append if there are any new nodes, this is mainly when <br> tags needs to be inserted
                // as user pressed shift + enter to create empty lines in the new content
                for (let i = minLength; i < newChildren.length; i++) {
                    const newChild = newChildren[i];
                    let cleanChild;

                    if (newChild.nodeType === Node.ELEMENT_NODE) {
                        // only the element name and not its attributes
                        // this is to prevent internal properties like data-brackets-id, etc to appear in users code
                        cleanChild = document.createElement(newChild.tagName);
                        cleanChild.innerHTML = newChild.innerHTML;
                    } else {
                        // for text nodes, comment nodes, etc. clone normally
                        cleanChild = newChild.cloneNode(true);
                    }

                    oldNode.appendChild(cleanChild);
                }

                // remove extra old nodes (maybe extra <br>'s were removed)
                for (let i = oldChildren.length - 1; i >= newChildren.length; i--) {
                    oldNode.removeChild(oldChildren[i]);
                }

            } else if (oldNode.nodeType === Node.TEXT_NODE && newNode.nodeType === Node.ELEMENT_NODE) {
                // when old has text node and new has element node
                // this generally happens when we remove the complete content which results in empty <br> tag
                // for ex: <div>hello</div>, here if we remove the 'hello' from live preview then result will be
                // <div><br></div>
                const replacement = document.createElement(newNode.tagName);
                replacement.innerHTML = newNode.innerHTML;
                oldNode.parentNode.replaceChild(replacement, oldNode);
            } else if (oldNode.nodeType === Node.ELEMENT_NODE && newNode.nodeType === Node.TEXT_NODE) {
                // this is opposite of previous one when earlier it was just <br> or some tag
                // and now we add text content in that
                const replacement = document.createTextNode(newNode.nodeValue);
                oldNode.parentNode.replaceChild(replacement, oldNode);
            }
        }

        const oldEls = oldRoot.children;
        const newEls = newRoot.children;

        for (let i = 0; i < Math.min(oldEls.length, newEls.length); i++) {
            syncText(oldEls[i], newEls[i]);
        }

        return oldRoot.innerHTML;
    }

    /**
     * this function handles the text edit in the source code when user updates the text in the live preview
     *
     * @param {Object} message - the message object
     *   - livePreviewEditEnabled: true
     *   - livePreviewTextEdit: true
     *   - element: element
     *   - newContent: element.outerHTML (the edited content from live preview)
     *   - tagId: Number (data-brackets-id of the edited element)
     *   - isEditSuccessful: boolean (false when user pressed Escape to cancel, otherwise true always)
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
        // for empty tags endRange.close might not exist, for ex: img tag
        const endPos = endRange.close ? endRange.close.to : endRange.open.to;

        const text = editor.getTextBetween(startPos, endPos);

        // if the edit was cancelled (mainly by pressing Escape key)
        // we just replace the same text with itself
        // this is a quick trick because as the code is changed for that element in the file,
        // the live preview for that element gets refreshed and the changes are discarded in the live preview
        if(!message.isEditSuccessful) {
            editor.replaceRange(text, startPos, endPos);
        } else {

            // if the edit operation was successful, we call a helper function that
            // is responsible to provide the actual content that needs to be written in the editor
            //
            // text: the actual current source code in the editor
            // message.newContent: the new content in the live preview after the edit operation
            const finalText = _syncTextContentChanges(text, message.newContent);
            editor.replaceRange(finalText, startPos, endPos);
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
        // for empty tags endRange.close might not exist, for ex: img tag
        const endPos = endRange.close ? endRange.close.to : endRange.open.to;

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
        // for empty tags endRange.close might not exist, for ex: img tag
        const endPos = endRange.close ? endRange.close.to : endRange.open.to;

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
     * this function is to clean up the empty lines after an element is removed
     * @param {Object} editor - the editor instance
     * @param {Object} range - the range where element was removed
     */
    function _cleanupAfterRemoval(editor, range) {
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

    /**
     * this function is to make sure that we insert elements with proper indentation
     *
     * @param {Object} editor - the editor instance
     * @param {Object} insertPos - position where to insert
     * @param {Boolean} insertAfterMode - whether to insert after the position
     * @param {String} targetIndent - the indentation to use
     * @param {String} sourceText - the text to insert
     */
    function _insertElementWithIndentation(editor, insertPos, insertAfterMode, targetIndent, sourceText) {
        if (insertAfterMode) {
            // Insert after the target element
            editor.replaceRange("\n" + targetIndent + sourceText, insertPos);
        } else {
            // Insert before the target element
            const insertLine = insertPos.line;
            const lineStart = { line: insertLine, ch: 0 };

            // Get current line content to preserve any existing indentation structure
            const currentLine = editor.getLine(insertLine);

            if (currentLine && currentLine.trim() === "") {
                // the line is empty, replace it entirely
                editor.replaceRange(targetIndent + sourceText, lineStart, { line: insertLine, ch: currentLine.length });
            } else {
                // the line has content, insert before it
                editor.replaceRange(targetIndent + sourceText + "\n", lineStart);
            }
        }
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

        // get the start range from the getPositionFromTagId function
        // and we get the end range from the findMatchingTag function
        // NOTE: we cannot get the end range from getPositionFromTagId
        // because on non-beautified code getPositionFromTagId may not provide correct end position
        const sourceStartRange = HTMLInstrumentation.getPositionFromTagId(editor, sourceId);
        if(!sourceStartRange) {
            return;
        }

        const sourceEndRange = CodeMirror.findMatchingTag(editor._codeMirror, sourceStartRange.from);
        if (!sourceEndRange) {
            return;
        }

        const targetStartRange = HTMLInstrumentation.getPositionFromTagId(editor, targetId);
        if(!targetStartRange) {
            return;
        }

        const targetEndRange = CodeMirror.findMatchingTag(editor._codeMirror, targetStartRange.from);
        if (!targetEndRange) {
            return;
        }

        const sourceRange = {
            from: sourceStartRange.from,
            to: sourceEndRange.close ? sourceEndRange.close.to : sourceEndRange.open.to
        };

        const targetRange = {
            from: targetStartRange.from,
            to: targetEndRange.close ? targetEndRange.close.to : targetEndRange.open.to
        };

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

        // creating a batch operation so that undo in live preview works fine
        editor.document.batchOperation(function () {
            if (sourceBeforeTarget) {
                // this handles the case when source is before target: insert first, then remove
                if (insertAfter) {
                    const insertPos = {
                        line: targetRange.to.line,
                        ch: targetRange.to.ch
                    };
                    _insertElementWithIndentation(editor, insertPos, true, targetIndent, sourceText);
                } else {
                    // insert before target
                    _insertElementWithIndentation(editor, targetRange.from, false, targetIndent, sourceText);
                }

                // Now remove the source element (NOTE: the positions have shifted)
                const updatedSourceStartRange = HTMLInstrumentation.getPositionFromTagId(editor, sourceId);
                if (updatedSourceStartRange) {
                    const updatedSourceEndRange = CodeMirror.findMatchingTag(
                        editor._codeMirror, updatedSourceStartRange.from
                    );

                    if (updatedSourceEndRange) {
                        const updatedSourceRange = {
                            from: updatedSourceStartRange.from,
                            to: updatedSourceEndRange.close
                                ? updatedSourceEndRange.close.to
                                : updatedSourceEndRange.open.to
                        };
                        editor.replaceRange("", updatedSourceRange.from, updatedSourceRange.to);
                        _cleanupAfterRemoval(editor, updatedSourceRange);
                    }
                }
            } else {
                // This handles the case when target is before source: remove first, then insert
                // Store source range before removal
                const originalSourceRange = { ...sourceRange };

                // Remove the source element first
                editor.replaceRange("", sourceRange.from, sourceRange.to);
                _cleanupAfterRemoval(editor, originalSourceRange);

                // Recalculate target range after source removal as the positions have shifted
                const updatedTargetStartRange = HTMLInstrumentation.getPositionFromTagId(editor, targetId);
                if (!updatedTargetStartRange) {
                    return;
                }

                const updatedTargetEndRange = CodeMirror.findMatchingTag(
                    editor._codeMirror, updatedTargetStartRange.from
                );

                if (!updatedTargetEndRange) {
                    return;
                }

                const updatedTargetRange = {
                    from: updatedTargetStartRange.from,
                    to: updatedTargetEndRange.close ? updatedTargetEndRange.close.to : updatedTargetEndRange.open.to
                };

                if (insertAfter) {
                    const insertPos = {
                        line: updatedTargetRange.to.line,
                        ch: updatedTargetRange.to.ch
                    };
                    _insertElementWithIndentation(editor, insertPos, true, targetIndent, sourceText);
                } else {
                    // Insert before target
                    _insertElementWithIndentation(editor, updatedTargetRange.from, false, targetIndent, sourceText);
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
