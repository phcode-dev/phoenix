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

/*global describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, awaitsFor, awaitsForDone */

define(function (require, exports, module) {
    const SpecRunnerUtils = require("spec/SpecRunnerUtils");

    const testPath = SpecRunnerUtils.getTestPath("/spec/ProjectManager-test-files");

    let ProjectManager, // loaded from brackets.test
        CommandManager, // loaded from brackets.test
        testWindow,
        brackets,
        $;

    describe("integration:CollapseFolders", function () {
        beforeAll(async function () {
            testWindow = await SpecRunnerUtils.createTestWindowAndRun();
            brackets = testWindow.brackets;
            ProjectManager = brackets.test.ProjectManager;
            CommandManager = brackets.test.CommandManager;
            $ = testWindow.$;

            await SpecRunnerUtils.loadProjectInTestWindow(testPath);
        }, 30000);

        afterAll(async function () {
            ProjectManager = null;
            CommandManager = null;
            testWindow = null;
            brackets = null;
            $ = null;
            await SpecRunnerUtils.closeTestWindow();
        }, 30000);

        afterEach(async function () {
            await testWindow.closeAllFiles();
        });

        it("Should create collapse button in project files header", function () {
            const $projectFilesHeader = $("#project-files-header");
            const $collapseBtn = $("#collapse-folders");

            expect($projectFilesHeader.length).toBe(1);
            expect($collapseBtn.length).toBe(1);
            expect($collapseBtn.parent()[0]).toBe($projectFilesHeader[0]);
        });

        it("Should have correct button structure and classes", function () {
            const $collapseBtn = $("#collapse-folders");
            const $icons = $collapseBtn.find("i.collapse-icon");

            expect($collapseBtn.hasClass("btn-alt-quiet")).toBe(true);
            expect($collapseBtn.attr("title")).toBe("Collapse All");
            expect($icons.length).toBe(2);
            expect($icons.eq(0).hasClass("fa-solid")).toBe(true);
            expect($icons.eq(0).hasClass("fa-chevron-down")).toBe(true);
            expect($icons.eq(1).hasClass("fa-solid")).toBe(true);
            expect($icons.eq(1).hasClass("fa-chevron-up")).toBe(true);
        });

        it("Should show button on sidebar hover", async function () {
            const $sidebar = $("#sidebar");
            const $collapseBtn = $("#collapse-folders");

            // Initially button should not have show class
            expect($collapseBtn.hasClass("show")).toBe(false);

            // Trigger mouseenter on sidebar
            $sidebar.trigger("mouseenter");

            await awaitsFor(
                function () {
                    return $collapseBtn.hasClass("show");
                },
                "Button should show on sidebar hover",
                1000
            );

            expect($collapseBtn.hasClass("show")).toBe(true);
        });

        it("Should hide button on sidebar mouse leave", async function () {
            const $sidebar = $("#sidebar");
            const $collapseBtn = $("#collapse-folders");

            // First show the button
            $sidebar.trigger("mouseenter");
            await awaitsFor(
                function () {
                    return $collapseBtn.hasClass("show");
                },
                "Button should show first",
                1000
            );

            // Then trigger mouseleave
            $sidebar.trigger("mouseleave");

            await awaitsFor(
                function () {
                    return !$collapseBtn.hasClass("show");
                },
                "Button should hide on sidebar mouse leave",
                1000
            );

            expect($collapseBtn.hasClass("show")).toBe(false);
        });

        it("Should have click handler attached", function () {
            const $collapseBtn = $("#collapse-folders");
            const events = $._data($collapseBtn[0], "events");

            expect(events).toBeTruthy();
            expect(events.click).toBeTruthy();
            expect(events.click.length).toBe(1);
        });

        function findTreeNode(fullPath) {
            const $treeItems = testWindow.$("#project-files-container li");
            let $result;

            const name = fullPath.split("/").pop();

            $treeItems.each(function () {
                const $treeNode = testWindow.$(this);
                if ($treeNode.children("a").text().trim() === name) {
                    $result = $treeNode;
                    return false; // break the loop
                }
            });
            return $result;
        }

        async function openFolder(folderPath) {
            const $treeNode = findTreeNode(folderPath);
            expect($treeNode).toBeTruthy();

            if (!$treeNode.hasClass("jstree-open")) {
                $treeNode.children("a").children("span").click();

                await awaitsFor(
                    function () {
                        return $treeNode.hasClass("jstree-open");
                    },
                    `Open folder ${folderPath}`,
                    2000
                );
            }
        }

        function isFolderOpen(folderPath) {
            const $treeNode = findTreeNode(folderPath);
            return $treeNode && $treeNode.hasClass("jstree-open");
        }

        function getOpenFolders() {
            const openFolders = [];
            testWindow.$("#project-files-container li.jstree-open").each(function () {
                const $node = testWindow.$(this);
                const folderName = $node.children("a").text().trim();
                if (folderName) {
                    openFolders.push(folderName);
                }
            });
            return openFolders;
        }

        it("Should collapse all open directories when clicked", async function () {
            // First, open some directories
            const directoryPath = testPath + "/directory";

            await openFolder("directory");

            // Verify the directory is open
            expect(isFolderOpen("directory")).toBe(true);

            // Show the collapse button by hovering over sidebar
            const $sidebar = $("#sidebar");
            const $collapseBtn = $("#collapse-folders");
            $sidebar.trigger("mouseenter");

            await awaitsFor(
                function () {
                    return $collapseBtn.hasClass("show");
                },
                "Button should show",
                1000
            );

            // Click the collapse button
            $collapseBtn.trigger("click");

            // Wait for directories to close
            await awaitsFor(
                function () {
                    return !isFolderOpen("directory");
                },
                "Directory should be closed after clicking collapse button",
                2000
            );

            // Verify the directory is now closed
            expect(isFolderOpen("directory")).toBe(false);
        });

        it("Should collapse multiple open directories when clicked", async function () {
            // Open multiple directories if they exist
            await openFolder("directory");

            // Verify directories are open
            expect(isFolderOpen("directory")).toBe(true);

            const initialOpenFolders = getOpenFolders();
            expect(initialOpenFolders.length).toBeGreaterThan(0);

            // Show the collapse button and click it
            const $sidebar = $("#sidebar");
            const $collapseBtn = $("#collapse-folders");
            $sidebar.trigger("mouseenter");

            await awaitsFor(
                function () {
                    return $collapseBtn.hasClass("show");
                },
                "Button should show",
                1000
            );

            $collapseBtn.trigger("click");

            // Wait for all directories to close
            await awaitsFor(
                function () {
                    return getOpenFolders().length === 0;
                },
                "All directories should be closed",
                2000
            );

            // Verify no directories are open
            expect(getOpenFolders().length).toBe(0);
        });

        it("Should handle click when no directories are open", function () {
            // Ensure no directories are open initially
            const openFolders = getOpenFolders();
            expect(openFolders.length).toBe(0);

            // Show the collapse button and click it
            const $sidebar = $("#sidebar");
            const $collapseBtn = $("#collapse-folders");
            $sidebar.trigger("mouseenter");

            // This should not throw an error
            expect(function () {
                $collapseBtn.trigger("click");
            }).not.toThrow();

            // Should still have no open folders
            expect(getOpenFolders().length).toBe(0);
        });

        it("Should work with nested directories", async function () {
            // Open a parent directory first
            await openFolder("directory");
            expect(isFolderOpen("directory")).toBe(true);

            // If there are subdirectories, try to open one
            // Note: This test assumes the test project has nested directories
            const $subdirs = testWindow.$("#project-files-container li.jstree-open li.jstree-closed");
            if ($subdirs.length > 0) {
                // Open a subdirectory if one exists
                $subdirs.first().children("a").children("span").click();

                await awaitsFor(
                    function () {
                        return $subdirs.first().hasClass("jstree-open");
                    },
                    "Open subdirectory",
                    2000
                );
            }

            const initialOpenCount = getOpenFolders().length;
            expect(initialOpenCount).toBeGreaterThan(0);

            // Show the collapse button and click it
            const $sidebar = $("#sidebar");
            const $collapseBtn = $("#collapse-folders");
            $sidebar.trigger("mouseenter");

            await awaitsFor(
                function () {
                    return $collapseBtn.hasClass("show");
                },
                "Button should show",
                1000
            );

            $collapseBtn.trigger("click");

            // Wait for all directories to close (including nested ones)
            await awaitsFor(
                function () {
                    return getOpenFolders().length === 0;
                },
                "All nested directories should be closed",
                2000
            );

            expect(getOpenFolders().length).toBe(0);
        });
    });
});
