/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 * Original work Copyright (c) 2014 - 2021 Adobe Systems Incorporated. All rights reserved.
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

/*global describe, beforeAll, beforeEach, afterEach, it, expect, awaitsForDone, awaitsFor */

define(function (require, exports, module) {


    var SpecRunnerUtils = require("spec/SpecRunnerUtils");

    describe("mainview:MainViewFactory", function () {

        var CommandManager,          // loaded from brackets.test
            Commands,                // loaded from brackets.test
            DocumentManager,         // loaded from brackets.test
            EditorManager,           // loaded from brackets.test
            MainViewManager,         // loaded from brackets.test
            ProjectManager,          // loaded from brackets.test
            FileSystem,              // loaded from brackets.test
            Dialogs;                 // loaded from brackets.test

        var testPath = SpecRunnerUtils.getTestPath("/spec/MainViewFactory-test-files"),
            testWindow,
            _$,
            promise;

        var getFileObject = function (name) {
            return FileSystem.getFileForPath(testPath + "/" + name);
        };

        beforeAll(async function () {
            await SpecRunnerUtils.createTestWindowAndRun({forceReload: true});
        }, 30000);

        beforeEach(async function () {
            testWindow = await SpecRunnerUtils.createTestWindowAndRun();
            _$ = testWindow.$;

            // Load module instances from brackets.test
            CommandManager  = testWindow.brackets.test.CommandManager;
            Commands        = testWindow.brackets.test.Commands;
            DocumentManager = testWindow.brackets.test.DocumentManager;
            EditorManager   = testWindow.brackets.test.EditorManager;
            MainViewManager = testWindow.brackets.test.MainViewManager;
            ProjectManager  = testWindow.brackets.test.ProjectManager;
            FileSystem      = testWindow.brackets.test.FileSystem;
            Dialogs         = testWindow.brackets.test.Dialogs;
            await SpecRunnerUtils.loadProjectInTestWindow(testPath);
        }, 30000);

        afterEach(async function () {
            MainViewManager._closeAll(MainViewManager.ALL_PANES);
            testWindow      = null;
            CommandManager  = null;
            Commands        = null;
            DocumentManager = null;
            EditorManager   = null;
            ProjectManager  = null;
            FileSystem      = null;
            await SpecRunnerUtils.closeTestWindow();
        }, 30000);

        describe("Opening and closing Images", function () {
            it("should open an image", async function () {
                promise = MainViewManager._open(MainViewManager.ACTIVE_PANE, getFileObject("/images/events.jpg"));
                await awaitsForDone(promise, "MainViewManager.doOpen");
                expect(MainViewManager.getCurrentlyViewedFile(MainViewManager.ACTIVE_PANE).name).toEqual("events.jpg");
                // should not have been added to the working set
                expect(MainViewManager.getWorkingSetSize(MainViewManager.ALL_PANES)).toEqual(0);
            });
            it("should close an image", async function () {
                promise = MainViewManager._open(MainViewManager.ACTIVE_PANE, getFileObject("/images/events.jpg"));
                await awaitsForDone(promise, "MainViewManager.doOpen");
                MainViewManager._close(MainViewManager.ACTIVE_PANE, getFileObject("/images/events.jpg"));
                expect(MainViewManager.getCurrentlyViewedFile(MainViewManager.ACTIVE_PANE)).toEqual(null);
                expect(MainViewManager.getWorkingSetSize(MainViewManager.ALL_PANES)).toEqual(0);
            });
            it("should add an image to the working set", async function () {
                promise = CommandManager.execute(Commands.CMD_ADD_TO_WORKINGSET_AND_OPEN,  { fullPath: testPath + "/images/events.jpg" });
                await awaitsForDone(promise, Commands.CMD_ADD_TO_WORKINGSET_AND_OPEN);
                expect(MainViewManager.getCurrentlyViewedFile(MainViewManager.ACTIVE_PANE).name).toEqual("events.jpg");
                expect(MainViewManager.getWorkingSetSize(MainViewManager.ALL_PANES)).toEqual(1);
                expect(MainViewManager.findInWorkingSet(MainViewManager.ACTIVE_PANE, testPath + "/images/events.jpg")).not.toEqual(-1);
            });
        });
        describe("Opening and closing Videos", function () {
            it("should open a video with the media viewer", async function () {
                promise = MainViewManager._open(MainViewManager.ACTIVE_PANE, getFileObject("/videos/small.mp4"));
                await awaitsForDone(promise, "MainViewManager.doOpen");
                expect(MainViewManager.getCurrentlyViewedFile(MainViewManager.ACTIVE_PANE).name).toEqual("small.mp4");
                // should not have been added to the working set
                expect(MainViewManager.getWorkingSetSize(MainViewManager.ALL_PANES)).toEqual(0);
                // a media view with a <video> element should have been created
                expect(_$(".media-view").length).toEqual(1);
                expect(_$(".media-view video.media-preview").length).toEqual(1);
            });
            it("should load video metadata and show dimensions, duration and size", async function () {
                promise = MainViewManager._open(MainViewManager.ACTIVE_PANE, getFileObject("/videos/small.mp4"));
                await awaitsForDone(promise, "MainViewManager.doOpen");
                const videoEl = _$(".media-view video.media-preview")[0];

                await awaitsFor(function () {
                    if (_$(".media-view .media-error").is(":visible")) {
                        throw new Error("video failed to load/decode: " +
                            _$(".media-view .media-error").text());
                    }
                    return videoEl.readyState >= 1; // HAVE_METADATA
                }, "video metadata to load", 30000);
                expect(videoEl.videoWidth).toEqual(320);
                expect(videoEl.videoHeight).toEqual(240);
                await awaitsFor(function () {
                    return _$(".media-view .media-data").text().length > 0;
                }, "video header data to render", 30000);
                const dataText = _$(".media-view .media-data").text();
                expect(dataText).toContain("320");
                expect(dataText).toContain("240");
                expect(_$(".media-view .media-path").text()).toContain("small.mp4");
            });
            it("should open a webm video", async function () {
                promise = MainViewManager._open(MainViewManager.ACTIVE_PANE, getFileObject("/videos/small.webm"));
                await awaitsForDone(promise, "MainViewManager.doOpen");
                expect(MainViewManager.getCurrentlyViewedFile(MainViewManager.ACTIVE_PANE).name).toEqual("small.webm");
                const videoEl = _$(".media-view video.media-preview")[0];
                await awaitsFor(function () {
                    return videoEl.readyState >= 1; // HAVE_METADATA
                }, "webm video metadata to load", 10000);
                expect(videoEl.videoWidth).toEqual(320);
            });
            it("should close a video", async function () {
                promise = MainViewManager._open(MainViewManager.ACTIVE_PANE, getFileObject("/videos/small.mp4"));
                await awaitsForDone(promise, "MainViewManager.doOpen");
                MainViewManager._close(MainViewManager.ACTIVE_PANE, getFileObject("/videos/small.mp4"));
                expect(MainViewManager.getCurrentlyViewedFile(MainViewManager.ACTIVE_PANE)).toEqual(null);
                expect(MainViewManager.getWorkingSetSize(MainViewManager.ALL_PANES)).toEqual(0);
                // the media view should have been destroyed
                expect(_$(".media-view").length).toEqual(0);
            });
            it("should add a video to the working set", async function () {
                promise = CommandManager.execute(Commands.CMD_ADD_TO_WORKINGSET_AND_OPEN,  { fullPath: testPath + "/videos/small.mp4" });
                await awaitsForDone(promise, Commands.CMD_ADD_TO_WORKINGSET_AND_OPEN);
                expect(MainViewManager.getCurrentlyViewedFile(MainViewManager.ACTIVE_PANE).name).toEqual("small.mp4");
                expect(MainViewManager.getWorkingSetSize(MainViewManager.ALL_PANES)).toEqual(1);
                expect(MainViewManager.findInWorkingSet(MainViewManager.ACTIVE_PANE, testPath + "/videos/small.mp4")).not.toEqual(-1);
            });
        });
        describe("Opening and closing Audio", function () {
            it("should open an audio file with the media viewer using an <audio> element", async function () {
                promise = MainViewManager._open(MainViewManager.ACTIVE_PANE, getFileObject("/audio/small.mp3"));
                await awaitsForDone(promise, "MainViewManager.doOpen");
                expect(MainViewManager.getCurrentlyViewedFile(MainViewManager.ACTIVE_PANE).name).toEqual("small.mp3");
                // should not have been added to the working set
                expect(MainViewManager.getWorkingSetSize(MainViewManager.ALL_PANES)).toEqual(0);
                // a media view with an <audio> element (not <video>) should have been created
                expect(_$(".media-view").length).toEqual(1);
                expect(_$(".media-view audio.media-preview").length).toEqual(1);
                expect(_$(".media-view video.media-preview").length).toEqual(0);
            });
            it("should load audio metadata and show duration and size", async function () {
                promise = MainViewManager._open(MainViewManager.ACTIVE_PANE, getFileObject("/audio/small.mp3"));
                await awaitsForDone(promise, "MainViewManager.doOpen");
                const audioEl = _$(".media-view audio.media-preview")[0];
                await awaitsFor(function () {
                    return audioEl.readyState >= 1; // HAVE_METADATA
                }, "audio metadata to load", 10000);
                expect(audioEl.duration).toBeGreaterThan(0);
                await awaitsFor(function () {
                    return _$(".media-view .media-data").text().length > 0;
                }, "audio header data to render", 10000);
                const dataText = _$(".media-view .media-data").text();
                expect(dataText).toContain("0:01");
                expect(_$(".media-view .media-path").text()).toContain("small.mp3");
            });
            it("should open a wav audio file", async function () {
                promise = MainViewManager._open(MainViewManager.ACTIVE_PANE, getFileObject("/audio/small.wav"));
                await awaitsForDone(promise, "MainViewManager.doOpen");
                expect(MainViewManager.getCurrentlyViewedFile(MainViewManager.ACTIVE_PANE).name).toEqual("small.wav");
                const audioEl = _$(".media-view audio.media-preview")[0];
                await awaitsFor(function () {
                    return audioEl.readyState >= 1; // HAVE_METADATA
                }, "wav audio metadata to load", 10000);
                expect(audioEl.duration).toBeGreaterThan(0);
            });
            it("should close an audio file", async function () {
                promise = MainViewManager._open(MainViewManager.ACTIVE_PANE, getFileObject("/audio/small.mp3"));
                await awaitsForDone(promise, "MainViewManager.doOpen");
                MainViewManager._close(MainViewManager.ACTIVE_PANE, getFileObject("/audio/small.mp3"));
                expect(MainViewManager.getCurrentlyViewedFile(MainViewManager.ACTIVE_PANE)).toEqual(null);
                expect(MainViewManager.getWorkingSetSize(MainViewManager.ALL_PANES)).toEqual(0);
                // the media view should have been destroyed
                expect(_$(".media-view").length).toEqual(0);
            });
            it("should add an audio file to the working set", async function () {
                promise = CommandManager.execute(Commands.CMD_ADD_TO_WORKINGSET_AND_OPEN,  { fullPath: testPath + "/audio/small.mp3" });
                await awaitsForDone(promise, Commands.CMD_ADD_TO_WORKINGSET_AND_OPEN);
                expect(MainViewManager.getCurrentlyViewedFile(MainViewManager.ACTIVE_PANE).name).toEqual("small.mp3");
                expect(MainViewManager.getWorkingSetSize(MainViewManager.ALL_PANES)).toEqual(1);
                expect(MainViewManager.findInWorkingSet(MainViewManager.ACTIVE_PANE, testPath + "/audio/small.mp3")).not.toEqual(-1);
            });
        });
        describe("Managing Image Views", function () {
            it("Image Views should Reparent", async function () {
                MainViewManager.setLayoutScheme(1, 2);
                promise = CommandManager.execute(Commands.CMD_ADD_TO_WORKINGSET_AND_OPEN,  { fullPath: testPath + "/images/events.jpg",
                    paneId: "first-pane"});
                await awaitsForDone(promise, Commands.CMD_ADD_TO_WORKINGSET_AND_OPEN);
                promise = CommandManager.execute(Commands.CMD_ADD_TO_WORKINGSET_AND_OPEN,  { fullPath: testPath + "/images/lrg_logo.png",
                    paneId: "second-pane"});
                await awaitsForDone(promise, Commands.CMD_ADD_TO_WORKINGSET_AND_OPEN);
                promise = CommandManager.execute(Commands.CMD_ADD_TO_WORKINGSET_AND_OPEN,  { fullPath: testPath + "/images/specials.jpg",
                    paneId: "second-pane"});
                await awaitsForDone(promise, Commands.CMD_ADD_TO_WORKINGSET_AND_OPEN);
                promise = CommandManager.execute(Commands.CMD_ADD_TO_WORKINGSET_AND_OPEN,  { fullPath: testPath + "/images/lrg_hero.jpg",
                    paneId: "second-pane"});
                await awaitsForDone(promise, Commands.CMD_ADD_TO_WORKINGSET_AND_OPEN);
                MainViewManager.setLayoutScheme(1, 1);
                expect(MainViewManager._getPaneIdForPath(testPath + "/images/events.jpg")).toEqual("first-pane");
                expect(MainViewManager._getPaneIdForPath(testPath + "/images/lrg_logo.png")).toEqual("first-pane");
                expect(MainViewManager._getPaneIdForPath(testPath + "/images/specials.jpg")).toEqual("first-pane");
                expect(MainViewManager._getPaneIdForPath(testPath + "/images/lrg_hero.jpg")).toEqual("first-pane");
            });
        });
    });
});
