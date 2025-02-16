/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 * Original work Copyright (c) 2013 - 2021 Adobe Systems Incorporated. All rights reserved.
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
 * Manages tickmarks shown along the scrollbar track.
 * NOT yet intended for use by anyone other than the FindReplace module.
 * It is assumed that markers are always clear()ed when switching editors.
 */
define(function (require, exports, module) {


    var _ = require("thirdparty/lodash");

    var WorkspaceManager = require("view/WorkspaceManager");


    /**
     * Editor the markers are currently shown for, or null if not shown
     * @type {?Editor}
     * @private
     */
    var editor;

    /**
     * Top of scrollbar track area, relative to top of scrollbar
     * @type {number}
     * @private
     */
    var trackOffset;

    /**
     * Height of scrollbar track area
     * @type {number}
     * @private
     */
    var trackHt;

    /**
     * Text positions of markers
     * @type {!{line: number, ch: number}} Array
     * @private
     */
    var marks = [];

    /**
     * Tickmark markCurrent() last called on, or null if never called / called with -1.
     * @type {?jQueryObject}
     * @private
     */
    var $markedTickmark;

    /**
     * Vertical space above and below the scrollbar
     * @type {number}
     * @private
     */
    var scrollbarTrackOffset;

    switch (brackets.platform) {
    case "win": // Custom scrollbar CSS has no gap around the track
        scrollbarTrackOffset = 0;
        break;
    case "mac": // Native scrollbar has padding around the track
        scrollbarTrackOffset = 4;
        break;
    case "linux": // Custom scrollbar CSS has assymmetrical gap; this approximates it
        scrollbarTrackOffset = 2;
        break;
    }

    /**
     * Vertical space above and below the scrollbar.
     * @return {number} amount Value in pixels
     */
    function getScrollbarTrackOffset() {
        return scrollbarTrackOffset;
    }

    /**
     * Sets how much vertical space there's above and below the scrollbar, which depends
     * on the OS and may also be affected by extensions
     * @param {number} offset Value in pixels
     */
    function setScrollbarTrackOffset(offset) {
        scrollbarTrackOffset = offset;
    }


    function _getScrollbar(editorInstance) {
        // Be sure to select only the direct descendant, not also elements within nested inline editors
        return $(editorInstance.getRootElement()).children(".CodeMirror-vscrollbar");
    }

    /**
     * Measure scrollbar track
     * @private
     */
    function _calcScaling() {
        var $sb = _getScrollbar(editor);

        trackHt = $sb[0].offsetHeight;

        if (trackHt > 0) {
            trackOffset = getScrollbarTrackOffset();
            trackHt -= trackOffset * 2;
        } else {
            // No scrollbar: use the height of the entire code content
            var codeContainer = $(editor.getRootElement())
                .find("> .CodeMirror-scroll > .CodeMirror-sizer > div > .CodeMirror-lines > div")[0];
            trackHt = codeContainer.offsetHeight;
            trackOffset = codeContainer.offsetTop;
        }
    }

    function _getTop(editorInstance, pos) {
        let cm = editorInstance._codeMirror,
            editorHt = cm.getScrollerElement().scrollHeight,
            cursorTop;

        let wrapping = cm.getOption("lineWrapping"),
            singleLineH = wrapping && cm.defaultTextHeight() * 1.5;
        let curLine = pos.line;
        let curLineObj = cm.getLineHandle(curLine);
        if (wrapping && curLineObj.height > singleLineH) {
            cursorTop = cm.charCoords(pos, "local").top;
        } else {
            cursorTop = cm.heightAtLine(curLineObj, "local");
        }
        // return top
        return (Math.round(cursorTop / editorHt * trackHt) + trackOffset) - 1; // 1px Centering correction
    }

    const MARKER_HEIGHT = 2;

    /**
     * Add merged tickmarks to the scrollbar track
     * @private
     */
    function _renderMarks(posArray) {
        let cm = editor._codeMirror,
            editorHt = cm.getScrollerElement().scrollHeight;

        let wrapping = cm.getOption("lineWrapping"),
            singleLineH = wrapping && cm.defaultTextHeight() * 1.5,
            curLine = null,
            curLineObj = null;

        function getY(pos) {
            if (curLine !== pos.line) {
                curLine = pos.line;
                curLineObj = cm.getLineHandle(curLine);
            }
            if (wrapping && curLineObj.height > singleLineH) {
                return cm.charCoords(pos, "local").top;
            }
            return cm.heightAtLine(curLineObj, "local");
        }

        var markPositions = [];

        // Convert line positions to scrollbar positions
        posArray.forEach(function (pos) {
            var cursorTop = getY(pos),
                top = Math.round(cursorTop / editorHt * trackHt) + trackOffset;
            top--; // Centering correction
            markPositions.push({ top: top, bottom: top + MARKER_HEIGHT }); // Default height is 2px
        });

        // Sort positions by top coordinate
        markPositions.sort((a, b) => a.top - b.top);

        // Merge overlapping or adjacent tickmarks
        var mergedMarks = [];
        markPositions.forEach(({ top, bottom }) => {
            if (mergedMarks.length > 0) {
                let lastMark = mergedMarks[mergedMarks.length - 1];

                if (top <= lastMark.bottom + 1) {
                    // Extend the existing mark
                    lastMark.bottom = Math.max(lastMark.bottom, bottom);
                    lastMark.height = lastMark.bottom - lastMark.top; // Adjust height
                    return;
                }
            }
            // Create a new mark
            mergedMarks.push({ top, bottom, height: bottom - top });
        });

        // Generate and insert tickmarks into the DOM
        var html = mergedMarks.map(({ top, height }) =>
            `<div class='tickmark' style='top:${top}px; height:${height}px;'></div>`
        ).join("");

        $(".tickmark-track", editor.getRootElement()).append($(html));
    }


    /**
     * Clear any markers in the editor's tickmark track, but leave it visible. Safe to call when
     * tickmark track is not visible also.
     */
    function clear() {
        if (editor) {
            $(".tickmark-track", editor.getRootElement()).empty();
            marks = [];
            $markedTickmark = null;
        }
    }

    /**
     * Add or remove the tickmark track from the editor's UI
     */
    function setVisible(curEditor, visible) {
        // short-circuit no-ops
        if ((visible && curEditor === editor) || (!visible && !editor)) {
            return;
        }

        if (visible) {
            console.assert(!editor);
            editor = curEditor;

            // Don't support inline editors yet - search inside them is pretty screwy anyway (#2110)
            if (editor.isTextSubset()) {
                return;
            }

            var $sb = _getScrollbar(editor),
                $overlay = $("<div class='tickmark-track'></div>");
            $sb.parent().append($overlay);

            _calcScaling();

            // Update tickmarks during editor resize (whenever resizing has paused/stopped for > 1/3 sec)
            WorkspaceManager.on("workspaceUpdateLayout.ScrollTrackMarkers", _.debounce(function () {
                if (marks.length) {
                    _calcScaling();
                    $(".tickmark-track", editor.getRootElement()).empty();
                    _renderMarks(marks);
                }
            }, 300));

        } else {
            console.assert(editor === curEditor);
            $(".tickmark-track", curEditor.getRootElement()).remove();
            editor = null;
            marks = [];
            WorkspaceManager.off("workspaceUpdateLayout.ScrollTrackMarkers");
        }
    }

    /**
     * Add tickmarks to the editor's tickmark track, if it's visible
     * @param {!Editor} curEditor
     * @param {!{line:Number, ch:Number}} posArray
     */
    function addTickmarks(curEditor, posArray) {
        console.assert(editor === curEditor);

        marks = marks.concat(posArray);
        _renderMarks(posArray);
    }

    /**
     * @param {number} index Either -1, or an index into the array passed to addTickmarks()
     */
    function markCurrent(index) {
        // Remove previous highlight first
        if ($markedTickmark) {
            $markedTickmark.remove();
            $markedTickmark = null;
        }
        if (index !== -1) {
            const parkPos = marks[index];
            const top = _getTop(editor, parkPos);
            $markedTickmark = $(
                `<div class='tickmark tickmark-current' style='top:${top}px; height:${MARKER_HEIGHT}px;'></div>`);
            $(".tickmark-track ").append($markedTickmark);
        }
    }

    // Private helper for unit tests
    function _getTickmarks() {
        return marks;
    }


    // For unit tests
    exports._getTickmarks   = _getTickmarks;

    exports.clear           = clear;
    exports.setVisible      = setVisible;
    exports.addTickmarks    = addTickmarks;
    exports.markCurrent     = markCurrent;

    exports.getScrollbarTrackOffset = getScrollbarTrackOffset;
    exports.setScrollbarTrackOffset = setScrollbarTrackOffset;
});
