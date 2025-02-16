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
 *
 * Modified to allow each Editor to store its own scroll track markers via
 * `editor._scrollTrackMarker`.
 */
define(function (require, exports, module) {

    const _                 = require("thirdparty/lodash"),
        EditorManager = require("editor/EditorManager"),
        WorkspaceManager  = require("view/WorkspaceManager");

    const TRACK_STYLES = {
        LINE: "line",
        ON_LEFT: "left"
    };

    /**
     * Vertical space above/below the scrollbar (set per OS).
     * This remains global but applies to all editors.
     * @type {number}
     */
    let scrollbarTrackOffset;

    // Initialize scrollbarTrackOffset based on platform
    switch (brackets.platform) {
    case "win": // Custom scrollbar CSS has no gap around the track
        scrollbarTrackOffset = 0;
        break;
    case "mac": // Native scrollbar has padding around the track
        scrollbarTrackOffset = 4;
        break;
    case "linux": // Custom scrollbar CSS has asymmetrical gap; approximate it
        scrollbarTrackOffset = 2;
        break;
    }

    /**
     * The (fixed) height of each individual tickmark.
     * @const
     */
    const MARKER_HEIGHT_LINE = 2;
    const MARKER_HEIGHT_LEFT = 5;

    /**
     * Helper: get or create the scrollTrackMarker state object for an editor.
     * @param {!Editor} editor
     * @return {Object} A state object stored in editorInstance._scrollTrackMarker
     */
    function _getMarkerState(editor) {
        if (!editor._scrollTrackMarker) {
            editor._scrollTrackMarker = {
                // Track geometry
                trackOffset: 0,
                trackHt: 0,

                // All marker positions
                marks: [],

                // The "current" marked tick
                $markedTickmark: null,

                // Whether the track is visible
                visible: false,

                // Handler for resizing
                resizeHandler: null
            };
        }
        return editor._scrollTrackMarker;
    }

    /**
     * Return the scrollbar element for the given editor.
     * (Select only the direct descendant so we don't get nested inline editors).
     * @param {!Editor} editor
     * @return {jQueryObject}
     */
    function _getScrollbar(editor) {
        return $(editor.getRootElement()).children(".CodeMirror-vscrollbar");
    }

    /**
     * Measure and store the scrollbar track geometry in editorInstance._scrollTrackMarker.
     * @param {!Editor} editor
     */
    function _calcScaling(editor) {
        var markerState = _getMarkerState(editor);
        var $sb = _getScrollbar(editor);

        var trackHeight = $sb[0].offsetHeight;
        if (trackHeight > 0) {
            markerState.trackOffset = scrollbarTrackOffset;
            markerState.trackHt = trackHeight - markerState.trackOffset * 2;
        } else {
            // No scrollbar: use the height of the entire code content
            var codeContainer = $(editor.getRootElement())
                .find("> .CodeMirror-scroll > .CodeMirror-sizer > div > .CodeMirror-lines > div")[0];
            markerState.trackHt = codeContainer.offsetHeight;
            markerState.trackOffset = codeContainer.offsetTop;
        }
    }

    /**
     * Compute the "top" position in the scrollbar track for a given text pos.
     * @param {!Editor} editor
     * @param {{line: number, ch: number}} pos
     * @return {number} Y offset in scrollbar track
     */
    function _getTop(editor, pos) {
        var cm = editor._codeMirror;
        var markerState = _getMarkerState(editor);
        var editorHt = cm.getScrollerElement().scrollHeight;
        var wrapping = cm.getOption("lineWrapping");

        var cursorTop;
        var singleLineH = wrapping && cm.defaultTextHeight() * 1.5;
        var lineObj = cm.getLineHandle(pos.line);
        if (wrapping && lineObj && lineObj.height > singleLineH) {
            // For wrapped lines, measure the exact y-position of the character
            cursorTop = cm.charCoords(pos, "local").top;
        } else {
            // For unwrapped lines or lines with default height
            cursorTop = cm.heightAtLine(pos.line, "local");
        }

        var ratio = editorHt ? (cursorTop / editorHt) : 0;
        // offset in the scrollbar track
        return Math.round(ratio * markerState.trackHt) + markerState.trackOffset - 1;
    }

    /**
     * Renders the given list of positions as merged tickmarks in the scrollbar track.
     * @param {!Editor} editor
     * @param {Array.<{line: number, ch: number}>} posArray
     */
    function _renderMarks(editor, posArray) {
        const cm = editor._codeMirror;
        const markerState = _getMarkerState(editor);
        const $track = $(".tickmark-track", editor.getRootElement());
        const editorHt = cm.getScrollerElement().scrollHeight;

        const wrapping = cm.getOption("lineWrapping"),
            singleLineH = wrapping && cm.defaultTextHeight() * 1.5;

        // For performance, precompute top for each mark
        const markPositions = [];
        let curLine = null, curLineObj = null;

        function getY(pos) {
            if (curLine !== pos.line) {
                curLine = pos.line;
                curLineObj = cm.getLineHandle(curLine);
            }
            if (wrapping && curLineObj && curLineObj.height > singleLineH) {
                return cm.charCoords(pos, "local").top;
            }
            return cm.heightAtLine(curLineObj, "local");
        }

        posArray.forEach(function (pos) {
            const y = getY(pos);
            const ratio = editorHt ? (y / editorHt) : 0;
            const top = Math.round(ratio * markerState.trackHt) + markerState.trackOffset - 1;
            // default 2px height => from top..(top+2)
            let markerHeight = MARKER_HEIGHT_LINE, isLine  = true;
            if(pos.options.trackStyle === TRACK_STYLES.ON_LEFT) {
                markerHeight = MARKER_HEIGHT_LEFT;
                isLine = false;
            }
            markPositions.push({ top: top, bottom: top + markerHeight, isLine,
                cssColorClass: pos.options.cssColorClass || ""});
        });

        // Sort them by top coordinate
        markPositions.sort(function (a, b) { return a.top - b.top; });

        // Merge nearby or overlapping segments
        const mergedLineMarks = [], mergedLeftMarks = [];
        markPositions.forEach(function (mark) {
            const mergedMarks = mark.isLine ? mergedLineMarks : mergedLeftMarks;
            if (mergedMarks.length > 0) {
                const last = mergedMarks[mergedMarks.length - 1];
                // If overlapping or adjacent, merge them
                if (mark.top <= last.bottom + 1) {
                    last.bottom = Math.max(last.bottom, mark.bottom);
                    last.height = last.bottom - last.top;
                    return;
                }
            }
            mark.height = mark.bottom - mark.top;
            mergedMarks.push(mark);
        });

        // Build HTML for horizontal marks
        let html = mergedLineMarks.map(function (m) {
            return `<div class='tickmark ${m.cssColorClass}' style='top: ${m.top}px; height: ${m.height}px;'></div>`;
        }).join("");

        // Append to track
        $track.append($(html));

        // Build HTML for hertical marks
        html = mergedLeftMarks.map(function (m) {
            return `<div class='tickmark tickmark-side ${
                m.cssColorClass}' style='top: ${m.top}px; height: ${m.height}px;'></div>`;
        }).join("");

        // Append to track
        $track.append($(html));
    }

    /**
     * Clear tickmarks from the editor's tickmark track.
     * - If `markName` is provided, only clears marks with that name.
     * - If `markName` is omitted, clears **all unnamed marks** but leaves named marks.
     * - To **clear all marks**, including named ones, use `clearAll()`.
     * @param {!Editor} editor
     * @param {string} [markName] Optional. If given, only clears marks with that name.
     */
    function clear(editor, markName) {
        if (!editor) {
            console.error("Calling ScrollTrackMarkers.clear without an editor instance is deprecated.");
            editor = EditorManager.getActiveEditor();
        }
        const markerState = editor && editor._scrollTrackMarker;
        if (!markerState) {
            return;
        }

        if (markName) {
            // Filter out only the named marks that match the given `markName`
            markerState.marks = markerState.marks.filter(mark => mark.options && mark.options.name !== markName);
        } else {
            // Remove only unnamed marks (marks where options.name is undefined or null)
            markerState.marks = markerState.marks.filter(mark => mark.options && mark.options.name);
        }

        // Re-render the marks after clearing
        $(".tickmark-track", editor.getRootElement()).empty();
        _renderMarks(editor, markerState.marks);

        if (markerState.$markedTickmark && markName) {
            markerState.$markedTickmark.remove();
            markerState.$markedTickmark = null;
        }
    }

    /**
     * Clears all tickmarks from the editor's tickmark track, including named and unnamed marks.
     * @param {!Editor} editor
     */
    function clearAll(editor) {
        if (!editor) {
            throw new Error("Called ScrollTrackMarkers.clearAll without an editor!");
        }
        const markerState = editor && editor._scrollTrackMarker;
        if (!markerState) {
            return;
        }

        // Completely remove all tickmarks
        markerState.marks = [];
        $(".tickmark-track", editor.getRootElement()).empty();

        if (markerState.$markedTickmark) {
            markerState.$markedTickmark.remove();
            markerState.$markedTickmark = null;
        }
    }


    /**
     * Shows or hides the tickmark track for the given editor.
     * @param {!Editor} editor
     * @param {boolean} visible
     */
    function setVisible(editor, visible) {
        const markerState = _getMarkerState(editor);

        // No-op if the current visibility state is the same
        if (markerState.visible === visible) {
            return;
        }

        markerState.visible = visible;

        if (visible) {
            // Create the container track if not present
            const $scrollbar = _getScrollbar(editor);
            const $overlay   = $("<div class='tickmark-track'></div>");
            $scrollbar.parent().append($overlay);

            // Calculate scaling
            _calcScaling(editor);

            // Resize handler (debounced)
            markerState.resizeHandler = _.debounce(function () {
                if (markerState.marks.length) {
                    _calcScaling(editor);
                    // Re-render
                    $(".tickmark-track", editor.getRootElement()).empty();
                    _renderMarks(editor, markerState.marks);
                }
            }, 300);

            // Attach to workspace resizing
            WorkspaceManager.on("workspaceUpdateLayout.ScrollTrackMarkers", markerState.resizeHandler);

        } else {
            // Remove the track markup
            $(".tickmark-track", editor.getRootElement()).remove();

            // Detach resizing
            if (markerState.resizeHandler) {
                WorkspaceManager.off("workspaceUpdateLayout.ScrollTrackMarkers", markerState.resizeHandler);
                markerState.resizeHandler = null;
            }

            // Clear marks data
            markerState.marks = [];
            markerState.$markedTickmark = null;
        }
    }

    /**
     * Adds tickmarks for the given positions into the editor's tickmark track, if visible.
     * @param {!Editor} editor
     * @param {Array.<{line: number, ch: number}>} posArray
     * @param {Object} [options]
     * @param {string} [options.name] you can assign a name to marks and then use this name to selectively
     *              these clear marks.
     * @param {string} [options.trackStyle] one of TRACK_STYLES.*
     * @param {string} [options.cssColorClass] a css class that should only override the --mark-color css var.
     */
    function addTickmarks(editor, posArray, options = {}) {
        const markerState = _getMarkerState(editor);
        if (!markerState.visible) {
            return;
        }
        const newPosArray = posArray.map(pos => ({ ...pos, options }));
        // Concat new positions
        markerState.marks = markerState.marks.concat(newPosArray);
        _renderMarks(editor, markerState.marks);
    }

    /**
     * Highlights the "current" tickmark at the given index (into the marks array provided to addTickmarks),
     * or clears if `index === -1`.
     * @param {number} index
     * @param {!Editor} editor
     */
    function markCurrent(index, editor) {
        if(!editor) {
            throw new Error("Calling ScrollTrackMarkers.markCurrent without editor instance is deprecated.");
        }
        const markerState = _getMarkerState(editor);
        // Remove previous highlight
        if (markerState.$markedTickmark) {
            markerState.$markedTickmark.remove();
            markerState.$markedTickmark = null;
        }
        if (index === -1 || !markerState.marks[index]) {
            return;
        }

        const top = _getTop(editor, markerState.marks[index]);
        const $tick = $(
            `<div class='tickmark tickmark-current' style='top: ${top}px; height: ${MARKER_HEIGHT_LINE}px;'></div>`);

        $(".tickmark-track", editor.getRootElement()).append($tick);
        markerState.$markedTickmark = $tick;
    }

    /**
     * Private helper for unit tests
     * @param {!Editor} editorInstance
     * @return {!Array.<{line: number, ch: number}>}
     */
    function _getTickmarks(editorInstance) {
        const markerState = editorInstance && editorInstance._scrollTrackMarker;
        return markerState ? markerState.marks : [];
    }

    // For unit tests
    exports._getTickmarks              = _getTickmarks;

    // public API
    exports.clear                      = clear;
    exports.clearAll                   = clearAll;
    exports.setVisible                 = setVisible;
    exports.addTickmarks               = addTickmarks;
    exports.markCurrent                = markCurrent;
    exports.TRACK_STYLES = TRACK_STYLES;
});
