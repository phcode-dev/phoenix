import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { EventEmitter, once } from "node:events";
import path from "node:path";
import process from "node:process";
import { PassThrough } from "node:stream";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
    createProcessManager,
    terminateProcessTree
} from "../process-manager.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class FakeChild extends EventEmitter {
    constructor(pid = 4242) {
        super();
        this.pid = pid;
        this.stdout = new PassThrough();
        this.stderr = new PassThrough();
        this.exitCode = null;
        this.signalCode = null;
    }

    emitExit(code, signal) {
        this.exitCode = code;
        this.signalCode = signal;
        this.emit("exit", code, signal);
    }

    kill() {
        return true;
    }
}

function _isProcessRunning(pid) {
    try {
        process.kill(pid, 0);
        return true;
    } catch (error) {
        return error.code !== "ESRCH";
    }
}

async function _waitFor(condition, timeoutMs = 5000) {
    const deadline = Date.now() + timeoutMs;
    while (!condition()) {
        if (Date.now() >= deadline) {
            throw new Error("Timed out waiting for process state");
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
    }
}

test("start forwards the configured environment and avoids a POSIX shell wrapper", async (t) => {
    const previousSandboxValue = process.env.ELECTRON_DISABLE_SANDBOX;
    process.env.ELECTRON_DISABLE_SANDBOX = "1";
    t.after(() => {
        if (previousSandboxValue === undefined) {
            delete process.env.ELECTRON_DISABLE_SANDBOX;
        } else {
            process.env.ELECTRON_DISABLE_SANDBOX = previousSandboxValue;
        }
    });

    const child = new FakeChild();
    let spawnCall;
    const signals = [];
    const manager = createProcessManager({
        startupGraceMs: 0,
        spawnImpl(command, args, options) {
            spawnCall = { command, args, options };
            queueMicrotask(() => child.emit("spawn"));
            return child;
        },
        terminateProcessTreeImpl: async (target, signal) => {
            signals.push(signal);
            queueMicrotask(() => target.emitExit(null, signal));
            return true;
        }
    });

    const result = await manager.start("/tmp/phoenix-desktop-fixture");
    assert.equal(result.pid, child.pid);
    assert.equal(spawnCall.command, "npm");
    assert.deepEqual(spawnCall.args, ["run", "serve:electron"]);
    assert.equal(spawnCall.options.shell, process.platform === "win32");
    assert.equal(spawnCall.options.detached, process.platform !== "win32");
    assert.equal(spawnCall.options.env.ELECTRON_DISABLE_SANDBOX, "1");

    const stopResult = await manager.stop();
    assert.deepEqual(stopResult, { success: true, forced: false });
    assert.deepEqual(signals, ["SIGTERM"]);
});

test("start rejects when the child exits during the startup grace period", async () => {
    const child = new FakeChild();
    const manager = createProcessManager({
        startupGraceMs: 50,
        spawnImpl() {
            queueMicrotask(() => {
                child.emit("spawn");
                child.emitExit(127, null);
            });
            return child;
        }
    });

    await assert.rejects(
        manager.start("/tmp/phoenix-desktop-fixture"),
        /exited before startup completed \(code=127, signal=null\)/
    );
    assert.equal(manager.isRunning(), false);
});

test("stop escalates to the complete process tree after the grace period", async () => {
    const child = new FakeChild();
    const signals = [];
    const manager = createProcessManager({
        startupGraceMs: 0,
        stopGraceMs: 5,
        forceExitGraceMs: 100,
        spawnImpl() {
            queueMicrotask(() => child.emit("spawn"));
            return child;
        },
        terminateProcessTreeImpl: async (target, signal) => {
            signals.push(signal);
            if (signal === "SIGKILL") {
                queueMicrotask(() => target.emitExit(null, signal));
            }
            return true;
        }
    });

    await manager.start("/tmp/phoenix-desktop-fixture");
    const result = await manager.stop();
    assert.deepEqual(result, { success: true, forced: true });
    assert.deepEqual(signals, ["SIGTERM", "SIGKILL"]);
});

test("terminateProcessTree stops a detached POSIX process and its descendant", {
    skip: process.platform === "win32"
}, async (t) => {
    const fixturePath = path.join(__dirname, "fixtures", "process-tree-parent.js");
    const child = spawn(process.execPath, [fixturePath], {
        detached: true,
        stdio: ["ignore", "pipe", "pipe"]
    });
    let grandchildPid = null;

    t.after(async () => {
        if (_isProcessRunning(child.pid)) {
            await terminateProcessTree(child, "SIGKILL");
        }
        if (grandchildPid && _isProcessRunning(grandchildPid)) {
            try {
                process.kill(grandchildPid, "SIGKILL");
            } catch {
                // The fixture already exited.
            }
        }
    });

    const [data] = await once(child.stdout, "data");
    grandchildPid = Number(data.toString().trim());
    assert.ok(Number.isInteger(grandchildPid));
    assert.equal(_isProcessRunning(child.pid), true);
    assert.equal(_isProcessRunning(grandchildPid), true);

    const exitPromise = once(child, "exit");
    assert.equal(await terminateProcessTree(child, "SIGTERM"), true);
    await exitPromise;
    await _waitFor(() => !_isProcessRunning(grandchildPid));

    assert.equal(_isProcessRunning(child.pid), false);
    assert.equal(_isProcessRunning(grandchildPid), false);
});
