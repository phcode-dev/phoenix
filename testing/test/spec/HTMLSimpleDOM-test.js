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

/*global describe, it, expect, jasmine */
/*unittests: HTML SimpleDOM*/

define(function (require, exports, module) {


    var HTMLSimpleDOM = require("language/HTMLSimpleDOM"),
        FileUtils     = require("file/FileUtils"),
        WellFormedDoc = require("text!spec/HTMLInstrumentation-test-files/wellformed.html"),
        MurmurHash3   = require("thirdparty/murmurhash3_gc");

    // We test for character document positions here, so LF vs. CRLF line endings make a difference.
    // Normalize to LF.
    WellFormedDoc = FileUtils.translateLineEndings(WellFormedDoc, FileUtils.LINE_ENDINGS_LF);

    function _build(text, startOffset, startOffsetPos, strict, expectedErrors) {
        var builder = new HTMLSimpleDOM.Builder(text),
            root    = builder.build(strict),
            errors  = builder.errors;

        if (expectedErrors) {
            expect(root).toBeNull();
        } else {
            expect(root).toBeTruthy();
        }

        expect(errors).toEqual(expectedErrors);

        return root;
    }

    function build(text, strict, expectedErrors) {
        return _build(text, undefined, undefined, strict, expectedErrors);
    }

    describe("HTML SimpleDOM", function () {
        describe("Strict HTML parsing", function () {
            it("should parse a document with balanced, void and self-closing tags", function () {
                var root = build("<p><b>some</b>awesome text</p><p>and <img> another <br/> para</p>", true);
                expect(root).toBeTruthy();
            });

            it("should parse a document with an implied-close tag followed by a tag that forces it to close", function () {
                var result = build("<div><p>unclosed para<h1>heading that closes para</h1></div>", true);
                expect(result).toBeTruthy();
                expect(result.tag).toBe("div");
                expect(result.children[0].tag).toBe("p");
                expect(result.children[1].tag).toBe("h1");
            });

            it("should parse a document with an implied-close tag followed by an actual close tag", function () {
                var result = build("<div><p>unclosed para</div>", true);
                expect(result).toBeTruthy();
                expect(result.tag).toBe("div");
                expect(result.children[0].tag).toBe("p");
            });

            it("should parse a document with an implied-close tag at the end of the document", function () {
                var result = build("<body><p>hello", true);
                expect(result).toBeTruthy();
                expect(result.tag).toBe("body");
                expect(result.children[0].tag).toBe("p");
                expect(result.children[0].children[0].content).toBe("hello");
            });

            it("should return null for an unclosed non-void/non-implied-close tag", function () {
                var errors = [{
                    token: {
                        type: 'closetag',
                        contents: 'p',
                        start: 37,
                        end: 38,
                        startPos: { line: 0, ch: 37 },
                        endPos: { line: 0, ch: 38 }
                    },
                    startPos: { line: 0, ch: 37 },
                    endPos: { line: 0, ch: 38 }
                }];

                build("<p>this has an <b>unclosed bold tag</p>", true, errors);
            });

            it("should adjust for offsets when logging errors", function () {
                var errors = [{
                    token: {
                        type: 'closetag',
                        contents: 'p',
                        start: 38,
                        end: 39,
                        startPos: { line: 1, ch: 22 },
                        endPos: { line: 1, ch: 23 }
                    },
                    startPos: { line: 1, ch: 22 },
                    endPos: { line: 1, ch: 23 }
                }];

                _build("<p>this has an \n<b>unclosed bold tag</p>", 16, {line: 1, ch: 0}, true, errors);
            });

            it("should return null for an extra close tag", function () {
                var errors = [{
                    token: {
                        type: 'closetag',
                        contents: 'b',
                        start: 30,
                        end: 31,
                        startPos: { line: 0, ch: 30 },
                        endPos: { line: 0, ch: 31 }
                    },
                    startPos: { line: 0, ch: 30 },
                    endPos: { line: 0, ch: 31 }
                }];

                build("<p>this has an unopened bold</b> tag</p>", true, errors);
            });

            it("should return null if there are unclosed tags at the end of the document", function () {
                var errors = [{
                    token: null,
                    startPos: { line: 0, ch: 0 },
                    endPos: { line: 0, ch: 0 }
                }];

                build("<div>this has <b>multiple unclosed tags", true, errors);
            });

            it("should return null if there is a tokenization failure", function () {
                var errors = [{
                    token: {
                        type: 'error',
                        contents: '',
                        start: -1,
                        end: 4,
                        startPos: null,
                        endPos: { line: 0, ch: 4 }
                    },
                    startPos: { line: 0, ch: 4 },
                    endPos: { line: 0, ch: 4 }
                }];

                build("<div<badtag></div>", true, errors);
            });

            it("should handle empty attributes", function () {
                var dom = build("<input disabled>", true);
                expect(dom.attributes.disabled).toEqual("");
            });

            it("should handle unknown self-closing tags", function () {
                var dom = build("<foo><bar/></foo>", true);
                expect(dom).toBeTruthy();
            });

            it("should merge text nodes around a comment", function () {
                var dom = build("<div>Text <!-- comment --> Text2</div>", true);
                expect(dom.children.length).toBe(1);
                var textNode = dom.children[0];
                expect(textNode.content).toBe("Text  Text2");
                expect(textNode.textSignature).toBeDefined();
            });

            it("should build simple DOM", function () {
                var dom = build(WellFormedDoc);
                expect(dom.tagID).toEqual(jasmine.any(Number));
                expect(dom.tag).toEqual("html");
                expect(dom.start).toEqual(16);
                expect(dom.end).toEqual(1269);
                expect(dom.subtreeSignature).toEqual(jasmine.any(Number));
                expect(dom.childSignature).toEqual(jasmine.any(Number));
                expect(dom.children.length).toEqual(5);
                var meta = dom.children[1].children[1];
                expect(Object.keys(meta.attributes).length).toEqual(1);
                expect(meta.attributes.charset).toEqual("utf-8");
                var titleContents = dom.children[1].children[5].children[0];
                expect(titleContents.content).toEqual("GETTING STARTED WITH BRACKETS");
                expect(titleContents.textSignature).toEqual(MurmurHash3.hashString(titleContents.content, titleContents.content.length, HTMLSimpleDOM._seed));
                expect(dom.children[1].parent).toEqual(dom);
                expect(dom.nodeMap[meta.tagID]).toBe(meta);
                expect(meta.childSignature).toEqual(jasmine.any(Number));
            });
        });
    });
});
