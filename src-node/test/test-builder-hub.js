/*
 * Copyright (c) 2026 core.ai
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

const path = require("path");
const {execFile} = require("child_process");
const NodeConnector = require("../node-connector");

NodeConnector.createNodeConnector("ph_test_builder_hub", exports);
const SCENARIOS = new Set(["pool-race", "pool-repeat", "pool-independent", "pool-busy", "pool-authority",
    "pool-note-write-failure", "pool-restart", "pool-dequeue", "pool-dequeue-other", "pool-dequeue-after-grant",
    "pool-disconnect", "pool-drop-waiter", "pool-stale-owner", "pool-release-note", "pool-fifo", "hub-supervisor",
    "hub-offline-discovery", "hub-port-conflict", "hub-disconnect", "hub-polling", "hub-monitor", "hub-monitor-cancel",
    "hub-monitor-lost", "hub-reconnect", "hub-routing", "hub-app-reload", "hub-monitor-command",
    "logs-readers", "logs-overflow"]);

/**
 * Execute one bounded, isolated Builder fixture using the bundled Node runtime.
 * @param {Object} params A fixed scenario name, never arbitrary code or shell arguments.
 * @return {Promise<Object>} Fixture observations asserted by the registered Jasmine suite.
 */
exports.exercise = function ({scenario}) {
    if (!SCENARIOS.has(scenario)) { return Promise.reject(new Error("Unknown Builder fixture")); }
    return new Promise((resolve, reject) => {
        execFile(process.execPath, [path.join(__dirname, "builder-hub-scenarios.mjs"), scenario], {
            timeout: 20000, maxBuffer: 1024 * 1024, windowsHide: true, encoding: "utf8"
        }, (error, stdout, stderr) => {
            if (error) { reject(new Error(stderr || error.message)); return; }
            try { resolve(JSON.parse(stdout.trim())); } catch (parseError) { reject(parseError); }
        });
    });
};
