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

/*global describe, beforeEach, it, expect, beforeAll, afterAll */

define(function (require, exports, module) {


    // Load dependent modules
    let ScrollTrackMarkers,
        __PR,
        SpecRunnerUtils  = require("spec/SpecRunnerUtils");


    describe("integration:Scroll Track markers", function () {

        let testWindow,
            $, editor1Large, editor2;

        let currentProjectPath;

        beforeAll(async function () {
            testWindow = await SpecRunnerUtils.createTestWindowAndRun();
            $ = testWindow.$;

            // Load module instances from brackets.test
            ScrollTrackMarkers = testWindow.brackets.test.ScrollTrackMarkers;
            __PR = testWindow.__PR;
            currentProjectPath = await SpecRunnerUtils.getTestPath("/spec/HTMLInstrumentation-test-files");
            await SpecRunnerUtils.loadProjectInTestWindow(currentProjectPath);
            await __PR.EDITING.splitHorizontal();
            await __PR.EDITING.openFileInFirstPane("REC-widgets-20121127.html", true);
            await __PR.EDITING.openFileInSecondPane("omitEndTags.html", true);
            editor1Large = __PR.EDITING.getFirstPaneEditor();
            editor2 = __PR.EDITING.getSecondPaneEditor();
        }, 30000);

        afterAll(async function () {
            await SpecRunnerUtils.parkProject(true);
            await __PR.EDITING.splitNone();
            testWindow      = null;
            __PR = null;
            await SpecRunnerUtils.closeTestWindow();
        }, 30000);

        beforeEach(function () {
            ScrollTrackMarkers.clearAll(editor1Large);
            ScrollTrackMarkers.clearAll(editor2);
        });


        it("should be able to add a line and side mark to both editors and clearAll", async function () {
            const trackerList = [{line: 10, ch: 0}];
            ScrollTrackMarkers.addTickmarks(editor1Large, trackerList);
            expect($(".tickmark").length).toBe(1);
            ScrollTrackMarkers.addTickmarks(editor1Large, trackerList, {
                trackStyle: ScrollTrackMarkers.TRACK_STYLES.ON_LEFT
            });
            expect($(".tickmark").length).toBe(2);
            expect($(".tickmark-side").length).toBe(1);
            ScrollTrackMarkers.addTickmarks(editor2, trackerList);
            expect($(".tickmark").length).toBe(3);
            expect($(".tickmark-side").length).toBe(1);
            ScrollTrackMarkers.addTickmarks(editor2, trackerList, {
                trackStyle: ScrollTrackMarkers.TRACK_STYLES.ON_LEFT
            });
            expect($(".tickmark").length).toBe(4);
            expect($(".tickmark-side").length).toBe(2);

            // now clear all
            ScrollTrackMarkers.clearAll(editor1Large);
            expect($(".tickmark").length).toBe(2);
            expect($(".tickmark-side").length).toBe(1);
            ScrollTrackMarkers.clearAll(editor2);
            expect($(".tickmark").length).toBe(0);
            expect($(".tickmark-side").length).toBe(0);
        });

        it("should be able to add and clear named marks", async function () {
            const trackerList = [{line: 10, ch: 0}];
            const trackName1= "line_ed_1";
            const trackName2= "side_ed_1";
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
            const trackClass1= "line_ed_1";
            const trackClass2= "side_ed_1";
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
            const trackerList = [{line: 10, ch: 0}, {line: 11, ch: 0}];
            ScrollTrackMarkers.addTickmarks(editor1Large, trackerList);
            expect($(".tickmark").length).toBe(1);
            expect($(".tickmark-side").length).toBe(0);
            ScrollTrackMarkers.addTickmarks(editor1Large, trackerList, {
                trackStyle: ScrollTrackMarkers.TRACK_STYLES.ON_LEFT
            });
            expect($(".tickmark").length).toBe(2);
            expect($(".tickmark-side").length).toBe(1);
        });

        it("should not merge far away scroll marks to single mark", async function () {
            const trackerList = [{line: 10, ch: 0}, {line: 2000, ch: 0}];
            ScrollTrackMarkers.addTickmarks(editor1Large, trackerList);
            expect($(".tickmark").length).toBe(2);
            expect($(".tickmark-side").length).toBe(0);
            ScrollTrackMarkers.addTickmarks(editor1Large, trackerList, {
                trackStyle: ScrollTrackMarkers.TRACK_STYLES.ON_LEFT
            });
            expect($(".tickmark").length).toBe(4);
            expect($(".tickmark-side").length).toBe(2);
        });

    });
});
