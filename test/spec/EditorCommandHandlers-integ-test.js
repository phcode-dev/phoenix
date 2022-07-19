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

/*global describe, it, expect, beforeEach, afterEach, awaitsForDone, awaitsFor, beforeAll, afterAll */

define(function (require, exports, module) {


    var EditorManager   = require("editor/EditorManager"),
        Commands        = require("command/Commands"),
        CommandManager  = require("command/CommandManager"),
        SpecRunnerUtils = require("spec/SpecRunnerUtils");

    require("editor/EditorCommandHandlers");

    describe("integration:EditorCommandHandlers Integration", function () {
        let myDocument, myEditor;

        afterEach(function () {
            if (myDocument) {
                SpecRunnerUtils.destroyMockEditor(myDocument);
                myEditor = null;
                myDocument = null;
            }
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

        let testPath = SpecRunnerUtils.getTestPath("/spec/EditorCommandHandlers-test-files"),
            testWindow;

        // Helper function for creating a test window
        async function createTestWindow(spec) {
            testWindow = await SpecRunnerUtils.createTestWindowAndRun();
            // Load module instances from brackets.test
            CommandManager      = testWindow.brackets.test.CommandManager;
            Commands            = testWindow.brackets.test.Commands;
            EditorManager       = testWindow.brackets.test.EditorManager;

            await SpecRunnerUtils.loadProjectInTestWindow(testPath);
        }

        // Helper function to open a new inline editor
        async function openInlineEditor(spec) {
            var promise;
            promise = CommandManager.execute(Commands.CMD_ADD_TO_WORKINGSET_AND_OPEN, {fullPath: testPath + "/test.html"});
            await awaitsForDone(promise, "Open into working set");

            // Open inline editor onto test.css's ".testClass" rule
            promise = SpecRunnerUtils.toggleQuickEditAtOffset(EditorManager.getCurrentFullEditor(), {line: 8, ch: 11});
            await awaitsForDone(promise, "Open inline editor");

            myEditor = EditorManager.getCurrentFullEditor().getInlineWidgets()[0].editor;
        }

        // Helper function for closing open files in the test window
        async function closeFilesInTestWindow() {
            let promise = CommandManager.execute(Commands.FILE_CLOSE_ALL);
            try{
                await awaitsFor(
                    function isDlgVisible() {
                        // sometimes there may not be anything to close
                        let $dlg = testWindow.$(".modal.instance");
                        return !!$dlg.length;
                    },
                    "brackets.test.closing",
                    1000
                );
            } catch (e) {
                // do nothing.
            }

            // Close the save dialog without saving the changes
            let $dlg = testWindow.$(".modal.instance");
            if ($dlg.length) {
                await SpecRunnerUtils.clickDialogButton("dontsave");
            }
            $dlg = null;
            await awaitsForDone(promise, "Close all open files in working set");
        }

        // Helper function for closing the test window
        async function closeTestWindow() {
            testWindow      = null;
            CommandManager  = null;
            Commands        = null;
            EditorManager   = null;
            await SpecRunnerUtils.closeTestWindow();
        }
        beforeAll(async function () {
            await createTestWindow(this);
        }, 30000);

        afterAll(async function () {
            await closeTestWindow();
        });


        describe("Move Lines Up/Down - inline editor", function () {

            var moveContent = ".testClass {\n" +
                "    color: red;\n" +
                "}";

            beforeEach(async function () {
                await openInlineEditor(this);
            }, 30000);

            afterEach(async function () {
                await closeFilesInTestWindow();
            }, 10000);


            it("should not move the first line of the inline editor up", async function () {
                myEditor.setCursorPos({line: 0, ch: 5});
                let promise = CommandManager.execute(Commands.EDIT_LINE_UP, myEditor);
                await awaitsForDone(promise);

                expect(myEditor.document.getText()).toEqual(moveContent);
                expect(myEditor._codeMirror.doc.historySize().undo).toBe(0);
                expect(myEditor.getFirstVisibleLine()).toBe(0);
                expect(myEditor.getLastVisibleLine()).toBe(2);
            });

            it("should not move the last line of the inline editor down", function () {
                myEditor.setCursorPos({line: 2, ch: 5});
                CommandManager.execute(Commands.EDIT_LINE_DOWN, myEditor);

                expect(myEditor.document.getText()).toEqual(moveContent);
                expect(myEditor._codeMirror.doc.historySize().undo).toBe(0);
                expect(myEditor.getFirstVisibleLine()).toBe(0);
                expect(myEditor.getLastVisibleLine()).toBe(2);
            });

            it("should be able to move the second to last line of the inline editor down", function () {
                myEditor.setCursorPos({line: 1, ch: 5});
                CommandManager.execute(Commands.EDIT_LINE_DOWN, myEditor);

                var lines = moveContent.split("\n");
                var temp = lines[1];
                lines[1] = lines[2];
                lines[2] = temp;
                var expectedText = lines.join("\n");

                expect(myEditor.document.getText()).toEqual(expectedText);
                expect(myEditor.getFirstVisibleLine()).toBe(0);
                expect(myEditor.getLastVisibleLine()).toBe(2);
            });

            it("should be able to move the last line of the inline editor up", function () {
                myEditor.setCursorPos({line: 2, ch: 0});
                CommandManager.execute(Commands.EDIT_LINE_UP, myEditor);

                var lines = moveContent.split("\n");
                var temp = lines[1];
                lines[1] = lines[2];
                lines[2] = temp;
                var expectedText = lines.join("\n");

                expect(myEditor.document.getText()).toEqual(expectedText);
                expect(myEditor.getFirstVisibleLine()).toBe(0);
                expect(myEditor.getLastVisibleLine()).toBe(2);
            });
        });

        describe("Editor Navigation Commands", function () {
            it("should jump to definition", async function () {
                var promise,
                    selection;
                promise = CommandManager.execute(Commands.CMD_ADD_TO_WORKINGSET_AND_OPEN, {fullPath: testPath + "/test.js"});
                await awaitsForDone(promise, "Open into working set");

                myEditor = EditorManager.getCurrentFullEditor();
                myEditor.setCursorPos({line: 5, ch: 8});
                promise = CommandManager.execute(Commands.NAVIGATE_JUMPTO_DEFINITION);
                await awaitsForDone(promise, "Jump To Definition");

                selection = myEditor.getSelection();
                expect(fixSel(selection)).toEqual(fixSel({
                    start: {line: 0, ch: 9},
                    end: {line: 0, ch: 15}
                }));
            });
        });


        describe("Open Line Above and Below - inline editor", function () {

            var content = ".testClass {\n" +
                "    color: red;\n" +
                "}";

            beforeEach(async function () {
                await openInlineEditor(this);
            });

            afterEach(async function () {
                await closeFilesInTestWindow();
            });


            it("should insert new line above the first line of the inline editor", function () {
                myEditor.setSelection({line: 0, ch: 4}, {line: 0, ch: 6});
                CommandManager.execute(Commands.EDIT_OPEN_LINE_ABOVE, myEditor);

                var lines = content.split("\n");
                lines.splice(0, 0, "");
                var expectedText = lines.join("\n");

                expect(myEditor.document.getText()).toEqual(expectedText);
                expect(myEditor.getFirstVisibleLine()).toBe(0);
                expect(myEditor.getLastVisibleLine()).toBe(3);
            });

            it("should insert new line below the first line of the inline editor", function () {
                myEditor.setCursorPos({line: 0, ch: 3});
                CommandManager.execute(Commands.EDIT_OPEN_LINE_BELOW, myEditor);

                var lines = content.split("\n");
                lines.splice(1, 0, "    ");
                var expectedText = lines.join("\n");

                expect(myEditor.document.getText()).toEqual(expectedText);
                expect(myEditor.getFirstVisibleLine()).toBe(0);
                expect(myEditor.getLastVisibleLine()).toBe(3);
            });

            it("should insert new line above the last line of the inline editor", function () {
                myEditor.setSelection({line: 2, ch: 0}, {line: 2, ch: 1});
                CommandManager.execute(Commands.EDIT_OPEN_LINE_ABOVE, myEditor);

                var lines = content.split("\n");
                lines.splice(2, 0, "    ");
                var expectedText = lines.join("\n");

                expect(myEditor.document.getText()).toEqual(expectedText);
                expect(myEditor.getFirstVisibleLine()).toBe(0);
                expect(myEditor.getLastVisibleLine()).toBe(3);
            });

            it("should insert new line below the last line of the inline editor", function () {
                myEditor.setCursorPos({line: 3, ch: 0});
                CommandManager.execute(Commands.EDIT_OPEN_LINE_BELOW, myEditor);

                var lines = content.split("\n");
                lines.splice(3, 0, "");
                var expectedText = lines.join("\n");

                expect(myEditor.document.getText()).toEqual(expectedText);
                expect(myEditor.getFirstVisibleLine()).toBe(0);
                expect(myEditor.getLastVisibleLine()).toBe(3);
            });

            it("should insert new indented line above the second line of the inline editor", function () {
                myEditor.setCursorPos({line: 1, ch: 5});
                CommandManager.execute(Commands.EDIT_OPEN_LINE_ABOVE, myEditor);

                var lines = content.split("\n");
                lines.splice(1, 0, "    ");
                var expectedText = lines.join("\n");

                expect(myEditor.document.getText()).toEqual(expectedText);
                expect(myEditor.getFirstVisibleLine()).toBe(0);
                expect(myEditor.getLastVisibleLine()).toBe(3);
            });

            it("should insert new indented line below the second line of the inline editor", function () {
                myEditor.setCursorPos({line: 1, ch: 5});
                CommandManager.execute(Commands.EDIT_OPEN_LINE_BELOW, myEditor);

                var lines = content.split("\n");
                lines.splice(2, 0, "    ");
                var expectedText = lines.join("\n");

                expect(myEditor.document.getText()).toEqual(expectedText);
                expect(myEditor.getFirstVisibleLine()).toBe(0);
                expect(myEditor.getLastVisibleLine()).toBe(3);
            });
        });
    });
});
