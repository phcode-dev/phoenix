/*
 * GNU AGPL-3.0 License
 *
 * Modified Work Copyright (c) 2021 - present core.ai . All rights reserved.
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


    var EditorManager   = brackets.getModule("editor/EditorManager"),
        PerfUtils       = brackets.getModule("utils/PerfUtils");

    // https://paulirish.com/2011/requestanimationframe-for-smart-animating/
    // shim layer with setTimeout fallback
    var requestAnimFrame = (function () {
        return window.requestAnimationFrame    ||
            window.webkitRequestAnimationFrame ||
            window.mozRequestAnimationFrame    ||
            window.oRequestAnimationFrame      ||
            window.msRequestAnimationFrame     ||
            function (callback) {
                window.setTimeout(callback, 1000 / 60);
            };
    }());

    var STRING_FIRSTPAINT        = "Typing Speed: First repaint",
        STRING_PAINTBEFORECHANGE = "Typing Speed: Paint before DOM update",
        STRING_ONCHANGE          = "Typing Speed: DOM update complete",
        STRING_PAINTAFTERCHANGE  = "Typing Speed: Paint after DOM update";

    function _getInputField(editor) {
        return editor._codeMirror.getInputField();
    }

    /**
     * Installs input event handler on the current editor (full or inline).
     */
    function initTypingSpeedLogging() {
        var editor = null,
            inputField = null,
            inProgress = false;

        var inputChangedHandler = function () {
            // CodeMirror's fastPoll will batch up input events into a consolidated change
            if (inProgress) {
                return;
            }

            inProgress = true;

            // use a single markStart call so all start times are the same
            PerfUtils.markStart([
                STRING_FIRSTPAINT,
                STRING_PAINTBEFORECHANGE,
                STRING_ONCHANGE,
                STRING_PAINTAFTERCHANGE
            ]);

            var repaintBeforeChangeHandler = function () {
                if (PerfUtils.isActive(STRING_FIRSTPAINT)) {
                    PerfUtils.addMeasurement(STRING_FIRSTPAINT);
                }

                if (PerfUtils.isActive(STRING_ONCHANGE)) {
                    // don't know which paint event will be the last one,
                    // so keep updating measurement until we hit onChange
                    PerfUtils.updateMeasurement(STRING_PAINTBEFORECHANGE);
                    requestAnimFrame(repaintBeforeChangeHandler);
                }
            };

            var repaintAfterChangeHandler = function () {
                PerfUtils.addMeasurement(STRING_PAINTAFTERCHANGE);

                // need to tell PerfUtils that we are done updating this measurement
                PerfUtils.finalizeMeasurement(STRING_PAINTBEFORECHANGE);

                inProgress = false;
            };

            var onChangeHandler = function (event, editor, change) {
                PerfUtils.addMeasurement(STRING_ONCHANGE);
                editor.off("change.typingSpeedLogger", onChangeHandler);

                requestAnimFrame(repaintAfterChangeHandler);
            };

            requestAnimFrame(repaintBeforeChangeHandler);
            editor.on("change.typingSpeedLogger", onChangeHandler);
        };

        var updateFocusedEditor = function (focusedEditor) {
            if (editor) {
                inputField.removeEventListener("input", inputChangedHandler, true);
            }

            if (focusedEditor) {
                editor = focusedEditor;
                inputField = _getInputField(focusedEditor);

                // Listen for input changes in the capture phase, before
                // CodeMirror's event handling.
                inputField.addEventListener("input", inputChangedHandler, true);
            }
        };

        EditorManager.on("activeEditorChange", function (event, focusedEditor) {
            updateFocusedEditor(focusedEditor);
        });
        updateFocusedEditor(EditorManager.getFocusedEditor());
    }

    (function () {
        initTypingSpeedLogging();
    }());
});
