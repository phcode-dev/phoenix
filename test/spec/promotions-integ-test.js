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

        let testWindow,
            LoginService,
            ProDialogs,
            originalAppConfig,
            mockNow = 1000000000000; // Fixed timestamp for consistent testing

        beforeAll(async function () {
            testWindow = await SpecRunnerUtils.createTestWindowAndRun();

            // Access modules from test window
            LoginService = testWindow._test_login_exports;
            ProDialogs = testWindow._test_login_exports.ProDialogs;

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

            testWindow = null;
            LoginService = null;
            ProDialogs = null;
            await SpecRunnerUtils.closeTestWindow();
        }, 30000);

        describe("Trial Activation", function () {

            it("should have access to trial functions", function () {
                // Basic test to verify our exports work
                expect(LoginService._getTrialData).toBeDefined();
                expect(LoginService._setTrialData).toBeDefined();
                expect(LoginService._cleanTrialData).toBeDefined();
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
                const storedTrialData = await LoginService._getTrialData();

                // Verify trial data was set correctly
                expect(storedTrialData).not.toBeNull();
                expect(storedTrialData.proVersion).toBe("3.1.0");

                // Check that a 30-day trial was activated with mocked time
                const expectedEndDate = mockNow + (30 * LoginService.TRIAL_CONSTANTS.MS_PER_DAY);
                expect(storedTrialData.endDate).toBe(expectedEndDate);

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
                testWindow.$('.modal .btn').first().click();
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
                const updatedTrialData = await LoginService._getTrialData();

                // Verify new trial data was set for newer version
                expect(updatedTrialData).not.toBeNull();
                expect(updatedTrialData.proVersion).toBe("3.1.0");

                // Check that 3-day trial was granted with mocked time
                const expectedEndDate = mockNow + (LoginService.TRIAL_CONSTANTS.SUBSEQUENT_TRIAL_DAYS
                    * LoginService.TRIAL_CONSTANTS.MS_PER_DAY);
                expect(updatedTrialData.endDate).toBe(expectedEndDate);

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
                testWindow.$('.modal .btn').first().click();
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
                const updatedTrialData = await LoginService._getTrialData();

                // Verify existing trial was preserved but version updated
                expect(updatedTrialData).not.toBeNull();
                expect(updatedTrialData.proVersion).toBe("3.1.0");
                expect(updatedTrialData.endDate).toBe(futureEndDate);

                // Skip dialog testing
                try {
                    await testWindow.__PR.waitForModalDialog(".modal");
                    const modalContent = testWindow.$('.modal');
                    if (modalContent.length > 0) {
                        testWindow.$('.modal .btn').first().click();
                        await testWindow.__PR.waitForModalDialogClosed(".modal");
                    }
                } catch (e) {
                    console.log('Dialog test skipped:', e.message);
                }
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
                const currentTrialData = await LoginService._getTrialData();

                // Verify trial data remains unchanged (same version, same end date)
                expect(currentTrialData.proVersion).toBe("3.1.0");
                expect(currentTrialData.endDate).toBe(existingTrial.endDate);

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
                const currentTrialData = await LoginService._getTrialData();

                // Verify trial data remains unchanged (older current version scenario)
                expect(currentTrialData.proVersion).toBe("3.2.0"); // Should preserve original version
                expect(currentTrialData.endDate).toBe(existingTrial.endDate); // Should preserve end date

                // For older current version, no dialog should appear
                await awaits(500);
                const modalContent = testWindow.$('.modal:visible');
                expect(modalContent.length).toBe(0);
            });
        });

        describe("Trial Expiration", function () {

            it("should show promo ended dialog when trial expires (not logged in)", async function () {
                const expiredTrial = {
                    proVersion: "3.1.0", // Same version as current to trigger ended dialog
                    endDate: mockNow - LoginService.TRIAL_CONSTANTS.MS_PER_DAY, // Expired yesterday
                    signature: "mock_signature"
                };

                // Set up expired trial data first
                await LoginService._setTrialData(expiredTrial);

                await LoginService.activateProTrial();

                // Get the updated trial data
                const updatedTrialData = await LoginService._getTrialData();

                // Verify upgrade dialog shown flag was set
                expect(updatedTrialData).not.toBeNull();
                expect(updatedTrialData.upgradeDialogShownVersion).toBe("3.1.0");
                expect(updatedTrialData.proVersion).toBe("3.1.0"); // Should preserve original version
                expect(updatedTrialData.endDate).toBe(expiredTrial.endDate); // Should preserve end date

                // Wait for modal dialog and verify it's the "ended" dialog
                await testWindow.__PR.waitForModalDialog(".modal");
                const modalContent = testWindow.$('.modal');
                expect(modalContent.length).toBeGreaterThan(0);

                // Check if it's the "ended" dialog (different text than upgrade)
                const dialogText = modalContent.text();
                expect(dialogText).toContain('Phoenix Pro');
                expect(dialogText).toContain('Trial has ended');

                // Close the dialog
                testWindow.$('.modal .btn').first().click();
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
                expect(updatedTrialData.proVersion).toBe("3.1.0"); // Should update to current version

                // Should grant 7-day trial for version upgrade
                const expectedEndDate = mockNow + (7 * LoginService.TRIAL_CONSTANTS.MS_PER_DAY);
                expect(updatedTrialData.endDate).toBe(expectedEndDate);

                // Should show upgrade dialog (not ended dialog)
                await testWindow.__PR.waitForModalDialog(".modal");
                const modalContent = testWindow.$('.modal');
                expect(modalContent.length).toBeGreaterThan(0);

                const dialogText = modalContent.text();
                expect(dialogText.toLowerCase()).toContain('you’ve been upgraded to');
                expect(dialogText).toContain('Phoenix Pro');
                expect(dialogText).toContain('7 days');

                // Close the dialog
                testWindow.$('.modal .btn').first().click();
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
    });
});
