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
            ProDialogsExports,
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
            ProDialogsExports = testWindow._test_pro_dlg_login_exports;

            // Store original functions for restoration
            originalOpenURLInDefaultBrowser = testWindow.Phoenix.app.openURLInDefaultBrowser;
            originalCopyToClipboard = testWindow.Phoenix.app.copyToClipboard;
            originalFetch = testWindow.fetch;

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
            testWindow.Phoenix.app.openURLInDefaultBrowser = originalOpenURLInDefaultBrowser;
            testWindow.Phoenix.app.copyToClipboard = originalCopyToClipboard;

            // Restore all fetch function overrides
            LoginDesktopExports.setFetchFn(originalFetch);
            LoginServiceExports.setFetchFn(originalFetch);
            ProDialogsExports.setFetchFn(originalFetch);

            testWindow = null;
            LoginServiceExports = null;
            LoginDesktopExports = null;
            ProDialogsExports = null;
            originalOpenURLInDefaultBrowser = null;
            originalCopyToClipboard = null;
            originalFetch = null;
            await SpecRunnerUtils.closeTestWindow();
        }, 30000);

        beforeEach(function () {
            // Ensure we start each test in a logged-out state
            // Note: We can't easily reset login state, so tests should handle this
        });

        // Helper functions for desktop login testing
        async function setupTrialState(daysRemaining) {
            const PromotionExports = testWindow._test_promo_login_exports;
            const mockNow = Date.now();
            await PromotionExports._setTrialData({
                proVersion: "3.1.0",
                endDate: mockNow + (daysRemaining * PromotionExports.TRIAL_CONSTANTS.MS_PER_DAY)
            });
            // Trigger entitlements changed event to update branding
            const LoginService = PromotionExports.LoginService;
            LoginService.trigger(LoginService.EVENT_ENTITLEMENTS_CHANGED);
        }

        async function setupExpiredTrial() {
            const PromotionExports = testWindow._test_promo_login_exports;
            const mockNow = Date.now();
            await PromotionExports._setTrialData({
                proVersion: "3.1.0",
                endDate: mockNow - PromotionExports.TRIAL_CONSTANTS.MS_PER_DAY
            });
            // Trigger entitlements changed event to update branding
            const LoginService = PromotionExports.LoginService;
            LoginService.trigger(LoginService.EVENT_ENTITLEMENTS_CHANGED);
        }

        function setupProUserMock(hasActiveSubscription = true) {
            let userSignedOut = false;

            // Set fetch mock on desktop exports
            const fetchMock = (url, options) => {
                console.log("llgT: desktop test fetchFn called with URL:", url);

                if (url.includes('/getAppAuthSession')) {
                    return Promise.resolve({
                        ok: true,
                        status: 200,
                        json: () => Promise.resolve({
                            isSuccess: true,
                            appSessionID: "test-session-123",
                            validationCode: "123456"
                        })
                    });
                } else if (url.includes('/resolveAppSessionID')) {
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
                        apiKey: "test-api-key",
                        validationCode: "123456",
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
                            entitlementsResponse.plan = {
                                paidSubscriber: true,
                                name: "Phoenix Pro",
                                validTill: Date.now() + 30 * 24 * 60 * 60 * 1000
                            };
                            entitlementsResponse.entitlements = {
                                liveEdit: {
                                    activated: true,
                                    validTill: Date.now() + 30 * 24 * 60 * 60 * 1000
                                }
                            };
                        } else {
                            entitlementsResponse.plan = {
                                paidSubscriber: false,
                                name: "Free Plan"
                            };
                        }

                        return Promise.resolve({
                            ok: true,
                            status: 200,
                            json: () => Promise.resolve(entitlementsResponse)
                        });
                    }
                } else if (url.includes('/signOut') || url.includes('/logoutSession')) {
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

            // Apply fetch mock to desktop exports and login service exports
            LoginDesktopExports.setFetchFn(fetchMock);
            LoginServiceExports.setFetchFn(fetchMock);
            ProDialogsExports.setFetchFn(fetchMock);
        }

        async function verifyProBranding(shouldShowPro, testDescription) {
            const $brandingLink = testWindow.$("#phcode-io-main-nav");
            console.log(`llgT: Desktop verifying branding for ${testDescription}, shouldShowPro: ${shouldShowPro}`);
            console.log(`llgT: Desktop branding link classes: ${$brandingLink.attr('class')}`);
            console.log(`llgT: Desktop branding link text: '${$brandingLink.text()}'`);

            if (shouldShowPro) {
                await awaitsFor(
                    function () {
                        return testWindow.$("#phcode-io-main-nav").hasClass("phoenix-pro");
                    },
                    `Verify Pro branding to appear: ${testDescription}`, 5000
                );
                expect($brandingLink.hasClass("phoenix-pro")).toBe(true);
                expect($brandingLink.text()).toContain("Phoenix Pro");
                expect($brandingLink.find(".fa-feather").length).toBe(1);
            } else {
                await awaitsFor(
                    function () {
                        return !testWindow.$("#phcode-io-main-nav").hasClass("phoenix-pro");
                    },
                    `Verify Pro branding to go away: ${testDescription}`, 5000
                );
                expect($brandingLink.hasClass("phoenix-pro")).toBe(false);
                expect($brandingLink.text()).toBe("phcode.io");
            }
        }

        const VIEW_TRIAL_DAYS_LEFT = "VIEW_TRIAL_DAYS_LEFT";
        const VIEW_PHOENIX_PRO = "VIEW_PHOENIX_PRO";
        const VIEW_PHOENIX_FREE = "VIEW_PHOENIX_FREE";
        async function verifyProfilePopupContent(expectedView, testDescription) {
            await awaitsFor(
                function () {
                    return testWindow.$('.profile-popup').length > 0;
                },
                `Profile popup to appear: ${testDescription}`,
                3000
            );

            if (expectedView === VIEW_PHOENIX_PRO) {
                await awaitsFor(
                    function () {
                        const $popup = testWindow.$('.profile-popup');
                        const $planName = $popup.find('.user-plan-name');
                        const planText = $planName.text();
                        return planText.includes("Phoenix Pro");
                    },
                    `Profile popup should say phoenix pro: ${testDescription}`, 5000
                );
                const $popup = testWindow.$('.profile-popup');
                const $planName = $popup.find('.user-plan-name');
                const planText = $planName.text();
                expect(planText).toContain("Phoenix Pro");
                expect(planText).not.toContain("days left");
                expect($popup.find(".fa-feather").length).toBe(1);
            } else if (expectedView === VIEW_TRIAL_DAYS_LEFT) {
                await awaitsFor(
                    function () {
                        const $popup = testWindow.$('.profile-popup');
                        const $planName = $popup.find('.user-plan-name');
                        const planText = $planName.text();
                        return planText.includes("Phoenix Pro") && planText.includes("days left");
                    },
                    `Profile popup should say phoenix pro trial: ${testDescription}`, 5000
                );
                const $popup = testWindow.$('.profile-popup');
                const $planName = $popup.find('.user-plan-name');
                const planText = $planName.text();
                expect(planText).toContain("Phoenix Pro");
                expect(planText).toContain("days left");
                expect($popup.find(".fa-feather").length).toBe(1);
            } else {
                await awaitsFor(
                    function () {
                        const $popup = testWindow.$('.profile-popup');
                        const $planName = $popup.find('.user-plan-name');
                        const planText = $planName.text();
                        return !planText.includes("Phoenix Pro");
                    },
                    `Profile popup should not say phoenix pro: ${testDescription}`, 5000
                );
                const $popup = testWindow.$('.profile-popup');
                const $planName = $popup.find('.user-plan-name');
                const planText = $planName.text();
                expect(planText).not.toContain("Phoenix Pro");
                expect($popup.find(".fa-feather").length).toBe(0);
            }
        }

        async function cleanupTrialState() {
            const PromotionExports = testWindow._test_promo_login_exports;
            await PromotionExports._cleanTrialData();
        }

        const SIGNIN_POPUP = "SIGNIN_POPUP";
        const PROFILE_POPUP = "PROFILE_POPUP";
        async function popupToAppear(popupType = SIGNIN_POPUP) {
            const statusText = popupType === SIGNIN_POPUP ?
                "Sign In popup to appear" : "Profile popup to appear";
            await awaitsFor(
                function () {
                    const selector = popupType === SIGNIN_POPUP ? ".login-profile-popup" : ".user-profile-popup";
                    return testWindow.$('.modal').length > 0 || testWindow.$(selector).length > 0;
                },
                statusText, 3000
            );
        }

        async function performFullLoginFlow() {
            // Mock desktop app functions for login flow
            testWindow.Phoenix.app.openURLInDefaultBrowser = function(url) {
                return true;
            };
            testWindow.Phoenix.app.copyToClipboard = function(text) {
                return true;
            };

            // Click profile button
            const $profileButton = testWindow.$("#user-profile-button");
            $profileButton.trigger('click');
            await popupToAppear(SIGNIN_POPUP);

            // Find and click sign in button
            let popupContent = testWindow.$('.profile-popup');
            const signInButton = popupContent.find('#phoenix-signin-btn');
            signInButton.trigger('click');

            // Wait for desktop login dialog
            await testWindow.__PR.waitForModalDialog(".modal");

            // Click refresh button to verify login
            const refreshButton = testWindow.$('.modal').find('[data-button-id="refresh"]');
            refreshButton.trigger('click');

            // Wait for login to complete
            await awaitsFor(
                function () {
                    return LoginServiceExports.LoginService.isLoggedIn();
                },
                "User to be logged in",
                5000
            );

            // Wait for login dialog to close
            await testWindow.__PR.waitForModalDialogClosed(".modal");

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

        async function performFullLogoutFlow() {
            // Click profile button to open popup
            const $profileButton = testWindow.$("#user-profile-button");
            $profileButton.trigger('click');

            // Wait for profile popup
            await popupToAppear(PROFILE_POPUP);

            // Find and click sign out button
            let popupContent = testWindow.$('.profile-popup');
            const signOutButton = popupContent.find('#phoenix-signout-btn');
            signOutButton.trigger('click');

            // Wait for sign out confirmation dialog and dismiss it
            await testWindow.__PR.waitForModalDialog(".modal");
            testWindow.__PR.clickDialogButtonID(testWindow.__PR.Dialogs.DIALOG_BTN_OK);
            await testWindow.__PR.waitForModalDialogClosed(".modal");

            // Wait for sign out to complete
            await awaitsFor(
                function () {
                    return !LoginServiceExports.LoginService.isLoggedIn();
                },
                "User to be signed out",
                10000
            );
            verifyProfileIconBlanked();
        }

        function verifyProfileIconBlanked() {
            const $profileIcon = testWindow.$("#user-profile-button");
            const initialContent = $profileIcon.html();
            expect(initialContent).not.toContain('TU');
        }

        describe("Desktop Login and Promotion Tests", function () {

            beforeEach(async function () {
                // Ensure clean state before each test
                if (LoginServiceExports.LoginService.isLoggedIn()) {
                    await performFullLogoutFlow();
                }
                if (LoginServiceExports.LoginService.isLoggedIn()) {
                    throw new Error("Promotion tests require user to be logged out at start." +
                        " Please log out before running these tests.");
                }
                await cleanupTrialState();
            });

            it("should complete login and logout flow", async function () {
                // Setup basic user mock
                setupProUserMock(false);

                // Perform full login flow
                await performFullLoginFlow();
                expect(LoginServiceExports.LoginService.isLoggedIn()).toBe(true);

                // Perform full logout flow
                await performFullLogoutFlow();
                expect(LoginServiceExports.LoginService.isLoggedIn()).toBe(false);
                verifyProfileIconBlanked();
            });

            it("should open browser and copy validation code", async function () {
                // Setup basic user mock
                setupProUserMock(false);

                // Mock desktop app functions
                let capturedBrowserURL = null;
                let capturedClipboardText = null;

                if (testWindow.Phoenix && testWindow.Phoenix.app) {
                    testWindow.Phoenix.app.openURLInDefaultBrowser = function(url) {
                        capturedBrowserURL = url;
                        return true;
                    };
                    testWindow.Phoenix.app.copyToClipboard = function(text) {
                        capturedClipboardText = text;
                        return true;
                    };
                }

                // Click profile button and sign in
                const $profileButton = testWindow.$("#user-profile-button");
                $profileButton.trigger('click');
                await popupToAppear(SIGNIN_POPUP);

                const popupContent = testWindow.$('.profile-popup');
                const signInButton = popupContent.find('#phoenix-signin-btn');
                signInButton.trigger('click');

                // Wait for desktop login dialog
                await testWindow.__PR.waitForModalDialog(".modal");

                // Test copy functionality
                const copyButton = testWindow.$('.modal').find('[data-button-id="copy"]');
                copyButton.trigger('click');
                expect(capturedClipboardText).toBe("123456");

                // Test open browser functionality
                const openBrowserButton = testWindow.$('.modal').find('[data-button-id="open"]');
                openBrowserButton.trigger('click');
                expect(capturedBrowserURL).toBeDefined();
                expect(capturedBrowserURL).toContain('authorizeApp');
                expect(capturedBrowserURL).toContain('test-session-123');
            });

            it("should update profile icon after login", async function () {
                // Setup basic user mock
                setupProUserMock(false);

                // Verify initial state
                const $profileIcon = testWindow.$("#user-profile-button");
                const initialContent = $profileIcon.html();
                expect(initialContent).not.toContain('TU');

                // Perform login
                await performFullLoginFlow();

                // Wait for profile icon to update
                await awaitsFor(
                    function () {
                        const $profileIcon = testWindow.$("#user-profile-button");
                        const profileIconContent = $profileIcon.html();
                        return profileIconContent && profileIconContent.includes('TU');
                    },
                    "profile icon to contain user initials",
                    5000
                );

                // Verify profile icon updated with user initials
                const updatedContent = $profileIcon.html();
                expect(updatedContent).toContain('svg');
                expect(updatedContent).toContain('TU');

                // Logout for cleanup
                await performFullLogoutFlow();
            });

            it("should show correct popup states", async function () {
                // Setup basic user mock
                setupProUserMock(false);

                const $profileButton = testWindow.$("#user-profile-button");

                // Test initial state - should show signin popup
                $profileButton.trigger('click');
                await popupToAppear(SIGNIN_POPUP);

                let popupContent = testWindow.$('.profile-popup');
                const signInButton = popupContent.find('#phoenix-signin-btn');
                const signOutButton = popupContent.find('#phoenix-signout-btn');

                expect(signInButton.length).toBe(1);
                expect(signOutButton.length).toBe(0);

                // Close popup
                $profileButton.trigger('click');

                // Perform login
                await performFullLoginFlow();

                // Test logged in state - should show profile popup
                $profileButton.trigger('click');
                await popupToAppear(PROFILE_POPUP);

                popupContent = testWindow.$('.profile-popup');
                const newSignInButton = popupContent.find('#phoenix-signin-btn');
                const newSignOutButton = popupContent.find('#phoenix-signout-btn');

                expect(newSignInButton.length).toBe(0);
                expect(newSignOutButton.length).toBe(1);

                // Close popup and logout for cleanup
                $profileButton.trigger('click');
                await performFullLogoutFlow();

                // Test final state - should be back to signin popup
                $profileButton.trigger('click');
                await popupToAppear(SIGNIN_POPUP);

                popupContent = testWindow.$('.profile-popup');
                const finalSignInButton = popupContent.find('#phoenix-signin-btn');
                const finalSignOutButton = popupContent.find('#phoenix-signout-btn');

                expect(finalSignInButton.length).toBe(1);
                expect(finalSignOutButton.length).toBe(0);

                // Close popup
                $profileButton.trigger('click');
            });

            it("should show pro branding for user with pro subscription (expired trial)", async function () {
                console.log("llgT: Starting desktop pro user with expired trial test");

                // Setup: Pro subscription + expired trial
                setupProUserMock(true);
                await setupExpiredTrial();

                // Verify initial state (no pro branding)
                await verifyProBranding(false, "no pro branding to start with");

                // Perform login
                await performFullLoginFlow();
                await verifyProBranding(true, "pro branding to appear after pro user login");

                // Check profile popup shows pro status (not trial)
                const $profileButton = testWindow.$("#user-profile-button");
                $profileButton.trigger('click');

                // Wait for profile popup to show "phoenix pro <leaf>"
                await verifyProfilePopupContent(VIEW_PHOENIX_PRO, "pro user profile popup");

                // Close popup
                $profileButton.trigger('click');

                // Perform logout
                await performFullLogoutFlow();

                // For user with pro subscription + expired trial:
                // After logout, pro branding should disappear because:
                // 1. No server entitlements (logged out)
                // 2. Trial is expired (0 days remaining)
                await verifyProBranding(false, "Pro branding to disappear after logout");
            });

            it("should show trial branding for user without pro subscription (active trial)", async function () {
                console.log("llgT: Starting desktop trial user test");

                // Setup: No pro subscription + active trial (15 days)
                setupProUserMock(false);
                await setupTrialState(15);

                // Verify initial state shows pro branding due to trial
                await verifyProBranding(true, "Trial branding to appear initially");

                // Perform login
                await performFullLoginFlow();

                // Verify pro branding remains after login
                await verifyProBranding(true, "after trial user login");

                // Check profile popup shows trial status
                const $profileButton = testWindow.$("#user-profile-button");
                $profileButton.trigger('click');
                await popupToAppear(PROFILE_POPUP);
                await verifyProfilePopupContent(VIEW_TRIAL_DAYS_LEFT,
                    "trial user profile popup for logged in user");

                // Close popup
                $profileButton.trigger('click');

                // Perform logout
                await performFullLogoutFlow();

                // Verify pro branding remains after logout (trial continues)
                await verifyProBranding(true, "Trial branding to remain after logout");

                // Check profile popup still shows trial status
                $profileButton.trigger('click');
                await popupToAppear(SIGNIN_POPUP);
                await verifyProfilePopupContent(VIEW_TRIAL_DAYS_LEFT,
                    "trial user profile popup for logged out user");

                // Close popup
                $profileButton.trigger('click');
            });

            it("should prioritize pro subscription over trial in profile popup", async function () {
                console.log("llgT: Starting desktop trial user with pro subscription test");

                // Setup: Pro subscription + active trial
                setupProUserMock(true);
                await setupTrialState(10);

                // Perform login
                await performFullLoginFlow();

                // Verify pro branding appears
                await verifyProBranding(true, "Pro branding to appear for pro user");

                // Check profile popup shows pro status (not trial text)
                const $profileButton = testWindow.$("#user-profile-button");
                $profileButton.trigger('click');
                await popupToAppear(PROFILE_POPUP);

                // Should show pro, not trial, since user has paid subscription
                await verifyProfilePopupContent(VIEW_PHOENIX_PRO,
                    "pro+trial user profile should not show trial branding");

                // Close popup
                $profileButton.trigger('click');

                // Perform logout
                await performFullLogoutFlow();

                // Verify pro branding remains due to trial (even though subscription is gone)
                await verifyProBranding(true, "Pro branding should remain after logout as trial user");
                $profileButton.trigger('click');
                await popupToAppear(SIGNIN_POPUP);
                await verifyProfilePopupContent(VIEW_TRIAL_DAYS_LEFT,
                    "trial user profile popup for logged out user");
            });
        });
    });
});
