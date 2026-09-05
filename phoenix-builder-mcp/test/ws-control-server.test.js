import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import WebSocket from "ws";
import {
    createWSControlServer,
    DEFAULT_WS_HOST
} from "../ws-control-server.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, "..");

async function _connect(port) {
    const client = new WebSocket(`ws://127.0.0.1:${port}`);
    await once(client, "open");
    return client;
}

async function _waitFor(condition, timeoutMs = 1000) {
    const deadline = Date.now() + timeoutMs;
    while (!condition()) {
        if (Date.now() >= deadline) {
            throw new Error("Timed out waiting for condition");
        }
        await new Promise((resolve) => setTimeout(resolve, 5));
    }
}

test("the control socket binds to loopback by default", async (t) => {
    const server = await createWSControlServer(0);
    t.after(() => server.close());

    assert.equal(server.getAddress().address, DEFAULT_WS_HOST);
});

test("an occupied port rejects without replacing the active owner", async (t) => {
    const owner = await createWSControlServer(0);
    const port = owner.getPort();
    t.after(() => owner.close());

    await assert.rejects(
        createWSControlServer(port),
        (error) => {
            assert.equal(error.code, "EADDRINUSE");
            assert.match(error.message, /unique PHOENIX_MCP_WS_PORT/);
            return true;
        }
    );

    const client = await _connect(port);
    client.terminate();
});

test("index completes an MCP stdio handshake and releases a free port on close", async (t) => {
    const portAllocator = await createWSControlServer(0);
    const port = portAllocator.getPort();
    await portAllocator.close();

    const transport = new StdioClientTransport({
        command: process.execPath,
        args: [path.join(packageRoot, "index.js")],
        env: {
            PHOENIX_DESKTOP_PATH: "/tmp/phoenix-desktop-unused",
            PHOENIX_MCP_WS_PORT: String(port)
        },
        stderr: "pipe"
    });
    const client = new Client({
        name: "phoenix-builder-test",
        version: "1.0.0"
    });
    let clientClosed = false;
    let stderr = "";
    transport.stderr.on("data", (data) => {
        stderr += data.toString();
    });
    t.after(async () => {
        if (!clientClosed) {
            await client.close();
        }
    });

    await client.connect(transport);
    const tools = await client.listTools();
    const statusResult = await client.callTool({
        name: "get_phoenix_status",
        arguments: {}
    });
    const buildTool = tools.tools.find((tool) => tool.name === "build_phoenix");
    const runTestsTool = tools.tools.find((tool) => tool.name === "run_tests");

    assert.ok(tools.tools.some((tool) => tool.name === "start_phoenix"));
    assert.ok(tools.tools.some((tool) => tool.name === "get_phoenix_status"));
    assert.ok(buildTool);
    assert.ok(runTestsTool);
    assert.ok(
        buildTool.inputSchema.properties.target.enum.includes("validate-dist-size")
    );
    assert.deepEqual(
        runTestsTool.inputSchema.properties.category.enum,
        ["unit", "integration", "LegacyInteg", "livepreview", "mainview"]
    );
    const unsupportedCategoryResult = await client.callTool({
        name: "run_tests",
        arguments: { category: "all" }
    });
    assert.equal(unsupportedCategoryResult.isError, true);
    assert.deepEqual(JSON.parse(statusResult.content[0].text), {
        processRunning: false,
        pid: null,
        wsConnected: false,
        connectedInstances: [],
        wsPort: port
    });

    await client.close();
    clientClosed = true;
    assert.equal(stderr, "");

    const rebound = await createWSControlServer(port);
    await rebound.close();
});

test("server shutdown terminates clients that have not sent hello", async (t) => {
    const server = await createWSControlServer(0);
    const port = server.getPort();
    const client = await _connect(port);
    let serverClosed = false;
    t.after(async () => {
        if (!serverClosed) {
            client.terminate();
            await server.close();
        }
    });

    const clientClosed = once(client, "close");
    await server.close();
    serverClosed = true;
    await clientClosed;

    const rebound = await createWSControlServer(port);
    await rebound.close();
});

test("disconnecting a Phoenix client rejects its pending requests immediately", async (t) => {
    const server = await createWSControlServer(0);
    const client = await _connect(server.getPort());
    let serverClosed = false;
    t.after(async () => {
        client.terminate();
        if (!serverClosed) {
            await server.close();
        }
    });

    client.send(JSON.stringify({ type: "hello", name: "disconnect-test" }));
    await _waitFor(() => server.getConnectedInstances().includes("disconnect-test"));

    const screenshotRequest = server.requestScreenshot(undefined, "disconnect-test");
    client.terminate();

    await assert.rejects(screenshotRequest, /Phoenix client disconnected/);
    await server.close();
    serverClosed = true;
});

test("index exits before stdio readiness when its configured port is occupied", async (t) => {
    const owner = await createWSControlServer(0);
    const port = owner.getPort();
    t.after(() => owner.close());

    const child = spawn(process.execPath, [path.join(packageRoot, "index.js")], {
        cwd: packageRoot,
        env: {
            ...process.env,
            PHOENIX_MCP_WS_PORT: String(port)
        },
        stdio: ["pipe", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (data) => {
        stdout += data.toString();
    });
    child.stderr.on("data", (data) => {
        stderr += data.toString();
    });
    t.after(() => {
        if (child.exitCode === null) {
            child.kill("SIGKILL");
        }
    });

    const [exitCode] = await once(child, "exit");
    assert.notEqual(exitCode, 0);
    assert.equal(stdout, "");
    assert.match(stderr, new RegExp(`WebSocket port ${port} is already in use`));
    assert.equal(
        existsSync(path.join(packageRoot, `.mcp-server-${port}.pid`)),
        false
    );

    const client = await _connect(port);
    client.terminate();
});
