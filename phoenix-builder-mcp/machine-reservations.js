import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

/**
 * Create the whole-machine FIFO pool. Only source notes survive a hub restart.
 * @param {Object} options Storage configuration; notesPath is a private, hub-owned JSON file.
 * @return {Promise<Object>} Session, reservation and source-note operations.
 */
export async function createReservationManager({ notesPath }) {
    const machines = new Map();
    const sessions = new Map();
    const requests = new Map();
    let notes = new Map();
    let mutations = Promise.resolve();
    try {
        const stored = JSON.parse(await fs.readFile(notesPath, "utf8"));
        if (stored.version !== 1 || !Array.isArray(stored.notes)) {
            throw new Error("Unsupported Builder source-note file");
        }
        notes = new Map(stored.notes);
    } catch (error) {
        if (error.code !== "ENOENT") { throw error; }
    }

    /** Serialize state transitions, including a final note write before handing off ownership. */
    function change(fn) {
        const result = mutations.then(fn);
        mutations = result.catch(() => {});
        return result;
    }

    /** Find or create a machine record; machines without an app may still be reserved for setup. */
    function machine(id) {
        if (typeof id !== "string" || !id.trim() || id.length > 200) {
            throw new Error("A machineId from remote-control or Builder status is required");
        }
        if (!machines.has(id)) { machines.set(id, { owner: null, queue: [] }); }
        return machines.get(id);
    }

    /** Require the actual calling connection to still exist. */
    function session(id) {
        const found = sessions.get(id);
        if (!found) { throw new Error("Agent session disconnected; reserve again after reconnecting"); }
        return found;
    }

    /** Return a detached note with live connection information; disk contents are never inferred. */
    function sourceNote(machineId) {
        const note = notes.get(machineId);
        return note ? { ...note, authorConnected: sessions.has(note.authorSessionId) } : null;
    }

    /** Build a polling result without exposing mutable pool records. */
    function requestStatus(requestId) {
        const request = requests.get(requestId);
        if (!request) { return { status: "not_found", requestId }; }
        const record = machine(request.machineId);
        return { ...request, position: request.status === "queued" ? record.queue.indexOf(requestId) + 1 : null,
            sourceCodeChangedNote: sourceNote(request.machineId) };
    }

    /** Return current ownership and FIFO order; source notes do not prevent acquisition. */
    function status(machineId) {
        const record = machine(machineId);
        return { machineId, owner: record.owner ? requestStatus(record.owner) : null,
            queue: record.queue.map(requestStatus), sourceCodeChangedNote: sourceNote(machineId) };
    }

    /** Promote the first still-connected waiter. No Phoenix message participates in this decision. */
    function promote(record) {
        while (!record.owner && record.queue.length) {
            const id = record.queue.shift();
            const request = requests.get(id);
            if (!sessions.has(request.sessionId)) { request.status = "disconnected"; continue; }
            request.status = "granted";
            request.grantedAt = new Date().toISOString();
            record.owner = id;
        }
    }

    /** Bound retained terminal request receipts while retaining every live reservation and waiter. */
    function prune() {
        for (const [id, request] of requests) {
            if (requests.size <= 2000) { break; }
            if (request.status !== "granted" && request.status !== "queued") { requests.delete(id); }
        }
    }

    /** Require an exact live grant, preventing stale releases and note updates after a handoff. */
    function owned(sessionId, reservationId) {
        session(sessionId);
        const request = requests.get(reservationId);
        if (!request || request.sessionId !== sessionId || request.status !== "granted"
            || machine(request.machineId).owner !== reservationId) {
            throw new Error("This reservation is not owned by the calling agent");
        }
        return request;
    }

    /** Persist a bounded source-work note atomically before acknowledging it or releasing the machine. */
    async function saveNote(sessionId, request, input) {
        if (!input || typeof input.description !== "string" || !input.description.trim()
            || input.description.length > 8000 || !["disposable", "preserve", "unknown"].includes(input.disposition)
            || !["in_progress", "complete", "failed", "unknown"].includes(input.phase || "unknown")) {
            throw new Error("Source note requires description, disposition and a valid phase");
        }
        const author = session(sessionId);
        const note = { description: input.description, disposition: input.disposition,
            phase: input.phase || "unknown", operationId: input.operationId || null,
            authorSessionId: sessionId, authorName: author.name, updatedAt: new Date().toISOString() };
        const next = new Map(notes);
        next.set(request.machineId, note);
        await fs.mkdir(path.dirname(notesPath), { recursive: true });
        const temporary = notesPath + "." + randomUUID() + ".tmp";
        try {
            await fs.writeFile(temporary, JSON.stringify({ version: 1, notes: [...next] }) + "\n",
                { flag: "wx", mode: 0o600 });
            await fs.rename(temporary, notesPath);
            notes = next;
        } finally {
            await fs.rm(temporary, { force: true });
        }
        return sourceNote(request.machineId);
    }

    return {
        /** Register one connection; labels are friendly names, never routing identities. */
        addSession(name = "agent") {
            const id = randomUUID();
            const prefix = String(name).replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 40) || "agent";
            const value = { id, name: prefix + "-" + id.slice(0, 8) };
            sessions.set(id, value);
            return { ...value };
        },
        /** Reserve immediately or optionally join FIFO. Retries by the same session are idempotent. */
        reserve(sessionId, { machineId, reason = "", queue = false }) {
            return change(() => {
                const caller = session(sessionId);
                const record = machine(machineId);
                const prior = [record.owner, ...record.queue].filter(Boolean)
                    .map(id => requests.get(id)).find(item => item.sessionId === sessionId);
                if (prior) { return requestStatus(prior.requestId); }
                if (record.owner && !queue) { return { status: "busy", ...status(machineId) }; }
                const requestId = randomUUID();
                requests.set(requestId, { requestId, reservationId: requestId, machineId, sessionId,
                    agentName: caller.name, reason, status: "queued", requestedAt: new Date().toISOString() });
                record.queue.push(requestId);
                promote(record);
                prune();
                return requestStatus(requestId);
            });
        },
        /** Save the current owner's source note independently of reservation lifetime. */
        updateNote(sessionId, { reservationId, sourceCodeChangedNote }) {
            return change(async () => {
                const request = owned(sessionId, reservationId);
                return saveNote(sessionId, request, sourceCodeChangedNote);
            });
        },
        /** Release this exact grant, optionally persisting a final note before promoting the next agent. */
        release(sessionId, { reservationId, sourceCodeChangedNote }) {
            return change(async () => {
                const request = owned(sessionId, reservationId);
                if (sourceCodeChangedNote) { await saveNote(sessionId, request, sourceCodeChangedNote); }
                const record = machine(request.machineId);
                record.owner = null;
                request.status = "released";
                promote(record);
                return requestStatus(reservationId);
            });
        },
        /** Remove only the caller's pending entry; an already granted request needs explicit release. */
        dequeue(sessionId, { requestId }) {
            return change(() => {
                session(sessionId);
                const request = requests.get(requestId);
                if (!request || request.sessionId !== sessionId) { throw new Error("Queue request is not yours"); }
                if (request.status === "queued") {
                    const record = machine(request.machineId);
                    record.queue = record.queue.filter(id => id !== requestId);
                    request.status = "cancelled";
                    promote(record);
                }
                return requestStatus(requestId);
            });
        },
        /** Remove a dead connection's reservations and waiters; retain all source notes. */
        dropSession(sessionId) {
            sessions.delete(sessionId);
            return change(() => {
                for (const record of machines.values()) {
                    for (const id of [record.owner, ...record.queue].filter(Boolean)) {
                        const request = requests.get(id);
                        if (request.sessionId === sessionId) {
                            request.status = "disconnected";
                            if (record.owner === id) { record.owner = null; }
                            record.queue = record.queue.filter(item => item !== id);
                        }
                    }
                    promote(record);
                }
            });
        },
        status,
        requestStatus,
        list: () => [...new Set([...machines.keys(), ...notes.keys()])].map(status),
        sessions: () => [...sessions.values()].map(value => ({ ...value })),
        settled: () => mutations
    };
}
