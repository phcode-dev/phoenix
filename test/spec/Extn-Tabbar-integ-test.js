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
        let testFilePath2, testFilePath3;

        beforeAll(async function () {
            // Create the test window
            testWindow = await SpecRunnerUtils.createTestWindowAndRun();
            // Get reference to all the required modules
            $ = testWindow.$;
            PreferencesManager = testWindow.brackets.test.PreferencesManager;
            FileSystem = testWindow.brackets.test.FileSystem;
            MainViewManager = testWindow.brackets.test.MainViewManager;
            CommandManager = testWindow.brackets.test.CommandManager;
            Commands = testWindow.brackets.test.Commands;

            // Create test files
            testFilePath = SpecRunnerUtils.getTempDirectory() + "/tabbar-test.js";
            testFilePath2 = SpecRunnerUtils.getTempDirectory() + "/tabbar-test2.js";
            testFilePath3 = SpecRunnerUtils.getTempDirectory() + "/tabbar-test3.js";

            await SpecRunnerUtils.createTempDirectory();
            await jsPromise(SpecRunnerUtils.createTextFile(testFilePath, "// Test file 1 for TabBar", FileSystem));
            await jsPromise(SpecRunnerUtils.createTextFile(testFilePath2, "// Test file 2 for TabBar", FileSystem));
            await jsPromise(SpecRunnerUtils.createTextFile(testFilePath3, "// Test file 3 for TabBar", FileSystem));

            // Open the first test file
            await awaitsForDone(
                CommandManager.execute(Commands.FILE_OPEN, { fullPath: testFilePath }),
                "Open test file"
            );
        }, 30000);

        afterAll(async function () {
            // Close all files
            await awaitsForDone(CommandManager.execute(Commands.FILE_CLOSE_ALL), "Close all files");

            testWindow = null;
            await SpecRunnerUtils.closeTestWindow();
            await SpecRunnerUtils.removeTempDirectory();
        }, 30000);

        /**
         * Helper function to check if a tab for a specific file exists in the tab bar
         * @param {string} filePath - The path of the file to check
         * @returns {boolean} - True if the tab exists, false otherwise
         */
        function tabExists(filePath) {
            return $(`.tab[data-path="${filePath}"]`).length > 0;
        }

        /**
         * Helper function to count the number of tabs in the tab bar
         * @returns {number} - The number of tabs
         */
        function getTabCount() {
            return $(".tab").length;
        }

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

        describe("Working Set", function () {
            beforeEach(async function () {
                // Enable the tab bar feature
                PreferencesManager.set("tabBar.options", { showTabBar: true, numberOfTabs: -1 });

                // Close all files to start with a clean state
                await awaitsForDone(CommandManager.execute(Commands.FILE_CLOSE_ALL), "Close all files");

                // Wait for the tab bar to update
                await awaits(300);
            });

            it("should add tabs when files are added to the working set", async function () {
                // Open the first test file
                await awaitsForDone(
                    CommandManager.execute(Commands.FILE_OPEN, { fullPath: testFilePath }),
                    "Open first test file"
                );

                // Wait for the tab bar to update
                await awaitsFor(
                    function () {
                        return tabExists(testFilePath);
                    },
                    "Tab for first file to appear",
                    1000
                );

                // Verify the tab exists
                expect(tabExists(testFilePath)).toBe(true);
                expect(getTabCount()).toBe(1);

                // Open the second test file
                await awaitsForDone(
                    CommandManager.execute(Commands.FILE_OPEN, { fullPath: testFilePath2 }),
                    "Open second test file"
                );

                // Wait for the tab bar to update
                await awaitsFor(
                    function () {
                        return tabExists(testFilePath2);
                    },
                    "Tab for second file to appear",
                    1000
                );

                // Verify both tabs exist
                expect(tabExists(testFilePath)).toBe(true);
                expect(tabExists(testFilePath2)).toBe(true);
                expect(getTabCount()).toBe(2);

                // Open the third test file
                await awaitsForDone(
                    CommandManager.execute(Commands.FILE_OPEN, { fullPath: testFilePath3 }),
                    "Open third test file"
                );

                // Wait for the tab bar to update
                await awaitsFor(
                    function () {
                        return tabExists(testFilePath3);
                    },
                    "Tab for third file to appear",
                    1000
                );

                // Verify all three tabs exist
                expect(tabExists(testFilePath)).toBe(true);
                expect(tabExists(testFilePath2)).toBe(true);
                expect(tabExists(testFilePath3)).toBe(true);
                expect(getTabCount()).toBe(3);
            });

            it("should remove tabs when files are removed from the working set", async function () {
                // Open all three test files like in previous test
                await awaitsForDone(
                    CommandManager.execute(Commands.FILE_OPEN, { fullPath: testFilePath }),
                    "Open first test file"
                );
                await awaitsForDone(
                    CommandManager.execute(Commands.FILE_OPEN, { fullPath: testFilePath2 }),
                    "Open second test file"
                );
                await awaitsForDone(
                    CommandManager.execute(Commands.FILE_OPEN, { fullPath: testFilePath3 }),
                    "Open third test file"
                );

                // Wait for all tabs to appear
                await awaitsFor(
                    function () {
                        return tabExists(testFilePath) && tabExists(testFilePath2) && tabExists(testFilePath3);
                    },
                    "All tabs to appear",
                    1000
                );

                // Verify all three tabs exist
                expect(getTabCount()).toBe(3);

                // Close the second test file
                const fileToClose2 = FileSystem.getFileForPath(testFilePath2);
                await awaitsForDone(
                    CommandManager.execute(Commands.FILE_CLOSE, { file: fileToClose2 }),
                    "Close second test file"
                );

                // Wait for the tab to disappear
                await awaitsFor(
                    function () {
                        return !tabExists(testFilePath2);
                    },
                    "Tab for second file to disappear",
                    1000
                );

                // Verify the second tab is removed
                expect(tabExists(testFilePath)).toBe(true);
                expect(tabExists(testFilePath2)).toBe(false);
                expect(tabExists(testFilePath3)).toBe(true);
                expect(getTabCount()).toBe(2);

                // Close the first test file
                const fileToClose1 = FileSystem.getFileForPath(testFilePath);
                await awaitsForDone(
                    CommandManager.execute(Commands.FILE_CLOSE, { file: fileToClose1 }),
                    "Close first test file"
                );

                // Wait for the tab to disappear
                await awaitsFor(
                    function () {
                        return !tabExists(testFilePath);
                    },
                    "Tab for first file to disappear",
                    1000
                );

                // Verify the first tab is removed
                expect(tabExists(testFilePath)).toBe(false);
                expect(tabExists(testFilePath2)).toBe(false);
                expect(tabExists(testFilePath3)).toBe(true);
                expect(getTabCount()).toBe(1);

                // Close the third test file
                const fileToClose3 = FileSystem.getFileForPath(testFilePath3);
                await awaitsForDone(
                    CommandManager.execute(Commands.FILE_CLOSE, { file: fileToClose3 }),
                    "Close third test file"
                );

                // Wait for the tab to disappear
                await awaitsFor(
                    function () {
                        return !tabExists(testFilePath3);
                    },
                    "Tab for third file to disappear",
                    1000
                );

                // Verify all tabs are removed
                expect(tabExists(testFilePath)).toBe(false);
                expect(tabExists(testFilePath2)).toBe(false);
                expect(tabExists(testFilePath3)).toBe(false);
                expect(getTabCount()).toBe(0);
            });
        });
    });
});
