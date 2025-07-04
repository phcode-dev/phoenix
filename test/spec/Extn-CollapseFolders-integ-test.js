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

    describe("integration:Collapse Folders", function () {
        let testWindow, ProjectManager, FileSystem, $, testProjectPath, testProjectFolder;

        beforeAll(async function () {
            // Create the test window
            testWindow = await SpecRunnerUtils.createTestWindowAndRun();
            // Get reference to useful modules
            $ = testWindow.$;
            ProjectManager = testWindow.brackets.test.ProjectManager;
            FileSystem = testWindow.brackets.test.FileSystem;

            // Setup a test project folder with nested directories
            testProjectPath = SpecRunnerUtils.getTempDirectory() + "/collapse-folders-test";
            testProjectFolder = FileSystem.getDirectoryForPath(testProjectPath);

            // Ensure the test directory exists
            await SpecRunnerUtils.createTempDirectory();

            // Create test project structure
            await SpecRunnerUtils.ensureExistsDirAsync(testProjectPath);
            await SpecRunnerUtils.ensureExistsDirAsync(testProjectPath + "/folder1");
            await SpecRunnerUtils.ensureExistsDirAsync(testProjectPath + "/folder1/subfolder1");
            await SpecRunnerUtils.ensureExistsDirAsync(testProjectPath + "/folder2");
            await SpecRunnerUtils.ensureExistsDirAsync(testProjectPath + "/folder2/subfolder2");

            // Create some test files
            await jsPromise(SpecRunnerUtils.createTextFile(testProjectPath + "/file.js", "// Test file", FileSystem));
            await jsPromise(
                SpecRunnerUtils.createTextFile(testProjectPath + "/folder1/file1.js", "// Test file 1", FileSystem)
            );
            await jsPromise(
                SpecRunnerUtils.createTextFile(
                    testProjectPath + "/folder1/subfolder1/subfile1.js",
                    "// Test subfile 1",
                    FileSystem
                )
            );
            await jsPromise(
                SpecRunnerUtils.createTextFile(testProjectPath + "/folder2/file2.js", "// Test file 2", FileSystem)
            );
            await jsPromise(
                SpecRunnerUtils.createTextFile(
                    testProjectPath + "/folder2/subfolder2/subfile2.js",
                    "// Test subfile 2",
                    FileSystem
                )
            );

            // Load the test project
            await SpecRunnerUtils.loadProjectInTestWindow(testProjectPath);
        }, 30000);

        afterAll(async function () {
            testWindow = null;
            await SpecRunnerUtils.closeTestWindow();
            await SpecRunnerUtils.removeTempDirectory();
        }, 30000);

        /**
         * Helper function to open a folder in the project tree
         * @param {string} folderPath - The path of the folder to open
         */
        async function openFolder(folderPath) {
            const folderEntry = FileSystem.getDirectoryForPath(folderPath);
            // Call setDirectoryOpen without awaitsForDone since it doesn't return a promise
            ProjectManager._actionCreator.setDirectoryOpen(folderEntry.fullPath, true);

            // Wait for the folder to be opened in the UI
            await awaitsFor(
                function () {
                    const $folderNode = findDirectoryNode(folderPath);
                    return $folderNode && $folderNode.hasClass("jstree-open");
                },
                "Folder to be opened: " + folderPath,
                1000
            );
        }

        /**
         * Helper function to find a directory node in the project tree
         * @param {string} path - The path of the directory to find
         * @returns {jQuery|null} - The jQuery object for the directory node, or null if not found
         */
        function findDirectoryNode(path) {
            const dirName = path.split("/").pop();
            const $treeItems = $("#project-files-container li");
            let $result = null;

            $treeItems.each(function () {
                const $treeNode = $(this);
                if ($treeNode.children("a").text().trim() === dirName) {
                    $result = $treeNode;
                    return false; // Break the loop
                }
            });

            return $result;
        }

        /**
         * Helper function to check if a folder is open in the project tree
         * @param {string} folderPath - The path of the folder to check
         * @returns {boolean} - True if the folder is open, false otherwise
         */
        function isFolderOpen(folderPath) {
            const $folderNode = findDirectoryNode(folderPath);
            // If the folder node can't be found, it's definitely not open
            if (!$folderNode) {
                return false;
            }
            return $folderNode.hasClass("jstree-open");
        }

        describe("UI", function () {
            it("should have a collapse button in the project files header", async function () {
                // Check if the collapse button exists
                const $collapseBtn = $("#collapse-folders");
                expect($collapseBtn.length).toBe(1);

                // Check if the button has the collapse icons
                expect($collapseBtn.find(".collapse-icon").length).toBe(2);
            });

            it("should collapse all open folders when the collapse button is clicked", async function () {
                // Open some folders first
                await openFolder(testProjectPath + "/folder1");
                await openFolder(testProjectPath + "/folder2");

                // Verify folders are open
                expect(isFolderOpen(testProjectPath + "/folder1")).toBe(true);
                expect(isFolderOpen(testProjectPath + "/folder2")).toBe(true);

                // Click the collapse button
                $("#collapse-folders").click();

                // Wait for folders to be collapsed
                await awaitsFor(
                    function () {
                        return (
                            !isFolderOpen(testProjectPath + "/folder1") && !isFolderOpen(testProjectPath + "/folder2")
                        );
                    },
                    "Folders to be collapsed",
                    1000
                );

                // Verify folders are closed
                expect(isFolderOpen(testProjectPath + "/folder1")).toBe(false);
                expect(isFolderOpen(testProjectPath + "/folder2")).toBe(false);
            });

            it("should collapse nested folders when the collapse button is clicked", async function () {
                // Open folders with nested structure
                await openFolder(testProjectPath + "/folder1");
                await openFolder(testProjectPath + "/folder1/subfolder1");
                await openFolder(testProjectPath + "/folder2");
                await openFolder(testProjectPath + "/folder2/subfolder2");

                // Verify folders are open
                expect(isFolderOpen(testProjectPath + "/folder1")).toBe(true);
                expect(isFolderOpen(testProjectPath + "/folder1/subfolder1")).toBe(true);
                expect(isFolderOpen(testProjectPath + "/folder2")).toBe(true);
                expect(isFolderOpen(testProjectPath + "/folder2/subfolder2")).toBe(true);

                // Click the collapse button
                $("#collapse-folders").click();

                // Wait for all folders to be collapsed
                await awaitsFor(
                    function () {
                        return (
                            !isFolderOpen(testProjectPath + "/folder1") &&
                            !isFolderOpen(testProjectPath + "/folder1/subfolder1") &&
                            !isFolderOpen(testProjectPath + "/folder2") &&
                            !isFolderOpen(testProjectPath + "/folder2/subfolder2")
                        );
                    },
                    "All folders to be collapsed",
                    1000
                );

                // Verify all folders are closed
                expect(isFolderOpen(testProjectPath + "/folder1")).toBe(false);
                expect(isFolderOpen(testProjectPath + "/folder1/subfolder1")).toBe(false);
                expect(isFolderOpen(testProjectPath + "/folder2")).toBe(false);
                expect(isFolderOpen(testProjectPath + "/folder2/subfolder2")).toBe(false);
            });

            it("should do nothing when no folders are open", async function () {
                // Make sure all folders are closed
                $("#collapse-folders").click();
                await awaitsFor(
                    function () {
                        return (
                            !isFolderOpen(testProjectPath + "/folder1") && !isFolderOpen(testProjectPath + "/folder2")
                        );
                    },
                    "Folders to be collapsed",
                    1000
                );

                // Get the current state of the project tree
                const initialState = $("#project-files-container").html();

                // Click the collapse button again
                $("#collapse-folders").click();

                // Wait a bit to ensure any potential changes would have happened
                await awaits(300);

                // Verify the project tree hasn't changed
                expect($("#project-files-container").html()).toBe(initialState);
            });
        });
    });
});
