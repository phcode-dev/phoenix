/*
 * GNU AGPL-3.0 License
 * Copyright (c) 2026 core.ai . All rights reserved.
 */

/*global describe, it, expect, expectAsync */

define(function (require, exports, module) {
    const NodeUtils = require("utils/NodeUtils");

    describe("unit:Test Environment", function () {
        it("waits for a delayed native lookup before exposing the CI flag to suite registration", async function () {
            const platform = {isTestWindow: true, isNativeApp: true};
            let resolveLookup, requestedVariable, registered = false, registeredInCI;
            const lookup = new Promise(resolve => { resolveLookup = resolve; });
            const ready = NodeUtils._initTestWindowEnvironment(platform, name => {
                requestedVariable = name;
                return lookup;
            }, "");
            const registration = ready.then(() => {
                registered = true;
                registeredInCI = platform.isTestWindowGitHubActions;
            });
            await Promise.resolve();
            expect(requestedVariable).toBe("GITHUB_ACTIONS");
            expect(registered).toBeFalse();
            expect(platform.isTestWindowGitHubActions).toBeUndefined();

            resolveLookup("true");
            await registration;
            expect(registeredInCI).toBeTrue();
        });

        it("enables local native test registration when the CI environment variable is absent", async function () {
            const platform = {isTestWindow: true, isNativeApp: true};
            await NodeUtils._initTestWindowEnvironment(platform, async () => undefined, "");
            expect(platform.isTestWindowGitHubActions).toBeFalse();
        });

        it("rejects a failed lookup without registering suites as a non-CI run", async function () {
            const platform = {isTestWindow: true, isNativeApp: true};
            const error = new Error("Native environment lookup failed");
            let registered = false;
            const ready = NodeUtils._initTestWindowEnvironment(platform, async () => { throw error; }, "");
            const registration = ready.then(() => { registered = true; });
            await expectAsync(registration).toBeRejectedWith(error);
            expect(registered).toBeFalse();
            expect(platform.isTestWindowGitHubActions).toBeUndefined();
        });

        for (const [search, expected] of [["?isTestWindowGitHubActions=yes", true],
            ["?isTestWindowGitHubActions=no", false], ["", false]]) {
            it("detects browser CI from " + (search || "an empty query"), async function () {
                const platform = {isTestWindow: true, isNativeApp: false};
                let nativeLookup = false;
                const ready = NodeUtils._initTestWindowEnvironment(platform, async () => { nativeLookup = true; }, search);
                // Browser detection remains synchronous, with an already-resolved readiness promise.
                expect(platform.isTestWindowGitHubActions).toBe(expected);
                await ready;
                expect(nativeLookup).toBeFalse();
            });
        }

        it("does not query or alter the environment of a normal editor window", async function () {
            const platform = {isTestWindow: false, isNativeApp: true};
            let nativeLookup = false;
            await NodeUtils._initTestWindowEnvironment(platform, async () => { nativeLookup = true; }, "");
            expect(nativeLookup).toBeFalse();
            expect(platform.isTestWindowGitHubActions).toBeUndefined();
        });

        it("exposes the completed environment lookup in the running test window", async function () {
            await NodeUtils._testWindowEnvironmentReady;
            expect(typeof Phoenix.isTestWindowGitHubActions).toBe("boolean");
        });
    });
});
