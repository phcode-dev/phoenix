
/*global expect, it, awaitsFor*/

define(function (require, exports, module) {
    let testWindow, LoginServiceExports, setupProUserMock, performFullLoginFlow, EntitlementsExports;

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

    async function verifyProBranding(shouldShowPro, testDescription) {
        const $brandingLink = testWindow.$("#phcode-io-main-nav");

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

    function verifyProfileIconBlanked() {
        const $profileIcon = testWindow.$("#user-profile-button");
        const initialContent = $profileIcon.html();
        expect(initialContent).not.toContain('TU');
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

    // Entitlements test utility functions
    // Note: EntitlementsExports.getPlanDetails() is eventually consistent due to
    // 1 second debounce delay for entitlements changed event
    async function verifyPlanEntitlements(expectedPlan, _testDescription) {
        // Wait for plan details to match expected values (handles debounce delay)
        let planDetails;
        await awaitsFor(
            async function () {
                planDetails = await EntitlementsExports.getPlanDetails();

                if (!expectedPlan) {
                    return planDetails !== undefined; // Should always return something (fallback)
                }

                if (!planDetails) {
                    return false;
                }

                // Check all expected properties match
                if (expectedPlan.isSubscriber !== undefined &&
                    planDetails.isSubscriber !== expectedPlan.isSubscriber) {
                    return false;
                }
                if (expectedPlan.name && planDetails.name !== expectedPlan.name) {
                    return false;
                }
                if (expectedPlan.validTill !== undefined && !planDetails.validTill) {
                    return false;
                }

                return true;
            },
            ()=>{
                return `Plan entitlements ${JSON.stringify(planDetails)} to match expected ${
                    JSON.stringify(expectedPlan)}: ${_testDescription}`;
            },
            4000,
            30
        );

        // Final assertions after condition is met
        const finalPlanDetails = await EntitlementsExports.getPlanDetails();
        if (expectedPlan) {
            expect(finalPlanDetails).toBeDefined();
            if (expectedPlan.isSubscriber !== undefined) {
                expect(finalPlanDetails.isSubscriber).toBe(expectedPlan.isSubscriber);
            }
            if (expectedPlan.paidSubscriber !== undefined) {
                expect(finalPlanDetails.paidSubscriber).toBe(expectedPlan.paidSubscriber);
            }
            if (expectedPlan.name) {
                expect(finalPlanDetails.name).toBe(expectedPlan.name);
            }
            if (expectedPlan.validTill !== undefined) {
                expect(finalPlanDetails.validTill).toBeDefined();
            }
        } else {
            expect(finalPlanDetails).toBeDefined(); // Should always return something (fallback)
        }
    }

    async function verifyIsInProTrialEntitlement(expected, _testDescription) {
        const isInTrial = await EntitlementsExports.isInProTrial();
        expect(isInTrial).toBe(expected);
    }

    async function verifyTrialRemainingDaysEntitlement(expected, _testDescription) {
        const remainingDays = await EntitlementsExports.getTrialRemainingDays();
        if (typeof expected === 'number') {
            expect(remainingDays).toBe(expected);
        } else {
            expect(remainingDays).toBeGreaterThanOrEqual(0);
        }
    }

    async function verifyIsPaidSubscriber(expected, _testDescription) {
        const isPaidSub = await EntitlementsExports.isPaidSubscriber();
        expect(isPaidSub).toBe(expected);
    }

    async function verifyRawEntitlements(expected, _testDescription) {
        const rawEntitlements = await EntitlementsExports.getRawEntitlements();

        if (expected === null) {
            expect(rawEntitlements).toBeNull();
        } else if (expected) {
            expect(rawEntitlements).toBeDefined();
            if (expected.plan) {
                expect(rawEntitlements.plan).toBeDefined();
            }
            if (expected.entitlements) {
                expect(rawEntitlements.entitlements).toBeDefined();
            }
        }
    }

    async function verifyLiveEditEntitlement(expected, _testDescription) {
        const liveEditEntitlement = await EntitlementsExports.getLiveEditEntitlement();

        expect(liveEditEntitlement).toBeDefined();
        expect(liveEditEntitlement.activated).toBe(expected.activated);

        if (expected.subscribeURL) {
            expect(liveEditEntitlement.subscribeURL).toBe(expected.subscribeURL);
        }
        if (expected.upgradeToPlan) {
            expect(liveEditEntitlement.upgradeToPlan).toBe(expected.upgradeToPlan);
        }
    }

    function setup(_testWindow, _LoginServiceExports, _setupProUserMock, _performFullLoginFlow, _EntitlementsExports) {
        testWindow = _testWindow;
        LoginServiceExports = _LoginServiceExports;
        setupProUserMock = _setupProUserMock;
        performFullLoginFlow = _performFullLoginFlow;
        EntitlementsExports = _EntitlementsExports;
    }

    function setupSharedTests() {

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

        it("should update profile icon after login", async function () {
            // Setup basic user mock
            setupProUserMock(false);

            // Verify initial state
            verifyProfileIconBlanked();

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
            const $profileIcon = testWindow.$("#user-profile-button");
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
            console.log("llgT: Starting pro user with expired trial test");

            // Setup: Pro subscription + expired trial
            setupProUserMock(true);
            await setupExpiredTrial();

            // Verify initial state (no pro branding)
            await verifyProBranding(false, "no pro branding to start with");

            // Verify entitlements API consistency for logged out state
            await verifyIsInProTrialEntitlement(false, "no trial for logged out user with expired trial");
            await verifyTrialRemainingDaysEntitlement(0, "no trial days remaining");
            await verifyIsPaidSubscriber(false, "logged out user should not be a paid subscriber");

            // Perform login
            await performFullLoginFlow();
            await verifyProBranding(true, "pro branding to appear after pro user login");

            // Verify entitlements API consistency for logged in pro user
            await verifyIsInProTrialEntitlement(false, "pro user should not be in trial");
            await verifyPlanEntitlements({ isSubscriber: true, paidSubscriber: true }, "pro user should have paid subscriber plan");
            await verifyIsPaidSubscriber(true, "pro user should be a paid subscriber");

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

            // Verify entitlements API consistency after logout
            await verifyRawEntitlements(null, "no raw entitlements when logged out");
            await verifyIsInProTrialEntitlement(false, "no trial after logout");
            await verifyIsPaidSubscriber(false, "logged out pro user should not be a paid subscriber (no server entitlements)");
        });

        it("should show trial branding for user without pro subscription (active trial)", async function () {
            console.log("llgT: Starting trial user test");

            // Setup: No pro subscription + active trial (15 days)
            setupProUserMock(false);
            await setupTrialState(15);

            // Verify initial state shows pro branding due to trial
            await verifyProBranding(true, "Trial branding to appear initially");

            // Verify entitlements API consistency for trial user before login
            await verifyIsInProTrialEntitlement(true, "user should be in trial initially");
            await verifyTrialRemainingDaysEntitlement(15, "should have 15 trial days remaining");
            await verifyLiveEditEntitlement({ activated: true }, "live edit should be active during trial");

            // Perform login
            await performFullLoginFlow();

            // Verify pro branding remains after login
            await verifyProBranding(true, "after trial user login");

            // Verify entitlements API consistency for logged in trial user
            await verifyIsInProTrialEntitlement(true, "user should still be in trial after login");
            await verifyPlanEntitlements({ isSubscriber: true, paidSubscriber: false }, "trial user should have isSubscriber true but paidSubscriber false");
            await verifyIsPaidSubscriber(false, "trial user should not be a paid subscriber");

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

            // Verify entitlements API consistency after logout (trial still active)
            await verifyIsInProTrialEntitlement(true, "trial should persist after logout");
            await verifyRawEntitlements(null, "no raw entitlements when logged out");
            await verifyIsPaidSubscriber(false, "logged out trial user should not be a paid subscriber");

            // Check profile popup still shows trial status
            $profileButton.trigger('click');
            await popupToAppear(SIGNIN_POPUP);
            await verifyProfilePopupContent(VIEW_TRIAL_DAYS_LEFT,
                "trial user profile popup for logged out user");

            // Close popup
            $profileButton.trigger('click');
        });

        it("should prioritize pro subscription over trial in profile popup", async function () {
            console.log("llgT: Starting trial user with pro subscription test");

            // Setup: Pro subscription + active trial
            setupProUserMock(true);
            await setupTrialState(10);

            // Perform login
            await performFullLoginFlow();

            // Verify pro branding appears
            await verifyProBranding(true, "Pro branding to appear for pro user");

            // Verify entitlements API consistency for logged in pro user with trial
            await verifyIsPaidSubscriber(true, "pro user with trial should be a paid subscriber");

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
            await verifyIsPaidSubscriber(false, "logged out user should not be a paid subscriber (no server entitlements)");
            $profileButton.trigger('click');
            await popupToAppear(SIGNIN_POPUP);
            await verifyProfilePopupContent(VIEW_TRIAL_DAYS_LEFT,
                "trial user profile popup for logged out user");

            // Close popup
            $profileButton.trigger('click');
        });

        it("should show free branding for user without pro subscription (expired trial)", async function () {
            console.log("llgT: Starting desktop trial user test");

            // Setup: No pro subscription + expired trial
            setupProUserMock(false);
            await setupExpiredTrial();

            // Verify initial state (no pro branding)
            await verifyProBranding(false, "no pro branding to start with");

            // Verify entitlements API consistency for logged out user with expired trial
            await verifyPlanEntitlements({ isSubscriber: false, paidSubscriber: false, name: testWindow.Strings.USER_FREE_PLAN_NAME_DO_NOT_TRANSLATE },
                "free plan for logged out user with expired trial");
            await verifyIsInProTrialEntitlement(false, "no trial for user with expired trial");
            await verifyTrialRemainingDaysEntitlement(0, "no trial days remaining for expired trial");
            await verifyLiveEditEntitlement({ activated: false }, "live edit deactivated for expired trial");
            await verifyIsPaidSubscriber(false, "logged out free user should not be a paid subscriber");

            // Perform login
            await performFullLoginFlow();

            // Verify pro branding remains after login
            await verifyProBranding(false, "after trial free user login");

            // Verify entitlements API consistency for logged in free user
            await verifyPlanEntitlements({ isSubscriber: false, paidSubscriber: false, name: testWindow.Strings.USER_FREE_PLAN_NAME_DO_NOT_TRANSLATE },
                "free plan for logged in user with expired trial");
            await verifyIsInProTrialEntitlement(false, "still no trial after login");
            await verifyLiveEditEntitlement({ activated: false }, "live edit still deactivated after login");
            await verifyIsPaidSubscriber(false, "logged in free user should not be a paid subscriber");

            // Check profile popup shows free plan status
            const $profileButton = testWindow.$("#user-profile-button");
            $profileButton.trigger('click');
            await popupToAppear(PROFILE_POPUP);
            await verifyProfilePopupContent(VIEW_PHOENIX_FREE,
                "free plan user profile popup for logged in user");

            // Close popup
            $profileButton.trigger('click');

            // Perform logout
            await performFullLogoutFlow();

            // Verify pro branding remains after logout (trial continues)
            await verifyProBranding(false, "Trial branding to remain after logout");

            // Verify entitlements API consistency after logout
            await verifyRawEntitlements(null, "no raw entitlements when logged out");
            await verifyIsInProTrialEntitlement(false, "no trial after logout");
            await verifyIsPaidSubscriber(false, "logged out free user should not be a paid subscriber");

            // Check profile popup still shows free plan status as trial expired
            $profileButton.trigger('click');
            await popupToAppear(SIGNIN_POPUP);
            // not logged in user, we wont show free plan tag as base editor is always free.
            expect(testWindow.$(`.profile-popup .trial-plan-info`).length).toBe(0);

            // Close popup
            $profileButton.trigger('click');
        });

        it("should show free user popup when entitlements are expired (no trial)", async function () {
            console.log("llgT: Starting expired entitlements without trial test");

            // Setup: Expired pro subscription + no trial
            setupProUserMock(true, true);
            await cleanupTrialState(); // Ensure no trial is active

            // Verify initial state (no pro branding due to expired entitlements)
            await verifyProBranding(false, "no pro branding initially due to expired entitlements");

            // Verify entitlements API consistency for logged out user with no trial
            await verifyPlanEntitlements({ isSubscriber: false, paidSubscriber: false, name: testWindow.Strings.USER_FREE_PLAN_NAME_DO_NOT_TRANSLATE },
                "free plan for logged out user with no trial");
            await verifyIsInProTrialEntitlement(false, "no trial for logged out user");
            await verifyTrialRemainingDaysEntitlement(0, "no trial days remaining");
            await verifyRawEntitlements(null, "no raw entitlements when logged out");
            await verifyLiveEditEntitlement({ activated: false }, "live edit deactivated with no trial");
            await verifyIsPaidSubscriber(false, "logged out user with expired entitlements should not be a paid subscriber");

            // Perform login
            await performFullLoginFlow();

            // Verify pro branding remains false after login (expired entitlements filtered to free)
            await verifyProBranding(false, "no pro branding after login with expired entitlements");

            // Verify entitlements API consistency for logged in user with expired entitlements
            await verifyPlanEntitlements({ isSubscriber: false, paidSubscriber: false },
                "expired entitlements filtered to free plan after login");
            await verifyIsInProTrialEntitlement(false, "no trial for user with expired entitlements");
            await verifyTrialRemainingDaysEntitlement(0, "no trial days for expired entitlements user");
            await verifyLiveEditEntitlement({
                activated: false,
                subscribeURL: testWindow.brackets.config.purchase_url,
                upgradeToPlan: testWindow.brackets.config.main_pro_plan
            }, "live edit deactivated with fallback URLs for expired entitlements");
            await verifyIsPaidSubscriber(false, "logged in user with expired entitlements should not be a paid subscriber");

            // Check profile popup shows free plan status
            const $profileButton = testWindow.$("#user-profile-button");
            $profileButton.trigger('click');
            await popupToAppear(PROFILE_POPUP);
            await verifyProfilePopupContent(VIEW_PHOENIX_FREE,
                "free plan user profile popup for user with expired entitlements");

            // Close popup
            $profileButton.trigger('click');

            // Perform logout
            await performFullLogoutFlow();

            // Verify pro branding remains false after logout
            await verifyProBranding(false, "no pro branding after logout with expired entitlements");

            // Verify entitlements API consistency after logout
            await verifyRawEntitlements(null, "no raw entitlements when logged out");
            await verifyIsInProTrialEntitlement(false, "no trial after logout");
            await verifyIsPaidSubscriber(false, "logged out user with expired entitlements should not be a paid subscriber");

            // Check profile popup (signed out state)
            $profileButton.trigger('click');
            await popupToAppear(SIGNIN_POPUP);
            // Not logged in user with no trial - no special branding expected
            expect(testWindow.$(`.profile-popup .trial-plan-info`).length).toBe(0);

            // Close popup
            $profileButton.trigger('click');
        });

        it("should show trial user popup when entitlements are expired (active trial)", async function () {
            console.log("llgT: Starting expired entitlements with active trial test");

            // Setup: Expired pro subscription + active trial (10 days)
            setupProUserMock(true, true);
            await setupTrialState(10);

            // Verify initial state shows pro branding due to trial (overrides expired entitlements)
            await verifyProBranding(true, "pro branding initially due to active trial");

            // Verify entitlements API consistency for logged out user with active trial
            await verifyPlanEntitlements({ isSubscriber: true, paidSubscriber: false, name: testWindow.brackets.config.main_pro_plan },
                "trial plan for logged out user overrides expired entitlements");
            await verifyIsInProTrialEntitlement(true, "user should be in trial initially");
            await verifyTrialRemainingDaysEntitlement(10, "should have 10 trial days remaining");
            await verifyRawEntitlements(null, "no raw entitlements when logged out");
            await verifyLiveEditEntitlement({ activated: true }, "live edit activated via trial");
            await verifyIsPaidSubscriber(false, "logged out trial user should not be a paid subscriber");

            // Perform login
            await performFullLoginFlow();

            // Verify pro branding remains after login (trial overrides expired server entitlements)
            await verifyProBranding(true, "pro branding after login - trial overrides expired entitlements");

            // Verify entitlements API consistency for logged in user (trial overrides expired server entitlements)
            await verifyPlanEntitlements({ isSubscriber: true, paidSubscriber: false },
                "trial overrides expired server entitlements - user is subscriber but not paid");
            await verifyIsInProTrialEntitlement(true, "user should still be in trial after login");
            await verifyTrialRemainingDaysEntitlement(10, "trial days should remain 10 after login");
            await verifyLiveEditEntitlement({ activated: true }, "live edit should be activated via trial override");
            await verifyIsPaidSubscriber(false, "logged in trial user should not be a paid subscriber (expired entitlements)");

            // Check profile popup shows trial status (not expired server entitlements)
            const $profileButton = testWindow.$("#user-profile-button");
            $profileButton.trigger('click');
            await popupToAppear(PROFILE_POPUP);
            await verifyProfilePopupContent(VIEW_TRIAL_DAYS_LEFT,
                "trial user profile popup - trial overrides expired server entitlements");

            // Close popup
            $profileButton.trigger('click');

            // Perform logout
            await performFullLogoutFlow();

            // Verify pro branding remains after logout (trial continues)
            await verifyProBranding(true, "pro branding after logout - trial still active");

            // Verify entitlements API consistency after logout (trial persists)
            await verifyIsInProTrialEntitlement(true, "trial should persist after logout");
            await verifyTrialRemainingDaysEntitlement(10, "trial days should persist after logout");
            await verifyRawEntitlements(null, "no raw entitlements when logged out");
            await verifyLiveEditEntitlement({ activated: true }, "live edit still activated via trial after logout");
            await verifyIsPaidSubscriber(false, "logged out trial user should not be a paid subscriber");

            // Check profile popup still shows trial status
            $profileButton.trigger('click');
            await popupToAppear(SIGNIN_POPUP);
            await verifyProfilePopupContent(VIEW_TRIAL_DAYS_LEFT,
                "trial user profile popup for logged out user");

            // Close popup
            $profileButton.trigger('click');
        });

        it("should test entitlements event forwarding", async function () {
            console.log("Entitlements: Testing event forwarding");

            let entitlementsEventFired = false;

            // Set up event listeners
            const entitlementsService = EntitlementsExports.EntitlementsService;

            const entitlementsHandler = () => {
                entitlementsEventFired = true;
            };

            entitlementsService.on(entitlementsService.EVENT_ENTITLEMENTS_CHANGED, entitlementsHandler);

            try {
                // Setup basic user mock
                setupProUserMock(false);

                // Perform full login flow
                await performFullLoginFlow();
                expect(LoginServiceExports.LoginService.isLoggedIn()).toBe(true);

                // Wait for events to fire
                await awaitsFor(()=> entitlementsEventFired, "Entitlements events to fire");

                expect(entitlementsEventFired).toBe(true);

                // Perform a full logout flow and see if entitlement changes are detected
                entitlementsEventFired = false;
                await performFullLogoutFlow();
                expect(LoginServiceExports.LoginService.isLoggedIn()).toBe(false);
                verifyProfileIconBlanked();

                // Wait for events to fire
                await awaitsFor(()=> entitlementsEventFired, "Entitlements events to fire");

            } finally {
                // Cleanup event listeners
                entitlementsService.off(entitlementsService.EVENT_ENTITLEMENTS_CHANGED, entitlementsHandler);
                await cleanupTrialState();
            }
        });

        it("should test isPaidSubscriber API across different user states", async function () {
            console.log("isPaidSubscriber: Testing API across different user states");

            try {
                // Test 1: Logged out user should not be a paid subscriber
                await cleanupTrialState();
                expect(LoginServiceExports.LoginService.isLoggedIn()).toBe(false);
                await verifyIsPaidSubscriber(false, "logged out user should not be a paid subscriber");

                // Test 2: Free user (no subscription) should not be a paid subscriber
                setupProUserMock(false);
                await performFullLoginFlow();
                expect(LoginServiceExports.LoginService.isLoggedIn()).toBe(true);
                await verifyIsPaidSubscriber(false, "free user should not be a paid subscriber");
                await performFullLogoutFlow();

                // Test 3: Trial user (no paid subscription) should not be a paid subscriber
                setupProUserMock(false);
                await setupTrialState(10);
                await performFullLoginFlow();
                expect(LoginServiceExports.LoginService.isLoggedIn()).toBe(true);
                await verifyIsPaidSubscriber(false, "trial user should not be a paid subscriber");
                await performFullLogoutFlow();
                await cleanupTrialState();

                // Test 4: Pro user with paid subscription should be a paid subscriber
                setupProUserMock(true);
                await performFullLoginFlow();
                expect(LoginServiceExports.LoginService.isLoggedIn()).toBe(true);
                await verifyIsPaidSubscriber(true, "pro user should be a paid subscriber");

                // Test 5: After logout, should not be a paid subscriber (no server entitlements)
                await performFullLogoutFlow();
                expect(LoginServiceExports.LoginService.isLoggedIn()).toBe(false);
                await verifyIsPaidSubscriber(false, "logged out pro user should not be a paid subscriber");

            } finally {
                await cleanupTrialState();
            }
        });

        if (Phoenix.isNativeApp) {
            it("should show device-licensed Pro branding and popup when not logged in", async function () {
                console.log("llgT: Starting device license Pro branding test");

                try {
                    // Setup: Enable device license flag
                    LoginServiceExports.setIsLicensedDevice(true);

                    // Setup mock that handles device ID requests (returns Pro entitlements)
                    setupProUserMock(true, false);

                    // Ensure no trial is active
                    await cleanupTrialState();

                    // Ensure user is logged out
                    if (LoginServiceExports.LoginService.isLoggedIn()) {
                        await performFullLogoutFlow();
                    }

                    // Clear and refresh entitlements to trigger device license check
                    await LoginServiceExports.LoginService.clearEntitlements();
                    await LoginServiceExports.LoginService.getEffectiveEntitlements(true);

                    // Wait for branding to update in the navbar
                    await awaitsFor(
                        function () {
                            const $branding = testWindow.$("#phcode-io-main-nav");
                            return $branding.hasClass("phoenix-pro");
                        },
                        "navbar branding to show Phoenix Pro",
                        3000
                    );

                    // Verify navbar shows Pro branding (uses plan.name)
                    await verifyProBranding(true, "device license shows Phoenix Pro branding in navbar");

                    // Verify entitlements API shows Pro access
                    // Note: Device licenses can be paid (paidSubscriber: true) or educational (paidSubscriber: false)
                    // This test uses educational license (deviceID request) so paidSubscriber should be false
                    await verifyPlanEntitlements(
                        { isSubscriber: true, paidSubscriber: false, name: "Phoenix Pro" },
                        "device license provides Pro plan (educational license is unpaid)"
                    );
                    await verifyIsInProTrialEntitlement(false, "device license is not a trial");
                    await verifyLiveEditEntitlement({ activated: true }, "live edit activated via device license");
                    await verifyIsPaidSubscriber(false, "educational device license should not be a paid subscriber (not logged in)");

                    // Verify raw entitlements are present (not null)
                    const rawEntitlements = await EntitlementsExports.getRawEntitlements();
                    expect(rawEntitlements).toBeDefined();
                    expect(rawEntitlements).not.toBeNull();
                    expect(rawEntitlements.plan.isSubscriber).toBe(true);

                    // Verify login popup shows Pro branding with fullName
                    const $profileButton = testWindow.$("#user-profile-button");
                    $profileButton.trigger('click');
                    await popupToAppear(SIGNIN_POPUP);

                    // Wait for Pro branding to appear in popup (async entitlements load)
                    await awaitsFor(
                        function () {
                            const $popup = testWindow.$('.profile-popup');
                            const $proInfo = $popup.find('.trial-plan-info');
                            return $proInfo.length > 0;
                        },
                        "Pro branding to appear in login popup",
                        3000
                    );

                    // Check for Pro branding in popup (uses plan.fullName)
                    const $popup = testWindow.$('.profile-popup');
                    const $proInfo = $popup.find('.trial-plan-info');
                    expect($proInfo.length).toBe(1);

                    const proText = $proInfo.text();
                    expect(proText).toContain("Phoenix Pro Test Edu");

                    // Verify feather icon is present
                    const $featherIcon = $proInfo.find('.fa-feather');
                    expect($featherIcon.length).toBe(1);

                    // Close popup
                    $profileButton.trigger('click');

                    console.log("llgT: Device license Pro branding test completed successfully");
                } finally {
                    // Cleanup: Reset device license flag
                    LoginServiceExports.setIsLicensedDevice(false);
                    await LoginServiceExports.LoginService.clearEntitlements();
                }
            });
        }
    }

    exports.setup = setup;
    exports.setupTrialState = setupTrialState;
    exports.setupExpiredTrial = setupExpiredTrial;
    exports.verifyProBranding = verifyProBranding;
    exports.verifyProfilePopupContent = verifyProfilePopupContent;
    exports.cleanupTrialState = cleanupTrialState;
    exports.popupToAppear = popupToAppear;
    exports.performFullLogoutFlow = performFullLogoutFlow;
    exports.verifyProfileIconBlanked = verifyProfileIconBlanked;
    exports.VIEW_TRIAL_DAYS_LEFT = VIEW_TRIAL_DAYS_LEFT;
    exports.VIEW_PHOENIX_PRO = VIEW_PHOENIX_PRO;
    exports.VIEW_PHOENIX_FREE = VIEW_PHOENIX_FREE;
    exports.SIGNIN_POPUP = SIGNIN_POPUP;
    exports.PROFILE_POPUP = PROFILE_POPUP;

    // test runner
    exports.setupSharedTests = setupSharedTests;
});
