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

/*global describe, it, expect, beforeAll, afterAll, awaitsFor, awaitsForDone, awaits */

define(function (require, exports, module) {
    let NotificationUI = require("widgets/NotificationUI");
    describe("NotificationUI tests", function () {
        it("Should show and close one toast notification", async function () {
            let notification = NotificationUI.createToastFromTemplate("hello", "world");
            await awaitsFor(()=>{
                return $("#toast-notification-container").children().length === 1;
            }, "waiting for notification to appear");
            notification.close("test");
            await awaitsFor(()=>{
                return $("#toast-notification-container").children().length === 0;
            }, "waiting for notification to close");
        });

        it("Should done callback be called on close1", async function () {
            let notification = NotificationUI.createToastFromTemplate("hello", "world");
            let closeReason;
            notification.done((reason)=>{ closeReason = reason;});
            await awaitsFor(()=>{
                return $("#toast-notification-container").children().length === 1;
            }, "waiting for notification to appear");
            notification.close("test");
            await awaitsFor(()=>{
                return closeReason === 'test';
            }, "waiting for notification to close");
        });

        it("Should show and close 10 toast notification", async function () {
            let notifications = [];
            for(let i=0; i<10; i++){
                notifications.push(NotificationUI.createToastFromTemplate("hello", "world"));
            }
            await awaitsFor(()=>{
                return $("#toast-notification-container").children().length === 10;
            }, "waiting for notification to appear");
            for(let notification of notifications){
                notification.close("test");
            }
            await awaitsFor(()=>{
                return $("#toast-notification-container").children().length === 0;
            }, "waiting for notification to close");
        });

        it("Should dismiss on click by default", async function () {
            NotificationUI.createToastFromTemplate("hello", "world");
            await awaitsFor(()=>{
                return $("#toast-notification-container").children().length === 1;
            }, "waiting for notification to appear");
            $(".notification-dialog-content").click();
            await awaitsFor(()=>{
                return $("#toast-notification-container").children().length === 0;
            }, "waiting for notification to close");
        });

        it("Should not dismiss on click if option specified", async function () {
            let notification = NotificationUI.createToastFromTemplate("hello", "world" ,
                {dismissOnClick: false});
            await awaitsFor(()=>{
                return $("#toast-notification-container").children().length === 1;
            }, "waiting for notification to appear");
            $(".notification-dialog-content").click();
            await awaits(500);
            await awaitsFor(()=>{
                return $("#toast-notification-container").children().length === 1;
            }, "waiting for notification to be there");

            notification.close("test");
            await awaitsFor(()=>{
                return $("#toast-notification-container").children().length === 0;
            }, "waiting for notification to close");
        });

        async function verifyToast(cssClass) {
            let notification = NotificationUI.createToastFromTemplate("hello", "world", {
                toastStyle: cssClass
            });
            await awaitsFor(()=>{
                return $(`#toast-notification-container .${cssClass}`).length === 1;
            }, "waiting for notification to appear");
            notification.close("test");
            await awaitsFor(()=>{
                return $(`#toast-notification-container .${cssClass}`).length === 0;
            }, "waiting for notification to close");
        }

        it("Should style toast notification", async function () {
            await verifyToast(NotificationUI.NOTIFICATION_STYLES_CSS_CLASS.INFO);
            await verifyToast(NotificationUI.NOTIFICATION_STYLES_CSS_CLASS.WARNING);
            await verifyToast(NotificationUI.NOTIFICATION_STYLES_CSS_CLASS.SUCCESS);
            await verifyToast(NotificationUI.NOTIFICATION_STYLES_CSS_CLASS.ERROR);
            await verifyToast(NotificationUI.NOTIFICATION_STYLES_CSS_CLASS.DANGER);
            await verifyToast("custom-class-name");
        }, 10000);

        describe("showToastOn", function () {
            let $container;

            beforeAll(function () {
                $container = $(
                    '<div id="inline-toast-test-container" style="position:relative;width:200px;height:200px;"></div>');
                $("body").append($container);
            });

            afterAll(function () {
                $container.remove();
            });

            it("Should show an inline toast inside a container", async function () {
                let notification = NotificationUI.showToastOn($container[0], "Hello inline toast");
                await awaitsFor(function () {
                    return $container.find(".inline-toast").length === 1;
                }, "waiting for inline toast to appear");
                expect($container.find(".inline-toast").text()).toBe("Hello inline toast");
                notification.close();
                await awaitsFor(function () {
                    return $container.find(".inline-toast").length === 0;
                }, "waiting for inline toast to close");
            });

            it("Should auto-close after autoCloseTimeS", async function () {
                NotificationUI.showToastOn($container[0], "Auto close", {
                    autoCloseTimeS: 1
                });
                await awaitsFor(function () {
                    return $container.find(".inline-toast").length === 1;
                }, "waiting for inline toast to appear");
                await awaitsFor(function () {
                    return $container.find(".inline-toast").length === 0;
                }, "waiting for inline toast to auto-close", 3000);
            });

            it("Should dismiss on click by default", async function () {
                NotificationUI.showToastOn($container[0], "Click me");
                await awaitsFor(function () {
                    return $container.find(".inline-toast.visible").length === 1;
                }, "waiting for inline toast to be visible");
                $container.find(".inline-toast").click();
                await awaitsFor(function () {
                    return $container.find(".inline-toast").length === 0;
                }, "waiting for inline toast to close on click");
            });

            it("Should not dismiss on click when dismissOnClick is false", async function () {
                let notification = NotificationUI.showToastOn($container[0], "No dismiss", {
                    dismissOnClick: false,
                    autoCloseTimeS: 0
                });
                await awaitsFor(function () {
                    return $container.find(".inline-toast.visible").length === 1;
                }, "waiting for inline toast to be visible");
                $container.find(".inline-toast").click();
                await awaits(250);
                expect($container.find(".inline-toast").length).toBe(1);
                notification.close("manual");
                await awaitsFor(function () {
                    return $container.find(".inline-toast").length === 0;
                }, "waiting for inline toast to close manually");
            });

            it("Should accept a jQuery selector string as container", async function () {
                NotificationUI.showToastOn("#inline-toast-test-container", "Selector toast");
                await awaitsFor(function () {
                    return $container.find(".inline-toast").length === 1;
                }, "waiting for inline toast via selector");
                $container.find(".inline-toast").click();
                await awaitsFor(function () {
                    return $container.find(".inline-toast").length === 0;
                }, "waiting for inline toast to close");
            });

            it("Should resolve done callback with close reason", async function () {
                let closeReason;
                let notification = NotificationUI.showToastOn($container[0], "Done test");
                notification.done(function (reason) {
                    closeReason = reason;
                });
                await awaitsFor(function () {
                    return $container.find(".inline-toast.visible").length === 1;
                }, "waiting for inline toast to be visible");
                notification.close("testReason");
                await awaitsFor(function () {
                    return closeReason === "testReason";
                }, "waiting for done callback");
            });

            it("Should accept HTML template with elements", async function () {
                NotificationUI.showToastOn($container[0], '<b>Bold</b> text');
                await awaitsFor(function () {
                    return $container.find(".inline-toast").length === 1;
                }, "waiting for inline toast");
                expect($container.find(".inline-toast b").length).toBe(1);
                $container.find(".inline-toast").click();
                await awaitsFor(function () {
                    return $container.find(".inline-toast").length === 0;
                }, "waiting for inline toast to close");
            });
        });
    });
});
