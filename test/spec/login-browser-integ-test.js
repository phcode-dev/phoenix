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
    const LoginShared = require("./login-shared");

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
            ProDialogsExports,
            EntitlementsExports,
            originalOpen,
            originalFetch;

        let setupTrialState,
            setupExpiredTrial,
            verifyProBranding,
            verifyProfilePopupContent,
            cleanupTrialState,
            popupToAppear,
            performFullLogoutFlow,
            verifyProfileIconBlanked,
            VIEW_TRIAL_DAYS_LEFT,
            VIEW_PHOENIX_PRO,
            VIEW_PHOENIX_FREE,
            SIGNIN_POPUP,
            PROFILE_POPUP;

        beforeAll(async function () {
            testWindow = await SpecRunnerUtils.createTestWindowAndRun();

            // Wait for test exports to be available (KernalModeTrust is sandboxed, use test exports)
            await awaitsFor(
                function () {
                    return testWindow._test_login_service_exports &&
                           testWindow._test_login_browser_exports &&
                           testWindow._test_pro_dlg_login_exports &&
                           testWindow._test_entitlements_exports;
                },
                "Test exports to be available",
                5000
            );

            // Access the login service exports from the test window
            LoginServiceExports = testWindow._test_login_service_exports;
            LoginBrowserExports = testWindow._test_login_browser_exports;
            ProDialogsExports = testWindow._test_pro_dlg_login_exports;
            EntitlementsExports = testWindow._test_entitlements_exports;

            // Store original functions for restoration
            originalOpen = testWindow.open;
            originalFetch = testWindow.fetch;

            // Wait for profile menu to be initialized
            await awaitsFor(
                function () {
                    return testWindow.$("#user-profile-button").length > 0;
                },
                "Profile button to be available",
                3000
            );
            LoginShared.setup(testWindow, LoginServiceExports, setupProUserMock, performFullLoginFlow,
                EntitlementsExports);
            VIEW_TRIAL_DAYS_LEFT = LoginShared.VIEW_TRIAL_DAYS_LEFT;
            VIEW_PHOENIX_PRO = LoginShared.VIEW_PHOENIX_PRO;
            VIEW_PHOENIX_FREE = LoginShared.VIEW_PHOENIX_FREE;
            SIGNIN_POPUP = LoginShared.SIGNIN_POPUP;
            PROFILE_POPUP = LoginShared.PROFILE_POPUP;
            setupTrialState = LoginShared.setupTrialState;
            setupExpiredTrial = LoginShared.setupExpiredTrial;
            verifyProBranding = LoginShared.verifyProBranding;
            verifyProfilePopupContent = LoginShared.verifyProfilePopupContent;
            cleanupTrialState = LoginShared.cleanupTrialState;
            popupToAppear = LoginShared.popupToAppear;
            performFullLogoutFlow = LoginShared.performFullLogoutFlow;
            verifyProfileIconBlanked = LoginShared.verifyProfileIconBlanked;
        }, 30000);

        afterAll(async function () {
            // Restore original functions
            testWindow.open = originalOpen;

            // Restore all fetch function overrides
            LoginServiceExports.setFetchFn(originalFetch);
            LoginBrowserExports.setFetchFn(originalFetch);
            ProDialogsExports.setFetchFn(originalFetch);

            testWindow = null;
            LoginServiceExports = null;
            LoginBrowserExports = null;
            ProDialogsExports = null;
            originalOpen = null;
            originalFetch = null;
            await SpecRunnerUtils.closeTestWindow();
        }, 30000);

        beforeEach(function () {
            // Ensure we start each test in a logged-out state
            // Note: We can't easily reset login state, so tests should handle this
        });

        function setupProUserMock(hasActiveSubscription = true, expiredEntitlements = false) {
            let userSignedOut = false;

            // Set fetch mock on both browser and service exports
            const fetchMock = (url, options) => {
                console.log("llgT: browser promo test fetchFn called with URL:", url);

                if (url.includes('/resolveBrowserSession')) {
                    if (userSignedOut) {
                        return Promise.resolve({
                            ok: false,
                            status: 401,
                            json: () => Promise.resolve({ isSuccess: false })
                        });
                    }
                    const response = {
                        isSuccess: true,
                        email: "prouser@example.com",
                        firstName: "Pro",
                        lastName: "User",
                        customerID: "test-customer-id",
                        loginTime: Date.now(),
                        profileIcon: {
                            initials: "TU",
                            color: "#14b8a6"
                        }
                    };
                    return Promise.resolve({
                        ok: true,
                        status: 200,
                        json: () => Promise.resolve(response)
                    });
                } else if (url.includes('/getAppEntitlements')) {
                    // Entitlements endpoint - return user's plan and entitlements
                    console.log("llgT: Handling getAppEntitlements call");
                    if (userSignedOut) {
                        return Promise.resolve({
                            ok: false,
                            status: 401,
                            json: () => Promise.resolve({ isSuccess: false })
                        });
                    } else {
                        const entitlementsResponse = {
                            isSuccess: true,
                            lang: "en"
                        };

                        if (hasActiveSubscription) {
                            const validTill = expiredEntitlements ?
                                Date.now() - 86400000 : // expired yesterday
                                Date.now() + 30 * 24 * 60 * 60 * 1000; // valid for 30 days

                            entitlementsResponse.plan = {
                                isSubscriber: true,
                                paidSubscriber: true,
                                name: "Phoenix Pro",
                                fullName: "Phoenix Pro",
                                validTill: validTill
                            };
                            entitlementsResponse.entitlements = {
                                liveEdit: {
                                    activated: true,
                                    validTill: validTill
                                }
                            };
                        } else {
                            entitlementsResponse.plan = {
                                isSubscriber: false,
                                paidSubscriber: false,
                                name: "Free Plan",
                                fullName: "Free Plan"
                            };
                        }

                        return Promise.resolve({
                            ok: true,
                            status: 200,
                            json: () => Promise.resolve(entitlementsResponse)
                        });
                    }
                } else if (url.includes('/signOut')) {
                    userSignedOut = true;
                    return Promise.resolve({
                        ok: true,
                        status: 200,
                        json: () => Promise.resolve({ isSuccess: true })
                    });
                } else {
                    return Promise.resolve({
                        ok: true,
                        status: 200,
                        json: () => Promise.resolve({ isSuccess: true })
                    });
                }
            };

            // Apply fetch mock to both browser exports and login service exports
            LoginBrowserExports.setFetchFn(fetchMock);
            LoginServiceExports.setFetchFn(fetchMock);
            ProDialogsExports.setFetchFn(fetchMock);
        }

        async function performFullLoginFlow() {
            // Mock window.open like the original test
            let capturedURL = null;
            let capturedTarget = null;
            testWindow.open = function(url, target) {
                capturedURL = url;
                capturedTarget = target;
                return {
                    focus: function() {},
                    close: function() {},
                    closed: false
                };
            };

            // Click profile button
            const $profileButton = testWindow.$("#user-profile-button");
            $profileButton.trigger('click');
            await popupToAppear(SIGNIN_POPUP);

            // Find and click sign in button
            let popupContent = testWindow.$('.profile-popup');
            const signInButton = popupContent.find('#phoenix-signin-btn');
            signInButton.trigger('click');

            // Verify window.open was called
            expect(capturedURL).toBeDefined();
            expect(capturedURL).toContain('phcode.dev');
            expect(capturedTarget).toBe('_blank');

            // Wait for browser login waiting dialog
            await testWindow.__PR.waitForModalDialog(".browser-login-waiting-dialog");

            // Click "Check Now" button to verify login
            const checkNowButton = testWindow.$('[data-button-id="check"]');
            checkNowButton.trigger('click');

            // Wait for login to complete
            await awaitsFor(
                function () {
                    return LoginServiceExports.LoginService.isLoggedIn();
                },
                "User to be logged in",
                5000
            );

            // Wait for login dialog to close
            await testWindow.__PR.waitForModalDialogClosed(".modal", "Login waiting dialog");

            // Wait for profile icon to update with user data
            await awaitsFor(
                function () {
                    const $profileIcon = testWindow.$("#user-profile-button");
                    const profileIconContent = $profileIcon.html();
                    return profileIconContent && profileIconContent.includes('TU');
                },
                "profile icon to update with user initials",
                3000
            );
        }

        describe("Browser Login Tests", function () {

            beforeEach(async function () {
                // Ensure clean state before each test
                if (LoginServiceExports.LoginService.isLoggedIn()) {
                    throw new Error("browser login tests require user to be logged out at start. Please log out before running these tests.");
                }
                await cleanupTrialState();
            });

            LoginShared.setupSharedTests();
        });
    });
});
