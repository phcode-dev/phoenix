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
 * Shared Login Service
 *
 * This module contains shared login service functionality used by both
 * browser and desktop login implementations, including entitlements management.
 */

define(function (require, exports, module) {
    require("./setup-login-service"); // this adds loginService to KernalModeTrust
    require("./promotions");

    const MS_IN_DAY = 10 * 24 * 60 * 60 * 1000;

    const KernalModeTrust = window.KernalModeTrust;
    if(!KernalModeTrust){
        // integrated extensions will have access to kernal mode, but not external extensions
        throw new Error("Login service should have access to KernalModeTrust. Cannot boot without trust ring");
    }

    const LoginService = KernalModeTrust.loginService;

    // Event constants
    const EVENT_ENTITLEMENTS_CHANGED = "entitlements_changed";

    // Cached entitlements data
    let cachedEntitlements = null;

    /**
     * Get entitlements from API or cache
     * Returns null if user is not logged in
     */
    async function getEntitlements(forceRefresh = false) {
        // Return null if not logged in
        if (!LoginService.isLoggedIn()) {
            return null;
        }

        // Return cached data if available and not forcing refresh
        if (cachedEntitlements && !forceRefresh) {
            return cachedEntitlements;
        }

        try {
            const accountBaseURL = LoginService.getAccountBaseURL();
            const language = brackets.getLocale();
            let url = `${accountBaseURL}/getAppEntitlements?lang=${language}`;
            let fetchOptions = {
                method: 'GET',
                headers: {
                    'Accept': 'application/json'
                }
            };

            // Handle different authentication methods for browser vs desktop
            if (Phoenix.isNativeApp) {
                // Desktop app: use appSessionID and validationCode
                const profile = LoginService.getProfile();
                if (profile && profile.apiKey && profile.validationCode) {
                    url += `&appSessionID=${encodeURIComponent(profile.apiKey)}&validationCode=${encodeURIComponent(profile.validationCode)}`;
                } else {
                    console.error('Missing appSessionID or validationCode for desktop app entitlements');
                    return null;
                }
            } else {
                // Browser app: use session cookies
                fetchOptions.credentials = 'include';
            }

            const response = await fetch(url, fetchOptions);

            if (response.ok) {
                const result = await response.json();
                if (result.isSuccess) {
                    // Check if entitlements actually changed
                    const entitlementsChanged = JSON.stringify(cachedEntitlements) !== JSON.stringify(result);

                    cachedEntitlements = result;

                    // Trigger event if entitlements changed
                    if (entitlementsChanged) {
                        LoginService.trigger(EVENT_ENTITLEMENTS_CHANGED, result);
                    }

                    return cachedEntitlements;
                }
            }
        } catch (error) {
            console.error('Failed to fetch entitlements:', error);
        }

        return null;
    }

    /**
     * Clear cached entitlements and trigger change event
     * Called when user logs out
     */
    function clearEntitlements() {
        if (cachedEntitlements) {
            cachedEntitlements = null;

            // Trigger event when entitlements are cleared
            if (LoginService.trigger) {
                LoginService.trigger(EVENT_ENTITLEMENTS_CHANGED, null);
            }
        }
    }

    /**
     * Get effective entitlements for determining feature availability throughout the app.
     * This is the primary API that should be used across Phoenix to check entitlements and enable/disable features.
     *
     * @returns {Promise<Object|null>} Entitlements object or null if not logged in and no trial active
     *
     * @description Response shapes vary based on user state:
     *
     * **For non-logged-in users:**
     * - Returns `null` if no trial is active
     * - Returns synthetic entitlements if trial is active:
     * ```javascript
     * {
     *   plan: {
     *     paidSubscriber: true,    // Always true for trial users
     *     name: "Phoenix Pro"
     *   },
     *   isInProTrial: true,        // Indicates this is a trial user
     *   trialDaysRemaining: number, // Days left in trial
     *   entitlements: {
     *     liveEdit: {
     *       activated: true        // Trial users get liveEdit access
     *     }
     *   }
     * }
     * ```
     *
     * **For logged-in trial users:**
     * - If remote response has `plan.paidSubscriber: false`, injects `paidSubscriber: true`
     * - Adds `isInProTrial: true` and `trialDaysRemaining`
     * - Injects `entitlements.liveEdit.activated: true`
     * - Note: Trial users may not be actual paid subscribers, but `paidSubscriber: true` is set
     *   so all Phoenix code treats them as paid subscribers
     *
     * **For logged-in users (full remote response):**
     * ```javascript
     * {
     *   isSuccess: boolean,
     *   lang: string,
     *   plan: {
     *     name: "Phoenix Pro",
     *     paidSubscriber: boolean,
     *     validTill: number        // Timestamp
     *   },
     *   profileview: {
     *     quota: {
     *       titleText: "Ai Quota Used",
     *       usageText: "100 / 200 credits",
     *       usedPercent: number
     *     },
     *     htmlMessage: string      // HTML alert message
     *   },
     *   entitlements: {
     *     liveEdit: {
     *       activated: boolean,
     *       subscribeURL: string,  // URL to subscribe if not activated
     *       upgradeToPlan: string, // Plan name that includes this entitlement
     *       validTill: number      // Timestamp when entitlement expires
     *     },
     *     liveEditAI: {
     *       activated: boolean,
     *       subscribeURL: string,
     *       purchaseCreditsURL: string, // URL to purchase AI credits
     *       upgradeToPlan: string,
     *       validTill: number
     *     }
     *   }
     * }
     * ```
     *
     * @example
     * // Listen for entitlements changes
     * const LoginService = window.KernelModeTrust.loginService;
     * LoginService.on(LoginService.EVENT_ENTITLEMENTS_CHANGED, (entitlements) => {
     *   console.log('Entitlements changed:', entitlements);
     *   // Update UI based on new entitlements
     * });
     *
     * // Get current entitlements
     * const entitlements = await LoginService.getEffectiveEntitlements();
     * if (entitlements?.plan?.paidSubscriber) {
     *   // Enable pro features
     * }
     * if (entitlements?.entitlements?.liveEdit?.activated) {
     *   // Enable live edit feature
     * }
     */
    async function getEffectiveEntitlements(forceRefresh = false) {
        // Get raw server entitlements
        const serverEntitlements = await getEntitlements(forceRefresh);

        // Get trial days remaining
        const trialDaysRemaining = await LoginService.getProTrialDaysRemaining();

        // If no trial is active, return server entitlements as-is
        if (trialDaysRemaining <= 0) {
            return serverEntitlements;
        }

        // User has active trial
        if (serverEntitlements && serverEntitlements.plan) {
            // Logged-in user with trial
            if (serverEntitlements.plan.paidSubscriber) {
                // Already a paid subscriber, return as-is
                return serverEntitlements;
            }
            // Enhance entitlements for trial user
            return {
                ...serverEntitlements,
                plan: {
                    ...serverEntitlements.plan,
                    paidSubscriber: true,
                    name: brackets.config.main_pro_plan,
                    validTill: Date.now() + trialDaysRemaining * MS_IN_DAY
                },
                isInProTrial: true,
                trialDaysRemaining: trialDaysRemaining,
                entitlements: {
                    ...serverEntitlements.entitlements,
                    liveEdit: {
                        activated: true,
                        subscribeURL: brackets.config.purchase_url,
                        upgradeToPlan: brackets.config.main_pro_plan,
                        validTill: Date.now() + trialDaysRemaining * MS_IN_DAY
                    }
                }
            };
        }

        // Non-logged-in user with trial - return synthetic entitlements
        return {
            plan: {
                paidSubscriber: true,
                name: brackets.config.main_pro_plan,
                validTill: Date.now() + trialDaysRemaining * MS_IN_DAY
            },
            isInProTrial: true,
            trialDaysRemaining: trialDaysRemaining,
            entitlements: {
                liveEdit: {
                    activated: true,
                    subscribeURL: brackets.config.purchase_url,
                    upgradeToPlan: brackets.config.main_pro_plan,
                    validTill: Date.now() + trialDaysRemaining * MS_IN_DAY
                }
            }
        };
    }

    // Add functions to secure exports
    LoginService.getEntitlements = getEntitlements;
    LoginService.getEffectiveEntitlements = getEffectiveEntitlements;
    LoginService.clearEntitlements = clearEntitlements;
    LoginService.EVENT_ENTITLEMENTS_CHANGED = EVENT_ENTITLEMENTS_CHANGED;
});
