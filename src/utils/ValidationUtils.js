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

// @INCLUDE_IN_API_DOCS

define(function (require, exports, module) {



    /**
     * Used to validate whether type of unknown value is an integer.
     *
     * @param {*} value Value for which to validate its type
     * @return {boolean} true if value is a finite integer
     */
    function isInteger(value) {
        // Validate value is a number
        if (typeof (value) !== "number" || isNaN(parseInt(value, 10))) {
            return false;
        }

        // Validate number is an integer
        if (Math.floor(value) !== value) {
            return false;
        }

        // Validate number is finite
        if (!isFinite(value)) {
            return false;
        }

        return true;
    }

    /**
     * Used to validate whether type of unknown value is an integer, and, if so,
     * is it within the option lower and upper limits.
     *
     * @param {*} value Value for which to validate its type
     * @param {number=} lowerLimit Optional lower limit (inclusive)
     * @param {number=} upperLimit Optional upper limit (inclusive)
     * @return {boolean} true if value is an interger, and optionally in specified range.
     */
    function isIntegerInRange(value, lowerLimit, upperLimit) {
        // Validate value is an integer
        if (!isInteger(value)) {
            return false;
        }

        // Validate integer is in range
        var hasLowerLimt = (typeof (lowerLimit) === "number"),
            hasUpperLimt = (typeof (upperLimit) === "number");

        return ((!hasLowerLimt || value >= lowerLimit) && (!hasUpperLimt || value <= upperLimit));
    }


    // Define public API
    exports.isInteger               = isInteger;
    exports.isIntegerInRange        = isIntegerInRange;
});
