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

/*global describe, it, expect */

define(function (require, exports, module) {


    var StringUtils = require("utils/StringUtils"),
        kilobyte = 1024,
        megabyte = kilobyte * 1024,
        gigabyte = megabyte * 1024,
        terabyte = gigabyte * 1024;

    describe("StringUtils", function () {


        describe("prettyPrintBytes", function () {
            it("should convert a number of bytes into a human readable string", function () {

                var prettyBytes = StringUtils.prettyPrintBytes(1);
                expect(prettyBytes).toBe("1 B");

                prettyBytes = StringUtils.prettyPrintBytes(kilobyte);
                expect(prettyBytes).toBe("1 KB");

                prettyBytes = StringUtils.prettyPrintBytes(megabyte);
                expect(prettyBytes).toBe("1 MB");

                prettyBytes = StringUtils.prettyPrintBytes(gigabyte);
                expect(prettyBytes).toBe("1 GB");

                prettyBytes = StringUtils.prettyPrintBytes(terabyte);
                expect(prettyBytes).toBe("1 TB");
            });
        });


    });
});
