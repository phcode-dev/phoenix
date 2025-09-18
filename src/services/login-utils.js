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
 * Login Service Utilities
 *
 * This module contains utility functions for login service operations,
 * including entitlements expiration checking and change detection.
 */

define(function (require, exports, module) {

    const KernalModeTrust = window.KernalModeTrust;
    if(!KernalModeTrust){
        // integrated extensions will have access to kernal mode, but not external extensions
        throw new Error("Login utils should have access to KernalModeTrust. Cannot boot without trust ring");
    }

    /**
     * Check if any validTill time has expired
     *
     * @param {Object|null} entitlements - Current entitlements object
     * @param {Object|null} lastRecordedEntitlement - Previously recorded entitlements
     * @returns {string|null} - Name of expired plan/entitlement or null if none expired
     */
    function validTillExpired(entitlements, lastRecordedEntitlement) {
        if (!entitlements) {
            return null;
        }

        const now = Date.now();

        function isNewlyExpired(validTill, lastValidTill) {
            return (
                validTill &&
                validTill < now &&                      // expired now
                (!lastValidTill || lastValidTill >= now) // but wasn't expired before
            );
        }

        // Check plan validTill
        if (entitlements.plan) {
            const validTill = entitlements.plan.validTill;
            const lastValidTill = (lastRecordedEntitlement && lastRecordedEntitlement.plan)
                ? lastRecordedEntitlement.plan.validTill
                : null;

            if (isNewlyExpired(validTill, lastValidTill)) {
                return entitlements.plan.name || brackets.config.main_pro_plan;
            }
        }

        // Check entitlements validTill
        if (entitlements.entitlements) {
            for (const key in entitlements.entitlements) {
                const entitlement = entitlements.entitlements[key];
                if (!entitlement) {
                    continue;
                }

                const validTill = entitlement.validTill;
                const lastValidTill = (lastRecordedEntitlement &&
                    lastRecordedEntitlement.entitlements &&
                    lastRecordedEntitlement.entitlements[key])
                    ? lastRecordedEntitlement.entitlements[key].validTill
                    : null;

                if (isNewlyExpired(validTill, lastValidTill)) {
                    return key;
                }
            }
        }

        return null;
    }

    /**
     * Check if entitlements have changed from last recorded state
     *
     * @param {Object|null} current - Current entitlements object
     * @param {Object|null} last - Last recorded entitlements object
     * @returns {boolean} - True if entitlements have changed, false otherwise
     */
    function haveEntitlementsChanged(current, last) {
        if (!last && !current) {
            return false;
        }
        if ((!last && current) || (!current && last)) {
            return true;
        }
        if ((!last.entitlements && current.entitlements) || (!current.entitlements && last.entitlements)) {
            return true;
        }

        // Check paidSubscriber changes
        const currentPaidSub = current.plan && current.plan.paidSubscriber;
        const lastPaidSub = last.plan && last.plan.paidSubscriber;
        if (currentPaidSub !== lastPaidSub) {
            return true;
        }

        // Check plan name changes
        const currentPlanName = current.plan && current.plan.name;
        const lastPlanName = last.plan && last.plan.name;
        if (currentPlanName !== lastPlanName) {
            return true;
        }

        // Check entitlement activations
        if (current.entitlements && last.entitlements) {
            for (const key of Object.keys(current.entitlements)) {
                const currentActivated = current.entitlements[key] && current.entitlements[key].activated;
                const lastActivated = last.entitlements[key] && last.entitlements[key].activated;
                if (currentActivated !== lastActivated) {
                    return true;
                }
            }
        }

        return false;
    }

    KernalModeTrust.LoginUtils = {
        validTillExpired,
        haveEntitlementsChanged
    };
    // Test only Export functions
    if(Phoenix.isTestWindow) {
        exports.validTillExpired = validTillExpired;
        exports.haveEntitlementsChanged = haveEntitlementsChanged;
    }
});
