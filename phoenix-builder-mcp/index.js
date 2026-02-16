import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createWSControlServer } from "./ws-control-server.js";
import { createProcessManager } from "./process-manager.js";
import { registerTools } from "./mcp-tools.js";
import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const wsPort = parseInt(process.env.PHOENIX_MCP_WS_PORT || "38571", 10);
const phoenixDesktopPath = process.env.PHOENIX_DESKTOP_PATH
    || path.resolve(__dirname, "../../phoenix-desktop");

const wsControlServer = createWSControlServer(wsPort);
const processManager = createProcessManager();

const server = new McpServer({
    name: "phoenix-builder",
    version: "1.0.0"
});

registerTools(server, processManager, wsControlServer, phoenixDesktopPath);

const transport = new StdioServerTransport();
await server.connect(transport);

process.on("SIGINT", async () => {
    await processManager.stop();
    wsControlServer.close();
    process.exit(0);
});

process.on("SIGTERM", async () => {
    await processManager.stop();
    wsControlServer.close();
    process.exit(0);
});
