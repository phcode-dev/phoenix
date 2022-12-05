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

/*global describe, it, expect, awaitsForDone, awaitsForFail, beforeAll, afterAll */

define(function (require, exports, module) {


    var ExtensionUtils,     // Load from brackets.test
        FileUtils           = require("file/FileUtils"),
        SpecRunnerUtils     = require("spec/SpecRunnerUtils"),
        LESS_RESULT         = require("text!spec/ExtensionUtils-test-files/less.text");


    describe("integration:Extension Utils", function () {

        var testWindow;

        beforeAll(async function () {
            testWindow = await SpecRunnerUtils.createTestWindowAndRun();
            // Load module instances from brackets.test
            ExtensionUtils      = testWindow.brackets.test.ExtensionUtils;
        });

        afterAll(async function () {
            testWindow      = null;
            ExtensionUtils  = null;
            await SpecRunnerUtils.closeTestWindow();
        });

        describe("loadStyleSheet", function () {

            async function loadStyleSheet(doc, path) {
                var deferred = new $.Deferred();

                // attach style sheet
                var promise = ExtensionUtils.loadStyleSheet(module, path);
                let result;
                promise.then((res)=>{
                    result = res;
                    deferred.resolve();
                }, deferred.reject);
                await awaitsForDone(promise, "loadStyleSheet: " + path);

                return result;
            }

            it("should load CSS style sheets with imports", async function () {
                await loadStyleSheet(testWindow.document, "ExtensionUtils-test-files/basic.css");

                // basic.css
                var $projectTitle = testWindow.$("#project-title");
                var fontSize = $projectTitle.css("font-size");
                expect(fontSize).toEqual("25px");

                // second.css is imported in basic.css
                var fontWeight = $projectTitle.css("font-weight");
                expect(fontWeight).toEqual("500");

                // third.css is imported in second.css
                var fontVariant = $projectTitle.css("font-variant");
                expect(fontVariant).toEqual("small-caps");

                // fourth.css is imported in basic.css
                var fontFamily = $projectTitle.css("font-family");
                expect(fontFamily).toEqual("serif");
            });

            it("should detect errors loading the initial path", async function () {
                var path    = "ExtensionUtils-test-files/does-not-exist.css",
                    promise = ExtensionUtils.loadStyleSheet(module, path);

                await awaitsForFail(promise, "loadStyleSheet: " + path);
            });

            it("should detect errors loading imports", async function () {
                var path    = "ExtensionUtils-test-files/bad-import.css",
                    promise = ExtensionUtils.loadStyleSheet(module, path);

                await awaitsForFail(promise, "loadStyleSheet: " + path);
            });

            it("should attach LESS style sheets", async function () {
                var result;

                result =await loadStyleSheet(testWindow.document, "ExtensionUtils-test-files/basic.less");

                // convert all line endings to platform default
                var windowText = FileUtils.translateLineEndings(testWindow.$(result).text()),
                    lessText   = FileUtils.translateLineEndings(LESS_RESULT);

                // confirm style sheet contents
                expect(windowText).toBe(lessText);

                // confirm style is attached to document
                expect(testWindow.$.contains(testWindow.document, result)).toBeTruthy();
            });

            it("should attach LESS style sheets using absolute url", async function () {
                var result;

                var indexLocation = testWindow.location.origin + testWindow.location.pathname,
                    bracketsLocation = indexLocation.substring(0, indexLocation.length - "src/".length),
                    basicLessLocation = bracketsLocation + "test/spec/ExtensionUtils-test-files/basic.less";

                result =await loadStyleSheet(testWindow.document, basicLessLocation);

                // convert all line endings to platform default
                var windowText = FileUtils.translateLineEndings(testWindow.$(result).text()),
                    lessText   = FileUtils.translateLineEndings(LESS_RESULT);

                // confirm style sheet contents
                expect(windowText).toBe(lessText);

                // confirm style is attached to document
                expect(testWindow.$.contains(testWindow.document, result)).toBeTruthy();
            });
        });
    });
});
