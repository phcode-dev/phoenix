import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createHubClient } from "./hub-client.js";
import { BUILDER_INSTRUCTIONS, createToolCatalog } from "./tool-catalog.js";

const port = Number(process.env.PHOENIX_MCP_WS_PORT || 38571);
if (!Number.isInteger(port) || port < 1 || port > 65535) { throw new Error("Invalid PHOENIX_MCP_WS_PORT"); }
const server = new McpServer({ name: "phoenix-builder", version: "2.0.0" }, { instructions: BUILDER_INSTRUCTIONS });
const hub = createHubClient({ url: `ws://localhost:${port}/agents`,
    name: () => process.env.PHOENIX_BUILDER_AGENT_NAME || server.server.getClientVersion()?.name || "agent" });
let closing = false;

// Tool discovery works even before serve starts. Definitions and schemas are shared with the hub.
for (const tool of createToolCatalog().values()) {
    server.tool(tool.name, tool.description, tool.schema, async args => {
        try { return await hub.call(tool.name, args); }
        catch (error) { return { isError: true, content: [{ type: "text", text: error.message }] }; }
    });
}
server.server.oninitialized = () => hub.connect().catch(() => {});

/** End only the calling adapter; shared services belong to npm run serve. */
async function shutdown() {
    if (closing) { return; }
    closing = true;
    hub.close();
    await server.close();
}
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
process.stdin.once("end", shutdown);
process.stdin.once("close", shutdown);
server.server.onclose = shutdown;
await server.connect(new StdioServerTransport());
