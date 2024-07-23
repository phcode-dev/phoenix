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
            testWindow,
            __PR; // __PR can be debugged using debug menu> phoenix code diag tools> test builder

        beforeAll(async function () {
            testWindow = await SpecRunnerUtils.createTestWindowAndRun();
            // Load module instances from brackets.test
            await SpecRunnerUtils.loadProjectInTestWindow(testProjectsFolder);
            __PR = testWindow.__PR;
            testWindow.___syncEditEnabledForTests = true;
        }, 30000);

        afterAll(async function () {
            await __PR.closeAll();
            testWindow.___syncEditEnabledForTests = false;
            testWindow    = null;
            __PR          = null;
            await SpecRunnerUtils.closeTestWindow();
        }, 30000);

        function testFile(fileName) {
            it(`should underline all locations where sync edit is supported ${fileName}`, async function () {
                await __PR.openFile(fileName);
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

            async function _testEmptyATag() {
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
            }

            it(`should edit a tag with backspace key making it empty and then edit as expected ${fileName}`, async function () {
                await __PR.openFile(fileName);
                __PR.setCursors(["16:15"]);
                __PR.keydown(["BACK_SPACE"]);
                await _testEmptyATag();
                await __PR.closeFile();
            });

            it(`should edit a tag with delete key making it empty and then edit as expected ${fileName}`, async function () {
                await __PR.openFile(fileName);
                __PR.setCursors(["16:14"]);
                __PR.keydown(["DELETE"]);
                await _testEmptyATag();
                await __PR.closeFile();
            });

            it(`should be able to edit over tag selection and undo to sync update tags ${fileName}`, async function () {
                await __PR.openFile(fileName);
                __PR.setCursors(["20:11-20:14"]);
                __PR.typeAtCursor("hello");
                __PR.validateText(`hello`, "14:10-14:15");
                __PR.validateText(`hello`, "20:11-20:16");
                await __PR.undo();
                __PR.validateText(`div`, "20:11-20:14");
                __PR.validateText(`div`, "14:10-14:13");
                __PR.expectCursorsToBe(["20:11-20:14"]);
                await __PR.closeFile();
            });

            it(`should multi cursor stop sync tag rename ${fileName}`, async function () {
                await __PR.openFile(fileName);
                __PR.setCursors(["13:13"]);
                __PR.validateMarks("endTagSyncEdit", ["13:11-13:14"]);
                __PR.setCursors(["8:12", "13:13"]);
                __PR.validateMarks("endTagSyncEdit", [], 0);
                __PR.setCursors(["13:12"]);
                __PR.validateMarks("endTagSyncEdit", ["13:11-13:14"]);
                await __PR.closeFile();
            });

            it(`should clicking out on a non-sync editable location clear underlines ${fileName}`, async function () {
                await __PR.openFile(fileName);
                __PR.setCursors(["8:12"]);
                __PR.validateMarks("startTagSyncEdit", ["8:10-8:13"]);
                __PR.setCursors(["10:24"]);
                __PR.validateMarks("endTagSyncEdit", [], 0);
                __PR.setCursors(["9:15"]);
                __PR.validateMarks("startTagSyncEdit", ["9:14-9:15"]);
                __PR.setCursors(["9:16"]);
                __PR.validateMarks("endTagSyncEdit", [], 0);
                await __PR.closeFile();
            });

            it(`should cursor positions be as expected while typing start tag ${fileName}`, async function () {
                await __PR.openFile(fileName);

                __PR.setCursors(["9:14"]);
                __PR.typeAtCursor("t");
                __PR.expectCursorsToBe(["9:15"]);
                __PR.validateText(`ti`, "12:15-12:17");

                __PR.setCursors(["9:16"]);
                __PR.typeAtCursor("m");
                __PR.expectCursorsToBe(["9:17"]);
                __PR.validateText(`tim`, "12:15-12:18");

                __PR.setCursors(["9:15"]);
                __PR.typeAtCursor("p");
                __PR.setCursors(["9:16"]);
                __PR.validateText(`tpim`, "12:15-12:19");
                await __PR.closeFile();
            });

            it(`should cursor positions be as expected while typing end tag on same line ${fileName}`, async function () {
                await __PR.openFile(fileName);

                __PR.setCursors(["11:36"]);
                __PR.typeAtCursor("t");
                __PR.expectCursorsToBe(["11:38"]);
                __PR.validateText(`tu`, "11:24-11:26");

                __PR.setCursors(["11:39"]);
                __PR.typeAtCursor("m");
                __PR.expectCursorsToBe(["11:41"]);
                __PR.validateText(`tum`, "11:24-11:27");

                __PR.setCursors(["11:39"]);
                __PR.typeAtCursor("i");
                __PR.setCursors(["11:41"]);
                __PR.validateText(`tium`, "11:24-11:28");
                await __PR.closeFile();
            });

            it(`should escape key disable tag sync edit till it moves out of the current tag ${fileName}`, async function () {
                await __PR.openFile(fileName);

                __PR.setCursors(["8:12"]);
                __PR.keydown(["ESCAPE"]);
                __PR.validateMarks("endTagSyncEdit", [], 0);
                __PR.setCursors(["8:13"]);
                __PR.validateMarks("endTagSyncEdit", [], 0);
                __PR.setCursors(["8:12"]);
                __PR.typeAtCursor("p");
                __PR.validateText(`dipv`, "8:10-8:14");
                __PR.validateText(`div`, "13:11-13:14");
                __PR.validateMarks("endTagSyncEdit", [], 0);
                // now move to another tag inside the boken tag, it should be sync editable in most cases
                __PR.setCursors(["9:15"]);
                __PR.validateMarks("startTagSyncEdit", ["9:14-9:15"]);
                await __PR.closeFile();
            });

            it(`should be able to disable tag sync feature with preference for ${fileName}`, async function () {
                await __PR.openFile(fileName);
                __PR.setCursors(["8:12"]);
                __PR.validateMarks("startTagSyncEdit", ["8:10-8:13"]);
                __PR.setPreference("autoRenameTags", false);
                __PR.validateAllMarks("startTagSyncEdit", []);
                __PR.setPreference("autoRenameTags", true);
                __PR.validateMarks("startTagSyncEdit", ["8:10-8:13"]);
                await __PR.closeFile();
            });
        }

        const htmlFiles = ["a.html", "a.htm", "a.xhtml", "a.php", "a.xml"];
        for(let htmlFile of htmlFiles){
            testFile(htmlFile);
        }
    });
});
