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

    const Strings = require("strings");

    /**
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

    const DATE_TIME_STYLE = {
        FULL: "full",
        LONG: "long",
        MEDIUM: "medium",
        SHORT: "short"
    };

    /**
     * Formats a given date object into a locale-aware date and time string.
     *
     * @param {Date} [date] - The date object to format. If not provided, the current date and time will be used.
     * @param {string} [lang] - Optional language code to use for formatting (e.g., 'en', 'fr').
     *                          If not provided, defaults to the application locale or 'en'.
     * @param {Object} [dateTimeFormat] - Optional object specifying the date and time formatting options.
     *                                    Defaults to { dateStyle: 'medium', timeStyle: 'short' }.
     * @param {string} [dateTimeFormat.dateStyle] - Specifies the date format style. One of: DATE_TIME_STYLE.*
     * @param {string} [dateTimeFormat.timeStyle] - Specifies the time format style. One of: DATE_TIME_STYLE.*
     * @returns {string} - The formatted date and time string (e.g., "Dec 24, 2024, 10:30 AM").
     */
    function getFormattedDateTime(date, lang, dateTimeFormat) {
        if(!date){
            date = new Date();
        }
        if(!dateTimeFormat){
            dateTimeFormat = {
                dateStyle: DATE_TIME_STYLE.MEDIUM,
                timeStyle: DATE_TIME_STYLE.SHORT
            };
        }
        return Intl.DateTimeFormat([lang || brackets.getLocale() || "en", "en"], dateTimeFormat).format(date);
    }

    /**
     * Returns a relative time string (e.g., "2 days ago", "in 3 hours") based on the difference between the given date and now.
     *
     * @param {Date} [date] - The date to compare with the current date and time. If not given, defaults to now.
     * @param {string} [lang] - Optional language code to use for formatting (e.g., 'en', 'fr').
     *                          If not provided, defaults to the application locale or 'en'.
     * @returns {string} - A human-readable relative time string (e.g., "2 days ago", "in 3 hours").
     */
    function dateTimeFromNow(date, lang) {
        date = date || new Date();
        const now = new Date();
        const diffInSeconds = Math.floor((date - now) / 1000);

        const rtf = new Intl.RelativeTimeFormat([lang || brackets.getLocale() || "en", "en"],
            { numeric: 'auto' });

        if (Math.abs(diffInSeconds) < 60) {
            return rtf.format(diffInSeconds, 'second');
        } else if (Math.abs(diffInSeconds) < 3600) {
            return rtf.format(Math.floor(diffInSeconds / 60), 'minute');
        } else if (Math.abs(diffInSeconds) < 86400) {
            return rtf.format(Math.floor(diffInSeconds / 3600), 'hour');
        } else if (Math.abs(diffInSeconds) < 2592000) {
            return rtf.format(Math.floor(diffInSeconds / 86400), 'day');
        } else if (Math.abs(diffInSeconds) < 31536000) {
            return rtf.format(Math.floor(diffInSeconds / 2592000), 'month');
        } else {
            return rtf.format(Math.floor(diffInSeconds / 31536000), 'year');
        }
    }


    // Define public API
    exports.getLocalizedLabel = getLocalizedLabel;
    exports.getFormattedDateTime = getFormattedDateTime;
    exports.dateTimeFromNow = dateTimeFromNow;
    // public constants
    exports.DATE_TIME_STYLE = DATE_TIME_STYLE;
});
