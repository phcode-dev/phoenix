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
        return {
            setupTrialState
        };
    }

    exports.getSharedUtils = getSharedUtils;
});
