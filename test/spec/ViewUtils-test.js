/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
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

/*global describe, beforeEach, afterEach, it, expect */
/*unittests: ViewUtils*/

define(function (require, exports, module) {


    // Load dependent modules
    var ViewUtils = require("utils/ViewUtils");

    describe("ViewUtils", function () {

        /*
         * Note: This suite uses ViewUtils to apply the .scroller-shadow class to the fixture.
         * However, the brackets.less file is not part of the SpecRunner. Therefore, no background-image
         * is displayed or animated. These tests simply validate that the correct
         * background-position value is written to the scrolling DOMElement.
         */
        describe("Scroller Shadows", function () {

            var $fixture,
                fixture;

            beforeEach(function () {
                /* 100% x 100px scroller with 100px x 1000px content */
                $fixture = $("<div style='overflow:auto;height:100px'><div id='content' style='width:100px;height:1000px'></div></div>");
                fixture = $fixture[0];
                $(window.document.body).append($fixture);
            });

            afterEach(function () {
                $fixture.remove();
            });

            function scrollTop(val) {
                fixture.scrollTop = val;

                // scrollTop does not trigger scroll event, fire manually.
                $fixture.trigger("scroll");
            }

            function backgroundY(position) {
                return parseInt($fixture.find(".scroller-shadow." + position).css("background-position").split(" ")[1], 10);
            }

            it("should not show the top shadow when no scrolling is available", function () {
                $fixture.find("#content").height(50); // make height shorter than the viewport
                ViewUtils.addScrollerShadow(fixture, null, true);

                expect(fixture.scrollTop).toEqual(0);
                expect(backgroundY("top")).toEqual(-ViewUtils.SCROLL_SHADOW_HEIGHT);
                expect(backgroundY("bottom")).toEqual(ViewUtils.SCROLL_SHADOW_HEIGHT);
            });

            it("should partially reveal the shadow", function () {
                ViewUtils.addScrollerShadow(fixture, null, true);
                scrollTop(3);
                expect(backgroundY("top")).toEqual(3 - ViewUtils.SCROLL_SHADOW_HEIGHT);
                expect(backgroundY("bottom")).toEqual(0);

                scrollTop(899);
                expect(backgroundY("top")).toEqual(0);
            });

            it("should update shadow position when installed", function () {
                scrollTop(100);
                ViewUtils.addScrollerShadow(fixture, null, true);

                expect(backgroundY("top")).toEqual(0);
            });

            it("should fully reveal the shadow at the bottommost scroll position", function () {
                ViewUtils.addScrollerShadow(fixture, null, true);
                scrollTop(900);

                expect(backgroundY("top")).toEqual(0);
            });

        });

        describe("getFileEntryDisplay", function () {
            function makeFile(name) {
                return {
                    name: name
                };
            }

            it("should do nothing if there's no extension", function () {
                expect(ViewUtils.getFileEntryDisplay(makeFile("README"))).toBe("README");
            });

            it("should add markup for the file extension", function () {
                expect(ViewUtils.getFileEntryDisplay(makeFile("README.md"))).toBe("README<span class='extension'>.md</span>");
            });

            // see https://github.com/adobe/brackets/issues/7905
            it("should not mark up dot files as being an extension", function () {
                expect(ViewUtils.getFileEntryDisplay(makeFile(".gitignore"))).toBe(".gitignore");
            });
        });
    });
});
