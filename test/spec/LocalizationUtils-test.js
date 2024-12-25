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
                expect(formatted.includes("1 janvier 2024")).toBeTrue();
                expect(formatted.includes("13:30")).toBeTrue();
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

        describe("dateTimeFromNow", function () {
            it("should return 'now' for current time", function () {
                const now = new Date();
                let result = LocalizationUtils.dateTimeFromNow(now, "en");
                expect(result).toBe("now");
                result = LocalizationUtils.dateTimeFromNow(now, "de");
                expect(result).toBe("jetzt");
            });

            it("should handle future dates within seconds", function () {
                const futureDate = new Date(Date.now() + 30 * 1000); // 30 seconds in the future
                const result = LocalizationUtils.dateTimeFromNow(futureDate, "en");
                expect(result).toBe("in 30 seconds");
            });

            it("should handle past dates within minutes", function () {
                const pastDate = new Date(Date.now() - 90 * 1000); // 90 seconds in the past
                const result = LocalizationUtils.dateTimeFromNow(pastDate, "en");
                expect(result).toBe("2 minutes ago");
            });

            it("should handle future dates within hours", function () {
                const futureDate = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours in the future
                const result = LocalizationUtils.dateTimeFromNow(futureDate, "en");
                expect(result).toBe("in 2 hours");
            });

            it("should handle past dates within days", function () {
                const pastDate = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000); // 3 days ago
                const result = LocalizationUtils.dateTimeFromNow(pastDate, "en");
                expect(result).toBe("3 days ago");
            });

            it("should handle future dates within months", function () {
                const futureDate = new Date(Date.now() + 45 * 24 * 60 * 60 * 1000); // 45 days in the future
                const result = LocalizationUtils.dateTimeFromNow(futureDate, "en");
                expect(result).toBe("next month");
            });

            it("should handle past dates within years", function () {
                const pastDate = new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000); // 2 years ago
                const result = LocalizationUtils.dateTimeFromNow(pastDate, "en");
                expect(result).toBe("2 years ago");
            });

            it("should return relative time in French locale", function () {
                const pastDate = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000); // 3 days ago
                const result = LocalizationUtils.dateTimeFromNow(pastDate, "fr");
                expect(result).toBe("il y a 3 jours");
            });

            it("should fallback to default locale if an invalid locale is specified", function () {
                const futureDate = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours in the future
                const result = LocalizationUtils.dateTimeFromNow(futureDate, "invalid-locale");
                expect(result).toBe("in 2 hours");
            });

            it("should handle default date input (now) gracefully", function () {
                const result = LocalizationUtils.dateTimeFromNow(undefined, "en");
                expect(result).toBe("now");
            });
        });
    });
}); 