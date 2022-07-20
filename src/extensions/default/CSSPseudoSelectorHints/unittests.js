/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 * Original work Copyright (c) 2017 - 2021 Adobe Systems Incorporated. All rights reserved.
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


    var SpecRunnerUtils             = brackets.getModule("spec/SpecRunnerUtils"),
        CSSPseudoSelectorCodeHints  = require("main"),
        PseudoStaticDataRaw         = require("text!PseudoSelectors.json"),
        PseudoStaticData            = JSON.parse(PseudoStaticDataRaw);

    describe("unit:CSS Pseudo class/element Code Hinting", function () {

        var defaultContent = ".selector1: { \n" +
                             "} \n" +
                             ".selector2:: { \n" +
                             "} \n" +
                             ".selector3:n { \n" +
                             "} \n" +
                             ".selector4::f { \n" +
                             "} \n";


        var testDocument, testEditor;

        // Ask provider for hints at current cursor position; expect it to return some
        function expectHints(provider, implicitChar, returnWholeObj) {
            expect(provider.hasHints(testEditor, implicitChar)).toBe(true);
            var hintsObj = provider.getHints();
            expect(hintsObj).toBeTruthy();
            // return just the array of hints if returnWholeObj is falsy
            return returnWholeObj ? hintsObj : hintsObj.hints;
        }

        // compares lists to ensure they are the same
        function verifyListsAreIdentical(hintList, values) {
            var i;
            expect(hintList.length).toBe(values.length);
            for (i = 0; i < values.length; i++) {
                expect(hintList[i]).toBe(values[i]);
            }
        }


        function verifyFirstEntry(hintList, expectedFirstHint) {
            expect(hintList[0]).toBe(expectedFirstHint);
        }


        var modesToTest = ['css', 'scss', 'less'],
            modeCounter;


        var selectMode = function () {
            return modesToTest[modeCounter];
        };

        describe("Pseudo classes in different style modes", function () {
            beforeEach(function () {
                // create Editor instance (containing a CodeMirror instance)
                var mock = SpecRunnerUtils.createMockEditor(defaultContent, selectMode());
                testEditor = mock.editor;
                testDocument = mock.doc;
            });

            afterEach(function () {
                SpecRunnerUtils.destroyMockEditor(testDocument);
                testEditor = null;
                testDocument = null;
            });

            var testAllHints = function () {
                    testEditor.setCursorPos({ line: 0, ch: 11 });    // after :
                    var hintList = expectHints(CSSPseudoSelectorCodeHints.pseudoSelectorHints);
                    console.log(JSON.stringify(hintList));
                    verifyFirstEntry(hintList, "active");  // filtered on "empty string"
                    verifyListsAreIdentical(hintList, Object.keys(PseudoStaticData.classes).sort());
                },
                testFilteredHints = function () {
                    testEditor.setCursorPos({ line: 4, ch: 12 });    // after :n
                    var hintList = expectHints(CSSPseudoSelectorCodeHints.pseudoSelectorHints);
                    console.log(JSON.stringify(hintList));
                    verifyFirstEntry(hintList, "not(selectors)");  // filtered on "n"
                    verifyListsAreIdentical(hintList, ["not(selectors)",
                        "nth-child(n)",
                        "nth-last-child(n)",
                        "nth-last-of-type(n)",
                        "nth-of-type(n)"]);
                },
                testNoHints = function () {
                    testEditor.setCursorPos({ line: 0, ch: 10 });    // after {
                    expect(CSSPseudoSelectorCodeHints.pseudoSelectorHints.hasHints(testEditor, 'a')).toBe(false);
                };

            for (modeCounter in modesToTest) {
                it("should list all Pseudo selectors right after :", testAllHints);
                it("should list filtered pseudo selectors right after :n", testFilteredHints);
                it("should not list rule hints if the cursor is before :", testNoHints);
            }
        });


        describe("Pseudo elements in various style modes", function () {

            beforeEach(function () {
                // create Editor instance (containing a CodeMirror instance)
                var mock = SpecRunnerUtils.createMockEditor(defaultContent, selectMode());
                testEditor = mock.editor;
                testDocument = mock.doc;
            });

            afterEach(function () {
                SpecRunnerUtils.destroyMockEditor(testDocument);
                testEditor = null;
                testDocument = null;
            });

            var testAllHints = function () {
                    testEditor.setCursorPos({ line: 2, ch: 12 });    // after ::
                    var hintList = expectHints(CSSPseudoSelectorCodeHints.pseudoSelectorHints);
                    console.log(JSON.stringify(hintList));
                    verifyFirstEntry(hintList, "after");  // filtered on "empty string"
                    verifyListsAreIdentical(hintList, Object.keys(PseudoStaticData.elements).sort());
                },
                testFilteredHints = function () {
                    testEditor.setCursorPos({ line: 6, ch: 13 });    // after ::f
                    var hintList = expectHints(CSSPseudoSelectorCodeHints.pseudoSelectorHints);
                    console.log(JSON.stringify(hintList));
                    verifyFirstEntry(hintList, "first-letter");  // filtered on "f"
                    verifyListsAreIdentical(hintList, ["first-letter",
                        "first-line"]);
                },
                testNoHints = function () {
                    testEditor.setCursorPos({ line: 2, ch: 10 });    // after ::f
                    expect(CSSPseudoSelectorCodeHints.pseudoSelectorHints.hasHints(testEditor, 'c')).toBe(false);
                };

            for (modeCounter in modesToTest) {
                it("should list all Pseudo selectors right after :", testAllHints);
                it("should list filtered pseudo selectors right after ::f", testFilteredHints);
                it("should not list rule hints if the cursor is before :", testNoHints);
            }

        });

    });
});

