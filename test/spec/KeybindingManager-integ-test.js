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

/*global describe, it, expect, beforeAll, afterAll, beforeEach, awaitsFor, awaitsForDone, awaits */

define(function (require, exports, module) {
    // Recommended to avoid reloading the integration test window Phoenix instance for each test.

    const SpecRunnerUtils     = require("spec/SpecRunnerUtils"),
        StringUtils      = require("utils/StringUtils"),
        KeyEvent = require("utils/KeyEvent"),
        Keys                = require("command/Keys");

    const testPath = SpecRunnerUtils.getTestPath("/spec/JSUtils-test-files");

    let FileViewController,     // loaded from brackets.test
        FileSystem,         // loaded from brackets.test;
        FileUtils,
        CommandManager,
        EditorManager,
        Commands,
        KeyBindingManager,
        testWindow,
        brackets;

    function _writeKeyboardJson(tempKeyboardConfigPath, text='{"overrides":{}}') {
        return new Promise((resolve, reject)=>{
            window.fs.writeFile(tempKeyboardConfigPath, text, 'utf8', (err)=>{
                if(err) {
                    reject();
                } else {
                    resolve();
                }
            });
        });
    }

    function _readKeyboardJson(tempKeyboardConfigPath) {
        return new Promise((resolve, reject)=>{
            window.fs.readFile(tempKeyboardConfigPath, 'utf8', (err, content)=>{
                if(err) {
                    reject();
                } else {
                    resolve(content);
                }
            });
        });
    }

    describe("integration:Keyboard Shortcut Dialog integ tests", function () {
        let keyboadrJsonEditor, originalBeautifyBinding;

        beforeAll(async function () {
            // do not use force option in brackets core integration tests. Tests are assumed to reuse the existing
            // test window instance for fast runs.
            testWindow = await SpecRunnerUtils.createTestWindowAndRun();
            brackets            = testWindow.brackets;
            FileViewController  = brackets.test.FileViewController;
            FileSystem      = brackets.test.FileSystem;
            FileUtils     = brackets.test.FileUtils;
            CommandManager      = brackets.test.CommandManager;
            Commands            = brackets.test.Commands;
            KeyBindingManager   = brackets.test.KeyBindingManager;
            EditorManager   = brackets.test.EditorManager;

            await SpecRunnerUtils.loadProjectInTestWindow(testPath);
            await SpecRunnerUtils.ensureExistsDirAsync(window.path.dirname(KeyBindingManager._getUserKeyMapFilePath()));

            await _writeKeyboardJson(KeyBindingManager._getUserKeyMapFilePath());
            await KeyBindingManager._loadUserKeyMapImmediate();
            await awaitsForDone(FileViewController.openAndSelectDocument(
                KeyBindingManager._getUserKeyMapFilePath(),
                FileViewController.PROJECT_MANAGER
            ),"keyboard.json top open in editor");
            keyboadrJsonEditor = EditorManager.getActiveEditor();
            originalBeautifyBinding = KeyBindingManager.getKeyBindings(Commands.EDIT_BEAUTIFY_CODE);
        }, 30000);

        beforeEach(async ()=>{
            await _writeKeyboardJson(KeyBindingManager._getUserKeyMapFilePath());
            await KeyBindingManager._loadUserKeyMapImmediate();
            await awaitsFor(async ()=>{
                const textJson = JSON.parse(await _readKeyboardJson(KeyBindingManager._getUserKeyMapFilePath()));
                return Object.keys(textJson.overrides).length === 0;
            }, "reset user shortcuts");
            await awaitsFor(()=>{
                const binding = KeyBindingManager.getKeyBindings(Commands.EDIT_BEAUTIFY_CODE);
                if(!binding[0].key === originalBeautifyBinding[0].key){
                    console.log(binding, originalBeautifyBinding);
                }
                return binding[0].key === originalBeautifyBinding[0].key;
            }, "Original key binding");
        });

        afterAll(async function () {
            await KeyBindingManager._loadUserKeyMapImmediate();
            FileViewController  = null;
            FileSystem      = null;
            testWindow = null;
            EditorManager = null;
            brackets = null;
            KeyBindingManager = null;
            FileUtils = null;
            // comment out below line if you want to debug the test window post running tests
            await SpecRunnerUtils.closeTestWindow();
        }, 30000);

        function keyboardType(key, altKey, shiftKey) {
            const ctrlEvent = new KeyboardEvent("keydown", {
                key: key,
                bubbles: true, // Event bubbles up through the DOM
                cancelable: true, // Event can be canceled,
                code: key,
                altKey,
                shiftKey,
                keyCode: (key === Keys.KEY.ESCAPE ? KeyEvent.DOM_VK_ESCAPE : undefined)
            });
            testWindow.$("#Phoenix-Main")[0].dispatchEvent(ctrlEvent);
        }

        function openEditMenu() {
            if(!testWindow.$("#edit-menu .dropdown-menu").is(":visible")){
                testWindow.$("#edit-menu-dropdown-toggle").click();
            }
            expect(testWindow.$("#edit-menu .dropdown-menu").is(":visible")).toBeTrue();
        }

        function getEditMenuElementSelector(editMenuItemCommand) {
            return `#edit-menu-${StringUtils.jQueryIdEscape(editMenuItemCommand)}`;
        }

        function getKeyboardElementSelector(editMenuItemCommand) {
            return `${getEditMenuElementSelector(editMenuItemCommand)} .keyboard-icon`;
        }

        function clickKeyboardIcon(editMenuItemCommand) {
            openEditMenu();
            testWindow.$(getKeyboardElementSelector(editMenuItemCommand)).click();
        }

        function selectMenuItem(editMenuItemCommand) {
            openEditMenu();
            testWindow.$("#edit-menu .dropdown-menu .menuAnchor").removeClass("selected");
            testWindow.$(getEditMenuElementSelector(editMenuItemCommand)).addClass("selected");
        }

        async function editShortcut(editMenuCommand) {
            clickKeyboardIcon(editMenuCommand);
            await awaitsFor(()=>{
                return testWindow.$(".change-shortcut-dialog").is(":visible");
            }, "change shortcut dialog to be visible");
        }

        it("Should show keyboard shortcut select dialog on click on keyboard icon", async function () {
            await editShortcut(Commands.EDIT_BEAUTIFY_CODE);
            // escape should exit
            testWindow.$(".change-shortcut-dialog .Cancel").click();
            await awaitsFor(()=>{
                return !testWindow.$(".change-shortcut-dialog").is(":visible");
            }, "dialog to be dismissed");
        });

        it("Should show keyboard icon on allowed commands", async function () {
            openEditMenu();
            selectMenuItem(Commands.EDIT_BEAUTIFY_CODE);
            expect(testWindow.$(getKeyboardElementSelector(Commands.EDIT_BEAUTIFY_CODE)).is(':visible')).toBeTrue();
        });

        it("Should not show keyboard icon on reserved commands", async function () {
            openEditMenu();
            selectMenuItem(Commands.EDIT_UNDO);
            expect(testWindow.$(getKeyboardElementSelector(Commands.EDIT_UNDO)).is(':visible')).toBeFalse();
            expect(testWindow.$(`${getEditMenuElementSelector(Commands.EDIT_UNDO)} .fixed-shortcut`).length).toBe(1);
        });

        it("Should be able to remove a shortcut", async function () {
            await editShortcut(Commands.EDIT_BEAUTIFY_CODE);
            testWindow.$(".change-shortcut-dialog .Remove").click();
            let existingBinding = KeyBindingManager.getKeyBindings(Commands.EDIT_BEAUTIFY_CODE);
            await awaitsFor(async ()=>{
                const textJson = JSON.parse(await _readKeyboardJson(KeyBindingManager._getUserKeyMapFilePath()));
                return textJson.overrides[existingBinding[0].key] === null;
            }, "command to be removed");
        });

        it("Should be able to assign Function key shortcut association", async function () {
            await editShortcut(Commands.EDIT_BEAUTIFY_CODE);
            keyboardType('F6');
            await awaitsFor(async ()=>{
                const textJson = JSON.parse(await _readKeyboardJson(KeyBindingManager._getUserKeyMapFilePath()));
                return textJson.overrides['F6'] === Commands.EDIT_BEAUTIFY_CODE;
            }, "F6 to be assigned");
        });

        it("Should be able to assign Shift-Function key shortcut association", async function () {
            await editShortcut(Commands.EDIT_BEAUTIFY_CODE);
            keyboardType('Shift-F6');
            await awaitsFor(async ()=>{
                const textJson = JSON.parse(await _readKeyboardJson(KeyBindingManager._getUserKeyMapFilePath()));
                return textJson.overrides['Shift-F6'] === Commands.EDIT_BEAUTIFY_CODE;
            }, "Shift-F6 to be assigned");
        });

        it("Should be able to assign overwrite shortcut association", async function () {
            await editShortcut(Commands.EDIT_BEAUTIFY_CODE);
            keyboardType('F6');
            await awaitsFor(async ()=>{
                const binding = KeyBindingManager.getKeyBindings(Commands.EDIT_BEAUTIFY_CODE);
                return binding[0].key === 'F6';
            }, "F6 to be assigned");
            // now overwrite
            await editShortcut(Commands.EDIT_BEAUTIFY_CODE);
            keyboardType('F1',undefined);
            await awaitsFor(async ()=>{
                return testWindow.$(".change-shortcut-dialog .Assign").is(":visible");
            }, "Apply button to be visible");
            const errorMessageShown = testWindow.$(".change-shortcut-dialog .message").text();
            expect(errorMessageShown).toEql("Warning: The key combination F1 is already assigned to 'Quick Docs'. Reassign to 'Beautify Code'?");
            expect(testWindow.$(".change-shortcut-dialog .Remove").is(":visible")).toBeFalse();
            expect(testWindow.$(".change-shortcut-dialog .Cancel").is(":visible")).toBeTrue();
            expect(testWindow.$(".change-shortcut-dialog .Assign").is(":visible")).toBeTrue();
            testWindow.$(".change-shortcut-dialog .Assign").click();
            await awaitsFor(async ()=>{
                const textJson = JSON.parse(await _readKeyboardJson(KeyBindingManager._getUserKeyMapFilePath()));
                return textJson.overrides['F1'] === Commands.EDIT_BEAUTIFY_CODE;
            }, "F1 to be assigned");
        });

        it("Should be able to cancel an overwrite shortcut association", async function () {
            await editShortcut(Commands.EDIT_BEAUTIFY_CODE);
            keyboardType('F1',undefined);
            await awaitsFor(async ()=>{
                return testWindow.$(".change-shortcut-dialog .Assign").is(":visible");
            }, "Apply button to be visible");
            expect(testWindow.$(".change-shortcut-dialog .Remove").is(":visible")).toBeFalse();
            expect(testWindow.$(".change-shortcut-dialog .Cancel").is(":visible")).toBeTrue();
            expect(testWindow.$(".change-shortcut-dialog .Assign").is(":visible")).toBeTrue();
            testWindow.$(".change-shortcut-dialog .Cancel").click();
            await awaits(200);
            const textJson = JSON.parse(await _readKeyboardJson(KeyBindingManager._getUserKeyMapFilePath()));
            expect(textJson.overrides).toEql({});
            expect(testWindow.$(".change-shortcut-dialog").is(":visible")).toBeFalse();
        });

        // it("Should be able to cancel a shortcut association", async function () {
        //     await editShortcut(Commands.EDIT_BEAUTIFY_CODE);
        //     keyboardType('Z', true);
        //     expect(testWindow.$(".change-shortcut-dialog .Remove").is(":visible")).toBeFalse();
        //     expect(testWindow.$(".change-shortcut-dialog .Cancel").is(":visible")).toBeTrue();
        //     expect(testWindow.$(".change-shortcut-dialog .Assign").is(":visible")).toBeTrue();
        //     testWindow.$(".change-shortcut-dialog .Cancel").click();
        // });
    });
});
