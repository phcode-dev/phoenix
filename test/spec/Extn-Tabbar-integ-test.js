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
        let testWindow, PreferencesManager, $, FileSystem, MainViewManager, CommandManager, Commands, DocumentManager;
        let testFilePath, testFilePath2, testFilePath3, testDuplicateDir1, testDuplicateDir2, testDuplicateName;

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
            DocumentManager = testWindow.brackets.test.DocumentManager;

            // Create test files
            testFilePath = SpecRunnerUtils.getTempDirectory() + "/tabbar-test.js";
            testFilePath2 = SpecRunnerUtils.getTempDirectory() + "/tabbar-test2.js";
            testFilePath3 = SpecRunnerUtils.getTempDirectory() + "/tabbar-test3.js";

            // Create files with the same name in different directories for testing duplicate name handling
            testDuplicateDir1 = SpecRunnerUtils.getTempDirectory() + "/dir1";
            testDuplicateDir2 = SpecRunnerUtils.getTempDirectory() + "/dir2";
            testDuplicateName = "duplicate.js";

            await SpecRunnerUtils.createTempDirectory();
            await SpecRunnerUtils.ensureExistsDirAsync(testDuplicateDir1);
            await SpecRunnerUtils.ensureExistsDirAsync(testDuplicateDir2);

            await jsPromise(SpecRunnerUtils.createTextFile(testFilePath, "// Test file 1 for TabBar", FileSystem));
            await jsPromise(SpecRunnerUtils.createTextFile(testFilePath2, "// Test file 2 for TabBar", FileSystem));
            await jsPromise(SpecRunnerUtils.createTextFile(testFilePath3, "// Test file 3 for TabBar", FileSystem));
            await jsPromise(
                SpecRunnerUtils.createTextFile(
                    testDuplicateDir1 + "/" + testDuplicateName,
                    "// Duplicate file 1",
                    FileSystem
                )
            );
            await jsPromise(
                SpecRunnerUtils.createTextFile(
                    testDuplicateDir2 + "/" + testDuplicateName,
                    "// Duplicate file 2",
                    FileSystem
                )
            );

            // Open the first test file
            await awaitsForDone(
                CommandManager.execute(Commands.FILE_OPEN, { fullPath: testFilePath }),
                "Open test file"
            );
        }, 30000);

        afterAll(async function () {
            // Close all files without prompting to save
            await testWindow.closeAllFiles();

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

        /**
         * Helper function to check if a tab for a specific file is active
         * @param {string} filePath - The path of the file to check
         * @returns {boolean} - True if the tab is active, false otherwise
         */
        function isTabActive(filePath) {
            return $(`.tab[data-path="${filePath}"].active`).length > 0;
        }

        /**
         * Helper function to get the tab element for a specific file
         * @param {string} filePath - The path of the file
         * @returns {jQuery} - The tab element
         */
        function getTab(filePath) {
            return $(`.tab[data-path="${filePath}"]`);
        }

        /**
         * Helper function to check if a tab has a dirty indicator
         * @param {string} filePath - The path of the file to check
         * @returns {boolean} - True if the tab has a dirty indicator, false otherwise
         */
        function isTabDirty(filePath) {
            return getTab(filePath).hasClass("dirty");
        }

        /**
         * Helper function to get the tab name element for a specific file
         * @param {string} filePath - The path of the file
         * @returns {jQuery} - The tab name element
         */
        function getTabName(filePath) {
            return getTab(filePath).find(".tab-name");
        }

        /**
         * Helper function to check if a tab has a directory name displayed
         * @param {string} filePath - The path of the file to check
         * @returns {boolean} - True if the tab has a directory name, false otherwise
         */
        function hasDirectoryName(filePath) {
            return getTab(filePath).find(".tab-dirname").length > 0;
        }

        /**
         * Helper function to get the directory name displayed in a tab
         * @param {string} filePath - The path of the file
         * @returns {string} - The directory name or empty string if not found
         */
        function getDirectoryName(filePath) {
            const $dirName = getTab(filePath).find(".tab-dirname");
            return $dirName.length ? $dirName.text() : "";
        }

        /**
         * Helper function to check if a tab has a file icon
         * @param {string} filePath - The path of the file to check
         * @returns {boolean} - True if the tab has a file icon, false otherwise
         */
        function hasFileIcon(filePath) {
            return getTab(filePath).find(".tab-icon i").length > 0;
        }

        /**
         * Helper function to check if a tab has a git status indicator
         * @param {string} filePath - The path of the file to check
         * @returns {boolean} - True if the tab has a git status indicator, false otherwise
         */
        function hasGitStatus(filePath) {
            return getTab(filePath).hasClass("git-new") || getTab(filePath).hasClass("git-modified");
        }

        /**
         * Helper function to get the tooltip (title attribute) of a tab
         * @param {string} filePath - The path of the file
         * @returns {string} - The tooltip text
         */
        function getTabTooltip(filePath) {
            return getTab(filePath).attr("title") || "";
        }

        /**
         * Helper function to check if a tab has a close button
         * @param {string} filePath - The path of the file to check
         * @returns {boolean} - True if the tab has a close button, false otherwise
         */
        function hasCloseButton(filePath) {
            return getTab(filePath).find(".tab-close").length > 0;
        }

        /**
         * Helper function to check if the overflow button is visible
         * @returns {boolean} - True if the overflow button is visible, false otherwise
         */
        function isOverflowButtonVisible() {
            return $("#overflow-button").is(":visible");
        }

        /**
         * Helper function to get the overflow button element
         * @returns {jQuery} - The overflow button element
         */
        function getOverflowButton() {
            return $("#overflow-button");
        }

        /**
         * Helper function to check if a tab is visible in the tab bar (not hidden by overflow)
         * @param {string} filePath - The path of the file to check
         * @returns {boolean} - True if the tab is visible, false otherwise
         */
        function isTabVisible(filePath) {
            const $tab = getTab(filePath);
            if (!$tab.length) {
                return false;
            }

            const $tabBar = $("#phoenix-tab-bar");
            const tabBarRect = $tabBar[0].getBoundingClientRect();
            const tabRect = $tab[0].getBoundingClientRect();

            // A tab is considered visible if it is completely within the tab bar's visible area
            // with a small margin of error (2px)
            return tabRect.left >= tabBarRect.left && tabRect.right <= tabBarRect.right + 2;
        }

        /**
         * Helper function to get the overflow dropdown menu
         * @returns {jQuery} - The overflow dropdown menu element
         */
        function getOverflowDropdown() {
            return $(".dropdown-overflow-menu");
        }

        /**
         * Helper function to get the items in the overflow dropdown
         * @returns {jQuery} - The overflow dropdown items
         */
        function getOverflowDropdownItems() {
            return $(".dropdown-overflow-menu .dropdown-tab-item");
        }

        /**
         * Helper function to get a specific item in the overflow dropdown by file path
         * @param {string} filePath - The path of the file to find
         * @returns {jQuery} - The dropdown item element
         */
        function getOverflowDropdownItem(filePath) {
            return $(`.dropdown-overflow-menu .dropdown-tab-item[data-tab-path="${filePath}"]`);
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
                await testWindow.closeAllFiles();

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
                const promise2 = CommandManager.execute(Commands.FILE_CLOSE, { file: fileToClose2 });

                // Cancel the save dialog if it appears
                testWindow.brackets.test.Dialogs.cancelModalDialogIfOpen(
                    testWindow.brackets.test.DefaultDialogs.DIALOG_ID_SAVE_CLOSE,
                    testWindow.brackets.test.DefaultDialogs.DIALOG_BTN_DONTSAVE
                );

                await awaitsForDone(promise2, "Close second test file");

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
                const promise1 = CommandManager.execute(Commands.FILE_CLOSE, { file: fileToClose1 });

                // Cancel the save dialog if it appears
                testWindow.brackets.test.Dialogs.cancelModalDialogIfOpen(
                    testWindow.brackets.test.DefaultDialogs.DIALOG_ID_SAVE_CLOSE,
                    testWindow.brackets.test.DefaultDialogs.DIALOG_BTN_DONTSAVE
                );

                await awaitsForDone(promise1, "Close first test file");

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
                const promise3 = CommandManager.execute(Commands.FILE_CLOSE, { file: fileToClose3 });

                // Cancel the save dialog if it appears
                testWindow.brackets.test.Dialogs.cancelModalDialogIfOpen(
                    testWindow.brackets.test.DefaultDialogs.DIALOG_ID_SAVE_CLOSE,
                    testWindow.brackets.test.DefaultDialogs.DIALOG_BTN_DONTSAVE
                );

                await awaitsForDone(promise3, "Close third test file");

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

        describe("Active Tab", function () {
            beforeEach(async function () {
                // Enable the tab bar feature
                PreferencesManager.set("tabBar.options", { showTabBar: true, numberOfTabs: -1 });

                // Close all files to start with a clean state
                await testWindow.closeAllFiles();

                // Open all three test files
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
            });

            it("should change active tab when switching files in the working set", async function () {
                // Switch to the first file
                await awaitsForDone(
                    CommandManager.execute(Commands.FILE_OPEN, { fullPath: testFilePath }),
                    "Switch to first file"
                );

                // Wait for the tab to become active
                await awaitsFor(
                    function () {
                        return isTabActive(testFilePath);
                    },
                    "First tab to become active",
                    1000
                );

                // Verify the first tab is active and others are not
                expect(isTabActive(testFilePath)).toBe(true);
                expect(isTabActive(testFilePath2)).toBe(false);
                expect(isTabActive(testFilePath3)).toBe(false);

                // Switch to the second file
                await awaitsForDone(
                    CommandManager.execute(Commands.FILE_OPEN, { fullPath: testFilePath2 }),
                    "Switch to second file"
                );

                // Wait for the tab to become active
                await awaitsFor(
                    function () {
                        return isTabActive(testFilePath2);
                    },
                    "Second tab to become active",
                    1000
                );

                // Verify the second tab is active and others are not
                expect(isTabActive(testFilePath)).toBe(false);
                expect(isTabActive(testFilePath2)).toBe(true);
                expect(isTabActive(testFilePath3)).toBe(false);

                // Switch to the third file
                await awaitsForDone(
                    CommandManager.execute(Commands.FILE_OPEN, { fullPath: testFilePath3 }),
                    "Switch to third file"
                );

                // Wait for the tab to become active
                await awaitsFor(
                    function () {
                        return isTabActive(testFilePath3);
                    },
                    "Third tab to become active",
                    1000
                );

                // Verify the third tab is active and others are not
                expect(isTabActive(testFilePath)).toBe(false);
                expect(isTabActive(testFilePath2)).toBe(false);
                expect(isTabActive(testFilePath3)).toBe(true);
            });

            it("should display active tab correctly based on the active file in the working set", async function () {
                // Get the currently active file
                const activeFile = MainViewManager.getCurrentlyViewedFile();

                // just a small timer because tab bar gets recreated
                await awaits(100);

                // Verify the tab for the active file is active
                expect(isTabActive(activeFile.fullPath)).toBe(true);

                // Switch to a different file
                await awaitsForDone(
                    CommandManager.execute(Commands.FILE_OPEN, { fullPath: testFilePath2 }),
                    "Switch to second file"
                );

                // Get the new active file
                const newActiveFile = MainViewManager.getCurrentlyViewedFile();

                await awaits(100);

                // Verify the tab for the new active file is active
                expect(isTabActive(newActiveFile.fullPath)).toBe(true);

                // Verify the tab for the previous active file is no longer active
                expect(isTabActive(activeFile.fullPath)).toBe(false);
            });

            it("should switch files properly when different tabs are clicked", async function () {
                // Helper function to click a tab and verify it becomes active
                async function clickTabAndVerify(filePath, description) {
                    const $tab = getTab(filePath);
                    expect($tab.length).toBe(1);
                    $tab.trigger("mousedown");

                    // Wait for the file to become active
                    await awaitsFor(
                        function () {
                            return (
                                isTabActive(filePath) && MainViewManager.getCurrentlyViewedFile().fullPath === filePath
                            );
                        },
                        `${description} to become active after tab click`,
                        1000
                    );

                    // Verify this tab is active and others are not
                    const allPaths = [testFilePath, testFilePath2, testFilePath3];
                    allPaths.forEach((path) => {
                        expect(isTabActive(path)).toBe(path === filePath);
                    });

                    // Verify the correct file is loaded in the editor
                    expect(MainViewManager.getCurrentlyViewedFile().fullPath).toBe(filePath);
                }
                // add a small timer to make sure that the tab bar is properly loaded
                await awaits(100);

                // Initially, verify the third file is active (last opened)
                expect(isTabActive(testFilePath3)).toBe(true);
                expect(MainViewManager.getCurrentlyViewedFile().fullPath).toBe(testFilePath3);

                // Test clicking on each tab
                await clickTabAndVerify(testFilePath, "First file");
                await clickTabAndVerify(testFilePath2, "Second file");
                await clickTabAndVerify(testFilePath3, "Third file");

                // Click back on the first tab to ensure it still works
                await clickTabAndVerify(testFilePath, "First file");
            });
        });

        describe("Overflow", function () {
            beforeEach(async function () {
                // Enable the tab bar feature
                PreferencesManager.set("tabBar.options", { showTabBar: true, numberOfTabs: -1 });

                // Close all files to start with a clean state
                await testWindow.closeAllFiles();
            });

            it("should show overflow button when there are too many tabs to fit", async function () {
                // Create several test files to ensure overflow
                const testFiles = [];
                for (let i = 0; i < 15; i++) {
                    const filePath = SpecRunnerUtils.getTempDirectory() + `/overflow-test-${i}.js`;
                    testFiles.push(filePath);
                    await jsPromise(SpecRunnerUtils.createTextFile(filePath, `// Overflow test file ${i}`, FileSystem));
                }

                // Open all the test files
                for (const filePath of testFiles) {
                    await awaitsForDone(
                        CommandManager.execute(Commands.FILE_OPEN, { fullPath: filePath }),
                        `Open file ${filePath}`
                    );
                }

                // Wait for all tabs to appear
                await awaitsFor(
                    function () {
                        return getTabCount() >= testFiles.length;
                    },
                    "All tabs to appear",
                    1000
                );

                // Wait for the overflow button to appear
                await awaitsFor(
                    function () {
                        return isOverflowButtonVisible();
                    },
                    "Overflow button to appear",
                    1000
                );

                // Verify the overflow button is visible
                expect(isOverflowButtonVisible()).toBe(true);

                // Verify that some tabs are not visible
                let visibleTabs = 0;
                let hiddenTabs = 0;
                for (const filePath of testFiles) {
                    if (isTabVisible(filePath)) {
                        visibleTabs++;
                    } else {
                        hiddenTabs++;
                    }
                }

                // There should be at least one hidden tab
                expect(hiddenTabs).toBeGreaterThan(0);
                expect(visibleTabs + hiddenTabs).toBe(testFiles.length);

                // Clean up - close all the test files
                for (const filePath of testFiles) {
                    const fileToClose = FileSystem.getFileForPath(filePath);
                    const promise = CommandManager.execute(Commands.FILE_CLOSE, { file: fileToClose });
                    testWindow.brackets.test.Dialogs.cancelModalDialogIfOpen(
                        testWindow.brackets.test.DefaultDialogs.DIALOG_ID_SAVE_CLOSE,
                        testWindow.brackets.test.DefaultDialogs.DIALOG_BTN_DONTSAVE
                    );
                    await awaitsForDone(promise, `Close file ${filePath}`);
                }
            });

            it("should display dropdown with hidden tabs when overflow button is clicked", async function () {
                // Create several test files to ensure overflow
                const testFiles = [];
                for (let i = 0; i < 15; i++) {
                    const filePath = SpecRunnerUtils.getTempDirectory() + `/overflow-test-${i}.js`;
                    testFiles.push(filePath);
                    await jsPromise(SpecRunnerUtils.createTextFile(filePath, `// Overflow test file ${i}`, FileSystem));
                }

                // Open all the test files
                for (const filePath of testFiles) {
                    await awaitsForDone(
                        CommandManager.execute(Commands.FILE_OPEN, { fullPath: filePath }),
                        `Open file ${filePath}`
                    );
                }

                // Wait for all tabs to appear
                await awaitsFor(
                    function () {
                        return getTabCount() >= testFiles.length;
                    },
                    "All tabs to appear",
                    1000
                );

                // Wait for the overflow button to appear
                await awaitsFor(
                    function () {
                        return isOverflowButtonVisible();
                    },
                    "Overflow button to appear",
                    1000
                );

                // Get the list of hidden tabs
                const hiddenFiles = testFiles.filter((filePath) => !isTabVisible(filePath));
                expect(hiddenFiles.length).toBeGreaterThan(0);

                // Click the overflow button
                getOverflowButton().click();

                // Wait for the dropdown to appear
                await awaitsFor(
                    function () {
                        return getOverflowDropdown().length > 0;
                    },
                    "Overflow dropdown to appear",
                    1000
                );

                // Verify the dropdown is visible
                expect(getOverflowDropdown().length).toBeGreaterThan(0);

                // Verify the dropdown contains items for all hidden tabs
                const dropdownItems = getOverflowDropdownItems();
                expect(dropdownItems.length).toBe(hiddenFiles.length);

                // Verify each hidden file has an item in the dropdown
                for (const filePath of hiddenFiles) {
                    const item = getOverflowDropdownItem(filePath);
                    expect(item.length).toBe(1);
                }

                // Clean up - close the dropdown by clicking elsewhere
                $("body").click();

                // Wait for the dropdown to disappear
                await awaitsFor(
                    function () {
                        return getOverflowDropdown().length === 0;
                    },
                    "Overflow dropdown to disappear",
                    1000
                );

                // Clean up - close all the test files
                for (const filePath of testFiles) {
                    const fileToClose = FileSystem.getFileForPath(filePath);
                    const promise = CommandManager.execute(Commands.FILE_CLOSE, { file: fileToClose });
                    testWindow.brackets.test.Dialogs.cancelModalDialogIfOpen(
                        testWindow.brackets.test.DefaultDialogs.DIALOG_ID_SAVE_CLOSE,
                        testWindow.brackets.test.DefaultDialogs.DIALOG_BTN_DONTSAVE
                    );
                    await awaitsForDone(promise, `Close file ${filePath}`);
                }
            });

            it("should make tab visible and file active when clicking on item in overflow dropdown", async function () {
                // Create several test files to ensure overflow
                const testFiles = [];
                for (let i = 0; i < 15; i++) {
                    const filePath = SpecRunnerUtils.getTempDirectory() + `/overflow-test-${i}.js`;
                    testFiles.push(filePath);
                    await jsPromise(SpecRunnerUtils.createTextFile(filePath, `// Overflow test file ${i}`, FileSystem));
                }

                // Open all the test files
                for (const filePath of testFiles) {
                    await awaitsForDone(
                        CommandManager.execute(Commands.FILE_OPEN, { fullPath: filePath }),
                        `Open file ${filePath}`
                    );
                }

                // Wait for all tabs to appear
                await awaitsFor(
                    function () {
                        return getTabCount() >= testFiles.length;
                    },
                    "All tabs to appear",
                    1000
                );

                // Wait for the overflow button to appear
                await awaitsFor(
                    function () {
                        return isOverflowButtonVisible();
                    },
                    "Overflow button to appear",
                    1000
                );

                // Get the list of hidden tabs
                const hiddenFiles = testFiles.filter((filePath) => !isTabVisible(filePath));
                expect(hiddenFiles.length).toBeGreaterThan(0);

                // Select a hidden file to test
                const testHiddenFile = hiddenFiles[0];

                // Click the overflow button
                getOverflowButton().click();

                // Wait for the dropdown to appear
                await awaitsFor(
                    function () {
                        return getOverflowDropdown().length > 0;
                    },
                    "Overflow dropdown to appear",
                    1000
                );

                // Get the dropdown item for the test file
                const dropdownItem = getOverflowDropdownItem(testHiddenFile);
                expect(dropdownItem.length).toBe(1);

                // Click the dropdown item
                dropdownItem.click();

                // Wait for the file to become active
                await awaitsFor(
                    function () {
                        return (
                            isTabActive(testHiddenFile) &&
                            MainViewManager.getCurrentlyViewedFile().fullPath === testHiddenFile
                        );
                    },
                    "Hidden file to become active after dropdown item click",
                    1000
                );

                // Verify the file is active
                expect(isTabActive(testHiddenFile)).toBe(true);
                expect(MainViewManager.getCurrentlyViewedFile().fullPath).toBe(testHiddenFile);

                // Verify the tab is now visible (scrolled into view)
                await awaitsFor(
                    function () {
                        return isTabVisible(testHiddenFile);
                    },
                    "Tab to become visible after dropdown item click",
                    1000
                );

                expect(isTabVisible(testHiddenFile)).toBe(true);

                // Clean up - close all the test files
                for (const filePath of testFiles) {
                    const fileToClose = FileSystem.getFileForPath(filePath);
                    const promise = CommandManager.execute(Commands.FILE_CLOSE, { file: fileToClose });
                    testWindow.brackets.test.Dialogs.cancelModalDialogIfOpen(
                        testWindow.brackets.test.DefaultDialogs.DIALOG_ID_SAVE_CLOSE,
                        testWindow.brackets.test.DefaultDialogs.DIALOG_BTN_DONTSAVE
                    );
                    await awaitsForDone(promise, `Close file ${filePath}`);
                }
            });
        });

        describe("Tab Items", function () {
            beforeEach(async function () {
                // Enable the tab bar feature
                PreferencesManager.set("tabBar.options", { showTabBar: true, numberOfTabs: -1 });

                // Close all files to start with a clean state
                await testWindow.closeAllFiles();
            });

            it("should display the correct tab name", async function () {
                // Open the first test file
                await awaitsForDone(
                    CommandManager.execute(Commands.FILE_OPEN, { fullPath: testFilePath }),
                    "Open test file"
                );

                // Wait for the tab to appear
                await awaitsFor(
                    function () {
                        return tabExists(testFilePath);
                    },
                    "Tab to appear",
                    1000
                );

                // Get the filename from the path
                const fileName = testFilePath.split("/").pop();

                // Verify the tab name is correct
                expect(getTabName(testFilePath).text()).toBe(fileName);
            });

            it("should display a file icon", async function () {
                // Open the first test file
                await awaitsForDone(
                    CommandManager.execute(Commands.FILE_OPEN, { fullPath: testFilePath }),
                    "Open test file"
                );

                // Wait for the tab to appear
                await awaitsFor(
                    function () {
                        return tabExists(testFilePath);
                    },
                    "Tab to appear",
                    1000
                );

                // Verify the tab has a file icon
                expect(hasFileIcon(testFilePath)).toBe(true);
            });

            it("should display a dirty indicator when the file is modified and remove it when saved", async function () {
                // Open the first test file
                await awaitsForDone(
                    CommandManager.execute(Commands.FILE_OPEN, { fullPath: testFilePath }),
                    "Open test file"
                );

                // Wait for the tab to appear
                await awaitsFor(
                    function () {
                        return tabExists(testFilePath);
                    },
                    "Tab to appear",
                    1000
                );

                // Initially, the file should not be dirty
                expect(isTabDirty(testFilePath)).toBe(false);

                // Get the document and modify it
                const doc = DocumentManager.getOpenDocumentForPath(testFilePath);
                doc.setText("// Modified content");

                // Wait for the dirty indicator to appear
                await awaitsFor(
                    function () {
                        return isTabDirty(testFilePath);
                    },
                    "Dirty indicator to appear",
                    1000
                );

                // Verify the tab has a dirty indicator
                expect(isTabDirty(testFilePath)).toBe(true);

                // Save the file
                await awaitsForDone(CommandManager.execute(Commands.FILE_SAVE, { doc: doc }), "Save file");

                // Wait for the dirty indicator to disappear
                await awaitsFor(
                    function () {
                        return !isTabDirty(testFilePath);
                    },
                    "Dirty indicator to disappear",
                    1000
                );

                // Verify the tab no longer has a dirty indicator
                expect(isTabDirty(testFilePath)).toBe(false);

                // Revert the changes for cleanup
                doc.setText("// Test file 1 for TabBar");
                await awaitsForDone(
                    CommandManager.execute(Commands.FILE_SAVE, { doc: doc }),
                    "Save file with original content"
                );
            });

            it("should display directory name for files with the same name", async function () {
                // Open both duplicate files
                const duplicateFile1 = testDuplicateDir1 + "/" + testDuplicateName;
                const duplicateFile2 = testDuplicateDir2 + "/" + testDuplicateName;

                await awaitsForDone(
                    CommandManager.execute(Commands.FILE_OPEN, { fullPath: duplicateFile1 }),
                    "Open first duplicate file"
                );
                await awaitsForDone(
                    CommandManager.execute(Commands.FILE_OPEN, { fullPath: duplicateFile2 }),
                    "Open second duplicate file"
                );

                // Wait for both tabs to appear
                await awaitsFor(
                    function () {
                        return tabExists(duplicateFile1) && tabExists(duplicateFile2);
                    },
                    "Both duplicate tabs to appear",
                    1000
                );

                // Verify both tabs have directory names
                expect(hasDirectoryName(duplicateFile1)).toBe(true);
                expect(hasDirectoryName(duplicateFile2)).toBe(true);

                // Verify the directory names are correct
                expect(getDirectoryName(duplicateFile1)).toContain("dir1");
                expect(getDirectoryName(duplicateFile2)).toContain("dir2");
            });

            it("should display the full file path in the tooltip", async function () {
                // Open the first test file
                await awaitsForDone(
                    CommandManager.execute(Commands.FILE_OPEN, { fullPath: testFilePath }),
                    "Open test file"
                );

                // Wait for the tab to appear
                await awaitsFor(
                    function () {
                        return tabExists(testFilePath);
                    },
                    "Tab to appear",
                    1000
                );

                // Verify the tooltip contains the full path
                const tooltip = getTabTooltip(testFilePath);
                expect(tooltip).toContain(Phoenix.app.getDisplayPath(testFilePath));
            });

            it("should display git change markers when git is enabled", async function () {
                // Skip this test if Git integration is not available
                if (!testWindow.brackets.test.Phoenix || !testWindow.brackets.test.Phoenix.app) {
                    expect("Test skipped - Phoenix.app not available").toBe("Test skipped - Phoenix.app not available");
                    return;
                }

                // Create a mock for the Git integration
                if (!testWindow.phoenixGitEvents) {
                    testWindow.phoenixGitEvents = {};
                }

                // Save the original Git integration if it exists
                const originalGitEvents = testWindow.phoenixGitEvents.TabBarIntegration;

                // Create a mock TabBarIntegration
                testWindow.phoenixGitEvents.TabBarIntegration = {
                    isUntracked: function (path) {
                        return path === testFilePath; // Mark the first file as untracked
                    },
                    isModified: function (path) {
                        return path === testFilePath2; // Mark the second file as modified
                    }
                };

                // Make sure the EventEmitter exists
                if (!testWindow.phoenixGitEvents.EventEmitter) {
                    testWindow.phoenixGitEvents.EventEmitter = {
                        on: function () {},
                        emit: function () {}
                    };
                }

                // Open the test files
                await awaitsForDone(
                    CommandManager.execute(Commands.FILE_OPEN, { fullPath: testFilePath }),
                    "Open first test file"
                );
                await awaitsForDone(
                    CommandManager.execute(Commands.FILE_OPEN, { fullPath: testFilePath2 }),
                    "Open second test file"
                );

                // Trigger a Git status update
                testWindow.phoenixGitEvents.EventEmitter.emit("GIT_FILE_STATUS_CHANGED");

                // Wait for the tabs to update
                await awaits(300);

                // Verify the first file has the git-new class
                const $tab1 = getTab(testFilePath);
                expect($tab1.hasClass("git-new")).toBe(true);
                expect(hasGitStatus(testFilePath)).toBe(true);

                // Verify the second file has the git-modified class
                const $tab2 = getTab(testFilePath2);
                expect($tab2.hasClass("git-modified")).toBe(true);
                expect(hasGitStatus(testFilePath2)).toBe(true);

                // Verify the tooltips contain the Git status
                expect(getTabTooltip(testFilePath)).toContain("Untracked");
                expect(getTabTooltip(testFilePath2)).toContain("Modified");

                // Restore the original Git integration
                testWindow.phoenixGitEvents.TabBarIntegration = originalGitEvents;
            });

            it("should display a close button", async function () {
                // Open the first test file
                await awaitsForDone(
                    CommandManager.execute(Commands.FILE_OPEN, { fullPath: testFilePath }),
                    "Open test file"
                );

                // Wait for the tab to appear
                await awaitsFor(
                    function () {
                        return tabExists(testFilePath);
                    },
                    "Tab to appear",
                    1000
                );

                // Verify the tab has a close button
                expect(hasCloseButton(testFilePath)).toBe(true);

                // Verify the close button has the correct icon
                const $closeButton = getTab(testFilePath).find(".tab-close");
                expect($closeButton.find("i.fa-times").length).toBe(1);
            });

            it("should close the file when the close button is clicked", async function () {
                // Open the first test file
                await awaitsForDone(
                    CommandManager.execute(Commands.FILE_OPEN, { fullPath: testFilePath }),
                    "Open test file"
                );

                // Wait for the tab to appear
                await awaitsFor(
                    function () {
                        return tabExists(testFilePath);
                    },
                    "Tab to appear",
                    1000
                );

                // Get the close button
                const $closeButton = getTab(testFilePath).find(".tab-close");

                // Create a spy for the FILE_CLOSE command
                const executeOriginal = CommandManager.execute;
                let fileCloseCalled = false;
                let fileClosePathArg = null;

                CommandManager.execute = function (command, args) {
                    if (command === Commands.FILE_CLOSE) {
                        fileCloseCalled = true;
                        if (args && args.file) {
                            fileClosePathArg = args.file.fullPath;
                        }
                    }
                    return executeOriginal.apply(CommandManager, arguments);
                };

                // Click the close button
                $closeButton.click();

                // Cancel the save dialog if it appears
                testWindow.brackets.test.Dialogs.cancelModalDialogIfOpen(
                    testWindow.brackets.test.DefaultDialogs.DIALOG_ID_SAVE_CLOSE,
                    testWindow.brackets.test.DefaultDialogs.DIALOG_BTN_DONTSAVE
                );

                // Wait for the tab to disappear
                await awaitsFor(
                    function () {
                        return !tabExists(testFilePath);
                    },
                    "Tab to disappear",
                    1000
                );

                // Restore the original execute function
                CommandManager.execute = executeOriginal;

                // Verify the FILE_CLOSE command was called with the correct file
                expect(fileCloseCalled).toBe(true);
                expect(fileClosePathArg).toBe(testFilePath);
            });
        });
    });
});
