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

/*global describe, it, expect, awaitsFor */

define(function (require, exports, module) {
    const FeatureGate = require("utils/FeatureGate");

    describe("FeatureGate tests", function () {
        it("should return a registered feature gate", function () {
            FeatureGate.registerFeatureGate("feature1", true);
            expect(FeatureGate.getAllRegisteredFeatures().includes("feature1")).toEqual(true);
        });

        it("should raise event on feature registration", async function () {
            const FEATURE2 = "feature2";
            let notified = false, featureDefaultValue = null;
            FeatureGate.on(FeatureGate.FEATURE_REGISTERED, (event, name, defaultValue)=>{
                notified = name;
                featureDefaultValue = defaultValue;
            });
            FeatureGate.registerFeatureGate(FEATURE2, true);
            expect(FeatureGate.getAllRegisteredFeatures().includes(FEATURE2)).toEqual(true);
            await awaitsFor(function () {
                return notified === FEATURE2 && featureDefaultValue === true;
            }, "Feature gate registration notification");
        });

        it("user should be able to override feature enable/disable in FeatureGate", function () {
            const FEATURE_NAME = "feature3";
            FeatureGate.registerFeatureGate(FEATURE_NAME, true);

            FeatureGate.setFeatureEnabled(FEATURE_NAME, true);
            expect(FeatureGate.isFeatureEnabled(FEATURE_NAME)).toEqual(true);
            FeatureGate.setFeatureEnabled(FEATURE_NAME, false);
            expect(FeatureGate.isFeatureEnabled(FEATURE_NAME)).toEqual(false);
        });
    });
});
