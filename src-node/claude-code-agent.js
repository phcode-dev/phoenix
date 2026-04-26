/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 *
 * This program is free software: you can redistribute it and/or modify it
 * under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT
 * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
 * FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License
 * for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see https://opensource.org/licenses/AGPL-3.0.
 *
 */

/**
 * Claude Code SDK integration via NodeConnector.
 *
 * Provides AI chat capabilities by bridging the Claude Code CLI/SDK
 * with Phoenix's browser-side chat panel. Handles streaming responses,
 * edit/write interception, and session management.
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { createEditorMcpServer } = require("./mcp-editor-tools");

const isWindows = process.platform === "win32";

const CONNECTOR_ID = "ph_ai_claude";

const CLARIFICATION_HINT =
    " IMPORTANT: The user has typed a follow-up clarification while you were working." +
    " Call the getUserClarification tool to read it before proceeding.";

// Lazy-loaded ESM module reference
let queryModule = null;

// Session state
let currentSessionId = null;

// Active query state
let currentAbortController = null;

// Lazily-initialized in-process MCP server for editor context
let editorMcpServer = null;

// Streaming throttle
const TEXT_STREAM_THROTTLE_MS = 50;

// Pending question resolver — used by AskUserQuestion hook
let _questionResolve = null;

// Pending plan resolver — used by ExitPlanMode stream interception
let _planResolve = null;

// Pending bash confirmation resolver — used by Bash PreToolUse hook (Edit Mode)
let _bashConfirmResolve = null;

// Pending plan-mode write confirmation resolver — set when an Edit/Write
// fires in plan mode and we're awaiting the user's "Allow & Switch to Edit
// Mode" / "Stay in Plan Mode" choice from the browser.
let _planModeConfirmResolve = null;

// Stores rejection feedback when user rejects a plan
let _planRejectionFeedback = null;

// Stores the last plan content written to .claude/plans/
let _lastPlanContent = null;

// Flag set when user approves a plan
let _planApproved = false;

// Queued clarification from the user (typed while AI is streaming)
// Shape: { text: string, images: [{mediaType, base64Data}] } or null
let _queuedClarification = null;

const nodeConnector = global.createNodeConnector(CONNECTOR_ID, exports);

/**
 * Detect whether a PostToolUse `tool_response` represents an error result.
 * Used to suppress diff-card painting when the SDK's native Edit/Write itself
 * failed (e.g. oldText not found on disk). The shape of tool_response is
 * `unknown` per the SDK types — handle the common variants defensively.
 */
function _isToolResponseError(toolResponse) {
    if (!toolResponse) { return false; }
    if (typeof toolResponse === "object") {
        if (toolResponse.is_error === true || toolResponse.isError === true) { return true; }
        if (Array.isArray(toolResponse.content)) {
            for (const c of toolResponse.content) {
                if (c && typeof c.text === "string" && /<tool_use_error>/i.test(c.text)) {
                    return true;
                }
            }
        }
    }
    if (typeof toolResponse === "string" && /<tool_use_error>/i.test(toolResponse)) {
        return true;
    }
    return false;
}

/**
 * Lazily import the ESM @anthropic-ai/claude-code module.
 */
async function getQueryFn() {
    if (!queryModule) {
        queryModule = await import("@anthropic-ai/claude-code");
    }
    return queryModule.query;
}

/**
 * Find the user's globally installed Claude CLI on Windows.
 */
function _findGlobalClaudeCliWin() {
    const userHome = process.env.USERPROFILE || process.env.HOME || "";
    const locations = [
        path.join(userHome, ".local", "bin", "claude.exe"),
        path.join(process.env.APPDATA || "", "npm", "claude.cmd"),
        path.join(process.env.LOCALAPPDATA || "", "Programs", "claude", "claude.exe")
    ];

    // Try 'where claude' first to find claude in PATH
    try {
        const allPaths = execSync("where claude", { encoding: "utf8" })
            .trim()
            .split("\r\n")
            .filter(p => p && !p.includes("node_modules"));
        if (allPaths.length > 0) {
            console.log("[Phoenix AI] Found global Claude CLI at:", allPaths[0]);
            return allPaths[0];
        }
    } catch {
        // where failed, try manual locations
    }

    // Check common Windows locations
    for (const loc of locations) {
        if (loc && fs.existsSync(loc)) {
            console.log("[Phoenix AI] Found global Claude CLI at:", loc);
            return loc;
        }
    }

    return null;
}

/**
 * Find the user's globally installed Claude CLI on macOS/Linux.
 */
function _findGlobalClaudeCliLinuxMac() {
    const locations = [
        "/usr/local/bin/claude",
        "/usr/bin/claude",
        (process.env.HOME || "") + "/.local/bin/claude",
        (process.env.HOME || "") + "/.nvm/versions/node/" +
            (process.version.startsWith("v") ? process.version : "v" + process.version) +
            "/bin/claude"
    ];

    // Try 'which -a' first to find all claude binaries, filtering out node_modules
    try {
        const allPaths = execSync("which -a claude 2>/dev/null || which claude", { encoding: "utf8" })
            .trim()
            .split("\n")
            .filter(p => p && !p.includes("node_modules"));
        if (allPaths.length > 0) {
            console.log("[Phoenix AI] Found global Claude CLI at:", allPaths[0]);
            return allPaths[0];
        }
    } catch {
        // which failed, try manual locations
    }

    // Check common locations
    for (const loc of locations) {
        try {
            execSync(`test -x "${loc}"`, { encoding: "utf8" });
            console.log("[Phoenix AI] Found global Claude CLI at:", loc);
            return loc;
        } catch {
            // Not found at this location
        }
    }

    return null;
}

/**
 * Find the user's globally installed Claude CLI, skipping node_modules copies.
 */
function findGlobalClaudeCli() {
    const claudePath = isWindows ? _findGlobalClaudeCliWin() : _findGlobalClaudeCliLinuxMac();
    if (!claudePath) {
        console.log("[Phoenix AI] Global Claude CLI not found");
    }
    return claudePath;
}

/**
 * Check whether Claude CLI is available.
 * Called from browser via execPeer("checkAvailability").
 */
exports.checkAvailability = async function () {
    try {
        const claudePath = findGlobalClaudeCli();
        if (!claudePath) {
            return { available: false, claudePath: null, error: "Claude Code CLI not found" };
        }
        // Check if user is logged in
        let loggedIn = false;
        try {
            const authOutput = execSync(claudePath + " auth status", {
                encoding: "utf8",
                timeout: 10000
            });
            const authStatus = JSON.parse(authOutput);
            loggedIn = authStatus.loggedIn === true;
        } catch (e) {
            // auth status failed — treat as not logged in
        }
        return { available: true, claudePath: claudePath, loggedIn: loggedIn };
    } catch (err) {
        return { available: false, claudePath: null, error: err.message };
    }
};

/**
 * Send a prompt to Claude and stream results back to the browser.
 * Called from browser via execPeer("sendPrompt", {prompt, projectPath, sessionAction, model}).
 *
 * Returns immediately with a requestId. Results are sent as events:
 *   aiProgress, aiTextStream, aiToolEdit, aiError, aiComplete
 */
exports.sendPrompt = async function (params) {
    const { prompt, projectPath, sessionAction, model, locale, selectionContext, images, envOverrides, permissionMode } = params;
    const requestId = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

    // Handle session
    if (sessionAction === "new") {
        currentSessionId = null;
    }

    // Clear any stale clarification from a previous turn
    _queuedClarification = null;

    // Cancel any in-flight query
    if (currentAbortController) {
        currentAbortController.abort();
        currentAbortController = null;
    }

    currentAbortController = new AbortController();

    // Prepend selection context to the prompt if available
    let enrichedPrompt = prompt;
    if (selectionContext) {
        if (selectionContext.selectedText) {
            enrichedPrompt =
                "The user has selected the following text in " + selectionContext.filePath +
                " (lines " + selectionContext.startLine + "-" + selectionContext.endLine + "):\n" +
                "```\n" + selectionContext.selectedText + "\n```\n\n" + prompt;
        } else {
            let previewSnippet = "";
            if (selectionContext.selectionPreview) {
                previewSnippet = "\nPreview of selection:\n```\n" +
                    selectionContext.selectionPreview + "\n```\n";
            }
            enrichedPrompt =
                "The user has selected lines " + selectionContext.startLine + "-" +
                selectionContext.endLine + " in " + selectionContext.filePath +
                ". Use the Read tool with offset=" + (selectionContext.startLine - 1) +
                " and limit=" + (selectionContext.endLine - selectionContext.startLine + 1) +
                " to read the selected content if needed." + previewSnippet + "\n" + prompt;
        }
    }

    // Run the query asynchronously — don't await here so we return requestId immediately
    _runQuery(requestId, enrichedPrompt, projectPath, model, currentAbortController.signal, locale, images, envOverrides, permissionMode)
        .catch(err => {
            console.error("[Phoenix AI] Query error:", err);
        });

    return { requestId: requestId };
};

/**
 * Cancel the current in-flight query.
 */
exports.cancelQuery = async function () {
    if (currentAbortController) {
        currentAbortController.abort();
        currentAbortController = null;
        // Keep currentSessionId so the next prompt resumes the same SDK session.
        // Aborts leave an interrupt marker in the session log, not a corrupted state.
        // Clear any pending question or plan
        _questionResolve = null;
        _planResolve = null;
        _bashConfirmResolve = null;
        _planModeConfirmResolve = null;
        _queuedClarification = null;
        return { success: true };
    }
    return { success: false };
};

/**
 * Receive the user's answer to an AskUserQuestion prompt.
 * Called from browser via execPeer("answerQuestion", {answers}).
 */
exports.answerQuestion = async function (params) {
    if (_questionResolve) {
        _questionResolve(params);
        _questionResolve = null;
    }
    return { success: true };
};

/**
 * Receive the user's response to a proposed plan.
 * Called from browser via execPeer("answerPlan", {approved, feedback}).
 */
exports.answerPlan = async function (params) {
    if (_planResolve) {
        _planResolve(params);
        _planResolve = null;
    }
    return { success: true };
};

/**
 * Receive the user's response to a bash confirmation prompt (Edit Mode).
 * Called from browser via execPeer("answerBashConfirm", {allowed}).
 */
exports.answerBashConfirm = async function (params) {
    if (_bashConfirmResolve) {
        _bashConfirmResolve(params);
        _bashConfirmResolve = null;
    }
    return { success: true };
};

/**
 * Receive the user's response to a plan-mode write confirmation prompt.
 * Called from browser via execPeer("answerPlanModeWriteConfirm", {approved}).
 */
exports.answerPlanModeWriteConfirm = async function (params) {
    if (_planModeConfirmResolve) {
        _planModeConfirmResolve(params);
        _planModeConfirmResolve = null;
    }
    return { success: true };
};

/**
 * Resume a previous session by setting the session ID.
 * The next sendPrompt call will use queryOptions.resume with this session ID.
 */
exports.resumeSession = async function (params) {
    if (currentAbortController) {
        currentAbortController.abort();
        currentAbortController = null;
    }
    _questionResolve = null;
    _planResolve = null;
    _bashConfirmResolve = null;
    _queuedClarification = null;
    currentSessionId = params.sessionId;
    return { success: true };
};

/**
 * Destroy the current session (clear session ID).
 */
exports.destroySession = async function () {
    currentSessionId = null;
    currentAbortController = null;
    _queuedClarification = null;
    return { success: true };
};

/**
 * Queue a clarification message from the user (typed while AI is streaming).
 * If text is already queued, appends with a newline.
 */
exports.queueClarification = async function (params) {
    const newImages = params.images || [];
    if (_queuedClarification) {
        if (params.text) {
            _queuedClarification.text += "\n" + params.text;
        }
        _queuedClarification.images = _queuedClarification.images.concat(newImages);
    } else {
        _queuedClarification = {
            text: params.text || "",
            images: newImages
        };
    }
    return { success: true };
};

/**
 * Get and clear the queued clarification (text + images).
 * Called by the getUserClarification MCP tool.
 */
exports.getAndClearClarification = async function () {
    const result = _queuedClarification;
    _queuedClarification = null;
    return result || { text: null, images: [] };
};

/**
 * Clear any queued clarification without reading it.
 * Used when the user clicks Edit on the queue bubble.
 */
exports.clearClarification = async function () {
    _queuedClarification = null;
    return { success: true };
};

/**
 * Internal: run a Claude SDK query and stream results back to the browser.
 */
async function _runQuery(requestId, prompt, projectPath, model, signal, locale, images, envOverrides, permissionMode) {
    let editCount = 0;
    let toolCounter = 0;
    // SDK tool_use id (e.g. "toolu_01...") → our sequential toolCounter so a
    // tool_result block can be mapped back to its indicator on the browser.
    const _toolUseIdToCounter = {};
    // Set true once the user clicks "Allow & Switch to Edit Mode" on a
    // plan-mode write confirmation. Subsequent Edit/Write attempts in the same
    // turn skip the prompt and use the cached "allow" decision so a multi-edit
    // turn doesn't pop a dialog before every edit.
    let _planExitApprovedThisTurn = false;
    let queryFn;
    let connectionTimer = null;

    try {
        queryFn = await getQueryFn();
        if (!editorMcpServer) {
            editorMcpServer = createEditorMcpServer(queryModule, nodeConnector, {
                hasClarification: function () { return !!_queuedClarification; },
                getAndClearClarification: exports.getAndClearClarification
            });
        }
    } catch (err) {
        nodeConnector.triggerPeer("aiError", {
            requestId: requestId,
            error: "Failed to load Claude Code SDK: " + err.message
        });
        return;
    }

    // Send initial progress
    nodeConnector.triggerPeer("aiProgress", {
        requestId: requestId,
        message: "Analyzing...",
        phase: "start"
    });

    if (envOverrides) {
        const keys = Object.keys(envOverrides);
        console.log("[AI] Using env overrides:", keys.map(k => k + "=" + (k.includes("TOKEN") || k.includes("KEY") ? "***" : envOverrides[k])).join(", "));
    }

    let _lastStderrLines = [];
    const MAX_STDERR_LINES = 50;
    let _hookErrorBuffer = "";
    let _hookErrorTimer = null;
    const HOOK_ERROR_FLUSH_MS = 200;

    function _flushHookError() {
        if (_hookErrorBuffer) {
            const trimmed = _hookErrorBuffer.trim();
            console.error("[AI hook callback error] SDK threw delivering hook payload" +
                " — tool likely ran natively in acceptEdits mode:\n" + trimmed);
            try {
                nodeConnector.triggerPeer("aiHookError", {
                    requestId: requestId,
                    error: trimmed
                });
            } catch (e) { /* peer may be gone — ignore */ }
            _hookErrorBuffer = "";
        }
        _hookErrorTimer = null;
    }

    const queryOptions = {
        cwd: projectPath || process.cwd(),
        maxTurns: undefined,
        stderr: (data) => {
            console.log("[AI stderr]", data);
            _lastStderrLines.push(data);
            if (_lastStderrLines.length > MAX_STDERR_LINES) {
                _lastStderrLines.shift();
            }
            // Collect consecutive lines belonging to a hook callback error so
            // we can log the full burst as one block. The SDK fragments the
            // error across multiple stderr writes which is hard to read.
            if (_hookErrorBuffer || /Error in hook callback/.test(data)) {
                _hookErrorBuffer += data + "\n";
                clearTimeout(_hookErrorTimer);
                _hookErrorTimer = setTimeout(_flushHookError, HOOK_ERROR_FLUSH_MS);
            }
        },
        allowedTools: [
            "Read", "Edit", "Write", "Glob", "Grep", "Bash",
            "AskUserQuestion", "Task",
            "TodoRead", "TodoWrite",
            "WebFetch", "WebSearch",
            "EnterPlanMode", "ExitPlanMode",
            "mcp__phoenix-editor__getEditorState",
            "mcp__phoenix-editor__takeScreenshot",
            "mcp__phoenix-editor__execJsInLivePreview",
            "mcp__phoenix-editor__controlEditor",
            "mcp__phoenix-editor__resizeLivePreview",
            "mcp__phoenix-editor__wait",
            "mcp__phoenix-editor__getUserClarification"
        ],
        agents: {
            "researcher": {
                description: "Explores the codebase, reads files, and searches" +
                    " for patterns. Use for research tasks.",
                prompt: "You are a code research assistant. Search and read" +
                    " files to answer questions. Do not modify files.",
                tools: ["Read", "Glob", "Grep",
                    "mcp__phoenix-editor__getEditorState",
                    "mcp__phoenix-editor__takeScreenshot",
                    "mcp__phoenix-editor__execJsInLivePreview"]
            },
            "coder": {
                description: "Reads, edits, and writes code files." +
                    " Use for implementation tasks.",
                prompt: "You are a coding assistant. Implement the requested" +
                    " changes using Edit for existing files and Write" +
                    " only for new files.",
                tools: ["Read", "Edit", "Write", "Glob", "Grep",
                    "mcp__phoenix-editor__getEditorState",
                    "mcp__phoenix-editor__takeScreenshot",
                    "mcp__phoenix-editor__execJsInLivePreview"]
            }
        },
        mcpServers: { "phoenix-editor": editorMcpServer },
        permissionMode: permissionMode || "acceptEdits",
        appendSystemPrompt:
            "When modifying an existing file, always prefer the Edit tool " +
            "(find-and-replace) instead of the Write tool. The Write tool should ONLY be used " +
            "to create brand new files that do not exist yet. For existing files, always use " +
            "multiple Edit calls to make targeted changes rather than rewriting the entire " +
            "file with Write. This is critical because Write replaces the entire file content " +
            "which is slow and loses undo history." +
            "\n\nWhen the user asks about the current file, open files, or what they are working on, " +
            "call getEditorState first — it returns the active file path, working set, cursor position, " +
            "and selection. Do NOT search the filesystem to answer these questions blindly." +
            "\n\nAlways use full absolute paths for all file operations (Read, Edit, Write, " +
            "controlEditor). Never use relative paths." +
            "\n\nWhen a tool response mentions the user has typed a clarification, immediately " +
            "call getUserClarification to read it and incorporate the user's feedback into your current work." +
            "\n\nYou are running inside Phoenix Code, a web-focused code editor with a built-in " +
            "live preview for HTML/CSS/JS. When the user asks to create mockups, prototypes, " +
            "or web pages, prefer vanilla HTML/CSS/JS so the live preview can render and " +
            "edit them — unless the user specifically requests a framework. " +
            "Build responsive layouts by default for web content." +
            "\n\nWhen planning, consider if verification is needed. takeScreenshot can " +
            "capture the full editor, specific panels, the code area, or the live preview. " +
            "For HTML/CSS/JS with live preview, execJsInLivePreview can run JS in the " +
            "browser to confirm behavior." +
            "\n\nUse your best judgement for when to enter plan mode. Use it when the task " +
            "involves creating new applications, extensive modifications, or architectural " +
            "changes — propose a plan for user approval before writing code." +
            (locale && !locale.startsWith("en")
                ? "\n\nThe user's display language is " + locale + ". " +
                  "Respond in this language unless they write in a different language."
                : ""),
        includePartialMessages: true,
        abortController: currentAbortController,
        env: envOverrides ? Object.assign({}, process.env, envOverrides) : undefined,
        hooks: {
            PreToolUse: [
                {
                    matcher: "Edit",
                    hooks: [
                        async (input) => {
                            console.log("[Phoenix AI] Intercepted Edit tool");
                            // Plan file edits: capture content, write to disk, skip editor
                            const editPath = (input.tool_input.file_path || "").replace(/\\/g, "/");
                            if (editPath.includes("/.claude/plans/")) {
                                try {
                                    let content = "";
                                    if (fs.existsSync(input.tool_input.file_path)) {
                                        content = fs.readFileSync(input.tool_input.file_path, "utf8");
                                    }
                                    if (input.tool_input.old_string && input.tool_input.new_string) {
                                        if (input.tool_input.replace_all === true) {
                                            content = content.split(input.tool_input.old_string)
                                                .join(input.tool_input.new_string);
                                        } else {
                                            content = content.replace(input.tool_input.old_string,
                                                input.tool_input.new_string);
                                        }
                                    }
                                    const dir = path.dirname(input.tool_input.file_path);
                                    if (!fs.existsSync(dir)) {
                                        fs.mkdirSync(dir, { recursive: true });
                                    }
                                    fs.writeFileSync(input.tool_input.file_path, content, "utf8");
                                    _lastPlanContent = content;
                                    console.log("[Phoenix AI] Captured plan edit content:", content.length + "ch");
                                } catch (err) {
                                    console.warn("[Phoenix AI] Failed to edit plan file:", err.message);
                                }
                                let planReason = "Plan file updated.";
                                if (_queuedClarification) {
                                    planReason += CLARIFICATION_HINT;
                                }
                                return {
                                    hookSpecificOutput: {
                                        hookEventName: "PreToolUse",
                                        permissionDecision: "deny",
                                        permissionDecisionReason: planReason
                                    }
                                };
                            }
                            // Plan mode + user-file Edit: ask the user whether
                            // to switch to Edit Mode. Mirrors the Bash confirm
                            // pattern (matcher: "Bash"). Once approved, the
                            // _planExitApprovedThisTurn flag suppresses the
                            // prompt for subsequent edits in the same turn.
                            const filePath = input.tool_input.file_path;
                            if (permissionMode === "plan" && !_planExitApprovedThisTurn) {
                                nodeConnector.triggerPeer("aiPlanModeWriteConfirm", {
                                    requestId: requestId,
                                    toolName: "Edit",
                                    filePath: filePath
                                });
                                let response;
                                try {
                                    response = await new Promise((resolve, reject) => {
                                        _planModeConfirmResolve = resolve;
                                        if (signal.aborted) {
                                            _planModeConfirmResolve = null;
                                            reject(new Error("Aborted"));
                                            return;
                                        }
                                        const onAbort = () => {
                                            _planModeConfirmResolve = null;
                                            reject(new Error("Aborted"));
                                        };
                                        signal.addEventListener("abort", onAbort, { once: true });
                                    });
                                } catch (err) {
                                    return {
                                        hookSpecificOutput: {
                                            hookEventName: "PreToolUse",
                                            permissionDecision: "deny",
                                            permissionDecisionReason: "Edit cancelled."
                                        }
                                    };
                                }
                                if (!response.approved) {
                                    return {
                                        hookSpecificOutput: {
                                            hookEventName: "PreToolUse",
                                            permissionDecision: "deny",
                                            permissionDecisionReason: "User chose to stay in Plan Mode. " +
                                                "Use the ExitPlanMode tool to propose your changes for " +
                                                "approval before editing."
                                        }
                                    };
                                }
                                _planExitApprovedThisTurn = true;
                            }
                            // New flow: flush dirty buffer to disk so SDK reads
                            // the latest content, capture pre-edit content for
                            // snapshot tracking, then return {} (or "allow" if
                            // we're auto-exiting plan mode) so SDK runs native
                            // Edit on disk. Its mtime/read tracker stays
                            // consistent and the next Edit won't trip the
                            // "modified since read" safety check.
                            const oldString = input.tool_input.old_string;
                            let captured = { content: "" };
                            try {
                                await nodeConnector.execPeer("saveBufferToDisk", { filePath });
                                captured = await nodeConnector.execPeer(
                                    "captureFileContent", { filePath }) || captured;
                            } catch (err) {
                                console.warn("[Phoenix AI] Edit prep failed:", filePath, err.message);
                            }
                            // Pre-check: if the text to replace is no longer in
                            // the file (user typed/changed it since the last
                            // Read), deny with an informative reason instead of
                            // letting the SDK fail with a generic "oldText not
                            // found". Phoenix sees the buffer state the SDK
                            // can't, so this is a more useful failure.
                            if (oldString && (captured.content || "").indexOf(oldString) === -1) {
                                let reason = "Edit FAILED: the text you wanted to replace is not " +
                                    "present in the file. It may have been modified by the user " +
                                    "or by another tool since you last read it. Read the file again " +
                                    "to see the current content before retrying.";
                                if (_queuedClarification) {
                                    reason += CLARIFICATION_HINT;
                                }
                                return {
                                    hookSpecificOutput: {
                                        hookEventName: "PreToolUse",
                                        permissionDecision: "deny",
                                        permissionDecisionReason: reason
                                    }
                                };
                            }
                            editCount++;
                            // In plan mode, after the user approved the
                            // confirmation prompt, we need an explicit "allow"
                            // to override the SDK's default plan-mode block.
                            if (permissionMode === "plan") {
                                return {
                                    hookSpecificOutput: {
                                        hookEventName: "PreToolUse",
                                        permissionDecision: "allow"
                                    }
                                };
                            }
                            return {};
                        }
                    ]
                },
                {
                    matcher: "Read",
                    hooks: [
                        async (input) => {
                            if (!input || !input.tool_input || !input.tool_input.file_path) {
                                return {};
                            }
                            // Flush dirty buffer to disk so the SDK's native
                            // Read sees what the user is actually looking at.
                            // Returning {} lets the SDK run native Read so its
                            // read-tracker updates — required to avoid "file
                            // not read yet" rejections on subsequent edits.
                            try {
                                await nodeConnector.execPeer("saveBufferToDisk",
                                    { filePath: input.tool_input.file_path });
                            } catch (err) {
                                console.warn("[Phoenix AI] Read prep failed:",
                                    input.tool_input.file_path, err.message);
                            }
                            return {};
                        }
                    ]
                },
                {
                    matcher: "Write",
                    hooks: [
                        async (input) => {
                            console.log("[Phoenix AI] Intercepted Write tool");
                            // Capture plan content when writing to .claude/plans/
                            // Plan files: capture content for plan card, write to disk
                            // but don't open in editor
                            const writePath = input.tool_input.file_path || "";
                            const normalizedPath = writePath.replace(/\\/g, "/");
                            if (normalizedPath.includes("/.claude/plans/")) {
                                _lastPlanContent = input.tool_input.content || "";
                                console.log("[Phoenix AI] Captured plan content:",
                                    _lastPlanContent.length + "ch");
                                // Write to disk so Claude can read it back later
                                try {
                                    const dir = path.dirname(writePath);
                                    if (!fs.existsSync(dir)) {
                                        fs.mkdirSync(dir, { recursive: true });
                                    }
                                    fs.writeFileSync(writePath, input.tool_input.content || "", "utf8");
                                } catch (err) {
                                    console.warn("[Phoenix AI] Failed to write plan file:", err.message);
                                }
                                let planReason = "Plan file saved.";
                                if (_queuedClarification) {
                                    planReason += CLARIFICATION_HINT;
                                }
                                return {
                                    hookSpecificOutput: {
                                        hookEventName: "PreToolUse",
                                        permissionDecision: "deny",
                                        permissionDecisionReason: planReason
                                    }
                                };
                            }
                            // Plan mode + user-file Write: same confirmation
                            // path as Edit. See Edit hook above for rationale.
                            const filePath = input.tool_input.file_path;
                            if (permissionMode === "plan" && !_planExitApprovedThisTurn) {
                                nodeConnector.triggerPeer("aiPlanModeWriteConfirm", {
                                    requestId: requestId,
                                    toolName: "Write",
                                    filePath: filePath
                                });
                                let response;
                                try {
                                    response = await new Promise((resolve, reject) => {
                                        _planModeConfirmResolve = resolve;
                                        if (signal.aborted) {
                                            _planModeConfirmResolve = null;
                                            reject(new Error("Aborted"));
                                            return;
                                        }
                                        const onAbort = () => {
                                            _planModeConfirmResolve = null;
                                            reject(new Error("Aborted"));
                                        };
                                        signal.addEventListener("abort", onAbort, { once: true });
                                    });
                                } catch (err) {
                                    return {
                                        hookSpecificOutput: {
                                            hookEventName: "PreToolUse",
                                            permissionDecision: "deny",
                                            permissionDecisionReason: "Write cancelled."
                                        }
                                    };
                                }
                                if (!response.approved) {
                                    return {
                                        hookSpecificOutput: {
                                            hookEventName: "PreToolUse",
                                            permissionDecision: "deny",
                                            permissionDecisionReason: "User chose to stay in Plan Mode. " +
                                                "Use the ExitPlanMode tool to propose your changes for " +
                                                "approval before writing."
                                        }
                                    };
                                }
                                _planExitApprovedThisTurn = true;
                            }
                            // Mirror Edit: flush dirty buffer, capture pre-write
                            // content, return {} (or "allow" in plan mode) so
                            // SDK writes natively.
                            try {
                                await nodeConnector.execPeer("saveBufferToDisk", { filePath });
                                await nodeConnector.execPeer("captureFileContent", { filePath });
                            } catch (err) {
                                console.warn("[Phoenix AI] Write prep failed:", filePath, err.message);
                            }
                            editCount++;
                            if (permissionMode === "plan") {
                                return {
                                    hookSpecificOutput: {
                                        hookEventName: "PreToolUse",
                                        permissionDecision: "allow"
                                    }
                                };
                            }
                            return {};
                        }
                    ]
                },
                {
                    matcher: "Bash",
                    hooks: [
                        async (input) => {
                            if (permissionMode !== "acceptEdits") {
                                // Plan mode: SDK handles. Full Auto: allow freely.
                                return {};
                            }
                            // Edit Mode: ask user confirmation before running bash
                            const command = input.tool_input.command || "";
                            console.log("[Phoenix AI] Bash confirmation requested:", command.slice(0, 80));
                            nodeConnector.triggerPeer("aiBashConfirm", {
                                requestId: requestId,
                                command: command,
                                toolId: toolCounter
                            });
                            const response = await new Promise((resolve, reject) => {
                                _bashConfirmResolve = resolve;
                                if (signal.aborted) {
                                    _bashConfirmResolve = null;
                                    reject(new Error("Aborted"));
                                    return;
                                }
                                const onAbort = () => {
                                    _bashConfirmResolve = null;
                                    reject(new Error("Aborted"));
                                };
                                signal.addEventListener("abort", onAbort, { once: true });
                            });
                            if (response.allowed) {
                                return {};
                            }
                            return {
                                hookSpecificOutput: {
                                    hookEventName: "PreToolUse",
                                    permissionDecision: "deny",
                                    permissionDecisionReason: "User denied this command."
                                }
                            };
                        }
                    ]
                },
                {
                    matcher: "AskUserQuestion",
                    hooks: [
                        async (input) => {
                            console.log("[Phoenix AI] Intercepted AskUserQuestion");
                            const questions = input.tool_input.questions || [];
                            nodeConnector.triggerPeer("aiQuestion", {
                                requestId: requestId,
                                questions: questions
                            });
                            // Wait for the user's answer from the browser UI
                            const answer = await new Promise((resolve, reject) => {
                                _questionResolve = resolve;
                                if (signal.aborted) {
                                    _questionResolve = null;
                                    reject(new Error("Aborted"));
                                    return;
                                }
                                const onAbort = () => {
                                    _questionResolve = null;
                                    reject(new Error("Aborted"));
                                };
                                signal.addEventListener("abort", onAbort, { once: true });
                            });
                            // Format answers as readable text for the AI
                            let answerText = "";
                            if (answer.answers) {
                                const keys = Object.keys(answer.answers);
                                keys.forEach(function (q) {
                                    answerText += "Q: " + q + "\nA: " + answer.answers[q] + "\n\n";
                                });
                            }
                            return {
                                hookSpecificOutput: {
                                    hookEventName: "PreToolUse",
                                    permissionDecision: "deny",
                                    permissionDecisionReason: answerText.trim() || "No answer provided"
                                }
                            };
                        }
                    ]
                }
            ],
            PostToolUse: [
                {
                    matcher: "Edit",
                    hooks: [
                        async (input, toolUseID) => {
                            const filePath = input && input.tool_input && input.tool_input.file_path;
                            if (!filePath) { return {}; }
                            // Plan files don't go through the editor
                            if (filePath.replace(/\\/g, "/").includes("/.claude/plans/")) {
                                return {};
                            }
                            // If the SDK's native Edit itself failed (e.g.
                            // oldText not found on disk), don't paint a diff
                            // card. The existing aiToolResult flow will
                            // classify the indicator from the tool_result.
                            if (_isToolResponseError(input.tool_response)) {
                                return {};
                            }
                            const editPayload = {
                                file: filePath,
                                oldText: input.tool_input.old_string,
                                newText: input.tool_input.new_string,
                                replaceAll: input.tool_input.replace_all === true
                            };
                            // 1. Prefer applying the edit directly to the open
                            //    buffer via doc.replaceRange — preserves
                            //    CodeMirror marks outside the edit region (live
                            //    preview HTML element marks). Falls back to a
                            //    full refreshDocumentFromDisk if no doc is open
                            //    or the buffer no longer contains old_string
                            //    (e.g. user typed since save).
                            let result = {};
                            try {
                                result = await nodeConnector.execPeer(
                                    "applyEditToOpenBufferOnly", editPayload) || {};
                            } catch (err) {
                                console.warn("[Phoenix AI] applyEditToOpenBufferOnly failed:", filePath, err.message);
                            }
                            if (!result.applied) {
                                try {
                                    result = await nodeConnector.execPeer(
                                        "refreshDocumentFromDisk", { filePath }) || result;
                                } catch (err) {
                                    console.warn("[Phoenix AI] Edit refresh fallback failed:", filePath, err.message);
                                }
                            }
                            // 2. Trigger aiToolEdit so the AI panel renders the
                            //    diff card and the snapshot store records it.
                            const counterId = _toolUseIdToCounter[toolUseID];
                            if (counterId !== undefined) {
                                editPayload.isLivePreviewRelated = !!result.isLivePreviewRelated;
                                nodeConnector.triggerPeer("aiToolEdit", {
                                    requestId: requestId,
                                    toolId: counterId,
                                    edit: editPayload
                                });
                            }
                            // Catch-all PostToolUse below handles clarification.
                            return {};
                        }
                    ]
                },
                {
                    matcher: "Write",
                    hooks: [
                        async (input, toolUseID) => {
                            const filePath = input && input.tool_input && input.tool_input.file_path;
                            if (!filePath) { return {}; }
                            if (filePath.replace(/\\/g, "/").includes("/.claude/plans/")) {
                                return {};
                            }
                            if (_isToolResponseError(input.tool_response)) {
                                return {};
                            }
                            let refreshResult = {};
                            try {
                                refreshResult = await nodeConnector.execPeer(
                                    "refreshDocumentFromDisk", { filePath }) || {};
                            } catch (err) {
                                console.warn("[Phoenix AI] Write refresh failed:", filePath, err.message);
                            }
                            const counterId = _toolUseIdToCounter[toolUseID];
                            if (counterId !== undefined) {
                                nodeConnector.triggerPeer("aiToolEdit", {
                                    requestId: requestId,
                                    toolId: counterId,
                                    edit: {
                                        file: filePath,
                                        oldText: null,
                                        newText: input.tool_input.content,
                                        isLivePreviewRelated: !!refreshResult.isLivePreviewRelated
                                    }
                                });
                            }
                            // Catch-all PostToolUse below handles clarification.
                            return {};
                        }
                    ]
                },
                {
                    // Catch-all: surface a queued user follow-up after every
                    // tool. Edit/Write/Read have their own hooks above, but
                    // any tool can be a meaningful checkpoint (Bash, Grep,
                    // Glob, WebFetch, Task, the Phoenix MCP tools, etc.) so
                    // we register one matcher-less hook that just returns
                    // the clarification context if any is queued. Once
                    // getUserClarification runs and clears _queuedClarification,
                    // _maybeClarifyContext returns {} and this becomes a no-op.
                    hooks: [
                        async () => {
                            return _maybeClarifyContext();
                        }
                    ]
                }
            ]
        }
    };

    // Returns a PostToolUse SyncHookJSONOutput that injects the clarification
    // hint as additionalContext when the user has typed a follow-up while the
    // AI is streaming. With our PreToolUse hooks now returning {} (allow), the
    // old practice of appending CLARIFICATION_HINT to permissionDecisionReason
    // no longer reaches Claude — PostToolUse additionalContext is the new path.
    function _maybeClarifyContext() {
        if (!_queuedClarification) { return {}; }
        return {
            hookSpecificOutput: {
                hookEventName: "PostToolUse",
                additionalContext: CLARIFICATION_HINT
            }
        };
    }

    // Set Claude CLI path if found
    const claudePath = findGlobalClaudeCli();
    if (claudePath) {
        queryOptions.pathToClaudeCodeExecutable = claudePath;
    }

    if (model) {
        queryOptions.model = model;
    }


    // Resume session if we have an existing one (already cleared if sessionAction was "new")
    if (currentSessionId) {
        queryOptions.resume = currentSessionId;
    }

    const _log = (...args) => console.log("[AI]", ...args);

    try {
        _log("Query start:", JSON.stringify(prompt).slice(0, 80), "cwd=" + (projectPath || "?"));

        // Build prompt: multi-modal with images, or plain string
        let sdkPrompt = prompt;
        if (images && images.length > 0) {
            const contentBlocks = [{ type: "text", text: prompt }];
            images.forEach(function (img, idx) {
                // Infer media type from base64 header if missing
                let mediaType = img.mediaType;
                if (!mediaType && img.base64Data) {
                    if (img.base64Data.startsWith("iVBOR")) {
                        mediaType = "image/png";
                    } else if (img.base64Data.startsWith("/9j/")) {
                        mediaType = "image/jpeg";
                    } else if (img.base64Data.startsWith("R0lGOD")) {
                        mediaType = "image/gif";
                    } else if (img.base64Data.startsWith("UklGR")) {
                        mediaType = "image/webp";
                    } else {
                        mediaType = "image/png";
                    }
                }
                _log("Image[" + idx + "]:", "mediaType=" + mediaType,
                    "base64Len=" + (img.base64Data ? img.base64Data.length : "null"));
                contentBlocks.push({
                    type: "image",
                    source: { type: "base64", media_type: mediaType, data: img.base64Data }
                });
            });
            sdkPrompt = (async function* () {
                yield {
                    type: "user",
                    session_id: currentSessionId || "",
                    message: { role: "user", content: contentBlocks },
                    parent_tool_use_id: null
                };
            })();
        }

        const result = queryFn({
            prompt: sdkPrompt,
            options: queryOptions
        });

        let accumulatedText = "";
        let lastStreamTime = 0;

        // Tool input tracking (parent-level)
        let activeToolName = null;
        let activeToolIndex = null;
        let activeToolInputJson = "";
        let lastToolStreamTime = 0;

        // Sub-agent tool tracking
        let subagentToolName = null;
        let subagentToolIndex = null;
        let subagentToolInputJson = "";
        let lastSubagentToolStreamTime = 0;

        // Trace counters (logged at tool/query completion, not per-delta)
        let toolDeltaCount = 0;
        let toolStreamSendCount = 0;
        let textDeltaCount = 0;
        let textStreamSendCount = 0;

        // Connection timeout — abort if no messages within 60s
        let receivedFirstMessage = false;
        const CONNECTION_TIMEOUT_MS = 60000;
        connectionTimer = setTimeout(() => {
            if (!receivedFirstMessage && !signal.aborted) {
                _log("Connection timeout — no response in " + (CONNECTION_TIMEOUT_MS / 1000) + "s");
                const stderrHint = _lastStderrLines
                    .filter(line => !line.startsWith("Spawning Claude Code"))
                    .join("\n").trim();
                let timeoutMsg = "Connection timed out — no response from API after " +
                    (CONNECTION_TIMEOUT_MS / 1000) + " seconds.";
                if (envOverrides && envOverrides.ANTHROPIC_BASE_URL) {
                    timeoutMsg += " Check that the Base URL (" + envOverrides.ANTHROPIC_BASE_URL +
                        ") is correct and reachable.";
                }
                if (stderrHint) {
                    timeoutMsg += "\n" + stderrHint;
                }
                nodeConnector.triggerPeer("aiError", {
                    requestId: requestId,
                    error: timeoutMsg
                });
                currentAbortController.abort();
            }
        }, CONNECTION_TIMEOUT_MS);

        for await (const message of result) {
            if (!receivedFirstMessage) {
                receivedFirstMessage = true;
                clearTimeout(connectionTimer);
            }
            // Check abort
            if (signal.aborted) {
                _log("Aborted");
                break;
            }

            // Capture session_id from first message
            if (message.session_id && !currentSessionId) {
                currentSessionId = message.session_id;
                _log("Session:", currentSessionId);
            }

            // Handle streaming events
            if (message.type === "stream_event") {
                const event = message.event;
                const isSubagent = !!message.parent_tool_use_id;

                if (isSubagent) {
                    // --- Sub-agent events ---

                    // Sub-agent tool use start
                    if (event.type === "content_block_start" &&
                        event.content_block?.type === "tool_use") {
                        subagentToolName = event.content_block.name;
                        subagentToolIndex = event.index;
                        subagentToolInputJson = "";
                        toolCounter++;
                        lastSubagentToolStreamTime = 0;
                        _log("Subagent tool start:", subagentToolName, "#" + toolCounter);
                        nodeConnector.triggerPeer("aiProgress", {
                            requestId: requestId,
                            toolName: subagentToolName,
                            toolId: toolCounter,
                            phase: "tool_use"
                        });
                    }

                    // Sub-agent tool input streaming
                    if (event.type === "content_block_delta" &&
                        event.delta?.type === "input_json_delta" &&
                        event.index === subagentToolIndex) {
                        subagentToolInputJson += event.delta.partial_json;
                        const now = Date.now();
                        if (subagentToolInputJson &&
                            now - lastSubagentToolStreamTime >= TEXT_STREAM_THROTTLE_MS) {
                            lastSubagentToolStreamTime = now;
                            nodeConnector.triggerPeer("aiToolStream", {
                                requestId: requestId,
                                toolId: toolCounter,
                                toolName: subagentToolName,
                                partialJson: subagentToolInputJson
                            });
                        }
                    }

                    // Sub-agent tool block complete
                    if (event.type === "content_block_stop" &&
                        event.index === subagentToolIndex &&
                        subagentToolName) {
                        if (subagentToolInputJson) {
                            nodeConnector.triggerPeer("aiToolStream", {
                                requestId: requestId,
                                toolId: toolCounter,
                                toolName: subagentToolName,
                                partialJson: subagentToolInputJson
                            });
                        }
                        let toolInput = {};
                        try {
                            toolInput = JSON.parse(subagentToolInputJson);
                        } catch (e) {
                            // ignore parse errors
                        }
                        _log("Subagent tool done:", subagentToolName, "#" + toolCounter,
                            "json=" + subagentToolInputJson.length + "ch");
                        nodeConnector.triggerPeer("aiToolInfo", {
                            requestId: requestId,
                            toolName: subagentToolName,
                            toolId: toolCounter,
                            toolInput: toolInput
                        });
                        subagentToolName = null;
                        subagentToolIndex = null;
                        subagentToolInputJson = "";
                    }

                    // Sub-agent text deltas — stream as regular text
                    if (event.type === "content_block_delta" &&
                        event.delta?.type === "text_delta") {
                        accumulatedText += event.delta.text;
                        textDeltaCount++;
                        const now = Date.now();
                        if (now - lastStreamTime >= TEXT_STREAM_THROTTLE_MS) {
                            lastStreamTime = now;
                            textStreamSendCount++;
                            nodeConnector.triggerPeer("aiTextStream", {
                                requestId: requestId,
                                text: accumulatedText
                            });
                            accumulatedText = "";
                        }
                    }
                } else {
                    // --- Parent-level events (unchanged) ---

                    // Tool use start — send initial indicator
                    if (event.type === "content_block_start" &&
                        event.content_block?.type === "tool_use") {
                        activeToolName = event.content_block.name;
                        activeToolIndex = event.index;
                        activeToolInputJson = "";
                        toolCounter++;
                        toolDeltaCount = 0;
                        toolStreamSendCount = 0;
                        lastToolStreamTime = 0;
                        // Map the SDK's tool_use id → our toolCounter so we can
                        // correlate later tool_result blocks back to the indicator.
                        if (event.content_block.id) {
                            _toolUseIdToCounter[event.content_block.id] = toolCounter;
                        }
                        _log("Tool start:", activeToolName, "#" + toolCounter);
                        nodeConnector.triggerPeer("aiProgress", {
                            requestId: requestId,
                            toolName: activeToolName,
                            toolId: toolCounter,
                            phase: "tool_use"
                        });
                    }

                    // Accumulate tool input JSON and stream preview
                    if (event.type === "content_block_delta" &&
                        event.delta?.type === "input_json_delta" &&
                        event.index === activeToolIndex) {
                        activeToolInputJson += event.delta.partial_json;
                        toolDeltaCount++;
                        const now = Date.now();
                        if (activeToolInputJson &&
                            now - lastToolStreamTime >= TEXT_STREAM_THROTTLE_MS) {
                            lastToolStreamTime = now;
                            toolStreamSendCount++;
                            nodeConnector.triggerPeer("aiToolStream", {
                                requestId: requestId,
                                toolId: toolCounter,
                                toolName: activeToolName,
                                partialJson: activeToolInputJson
                            });
                        }
                    }

                    // Tool block complete — flush final stream preview and send details
                    if (event.type === "content_block_stop" &&
                        event.index === activeToolIndex &&
                        activeToolName) {
                        // Final flush of tool stream (bypasses throttle)
                        if (activeToolInputJson) {
                            toolStreamSendCount++;
                            nodeConnector.triggerPeer("aiToolStream", {
                                requestId: requestId,
                                toolId: toolCounter,
                                toolName: activeToolName,
                                partialJson: activeToolInputJson
                            });
                        }
                        let toolInput = {};
                        try {
                            toolInput = JSON.parse(activeToolInputJson);
                        } catch (e) {
                            // ignore parse errors
                        }
                        _log("Tool done:", activeToolName, "#" + toolCounter,
                            "deltas=" + toolDeltaCount, "sent=" + toolStreamSendCount,
                            "json=" + activeToolInputJson.length + "ch");
                        nodeConnector.triggerPeer("aiToolInfo", {
                            requestId: requestId,
                            toolName: activeToolName,
                            toolId: toolCounter,
                            toolInput: toolInput
                        });

                        // ExitPlanMode: show plan to user and wait for approval
                        // Plan text comes from a prior Write to .claude/plans/ (captured in hook)
                        if (activeToolName === "ExitPlanMode") {
                            const planText = toolInput.plan || _lastPlanContent || "";
                            _lastPlanContent = null;
                            if (planText) {
                                _log("ExitPlanMode plan detected (" + planText.length + "ch), sending to browser");
                                nodeConnector.triggerPeer("aiPlanProposed", {
                                    requestId: requestId,
                                    plan: planText
                                });
                                // Pause stream processing until user approves/rejects
                                const planResponse = await new Promise((resolve, reject) => {
                                    _planResolve = resolve;
                                    if (signal.aborted) {
                                        _planResolve = null;
                                        reject(new Error("Aborted"));
                                        return;
                                    }
                                    const onAbort = () => {
                                        _planResolve = null;
                                        reject(new Error("Aborted"));
                                    };
                                    signal.addEventListener("abort", onAbort, { once: true });
                                });
                                if (!planResponse.approved) {
                                    _log("Plan rejected by user, aborting");
                                    currentAbortController.abort();
                                    _planRejectionFeedback = planResponse.feedback || "";
                                } else {
                                    _log("Plan approved by user, will send proceed prompt");
                                    _planApproved = true;
                                }
                            } else {
                                _log("ExitPlanMode with no plan content, skipping UI");
                            }
                        }

                        activeToolName = null;
                        activeToolIndex = null;
                        activeToolInputJson = "";
                    }

                    // Stream text deltas (throttled)
                    if (event.type === "content_block_delta" &&
                        event.delta?.type === "text_delta") {
                        accumulatedText += event.delta.text;
                        textDeltaCount++;
                        const now = Date.now();
                        if (now - lastStreamTime >= TEXT_STREAM_THROTTLE_MS) {
                            lastStreamTime = now;
                            textStreamSendCount++;
                            nodeConnector.triggerPeer("aiTextStream", {
                                requestId: requestId,
                                text: accumulatedText
                            });
                            accumulatedText = "";
                        }
                    }
                }
            }

            // Tool results come back as user-typed messages with content blocks
            // of type tool_result. Log isError + content size so we can correlate
            // a "Tool done" (input stream) with what Claude actually saw as the reply.
            if (message.type === "user" && message.message && Array.isArray(message.message.content)) {
                for (const block of message.message.content) {
                    if (block && block.type === "tool_result") {
                        let len = 0;
                        let preview = "";
                        if (typeof block.content === "string") {
                            len = block.content.length;
                            preview = block.content.slice(0, 120);
                        } else if (Array.isArray(block.content)) {
                            for (const c of block.content) {
                                if (c && c.type === "text" && typeof c.text === "string") {
                                    len += c.text.length;
                                    if (!preview) { preview = c.text.slice(0, 120); }
                                } else if (c && c.type === "image" && typeof c.data === "string") {
                                    len += c.data.length;
                                    if (!preview) { preview = "[image " + c.data.length + "ch]"; }
                                }
                            }
                        }
                        _log("Tool result:", block.tool_use_id || "?",
                            "isError=" + !!block.is_error,
                            "len=" + len + "ch",
                            preview ? ("preview=" + JSON.stringify(preview)) : "");
                        // Forward the result so the browser can reflect outcome
                        // on the corresponding tool indicator (errored vs ran).
                        const counterId = _toolUseIdToCounter[block.tool_use_id];
                        if (counterId !== undefined) {
                            nodeConnector.triggerPeer("aiToolResult", {
                                requestId: requestId,
                                toolId: counterId,
                                isError: !!block.is_error,
                                preview: preview
                            });
                        }
                    }
                }
            }
        }

        // Flush any remaining accumulated text
        if (accumulatedText) {
            textStreamSendCount++;
            nodeConnector.triggerPeer("aiTextStream", {
                requestId: requestId,
                text: accumulatedText
            });
        }

        clearTimeout(connectionTimer);
        _log("Complete: tools=" + toolCounter, "edits=" + editCount,
            "textDeltas=" + textDeltaCount, "textSent=" + textStreamSendCount);

        // Check if plan was approved — send follow-up to proceed with implementation
        if (_planApproved) {
            _planApproved = false;
            _log("Plan approved, sending proceed prompt");
            nodeConnector.triggerPeer("aiComplete", {
                requestId: requestId,
                sessionId: currentSessionId,
                planApproved: true
            });
            return;
        }

        // Check if stream ended due to plan rejection (abort + break)
        if (_planRejectionFeedback !== null) {
            const feedback = _planRejectionFeedback;
            _planRejectionFeedback = null;
            _log("Plan rejected, sending revision request");
            nodeConnector.triggerPeer("aiComplete", {
                requestId: requestId,
                sessionId: currentSessionId,
                planRejected: true,
                planFeedback: feedback
            });
            return;
        }

        // Signal completion
        nodeConnector.triggerPeer("aiComplete", {
            requestId: requestId,
            sessionId: currentSessionId
        });

    } catch (err) {
        clearTimeout(connectionTimer);
        const errMsg = err.message || String(err);
        const isAbort = signal.aborted || /abort/i.test(errMsg);

        if (isAbort) {
            // Check if this was a plan rejection — if so, send feedback as follow-up
            if (_planRejectionFeedback !== null) {
                const feedback = _planRejectionFeedback;
                _planRejectionFeedback = null;
                _log("Plan rejected, sending revision request");
                // Don't clear session — resume with feedback
                nodeConnector.triggerPeer("aiComplete", {
                    requestId: requestId,
                    sessionId: currentSessionId,
                    planRejected: true,
                    planFeedback: feedback
                });
                return;
            }
            _log("Cancelled");
            // Keep currentSessionId so the next prompt can resume the same SDK
            // session — the abort just leaves an interrupt marker in the log.
            nodeConnector.triggerPeer("aiComplete", {
                requestId: requestId,
                sessionId: currentSessionId
            });
            return;
        }

        _log("Error:", errMsg.slice(0, 200));

        // Build a detailed error message including stderr context
        let detailedError = errMsg;
        const stderrContext = _lastStderrLines
            .filter(line => !line.startsWith("Spawning Claude Code"))
            .join("\n").trim();
        if (stderrContext) {
            detailedError += "\n" + stderrContext;
        }
        // Add hint for custom API settings when process exits with code 1
        if (/exited with code 1/.test(errMsg) && envOverrides) {
            if (envOverrides.ANTHROPIC_AUTH_TOKEN) {
                detailedError += "\nThis may be caused by an invalid API key. " +
                    "Check your API key in Claude Code Settings.";
            }
            if (envOverrides.ANTHROPIC_BASE_URL) {
                detailedError += "\nCustom Base URL: " + envOverrides.ANTHROPIC_BASE_URL;
            }
        }

        // Keep currentSessionId so the user can retry — errors are often
        // transient (network, rate limit), and if the session really is broken
        // the next attempt will surface a fresh error of its own.

        nodeConnector.triggerPeer("aiError", {
            requestId: requestId,
            error: detailedError
        });

        // Always send aiComplete after aiError so the UI exits streaming state
        nodeConnector.triggerPeer("aiComplete", {
            requestId: requestId,
            sessionId: currentSessionId
        });
    }
}
