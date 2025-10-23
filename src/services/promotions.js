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

/*global logger, path*/

/**
 * Promotions Service
 *
 * Manages pro trial promotions for both native and browser applications.
 * Provides loginless pro trials
 *
 * - First install: 30-day trial on first usage
 * - Subsequent versions: 7-day trial (or remaining from 30-day if still valid)
 * - Older versions: No new trial, but existing 30-day trial remains valid
 */

define(function (require, exports, module) {

    require("./setup-login-service"); // this adds loginService to KernalModeTrust
    const Metrics = require("utils/Metrics"),
        semver = require("thirdparty/semver.browser"),
        ProDialogs = require("./pro-dialogs");

    let dateNowFn = Date.now;
    const KernalModeTrust = window.KernalModeTrust;
    if (!KernalModeTrust) {
        throw new Error("Promotions service requires access to KernalModeTrust. Cannot boot without trust ring");
    }

    const LoginService = KernalModeTrust.loginService;

    // Constants
    const EVENT_PRO_UPGRADE_ON_INSTALL = "pro_upgrade_on_install";
    const PROMO_LOCAL_FILE = path.join(Phoenix.app.getApplicationSupportDirectory(),
        Phoenix.isTestWindow ? "entitlements_promo_test.json" : "entitlements_promo.json");
    const TRIAL_POLL_MS = 10 * 1000; // 10 seconds after start, we assign a free trial if possible
    const FIRST_INSTALL_TRIAL_DAYS = 30;
    const SUBSEQUENT_TRIAL_DAYS = 7;
    const MS_PER_DAY = 24 * 60 * 60 * 1000;

    // Error constants for _getTrialData
    const ERR_CORRUPTED = "corrupted";

    /**
     * Async wrapper for fs.writeFile in browser
     */
    function _writeFileAsync(filePath, data) {
        return new Promise((resolve, reject) => {
            window.fs.writeFile(filePath, data, 'utf8', (err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }

    /**
     * Clear trial data from storage (reusable function)
     */
    async function _clearTrialData() {
        try {
            if (Phoenix.isNativeApp) {
                await KernalModeTrust.removeCredential(KernalModeTrust.CRED_KEY_PROMO);
            } else {
                await new Promise((resolve) => {
                    window.fs.unlink(PROMO_LOCAL_FILE, () => resolve()); // Always resolve, ignore errors
                });
            }
        } catch (error) {
            console.log("Error clearing trial data:", error);
        }
    }

    /**
     * Generate SHA-256 signature for trial data integrity
     */
    async function _generateSignature(proVersion, endDate) {
        const salt = await LoginService.getSalt();
        const data = proVersion + "|" + endDate;
        return KernalModeTrust.generateDataSignature(data, salt);
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
     * Get stored trial data with validation and corruption detection
     * Returns: {data: {...}} for valid data, {error: ERR_CORRUPTED} for errors, or null for no data
     */
    async function _getTrialData() {
        try {
            if (Phoenix.isNativeApp) {
                // Native app: use KernalModeTrust credential store
                const data = await KernalModeTrust.getCredential(KernalModeTrust.CRED_KEY_PROMO);
                if (!data) {
                    return null; // No data exists - genuine first install
                }
                try {
                    const trialData = JSON.parse(data);
                    const isValid = await _isValidSignature(trialData);
                    if (isValid) {
                        return { data: trialData }; // Valid trial data
                    }
                    return { error: ERR_CORRUPTED }; // Data exists but signature invalid
                } catch (e) {
                    return { error: ERR_CORRUPTED }; // JSON parse error
                }
            } else {
                // Browser app: use virtual filesystem. in future we need to always fetch from remote about trial
                // entitlements for browser app.
                const fileData = await Phoenix.VFS.readFileResolves(PROMO_LOCAL_FILE, 'utf8');

                if (fileData.error) {
                    return null; // No data exists - genuine first install
                }

                try {
                    const trialData = JSON.parse(fileData.data);
                    const isValid = await _isValidSignature(trialData);
                    if (isValid) {
                        return { data: trialData }; // Valid trial data
                    }
                    return { error: ERR_CORRUPTED }; // Data exists but signature invalid
                } catch (e) {
                    return { error: ERR_CORRUPTED }; // JSON parse error
                }
            }
        } catch (error) {
            console.error("Error getting trial data:", error);
            return { error: ERR_CORRUPTED }; // Treat error as corrupted/tampered data
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
                await KernalModeTrust.setCredential(KernalModeTrust.CRED_KEY_PROMO, JSON.stringify(trialData));
            } else {
                // Browser app: use virtual filesystem
                await _writeFileAsync(PROMO_LOCAL_FILE, JSON.stringify(trialData));
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
        const now = dateNowFn();
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
     * Check if user has active pro subscription. this calls actual login endpoint and is not to be used frequently!.
     * Returns true if user is logged in and has a paid subscription
     */
    async function _hasProSubscription() {
        try {
            // First verify login status to ensure login state is properly resolved
            await LoginService._verifyLoginStatus();

            // getEntitlements() returns null if not logged in
            const entitlements = await LoginService.getEntitlements();
            return entitlements && entitlements.plan && entitlements.plan.isSubscriber === true;
        } catch (error) {
            console.error("Error checking pro subscription:", error);
            return false;
        }
    }

    function _isTrialClosedForCurrentVersion(currentTrialData) {
        if(!currentTrialData) {
            return false;
        }
        const currentVersion = window.AppConfig ? window.AppConfig.apiVersion : "1.0.0";
        const remainingDays = _calculateRemainingTrialDays(currentTrialData);
        const trialVersion = currentTrialData.proVersion;
        const isNewerVersion = _isNewerVersion(currentVersion, trialVersion);
        const trialClosedDialogShown = currentTrialData.upgradeDialogShownVersion === currentVersion;
        // if isCurrentVersionTrialClosed and if remainingDays > 0, it means that user put back system time to
        // before trial end. in this case we should not grant any trial.
        return trialClosedDialogShown || (remainingDays <= 0 && !isNewerVersion);
    }

    /**
     * Get remaining pro trial days
     * Returns 0 if no trial or trial expired
     */
    async function getProTrialDaysRemaining() {
        const result = await _getTrialData();
        if (!result || result.error || _isTrialClosedForCurrentVersion(result.data)) {
            return 0;
        }

        return _calculateRemainingTrialDays(result.data);
    }

    async function activateProTrial() {
        const currentVersion = window.AppConfig ? window.AppConfig.apiVersion : "1.0.0";
        const result = await _getTrialData();

        let trialDays = FIRST_INSTALL_TRIAL_DAYS;
        let endDate;
        const now = dateNowFn();
        let metricString = `${currentVersion.replaceAll(".", "_")}`; // 3.1.0 -> 3_1_0

        // Handle corrupted or parse failed data - reset trial state and deny any trial grants
        if (result && result.error) {
            console.warn(`Trial data error detected (${result.error}) - resetting trial state without granting trial`);
            Metrics.countEvent(Metrics.EVENT_TYPE.PRO, "trial", "corrupt");

            // Check if user has pro subscription
            const hasProSubscription = await _hasProSubscription();
            if (hasProSubscription) {
                console.log("User has pro subscription - resetting corrupted trial marker");
                await _setTrialData({
                    proVersion: currentVersion,
                    endDate: now // Expires immediately
                });
                return;
            }

            // For corruption, show trial ended dialog and create expired marker
            // Do not grant any new trial as possible tampering.
            console.warn("trial data corrupted");
            ProDialogs.showProUpsellDialog(ProDialogs.UPSELL_TYPE_PRO_TRIAL_ENDED); // Show ended dialog for security

            // Create expired trial marker to prevent future trial grants
            await _setTrialData({
                proVersion: currentVersion,
                endDate: now // Expires immediately
            });
            return;
        }

        const existingTrialData = result ? result.data : null;
        if (existingTrialData) {
            // Existing trial found
            const remainingDays = _calculateRemainingTrialDays(existingTrialData);
            const trialVersion = existingTrialData.proVersion;
            const isNewerVersion = _isNewerVersion(currentVersion, trialVersion);

            // Check if we should grant any trial
            if (_isTrialClosedForCurrentVersion(existingTrialData)) {
                // Check if promo ended dialog was already shown for this version
                if (existingTrialData.upgradeDialogShownVersion !== currentVersion) {
                    // Check if user has pro subscription before showing promo dialog
                    const hasProSubscription = await _hasProSubscription();
                    if (!hasProSubscription) {
                        console.log("Existing trial expired, showing promo ended dialog");
                        ProDialogs.showProUpsellDialog(ProDialogs.UPSELL_TYPE_PRO_TRIAL_ENDED);
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
                    // Newer version with shorter existing trial - give 7 days
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
            ProDialogs.showProTrialStartDialog(trialDays);
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
        const dialogsVisible = $(`.modal.instance`).is(':visible');
        const notificationsVisible = $(`.notification-ui-tooltip`).is(':visible');
        return dialogsVisible || notificationsVisible;
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

    // Test-only exports for integration testing
    if (Phoenix.isTestWindow) {
        window._test_promo_login_exports = {
            LoginService: LoginService,
            ProDialogs: ProDialogs,
            _getTrialData: _getTrialData,
            _setTrialData: _setTrialData,
            _isTrialClosedForCurrentVersion: _isTrialClosedForCurrentVersion,
            _cleanTrialData: _clearTrialData,
            _cleanSaltData: async function() {
                try {
                    if (Phoenix.isNativeApp) {
                        await KernalModeTrust.removeCredential(KernalModeTrust.SIGNATURE_SALT_KEY);
                        console.log("Salt data cleanup completed");
                    }
                    // in browser app we always return a static salt, so no need to clear it
                } catch (error) {
                    // Ignore cleanup errors
                    console.log("Salt data cleanup completed (ignoring errors)");
                }
            },
            // Test-only functions for manipulating credentials directly (bypassing validation)
            _testSetPromoJSON: async function(data) {
                if (Phoenix.isNativeApp) {
                    await KernalModeTrust.setCredential(KernalModeTrust.CRED_KEY_PROMO, JSON.stringify(data));
                } else {
                    await _writeFileAsync(PROMO_LOCAL_FILE, JSON.stringify(data));
                }
            },
            activateProTrial: activateProTrial,
            getProTrialDaysRemaining: getProTrialDaysRemaining,
            setDateNowFn: function _setDdateNowFn(fn) {
                dateNowFn = fn;
            },
            EVENT_PRO_UPGRADE_ON_INSTALL: EVENT_PRO_UPGRADE_ON_INSTALL,
            TRIAL_CONSTANTS: {
                FIRST_INSTALL_TRIAL_DAYS,
                SUBSEQUENT_TRIAL_DAYS,
                MS_PER_DAY
            },
            ERROR_CONSTANTS: {
                ERR_CORRUPTED
            }
        };
    }

    // no public exports to prevent extension tampering
});
