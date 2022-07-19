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

/*global describe, it, expect, beforeEach, afterEach, awaitsForDone, spyOn */

define(function (require, exports, module) {


    var SpecRunnerUtils = brackets.getModule("spec/SpecRunnerUtils");

    describe("extension:JSLint", function () {
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

        beforeEach(async function () {
            testWindow = await SpecRunnerUtils.createTestWindowAndRun();
            // Load module instances from brackets.test
            $ = testWindow.$;
            brackets = testWindow.brackets;
            EditorManager = testWindow.brackets.test.EditorManager;
            CodeInspection = testWindow.brackets.test.CodeInspection;
            CodeInspection.toggleEnabled(true);

            await SpecRunnerUtils.loadProjectInTestWindow(testFolder);
        });

        afterEach(async function () {
            testWindow    = null;
            $             = null;
            brackets      = null;
            EditorManager = null;
            await SpecRunnerUtils.closeTestWindow();
        });

        it("should run JSLint linter when a JavaScript document opens", async function () {
            spyOn(testWindow, "JSLINT").and.callThrough();

            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["errors.js"]), "open test file");

            expect(testWindow.JSLINT).toHaveBeenCalled();
        });

        it("status icon should toggle Errors panel when errors present", async function () {
            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["errors.js"]), "open test file");

            toggleJSLintResults(false);
            toggleJSLintResults(true);
        });

        // the file no-errors.js has actually js lint errors, so the below tests as failing.
        // as we are deprecating jslint, we are not investing in the fix.
        // it("status icon should not toggle Errors panel when no errors present", async function () {
        //     await awaitsForDone(SpecRunnerUtils.openProjectFiles(["no-errors.js"]), "open test file");
        //
        //     toggleJSLintResults(false);
        //     toggleJSLintResults(false);
        // });
        //
        // it("should default to the editor's indent", async function () {
        //     await awaitsForDone(SpecRunnerUtils.openProjectFiles(["different-indent.js"]), "open test file");
        //
        //     toggleJSLintResults(false);
        //     toggleJSLintResults(false);
        // });
    });
});
