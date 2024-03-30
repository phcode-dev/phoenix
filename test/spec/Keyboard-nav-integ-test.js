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

/*global describe, it, expect, beforeAll, afterAll, awaitsFor, awaitsForDone */

define(function (require, exports, module) {
    // Recommended to avoid reloading the integration test window Phoenix instance for each test.

    const SpecRunnerUtils     = require("spec/SpecRunnerUtils"),
        Keys                = require("command/Keys");

    const testPath = SpecRunnerUtils.getTestPath("/spec/JSUtils-test-files");

    let FileViewController,     // loaded from brackets.test
        ProjectManager,         // loaded from brackets.test;
        MainViewManager,
        CommandManager,
        Commands,
        testWindow,
        brackets;


    describe("mainview:Keyboard navigation overlay integ tests tests", function () {

        beforeAll(async function () {
            // do not use force option in brackets core integration tests. Tests are assumed to reuse the existing
            // test window instance for fast runs.
            testWindow = await SpecRunnerUtils.createTestWindowAndRun();
            brackets            = testWindow.brackets;
            FileViewController  = brackets.test.FileViewController;
            ProjectManager      = brackets.test.ProjectManager;
            MainViewManager     = brackets.test.MainViewManager;
            CommandManager      = brackets.test.CommandManager;
            Commands            = brackets.test.Commands;

            await SpecRunnerUtils.loadProjectInTestWindow(testPath);
        }, 30000);

        afterAll(async function () {
            MainViewManager.setLayoutScheme(1, 1);
            FileViewController  = null;
            ProjectManager      = null;
            testWindow = null;
            brackets = null;
            // comment out below line if you want to debug the test window post running tests
            await SpecRunnerUtils.closeTestWindow();
        }, 30000);

        function tripleControlEvent() {
            keyboardType(Keys.KEY.CONTROL);
            keyboardType(Keys.KEY.CONTROL);
            keyboardType(Keys.KEY.CONTROL);
        }

        function keyboardType(key) {
            const ctrlEvent = new KeyboardEvent("keydown", {
                key: key,
                bubbles: true, // Event bubbles up through the DOM
                cancelable: true, // Event can be canceled,
                code: key
            });
            testWindow.$("#Phoenix-Main")[0].dispatchEvent(ctrlEvent);
        }

        /**
         *
         * @param path
         * @param {string?} paneID
         * @return {Promise<void>}
         */
        async function openAnyFile(path = "/simple.js", paneID) {
            await awaitsForDone(
                FileViewController.openAndSelectDocument(
                    testPath + path,
                    FileViewController.PROJECT_MANAGER,
                    paneID
                ));
            const selected = ProjectManager.getSelectedItem();
            expect(selected.fullPath).toBe(testPath + path);
        }

        async function _openUiNavMode() {
            await awaitsForDone(CommandManager.execute(Commands.CMD_KEYBOARD_NAV_UI_OVERLAY));
            await awaitsFor(()=>{
                return testWindow.$('#ctrl-nav-overlay').is(":visible");
            }, "overlay to be shown");
        }

        it("Should show overlay on triple control and exit on escape", async function () {
            MainViewManager.setLayoutScheme(1, 1);
            await openAnyFile();
            tripleControlEvent();
            await awaitsFor(()=>{
                return testWindow.$('#ctrl-nav-overlay').is(":visible");
            }, "overlay to be shown");
            // escape should exit
            keyboardType(Keys.KEY.ESCAPE);
            await awaitsFor(()=>{
                return !testWindow.$('#ctrl-nav-overlay').is(":visible");
            }, "overlay to be closed");
        });

        async function _verifyMenuNav() {
            await _openUiNavMode();
            keyboardType(Keys.KEY.ARROW_UP);
            await awaitsFor(()=>{
                return testWindow.$('#titlebar .dropdown.open').length === 1;
            }, "menu to open");
            keyboardType(Keys.KEY.ESCAPE);
        }

        it("Should navigate to top menu on up arrow press", async function () {
            MainViewManager.setLayoutScheme(1, 1);
            await openAnyFile();
            await _verifyMenuNav();
        });

        it("Should navigate vertical split panes on left and right arrow key press", async function () {
            MainViewManager.setLayoutScheme(1, 2);
            await openAnyFile("/edit.js", MainViewManager.SECOND_PANE);
            await openAnyFile("/simple.js", MainViewManager.FIRST_PANE);
            MainViewManager.setActivePaneId(MainViewManager.FIRST_PANE);
            await _verifyMenuNav();
            MainViewManager.setActivePaneId(MainViewManager.SECOND_PANE);
            await _verifyMenuNav();

            // right arrow to switch to right pane
            MainViewManager.setActivePaneId(MainViewManager.FIRST_PANE);
            await _openUiNavMode();
            keyboardType(Keys.KEY.ARROW_RIGHT);
            keyboardType(Keys.KEY.ENTER);
            expect(MainViewManager.getActivePaneId()).toBe(MainViewManager.SECOND_PANE);

            // left arrow to switch to left pane
            await _openUiNavMode();
            keyboardType(Keys.KEY.ARROW_LEFT);
            keyboardType(Keys.KEY.ENTER);
            expect(MainViewManager.getActivePaneId()).toBe(MainViewManager.FIRST_PANE);
        });

        it("Should navigate horizontal split panes on up and down arrow key press", async function () {
            MainViewManager.setLayoutScheme(2, 1);
            await openAnyFile("/edit.js", MainViewManager.SECOND_PANE);
            await openAnyFile("/simple.js", MainViewManager.FIRST_PANE);
            MainViewManager.setActivePaneId(MainViewManager.FIRST_PANE);
            await _verifyMenuNav();

            // right arrow to switch to right pane
            MainViewManager.setActivePaneId(MainViewManager.SECOND_PANE);
            await _openUiNavMode();
            keyboardType(Keys.KEY.ARROW_UP);
            keyboardType(Keys.KEY.ENTER);
            expect(MainViewManager.getActivePaneId()).toBe(MainViewManager.FIRST_PANE);

            // left arrow to switch to left pane
            await _openUiNavMode();
            keyboardType(Keys.KEY.ARROW_DOWN);
            keyboardType(Keys.KEY.ENTER);
            expect(MainViewManager.getActivePaneId()).toBe(MainViewManager.SECOND_PANE);
        });

        it("Should navigate be able to focus on a pane with no editor", async function () {
            MainViewManager.setLayoutScheme(1, 2);
            await awaitsForDone(CommandManager.execute(Commands.FILE_CLOSE_ALL, { _forceClose: true }),
                "closing all file");
            await openAnyFile("/simple.js", MainViewManager.FIRST_PANE);
            MainViewManager.setActivePaneId(MainViewManager.FIRST_PANE);

            // right arrow to switch to right pane
            MainViewManager.setActivePaneId(MainViewManager.FIRST_PANE);
            await _openUiNavMode();
            keyboardType(Keys.KEY.ARROW_RIGHT);
            keyboardType(Keys.KEY.ENTER);
            expect(MainViewManager.getActivePaneId()).toBe(MainViewManager.SECOND_PANE);

            // left arrow to switch to left pane
            await _openUiNavMode();
            keyboardType(Keys.KEY.ARROW_LEFT);
            keyboardType(Keys.KEY.ENTER);
            expect(MainViewManager.getActivePaneId()).toBe(MainViewManager.FIRST_PANE);
        });

    });
});
