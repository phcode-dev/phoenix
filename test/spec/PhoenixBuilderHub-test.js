/*
 * Copyright (c) 2026 core.ai
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
/*global describe, it, expect, beforeAll, awaitsFor */

define(function (require, exports, module) {
    const NodeConnector = require("NodeConnector");
    if (!Phoenix.isNativeApp) { return; }

    describe("unit:Phoenix Builder Hub", function () {
        let connector;
        beforeAll(async function () {
            await awaitsFor(NodeConnector.isNodeReady, "Node runtime to be ready");
            connector = NodeConnector.createNodeConnector("ph_test_builder_hub", exports);
        });
        const run = scenario => connector.execPeer("exercise", {scenario});

        it("grants exactly one racing caller and queues the others", async function () {
            const result = await run("pool-race");
            expect(result.states).toEqual(["granted", "queued", "queued"]);
            expect(result.machine.queue.length).toBe(2);
        });
        it("makes repeated reserve/queue calls idempotent", async function () {
            const r = await run("pool-repeat");
            expect(r.first.requestId).toBe(r.again.requestId);
            expect(r.other.requestId).toBe(r.repeated.requestId);
            expect(r.queue).toBe(1);
        });
        it("allows different machines to have independent owners", async function () {
            const r = await run("pool-independent");
            expect(r.first.status).toBe("granted"); expect(r.other.status).toBe("granted");
        });
        it("reports busy without implicitly joining the queue", async function () {
            const r = await run("pool-busy");
            expect(r.result.status).toBe("busy"); expect(r.queue).toBe(0);
        });
        it("rejects another agent's release and source note", async function () {
            const r = await run("pool-authority");
            expect(r.release.error).toContain("not owned"); expect(r.note.error).toContain("not owned");
            expect(r.owner).toBe(r.expected);
        });
        it("retains ownership when the final note cannot be persisted", async function () {
            const r = await run("pool-note-write-failure");
            expect(r.result.error).toBeDefined(); expect(r.owner).toBe(r.expected); expect(r.waiting).toBe("queued");
        });
        it("restores notes without resurrecting ownership after restart", async function () {
            const r = await run("pool-restart");
            expect(r.grant.status).toBe("granted");
            expect(r.grant.sourceCodeChangedNote.disposition).toBe("preserve");
            expect(r.grant.sourceCodeChangedNote.authorConnected).toBe(false);
            expect(r.status.queue).toEqual([]);
        });
        it("can remove a later queue entry without disturbing the earlier waiter", async function () {
            const r = await run("pool-dequeue");
            expect(r.cancelled.status).toBe("cancelled"); expect(r.second.status).toBe("granted");
            expect(r.third.status).toBe("cancelled");
        });
        it("rejects cancelling another agent's queued request", async function () {
            const r = await run("pool-dequeue-other");
            expect(r.result.error).toContain("not yours"); expect(r.status).toBe("queued");
        });
        it("reports granted if cancellation lost the race without releasing ownership", async function () {
            const r = await run("pool-dequeue-after-grant");
            expect(r.result.status).toBe("granted"); expect(r.owner.requestId).toBe(r.result.requestId);
        });
        it("hands off on disconnect and includes interrupted source notes", async function () {
            const r = await run("pool-disconnect");
            expect(r.previous.status).toBe("disconnected"); expect(r.next.status).toBe("granted");
            expect(r.next.sourceCodeChangedNote.operationId).toBe("fixture-sync");
            expect(r.next.sourceCodeChangedNote.authorConnected).toBe(false);
            expect(r.third.status).toBe("queued");
        });
        it("skips a disconnected waiter", async function () {
            const r = await run("pool-drop-waiter");
            expect(r.second.status).toBe("disconnected"); expect(r.third.status).toBe("granted");
        });
        it("ignores stale owner cleanup and rejects its note update", async function () {
            const r = await run("pool-stale-owner");
            expect(r.late.error).toContain("not owned"); expect(r.owner).toBe(r.expected);
        });
        it("persists the final note before promoting the next owner", async function () {
            const r = await run("pool-release-note");
            expect(r.next.status).toBe("granted");
            expect(r.next.sourceCodeChangedNote.description).toBe(r.disk.notes[0][1].description);
        });
        it("does not let a former owner jump ahead of an existing waiter", async function () {
            const r = await run("pool-fifo");
            expect(r.third.status).toBe("granted"); expect(r.late.status).toBe("queued");
        });
        it("starts and stops the supervised hub through its parent lifecycle", async function () {
            const r = await run("hub-supervisor");
            expect(r.ready).toBe("ready"); expect(r.port).toBeGreaterThan(0); expect(r.stopped).toBe(true);
        });
        it("keeps MCP tool discovery available when the hub goes offline", async function () {
            const r = await run("hub-offline-discovery");
            expect(r.names).toContain("exec_js"); expect(r.names).toContain("reserve_machine");
            expect(r.offlineCount).toBe(r.names.length); expect(r.agent).toContain("fixture-codex");
            expect(r.offlineCall.isError).toBe(true);
            expect(r.offlineCall.content[0].text).toContain("npm run serve");
        });
        it("leaves an existing port owner operational on startup conflict", async function () {
            const r = await run("hub-port-conflict");
            expect(r.result.error).toContain("EADDRINUSE"); expect(r.existing.wsPort).toBeGreaterThan(0);
        });
        it("releases only the disconnected adapter and keeps the other usable", async function () {
            const r = await run("hub-disconnect");
            expect(r.result.status).toBe("granted"); expect(r.sessions).toBe(1);
        });
        it("exposes read-only polling with source notes after a handoff", async function () {
            const r = await run("hub-polling");
            expect(r.before.status).toBe("queued"); expect(r.after.status).toBe("granted");
            expect(r.after.sourceCodeChangedNote.disposition).toBe("preserve"); expect(r.methodStatus).toBe(405);
        });
        it("notifies the monitor once when its request is granted", async function () {
            const r = await run("hub-monitor");
            expect(r.result.status).toBe("granted"); expect(r.notified).toBe(1);
            expect(r.result.sourceCodeChangedNote.operationId).toBe("fixture-sync");
        });
        it("stops a dequeued monitor without a grant notification", async function () {
            const r = await run("hub-monitor-cancel");
            expect(r.result.status).toBe("cancelled"); expect(r.notified).toBe(0);
        });
        it("does not mistake an unavailable hub for a grant", async function () {
            const r = await run("hub-monitor-lost");
            expect(r.error).toContain("timed out");
        });
        it("reconnects with a new session without reclaiming old reservations", async function () {
            const r = await run("hub-reconnect");
            expect(r.changed).toBe(true); expect(r.machines).toEqual([]); expect(r.call.wsPort).toBeGreaterThan(0);
        });
        it("routes reversed replies to the correct agents independently of reservations", async function () {
            const r = await run("hub-routing");
            expect(r.replies[0]).toContain("first-agent"); expect(r.replies[1]).toContain("second-agent");
            expect(r.ids[0]).not.toBe(r.ids[1]); expect(r.machines[0].machineId).toBe("local");
            expect(r.owner).toBe(r.expected);
        });
        it("does not release a machine when its Phoenix app socket reloads", async function () {
            const r = await run("hub-app-reload");
            expect(r.owner).toBe(r.expected); expect(r.waiting).toBe("queued");
        });
        it("runs the configured monitor notification executable exactly once", async function () {
            const r = await run("hub-monitor-command");
            expect(r.output.status).toBe("granted"); expect(r.notifications.length).toBe(1);
            expect(r.notifications[0]).toEqual(r.output);
            expect(r.output.sourceCodeChangedNote.operationId).toBe("fixture-sync");
        });
        it("keeps one agent's log reads and clears independent of another's", async function () {
            const r = await run("logs-readers");
            expect(r.first).toEqual([{value: 1}]); expect(r.second).toEqual(r.first);
            expect(r.firstVisible).toEqual([{value: 2}]); expect(r.next).toEqual(r.firstVisible);
            expect(r.secondVisible).toEqual([{value: 1}, {value: 2}]);
        });
        it("shares a bounded log history and advances lagging readers past evicted entries", async function () {
            const r = await run("logs-overflow");
            expect(r.length).toBe(10000); expect(r.beginning).toBe(5); expect(r.end).toBe(10004);
            expect(r.sameEntries).toBe(true); expect(r.repeated).toBe(0);
        });
    });
});
