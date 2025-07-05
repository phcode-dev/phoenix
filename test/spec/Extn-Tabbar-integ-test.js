/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
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

/*global describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, awaitsFor, awaitsForDone, awaits, jsPromise */

define(function (require, exports, module) {
    const SpecRunnerUtils = require("spec/SpecRunnerUtils");

    describe("integration:TabBar", function () {
        let testWindow, PreferencesManager, $, FileSystem, MainViewManager, CommandManager, Commands, testFilePath;

        beforeAll(async function () {
            // Create the test window
            testWindow = await SpecRunnerUtils.createTestWindowAndRun();
            // Get reference to useful modules
            $ = testWindow.$;
            PreferencesManager = testWindow.brackets.test.PreferencesManager;
            FileSystem = testWindow.brackets.test.FileSystem;
            MainViewManager = testWindow.brackets.test.MainViewManager;
            CommandManager = testWindow.brackets.test.CommandManager;
            Commands = testWindow.brackets.test.Commands;

            // Create a test file
            testFilePath = SpecRunnerUtils.getTempDirectory() + "/tabbar-test.js";
            await SpecRunnerUtils.createTempDirectory();
            await jsPromise(SpecRunnerUtils.createTextFile(testFilePath, "// Test file for TabBar", FileSystem));

            // Open the test file
            await awaitsForDone(
                CommandManager.execute(Commands.FILE_OPEN, { fullPath: testFilePath }),
                "Open test file"
            );
        }, 30000);

        afterAll(async function () {
            // Close the test file
            await awaitsForDone(CommandManager.execute(Commands.FILE_CLOSE_ALL), "Close all files");

            testWindow = null;
            await SpecRunnerUtils.closeTestWindow();
            await SpecRunnerUtils.removeTempDirectory();
        }, 30000);

        describe("Visibility", function () {
            it("should show tab bar when the feature is enabled", async function () {
                // Enable the tab bar feature
                PreferencesManager.set("tabBar.options", { showTabBar: true, numberOfTabs: -1 });

                // Wait for the tab bar to become visible
                await awaitsFor(
                    function () {
                        return $("#phoenix-tab-bar").is(":visible");
                    },
                    "Tab bar to become visible",
                    1000
                );

                // Verify the tab bar is visible
                expect($("#phoenix-tab-bar").is(":visible")).toBe(true);
            });

            it("should hide tab bar when the feature is disabled", async function () {
                // Disable the tab bar feature
                PreferencesManager.set("tabBar.options", { showTabBar: false, numberOfTabs: -1 });

                // Wait for the tab bar to become hidden
                await awaitsFor(
                    function () {
                        return !$("#phoenix-tab-bar").is(":visible");
                    },
                    "Tab bar to become hidden",
                    1000
                );

                // Verify the tab bar is not visible
                expect($("#phoenix-tab-bar").is(":visible")).toBe(false);
            });
        });
    });
});
