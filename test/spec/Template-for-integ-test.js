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

    const SpecRunnerUtils     = require("spec/SpecRunnerUtils");

    const testPath = SpecRunnerUtils.getTestPath("/spec/JSUtils-test-files");

    let FileViewController,     // loaded from brackets.test
        ProjectManager,         // loaded from brackets.test;
        MainViewManager,
        CommandManager,
        Commands,
        testWindow,
        brackets;


    describe("integration:Template for integration tests", function () {

        beforeAll(async function () {
            testWindow = await SpecRunnerUtils.createTestWindowAndRun();
            brackets            = testWindow.brackets;
            FileViewController  = brackets.test.FileViewController;
            ProjectManager      = brackets.test.ProjectManager;
            MainViewManager     = brackets.test.MainViewManager;
            CommandManager      = brackets.test.CommandManager;
            Commands            = brackets.test.Commands;

            await SpecRunnerUtils.loadProjectInTestWindow(testPath);
        }, 30000);

        afterAll(function () {
            FileViewController  = null;
            ProjectManager      = null;
            testWindow = null;
            brackets = null;
            // comment out below line if you want to debug the test window post running tests
            SpecRunnerUtils.closeTestWindow();
        });

        it("Should open file in project", async function () { // #2813
            await awaitsForDone(
                FileViewController.openAndSelectDocument(
                    testPath + "/simple.js",
                    FileViewController.PROJECT_MANAGER
                ));
            const selected = ProjectManager.getSelectedItem();
            expect(selected.fullPath).toBe(testPath + "/simple.js");
            await awaitsForDone(CommandManager.execute(Commands.FILE_CLOSE_ALL, { _forceClose: true }),
                "closing all file");
        });

        it("Should open file in project and add to working set", async function () { // #2813
            await awaitsForDone(FileViewController.openFileAndAddToWorkingSet(testPath + "/edit.js"));
            const selected = MainViewManager.findInAllWorkingSets(testPath + "/edit.js");
            expect(selected.length >= 1 ).toBe(true);
        });

    });
});
