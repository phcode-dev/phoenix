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

    describe("integration:ColorPreview in gutter", function () {
        const testRootSpec = "/spec/CSSColorPreview-test-files/";
        const GUTTER_NAME = "CodeMirror-colorGutter",
            SINGLE_COLOR_PREVIEW_CLASS   = "ico-cssColorPreview",
            MULTI_COLOR_PREVIEW_CLASS   = "ico-multiple-cssColorPreview",
            DUMMY_GUTTER_CLASS   = "CodeMirror-colorGutter-none";
        let testProjectFolder,
            testWindow,
            EditorManager,
            __PR; // __PR can be debugged using debug menu> phoenix code diag tools> test builder

        beforeAll(async function () {
            testWindow = await SpecRunnerUtils.createTestWindowAndRun();
            // Load module instances from brackets.test
            testProjectFolder = await SpecRunnerUtils.getTempTestDirectory(testRootSpec);
            await SpecRunnerUtils.loadProjectInTestWindow(testProjectFolder);
            __PR = testWindow.__PR;
            EditorManager = testWindow.EditorManager;
        }, 30000);

        afterAll(async function () {
            await __PR.closeAll();
            testWindow    = null;
            __PR          = null;
            EditorManager = null;
            await SpecRunnerUtils.closeTestWindow();
        }, 30000);

        it("should color gutter not appear in cpp files", async function () {
            const fileName = "a.cpp";
            await __PR.writeTextFile(fileName, "#include <iostream>", true);
            await __PR.openFile(fileName);
            const editor = EditorManager.getActiveEditor();
            __PR.validateEqual(editor.isGutterActive(GUTTER_NAME), false);
            await __PR.closeFile();
        });

        function testHTMLFile(fileName) {
            it(`should color gutter appear as expected ${fileName}`, async function () {
                const htmlText = await __PR.readTextFile("base.html");
                await __PR.writeTextFile(fileName, htmlText, true);
                await __PR.openFile(fileName);
                const editor = EditorManager.getActiveEditor();
                __PR.validateEqual(editor.isGutterActive(GUTTER_NAME), true);

                // the line with cursor if there is no color should have a dummy color gutter
                __PR.setCursors(["1:1"]);
                let gutterMarker = editor.getGutterMarker(0, GUTTER_NAME);
                __PR.validateEqual(gutterMarker.classList.contains(DUMMY_GUTTER_CLASS), true);

                // should have no color boxes as expected
                const colorBoxesInLines = [8, 11, 12, 13, 14, 15];
                const singleColorBoxesInLines = [8, 11];
                const multiColorBoxesInLines = [12, 13, 14, 15];
                for (let line = 1; line < editor.lineCount(); line++) {
                    gutterMarker = editor.getGutterMarker(line, GUTTER_NAME);
                    if (!colorBoxesInLines.includes(line)) {
                        // there should be no color box here
                        __PR.validateEqual(!!gutterMarker, false);
                    } else if(singleColorBoxesInLines.includes(line)) {
                        __PR.validateEqual(gutterMarker.classList.contains(SINGLE_COLOR_PREVIEW_CLASS), true);
                    } else if(multiColorBoxesInLines.includes(line)) {
                        __PR.validateEqual(gutterMarker.classList.contains(MULTI_COLOR_PREVIEW_CLASS), true);
                    }
                }
                await __PR.closeFile();

            });
        }

        const htmlFiles = ["a.html", "a.htm", "a.xhtml", "a.php", "a.jsp"];
        for(let htmlFile of htmlFiles){
            testHTMLFile(htmlFile);
        }
    });
});
