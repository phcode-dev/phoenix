/*
 * GNU AGPL-3.0 License
 * Copyright (c) 2026 core.ai . All rights reserved.
 */

/*global describe, it, expect, jasmine */

define(function (require, exports, module) {
    const NodeUtils = require("utils/NodeUtils");
    // Capture during module evaluation: awaiting readiness inside an it() misses registration-time races.
    const registeredInCI = Phoenix.isTestWindowGitHubActions;

    /** @return {Array<string>} Names of registered native credential specs, regardless of the active test filter. */
    function getCredentialSpecs() {
        const names = [];
        function visit(suite, parents) {
            const name = (parents + " " + suite.description).trim();
            if (suite.children) {
                suite.children.forEach(child => visit(child, name));
            } else if (name.includes("Credentials OTP API Tests")) {
                names.push(name);
            }
        }
        visit(jasmine.getEnv().topSuite(), "");
        return names;
    }

    describe("unit:Test Environment", function () {
        it("resolves CI detection before test modules register their suites", function () {
            expect(typeof registeredInCI).toBe("boolean");
        });

        it("registers suites using the actual native environment or browser CI query", async function () {
            const expected = Phoenix.isNativeApp ? !!(await NodeUtils.getEnvironmentVariable("GITHUB_ACTIONS")) :
                new URLSearchParams(window.location.search).get("isTestWindowGitHubActions") === "yes";
            expect(registeredInCI).toBe(expected);
        });

        if (Phoenix.isNativeApp) {
            it("receives the CI flag in the completed Node boot response", async function () {
                const boot = await window.nodeSetupDonePromise;
                expect(typeof boot.isGitHubActions).toBe("boolean");
                expect(boot.isGitHubActions).toBe(registeredInCI);
            });

            it("applies the Linux CI keyring exclusion when credential specs register", function () {
                const names = getCredentialSpecs();
                const excluded = Phoenix.platform === "linux" && registeredInCI;
                expect(names.length).toBeGreaterThan(0);
                expect(names.some(name => name.endsWith("Should store credentials successfully"))).toBe(!excluded);
                expect(names.some(name => name.endsWith("Should not run in github actions in linux desktop")))
                    .toBe(excluded);
            });
        }
    });
});
