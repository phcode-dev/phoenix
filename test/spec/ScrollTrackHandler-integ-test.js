/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai
 * All rights reserved.
 * Original work Copyright (c) 2013 - 2021 Adobe Systems Incorporated.
 * All rights reserved.
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

/*global describe, beforeEach, it, expect, beforeAll, afterAll */

define(function (require, exports, module) {

    // Load dependent modules
    let ScrollTrackMarkers,
        __PR,
        SpecRunnerUtils  = require("spec/SpecRunnerUtils");

    describe("integration:Scroll Track markers", function () {

        let testWindow,
            $,
            editor1Large,   // "bootstrap.css" (~3000 lines)
            editor2;        // "variables.less" (~40 lines)

        let currentProjectPath;

        beforeAll(async function () {
            testWindow = await SpecRunnerUtils.createTestWindowAndRun();
            $ = testWindow.$;

            // Load module instances from brackets.test
            ScrollTrackMarkers = testWindow.brackets.test.ScrollTrackMarkers;
            __PR = testWindow.__PR;
            currentProjectPath = await SpecRunnerUtils.getTestPath("/spec/CSSUtils-test-files");
            await SpecRunnerUtils.loadProjectInTestWindow(currentProjectPath);

            // Split the view horizontally, open two files
            await __PR.EDITING.splitHorizontal();
            await __PR.EDITING.openFileInFirstPane("bootstrap.css", true);   // ~3000 lines
            await __PR.EDITING.openFileInSecondPane("variables.less", true); // ~40 lines

            editor1Large = __PR.EDITING.getFirstPaneEditor();
            editor2 = __PR.EDITING.getSecondPaneEditor();
        }, 30000);

        afterAll(async function () {
            // Cleanup
            await SpecRunnerUtils.parkProject(true);
            await __PR.EDITING.splitNone();
            testWindow      = null;
            __PR = null;
            await SpecRunnerUtils.closeTestWindow();
        }, 30000);

        beforeEach(function () {
            // Clear all tickmarks from both editors before each test
            ScrollTrackMarkers.clearAll(editor1Large);
            ScrollTrackMarkers.clearAll(editor2);
        });

        //
        // EXISTING TESTS
        //
        it("should be able to add a line and side mark to both editors and clearAll", async function () {
            const trackerList = [{line: 10, ch: 0}];
            ScrollTrackMarkers.addTickmarks(editor1Large, trackerList);
            expect($(".tickmark").length).toBe(1);

            ScrollTrackMarkers.addTickmarks(editor1Large, trackerList, {
                trackStyle: ScrollTrackMarkers.TRACK_STYLES.ON_LEFT
            });
            expect($(".tickmark").length).toBe(2);
            expect($(".tickmark-side").length).toBe(1);

            // Add to second editor
            ScrollTrackMarkers.addTickmarks(editor2, trackerList);
            expect($(".tickmark").length).toBe(3);
            expect($(".tickmark-side").length).toBe(1);

            ScrollTrackMarkers.addTickmarks(editor2, trackerList, {
                trackStyle: ScrollTrackMarkers.TRACK_STYLES.ON_LEFT
            });
            expect($(".tickmark").length).toBe(4);
            expect($(".tickmark-side").length).toBe(2);

            // now clear all from first and second
            ScrollTrackMarkers.clearAll(editor1Large);
            expect($(".tickmark").length).toBe(2);
            expect($(".tickmark-side").length).toBe(1);
            ScrollTrackMarkers.clearAll(editor2);
            expect($(".tickmark").length).toBe(0);
            expect($(".tickmark-side").length).toBe(0);
        });

        it("should be able to add and clear named marks", async function () {
            const trackerList = [{line: 10, ch: 0}];
            const trackName1 = "line_ed_1";
            const trackName2 = "side_ed_1";

            // Add two named sets
            ScrollTrackMarkers.addTickmarks(editor1Large, trackerList, {
                name: trackName1
            });
            expect($(".tickmark").length).toBe(1);

            ScrollTrackMarkers.addTickmarks(editor1Large, trackerList, {
                trackStyle: ScrollTrackMarkers.TRACK_STYLES.ON_LEFT,
                name: trackName2
            });
            expect($(".tickmark").length).toBe(2);
            expect($(".tickmark-side").length).toBe(1);

            // now remove by name
            ScrollTrackMarkers.clear(editor1Large, trackName1);
            expect($(".tickmark").length).toBe(1);
            expect($(".tickmark-side").length).toBe(1);

            ScrollTrackMarkers.clear(editor1Large, trackName2);
            expect($(".tickmark").length).toBe(0);
            expect($(".tickmark-side").length).toBe(0);
        });

        it("should be able to add css classes marks", async function () {
            const trackerList = [{line: 10, ch: 0}];
            const trackClass1 = "line_ed_1";
            const trackClass2 = "side_ed_1";

            ScrollTrackMarkers.addTickmarks(editor1Large, trackerList, {
                name: trackClass1,
                cssColorClass: trackClass1
            });
            expect($(`.tickmark.${trackClass1}`).length).toBe(1);
            expect($(".tickmark").length).toBe(1);

            ScrollTrackMarkers.addTickmarks(editor1Large, trackerList, {
                trackStyle: ScrollTrackMarkers.TRACK_STYLES.ON_LEFT,
                name: trackClass2,
                cssColorClass: trackClass2
            });
            expect($(`.tickmark-side.${trackClass2}`).length).toBe(1);
            expect($(".tickmark-side").length).toBe(1);
        });

        it("should merge nearby scroll marks to single mark", async function () {
            // lines 10 and 11 are close, so they get merged into one track segment
            const trackerList = [{line: 10, ch: 0}, {line: 11, ch: 0}];
            ScrollTrackMarkers.addTickmarks(editor1Large, trackerList);
            // verify there's exactly 1 ".tickmark" block for lines 10 & 11
            expect($(".tickmark").length).toBe(1);
            expect($(".tickmark-side").length).toBe(0);

            // If we add them again but with 'ON_LEFT', that merges into a single side mark
            ScrollTrackMarkers.addTickmarks(editor1Large, trackerList, {
                trackStyle: ScrollTrackMarkers.TRACK_STYLES.ON_LEFT
            });
            // Now we have 2 total marks (1 line style, 1 side style)
            expect($(".tickmark").length).toBe(2);
            expect($(".tickmark-side").length).toBe(1);
        });

        it("should not merge far away scroll marks to single mark", async function () {
            // lines 10 and 2000 are definitely not adjacent
            const trackerList = [{line: 10, ch: 0}, {line: 2000, ch: 0}];
            ScrollTrackMarkers.addTickmarks(editor1Large, trackerList);
            // We expect 2 distinct line-type marks
            expect($(".tickmark").length).toBe(2);
            expect($(".tickmark-side").length).toBe(0);

            // Add them again with 'ON_LEFT'
            ScrollTrackMarkers.addTickmarks(editor1Large, trackerList, {
                trackStyle: ScrollTrackMarkers.TRACK_STYLES.ON_LEFT
            });
            // Now we have 4 total marks: 2 line style, 2 side style
            expect($(".tickmark").length).toBe(4);
            expect($(".tickmark-side").length).toBe(2);
        });

        it("should merge when lines are unsorted in the array, but adjacent or overlapping", async function () {
            // This array is out of order, but lines 10, 11, and 12 are all adjacent
            const unsorted = [
                { line: 12, ch: 3 },
                { line: 10, ch: 0 },
                { line: 11, ch: 9 }
            ];

            ScrollTrackMarkers.addTickmarks(editor1Large, unsorted);
            // Because they're adjacent, we expect them all to merge into a single mark
            expect($(".tickmark").length).toBe(1);

            // The final result in the scrollbar track is effectively lines 10..12 merged.
        });

        it("should merge single-point lines with an existing multi-line range if overlapping or adjacent", async function () {
            // We'll have a big range from lines 100..105 plus a single line 106 => merges
            const rangePlusSingle = [
                { start: { line: 100, ch: 0 }, end: { line: 105, ch: 10 } },
                { line: 106, ch: 0 }
            ];
            ScrollTrackMarkers.addTickmarks(editor1Large, rangePlusSingle);
            // lines 100..105 plus 106 => a single merged range 100..106
            expect($(".tickmark").length).toBe(1);

            // Additionally, add a single far-away line 200 to confirm it doesn't merge
            ScrollTrackMarkers.addTickmarks(editor1Large, [{ line: 200, ch: 0 }]);
            // Expect one merged block for 100..106, plus another block for line 200
            expect($(".tickmark").length).toBe(2);
        });

        it("should handle large line numbers in the 3000-line file when merging", async function () {
            // Mark lines near 2500..2501..2502 => merged
            // Also mark lines near 2999 => separate
            const bigLines = [
                { line: 2502, ch: 0 },
                { line: 2501, ch: 0 },
                { line: 2500, ch: 0 },
                { line: 2999, ch: 0 }
            ];
            ScrollTrackMarkers.addTickmarks(editor1Large, bigLines);

            // Expect 2 total marks:
            // - One merged range for 2500..2502
            // - One separate for line 2999
            expect($(".tickmark").length).toBe(2);
        });

        it("should merge lines in the smaller file (variables.less) that only has ~40 lines", async function () {
            // We'll add lines 5, 6, 7 => they should merge
            // And lines 8, 9 => they should merge as well (and combine into single block 5..9 if adjacency is direct)
            // Then line 15 is separate
            // NOTE: If there's a gap between 7 and 8, they're still adjacent lines => merges all 5..9.
            const smallFileMarks = [
                { line: 7, ch: 0 },
                { line: 5, ch: 0 },
                { line: 6, ch: 0 },
                { line: 9, ch: 0 },
                { line: 8, ch: 0 },
                { line: 15, ch: 0 }
            ];

            ScrollTrackMarkers.addTickmarks(editor2, smallFileMarks);

            // We expect 2 tickmark blocks total:
            // - One merged block for lines 5..9
            // - One single block for line 15
            expect($(".tickmark").length).toBe(2);

            // Also verify that it's in the second editor, not the first
            // But since we didn't add anything to editor1Large, total ".tickmark" in the DOM
            // is 2 anyway (due to how they're appended per-editor).
        });

        it("should correctly handle merging single-line points that overlap exact multi-line boundaries", async function () {
            // If we have a range from lines 20..22 and then a single line 22,
            // that single line is effectively 'inside' that range (or at boundary).
            // This test checks if the merging logic lumps them correctly.
            const overlapping = [
                { start: { line: 20, ch: 0 }, end: { line: 22, ch: 10 } },
                { line: 22, ch: 5 }
            ];
            ScrollTrackMarkers.addTickmarks(editor2, overlapping);
            // Expect 1 merged block total for 20..22
            expect($(".tickmark").length).toBe(1);

            // Now add line 23 => we dont merge existing marks into addTickmarks, IF we need to merge it, we need to
            // handle cases of merging different optioned marks seperateley while still merging marks of the same name
            // individually. Even if different named marks overlap, we should only merge individual named marks.
            ScrollTrackMarkers.addTickmarks(editor2, [{ line: 23, ch: 0 }]);
            expect($(".tickmark").length).toBe(2); // thoug overlap, wont be merged.
        });

        it("should not merge adjacent marks when dontMerge option is enabled", async function () {
            // Even though lines 10 and 11 are adjacent, they should remain separate if dontMerge is true.
            const trackerList = [{line: 10, ch: 0}, {line: 11, ch: 0}];
            ScrollTrackMarkers.addTickmarks(editor2, trackerList, { dontMerge: true });
            // Expect two separate tickmarks instead of one merged block.
            expect(ScrollTrackMarkers._getTickmarks(editor2).length).toBe(2);

            // Also test for ON_LEFT style with dontMerge.
            ScrollTrackMarkers.addTickmarks(editor2, trackerList, {
                trackStyle: ScrollTrackMarkers.TRACK_STYLES.ON_LEFT,
                dontMerge: true
            });
            // Now we expect two more separate side marks.
            expect(ScrollTrackMarkers._getTickmarks(editor2).length).toBe(4);
        });

        it("should merge overlapping marks by default", async function () {
            // Even if marks overlap, with dontMerge they should be added as-is.
            const overlapping = [
                { start: { line: 20, ch: 0 }, end: { line: 22, ch: 10 } },
                { line: 22, ch: 5 }
            ];
            ScrollTrackMarkers.addTickmarks(editor2, overlapping);
            // Without merging, both marks are rendered separately.
            expect(ScrollTrackMarkers._getTickmarks(editor2).length).toBe(1);
        });

        it("should not merge overlapping marks when dontMerge option is enabled", async function () {
            // Even if marks overlap, with dontMerge they should be added as-is.
            const overlapping = [
                { start: { line: 20, ch: 0 }, end: { line: 22, ch: 10 } },
                { line: 22, ch: 5 }
            ];
            ScrollTrackMarkers.addTickmarks(editor2, overlapping, { dontMerge: true });
            // Without merging, both marks are rendered separately.
            expect(ScrollTrackMarkers._getTickmarks(editor2).length).toBe(2);
        });

    });
});
