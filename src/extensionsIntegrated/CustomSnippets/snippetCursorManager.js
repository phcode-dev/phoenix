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
    const TabstopManager = require("editor/TabstopManager");
    const Editor = require("editor/Editor").Editor;

    /**
     * Marker a snippet's templateText can use to mean "one indent level, in whatever this specific
     * file/editor is actually configured/detected to use" (spaces vs tabs, and how many) - resolved by
     * resolveIndentToken below, entirely within this module's own preprocessing, before the text ever
     * reaches TabstopManager's shared LSP-grammar parser. That's deliberate: TabstopManager is also
     * used directly by LSP completions and DocCommentHints (see editor/TabstopManager.js), and this
     * marker is never taught to THAT shared parser at all - by the time TabstopManager sees the text,
     * this token has already been fully replaced with literal characters, so there is nothing here for
     * it to interpret, and real LSP-served snippet text (which never passes through this module) can
     * never trigger this substitution either. Deliberately NOT `$`-prefixed, so it can never collide
     * with real `${...}` tab-stop/placeholder syntax even if this substitution were ever skipped - it
     * would just show up as this literal, obviously-wrong-looking text instead of silently misbehaving.
     */
    const INDENT_TOKEN = "@@INDENT@@";

    /**
     * Resolves what "one indent level" literally looks like right now for the given editor's file -
     * same auto-detection + project/language preference cascade Phoenix's own Tab-key handling uses
     * (see Editor.getUseTabChar/getSpaceUnits), so it always matches what pressing Tab in that file
     * would actually insert.
     *
     * @param {Editor} editor - the editor instance being inserted into
     * @returns {string} - e.g. "    " or "\t", scoped to this specific file/language/project
     */
    function getOneIndentUnit(editor) {
        const fullPath = editor && editor.document && editor.document.file && editor.document.file.fullPath;
        return Editor.getUseTabChar(fullPath) ? "\t" : " ".repeat(Editor.getSpaceUnits(fullPath));
    }

    /**
     * Replaces every INDENT_TOKEN in templateText with the current editor's actual one-indent-level
     * string. See INDENT_TOKEN's own doc comment for why this is a plain string substitution done here
     * rather than new tab-stop syntax taught to the shared TabstopManager parser.
     *
     * @param {string} templateText - the raw template text, may contain zero or more INDENT_TOKENs
     * @param {Editor} editor - the editor instance being inserted into
     * @returns {string} - templateText with every INDENT_TOKEN replaced
     */
    function resolveIndentToken(templateText, editor) {
        if (templateText.indexOf(INDENT_TOKEN) === -1) {
            return templateText; // fast path - most snippets (all user-authored ones, today) skip this
        }
        const unit = getOneIndentUnit(editor);
        return templateText.split(INDENT_TOKEN).join(unit);
    }

    /**
     * Custom snippet templateText historically only ever recognized the braced form `${1}` as a
     * tab stop (regex `/\$\{(\d+)\}/g`) - a bare `$1`, `$scope`, `$5`, etc. was always just literal
     * text. TabstopManager understands the fuller LSP snippet grammar (bare `$1` tab stops, `${VAR}`
     * variables that get silently dropped if unresolved, `${1:default}` placeholders, `\$`/`\}`/`\\`
     * escapes). To keep every already-saved snippet behaving exactly as before after this migration,
     * we escape every '$' that isn't immediately starting a `${...}` group before handing the text to
     * TabstopManager - this way only the braced forms are ever treated as snippet syntax, exactly
     * matching the old engine's behavior, while additively allowing `${1:default text}` and
     * `${1|a,b,c|}` for anyone (including our own default snippets) who wants richer placeholders.
     *
     * @param {string} text - the raw template text
     * @returns {string} - text with any bare (non-`${`) '$' escaped as '\$'
     */
    function escapeBareDollarSigns(text) {
        // escape pre-existing literal backslashes first, so they aren't misread as introducing a
        // \$, \}, \\ escape sequence once the next step injects backslashes next to '$' characters
        let escaped = text.replace(/\\/g, "\\\\");
        // escape every '$' not immediately followed by '{'
        escaped = escaped.replace(/\$(?!\{)/g, "\\$");
        return escaped;
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
        // Resolve any INDENT_TOKEN to this file's actual indent unit first, so everything downstream
        // just sees plain literal characters - see resolveIndentToken's doc comment for why this must
        // happen before escaping/parsing, not as new syntax taught to the shared TabstopManager parser.
        const withIndentResolved = resolveIndentToken(templateText, editor);

        const escapedText = escapeBareDollarSigns(withIndentResolved);

        // Get the current line's indentation to apply to all subsequent lines
        const baseIndent = getLineIndentation(editor, startPos);

        // Apply proper indentation to the snippet text for multi-line snippets
        const indentedText = addIndentationToSnippet(escapedText, baseIndent);

        return TabstopManager.insertSnippet(editor, indentedText, startPos, endPos);
    }

    /**
     * Check if we're currently in a snippet session
     * @returns {boolean}
     */
    function isInSnippetSession() {
        return TabstopManager.hasActiveSession();
    }

    /**
     * End the current snippet session
     */
    function endSnippetSession() {
        TabstopManager.endSession();
    }

    /**
     * Navigate to the next tab stop
     * @returns {boolean} true if a session was active and navigation happened
     */
    function navigateToNextTabStop() {
        if (!TabstopManager.hasActiveSession()) {
            return false;
        }
        TabstopManager.goToNextStop();
        return true;
    }

    /**
     * Navigate to the previous tab stop
     * @returns {boolean} true if a session was active and navigation happened
     */
    function navigateToPreviousTabStop() {
        if (!TabstopManager.hasActiveSession()) {
            return false;
        }
        TabstopManager.goToPreviousStop();
        return true;
    }

    /**
     * Handle key events for tab navigation.
     * NOTE: real Tab/Shift-Tab/Esc handling during an active session is now owned by
     * TabstopManager's own CodeMirror keymap (installed per-session in insertSnippet). This
     * function is kept only as a thin compatibility shim for callers/tests that dispatch a
     * synthesized key event directly instead of going through the real DOM/CodeMirror path.
     *
     * @param {Event} jqEvent - jQuery event (unused, kept for signature compatibility)
     * @param {Editor} editor - Editor instance
     * @param {KeyboardEvent} event - Keyboard event
     */
    function handleKeyEvent(jqEvent, editor, event) {
        if (!TabstopManager.hasActiveSession()) {
            return false;
        }

        if (event.keyCode === KeyEvent.DOM_VK_TAB) {
            const moved = event.shiftKey ? navigateToPreviousTabStop() : navigateToNextTabStop();
            if (moved) {
                event.preventDefault();
                return true;
            }
        }

        if (event.keyCode === KeyEvent.DOM_VK_ESCAPE) {
            endSnippetSession();
            event.preventDefault();
            return true;
        }

        return false;
    }

    exports.escapeBareDollarSigns = escapeBareDollarSigns;
    exports.insertSnippetWithTabStops = insertSnippetWithTabStops;
    exports.isInSnippetSession = isInSnippetSession;
    exports.handleKeyEvent = handleKeyEvent;
    exports.endSnippetSession = endSnippetSession;
    exports.navigateToNextTabStop = navigateToNextTabStop; // exposed for integration testing
    exports.navigateToPreviousTabStop = navigateToPreviousTabStop; // exposed for integration testing
    exports.INDENT_TOKEN = INDENT_TOKEN; // referenced by defaultSnippets.js templateText
    exports.resolveIndentToken = resolveIndentToken; // exposed for unit testing
    exports.getOneIndentUnit = getOneIndentUnit; // exposed for unit testing
});
