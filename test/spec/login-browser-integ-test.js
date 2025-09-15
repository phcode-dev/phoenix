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

    describe("integration: login/logout browser app tests", function () {

        if (Phoenix.isNativeApp) {
            // Browser login tests are not applicable for native apps
            it("This test disabled in native apps as its browser login tests", function () {
                expect(1).toEqual(1);
            });
            return;
        }

        let testWindow,
            LoginServiceExports,
            LoginBrowserExports,
            originalOpen,
            originalFetch;

        beforeAll(async function () {
            testWindow = await SpecRunnerUtils.createTestWindowAndRun();

            // Wait for test exports to be available (KernalModeTrust is sandboxed, use test exports)
            await awaitsFor(
                function () {
                    return testWindow._test_login_service_exports &&
                           testWindow._test_login_browser_exports;
                },
                "Test exports to be available",
                5000
            );

            // Access the login service exports from the test window
            LoginServiceExports = testWindow._test_login_service_exports;
            LoginBrowserExports = testWindow._test_login_browser_exports;

            // Store original functions for restoration
            originalOpen = testWindow.open;
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
            if (originalOpen) {
                testWindow.open = originalOpen;
            }

            // Restore all fetch function overrides
            if (originalFetch) {
                if (LoginServiceExports && LoginServiceExports.setFetchFn) {
                    LoginServiceExports.setFetchFn(originalFetch);
                }
                if (LoginBrowserExports && LoginBrowserExports.setFetchFn) {
                    LoginBrowserExports.setFetchFn(originalFetch);
                }
            }

            testWindow = null;
            LoginServiceExports = null;
            LoginBrowserExports = null;
            originalOpen = null;
            originalFetch = null;
            await SpecRunnerUtils.closeTestWindow();
        }, 30000);

        beforeEach(function () {
            // Ensure we start each test in a logged-out state
            // Note: We can't easily reset login state, so tests should handle this
        });

        describe("Browser Login Flow", function () {

            it("should complete browser login flow successfully", async function () {
                // Ensure user starts logged out
                const initialLoginState = LoginServiceExports.LoginService.isLoggedIn();
                if (initialLoginState) {
                    throw new Error("Login browser tests require user to be logged out. Please log out before running these tests.");
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

                // Step 3: Mock successful login response FIRST (using login-browser test exports)
                console.log("llgT: Setting up fetch mock EARLY using login-browser exports");
                console.log("llgT: LoginBrowserExports.setFetchFn available?", !!LoginBrowserExports.setFetchFn);

                if (LoginBrowserExports.setFetchFn) {
                    // Track sign out state for proper mock responses
                    let userSignedOut = false;

                    LoginBrowserExports.setFetchFn((url, options) => {
                        console.log("llgT: login-browser fetchFn called with URL:", url);
                        console.log("llgT: login-browser fetchFn called with options:", options);

                        // Handle different endpoints
                        if (url.includes('/resolveBrowserSession')) {
                            // Login verification endpoint
                            if (userSignedOut) {
                                console.log("llgT: User is signed out, returning 401 for resolveBrowserSession");
                                return Promise.resolve({
                                    ok: false,
                                    status: 401, // Unauthorized - user is logged out
                                    json: () => Promise.resolve({
                                        isSuccess: false
                                    })
                                });
                            } else {
                                console.log("llgT: User is signed in, returning success for resolveBrowserSession");
                                return Promise.resolve({
                                    ok: true,
                                    status: 200,
                                    json: () => Promise.resolve({
                                        isSuccess: true,
                                        email: "test@example.com",
                                        firstName: "Test",
                                        lastName: "User",
                                        customerID: "test-customer-id",
                                        loginTime: Date.now(),
                                        profileIcon: {
                                            initials: "TU",
                                            color: "#14b8a6"
                                        }
                                    })
                                });
                            }
                        } else if (url.includes('/signOut')) {
                            // Logout endpoint - set signed out state
                            console.log("llgT: Handling signOut endpoint call, marking user as signed out");
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
                    console.log("llgT: login-browser fetch mock set up successfully for all endpoints");
                } else {
                    console.log("llgT: LoginBrowserExports.setFetchFn not available!");
                }

                // Step 4: Mock window.open to capture account URL opening
                let capturedURL = null;
                let capturedTarget = null;
                testWindow.open = function(url, target) {
                    capturedURL = url;
                    capturedTarget = target;
                    // Return a mock window object with focus method
                    return {
                        focus: function() {},
                        close: function() {},
                        closed: false
                    };
                };

                // Step 5: Click the sign in button
                console.log("llgT: About to click sign in button");
                signInButton.trigger('click');

                // Verify window.open was called with the account URL
                expect(capturedURL).toBeDefined();
                expect(capturedURL).toContain('phcode.dev'); // Should contain account domain
                expect(capturedTarget).toBe('_blank');

                // Step 6: Wait for login waiting dialog to appear
                await testWindow.__PR.waitForModalDialog(".browser-login-waiting-dialog");

                // Get waiting dialog content
                console.log("llgT: Looking for waiting dialog...");
                let waitingDialog = testWindow.$('.modal');
                if (waitingDialog.length === 0) {
                    // Look for the waiting dialog by its unique button
                    waitingDialog = testWindow.$('[data-button-id="check"]').closest('div');
                }
                console.log("llgT: Waiting dialog found:", waitingDialog.length);
                expect(waitingDialog.length).toBeGreaterThan(0);

                // Verify waiting dialog content
                const checkNowButton = testWindow.$('[data-button-id="check"]');
                expect(checkNowButton.length).toBe(1);
                expect(checkNowButton.text().trim()).toContain('Check Now');

                // Step 7: Click "Check Now" button to verify login (in iframe testWindow)
                // Click the Check Now button
                console.log("llgT: Clicking Check Now button");
                checkNowButton.trigger('click');

                // Wait for login verification to complete and success message
                await awaitsFor(
                    function () {
                        const isLoggedIn = LoginServiceExports.LoginService.isLoggedIn();
                        if (isLoggedIn) {
                            console.log("llgT: User is now logged in!");
                        }
                        return isLoggedIn;
                    },
                    "User to be logged in",
                    5000
                );

                // Verify user is now logged in
                expect(LoginServiceExports.LoginService.isLoggedIn()).toBe(true);

                // Verify profile icon has been updated with user initials
                const $profileIcon = testWindow.$("#user-profile-button");
                const profileIconContent = $profileIcon.html();
                expect(profileIconContent).toContain('svg'); // Should contain SVG element
                expect(profileIconContent).toContain('TU'); // Should contain user initials

                // Step 8: Wait for login dialog to close automatically (or close it manually)
                await awaitsFor(
                    function () {
                        return testWindow.$('.modal:visible').length === 0 &&
                               testWindow.$('[data-button-id="check"]:visible').length === 0;
                    },
                    "Login dialog to close",
                    3000
                );

                // Step 9: Click profile icon again to verify profile popup appears
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

                // Step 10: Test sign out functionality
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
                    10000 // Increase timeout to see if it's just taking longer
                );

                // Verify user is now signed out
                expect(LoginServiceExports.LoginService.isLoggedIn()).toBe(false);

                // Verify profile icon has been updated (should be empty again)
                const $profileIconAfterSignout = testWindow.$("#user-profile-button");
                const profileIconContentAfterSignout = $profileIconAfterSignout.html();
                console.log("llgT: Profile icon after signout:", profileIconContentAfterSignout);

                // Step 11: Verify clicking profile icon again shows login popup (not profile popup)
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
            });
        });
    });
});
