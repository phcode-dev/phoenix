/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 * Original work Copyright (c) 2014 - 2021 Adobe Systems Incorporated. All rights reserved.
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

/*global describe, it, expect, beforeAll, afterAll, awaitsFor, spyOn */

define(function (require, exports, module) {


    var SpecRunnerUtils = require("spec/SpecRunnerUtils"),
        FileUtils       = require("file/FileUtils"),
        KeyEvent        = require("utils/KeyEvent"),
        _               = require("thirdparty/lodash");

    describe("integration:Recent Projects", function () {
        const testFolder = SpecRunnerUtils.getTestPath("/spec/LiveDevelopment-MultiBrowser-test-files"),
            prettierTestFolder = SpecRunnerUtils.getTestPath("/spec/prettier-test-files"),
            jsUtilsTestFolder = SpecRunnerUtils.getTestPath("/spec/JSUtils-test-files");
        const testFolderProjectName = "LiveDevelopment-MultiBrowser-test-files",
            prettierTestFolderProjectName = "prettier-test-files",
            jsUtilsTestFolderProjectName = "JSUtils-test-files";
        let extensionPath = FileUtils.getNativeModuleDirectoryPath(module),
            testWindow,
            $,
            CommandManager,
            PreferencesManager;

        beforeAll(async function () {
            testWindow = await SpecRunnerUtils.createTestWindowAndRun();
            $ = testWindow.$;
            CommandManager  = testWindow.brackets.test.CommandManager;
            PreferencesManager = testWindow.brackets.test.PreferencesManager;
        }, 30000);

        afterAll(async function () {
            testWindow = null;
            await SpecRunnerUtils.closeTestWindow();
        }, 30000);

        async function openRecentProjectDropDown() {
            CommandManager.execute("recentProjects.toggle");
            await awaitsFor(function () {
                return $("#project-dropdown").is(":visible");
            });
        }

        describe("UI", function () {
            it("should open the recent projects list with only the getting started project", async function () {
                await openRecentProjectDropDown();

                var $dropDown = $("#project-dropdown");
                expect($dropDown.children().length>=4).toBeTrue();
            });

            it("should open the recent project list and show recent projects", async function () {
                await SpecRunnerUtils.loadProjectInTestWindow(testFolder);
                await SpecRunnerUtils.loadProjectInTestWindow(prettierTestFolder);
                await SpecRunnerUtils.loadProjectInTestWindow(jsUtilsTestFolder);

                await openRecentProjectDropDown();

                let $dropDown = $("#project-dropdown");
                let text = $dropDown.text();
                expect(text.includes(testFolderProjectName)).toBeTrue();
                expect(text.includes(prettierTestFolderProjectName)).toBeTrue();

                await SpecRunnerUtils.loadProjectInTestWindow(testFolder);
                await openRecentProjectDropDown();
                $dropDown = $("#project-dropdown");
                text = $dropDown.text();
                expect(text.includes(jsUtilsTestFolderProjectName)).toBeTrue();
            });

            it("should delete one project from recent project list when delete key is pressed on", async function () {
                await SpecRunnerUtils.loadProjectInTestWindow(testFolder);
                await SpecRunnerUtils.loadProjectInTestWindow(prettierTestFolder);
                await SpecRunnerUtils.loadProjectInTestWindow(jsUtilsTestFolder);

                await openRecentProjectDropDown();

                var $dropDown = $("#project-dropdown");
                let currentLength = $dropDown.find(".recent-folder-link").length;
                SpecRunnerUtils.simulateKeyEvent(KeyEvent.DOM_VK_UP, "keydown", $dropDown[0]);
                SpecRunnerUtils.simulateKeyEvent(KeyEvent.DOM_VK_DELETE, "keydown", $dropDown[0]);

                expect($dropDown.find(".recent-folder-link").length).toEqual(currentLength - 1);
            });

            function typeInEncodingPopup(text) {
                for(let char of text){
                    testWindow.$("#project-dropdown")[0].dispatchEvent(new KeyboardEvent("keydown", {
                        key: char,
                        bubbles: true, // Event bubbles up through the DOM
                        cancelable: true // Event can be canceled
                    }));
                }
            }

            it("should filter projects on typing", async function () {
                await SpecRunnerUtils.loadProjectInTestWindow(testFolder);
                await SpecRunnerUtils.loadProjectInTestWindow(prettierTestFolder);
                await SpecRunnerUtils.loadProjectInTestWindow(jsUtilsTestFolder);
                await SpecRunnerUtils.loadProjectInTestWindow(testFolder);

                await openRecentProjectDropDown();
                var $dropDown = $("#project-dropdown");
                let text = $dropDown.text();
                expect(text.includes(jsUtilsTestFolderProjectName)).toBeTrue();
                typeInEncodingPopup("JSUtils");

                SpecRunnerUtils.simulateKeyEvent(KeyEvent.DOM_VK_DOWN, "keydown", $dropDown[0]);
                SpecRunnerUtils.simulateKeyEvent(KeyEvent.DOM_VK_DELETE, "keydown", $dropDown[0]);

                text = $dropDown.text();
                expect(text.includes(jsUtilsTestFolderProjectName)).toBeFalse();
            });
        });
    });
});
