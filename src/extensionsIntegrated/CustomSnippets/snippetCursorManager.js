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

define(function (require, exports, module) {
    const KeyEvent = require("utils/KeyEvent");
    const EditorManager = require("editor/EditorManager");

    // tab stops regex to handle ${1}, ${2}.... etc.
    const TAB_STOP_REGEX = /\$\{(\d+)\}/g;

    // this is to check whether an active snippet session is on or off
    let activeSnippetSession = null;

    /**
     * this represents an active snippet session with tab stops
     */
    function SnippetSession(editor, tabStops, startLine, endLine) {
        this.editor = editor;
        this.tabStops = tabStops; // this is an array of {number, line} sorted by number
        this.currentTabNumber = tabStops.length > 0 ? tabStops[0].number : 1;
        this.startLine = startLine;
        this.endLine = endLine;
        this.isActive = true;
    }

    /**
     * this function is responsible to parse the template text and extract all the tab stops
     *
     * @param {string} templateText - the template text with tab stops
     * @returns {Object} - Object containing the text and tab stop information
     */
    function parseTemplateText(templateText) {
        const tabStops = [];
        let match;

        // reset regex
        TAB_STOP_REGEX.lastIndex = 0;

        // find all the tab stops
        while ((match = TAB_STOP_REGEX.exec(templateText)) !== null) {
            const tabNumber = parseInt(match[1], 10);
            tabStops.push({
                number: tabNumber
            });
        }

        // sort the tab stops by number. note: 0 should come at last
        tabStops.sort((a, b) => {
            if (a.number === 0) {
                return 1;
            }
            if (b.number === 0) {
                return -1;
            }
            return a.number - b.number;
        });

        return {
            text: templateText,
            tabStops: tabStops
        };
    }

    /**
     * Find tab stops in the snippet lines and return their positions
     * this is called after snippet insertion to find actual positions in the editor
     *
     * @param {Editor} editor - editor instance
     * @param {number} startLine - Start line of snippet
     * @param {number} endLine - End line of snippet
     * @returns {Array} - array of {number, line, start, end} sorted by number
     */
    function findTabStops(editor, startLine, endLine) {
        const tabStops = [];
        const document = editor.document;

        for (let line = startLine; line <= endLine; line++) {
            const lineText = document.getLine(line);
            let match;

            TAB_STOP_REGEX.lastIndex = 0;
            while ((match = TAB_STOP_REGEX.exec(lineText)) !== null) {
                const tabNumber = parseInt(match[1], 10);
                tabStops.push({
                    number: tabNumber,
                    line: line,
                    start: { line: line, ch: match.index },
                    end: { line: line, ch: match.index + match[0].length }
                });
            }
        }

        tabStops.sort((a, b) => {
            if (a.number === 0) {
                return 1;
            }
            if (b.number === 0) {
                return -1;
            }
            return a.number - b.number;
        });

        return tabStops;
    }

    /**
     * responsible to check if session should continue (tab stops still exist in template area)
     * we need this because users can delete tab stops while typing
     *
     * @returns {boolean}
     */
    function shouldContinueSession() {
        if (!activeSnippetSession || !activeSnippetSession.isActive) {
            return false;
        }

        const session = activeSnippetSession;
        const tabStops = findTabStops(session.editor, session.startLine, session.endLine);

        // update the session with current tab stops
        session.tabStops = tabStops;

        return tabStops.length > 0;
    }

    /**
     * this function is responsible to calculate the indentation level for the current line
     *
     * @param {Editor} editor - the editor instance
     * @param {Object} position - position object with line number
     * @returns {String} - the indentation string
     */
    function getLineIndentation(editor, position) {
        const line = editor.document.getLine(position.line);
        const match = line.match(/^\s*/);
        return match ? match[0] : '';
    }

    /**
     * this function is to add proper indentation to multiline snippet text
     *
     * @param {String} templateText - the template text with multiple lines
     * @param {String} baseIndent - the base indentation string from the current cursor position
     * @returns {String} - properly indented text
     */
    function addIndentationToSnippet(templateText, baseIndent) {
        const lines = templateText.split(/(\r\n|\n)/g);

        let result = '';
        let isFirstLine = true;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            if (line === '\n' || line === '\r\n') {
                result += line;
                continue;
            }

            if (line.trim() === '') {
                result += line;
                continue;
            }

            // we don't want to indent the first line as it inherits the current indent
            if (isFirstLine) {
                result += line;
                isFirstLine = false;
            } else {
                // add base indent plus the existing indent in the template text
                result += baseIndent + line;
            }
        }

        return result;
    }

    /**
     * Insert snippet with tab stops and start navigation session
     * this is the main function that handles snippet insertion with cursor positioning
     *
     * @param {Editor} editor - editor instance
     * @param {string} templateText - Template text with tab stops
     * @param {Object} startPos - Start position for insertion
     * @param {Object} endPos - End position for insertion
     */
    function insertSnippetWithTabStops(editor, templateText, startPos, endPos) {
        const parsed = parseTemplateText(templateText);

        // Get the current line's indentation to apply to all subsequent lines
        const baseIndent = getLineIndentation(editor, startPos);

        // Apply proper indentation to the snippet text for multi-line snippets
        const indentedText = addIndentationToSnippet(parsed.text, baseIndent);

        editor.document.replaceRange(indentedText, startPos, endPos);

        // calculate snippet bounds
        const lines = indentedText.split("\n");
        const startLine = startPos.line;
        const endLine = startPos.line + lines.length - 1;

        // find tab stops in the inserted snippet
        const tabStops = findTabStops(editor, startLine, endLine);

        if (tabStops.length > 0) {
            activeSnippetSession = new SnippetSession(editor, tabStops, startLine, endLine);

            // move to first tab stop. this is the default behaviour
            navigateToTabStop(activeSnippetSession.currentTabNumber);
        } else {
            // when no tab stops, we just place cursor at end
            const finalPos = {
                line: endLine,
                ch: lines.length === 1 ? startPos.ch + lines[0].length : lines[lines.length - 1].length
            };
            editor.setCursorPos(finalPos);
        }
    }

    /**
     * Navigate to a specific tab stop by number
     * @param {number} tabNumber - Tab stop number to navigate to
     */
    function navigateToTabStop(tabNumber) {
        if (!shouldContinueSession()) {
            endSnippetSession();
            return;
        }

        const session = activeSnippetSession;

        // find the tab stop with the specified number
        const tabStop = session.tabStops.find((t) => t.number === tabNumber);

        if (tabStop) {
            session.currentTabNumber = tabNumber;

            // select the entire tab stop placeholder
            session.editor.setSelection(tabStop.start, tabStop.end);
            session.editor.focus();
        } else {
            endSnippetSession();
        }
    }

    /**
     * Navigate to the next tab stop
     * this handles the logic for finding the next available tab stop in sequence
     */
    function navigateToNextTabStop() {
        if (!shouldContinueSession()) {
            endSnippetSession();
            return false;
        }

        const session = activeSnippetSession;
        const currentNumber = session.currentTabNumber;

        let nextTabStop = null;

        // If we're currently at ${0}, there's no next tab stop so we need to end the session
        if (currentNumber === 0) {
            endSnippetSession();
            return false;
        }

        // at first, look for the next numbered tab stop (greater than current)
        for (let i = 0; i < session.tabStops.length; i++) {
            if (session.tabStops[i].number > currentNumber && session.tabStops[i].number !== 0) {
                nextTabStop = session.tabStops[i];
                break;
            }
        }

        // If no numbered tab stop found, look for ${0} as the final stop
        if (!nextTabStop) {
            nextTabStop = session.tabStops.find((t) => t.number === 0);
        }

        if (nextTabStop) {
            navigateToTabStop(nextTabStop.number);
            return true;
        }
        endSnippetSession();
        return false;
    }

    /**
     * Navigate to the previous tab stop
     * this handles shift+tab navigation to go backwards
     */
    function navigateToPreviousTabStop() {
        if (!shouldContinueSession()) {
            endSnippetSession();
            return false;
        }

        const session = activeSnippetSession;
        const currentNumber = session.currentTabNumber;

        // Find the previous tab stop number in the sorted array
        let prevTabStop = null;

        // If we're currently at ${0}, find the highest numbered tab stop
        if (currentNumber === 0) {
            let maxNumber = -1;
            for (let i = 0; i < session.tabStops.length; i++) {
                if (session.tabStops[i].number !== 0 && session.tabStops[i].number > maxNumber) {
                    maxNumber = session.tabStops[i].number;
                    prevTabStop = session.tabStops[i];
                }
            }
        } else {
            // Find the previous numbered tab stop (less than current, but not 0)
            for (let i = session.tabStops.length - 1; i >= 0; i--) {
                if (session.tabStops[i].number < currentNumber && session.tabStops[i].number !== 0) {
                    prevTabStop = session.tabStops[i];
                    break;
                }
            }
        }

        if (prevTabStop) {
            navigateToTabStop(prevTabStop.number);
            return true;
        }
        return false;
    }

    /**
     * End the current snippet session
     * this cleans up all remaining tab stop placeholders and resets the session
     */
    function endSnippetSession() {
        if (activeSnippetSession) {
            const session = activeSnippetSession;

            // Remove any remaining tab stop placeholders
            const tabStops = findTabStops(session.editor, session.startLine, session.endLine);
            tabStops.reverse().forEach((tabStop) => {
                session.editor.document.replaceRange("", tabStop.start, tabStop.end);
            });

            activeSnippetSession.isActive = false;
            activeSnippetSession = null;
        }
    }

    /**
     * Check if we're currently in a snippet session
     * @returns {boolean}
     */
    function isInSnippetSession() {
        return activeSnippetSession && activeSnippetSession.isActive;
    }

    /**
     * Check if cursor is within snippet lines
     * we need this to end the session if user moves cursor outside the snippet area
     *
     * @param {Object} cursorPos - Current cursor position
     * @returns {boolean}
     */
    function isCursorInSnippetLines(cursorPos) {
        if (!activeSnippetSession) {
            return false;
        }

        return cursorPos.line >= activeSnippetSession.startLine && cursorPos.line <= activeSnippetSession.endLine;
    }

    /**
     * Handle key events for tab navigation
     * this is where all the tab/shift+tab/escape key handling happens
     *
     * @param {Event} jqEvent - jQuery event
     * @param {Editor} editor - Editor instance
     * @param {KeyboardEvent} event - Keyboard event
     */
    function handleKeyEvent(jqEvent, editor, event) {
        if (!isInSnippetSession() || activeSnippetSession.editor !== editor) {
            return false;
        }

        // make sure that the cursor is still within snippet lines
        const cursorPos = editor.getCursorPos();
        if (!isCursorInSnippetLines(cursorPos)) {
            endSnippetSession();
            return false;
        }

        // Tab key handling
        if (event.keyCode === KeyEvent.DOM_VK_TAB) {
            if (event.shiftKey) {
                // Shift+Tab: go to previous tab stop
                if (navigateToPreviousTabStop()) {
                    event.preventDefault();
                    return true;
                }
            } else {
                // Tab: go to next tab stop
                if (navigateToNextTabStop()) {
                    event.preventDefault();
                    return true;
                }
            }
        }

        // 'Esc' key to end snippet session
        if (event.keyCode === KeyEvent.DOM_VK_ESCAPE) {
            endSnippetSession();
            event.preventDefault();
            return true;
        }

        // handle Delete/Backspace - check if session should continue
        // we need this because users might delete the template text from the editor
        if (event.keyCode === KeyEvent.DOM_VK_DELETE || event.keyCode === KeyEvent.DOM_VK_BACK_SPACE) {
            // just to let the delete/backspace complete
            setTimeout(() => {
                if (!shouldContinueSession()) {
                    endSnippetSession();
                }
            }, 10);
        }

        return false;
    }

    /**
     * Handle cursor position changes
     * this ends the session if user moves cursor outside snippet bounds or creates multiple selections
     * @param {Event} event - Cursor activity event
     * @param {Editor} editor - Editor instance
     */
    function handleCursorActivity(event, editor) {
        if (!isInSnippetSession() || activeSnippetSession.editor !== editor) {
            return;
        }

        // end session if user creates multiple selections
        if (editor.getSelections().length > 1) {
            endSnippetSession();
            return;
        }

        const cursorPos = editor.getCursorPos();
        if (!isCursorInSnippetLines(cursorPos)) {
            endSnippetSession();
        }
    }

    /**
     * This function is responsible to register all the required handers
     * we need this to set up all the event listeners for cursor navigation
     */
    function registerHandlers() {
        // register the event handler for snippet cursor navigation
        const editorHolder = $("#editor-holder")[0];
        if (editorHolder) {
            editorHolder.addEventListener(
                "keydown",
                function (event) {
                    const editor = EditorManager.getActiveEditor();
                    if (editor) {
                        handleKeyEvent(null, editor, event);
                    }
                },
                true
            );
        }

        // Listen for editor changes to end snippet sessions
        EditorManager.on("activeEditorChange", function (event, current, previous) {
            if (isInSnippetSession()) {
                endSnippetSession();
            }
        });

        // Register cursor activity handler for current and future editors
        function registerCursorActivityForEditor(editor) {
            if (editor) {
                editor.on("cursorActivity", handleCursorActivity);
            }
        }

        // Register for current editor
        const currentEditor = EditorManager.getActiveEditor();
        if (currentEditor) {
            registerCursorActivityForEditor(currentEditor);
        }

        // Register for editor changes
        EditorManager.on("activeEditorChange", function (event, current, previous) {
            if (previous) {
                previous.off("cursorActivity", handleCursorActivity);
            }
            if (current) {
                registerCursorActivityForEditor(current);
            }
            if (isInSnippetSession()) {
                endSnippetSession();
            }
        });
    }

    exports.parseTemplateText = parseTemplateText;
    exports.insertSnippetWithTabStops = insertSnippetWithTabStops;
    exports.isInSnippetSession = isInSnippetSession;
    exports.handleKeyEvent = handleKeyEvent;
    exports.handleCursorActivity = handleCursorActivity;
    exports.endSnippetSession = endSnippetSession;
    exports.registerHandlers = registerHandlers;
});
