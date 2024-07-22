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

/*global describe, it, expect, beforeAll, afterAll, beforeEach, awaitsForDone, awaits, awaitsFor, path, jsPromise */

define(function (require, exports, module) {


    var SpecRunnerUtils = require("spec/SpecRunnerUtils");

    describe("integration:HtmlTagSyncEdit", function () {
        const testRootSpec = "/spec/HtmlTagSyncEdit-test-files/";
        let testProjectsFolder = SpecRunnerUtils.getTestPath(testRootSpec),
            Strings     = require("strings"),
            testWindow,
            $, __PR; // __PR can be debugged using debug menu> phoenix code diag tools> test builder

        beforeAll(async function () {
            testWindow = await SpecRunnerUtils.createTestWindowAndRun();
            // Load module instances from brackets.test
            $ = testWindow.$;
            await SpecRunnerUtils.loadProjectInTestWindow(testProjectsFolder);
            __PR = testWindow.__PR;
            testWindow.___syncEditEnabledForTests = true;
        }, 30000);

        afterAll(async function () {
            await __PR.closeAll();
            testWindow.___syncEditEnabledForTests = false;
            testWindow    = null;
            $             = null;
            __PR          = null;
            await SpecRunnerUtils.closeTestWindow();
        }, 30000);

        it("should underline all locations where sync edit is supported", async function () {
            await __PR.openFile("a.html");
            __PR.setCursors(["8:10"]);
            __PR.validateMarks("startTagSyncEdit", ["8:10-8:13"]);
            __PR.setCursors(["8:13"]);
            __PR.validateMarks("startTagSyncEdit", ["8:10-8:13"]);
            __PR.setCursors(["13:10"]);
            __PR.validateMarks("startTagSyncEdit", []);
            __PR.setCursors(["13:11"]);
            __PR.validateMarks("endTagSyncEdit", ["13:11-13:14"]);
            __PR.setCursors(["13:14"]);
            __PR.validateMarks("endTagSyncEdit", ["13:11-13:14"]);
            __PR.setCursors(["16:15"]);
            __PR.validateMarks("startTagSyncEdit", ["16:14-16:15"]);
            __PR.setCursors(["18:16"]);
            __PR.validateMarks("endTagSyncEdit", ["18:15-18:16"]);
            __PR.setCursors(["11:20"]);
            __PR.validateMarks("startTagSyncEdit", ["11:18-11:22"]);
            __PR.setCursors(["11:42"]);
            __PR.validateMarks("endTagSyncEdit", ["11:40-11:44"]);
            __PR.setCursors(["4:12"]);
            __PR.validateMarks("startTagSyncEdit", []);
            await __PR.closeFile();
        });

        it("should edit a tag with backspace key making it empty and then edit as expected", async function () {
            await __PR.openFile("a.html");

            __PR.setCursors(["16:15"]);
            __PR.keydown(["BACK_SPACE"]);
            __PR.validateMarks("startTagSyncEdit", ["16:14-16:14"]);
            __PR.validateMarks("endTagSyncEdit", ["18:15-18:15"]);
            __PR.typeAtCursor("hi");
            __PR.validateMarks("startTagSyncEdit", ["16:14-16:16"]);
            __PR.validateText(`hi`, "16:14-16:16");
            __PR.validateText(`hi`, "18:15-18:17");
            await __PR.undo();
            __PR.validateMarks("startTagSyncEdit", ["16:14-16:14"]);
            await __PR.undo();
            __PR.validateText(`a`, "16:14-16:15");
            __PR.validateText(`a`, "18:15-18:16");
            await __PR.closeFile();
        });
    });
});
