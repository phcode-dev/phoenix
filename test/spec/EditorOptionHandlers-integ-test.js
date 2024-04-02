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

/*global describe, afterEach, it, expect, awaitsForDone, beforeAll, afterAll */

define(function (require, exports, module) {


    // Load dependent modules
    var CommandManager,      // loaded from brackets.test
        Commands,            // loaded from brackets.test
        EditorManager,       // loaded from brackets.test
        DocumentManager,     // loaded from brackets.test
        FileViewController,
        PreferencesManager,
        SpecRunnerUtils     = require("spec/SpecRunnerUtils");


    describe("LegacyInteg:EditorOptionHandlers", function () {

        var testPath = SpecRunnerUtils.getTestPath("/spec/EditorOptionHandlers-test-files"),
            testWindow;

        var CSS_FILE  = testPath + "/test.css",
            HTML_FILE = testPath + "/test.html",
            JS_FILE   = testPath + "/test.js";

        var OPEN_BRACKET  = 91,
            CLOSE_BRACKET = 93,
            SINGLE_QUOTE  = 39,
            BACKSPACE     = 8;


        beforeAll(async function () {
            // Create a new window that will be shared by ALL tests in this spec.
            testWindow = await SpecRunnerUtils.createTestWindowAndRun({forceReload: true});
            // Load module instances from brackets.test
            CommandManager      = testWindow.brackets.test.CommandManager;
            Commands            = testWindow.brackets.test.Commands;
            EditorManager       = testWindow.brackets.test.EditorManager;
            DocumentManager     = testWindow.brackets.test.DocumentManager;
            FileViewController  = testWindow.brackets.test.FileViewController;
            PreferencesManager  = testWindow.brackets.test.PreferencesManager;

            await SpecRunnerUtils.loadProjectInTestWindow(testPath);
        }, 30000);

        afterAll(async function () {
            testWindow          = null;
            CommandManager      = null;
            Commands            = null;
            EditorManager       = null;
            DocumentManager     = null;
            FileViewController  = null;
            await SpecRunnerUtils.closeTestWindow();
        }, 30000);


        afterEach(async function () {
            await testWindow.closeAllFiles();
        });

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

        function checkLineWrapping(editor, firstPos, secondPos, shouldWrap) {
            var firstLineBottom, nextLineBottom;

            expect(editor).toBeTruthy();

            editor.setCursorPos(firstPos);
            firstLineBottom = editor._codeMirror.cursorCoords(null, "local").bottom;

            editor.setCursorPos(secondPos);
            nextLineBottom = editor._codeMirror.cursorCoords(null, "local").bottom;

            if (shouldWrap) {
                expect(firstLineBottom).toBeLessThan(nextLineBottom);
            } else {
                expect(firstLineBottom).toEqual(nextLineBottom);
            }
        }

        function checkActiveLine(editor, line, shouldShow) {
            var lineInfo;

            expect(editor).toBeTruthy();
            editor.setCursorPos({line: line, ch: 0});
            lineInfo = editor._codeMirror.lineInfo(line);

            if (shouldShow) {
                expect(lineInfo.wrapClass).toBe("CodeMirror-activeline");
            } else {
                expect(lineInfo.wrapClass).toBeUndefined();
            }
        }

        function checkActiveLineOption(editor, shouldBe) {
            expect(editor).toBeTruthy();
            expect(editor._codeMirror.getOption("styleActiveLine")).toBe(shouldBe);
        }

        function checkLineNumbers(editor, shouldShow) {
            var gutterElement, $lineNumbers;

            expect(editor).toBeTruthy();
            gutterElement = editor._codeMirror.getGutterElement();
            $lineNumbers = $(gutterElement).find(".CodeMirror-linenumbers");

            if (shouldShow) {
                expect($lineNumbers.length).not.toBe(0);
            } else {
                expect($lineNumbers.length).toBe(0);
            }
        }

        function checkCloseBraces(editor, startSel, endSel, keyCode, expectedText) {
            var input, line;

            expect(editor).toBeTruthy();
            input = editor._codeMirror.getInputField();

            if (endSel) {
                editor.setSelection(startSel, endSel);
            } else {
                editor.setCursorPos(startSel);
            }

            SpecRunnerUtils.simulateKeyEvent(keyCode, keyCode === BACKSPACE ? "keydown" : "keypress", input);

            line = editor._codeMirror.getLine(startSel.line);
            expect(line).toBe(expectedText);
        }


        // Helper functions to open editors / toggle options
        async function openEditor(fullPath) {
            var promise = CommandManager.execute(Commands.CMD_ADD_TO_WORKINGSET_AND_OPEN, {fullPath: fullPath});
            await awaitsForDone(promise, "Open into working set");
        }

        async function openAnotherEditor(fullpath) {
            // Open another document and bring it to the front
            await awaitsForDone(FileViewController.openAndSelectDocument(fullpath, FileViewController.PROJECT_MANAGER),
                "FILE_OPEN on file timeout", 1000);
        }

        async function openInlineEditor(toggleEditorAt) {
            toggleEditorAt = toggleEditorAt || {line: 8, ch: 11};
            await openEditor(HTML_FILE);

            // Open inline editor onto test.css's ".testClass" rule
            var promise = SpecRunnerUtils.toggleQuickEditAtOffset(EditorManager.getCurrentFullEditor(), toggleEditorAt);
            await awaitsForDone(promise, "Open inline editor");
        }

        async function toggleOption(commandID, text) {
            var promise = CommandManager.execute(commandID);
            await awaitsForDone(promise, text);
        }


        describe("Toggle Word Wrap", function () {
            it("should wrap long lines in main editor if word wrap enabled", async function () {
                // turn on word wrap
                await toggleOption(Commands.TOGGLE_WORD_WRAP, "Toggle word-wrap");
                await openEditor(HTML_FILE);

                var editor = EditorManager.getCurrentFullEditor();

                // Use two cursor positions to detect line wrapping. First position at
                // the beginning of a long line and the second position to be
                // somewhere on the long line that will be part of an extra line
                // created by word-wrap and get its bottom coordinate.
                checkLineWrapping(editor, {line: 8, ch: 0}, {line: 8, ch: 320}, true);
            });

            it("should also wrap long lines in inline editor", async function () {
                await openInlineEditor();

                var editor = EditorManager.getCurrentFullEditor().getInlineWidgets()[0].editor;
                checkLineWrapping(editor, {line: 0, ch: 0}, {line: 0, ch: 320}, true);
            });

            it("should NOT wrap the long lines after turning off word-wrap", async function () {
                // Turn off word-wrap
                await toggleOption(Commands.TOGGLE_WORD_WRAP, "Toggle word-wrap");
                await openEditor(CSS_FILE);

                var editor = EditorManager.getCurrentFullEditor();
                checkLineWrapping(editor, {line: 0, ch: 1}, {line: 0, ch: 180}, false);
            });

            it("should NOT wrap the long lines in another document when word-wrap off", async function () {
                await openEditor(CSS_FILE);
                await openAnotherEditor(HTML_FILE);

                var editor = EditorManager.getCurrentFullEditor();
                checkLineWrapping(editor, {line: 8, ch: 0}, {line: 8, ch: 210}, false);
            });
        });


        describe("Toggle Active Line", function () {
            it("should show active line in main editor by default", async function () {
                await openEditor(HTML_FILE);

                var editor = EditorManager.getCurrentFullEditor();
                checkActiveLine(editor, 5, true);
            });

            it("should show active line in inline editor by default", async function () {
                await openInlineEditor();

                var editor = EditorManager.getCurrentFullEditor().getInlineWidgets()[0].editor;
                checkActiveLine(editor, 0, true);
            });

            it("should not style active line after turning it off", async function () {
                // Turn on show active line
                await toggleOption(Commands.TOGGLE_ACTIVE_LINE, "Toggle active line");
                await openEditor(CSS_FILE);

                var editor = EditorManager.getCurrentFullEditor();
                checkActiveLine(editor, 0, false);
                await toggleOption(Commands.TOGGLE_ACTIVE_LINE, "Toggle active line");
            });

            it("should have the active line option be FALSE when the editor has a selection", async function () {
                await openEditor(CSS_FILE);

                var editor = EditorManager.getCurrentFullEditor();
                editor.setSelection({line: 0, ch: 0}, {line: 0, ch: 1});
                checkActiveLineOption(editor, false);
            });

            it("should style the active line when opening another document with show active line on", async function () {
                await openEditor(CSS_FILE);
                await openAnotherEditor(HTML_FILE);

                var editor = EditorManager.getCurrentFullEditor();
                checkActiveLine(editor, 3, true);
            });
        });

        describe("Toggle Rulers", function () {
            function _checkDefaultRuler(editor) {
                const rulers = editor._codeMirror.getOption("rulers");
                expect(rulers.length).toBe(1);
                expect(rulers[0].column).toBe(120);
            }
            it("should show ruler in editor by default", async function () {
                await openEditor(HTML_FILE);
                _checkDefaultRuler(EditorManager.getCurrentFullEditor());
            });

            it("should show ruler in inline editor by default", async function () {
                await openInlineEditor();
                _checkDefaultRuler(EditorManager.getCurrentFullEditor().getInlineWidgets()[0].editor);
            });

            it("should be able to toggle ruler preference", async function () {
                await openEditor(HTML_FILE);
                const editor = EditorManager.getCurrentFullEditor();
                _checkDefaultRuler(editor);
                PreferencesManager.set("editor.rulersEnabled", false);
                expect(editor._codeMirror.getOption("rulers")).toBeNull();
                PreferencesManager.set("editor.rulersEnabled", true);
                _checkDefaultRuler(editor);
            });

            it("should be able to set multiple rulers without color", async function () {
                await openEditor(HTML_FILE);
                const editor = EditorManager.getCurrentFullEditor();
                _checkDefaultRuler(editor);
                PreferencesManager.set("editor.rulers", [10, 30, 50]);
                let rulers = editor._codeMirror.getOption("rulers");
                expect(rulers.length).toBe(3);
                expect(rulers[0].column).toBe(10);
                expect(rulers[1].column).toBe(30);
                expect(rulers[2].column).toBe(50);
                PreferencesManager.set("editor.rulers", [120]);
                _checkDefaultRuler(editor);
            });

            it("should be able to set multiple rulers with color", async function () {
                await openEditor(HTML_FILE);
                const editor = EditorManager.getCurrentFullEditor();
                _checkDefaultRuler(editor);
                PreferencesManager.set("editor.rulers", [10, 30, 50]);
                PreferencesManager.set("editor.rulerColors", ["red", "", "#458"]);
                let rulers = editor._codeMirror.getOption("rulers");
                expect(rulers.length).toBe(3);
                expect(rulers[0].color).toBe("red");
                expect(rulers[1].color).toBeDefined();
                expect(rulers[2].color).toBe("#458");
                PreferencesManager.set("editor.rulers", [120]);
                _checkDefaultRuler(editor);
            });
        });


        describe("Toggle Line Numbers", function () {
            it("should show line numbers in main editor by default", async function () {
                await openEditor(HTML_FILE);

                var editor = EditorManager.getCurrentFullEditor();
                checkLineNumbers(editor, true);
            });

            it("should also show line numbers in inline editor by default", async function () {
                await openInlineEditor();

                var editor = EditorManager.getCurrentFullEditor().getInlineWidgets()[0].editor;
                checkLineNumbers(editor, true);
            });

            it("should NOT show line numbers in main editor after turning it off", async function () {
                // Turn off show line numbers
                await toggleOption(Commands.TOGGLE_LINE_NUMBERS, "Toggle line numbers");
                await openEditor(CSS_FILE);

                var editor = EditorManager.getCurrentFullEditor();
                checkLineNumbers(editor, false);
            });

            it("should NOT show line numbers in inline editor after turning it off", async function () {
                await openInlineEditor();

                var editor = EditorManager.getCurrentFullEditor().getInlineWidgets()[0].editor;
                checkLineNumbers(editor, false);
            });

            it("should NOT show line numbers when opening another document with show line numbers off", async function () {
                await openEditor(CSS_FILE);
                await openAnotherEditor(HTML_FILE);

                var editor = EditorManager.getCurrentFullEditor();
                checkLineNumbers(editor, false);
            });
        });


        describe("Toggle Auto Close Braces", function () {
            it("should auto close braces in main editor by default", async function () {
                await openEditor(JS_FILE);

                var editor = EditorManager.getCurrentFullEditor();
                checkCloseBraces(editor, {line: 0, ch: 35}, null, OPEN_BRACKET, "var myContent = \"This is awesome!\";[]");
            });

            it("should auto close braces in inline editor by default", async function () {
                await openInlineEditor({line: 9, ch: 11});

                var editor = EditorManager.getCurrentFullEditor().getInlineWidgets()[0].editor;
                checkCloseBraces(editor, {line: 1, ch: 32}, null, OPEN_BRACKET, ".shortLineClass { color: red; }[]");
            });

            it("should NOT auto close braces in the main editor after turning it on", async function () {
                // Turn off auto close braces
                await toggleOption(Commands.TOGGLE_CLOSE_BRACKETS, "Toggle auto close braces");
                await openEditor(JS_FILE);

                var editor = EditorManager.getCurrentFullEditor();
                checkCloseBraces(editor, {line: 0, ch: 35}, null, OPEN_BRACKET, "var myContent = \"This is awesome!\";");
            });

            it("should NOT auto close braces in inline editor after turning it on", async function () {
                await openInlineEditor({line: 9, ch: 11});

                var editor = EditorManager.getCurrentFullEditor().getInlineWidgets()[0].editor;
                checkCloseBraces(editor, {line: 1, ch: 15}, null, OPEN_BRACKET, ".shortLineClass { color: red; }");
            });

            it("should auto close braces when opening another document with auto close braces on", async function () {
                await toggleOption(Commands.TOGGLE_CLOSE_BRACKETS, "Toggle auto close braces");
                await openEditor(CSS_FILE);
                await openAnotherEditor(JS_FILE);

                var editor = EditorManager.getCurrentFullEditor();
                checkCloseBraces(editor, {line: 0, ch: 35}, null, OPEN_BRACKET, "var myContent = \"This is awesome!\";[]");
            });

            it("should only auto close braces before spaces, closing braces or end of lines", async function () {
                await openEditor(JS_FILE);

                var editor = EditorManager.getCurrentFullEditor();
                checkCloseBraces(editor, {line: 0, ch: 0}, null, OPEN_BRACKET, "var myContent = \"This is awesome!\";");
                checkCloseBraces(editor, {line: 0, ch: 15}, null, OPEN_BRACKET, "var myContent =[] \"This is awesome!\";");
                checkCloseBraces(editor, {line: 0, ch: 16}, null, OPEN_BRACKET, "var myContent =[[]] \"This is awesome!\";");
                checkCloseBraces(editor, {line: 0, ch: 39}, null, OPEN_BRACKET, "var myContent =[[]] \"This is awesome!\";[]");
            });

            it("should overwrite a close brace when writing a close brace before the same close brace", async function () {
                await openEditor(JS_FILE);

                var editor = EditorManager.getCurrentFullEditor();
                checkCloseBraces(editor, {line: 0, ch: 15}, null, OPEN_BRACKET, "var myContent =[] \"This is awesome!\";");
                checkCloseBraces(editor, {line: 0, ch: 16}, null, CLOSE_BRACKET, "var myContent =[] \"This is awesome!\";");
                expect(fixPos(editor.getCursorPos())).toEql(fixPos({line: 0, ch: 17}));

            });

            it("should wrap a selection between braces", async function () {
                await openEditor(JS_FILE);

                var editor = EditorManager.getCurrentFullEditor();
                checkCloseBraces(editor, {line: 0, ch: 16}, {line: 0, ch: 34}, OPEN_BRACKET, "var myContent = [\"This is awesome!\"];");
                expect(fixSel(editor.getSelection())).toEql(fixSel({start: {line: 0, ch: 17}, end: {line: 0, ch: 35}}));
            });

            it("should delete both open and close braces when both are together and backspacing", async function () {
                await openEditor(JS_FILE);

                var editor = EditorManager.getCurrentFullEditor();
                checkCloseBraces(editor, {line: 0, ch: 15}, null, OPEN_BRACKET, "var myContent =[] \"This is awesome!\";");
                checkCloseBraces(editor, {line: 0, ch: 16}, null, BACKSPACE, "var myContent = \"This is awesome!\";");
            });

            it("should auto close single quotes inside comments", async function () {
                await openEditor(JS_FILE);

                var editor = EditorManager.getCurrentFullEditor();
                checkCloseBraces(editor, {line: 0, ch: 15}, null, SINGLE_QUOTE, "var myContent ='' \"This is awesome!\";");
                checkCloseBraces(editor, {line: 1, ch: 7}, null, SINGLE_QUOTE, "// Yes,'' it is!");
            });
        });
    });
});
