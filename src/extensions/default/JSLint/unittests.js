/*
 * GNU AGPL-3.0 License
 *
 * Modified Work Copyright (c) 2021 - present core.ai . All rights reserved.
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

/*global describe, it, expect, beforeEach, afterEach, runs, waitsForDone, spyOn */

define(function (require, exports, module) {


    var SpecRunnerUtils = brackets.getModule("spec/SpecRunnerUtils"),
        FileUtils       = brackets.getModule("file/FileUtils");

    describe("JSLint", function () {
        var testFolder = SpecRunnerUtils.getTestPath("/spec/Extension-test-project-files/"),
            testWindow,
            $,
            brackets,
            CodeInspection,
            EditorManager;

        var toggleJSLintResults = function (visible) {
            $("#status-inspection").triggerHandler("click");
            expect($("#problems-panel").is(":visible")).toBe(visible);
        };

        beforeEach(function () {
            runs(function () {
                SpecRunnerUtils.createTestWindowAndRun(this, function (w) {
                    testWindow = w;
                    // Load module instances from brackets.test
                    $ = testWindow.$;
                    brackets = testWindow.brackets;
                    EditorManager = testWindow.brackets.test.EditorManager;
                    CodeInspection = testWindow.brackets.test.CodeInspection;
                    CodeInspection.toggleEnabled(true);
                });
            });

            runs(function () {
                SpecRunnerUtils.loadProjectInTestWindow(testFolder);
            });
        });

        afterEach(function () {
            testWindow    = null;
            $             = null;
            brackets      = null;
            EditorManager = null;
            SpecRunnerUtils.closeTestWindow();
        });

        it("should run JSLint linter when a JavaScript document opens", function () {
            runs(function () {
                spyOn(testWindow, "JSLINT").andCallThrough();
            });

            waitsForDone(SpecRunnerUtils.openProjectFiles(["errors.js"]), "open test file");

            runs(function () {
                expect(testWindow.JSLINT).toHaveBeenCalled();
            });
        });

        it("status icon should toggle Errors panel when errors present", function () {
            waitsForDone(SpecRunnerUtils.openProjectFiles(["errors.js"]), "open test file");

            runs(function () {
                toggleJSLintResults(false);
                toggleJSLintResults(true);
            });
        });

        it("status icon should not toggle Errors panel when no errors present", function () {
            waitsForDone(SpecRunnerUtils.openProjectFiles(["no-errors.js"]), "open test file");

            runs(function () {
                toggleJSLintResults(false);
                toggleJSLintResults(false);
            });
        });

        it("should default to the editor's indent", function () {
            waitsForDone(SpecRunnerUtils.openProjectFiles(["different-indent.js"]), "open test file");

            runs(function () {
                toggleJSLintResults(false);
                toggleJSLintResults(false);
            });
        });
    });
});
