/*
 * Copyright (c) 2021 - present core.ai
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/** Session-scoped transport used by the stdio MCP adapter and command hooks. */
const fs = require("fs");
const WebSocket = require("ws");
const {randomUUID} = require("crypto");

/** Read a generated session file without ever putting its URL in diagnostics. */
function readSession(sessionFile) {
    const session = JSON.parse(fs.readFileSync(sessionFile, "utf8"));
    if (session.version !== 1 || !session.sessionId || !/^ws:\/\/(localhost|127\.0\.0\.1|\[::1\]):/.test(session.url)) {
        throw new Error("Invalid Phoenix session file; restart the CLI from the AI panel.");
    }
    // Local-only metadata lets a surviving adapter distinguish a revoked/dead boot
    // from a temporary socket interruption. It never travels over the bridge.
    session.sessionFile = sessionFile;
    return session;
}

/** Connection loss rejects pending work; nothing is replayed after reconnecting. */
class CliConnection {
    /** @param {Object} session Generated session record. @param {string} client mcp or hook. */
    constructor(session, client = "mcp") {
        this.session = session;
        this.client = client;
        this.pending = new Map();
        this.socket = null;
        this.ready = false;
        this.ended = false;
        this.connecting = null;
    }

    /** @return {Promise<void>} Resolve after hello, with a bounded connection deadline. */
    connect() {
        if (this.session.sessionFile && !fs.existsSync(this.session.sessionFile)) {
            this.close();
        }
        if (this.ready) { return Promise.resolve(); }
        if (this.ended) { return Promise.reject(new Error("Phoenix session ended; restart the CLI from the panel.")); }
        if (this.connecting) { return this.connecting; }
        this.connecting = new Promise((resolve, reject) => {
            const socket = new WebSocket(this.session.url, {handshakeTimeout: 2000, maxPayload: 16 * 1024 * 1024});
            this.socket = socket;
            const timer = setTimeout(() => socket.terminate(), 2500);
            const fail = () => {
                clearTimeout(timer);
                reject(new Error("Phoenix is not connected. Retry when the editor is available."));
            };
            socket.on("error", fail);
            socket.on("open", () => socket.send(JSON.stringify({type: "hello", version: 1,
                sessionId: this.session.sessionId, client: this.client})));
            socket.on("message", raw => {
                let message;
                try { message = JSON.parse(raw.toString()); } catch (error) { socket.terminate(); return; }
                if (message.type === "hello") {
                    clearTimeout(timer);
                    this.ready = true;
                    resolve();
                } else if (message.type === "event" && message.name === "sessionEnded") {
                    this.ended = true;
                    socket.close();
                } else if (message.type === "result") {
                    const pending = this.pending.get(message.id);
                    if (!pending) { return; }
                    this.pending.delete(message.id);
                    clearTimeout(pending.timer);
                    if (message.ok) { pending.resolve(message.data); } else { pending.reject(Object.assign(new Error(message.error.message), {code: message.error.code})); }
                }
            });
            socket.on("close", code => {
                fail();
                this.ready = false;
                if (code === 4001) { this.ended = true; }
                for (const pending of this.pending.values()) {
                    clearTimeout(pending.timer);
                    pending.reject(Object.assign(new Error(this.ended
                        ? "Phoenix session ended; restart the CLI from the panel."
                        : "Connection lost; outcome_unknown. Check the editor before retrying this operation."),
                    {code: this.ended ? "session_ended" : "outcome_unknown"}));
                }
                this.pending.clear();
            });
        }).finally(() => { this.connecting = null; });
        return this.connecting;
    }

    /**
     * Send a tool or hook once. Caller cancellation only dismisses owned interactive UI.
     * @param {string} type call or hook.
     * @param {string} fn Tool name or hook event.
     * @param {Object} args Validated arguments.
     * @param {number} timeoutMs Whole-call budget.
     * @param {AbortSignal} [signal] MCP cancellation signal.
     * @return {Promise<Object>} Response from Phoenix.
     */
    async call(type, fn, args, timeoutMs, signal) {
        await this.connect();
        if (signal && signal.aborted) { throw new Error("Call cancelled."); }
        const id = randomUUID();
        let abort;
        const result = new Promise((resolve, reject) => {
            const cancel = reason => {
                this.pending.delete(id);
                if (this.socket.readyState === WebSocket.OPEN) {
                    this.socket.send(JSON.stringify({type: "cancel", id}));
                }
                reject(new Error(reason));
            };
            const timer = setTimeout(() => cancel("Phoenix call timed out; check the editor before retrying."), timeoutMs);
            abort = () => { clearTimeout(timer); cancel("Call cancelled."); };
            this.pending.set(id, {resolve, reject, timer});
            if (signal) { signal.addEventListener("abort", abort, {once: true}); }
            this.socket.send(JSON.stringify({type, id, fn, args}), error => {
                if (error) { clearTimeout(timer); cancel("Connection lost; outcome_unknown."); }
            });
        });
        return result.finally(() => { if (signal) { signal.removeEventListener("abort", abort); } });
    }

    /** Close only this connection; ending a session is the owning terminal's responsibility. */
    close() {
        this.ended = true;
        this.ready = false;
        if (this.socket) { this.socket.terminate(); }
    }
}

exports.CliConnection = CliConnection;
exports.readSession = readSession;
