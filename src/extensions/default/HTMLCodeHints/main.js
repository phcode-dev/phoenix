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

define(function (require, exports, module) {

    require("HTMLJumpToDef");

    // Load dependent modules
    const AppInit             = brackets.getModule("utils/AppInit"),
        CodeHintManager     = brackets.getModule("editor/CodeHintManager"),
        HTMLUtils           = brackets.getModule("language/HTMLUtils"),
        PreferencesManager  = brackets.getModule("preferences/PreferencesManager"),
        Strings             = brackets.getModule("strings"),
        NewFileContentManager = brackets.getModule("features/NewFileContentManager"),
        CSSUtils            = brackets.getModule("language/CSSUtils"),
        StringMatch         = brackets.getModule("utils/StringMatch"),
        LiveDevelopment     = brackets.getModule("LiveDevelopment/main"),
        KeyEvent            = brackets.getModule("utils/KeyEvent"),
        Metrics             = brackets.getModule("utils/Metrics"),
        HTMLTags            = require("text!HtmlTags.json"),
        HTMLAttributes      = require("text!HtmlAttributes.json"),
        HTMLTemplate        = require("text!template.html"),
        XHTMLTemplate       = require("text!template.xhtml");

    require("./html-lint");

    const {
        markupSnippets,
        htmlTags,
        positiveSymbols,
        negativeSymbols
    } = require('./emmet-snippets');

    /**
     * The Emmet api's
     */
    const expandAbbr = Phoenix.libs.Emmet.expand;

    /**
     * A list of all the markup snippets that can be expanded.
     * For ex: 'link:css', 'iframe'
     * They expand differently as compared to normal tags.
     * Refer to `./emmet-snippets.js` file for more info.
     */
    const markupSnippetsList = Object.keys(markupSnippets);
    let enabled = true; // whether Emmet is enabled or not in preferences


    let tags,
        attributes;

    PreferencesManager.definePreference("codehint.TagHints", "boolean", true, {
        description: Strings.DESCRIPTION_HTML_TAG_HINTS
    });

    PreferencesManager.definePreference("codehint.AttrHints", "boolean", true, {
        description: Strings.DESCRIPTION_ATTR_HINTS
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

            // check the context before showing emmet hints, because we don't want to show
            // emmet hints when its a Attribute name or value
            // cause for those cases AttrHints should handle it
            const pos = editor.getCursorPos();
            const tagInfo = HTMLUtils.getTagInfo(editor, pos);
            const tokenType = tagInfo.position.tokenType;

            if (tokenType === HTMLUtils.ATTR_NAME || tokenType === HTMLUtils.ATTR_VALUE) {
                return false;
            }

            const wordObj = getWordBeforeCursor(editor);
            // make sure we donot have empty spaces
            if (wordObj.word.trim()) {

                const expandedAbbr = _isExpandable(editor, wordObj.word);
                if (expandedAbbr) {
                    return true;
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

        // Check if the abbreviation is expandable
        const expandedAbbr = _isExpandable(this.editor, wordObj.word);
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
        // Create the main container for the hint
        var $hint = $("<span>")
            .css("margin-right", "48px");

        // Create a wrapper for the text content
        var $textContent = $("<span>")
            .addClass("emmet-text-content")
            .text(abbr);

        // style in brackets_patterns_override.less file
        let $icon = $(`<span class="emmet-html-code-hint">Emmet</span>`);

        // Append both text content and icon to the main container
        $hint.append($textContent);
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
        const expandedAbbr = _isExpandable(this.editor, wordObj.word);
        _updateAbbrInEditor(this.editor, wordObj, expandedAbbr);
        Metrics.countEvent(Metrics.EVENT_TYPE.CODE_HINTS, "emmet", "htmlInsert");
        return false;
    };


    /**
     * Determines whether a given character is allowed as part of an Emmet abbreviation
     *
     * @param {String} char - The character to test
     * @param {Boolean} insideBraces - Flag indicating if we are inside braces (e.g. {} or [])
     * @returns True if the character is valid for an abbreviation
     */
    function _isEmmetChar(char, insideBraces) {
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
    function _findAbbreviationStart(line, cursorCh) {
        let start = cursorCh;
        let insideBraces = false;
        let lastGtPos = -1;

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

            // if we hit '<', this means that we've entered an HTML tag (e.g., <p>, <div>)
            // so in that case we need to return position right after the last '>' (we store it in lastGtPos)
            // use case scenario: "<p>lorem" to extract "lorem" instead of "<p>lorem"
            if (char === '<') {
                if (lastGtPos !== -1) {
                    return lastGtPos + 1;
                }
                break;
            }

            if (char === '>') {
                lastGtPos = start - 1;
            }

            // If the character is valid as part of an Emmet abbreviation, continue scanning backwards
            if (_isEmmetChar(char, insideBraces)) {
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
        const abbreviationStart = _findAbbreviationStart(lineText, pos.ch);

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
        const abbrLines = indentedAbbr.split('\n');

        for (let lineOffset = 0; lineOffset < abbrLines.length; lineOffset++) {
            const abbrLine = abbrLines[lineOffset];

            // Search for empty quotes "" or ''
            for (let j = 0; j < abbrLine.length - 1; j++) {
                const pair = abbrLine[j] + abbrLine[j + 1];

                if (pair === '""' || pair === "''") {
                    const absoluteLine = startPos.line + lineOffset;
                    const absoluteCh = (lineOffset === 0) ? startPos.ch + j + 1 : j + 1;
                    return { line: absoluteLine, ch: absoluteCh };
                }
            }

            // Search for >< pattern (cursor between tags)
            for (let j = 0; j < abbrLine.length - 1; j++) {
                const pair = abbrLine[j] + abbrLine[j + 1];

                if (pair === '><') {
                    const absoluteLine = startPos.line + lineOffset;
                    const absoluteCh = (lineOffset === 0) ? startPos.ch + j + 1 : j + 1;
                    return { line: absoluteLine, ch: absoluteCh };
                }
            }
        }

        // Look for opening and closing tag pairs with empty line in between
        // <body>
        //      |
        // </body>
        // here in such scenarios, we want the cursor to be placed in between
        const totalLines = startPos.line + abbrLines.length;
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
    function _updateAbbrInEditor(editor, wordObj, expandedAbbr) {
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
     * to validate whether a lorem abbreviation is safe to expand without crashing the app
     * so there are many problematic patters like lorem1000000, li*10>lorem50000 etc
     * we put a max constraint of 100000, above which we don't show the code hint at all
     *
     * @param {String} word - the abbreviation to validate
     * @returns {Boolean} - true if safe to expand otherwise false
     */
    function isLoremSafeToExpand(word) {
        const MAX_LOREM_WORDS = 100000;

        // extract all lorem word counts (handles lorem123, loremru123, lorem10-200, etc.)
        const loremPattern = /lorem[a-z]*(\d+)(?:-(\d+))?/gi;
        const loremMatches = [...word.matchAll(loremPattern)];
        // if no lorem is there, it means its safe
        if (loremMatches.length === 0) {
            return true;
        }

        // find the maximum lorem word count
        let maxLoremCount = 0;
        for (const match of loremMatches) {
            const count1 = parseInt(match[1]) || 0;
            // for ranges like lorem10-200, take the second (max) number
            const count2 = match[2] ? parseInt(match[2]) : count1;
            const maxCount = Math.max(count1, count2);
            maxLoremCount = Math.max(maxLoremCount, maxCount);
        }

        // if any single lorem exceeds the limit, for ex: `lorem1000000` or `lorem5000000`
        if (maxLoremCount > MAX_LOREM_WORDS) {
            return false;
        }

        // handle the multiplication cases, for ex: `li*10>lorem500000`
        const multiplierPattern = /\*(\d+)/g;
        const multipliers = [...word.matchAll(multiplierPattern)].map(m => parseInt(m[1]));

        // if no multipliers, just check the max lorem count
        if (multipliers.length === 0) {
            return true;
        }

        // calc total multiplication factor (capped at 400 due to maxRepeat)
        const totalMultiplier = Math.min(
            multipliers.reduce((product, num) => product * num, 1),
            400
        );

        // worst case: max lorem count × total multiplier
        const estimatedTotal = maxLoremCount * totalMultiplier;

        return estimatedTotal <= MAX_LOREM_WORDS;
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
     * @returns {String | null} - returns the expanded abbr, and if cannot be expanded, returns null
     */
    function _isExpandable(editor, word) {
        const pos = editor.getCursorPos();
        const line = editor.document.getLine(pos.line);

        // to prevent hints from appearing in <!DOCTYPE html> line. Also to prevent hints from appearing in comments
        if(line.includes('<!')) {
            return null;
        }

        // not to show emmet hint when either a single or three exclamation mark(s) is present
        if (line.includes('!!') && !line.includes('!!!')) {
            return null;
        }

        // if more than three, then don't show emmet hint
        if(line.includes('!!!!')) {
            return null;
        }

        // make sure that word doesn't contain any negativeSymbols
        if (negativeSymbols.some(symbol => word.includes(symbol))) {
            return null;
        }

        // the word must be either in markupSnippetsList, htmlList or it must have a positive symbol or lorem text
        // convert to lowercase only for `htmlTags` because HTML tag names are case-insensitive,
        // but `markupSnippetsList` expands abbreviations in a non-tag manner,
        // where the expanded abbreviation is already in lowercase.
        if (markupSnippetsList.includes(word) ||
            htmlTags.includes(word.toLowerCase()) ||
            positiveSymbols.some(symbol => word.includes(symbol)) ||
            word.toLowerCase().includes('lorem')
        ) {
            // we need to check if this is safe to expand because cases like
            // `lorem100000000` will crash phoenix
            // read functions jsdoc for more details
            if (word.toLowerCase().includes('lorem') && !isLoremSafeToExpand(word)) {
                return null;
            }

            try {
                return  expandAbbr(word, { syntax: "html", type: "markup", maxRepeat: 400 }); // expanded
            } catch (error) {

                // emmet api throws an error when abbr contains unclosed quotes, handling that case
                const nextChar = line.charAt(pos.ch);

                if (nextChar) {
                    // If the next character is a quote, add quote to abbr
                    if (nextChar === '"' || nextChar === "'") {
                        const modifiedWord = word + nextChar;

                        try {
                            return expandAbbr(modifiedWord, { syntax: "html", type: "markup", maxRepeat: 400 });
                        } catch (innerError) {
                            // If it still fails, return false
                            return null;
                        }
                    }
                }

                // If no quote is found or expansion fails, return false
                return null;
            }
        }

        return null;
    }


    /**
     * @constructor
     */
    function TagHints() {
        this.exclusion = null;
    }

    /**
     * Check whether the exclusion is still the same as text after the cursor.
     * If not, reset it to null.
     */
    TagHints.prototype.updateExclusion = function () {
        var textAfterCursor;
        if (this.exclusion && this.tagInfo) {
            textAfterCursor = this.tagInfo.tagName.substr(this.tagInfo.position.offset);
            if (!CodeHintManager.hasValidExclusion(this.exclusion, textAfterCursor)) {
                this.exclusion = null;
            }
        }
    };

    /**
     * Determines whether HTML tag hints are available in the current editor
     * context.
     *
     * @param {Editor} editor
     * A non-null editor object for the active window.
     *
     * @param {string} implicitChar
     * Either null, if the hinting request was explicit, or a single character
     * that represents the last insertion and that indicates an implicit
     * hinting request.
     *
     * @return {boolean}
     * Determines whether the current provider is able to provide hints for
     * the given editor context and, in case implicitChar is non- null,
     * whether it is appropriate to do so.
     */
    TagHints.prototype.hasHints = function (editor, implicitChar) {
        var pos = editor.getCursorPos();

        this.tagInfo = HTMLUtils.getTagInfo(editor, pos);
        this.editor = editor;
        if (implicitChar === null) {
            if (this.tagInfo.position.tokenType === HTMLUtils.TAG_NAME) {
                if (this.tagInfo.position.offset >= 0) {
                    if (this.tagInfo.position.offset === 0) {
                        this.exclusion = this.tagInfo.tagName;
                    } else {
                        this.updateExclusion();
                    }
                    return true;
                }
            }
            return false;
        }
        if (implicitChar === "<") {
            this.exclusion = this.tagInfo.tagName;
            return true;
        }
        return false;

    };

    /**
     * Returns a list of availble HTML tag hints if possible for the current
     * editor context.
     *
     * @return {jQuery.Deferred|{
     *              hints: Array.<string|jQueryObject>,
     *              match: string,
     *              selectInitial: boolean,
     *              handleWideResults: boolean}}
     * Null if the provider wishes to end the hinting session. Otherwise, a
     * response object that provides:
     * 1. a sorted array hints that consists of strings
     * 2. a string match that is used by the manager to emphasize matching
     *    substrings when rendering the hint list
     * 3. a boolean that indicates whether the first result, if one exists,
     *    should be selected by default in the hint list window.
     * 4. handleWideResults, a boolean (or undefined) that indicates whether
     *    to allow result string to stretch width of display.
     */
    TagHints.prototype.getHints = function (implicitChar) {
        var query,
            result;

        this.tagInfo = HTMLUtils.getTagInfo(this.editor, this.editor.getCursorPos());
        if (this.tagInfo.position.tokenType === HTMLUtils.TAG_NAME) {
            if (this.tagInfo.position.offset >= 0) {
                this.updateExclusion();
                query = this.tagInfo.tagName.slice(0, this.tagInfo.position.offset);
                result = $.map(tags, function (value, key) {
                    if (key.indexOf(query) === 0) {
                        return key;
                    }
                }).sort();

                return {
                    hints: result,
                    match: query,
                    selectInitial: true,
                    handleWideResults: false
                };
            }
        }

        return null;
    };

    /**
     * Inserts a given HTML tag hint into the current editor context.
     *
     * @param {string} hint
     * The hint to be inserted into the editor context.
     *
     * @return {boolean}
     * Indicates whether the manager should follow hint insertion with an
     * additional explicit hint request.
     */
    TagHints.prototype.insertHint = function (completion) {
        var start = {line: -1, ch: -1},
            end = {line: -1, ch: -1},
            cursor = this.editor.getCursorPos(),
            charCount = 0;

        if (this.tagInfo.position.tokenType === HTMLUtils.TAG_NAME) {
            var textAfterCursor = this.tagInfo.tagName.substr(this.tagInfo.position.offset);
            if (CodeHintManager.hasValidExclusion(this.exclusion, textAfterCursor)) {
                charCount = this.tagInfo.position.offset;
            } else {
                charCount = this.tagInfo.tagName.length;
            }
        }

        end.line = start.line = cursor.line;
        start.ch = cursor.ch - this.tagInfo.position.offset;
        end.ch = start.ch + charCount;

        if (this.exclusion || completion !== this.tagInfo.tagName) {
            if (start.ch !== end.ch) {
                this.editor.document.replaceRange(completion, start, end);
            } else {
                this.editor.document.replaceRange(completion, start);
            }
            this.exclusion = null;
        }

        return false;
    };

    /**
     * @constructor
     */
    function AttrHints() {
        this.globalAttributes = this.readGlobalAttrHints();
        this.cachedHints = null;
        this.exclusion = "";
    }

    /**
     * @private
     * Parse the code hints from JSON data and extract all hints from property names.
     * @return {!Array.<string>} An array of code hints read from the JSON data source.
     */
    AttrHints.prototype.readGlobalAttrHints = function () {
        return $.map(attributes, function (value, key) {
            if (value.global === "true") {
                return key;
            }
        });
    };

    const MAX_CLASS_HINTS = 250;
    function formatHints(hints) {
        StringMatch.basicMatchSort(hints);
        if(hints.length > MAX_CLASS_HINTS) {
            hints = hints.splice(0, MAX_CLASS_HINTS);
        }
        return hints.map(function (token) {
            let $hintObj = $(`<span data-val='${token.label || token.value || token.text}'></span>`).addClass("brackets-html-hints brackets-hints");

            // highlight the matched portion of each hint
            if (token.stringRanges) {
                token.stringRanges.forEach(function (item) {
                    if (item.matched) {
                        $hintObj.append($("<span>")
                            .text(item.text)
                            .addClass("matched-hint"));
                    } else {
                        $hintObj.append(item.text);
                    }
                });
            } else {
                $hintObj.text(token.label);
            }
            $hintObj.attr("data-val", token.label);
            return $hintObj;
        });
    }

    function _getAllClassHints(query) {
        let queryStr = query.queryStr;
        // "class1 class2" have multiple classes. the last part is the query to hint
        const segments = queryStr.split(" ");
        queryStr = segments[segments.length-1];
        const deferred = $.Deferred();
        CSSUtils.getAllCssSelectorsInProject({includeClasses: true, scanCurrentHtml: true}).then(hints=>{
            const result = $.map(hints, function (pvalue) {
                pvalue = pvalue.slice(1); // remove.
                if(!pvalue || pvalue.includes("#") || pvalue.includes("\\") || pvalue.includes("/")){
                    return null;
                }
                return  StringMatch.stringMatch(pvalue, queryStr, { preferPrefixMatches: true });
            });
            const validHints = formatHints(result);
            validHints.alreadyMatched = true;
            deferred.resolve(validHints);
        }).catch(console.error);
        return deferred;
    }

    /**
     * Helper function that determines the possible value hints for a given html tag/attribute name pair
     *
     * @param {{queryStr: string}} query
     * The current query
     *
     * @param {string} tagName
     * HTML tag name
     *
     * @param {string} attrName
     * HTML attribute name
     *
     * @return {!Array.<string>|$.Deferred}
     * The (possibly deferred) hints.
     */
    AttrHints.prototype._getValueHintsForAttr = function (query, tagName, attrName) {
        // We look up attribute values with tagName plus a slash and attrName first.
        // If the lookup fails, then we fall back to look up with attrName only. Most
        // of the attributes in JSON are using attribute name only as their properties,
        // but in some cases like "type" attribute, we have different properties like
        // "script/type", "link/type" and "button/type".
        var hints = [];

        if(attrName === "class") {
            return _getAllClassHints(query);
        }

        var tagPlusAttr = tagName + "/" + attrName,
            attrInfo = attributes[tagPlusAttr] || attributes[attrName];

        if (attrInfo) {
            if (attrInfo.type === "boolean") {
                hints = ["false", "true"];
            } else if (attrInfo.attribOption) {
                hints = attrInfo.attribOption;
            }
        }

        return hints;
    };

    /**
     * Check whether the exclusion is still the same as text after the cursor.
     * If not, reset it to null.
     *
     * @param {boolean} attrNameOnly
     * true to indicate that we update the exclusion only if the cursor is inside an attribute name context.
     * Otherwise, we also update exclusion for attribute value context.
     */
    AttrHints.prototype.updateExclusion = function (attrNameOnly) {
        if (this.exclusion && this.tagInfo) {
            var tokenType = this.tagInfo.position.tokenType,
                offset = this.tagInfo.position.offset,
                textAfterCursor;

            if (tokenType === HTMLUtils.ATTR_NAME) {
                textAfterCursor = this.tagInfo.attr.name.substr(offset);
            } else if (!attrNameOnly && tokenType === HTMLUtils.ATTR_VALUE) {
                textAfterCursor = this.tagInfo.attr.value.substr(offset);
            }
            if (!CodeHintManager.hasValidExclusion(this.exclusion, textAfterCursor)) {
                this.exclusion = null;
            }
        }
    };

    const HISTORY_PREFIX = "Live_hint_CSS";
    let hintSessionId = 0, isInLiveHighlightSession = false;

    AttrHints.prototype.onClose = function () {
        if(isInLiveHighlightSession) {
            this.editor.restoreHistoryPoint(`${HISTORY_PREFIX}${hintSessionId}`);
            isInLiveHighlightSession = false;
        }
        hintSessionId++;
    };

    AttrHints.prototype.onHighlight = function ($highlightedEl, _$descriptionElem, reason) {
        if(!reason){
            console.error("OnHighlight called without reason, should never happen!");
            hintSessionId++;
            return;
        }
        const tokenType = this.tagInfo.position.tokenType;
        const currentLivePreviewDetails = LiveDevelopment.getLivePreviewDetails();
        if(!(currentLivePreviewDetails && currentLivePreviewDetails.liveDocument)
            || !(tokenType === HTMLUtils.ATTR_VALUE && this.tagInfo.attr.name === "class")) {
            // live hints only for live previewed page on class attribute values
            return;
        }
        const currentlyEditedFile = this.editor.document.file.fullPath;
        const livePreviewedFile = currentLivePreviewDetails.liveDocument.doc.file.fullPath;
        if(currentlyEditedFile !== livePreviewedFile) {
            // file is not current html file being live previewed. we dont show hints in the case
            return;
        }
        if(reason.source === CodeHintManager.SELECTION_REASON.SESSION_START){
            hintSessionId++;
            this.editor.createHistoryRestorePoint(`${HISTORY_PREFIX}${hintSessionId}`);
            return;
        }
        if(reason.source !== CodeHintManager.SELECTION_REASON.KEYBOARD_NAV){
            return;
        }
        const event = reason.event;
        if(!(event.keyCode === KeyEvent.DOM_VK_UP ||
            event.keyCode === KeyEvent.DOM_VK_DOWN ||
            event.keyCode === KeyEvent.DOM_VK_PAGE_UP ||
            event.keyCode === KeyEvent.DOM_VK_PAGE_DOWN)){
            return;
        }
        Metrics.countEvent(Metrics.EVENT_TYPE.LIVE_PREVIEW, "htmlClassHint", "preview");
        const $hintItem = $highlightedEl.find(".brackets-html-hints");
        const highligtedValue = $highlightedEl.find(".brackets-html-hints").data("val");
        if(!highligtedValue || !$hintItem.is(":visible")){
            return;
        }
        isInLiveHighlightSession = true;
        this.editor._dontDismissPopupOnScroll();
        this.editor.restoreHistoryPoint(`${HISTORY_PREFIX}${hintSessionId}`);
        this.insertHint($highlightedEl.find(".brackets-html-hints"), true);
    };

    /**
     * Determines whether HTML attribute hints are available in the current
     * editor context.
     *
     * @param {Editor} editor
     * A non-null editor object for the active window.
     *
     * @param {string} implicitChar
     * Either null, if the hinting request was explicit, or a single character
     * that represents the last insertion and that indicates an implicit
     * hinting request.
     *
     * @return {boolean}
     * Determines whether the current provider is able to provide hints for
     * the given editor context and, in case implicitChar is non-null,
     * whether it is appropriate to do so.
     */
    AttrHints.prototype.hasHints = function (editor, implicitChar) {
        var pos = editor.getCursorPos(),
            tokenType,
            offset,
            query;

        this.editor = editor;
        this.tagInfo = HTMLUtils.getTagInfo(editor, pos);
        tokenType = this.tagInfo.position.tokenType;
        offset = this.tagInfo.position.offset;
        if (implicitChar === null) {
            query = null;

            if (tokenType === HTMLUtils.ATTR_NAME) {
                if (offset >= 0) {
                    query = this.tagInfo.attr.name.slice(0, offset);
                }
            } else if (tokenType === HTMLUtils.ATTR_VALUE) {
                if (this.tagInfo.position.offset >= 0) {
                    query = this.tagInfo.attr.value.slice(0, offset);
                } else {
                    // We get negative offset for a quoted attribute value with some leading whitespaces
                    // as in <a rel= "rtl" where the cursor is just to the right of the "=".
                    // So just set the queryStr to an empty string.
                    query = "";
                }

                // If we're at an attribute value, check if it's an attribute name that has hintable values.
                const attrName = this.tagInfo.attr.name;
                if (attrName && attrName !== "class") { // class hints are always computed later
                    let hints = this._getValueHintsForAttr({queryStr: query},
                        this.tagInfo.tagName, attrName);
                    if (hints instanceof Array) {
                        // If we got synchronous hints, check if we have something we'll actually use
                        var i, foundPrefix = false;
                        for (i = 0; i < hints.length; i++) {
                            if (hints[i].indexOf(query) === 0) {
                                foundPrefix = true;
                                break;
                            }
                        }
                        if (!foundPrefix) {
                            query = null;
                        }
                    }
                }
            }

            if (offset >= 0) {
                if (tokenType === HTMLUtils.ATTR_NAME && offset === 0) {
                    this.exclusion = this.tagInfo.attr.name;
                } else {
                    this.updateExclusion(false);
                }
            }

            return query !== null;
        }
        if (implicitChar === " " || implicitChar === "'" ||
                    implicitChar === "\"" || implicitChar === "=") {
            if (tokenType === HTMLUtils.ATTR_NAME) {
                this.exclusion = this.tagInfo.attr.name;
            }
            return true;
        }
        return false;

    };

    /**
     * Returns a list of availble HTML attribute hints if possible for the
     * current editor context.
     *
     * @return {jQuery.Deferred|{
     *              hints: Array.<string|jQueryObject>,
     *              match: string,
     *              selectInitial: boolean,
     *              handleWideResults: boolean}}
     * Null if the provider wishes to end the hinting session. Otherwise, a
     * response object that provides:
     * 1. a sorted array hints that consists of strings
     * 2. a string match that is used by the manager to emphasize matching
     *    substrings when rendering the hint list
     * 3. a boolean that indicates whether the first result, if one exists,
     *    should be selected by default in the hint list window.
     * 4. handleWideResults, a boolean (or undefined) that indicates whether
     *    to allow result string to stretch width of display.
     */
    AttrHints.prototype.getHints = function (implicitChar) {
        var cursor = this.editor.getCursorPos(),
            query = {queryStr: null},
            tokenType,
            offset,
            result = [];

        this.tagInfo = HTMLUtils.getTagInfo(this.editor, cursor);
        tokenType = this.tagInfo.position.tokenType;
        offset = this.tagInfo.position.offset;
        if (tokenType === HTMLUtils.ATTR_NAME || tokenType === HTMLUtils.ATTR_VALUE) {
            query.tag = this.tagInfo.tagName;

            if (offset >= 0) {
                if (tokenType === HTMLUtils.ATTR_NAME) {
                    query.queryStr = this.tagInfo.attr.name.slice(0, offset);
                } else {
                    query.queryStr = this.tagInfo.attr.value.slice(0, offset);
                    query.attrName = this.tagInfo.attr.name;
                }
                this.updateExclusion(false);
            } else if (tokenType === HTMLUtils.ATTR_VALUE) {
                // We get negative offset for a quoted attribute value with some leading whitespaces
                // as in <a rel= "rtl" where the cursor is just to the right of the "=".
                // So just set the queryStr to an empty string.
                query.queryStr = "";
                query.attrName = this.tagInfo.attr.name;
            }

            query.usedAttr = HTMLUtils.getTagAttributes(this.editor, cursor);
        }

        if (query.tag && query.queryStr !== null) {
            var tagName = query.tag,
                attrName = query.attrName,
                filter = query.queryStr,
                unfiltered = [],
                hints;

            if (attrName) {
                hints = this._getValueHintsForAttr(query, tagName, attrName);
            } else if (tags && tags[tagName] && tags[tagName].attributes) {
                unfiltered = tags[tagName].attributes.concat(this.globalAttributes);
                hints = $.grep(unfiltered, function (attr, i) {
                    return $.inArray(attr, query.usedAttr) < 0;
                });
            }

            if (hints instanceof Array && hints.length) {
                console.assert(!result.length);
                result = $.map(hints, function (item) {
                    if (item.indexOf(filter) === 0) {
                        return item;
                    }
                }).sort();
                return {
                    hints: result,
                    match: query.queryStr,
                    selectInitial: true,
                    handleWideResults: false
                };
            } else if (hints instanceof Object && hints.hasOwnProperty("done")) { // Deferred hints
                var deferred = $.Deferred();
                hints.done(function (asyncHints) {
                    deferred.resolveWith(this, [{
                        hints: asyncHints,
                        match: asyncHints.alreadyMatched? null: query.queryStr,
                        selectInitial: true,
                        handleWideResults: false
                    }]);
                });
                return deferred;
            }
            return null;

        }


    };

    /**
     * Inserts a given HTML attribute hint into the current editor context.
     *
     * @param {string} completion
     * The hint to be inserted into the editor context.
     *
     * @return {boolean}
     * Indicates whether the manager should follow hint insertion with an
     * additional explicit hint request.
     */
    AttrHints.prototype.insertHint = function (completion, isLiveHighlight) {
        var cursor = this.editor.getCursorPos(),
            start = {line: -1, ch: -1},
            end = {line: -1, ch: -1},
            tokenType = this.tagInfo.position.tokenType,
            offset = this.tagInfo.position.offset,
            charCount = 0,
            insertedName = false,
            replaceExistingOne = this.tagInfo.attr.valueAssigned,
            endQuote = "",
            shouldReplace = true,
            positionWithinAttributeVal = false,
            textAfterCursor;

        if (tokenType === HTMLUtils.ATTR_NAME) {
            textAfterCursor = this.tagInfo.attr.name.substr(offset);
            if (CodeHintManager.hasValidExclusion(this.exclusion, textAfterCursor)) {
                charCount = offset;
                replaceExistingOne = false;
            } else {
                charCount = this.tagInfo.attr.name.length;
            }
            // Append an equal sign and two double quotes if the current attr is not an empty attr
            // and then adjust cursor location before the last quote that we just inserted.
            if (!replaceExistingOne && attributes && attributes[completion] &&
                    attributes[completion].type !== "flag") {
                completion += "=\"\"";
                insertedName = true;
            } else if (completion === this.tagInfo.attr.name) {
                shouldReplace = false;
            }
        } else if (tokenType === HTMLUtils.ATTR_VALUE) {
            textAfterCursor = this.tagInfo.attr.value.substr(offset);
            if (CodeHintManager.hasValidExclusion(this.exclusion, textAfterCursor)) {
                charCount = offset;
                // Set exclusion to null only after attribute value insertion,
                // not after attribute name insertion since we need to keep it
                // for attribute value insertion.
                this.exclusion = null;
            } else {
                charCount = this.tagInfo.attr.value.length;
            }

            if(this.tagInfo.attr.name === "class") {
                // css class hints
                completion = completion.data("val");
                // "anotherClass class<cursor>name" . completion = classics , we have to match a prefix after space
                const textBeforeCursor = this.tagInfo.attr.value.slice(0, offset);
                let lastSegment = textBeforeCursor.split(" ");
                lastSegment = lastSegment[lastSegment.length-1];
                offset = lastSegment.length;
                charCount = offset;
                positionWithinAttributeVal = true;
            }

            if (!this.tagInfo.attr.hasEndQuote) {
                endQuote = this.tagInfo.attr.quoteChar;
                if (endQuote) {
                    completion += endQuote;
                } else if (offset === 0) {
                    completion = "\"" + completion + "\"";
                }
            } else if (completion === this.tagInfo.attr.value) {
                shouldReplace = false;
            }
        }

        end.line = start.line = cursor.line;
        start.ch = cursor.ch - offset;
        end.ch = start.ch + charCount;

        if(isLiveHighlight) {
            // this is via user press up and down arrows when code hints is visible
            if(!this.editor.hasSelection()){
                const initialOffset = this.tagInfo.position.offset;
                textAfterCursor = this.tagInfo.attr.value.substr(initialOffset);
                let firstSegment = textAfterCursor.split(" ");
                firstSegment = firstSegment[0]; // "name"
                end.ch = end.ch + firstSegment.length;
                this.editor.setSelection(start, end);
            }
            this.editor.replaceSelection(completion, 'around', "liveHints");
            return true;
        }

        // this is commit flow
        if(isInLiveHighlightSession) {
            // end previous highlight session.
            isInLiveHighlightSession = false;
            hintSessionId++;
        }

        if(this.editor.hasSelection()){
            // this is when user commits in a live selection
            this.editor.replaceSelection(completion, 'end');
            return true;
        }

        if (shouldReplace) {
            if (start.ch !== end.ch) {
                this.editor.document.replaceRange(completion, start, end);
            } else {
                this.editor.document.replaceRange(completion, start);
            }
        }

        if(positionWithinAttributeVal){
            this.editor.setCursorPos(start.line, start.ch + completion.length);
            // we're now inside the double-quotes we just inserted
        } else if (insertedName) {
            this.editor.setCursorPos(start.line, start.ch + completion.length - 1);

            // Since we're now inside the double-quotes we just inserted,
            // immediately pop up the attribute value hint.
            return true;
        } else if (tokenType === HTMLUtils.ATTR_VALUE && this.tagInfo.attr.hasEndQuote) {
            // Move the cursor to the right of the existing end quote after value insertion.
            this.editor.setCursorPos(start.line, start.ch + completion.length + 1);
        }

        return false;
    };

    /**
     * @constructor
     */
    function NewDocContentProvider() {
        this.CONTENT_PROVIDER_NAME = "HTMLCodeHints";
    }

    NewDocContentProvider.prototype.getContent = function(fileName) {
        return new Promise((resolve, reject)=>{
            if(fileName.endsWith(".xhtml")){
                resolve(XHTMLTemplate);
                return;
            }
            resolve(HTMLTemplate);
        });
    };

    /**
     * Checks for preference changes, to enable/disable Emmet
     */
    function preferenceChanged() {
        enabled = PreferencesManager.get("emmet");
    }


    AppInit.appReady(function () {
        // Parse JSON files
        tags = JSON.parse(HTMLTags);
        attributes = JSON.parse(HTMLAttributes);

        // Register code hint providers
        let tagHints = new TagHints();
        let attrHints = new AttrHints();
        let newDocContentProvider = new NewDocContentProvider();
        CodeHintManager.registerHintProvider(tagHints, ["html"], 0);
        CodeHintManager.registerHintProvider(attrHints, ["html"], 0);
        NewFileContentManager.registerContentProvider(newDocContentProvider, ["html"], 0);

        PreferencesManager.on("change", "emmet", preferenceChanged);
        preferenceChanged();

        var emmetMarkupHints = new EmmetMarkupHints();
        CodeHintManager.registerHintProvider(emmetMarkupHints, ["html", "php"], 0);

        // For unit testing
        exports.emmetHintProvider = emmetMarkupHints;
        exports.tagHintProvider = tagHints;
        exports.attrHintProvider = attrHints;
    });
});
