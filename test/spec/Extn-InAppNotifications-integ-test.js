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

/*global describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, awaits, awaitsFor */

define(function (require, exports, module) {
    // Recommended to avoid reloading the integration test window Phoenix instance for each test.

    const SpecRunnerUtils     = require("spec/SpecRunnerUtils");

    const testPath = SpecRunnerUtils.getTestPath("/spec/JSUtils-test-files");

    let testWindow, banner, originalPhoenixPro;


    describe("integration:In App notification banner integration tests", function () {

        beforeAll(async function () {
            testWindow = await SpecRunnerUtils.createTestWindowAndRun();
            banner = testWindow.require("extensionsIntegrated/InAppNotifications/banner");

            await SpecRunnerUtils.loadProjectInTestWindow(testPath);
        }, 30000);

        beforeEach(function () {
            // Save original Phoenix.pro before each test
            originalPhoenixPro = testWindow.Phoenix.pro;
        });

        afterEach(function () {
            // Restore Phoenix.pro after each test (even if test fails)
            testWindow.Phoenix.pro = originalPhoenixPro;
        });

        async function _waitForBannerShown() {
            await awaitsFor(function () {
                return testWindow.$('#notification-bar').is(":visible");
            }, "banner to be shown");
        }

        afterAll(async function () {
            testWindow = null;
            // comment out below line if you want to debug the test window post running tests
            await SpecRunnerUtils.closeTestWindow();
        }, 30000);

        function getRandomNotification(platform, showOnEveryBoot=false, ack = false, proOnly = false) {
            const notification = {};
            const id = crypto.randomUUID();
            const ackClass = ack? "notification_ack" : '';
            const notificationObj = {
                "DANGER_SHOW_ON_EVERY_BOOT": showOnEveryBoot,
                "HTML_CONTENT": `<div id='${id}' class="${ackClass}">random notification ${platform} with id ${id}, DANGER_SHOW_ON_EVERY_BOOT: ${showOnEveryBoot}, ack:${ack}</div>`,
                "FOR_VERSIONS": ">=3.0.0",
                "PLATFORM": platform || "all"
            };
            if (proOnly) {
                notificationObj.PRO_EDITION_ONLY = true;
            }
            notification[id] = notificationObj;
            return {notification, id: `#${id}`};
        }

        it("Should show notification only once", async function () {
            const {notification, id} = getRandomNotification();
            banner._renderNotifications(notification);
            expect(testWindow.$(id).length).toEqual(1);

            banner.cleanNotificationBanner();
            banner._renderNotifications(notification);
            expect(testWindow.$(id).length).toEqual(0);
        });

        function verifyPlatform(platform) {
            banner.cleanNotificationBanner();
            const {notification, id} = getRandomNotification(platform);
            banner._renderNotifications(notification);

            const isCurrentPlatform = (Phoenix.platform === platform && Phoenix.isNativeApp);
            expect(testWindow.$(id).length).toEqual(isCurrentPlatform ? 1 : 0);
        }

        it("Should show notification only in windows tauri", async function () {
            verifyPlatform("win");
        });

        it("Should show notification only in linux tauri", async function () {
            verifyPlatform("linux");
        });

        it("Should show notification only in mac tauri", async function () {
            verifyPlatform("mac");
        });

        it("Should show notification only in any desktop tauri", async function () {
            banner.cleanNotificationBanner();
            const {notification, id} = getRandomNotification("allDesktop");
            banner._renderNotifications(notification);

            expect(testWindow.$(id).length).toEqual(Phoenix.isNativeApp ? 1 : 0);
        });

        it("Should show notification only in any win,linux,mac tauri", async function () {
            banner.cleanNotificationBanner();
            const {notification, id} = getRandomNotification("win,linux,mac");
            banner._renderNotifications(notification);

            expect(testWindow.$(id).length).toEqual(Phoenix.isNativeApp ? 1 : 0);
        });

        //firefox,chrome,safari,allBrowser, all
        function verifyBrowser(platform) {
            banner.cleanNotificationBanner();
            const {notification, id} = getRandomNotification(platform);
            banner._renderNotifications(notification);

            let currentPlatform = "chrome";
            if(Phoenix.browser.desktop.isFirefox){
                currentPlatform = "firefox";
            } else if(Phoenix.browser.desktop.isSafari){
                currentPlatform = "safari";
            }
            const isCurrentPlatform = (currentPlatform === platform && !Phoenix.isNativeApp);
            expect(testWindow.$(id).length).toEqual(isCurrentPlatform ? 1 : 0);
        }

        it("Should show notification only in firefox non tauri", async function () {
            verifyBrowser("firefox");
        });

        it("Should show notification only in chrome non tauri", async function () {
            verifyBrowser("chrome");
        });

        it("Should show notification only in safari non tauri", async function () {
            verifyBrowser("safari");
        });

        it("Should show notification only in any browser non tauri", async function () {
            banner.cleanNotificationBanner();
            const {notification, id} = getRandomNotification("allBrowser");
            banner._renderNotifications(notification);

            expect(testWindow.$(id).length).toEqual(!Phoenix.isNativeApp ? 1 : 0);
        });

        it("Should show notification only in any firefox,chrome,safari tauri", async function () {
            banner.cleanNotificationBanner();
            const {notification, id} = getRandomNotification("firefox,chrome,safari");
            banner._renderNotifications(notification);

            expect(testWindow.$(id).length).toEqual(!Phoenix.isNativeApp ? 1 : 0);
        });

        it("Should show notification on every boot", async function () {
            banner.cleanNotificationBanner();
            const {notification, id} = getRandomNotification("all", true);
            banner._renderNotifications(notification);

            // now close the notification by clicking the close icon
            testWindow.$(".close-icon").click();
            expect(testWindow.$(id).length).toEqual(0);

            await awaits(300);
            // show the same banner again
            banner._renderNotifications(notification);
            expect(testWindow.$(id).length).toEqual(1);
        });

        it("Should show notification only once", async function () {
            banner.cleanNotificationBanner();
            const {notification, id} = getRandomNotification("all", false, true);

            // show the same banner again
            banner._renderNotifications(notification);
            expect(testWindow.$(id).length).toEqual(1);

            // now close the notification by clicking the close icon
            testWindow.$(".close-icon").click();
            expect(testWindow.$(id).length).toEqual(0);

            await awaits(300);
            // acknowledged banner should not show the same banner again
            banner._renderNotifications(notification);
            expect(testWindow.$(id).length).toEqual(0);
        });

        it("Should show PRO_EDITION_ONLY notification in pro edition", async function () {
            banner.cleanNotificationBanner();

            // Mock pro edition
            testWindow.Phoenix.pro = { commitID: "test-pro-commit" };

            const {notification, id} = getRandomNotification("all", true, false, true);
            banner._renderNotifications(notification);

            expect(testWindow.$(id).length).toEqual(1);

            banner.cleanNotificationBanner();
        });

        it("Should not show PRO_EDITION_ONLY notification in community edition", async function () {
            banner.cleanNotificationBanner();

            // Mock community edition
            testWindow.Phoenix.pro = null;

            const {notification, id} = getRandomNotification("all", true, false, true);
            banner._renderNotifications(notification);
            await awaits(50);

            expect(testWindow.$(id).length).toEqual(0);

            banner.cleanNotificationBanner();
        });

        it("Should show non-PRO_EDITION_ONLY notification in all editions", async function () {
            const {notification, id} = getRandomNotification("all", true, false, false);

            // Test in pro edition
            banner.cleanNotificationBanner();
            testWindow.Phoenix.pro = { commitID: "test-pro-commit" };
            banner._renderNotifications(notification);
            expect(testWindow.$(id).length).toEqual(1);
            banner.cleanNotificationBanner();
            expect(testWindow.$(id).length).toEqual(0);

            // Test in community edition
            testWindow.Phoenix.pro = null;
            banner._renderNotifications(notification);
            expect(testWindow.$(id).length).toEqual(1);
            banner.cleanNotificationBanner();
        });

        it("Should apply custom filter to block notification", async function () {
            banner.cleanNotificationBanner();
            banner.registerCustomFilter(async () => false);

            const {notification, id} = getRandomNotification("all", true);
            banner._renderNotifications(notification);
            await awaits(50);

            expect(testWindow.$('#notification-bar').is(":visible")).toBe(false);
            expect(testWindow.$(id).length).toEqual(0);

            // Cleanup: remove custom filter
            banner.registerCustomFilter(null);
        });

        it("Should apply custom filter to allow notification", async function () {
            banner.cleanNotificationBanner();
            banner.registerCustomFilter(async () => true);

            const {notification, id} = getRandomNotification("all", true);
            banner._renderNotifications(notification);
            await _waitForBannerShown();

            expect(testWindow.$(id).length).toEqual(1);

            // Cleanup
            banner.registerCustomFilter(null);
            banner.cleanNotificationBanner();
        });

        it("Should pass correct parameters to custom filter", async function () {
            banner.cleanNotificationBanner();
            let receivedNotification, receivedID;

            const {notification} = getRandomNotification("all", true);
            const expectedID = Object.keys(notification)[0];

            banner.registerCustomFilter(async (notif, notifID) => {
                receivedNotification = notif;
                receivedID = notifID;
                return true;
            });

            banner._renderNotifications(notification);
            await _waitForBannerShown();

            expect(receivedID).toEqual(expectedID);
            expect(receivedNotification).toEqual(notification[expectedID]);

            // Cleanup
            banner.registerCustomFilter(null);
            banner.cleanNotificationBanner();
        });

        it("Should apply custom filter on reRenderNotifications", async function () {
            banner.cleanNotificationBanner();

            const {notification, id} = getRandomNotification("all", true);

            // Set cache and render
            banner._setBannerCache(notification);
            banner._renderNotifications(notification);
            await _waitForBannerShown();
            expect(testWindow.$(id).length).toEqual(1);

            banner.cleanNotificationBanner();

            // Set filter to block
            banner.registerCustomFilter(async () => false);

            // Re-render should not show notification due to filter
            banner.reRenderNotifications();
            await awaits(50);
            expect(testWindow.$('#notification-bar').is(":visible")).toBe(false);
            expect(testWindow.$(id).length).toEqual(0);

            // Cleanup
            banner.registerCustomFilter(null);
            banner.cleanNotificationBanner();
        });

        it("Should serialize multiple concurrent reRenderNotifications calls", async function () {
            banner.cleanNotificationBanner();

            const {notification} = getRandomNotification("all", true);
            let renderCount = 0;

            // Set cache
            banner._setBannerCache(notification);

            // Register filter to track render calls
            banner.registerCustomFilter(async () => {
                renderCount++;
                return true;
            });

            // Make 3 concurrent calls
            const promise1 = banner.reRenderNotifications();
            const promise2 = banner.reRenderNotifications();
            const promise3 = banner.reRenderNotifications();

            // First render: wait for banner, close it, wait for promise to resolve
            await _waitForBannerShown();
            expect(renderCount).toEqual(1);
            testWindow.$('.close-icon').click();
            await promise1;

            // Second render: wait for banner, close it, wait for promise to resolve
            await _waitForBannerShown();
            expect(renderCount).toEqual(2);
            testWindow.$('.close-icon').click();
            await promise2;

            // Third render: wait for banner, close it, wait for promise to resolve
            await _waitForBannerShown();
            expect(renderCount).toEqual(3);
            testWindow.$('.close-icon').click();
            await promise3;

            // Cleanup
            banner.registerCustomFilter(null);
            banner.cleanNotificationBanner();
        });
    });
});
