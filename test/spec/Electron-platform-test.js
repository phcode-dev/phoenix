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

/*global describe, it, expect, beforeEach, afterEach, awaitsFor, fs, path, jasmine, expectAsync*/

define(function (require, exports, module) {
    if(!window.__ELECTRON__) {
        return;
    }

    const SpecRunnerUtils     = require("spec/SpecRunnerUtils");

    describe("unit: Electron Platform Tests", function () {

        beforeEach(async function () {

        });

        afterEach(async function () {

        });

        describe("asset url tests", function () {
            it("Should be able to fetch files in {appLocalData}/assets folder", async function () {
                const appLocalData = fs.getTauriVirtualPath(await window.electronFSAPI.appLocalDataDir());
                expect(await SpecRunnerUtils.pathExists(appLocalData, true)).toBeTrue();
                expect(appLocalData.split("/")[1]).toEql("tauri"); // should be /tauri/applocaldata/path

                // now write a test html file to the assets folder
                const assetHTMLPath = `${appLocalData}/assets/a9322657236.html`;
                const assetHtmlText = "Hello world random37834324";
                await SpecRunnerUtils.ensureExistsDirAsync(path.dirname(assetHTMLPath));
                await SpecRunnerUtils.createTextFileAsync(assetHTMLPath, assetHtmlText);

                const appLocalDataPlatformPath = fs.getTauriPlatformPath(assetHTMLPath);
                const appLocalDataURL = window.electronAPI.convertToAssetURL(appLocalDataPlatformPath);

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
                const appLocalDataURL = window.electronAPI.convertToAssetURL(appLocalDataPlatformPath);

                let response;
                try{
                    response = await fetch(appLocalDataURL);
                } catch (e) {
                    // Network error is expected
                }
                // Electron returns 403 for unauthorized paths instead of throwing
                expect(!response || response.status === 403).toBeTrue();

                // delete test file
                await SpecRunnerUtils.deletePathAsync(assetHTMLPath);
            }

            it("Should not be able to fetch files in documents folder", async function () {
                // unfortunately for tests, this is set to appdata/testDocuments.
                // we cant set this to documentDir() as in github actions,
                // the user documents directory may not be accessible
                await testAssetNotAccessibleFolder(window._tauriBootVars.documentDir);
            });

            it("Should not be able to fetch files in appLocalData folder", async function () {
                await testAssetNotAccessibleFolder(await window.electronFSAPI.appLocalDataDir());
            });

            it("Should NOT have electronAPI access from asset:// protocol", async function () {
                // This test verifies that content loaded from asset:// URLs is sandboxed
                // and does not have access to Electron APIs (matching Tauri's security posture)
                const appLocalData = fs.getTauriVirtualPath(await window.electronFSAPI.appLocalDataDir());
                const securityTestPath = `${appLocalData}/assets/security-test-${Date.now()}.html`;
                const SECURITY_TEST_KEY = 'ELECTRON_ASSET_SECURITY_TEST_' + Date.now();

                // Create the security test HTML in assets folder
                // This script will try to use electronAPI if available and report back
                const securityTestHtml = `<!DOCTYPE html>
<html><head><script>
(async function() {
    const result = {
        hasElectronAPI: typeof window.electronAPI !== 'undefined',
        hasElectronFSAPI: typeof window.electronFSAPI !== 'undefined',
        hasElectronAppAPI: typeof window.electronAppAPI !== 'undefined'
    };
    // Try to signal back using putItem if available (security violation if this works)
    if (window.electronAPI && window.electronAPI.putItem) {
        try {
            await window.electronAPI.putItem('${SECURITY_TEST_KEY}', JSON.stringify(result));
        } catch(e) {}
    }
})();
</script></head><body>Security Test</body></html>`;

                await SpecRunnerUtils.ensureExistsDirAsync(path.dirname(securityTestPath));
                await SpecRunnerUtils.createTextFileAsync(securityTestPath, securityTestHtml);

                // Get the asset:// URL for the test file
                const platformPath = fs.getTauriPlatformPath(securityTestPath);
                const assetURL = window.electronAPI.convertToAssetURL(platformPath);

                // Clear any previous test result
                await window.electronAPI.putItem(SECURITY_TEST_KEY, null);

                // Try to open a window with the asset:// URL
                let windowLabel = null;
                try {
                    windowLabel = await window.electronAPI.createPhoenixWindow(assetURL, {
                        windowTitle: 'Security Test',
                        width: 400,
                        height: 300,
                        isExtension: true
                    });
                } catch (e) {
                    // If window creation fails for asset:// URLs, that's acceptable security behavior
                    console.log("Window creation blocked for asset:// URL (expected):", e.message);
                }

                if (windowLabel) {
                    // Window was created - wait for it to load and potentially try to use APIs
                    await new Promise(resolve => setTimeout(resolve, 2000));

                    // Check if the sandboxed window was able to use electronAPI
                    const items = await window.electronAPI.getAllItems();
                    const testResult = items[SECURITY_TEST_KEY];

                    if (testResult) {
                        const parsed = JSON.parse(testResult);
                        // SECURITY CHECK: If we got a result, verify no API access was possible
                        // If any of these are true, it's a security vulnerability
                        expect(parsed.hasElectronAPI).withContext(
                            "SECURITY VIOLATION: asset:// window has electronAPI access"
                        ).toBeFalse();
                        expect(parsed.hasElectronFSAPI).withContext(
                            "SECURITY VIOLATION: asset:// window has electronFSAPI access"
                        ).toBeFalse();
                        expect(parsed.hasElectronAppAPI).withContext(
                            "SECURITY VIOLATION: asset:// window has electronAppAPI access"
                        ).toBeFalse();
                    }
                    // If no result was stored, the window couldn't access APIs - test passes

                    // Close the security test window by its label
                    try {
                        await window.electronAPI.closeWindowByLabel(windowLabel);
                    } catch (e) {
                        console.warn("Could not close security test window:", e);
                    }
                }

                // Cleanup
                await SpecRunnerUtils.deletePathAsync(securityTestPath);
            });

            // Unique key for inter-window communication
            const ELECTRON_TEST_SIGNAL_KEY = 'ELECTRON_PLATFORM_TEST_SIGNAL';

            function createWebView() {
                return new Promise((resolve, reject)=>{
                    let currentURL = new URL(location.href);
                    let pathParts = currentURL.pathname.split('/');
                    pathParts[pathParts.length - 1] = 'spec/Electron-platform-test.html';
                    currentURL.pathname = pathParts.join('/');

                    let newURL = currentURL.href;
                    Phoenix.app.openURLInPhoenixWindow(newURL)
                        .then(electronWindow =>{
                            expect(electronWindow.label.startsWith("extn-")).toBeTrue();
                            expect(electronWindow.isNativeWindow).toBeTrue();

                            // For Electron, we use shared storage to communicate between windows
                            // Poll for the signal from the child window
                            const pollInterval = setInterval(async () => {
                                try {
                                    const items = await window.electronAPI.getAllItems();
                                    if (items && items[ELECTRON_TEST_SIGNAL_KEY] === electronWindow.label) {
                                        clearInterval(pollInterval);
                                        // Clear the signal
                                        await window.electronAPI.putItem(ELECTRON_TEST_SIGNAL_KEY, null);
                                        // Create a window-like object with close method
                                        const winLabel = electronWindow.label;
                                        resolve({
                                            label: winLabel,
                                            close: async function() {
                                                // Signal the child window to close itself
                                                const closeKey = ELECTRON_TEST_SIGNAL_KEY +
                                                    '_CLOSE_' + winLabel;
                                                await window.electronAPI.putItem(closeKey, true);
                                            }
                                        });
                                    }
                                } catch (e) {
                                    // Ignore polling errors
                                }
                            }, 100);

                            // Timeout after 10 seconds
                            setTimeout(() => {
                                clearInterval(pollInterval);
                                reject(new Error('Timeout waiting for child window signal'));
                            }, 10000);
                        }).catch(reject);
                });
            }

            it("Should be able to spawn electron windows", async function () {
                const electronWindow = await createWebView();
                await electronWindow.close();
                // Wait for window to actually close
                await new Promise(resolve => setTimeout(resolve, 500));
            });

            it("Should be able to get process ID", async function () {
                const processID = await Phoenix.app.getProcessID();
                expect(processID).toEqual(jasmine.any(Number));
            });

            const maxWindows = 25;
            it(`Should be able to spawn ${maxWindows} electron windows`, async function () {
                const electronWindows = [];
                for(let i=0; i<maxWindows; i++){
                    electronWindows.push(await createWebView());
                }
                for(let i=0; i<maxWindows; i++){
                    await electronWindows[i].close();
                }
                // Wait for windows to close
                await new Promise(resolve => setTimeout(resolve, 1000));
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
                await window.electronAPI.deleteCredential(scopeName).catch(() => {});
            });

            afterEach(async function () {
                // Cleanup after tests
                await window.electronAPI.deleteCredential(scopeName).catch(() => {});
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
                        window.electronAPI.storeCredential(scopeName, randomUUID)
                    ).toBeResolved();
                });

                it("Should get credentials as encrypted string", async function () {
                    const randomUUID = crypto.randomUUID();
                    await window.electronAPI.storeCredential(scopeName, randomUUID);

                    const response = await window.electronAPI.getCredential(scopeName);
                    expect(response).toBeDefined();
                    expect(response).not.toEqual(randomUUID);
                });

                it("Should retrieve and decrypt set credentials with kernal mode keys", async function () {
                    const randomUUID = crypto.randomUUID();
                    await window.electronAPI.storeCredential(scopeName, randomUUID);

                    const creds = await window.electronAPI.getCredential(scopeName);
                    expect(creds).toBeDefined();
                    const decryptedString = await decryptCreds(creds);
                    expect(decryptedString).toEqual(randomUUID);
                });

                it("Should return an error if credentials do not exist", async function () {
                    const response = await window.electronAPI.getCredential(scopeName);
                    expect(response).toBeNull();
                });

                it("Should delete stored credentials", async function () {
                    const randomUUID = crypto.randomUUID();
                    await window.electronAPI.storeCredential(scopeName, randomUUID);

                    // Ensure credential exists
                    let creds = await window.electronAPI.getCredential(scopeName);
                    expect(creds).toBeDefined();

                    // Delete credential
                    await expectAsync(
                        window.electronAPI.deleteCredential(scopeName)
                    ).toBeResolved();

                    // Ensure credential is deleted
                    creds = await window.electronAPI.getCredential(scopeName);
                    expect(creds).toBeNull();
                });

                it("Should handle deletion of non-existent credentials gracefully", async function () {
                    let error;
                    try {
                        await window.electronAPI.deleteCredential(scopeName);
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

                    const isExpectedError = expectedErrors.some(msg => error.toString().includes(msg));
                    expect(isExpectedError).toBeTrue();
                });

                it("Should overwrite existing credentials when storing with the same scope", async function () {
                    const oldUUID = crypto.randomUUID();
                    await window.electronAPI.storeCredential(scopeName, oldUUID);

                    let creds = await window.electronAPI.getCredential(scopeName);
                    expect(creds).toBeDefined();
                    let response = await decryptCreds(creds);
                    expect(response).toEqual(oldUUID);

                    // Store new credentials with the same scope
                    const newUUID = crypto.randomUUID();
                    await window.electronAPI.storeCredential(scopeName, newUUID);

                    creds = await window.electronAPI.getCredential(scopeName);
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
                        await window.electronAPI.trustWindowAesKey(kv.key, kv.iv);
                    } catch (err) {
                        error = err;
                    }
                    expect(error.toString()).toContain("Trust has already been established for this window.");
                });

                it("Should be able to remove trust key with key and iv", async function () {
                    await window.electronAPI.removeTrustWindowAesKey(trustRing.aesKeys.key, trustRing.aesKeys.iv);
                    let error;
                    try {
                        await window.electronAPI.removeTrustWindowAesKey(trustRing.aesKeys.key, trustRing.aesKeys.iv);
                    } catch (err) {
                        error = err;
                    }
                    expect(error.toString()).toContain("No trust association found for this window.");
                    // reinstate trust
                    await window.electronAPI.trustWindowAesKey(trustRing.aesKeys.key, trustRing.aesKeys.iv);
                });

                it("Should getCredential not work without trust", async function () {
                    await setSomeKey();
                    await window.electronAPI.removeTrustWindowAesKey(trustRing.aesKeys.key, trustRing.aesKeys.iv);
                    let error;
                    try {
                        await trustRing.getCredential(TEST_TRUST_KEY_NAME);
                    } catch (err) {
                        error = err;
                    }
                    expect(error.toString()).toContain("Trust needs to be first established");
                    // reinstate trust
                    await window.electronAPI.trustWindowAesKey(trustRing.aesKeys.key, trustRing.aesKeys.iv);
                });
            });
        });
    });
});
