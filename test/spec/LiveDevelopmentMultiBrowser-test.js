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

/*global describe, xit, beforeAll, afterAll, awaitsFor, it, awaitsForDone, expect */

define(function (require, exports, module) {


    const SpecRunnerUtils = require("spec/SpecRunnerUtils");

    describe("livepreview:MultiBrowser Live Preview", function () {

        var testWindow,
            brackets,
            DocumentManager,
            LiveDevMultiBrowser,
            LiveDevProtocol;

        var testFolder = SpecRunnerUtils.getTestPath("/spec/LiveDevelopment-MultiBrowser-test-files"),
            allSpacesRE = /\s+/gi;

        function fixSpaces(str) {
            return str.replace(allSpacesRE, " ");
        }

        beforeAll(async function () {
            // Create a new window that will be shared by ALL tests in this spec.
            if (!testWindow) {
                testWindow = await SpecRunnerUtils.createTestWindowAndRun();
                brackets = testWindow.brackets;
                DocumentManager = brackets.test.DocumentManager;
                LiveDevMultiBrowser = brackets.test.LiveDevMultiBrowser;
                LiveDevProtocol = require("LiveDevelopment/MultiBrowserImpl/protocol/LiveDevProtocol");

                await SpecRunnerUtils.loadProjectInTestWindow(testFolder);
            }
        });

        afterAll(function () {
            //LiveDevelopment.close();
            //SpecRunnerUtils.closeTestWindow();
            testWindow = null;
            brackets = null;
            LiveDevMultiBrowser = null;
            LiveDevProtocol = null;
        });

        async function waitsForLiveDevelopmentToOpen() {
            LiveDevMultiBrowser.open();
            await awaitsFor(
                function isLiveDevelopmentActive() {
                    return LiveDevMultiBrowser.status === LiveDevMultiBrowser.STATUS_ACTIVE;
                },
                "livedevelopment.done.opened",
                5000
            );
        }

        it("should establish a browser connection for an opened html file", async function () {
            //open a file
            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["simple1.html"]),
                "SpecRunnerUtils.openProjectFiles simple1.html", 1000);

            await waitsForLiveDevelopmentToOpen();

            expect(LiveDevMultiBrowser.status).toBe(LiveDevMultiBrowser.STATUS_ACTIVE);
            LiveDevMultiBrowser.close();
        });

        it("should establish a browser connection for an opened html file that has no 'head' tag", async function () {
            //open a file
            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["withoutHead.html"]),
                "SpecRunnerUtils.openProjectFiles withoutHead.html", 1000);
            await waitsForLiveDevelopmentToOpen();

            expect(LiveDevMultiBrowser.status).toBe(LiveDevMultiBrowser.STATUS_ACTIVE);
            LiveDevMultiBrowser.close();
        });

        it("should send all external stylesheets as related docs on start-up", async function () {
            let liveDoc;
            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["simple1.html"]),
                "SpecRunnerUtils.openProjectFiles simple1.html", 1000);
            await waitsForLiveDevelopmentToOpen();
            liveDoc = LiveDevMultiBrowser.getCurrentLiveDoc();
            await awaitsFor(
                function relatedDocsReceived() {
                    return (Object.getOwnPropertyNames(liveDoc.getRelated().stylesheets).length > 0);
                },
                "relatedDocuments.done.received",
                10000
            );
            expect(liveDoc.isRelated(testFolder + "/simple1.css")).toBeTruthy();
            expect(liveDoc.isRelated(testFolder + "/simpleShared.css")).toBeTruthy();
            LiveDevMultiBrowser.close();
        });

        it("should send all import-ed stylesheets as related docs on start-up", async function () {
            let liveDoc;
            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["simple1.html"]),
                "SpecRunnerUtils.openProjectFiles simple1.html", 1000);
            await waitsForLiveDevelopmentToOpen();
            liveDoc = LiveDevMultiBrowser.getCurrentLiveDoc();
            await awaitsFor(
                function relatedDocsReceived() {
                    return (Object.getOwnPropertyNames(liveDoc.getRelated().scripts).length > 0);
                },
                "relatedDocuments.done.received",
                10000
            );
            expect(liveDoc.isRelated(testFolder + "/import1.css")).toBeTruthy();
            LiveDevMultiBrowser.close();
        });

        it("should send all external javascript files as related docs on start-up", async function () {
            let liveDoc;
            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["simple1.html"]),
                "SpecRunnerUtils.openProjectFiles simple1.html", 1000);
            await waitsForLiveDevelopmentToOpen();

            liveDoc = LiveDevMultiBrowser.getCurrentLiveDoc();
            await awaitsFor(
                function relatedDocsReceived() {
                    return (Object.getOwnPropertyNames(liveDoc.getRelated().scripts).length > 0);
                },
                "relatedDocuments.done.received",
                10000
            );
            expect(liveDoc.isRelated(testFolder + "/simple1.js")).toBeTruthy();
            LiveDevMultiBrowser.close();
        });

        it("should send notifications for added/removed stylesheets through link nodes", async function () {
            let liveDoc;
            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["simple1.html"]),
                "SpecRunnerUtils.openProjectFiles simple1.html", 1000);
            await waitsForLiveDevelopmentToOpen();

            liveDoc = LiveDevMultiBrowser.getCurrentLiveDoc();

            let curDoc =  DocumentManager.getCurrentDocument();
            curDoc.replaceRange('<link href="simple2.css" rel="stylesheet">\n', {line: 8, ch: 0});

            await awaitsFor(
                function relatedDocsReceived() {
                    return (Object.getOwnPropertyNames(liveDoc.getRelated().stylesheets).length === 3);
                },
                "relatedDocuments.done.received",
                10000
            );

            curDoc.replaceRange('<link href="blank.css" rel="stylesheet">\n', {line: 8, ch: 0});

            await awaitsFor(
                function relatedDocsReceived() {
                    return (Object.getOwnPropertyNames(liveDoc.getRelated().stylesheets).length === 4);
                },
                "relatedDocuments.done.received",
                10000
            );

            // blank.css exist and hence part of live doc. o fix this
            expect(liveDoc.isRelated(testFolder + "/blank.css")).toBeTruthy();


            // todo #remove_not_working
            // curDoc =  DocumentManager.getCurrentDocument();
            // curDoc.replaceRange('', {line: 8, ch: 0}, {line: 8, ch: 50});
            //
            // await awaitsFor(
            //     function relatedDocsReceived() {
            //         return (Object.getOwnPropertyNames(liveDoc.getRelated().stylesheets).length === 3);
            //     },
            //     "relatedDocuments.done.received",
            //     10000
            // );
            //
            // expect(liveDoc.isRelated(testFolder + "/blank.css")).toBeFalsy();
            LiveDevMultiBrowser.close();
        });

        xit(" todo should send notifications for removed stylesheets through link nodes", async function () {
            // search for todo #remove_not_working
        });

        it("should push changes through browser connection when editing a related CSS", async function () {
            let localText,
                browserText,
                liveDoc,
                curDoc;
            const styleTextAdd = "\n .testClass { background-color:#090; }\n";

            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["simple1.html"]),
                "SpecRunnerUtils.openProjectFiles simple1.html", 1000);

            await waitsForLiveDevelopmentToOpen();

            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["simple1.css"]),
                "SpecRunnerUtils.openProjectFiles simple1.css", 1000);
            curDoc =  DocumentManager.getCurrentDocument();
            localText = curDoc.getText();
            localText += styleTextAdd;
            curDoc.setText(localText);
            liveDoc = LiveDevMultiBrowser.getLiveDocForPath(testFolder + "/simple1.css");
            let doneSyncing = false;
            liveDoc.getSourceFromBrowser().done(function (text) {
                browserText = text;
                // In LiveDocument._updateBrowser, we replace relative url()s with an absolute equivalent
                // Strip the leading http://127.0.0.1:port part so we can compare browser and editor text
                browserText = browserText.replace(/url\('http:\/\/127\.0\.0\.1:\d+\/import1\.css'\);/, "url('import1.css');");
            }).always(function () {
                doneSyncing = true;
            });
            await awaitsFor(function () { return doneSyncing; }, "Browser to sync changes", 5000);

            expect(fixSpaces(browserText).includes(fixSpaces(styleTextAdd))).toBeTrue();
            LiveDevMultiBrowser.close();
        });

        it("should make CSS-relative URLs absolute", async function () {
            var localText,
                browserText,
                liveDoc,
                curDoc;

            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["index.html"]),
                "SpecRunnerUtils.openProjectFiles simple1.html", 1000);

            await waitsForLiveDevelopmentToOpen();

            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["sub/test.css"]),
                "SpecRunnerUtils.openProjectFiles simple1.css", 1000);
            curDoc =  DocumentManager.getCurrentDocument();
            localText = curDoc.getText();
            localText += "\n .testClass { background-color:#090; }\n";
            curDoc.setText(localText);
            liveDoc = LiveDevMultiBrowser.getLiveDocForPath(testFolder + "/sub/test.css");
            var doneSyncing = false;
            liveDoc.getSourceFromBrowser().done(function (text) {
                browserText = text;
            }).always(function () {
                doneSyncing = true;
            });
            await awaitsFor(function () { return doneSyncing; }, "Browser to sync changes", 5000);

            // Drop the port from 127.0.0.1:port so it's easier to work with
            browserText = browserText.replace(/127\.0\.0\.1:\d+/, "127.0.0.1");

            // expect relative URL to have been made absolute
            expect(browserText).toContain("icon_chevron.png); }");
            // expect absolute URL to stay unchanged
            expect(browserText).toContain(".sub { background: url(file:///fake.png); }");
            LiveDevMultiBrowser.close();
        });
    });
});
