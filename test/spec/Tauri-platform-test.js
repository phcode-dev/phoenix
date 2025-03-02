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

/*global describe, it, expect, beforeEach, afterEach, fs, path, jasmine, expectAsync*/

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

            it("Should be able to get process ID", async function () {
                const processID = await Phoenix.app.getProcessID();
                expect(processID).toEqual(jasmine.any(Number));
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

        describe("Credentials OTP API Tests", function () {
            const scopeName = "testScope";
            const sessionID = "test-session-123";
            const otpSeed = "test-secret-seed";

            beforeEach(async function () {
                // Cleanup before running tests
                await window.__TAURI__.invoke("delete_credential", { scopeName }).catch(() => {});
            });

            afterEach(async function () {
                // Cleanup after tests
                await window.__TAURI__.invoke("delete_credential", { scopeName }).catch(() => {});
            });

            if(Phoenix.isTestWindowGitHubActions && Phoenix.platform === "linux"){
                // Credentials test doesn't work in GitHub actions in linux desktop as the runner cant reach key ring.
                it("Should not run in github actions in linux desktop", async function () {
                    expect(1).toEqual(1);
                });
                return;
            }

            describe("Credential Storage & OTP Generation", function () {
                it("Should store credentials successfully", async function () {
                    await expectAsync(
                        window.__TAURI__.invoke("store_credential", { scopeName, sessionId: sessionID, otpSeed })
                    ).toBeResolved();
                });

                it("Should retrieve a valid OTP after storing credentials", async function () {
                    await window.__TAURI__.invoke("store_credential", { scopeName, sessionId: sessionID, otpSeed });

                    const response = await window.__TAURI__.invoke("get_credential_otp", { scopeName });
                    expect(response).toBeDefined();
                    expect(response.session_id).toEqual(sessionID);
                    expect(response.totp).toMatch(/^\d{6}$/); // OTP should be a 6-digit number
                });

                it("Should retrieve a valid OTP after storing uuid as seed", async function () {
                    const newSession = crypto.randomUUID();
                    await window.__TAURI__.invoke("store_credential",
                        { scopeName, sessionId: newSession, otpSeed: crypto.randomUUID() });

                    const response = await window.__TAURI__.invoke("get_credential_otp", { scopeName });
                    expect(response).toBeDefined();
                    expect(response.session_id).toEqual(newSession);
                    expect(response.totp).toMatch(/^\d{6}$/); // OTP should be a 6-digit number
                });

                it("Should return an error if credentials do not exist", async function () {
                    const response = await window.__TAURI__.invoke("get_credential_otp", { scopeName });
                    expect(response).toEqual({ err_code: "NO_ENTRY" });
                });

                it("Should delete stored credentials", async function () {
                    await window.__TAURI__.invoke("store_credential", { scopeName, sessionId: sessionID, otpSeed });

                    // Ensure credential exists
                    const responseBeforeDelete = await window.__TAURI__.invoke("get_credential_otp", { scopeName });
                    expect(responseBeforeDelete.session_id).toEqual(sessionID);

                    // Delete credential
                    await expectAsync(
                        window.__TAURI__.invoke("delete_credential", { scopeName })
                    ).toBeResolved();

                    // Ensure credential is deleted
                    const responseAfterDelete = await window.__TAURI__.invoke("get_credential_otp", { scopeName });
                    expect(responseAfterDelete).toEqual({ err_code: "NO_ENTRY" });
                });

                it("Should handle deletion of non-existent credentials gracefully", async function () {
                    let error;
                    try {
                        await window.__TAURI__.invoke("delete_credential", { scopeName });
                    } catch (err) {
                        error = err;
                    }

                    // The test should fail if no error was thrown
                    expect(error).toBeDefined();

                    // Check for OS-specific error messages
                    const expectedErrors = [
                        "No matching entry found in secure storage", // Common error on Linux/macOS
                        "The specified item could not be found in the keychain", // macOS Keychain
                        "Element not found" // Windows Credential Manager
                    ];

                    const isExpectedError = expectedErrors.some(msg => error.includes(msg));
                    expect(isExpectedError).toBeTrue();
                });

                it("Should reject storing an empty seed", async function () {
                    let error;
                    try {
                        await window.__TAURI__.invoke("store_credential",
                            { scopeName, sessionId: sessionID, otpSeed: "" });
                    } catch (err) {
                        error = err;
                    }
                    expect(error).toBeDefined();
                    expect(error).toContain("SEED_TOO_SHORT");
                });

                it("Should reject storing a seed that is too short", async function () {
                    let error;
                    try {
                        await window.__TAURI__.invoke("store_credential",
                            { scopeName, sessionId: sessionID, otpSeed: "12345" });
                    } catch (err) {
                        error = err;
                    }
                    expect(error).toBeDefined();
                    expect(error).toContain("SEED_TOO_SHORT");
                });

                it("Should overwrite existing credentials when storing with the same scope", async function () {
                    const oldSeed = crypto.randomUUID();
                    await window.__TAURI__.invoke("store_credential",
                        { scopeName, sessionId: "old-session", otpSeed: oldSeed });

                    const responseBefore = await window.__TAURI__.invoke("get_credential_otp", { scopeName });
                    expect(responseBefore.session_id).toEqual("old-session");

                    // Store new credentials with the same scope
                    await window.__TAURI__.invoke("store_credential", { scopeName, sessionId: sessionID, otpSeed });

                    const responseAfter = await window.__TAURI__.invoke("get_credential_otp", { scopeName });
                    expect(responseAfter.session_id).toEqual(sessionID);
                });

                it("Should correctly encode and decode Base32 seed", async function () {
                    const base32Seed = "JBSWY3DPEHPK3PXP"; // Valid Base32 seed
                    await window.__TAURI__.invoke("store_credential",
                        { scopeName, sessionId: sessionID, otpSeed: base32Seed });

                    const response = await window.__TAURI__.invoke("get_credential_otp", { scopeName });
                    expect(response).toBeDefined();
                    expect(response.session_id).toEqual(sessionID);
                    expect(response.totp).toMatch(/^\d{6}$/);
                });
            });
        });
    });
});
