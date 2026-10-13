import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { once } from "node:events";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import WebSocket from "ws";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { createReservationManager } from "./builder-fixture/machine-reservations.js";
import { createHub } from "./builder-fixture/hub.js";
import { createHubClient } from "./builder-fixture/hub-client.js";
import { waitForReservation } from "./builder-fixture/reservation-monitor.js";
import { startBuilderHub } from "./builder-fixture/serve-hub.cjs";
import { LogBuffer } from "./builder-fixture/log-buffer.js";

const directory = path.dirname(fileURLToPath(import.meta.url));
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "phoenix-builder-test-"));
const notesPath = path.join(temporary, "notes.json");
const scenario = process.argv[2];
const closers = [];
const execute = promisify(execFile);
const note = { description: "Partial sync in fixture checkout; inspect before overwriting", disposition: "preserve",
    phase: "in_progress", operationId: "fixture-sync" };

/** Wait for a concrete fixture condition with a deadline, not a fixed-duration test delay. */
async function until(predicate) {
    const end = Date.now() + 5000;
    while (!predicate()) {
        if (Date.now() > end) { throw new Error("Fixture condition timed out"); }
        await delay(10);
    }
}

/** Return failures as data; Jasmine owns every assertion. */
async function outcome(operation) {
    try { return { value: await operation }; } catch (error) { return { error: error.message }; }
}

/** Isolate a shared hub and register all cleanup before any connection is attempted. */
async function hubFixture() {
    const hub = await createHub({ port: 0, notesPath, phoenixDesktopPath: temporary });
    closers.push(() => hub.close());
    const makeClient = async name => {
        const client = createHubClient({ url: `ws://localhost:${hub.getPort()}/agents`, name: () => name });
        closers.push(() => client.close());
        await client.connect();
        return client;
    };
    const first = await makeClient("codex");
    const second = await makeClient("claude");
    return { hub, first, second, makeClient };
}

/** Extract structured data from a normal text MCP result. */
function data(result) {
    if (result.isError) { throw new Error(result.content[0].text); }
    return JSON.parse(result.content[0].text);
}

/** Exercise exactly one bounded scenario selected by the registered Jasmine suite. */
async function exercise() {
    if (scenario.startsWith("logs-")) {
        const buffer = new LogBuffer();
        const a = buffer.createReader();
        const b = buffer.createReader();
        if (scenario === "logs-overflow") {
            for (let i = 0; i < 10005; i++) { buffer.push({ value: i }); }
            const first = a.get(true);
            const second = b.get(true);
            return { length: first.length, beginning: first[0].value, end: first[first.length - 1].value,
                sameEntries: first.every((entry, index) => entry === second[index]), repeated: a.get(true).length };
        }
        buffer.push({ value: 1 });
        const first = a.get(true);
        a.clear();
        const second = b.get(true);
        buffer.push({ value: 2 });
        return { first, second, firstVisible: a.get(false), secondVisible: b.get(false), next: a.get(true) };
    }
    if (scenario.startsWith("pool-")) {
        const pool = await createReservationManager({ notesPath });
        const a = pool.addSession("codex");
        const b = pool.addSession("claude");
        const c = pool.addSession("codex");
        const acquire = (who, id = "local", queue = true) => pool.reserve(who.id, { machineId: id, queue, reason: who.name });
        if (scenario === "pool-race") {
            const results = await Promise.all([acquire(a), acquire(b), acquire(c)]);
            return { states: results.map(item => item.status), machine: pool.status("local") };
        }
        const first = await acquire(a);
        if (scenario === "pool-repeat") {
            const again = await acquire(a);
            const other = await acquire(b);
            const repeated = await acquire(b);
            return { first, again, other, repeated, queue: pool.status("local").queue.length };
        }
        if (scenario === "pool-independent") { return { first, other: await acquire(b, "remote") }; }
        if (scenario === "pool-busy") {
            return { result: await acquire(b, "local", false), queue: pool.status("local").queue.length };
        }
        if (scenario === "pool-authority") {
            return { release: await outcome(pool.release(b.id, { reservationId: first.reservationId })),
                note: await outcome(pool.updateNote(b.id, { reservationId: first.reservationId, sourceCodeChangedNote: note })),
                owner: pool.status("local").owner.sessionId, expected: a.id };
        }
        if (scenario === "pool-note-write-failure") {
            await fs.mkdir(notesPath);
            const waiting = await acquire(b);
            const result = await outcome(pool.release(a.id, { reservationId: first.reservationId, sourceCodeChangedNote: note }));
            return { result, owner: pool.status("local").owner.sessionId, expected: a.id,
                waiting: pool.requestStatus(waiting.requestId).status };
        }
        if (scenario === "pool-restart") {
            await pool.updateNote(a.id, { reservationId: first.reservationId, sourceCodeChangedNote: note });
            const restored = await createReservationManager({ notesPath });
            const next = restored.addSession("next");
            return { grant: await restored.reserve(next.id, { machineId: "local" }), status: restored.status("local") };
        }
        const second = await acquire(b);
        const third = await acquire(c);
        if (scenario === "pool-dequeue") {
            const cancelled = await pool.dequeue(c.id, { requestId: third.requestId });
            await pool.release(a.id, { reservationId: first.reservationId });
            return { cancelled, second: pool.requestStatus(second.requestId), third: pool.requestStatus(third.requestId) };
        }
        if (scenario === "pool-dequeue-other") {
            return { result: await outcome(pool.dequeue(a.id, { requestId: second.requestId })),
                status: pool.requestStatus(second.requestId).status };
        }
        if (scenario === "pool-dequeue-after-grant") {
            await pool.release(a.id, { reservationId: first.reservationId });
            return { result: await pool.dequeue(b.id, { requestId: second.requestId }), owner: pool.status("local").owner };
        }
        if (scenario === "pool-disconnect") {
            await pool.updateNote(a.id, { reservationId: first.reservationId, sourceCodeChangedNote: note });
            await pool.dropSession(a.id);
            return { next: pool.requestStatus(second.requestId), previous: pool.requestStatus(first.requestId),
                third: pool.requestStatus(third.requestId) };
        }
        if (scenario === "pool-drop-waiter") {
            await pool.dropSession(b.id);
            await pool.release(a.id, { reservationId: first.reservationId });
            return { second: pool.requestStatus(second.requestId), third: pool.requestStatus(third.requestId) };
        }
        if (scenario === "pool-stale-owner") {
            await pool.release(a.id, { reservationId: first.reservationId });
            const late = await outcome(pool.updateNote(a.id, { reservationId: first.reservationId, sourceCodeChangedNote: note }));
            await pool.dropSession(a.id);
            return { late, owner: pool.status("local").owner.sessionId, expected: b.id };
        }
        if (scenario === "pool-release-note") {
            await pool.release(a.id, { reservationId: first.reservationId, sourceCodeChangedNote: note });
            return { next: pool.requestStatus(second.requestId), disk: JSON.parse(await fs.readFile(notesPath, "utf8")) };
        }
        if (scenario === "pool-fifo") {
            await pool.release(a.id, { reservationId: first.reservationId });
            const late = await acquire(a);
            await pool.release(b.id, { reservationId: second.reservationId });
            return { third: pool.requestStatus(third.requestId), late: pool.requestStatus(late.requestId) };
        }
        throw new Error("Unknown pool scenario");
    }
    if (scenario === "hub-supervisor") {
        process.env.PHOENIX_MCP_WS_PORT = "0";
        process.env.PHOENIX_BUILDER_STATE_DIR = temporary;
        const supervisor = startBuilderHub();
        closers.push(() => supervisor.stop());
        const ready = await supervisor.ready;
        await supervisor.stop();
        return { ready: ready.type, port: ready.port, stopped: true };
    }
    const { hub, first, second } = await hubFixture();
    const reserve = (client, queue = true) => client.call("reserve_machine", { machineId: "local", queue }).then(data);
    if (scenario === "hub-offline-discovery") {
        const transport = new StdioClientTransport({ command: process.execPath,
            args: [path.join(directory, "builder-fixture/index.js")],
            env: { ...process.env, PHOENIX_MCP_WS_PORT: String(hub.getPort()) }, stderr: "pipe" });
        const mcp = new Client({ name: "fixture-codex", version: "1" });
        closers.push(() => mcp.close());
        await mcp.connect(transport);
        const listed = await mcp.listTools();
        const status = await mcp.callTool({ name: "get_reservation_status", arguments: {} });
        await hub.close();
        const offlineTools = await mcp.listTools();
        const offlineCall = await mcp.callTool({ name: "get_phoenix_status", arguments: {} });
        return { names: listed.tools.map(tool => tool.name), offlineCount: offlineTools.tools.length,
            agent: data(status).agent.name, offlineCall };
    }
    if (scenario === "hub-port-conflict") {
        const result = await outcome(createHub({ port: hub.getPort(), notesPath: path.join(temporary, "other.json"),
            phoenixDesktopPath: temporary }));
        return { result, existing: data(await first.call("get_phoenix_status")) };
    }
    const grant = await reserve(first);
    const waiting = await reserve(second);
    if (scenario === "hub-disconnect") {
        first.close();
        await until(() => hub.pool.requestStatus(waiting.requestId).status === "granted");
        return { result: data(await second.call("get_reservation_status", { requestId: waiting.requestId })),
            sessions: hub.pool.sessions().length };
    }
    if (scenario === "hub-polling") {
        const response = await fetch(waiting.pollUrl);
        const before = await response.json();
        await first.call("release_machine", { reservationId: grant.reservationId, sourceCodeChangedNote: note });
        const after = await fetch(waiting.pollUrl).then(value => value.json());
        const method = await fetch(waiting.pollUrl, { method: "POST" });
        return { before, after, methodStatus: method.status };
    }
    if (scenario === "hub-monitor" || scenario === "hub-monitor-cancel") {
        let notified = 0;
        const monitoring = waitForReservation({ url: waiting.pollUrl, timeoutMs: 3000,
            initialDelayMs: 5, maxDelayMs: 10, onGranted: async () => { notified++; } });
        if (scenario === "hub-monitor") {
            await first.call("release_machine", { reservationId: grant.reservationId, sourceCodeChangedNote: note });
        } else { await second.call("dequeue_machine", { requestId: waiting.requestId }); }
        return { result: await monitoring, notified };
    }
    if (scenario === "hub-monitor-lost") {
        await hub.close();
        const result = await outcome(waitForReservation({ url: waiting.pollUrl, timeoutMs: 100,
            initialDelayMs: 5, maxDelayMs: 10 }));
        return result;
    }
    if (scenario === "hub-monitor-command") {
        const notification = path.join(temporary, "wake up.jsonl");
        const executable = path.join(temporary, "notify.cjs");
        await fs.writeFile(executable, "const fs = require('node:fs');\n" +
            "fs.appendFileSync(process.argv[2], process.env.PHOENIX_BUILDER_GRANT + '\\n');\n");
        const monitoring = execute(process.execPath, [path.join(directory, "builder-fixture/wait-for-reservation.js"),
            waiting.pollUrl, "--timeout-ms", "5000", "--notify", process.execPath, executable, notification],
        { timeout: 8000, windowsHide: true });
        await first.call("release_machine", { reservationId: grant.reservationId, sourceCodeChangedNote: note });
        const { stdout } = await monitoring;
        return { output: JSON.parse(stdout.trim()),
            notifications: (await fs.readFile(notification, "utf8")).trim().split("\n").map(line => JSON.parse(line)) };
    }
    if (scenario === "hub-reconnect") {
        const previous = first.getSession().id;
        const port = hub.getPort();
        await hub.close();
        const next = await createHub({ port, notesPath, phoenixDesktopPath: temporary });
        closers.push(() => next.close());
        await until(() => first.getSession() && first.getSession().id !== previous);
        return { changed: first.getSession().id !== previous, machines: next.pool.list(),
            call: data(await first.call("get_phoenix_status")) };
    }
    if (scenario === "hub-routing" || scenario === "hub-app-reload") {
        const app = new WebSocket(`ws://localhost:${hub.getPort()}`);
        closers.push(() => app.terminate());
        await once(app, "open");
        app.send(JSON.stringify({ type: "hello", name: "fixture-app", machineId: "local" }));
        await until(() => hub.wsControlServer.isClientConnected());
        if (scenario === "hub-app-reload") {
            app.close();
            await once(app, "close");
            await until(() => !hub.wsControlServer.isClientConnected());
            return { owner: hub.pool.status("local").owner.requestId, expected: grant.requestId,
                waiting: hub.pool.requestStatus(waiting.requestId).status };
        }
        const captured = [];
        app.on("message", bytes => {
            const message = JSON.parse(bytes.toString());
            if (message.type === "exec_js_request") {
                captured.push(message);
                if (captured.length === 2) {
                    for (const item of [...captured].reverse()) {
                        app.send(JSON.stringify({ type: "exec_js_response", id: item.id, result: item.code }));
                    }
                }
            }
        });
        const replies = await Promise.all([
            first.call("exec_js", { code: "first-agent", instance: "fixture-app" }),
            second.call("exec_js", { code: "second-agent", instance: "fixture-app" })
        ]);
        return { replies: replies.map(item => item.content[0].text), ids: captured.map(item => item.id),
            machines: data(await first.call("get_phoenix_status")).machines,
            owner: hub.pool.status("local").owner.requestId, expected: grant.requestId };
    }
    throw new Error("Unknown hub scenario");
}

try {
    const result = await exercise();
    process.stdout.write(JSON.stringify(result) + "\n");
} catch (error) {
    process.stderr.write(error.stack + "\n");
    process.exitCode = 1;
} finally {
    for (const close of closers.reverse()) { await close(); }
    await fs.rm(temporary, { recursive: true, force: true });
}
