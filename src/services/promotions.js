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
        semver = require("thirdparty/semver.browser");

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
     * Check if pro trial is currently activated
     */
    async function isProTrialActivated() {
        const trialData = await _getTrialData();
        if (!trialData) {
            return false;
        }

        const remainingDays = _calculateRemainingTrialDays(trialData);

        return remainingDays > 0;
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
                console.log("Existing trial expired, same/older version - no new trial");
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

        // Trigger the event for UI to handle
        LoginService.trigger(EVENT_PRO_UPGRADE_ON_INSTALL, {
            trialDays: trialDays,
            isFirstInstall: !existingTrialData
        });
    }

    function _isAnyDialogsVisible() {
        const $modal = $(`.modal.instance`);
        return $modal.length > 0 && $modal.is(':visible');
    }

    /**
     * Start the pro trial activation process
     * Waits 2 minutes, then triggers the upgrade event
     */
    console.log(`Checking pro trial activation in ${TRIAL_POLL_MS / 1000} seconds...`);

    const trialActivatePoller = setInterval(()=> {
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
    LoginService.isProTrialActivated = isProTrialActivated;
    LoginService.EVENT_PRO_UPGRADE_ON_INSTALL = EVENT_PRO_UPGRADE_ON_INSTALL;

    // no public exports to prevent extension tampering
});
