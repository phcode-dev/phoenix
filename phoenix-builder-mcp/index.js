import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createWSControlServer } from "./ws-control-server.js";
import { createProcessManager } from "./process-manager.js";
import { registerTools } from "./mcp-tools.js";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const wsPort = Number(process.env.PHOENIX_MCP_WS_PORT || "38571");
if (!Number.isInteger(wsPort) || wsPort < 0 || wsPort > 65535) {
    throw new Error("PHOENIX_MCP_WS_PORT must be a valid local port");
}
const phoenixDesktopPath = process.env.PHOENIX_DESKTOP_PATH
    || path.resolve(__dirname, "../../phoenix-desktop");
const wsControlServer = createWSControlServer(wsPort);
const processManager = createProcessManager();
const server = new McpServer({ name: "phoenix-builder", version: "1.0.0" }, {
    instructions: "Use this server for Phoenix app interaction, screenshots and tests; select the exact machine-prefixed instance name when targeting a remote app. Use the separate remote-control MCP for machine discovery, remote commands, file transfer, Git sync and agent coordination. start_phoenix, stop_phoenix and terminal logs manage only the local desktop app."
});
let shuttingDown = false;

/**
 * End exactly this stdio owner's connections/processes; a tool response does not end ownership.
 * @return {Promise<void>}
 */
async function shutdown() {
    if (shuttingDown) { return; }
    shuttingDown = true;
    wsControlServer.cancelPending("Upstream MCP session ended");
    await Promise.allSettled([processManager.stop(), wsControlServer.close(), server.close()]);
    process.exit(0);
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
process.stdin.once("end", shutdown);
process.stdin.once("close", shutdown);
server.server.onclose = shutdown;

try {
    // Port ownership is authoritative. Never terminate a process identified by a stale PID file.
    await wsControlServer.ready;
    if (!shuttingDown) {
        registerTools(server, processManager, wsControlServer, phoenixDesktopPath);
        await server.connect(new StdioServerTransport());
    }
} catch (error) {
    console.error(`Phoenix Builder could not start: ${error.message}. Choose an unused PHOENIX_MCP_WS_PORT if another Builder owns this port.`);
    await Promise.allSettled([wsControlServer.close()]);
    process.exitCode = 1;
}
