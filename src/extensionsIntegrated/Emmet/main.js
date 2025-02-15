/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 * Original work Copyright (c) 2024 [emmet.io](https://github.com/emmetio/brackets-emmet).
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
 */


define(function (require, exports, module) {
    const AppInit = require("utils/AppInit");
    const PreferencesManager = require("preferences/PreferencesManager");
    const Strings = require("strings");
    const CodeHintManager = require("editor/CodeHintManager");
    const {
        markupSnippets,
        htmlTags,
        positiveSymbols,
        negativeSymbols
    } = require('./emmet-snippets');


    /**
     * The Emmet api's
     */
    const EXPAND_ABBR = Phoenix.libs.Emmet.expand;
    // const EMMET = Phoenix.libs.Emmet.module;


    /**
     * A list of all the markup snippets that can be expanded.
     * For ex: 'link:css', 'iframe'
     * They expand differently as compared to normal tags.
     * Refer to `./emmet-snippets.js` file for more info.
     */
    const markupSnippetsList = Object.keys(markupSnippets);


    // For preferences settings, to toggle this feature on/off
    const PREFERENCES_EMMET = "emmet";
    let enabled = true; // by default:- on

    PreferencesManager.definePreference(PREFERENCES_EMMET, "boolean", enabled, {
        description: Strings.DESCRIPTION_EMMET
    });


    /**
     * @constructor
     */
    function EmmetMarkupHints() {
    }


    /**
     * Checks whether hints are available for the current word where cursor is present.
     *
     * @param {Editor} editor - the editor instance
     * @param {String} implicitChar - unused param [didn't remove, as we might need it in future]
     * @returns {Boolean} - true if the abbr can be expanded otherwise false.
     */
    EmmetMarkupHints.prototype.hasHints = function (editor, implicitChar) {
        if (enabled) {
            this.editor = editor;

            const wordObj = getWordBeforeCursor(editor);
            const config = createConfig(editor);
            if (config && config.syntax === "html") {

                // make sure we donot have empty spaces
                if (wordObj.word.trim()) {

                    const expandedAbbr = isExpandable(editor, wordObj.word, config);
                    if (expandedAbbr) {
                        return true;
                    }
                }
            }
        }

        return false;
    };


    /**
     * Returns the Emmet hint for the current word before the cursor.
     * The hint element will have an appended "Emmet" icon at bottom-rigth to indicate it's an Emmet abbreviation.
     *
     * @param {String} implicitChar - unused param [didn't remove, as we might need it in future]
     */
    EmmetMarkupHints.prototype.getHints = function (implicitChar) {
        const wordObj = getWordBeforeCursor(this.editor);
        const config = createConfig(this.editor);

        // Check if the abbreviation is expandable
        const expandedAbbr = isExpandable(this.editor, wordObj.word, config);
        if (!expandedAbbr) {
            return null;
        }

        // Create the formatted hint element with an appended Emmet icon
        const formattedHint = formatEmmetHint(wordObj.word);

        return {
            hints: [formattedHint],
            match: null,
            selectInitial: true,
            defaultDescriptionWidth: true,
            handleWideResults: false
        };
    };


    /**
     * Formats an Emmet abbreviation hint by appending an icon.
     *
     * @param {string} abbr - The Emmet abbreviation.
     * @returns {jQuery} - A jQuery element representing the formatted hint.
     */
    function formatEmmetHint(abbr) {
        // Create the main container for the hint text.
        var $hint = $("<span>")
            .addClass("emmet-hint")
            .text(abbr);

        // style in brackets_patterns_override.less file
        let $icon = $(`<span class="emmet-code-hint">Emmet</span>`);

        // Append the icon to the hint element
        $hint.append($icon);

        return $hint;
    }


    /**
     * Responsible for updating the abbr with the expanded text in the editor.
     * This function calls helper functions for this as there are,
     * lot of complex cases that should be taken care of.
     */
    EmmetMarkupHints.prototype.insertHint = function () {
        const wordObj = getWordBeforeCursor(this.editor);
        const config = createConfig(this.editor);
        const expandedAbbr = isExpandable(this.editor, wordObj.word, config);
        updateAbbrInEditor(this.editor, wordObj, expandedAbbr);
        return false;
    };


    /**
     * Responsible to create the configuration based on the file type
     * Config is an object with two properties, type & snytax
     * This is required by the Emmet API to distinguish between HTML & Stylesheets
     *
     * @param {Editor} editor - The editor instance
     * @returns {Object | False} Object with two properties 'syntax' and 'type'
     */
    function createConfig(editor) {
        const fileType = editor.document.getLanguage().getId();

        if (fileType === "html" || fileType === "php" || fileType === "jsp") {
            return { syntax: "html", type: "markup" };
        }

        if (fileType === "css" || fileType === "scss" || fileType === "less") {
            return { syntax: "css", type: "stylesheet" };
        }

        return false;
    }


    /**
     * Determines whether a given character is allowed as part of an Emmet abbreviation
     *
     * @param {String} char - The character to test
     * @param {Boolean} insideBraces - Flag indicating if we are inside braces (e.g. {} or [])
     * @returns True if the character is valid for an abbreviation
     */
    function isEmmetChar(char, insideBraces) {
        // Valid abbreviation characters: letters, digits, and some punctuation
        // Adjust this regex or the list as needed for your implementation
        const validPattern = /[a-zA-Z0-9:+*<>()/!$\-@#}{]/;
        const specialChars = new Set(['.', '#', '[', ']', '"', '=', ':', ',', '-']);
        return validPattern.test(char) || specialChars.has(char) || (insideBraces && char === ' ');
    }


    /**
     * Scans backwards from the given cursor position on a line to locate the start of the Emmet abbreviation
     *
     * @param {String} line - The full text of the current line
     * @param {Number} cursorCh - The cursor's character (column) position on that line
     * @returns The index (column) where the abbreviation starts
     */
    function findAbbreviationStart(line, cursorCh) {
        let start = cursorCh;
        let insideBraces = false;

        // If the cursor is right before a closing brace, adjust it to be "inside" the braces
        if (line.charAt(start) === '}' || line.charAt(start) === ']') {
            start--;
            insideBraces = true;
        }

        // Walk backwards from the cursor to find the boundary of the abbreviation
        while (start > 0) {
            const char = line.charAt(start - 1);

            // Update our "inside braces" state based on the character
            if (char === '}' || char === ']') {
                insideBraces = true;
            } else if (char === '{' || char === '[') {
                insideBraces = false;
            }

            // If the character is valid as part of an Emmet abbreviation, continue scanning backwards
            if (isEmmetChar(char, insideBraces)) {
                start--;
            } else {
                break;
            }
        }
        return start;
    }


    /**
     * Retrieves the Emmet abbreviation (i.e. the word before the cursor) from the current editor state
     *
     * @param {Editor} editor - The editor instance
     * @returns An object with the abbreviation and its start/end positions
     *
     * Format:
     * {
     *   word: string,             // the extracted abbreviation
     *   start: { line: number, ch: number },
     *   end: { line: number, ch: number }
     * }
     */
    function getWordBeforeCursor(editor) {
        const pos = editor.getCursorPos();
        const lineText = editor.document.getLine(pos.line);

        // to determine where the abbreviation starts on the line
        const abbreviationStart = findAbbreviationStart(lineText, pos.ch);

        // Optionally, adjust the end position if the cursor is immediately before a closing brace.
        let abbreviationEnd = pos.ch;
        if (lineText.charAt(abbreviationEnd) === '}' || lineText.charAt(abbreviationEnd) === ']') {
            abbreviationEnd++;
        }

        const word = lineText.substring(abbreviationStart, abbreviationEnd);

        return {
            word: word,
            start: { line: pos.line, ch: abbreviationStart },
            end: { line: pos.line, ch: abbreviationEnd }
        };
    }


    /**
     * Calculate the indentation level for the current line
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
     * Adds proper indentation to multiline Emmet expansion
     *
     * @param {String} expandedText - the expanded Emmet abbreviation
     * @param {String} baseIndent - the base indentation string
     * @returns {String} - properly indented text
     */
    function addIndentation(expandedText, baseIndent) {
        // Split into lines, preserve empty lines
        const lines = expandedText.split(/(\r\n|\n)/g);

        // Process each line
        let result = '';
        let isFirstLine = true;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            // If it's a newline character, just add it
            if (line === '\n' || line === '\r\n') {
                result += line;
                continue;
            }

            // Skip indenting empty lines
            if (line.trim() === '') {
                result += line;
                continue;
            }

            // Don't indent the first line as it inherits the current indent
            if (isFirstLine) {
                result += line;
                isFirstLine = false;
            } else {
                // Add base indent plus the existing indent in the expanded text
                result += baseIndent + line;
            }
        }

        return result;
    }



    /**
     * Find the position where cursor should be placed after expansion
     * Looks for patterns like '><', '""', ''
     *
     * @param {Editor} editor - The editor instance
     * @param {String} indentedAbbr - the indented abbreviation
     * @param {Object} startPos - Starting position {line, ch} of the expansion
     * @returns {Object | false} - Cursor position {line, ch} or false if no pattern found
     */
    function findCursorPosition(editor, indentedAbbr, startPos) {
        const totalLines = startPos.line + indentedAbbr.split('\n').length;

        for (let i = startPos.line; i < totalLines; i++) {
            const line = editor.document.getLine(i);

            for (let j = 0; j < line.length - 1; j++) {
                const pair = line[j] + line[j + 1];

                if (pair === '""' || pair === "''") {
                    return { line: i, ch: j + 1 };
                }
            }
            for (let j = 0; j < line.length - 1; j++) {
                const pair = line[j] + line[j + 1];

                if (pair === '><') {
                    return { line: i, ch: j + 1 };
                }
            }
        }

        // Look for opening and closing tag pairs with empty line in between
        // <body>
        //      |
        // </body>
        // here in such scenarios, we want the cursor to be placed in between
        // Look for opening and closing tag pairs with empty line in between
        for (let i = startPos.line; i < totalLines; i++) {
            const line = editor.document.getLine(i).trim();
            if (line.endsWith('>') && line.includes('<') && !line.includes('</')) {
                if (editor.document.getLine(i + 1) && !editor.document.getLine(i + 1).trim()) {
                    const tempLine = editor.document.getLine(i + 2);
                    if (tempLine) {
                        const trimmedTempLine = tempLine.trim();
                        if (trimmedTempLine.includes('</') && trimmedTempLine.startsWith('<')) {
                            // Get the current line's indentation by counting spaces/tabs
                            const openingTagLine = editor.document.getLine(i);
                            const indentMatch = openingTagLine.match(/^[\s\t]*/)[0];
                            // Add 4 more spaces (or equivalent tab) for inner content
                            const extraIndent = '    ';  // 4 spaces for additional indentation

                            return {
                                line: i + 1,
                                ch: indentMatch.length + extraIndent.length
                            };
                        }
                    }
                }
            }
        }

        return false;
    }



    /**
     * This function is responsible to replace the abbreviation in the editor,
     * with its expanded version
     *
     * @param {Editor} editor - the editor instance
     * @param {Object} wordObj -  an object in the format :
     * {
     *      word: "",   // the word before the cursor
     *      start: {line: Number, ch: Number},
     *      end: {line: Number, ch: Number}
     * }
     * @param {String} expandedAbbr - the expanded version of abbr that will replace the abbr
     */
    function updateAbbrInEditor(editor, wordObj, expandedAbbr) {
        // Get the current line's indentation
        const baseIndent = getLineIndentation(editor, wordObj.start);

        // Add proper indentation to the expanded abbreviation
        const indentedAbbr = addIndentation(expandedAbbr, baseIndent);

        // Handle the special case for braces
        // this check is added because in some situations such as
        // `ul>li{Hello}` and the cursor is before the closing braces right after 'o',
        // then when this is expanded it results in an extra closing braces at the end.
        // so we remove the extra closing brace from the end
        if (wordObj.word.includes('{') || wordObj.word.includes('[')) {
            const pos = editor.getCursorPos();
            const line = editor.document.getLine(pos.line);
            const char = line.charAt(wordObj.end.ch);
            const charsNext = line.charAt(wordObj.end.ch + 1);

            if (char === '}' || char === ']') {
                wordObj.end.ch += 1;
            }

            // sometimes at the end we get `"]` as extra with some abbreviations.
            if (char === '"' && charsNext && charsNext === ']') {
                wordObj.end.ch += 2;
            }

        }

        // Replace the abbreviation
        editor.document.replaceRange(
            indentedAbbr,
            wordObj.start,
            wordObj.end
        );

        // Calculate and set the new cursor position
        const cursorPos = findCursorPosition(editor, indentedAbbr, wordObj.start);
        if (cursorPos) {
            editor.setCursorPos(cursorPos.line, cursorPos.ch);
        }
    }


    /**
     * This function checks whether the abbreviation can be expanded or not.
     * There are a lot of cases to check:
     * There should not be any negative symbols
     * The abbr should be either in htmlTags or in markupSnippetsList
     * For other cases such as 'ul>li', we will check if there is any,
     * positive word. This is done to handle complex abbreviations such as,
     * 'ul>li' or 'li*3{Hello}'. So we check if the word includes any positive symbols.
     *
     * @param {Editor} editor - the editor instance
     * @param {String} word - the abbr
     * @param {Object} config - the config object, to make sure it is a valid file type,
     * refer to createConfig function for more info about config object.
     * @returns {String | false} - returns the expanded abbr, and if cannot be expanded, returns false
     */
    function isExpandable(editor, word, config) {

        // make sure that word doesn't contain any negativeSymbols
        if (negativeSymbols.some(symbol => word.includes(symbol))) {
            return false;
        }

        // the word must be either in markupSnippetsList, htmlList or it must have a positive symbol
        // convert to lowercase only for `htmlTags` because HTML tag names are case-insensitive,
        // but `markupSnippetsList` expands abbreviations in a non-tag manner,
        // where the expanded abbreviation is already in lowercase.
        if (markupSnippetsList.includes(word) ||
            htmlTags.includes(word.toLowerCase()) ||
            positiveSymbols.some(symbol => word.includes(symbol))) {

            try {
                const expanded = EXPAND_ABBR(word, config);
                return expanded;
            } catch (error) {

                // emmet api throws an error when abbr contains unclosed quotes, handling that case
                const pos = editor.getCursorPos();
                const line = editor.document.getLine(pos.line);
                const nextChar = line.charAt(pos.ch);

                if (nextChar) {
                    // If the next character is a quote, add quote to abbr
                    if (nextChar === '"' || nextChar === "'") {
                        const modifiedWord = word + nextChar;

                        try {
                            const expandedModified = EXPAND_ABBR(modifiedWord, config);
                            return expandedModified;
                        } catch (innerError) {
                            // If it still fails, return false
                            return false;
                        }
                    }
                }

                // If no quote is found or expansion fails, return false
                return false;
            }
        }

        return false;
    }


    /**
     * Checks for preference changes, to enable/disable the feature
     */
    function preferenceChanged() {
        const value = PreferencesManager.get(PREFERENCES_EMMET);
        enabled = value;
    }

    AppInit.appReady(function () {
        // Set up preferences
        PreferencesManager.on("change", PREFERENCES_EMMET, preferenceChanged);
        preferenceChanged();

        var emmetMarkupHints = new EmmetMarkupHints();
        CodeHintManager.registerHintProvider(emmetMarkupHints, ["html", "php", "jsp"], 2);

    });
});





