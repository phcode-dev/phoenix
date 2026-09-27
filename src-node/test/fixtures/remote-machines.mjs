import { spawn } from "node:child_process";
import { once } from "node:events";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import WebSocket from "../../../phoenix-builder-mcp/node_modules/ws/wrapper.mjs";
import { createWSControlServer } from "../../../phoenix-builder-mcp/ws-control-server.js";

const scenario = process.argv[2];
const builderFile = fileURLToPath(new URL("../../../phoenix-builder-mcp/index.js", import.meta.url));

/** Connect one ordinary application socket with the unchanged hello schema. */
async function connect(server, name, origin = "phtauri://localhost") {
    const socket = new WebSocket(`ws://localhost:${server.getPort()}`, { origin });
    await once(socket, "open"); socket.send(JSON.stringify({ type: "hello", name }));
    const pong = once(socket, "pong"); socket.ping(); await pong;
    return socket;
}

/** Use real stdio JSON-RPC and end its upstream pipe, with no external controller or desktop process. */
async function stdioFixture() {
    const child = spawn(process.execPath, [builderFile], { env: { ...process.env, PHOENIX_MCP_WS_PORT: "0" },
    stdio: ["pipe", "pipe", "pipe"] });
    const pending = new Map(); let sequence = 0; let stderr = "";
    const reader = createInterface({ input: child.stdout });
    reader.on("line", line => {
        const response = JSON.parse(line);
        if (pending.has(response.id)) { pending.get(response.id)(response); pending.delete(response.id); }
    });
    child.stderr.on("data", bytes => { stderr = (stderr + bytes.toString()).slice(-4096); });
    const request = (method, params) => {
        const id = ++sequence;
        return new Promise(resolve => { pending.set(id, resolve); child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n"); });
    };
    const timeout = setTimeout(() => child.kill("SIGKILL"), 10000);
    try {
        const initialized = await request("initialize", { protocolVersion: "2024-11-05", capabilities: {},
            clientInfo: { name: "isolated-jasmine-fixture", version: "1" } });
        child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
        const listed = await request("tools/list", {});
        const local = await request("tools/call", { name: "get_phoenix_status", arguments: {} });
        const exited = once(child, "exit"); child.stdin.end(); const [code, signal] = await exited;
        return { initialized: Boolean(initialized.result), tools: listed.result.tools.map(tool => tool.name),
            instructions: initialized.result.instructions,
            local: JSON.parse(local.result.content[0].text), code, signal, stderr };
    } finally { clearTimeout(timeout); if (child.exitCode === null) { child.kill("SIGKILL"); } }
}

/** Observe listener ownership, per-socket cancellation and response routing using actual local sockets. */
async function socketFixture() {
    const server = createWSControlServer(0); await server.ready;
    const clients = [];
    try {
        if (scenario === "all-origins") {
            for (const origin of ["phtaur://customer-workspace", "phtauri://custom-host", "https://example.invalid", "null"]) {
                const socket = await connect(server, origin, origin); clients.push(socket);
            }
            return { count: server.getConnectedInstances().length };
        }
        if (scenario === "conflict") {
            const second = createWSControlServer(server.getPort()); let conflict;
            try { await second.ready; } catch (error) { conflict = error.code; }
            const socket = await connect(server, "still-alive"); clients.push(socket);
            return { conflict, instances: server.getConnectedInstances() };
        }
        const first = await connect(server, "one"); clients.push(first);
        const requested = once(first, "message");
        const result = server.requestExecJs("return 1", "one").then(value => ({ value }), error => ({ error: error.message }));
        const request = JSON.parse((await requested)[0].toString());
        if (scenario === "disconnect") { first.close(); return await result; }
        const second = await connect(server, "two"); clients.push(second);
        second.send(JSON.stringify({ type: "exec_js_response", id: request.id, result: "wrong-client" }));
        const pong = once(second, "pong"); second.ping(); await pong;
        first.send(JSON.stringify({ type: "exec_js_response", id: request.id, result: "correct-client" }));
        return await result;
    } finally { for (const socket of clients) { socket.terminate(); } await server.close(); }
}

let result;
if (scenario === "stdio") { result = await stdioFixture(); }
else if (["conflict", "disconnect", "reply-owner", "all-origins"].includes(scenario)) { result = await socketFixture(); }
else { throw new Error("Unknown fixed fixture"); }
process.stdout.write(JSON.stringify(result));
