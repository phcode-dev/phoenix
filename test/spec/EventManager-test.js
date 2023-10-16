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

/*global describe, it, expect, beforeEach, afterEach, awaitsFor */

define(function (require, exports, module) {
    const EventManager = require("utils/EventManager"),
        EventDisparcher = require("utils/EventDispatcher");

    const dispatcher = {};
    EventDisparcher.makeEventDispatcher(dispatcher);

    describe("EventManager tests", function () {
        it("should be able to register event handler", function () {
            EventManager.registerEventHandler("ev1", dispatcher);
            expect(EventManager.isExistsEventHandler("ev1")).toBe(true);
        });

        it("should be trigger a registered event", async function () {
            EventManager.registerEventHandler("ev2", dispatcher);
            expect(EventManager.isExistsEventHandler("ev2")).toBe(true);
            let arg1, arg2;
            dispatcher.on("someEvent", (evt, ...args)=>{
                arg1=args[0];
                arg2=args[1];
            });
            EventManager.triggerEvent("ev2", "someEvent", 1, "param1");

            await awaitsFor(function () {
                return arg1 === 1 && arg2 === "param1";
            }, "awaiting event trigger");
        });

        it("should receive event from embedded iframe", async function () {
            const HANDLER_NAME = 'test-iframeMessageHandler',
                EVENT_NAME = "iframeHelloEvent",
                TEST_MESSAGE = 'world';
            const SRC_DOC = `<html><head><script>
                window.parent.postMessage({
                      handlerName: "${HANDLER_NAME}",
                      eventName: "${EVENT_NAME}",
                      message: {hello: "${TEST_MESSAGE}"}
                 }, '*');
            </script></head></html>`;
            EventManager.registerEventHandler(HANDLER_NAME, dispatcher);
            expect(EventManager.isExistsEventHandler(HANDLER_NAME)).toBe(true);
            let recvdMessageEvent = null;
            dispatcher.on(EVENT_NAME, (_evt, messageEvent)=>{
                recvdMessageEvent = messageEvent;
            });
            const iframe = document.createElement("iframe");
            iframe.style.display = "none";
            iframe.srcdoc = SRC_DOC;
            document.body.appendChild(iframe);
            await awaitsFor(function () {
                return !!recvdMessageEvent;
            }, "awaiting message event reception");
            expect(recvdMessageEvent.data.handlerName).toBe(HANDLER_NAME);
            expect(recvdMessageEvent.data.eventName).toBe(EVENT_NAME);
            expect(recvdMessageEvent.data.message).toEql({hello: TEST_MESSAGE});
        });
    });
});
