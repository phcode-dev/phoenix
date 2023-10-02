/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 * Original work Copyright (c) 2014 - 2021 Adobe Systems Incorporated. All rights reserved.
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

/*global describe, it, expect, awaitsFor, beforeAll, afterAll */

define(function (require, exports, module) {


    var CommandManager,         // Load from brackets.test
        Commands,               // Load from brackets.test
        DocumentManager,        // Load from brackets.test
        FileViewController,     // Load from brackets.test
        MainViewManager,        // Load from brackets.test
        SpecRunnerUtils         = require("spec/SpecRunnerUtils");


    describe("mainview:WorkingSetSort", function () {

        var testPath = SpecRunnerUtils.getTestPath("/spec/WorkingSetView-test-files"),
            testWindow,
            workingSetListItemCount = 0;

        async function openAndMakeDirty(path) {
            var doc, didOpen = false, gotError = false;

            // open file
            FileViewController.openAndSelectDocument(path, FileViewController.PROJECT_MANAGER)
                .done(function () { didOpen = true; })
                .fail(function () { gotError = true; });
            await awaitsFor(function () { return didOpen && !gotError; }, "FILE_OPEN on file timeout", 1000);

            // change editor content to make doc dirty which adds it to the working set
            doc = DocumentManager.getCurrentDocument();
            doc.setText("dirty document");
        }

        async function createTestWindow(spec, loadProject) {
            testWindow = await SpecRunnerUtils.createTestWindowAndRun();
            // Load module instances from brackets.test
            CommandManager      = testWindow.brackets.test.CommandManager;
            Commands            = testWindow.brackets.test.Commands;
            DocumentManager     = testWindow.brackets.test.DocumentManager;
            FileViewController  = testWindow.brackets.test.FileViewController;
            MainViewManager     = testWindow.brackets.test.MainViewManager;

            // Open a directory
            if (loadProject) {
                await SpecRunnerUtils.loadProjectInTestWindow(testPath);
            }

            // Initialize: register listeners
            MainViewManager.on("workingSetAdd", function (event, addedFile) {
                workingSetListItemCount++;
            });
        }

        async function closeTestWindow() {
            testWindow          = null;
            CommandManager      = null;
            Commands            = null;
            DocumentManager     = null;
            FileViewController  = null;
            MainViewManager     = null;
            await SpecRunnerUtils.closeTestWindow();
        }

        beforeAll(async function () {
            await createTestWindow(this, true);

            workingSetListItemCount = 0;

            await openAndMakeDirty(testPath + "/file_four.html");
            await openAndMakeDirty(testPath + "/file_zero.css");
            await openAndMakeDirty(testPath + "/file_two.js");

            // Wait for both files to be added to the working set
            await awaitsFor(function () { return workingSetListItemCount === 3; }, "workingSetListItemCount to equal 3", 1000);
        }, 30000);

        afterAll(async function () {
            testWindow.closeAllFiles();
            await closeTestWindow();
        }, 30000);

        it("should sort list by name", function () {
            // sort list by name
            CommandManager.execute(Commands.CMD_WORKINGSET_SORT_BY_NAME);

            // confirm files sorted correctly
            var $listItems = testWindow.$(".open-files-container > ul").children();
            expect($listItems.length).toBe(workingSetListItemCount);
            expect($listItems.find("a").get(0).text === "file_four.html").toBeTruthy();
            expect($listItems.find("a").get(1).text === "file_two.js").toBeTruthy();
            expect($listItems.find("a").get(2).text === "file_zero.css").toBeTruthy();
            expect($listItems.find(".file-status-icon").length).toBe(workingSetListItemCount);
        });

        it("should sort list as added", function () {
            // sort list as added
            CommandManager.execute(Commands.CMD_WORKINGSET_SORT_BY_ADDED);

            // confirm files sorted correctly
            var $listItems = testWindow.$(".open-files-container > ul").children();
            expect($listItems.length).toBe(workingSetListItemCount);
            expect($listItems.find("a").get(0).text === "file_two.js").toBeTruthy();
            expect($listItems.find("a").get(1).text === "file_zero.css").toBeTruthy();
            expect($listItems.find("a").get(2).text === "file_four.html").toBeTruthy();
            expect($listItems.find(".file-status-icon").length).toBe(workingSetListItemCount);
        });

        it("should sort list by type", function () {
            // sort list by type
            CommandManager.execute(Commands.CMD_WORKINGSET_SORT_BY_TYPE);

            // confirm files sorted correctly
            var $listItems = testWindow.$(".open-files-container > ul").children();
            expect($listItems.length).toBe(workingSetListItemCount);
            expect($listItems.find("a").get(0).text === "file_zero.css").toBeTruthy();
            expect($listItems.find("a").get(1).text === "file_four.html").toBeTruthy();
            expect($listItems.find("a").get(2).text === "file_two.js").toBeTruthy();
            expect($listItems.find(".file-status-icon").length).toBe(workingSetListItemCount);
        });

        it("should sort list by type automatically", async function () {
            // toggle the auto sort on
            CommandManager.execute(Commands.CMD_WORKING_SORT_TOGGLE_AUTO);

            // open another file, which should be added and auto-sorted into the list
            await openAndMakeDirty(testPath + "/file_one.js");

            await awaitsFor(function () { return workingSetListItemCount === 4; }, "workingSetListItemCount to equal 4", 5000);

            // confirm files sorted correctly
            var $listItems = testWindow.$(".open-files-container > ul").children();
            expect($listItems.length).toBe(workingSetListItemCount);
            expect($listItems.find("a").get(0).text === "file_zero.css").toBeTruthy();
            expect($listItems.find("a").get(1).text === "file_four.html").toBeTruthy();
            expect($listItems.find("a").get(2).text === "file_one.js").toBeTruthy();
            expect($listItems.find("a").get(3).text === "file_two.js").toBeTruthy();
            expect($listItems.find(".file-status-icon").length).toBe(workingSetListItemCount);
        });

        it("should not sort list by type automatically", async function () {
            // toggle the auto sort off
            CommandManager.execute(Commands.CMD_WORKING_SORT_TOGGLE_AUTO);

            // open another file, which should not be added and auto-sorted into the list
            await openAndMakeDirty(testPath + "/file_three.js");

            await awaitsFor(function () { return workingSetListItemCount === 5; }, "workingSetListItemCount to equal 5", 5000);

            // confirm files sorted correctly
            var $listItems = testWindow.$(".open-files-container > ul").children();
            expect($listItems.length).toBe(workingSetListItemCount);
            expect($listItems.find("a").get(0).text === "file_zero.css").toBeTruthy();
            expect($listItems.find("a").get(1).text === "file_four.html").toBeTruthy();
            expect($listItems.find("a").get(2).text === "file_one.js").toBeTruthy();
            expect($listItems.find("a").get(3).text === "file_two.js").toBeTruthy();
            expect($listItems.find("a").get(4).text === "file_three.js").toBeTruthy();
            expect($listItems.find(".file-status-icon").length).toBe(workingSetListItemCount);
        });

    });
});
