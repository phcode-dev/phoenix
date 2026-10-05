/*
 * Copyright (c) 2021 - present core.ai
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/** Per-launch CLI configuration; never installs global MCP servers or replaces user guidance. */
const fs = require("fs");
const path = require("path");
const {createHash} = require("crypto");
const {buildSystemPrompt} = require("./ai-system-prompt");
const {launchSettings} = require("./ai-cli-usage");

const TOOL_TIMEOUT_MS = 1830000;
const ADAPTER = path.join(__dirname, "ai-cli-mcp", "index.js");
const HOOK = path.join(__dirname, "ai-cli-hook", "index.js");

/** Remember only the hook definitions Phoenix explained, never the CLI's trust decision. */
async function needsHookReview(session, args) {
    if (session.cli !== "codex") { return false; }
    const file = path.join(session.appSupportDir, "ai-cli", "codex-hook-review.json");
    const fingerprint = createHash("sha256").update(JSON.stringify(args.filter(arg =>
        arg.startsWith("hooks.")))).digest("hex");
    try {
        const previous = JSON.parse(await fs.promises.readFile(file, "utf8"));
        if (previous.fingerprint === fingerprint) { return false; }
    } catch (error) { /* First launch or unreadable explanatory state: show the explanation. */ }
    try {
        await fs.promises.writeFile(file, JSON.stringify({fingerprint}), {mode: 0o600});
    } catch (error) { /* An optional explanation must not prevent launching the CLI. */ }
    return true;
}

/** Quote a constant hook command for the CLI's shell, without including any session secret. */
function hookCommand(nodePath, hookPath, platform = process.platform) {
    if (platform === "win32") {
        // Codex runs Windows hooks in PowerShell. A quoted executable is a string
        // expression there; the call operator is required to actually execute it.
        const quote = value => "'" + value.replace(/'/g, "''") + "'";
        return "& " + quote(nodePath) + " " + quote(hookPath);
    }
    const quote = value => "'" + value.replace(/'/g, "'\\''") + "'";
    return quote(nodePath) + " " + quote(hookPath);
}

/**
 * Write private per-session configuration and return non-secret launch arguments.
 * @param {Object} session Session record including directory, URL and CLI id.
 * @param {string} [nodePath] Bundled Node executable.
 * @return {Promise<Object>} Paths, args and environment additions.
 */
async function writeLaunchFiles(session, nodePath = process.execPath) {
    const files = {};
    for (const [key, name] of Object.entries({sessionFile: "session.json", mcpConfigFile: "mcp.json",
        settingsFile: "settings.json", systemPromptFile: "system-prompt.md"})) {
        files[key] = path.join(session.directory, name);
    }
    const serverConfig = {type: "stdio", command: nodePath,
        args: [ADAPTER, "--session-file", files.sessionFile], timeout: TOOL_TIMEOUT_MS};
    const settings = {hooks: {}};
    const events = session.cli === "claude"
        ? ["SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse", "PostToolUseFailure", "Stop", "PostCompact"]
        : ["SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse", "PostToolUseFailure", "Stop", "PostCompact"];
    const args = [];
    const env = {};
    if (session.cli === "claude") {
        for (const event of events) {
            // SessionStart does not support HTTP. PreToolUse needs a helper that can
            // return deny on connection failure; the CLI's HTTP transport fails open.
            const commandHook = event === "SessionStart" || event === "PreToolUse";
            const item = {hooks: [commandHook
                ? {type: "command", command: nodePath, args: [HOOK, event, "--session-file", files.sessionFile],
                    timeout: event === "PreToolUse" ? 30 : 10}
                : {type: "http", url: session.url.replace(/^ws:/, "http:") + "/hook",
                    headers: {"X-Phoenix-Session": session.sessionId}, timeout: 10}]};
            if (event.includes("ToolUse")) {
                item.matcher = event === "PreToolUse" ? "Read|Edit|MultiEdit|Write" : "Edit|MultiEdit|Write";
            }
            settings.hooks[event] = [item];
        }
        args.push("--mcp-config", files.mcpConfigFile, "--settings", files.settingsFile,
            "--append-system-prompt-file", files.systemPromptFile, "--session-id", session.sessionId);
        if (session.scratchDir) { args.push("--add-dir", session.scratchDir); }
        if (session.draftsDir) { args.push("--add-dir", session.draftsDir); }
    } else {
        // JSON string quoting is also valid TOML basic-string quoting for these paths. In
        // particular it escapes Windows backslashes instead of accidentally introducing \U.
        const config = (key, value) => args.push("-c", key + "=" + JSON.stringify(value));
        args.push("--no-daemon");
        config("mcp_servers.phoenix-editor.command", nodePath);
        config("mcp_servers.phoenix-editor.args", serverConfig.args);
        config("mcp_servers.phoenix-editor.startup_timeout_sec", 10);
        config("mcp_servers.phoenix-editor.tool_timeout_sec", TOOL_TIMEOUT_MS / 1000);
        config("mcp_servers.phoenix-editor.default_tools_approval_mode", "writes");
        const command = hookCommand(nodePath, HOOK);
        for (const event of events) {
            // Constant command, session-specific pointer only in env, so Codex can remember trust.
            const matcher = event.includes("ToolUse") ? 'matcher="apply_patch",' : "";
            args.push("-c", "hooks." + event + "=[{" + matcher + "hooks=[{type=\"command\",command=" +
                JSON.stringify(command) + ",timeout=" + (event === "PreToolUse" ? 30 : 10) + "}]}]");
        }
        env.PHOENIX_AI_SESSION_FILE = files.sessionFile;
    }
    // Usage export, only when the user does not already configure this CLI's telemetry.
    const usage = launchSettings(session.cli, session.usageEndpoint);
    Object.assign(env, usage.env);
    args.push(...usage.args);
    const record = {version: 1, sessionId: session.sessionId, url: session.url, cli: session.cli,
        projectRoot: session.projectRoot, phoenixVersion: session.phoenixVersion, editHooks: true};
    await Promise.all([
        fs.promises.writeFile(files.sessionFile, JSON.stringify(record), {flag: "wx", mode: 0o600}),
        fs.promises.writeFile(files.mcpConfigFile, JSON.stringify({mcpServers: {"phoenix-editor": serverConfig}}),
            {flag: "wx", mode: 0o600}),
        fs.promises.writeFile(files.settingsFile, JSON.stringify(settings), {flag: "wx", mode: 0o600}),
        fs.promises.writeFile(files.systemPromptFile, buildSystemPrompt({cli: true, projectPath: session.projectRoot,
            scratchDir: session.scratchDir, locale: session.locale}), {flag: "wx", mode: 0o600})
    ]);
    return {sessionId: session.sessionId, args, env, files, editHooks: record.editHooks,
        hookReview: await needsHookReview(session, args)};
}

exports.writeLaunchFiles = writeLaunchFiles;
exports.hookCommand = hookCommand;
exports.TOOL_TIMEOUT_MS = TOOL_TIMEOUT_MS;
