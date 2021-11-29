/*
 * GNU AGPL-3.0 License
 *
 * Modified Work Copyright (c) 2021 - present core.ai . All rights reserved.
 * Original work Copyright (c) 2016 Alan Hohn
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
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
/*jslint vars: true, plusplus: true, devel: true, nomen: true, indent: 4, maxerr: 50 */
/*global define, brackets */

define(function (require, exports, module) {


    var PreferencesManager = brackets.getModule("preferences/PreferencesManager");

    var prefs = PreferencesManager.getExtensionPrefs("markdownbar");

    var BLANK_LINE = /^\s*$/;
    var NEW_PARA = /^(\s*$|\*\s|\s*\*\s|\d\.\s|\s*\d\.\s|>\s|\|)/;
    var START_MATTER = /^\s*(\*\s+|\d\.\s+|>\s+|\|\s+)/;
    var LAST_WHITESPACE = /\s\S*$/;

    function _repeat(str, n) {
        var i, output = '';
        for (i = 0; i < n; i++) {
            output += str;
        }
        return output;
    }

    function _makeLineParagraph(editor, lineNum) {
        var thisLine = editor.document.getLine(lineNum);
        if (!BLANK_LINE.test(thisLine)) {
            var nextLine = editor.document.getLine(lineNum + 1);
            if (!NEW_PARA.test(nextLine)) {
                var loc = {line: lineNum + 1, ch: 0};
                editor.document.replaceRange('\n', loc, loc, "+mdpara");
            }
        }
    }

    function _findParagraphStart(editor, fromLine) {
        var curLine = fromLine;
        while (curLine > 0) {
            var line = editor.document.getLine(curLine);
            if (BLANK_LINE.test(line)) {
                return curLine + 1;
            } else if (NEW_PARA.test(line)) {
                return curLine;
            }
            curLine--;
        }
        return 0;
    }

    function _reflowParagraph(editor, startLine, maxLength) {
        var curLine = startLine;
        var line = editor.document.getLine(curLine);
        if (!line) {
            return;
        }
        var input = line;
        var output = "";
        var startMatter = "";
        var startSearch = START_MATTER.exec(line);
        if (startSearch) {
            startMatter = _repeat(" ", startSearch[0].length);
        }
        while (true) {
            while (input.length > maxLength) {
                var search = input.substring(0, maxLength - 1);
                var result = LAST_WHITESPACE.exec(search);
                if (result) {
                    output += input.substring(0, result.index) + "\n" + startMatter;
                    input = input.substring(result.index + 1);
                } else {
                    // Line with no whitespace, bail
                    break;
                }
            }
            line = editor.document.getLine(curLine + 1);
            if (line && !NEW_PARA.test(line)) {
                curLine++;
                input = input.trim() + " " + line.trim();
            } else {
                break;
            }
        }
        output += input + "\n";
        var start = {line: startLine, ch: 0};
        var end = {line: curLine + 1, ch: 0};
        editor.document.replaceRange(output, start, end, "+mdflow");
    }

    function _reflowSelections(editor, maxLength) {
        var selections = editor.getSelections();
        var i, j, firstLine = Number.MAX_VALUE;
        for (i = selections.length - 1; i >= 0; i--) {
            var startLine = selections[i].start.line;
            var endLine = selections[i].end.line;
            if (selections[i].end.ch === 0) {
                endLine--;
            }
            for (j = endLine; j >= startLine; j--) {
                if (j < firstLine) {
                    var paraStart = _findParagraphStart(editor, j);
                    firstLine = paraStart;
                    _reflowParagraph(editor, paraStart, maxLength);
                }
            }
        }
    }

    function _insertLine(editor, lineno, line) {
        var pos = {line: lineno, ch: 0};
        editor.document.replaceRange(line, pos, pos, "+mdbar");
    }

    exports.paragraph = function (editor) {
        if (editor.hasSelection()) {
            var selections = editor.getSelections();
            var i, j;
            for (i = selections.length - 1; i >= 0; i--) {
                var startLine = selections[i].start.line;
                var endLine = selections[i].end.line;
                if (selections[i].end.ch === 0) {
                    endLine--;
                }
                for (j = endLine; j >= startLine; j--) {
                    _makeLineParagraph(editor, j);
                }
            }
        } else {
            var cursor = editor.getCursorPos(false, "to");
            _makeLineParagraph(editor, cursor.line);
        }
    };

    exports.reflow = function (editor) {
        var maxLength = prefs.get("maxLength");
        if (editor.hasSelection()) {
            _reflowSelections(editor, maxLength);
        } else {
            var cursor = editor.getCursorPos(false, "to");
            var startLine = _findParagraphStart(editor, cursor.line);
            _reflowParagraph(editor, startLine, maxLength);
        }
    };

    exports.codeblock = function (editor) {
        if (editor.hasSelection()) {
            var i, selections = editor.getSelections();
            for (i = selections.length - 1; i >= 0; i--) {
                var startLine = selections[i].start.line;
                var endLine = selections[i].end.line + 1;
                if (selections[i].end.ch === 0) {
                    endLine--;
                }
                _insertLine(editor, endLine, '```\n\n');
                _insertLine(editor, startLine, '\n```\n');
            }
        } else {
            var cursor = editor.getCursorPos(false, "to");
            _insertLine(editor, cursor.line, '\n```\n\n```\n\n');
            editor.setCursorPos({line: cursor.line + 2, ch: 0});
        }
    };

});
