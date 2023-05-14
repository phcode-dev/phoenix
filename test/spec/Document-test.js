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

/*global describe, beforeEach, afterEach, it, expect,  */

define(function (require, exports, module) {


    // Load dependent modules
    let SpecRunnerUtils     = require("spec/SpecRunnerUtils");


    describe("Document", function () {
        describe("doMultipleEdits", function () {
            // Even though these are Document unit tests, we need to create an editor in order to
            // be able to test actual edit ops.
            var myEditor, myDocument, initialContentLines;

            function makeDummyLines(num) {
                var content = [], i;
                for (i = 0; i < num; i++) {
                    content.push("this is line " + i);
                }
                return content;
            }

            beforeEach(function () {
                // Each line from 0-9 is 14 chars long, each line from 10-19 is 15 chars long
                initialContentLines = makeDummyLines(20);
                var mocks = SpecRunnerUtils.createMockEditor(initialContentLines.join("\n"), "unknown");
                myDocument = mocks.doc;
                myEditor = mocks.editor;
            });

            afterEach(function () {
                if (myEditor) {
                    SpecRunnerUtils.destroyMockEditor(myDocument);
                    myEditor = null;
                    myDocument = null;
                }
            });

            function _verifySingleEdit() {
                var result = myDocument.doMultipleEdits([{edit: {text: "new content", start: {line: 2, ch: 0}, end: {line: 2, ch: 14}},
                    selection: {start: {line: 2, ch: 4}, end: {line: 2, ch: 4}, reversed: true, isBeforeEdit: true}}]);
                initialContentLines[2] = "new content";
                expect(myDocument.getText()).toEqual(initialContentLines.join("\n"));
                expect(result.length).toBe(1);
                expect(result[0].start.line).toEqual(2);
                expect(result[0].start.ch).toEqual(11); // end of "new content"
                expect(result[0].end.line).toEqual(2);
                expect(result[0].end.ch).toEqual(11);
                expect(result[0].reversed).toBe(true);
            }

            it("should do a single edit, tracking a beforeEdit selection and preserving reversed flag", function () {
                _verifySingleEdit();
            });

            it("should edit update change lastChangeTimestamp", function () {
                let lastTimestamp = myDocument.lastChangeTimestamp;
                expect(typeof myDocument.lastChangeTimestamp).toBe('number');
                _verifySingleEdit();
                expect(myDocument.lastChangeTimestamp).not.toBe(lastTimestamp);
            });

            it("should do a single edit, leaving a non-beforeEdit selection untouched and preserving reversed flag", function () {
                var result = myDocument.doMultipleEdits([{edit: {text: "new content", start: {line: 2, ch: 0}, end: {line: 2, ch: 14}},
                    selection: {start: {line: 2, ch: 4}, end: {line: 2, ch: 4}, reversed: true}}]);
                initialContentLines[2] = "new content";
                expect(myDocument.getText()).toEqual(initialContentLines.join("\n"));
                expect(result.length).toBe(1);
                expect(result[0].start.line).toEqual(2);
                expect(result[0].start.ch).toEqual(4);
                expect(result[0].end.line).toEqual(2);
                expect(result[0].end.ch).toEqual(4);
                expect(result[0].reversed).toBe(true);
            });

            it("should do multiple edits, fixing up isBeforeEdit selections with respect to both edits and preserving other selection attributes", function () {
                var result = myDocument.doMultipleEdits([
                    {edit: {text: "modified line 2\n", start: {line: 2, ch: 0}, end: {line: 2, ch: 14}},
                        selection: {start: {line: 2, ch: 4}, end: {line: 2, ch: 4}, isBeforeEdit: true, primary: true}},
                    {edit: {text: "modified line 4\n", start: {line: 4, ch: 0}, end: {line: 4, ch: 14}},
                        selection: {start: {line: 4, ch: 4}, end: {line: 4, ch: 4}, isBeforeEdit: true, reversed: true}}
                ]);
                initialContentLines[2] = "modified line 2";
                initialContentLines[4] = "modified line 4";
                initialContentLines.splice(5, 0, "");
                initialContentLines.splice(3, 0, "");
                expect(myDocument.getText()).toEqual(initialContentLines.join("\n"));
                expect(result.length).toBe(2);
                expect(result[0].start.line).toEqual(3);
                expect(result[0].start.ch).toEqual(0); // pushed to end of modified text
                expect(result[0].end.line).toEqual(3);
                expect(result[0].end.ch).toEqual(0);
                expect(result[0].primary).toBe(true);
                expect(result[1].start.line).toEqual(6);
                expect(result[1].start.ch).toEqual(0); // pushed to end of modified text and updated for both edits
                expect(result[1].end.line).toEqual(6);
                expect(result[1].end.ch).toEqual(0);
                expect(result[1].reversed).toBe(true);
            });

            it("should do multiple edits, fixing up non-isBeforeEdit selections only with respect to other edits", function () {
                var result = myDocument.doMultipleEdits([
                    {edit: {text: "modified line 2\n", start: {line: 2, ch: 0}, end: {line: 2, ch: 14}},
                        selection: {start: {line: 2, ch: 4}, end: {line: 2, ch: 4}, primary: true}},
                    {edit: {text: "modified line 4\n", start: {line: 4, ch: 0}, end: {line: 4, ch: 14}},
                        selection: {start: {line: 4, ch: 4}, end: {line: 4, ch: 4}, reversed: true}}
                ]);
                initialContentLines[2] = "modified line 2";
                initialContentLines[4] = "modified line 4";
                initialContentLines.splice(5, 0, "");
                initialContentLines.splice(3, 0, "");
                expect(myDocument.getText()).toEqual(initialContentLines.join("\n"));
                expect(result.length).toBe(2);
                expect(result[0].start.line).toEqual(2);
                expect(result[0].start.ch).toEqual(4); // not modified since it's above the other edit
                expect(result[0].end.line).toEqual(2);
                expect(result[0].end.ch).toEqual(4);
                expect(result[0].primary).toBe(true);
                expect(result[1].start.line).toEqual(5);
                expect(result[1].start.ch).toEqual(4); // not pushed to end of modified text, but updated for previous edit
                expect(result[1].end.line).toEqual(5);
                expect(result[1].end.ch).toEqual(4);
                expect(result[1].reversed).toBe(true);
            });

            it("should perform multiple changes/track multiple selections within a single edit, selections specified as isBeforeEdit", function () {
                var result = myDocument.doMultipleEdits([
                    {edit: [{text: "modified line 1", start: {line: 1, ch: 0}, end: {line: 1, ch: 14}},
                            {text: "modified line 2\n", start: {line: 2, ch: 0}, end: {line: 2, ch: 14}}],
                        selection: [{start: {line: 1, ch: 4}, end: {line: 1, ch: 4}, isBeforeEdit: true},
                                     {start: {line: 2, ch: 4}, end: {line: 2, ch: 4}, isBeforeEdit: true, primary: true}]},
                    {edit: {text: "modified line 4\n", start: {line: 4, ch: 0}, end: {line: 4, ch: 14}},
                        selection: {start: {line: 4, ch: 4}, end: {line: 4, ch: 4}, isBeforeEdit: true, reversed: true}}
                ]);
                initialContentLines[1] = "modified line 1"; // no extra newline inserted here
                initialContentLines[2] = "modified line 2";
                initialContentLines[4] = "modified line 4";
                initialContentLines.splice(5, 0, "");
                initialContentLines.splice(3, 0, "");
                expect(myDocument.getText()).toEqual(initialContentLines.join("\n"));
                expect(result.length).toBe(3);
                expect(result[0].start.line).toEqual(1);
                expect(result[0].start.ch).toEqual(15); // pushed to end of first modified text
                expect(result[0].end.line).toEqual(1);
                expect(result[0].end.ch).toEqual(15);
                expect(result[0].primary).toBeFalsy();
                expect(result[1].start.line).toEqual(3);
                expect(result[1].start.ch).toEqual(0); // pushed to end of second modified text
                expect(result[1].end.line).toEqual(3);
                expect(result[1].end.ch).toEqual(0);
                expect(result[1].primary).toBe(true);
                expect(result[2].start.line).toEqual(6);
                expect(result[2].start.ch).toEqual(0); // pushed to end of third modified text and updated for both edits
                expect(result[2].end.line).toEqual(6);
                expect(result[2].end.ch).toEqual(0);
                expect(result[2].reversed).toBe(true);
            });

            it("should perform multiple changes/track multiple selections within a single edit, selections not specified as isBeforeEdit", function () {
                var result = myDocument.doMultipleEdits([
                    {edit: [{text: "modified line 1", start: {line: 1, ch: 0}, end: {line: 1, ch: 14}},
                            {text: "modified line 2\n", start: {line: 2, ch: 0}, end: {line: 2, ch: 14}}],
                        selection: [{start: {line: 1, ch: 4}, end: {line: 1, ch: 4}},
                                     {start: {line: 2, ch: 4}, end: {line: 2, ch: 4}, primary: true}]},
                    {edit: {text: "modified line 4\n", start: {line: 4, ch: 0}, end: {line: 4, ch: 14}},
                        selection: {start: {line: 4, ch: 4}, end: {line: 4, ch: 4}, reversed: true}}
                ]);
                initialContentLines[1] = "modified line 1"; // no extra newline inserted here
                initialContentLines[2] = "modified line 2";
                initialContentLines[4] = "modified line 4";
                initialContentLines.splice(5, 0, "");
                initialContentLines.splice(3, 0, "");
                expect(myDocument.getText()).toEqual(initialContentLines.join("\n"));
                expect(result.length).toBe(3);
                expect(result[0].start.line).toEqual(1);
                expect(result[0].start.ch).toEqual(4); // not fixed up
                expect(result[0].end.line).toEqual(1);
                expect(result[0].end.ch).toEqual(4);
                expect(result[0].primary).toBeFalsy();
                expect(result[1].start.line).toEqual(2);
                expect(result[1].start.ch).toEqual(4); // not fixed up, no need to adjust for first edit
                expect(result[1].end.line).toEqual(2);
                expect(result[1].end.ch).toEqual(4);
                expect(result[1].primary).toBe(true);
                expect(result[2].start.line).toEqual(5);
                expect(result[2].start.ch).toEqual(4); // not pushed to end of modified text, but updated for previous edit
                expect(result[2].end.line).toEqual(5);
                expect(result[2].end.ch).toEqual(4);
                expect(result[2].reversed).toBe(true);
            });

            it("should throw an error if edits overlap", function () {
                function shouldDie() {
                    myDocument.doMultipleEdits([
                        {edit: {text: "modified line 3", start: {line: 3, ch: 0}, end: {line: 3, ch: 5}}},
                        {edit: {text: "modified line 3 again", start: {line: 3, ch: 3}, end: {line: 3, ch: 8}}}
                    ]);
                }

                expect(shouldDie).toThrow();
            });

            it("should throw an error if multiple edits in one group surround an edit in another group, even if they don't directly overlap", function () {
                function shouldDie() {
                    myDocument.doMultipleEdits([
                        {edit: [{text: "modified line 2", start: {line: 2, ch: 0}, end: {line: 2, ch: 0}},
                                {text: "modified line 4", start: {line: 4, ch: 0}, end: {line: 4, ch: 0}}]},
                        {edit: {text: "modified line 3", start: {line: 3, ch: 0}, end: {line: 3, ch: 0}}}
                    ]);
                }

                expect(shouldDie).toThrow();
            });

        });
    });
});
