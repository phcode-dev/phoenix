/*
 * GNU AGPL-3.0 License
 * Copyright (c) 2026 core.ai . All rights reserved.
 */

/*global describe, it, afterEach, expect */

define(function (require, exports, module) {
    const bootSource = require("text!phoenix-builder/phoenix-builder-boot.js");

    // The boot script has no AMD exports. Run it with isolated browser dependencies, as shipped.
    const runBoot = eval("(function(window, AppConfig, Phoenix, localStorage, sessionStorage, console, " +
        "fetch, WebSocket, setInterval, clearInterval) {\n" + bootSource + "\n})");
    const BASE_NAME = "phoenix-tauri-builder-fixture";

    /**
     * Capture boot handshakes without touching the runner's storage, console or Builder socket.
     * @param {function(): Promise<Response>} readMetadata Supplies an isolated metadata response.
     * @return {Object} Fixture window, captured lookups, next-hello promise and cleanup function.
     */
    function createHarness(readMetadata) {
        const storage = new Map([["phoenixBuilderEnabled", "true"], ["phoenixBuilderInstanceName", BASE_NAME]]);
        const storageAPI = { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) };
        const appConfig = { config: { environment: "dev" } };
        const platform = {};
        const fixtureWindow = { AppConfig: appConfig, Phoenix: platform, __TAURI__: true, addEventListener() {} };
        const quietConsole = { log() {}, info() {}, warn() {}, error() {} };
        const lookups = [];
        const hellos = [];
        const waiting = [];

        class FixtureSocket {
            constructor(url) {
                this.url = url;
                this.readyState = 0;
                Promise.resolve().then(() => {
                    if (this.readyState === 0) {
                        this.readyState = FixtureSocket.OPEN;
                        this.onopen();
                    }
                });
            }

            send(text) {
                const message = JSON.parse(text);
                if (message.type === "hello") {
                    if (waiting.length) {
                        waiting.shift()(message);
                    } else {
                        hellos.push(message);
                    }
                }
            }

            close() {
                this.readyState = 3;
            }
        }
        FixtureSocket.OPEN = 1;

        runBoot(fixtureWindow, appConfig, platform, storageAPI, storageAPI, quietConsole, (url, options) => {
            lookups.push({ url, options });
            return readMetadata();
        }, FixtureSocket, () => 0, () => {});

        return {
            window: fixtureWindow,
            lookups,
            nextHello: () => hellos.length ? Promise.resolve(hellos.shift()) : new Promise(resolve => waiting.push(resolve)),
            dispose: () => fixtureWindow._phoenixBuilder.disconnect()
        };
    }

    /**
     * Build the existing remote-control metadata shape for a simulated machine.
     * @param {string} machineId Remote host ID or the local-machine alias.
     * @param {string} [machineName] Display name used to prefix the instance name.
     * @return {Object} Metadata response body.
     */
    function metadata(machineId, machineName = "test-machine") {
        return { version: 1, orchestratorConnected: true, machineId, machineName };
    }

    describe("unit:Phoenix Builder Identity", function () {
        let harness;

        afterEach(function () {
            if (harness) {
                harness.dispose();
                harness = null;
            }
        });

        ["host-test-machine", "local"].forEach(machineId => {
            it("includes " + machineId + " in hello using the single existing metadata request", async function () {
                harness = createHarness(async () => new Response(JSON.stringify(metadata(machineId))));
                const hello = await harness.nextHello();
                expect(hello).toEqual({ type: "hello", version: "1.0.0", name: "test-machine-" + BASE_NAME, machineId });
                expect(harness.window._phoenixBuilder.getInstanceName()).toBe(hello.name);
                expect(harness.lookups.length).toBe(1);
                expect(harness.lookups[0].url).toBe("http://localhost:38572/v1/metadata");
            });
        });

        it("preserves the legacy hello when metadata is unavailable", async function () {
            harness = createHarness(async () => { throw new Error("Metadata unavailable"); });
            expect(await harness.nextHello()).toEqual({ type: "hello", version: "1.0.0", name: BASE_NAME });
        });

        it("omits identity from metadata that fails the existing validation", async function () {
            harness = createHarness(async () => new Response(JSON.stringify(metadata(""))));
            expect(await harness.nextHello()).toEqual({ type: "hello", version: "1.0.0", name: BASE_NAME });
        });

        it("does not retain a previous machine ID when the next connection has no metadata", async function () {
            let available = true;
            harness = createHarness(async () => {
                if (!available) { throw new Error("Metadata unavailable"); }
                return new Response(JSON.stringify(metadata("host-first-machine")));
            });
            expect((await harness.nextHello()).machineId).toBe("host-first-machine");
            available = false;
            await harness.window._phoenixBuilder.connect("ws://localhost:38571");
            expect(await harness.nextHello()).toEqual({ type: "hello", version: "1.0.0", name: BASE_NAME });
        });

        it("refreshes the machine ID and display name together on reconnect", async function () {
            let identity = metadata("host-first-machine", "first-machine");
            harness = createHarness(async () => new Response(JSON.stringify(identity)));
            await harness.nextHello();
            identity = metadata("host-second-machine", "second-machine");
            await harness.window._phoenixBuilder.connect("ws://localhost:38571");
            expect(await harness.nextHello()).toEqual({ type: "hello", version: "1.0.0",
                name: "second-machine-" + BASE_NAME, machineId: "host-second-machine" });
        });
    });
});
