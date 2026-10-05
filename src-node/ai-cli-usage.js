/*
 * Copyright (c) 2021 - present core.ai
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Token and cost usage of the CLI sessions the AI panel launches, taken from the CLIs' own
 * OpenTelemetry log export to a local OTLP/HTTP JSON endpoint on the PhNode server.
 *
 * Every session exports to its own unguessable path, so a record is attributed by where it
 * arrives, never by what it claims. Only usage figures leave this module: every other event,
 * attribute and payload is dropped unread, and nothing received is ever logged. A user who
 * already sends a CLI's telemetry somewhere keeps that: Phoenix then adds no export settings and
 * simply has no usage for that session.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const {randomBytes, createHash} = require("crypto");
const {estimateCodexCost} = require("./ai-cli-pricing");

const PREFIX = "/AICliUsage/";
const LOGS_PATH = "/v1/logs";
const MAX_BODY = 4 * 1024 * 1024;
// A CLI flushes its last batch as it exits, after the panel has already ended the session.
const DRAIN_MS = 30000;
// Retried exports repeat records; remember this many per session to drop the repeats.
const SEEN_LIMIT = 5000;
// Records held while the editor is reloading, delivered once it is back; the oldest go first
// past this bound.
const BACKLOG_LIMIT = 2000;
const BACKLOG_RETRY_MS = 2000;
const EXPORT_INTERVAL_MS = 2000;
// The largest time a JS Date can hold.
const MAX_TIME_MS = 8.64e15;

/** @return {*} The plain value of an OTLP JSON AnyValue (int64 arrives as a string). */
function plain(value) {
    if (!value || typeof value !== "object") { return undefined; }
    if ("stringValue" in value) { return value.stringValue; }
    if ("intValue" in value) { return Number(value.intValue); }
    if ("doubleValue" in value) { return Number(value.doubleValue); }
    if ("boolValue" in value) { return !!value.boolValue; }
    return undefined;
}

/** @return {Array} value when it is an array, otherwise nothing to iterate. */
function arrayOf(value) {
    return Array.isArray(value) ? value : [];
}

/** @return {Object} An OTLP attribute list as a map of plain values. */
function attributeMap(list) {
    const map = Object.create(null);
    for (const entry of Array.isArray(list) ? list : []) {
        if (entry && typeof entry.key === "string") { map[entry.key] = plain(entry.value); }
    }
    return map;
}

/** @return {number} A non-negative whole token count, 0 for anything else. */
function count(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

/** @return {?string} A bounded model identifier, preserving provider and snapshot suffixes. */
function modelId(value) {
    return typeof value === "string" && value.length <= 200 && /^[a-zA-Z0-9][a-zA-Z0-9._:/@\[\]-]*$/.test(value) ?
        value : null;
}

/** @return {number} Milliseconds of a record's own time, so a batch after midnight keeps its day. */
function recordTime(record, attrs) {
    const valid = ms => Number.isFinite(ms) && ms > 0 && ms <= MAX_TIME_MS;
    // Codex leaves timeUnixNano at "0" and stamps observedTimeUnixNano instead.
    for (const nanos of [record.timeUnixNano, record.observedTimeUnixNano]) {
        if ((typeof nanos === "string" || typeof nanos === "number") && /^\d+$/.test(String(nanos))) {
            // Dropping six digits is an exact integer division, beyond what a double holds in nanoseconds.
            const ms = Number(String(nanos).slice(0, -6));
            if (valid(ms)) { return ms; }
        }
    }
    const iso = Date.parse(attrs["event.timestamp"]);
    return valid(iso) ? iso : Date.now();
}

function fingerprint(parts) {
    return createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 32);
}

/**
 * Claude Code's per-request event. Its input excludes cache reads and writes, so the four
 * kinds are already disjoint; the cost is the CLI's own estimate at API list price.
 * @return {?Object} Normalized usage, or null for any other record.
 */
function claudeUsage(record, attrs) {
    const body = plain(record.body);
    if (attrs["event.name"] !== "api_request" && body !== "claude_code.api_request") { return null; }
    const usage = {
        model: modelId(attrs.model),
        input: count(attrs.input_tokens),
        output: count(attrs.output_tokens),
        cacheRead: count(attrs.cache_read_tokens),
        cacheWrite: count(attrs.cache_creation_tokens),
        costUSD: Number.isFinite(Number(attrs.cost_usd)) ? Math.max(0, Number(attrs.cost_usd)) : 0,
        at: recordTime(record, attrs),
        promptId: typeof attrs["prompt.id"] === "string" ? attrs["prompt.id"] : null
    };
    usage.key = typeof attrs.request_id === "string" && attrs.request_id ? attrs.request_id :
        fingerprint([attrs["session.id"], attrs["event.sequence"], usage.at, usage.input, usage.output]);
    return usage;
}

/**
 * Codex's completed-response event. Its input count includes cached tokens and its output
 * includes reasoning, so cached (and cache-write) tokens come out of input and reasoning is not
 * added again. Cost is estimated from the reported model. The same event also arrives without counts; only the
 * one that carries them is usage.
 * @return {?Object} Normalized usage, or null for any other record.
 */
function codexUsage(record, attrs) {
    const name = attrs["event.name"] || plain(record.body);
    if (name !== "codex.sse_event" && name !== "sse_event") { return null; }
    if (attrs["event.kind"] !== "response.completed" || attrs.input_token_count === undefined ||
            attrs.output_token_count === undefined) {
        return null;
    }
    const cacheRead = count(attrs.cached_token_count);
    const cacheWrite = count(attrs.cache_write_token_count);
    // Assumed, not yet observed: Codex counts cache writes inside input the way it counts cached
    // reads. Every probe so far reported 0 cache writes, so a nonzero value is unverified.
    const usage = {
        model: modelId(attrs.model),
        input: Math.max(0, count(attrs.input_token_count) - cacheRead - cacheWrite),
        output: count(attrs.output_token_count),
        cacheRead: cacheRead,
        cacheWrite: cacheWrite,
        costUSD: null,
        at: recordTime(record, attrs),
        promptId: null
    };
    usage.costUSD = estimateCodexCost(usage.model, usage);
    // No request id: the nanosecond stamp tells two identical responses apart, and a retried
    // export repeats it, so the retry is dropped.
    usage.key = fingerprint([attrs["conversation.id"], attrs["event.timestamp"], record.timeUnixNano,
        record.observedTimeUnixNano, attrs.input_token_count, attrs.output_token_count, attrs.cached_token_count,
        attrs.cache_write_token_count, attrs.reasoning_token_count, usage.model]);
    return usage;
}

/** @return {Object} Settings-file "env" blocks a CLI reads, or an empty object. */
function settingsEnv(file) {
    try {
        const settings = JSON.parse(fs.readFileSync(file, "utf8"));
        return settings && settings.env && typeof settings.env === "object" ? settings.env : {};
    } catch (error) {
        return {};
    }
}

function managedClaudeSettings(platform) {
    if (platform === "darwin") { return "/Library/Application Support/ClaudeCode/managed-settings.json"; }
    if (platform === "win32") { return "C:\\ProgramData\\ClaudeCode\\managed-settings.json"; }
    return "/etc/claude-code/managed-settings.json";
}

const telemetryKey = key => /^OTEL_/.test(key) || key === "CLAUDE_CODE_ENABLE_TELEMETRY";

/**
 * Whether the user already configures this CLI's OpenTelemetry. Claude Code merges settings
 * env over the process env key by key, so any of the user's keys could mix with Phoenix's and
 * send data to the user's collector that they never asked for: Phoenix stays out entirely.
 * @param {string} cli "claude" or "codex".
 * @param {Object} [where] {env, launchEnv, home, projectRoot, platform, managedSettings}: env
 *     defaults to this process's; launchEnv is what the panel adds to the CLI's environment
 *     (provider settings); managedSettings replaces the platform's managed-settings path.
 * @return {boolean}
 */
function userOwnsTelemetry(cli, where = {}) {
    const env = Object.assign({}, where.env || process.env, where.launchEnv || {});
    const home = where.home || os.homedir();
    if (cli === "claude") {
        const configDir = env.CLAUDE_CONFIG_DIR || path.join(home, ".claude");
        const files = [path.join(configDir, "settings.json"),
            where.managedSettings || managedClaudeSettings(where.platform || process.platform)];
        if (where.projectRoot) {
            files.push(path.join(where.projectRoot, ".claude", "settings.json"),
                path.join(where.projectRoot, ".claude", "settings.local.json"));
        }
        return Object.keys(env).some(telemetryKey) ||
            files.some(file => Object.keys(settingsEnv(file)).some(telemetryKey));
    }
    const files = [path.join(env.CODEX_HOME || path.join(home, ".codex"), "config.toml")];
    if (where.projectRoot) { files.push(path.join(where.projectRoot, ".codex", "config.toml")); }
    return files.some(file => {
        let config;
        try { config = fs.readFileSync(file, "utf8"); } catch (error) { return false; }
        // Any otel table or key, top level or inside a profile: [otel], [profiles.work.otel.exporter],
        // otel = {...}, profiles.work.otel.exporter = ... A mention in a comment errs towards leaving it alone.
        return /^\s*\[(?:[^\]\n]*?[.\s])?\s*"?otel"?\s*[.\]]/m.test(config) ||
            /^\s*(?:[^=\n[]*\.)?\s*"?otel"?\s*[.=]/m.test(config);
    });
}

/** One window's collector; PhNode routes its HTTP requests here. */
class CliUsage {
    /**
     * @param {{emit: function(Object), baseUrl: function(): string, ready?: function(): boolean,
     *     drainMs?: number}} options - ready says whether the editor can take records now
     */
    constructor(options) {
        this.options = options;
        this.drainMs = options.drainMs === undefined ? DRAIN_MS : options.drainMs;
        this.byToken = new Map();
        this.bySession = new Map();
        this.backlog = [];
        this.retryTimer = null;
    }

    /** Deliver a record now, or hold it until the editor is back. */
    _deliver(record) {
        if (this.backlog.length || (this.options.ready && !this.options.ready())) {
            this.backlog.push(record);
            if (this.backlog.length > BACKLOG_LIMIT) { this.backlog.shift(); }
            this._scheduleFlush();
            return;
        }
        this.options.emit(record);
    }

    _scheduleFlush() {
        if (this.retryTimer) { return; }
        this.retryTimer = setTimeout(() => {
            this.retryTimer = null;
            this.flush();
        }, BACKLOG_RETRY_MS);
        this.retryTimer.unref();
    }

    /** Hand over what was held while the editor was away. */
    flush() {
        if (this.options.ready && !this.options.ready()) {
            if (this.backlog.length) { this._scheduleFlush(); }
            return;
        }
        const held = this.backlog;
        this.backlog = [];
        for (const record of held) { this.options.emit(record); }
    }

    /**
     * Give a session its own export endpoint.
     * @param {string} sessionId
     * @param {string} cli
     * @return {{token: string, endpoint: string}} The endpoint is the OTLP base URL; Codex takes
     *     it with "/v1/logs" appended.
     */
    open(sessionId, cli) {
        const token = randomBytes(32).toString("base64url");
        const entry = {sessionId, cli, token, seen: new Set(), prompts: new Set(), turns: new Set(), closeTimer: null};
        this.byToken.set(token, entry);
        this.bySession.set(sessionId, entry);
        return {token, endpoint: this.options.baseUrl() + PREFIX + token};
    }

    /** Keep taking the session's final export for a short while, then forget it. */
    close(sessionId) {
        const entry = this.bySession.get(sessionId);
        if (!entry || entry.closeTimer) { return; }
        const forget = () => {
            this.byToken.delete(entry.token);
            if (this.bySession.get(sessionId) === entry) { this.bySession.delete(sessionId); }
        };
        if (this.drainMs <= 0) { forget(); return; }
        entry.closeTimer = setTimeout(forget, this.drainMs);
        entry.closeTimer.unref();
    }

    /** Forget every session at once (PhNode exit). */
    closeAll() {
        clearTimeout(this.retryTimer);
        this.retryTimer = null;
        for (const entry of this.byToken.values()) { clearTimeout(entry.closeTimer); }
        this.byToken.clear();
        this.bySession.clear();
    }

    _remember(set, key) {
        if (set.has(key)) { return false; }
        set.add(key);
        if (set.size > SEEN_LIMIT) { set.delete(set.values().next().value); }
        return true;
    }

    _emit(entry, usage, turns) {
        this._deliver({
            sessionId: entry.sessionId,
            cli: entry.cli,
            model: usage.model || null,
            eventId: entry.cli + ":" + usage.key,
            at: usage.at,
            input: usage.input,
            output: usage.output,
            cacheRead: usage.cacheRead,
            cacheWrite: usage.cacheWrite,
            costUSD: usage.costUSD,
            turns: turns
        });
    }

    /**
     * Count a user prompt for a CLI whose telemetry carries no prompt id (Codex), from its
     * UserPromptSubmit hook. Runs whether or not the session's Phoenix tools are connected.
     */
    recordTurn(sessionId, turnId) {
        const entry = this.bySession.get(sessionId);
        if (!entry || !turnId || !this._remember(entry.turns, String(turnId))) { return; }
        this._emit(entry, {key: "turn:" + fingerprint([String(turnId)]), at: Date.now(), input: 0, output: 0,
            cacheRead: 0, cacheWrite: 0, costUSD: entry.cli === "codex" ? null : 0}, 1);
    }

    /**
     * Take one OTLP JSON logs export for the session that owns token.
     * @return {number} How many usage records it produced.
     */
    ingest(token, payload) {
        const entry = this.byToken.get(token);
        if (!entry || !payload || !Array.isArray(payload.resourceLogs)) { return 0; }
        let produced = 0;
        // Any shape can arrive here; anything that is not the documented one is skipped.
        for (const resource of payload.resourceLogs) {
            for (const scope of arrayOf(resource && resource.scopeLogs)) {
                for (const record of arrayOf(scope && scope.logRecords)) {
                    if (!record || typeof record !== "object") { continue; }
                    const attrs = attributeMap(record.attributes);
                    const usage = entry.cli === "claude" ? claudeUsage(record, attrs) : codexUsage(record, attrs);
                    if (!usage || !this._remember(entry.seen, usage.key)) { continue; }
                    // A Claude prompt is one turn however many requests it takes.
                    const turns = usage.promptId && this._remember(entry.prompts, usage.promptId) ? 1 : 0;
                    this._emit(entry, usage, turns);
                    produced++;
                }
            }
        }
        return produced;
    }

    /** @return {boolean} Whether the request was for this collector (answered here either way). */
    handleRequest(request, response) {
        if (!request.url.startsWith(PREFIX)) { return false; }
        const rest = request.url.slice(PREFIX.length);
        const slash = rest.indexOf("/");
        const token = slash > 0 ? rest.slice(0, slash) : "";
        const finish = (status, body) => {
            if (response.headersSent) { return; }
            response.writeHead(status, body ? {"Content-Type": "application/json"} : {});
            response.end(body || undefined);
        };
        if (request.method !== "POST" || rest.slice(slash) !== LOGS_PATH || !this.byToken.has(token)) {
            request.resume();
            finish(404);
            return true;
        }
        const chunks = [];
        let size = 0;
        let refused = false;
        request.on("data", chunk => {
            size += chunk.length;
            if (size > MAX_BODY) {
                refused = true;
                // The socket goes with the request, so tell the exporter not to reuse it.
                response.setHeader("Connection", "close");
                finish(413);
                request.destroy();
                return;
            }
            chunks.push(chunk);
        });
        request.on("end", () => {
            if (refused) { return; }
            let payload = null;
            try { payload = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch (error) { payload = null; }
            if (!payload) {
                finish(400);
                return;
            }
            try {
                this.ingest(token, payload);
            } catch (error) {
                // Never let one bad export take PhNode down; the CLI drops a rejected batch.
                finish(400);
                return;
            }
            // An empty ExportLogsServiceResponse: accepted, nothing rejected.
            finish(200, "{}");
        });
        request.on("error", () => finish(400));
        return true;
    }
}

/**
 * Per-launch export settings for a session, or nothing when the user's own telemetry
 * configuration must be left alone.
 * @param {string} cli
 * @param {?string} endpoint The session's OTLP base URL.
 * @return {{env: Object, args: Array<string>}}
 */
function launchSettings(cli, endpoint) {
    if (!endpoint) { return {env: {}, args: []}; }
    if (cli === "claude") {
        // Process environment only: a user's settings files override these key by key.
        return {env: {
            CLAUDE_CODE_ENABLE_TELEMETRY: "1",
            OTEL_LOGS_EXPORTER: "otlp",
            OTEL_METRICS_EXPORTER: "none",
            OTEL_EXPORTER_OTLP_PROTOCOL: "http/json",
            OTEL_EXPORTER_OTLP_ENDPOINT: endpoint,
            OTEL_LOGS_EXPORT_INTERVAL: String(EXPORT_INTERVAL_MS)
        }, args: []};
    }
    return {env: {}, args: ["-c", "otel.exporter={otlp-http={endpoint=" + JSON.stringify(endpoint + LOGS_PATH) +
        ",protocol=\"json\"}}"]};
}

exports.CliUsage = CliUsage;
exports.userOwnsTelemetry = userOwnsTelemetry;
exports.launchSettings = launchSettings;
exports.claudeUsage = claudeUsage;
exports.codexUsage = codexUsage;
exports.attributeMap = attributeMap;
exports.PREFIX = PREFIX;
