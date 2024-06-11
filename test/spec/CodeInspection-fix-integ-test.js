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


        // Tooltip is panel title, plus an informational message when there are problems.
        function buildTooltip(title) {
            return StringUtils.format(Strings.STATUSBAR_CODE_INSPECTION_TOOLTIP, title);
        }

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

        // it("should show errors underline under text in editor", async function () {
        //     let codeInspector = createCodeInspector("javascript linter", failLintResult());
        //     CodeInspection.register("javascript", codeInspector);
        //
        //     await awaitsForDone(SpecRunnerUtils.openProjectFiles(["errors.js"]), "open test file", 5000);
        //
        //     expect($("#problems-panel").is(":visible")).toBe(true);
        //     let marks = EditorManager.getActiveEditor().getAllMarks("codeInspector");
        //     expect(marks.length).toBe(1);
        //     expect(marks[0].className).toBe("editor-text-fragment-warn");
        // });
        //
        // function _hasClass(marks, className) {
        //     let errorFound = false;
        //     for(let mark of marks) {
        //         if(mark.className === className){
        //             errorFound = true;
        //             break;
        //         }
        //     }
        //     return errorFound;
        // }

        // it("should display two expanded, collapsible sections in the errors panel when two linters have errors", async function () {
        //     var codeInspector1 = createCodeInspector("javascript linter 1", failLintResult());
        //     var codeInspector2 = createCodeInspector("javascript linter 2", failLintResult());
        //     CodeInspection.register("javascript", codeInspector1);
        //     CodeInspection.register("javascript", codeInspector2);
        //
        //     await awaitsForDone(SpecRunnerUtils.openProjectFiles(["errors.js"]), "open test file", 5000);
        //
        //     var $inspectorSections = $(".inspector-section");
        //     expect($inspectorSections.length).toEqual(2);
        //     expect($inspectorSections[0].innerHTML.lastIndexOf("javascript linter 1 (1)")).not.toBe(-1);
        //     expect($inspectorSections[1].innerHTML.lastIndexOf("javascript linter 2 (1)")).not.toBe(-1);
        //
        //     var $expandedInspectorSections = $inspectorSections.find(".expanded");
        //     expect($expandedInspectorSections.length).toEqual(2);
        // });
        //
        // it("should display no header section when only one linter has errors", async function () {
        //     var codeInspector1 = createCodeInspector("javascript linter 1", failLintResult()),
        //         codeInspector2 = createCodeInspector("javascript linter 2", {errors: []}),  // 1st way of reporting 0 errors
        //         codeInspector3 = createCodeInspector("javascript linter 3", null);          // 2nd way of reporting 0 errors
        //     CodeInspection.register("javascript", codeInspector1);
        //     CodeInspection.register("javascript", codeInspector2);
        //     CodeInspection.register("javascript", codeInspector3);
        //
        //     await awaitsForDone(SpecRunnerUtils.openProjectFiles(["errors.js"]), "open test file", 5000);
        //
        //     expect($("#problems-panel").is(":visible")).toBe(true);
        //     expect($(".inspector-section").is(":visible")).toBeFalsy();
        // });
        //
        // it("should only display header sections for linters with errors", async function () {
        //     var codeInspector1 = createCodeInspector("javascript linter 1", failLintResult()),
        //         codeInspector2 = createCodeInspector("javascript linter 2", {errors: []}),  // 1st way of reporting 0 errors
        //         codeInspector3 = createCodeInspector("javascript linter 3", null),          // 2nd way of reporting 0 errors
        //         codeInspector4 = createCodeInspector("javascript linter 4", failLintResult());
        //     CodeInspection.register("javascript", codeInspector1);
        //     CodeInspection.register("javascript", codeInspector2);
        //     CodeInspection.register("javascript", codeInspector3);
        //     CodeInspection.register("javascript", codeInspector4);
        //
        //     await awaitsForDone(SpecRunnerUtils.openProjectFiles(["errors.js"]), "open test file", 5000);
        //
        //     expect($("#problems-panel").is(":visible")).toBe(true);
        //
        //     var $inspectorSections = $(".inspector-section");
        //     expect($inspectorSections.length).toEqual(2);
        //     expect($inspectorSections[0].innerHTML.indexOf("javascript linter 1 (1)")).not.toBe(-1);
        //     expect($inspectorSections[1].innerHTML.indexOf("javascript linter 4 (1)")).not.toBe(-1);
        // });
        //
        // it("status icon should toggle Errors panel when errors present", async function () {
        //     var codeInspector = createCodeInspector("javascript linter", failLintResult());
        //     CodeInspection.register("javascript", codeInspector);
        //
        //     await awaitsForDone(SpecRunnerUtils.openProjectFiles(["errors.js"]), "open test file");
        //
        //     toggleJSLintResults(false);
        //     toggleJSLintResults(true);
        // });
        //
        // it("status icon should not toggle Errors panel when no errors present", async function () {
        //     var codeInspector = createCodeInspector("javascript linter", successfulLintResult());
        //     CodeInspection.register("javascript", codeInspector);
        //
        //     await awaitsForDone(SpecRunnerUtils.openProjectFiles(["no-errors.js"]), "open test file");
        //
        //     toggleJSLintResults(false);
        //     toggleJSLintResults(false);
        // });
        //
        // it("should show the error count and the name of the linter in the panel title for one error", async function () {
        //     var codeInspector = createCodeInspector("JavaScript Linter", failLintResult());
        //     CodeInspection.register("javascript", codeInspector);
        //
        //     await awaitsForDone(SpecRunnerUtils.openProjectFiles(["errors.js"]), "open test file");
        //
        //     var $problemPanelTitle = $("#problems-panel .title").text();
        //     expect($problemPanelTitle).toBe(StringUtils.format(Strings.SINGLE_ERROR, "JavaScript Linter", "errors.js"));
        //
        //     var $statusBar = $("#status-inspection");
        //     expect($statusBar.is(":visible")).toBe(true);
        //
        //     var tooltip = $statusBar.attr("title");
        //     var expectedTooltip = buildTooltip(StringUtils.format(Strings.SINGLE_ERROR, "JavaScript Linter", "errors.js"), 1);
        //     expect(tooltip).toBe(expectedTooltip);
        // });
        //
        // it("should show the error count and the name of the linter in the panel title and tooltip for multiple errors", async function () {
        //     var lintResult = {
        //         errors: [
        //             {
        //                 pos: { line: 1, ch: 3 },
        //                 message: "Some errors here and there",
        //                 type: CodeInspection.Type.WARNING
        //             },
        //             {
        //                 pos: { line: 1, ch: 5 },
        //                 message: "Some errors there and there and over there",
        //                 type: CodeInspection.Type.WARNING
        //             }
        //         ]
        //     };
        //
        //     var codeInspector = createCodeInspector("JavaScript Linter", lintResult);
        //     CodeInspection.register("javascript", codeInspector);
        //
        //     await awaitsForDone(SpecRunnerUtils.openProjectFiles(["errors.js"]), "open test file");
        //
        //     var $problemPanelTitle = $("#problems-panel .title").text();
        //     expect($problemPanelTitle).toBe(StringUtils.format(Strings.MULTIPLE_ERRORS, 2, "JavaScript Linter", "errors.js"));
        //
        //     var $statusBar = $("#status-inspection");
        //     expect($statusBar.is(":visible")).toBe(true);
        //
        //     var tooltip = $statusBar.attr("title");
        //     var expectedTooltip = buildTooltip(StringUtils.format(Strings.MULTIPLE_ERRORS, 2, "JavaScript Linter", "errors.js"), 2);
        //     expect(tooltip).toBe(expectedTooltip);
        // });
        //
        // it("should show the generic panel title if more than one inspector reported problems", async function () {
        //     var lintResult = failLintResult();
        //
        //     var codeInspector1 = createCodeInspector("JavaScript Linter1", lintResult);
        //     CodeInspection.register("javascript", codeInspector1);
        //     var codeInspector2 = createCodeInspector("JavaScript Linter2", lintResult);
        //     CodeInspection.register("javascript", codeInspector2);
        //
        //     await awaitsForDone(SpecRunnerUtils.openProjectFiles(["errors.js"]), "open test file");
        //
        //     var $problemPanelTitle = $("#problems-panel .title").text();
        //     expect($problemPanelTitle).toBe(StringUtils.format(Strings.ERRORS_PANEL_TITLE_MULTIPLE, 2, "errors.js"));
        //
        //     var $statusBar = $("#status-inspection");
        //     expect($statusBar.is(":visible")).toBe(true);
        //
        //     var tooltip = $statusBar.attr("title");
        //     // tooltip will contain + in the title if the inspection was aborted
        //     var expectedTooltip = buildTooltip(StringUtils.format(Strings.ERRORS_PANEL_TITLE_MULTIPLE, 2, "errors.js"), 2);
        //     expect(tooltip).toBe(expectedTooltip);
        // });
        //
        // it("should show no problems tooltip in status bar for multiple inspectors", async function () {
        //     var codeInspector = createCodeInspector("JavaScript Linter1", successfulLintResult());
        //     CodeInspection.register("javascript", codeInspector);
        //     codeInspector = createCodeInspector("JavaScript Linter2", successfulLintResult());
        //     CodeInspection.register("javascript", codeInspector);
        //
        //     await awaitsForDone(SpecRunnerUtils.openProjectFiles(["errors.js"]), "open test file");
        //
        //     var $statusBar = $("#status-inspection");
        //     expect($statusBar.is(":visible")).toBe(true);
        //
        //     var tooltip = $statusBar.attr("title");
        //     var expectedTooltip = buildTooltip(Strings.NO_ERRORS_MULTIPLE_PROVIDER, 0);
        //     expect(tooltip).toBe(expectedTooltip);
        // });
        //
        // it("should show no problems tooltip in status bar for 1 inspector", async function () {
        //     var codeInspector = createCodeInspector("JavaScript Linter1", successfulLintResult());
        //     CodeInspection.register("javascript", codeInspector);
        //
        //     await awaitsForDone(SpecRunnerUtils.openProjectFiles(["errors.js"]), "open test file");
        //
        //     var $statusBar = $("#status-inspection");
        //     expect($statusBar.is(":visible")).toBe(true);
        //
        //     var tooltip = $statusBar.attr("title");
        //     var expectedTooltip = buildTooltip(StringUtils.format(Strings.NO_ERRORS, "JavaScript Linter1"), 0);
        //     expect(tooltip).toBe(expectedTooltip);
        // });
        //
        // it("should handle missing or negative line numbers gracefully (https://github.com/adobe/brackets/issues/6441)", async function () {
        //     var codeInspector1 = createCodeInspector("NoLineNumberLinter", {
        //         errors: [
        //             {
        //                 pos: { line: -1, ch: 0 },
        //                 message: "Some errors here and there",
        //                 type: CodeInspection.Type.WARNING
        //             }
        //         ]
        //     });
        //
        //     var codeInspector2 = createCodeInspector("NoLineNumberLinter2", {
        //         errors: [
        //             {
        //                 pos: { line: "all", ch: 0 },
        //                 message: "Some errors here and there",
        //                 type: CodeInspection.Type.WARNING
        //             }
        //         ]
        //     });
        //     CodeInspection.register("javascript", codeInspector1);
        //     CodeInspection.register("javascript", codeInspector2);
        //
        //     await awaitsForDone(SpecRunnerUtils.openProjectFiles(["errors.js"]), "open test file");
        //
        //     await awaits(100);
        //     var $problemPanelTitle = $("#problems-panel .title").text();
        //     expect($problemPanelTitle).toBe(StringUtils.format(Strings.ERRORS_PANEL_TITLE_MULTIPLE, 2, "errors.js"));
        //
        //     var $statusBar = $("#status-inspection");
        //     expect($statusBar.is(":visible")).toBe(true);
        //
        //     var tooltip = $statusBar.attr("title");
        //     var expectedTooltip = buildTooltip(StringUtils.format(Strings.ERRORS_PANEL_TITLE_MULTIPLE, 2, "errors.js"), 2);
        //     expect(tooltip).toBe(expectedTooltip);
        // });
    });
});
