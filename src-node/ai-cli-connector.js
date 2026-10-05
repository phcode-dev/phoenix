/*
 * Copyright (c) 2021 - present core.ai
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/** Per-window CLI bridge on the existing PhNode server and nonce-path architecture. */
const fs = require("fs");
const path = require("path");
const {randomBytes, randomUUID} = require("crypto");
const WebSocket = require("ws");
const {z} = require("zod");
const {getEditorToolSpecs, getToolTimeout} = require("./ai-editor-tool-specs");
const {writeLaunchFiles} = require("./ai-cli-launch");
const {runHook, EVENTS} = require("./ai-cli-hooks");
const {CliUsage, userOwnsTelemetry} = require("./ai-cli-usage");
const {version: phoenixVersion} = require("./package.json");

const MAX_PAYLOAD = 16 * 1024 * 1024;
const callSchema = z.object({type: z.enum(["call", "hook"]), id: z.string().min(1).max(100),
    fn: z.string().min(1).max(100), args: z.record(z.string(), z.unknown())}).strict();
let browserConnector;
let controller;
let browserReady = () => true;

/** Bound an asynchronous operation without retrying side effects. */
function deadline(promise, ms) {
    let timer;
    return Promise.race([promise, new Promise((_resolve, reject) => {
        timer = setTimeout(() => reject(Object.assign(new Error("Phoenix did not respond; outcome_unknown."),
            {code: "peer_timeout"})), ms);
    })]).finally(() => clearTimeout(timer));
}

/** Owns only this window's sessions; multiple windows share no registry or transport. */
class CliConnector {
    /**
     * @param {Object} server Existing PhNode HTTP server.
     * @param {Object} options Browser call, event and readiness callbacks.
     */
    constructor(server, options) {
        this.server = server;
        this.options = options;
        this.bootId = randomUUID();
        this.endpoint = "/AIConnector" + randomBytes(32).toString("base64url");
        this.sessions = new Map();
        this.bootDirectories = new Set();
        this.wss = new WebSocket.Server({noServer: true, perMessageDeflate: false, maxPayload: MAX_PAYLOAD});
        // Usage keeps flowing whether or not the session's Phoenix tools are connected.
        this.usage = new CliUsage({
            emit: record => { if (this.options.emitUsage) { this.options.emitUsage(record); } },
            ready: () => !this.options.ready || this.options.ready(),
            baseUrl: () => "http://localhost:" + this.server.address().port,
            drainMs: this.options.usageDrainMs
        });
        this.upgrade = (request, socket, head) => {
            if (!request.url.startsWith("/AIConnector")) { return; }
            if (request.url !== this.endpoint) {
                socket.end("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n");
                return;
            }
            this.wss.handleUpgrade(request, socket, head, ws => this.accept(ws));
        };
        server.on("upgrade", this.upgrade);
    }

    /** @return {string} Local URL; never returned to the browser or placed in argv. */
    get url() {
        return "ws://localhost:" + this.server.address().port + this.endpoint;
    }

    /** Emit public session state without transport credentials. */
    emit(session, state, error) {
        if (session.enabled === false && state !== "ended") {
            state = "disabled";
            error = undefined;
        }
        session.state = state;
        this.options.emit({sessionId: session.sessionId, cli: session.cli, state,
            enabled: session.enabled !== false, connected: state === "connected", hooksReady: !!session.hooksReady, error});
    }

    /**
     * Dispatch a browser peer with trusted ownership, checked again in the browser at execution.
     * @return {Promise<Object>} Browser result.
     */
    async peer(session, fn, args, callId) {
        if (!this.sessions.has(session.sessionId)) { throw new Error("Phoenix session ended."); }
        if (session.enabled === false && !["cancelCliCall", "finishEdit"].includes(fn)) {
            throw Object.assign(new Error("Phoenix tools are disconnected. Reconnect from the Phoenix connection button."),
                {code: "connection_disabled"});
        }
        if (this.options.ready && !this.options.ready()) {
            this.emit(session, "paused", "editor_unavailable");
            throw new Error("Phoenix editor is reconnecting.");
        }
        const caller = {kind: "cli", sessionId: session.sessionId, cli: session.cli, callId,
            projectRoot: session.projectRoot};
        const result = await this.options.peer("cliBridgeCall", {fn, args, caller});
        if (result && result.code === "project_mismatch") {
            this.emit(session, "paused", "project_mismatch");
            throw Object.assign(new Error("Phoenix has a different project open; switch this CLI session first."),
                {code: "project_mismatch"});
        }
        if (fn === "getEditorContext" && session.state === "paused" && Array.from(session.sockets).some(ws =>
            ws.client === "mcp" && ws.readyState === WebSocket.OPEN)) {
            this.emit(session, "connected");
        }
        return result;
    }

    /** Remove only abandoned boot folders; a live sibling window's files must remain. */
    async sweep(root) {
        const entries = await fs.promises.readdir(root, {withFileTypes: true});
        for (const entry of entries) {
            if (!entry.isDirectory() || entry.name === this.bootId) { continue; }
            const directory = path.join(root, entry.name);
            try {
                const owner = JSON.parse(await fs.promises.readFile(path.join(directory, "owner.json"), "utf8"));
                if (!Number.isInteger(owner.pid) || owner.pid < 1) { continue; }
                try { process.kill(owner.pid, 0); } catch (error) {
                    if (error.code === "ESRCH") { await fs.promises.rm(directory, {recursive: true, force: true}); }
                }
            } catch (error) { /* Unknown folders are not ours to remove. */ }
        }
    }

    /**
     * Create private launch files; sessions expire if no terminal ever claims them.
     * @param {Object} params CLI, absolute project root, app-support directory and locale.
     * @return {Promise<Object>} Public launch contract.
     */
    async createSession(params) {
        const parsed = z.object({cli: z.enum(["claude", "codex"]), projectRoot: z.string().min(1),
            appSupportDir: z.string().min(1), locale: z.string().optional(), askUiDir: z.string().optional(),
            env: z.record(z.string(), z.string()).optional()}).parse(params);
        // The panel's launch environment (provider settings, including keys) only decides whether
        // the user already exports telemetry; it is never kept with the session.
        const {env: launchEnv, ...input} = parsed;
        if (!path.isAbsolute(input.projectRoot) || !path.isAbsolute(input.appSupportDir)) {
            throw new Error("Phoenix CLI sessions require absolute native paths.");
        }
        const root = path.join(input.appSupportDir, "ai-cli");
        await fs.promises.mkdir(root, {recursive: true, mode: 0o700});
        await this.sweep(root);
        const bootDirectory = path.join(root, this.bootId);
        await fs.promises.mkdir(bootDirectory, {recursive: true, mode: 0o700});
        await fs.promises.writeFile(path.join(bootDirectory, "owner.json"), JSON.stringify({pid: process.pid}),
            {mode: 0o600});
        this.bootDirectories.add(bootDirectory);
        const sessionId = randomUUID();
        const usage = this.usage.open(sessionId, input.cli);
        const session = Object.assign({}, input, {sessionId, phoenixVersion, url: this.url,
            usageEndpoint: userOwnsTelemetry(input.cli, {projectRoot: input.projectRoot, launchEnv}) ? null :
                usage.endpoint,
            directory: path.join(bootDirectory, sessionId), sockets: new Set(),
            createdAt: Date.now(), callCount: 0, lastCallAt: null, hooksReady: false, enabled: true,
            connectionGeneration: 0, pendingEdits: new Map(), state: "connecting"});
        this.sessions.set(sessionId, session);
        try {
            await fs.promises.mkdir(session.directory, {mode: 0o700});
            session.scratchDir = input.askUiDir;
            if (session.scratchDir) { await fs.promises.mkdir(session.scratchDir, {recursive: true}); }
            // Ask AI drafts (screenshots, long context) are written here; Claude asks before reading
            // outside its directories, so its launch lists this one too.
            if (input.cli === "claude") {
                session.draftsDir = path.join(input.appSupportDir, "ai-cli-drafts");
                await fs.promises.mkdir(session.draftsDir, {recursive: true});
            }
            const launch = await writeLaunchFiles(session);
            session.bindTimer = setTimeout(() => this.revokeSession(sessionId, "launch_timeout"), 30000);
            session.bindTimer.unref();
            this.emit(session, "connecting");
            return launch;
        } catch (error) {
            await this.revokeSession(sessionId, "launch_failed");
            throw error;
        }
    }

    /** Bind exactly one session to its PTY; the terminal owns revocation after this point. */
    bindTerminal(sessionId, terminalId) {
        const session = this.sessions.get(sessionId);
        if (!session || session.terminalId) { throw new Error("Phoenix CLI session is unavailable or already bound."); }
        session.terminalId = terminalId;
        clearTimeout(session.bindTimer);
    }

    /**
     * Disconnect or reconnect Phoenix tools without ending the CLI's terminal or launch files.
     * Hooks become no-ops while disconnected, so the CLI can continue using its own tools.
     * @param {string} sessionId Session owned by this window.
     * @param {boolean} enabled Whether Phoenix tools may run.
     * @return {Promise<Object>} Public connection state.
     */
    async setEnabled(sessionId, enabled) {
        if (typeof enabled !== "boolean") { throw new Error("Connection state must be a boolean."); }
        const session = this.sessions.get(sessionId);
        if (!session) { throw new Error("Phoenix session ended. Start a new CLI session to connect."); }
        const generation = ++session.connectionGeneration;
        session.enabled = enabled;
        if (!enabled) {
            this.emit(session, "disabled");
            await deadline(this.options.peer("endCliSessionInBrowser", {sessionId, disconnect: true}), 5000).catch(() => {});
        } else {
            this.emit(session, "connecting");
            try {
                await deadline(this.peer(session, "getEditorContext", {}, "reconnect"), 5000);
                if (this.sessions.has(sessionId) && generation === session.connectionGeneration) {
                    const connected = Array.from(session.sockets).some(ws =>
                        ws.client === "mcp" && ws.readyState === WebSocket.OPEN);
                    this.emit(session, connected ? "connected" : "connecting");
                }
            } catch (error) {
                if (this.sessions.has(sessionId) && generation === session.connectionGeneration) {
                    this.emit(session, "paused", error.code || "editor_unavailable");
                }
            }
        }
        return this.getStatus(sessionId);
    }

    /** End only this session's outstanding interactive call. */
    cancelCall(session, callId) {
        this.peer(session, "cancelCliCall", {callId}, callId).catch(() => {});
    }

    /** Validate, execute once and return an MCP result or hook response. */
    async execute(session, frame) {
        session.lastCallAt = Date.now();
        session.callCount++;
        const peer = (fn, args) => this.peer(session, fn, args, frame.id);
        if (frame.type === "hook") {
            if (!EVENTS.has(frame.fn) || frame.args.hook_event_name !== frame.fn) {
                throw new Error("Unsupported Phoenix hook event.");
            }
            // Codex telemetry has no prompt id: a submitted prompt is its turn, connected or not.
            if (frame.fn === "UserPromptSubmit" && session.cli === "codex" && !frame.args.agent_id) {
                this.usage.recordTurn(session.sessionId, frame.args.turn_id);
            }
            const editId = frame.args.tool_use_id;
            const preparing = frame.fn === "PreToolUse" && editId &&
                ["Edit", "MultiEdit", "Write", "apply_patch"].includes(frame.args.tool_name);
            const finishing = ["PostToolUse", "PostToolUseFailure"].includes(frame.fn) &&
                session.pendingEdits.has(editId);
            if (session.enabled === false && !finishing) { return {}; }
            if (preparing) {
                // Keep only the bounded lifetime of the browser's edit reservations.
                for (const [id, at] of session.pendingEdits) {
                    if (Date.now() - at > 10 * 60 * 1000) { session.pendingEdits.delete(id); }
                }
                session.pendingEdits.set(editId, Date.now());
            }
            let result;
            try {
                result = await deadline(runHook(session, frame.args, peer), frame.fn === "PreToolUse" ? 20000 : 8000);
                if (preparing && result.hookSpecificOutput && result.hookSpecificOutput.permissionDecision === "deny") {
                    session.pendingEdits.delete(editId);
                }
            } finally {
                if (finishing) { session.pendingEdits.delete(editId); }
            }
            if (session.state === "connected") { this.emit(session, "connected"); }
            return result;
        }
        if (session.enabled === false) {
            throw Object.assign(new Error("Phoenix tools are disconnected. Reconnect from the Phoenix connection button."),
                {code: "connection_disabled"});
        }
        const spec = getEditorToolSpecs(peer, {cli: true}).find(item => item.name === frame.fn);
        if (!spec) { throw Object.assign(new Error("Unknown Phoenix tool."), {code: "unknown_fn"}); }
        const args = z.object(spec.inputSchema).strict().parse(frame.args);
        const timeoutMs = getToolTimeout(spec.name, args);
        try {
            return await deadline(spec.handler(args), timeoutMs);
        } finally {
            if (spec.name === "askInLivePreview") { this.cancelCall(session, frame.id); }
        }
    }

    /** Accept the existing secret-path credential, then bind a non-secret session UUID. */
    accept(ws) {
        let session;
        let active = 0;
        const queue = [];
        const ownedCalls = new Set();
        const helloTimer = setTimeout(() => ws.close(4001, "Session hello required"), 2000);
        const send = value => {
            if (ws.readyState === WebSocket.OPEN) { ws.send(JSON.stringify(value)); }
        };
        const run = async frame => {
            active++;
            ownedCalls.add(frame.id);
            try {
                const data = await this.execute(session, frame);
                send({type: "result", id: frame.id, ok: true, data});
            } catch (error) {
                send({type: "result", id: frame.id, ok: false,
                    error: {code: error.code || "call_failed", message: error.message}});
            } finally {
                active--;
                ownedCalls.delete(frame.id);
                if (queue.length && ws.readyState === WebSocket.OPEN) { run(queue.shift()); }
            }
        };
        ws.on("error", () => {});
        ws.on("message", async (raw, binary) => {
            let frame;
            try {
                if (binary) { throw new Error("Text frames required"); }
                frame = JSON.parse(raw.toString());
                if (!session) {
                    const hello = z.object({type: z.literal("hello"), version: z.literal(1), sessionId: z.string().uuid(),
                        client: z.enum(["mcp", "hook"])}).strict().parse(frame);
                    const found = this.sessions.get(hello.sessionId);
                    if (!found || found.sockets.size >= 4) { ws.close(4001, "Session unavailable"); return; }
                    session = found;
                    ws.client = hello.client;
                    session.sockets.add(ws);
                    clearTimeout(helloTimer);
                    send({type: "hello", version: 1, generation: randomUUID()});
                    if (ws.client === "mcp") {
                        try {
                            await deadline(this.peer(session, "getEditorContext", {}, "ready"), 5000);
                            if (this.sessions.has(session.sessionId) && ws.readyState === WebSocket.OPEN) {
                                this.emit(session, "connected");
                            }
                        } catch (error) { this.emit(session, "paused", error.code || "editor_unavailable"); }
                    }
                    return;
                }
                if (frame.type === "cancel" && typeof frame.id === "string") {
                    const index = queue.findIndex(item => item.id === frame.id);
                    if (index >= 0) { queue.splice(index, 1); }
                    if (ownedCalls.has(frame.id)) { this.cancelCall(session, frame.id); }
                    return;
                }
                const call = callSchema.parse(frame);
                if (ownedCalls.has(call.id) || queue.some(item => item.id === call.id)) {
                    throw new Error("Duplicate call id");
                }
                if (active < 4) { run(call); } else if (queue.length < 16) { queue.push(call); } else {
                    send({type: "result", id: call.id, ok: false,
                        error: {code: "busy", message: "Phoenix is busy; try again after the current calls finish."}});
                }
            } catch (error) { ws.close(4002, "Invalid Phoenix message"); }
        });
        ws.on("close", () => {
            clearTimeout(helloTimer);
            queue.length = 0;
            if (!session) { return; }
            session.sockets.delete(ws);
            for (const id of ownedCalls) { this.cancelCall(session, id); }
            if (this.sessions.has(session.sessionId) && !Array.from(session.sockets).some(item => item.client === "mcp")) {
                this.emit(session, "connecting");
            }
        });
    }

    /** Route HTTP hooks on the same endpoint; return false for unrelated app requests. */
    handleRequest(request, response) {
        if (this.usage.handleRequest(request, response)) { return true; }
        if (!request.url.startsWith("/AIConnector")) { return false; }
        const session = this.sessions.get(request.headers["x-phoenix-session"]);
        if (request.url !== this.endpoint + "/hook" || request.method !== "POST" || !session) {
            response.writeHead(404); response.end(); return true;
        }
        let input = "";
        request.on("data", chunk => {
            input += chunk;
            if (Buffer.byteLength(input) > 2 * 1024 * 1024) { request.destroy(); }
        });
        request.on("end", async () => {
            let hook;
            try {
                hook = JSON.parse(input);
                const result = await this.execute(session, {type: "hook", id: randomUUID(),
                    fn: hook.hook_event_name, args: hook});
                response.writeHead(200, {"Content-Type": "application/json"});
                response.end(JSON.stringify(result));
            } catch (error) {
                // Context is optional; a failed prepare must stop the native edit.
                const result = hook && hook.hook_event_name === "PreToolUse"
                    ? {hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny",
                        permissionDecisionReason: "Phoenix could not synchronize the editor. Save or reconnect first."}} : {};
                response.writeHead(200, {"Content-Type": "application/json"});
                response.end(JSON.stringify(result));
            }
        });
        return true;
    }

    /** Revoke access before cleanup; repeated calls are harmless. */
    async revokeSession(sessionId, reason = "stopped") {
        const session = this.sessions.get(sessionId);
        if (!session) { return; }
        this.sessions.delete(sessionId);
        this.usage.close(sessionId);
        clearTimeout(session.bindTimer);
        for (const ws of session.sockets) {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({type: "event", name: "sessionEnded", data: {reason}}));
                ws.close(4001, "Session ended");
            }
        }
        this.options.peer("endCliSessionInBrowser", {sessionId}).catch(() => {});
        this.emit(session, "ended");
        await fs.promises.rm(session.directory, {recursive: true, force: true});
    }

    /** Public state deliberately excludes the endpoint and session-file content. */
    getStatus(sessionId) {
        const session = this.sessions.get(sessionId);
        return session ? {state: session.state, connected: session.state === "connected", hooksReady: session.hooksReady,
            enabled: session.enabled !== false,
            adapterVersion: 1, lastCallAt: session.lastCallAt, callCount: session.callCount}
            : {state: "ended", connected: false, hooksReady: false};
    }

    /** Stop sockets and remove only this boot's files, including on process exit. */
    close() {
        this.server.removeListener("upgrade", this.upgrade);
        this.usage.closeAll();
        for (const session of this.sessions.values()) {
            clearTimeout(session.bindTimer);
            for (const ws of session.sockets) { ws.terminate(); }
        }
        this.sessions.clear();
        this.wss.close();
        for (const directory of this.bootDirectories) {
            try { fs.rmSync(directory, {recursive: true, force: true}); } catch (error) { /* Boot sweep retries. */ }
        }
    }
}

/** Set the existing ph_ai_claude transport without creating a second browser connection. */
exports.setBrowserConnector = function (connector, ready) { browserConnector = connector; browserReady = ready; };
/** Attach exactly once to the window's existing HTTP server. */
exports.attach = function (server) {
    controller = new CliConnector(server, {peer: (fn, args) => browserConnector.execPeer(fn, args),
        emitUsage: record => browserConnector.triggerPeer("aiCliUsage", record),
        ready: () => browserReady(), emit: state => browserConnector.triggerPeer("aiCliConnectorState", state)});
};
exports.handleRequest = (request, response) => controller && controller.handleRequest(request, response);
exports.createSession = params => controller.createSession(params);
exports.revokeSession = (sessionId, reason) => controller && controller.revokeSession(sessionId, reason);
exports.bindTerminal = (sessionId, terminalId) => controller.bindTerminal(sessionId, terminalId);
exports.getStatus = sessionId => controller ? controller.getStatus(sessionId) : {connected: false, state: "ended"};
exports.setEnabled = (sessionId, enabled) => controller.setEnabled(sessionId, enabled);
exports.close = () => { if (controller) { controller.close(); } };
exports.CliConnector = CliConnector;
