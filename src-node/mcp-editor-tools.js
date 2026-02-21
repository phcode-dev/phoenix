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
 * Provides two tools:
 *   - getEditorState: returns active file, working set, and live preview file
 *   - takeScreenshot: captures a screenshot of the Phoenix window as base64 PNG
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
        "Get the current Phoenix editor state: active file, working set (open files), and live preview file.",
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
        "Take a screenshot of the Phoenix Code editor window. Returns a PNG image.",
        { selector: z.string().optional().describe("Optional CSS selector to capture a specific element") },
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

    return sdkModule.createSdkMcpServer({
        name: "phoenix-editor",
        tools: [getEditorStateTool, takeScreenshotTool]
    });
}

exports.createEditorMcpServer = createEditorMcpServer;
