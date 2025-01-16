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

    let $, __PR, testWindow, ExtensionLoader, Menus, Commands, CommandManager,
        SpecRunnerUtils     = require("spec/SpecRunnerUtils"),
        anotherTestFolder = SpecRunnerUtils.getTestPath("/spec/LowLevelFileIO-test-files");

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
            testPathGit = await SpecRunnerUtils.getTempTestDirectory("/spec/EditorCommandHandlers-test-files");

            await SpecRunnerUtils.loadProjectInTestWindow(testPathGit);
            await ExtensionLoader._loadDefaultExtension("Git");
            await awaitsFor(()=>{
                return !!Menus.getSubMenu(Menus.SubMenuIds.GIT_SUB_MENU);
            }, "Git menus to be present", 10000);
        }, 30000);

        describe("Init repo and do all tests", function () {
            let $gitPanel, $gitIcon;
            beforeAll(async function () {
                $gitPanel = $("#git-panel");
                $gitIcon = $("#git-toolbar-icon");
            });

            it("should only git settings, init and clone commands be enabled in non-git repos", async function () {
                await forCommandEnabled(Commands.CMD_GIT_INIT);
                await forCommandEnabled(Commands.CMD_GIT_CLONE);
                await forCommandEnabled(Commands.CMD_GIT_SETTINGS_COMMAND_ID);
                await forCommandEnabled(Commands.CMD_GIT_TOGGLE_PANEL);
                // others are disabled
                await forCommandEnabled(Commands.CMD_GIT_REFRESH, false);
                await forCommandEnabled(Commands.CMD_GIT_REFRESH, false);
                await forCommandEnabled(Commands.CMD_GIT_FETCH, false);
                await forCommandEnabled(Commands.CMD_GIT_PULL, false);
                await forCommandEnabled(Commands.CMD_GIT_PUSH, false);
            });

            it("Should Git icon be hidden in non-git repo", async function () {
                expect($gitIcon.is(":visible")).toBeFalse();
            });

            it("Should be able to show git panel in non-git repo, and icon will come up", async function () {
                await __PR.execCommand(Commands.CMD_GIT_TOGGLE_PANEL);
                expect($gitPanel.is(":visible")).toBeTrue();
                expect($gitIcon.is(":visible")).toBeTrue();
            });

            it("Should be able to initialize git repo", async function () {
                await showGitPanel();
                $gitPanel.find(".git-init").click();
                await awaitsFor(()=>{
                    return $gitPanel.find(".modified-file").length === 4;
                }, "4 files to be added in modified files list", 10000);
            });
        });

    });
});
