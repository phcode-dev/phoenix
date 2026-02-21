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
const path = require("path");
const { createEditorMcpServer } = require("./mcp-editor-tools");

const CONNECTOR_ID = "ph_ai_claude";

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
 * Find the user's globally installed Claude CLI, skipping node_modules copies.
 */
function findGlobalClaudeCli() {
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

    console.log("[Phoenix AI] Global Claude CLI not found");
    return null;
}

/**
 * Check whether Claude CLI is available.
 * Called from browser via execPeer("checkAvailability").
 */
exports.checkAvailability = async function () {
    try {
        const claudePath = findGlobalClaudeCli();
        if (claudePath) {
            // Also verify the SDK can be imported
            await getQueryFn();
            return { available: true, claudePath: claudePath };
        }
        // No global CLI found — try importing SDK anyway (it might find its own)
        await getQueryFn();
        return { available: true, claudePath: null };
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
    const { prompt, projectPath, sessionAction, model, locale, selectionContext } = params;
    const requestId = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

    // Handle session
    if (sessionAction === "new") {
        currentSessionId = null;
    }

    // Cancel any in-flight query
    if (currentAbortController) {
        currentAbortController.abort();
        currentAbortController = null;
    }

    currentAbortController = new AbortController();

    // Prepend selection context to the prompt if available
    let enrichedPrompt = prompt;
    if (selectionContext && selectionContext.selectedText) {
        enrichedPrompt =
            "The user has selected the following text in " + selectionContext.filePath +
            " (lines " + selectionContext.startLine + "-" + selectionContext.endLine + "):\n" +
            "```\n" + selectionContext.selectedText + "\n```\n\n" + prompt;
    }

    // Run the query asynchronously — don't await here so we return requestId immediately
    _runQuery(requestId, enrichedPrompt, projectPath, model, currentAbortController.signal, locale)
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
        return { success: true };
    }
    return { success: false };
};

/**
 * Destroy the current session (clear session ID).
 */
exports.destroySession = async function () {
    currentSessionId = null;
    currentAbortController = null;
    return { success: true };
};

/**
 * Internal: run a Claude SDK query and stream results back to the browser.
 */
async function _runQuery(requestId, prompt, projectPath, model, signal, locale) {
    let editCount = 0;
    let toolCounter = 0;
    let queryFn;

    try {
        queryFn = await getQueryFn();
        if (!editorMcpServer) {
            editorMcpServer = createEditorMcpServer(queryModule, nodeConnector);
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

    const queryOptions = {
        cwd: projectPath || process.cwd(),
        maxTurns: undefined,
        allowedTools: [
            "Read", "Edit", "Write", "Glob", "Grep",
            "mcp__phoenix-editor__getEditorState",
            "mcp__phoenix-editor__takeScreenshot",
            "mcp__phoenix-editor__execJsInLivePreview",
            "mcp__phoenix-editor__controlEditor"
        ],
        mcpServers: { "phoenix-editor": editorMcpServer },
        permissionMode: "acceptEdits",
        appendSystemPrompt:
            "When modifying an existing file, always prefer the Edit tool " +
            "(find-and-replace) instead of the Write tool. The Write tool should ONLY be used " +
            "to create brand new files that do not exist yet. For existing files, always use " +
            "multiple Edit calls to make targeted changes rather than rewriting the entire " +
            "file with Write. This is critical because Write replaces the entire file content " +
            "which is slow and loses undo history." +
            (locale && !locale.startsWith("en")
                ? "\n\nThe user's display language is " + locale + ". " +
                  "Respond in this language unless they write in a different language."
                : ""),
        includePartialMessages: true,
        abortController: currentAbortController,
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
                            try {
                                await nodeConnector.execPeer("applyEditToBuffer", edit);
                            } catch (err) {
                                console.warn("[Phoenix AI] Failed to apply edit to buffer:", err.message);
                            }
                            nodeConnector.triggerPeer("aiToolEdit", {
                                requestId: requestId,
                                toolId: myToolId,
                                edit: edit
                            });
                            return {
                                hookSpecificOutput: {
                                    hookEventName: "PreToolUse",
                                    permissionDecision: "deny",
                                    permissionDecisionReason: "Edit applied successfully via Phoenix editor."
                                }
                            };
                        }
                    ]
                },
                {
                    matcher: "Read",
                    hooks: [
                        async (input) => {
                            const filePath = input.tool_input.file_path;
                            if (!filePath) {
                                return undefined;
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
                            return undefined;
                        }
                    ]
                },
                {
                    matcher: "Write",
                    hooks: [
                        async (input) => {
                            console.log("[Phoenix AI] Intercepted Write tool");
                            const myToolId = toolCounter; // capture before any await
                            const edit = {
                                file: input.tool_input.file_path,
                                oldText: null,
                                newText: input.tool_input.content
                            };
                            editCount++;
                            try {
                                await nodeConnector.execPeer("applyEditToBuffer", edit);
                            } catch (err) {
                                console.warn("[Phoenix AI] Failed to apply write to buffer:", err.message);
                            }
                            nodeConnector.triggerPeer("aiToolEdit", {
                                requestId: requestId,
                                toolId: myToolId,
                                edit: edit
                            });
                            return {
                                hookSpecificOutput: {
                                    hookEventName: "PreToolUse",
                                    permissionDecision: "deny",
                                    permissionDecisionReason: "Write applied successfully via Phoenix editor."
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

        const result = queryFn({
            prompt: prompt,
            options: queryOptions
        });

        let accumulatedText = "";
        let lastStreamTime = 0;

        // Tool input tracking
        let activeToolName = null;
        let activeToolIndex = null;
        let activeToolInputJson = "";
        let lastToolStreamTime = 0;

        // Trace counters (logged at tool/query completion, not per-delta)
        let toolDeltaCount = 0;
        let toolStreamSendCount = 0;
        let textDeltaCount = 0;
        let textStreamSendCount = 0;

        for await (const message of result) {
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

        // Flush any remaining accumulated text
        if (accumulatedText) {
            textStreamSendCount++;
            nodeConnector.triggerPeer("aiTextStream", {
                requestId: requestId,
                text: accumulatedText
            });
        }

        _log("Complete: tools=" + toolCounter, "edits=" + editCount,
            "textDeltas=" + textDeltaCount, "textSent=" + textStreamSendCount);

        // Signal completion
        nodeConnector.triggerPeer("aiComplete", {
            requestId: requestId,
            sessionId: currentSessionId
        });

    } catch (err) {
        const errMsg = err.message || String(err);
        const isAbort = signal.aborted || /abort/i.test(errMsg);

        if (isAbort) {
            _log("Cancelled");
            // Query was cancelled — clear session so next query starts fresh
            currentSessionId = null;
            nodeConnector.triggerPeer("aiComplete", {
                requestId: requestId,
                sessionId: null
            });
            return;
        }

        _log("Error:", errMsg.slice(0, 200));

        nodeConnector.triggerPeer("aiError", {
            requestId: requestId,
            error: errMsg
        });

        // Always send aiComplete after aiError so the UI exits streaming state
        nodeConnector.triggerPeer("aiComplete", {
            requestId: requestId,
            sessionId: currentSessionId
        });
    }
}
