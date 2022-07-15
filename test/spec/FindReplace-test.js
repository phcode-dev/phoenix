/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
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

/*global describe, it, expect, beforeEach, afterEach */
/*unittests: FindReplace*/

define(function (require, exports, module) {


    let FindReplace     = require("search/FindReplace"),
        SpecRunnerUtils = require("spec/SpecRunnerUtils");

    var defaultContent = "/* Test comment */\n" +
                         "define(function (require, exports, module) {\n" +
                         "    var Foo = require(\"modules/Foo\"),\n" +
                         "        Bar = require(\"modules/Bar\"),\n" +
                         "        Baz = require(\"modules/Baz\");\n" +
                         "    \n" +
                         "    function callFoo() {\n" +
                         "        \n" +
                         "        foo();\n" +
                         "        \n" +
                         "    }\n" +
                         "\n" +
                         "}";

    // Helper functions for testing cursor position / selection range
    function fixPos(pos) {
        if (!("sticky" in pos)) {
            pos.sticky = null;
        }
        return pos;
    }
    function fixSel(sel) {
        fixPos(sel.start);
        fixPos(sel.end);
        if (!("reversed" in sel)) {
            sel.reversed = false;
        }
        return sel;
    }
    function fixSels(sels) {
        sels.forEach(function (sel) {
            fixSel(sel);
        });
        return sels;
    }

    describe("FindReplace - Unit", function () {
        var editor, doc;

        beforeEach(function () {
            var mocks = SpecRunnerUtils.createMockEditor(defaultContent, "javascript");
            editor = mocks.editor;
            doc = mocks.doc;
        });

        afterEach(function () {
            SpecRunnerUtils.destroyMockEditor(doc);
            editor = null;
            doc = null;
        });

        describe("getWordAt", function () {
            it("should select a word bounded by whitespace from a pos in the middle of the word", function () {
                expect(FindReplace._getWordAt(editor, {line: 2, ch: 9}))
                    .toEql({start: {line: 2, ch: 8}, end: {line: 2, ch: 11}, text: "Foo"});
            });
            it("should select a word bounded by whitespace from a pos at the beginning of the word", function () {
                expect(FindReplace._getWordAt(editor, {line: 2, ch: 8}))
                    .toEql({start: {line: 2, ch: 8}, end: {line: 2, ch: 11}, text: "Foo"});
            });
            it("should select a word bounded by whitespace from a pos at the end of the word", function () {
                expect(FindReplace._getWordAt(editor, {line: 2, ch: 11}))
                    .toEql({start: {line: 2, ch: 8}, end: {line: 2, ch: 11}, text: "Foo"});
            });

            it("should select a word bounded by nonword characters from a pos in the middle of the word", function () {
                expect(FindReplace._getWordAt(editor, {line: 2, ch: 26}))
                    .toEql({start: {line: 2, ch: 23}, end: {line: 2, ch: 30}, text: "modules"});
            });
            it("should select a word bounded by nonword characters from a pos at the beginning of the word", function () {
                expect(FindReplace._getWordAt(editor, {line: 2, ch: 23}))
                    .toEql({start: {line: 2, ch: 23}, end: {line: 2, ch: 30}, text: "modules"});
            });
            it("should select a word bounded by nonword characters from a pos at the end of the word", function () {
                expect(FindReplace._getWordAt(editor, {line: 2, ch: 23}))
                    .toEql({start: {line: 2, ch: 23}, end: {line: 2, ch: 30}, text: "modules"});
            });

            it("should return an empty range in the middle of whitespace", function () {
                expect(FindReplace._getWordAt(editor, {line: 8, ch: 4}))
                    .toEql({start: {line: 8, ch: 4}, end: {line: 8, ch: 4}, text: ""});
            });
            it("should return an empty range in the middle of non-word chars", function () {
                expect(FindReplace._getWordAt(editor, {line: 8, ch: 13}))
                    .toEql({start: {line: 8, ch: 13}, end: {line: 8, ch: 13}, text: ""});
            });
        });

        describe("expandAndAddNextToSelection", function () {
            it("should do nothing if the cursor is in non-word/whitespace", function () {
                editor.setSelection({line: 8, ch: 4});
                FindReplace._expandWordAndAddNextToSelection(editor);
                expect(editor.getSelections()).toEql(fixSels([
                    {start: {line: 8, ch: 4}, end: {line: 8, ch: 4}, primary: true, reversed: false}
                ]));
            });

            it("should expand a single cursor to the containing word without adding a new selection", function () {
                editor.setSelection({line: 2, ch: 26});
                FindReplace._expandWordAndAddNextToSelection(editor);
                expect(editor.getSelections()).toEql(fixSels([
                    {start: {line: 2, ch: 23}, end: {line: 2, ch: 30}, primary: true, reversed: false}
                ]));
            });

            it("should add the next match for a single word selection as a new primary selection", function () {
                editor.setSelection({line: 2, ch: 23}, {line: 2, ch: 30});
                FindReplace._expandWordAndAddNextToSelection(editor);
                expect(editor.getSelections()).toEql(fixSels([
                    {start: {line: 2, ch: 23}, end: {line: 2, ch: 30}, primary: false, reversed: false},
                    {start: {line: 3, ch: 23}, end: {line: 3, ch: 30}, primary: true, reversed: false}
                ]));
            });

            it("should add the next match for an existing range that isn't actually a word", function () {
                editor.setSelection({line: 2, ch: 14}, {line: 2, ch: 22}); // "require("
                FindReplace._expandWordAndAddNextToSelection(editor);
                expect(editor.getSelections()).toEql(fixSels([
                    {start: {line: 2, ch: 14}, end: {line: 2, ch: 22}, primary: false, reversed: false},
                    {start: {line: 3, ch: 14}, end: {line: 3, ch: 22}, primary: true, reversed: false}
                ]));
            });

            it("should find the next match case-insensitively", function () {
                editor.setSelection({line: 6, ch: 17}, {line: 6, ch: 20}); // "Foo" in "callFoo" - should next find "foo" in "foo()"
                FindReplace._expandWordAndAddNextToSelection(editor);
                expect(editor.getSelections()).toEql(fixSels([
                    {start: {line: 6, ch: 17}, end: {line: 6, ch: 20}, primary: false, reversed: false},
                    {start: {line: 8, ch: 8}, end: {line: 8, ch: 11}, primary: true, reversed: false}
                ]));
            });

            it("should expand two cursors without adding a new selection", function () {
                editor.setSelections([{start: {line: 2, ch: 26}, end: {line: 2, ch: 26}},
                                      {start: {line: 3, ch: 16}, end: {line: 3, ch: 16}}]);
                FindReplace._expandWordAndAddNextToSelection(editor);
                expect(editor.getSelections()).toEql(fixSels([
                    {start: {line: 2, ch: 23}, end: {line: 2, ch: 30}, primary: false, reversed: false},
                    {start: {line: 3, ch: 14}, end: {line: 3, ch: 21}, primary: true, reversed: false}
                ]));
            });

            it("should, when one cursor and one range are selected, expand the cursor and add the next match for the range to the selection", function () {
                editor.setSelections([{start: {line: 2, ch: 26}, end: {line: 2, ch: 26}},
                                      {start: {line: 3, ch: 14}, end: {line: 3, ch: 21}}]); // "require"
                FindReplace._expandWordAndAddNextToSelection(editor);
                expect(editor.getSelections()).toEql(fixSels([
                    {start: {line: 2, ch: 23}, end: {line: 2, ch: 30}, primary: false, reversed: false},
                    {start: {line: 3, ch: 14}, end: {line: 3, ch: 21}, primary: false, reversed: false},
                    {start: {line: 4, ch: 14}, end: {line: 4, ch: 21}, primary: true, reversed: false}
                ]));
            });

            it("should wrap around the end of the document and add the next instance at the beginning of the document", function () {
                editor.setSelection({line: 4, ch: 14}, {line: 4, ch: 21}); // "require"
                FindReplace._expandWordAndAddNextToSelection(editor);
                expect(editor.getSelections()).toEql(fixSels([
                    {start: {line: 1, ch: 17}, end: {line: 1, ch: 24}, primary: true, reversed: false},
                    {start: {line: 4, ch: 14}, end: {line: 4, ch: 21}, primary: false, reversed: false}
                ]));
            });

            it("should skip over matches that are already in the selection", function () {
                // select all instances of "require" except the second one
                editor.setSelections([{start: {line: 1, ch: 17}, end: {line: 1, ch: 24}},
                                      {start: {line: 3, ch: 14}, end: {line: 3, ch: 21}},
                                      {start: {line: 4, ch: 14}, end: {line: 4, ch: 21}}]);
                FindReplace._expandWordAndAddNextToSelection(editor);
                expect(editor.getSelections()).toEql(fixSels([
                    {start: {line: 1, ch: 17}, end: {line: 1, ch: 24}, primary: false, reversed: false},
                    {start: {line: 2, ch: 14}, end: {line: 2, ch: 21}, primary: true, reversed: false},
                    {start: {line: 3, ch: 14}, end: {line: 3, ch: 21}, primary: false, reversed: false},
                    {start: {line: 4, ch: 14}, end: {line: 4, ch: 21}, primary: false, reversed: false}
                ]));
            });

            it("should do nothing if all instances are already selected", function () {
                editor.setSelections([{start: {line: 1, ch: 17}, end: {line: 1, ch: 24}},
                                      {start: {line: 2, ch: 14}, end: {line: 2, ch: 21}},
                                      {start: {line: 3, ch: 14}, end: {line: 3, ch: 21}},
                                      {start: {line: 4, ch: 14}, end: {line: 4, ch: 21}}]);
                FindReplace._expandWordAndAddNextToSelection(editor);
                expect(editor.getSelections()).toEql(fixSels([
                    {start: {line: 1, ch: 17}, end: {line: 1, ch: 24}, primary: false, reversed: false},
                    {start: {line: 2, ch: 14}, end: {line: 2, ch: 21}, primary: false, reversed: false},
                    {start: {line: 3, ch: 14}, end: {line: 3, ch: 21}, primary: false, reversed: false},
                    {start: {line: 4, ch: 14}, end: {line: 4, ch: 21}, primary: true, reversed: false}
                ]));
            });
        });

        describe("expandAndAddNextToSelection - with removeCurrent (for Skip Match)", function () {
            it("should remove a single range selection and select the next instance", function () {
                editor.setSelection({line: 2, ch: 23}, {line: 2, ch: 30});
                FindReplace._expandWordAndAddNextToSelection(editor, true);
                expect(editor.getSelections()).toEql(fixSels([
                    {start: {line: 3, ch: 23}, end: {line: 3, ch: 30}, primary: true, reversed: false}
                ]));
            });

            it("should expand a single cursor to a range, then change the selection to the next instance of that range", function () {
                editor.setSelection({line: 2, ch: 26}, {line: 2, ch: 26});
                FindReplace._expandWordAndAddNextToSelection(editor, true);
                expect(editor.getSelections()).toEql(fixSels([
                    {start: {line: 3, ch: 23}, end: {line: 3, ch: 30}, primary: true, reversed: false}
                ]));
            });

            it("should, when one cursor and one range are selected, expand the cursor and change the range selection to its next match", function () {
                editor.setSelections([{start: {line: 2, ch: 26}, end: {line: 2, ch: 26}},
                                      {start: {line: 3, ch: 14}, end: {line: 3, ch: 21}}]); // "require"
                FindReplace._expandWordAndAddNextToSelection(editor, true);
                expect(editor.getSelections()).toEql(fixSels([
                    {start: {line: 2, ch: 23}, end: {line: 2, ch: 30}, primary: false, reversed: false},
                    {start: {line: 4, ch: 14}, end: {line: 4, ch: 21}, primary: true, reversed: false}
                ]));
            });

            it("should wrap around the end of the document and switch to the next instance at the beginning of the document", function () {
                editor.setSelection({line: 4, ch: 14}, {line: 4, ch: 21}); // "require"
                FindReplace._expandWordAndAddNextToSelection(editor, true);
                expect(editor.getSelections()).toEql(fixSels([
                    {start: {line: 1, ch: 17}, end: {line: 1, ch: 24}, primary: true, reversed: false}
                ]));
            });

            it("should skip over matches that are already in the selection (but still remove the current one)", function () {
                // select all instances of "require" except the second one
                editor.setSelections([{start: {line: 1, ch: 17}, end: {line: 1, ch: 24}},
                                      {start: {line: 3, ch: 14}, end: {line: 3, ch: 21}},
                                      {start: {line: 4, ch: 14}, end: {line: 4, ch: 21}}]);
                FindReplace._expandWordAndAddNextToSelection(editor, true);
                expect(editor.getSelections()).toEql(fixSels([
                    {start: {line: 1, ch: 17}, end: {line: 1, ch: 24}, primary: false, reversed: false},
                    {start: {line: 2, ch: 14}, end: {line: 2, ch: 21}, primary: true, reversed: false},
                    {start: {line: 3, ch: 14}, end: {line: 3, ch: 21}, primary: false, reversed: false}
                ]));
            });

            it("should just remove the primary selection if all instances are already selected", function () {
                editor.setSelections([{start: {line: 1, ch: 17}, end: {line: 1, ch: 24}},
                                      {start: {line: 2, ch: 14}, end: {line: 2, ch: 21}},
                                      {start: {line: 3, ch: 14}, end: {line: 3, ch: 21}},
                                      {start: {line: 4, ch: 14}, end: {line: 4, ch: 21}}]);
                FindReplace._expandWordAndAddNextToSelection(editor, true);
                expect(editor.getSelections()).toEql(fixSels([
                    {start: {line: 1, ch: 17}, end: {line: 1, ch: 24}, primary: false, reversed: false},
                    {start: {line: 2, ch: 14}, end: {line: 2, ch: 21}, primary: false, reversed: false},
                    {start: {line: 3, ch: 14}, end: {line: 3, ch: 21}, primary: true, reversed: false}
                ]));
            });
        });

        describe("findAllAndSelect", function () {
            it("should find all instances of a selected range when first instance is selected, keeping it primary", function () {
                editor.setSelection({line: 1, ch: 17}, {line: 1, ch: 24});
                FindReplace._findAllAndSelect(editor);
                expect(editor.getSelections()).toEql(fixSels([
                    {start: {line: 1, ch: 17}, end: {line: 1, ch: 24}, primary: true, reversed: false},
                    {start: {line: 2, ch: 14}, end: {line: 2, ch: 21}, primary: false, reversed: false},
                    {start: {line: 3, ch: 14}, end: {line: 3, ch: 21}, primary: false, reversed: false},
                    {start: {line: 4, ch: 14}, end: {line: 4, ch: 21}, primary: false, reversed: false}
                ]));
            });

            it("should find all instances of a selected range when instance other than first is selected, keeping it primary", function () {
                editor.setSelection({line: 3, ch: 14}, {line: 3, ch: 21});
                FindReplace._findAllAndSelect(editor);
                expect(editor.getSelections()).toEql(fixSels([
                    {start: {line: 1, ch: 17}, end: {line: 1, ch: 24}, primary: false, reversed: false},
                    {start: {line: 2, ch: 14}, end: {line: 2, ch: 21}, primary: false, reversed: false},
                    {start: {line: 3, ch: 14}, end: {line: 3, ch: 21}, primary: true, reversed: false},
                    {start: {line: 4, ch: 14}, end: {line: 4, ch: 21}, primary: false, reversed: false}
                ]));
            });

            it("should throw away selections other than the primary selection", function () {
                editor.setSelections([{start: {line: 3, ch: 14}, end: {line: 3, ch: 21}, primary: true},
                                      {start: {line: 6, ch: 4}, end: {line: 6, ch: 6}}]);
                FindReplace._findAllAndSelect(editor);
                expect(editor.getSelections()).toEql(fixSels([
                    {start: {line: 1, ch: 17}, end: {line: 1, ch: 24}, primary: false, reversed: false},
                    {start: {line: 2, ch: 14}, end: {line: 2, ch: 21}, primary: false, reversed: false},
                    {start: {line: 3, ch: 14}, end: {line: 3, ch: 21}, primary: true, reversed: false},
                    {start: {line: 4, ch: 14}, end: {line: 4, ch: 21}, primary: false, reversed: false}
                ]));
            });

            it("should expand cursor to range, then find other instances", function () {
                editor.setSelection({line: 3, ch: 18}, {line: 3, ch: 18});
                FindReplace._findAllAndSelect(editor);
                expect(editor.getSelections()).toEql(fixSels([
                    {start: {line: 1, ch: 17}, end: {line: 1, ch: 24}, primary: false, reversed: false},
                    {start: {line: 2, ch: 14}, end: {line: 2, ch: 21}, primary: false, reversed: false},
                    {start: {line: 3, ch: 14}, end: {line: 3, ch: 21}, primary: true, reversed: false},
                    {start: {line: 4, ch: 14}, end: {line: 4, ch: 21}, primary: false, reversed: false}
                ]));
            });

            it("should find all case insensitively", function () {
                editor.setSelection({line: 8, ch: 10}, {line: 8, ch: 10}); // inside "foo", should also find "Foo"s
                FindReplace._findAllAndSelect(editor);
                expect(editor.getSelections()).toEql(fixSels([
                    {start: {line: 2, ch: 8}, end: {line: 2, ch: 11}, primary: false, reversed: false},
                    {start: {line: 2, ch: 31}, end: {line: 2, ch: 34}, primary: false, reversed: false},
                    {start: {line: 6, ch: 17}, end: {line: 6, ch: 20}, primary: false, reversed: false},
                    {start: {line: 8, ch: 8}, end: {line: 8, ch: 11}, primary: true, reversed: false}
                ]));
            });

            it("should not change the selection if the primary selection is a cursor inside a non-word", function () {
                editor.setSelections([{start: {line: 1, ch: 4}, end: {line: 1, ch: 10}},
                                      {start: {line: 8, ch: 0}, end: {line: 8, ch: 0}}]);
                FindReplace._findAllAndSelect(editor);
                expect(editor.getSelections()).toEql(fixSels([
                    {start: {line: 1, ch: 4}, end: {line: 1, ch: 10}, primary: false, reversed: false},
                    {start: {line: 8, ch: 0}, end: {line: 8, ch: 0}, primary: true, reversed: false}
                ]));
            });
        });
    });
});
