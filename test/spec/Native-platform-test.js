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
    // Platform detection
    const isElectron = !!window.__ELECTRON__;
    const isTauri = !!window.__TAURI__;

    if (!isElectron && !isTauri) {
        return;
    }

    const SpecRunnerUtils = require("spec/SpecRunnerUtils");

    // Platform abstraction helpers - same tests, different API calls
    const platform = {
        name: isElectron ? 'Electron' : 'Tauri',

        // Path APIs
        appLocalDataDir: () => isElectron
            ? window.electronFSAPI.appLocalDataDir()
            : window.__TAURI__.path.appLocalDataDir(),

        documentDir: () => isElectron
            ? window._tauriBootVars.documentDir  // Same source for both
            : window._tauriBootVars.documentDir,

        // Asset URL conversion
        convertToAssetURL: (platformPath) => isElectron
            ? window.electronAPI.convertToAssetURL(platformPath)
            : window.__TAURI__.tauri.convertFileSrc(platformPath),

        // Credential APIs
        storeCredential: (scopeName, secretVal) => isElectron
            ? window.electronAPI.storeCredential(scopeName, secretVal)
            : window.__TAURI__.invoke("store_credential", { scopeName, secretVal }),

        getCredential: (scopeName) => isElectron
            ? window.electronAPI.getCredential(scopeName)
            : window.__TAURI__.invoke("get_credential", { scopeName }),

        deleteCredential: (scopeName) => isElectron
            ? window.electronAPI.deleteCredential(scopeName)
            : window.__TAURI__.invoke("delete_credential", { scopeName }),

        // Trust ring APIs
        trustWindowAesKey: (keyIv) => isElectron
            ? window.electronAPI.trustWindowAesKey(keyIv.key, keyIv.iv)
            : window.__TAURI__.tauri.invoke("trust_window_aes_key", keyIv),

        removeTrustWindowAesKey: (keyIv) => isElectron
            ? window.electronAPI.removeTrustWindowAesKey(keyIv.key, keyIv.iv)
            : window.__TAURI__.tauri.invoke("remove_trust_window_aes_key", keyIv),

        // Window management - returns platform-specific window object
        // For window spawning tests, we use a helper HTML file
        getTestHtmlPath: () => isElectron
            ? 'spec/Electron-platform-test.html'
            : 'spec/Tauri-platform-test.html',

        // Close window by label (uses platform-agnostic Phoenix.app API)
        closeWindow: (windowObj) => Phoenix.app.closeWindowByLabel(windowObj.label)
    };

    describe(`unit: ${platform.name} Platform Tests`, function () {

        beforeEach(async function () {

        });

        afterEach(async function () {

        });

        describe("asset url tests", function () {
            it("Should be able to fetch files in {appLocalData}/assets folder", async function () {
                const appLocalData = fs.getTauriVirtualPath(await platform.appLocalDataDir());
                expect(await SpecRunnerUtils.pathExists(appLocalData, true)).toBeTrue();
                expect(appLocalData.split("/")[1]).toEql("tauri"); // should be /tauri/applocaldata/path

                // now write a test html file to the assets folder
                const assetHTMLPath = `${appLocalData}/assets/a9322657236.html`;
                const assetHtmlText = "Hello world random37834324";
                await SpecRunnerUtils.ensureExistsDirAsync(path.dirname(assetHTMLPath));
                await SpecRunnerUtils.createTextFileAsync(assetHTMLPath, assetHtmlText);

                const appLocalDataPlatformPath = fs.getTauriPlatformPath(assetHTMLPath);
                const appLocalDataURL = platform.convertToAssetURL(appLocalDataPlatformPath);

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
                const appLocalDataURL = platform.convertToAssetURL(appLocalDataPlatformPath);

                // Tauri throws an error, Electron returns 403 response
                let accessDenied = false;
                try {
                    const response = await fetch(appLocalDataURL);
                    // Electron returns 403 for unauthorized access
                    if (!response.ok) {
                        accessDenied = true;
                    }
                } catch (e) {
                    // Tauri throws an error
                    accessDenied = true;
                }
                expect(accessDenied).withContext("Asset URL should not be accessible outside assets folder").toBeTrue();

                // delete test file
                await SpecRunnerUtils.deletePathAsync(assetHTMLPath);
            }

            it("Should not be able to fetch files in documents folder", async function () {
                // unfortunately for tests, this is set to appdata/testDocuments.
                // we cant set this to await window.__TAURI__.path.documentDir() as in github actions,
                // the user documents directory is not defined in rust and throws.
                await testAssetNotAccessibleFolder(platform.documentDir());
            });

            it("Should not be able to fetch files in appLocalData folder", async function () {
                await testAssetNotAccessibleFolder(await platform.appLocalDataDir());
            });

            // Electron-specific security test: verify asset:// URLs don't have API access
            if (isElectron) {
                it("Should NOT have electronAPI access from asset:// protocol", async function () {
                    // This test verifies that content loaded from asset:// URLs is sandboxed
                    // and does not have access to Electron APIs (matching Tauri's security posture)
                    const appLocalData = fs.getTauriVirtualPath(await platform.appLocalDataDir());
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
                    const assetURL = platform.convertToAssetURL(platformPath);

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
                            await Phoenix.app.closeWindowByLabel(windowLabel);
                        } catch (e) {
                            console.warn("Could not close security test window:", e);
                        }
                    }

                    // Cleanup
                    await SpecRunnerUtils.deletePathAsync(securityTestPath);
                });
            }

            function createWebView() {
                return new Promise((resolve, reject) => {
                    let currentURL = new URL(location.href);
                    let pathParts = currentURL.pathname.split('/');
                    pathParts[pathParts.length - 1] = platform.getTestHtmlPath();
                    currentURL.pathname = pathParts.join('/');

                    let newURL = currentURL.href;

                    if (isElectron) {
                        // For Electron, use the event system (mirrors Tauri)
                        // We need to handle race: event might fire before or after window reference is available
                        let electronWindow = null;
                        let eventReceived = false;

                        const tryResolve = () => {
                            if (electronWindow && eventReceived) {
                                resolve(electronWindow);
                            }
                        };

                        const unlisten = window.electronAPI.onWindowEvent('PLATFORM_API_WORKING', () => {
                            unlisten();
                            eventReceived = true;
                            tryResolve();
                        });

                        Phoenix.app.openURLInPhoenixWindow(newURL)
                            .then(win => {
                                expect(win.label.startsWith("extn-")).toBeTrue();
                                expect(win.isNativeWindow).toBeTrue();
                                electronWindow = win;
                                tryResolve();
                            }).catch(err => {
                                unlisten();
                                reject(err);
                            });
                    } else {
                        // For Tauri, use the event system
                        Phoenix.app.openURLInPhoenixWindow(newURL)
                            .then(tauriWindow => {
                                expect(tauriWindow.label.startsWith("extn-")).toBeTrue();
                                tauriWindow.listen('TAURI_API_WORKING', function () {
                                    resolve(tauriWindow);
                                });
                            }).catch(reject);
                    }
                });
            }

            it("Should be able to spawn windows", async function () {
                const nativeWindow = await createWebView();
                await platform.closeWindow(nativeWindow);
            });

            it("Should be able to get process ID", async function () {
                const processID = await Phoenix.app.getProcessID();
                expect(processID).toEqual(jasmine.any(Number));
            });

            const maxWindows = 25;
            it(`Should be able to spawn ${maxWindows} windows`, async function () {
                const nativeWindows = [];
                for (let i = 0; i < maxWindows; i++) {
                    nativeWindows.push(await createWebView());
                }
                for (let i = 0; i < maxWindows; i++) {
                    await platform.closeWindow(nativeWindows[i]);
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
                await platform.deleteCredential(scopeName).catch(() => {});
            });

            afterEach(async function () {
                // Cleanup after tests
                await platform.deleteCredential(scopeName).catch(() => {});
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
                        platform.storeCredential(scopeName, randomUUID)
                    ).toBeResolved();
                });

                it("Should get credentials as encrypted string", async function () {
                    const randomUUID = crypto.randomUUID();
                    await platform.storeCredential(scopeName, randomUUID);

                    const response = await platform.getCredential(scopeName);
                    expect(response).toBeDefined();
                    expect(response).not.toEqual(randomUUID);
                });

                it("Should retrieve and decrypt set credentials with kernal mode keys", async function () {
                    const randomUUID = crypto.randomUUID();
                    await platform.storeCredential(scopeName, randomUUID);

                    const creds = await platform.getCredential(scopeName);
                    expect(creds).toBeDefined();
                    const decryptedString = await decryptCreds(creds);
                    expect(decryptedString).toEqual(randomUUID);
                });

                it("Should return null if credentials do not exist", async function () {
                    const response = await platform.getCredential(scopeName);
                    expect(response).toBeNull();
                });

                it("Should delete stored credentials", async function () {
                    const randomUUID = crypto.randomUUID();
                    await platform.storeCredential(scopeName, randomUUID);

                    // Ensure credential exists
                    let creds = await platform.getCredential(scopeName);
                    expect(creds).toBeDefined();

                    // Delete credential
                    await expectAsync(
                        platform.deleteCredential(scopeName)
                    ).toBeResolved();

                    // Ensure credential is deleted
                    creds = await platform.getCredential(scopeName);
                    expect(creds).toBeNull();
                });

                it("Should handle deletion of non-existent credentials gracefully", async function () {
                    let error;
                    try {
                        await platform.deleteCredential(scopeName);
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
                    await platform.storeCredential(scopeName, oldUUID);

                    let creds = await platform.getCredential(scopeName);
                    expect(creds).toBeDefined();
                    let response = await decryptCreds(creds);
                    expect(response).toEqual(oldUUID);

                    // Store new credentials with the same scope
                    const newUUID = crypto.randomUUID();
                    await platform.storeCredential(scopeName, newUUID);

                    creds = await platform.getCredential(scopeName);
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
                        await platform.trustWindowAesKey(kv);
                    } catch (err) {
                        error = err;
                    }
                    expect(error.toString()).toContain("Trust has already been established for this window.");
                });

                it("Should be able to remove trust key with key and iv", async function () {
                    await platform.removeTrustWindowAesKey(trustRing.aesKeys);
                    let error;
                    try {
                        await platform.removeTrustWindowAesKey(trustRing.aesKeys);
                    } catch (err) {
                        error = err;
                    }
                    expect(error.toString()).toContain("No trust association found for this window.");
                    // reinstate trust
                    await platform.trustWindowAesKey(trustRing.aesKeys);
                });

                it("Should getCredential not work without trust", async function () {
                    await setSomeKey();
                    await platform.removeTrustWindowAesKey(trustRing.aesKeys);
                    let error;
                    try {
                        await trustRing.getCredential(TEST_TRUST_KEY_NAME);
                    } catch (err) {
                        error = err;
                    }
                    expect(error.toString()).toContain("Trust needs to be first established");
                    // reinstate trust
                    await platform.trustWindowAesKey(trustRing.aesKeys);
                });
            });
        });
    });
});
