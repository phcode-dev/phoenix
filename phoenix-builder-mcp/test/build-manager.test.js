import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import process from "node:process";
import { PassThrough } from "node:stream";
import test from "node:test";
import { createBuildManager } from "../build-manager.js";

class FakeChild extends EventEmitter {
    constructor(pid = 5151) {
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
}

test("starts an npm build without a POSIX shell and records success", async () => {
    const child = new FakeChild();
    let spawnCall;
    const manager = createBuildManager({
        spawnImpl(command, args, options) {
            spawnCall = { command, args, options };
            queueMicrotask(() => child.emit("spawn"));
            return child;
        }
    });

    const started = await manager.start("/tmp/phoenix", "release:dev");
    assert.equal(started.status, "running");
    assert.equal(started.pid, child.pid);
    assert.equal(spawnCall.command, "npm");
    assert.deepEqual(spawnCall.args, ["run", "release:dev"]);
    assert.equal(spawnCall.options.cwd, "/tmp/phoenix");
    assert.equal(spawnCall.options.shell, process.platform === "win32");

    child.stdout.write("building\n");
    child.emitExit(0, null);

    const finished = manager.getStatus();
    assert.equal(finished.status, "succeeded");
    assert.equal(finished.running, false);
    assert.equal(finished.exitCode, 0);
    assert.match(manager.getLogs(0)[0].text, /building/);
});

test("rejects a second build while one is running", async () => {
    const child = new FakeChild();
    const manager = createBuildManager({
        spawnImpl() {
            queueMicrotask(() => child.emit("spawn"));
            return child;
        }
    });

    await manager.start("/tmp/phoenix", "build");
    assert.throws(
        () => manager.start("/tmp/phoenix", "release:prod"),
        /already running/
    );
    child.emitExit(0, null);
});

test("stop terminates the complete build process tree", async () => {
    const child = new FakeChild();
    const signals = [];
    const manager = createBuildManager({
        spawnImpl() {
            queueMicrotask(() => child.emit("spawn"));
            return child;
        },
        terminateProcessTreeImpl: async (target, signal) => {
            signals.push(signal);
            queueMicrotask(() => target.emitExit(null, signal));
            return true;
        }
    });

    await manager.start("/tmp/phoenix", "build");
    const result = await manager.stop();

    assert.equal(result.success, true);
    assert.equal(result.forced, false);
    assert.deepEqual(signals, ["SIGTERM"]);
    assert.equal(manager.getStatus().running, false);
});
