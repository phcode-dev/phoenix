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

/*global describe, it, expect, beforeEach, afterEach, awaitsFor, awaitsForDone */

define(function (require, exports, module) {


    var Commands              = require("command/Commands"),
        KeyEvent              = require("utils/KeyEvent"),
        SpecRunnerUtils       = require("spec/SpecRunnerUtils");

    describe("mainview:QuickOpen", function () {

        const QUICK_OPEN_WAIT_TIMEOUT = 30000,
            QUICK_OPEN_TEST_TIMEOUT = 300000;
        var testPath = SpecRunnerUtils.getTestPath("/spec/QuickOpen-test-files");
        var brackets, testWindow, test$, executeCommand, EditorManager, DocumentManager, PreferencesManager;

        beforeEach(async function () {

            testWindow = await SpecRunnerUtils.createTestWindowAndRun();
            brackets = testWindow.brackets;
            test$ = testWindow.$;
            executeCommand = testWindow.executeCommand;
            EditorManager = brackets.test.EditorManager;
            DocumentManager = brackets.test.DocumentManager;
            PreferencesManager = brackets.test.PreferencesManager;
            // we have to disable html lint here as html lint panel interferes with the panel view tests,
            // which was created before we added html lint. Since we only test the panel functionality, not having html
            // lint won't impact test correctness.
            const prefs = PreferencesManager.getExtensionPrefs("HTMLLint");
            const PREFS_HTML_LINT_DISABLED = "disabled";
            prefs.set(PREFS_HTML_LINT_DISABLED, true);
        }, 30000);

        afterEach(async function () {
            if (testWindow && test$ && getSearchField().length) {
                brackets.test.MainViewManager.focusActivePane();
                await awaitsFor(function () {
                    return getSearchField().length === 0;
                }, "Quick Open cleanup", QUICK_OPEN_WAIT_TIMEOUT);
            }

            await SpecRunnerUtils.closeTestWindow();
            testWindow      = null;
            brackets        = null;
            test$           = null;
            executeCommand  = null;
            EditorManager   = null;
            DocumentManager = null;
        }, 30000);

        function getSearchBar() {
            return getSearchField().closest(".modal-bar");
        }
        function getSearchField() {
            return test$("#quickOpenSearch");
        }

        function expectSearchBarOpen() {
            expect(getSearchBar().length).toBe(1);
            expect(getSearchField().length).toBe(1);
        }

        function enterSearchText(str) {
            expectSearchBarOpen();
            getSearchField().val(str).trigger("input");
        }

        async function waitForSearchField() {
            await awaitsFor(function () {
                const $field = getSearchField();
                const $bar = $field.closest(".modal-bar");
                return $field.length === 1 && $bar.length === 1 && !$bar.hasClass("popout");
            }, "Quick Open field to be ready", QUICK_OPEN_WAIT_TIMEOUT);
        }

        function pressEnter() {
            expectSearchBarOpen();

            // Using keyup here because of inside knowledge of how the events are processed
            // on the QuickOpen input.
            SpecRunnerUtils.simulateKeyEvent(KeyEvent.DOM_VK_RETURN, "keydown", getSearchField()[0]);
        }

        async function _forExpectedFileResult(query, file) {
            await awaitsFor(function () {
                const $field = getSearchField();
                const $popup = test$("body > .quick-search-container:visible");
                const $highlightedResult = $popup.find("li.highlight");
                return $field.length === 1 &&
                    $field.val() === query &&
                    $popup.length === 1 &&
                    $highlightedResult.length === 1 &&
                    $highlightedResult.text().indexOf(file) !== -1 &&
                    $highlightedResult.find(".quicksearch-namematch").length > 0;
            }, "expected Quick Open result to be rendered", QUICK_OPEN_WAIT_TIMEOUT);
        }

        /**
         * Creates a parameterized quick open test.
         * @param {string} quickOpenQuery The search query to execute after the NAVIGATE_QUICK_OPEN command.
         * @param {?string} gotoLineQuery The search query to execute after the NAVIGATE_GOTO_LINE command.
         * @param {string} file The name of the file that should be opened.
         * @param {number} line The line (1-based) where the cursor should be at the end of the operations.
         * @param {number} col The column (1-based) where the cursor should be at the end of the operations.
         * @return {function()} The configured test function.
         */
        async function quickOpenTest(quickOpenQuery, gotoLineQuery, file, line, col) {
            var editor,
                $scroller;

            await SpecRunnerUtils.loadProjectInTestWindow(testPath);

            var promise = SpecRunnerUtils.openProjectFiles([]);
            await awaitsForDone(promise, "open project files");

            // Test quick open using a partial file name
            executeCommand(Commands.NAVIGATE_QUICK_OPEN);
            await waitForSearchField();

            enterSearchText(quickOpenQuery);
            await _forExpectedFileResult(quickOpenQuery, file);
            pressEnter();

            await awaitsFor(function () {
                editor = EditorManager.getCurrentFullEditor();
                const currentDocument = DocumentManager.getCurrentDocument();
                return editor !== null &&
                    currentDocument &&
                    currentDocument.file.name === file &&
                    getSearchField().length === 0;
            }, "expected file to open", QUICK_OPEN_WAIT_TIMEOUT);

            $scroller = test$(editor.getScrollerElement());

            // Make sure we've opened the right file. It should open the longer one, because
            // of the scoring in the StringMatch algorithm.
            expect(DocumentManager.getCurrentDocument().file.name).toEqual(file);

            if (gotoLineQuery) {
                // Test go to line
                executeCommand(Commands.NAVIGATE_GOTO_LINE);
                await waitForSearchField();
                enterSearchText(gotoLineQuery);
                pressEnter();
                await awaitsFor(function () {
                    return getSearchField().length === 0 &&
                        SpecRunnerUtils.editorHasCursorPosition(editor, line - 1, col - 1);
                }, "expected Go to Line result to be committed", QUICK_OPEN_WAIT_TIMEOUT);
            }

            // The user enters a 1-based number, but the reported position
            // is 0 based, so we check for line-1, col-1.
            expect(SpecRunnerUtils.editorHasCursorPosition(editor, line - 1, col - 1)).toBeTrue();

            // We expect the result to be scrolled roughly to the middle of the window.
            const offset = $scroller.offset().top;
            const editorHeight = $scroller.height();
            const cursorPos = editor.charCoords(editor.getCursorPos(), "page").bottom;

            expect(cursorPos).toBeGreaterThan(editorHeight * 0.4 + offset);
            expect(cursorPos).toBeLessThan(editorHeight * 0.6 + offset);
        }

        it("can open a file and jump to a line, centering that line on the screen", async function () {
            await quickOpenTest("lines", ":50", "lotsOfLines.html", 50, 1);
        }, QUICK_OPEN_TEST_TIMEOUT);

        it("can open a file and jump to a line and column, centering that line on the screen", async function () {
            await quickOpenTest("lines", ":50,20", "lotsOfLines.html", 50, 20);
        }, QUICK_OPEN_TEST_TIMEOUT);

        it("can directly open a file in a given line and column, centering that line on the screen", async function () {
            await quickOpenTest("lines:150,20", null, "lotsOfLines.html", 150, 20);
        }, QUICK_OPEN_TEST_TIMEOUT);

        it("can open a file and jump to a line and column with no space after comma", async function () {
            await quickOpenTest("lines", ":50,20", "lotsOfLines.html", 50, 20);
        }, QUICK_OPEN_TEST_TIMEOUT);

        it("can open a file and jump to a line and column with space after comma", async function () {
            await quickOpenTest("lines", ":50, 20", "lotsOfLines.html", 50, 20);
        }, QUICK_OPEN_TEST_TIMEOUT);

        it("can directly open a file with line:column format", async function () {
            await quickOpenTest("lines:150:20", null, "lotsOfLines.html", 150, 20);
        }, QUICK_OPEN_TEST_TIMEOUT);

        it("can directly open a file with line:column format and spaces", async function () {
            await quickOpenTest("lines:150: 20", null, "lotsOfLines.html", 150, 20);
        }, QUICK_OPEN_TEST_TIMEOUT);
    });
});
