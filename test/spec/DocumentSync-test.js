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

/*global describe, it, expect*/

define(function (require, exports, module) {
    const DocumentSync = require("languageTools/DocumentSync");

    const INCREMENTAL = DocumentSync._SYNC_INCREMENTAL;
    const FULL = 1;

    // A CodeMirror-style change record (positions use {line, ch}).
    function cm(fromLine, fromCh, toLine, toCh, textLines, removedLines) {
        return {
            from: { line: fromLine, ch: fromCh },
            to: { line: toLine, ch: toCh },
            text: textLines,
            removed: removedLines || [""]
        };
    }

    describe("unit:DocumentSync incremental sync", function () {

        describe("_toIncrementalChanges - CodeMirror change list -> LSP range edits", function () {
            it("maps a single-char insertion", function () {
                const out = DocumentSync._toIncrementalChanges([cm(2, 0, 2, 0, ["x"])]);
                expect(out).toEqual([
                    { range: { start: { line: 2, character: 0 }, end: { line: 2, character: 0 } }, text: "x" }
                ]);
            });

            it("joins multi-line inserted text with \\n", function () {
                const out = DocumentSync._toIncrementalChanges([cm(1, 4, 1, 4, ["a", "b", "c"])]);
                expect(out[0].text).toBe("a\nb\nc");
            });

            it("maps a deletion (non-empty range, empty text)", function () {
                const out = DocumentSync._toIncrementalChanges([cm(3, 0, 5, 0, [""], ["foo", "bar", ""])]);
                expect(out).toEqual([
                    { range: { start: { line: 3, character: 0 }, end: { line: 5, character: 0 } }, text: "" }
                ]);
            });

            it("maps a multi-record batch in order", function () {
                const out = DocumentSync._toIncrementalChanges([cm(0, 4, 0, 5, ["abc"]), cm(0, 16, 0, 17, ["\"hi\""])]);
                expect(out.length).toBe(2);
                expect(out[0].range.start).toEqual({ line: 0, character: 4 });
                expect(out[1].range.start).toEqual({ line: 0, character: 16 });
            });

            it("returns null for an empty or unmappable list (caller then full-resyncs)", function () {
                expect(DocumentSync._toIncrementalChanges([])).toBe(null);
                expect(DocumentSync._toIncrementalChanges([{ text: ["x"] }])).toBe(null); // missing from/to
            });
        });

        describe("_applyIncremental - replay LSP edits onto a string", function () {
            const edit = (sl, sc, el, ec, text) => ({
                range: { start: { line: sl, character: sc }, end: { line: el, character: ec } }, text: text
            });

            it("applies an insertion", function () {
                expect(DocumentSync._applyIncremental("ab", [edit(0, 1, 0, 1, "X")])).toBe("aXb");
            });

            it("applies a deletion", function () {
                expect(DocumentSync._applyIncremental("abc", [edit(0, 1, 0, 2, "")])).toBe("ac");
            });

            it("applies a replacement spanning lines", function () {
                expect(DocumentSync._applyIncremental("a\nb\nc", [edit(0, 1, 2, 0, "X")])).toBe("aXc");
            });

            it("applies a batch in order (each edit relative to the prior result)", function () {
                // "let a = 0;" -> replace `a` then `0`. CodeMirror reports same-line edits so that
                // replaying them in order reproduces the result.
                const batch = [edit(0, 8, 0, 9, "9"), edit(0, 4, 0, 5, "abc")];
                expect(DocumentSync._applyIncremental("let a = 0;", batch)).toBe("let abc = 9;");
            });

            it("returns null for a position on a line beyond the text (STRICT, no clamping)", function () {
                // Regression: a stale edit referencing a line past the end used to be clamped to
                // end-of-text, letting it pass verification while the raw out-of-range line went to
                // the server - tsserver crashes on that ("Debug Failure. Bad line number").
                expect(DocumentSync._applyIncremental("a\nb", [edit(2, 0, 2, 0, "x")])).toBe(null);
            });

            it("returns null for a character beyond the line's length", function () {
                expect(DocumentSync._applyIncremental("ab\ncd", [edit(0, 5, 0, 5, "x")])).toBe(null);
            });
        });

        describe("_contentChangesFor - the divergence safety net", function () {
            const okEdit = [{ range: { start: { line: 0, character: 1 }, end: { line: 0, character: 1 } }, text: "X" }];

            it("sends the incremental edits when replaying them reproduces the document", function () {
                const out = DocumentSync._contentChangesFor(INCREMENTAL, "ab", okEdit, false, "aXb");
                expect(out).toBe(okEdit); // the same accumulated array, trusted as-is
            });

            it("falls back to full text on drift (a double-applied edit)", function () {
                // The base text already contains the edit (a flush shipped it), but it is still pending.
                // Replaying it would duplicate the char -> not equal to the document -> full resync.
                const out = DocumentSync._contentChangesFor(INCREMENTAL, "aXb", okEdit, false, "aXb");
                expect(out).toEqual([{ text: "aXb" }]);
            });

            it("sends full text when the server wants full sync", function () {
                const out = DocumentSync._contentChangesFor(FULL, "ab", okEdit, false, "aXb");
                expect(out).toEqual([{ text: "aXb" }]);
            });

            it("sends full text when a fullResync was flagged", function () {
                const out = DocumentSync._contentChangesFor(INCREMENTAL, "ab", okEdit, true, "aXb");
                expect(out).toEqual([{ text: "aXb" }]);
            });

            it("sends full text when there are no pending edits", function () {
                const out = DocumentSync._contentChangesFor(INCREMENTAL, "ab", [], false, "abc");
                expect(out).toEqual([{ text: "abc" }]);
            });

            it("falls back to full text when a pending edit is out of range for the base text", function () {
                // The tsserver-crash regression: with lenient clamping this edit replayed to exactly
                // the final text ("a\nb" + append = "a\nbx") and the invalid line-2 range shipped to
                // the server. Strict replay must reject it and resync with full text instead.
                const stale = [{ range: { start: { line: 2, character: 0 }, end: { line: 2, character: 0 } },
                    text: "x" }];
                const out = DocumentSync._contentChangesFor(INCREMENTAL, "a\nb", stale, false, "a\nbx");
                expect(out).toEqual([{ text: "a\nbx" }]);
            });
        });
    });
});
