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


    const SpecRunnerUtils = require("spec/SpecRunnerUtils");

    describe("livepreview:Custom Server Live Preview", function () {

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
            FileSystem,
            NativeApp;

        let testFolder = SpecRunnerUtils.getTestPath("/spec/LiveDevelopment-MultiBrowser-test-files");

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
                FileSystem       = brackets.test.FileSystem;
                savedNativeAppOpener = NativeApp.openURLInDefaultBrowser;

                await SpecRunnerUtils.loadProjectInTestWindow(testFolder);
                if(!WorkspaceManager.isPanelVisible('live-preview-panel')){
                    await awaitsForDone(CommandManager.execute(Commands.FILE_LIVE_FILE_PREVIEW));
                }
            }
        }, 30000);

        afterAll(async function () {
            LiveDevMultiBrowser.close();
            NativeApp.openURLInDefaultBrowser = savedNativeAppOpener;
            await SpecRunnerUtils.closeTestWindow();
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
            FileSystem       = null;
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

        it("should live preview settings work as expected", async function () {
            const testTempDir = await SpecRunnerUtils.getTempTestDirectory(
                "/spec/LiveDevelopment-MultiBrowser-test-files", true);
            await SpecRunnerUtils.loadProjectInTestWindow(testTempDir);
            await SpecRunnerUtils.deletePathAsync(testTempDir+"/.phcode.json", true);

            testWindow.$("#livePreviewSettingsBtn").click();
            await SpecRunnerUtils.waitForModalDialog();
            expect(testWindow.$("#enableCustomServerChk").is(":checked")).toBeFalse();
            expect(testWindow.$("#livePreviewServerURL").is(":disabled")).toBeTrue();
            expect(testWindow.$("#serveRoot").is(":visible")).toBeFalse();
            expect(testWindow.$("#frameworkSelect").is(":visible")).toBeFalse();
            expect(testWindow.$("#hotReloadChk").is(":visible")).toBeFalse();

            // now edit
            testWindow.$("#enableCustomServerChk").click();
            expect(testWindow.$("#livePreviewServerURL").is(":disabled")).toBeFalse();
            expect(testWindow.$("#serveRoot").is(":visible")).toBeFalse();
            expect(testWindow.$("#frameworkSelect").is(":visible")).toBeFalse();
            expect(testWindow.$("#hotReloadChk").is(":visible")).toBeFalse();

            // now type something
            testWindow.$("#livePreviewServerURL").val("http://localhost:8000");
            // Create and dispatch the input event
            const event = new Event('input', {
                bubbles: true,
                cancelable: true
            });

            testWindow.$("#livePreviewServerURL")[0].dispatchEvent(event);
            expect(testWindow.$("#serveRoot").is(":visible")).toBeTrue();
            expect(testWindow.$("#frameworkSelect").is(":visible")).toBeTrue();
            expect(testWindow.$("#hotReloadChk").is(":visible")).toBeTrue();
            expect(testWindow.$("#frameworkSelect").val()).toBe("unknown");

            // close-cancel dialog
            await SpecRunnerUtils.clickDialogButton(Dialogs.DIALOG_BTN_CANCEL);
            await SpecRunnerUtils.waitForNoModalDialog();
        }, 30000);

        async function _setupAndVerifyDocusaurusProject() {
            const testTempDir = await SpecRunnerUtils.getTempTestDirectory(
                "/spec/LiveDevelopment-MultiBrowser-test-files", true);
            await SpecRunnerUtils.loadProjectInTestWindow(testTempDir);
            await SpecRunnerUtils.deletePathAsync(testTempDir+"/.phcode.json", true);

            await jsPromise(SpecRunnerUtils.createTextFile(testTempDir+"/docusaurus.config.js", "{}", FileSystem));

            testWindow.$("#livePreviewSettingsBtn").click();
            await SpecRunnerUtils.waitForModalDialog();
            // now edit
            testWindow.$("#enableCustomServerChk").click();
            // now type something
            testWindow.$("#livePreviewServerURL").val("http://localhost:8000");
            // Create and dispatch the input event
            const event = new Event('input', {
                bubbles: true,
                cancelable: true
            });

            testWindow.$("#livePreviewServerURL")[0].dispatchEvent(event);
            expect(testWindow.$("#serveRoot").is(":visible")).toBeTrue();
            await awaitsFor(()=>{
                return testWindow.$("#frameworkSelect").val() === "Docusaurus";
            }, "docusaurus framework detection");
            expect(testWindow.$("#hotReloadChk").is(":checked")).toBeTrue();
            return testTempDir;
        }

        it("should live preview settings detect docusaurus framework", async function () {
            await _setupAndVerifyDocusaurusProject();

            // close-cancel dialog
            await SpecRunnerUtils.clickDialogButton(Dialogs.DIALOG_BTN_CANCEL);
            await SpecRunnerUtils.waitForNoModalDialog();
        }, 30000);

        it("should live preview settings save to phcode.json file in project", async function () {
            const testTempDir = await _setupAndVerifyDocusaurusProject();
            testWindow.$("#serveRoot").val("www/");

            // close dialog
            await SpecRunnerUtils.clickDialogButton(Dialogs.DIALOG_BTN_OK);
            await SpecRunnerUtils.waitForNoModalDialog();
            // wait for preferences file creation
            await SpecRunnerUtils.waitTillPathExists(testTempDir+"/.phcode.json");
            await awaitsFor(async()=>{
                const settingsJson = await SpecRunnerUtils.readTextFileAsync(testTempDir+"/.phcode.json");
                return Object.keys(JSON.parse(settingsJson)).length >= 5;
            }, "all settings to be written", 2000, 100);
            const settingsJson = JSON.parse(await SpecRunnerUtils.readTextFileAsync(testTempDir+"/.phcode.json"));
            expect(settingsJson).toEql({
                "livePreviewUseDevServer": true,
                "livePreviewServerURL": "http://localhost:8000",
                "livePreviewServerProjectPath": "www/",
                "livePreviewHotReloadSupported": true,
                "livePreviewFramework": "Docusaurus"
            });
        }, 30000);

        const PREFERENCE_PROJECT_SERVER_ENABLED = "livePreviewUseDevServer",
            PREFERENCE_PROJECT_SERVER_URL = "livePreviewServerURL",
            PREFERENCE_PROJECT_SERVER_PATH = "livePreviewServerProjectPath",
            PREFERENCE_PROJECT_SERVER_HOT_RELOAD_SUPPORTED = "livePreviewHotReloadSupported",
            PREFERENCE_PROJECT_PREVIEW_FRAMEWORK = "livePreviewFramework";
        async function _setupDocusaurusProject(sub="") {
            const testTempDir = await SpecRunnerUtils.getTempTestDirectory(
                "/spec/LiveDevelopment-MultiBrowser-test-files", true);
            await SpecRunnerUtils.deletePathAsync(testTempDir+"/.phcode.json", true);
            await SpecRunnerUtils.loadProjectInTestWindow(testTempDir);
            await jsPromise(SpecRunnerUtils.createTextFile(testTempDir+"/docusaurus.config.js", "{}", FileSystem));
            PreferencesManager.set(PREFERENCE_PROJECT_SERVER_ENABLED, true, PreferencesManager.PROJECT_SCOPE);
            PreferencesManager.set(PREFERENCE_PROJECT_SERVER_URL, "http://localhost:43768", PreferencesManager.PROJECT_SCOPE);
            PreferencesManager.set(PREFERENCE_PROJECT_SERVER_PATH, sub, PreferencesManager.PROJECT_SCOPE);
            PreferencesManager.set(PREFERENCE_PROJECT_PREVIEW_FRAMEWORK, "Docusaurus", PreferencesManager.PROJECT_SCOPE);
            PreferencesManager.set(PREFERENCE_PROJECT_SERVER_HOT_RELOAD_SUPPORTED, true, PreferencesManager.PROJECT_SCOPE);
            return testTempDir;
        }

        async function _waitForIframeURL(url) {
            await awaitsFor(()=>{
                let iFrame = testWindow.document.getElementById("panel-live-preview-frame");
                return iFrame.src === url;
            }, "external preview server "+ url);
        }

        async function _waitForlivePreviewPopout(url, path) {
            let openURLRequested;
            NativeApp.openURLInDefaultBrowser = function (_url) {
                openURLRequested = new URL(_url).searchParams.get("initialURL");
            };
            testWindow.$("#livePreviewPopoutButton").click();
            await awaitsFor(()=>{
                return openURLRequested.startsWith(url);
            }, "Correct live preview popout url "+url+":" + path||"");
            // now open back the live preview panel by clicking on live preview extension icon
            let livePreviewBtn = testWindow.$(testWindow.document.getElementById("toolbar-go-live"));
            livePreviewBtn.click();
        }
        it("should docasaurus project load markdowns always at base urls", async function () {
            await _setupDocusaurusProject();

            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["readme.md"]),
                "open readme.md");
            await _waitForIframeURL('http://localhost:43768/');

            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["sub/sub.md"]),
                "open sub/sub.md");
            await _waitForIframeURL('http://localhost:43768/');

        }, 30000);

        it("should docasaurus markdowns popout url work", async function () {
            await _setupDocusaurusProject();

            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["readme.md"]),
                "open readme.md");
            await _waitForIframeURL('http://localhost:43768/');
            await _waitForlivePreviewPopout('http://localhost:43768/', "readme.md");

            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["sub/sub.md"]),
                "open sub/sub.md");
            await _waitForIframeURL('http://localhost:43768/');
            await _waitForlivePreviewPopout('http://localhost:43768/', "sub/sub.md");

        }, 30000);

        it("should docasaurus markdowns not redirect on switching markdowns", async function () {
            await _setupDocusaurusProject();

            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["readme.md"]),
                "open readme.md");
            await _waitForIframeURL('http://localhost:43768/');
            testWindow._livePreviewIntegTest.currentLivePreviewURL = "";
            testWindow._livePreviewIntegTest.urlLoadCount = 0;
            testWindow._livePreviewIntegTest.redirectURL = "";
            testWindow._livePreviewIntegTest.redirectURLforce = "";

            // sow switch md file, should reload nothing
            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["sub/sub.md"]),
                "open sub/sub.md");
            await _waitForIframeURL('http://localhost:43768/');
            expect(testWindow._livePreviewIntegTest.currentLivePreviewURL).toBeFalsy();
            expect(testWindow._livePreviewIntegTest.urlLoadCount).toBe(0);
            expect(testWindow._livePreviewIntegTest.redirectURL).toBeFalsy();
            expect(testWindow._livePreviewIntegTest.redirectURLforce).toBeFalsy();

        }, 30000);

        it("should docasaurus markdowns not redirect on switching images/css etc..", async function () {
            await _setupDocusaurusProject();

            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["readme.md"]),
                "open readme.md");
            await _waitForIframeURL('http://localhost:43768/');
            testWindow._livePreviewIntegTest.currentLivePreviewURL = "";
            testWindow._livePreviewIntegTest.urlLoadCount = 0;
            testWindow._livePreviewIntegTest.redirectURL = "";
            testWindow._livePreviewIntegTest.redirectURLforce = "";

            // sow switch md file, should reload nothing
            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["sub/sub.md"]),
                "open sub/sub.md");
            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["cssLive1.less"]),
                "open cssLive1.less");
            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["blank.css"]),
                "open blank.css");
            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["sub/icon_chevron.png"]),
                "open sub/icon_chevron.png");
            expect(testWindow._livePreviewIntegTest.urlLoadCount).toBe(0);
        }, 30000);

        it("should docasaurus markdowns not reload on edit and save", async function () {
            await _setupDocusaurusProject();

            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["readme.md"]),
                "open readme.md");
            await _waitForIframeURL('http://localhost:43768/');
            testWindow._livePreviewIntegTest.urlLoadCount = 0;

            EditorManager.getActiveEditor().document.setText("new markdown text");
            await awaitsForDone(CommandManager.execute(Commands.FILE_SAVE_ALL), "FILE_SAVE_ALL");
            await awaits(50);
            expect(testWindow._livePreviewIntegTest.urlLoadCount).toBe(0);

        }, 30000);

        it("should docasaurus markdown ignore server root", async function () {
            await _setupDocusaurusProject("sub/");

            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["sub/sub.md"]),
                "open sub/sub.md");
            await _waitForIframeURL('http://localhost:43768/');
        }, 30000);

        it("should docasaurus project load html from relative urls", async function () {
            await _setupDocusaurusProject();

            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["simple1.html"]),
                "open simple1.html");
            await _waitForIframeURL('http://localhost:43768/simple1.html');
            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["sub/sub.html"]),
                "open sub/sub.html");
            await _waitForIframeURL('http://localhost:43768/sub/sub.html');
        }, 30000);

        it("should docasaurus html popout url work", async function () {
            await _setupDocusaurusProject();

            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["simple1.html"]),
                "open simple1.html");
            await _waitForIframeURL('http://localhost:43768/simple1.html');
            await _waitForlivePreviewPopout('http://localhost:43768/simple1.html', "simple1.html");

            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["sub/sub.html"]),
                "open sub/sub.html");
            await _waitForIframeURL('http://localhost:43768/sub/sub.html');
            await _waitForlivePreviewPopout('http://localhost:43768/sub/sub.html', "sub/sub.html");
        }, 30000);

        it("should docasaurus html redirect on switching html", async function () {
            await _setupDocusaurusProject();

            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["simple1.html"]),
                "open simple1.html");
            await _waitForIframeURL('http://localhost:43768/simple1.html');
            testWindow._livePreviewIntegTest.currentLivePreviewURL = "";
            testWindow._livePreviewIntegTest.urlLoadCount = 0;
            testWindow._livePreviewIntegTest.redirectURL = "";
            testWindow._livePreviewIntegTest.redirectURLforce = "";

            // sow switch md file, should reload nothing
            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["sub/sub.html"]),
                "open sub/sub.html");
            await _waitForIframeURL('http://localhost:43768/sub/sub.html');
            expect(testWindow._livePreviewIntegTest.currentLivePreviewURL).toBe('http://localhost:43768/sub/sub.html');
            expect(testWindow._livePreviewIntegTest.urlLoadCount).toBe(1);
            expect(testWindow._livePreviewIntegTest.redirectURL).toBe('http://localhost:43768/sub/sub.html');
            expect(testWindow._livePreviewIntegTest.redirectURLforce).toBeFalsy();

        }, 30000);

        it("should docasaurus html not reload on saving html", async function () {
            await _setupDocusaurusProject();

            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["simple1.html"]),
                "open simple1.html");
            await _waitForIframeURL('http://localhost:43768/simple1.html');
            testWindow._livePreviewIntegTest.urlLoadCount = 0;

            // now edit html
            EditorManager.getActiveEditor().document.setText("new html text");
            await awaitsForDone(CommandManager.execute(Commands.FILE_SAVE_ALL), "FILE_SAVE_ALL");
            await awaits(50);
            expect(testWindow._livePreviewIntegTest.urlLoadCount).toBe(0);
        }, 30000);

        it("should docasaurus html not redirect on switching images/css etc..", async function () {
            await _setupDocusaurusProject();

            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["simple1.html"]),
                "open simple1.html");
            await _waitForIframeURL('http://localhost:43768/simple1.html');
            testWindow._livePreviewIntegTest.urlLoadCount = 0;

            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["cssLive1.less"]),
                "open cssLive1.less");
            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["blank.css"]),
                "open blank.css");
            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["sub/icon_chevron.png"]),
                "open sub/icon_chevron.png");
            expect(testWindow._livePreviewIntegTest.urlLoadCount).toBe(0);
        }, 30000);

        it("should docasaurus html load respect server root", async function () {
            await _setupDocusaurusProject("sub/");

            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["sub/sub.html"]),
                "open sub/sub.html");
            await _waitForIframeURL('http://localhost:43768/sub.html');
        }, 30000);

        it("should custom server always load non docasaurus markdowns with intgrated live preview", async function () {
            const testTempDir = await SpecRunnerUtils.getTempTestDirectory(
                "/spec/LiveDevelopment-MultiBrowser-test-files", true);
            await SpecRunnerUtils.loadProjectInTestWindow(testTempDir);
            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["simple1.html"]),
                "SpecRunnerUtils.openProjectFiles simple1.html");

            await waitsForLiveDevelopmentToOpen();
            PreferencesManager.set(PREFERENCE_PROJECT_SERVER_ENABLED, true, PreferencesManager.PROJECT_SCOPE);
            PreferencesManager.set(PREFERENCE_PROJECT_SERVER_URL, "http://localhost:43768", PreferencesManager.PROJECT_SCOPE);
            PreferencesManager.set(PREFERENCE_PROJECT_SERVER_PATH, "", PreferencesManager.PROJECT_SCOPE);
            PreferencesManager.set(PREFERENCE_PROJECT_PREVIEW_FRAMEWORK, "unknown", PreferencesManager.PROJECT_SCOPE);
            PreferencesManager.set(PREFERENCE_PROJECT_SERVER_HOT_RELOAD_SUPPORTED, true, PreferencesManager.PROJECT_SCOPE);

            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["readme.md"]),
                "readme.md");
            await awaits(300);
            let iFrame = testWindow.document.getElementById("panel-live-preview-frame");
            expect(iFrame.src.endsWith("readme.md")).toBeTrue();

            // now do html, it should load from the custom server
            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["sub/sub.html"]),
                "open sub/sub.html");
            await _waitForIframeURL('http://localhost:43768/sub/sub.html');

            await endPreviewSession();

        }, 30000);

        async function _setupSimpleProject(sub="", supportsHotReload=true) {
            const testTempDir = await SpecRunnerUtils.getTempTestDirectory(
                "/spec/LiveDevelopment-MultiBrowser-test-files", true);
            await SpecRunnerUtils.loadProjectInTestWindow(testTempDir);
            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["simple1.html"]),
                "open simple1.html");
            await waitsForLiveDevelopmentToOpen();
            PreferencesManager.set(PREFERENCE_PROJECT_SERVER_ENABLED, true, PreferencesManager.PROJECT_SCOPE);
            PreferencesManager.set(PREFERENCE_PROJECT_SERVER_URL, "http://localhost:43768", PreferencesManager.PROJECT_SCOPE);
            PreferencesManager.set(PREFERENCE_PROJECT_SERVER_PATH, sub, PreferencesManager.PROJECT_SCOPE);
            PreferencesManager.set(PREFERENCE_PROJECT_PREVIEW_FRAMEWORK, "unknown", PreferencesManager.PROJECT_SCOPE);
            PreferencesManager.set(PREFERENCE_PROJECT_SERVER_HOT_RELOAD_SUPPORTED, supportsHotReload, PreferencesManager.PROJECT_SCOPE);
            return testTempDir;
        }

        it("should custom server reload page on save if hot reload not supported", async function () {
            await _setupSimpleProject("", false);

            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["simple1.html"]),
                "open simple1.html");
            await _waitForIframeURL('http://localhost:43768/simple1.html');
            testWindow._livePreviewIntegTest.urlLoadCount = 0;
            testWindow._livePreviewIntegTest.redirectURL = "";

            EditorManager.getActiveEditor().document.setText("new html text");
            await awaitsForDone(CommandManager.execute(Commands.FILE_SAVE_ALL), "FILE_SAVE_ALL");
            await awaitsFor(()=>{
                return testWindow._livePreviewIntegTest.urlLoadCount === 1;
            }, "to page reload");
            EditorManager.getActiveEditor().document.setText("new html text 2");
            await awaitsForDone(CommandManager.execute(Commands.FILE_SAVE_ALL), "FILE_SAVE_ALL");
            await awaitsFor(()=>{
                return testWindow._livePreviewIntegTest.urlLoadCount === 2;
            }, "to page reload");
            expect(testWindow._livePreviewIntegTest.redirectURL).toBe('http://localhost:43768/simple1.html');
            expect(testWindow._livePreviewIntegTest.redirectURLforce).toBeTrue();
        }, 30000);

        it("should custom server load all server rendered files and reload on save", async function () {
            const testPath = await _setupSimpleProject("", false);
            const serverFiles = [
                "asp",
                "aspx",
                "php",
                "jsp",
                "jspx",
                "cfm",
                "cfc", // ColdFusion Component
                "rb", // Ruby file, used in Ruby on Rails for views with ERB
                "erb", // Embedded Ruby, used in Ruby on Rails views
                "py" // Python file, used in web frameworks like Django or Flask for views
            ];
            function _lpReload() {
                return testWindow._livePreviewIntegTest.urlLoadCount === 1;
            }

            for(let serverFile of serverFiles) {
                serverFile =  `${serverFile}.${serverFile}`;
                await jsPromise(SpecRunnerUtils.createTextFile(`${testPath}/${serverFile}`, "hello", FileSystem));
                await awaitsForDone(SpecRunnerUtils.openProjectFiles([serverFile]),
                    "open" + serverFile);
                await _waitForIframeURL('http://localhost:43768/'+serverFile);

                testWindow._livePreviewIntegTest.urlLoadCount = 0;
                testWindow._livePreviewIntegTest.redirectURL = "";

                EditorManager.getActiveEditor().document.setText("new html text");
                await awaitsForDone(CommandManager.execute(Commands.FILE_SAVE_ALL), "FILE_SAVE_ALL");
                await awaitsFor(_lpReload, "to page reload");
                expect(testWindow._livePreviewIntegTest.redirectURL).toBe('http://localhost:43768/'+serverFile);
                expect(testWindow._livePreviewIntegTest.redirectURLforce).toBeTrue();
            }
        }, 30000);

        it("should custom server load all server rendered files and hot reload", async function () {
            const testPath = await _setupSimpleProject("", true);
            const serverFiles = [
                "asp",
                "aspx",
                "php",
                "jsp",
                "jspx",
                "cfm",
                "cfc", // ColdFusion Component
                "rb", // Ruby file, used in Ruby on Rails for views with ERB
                "erb", // Embedded Ruby, used in Ruby on Rails views
                "py" // Python file, used in web frameworks like Django or Flask for views
            ];

            for(let serverFile of serverFiles) {
                serverFile =  `${serverFile}.${serverFile}`;
                await jsPromise(SpecRunnerUtils.createTextFile(`${testPath}/${serverFile}`, "hello", FileSystem));
                await awaitsForDone(SpecRunnerUtils.openProjectFiles([serverFile]),
                    "open" + serverFile);
                await _waitForIframeURL('http://localhost:43768/'+serverFile);

                testWindow._livePreviewIntegTest.urlLoadCount = 0;
                testWindow._livePreviewIntegTest.redirectURL = "";

                EditorManager.getActiveEditor().document.setText("new html text");
                await awaitsForDone(CommandManager.execute(Commands.FILE_SAVE_ALL), "FILE_SAVE_ALL");
                await awaits(10);
                expect(testWindow._livePreviewIntegTest.urlLoadCount).toBe(0);
            }
        }, 30000);

        it("should custom server honor custom server root", async function () {
            const rootPaths = ["/", ""];
            for(let rootPath of rootPaths){
                await _setupSimpleProject(rootPath, false);
                await awaitsForDone(SpecRunnerUtils.openProjectFiles(["simple1.html"]),
                    "open simple1.html");
                await _waitForIframeURL('http://localhost:43768/simple1.html');
            }
        }, 30000);

        it("should custom server honor custom server root subPath", async function () {
            const subPaths = ["/sub", "/sub/", "sub/"];
            for(let subPath of subPaths){
                await _setupSimpleProject(subPath, false);
                await awaitsForDone(SpecRunnerUtils.openProjectFiles(["sub/sub.html"]),
                    "open sub.html");
                await _waitForIframeURL('http://localhost:43768/sub.html');
            }
        }, 30000);

    });
});
