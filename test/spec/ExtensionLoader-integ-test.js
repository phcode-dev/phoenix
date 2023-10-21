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

/*global describe, it, expect, beforeEach, awaitsFor, beforeAll, afterAll, Phoenix, awaits, awaitsForDone*/

define(function (require, exports, module) {

    const DEBUG_LOAD_CURRENT_EXTENSION          = "debug.loadCurrentExtension",
        DEBUG_UNLOAD_CURRENT_EXTENSION        = "debug.unloadCurrentExtension";

    const SpecRunnerUtils     = require("spec/SpecRunnerUtils");
    const testPathSrc = SpecRunnerUtils.getTestPath("/spec/ExtensionLoader-test-files");
    const customProjectPath = Phoenix.VFS.getAppSupportDir() + "testExtensionLoad"; // this is a path that is
    // not part of the asset serve tauri dir in tauri.
    // should also work as a virtual serving location in normal browsers.

    describe("LegacyInteg:ExtensionLoader integration tests", function () {

        if(Phoenix.isTestWindowPlaywright && !Phoenix.browser.desktop.isChromeBased) {
            it("All tests requiring virtual server is disabled in playwright/firefox/safari", async function () {
                // we dont spawn virtual server in iframe playwright linux/safari as playwright linux/safari fails badly
                // we dont need virtual server for tests except for live preview and custom extension load tests,
                // which are disabled in playwright. We test in chrome atleast as chromium support is a baseline.
            });
            return;
        }

        let testWindow, CommandManager, Commands;

        beforeAll(async function () {
            testWindow = await SpecRunnerUtils.createTestWindowAndRun();
            CommandManager = testWindow.brackets.test.CommandManager;
            Commands = testWindow.brackets.test.Commands;
            await SpecRunnerUtils.deletePathAsync(customProjectPath, true);
            await SpecRunnerUtils.copy(testPathSrc, customProjectPath);
        }, 30000);

        beforeEach(async function () {
            CommandManager = testWindow.brackets.test.CommandManager;
            Commands = testWindow.brackets.test.Commands;
        }, 30000);

        afterAll(async function () {
            testWindow      = null;
            CommandManager = null;
            await SpecRunnerUtils.closeTestWindow();
            await SpecRunnerUtils.deletePathAsync(customProjectPath, true);
        }, 30000);


        it("should load and unload custom extension", async function () {
            const testExtensionPath = `${customProjectPath}/extension`;
            await SpecRunnerUtils.loadProjectInTestWindow(testExtensionPath);
            await awaits(3000);
            CommandManager.execute(DEBUG_LOAD_CURRENT_EXTENSION);
            await awaitsFor(function () { return testWindow.extensionLoaderTestExtensionLoaded; },
                "Waiting for extension loaded", 30000);
            await SpecRunnerUtils.waitForBracketsDoneLoading();
            await awaits(3000);

            CommandManager = testWindow.brackets.test.CommandManager;
            CommandManager.execute(DEBUG_UNLOAD_CURRENT_EXTENSION);
            await awaitsFor(function () { return testWindow && !testWindow.extensionLoaderTestExtensionLoaded; },
                "Waiting for extension loaded", 30000);
            await awaits(3000);
            await SpecRunnerUtils.waitForBracketsDoneLoading();
        }, 30000);

        it("should load a custom theme and live edit the theme", async function () {
            const testThemePath = `${customProjectPath}/theme`;
            const testThemeFilePath = `${customProjectPath}/theme/theme.css`;
            await SpecRunnerUtils.loadProjectInTestWindow(testThemePath);
            await awaits(3000);
            CommandManager.execute(DEBUG_LOAD_CURRENT_EXTENSION);

            // wait for the theme to be loaded
            await awaitsFor(function () {
                if(!testWindow){
                    return false;
                }
                const ThemeManager = testWindow.brackets && testWindow.brackets.test && testWindow.brackets.test.ThemeManager;
                if(!ThemeManager){
                    return false;
                }
                let themes = ThemeManager.getAllThemes();
                for(let theme of themes){
                    if(theme.name === "da-theme"){
                        return true;
                    }
                }
                return false;
            }, "custom theme to be loaded", 30000);

            await awaitsFor(function () {
                if(!testWindow){
                    return false;
                }
                const element = testWindow.document.getElementById('sidebar');
                const style = testWindow.getComputedStyle(element);
                return style.backgroundColor === `rgb(100, 100, 0)`;
            }, "custom theme style to be applied", 10000);
            // Check if the theme style is applied
            await awaits(3000);
            await SpecRunnerUtils.waitForBracketsDoneLoading();

            // now live edit theme changes
            await SpecRunnerUtils.loadProjectInTestWindow(testThemePath);
            Commands = testWindow.brackets.test.Commands;
            CommandManager = testWindow.brackets.test.CommandManager;
            const EditorManager = testWindow.brackets.test.EditorManager;
            const promise = CommandManager.execute(Commands.CMD_ADD_TO_WORKINGSET_AND_OPEN, {fullPath: testThemeFilePath});
            await awaitsForDone(promise, "Open theme css into working set");
            await awaits(3000);
            const editor = EditorManager.getActiveEditor();
            editor.document.replaceRange("35", { line: 1, ch: 27 }, { line: 1, ch: 30 });
            await awaitsFor(function () {
                if(!testWindow){
                    return false;
                }
                const element = testWindow.document.getElementById('sidebar');
                const style = testWindow.getComputedStyle(element);
                return style.backgroundColor === `rgb(35, 100, 0)`;
            }, "Theme Live edit to be applied", 10000);
        }, 30000);
    });
});
