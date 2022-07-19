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

/*global describe, it, expect, beforeEach, afterEach, awaitsFor, awaitsForDone, beforeAll, afterAll, awaits */

define(function (require, exports, module) {


    var CommandManager,         // Load from brackets.test
        Commands,               // Load from brackets.test
        DocumentManager,        // Load from brackets.test
        FileViewController,     // Load from brackets.test
        MainViewManager,        // Load from brackets.test
        ProjectManager,         // Load from brackets.test
        WorkingSetView,
        SpecRunnerUtils         = require("spec/SpecRunnerUtils");


    describe("mainview:WorkingSetView", function () {

        var testPath = SpecRunnerUtils.getTestPath("/spec/WorkingSetView-test-files"),
            testWindow,
            workingSetListItemCount;

        async function openAndMakeDirty(path) {
            var doc, didOpen = false, gotError = false;

            // open file
            FileViewController.openAndSelectDocument(path, FileViewController.PROJECT_MANAGER)
                .done(function () { didOpen = true; })
                .fail(function () { gotError = true; });
            await awaitsFor(function () { return didOpen && !gotError; },
                "FILE_OPEN on file timeout", 1000);

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
            WorkingSetView      = testWindow.brackets.test.WorkingSetView;
            ProjectManager      = testWindow.brackets.test.ProjectManager;

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
        });

        afterAll(async function () {
            await closeTestWindow();
        });

        beforeEach(async function () {
            workingSetListItemCount = 0;

            await openAndMakeDirty(testPath + "/file_one.js");
            await openAndMakeDirty(testPath + "/file_two.js");

            // Wait for both files to be added to the working set
            await awaitsFor(function () { return workingSetListItemCount === 2; }, "workingSetListItemCount to equal 2", 1000);
        });

        afterEach(async function () {
            await testWindow.closeAllFiles();
        });

        it("should add a list item when a file is dirtied", function () {
            // check if files are added to work set and dirty icons are present
            var $listItems = testWindow.$(".open-files-container > ul").children();
            expect($listItems.length).toBe(2);
            expect($listItems.find("a").get(0).text === "file_one.js").toBeTruthy();
            expect($listItems.find(".file-status-icon").length).toBe(2);
        });

        it("should remove a list item when a file is closed", async function () {
            DocumentManager.getCurrentDocument()._markClean(); // so we can close without a save dialog

            // close the document
            var didClose = false, gotError = false;
            CommandManager.execute(Commands.FILE_CLOSE)
                .done(function () { didClose = true; })
                .fail(function () { gotError = true; });
            await awaitsFor(function () { return didClose && !gotError; }, "FILE_OPEN on file timeout", 1000);

            // check there are no list items
            var listItems = testWindow.$(".open-files-container > ul").children();
            expect(listItems.length).toBe(1);
        });

        it("should make a file that is clicked the current one in the editor", function () {
            var $ = testWindow.$;
            var secondItem =  $($(".open-files-container > ul").children()[1]);
            secondItem.trigger("click");

            var $listItems = $(".open-files-container > ul").children();
            expect($($listItems[0]).hasClass("selected")).not.toBeTruthy();
            expect($($listItems[1]).hasClass("selected")).toBeTruthy();
        });

        it("should close a file when the user clicks the close button", async function () {
            var $ = testWindow.$;
            var didClose = false;

            // make 2nd doc clean
            var fileList = MainViewManager.getWorkingSet(MainViewManager.ACTIVE_PANE);

            var doc0 = DocumentManager.getOpenDocumentForPath(fileList[0].fullPath);
            var doc1 = DocumentManager.getOpenDocumentForPath(fileList[1].fullPath);
            doc1._markClean();

            // make the first one active
            MainViewManager._edit(MainViewManager.ACTIVE_PANE, doc0);

            // hover over and click on close icon of 2nd list item
            var secondItem =  $($(".open-files-container > ul").children()[1]);
            secondItem.trigger("mouseover");
            var closeIcon = secondItem.find(".file-status-icon");
            expect(closeIcon.length).toBe(1);

            // simulate click
            MainViewManager.on("workingSetRemove", function (event, removedFile) {
                didClose = true;
            });

            closeIcon.trigger("mousedown");

            await awaitsFor(function () { return didClose; }, "click on working set close icon timeout", 1000);

            var $listItems = $(".open-files-container > ul").children();
            expect($listItems.length).toBe(1);
            expect($listItems.find("a").get(0).text === "file_one.js").toBeTruthy();
        });

        it("should remove dirty icon when file becomes clean", async function () {
            // check that dirty icon is removed when docs are cleaned
            var fileList = MainViewManager.getWorkingSet(MainViewManager.ACTIVE_PANE);
            var doc0 = DocumentManager.getOpenDocumentForPath(fileList[0].fullPath);
            doc0._markClean();

            var listItems = testWindow.$(".open-files-container > ul").children();
            expect(listItems.find(".file-status-icon dirty").length).toBe(0);
        });

        it("should show the file in project tree when a file is being renamed", async function () {
            var $ = testWindow.$;
            var secondItem =  $(".open-files-container > ul").children().eq(1);
            var fileName = secondItem.text();

            secondItem.trigger("click");

            // Calling FILE_RENAME synchronously works fine here since the item is already visible in project file tree.
            // However, if the selected item is not already visible in the tree, this command will complete asynchronously.
            // In that case, await awaitsFor will be needed before continuing with the rest of the test.
            CommandManager.execute(Commands.FILE_RENAME);

            await awaits(ProjectManager._RENDER_DEBOUNCE_TIME + 50);

            expect($("#project-files-container ul input").val()).toBe(fileName);
        });

        it("should show a directory name next to the file name when two files with same names are opened", async function () {
            // Count currently opened files
            var workingSetListItemCountBeforeTest = workingSetListItemCount;

            // First we need to open another file
            await openAndMakeDirty(testPath + "/directory/file_one.js");

            // Wait for file to be added to the working set
            await awaitsFor(function () { return workingSetListItemCount === workingSetListItemCountBeforeTest + 1; }, 1000);

            // Two files with the same name file_one.js should be now opened
            var $list = testWindow.$(".open-files-container > ul");
            expect($list.find(".directory").length).toBe(2);

            // Now close last opened file to hide the directories again
            DocumentManager.getCurrentDocument()._markClean(); // so we can close without a save dialog
            await awaitsForDone(CommandManager.execute(Commands.FILE_CLOSE), "timeout on FILE_CLOSE", 1000);

            // there should be no more directories shown
            expect($list.find(".directory").length).toBe(0);
        });

        it("should show different directory names, when two files of the same name are opened, located in folders with same name", async function () {
            // Count currently opened files
            var workingSetListItemCountBeforeTest = workingSetListItemCount;

            // Open both files
            await openAndMakeDirty(testPath + "/directory/file_one.js");
            await openAndMakeDirty(testPath + "/directory/directory/file_one.js");

            // Wait for them to load
            await awaitsFor(function () { return workingSetListItemCount === workingSetListItemCountBeforeTest + 2; }, "Open file count to be increased by 2", 1000);

            // Collect all directory names displayed
            var $list = testWindow.$(".open-files-container > ul");
            var names = $list.find(".directory").map(function () {
                return $(this).text();
            }).toArray();

            // All directory names should be unique
            var uniq = 0, map = {};
            names.forEach(function (name) {
                if (!map[name]) {
                    map[name] = true;
                    uniq++;
                }
            });
            expect(uniq).toBe(names.length);
        });

        it("should callback for icons", async function () {
            function iconProvider(file) {
                return "<img src='" + file.name + ".jpg' class='icon' />";
            }

            WorkingSetView.addIconProvider(iconProvider);

            // Collect all icon filenames used
            var $list = testWindow.$(".open-files-container > ul");
            var icons = $list.find(".icon").map(function () {
                return $(this).attr("src");
            }).toArray();

            // All directory names should be unique
            expect(icons.length).toBe(2);
            expect(icons[0]).toBe("file_one.js.jpg");
            expect(icons[1]).toBe("file_two.js.jpg");
        });

        it("should callback for class", async function () {
            var master = ["one", "two"],
                classes = master.slice(0);

            function classProvider(file) {
                return classes.pop();
            }

            WorkingSetView.addClassProvider(classProvider);

            var $list = testWindow.$(".open-files-container > li"),
                test = master.slice(0);

            $list.each(function (number, el) {
                expect($(el).hasClass(test.pop())).toBeTruthy();
            });
        });

        it("should allow refresh to be used to update the class list", async function () {
            function classProvider(file) {
                return "one";
            }

            WorkingSetView.addClassProvider(classProvider);

            var master = ["three", "four"];

            WorkingSetView.refresh();

            var $list = testWindow.$(".open-files-container > li"),
                test = master.slice(0);

            $list.each(function (number, el) {
                expect($(el).hasClass(test.pop())).toBeTruthy();
                expect($(el).hasClass("one")).toBeFalsy();
            });
        });
    });
});
