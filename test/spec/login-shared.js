
/*global expect, awaitsFor*/

define(function (require, exports, module) {

    function getSharedUtils(testWindow) {
        // Helper functions for promotion testing (browser-specific)
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

        return {
            setupTrialState,
            setupExpiredTrial,
            verifyProBranding
        };
    }

    exports.getSharedUtils = getSharedUtils;
});
