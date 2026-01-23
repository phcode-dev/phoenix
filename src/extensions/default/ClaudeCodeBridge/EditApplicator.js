/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
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

/**
 * EditApplicator Module
 *
 * Applies Claude's suggested edits to source files via Phoenix's editor APIs.
 * Key features:
 * - Handles multi-file edits by opening each file in Phoenix
 * - Uses editor.document.batchOperation() for grouped undo
 * - Sorts edits bottom-to-top to preserve line numbers
 * - Finds edit positions by matching oldText in file content
 */
define(function (require, exports, module) {

    const DocumentManager = brackets.getModule("document/DocumentManager");
    const EditorManager = brackets.getModule("editor/EditorManager");
    const CommandManager = brackets.getModule("command/CommandManager");
    const Commands = brackets.getModule("command/Commands");
    const FileUtils = brackets.getModule("file/FileUtils");

    /**
     * Find the position of oldText in the document
     * @param {Document} doc - Phoenix document
     * @param {string} oldText - Text to find
     * @returns {Object|null} {from: {line, ch}, to: {line, ch}} or null if not found
     */
    function findTextPosition(doc, oldText) {
        if (!oldText || oldText.length === 0) {
            return null;
        }

        const text = doc.getText();
        const index = text.indexOf(oldText);

        if (index === -1) {
            // Try with normalized line endings
            const normalizedOldText = oldText.replace(/\r\n/g, '\n');
            const normalizedIndex = text.replace(/\r\n/g, '\n').indexOf(normalizedOldText);

            if (normalizedIndex === -1) {
                return null;
            }

            // Convert character index to {line, ch}
            return indexToPos(text, normalizedIndex, normalizedOldText.length);
        }

        return indexToPos(text, index, oldText.length);
    }

    /**
     * Convert character index to {from, to} positions
     * @param {string} text - Document text
     * @param {number} startIndex - Start character index
     * @param {number} length - Length of the text
     * @returns {Object} {from: {line, ch}, to: {line, ch}}
     */
    function indexToPos(text, startIndex, length) {
        let line = 0;
        let ch = 0;
        let fromLine = 0;
        let fromCh = 0;
        let foundFrom = false;

        for (let i = 0; i < text.length; i++) {
            if (i === startIndex) {
                fromLine = line;
                fromCh = ch;
                foundFrom = true;
            }

            if (i === startIndex + length) {
                return {
                    from: { line: fromLine, ch: fromCh },
                    to: { line: line, ch: ch }
                };
            }

            if (text[i] === '\n') {
                line++;
                ch = 0;
            } else {
                ch++;
            }
        }

        // Handle case where end is at document end
        if (foundFrom) {
            return {
                from: { line: fromLine, ch: fromCh },
                to: { line: line, ch: ch }
            };
        }

        return null;
    }

    /**
     * Group edits by file path
     * @param {Array} edits - Array of edit objects
     * @returns {Object} Object with file paths as keys and edit arrays as values
     */
    function groupEditsByFile(edits) {
        const grouped = {};

        edits.forEach(function(edit) {
            const file = edit.file;
            if (!grouped[file]) {
                grouped[file] = [];
            }
            grouped[file].push(edit);
        });

        return grouped;
    }

    /**
     * Sort edits from bottom to top of file
     * This ensures that applying edits doesn't shift the positions of later edits
     * @param {Array} edits - Array of edit objects with positions
     * @returns {Array} Sorted edits
     */
    function sortEditsBottomToTop(edits) {
        return edits.slice().sort(function(a, b) {
            // If we have position info, use it
            if (a._position && b._position) {
                if (a._position.from.line !== b._position.from.line) {
                    return b._position.from.line - a._position.from.line;
                }
                return b._position.from.ch - a._position.from.ch;
            }
            return 0;
        });
    }

    /**
     * Apply edits to a single document
     * @param {Document} doc - Phoenix document
     * @param {Array} edits - Array of edit objects for this file
     * @returns {Object} Result with success status and any errors
     */
    function applyEditsToDocument(doc, edits) {
        const errors = [];

        // First, find positions for all edits
        edits.forEach(function(edit) {
            if (edit.oldText) {
                const position = findTextPosition(doc, edit.oldText);
                if (position) {
                    edit._position = position;
                } else {
                    errors.push("Could not find text to replace: " + edit.oldText.substring(0, 50) + "...");
                }
            }
        });

        // Sort edits bottom-to-top
        const sortedEdits = sortEditsBottomToTop(edits);

        // Apply edits within a batch operation for grouped undo
        doc.batchOperation(function() {
            sortedEdits.forEach(function(edit) {
                if (!edit._position) {
                    return; // Skip edits where we couldn't find the position
                }

                const newText = edit.newText || "";

                // Use doc.replaceRange for direct document manipulation
                doc.replaceRange(
                    newText,
                    edit._position.from,
                    edit._position.to
                );
            });
        });

        return {
            success: errors.length === 0,
            errors: errors,
            appliedCount: sortedEdits.filter(function(e) { return e._position; }).length
        };
    }

    /**
     * Apply edits to multiple files
     * @param {Array} edits - Array of edit objects
     *   Each edit has: {file, oldText, newText}
     * @returns {Promise} Resolves with {success, errors, filesModified}
     */
    function applyEdits(edits) {
        return new Promise(function(resolve, reject) {
            if (!edits || edits.length === 0) {
                resolve({ success: true, errors: [], filesModified: 0 });
                return;
            }

            const editsByFile = groupEditsByFile(edits);
            const filePaths = Object.keys(editsByFile);
            const allErrors = [];
            let filesModified = 0;
            let filesProcessed = 0;

            if (filePaths.length === 0) {
                resolve({ success: true, errors: [], filesModified: 0 });
                return;
            }

            // Process each file
            filePaths.forEach(function(filePath) {
                const fileEdits = editsByFile[filePath];

                // Get or open the document for this file
                DocumentManager.getDocumentForPath(filePath)
                    .done(function(doc) {
                        try {
                            const result = applyEditsToDocument(doc, fileEdits);

                            if (result.appliedCount > 0) {
                                filesModified++;
                            }

                            if (result.errors.length > 0) {
                                result.errors.forEach(function(err) {
                                    allErrors.push(filePath + ": " + err);
                                });
                            }

                            // Save the document to disk so Claude can see changes on follow-up
                            if (result.appliedCount > 0) {
                                console.log("[EditApplicator] Applied " + result.appliedCount + " edits to " + filePath);
                                // Save the document using direct file write
                                try {
                                    const file = doc.file;
                                    const text = doc.getText();
                                    console.log("[EditApplicator] Saving " + filePath + " (" + text.length + " chars)");
                                    FileUtils.writeText(file, text, true)
                                        .done(function() {
                                            console.log("[EditApplicator] Saved " + filePath);
                                            // Mark document as clean after save
                                            doc._markClean();
                                        })
                                        .fail(function(err) {
                                            console.warn("[EditApplicator] Could not auto-save " + filePath + ":", err);
                                        });
                                } catch (saveErr) {
                                    console.warn("[EditApplicator] Save error for " + filePath + ":", saveErr);
                                }
                            }
                        } catch (error) {
                            allErrors.push(filePath + ": " + error.message);
                        }

                        filesProcessed++;
                        checkComplete();
                    })
                    .fail(function(error) {
                        allErrors.push(filePath + ": Failed to open file - " + (error.message || error));
                        filesProcessed++;
                        checkComplete();
                    });
            });

            function checkComplete() {
                if (filesProcessed === filePaths.length) {
                    resolve({
                        success: allErrors.length === 0,
                        errors: allErrors,
                        filesModified: filesModified
                    });
                }
            }
        });
    }

    /**
     * Apply a single edit directly with position info
     * (Used when position is already known)
     * @param {Object} editor - Phoenix editor instance
     * @param {string} newText - Text to insert
     * @param {Object} from - {line, ch} start position
     * @param {Object} to - {line, ch} end position
     */
    function applyEditDirect(editor, newText, from, to) {
        editor.document.batchOperation(function() {
            editor.document.replaceRange(newText, from, to);
        });
    }

    // Export public API
    exports.applyEdits = applyEdits;
    exports.applyEditDirect = applyEditDirect;
    exports.findTextPosition = findTextPosition;
});
