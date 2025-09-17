
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
