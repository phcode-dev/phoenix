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
    });
});
