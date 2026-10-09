/*
 * Copyright (c) 2021 - present core.ai
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/** Offline exercises of the real agent hooks; assertions live in the Jasmine suite. */
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const NodeConnector = require("../node-connector");

/**
 * Exercise one bounded permission scenario with a fake SDK and browser connector.
 * No installed CLI, network, credentials, user files or global agent state are used.
 * @param {Object} params Mode, tool, target category and optional mode/answer scenario.
 * @return {Promise<Object>} Hook decisions, SDK options and observed browser operations.
 */
async function exercise(params) {
    const mode = params.mode || "auto";
    const tool = params.tool || "Write";
    if (!["auto", "acceptEdits", "plan", "bypassPermissions"].includes(mode) ||
        !["Write", "Edit"].includes(tool)) {
        throw new Error("Unsupported permission fixture");
    }
    const project = path.resolve("/phoenix-fixture/project");
    const attached = path.resolve("/phoenix-fixture/attached");
    const scratch = path.resolve("/phoenix-fixture/scratch");
    const temp = path.resolve("/phoenix-fixture/temp");
    const locations = {
        project: path.join(project, "file.txt"),
        attached: path.join(attached, "file.txt"),
        scratch: path.join(scratch, "file.txt"),
        temp: path.join(temp, "file.txt"),
        outside: path.resolve("/phoenix-fixture/outside/file.txt"),
        plan: path.resolve("/phoenix-fixture/.claude/plans/fixture.md")
    };
    const filePath = locations[params.location || "outside"];
    if (!filePath) { throw new Error("Unsupported fixture location"); }
    const operations = [], events = [], modeChanges = [];
    const exported = {};
    let options, inputPrompt, finish, ready, complete;
    let switchedDuringPrep = false;
    const finished = new Promise(resolve => { finish = resolve; });
    const queryReady = new Promise(resolve => { ready = resolve; });
    const queryComplete = new Promise(resolve => { complete = resolve; });
    const connector = {
        execPeer: async function (name, args) {
            operations.push({name, filePath: args && args.filePath});
            if (name === "captureFileContent" && params.switchDuringPrep && !switchedDuringPrep) {
                switchedDuringPrep = true;
                await exported.setPermissionMode({mode: params.switchDuringPrep});
            }
            return name === "captureFileContent" ? {content: params.stale ? "changed" : "before"} : {};
        },
        triggerPeer: function (name, data) {
            events.push({name, data});
            if (name === "aiBashConfirm") {
                exported.answerBashConfirm({confirmId: data.confirmId, allowed: params.allow === true});
            } else if (name === "aiPlanModeWriteConfirm") {
                exported.answerPlanModeWriteConfirm({confirmId: data.confirmId, approved: params.allow === true});
            } else if (name === "aiPlanProposed") {
                exported.answerPlan({confirmId: data.confirmId, approved: params.allow === true});
            } else if (name === "aiComplete" || name === "aiError") {
                complete();
            }
        }
    };
    const sdk = {
        query: function (request) {
            options = request.options;
            inputPrompt = request.prompt;
            ready();
            return {
                supportedModels: async () => [],
                setPermissionMode: async function (nextMode) {
                    modeChanges.push(nextMode);
                    if (params.modeFailure) { throw new Error("fixture mode update failed"); }
                    if (params.modeTimeout) { await new Promise(() => {}); }
                },
                async *[Symbol.asyncIterator]() {
                    yield {type: "system", subtype: "init"};
                    await finished;
                    if (params.emitResult) {
                        yield {type: "stream_event", event: {type: "content_block_start", index: 0,
                            content_block: {type: "tool_use", id: "fixture-tool", name: tool}}};
                        yield {type: "stream_event", event: {type: "content_block_delta", index: 0,
                            delta: {type: "input_json_delta", partial_json: JSON.stringify({file_path: filePath})}}};
                        yield {type: "stream_event", event: {type: "content_block_stop", index: 0}};
                        yield {type: "user", message: {content: [{type: "tool_result", tool_use_id: "fixture-tool",
                            is_error: true, content: "PreToolUse:" + tool + " hook error: " +
                                (params.planWriteFailure ? "Could not save the plan file" : "Plan file saved.")}]}};
                    }
                }
            };
        }
    };
    const dependencies = {
        fs: {existsSync: () => true, readFileSync: () => "before", mkdirSync: () => {}, writeFileSync: () => {
            if (params.planWriteFailure) { throw new Error("fixture write failed"); }
            operations.push({name: "writeFileSync"});
        }},
        os: {tmpdir: () => temp},
        path,
        "./mcp-editor-tools": {createEditorMcpServer: () => ({})},
        "./cli-locator": {locateCli: async () => ({}), getSourceEnv: () => ({})},
        "./ai-image-preview": {},
        "./ai-system-prompt": {buildSystemPrompt: () => "", buildEditorContextLine: () => ""},
        "./ai-cli-connector": {setBrowserConnector: () => {}},
        "./ai-cli-capabilities": {},
        "./ai-model-effort": {effortForQuery: () => undefined},
        "./ai-cli-pricing": {updatePricing: () => {}},
        "./node-connector": {isConnected: () => true}
    };
    const source = fs.readFileSync(path.join(__dirname, "..", "claude-code-agent.js"), "utf8");
    vm.runInNewContext(source + "\nqueryModule = sdkFixture;", {
        exports: exported, sdkFixture: sdk,
        global: {createNodeConnector: () => connector},
        process: {platform: process.platform, env: {}, cwd: () => project},
        console: {log() {}, warn() {}, error() {}},
        AbortController, Buffer, clearTimeout,
        setTimeout: function (callback, ms) {
            if (params.modeTimeout && ms === 10000) {
                Promise.resolve().then(callback);
                return null;
            }
            return setTimeout(callback, ms);
        },
        require: function (name) {
            if (!(name in dependencies)) { throw new Error("Unexpected fixture dependency " + name); }
            return dependencies[name];
        }
    }, {filename: "claude-code-agent.js"});
    let timeout;
    const deadline = new Promise((resolve, reject) => {
        timeout = setTimeout(() => reject(new Error("Permission fixture timed out")), 5000);
    });
    try {
        await exported.sendPrompt({prompt: "fixture", projectPath: project, permissionMode: mode,
            additionalDirectories: [attached], aiScratchDir: scratch,
            images: params.image ? [{mediaType: "image/png", base64Data: "aGVsbG8="}] : undefined});
        await Promise.race([queryReady, deadline]);
        const promptMessages = [];
        if (typeof inputPrompt !== "string") {
            for await (const message of inputPrompt) { promptMessages.push(message); }
        }
        let modeError = null;
        if (params.switchTo) {
            try {
                await exported.setPermissionMode({mode: params.switchTo});
            } catch (err) { modeError = err.message; }
        }
        let planDecision;
        if (params.approvePlan) {
            planDecision = await options.canUseTool("ExitPlanMode", {plan: "Fixture plan"},
                {signal: options.abortController.signal});
            if (planDecision.behavior === "allow") {
                const postExit = options.hooks.PostToolUse.find(entry => entry.matcher === "ExitPlanMode");
                await postExit.hooks[0]();
            }
        }
        const toolInput = {file_path: filePath, content: "after", old_string: "before", new_string: "after"};
        const hook = options.hooks.PreToolUse.find(entry => entry.matcher === tool).hooks[0];
        const decision = await Promise.race([
            hook({tool_name: tool, tool_input: toolInput}, "fixture-tool", {}), deadline
        ]);
        const nextDecision = params.followup ? await Promise.race([
            hook({tool_name: tool, tool_input: toolInput}, "fixture-next-tool", {}), deadline
        ]) : undefined;
        let sdkAsk;
        if (params.sdkAsk) {
            sdkAsk = await options.canUseTool(tool, toolInput, {signal: options.abortController.signal});
        }
        if (params.emitResult) {
            finish();
            await Promise.race([queryComplete, deadline]);
        }
        return JSON.parse(JSON.stringify({decision, nextDecision, planDecision, sdkAsk, modeError, modeChanges,
            aborted: options.abortController.signal.aborted, operations,
            toolResults: events.filter(event => event.name === "aiToolResult").map(event => event.data),
            events: events.filter(event => ["aiBashConfirm", "aiPlanModeWriteConfirm", "aiPlanProposed"].includes(event.name)),
            allowedTools: options.allowedTools, permissionMode: options.permissionMode,
            streamingInput: typeof inputPrompt !== "string", promptMessages}));
    } finally {
        await exported.cancelQuery();
        finish();
        await Promise.race([queryComplete, deadline]);
        clearTimeout(timeout);
    }
}

exports.exercise = exercise;
NodeConnector.createNodeConnector("ph_test_ai_file_permissions", exports);
