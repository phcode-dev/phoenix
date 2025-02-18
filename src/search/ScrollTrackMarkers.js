/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 * Original work Copyright (c) 2013 - 2021 Adobe Systems Incorporated.
 * All rights reserved.
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
 * NOT yet intended for use by anyone other than the internal modules.
 *
 * Modified to allow each Editor to store its own scroll track markers via
 * `editor._scrollTrackMarker`.
 *
 * Also modified so that the track visibility is managed automatically
 * based on whether there are tickmarks present. The `setVisible()` method
 * is now deprecated and should no longer be called directly.
 */
define(function (require, exports, module) {

    const _                 = require("thirdparty/lodash"),
        EditorManager     = require("editor/EditorManager"),
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
     * The (fixed) height of each individual tickmark for "line" style.
     * @const
     */
    const MARKER_HEIGHT_LINE = 2;

    /**
     * The (fixed) height of each individual tickmark for "left" style.
     * @const
     */
    const MARKER_HEIGHT_LEFT = 5;


    /**
     * Helper: get or create the scrollTrackMarker state object for an editor.
     * @param {!Editor} editor
     * @return {Object} A state object stored in editor._scrollTrackMarker
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
                $currentTick: null,

                // Whether the track is currently visible
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
     * Measure and store the scrollbar track geometry in editor._scrollTrackMarker.
     * @param {!Editor} editor
     */
    function _calcScaling(editor) {
        const markerState = _getMarkerState(editor);
        const $sb = _getScrollbar(editor);

        const trackHeight = $sb[0].offsetHeight;
        if (trackHeight > 0) {
            markerState.trackOffset = scrollbarTrackOffset;
            markerState.trackHt = trackHeight - markerState.trackOffset * 2;
        } else {
            // No scrollbar: use the height of the entire code content
            const codeContainer = $(editor.getRootElement())
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
        const cm = editor._codeMirror;
        const markerState = _getMarkerState(editor);
        const editorHt = cm.getScrollerElement().scrollHeight;
        const wrapping = cm.getOption("lineWrapping");

        let cursorTop;
        const singleLineH = wrapping && cm.defaultTextHeight() * 1.5;
        const lineObj = cm.getLineHandle(pos.line);

        if (wrapping && lineObj && lineObj.height > singleLineH) {
            // For wrapped lines, measure the exact y-position of the character
            cursorTop = cm.charCoords(pos, "local").top;
        } else {
            // For unwrapped lines or lines with default height
            cursorTop = cm.heightAtLine(pos.line, "local");
        }

        const ratio = editorHt ? (cursorTop / editorHt) : 0;
        // offset in the scrollbar track
        return Math.round(ratio * markerState.trackHt) + markerState.trackOffset - 1;
    }

    /**
     * Renders the given list of positions as merged tickmarks in the scrollbar track.
     * @param {!Editor} editor
     * @param {Array.<{line: number, ch: number}>} posArray
     */
    function _renderMarks(editor, posArray) {
        const cm           = editor._codeMirror;
        const markerState  = _getMarkerState(editor);
        const $track       = $(".tickmark-track", editor.getRootElement());
        const editorHt     = cm.getScrollerElement().scrollHeight;
        const wrapping     = cm.getOption("lineWrapping");

        // We'll collect all the normalized (top, bottom) positions here
        const markPositions = [];

        posArray.forEach(function (pos) {
            // Extract the style info
            const trackStyle     = pos.options.trackStyle || TRACK_STYLES.LINE;
            const cssColorClass  = pos.options.cssColorClass || "";

            // Decide which marker height to use
            const isLineMarker   = (trackStyle === TRACK_STYLES.LINE);
            const markerHeight   = isLineMarker ? MARKER_HEIGHT_LINE : MARKER_HEIGHT_LEFT;

            // We'll measure the 'start' of the range and the 'end' of the range
            const startPos       = pos.start || pos;   // Fallback, in case it's single
            const endPos         = pos.end   || pos;   // Fallback, in case it's single

            // Compute the top offset for the start
            const startY = _computeY(startPos);
            // Compute the top offset for the end
            const endY   = _computeY(endPos);

            // Put them in ascending order
            const topY    = Math.min(startY, endY);
            const bottomY = Math.max(startY, endY) + markerHeight;

            markPositions.push({
                top: topY,
                bottom: bottomY,
                isLine: isLineMarker,
                cssColorClass
            });
        });

        // Merge/condense overlapping or adjacent segments, same as before
        markPositions.sort(function (a, b) {
            return a.top - b.top;
        });

        const mergedLineMarks = [];
        const mergedLeftMarks = [];

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

        // Now render them into the DOM
        // (1) For the "line" style
        let html = mergedLineMarks.map(function (m) {
            return `<div class='tickmark ${m.cssColorClass}'
                     style='top: ${m.top}px; height: ${m.height}px;'></div>`;
        }).join("");
        $track.append($(html));

        // (2) For the "left" style
        html = mergedLeftMarks.map(function (m) {
            return `<div class='tickmark tickmark-side ${m.cssColorClass}'
                     style='top: ${m.top}px; height: ${m.height}px;'></div>`;
        }).join("");
        $track.append($(html));

        /**
         * Helper function to compute Y offset for a given {line, ch} position
         */
        function _computeY(cmPos) {
            if (wrapping) {
                // For wrapped lines, measure the exact Y-position in the editor
                return cm.charCoords(cmPos, "local").top / editorHt * markerState.trackHt
                    + markerState.trackOffset - 1;
            }
            // For unwrapped lines, we can do a simpler approach
            const cursorTop = cm.heightAtLine(cmPos.line, "local");
            const ratio     = editorHt ? (cursorTop / editorHt) : 0;
            return Math.round(ratio * markerState.trackHt) + markerState.trackOffset - 1;
        }
    }


    /**
     * Private helper: Show the track if it's not already visible.
     * @param {!Editor} editor
     */
    function _showTrack(editor) {
        const markerState = _getMarkerState(editor);
        if (markerState.visible) {
            return; // Already visible
        }
        markerState.visible = true;

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
    }

    /**
     * Private helper: Hide the track if it's visible, and remove all markup.
     * @param {!Editor} editor
     */
    function _hideTrack(editor) {
        const markerState = _getMarkerState(editor);
        if (!markerState.visible) {
            return; // Already hidden
        }
        markerState.visible = false;

        // Remove the track markup
        $(".tickmark-track", editor.getRootElement()).remove();

        // Detach resizing
        if (markerState.resizeHandler) {
            WorkspaceManager.off("workspaceUpdateLayout.ScrollTrackMarkers", markerState.resizeHandler);
            markerState.resizeHandler = null;
        }

        // Clear marks data (since track is gone, no need to keep them)
        markerState.marks = [];
        if (markerState.$currentTick) {
            markerState.$currentTick.remove();
            markerState.$currentTick = null;
        }
    }

    /**
     * Clears tickmarks from the editor's tickmark track.
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

        // After removing, either re-render or hide the track if no marks remain
        if (markerState.marks.length === 0) {
            _hideTrack(editor);
        } else {
            $(".tickmark-track", editor.getRootElement()).empty();
            _renderMarks(editor, markerState.marks);
        }

        if (markerState.$currentTick && !markName) {
            markerState.$currentTick.remove();
            markerState.$currentTick = null;
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
        _hideTrack(editor);
    }

    /**
     * DEPRECATED: Shows or hides the tickmark track for the given editor.
     *
     * The track is now automatically shown/hidden based on the presence of
     * tickmarks. You generally no longer need to call this method.

     * @deprecated
     */
    function setVisible() {
        console.warn("DEPRECATED: ScrollTrackMarkers.setVisible() is no longer needed. " +
                     "Track visibility is now managed automatically.");
    }

    /**
     * Merges an array of tickmark ranges if they are adjacent or overlapping in lines.
     * All items are assumed to be in the shape:
     *   {
     *     start:  { line: number, ch: number },
     *     end:    { line: number, ch: number },
     *     options: Object
     *   }
     *
     * @param {Array} markArray
     * @return {Array} A new array with merged ranges.
     */
    function _mergeMarks(markArray) {
        // 1) Sort by starting line (and ch if you want a finer sort)
        markArray.sort((a, b) => {
            if (a.start.line !== b.start.line) {
                return a.start.line - b.start.line;
            }
            return a.start.ch - b.start.ch;
        });

        const merged = [];
        let current  = null;

        for (const mark of markArray) {
            // If we're not currently building a merged range, start one
            if (!current) {
                current = {
                    start: { ...mark.start },
                    end: { ...mark.end   },
                    options: mark.options
                };
            } else {
                // Check if the new mark is adjacent or overlaps the current range
                // i.e. if mark's start is <= current's end.line + 1
                if (mark.start.line <= current.end.line + 1) {
                    // Merge them by extending current.end if needed
                    if (mark.end.line > current.end.line) {
                        current.end.line = mark.end.line;
                        current.end.ch   = mark.end.ch;
                    } else if (mark.end.line === current.end.line && mark.end.ch > current.end.ch) {
                        current.end.ch = mark.end.ch;
                    }
                    // If you need to unify other fields (like color classes),
                    // decide how to handle current.options vs. mark.options here.
                } else {
                    // Not adjacent => push the old range and start a fresh one
                    merged.push(current);
                    current = {
                        start: { ...mark.start },
                        end: { ...mark.end   },
                        options: mark.options
                    };
                }
            }
        }

        // Flush any final in-progress range
        if (current) {
            merged.push(current);
        }

        return merged;
    }

    /**
     * Adds tickmarks or range-markers for the given positions (or ranges) into the editor's tickmark track.
     * If the track was not visible and new marks are added, it is automatically shown.
     *
     * @param {!Editor} editor
     * @param {Array.<{line: number, ch: number} | {start: {line, ch}, end: {line, ch}}>} posArray
     *     Each element can be:
     *       (A) a single point: `{ line: number, ch: number }`, or
     *       (B) a range: `{ start: { line, ch }, end: { line, ch } }`
     * @param {Object} [options]
     * @param {string} [options.name] Optionally assign a name to these marks and later selectively clear them.
     * @param {string} [options.trackStyle] one of TRACK_STYLES.* (e.g., "line" or "left").
     * @param {string} [options.cssColorClass] A CSS class that can override or extend styling.
     * @param {string} [options.dontMerge] If set to true, will not merge nearby lines in posArray to single mark.
     */
    function addTickmarks(editor, posArray, options = {}) {
        const markerState = _getMarkerState(editor);
        if (!markerState) {
            return;
        }

        // Keep track of whether the track was empty before adding marks
        const wasEmpty = (markerState.marks.length === 0);

        // Normalize each incoming item so that every mark has both {start, end} internally
        const newMarks = posArray.map(pos => {
            // If this looks like { start: {...}, end: {...} }, use it directly
            if (pos.start && pos.end) {
                return {
                    start: pos.start,
                    end: pos.end,
                    options
                };
            }

            // Otherwise assume it's a single point { line, ch }
            // Treat it as a zero-length range
            return {
                start: pos,
                end: pos,
                options
            };
        });

        const mergedMarks = options.dontMerge ? newMarks : _mergeMarks(newMarks);

        // Concat the new marks onto the existing marks
        markerState.marks = markerState.marks.concat(mergedMarks);

        // If we were empty and now have marks, show the scroll track
        if (wasEmpty && markerState.marks.length > 0) {
            _showTrack(editor);
        }

        // If the track is visible, re-render everything
        if (markerState.visible) {
            $(".tickmark-track", editor.getRootElement()).empty();
            _renderMarks(editor, markerState.marks);
        }
    }


    /**
     * Highlights the "current" tickmark at the given index (into the marks array provided to addTickmarks),
     * or clears if `index === -1`.
     * @param {number} index
     * @param {!Editor} editor
     * @private
     */
    function _markCurrent(index, editor) {
        if (!editor) {
            throw new Error(
                "Calling private API ScrollTrackMarkers._markCurrent without editor instance is deprecated.");
        }
        const markerState = _getMarkerState(editor);

        // Remove previous highlight
        if (markerState.$currentTick) {
            markerState.$currentTick.remove();
            markerState.$currentTick = null;
        }
        if (index === -1 || !markerState.marks[index]) {
            return;
        }

        // Position the highlight
        const top = _getTop(editor, markerState.marks[index].start);
        const $currentTick = $(
            `<div class='tickmark tickmark-current' style='top: ${top}px; height: ${MARKER_HEIGHT_LINE}px;'></div>`
        );

        $(".tickmark-track", editor.getRootElement()).append($currentTick);
        markerState.$currentTick = $currentTick;
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
    exports._getTickmarks  = _getTickmarks;

    // private API
    exports._markCurrent    = _markCurrent;

    // deprecated public API
    exports.setVisible     = setVisible; // Deprecated

    // Public API
    exports.addTickmarks   = addTickmarks;
    exports.clear          = clear;
    exports.clearAll       = clearAll;
    exports.TRACK_STYLES   = TRACK_STYLES;
});
