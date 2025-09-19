/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 *
 * This program is free software: you can redistribute it and/or modify it under
 * the terms of the GNU Affero General Public License as published by the Free
 * Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY;
 * without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 * See the GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see https://opensource.org/licenses/AGPL-3.0.
 *
 */

/**
 * Entitlements Service
 *
 * This module provides a dedicated API for managing user entitlements,
 * including plan details, trial status, and feature entitlements.
 */

define(function (require, exports, module) {
    const KernalModeTrust = window.KernalModeTrust;
    if(!KernalModeTrust){
        // integrated extensions will have access to kernal mode, but not external extensions
        throw new Error("Login service should have access to KernalModeTrust. Cannot boot without trust ring");
    }

    const EventDispatcher = require("utils/EventDispatcher"),
        Strings = require("strings");

    const MS_IN_DAY = 24 * 60 * 60 * 1000;
    const FREE_PLAN_VALIDITY_DAYS = 10000;

    let LoginService;

    // Create secure exports and set up event dispatcher
    const Entitlements = {};
    EventDispatcher.makeEventDispatcher(Entitlements);

    // Event constants
    const EVENT_ENTITLEMENTS_CHANGED = "entitlements_changed";

    /**
     * Check if user is logged in. Best to check after `EVENT_ENTITLEMENTS_CHANGED`.
     * @returns {*}
     */
    function isLoggedIn() {
        return LoginService.isLoggedIn();
    }

    /**
     * Attempts to sign in to the user's account if the user is not already logged in.
     * You should listen to `EVENT_ENTITLEMENTS_CHANGED` to know when the login status changes. This function
     * returns immediately and does not wait for the login process to complete.
     *
     * @return {void} Does not return a value.
     */
    function loginToAccount() {
        if(isLoggedIn()){
            return;
        }
        KernalModeTrust.loginService.signInToAccount()
            .catch(function(err){
                console.error("Error signing in to account", err);
            });
    }

    /**
     * Get the plan details from entitlements with fallback to free plan defaults. If the user is
     * in pro trial(isInProTrial API), then paidSubscriber will always be true as we need to treat user as paid.
     * you should use isInProTrial API to check if user is in pro trial if some trial-related logic needs to be done.
     * @returns {Promise<Object>} Plan details object
     */
    async function getPlanDetails() {
        const entitlements = await LoginService.getEffectiveEntitlements();

        if (entitlements && entitlements.plan) {
            return entitlements.plan;
        }

        // Fallback to free plan defaults
        const currentDate = Date.now();
        return {
            paidSubscriber: false,
            name: Strings.USER_FREE_PLAN_NAME,
            validTill: currentDate + (FREE_PLAN_VALIDITY_DAYS * MS_IN_DAY)
        };
    }

    /**
     * Check if user is in a pro trial. IF the user is in pro trail, then `plan.paidSubscriber` will always be true.
     * @returns {Promise<boolean>} True if user is in pro trial, false otherwise
     */
    async function isInProTrial() {
        const entitlements = await LoginService.getEffectiveEntitlements();
        return !!(entitlements && entitlements.isInProTrial);
    }

    /**
     * Get remaining trial days
     * @returns {Promise<number>} Number of remaining trial days
     */
    async function getTrialRemainingDays() {
        const entitlements = await LoginService.getEffectiveEntitlements();
        return entitlements && entitlements.trialDaysRemaining ? entitlements.trialDaysRemaining : 0;
    }

    /**
     * Get current raw entitlements. Should not be used directly, use individual feature entitlement instead
     * like getLiveEditEntitlement.
     * @returns {Promise<Object|null>} Raw entitlements object or null
     */
    async function getRawEntitlements() {
        return await LoginService.getEntitlements();
    }

    /**
     * Get live edit is enabled for user, based on his logged in pro-user/trial status.
     *
     * @returns {Promise<Object>} Live edit entitlement object with the following shape:
     * @returns {Promise<Object>} entitlement
     * @returns {Promise<boolean>} entitlement.activated - If true, enable live edit feature.
     *                                                   If false, use promotions.showProUpsellDialog
     *                                                   with UPSELL_TYPE_LIVE_EDIT to show an upgrade dialog if needed.
     * @returns {Promise<string>} entitlement.subscribeURL - URL to subscribe/purchase if not activated
     * @returns {Promise<string>} entitlement.upgradeToPlan - Plan name that includes live edit entitlement
     * @returns {Promise<number>} [entitlement.validTill] - Timestamp when entitlement expires (if from server)
     *
     * @example
     * const liveEditEntitlement = await Entitlements.getLiveEditEntitlement();
     * if (liveEditEntitlement.activated) {
     *     // Enable live edit feature
     *     enableLiveEditFeature();
     * } else {
     *     // Show upgrade dialog when user tries to use live edit
     *     promotions.showProUpsellDialog(promotions.UPSELL_TYPE_LIVE_EDIT);
     * }
     */
    async function getLiveEditEntitlement() {
        const entitlements = await LoginService.getEffectiveEntitlements();

        if (entitlements && entitlements.entitlements && entitlements.entitlements.liveEdit) {
            return entitlements.entitlements.liveEdit;
        }

        // Fallback defaults when live edit entitlement is not available from API
        return {
            activated: false,
            subscribeURL: brackets.config.purchase_url,
            upgradeToPlan: brackets.config.main_pro_plan
        };
    }

    // Set up KernalModeTrust.Entitlements
    KernalModeTrust.Entitlements = Entitlements;

    let inited = false;
    function init() {
        if(inited){
            return;
        }
        inited = true;
        LoginService = KernalModeTrust.loginService;
        // Set up event forwarding from LoginService
        LoginService.on(LoginService.EVENT_ENTITLEMENTS_CHANGED, function() {
            Entitlements.trigger(EVENT_ENTITLEMENTS_CHANGED);
        });
    }

    // Test-only exports for integration testing
    if (Phoenix.isTestWindow) {
        window._test_entitlements_exports = {
            EntitlementsService: Entitlements,
            isLoggedIn,
            getPlanDetails,
            isInProTrial,
            getTrialRemainingDays,
            getRawEntitlements,
            getLiveEditEntitlement,
            loginToAccount
        };
    }

    exports.init = init;
    // no public exports to prevent extension tampering

    // Add functions to secure exports
    Entitlements.isLoggedIn = isLoggedIn;
    Entitlements.loginToAccount = loginToAccount;
    Entitlements.getPlanDetails = getPlanDetails;
    Entitlements.isInProTrial = isInProTrial;
    Entitlements.getTrialRemainingDays = getTrialRemainingDays;
    Entitlements.getRawEntitlements = getRawEntitlements;
    Entitlements.getLiveEditEntitlement = getLiveEditEntitlement;
    Entitlements.EVENT_ENTITLEMENTS_CHANGED = EVENT_ENTITLEMENTS_CHANGED;
});
