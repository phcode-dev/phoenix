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

/*global describe, it, expect, beforeEach, afterEach, awaitsFor, awaitsForDone */

define(function (require, exports, module) {


    var DocumentManager,        // loaded from brackets.test
        FileViewController,     // loaded from brackets.test
        ProjectManager,         // loaded from brackets.test

        JSUtils             = require("language/JSUtils"),
        SpecRunnerUtils     = require("spec/SpecRunnerUtils");

    var testPath = SpecRunnerUtils.getTestPath("/spec/JSUtils-test-files");

    describe("integration:JS-Utils - JS Indexing", function () {

        var functions;  // populated by indexAndFind()

        beforeEach(async function () {
            let testWindow = await SpecRunnerUtils.createTestWindowAndRun();
            var brackets        = testWindow.brackets;
            DocumentManager     = brackets.test.DocumentManager;
            FileViewController  = brackets.test.FileViewController;
            ProjectManager      = brackets.test.ProjectManager;
            JSUtils             = brackets.test.JSUtils;

            await SpecRunnerUtils.loadProjectInTestWindow(testPath);
        }, 30000);

        afterEach(function () {
            DocumentManager     = null;
            FileViewController  = null;
            JSUtils             = null;
            ProjectManager      = null;
            SpecRunnerUtils.closeTestWindow();
        });

        async function init(fileName) {
            await awaitsForDone(
                FileViewController.openAndSelectDocument(
                    testPath + "/" + fileName,
                    FileViewController.PROJECT_MANAGER
                ));
        }

        /**
         * Builds a fileInfos index of the project, as required to call findMatchingFunctions(). Calls the
         * specified 'invoker' function with fileInfos, and populates the 'functions' var once it's done.
         * Does not need to be wrapped in a runs() block.
         * @param {function(Array.<File>):$.Promise} invokeFind
         */
        async function indexAndFind(invokeFind) {
            var result = new $.Deferred();
            ProjectManager.getAllFiles().done(function (files) {
                invokeFind(files)
                    .done(function (functionsResult) { functions = functionsResult; })
                    .then(result.resolve, result.reject);
            });

            await awaitsForDone(result, "Index and invoke JSUtils.findMatchingFunctions()");
        }


        describe("Index integrity", function () {
            it("should handle colliding with prototype properties", async function () { // #2813
                // no init() needed - don't need any editors to be open
                await indexAndFind(function (fileInfos) {
                    return JSUtils.findMatchingFunctions("toString", fileInfos);
                });
                expect(functions.length).toBe(1);
                expect(functions[0].lineStart).toBe(1);
                expect(functions[0].lineEnd).toBe(3);

                await indexAndFind(function (fileInfos) {
                    return JSUtils.findMatchingFunctions("length", fileInfos);
                });
                expect(functions.length).toBe(1);
                expect(functions[0].lineStart).toBe(6);
                expect(functions[0].lineEnd).toBe(8);

                await indexAndFind(function (fileInfos) {
                    return JSUtils.findMatchingFunctions("hasOwnProperty", fileInfos);
                });
                expect(functions.length).toBe(1);
                expect(functions[0].lineStart).toBe(11);
                expect(functions[0].lineEnd).toBe(13);
            });
        });


        describe("Working with unsaved changes", function () {

            async function fileChangedTest(buildCache) {
                await init("edit.js");

                // Populate JSUtils cache
                if (buildCache) {
                    // Look for "edit2" function
                    await indexAndFind(function (fileInfos) {
                        return JSUtils.findMatchingFunctions("edit2", fileInfos);
                    });
                    expect(functions.length).toBe(1);
                    expect(functions[0].lineStart).toBe(7);
                    expect(functions[0].lineEnd).toBe(9);
                }

                // Add several blank lines at the beginning of the text
                var doc = DocumentManager.getCurrentDocument();
                doc.setText("\n\n\n\n" + doc.getText());

                // Look for function again, expecting line offsets to have changed
                await indexAndFind(function (fileInfos) {
                    return JSUtils.findMatchingFunctions("edit2", fileInfos);
                });
                expect(functions.length).toBe(1);
                expect(functions[0].lineStart).toBe(11);
                expect(functions[0].lineEnd).toBe(13);
            }

            it("should return the correct offsets if the file has changed", async function () {
                await fileChangedTest(false);
            });

            it("should return the correct offsets if the results were cached and the file has changed", async function () {
                await fileChangedTest(true);
            });

            async function insertFunctionTest(buildCache) {
                await init("edit.js");

                // Populate JSUtils cache
                if (buildCache) {
                    // Look for function that doesn't exist yet
                    await indexAndFind(function (fileInfos) {
                        return JSUtils.findMatchingFunctions("TESTFUNCTION", fileInfos);
                    });
                    expect(functions.length).toBe(0);
                }

                // Add a new function to the file
                var doc = DocumentManager.getCurrentDocument();
                doc.setText(doc.getText() + "\n\nfunction TESTFUNCTION() {\n    return true;\n}\n");

                // Look for the function we just created
                await indexAndFind(function (fileInfos) {
                    return JSUtils.findMatchingFunctions("TESTFUNCTION", fileInfos);
                });
                expect(functions.length).toBe(1);
                expect(functions[0].lineStart).toBe(33);
                expect(functions[0].lineEnd).toBe(35);
            }

            it("should return a newly created function in an unsaved file", async function () {
                await insertFunctionTest(false);
            });

            it("should return a newly created function in an unsaved file that already has cached results", async function () {
                await insertFunctionTest(true);
            });
        });
    }); //describe("JS Indexing")
});
