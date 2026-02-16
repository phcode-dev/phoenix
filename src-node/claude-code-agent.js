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

const CONNECTOR_ID = "ph_ai_claude";

// Lazy-loaded ESM module reference
let queryModule = null;

// Session state
let currentSessionId = null;

// Active query state
let currentAbortController = null;

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
 *   aiProgress, aiTextStream, aiEditResult, aiError, aiComplete
 */
exports.sendPrompt = async function (params) {
    const { prompt, projectPath, sessionAction, model } = params;
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

    // Run the query asynchronously — don't await here so we return requestId immediately
    _runQuery(requestId, prompt, projectPath, model, currentAbortController.signal)
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
async function _runQuery(requestId, prompt, projectPath, model, signal) {
    const collectedEdits = [];
    let queryFn;

    try {
        queryFn = await getQueryFn();
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
        maxTurns: 10,
        allowedTools: ["Read", "Edit", "Write", "Glob", "Grep"],
        permissionMode: "acceptEdits",
        includePartialMessages: true,
        abortController: currentAbortController,
        hooks: {
            PreToolUse: [
                {
                    matcher: "Edit",
                    hooks: [
                        async (input) => {
                            console.log("[Phoenix AI] Intercepted Edit tool");
                            collectedEdits.push({
                                file: input.tool_input.file_path,
                                oldText: input.tool_input.old_string,
                                newText: input.tool_input.new_string
                            });
                            return {
                                hookSpecificOutput: {
                                    hookEventName: "PreToolUse",
                                    permissionDecision: "deny",
                                    permissionDecisionReason: "Edit delegated to Phoenix editor"
                                }
                            };
                        }
                    ]
                },
                {
                    matcher: "Write",
                    hooks: [
                        async (input) => {
                            console.log("[Phoenix AI] Intercepted Write tool");
                            collectedEdits.push({
                                file: input.tool_input.file_path,
                                oldText: null,
                                newText: input.tool_input.content
                            });
                            return {
                                hookSpecificOutput: {
                                    hookEventName: "PreToolUse",
                                    permissionDecision: "deny",
                                    permissionDecisionReason: "Write delegated to Phoenix editor"
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

    try {
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
        let toolCounter = 0;

        for await (const message of result) {
            // Check abort
            if (signal.aborted) {
                break;
            }

            // Capture session_id from first message
            if (message.session_id && !currentSessionId) {
                currentSessionId = message.session_id;
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
                    nodeConnector.triggerPeer("aiProgress", {
                        requestId: requestId,
                        toolName: activeToolName,
                        toolId: toolCounter,
                        phase: "tool_use"
                    });
                }

                // Accumulate tool input JSON
                if (event.type === "content_block_delta" &&
                    event.delta?.type === "input_json_delta" &&
                    event.index === activeToolIndex) {
                    activeToolInputJson += event.delta.partial_json;
                }

                // Tool block complete — parse input and send details
                if (event.type === "content_block_stop" &&
                    event.index === activeToolIndex &&
                    activeToolName) {
                    let toolInput = {};
                    try {
                        toolInput = JSON.parse(activeToolInputJson);
                    } catch (e) {
                        // ignore parse errors
                    }
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
                    const now = Date.now();
                    if (now - lastStreamTime >= TEXT_STREAM_THROTTLE_MS) {
                        lastStreamTime = now;
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
            nodeConnector.triggerPeer("aiTextStream", {
                requestId: requestId,
                text: accumulatedText
            });
        }

        // Send collected edits if any
        if (collectedEdits.length > 0) {
            nodeConnector.triggerPeer("aiEditResult", {
                requestId: requestId,
                edits: collectedEdits
            });
        }

        // Signal completion
        nodeConnector.triggerPeer("aiComplete", {
            requestId: requestId,
            sessionId: currentSessionId
        });

    } catch (err) {
        if (signal.aborted) {
            // Query was cancelled, not an error
            nodeConnector.triggerPeer("aiComplete", {
                requestId: requestId,
                sessionId: currentSessionId
            });
            return;
        }

        // If we collected edits before error, send them
        if (collectedEdits.length > 0) {
            nodeConnector.triggerPeer("aiEditResult", {
                requestId: requestId,
                edits: collectedEdits
            });
        }

        nodeConnector.triggerPeer("aiError", {
            requestId: requestId,
            error: err.message || String(err)
        });
    }
}
