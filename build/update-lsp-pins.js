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

/*
 * Updates every built-in language server to its latest STABLE release:
 *  - runtime-installed pins in src/config.json (config.lsp_server_pins): intelephense (npm),
 *    pyrefly and ruff (PyPI), and
 *  - bundled servers in src-node/package.json: @vtsls/language-server (TS/JS) and
 *    vscode-langservers-extracted (JSON) - written as EXACT versions, with the src-node
 *    lockfile regenerated so `npm ci` stays green.
 *
 * Prereleases are never picked up: npm's `latest` dist-tag is stable by convention and any
 * version carrying a prerelease suffix is skipped with a warning.
 *
 * Run by the scheduled update-lsp-pins GitHub workflow (npm run updateBuiltInLSPS), which opens
 * a PR with the diff - the TS/JSON/PHP/Python LSP integration suites exercise these exact
 * versions for real, so CI green on that PR means the new versions actually work before they
 * ship. Never run as part of normal builds: pins must not drift under a developer mid-work.
 *
 * Usage: node build/update-lsp-pins.js [--dry-run]
 */

/* eslint-env node */

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const CONFIG_PATH = path.join(__dirname, "..", "src", "config.json");
const SRC_NODE_DIR = path.join(__dirname, "..", "src-node");
const SRC_NODE_PKG_PATH = path.join(SRC_NODE_DIR, "package.json");
const DRY_RUN = process.argv.includes("--dry-run");

// bundled servers shipped inside src-node - bumped in src-node/package.json as exact versions
const BUNDLED_LSP_PACKAGES = ["@vtsls/language-server", "vscode-langservers-extracted"];

async function _fetchJson(url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error("HTTP " + response.status + " for " + url);
    }
    return response.json();
}

// npm's `latest` dist-tag - the stable channel by convention (prereleases live on other tags)
async function latestNpmVersion(pkg) {
    const meta = await _fetchJson("https://registry.npmjs.org/" + encodeURIComponent(pkg) + "/latest");
    return meta.version;
}

async function latestPyPIVersion(pkg) {
    const meta = await _fetchJson("https://pypi.org/pypi/" + pkg + "/json");
    return meta.info.version;
}

function _isPrerelease(version) {
    return version.indexOf("-") !== -1;
}

async function updateRuntimePins() {
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
    const pins = config.config.lsp_server_pins;
    if (!pins) {
        throw new Error("config.lsp_server_pins missing in " + CONFIG_PATH);
    }
    const latest = {
        intelephense: await latestNpmVersion("intelephense"),
        pyrefly: await latestPyPIVersion("pyrefly"),
        ruff: await latestPyPIVersion("ruff")
    };
    let changed = false;
    for (const key of Object.keys(latest)) {
        if (_isPrerelease(latest[key])) {
            console.warn(key + ": skipping prerelease " + latest[key] + ", keeping " + pins[key]);
        } else if (pins[key] !== latest[key]) {
            console.log(key + ": " + pins[key] + " -> " + latest[key]);
            pins[key] = latest[key];
            changed = true;
        } else {
            console.log(key + ": " + pins[key] + " (up to date)");
        }
    }
    if (!changed || DRY_RUN) {
        if (changed) {
            console.log("--dry-run: not writing " + CONFIG_PATH);
        }
        return;
    }
    // no trailing newline - matches the existing file and the gulp config writer exactly
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 4), "utf8");
    console.log("Updated " + CONFIG_PATH);
}

async function updateBundledServers() {
    const pkgJson = JSON.parse(fs.readFileSync(SRC_NODE_PKG_PATH, "utf8"));
    let changed = false;
    for (const pkg of BUNDLED_LSP_PACKAGES) {
        const current = pkgJson.dependencies[pkg];
        if (!current) {
            throw new Error(pkg + " missing from src-node/package.json dependencies");
        }
        const latest = await latestNpmVersion(pkg);
        if (_isPrerelease(latest)) {
            console.warn(pkg + ": skipping prerelease " + latest + ", keeping " + current);
        } else if (current !== latest) {
            console.log(pkg + ": " + current + " -> " + latest);
            pkgJson.dependencies[pkg] = latest;
            changed = true;
        } else {
            console.log(pkg + ": " + current + " (up to date)");
        }
    }
    if (!changed || DRY_RUN) {
        if (changed) {
            console.log("--dry-run: not writing " + SRC_NODE_PKG_PATH);
        }
        return;
    }
    fs.writeFileSync(SRC_NODE_PKG_PATH, JSON.stringify(pkgJson, null, 4) + "\n", "utf8");
    console.log("Updated " + SRC_NODE_PKG_PATH);
    // keep the committed lockfile in sync or `npm ci` fails on manifest mismatch;
    // --package-lock-only avoids touching node_modules
    console.log("Regenerating src-node/package-lock.json ...");
    execFileSync("npm", ["install", "--package-lock-only"], { cwd: SRC_NODE_DIR, stdio: "inherit" });
}

(async function main() {
    await updateRuntimePins();
    await updateBundledServers();
}()).catch(function (err) {
    console.error(err);
    process.exit(1);
});
