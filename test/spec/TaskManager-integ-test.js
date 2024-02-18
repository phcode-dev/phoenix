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

/*global describe, it, expect, beforeAll, afterAll, awaitsFor, awaitsForDone */

define(function (require, exports, module) {
    // Recommended to avoid reloading the integration test window Phoenix instance for each test.

    const SpecRunnerUtils     = require("spec/SpecRunnerUtils"),
        Strings             = require("strings");

    const testPath = SpecRunnerUtils.getTestPath("/spec/JSUtils-test-files");

    let FileViewController,     // loaded from brackets.test
        ProjectManager,         // loaded from brackets.test;
        MainViewManager,
        TaskManager,
        StatusBar,
        PreferencesManager,
        CommandManager,
        Commands,
        testWindow,
        brackets;


    describe("integration:TaskManager integration tests", function () {

        beforeAll(async function () {
            // do not use force option in brackets core integration tests. Tests are assumed to reuse the existing
            // test window instance for fast runs.
            testWindow = await SpecRunnerUtils.createTestWindowAndRun();
            brackets            = testWindow.brackets;
            FileViewController  = brackets.test.FileViewController;
            ProjectManager      = brackets.test.ProjectManager;
            MainViewManager     = brackets.test.MainViewManager;
            CommandManager      = brackets.test.CommandManager;
            Commands            = brackets.test.Commands;
            TaskManager         = brackets.test.TaskManager;
            StatusBar           = brackets.test.StatusBar;
            PreferencesManager  = brackets.test.PreferencesManager;

            await SpecRunnerUtils.loadProjectInTestWindow(testPath);
        }, 30000);

        afterAll(async function () {
            FileViewController  = null;
            ProjectManager      = null;
            testWindow = null;
            brackets = null;
            TaskManager = null;
            StatusBar = null;
            PreferencesManager = null;
            // comment out below line if you want to debug the test window post running tests
            await SpecRunnerUtils.closeTestWindow();
        }, 30000);

        function createAndTestSingleTask() {
            const task = TaskManager.addNewTask("title", "message");
            expect(testWindow.$("#status-tasks").is(":visible")).toBeTrue();
            task.close();
            expect(testWindow.$("#status-tasks").is(":visible")).toBeFalse();
        }

        it("Should task manager show in status bar for open file in project", async function () {
            await awaitsForDone(
                FileViewController.openAndSelectDocument(
                    testPath + "/simple.js",
                    FileViewController.PROJECT_MANAGER
                ));
            createAndTestSingleTask();
        });

        it("Should task manager show in status bar if no file in project", async function () {
            await awaitsForDone(CommandManager.execute(Commands.FILE_CLOSE_ALL, { _forceClose: true }),
                "closing all file");
            createAndTestSingleTask();
        });

        it("Should task manager show if legacy statusbar.showBusyIndicator", async function () {
            expect(testWindow.$("#status-tasks").is(":visible")).toBeFalse();
            StatusBar.showBusyIndicator();
            expect(testWindow.$("#status-tasks .btn-status-bar").is(":visible")).toBeTrue();
            testWindow.$("#status-tasks .btn-status-bar").click();
            expect(testWindow.$(".dropdown-status-bar").text()
                .includes(Strings.STATUSBAR_TASKS_UNKNOWN_EXTENSION_TASK)).toBeTrue();
            StatusBar.hideBusyIndicator();
            expect(testWindow.$("#status-tasks").is(":visible")).toBeFalse();
        });

        it("Should show popup on clicking statusbar", async function () {
            const task = TaskManager.addNewTask("title", "message");
            testWindow.$("#status-tasks .btn-status-bar").click();
            expect(testWindow.$(".dropdown-status-bar").is(":visible")).toBeTrue();
            expect(testWindow.$(".dropdown-status-bar").text().includes("title")).toBeTrue();
            expect(testWindow.$(".dropdown-status-bar").text().includes("message")).toBeTrue();
            task.close();
            expect(testWindow.$(".dropdown-status-bar").is(":visible")).toBeFalse();
        });

        it("Should show/hide spinner icon", async function () {
            PreferencesManager.setViewState("StatusBar.HideSpinner", false);
            const task = TaskManager.addNewTask("title", "message");
            // click on task icon to open the popup
            testWindow.$("#status-tasks .btn-status-bar").click();
            expect(testWindow.$(".dropdown-status-bar").is(":visible")).toBeTrue();
            expect(testWindow.$("#status-tasks .spinner").is(":visible")).toBeTrue();
            // click on the hide spinner option which is at 2nd position with this setup
            testWindow.$('a[data-index="2"]').click();
            expect(testWindow.$("#status-tasks .spinner").is(":visible")).toBeFalse();

            // click on task icon to open the popup
            testWindow.$("#status-tasks .btn-status-bar").click();
            expect(testWindow.$(".dropdown-status-bar").is(":visible")).toBeTrue();
            testWindow.$('a[data-index="2"]').click();
            expect(testWindow.$("#status-tasks .spinner").is(":visible")).toBeTrue();

            task.close();
        });

    });
});
