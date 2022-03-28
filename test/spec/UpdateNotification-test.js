/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 * Original work Copyright (c) 2012 - 2021 Adobe Systems Incorporated. All rights reserved.
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

/*global describe, it, expect, beforeEach, afterEach, waitsForDone, waitsForFail, spyOn, runs */

define(function (require, exports, module) {


    // Load dependent modules
    var UpdateNotification, // Load from brackets.test
        SpecRunnerUtils     = require("spec/SpecRunnerUtils");

    describe("UpdateNotification", function () {

        this.category = "integration";

        var updateInfoURL = "file://" + SpecRunnerUtils.getTestPath("/spec/UpdateNotification-test-files") + "/versionInfo.json",
            maliciousInfoURL = "file://" + SpecRunnerUtils.getTestPath("/spec/UpdateNotification-test-files") + "/versionInfoXSS.json",
            brokenInfoURL = "file://" + SpecRunnerUtils.getTestPath("/spec/UpdateNotification-test-files") + "/versionInfoBroken.json",
            doesNotExistURL = "file://" + SpecRunnerUtils.getTestPath("/spec/UpdateNotification-test-files") + "/doesNotExist.json",
            testWindow;

        beforeEach(function () {
            SpecRunnerUtils.createTestWindowAndRun(this, function (w) {
                testWindow = w;
                // Load module instances from brackets.test
                UpdateNotification = testWindow.brackets.test.UpdateNotification;
            });
        });

        afterEach(function () {
            testWindow         = null;
            UpdateNotification = null;
            SpecRunnerUtils.closeTestWindow();
        });

        describe("Pretend we are using the default en locale", function () {
            beforeEach(function () {
                // always pretend to run with en locale
                spyOn(testWindow.brackets, "getLocale").andReturn("en");
            });

            it("should be able to parse the JSON returned by actual URL (all the other unit-tests use local files)", function () {
                var updateInfo = {
                    _buildNumber: 1,
                    lastNotifiedBuildNumber: 0
                };

                runs(function () {
                    var promise = UpdateNotification.checkForUpdate(false, updateInfo);
                    waitsForDone(promise, "Check for updates", 10000);
                });

                runs(function () {
                    expect($(testWindow.document).find(".update-dialog.instance").length).toBe(1);
                });
            });

            it("should show a notification if an update is available", function () {
                var updateInfo = {
                    _buildNumber: 72,
                    lastNotifiedBuildNumber: 0,
                    _versionInfoURL: updateInfoURL
                };

                runs(function () {
                    var promise = UpdateNotification.checkForUpdate(false, updateInfo);
                    waitsForDone(promise, "Check for updates");
                });

                runs(function () {
                    expect($(testWindow.document).find(".update-dialog.instance").length).toBe(1);
                });
            });

            it("should show update information for all available updates", function () {
                var updateInfo = {
                    _buildNumber: 10,
                    lastNotifiedBuildNumber: 0,
                    _versionInfoURL: updateInfoURL
                };

                runs(function () {
                    var promise = UpdateNotification.checkForUpdate(false, updateInfo);
                    waitsForDone(promise, "Check for updates");
                });

                runs(function () {
                    var $doc = $(testWindow.document);
                    expect($doc.find(".update-dialog.instance").length).toBe(1);
                    expect($doc.find(".update-dialog.instance .update-info li").length).toBe(9);
                });
            });

            it("should not show dialog if user has already been notified", function () {
                var updateInfo = {
                    _buildNumber: 10,
                    lastNotifiedBuildNumber: 93,
                    _versionInfoURL: updateInfoURL
                };

                runs(function () {
                    var promise = UpdateNotification.checkForUpdate(false, updateInfo);
                    waitsForDone(promise, "Check for updates");
                });

                runs(function () {
                    var $doc = $(testWindow.document);
                    expect($doc.find(".update-dialog.instance").length).toBe(0);
                });
            });

            it("should not show dialog if app is up to date", function () {
                var updateInfo = {
                    _buildNumber: 93,
                    lastNotifiedBuildNumber: 0,
                    _versionInfoURL: updateInfoURL
                };

                runs(function () {
                    var promise = UpdateNotification.checkForUpdate(false, updateInfo);
                    waitsForDone(promise, "Check for updates");
                });

                runs(function () {
                    var $doc = $(testWindow.document);
                    expect($doc.find(".update-dialog.instance").length).toBe(0);
                });
            });

            it("should show an 'up to date' alert if no updates are available and the user manually checks for updates", function () {
                var updateInfo = {
                    _buildNumber: 93,
                    lastNotifiedBuildNumber: 93,
                    _versionInfoURL: updateInfoURL
                };

                runs(function () {
                    var promise = UpdateNotification.checkForUpdate(true, updateInfo);
                    waitsForDone(promise, "Check for updates");
                });

                runs(function () {
                    var $doc = $(testWindow.document);
                    // The "No Updates Found" dialog is actually an instance of error-dialog
                    expect($doc.find(".error-dialog.instance").length).toBe(1);
                });
            });

            it("should sanitize text returned from server", function () {
                var updateInfo = {
                    _buildNumber: 72,
                    lastNotifiedBuildNumber: 0,
                    _versionInfoURL: maliciousInfoURL
                };

                runs(function () {
                    var promise = UpdateNotification.checkForUpdate(true, updateInfo);
                    waitsForDone(promise, "Check for updates");
                });

                runs(function () {
                    var $doc = $(testWindow.document);
                    expect($doc.find(".update-dialog.instance").length).toBe(1);
                    // Check for "<script>" in the text. This means it wasn't stripped
                    // out and run as a script.
                    var txt = $doc.find(".update-dialog.instance .update-info li").text();
                    expect(txt.indexOf("<script>")).toNotEqual(-1);
                });
            });

            it("should error dialog if json is broken and can not be parsed", function () {
                var updateInfo = {
                    _buildNumber: 72,
                    lastNotifiedBuildNumber: 0,
                    _versionInfoURL: brokenInfoURL
                };

                runs(function () {
                    var promise = UpdateNotification.checkForUpdate(true, updateInfo);
                    waitsForFail(promise, "Check for updates");
                });

                runs(function () {
                    var $doc = $(testWindow.document);
                    expect($doc.find(".error-dialog.instance").length).toBe(1);
                });
            });
        });

        describe("Locale Fallback", function () {
            var updateInfo = {
                _buildNumber: 72,
                lastNotifiedBuildNumber: 0,
                _versionInfoURL: doesNotExistURL
            };

            var expectedResult = [
                {
                    "buildNumber": 93,
                    "versionString": "Sprint 12",
                    "dateString": "8-13-2012",
                    "releaseNotesURL": "https://github.com/adobe/brackets/wiki/Release-Notes:-Sprint-12",
                    "downloadURL": "https://github.com/adobe/brackets/downloads",
                    "newFeatures": [
                        {
                            "name": "Feature 1",
                            "description": "Only one feature"
                        }
                    ]
                }
            ];

            function setupAjaxSpy(defaultUpdateUrl) {
                spyOn(testWindow.$, "ajax").andCallFake(function (req) {
                    var d = new $.Deferred();

                    testWindow.setTimeout(function () {
                        if (req.url === defaultUpdateUrl) {
                            d.resolve(expectedResult);
                        } else {
                            d.reject();
                        }
                    }, 75);
                    // we need to set a timeout in order to emulate the async behavior of $.ajax

                    return d.promise();
                });
            }

            it("should fall back to de.json when de-ch.json is not available", function () {
                var defaultUpdateUrl = testWindow.brackets.config.update_info_url + "?locale=de";

                setupAjaxSpy(defaultUpdateUrl);

                // pretend that we are using the German (Switzerland) locale and we don't have a translation for the update notification
                spyOn(testWindow.brackets, "getLocale").andReturn("de-CH");

                runs(function () {
                    var promise = UpdateNotification.checkForUpdate(true, updateInfo);
                    waitsForDone(promise, "Check for updates", 10000);
                });

                runs(function () {
                    var $doc = $(testWindow.document);
                    expect($doc.find(".update-dialog.instance").length).toBe(1);
                });
            });

            it("should fall back to en.json when it.json is not available", function () {
                var defaultUpdateUrl = testWindow.brackets.config.update_info_url + "?locale=en";

                setupAjaxSpy(defaultUpdateUrl);

                // pretend that we are using the Italian locale and we don't have a translation for the update notification
                spyOn(testWindow.brackets, "getLocale").andReturn("it");

                runs(function () {
                    var promise = UpdateNotification.checkForUpdate(true, updateInfo);
                    waitsForDone(promise, "Check for updates", 10000);
                });

                runs(function () {
                    var $doc = $(testWindow.document);
                    expect($doc.find(".update-dialog.instance").length).toBe(1);
                });
            });
        });
    });
});
