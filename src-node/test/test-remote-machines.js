/*
 * Copyright (c) 2021 - present core.ai
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const crypto = require("crypto");
const childProcess = require("child_process");
const NodeConnector = require("../node-connector");

const BOOT_SOURCE = path.resolve(__dirname, "../../src/phoenix-builder/phoenix-builder-boot.js");
const FIXTURE = path.join(__dirname, "fixtures/remote-machines.mjs");

/**
 * Execute the real boot script in an isolated browser-shaped context; no application globals are changed.
 * @param {Object} params - Named, fixed behavior scenario.
 * @return {Promise<Object>} Observed URLs, hello names, stored base and gate/cancellation facts.
 */
async function bootFixture({ scenario }) {
    const allowed = ["valid", "offline", "disconnected", "unsupported", "invalid-name", "oversized", "timeout",
        "rename", "custom-url", "disabled", "production", "cancel", "new-window"];
    if (!allowed.includes(scenario)) { throw new Error("Unknown boot fixture"); }
    const saved = new Map(scenario === "new-window" ? [] : [["phoenixBuilderInstanceName", "phoenix-electron-window"]]);
    const local = new Map([["phoenixBuilderEnabled", scenario === "disabled" ? "false" : "true"]]);
    if (scenario === "custom-url") { local.set("phoenixBuilderWsUrl", "ws://localhost:49001/custom"); }
    const sockets = [];
    const messages = [];
    let probes = 0;
    let machineName = "remote-box";
    let nextTimer = 0;
    const timers = new Map();
    let aborted = false;
    let notifyHello;
    let hello = new Promise(resolve => { notifyHello = resolve; });
    const originalLog = function () {};
    const sandbox = {
        AppConfig: { config: { environment: scenario === "production" ? "production" : "dev" } },
        Phoenix: {},
        localStorage: { getItem: key => local.get(key), setItem: (key, value) => local.set(key, value) },
        sessionStorage: { getItem: key => saved.get(key), setItem: (key, value) => saved.set(key, value) },
        console: { log: originalLog, info() {}, warn() {}, error() {} },
        setTimeout(callback, ms) {
            const id = ++nextTimer; timers.set(id, callback);
            if (scenario === "timeout" && ms === 500) { queueMicrotask(callback); }
            return id;
        },
        clearTimeout(id) { timers.delete(id); },
        setInterval() { return ++nextTimer; },
        clearInterval() {},
        TextDecoder,
        AbortController,
        async fetch(_url, { signal }) {
            probes++;
            if (scenario === "offline") { throw new Error("Worker absent"); }
            if (scenario === "timeout" || scenario === "cancel") {
                return new Promise((_resolve, reject) => {
                    const abort = () => { aborted = true; reject(new Error("aborted")); };
                    if (signal.aborted) { abort(); } else { signal.addEventListener("abort", abort, { once: true }); }
                });
            }
            let body = JSON.stringify({ version: scenario === "unsupported" ? 99 : 1,
                machineId: "host-fixture", machineName: scenario === "invalid-name" ? "../bad name" : machineName,
                orchestratorConnected: scenario !== "disconnected" });
            if (scenario === "oversized") { body += " ".repeat(20000); }
            let read = false;
            return { ok: true, body: { getReader() { return {
                async read() {
                    if (read) { return { done: true }; }
                    read = true; return { value: Buffer.from(body), done: false };
                },
                async cancel() {},
                releaseLock() {}
            }; } } };
        }
    };
    sandbox.window = { AppConfig: sandbox.AppConfig, Phoenix: sandbox.Phoenix, __ELECTRON__: {},
        crypto: crypto.webcrypto, addEventListener() {} };
    class Socket {
        constructor(url) { this.url = url; this.readyState = 0; sockets.push(this); }
        set onopen(callback) {
            queueMicrotask(() => { if (this.readyState !== 3) { this.readyState = 1; callback(); } });
        }
        send(value) {
            const message = JSON.parse(value); messages.push(message);
            if (message.type === "hello") { notifyHello(); }
        }
        close() { this.readyState = 3; queueMicrotask(() => this.onclose && this.onclose()); }
    }
    Socket.OPEN = 1;
    sandbox.WebSocket = Socket;
    vm.runInNewContext(fs.readFileSync(BOOT_SOURCE, "utf8"), sandbox, { filename: "phoenix-builder-boot.js" });
    const capturedImmediately = sandbox.console.log !== originalLog;
    if (scenario === "disabled" || scenario === "production") {
        return { enabled: Boolean(sandbox.window._phoenixBuilder), probes, sockets: sockets.length, capturedImmediately };
    }
    const api = sandbox.window._phoenixBuilder;
    if (scenario === "cancel") {
        api.disconnect();
        await new Promise(resolve => setImmediate(resolve));
        return { aborted, sockets: sockets.length, capturedImmediately };
    }
    await hello;
    if (scenario === "rename") {
        machineName = "renamed-box";
        hello = new Promise(resolve => { notifyHello = resolve; });
        await api.connect("ws://localhost:38571"); await hello;
    }
    const result = { probes, names: messages.filter(item => item.type === "hello").map(item => item.name),
        urls: sockets.map(socket => socket.url), base: saved.get("phoenixBuilderInstanceName"),
        display: api.getInstanceName(), capturedImmediately, aborted };
    api.disconnect();
    return result;
}

/**
 * Run one fixed transport/lifecycle fixture in bundled Node, isolated from the shared application process.
 * @param {Object} params - Named fixture scenario; arbitrary scripts are not accepted.
 * @return {Promise<Object>} Serializable observations for separate Jasmine assertions.
 */
async function transportFixture({ scenario }) {
    const allowed = ["stdio", "conflict", "disconnect", "reply-owner", "all-origins"];
    if (!allowed.includes(scenario)) { throw new Error("Unknown transport fixture"); }
    return new Promise((resolve, reject) => {
        childProcess.execFile(process.execPath, [FIXTURE, scenario], {
            timeout: 15000, maxBuffer: 1024 * 1024, encoding: "utf8"
        }, (error, stdout, stderr) => {
            if (error) { reject(new Error(stderr || error.message)); return; }
            try { resolve(JSON.parse(stdout)); } catch (parseError) { reject(parseError); }
        });
    });
}

exports.bootFixture = bootFixture;
exports.transportFixture = transportFixture;
NodeConnector.createNodeConnector("ph_test_remote_machines", exports);
