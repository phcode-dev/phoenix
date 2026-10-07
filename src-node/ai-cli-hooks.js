/*
 * Copyright (c) 2021 - present core.ai
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/** CLI hook semantics, independent of HTTP or command-hook transport. */
const path = require("path");
const {buildSystemPrompt, buildEditorContextLine} = require("./ai-system-prompt");

const EVENTS = new Set(["SessionStart", "UserPromptSubmit", "PostCompact", "PreToolUse", "PostToolUse",
    "PostToolUseFailure", "Stop", "SessionEnd"]);
const EDIT_TOOLS = new Set(["Read", "Edit", "MultiEdit", "Write"]);

/** Resolve the files named by Codex's native patch, including both sides of a rename. */
function patchFiles(command, cwd) {
    if (typeof command !== "string" || !command.startsWith("*** Begin Patch")) {
        throw new Error("Unrecognized Codex patch; use flushUnsavedFiles before editing.");
    }
    const files = new Set();
    for (const line of command.split(/\r?\n/)) {
        const match = /^\*\*\* (?:Add File|Update File|Delete File|Move to): (.+)$/.exec(line);
        if (match) { files.add(path.resolve(cwd, match[1].trim())); }
    }
    if (!files.size || files.size > 100) { throw new Error("Phoenix supports up to 100 files per coordinated patch."); }
    return Array.from(files);
}

/** Prepare every patch target before permitting Codex's native multi-file disk edit. */
async function runPatchHook(session, input, peer) {
    const event = input.hook_event_name;
    const files = patchFiles(input.tool_input && input.tool_input.command, input.cwd || session.projectRoot);
    if (!input.tool_use_id) { throw new Error("Missing Codex patch call ID."); }
    const prepared = [];
    const conflicts = [];
    for (const filePath of files) {
        const args = {filePath, tool: "Write", toolUseId: input.tool_use_id};
        if (event === "PreToolUse") {
            try {
                const result = await peer("prepareEdit", args);
                if (!result.ok) {
                    throw new Error(result.message || "Phoenix could not synchronize a patch target.");
                }
            } catch (error) {
                // No native patch has run yet. Discard earlier passive baselines, even if
                // another cleanup fails; there are no file reservations to release.
                await Promise.allSettled(prepared.map(previous =>
                    peer("finishEdit", Object.assign({}, previous, {toolFailed: true}))));
                return {hookSpecificOutput: {hookEventName: event, permissionDecision: "deny",
                    permissionDecisionReason: error.message}};
            }
            prepared.push(args);
        } else {
            args.toolFailed = event === "PostToolUseFailure" ||
                (typeof input.tool_response === "string" && /^Exit code: [1-9]/.test(input.tool_response));
            const result = await peer("finishEdit", args);
            if (["conflict", "no-baseline"].includes(result.outcome)) {
                conflicts.push(filePath);
            }
        }
    }
    return conflicts.length ? {hookSpecificOutput: {hookEventName: event, additionalContext:
        "Phoenix preserved concurrent user edits in " + conflicts.join(", ") +
        ". Stop editing these files until the user resolves the conflicts."}} : {};
}

/**
 * Apply a supported hook using the originating session's browser dispatch.
 * @param {Object} session Registered CLI session.
 * @param {Object} input CLI hook input.
 * @param {Function} peer Session-scoped browser call.
 * @return {Promise<Object>} Hook protocol response.
 */
async function runHook(session, input, peer) {
    const event = input.hook_event_name;
    if (!EVENTS.has(event)) { return {}; }
    if (input.agent_id && ["SessionStart", "UserPromptSubmit", "PostCompact", "Stop"].includes(event)) {
        return {};
    }
    if (["SessionStart", "UserPromptSubmit", "PostCompact"].includes(event)) {
        const context = await peer("getEditorContext", {});
        const line = buildEditorContextLine(context, {cli: true});
        const guidance = event === "UserPromptSubmit" || session.cli === "claude" ? "" : buildSystemPrompt({cli: true,
            projectPath: session.projectRoot, scratchDir: session.scratchDir, locale: session.locale}) + "\n\n";
        if (input.session_id) { session.cliSessionId = input.session_id; }
        session.hooksReady = true;
        return {hookSpecificOutput: {hookEventName: event, additionalContext: guidance + line}};
    }
    if (event === "Stop") {
        if (!input.stop_hook_active) { await peer("notifyCliDone", {}); }
        return {};
    }
    if (input.tool_name === "apply_patch" && ["PreToolUse", "PostToolUse", "PostToolUseFailure"].includes(event)) {
        return runPatchHook(session, input, peer);
    }
    if (!EDIT_TOOLS.has(input.tool_name)) { return {}; }
    const filePath = input.tool_input && input.tool_input.file_path;
    if (!filePath || !path.isAbsolute(filePath)) {
        return event === "PreToolUse" ? {hookSpecificOutput: {hookEventName: event,
            permissionDecision: "deny", permissionDecisionReason: "Use an absolute file path for Phoenix edits."}} : {};
    }
    const args = {filePath, tool: input.tool_name, toolUseId: input.tool_use_id};
    if (!args.toolUseId) {
        return event === "PreToolUse" ? {hookSpecificOutput: {hookEventName: event,
            permissionDecision: "deny", permissionDecisionReason: "Missing tool call ID; reconnect to Phoenix."}} : {};
    }
    if (event === "PreToolUse") {
        const result = await peer("prepareEdit", args);
        if (!result.ok) {
            return {hookSpecificOutput: {hookEventName: event, permissionDecision: "deny",
                permissionDecisionReason: result.message || "Phoenix could not save the editor buffer."}};
        }
        return {};
    }
    // Reads only need the preflight save; they never reconcile a write.
    if (input.tool_name === "Read") { return {}; }
    if (event === "PostToolUse" || event === "PostToolUseFailure") {
        const toolInput = input.tool_input;
        args.edits = input.tool_name === "Edit" ? [{oldText: toolInput.old_string,
            newText: toolInput.new_string, replaceAll: !!toolInput.replace_all}] :
            input.tool_name === "MultiEdit" ? (toolInput.edits || []).map(edit => ({oldText: edit.old_string,
                newText: edit.new_string, replaceAll: !!edit.replace_all})) : null;
        args.toolFailed = event === "PostToolUseFailure" || !!(input.tool_response &&
            (input.tool_response.is_error || input.tool_response.isError));
        const result = await peer("finishEdit", args);
        if (["conflict", "no-baseline"].includes(result.outcome)) {
            return {hookSpecificOutput: {hookEventName: event,
                additionalContext: "Phoenix preserved concurrent user edits in " + filePath +
                    ". Stop editing that file until the user resolves the conflict. " + JSON.stringify(result)}};
        }
    }
    return {};
}

exports.runHook = runHook;
exports.EVENTS = EVENTS;
exports.patchFiles = patchFiles;
