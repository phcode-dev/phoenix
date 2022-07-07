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

/*global describe, it, expect, beforeEach, afterEach, runs, waitsForDone, spyOn */

define(function (require, exports, module) {


    var SpecRunnerUtils = brackets.getModule("spec/SpecRunnerUtils"),
        CommandManager,
        Commands,
        Dialogs,
        EditorManager,
        DocumentManager,
        MainViewManager,
        FileSystem;

    describe("CloseOthers", function () {
        var testPath = SpecRunnerUtils.getTestPath("/spec/Extension-test-project-files/"),
            testWindow,
            $,
            docSelectIndex,
            cmdToRun,
            brackets;

        function createUntitled(count) {
            function doCreateUntitled(content) {
                runs(function () {
                    var promise = CommandManager.execute(Commands.FILE_NEW_UNTITLED);
                    promise.done(function (untitledDoc) {
                        untitledDoc.replaceRange(content, {line: 0, ch: 0});
                    });
                    waitsForDone(promise, "FILE_NEW_UNTITLED");
                });
            }

            var i;
            for (i = 0; i < count; i++) {
                doCreateUntitled(String(i));
            }
        }

        /** Expect a file to exist (failing test if not) and then delete it */
        function expectAndDelete(fullPath) {
            runs(function () {
                var promise = SpecRunnerUtils.resolveNativeFileSystemPath(fullPath);
                waitsForDone(promise, "Verify file exists: " + fullPath);
            });
            runs(function () {
                var promise = SpecRunnerUtils.deletePath(fullPath);
                waitsForDone(promise, "Remove testfile " + fullPath, 5000);
            });
        }

        function getFilename(i) {
            return testPath + "test_closeothers" + i + ".js";
        }

        beforeEach(function () {

            runs(function () {
                SpecRunnerUtils.createTestWindowAndRun(this, function (w) {
                    testWindow = w;
                    $ = testWindow.$;
                    brackets		= testWindow.brackets;
                    DocumentManager = testWindow.brackets.test.DocumentManager;
                    MainViewManager = testWindow.brackets.test.MainViewManager;
                    CommandManager  = testWindow.brackets.test.CommandManager;
                    EditorManager   = testWindow.brackets.test.EditorManager;
                    Dialogs			= testWindow.brackets.test.Dialogs;
                    Commands        = testWindow.brackets.test.Commands;
                    FileSystem      = testWindow.brackets.test.FileSystem;
                });
            });

            runs(function () {
                SpecRunnerUtils.loadProjectInTestWindow(testPath);
            });

            createUntitled(5);

            runs(function () {
                var fileI = 0;
                spyOn(FileSystem, 'showSaveDialog').andCallFake(function (dialogTitle, initialPath, proposedNewName, callback) {
                    callback(undefined, getFilename(fileI));
                    fileI++;
                });

                var promise = CommandManager.execute(Commands.FILE_SAVE_ALL);
                waitsForDone(promise, "FILE_SAVE_ALL", 5000);
            });
        });

        afterEach(function () {
            // Verify files exist & clean up
            [0, 1, 2, 3, 4].forEach(function (i) {
                expectAndDelete(getFilename(i));
            });

            testWindow    = null;
            $             = null;
            brackets      = null;
            EditorManager = null;
            SpecRunnerUtils.closeTestWindow();
        });


        function runCloseOthers() {
            var ws = MainViewManager.getWorkingSet(MainViewManager.ACTIVE_PANE),
                promise;

            if (ws.length > docSelectIndex) {
                DocumentManager.getDocumentForPath(ws[docSelectIndex].fullPath).done(function (doc) {
                    MainViewManager._edit(MainViewManager.ACTIVE_PANE, doc);
                });

                runs(function () {
                    promise = CommandManager.execute(cmdToRun);
                    waitsForDone(promise, cmdToRun);
                });
                runs(function () {
                    expect(MainViewManager.getCurrentlyViewedPath(MainViewManager.ACTIVE_PANE)).toEqual(ws[docSelectIndex].fullPath, "Path of document in editor after close others command should be the document that was selected");
                });
            }
        }

        it("Close others", function () {
            docSelectIndex = 2;
            cmdToRun       = "file.close_others";

            runCloseOthers();

            runs(function () {
                expect(MainViewManager.getWorkingSet(MainViewManager.ACTIVE_PANE).length).toEqual(1);
            });
        });

        it("Close others above", function () {
            docSelectIndex = 2;
            cmdToRun       = "file.close_above";

            runCloseOthers();

            runs(function () {
                expect(MainViewManager.getWorkingSet(MainViewManager.ACTIVE_PANE).length).toEqual(3);
            });
        });

        it("Close others below", function () {
            docSelectIndex = 1;
            cmdToRun       = "file.close_below";

            runCloseOthers();

            runs(function () {
                expect(MainViewManager.getWorkingSet(MainViewManager.ACTIVE_PANE).length).toEqual(2);
            });
        });
    });
});
