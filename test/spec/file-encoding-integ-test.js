/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 * Original work Copyright (c) 2012 - 2021 Adobe Systems Incorporated. All rights reserved.
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

/*global describe, it, expect, beforeAll, afterAll, awaitsFor, awaitsForDone */

define(function (require, exports, module) {
    // Recommended to avoid reloading the integration test window Phoenix instance for each test.

    const SpecRunnerUtils     = require("spec/SpecRunnerUtils"),
        KeyEvent         = require("utils/KeyEvent");

    const testPath = SpecRunnerUtils.getTestPath("/spec/encoding-test-files");

    let FileViewController,     // loaded from brackets.test,
        EditorManager,
        testWindow,
        brackets;


    describe("integration:File Encoding tests", function () {

        beforeAll(async function () {
            // do not use force option in brackets core integration tests. Tests are assumed to reuse the existing
            // test window instance for fast runs.
            testWindow = await SpecRunnerUtils.createTestWindowAndRun();
            brackets            = testWindow.brackets;
            FileViewController  = brackets.test.FileViewController;
            EditorManager      = brackets.test.EditorManager;

            await SpecRunnerUtils.loadProjectInTestWindow(testPath);
        }, 30000);

        afterAll(async function () {
            FileViewController  = null;
            EditorManager      = null;
            testWindow = null;
            brackets = null;
            // comment out below line if you want to debug the test window post running tests
            await SpecRunnerUtils.closeTestWindow();
        }, 30000);

        function typeInEncodingPopup(text) {
            for(let char of text){
                testWindow.$(".dropdown-status-bar")[0].dispatchEvent(new KeyboardEvent("keydown", {
                    key: char,
                    bubbles: true, // Event bubbles up through the DOM
                    cancelable: true // Event can be canceled
                }));
            }
        }

        const EXPECTED_TEXT_UTF16 = "première is first\n" +
            "première is slightly different\n" +
            "Кириллица is Cyrillic\n" +
            "𐐀 am Deseret\n";

        const EXPECTED_TEXT_KOI8 = "premi?re is first\n" +
            "premie?re is slightly different\n" +
            "Кириллица is Cyrillic\n" +
            "? am Deseret\n";

        async function verifyOpenEncoding(encoding, expectedText, location = 1) {
            await awaitsForDone(
                FileViewController.openAndSelectDocument(
                    testPath + `/${encoding}.txt`,
                    FileViewController.PROJECT_MANAGER
                ));

            // now change encoding to utf16
            testWindow.$("#status-encoding .btn").click();
            typeInEncodingPopup(encoding);
            testWindow.$(`.dropdown-status-bar a.stylesheet-link:contains("${encoding}")`)[location].click();

            await awaitsFor(()=>{
                return EditorManager.getActiveEditor().document.getText() === expectedText;
            }, `${encoding} text`);
        }

        it("Should open file in utf 16 encoding", async function () {
            await verifyOpenEncoding("utf16", EXPECTED_TEXT_UTF16);
        });

        it("Should open file in koi8r encoding", async function () {
            await verifyOpenEncoding("koi8r", EXPECTED_TEXT_KOI8, 2);
        });

        it("Should open file in utf32le encoding", async function () {
            await verifyOpenEncoding("utf32le", EXPECTED_TEXT_UTF16);
        });

        it("Should open file in utf32be encoding", async function () {
            await verifyOpenEncoding("utf32be", EXPECTED_TEXT_UTF16);
        });
    });
});
