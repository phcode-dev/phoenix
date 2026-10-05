/*
 * Copyright (c) 2021 - present core.ai
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/** Command hook fallback; stdin and stdout are the CLI's hook protocol. */
const {CliConnection, readSession} = require("../ai-cli-connection");

/** Read bounded hook input and return context or a pre-edit decision. */
async function main() {
    const index = process.argv.indexOf("--session-file");
    const sessionFile = index >= 0 ? process.argv[index + 1] : process.env.PHOENIX_AI_SESSION_FILE;
    let input = "";
    for await (const chunk of process.stdin) {
        input += chunk;
        if (Buffer.byteLength(input) > 2 * 1024 * 1024) { throw new Error("Hook input too large."); }
    }
    const hook = JSON.parse(input || "{}");
    let connection;
    try {
        connection = new CliConnection(readSession(sessionFile), "hook");
        const output = await connection.call("hook", hook.hook_event_name || process.argv[2], hook,
            hook.hook_event_name === "PreToolUse" ? 22000 : 8000);
        process.stdout.write(JSON.stringify(output));
    } catch (error) {
        if (hook.hook_event_name === "PreToolUse") {
            process.stdout.write(JSON.stringify({hookSpecificOutput: {hookEventName: "PreToolUse",
                permissionDecision: "deny", permissionDecisionReason:
                    "Phoenix could not synchronize the editor. Save your changes and reconnect before editing."}}));
        } else { process.stdout.write("{}"); }
    } finally { if (connection) { connection.close(); } }
}

main().catch(() => { process.stdout.write("{}"); });
