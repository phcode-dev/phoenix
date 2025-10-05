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
        AIControl = require("./ai-control"),
        Strings = require("strings"),
        StringUtils = require("utils/StringUtils");

    const MS_IN_DAY = 24 * 60 * 60 * 1000;
    const FREE_PLAN_VALIDITY_DAYS = 10000;

    let LoginService;

    // Create secure exports and set up event dispatcher
    const EntitlementsManager = {};
    EventDispatcher.makeEventDispatcher(EntitlementsManager);
    // Set up KernalModeTrust.Entitlements
    KernalModeTrust.EntitlementsManager = EntitlementsManager;

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

    let effectiveEntitlementsCached = undefined; // entitlements can be null and its valid if no login/trial
    async function _getEffectiveEntitlements() {
        if(effectiveEntitlementsCached !== undefined){
            return effectiveEntitlementsCached;
        }
        const entitlements = await LoginService.getEffectiveEntitlements();
        effectiveEntitlementsCached = entitlements;
        return entitlements;
    }

    /**
     * Get the plan details from entitlements with fallback to free plan defaults. If the user is
     * in pro trial(isInProTrial API), then paidSubscriber will always be true as we need to treat user as paid.
     * you should use isInProTrial API to check if user is in pro trial if some trial-related logic needs to be done.
     * @returns {Promise<Object>} Plan details object
     */
    async function getPlanDetails() {
        const entitlements = await _getEffectiveEntitlements();

        if (entitlements && entitlements.plan) {
            return entitlements.plan;
        }

        // Fallback to free plan defaults
        const currentDate = Date.now();
        return {
            paidSubscriber: false,
            name: Strings.USER_FREE_PLAN_NAME_DO_NOT_TRANSLATE,
            validTill: currentDate + (FREE_PLAN_VALIDITY_DAYS * MS_IN_DAY)
        };
    }

    /**
     * Check if user is in a pro trial. IF the user is in pro trail, then `plan.paidSubscriber` will always be true.
     * @returns {Promise<boolean>} True if user is in pro trial, false otherwise
     */
    async function isInProTrial() {
        const entitlements = await _getEffectiveEntitlements();
        return !!(entitlements && entitlements.isInProTrial);
    }

    /**
     * Get remaining trial days
     * @returns {Promise<number>} Number of remaining trial days
     */
    async function getTrialRemainingDays() {
        const entitlements = await _getEffectiveEntitlements();
        return entitlements && entitlements.trialDaysRemaining ? entitlements.trialDaysRemaining : 0;
    }

    /**
     * Get current raw entitlements. Should not be used directly, use individual feature entitlement instead
     * like getLiveEditEntitlement. Raw entitlements are server set and will not contain trial info.
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
     * const liveEditEntitlement = await EntitlementsManager.getLiveEditEntitlement();
     * if (liveEditEntitlement.activated) {
     *     // Enable live edit feature
     *     enableLiveEditFeature();
     * } else {
     *     // Show upgrade dialog when user tries to use live edit
     *     promotions.showProUpsellDialog(promotions.UPSELL_TYPE_LIVE_EDIT);
     * }
     */
    async function getLiveEditEntitlement() {
        const entitlements = await _getEffectiveEntitlements();

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

    /**
     * Get AI is enabled for user, based on his logged in pro-user/trial status.
     *
     * @returns {Promise<Object>} AI entitlement object with the following shape:
     * @returns {Promise<boolean>} entitlement.activated - If true, enable AI features. If false, check upsellDialog.
     * @returns {Promise<boolean>} [entitlement.needsLogin] - If true, user needs to login first.
     * @returns {Promise<string>} [entitlement.aiBrandName] - The brand name used for AI. Eg: `Phoenix AI`
     * @returns {Promise<string>} [entitlement.buyURL] - URL to subscribe/purchase if not activated. Can be null if AI
     *                                            is not purchasable.
     * @returns {Promise<string>} [entitlement.upgradeToPlan] - Plan name that includes AI entitlement
     * @returns {Promise<number>} [entitlement.validTill] - Timestamp when entitlement expires (if from server)
     * @returns {Promise<Object>} [entitlement.upsellDialog] - Dialog configuration if user needs to be shown an upsell.
     *                                            Only present when activated is false.
     * @returns {Promise<string>} [entitlement.upsellDialog.title] - Dialog title
     * @returns {Promise<string>} [entitlement.upsellDialog.message] - Dialog message
     * @returns {Promise<string>} [entitlement.upsellDialog.buyURL] - Purchase URL. If present, dialog shows
     *                                            "Get AI Access" button. If absent, shows only OK button.
     *
     * @example
     * const aiEntitlement = await EntitlementsManager.getAIEntitlement();
     * if (aiEntitlement.activated) {
     *     // Enable AI features
     *     enableAIFeature();
     * } else if (aiEntitlement.upsellDialog) {
     *     // Show upsell dialog when user tries to use AI
     *     promotions.showAIUpsellDialog(aiEntitlement);
     * }
     */
    async function getAIEntitlement() {
        if(!isLoggedIn()) {
            return {
                needsLogin: true,
                activated: false,
                upsellDialog: {
                    title: Strings.AI_LOGIN_DIALOG_TITLE,
                    message: Strings.AI_LOGIN_DIALOG_MESSAGE
                    // no buy url as it is a sign in hint. only ok button will be there in this dialog.
                }
            };
        }
        const aiControlStatus = await EntitlementsManager.getAIControlStatus();
        if(!aiControlStatus.aiEnabled) {
            return {
                activated: false,
                upsellDialog: {
                    title: Strings.AI_DISABLED_DIALOG_TITLE,
                    // Eg. AI is disabled by school admin/root user.
                    // no buyURL as ai is disabled explicitly. only ok button will be there in this dialog.
                    message: aiControlStatus.message || Strings.AI_CONTROL_ADMIN_DISABLED
                }
            };
        }
        const defaultAIBrandName = brackets.config.ai_brand_name,
            defaultPurchaseURL = brackets.config.purchase_url,
            defaultUpsellTitle = StringUtils.format(Strings.AI_UPSELL_DIALOG_TITLE, defaultAIBrandName);
        const entitlements = await _getEffectiveEntitlements();
        if(!entitlements || !entitlements.entitlements || !entitlements.entitlements.aiAgent) {
            return {
                activated: false,
                aiBrandName: defaultAIBrandName,
                buyURL: defaultPurchaseURL,
                upgradeToPlan: defaultAIBrandName,
                upsellDialog: {
                    title: defaultUpsellTitle,
                    message: Strings.AI_UPSELL_DIALOG_MESSAGE,
                    buyURL: defaultPurchaseURL
                }
            };
        }
        const aiEntitlement = entitlements.entitlements.aiAgent;
        // entitlements.entitlements.aiAgent: {
        //       activated: boolean,
        //       aiBrandName: string,
        //       subscribeURL: string,
        //       upgradeToPlan: string,
        //       validTill: number,
        //       upsellDialog: {
        //          title: "if activated is false, server can send a custom upsell dialog to show",
        //          message: "this is the message to show",
        //          buyURL: "if this url is present from server, this will be shown to as buy link"
        //      }
        //     }

        if(aiEntitlement.activated) {
            return {
                activated: true,
                aiBrandName: aiEntitlement.aiBrandName,
                buyURL: aiEntitlement.subscribeURL,
                upgradeToPlan: aiEntitlement.upgradeToPlan,
                validTill: aiEntitlement.validTill
                // no upsellDialog, as it need not be shown.
            };
        }

        const upsellTitle = StringUtils.format(Strings.AI_UPSELL_DIALOG_TITLE,
            aiEntitlement.aiBrandName || defaultAIBrandName);
        const upsellDialog = aiEntitlement.upsellDialog || {};
        return {
            activated: false,
            aiBrandName: aiEntitlement.aiBrandName,
            buyURL: aiEntitlement.subscribeURL || defaultPurchaseURL,
            upgradeToPlan: aiEntitlement.upgradeToPlan,
            validTill: aiEntitlement.validTill,
            upsellDialog: {
                title: upsellDialog.title || upsellTitle,
                message: upsellDialog.message || Strings.AI_UPSELL_DIALOG_MESSAGE,
                buyURL: upsellDialog.buyURL || aiEntitlement.subscribeURL || defaultPurchaseURL
            }
        };
    }

    let inited = false;
    function init() {
        if(inited){
            return;
        }
        inited = true;
        LoginService = KernalModeTrust.loginService;
        // Set up event forwarding from LoginService
        LoginService.on(LoginService.EVENT_ENTITLEMENTS_CHANGED, function() {
            effectiveEntitlementsCached = undefined;
            EntitlementsManager.trigger(EVENT_ENTITLEMENTS_CHANGED);
        });
        AIControl.init();
    }

    // Test-only exports for integration testing
    if (Phoenix.isTestWindow) {
        window._test_entitlements_exports = {
            EntitlementsService: EntitlementsManager,
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

    // Add functions to secure exports. These can be accessed via `KernalModeTrust.Entitlements.*`
    EntitlementsManager.isLoggedIn = isLoggedIn;
    EntitlementsManager.loginToAccount = loginToAccount;
    EntitlementsManager.getPlanDetails = getPlanDetails;
    EntitlementsManager.isInProTrial = isInProTrial;
    EntitlementsManager.getTrialRemainingDays = getTrialRemainingDays;
    EntitlementsManager.getRawEntitlements = getRawEntitlements;
    EntitlementsManager.getLiveEditEntitlement = getLiveEditEntitlement;
    EntitlementsManager.getAIEntitlement = getAIEntitlement;
    EntitlementsManager.EVENT_ENTITLEMENTS_CHANGED = EVENT_ENTITLEMENTS_CHANGED;
});
