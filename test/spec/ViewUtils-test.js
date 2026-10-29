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
         * Note: This suite uses ViewUtils to add the .scroller-shadow elements to the fixture. The
         * SpecRunner loads brackets.less, so they get their sticky 8px boxes, but the shadows are only
         * faded in and out. These tests validate the opacity written to the shadow elements.
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

            function shadowOpacity(position) {
                return parseFloat($fixture.find(".scroller-shadow." + position).css("opacity"));
            }

            // the bottommost scroll position. The scrollbars of the test window take away from the
            // client height, so this is not simply the content height minus the fixture height
            function maxScrollTop() {
                return fixture.scrollHeight - fixture.clientHeight;
            }

            it("should not show either shadow when no scrolling is available", function () {
                $fixture.find("#content").height(50); // make height shorter than the viewport
                ViewUtils.addScrollerShadow(fixture, null, true);

                expect(fixture.scrollTop).toEqual(0);
                expect(shadowOpacity("top")).toEqual(0);
                expect(shadowOpacity("bottom")).toEqual(0);
            });

            it("should partially reveal the shadow", function () {
                ViewUtils.addScrollerShadow(fixture, null, true);
                scrollTop(3);
                expect(shadowOpacity("top")).toBeCloseTo(3 / ViewUtils.SCROLL_SHADOW_HEIGHT, 5);
                expect(shadowOpacity("bottom")).toEqual(1);

                // 1px of content left below the viewport
                scrollTop(maxScrollTop() - 1);
                expect(shadowOpacity("top")).toEqual(1);
                expect(shadowOpacity("bottom")).toBeCloseTo(1 / ViewUtils.SCROLL_SHADOW_HEIGHT, 5);
            });

            it("should update the shadows when installed", function () {
                scrollTop(100);
                ViewUtils.addScrollerShadow(fixture, null, true);

                expect(shadowOpacity("top")).toEqual(1);
            });

            it("should fully reveal the top shadow and hide the bottom one at the bottommost position", function () {
                ViewUtils.addScrollerShadow(fixture, null, true);
                scrollTop(maxScrollTop());

                expect(shadowOpacity("top")).toEqual(1);
                expect(shadowOpacity("bottom")).toEqual(0);
            });

        });

        describe("getFileEntryDisplay", function () {

            const TAURI_BASE_PATH = '/tauri/c/d/';
            const OTHER_BASE_PATH = `/x/c/d/`;
            function getExpectedTitle(name) {

                if(Phoenix.isNativeApp){
                    return window.fs.getTauriPlatformPath(`${TAURI_BASE_PATH}${name}`);
                }
                return `${OTHER_BASE_PATH}${name}`;
            }
            function makeFile(name) {
                let filePath = `${OTHER_BASE_PATH}${name}`;
                if(Phoenix.isNativeApp){
                    filePath = `${TAURI_BASE_PATH}${name}`;
                }
                return {
                    name: name,
                    fullPath: filePath
                };
            }

            it("should do nothing if there's no extension", function () {
                const name = "README";
                expect(ViewUtils.getFileEntryDisplay(makeFile(name))).toBe(
                    `<span title='${getExpectedTitle(name)}' class='baseName'>README</span>`);
            });

            it("should add markup for the file extension", function () {
                const name = "README.md";
                expect(ViewUtils.getFileEntryDisplay(makeFile(name))).toBe(
                    `<span title='${getExpectedTitle(name)}' class='baseName'>README</span><span title='${getExpectedTitle(name)}' class='extension'>.md</span>`);
            });

            // see https://github.com/adobe/brackets/issues/7905
            it("should not mark up dot files as being an extension", function () {
                const name = ".gitignore";
                expect(ViewUtils.getFileEntryDisplay(makeFile(name))).toBe(
                    `<span title='${getExpectedTitle(name)}' class='baseName'>${name}</span>`);
            });
        });
    });
});
