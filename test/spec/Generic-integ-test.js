/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 * Original work Copyright (c) 2013 - 2021 Adobe Systems Incorporated. All rights reserved.
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

/*global describe, path, it, expect, awaitsForDone, beforeAll, afterAll, awaitsFor */

define(function (require, exports, module) {


    // Load dependent modules
    let DocumentManager,      // loaded from brackets.test
        EditorManager,        // loaded from brackets.test
        MainViewManager,      // loaded from brackets.test
        CommandManager,
        Commands,
        SpecRunnerUtils  = require("spec/SpecRunnerUtils");


    describe("integration:Misc", function () {

        let testWindow,
            _$;

        beforeAll(async function () {
            testWindow = await SpecRunnerUtils.createTestWindowAndRun();
            _$ = testWindow.$;

            // Load module instances from brackets.test
            DocumentManager = testWindow.brackets.test.DocumentManager;
            EditorManager   = testWindow.brackets.test.EditorManager;
            MainViewManager = testWindow.brackets.test.MainViewManager;
            CommandManager = testWindow.brackets.test.CommandManager;
            Commands = testWindow.brackets.test.Commands;
        }, 30000);

        afterAll(async function () {
            await SpecRunnerUtils.parkProject(true);
            testWindow      = null;
            DocumentManager = null;
            EditorManager   = null;
            MainViewManager = null;
            CommandManager = null;
            Commands = null;
            await SpecRunnerUtils.closeTestWindow();
        }, 30000);

        async function _openProjectFile(fileName, paneID) {
            await awaitsForDone(SpecRunnerUtils.openProjectFiles([fileName], paneID), "opening "+ fileName);
        }

        async function _closeCurrentFile() {
            await awaitsForDone(CommandManager.execute(Commands.FILE_CLOSE));
        }

        async function _reopenClosedFile() {
            await awaitsForDone(CommandManager.execute(Commands.FILE_REOPEN_CLOSED));
        }

        describe("Indent Guides", function () {
            let currentProjectPath;
            beforeAll(async function () {
                // Working set behavior is sensitive to whether file lives in the project or outside it, so make
                // the project root a known quantity.
                currentProjectPath = await SpecRunnerUtils.getTestPath("/spec/space-detect-test-files");
                await SpecRunnerUtils.loadProjectInTestWindow(currentProjectPath);
            });

            async function verify(fileName, expectedIndentLines) {
                const isChecked = CommandManager.get(Commands.TOGGLE_INDENT_GUIDES).getChecked();
                if(!isChecked){
                    await awaitsForDone(CommandManager.execute(Commands.TOGGLE_INDENT_GUIDES));
                }
                await _openProjectFile(fileName);
                await awaitsFor(function () {
                    const _isChecked = CommandManager.get(Commands.TOGGLE_INDENT_GUIDES).getChecked();
                    return _isChecked &&
                        _$("#first-pane .cm-phcode-indent-guides:visible").length === expectedIndentLines;
                }, ()=>{
                    return `Indent guides tobe ${expectedIndentLines} but got
                     ${_$("#first-pane .cm-phcode-indent-guides:visible").length}`;
                });
                await awaitsForDone(CommandManager.execute(Commands.TOGGLE_INDENT_GUIDES));
                await awaitsFor(function () {
                    const _isChecked = CommandManager.get(Commands.TOGGLE_INDENT_GUIDES).getChecked();
                    return !_isChecked && _$("#first-pane .cm-phcode-indent-guides:visible").length === 0;
                }, ()=>{
                    return `Indent guides to go, but got ${_$("#first-pane .cm-phcode-indent-guides:visible").length}`;
                });
                await awaitsForDone(CommandManager.execute(Commands.TOGGLE_INDENT_GUIDES));
                await awaitsFor(function () {
                    const _isChecked = CommandManager.get(Commands.TOGGLE_INDENT_GUIDES).getChecked();
                    return _isChecked &&
                        _$("#first-pane .cm-phcode-indent-guides:visible").length === expectedIndentLines;
                }, ()=>{
                    return `Guides to be back ${expectedIndentLines} but got
                     ${_$("#first-pane .cm-phcode-indent-guides:visible").length}`;
                });
            }

            it("should show and toggle indent guides with 1 space file", async function () {
                await verify("space-1.js", 1);
            });

            it("should show and toggle indent guides with 12 space file", async function () {
                await verify("space-12.js", 3);
            });

            it("should show and toggle indent guides with no space file", async function () {
                await verify("space-none.js", 0);
            });

            it("should show and toggle indent guides with 2 tabs", async function () {
                await verify("tab-2.js", 2);
            });

            it("should show and toggle indent guides with 12 tabs", async function () {
                await verify("tab-12.js", 12);
            });
        });

        describe("reopen closed files test", function () {
            let currentProjectPath;
            beforeAll(async function () {
                // Working set behavior is sensitive to whether file lives in the project or outside it, so make
                // the project root a known quantity.
                currentProjectPath = await SpecRunnerUtils.getTempTestDirectory("/spec/DocumentCommandHandlers-test-files");
                await SpecRunnerUtils.loadProjectInTestWindow(currentProjectPath);
            });

            afterAll(async function () {
                MainViewManager.setLayoutScheme(1, 1);
                await SpecRunnerUtils.parkProject(true);
            });

            it("should reopen be disabled at first and then enabled on closing a file", async function () {
                const testFilePath = "test.js";
                expect(CommandManager.get(Commands.FILE_REOPEN_CLOSED).getEnabled()).toBeFalse();
                await _openProjectFile(testFilePath);
                expect(CommandManager.get(Commands.FILE_REOPEN_CLOSED).getEnabled()).toBeFalse();
                await _closeCurrentFile();
                expect(CommandManager.get(Commands.FILE_REOPEN_CLOSED).getEnabled()).toBeTrue();
                await _reopenClosedFile();
                expect(CommandManager.get(Commands.FILE_REOPEN_CLOSED).getEnabled()).toBeFalse();
                expect(MainViewManager.getCurrentlyViewedPath(MainViewManager.ACTIVE_PANE))
                    .toEqual(path.join(currentProjectPath, testFilePath));
            });

            it("should reopen multiple files", async function () {
                const testFilePath = "test.js", testFilePath2 = "couz.png";
                expect(CommandManager.get(Commands.FILE_REOPEN_CLOSED).getEnabled()).toBeFalse();
                await _openProjectFile(testFilePath);
                await _openProjectFile(testFilePath2);
                expect(CommandManager.get(Commands.FILE_REOPEN_CLOSED).getEnabled()).toBeFalse();
                await _closeCurrentFile(); // couz.png is closed
                await _closeCurrentFile(); // test.js - closed. so the reopen order is js then png
                expect(CommandManager.get(Commands.FILE_REOPEN_CLOSED).getEnabled()).toBeTrue();
                await _reopenClosedFile();
                expect(CommandManager.get(Commands.FILE_REOPEN_CLOSED).getEnabled()).toBeTrue();
                expect(MainViewManager.getCurrentlyViewedPath(MainViewManager.ACTIVE_PANE))
                    .toEqual(path.join(currentProjectPath, testFilePath));
                await _reopenClosedFile();
                expect(CommandManager.get(Commands.FILE_REOPEN_CLOSED).getEnabled()).toBeFalse();
                expect(MainViewManager.getCurrentlyViewedPath(MainViewManager.ACTIVE_PANE))
                    .toEqual(path.join(currentProjectPath, testFilePath2));
            });

            it("should reopen multiple files in multiple panes", async function () {
                expect(CommandManager.get(Commands.FILE_REOPEN_CLOSED).getEnabled()).toBeFalse();
                const test = "test.js", test2 = "couz.png";
                const couz = "couz.png", couz2 = "couz2.png";
                MainViewManager.setLayoutScheme(1, 2);
                await _openProjectFile(test, MainViewManager.FIRST_PANE);
                await _openProjectFile(couz, MainViewManager.FIRST_PANE);
                await _openProjectFile(test2, MainViewManager.SECOND_PANE);
                await _openProjectFile(couz2, MainViewManager.SECOND_PANE);
                expect(CommandManager.get(Commands.FILE_REOPEN_CLOSED).getEnabled()).toBeFalse();
                MainViewManager.setActivePaneId(MainViewManager.FIRST_PANE);
                await _closeCurrentFile(); // couz.png is closed
                MainViewManager.setActivePaneId(MainViewManager.SECOND_PANE);
                await _closeCurrentFile(); // couz2.png is closed. so the reopen order is couz2 then couz
                expect(CommandManager.get(Commands.FILE_REOPEN_CLOSED).getEnabled()).toBeTrue();
                MainViewManager.setActivePaneId(MainViewManager.FIRST_PANE);
                await _reopenClosedFile();
                expect(CommandManager.get(Commands.FILE_REOPEN_CLOSED).getEnabled()).toBeTrue();
                expect(MainViewManager.getActivePaneId()).toBe(MainViewManager.SECOND_PANE);
                expect(MainViewManager.getCurrentlyViewedPath(MainViewManager.ACTIVE_PANE))
                    .toEqual(path.join(currentProjectPath, couz2));
                await _reopenClosedFile();
                expect(CommandManager.get(Commands.FILE_REOPEN_CLOSED).getEnabled()).toBeFalse();
                expect(MainViewManager.getActivePaneId()).toBe(MainViewManager.FIRST_PANE);
                expect(MainViewManager.getCurrentlyViewedPath(MainViewManager.ACTIVE_PANE))
                    .toEqual(path.join(currentProjectPath, couz));
            });

            it("should reopen multiple files even if multiple panes collapses into single", async function () {
                expect(CommandManager.get(Commands.FILE_REOPEN_CLOSED).getEnabled()).toBeFalse();
                const test = "test.js", test2 = "couz.png";
                const couz = "couz.png", couz2 = "couz2.png";
                MainViewManager.setLayoutScheme(1, 2);
                await _openProjectFile(test, MainViewManager.FIRST_PANE);
                await _openProjectFile(couz, MainViewManager.FIRST_PANE);
                await _openProjectFile(test2, MainViewManager.SECOND_PANE);
                await _openProjectFile(couz2, MainViewManager.SECOND_PANE);
                expect(CommandManager.get(Commands.FILE_REOPEN_CLOSED).getEnabled()).toBeFalse();
                MainViewManager.setActivePaneId(MainViewManager.FIRST_PANE);
                await _closeCurrentFile(); // couz.png is closed
                MainViewManager.setActivePaneId(MainViewManager.SECOND_PANE);
                await _closeCurrentFile(); // couz2.png is closed. so the reopen order is couz2 then couz
                // now we move to a single pane layout from multi pane. reopen should still work
                MainViewManager.setLayoutScheme(1, 1);
                expect(CommandManager.get(Commands.FILE_REOPEN_CLOSED).getEnabled()).toBeTrue();
                await _reopenClosedFile();
                expect(CommandManager.get(Commands.FILE_REOPEN_CLOSED).getEnabled()).toBeTrue();
                expect(MainViewManager.getCurrentlyViewedPath(MainViewManager.ACTIVE_PANE))
                    .toEqual(path.join(currentProjectPath, couz2));
                await _reopenClosedFile();
                expect(CommandManager.get(Commands.FILE_REOPEN_CLOSED).getEnabled()).toBeFalse();
                expect(MainViewManager.getCurrentlyViewedPath(MainViewManager.ACTIVE_PANE))
                    .toEqual(path.join(currentProjectPath, couz));
            });
        });
    });
});
