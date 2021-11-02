/*
 * GNU AGPL-3.0 License
 *
 * Modified Work Copyright (c) 2021 - present core.ai . All rights reserved.
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
 *  Utilities functions related to localization/i18n
 */
define(function (require, exports, module) {


    var Strings = require("strings");

    /*
     * Converts a language code to its written name, if possible.
     * If not possible, the language code is simply returned.
     *
     * @param {string} locale The two-char language code
     * @return {string} The language's name or the given language code
     */
    function getLocalizedLabel(locale) {
        var key  = "LOCALE_" + locale.toUpperCase().replace("-", "_"),
            i18n = Strings[key];

        return i18n === undefined ? locale : i18n;
    }


    // Define public API
    exports.getLocalizedLabel = getLocalizedLabel;
});
