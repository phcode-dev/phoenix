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

/*global describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, awaitsFor, awaitsForDone, jasmine */
/*unittests: FindReplace*/

define(function (require, exports, module) {


    var Commands        = require("command/Commands"),
        KeyEvent        = require("utils/KeyEvent"),
        SpecRunnerUtils = require("spec/SpecRunnerUtils"),
        StringUtils     = require("utils/StringUtils"),
        Strings         = require("strings");

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

    describe("LegacyInteg:FindReplace - Integration", function () {

        var LINE_FIRST_REQUIRE = 2;
        var CH_REQUIRE_START = 14;
        var CH_REQUIRE_PAREN = CH_REQUIRE_START + "require".length;

        var fooExpectedMatches = [
            {start: {line: LINE_FIRST_REQUIRE, ch: 8}, end: {line: LINE_FIRST_REQUIRE, ch: 11}},
            {start: {line: LINE_FIRST_REQUIRE, ch: 31}, end: {line: LINE_FIRST_REQUIRE, ch: 34}},
            {start: {line: 6, ch: 17}, end: {line: 6, ch: 20}},
            {start: {line: 8, ch: 8}, end: {line: 8, ch: 11}}
        ];
        var capitalFooSelections = [
            {start: {line: LINE_FIRST_REQUIRE, ch: 8}, end: {line: LINE_FIRST_REQUIRE, ch: 11}},
            {start: {line: LINE_FIRST_REQUIRE, ch: 31}, end: {line: LINE_FIRST_REQUIRE, ch: 34}},
            {start: {line: 6, ch: 17}, end: {line: 6, ch: 20}}
        ];
        var barExpectedMatches = [
            {start: {line: LINE_FIRST_REQUIRE + 1, ch: 8}, end: {line: LINE_FIRST_REQUIRE + 1, ch: 11}},
            {start: {line: LINE_FIRST_REQUIRE + 1, ch: 31}, end: {line: LINE_FIRST_REQUIRE + 1, ch: 34}}
        ];


        var testWindow, twCommandManager, twEditorManager, twFindInFiles, tw$;
        var myDocument, myEditor;

        // Helper functions for testing cursor position / selection range
        // TODO: duplicated from EditorCommandHandlers-test
        function expectSelection(sel) {
            if (!sel.reversed) {
                sel.reversed = false;
            }
            expect(fixSel(myEditor.getSelection())).toEql(fixSel(sel));
        }
        function expectMatchIndex(index, count) {
            var matchInfo = StringUtils.format(Strings.FIND_MATCH_INDEX, index + 1, count);
            expect(myEditor._codeMirror._searchState.matchIndex).toEql(index);
            expect(myEditor._codeMirror._searchState.resultSet.length).toEql(count);
            expect($(testWindow.document).find("#find-counter").text()).toBe(matchInfo);
        }
        function expectHighlightedMatches(selections, expectedDOMHighlightCount) {
            var cm = myEditor._codeMirror;
            var searchState = cm._searchState;

            expect(searchState).toBeDefined();
            expect(searchState.marked).toBeDefined();
            expect(searchState.marked.length).toEql(selections.length);

            // Verify that searchState's marked ranges match expected ranges
            if (selections) {
                selections.forEach(function (location, index) {
                    var textMarker = searchState.marked[index];
                    var markerLocation = textMarker.find();
                    expect(fixPos(markerLocation.from)).toEql(fixPos(location.start));
                    expect(fixPos(markerLocation.to)).toEql(fixPos(location.end));
                });
            }

            // Verify number of tickmarks equals number of highlights
            var tickmarks = tw$(".tickmark-track .tickmark", myEditor.getRootElement());
            expect(tickmarks.length).toEql(selections.length);

            // Verify that editor UI doesn't have extra ranges left highlighted from earlier
            // (note: this only works for text that's short enough to not get virtualized)
            var lineDiv = tw$(".CodeMirror-lines .CodeMirror-code", myEditor.getRootElement());
            var actualHighlights = tw$(".CodeMirror-searching", lineDiv);
            if (expectedDOMHighlightCount === undefined) {
                expectedDOMHighlightCount = selections.length;
            }
            expect(actualHighlights.length).toEql(expectedDOMHighlightCount);
        }
        function expectFindNextSelections(selections) {
            var i;
            for (i = 0; i < selections.length; i++) {
                expectSelection(selections[i]);
                twCommandManager.execute(Commands.CMD_FIND_NEXT);
            }

            // next find should wraparound
            expectSelection(selections[0]);
        }


        function getSearchBar() {
            return tw$(".modal-bar");
        }
        function getSearchField() {
            return tw$("#find-what");
        }
        function getReplaceField() {
            return tw$("#replace-with");
        }

        function expectSearchBarOpen() {
            expect(getSearchBar()[0]).toBeDefined();
        }
        async function waitsForSearchBarClose() {
            await awaitsFor(function () {
                return getSearchBar().length === 0;
            },  "search bar closing");
        }
        async function waitsForSearchBarReopen() {
            // If Find is invoked again while a previous Find bar is already up, we want to
            // wait for the old Find bar to disappear before continuing our test, so we know
            // which modal bar to look at.
            await awaitsFor(function () {
                return getSearchBar().length === 1;
            },  "search bar reopening");
        }

        function enterSearchText(str) {
            expectSearchBarOpen();
            var $input = getSearchField();
            $input.val(str);
            $input.trigger("input");
        }
        function enterReplaceText(str) {
            expectSearchBarOpen();
            var $input = getReplaceField();
            $input.val(str);
            $input.trigger("input");
        }

        function pressEscape() {
            expectSearchBarOpen();
            SpecRunnerUtils.simulateKeyEvent(KeyEvent.DOM_VK_ESCAPE, "keydown", getSearchField()[0]);
        }

        function pressDownArrow() {
            expectSearchBarOpen();
            SpecRunnerUtils.simulateKeyEvent(KeyEvent.DOM_VK_DOWN, "keydown", getSearchField()[0]);
        }

        function pressUpArrow() {
            expectSearchBarOpen();
            SpecRunnerUtils.simulateKeyEvent(KeyEvent.DOM_VK_UP, "keydown", getSearchField()[0]);
        }

        function toggleCaseSensitive(val) {
            if (tw$("#find-case-sensitive").is(".active") !== val) {
                tw$("#find-case-sensitive").click();
            }
        }
        function toggleRegexp(val) {
            if (tw$("#find-regexp").is(".active") !== val) {
                tw$("#find-regexp").click();
            }
        }


        beforeAll(async function () {
            await SpecRunnerUtils.createTempDirectory();

            // Create a new window that will be shared by ALL tests in this spec.
            testWindow = await SpecRunnerUtils.createTestWindowAndRun();
            // Load module instances from brackets.test
            twCommandManager = testWindow.brackets.test.CommandManager;
            twEditorManager  = testWindow.brackets.test.EditorManager;
            twFindInFiles    = testWindow.brackets.test.FindInFiles;
            tw$              = testWindow.$;

            await SpecRunnerUtils.loadProjectInTestWindow(SpecRunnerUtils.getTempDirectory());
        }, 30000);

        afterAll(async function () {
            testWindow       = null;
            twCommandManager = null;
            twEditorManager  = null;
            twFindInFiles    = null;
            tw$              = null;
            await SpecRunnerUtils.closeTestWindow();

            await SpecRunnerUtils.removeTempDirectory();
        }, 30000);

        beforeEach(async function () {
            await awaitsForDone(twCommandManager.execute(Commands.FILE_NEW_UNTITLED));

            myEditor = twEditorManager.getCurrentFullEditor();
            myDocument = myEditor.document;
            myDocument.replaceRange(defaultContent, {line: 0, ch: 0});
            myEditor.centerOnCursor = jasmine.createSpy("centering");
        });

        afterEach(async function () {
            // Reset search options for next test, since these are persisted and the window is shared
            // Note: tests that explicitly close the search bar before finishing will need to reset any changed options themselves
            toggleCaseSensitive(false);
            toggleRegexp(false);

            await awaitsForDone(twCommandManager.execute(Commands.FILE_CLOSE, { _forceClose: true }));

            await waitsForSearchBarClose();

            myEditor = null;
            myDocument = null;
        });

        describe("Search", function () {
            it("should search multi line text", async function () {
                let text = "this is\na test\nof multiline\n".repeat(3);
                text += "this is another\nunmatched test\nof multiline".repeat(3);
                myEditor._codeMirror.setValue(text);
                myEditor.setCursorPos(0, 0);

                twCommandManager.execute(Commands.CMD_FIND);

                enterSearchText("this is\na test");

                expectMatchIndex(0, 3);
                const expectedMatches = [
                    {start: {line: 0, ch: 0}, end: {line: 1, ch: 6}},
                    {start: {line: 3, ch: 0}, end: {line: 4, ch: 6}},
                    {start: {line: 6, ch: 0}, end: {line: 7, ch: 6}}
                ];
                // 6 lines are highlighted though there are only 3 selections.
                expectHighlightedMatches(expectedMatches, 6);
            });

            it("should have the correct match count even if DOM highlighting is turned off when over 5000 matches", async function () {
                let text = "b".repeat(5001);
                myEditor._codeMirror.setValue(text);
                myEditor.setCursorPos(0, 0);

                twCommandManager.execute(Commands.CMD_FIND);

                enterSearchText("b");

                expectMatchIndex(0, 5001);
                // When exceeding 2000 matches, tickmarks disabled and only the *current* editor highlight is shown
                expectHighlightedMatches([], 1);
            });

            it("should find all case-insensitive matches with lowercase text", async function () {
                myEditor.setCursorPos(0, 0);

                twCommandManager.execute(Commands.CMD_FIND);
                // The previous search term "b" was pre-filled, so the editor was centered there already
                expect(myEditor.centerOnCursor.calls.count()).toEql(1);

                enterSearchText("foo");
                expectHighlightedMatches(fooExpectedMatches);
                expectSelection(fooExpectedMatches[0]);
                expectMatchIndex(0, 4);
                expect(myEditor.centerOnCursor.calls.count()).toEql(2);

                twCommandManager.execute(Commands.CMD_FIND_NEXT);
                expectSelection(fooExpectedMatches[1]);
                expectMatchIndex(1, 4);
                expect(myEditor.centerOnCursor.calls.count()).toEql(3);
                twCommandManager.execute(Commands.CMD_FIND_NEXT);
                expectSelection(fooExpectedMatches[2]);
                expectMatchIndex(2, 4);
                twCommandManager.execute(Commands.CMD_FIND_NEXT);
                expectSelection(fooExpectedMatches[3]);
                expectMatchIndex(3, 4);
                expectHighlightedMatches(fooExpectedMatches);  // no change in highlights

                // wraparound
                twCommandManager.execute(Commands.CMD_FIND_NEXT);
                expectSelection(fooExpectedMatches[0]);
                expectMatchIndex(0, 4);
                expect(myEditor.centerOnCursor.calls.count()).toEql(6);
            });

            it("should find all case-insensitive matches with mixed-case text", async function () {
                myEditor.setCursorPos(0, 0);

                twCommandManager.execute(Commands.CMD_FIND);
                // The previous search term "foo" was pre-filled, so the editor was centered there already
                expect(myEditor.centerOnCursor.calls.count()).toEql(1);

                enterSearchText("Foo");
                expectHighlightedMatches(fooExpectedMatches);
                expectSelection(fooExpectedMatches[0]);
                expectMatchIndex(0, 4);
                expect(myEditor.centerOnCursor.calls.count()).toEql(2);

                twCommandManager.execute(Commands.CMD_FIND_NEXT);
                expectSelection(fooExpectedMatches[1]);
                expectMatchIndex(1, 4);
                expect(myEditor.centerOnCursor.calls.count()).toEql(3);
                twCommandManager.execute(Commands.CMD_FIND_NEXT);
                expectSelection(fooExpectedMatches[2]);
                expectMatchIndex(2, 4);
                twCommandManager.execute(Commands.CMD_FIND_NEXT);
                expectSelection(fooExpectedMatches[3]);
                expectMatchIndex(3, 4);
                expectHighlightedMatches(fooExpectedMatches);  // no change in highlights

                // wraparound
                twCommandManager.execute(Commands.CMD_FIND_NEXT);
                expectSelection(fooExpectedMatches[0]);
                expectMatchIndex(0, 4);
                expect(myEditor.centerOnCursor.calls.count()).toEql(6);
            });

            it("should find all case-sensitive matches with mixed-case text", async function () {
                myEditor.setCursorPos(0, 0);

                twCommandManager.execute(Commands.CMD_FIND);

                toggleCaseSensitive(true);
                enterSearchText("Foo");
                expectHighlightedMatches(capitalFooSelections);
                expectSelection(capitalFooSelections[0]);
                expectMatchIndex(0, 3);

                twCommandManager.execute(Commands.CMD_FIND_NEXT);
                expectSelection(capitalFooSelections[1]);
                expectMatchIndex(1, 3);
                twCommandManager.execute(Commands.CMD_FIND_NEXT);
                expectSelection(capitalFooSelections[2]);
                expectMatchIndex(2, 3);
                // note the lowercase "foo()" is NOT matched

                // wraparound
                twCommandManager.execute(Commands.CMD_FIND_NEXT);
                expectSelection(capitalFooSelections[0]);
                expectMatchIndex(0, 3);
            });

            it("should have a scroll track marker for every match", function () {
                twCommandManager.execute(Commands.CMD_FIND);

                enterSearchText("foo");
                expectHighlightedMatches(fooExpectedMatches);

                var marks = testWindow.brackets.test.ScrollTrackMarkers._getTickmarks();
                expect(marks.length).toEql(fooExpectedMatches.length);

                marks.forEach(function (mark, index) {
                    expect(mark.line).toEql(fooExpectedMatches[index].start.line);
                });
            });

            it("toggling case-sensitive option should update results immediately", function () {
                myEditor.setCursorPos(0, 0);

                twCommandManager.execute(Commands.CMD_FIND);

                enterSearchText("Foo");
                expectHighlightedMatches(fooExpectedMatches);
                expectSelection(fooExpectedMatches[0]);
                expectMatchIndex(0, 4);

                toggleCaseSensitive(true);
                expectHighlightedMatches(capitalFooSelections);
                expectSelection(capitalFooSelections[0]);
                expectMatchIndex(0, 3);

                twCommandManager.execute(Commands.CMD_FIND_NEXT);
                expectSelection(capitalFooSelections[1]);
                expectMatchIndex(1, 3);
            });

            it("Should find next and previous on down and up arrow key press", function () {
                myEditor.setCursorPos(0, 0);

                twCommandManager.execute(Commands.CMD_FIND);

                enterSearchText("Foo");
                expectHighlightedMatches(fooExpectedMatches);
                expectMatchIndex(0, 4);

                pressDownArrow();
                expectMatchIndex(1, 4);
                pressDownArrow();
                expectMatchIndex(2, 4);

                pressUpArrow();
                expectMatchIndex(1, 4);
                pressUpArrow();
                expectMatchIndex(0, 4);
                pressUpArrow();
                expectMatchIndex(3, 4);

                pressDownArrow();
                expectMatchIndex(0, 4);

            });

            it("should Find Next after search bar closed, including wraparound", async function () {
                myEditor.setCursorPos(0, 0);

                twCommandManager.execute(Commands.CMD_FIND);
                // The previous search term "Foo" was pre-filled, so the editor was centered there already
                expect(myEditor.centerOnCursor.calls.count()).toEql(1);

                enterSearchText("foo");
                pressEscape();
                expectHighlightedMatches([]);

                await waitsForSearchBarClose();

                expectSelection({start: {line: LINE_FIRST_REQUIRE, ch: 8}, end: {line: LINE_FIRST_REQUIRE, ch: 11}});
                expect(myEditor.centerOnCursor.calls.count()).toEql(2);

                // Simple linear Find Next
                twCommandManager.execute(Commands.CMD_FIND_NEXT);
                expectSelection({start: {line: LINE_FIRST_REQUIRE, ch: 31}, end: {line: LINE_FIRST_REQUIRE, ch: 34}});
                expect(myEditor.centerOnCursor.calls.count()).toEql(3);
                twCommandManager.execute(Commands.CMD_FIND_NEXT);
                expectSelection({start: {line: 6, ch: 17}, end: {line: 6, ch: 20}});
                twCommandManager.execute(Commands.CMD_FIND_NEXT);
                expectSelection({start: {line: 8, ch: 8}, end: {line: 8, ch: 11}});

                // Wrap around to first result
                twCommandManager.execute(Commands.CMD_FIND_NEXT);
                expectSelection({start: {line: LINE_FIRST_REQUIRE, ch: 8}, end: {line: LINE_FIRST_REQUIRE, ch: 11}});
            });

            it("should Find Previous after search bar closed, including wraparound", async function () {
                myEditor.setCursorPos(0, 0);

                twCommandManager.execute(Commands.CMD_FIND);

                enterSearchText("foo");
                pressEscape();

                await waitsForSearchBarClose();

                expectSelection({start: {line: LINE_FIRST_REQUIRE, ch: 8}, end: {line: LINE_FIRST_REQUIRE, ch: 11}});

                // Wrap around to last result
                twCommandManager.execute(Commands.CMD_FIND_PREVIOUS);
                expectSelection({start: {line: 8, ch: 8}, end: {line: 8, ch: 11}});

                // Simple linear Find Previous
                twCommandManager.execute(Commands.CMD_FIND_PREVIOUS);
                expectSelection({start: {line: 6, ch: 17}, end: {line: 6, ch: 20}});
                twCommandManager.execute(Commands.CMD_FIND_PREVIOUS);
                expectSelection({start: {line: LINE_FIRST_REQUIRE, ch: 31}, end: {line: LINE_FIRST_REQUIRE, ch: 34}});
                twCommandManager.execute(Commands.CMD_FIND_PREVIOUS);
                expectSelection({start: {line: LINE_FIRST_REQUIRE, ch: 8}, end: {line: LINE_FIRST_REQUIRE, ch: 11}});
            });

            it("should Find Next after search bar closed, relative to cursor position", async function () {
                myEditor.setCursorPos(0, 0);

                twCommandManager.execute(Commands.CMD_FIND);

                enterSearchText("foo");
                pressEscape();
                expectHighlightedMatches([]);

                await waitsForSearchBarClose();

                expectSelection({start: {line: LINE_FIRST_REQUIRE, ch: 8}, end: {line: LINE_FIRST_REQUIRE, ch: 11}});

                twCommandManager.execute(Commands.CMD_FIND_NEXT);
                expectSelection({start: {line: LINE_FIRST_REQUIRE, ch: 31}, end: {line: LINE_FIRST_REQUIRE, ch: 34}});

                // skip forward
                myEditor.setCursorPos(7, 0);

                twCommandManager.execute(Commands.CMD_FIND_NEXT);
                expectSelection({start: {line: 8, ch: 8}, end: {line: 8, ch: 11}});

                // skip backward
                myEditor.setCursorPos(LINE_FIRST_REQUIRE, 14);

                twCommandManager.execute(Commands.CMD_FIND_NEXT);
                expectSelection({start: {line: LINE_FIRST_REQUIRE, ch: 31}, end: {line: LINE_FIRST_REQUIRE, ch: 34}});
            });

            it("should Find Next after search bar closed, remembering case sensitivity state", async function () {
                myEditor.setCursorPos(0, 0);

                twCommandManager.execute(Commands.CMD_FIND);

                toggleCaseSensitive(true);
                enterSearchText("Foo");
                pressEscape();
                expectHighlightedMatches([]);

                await waitsForSearchBarClose();

                expectFindNextSelections(capitalFooSelections);
            });

            it("should remember the last search query", async function () {
                myEditor.setCursorPos(0, 0);

                twCommandManager.execute(Commands.CMD_FIND);

                enterSearchText("Foo");
                pressEscape();

                await waitsForSearchBarClose();

                // Open search bar a second time
                myEditor.setCursorPos(0, 0);
                twCommandManager.execute(Commands.CMD_FIND);

                expectSearchBarOpen();
                expect(getSearchField().val()).toEql("Foo");
                expectHighlightedMatches(capitalFooSelections);
                expectSelection(capitalFooSelections[0]);
                expectMatchIndex(0, 3);
                expect(myEditor.centerOnCursor.calls.count()).toEql(3);

                twCommandManager.execute(Commands.CMD_FIND_NEXT);
                expectSelection(capitalFooSelections[1]);
                expectMatchIndex(1, 3);
            });

            it("should open search bar on Find Next with no previous search", async function () {
                // Make sure we have no previous query
                twCommandManager.execute(Commands.CMD_FIND);
                enterSearchText("");
                pressEscape();

                await waitsForSearchBarClose();

                myEditor.setCursorPos(0, 0);

                twCommandManager.execute(Commands.CMD_FIND_NEXT);

                expectSearchBarOpen();
                expect(SpecRunnerUtils.editorHasCursorPosition(myEditor, 0, 0)).toBeTrue();
            });

            it("should select-all without affecting search state if Find invoked while search bar open", async function () {  // #2478
                myEditor.setCursorPos(0, 0);

                twCommandManager.execute(Commands.CMD_FIND);

                enterSearchText("foo");  // position cursor first

                // Search for something that doesn't exist; otherwise we can't tell whether search state is cleared or bar is reopened,
                // since reopening the bar will just prepopulate it with selected text from first search's result
                enterSearchText("foobar");

                expect(SpecRunnerUtils.editorHasCursorPosition(myEditor, LINE_FIRST_REQUIRE, 11)).toBeTrue();
                // cursor left at end of last good match ("foo")

                // Invoke Find a 2nd time - this time while search bar is open
                twCommandManager.execute(Commands.CMD_FIND);

                await waitsForSearchBarReopen();

                expectSearchBarOpen();
                expect(getSearchField().val()).toEql("foobar");
                expect(getSearchField()[0].selectionStart).toBe(0);
                expect(getSearchField()[0].selectionEnd).toBe(6);
                expect(SpecRunnerUtils.editorHasCursorPosition(myEditor, LINE_FIRST_REQUIRE, 11)).toBeTrue();
            });

        });


        describe("Incremental search", function () {
            it("should re-search from original position when text changes", async function () {
                myEditor.setCursorPos(0, 0);

                twCommandManager.execute(Commands.CMD_FIND);

                enterSearchText("baz");

                var expectedSelections = [
                    {start: {line: LINE_FIRST_REQUIRE + 2, ch: 8}, end: {line: LINE_FIRST_REQUIRE + 2, ch: 11}},
                    {start: {line: LINE_FIRST_REQUIRE + 2, ch: 31}, end: {line: LINE_FIRST_REQUIRE + 2, ch: 34}}
                ];
                expectSelection(expectedSelections[0]);
                expectMatchIndex(0, 2);
                expectHighlightedMatches(expectedSelections);

                enterSearchText("bar");

                expectSelection(barExpectedMatches[0]);  // selection one line earlier than previous selection
                expectMatchIndex(0, 2);
                expectHighlightedMatches(barExpectedMatches);
            });

            it("should re-search from original position when text changes, even after Find Next", async function () {
                myEditor.setCursorPos(0, 0);

                twCommandManager.execute(Commands.CMD_FIND);

                enterSearchText("foo");
                expectSelection(fooExpectedMatches[0]);
                expectMatchIndex(0, 4);

                // get search highlight down below where the "bar" match will be
                twCommandManager.execute(Commands.CMD_FIND_NEXT);
                twCommandManager.execute(Commands.CMD_FIND_NEXT);
                expectSelection(fooExpectedMatches[2]);
                expectMatchIndex(2, 4);

                enterSearchText("bar");
                expectSelection(barExpectedMatches[0]);
                expectMatchIndex(0, 2);
            });

            it("should use empty initial query for single cursor selection", async function () {
                // Make sure we have no previous query
                twCommandManager.execute(Commands.CMD_FIND);
                enterSearchText("");
                pressEscape();

                await waitsForSearchBarClose();

                myEditor.setSelection({line: LINE_FIRST_REQUIRE, ch: CH_REQUIRE_START});
                twCommandManager.execute(Commands.CMD_FIND);
                expect(getSearchField().val()).toEql("");
            });

            it("should use empty initial query for multiple cursor selection", async function () {
                // Make sure we have no previous query
                twCommandManager.execute(Commands.CMD_FIND);
                enterSearchText("");
                pressEscape();

                await waitsForSearchBarClose();

                myEditor.setSelections([{start: {line: LINE_FIRST_REQUIRE, ch: CH_REQUIRE_START}, end: {line: LINE_FIRST_REQUIRE, ch: CH_REQUIRE_START}, primary: true},
                    {start: {line: 1, ch: 0}, end: {line: 1, ch: 0}}]);
                twCommandManager.execute(Commands.CMD_FIND);
                expect(getSearchField().val()).toEql("");
            });

            it("should get single selection as initial query", function () {
                myEditor.setSelection({line: LINE_FIRST_REQUIRE, ch: CH_REQUIRE_START},
                                      {line: LINE_FIRST_REQUIRE, ch: CH_REQUIRE_PAREN});
                twCommandManager.execute(Commands.CMD_FIND);
                expect(getSearchField().val()).toEql("require");
            });

            it("should get primary selection as initial query", function () {
                myEditor.setSelections([{start: {line: LINE_FIRST_REQUIRE, ch: CH_REQUIRE_START}, end: {line: LINE_FIRST_REQUIRE, ch: CH_REQUIRE_PAREN}, primary: true},
                                        {start: {line: 1, ch: 0}, end: {line: 1, ch: 1}}]);
                twCommandManager.execute(Commands.CMD_FIND);
                expect(getSearchField().val()).toEql("require");
            });

            it("should extend original selection when appending to prepopulated text", async function () {
                myEditor.setSelection({line: LINE_FIRST_REQUIRE, ch: CH_REQUIRE_START}, {line: LINE_FIRST_REQUIRE, ch: CH_REQUIRE_PAREN});

                twCommandManager.execute(Commands.CMD_FIND);
                expect(getSearchField().val()).toEql("require");

                var requireExpectedMatches = [
                    {start: {line: 1, ch: 17}, end: {line: 1, ch: 24}},
                    {start: {line: LINE_FIRST_REQUIRE,     ch: CH_REQUIRE_START}, end: {line: LINE_FIRST_REQUIRE,     ch: CH_REQUIRE_PAREN}},
                    {start: {line: LINE_FIRST_REQUIRE + 1, ch: CH_REQUIRE_START}, end: {line: LINE_FIRST_REQUIRE + 1, ch: CH_REQUIRE_PAREN}},
                    {start: {line: LINE_FIRST_REQUIRE + 2, ch: CH_REQUIRE_START}, end: {line: LINE_FIRST_REQUIRE + 2, ch: CH_REQUIRE_PAREN}}
                ];
                expectHighlightedMatches(requireExpectedMatches);
                expectSelection(requireExpectedMatches[1]);  // cursor was below 1st match, so 2nd match is selected
                expectMatchIndex(1, 4);

                enterSearchText("require(");
                requireExpectedMatches.shift();  // first result no longer matches
                requireExpectedMatches[0].end.ch++;  // other results now include one more char
                requireExpectedMatches[1].end.ch++;
                requireExpectedMatches[2].end.ch++;
                // in a new file, JS isn't color coded, so there's only one span each + 1 additional for current selection probably from ode mirror update
                expectHighlightedMatches(requireExpectedMatches, 4);
                expectSelection(requireExpectedMatches[0]);
                expectMatchIndex(0, 3);
            });

            it("should collapse selection when appending to prepopulated text causes no result", async function () {
                myEditor.setSelection({line: LINE_FIRST_REQUIRE, ch: CH_REQUIRE_START}, {line: LINE_FIRST_REQUIRE, ch: CH_REQUIRE_PAREN});

                twCommandManager.execute(Commands.CMD_FIND);
                expectSelection({start: {line: LINE_FIRST_REQUIRE, ch: CH_REQUIRE_START}, end: {line: LINE_FIRST_REQUIRE, ch: CH_REQUIRE_PAREN}});

                enterSearchText("requireX");
                expectHighlightedMatches([]);
                expect(SpecRunnerUtils.editorHasCursorPosition(myEditor, LINE_FIRST_REQUIRE, CH_REQUIRE_PAREN)).toBeTrue();
            });

            it("should clear selection, return cursor to start after backspacing to empty query", async function () {
                myEditor.setCursorPos(2, 0);

                twCommandManager.execute(Commands.CMD_FIND);

                enterSearchText("require");
                expectSelection({start: {line: LINE_FIRST_REQUIRE, ch: CH_REQUIRE_START}, end: {line: LINE_FIRST_REQUIRE, ch: CH_REQUIRE_PAREN}});

                enterSearchText("");
                expect(SpecRunnerUtils.editorHasCursorPosition(myEditor, 2, 0)).toBeTrue();
            });

            it("should incremental search & highlight from Replace mode too", async function () {
                myEditor.setCursorPos(0, 0);

                twCommandManager.execute(Commands.CMD_REPLACE);

                enterSearchText("baz");
                var expectedSelections = [
                    {start: {line: LINE_FIRST_REQUIRE + 2, ch: 8}, end: {line: LINE_FIRST_REQUIRE + 2, ch: 11}},
                    {start: {line: LINE_FIRST_REQUIRE + 2, ch: 31}, end: {line: LINE_FIRST_REQUIRE + 2, ch: 34}}
                ];
                expectSelection(expectedSelections[0]);
                expectMatchIndex(0, 2);
                expectHighlightedMatches(expectedSelections);

                enterSearchText("baz\"");
                expectedSelections = [
                    {start: {line: LINE_FIRST_REQUIRE + 2, ch: 31}, end: {line: LINE_FIRST_REQUIRE + 2, ch: 35}}
                ];
                expectSelection(expectedSelections[0]);
                expectMatchIndex(0, 1);
                expectHighlightedMatches(expectedSelections);
            });
        });


        describe("Terminating search", function () {
            it("shouldn't change selection on Escape after typing text, no Find Nexts", async function () {
                // Make sure we have no previous query
                twCommandManager.execute(Commands.CMD_FIND);
                enterSearchText("");
                pressEscape();

                await waitsForSearchBarClose();

                myEditor.setCursorPos(LINE_FIRST_REQUIRE, 0);

                twCommandManager.execute(Commands.CMD_FIND);
                expect(SpecRunnerUtils.editorHasCursorPosition(myEditor, LINE_FIRST_REQUIRE, 0)).toBeTrue();

                enterSearchText("require");
                expectSelection({start: {line: LINE_FIRST_REQUIRE, ch: CH_REQUIRE_START}, end: {line: LINE_FIRST_REQUIRE, ch: CH_REQUIRE_PAREN}});

                pressEscape();

                await waitsForSearchBarClose();

                expectSelection({start: {line: LINE_FIRST_REQUIRE, ch: CH_REQUIRE_START}, end: {line: LINE_FIRST_REQUIRE, ch: CH_REQUIRE_PAREN}});
            });

            it("shouldn't change selection on Escape after typing text & Find Next", async function () {
                myEditor.setCursorPos(LINE_FIRST_REQUIRE, 0);

                twCommandManager.execute(Commands.CMD_FIND);
                expectSelection({start: {line: LINE_FIRST_REQUIRE, ch: CH_REQUIRE_START}, end: {line: LINE_FIRST_REQUIRE, ch: CH_REQUIRE_PAREN}});

                twCommandManager.execute(Commands.CMD_FIND_NEXT);
                expectSelection({start: {line: LINE_FIRST_REQUIRE + 1, ch: CH_REQUIRE_START}, end: {line: LINE_FIRST_REQUIRE + 1, ch: CH_REQUIRE_PAREN}});

                pressEscape();

                await waitsForSearchBarClose();

                expectSelection({start: {line: LINE_FIRST_REQUIRE + 1, ch: CH_REQUIRE_START}, end: {line: LINE_FIRST_REQUIRE + 1, ch: CH_REQUIRE_PAREN}});
            });

            it("should no-op on Find Next with blank search", async function () {
                // Make sure we have no previous query
                twCommandManager.execute(Commands.CMD_FIND);
                enterSearchText("");
                pressEscape();

                await waitsForSearchBarClose();

                myEditor.setCursorPos(LINE_FIRST_REQUIRE, 0);

                twCommandManager.execute(Commands.CMD_FIND);
                expect(SpecRunnerUtils.editorHasCursorPosition(myEditor, LINE_FIRST_REQUIRE, 0)).toBeTrue();

                twCommandManager.execute(Commands.CMD_FIND_NEXT);
                expect(SpecRunnerUtils.editorHasCursorPosition(myEditor, LINE_FIRST_REQUIRE, 0)).toBeTrue();

            });
        });


        describe("RegExp Search", function () {
            it("should find based on regexp", async function () {
                var expectedSelections = [
                    {start: {line: LINE_FIRST_REQUIRE + 1, ch: 8}, end: {line: LINE_FIRST_REQUIRE + 1, ch: 11}},
                    {start: {line: LINE_FIRST_REQUIRE + 1, ch: 31}, end: {line: LINE_FIRST_REQUIRE + 1, ch: 34}},
                    {start: {line: LINE_FIRST_REQUIRE + 2, ch: 8}, end: {line: LINE_FIRST_REQUIRE + 2, ch: 11}},
                    {start: {line: LINE_FIRST_REQUIRE + 2, ch: 31}, end: {line: LINE_FIRST_REQUIRE + 2, ch: 34}}
                ];
                myEditor.setCursorPos(0, 0);

                twCommandManager.execute(Commands.CMD_FIND);

                toggleRegexp(true);
                toggleCaseSensitive(true);
                enterSearchText("Ba.");
                expectHighlightedMatches(expectedSelections);
                expectSelection(expectedSelections[0]);
                expectMatchIndex(0, 4);

                twCommandManager.execute(Commands.CMD_FIND_NEXT);
                expectSelection(expectedSelections[1]);
                expectMatchIndex(1, 4);
                twCommandManager.execute(Commands.CMD_FIND_NEXT);
                expectSelection(expectedSelections[2]);
                expectMatchIndex(2, 4);
                twCommandManager.execute(Commands.CMD_FIND_NEXT);
                expectSelection(expectedSelections[3]);
                expectMatchIndex(3, 4);

                // wraparound
                twCommandManager.execute(Commands.CMD_FIND_NEXT);
                expectSelection(expectedSelections[0]);
                expectMatchIndex(0, 4);
            });


            it("should Find Next after search bar closed, remembering last used regexp", async function () {
                var expectedSelections = [
                    {start: {line: LINE_FIRST_REQUIRE + 1, ch: 8}, end: {line: LINE_FIRST_REQUIRE + 1, ch: 11}},
                    {start: {line: LINE_FIRST_REQUIRE + 1, ch: 31}, end: {line: LINE_FIRST_REQUIRE + 1, ch: 34}},
                    {start: {line: LINE_FIRST_REQUIRE + 2, ch: 8}, end: {line: LINE_FIRST_REQUIRE + 2, ch: 11}},
                    {start: {line: LINE_FIRST_REQUIRE + 2, ch: 31}, end: {line: LINE_FIRST_REQUIRE + 2, ch: 34}}
                ];

                myEditor.setCursorPos(0, 0);

                twCommandManager.execute(Commands.CMD_FIND);

                toggleRegexp(true);
                enterSearchText("Ba.");
                pressEscape();
                expectHighlightedMatches([]);

                await waitsForSearchBarClose();

                expectFindNextSelections(expectedSelections);

                // explicitly clean up since we closed the search bar
                twCommandManager.execute(Commands.CMD_FIND);
                toggleRegexp(false);
            });

            it("toggling regexp option should update results immediately", async function () {
                myEditor.setCursorPos(0, 0);

                twCommandManager.execute(Commands.CMD_FIND);

                enterSearchText("t .");
                expectHighlightedMatches([]);
                expect(SpecRunnerUtils.editorHasCursorPosition(myEditor, 0, 0)).toBeTrue();

                toggleRegexp(true);
                var expectedSelections = [
                    {start: {line: 0, ch: 6}, end: {line: 0, ch: 9}},
                    {start: {line: 0, ch: 14}, end: {line: 0, ch: 17}}
                ];
                expectHighlightedMatches(expectedSelections);
                expectSelection(expectedSelections[0]);
                expectMatchIndex(0, 2);
            });

            it("should support case-sensitive regexp", async function () {
                var expectedSelections = [
                    {start: {line: 8, ch: 8}, end: {line: 8, ch: 11}}
                ];
                myEditor.setCursorPos(0, 0);

                twCommandManager.execute(Commands.CMD_FIND);

                toggleRegexp(true);
                toggleCaseSensitive(true);
                enterSearchText("f.o");
                expectHighlightedMatches(expectedSelections);
                expectSelection(expectedSelections[0]);
                expectMatchIndex(0, 1);
            });

            it("should support case-insensitive regexp", async function () {
                var expectedSelections = [
                    {start: {line: LINE_FIRST_REQUIRE, ch: 8}, end: {line: LINE_FIRST_REQUIRE, ch: 11}},
                    {start: {line: LINE_FIRST_REQUIRE, ch: 31}, end: {line: LINE_FIRST_REQUIRE, ch: 34}},
                    {start: {line: 6, ch: 17}, end: {line: 6, ch: 20}},
                    {start: {line: 8, ch: 8}, end: {line: 8, ch: 11}}
                ];
                myEditor.setCursorPos(0, 0);

                twCommandManager.execute(Commands.CMD_FIND);

                toggleRegexp(true);
                toggleCaseSensitive(false);
                enterSearchText("f.o");
                expectHighlightedMatches(expectedSelections);
                expectSelection(expectedSelections[0]);
                expectMatchIndex(0, 4);
            });

            it("shouldn't choke on invalid regexp", async function () {
                myEditor.setCursorPos(0, 0);

                twCommandManager.execute(Commands.CMD_FIND);

                toggleRegexp(true);
                enterSearchText("+");
                expect(tw$(".modal-bar .error").length).toBe(1);
                expectHighlightedMatches([]);
                expect(SpecRunnerUtils.editorHasCursorPosition(myEditor, 0, 0)).toBeTrue();// no change
            });

            it("shouldn't choke on empty regexp", function () {
                myEditor.setCursorPos(0, 0);

                twCommandManager.execute(Commands.CMD_FIND);

                toggleRegexp(true);
                enterSearchText("");
                expectHighlightedMatches([]);
                expect(SpecRunnerUtils.editorHasCursorPosition(myEditor, 0, 0)).toBeTrue();// no change
            });

            it("shouldn't freeze on /.*/ regexp", function () {
                myEditor.setCursorPos(0, 0);

                twCommandManager.execute(Commands.CMD_FIND);

                toggleRegexp(true);
                enterSearchText(".*");
                expectSelection({start: {line: 0, ch: 0}, end: {line: 0, ch: 18}});
            });

            it("shouldn't freeze on /.*/ regexp", function () {
                myEditor.setCursorPos(0, 0);

                twCommandManager.execute(Commands.CMD_FIND);

                toggleRegexp(true);
                enterSearchText(".*");
                expectSelection({start: {line: 0, ch: 0}, end: {line: 0, ch: 18}});
            });

            it("shouldn't freeze on regexp with 0-length matches", function () {
                myEditor.setCursorPos(0, 0);

                twCommandManager.execute(Commands.CMD_FIND);

                // CodeMirror coerces all 0-length matches to 0 char now
                toggleRegexp(true);
                enterSearchText("^");  // matches pos before start of every line, but 0-length match text
                expectSelection({start: {line: 0, ch: 0}, end: {line: 0, ch: 0}});

                enterSearchText("()"); // matches pos before every char, but 0-length match text
                expectSelection({start: {line: 0, ch: 0}, end: {line: 0, ch: 0}});
            });
        });


        describe("Search -> Replace", function () {
            it("should find and replace one string", async function () {
                twCommandManager.execute(Commands.CMD_REPLACE);
                enterSearchText("foo");

                expectSelection(fooExpectedMatches[0]);
                expectMatchIndex(0, 4);
                expect(/foo/i.test(myEditor.getSelectedText())).toBe(true);
                expect(tw$("#replace-yes").is(":enabled")).toBe(true);

                enterReplaceText("bar");

                tw$("#replace-yes").click();
                expectSelection(fooExpectedMatches[1]);
                expectMatchIndex(0, 3);

                myEditor.setSelection(fooExpectedMatches[0].start, fooExpectedMatches[0].end);
                expect(/bar/i.test(myEditor.getSelectedText())).toBe(true);
            });

            it("should find and skip then replace string", async function () {
                twCommandManager.execute(Commands.CMD_REPLACE);
                enterSearchText("foo");
                enterReplaceText("bar");

                expectSelection(fooExpectedMatches[0]);
                expectMatchIndex(0, 4);
                expect(/foo/i.test(myEditor.getSelectedText())).toBe(true);

                // Skip first
                expect(tw$("#find-next").is(":enabled")).toBe(true);
                tw$("#find-next").click();

                expectSelection(fooExpectedMatches[1]);
                expectMatchIndex(1, 4);
                expect(/foo/i.test(myEditor.getSelectedText())).toBe(true);

                // Replace second
                expect(tw$("#replace-yes").is(":enabled")).toBe(true);
                tw$("#replace-yes").click();

                expectSelection(fooExpectedMatches[2]);
                expectMatchIndex(1, 3);

                myEditor.setSelection(fooExpectedMatches[0].start, fooExpectedMatches[0].end);
                expect(/foo/i.test(myEditor.getSelectedText())).toBe(true);

                myEditor.setSelection(fooExpectedMatches[1].start, fooExpectedMatches[1].end);
                expect(/bar/i.test(myEditor.getSelectedText())).toBe(true);
            });

            it("should not replace string if document is read only", async function () {
                myEditor._codeMirror.options.readOnly = true;
                twCommandManager.execute(Commands.CMD_REPLACE);
                enterSearchText("foo");

                expectSelection(fooExpectedMatches[0]);
                expectMatchIndex(0, 4);
                expect(/foo/i.test(myEditor.getSelectedText())).toBe(true);
                expect(tw$("#replace-yes").is(":enabled")).toBe(true);

                enterReplaceText("bar");

                tw$("#replace-yes").click();
                expectSelection(fooExpectedMatches[0]);
                expectMatchIndex(0, 4);

                myEditor.setSelection(fooExpectedMatches[0].start, fooExpectedMatches[0].end);
                expect(/bar/i.test(myEditor.getSelectedText())).toBe(false);
            });

            it("should use replace keyboard shortcut for single Replace while search bar open", async function () {
                twCommandManager.execute(Commands.CMD_REPLACE);
                enterSearchText("foo");
                expectSelection(fooExpectedMatches[0]);
                expectMatchIndex(0, 4);

                enterReplaceText("bar");

                twCommandManager.execute(Commands.CMD_REPLACE);
                expectSelection(fooExpectedMatches[1]);
                expectMatchIndex(0, 3);

                myEditor.setSelection(fooExpectedMatches[0].start, fooExpectedMatches[0].end);
                expect(/bar/i.test(myEditor.getSelectedText())).toBe(true);
            });

            it("should find and replace a regexp with $n substitutions", async function () {
                twCommandManager.execute(Commands.CMD_REPLACE);
                toggleRegexp(true);
                enterSearchText("(modules)\\/(\\w+)");
                enterReplaceText("$2:$1");

                var expectedMatch = {start: {line: LINE_FIRST_REQUIRE, ch: 23}, end: {line: LINE_FIRST_REQUIRE, ch: 34}};

                expectSelection(expectedMatch);
                expect(/foo/i.test(myEditor.getSelectedText())).toBe(true);

                expect(tw$("#replace-yes").is(":enabled")).toBe(true);
                tw$("#replace-yes").click();

                myEditor.setSelection(expectedMatch.start, expectedMatch.end);
                expect(/Foo:modules/i.test(myEditor.getSelectedText())).toBe(true);
            });

            it("should find a regexp and replace it with $0n (leading zero)", async function () {
                twCommandManager.execute(Commands.CMD_REPLACE);
                toggleRegexp(true);
                enterSearchText("(modules)\\/(\\w+)");
                enterReplaceText("$02:$01");

                var expectedMatch = {start: {line: LINE_FIRST_REQUIRE, ch: 23}, end: {line: LINE_FIRST_REQUIRE, ch: 34}};

                expectSelection(expectedMatch);
                expect(/foo/i.test(myEditor.getSelectedText())).toBe(true);

                expect(tw$("#replace-yes").is(":enabled")).toBe(true);
                tw$("#replace-yes").click();

                myEditor.setSelection(expectedMatch.start, expectedMatch.end);
                expect(/Foo:modules/i.test(myEditor.getSelectedText())).toBe(true);
            });

            it("should find a regexp and replace it with $0 (literal)", async function () {
                twCommandManager.execute(Commands.CMD_REPLACE);
                toggleRegexp(true);
                enterSearchText("(modules)\\/(\\w+)");
                enterReplaceText("$0_:$01");

                var expectedMatch = {start: {line: LINE_FIRST_REQUIRE, ch: 23}, end: {line: LINE_FIRST_REQUIRE, ch: 34}};

                expectSelection(expectedMatch);
                expect(/foo/i.test(myEditor.getSelectedText())).toBe(true);

                expect(tw$("#replace-yes").is(":enabled")).toBe(true);
                tw$("#replace-yes").click();

                myEditor.setSelection(expectedMatch.start, expectedMatch.end);
                expect(/\$0_:modules/i.test(myEditor.getSelectedText())).toBe(true);
            });

            it("should find a regexp and replace it with $n (empty subexpression)", async function () {
                twCommandManager.execute(Commands.CMD_REPLACE);
                toggleRegexp(true);
                enterSearchText("(modules)(.*)\\/(\\w+)");
                enterReplaceText("$3$2:$1");

                var expectedMatch = {start: {line: LINE_FIRST_REQUIRE, ch: 23}, end: {line: LINE_FIRST_REQUIRE, ch: 34}};

                expectSelection(expectedMatch);
                expect(/foo/i.test(myEditor.getSelectedText())).toBe(true);

                expect(tw$("#replace-yes").is(":enabled")).toBe(true);
                tw$("#replace-yes").click();

                myEditor.setSelection(expectedMatch.start, expectedMatch.end);
                expect(/Foo:modules/i.test(myEditor.getSelectedText())).toBe(true);
            });

            it("should find a regexp and replace it with $nn (n has two digits)", async function () {
                twCommandManager.execute(Commands.CMD_REPLACE);
                toggleRegexp(true);
                enterSearchText("()()()()()()()()()()(modules)\\/()()()(\\w+)");
                enterReplaceText("$15:$11");

                var expectedMatch = {start: {line: LINE_FIRST_REQUIRE, ch: 23}, end: {line: LINE_FIRST_REQUIRE, ch: 34}};

                expectSelection(expectedMatch);
                expect(/foo/i.test(myEditor.getSelectedText())).toBe(true);

                expect(tw$("#replace-yes").is(":enabled")).toBe(true);
                tw$("#replace-yes").click();

                myEditor.setSelection(expectedMatch.start, expectedMatch.end);
                expect(/Foo:modules/i.test(myEditor.getSelectedText())).toBe(true);
            });

            it("should find a regexp and replace it with $$n (not a subexpression, escaped dollar)", async function () {
                twCommandManager.execute(Commands.CMD_REPLACE);
                toggleRegexp(true);
                enterSearchText("(modules)\\/(\\w+)");
                enterReplaceText("$$2_$$10:$2");

                var expectedMatch = {start: {line: LINE_FIRST_REQUIRE, ch: 23}, end: {line: LINE_FIRST_REQUIRE, ch: 34}};

                expectSelection(expectedMatch);
                expect(/foo/i.test(myEditor.getSelectedText())).toBe(true);

                expect(tw$("#replace-yes").is(":enabled")).toBe(true);
                tw$("#replace-yes").click();

                myEditor.setSelection(expectedMatch.start, expectedMatch.end);
                expect(/\$2_\$10:Foo/i.test(myEditor.getSelectedText())).toBe(true);
            });

            it("should find a regexp and replace it with $$$n (correct subexpression)", async function () {
                twCommandManager.execute(Commands.CMD_REPLACE);
                toggleRegexp(true);
                enterSearchText("(modules)\\/(\\w+)");
                enterReplaceText("$2$$$1");

                var expectedMatch = {start: {line: LINE_FIRST_REQUIRE, ch: 23}, end: {line: LINE_FIRST_REQUIRE, ch: 34}};

                expectSelection(expectedMatch);
                expect(/foo/i.test(myEditor.getSelectedText())).toBe(true);

                expect(tw$("#replace-yes").is(":enabled")).toBe(true);
                tw$("#replace-yes").click();

                myEditor.setSelection(expectedMatch.start, expectedMatch.end);
                expect(/Foo\$modules/i.test(myEditor.getSelectedText())).toBe(true);
            });

            it("should find a regexp and replace it with $& (whole match)", async function () {
                twCommandManager.execute(Commands.CMD_REPLACE);
                toggleRegexp(true);
                enterSearchText("(modules)\\/(\\w+)");
                enterReplaceText("_$&-$2$$&");

                var expectedMatch = {start: {line: LINE_FIRST_REQUIRE, ch: 23}, end: {line: LINE_FIRST_REQUIRE, ch: 34}};

                expectSelection(expectedMatch);
                expect(/foo/i.test(myEditor.getSelectedText())).toBe(true);

                expect(tw$("#replace-yes").is(":enabled")).toBe(true);
                tw$("#replace-yes").click();

                myEditor.setSelection({line: LINE_FIRST_REQUIRE, ch: 23}, {line: LINE_FIRST_REQUIRE, ch: 41});
                expect(/_modules\/Foo-Foo\$&/i.test(myEditor.getSelectedText())).toBe(true);
            });
        });


        describe("Search -> Replace All in untitled document", function () {
            function expectTextAtPositions(text, posArray) {
                posArray.forEach(function (pos) {
                    expect(myEditor.document.getRange(pos, {line: pos.line, ch: pos.ch + text.length})).toEql(text);
                });
            }
            function dontExpectTextAtPositions(text, posArray) {
                posArray.forEach(function (pos) {
                    expect(myEditor.document.getRange(pos, {line: pos.line, ch: pos.ch + text.length})).not.toEql(text);
                });
            }

            beforeEach(function () {
                twFindInFiles._searchDone = false;
                twFindInFiles._replaceDone = false;
            });

            it("should find and replace all using replace all button", async function () {
                var searchText  = "require",
                    replaceText = "brackets.getModule";
                twCommandManager.execute(Commands.CMD_REPLACE);
                enterSearchText(searchText);
                enterReplaceText(replaceText);

                expectSelection({start: {line: 1, ch: 17}, end: {line: 1, ch: 17 + searchText.length}});
                expect(myEditor.getSelectedText()).toBe(searchText);

                expect(tw$("#replace-all").is(":enabled")).toBe(true);
                tw$("#replace-all").click();

                await awaitsFor(function () {
                    return twFindInFiles._replaceDone;
                }, "replace finished");

                // Note: LINE_FIRST_REQUIRE and CH_REQUIRE_START refer to first call to "require",
                //       but not first instance of "require" in text
                expectTextAtPositions(replaceText, [
                    {line: 1, ch: 17},
                    {line: LINE_FIRST_REQUIRE, ch: CH_REQUIRE_START},
                    {line: LINE_FIRST_REQUIRE + 1, ch: CH_REQUIRE_START},
                    {line: LINE_FIRST_REQUIRE + 2, ch: CH_REQUIRE_START}
                ]);
            });

            it("should find and replace all using batch replace button", async function () {
                var searchText  = "require",
                    replaceText = "brackets.getModule";
                twCommandManager.execute(Commands.CMD_REPLACE);
                enterSearchText(searchText);
                enterReplaceText(replaceText);

                expectSelection({start: {line: 1, ch: 17}, end: {line: 1, ch: 17 + searchText.length}});
                expect(myEditor.getSelectedText()).toBe(searchText);

                expect(tw$("#replace-batch").is(":enabled")).toBe(true);
                tw$("#replace-batch").click();

                await awaitsFor(function () {
                    return twFindInFiles._searchDone;
                }, "search finished");

                tw$(".replace-checked").click();

                await awaitsFor(function () {
                    return twFindInFiles._replaceDone;
                }, "replace finished");

                // Note: LINE_FIRST_REQUIRE and CH_REQUIRE_START refer to first call to "require",
                //       but not first instance of "require" in text
                expectTextAtPositions(replaceText, [
                    {line: 1, ch: 17},
                    {line: LINE_FIRST_REQUIRE, ch: CH_REQUIRE_START},
                    {line: LINE_FIRST_REQUIRE + 1, ch: CH_REQUIRE_START},
                    {line: LINE_FIRST_REQUIRE + 2, ch: CH_REQUIRE_START}
                ]);
            });

            it("should close panel if document modified", async function () {
                var searchText  = "require",
                    replaceText = "brackets.getModule";
                twCommandManager.execute(Commands.CMD_REPLACE);
                enterSearchText(searchText);
                enterReplaceText(replaceText);

                expectSelection({start: {line: 1, ch: 17}, end: {line: 1, ch: 17 + searchText.length}});
                expect(myEditor.getSelectedText()).toBe(searchText);

                expect(tw$("#replace-batch").is(":enabled")).toBe(true);
                tw$("#replace-batch").click();

                await awaitsFor(function () {
                    return twFindInFiles._searchDone;
                }, "search finished");

                expect(tw$("#find-in-files-results").is(":visible")).toBe(true);
                myEditor.document.replaceRange("", {line: 0, ch: 0}, {line: 1, ch: 0});
                expect(tw$("#find-in-files-results").is(":visible")).toBe(false);
            });

            it("should not replace unchecked items", async function () {
                var searchText  = "require",
                    replaceText = "brackets.getModule";
                twCommandManager.execute(Commands.CMD_REPLACE);
                enterSearchText(searchText);
                enterReplaceText(replaceText);

                expectSelection({start: {line: 1, ch: 17}, end: {line: 1, ch: 17 + searchText.length}});
                expect(myEditor.getSelectedText()).toBe(searchText);

                expect(tw$("#replace-batch").is(":enabled")).toBe(true);
                tw$("#replace-batch").click();

                await awaitsFor(function () {
                    return twFindInFiles._searchDone;
                }, "search finished");

                // verify that all items are checked by default
                var $checked = tw$(".check-one:checked");
                expect($checked.length).toBe(4);

                // uncheck second and fourth
                $checked.eq(1).click();
                $checked.eq(3).click();
                expect(tw$(".check-one:checked").length).toBe(2);

                tw$(".replace-checked").click();

                await awaitsFor(function () {
                    return twFindInFiles._replaceDone;
                }, "replace finished");

                myEditor.setSelection({line: 1, ch: 17}, {line: 1, ch: 17 + replaceText.length});
                expect(myEditor.getSelectedText()).toBe(replaceText);

                expectTextAtPositions(replaceText, [
                    {line: 1, ch: 17},
                    {line: LINE_FIRST_REQUIRE + 1, ch: CH_REQUIRE_START}
                ]);
                dontExpectTextAtPositions(replaceText, [
                    {line: LINE_FIRST_REQUIRE, ch: CH_REQUIRE_START},
                    {line: LINE_FIRST_REQUIRE + 2, ch: CH_REQUIRE_START}
                ]);
            });

            it("should find all regexps and replace them with $n", async function () {
                var expectedMatch = {start: {line: LINE_FIRST_REQUIRE, ch: 23}, end: {line: LINE_FIRST_REQUIRE, ch: 34}};

                twCommandManager.execute(Commands.CMD_REPLACE);
                toggleRegexp(true);
                enterSearchText("(modules)\\/(\\w+)");
                enterReplaceText("$2:$1");

                expectSelection(expectedMatch);
                expect(/foo/i.test(myEditor.getSelectedText())).toBe(true);

                expect(tw$("#replace-batch").is(":enabled")).toBe(true);
                tw$("#replace-batch").click();

                await awaitsFor(function () {
                    return twFindInFiles._searchDone;
                }, "search finished");

                tw$(".replace-checked").click();

                await awaitsFor(function () {
                    return twFindInFiles._replaceDone;
                }, "replace finished");

                myEditor.setSelection(expectedMatch.start, expectedMatch.end);
                expect(/Foo:modules/i.test(myEditor.getSelectedText())).toBe(true);

                myEditor.setSelection({line: LINE_FIRST_REQUIRE + 1, ch: 23}, {line: LINE_FIRST_REQUIRE + 1, ch: 34});
                expect(/Bar:modules/i.test(myEditor.getSelectedText())).toBe(true);

                myEditor.setSelection({line: LINE_FIRST_REQUIRE + 2, ch: 23}, {line: LINE_FIRST_REQUIRE + 2, ch: 34});
                expect(/Baz:modules/i.test(myEditor.getSelectedText())).toBe(true);
            });

            it("should find all regexps and replace them with $n (empty subexpression)", async function () {
                var expectedMatch = {start: {line: LINE_FIRST_REQUIRE, ch: 23}, end: {line: LINE_FIRST_REQUIRE, ch: 34}};

                twCommandManager.execute(Commands.CMD_REPLACE);
                toggleRegexp(true);
                enterSearchText("(modules)(.*)\\/(\\w+)");
                enterReplaceText("$3$2:$1");

                expectSelection(expectedMatch);
                expect(/foo/i.test(myEditor.getSelectedText())).toBe(true);

                expect(tw$("#replace-batch").is(":enabled")).toBe(true);
                tw$("#replace-batch").click();

                await awaitsFor(function () {
                    return twFindInFiles._searchDone;
                }, "search finished");

                tw$(".replace-checked").click();

                await awaitsFor(function () {
                    return twFindInFiles._replaceDone;
                }, "replace finished");

                myEditor.setSelection(expectedMatch.start, expectedMatch.end);
                expect(/Foo:modules/i.test(myEditor.getSelectedText())).toBe(true);

                myEditor.setSelection({line: LINE_FIRST_REQUIRE + 1, ch: 23}, {line: LINE_FIRST_REQUIRE + 1, ch: 34});
                expect(/Bar:modules/i.test(myEditor.getSelectedText())).toBe(true);

                myEditor.setSelection({line: LINE_FIRST_REQUIRE + 2, ch: 23}, {line: LINE_FIRST_REQUIRE + 2, ch: 34});
                expect(/Baz:modules/i.test(myEditor.getSelectedText())).toBe(true);
            });

            it("should find all regexps and replace them with $nn (n has two digits)", async function () {
                var expectedMatch = {start: {line: LINE_FIRST_REQUIRE, ch: 23}, end: {line: LINE_FIRST_REQUIRE, ch: 34}};

                twCommandManager.execute(Commands.CMD_REPLACE);
                toggleRegexp(true);
                enterSearchText("()()()()()()()()()()(modules)\\/()()()(\\w+)");
                enterReplaceText("$15:$11");

                expectSelection(expectedMatch);
                expect(/foo/i.test(myEditor.getSelectedText())).toBe(true);

                expect(tw$("#replace-batch").is(":enabled")).toBe(true);
                tw$("#replace-batch").click();

                await awaitsFor(function () {
                    return twFindInFiles._searchDone;
                }, "search finished");

                tw$(".replace-checked").click();

                await awaitsFor(function () {
                    return twFindInFiles._replaceDone;
                }, "replace finished");

                myEditor.setSelection(expectedMatch.start, expectedMatch.end);
                expect(/Foo:modules/i.test(myEditor.getSelectedText())).toBe(true);

                myEditor.setSelection({line: LINE_FIRST_REQUIRE + 1, ch: 23}, {line: LINE_FIRST_REQUIRE + 1, ch: 34});
                expect(/Bar:modules/i.test(myEditor.getSelectedText())).toBe(true);

                myEditor.setSelection({line: LINE_FIRST_REQUIRE + 2, ch: 23}, {line: LINE_FIRST_REQUIRE + 2, ch: 34});
                expect(/Baz:modules/i.test(myEditor.getSelectedText())).toBe(true);
            });

            it("should find all regexps and replace them with $$n (not a subexpression, escaped dollar)", async function () {
                var expectedMatch = {start: {line: LINE_FIRST_REQUIRE, ch: 23}, end: {line: LINE_FIRST_REQUIRE, ch: 34}};

                twCommandManager.execute(Commands.CMD_REPLACE);
                toggleRegexp(true);
                enterSearchText("(modules)\\/(\\w+)");
                enterReplaceText("$$2_$$10:$2");

                expectSelection(expectedMatch);
                expect(/foo/i.test(myEditor.getSelectedText())).toBe(true);

                expect(tw$("#replace-batch").is(":enabled")).toBe(true);
                tw$("#replace-batch").click();

                await awaitsFor(function () {
                    return twFindInFiles._searchDone;
                }, "search finished");

                tw$(".replace-checked").click();

                await awaitsFor(function () {
                    return twFindInFiles._replaceDone;
                }, "replace finished");

                myEditor.setSelection(expectedMatch.start, expectedMatch.end);
                expect(/\$2_\$10:Foo/i.test(myEditor.getSelectedText())).toBe(true);

                myEditor.setSelection({line: LINE_FIRST_REQUIRE + 1, ch: 23}, {line: LINE_FIRST_REQUIRE + 1, ch: 34});
                expect(/\$2_\$10:Bar/i.test(myEditor.getSelectedText())).toBe(true);

                myEditor.setSelection({line: LINE_FIRST_REQUIRE + 2, ch: 23}, {line: LINE_FIRST_REQUIRE + 2, ch: 34});
                expect(/\$2_\$10:Baz/i.test(myEditor.getSelectedText())).toBe(true);
            });

            it("should find all regexps and replace them with $$$n (correct subexpression)", async function () {
                var expectedMatch = {start: {line: LINE_FIRST_REQUIRE, ch: 23}, end: {line: LINE_FIRST_REQUIRE, ch: 34}};

                twCommandManager.execute(Commands.CMD_REPLACE);
                toggleRegexp(true);
                enterSearchText("(modules)\\/(\\w+)");
                enterReplaceText("$2$$$1");

                expectSelection(expectedMatch);
                expect(/foo/i.test(myEditor.getSelectedText())).toBe(true);

                expect(tw$("#replace-batch").is(":enabled")).toBe(true);
                tw$("#replace-batch").click();

                await awaitsFor(function () {
                    return twFindInFiles._searchDone;
                }, "search finished");

                tw$(".replace-checked").click();

                await awaitsFor(function () {
                    return twFindInFiles._replaceDone;
                }, "replace finished");

                myEditor.setSelection(expectedMatch.start, expectedMatch.end);
                expect(/Foo\$modules/i.test(myEditor.getSelectedText())).toBe(true);

                myEditor.setSelection({line: LINE_FIRST_REQUIRE + 1, ch: 23}, {line: LINE_FIRST_REQUIRE + 1, ch: 34});
                expect(/Bar\$modules/i.test(myEditor.getSelectedText())).toBe(true);

                myEditor.setSelection({line: LINE_FIRST_REQUIRE + 2, ch: 23}, {line: LINE_FIRST_REQUIRE + 2, ch: 34});
                expect(/Baz\$modules/i.test(myEditor.getSelectedText())).toBe(true);
            });

            it("should find all regexps and replace them with $& (whole match)", async function () {
                var expectedMatch = {start: {line: LINE_FIRST_REQUIRE, ch: 23}, end: {line: LINE_FIRST_REQUIRE, ch: 34}};

                twCommandManager.execute(Commands.CMD_REPLACE);
                toggleRegexp(true);
                enterSearchText("(modules)\\/(\\w+)");
                enterReplaceText("_$&-$2$$&");

                expectSelection(expectedMatch);
                expect(/foo/i.test(myEditor.getSelectedText())).toBe(true);

                expect(tw$("#replace-batch").is(":enabled")).toBe(true);
                tw$("#replace-batch").click();

                await awaitsFor(function () {
                    return twFindInFiles._searchDone;
                }, "search finished");

                tw$(".replace-checked").click();

                await awaitsFor(function () {
                    return twFindInFiles._replaceDone;
                }, "replace finished");

                myEditor.setSelection({line: LINE_FIRST_REQUIRE, ch: 23}, {line: LINE_FIRST_REQUIRE, ch: 41});
                expect(/_modules\/Foo-Foo\$&/i.test(myEditor.getSelectedText())).toBe(true);

                myEditor.setSelection({line: LINE_FIRST_REQUIRE + 1, ch: 23}, {line: LINE_FIRST_REQUIRE + 1, ch: 41});
                expect(/_modules\/Bar-Bar\$&/i.test(myEditor.getSelectedText())).toBe(true);

                myEditor.setSelection({line: LINE_FIRST_REQUIRE + 2, ch: 23}, {line: LINE_FIRST_REQUIRE + 2, ch: 41});
                expect(/_modules\/Baz-Baz\$&/i.test(myEditor.getSelectedText())).toBe(true);
            });
        });
    });
});
