import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createWSControlServer } from "./ws-control-server.js";
import { createProcessManager } from "./process-manager.js";
import { createBuildManager } from "./build-manager.js";
import { registerTools } from "./mcp-tools.js";
import { parseWebSocketPort } from "./config.js";
import { fileURLToPath } from "url";
import path from "path";
import process from "node:process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
    const wsPort = parseWebSocketPort(process.env.PHOENIX_MCP_WS_PORT);
    const phoenixDesktopPath = process.env.PHOENIX_DESKTOP_PATH
        || path.resolve(__dirname, "../../phoenix-desktop");
    const phoenixProjectPath = process.env.PHOENIX_PROJECT_PATH
        || path.resolve(__dirname, "..");

    // Bind the control socket before advertising MCP readiness over stdio.
    // A second server on the same port must fail without terminating the owner.
    const wsControlServer = await createWSControlServer(wsPort);
    const processManager = createProcessManager();
    const buildManager = createBuildManager();

    const server = new McpServer({
        name: "phoenix-builder",
        version: "1.0.0"
    });

    registerTools(
        server,
        processManager,
        wsControlServer,
        phoenixDesktopPath,
        buildManager,
        phoenixProjectPath
    );

    const transport = new StdioServerTransport();
    await server.connect(transport);

    let shutdownPromise = null;

    async function shutdown(exitCode) {
        if (shutdownPromise) {
            return shutdownPromise;
        }

        shutdownPromise = (async () => {
            try {
                await Promise.allSettled([
                    processManager.stop(),
                    buildManager.stop()
                ]);
            } finally {
                try {
                    await wsControlServer.close();
                } finally {
                    process.exit(exitCode);
                }
            }
        })();
        return shutdownPromise;
    }

    process.stdin.once("end", () => shutdown(0));
    process.stdin.once("close", () => shutdown(0));
    process.once("SIGINT", () => shutdown(0));
    process.once("SIGTERM", () => shutdown(0));
}

main().catch((error) => {
    console.error(`[phoenix-builder] ${error.message}`);
    process.exit(1);
});
