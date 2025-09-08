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
        let testWindow,
            PreferencesManager,
            $,
            FileSystem,
            MainViewManager,
            CommandManager,
            Commands,
            DocumentManager,
            Strings;
        let testFilePath, testFilePath2, testFilePath3, testDuplicateDir1, testDuplicateDir2, testDuplicateName;

        /**
         * Helper function to create multiple test files
         * @param {number} count - Number of files to create
         * @param {string} prefix - Prefix for the file names
         * @param {string} content - Content template for the files (will be appended with file index)
         * @returns {Promise<string[]>} - Array of file paths
         */
        async function createTestFiles(count, prefix, content) {
            const testFiles = [];
            for (let i = 0; i < count; i++) {
                const filePath = SpecRunnerUtils.getTempDirectory() + `/${prefix}-${i}.js`;
                testFiles.push(filePath);
                await jsPromise(
                    SpecRunnerUtils.createTextFile(
                        filePath,
                        content ? `${content} ${i}` : `// ${prefix} test file ${i}`,
                        FileSystem
                    )
                );
            }
            return testFiles;
        }

        /**
         * Helper function to open multiple files
         * @param {string[]} filePaths - Array of file paths to open
         * @param {string} [paneId] - Optional pane ID to open the files in
         * @returns {Promise<void>}
         */
        async function openTestFiles(filePaths, paneId) {
            for (const filePath of filePaths) {
                const options = { fullPath: filePath };
                if (paneId) {
                    options.paneId = paneId;
                }
                await awaitsForDone(
                    CommandManager.execute(Commands.FILE_OPEN, options),
                    `Open file ${filePath}${paneId ? ` in ${paneId}` : ""}`
                );
            }
        }

        /**
         * Helper function to wait for tabs to appear
         * @param {string[]} filePaths - Array of file paths to wait for
         * @param {string} [paneId] - Optional pane ID to check for tabs
         * @returns {Promise<void>}
         */
        async function waitForTabs(filePaths, paneId) {
            if (paneId) {
                // Wait for tabs to appear in the specified pane
                await awaitsFor(
                    function () {
                        return getPaneTabCount(paneId) >= filePaths.length;
                    },
                    `All tabs to appear in ${paneId}`
                );
            } else if (filePaths.length === 1) {
                // Wait for a single tab to appear
                await awaitsFor(
                    function () {
                        return tabExists(filePaths[0]);
                    },
                    `Tab for ${filePaths[0]} to appear`
                );
            } else {
                // Wait for multiple tabs to appear
                await awaitsFor(
                    function () {
                        return getTabCount() >= filePaths.length && filePaths.every((path) => tabExists(path));
                    },
                    "All tabs to appear"
                );
            }
        }

        /**
         * Helper function to cancel the save dialog
         * @returns {void}
         */
        function cancelSaveDialog() {
            testWindow.brackets.test.Dialogs.cancelModalDialogIfOpen(
                testWindow.brackets.test.DefaultDialogs.DIALOG_ID_SAVE_CLOSE,
                testWindow.brackets.test.DefaultDialogs.DIALOG_BTN_DONTSAVE
            );
        }

        /**
         * Helper function to close files
         * @param {string[]} filePaths - Array of file paths to close
         * @param {string} [paneId] - Optional pane ID to close the files from
         * @returns {Promise<void>}
         */
        async function closeTestFiles(filePaths, paneId) {
            for (const filePath of filePaths) {
                const fileToClose = FileSystem.getFileForPath(filePath);
                const options = { file: fileToClose };
                if (paneId) {
                    options.paneId = paneId;
                }
                const promise = CommandManager.execute(Commands.FILE_CLOSE, options);
                cancelSaveDialog();
                await awaitsForDone(promise, `Close file ${filePath}`);
            }
        }

        /**
         * Helper function to simulate drag and drop between tabs
         * @param {string} sourceFilePath - Path of the source file to drag
         * @param {string} targetFilePath - Path of the target file to drop onto
         * @param {boolean} [dropBefore=true] - Whether to drop before the target (true) or after (false)
         * @returns {Promise<void>}
         */
        async function simulateTabDragAndDrop(sourceFilePath, targetFilePath, dropBefore = true) {
            // Get the source and target tabs
            const sourceTab = getTab(sourceFilePath);
            const targetTab = getTab(targetFilePath);

            // Simulate drag start on the source tab
            const dragStartEvent = $.Event("dragstart", {
                originalEvent: {
                    dataTransfer: {
                        setData: function () {},
                        effectAllowed: "move"
                    }
                }
            });
            sourceTab.trigger(dragStartEvent);

            // Simulate dragenter on the target tab
            const dragEnterEvent = $.Event("dragenter");
            targetTab.trigger(dragEnterEvent);

            // Simulate drag over on the target tab
            const targetRect = targetTab[0].getBoundingClientRect();
            const dropX = dropBefore
                ? targetRect.left + 5 // Position near the left edge to drop before
                : targetRect.right - 5; // Position near the right edge to drop after

            const dragOverEvent = $.Event("dragover", {
                originalEvent: {
                    dataTransfer: {
                        dropEffect: "move"
                    },
                    clientX: dropX
                },
                preventDefault: function () {}
            });
            targetTab.trigger(dragOverEvent);

            // Simulate drop on the target tab
            const dropEvent = $.Event("drop", {
                originalEvent: {
                    dataTransfer: {},
                    clientX: dropX
                },
                preventDefault: function () {},
                stopPropagation: function () {}
            });
            targetTab.trigger(dropEvent);

            // Simulate dragend to complete the operation
            const dragEndEvent = $.Event("dragend");
            sourceTab.trigger(dragEndEvent);
        }

        /**
         * Helper function to check if the tab bar for a specific pane is visible
         * @param {string} paneId - The pane ID ("first-pane" or "second-pane")
         * @returns {boolean} - True if the tab bar is visible, false otherwise
         */
        function isTabBarVisible(paneId) {
            const tabBarId = paneId === "first-pane" ? "#phoenix-tab-bar" : "#phoenix-tab-bar-2";
            return $(tabBarId).is(":visible");
        }

        /**
         * Helper function to get the tab count for a specific pane
         * @param {string} paneId - The pane ID ("first-pane" or "second-pane")
         * @returns {number} - The number of tabs in the pane
         */
        function getPaneTabCount(paneId) {
            const tabBarId = paneId === "first-pane" ? "#phoenix-tab-bar" : "#phoenix-tab-bar-2";
            return $(tabBarId).find(".tab").length;
        }

        /**
         * Helper function to check if a tab for a specific file exists in a specific pane
         * @param {string} filePath - The path of the file to check
         * @param {string} paneId - The pane ID ("first-pane" or "second-pane")
         * @returns {boolean} - True if the tab exists in the pane, false otherwise
         */
        function tabExistsInPane(filePath, paneId) {
            const tabBarId = paneId === "first-pane" ? "#phoenix-tab-bar" : "#phoenix-tab-bar-2";
            return $(tabBarId).find(`.tab[data-path="${filePath}"]`).length > 0;
        }

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
            Strings = testWindow.Strings;

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
        }, 5000);

        afterAll(async function () {
            // Close all files without prompting to save
            await testWindow.closeAllFiles();

            testWindow = null;
            await SpecRunnerUtils.closeTestWindow();
            await SpecRunnerUtils.removeTempDirectory();
        }, 5000);

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
                    "Tab bar to become visible"
                );
            });

            it("should hide tab bar when the feature is disabled", async function () {
                // Disable the tab bar feature
                PreferencesManager.set("tabBar.options", { showTabBar: false, numberOfTabs: -1 });

                // Wait for the tab bar to become hidden
                await awaitsFor(
                    function () {
                        return !$("#phoenix-tab-bar").is(":visible");
                    },
                    "Tab bar to become hidden"
                );
            });

            it("should show working set when the option is enabled", async function () {
                // Enable the working set feature
                PreferencesManager.set("showWorkingSet", true);

                // Wait for the working set to become visible
                await awaitsFor(
                    function () {
                        return !$("#working-set-list-container").hasClass("working-set-hidden");
                    },
                    "Working set to become visible"
                );
            });

            it("should hide working set when the option is disabled", async function () {
                // Disable the working set feature
                PreferencesManager.set("showWorkingSet", false);

                // Wait for the working set to become hidden
                await awaitsFor(
                    function () {
                        return $("#working-set-list-container").hasClass("working-set-hidden");
                    },
                    "Working set to become hidden"
                );
            });
        });

        describe("Configure Working Set Button", function () {
            it("should have a working set configuration button in the sidebar", function () {
                // Verify the button exists
                const $configButton = $(".working-set-splitview-btn");
                expect($configButton.length).toBe(1);
            });

            it("should open a menu with 'Show working set' and 'Show file tab bar' options when clicked", async function () {
                // Click the configure working set button
                const $configButton = $(".working-set-splitview-btn");
                $configButton.click();

                // Wait for the menu to appear
                await awaitsFor(
                    function () {
                        return $(".dropdown-menu:visible").length > 0;
                    },
                    "Context menu to appear"
                );

                // Verify the menu contains the expected options
                const $menu = $(".dropdown-menu:visible");
                const showWorkingSetItem = $menu.find("li a[id$='cmd.toggleShowWorkingSet']");
                const showFileTabsItem = $menu.find("li a[id$='cmd.toggleShowFileTabs']");

                expect(showWorkingSetItem.length).toBe(1);
                expect(showFileTabsItem.length).toBe(1);

                // Clean up - close the menu
                $("body").click();
            });

            it("should toggle working set visibility when 'Show working set' option is clicked", async function () {
                // First, ensure working set is visible
                PreferencesManager.set("showWorkingSet", true);
                await awaitsFor(
                    function () {
                        return !$("#working-set-list-container").hasClass("working-set-hidden");
                    },
                    "Working set to become visible"
                );

                // Click the configure working set button
                const $configButton = $(".working-set-splitview-btn");
                $configButton.click();

                // Wait for the menu to appear
                await awaitsFor(
                    function () {
                        return $(".dropdown-menu:visible").length > 0;
                    },
                    "Context menu to appear"
                );

                // Click the "Show working set" option
                const $menu = $(".dropdown-menu:visible");
                const showWorkingSetItem = $menu.find("li a[id$='cmd.toggleShowWorkingSet']");
                showWorkingSetItem.click();

                // Wait for the working set to become hidden
                await awaitsFor(
                    function () {
                        return $("#working-set-list-container").hasClass("working-set-hidden");
                    },
                    "Working set to become hidden"
                );

                // Click the configure working set button again
                $configButton.click();

                // Wait for the menu to appear
                await awaitsFor(
                    function () {
                        return $(".dropdown-menu:visible").length > 0;
                    },
                    "Context menu to appear"
                );

                // Click the "Show working set" option again
                const $menu2 = $(".dropdown-menu:visible");
                const showWorkingSetItem2 = $menu2.find("li a[id$='cmd.toggleShowWorkingSet']");
                showWorkingSetItem2.click();

                // Wait for the working set to become visible
                await awaitsFor(
                    function () {
                        return !$("#working-set-list-container").hasClass("working-set-hidden");
                    },
                    "Working set to become visible"
                );
            });

            it("should toggle tab bar visibility when 'Show file tab bar' option is clicked", async function () {
                // First, ensure tab bar is visible
                PreferencesManager.set("tabBar.options", { showTabBar: true, numberOfTabs: -1 });
                await awaitsFor(
                    function () {
                        return $("#phoenix-tab-bar").is(":visible");
                    },
                    "Tab bar to become visible"
                );

                // Click the configure working set button
                const $configButton = $(".working-set-splitview-btn");
                $configButton.click();

                // Wait for the menu to appear
                await awaitsFor(
                    function () {
                        return $(".dropdown-menu:visible").length > 0;
                    },
                    "Context menu to appear"
                );

                // Click the "Show file tab bar" option
                const $menu = $(".dropdown-menu:visible");
                const showFileTabsItem = $menu.find("li a[id$='cmd.toggleShowFileTabs']");
                showFileTabsItem.click();

                // Wait for the tab bar to become hidden
                await awaitsFor(
                    function () {
                        return !$("#phoenix-tab-bar").is(":visible");
                    },
                    "Tab bar to become hidden"
                );

                // Click the configure working set button again
                $configButton.click();

                // Wait for the menu to appear
                await awaitsFor(
                    function () {
                        return $(".dropdown-menu:visible").length > 0;
                    },
                    "Context menu to appear"
                );

                // Click the "Show file tab bar" option again
                const $menu2 = $(".dropdown-menu:visible");
                const showFileTabsItem2 = $menu2.find("li a[id$='cmd.toggleShowFileTabs']");
                showFileTabsItem2.click();

                // Wait for the tab bar to become visible
                await awaitsFor(
                    function () {
                        return $("#phoenix-tab-bar").is(":visible");
                    },
                    "Tab bar to become visible"
                );
            });
        });

        describe("Drag and Drop", function () {
            beforeEach(async function () {
                // Close all files and reset to single pane
                await testWindow.closeAllFiles();
                MainViewManager.setLayoutScheme(1, 1);

                // Wait for cleanup to complete
                await awaitsFor(
                    function () {
                        return MainViewManager.getPaneCount() === 1 && getTabCount() === 0;
                    },
                    "Cleanup to complete with single pane and no tabs"
                );
            });

            it("should allow dragging and dropping a tab to the beginning of the tab bar", async function () {
                // Enable the tab bar feature
                PreferencesManager.set("tabBar.options", { showTabBar: true, numberOfTabs: -1 });

                // Close all files to start with a clean state
                await testWindow.closeAllFiles();

                // Create and open multiple test files to work with
                const testFiles = await createTestFiles(3, "drag-drop-test", "// Drag drop test file");
                await openTestFiles(testFiles);
                await waitForTabs(testFiles);

                // Verify initial tab order
                const initialWorkingSet = MainViewManager.getWorkingSet("first-pane");
                expect(initialWorkingSet.length).toBe(testFiles.length);
                expect(initialWorkingSet[0].fullPath).toBe(testFiles[0]);
                expect(initialWorkingSet[1].fullPath).toBe(testFiles[1]);
                expect(initialWorkingSet[2].fullPath).toBe(testFiles[2]);

                // Simulate drag and drop from first tab to last tab
                await simulateTabDragAndDrop(testFiles[0], testFiles[2], true);

                // Wait for the working set to update
                await awaitsFor(
                    function () {
                        const currentWorkingSet = MainViewManager.getWorkingSet("first-pane");
                        // Check if the first file has moved to before the last file
                        return (
                            currentWorkingSet.length === testFiles.length &&
                            currentWorkingSet[1].fullPath === testFiles[0]
                        );
                    },
                    "Working set to update after drag and drop"
                );

                // Verify the new tab order
                const finalWorkingSet = MainViewManager.getWorkingSet("first-pane");
                expect(finalWorkingSet.length).toBe(testFiles.length);
                expect(finalWorkingSet[0].fullPath).toBe(testFiles[1]);
                expect(finalWorkingSet[1].fullPath).toBe(testFiles[0]);
                expect(finalWorkingSet[2].fullPath).toBe(testFiles[2]);

                // Clean up - close all the test files
                await closeTestFiles(testFiles);
            });

            it("should allow dragging and dropping a tab in between other tabs", async function () {
                // Enable the tab bar feature
                PreferencesManager.set("tabBar.options", { showTabBar: true, numberOfTabs: -1 });

                // Close all files to start with a clean state
                await testWindow.closeAllFiles();

                // Create and open multiple test files to work with
                const testFiles = await createTestFiles(3, "drag-between-test", "// Drag between test file");
                await openTestFiles(testFiles);
                await waitForTabs(testFiles);

                // Verify initial tab order
                const initialWorkingSet = MainViewManager.getWorkingSet("first-pane");
                expect(initialWorkingSet.length).toBe(testFiles.length);
                expect(initialWorkingSet[0].fullPath).toBe(testFiles[0]);
                expect(initialWorkingSet[1].fullPath).toBe(testFiles[1]);
                expect(initialWorkingSet[2].fullPath).toBe(testFiles[2]);

                // Simulate drag and drop from last tab to before the middle tab
                await simulateTabDragAndDrop(testFiles[2], testFiles[1], true);

                // Wait for the working set to update
                await awaitsFor(
                    function () {
                        const currentWorkingSet = MainViewManager.getWorkingSet("first-pane");
                        // Check if the last file has moved to between the first and second files
                        return (
                            currentWorkingSet.length === testFiles.length &&
                            currentWorkingSet[1].fullPath === testFiles[2]
                        );
                    },
                    "Working set to update after drag and drop"
                );

                // Verify the new tab order
                const finalWorkingSet = MainViewManager.getWorkingSet("first-pane");
                expect(finalWorkingSet.length).toBe(testFiles.length);
                expect(finalWorkingSet[0].fullPath).toBe(testFiles[0]);
                expect(finalWorkingSet[1].fullPath).toBe(testFiles[2]); // Last tab should now be in the middle
                expect(finalWorkingSet[2].fullPath).toBe(testFiles[1]); // Middle tab should now be last

                // Clean up - close all the test files
                await closeTestFiles(testFiles);
            });

            it("should allow dragging a tab from one pane to another non-empty pane", async function () {
                // Enable the tab bar feature
                PreferencesManager.set("tabBar.options", { showTabBar: true, numberOfTabs: -1 });

                // Close all files to start with a clean state
                await testWindow.closeAllFiles();

                // Set up a horizontal split view (two columns)
                MainViewManager.setLayoutScheme(1, 2);

                // Create test files for both panes
                const firstPaneFiles = await createTestFiles(2, "first-pane-test", "// First pane test file");
                const secondPaneFiles = await createTestFiles(2, "second-pane-test", "// Second pane test file");

                // Open files in both panes
                await openTestFiles(firstPaneFiles, "first-pane");
                await openTestFiles(secondPaneFiles, "second-pane");

                // Wait for all tabs to appear in both panes
                await waitForTabs(firstPaneFiles, "first-pane");
                await waitForTabs(secondPaneFiles, "second-pane");

                // Verify initial tab counts
                expect(getPaneTabCount("first-pane")).toBe(firstPaneFiles.length);
                expect(getPaneTabCount("second-pane")).toBe(secondPaneFiles.length);

                // Get the source tab from the first pane and target tab from the second pane
                const sourceTab = $(`.tab[data-path="${firstPaneFiles[0]}"]`);
                const targetTab = $(`.tab[data-path="${secondPaneFiles[0]}"]`);

                // Simulate drag start on the source tab
                const dragStartEvent = $.Event("dragstart", {
                    originalEvent: {
                        dataTransfer: {
                            setData: function () {},
                            effectAllowed: "move"
                        }
                    }
                });
                sourceTab.trigger(dragStartEvent);

                // Simulate dragenter on the target tab
                const dragEnterEvent = $.Event("dragenter");
                targetTab.trigger(dragEnterEvent);

                // Simulate drag over on the target tab
                const dragOverEvent = $.Event("dragover", {
                    originalEvent: {
                        dataTransfer: {
                            dropEffect: "move"
                        },
                        clientX: targetTab[0].getBoundingClientRect().left + 5 // Position near the left edge
                    },
                    preventDefault: function () {}
                });
                targetTab.trigger(dragOverEvent);

                // Simulate drop on the target tab
                const dropEvent = $.Event("drop", {
                    originalEvent: {
                        dataTransfer: {},
                        clientX: targetTab[0].getBoundingClientRect().left + 5 // Position near the left edge
                    },
                    preventDefault: function () {},
                    stopPropagation: function () {}
                });
                targetTab.trigger(dropEvent);

                // Simulate dragend to complete the operation
                const dragEndEvent = $.Event("dragend");
                sourceTab.trigger(dragEndEvent);

                // Wait for the tab to move to the second pane
                await awaitsFor(
                    function () {
                        return (
                            !tabExistsInPane(firstPaneFiles[0], "first-pane") &&
                            tabExistsInPane(firstPaneFiles[0], "second-pane")
                        );
                    },
                    "Tab to move from first pane to second pane"
                );

                // Verify the tab counts after the drag and drop
                expect(getPaneTabCount("first-pane")).toBe(firstPaneFiles.length - 1);
                expect(getPaneTabCount("second-pane")).toBe(secondPaneFiles.length + 1);

                // Clean up - close all files and reset to single pane
                await testWindow.closeAllFiles();
                MainViewManager.setLayoutScheme(1, 1);
            });

            it("should allow dragging a tab to an empty pane", async function () {
                // Enable the tab bar feature
                PreferencesManager.set("tabBar.options", { showTabBar: true, numberOfTabs: -1 });

                // Close all files to start with a clean state
                await testWindow.closeAllFiles();

                // Set up a horizontal split view (two columns)
                MainViewManager.setLayoutScheme(1, 2);

                // Wait for layout to settle
                await awaitsFor(
                    function () {
                        return MainViewManager.getPaneCount() === 2;
                    },
                    "Layout to settle with two panes"
                );

                // Verify both panes are empty
                expect(MainViewManager.getWorkingSet("first-pane").length).toBe(0);
                expect(MainViewManager.getWorkingSet("second-pane").length).toBe(0);

                // Create test files for the first pane
                const firstPaneFiles = await createTestFiles(
                    2,
                    "first-pane-empty-test",
                    "// First pane empty test file"
                );

                // Open files in the first pane only
                await openTestFiles(firstPaneFiles, "first-pane");

                // Wait for all tabs to appear in the first pane
                await waitForTabs(firstPaneFiles, "first-pane");

                // Verify initial state: first pane has tabs, second pane is empty
                expect(getPaneTabCount("first-pane")).toBe(firstPaneFiles.length);

                // If the second pane has tabs, log what they are and close them
                if (getPaneTabCount("second-pane") > 0) {
                    const secondPaneWorkingSet = MainViewManager.getWorkingSet("second-pane");
                    for (const file of secondPaneWorkingSet) {
                        await awaitsForDone(
                            CommandManager.execute(Commands.FILE_CLOSE, { file: file, paneId: "second-pane" }),
                            `Force close file ${file.fullPath} in second pane`
                        );
                    }

                    // Wait for the second pane to be empty
                    await awaitsFor(
                        function () {
                            return getPaneTabCount("second-pane") === 0;
                        },
                        "Second pane to be empty after cleanup"
                    );
                }

                expect(getPaneTabCount("second-pane")).toBe(0);
                expect(isTabBarVisible("second-pane")).toBe(false);

                // Get the source tab from the first pane
                const sourceTab = $(`.tab[data-path="${firstPaneFiles[0]}"]`);
                expect(sourceTab.length).toBe(1, "Source tab should exist in the first pane");

                // Get the empty pane content area as the drop target
                const emptyPaneTarget = $("#second-pane .pane-content");
                expect(emptyPaneTarget.length).toBe(1, "Empty pane target should exist");

                // Simulate drag and drop
                try {
                    // Simulate drag start
                    const dragStartEvent = $.Event("dragstart", {
                        originalEvent: {
                            dataTransfer: {
                                setData: function () {},
                                effectAllowed: "move"
                            }
                        }
                    });
                    sourceTab.trigger(dragStartEvent);

                    // Simulate dragenter
                    const dragEnterEvent = $.Event("dragenter");
                    emptyPaneTarget.trigger(dragEnterEvent);

                    // Simulate dragover
                    const dragOverEvent = $.Event("dragover", {
                        originalEvent: {
                            dataTransfer: {
                                dropEffect: "move"
                            }
                        },
                        preventDefault: function () {}
                    });
                    emptyPaneTarget.trigger(dragOverEvent);

                    // Simulate drop
                    const dropEvent = $.Event("drop", {
                        originalEvent: {
                            dataTransfer: {}
                        },
                        preventDefault: function () {},
                        stopPropagation: function () {}
                    });
                    emptyPaneTarget.trigger(dropEvent);

                    // Simulate dragend
                    const dragEndEvent = $.Event("dragend");
                    sourceTab.trigger(dragEndEvent);
                } catch (e) {
                    console.error("Error during drag and drop simulation:", e);
                    throw e;
                }

                // Wait for the tab to move to the second pane
                await awaitsFor(
                    function () {
                        return (
                            !tabExistsInPane(firstPaneFiles[0], "first-pane") &&
                            tabExistsInPane(firstPaneFiles[0], "second-pane") &&
                            isTabBarVisible("second-pane")
                        );
                    },
                    "Tab to move from first pane to second pane and tab bar to appear"
                );

                // Verify the tab counts after the drag and drop
                expect(getPaneTabCount("first-pane")).toBe(firstPaneFiles.length - 1);
                expect(getPaneTabCount("second-pane")).toBe(1);

                // Clean up - close all files and reset to single pane
                await testWindow.closeAllFiles();
                MainViewManager.setLayoutScheme(1, 1);
            });
        });

        describe("Working Set", function () {
            beforeEach(async function () {
                // Enable the tab bar feature
                PreferencesManager.set("tabBar.options", { showTabBar: true, numberOfTabs: -1 });

                // Close all files to start with a clean state
                await testWindow.closeAllFiles();

                // Wait for the tab bar to update
                await awaitsFor(
                    function () {
                        return $("#phoenix-tab-bar").length > 0 && getTabCount() === 0;
                    },
                    "Tab bar to update with no tabs"
                );
            });

            it("should add tabs when files are added to the working set", async function () {
                // Open the first test file and wait for its tab to appear
                await openTestFiles([testFilePath]);
                await waitForTabs([testFilePath]);

                // Verify the tab exists
                expect(tabExists(testFilePath)).toBe(true);
                expect(getTabCount()).toBe(1);

                // Open the second test file and wait for its tab to appear
                await openTestFiles([testFilePath2]);
                await waitForTabs([testFilePath2]);

                // Verify both tabs exist
                expect(tabExists(testFilePath)).toBe(true);
                expect(tabExists(testFilePath2)).toBe(true);
                expect(getTabCount()).toBe(2);

                // Open the third test file and wait for its tab to appear
                await openTestFiles([testFilePath3]);
                await waitForTabs([testFilePath3]);

                // Verify all three tabs exist
                expect(tabExists(testFilePath)).toBe(true);
                expect(tabExists(testFilePath2)).toBe(true);
                expect(tabExists(testFilePath3)).toBe(true);
                expect(getTabCount()).toBe(3);
            });

            it("should remove tabs when files are removed from the working set", async function () {
                // Open all three test files
                const testFiles = [testFilePath, testFilePath2, testFilePath3];
                await openTestFiles(testFiles);
                await waitForTabs(testFiles);

                // Verify all three tabs exist
                expect(getTabCount()).toBe(3);

                // Close the second test file
                await closeTestFiles([testFilePath2]);

                // Wait for the tab to disappear
                await awaitsFor(
                    function () {
                        return !tabExists(testFilePath2);
                    },
                    "Tab for second file to disappear"
                );

                // Verify the second tab is removed
                expect(tabExists(testFilePath)).toBe(true);
                expect(tabExists(testFilePath2)).toBe(false);
                expect(tabExists(testFilePath3)).toBe(true);
                expect(getTabCount()).toBe(2);

                // Close the first test file
                await closeTestFiles([testFilePath]);

                // Wait for the tab to disappear
                await awaitsFor(
                    function () {
                        return !tabExists(testFilePath);
                    },
                    "Tab for first file to disappear"
                );

                // Verify the first tab is removed
                expect(tabExists(testFilePath)).toBe(false);
                expect(tabExists(testFilePath2)).toBe(false);
                expect(tabExists(testFilePath3)).toBe(true);
                expect(getTabCount()).toBe(1);

                // Close the third test file
                await closeTestFiles([testFilePath3]);

                // Wait for the tab to disappear
                await awaitsFor(
                    function () {
                        return !tabExists(testFilePath3);
                    },
                    "Tab for third file to disappear"
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
                const testFiles = [testFilePath, testFilePath2, testFilePath3];
                await openTestFiles(testFiles);
                await waitForTabs(testFiles);
            });

            it("should change active tab when switching files in the working set", async function () {
                // Helper function to switch to a file and verify it's active
                async function switchToFileAndVerify(filePath, description) {
                    // Switch to the file
                    await openTestFiles([filePath]);

                    // Wait for the tab to become active
                    await awaitsFor(
                        function () {
                            return isTabActive(filePath);
                        },
                        `${description} to become active`
                    );

                    // Verify this tab is active and others are not
                    expect(isTabActive(testFilePath)).toBe(filePath === testFilePath);
                    expect(isTabActive(testFilePath2)).toBe(filePath === testFilePath2);
                    expect(isTabActive(testFilePath3)).toBe(filePath === testFilePath3);
                }

                // Test switching to each file
                await switchToFileAndVerify(testFilePath, "First tab");
                await switchToFileAndVerify(testFilePath2, "Second tab");
                await switchToFileAndVerify(testFilePath3, "Third tab");
            });

            it("should display active tab correctly based on the active file in the working set", async function () {
                // Get the currently active file
                const activeFile = MainViewManager.getCurrentlyViewedFile();

                // Wait for tab bar to be recreated and reflect the active file
                await awaitsFor(
                    function () {
                        return $("#phoenix-tab-bar").length > 0 && activeFile && isTabActive(activeFile.fullPath);
                    },
                    "Tab bar to be recreated and show active file"
                );

                // Verify the tab for the active file is active
                expect(isTabActive(activeFile.fullPath)).toBe(true);

                // Switch to a different file
                await openTestFiles([testFilePath2]);

                // Get the new active file
                const newActiveFile = MainViewManager.getCurrentlyViewedFile();

                // Wait for tab bar to update with the new active file
                await awaitsFor(
                    function () {
                        return newActiveFile && isTabActive(newActiveFile.fullPath);
                    },
                    "Tab bar to update with new active file"
                );

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
                        `${description} to become active after tab click`
                    );

                    // Verify this tab is active and others are not
                    const allPaths = [testFilePath, testFilePath2, testFilePath3];
                    allPaths.forEach((path) => {
                        expect(isTabActive(path)).toBe(path === filePath);
                    });

                    // Verify the correct file is loaded in the editor
                    expect(MainViewManager.getCurrentlyViewedFile().fullPath).toBe(filePath);
                }
                // Wait for the tab bar to be properly loaded
                await awaitsFor(
                    function () {
                        return $("#phoenix-tab-bar").length > 0 && getTabCount() === 3;
                    },
                    "Tab bar to be properly loaded with all tabs"
                );

                // Wait for the third file to become active
                await awaitsFor(
                    function () {
                        return (
                            isTabActive(testFilePath3) &&
                            MainViewManager.getCurrentlyViewedFile() &&
                            MainViewManager.getCurrentlyViewedFile().fullPath === testFilePath3
                        );
                    },
                    "Third file to become active"
                );

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
                const testFiles = await createTestFiles(15, "overflow-test", "// Overflow test file");

                // Open all the test files
                await openTestFiles(testFiles);

                // Wait for all tabs to appear
                await waitForTabs(testFiles);

                // Wait for the overflow button to appear
                await awaitsFor(
                    function () {
                        return isOverflowButtonVisible();
                    },
                    "Overflow button to appear"
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
                await closeTestFiles(testFiles);
            });

            it("should display dropdown with hidden tabs when overflow button is clicked", async function () {
                // Create several test files to ensure overflow
                const testFiles = await createTestFiles(15, "overflow-test", "// Overflow test file");

                // Open all the test files
                await openTestFiles(testFiles);

                // Wait for all tabs to appear
                await waitForTabs(testFiles);

                // Wait for the overflow button to appear
                await awaitsFor(
                    function () {
                        return isOverflowButtonVisible();
                    },
                    "Overflow button to appear"
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
                    "Overflow dropdown to appear"
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
                    "Overflow dropdown to disappear"
                );

                // Clean up - close all the test files
                await closeTestFiles(testFiles);
            });

            it("should make tab visible and file active when clicking on item in overflow dropdown", async function () {
                // Create several test files to ensure overflow
                const testFiles = await createTestFiles(15, "overflow-test", "// Overflow test file");

                // Open all the test files
                await openTestFiles(testFiles);

                // Wait for all tabs to appear
                await waitForTabs(testFiles);

                // Wait for the overflow button to appear
                await awaitsFor(
                    function () {
                        return isOverflowButtonVisible();
                    },
                    "Overflow button to appear"
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
                    "Overflow dropdown to appear"
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
                    "Hidden file to become active after dropdown item click"
                );

                // Verify the file is active
                expect(isTabActive(testHiddenFile)).toBe(true);
                expect(MainViewManager.getCurrentlyViewedFile().fullPath).toBe(testHiddenFile);

                // Verify the tab is now visible (scrolled into view)
                await awaitsFor(
                    function () {
                        return isTabVisible(testHiddenFile);
                    },
                    "Tab to become visible after dropdown item click"
                );

                expect(isTabVisible(testHiddenFile)).toBe(true);

                // Clean up - close all the test files
                await closeTestFiles(testFiles);
            });

            it("should scroll tab bar to make selected file visible when selecting from working set", async function () {
                // Create several test files to ensure overflow
                const testFiles = await createTestFiles(15, "overflow-test", "// Overflow test file");

                // Open all the test files
                await openTestFiles(testFiles);

                // Wait for all tabs to appear
                await waitForTabs(testFiles);

                // Wait for the overflow button to appear
                await awaitsFor(
                    function () {
                        return isOverflowButtonVisible();
                    },
                    "Overflow button to appear"
                );

                // Get the list of hidden tabs
                const hiddenFiles = testFiles.filter((filePath) => !isTabVisible(filePath));
                expect(hiddenFiles.length).toBeGreaterThan(0);

                // Select a hidden file to test
                const testHiddenFile = hiddenFiles[0];

                // Verify the tab is not visible initially
                expect(isTabVisible(testHiddenFile)).toBe(false);

                // Select the file directly from the working set (not using the overflow dropdown)
                await awaitsForDone(
                    CommandManager.execute(Commands.FILE_OPEN, { fullPath: testHiddenFile }),
                    "Open hidden file from working set"
                );

                // Wait for the file to become active
                await awaitsFor(
                    function () {
                        return (
                            isTabActive(testHiddenFile) &&
                            MainViewManager.getCurrentlyViewedFile().fullPath === testHiddenFile
                        );
                    },
                    "Hidden file to become active after selection from working set"
                );

                // Verify the file is active
                expect(isTabActive(testHiddenFile)).toBe(true);
                expect(MainViewManager.getCurrentlyViewedFile().fullPath).toBe(testHiddenFile);

                // Verify the tab is now visible (scrolled into view)
                await awaitsFor(
                    function () {
                        return isTabVisible(testHiddenFile);
                    },
                    "Tab to become visible after selection from working set"
                );

                expect(isTabVisible(testHiddenFile)).toBe(true);

                // Clean up - close all the test files
                await closeTestFiles(testFiles);
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
                    "Tab to appear"
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
                    "Tab to appear"
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
                    "Tab to appear"
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
                    "Dirty indicator to appear"
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
                    "Dirty indicator to disappear"
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
                    "Both duplicate tabs to appear"
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
                    "Tab to appear"
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

                // Wait for the tabs to update with Git status
                await awaitsFor(
                    function () {
                        return hasGitStatus(testFilePath) && hasGitStatus(testFilePath2);
                    },
                    "Tabs to update with Git status"
                );

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
                    "Tab to appear"
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
                    "Tab to appear"
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
                cancelSaveDialog();

                // Wait for the tab to disappear
                await awaitsFor(
                    function () {
                        return !tabExists(testFilePath);
                    },
                    "Tab to disappear"
                );

                // Restore the original execute function
                CommandManager.execute = executeOriginal;

                // Verify the FILE_CLOSE command was called with the correct file
                expect(fileCloseCalled).toBe(true);
                expect(fileClosePathArg).toBe(testFilePath);
            });
        });

        describe("Context Menu", function () {
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
                    "All tabs to appear"
                );
            });

            /**
             * Helper function to get the context menu element
             * @returns {jQuery} - The context menu element
             */
            function getContextMenu() {
                return $(".tabbar-context-menu");
            }

            it("should open context menu when right-clicking on a tab", async function () {
                // Get the tab element
                const $tab = getTab(testFilePath);
                expect($tab.length).toBe(1);

                // Simulate a right-click (contextmenu) event on the tab
                $tab.trigger("contextmenu", {
                    pageX: 100,
                    pageY: 100
                });

                // Wait for the context menu to appear
                await awaitsFor(
                    function () {
                        return getContextMenu().length > 0;
                    },
                    "Context menu to appear"
                );

                // Verify the context menu is visible
                expect(getContextMenu().length).toBe(1);
                expect(getContextMenu().is(":visible")).toBe(true);

                // Clean up - close the context menu by clicking elsewhere
                $("body").click();

                // Wait for the context menu to disappear
                await awaitsFor(
                    function () {
                        return getContextMenu().length === 0;
                    },
                    "Context menu to disappear"
                );
            });

            it("should close the tab when selecting 'Close Tab' from context menu", async function () {
                // Get the tab element
                const $tab = getTab(testFilePath);

                // Right-click on the tab to open context menu
                $tab.trigger("contextmenu", {
                    pageX: 100,
                    pageY: 100
                });

                // Wait for context menu to appear
                await awaitsFor(
                    function () {
                        return getContextMenu().length > 0;
                    },
                    "Context menu to appear"
                );

                // Find and click the "Close Tab" option
                const $closeTabOption = getContextMenu()
                    .find("a.stylesheet-link")
                    .filter(function () {
                        return $(this).text().trim() === Strings.CLOSE_TAB;
                    });
                expect($closeTabOption.length).toBe(1);
                $closeTabOption.click();

                // Cancel the save dialog if it appears
                cancelSaveDialog();

                // Verify the tab is closed
                await awaitsFor(
                    function () {
                        return !tabExists(testFilePath);
                    },
                    "Tab to be closed"
                );
            });

            it("should close tabs to the right when selecting 'Close tabs to the right' from context menu", async function () {
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
                    "All tabs to appear"
                );

                // Verify all three tabs exist
                expect(tabExists(testFilePath)).toBe(true);
                expect(tabExists(testFilePath2)).toBe(true);
                expect(tabExists(testFilePath3)).toBe(true);

                // Get the first tab element
                const $tab = getTab(testFilePath);

                // Right-click on the first tab to open context menu
                $tab.trigger("contextmenu", {
                    pageX: 100,
                    pageY: 100
                });

                // Wait for context menu to appear
                await awaitsFor(
                    function () {
                        return getContextMenu().length > 0;
                    },
                    "Context menu to appear"
                );

                // Find and click the "Close tabs to the right" option
                const $closeTabsToRightOption = getContextMenu()
                    .find("a.stylesheet-link")
                    .filter(function () {
                        return $(this).text().trim() === Strings.CLOSE_TABS_TO_THE_RIGHT;
                    });
                expect($closeTabsToRightOption.length).toBe(1);
                $closeTabsToRightOption.click();

                // Cancel any save dialogs that might appear
                cancelSaveDialog();

                // Verify tabs to the right are closed
                await awaitsFor(
                    function () {
                        return tabExists(testFilePath) && !tabExists(testFilePath2) && !tabExists(testFilePath3);
                    },
                    "Tabs to the right to be closed"
                );

                // Verify only the first tab remains
                expect(tabExists(testFilePath)).toBe(true);
                expect(tabExists(testFilePath2)).toBe(false);
                expect(tabExists(testFilePath3)).toBe(false);
                expect(getTabCount()).toBe(1);
            });

            it("should close tabs to the left when selecting 'Close tabs to the left' from context menu", async function () {
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
                    "All tabs to appear"
                );

                // Verify all three tabs exist
                expect(tabExists(testFilePath)).toBe(true);
                expect(tabExists(testFilePath2)).toBe(true);
                expect(tabExists(testFilePath3)).toBe(true);

                // Get the third tab element
                const $tab = getTab(testFilePath3);

                // Right-click on the third tab to open context menu
                $tab.trigger("contextmenu", {
                    pageX: 100,
                    pageY: 100
                });

                // Wait for context menu to appear
                await awaitsFor(
                    function () {
                        return getContextMenu().length > 0;
                    },
                    "Context menu to appear"
                );

                // Find and click the "Close tabs to the left" option
                const $closeTabsToLeftOption = getContextMenu()
                    .find("a.stylesheet-link")
                    .filter(function () {
                        return $(this).text().trim() === Strings.CLOSE_TABS_TO_THE_LEFT;
                    });
                expect($closeTabsToLeftOption.length).toBe(1);
                $closeTabsToLeftOption.click();

                // Cancel any save dialogs that might appear
                cancelSaveDialog();

                // Verify tabs to the left are closed
                await awaitsFor(
                    function () {
                        return !tabExists(testFilePath) && !tabExists(testFilePath2) && tabExists(testFilePath3);
                    },
                    "Tabs to the left to be closed"
                );

                // Verify only the third tab remains
                expect(tabExists(testFilePath)).toBe(false);
                expect(tabExists(testFilePath2)).toBe(false);
                expect(tabExists(testFilePath3)).toBe(true);
                expect(getTabCount()).toBe(1);
            });

            it("should close saved tabs when selecting 'Close saved tabs' from context menu", async function () {
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
                    "All tabs to appear"
                );

                // Verify all three tabs exist
                expect(tabExists(testFilePath)).toBe(true);
                expect(tabExists(testFilePath2)).toBe(true);
                expect(tabExists(testFilePath3)).toBe(true);

                // Make the second file dirty
                const doc2 = DocumentManager.getOpenDocumentForPath(testFilePath2);
                doc2.setText("// Modified content");

                // Wait for the dirty indicator to appear
                await awaitsFor(
                    function () {
                        return isTabDirty(testFilePath2);
                    },
                    "Dirty indicator to appear"
                );

                // Verify the second tab is dirty
                expect(isTabDirty(testFilePath2)).toBe(true);

                // Get any tab element (we'll use the first)
                const $tab = getTab(testFilePath);

                // Right-click on the tab to open context menu
                $tab.trigger("contextmenu", {
                    pageX: 100,
                    pageY: 100
                });

                // Wait for context menu to appear
                await awaitsFor(
                    function () {
                        return getContextMenu().length > 0;
                    },
                    "Context menu to appear"
                );

                // Find and click the "Close saved tabs" option
                const $closeSavedTabsOption = getContextMenu()
                    .find("a.stylesheet-link")
                    .filter(function () {
                        return $(this).text().trim() === Strings.CLOSE_SAVED_TABS;
                    });
                expect($closeSavedTabsOption.length).toBe(1);
                $closeSavedTabsOption.click();

                // Cancel any save dialogs that might appear
                cancelSaveDialog();

                // Verify only the dirty tab remains
                await awaitsFor(
                    function () {
                        return !tabExists(testFilePath) && tabExists(testFilePath2) && !tabExists(testFilePath3);
                    },
                    "Saved tabs to be closed"
                );

                expect(tabExists(testFilePath)).toBe(false);
                expect(tabExists(testFilePath2)).toBe(true);
                expect(tabExists(testFilePath3)).toBe(false);
                expect(getTabCount()).toBe(1);
                expect(isTabDirty(testFilePath2)).toBe(true);

                // Clean up - revert changes to the second file
                doc2.setText("// Test file 2 for TabBar");
                await awaitsForDone(
                    CommandManager.execute(Commands.FILE_SAVE, { doc: doc2 }),
                    "Save file with original content"
                );
            });

            it("should close all tabs when selecting 'Close all tabs' from context menu", async function () {
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
                    "All tabs to appear"
                );

                // Verify all three tabs exist
                expect(tabExists(testFilePath)).toBe(true);
                expect(tabExists(testFilePath2)).toBe(true);
                expect(tabExists(testFilePath3)).toBe(true);

                // Get any tab element (we'll use the first)
                const $tab = getTab(testFilePath);

                // Right-click on the tab to open context menu
                $tab.trigger("contextmenu", {
                    pageX: 100,
                    pageY: 100
                });

                // Wait for context menu to appear
                await awaitsFor(
                    function () {
                        return getContextMenu().length > 0;
                    },
                    "Context menu to appear"
                );

                // Find and click the "Close all tabs" option
                const $closeAllTabsOption = getContextMenu()
                    .find("a.stylesheet-link")
                    .filter(function () {
                        return $(this).text().trim() === Strings.CLOSE_ALL_TABS;
                    });
                expect($closeAllTabsOption.length).toBe(1);
                $closeAllTabsOption.click();

                // Cancel any save dialogs that might appear
                cancelSaveDialog();

                // Verify all tabs are closed
                await awaitsFor(
                    function () {
                        return !tabExists(testFilePath) && !tabExists(testFilePath2) && !tabExists(testFilePath3);
                    },
                    "All tabs to be closed"
                );

                expect(tabExists(testFilePath)).toBe(false);
                expect(tabExists(testFilePath2)).toBe(false);
                expect(tabExists(testFilePath3)).toBe(false);
                expect(getTabCount()).toBe(0);
            });
        });

        describe("Number of Tabs Preference", function () {
            beforeEach(async function () {
                // Enable the tab bar feature with default settings
                PreferencesManager.set("tabBar.options", { showTabBar: true, numberOfTabs: -1 });

                // Close all files to start with a clean state
                await testWindow.closeAllFiles();
            });

            afterEach(async function () {
                // Reset preferences to default
                PreferencesManager.set("tabBar.options", { showTabBar: true, numberOfTabs: -1 });
            });

            it("should show all tabs when numberOfTabs is set to -1", async function () {
                // Create several test files
                const testFiles = [];
                for (let i = 0; i < 10; i++) {
                    const filePath = SpecRunnerUtils.getTempDirectory() + `/number-test-${i}.js`;
                    testFiles.push(filePath);
                    await jsPromise(SpecRunnerUtils.createTextFile(filePath, `// Number test file ${i}`, FileSystem));
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
                    "All tabs to appear"
                );

                // Verify all tabs are shown
                expect(getTabCount()).toBe(testFiles.length);

                // Clean up - close all the test files
                for (const filePath of testFiles) {
                    const fileToClose = FileSystem.getFileForPath(filePath);
                    const promise = CommandManager.execute(Commands.FILE_CLOSE, { file: fileToClose });
                    cancelSaveDialog();
                    await awaitsForDone(promise, `Close file ${filePath}`);
                }
            });

            it("should limit the number of tabs shown when numberOfTabs is set to a positive value", async function () {
                // Set the preference to show only 5 tabs
                PreferencesManager.set("tabBar.options", { showTabBar: true, numberOfTabs: 5 });

                // Create several test files
                const testFiles = [];
                for (let i = 0; i < 10; i++) {
                    const filePath = SpecRunnerUtils.getTempDirectory() + `/number-test-${i}.js`;
                    testFiles.push(filePath);
                    await jsPromise(SpecRunnerUtils.createTextFile(filePath, `// Number test file ${i}`, FileSystem));
                }

                // Open all the test files
                for (const filePath of testFiles) {
                    await awaitsForDone(
                        CommandManager.execute(Commands.FILE_OPEN, { fullPath: filePath }),
                        `Open file ${filePath}`
                    );
                }

                // Wait for tabs to appear
                await awaitsFor(
                    function () {
                        return getTabCount() > 0;
                    },
                    "Tabs to appear"
                );

                // Verify only 5 tabs are shown
                expect(getTabCount()).toBe(5);

                // Clean up - close all the test files
                for (const filePath of testFiles) {
                    const fileToClose = FileSystem.getFileForPath(filePath);
                    const promise = CommandManager.execute(Commands.FILE_CLOSE, { file: fileToClose });
                    cancelSaveDialog();
                    await awaitsForDone(promise, `Close file ${filePath}`);
                }
            });

            it("should hide the tab bar when numberOfTabs is set to 0", async function () {
                // First open some files with the default setting
                const testFiles = [];
                for (let i = 0; i < 3; i++) {
                    const filePath = SpecRunnerUtils.getTempDirectory() + `/number-test-${i}.js`;
                    testFiles.push(filePath);
                    await jsPromise(SpecRunnerUtils.createTextFile(filePath, `// Number test file ${i}`, FileSystem));
                }

                // Open all the test files
                for (const filePath of testFiles) {
                    await awaitsForDone(
                        CommandManager.execute(Commands.FILE_OPEN, { fullPath: filePath }),
                        `Open file ${filePath}`
                    );
                }

                // Wait for tabs to appear
                await awaitsFor(
                    function () {
                        return getTabCount() > 0;
                    },
                    "Tabs to appear"
                );

                // Verify tab bar is visible
                expect($("#phoenix-tab-bar").is(":visible")).toBe(true);

                // Now set numberOfTabs to 0
                PreferencesManager.set("tabBar.options", { showTabBar: true, numberOfTabs: 0 });

                // Wait for tab bar to disappear
                await awaitsFor(
                    function () {
                        return !$("#phoenix-tab-bar").is(":visible");
                    },
                    "Tab bar to disappear"
                );

                // Verify tab bar is hidden
                expect($("#phoenix-tab-bar").is(":visible")).toBe(false);

                // Clean up - close all the test files
                for (const filePath of testFiles) {
                    const fileToClose = FileSystem.getFileForPath(filePath);
                    const promise = CommandManager.execute(Commands.FILE_CLOSE, { file: fileToClose });
                    cancelSaveDialog();
                    await awaitsForDone(promise, `Close file ${filePath}`);
                }
            });

            it("should apply numberOfTabs preference to both panes", async function () {
                // Set up split pane layout
                MainViewManager.setLayoutScheme(1, 2);

                // Set the preference to show only 3 tabs
                PreferencesManager.set("tabBar.options", { showTabBar: true, numberOfTabs: 3 });

                // Create test files for first pane
                const firstPaneFiles = [];
                for (let i = 0; i < 5; i++) {
                    const filePath = SpecRunnerUtils.getTempDirectory() + `/first-pane-${i}.js`;
                    firstPaneFiles.push(filePath);
                    await jsPromise(SpecRunnerUtils.createTextFile(filePath, `// First pane file ${i}`, FileSystem));
                }

                // Create test files for second pane
                const secondPaneFiles = [];
                for (let i = 0; i < 5; i++) {
                    const filePath = SpecRunnerUtils.getTempDirectory() + `/second-pane-${i}.js`;
                    secondPaneFiles.push(filePath);
                    await jsPromise(SpecRunnerUtils.createTextFile(filePath, `// Second pane file ${i}`, FileSystem));
                }

                // Open files in first pane
                for (const filePath of firstPaneFiles) {
                    await awaitsForDone(
                        CommandManager.execute(Commands.FILE_OPEN, { fullPath: filePath, paneId: "first-pane" }),
                        `Open file ${filePath} in first pane`
                    );
                }

                // Open files in second pane
                for (const filePath of secondPaneFiles) {
                    await awaitsForDone(
                        CommandManager.execute(Commands.FILE_OPEN, { fullPath: filePath, paneId: "second-pane" }),
                        `Open file ${filePath} in second pane`
                    );
                }

                // Wait for both tab bars to appear
                await awaitsFor(
                    function () {
                        return $("#phoenix-tab-bar").is(":visible") && $("#phoenix-tab-bar-2").is(":visible");
                    },
                    "Both tab bars to appear"
                );

                // Verify each pane shows only 3 tabs
                expect($("#phoenix-tab-bar").find(".tab").length).toBe(3);
                expect($("#phoenix-tab-bar-2").find(".tab").length).toBe(3);

                // Change preference to show all tabs
                PreferencesManager.set("tabBar.options", { showTabBar: true, numberOfTabs: -1 });

                // Wait for all tabs to appear
                await awaitsFor(
                    function () {
                        return (
                            $("#phoenix-tab-bar").find(".tab").length === 5 &&
                            $("#phoenix-tab-bar-2").find(".tab").length === 5
                        );
                    },
                    "All tabs to appear in both panes"
                );

                // Verify all tabs are shown in both panes
                expect($("#phoenix-tab-bar").find(".tab").length).toBe(5);
                expect($("#phoenix-tab-bar-2").find(".tab").length).toBe(5);

                // Change preference to hide tab bars
                PreferencesManager.set("tabBar.options", { showTabBar: true, numberOfTabs: 0 });

                // Wait for both tab bars to disappear
                await awaitsFor(
                    function () {
                        return !$("#phoenix-tab-bar").is(":visible") && !$("#phoenix-tab-bar-2").is(":visible");
                    },
                    "Both tab bars to disappear"
                );

                // Clean up - close all files and reset to single pane
                await testWindow.closeAllFiles();
                MainViewManager.setLayoutScheme(1, 1);
            });
        });

        describe("Split Panes", function () {
            beforeEach(async function () {
                // Enable the tab bar feature
                PreferencesManager.set("tabBar.options", { showTabBar: true, numberOfTabs: -1 });

                // Close all files to start with a clean state
                await testWindow.closeAllFiles();

                // Set up a horizontal split view (two columns)
                MainViewManager.setLayoutScheme(1, 2);
            });

            afterEach(async function () {
                // Reset to single pane layout
                MainViewManager.setLayoutScheme(1, 1);
            });

            it("should show tab bars in both panes when files are open in both", async function () {
                // Open a file in the first pane
                await awaitsForDone(
                    CommandManager.execute(Commands.FILE_OPEN, { fullPath: testFilePath, paneId: "first-pane" }),
                    "Open file in first pane"
                );

                // Open a different file in the second pane
                await awaitsForDone(
                    CommandManager.execute(Commands.FILE_OPEN, { fullPath: testFilePath2, paneId: "second-pane" }),
                    "Open file in second pane"
                );

                // Wait for both tab bars to appear
                await awaitsFor(
                    function () {
                        return isTabBarVisible("first-pane") && isTabBarVisible("second-pane");
                    },
                    "Both tab bars to appear"
                );

                // Verify both tab bars are visible
                expect(isTabBarVisible("first-pane")).toBe(true);
                expect(isTabBarVisible("second-pane")).toBe(true);

                // Verify each pane has the correct tab
                expect(tabExistsInPane(testFilePath, "first-pane")).toBe(true);
                expect(tabExistsInPane(testFilePath2, "second-pane")).toBe(true);
                expect(getPaneTabCount("first-pane")).toBe(1);
                expect(getPaneTabCount("second-pane")).toBe(1);
            });

            it("should hide tab bar in a pane with no files", async function () {
                // Open a file in the first pane only
                await awaitsForDone(
                    CommandManager.execute(Commands.FILE_OPEN, { fullPath: testFilePath, paneId: "first-pane" }),
                    "Open file in first pane"
                );

                // Wait for the first tab bar to appear
                await awaitsFor(
                    function () {
                        return isTabBarVisible("first-pane");
                    },
                    "First tab bar to appear"
                );

                // Verify first tab bar is visible and second is not
                expect(isTabBarVisible("first-pane")).toBe(true);
                expect(isTabBarVisible("second-pane")).toBe(false);

                // Verify the first pane has the correct tab
                expect(tabExistsInPane(testFilePath, "first-pane")).toBe(true);
                expect(getPaneTabCount("first-pane")).toBe(1);
            });

            it("should update tab bars when moving files between panes", async function () {
                // Open a file in the first pane
                await awaitsForDone(
                    CommandManager.execute(Commands.FILE_OPEN, { fullPath: testFilePath, paneId: "first-pane" }),
                    "Open file in first pane"
                );

                // Wait for the first tab bar to appear
                await awaitsFor(
                    function () {
                        return isTabBarVisible("first-pane");
                    },
                    "First tab bar to appear"
                );

                // Verify first tab bar is visible and second is not
                expect(isTabBarVisible("first-pane")).toBe(true);
                expect(isTabBarVisible("second-pane")).toBe(false);

                // Move the file to the second pane
                const fileObj = FileSystem.getFileForPath(testFilePath);
                MainViewManager.addToWorkingSet("second-pane", fileObj);

                // Remove from first pane
                await awaitsForDone(
                    CommandManager.execute(Commands.FILE_CLOSE, { file: fileObj, paneId: "first-pane" }),
                    "Close file in first pane"
                );

                // Wait for the tab to appear in the second pane and disappear from the first
                await awaitsFor(
                    function () {
                        return (
                            !tabExistsInPane(testFilePath, "first-pane") && tabExistsInPane(testFilePath, "second-pane")
                        );
                    },
                    "Tab to move to second pane"
                );

                // Verify the tab bars visibility has updated
                expect(isTabBarVisible("first-pane")).toBe(false);
                expect(isTabBarVisible("second-pane")).toBe(true);

                // Verify the tab is now in the second pane
                expect(tabExistsInPane(testFilePath, "first-pane")).toBe(false);
                expect(tabExistsInPane(testFilePath, "second-pane")).toBe(true);
                expect(getPaneTabCount("first-pane")).toBe(0);
                expect(getPaneTabCount("second-pane")).toBe(1);
            });

            it("should hide tab bar when closing all files in a pane", async function () {
                // Open files in both panes
                await awaitsForDone(
                    CommandManager.execute(Commands.FILE_OPEN, { fullPath: testFilePath, paneId: "first-pane" }),
                    "Open file in first pane"
                );
                await awaitsForDone(
                    CommandManager.execute(Commands.FILE_OPEN, { fullPath: testFilePath2, paneId: "second-pane" }),
                    "Open file in second pane"
                );

                // Wait for both tab bars to appear
                await awaitsFor(
                    function () {
                        return isTabBarVisible("first-pane") && isTabBarVisible("second-pane");
                    },
                    "Both tab bars to appear"
                );

                // Verify both tab bars are visible
                expect(isTabBarVisible("first-pane")).toBe(true);
                expect(isTabBarVisible("second-pane")).toBe(true);

                // Close the file in the second pane
                const fileToClose = FileSystem.getFileForPath(testFilePath2);
                const promise = CommandManager.execute(Commands.FILE_CLOSE, {
                    file: fileToClose,
                    paneId: "second-pane"
                });

                // Cancel the save dialog if it appears
                cancelSaveDialog();

                await awaitsForDone(promise, "Close file in second pane");

                // Wait for the second tab bar to disappear
                await awaitsFor(
                    function () {
                        return !isTabBarVisible("second-pane");
                    },
                    "Second tab bar to disappear"
                );

                // Verify first tab bar is still visible but second is not
                expect(isTabBarVisible("first-pane")).toBe(true);
                expect(isTabBarVisible("second-pane")).toBe(false);

                // Verify the tabs are in the correct panes
                expect(tabExistsInPane(testFilePath, "first-pane")).toBe(true);
                expect(tabExistsInPane(testFilePath2, "second-pane")).toBe(false);
                expect(getPaneTabCount("first-pane")).toBe(1);
                expect(getPaneTabCount("second-pane")).toBe(0);
            });

            it("should work correctly with vertical split layout", async function () {
                // Change to vertical split layout (2 rows, 1 column)
                MainViewManager.setLayoutScheme(2, 1);

                // Open a file in the first pane
                await awaitsForDone(
                    CommandManager.execute(Commands.FILE_OPEN, { fullPath: testFilePath, paneId: "first-pane" }),
                    "Open file in first pane"
                );

                // Open a different file in the second pane
                await awaitsForDone(
                    CommandManager.execute(Commands.FILE_OPEN, { fullPath: testFilePath2, paneId: "second-pane" }),
                    "Open file in second pane"
                );

                // Wait for both tab bars to appear
                await awaitsFor(
                    function () {
                        return isTabBarVisible("first-pane") && isTabBarVisible("second-pane");
                    },
                    "Both tab bars to appear"
                );

                // Verify both tab bars are visible
                expect(isTabBarVisible("first-pane")).toBe(true);
                expect(isTabBarVisible("second-pane")).toBe(true);

                // Verify each pane has the correct tab
                expect(tabExistsInPane(testFilePath, "first-pane")).toBe(true);
                expect(tabExistsInPane(testFilePath2, "second-pane")).toBe(true);
                expect(getPaneTabCount("first-pane")).toBe(1);
                expect(getPaneTabCount("second-pane")).toBe(1);

                // Close the file in the second pane
                const fileToClose = FileSystem.getFileForPath(testFilePath2);
                const promise = CommandManager.execute(Commands.FILE_CLOSE, {
                    file: fileToClose,
                    paneId: "second-pane"
                });

                // Cancel the save dialog if it appears
                cancelSaveDialog();

                await awaitsForDone(promise, "Close file in second pane");

                // Wait for the second tab bar to disappear
                await awaitsFor(
                    function () {
                        return !isTabBarVisible("second-pane");
                    },
                    "Second tab bar to disappear"
                );

                // Verify first tab bar is still visible but second is not
                expect(isTabBarVisible("first-pane")).toBe(true);
                expect(isTabBarVisible("second-pane")).toBe(false);

                // Reset to horizontal split for other tests
                MainViewManager.setLayoutScheme(1, 2);
            });
        });

        describe("Tab Bar Scrolling", function () {
            let longTestFilePaths = [];

            beforeEach(async function () {
                // Create multiple test files to ensure scrolling is needed
                longTestFilePaths = [];
                for (let i = 1; i <= 15; i++) {
                    const filePath = SpecRunnerUtils.getTempDirectory() + `/scroll-test-file-${i}.js`;
                    longTestFilePaths.push(filePath);
                    await jsPromise(
                        SpecRunnerUtils.createTextFile(filePath, `// Test file ${i} for scrolling`, FileSystem)
                    );
                }

                // Open all files to create many tabs
                for (let filePath of longTestFilePaths) {
                    await awaitsForDone(
                        CommandManager.execute(Commands.FILE_OPEN, { fullPath: filePath }),
                        `Open ${filePath}`
                    );
                }

                // Wait for tabs to be rendered
                await awaitsFor(
                    function () {
                        return getTabCount() >= 15;
                    },
                    "All tabs to be created"
                );
            });

            afterEach(async function () {
                // Close all test files
                for (let filePath of longTestFilePaths) {
                    const fileObj = FileSystem.getFileForPath(filePath);
                    try {
                        await awaitsForDone(
                            CommandManager.execute(Commands.FILE_CLOSE, { file: fileObj }),
                            `Close ${filePath}`
                        );
                    } catch (e) {
                        // Ignore errors if file is already closed
                    }
                }
            });

            it("should scroll tab bar horizontally when mouse wheel is scrolled", function () {
                const $tabBar = $("#phoenix-tab-bar");
                expect($tabBar.length).toBe(1);

                // Get initial scroll position
                const initialScrollLeft = $tabBar.scrollLeft();

                // Create a wheel event for scrolling down (should scroll right)
                const wheelEventDown = $.Event("wheel");
                wheelEventDown.originalEvent = { deltaY: 100 }; // Positive deltaY = scroll down/right

                // Trigger the wheel event
                $tabBar.trigger(wheelEventDown);

                // Check that scroll position has changed to the right
                const scrollAfterDown = $tabBar.scrollLeft();
                expect(scrollAfterDown).toBeGreaterThan(initialScrollLeft);
                // Verify the scroll amount is proportional to deltaY (implementation multiplies by 2.5)
                expect(scrollAfterDown - initialScrollLeft).toBeCloseTo(100 * 2.5, 0);

                // Create a wheel event for scrolling up (should scroll left)
                const wheelEventUp = $.Event("wheel");
                wheelEventUp.originalEvent = { deltaY: -100 }; // Negative deltaY = scroll up/left

                // Trigger the wheel event
                $tabBar.trigger(wheelEventUp);

                // Check that scroll position has moved left from the previous position
                const scrollAfterUp = $tabBar.scrollLeft();
                expect(scrollAfterUp).toBeLessThan(scrollAfterDown);
                // Verify the scroll amount is proportional to deltaY
                expect(scrollAfterDown - scrollAfterUp).toBeCloseTo(100 * 2.5, 0);
            });

            it("should scroll tab bar with trackpad scrolling", function () {
                const $tabBar = $("#phoenix-tab-bar");
                expect($tabBar.length).toBe(1);

                // Get initial scroll position
                const initialScrollLeft = $tabBar.scrollLeft();

                // Create a wheel event simulating trackpad scrolling (smaller deltaY values)
                const trackpadEvent = $.Event("wheel");
                trackpadEvent.originalEvent = { deltaY: 25 }; // Smaller value typical of trackpad

                // Trigger the trackpad scrolling event multiple times
                for (let i = 0; i < 4; i++) {
                    $tabBar.trigger(trackpadEvent);
                }

                // Check that scroll position has changed
                const scrollAfterTrackpad = $tabBar.scrollLeft();
                expect(scrollAfterTrackpad).toBeGreaterThan(initialScrollLeft);
            });

            it("should scroll second pane tab bar when it exists", async function () {
                // Create the second pane first
                MainViewManager.setLayoutScheme(1, 2);

                // Wait for the layout to be created
                await awaitsFor(
                    function () {
                        return MainViewManager.getPaneIdList().length === 2;
                    },
                    "Second pane to be created"
                );

                // Open a file in the second pane to create the second tab bar
                await awaitsForDone(
                    CommandManager.execute(Commands.FILE_OPEN, {
                        fullPath: longTestFilePaths[0],
                        paneId: "second-pane"
                    }),
                    "Open file in second pane"
                );

                // Wait for second tab bar to appear
                await awaitsFor(
                    function () {
                        return $("#phoenix-tab-bar-2").length > 0;
                    },
                    "Second tab bar to appear"
                );

                const $tabBar2 = $("#phoenix-tab-bar-2");
                expect($tabBar2.length).toBe(1);

                // Open multiple files in second pane to enable scrolling
                for (let i = 1; i < 8; i++) {
                    await awaitsForDone(
                        CommandManager.execute(Commands.FILE_OPEN, {
                            fullPath: longTestFilePaths[i],
                            paneId: "second-pane"
                        }),
                        `Open file ${i} in second pane`
                    );
                }

                // Wait for tabs to be rendered in second pane
                await awaitsFor(
                    function () {
                        return $tabBar2.find(".tab").length >= 8;
                    },
                    "Tabs to be created in second pane"
                );

                // Get initial scroll position of second tab bar
                const initialScrollLeft = $tabBar2.scrollLeft();

                // Create a wheel event for scrolling
                const wheelEvent = $.Event("wheel");
                wheelEvent.originalEvent = { deltaY: 150 };

                // Trigger the wheel event on second tab bar
                $tabBar2.trigger(wheelEvent);

                // Check that scroll position has changed
                const scrollAfterWheel = $tabBar2.scrollLeft();
                expect(scrollAfterWheel).toBeGreaterThan(initialScrollLeft);
                // Verify the scroll amount is proportional to deltaY
                expect(scrollAfterWheel - initialScrollLeft).toBeCloseTo(150 * 2.5, 0);

                // Reset layout scheme back to single pane
                MainViewManager.setLayoutScheme(1, 1);
            });

            it("should calculate correct scroll amount based on deltaY", function () {
                const $tabBar = $("#phoenix-tab-bar");
                expect($tabBar.length).toBe(1);

                // Ensure the tab bar is scrollable by checking if scrollWidth > clientWidth
                if ($tabBar[0].scrollWidth <= $tabBar[0].clientWidth) {
                    // Skip test if tab bar is not scrollable
                    return;
                }

                // Set initial scroll position to middle to allow scrolling in both directions
                const maxScroll = $tabBar[0].scrollWidth - $tabBar[0].clientWidth;
                const midScroll = Math.floor(maxScroll / 2);
                $tabBar.scrollLeft(midScroll);

                // Test positive deltaY (scroll right)
                const initialScrollLeft = $tabBar.scrollLeft();
                const wheelEventRight = $.Event("wheel");
                wheelEventRight.originalEvent = { deltaY: 40 };
                $tabBar.trigger(wheelEventRight);

                const scrollAfterRight = $tabBar.scrollLeft();
                expect(scrollAfterRight).toBeGreaterThan(initialScrollLeft);
                expect(scrollAfterRight - initialScrollLeft).toBeCloseTo(40 * 2.5, 0);

                // Reset and test negative deltaY (scroll left)
                $tabBar.scrollLeft(midScroll);
                const wheelEventLeft = $.Event("wheel");
                wheelEventLeft.originalEvent = { deltaY: -40 };
                $tabBar.trigger(wheelEventLeft);

                const scrollAfterLeft = $tabBar.scrollLeft();
                expect(scrollAfterLeft).toBeLessThan(midScroll);
                expect(midScroll - scrollAfterLeft).toBeCloseTo(40 * 2.5, 0);
            });

            it("should not scroll beyond the scrollable bounds", function () {
                const $tabBar = $("#phoenix-tab-bar");
                expect($tabBar.length).toBe(1);

                // Get the maximum scrollable width
                const maxScrollLeft = $tabBar[0].scrollWidth - $tabBar[0].clientWidth;

                // Scroll far to the right
                $tabBar.scrollLeft(maxScrollLeft + 1000); // Try to scroll beyond max

                // Create a wheel event to scroll further right
                const wheelEventRight = $.Event("wheel");
                wheelEventRight.originalEvent = { deltaY: 500 }; // Large scroll right
                $tabBar.trigger(wheelEventRight);

                // Should not exceed maximum scroll (a small floating point tolerance)
                expect($tabBar.scrollLeft()).toBeLessThanOrEqual(maxScrollLeft + 1);

                // Scroll far to the left
                $tabBar.scrollLeft(-1000); // Try to scroll beyond minimum

                // Create a wheel event to scroll further left
                const wheelEventLeft = $.Event("wheel");
                wheelEventLeft.originalEvent = { deltaY: -500 }; // Large scroll left
                $tabBar.trigger(wheelEventLeft);

                // Should not go below 0 (a small floating point tolerance)
                expect($tabBar.scrollLeft()).toBeGreaterThanOrEqual(-1);
            });
        });
    });
});
