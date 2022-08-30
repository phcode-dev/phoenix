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

/*global describe, it, expect, beforeEach, afterEach, awaitsForDone*/

define(function (require, exports, module) {


    var SpecRunnerUtils = require("spec/SpecRunnerUtils"),
        CommandManager = require("command/CommandManager"),
        Commands = require("command/Commands"),
        BeautificationManager = require("features/BeautificationManager");

    describe("unit: BeautificationManager", function () {
        let providerRangesOverride, rejectOverride;

        function getProvider(changedText, ranges) {
            return {
                beautifyTextProvider: function (textToBeautify) {
                    return new Promise((resolve, reject) => {
                        if(rejectOverride){
                            reject(rejectOverride);
                        }
                        resolve({
                            originalText: textToBeautify,
                            changedText: changedText
                        });
                    });
                },
                beautifyEditorProvider: function (editor) {
                    return new Promise((resolve, reject) => {
                        if(rejectOverride){
                            reject(rejectOverride);
                        }
                        resolve({
                            originalText: editor.document.getText(),
                            changedText: changedText,
                            ranges: providerRangesOverride || ranges // replaceStart: {line,ch}, replaceEnd: {line,ch}
                        });
                    });
                }
            };
        }

        const provider = getProvider("changedText");
        let testEditor, testDocument;

        beforeEach(async function () {
            let mock = SpecRunnerUtils.createMockEditor('csharp code',
                "csharp", // taking this language assuming that no default providers for csharp will be in core
                undefined,
                {filename: "/test.cs"});
            testEditor = mock.editor;
            testDocument = mock.doc;
        });

        afterEach(async function () {
            SpecRunnerUtils.destroyMockEditor(testDocument);
        });

        it("should register and unregister beautifier for all languages and beautifyText", async function () {
            BeautificationManager.registerBeautificationProvider(provider, ["all"]);
            let beauty = await BeautificationManager.beautifyText("hello", "test.cs");
            expect(beauty.changedText).toBe("changedText");
            BeautificationManager.removeBeautificationProvider(provider, ["all"]);
            try {
                await BeautificationManager.beautifyText("hello", "test.cs");
                expect("should not beautify text reach here").toBeFalsy();
            } catch (e) {
                expect(e).toBeDefined();
            }
        });

        it("should register and unregister beautifier honor priority", async function () {
            let provider1 = getProvider("priority1");
            BeautificationManager.registerBeautificationProvider(provider, ["javascript"]);
            BeautificationManager.registerBeautificationProvider(provider1, ["javascript"], 1);
            let beauty = await BeautificationManager.beautifyText("console.log();", "test.js");
            expect(beauty.changedText).toBe("priority1");

            BeautificationManager.removeBeautificationProvider(provider1, ["javascript"]);
            beauty = await BeautificationManager.beautifyText("console.log();", "test.js");
            expect(beauty.changedText).toBe("changedText");

            BeautificationManager.removeBeautificationProvider(provider, ["javascript"]);
            try {
                await BeautificationManager.beautifyText("hello", "test.js");
                expect("should not beautify text reach here").toBeFalsy();
            } catch (e) {
                expect(e).toBeDefined();
            }
        });

        it("should beautify editor for supported language", async function () {
            BeautificationManager.registerBeautificationProvider(provider, ["csharp"]);
            await BeautificationManager.beautifyEditor(testEditor);
            expect(testEditor.document.getText()).toBe("changedText");
            BeautificationManager.removeBeautificationProvider(provider, ["csharp"]);
        });

        it("should beautify editor throw if no provider for language", async function () {
            expect(testEditor.document.getText()).toBe("csharp code");
            try {
                await BeautificationManager.beautifyEditor(testEditor);
                expect("should not beautify editor reach here").toBeFalsy();
            } catch (e) {
                expect(e).toBeDefined();
            }
        });

        it("should not beautify editor if provider rejects", async function () {
            BeautificationManager.registerBeautificationProvider(provider, ["csharp"]);
            rejectOverride = true;
            expect(testEditor.document.getText()).toBe("csharp code");
            try {
                await BeautificationManager.beautifyEditor(testEditor);
                expect("should not beautify editor reach here").toBeFalsy();
            } catch (e) {
                expect(e).toBeDefined();
            }
            BeautificationManager.removeBeautificationProvider(provider, ["csharp"]);
            rejectOverride = false;
        });

        it("should beautify editor only replace range if provider returns range", async function () {
            let rangeProvider = getProvider("changedRange", {
                replaceStart: {line: 0, ch: 0},
                replaceEnd: {line: 0, ch: 1}
            });
            expect(testEditor.document.getText()).toBe("csharp code");
            BeautificationManager.registerBeautificationProvider(rangeProvider, ["csharp"]);
            await BeautificationManager.beautifyEditor(testEditor);
            expect(testEditor.document.getText()).toBe("changedRangesharp code");
            BeautificationManager.removeBeautificationProvider(rangeProvider, ["csharp"]);
        });

        it("should beautify editor on beautify command", async function () {
            expect(testEditor.document.getText()).toBe("csharp code");
            BeautificationManager.registerBeautificationProvider(provider, ["csharp"]);
            await awaitsForDone(CommandManager.execute(Commands.EDIT_BEAUTIFY_CODE), "beautify");
            expect(testEditor.document.getText()).toBe("changedText");
            BeautificationManager.removeBeautificationProvider(provider, ["csharp"]);
        });

        it("should beautify only editor selection on beautify command and restore selection", async function () {
            expect(testEditor.document.getText()).toBe("csharp code");
            testEditor.setSelection({line: 0, ch: 0}, {line: 0, ch: 1});
            let rangeProvider = getProvider("changedRange", {
                replaceStart: {line: 0, ch: 0},
                replaceEnd: {line: 0, ch: 1}
            });
            BeautificationManager.registerBeautificationProvider(rangeProvider, ["csharp"]);
            await awaitsForDone(CommandManager.execute(Commands.EDIT_BEAUTIFY_CODE), "beautify");
            let resultText = "changedRangesharp code";
            expect(testEditor.document.getText()).toBe(resultText);
            let selection = testEditor.getSelection();
            expect(selection.start).toEql({line: 0, ch: 0, sticky: null});
            expect(selection.end).toEql({line: 0, ch: 12, sticky: null});
            BeautificationManager.removeBeautificationProvider(rangeProvider, ["csharp"]);
        });

        it("should beautify and restore cursor position", async function () {
            expect(testEditor.document.getText()).toBe("csharp code");
            testEditor.setCursorPos(0, 3);
            BeautificationManager.registerBeautificationProvider(provider, ["csharp"]);
            await awaitsForDone(CommandManager.execute(Commands.EDIT_BEAUTIFY_CODE), "beautify");
            expect(testEditor.document.getText()).toBe("changedText");
            // ideally we should place the cursor at exactly the position of corresponding changed text than just
            // plainly restoring. but that is hard to do for now. see beautification manager for details.
            let cursor = testEditor.getCursorPos();
            expect(cursor).toEql({line: 0, ch: 3, sticky: null});
            BeautificationManager.removeBeautificationProvider(provider, ["csharp"]);
        });

        it("should toggle beautify editor on save", async function () {
            let beautifyOnSaveCmd = CommandManager.get(Commands.EDIT_BEAUTIFY_CODE_ON_SAVE);
            let initialState = !!beautifyOnSaveCmd.getChecked();
            await awaitsForDone(CommandManager.execute(Commands.EDIT_BEAUTIFY_CODE_ON_SAVE), "beautify on save");
            expect(beautifyOnSaveCmd.getChecked()).toBe(!initialState);
            await awaitsForDone(CommandManager.execute(Commands.EDIT_BEAUTIFY_CODE_ON_SAVE), "beautify on save");
            expect(beautifyOnSaveCmd.getChecked()).toBe(initialState);
        });
    });
});
