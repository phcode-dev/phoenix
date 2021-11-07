/*jslint vars: true, plusplus: true, devel: true, nomen: true, indent: 4, maxerr: 50 */
/*global define */

define(function (require, exports, module) {
    "use strict";

    /**
     * Perform the provided action on every selection
     * (single or multiple). If the action returns an
     * object, check if it indicates done, in which case
     * return its result.
     */
    function _everySelection(editor, fn) {
        var i, selections = editor.getSelections();
        for (i = 0; i < selections.length; i++) {
            var state = fn(selections[i]);
            if (state && state.done) {
                return state.result;
            }
        }
    }

    /**
     * Returns true if the specified range is immediately
     * preceeded by and immediately followed by the
     * specified string
     */
    function _match(editor, match, start, end) {
        var matchLength = match.length;
        if (matchLength < 1) {
            return false;
        }
        var startMatch = '';
        if (start.ch >= matchLength) {
            var preStart = {line: start.line,
                         ch: start.ch - matchLength};
            startMatch = editor.document.getRange(preStart, start);
        }
        var postEnd = {line: end.line, ch: end.ch + matchLength};
        var endMatch = editor.document.getRange(end, postEnd);
        return (startMatch === match && endMatch === match);
    }

    /**
     * Determines if the specified range is "on" (i.e. that
     * it is immediately preceded by and immediately followed
     * by the contents of "match" but not by the contents of
     * "badMatch").
     */
    function _isOn(editor, match, badMatch, start, end) {
        return _match(editor, match, start, end) &&
            !_match(editor, badMatch, start, end);
    }

    function _turnOn(editor, start, end, insert) {
        // Doing the replace this way gets rid of the current
        // selection(s), which is undesirable but preferable
        // to messing the selection up, which is what two separate
        // inserts does. At least undo works well with this method.
        var existing = editor.document.getRange(start, end);
        editor.document.replaceRange(insert + existing + insert, start, end, "+mdbar");
    }

    function _turnOff(editor, start, end, remove) {
        var preStart = {line: start.line, ch: start.ch - remove.length};
        // Shifted by the time we use it
        var preEnd = {line: end.line, ch: end.ch - remove.length};
        editor.document.replaceRange("", preStart, start, "+mdbar");
        editor.document.replaceRange("", preEnd, end, "+mdbar");
    }

    /**
     * Determines if all selections are on (see isOn above).
     * If no selection, uses the current cursor position.
     */
    exports.allSelectionsOn = function (editor, match, badMatch) {
        if (editor.hasSelection()) {
            var result = _everySelection(editor, function (selection) {
                if (!_isOn(editor, match, badMatch, selection.start, selection.end)) {
                    return {done: true, result: false};
                }
            });
            if (typeof result !== 'undefined') {
                return result;
            }
        } else {
            var cursor = editor.getCursorPos(false, "to");
            return _isOn(editor, match, badMatch, cursor, cursor);
        }
        return true;
    };

    /**
     * For every selection, or for the cursor line if no selection,
     * insert the provided string if it is not already present at
     * both the start and end of the selection.
     */
    exports.turnSelectionsOn = function (editor, insert, badMatch) {
        if (editor.hasSelection()) {
            _everySelection(editor, function (selection) {
                if (!_isOn(editor, insert, badMatch, selection.start, selection.end)) {
                    _turnOn(editor, selection.start, selection.end, insert);
                    selection.end = {line: selection.end.line, ch: selection.end.ch - insert.length};
                }
            });
        } else {
            var cursor = editor.getCursorPos(false, "to");
            _turnOn(editor, cursor, cursor, insert);
            editor.setCursorPos({line: cursor.line, ch: cursor.ch + insert.length});
        }
    };

    /**
     * For every selection, or for the cursor line if no selection,
     * remove the provided string if it is present at both the
     * start and end of the selection.
     */
    exports.turnSelectionsOff = function (editor, remove, badMatch) {
        if (editor.hasSelection()) {
            _everySelection(editor, function (selection) {
                if (_isOn(editor, remove, badMatch, selection.start, selection.end)) {
                    _turnOff(editor, selection.start, selection.end, remove);
                }
            });
        } else {
            var cursor = editor.getCursorPos(false, "to");
            _turnOff(editor, cursor, cursor, remove);
            //editor.setCursorPos({line: cursor.line, ch: cursor.ch + remove.length});
        }
    };

});
