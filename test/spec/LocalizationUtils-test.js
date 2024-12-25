/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
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

/*global describe, it, expect*/

define(function (require, exports, module) {
    const LocalizationUtils = require("utils/LocalizationUtils");

    describe("unit:LocalizationUtils", function () {

        describe("getFormattedDateTime", function () {
            it("should format date in default locale", function () {
                const testDate = new Date(2024, 0, 1, 13, 30); // Jan 1, 2024, 1:30 PM
                const formatted = LocalizationUtils.getFormattedDateTime(testDate);
                expect(formatted).toMatch(/Jan(uary)? 1, 2024/);
                expect(formatted).toMatch(/1:30 PM/);
            });

            it("should format date in specified locale fr", function () {
                const testDate = new Date(2024, 0, 1, 13, 30); // Jan 1, 2024, 1:30 PM
                const formatted = LocalizationUtils.getFormattedDateTime(testDate, "fr");
                // Explicit check for French date and time format
                expect(formatted).toBe("1 janv. 2024, 13:30");
            });

            it("should format in de locale", function () {
                const testDate = new Date(2024, 0, 1, 13, 30); // Jan 1, 2024, 1:30 PM
                const formatted = LocalizationUtils.getFormattedDateTime(testDate, "de"); // German
                expect(formatted).toMatch(/01.01.2024, 13:30/);
            });

            it("should fallback to default locale if invalid locale specified", function () {
                const testDate = new Date(2024, 0, 1, 13, 30); // Jan 1, 2024, 1:30 PM
                const formatted = LocalizationUtils.getFormattedDateTime(testDate, "invalid-locale");
                // Should still format in a valid way
                expect(formatted).toBeTruthy();
                expect(formatted.length).toBeGreaterThan(0);
            });

            it("should handle empty date input gracefully", function () {
                const formattedNow = LocalizationUtils.getFormattedDateTime(); // No date provided
                const now = new Date();
                const expected = new Intl.DateTimeFormat('en', {
                    dateStyle: 'medium',
                    timeStyle: 'short'
                }).format(now);

                expect(formattedNow).toBe(expected);
            });

            it("should handle edge case dates", function () {
                const epochDate = new Date(0); // Unix epoch
                const formattedEpoch = LocalizationUtils.getFormattedDateTime(epochDate);
                expect(formattedEpoch).toBeTruthy();

                const farFutureDate = new Date(3000, 0, 1, 0, 0); // Jan 1, 3000
                const formattedFuture = LocalizationUtils.getFormattedDateTime(farFutureDate);
                expect(formattedFuture).toBeTruthy();
            });

            it("should correctly format using non-Latin locales", function () {
                const testDate = new Date(2024, 0, 1, 13, 30); // Jan 1, 2024, 1:30 PM
                const formatted = LocalizationUtils.getFormattedDateTime(testDate, "ja"); // Japanese
                expect(formatted).toBe("2024/01/01 13:30");
            });

            it("should format using a custom dateStyle and timeStyle (FULL)", function () {
                const testDate = new Date(2024, 0, 1, 13, 30); // Jan 1, 2024, 1:30 PM
                const customFormat = {
                    dateStyle: LocalizationUtils.DATE_TIME_STYLE.FULL,
                    timeStyle: LocalizationUtils.DATE_TIME_STYLE.FULL
                };
                const formatted = LocalizationUtils.getFormattedDateTime(testDate, "en", customFormat);
                // Example format: "Monday, January 1, 2024 at 1:30:00 PM GMT+1"
                expect(formatted).toMatch(/Monday, January 1, 2024/);
                expect(formatted).toMatch(/1:30:00 PM/);
            });

            it("should format using only dateStyle (SHORT)", function () {
                const testDate = new Date(2024, 0, 1, 13, 30); // Jan 1, 2024, 1:30 PM
                const customFormat = {
                    dateStyle: LocalizationUtils.DATE_TIME_STYLE.SHORT
                };
                const formatted = LocalizationUtils.getFormattedDateTime(testDate, "en", customFormat);
                // Example format: "1/1/24"
                expect(formatted).toBe("1/1/24");
            });

            it("should format using only timeStyle (LONG)", function () {
                const testDate = new Date(2024, 0, 1, 13, 30); // Jan 1, 2024, 1:30 PM
                const customFormat = {
                    timeStyle: LocalizationUtils.DATE_TIME_STYLE.LONG
                };
                const formatted = LocalizationUtils.getFormattedDateTime(testDate, "en", customFormat);
                // Example format: "1:30:00 PM GMT+1"
                expect(formatted).toMatch(/1:30:00 PM/);
            });

            it("should respect custom dateTimeFormat and locale", function () {
                const testDate = new Date(2024, 0, 1, 13, 30); // Jan 1, 2024, 1:30 PM
                const customFormat = {
                    dateStyle: LocalizationUtils.DATE_TIME_STYLE.LONG,
                    timeStyle: LocalizationUtils.DATE_TIME_STYLE.SHORT
                };
                const formatted = LocalizationUtils.getFormattedDateTime(testDate, "fr", customFormat);
                // Example format: "1 janvier 2024 à 13:30"
                expect(formatted).toBe("1 janvier 2024 à 13:30");
            });

            it("should default to current date with custom dateTimeFormat", function () {
                const customFormat = {
                    dateStyle: LocalizationUtils.DATE_TIME_STYLE.MEDIUM,
                    timeStyle: LocalizationUtils.DATE_TIME_STYLE.MEDIUM
                };
                const formattedNow = LocalizationUtils.getFormattedDateTime(undefined, "en", customFormat); // No date provided
                const now = new Date();
                const expected = new Intl.DateTimeFormat("en", customFormat).format(now);

                expect(formattedNow).toBe(expected);
            });
        });
    });
}); 