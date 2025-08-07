define(function (require, exports, module) {
    const HTMLInstrumentation = require("LiveDevelopment/MultiBrowserImpl/language/HTMLInstrumentation");
    const LiveDevMultiBrowser = require("LiveDevelopment/LiveDevMultiBrowser");
    const CodeMirror = require("thirdparty/CodeMirror/lib/codemirror");

    /**
     * This function syncs text content changes between the original source code
     * and the live preview DOM after a text edit in the browser
     *
     * @private
     * @param {String} oldContent - the original source code from the editor
     * @param {String} newContent - the outerHTML after editing in live preview
     * @returns {String} - the updated content that should replace the original editor code
     *
     * NOTE: We don’t touch tag names or attributes —
     * we only care about text changes or things like newlines, <br>, or formatting like <b>, <i>, etc.
     *
     * Here's the basic idea:
     * - Parse both old and new HTML strings into DOM trees
     * - Then walk both DOMs side by side and sync changes
     *
     * What we handle:
     * - if both are text nodes → update the text if changed
     * - if both are elements with same tag → go deeper and sync their children
     * - if one is text and one is an element → replace (like when user adds/removes <br> or adds bold/italic)
     * - if a node got added or removed → do that in the old DOM
     *
     * We don’t recreate or touch existing elements unless absolutely needed,
     * so all original user-written attributes and tag structure stay exactly the same.
     *
     * This avoids the browser trying to “fix” broken HTML (which we don’t want)
     */
    function _syncTextContentChanges(oldContent, newContent) {
        const parser = new DOMParser();
        const oldDoc = parser.parseFromString(oldContent, "text/html");
        const newDoc = parser.parseFromString(newContent, "text/html");

        const oldRoot = oldDoc.body;
        const newRoot = newDoc.body;

        // this function is to remove the phoenix internal attributes from leaking into the user's source code
        function cleanClonedElement(clonedElement) {
            if (clonedElement.nodeType === Node.ELEMENT_NODE) {
                clonedElement.removeAttribute("data-brackets-id");

                const children = clonedElement.querySelectorAll("[data-brackets-id]");
                children.forEach(child => child.removeAttribute("data-brackets-id"));
            }
            return clonedElement;
        }

        function syncText(oldNode, newNode) {
            if (!oldNode || !newNode) {
                return;
            }

            // when both are text nodes, we just need to replace the old text with the new one
            if (oldNode.nodeType === Node.TEXT_NODE && newNode.nodeType === Node.TEXT_NODE) {
                if (oldNode.nodeValue !== newNode.nodeValue) {
                    oldNode.nodeValue = newNode.nodeValue;
                }
                return;
            }

            // when both are elements
            if (oldNode.nodeType === Node.ELEMENT_NODE && newNode.nodeType === Node.ELEMENT_NODE) {
                const oldChildren = Array.from(oldNode.childNodes);
                const newChildren = Array.from(newNode.childNodes);

                const maxLen = Math.max(oldChildren.length, newChildren.length);

                for (let i = 0; i < maxLen; i++) {
                    const oldChild = oldChildren[i];
                    const newChild = newChildren[i];

                    if (!oldChild && newChild) {
                        // if new child added → clone and insert
                        const cloned = newChild.cloneNode(true);
                        oldNode.appendChild(cleanClonedElement(cloned));
                    } else if (oldChild && !newChild) {
                        // if child removed → delete
                        oldNode.removeChild(oldChild);
                    } else if (
                        oldChild.nodeType === newChild.nodeType &&
                        oldChild.nodeType === Node.ELEMENT_NODE &&
                        oldChild.tagName === newChild.tagName
                    ) {
                        // same element tag → sync recursively
                        syncText(oldChild, newChild);
                    } else if (
                        oldChild.nodeType === Node.TEXT_NODE &&
                        newChild.nodeType === Node.TEXT_NODE
                    ) {
                        if (oldChild.nodeValue !== newChild.nodeValue) {
                            oldChild.nodeValue = newChild.nodeValue;
                        }
                    } else {
                        // different node types or tags → replace
                        const cloned = newChild.cloneNode(true);
                        oldNode.replaceChild(cleanClonedElement(cloned), oldChild);
                    }
                }
            }
        }

        const oldEls = Array.from(oldRoot.children);
        const newEls = Array.from(newRoot.children);

        for (let i = 0; i < Math.min(oldEls.length, newEls.length); i++) {
            syncText(oldEls[i], newEls[i]);
        }

        return oldRoot.innerHTML;
    }

    /**
     * helper function to get editor and validate basic requirements
     * @param {Number} tagId - the data-brackets-id of the element
     */
    function _getEditorAndValidate(tagId) {
        const currLiveDoc = LiveDevMultiBrowser.getCurrentLiveDoc();
        if (!currLiveDoc || !currLiveDoc.editor) {
            return null;
        }
        // for undo/redo operations, tagId might not be needed, so we only check it if provided
        if (tagId !== undefined && !tagId) {
            return null;
        }
        return currLiveDoc.editor;
    }

    /**
     * helper function to get element range from tagId
     *
     * @param {Object} editor - the editor instance
     * @param {Number} tagId - the data-brackets-id of the element
     * @returns {Object|null} - object with startPos and endPos, or null if not found
     */
    function _getElementRange(editor, tagId) {
        // get the start range from the getPositionFromTagId function
        // and we get the end range from the findMatchingTag function
        // NOTE: we cannot get the end range from getPositionFromTagId
        // because on non-beautified code getPositionFromTagId may not provide correct end position
        const startRange = HTMLInstrumentation.getPositionFromTagId(editor, tagId);
        if(!startRange) {
            return null;
        }

        const endRange = CodeMirror.findMatchingTag(editor._codeMirror, startRange.from);
        if (!endRange) {
            return null;
        }

        const startPos = startRange.from;
        // for empty tags endRange.close might not exist, for ex: img tag
        const endPos = endRange.close ? endRange.close.to : endRange.open.to;

        return { startPos, endPos };
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
        const editor = _getEditorAndValidate(message.tagId);
        if (!editor) {
            return;
        }

        const range = _getElementRange(editor, message.tagId);
        if (!range) {
            return;
        }

        const { startPos, endPos } = range;

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
        const editor = _getEditorAndValidate(tagId);
        if (!editor) {
            return;
        }

        const range = _getElementRange(editor, tagId);
        if (!range) {
            return;
        }

        const { startPos, endPos } = range;

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
        const editor = _getEditorAndValidate(tagId);
        if (!editor) {
            return;
        }

        const range = _getElementRange(editor, tagId);
        if (!range) {
            return;
        }

        const { startPos, endPos } = range;

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
     * @param {Boolean} insertInside - whether to insert the source element as a child of the target element
     */
    function _moveElementInSource(sourceId, targetId, insertAfter, insertInside = false) {
        // this is to get the currently live document that is being served in the live preview
        const editor = _getEditorAndValidate(sourceId);
        if (!editor || !targetId) {
            return;
        }

        const sourceRange = _getElementRange(editor, sourceId);
        if (!sourceRange) {
            return;
        }

        const targetRange = _getElementRange(editor, targetId);
        if (!targetRange) {
            return;
        }

        // convert to the format expected by the rest of the function
        const sourceRangeObj = {
            from: sourceRange.startPos,
            to: sourceRange.endPos
        };

        const targetRangeObj = {
            from: targetRange.startPos,
            to: targetRange.endPos
        };

        const sourceText = editor.getTextBetween(sourceRangeObj.from, sourceRangeObj.to);
        const targetIndent = editor.getTextBetween({ line: targetRangeObj.from.line, ch: 0 }, targetRangeObj.from);

        // Check if source is before target to determine order of operations
        // check if the source is before target or after the target
        // we need this because
        // If source is before target → we need to insert first, then remove
        // If target is before source → remove first, then insert
        const sourceBeforeTarget =
            sourceRangeObj.from.line < targetRangeObj.from.line ||
            (sourceRangeObj.from.line === targetRangeObj.from.line && sourceRangeObj.from.ch < targetRangeObj.from.ch);

        // creating a batch operation so that undo in live preview works fine
        editor.document.batchOperation(function () {
            if (sourceBeforeTarget) {
                // this handles the case when source is before target: insert first, then remove
                if (insertInside) {
                    // Insert as child inside the target element
                    const targetText = editor.getTextBetween(targetRangeObj.from, targetRangeObj.to);
                    const targetElement = targetText.trim();

                    // Find the position just after the opening tag
                    const openingTagMatch = targetElement.match(/^<[^>]*>/);
                    if (openingTagMatch) {
                        const openingTag = openingTagMatch[0];
                        const insertPos = {
                            line: targetRangeObj.from.line,
                            ch: targetRangeObj.from.ch + openingTag.length
                        };

                        // Add proper indentation for child element
                        const childIndent = targetIndent + "    "; // 4 spaces more than parent
                        _insertElementWithIndentation(editor, insertPos, true, childIndent, sourceText);
                    }
                } else if (insertAfter) {
                    const insertPos = {
                        line: targetRangeObj.to.line,
                        ch: targetRangeObj.to.ch
                    };
                    _insertElementWithIndentation(editor, insertPos, true, targetIndent, sourceText);
                } else {
                    // insert before target
                    _insertElementWithIndentation(editor, targetRangeObj.from, false, targetIndent, sourceText);
                }

                // Now remove the source element (NOTE: the positions have shifted)
                const updatedSourceRange = _getElementRange(editor, sourceId);
                if (updatedSourceRange) {
                    const updatedSourceRangeObj = {
                        from: updatedSourceRange.startPos,
                        to: updatedSourceRange.endPos
                    };
                    editor.replaceRange("", updatedSourceRangeObj.from, updatedSourceRangeObj.to);
                    _cleanupAfterRemoval(editor, updatedSourceRangeObj);
                }
            } else {
                // This handles the case when target is before source: remove first, then insert
                // Store source range before removal
                const originalSourceRange = { ...sourceRangeObj };

                // Remove the source element first
                editor.replaceRange("", sourceRangeObj.from, sourceRangeObj.to);
                _cleanupAfterRemoval(editor, originalSourceRange);

                // Recalculate target range after source removal as the positions have shifted
                const updatedTargetRange = _getElementRange(editor, targetId);
                if (!updatedTargetRange) {
                    return;
                }

                const updatedTargetRangeObj = {
                    from: updatedTargetRange.startPos,
                    to: updatedTargetRange.endPos
                };

                if (insertInside) {
                    // Insert as child inside the target element
                    const targetText = editor.getTextBetween(updatedTargetRangeObj.from, updatedTargetRangeObj.to);
                    const targetElement = targetText.trim();

                    // Find the position just after the opening tag
                    const openingTagMatch = targetElement.match(/^<[^>]*>/);
                    if (openingTagMatch) {
                        const openingTag = openingTagMatch[0];
                        const insertPos = {
                            line: updatedTargetRangeObj.from.line,
                            ch: updatedTargetRangeObj.from.ch + openingTag.length
                        };

                        // Add proper indentation for child element
                        const childIndent = targetIndent + "    "; // 4 spaces more than parent
                        _insertElementWithIndentation(editor, insertPos, true, childIndent, sourceText);
                    }
                } else if (insertAfter) {
                    const insertPos = {
                        line: updatedTargetRangeObj.to.line,
                        ch: updatedTargetRangeObj.to.ch
                    };
                    _insertElementWithIndentation(editor, insertPos, true, targetIndent, sourceText);
                } else {
                    // Insert before target
                    _insertElementWithIndentation(editor, updatedTargetRangeObj.from, false, targetIndent, sourceText);
                }
            }
        });
    }

    /**
     * This function is to handle the undo redo operation in the live preview
     * @param {String} undoOrRedo - "undo" when to undo, and "redo" for redo
     */
    function handleUndoRedoOperation(undoOrRedo) {
        const editor = _getEditorAndValidate(); // no tagId needed for undo/redo
        if (!editor) {
            return;
        }

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
            _moveElementInSource(message.sourceId, message.targetId, message.insertAfter, message.insertInside);
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
