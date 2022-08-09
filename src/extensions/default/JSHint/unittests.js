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

/*global describe, it, expect, beforeEach, afterEach, awaitsForDone, awaits */

define(function (require, exports, module) {


    var SpecRunnerUtils = brackets.getModule("spec/SpecRunnerUtils");

    describe("extension:JSHint", function () {
        var testFolder = SpecRunnerUtils.getTestPath("/spec/Extension-test-project-files/"),
            testWindow,
            $,
            CodeInspection;

        var toggleJSLintResults = function () {
            $("#status-inspection").triggerHandler("click");
        };

        beforeEach(async function () {
            testWindow = await SpecRunnerUtils.createTestWindowAndRun();
            // Load module instances from brackets.test
            $ = testWindow.$;
            CodeInspection = testWindow.brackets.test.CodeInspection;
            CodeInspection.toggleEnabled(true);

            await SpecRunnerUtils.loadProjectInTestWindow(testFolder);
        }, 30000);

        afterEach(async function () {
            testWindow    = null;
            $             = null;
            await SpecRunnerUtils.closeTestWindow();
        });

        it("status icon should toggle Errors panel when errors present", async function () {
            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["errors.js"]), "open test file");
            await awaits(100);

            expect($("#problems-panel").is(":visible")).toBe(true);

            toggleJSLintResults();
            expect($("#problems-panel").is(":visible")).toBe(false);

            toggleJSLintResults();
            expect($("#problems-panel").is(":visible")).toBe(true);
        });
    });
});
