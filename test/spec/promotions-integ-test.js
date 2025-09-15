/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 *
 * This program is free software: you can redistribute it and/or modify it
 * under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT
 * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
 * FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License
 * for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see https://opensource.org/licenses/AGPL-3.0.
 *
 */

/*global describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, awaitsFor, awaitsForDone, awaits*/

define(function (require, exports, module) {

    const SpecRunnerUtils = require("spec/SpecRunnerUtils");

    describe("integration:Promotions", function () {

        if (Phoenix.isTestWindowGitHubActions && Phoenix.platform === "linux") {
            // Credentials test doesn't work in GitHub actions in linux desktop as the runner cant reach key ring.
            it("Should not run in github actions in linux desktop", async function () {
                expect(1).toEqual(1);
            });
            return;
        }

        let testWindow,
            LoginService,
            ProDialogs,
            originalAppConfig,
            originalFetch,
            mockNow = 1000000000000; // Fixed timestamp for consistent testing

        beforeAll(async function () {
            testWindow = await SpecRunnerUtils.createTestWindowAndRun();

            // Access modules from test window
            LoginService = testWindow._test_promo_login_exports;
            ProDialogs = testWindow._test_promo_login_exports.ProDialogs;

            // Debug: Check what's available in the exports
            console.log('Debug: Available exports:', Object.keys(LoginService));
            console.log('Debug: setDateNowFn available?', !!LoginService.setDateNowFn);

            // Use the new setDateNowFn injection mechanism
            if (LoginService.setDateNowFn) {
                LoginService.setDateNowFn(() => {
                    return mockNow;
                });
            } else {
                throw new Error('setDateNowFn not available in test exports');
            }

            // Set up fetch mocking for pro dialogs
            if (testWindow._test_pro_dlg_login_exports && testWindow._test_pro_dlg_login_exports.setFetchFn) {
                // Store reference for later restoration
                originalFetch = testWindow.fetch;
            }

            // Store original config and mock AppConfig for tests
            originalAppConfig = testWindow.AppConfig;
            testWindow.AppConfig = {
                version: "3.1.0",
                apiVersion: "3.1.0"
            };
        }, 30000);

        afterAll(async function () {
            // Restore original values
            if (originalAppConfig) {
                testWindow.AppConfig = originalAppConfig;
            }

            // Restore original fetch if it was mocked
            if (originalFetch && testWindow._test_pro_dlg_login_exports && testWindow._test_pro_dlg_login_exports.setFetchFn) {
                testWindow._test_pro_dlg_login_exports.setFetchFn(originalFetch);
            }

            testWindow = null;
            LoginService = null;
            ProDialogs = null;
            originalFetch = null;
            await SpecRunnerUtils.closeTestWindow();
        }, 30000);

        it("should require user to be logged out for promotion tests to work", async function () {
            // Check if user is logged in - these tests only work for non-logged-in users
            const isLoggedIn = LoginService.LoginService.isLoggedIn();
            if (isLoggedIn) {
                throw new Error("Promotion tests require user to be logged out. Please log out before running these tests. Logged-in users with pro subscriptions will not trigger trial activation logic.");
            }
            // If we reach here, user is not logged in - tests should work
            expect(isLoggedIn).toBe(false);
        });

        describe("Trial Activation", function () {

            it("should have access to trial functions", function () {
                // Basic test to verify our exports work
                expect(LoginService._getTrialData).toBeDefined();
                expect(LoginService._setTrialData).toBeDefined();
                expect(LoginService._getSalt).toBeDefined();
                expect(LoginService._isTrialClosedForCurrentVersion).toBeDefined();
                expect(LoginService._cleanTrialData).toBeDefined();
                expect(LoginService._cleanSaltData).toBeDefined();
                expect(LoginService.activateProTrial).toBeDefined();
                expect(LoginService.getProTrialDaysRemaining).toBeDefined();
                expect(LoginService.setDateNowFn).toBeDefined();
            });

            it("should activate 30-day trial on first install (not logged in)", async function () {
                // Note: This test assumes user is not logged in, so _hasProSubscription will return false
                // Clear any existing trial data first
                await LoginService._cleanTrialData();

                // Call the function - this simulates first install scenario
                await LoginService.activateProTrial();

                // Get the trial data that was actually stored
                const storedResult = await LoginService._getTrialData();

                // Verify trial data was set correctly
                expect(storedResult).not.toBeNull();
                expect(storedResult.data).toBeDefined();
                expect(storedResult.data.proVersion).toBe("3.1.0");

                // Check that a 30-day trial was activated with mocked time
                const expectedEndDate = mockNow + (30 * LoginService.TRIAL_CONSTANTS.MS_PER_DAY);
                expect(storedResult.data.endDate).toBe(expectedEndDate);

                // Verify upgrade dialog appears with correct content
                await testWindow.__PR.waitForModalDialog(".modal");
                const modalContent = testWindow.$('.modal');
                expect(modalContent.length).toBeGreaterThan(0);

                // Check dialog content
                const dialogText = modalContent.text();
                expect(dialogText.toLowerCase()).toContain('you’ve been upgraded to');
                expect(dialogText).toContain('Phoenix Pro');
                expect(dialogText).toContain('30 days');

                // Close the dialog
                testWindow.__PR.clickDialogButtonID(testWindow.__PR.Dialogs.DIALOG_BTN_OK);
                await testWindow.__PR.waitForModalDialogClosed(".modal");
            });

            it("should activate 7-day trial on version upgrade (not logged in)", async function () {
                const existingTrial = {
                    proVersion: "3.0.0",
                    endDate: mockNow - (1 * LoginService.TRIAL_CONSTANTS.MS_PER_DAY), // Expired yesterday
                    signature: "mock_signature"
                };

                // Set up existing trial data first
                await LoginService._setTrialData(existingTrial);

                await LoginService.activateProTrial();

                // Get the updated trial data
                const updatedResult = await LoginService._getTrialData();

                // Verify new trial data was set for newer version
                expect(updatedResult).not.toBeNull();
                expect(updatedResult.data).toBeDefined();
                expect(updatedResult.data.proVersion).toBe("3.1.0");

                // Check that 3-day trial was granted with mocked time
                const expectedEndDate = mockNow + (LoginService.TRIAL_CONSTANTS.SUBSEQUENT_TRIAL_DAYS
                    * LoginService.TRIAL_CONSTANTS.MS_PER_DAY);
                expect(updatedResult.data.endDate).toBe(expectedEndDate);

                // Verify upgrade dialog appears with correct content
                await testWindow.__PR.waitForModalDialog(".modal");
                const modalContent = testWindow.$('.modal');
                expect(modalContent.length).toBeGreaterThan(0);

                // Check dialog content
                const dialogText = modalContent.text();
                expect(dialogText.toLowerCase()).toContain('you’ve been upgraded to');
                expect(dialogText).toContain('Phoenix Pro');
                expect(dialogText).toContain('7 days');

                // Close the dialog
                testWindow.__PR.clickDialogButtonID(testWindow.__PR.Dialogs.DIALOG_BTN_OK);
                await testWindow.__PR.waitForModalDialogClosed(".modal");
            });

            it("should keep existing trial if longer than 7 days on version upgrade (not logged in)", async function () {
                const futureEndDate = mockNow + (10 * LoginService.TRIAL_CONSTANTS.MS_PER_DAY);
                const existingTrial = {
                    proVersion: "3.0.0",
                    endDate: futureEndDate,
                    signature: "mock_signature"
                };

                // Set up existing trial data first
                await LoginService._setTrialData(existingTrial);

                await LoginService.activateProTrial();

                // Get the updated trial data
                const updatedResult = await LoginService._getTrialData();

                // Verify existing trial was preserved but version updated
                expect(updatedResult).not.toBeNull();
                expect(updatedResult.data).toBeDefined();
                expect(updatedResult.data.proVersion).toBe("3.1.0");
                expect(updatedResult.data.endDate).toBe(futureEndDate);

                await testWindow.__PR.waitForModalDialog(".modal");
                // Check dialog content
                const modalContent = testWindow.$('.modal');
                const dialogText = modalContent.text();
                expect(dialogText.toLowerCase()).toContain('you’ve been upgraded to');
                expect(dialogText).toContain('Phoenix Pro');
                expect(dialogText).toContain('10 days');

                testWindow.__PR.clickDialogButtonID(testWindow.__PR.Dialogs.DIALOG_BTN_OK);
                await testWindow.__PR.waitForModalDialogClosed(".modal");
            });

            // Note: Cannot easily test pro user scenarios in integration tests
            // since _hasProSubscription is private and depends on actual login state

            it("should not activate trial for same version (not logged in)", async function () {
                const existingTrial = {
                    proVersion: "3.1.0", // Same version
                    endDate: mockNow + (5 * LoginService.TRIAL_CONSTANTS.MS_PER_DAY),
                    signature: "mock_signature"
                };

                // Set up existing trial data first
                await LoginService._setTrialData(existingTrial);

                await LoginService.activateProTrial();

                // Get the trial data after activation
                const currentResult = await LoginService._getTrialData();

                // Verify trial data remains unchanged (same version, same end date)
                expect(currentResult.data).toBeDefined();
                expect(currentResult.data.proVersion).toBe("3.1.0");
                expect(currentResult.data.endDate).toBe(existingTrial.endDate);

                // For same version, no dialog should appear
                await awaits(500);
                const modalContent = testWindow.$('.modal:visible');
                expect(modalContent.length).toBe(0);
            });

            it("should not activate trial for older current version (not logged in)", async function () {
                const existingTrial = {
                    proVersion: "3.2.0", // Newer than current 3.1.0
                    endDate: mockNow + (5 * LoginService.TRIAL_CONSTANTS.MS_PER_DAY),
                    signature: "mock_signature"
                };

                // Set up existing trial data first
                await LoginService._setTrialData(existingTrial);

                await LoginService.activateProTrial();

                // Get the trial data after activation
                const currentResult = await LoginService._getTrialData();

                // Verify trial data remains unchanged (older current version scenario)
                expect(currentResult.data).toBeDefined();
                expect(currentResult.data.proVersion).toBe("3.2.0"); // Should preserve original version
                expect(currentResult.data.endDate).toBe(existingTrial.endDate); // Should preserve end date

                // For older current version, no dialog should appear
                await awaits(500);
                const modalContent = testWindow.$('.modal:visible');
                expect(modalContent.length).toBe(0);
            });
        });

        describe("Trial Expiration", function () {

            async function setupExpiredTrialAndActivate() {
                const expiredTrial = {
                    proVersion: "3.1.0", // Same version as current to trigger ended dialog
                    endDate: mockNow - LoginService.TRIAL_CONSTANTS.MS_PER_DAY, // Expired yesterday
                    signature: "mock_signature"
                };

                // Set up expired trial data first
                await LoginService._setTrialData(expiredTrial);

                await LoginService.activateProTrial();

                // Get the updated trial data
                const updatedResult = await LoginService._getTrialData();

                // Verify upgrade dialog shown flag was set
                expect(updatedResult).not.toBeNull();
                expect(updatedResult.data).toBeDefined();
                expect(updatedResult.data.upgradeDialogShownVersion).toBe("3.1.0");
                expect(updatedResult.data.proVersion).toBe("3.1.0"); // Should preserve original version
                expect(updatedResult.data.endDate).toBe(expiredTrial.endDate); // Should preserve end date

                return { expiredTrial, updatedTrialData: updatedResult.data };
            }

            it("should show local promo ended dialog when trial expires (offline/fetch fails)", async function () {
                // Mock fetch to fail (network error)
                if (testWindow._test_pro_dlg_login_exports && testWindow._test_pro_dlg_login_exports.setFetchFn) {
                    testWindow._test_pro_dlg_login_exports.setFetchFn(() => {
                        return Promise.reject(new Error('Network error'));
                    });
                }

                // Set up expired trial and activate
                await setupExpiredTrialAndActivate();

                // Wait for modal dialog and verify it's the local "ended" dialog
                await testWindow.__PR.waitForModalDialog(".modal");
                const modalContent = testWindow.$('.modal');
                expect(modalContent.length).toBeGreaterThan(0);

                // Verify it's the local dialog (has text content, no iframe)
                const dialogText = modalContent.text();
                expect(dialogText).toContain('Phoenix Pro');
                expect(dialogText).toContain('Trial has ended');

                // Verify NO iframe present (local dialog)
                const iframes = modalContent.find('iframe');
                expect(iframes.length).toBe(0);

                // Close local dialog - simpler button structure
                testWindow.__PR.clickDialogButtonID("secondaryButton");
                await testWindow.__PR.waitForModalDialogClosed(".modal");
            });

            it("should show remote promo ended dialog when trial expires (online)", async function () {
                // Mock fetch to succeed with remote config
                if (testWindow._test_pro_dlg_login_exports && testWindow._test_pro_dlg_login_exports.setFetchFn) {
                    testWindow._test_pro_dlg_login_exports.setFetchFn(() => {
                        return Promise.resolve({
                            ok: true,
                            json: () => Promise.resolve({
                                upsell_after_trial_url: "https://phcode.io",
                                upsell_purchase_url: "https://phcode.dev/pricing"
                            })
                        });
                    });
                }

                // Set up expired trial and activate
                await setupExpiredTrialAndActivate();

                // Wait for modal dialog and verify it's the remote dialog
                await testWindow.__PR.waitForModalDialog(".modal");
                const modalContent = testWindow.$('.modal');
                expect(modalContent.length).toBeGreaterThan(0);

                // Verify it's the remote dialog (contains iframe)
                const iframes = modalContent.find('iframe');
                expect(iframes.length).toBeGreaterThan(0);

                // Close remote dialog - may have complex button structure
                testWindow.__PR.clickDialogButtonID(testWindow.__PR.Dialogs.DIALOG_BTN_CANCEL);
                await testWindow.__PR.waitForModalDialogClosed(".modal");
            });

            it("should grant new trial when expired trial is from older version (not logged in)", async function () {
                const expiredTrial = {
                    proVersion: "3.0.0", // Older version than current 3.1.0
                    endDate: mockNow - LoginService.TRIAL_CONSTANTS.MS_PER_DAY, // Expired yesterday
                    signature: "mock_signature"
                };

                // Set up expired trial data first
                await LoginService._setTrialData(expiredTrial);

                await LoginService.activateProTrial();

                // Get the updated trial data
                const updatedTrialData = await LoginService._getTrialData();

                // Verify new trial was granted for version upgrade
                expect(updatedTrialData).not.toBeNull();
                expect(updatedTrialData.data).toBeDefined();
                expect(updatedTrialData.data.proVersion).toBe("3.1.0"); // Should update to current version

                // Should grant 7-day trial for version upgrade
                const expectedEndDate = mockNow + (7 * LoginService.TRIAL_CONSTANTS.MS_PER_DAY);
                expect(updatedTrialData.data.endDate).toBe(expectedEndDate);

                // Should show upgrade dialog (not ended dialog)
                await testWindow.__PR.waitForModalDialog(".modal");
                const modalContent = testWindow.$('.modal');
                expect(modalContent.length).toBeGreaterThan(0);

                const dialogText = modalContent.text();
                expect(dialogText.toLowerCase()).toContain('you’ve been upgraded to');
                expect(dialogText).toContain('Phoenix Pro');
                expect(dialogText).toContain('7 days');

                // Close the dialog
                testWindow.__PR.clickDialogButtonID(testWindow.__PR.Dialogs.DIALOG_BTN_OK);
                await testWindow.__PR.waitForModalDialogClosed(".modal");
            });

            // Note: Additional expiration scenarios (dialog already shown, pro users)
            // are difficult to test without mocking private functions
        });

        describe("Trial Days Calculation", function () {

            it("should return remaining trial days", async function () {
                const futureEndDate = mockNow + (5.7 * LoginService.TRIAL_CONSTANTS.MS_PER_DAY);
                const trialData = {
                    proVersion: "3.1.0",
                    endDate: futureEndDate
                };

                // Set up trial data
                await LoginService._setTrialData(trialData);

                const remainingDays = await LoginService.getProTrialDaysRemaining();

                // Should round up to 6 days
                expect(remainingDays).toBe(6);
            });

            it("should return 0 for expired trials", async function () {
                const pastEndDate = mockNow - (2 * LoginService.TRIAL_CONSTANTS.MS_PER_DAY);
                const trialData = {
                    proVersion: "3.1.0",
                    endDate: pastEndDate
                };

                // Set up expired trial data
                await LoginService._setTrialData(trialData);

                const remainingDays = await LoginService.getProTrialDaysRemaining();

                expect(remainingDays).toBe(0);
            });
        });

        // Note: Version comparison, pro subscription checks, and event triggering
        // are internal implementation details that are difficult to test reliably
        // in integration tests without extensive mocking of private functions

        describe("Security Tests", function () {

            beforeEach(async function() {
                // Restore original fetch to ensure clean state between tests
                // This prevents fetch mocks from previous tests affecting security tests
                if (originalFetch && testWindow._test_pro_dlg_login_exports && testWindow._test_pro_dlg_login_exports.setFetchFn) {
                    testWindow._test_pro_dlg_login_exports.setFetchFn(originalFetch);
                }
            });

            it("should detect and prevent signature tampering attacks", async function () {
                // Setup: Create a valid trial first
                const validTrial = {
                    proVersion: "3.1.0",
                    endDate: mockNow + (5 * LoginService.TRIAL_CONSTANTS.MS_PER_DAY)
                };
                await LoginService._setTrialData(validTrial);

                // Get the valid trial data (should include signature)
                let storedResult = await LoginService._getTrialData();
                expect(storedResult).not.toBeNull();
                expect(storedResult.data).toBeDefined(); // Should have valid data
                expect(storedResult.error).toBeUndefined(); // Should not have error

                // Attack: Tamper with the signature
                const tamperedTrial = { ...storedResult.data, signature: "fake_signature" };

                // Manually store the tampered data (bypassing _setTrialData validation)
                await LoginService._testSetRawCredential(tamperedTrial);

                // Verify: _getTrialData should detect corruption
                const corruptedResult = await LoginService._getTrialData();
                expect(corruptedResult).not.toBeNull();
                expect(corruptedResult.error).toBe(LoginService.ERROR_CONSTANTS.ERR_CORRUPTED);

                // Verify: activateProTrial should create expired trial marker and deny trial
                await LoginService.activateProTrial();

                // Should create expired trial marker instead of clearing
                const resultAfterSecurity = await LoginService._getTrialData();
                expect(resultAfterSecurity).not.toBeNull(); // Should have expired trial data
                expect(resultAfterSecurity.data).toBeDefined();
                expect(resultAfterSecurity.data.proVersion).toBe("3.1.0");
                expect(resultAfterSecurity.data.endDate).toBe(mockNow); // Should be expired immediately (endDate: now)

                // Should return 0 remaining days (expired trial)
                const remainingDays = await LoginService.getProTrialDaysRemaining();
                expect(remainingDays).toBe(0);

                // Should show trial ended dialog (security notice)
                await testWindow.__PR.waitForModalDialog(".modal");
                const modalContent = testWindow.$('.modal');
                expect(modalContent.length).toBeGreaterThan(0);
                const dialogText = modalContent.text();
                expect(dialogText).toContain('Trial has ended');

                // Close dialog
                testWindow.__PR.clickDialogButtonID("secondaryButton");
                await testWindow.__PR.waitForModalDialogClosed(".modal");
            });

            it("should handle version downgrade without losing valid trials", async function () {
                // Setup: Create trial with newer app version salt
                testWindow.AppConfig.version = "3.2.0";
                testWindow.AppConfig.apiVersion = "3.2.0";

                // Clean any existing salt to simulate fresh install
                await LoginService._cleanSaltData();

                const futureTrial = {
                    proVersion: "3.2.0",
                    endDate: mockNow + (10 * LoginService.TRIAL_CONSTANTS.MS_PER_DAY)
                };
                await LoginService._setTrialData(futureTrial);

                // Verify trial is valid with 3.2.0
                let trialResult = await LoginService._getTrialData();
                expect(trialResult).not.toBeNull();
                expect(trialResult.data).toBeDefined();
                expect(trialResult.error).toBeUndefined();
                expect(trialResult.data.proVersion).toBe("3.2.0");

                // Simulate version downgrade - change app version
                testWindow.AppConfig.version = "3.1.0";
                testWindow.AppConfig.apiVersion = "3.1.0";

                // The per-user salt should remain the same, so signature should still be valid
                const downgradeResult = await LoginService._getTrialData();
                expect(downgradeResult).not.toBeNull();
                expect(downgradeResult.data).toBeDefined(); // Should have valid data
                expect(downgradeResult.error).toBeUndefined(); // Should NOT have error
                expect(downgradeResult.data.proVersion).toBe("3.2.0"); // Should preserve original version

                // Should still have valid remaining days
                const remainingDays = await LoginService.getProTrialDaysRemaining();
                expect(remainingDays).toBe(10);

                // activateProTrial should preserve the existing valid trial
                await LoginService.activateProTrial();
                const finalTrial = await LoginService._getTrialData();
                expect(finalTrial.data).toBeDefined();
                expect(finalTrial.data.proVersion).toBe("3.2.0"); // Should preserve newer version
                expect(finalTrial.data.endDate).toBe(futureTrial.endDate); // Should preserve end date
            });

            it("should handle missing signature fields gracefully", async function () {
                // Setup: Create trial data with missing signature field
                const trialWithoutSignature = {
                    proVersion: "3.1.0",
                    endDate: mockNow + (5 * LoginService.TRIAL_CONSTANTS.MS_PER_DAY)
                    // No signature field
                };

                // Manually store data without signature (bypassing _setTrialData)
                await LoginService._testSetRawCredential(trialWithoutSignature);

                // Should detect corruption due to missing signature
                const result = await LoginService._getTrialData();
                expect(result.error).toBe(LoginService.ERROR_CONSTANTS.ERR_CORRUPTED);

                // Should create expired trial marker for security
                await LoginService.activateProTrial();
                const afterActivation = await LoginService._getTrialData();
                expect(afterActivation).not.toBeNull(); // Should have expired trial data
                expect(afterActivation.data).toBeDefined();
                expect(afterActivation.data.proVersion).toBe("3.1.0");
                expect(afterActivation.data.endDate).toBe(mockNow); // Should be expired immediately (endDate: now)

                // Should return 0 remaining days (expired trial)
                const remainingDays = await LoginService.getProTrialDaysRemaining();
                expect(remainingDays).toBe(0);

                // Should show security dialog
                await testWindow.__PR.waitForModalDialog(".modal");
                const modalContent = testWindow.$('.modal');
                expect(modalContent.length).toBeGreaterThan(0);

                // Close dialog
                testWindow.__PR.clickDialogButtonID("secondaryButton");
                await testWindow.__PR.waitForModalDialogClosed(".modal");
            });

            it("should persist salt across app restarts", async function () {
                // Clean existing salt
                await LoginService._cleanSaltData();

                // Get salt (should generate new one)
                const salt1 = await LoginService._getSalt();
                expect(salt1).toBeDefined();
                expect(typeof salt1).toBe('string');
                expect(salt1.length).toBeGreaterThan(10); // Should be substantial UUID

                // Get salt again (should return same one)
                const salt2 = await LoginService._getSalt();
                expect(salt2).toBe(salt1);

                // Create and store trial with this salt
                const trial = {
                    proVersion: "3.1.0",
                    endDate: mockNow + (5 * LoginService.TRIAL_CONSTANTS.MS_PER_DAY)
                };
                await LoginService._setTrialData(trial);

                // Verify trial is valid
                const storedResult = await LoginService._getTrialData();
                expect(storedResult.data).toBeDefined();
                expect(storedResult.error).toBeUndefined();

                // Simulate "app restart" - get salt again
                const salt3 = await LoginService._getSalt();
                expect(salt3).toBe(salt1); // Should be persistent

                // Trial should still be valid after "restart"
                const restartResult = await LoginService._getTrialData();
                expect(restartResult.data).toBeDefined();
                expect(restartResult.error).toBeUndefined();
                expect(restartResult.data.proVersion).toBe("3.1.0");
            });

            it("should prevent future trial grants after corruption creates expired marker", async function () {
                // Setup: Create a valid trial first
                const validTrial = {
                    proVersion: "3.1.0",
                    endDate: mockNow + (5 * LoginService.TRIAL_CONSTANTS.MS_PER_DAY)
                };
                await LoginService._setTrialData(validTrial);

                // Attack: Corrupt the trial data
                const storedResult = await LoginService._getTrialData();
                const tamperedTrial = { ...storedResult.data, signature: "fake_signature" };

                // Manually store the tampered data (bypassing validation)
                await LoginService._testSetRawCredential(tamperedTrial);

                // First activation should create expired marker
                await LoginService.activateProTrial();

                // Dismiss the security dialog
                await testWindow.__PR.waitForModalDialog(".modal");
                testWindow.__PR.clickDialogButtonID("secondaryButton");
                await testWindow.__PR.waitForModalDialogClosed(".modal");

                // Verify expired marker exists
                const expiredResult = await LoginService._getTrialData();
                expect(expiredResult.data).toBeDefined();
                expect(expiredResult.data.endDate).toBe(mockNow); // Should be expired immediately

                // Simulate app restart by calling activateProTrial again
                // This should NOT grant a new 30-day trial
                await LoginService.activateProTrial();

                // Should show trial ended dialog again (since trial is still expired)
                await testWindow.__PR.waitForModalDialog(".modal");
                testWindow.__PR.clickDialogButtonID("secondaryButton");
                await testWindow.__PR.waitForModalDialogClosed(".modal");

                // Should still have the expired marker, not a new 30-day trial
                const afterRestartResult = await LoginService._getTrialData();
                expect(afterRestartResult.data).toBeDefined();
                expect(afterRestartResult.data.endDate).toBe(mockNow); // Still expired immediately
                expect(afterRestartResult.data.endDate).toBe(expiredResult.data.endDate); // Same end date

                // Should still return 0 days
                const remainingDays = await LoginService.getProTrialDaysRemaining();
                expect(remainingDays).toBe(0);
            });

            it("should detect time manipulation attacks (system clock rollback)", async function () {
                // Setup: Create an expired trial with dialog shown flag
                const expiredTrial = {
                    proVersion: "3.1.0",
                    endDate: mockNow - (5 * LoginService.TRIAL_CONSTANTS.MS_PER_DAY), // Expired 5 days ago
                    upgradeDialogShownVersion: "3.1.0" // Dialog already shown for current version
                };
                await LoginService._setTrialData(expiredTrial);

                // Verify trial is properly expired
                const expiredResult = await LoginService._getTrialData();
                expect(expiredResult.data).toBeDefined();
                expect(expiredResult.error).toBeUndefined();

                // Verify _isTrialClosedForCurrentVersion detects closed trial
                const isClosedBefore = await LoginService._isTrialClosedForCurrentVersion(expiredResult.data);
                expect(isClosedBefore).toBe(true);

                // Attack: User rolls back system time to make trial appear valid
                const rolledBackTime = mockNow - (10 * LoginService.TRIAL_CONSTANTS.MS_PER_DAY); // 10 days ago
                LoginService.setDateNowFn(() => rolledBackTime);

                // Despite rollback, _calculateRemainingTrialDays would show positive days
                const remainingDaysAfterRollback = await LoginService.getProTrialDaysRemaining();
                // But getProTrialDaysRemaining should still return 0 due to closure detection
                expect(remainingDaysAfterRollback).toBe(0);

                // Verify _isTrialClosedForCurrentVersion still detects closed trial despite time manipulation
                const isClosedAfterRollback = await LoginService._isTrialClosedForCurrentVersion(expiredResult.data);
                expect(isClosedAfterRollback).toBe(true); // Should still be closed

                // Reset time
                LoginService.setDateNowFn(() => mockNow);

                // activateProTrial should not grant new trial even after time manipulation
                await LoginService.activateProTrial();

                // Should still have the same expired trial, not a new one
                const finalResult = await LoginService._getTrialData();
                expect(finalResult.data).toBeDefined();
                expect(finalResult.data.endDate).toBe(expiredTrial.endDate); // Same end date
                expect(finalResult.data.upgradeDialogShownVersion).toBe("3.1.0"); // Flag preserved
            });

            it("should respect trial closure flags across version changes", async function () {
                // Setup: Create a trial that's expired for current version but not time-expired
                const validTrial = {
                    proVersion: "3.0.0", // Older version
                    endDate: mockNow + (5 * LoginService.TRIAL_CONSTANTS.MS_PER_DAY), // Still has time remaining
                    upgradeDialogShownVersion: "3.1.0" // Dialog was already shown for current version
                };
                await LoginService._setTrialData(validTrial);

                // Current version is 3.1.0, which is newer than trial version 3.0.0
                // Trial has remaining time but dialog was shown for current version
                const trialResult = await LoginService._getTrialData();
                expect(trialResult.data).toBeDefined();

                // _isTrialClosedForCurrentVersion should return true because dialog was shown for current version
                const isClosed = await LoginService._isTrialClosedForCurrentVersion(trialResult.data);
                expect(isClosed).toBe(true);

                // getProTrialDaysRemaining should return 0 due to closure flag
                const remainingDays = await LoginService.getProTrialDaysRemaining();
                expect(remainingDays).toBe(0);

                // activateProTrial should not grant new trial due to closure flag
                await LoginService.activateProTrial();

                // Should preserve the existing trial with dialog shown flag
                const finalResult = await LoginService._getTrialData();
                expect(finalResult.data).toBeDefined();
                expect(finalResult.data.endDate).toBe(validTrial.endDate); // Same end date
                expect(finalResult.data.upgradeDialogShownVersion).toBe("3.1.0"); // Flag preserved

                // Test version upgrade scenario - newer version should work
                testWindow.AppConfig.apiVersion = "3.2.0"; // Upgrade to newer version

                // Now _isTrialClosedForCurrentVersion should return false for the newer version
                const isClosedAfterUpgrade = await LoginService._isTrialClosedForCurrentVersion(finalResult.data);
                expect(isClosedAfterUpgrade).toBe(false); // Should not be closed for newer version

                // Should now have remaining days since it's a newer version
                const remainingAfterUpgrade = await LoginService.getProTrialDaysRemaining();
                expect(remainingAfterUpgrade).toBeGreaterThan(0);

                // Reset version for cleanup
                testWindow.AppConfig.apiVersion = "3.1.0";
            });

            afterEach(async function() {
                // Clean up after each security test
                await LoginService._cleanTrialData();
                await LoginService._cleanSaltData();

                // Reset app config to default
                testWindow.AppConfig = {
                    version: "3.1.0",
                    apiVersion: "3.1.0"
                };
            });
        });
    });
});
