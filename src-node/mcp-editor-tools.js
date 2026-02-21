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

/**
 * Create an in-process MCP server exposing editor context tools.
 *
 * @param {Object} sdkModule - The imported @anthropic-ai/claude-code ESM module
 * @param {Object} nodeConnector - The NodeConnector instance for communicating with the browser
 * @returns {McpSdkServerConfigWithInstance} MCP server config ready for queryOptions.mcpServers
 */
function createEditorMcpServer(sdkModule, nodeConnector) {
    const getEditorStateTool = sdkModule.tool(
        "getEditorState",
        "Get the current Phoenix editor state: active file, working set (open files), live preview file, " +
        "and cursor/selection info (current line text with surrounding context, or selected text). " +
        "Long lines are trimmed to 200 chars and selections to 10K chars — use the Read tool for full content.",
        {},
        async function () {
            try {
                const state = await nodeConnector.execPeer("getEditorState", {});
                return {
                    content: [{ type: "text", text: JSON.stringify(state) }]
                };
            } catch (err) {
                return {
                    content: [{ type: "text", text: "Error getting editor state: " + err.message }],
                    isError: true
                };
            }
        }
    );

    const takeScreenshotTool = sdkModule.tool(
        "takeScreenshot",
        "Take a screenshot of the Phoenix Code editor window. Returns a PNG image. " +
        "Prefer capturing specific regions instead of the full page: " +
        "use selector '#panel-live-preview-frame' for the live preview content, " +
        "or '.editor-holder' for the code editor area. " +
        "Only omit the selector when you need to see the full application layout.",
        { selector: z.string().optional().describe("CSS selector to capture a specific element. Use '#panel-live-preview-frame' for the live preview, '.editor-holder' for the code editor.") },
        async function (args) {
            try {
                const result = await nodeConnector.execPeer("takeScreenshot", {
                    selector: args.selector || undefined
                });
                if (result.base64) {
                    return {
                        content: [{ type: "image", data: result.base64, mimeType: "image/png" }]
                    };
                }
                return {
                    content: [{ type: "text", text: result.error || "Screenshot failed" }],
                    isError: true
                };
            } catch (err) {
                return {
                    content: [{ type: "text", text: "Error taking screenshot: " + err.message }],
                    isError: true
                };
            }
        }
    );

    const execJsInLivePreviewTool = sdkModule.tool(
        "execJsInLivePreview",
        "Execute JavaScript in the live preview iframe (the page being previewed), NOT in Phoenix itself. " +
        "Auto-opens the live preview panel if it is not already visible. Code is evaluated via eval() in " +
        "the global scope of the previewed page. Note: eval() is synchronous — async/await is NOT supported. " +
        "Only available when an HTML file is selected in the live preview — does not work for markdown or " +
        "other non-HTML file types. Use this to inspect or manipulate the user's live-previewed web page " +
        "(e.g. document.title, DOM queries).",
        { code: z.string().describe("JavaScript code to execute in the live preview iframe") },
        async function (args) {
            try {
                const result = await nodeConnector.execPeer("execJsInLivePreview", {
                    code: args.code
                });
                if (result.error) {
                    return {
                        content: [{ type: "text", text: "Error: " + result.error }],
                        isError: true
                    };
                }
                return {
                    content: [{ type: "text", text: result.result || "undefined" }]
                };
            } catch (err) {
                return {
                    content: [{ type: "text", text: "Error executing JS in live preview: " + err.message }],
                    isError: true
                };
            }
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
        "- setCursorPos: Open a file and set cursor position. Params: filePath, line, ch",
        {
            operations: z.array(z.object({
                operation: z.enum(["open", "close", "openInWorkingSet", "setSelection", "setCursorPos"]),
                filePath: z.string().describe("Absolute path to the file"),
                startLine: z.number().optional().describe("Start line (1-based) for setSelection"),
                startCh: z.number().optional().describe("Start column (1-based) for setSelection"),
                endLine: z.number().optional().describe("End line (1-based) for setSelection"),
                endCh: z.number().optional().describe("End column (1-based) for setSelection"),
                line: z.number().optional().describe("Line number (1-based) for setCursorPos"),
                ch: z.number().optional().describe("Column (1-based) for setCursorPos")
            })).describe("Array of editor operations to execute sequentially")
        },
        async function (args) {
            const results = [];
            let hasError = false;
            for (const op of args.operations) {
                try {
                    const result = await nodeConnector.execPeer("controlEditor", op);
                    results.push(result);
                    if (!result.success) {
                        hasError = true;
                    }
                } catch (err) {
                    results.push({ success: false, error: err.message });
                    hasError = true;
                }
            }
            return {
                content: [{ type: "text", text: JSON.stringify(results) }],
                isError: hasError
            };
        }
    );

    return sdkModule.createSdkMcpServer({
        name: "phoenix-editor",
        tools: [getEditorStateTool, takeScreenshotTool, execJsInLivePreviewTool, controlEditorTool]
    });
}

exports.createEditorMcpServer = createEditorMcpServer;
