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

/*global describe, beforeAll, afterAll, awaitsFor, it, awaitsForDone, expect, awaits, jsPromise*/

define(function (require, exports, module) {


    const SpecRunnerUtils = require("spec/SpecRunnerUtils"),
        KeyEvent                = require("utils/KeyEvent"),
        StringUtils      = require("utils/StringUtils");

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
            MainViewManager,
            WorkspaceManager,
            PreferencesManager,
            Dialogs,
            NativeApp;

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

        let savedNativeAppOpener;
        beforeAll(async function () {
            // Create a new window that will be shared by ALL tests in this spec.
            if (!testWindow) {
                // we have to popout a new window and cant use the embedded iframe for live preview integ tests
                // as Firefox sandbox prevents service worker access from nexted iframes.
                // In tauri, we use node server, so this limitation doesn't apply in tauri, and we stick to iframes.
                const useWindowInsteadOfIframe = (Phoenix.browser.desktop.isFirefox && !window.__TAURI__);
                testWindow = await SpecRunnerUtils.createTestWindowAndRun({
                    forceReload: false, useWindowInsteadOfIframe});
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
                NativeApp       = brackets.test.NativeApp;
                Dialogs       = brackets.test.Dialogs;
                MainViewManager       = brackets.test.MainViewManager;
                savedNativeAppOpener = NativeApp.openURLInDefaultBrowser;

                await SpecRunnerUtils.loadProjectInTestWindow(testFolder);
                await SpecRunnerUtils.deletePathAsync(testFolder+"/.phcode.json", true);
                if(!WorkspaceManager.isPanelVisible('live-preview-panel')){
                    await awaitsForDone(CommandManager.execute(Commands.FILE_LIVE_FILE_PREVIEW));
                }
            }
        }, 30000);

        afterAll(async function () {
            NativeApp.openURLInDefaultBrowser = savedNativeAppOpener;
            // we dont await SpecRunnerUtils.closeTestWindow(); here as tests fail eraticaly if we do this in intel macs
            testWindow = null;
            brackets = null;
            LiveDevMultiBrowser = null;
            CommandManager      = null;
            Commands            = null;
            EditorManager       = null;
            MainViewManager = null;
            savedNativeAppOpener = null;
            Dialogs = null;
            NativeApp = null;
            PreferencesManager = null;
            BeautificationManager = null;
            DocumentManager = null;
            WorkspaceManager = null;
        }, 30000);

        async function _enableLiveHighlights(enable) {
            PreferencesManager.setViewState("livedevHighlight", enable);
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
                    return (Object.getOwnPropertyNames(liveDoc.getRelated().scripts).length > 0) &&
                        liveDoc.isRelated(testFolder + "/import1.css");
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

        it("should render partial arabic html with correct utf-8 encoding", async function () {
            // https://github.com/orgs/phcode-dev/discussions/1676
            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["arabicPartial.html"]),
                "SpecRunnerUtils.openProjectFiles arabicPartial.html");
            await waitsForLiveDevelopmentToOpen();

            let result;
            await awaitsFor(
                function isArabicTextProperlyRendered() {
                    LiveDevProtocol.evaluate(`document.getElementById('arabic-text').textContent`)
                        .done((response)=>{
                            result = JSON.parse(response.result||"");
                        });
                    return result === " 1 يناير 2021 بواسطة ";
                },
                `arabic text to be read correctly`,
                5000,
                50
            );
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
                `relatedDocuments.done.received verifying ${verifyID} to have ${verifyText}`,
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

        async function _openCodeHints(cursor, expectedSomeHintsArray) {
            let editor = EditorManager.getActiveEditor();
            editor.setCursorPos(cursor);

            await awaitsForDone(CommandManager.execute(Commands.SHOW_CODE_HINTS),
                "show code hints");

            await awaitsFor(function () {
                return testWindow.$(".codehint-menu").is(":visible");
            }, "codehints to be shown");

            await awaitsFor(function () {
                for(let hint of expectedSomeHintsArray){
                    if(!testWindow.$(".codehint-menu").text().includes(hint)){
                        return false;
                    }
                }
                return true;
            }, "expected hints to be there");
        }
        
        async function _waitForLivePreviewElementColor(elementID, color) {
            let result;
            await awaitsFor(
                async function isColorChanged() {
                    const response = await LiveDevProtocol.evaluate(
                        `window.getComputedStyle(document.getElementById('${elementID}')).color`);
                    result = JSON.parse(response.result||"");
                    return result === color;
                },
                `element #${elementID} to color ${color}`,
                5000,
                50
            );
        }

        async function _livePreviewCodeHintsHTML() {
            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["inline-style.html"]),
                "SpecRunnerUtils.openProjectFiles inline-style.html");

            await waitsForLiveDevelopmentToOpen();
            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["inline-style.html"]),
                "inline-style.html");

            await awaitsFor(()=> LiveDevMultiBrowser.status === LiveDevMultiBrowser.STATUS_ACTIVE,
                "status active");

            await _openCodeHints({line: 9, ch: 18}, ["red"]);

            let editor = EditorManager.getActiveEditor();
            const initialHistoryLength = editor.getHistory().done.length;
            SpecRunnerUtils.simulateKeyEvent(KeyEvent.DOM_VK_DOWN, "keydown", testWindow.document.body);
            await awaitsFor(function () {
                return editor.getSelectedText() === "indianred";
            }, "expected live hints to update selection to indianred");
            await _waitForLivePreviewElementColor("testId2", "rgb(205, 92, 92)"); // indian red
            SpecRunnerUtils.simulateKeyEvent(KeyEvent.DOM_VK_DOWN, "keydown", testWindow.document.body);
            await awaitsFor(function () {
                return editor.getSelectedText() === "mediumvioletred";
            }, "expected live hints to update selection to mediumvioletred");
            await _waitForLivePreviewElementColor("testId2", "rgb(199, 21, 133)");
            return initialHistoryLength;
        }

        it("should Live preview push css code hints selection changes to browser(inline html)", async function () {
            const expectedHistoryLength = await _livePreviewCodeHintsHTML();
            let editor = EditorManager.getActiveEditor();

            // now dismiss with escape
            SpecRunnerUtils.simulateKeyEvent(KeyEvent.DOM_VK_ESCAPE, "keydown", testWindow.document.body);
            await awaitsFor(function () {
                return !testWindow.$(".codehint-menu").is(":visible");
            }, "codehints to be hidden");
            await awaitsFor(function () {
                return editor.getSelectedText() === "";
            }, "to restore the text to old state");
            expect(editor.getToken().string).toBe("red");

            // the undo history should be same as when we started
            expect(editor.getHistory().done.length).toBe(expectedHistoryLength);
            await endPreviewSession();
        }, 30000);

        it("should Live preview push css code hints selection changes to browser and commit(inline html)", async function () {
            const expectedHistoryLength = await _livePreviewCodeHintsHTML();
            let editor = EditorManager.getActiveEditor();

            // commit with enter key
            SpecRunnerUtils.simulateKeyEvent(KeyEvent.DOM_VK_RETURN, "keydown", testWindow.document.body);
            await awaitsFor(function () {
                return !testWindow.$(".codehint-menu").is(":visible");
            }, "codehints to be hidden");
            await awaitsFor(function () {
                return editor.getSelectedText() === "";
            }, "to restore the text to old state");
            // check if we have the new value
            expect(editor.getToken().string).toBe("mediumvioletred");

            // the undo history should be just one above
            expect(editor.getHistory().done.length).toBe(expectedHistoryLength +3);
            await endPreviewSession();
        }, 30000);

        async function _livePreviewCodeHintsCSS() {
            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["inline-style.html"]),
                "SpecRunnerUtils.openProjectFiles inline-style.html");

            await waitsForLiveDevelopmentToOpen();

            await awaitsFor(()=> LiveDevMultiBrowser.status === LiveDevMultiBrowser.STATUS_ACTIVE,
                "status active");

            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["simple1.css"]),
                "simple1.css");

            await _openCodeHints({line: 3, ch: 8}, ["antiquewhite"]);

            let editor = EditorManager.getActiveEditor();
            const initialHistoryLength = editor.getHistory().done.length;
            SpecRunnerUtils.simulateKeyEvent(KeyEvent.DOM_VK_DOWN, "keydown", testWindow.document.body);
            await awaitsFor(function () {
                return editor.getSelectedText() === "antiquewhite";
            }, "expected live hints to update selection to antiquewhite");
            await _waitForLivePreviewElementColor("testId", "rgb(250, 235, 215)"); // antiquewhite
            SpecRunnerUtils.simulateKeyEvent(KeyEvent.DOM_VK_DOWN, "keydown", testWindow.document.body);
            await awaitsFor(function () {
                return editor.getSelectedText() === "aqua";
            }, "expected live hints to update selection to aqua");
            await _waitForLivePreviewElementColor("testId", "rgb(0, 255, 255)"); //aqua
            return initialHistoryLength;
        }

        it("should Live preview push css code hints selection changes to browser(linked css)", async function () {
            const expectedHistoryLength = await _livePreviewCodeHintsCSS();
            let editor = EditorManager.getActiveEditor();

            // now dismiss with escape
            SpecRunnerUtils.simulateKeyEvent(KeyEvent.DOM_VK_ESCAPE, "keydown", testWindow.document.body);
            await awaitsFor(function () {
                return !testWindow.$(".codehint-menu").is(":visible");
            }, "codehints to be hidden");
            await awaitsFor(function () {
                return editor.getSelectedText() === "";
            }, "to restore the text to old state");
            expect(editor.getToken().string).toBe(" ");

            // the undo history should be same as when we started
            expect(editor.getHistory().done.length).toBe(expectedHistoryLength);
            await endPreviewSession();
        }, 30000);

        it("should Live preview push css code hints selection changes to browser and commit(linked css)", async function () {
            const expectedHistoryLength = await _livePreviewCodeHintsCSS();
            let editor = EditorManager.getActiveEditor();

            // now dismiss with escape
            SpecRunnerUtils.simulateKeyEvent(KeyEvent.DOM_VK_RETURN, "keydown", testWindow.document.body);
            await awaitsFor(function () {
                return !testWindow.$(".codehint-menu").is(":visible");
            }, "codehints to be hidden");
            await awaitsFor(function () {
                return editor.getSelectedText() === "";
            }, "to restore the text to old state");
            // check if we have the new value
            expect(editor.getToken().string).toBe("aqua");

            // the undo history should be just one above
            expect(editor.getHistory().done.length).toBe(expectedHistoryLength +3);
            await endPreviewSession();
        }, 30000);

        async function _waitForLivePreviewElementClass(elementID, classExpected) {
            let result;
            await awaitsFor(
                async function isColorChanged() {
                    const response = await LiveDevProtocol.evaluate(
                        `document.getElementById('${elementID}').classList.contains('${classExpected}')`);
                    result = JSON.parse(response.result||"");
                    return result === true;
                },
                `element #${elementID} to have class ${classExpected}`,
                5000,
                50
            );
        }

        async function _livePreviewCodeHintsHTMLCSSClass(onlyOnce, position = {line: 15, ch: 24}) {
            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["inline-style.html"]),
                "SpecRunnerUtils.openProjectFiles inline-style.html");

            await waitsForLiveDevelopmentToOpen();

            await awaitsFor(()=> LiveDevMultiBrowser.status === LiveDevMultiBrowser.STATUS_ACTIVE,
                "status active");

            await _openCodeHints(position, ["testClass2", "testClass"]);

            let editor = EditorManager.getActiveEditor();
            const initialHistoryLength = editor.getHistory().done.length;
            const $ = testWindow.$;
            let initialSelectedCodeHint = $($(".code-hints-list-item .highlight .brackets-html-hints")).text();
            SpecRunnerUtils.simulateKeyEvent(KeyEvent.DOM_VK_DOWN, "keydown", testWindow.document.body);
            await awaitsFor(function () {
                let newSelectedCodeHint = $($(".code-hints-list-item .highlight .brackets-html-hints")).text();
                return newSelectedCodeHint !== initialSelectedCodeHint &&
                    editor.getSelectedText() === newSelectedCodeHint;
            }, "expected live hints to update selection to next code hint");
            let newSelectedCodeHint = $($(".code-hints-list-item .highlight .brackets-html-hints")).text();
            await _waitForLivePreviewElementClass("testId", newSelectedCodeHint);
            if(onlyOnce){
                return initialHistoryLength;
            }
            SpecRunnerUtils.simulateKeyEvent(KeyEvent.DOM_VK_DOWN, "keydown", testWindow.document.body);
            await awaitsFor(function () {
                let newSelectedCodeHint2 = $($(".code-hints-list-item .highlight .brackets-html-hints")).text();
                return newSelectedCodeHint !== newSelectedCodeHint2 &&
                    editor.getSelectedText() === newSelectedCodeHint2;
            }, "expected live hints to update selection");
            let newSelectedCodeHint2 = $($(".code-hints-list-item .highlight .brackets-html-hints")).text();
            await _waitForLivePreviewElementClass("testId", newSelectedCodeHint2);
            return initialHistoryLength;
        }

        async function _testAtPos(pos, endKey = KeyEvent.DOM_VK_ESCAPE, onlyOnce = false,
            additionalHistoryLengthExpected = 0) {
            const expectedHistoryLength = await _livePreviewCodeHintsHTMLCSSClass(onlyOnce, pos);
            let editor = EditorManager.getActiveEditor();

            // now dismiss with escape
            const $ = testWindow.$;
            let selectedCodeHint = $($(".code-hints-list-item .highlight .brackets-html-hints")).text();
            expect(selectedCodeHint).toBeDefined();
            SpecRunnerUtils.simulateKeyEvent(endKey, "keydown", testWindow.document.body);
            await awaitsFor(function () {
                return !testWindow.$(".codehint-menu").is(":visible");
            }, "codehints to be hidden");
            await awaitsFor(function () {
                return editor.getSelectedText() === "";
            }, "to restore the text to old state");

            // the undo history should be what we expect
            expect(editor.getHistory().done.length).toBe(expectedHistoryLength + additionalHistoryLengthExpected);
            return selectedCodeHint;
        }

        it("should Live preview push html css class code hints selection changes to browser", async function () {
            //<p id="testId" class="t<cursor>estClass ">Brackets is awesome!</p>
            await _testAtPos({line: 15, ch: 24});
            let editor = EditorManager.getActiveEditor();
            expect(editor.getToken().string).toBe('"testClass "');
            await endPreviewSession();
        }, 30000);

        it("should Live preview push html css class code hints on empty input selection changes to browser", async function () {
            //<p id="testId" class="testClass <cursor>">Brackets is awesome!</p>
            await _testAtPos({line: 15, ch: 32});
            let editor = EditorManager.getActiveEditor();
            expect(editor.getToken().string).toBe('"testClass "');
            await endPreviewSession();
        }, 30000);

        it("should Live preview push html css class code hints selection changes to browser and commit", async function () {
            //<p id="testId" class="t<cursor>estClass ">Brackets is awesome!</p>
            await _testAtPos({line: 15, ch: 24}, KeyEvent.DOM_VK_RETURN, true, 3);
            let editor = EditorManager.getActiveEditor();
            expect(editor.getToken().string).toBe('"testClass2 "');
            await endPreviewSession();
        }, 30000);

        it("should Live preview push html css class code hints on empty input selection changes to browser and commit", async function () {
            //<p id="testId" class="testClass <cursor>">Brackets is awesome!</p>
            const selectedHint = await _testAtPos({line: 15, ch: 32},  KeyEvent.DOM_VK_RETURN, true, 2);
            let editor = EditorManager.getActiveEditor();
            expect(editor.getToken().string).toBe(`"testClass ${selectedHint}"`);
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

        async function openPreviewAndClickTextInputsInPreview() {
            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["hyperlink.html"]),
                "SpecRunnerUtils.openProjectFiles simple1.html");

            await waitsForLiveDevelopmentToOpen();

            let iFrame = testWindow.document.getElementById("panel-live-preview-frame");
            expect(iFrame.src.endsWith("hyperlink.html")).toBeTrue();
            iFrame.focus(); // live preview has focus but it can take html focus, the live preview has to
            // delegate focus to editor explicitly in case of html files.
            expect(testWindow.document.activeElement).toEqual(iFrame);
            // for html, it can take focus, but clicking on any text elemnt will focus file preview
            await forRemoteExec(`document.getElementById("textArea").click()`);
            await awaits(300);
            expect(testWindow.document.activeElement).toEqual(iFrame);
            await forRemoteExec(`document.getElementById("inputText").click()`);
            await awaits(300);
            expect(testWindow.document.activeElement).toEqual(iFrame);
        }

        it("focus test: should html live previews take focus from editor on text filed click in live preview", async function () {
            // this test may fail if the test window doesn't have focus
            await openPreviewAndClickTextInputsInPreview();
            await endPreviewSession();
        }, 30000);

        async function triggerEscapeKeyEvent() {
            // Create a new KeyboardEvent
            const jsExec= `document.getElementById("inputText").dispatchEvent(new KeyboardEvent("keydown", {
                key: "Escape",
                keyCode: 27, // keyCode for Escape key
                code: "Escape",
                which: 27,
                bubbles: true, // Event bubbles up through the DOM
                cancelable: true // Event can be canceled
            }))`;
            await forRemoteExec(jsExec);
        }

        it("focus test: should pressing escape key on live preview focued input focus editor", async function () {
            // this test may fail if the test window doesn't have focus
            await openPreviewAndClickTextInputsInPreview();
            await triggerEscapeKeyEvent();

            // Editor will gain focus on escape key press
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

            // now make the active editor loose focus and click on the markdown md for it to
            // trigger focus.
            await awaits(300);
            let outerIFrame = testWindow.document.getElementById("panel-live-preview-frame");
            expect(outerIFrame.src.endsWith("readme.md")).toBeTrue();
            outerIFrame.focus();
            expect(testWindow.document.activeElement).toEqual(outerIFrame);
            outerIFrame.contentWindow.postMessage({
                type: "_TEST_FOCUS_CLICK",
                isTauri: Phoenix.isNativeApp
            }, "*"); // this is not sensitive info, and is only dispatched if requested by the iframe

            // Editor lost focus, it will gain back on click on markdown live preview
            await awaits(500);

            const activeElement = testWindow.document.activeElement;
            const editorHolder = testWindow.document.getElementById("editor-holder");
            expect(editorHolder.contains(activeElement)).toBeTrue();

            await endPreviewSession();
        }, 30000);

        it("focus test: should markdown previews take focus from editor if there is selection", async function () {
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

            // now make the active editor loose focus and click on the markdown md for it to
            // trigger focus.
            await awaits(300);
            let outerIFrame = testWindow.document.getElementById("panel-live-preview-frame");
            expect(outerIFrame.src.endsWith("readme.md")).toBeTrue();
            outerIFrame.focus();
            expect(testWindow.document.activeElement).toEqual(outerIFrame);
            // now select some /all text in the markdown and click
            outerIFrame.contentWindow.postMessage({
                type: "_TEST_SELECT_TEXT_AND_CLICK",
                isTauri: Phoenix.isNativeApp
            }, "*");

            // Editor lost focus,  it should not gain focus as there is an active selection in the markdown
            await awaits(200);
            expect(testWindow.document.activeElement).toEqual(outerIFrame);

            // now clear all selections in the markdown and click
            outerIFrame.contentWindow.postMessage({
                type: "_TEST_UNSELECT_TEXT_AND_CLICK",
                isTauri: Phoenix.isNativeApp
            }, "*");

            // Editor lost focus,  it should not gain focus as there is an active selection in the markdown
            await awaits(400);

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

        it("should embedded html live previews be able to open urls in external browser for a target=_blank", async function () {
            // test is only for tauri. In browser, browser handles the anchor tags
            if(!Phoenix.isNativeApp) {
                return;
            }
            let openURLRequested;
            NativeApp.openURLInDefaultBrowser = function (_url) {
                openURLRequested = _url;
            };
            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["hyperlink.html"]),
                "SpecRunnerUtils.openProjectFiles hyperlink.html");

            await waitsForLiveDevelopmentToOpen();

            let iFrame = testWindow.document.getElementById("panel-live-preview-frame");
            expect(iFrame.src.endsWith("hyperlink.html")).toBeTrue();

            await forRemoteExec(`document.getElementById("externalLink").click()`);
            await awaitsFor(function () { return openURLRequested; }, "https://google.com/ open", 2000);
            expect(openURLRequested).toEqual("https://google.com");

            openURLRequested = null;
            await forRemoteExec(`document.getElementById("relativeLink").click()`);
            await awaitsFor(function () { return openURLRequested; }, "simple1.html relative url to open", 2000);
            expect(openURLRequested.startsWith("http://localhost:")).toBeTrue();
            expect(openURLRequested.endsWith("/simple1.html")).toBeTrue();

            await endPreviewSession();
        }, 30000);

        it("should opening 4 target=_blank urls consecutively engage confirm dialog", async function () {
            async function waitForDialog() {
                var $dlg;
                await awaitsFor(function () {
                    $dlg = testWindow.$(".modal.instance");
                    return $dlg.length > 0;
                },  "dialog to appear");
            }
            // test is only for tauri. In browser, browser handles the anchor tags
            if(!Phoenix.isNativeApp) {
                return;
            }
            let openURLRequested;
            NativeApp.openURLInDefaultBrowser = function (_url) {
                openURLRequested = _url;
            };
            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["hyperlink.html"]),
                "SpecRunnerUtils.openProjectFiles hyperlink.html");

            await waitsForLiveDevelopmentToOpen();

            let iFrame = testWindow.document.getElementById("panel-live-preview-frame");
            expect(iFrame.src.endsWith("hyperlink.html")).toBeTrue();

            for(let i=0;i<4;i++){
                await forRemoteExec(`document.getElementById("externalLink").click()`);
            }
            await awaitsFor(function () { return openURLRequested; }, "https://google.com/ open", 2000);
            expect(openURLRequested).toEqual("https://google.com");
            await waitForDialog();

            // now click on the links a lotta time, no url should be opened
            openURLRequested = null;
            for(let i=0;i<40;i++){
                await forRemoteExec(`document.getElementById("externalLink").click()`);
            }
            await awaits(300);
            expect(openURLRequested).toEqual(null);

            openURLRequested = null;
            await SpecRunnerUtils.clickDialogButton(Dialogs.DIALOG_BTN_OK);
            expect(openURLRequested).toEqual("https://google.com");

            // after accepting the dialog, new urls should open.
            openURLRequested = null;
            await forRemoteExec(`document.getElementById("externalLink").click()`);
            await awaitsFor(function () { return openURLRequested; }, "https://google.com/ open", 2000);

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
            if(!Phoenix.isNativeApp) {
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
                function () {
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
            return result;
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

        async function _forSelection(id, editor, cursor) {
            await awaitsFor(()=>{
                const cursorPos = editor.getCursorPos();
                return cursorPos && cursorPos.line === cursor.line && cursorPos.ch === cursor.ch;
            }, "waiting for editor reverse selection on "+ id);
        }

        async function _verifyCssReverseHighlight(fileName) {
            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["cssLivePreview.html"]),
                "SpecRunnerUtils.openProjectFiles cssLivePreview.html");

            await waitsForLiveDevelopmentToOpen();
            await awaits(500);

            // now open the css file
            await awaitsForDone(SpecRunnerUtils.openProjectFiles([fileName]),
                `SpecRunnerUtils.openProjectFiles ${fileName}`);

            let editor = EditorManager.getActiveEditor();
            expect(editor.document.file.name).toBe(fileName);

            await forRemoteExec(`document.getElementById("testId").click()`);
            editor = EditorManager.getActiveEditor();
            expect(editor.document.file.name).toBe(fileName);
            await _forSelection("#testId", editor, { line: 6, ch: 0, sticky: null });
            await forRemoteExec(`document.getElementById("testId2").click()`);
            editor = EditorManager.getActiveEditor();
            expect(editor.document.file.name).toBe(fileName);
            await _forSelection("#testId2", editor, { line: 9, ch: 0, sticky: null });
            await forRemoteExec(`document.getElementsByTagName("span")[0].click()`);
            editor = EditorManager.getActiveEditor();
            expect(editor.document.file.name).toBe(fileName);
            await _forSelection("span", editor, { line: 11, ch: 0, sticky: null });
            await forRemoteExec(`document.getElementsByClassName("notInCss")[0].click()`);
            editor = EditorManager.getActiveEditor();
            expect(editor.document.file.name).toBe(fileName);
            await _forSelection("span", editor, { line: 2, ch: 0, sticky: null });

            await endPreviewSession();
        }

        it("should reverse highlight on related CSS on clicking live preview", async function () {
            await _verifyCssReverseHighlight("cssLive.css");
        }, 30000);

        it("should reverse highlight on unrelated less on clicking live preview", async function () {
            // for less files we dont do the related file check as its is not usually directly linked into the css DOM.
            await _verifyCssReverseHighlight("cssLive1.less");
        }, 30000);

        it("should reverse highlight on unrelated scss on clicking live preview", async function () {
            // for scss files we dont do the related file check as its is not usually directly linked into the css DOM.
            await _verifyCssReverseHighlight("cssLive1.scss");
        }, 30000);

        it("should reverse highlight on unrelated sass on clicking live preview", async function () {
            // for sass files we dont do the related file check as its is not usually directly linked into the css DOM.
            await _verifyCssReverseHighlight("cssLive1.sass");
        }, 30000);

        it("should open document on clicking on html live preview if no file is present", async function () {
            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["cssLivePreview.html"]),
                "SpecRunnerUtils.openProjectFiles cssLivePreview.html");

            await waitsForLiveDevelopmentToOpen();

            await awaitsForDone(CommandManager.execute(Commands.FILE_CLOSE_ALL, { _forceClose: true }),
                "closing all file");

            await forRemoteExec(`document.getElementById("testId").click()`);
            await awaitsFor(()=>{
                return !!EditorManager.getActiveEditor();
            }, "Editor to be opened");
            let editor = EditorManager.getActiveEditor();
            expect(editor.document.file.name).toBe("cssLivePreview.html");
            await endPreviewSession();
        }, 30000);

        it("should not open document on clicking live preview if related file is present and html not present", async function () {
            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["cssLivePreview.html"]),
                "SpecRunnerUtils.openProjectFiles cssLivePreview.html");

            await waitsForLiveDevelopmentToOpen();

            await awaitsForDone(CommandManager.execute(Commands.FILE_CLOSE_ALL, { _forceClose: true }),
                "closing all file");
            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["cssLive.css"]),
                "SpecRunnerUtils.openProjectFiles cssLive.css");

            await forRemoteExec(`document.getElementById("testId").click()`);
            await awaits(100); // just wait for some time to verify html file is not opened
            let editor = EditorManager.getActiveEditor();
            expect(editor.document.file.name).toBe("cssLive.css");
            await endPreviewSession();
        }, 30000);

        it("should not focus html on clicking live preview if related css is open in split pane", async function () {
            MainViewManager.setLayoutScheme(1, 2);
            MainViewManager.setActivePaneId(MainViewManager.FIRST_PANE);
            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["cssLivePreview.html"], MainViewManager.FIRST_PANE),
                "SpecRunnerUtils.openProjectFiles cssLivePreview.html");

            await waitsForLiveDevelopmentToOpen();

            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["cssLive.css"], MainViewManager.SECOND_PANE),
                "SpecRunnerUtils.openProjectFiles cssLive.css");

            MainViewManager.setActivePaneId(MainViewManager.SECOND_PANE);
            let editor = EditorManager.getActiveEditor();
            editor.setCursorPos(0, 0);
            await forRemoteExec(`document.getElementById("testId").click()`);
            await _forSelection("#testId", editor, { line: 6, ch: 0, sticky: null });
            editor = EditorManager.getActiveEditor();
            expect(editor.document.file.name).toBe("cssLive.css");

            MainViewManager.setActivePaneId(MainViewManager.FIRST_PANE);
            editor = EditorManager.getActiveEditor();
            editor.setCursorPos(0, 0);
            await forRemoteExec(`document.getElementById("testId2").click()`);
            await _forSelection("#testId", editor, { line: 13, ch: 4, sticky: null });
            editor = EditorManager.getActiveEditor();
            expect(editor.document.file.name).toBe("cssLivePreview.html");

            MainViewManager.setLayoutScheme(1, 1);
            await endPreviewSession();
        }, 30000);

        it("should open html in correct pane on clicking live preview in split pane", async function () {
            MainViewManager.setLayoutScheme(1, 2);
            MainViewManager.setActivePaneId(MainViewManager.FIRST_PANE);
            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["cssLivePreview.html"], MainViewManager.FIRST_PANE),
                "SpecRunnerUtils.openProjectFiles cssLivePreview.html");

            await waitsForLiveDevelopmentToOpen();

            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["simple1.css"], MainViewManager.SECOND_PANE),
                "SpecRunnerUtils.openProjectFiles simple1.css"); // non related file
            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["blank.css"], MainViewManager.FIRST_PANE),
                "SpecRunnerUtils.openProjectFiles blank.css");  // non related file

            // now the live preview page's editor is not visible in any panes, but is already open in first pane
            // so, on clicking live preview, it should open the file in first pane
            MainViewManager.setActivePaneId(MainViewManager.SECOND_PANE);

            await forRemoteExec(`document.getElementById("testId2").click()`);
            let editor = EditorManager.getActiveEditor();
            await awaitsFor(()=>{
                editor = EditorManager.getActiveEditor();
                return editor && editor.document.file.name === "cssLivePreview.html";
            }, "cssLivePreview.html to open as active editor");
            await _forSelection("#testId", editor, { line: 13, ch: 4, sticky: null });
            editor = EditorManager.getActiveEditor();
            expect(editor.document.file.name).toBe("cssLivePreview.html");
            expect(MainViewManager.getActivePaneId()).toBe(MainViewManager.FIRST_PANE);

            MainViewManager.setLayoutScheme(1, 1);
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

        async function _storeInRemotePreview(value) {
            await forRemoteExec(`window.remoteSetterTest = "${value}"`);
            await forRemoteExec(`window.remoteSetterTest`, (result)=>{
                return result === value;
            });
        }


        it("should Live preview reload if related JS file changes", async function () {
            const testTempDir = await SpecRunnerUtils.getTempTestDirectory("/spec/LiveDevelopment-MultiBrowser-test-files");
            await SpecRunnerUtils.loadProjectInTestWindow(testTempDir);

            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["simple1.html"]),
                "open simple1.html");

            await waitsForLiveDevelopmentToOpen();
            await _storeInRemotePreview("jsFileTest1");
            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["simple1.js"]),
                "open simple1.js");

            const jsChangedText = "Edited from js file for live preview js reload.";
            const code = `document.addEventListener('DOMContentLoaded', function() {
                document.getElementById('testId').textContent = '${jsChangedText}';});`;
            EditorManager.getActiveEditor().document.setText(code);
            await awaitsForDone(CommandManager.execute(Commands.FILE_SAVE_ALL), "FILE_SAVE_ALL");
            await forRemoteExec(`document.getElementById("testId").textContent`, (result)=>{
                return result === jsChangedText;
            });
            await endPreviewSession();
        }, 30000);

        it("should clicking reload button reload Live preview html file", async function () {
            const testTempDir = await SpecRunnerUtils.getTempTestDirectory("/spec/LiveDevelopment-MultiBrowser-test-files");
            await SpecRunnerUtils.loadProjectInTestWindow(testTempDir);

            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["simple1.html"]),
                "open simple1.html");

            await waitsForLiveDevelopmentToOpen();
            const storedValue = StringUtils.randomString(10, "htmlReload");
            await _storeInRemotePreview(storedValue);

            testWindow.$("#reloadLivePreviewButton").click();

            await forRemoteExec(`window.remoteSetterTest`, (result)=>{
                return result !== storedValue;
            });
            await endPreviewSession();
        }, 30000);

        it("should clicking reload button reload pinned Live preview html file", async function () {
            const testTempDir = await SpecRunnerUtils.getTempTestDirectory("/spec/LiveDevelopment-MultiBrowser-test-files");
            await SpecRunnerUtils.loadProjectInTestWindow(testTempDir);

            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["simple1.html"]),
                "open simple1.html");

            await waitsForLiveDevelopmentToOpen();
            const storedValue = StringUtils.randomString(10, "htmlReload");
            await _storeInRemotePreview(storedValue);

            testWindow.$("#pinURLButton").click();
            testWindow.$("#reloadLivePreviewButton").click();

            await forRemoteExec(`window.remoteSetterTest`, (result)=>{
                return result !== storedValue;
            });
            let iFrame = testWindow.document.getElementById("panel-live-preview-frame");
            expect(iFrame.src.endsWith(`simple1.html`))
                .toBeTrue();
            testWindow.$("#pinURLButton").click();
            await endPreviewSession();
        }, 30000);

        it("should clicking reload button while css file is open reload Live preview html file", async function () {
            const testTempDir = await SpecRunnerUtils.getTempTestDirectory("/spec/LiveDevelopment-MultiBrowser-test-files");
            await SpecRunnerUtils.loadProjectInTestWindow(testTempDir);

            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["simple1.html"]),
                "open simple1.html");

            await waitsForLiveDevelopmentToOpen();
            const storedValue = StringUtils.randomString(10, "htmlReload");
            await _storeInRemotePreview(storedValue);

            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["simple1.css"]),
                "SpecRunnerUtils.openProjectFiles simple1.css");

            testWindow.$("#reloadLivePreviewButton").click();

            await forRemoteExec(`window.remoteSetterTest`, (result)=>{
                return result !== storedValue;
            });
            let iFrame = testWindow.document.getElementById("panel-live-preview-frame");
            expect(iFrame.src.endsWith(`simple1.html`))
                .toBeTrue();
            await endPreviewSession();
        }, 30000);

        it("should clicking reload button while css file is open reload pinned Live preview html", async function () {
            const testTempDir = await SpecRunnerUtils.getTempTestDirectory("/spec/LiveDevelopment-MultiBrowser-test-files");
            await SpecRunnerUtils.loadProjectInTestWindow(testTempDir);

            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["simple1.html"]),
                "open simple1.html");

            await waitsForLiveDevelopmentToOpen();
            const storedValue = StringUtils.randomString(10, "htmlReload");
            await _storeInRemotePreview(storedValue);
            testWindow.$("#pinURLButton").click();

            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["simple1.css"]),
                "SpecRunnerUtils.openProjectFiles simple1.css");

            testWindow.$("#reloadLivePreviewButton").click();

            await forRemoteExec(`window.remoteSetterTest`, (result)=>{
                return result !== storedValue;
            });
            let iFrame = testWindow.document.getElementById("panel-live-preview-frame");
            expect(iFrame.src.endsWith(`simple1.html`))
                .toBeTrue();
            testWindow.$("#pinURLButton").click();
            await endPreviewSession();
        }, 30000);
    });
});
