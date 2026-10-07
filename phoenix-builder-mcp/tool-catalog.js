import { z } from "zod";
import { registerTools } from "./mcp-tools.js";
import { registerReservationTools } from "./reservation-tools.js";

export const BUILDER_INSTRUCTIONS = "Use Phoenix Builder for app interaction, screenshots and tests. " +
    "Reserve the whole machine with reserve_machine before using Builder or remote-control there; use its canonical " +
    "machineId, not the display name. Read sourceCodeChangedNote on each grant. Inspect uncertain source/ongoing jobs " +
    "and ask before discarding other work without user permission. Update notes before source edits/sync and after " +
    "completion/failure; release_machine when finished, or dequeue_machine if you no longer need a queued request. " +
    "Reservation is explicit and independent of Phoenix messages. Use exact instance names for app tools. " +
    "The separate remote-control MCP handles machine discovery, commands and source sync. " +
    "start_phoenix/stop_phoenix/terminal logs manage only the hub machine's app. Run npm run serve to start the shared hub.";

/**
 * Collect the existing tool definitions once, for offline adapter discovery and hub dispatch alike.
 * @param {Object} deps Hub services; omitted when collecting only names/descriptions/schemas.
 * @return {Map} Tool catalog containing schema and handler for each name.
 */
export function createToolCatalog(deps = {}) {
    const tools = new Map();
    const collector = { tool(name, description, schema, handler) {
        tools.set(name, { name, description, schema, parse: z.object(schema), handler });
    } };
    registerTools(collector, deps.processManager, deps.wsControlServer, deps.phoenixDesktopPath);
    registerReservationTools(collector, deps.pool, deps.session, deps.pollUrl);
    return tools;
}
