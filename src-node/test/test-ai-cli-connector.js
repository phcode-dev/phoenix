/*
 * Copyright (c) 2021 - present core.ai
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/** Bounded offline fixtures; each scenario is a separate registered Jasmine result. */
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const {once} = require("events");
const WebSocket = require("ws");
const {Client} = require("@modelcontextprotocol/sdk/client/index.js");
const {StdioClientTransport} = require("@modelcontextprotocol/sdk/client/stdio.js");
const AgentSDK = require("@anthropic-ai/claude-agent-sdk");
const {CliConnector} = require("../ai-cli-connector");
const {CliConnection, readSession} = require("../ai-cli-connection");
const {getEditorToolSpecs, getToolTimeout} = require("../ai-editor-tool-specs");
const {createEditorMcpServer} = require("../mcp-editor-tools");
const {buildSystemPrompt, buildEditorContextLine} = require("../ai-system-prompt");
const {runHook} = require("../ai-cli-hooks");
const {hookCommand} = require("../ai-cli-launch");
const {checkCodexServers} = require("../ai-cli-capabilities");
const {CliUsage, userOwnsTelemetry, launchSettings} = require("../ai-cli-usage");
const {spawnCli} = require("../cli-locator");
const NodeConnector = require("../node-connector");

NodeConnector.createNodeConnector("ph_test_ai_cli_connector", exports);

/** Capture a rejection as data, preserving its code for Jasmine assertions. */
async function outcome(promise) {
    try { return {value: await promise}; } catch (error) { return {error: error.message, code: error.code}; }
}

/** An OTLP JSON attribute list from a plain object; numbers as the int64 strings exporters send. */
function otlpAttributes(values) {
    return Object.keys(values).map(key => {
        const value = values[key];
        if (typeof value === "number") {
            return {key, value: Number.isInteger(value) ? {intValue: String(value)} : {doubleValue: value}};
        }
        return {key, value: {stringValue: value}};
    });
}

/** One OTLP JSON logs export holding the given log records. */
function otlpLogs(records) {
    return {resourceLogs: [{resource: {attributes: otlpAttributes({"service.name": "fixture"})},
        scopeLogs: [{scope: {name: "fixture"}, logRecords: records}]}]};
}

function claudeRequest(requestId, promptId, extra) {
    return {timeUnixNano: "1791142947867000000", body: {stringValue: "claude_code.api_request"},
        attributes: otlpAttributes(Object.assign({"event.name": "api_request", "session.id": "cli-session",
            "prompt.id": promptId, model: "claude-sonnet-4-5", input_tokens: 1001, output_tokens: 100,
            cache_read_tokens: 3003, cache_creation_tokens: 2002, cost_usd: 0.0151614, request_id: requestId,
            query_source: "repl_main_thread"}, extra || {}))};
}

/** A Codex completed response; the counted one mixes string and int64 values as Codex does. */
function codexCompleted(observed, counted) {
    const attributes = [{key: "event.name", value: {stringValue: "codex.sse_event"}},
        {key: "event.kind", value: {stringValue: "response.completed"}},
        {key: "event.timestamp", value: {stringValue: "2026-10-04T19:43:00.556Z"}},
        {key: "conversation.id", value: {stringValue: "conversation-1"}}];
    if (counted) {
        attributes.push({key: "input_token_count", value: {stringValue: "100"}},
            {key: "output_token_count", value: {stringValue: "40"}},
            {key: "cached_token_count", value: {intValue: "30"}},
            {key: "cache_write_token_count", value: {intValue: "0"}},
            {key: "reasoning_token_count", value: {intValue: "10"}});
    }
    return {timeUnixNano: "0", observedTimeUnixNano: observed, body: null, attributes};
}

/** A priced completion using the native fixture shape, with request-specific attributes. */
function pricedCompletion(observed, values) {
    const record = codexCompleted(observed, true);
    record.attributes.push(...otlpAttributes(values));
    return record;
}

/** POST a body to a local collector and read the reply, or the socket error code. */
function post(port, urlPath, body, method) {
    return new Promise(resolve => {
        const request = http.request({host: "localhost", port, path: urlPath, method: method || "POST",
            headers: {"Content-Type": "application/json"}}, response => {
            let text = "";
            response.on("data", chunk => { text += chunk; });
            response.on("end", () => resolve({status: response.statusCode, body: text}));
        });
        request.on("error", error => resolve({status: error.code}));
        request.end(body);
    });
}

/** Usage collector fixtures; none of them need a connector session or the browser. */
async function exerciseUsage(scenario) {
    const emitted = [];
    let ready = true;
    const usage = new CliUsage({emit: record => emitted.push(record), ready: () => ready,
        baseUrl: () => "http://localhost:1", drainMs: scenario === "usage-http" ? 0 : 60000});
    if (scenario === "usage-claude") {
        const {token} = usage.open("claude-session", "claude");
        usage.ingest(token, otlpLogs([claudeRequest("req-1", "prompt-1"), claudeRequest("req-2", "prompt-1"),
            claudeRequest("req-1", "prompt-1"),
            {timeUnixNano: "1791142947867000000", body: {stringValue: "claude_code.user_prompt"},
                attributes: otlpAttributes({"event.name": "user_prompt", prompt_length: 12})},
            claudeRequest("req-3", "prompt-2", {query_source: "agent:builtin:general-purpose",
                model: "claude-haiku-4-5-20251001"})]));
        const unknown = usage.ingest("not-a-session", otlpLogs([claudeRequest("req-9", "prompt-9")]));
        usage.closeAll();
        return {emitted, unknown};
    }
    if (scenario === "usage-codex") {
        const {token} = usage.open("codex-session", "codex");
        // The cache-write record pins an assumption no real Codex response has confirmed yet:
        // cache_write_token_count is included in input_token_count, like cached_token_count.
        const writing = codexCompleted("1791142980600000000", true);
        writing.attributes.find(item => item.key === "cache_write_token_count").value = {intValue: "20"};
        usage.ingest(token, otlpLogs([codexCompleted("1791142980556899047", false),
            codexCompleted("1791142980557236807", true), codexCompleted("1791142980557236807", true), writing]));
        usage.recordTurn("codex-session", "turn-1");
        usage.recordTurn("codex-session", "turn-1");
        usage.recordTurn("codex-session", "");
        usage.closeAll();
        return {emitted};
    }
    if (scenario === "usage-pricing") {
        const {token} = usage.open("codex-session", "codex");
        const sol = pricedCompletion("1791142980557236807", {model: "gpt-6-sol", cache_write_token_count: 20});
        const astra = pricedCompletion("1791142980657236807", {model: "gpt-6-astra", cache_write_token_count: 20});
        usage.ingest(token, otlpLogs([sol, astra, sol]));
        usage.closeAll();
        return {emitted};
    }
    if (scenario === "usage-pricing-long") {
        const {token} = usage.open("codex-session", "codex");
        usage.ingest(token, otlpLogs([272000, 272001].map((tokens, index) =>
            pricedCompletion(String(1791142980000 + index) + "000000", {model: "gpt-6-sol",
                input_token_count: tokens, cached_token_count: 72000, output_token_count: 1000}))));
        usage.closeAll();
        return {emitted};
    }
    if (scenario === "usage-pricing-unknown") {
        const {token} = usage.open("codex-session", "codex");
        usage.ingest(token, otlpLogs(["gpt-future", "gpt-6-sol-new", "gpt-5.3-codex", " ", "x".repeat(201)]
            .map((model, index) => pricedCompletion(String(1791142980000 + index) + "000000",
                {model, cache_write_token_count: 20}))));
        usage.closeAll();
        return {emitted};
    }
    if (scenario === "usage-malformed") {
        const {token} = usage.open("claude-session", "claude");
        const shapes = [{resourceLogs: [{scopeLogs: {}}]}, {resourceLogs: [null, 5, "x", {scopeLogs: "x"}]},
            {resourceLogs: [{scopeLogs: [null, 3, {logRecords: {}}, {logRecords: [null, 7, "x", {attributes: {}},
                {attributes: [null, {key: 5}, {key: "event.name"}]}]}]}]}, {resourceLogs: {}}, [], "x", null];
        const thrown = [];
        const produced = shapes.map(shape => {
            try { return usage.ingest(token, shape); } catch (error) { thrown.push(String(error)); return -1; }
        });
        // Out-of-range stamps fall back to the event time, then to now, never to an invalid date.
        const before = Date.now();
        usage.ingest(token, otlpLogs([Object.assign(claudeRequest("req-huge", "prompt-1"),
            {timeUnixNano: "9".repeat(40), observedTimeUnixNano: "1".repeat(400)})]));
        const after = Date.now();
        const at = emitted.length === 1 ? emitted[0].at : null;
        usage.closeAll();
        return {produced, thrown, emitted: emitted.length, atInRange: at >= before && at <= after};
    }
    if (scenario === "usage-backlog") {
        const {token} = usage.open("claude-session", "claude");
        ready = false;
        usage.ingest(token, otlpLogs([claudeRequest("req-1", "prompt-1")]));
        const whileAway = emitted.length;
        ready = true;
        usage.flush();
        usage.closeAll();
        return {whileAway, after: emitted.length, eventId: emitted[0] && emitted[0].eventId};
    }
    // usage-http: the collector behind a real HTTP server, answering only its own paths.
    const server = http.createServer((req, res) => {
        if (!usage.handleRequest(req, res)) { res.writeHead(418); res.end(); }
    });
    await new Promise(resolve => server.listen(0, "localhost", resolve));
    const port = server.address().port;
    try {
        const {token} = usage.open("claude-session", "claude");
        const logs = "/AICliUsage/" + token + "/v1/logs";
        const accepted = await post(port, logs, JSON.stringify(otlpLogs([claudeRequest("req-1", "prompt-1")])));
        const metrics = await post(port, "/AICliUsage/" + token + "/v1/metrics", "{}");
        const unknown = await post(port, "/AICliUsage/not-a-token/v1/logs", "{}");
        const read = await post(port, logs, undefined, "GET");
        const malformed = await post(port, logs, "not json");
        const misshapen = await post(port, logs, JSON.stringify({resourceLogs: [{scopeLogs: {}}]}));
        // A refused upload may surface as the 413 or as the reset that follows it, depending on timing.
        const oversize = await post(port, logs, "x".repeat(4 * 1024 * 1024 + 16));
        const afterOversize = await post(port, logs, JSON.stringify(otlpLogs([claudeRequest("req-1", "prompt-1")])));
        const other = await post(port, "/somewhere-else", "{}");
        usage.close("claude-session");
        const afterClose = await post(port, logs, JSON.stringify(otlpLogs([claudeRequest("req-2", "prompt-1")])));
        return {accepted, metrics: metrics.status, unknown: unknown.status, read: read.status,
            malformed: malformed.status, misshapen: misshapen.status, oversize: oversize.status,
            afterOversize: afterOversize.status,
            other: other.status,
            afterClose: afterClose.status, emitted: emitted.length};
    } finally {
        usage.closeAll();
        server.close();
    }
}

/** Telemetry-ownership checks against throwaway homes and projects only. */
async function exerciseUsageLaunch() {
    const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "phoenix-usage-"));
    const managedSettings = path.join(directory, "managed-settings.json");
    const make = async (relative, text) => {
        const file = path.join(directory, relative);
        await fs.promises.mkdir(path.dirname(file), {recursive: true});
        await fs.promises.writeFile(file, text);
    };
    try {
        const clean = {env: {}, home: path.join(directory, "clean"), managedSettings};
        await make("user/.claude/settings.json", JSON.stringify({env: {OTEL_LOGS_EXPORTER: "otlp"}}));
        await make("project/.claude/settings.local.json", JSON.stringify({env: {CLAUDE_CODE_ENABLE_TELEMETRY: "1"}}));
        await make("codex-otel/.codex/config.toml", 'model = "x"\n[otel]\nexporter = "otlp-http"\n');
        await make("codex-plain/.codex/config.toml", 'model = "x"\n[mcp_servers.otel_bridge]\ncommand = "y"\n' +
            'hotel = 1\n[profiles.hotel]\nmodel = "z"\n');
        await make("codex-profile/.codex/config.toml", '[profiles.work]\nmodel = "x"\n[profiles.work.otel]\n' +
            'exporter = "otlp-http"\n');
        await make("codex-project/.codex/config.toml", 'otel.exporter = "otlp-http"\n');
        return {
            claudeClean: userOwnsTelemetry("claude", clean),
            claudeProcessEnv: userOwnsTelemetry("claude", Object.assign({}, clean,
                {env: {OTEL_EXPORTER_OTLP_ENDPOINT: "http://collector"}})),
            claudeLaunchEnv: userOwnsTelemetry("claude", Object.assign({}, clean,
                {launchEnv: {CLAUDE_CODE_ENABLE_TELEMETRY: "1"}})),
            claudeUserSettings: userOwnsTelemetry("claude", Object.assign({}, clean,
                {home: path.join(directory, "user")})),
            claudeProjectSettings: userOwnsTelemetry("claude", Object.assign({}, clean,
                {projectRoot: path.join(directory, "project")})),
            codexOtel: userOwnsTelemetry("codex", {env: {}, home: path.join(directory, "codex-otel")}),
            codexPlain: userOwnsTelemetry("codex", {env: {}, home: path.join(directory, "codex-plain")}),
            codexProfile: userOwnsTelemetry("codex", {env: {}, home: path.join(directory, "codex-profile")}),
            codexProject: userOwnsTelemetry("codex", {env: {}, home: path.join(directory, "codex-plain"),
                projectRoot: path.join(directory, "codex-project")}),
            claudeLaunch: launchSettings("claude", "http://localhost:9/AICliUsage/token"),
            codexLaunch: launchSettings("codex", "http://localhost:9/AICliUsage/token"),
            none: launchSettings("claude", null)
        };
    } finally {
        await fs.promises.rm(directory, {recursive: true, force: true});
    }
}

/** Run one fixture with independent files, sockets and sessions, cleaning all owned resources. */
exports.exercise = async function ({scenario}) {
    if (["usage-claude", "usage-codex", "usage-malformed", "usage-backlog", "usage-http", "usage-pricing",
        "usage-pricing-long", "usage-pricing-unknown"].includes(scenario)) {
        return exerciseUsage(scenario);
    }
    if (scenario === "usage-launch") {
        return exerciseUsageLaunch();
    }
    if (scenario === "config-collision") {
        return {empty: await outcome(Promise.resolve().then(() => checkCodexServers("[]"))),
            existing: await outcome(Promise.resolve().then(() =>
                checkCodexServers('[{"name":"phoenix-editor"}]'))),
            malformed: await outcome(Promise.resolve().then(() => checkCodexServers("secret fixture")))};
    }
    if (scenario.startsWith("patch-")) {
        const calls = [];
        const input = {hook_event_name: scenario === "patch-finish" ? "PostToolUse" : "PreToolUse",
            tool_name: "apply_patch", tool_use_id: "patch-1", cwd: os.tmpdir(), tool_input: {command:
                "*** Begin Patch\n*** Update File: old file.txt\n*** Move to: new file.txt\n@@\n-a\n+b\n" +
                "*** Add File: other.txt\n+c\n*** End Patch"}};
        const result = await runHook({projectRoot: os.tmpdir()}, input, async (fn, args) => {
            calls.push({fn, args});
            if (scenario === "patch-deny" && calls.length === 2) { return {ok: false, message: "busy"}; }
            if (scenario === "patch-reject" && calls.length === 2) { throw new Error("save rejected"); }
            return fn === "prepareEdit" ? {ok: true} : {outcome: "conflict"};
        });
        return {result, calls};
    }
    if (scenario === "catalog") {
        const specs = getEditorToolSpecs(async () => ({}), {cli: true});
        const built = specs.map(spec => AgentSDK.tool(spec.name, spec.description, spec.inputSchema,
            spec.handler, {annotations: spec.annotations, alwaysLoad: spec.alwaysLoad, searchHint: spec.searchHint}));
        return {names: specs.map(spec => spec.name), sdkNames: built.map(tool => tool.name),
            stateAlwaysLoaded: specs.find(spec => spec.name === "getEditorState").alwaysLoad,
            askTimeout: getToolTimeout("askInLivePreview", {timeoutS: 1800}),
            imageTimeout: getToolTimeout("useImage")};
    }
    if (scenario === "prompt") {
        const panel = buildSystemPrompt({projectPath: "/fixture", locale: "fr"});
        const cli = buildSystemPrompt({projectPath: "/fixture", locale: "fr", cli: true});
        return {panel, cli, context: buildEditorContextLine({activeFile: "/fixture/a", unsaved: "/fixture/a"}, {cli: true})};
    }
    if (scenario === "panel-parity") {
        const callback = async name => name === "takeScreenshot" ? {base64: "cG5n"} : {activeFile: "/fixture/a"};
        const panel = {};
        createEditorMcpServer({tool(name, _description, _schema, handler) { panel[name] = handler; return {name}; },
            createSdkMcpServer: value => value}, {execPeer: callback});
        const cli = getEditorToolSpecs(callback, {cli: true});
        return {panelImage: await panel.takeScreenshot({}),
            cliImage: await cli.find(spec => spec.name === "takeScreenshot").handler({}),
            panelState: await panel.getEditorState({}),
            cliState: await cli.find(spec => spec.name === "getEditorState").handler({})};
    }
    if (["hook-subagent", "hook-deny", "hook-finish", "hook-read"].includes(scenario)) {
        const calls = [];
        const event = scenario === "hook-subagent" ? "UserPromptSubmit" :
            scenario === "hook-deny" ? "PreToolUse" : "PostToolUse";
        const result = await runHook({projectRoot: os.tmpdir()}, {hook_event_name: event,
            agent_id: scenario === "hook-subagent" ? "sub" : undefined,
            tool_name: scenario === "hook-read" ? "Read" : "Edit", tool_use_id: "edit-1",
            tool_input: {file_path: path.join(os.tmpdir(), "a"),
                old_string: "before", new_string: "after"}}, async (fn, args) => {
            calls.push({fn, args});
            return scenario === "hook-deny" ? {ok: false, code: "save_raced", message: "Typing raced the save"} :
                {outcome: "conflict"};
        });
        return {result, calls};
    }
    const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "phoenix-cli-"));
    const calls = [];
    const events = [];
    const connections = [];
    let release;
    let client;
    let transport;
    let controller;
    const server = http.createServer((req, res) => {
        if (!controller.handleRequest(req, res)) { res.writeHead(404); res.end(); }
    });
    await new Promise(resolve => server.listen(0, "localhost", resolve));
    const usageEvents = [];
    controller = new CliConnector(server, {ready: () => true, emit: state => events.push(state),
        emitUsage: record => usageEvents.push(record),
        peer: async (fn, data) => {
            calls.push({fn, data});
            if (fn === "endCliSessionInBrowser") { return {ended: true}; }
            if (data.fn === "takeScreenshot") { return {base64: "cG5n"}; }
            if (data.fn === "getUserQuestion") {
                return {content: [{type: "text", text: "Explain this selected element"},
                    {type: "image", data: "cG5n", mimeType: "image/png"}]};
            }
            if (data.fn === "getEditorContext") { return {activeFile: path.join(directory, "file.txt")}; }
            if (data.fn === "prepareEdit") {
                if (scenario === "toggle-pending") {
                    return new Promise(resolve => { release = () => resolve({ok: true}); });
                }
                if (scenario.startsWith("retry-")) { return {ok: true, state: "clean"}; }
                return {ok: false, message: "fixture save failed"};
            }
            if (data.fn === "execJsInEditor" && ["disconnect", "revoke-pending"].includes(scenario)) {
                return new Promise(resolve => { release = () => resolve({result: "done"}); });
            }
            if (data.fn === "getEditorState") { return {activeFile: path.join(directory, "file.txt")}; }
            return {ok: true};
        }});
    const create = cli => controller.createSession({cli: cli || "claude", projectRoot: directory,
        appSupportDir: directory, askUiDir: path.join(directory, "scratch")});
    const connect = async launch => {
        const connection = new CliConnection(readSession(launch.files.sessionFile));
        connections.push(connection);
        await connection.connect();
        return connection;
    };
    try {
        const launch = await create(["codex-launch", "retry-codex"].includes(scenario) ? "codex" : "claude");
        const record = readSession(launch.files.sessionFile);
        if (scenario === "hook-command") {
            const script = path.join(directory, "hook with ' quotes & % ! 界.cjs");
            await fs.promises.writeFile(script, 'process.stdout.write("hook ran");');
            const command = hookCommand(process.execPath, script);
            const windows = process.platform === "win32";
            const shell = windows ? path.join(process.env.SystemRoot, "System32", "WindowsPowerShell",
                "v1.0", "powershell.exe") : "/bin/sh";
            return await spawnCli(shell, windows ? ["-NoProfile", "-NonInteractive", "-Command", command] :
                ["-c", command], {timeout: 5000, windowsHide: true});
        }
        if (scenario === "hook-review") {
            const first = await create("codex");
            const second = await create("codex");
            await fs.promises.writeFile(path.join(directory, "ai-cli", "codex-hook-review.json"),
                JSON.stringify({fingerprint: "previous definitions"}));
            const changed = await create("codex");
            return {first: first.hookReview, second: second.hookReview, changed: changed.hookReview};
        }
        if (scenario === "usage-codex-turn") {
            const codex = await create("codex");
            const session = controller.sessions.get(codex.sessionId);
            await controller.setEnabled(codex.sessionId, false);
            const hook = turn => controller.execute(session, {type: "hook", id: "hook-" + turn,
                fn: "UserPromptSubmit", args: {hook_event_name: "UserPromptSubmit", session_id: "thread",
                    turn_id: turn, prompt: "fixture prompt"}});
            const results = [await hook("turn-1"), await hook("turn-1"), await hook("turn-2")];
            // The user's own exporter wins; the outcome is the same whatever this machine's settings say.
            const owned = await controller.createSession({cli: "claude", projectRoot: directory,
                appSupportDir: directory, askUiDir: path.join(directory, "scratch"),
                env: {OTEL_EXPORTER_OTLP_ENDPOINT: "http://user-collector"}});
            return {results, usageEvents, ownedEnvKeys: Object.keys(owned.env),
                ownedRecord: Object.keys(readSession(owned.files.sessionFile))};
        }
        if (scenario === "files" || scenario === "codex-launch") {
            const draftsDir = path.join(directory, "ai-cli-drafts");
            return {launch, record: {version: record.version, sessionId: record.sessionId, cli: record.cli},
                scratchDir: path.join(directory, "scratch"), draftsDir, draftsExists: fs.existsSync(draftsDir),
                leaks: JSON.stringify(launch).includes(controller.endpoint),
                mode: (await fs.promises.stat(launch.files.sessionFile)).mode % 0o1000,
                mcp: JSON.parse(await fs.promises.readFile(launch.files.mcpConfigFile, "utf8")),
                settings: JSON.parse(await fs.promises.readFile(launch.files.settingsFile, "utf8"))};
        }
        if (scenario === "wrong-path") {
            const result = await new Promise(resolve => {
                const socket = new WebSocket(controller.url + "wrong");
                socket.on("unexpected-response", (_req, res) => { resolve(res.statusCode); res.resume(); socket.terminate(); });
                socket.on("error", () => {});
            });
            return {status: result};
        }
        if (scenario === "malformed" || scenario === "no-hello") {
            const socket = new WebSocket(controller.url);
            socket.on("error", () => {});
            await once(socket, "open");
            const closed = once(socket, "close");
            if (scenario === "malformed") { socket.send("not json"); }
            const [code] = await closed;
            return {code};
        }
        if (["adapter", "adapter-disconnected", "adapter-question"].includes(scenario)) {
            if (scenario === "adapter-disconnected") { controller.close(); }
            client = new Client({name: "fixture", version: "1"});
            transport = new StdioClientTransport({command: process.execPath,
                args: [path.join(__dirname, "../ai-cli-mcp/index.js"), "--session-file", launch.files.sessionFile],
                stderr: "pipe"});
            // Keep the session file for the disconnected-start test; no server or adapter may need an account.
            if (scenario === "adapter-disconnected") {
                await fs.promises.mkdir(path.dirname(launch.files.sessionFile), {recursive: true});
                await fs.promises.writeFile(launch.files.sessionFile, JSON.stringify(record));
            }
            await client.connect(transport);
            const listed = await client.listTools();
            const question = scenario === "adapter-question";
            const result = await client.callTool({name: question ? "getUserQuestion" : "takeScreenshot",
                arguments: question ? {questionId: "8aca77d8-854f-4415-a2c0-f5be54b437fd"} : {}});
            return {instructions: client.getInstructions(), tools: listed.tools, result,
                caller: question ? calls.find(call => call.data.fn === "getUserQuestion").data.caller : undefined,
                sessionId: launch.sessionId};
        }
        const connection = await connect(launch);
        if (scenario.startsWith("retry-")) {
            const args = scenario === "retry-codex" ? {tool_name: "apply_patch", cwd: directory,
                tool_input: {command: "*** Begin Patch\n*** Update File: a.txt\n@@\n-a\n+b\n*** End Patch"}} :
                {tool_name: "Edit", tool_input: {file_path: path.join(directory, "a.txt"),
                    old_string: "a", new_string: "b"}};
            const responses = [];
            for (const [event, id] of [["PreToolUse", "missing-post"], ["PreToolUse", "retry"],
                ["PostToolUseFailure", "retry"], ["PreToolUse", "after-failure"]]) {
                responses.push(await connection.call("hook", event,
                    {...args, hook_event_name: event, tool_use_id: id}, 6000));
            }
            const edits = calls.filter(call => call.data && ["prepareEdit", "finishEdit"].includes(call.data.fn));
            return {responses, prepared: edits.filter(call => call.data.fn === "prepareEdit")
                .map(call => call.data.args.toolUseId),
            finished: edits.filter(call => call.data.fn === "finishEdit").map(call => call.data.args.toolUseId)};
        }
        if (scenario === "toggle-pending") {
            const args = {tool_name: "Write", tool_use_id: "in-flight", tool_input: {file_path: path.join(directory, "a")}};
            const preparing = connection.call("hook", "PreToolUse", {...args, hook_event_name: "PreToolUse"}, 6000);
            await new Promise((resolve, reject) => {
                const start = Date.now();
                const check = () => {
                    if (release) { resolve(); } else if (Date.now() - start > 2000) {
                        reject(new Error("Fixture prepare did not start"));
                    } else { setTimeout(check, 5); }
                };
                check();
            });
            await controller.setEnabled(launch.sessionId, false);
            release();
            await preparing;
            await connection.call("hook", "PostToolUse", {...args, hook_event_name: "PostToolUse"}, 6000);
            await connection.call("hook", "PostToolUse", {...args, tool_use_id: "never-prepared",
                hook_event_name: "PostToolUse"}, 6000);
            return {finishes: calls.filter(call => call.data && call.data.fn === "finishEdit").length,
                cleanup: calls.find(call => call.fn === "endCliSessionInBrowser").data,
                status: controller.getStatus(launch.sessionId)};
        }
        if (scenario.startsWith("toggle-")) {
            controller.bindTerminal(launch.sessionId, "fixture-terminal");
            const disabled = await controller.setEnabled(launch.sessionId, false);
            if (scenario === "toggle-tools") {
                const before = calls.length;
                const tool = await outcome(connection.call("call", "getEditorState", {}, 6000));
                const docs = await outcome(connection.call("call", "editorDocs", {topic: "overview"}, 6000));
                return {disabled, tool, docs, dispatched: calls.length - before};
            }
            if (scenario === "toggle-hooks") {
                const before = calls.length;
                const hook = await connection.call("hook", "PreToolUse", {hook_event_name: "PreToolUse",
                    tool_name: "Write", tool_use_id: "disabled-write", tool_input: {file_path: path.join(directory, "a")}}, 6000);
                return {hook, dispatched: calls.length - before, status: controller.getStatus(launch.sessionId)};
            }
            if (scenario === "toggle-reconnect") {
                const state = await controller.setEnabled(launch.sessionId, true);
                return {state, result: await connection.call("call", "getEditorState", {}, 6000),
                    fileExists: fs.existsSync(launch.files.sessionFile),
                    terminalId: controller.sessions.get(launch.sessionId).terminalId,
                    cleanups: calls.filter(call => call.fn === "endCliSessionInBrowser").length};
            }
            if (scenario === "toggle-isolation") {
                const other = await create("codex");
                const second = await connect(other);
                const reconnect = await connect(launch);
                const refused = await outcome(reconnect.call("call", "getEditorState", {}, 6000));
                return {refused, status: controller.getStatus(launch.sessionId),
                    other: await second.call("call", "getEditorState", {}, 6000)};
            }
        }
        if (scenario === "deleted-session") {
            await fs.promises.unlink(launch.files.sessionFile);
            return await outcome(connection.call("call", "getEditorState", {}, 6000));
        }
        if (scenario === "invoke") {
            return {result: await connection.call("call", "getEditorState", {}, 6000), calls};
        }
        if (scenario === "unknown" || scenario === "invalid-args") {
            return await outcome(connection.call("call", scenario === "unknown" ? "deleteEverything" : "takeScreenshot",
                scenario === "unknown" ? {} : {__caller: {sessionId: "forged"}}, 6000));
        }
        if (scenario === "fifth-socket") {
            await connect(launch); await connect(launch); await connect(launch);
            const fifth = await outcome(connect(launch));
            return {fifth, healthy: await connection.call("call", "getEditorState", {}, 6000)};
        }
        if (scenario === "revoke") {
            await controller.revokeSession(launch.sessionId);
            return {exists: fs.existsSync(launch.files.sessionFile), status: controller.getStatus(launch.sessionId),
                reconnect: await outcome(new CliConnection(record).connect()), calls};
        }
        if (scenario === "two-sessions") {
            const other = await create();
            const second = await connect(other);
            await controller.revokeSession(launch.sessionId);
            return {sameURL: record.url === readSession(other.files.sessionFile).url,
                differentId: launch.sessionId !== other.sessionId,
                result: await second.call("call", "getEditorState", {}, 6000)};
        }
        if (scenario === "disconnect" || scenario === "revoke-pending") {
            const pending = outcome(connection.call("call", "execJsInEditor", {code: "return 1;"}, 6000));
            await new Promise((resolve, reject) => {
                const start = Date.now();
                const check = () => {
                    if (release) { resolve(); } else if (Date.now() - start > 2000) { reject(new Error("Fixture call did not start")); } else { setTimeout(check, 5); }
                };
                check();
            });
            if (scenario === "revoke-pending") { await controller.revokeSession(launch.sessionId); } else { connection.socket.terminate(); }
            const result = await pending;
            if (scenario === "disconnect") { await connection.connect(); }
            release();
            return {result, mutations: calls.filter(call => call.data && call.data.fn === "execJsInEditor").length};
        }
        if (scenario === "http-hook") {
            const response = await fetch(record.url.replace(/^ws:/, "http:") + "/hook", {method: "POST",
                headers: {"Content-Type": "application/json", "X-Phoenix-Session": launch.sessionId},
                body: JSON.stringify({hook_event_name: "PreToolUse", tool_name: "Write", tool_use_id: "write1",
                    tool_input: {file_path: path.join(directory, "a")}})});
            return {status: response.status, result: await response.json()};
        }
        if (scenario === "sweep") {
            const sibling = new CliConnector(server, {peer: async () => ({}), emit: () => {}});
            try {
                const live = await sibling.createSession({cli: "claude", projectRoot: directory, appSupportDir: directory});
                const abandoned = path.join(directory, "ai-cli", "abandoned");
                await fs.promises.mkdir(abandoned);
                // An impossible PID is only a fixture, not a process we terminate.
                await fs.promises.writeFile(path.join(abandoned, "owner.json"), JSON.stringify({pid: 2147483647}));
                await controller.sweep(path.join(directory, "ai-cli"));
                return {liveExists: fs.existsSync(live.files.sessionFile), staleExists: fs.existsSync(abandoned)};
            } finally { sibling.close(); }
        }
        throw new Error("Unknown connector fixture: " + scenario);
    } finally {
        if (release) { release(); }
        if (client) { await client.close(); } else if (transport) { await transport.close(); }
        for (const connection of connections) { connection.close(); }
        controller.close();
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
        await fs.promises.rm(directory, {recursive: true, force: true});
    }
};
