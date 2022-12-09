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

/*global describe, it, expect, beforeAll, afterAll, awaitsForDone, awaitsForFail */

define(function (require, exports, module) {
    // Recommended to avoid reloading the integration test window Phoenix instance for each test.

    const SpecRunnerUtils     = brackets.getModule("spec/SpecRunnerUtils");

    describe("integration:HTML Code Hints integration tests", function () {

        const testPath = SpecRunnerUtils.getTestPath("/spec/LiveDevelopment-MultiBrowser-test-files");

        let FileViewController,     // loaded from brackets.test
            ProjectManager,         // loaded from brackets.test;
            CommandManager,
            Commands,
            testWindow,
            EditorManager,
            MainViewManager,
            brackets;


        beforeAll(async function () {
            testWindow = await SpecRunnerUtils.createTestWindowAndRun();
            brackets            = testWindow.brackets;
            FileViewController  = brackets.test.FileViewController;
            ProjectManager      = brackets.test.ProjectManager;
            CommandManager      = brackets.test.CommandManager;
            Commands            = brackets.test.Commands;
            EditorManager       = brackets.test.EditorManager;
            MainViewManager     = brackets.test.MainViewManager;

            await SpecRunnerUtils.loadProjectInTestWindow(testPath);
        }, 30000);

        afterAll(function () {
            FileViewController  = null;
            ProjectManager      = null;
            testWindow = null;
            brackets = null;
            // comment out below line if you want to debug the test window post running tests
            //SpecRunnerUtils.closeTestWindow();
        });

        async function closeSession() {
            await awaitsForDone(CommandManager.execute(Commands.FILE_CLOSE_ALL, { _forceClose: true }),
                "closing all file");
        }

        it("Should jump to definition on div tag", async function () {
            await awaitsForDone(
                FileViewController.openAndSelectDocument(
                    testPath + "/jumpToDef.html",
                    FileViewController.PROJECT_MANAGER
                ));
            const selected = ProjectManager.getSelectedItem();
            expect(selected.fullPath).toBe(testPath + "/jumpToDef.html");

            let editor = EditorManager.getActiveEditor();
            editor.setCursorPos({ line: 5, ch: 6 });

            await awaitsForDone(CommandManager.execute(Commands.NAVIGATE_JUMPTO_DEFINITION),
                "jump to def on div");

            editor = EditorManager.getFocusedInlineEditor();
            expect(editor.document.file.fullPath.endsWith("LiveDevelopment-MultiBrowser-test-files/simpleShared.css"))
                .toBeTrue();
            await closeSession();
        });

        it("Should jump to definition on css class", async function () {
            await awaitsForDone(
                FileViewController.openAndSelectDocument(
                    testPath + "/jumpToDef.html",
                    FileViewController.PROJECT_MANAGER
                ));
            const selected = ProjectManager.getSelectedItem();
            expect(selected.fullPath).toBe(testPath + "/jumpToDef.html");

            let editor = EditorManager.getActiveEditor();
            editor.setCursorPos({ line: 6, ch: 23 });

            await awaitsForDone(CommandManager.execute(Commands.NAVIGATE_JUMPTO_DEFINITION),
                "jump to def on div");

            editor = EditorManager.getFocusedInlineEditor();
            expect(editor.document.file.fullPath.endsWith("LiveDevelopment-MultiBrowser-test-files/sub/test.css"))
                .toBeTrue();
            await closeSession();
        });

        async function verifySrcJumpToDef(location, targetFileName, jumpShouldFail) {
            await awaitsForDone(
                FileViewController.openAndSelectDocument(
                    testPath + "/jumpToDef.html",
                    FileViewController.PROJECT_MANAGER
                ));
            const selected = ProjectManager.getSelectedItem();
            expect(selected.fullPath).toBe(testPath + "/jumpToDef.html");

            let editor = EditorManager.getActiveEditor();
            editor.setCursorPos(location);

            if(jumpShouldFail){
                await awaitsForFail(CommandManager.execute(Commands.NAVIGATE_JUMPTO_DEFINITION),
                    "jump to def on div");
            } else {
                await awaitsForDone(CommandManager.execute(Commands.NAVIGATE_JUMPTO_DEFINITION),
                    "jump to def on div");
            }

            let currentFile = MainViewManager.getCurrentlyViewedFile();
            expect(currentFile.fullPath.endsWith(targetFileName))
                .toBeTrue();
            await closeSession();
        }

        it("Should jump to files on href/src attributes", async function () {
            await verifySrcJumpToDef({ line: 3, ch: 44 }, "sub/test.css");
            await verifySrcJumpToDef({ line: 13, ch: 29 }, "blank.css");
            await verifySrcJumpToDef({ line: 11, ch: 32 }, "sub/icon_chevron.png");
            await closeSession();
        });

        it("Should not jump to files on non href/src attributes", async function () {
            await verifySrcJumpToDef({ line: 14, ch: 47 }, "jumpToDef.html", true);
            await verifySrcJumpToDef({ line: 7, ch: 20 }, "jumpToDef.html", true);
            await verifySrcJumpToDef({ line: 3, ch: 22 }, "jumpToDef.html", true);
            await closeSession();
        });

    });
});
