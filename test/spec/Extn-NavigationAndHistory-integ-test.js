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

/*global describe, it, expect, beforeAll, afterAll, awaitsForDone, beforeEach, awaits, awaitsFor, path */

define(function (require, exports, module) {
    // Recommended to avoid reloading the integration test window Phoenix instance for each test.

    const SpecRunnerUtils     = require("spec/SpecRunnerUtils");

    describe("LegacyInteg:FileRecovery integration tests", function () {

        const testPathOriginal = SpecRunnerUtils.getTestPath("/spec/ProjectManager-test-files");
        const testPath = SpecRunnerUtils.getTestRoot() + "/navigationTests/";
        const tempRestorePath = SpecRunnerUtils.getTestRoot() + "/navigationTestsRestore/";

        let FileViewController,     // loaded from brackets.test
            ProjectManager,         // loaded from brackets.test;
            CommandManager,
            Commands,
            testWindow,
            EditorManager,
            MainViewManager,
            brackets,
            FileSystem,
            $;


        async function deletePath(pathToDel) {
            if(!pathToDel.startsWith("/")) {
                pathToDel = testPath + pathToDel;
            }
            let promise = SpecRunnerUtils.deletePath(pathToDel, true);
            await awaitsForDone(promise, "Remove " + pathToDel, 5000);
        }

        async function loadTestWindow(force) {
            testWindow = await SpecRunnerUtils.createTestWindowAndRun({forceReload: force});
            brackets            = testWindow.brackets;
            $                   = testWindow.$;
            FileViewController  = brackets.test.FileViewController;
            ProjectManager      = brackets.test.ProjectManager;
            CommandManager      = brackets.test.CommandManager;
            Commands            = brackets.test.Commands;
            EditorManager       = brackets.test.EditorManager;
            MainViewManager     = brackets.test.MainViewManager;
            FileSystem          = brackets.test.FileSystem;
            await awaitsForDone(SpecRunnerUtils.copyPath(testPathOriginal, testPath), "copy temp files");
            await SpecRunnerUtils.loadProjectInTestWindow(testPath);
        }

        beforeEach(async function () {
            await closeSession();
            await deletePath(testPath);
            await deletePath(tempRestorePath);
            await loadTestWindow(true);
        }, 30000);

        afterAll(async function () {
            FileViewController  = null;
            ProjectManager      = null;
            testWindow = null;
            brackets = null;
            await deletePath(testPath);
            await deletePath(tempRestorePath);
            await SpecRunnerUtils.closeTestWindow(true);
        }, 30000);

        async function closeSession() {
            if(!CommandManager){
                return;
            }
            await awaitsForDone(CommandManager.execute(Commands.FILE_CLOSE_ALL, { _forceClose: true }),
                "closing all file");
        }

        async function openFile(relativePath) {
            await awaitsForDone(
                FileViewController.openAndSelectDocument(
                    testPath + relativePath,
                    FileViewController.PROJECT_MANAGER
                ));
        }

        function isFileOpen(relativePath) {
            const fullPath = testPath + relativePath;
            let allOpenFiles = MainViewManager.getAllOpenFiles();
            for(let file of allOpenFiles){
                if(file.fullPath === fullPath){
                    return true;
                }
            }
            return false;
        }

        async function initFileRestorer(fileToOpen, scanInterval = 100) {
            await deletePath(tempRestorePath);
            await SpecRunnerUtils.waitTillPathNotExists(tempRestorePath);
            await openFile(fileToOpen);
            expect(isFileOpen(fileToOpen)).toBeTrue();
            expect(testWindow._FileRecoveryExtensionForTests).exists;
            expect(await SpecRunnerUtils.pathExists(tempRestorePath, true)).toBeFalse();
            testWindow._FileRecoveryExtensionForTests.initWith(scanInterval,
                FileSystem.getDirectoryForPath(tempRestorePath));
            await SpecRunnerUtils.waitTillPathExists(tempRestorePath);

        }

        it("Should create restore folders and backup files", async function () {
            await initFileRestorer("file.js");
            let projectRestorePath = testWindow._FileRecoveryExtensionForTests.getProjectRestoreRoot(testPath);

            // now edit a file so that its backup is created
            let editor = EditorManager.getActiveEditor();
            editor.document.setText("hello");
            await SpecRunnerUtils.waitTillPathExists(projectRestorePath.fullPath, true);
            await SpecRunnerUtils.waitTillPathExists(projectRestorePath.fullPath + "file.js", false);
            await closeSession();
        });

        it("Should saving files remove file restore folder", async function () {
            await initFileRestorer("toDelete1/file.js");
            let projectRestorePath = testWindow._FileRecoveryExtensionForTests.getProjectRestoreRoot(testPath);

            // now edit a file so that its backup is created
            let editor = EditorManager.getActiveEditor();
            editor.document.setText("hello");
            await SpecRunnerUtils.waitTillPathExists(projectRestorePath.fullPath + "toDelete1/file.js", false);
            await awaitsForDone(CommandManager.execute(Commands.FILE_SAVE_ALL), "saving all file");
            await SpecRunnerUtils.waitTillPathNotExists(projectRestorePath.fullPath + "toDelete1/file.js", false);
            await closeSession();
        });

        it("Should show restore notification and restore if there is anything to restore", async function () {
            await initFileRestorer("toDelete1/file.js");
            let projectRestorePath = testWindow._FileRecoveryExtensionForTests.getProjectRestoreRoot(testPath);

            // now edit a file so that its backup is created
            const unsavedText = "hello" + Math.random();
            let editor = EditorManager.getActiveEditor();
            editor.document.setText(unsavedText);
            await SpecRunnerUtils.waitTillPathExists(projectRestorePath.fullPath + "toDelete1/file.js", false);

            // backup is now present, reload the project
            testWindow.location.href = "about:blank";
            await awaits(1000);
            await SpecRunnerUtils.closeTestWindow(true, true);
            await loadTestWindow(true);
            testWindow._FileRecoveryExtensionForTests.initWith(100,
                FileSystem.getDirectoryForPath(tempRestorePath));
            await awaitsFor(()=>{
                return $(".file-recovery-button").length === 1;
            }, "waiting for restore notification", 5000);

            // now press the recover button to start the recovery
            $(".file-recovery-button").click();
            // check if the file is recovered
            await awaitsFor(()=>{
                editor = EditorManager.getActiveEditor();
                return editor && editor.document.getText() === unsavedText;
            }, "waiting for restore notification", 5000);
            await closeSession();
        }, 30000);

        it("Should show restore notification and discard if discard button clicked", async function () {
            const fileNameToRestore = "toDelete1/file.js";
            await initFileRestorer(fileNameToRestore);
            let projectRestorePath = testWindow._FileRecoveryExtensionForTests.getProjectRestoreRoot(testPath);

            // now edit a file so that its backup is created
            const unsavedText = "hello" + Math.random();
            let editor = EditorManager.getActiveEditor();
            editor.document.setText(unsavedText);
            await SpecRunnerUtils.waitTillPathExists(projectRestorePath.fullPath + fileNameToRestore, false);

            // backup is now present, reload the project
            testWindow.location.href = "about:blank";
            await awaits(1000);
            await SpecRunnerUtils.closeTestWindow(true, true);
            await loadTestWindow(true);
            testWindow._FileRecoveryExtensionForTests.initWith(100,
                FileSystem.getDirectoryForPath(tempRestorePath));
            await awaitsFor(()=>{
                return $(".file-recovery-button").length === 1;
            }, "waiting for restore notification", 5000);

            // now press the discard button to discard the recovery
            $("#DISCARD_UNSAVED_FILES_RESTORE").click();
            await SpecRunnerUtils.waitTillPathNotExists(projectRestorePath.fullPath + fileNameToRestore, false);
            await openFile(fileNameToRestore);
            editor = EditorManager.getActiveEditor();
            expect(!!editor.isDirty).toBeFalse();
            await closeSession();
        }, 30000);

        // below project switch test case is flakey. need to fix. disable for now.
        // it("Should show restore on project switch", async function () {
        //     const readOnlyProject = SpecRunnerUtils.getTestPath("/spec/ProjectManager-test-files");
        //     await initFileRestorer("toDelete1/file.js", 1000);
        //     let projectRestorePath = testWindow._FileRecoveryExtensionForTests.getProjectRestoreRoot(testPath);
        //
        //     // now edit a file so that its backup is created
        //     const unsavedText = "hello" + Math.random();
        //     let editor = EditorManager.getActiveEditor();
        //     editor.document.setText(unsavedText);
        //     await SpecRunnerUtils.waitTillPathExists(projectRestorePath.fullPath + "toDelete1/file.js", false);
        //
        //     // backup is now present, switch to another project
        //     let loadPromise = SpecRunnerUtils.loadProjectInTestWindow(readOnlyProject);
        //     await awaitsFor(()=>{
        //         return $('button[data-button-id=dontsave]').length >= 1;
        //     }, "waiting for save changes dialogue", 5000);
        //     $('button[data-button-id=dontsave]')[0].click();
        //     await loadPromise;
        //     await SpecRunnerUtils.loadProjectInTestWindow(testPath);
        //     await awaits(3000);
        //     await awaitsFor(()=>{
        //         return $(".file-recovery-button").length === 1;
        //     }, "waiting for restore notification", 5000);
        //
        //     // now press the recover button to start the recovery
        //     $(".file-recovery-button").click();
        //     // check if the file is recovered
        //     await awaitsFor(()=>{
        //         editor = EditorManager.getActiveEditor();
        //         return editor && editor.document.getText() === unsavedText;
        //     }, "waiting for restore notification", 5000);
        //     await closeSession();
        // }, 1000000);
    });
    describe("integration:Navigation back/forward integration tests", function () {

        const testProjectPath = SpecRunnerUtils.getTestPath("/spec/quickview-extn-test-files");
        const NAVIGATION_JUMP_BACK      = "navigation.jump.back",
            NAVIGATION_JUMP_FWD       = "navigation.jump.fwd",
            _NAVIGATION_RESET_FOR_TESTS       = "navigation.jump.reset.tests";

        let FileViewController,     // loaded from brackets.test
            CommandManager,
            Commands,
            testWindow,
            MainViewManager,
            brackets,
            $;

        beforeAll(async function () {
            testWindow = await SpecRunnerUtils.createTestWindowAndRun();
            brackets            = testWindow.brackets;
            $                   = testWindow.$;
            FileViewController  = brackets.test.FileViewController;
            CommandManager      = brackets.test.CommandManager;
            Commands            = brackets.test.Commands;
            MainViewManager     = brackets.test.MainViewManager;
        }, 30000);

        beforeEach(async ()=>{
            await awaitsForDone(CommandManager.execute(Commands.FILE_CLOSE_ALL, { _forceClose: true }),
                "closing all file");
            await SpecRunnerUtils.closeTestWindow();
            await SpecRunnerUtils.loadProjectInTestWindow(testProjectPath);
        });

        afterAll(async function () {
            FileViewController  = null;
            testWindow = null;
            brackets = null;
            $ = null;
            MainViewManager = null;
            Commands = null;
            CommandManager = null;
            await SpecRunnerUtils.closeTestWindow();
        }, 30000);

        async function openFile(relativePath) {
            await awaitsForDone(
                FileViewController.openAndSelectDocument(
                    path.join(testProjectPath, relativePath),
                    FileViewController.PROJECT_MANAGER
                ));
        }

        async function _expectNavButton(backDisabled, fwdDisabled, message) {
            await awaitsFor(()=>{
                const navBackDisabledState = $("#navBackButton").hasClass("nav-back-btn-disabled");
                const navFwdDisabledState = $("#navForwardButton").hasClass("nav-forward-btn-disabled");
                return navBackDisabledState === backDisabled && navFwdDisabledState === fwdDisabled;
            }, message || "For the nav buttons state to be updated");
            expect($("#navBackButton").hasClass("nav-back-btn-disabled")).toBe(backDisabled);
            expect($("#navForwardButton").hasClass("nav-forward-btn-disabled")).toBe(fwdDisabled);
        }

        async function _validateActiveFile(relativePath) {
            await awaitsFor(()=>{
                return MainViewManager.getCurrentlyViewedFile().fullPath === path.join(testProjectPath, relativePath);
            }, "Active file to be " + relativePath);
        }

        async function navigateBack() {
            await awaitsForDone(CommandManager.execute(NAVIGATION_JUMP_BACK), "To navigate back");
        }

        async function navigateForward() {
            await awaitsForDone(CommandManager.execute(NAVIGATION_JUMP_FWD), "To navigate forward");
        }
        async function navigateResetStack() {
            await awaitsForDone(CommandManager.execute(_NAVIGATION_RESET_FOR_TESTS), "reset nav stacks");
        }

        async function _validateNavForFiles(file1, file2, file3) {
            await openFile("img/update_large_icon.svg"); // we open this just to have the first file back button
            // on first time, because of a race condition, the back button may(enabled but does nothing) or
            // may not be enabled. we cant test for this, so we just open a random file as control
            await openFile(file1);
            await openFile(file2);
            await _expectNavButton(false, true, "nav back only enabled");
            await navigateBack();
            await _validateActiveFile(file1);
            await _expectNavButton(false, false, "both enabled");
            await navigateForward();
            await _validateActiveFile(file2);
            await _expectNavButton(false, true, "nav back only enabled");
            await navigateBack();
            await _validateActiveFile(file1);
            await _expectNavButton(false, false, "both enabled");
            await openFile(file3);
            await _expectNavButton(false, true, "nav forward disabled due to new file open");
        }
        
        it("Should navigate back and forward between text files", async function () {
            await navigateResetStack();
            await _validateNavForFiles("test.css", "test.html", "test.js");
        }, 15000);

        it("Should navigate back and forward between image files", async function () {
            await navigateResetStack();
            await _validateNavForFiles("img/Color.png", "img/grabber_color-well.png", "img/throbber.gif");
        }, 15000);

        it("Should navigate back and forward between image and text files", async function () {
            await navigateResetStack();
            await _validateNavForFiles("test.css", "img/grabber_color-well.png", "test.js");
        }, 15000);
    });
});
