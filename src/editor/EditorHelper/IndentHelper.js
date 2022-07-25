/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 * Original work Copyright (c) 2012 - 2021 Adobe Systems Incorporated. All rights reserved.
 *
 * self program is free software: you can redistribute it and/or modify it
 * under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * self program is distributed in the hope that it will be useful, but WITHOUT
 * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
 * FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License
 * for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with self program. If not, see https://opensource.org/licenses/AGPL-3.0.
 *
 */

/**
 * Editor instance helpers for indentation relator editor flows.
 */

define(function (require, exports, module) {

    const _ = require("thirdparty/lodash"),
        CodeMirror = require("thirdparty/CodeMirror/lib/codemirror"),
        PreferencesManager = require("preferences/PreferencesManager"),
        EditorPreferences = require("./EditorPreferences");

    const SOFT_TABS = EditorPreferences.SOFT_TABS;

    /**
     * Helper function for `_handleTabKey()` (case 2) - see comment in that function.
     * @param {Array.<{start:{line:number, ch:number}, end:{line:number, ch:number}, reversed:boolean, primary:boolean}>} selections
     *     The selections to indent.
     */
    function _addIndentAtEachSelection(selections) {
        // eslint-disable-next-line no-invalid-this
        let self = this;
        var instance = self._codeMirror,
            usingTabs = instance.getOption("indentWithTabs"),
            indentUnit = instance.getOption("indentUnit"),
            edits = [];

        _.each(selections, function (sel) {
            var indentStr = "", i, numSpaces;
            if (usingTabs) {
                indentStr = "\t";
            } else {
                numSpaces = indentUnit - (sel.start.ch % indentUnit);
                for (i = 0; i < numSpaces; i++) {
                    indentStr += " ";
                }
            }
            edits.push({edit: {text: indentStr, start: sel.start}});
        });

        self.document.doMultipleEdits(edits);
    }

    /**
     * Helper function for `_handleTabKey()` (case 3) - see comment in that function.
     * @param {Array.<{start:{line:number, ch:number}, end:{line:number, ch:number}, reversed:boolean, primary:boolean}>} selections
     *     The selections to indent.
     */
    function _autoIndentEachSelection(selections) {
        // eslint-disable-next-line no-invalid-this
        let self = this;
        // Capture all the line lengths, so we can tell if anything changed.
        // Note that self function should only be called if all selections are within a single line.
        var instance = self._codeMirror,
            lineLengths = {};
        _.each(selections, function (sel) {
            lineLengths[sel.start.line] = instance.getLine(sel.start.line).length;
        });

        // First, try to do a smart indent on all selections.
        CodeMirror.commands.indentAuto(instance);

        // If there were no code or selection changes, then indent each selection one more indent.
        var changed = false,
            newSelections = self.getSelections();
        if (newSelections.length === selections.length) {
            _.each(selections, function (sel, index) {
                var newSel = newSelections[index];
                if (CodeMirror.cmpPos(sel.start, newSel.start) !== 0 ||
                    CodeMirror.cmpPos(sel.end, newSel.end) !== 0 ||
                    instance.getLine(sel.start.line).length !== lineLengths[sel.start.line]) {
                    changed = true;
                    // Bail - we don't need to look any further once we've found a change.
                    return false;
                }
            });
        } else {
            changed = true;
        }

        if (!changed) {
            CodeMirror.commands.indentMore(instance);
        }
    }

    function _handleTabKey() {
        // eslint-disable-next-line no-invalid-this
        let self = this;
        // Tab key handling is done as follows:
        // 1. If any of the selections are multiline, just add one indent level to the
        //    beginning of all lines that intersect any selection.
        // 2. Otherwise, if any of the selections is a cursor or single-line range that
        //    ends at or after the first non-whitespace character in a line:
        //    - if indentation is set to tabs, just insert a hard tab before each selection.
        //    - if indentation is set to spaces, insert the appropriate number of spaces before
        //      each selection to get to its next soft tab stop.
        // 3. Otherwise (all selections are cursors or single-line, and are in the whitespace
        //    before their respective lines), try to autoindent each line based on the mode.
        //    If none of the cursors moved and no space was added, then add one indent level
        //    to the beginning of all lines.

        // Note that in case 2, we do the "dumb" insertion even if the cursor is immediately
        // before the first non-whitespace character in a line. It might seem more convenient
        // to do autoindent in that case. However, the problem is if that line is already
        // indented past its "proper" location. In that case, we don't want Tab to
        // *outdent* the line. If we had more control over the autoindent algorithm or
        // implemented it ourselves, we could handle that case separately.

        var instance = self._codeMirror,
            selectionType = "indentAuto",
            selections = self.getSelections();

        _.each(selections, function (sel) {
            if (sel.start.line !== sel.end.line) {
                // Case 1 - we found a multiline selection. We can bail as soon as we find one of these.
                selectionType = "indentAtBeginning";
                return false;
            } else if (sel.end.ch > 0 && sel.end.ch >= instance.getLine(sel.end.line).search(/\S/)) {
                // Case 2 - we found a selection that ends at or after the first non-whitespace
                // character on the line. We need to keep looking in case we find a later multiline
                // selection though.
                selectionType = "indentAtSelection";
            }
        });

        switch (selectionType) {
        case "indentAtBeginning":
            // Case 1
            CodeMirror.commands.indentMore(instance);
            break;

        case "indentAtSelection":
            // Case 2
            self._addIndentAtEachSelection(selections);
            break;

        case "indentAuto":
            // Case 3
            self._autoIndentEachSelection(selections);
            break;
        }
    }

    /**
     * @private
     * Handle left arrow, right arrow, backspace and delete keys when soft tabs are used.
     * @param {number} direction Direction of movement: 1 for forward, -1 for backward
     * @param {string} functionName name of the CodeMirror function to call if we handle the key
     */
    function _handleSoftTabNavigation(direction, functionName) {
        // eslint-disable-next-line no-invalid-this
        let self = this;
        var instance = self._codeMirror,
            overallJump = null;

        if (!instance.getOption("indentWithTabs") && PreferencesManager.get(SOFT_TABS)) {
            var indentUnit = instance.getOption("indentUnit");

            _.each(self.getSelections(), function (sel) {
                if (CodeMirror.cmpPos(sel.start, sel.end) !== 0) {
                    // self is a range - it will just collapse/be deleted regardless of the jump we set, so
                    // we can just ignore it and continue. (We don't want to return false in self case since
                    // we want to keep looking at other ranges.)
                    return;
                }

                var cursor = sel.start,
                    jump   = (indentUnit === 0) ? 1 : cursor.ch % indentUnit,
                    line   = instance.getLine(cursor.line);

                // Don't do any soft tab handling if there are non-whitespace characters before the cursor in
                // any of the selections.
                if (line.substr(0, cursor.ch).search(/\S/) !== -1) {
                    jump = null;
                } else if (direction === 1) { // right
                    if (indentUnit) {
                        jump = indentUnit - jump;
                    }

                    // Don't jump if it would take us past the end of the line, or if there are
                    // non-whitespace characters within the jump distance.
                    if (cursor.ch + jump > line.length || line.substr(cursor.ch, jump).search(/\S/) !== -1) {
                        jump = null;
                    }
                } else { // left
                    // If we are on the tab boundary, jump by the full amount,
                    // but not beyond the start of the line.
                    if (jump === 0) {
                        jump = indentUnit;
                    }
                    if (cursor.ch - jump < 0) {
                        jump = null;
                    } else {
                        // We're moving left, so negate the jump.
                        jump = -jump;
                    }
                }

                // Did we calculate a jump, and is self jump value either the first one or
                // consistent with all the other jumps? If so, we're good. Otherwise, bail
                // out of the foreach, since as soon as we hit an inconsistent jump we don't
                // have to look any further.
                if (jump !== null &&
                    (overallJump === null || overallJump === jump)) {
                    overallJump = jump;
                } else {
                    overallJump = null;
                    return false;
                }
            });
        }

        if (overallJump === null) {
            // Just do the default move, which is one char in the given direction.
            overallJump = direction;
        }
        instance[functionName](overallJump, "char");
    }

    /**
     * add required helpers to editor
     * @param Editor
     */
    function addHelpers(Editor) {
        // only private Editor APIs should be assigned below. Public APIs should be updated in Editor.js only.
        Editor.prototype._addIndentAtEachSelection = _addIndentAtEachSelection;
        Editor.prototype._autoIndentEachSelection = _autoIndentEachSelection;
        Editor.prototype._handleTabKey = _handleTabKey;
        Editor.prototype._handleSoftTabNavigation = _handleSoftTabNavigation;
    }

    exports.addHelpers =addHelpers;
});
