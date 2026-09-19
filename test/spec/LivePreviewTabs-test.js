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

/*global describe, it, expect, beforeEach, afterEach */

define(function (require, exports, module) {

    const LivePreviewTabs = require("extensionsIntegrated/Phoenix-live-preview/LivePreviewTabs");

    describe("unit:Live preview tab heartbeats", function () {
        const TIMEOUT = LivePreviewTabs.TAB_HEARTBEAT_TIMEOUT;
        const PAGE_URL = "http://localhost:1234/index.html";
        let closed, reconnected, now;

        // the check runs once a second while the editor is awake
        function tick(ms) {
            for (let elapsed = 0; elapsed < ms; elapsed += 1000) {
                now += 1000;
                LivePreviewTabs.checkHeartbeats(now);
            }
        }

        // no checks and no heartbeats while the whole app is paused
        function sleepApp(ms) {
            now += ms;
            LivePreviewTabs.checkHeartbeats(now);
        }

        function connectPage(id) {
            LivePreviewTabs.tabOnline(id, "worker.js", false, now);
            LivePreviewTabs.tabConnected(id, PAGE_URL);
        }

        beforeEach(function () {
            LivePreviewTabs._resetForTests();
            closed = [];
            reconnected = [];
            LivePreviewTabs.setCallbacks({
                close: function (id) {
                    closed.push(id);
                },
                reconnect: function (id, url) {
                    reconnected.push({ id: id, url: url });
                }
            });
            now = 1000000;
            LivePreviewTabs.checkHeartbeats(now);
        });

        afterEach(function () {
            LivePreviewTabs._resetForTests();
        });

        it("should keep a page that heartbeats in time", function () {
            connectPage("a");
            for (let i = 0; i < 20; i++) {
                tick(1000);
                LivePreviewTabs.tabOnline("a", "worker.js", false, now);
            }
            expect(closed).toEqual([]);
            expect(LivePreviewTabs.livePreviewTabs.has("a")).toBe(true);
        });

        it("should report a silent page closed after the timeout", function () {
            connectPage("a");
            tick(TIMEOUT);
            expect(closed).toEqual([]);
            tick(1000);
            expect(closed).toEqual(["a"]);
            expect(LivePreviewTabs.livePreviewTabs.has("a")).toBe(false);
        });

        it("should report a closed page back as connected when its heartbeats resume", function () {
            connectPage("a");
            tick(TIMEOUT + 1000);
            expect(closed).toEqual(["a"]);
            LivePreviewTabs.tabOnline("a", "worker.js", false, now);
            expect(reconnected).toEqual([{ id: "a", url: PAGE_URL }]);
            expect(LivePreviewTabs.livePreviewTabs.has("a")).toBe(true);
            // the next heartbeat is only a heartbeat
            LivePreviewTabs.tabOnline("a", "worker.js", false, now);
            expect(reconnected.length).toBe(1);
        });

        it("should report a page closed and back again on every silence", function () {
            connectPage("a");
            tick(TIMEOUT + 1000);
            LivePreviewTabs.tabOnline("a", "worker.js", false, now);
            tick(TIMEOUT + 1000);
            LivePreviewTabs.tabOnline("a", "worker.js", false, now);
            expect(closed).toEqual(["a", "a"]);
            expect(reconnected.length).toBe(2);
        });

        it("should not reconnect a page that only heartbeats but never connected", function () {
            LivePreviewTabs.tabOnline("a", "worker.js", false, now);
            tick(TIMEOUT + 1000);
            expect(closed).toEqual(["a"]);
            LivePreviewTabs.tabOnline("a", "worker.js", false, now);
            expect(reconnected).toEqual([]);
        });

        it("should never reconnect a page that was dropped", function () {
            connectPage("a");
            LivePreviewTabs.dropTab("a");
            expect(LivePreviewTabs.livePreviewTabs.has("a")).toBe(false);
            // a late heartbeat from the dying page is just a heartbeat
            LivePreviewTabs.tabOnline("a", "worker.js", false, now);
            expect(reconnected).toEqual([]);
            tick(TIMEOUT + 1000);
            expect(closed).toEqual(["a"]);
            LivePreviewTabs.tabOnline("a", "worker.js", false, now);
            expect(reconnected).toEqual([]);
        });

        it("should not report pages closed when the editor itself was paused", function () {
            connectPage("a");
            connectPage("b");
            sleepApp(TIMEOUT * 6);
            expect(closed).toEqual([]);
            expect(LivePreviewTabs.livePreviewTabs.has("a")).toBe(true);
            expect(LivePreviewTabs.livePreviewTabs.has("b")).toBe(true);
            // the pages get a full window to resume in
            tick(TIMEOUT);
            expect(closed).toEqual([]);
            tick(1000);
            expect(closed).toEqual(["a", "b"]);
        });

        it("should still report a silent page closed when only the check was late", function () {
            connectPage("a");
            connectPage("b");
            // the check timer was throttled in a hidden window, but page a kept heartbeating
            now += TIMEOUT * 6;
            LivePreviewTabs.tabOnline("a", "worker.js", false, now - 1000);
            LivePreviewTabs.checkHeartbeats(now);
            expect(closed).toEqual(["b"]);
            expect(LivePreviewTabs.livePreviewTabs.has("a")).toBe(true);
        });

        it("should not report a loader tab closed", function () {
            LivePreviewTabs.tabOnline("loader", "loader.html", true, now);
            tick(TIMEOUT + 1000);
            expect(closed).toEqual([]);
            expect(LivePreviewTabs.livePreviewTabs.has("loader")).toBe(false);
        });

        it("should forget the oldest closed pages beyond the limit", function () {
            const total = LivePreviewTabs.MAX_EXPIRED + 1;
            for (let i = 0; i < total; i++) {
                connectPage("p" + i);
            }
            tick(TIMEOUT + 1000);
            expect(closed.length).toBe(total);
            LivePreviewTabs.tabOnline("p0", "worker.js", false, now);
            expect(reconnected).toEqual([]);
            LivePreviewTabs.tabOnline("p1", "worker.js", false, now);
            expect(reconnected).toEqual([{ id: "p1", url: PAGE_URL }]);
        });
    });
});
