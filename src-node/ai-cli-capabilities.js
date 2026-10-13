/*
 * Copyright (c) 2021 - present core.ai
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/** Read-only compatibility checks before adding per-launch CLI configuration. */
const path = require("path");
const fs = require("fs");
const CliLocator = require("./cli-locator");

/**
 * Resolve an npm Windows shim to the native binary shipped by that same installation.
 * Never silently switches a user-selected CLI to a different installed version.
 * @param {string} cli Provider id.
 * @param {string} executable Located CLI path.
 * @return {string} Executable suitable for argument-array spawning.
 */
function nativeExecutable(cli, executable) {
    if (process.platform !== "win32" || !/\.(cmd|bat)$/i.test(executable)) { return executable; }
    const base = path.dirname(executable);
    const candidates = cli === "claude" ? [
        path.join(base, "node_modules", "@anthropic-ai", "claude-code", "bin", "claude.exe"),
        path.join(base, "node_modules", "@anthropic-ai", "claude-code-win32-x64", "claude.exe")
    ] : [
        path.join(base, "node_modules", "@openai", "codex", "vendor", "x86_64-pc-windows-msvc", "codex", "codex.exe"),
        path.join(base, "node_modules", "@openai", "codex-win32-x64", "vendor",
            "x86_64-pc-windows-msvc", "codex", "codex.exe")
    ];
    for (const candidate of candidates) { if (fs.existsSync(candidate)) { return candidate; } }
    throw new Error("Phoenix connection requires a native " + cli + " executable for this Windows installation.");
}

/**
 * Avoid overriding an existing server with the reserved name; do not edit CLI settings.
 * @param {string} cli CLI id.
 * @param {string} projectRoot Native working directory.
 * @return {Promise<string>} Resolved executable.
 */
async function checkLaunch(cli, projectRoot) {
    const located = await CliLocator.locateCli(cli);
    if (!located.path) { throw new Error("CLI is no longer available."); }
    const executable = nativeExecutable(cli, located.path);
    const help = await CliLocator.spawnCli(executable, ["--help"],
        {cwd: projectRoot, timeout: 5000, windowsHide: true});
    const required = cli === "codex" ? ["--no-daemon"] :
        ["--mcp-config", "--settings", "--session-id"];
    if (help.status !== 0 || required.some(flag => !help.stdout.includes(flag))) {
        throw new Error("Update " + cli + " to use the Phoenix connection.");
    }
    if (cli === "codex") {
        const listed = await CliLocator.spawnCli(executable, ["mcp", "list", "--json"],
            {cwd: projectRoot, timeout: 5000, windowsHide: true});
        if (listed.status !== 0) { throw new Error("Could not read Codex MCP configuration."); }
        checkCodexServers(listed.stdout);
    }
    return executable;
}

/** Validate Codex's server list without exposing its configuration in diagnostics. */
function checkCodexServers(stdout) {
    let entries;
    try { entries = JSON.parse(stdout); }
    catch (error) { throw new Error("Codex MCP configuration could not be read."); }
    if (!Array.isArray(entries)) { throw new Error("Unsupported Codex MCP configuration format."); }
    if (entries.some(entry => entry.name === "phoenix-editor")) {
        throw new Error("An MCP server named phoenix-editor is already configured in Codex. Rename it to connect.");
    }
}

exports.checkLaunch = checkLaunch;
exports.nativeExecutable = nativeExecutable;
exports.checkCodexServers = checkCodexServers;
