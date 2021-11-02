/*
 * GNU AGPL-3.0 License
 *
 * Modified Work Copyright (c) 2021 - present core.ai . All rights reserved.
 * Original work Copyright (c) 2013 - 2021 Adobe Systems Incorporated. All rights reserved.
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


    var SpecRunnerUtils = require("spec/SpecRunnerUtils");

    describe("SpecRunnerUtils", function () {
        describe("simulateKeyEvent", function () {
            var mockElement, capturedEvent;

            beforeEach(function () {
                mockElement = SpecRunnerUtils.createMockElement();
                mockElement.on("keydown", function(event) {
                    capturedEvent = event;
                });
            });

            afterEach(function () {
                mockElement.remove();
                capturedEvent = null;
            });

            it("should create and dispatch a key event to an element", function () {
                SpecRunnerUtils.simulateKeyEvent(82, "keydown", mockElement[0]);
                expect(capturedEvent.keyCode).toEqual(82);
                expect(capturedEvent.which).toEqual(82);
                expect(capturedEvent.charCode).toEqual(82);
            });

            it("should create and dispatch a key event with modifiers to an element", function () {
                var modifiers = {
                    ctrlKey: true,
                    altKey: true
                };
                SpecRunnerUtils.simulateKeyEvent(82, "keydown", mockElement[0], modifiers);
                expect(capturedEvent.keyCode).toEqual(82);
                expect(capturedEvent.which).toEqual(82);
                expect(capturedEvent.charCode).toEqual(82);
                expect(capturedEvent.ctrlKey).toEqual(true);
                expect(capturedEvent.altKey).toEqual(true);
            });
        });
    });
});
