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

/*global describe, it, beforeAll, afterAll, beforeEach*/

define(function (require, exports, module) {


    var SpecRunnerUtils = require("spec/SpecRunnerUtils");

    describe("integration:ColorPreview in gutter - needs focus", function () {
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
            EditorManager = testWindow.brackets.test.EditorManager;
        }, 30000);

        afterAll(async function () {
            await __PR.closeAll();
            await __PR.EDITING.splitNone();
            testWindow    = null;
            __PR          = null;
            EditorManager = null;
            await SpecRunnerUtils.closeTestWindow();
        }, 30000);

        beforeEach(async function () {
            await __PR.closeAll();
        });

        it("should color gutter not appear in cpp files", async function () {
            const fileName = "a.cpp";
            await __PR.writeTextFile(fileName, "#include <iostream>", true);
            await __PR.openFile(fileName);
            const editor = EditorManager.getActiveEditor();
            __PR.validateEqual(editor.isGutterActive(GUTTER_NAME), false);
            await __PR.closeFile();
        });

        function parseColorToRGB(color) {
            // Create a temporary element to leverage the browser’s color parsing
            const temp = document.createElement("div");
            temp.style.color = color;
            document.body.appendChild(temp);

            // Compute the color set by the browser
            const parsedColor = window.getComputedStyle(temp).color; // returns in rgb(...) format
            document.body.removeChild(temp);

            return parsedColor;
        }

        function areColorsEqual($element, color) {
            const elem = $element instanceof $ ? $element[0] : $element;
            const computedStyle = window.getComputedStyle(elem);

            const elementColor = computedStyle.backgroundColor;  // typically returns "rgb(r, g, b)"
            const normalizedGivenColor = parseColorToRGB(color); // convert given color to "rgb(r, g, b)"

            return elementColor === normalizedGivenColor;
        }

        function validateMultipleColors(editor, lineNumber, colors) {
            const gutterMarker = $(editor.getGutterMarker(lineNumber, GUTTER_NAME)).find(".color-box");
            let numColors = gutterMarker.length;
            __PR.validateEqual(numColors, colors.length);
            for(let i=0; i<numColors; i++) {
                __PR.validateEqual(areColorsEqual($(gutterMarker[i]), colors[i]), true);
            }
        }

        function validateSingleColor(editor, lineNumber, color) {
            let gutterMarker = editor.getGutterMarker(lineNumber, GUTTER_NAME);
            __PR.validateEqual(areColorsEqual($(gutterMarker), color), true);
        }

        function validateNoColors(editor, lineNumber) {
            const gutterMarker = editor.getGutterMarker(lineNumber, GUTTER_NAME);
            if(gutterMarker) {
                __PR.validateEqual(gutterMarker.classList.contains(DUMMY_GUTTER_CLASS), true);
                return;
            }
            __PR.validateEqual(!!gutterMarker, false);
        }

        function testFile(baseFileName, fileName) {
            async function init() {
                const htmlText = await __PR.readTextFile(baseFileName);
                await __PR.writeTextFile(fileName, htmlText, true);
                await __PR.openFile(fileName);
                const editor = EditorManager.getActiveEditor();
                __PR.validateEqual(editor.isGutterActive(GUTTER_NAME), true);

                // the line with cursor if there is no color should have a dummy color gutter
                __PR.setCursors(["1:1"]);
                return editor;
            }

            it(`should color gutter appear as expected ${fileName}`, async function () {
                const editor = await init();
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
                        __PR.validateEqual(!!gutterMarker, false,
                            `expected no color box at line ${line}` + editor.getLine(line));
                    } else if(singleColorBoxesInLines.includes(line)) {
                        __PR.validateEqual(gutterMarker.classList.contains(SINGLE_COLOR_PREVIEW_CLASS), true,
                            `expected single color box at line ${line}` + editor.getLine(line));
                    } else if(multiColorBoxesInLines.includes(line)) {
                        __PR.validateEqual(gutterMarker.classList.contains(MULTI_COLOR_PREVIEW_CLASS), true,
                            `expected multi color box at line ${line}` + editor.getLine(line));
                    }
                }
                await __PR.closeFile();

            });

            it(`should color gutter show correct colors in box ${fileName}`, async function () {
                const editor = await init();
                validateSingleColor(editor, 8, "blue");
                validateSingleColor(editor, 11, "#00ff8c");

                // multiple colors
                validateMultipleColors(editor, 12, ["#00ff8c", "red"]);
                validateMultipleColors(editor, 13, ["#b7ff00", "green", "#3e4395"]);
                validateMultipleColors(editor, 14, ["#ff0090", "#802095", "#954e3e", "#454e3e"]);
                validateMultipleColors(editor, 15, ["#ff0090", "#802095", "#954e3e", "#454e3e"]);
                await __PR.closeFile();
            });

            it(`should block commenting remove color previews in ${fileName}`, async function () {
                if(fileName === "a.sass"){
                    // block commenting in sass is not supported for the test file, so omitting that test
                    return;
                }
                const editor = await init();
                __PR.setCursors(["12:1-16:85"]);
                await __PR.execCommand(__PR.Commands.EDIT_BLOCK_COMMENT);
                let gutterMarker = editor.getGutterMarker(8, GUTTER_NAME);
                __PR.validateEqual(areColorsEqual($(gutterMarker), "blue"), true);

                // multiple colors
                validateNoColors(editor, 11);
                validateNoColors(editor, 12);
                validateNoColors(editor, 13);
                validateNoColors(editor, 14);
                validateNoColors(editor, 15);
                await __PR.closeFile();
            });

            function _verifyExpectedColors(editor, lines) {
                let gutterMarker = editor.getGutterMarker(lines[0], GUTTER_NAME);
                __PR.validateEqual(areColorsEqual($(gutterMarker), "blue"), true);
                gutterMarker = editor.getGutterMarker(lines[1], GUTTER_NAME);
                __PR.validateEqual(areColorsEqual($(gutterMarker), "#00ff8c"), true);

                // multiple colors
                validateMultipleColors(editor, lines[2], ["#00ff8c", "red"]);
                validateMultipleColors(editor, lines[3], ["#b7ff00", "green", "#3e4395"]);
                validateMultipleColors(editor, lines[4], ["#ff0090", "#802095", "#954e3e", "#454e3e"]);
                validateMultipleColors(editor, lines[5], ["#ff0090", "#802095", "#954e3e", "#454e3e"]);
            }

            it(`should show color previews after beautify HTML code in ${fileName}`, async function () {
                if(["a.php", "a.jsx", "a.tsx"].includes(fileName) || fileName === "a.sass"){
                    // the test sass, jsx, tsx and php files cant be beautified, so ignoring for now
                    return;
                }
                const editor = await init();
                await __PR.execCommand(__PR.Commands.EDIT_BEAUTIFY_CODE);
                if(baseFileName === "base.css"){
                    await __PR.awaitsFor(async ()=>{
                        if(editor.getLine(0) !== ".class-one {"){
                            await __PR.execCommand(__PR.Commands.EDIT_BEAUTIFY_CODE);
                            return false;
                        }
                        return true;
                    }, "for beautify complete", 2000, 50);
                    _verifyExpectedColors(editor, [8, 12, 15, 18, 21, 24]);
                    await __PR.closeFile();
                    return;
                }
                await __PR.awaitsFor(async ()=>{
                    if(editor.getLine(2) !== "    <head>"){
                        await __PR.execCommand(__PR.Commands.EDIT_BEAUTIFY_CODE);
                        return false;
                    }
                    return true;
                }, "for beautify complete", 2000, 50);
                _verifyExpectedColors(editor, [8, 12, 13, 14, 15, 16]);
                await __PR.closeFile();
            });

            it(`should toggle quick edit on single colors ${fileName}`, async function () {
                const editor = await init();
                let gutterMarker = editor.getGutterMarker(8, GUTTER_NAME);
                __PR.validateEqual(areColorsEqual($(gutterMarker), "blue"), true);
                gutterMarker.click();
                await __PR.awaitsFor(()=>{
                    return __PR.$(".CodeMirror-linewidget").length === 1;
                }, "quick edit to appear");
                gutterMarker.click();
                await __PR.awaitsFor(()=>{
                    return __PR.$(".CodeMirror-linewidget").length === 0;
                }, "quick edit to go");
                await __PR.closeFile();
            });

            it(`should toggle quick edit on multiple colors ${fileName}`, async function () {
                const editor = await init();
                let gutterMarker = editor.getGutterMarker(15, GUTTER_NAME);
                const individualColors = $(gutterMarker).find(".color-box");
                individualColors[0].click();
                await __PR.awaitsFor(()=>{
                    return __PR.$(".CodeMirror-linewidget").length === 1 &&
                        areColorsEqual(__PR.$(".CodeMirror-linewidget").find(".original-color")[0], "#ff0090");
                }, "quick edit to color #ff0090 appear");
                individualColors[2].click();
                await __PR.awaitsFor(()=>{
                    return __PR.$(".CodeMirror-linewidget").length === 1 &&
                        areColorsEqual(__PR.$(".CodeMirror-linewidget").find(".original-color")[0], "#954e3e");
                }, "quick edit to color #954e3e appear");
                await __PR.closeFile();
            });

            it(`should color gutter track correct line numbers after deleting lines in ${fileName}`, async function () {
                const editor = await init();
                validateMultipleColors(editor, 12, ["#00ff8c", "red"]);

                __PR.setCursors(["6:1-10:2"]);
                __PR.keydown(["BACK_SPACE"]); // this will delete the selected lines

                // now the color gutter should account for the missing lines
                let gutterMarker = editor.getGutterMarker(11, GUTTER_NAME);
                const individualColors = $(gutterMarker).find(".color-box");
                individualColors[0].click();
                await __PR.awaitsFor(()=>{
                    return __PR.$(".CodeMirror-linewidget").length === 1 &&
                        areColorsEqual(__PR.$(".CodeMirror-linewidget").find(".original-color")[0], "#ff0090");
                }, "quick edit to color #ff0090 appear");
                individualColors[2].click();
                await __PR.awaitsFor(()=>{
                    return __PR.$(".CodeMirror-linewidget").length === 1 &&
                        areColorsEqual(__PR.$(".CodeMirror-linewidget").find(".original-color")[0], "#954e3e");
                }, "quick edit to color #954e3e appear");
                await __PR.closeFile();
            });

            it(`should update colors on typing ${fileName}`, async function () {
                const editor = await init();
                validateSingleColor(editor, 8, "blue");

                if(baseFileName === "base.css"){
                    __PR.setCursors(["9:16"]);
                } else {
                    __PR.setCursors(["9:23"]);
                }
                __PR.typeAtCursor(" red");
                validateMultipleColors(editor, 8, ["blue", "red"]);
                await __PR.undo();
                validateSingleColor(editor, 8, "blue");
                __PR.typeAtCursor("x");
                validateNoColors(editor, 8);
                await __PR.closeFile();
            });

            it(`should deleting at end of file and appending should bring back color ${fileName}`, async function () {
                const editor = await init();

                __PR.setCursors(["12:1-33:1"]);
                __PR.keydown(["BACK_SPACE"]); // this will delete the colors at end of file
                __PR.validateEqual(editor.lineCount(), 12);
                await __PR.undo();
                _verifyExpectedColors(editor, [8, 11, 12, 13, 14, 15]);
                await __PR.closeFile();
            });
        }

        const htmlFiles = ["a.html", "a.htm", "a.xhtml", "a.php", "a.jsp", "a.jsx", "a.tsx"];
        for (let htmlFile of htmlFiles){
            testFile("base.html", htmlFile);
        }
        const cssFiles = ["a.css", "a.less", "a.scss", "a.sass"];
        for (let cssFile of cssFiles){
            testFile("base.css", cssFile);
        }

        it(`Changing preferences should enable or disable the color box`, async function () {
            const htmlText = await __PR.readTextFile("base.html");
            await __PR.writeTextFile("b.html", htmlText, true);
            await __PR.writeTextFile("c.html", htmlText, true);
            await __PR.EDITING.splitVertical();
            await __PR.EDITING.openFileInSecondPane("b.html");
            await __PR.EDITING.openFileInFirstPane("c.html");
            __PR.EDITING.focusFirstPane();
            let editor = EditorManager.getActiveEditor();
            __PR.validateEqual(editor.isGutterActive(GUTTER_NAME), true);
            validateSingleColor(editor, 8, "blue");

            __PR.setPreference("colorPreview", false);
            __PR.validateEqual(editor.isGutterActive(GUTTER_NAME), false);
            validateNoColors(editor, 8);
            __PR.EDITING.focusSecondPane();
            editor = EditorManager.getActiveEditor();
            __PR.validateEqual(editor.isGutterActive(GUTTER_NAME), false);
            validateNoColors(editor, 8);

            __PR.setPreference("colorPreview", true);
            __PR.validateEqual(editor.isGutterActive(GUTTER_NAME), true);
            validateSingleColor(editor, 8, "blue");
            __PR.EDITING.focusSecondPane();
            editor = EditorManager.getActiveEditor();
            __PR.validateEqual(editor.isGutterActive(GUTTER_NAME), true);
            validateSingleColor(editor, 8, "blue");

            await __PR.closeFile();
        });

        it(`should color gutter appear for SVG files`, async function () {
            await __PR.openFile("base.svg");
            const editor = EditorManager.getActiveEditor();
            __PR.validateEqual(editor.isGutterActive(GUTTER_NAME), true);

            // the line with cursor if there is no color should have a dummy color gutter
            __PR.setCursors(["1:1"]);
            for(let i in [0, 2, 4, 5, 7, 8, 9, 11, 12, 13, 14, 17, 18, 19, 20]){
                validateNoColors(editor, i);
            }
            validateSingleColor(editor, 1, "#7f6ad3"); // fill attr
            validateMultipleColors(editor, 3, ["red", "blue"]); // from, to attrs
            validateMultipleColors(editor, 6, ["red", "#00ff00"]); // stroke attr
            validateSingleColor(editor, 10, "yellow"); // flood-color attr
            validateSingleColor(editor, 15, "coral"); // in css style tags
            validateSingleColor(editor, 16, "navy"); // in css style tag
            validateSingleColor(editor, 21, "red"); // stop-color attr
            validateSingleColor(editor, 22, "blue"); // stop-color attr
            await __PR.closeFile();

        });
    });
});
