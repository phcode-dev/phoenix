/*
 * Copyright (c) 2021 - present core.ai
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
/*global describe, it, expect, beforeAll, awaitsFor */
define(function (require, exports, module) {
    const NodeConnector = require("NodeConnector");
    if (!Phoenix.isNativeApp) { return; }

    describe("unit:AI CLI Connector", function () {
        let connector;
        beforeAll(async function () {
            await awaitsFor(NodeConnector.isNodeReady, "Node runtime to be ready");
            connector = NodeConnector.createNodeConnector("ph_test_ai_cli_connector", exports);
        });
        const run = scenario => connector.execPeer("exercise", {scenario});

        it("finishes an edit prepared during disconnect without running hooks for new edits", async function () {
            const result = await run("toggle-pending");
            expect(result.finishes).toBe(1);
            expect(result.pending).toBe(0);
            expect(result.cleanup.disconnect).toBe(true);
            expect(result.status.state).toBe("disabled");
        });

        it("disconnects browser and node-side tools without dispatching them", async function () {
            const result = await run("toggle-tools");
            expect(result.disabled.state).toBe("disabled");
            expect(result.disabled.enabled).toBe(false);
            expect(result.tool.code).toBe("connection_disabled");
            expect(result.docs.code).toBe("connection_disabled");
            expect(result.dispatched).toBe(0);
        });
        it("lets a disconnected CLI use its native tools without editor hooks", async function () {
            const result = await run("toggle-hooks");
            expect(result.hook).toEqual({});
            expect(result.dispatched).toBe(0);
            expect(result.status.state).toBe("disabled");
        });
        it("reconnects the existing session without replacing its terminal or launch files", async function () {
            const result = await run("toggle-reconnect");
            expect(result.state.connected).toBe(true);
            expect(result.state.enabled).toBe(true);
            expect(result.fileExists).toBe(true);
            expect(result.terminalId).toBe("fixture-terminal");
            expect(result.cleanups).toBe(1);
            expect(result.result.content[0].text).toContain("file.txt");
        });
        it("keeps a disabled session off across socket reconnects without affecting another CLI", async function () {
            const result = await run("toggle-isolation");
            expect(result.refused.code).toBe("connection_disabled");
            expect(result.status.state).toBe("disabled");
            expect(result.other.content[0].text).toContain("file.txt");
        });

        it("builds all 17 tools with the installed Agent SDK and retains long tool budgets", async function () {
            const result = await run("catalog");
            expect(result.names.length).toBe(17);
            expect(result.sdkNames).toEqual(result.names);
            expect(result.names).toContain("getProblems");
            expect(result.names).toContain("askInLivePreview");
            expect(result.names).toContain("getUserQuestion");
            expect(result.names).not.toContain("getUserClarification");
            expect(result.names).not.toContain("previewImages");
            expect(result.stateAlwaysLoaded).toBe(true);
            expect(result.askTimeout).toBe(1815000);
            expect(result.imageTimeout).toBe(90000);
        });
        it("shares screenshot and editor-state result shaping with the panel", async function () {
            const result = await run("panel-parity");
            expect(result.cliImage).toEqual(result.panelImage);
            expect(result.cliState).toEqual(result.panelState);
        });
        it("retrieves a question and image through stdio MCP with connector-supplied ownership", async function () {
            const result = await run("adapter-question");
            expect(result.result.content).toEqual([
                {type: "text", text: "Explain this selected element"},
                {type: "image", data: "cG5n", mimeType: "image/png"}
            ]);
            expect(result.caller.sessionId).toBe(result.sessionId);
            expect(result.caller.kind).toBe("cli");
        });
        it("removes panel-only guidance from the CLI without dropping locale or the prompt probe", async function () {
            const result = await run("prompt");
            expect(result.panel).toContain("getUserClarification");
            expect(result.cli).not.toContain("getUserClarification");
            expect(result.cli).not.toContain("previewImages:");
            expect(result.cli).toContain("xxyysjud");
            expect(result.cli).toContain("language is fr");
            expect(result.cli).toContain("120 per hour");
            expect(result.context).toContain("flushUnsavedFiles");
        });
        it("writes private session files and keeps the secret URL out of the browser launch contract", async function () {
            const result = await run("files");
            expect(result.leaks).toBe(false);
            expect(result.record.version).toBe(1);
            expect(result.mcp.mcpServers["phoenix-editor"].timeout).toBeGreaterThan(1815000);
            expect(result.settings.hooks.PreToolUse[0].hooks[0].type).toBe("command");
            expect(result.settings.hooks.UserPromptSubmit[0].hooks[0].type).toBe("http");
            expect(result.settings.hooks.UserPromptSubmit[0].hooks[0].headers.Authorization).toBeUndefined();
            if (brackets.platform !== "win") { expect(result.mode).toBe(384); }
            // Ask AI attachments now arrive through MCP; only Ask UI needs a scratch directory.
            const addDirs = result.launch.args.filter((arg, index) => result.launch.args[index - 1] === "--add-dir");
            expect(addDirs).toEqual([result.scratchDir]);
            expect(result.draftsExists).toBe(false);
        });
        it("launches Codex without a profile or replacement developer instructions", async function () {
            const result = await run("codex-launch");
            expect(result.launch.args).toContain("--no-daemon");
            expect(result.launch.args.join(" ")).not.toContain("developer_instructions");
            expect(result.launch.args.join(" ")).not.toContain("--profile");
            expect(result.launch.env.PHOENIX_AI_SESSION_FILE).toBe(result.launch.files.sessionFile);
            expect(result.launch.args.join(" ")).not.toContain("ai-cli-drafts");
        });
        it("runs command hooks from paths with spaces, quotes and Unicode in the native shell", async function () {
            const result = await run("hook-command");
            expect(result.status).toBe(0);
            expect(result.stdout).toBe("hook ran");
        });
        it("explains hook review once and again when the definitions change", async function () {
            expect(await run("hook-review")).toEqual({first: true, second: false, changed: true});
        });
        it("refuses a Codex MCP name collision without leaking configuration in errors", async function () {
            const result = await run("config-collision");
            expect(result.empty.error).toBeUndefined();
            expect(result.existing.error).toContain("already configured");
            expect(result.malformed.error).not.toContain("secret fixture");
        });
        it("prepares every Codex patch target including both sides of a rename", async function () {
            const result = await run("patch-prepare");
            expect(result.calls.length).toBe(3);
            expect(result.calls.every(call => call.fn === "prepareEdit")).toBe(true);
            expect(result.calls[0].args.filePath).toContain("old file.txt");
            expect(result.calls[1].args.filePath).toContain("new file.txt");
            expect(result.calls[2].args.filePath).toContain("other.txt");
        });
        it("releases prepared Codex targets when a later file refuses the patch", async function () {
            const result = await run("patch-deny");
            expect(result.result.hookSpecificOutput.permissionDecision).toBe("deny");
            expect(result.calls.length).toBe(3);
            expect(result.calls[2].fn).toBe("finishEdit");
            expect(result.calls[2].args.toolFailed).toBe(true);
        });
        it("reconciles all Codex patch targets even when the first one conflicts", async function () {
            const result = await run("patch-finish");
            expect(result.calls.length).toBe(3);
            expect(result.calls.every(call => call.fn === "finishEdit")).toBe(true);
            expect(result.result.hookSpecificOutput.additionalContext).toContain("other.txt");
        });
        it("releases earlier Codex targets when saving a later target throws", async function () {
            const result = await run("patch-reject");
            expect(result.result.hookSpecificOutput.permissionDecision).toBe("deny");
            expect(result.result.hookSpecificOutput.permissionDecisionReason).toBe("save rejected");
            expect(result.calls[2].fn).toBe("finishEdit");
            expect(result.calls[2].args.toolFailed).toBe(true);
        });
        it("stops reconnecting when the owning session file was removed", async function () {
            expect((await run("deleted-session")).error).toContain("session ended");
        });
        it("returns 404 for an unknown secret path", async function () {
            expect((await run("wrong-path")).status).toBe(404);
        });
        it("rejects a malformed first frame", async function () {
            expect((await run("malformed")).code).toBe(4002);
        });
        it("closes a socket that never identifies a session", async function () {
            expect((await run("no-hello")).code).toBe(4001);
        });
        it("routes a call with session ownership supplied by PhNode", async function () {
            const result = await run("invoke");
            expect(result.result.isError).not.toBe(true);
            const call = result.calls.find(item => item.data && item.data.fn === "getEditorState");
            expect(call.data.caller.kind).toBe("cli");
            expect(call.data.caller.sessionId).toBeDefined();
            expect(call.data.caller.callId).toBeDefined();
        });
        it("rejects unknown operations", async function () {
            expect((await run("unknown")).code).toBe("unknown_fn");
        });
        it("rejects forged caller metadata in model arguments", async function () {
            expect((await run("invalid-args")).error).toBeDefined();
        });
        it("refuses a fifth socket without disturbing the existing adapter", async function () {
            const result = await run("fifth-socket");
            expect(result.fifth.error).toBeDefined();
            expect(result.healthy.isError).not.toBe(true);
        });
        it("revokes a stopped session and removes its files", async function () {
            const result = await run("revoke");
            expect(result.exists).toBe(false);
            expect(result.status.state).toBe("ended");
            expect(result.reconnect.error).toBeDefined();
            expect(result.calls.some(call => call.fn === "endCliSessionInBrowser")).toBe(true);
        });
        it("keeps the other session alive when one terminal stops", async function () {
            const result = await run("two-sessions");
            expect(result.sameURL).toBe(true);
            expect(result.differentId).toBe(true);
            expect(result.result.isError).not.toBe(true);
        });
        it("never replays an uncertain mutation after reconnecting", async function () {
            const result = await run("disconnect");
            expect(result.result.code).toBe("outcome_unknown");
            expect(result.mutations).toBe(1);
        });
        it("rejects a pending call when its session is revoked", async function () {
            const result = await run("revoke-pending");
            expect(result.result.code).toBe("session_ended");
            expect(result.mutations).toBe(1);
        });
        it("starts stdio MCP, lists metadata and returns an image block", async function () {
            const result = await run("adapter");
            expect(result.instructions).toContain("Phoenix Code");
            expect(result.tools.length).toBe(17);
            expect(result.tools.find(tool => tool.name === "getEditorState")._meta["anthropic/alwaysLoad"]).toBe(true);
            expect(result.result.content[0]).toEqual({type: "image", data: "cG5n", mimeType: "image/png"});
        });
        it("answers MCP discovery while Phoenix is unavailable and returns a useful tool error", async function () {
            const result = await run("adapter-disconnected");
            expect(result.tools.length).toBe(17);
            expect(result.result.isError).toBe(true);
        });
        it("returns a native edit denial when an HTTP hook cannot save a dirty buffer", async function () {
            const result = await run("http-hook");
            expect(result.status).toBe(200);
            expect(result.result.hookSpecificOutput.permissionDecision).toBe("deny");
        });
        it("does not inject main-session context into a subagent", async function () {
            const result = await run("hook-subagent");
            expect(result.calls.length).toBe(0);
            expect(result.result).toEqual({});
        });
        it("denies native edits when typing raced the flush", async function () {
            const result = await run("hook-deny");
            expect(result.result.hookSpecificOutput.permissionDecision).toBe("deny");
            expect(result.calls[0].fn).toBe("prepareEdit");
        });
        it("tells the CLI to stop when post-edit reconciliation finds concurrent typing", async function () {
            const result = await run("hook-finish");
            expect(result.calls[0].fn).toBe("finishEdit");
            expect(result.calls[0].args.edits[0].newText).toBe("after");
            expect(result.result.hookSpecificOutput.additionalContext).toContain("Stop editing");
        });
        it("does not reconcile a Read or raise a conflict when the user types during it", async function () {
            const result = await run("hook-read");
            expect(result.calls.length).toBe(0);
            expect(result.result).toEqual({});
        });
        it("sweeps a dead boot while preserving another live window's session", async function () {
            const result = await run("sweep");
            expect(result.liveExists).toBe(true);
            expect(result.staleExists).toBe(false);
        });
        it("turns Claude API requests into deduplicated usage with one turn per prompt", async function () {
            const result = await run("usage-claude");
            expect(result.unknown).toBe(0);
            expect(result.emitted.map(record => record.eventId)).toEqual(["claude:req-1", "claude:req-2",
                "claude:req-3"]);
            expect(result.emitted.map(record => record.turns)).toEqual([1, 0, 1]);
            expect(result.emitted.map(record => record.model)).toEqual(["claude-sonnet-4-5", "claude-sonnet-4-5",
                "claude-haiku-4-5-20251001"]);
            expect(result.emitted[0]).toEqual({sessionId: "claude-session", cli: "claude", eventId: "claude:req-1",
                model: "claude-sonnet-4-5",
                at: 1791142947867, input: 1001, output: 100, cacheRead: 3003, cacheWrite: 2002,
                costUSD: 0.0151614, turns: 1});
        });
        it("counts disjoint Codex tokens without cost and Codex turns once", async function () {
            const result = await run("usage-codex");
            expect(result.emitted.length).toBe(3);
            const tokens = result.emitted[0];
            expect(tokens.eventId).toMatch(/^codex:[0-9a-f]{32}$/);
            expect([tokens.input, tokens.output, tokens.cacheRead, tokens.cacheWrite]).toEqual([70, 40, 30, 0]);
            expect(tokens.costUSD).toBeNull();
            expect(tokens.turns).toBe(0);
            expect(tokens.at).toBe(1791142980557);
            // Unverified against a real nonzero cache write; see codexUsage in ai-cli-usage.js.
            const writing = result.emitted[1];
            expect([writing.input, writing.cacheRead, writing.cacheWrite]).toEqual([50, 30, 20]);
            const turn = result.emitted[2];
            expect(turn.eventId).toMatch(/^codex:turn:[0-9a-f]{32}$/);
            expect([turn.input, turn.output, turn.cacheRead, turn.cacheWrite, turn.turns]).toEqual([0, 0, 0, 0, 1]);
            expect(turn.costUSD).toBeNull();
            expect(tokens.model).toBeNull();
            expect(turn.model).toBeNull();
        });
        it("prices Codex requests by their own model and token kinds without counting retries or reasoning twice", async function () {
            const result = await run("usage-pricing");
            expect(result.emitted.length).toBe(2);
            expect(result.emitted.map(record => record.model)).toEqual(["gpt-6-sol", "gpt-6-astra"]);
            expect(result.emitted.map(record => [record.input, record.output, record.cacheRead, record.cacheWrite]))
                .toEqual([[50, 40, 30, 20], [50, 40, 30, 20]]);
            expect(result.emitted[0].costUSD).toBeCloseTo(0.000556, 9);
            expect(result.emitted[1].costUSD).toBeCloseTo(0.00278, 9);
        });
        it("applies long-context rates only beyond the inclusive input threshold", async function () {
            const result = await run("usage-pricing-long");
            expect(result.emitted.length).toBe(2);
            expect(result.emitted[0].costUSD).toBeCloseTo(0.4244, 9);
            expect(result.emitted[1].costUSD).toBeCloseTo(0.843804, 9);
        });
        it("keeps unknown models and unpublished cache-write rates unpriced without guessing a model", async function () {
            const result = await run("usage-pricing-unknown");
            expect(result.emitted.map(record => record.costUSD)).toEqual([null, null, null, null, null]);
            expect(result.emitted.map(record => record.model))
                .toEqual(["gpt-future", "gpt-6-sol-new", "gpt-5.3-codex", null, null]);
        });
        it("skips misshapen OTLP exports and out-of-range times without throwing", async function () {
            const result = await run("usage-malformed");
            expect(result.thrown).toEqual([]);
            expect(result.produced).toEqual([0, 0, 0, 0, 0, 0, 0]);
            expect(result.emitted).toBe(1);
            expect(result.atInRange).toBe(true);
        });
        it("holds usage while the browser is away and delivers it once it returns", async function () {
            const result = await run("usage-backlog");
            expect(result.whileAway).toBe(0);
            expect(result.after).toBe(1);
            expect(result.eventId).toBe("claude:req-1");
        });
        it("accepts only log exports on a live session's private collector path", async function () {
            const result = await run("usage-http");
            expect(result.accepted).toEqual({status: 200, body: "{}"});
            expect([result.metrics, result.unknown, result.read]).toEqual([404, 404, 404]);
            expect(result.malformed).toBe(400);
            expect(result.misshapen).toBe(200);
            expect([413, "ECONNRESET", "EPIPE"]).toContain(result.oversize);
            expect(result.afterOversize).toBe(200);
            expect(result.other).toBe(418);
            expect(result.afterClose).toBe(404);
            expect(result.emitted).toBe(1);
        });
        it("exports CLI usage only when the user has no telemetry of their own", async function () {
            const result = await run("usage-launch");
            expect(result.claudeClean).toBe(false);
            expect([result.claudeProcessEnv, result.claudeLaunchEnv, result.claudeUserSettings,
                result.claudeProjectSettings]).toEqual([true, true, true, true]);
            expect(result.codexOtel).toBe(true);
            expect(result.codexPlain).toBe(false);
            expect(result.codexProfile).toBe(true);
            expect(result.codexProject).toBe(true);
            expect(result.claudeLaunch.env.OTEL_EXPORTER_OTLP_ENDPOINT).toBe("http://localhost:9/AICliUsage/token");
            expect(result.claudeLaunch.env.OTEL_EXPORTER_OTLP_PROTOCOL).toBe("http/json");
            expect(result.claudeLaunch.env.OTEL_METRICS_EXPORTER).toBe("none");
            expect(result.claudeLaunch.args).toEqual([]);
            expect(result.codexLaunch.env).toEqual({});
            expect(result.codexLaunch.args[1]).toContain('endpoint="http://localhost:9/AICliUsage/token/v1/logs"');
            expect(result.codexLaunch.args[1]).toContain('protocol="json"');
            expect(result.none).toEqual({env: {}, args: []});
        });
        it("records Codex turns while disconnected and leaves a user's exporter alone", async function () {
            const result = await run("usage-codex-turn");
            expect(result.results).toEqual([{}, {}, {}]);
            expect(result.usageEvents.length).toBe(2);
            expect(result.usageEvents.every(record => record.cli === "codex" && record.turns === 1)).toBe(true);
            expect(result.ownedEnvKeys.filter(key => /^OTEL_|^CLAUDE_CODE_ENABLE_TELEMETRY$/.test(key)))
                .toEqual([]);
            expect(result.ownedRecord).not.toContain("env");
        });
    });
});
