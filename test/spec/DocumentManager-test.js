/*
 * GNU AGPL-3.0 License
 *
 * Modified Work Copyright (c) 2021 - present core.ai . All rights reserved.
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

/*global describe, beforeEach, afterEach, it, runs, expect, waitsForDone, beforeFirst, afterLast */

define(function (require, exports, module) {


    // Load dependent modules
    var CommandManager,          // loaded from brackets.test
        Commands,                // loaded from brackets.test
        DocumentManager,         // loaded from brackets.test
        EditorManager,           // loaded from brackets.test
        SpecRunnerUtils          = require("spec/SpecRunnerUtils");


    describe("DocumentManager", function () {
        this.category = "integration";

        var testPath = SpecRunnerUtils.getTestPath("/spec/DocumentCommandHandlers-test-files"),
            testFile = testPath + "/test.js",
            testWindow,
            _$,
            promise;


        beforeFirst(function () {
            SpecRunnerUtils.createTestWindowAndRun(this, function (w) {
                testWindow = w;
                _$ = testWindow.$;

                // Load module instances from brackets.test
                CommandManager          = testWindow.brackets.test.CommandManager;
                Commands                = testWindow.brackets.test.Commands;
                DocumentManager         = testWindow.brackets.test.DocumentManager;
                EditorManager           = testWindow.brackets.test.EditorManager;
            });
        });

        afterLast(function () {
            testWindow              = null;
            CommandManager          = null;
            Commands                = null;
            DocumentManager         = null;
            EditorManager           = null;
            SpecRunnerUtils.closeTestWindow();
        });


        beforeEach(function () {
            // Working set behavior is sensitive to whether file lives in the project or outside it, so make
            // the project root a known quantity.
            SpecRunnerUtils.loadProjectInTestWindow(testPath);
        });

        afterEach(function () {
            promise = null;

            runs(function () {
                // Call closeAll() directly. Some tests set a spy on the save as
                // dialog preventing SpecRunnerUtils.closeAllFiles() from
                // working properly.
                testWindow.brackets.test.MainViewManager._closeAll(testWindow.brackets.test.MainViewManager.ALL_PANES);
            });
        });
        describe("openDocument ", function () {
            it("Should report document in open documents list", function () {

                runs(function () {
                    promise = CommandManager.execute(Commands.FILE_OPEN, { fullPath: testFile });
                    waitsForDone(promise, Commands.FILE_OPEN);
                });

                runs(function () {
                    expect(DocumentManager.getOpenDocumentForPath(testFile)).toBeTruthy();
                    expect(DocumentManager.getAllOpenDocuments().length).toEqual(1);
                    expect(DocumentManager.getCurrentDocument().file.fullPath).toEqual(testFile);
                });

                runs(function () {
                    promise = DocumentManager.getDocumentText({ fullPath: testFile });
                    waitsForDone(promise, "DocumentManager.getDocumentText");
                });

                runs(function () {
                    promise = CommandManager.execute(Commands.FILE_CLOSE_ALL);
                    waitsForDone(promise, Commands.FILE_CLOSE_ALL);
                });

                runs(function () {
                    expect(DocumentManager.getAllOpenDocuments().length).toEqual(0);
                    expect(DocumentManager.getCurrentDocument()).toBeFalsy();
                });
            });

            it("Should create a new untitled document", function () {
                runs(function () {
                    var doc = DocumentManager.createUntitledDocument(1, ".txt");
                    expect(doc).toBeTruthy();
                });
            });
        });

    });
});
