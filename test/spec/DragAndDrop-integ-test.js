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

/*global describe, beforeEach, afterEach, it, expect, awaitsForDone, beforeAll, afterAll */

define(function (require, exports, module) {


    // Load dependent modules
    var DocumentManager,      // loaded from brackets.test
        DragAndDrop,          // loaded from brackets.test
        EditorManager,        // loaded from brackets.test
        MainViewManager,      // loaded from brackets.test
        SpecRunnerUtils  = require("spec/SpecRunnerUtils");


    describe("LegacyInteg:DragAndDrop", function () {

        var testPath = SpecRunnerUtils.getTestPath("/spec/DocumentCommandHandlers-test-files"),
            testWindow,
            _$,
            promise;

        beforeAll(async function () {
            testWindow = await SpecRunnerUtils.createTestWindowAndRun({forceReload: true});
            _$ = testWindow.$;

            // Load module instances from brackets.test
            DocumentManager = testWindow.brackets.test.DocumentManager;
            DragAndDrop     = testWindow.brackets.test.DragAndDrop;
            EditorManager   = testWindow.brackets.test.EditorManager;
            MainViewManager = testWindow.brackets.test.MainViewManager;
        }, 30000);

        afterAll(async function () {
            testWindow      = null;
            DocumentManager = null;
            DragAndDrop     = null;
            EditorManager   = null;
            MainViewManager = null;
            await SpecRunnerUtils.closeTestWindow();
        }, 30000);


        beforeEach(async function () {
            // Working set behavior is sensitive to whether file lives in the project or outside it, so make
            // the project root a known quantity.
            await SpecRunnerUtils.loadProjectInTestWindow(testPath);
        });

        afterEach(function () {
            promise = null;

            // Call closeAll() directly. Some tests set a spy on the save as
            // dialog preventing SpecRunnerUtils.closeAllFiles() from
            // working properly.
            testWindow.brackets.test.MainViewManager._closeAll(testWindow.brackets.test.MainViewManager.ALL_PANES);
        });

        describe("Testing openDroppedFiles function", function () {
            it("should activate a pane on drag over", function () {
                MainViewManager.setLayoutScheme(1, 2);
                var $paneEl = _$("#second-pane");
                $paneEl.triggerHandler("dragover");
                expect(MainViewManager.getActivePaneId()).toBe("second-pane");
            });

            it("should NOT open any image file when a text file is in the dropped file list", async function () {
                var jsFilePath = testPath + "/test.js";
                var files = [testPath + "/couz.png", testPath + "/couz2.png", jsFilePath];
                promise = DragAndDrop.openDroppedFiles(files);
                await awaitsForDone(promise, "opening dropped files");

                var editor = EditorManager.getActiveEditor();
                expect(editor.document.file.fullPath).toBe(jsFilePath);
                expect(MainViewManager.getCurrentlyViewedPath(MainViewManager.ACTIVE_PANE)).toEqual(jsFilePath);
            });

            it("should show the image when a single image file is dropped", async function () {
                var path = testPath + "/couz.png";
                promise = DragAndDrop.openDroppedFiles([path]);
                await awaitsForDone(promise, "opening a dropped image file");

                var editor = EditorManager.getActiveEditor();
                expect(editor).toBe(null);
                expect(MainViewManager.getCurrentlyViewedPath(MainViewManager.ACTIVE_PANE)).toEqual(path);
            });

            it("should show the last image when multiple image files are dropped", async function () {
                var lastImagePath = testPath + "/couz2.png";
                var files = [testPath + "/couz.png", lastImagePath];
                promise = DragAndDrop.openDroppedFiles(files);
                await awaitsForDone(promise, "opening last image file from the dropped files");

                var editor = EditorManager.getActiveEditor();
                expect(editor).toBe(null);
                expect(MainViewManager.getCurrentlyViewedPath(MainViewManager.ACTIVE_PANE)).toEqual(lastImagePath);
            });

            it("should add images to the working set when they dropped from outside the project", async function () {
                var imagesPath = SpecRunnerUtils.getTestPath("/spec/test-image-files");
                var files = [imagesPath + "/thermo.jpg", imagesPath + "/eye.jpg"];
                promise = DragAndDrop.openDroppedFiles(files);
                await awaitsForDone(promise, "opening last image file from the dropped files");

                expect(MainViewManager.findInWorkingSet(MainViewManager.ALL_PANES, imagesPath + "/thermo.jpg")).not.toEqual(-1);
                expect(MainViewManager.findInWorkingSet(MainViewManager.ALL_PANES, imagesPath + "/eye.jpg")).not.toEqual(-1);
            });
        });
    });
});
