/*
* The MIT License (MIT)
*
* Copyright (c) 2016 Alan Hohn
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
/*global define */

define(function (require, exports, module) {


    var MATCH_NONBLANK = /\S/;

    /**
     * Perform the provided action on every non-blank
     * line in every selection (single or multiple).
     * If the action returns an object, check if it
     * indicates done, in which case return its result.
     *
     * Note that in CodeMirror a selection that includes
     * the final newline is indicated by the selection
     * ending at column 0 of the following line, so we
     * have to handle that case.
     */
    function _everySelectionLine(editor, fn) {
        var i, selections = editor.getSelections();
        for (i = 0; i < selections.length; i++) {
            var j, start = selections[i].start.line;
            var end = (selections[i].end.ch === 0
                    ? selections[i].end.line : selections[i].end.line + 1);
            for (j = start; j < end; j++) {
                var line = editor.document.getLine(j);
                if (MATCH_NONBLANK.test(line)) {
                    var state = fn(j, line);
                    if (state && state.done) {
                        return state.result;
                    }
                }
            }
        }
    }

    function _turnLineOn(editor, lineno, line, replaceRE, afterRE, insert) {
        var loc, after = null;
        var replace = replaceRE.exec(line);
        if (replace) {
            after = (afterRE ? afterRE.exec(replace[0]) : null);
            var s = (after ? after[0] : "");
            loc = {line: lineno, ch: replace.index};
            var endloc = {line: lineno, ch: replace.index + replace[0].length};
            editor.document.replaceRange(s, loc, endloc, "+mdbar");
            loc.ch += s.length;
        } else {
            after = (afterRE ? afterRE.exec(line) : null);
            loc = {line: lineno, ch: (after ? after.index + after[0].length : 0)};
        }
        editor.document.replaceRange(insert, loc, null, "+mdbar");
    }

    function _turnLineOff(editor, lineno, found, preserveRE) {
        var preserve = (preserveRE ? preserveRE.exec(found[0]) : null);
        var replace = (preserve ? preserve[0] : "");
        var loc = {line: lineno, ch: found.index};
        var endloc = {line: lineno, ch: found.index + found[0].length};
        editor.document.replaceRange(replace, loc, endloc, "+mdbar");
    }

    /**
     * Returns true only if all non-blank lines in
     * the selection(s) match the regular expression,
     * or, if no selection, if the cursor line matches.
     */
    exports.allLinesOn = function (editor, regExp) {
        if (editor.hasSelection()) {
            var result = _everySelectionLine(editor, function (lineno, line) {
                if (!regExp.test(line)) {
                    return {done: true, result: false};
                }
            });
            if (typeof result !== 'undefined') {
                return result;
            }
        } else {
            var curLine = editor.getCursorPos(false, "to").line;
            if (!regExp.test(editor.document.getLine(curLine))) {
                return false;
            }
        }
        return true;
    };

    /**
     * For all non-blank lines in the selection(s), or for the
     * cursor line if no selection, insert the provided string if it is
     * not already present (i.e. the regexp does not match). If found,
     * the replaceRE is removed. If the afterRE is found, preserve it and
     * insert the string after it.
     *
     * The replaceRE lets us switch between different kinds of headings
     * or lists by just clicking the desired one rather than having to
     * turn the old one off first. So it's super important even though
     * it makes for a bit of a mess.
     */
    exports.turnLinesOn = function (editor, regexp, replaceRE, afterRE, insert) {
        if (editor.hasSelection()) {
            _everySelectionLine(editor, function (lineno, line) {
                if (!regexp.test(line)) {
                    _turnLineOn(editor, lineno, line, replaceRE, afterRE, insert);
                }
            });
        } else {
            var cursor = editor.getCursorPos(false, "to"),
                line = editor.document.getLine(cursor.line);
            _turnLineOn(editor, cursor.line, line, replaceRE, afterRE, insert);
        }
    };

    /**
     * For all lines in the selection(s), or for the cursor line,
     * remove the matched regular expression, preserving the
     * preserveRE if found within the matched regexp.
     */
    exports.turnLinesOff = function (editor, regexp, preserveRE) {
        if (editor.hasSelection()) {
            _everySelectionLine(editor, function (lineno, line) {
                var found = regexp.exec(line);
                if (found) {
                    _turnLineOff(editor, lineno, found, preserveRE);
                }
            });
        } else {
            var cursor = editor.getCursorPos(false, "to");
            var found = regexp.exec(editor.document.getLine(cursor.line));
            if (found) {
                _turnLineOff(editor, cursor.line, found, preserveRE);
            }
        }
    };

});
