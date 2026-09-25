/*
 * Copyright (c) 2021 - present core.ai
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/*global describe, it, expect, beforeAll, awaitsFor */

define(function (require, exports, module) {
    const NodeConnector = require("NodeConnector");

    // The desktop unit jobs exercise Node helpers; browser jobs have no Node runtime.
    if (!Phoenix.isNativeApp) {
        return;
    }

    // npm runs lifecycle scripts (postinstall etc.) through the system shell, which looks up a
    // bare `node` on PATH. Phoenix ships its runtime as `phnode`, so on machines without a system
    // Node every extension / LSP server install with such a script failed. The node side now puts
    // a `node` launcher for phnode on the PATH it hands npm - these specs pin that behaviour.
    describe("unit:Npm Node Shim", function () {
        let nodeConnector;
        const NPM_SPEC_TIMEOUT_MS = 120000;

        beforeAll(async function () {
            await awaitsFor(NodeConnector.isNodeReady, "Node runtime to be ready");
            nodeConnector = NodeConnector.createNodeConnector("ph_test_npm_node_shim", exports);
        });

        ["PATH", "Path"].forEach(function (pathKey) {
            it("should prepend the shim dir to " + pathKey + " and keep its casing", async function () {
                const baseEnv = { [pathKey]: "/usr/bin", SECRET: "stays" };
                const result = await nodeConnector.execPeer("envWithNodeShim", { shimDir: "/shim", baseEnv });
                expect(result.env[pathKey].startsWith("/shim")).toBe(true);
                expect(result.env[pathKey].endsWith("/usr/bin")).toBe(true);
                expect(result.env.SECRET).toBe("stays");
                const pathKeys = Object.keys(result.env).filter(key => key.toLowerCase() === "path");
                expect(pathKeys).toEqual([pathKey]);
                expect(result.baseEnv).toEqual(baseEnv);
            });
        });

        it("should set PATH to just the shim dir when none is inherited", async function () {
            const result = await nodeConnector.execPeer("envWithNodeShim", { shimDir: "/shim", baseEnv: {} });
            expect(result.env).toEqual({ PATH: "/shim" });
        });

        it("should let a shell script find `node` only through the shim", async function () {
            const result = await nodeConnector.execPeer("runNodeShimFixture");
            // no Node on PATH at all: the exact failure users reported
            expect(result.without.status).not.toBe(0);
            expect(result.without.stdout).toBe("");
            // with the shim: runs on our runtime, args and exit code pass straight through
            expect(result.withShim.stdout).toBe(result.expectedStdout);
            expect(result.withShim.status).toBe(result.expectedStatus);
            expect(result.shimRemoved).toBe(true);
        });

        it("should run a postinstall script that calls `node` during npm install", async function () {
            const result = await nodeConnector.execPeer("runPostinstallFixture");
            expect(result.installError).toBeNull();
            expect(result.postinstallExecPath).toBe(result.execPath);
        }, NPM_SPEC_TIMEOUT_MS);
    });
});
