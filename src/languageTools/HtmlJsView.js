/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
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
 * HtmlJsView - builds the JavaScript "view" of an HTML document that is fed to the language server:
 * every `<script>` block is kept verbatim, everything else (markup, the `<script>` tags) is replaced
 * by spaces with newlines preserved. The view has the SAME line/column layout as the HTML, so a
 * cursor at (line, ch) in the HTML maps 1:1 to the same position in the view - no source map needed.
 *
 * The naive way to build this view is `HTMLUtils.findBlocks(editor, "javascript")`, which re-tokenizes
 * the whole document from line 0 (O(document size)). That runs on every debounced sync AND on every
 * `flush()` before a feature request - i.e. potentially per keystroke - so on a large HTML file it
 * makes typing lag.
 *
 * Instead we place an invisible text marker on each `<script>`'s JS range. CodeMirror auto-adjusts
 * every marker as the document is edited, so `marker.find()` gives the block's CURRENT range for free,
 * without re-tokenizing. The common path rebuilds the view from the markers' ranges (an O(N) memory
 * copy, no tokenizer). We only re-run `findBlocks` and re-place the markers when the script STRUCTURE
 * could have changed - a full-buffer replace, an edit whose inserted/removed text contains `<`/`>`
 * (which could add/remove/split a `<script>` - markers can't see that), or an edit that touches a
 * marker boundary. An idle-time full `findBlocks` parity check self-heals (and surfaces) any drift, so
 * the view can never silently diverge.
 *
 * The `extract(editor) -> string` contract is identical to the old stateless extractor, so
 * DocumentSync and the full-sync server protocol are unchanged.
 *
 * @module languageTools/HtmlJsView
 */
define(function (require, exports, module) {


    const DocumentManager = require("document/DocumentManager"),
        EditorManager = require("editor/EditorManager"),
        HTMLUtils = require("language/HTMLUtils");

    // Invisible range trackers over each <script>'s JS region. No className/css -> no rendering.
    // clearWhenEmpty:false so an emptied <script></script> keeps its (zero-length) marker, matching
    // what findBlocks reports; inclusive*:false so edits exactly at a boundary fall outside and force
    // a recompile (the seam is only ever defined by findBlocks).
    const MARK_TYPE = "htmlJsScriptRange";
    const MARK_OPTIONS = { inclusiveLeft: false, inclusiveRight: false, clearWhenEmpty: false };

    // Re-verify against a fresh findBlocks this long after the last edit (typing pause). A backstop
    // only: interior edits keep markers and findBlocks in lock-step, and structural edits recompile.
    const IDLE_VERIFY_MS = 650;

    const cache = new Map();  // doc.file.fullPath -> state
    const stats = { recompiles: 0, patches: 0, builds: 0, verifications: 0, mismatches: 0 };

    function _cmpPos(a, b) {
        return (a.line - b.line) || (a.ch - b.ch);
    }

    function _editorFor(doc) {
        return doc._masterEditor || EditorManager.getActiveEditor() || null;
    }

    function _hasAngle(lines) {
        if (!lines) {
            return false;
        }
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].indexOf("<") !== -1 || lines[i].indexOf(">") !== -1) {
                return true;
            }
        }
        return false;
    }

    /**
     * Build the blanked JS view from a set of JS ranges (from findBlocks blocks or from markers).
     * Byte-identical to the legacy _extractHtmlJs regardless of the range source.
     * @param {Editor} editor
     * @param {Array<{start:{line,ch}, end:{line,ch}}>} ranges - sorted ascending, non-overlapping
     * @return {string}
     */
    function _buildViewFromRanges(editor, ranges) {
        const doc = editor.document;
        const lastLine = editor.lineCount() - 1;
        const eof = { line: lastLine, ch: doc.getLine(lastLine).length };
        let view = "";
        let from = { line: 0, ch: 0 };
        function blank(rangeStart, rangeEnd) {
            return doc.getRange(rangeStart, rangeEnd).replace(/[^\n]/g, " "); // keep \n, blank the rest
        }
        ranges.forEach(function (r) {
            view += blank(from, r.start) + doc.getRange(r.start, r.end);
            from = r.end;
        });
        view += blank(from, eof); // trailing markup, so the view length matches the HTML exactly
        return view;
    }

    /**
     * Full, authoritative build straight from findBlocks (no markers, no cache). Source of truth for
     * recompile and the self-heal parity check.
     * @param {Editor} editor
     * @return {string}
     */
    function _extractFull(editor) {
        const blocks = HTMLUtils.findBlocks(editor, "javascript");
        return _buildViewFromRanges(editor, blocks.map(function (b) {
            return { start: b.start, end: b.end };
        }));
    }

    // Current marker ranges, sorted by start position.
    function _rangesFromMarkers(editor) {
        const ranges = [];
        editor.getAllMarks(MARK_TYPE).forEach(function (m) {
            const r = m.find();
            if (r) {
                ranges.push({ start: r.from, end: r.to });
            }
        });
        ranges.sort(function (a, b) {
            return _cmpPos(a.start, b.start);
        });
        return ranges;
    }

    // Re-run findBlocks, drop and recreate the markers from the fresh blocks, and return the view.
    function _remark(editor) {
        editor.clearAllMarks(MARK_TYPE);
        const blocks = HTMLUtils.findBlocks(editor, "javascript");
        blocks.forEach(function (b) {
            editor.markText(MARK_TYPE, b.start, b.end, MARK_OPTIONS);
        });
        return _buildViewFromRanges(editor, blocks.map(function (b) {
            return { start: b.start, end: b.end };
        }));
    }

    function _recompile(state, editor) {
        state.view = _remark(editor);
        state.valid = true;
        state.version++;
        state.builtVersion = state.version;
        stats.recompiles++;
    }

    /**
     * True when a single change record can be carried by the markers alone (no restructure): the edit
     * is strictly interior to one <script> marker (JS text), or entirely clear of every marker (markup).
     * A boundary touch or an ambiguous overlap returns false so the caller recompiles.
     */
    function _isInteriorEdit(editor, from, to) {
        const atFrom = editor.findMarksAt(from, MARK_TYPE);
        const atTo = editor.findMarksAt(to, MARK_TYPE);
        if (atFrom.length === 0 && atTo.length === 0) {
            return true; // markup, clear of all scripts -> stays blank in the rebuilt view
        }
        if (atFrom.length === 1 && atTo.length === 1 && atFrom[0] === atTo[0]) {
            const r = atFrom[0].find();
            return !!r && _cmpPos(r.from, from) < 0 && _cmpPos(to, r.to) < 0; // strictly inside one block
        }
        return false;
    }

    function _isFastPathSafe(editor, rec) {
        if (!rec.from || !rec.to) {
            return false; // whole-buffer replace (setText/refreshText)
        }
        if (_hasAngle(rec.text) || _hasAngle(rec.removed)) {
            return false; // could add/remove/split a <script> or tag - markers can't see it
        }
        return _isInteriorEdit(editor, rec.from, rec.to);
    }

    function _armIdleVerify(state, doc) {
        if (state.idleTimer) {
            clearTimeout(state.idleTimer);
        }
        state.idleTimer = setTimeout(function () {
            state.idleTimer = null;
            _verify(state, _editorFor(doc));
        }, IDLE_VERIFY_MS);
    }

    function _onChange(event, doc, changeList) {
        const state = cache.get(doc.file.fullPath);
        if (!state) {
            return; // never extracted (no server for this doc) - nothing to maintain
        }
        const editor = _editorFor(doc);
        if (!state.valid) {
            _armIdleVerify(state, doc);
            return; // already pending a recompile on the next extract()
        }
        // A single-cursor keystroke is exactly one record. Multi-record batches (multi-cursor, paste
        // of a split edit) carry per-record coordinates in intermediate systems that don't line up
        // with the markers' final positions, so recompile rather than risk a bad classification.
        if (!editor || changeList.length !== 1 || !_isFastPathSafe(editor, changeList[0])) {
            state.valid = false;
        } else {
            state.version++; // markers already moved; the view is rebuilt lazily on next extract()
            stats.patches++;
        }
        _armIdleVerify(state, doc);
    }

    function _verify(state, editor) {
        if (!editor || !state.valid) {
            return;
        }
        stats.verifications++;
        const current = (state.builtVersion === state.version)
            ? state.view
            : _buildViewFromRanges(editor, _rangesFromMarkers(editor));
        const full = _extractFull(editor);
        if (full !== current) {
            stats.mismatches++;
            console.warn("[HtmlJsView] incremental view drift corrected");
            state.view = _remark(editor);
            state.valid = true;
            state.version++;
            state.builtVersion = state.version;
        }
    }

    /**
     * The JS view of an HTML document for the language server. Same contract as the old stateless
     * extractor: given the editor, returns the position-preserving blanked-JS string.
     * @param {Editor} editor
     * @return {string}
     */
    function extract(editor) {
        const key = editor.document.file.fullPath;
        let state = cache.get(key);
        if (!state) {
            state = { valid: false, view: "", version: 0, builtVersion: -1, idleTimer: null };
            cache.set(key, state);
        }
        if (!state.valid) {
            _recompile(state, editor);
        } else if (state.builtVersion !== state.version) {
            state.view = _buildViewFromRanges(editor, _rangesFromMarkers(editor));
            state.builtVersion = state.version;
            stats.builds++;
        }
        return state.view;
    }

    function _drop(doc) {
        const key = doc.file.fullPath;
        const state = cache.get(key);
        if (state) {
            if (state.idleTimer) {
                clearTimeout(state.idleTimer);
            }
            cache.delete(key);
        }
        const editor = _editorFor(doc);
        if (editor) {
            editor.clearAllMarks(MARK_TYPE);
        }
    }

    let initialized = false;
    function init() {
        if (initialized) {
            return;
        }
        initialized = true;
        DocumentManager.on(DocumentManager.EVENT_DOCUMENT_CHANGE, _onChange);
        DocumentManager.on(DocumentManager.EVENT_BEFORE_DOCUMENT_DELETE, function (event, doc) {
            _drop(doc);
        });
        DocumentManager.on(DocumentManager.EVENT_DOCUMENT_REFRESHED, function (event, doc) {
            _drop(doc);
        });
    }

    exports.init = init;
    exports.extract = extract;

    // Test-only hooks (used by the integration:TypeScript LSP suite).
    exports._extractFull = _extractFull;
    exports._getStats = function () {
        return Object.assign({}, stats);
    };
    exports._resetStats = function () {
        stats.recompiles = stats.patches = stats.builds = stats.verifications = stats.mismatches = 0;
    };
    exports._verifyNow = function (editor) {
        const state = cache.get(editor.document.file.fullPath);
        if (state) {
            _verify(state, editor);
        }
    };
    exports._forceDrift = function (editor) {
        const state = cache.get(editor.document.file.fullPath);
        if (state) {
            state.view = "/*DRIFT*/" + state.view;
            state.builtVersion = state.version; // make extract() return the corrupted view as-is
        }
    };
});
