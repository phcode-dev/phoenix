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

/*global logger*/

/**
 * Promotions Service
 *
 * Manages pro trial promotions for both native and browser applications.
 * Provides loginless pro trials
 *
 * - First install: 30-day trial on first usage
 * - Subsequent versions: 3-day trial (or remaining from 30-day if still valid)
 * - Older versions: No new trial, but existing 30-day trial remains valid
 */

define(function (require, exports, module) {

    require("./setup-login-service"); // this adds loginService to KernalModeTrust
    const Metrics = require("utils/Metrics"),
        semver = require("thirdparty/semver.browser"),
        ProDialogs = require("./pro-dialogs");

    const KernalModeTrust = window.KernalModeTrust;
    if (!KernalModeTrust) {
        throw new Error("Promotions service requires access to KernalModeTrust. Cannot boot without trust ring");
    }

    const LoginService = KernalModeTrust.loginService;

    // Constants
    const EVENT_PRO_UPGRADE_ON_INSTALL = "pro_upgrade_on_install";
    const TRIAL_POLL_MS = 10 * 1000; // 10 seconds after start, we assign a free trial if possible
    const FIRST_INSTALL_TRIAL_DAYS = 30;
    const SUBSEQUENT_TRIAL_DAYS = 3;
    const MS_PER_DAY = 24 * 60 * 60 * 1000;

    /**
     * Generate SHA-256 signature for trial data integrity
     */
    async function _generateSignature(proVersion, endDate) {
        const salt = window.AppConfig ? window.AppConfig.version : "default-salt";
        const data = proVersion + "|" + endDate + "|" + salt;

        // Use browser crypto API for SHA-256 hashing
        const encoder = new TextEncoder();
        const dataBuffer = encoder.encode(data);
        const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join(''); // hash hex string
    }

    /**
     * Validate trial data signature
     */
    async function _isValidSignature(trialData) {
        if (!trialData.signature || !trialData.proVersion || !trialData.endDate) {
            return false;
        }

        const expectedSignature = await _generateSignature(trialData.proVersion, trialData.endDate);
        return trialData.signature === expectedSignature;
    }

    /**
     * Get stored trial data with validation
     */
    async function _getTrialData() {
        try {
            if (Phoenix.isNativeApp) {
                // Native app: use KernalModeTrust credential store
                const data = await KernalModeTrust.getCredential(KernalModeTrust.CRED_KEY_ENTITLEMENTS);
                if (!data) {
                    return null;
                }
                const parsed = JSON.parse(data);
                return (await _isValidSignature(parsed)) ? parsed : null;
            } else {
                // Browser app: use virtual filesystem
                return new Promise((resolve) => {
                    // app support dir in browser is /fs/app/
                    const filePath = Phoenix.app.getApplicationSupportDirectory() + "entitlements_granted.json";
                    window.fs.readFile(filePath, 'utf8', function (err, data) {
                        if (err || !data) {
                            resolve(null);
                            return;
                        }
                        try {
                            const parsed = JSON.parse(data);
                            _isValidSignature(parsed).then(isValid => {
                                resolve(isValid ? parsed : null);
                            }).catch(() => resolve(null));
                        } catch (e) {
                            resolve(null);
                        }
                    });
                });
            }
        } catch (error) {
            console.error("Error getting trial data:", error);
            return null;
        }
    }

    /**
     * Store trial data with signature
     */
    async function _setTrialData(trialData) {
        trialData.signature = await _generateSignature(trialData.proVersion, trialData.endDate);

        try {
            if (Phoenix.isNativeApp) {
                // Native app: use KernalModeTrust credential store
                await KernalModeTrust.setCredential(KernalModeTrust.CRED_KEY_ENTITLEMENTS, JSON.stringify(trialData));
            } else {
                // Browser app: use virtual filesystem
                return new Promise((resolve, reject) => {
                    const filePath = Phoenix.app.getApplicationSupportDirectory() + "entitlements_granted.json";
                    window.fs.writeFile(filePath, JSON.stringify(trialData), 'utf8', (writeErr) => {
                        if (writeErr) {
                            console.error("Error storing trial data:", writeErr);
                            reject(writeErr);
                        } else {
                            resolve();
                        }
                    });
                });
            }
        } catch (error) {
            console.error("Error setting trial data:", error);
            throw error;
        }
    }

    /**
     * Calculate remaining trial days from end date
     */
    function _calculateRemainingTrialDays(existingTrialData) {
        const now = Date.now();
        const trialEndDate = existingTrialData.endDate;

        // Calculate days remaining until trial ends
        const msRemaining = trialEndDate - now;
        return Math.max(0, Math.ceil(msRemaining / MS_PER_DAY)); // days remaining
    }

    /**
     * Check if version1 is newer than version2 using semver
     */
    function _isNewerVersion(version1, version2) {
        try {
            return semver.gt(version1, version2);
        } catch (error) {
            console.error("Error comparing versions:", error, version1, version2);
            // Assume not newer if comparison fails
            return false;
        }
    }

    /**
     * Check if user has active pro subscription
     * Returns true if user is logged in and has a paid subscription
     */
    async function _hasProSubscription() {
        try {
            // First verify login status to ensure login state is properly resolved
            await LoginService.verifyLoginStatus();

            // getEntitlements() returns null if not logged in
            const entitlements = await LoginService.getEntitlements();
            return entitlements && entitlements.plan && entitlements.plan.paidSubscriber === true;
        } catch (error) {
            console.error("Error checking pro subscription:", error);
            return false;
        }
    }

    /**
     * Get remaining pro trial days
     * Returns 0 if no trial or trial expired
     */
    async function getProTrialDaysRemaining() {
        const trialData = await _getTrialData();
        if (!trialData) {
            return 0;
        }

        return _calculateRemainingTrialDays(trialData);
    }

    async function activateProTrial() {
        const currentVersion = window.AppConfig ? window.AppConfig.apiVersion : "1.0.0";
        const existingTrialData = await _getTrialData();

        let trialDays = FIRST_INSTALL_TRIAL_DAYS;
        let endDate;
        const now = Date.now();
        let metricString = `${currentVersion.replaceAll(".", "_")}`; // 3.1.0 -> 3_1_0

        if (existingTrialData) {
            // Existing trial found
            const remainingDays = _calculateRemainingTrialDays(existingTrialData);
            const trialVersion = existingTrialData.proVersion;
            const isNewerVersion = _isNewerVersion(currentVersion, trialVersion);

            // Check if we should grant any trial
            if (remainingDays <= 0 && !isNewerVersion) {
                // Check if promo ended dialog was already shown for this version
                if (existingTrialData.upgradeDialogShownVersion !== currentVersion) {
                    // Check if user has pro subscription before showing promo dialog
                    const hasProSubscription = await _hasProSubscription();
                    if (!hasProSubscription) {
                        console.log("Existing trial expired, showing promo ended dialog");
                        ProDialogs.showProEndedDialog();
                    } else {
                        console.log("Existing trial expired, but user has pro subscription - skipping promo dialog");
                    }
                    // Store that dialog was shown for this version
                    await _setTrialData({
                        ...existingTrialData,
                        upgradeDialogShownVersion: currentVersion
                    });
                } else {
                    console.log("Existing trial expired, upgrade dialog already shown for this version");
                }
                return;
            }

            // Determine trial days and end date
            if (isNewerVersion) {
                if (remainingDays >= SUBSEQUENT_TRIAL_DAYS) {
                    // Newer version but existing trial is longer - keep existing
                    console.log(`Newer version, keeping existing trial (${remainingDays} days)`);
                    trialDays = remainingDays;
                    endDate = existingTrialData.endDate;
                    metricString = `nD_${metricString}_upgrade`;
                } else {
                    // Newer version with shorter existing trial - give 3 days
                    console.log(`Newer version - granting ${SUBSEQUENT_TRIAL_DAYS} days trial`);
                    trialDays = SUBSEQUENT_TRIAL_DAYS;
                    endDate = now + (trialDays * MS_PER_DAY);
                    metricString = `3D_${metricString}`;
                }
            } else {
                // Same/older version: keep existing trial - no changes needed
                console.log(`Same/older version - keeping existing ${remainingDays} day trial.`);
                return;
            }
        } else {
            // First install - 30 days from now
            endDate = now + (FIRST_INSTALL_TRIAL_DAYS * MS_PER_DAY);
            metricString = `1Mo_${metricString}`;
        }

        const trialData = {
            proVersion: currentVersion,
            endDate: endDate
        };

        await _setTrialData(trialData);
        Metrics.countEvent(Metrics.EVENT_TYPE.PRO, "trialAct", metricString);
        Metrics.countEvent(Metrics.EVENT_TYPE.PRO, "trial", "activated");
        console.log(`Pro trial activated for ${trialDays} days`);

        // Check if user has pro subscription before showing upgrade dialog
        const hasProSubscription = await _hasProSubscription();
        if (!hasProSubscription) {
            ProDialogs.showProUpgradeDialog(trialDays);
        } else {
            console.log("Pro trial activated, but user has pro subscription - skipping upgrade dialog");
        }
        // Trigger the event for UI to handle
        LoginService.trigger(EVENT_PRO_UPGRADE_ON_INSTALL, {
            trialDays: trialDays,
            isFirstInstall: !existingTrialData
        });

        // Also trigger entitlements changed event since effective entitlements have changed
        // This allows UI components to update based on the new trial status
        await LoginService.getEffectiveEntitlements();
        LoginService.trigger(LoginService.EVENT_ENTITLEMENTS_CHANGED);
    }

    function _isAnyDialogsVisible() {
        const $modal = $(`.modal.instance`);
        const $notifications = $(`.notification-ui-tooltip`);
        return ($modal.length > 0 && $modal.is(':visible')) ||
            ($notifications.length > 0 && $notifications.is(':visible'));
    }

    /**
     * Start the pro trial activation process
     */
    console.log(`Checking pro trial activation in ${TRIAL_POLL_MS / 1000} seconds...`);

    const trialActivatePoller = setInterval(()=> {
        if(Phoenix.isTestWindow) {
            clearInterval(trialActivatePoller);
            return;
        }
        if(_isAnyDialogsVisible()){
            // maybe the user hasn't dismissed the new project dialog
            return;
        }
        clearInterval(trialActivatePoller);
        activateProTrial().catch(error => {
            Metrics.countEvent(Metrics.EVENT_TYPE.PRO, "trial", `errActivate`);
            logger.reportError(error, "Error activating pro trial:");
        });
    }, TRIAL_POLL_MS);

    // Add to secure exports
    LoginService.getProTrialDaysRemaining = getProTrialDaysRemaining;
    LoginService.EVENT_PRO_UPGRADE_ON_INSTALL = EVENT_PRO_UPGRADE_ON_INSTALL;

    // no public exports to prevent extension tampering
});
