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
                        error.fix = {
                            replaceText: "",
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

        let linterCount = 0;
        function createVBScriptInspector() {
            linterCount++;
            const provider = {
                name: "vbscript mock linter" + linterCount,
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

        // todo fix one, fix all, fix one undo, fix all undo, quick view error click, quick view fix click
        // todo invalid fixes test, doc changed after fix dialog

    });
});
