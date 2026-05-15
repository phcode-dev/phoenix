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
 * MCP server factory for exposing Phoenix editor context to Claude Code.
 *
 * Provides three tools:
 *   - getEditorState: returns active file, working set, and live preview file
 *   - takeScreenshot: captures a screenshot of the Phoenix window as base64 PNG
 *   - execJsInLivePreview: executes JS in the live preview iframe
 *
 * Uses the Claude Code SDK's in-process MCP server support (createSdkMcpServer / tool).
 */

const { z } = require("zod");

const CLARIFICATION_HINT =
    "IMPORTANT: The user has typed a follow-up clarification while you were working." +
    " Call the getUserClarification tool to read it before proceeding.";

// Per-tool safety-net budgets for the browser round-trip. The node connector
// is reliable in practice, so these should never fire during normal use —
// they exist so a stalled promise chain (live preview wedged, etc.) surfaces
// a deterministic error to Claude instead of the handler hanging forever.
const EXEC_PEER_TIMEOUT_MS = {
    getEditorState: 5000,
    takeScreenshot: 15000,
    controlEditor: 5000,
    resizeLivePreview: 5000
};

// Floor for caller-provided timeouts (e.g. execJsInLivePreview's
// timeoutMs). 5s minimum stops the model from spamming impatient retries
// on a preview that's just taking a beat to settle. No ceiling — the
// model picks the upper bound based on the task (a user can legitimately
// ask for a long-running inspection).
const MIN_CALLER_TIMEOUT_MS = 5000;

function _execPeerWithTimeout(nodeConnector, fn, args, label, overrideMs) {
    const ms = overrideMs || EXEC_PEER_TIMEOUT_MS[fn];
    const call = nodeConnector.execPeer(fn, args);
    if (!ms) {
        return call; // no timeout configured for this tool
    }
    let timer;
    const timeout = new Promise(function (_resolve, reject) {
        timer = setTimeout(function () {
            reject(new Error(label + " timed out after " + ms + "ms"));
        }, ms);
    });
    return Promise.race([call, timeout]).finally(function () {
        clearTimeout(timer);
    });
}

/**
 * Clamp a caller-supplied timeoutMs into the allowed range. Returns a
 * sane default when missing/invalid.
 */
function _resolveCallerTimeout(timeoutMs, defaultMs) {
    if (typeof timeoutMs !== "number" || !isFinite(timeoutMs)) {
        return defaultMs;
    }
    return Math.max(MIN_CALLER_TIMEOUT_MS, timeoutMs);
}

/**
 * Append a clarification hint to an MCP tool result if the user has queued a message.
 */
function _maybeAppendHint(result, hasClarification) {
    if (hasClarification && hasClarification()) {
        if (result && result.content && Array.isArray(result.content)) {
            result.content.push({ type: "text", text: CLARIFICATION_HINT });
        }
    }
    return result;
}

/**
 * Create an in-process MCP server exposing editor context tools.
 *
 * @param {Object} sdkModule - The imported @anthropic-ai/claude-code ESM module
 * @param {Object} nodeConnector - The NodeConnector instance for communicating with the browser
 * @param {Object} [clarificationAccessors] - Optional accessors for user clarification queue
 * @param {Function} clarificationAccessors.hasClarification - Returns true if a clarification is queued
 * @param {Function} clarificationAccessors.getAndClearClarification - Returns {text} and clears the queue
 * @returns {McpSdkServerConfigWithInstance} MCP server config ready for queryOptions.mcpServers
 */
function createEditorMcpServer(sdkModule, nodeConnector, clarificationAccessors) {
    const hasClarification = clarificationAccessors && clarificationAccessors.hasClarification;
    const getEditorStateTool = sdkModule.tool(
        "getEditorState",
        "Get the current Phoenix editor state: active file, working set (open files with isDirty flag), live preview file, " +
        "cursor/selection info (current line text with surrounding context, or selected text), " +
        "and the currently selected element in the live preview (tag, selector, text preview) if any. " +
        "The live preview selected element may differ from the editor cursor — use execJsInLivePreview to inspect it further. " +
        "Long lines are trimmed to 200 chars and selections to 10K chars — use the Read tool for full content.",
        {},
        async function () {
            let result;
            try {
                const state = await _execPeerWithTimeout(nodeConnector, "getEditorState", {}, "getEditorState");
                result = {
                    content: [{ type: "text", text: JSON.stringify(state) }]
                };
            } catch (err) {
                result = {
                    content: [{ type: "text", text: "Error getting editor state: " + err.message }],
                    isError: true
                };
            }
            return _maybeAppendHint(result, hasClarification);
        }
    );

    const takeScreenshotTool = sdkModule.tool(
        "takeScreenshot",
        "Take a screenshot of the Phoenix Code editor application window (or a region within it). " +
        "This captures the EDITOR APPLICATION, not the rendered web page on its own — the editor window " +
        "contains a toolbar at the top, a file tree sidebar on the left, the code editor area in the " +
        "center, and optionally a live preview panel on the right. The preview panel shows either an " +
        "HTML/CSS/JS browser view or a rendered markdown preview (when a markdown file is open, the " +
        "panel shows a WYSIWYG markdown editor/viewer). " +
        "Returns the screenshot as an inline PNG image; if filePath is specified, saves to that file " +
        "and returns the path instead. " +
        "ALMOST ALWAYS pass a selector — capturing the full editor returns a busy image full of editor " +
        "chrome that's hard to reason about. Use:" +
        "\n- '#panel-live-preview-frame' to see the rendered preview (HTML or markdown) — this is what " +
        "you want when verifying visual output, debugging a layout/styling bug, or confirming the page " +
        "renders as expected. Use this for ANY 'how does it look', 'is the page rendering', or " +
        "'check the preview' question." +
        "\n- '.editor-holder' to see just the code editor area." +
        "\nOnly omit the selector when you need to see the full editor application layout itself — " +
        "e.g. the user is asking about Phoenix's UI, panels, toolbar, or you can't otherwise figure " +
        "out what they're talking about and need to see what's on their screen. " +
        "Note: live preview screenshots may include Phoenix toolbox overlays on selected elements. " +
        "Use purePreview=true to temporarily hide these overlays and render the page as it would appear in a real browser. " +
        "Use reload=true to force-reload the live preview before capturing — useful after editing JS, " +
        "and saves a tool call vs. calling controlEditor.reloadLivePreview separately.",
        {
            selector: z.string().optional().describe("CSS selector to capture a specific element. Use '#panel-live-preview-frame' for the preview panel (HTML live preview or markdown preview), '.editor-holder' for the code editor."),
            purePreview: z.boolean().optional().describe("When true, temporarily switches to preview mode to hide element highlight overlays and toolboxes before capturing, then restores the previous mode."),
            reload: z.boolean().optional().describe("When true, force-reloads the live preview before capturing. Use this instead of a separate reloadLivePreview call when you're about to screenshot anyway."),
            filePath: z.string().optional().describe("Absolute path to save the screenshot as a PNG file. If specified, returns the file path instead of inline image data.")
        },
        async function (args) {
            let toolResult;
            try {
                const result = await _execPeerWithTimeout(nodeConnector, "takeScreenshot", {
                    selector: args.selector || undefined,
                    purePreview: args.purePreview || false,
                    reload: args.reload || false,
                    filePath: args.filePath || undefined
                }, "takeScreenshot");
                if (result.filePath) {
                    toolResult = {
                        content: [{ type: "text", text: "Screenshot saved to: " + result.filePath }]
                    };
                } else if (result.base64) {
                    toolResult = {
                        content: [{ type: "image", data: result.base64, mimeType: "image/png" }]
                    };
                } else {
                    toolResult = {
                        content: [{ type: "text", text: result.error || "Screenshot failed" }],
                        isError: true
                    };
                }
            } catch (err) {
                toolResult = {
                    content: [{ type: "text", text: "Error taking screenshot: " + err.message }],
                    isError: true
                };
            }
            return _maybeAppendHint(toolResult, hasClarification);
        }
    );

    const execJsInLivePreviewTool = sdkModule.tool(
        "execJsInLivePreview",
        "Execute JavaScript in the live preview iframe (the page being previewed), NOT in Phoenix itself. " +
        "Auto-opens the live preview panel if it is not already visible. Code is evaluated via eval() in " +
        "the global scope of the previewed page. Note: eval() is synchronous — async/await is NOT supported. " +
        "Only available when an HTML file is selected in the live preview — does not work for markdown or " +
        "other non-HTML file types. Use this to inspect or manipulate the user's live-previewed web page " +
        "(e.g. document.title, DOM queries).\n\n" +
        "Pass timeoutMs to bound how long to wait if the live preview is wedged or slow to respond. " +
        "Defaults to 10000 (10s). Floored at 5000 (the preview frame may still be settling); no " +
        "upper limit — pick whatever fits the snippet you're running.",
        {
            code: z.string().describe("JavaScript code to execute in the live preview iframe"),
            timeoutMs: z.number().int().optional().describe(
                "Max wait in milliseconds before giving up on the live preview. " +
                "Floored at 5000, no upper limit. Default 10000."
            )
        },
        async function (args) {
            let toolResult;
            const timeoutMs = _resolveCallerTimeout(args.timeoutMs, 10000);
            try {
                const result = await _execPeerWithTimeout(nodeConnector, "execJsInLivePreview", {
                    code: args.code
                }, "execJsInLivePreview", timeoutMs);
                if (result.error) {
                    toolResult = {
                        content: [{ type: "text", text: "Error: " + result.error }],
                        isError: true
                    };
                } else {
                    toolResult = {
                        content: [{ type: "text", text: result.result || "undefined" }]
                    };
                }
            } catch (err) {
                toolResult = {
                    content: [{ type: "text", text: "Error executing JS in live preview: " + err.message }],
                    isError: true
                };
            }
            return _maybeAppendHint(toolResult, hasClarification);
        }
    );

    const controlEditorTool = sdkModule.tool(
        "controlEditor",
        "Control the Phoenix editor: open/close files, navigate to lines, and select text ranges. " +
        "Accepts an array of operations to batch multiple actions in one call. " +
        "All line and ch (column) parameters are 1-based.\n\n" +
        "Operations:\n" +
        "- open: Open a file in the active pane. Params: filePath\n" +
        "- close: Close a file (force, no save prompt). Params: filePath\n" +
        "- openInWorkingSet: Open a file and pin it to the working set. Params: filePath\n" +
        "- setSelection: Open a file and select a range. Params: filePath, startLine, startCh, endLine, endCh\n" +
        "- setCursorPos: Open a file and set cursor position. Params: filePath, line, ch\n" +
        "- toggleLivePreview: Show or hide the live preview panel. Params: show (boolean)\n" +
        "- reloadLivePreview: Force-reload the live preview iframe (and any popped-out preview tabs). " +
        "Use after editing JS that doesn't appear to have hot-reloaded. Note: if you're about to call " +
        "takeScreenshot anyway, prefer takeScreenshot({ reload: true }) — it reloads and captures in " +
        "one step. No params.",
        {
            operations: z.array(z.object({
                operation: z.enum(["open", "close", "openInWorkingSet", "setSelection", "setCursorPos", "toggleLivePreview", "reloadLivePreview"]),
                filePath: z.string().optional().describe("Absolute path to the file (not required for toggleLivePreview)"),
                startLine: z.number().optional().describe("Start line (1-based) for setSelection"),
                startCh: z.number().optional().describe("Start column (1-based) for setSelection"),
                endLine: z.number().optional().describe("End line (1-based) for setSelection"),
                endCh: z.number().optional().describe("End column (1-based) for setSelection"),
                line: z.number().optional().describe("Line number (1-based) for setCursorPos"),
                ch: z.number().optional().describe("Column (1-based) for setCursorPos"),
                showPreview: z.boolean().optional().describe("true to show, false to hide live preview (for toggleLivePreview)")
            })).describe("Array of editor operations to execute sequentially")
        },
        async function (args) {
            const results = [];
            let hasError = false;
            for (const op of args.operations) {
                console.log("[Phoenix AI] controlEditor:", op.operation, op.filePath);
                try {
                    const result = await _execPeerWithTimeout(nodeConnector, "controlEditor", op, "controlEditor:" + op.operation);
                    results.push(result);
                    if (!result.success) {
                        hasError = true;
                        console.warn("[Phoenix AI] controlEditor failed:", op.operation, op.filePath, result.error);
                    } else {
                        console.log("[Phoenix AI] controlEditor success:", op.operation, op.filePath);
                    }
                } catch (err) {
                    results.push({ success: false, error: err.message });
                    hasError = true;
                    console.error("[Phoenix AI] controlEditor error:", op.operation, op.filePath, err.message);
                }
            }
            const toolResult = {
                content: [{ type: "text", text: JSON.stringify(results) }],
                isError: hasError
            };
            return _maybeAppendHint(toolResult, hasClarification);
        }
    );

    const resizeLivePreviewTool = sdkModule.tool(
        "resizeLivePreview",
        "Resize the live preview panel to a specific width for responsive testing. " +
        "Provide a width in pixels based on the target device (e.g. 390 for a phone, 768 for a tablet, 1440 for desktop).",
        {
            width: z.number().describe("Target width in pixels")
        },
        async function (args) {
            let toolResult;
            try {
                const result = await _execPeerWithTimeout(nodeConnector, "resizeLivePreview", {
                    width: args.width
                }, "resizeLivePreview");
                if (result.error) {
                    toolResult = {
                        content: [{ type: "text", text: "Error: " + result.error }],
                        isError: true
                    };
                } else {
                    toolResult = {
                        content: [{ type: "text", text: JSON.stringify(result) }]
                    };
                }
            } catch (err) {
                toolResult = {
                    content: [{ type: "text", text: "Error resizing live preview: " + err.message }],
                    isError: true
                };
            }
            return _maybeAppendHint(toolResult, hasClarification);
        }
    );

    const waitTool = sdkModule.tool(
        "wait",
        "Wait for a specified number of seconds before continuing. " +
        "Useful for waiting after DOM changes, animations, live preview updates, or resize operations " +
        "before taking a screenshot or inspecting state. Maximum 60 seconds.",
        {
            seconds: z.number().min(0.1).max(60).describe("Number of seconds to wait (0.1–60)")
        },
        async function (args) {
            const ms = Math.round(args.seconds * 1000);
            await new Promise(function (resolve) { setTimeout(resolve, ms); });
            const toolResult = {
                content: [{ type: "text", text: "Waited " + args.seconds + " seconds." }]
            };
            return _maybeAppendHint(toolResult, hasClarification);
        }
    );

    const getUserClarificationTool = sdkModule.tool(
        "getUserClarification",
        "Retrieve a follow-up clarification message the user typed while you were working. " +
        "Returns the clarification text and clears the queue. Only call this when a tool response " +
        "indicates the user has typed a clarification.",
        {},
        async function () {
            if (clarificationAccessors && clarificationAccessors.getAndClearClarification) {
                const result = await clarificationAccessors.getAndClearClarification();
                if (result && (result.text || (result.images && result.images.length > 0))) {
                    // Notify browser with the text so it can show it as a user message bubble
                    nodeConnector.triggerPeer("aiClarificationRead", {
                        text: result.text || ""
                    });
                    const content = [];
                    if (result.text) {
                        content.push({ type: "text", text: "User clarification: " + result.text });
                    }
                    if (result.images && result.images.length > 0) {
                        result.images.forEach(function (img) {
                            content.push({
                                type: "image",
                                data: img.base64Data,
                                mimeType: img.mediaType
                            });
                        });
                    }
                    return { content: content };
                }
            }
            return {
                content: [{ type: "text", text: "No clarification queued." }]
            };
        }
    );

    return sdkModule.createSdkMcpServer({
        name: "phoenix-editor",
        tools: [getEditorStateTool, takeScreenshotTool, execJsInLivePreviewTool, controlEditorTool,
            resizeLivePreviewTool, waitTool, getUserClarificationTool]
    });
}

exports.createEditorMcpServer = createEditorMcpServer;
