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


    var SpecRunnerUtils     = brackets.getModule("spec/SpecRunnerUtils"),
        CSSAtRuleCodeHints  = require("main");

    describe("extension:CSS '@' rules Code Hinting", function () {

        var defaultContent = "@ { \n" +
                             "} \n" +
                             " \n" +
                             "@m ";


        var testDocument, testEditor;

        /*
         * Create a mockup editor with the given content and language id.
         *
         * @param {string} content - content for test window
         * @param {string} languageId
         */
        function setupTest(content, languageId) {
            var mock = SpecRunnerUtils.createMockEditor(content, languageId);
            testDocument = mock.doc;
            testEditor = mock.editor;
        }

        function tearDownTest() {
            SpecRunnerUtils.destroyMockEditor(testDocument);
            testEditor = null;
            testDocument = null;
        }

        // Ask provider for hints at current cursor position; expect it to return some
        function expectHints(provider, implicitChar, returnWholeObj) {
            expect(provider.hasHints(testEditor, implicitChar)).toBe(true);
            var hintsObj = provider.getHints();
            expect(hintsObj).toBeTruthy();
            // return just the array of hints if returnWholeObj is falsy
            return returnWholeObj ? hintsObj : hintsObj.hints;
        }

        // Ask provider for hints at current cursor position; expect it NOT to return any
        function expectNoHints(provider, implicitChar) {
            expect(provider.hasHints(testEditor, implicitChar)).toBe(false);
        }

        // compares lists to ensure they are the same
        function verifyListsAreIdentical(hintList, values) {
            var i;
            expect(hintList.length).toBe(values.length);
            for (i = 0; i < values.length; i++) {
                expect(hintList[i]).toBe(values[i]);
            }
        }


        function selectHint(provider, expectedHint, implicitChar) {
            var hintList = expectHints(provider, implicitChar);
            expect(hintList.indexOf(expectedHint)).not.toBe(-1);
            return provider.insertHint(expectedHint);
        }

        // Helper function for testing cursor position
        function fixPos(pos) {
            if (!("sticky" in pos)) {
                pos.sticky = null;
            }
            return pos;
        }
        function expectCursorAt(pos) {
            var selection = testEditor.getSelection();
            expect(fixPos(selection.start)).toEql(fixPos(selection.end));
            expect(fixPos(selection.start)).toEql(fixPos(pos));
        }

        function verifyFirstEntry(hintList, expectedFirstHint) {
            expect(hintList[0]).toBe(expectedFirstHint);
        }

        // Helper function to
        // a) ensure the hintList and the list with the available values have the same size
        // b) ensure that all possible values are mentioned in the hintList
        function verifyAllValues(hintList, values) {
            expect(hintList.length).toBe(values.length);
            expect(hintList.sort().toString()).toBe(values.sort().toString());
        }


        var modesToTest = ['css', 'scss', 'less'],
            modeCounter;


        var selectMode = function () {
            return modesToTest[modeCounter];
        };

        describe("'@' rules in styles mode (selection of correct restricted block based on input)", function () {

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
                    testEditor.setCursorPos({ line: 0, ch: 1 });    // after @
                    var hintList = expectHints(CSSAtRuleCodeHints.restrictedBlockHints);
                    verifyFirstEntry(hintList, "@charset");  // filtered on "empty string"
                    verifyListsAreIdentical(hintList, ["@charset",
                        "@counter-style",
                        "@font-face",
                        "@font-feature-values",
                        "@import",
                        "@keyframes",
                        "@media",
                        "@namespace",
                        "@page",
                        "@supports"]);
                },
                testFilteredHints = function () {
                    testEditor.setCursorPos({ line: 3, ch: 2 });    // after @m
                    var hintList = expectHints(CSSAtRuleCodeHints.restrictedBlockHints);
                    verifyFirstEntry(hintList, "@media");  // filtered on "@m"
                    verifyListsAreIdentical(hintList, ["@media"]);
                },
                testNoHintsOnSpace = function () {
                    testEditor.setCursorPos({ line: 3, ch: 3 });    // after {
                    expect(CSSAtRuleCodeHints.restrictedBlockHints.hasHints(testEditor, '')).toBe(false);
                },
                testNoHints = function () {
                    testEditor.setCursorPos({ line: 0, ch: 0 });    // after {
                    expect(CSSAtRuleCodeHints.restrictedBlockHints.hasHints(testEditor, 'c')).toBe(false);
                };

            for (modeCounter in modesToTest) {
                it("should list all rule hints right after @", testAllHints);
                it("should list filtered rule hints right after @m", testFilteredHints);
                it("should not list rule hints on space", testNoHintsOnSpace);
                it("should not list rule hints if the cursor is before @", testNoHints);
            }
        });

        describe("'@' rules in LESS mode (selection of correct restricted block based on input)", function () {
            defaultContent = "@ { \n" +
                             "} \n" +
                             " \n" +
                             "@m \n" +
                             "@green: green;\n" +
                             ".div { \n" +
                             "color: @" +
                             "} \n";

            beforeEach(function () {
                // create Editor instance (containing a CodeMirror instance)
                var mock = SpecRunnerUtils.createMockEditor(defaultContent, "less");
                testEditor = mock.editor;
                testDocument = mock.doc;
            });

            afterEach(function () {
                SpecRunnerUtils.destroyMockEditor(testDocument);
                testEditor = null;
                testDocument = null;
            });

            it("should not list rule hints in less variable evaluation scope", function () {
                testEditor.setCursorPos({ line: 3, ch: 3 });    // after {
                expect(CSSAtRuleCodeHints.restrictedBlockHints.hasHints(testEditor, '')).toBe(false);
            });

        });

        describe("'@' rule hint insertion", function () {
            beforeEach(function () {
                // create Editor instance (containing a CodeMirror instance)
                var mock = SpecRunnerUtils.createMockEditor(defaultContent, "css");
                testEditor = mock.editor;
                testDocument = mock.doc;
            });

            afterEach(function () {
                SpecRunnerUtils.destroyMockEditor(testDocument);
                testEditor = null;
                testDocument = null;
            });

            it("should insert @rule selected", function () {
                testEditor.setCursorPos({ line: 0, ch: 1 });   // cursor after '@'
                selectHint(CSSAtRuleCodeHints.restrictedBlockHints, "@charset");
                expect(testDocument.getLine(0)).toBe("@charset { ");
                expectCursorAt({ line: 0, ch: 8 });
            });

            it("should insert filtered selection by replacing the existing rule", function () {
                testEditor.setCursorPos({ line: 3, ch: 2 });   // cursor after '@m'
                selectHint(CSSAtRuleCodeHints.restrictedBlockHints, "@media");
                expect(testDocument.getLine(3)).toBe("@media ");
                expectCursorAt({ line: 3, ch: 6 });
            });
        });

    });
});

