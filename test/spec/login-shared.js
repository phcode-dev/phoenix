
/*global expect, it, awaitsFor*/

define(function (require, exports, module) {
    let testWindow, LoginServiceExports, setupProUserMock, performFullLoginFlow;

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

    function setup(_testWindow, _LoginServiceExports, _setupProUserMock, _performFullLoginFlow) {
        testWindow = _testWindow;
        LoginServiceExports = _LoginServiceExports;
        setupProUserMock = _setupProUserMock;
        performFullLoginFlow = _performFullLoginFlow;
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
            console.log("llgT: Starting trial user test");

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
            console.log("llgT: Starting trial user with pro subscription test");

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

            // Close popup
            $profileButton.trigger('click');
        });

        it("should show free branding for user without pro subscription (expired trial)", async function () {
            console.log("llgT: Starting desktop trial user test");

            // Setup: No pro subscription + active trial (15 days)
            setupProUserMock(false);
            await setupExpiredTrial();

            // Verify initial state (no pro branding)
            await verifyProBranding(false, "no pro branding to start with");

            // Perform login
            await performFullLoginFlow();

            // Verify pro branding remains after login
            await verifyProBranding(false, "after trial free user login");

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

            // Perform login
            await performFullLoginFlow();

            // Verify pro branding remains false after login (expired entitlements filtered to free)
            await verifyProBranding(false, "no pro branding after login with expired entitlements");

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

            // Perform login
            await performFullLoginFlow();

            // Verify pro branding remains after login (trial overrides expired server entitlements)
            await verifyProBranding(true, "pro branding after login - trial overrides expired entitlements");

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

            // Check profile popup still shows trial status
            $profileButton.trigger('click');
            await popupToAppear(SIGNIN_POPUP);
            await verifyProfilePopupContent(VIEW_TRIAL_DAYS_LEFT,
                "trial user profile popup for logged out user");

            // Close popup
            $profileButton.trigger('click');
        });
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
