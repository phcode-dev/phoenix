/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 * Original work Copyright (c) 2012 - 2021 Adobe Systems Incorporated. All rights reserved.
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

/*
 * This file handles all the editor side source code handling after user performed some live preview edit operation
 * when any operation is performed in the browser context (handled inside remoteFunctions.js) it sends a message through
 * MessageBroker, now this file then makes the change in the source code
 */
define(function (require, exports, module) {
    const HTMLInstrumentation = require("LiveDevelopment/MultiBrowserImpl/language/HTMLInstrumentation");
    const LiveDevMultiBrowser = require("LiveDevelopment/LiveDevMultiBrowser");
    const CodeMirror = require("thirdparty/CodeMirror/lib/codemirror");
    const ProjectManager = require("project/ProjectManager");
    const FileSystem = require("filesystem/FileSystem");
    const PathUtils = require("thirdparty/path-utils/path-utils");
    const StringMatch = require("utils/StringMatch");
    const Dialogs = require("widgets/Dialogs");
    const StateManager = require("preferences/StateManager");
    const ProDialogs = require("services/pro-dialogs");
    const Mustache = require("thirdparty/mustache/mustache");
    const Strings = require("strings");
    const ImageFolderDialogTemplate = require("text!htmlContent/image-folder-dialog.html");

    // state manager key, to save the download location of the image
    const IMAGE_DOWNLOAD_FOLDER_KEY = "imageGallery.downloadFolder";

    const KernalModeTrust = window.KernalModeTrust;
    if(!KernalModeTrust){
        // integrated extensions will have access to kernal mode, but not external extensions
        throw new Error("LivePreviewEdit.js should have access to KernalModeTrust. Cannot boot without trust ring");
    }

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
                // this are phoenix's internal attributes
                const attrs = ["data-brackets-id", "data-ld-highlight"];

                // remove from the cloned element
                attrs.forEach(attr => clonedElement.removeAttribute(attr));

                // also remove from its childrens
                clonedElement.querySelectorAll(attrs.map(a => `[${a}]`).join(","))
                    .forEach(el => attrs.forEach(attr => el.removeAttribute(attr)));
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
            editor.document.batchOperation(function () {
                editor.replaceRange(text, startPos, endPos);
                setTimeout(() => {
                    editor.undo(); // undo the replaceRange so dirty icon won't appear and no net change in undo history
                }, 0);
            });
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
     * This function is to make sure that the target element doesn't lie completely within the source element
     * because if that is the case then it means that the drag-drop was not performed correctly
     *
     * @param {Object} source - start/end pos of the source element
     * @param {Object} target - start/end pos of the target element
     * @returns {Boolean} true if target is fully inside source, false otherwise
     */
    function _targetInsideSource(source, target) {
        if (
            (source.from.line < target.from.line ||
            (source.from.line === target.from.line && source.from.ch <= target.from.ch)) &&
            (source.to.line > target.to.line ||
            (source.to.line === target.to.line && source.to.ch >= target.to.ch))
        ) {
            return true;
        }

        return false;
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

        // make sure that the target is not within the source
        // this would otherwise remove both source and target, breaking the document
        if (_targetInsideSource(sourceRangeObj, targetRangeObj)) {
            return;
        }

        const sourceText = editor.getTextBetween(sourceRangeObj.from, sourceRangeObj.to);
        let targetIndent = editor.getTextBetween({ line: targetRangeObj.from.line, ch: 0 }, targetRangeObj.from);
        if(targetIndent && targetIndent.trim() !== "") { // because indentation should hold no text
            let indentLength = targetIndent.search(/\S/);
            if (indentLength === -1) {
                indentLength = targetIndent.length;
            }
            targetIndent = ' '.repeat(indentLength);
        }

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
                    const matchingTagInfo = CodeMirror.findMatchingTag(editor._codeMirror, targetRangeObj.from);
                    if (matchingTagInfo && matchingTagInfo.open) {
                        const insertPos = {
                            line: matchingTagInfo.open.to.line,
                            ch: matchingTagInfo.open.to.ch
                        };

                        const indentInfo = editor._detectIndent();
                        const childIndent = targetIndent + indentInfo.indent;
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
                    const matchingTagInfo = CodeMirror.findMatchingTag(editor._codeMirror, updatedTargetRangeObj.from);
                    if (matchingTagInfo && matchingTagInfo.open) {
                        const insertPos = {
                            line: matchingTagInfo.open.to.line,
                            ch: matchingTagInfo.open.to.ch
                        };

                        const indentInfo = editor._detectIndent();
                        const childIndent = targetIndent + indentInfo.indent;
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

    function _getRequiredDataForAI(message) {
        // this is to get the currently live document that is being served in the live preview
        const editor = _getEditorAndValidate(message.tagId);
        if (!editor) {
            return;
        }

        const range = _getElementRange(editor, message.tagId);
        if (!range) {
            return;
        }

        const { startPos, endPos } = range;
        // this is the actual source code for the element that we need to duplicate
        const text = editor.getTextBetween(startPos, endPos);
        const fileName = editor.document.file.name;
        const filePath = editor.document.file.fullPath;

        const AIData = {
            editor: editor, // the editor instance that is being served in the live preview
            fileName: fileName,
            filePath: filePath, // the complete absolute path
            tagId: message.tagId, // the data-brackets-id of the element which was selected for AI edit
            range: {startPos, endPos}, // the start and end position text in the source code for that element
            text: text, // the actual source code in between the start and the end pos
            prompt: message.prompt, // the prompt that user typed
            model: message.selectedModel // the selected model (fast, slow or moderate)
        };

        return AIData;
    }

    async function _editWithAI(message) {
        const AIData = _getRequiredDataForAI(message);
        const aiEntitlement = await KernalModeTrust.EntitlementsManager.getAIEntitlement();
        if (!aiEntitlement.activated) {
            // Ai is not activated for user(not logged in/no ai plan/disabled by system admin)
            // the showAIUpsellDialog will show an appropriate message for each case.
            ProDialogs.showAIUpsellDialog(aiEntitlement);
            return;
        }
        // todo @abose ai wire in
        console.log(AIData);
    }

    /**
     * this is a helper function to make sure that when saving a new image, there's no existing file with the same name
     * @param {String} basePath - this is the base path where the image will be saved
     * @param {String} filename - the name of the image file
     * @param {String} extnName - the name of the image extension. (defaults to "jpg")
     * @returns {String} - the new file name
     */
    function getUniqueFilename(basePath, filename, extnName) {
        let counter = 0;
        let uniqueFilename = filename + extnName;

        function checkAndIncrement() {
            const filePath = basePath + uniqueFilename;
            const file = FileSystem.getFileForPath(filePath);

            return new Promise((resolve) => {
                file.exists((err, exists) => {
                    if (exists) {
                        counter++;
                        uniqueFilename = `${filename}-${counter}${extnName}`;
                        checkAndIncrement().then(resolve);
                    } else {
                        resolve(uniqueFilename);
                    }
                });
            });
        }

        return checkAndIncrement();
    }

    /**
     * This function updates the src attribute of an image element in the source code
     * @param {Number} tagId - the data-brackets-id of the image element
     * @param {String} newSrcValue - the new src value to set
     */
    function _updateImageSrcAttribute(tagId, newSrcValue) {
        const editor = _getEditorAndValidate(tagId);
        if (!editor) {
            return;
        }

        const range = _getElementRange(editor, tagId);
        if (!range) {
            return;
        }

        const { startPos, endPos } = range;
        const elementText = editor.getTextBetween(startPos, endPos);

        // parse it using DOM parser so that we can update the src attribute
        const parser = new DOMParser();
        const doc = parser.parseFromString(elementText, "text/html");
        const imgElement = doc.querySelector('img');

        if (imgElement) {
            imgElement.setAttribute('src', newSrcValue);
            const updatedElementText = imgElement.outerHTML;

            editor.document.batchOperation(function () {
                editor.replaceRange(updatedElementText, startPos, endPos);
            });
        }
    }

    /**
     * Helper function to update image src attribute and dismiss ribbon gallery
     *
     * @param {Number} tagId - the data-brackets-id of the image element
     * @param {String} targetPath - the full path where the image was saved
     * @param {String} filename - the filename of the saved image
     */
    function _updateImageAndDismissRibbon(tagId, targetPath, filename) {
        const editor = _getEditorAndValidate(tagId);
        if (editor) {
            const htmlFilePath = editor.document.file.fullPath;
            const relativePath = PathUtils.makePathRelative(targetPath, htmlFilePath);
            _updateImageSrcAttribute(tagId, relativePath);
        } else {
            _updateImageSrcAttribute(tagId, filename);
        }

        // dismiss all UI boxes including the image ribbon gallery
        const currLiveDoc = LiveDevMultiBrowser.getCurrentLiveDoc();
        if (currLiveDoc && currLiveDoc.protocol && currLiveDoc.protocol.evaluate) {
            currLiveDoc.protocol.evaluate("_LD.dismissUIAndCleanupState()");
        }
    }

    /**
     * helper function to handle 'upload from computer'
     * @param {Object} message - the message object
     * @param {String} filename - the file name with which we need to save the image
     * @param {Directory} projectRoot - the project root in which the image is to be saved
     */
    function _handleUseThisImageLocalFiles(message, filename, projectRoot) {
        const { tagId, imageData } = message;

        const uint8Array = new Uint8Array(imageData);
        const targetPath = projectRoot.fullPath + filename;

        window.fs.writeFile(targetPath, window.Filer.Buffer.from(uint8Array),
            { encoding: window.fs.BYTE_ARRAY_ENCODING }, (err) => {
                if (err) {
                    console.error('Failed to save image:', err);
                } else {
                    _updateImageAndDismissRibbon(tagId, targetPath, filename);
                }
            });
    }

    /**
     * helper function to handle 'use this image' button click on remote images
     * @param {Object} message - the message object
     * @param {String} filename - the file name with which we need to save the image
     * @param {Directory} projectRoot - the project root in which the image is to be saved
     */
    function _handleUseThisImageRemote(message, filename, projectRoot) {
        const { imageUrl, tagId } = message;

        fetch(imageUrl)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                return response.arrayBuffer();
            })
            .then(arrayBuffer => {
                const uint8Array = new Uint8Array(arrayBuffer);
                const targetPath = projectRoot.fullPath + filename;

                window.fs.writeFile(targetPath, window.Filer.Buffer.from(uint8Array),
                    { encoding: window.fs.BYTE_ARRAY_ENCODING }, (err) => {
                        if (err) {
                            console.error('Failed to save image:', err);
                        } else {
                            _updateImageAndDismissRibbon(tagId, targetPath, filename);
                        }
                    });
            })
            .catch(error => {
                console.error('Failed to fetch image:', error);
            });
    }

    /**
     * Downloads image to the specified folder
     * @private
     * @param {Object} message - The message containing image download info
     * @param {string} folderPath - Relative path to the folder
     */
    function _downloadToFolder(message, folderPath) {
        const projectRoot = ProjectManager.getProjectRoot();
        if (!projectRoot) {
            console.error('No project root found');
            return;
        }

        const filename = message.filename;
        const extnName = message.extnName || "jpg";

        // the folder path should always end with /
        if (!folderPath.endsWith('/')) {
            folderPath += '/';
        }

        const targetPath = projectRoot.fullPath + folderPath;
        const targetDir = FileSystem.getDirectoryForPath(targetPath);

        // the directory name that user wrote, first check if it exists or not
        // if it doesn't exist we create it and then download the image inside it
        targetDir.exists((err, exists) => {
            if (err) { return; }

            if (!exists) {
                targetDir.create((err) => {
                    if (err) { return; }
                    _downloadImageToDirectory(message, filename, extnName, targetDir);
                });
            } else {
                _downloadImageToDirectory(message, filename, extnName, targetDir);
            }
        });
    }

    // these folders are generally very large, and we don't scan them otherwise it might freeze the UI
    const EXCLUDED_FOLDERS = ['node_modules', 'bower_components', '.git', '.npm', '.yarn'];

    /**
     * this function scans all the root directories
     * root directories means those directories that are directly inside the project folder
     * we need this to show when the query is empty
     *
     * @param {Directory} directory - project root directory
     * @param {Array<string>} folderList - array to store discovered root folder paths
     * @return {Promise} Resolves when root scan is complete
     */
    function _scanRootDirectoriesOnly(directory, folderList) {
        return new Promise((resolve) => {
            directory.getContents((err, contents) => {
                if (err) {
                    resolve();
                    return;
                }

                const directories = contents.filter(entry => entry.isDirectory);

                directories.forEach(dir => {
                    // ignore all the excluded folders
                    if (EXCLUDED_FOLDERS.includes(dir.name)) { return; }
                    // add root folder name with trailing slash
                    folderList.push(dir.name + '/');
                });
                resolve();
            });
        });
    }

    /**
     * this function scans all the directories recursively
     * and then add the relative paths of the directories to the folderList array
     *
     * @param {Directory} directory - The parent directory to scan
     * @param {string} relativePath - The relative path from project root
     * @param {Array<string>} folderList - Array to store all discovered folder paths
     * @return {Promise} Resolves when scanning is complete
     */
    function _scanDirectories(directory, relativePath, folderList) {
        return new Promise((resolve) => {
            directory.getContents((err, contents) => {
                if (err) {
                    resolve();
                    return;
                }

                const directories = contents.filter(entry => entry.isDirectory);
                const scanPromises = [];

                directories.forEach(dir => {
                    // if its an excluded folder we ignore it
                    if (EXCLUDED_FOLDERS.includes(dir.name)) {
                        return;
                    }

                    const dirRelativePath = relativePath ? `${relativePath}${dir.name}/` : `${dir.name}/`;
                    folderList.push(dirRelativePath);

                    // also check subdirectories for this dir
                    scanPromises.push(_scanDirectories(dir, dirRelativePath, folderList));
                });

                Promise.all(scanPromises).then(() => resolve());
            });
        });
    }

    /**
     * Renders folder suggestions as a dropdown in the UI with fuzzy match highlighting
     *
     * @param {Array<string|Object>} matches - Array of folder paths (strings) or fuzzy match objects with stringRanges
     * @param {JQuery} $suggestions - jQuery element for the suggestions container
     * @param {JQuery} $input - jQuery element for the input field
     */
    function _renderFolderSuggestions(matches, $suggestions, $input) {
        if (matches.length === 0) {
            $suggestions.empty();
            return;
        }

        let html = '<ul class="folder-suggestions-list">';
        matches.forEach((match, index) => {
            let displayHTML = '';
            let folderPath = '';

            // Check if match is a string or an object
            if (typeof match === 'string') {
                // Simple string (from empty query showing folders)
                displayHTML = match;
                folderPath = match;
            } else if (match && match.stringRanges) {
                // fuzzy match, highlight matched chars
                match.stringRanges.forEach(range => {
                    if (range.matched) {
                        displayHTML += `<span class="folder-match-highlight">${range.text}</span>`;
                    } else {
                        displayHTML += range.text;
                    }
                });
                folderPath = match.label || '';
            }

            // first item should be selected by default
            const selectedClass = index === 0 ? ' selected' : '';
            html += `<li class="folder-suggestion-item${selectedClass}" data-path="${folderPath}">${displayHTML}</li>`;
        });
        html += '</ul>';

        $suggestions.html(html);

        // when a suggestion is clicked we add the folder path in the input box
        $suggestions.find('.folder-suggestion-item').on('click', function() {
            const folderPath = $(this).data('path');
            $input.val(folderPath);
            $suggestions.empty();
        });
    }

    /**
     * This function is responsible to update the folder suggestion everytime a new char is inserted in the input field
     *
     * @param {string} query - The search query from the input field
     * @param {Array<string>} folderList - List of all available folder paths
     * @param {Array<string>} rootFolders - list of root-level folder paths
     * @param {StringMatch.StringMatcher} stringMatcher - StringMatcher instance for fuzzy matching
     * @param {JQuery} $suggestions - jQuery element for the suggestions container
     * @param {JQuery} $input - jQuery element for the input field
     */
    function _updateFolderSuggestions(query, folderList, rootFolders, stringMatcher, $suggestions, $input) {
        if (!query || query.trim() === '') {
            // when input is empty we show the root folders
            _renderFolderSuggestions(rootFolders.slice(0, 15), $suggestions, $input);
            return;
        }

        if (!stringMatcher) { return; }

        // filter folders using fuzzy matching
        const matches = folderList
            .map(folder => {
                const result = stringMatcher.match(folder, query);
                if (result) {
                    // get the last folder name (e.g., "assets/images/" -> "images")
                    const folderPath = result.label || folder;
                    const segments = folderPath.split('/').filter(s => s.length > 0);
                    const lastSegment = segments[segments.length - 1] || '';
                    result.folderName = lastSegment.toLowerCase();

                    // we need to boost the score significantly if the last folder segment starts with the query
                    // This ensures folders like "images/" rank higher than "testing/maps/google/" when typing "image"
                    // note: here testing/maps/google has all the chars of 'image'
                    if (lastSegment.toLowerCase().startsWith(query.toLowerCase())) {
                        // Use a large positive boost (matchGoodness is negative, so we subtract a large negative number)
                        result.matchGoodness -= 10000;
                    }
                    // Also boost (but less) if the last segment contains the query as a substring
                    else if (lastSegment.toLowerCase().includes(query.toLowerCase())) {
                        result.matchGoodness -= 1000;
                    }
                }
                return result;
            })
            .filter(result => result !== null && result !== undefined);

        // Sort by matchGoodness first (prefix matches will have best scores),
        // then alphabetically by folder name, then by full path
        StringMatch.multiFieldSort(matches, { matchGoodness: 0, folderName: 1, label: 2 });

        const topMatches = matches.slice(0, 15);
        _renderFolderSuggestions(topMatches, $suggestions, $input);
    }

    /**
     * register the input box handlers (folder selection dialog)
     * also registers the 'arrow up/down and enter' key handler for folder selection and move the selected folder,
     * in the list of suggestions
     *
     * @param {JQuery} $input - the input box element
     * @param {JQuery} $suggestions - the suggestions list element
     * @param {JQuery} $dlg - the dialog box element
     */
    function _registerFolderDialogInputHandlers($input, $suggestions, $dlg) {
        // keyboard navigation handler for arrow keys
        $input.on('keydown', function(e) {
            const isArrowDown = e.keyCode === 40;
            const isArrowUp = e.keyCode === 38;
            // we only want to handle the arrow up arrow down keys
            if (!isArrowDown && !isArrowUp) { return; }

            e.preventDefault();
            const $items = $suggestions.find('.folder-suggestion-item');
            if ($items.length === 0) { return; }

            const $selected = $items.filter('.selected');

            // determine which item to select next
            let $nextItem;
            if ($selected.length === 0) {
                // no selection - select first or last based on direction
                $nextItem = isArrowDown ? $items.first() : $items.last();
            } else {
                // move selection
                const currentIndex = $items.index($selected);
                $selected.removeClass('selected');
                const nextIndex = isArrowDown
                    ? (currentIndex + 1) % $items.length
                    : (currentIndex - 1 + $items.length) % $items.length;
                $nextItem = $items.eq(nextIndex);
            }

            // apply selection and scroll the selected item into view (if not in view)
            $nextItem.addClass('selected');
            if ($nextItem.length > 0) {
                $nextItem[0].scrollIntoView({ block: "nearest", behavior: "auto" });
            }
        });

        // for enter key, we're using keyup handler because keydown was interfering with dialog's default behaviour
        // when enter key is pressed, we check if there are any selected folders in the suggestions
        // if yes, we type the folder path in the input box,
        // if no, we click the ok button of the dialog
        $input.on('keyup', function(e) {
            if (e.keyCode === 13) { // enter key
                const $items = $suggestions.find('.folder-suggestion-item');
                const $selected = $items.filter('.selected');

                // if there's a selected suggestion, use it
                if ($selected.length > 0) {
                    const folderPath = $selected.data('path');
                    $input.val(folderPath);
                    $suggestions.empty();
                } else {
                    // no suggestions, trigger OK button click
                    $dlg.find('[data-button-id="ok"]').click();
                }
            }
        });
    }

    /**
     * this shows the folder selection dialog for choosing where to download images
     * @param {Object} message - the message object (optional, only needed when downloading image)
     * @private
     */
    function _showFolderSelectionDialog(message) {
        const projectRoot = ProjectManager.getProjectRoot();
        if (!projectRoot) { return; }

        // show the dialog with a text box to select a folder
        // dialog html is written in 'image-folder-dialog.html'
        const templateVars = {
            Strings: Strings
        };
        const dialog = Dialogs.showModalDialogUsingTemplate(Mustache.render(ImageFolderDialogTemplate, templateVars), false);
        const $dlg = dialog.getElement();
        const $input = $dlg.find("#folder-path-input");
        const $suggestions = $dlg.find("#folder-suggestions");
        const $rememberCheckbox = $dlg.find("#remember-folder-checkbox");

        let folderList = [];
        let rootFolders = [];
        let stringMatcher = null;

        _scanRootDirectoriesOnly(projectRoot, rootFolders).then(() => {
            stringMatcher = new StringMatch.StringMatcher({ segmentedSearch: true });
            _renderFolderSuggestions(rootFolders.slice(0, 15), $suggestions, $input);
        });

        _scanDirectories(projectRoot, '', folderList);

        // input event handler
        $input.on('input', function() {
            _updateFolderSuggestions($input.val(), folderList, rootFolders, stringMatcher, $suggestions, $input);
        });
        _registerFolderDialogInputHandlers($input, $suggestions, $dlg);
        // focus the input box
        setTimeout(function() {
            $input.focus();
        }, 100);

        // handle dialog button clicks
        // so the logic is either its an ok button click or cancel button click, so if its ok click
        // then we download image in that folder and close the dialog, in close btn click we directly close the dialog
        $dlg.one("buttonClick", function(e, buttonId) {
            if (buttonId === Dialogs.DIALOG_BTN_OK) {
                const folderPath = $input.val().trim();

                // if the checkbox is checked, we save the folder preference for this project
                if ($rememberCheckbox.is(':checked')) {
                    StateManager.set(IMAGE_DOWNLOAD_FOLDER_KEY, folderPath, StateManager.PROJECT_CONTEXT);
                }

                // if message is provided, download the image
                if (message) {
                    _downloadToFolder(message, folderPath);
                }
            }
            dialog.close();
        });
    }

    /**
     * This function is called when 'use this image' button is clicked in the image ribbon gallery
     * or user loads an image file from the computer
     * this is responsible to download the image in the appropriate place
     * and also change the src attribute of the element (by calling appropriate helper functions)
     *
     * @param {Object} message - the message object which stores all the required data for this operation
     */
    function _handleUseThisImage(message) {
        const projectRoot = ProjectManager.getProjectRoot();
        if (!projectRoot) { return; }

        // check if user has already saved a folder preference for this project
        const savedFolder = StateManager.get(IMAGE_DOWNLOAD_FOLDER_KEY, StateManager.PROJECT_CONTEXT);
        // we specifically check for nullish type vals because empty string is possible as it means project root
        if (savedFolder !== null && savedFolder !== undefined) {
            _downloadToFolder(message, savedFolder);
        } else {
            // show the folder selection dialog
            _showFolderSelectionDialog(message);
        }
    }

    /**
     * Helper function to download image to the specified directory
     *
     * @param {Object} message - Message containing image download info
     * @param {string} filename - Name of the image file
     * @param {string} extnName - File extension (e.g., "jpg")
     * @param {Directory} targetDir - Target directory to save the image
     */
    function _downloadImageToDirectory(message, filename, extnName, targetDir) {
        getUniqueFilename(targetDir.fullPath, filename, extnName).then((uniqueFilename) => {
            // check if the image is loaded from computer or from remote
            if (message.isLocalFile && message.imageData) {
                _handleUseThisImageLocalFiles(message, uniqueFilename, targetDir);
            } else {
                _handleUseThisImageRemote(message, uniqueFilename, targetDir);
            }
        }).catch(error => {
            console.error('Something went wrong when trying to use this image', error);
        });
    }

    /**
     * Handles reset of image folder selection - clears the saved preference and shows the dialog
     * @private
     */
    function _handleResetImageFolderSelection() {
        // clear the saved folder preference for this project
        StateManager.set(IMAGE_DOWNLOAD_FOLDER_KEY, null, StateManager.PROJECT_CONTEXT);

        // show the folder selection dialog for the user to choose a new folder
        // we pass null because we're not downloading an image, just setting the preference
        _showFolderSelectionDialog(null);
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
                delete || duplicate || livePreviewTextEdit || AISend: true
                undoLivePreviewOperation: true (this property is available only for undo operation)

                prompt: prompt (only for AI)

                sourceId: sourceId, (these are for move (drag & drop))
                targetId: targetId,
                insertAfter: boolean, (whether to insert after the target element)
                move: true
        }
    * these are the main properties that are passed through the message
     */
    function handleLivePreviewEditOperation(message) {
        // handle reset image folder selection
        if (message.resetImageFolderSelection) {
            _handleResetImageFolderSelection();
            return;
        }

        // handle move(drag & drop)
        if (message.move && message.sourceId && message.targetId) {
            _moveElementInSource(message.sourceId, message.targetId, message.insertAfter, message.insertInside);
            return;
        }

        // use this image
        if (message.useImage && message.imageUrl && message.filename) {
            _handleUseThisImage(message);
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
        } else if (message.AISend) {
            _editWithAI(message);
        }
    }

    exports.handleLivePreviewEditOperation = handleLivePreviewEditOperation;
});
