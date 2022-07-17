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

/*global describe, it, expect, beforeEach, beforeAll, afterAll, spyOn, awaitsForDone */

define(function (require, exports, module) {


    // Load dependent modules
    var SpecRunnerUtils         = require("spec/SpecRunnerUtils"),
        testPath                = SpecRunnerUtils.getTestPath("/spec/PreferencesBase-test-files"),
        nonProjectFile          = SpecRunnerUtils.getTestPath("/spec/PreferencesBase-test.js"),
        PreferencesManager,
        testWindow;

    describe("integration:PreferencesManager", function () {

        beforeAll(async function () {
            testWindow = await SpecRunnerUtils.createTestWindowAndRun();
            // Load module instances from brackets.test
            PreferencesManager = testWindow.brackets.test.PreferencesManager;
            await SpecRunnerUtils.loadProjectInTestWindow(testPath);
        });

        afterAll(async function () {
            PreferencesManager = null;
            await SpecRunnerUtils.closeTestWindow();
        });

        it("should find preferences in the project", async function () {
            var projectWithoutSettings = SpecRunnerUtils.getTestPath("/spec/WorkingSetView-test-files"),
                FileViewController = testWindow.brackets.test.FileViewController;
            await awaitsForDone(SpecRunnerUtils.openProjectFiles(".brackets.json"));

            expect(PreferencesManager.get("spaceUnits")).toBe(9);
            await awaitsForDone(FileViewController.openAndSelectDocument(nonProjectFile,
                FileViewController.WORKING_SET_VIEW));

            expect(PreferencesManager.get("spaceUnits")).not.toBe(9);

            // Changing projects will force a change in the project scope.
            await SpecRunnerUtils.loadProjectInTestWindow(projectWithoutSettings);
            await awaitsForDone(SpecRunnerUtils.openProjectFiles("file_one.js"));
            expect(PreferencesManager.get("spaceUnits")).not.toBe(9);
        });
    });
});
