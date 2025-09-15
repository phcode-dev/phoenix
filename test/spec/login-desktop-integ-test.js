/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
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

/*global describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, awaitsFor, awaitsForDone, awaits*/

define(function (require, exports, module) {

    const SpecRunnerUtils = require("spec/SpecRunnerUtils");

    describe("integration: login/logout desktop app tests", function () {

        if (!Phoenix.isNativeApp) {
            // Desktop login tests are only applicable for native apps
            it("This test disabled in browser as its desktop login tests", function () {
                expect(1).toEqual(1);
            });
            return;
        }
        if (Phoenix.isNativeApp && Phoenix.isTestWindowGitHubActions && Phoenix.platform === "linux") {
            // Credentials test doesn't work in GitHub actions in linux desktop as the runner cant reach key ring.
            it("Should not run in github actions in linux desktop", async function () {
                expect(1).toEqual(1);
            });
            return;
        }

        let testWindow,
            LoginServiceExports,
            LoginDesktopExports,
            originalOpenURLInDefaultBrowser,
            originalCopyToClipboard,
            originalFetch;

        beforeAll(async function () {
            testWindow = await SpecRunnerUtils.createTestWindowAndRun();

            // Wait for test exports to be available (KernalModeTrust is sandboxed, use test exports)
            await awaitsFor(
                function () {
                    return testWindow._test_login_service_exports &&
                           testWindow._test_login_desktop_exports;
                },
                "Test exports to be available",
                5000
            );

            // Access the login service exports from the test window
            LoginServiceExports = testWindow._test_login_service_exports;
            LoginDesktopExports = testWindow._test_login_desktop_exports;

            // Store original functions for restoration
            if (testWindow.Phoenix && testWindow.Phoenix.app) {
                originalOpenURLInDefaultBrowser = testWindow.Phoenix.app.openURLInDefaultBrowser;
                originalCopyToClipboard = testWindow.Phoenix.app.copyToClipboard;
            }
            if (LoginServiceExports.setFetchFn) {
                originalFetch = testWindow.fetch;
            }

            // Wait for profile menu to be initialized
            await awaitsFor(
                function () {
                    return testWindow.$("#user-profile-button").length > 0;
                },
                "Profile button to be available",
                3000
            );
        }, 30000);

        afterAll(async function () {
            // Restore original functions
            if (originalOpenURLInDefaultBrowser && testWindow.Phoenix && testWindow.Phoenix.app) {
                testWindow.Phoenix.app.openURLInDefaultBrowser = originalOpenURLInDefaultBrowser;
            }
            if (originalCopyToClipboard && testWindow.Phoenix && testWindow.Phoenix.app) {
                testWindow.Phoenix.app.copyToClipboard = originalCopyToClipboard;
            }

            // Restore all fetch function overrides
            if (originalFetch) {
                if (LoginServiceExports && LoginServiceExports.setFetchFn) {
                    LoginServiceExports.setFetchFn(originalFetch);
                }
                if (LoginDesktopExports && LoginDesktopExports.setFetchFn) {
                    LoginDesktopExports.setFetchFn(originalFetch);
                }
            }

            testWindow = null;
            LoginServiceExports = null;
            LoginDesktopExports = null;
            originalOpenURLInDefaultBrowser = null;
            originalCopyToClipboard = null;
            originalFetch = null;
            await SpecRunnerUtils.closeTestWindow();
        }, 30000);

        beforeEach(function () {
            // Ensure we start each test in a logged-out state
            // Note: We can't easily reset login state, so tests should handle this
        });

        describe("Desktop Login Flow", function () {

            it("should complete desktop login flow successfully", async function () {
                // if this fails, it may fail on repeat as the test login creds are not reset.
                // Ensure user starts logged out
                const initialLoginState = LoginServiceExports.LoginService.isLoggedIn();
                if (initialLoginState) {
                    throw new Error("Login desktop tests require user to be logged out. Please log out before running these tests.");
                }
                expect(initialLoginState).toBe(false);

                // Step 1: Click profile icon to open login popup
                const $profileButton = testWindow.$("#user-profile-button");
                expect($profileButton.length).toBe(1);

                // Debug: Check if the button is visible and clickable
                expect($profileButton.is(':visible')).toBe(true);

                // Try jQuery trigger first
                $profileButton.trigger('click');

                // Step 2: Wait for login popup to appear (check both modal and profile-popup)
                await awaitsFor(
                    function () {
                        return testWindow.$('.modal').length > 0 || testWindow.$('.profile-popup').length > 0;
                    },
                    "Login popup to appear",
                    3000
                );

                // Get the popup content (could be modal or profile-popup)
                let popupContent = testWindow.$('.modal');
                if (popupContent.length === 0) {
                    popupContent = testWindow.$('.profile-popup');
                }
                expect(testWindow.$('.profile-popup').is(':visible')).toBe(true);

                // Verify it's the login popup (contains sign in button)
                const signInButton = popupContent.find('#phoenix-signin-btn');
                expect(signInButton.length).toBe(1);
                expect(signInButton.text().trim().toLocaleLowerCase()).toContain('sign in');

                // Step 3: Mock successful desktop login responses FIRST (using desktop test exports)
                console.log("llgT: Setting up fetch mock EARLY using login-desktop exports");
                console.log("llgT: LoginDesktopExports.setFetchFn available?", !!LoginDesktopExports.setFetchFn);

                if (LoginDesktopExports.setFetchFn) {
                    // Track sign out state for proper mock responses
                    let userSignedOut = false;
                    let authSessionCreated = false;

                    LoginDesktopExports.setFetchFn((url, options) => {
                        console.log("llgT: login-desktop fetchFn called with URL:", url);
                        console.log("llgT: login-desktop fetchFn called with options:", options);

                        // Handle different endpoints
                        if (url.includes('/getAppAuthSession')) {
                            // App auth session creation endpoint
                            console.log("llgT: Handling getAppAuthSession endpoint call");
                            authSessionCreated = true;
                            return Promise.resolve({
                                ok: true,
                                status: 200,
                                json: () => Promise.resolve({
                                    isSuccess: true,
                                    appSessionID: "test-session-123",
                                    validationCode: "123456"
                                })
                            });
                        } else if (url.includes('/resolveAPIKey') || url.includes('/resolveAppSessionID')) {
                            // API key resolution endpoint (both resolveAPIKey and resolveAppSessionID)
                            if (userSignedOut) {
                                console.log("llgT: User is signed out, returning 401 for resolve endpoint");
                                return Promise.resolve({
                                    ok: false,
                                    status: 401,
                                    json: () => Promise.resolve({
                                        isSuccess: false
                                    })
                                });
                            } else {
                                console.log("llgT: User is signed in, returning success for resolve endpoint");
                                return Promise.resolve({
                                    ok: true,
                                    status: 200,
                                    json: () => Promise.resolve({
                                        isSuccess: true,
                                        email: "test@example.com",
                                        firstName: "Test",
                                        lastName: "User",
                                        customerID: "test-customer-id",
                                        apiKey: "test-api-key",
                                        validationCode: "123456",
                                        profileIcon: {
                                            initials: "TU",
                                            color: "#14b8a6"
                                        }
                                    })
                                });
                            }
                        } else if (url.includes('/signOut') || url.includes('/logoutSession')) {
                            // Logout endpoint - set signed out state (both signOut and logoutSession)
                            console.log("llgT: Handling logout endpoint call, marking user as signed out");
                            userSignedOut = true;
                            return Promise.resolve({
                                ok: true,
                                status: 200,
                                json: () => Promise.resolve({
                                    isSuccess: true
                                })
                            });
                        } else {
                            // Default response for any other endpoints
                            console.log("llgT: Unknown endpoint, returning default response");
                            return Promise.resolve({
                                ok: true,
                                status: 200,
                                json: () => Promise.resolve({
                                    isSuccess: true
                                })
                            });
                        }
                    });
                    console.log("llgT: login-desktop fetch mock set up successfully for all endpoints");
                } else {
                    console.log("llgT: LoginDesktopExports.setFetchFn not available!");
                }

                // Step 4: Mock desktop app functions
                let capturedBrowserURL = null;
                let capturedClipboardText = null;

                // Mock both Phoenix.app and NativeApp for desktop functionality
                if (testWindow.Phoenix && testWindow.Phoenix.app) {
                    testWindow.Phoenix.app.openURLInDefaultBrowser = function(url) {
                        console.log("llgT: Phoenix.app.openURLInDefaultBrowser called with:", url);
                        capturedBrowserURL = url;
                        return true;
                    };

                    testWindow.Phoenix.app.copyToClipboard = function(text) {
                        console.log("llgT: Phoenix.app.copyToClipboard called with:", text);
                        capturedClipboardText = text;
                        return true;
                    };
                }

                // Desktop login uses NativeApp, so mock that too
                if (!testWindow.NativeApp) {
                    testWindow.NativeApp = {};
                }
                testWindow.NativeApp.openURLInDefaultBrowser = function(url) {
                    console.log("llgT: NativeApp.openURLInDefaultBrowser called with:", url);
                    capturedBrowserURL = url;
                    return true;
                };

                // Step 5: Click the sign in button
                console.log("llgT: About to click sign in button");
                signInButton.trigger('click');

                // Step 6: Wait for desktop login dialog with validation code to appear
                console.log("llgT: Waiting for desktop login dialog...");
                await testWindow.__PR.waitForModalDialog(".modal");

                // Get desktop login dialog content
                let desktopLoginDialog = testWindow.$('.modal');
                expect(desktopLoginDialog.length).toBeGreaterThan(0);

                // Verify desktop login dialog contains validation code elements
                const validationCodeElement = desktopLoginDialog.find('.validation-code');
                const copyButton = desktopLoginDialog.find('[data-button-id="copy"]');
                const openBrowserButton = desktopLoginDialog.find('[data-button-id="open"]'); // Fixed: was "openBrowser"
                const refreshButton = desktopLoginDialog.find('[data-button-id="refresh"]'); // Fixed: was "check"

                console.log("llgT: Validation code element found:", validationCodeElement.length);
                console.log("llgT: Copy button found:", copyButton.length);
                console.log("llgT: Open browser button found:", openBrowserButton.length);
                console.log("llgT: Refresh button found:", refreshButton.length);

                expect(validationCodeElement.length).toBe(1);
                expect(copyButton.length).toBe(1);
                expect(openBrowserButton.length).toBe(1);
                expect(refreshButton.length).toBe(1);

                // Step 7: Test copy button functionality
                console.log("llgT: Testing copy button");
                copyButton.trigger('click');
                expect(capturedClipboardText).toBe("123456");

                // Step 8: Test open browser button functionality
                console.log("llgT: Testing open browser button");
                openBrowserButton.trigger('click');
                expect(capturedBrowserURL).toBeDefined();
                expect(capturedBrowserURL).toContain('authorizeApp');
                expect(capturedBrowserURL).toContain('test-session-123');

                // Step 9: Click "Refresh" button to verify login (desktop equivalent of "Check Now")
                console.log("llgT: Clicking Refresh button");
                refreshButton.trigger('click');

                // Wait for login verification to complete and success message
                await awaitsFor(
                    function () {
                        return  LoginServiceExports.LoginService.isLoggedIn();
                    },
                    "User to be logged in",
                    5000
                );

                // Verify profile icon has been updated with user initials
                await awaitsFor(
                    function () {
                        const $profileIcon = testWindow.$("#user-profile-button");
                        const profileIconContent = $profileIcon.html();
                        return profileIconContent && profileIconContent.includes('TU');
                    },
                    "profile icon to contain user initials",
                    5000
                );
                const $profileIcon = testWindow.$("#user-profile-button");
                const profileIconContent = $profileIcon.html();
                expect(profileIconContent).toContain('svg'); // Should contain SVG element
                expect(profileIconContent).toContain('TU'); // Should contain user initials

                // Step 10: Wait for desktop login dialog to close automatically
                await testWindow.__PR.waitForModalDialogClosed(".modal");

                // Step 11: Click profile icon again to verify profile popup appears
                $profileButton.trigger('click');

                // Wait for profile popup (not login popup) to appear
                await awaitsFor(
                    function () {
                        return testWindow.$('.modal').length > 0 ||
                               testWindow.$('.profile-popup').length > 0;
                    },
                    "Profile popup to appear",
                    3000
                );

                // Get the new popup content
                let newPopupContent = testWindow.$('.modal');
                if (newPopupContent.length === 0) {
                    newPopupContent = testWindow.$('.profile-popup');
                }

                // Verify it's the profile popup (contains sign out button, not sign in)
                const signOutButton = newPopupContent.find('#phoenix-signout-btn');
                const newSignInButton = newPopupContent.find('#phoenix-signin-btn');

                expect(signOutButton.length).toBe(1); // Should have sign out button
                expect(newSignInButton.length).toBe(0); // Should NOT have sign in button

                // Step 12: Test sign out functionality
                console.log("llgT: About to click sign out button");
                console.log("llgT: Login state before sign out:", LoginServiceExports.LoginService.isLoggedIn());

                signOutButton.trigger('click');

                // Wait for sign out dialog to appear and dismiss it
                console.log("llgT: Waiting for sign out confirmation dialog");
                await testWindow.__PR.waitForModalDialog(".modal");

                // Dismiss the "you have been signed out" dialog with OK button
                console.log("llgT: Dismissing sign out confirmation dialog");
                testWindow.__PR.clickDialogButtonID(testWindow.__PR.Dialogs.DIALOG_BTN_OK);
                await testWindow.__PR.waitForModalDialogClosed(".modal");

                // Wait for sign out to complete
                console.log("llgT: Waiting for user to be signed out...");
                await awaitsFor(
                    function () {
                        return !LoginServiceExports.LoginService.isLoggedIn();
                    },
                    "User to be signed out",
                    10000
                );

                // Verify user is now signed out
                expect(LoginServiceExports.LoginService.isLoggedIn()).toBe(false);

                // Verify profile icon has been updated (should be empty again)
                const $profileIconAfterSignout = testWindow.$("#user-profile-button");
                const profileIconContentAfterSignout = $profileIconAfterSignout.html();
                console.log("llgT: Profile icon after signout:", profileIconContentAfterSignout);

                // Step 13: Verify clicking profile icon again shows login popup (not profile popup)
                console.log("llgT: Clicking profile icon after sign out to verify login popup appears");
                $profileIconAfterSignout.trigger('click');

                // Wait for login popup to appear again
                await awaitsFor(
                    function () {
                        return testWindow.$('.modal').length > 0 || testWindow.$('.profile-popup').length > 0;
                    },
                    "Login popup to appear after signout",
                    3000
                );

                // Get the popup content after signout
                let finalPopupContent = testWindow.$('.modal');
                if (finalPopupContent.length === 0) {
                    finalPopupContent = testWindow.$('.profile-popup');
                }

                // Verify it's back to login popup (has sign in button, no sign out button)
                const finalSignInButton = finalPopupContent.find('#phoenix-signin-btn');
                const finalSignOutButton = finalPopupContent.find('#phoenix-signout-btn');

                expect(finalSignInButton.length).toBe(1); // Should have sign in button again
                expect(finalSignOutButton.length).toBe(0); // Should NOT have sign out button

                // Close the final popup
                if (testWindow.$('.modal').length > 0) {
                    testWindow.__PR.clickDialogButtonID(testWindow.__PR.Dialogs.DIALOG_BTN_CANCEL);
                    await testWindow.__PR.waitForModalDialogClosed(".modal");
                } else {
                    // If it's not a modal, just click outside or use popup close method
                    $profileIconAfterSignout.trigger('click'); // Toggle to close
                }

                // Test completed successfully!
            });
        });
    });
});
