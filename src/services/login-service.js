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

    // Add functions to secure exports
    LoginService.getEntitlements = getEntitlements;
    LoginService.clearEntitlements = clearEntitlements;
    LoginService.EVENT_ENTITLEMENTS_CHANGED = EVENT_ENTITLEMENTS_CHANGED;
});
