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

/*global describe, it, expect, beforeEach, afterEach */

define(function (require, exports, module) {


    // Modules from the SpecRunner window
    var SpecRunnerUtils = brackets.getModule("spec/SpecRunnerUtils"),
        HTMLEntityHints = require("main").SpecialCharHints,
        defaultContent  = require("text!unittest-files/default.html");

    // Helper function for testing cursor position
    function fixPos(pos) {
        if (!("sticky" in pos)) {
            pos.sticky = null;
        }
        return pos;
    }

    describe("HTML Entity Hinting", function () {

        var testEditorAndDoc,
            hintProvider = new HTMLEntityHints();

        beforeEach(function () {
            testEditorAndDoc = SpecRunnerUtils.createMockEditor(defaultContent, "html");
        });

        afterEach(function () {
            SpecRunnerUtils.destroyMockEditor(testEditorAndDoc.doc);
        });

        // Ask provider for hints at current cursor position; expect it to return some
        function expectHints(provider) {
            expect(provider.hasHints(testEditorAndDoc.editor, null)).toBe(true);
            var hintsObj = provider.getHints(null);
            expect(hintsObj).toBeTruthy();
            return hintsObj.hints; // return just the array of hints
        }

        // Ask provider for hints at current cursor position
        function expectNoHints(provider) {
            expect(provider.hasHints(testEditorAndDoc.editor, null)).toBe(false);
        }

        it("should show hints when in Text in paragraph", function () {
            testEditorAndDoc.editor.setCursorPos({line: 7, ch: 17});

            expectHints(hintProvider);
        });

        it("should show hints when another entity is in the same line", function () {
            testEditorAndDoc.editor.setCursorPos({line: 12, ch: 23});

            expectHints(hintProvider);
        });

        it("should show hints when cursor inside entity", function () {
            testEditorAndDoc.editor.setCursorPos({line: 17, ch: 19});

            var hints = expectHints(hintProvider);
            expect(hints).toEqual(["&amp;acirc; <span class='entity-display-character'>&acirc;</span>",
                "&amp;acute; <span class='entity-display-character'>&acute;</span>"]);
        });

        it("shouldn't show hints when inside an opening tag", function () {
            testEditorAndDoc.editor.setCursorPos({line: 21, ch: 11});

            expectNoHints(hintProvider);
        });

        it("shouldn't show hints when inside a closing tag", function () {
            testEditorAndDoc.editor.setCursorPos({line: 24, ch: 15});

            expectNoHints(hintProvider);
        });

        it("should show hints when semi-colon on the same line", function () {
            testEditorAndDoc.editor.setCursorPos({line: 28, ch: 21});

            expectHints(hintProvider);
        });

        it("shouldn't show hints in attribute name", function () {
            testEditorAndDoc.editor.setCursorPos({line: 32, ch: 12});

            expectNoHints(hintProvider);
        });

        it("shouldn't show hints in attribute value", function () {
            testEditorAndDoc.editor.setCursorPos({line: 35, ch: 19});

            expectNoHints(hintProvider);
        });

        it("shouldn't show hints in url", function () {
            testEditorAndDoc.editor.setCursorPos({line: 38, ch: 78});

            expectNoHints(hintProvider);
        });

        it("should show multiple hints in the same line", function () {
            testEditorAndDoc.editor.setCursorPos({line: 41, ch: 17});

            expectHints(hintProvider);

            testEditorAndDoc.editor.setCursorPos({line: 41, ch: 29});

            expectHints(hintProvider);
        });

        it("should sort &#xxxx hints numerically not alphabetically", function () {
            testEditorAndDoc.editor.setCursorPos({line: 45, ch: 14});

            var hints = expectHints(hintProvider);
            hintProvider.insertHint(hints[0]);
            expect(testEditorAndDoc.editor.document.getRange({line: 45, ch: 12}, {line: 45, ch: 17})).toEqual("&#33;");

            testEditorAndDoc.editor.setCursorPos({line: 45, ch: 14});
            hintProvider.insertHint(hints[23]);
            expect(testEditorAndDoc.editor.document.getRange({line: 45, ch: 12}, {line: 45, ch: 18})).toEqual("&#123;");
        });

        describe("Inserting Tests", function () {

            it("should replace entity with hint if inside entity", function () {
                testEditorAndDoc.editor.setCursorPos({line: 17, ch: 19});

                var hints = expectHints(hintProvider);
                hintProvider.insertHint(hints[0]);
                expect(testEditorAndDoc.editor.document.getRange({line: 17, ch: 16}, {line: 17, ch: 23})).toEqual("&acirc;");
            });

            it("should place cursor at the end of the replaced entity", function () {
                testEditorAndDoc.editor.setCursorPos({line: 17, ch: 19});

                var hints = expectHints(hintProvider);
                hintProvider.insertHint(hints[0]);
                expect(fixPos(testEditorAndDoc.editor.getCursorPos())).toEqual(fixPos({line: 17, ch: 23}));
            });
        });
    });
});
