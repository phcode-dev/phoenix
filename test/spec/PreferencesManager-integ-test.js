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

/*global describe, it, expect, beforeEach, beforeAll, afterAll, awaitsFor, awaitsForDone, spyOn */

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
            }, "space units to be "+expectedSpaceUnits, 10000);
            await awaitsForDone(FileViewController.openAndSelectDocument(nonProjectFile,
                FileViewController.WORKING_SET_VIEW));

            await awaitsFor(()=>{
                return PreferencesManager.get("spaceUnits") !== expectedSpaceUnits;
            }, "space non project file units not to be "+expectedSpaceUnits, 10000);

            // Changing projects will force a change in the project scope.
            await SpecRunnerUtils.loadProjectInTestWindow(projectWithoutSettings);
            await awaitsForDone(SpecRunnerUtils.openProjectFiles("file_one.js"));
            await awaitsFor(()=>{
                return PreferencesManager.get("spaceUnits") !== expectedSpaceUnits;
            }, "space units not to be "+expectedSpaceUnits, 10000);
        }

        it("should find .phcode.json preferences in the project", async function () {
            await SpecRunnerUtils.loadProjectInTestWindow(testPath);
            await _verifySinglePreference(".phcode.json", 9);
        });

        it("should find .brackets.json preferences in the project", async function () {
            await SpecRunnerUtils.loadProjectInTestWindow(testPathBracketsPrefsOnly);
            await _verifySinglePreference(".brackets.json", 6);
        }, 100000);

        it("should keep a newer project's preferences when an older project's load finishes last", async function () {
            const FileUtils = testWindow.brackets.test.FileUtils;
            const projectWithoutSettings = SpecRunnerUtils.getTestPath("/spec/WorkingSetView-test-files");
            const realReadAsText = FileUtils.readAsText;
            let releaseStaleReads;
            const staleReadsReleased = new Promise(function (resolve) {
                releaseStaleReads = resolve;
            });
            let heldReads = 0, settledReads = 0;
            // Hold the settings-free project's preference reads until the next
            // project has loaded, so its reload finishes last.
            spyOn(FileUtils, "readAsText").and.callFake(function (file, ...args) {
                const result = realReadAsText.call(FileUtils, file, ...args);
                const name = file.fullPath.split("/").pop();
                if (!file.fullPath.startsWith(projectWithoutSettings + "/") ||
                    (name !== ".phcode.json" && name !== ".brackets.json")) {
                    return result;
                }
                heldReads++;
                const held = new testWindow.$.Deferred();
                staleReadsReleased.then(function () {
                    result.always(function () {
                        settledReads++;
                    }).done(held.resolve).fail(held.reject);
                });
                return held.promise();
            });
            spyOn(PreferencesManager, "_setProjectSettingsFile").and.callThrough();
            try {
                // Start elsewhere, so opening the settings-free project is a real switch.
                await SpecRunnerUtils.loadProjectInTestWindow(testPath);
                await SpecRunnerUtils.loadProjectInTestWindow(projectWithoutSettings);
                await SpecRunnerUtils.loadProjectInTestWindow(testPathBracketsPrefsOnly);
                await awaitsForDone(SpecRunnerUtils.openProjectFiles(".brackets.json"));
                await awaitsFor(()=>{
                    return PreferencesManager.get("spaceUnits") === 6;
                }, "space units to be 6 from the newer project", 10000);
                expect(heldReads).toBeGreaterThan(0);
            } finally {
                releaseStaleReads();
            }
            // Every held read settles, and whatever the older reload does next
            // runs before the next check.
            await awaitsFor(()=>{
                return settledReads === heldReads;
            }, "the older project's reads to finish", 10000);

            const lastSettingsFile = PreferencesManager._setProjectSettingsFile.calls.mostRecent().args[0];
            expect(lastSettingsFile.startsWith(testPathBracketsPrefsOnly + "/")).toBeTrue();
            expect(PreferencesManager.get("spaceUnits")).toBe(6);
        }, 30000);

        it("should .phcode.json take precedence over .brackets.json", async function () {
            await SpecRunnerUtils.loadProjectInTestWindow(testPathBothPrefs);
            await awaitsForDone(SpecRunnerUtils.openProjectFiles(".phcode.json"));
            await awaitsFor(()=>{
                return PreferencesManager.get("spaceUnits") === 1; // from .phcode.json
            }, "space units to be 10 from .phcode.json");
        });

        it("should show a problem when both .phcode.json and .brackets.json are present in project", async function () {
            const CommandManager = testWindow.brackets.test.CommandManager;
            const Commands = testWindow.brackets.test.Commands;

            await SpecRunnerUtils.loadProjectInTestWindow(testPathBothPrefs);
            await awaitsForDone(SpecRunnerUtils.openProjectFiles(".phcode.json"));
            await awaitsFor(()=>{
                return PreferencesManager.get("spaceUnits") === 1; // from .phcode.json
            }, "space units to be 10 from .phcode.json");

            // there will be an error in problems panel if both present
            await awaitsForDone(SpecRunnerUtils.openProjectFiles(".phcode.json"));
            await awaitsFor(()=>{
                return testWindow.$("#status-inspection").hasClass("inspection-errors");
            }, "lint errors detected on .phcode.json");
            if (!testWindow.$("#problems-panel").is(":visible")) {
                CommandManager.execute(Commands.VIEW_TOGGLE_PROBLEMS);
            }
            await awaitsFor(()=>{
                return testWindow.$("#problems-panel").text().includes(Strings.ERROR_PREFS_PROJECT_LINT_MESSAGE);
            }, "problem panel on .phcode.json");

            await awaitsForDone(SpecRunnerUtils.openProjectFiles("test.json"));
            await awaitsFor(()=>{
                return !testWindow.$("#status-inspection").hasClass("inspection-errors");
            }, "no lint errors for normal test.json file");

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
