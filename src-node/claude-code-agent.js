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
    const { prompt, projectPath, sessionAction, model, locale, selectionContext, images, envOverrides } = params;
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
    _runQuery(requestId, enrichedPrompt, projectPath, model, currentAbortController.signal, locale, images, envOverrides)
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
        // Clear session so next query starts fresh instead of resuming a killed session
        currentSessionId = null;
        // Clear any pending question or plan
        _questionResolve = null;
        _planResolve = null;
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
async function _runQuery(requestId, prompt, projectPath, model, signal, locale, images, envOverrides) {
    let editCount = 0;
    let toolCounter = 0;
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
    const MAX_STDERR_LINES = 20;

    const queryOptions = {
        cwd: projectPath || process.cwd(),
        maxTurns: undefined,
        stderr: (data) => {
            console.log("[AI stderr]", data);
            _lastStderrLines.push(data);
            if (_lastStderrLines.length > MAX_STDERR_LINES) {
                _lastStderrLines.shift();
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
        permissionMode: "acceptEdits",
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
            "\n\nWhen planning, consider if verification is needed. takeScreenshot can " +
            "capture the full editor, specific panels, the code area, or the live preview. " +
            "For HTML/CSS/JS with live preview, execJsInLivePreview can run JS in the " +
            "browser to confirm behavior." +
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
                            const myToolId = toolCounter; // capture before any await
                            const edit = {
                                file: input.tool_input.file_path,
                                oldText: input.tool_input.old_string,
                                newText: input.tool_input.new_string
                            };
                            editCount++;
                            let editResult;
                            try {
                                editResult = await nodeConnector.execPeer("applyEditToBuffer", edit);
                            } catch (err) {
                                console.warn("[Phoenix AI] Failed to apply edit to buffer:", err.message);
                                editResult = { applied: false, error: err.message };
                            }
                            nodeConnector.triggerPeer("aiToolEdit", {
                                requestId: requestId,
                                toolId: myToolId,
                                edit: edit
                            });
                            let reason;
                            if (editResult && editResult.applied === false) {
                                reason = "Edit FAILED: " + (editResult.error || "unknown error");
                            } else {
                                reason = "Edit applied successfully via Phoenix editor.";
                                if (editResult && editResult.isLivePreviewRelated) {
                                    reason += " The edited file is part of the active live preview." +
                                        " Reload when ready with execJsInLivePreview: `location.reload()`";
                                }
                            }
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
                    ]
                },
                {
                    matcher: "Read",
                    hooks: [
                        async (input) => {
                            if (!input || !input.tool_input) {
                                return {};
                            }
                            const filePath = input.tool_input.file_path;
                            if (!filePath) {
                                return {};
                            }
                            try {
                                const result = await nodeConnector.execPeer("getFileContent", { filePath });
                                if (result && result.isDirty && result.content !== null) {
                                    const MAX_LINES = 2000;
                                    const MAX_LINE_LENGTH = 2000;
                                    const lines = result.content.split("\n");
                                    const offset = input.tool_input.offset || 0;
                                    const limit = input.tool_input.limit || MAX_LINES;
                                    const selected = lines.slice(offset, offset + limit);
                                    let formatted = selected.map((line, i) => {
                                        const truncated = line.length > MAX_LINE_LENGTH
                                            ? line.slice(0, MAX_LINE_LENGTH) + "..."
                                            : line;
                                        return String(offset + i + 1).padStart(6) + "\t" + truncated;
                                    }).join("\n");
                                    formatted = filePath + " (" +
                                        lines.length + " lines total)\n\n" + formatted;
                                    console.log("[Phoenix AI] Serving dirty file content for:", filePath);
                                    if (_queuedClarification) {
                                        formatted += CLARIFICATION_HINT;
                                    }
                                    return {
                                        hookSpecificOutput: {
                                            hookEventName: "PreToolUse",
                                            permissionDecision: "deny",
                                            permissionDecisionReason: formatted
                                        }
                                    };
                                }
                            } catch (err) {
                                console.warn("[Phoenix AI] Failed to check dirty state:", filePath, err.message);
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
                            // Don't open plan files in editor — shown in plan card UI
                            const writePath = input.tool_input.file_path || "";
                            if (writePath.includes("/.claude/plans/")) {
                                _lastPlanContent = input.tool_input.content || "";
                                console.log("[Phoenix AI] Captured plan content:",
                                    _lastPlanContent.length + "ch");
                                if (_queuedClarification) {
                                    return {
                                        hookSpecificOutput: {
                                            hookEventName: "PreToolUse",
                                            permissionDecision: "deny",
                                            permissionDecisionReason:
                                                "Plan file saved." + CLARIFICATION_HINT
                                        }
                                    };
                                }
                                return {
                                    hookSpecificOutput: {
                                        hookEventName: "PreToolUse",
                                        permissionDecision: "deny",
                                        permissionDecisionReason: "Plan file saved."
                                    }
                                };
                            }
                            const myToolId = toolCounter; // capture before any await
                            const edit = {
                                file: input.tool_input.file_path,
                                oldText: null,
                                newText: input.tool_input.content
                            };
                            editCount++;
                            let writeResult;
                            try {
                                writeResult = await nodeConnector.execPeer("applyEditToBuffer", edit);
                            } catch (err) {
                                console.warn("[Phoenix AI] Failed to apply write to buffer:", err.message);
                                writeResult = { applied: false, error: err.message };
                            }
                            nodeConnector.triggerPeer("aiToolEdit", {
                                requestId: requestId,
                                toolId: myToolId,
                                edit: edit
                            });
                            let reason;
                            if (writeResult && writeResult.applied === false) {
                                reason = "Write FAILED: " + (writeResult.error || "unknown error");
                            } else {
                                reason = "Write applied successfully via Phoenix editor.";
                                if (writeResult && writeResult.isLivePreviewRelated) {
                                    reason += " The written file is part of the active live preview." +
                                        " Reload when ready with execJsInLivePreview: `location.reload()`";
                                }
                            }
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
            ]
        }
    };

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
            // Send sessionId so browser side can save partial history for later resume
            const cancelledSessionId = currentSessionId;
            // Clear session so next query starts fresh
            currentSessionId = null;
            nodeConnector.triggerPeer("aiComplete", {
                requestId: requestId,
                sessionId: cancelledSessionId
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

        // Clear session after error to prevent cascading failures from resuming a broken session
        currentSessionId = null;

        nodeConnector.triggerPeer("aiError", {
            requestId: requestId,
            error: detailedError
        });

        // Always send aiComplete after aiError so the UI exits streaming state
        nodeConnector.triggerPeer("aiComplete", {
            requestId: requestId,
            sessionId: null
        });
    }
}
