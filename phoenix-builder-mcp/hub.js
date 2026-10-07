import { WebSocketServer } from "ws";
import { createWSControlServer } from "./ws-control-server.js";
import { createProcessManager } from "./process-manager.js";
import { createReservationManager } from "./machine-reservations.js";
import { createToolCatalog } from "./tool-catalog.js";

/**
 * Start the shared hub, with separate agent and Phoenix WebSocket protocols on one loopback listener.
 * @param {Object} options Port, notesPath and phoenixDesktopPath.
 * @return {Promise<Object>} Hub services and an idempotent shutdown method.
 */
export async function createHub({ port = 38571, notesPath, phoenixDesktopPath }) {
    const pool = await createReservationManager({ notesPath });
    const processManager = createProcessManager();
    const agents = new WebSocketServer({ noServer: true, maxPayload: 32 * 1024 * 1024, perMessageDeflate: false });
    const clients = new Map();
    let closed = false;
    let closePromise;
    const wsControlServer = createWSControlServer(port, { handleHttp, handleUpgrade });

    /** Expose read-only polling; the monitor never acquires a session or extends ownership. */
    function handleHttp(request, response) {
        const url = new URL(request.url, "http://localhost");
        if (!url.pathname.startsWith("/reservations/requests/")) { return false; }
        response.setHeader("Content-Type", "application/json");
        response.setHeader("Cache-Control", "no-store");
        if (request.method !== "GET") {
            response.writeHead(405); response.end(JSON.stringify({ error: "GET required" })); return true;
        }
        const result = pool.requestStatus(url.pathname.slice("/reservations/requests/".length));
        response.writeHead(result.status === "not_found" ? 404 : 200);
        response.end(JSON.stringify(result));
        return true;
    }

    /** Route only the reserved agent path; every existing app path keeps the original protocol. */
    function handleUpgrade(request, socket, head) {
        if (new URL(request.url, "http://localhost").pathname !== "/agents") { return false; }
        if (closed || agents.clients.size >= 64) { socket.destroy(); return true; }
        agents.handleUpgrade(request, socket, head, ws => agents.emit("connection", ws));
        return true;
    }

    /** Send a response only to its originating adapter. */
    function send(socket, message) {
        if (socket.readyState === 1) { socket.send(JSON.stringify(message)); }
    }

    agents.on("connection", socket => {
        const client = { session: null, calls: new Set() };
        clients.set(socket, client);
        socket.on("error", () => socket.terminate());
        socket.on("close", () => {
            clients.delete(socket);
            if (client.session) { pool.dropSession(client.session.id).catch(error => console.error(error)); }
        });
        socket.on("message", async data => {
            let message;
            try {
                message = JSON.parse(data.toString());
                if (!client.session) {
                    if (message.type !== "hello" || message.version !== 1) {
                        socket.close(1008, "Agent hello required"); return;
                    }
                    client.session = pool.addSession(message.name);
                    client.tools = createToolCatalog({ processManager: processManager.createSessionView(),
                        wsControlServer, phoenixDesktopPath, pool, session: client.session,
                        pollUrl: id => `http://localhost:${wsControlServer.getPort()}/reservations/requests/${id}` });
                    send(socket, { type: "hello", version: 1, agent: client.session });
                    return;
                }
                if (message.type !== "call" || !Number.isSafeInteger(message.id)) {
                    socket.close(1008, "Agent call required"); return;
                }
                if (client.calls.has(message.id)) { socket.close(1008, "Duplicate pending call ID"); return; }
                if (client.calls.size >= 128) { throw new Error("Agent has too many pending calls"); }
                const tool = client.tools.get(message.name);
                if (!tool) { throw new Error("Unknown Builder tool: " + message.name); }
                const args = tool.parse.parse(message.args || {});
                client.calls.add(message.id);
                try {
                    const result = await tool.handler(args);
                    send(socket, { type: "result", id: message.id, result });
                } finally { client.calls.delete(message.id); }
            } catch (error) {
                send(socket, { type: "result", id: message && message.id,
                    result: { isError: true, content: [{ type: "text", text: error.message }] } });
            }
        });
    });

    /** Stop only hub-owned connections/processes; an individual adapter never invokes this. */
    function close() {
        if (closePromise) { return closePromise; }
        closed = true;
        closePromise = (async () => {
            for (const [socket, client] of clients) {
                if (client.session) { await pool.dropSession(client.session.id); }
                socket.terminate();
            }
            await Promise.all([wsControlServer.close(), new Promise(resolve => agents.close(resolve)), processManager.stop()]);
            await pool.settled();
        })();
        return closePromise;
    }

    try {
        await wsControlServer.ready;
    } catch (error) {
        await close();
        throw error;
    }
    return { pool, wsControlServer, processManager, close, getPort: wsControlServer.getPort };
}
