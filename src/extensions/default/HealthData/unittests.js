/*
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 * Original work Copyright (c) 2015 - 2021 Adobe Systems Incorporated. All rights reserved.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the "Software"),
 * to deal in the Software without restriction, including without limitation
 * the rights to use, copy, modify, merge, publish, distribute, sublicense,
 * and/or sell copies of the Software, and to permit persons to whom the
 * Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
 * DEALINGS IN THE SOFTWARE.
 *
 */

/*global describe, beforeEach, it, afterEach, expect */
/*unittests: HealthData*/

define(function (require, exports, module) {

    var SpecRunnerUtils = brackets.getModule("spec/SpecRunnerUtils");

    var testWindow,
        PreferencesManager;

    describe("individualrun:HealthData", function () {

        beforeEach(async function () {
            testWindow = await SpecRunnerUtils.createTestWindowAndRun();
        }, 30000);

        afterEach(async function () {
            await SpecRunnerUtils.closeTestWindow();
            testWindow = null;
        }, 30000);


        describe("Data Send to Server", function () {
            var prefs,
                HealthDataManager;

            beforeEach(async function () {
                PreferencesManager = testWindow.brackets.test.PreferencesManager;
                prefs = PreferencesManager.getExtensionPrefs("healthData");
                HealthDataManager = testWindow.brackets.test.HealthDataManager;
            });

            afterEach(function () {
                HealthDataManager = null;
                prefs = null;
                PreferencesManager = null;
            });

            it("should not send data to server when opted out", function () {
                PreferencesManager.setViewState("nextHealthDataSendTime", Date.now());
                prefs.set("healthDataTracking", false);
                // TODO fix this test
                // waitsForFail(promise, "Send Data to Server", 4000);
            });

        });

        describe("Notification popup", function () {
            var HealthDataPopup;

            beforeEach(function () {
                HealthDataPopup = testWindow.brackets.test.HealthDataPopup;
            });

            afterEach(function () {
                HealthDataPopup = null;
            });

            it("should show notification popup", function () {
                // TODO: write a test that verifies this actually shows *on a clean launch*, not just when API called...
                HealthDataPopup.showFirstLaunchTooltip();
                expect($(testWindow.document).find("#healthdata-firstlaunch-popup").length).toBe(1);
            });
        });

        describe("Health Data Statistics is displayed", function () {
            var HealthDataPreview;

            beforeEach(function () {
                HealthDataPreview = testWindow.brackets.test.HealthDataPreview;
            });

            afterEach(function () {
                HealthDataPreview = null;
            });

            it("should show file preview dialog", async function () {
                HealthDataPreview.previewHealthData();

                expect($(testWindow.document).find(".health-data-preview.instance").length).toBe(1);
            });
        });
    });

});
