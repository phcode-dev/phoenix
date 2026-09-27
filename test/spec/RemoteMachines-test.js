/*
 * Copyright (c) 2021 - present core.ai
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/*global describe, it, expect, beforeAll, awaitsFor */

define(function (require, exports, module) {
    const NodeConnector = require("NodeConnector");

    // Browser-shaped fixtures and local transport children run through the existing desktop Node test helper.
    if (!Phoenix.isNativeApp) { return; }

    describe("unit:Remote Machines", function () {
        let node;
        beforeAll(async function () {
            await awaitsFor(NodeConnector.isNodeReady, "Node test helpers to be ready");
            node = NodeConnector.createNodeConnector("ph_test_remote_machines", exports);
        });

        it("prefixes the displayed hello while retaining the unprefixed window base", async function () {
            const result = await node.execPeer("bootFixture", { scenario: "valid" });
            expect(result.names).toEqual(["remote-box-phoenix-electron-window"]);
            expect(result.base).toBe("phoenix-electron-window");
            expect(result.display).toBe(result.names[0]);
            expect(result.capturedImmediately).toBeTrue();
        });
        ["offline", "disconnected", "unsupported", "invalid-name", "oversized", "timeout"].forEach(function (scenario) {
            it("keeps existing localhost behavior when metadata is " + scenario, async function () {
                const result = await node.execPeer("bootFixture", { scenario });
                expect(result.names).toEqual(["phoenix-electron-window"]);
                expect(result.urls).toEqual(["ws://localhost:38571"]);
            });
        });
        it("refreshes a renamed machine without adding a second prefix", async function () {
            const result = await node.execPeer("bootFixture", { scenario: "rename" });
            expect(result.names).toEqual(["remote-box-phoenix-electron-window", "renamed-box-phoenix-electron-window"]);
            expect(result.base).toBe("phoenix-electron-window");
        });
        it("honors an explicit custom WebSocket URL", async function () {
            const result = await node.execPeer("bootFixture", { scenario: "custom-url" });
            expect(result.urls).toEqual(["ws://localhost:49001/custom"]);
        });
        ["disabled", "production"].forEach(function (scenario) {
            it("does not probe or capture console output when Builder is " + scenario, async function () {
                const result = await node.execPeer("bootFixture", { scenario });
                expect(result.enabled).toBeFalse(); expect(result.probes).toBe(0);
                expect(result.sockets).toBe(0); expect(result.capturedImmediately).toBeFalse();
            });
        });
        it("does not open a late socket after disconnecting during discovery", async function () {
            const result = await node.execPeer("bootFixture", { scenario: "cancel" });
            expect(result.aborted).toBeTrue(); expect(result.sockets).toBe(0);
        });
        it("gives newly created windows independent longer discriminators", async function () {
            const first = await node.execPeer("bootFixture", { scenario: "new-window" });
            const second = await node.execPeer("bootFixture", { scenario: "new-window" });
            expect(first.base).toMatch(/^phoenix-electron-[a-f0-9]{12}$/);
            expect(second.base).not.toBe(first.base);
        });
        it("exposes only app tools, explains remote machine control and exits on upstream EOF", async function () {
            const result = await node.execPeer("transportFixture", { scenario: "stdio" });
            expect(result.initialized).toBeTrue(); expect(result.tools).toContain("start_phoenix");
            expect(result.tools.some(name => name.startsWith("remote_"))).toBeFalse();
            expect(result.instructions).toContain("separate remote-control MCP");
            expect(result.instructions).toContain("machine-prefixed instance name");
            expect(result.local.processRunning).toBeFalse();
            expect(result.code).withContext(result.stderr).toBe(0); expect(result.signal).toBeNull();
        });
        it("trusts all Builder origins, including arbitrary custom native protocol hosts", async function () {
            const result = await node.execPeer("transportFixture", { scenario: "all-origins" });
            expect(result.count).toBe(4);
        });
        it("reports a port conflict while leaving the original Builder listener alive", async function () {
            const result = await node.execPeer("transportFixture", { scenario: "conflict" });
            expect(result.conflict).toBe("EADDRINUSE"); expect(result.instances).toEqual(["still-alive"]);
        });
        it("rejects a pending app request as soon as that instance disconnects", async function () {
            const result = await node.execPeer("transportFixture", { scenario: "disconnect" });
            expect(result.error).toContain("disconnected");
        });
        it("does not let another app socket answer a request it does not own", async function () {
            const result = await node.execPeer("transportFixture", { scenario: "reply-owner" });
            expect(result.value).toBe("correct-client");
        });
    });
});
