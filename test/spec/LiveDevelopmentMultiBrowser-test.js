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

/*global describe, xit, beforeAll, afterAll, afterEach, awaitsFor, it, awaitsForDone, expect, awaits */

define(function (require, exports, module) {


    const SpecRunnerUtils = require("spec/SpecRunnerUtils"),
        PhoenixCommSpecRunner = require("utils/PhoenixComm");

    describe("livepreview:MultiBrowser Live Preview", function () {

        var testWindow,
            brackets,
            DocumentManager,
            LiveDevMultiBrowser,
            EditorManager,
            CommandManager,
            Commands;

        var testFolder = SpecRunnerUtils.getTestPath("/spec/LiveDevelopment-MultiBrowser-test-files"),
            allSpacesRE = /\s+/gi;

        function fixSpaces(str) {
            return str.replace(allSpacesRE, " ");
        }

        async function getSourceFromBrowser(liveDoc) {
            let doneSyncing = false, browserText;
            liveDoc.getSourceFromBrowser().done(function (text) {
                browserText = text;
            }).always(function () {
                doneSyncing = true;
            });
            await awaitsFor(function () { return doneSyncing; }, "Browser to sync changes", 5000);
            return browserText;
        }

        beforeAll(async function () {
            // Create a new window that will be shared by ALL tests in this spec.
            if (!testWindow) {
                testWindow = await SpecRunnerUtils.createTestWindowAndRun();
                brackets = testWindow.brackets;
                DocumentManager = brackets.test.DocumentManager;
                LiveDevMultiBrowser = brackets.test.LiveDevMultiBrowser;
                CommandManager      = brackets.test.CommandManager;
                Commands            = brackets.test.Commands;
                EditorManager       = brackets.test.EditorManager;

                await SpecRunnerUtils.loadProjectInTestWindow(testFolder);
            }
        });

        afterAll(function () {
            LiveDevMultiBrowser.close();
            SpecRunnerUtils.closeTestWindow();
            testWindow = null;
            brackets = null;
            LiveDevMultiBrowser = null;
            CommandManager      = null;
            Commands            = null;
            EditorManager       = null;
        });

        async function endPreviewSession() {
            LiveDevMultiBrowser.close();
            await awaitsForDone(CommandManager.execute(Commands.FILE_CLOSE_ALL, { _forceClose: true }),
                "closing all file");
        }

        async function waitsForLiveDevelopmentFileSwitch() {
            await awaitsFor(
                function isLiveDevelopmentActive() {
                    return LiveDevMultiBrowser.status === LiveDevMultiBrowser.STATUS_ACTIVE;
                },
                "livedevelopment.done.opened",
                5000
            );
        }

        async function waitsForLiveDevelopmentToOpen() {
            LiveDevMultiBrowser.open();
            await waitsForLiveDevelopmentFileSwitch();
        }

        it("should there be no phoenix window open for live preview test to work", async function () {
            let instanceDetails = PhoenixCommSpecRunner.getAllInstanceDetails();
            expect(Object.keys(instanceDetails).length).toEqual(1);
            //open a file
            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["simple1.html"]),
                "SpecRunnerUtils.openProjectFiles simple1.html", 1000);

            await waitsForLiveDevelopmentToOpen();

            expect(LiveDevMultiBrowser.status).toBe(LiveDevMultiBrowser.STATUS_ACTIVE);
            await endPreviewSession();
        });

        it("should establish a browser connection for an opened html file", async function () {
            //open a file
            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["simple1.html"]),
                "SpecRunnerUtils.openProjectFiles simple1.html", 1000);

            await waitsForLiveDevelopmentToOpen();

            expect(LiveDevMultiBrowser.status).toBe(LiveDevMultiBrowser.STATUS_ACTIVE);
            await endPreviewSession();
        });

        it("should establish a browser connection for an opened html file that has no 'head' tag", async function () {
            //open a file
            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["withoutHead.html"]),
                "SpecRunnerUtils.openProjectFiles withoutHead.html", 1000);
            await waitsForLiveDevelopmentToOpen();

            expect(LiveDevMultiBrowser.status).toBe(LiveDevMultiBrowser.STATUS_ACTIVE);
            await endPreviewSession();
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
            await endPreviewSession();
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
            await endPreviewSession();
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
            await endPreviewSession();
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
            await endPreviewSession();
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
            browserText = await getSourceFromBrowser(liveDoc);
            browserText = browserText.replace(/url\('http:\/\/127\.0\.0\.1:\d+\/import1\.css'\);/, "url('import1.css');");

            expect(fixSpaces(browserText).includes(fixSpaces(styleTextAdd))).toBeTrue();
            await endPreviewSession();
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
            browserText = await getSourceFromBrowser(liveDoc);

            // Drop the port from 127.0.0.1:port so it's easier to work with
            browserText = browserText.replace(/127\.0\.0\.1:\d+/, "127.0.0.1");

            // expect relative URL to have been made absolute
            expect(browserText).toContain("icon_chevron.png); }");
            // expect absolute URL to stay unchanged
            expect(browserText).toContain(".sub { background: url(file:///fake.png); }");
            await endPreviewSession();
        });

        async function _editFileAndVerifyLivePreview(fileName, location, editText, verifyID, verifyText) {
            await awaitsForDone(SpecRunnerUtils.openProjectFiles([fileName]),
                "SpecRunnerUtils.openProjectFiles " + fileName, 1000);

            await awaits(300);
            expect(LiveDevMultiBrowser.status).toBe(LiveDevMultiBrowser.STATUS_ACTIVE);

            let curDoc =  DocumentManager.getCurrentDocument();
            curDoc.replaceRange(editText, location);
            let testId = testWindow.document.getElementById("panel-live-preview-frame")
                .contentDocument.getElementById(verifyID);
            await awaitsFor(
                function isTextChanged() {
                    return testId.textContent === verifyText;
                },
                "relatedDocuments.done.received",
                2000
            );
        }

        it("should Live preview push html file changes to browser", async function () {
            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["simple1.html"]),
                "SpecRunnerUtils.openProjectFiles simple1.html", 1000);

            await waitsForLiveDevelopmentToOpen();
            await _editFileAndVerifyLivePreview("simple1.html", {line: 11, ch: 45}, 'hello world ',
                "testId", "Brackets is hello world awesome!");
            await endPreviewSession();
        });

        it("should Live preview push html class changes to browser", async function () {
            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["simple1.html"]),
                "SpecRunnerUtils.openProjectFiles simple1.html", 1000);

            await waitsForLiveDevelopmentToOpen();
            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["simple1.html"]),
                "simple1.html", 1000);

            await awaits(300);

            expect(LiveDevMultiBrowser.status).toBe(LiveDevMultiBrowser.STATUS_ACTIVE);

            let curDoc =  DocumentManager.getCurrentDocument();

            // add a class
            curDoc.replaceRange("addClass ", {line: 11, ch: 22});
            let testId = testWindow.document.getElementById("panel-live-preview-frame")
                .contentDocument.getElementById("testId");
            await awaitsFor(
                function isClassChanged() {
                    return testId.classList.contains("addClass");
                },
                "replaceClass",
                2000
            );

            // remove a class
            curDoc.replaceRange("", {line: 11, ch: 22}, {line: 11, ch: 31});
            await awaitsFor(
                function isClassChanged() {
                    return !testId.classList.contains("addClass");
                },
                "replaceClass",
                2000
            );

            await endPreviewSession();
        });

        it("should Live preview push html attribute changes to browser", async function () {
            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["simple1.html"]),
                "SpecRunnerUtils.openProjectFiles simple1.html", 1000);

            await waitsForLiveDevelopmentToOpen();
            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["simple1.html"]),
                "simple1.html", 1000);

            await awaits(300);

            expect(LiveDevMultiBrowser.status).toBe(LiveDevMultiBrowser.STATUS_ACTIVE);

            let curDoc =  DocumentManager.getCurrentDocument();

            // add an attribute
            curDoc.replaceRange(' hello="world" ', {line: 11, ch: 15});
            let testId = testWindow.document.getElementById("panel-live-preview-frame")
                .contentDocument.getElementById("testId");
            await awaitsFor(
                function isAttributeAdded() {
                    return testId.getAttribute("hello") === "world";
                },
                "attribute add",
                2000
            );

            // remove the attribute
            curDoc.replaceRange("", {line: 11, ch: 15}, {line: 11, ch: 30});
            await awaitsFor(
                function isClassChanged() {
                    return testId.getAttribute("hello") !== "world";
                },
                "attribute remove",
                2000
            );

            await endPreviewSession();
        });

        it("should Live preview work even if we switch html files", async function () {
            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["simple1.html"]),
                "SpecRunnerUtils.openProjectFiles simple1.html", 1000);

            await waitsForLiveDevelopmentToOpen();
            await _editFileAndVerifyLivePreview("simple1.html", {line: 11, ch: 45}, 'hello world ',
                "testId", "Brackets is hello world awesome!");
            await _editFileAndVerifyLivePreview("simple2.html", {line: 11, ch: 45}, 'hello world ',
                "simpId", "Brackets is hello world awesome!");
            // now switch back to old file
            await _editFileAndVerifyLivePreview("simple1.html", {line: 11, ch: 45}, 'hello world ',
                "testId", "Brackets is hello world hello world awesome!");
            await endPreviewSession();
        }, 5000);

        it("should Markdown/image files be previewed and switched between live previews", async function () {
            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["simple1.html"]),
                "SpecRunnerUtils.openProjectFiles simple1.html", 1000);

            await waitsForLiveDevelopmentToOpen();
            await _editFileAndVerifyLivePreview("simple1.html", {line: 11, ch: 45}, 'hello world ',
                "testId", "Brackets is hello world awesome!");

            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["readme.md"]),
                "readme.md", 1000);
            await awaits(300);
            let iFrame = testWindow.document.getElementById("panel-live-preview-frame");
            expect(iFrame.srcdoc.includes("This is a markdown file")).toBeTrue();

            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["sub/icon_chevron.png"]),
                "icon_chevron.png", 1000);
            await awaits(300);
            iFrame = testWindow.document.getElementById("panel-live-preview-frame");
            expect(iFrame.src.endsWith("sub/icon_chevron.png")).toBeTrue();

            // now switch back to old file
            await _editFileAndVerifyLivePreview("simple1.html", {line: 11, ch: 45}, 'hello world ',
                "testId", "Brackets is hello world hello world awesome!");
            await endPreviewSession();
        }, 5000);

        it("should pin live previews ping html file", async function () {
            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["simple1.html"]),
                "SpecRunnerUtils.openProjectFiles simple1.html", 1000);

            await waitsForLiveDevelopmentToOpen();
            await _editFileAndVerifyLivePreview("simple1.html", {line: 11, ch: 45}, 'hello world ',
                "testId", "Brackets is hello world awesome!");

            let pinURLBtn = testWindow.$(testWindow.document.getElementById("pinURLButton"));
            pinURLBtn.click();

            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["sub/icon_chevron.png"]),
                "icon_chevron.png", 1000);
            await awaits(300);
            let iFrame = testWindow.document.getElementById("panel-live-preview-frame");
            expect(iFrame.src.endsWith("simple1.html")).toBeTrue();

            pinURLBtn.click();

            await awaits(300);
            iFrame = testWindow.document.getElementById("panel-live-preview-frame");
            expect(iFrame.src.endsWith("sub/icon_chevron.png")).toBeTrue();

            await endPreviewSession();
        }, 5000);

        it("should live highlight html elements", async function () {
            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["simple1.html"]),
                "SpecRunnerUtils.openProjectFiles simple1.html", 1000);
            let iFrame = testWindow.document.getElementById("panel-live-preview-frame");

            await waitsForLiveDevelopmentToOpen();
            let editor = EditorManager.getActiveEditor();
            let highlights = iFrame.contentDocument.getElementsByClassName("__brackets-ld-highlight");
            expect(highlights.length).toBe(0);

            editor.setCursorPos({ line: 11, ch: 10 });

            await awaits(300);
            highlights = iFrame.contentDocument.getElementsByClassName("__brackets-ld-highlight");
            expect(highlights.length).toBe(1);
            expect(highlights[0].trackingElement.id).toBe("testId");

            await endPreviewSession();
        }, 5000);

        it("should live highlight css classes highlight all elements", async function () {
            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["simple2.html"]),
                "SpecRunnerUtils.openProjectFiles simple2.html", 1000);
            let iFrame = testWindow.document.getElementById("panel-live-preview-frame");

            await waitsForLiveDevelopmentToOpen();
            let highlights = iFrame.contentDocument.getElementsByClassName("__brackets-ld-highlight");
            expect(highlights.length).toBe(0);

            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["simple1.css"]),
                "simple1.css", 1000);
            let editor = EditorManager.getActiveEditor();
            editor.setCursorPos({ line: 2, ch: 6 });

            await awaits(300);
            highlights = iFrame.contentDocument.getElementsByClassName("__brackets-ld-highlight");
            expect(highlights.length).toBe(3);
            expect(highlights[0].trackingElement.classList[0]).toBe("testClass");

            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["import1.css"]),
                "import1.css", 1000);
            editor = EditorManager.getActiveEditor();
            editor.setCursorPos({ line: 0, ch: 1 });

            await awaits(300);
            highlights = iFrame.contentDocument.getElementsByClassName("__brackets-ld-highlight");
            expect(highlights.length).toBe(2);
            expect(highlights[0].trackingElement.classList[0]).toBe("testClass2");

            await endPreviewSession();
        }, 5000);

        it("should live highlight resize as window size changes", async function () {
            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["simple1.html"]),
                "SpecRunnerUtils.openProjectFiles simple1.html", 1000);
            let iFrame = testWindow.document.getElementById("panel-live-preview-frame");

            await waitsForLiveDevelopmentToOpen();
            let editor = EditorManager.getActiveEditor();
            let highlights = iFrame.contentDocument.getElementsByClassName("__brackets-ld-highlight");
            expect(highlights.length).toBe(0);

            editor.setCursorPos({ line: 11, ch: 10 });

            await awaits(300);
            highlights = iFrame.contentDocument.getElementsByClassName("__brackets-ld-highlight");
            expect(highlights.length).toBe(1);
            let originalWidth = highlights[0].style.width;
            iFrame.style.width = "100px";
            await awaits(100);
            expect(highlights[0].style.width).not.toBe(originalWidth);
            iFrame.style.width = "100%";
            await awaits(100);
            expect(highlights[0].style.width).toBe(originalWidth);

            await endPreviewSession();
        }, 5000);

        it("should reverse highlight on clicking on live preview", async function () {
            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["simple1.html"]),
                "SpecRunnerUtils.openProjectFiles simple1.html", 1000);
            let iFrame = testWindow.document.getElementById("panel-live-preview-frame");

            await waitsForLiveDevelopmentToOpen();
            let editor = EditorManager.getActiveEditor();

            await awaits(300);
            let highlights = iFrame.contentDocument.getElementsByClassName("__brackets-ld-highlight");
            expect(highlights.length).toBe(0);

            iFrame.contentDocument.getElementById("testId2").click();
            await awaits(300);
            highlights = iFrame.contentDocument.getElementsByClassName("__brackets-ld-highlight");
            expect(highlights.length).toBe(1);
            expect(highlights[0].trackingElement.id).toBe("testId2");
            expect(editor.getCursorPos()).toEql({ line: 12, ch: 0, sticky: null });

            await endPreviewSession();
        }, 5000);

        it("should reverse highlight open previewed html file if not open on clicking live preview", async function () {
            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["simple1.html"]),
                "SpecRunnerUtils.openProjectFiles simple1.html", 1000);
            let iFrame = testWindow.document.getElementById("panel-live-preview-frame");

            await waitsForLiveDevelopmentToOpen();

            await awaits(300);
            let highlights = iFrame.contentDocument.getElementsByClassName("__brackets-ld-highlight");
            expect(highlights.length).toBe(0);

            await awaitsForDone(CommandManager.execute(Commands.FILE_CLOSE_ALL, { _forceClose: true }),
                "closing all file");

            iFrame.contentDocument.getElementById("testId2").click();

            await awaits(300);
            // The live previewed file should now be opened in the editor
            let editor = EditorManager.getActiveEditor();
            expect(editor.document.file.fullPath.endsWith("simple1.html")).toBeTrue();

            // live highlights should still work
            iFrame.contentDocument.getElementById("testId").click();
            await awaits(300);

            highlights = iFrame.contentDocument.getElementsByClassName("__brackets-ld-highlight");
            expect(highlights.length).toBe(1);
            expect(highlights[0].trackingElement.id).toBe("testId");
            expect(editor.getCursorPos()).toEql({ line: 11, ch: 0, sticky: null });

            await endPreviewSession();
        }, 5000);
    });
});
