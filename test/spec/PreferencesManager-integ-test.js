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

/*global describe, it, expect, beforeEach, beforeAll, afterAll, awaitsFor, awaitsForDone */

define(function (require, exports, module) {


    // Load dependent modules
    const SpecRunnerUtils         = require("spec/SpecRunnerUtils"),
        Strings         = require("strings"),
        testPath                = SpecRunnerUtils.getTestPath("/spec/PreferencesBase-test-files"),
        testPathBothPrefs       = SpecRunnerUtils.getTestPath("/spec/PreferencesBase-test-files/both-prefs"),
        testPathBothPrefsPhCorrupt       = SpecRunnerUtils.getTestPath("/spec/PreferencesBase-test-files/both-prefs-phoenix-corrupt"),
        testPathBracketsPrefsOnly       = SpecRunnerUtils.getTestPath("/spec/PreferencesBase-test-files/brackets-prefs-only"),
        testPathBracketsPrefsOnlyCorrupt       = SpecRunnerUtils.getTestPath("/spec/PreferencesBase-test-files/brackets-prefs-only-corrupt"),
        nonProjectFile          = SpecRunnerUtils.getTestPath("/spec/PreferencesBase-test.js");

    let    PreferencesManager,
        testWindow,
    EditorManager;

    describe("integration:PreferencesManager", function () {

        beforeAll(async function () {
            testWindow = await SpecRunnerUtils.createTestWindowAndRun();
            // Load module instances from brackets.test
            PreferencesManager = testWindow.brackets.test.PreferencesManager;
            EditorManager = testWindow.brackets.test.EditorManager;
        }, 30000);

        afterAll(async function () {
            PreferencesManager = null;
            await SpecRunnerUtils.closeTestWindow();
        }, 30000);

        async function _verifySinglePreference(fileName, expectedSpaceUnits) {
            const projectWithoutSettings = SpecRunnerUtils.getTestPath("/spec/WorkingSetView-test-files"),
                FileViewController = testWindow.brackets.test.FileViewController;
            await awaitsForDone(SpecRunnerUtils.openProjectFiles(fileName));
            await awaitsFor(()=>{
                return PreferencesManager.get("spaceUnits") === expectedSpaceUnits;
            }, "space units to be "+expectedSpaceUnits);
            await awaitsForDone(FileViewController.openAndSelectDocument(nonProjectFile,
                FileViewController.WORKING_SET_VIEW));

            await awaitsFor(()=>{
                return PreferencesManager.get("spaceUnits") !== expectedSpaceUnits;
            }, "space non project file units not to be "+expectedSpaceUnits);

            // Changing projects will force a change in the project scope.
            await SpecRunnerUtils.loadProjectInTestWindow(projectWithoutSettings);
            await awaitsForDone(SpecRunnerUtils.openProjectFiles("file_one.js"));
            await awaitsFor(()=>{
                return PreferencesManager.get("spaceUnits") !== expectedSpaceUnits;
            }, "space units not to be "+expectedSpaceUnits);
        }

        it("should find .phcode.json preferences in the project", async function () {
            await SpecRunnerUtils.loadProjectInTestWindow(testPath);
            await _verifySinglePreference(".phcode.json", 9);
        });

        it("should find .brackets.json preferences in the project", async function () {
            await SpecRunnerUtils.loadProjectInTestWindow(testPathBracketsPrefsOnly);
            await _verifySinglePreference(".brackets.json", 6);
        }, 100000);

        it("should .phcode.json take precedence over .brackets.json", async function () {
            await SpecRunnerUtils.loadProjectInTestWindow(testPathBothPrefs);
            await awaitsForDone(SpecRunnerUtils.openProjectFiles(".phcode.json"));
            await awaitsFor(()=>{
                return PreferencesManager.get("spaceUnits") === 1; // from .phcode.json
            }, "space units to be 10 from .phcode.json");
        });

        it("should show a problem when both .phcode.json and .brackets.json are present in project", async function () {
            await SpecRunnerUtils.loadProjectInTestWindow(testPathBothPrefs);
            await awaitsForDone(SpecRunnerUtils.openProjectFiles(".phcode.json"));
            await awaitsFor(()=>{
                return PreferencesManager.get("spaceUnits") === 1; // from .phcode.json
            }, "space units to be 10 from .phcode.json");

            // there will be an error in problems panel if both present
            await awaitsForDone(SpecRunnerUtils.openProjectFiles(".phcode.json"));
            await awaitsFor(()=>{
                return testWindow.$("#problems-panel").text().includes(Strings.ERROR_PREFS_PROJECT_LINT_MESSAGE);
            }, "problem panel on .phcode.json");

            await awaitsForDone(SpecRunnerUtils.openProjectFiles("test.json"));
            await awaitsFor(()=>{
                return !testWindow.$("#problems-panel").text().includes(Strings.ERROR_PREFS_PROJECT_LINT_MESSAGE);
            }, "problem panel should not be there for normal test.json file");

            await awaitsForDone(SpecRunnerUtils.openProjectFiles(".brackets.json"));
            await awaitsFor(()=>{
                return testWindow.$("#problems-panel").text().includes(Strings.ERROR_PREFS_PROJECT_LINT_MESSAGE);
            }, "problem panel on .brackets.json");
        });

        it("should open .brackets.json file if it has json errors", async function () {
            await SpecRunnerUtils.loadProjectInTestWindow(testPathBracketsPrefsOnlyCorrupt);
            await SpecRunnerUtils.waitForModalDialog(3000);
            await SpecRunnerUtils.clickDialogButton();
            await awaitsFor(function () {
                const activeEditor = EditorManager.getActiveEditor();
                return activeEditor && activeEditor.document.file.fullPath.endsWith(".brackets.json");
            }, "corrupt .brackets.json to open", 3000);
        });

        it("should open .phcode.json file if it has json errors", async function () {
            await SpecRunnerUtils.loadProjectInTestWindow(testPathBothPrefsPhCorrupt);
            await SpecRunnerUtils.waitForModalDialog(3000);
            await SpecRunnerUtils.clickDialogButton();
            await awaitsFor(function () {
                const activeEditor = EditorManager.getActiveEditor();
                return activeEditor && activeEditor.document.file.fullPath.endsWith(".phcode.json");
            }, "corrupt .phcode.json to open", 3000);
        });
    });
});
