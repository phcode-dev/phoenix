/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 * Original work Copyright (c) 2014 - 2021 Adobe Systems Incorporated. All rights reserved.
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

/*global describe, it, expect, runs, spyOn */

define(function (require, exports, module) {


    var MainViewFactory = require("view/MainViewFactory");

    describe("ViewFactory", function () {
        function createMockFactory() {
            return {
                canOpenFile: function (fullPath) {
                    return (fullPath === "blah");
                }
            };
        }
        it("should register a factory", function () {
            runs(function () {
                var factory = createMockFactory();
                spyOn(factory, "canOpenFile");
                MainViewFactory.registerViewFactory(factory);
                MainViewFactory.findSuitableFactoryForPath();
                expect(factory.canOpenFile).toHaveBeenCalled();
            });
        });
        it("should find a factory", function () {
            runs(function () {
                var factory = createMockFactory();

                MainViewFactory.registerViewFactory(factory);
                var result = MainViewFactory.findSuitableFactoryForPath("blah");

                expect(result).toBeTruthy();
            });
        });
        it("should not find a factory", function () {
            runs(function () {
                var factory = createMockFactory();
                MainViewFactory.registerViewFactory(factory);
                var result = MainViewFactory.findSuitableFactoryForPath("blahblah");
                expect(result).toBeFalsy();
            });
        });
    });
});

