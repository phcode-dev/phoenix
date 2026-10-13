import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHub } from "./hub.js";

const directory = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PHOENIX_MCP_WS_PORT || 38571);
if (!Number.isInteger(port) || port < 0 || port > 65535) { throw new Error("Invalid PHOENIX_MCP_WS_PORT"); }
let hub;
let stopping = false;

/** Stop the supervised hub when serve ends, including an unexpected parent disconnect. */
async function shutdown() {
    if (stopping) { return; }
    stopping = true;
    if (hub) { await hub.close(); }
    if (hub && process.connected) { process.disconnect(); }
}
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
process.once("disconnect", shutdown);
process.on("message", message => { if (message && message.type === "shutdown") { shutdown(); } });

try {
    hub = await createHub({ port,
        notesPath: path.join(process.env.PHOENIX_BUILDER_STATE_DIR || path.join(directory, ".state"), "source-notes.json"),
        phoenixDesktopPath: process.env.PHOENIX_DESKTOP_PATH || path.resolve(directory, "../../phoenix-desktop") });
    if (stopping) {
        await hub.close();
        if (process.connected) { process.disconnect(); }
    }
    else {
        console.error(`Phoenix Builder hub ready on localhost:${hub.getPort()}`);
        if (process.send) { process.send({ type: "ready", port: hub.getPort() }); }
    }
} catch (error) {
    console.error(`Phoenix Builder hub could not start: ${error.message}. The existing port owner was left running.`);
    if (process.send) { process.send({ type: "error", message: error.message }); }
    process.exitCode = 1;
    if (process.connected) { process.disconnect(); }
}
