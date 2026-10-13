/*
 * Copyright (c) 2021 - present core.ai
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/** Stdio entry point. Stdout belongs exclusively to the MCP protocol. */
const {McpServer} = require("@modelcontextprotocol/sdk/server/mcp.js");
const {StdioServerTransport} = require("@modelcontextprotocol/sdk/server/stdio.js");
const {getEditorToolSpecs} = require("../ai-editor-tool-specs");
const {SERVER_INSTRUCTIONS} = require("../ai-system-prompt");
const {CliConnection, readSession} = require("../ai-cli-connection");

/** Initialize immediately; editor availability must not block MCP discovery. */
async function main() {
    const index = process.argv.indexOf("--session-file");
    if (index < 0 || !process.argv[index + 1]) { throw new Error("Missing --session-file."); }
    const connection = new CliConnection(readSession(process.argv[index + 1]));
    const server = new McpServer({name: "phoenix-editor", version: "1.0.0"}, {instructions: SERVER_INSTRUCTIONS});
    for (const spec of getEditorToolSpecs(null, {cli: true})) {
        server.registerTool(spec.name, {
            description: spec.description, inputSchema: spec.inputSchema, annotations: spec.annotations,
            _meta: {"anthropic/alwaysLoad": !!spec.alwaysLoad, "anthropic/searchHint": spec.searchHint || ""}
        }, async (args, extra) => {
            try {
                return await connection.call("call", spec.name, args, spec.timeoutMs(args) + 1000, extra.signal);
            } catch (error) {
                return {content: [{type: "text", text: error.message}], isError: true};
            }
        });
    }
    const retry = setInterval(() => {
        if (!connection.ended) { connection.connect().catch(() => {}); }
    }, 3000);
    retry.unref();
    connection.connect().catch(() => {});
    process.stdin.on("end", () => { clearInterval(retry); connection.close(); server.close(); });
    await server.connect(new StdioServerTransport());
}

main().catch(() => {
    console.error("Phoenix MCP could not read its session. Restart the CLI from the AI panel.");
    process.exitCode = 1;
});
