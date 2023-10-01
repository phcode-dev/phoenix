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

/*global describe, it, expect, awaitsForDone, beforeAll, afterAll */

define(function (require, exports, module) {


    var CommandManager,      // loaded from brackets.test
        Commands,            // loaded from brackets.test
        EditorManager,       // loaded from brackets.test
        FileViewController,
        SpecRunnerUtils     = require("spec/SpecRunnerUtils");

    describe("mainview:ViewCommandHandlers", function () {

        var testPath = SpecRunnerUtils.getTestPath("/spec/ViewCommandHandlers-test-files"),
            testWindow;

        var CSS_FILE  = testPath + "/test.css",
            HTML_FILE = testPath + "/test.html";

        beforeAll(async function () {
            var promise;

            testWindow = await SpecRunnerUtils.createTestWindowAndRun();
            // Load module instances from brackets.test
            CommandManager      = testWindow.brackets.test.CommandManager;
            Commands            = testWindow.brackets.test.Commands;
            EditorManager       = testWindow.brackets.test.EditorManager;
            FileViewController  = testWindow.brackets.test.FileViewController;

            await SpecRunnerUtils.loadProjectInTestWindow(testPath);

            promise = CommandManager.execute(Commands.CMD_ADD_TO_WORKINGSET_AND_OPEN, {fullPath: HTML_FILE});
            await awaitsForDone(promise, "Open into working set");

            // Open inline editor onto test.css's ".testClass" rule
            promise = SpecRunnerUtils.toggleQuickEditAtOffset(EditorManager.getCurrentFullEditor(), {line: 8, ch: 11});
            await awaitsForDone(promise, "Open inline editor");
        }, 30000);

        afterAll(async function () {
            testWindow          = null;
            CommandManager      = null;
            Commands            = null;
            EditorManager       = null;
            FileViewController  = null;
            await SpecRunnerUtils.closeTestWindow();
        }, 30000);


        function getEditors() {
            var editor = EditorManager.getCurrentFullEditor();
            return {
                editor: editor,
                inline: editor.getInlineWidgets()[0].editor
            };
        }


        describe("Adjust the Font Size", function () {
            it("should increase the font size in both editor and inline editor", async function () {
                var editors      = getEditors(),
                    originalSize = editors.editor.getTextHeight();

                CommandManager.execute(Commands.VIEW_INCREASE_FONT_SIZE);

                expect(editors.editor.getTextHeight()).toBeGreaterThan(originalSize);
                expect(editors.inline.getTextHeight()).toBeGreaterThan(originalSize);
            });

            it("should decrease the font size in both editor and inline editor", async function () {
                var editors      = getEditors(),
                    originalSize = editors.editor.getTextHeight();

                CommandManager.execute(Commands.VIEW_DECREASE_FONT_SIZE);

                expect(editors.editor.getTextHeight()).toBeLessThan(originalSize);
                expect(editors.inline.getTextHeight()).toBeLessThan(originalSize);
            });

            it("should restore the font size in both editor and inline editor", async function () {
                var editors      = getEditors();
                var expectedSize = editors.editor.getTextHeight();

                CommandManager.execute(Commands.VIEW_INCREASE_FONT_SIZE);
                CommandManager.execute(Commands.VIEW_INCREASE_FONT_SIZE);
                CommandManager.execute(Commands.VIEW_RESTORE_FONT_SIZE);

                expect(editors.editor.getTextHeight()).toBe(expectedSize);
                expect(editors.inline.getTextHeight()).toBe(expectedSize);
            });

            it("should keep the same font size when opening another document", async function () {
                var promise, originalSize, editor;

                editor       = EditorManager.getCurrentFullEditor();
                originalSize = editor.getTextHeight();

                promise = CommandManager.execute(Commands.VIEW_INCREASE_FONT_SIZE);
                await awaitsForDone(promise, "Increase font size");

                // Open another document and bring it to the front
                await awaitsForDone(FileViewController.openAndSelectDocument(CSS_FILE, FileViewController.PROJECT_MANAGER),
                    "FILE_OPEN on file timeout", 1000);

                editor = EditorManager.getCurrentFullEditor();
                expect(editor.getTextHeight()).toBeGreaterThan(originalSize);
            });
        });
    });
});
