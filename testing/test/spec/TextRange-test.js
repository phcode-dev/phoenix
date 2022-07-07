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

/*global describe, it, expect, beforeEach, afterEach */

define(function (require, exports, module) {


    var TextRange = require("document/TextRange").TextRange,
        SpecRunnerUtils = require("spec/SpecRunnerUtils");

    var docText = "", i;
    for (i = 0; i < 10; i++) {
        docText += "line " + i + "\n";
    }

    describe("TextRange", function () {
        var doc,
            range,
            gotChange,
            gotContentChange,
            gotLostSync;

        beforeEach(function () {
            var result = SpecRunnerUtils.createMockEditor(docText);
            doc = result.doc;

            gotChange = false;
            gotContentChange = false;
            gotLostSync = false;

            range = new TextRange(doc, 4, 6);
            range.on("change.unittest", function () {
                expect(gotChange).toBe(false);
                gotChange = true;
            }).on("contentChange.unittest", function () {
                expect(gotContentChange).toBe(false);
                gotContentChange = true;
            }).on("lostSync.unittest", function () {
                expect(gotLostSync).toBe(false);
                gotLostSync = true;
            });
        });

        afterEach(function () {
            SpecRunnerUtils.destroyMockEditor(doc);
            doc = null;
            range.off(".unittest");
            range.dispose();
            range = null;
        });

        it("should not update or fire events for an edit before that doesn't change the number of lines", function () {
            doc.replaceRange("new line 2\nnew line 3", {line: 2, ch: 0}, {line: 3, ch: 6});
            expect(gotChange).toBe(false);
            expect(gotContentChange).toBe(false);
            expect(gotLostSync).toBe(false);
            expect(range.startLine).toBe(4);
            expect(range.endLine).toBe(6);
        });

        it("should update and fire a change, but not a contentChange, for an edit before that deletes a line", function () {
            doc.replaceRange("", {line: 2, ch: 0}, {line: 3, ch: 0});
            expect(gotChange).toBe(true);
            expect(gotContentChange).toBe(false);
            expect(gotLostSync).toBe(false);
            expect(range.startLine).toBe(3);
            expect(range.endLine).toBe(5);
        });

        it("should update and fire a change, but not a contentChange, for an edit before that inserts a line", function () {
            doc.replaceRange("new extra line\n", {line: 2, ch: 0});
            expect(gotChange).toBe(true);
            expect(gotContentChange).toBe(false);
            expect(gotLostSync).toBe(false);
            expect(range.startLine).toBe(5);
            expect(range.endLine).toBe(7);
        });

        it("should not update or fire events for an edit after even if it changes the number of lines", function () {
            doc.replaceRange("new extra line\n", {line: 8, ch: 0});
            expect(gotChange).toBe(false);
            expect(gotContentChange).toBe(false);
            expect(gotLostSync).toBe(false);
            expect(range.startLine).toBe(4);
            expect(range.endLine).toBe(6);
        });

        it("should lose sync if entire document is replaced", function () {
            doc.replaceRange("new content", {line: 0, ch: 0}, {line: 9, ch: 6});
            expect(gotChange).toBe(true);
            expect(gotContentChange).toBe(true);
            expect(gotLostSync).toBe(true);
            expect(range.startLine).toBe(null);
            expect(range.endLine).toBe(null);
        });

        it("should lose sync if entire range is replaced", function () {
            doc.replaceRange("new content", {line: 3, ch: 0}, {line: 7, ch: 6});
            expect(gotChange).toBe(true);
            expect(gotContentChange).toBe(true);
            expect(gotLostSync).toBe(true);
            expect(range.startLine).toBe(null);
            expect(range.endLine).toBe(null);
        });

        it("should lose sync if a change overlaps the beginning of the range", function () {
            doc.replaceRange("new content", {line: 3, ch: 0}, {line: 5, ch: 6});
            expect(gotChange).toBe(true);
            expect(gotContentChange).toBe(true);
            expect(gotLostSync).toBe(true);
            expect(range.startLine).toBe(null);
            expect(range.endLine).toBe(null);
        });

        it("should lose sync if a change overlaps the end of the range", function () {
            doc.replaceRange("new content", {line: 5, ch: 0}, {line: 7, ch: 6});
            expect(gotChange).toBe(true);
            expect(gotContentChange).toBe(true);
            expect(gotLostSync).toBe(true);
            expect(range.startLine).toBe(null);
            expect(range.endLine).toBe(null);
        });

        it("should not update or send a change, but should send contentChange, if a change occurs inside range without changing # of lines", function () {
            doc.replaceRange("new line 5", {line: 5, ch: 0}, {line: 5, ch: 6});
            expect(gotChange).toBe(false);
            expect(gotContentChange).toBe(true);
            expect(gotLostSync).toBe(false);
            expect(range.startLine).toBe(4);
            expect(range.endLine).toBe(6);
        });

        it("should update and send change/contentChange if a line is added inside range", function () {
            doc.replaceRange("new added line\n", {line: 5, ch: 0});
            expect(gotChange).toBe(true);
            expect(gotContentChange).toBe(true);
            expect(gotLostSync).toBe(false);
            expect(range.startLine).toBe(4);
            expect(range.endLine).toBe(7);
        });

        it("should update and send change/contentChange if a line is deleted inside range", function () {
            doc.replaceRange("", {line: 5, ch: 0}, {line: 6, ch: 0});
            expect(gotChange).toBe(true);
            expect(gotContentChange).toBe(true);
            expect(gotLostSync).toBe(false);
            expect(range.startLine).toBe(4);
            expect(range.endLine).toBe(5);
        });
    });
});
