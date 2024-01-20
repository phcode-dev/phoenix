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

/*global describe, beforeAll, afterAll, awaitsFor, it, awaitsForDone, expect, awaits, Phoenix */

define(function (require, exports, module) {


    const SpecRunnerUtils = require("spec/SpecRunnerUtils");

    describe("livepreview:MultiBrowser Live Preview", function () {

        async function _waitForIframeSrc(name) {
            await awaitsFor(()=>{
                let outerIFrame = testWindow.document.getElementById("panel-live-preview-frame");
                let srcURL = new URL(outerIFrame.src);
                return srcURL.pathname.endsWith(name) === true;
            }, "waiting for name- " + name);
        }

        if(Phoenix.isTestWindowPlaywright && !Phoenix.browser.desktop.isChromeBased) {
            it("All tests requiring virtual server is disabled in playwright/firefox/safari", async function () {
                // we dont spawn virtual server in iframe playwright linux/safari as playwright linux/safari fails badly
                // we dont need virtual server for tests except for live preview and custom extension load tests,
                // which are disabled in playwright. We test in chrome atleast as chromium support is a baseline.
            });
            return;
        }

        var testWindow,
            brackets,
            DocumentManager,
            LiveDevMultiBrowser,
            LiveDevProtocol,
            EditorManager,
            CommandManager,
            BeautificationManager,
            Commands,
            WorkspaceManager,
            PreferencesManager;

        let testFolder = SpecRunnerUtils.getTestPath("/spec/LiveDevelopment-MultiBrowser-test-files"),
            prettierTestFolder = SpecRunnerUtils.getTestPath("/spec/prettier-test-files"),
            allSpacesRE = /\s+/gi;

        const SVG_IMAGE_PATH = "sub/phoenix-logo.svg";

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
            await awaitsFor(function () { return doneSyncing; }, "Browser to sync changes", 20000);
            return browserText;
        }

        beforeAll(async function () {
            // Create a new window that will be shared by ALL tests in this spec.
            if (!testWindow) {
                // we have to popout a new window and cant use the embedded iframe for live preview integ tests
                // as Firefox sandbox prevents service worker access from nexted iframes.
                // In tauri, we use node server, so this limitation doesn't apply in tauri, and we stick to iframes.
                const useWindowInsteadOfIframe = (Phoenix.browser.desktop.isFirefox && !window.__TAURI__);
                testWindow = await SpecRunnerUtils.createTestWindowAndRun({
                    forceReload: true, useWindowInsteadOfIframe});
                brackets = testWindow.brackets;
                DocumentManager = brackets.test.DocumentManager;
                LiveDevMultiBrowser = brackets.test.LiveDevMultiBrowser;
                LiveDevProtocol = brackets.test.LiveDevProtocol;
                CommandManager      = brackets.test.CommandManager;
                Commands            = brackets.test.Commands;
                EditorManager       = brackets.test.EditorManager;
                WorkspaceManager    = brackets.test.WorkspaceManager;
                BeautificationManager       = brackets.test.BeautificationManager;
                PreferencesManager       = brackets.test.PreferencesManager;

                await SpecRunnerUtils.loadProjectInTestWindow(testFolder);
                if(!WorkspaceManager.isPanelVisible('live-preview-panel')){
                    await awaitsForDone(CommandManager.execute(Commands.FILE_LIVE_FILE_PREVIEW));
                }
            }
        }, 30000);

        afterAll(async function () {
            LiveDevMultiBrowser.close();
            await SpecRunnerUtils.closeTestWindow(true);
            testWindow = null;
            brackets = null;
            LiveDevMultiBrowser = null;
            CommandManager      = null;
            Commands            = null;
            EditorManager       = null;
        }, 30000);

        async function _enableLiveHighlights(enable) {
            PreferencesManager.setViewState("livedev.highlight", enable);
        }
        async function endPreviewSession() {
            await _enableLiveHighlights(true);
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
                20000
            );
            let editor = EditorManager.getActiveEditor();
            editor && editor.setCursorPos({ line: 0, ch: 0 });
        }

        async function waitsForLiveDevelopmentToOpen() {
            LiveDevMultiBrowser.open();
            await waitsForLiveDevelopmentFileSwitch();
        }

        it("should establish a browser connection for an opened html file", async function () {
            //open a file
            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["simple1.html"]),
                "SpecRunnerUtils.openProjectFiles simple1.html");

            await waitsForLiveDevelopmentToOpen();

            expect(LiveDevMultiBrowser.status).toBe(LiveDevMultiBrowser.STATUS_ACTIVE);
            await endPreviewSession();
        }, 30000);

        it("should establish a browser connection for an opened html file that has no 'head' tag", async function () {
            //open a file
            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["withoutHead.html"]),
                "SpecRunnerUtils.openProjectFiles withoutHead.html");
            await waitsForLiveDevelopmentToOpen();

            expect(LiveDevMultiBrowser.status).toBe(LiveDevMultiBrowser.STATUS_ACTIVE);
            await endPreviewSession();
        }, 30000);

        it("should send all external stylesheets as related docs on start-up", async function () {
            let liveDoc;
            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["simple1.html"]),
                "SpecRunnerUtils.openProjectFiles simple1.html");
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
        }, 30000);

        it("should send all import-ed stylesheets as related docs on start-up", async function () {
            let liveDoc;
            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["simple1.html"]),
                "SpecRunnerUtils.openProjectFiles simple1.html");
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
        }, 30000);

        it("should send all external javascript files as related docs on start-up", async function () {
            let liveDoc;
            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["simple1.html"]),
                "SpecRunnerUtils.openProjectFiles simple1.html");
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
        }, 30000);

        function _isRelatedStyleSheet(liveDoc, fileName) {
            let relatedSheets = Object.keys(liveDoc.getRelated().stylesheets);
            for(let relatedPath of relatedSheets){
                if(relatedPath.endsWith(fileName)) {
                    return true;
                }
            }
            return false;
        }

        it("should send notifications for added/removed stylesheets through link nodes", async function () {
            let liveDoc;
            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["simple1.html"]),
                "SpecRunnerUtils.openProjectFiles simple1.html");
            await waitsForLiveDevelopmentToOpen();

            liveDoc = LiveDevMultiBrowser.getCurrentLiveDoc();

            let curDoc =  DocumentManager.getCurrentDocument();

            curDoc.replaceRange('<link href="blank.css" rel="stylesheet">\n', {line: 8, ch: 0});

            await awaitsFor(
                function relatedDocsReceived() {
                    return _isRelatedStyleSheet(liveDoc, "blank.css");
                },
                "relatedDocuments.done.received",
                20000
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
        }, 30000);

        // search for todo #remove_not_working fix in future
        // xit(" todo should send notifications for removed stylesheets through link nodes", async function () {
        // });

        it("should push changes through browser connection when editing a related CSS", async function () {
            let localText,
                browserText,
                liveDoc,
                curDoc;
            const styleTextAdd = "\n .testClass { background-color:#090; }\n";

            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["simple1.html"]),
                "SpecRunnerUtils.openProjectFiles simple1.html");

            await waitsForLiveDevelopmentToOpen();

            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["simple1.css"]),
                "SpecRunnerUtils.openProjectFiles simple1.css");
            curDoc =  DocumentManager.getCurrentDocument();
            localText = curDoc.getText();
            localText += styleTextAdd;
            curDoc.setText(localText);
            liveDoc = LiveDevMultiBrowser.getLiveDocForPath(testFolder + "/simple1.css");
            browserText = await getSourceFromBrowser(liveDoc);
            browserText = browserText.replace(/url\('http:\/\/127\.0\.0\.1:\d+\/import1\.css'\);/, "url('import1.css');");

            expect(fixSpaces(browserText).includes(fixSpaces(styleTextAdd))).toBeTrue();
            await endPreviewSession();
        }, 30000);

        it("should make CSS-relative URLs absolute", async function () {
            var localText,
                browserText,
                liveDoc,
                curDoc;

            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["index.html"]),
                "SpecRunnerUtils.openProjectFiles simple1.html");

            await waitsForLiveDevelopmentToOpen();

            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["sub/test.css"]),
                "SpecRunnerUtils.openProjectFiles simple1.css");
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
        }, 30000);

        async function _editFileAndVerifyLivePreview(fileName, location, editText, verifyID, verifyText) {
            await awaitsForDone(SpecRunnerUtils.openProjectFiles([fileName]),
                "SpecRunnerUtils.openProjectFiles " + fileName);

            await awaits(1000); // todo can we remove this
            await awaitsFor(
                function isTextChanged() {
                    return LiveDevMultiBrowser.status === LiveDevMultiBrowser.STATUS_ACTIVE;
                },
                "waiting for live preview active",
                5000,
                50
            );

            let curDoc =  DocumentManager.getCurrentDocument();
            curDoc.replaceRange(editText, location);
            let result;
            await awaitsFor(
                function isTextChanged() {
                    LiveDevProtocol.evaluate(`document.getElementById('${verifyID}').textContent`)
                        .done((response)=>{
                            result = JSON.parse(response.result||"");
                        });
                    return result === verifyText;
                },
                "relatedDocuments.done.received",
                5000,
                50
            );
        }

        it("should Live preview push html file changes to browser", async function () {
            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["simple1.html"]),
                "SpecRunnerUtils.openProjectFiles simple1.html");

            await waitsForLiveDevelopmentToOpen();
            await _editFileAndVerifyLivePreview("simple1.html", {line: 11, ch: 45}, 'hello world ',
                "testId", "Brackets is hello world awesome!");
            await endPreviewSession();
        }, 30000);

        it("should Live preview push html class changes to browser", async function () {
            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["simple1.html"]),
                "SpecRunnerUtils.openProjectFiles simple1.html");

            await waitsForLiveDevelopmentToOpen();
            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["simple1.html"]),
                "simple1.html");

            await awaitsFor(()=> LiveDevMultiBrowser.status === LiveDevMultiBrowser.STATUS_ACTIVE,
                "status active");

            let curDoc =  DocumentManager.getCurrentDocument();

            // add a class
            curDoc.replaceRange("addClass ", {line: 11, ch: 22});
            let hasClass;
            await awaitsFor(
                function isClassChanged() {
                    LiveDevProtocol.evaluate(`document.getElementById('testId').classList.contains("addClass")`)
                        .done((response)=>{
                            hasClass = JSON.parse(response.result||"");
                        });
                    return hasClass;
                },
                "replaceClass",
                5000,
                50
            );

            // remove a class
            curDoc.replaceRange("", {line: 11, ch: 22}, {line: 11, ch: 31});
            await awaitsFor(
                function isClassChanged() {
                    LiveDevProtocol.evaluate(`document.getElementById('testId').classList.contains("addClass")`)
                        .done((response)=>{
                            hasClass = JSON.parse(response.result||"");
                        });
                    return hasClass;
                },
                "replaceClass",
                5000,
                50
            );

            await endPreviewSession();
        }, 30000);

        it("should Live preview push html attribute changes to browser", async function () {
            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["simple1.html"]),
                "SpecRunnerUtils.openProjectFiles simple1.html");

            await waitsForLiveDevelopmentToOpen();
            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["simple1.html"]),
                "simple1.html");

            await awaitsFor(()=> LiveDevMultiBrowser.status === LiveDevMultiBrowser.STATUS_ACTIVE,
                "status active");

            let curDoc =  DocumentManager.getCurrentDocument();

            // add an attribute
            curDoc.replaceRange(' hello="world" ', {line: 11, ch: 15});
            let result;
            await awaitsFor(
                function isAttributeAdded() {
                    LiveDevProtocol.evaluate(`document.getElementById('testId').getAttribute("hello")`)
                        .done((response)=>{
                            result = JSON.parse(response.result||"");
                        });
                    return result === "world";
                },
                "attribute add",
                5000,
                50
            );

            // remove the attribute
            curDoc.replaceRange("", {line: 11, ch: 15}, {line: 11, ch: 30});
            await awaitsFor(
                function isClassChanged() {
                    LiveDevProtocol.evaluate(`document.getElementById('testId').getAttribute("hello")`)
                        .done((response)=>{
                            result = JSON.parse(response.result||"");
                        });
                    return result !== "world";
                },
                "attribute remove",
                5000,
                50
            );

            await endPreviewSession();
        }, 30000);

        it("should Live preview work even if we switch html files", async function () {
            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["simple1.html"]),
                "SpecRunnerUtils.openProjectFiles simple1.html");

            await waitsForLiveDevelopmentToOpen();
            await _editFileAndVerifyLivePreview("simple1.html", {line: 11, ch: 45}, 'hello world ',
                "testId", "Brackets is hello world awesome!");
            await _editFileAndVerifyLivePreview("simple2.html", {line: 11, ch: 45}, 'hello world ',
                "simpId", "Brackets is hello world awesome!");
            // now switch back to old file
            await _editFileAndVerifyLivePreview("simple1.html", {line: 11, ch: 45}, 'hello world ',
                "testId", "Brackets is hello world hello world awesome!");
            await endPreviewSession();
        }, 30000);

        it("should Markdown/svg image files be previewed and switched between live previews", async function () {
            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["simple1.html"]),
                "SpecRunnerUtils.openProjectFiles simple1.html");

            await waitsForLiveDevelopmentToOpen();
            await _editFileAndVerifyLivePreview("simple1.html", {line: 11, ch: 45}, 'hello world ',
                "testId", "Brackets is hello world awesome!");

            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["readme.md"]),
                "readme.md");
            await awaits(300);
            let iFrame = testWindow.document.getElementById("panel-live-preview-frame");
            expect(iFrame.src.endsWith("readme.md")).toBeTrue();

            await awaitsForDone(SpecRunnerUtils.openProjectFiles([SVG_IMAGE_PATH]),
                SVG_IMAGE_PATH);
            await awaits(500);
            iFrame = testWindow.document.getElementById("panel-live-preview-frame");
            let srcURL = new URL(iFrame.src);
            expect(srcURL.pathname.endsWith(SVG_IMAGE_PATH)).toBeTrue();

            // now switch back to old file
            await _editFileAndVerifyLivePreview("simple1.html", {line: 11, ch: 45}, 'hello world ',
                "testId", "Brackets is hello world hello world awesome!");
            await endPreviewSession();
        }, 30000);

        it("should not live preview binary image files", async function () {
            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["simple1.html"]),
                "SpecRunnerUtils.openProjectFiles simple1.html");

            await waitsForLiveDevelopmentToOpen();
            await _editFileAndVerifyLivePreview("simple1.html", {line: 11, ch: 45}, 'hello world ',
                "testId", "Brackets is hello world awesome!");

            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["sub/icon_chevron.png"]),
                "sub/icon_chevron.png");
            await awaits(500);
            let iFrame = testWindow.document.getElementById("panel-live-preview-frame");
            expect(iFrame.src.endsWith("simple1.html")).toBeTrue();
            await endPreviewSession();
        }, 30000);

        it("focus test: should html live previews never take focus from editor", async function () {
            // this test may fail if the test window doesn't have focus
            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["simple1.html"]),
                "SpecRunnerUtils.openProjectFiles simple1.html");

            await waitsForLiveDevelopmentToOpen();
            await _editFileAndVerifyLivePreview("simple1.html", {line: 11, ch: 45}, 'hello world ',
                "testId", "Brackets is hello world awesome!");

            let iFrame = testWindow.document.getElementById("panel-live-preview-frame");
            expect(iFrame.src.endsWith("simple1.html")).toBeTrue();
            iFrame.focus(); // live preview has focus but it can take html focus, the live preview has to
            // delegate focus to editor explicitly in case of html files.
            expect(testWindow.document.activeElement).toEqual(iFrame);
            // for html, it can take focus, but clicking on any non- text elemnt will make it loose focus to editor
            await forRemoteExec(`document.getElementById("testId2").click()`);
            await awaits(500);
            const activeElement = testWindow.document.activeElement;
            const editorHolder = testWindow.document.getElementById("editor-holder");
            expect(editorHolder.contains(activeElement)).toBeTrue();

            await endPreviewSession();
        }, 30000);

        it("focus test: should markdown previews never take focus from editor", async function () {
            // this test may fail if the test window doesn't have focus
            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["simple1.html"]),
                "SpecRunnerUtils.openProjectFiles simple1.html");

            await waitsForLiveDevelopmentToOpen();
            await _editFileAndVerifyLivePreview("simple1.html", {line: 11, ch: 45}, 'hello world ',
                "testId", "Brackets is hello world awesome!");

            let iFrame = testWindow.document.getElementById("panel-live-preview-frame");
            expect(iFrame.src.endsWith("simple1.html")).toBeTrue();
            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["readme.md"]),
                "readme.md");

            await awaits(300);
            let outerIFrame = testWindow.document.getElementById("panel-live-preview-frame");
            expect(outerIFrame.src.endsWith("readme.md")).toBeTrue();
            outerIFrame.focus();
            expect(testWindow.document.activeElement).toEqual(outerIFrame);

            // Editor lost focus, it will gain back as the editor detects it lost focus to live preview pane in 100 ms
            await awaits(500);

            const activeElement = testWindow.document.activeElement;
            const editorHolder = testWindow.document.getElementById("editor-holder");
            expect(editorHolder.contains(activeElement)).toBeTrue();

            await endPreviewSession();
        }, 30000);

        it("should Markdown preview hyperlinks be proper", async function () {
            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["simple1.html"]),
                "SpecRunnerUtils.openProjectFiles simple1.html");

            await waitsForLiveDevelopmentToOpen();

            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["readme.md"]),
                "readme.md");

            await awaits(300);
            let outerIFrame = testWindow.document.getElementById("panel-live-preview-frame");
            expect(outerIFrame.src.endsWith("readme.md")).toBeTrue();

            // todo check hrefs in markdown. currently we do not have mechanism to exec code image and markdown previews
            // in future we should do this check too.
            // let href = iFrame.contentDocument.getElementsByTagName("a")[0].href;
            // expect(href.endsWith("LiveDevelopment-MultiBrowser-test-files/readme.md#title-link")).toBeTrue();
            // href = iFrame.contentDocument.getElementsByTagName("img")[0].src;
            // expect(href.endsWith("LiveDevelopment-MultiBrowser-test-files/sub/icon_chevron.png")).toBeTrue();

            await endPreviewSession();
        }, 30000);

        it("should be able to preview Markdown file not in project", async function () {
            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["simple1.html"]),
                "SpecRunnerUtils.openProjectFiles simple1.html");

            await waitsForLiveDevelopmentToOpen();

            await awaitsForDone(SpecRunnerUtils.openFiles([`${prettierTestFolder}/test.md`]),
                "external proj/test.md");

            await awaits(300);
            let outerIFrame = testWindow.document.getElementById("panel-live-preview-frame");
            expect(outerIFrame.src.endsWith("test.md")).toBeTrue();
            await endPreviewSession();
        }, 30000);

        it("should title of live preview panel be as expected", async function () {
            const titleEl = testWindow.document.getElementById('panel-live-preview-title');
            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["simple1.html"]),
                "SpecRunnerUtils.openProjectFiles simple1.html");
            await waitsForLiveDevelopmentToOpen();

            expect(titleEl.textContent.startsWith("simple1.html")).toBeTrue();

            const fullExternalFilePath = `${prettierTestFolder}/test.md`;
            await awaitsForDone(SpecRunnerUtils.openFiles([fullExternalFilePath]),
                "external proj/test.md");

            await awaits(300);
            expect(titleEl.textContent.startsWith(Phoenix.app.getDisplayPath(fullExternalFilePath))).toBeTrue();
            await endPreviewSession();
        }, 30000);

        it("should not be able to preview html file not in project - tauri only", async function () {
            if(!Phoenix.browser.isTauri) {
                return;
            }
            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["simple1.html"]),
                "SpecRunnerUtils.openProjectFiles simple1.html");

            await waitsForLiveDevelopmentToOpen();

            await awaitsForDone(SpecRunnerUtils.openFiles([`${prettierTestFolder}/html/test.html`]),
                "external project html/test.html");

            await awaits(300);
            let outerIFrame = testWindow.document.getElementById("panel-live-preview-frame");
            expect(outerIFrame.src.includes("phoenix-splash/no-preview.html")).toBeTrue();
            await endPreviewSession();
        }, 30000);

        async function forRemoteExec(script, compareFn) {
            let result;
            await awaitsFor(
                function isClassChanged() {
                    LiveDevProtocol.evaluate(script)
                        .done((response)=>{
                            result = JSON.parse(response.result||"");
                        });
                    if(compareFn){
                        return compareFn(result);
                    }
                    // just exec and return if no compare function is specified
                    return true;
                },
                "awaitRemoteExec",
                5000,
                50
            );
        }

        it("should live highlight html elements", async function () {
            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["simple1.html"]),
                "SpecRunnerUtils.openProjectFiles simple1.html");
            let iFrame = testWindow.document.getElementById("panel-live-preview-frame");

            await waitsForLiveDevelopmentToOpen();
            let editor = EditorManager.getActiveEditor();
            editor.setCursorPos({ line: 0, ch: 0 });
            await forRemoteExec(`document.getElementsByClassName("__brackets-ld-highlight").length`, (result)=>{
                return result === 0;
            });

            editor.setCursorPos({ line: 11, ch: 10 });

            await forRemoteExec(`document.getElementsByClassName("__brackets-ld-highlight").length`, (result)=>{
                return result === 1;
            });
            await forRemoteExec(`document.getElementsByClassName("__brackets-ld-highlight")[0].trackingElement.id`,
                (result)=>{
                    return result === 'testId';
                });

            await endPreviewSession();
        }, 30000);

        it("should live highlight css classes highlight all elements", async function () {
            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["simple2.html"]),
                "SpecRunnerUtils.openProjectFiles simple2.html");

            await waitsForLiveDevelopmentToOpen();
            await forRemoteExec(`document.getElementsByClassName("__brackets-ld-highlight").length`, (result)=>{
                return result === 0;
            });

            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["simple1.css"]),
                "simple1.css");
            let editor = EditorManager.getActiveEditor();
            editor.setCursorPos({ line: 2, ch: 6 });

            await awaits(500);
            await forRemoteExec(`document.getElementsByClassName("__brackets-ld-highlight").length`, (result)=>{
                return result === 3;
            });
            await forRemoteExec(
                `document.getElementsByClassName("__brackets-ld-highlight")[0].trackingElement.classList[0]`,
                (result)=>{
                    return result === 'testClass';
                });

            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["import1.css"]),
                "import1.css");
            editor = EditorManager.getActiveEditor();
            editor.setCursorPos({ line: 0, ch: 1 });

            await awaits(500);
            await forRemoteExec(`document.getElementsByClassName("__brackets-ld-highlight").length`, (result)=>{
                return result === 2;
            });
            await forRemoteExec(
                `document.getElementsByClassName("__brackets-ld-highlight")[0].trackingElement.classList[0]`,
                (result)=>{
                    return result === 'testClass2';
                });

            await endPreviewSession();
        }, 30000);

        it("should live highlight resize as window size changes", async function () {
            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["simple1.html"]),
                "SpecRunnerUtils.openProjectFiles simple1.html");
            let iFrame = testWindow.document.getElementById("panel-live-preview-frame");

            await waitsForLiveDevelopmentToOpen();
            let editor = EditorManager.getActiveEditor();
            await forRemoteExec(`document.getElementsByClassName("__brackets-ld-highlight").length`, (result)=>{
                return result === 0;
            });

            editor.setCursorPos({ line: 11, ch: 10 });

            await awaits(500);
            await forRemoteExec(`document.getElementsByClassName("__brackets-ld-highlight").length`, (result)=>{
                return result === 1;
            });
            let originalWidth;
            await forRemoteExec(`document.getElementsByClassName("__brackets-ld-highlight")[0].style.width`, (result)=>{
                originalWidth = result;
                return true;
            });

            iFrame.style.width = "100px";
            await awaits(500);
            await forRemoteExec(`document.getElementsByClassName("__brackets-ld-highlight")[0].style.width`, (result)=>{
                return originalWidth !== result;
            });
            iFrame.style.width = "100%";
            await awaits(500);
            await forRemoteExec(`document.getElementsByClassName("__brackets-ld-highlight")[0].style.width`, (result)=>{
                return originalWidth === result;
            });

            await endPreviewSession();
        }, 30000);

        it("should reverse highlight on clicking on live preview", async function () {
            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["simple1.html"]),
                "SpecRunnerUtils.openProjectFiles simple1.html");

            await waitsForLiveDevelopmentToOpen();
            let editor = EditorManager.getActiveEditor();

            await awaits(500);
            await forRemoteExec(`document.getElementsByClassName("__brackets-ld-highlight").length`, (result)=>{
                return result === 0;
            });
            await forRemoteExec(`document.getElementById("testId2").click()`);

            await awaits(500);
            await forRemoteExec(`document.getElementsByClassName("__brackets-ld-highlight").length`, (result)=>{
                return result === 1;
            });
            await forRemoteExec(`document.getElementsByClassName("__brackets-ld-highlight")[0].trackingElement.id`,
                (result)=>{
                    return result === 'testId2';
                });
            expect(editor.getCursorPos()).toEql({ line: 12, ch: 0, sticky: null });

            await endPreviewSession();
        }, 30000);

        it("should reverse highlight open previewed html file if not open on clicking live preview", async function () {
            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["simple1.html"]),
                "SpecRunnerUtils.openProjectFiles simple1.html");

            await waitsForLiveDevelopmentToOpen();

            await awaits(1000);
            await forRemoteExec(`document.getElementsByClassName("__brackets-ld-highlight").length`, (result)=>{
                return result === 0;
            });

            await awaitsForDone(CommandManager.execute(Commands.FILE_CLOSE_ALL, { _forceClose: true }),
                "closing all file");

            await forRemoteExec(`document.getElementById("testId2").click()`);

            await awaits(1000);
            // The live previewed file should now be opened in the editor
            let editor = EditorManager.getActiveEditor();
            expect(editor.document.file.fullPath.endsWith("simple1.html")).toBeTrue();

            // live highlights should still work
            await forRemoteExec(`document.getElementById("testId").click()`);
            await awaits(1000);

            await forRemoteExec(`document.getElementsByClassName("__brackets-ld-highlight").length`, (result)=>{
                return result === 1;
            });
            await forRemoteExec(`document.getElementsByClassName("__brackets-ld-highlight")[0].trackingElement.id`,
                (result)=>{
                    return result === 'testId';
                });
            expect(editor.getCursorPos()).toEql({ line: 11, ch: 0, sticky: null });

            await endPreviewSession();
        }, 30000);

        it("should reverse highlight be disabled if live highlight is disabled", async function () {
            await _enableLiveHighlights(false);
            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["simple1.html"]),
                "SpecRunnerUtils.openProjectFiles simple1.html");

            await waitsForLiveDevelopmentToOpen();
            let editor = EditorManager.getActiveEditor();
            editor && editor.setCursorPos({ line: 0, ch: 0 });

            await awaits(500);
            await forRemoteExec(`document.getElementsByClassName("__brackets-ld-highlight").length`, (result)=>{
                return result === 0;
            });
            await forRemoteExec(`document.getElementById("testId2").click()`);

            await awaits(500);
            expect(editor.getCursorPos()).toEql({ line: 0, ch: 0, sticky: null });

            await _enableLiveHighlights(true);
            await endPreviewSession();
        }, 30000);

        it("should ctrl-s to save page be disabled inside live preview iframes", async function () {
            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["simple1.html"]),
                "SpecRunnerUtils.openProjectFiles simple1.html");

            await waitsForLiveDevelopmentToOpen();
            await _editFileAndVerifyLivePreview("simple1.html", {line: 11, ch: 45}, 'hello world ',
                "testId", "Brackets is hello world awesome!");
            await forRemoteExec(`document.savePageCtrlSDisabledByPhoenix`, (result)=>{
                return result === true;
            });

            // todo: currently we do not have mechanism to exec code image and markdown previews. enable in future.
            // await awaitsForDone(SpecRunnerUtils.openProjectFiles(["readme.md"]),
            //     "readme.md", 1000);
            // await awaits(300);
            // iFrame = testWindow.document.getElementById("panel-live-preview-frame");
            // expect(iFrame.src.endsWith("readme.md")).toBeTrue();
            // expect(iFrame.contentDocument.savePageCtrlSDisabledByPhoenix).toBeTrue();
            //
            // await awaitsForDone(SpecRunnerUtils.openProjectFiles(["sub/icon_chevron.png"]),
            //     "icon_chevron.png", 1000);
            // await awaits(300);
            // iFrame = testWindow.document.getElementById("panel-live-preview-frame");
            // expect(iFrame.src.endsWith("sub/icon_chevron.png")).toBeTrue();
            // expect(iFrame.contentDocument.savePageCtrlSDisabledByPhoenix).toBeTrue();

            await endPreviewSession();
        }, 30000);

        it("should beautify and undo not corrupt live preview", async function () {
            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["simple1.html"]),
                "SpecRunnerUtils.openProjectFiles simple1.html");

            await waitsForLiveDevelopmentToOpen();
            await _editFileAndVerifyLivePreview("simple1.html", {line: 11, ch: 45}, 'hello world ',
                "testId", "Brackets is hello world awesome!");

            let editor = EditorManager.getActiveEditor();
            await BeautificationManager.beautifyEditor(editor);
            await _editFileAndVerifyLivePreview("simple1.html", {line: 11, ch: 73}, 'yo',
                "testId", "Brackets is hello world awesome!yo");

            await awaitsForDone(CommandManager.execute(Commands.EDIT_UNDO), "undo");
            await awaitsForDone(CommandManager.execute(Commands.EDIT_UNDO), "undo");
            await awaitsForDone(CommandManager.execute(Commands.EDIT_UNDO), "undo");

            await _editFileAndVerifyLivePreview("simple1.html", {line: 11, ch: 45}, 'hello world ',
                "testId", "Brackets is hello world awesome!");

            await endPreviewSession();
        }, 30000);

        it("should live preview not be able to access a non project file", async function () {
            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["exploit1.html"]),
                "SpecRunnerUtils.openProjectFiles exploit1.html");

            await waitsForLiveDevelopmentToOpen();
            await forRemoteExec(`document.responseStatus`, (result)=>{
                return result === 404;
            });

            await endPreviewSession();
        }, 30000);

        it("should live preview rememberScrollPositions", async function () {
            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["longPage.html"]),
                "SpecRunnerUtils.openProjectFiles longPage.html");

            await waitsForLiveDevelopmentToOpen();
            // scroll to middile of page element so that the scroll position is saved
            await forRemoteExec(`document.getElementById("midLine").scrollIntoView();`);
            let sessionStorageSavedScrollPos, savedWindowScrollY;
            await forRemoteExec(`window.scrollY`, (result)=>{
                savedWindowScrollY = result;
                return result && result !== 0;
            });
            await forRemoteExec(`sessionStorage.getItem("saved-scroll-" + location.href)`, (result)=>{
                sessionStorageSavedScrollPos = result;
                return !!result;
            });
            sessionStorageSavedScrollPos = JSON.parse(sessionStorageSavedScrollPos);
            expect(sessionStorageSavedScrollPos.scrollY).toBe(savedWindowScrollY);

            // now switch to a different page, its scroll position should not the saved scroll pos of last page
            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["simple1.html"]),
                "SpecRunnerUtils.openProjectFiles simple1.html");
            await waitsForLiveDevelopmentToOpen();
            await forRemoteExec(`window.scrollY`, (result)=>{
                return result !== savedWindowScrollY;
            });

            // now switch back to old page and verify if the scroll position was restored
            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["longPage.html"]),
                "SpecRunnerUtils.openProjectFiles longPage.html");
            await forRemoteExec(`window.scrollY`, (result)=>{
                return result === savedWindowScrollY;
            });

            await endPreviewSession();
        }, 30000);

        it("should pin live previews pin html file - 1", async function () {
            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["simple1.html"]),
                "SpecRunnerUtils.openProjectFiles simple1.html");

            await waitsForLiveDevelopmentToOpen();
            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["simple1.html"]),
                "SpecRunnerUtils.openProjectFiles simple1.html");

            await _waitForIframeSrc(`simple1.html`);

            let pinURLBtn = testWindow.$(testWindow.document.getElementById("pinURLButton"));
            pinURLBtn.click();

            await awaitsForDone(SpecRunnerUtils.openProjectFiles([SVG_IMAGE_PATH]),
                SVG_IMAGE_PATH);
            await awaits(500);
            let iFrame = testWindow.document.getElementById("panel-live-preview-frame");
            expect(iFrame.src.endsWith(`simple1.html`))
                .toBeTrue();

            pinURLBtn.click();

            await awaits(1000);
            iFrame = testWindow.document.getElementById("panel-live-preview-frame");
            let srcURL = new URL(iFrame.src);
            expect(srcURL.pathname.endsWith(SVG_IMAGE_PATH)).toBeTrue();

            await endPreviewSession();
        }, 30000);

        it("should pin live previews pin markdown file", async function () {
            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["simple1.html"]),
                "SpecRunnerUtils.openProjectFiles simple1.html");

            await waitsForLiveDevelopmentToOpen();
            await awaitsForDone(SpecRunnerUtils.openProjectFiles([`readme.md`]),
                "SpecRunnerUtils.openProjectFiles simple1.html");

            await _waitForIframeSrc(`readme.md`);
            let pinURLBtn = testWindow.$(testWindow.document.getElementById("pinURLButton"));
            pinURLBtn.click();

            await awaitsForDone(SpecRunnerUtils.openProjectFiles([SVG_IMAGE_PATH]),
                SVG_IMAGE_PATH);
            await awaits(500);
            await _waitForIframeSrc(`readme.md`);

            pinURLBtn.click();

            await _waitForIframeSrc(SVG_IMAGE_PATH);

            await endPreviewSession();
        }, 30000);

        it("should pin live previews pin svg image file", async function () {
            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["simple1.html"]),
                "SpecRunnerUtils.openProjectFiles simple1.html");

            await waitsForLiveDevelopmentToOpen();
            await awaitsForDone(SpecRunnerUtils.openProjectFiles([SVG_IMAGE_PATH]),
                "SpecRunnerUtils.openProjectFiles "+ SVG_IMAGE_PATH);

            await _waitForIframeSrc(SVG_IMAGE_PATH);
            let pinURLBtn = testWindow.$(testWindow.document.getElementById("pinURLButton"));
            pinURLBtn.click();

            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["simple1.html"]),
                "simple1.html");
            await awaits(500);
            await _waitForIframeSrc(SVG_IMAGE_PATH);

            pinURLBtn.click();

            await _waitForIframeSrc("simple1.html");

            await endPreviewSession();
        }, 30000);

        it("should pin live previews pin html file even on live preview panel open/hide", async function () {
            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["simple1.html"]),
                "SpecRunnerUtils.openProjectFiles simple1.html");

            await waitsForLiveDevelopmentToOpen();
            let iFrame = testWindow.document.getElementById("panel-live-preview-frame");
            expect(iFrame.src.endsWith(`simple1.html`))
                .toBeTrue();

            let pinURLBtn = testWindow.$(testWindow.document.getElementById("pinURLButton"));
            pinURLBtn.click();

            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["simple2.html"]),
                "simple2.html");
            await awaits(500);
            expect(iFrame.src.endsWith(`simple1.html`))
                .toBeTrue();

            // now close the live preview panel by clicking on live preview extension icon
            let livePreviewBtn = testWindow.$(testWindow.document.getElementById("toolbar-go-live"));
            livePreviewBtn.click();
            await awaits(500);
            livePreviewBtn.click();
            await awaits(500);
            expect(iFrame.src.endsWith(`simple1.html`))
                .toBeTrue();

            pinURLBtn.click();

            await awaits(1000);
            let outerIFrame = testWindow.document.getElementById("panel-live-preview-frame");
            let srcURL = new URL(outerIFrame.src);
            expect(srcURL.pathname.endsWith("simple2.html")).toBeTrue();

            await endPreviewSession();
        }, 30000);

        it("should unpin live previews on project switch", async function () {
            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["simple1.html"]),
                "SpecRunnerUtils.openProjectFiles simple1.html");

            await waitsForLiveDevelopmentToOpen();
            await window.Phoenix.VFS.ensureExistsDirAsync("/test/parked");
            await awaitsForDone(SpecRunnerUtils.openProjectFiles([SVG_IMAGE_PATH]),
                "SpecRunnerUtils.openProjectFiles"+SVG_IMAGE_PATH);

            await _waitForIframeSrc(SVG_IMAGE_PATH);
            let pinURLBtn = testWindow.$(testWindow.document.getElementById("pinURLButton"));
            pinURLBtn.click();

            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["simple1.html"]),
                "simple1.html");
            await awaits(500);
            await _waitForIframeSrc(SVG_IMAGE_PATH);

            await SpecRunnerUtils.loadProjectInTestWindow("/test/parked");
            await awaits(500);
            await SpecRunnerUtils.loadProjectInTestWindow(testFolder);
            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["simple1.html"]),
                "simple1.html");
            await waitsForLiveDevelopmentToOpen();

            await _waitForIframeSrc("simple1.html");

            await endPreviewSession();
        }, 30000);

    });
});
