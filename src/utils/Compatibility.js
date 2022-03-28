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

/**
 * Compatibility shims for running Brackets in various environments, browsers.
 */
define(function () {


    // [IE10] String.prototype missing trimRight() and trimLeft()
    if (!String.prototype.trimRight) {
        String.prototype.trimRight = function () { return this.replace(/\s+$/, ""); };
    }
    if (!String.prototype.trimLeft) {
        String.prototype.trimLeft = function () { return this.replace(/^\s+/, ""); };
    }

    // Feature detection for Error.stack. Not all browsers expose it
    // and Brackets assumes it will be a non-null string.
    if (typeof (new Error()).stack === "undefined") {
        Error.prototype.stack = "";
    }

});
