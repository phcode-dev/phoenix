import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createWSControlServer } from "./ws-control-server.js";
import { createProcessManager } from "./process-manager.js";
import { registerTools } from "./mcp-tools.js";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PID_FILE = path.join(__dirname, ".mcp-server.pid");

// Kill any previous MCP server instance that wasn't cleaned up (e.g. parent crashed).
try {
    const oldPid = parseInt(fs.readFileSync(PID_FILE, "utf8").trim(), 10);
    if (oldPid && oldPid !== process.pid) {
        try {
            process.kill(oldPid, "SIGTERM");
            // Wait up to 3 seconds for it to exit
            const deadline = Date.now() + 3000;
            while (Date.now() < deadline) {
                try {
                    process.kill(oldPid, 0); // throws if process is gone
                    await new Promise(r => setTimeout(r, 100));
                } catch {
                    break;
                }
            }
        } catch {
            // Process already dead — nothing to do
        }
    }
} catch {
    // No PID file or unreadable — first run
}
fs.writeFileSync(PID_FILE, String(process.pid));

function removePidFile() {
    try { fs.unlinkSync(PID_FILE); } catch { /* ignore */ }
}

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
    removePidFile();
    process.exit(0);
});

process.on("SIGTERM", async () => {
    await processManager.stop();
    wsControlServer.close();
    removePidFile();
    process.exit(0);
});
