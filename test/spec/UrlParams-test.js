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

/*global describe, it, expect */

define(function (require, exports, module) {


    var UrlParams = require("utils/UrlParams").UrlParams;

    describe("UrlParams", function () {
        describe("Test for Empty parameter list", function () {
            var params = new UrlParams();

            it("should show that the parameter object is empty", function () {
                params.parse("http://www.brackets.io");

                expect(params.isEmpty()).toBeTruthy();
                expect(params.toString()).toEqual("");
            });

            it("should show that the parameter object is NOT empty", function () {
                params.parse("http://www.brackets.io?one=1&two=true&three=foobar");

                expect(params.isEmpty()).toBeFalsy();
                expect(params.toString()).toNotEqual("");
            });
        });

        describe("Parse and Get URL parameters", function () {
            var params = new UrlParams();

            it("should create a parameter object and get three parameters", function () {
                params.parse("http://www.brackets.io?one=1&two=true&three=foobar");

                expect(params.get("one")).toEqual("1");
                expect(params.get("two")).toEqual("true");
                expect(params.get("three")).toEqual("foobar");
            });

            it("should create a parameter object with three parameters with empty string values", function () {
                params.parse("http://www.brackets.io?one&two&three");

                expect(params.get("one")).toEqual("");
                expect(params.get("two")).toEqual("");
                expect(params.get("three")).toEqual("");
            });

            it("should create a parameter object with no parameters", function () {
                params.parse("http://www.brackets.io");

                expect(params.get("one")).toBeUndefined();
                expect(params.get("two")).toBeUndefined();
                expect(params.get("three")).toBeUndefined();
            });
        });

        describe("Put and Remove URL parameters", function () {
            var params = new UrlParams();

            it("should put a new parameter three in the list", function () {
                params.parse("http://www.brackets.io?one=1&two=true");

                expect(params.get("one")).toEqual("1");
                expect(params.get("two")).toEqual("true");
                expect(params.get("three")).toBeUndefined();

                params.put("three", "foobar");

                expect(params.get("one")).toEqual("1");
                expect(params.get("two")).toEqual("true");
                expect(params.get("three")).toEqual("foobar");
            });

            it("should change the value of parameter two", function () {
                params.parse("http://www.brackets.io?one=1&two=true&three=foobar");

                expect(params.get("one")).toEqual("1");
                expect(params.get("two")).toEqual("true");
                expect(params.get("three")).toEqual("foobar");

                params.put("two", "false");

                expect(params.get("one")).toEqual("1");
                expect(params.get("two")).toEqual("false");
                expect(params.get("three")).toEqual("foobar");
            });

            it("should remove parameter one", function () {
                params.parse("http://www.brackets.io?one=1&two=true&three=foobar");

                expect(params.get("one")).toEqual("1");
                expect(params.get("two")).toEqual("true");
                expect(params.get("three")).toEqual("foobar");

                params.remove("one");

                expect(params.get("one")).toBeUndefined();
                expect(params.get("two")).toEqual("true");
                expect(params.get("three")).toEqual("foobar");
            });

            it("should remove three parameters, leaving an empty list", function () {
                params.parse("http://www.brackets.io?one=1&two=true&three=foobar");

                expect(params.get("one")).toEqual("1");
                expect(params.get("two")).toEqual("true");
                expect(params.get("three")).toEqual("foobar");

                expect(params.isEmpty()).toBeFalsy();
                expect(params.toString()).toNotEqual("");

                params.remove("one");
                params.remove("two");
                params.remove("three");

                expect(params.get("one")).toBeUndefined();
                expect(params.get("two")).toBeUndefined();
                expect(params.get("three")).toBeUndefined();

                expect(params.isEmpty()).toBeTruthy();
                expect(params.toString()).toEqual("");
            });

            it("should add three parameters to an empty list", function () {
                params.parse("http://www.brackets.io");

                expect(params.get("one")).toBeUndefined();
                expect(params.get("two")).toBeUndefined();
                expect(params.get("three")).toBeUndefined();

                expect(params.isEmpty()).toBeTruthy();
                expect(params.toString()).toEqual("");

                params.put("one", "1");
                params.put("two", "true");
                params.put("three", "foobar");

                expect(params.get("one")).toEqual("1");
                expect(params.get("two")).toEqual("true");
                expect(params.get("three")).toEqual("foobar");

                expect(params.isEmpty()).toBeFalsy();
                expect(params.toString()).toNotEqual("");
            });
        });

        describe("Test for malformed or unusual query strings", function () {
            var params = new UrlParams();

            it("should parse a missing query string as an empty object", function () {
                params.parse("http://www.brackets.io?");

                expect(params.isEmpty()).toBeTruthy();
                expect(params.toString()).toEqual("");
            });

            it("should parse a query string of whitespace as an empty object", function () {
                params.parse("http://www.brackets.io?   ");

                expect(params.isEmpty()).toBeTruthy();
                expect(params.toString()).toEqual("");
            });

            it("should parse a random number (used to circumvent browser cache)", function () {
                params.parse("http://www.brackets.io?28945893575608");

                expect(params.get("28945893575608")).toEqual("");
                expect(params.isEmpty()).toBeFalsy();
                expect(params.toString()).toEqual("28945893575608=");
            });
        });
    });
});
