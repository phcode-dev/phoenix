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

/*global describe, it, expect, beforeEach, afterEach, awaitsFor, awaitsForDone, awaitsForFail */

define(function (require, exports, module) {


    var SpecRunnerUtils = brackets.getModule("spec/SpecRunnerUtils");

    var main                = require("main"),
        InlineDocsViewer    = require("InlineDocsViewer"),
        testCSS             = require("text!unittest-files/test1.css"),
        testHTML            = require("text!unittest-files/test1.html");

    describe("unit:MDNDocs", function () {

        var testCSSInfo     = SpecRunnerUtils.parseOffsetsFromText(testCSS),
            testHTMLInfo    = SpecRunnerUtils.parseOffsetsFromText(testHTML),
            editor,
            doc,
            pos;

        async function queryInlineAtPos(info, offset, expectInline, expectedProperty) {
            var widget = null,
                promise;

            // set cursor position in editor
            pos = info.offsets[offset];
            editor.setSelection(pos);

            // fetch inline editor
            promise = main._inlineProvider(editor, pos);

            if (expectInline) {
                expect(promise).toBeTruthy();
            }

            if (promise) {
                promise.done(function (result) {
                    widget = result;
                });

                if (expectInline) {
                    // expecting a valid CSS property
                    await awaitsForDone(promise, "MDNDocs _inlineProvider", 1000);
                } else {
                    // expecting an invalid css property
                    await awaitsForFail(promise, "MDNDocs _inlineProvider", 1000);
                }
            }

            if (promise) {
                if (expectInline) {
                    expect(widget).toBeTruthy();
                    expect(widget.$htmlContent.find(".css-prop-summary h1").text()).toBe(expectedProperty);
                } else {
                    expect(widget).toBeNull();
                }
            }
        }

        describe("InlineDocsProvider database", function () {

            it("should retrieve the CSS docs database", async function () {
                var json;

                main._getDocs("css.json").done(function (result) {
                    json = result;
                });

                await awaitsFor(function () { return json !== undefined; }, "read css.json database", 5000);

                expect(Object.keys(json).length).toBeGreaterThan(0);
            });

            it("should retrieve the HTML docs database", async function () {
                var json;

                main._getDocs("html.json").done(function (result) {
                    json = result;
                });

                await awaitsFor(function () { return json !== undefined; }, "read html.json database", 5000);

                expect(Object.keys(json).length).toBeGreaterThan(0);
            });

        });

        describe("InlineDocsProvider parsing in CSS", function () {

            beforeEach(function () {
                var mock = SpecRunnerUtils.createMockEditor(testCSSInfo.text, "css");
                editor = mock.editor;
                doc = mock.doc;
            });

            afterEach(function () {
                SpecRunnerUtils.destroyMockEditor(doc);
            });

            it("should open docs when the selection is on a CSS property", async function () {
                /* css property */
                await queryInlineAtPos(testCSSInfo, 1, true, "border");

                /* css value */
                await queryInlineAtPos(testCSSInfo, 2, true, "border");
            });

            it("should not open docs when the selection is not on a CSS property", async function () {
                /* css selector */
                await queryInlineAtPos(testCSSInfo, 0, false);

                /* css comment */
                await queryInlineAtPos(testCSSInfo, 5, false);
            });

            it("should not open docs for an invalid CSS property", async function () {
                /* css invalid property */
                await queryInlineAtPos(testCSSInfo, 3, false);
            });

            it("should open docs for a vendor-prefixed CSS property", async function () {
                /* css -webkit- prefixed property */
                await queryInlineAtPos(testCSSInfo, 6, true, "animation");
            });

            it("should not open docs for an invalid CSS property (looking like a vendor-prefixed one)", async function () {
                /* css property invalidly prefixed */
                await queryInlineAtPos(testCSSInfo, 7, false);
            });

        });

        describe("InlineDocsProvider parsing in HTML", function () {

            beforeEach(function () {
                var mock = SpecRunnerUtils.createMockEditor(testHTMLInfo.text, "html");
                editor = mock.editor;
                doc = mock.doc;
            });

            afterEach(function () {
                SpecRunnerUtils.destroyMockEditor(doc);
            });

            it("should open docs for CSS in a <style> block", async function () {
                await queryInlineAtPos(testHTMLInfo, 0, true, "border");
            });

            it("should open docs when the selection is on an HTML tag", async function () {
                await queryInlineAtPos(testHTMLInfo, 1, true, "background-color");
            });

            it("should not open docs when the selection is on an invalid HTML tag", async function () {
                await queryInlineAtPos(testHTMLInfo, 2, false);
            });

            it("should not open docs when the selection is not an HTML tag", async function () {
                /* Text */
                await queryInlineAtPos(testHTMLInfo, 3, false);

                /* Commented tag */
                await queryInlineAtPos(testHTMLInfo, 4, false);
            });

            it("should open docs when the selection is on an HTML attribute", async function () {
                await queryInlineAtPos(testHTMLInfo, 5, true, "<div>");
            });

            it("should open docs for tag (fallback) when the selection is on an HTML attribute's value", async function () {
                await queryInlineAtPos(testHTMLInfo, 6, true, "<div>");
            });

            it("should open docs for tag (fallback) when the selection is on an invalid HTML attribute", async function () {
                await queryInlineAtPos(testHTMLInfo, 7, true, "<div>");
            });

            it("should not open docs when the selection is on an invalid HTML attribute on an invalid HTML tag", async function () {
                await queryInlineAtPos(testHTMLInfo, 8, false);
            });

        });

        describe("InlineDocsViewer", function () {

            function createCssPropDetails(summary, url, valuesArr) {
                var values = [],
                    details = {
                        SUMMARY: summary,
                        URL: url,
                        VALUES: values
                    };

                valuesArr.forEach(function (value) {
                    values.push({
                        title: value[0] || undefined,
                        description: value[1] || undefined
                    });
                });

                return details;
            }

            it("should add titles to all links", function () {
                var prop    = "my-css-prop",
                    url     = "http://dev.brackets.io/wiki/css/properties/my-css-prop",
                    details = createCssPropDetails(
                        prop,
                        url,
                        [["normal", "See <a href='http://dev.brackets.io/wiki/css/properties/foo-css-prop'>foo-css-prop</a>"]]
                    ),
                    viewer = new InlineDocsViewer(prop, details),
                    $a,
                    $links = viewer.$htmlContent.find("a:not(.close)");

                // 1 link in the description, 1 "more info" link in template
                expect($links.length).toBe(2);

                $links.each(function (i, anchor) {
                    $a = $(anchor);

                    // all links should have a title
                    expect($a.attr("title")).toBe($a.attr("href"));
                });
            });

        });

    });
});
