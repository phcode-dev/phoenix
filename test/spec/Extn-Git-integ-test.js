/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 * Original work Copyright (c) 2012 - 2021 Adobe Systems Incorporated. All rights reserved.
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

/*global describe, it, expect, beforeEach, afterEach, awaitsForDone,beforeAll, awaitsFor */

define(function (require, exports, module) {

    if(!Phoenix.isNativeApp) {
        return;
    }

    let $, __PR, testWindow, ExtensionLoader, Menus, Commands, CommandManager, EditorManager,
        SpecRunnerUtils     = require("spec/SpecRunnerUtils"),
        nonGitReadOnlyTestFolder = SpecRunnerUtils.getTestPath("/spec/LowLevelFileIO-test-files");

    let testPathGit;

    function forCommandEnabled(commandID, enabled = true) {
        const command = CommandManager.get(commandID);
        if(!commandID){
            throw new Error(`no such command ${commandID}`);
        }
        return awaitsFor(()=>{
            return command && command.getEnabled() === enabled;
        }, `Git ${commandID} to be ${enabled? "enabled" : "disabled"}`);
    }

    async function showGitPanel() {
        if(!$("#git-panel").is(":visible")) {
            await __PR.execCommand(Commands.CMD_GIT_TOGGLE_PANEL);
        }
    }

    describe("LegacyInteg:Git Workflows test", function () {

        beforeAll(async function () {
            testWindow = await SpecRunnerUtils.createTestWindowAndRun({forceReload: true});
            // Load module instances from brackets.test
            $ = testWindow.$;
            __PR = testWindow.__PR;
            Menus = testWindow.brackets.test.Menus;
            ExtensionLoader = testWindow.brackets.test.ExtensionLoader;
            Commands = testWindow.brackets.test.Commands;
            CommandManager = testWindow.brackets.test.CommandManager;
            EditorManager = testWindow.brackets.test.EditorManager;
            testPathGit = await SpecRunnerUtils.getTempTestDirectory("/spec/EditorCommandHandlers-test-files");

            await SpecRunnerUtils.loadProjectInTestWindow(testPathGit);
            await ExtensionLoader._loadDefaultExtension("Git");
            await awaitsFor(()=>{
                return !!Menus.getSubMenu(Menus.SubMenuIds.GIT_SUB_MENU);
            }, "Git menus to be present", 10000);
        }, 30000);

        describe("Init repo and do all tests in order", function () {
            // ordering of tests in this matters and it may not run as individual tests.
            let $gitPanel, $gitIcon;
            beforeAll(async function () {
                $gitPanel = $("#git-panel");
                $gitIcon = $("#git-toolbar-icon");
            });

            async function verifyRepoInNonGitState(isNonGit = true) {
                await forCommandEnabled(Commands.CMD_GIT_INIT, isNonGit);
                await forCommandEnabled(Commands.CMD_GIT_CLONE, isNonGit);
                await forCommandEnabled(Commands.CMD_GIT_SETTINGS_COMMAND_ID, true);
                await forCommandEnabled(Commands.CMD_GIT_TOGGLE_PANEL, true);
                // others are disabled
                await forCommandEnabled(Commands.CMD_GIT_REFRESH, !isNonGit);
                await forCommandEnabled(Commands.CMD_GIT_REFRESH, !isNonGit);
                await forCommandEnabled(Commands.CMD_GIT_FETCH, !isNonGit);
                await forCommandEnabled(Commands.CMD_GIT_PULL, !isNonGit);
                await forCommandEnabled(Commands.CMD_GIT_PUSH, !isNonGit);
            }

            async function verifyGitPanelIcons(isGitProject) {
                expect($gitPanel.find(".git-init").is(":visible")).toBe(!isGitProject);
                expect($gitPanel.find(".git-clone").is(":visible")).toBe(!isGitProject);
                // in non git repos the git buttons are not visible
                expect($gitPanel.find(".git-commit").is(":visible")).toBe(isGitProject);
                expect($gitPanel.find(".git-prev-gutter").is(":visible")).toBe(isGitProject);
                expect($gitPanel.find(".git-file-history").is(":visible")).toBe(isGitProject);
                expect($gitPanel.find(".git-right-icons").is(":visible")).toBe(isGitProject);
            }

            it("should only git settings, init and clone commands be enabled in non-git repos", async function () {
                await verifyRepoInNonGitState();
            });

            it("Should Git icon be hidden in non-git repo", async function () {
                expect($gitIcon.is(":visible")).toBeFalse();
            });

            it("Should be able to show git panel in non-git repo, and icon will come up", async function () {
                await __PR.execCommand(Commands.CMD_GIT_TOGGLE_PANEL);
                expect($gitPanel.is(":visible")).toBeTrue();
                expect($gitIcon.is(":visible")).toBeTrue();
                await verifyGitPanelIcons(false);
            });

            it("Should be able to initialize git repo", async function () {
                await showGitPanel();
                $gitPanel.find(".git-init").click();
                await awaitsFor(()=>{
                    return $gitPanel.find(".modified-file").length === 4;
                }, "4 files to be added in modified files list", 10000);
                expect($(".check-all").prop("checked")).toBeFalse();
            });

            function clickOpenFile(elementNumber) {
                const $elements = $gitPanel.find(".modified-file"); // Get all .modified-file elements
                if (elementNumber >= 0 && elementNumber < $elements.length) {
                    $($elements[elementNumber]).trigger("mousedown"); // Trigger mousedown on the specified element
                } else {
                    console.error("Invalid element number:", elementNumber); // Handle invalid index
                }
            }

            it("Should clicking on file in git panel should open it", async function () {
                await showGitPanel();
                clickOpenFile(0);
                await awaitsFor(()=>{
                    const editor = EditorManager.getActiveEditor();
                    if(!editor){
                        return false;
                    }
                    return editor.document.file.fullPath.endsWith(".gitignore");
                }, "first file to open");
            });

            it("should git username and email be valid", async function () {
                const tempUser = "phcodeTestGitUser";
                const tempEmail = "phcodeTestGitUser@gmail.com";
                // username validate
                let currentVal = await testWindow.phoenixGitEvents.Git.getConfig("user.name");
                if(!currentVal) {
                    await testWindow.phoenixGitEvents.Git.setConfig("user.name", tempUser, true);
                    currentVal = await testWindow.phoenixGitEvents.Git.getConfig("user.name");
                    expect(currentVal).toBe(tempUser);
                } else {
                    expect(currentVal).toBeDefined();
                }
                // email validate
                currentVal = await testWindow.phoenixGitEvents.Git.getConfig("user.email");
                if(!currentVal) {
                    await testWindow.phoenixGitEvents.Git.setConfig("user.email", tempEmail, true);
                    currentVal = await testWindow.phoenixGitEvents.Git.getConfig("user.email");
                    expect(currentVal).toBe(tempEmail);
                } else {
                    expect(currentVal).toBeDefined();
                }
            });

            async function commitAllBtnClick() {
                await showGitPanel();
                if(!$(".check-all").prop("checked")) {
                    $(".check-all").click();
                    await awaitsFor(()=>{
                        const checkboxes = document.querySelectorAll(".check-one");
                        const commitIsDisabled = $(".git-commit").prop("disabled");
                        return Array.from(checkboxes).every(checkbox => checkbox.checked) && !commitIsDisabled;
                    }, "All files to be staged for commit", 10000);
                }
                $(".git-commit").click();
                await __PR.waitForModalDialog("#git-commit-dialog");
            }

            async function commmitDlgWithMessage(message) {
                $("input[name='commit-message']").val(message);
                __PR.clickDialogButtonID(__PR.Dialogs.DIALOG_BTN_OK);
                await __PR.waitForModalDialogClosed("#git-commit-dialog");
            }

            function expectTextToContain(srcText, list) {
                const nonEmptyLines = srcText
                    .split("\n")             // Split the text into lines
                    .map(line => line.trim()) // Trim each line
                    .filter(line => line !== "").join("\n"); // Remove empty lines
                for(const text of list) {
                    expect(nonEmptyLines).toContain(text);
                }
            }

            it("Should be able to stage, show commit dialog and cancel dialog on initialized git repo", async function () {
                await commitAllBtnClick();
                __PR.clickDialogButtonID(__PR.Dialogs.DIALOG_BTN_CANCEL);
                await __PR.waitForModalDialogClosed("#git-commit-dialog");
            });

            it("Should git dialog show commit diff and lint errors", async function () {
                await commitAllBtnClick();

                // check lint errors
                await awaitsFor(()=>{
                    return $(".lint-errors").text().includes("test.html");
                }, "lint errors to be shown", 10000);
                expect($(".lint-errors").text()).toContain("<html> is missing required \"lang\" attribute");
                expect($(".lint-errors").is(":visible")).toBeTrue();

                // check commit diff
                await awaitsFor(()=>{
                    return $(".commit-diff").text().includes("test.html");
                }, "commit-diff to be shown", 10000);
                expectTextToContain($(".commit-diff").text(), [
                    ".gitignore", "test.css", "test.html", "test.js",
                    "/node_modules/", "color:", `<head>`,
                    `console.log`
                ]);

                // dismiss dialog
                __PR.clickDialogButtonID(__PR.Dialogs.DIALOG_BTN_CANCEL);
                await __PR.waitForModalDialogClosed("#git-commit-dialog");
            });

            it("Should be able to show individual file diff from panel", async function () {
                $($(".btn-git-diff")[0]).click();

                // check commit diff
                await awaitsFor(()=>{
                    return $(".commit-diff").text().includes("gitignore");
                }, "commit-diff to be shown", 10000);
                expectTextToContain($(".commit-diff").text(), [
                    "node_modules"
                ]);
                expectTextToContain($(".dialog-title").text(), [
                    ".gitignore"
                ]);

                // dismiss dialog
                __PR.clickDialogButtonID("close");
                await __PR.waitForModalDialogClosed("#git-diff-dialog");
            });

            it("Should be able to commit the files", async function () {
                await commitAllBtnClick();
                await commmitDlgWithMessage("first commit");
                await awaitsFor(()=>{
                    return $(".git-edited-list tr").length === 0;
                }, "no files to be commited", 10000);
            });

            it("Should editing new file and saving add it to changed files list", async function () {
                __PR.setCursors(["5:15"]);
                __PR.typeAtCursor("\nhelloIG");
                await __PR.saveActiveFile();
                await awaitsFor(()=>{
                    return $(".git-edited-list tr").length === 1;
                }, "new edited file to come up in status", 10000);

                // now commit
                await commitAllBtnClick();
                await commmitDlgWithMessage("second commit");
                await awaitsFor(()=>{
                    return $(".git-edited-list tr").length === 0;
                }, "no files to be commited", 10000);
            });

            async function gotoChange(line, direction) {
                await awaitsFor(()=>{
                    $(`.git-${direction}-gutter`).click();
                    const editor = EditorManager.getActiveEditor();
                    return editor.getCursorPos().line === line;
                }, `should go to previous change ${line}`, 10000, 100);
            }

            it("Should be able to navigate to next and previous changes and then discard changes", async function () {
                __PR.setCursors(["1:1"]);
                __PR.typeAtCursor("changeLine1\n");
                __PR.setCursors(["4:1"]);
                __PR.typeAtCursor("changeLine2\n");
                await __PR.saveActiveFile();
                await awaitsFor(()=>{
                    return $(".git-edited-list tr").length === 1;
                }, "new edited file to come up in status", 10000);

                // next previous buttons tests
                await gotoChange(3, "prev");
                await gotoChange(0, "prev");
                await gotoChange(3, "next");

                // discard all changes with panel button
                $(".btn-git-undo").click();
                __PR.clickDialogButtonID(__PR.Dialogs.DIALOG_BTN_OK);
                await awaitsFor(()=>{
                    return $(".git-edited-list tr").length === 0;
                }, "no files to be commited", 10000);
            });

            async function waitForHistoryVisible(visible) {
                await awaitsFor(() => {
                    return $gitPanel.find("#git-history-list").is(":visible") === visible;
                }, `History list to be visible: ${visible}`);
            }

            function _verifyHistoryCommits() {
                const $historyList = $gitPanel.find("#git-history-list");

                // Check if the first and second commits are displayed
                const $historyCommits = $historyList.find(".commit-subject");
                expect($historyCommits.length).toBeGreaterThanOrEqual(2);

                // Verify the content of the first and second commits
                expect($historyCommits.eq(0).text().trim()).toBe("second commit");
                expect($historyCommits.eq(1).text().trim()).toBe("first commit");
            }

            async function testHistoryToggle(whichHistory) {
                const $historyToggleButton = $gitPanel.find(whichHistory);

                $historyToggleButton.trigger("click");
                await waitForHistoryVisible(true);

                _verifyHistoryCommits();

                $historyToggleButton.trigger("click");
                await waitForHistoryVisible(false);
            }

            it("should show history with first and second commit on clicking global history", async () => {
                await testHistoryToggle(".git-history-toggle");
            });

            it("should show history with first and second commit on clicking global history", async () => {
                await testHistoryToggle(".git-file-history");
            });

            it("should show history commands work as expected", async () => {
                await waitForHistoryVisible(false);

                await __PR.execCommand(Commands.CMD_GIT_HISTORY_GLOBAL);
                await waitForHistoryVisible(true);
                _verifyHistoryCommits();
                await __PR.execCommand(Commands.CMD_GIT_TOGGLE_PANEL);
                await waitForHistoryVisible(false);

                await __PR.execCommand(Commands.CMD_GIT_HISTORY_FILE);
                await waitForHistoryVisible(true);
                _verifyHistoryCommits();
            });

            async function waitForHistoryViewerVisible(visible) {
                await awaitsFor(() => {
                    return $("#history-viewer").is(":visible") === visible;
                }, `History viewer to be visible: ${visible}`);
            }

            async function waitForBranchDropdownVisible(visible) {
                await awaitsFor(() => {
                    return $("#git-branch-dropdown-toggle").is(":visible") === visible;
                }, `Branch Dropdown to be visible: ${visible}`);
            }

            async function waitForGitToolbarIconVisible(visible) {
                await awaitsFor(() => {
                    return $gitIcon.is(":visible") === visible;
                }, `Git icon to be visible: ${visible}`);
            }

            it("should show the history viewer when clicking the first commit row and dismiss it on clicking again", async () => {
                const $historyToggleButton = $gitPanel.find(".git-history-toggle");
                $historyToggleButton.trigger("click");
                await waitForHistoryVisible(true); // Ensure the history list is visible
                const $historyList = $gitPanel.find("#git-history-list");
                const $commitRow = $historyList.find(".history-commit").eq(1);

                // Ensure the commit row exists
                expect($commitRow.length).toBe(1);

                // Click the row to show the history viewer
                $commitRow.trigger("click");
                await waitForHistoryViewerVisible(true);

                // Verify that the history viewer shows the correct commit
                const $historyViewer = $("#editor-holder .git");
                await awaitsFor(() => {
                    return $historyViewer.find(".commit-title").text().trim().includes("first commit");
                }, `History viewer to have commit detail`);

                // Click the row again to dismiss the history viewer
                $commitRow.trigger("click");
                await waitForHistoryViewerVisible(false);
            });

            it("should be able to switch history", async () => {
                const $historyList = $gitPanel.find("#git-history-list");

                let $commitRow = $historyList.find(".history-commit").eq(1);
                $commitRow.trigger("click");
                await waitForHistoryViewerVisible(true);

                // Verify that the history viewer shows the correct commit
                await awaitsFor(() => {
                    return $("#editor-holder .git").find(".commit-title").text().trim().includes("first commit");
                }, `History viewer to have first commit detail`);

                $commitRow = $historyList.find(".history-commit").eq(0);
                $commitRow.trigger("click");
                await waitForHistoryViewerVisible(true);
                await awaitsFor(() => {
                    return $("#editor-holder .git").find(".commit-title").text().trim().includes("second commit");
                }, `History viewer to have second commit detail`);

                // Click the row again to dismiss the history viewer
                $commitRow.trigger("click");
                await waitForHistoryViewerVisible(false);
            });

            it("should switching to a non-git project hide branch dropdown and move git panel to init state", async () => {
                await SpecRunnerUtils.loadProjectInTestWindow(nonGitReadOnlyTestFolder);
                await waitForBranchDropdownVisible(false);
                await waitForGitToolbarIconVisible(true);
                await verifyRepoInNonGitState();
                await verifyGitPanelIcons(false);
            });

            it("should switching back to git project show branch dropdown and show git panel controls", async () => {
                await SpecRunnerUtils.loadProjectInTestWindow(testPathGit);
                await waitForBranchDropdownVisible(true);
                await waitForGitToolbarIconVisible(true);
                await verifyRepoInNonGitState(false);
                await verifyGitPanelIcons(true);
            });

            it("should switching to a non-git project while git panel hidden hide git toolbar icon", async () => {
                await SpecRunnerUtils.loadProjectInTestWindow(nonGitReadOnlyTestFolder);
                await __PR.execCommand(Commands.CMD_GIT_TOGGLE_PANEL);
                expect($gitPanel.is(":visible")).toBeFalse();

                await SpecRunnerUtils.loadProjectInTestWindow(nonGitReadOnlyTestFolder);
                await waitForGitToolbarIconVisible(false);

                await SpecRunnerUtils.loadProjectInTestWindow(testPathGit);
                await waitForGitToolbarIconVisible(true);
                await __PR.execCommand(Commands.CMD_GIT_TOGGLE_PANEL);

            });

            it("should discard all changes since last commit", async () => {
                await SpecRunnerUtils.loadProjectInTestWindow(testPathGit);
                __PR.typeAtCursor("discardTest");
                await __PR.saveActiveFile();
                await __PR.openFile("test.js");
                __PR.typeAtCursor("discardJSTest");
                await __PR.saveActiveFile();
                await awaitsFor(()=>{
                    return $gitPanel.find(".modified-file").length === 2;
                }, "2 files to be added in modified files list", 10000);

                // now discard all changes
                __PR.execCommand(Commands.CMD_GIT_DISCARD_ALL_CHANGES); // dont await here as
                // it tracks full complete after dialog closed
                await __PR.waitForModalDialog("#git-question-dialog");
                __PR.clickDialogButtonID(__PR.Dialogs.DIALOG_BTN_OK);
                await awaitsFor(()=>{
                    return $gitPanel.find(".modified-file").length === 0;
                }, "no files in modified files list", 10000);
            });

            const createdBranch = "createdBranch";
            async function waitForBranchNameDropdown(expectedName) {
                await awaitsFor(()=>{
                    return $("#git-branch").text().trim().includes(expectedName);
                }, `branch ${expectedName} to show in project`);
            }

            it("should be able to create a new branch", async () => {
                $("#git-branch-dropdown-toggle").click();
                await awaitsFor(()=>{
                    return $(".git-branch-new").is(":visible");
                }, "branch dropdown to show");
                $(".git-branch-new").click();
                await __PR.waitForModalDialog(".git");
                $('input[name="branch-name"]').val(createdBranch);
                __PR.clickDialogButtonID(__PR.Dialogs.DIALOG_BTN_OK);
                await waitForBranchNameDropdown(createdBranch);
            });

            it("should be able to switch branch", async () => {
                await waitForBranchNameDropdown(createdBranch);
                $("#git-branch-dropdown-toggle").click();
                await awaitsFor(()=>{
                    return $(".git-branch-new").is(":visible");
                }, "branch dropdown to show");

                expect($(".switch-branch").text()).toContain("master");
                $(".switch-branch").click();
                await waitForBranchNameDropdown("master");
            });
        });
    });
});
