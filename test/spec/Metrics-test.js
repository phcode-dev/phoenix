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

/*global describe, it, expect, beforeEach */

define(function (require, exports, module) {
    const Metrics = require("utils/Metrics");

    describe("Metrics tests", function () {
        beforeEach(function () {
            window.gtag=function () {};
            window.analytics = {_initData: [], event: window.gtag};
        });

        it("should log health metrics", function () {
            Metrics.init();
            Metrics.countEvent("typec", "cat", "sub", 1);
            Metrics.countEvent("typec", "cat", "sub", 1);
            Metrics.valueEvent("typev", "cat", "sub", 10);
            Metrics.valueEvent("typev", "cat", "sub", -20);
            let data = Metrics.getLoggedDataForAudit();
            expect(data.get("typec.cat.sub")).toEqual({ eventType: 'count', sum: 2, count: 2 });
            expect(data.get("typev.cat.sub")).toEqual({ eventType: 'val', sum: -10, count: 2 });
        });

        it("should log health metrics For audit even if disabled", function () {
            Metrics.init();
            let data = Metrics.getLoggedDataForAudit();
            data.clear();
            Metrics.setDisabled(true);
            Metrics.countEvent("typec", "cat", "sub", 1);
            Metrics.countEvent("typec", "cat", "sub", 1);
            Metrics.valueEvent("typev", "cat", "sub", 10);
            Metrics.valueEvent("typev", "cat", "sub", -20);
            data = Metrics.getLoggedDataForAudit();
            expect(data.get("typec.cat.sub")).toEqual({ eventType: 'count', sum: 2, count: 2 });
            expect(data.get("typev.cat.sub")).toEqual({ eventType: 'val', sum: -10, count: 2 });
        });

        it("should delete 1000 entries if 3000 max entries have been logged", function () {
            Metrics.init();
            let data = Metrics.getLoggedDataForAudit();
            data.clear();
            Metrics.setDisabled(true);
            for(let i=0; i<3011; i++){
                Metrics.countEvent("typec", "cat", `${i}`, 1);
            }
            data = Metrics.getLoggedDataForAudit();
            expect(data.size < 2050).toBeTrue();
        });

        it("should aggregate batched count events and emit the sum on flushMetrics", async function () {
            Metrics.init();
            let data = Metrics.getLoggedDataForAudit();
            data.clear();
            Metrics.countEventBatched("typeb", "cat", "sub");
            Metrics.countEventBatched("typeb", "cat", "sub");
            Metrics.countEventBatched("typeb", "cat", "sub");
            // nothing reaches the pipeline until a flush
            expect(data.get("typeb.cat.sub")).toBeUndefined();
            await Metrics.flushMetrics();
            expect(data.get("typeb.cat.sub")).toEqual({ eventType: 'count', sum: 3, count: 1 });
            // the window was consumed - a second flush must not double count
            await Metrics.flushMetrics();
            expect(data.get("typeb.cat.sub")).toEqual({ eventType: 'count', sum: 3, count: 1 });
        });

        it("should aggregate batched value events and emit the window average on flushMetrics", async function () {
            Metrics.init();
            let data = Metrics.getLoggedDataForAudit();
            data.clear();
            Metrics.valueEventBatched("typebv", "cat", "sub", 10);
            Metrics.valueEventBatched("typebv", "cat", "sub", 30);
            expect(data.get("typebv.cat.sub")).toBeUndefined();
            await Metrics.flushMetrics();
            // one value event carrying the average of the window (20), not two events
            expect(data.get("typebv.cat.sub")).toEqual({ eventType: 'val', sum: 20, count: 1 });
        });
    });
});
