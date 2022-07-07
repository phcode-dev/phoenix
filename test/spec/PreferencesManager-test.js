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

/*global describe, it, expect, beforeEach, runs, beforeFirst, afterLast, spyOn, waitsForDone */

define(function (require, exports, module) {


    // Load dependent modules
    var SpecRunnerUtils         = require("spec/SpecRunnerUtils"),
        testPath                = SpecRunnerUtils.getTestPath("/spec/PreferencesBase-test-files"),
        nonProjectFile          = SpecRunnerUtils.getTestPath("/spec/PreferencesBase-test.js"),
        PreferencesManager,
        testWindow;

    describe("PreferencesManager", function () {
        this.category = "integration";

        beforeFirst(function () {
            SpecRunnerUtils.createTestWindowAndRun(this, function (w) {
                testWindow = w;

                // Load module instances from brackets.test
                PreferencesManager = testWindow.brackets.test.PreferencesManager;
                SpecRunnerUtils.loadProjectInTestWindow(testPath);
            });
        });

        afterLast(function () {
            PreferencesManager = null;
            SpecRunnerUtils.closeTestWindow();
        });

        it("should find preferences in the project", function () {
            var projectWithoutSettings = SpecRunnerUtils.getTestPath("/spec/WorkingSetView-test-files"),
                FileViewController = testWindow.brackets.test.FileViewController;
            waitsForDone(SpecRunnerUtils.openProjectFiles(".brackets.json"));

            runs(function () {
                expect(PreferencesManager.get("spaceUnits")).toBe(9);
                waitsForDone(FileViewController.openAndSelectDocument(nonProjectFile,
                             FileViewController.WORKING_SET_VIEW));

            });

            runs(function () {
                expect(PreferencesManager.get("spaceUnits")).not.toBe(9);

                // Changing projects will force a change in the project scope.
                SpecRunnerUtils.loadProjectInTestWindow(projectWithoutSettings);
            });
            runs(function () {
                waitsForDone(SpecRunnerUtils.openProjectFiles("file_one.js"));
            });
            runs(function () {
                expect(PreferencesManager.get("spaceUnits")).not.toBe(9);
            });
        });
    });
});
