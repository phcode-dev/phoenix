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

/*global describe, it, expect, beforeEach, beforeAll, afterEach, afterAll, waits, awaitsForDone, spyOn , awaits*/

define(function (require, exports, module) {


    var SpecRunnerUtils  = require("spec/SpecRunnerUtils"),
        FileSystem       = require("filesystem/FileSystem"),
        StringUtils      = require("utils/StringUtils"),
        Strings          = require("strings");

    describe("integration: Code Inspection Fixes", function () {
        var testFolder,
            testWindow,
            $,
            brackets,
            CodeInspection,
            CommandManager,
            Commands  = require("command/Commands"),
            EditorManager,
            DocumentManager,
            PreferencesManager,
            prefs;

        function findWordPosition(line, word) {
            const index = line.indexOf(word);
            return {
                start: index,
                end: index + word.length
            };
        }

        let invalidFix;

        function scanFile(text, fullPath) {
            const currentEditor = EditorManager.getActiveEditor();
            if(currentEditor.document.file.fullPath !== fullPath) {
                return null;
            }
            text = currentEditor.document.getText();
            const lines = text.split('\n');
            const errors = [];

            lines.forEach((line, index) => {
                const lineNumber = index; // Convert to 1-based index

                if (line.includes('this line an error') || line.includes('this line a fixable error')) {
                    const error = {
                        pos: { line: lineNumber, ch: 0 },
                        endPos: { line: lineNumber, ch: line.length -1 },
                        message: line,
                        type: CodeInspection.Type.META
                    };

                    if (line.includes('this line a fixable error')) {
                        const wordPosition = findWordPosition(line, 'fixable');
                        error.fix = invalidFix ? invalidFix : {
                            replaceText: "no",
                            rangeOffset: {
                                start: currentEditor.indexFromPos({line: lineNumber, ch: wordPosition.start}),
                                end: currentEditor.indexFromPos({line: lineNumber, ch: wordPosition.end})
                            }
                        };
                    }

                    errors.push(error);
                }
            });

            return {errors};
        }

        let linterName = "vbscript mock linter";
        function createVBScriptInspector() {
            const provider = {
                name: linterName,
                scanFile
            };

            CodeInspection.register("vbscript", provider);

            return provider;
        }

        beforeAll(async function () {
            testWindow = await SpecRunnerUtils.createTestWindowAndRun();
            // Load module instances from brackets.test
            $ = testWindow.$;
            brackets = testWindow.brackets;
            CommandManager = brackets.test.CommandManager;
            DocumentManager = brackets.test.DocumentManager;
            EditorManager = brackets.test.EditorManager;
            prefs = brackets.test.PreferencesManager.getExtensionPrefs("linting");
            CodeInspection = brackets.test.CodeInspection;
            PreferencesManager = brackets.test.PreferencesManager;
            createVBScriptInspector();
            CodeInspection.toggleEnabled(true);
            testFolder = await SpecRunnerUtils.getTempTestDirectory("/spec/CodeInspection-test-files/");
            await SpecRunnerUtils.loadProjectInTestWindow(testFolder);
        }, 30000);

        afterEach(async function () {
            await testWindow.closeAllFiles();
            invalidFix = null;
        });

        afterAll(async function () {
            testWindow    = null;
            await SpecRunnerUtils.closeTestWindow();
        }, 30000);

        async function _openProjectFile(fileName) {
            await awaitsForDone(SpecRunnerUtils.openProjectFiles([fileName]), "opening "+ fileName);
        }

        it("should run test linter when a vbscript document opens show fix buttons in the panel", async function () {
            await _openProjectFile("testFix.vbs");

            expect($("#problems-panel").is(":visible")).toBeTrue();
            expect($("#problems-panel .ph-fix-problem").length).toBe(5); // 5 fix buttons should be there
            expect($("#problems-panel .problems-fix-all-btn").is(":visible")).toBeTrue();

            await _openProjectFile("testNoFix.vbs");
            expect($("#problems-panel").is(":visible")).toBeTrue();
            expect($("#problems-panel .ph-fix-problem").length).toBe(0);
            expect($("#problems-panel .problems-fix-all-btn").is(":visible")).toBeFalse();
        });

        it("should fixable file has repair icon", async function () {
            await _openProjectFile("testFix.vbs");

            expect($("#problems-panel").is(":visible")).toBeTrue();
            expect($("#status-inspection").hasClass("inspection-repair")).toBeTrue();
            expect($("#status-inspection").hasClass("inspection-errors")).toBeFalse();

            await _openProjectFile("testNoFix.vbs");
            expect($("#status-inspection").hasClass("inspection-repair")).toBeFalse();
            expect($("#status-inspection").hasClass("inspection-errors")).toBeTrue();
        });

        function fileLineProblem(lineNumber) {
            return $("#problems-panel").find('td.line-number[data-line="' + lineNumber + '"]');
        }

        it("should remember scroll positions", async function () {
            if(Phoenix.isTestWindowGitHubActions && Phoenix.platform === "win" && Phoenix.isNativeApp){
                // scroll test doesn't work in GitHub actions in windows desktop apps.
                return;
            }
            await _openProjectFile("testFix.vbs");

            expect($("#problems-panel").is(":visible")).toBeTrue();

            CodeInspection.scrollToProblem(40);
            const line40ScrollTop = $(".table-container").scrollTop();
            expect(fileLineProblem(40).is(":visible")).toBeTrue();
            expect(line40ScrollTop).not.toBe(0);

            await _openProjectFile("testNoFix.vbs");
            // this has to be 0 as we have not scrolled this file yet
            expect($(".table-container").scrollTop()).toBe(0);

            // now switch back and verify if the old scroll position of the problem is restored.
            await _openProjectFile("testFix.vbs");
            expect($(".table-container").scrollTop()).toBe(line40ScrollTop);
            CodeInspection.scrollToProblem(40);
        });

        it("should show quick view over problem", async function () {
            await _openProjectFile("testFix.vbs");

            expect($("#problems-panel").is(":visible")).toBeTrue();

            const $popup = await SpecRunnerUtils.showQuickViewAtPos(2, 3);
            expect($popup.is(":visible")).toBeTrue();
            expect($popup.text().includes("this line an error")).toBeTrue();
            SpecRunnerUtils.dismissQuickView($popup);
        });

        async function _validateScroll(lineNumber) {
            CodeInspection.scrollToProblem(lineNumber);
            const expectedScrollTop = $(".table-container").scrollTop();
            $(".table-container").scrollTop(0);

            const $popup = await SpecRunnerUtils.showQuickViewAtPos(lineNumber, 3);
            expect($popup.is(":visible")).toBeTrue();
            $popup.find(".code-inspection-item div").click();
            expect($(".table-container").scrollTop()).toBe(expectedScrollTop);
            SpecRunnerUtils.dismissQuickView($popup);
        }

        it("should clicking on quick view scroll to the editor", async function () {
            await _openProjectFile("testFix.vbs");

            expect($("#problems-panel").is(":visible")).toBeTrue();
            await  _validateScroll(64);

            await _openProjectFile("testNoFix.vbs");

            expect($("#problems-panel").is(":visible")).toBeTrue();
            await  _validateScroll(57);
        });

        async function _triggerLint(fileName) {
            await _openProjectFile("no-errors.js");
            await _openProjectFile(fileName);
        }

        it("should fix by clicking fix button in quick view and undo", async function () {
            await _openProjectFile("testFix.vbs");

            expect($("#problems-panel").is(":visible")).toBeTrue();
            const $popup = await SpecRunnerUtils.showQuickViewAtPos(64, 3);
            expect($popup.is(":visible")).toBeTrue();
            expect($("#problems-panel .ph-fix-problem").length).toBe(5); // 5 fix buttons should be there
            $popup.find(".code-inspection-item button").click();
            expect($("#problems-panel .ph-fix-problem").length).toBe(4); // 4 fix buttons as one is fixed
            SpecRunnerUtils.dismissQuickView($popup);

            const editor = EditorManager.getActiveEditor();
            expect(editor.getSelectedText()).toBe("no");

            // undo should work
            await awaitsForDone(CommandManager.execute(Commands.EDIT_UNDO), "undo");
            expect(editor.getSelectedText()).toBe("fixable");
            await _triggerLint("testFix.vbs");
            expect($("#problems-panel .ph-fix-problem").length).toBe(5); // 5 fix buttons should be there
        });

        it("should fix all by clicking fix all button and undo", async function () {
            await _openProjectFile("testFix.vbs");
            const editor = EditorManager.getActiveEditor();
            editor.setCursorPos(1, 1);

            expect($("#problems-panel").is(":visible")).toBeTrue();
            expect($("#problems-panel .ph-fix-problem").length).toBe(5); // 5 fix buttons should be there

            // fix all
            $($("#problems-panel").find(".problems-fix-all-btn")).click();
            expect($("#problems-panel .ph-fix-problem").length).toBe(0); // 0 fix button as all fixed

            // fixing multiple should place the cursor on first fix
            expect(editor.hasSelection()).toBeFalse();
            expect(editor.getCursorPos()).toEql({line: 10, ch: 12, sticky: null});

            await awaitsForDone(CommandManager.execute(Commands.EDIT_UNDO), "undo");
            expect(editor.hasSelection()).toBeFalse();
            expect(editor.getSelections().length).toBe(1); // no multi cursor on undo

            await _triggerLint("testFix.vbs");
            expect($("#problems-panel .ph-fix-problem").length).toBe(5); // 5 fix buttons should be there
        });

        it("should fix one error by clicking fix button and undo", async function () {
            await _openProjectFile("testFix.vbs");
            const editor = EditorManager.getActiveEditor();
            editor.setCursorPos(1, 1);

            expect($("#problems-panel").is(":visible")).toBeTrue();
            expect($("#problems-panel .ph-fix-problem").length).toBe(5); // 5 fix buttons should be there

            // fix first error
            $($("#problems-panel").find(".ph-fix-problem")[0]).click();
            expect($("#problems-panel .ph-fix-problem").length).toBe(4);

            // fixing multiple should place the cursor on first fix
            expect(editor.getSelectedText()).toBe("no");

            // undo should work
            await awaitsForDone(CommandManager.execute(Commands.EDIT_UNDO), "undo");
            expect(editor.getSelectedText()).toBe("fixable");
            await _triggerLint("testFix.vbs");
            expect($("#problems-panel .ph-fix-problem").length).toBe(5); // 5 fix buttons should be there
        });

        async function _validateCannotFix(fixAll, message=Strings.CANNOT_FIX_MESSAGE) {
            await _openProjectFile("testFix.vbs");
            const editor = EditorManager.getActiveEditor();
            editor.setCursorPos(1, 1);

            expect($("#problems-panel").is(":visible")).toBeTrue();
            expect($("#problems-panel .ph-fix-problem").length).toBe(5); // 5 fix buttons should be there

            // now change doc to invalidate all fixes
            editor.replaceRange("hello", {line:0, ch: 0}, {line:1, ch: 0});

            // fix error should raise an error dialog
            if(fixAll){
                $($("#problems-panel").find(".problems-fix-all-btn")).click();
            } else {
                $($("#problems-panel").find(".ph-fix-problem")[0]).click();
            }

            // fixing multiple should place the cursor on first fix
            await SpecRunnerUtils.waitForModalDialog();
            const dialogText = $(".error-dialog").text();
            expect(dialogText.includes(Strings.CANNOT_FIX_TITLE)).toBeTrue();
            expect(dialogText.includes(message)).toBeTrue();

            await SpecRunnerUtils.clickDialogButton();
        }

        it("should not be able to fix 1 error if document changed in between lint", async function () {
            await _validateCannotFix();
        });

        it("should not be able to fix all error if document changed in between lint", async function () {
            await _validateCannotFix(true);
        });

        async function _validateNoFixableErrors() {
            await _openProjectFile("testFix.vbs");
            const editor = EditorManager.getActiveEditor();
            editor.setCursorPos(1, 1);

            expect($("#problems-panel").is(":visible")).toBeTrue();
            expect($("#problems-panel .ph-fix-problem").length).toBe(0); // 5 fix buttons should be there
        }

        it("should not be able to fix if invalid fix supplied", async function () {
            invalidFix = {
                replaceText: "no",
                rangeOffset: {
                    start: -1,
                    end: -1
                }
            };
            await _validateNoFixableErrors();
        });

        it("should not be able to fix if invalid fix supplied 2", async function () {
            invalidFix = {
                replaceText: "no",
                rangeOffset: {
                    end: 999999
                }
            };
            await _validateNoFixableErrors();
        });

        it("should not be able to fix if invalid fix supplied 3", async function () {
            invalidFix = {
                replaceText: "no",
                rangeOffset: {}
            };
            await _validateNoFixableErrors();
        });

        it("should not be able to fix if invalid fix supplied 4", async function () {
            invalidFix = {
                replaceText: {}, // only text can be provided here
                rangeOffset: { // range valid but not text
                    start: 2,
                    end: 5
                }
            };
            await _validateNoFixableErrors();
        });
    });
});
