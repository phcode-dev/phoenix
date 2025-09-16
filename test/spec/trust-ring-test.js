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

/*global describe, it, expect, beforeEach, afterEach, fs, path, jasmine, expectAsync*/

define(function (require, exports, module) {

    const SpecRunnerUtils     = require("spec/SpecRunnerUtils");

    describe("unit: Trust Ring Tests", function () {
        const TrustRing = window.specRunnerTestKernalModeTrust;

        beforeEach(async function () {

        });

        afterEach(async function () {

        });

        describe("generateDataSignature", function () {
            it("should generate a consistent signature for the same data and salt", async function () {
                const data = "test data";
                const salt = "test salt";

                const signature1 = await TrustRing.generateDataSignature(data, salt);
                const signature2 = await TrustRing.generateDataSignature(data, salt);

                expect(signature1).toBe(signature2);
                expect(signature1).toBeDefined();
                expect(typeof signature1).toBe('string');
                expect(signature1.length).toBeGreaterThan(0);
            });

            it("should generate different signatures for different data", async function () {
                const salt = "test salt";

                const signature1 = await TrustRing.generateDataSignature("data1", salt);
                const signature2 = await TrustRing.generateDataSignature("data2", salt);

                expect(signature1).not.toBe(signature2);
            });

            it("should generate different signatures for different salts", async function () {
                const data = "test data";

                const signature1 = await TrustRing.generateDataSignature(data, "salt1");
                const signature2 = await TrustRing.generateDataSignature(data, "salt2");

                expect(signature1).not.toBe(signature2);
            });

            it("should handle empty strings", async function () {
                const signature1 = await TrustRing.generateDataSignature("", "");
                const signature2 = await TrustRing.generateDataSignature("", "salt");
                const signature3 = await TrustRing.generateDataSignature("data", "");

                expect(signature1).toBeDefined();
                expect(signature2).toBeDefined();
                expect(signature3).toBeDefined();
                expect(signature1).not.toBe(signature2);
                expect(signature2).not.toBe(signature3);
            });

            it("should generate hexadecimal string output", async function () {
                const signature = await TrustRing.generateDataSignature("test", "salt");

                expect(signature).toMatch(/^[a-f0-9]+$/);
            });
        });

        describe("validateDataSignature", function () {
            it("should validate correct signature", async function () {
                const data = "test data";
                const salt = "test salt";

                const signature = await TrustRing.generateDataSignature(data, salt);
                const isValid = await TrustRing.validateDataSignature(data, signature, salt);

                expect(isValid).toBe(true);
            });

            it("should reject invalid signature", async function () {
                const data = "test data";
                const salt = "test salt";
                const invalidSignature = "invalid signature";

                const isValid = await TrustRing.validateDataSignature(data, invalidSignature, salt);

                expect(isValid).toBe(false);
            });

            it("should reject signature with wrong data", async function () {
                const salt = "test salt";

                const signature = await TrustRing.generateDataSignature("original data", salt);
                const isValid = await TrustRing.validateDataSignature("different data", signature, salt);

                expect(isValid).toBe(false);
            });

            it("should reject signature with wrong salt", async function () {
                const data = "test data";

                const signature = await TrustRing.generateDataSignature(data, "original salt");
                const isValid = await TrustRing.validateDataSignature(data, signature, "different salt");

                expect(isValid).toBe(false);
            });

            it("should return false for null or undefined data", async function () {
                const signature = "some signature";
                const salt = "test salt";

                const isValid1 = await TrustRing.validateDataSignature(null, signature, salt);
                const isValid2 = await TrustRing.validateDataSignature(undefined, signature, salt);

                expect(isValid1).toBe(false);
                expect(isValid2).toBe(false);
            });

            it("should return false for null or undefined signature", async function () {
                const data = "test data";
                const salt = "test salt";

                const isValid1 = await TrustRing.validateDataSignature(data, null, salt);
                const isValid2 = await TrustRing.validateDataSignature(data, undefined, salt);

                expect(isValid1).toBe(false);
                expect(isValid2).toBe(false);
            });

            it("should handle empty strings correctly", async function () {
                const signature = await TrustRing.generateDataSignature("", "");
                const isValid = await TrustRing.validateDataSignature("", signature, "");

                expect(isValid).toBe(true);
            });
        });

        describe("generateDataSignature and validateDataSignature integration", function () {
            it("should work with JSON data like entitlements", async function () {
                const entitlements = {
                    premium: true,
                    features: ["feature1", "feature2"],
                    expiry: "2024-12-31"
                };
                const jsonData = JSON.stringify(entitlements);
                const salt = "random-salt-123";

                const signature = await TrustRing.generateDataSignature(jsonData, salt);
                const isValid = await TrustRing.validateDataSignature(jsonData, signature, salt);

                expect(isValid).toBe(true);
            });

            it("should work with unicode characters", async function () {
                const data = "测试数据 with émojis 🔒";
                const salt = "unicode-salt-🔑";

                const signature = await TrustRing.generateDataSignature(data, salt);
                const isValid = await TrustRing.validateDataSignature(data, signature, salt);

                expect(isValid).toBe(true);
            });

            it("should work with large data strings", async function () {
                const largeData = "x".repeat(10000);
                const salt = "large-data-salt";

                const signature = await TrustRing.generateDataSignature(largeData, salt);
                const isValid = await TrustRing.validateDataSignature(largeData, signature, salt);

                expect(isValid).toBe(true);
            });
        });
    });
});
