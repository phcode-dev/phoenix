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

/*global describe, it, expect, beforeEach, afterEach, fs, path, Phoenix*/

define(function (require, exports, module) {
    if(!window.__TAURI__) {
        return;
    }

    const SpecRunnerUtils     = require("spec/SpecRunnerUtils");

    describe("unit: Tauri Platform Tests", function () {

        beforeEach(async function () {

        });

        afterEach(async function () {

        });

        describe("asset url tests", function () {
            it("Should be able to fetch files in {appLocalData}/assets folder", async function () {
                const appLocalData = fs.getTauriVirtualPath(await window.__TAURI__.path.appLocalDataDir());
                expect(await SpecRunnerUtils.pathExists(appLocalData, true)).toBeTrue();
                expect(appLocalData.split("/")[1]).toEql("tauri"); // should be /tauri/applocaldata/path

                // now write a test html file to the assets folder
                const assetHTMLPath = `${appLocalData}/assets/a9322657236.html`;
                const assetHtmlText = "Hello world random37834324";
                await SpecRunnerUtils.ensureExistsDirAsync(path.dirname(assetHTMLPath));
                await SpecRunnerUtils.createTextFileAsync(assetHTMLPath, assetHtmlText);

                const appLocalDataPlatformPath = fs.getTauriPlatformPath(assetHTMLPath);
                const appLocalDataURL = window.__TAURI__.tauri.convertFileSrc(appLocalDataPlatformPath);

                const fetchedData = await ((await fetch(appLocalDataURL)).text());
                expect(fetchedData).toEqual(assetHtmlText);

                // delete test file
                await SpecRunnerUtils.deletePathAsync(assetHTMLPath);
            });

            async function testAssetNotAccessibleFolder(platformPath) {
                const assets = fs.getTauriVirtualPath(platformPath);
                expect(assets.split("/")[1]).toEql("tauri"); // should be /tauri/applocaldata/path

                // now write a test html file to the assets folder
                const assetHTMLPath = `${assets}/a9322657236.html`;
                const assetHtmlText = "Hello world random37834324";
                await SpecRunnerUtils.createTextFileAsync(assetHTMLPath, assetHtmlText);

                const appLocalDataPlatformPath = fs.getTauriPlatformPath(assetHTMLPath);
                const appLocalDataURL = window.__TAURI__.tauri.convertFileSrc(appLocalDataPlatformPath);

                let err;
                try{
                    await fetch(appLocalDataURL);
                } catch (e) {
                    err = e;
                }
                expect(err).toBeDefined();

                // delete test file
                await SpecRunnerUtils.deletePathAsync(assetHTMLPath);
            }

            it("Should not be able to fetch files in documents folder", async function () {
                // unfortunately for tests, this is set to appdata/testDocuments.
                // we cant set this to await window.__TAURI__.path.documentDir() as in github actions,
                // the user documents directory is not defined in rust and throws.
                await testAssetNotAccessibleFolder(window._tauriBootVars.documentDir);
            });

            it("Should not be able to fetch files in appLocalData folder", async function () {
                await testAssetNotAccessibleFolder(await window.__TAURI__.path.appLocalDataDir());
            });

            function createWebView() {
                return new Promise((resolve, reject)=>{
                    let currentURL = new URL(location.href);
                    let pathParts = currentURL.pathname.split('/');
                    pathParts[pathParts.length - 1] = 'spec/Tauri-platform-test.html';
                    currentURL.pathname = pathParts.join('/');

                    let newURL = currentURL.href;
                    Phoenix.app.openURLInPhoenixWindow(newURL)
                        .then(tauriWindow =>{
                            expect(tauriWindow.label.startsWith("extn-")).toBeTrue();
                            tauriWindow.listen('TAURI_API_WORKING', function () {
                                resolve(tauriWindow);
                            });
                        }).catch(reject);
                });

            }

            it("Should be able to spawn tauri windows", async function () {
                const tauriWindow = await createWebView();
                await tauriWindow.close();
            });

            const maxWindows = 25;
            it(`Should be able to spawn ${maxWindows} tauri windows`, async function () {
                const tauriWindows = [];
                for(let i=0; i<maxWindows; i++){
                    tauriWindows.push(await createWebView());
                }
                for(let i=0; i<maxWindows; i++){
                    await tauriWindows[i].close();
                }
            }, 120000);
        });
    });
});
