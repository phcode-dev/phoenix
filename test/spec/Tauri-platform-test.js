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
            const trustRing = window.specRunnerTestKernalModeTrust;
            const TEST_TRUST_KEY_NAME = "testTrustKey";

            function decryptCreds(creds) {
                return trustRing.AESDecryptString(creds, trustRing.aesKeys.key, trustRing.aesKeys.iv);
            }

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
                    const randomUUID = crypto.randomUUID();
                    await expectAsync(
                        window.__TAURI__.invoke("store_credential", { scopeName, secretVal: randomUUID })
                    ).toBeResolved();
                });

                it("Should get credentials as encrypted string", async function () {
                    const randomUUID = crypto.randomUUID();
                    await window.__TAURI__.invoke("store_credential", { scopeName, secretVal: randomUUID });

                    const response = await window.__TAURI__.invoke("get_credential", { scopeName });
                    expect(response).toBeDefined();
                    expect(response).not.toEqual(randomUUID);
                });

                it("Should retrieve and decrypt set credentials with kernal mode keys", async function () {
                    const randomUUID = crypto.randomUUID();
                    await window.__TAURI__.invoke("store_credential", { scopeName, secretVal: randomUUID });

                    const creds = await window.__TAURI__.invoke("get_credential", { scopeName });
                    expect(creds).toBeDefined();
                    const decryptedString = await decryptCreds(creds);
                    expect(decryptedString).toEqual(randomUUID);
                });

                it("Should return an error if credentials do not exist", async function () {
                    const response = await window.__TAURI__.invoke("get_credential", { scopeName });
                    expect(response).toBeNull();
                });

                it("Should delete stored credentials", async function () {
                    const randomUUID = crypto.randomUUID();
                    await window.__TAURI__.invoke("store_credential", { scopeName, secretVal: randomUUID });

                    // Ensure credential exists
                    let creds = await window.__TAURI__.invoke("get_credential", { scopeName });
                    expect(creds).toBeDefined();

                    // Delete credential
                    await expectAsync(
                        window.__TAURI__.invoke("delete_credential", { scopeName })
                    ).toBeResolved();

                    // Ensure credential is deleted
                    creds = await window.__TAURI__.invoke("get_credential", { scopeName });
                    expect(creds).toBeNull();
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

                it("Should overwrite existing credentials when storing with the same scope", async function () {
                    const oldUUID = crypto.randomUUID();
                    await window.__TAURI__.invoke("store_credential", { scopeName, secretVal: oldUUID });

                    let creds = await window.__TAURI__.invoke("get_credential", { scopeName });
                    expect(creds).toBeDefined();
                    let response = await decryptCreds(creds);
                    expect(response).toEqual(oldUUID);

                    // Store new credentials with the same scope
                    const newUUID = crypto.randomUUID();
                    await window.__TAURI__.invoke("store_credential", { scopeName, secretVal: newUUID });

                    creds = await window.__TAURI__.invoke("get_credential", { scopeName });
                    expect(creds).toBeDefined();
                    response = await decryptCreds(creds);
                    expect(response).toEqual(newUUID);
                });

                // trustRing.getCredential and set tests
                async function setSomeKey() {
                    const randomCred = crypto.randomUUID();
                    await trustRing.setCredential(TEST_TRUST_KEY_NAME, randomCred);
                    const savedCred = await trustRing.getCredential(TEST_TRUST_KEY_NAME);
                    expect(savedCred).toEqual(randomCred);
                    return savedCred;
                }

                it("Should get and set API key in kernal mode trust ring", async function () {
                    await setSomeKey();
                });

                it("Should get and set empty string API key in kernal mode trust ring", async function () {
                    const randomCred = "";
                    await trustRing.setCredential(TEST_TRUST_KEY_NAME, randomCred);
                    const savedCred = await trustRing.getCredential(TEST_TRUST_KEY_NAME);
                    expect(savedCred).toEqual(randomCred);
                });

                it("Should remove API key in kernal mode trust ring work as expected", async function () {
                    await setSomeKey();
                    await trustRing.removeCredential(TEST_TRUST_KEY_NAME);
                    const cred = await trustRing.getCredential(TEST_TRUST_KEY_NAME);
                    expect(cred).toBeNull();
                });

                // trust key management
                it("Should not be able to set trust key if one is already set", async function () {
                    const kv = trustRing.generateRandomKeyAndIV();
                    let error;
                    try {
                        await window.__TAURI__.tauri.invoke("trust_window_aes_key", kv);
                    } catch (err) {
                        error = err;
                    }
                    expect(error).toContain("Trust has already been established for this window.");
                });

                it("Should be able to remove trust key with key and iv", async function () {
                    await window.__TAURI__.tauri.invoke("remove_trust_window_aes_key", trustRing.aesKeys);
                    let error;
                    try {
                        await window.__TAURI__.tauri.invoke("remove_trust_window_aes_key", trustRing.aesKeys);
                    } catch (err) {
                        error = err;
                    }
                    expect(error).toContain("No trust association found for this window.");
                    // reinstate trust
                    await window.__TAURI__.tauri.invoke("trust_window_aes_key", trustRing.aesKeys);
                });

                it("Should getCredential not work without trust", async function () {
                    await setSomeKey();
                    await window.__TAURI__.tauri.invoke("remove_trust_window_aes_key", trustRing.aesKeys);
                    let error;
                    try {
                        await trustRing.getCredential(TEST_TRUST_KEY_NAME);
                    } catch (err) {
                        error = err;
                    }
                    expect(error).toContain("Trust needs to be first established");
                    // reinstate trust
                    await window.__TAURI__.tauri.invoke("trust_window_aes_key", trustRing.aesKeys);
                });
            });
        });
    });
});
