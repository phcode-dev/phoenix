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

/*global describe, it, expect, beforeAll, afterAll, afterEach, awaitsFor, awaitsForDone, jsPromise */

define(function (require, exports, module) {


    const SpecRunnerUtils = require("spec/SpecRunnerUtils"),
        Commands = require("command/Commands");

    describe("integration: Beautify", function () {
        let testWindow, $, brackets,
            CommandManager, FileViewController, EditorManager, FileSystem,
            BeautificationManager, testProjectPath;

        // "csharp" is a real registered language with no beautify provider shipped in core/default
        // extensions - see BeautificationManager-test.js for the same assumption.
        const provider = {
            beautifyTextProvider: function (textToBeautify) {
                return Promise.resolve({originalText: textToBeautify, changedText: "beautified!"});
            },
            beautifyEditorProvider: function (editor) {
                return Promise.resolve({originalText: editor.document.getText(), changedText: "beautified!"});
            }
        };

        beforeAll(async function () {
            // do not use force option in brackets core integration tests. Tests are assumed to reuse the existing
            // test window instance for fast runs.
            testWindow = await SpecRunnerUtils.createTestWindowAndRun();
            brackets = testWindow.brackets;
            $ = testWindow.$;
            CommandManager = brackets.test.CommandManager;
            FileViewController = brackets.test.FileViewController;
            EditorManager = brackets.test.EditorManager;
            FileSystem = brackets.test.FileSystem;
            BeautificationManager = brackets.test.BeautificationManager;

            testProjectPath = SpecRunnerUtils.getTempDirectory() + "/beautify-test";
            await SpecRunnerUtils.createTempDirectory();
            await SpecRunnerUtils.ensureExistsDirAsync(testProjectPath);
            await jsPromise(SpecRunnerUtils.createTextFile(
                testProjectPath + "/plain.txt", "hello world", FileSystem));
            await jsPromise(SpecRunnerUtils.createTextFile(
                testProjectPath + "/sample.cs", "original code", FileSystem));

            await SpecRunnerUtils.loadProjectInTestWindow(testProjectPath);
            BeautificationManager.registerBeautificationProvider(provider, ["csharp"]);
        }, 30000);

        afterAll(async function () {
            // safety net: if the test that registers this provider fails/times out before reaching its
            // own cleanup, or never runs at all, don't leak the registration past this suite.
            try {
                BeautificationManager.removeBeautificationProvider(provider, ["csharp"]);
            } catch (e) {
                // provider was never registered - nothing to clean up.
            }
            testWindow = null;
            $ = null;
            brackets = null;
            CommandManager = null;
            FileViewController = null;
            EditorManager = null;
            FileSystem = null;
            BeautificationManager = null;
            await SpecRunnerUtils.closeTestWindow();
        }, 30000);

        afterEach(async function () {
            testWindow.brackets.test.MainViewManager._closeAll(testWindow.brackets.test.MainViewManager.ALL_PANES);
            // safety net: a failing test could otherwise leave "beautify on save" toggled on and leak
            // into other tests/suites.
            let beautifyOnSaveCmd = CommandManager.get(Commands.EDIT_BEAUTIFY_CODE_ON_SAVE);
            if(beautifyOnSaveCmd.getChecked()){
                await awaitsForDone(CommandManager.execute(Commands.EDIT_BEAUTIFY_CODE_ON_SAVE), "beautify on save reset");
            }
        });

        it("should not show an error popup saving a file type with no beautify provider (#3103)", async function () {
            // regression test: https://github.com/phcode-dev/phoenix/issues/3103
            // Saving a file whose type has no registered beautification provider (eg. plain text) with
            // "beautify on save" enabled should silently be a no-op instead of showing an error popover.
            await awaitsForDone(CommandManager.execute(Commands.EDIT_BEAUTIFY_CODE_ON_SAVE), "enable beautify on save");
            await awaitsForDone(FileViewController.openAndSelectDocument(
                testProjectPath + "/plain.txt", FileViewController.PROJECT_MANAGER), "open plain.txt");

            let editor = EditorManager.getActiveEditor();
            editor.document.replaceRange(" edited", editor.getEndingCursorPos());
            await awaitsForDone(CommandManager.execute(Commands.FILE_SAVE), "save plain.txt");

            // A regression here would only show up asynchronously (beautifyEditor's provider lookup
            // rejects a couple of promise ticks after "documentSaved" fires), so drain the microtask
            // queue a generous number of times before asserting nothing happened. This is a fixed
            // number of microtask hops, not a wall-clock wait, so it can't be flaky.
            for (let i = 0; i < 20; i++) {
                await Promise.resolve();
            }

            expect($(".popover-message").length).toBe(0);
            expect(editor.document.getText()).toBe("hello world edited");
        });

        it("should beautify on save when a provider is registered for the file type", async function () {
            await awaitsForDone(CommandManager.execute(Commands.EDIT_BEAUTIFY_CODE_ON_SAVE), "enable beautify on save");
            await awaitsForDone(FileViewController.openAndSelectDocument(
                testProjectPath + "/sample.cs", FileViewController.PROJECT_MANAGER), "open sample.cs");

            let editor = EditorManager.getActiveEditor();
            expect(editor.document.getText()).toBe("original code");
            // FILE_SAVE (and thus the "documentSaved" event beautify-on-save listens for) is a no-op
            // unless the document is dirty, so make an edit first.
            editor.document.replaceRange(" edited", editor.getEndingCursorPos());
            await awaitsForDone(CommandManager.execute(Commands.FILE_SAVE), "save sample.cs");

            await awaitsFor(function () {
                return editor.document.getText() === "beautified!";
            }, "waiting for beautify on save done", 5000);
            expect(editor.document.getText()).toBe("beautified!");
        });
    });
});
