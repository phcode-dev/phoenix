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

/*global describe, it, expect, afterEach, beforeAll, afterAll, awaitsForDone, jsPromise */

define(function (require, exports, module) {


    var SpecRunnerUtils            = require("spec/SpecRunnerUtils");


    describe("LegacyInteg:CSS Parsing Integration Tests", function () {
        // todo not working

        let testPath = SpecRunnerUtils.getTestPath("/spec/CSSUtils-test-files"),
            testWindow,
            CSSUtils,
            DocumentManager,
            FileViewController;

        beforeAll(async function () {
            testWindow = await SpecRunnerUtils.createTestWindowAndRun();
            // Load module instances from brackets.test
            CSSUtils            = testWindow.brackets.test.CSSUtils;
            DocumentManager     = testWindow.brackets.test.DocumentManager;
            FileViewController  = testWindow.brackets.test.FileViewController;
            // Load test project
            await SpecRunnerUtils.loadProjectInTestWindow(testPath);
        }, 20000);

        afterAll(async function () {
            CSSUtils            = null;
            DocumentManager     = null;
            FileViewController  = null;
            await SpecRunnerUtils.closeTestWindow();
        }, 30000);

        afterEach(async function () {
            await testWindow.closeAllFiles();
        });


        describe("Working with real public CSSUtils API", function () {

            it("should include comment preceding selector (issue #403)", async function () {
                let rules = await jsPromise(CSSUtils.findMatchingRules("#issue403"));
                expect(rules.length).toBe(1);
                expect(rules[0].lineStart).toBe(4);
                expect(rules[0].lineEnd).toBe(7);
            }, 20000);

            it("should continue search despite unreadable files (issue #10013)", async function () {
                // Add a nonexistent CSS file to the ProjectManager.getAllFiles() result, which will force a file IO error
                // when we try to read the file later. Similar errors may arise in real-world for non-UTF files, etc.
                SpecRunnerUtils.injectIntoGetAllFiles(testWindow, testPath + "/doesNotExist.css");

                var promise = CSSUtils.findMatchingRules("html");
                promise.done(function (result) {
                    expect(result.length).toBeGreaterThan(0);
                });
                await awaitsForDone(promise, "CSSUtils.findMatchingRules()");
            });
        });

        describe("Working with unsaved changes", function () {

            it("should return the correct offsets if the file has changed", async function () {
                var promise = FileViewController.openAndSelectDocument(testPath + "/simple.css", FileViewController.PROJECT_MANAGER);
                await awaitsForDone(promise, "FileViewController.openAndSelectDocument()");

                var rules = null;

                var doc = DocumentManager.getCurrentDocument();

                // Add several blank lines at the beginning of the text
                doc.setText("\n\n\n\n" + doc.getText());

                // Look for ".FIRSTGRADE"
                var promise = CSSUtils.findMatchingRules(".FIRSTGRADE")
                    .done(function (result) { rules = result; });
                await awaitsForDone(promise);

                doc = null;
                expect(rules.length).toBe(1);
                expect(rules[0].lineStart).toBe(16);
                expect(rules[0].lineEnd).toBe(18);
            });

            it("should return a newly created rule in an unsaved file", async function () {
                var promise = FileViewController.openAndSelectDocument(testPath + "/simple.css", FileViewController.PROJECT_MANAGER);
                await awaitsForDone(promise, "FileViewController.openAndSelectDocument()");
                var rules = null;

                var doc = DocumentManager.getCurrentDocument();

                // Add a new selector to the file
                doc.setText(doc.getText() + "\n\n.TESTSELECTOR {\n    font-size: 12px;\n}\n");

                // Look for the selector we just created
                var promise = CSSUtils.findMatchingRules(".TESTSELECTOR")
                    .done(function (result) { rules = result; });
                await awaitsForDone(promise, "CSSUtils.findMatchingRules()");

                doc = null;
                expect(rules.length).toBe(1);
                expect(rules[0].lineStart).toBe(24);
                expect(rules[0].lineEnd).toBe(26);
            });
        });
    });
});
