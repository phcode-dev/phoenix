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

/*global describe, it, expect, beforeAll, afterAll, awaitsFor, awaitsForDone, awaits, jasmine, spyOn */

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

        it("Should hold the auto close while the mouse is over the toast", function () {
            // Mock time from the start so the auto-close timer itself is under the clock. The close
            // itself is observed on the notification, since the removal waits for a CSS transition.
            jasmine.clock().install();
            try {
                const notification = NotificationUI.createToastFromTemplate("hello", "world", {autoCloseTimeS: 1});
                spyOn(notification, "close").and.callThrough();
                const $popup = $("#toast-notification-container").children().last();
                expect($popup.length).toBe(1);
                $popup.trigger("mouseenter");
                jasmine.clock().tick(1500);
                expect($popup[0].isConnected).toBe(true);
                expect(notification.close).not.toHaveBeenCalled();
                $popup.trigger("mouseleave");
                jasmine.clock().tick(900);
                expect(notification.close).not.toHaveBeenCalled();
                jasmine.clock().tick(200);
                expect(notification.close).toHaveBeenCalledWith(NotificationUI.CLOSE_REASON.TIMEOUT);
            } finally {
                jasmine.clock().uninstall();
            }
        });

        it("Should hold the auto close while the mouse is over the HUD", function () {
            jasmine.clock().install();
            let closeReason;
            try {
                const notification = NotificationUI.showHUD("fa-solid fa-magnifying-glass-plus", "110%");
                notification.done(function (reason) { closeReason = reason; });
                const $hud = $("body > .hud-overlay");
                expect($hud.length).toBe(1);
                $hud.trigger("mouseenter");
                jasmine.clock().tick(1500);
                expect($hud[0].isConnected).toBe(true);
                expect(closeReason).toBeUndefined();
                $hud.trigger("mouseleave");
                jasmine.clock().tick(1100);
                expect(closeReason).toBe(NotificationUI.CLOSE_REASON.TIMEOUT);
                expect($("body > .hud-overlay").length).toBe(0);
            } finally {
                jasmine.clock().uninstall();
            }
        });

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

            it("Should hold the auto close while the mouse is over the inline toast", function () {
                jasmine.clock().install();
                let closeReason;
                try {
                    const notification = NotificationUI.showToastOn($container[0], "hover me", {autoCloseTimeS: 1});
                    notification.done(function (reason) { closeReason = reason; });
                    const $toast = $container.find(".inline-toast");
                    expect($toast.length).toBe(1);
                    $toast.trigger("mouseenter");
                    jasmine.clock().tick(1500);
                    expect($toast[0].isConnected).toBe(true);
                    expect(closeReason).toBeUndefined();
                    $toast.trigger("mouseleave");
                    jasmine.clock().tick(1100);
                    // The close falls back to a timer when no transition event arrives.
                    jasmine.clock().tick(600);
                    expect(closeReason).toBe(NotificationUI.CLOSE_REASON.TIMEOUT);
                    expect($container.find(".inline-toast").length).toBe(0);
                } finally {
                    jasmine.clock().uninstall();
                }
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

        describe("attachRichTooltip", function () {
            let $target, binding;

            beforeAll(function () {
                $target = $("<div id='rich-tooltip-test-target' style='position:fixed;top:60px;left:60px;" +
                    "width:20px;height:20px;'></div>").appendTo("body");
            });

            afterAll(function () {
                if (binding) {
                    binding.detach();
                }
                $target.remove();
                NotificationUI.hideRichTooltip();
            });

            function tooltip() {
                return $(".phoenix-rich-tooltip");
            }

            it("Should show rich HTML on hover and hide on mouseleave", async function () {
                binding = NotificationUI.attachRichTooltip($target, "<b>rich</b> content",
                    { showDelayMs: 0 });
                $target.trigger("mouseenter");
                await awaitsFor(function () {
                    return tooltip().is(":visible");
                }, "tooltip to appear on hover");
                expect(tooltip().find("b").text()).toBe("rich");

                $target.trigger("mouseleave");
                await awaitsFor(function () {
                    return !tooltip().is(":visible");
                }, "tooltip to hide on mouseleave");
            });

            it("Should compute content per element from a function", async function () {
                binding.detach();
                $target.attr("data-info", "computed!");
                binding = NotificationUI.attachRichTooltip($target, function (el) {
                    return $(el).attr("data-info");
                }, { showDelayMs: 0 });
                $target.trigger("mouseenter");
                await awaitsFor(function () {
                    return tooltip().is(":visible") && tooltip().text() === "computed!";
                }, "tooltip to show computed content");
                $target.trigger("mouseleave");
                await awaitsFor(function () {
                    return !tooltip().is(":visible");
                }, "tooltip to hide");
            });

            it("Should hide on mousedown and stop showing after detach", async function () {
                $target.trigger("mouseenter");
                await awaitsFor(function () {
                    return tooltip().is(":visible");
                }, "tooltip to appear before mousedown");
                $target.trigger("mousedown");
                await awaitsFor(function () {
                    return !tooltip().is(":visible");
                }, "tooltip to hide on mousedown");

                binding.detach();
                binding = null;
                $target.trigger("mouseenter");
                await awaits(50); // give a (detached) show any chance to fire
                expect(tooltip().is(":visible")).toBe(false);
            });

            it("Should stay within the viewport", async function () {
                // park the target at the bottom-right corner - the tooltip must clamp/flip inside
                $target.css({ top: ($(window).height() - 22) + "px", left: ($(window).width() - 22) + "px" });
                binding = NotificationUI.attachRichTooltip($target, "clamp me", { showDelayMs: 0 });
                $target.trigger("mouseenter");
                await awaitsFor(function () {
                    return tooltip().is(":visible");
                }, "tooltip to appear at screen edge");
                const rect = tooltip()[0].getBoundingClientRect();
                expect(rect.right).toBeLessThanOrEqual($(window).width());
                expect(rect.bottom).toBeLessThanOrEqual($(window).height());
                expect(rect.left).toBeGreaterThanOrEqual(0);
                expect(rect.top).toBeGreaterThanOrEqual(0);
                $target.trigger("mouseleave");
            });
        });
    });
});
