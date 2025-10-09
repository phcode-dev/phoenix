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

/*global describe, it, expect, beforeEach*/

define(function (require, exports, module) {

    const LoginUtils = require("services/login-utils");

    describe("unit:Login Utils", function () {

        describe("validTillExpired", function () {
            const now = Date.now();
            const futureTime = now + 86400000; // 1 day from now
            const pastTime = now - 86400000; // 1 day ago
            const recentPastTime = now - 3600000; // 1 hour ago

            beforeEach(function () {
                // Mock brackets.config for tests
                window.brackets = window.brackets || {};
                window.brackets.config = window.brackets.config || {};
                window.brackets.config.main_pro_plan = "Phoenix Pro";
            });

            it("should return null for null entitlements", function () {
                const result = LoginUtils.validTillExpired(null, null);
                expect(result).toBe(null);
            });

            it("should return null for undefined entitlements", function () {
                const result = LoginUtils.validTillExpired(undefined, null);
                expect(result).toBe(null);
            });

            it("should return null when no validTill times exist", function () {
                const entitlements = {
                    plan: { name: "Phoenix Pro", isSubscriber: true },
                    entitlements: {
                        liveEdit: { activated: true }
                    }
                };
                const result = LoginUtils.validTillExpired(entitlements, null);
                expect(result).toBe(null);
            });

            it("should return null when validTill times are in the future", function () {
                const entitlements = {
                    plan: { name: "Phoenix Pro", isSubscriber: true, validTill: futureTime },
                    entitlements: {
                        liveEdit: { activated: true, validTill: futureTime }
                    }
                };
                const result = LoginUtils.validTillExpired(entitlements, null);
                expect(result).toBe(null);
            });

            it("should return plan name when plan validTill is newly expired", function () {
                const entitlements = {
                    plan: { name: "Phoenix Pro", isSubscriber: true, validTill: pastTime },
                    entitlements: {}
                };
                const lastRecorded = {
                    plan: { name: "Phoenix Pro", isSubscriber: true, validTill: futureTime },
                    entitlements: {}
                };
                const result = LoginUtils.validTillExpired(entitlements, lastRecorded);
                expect(result).toBe("Phoenix Pro");
            });

            it("should return default plan name when plan validTill is newly expired and no name", function () {
                const entitlements = {
                    plan: { isSubscriber: true, validTill: pastTime },
                    entitlements: {}
                };
                const lastRecorded = {
                    plan: { isSubscriber: true, validTill: futureTime },
                    entitlements: {}
                };
                const result = LoginUtils.validTillExpired(entitlements, lastRecorded);
                expect(result).toBe("Phoenix Pro");
            });

            it("should return null when plan validTill was already expired", function () {
                const entitlements = {
                    plan: { name: "Phoenix Pro", isSubscriber: true, validTill: pastTime },
                    entitlements: {}
                };
                const lastRecorded = {
                    plan: { name: "Phoenix Pro", isSubscriber: true, validTill: recentPastTime },
                    entitlements: {}
                };
                const result = LoginUtils.validTillExpired(entitlements, lastRecorded);
                expect(result).toBe(null);
            });

            it("should return entitlement key when entitlement validTill is newly expired", function () {
                const entitlements = {
                    plan: { name: "Phoenix Pro", isSubscriber: true },
                    entitlements: {
                        liveEdit: { activated: true, validTill: pastTime },
                        liveEditAI: { activated: true, validTill: futureTime }
                    }
                };
                const lastRecorded = {
                    plan: { name: "Phoenix Pro", isSubscriber: true },
                    entitlements: {
                        liveEdit: { activated: true, validTill: futureTime },
                        liveEditAI: { activated: true, validTill: futureTime }
                    }
                };
                const result = LoginUtils.validTillExpired(entitlements, lastRecorded);
                expect(result).toBe("liveEdit");
            });

            it("should return null when entitlement validTill was already expired", function () {
                const entitlements = {
                    plan: { name: "Phoenix Pro", isSubscriber: true },
                    entitlements: {
                        liveEdit: { activated: true, validTill: pastTime }
                    }
                };
                const lastRecorded = {
                    plan: { name: "Phoenix Pro", isSubscriber: true },
                    entitlements: {
                        liveEdit: { activated: true, validTill: recentPastTime }
                    }
                };
                const result = LoginUtils.validTillExpired(entitlements, lastRecorded);
                expect(result).toBe(null);
            });

            it("should handle missing entitlements in lastRecorded", function () {
                const entitlements = {
                    plan: { name: "Phoenix Pro", isSubscriber: true, validTill: pastTime },
                    entitlements: {
                        liveEdit: { activated: true, validTill: pastTime }
                    }
                };
                const result = LoginUtils.validTillExpired(entitlements, null);
                expect(result).toBe("Phoenix Pro");
            });

            it("should skip null entitlements in loop", function () {
                const entitlements = {
                    plan: { name: "Phoenix Pro", isSubscriber: true },
                    entitlements: {
                        liveEdit: null,
                        liveEditAI: { activated: true, validTill: pastTime }
                    }
                };
                const lastRecorded = {
                    plan: { name: "Phoenix Pro", isSubscriber: true },
                    entitlements: {
                        liveEdit: null,
                        liveEditAI: { activated: true, validTill: futureTime }
                    }
                };
                const result = LoginUtils.validTillExpired(entitlements, lastRecorded);
                expect(result).toBe("liveEditAI");
            });

            it("should test server response shape", function () {
                const serverEntitlements = {
                    isSuccess: true,
                    lang: "en",
                    plan: {
                        name: "Phoenix Pro",
                        isSubscriber: true,
                        validTill: pastTime
                    },
                    profileview: {
                        quota: {
                            titleText: "Ai Quota Used",
                            usageText: "100 / 200 credits",
                            usedPercent: 20
                        },
                        htmlMessage: "<div class=\"alert alert-danger\" role=\"alert\"><strong>Quota exceeded:</strong> Your quota will reset at 3pm today.</div>"
                    },
                    entitlements: {
                        liveEdit: {
                            activated: false,
                            subscribeURL: "https://account.phcode.dev/...",
                            upgradeToPlan: "Phoenix Pro",
                            validTill: futureTime
                        },
                        liveEditAI: {
                            activated: false,
                            subscribeURL: "https://account.phcode.dev/...",
                            purchaseCreditsURL: "https://account.phcode.dev/...",
                            upgradeToPlan: "Phoenix Pro",
                            validTill: futureTime
                        }
                    }
                };
                const lastRecorded = {
                    plan: { name: "Phoenix Pro", isSubscriber: true, validTill: futureTime },
                    entitlements: {
                        liveEdit: { activated: false, validTill: futureTime },
                        liveEditAI: { activated: false, validTill: futureTime }
                    }
                };
                const result = LoginUtils.validTillExpired(serverEntitlements, lastRecorded);
                expect(result).toBe("Phoenix Pro");
            });

            it("should test trial-enhanced shape", function () {
                const trialEnhanced = {
                    isSuccess: true,
                    plan: {
                        name: "Phoenix Pro",
                        isSubscriber: true,
                        validTill: pastTime
                    },
                    isInProTrial: true,
                    trialDaysRemaining: 5,
                    entitlements: {
                        liveEdit: {
                            activated: true,
                            subscribeURL: "https://account.phcode.dev/...",
                            upgradeToPlan: "Phoenix Pro",
                            validTill: futureTime
                        }
                    }
                };
                const lastRecorded = {
                    plan: { name: "Phoenix Pro", isSubscriber: true, validTill: futureTime },
                    entitlements: {
                        liveEdit: { activated: true, validTill: futureTime }
                    }
                };
                const result = LoginUtils.validTillExpired(trialEnhanced, lastRecorded);
                expect(result).toBe("Phoenix Pro");
            });

            it("should test synthetic trial shape", function () {
                const syntheticTrial = {
                    plan: {
                        isSubscriber: true,
                        name: "Phoenix Pro",
                        validTill: pastTime
                    },
                    isInProTrial: true,
                    trialDaysRemaining: 3,
                    entitlements: {
                        liveEdit: {
                            activated: true,
                            subscribeURL: "https://account.phcode.dev/...",
                            upgradeToPlan: "Phoenix Pro",
                            validTill: futureTime
                        }
                    }
                };
                const lastRecorded = {
                    plan: { name: "Phoenix Pro", isSubscriber: true, validTill: futureTime },
                    entitlements: {
                        liveEdit: { activated: true, validTill: futureTime }
                    }
                };
                const result = LoginUtils.validTillExpired(syntheticTrial, lastRecorded);
                expect(result).toBe("Phoenix Pro");
            });
        });

        describe("haveEntitlementsChanged", function () {

            it("should return false when both entitlements are null", function () {
                const result = LoginUtils.haveEntitlementsChanged(null, null);
                expect(result).toBe(false);
            });

            it("should return false when both entitlements are undefined", function () {
                const result = LoginUtils.haveEntitlementsChanged(undefined, undefined);
                expect(result).toBe(false);
            });

            it("should return true when current is null and last exists", function () {
                const last = { plan: { name: "Phoenix Pro" } };
                const result = LoginUtils.haveEntitlementsChanged(null, last);
                expect(result).toBe(true);
            });

            it("should return true when current exists and last is null", function () {
                const current = { plan: { name: "Phoenix Pro" } };
                const result = LoginUtils.haveEntitlementsChanged(current, null);
                expect(result).toBe(true);
            });

            it("should return true when current has entitlements and last doesn't", function () {
                const current = { 
                    plan: { name: "Phoenix Pro" },
                    entitlements: { liveEdit: { activated: true } }
                };
                const last = { 
                    plan: { name: "Phoenix Pro" }
                };
                const result = LoginUtils.haveEntitlementsChanged(current, last);
                expect(result).toBe(true);
            });

            it("should return true when last has entitlements and current doesn't", function () {
                const current = { 
                    plan: { name: "Phoenix Pro" }
                };
                const last = { 
                    plan: { name: "Phoenix Pro" },
                    entitlements: { liveEdit: { activated: true } }
                };
                const result = LoginUtils.haveEntitlementsChanged(current, last);
                expect(result).toBe(true);
            });

            it("should return true when isSubscriber status changes", function () {
                const current = { 
                    plan: { name: "Phoenix Pro", isSubscriber: true },
                    entitlements: {}
                };
                const last = { 
                    plan: { name: "Phoenix Pro", isSubscriber: false },
                    entitlements: {}
                };
                const result = LoginUtils.haveEntitlementsChanged(current, last);
                expect(result).toBe(true);
            });

            it("should return true when plan name changes", function () {
                const current = { 
                    plan: { name: "Phoenix Pro", isSubscriber: true },
                    entitlements: {}
                };
                const last = { 
                    plan: { name: "Phoenix Basic", isSubscriber: true },
                    entitlements: {}
                };
                const result = LoginUtils.haveEntitlementsChanged(current, last);
                expect(result).toBe(true);
            });

            it("should return true when entitlement activation changes", function () {
                const current = { 
                    plan: { name: "Phoenix Pro", isSubscriber: true },
                    entitlements: {
                        liveEdit: { activated: true },
                        liveEditAI: { activated: false }
                    }
                };
                const last = { 
                    plan: { name: "Phoenix Pro", isSubscriber: true },
                    entitlements: {
                        liveEdit: { activated: false },
                        liveEditAI: { activated: false }
                    }
                };
                const result = LoginUtils.haveEntitlementsChanged(current, last);
                expect(result).toBe(true);
            });

            it("should return false when nothing has changed", function () {
                const current = { 
                    plan: { name: "Phoenix Pro", isSubscriber: true },
                    entitlements: {
                        liveEdit: { activated: true },
                        liveEditAI: { activated: false }
                    }
                };
                const last = { 
                    plan: { name: "Phoenix Pro", isSubscriber: true },
                    entitlements: {
                        liveEdit: { activated: true },
                        liveEditAI: { activated: false }
                    }
                };
                const result = LoginUtils.haveEntitlementsChanged(current, last);
                expect(result).toBe(false);
            });

            it("should handle missing plan objects", function () {
                const current = { 
                    entitlements: { liveEdit: { activated: true } }
                };
                const last = { 
                    entitlements: { liveEdit: { activated: true } }
                };
                const result = LoginUtils.haveEntitlementsChanged(current, last);
                expect(result).toBe(false);
            });

            it("should handle missing entitlement objects", function () {
                const current = { 
                    plan: { name: "Phoenix Pro", isSubscriber: true },
                    entitlements: {
                        liveEdit: { activated: true },
                        liveEditAI: null
                    }
                };
                const last = { 
                    plan: { name: "Phoenix Pro", isSubscriber: true },
                    entitlements: {
                        liveEdit: { activated: true },
                        liveEditAI: null
                    }
                };
                const result = LoginUtils.haveEntitlementsChanged(current, last);
                expect(result).toBe(false);
            });

            it("should test server response shape changes", function () {
                const serverCurrent = {
                    isSuccess: true,
                    lang: "en",
                    plan: {
                        name: "Phoenix Pro",
                        isSubscriber: true,
                        validTill: 1756625665847
                    },
                    entitlements: {
                        liveEdit: { activated: true },
                        liveEditAI: { activated: false }
                    }
                };
                const serverLast = {
                    isSuccess: true,
                    lang: "en",
                    plan: {
                        name: "Phoenix Pro",
                        isSubscriber: true,
                        validTill: 1756625665847
                    },
                    entitlements: {
                        liveEdit: { activated: false },
                        liveEditAI: { activated: false }
                    }
                };
                const result = LoginUtils.haveEntitlementsChanged(serverCurrent, serverLast);
                expect(result).toBe(true);
            });

            it("should test trial-enhanced shape changes", function () {
                const trialCurrent = {
                    plan: {
                        name: "Phoenix Pro",
                        isSubscriber: true,
                        validTill: 1756625665847
                    },
                    isInProTrial: true,
                    trialDaysRemaining: 5,
                    entitlements: {
                        liveEdit: { activated: true }
                    }
                };
                const trialLast = {
                    plan: {
                        name: "Phoenix Pro",
                        isSubscriber: false,
                        validTill: 1756625665847
                    },
                    entitlements: {
                        liveEdit: { activated: false }
                    }
                };
                const result = LoginUtils.haveEntitlementsChanged(trialCurrent, trialLast);
                expect(result).toBe(true);
            });

            it("should test synthetic trial shape changes", function () {
                const syntheticCurrent = {
                    plan: {
                        isSubscriber: true,
                        name: "Phoenix Pro",
                        validTill: 1756625665847
                    },
                    isInProTrial: true,
                    trialDaysRemaining: 3,
                    entitlements: {
                        liveEdit: { activated: true }
                    }
                };
                const syntheticLast = null;
                const result = LoginUtils.haveEntitlementsChanged(syntheticCurrent, syntheticLast);
                expect(result).toBe(true);
            });
        });
    });
});
