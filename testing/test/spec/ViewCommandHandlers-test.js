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

/*global describe, it, runs, expect, waitsForDone, beforeFirst, afterLast */

define(function (require, exports, module) {


    var CommandManager,      // loaded from brackets.test
        Commands,            // loaded from brackets.test
        EditorManager,       // loaded from brackets.test
        FileViewController,
        SpecRunnerUtils     = require("spec/SpecRunnerUtils");

    describe("ViewCommandHandlers", function () {
        this.category = "integration";

        var testPath = SpecRunnerUtils.getTestPath("/spec/ViewCommandHandlers-test-files"),
            testWindow;

        var CSS_FILE  = testPath + "/test.css",
            HTML_FILE = testPath + "/test.html";

        beforeFirst(function () {
            var promise;

            SpecRunnerUtils.createTestWindowAndRun(this, function (w) {
                testWindow = w;

                // Load module instances from brackets.test
                CommandManager      = testWindow.brackets.test.CommandManager;
                Commands            = testWindow.brackets.test.Commands;
                EditorManager       = testWindow.brackets.test.EditorManager;
                FileViewController  = testWindow.brackets.test.FileViewController;

                SpecRunnerUtils.loadProjectInTestWindow(testPath);
            });

            runs(function () {
                promise = CommandManager.execute(Commands.CMD_ADD_TO_WORKINGSET_AND_OPEN, {fullPath: HTML_FILE});
                waitsForDone(promise, "Open into working set");
            });

            runs(function () {
                // Open inline editor onto test.css's ".testClass" rule
                promise = SpecRunnerUtils.toggleQuickEditAtOffset(EditorManager.getCurrentFullEditor(), {line: 8, ch: 11});
                waitsForDone(promise, "Open inline editor");
            });
        });

        afterLast(function () {
            testWindow          = null;
            CommandManager      = null;
            Commands            = null;
            EditorManager       = null;
            FileViewController  = null;
            SpecRunnerUtils.closeTestWindow();
        });


        function getEditors() {
            var editor = EditorManager.getCurrentFullEditor();
            return {
                editor: editor,
                inline: editor.getInlineWidgets()[0].editor
            };
        }


        describe("Adjust the Font Size", function () {
            it("should increase the font size in both editor and inline editor", function () {
                runs(function () {
                    var editors      = getEditors(),
                        originalSize = editors.editor.getTextHeight();

                    CommandManager.execute(Commands.VIEW_INCREASE_FONT_SIZE);

                    expect(editors.editor.getTextHeight()).toBeGreaterThan(originalSize);
                    expect(editors.inline.getTextHeight()).toBeGreaterThan(originalSize);
                });
            });

            it("should decrease the font size in both editor and inline editor", function () {
                runs(function () {
                    var editors      = getEditors(),
                        originalSize = editors.editor.getTextHeight();

                    CommandManager.execute(Commands.VIEW_DECREASE_FONT_SIZE);

                    expect(editors.editor.getTextHeight()).toBeLessThan(originalSize);
                    expect(editors.inline.getTextHeight()).toBeLessThan(originalSize);
                });
            });

            it("should restore the font size in both editor and inline editor", function () {
                runs(function () {
                    var editors      = getEditors();
                    var expectedSize = editors.editor.getTextHeight();

                    CommandManager.execute(Commands.VIEW_INCREASE_FONT_SIZE);
                    CommandManager.execute(Commands.VIEW_INCREASE_FONT_SIZE);
                    CommandManager.execute(Commands.VIEW_RESTORE_FONT_SIZE);

                    expect(editors.editor.getTextHeight()).toBe(expectedSize);
                    expect(editors.inline.getTextHeight()).toBe(expectedSize);
                });
            });

            it("should keep the same font size when opening another document", function () {
                var promise, originalSize, editor;

                runs(function () {
                    editor       = EditorManager.getCurrentFullEditor();
                    originalSize = editor.getTextHeight();

                    promise = CommandManager.execute(Commands.VIEW_INCREASE_FONT_SIZE);
                    waitsForDone(promise, "Increase font size");
                });

                runs(function () {
                    // Open another document and bring it to the front
                    waitsForDone(FileViewController.openAndSelectDocument(CSS_FILE, FileViewController.PROJECT_MANAGER),
                                 "FILE_OPEN on file timeout", 1000);
                });

                runs(function () {
                    editor = EditorManager.getCurrentFullEditor();
                    expect(editor.getTextHeight()).toBeGreaterThan(originalSize);
                });
            });
        });
    });
});
