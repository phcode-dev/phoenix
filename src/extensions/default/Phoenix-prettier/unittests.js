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

/*global describe, it, expect, beforeEach, afterEach, awaitsForDone*/

define(function (require, exports, module) {


    let SpecRunnerUtils = brackets.getModule("spec/SpecRunnerUtils"),
        Editor = brackets.getModule("editor/Editor").Editor,
        FileUtils = brackets.getModule('file/FileUtils'),
        BeautificationManager = brackets.getModule("features/BeautificationManager");

    const PLATFORM_LINE_ENDINGS = (FileUtils.getPlatformLineEndings() === 'CRLF' ? "\r\n" : "\n");

    require("./main");

    const jsFile = require("text!../../../../test/spec/prettier-test-files/js/test.js"),
        jsPrettyFile = require("text!../../../../test/spec/prettier-test-files/js/test-pretty.js"),
        jsPrettySelection = require("text!../../../../test/spec/prettier-test-files/js/test-pretty-selection.js"),
        jsPrettySelectionOffset = require("text!../../../../test/spec/prettier-test-files/js/test-pretty-selection-offset.js"),
        jsPrettySingleSpace = require("text!../../../../test/spec/prettier-test-files/js/test-pretty-single-space.js"),
        jsPrettyTabs = require("text!../../../../test/spec/prettier-test-files/js/test-pretty-tabs.txt");

    const htmlFile = require("text!../../../../test/spec/prettier-test-files/html/test.html"),
        htmlPrettyFile = require("text!../../../../test/spec/prettier-test-files/html/test-pretty.html"),
        htmlPrettySelection = require("text!../../../../test/spec/prettier-test-files/html/test-pretty-selection.html"),
        htmlPrettySelectionOffset = require("text!../../../../test/spec/prettier-test-files/html/test-pretty-selection-offset.html"),
        htmlPrettySingleSpace = require("text!../../../../test/spec/prettier-test-files/html/test-pretty-single-space.html"),
        htmlPrettyTabs = require("text!../../../../test/spec/prettier-test-files/html/test-pretty-tabs.txt");

    const cssFile = require("text!../../../../test/spec/prettier-test-files/css/test.css"),
        cssPrettyFile = require("text!../../../../test/spec/prettier-test-files/css/test-pretty.css"),
        cssPrettySelection = require("text!../../../../test/spec/prettier-test-files/css/test-pretty-selection.css");

    const mdFile = require("text!../../../../test/spec/prettier-test-files/test.md"),
        mdPrettyFile = require("text!../../../../test/spec/prettier-test-files/test-pretty.md"),
        lessFile = require("text!../../../../test/spec/prettier-test-files/test.less"),
        lessPrettyFile = require("text!../../../../test/spec/prettier-test-files/test-pretty.less"),
        jsonFile = require("text!../../../../test/spec/prettier-test-files/test.json"),
        jsonPrettyFile = require("text!../../../../test/spec/prettier-test-files/test-pretty.json");

    describe("integration: Phoenix Prettier", function () {
        let testEditor, testDocument;

        function createMockEditor(text, language, filename) {
            let mock = SpecRunnerUtils.createMockEditor(text, language, undefined,
                {filename: filename});
            testEditor = mock.editor;
            testDocument = mock.doc;
        }

        describe("JS Beautify", function (){
            afterEach(async function () {
                SpecRunnerUtils.destroyMockEditor(testDocument);
                Editor.setUseTabChar(false);
                Editor.setSpaceUnits(4);
            });

            it("should beautify editor for js", async function () {
                createMockEditor(jsFile, "javascript", "/test.js");
                await BeautificationManager.beautifyEditor(testEditor);
                expect(testEditor.document.getText(true)).toBe(jsPrettyFile);
            });

            it("should beautify editor respect space options for js", async function () {
                createMockEditor(jsFile, "javascript", "/test.js");
                Editor.setUseTabChar(false);
                Editor.setSpaceUnits(1);
                await BeautificationManager.beautifyEditor(testEditor);
                expect(testEditor.document.getText(true)).toBe(jsPrettySingleSpace);
            });

            it("should beautify editor respect tab options for js", async function () {
                createMockEditor(jsFile, "javascript", "/test.js");
                Editor.setUseTabChar(true);
                Editor.setTabSize(4);
                await BeautificationManager.beautifyEditor(testEditor);
                expect(testEditor.document.getText(true)).toBe(jsPrettyTabs);
            });

            it("should beautify editor selection for js", async function () {
                createMockEditor(jsFile, "javascript", "/test.js");
                testEditor.setSelection({line: 0, ch: 0}, {line: 0, ch: 39});
                await BeautificationManager.beautifyEditor(testEditor);
                expect(testEditor.document.getText(true)).toBe(jsPrettySelection);
            });

            it("should beautify editor selection with offset for js", async function () {
                createMockEditor(jsFile, "javascript", "/test.js");
                testEditor.setSelection({line: 4, ch: 0}, {line: 6, ch: 0});
                await BeautificationManager.beautifyEditor(testEditor);
                expect(testEditor.document.getText(true)+ PLATFORM_LINE_ENDINGS).toBe(jsPrettySelectionOffset);
            });

            it("should not beautify editor on incomplete syntax selection for js", async function () {
                createMockEditor(jsFile, "javascript", "/test.js");
                testEditor.setSelection({line: 0, ch: 0}, {line: 0, ch: 35});
                try{
                    await BeautificationManager.beautifyEditor(testEditor);
                    expect("should have not beautified").toBeFalsy();
                } catch (e) {
                    expect(testEditor.document.getText(true)).toBe(jsFile);
                }
            });
        });

        describe("HTML Beautify", function (){
            afterEach(async function () {
                SpecRunnerUtils.destroyMockEditor(testDocument);
                Editor.setUseTabChar(false);
                Editor.setSpaceUnits(4);
            });

            it("should beautify editor for html", async function () {
                createMockEditor(htmlFile, "html", "/test.html");
                await BeautificationManager.beautifyEditor(testEditor);
                expect(testEditor.document.getText(true)).toBe(htmlPrettyFile);
            });

            it("should beautify editor respect space options for html", async function () {
                createMockEditor(htmlFile, "html", "/test.html");
                Editor.setUseTabChar(false);
                Editor.setSpaceUnits(1);
                await BeautificationManager.beautifyEditor(testEditor);
                expect(testEditor.document.getText(true)).toBe(htmlPrettySingleSpace);
            });

            it("should beautify editor respect tab options for html", async function () {
                createMockEditor(htmlFile, "html", "/test.html");
                Editor.setUseTabChar(true);
                Editor.setTabSize(4);
                await BeautificationManager.beautifyEditor(testEditor);
                expect(testEditor.document.getText(true)).toBe(htmlPrettyTabs);
            });

            it("should beautify editor selection for html", async function () {
                createMockEditor(htmlFile, "html", "/test.html");
                testEditor.setSelection({line: 0, ch: 0}, {line: 0, ch: 39});
                await BeautificationManager.beautifyEditor(testEditor);
                expect(testEditor.document.getText(true)).toBe(htmlPrettySelection);
            });

            it("should beautify editor selection with offset for html", async function () {
                createMockEditor(htmlFile, "html", "/test.html");
                testEditor.setSelection({line: 4, ch: 0}, {line: 6, ch: 0});
                await BeautificationManager.beautifyEditor(testEditor);
                expect(testEditor.document.getText(true)+ PLATFORM_LINE_ENDINGS).toBe(htmlPrettySelectionOffset);
            });

            it("should not beautify editor on incomplete syntax selection for html", async function () {
                createMockEditor(htmlFile, "html", "/test.html");
                testEditor.setSelection({line: 0, ch: 0}, {line: 0, ch: 10});
                try{
                    await BeautificationManager.beautifyEditor(testEditor);
                    expect("should have not beautified").toBeFalsy();
                } catch (e) {
                    expect(testEditor.document.getText(true)).toBe(htmlFile);
                }
            });
        });

        describe("CSS Beautify", function (){
            afterEach(async function () {
                SpecRunnerUtils.destroyMockEditor(testDocument);
                Editor.setUseTabChar(false);
                Editor.setSpaceUnits(4);
            });

            it("should beautify editor for css", async function () {
                createMockEditor(cssFile, "css", "/test.css");
                await BeautificationManager.beautifyEditor(testEditor);
                expect(testEditor.document.getText(true)).toBe(cssPrettyFile);
            });

            it("should beautify editor selection for css", async function () {
                createMockEditor(cssFile, "css", "/test.css");
                testEditor.setSelection({line: 0, ch: 0}, {line: 0, ch: 39});
                await BeautificationManager.beautifyEditor(testEditor);
                expect(testEditor.document.getText(true)).toBe(cssPrettySelection);
            });

            it("should not beautify editor on incomplete syntax selection for css", async function () {
                createMockEditor(cssFile, "css", "/test.css");
                testEditor.setSelection({line: 0, ch: 0}, {line: 0, ch: 10});
                try{
                    await BeautificationManager.beautifyEditor(testEditor);
                    expect("should have not beautified").toBeFalsy();
                } catch (e) {
                    expect(testEditor.document.getText(true)).toBe(cssFile);
                }
            });
        });

        describe("MD, less, json Beautify", function (){
            afterEach(async function () {
                SpecRunnerUtils.destroyMockEditor(testDocument);
                Editor.setUseTabChar(false);
                Editor.setSpaceUnits(4);
            });

            it("should beautify editor for markdown", async function () {
                createMockEditor(mdFile, "css", "/test.md");
                await BeautificationManager.beautifyEditor(testEditor);
                expect(testEditor.document.getText(true)).toBe(mdPrettyFile);
            });

            it("should beautify editor for less", async function () {
                createMockEditor(lessFile, "less", "/test.less");
                await BeautificationManager.beautifyEditor(testEditor);
                expect(testEditor.document.getText(true)).toBe(lessPrettyFile);
            });

            it("should beautify editor for scss", async function () {
                createMockEditor("body{$font-stack: Helvetica, sans-serif;}", "scss", "/test.scss");
                await BeautificationManager.beautifyEditor(testEditor);
                expect(testEditor.document.getText()).toBe("body {\n" +
                    "    $font-stack: Helvetica, sans-serif;\n" +
                    "}\n");
            });

            it("should beautify editor for json", async function () {
                createMockEditor(jsonFile, "json", "/test.json");
                await BeautificationManager.beautifyEditor(testEditor);
                expect(testEditor.document.getText(true)).toBe(jsonPrettyFile);
            });

            it("should beautify editor for xml", async function () {
                createMockEditor("<a id='1'></a>", "xml", "/test.xml");
                await BeautificationManager.beautifyEditor(testEditor);
                expect(testEditor.document.getText()).toBe('<a id="1"></a>\n');
            });

            it("should beautify editor for svg", async function () {
                createMockEditor("<svg id='1'></svg>", "svg", "/test.svg");
                await BeautificationManager.beautifyEditor(testEditor);
                expect(testEditor.document.getText()).toBe('<svg id="1"></svg>\n');
            });

            it("should beautify editor for yaml", async function () {
                createMockEditor("x:\n y", "typescript", "/test.yaml");
                await BeautificationManager.beautifyEditor(testEditor);
                expect(testEditor.document.getText()).toBe('x: y\n');
            });

            it("should beautify editor for jsx", async function () {
                createMockEditor("const element = <h1>\nHello, {name}</h1>;", "jsx", "/test.jsx");
                await BeautificationManager.beautifyEditor(testEditor);
                expect(testEditor.document.getText()).toBe('const element = <h1>Hello, {name}</h1>;\n');
            });

            it("should beautify editor for tsx", async function () {
                createMockEditor("const element = <h1>\nHello, {name}</h1>;", "tsx", "/test.tsx");
                await BeautificationManager.beautifyEditor(testEditor);
                expect(testEditor.document.getText()).toBe('const element = <h1>Hello, {name}</h1>;\n');
            });

            it("should beautify editor for typescript", async function () {
                createMockEditor("function x(){x;}", "typescript", "/test.ts");
                await BeautificationManager.beautifyEditor(testEditor);
                expect(testEditor.document.getText()).toBe('function x() {\n' +
                    '    x;\n' +
                    '}\n');
            });

            it("should beautify editor for php", async function () {
                createMockEditor("<?php\n" +
                    "echo \"Hello World!\";\n" +
                    "?> ", "php", "/test.php");
                await BeautificationManager.beautifyEditor(testEditor);
                expect(testEditor.document.getText()).toBe("<?php\n" +
                    "echo \"Hello World!\"; ?> ");
            });

            it("should beautify editor restore cursor position", async function () {
                createMockEditor("function x(){x;}", "typescript", "/test.ts");
                testEditor.setCursorPos(0, 13);
                await BeautificationManager.beautifyEditor(testEditor);
                expect(testEditor.document.getText()).toBe('function x() {\n' +
                    '    x;\n' +
                    '}\n');
                const cursor = testEditor.getCursorPos();
                expect(cursor.line).toBe(1);
                expect(cursor.ch).toBe(4);
            });
        });
    });
});
