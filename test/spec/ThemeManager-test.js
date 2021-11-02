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

/*global describe, it, expect, waitsForDone */

define(function (require, exports, module) {


    var ThemeManager     = require("view/ThemeManager"),
        FileSystem       = require("filesystem/FileSystem"),
        FileUtils        = require("file/FileUtils"),
        SpecRunnerUtils  = require("spec/SpecRunnerUtils");

    var testFilePath = SpecRunnerUtils.getTestPath("/spec/Theme-test-files");

    function superTrim(text) {
        return text.replace(/\s/g, '');
    }


    describe("ThemeManager", function () {

        describe("toDisplayName", function () {
            it("should format a name with no extension", function () {
                expect(ThemeManager._toDisplayName("this file")).toEqual("This File");
            });

            it("should format a short filename", function () {
                expect(ThemeManager._toDisplayName("this file.css")).toEqual("This File");
            });

            it("should format a longer filename", function () {
                expect(ThemeManager._toDisplayName("this is a simple file.css")).toEqual("This Is A Simple File");
            });

            it("should handle a name with dashes", function () {
                expect(ThemeManager._toDisplayName("this-is a simple-file.css")).toEqual("This Is A Simple File");
            });
        });


        describe("Extract Scrollbar", function () {
            it("should extract scrollbars from a theme with other css", function () {
                var themeFile = FileSystem.getFileForPath(testFilePath + "/scrollbars.css");
                var promise = FileUtils.readAsText(themeFile).done(function (content) {
                    var themeScrollbars = ThemeManager._extractScrollbars(content);
                    expect(themeScrollbars.scrollbar.length).toEqual(4);
                    expect(superTrim(themeScrollbars.content)).toEqual("span{}");
                });

                waitsForDone(promise, "theme with scrollbar and other css", 5000);
            });

            it("should extract scrollbars from a theme with only scrollbars", function () {
                var themeFile = FileSystem.getFileForPath(testFilePath + "/simple-scrollbars.css");
                var promise = FileUtils.readAsText(themeFile).done(function (content) {
                    var themeScrollbars = ThemeManager._extractScrollbars(content);
                    expect(themeScrollbars.scrollbar.length).toEqual(3);
                    expect(superTrim(themeScrollbars.scrollbar.join(""))).toEqual("::-webkit-scrollbar{width:12px;}::-webkit-scrollbar-thumb:window-inactive{background:white;}::-webkit-scrollbar-thumb{background:white;}");
                    expect(superTrim(themeScrollbars.content)).toEqual("");
                });

                waitsForDone(promise, "theme with only scrollbars", 5000);
            });

            it("should be fine with an empty theme", function () {
                var themeFile = FileSystem.getFileForPath(testFilePath + "/empty.css");
                var promise = FileUtils.readAsText(themeFile).done(function (content) {
                    var themeScrollbars = ThemeManager._extractScrollbars(content);
                    expect(themeScrollbars.scrollbar.length).toEqual(0);
                    expect(superTrim(themeScrollbars.content)).toEqual("");
                });

                waitsForDone(promise, "empty theme", 5000);
            });
        });


        describe("Load themes", function () {
            it("should load a theme from a single CSS file", function () {
                var promise = ThemeManager.loadFile(testFilePath + "/scrollbars.css").done(function (theme) {
                    expect(theme.name).toEqual("scrollbars");
                    expect(theme.displayName).toEqual("Scrollbars");
                });

                waitsForDone(promise, "theme file", 5000);
            });
        });
    });

});
