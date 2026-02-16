import { z } from "zod";

const DEFAULT_MAX_CHARS = 10000;

function _trimToCharBudget(lines, maxChars) {
    let total = 0;
    // Walk backwards (newest first) to keep the most recent entries
    let startIdx = lines.length;
    for (let i = lines.length - 1; i >= 0; i--) {
        const cost = lines[i].length + 1; // +1 for newline
        if (total + cost > maxChars) { break; }
        total += cost;
        startIdx = i;
    }
    return { lines: lines.slice(startIdx), trimmed: startIdx };
}

export function registerTools(server, processManager, wsControlServer, phoenixDesktopPath) {
    server.tool(
        "start_phoenix",
        "Start the Phoenix Code desktop app (Electron). Launches npm run serve:electron in the phoenix-desktop directory.",
        {},
        async () => {
            try {
                if (processManager.isRunning()) {
                    return {
                        content: [{
                            type: "text",
                            text: JSON.stringify({
                                success: false,
                                error: "Phoenix is already running",
                                pid: processManager.getPid()
                            })
                        }]
                    };
                }
                const result = await processManager.start(phoenixDesktopPath);
                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify({
                            success: true,
                            pid: result.pid,
                            wsPort: wsControlServer.getPort()
                        })
                    }]
                };
            } catch (err) {
                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify({ success: false, error: err.message })
                    }]
                };
            }
        }
    );

    server.tool(
        "stop_phoenix",
        "Stop the running Phoenix Code desktop app.",
        {},
        async () => {
            try {
                const result = await processManager.stop();
                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify(result)
                    }]
                };
            } catch (err) {
                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify({ success: false, error: err.message })
                    }]
                };
            }
        }
    );

    server.tool(
        "get_terminal_logs",
        "Get stdout/stderr output from the Electron process. Returns last 50 entries by default. " +
        "USAGE: Start with default tail=50. Use filter (regex) to narrow results (e.g. filter='error|warn'). " +
        "Use before=N (from previous totalEntries) to page back. Avoid tail=0 unless necessary — " +
        "prefer filter + small tail to keep responses compact.",
        {
            clear: z.boolean().default(false).describe("If true, return all logs and clear the buffer. If false, return only new logs since last read."),
            tail: z.number().default(50).describe("Return last N entries. 0 = all."),
            before: z.number().optional().describe("Cursor: return entries before this totalEntries position. Use the totalEntries value from a previous response to page back stably."),
            filter: z.string().optional().describe("Optional regex to filter log entries by text content. Applied before tail/before."),
            maxChars: z.number().default(DEFAULT_MAX_CHARS).describe("Max character budget for log content. Oldest entries are dropped first to fit. 0 = unlimited.")
        },
        async ({ clear, tail, before, filter, maxChars }) => {
            let logs;
            if (clear) {
                logs = processManager.getTerminalLogs(false);
                processManager.clearTerminalLogs();
            } else {
                logs = processManager.getTerminalLogs(true);
            }
            const totalEntries = processManager.getTerminalLogsTotalPushed();
            let filterRe;
            if (filter) {
                try {
                    filterRe = new RegExp(filter, "i");
                } catch (e) {
                    return {
                        content: [{
                            type: "text",
                            text: `Invalid filter regex: ${e.message}`
                        }]
                    };
                }
                logs = logs.filter(e => filterRe.test(e.text));
            }
            const matchedEntries = logs.length;
            const endIdx = before != null ? Math.max(0, Math.min(matchedEntries, before)) : matchedEntries;
            if (tail > 0) {
                const startIdx = Math.max(0, endIdx - tail);
                logs = logs.slice(startIdx, endIdx);
            } else {
                logs = logs.slice(0, endIdx);
            }
            let lines = logs.map(e => `[${e.stream}] ${e.text}`);
            let trimmed = 0;
            if (maxChars > 0) {
                const result = _trimToCharBudget(lines, maxChars);
                lines = result.lines;
                trimmed = result.trimmed;
            }
            const showing = lines.length;
            const rangeEnd = endIdx;
            const rangeStart = rangeEnd - logs.length;
            const actualStart = rangeStart + trimmed;
            const hasMore = actualStart > 0;
            let header = `[Logs: ${totalEntries} total`;
            if (filter) {
                header += `, ${matchedEntries} matched /${filter}/i`;
            }
            header += `, showing ${actualStart}-${rangeEnd} (${showing} entries).`;
            if (trimmed > 0) {
                header += ` ${trimmed} entries trimmed to fit maxChars=${maxChars}.`;
            }
            if (hasMore) {
                header += ` hasMore=true, use before=${actualStart} to page back.`;
            }
            header += `]`;
            const text = lines.join("");
            return {
                content: [{
                    type: "text",
                    text: text ? header + "\n" + text : "(no terminal logs)"
                }]
            };
        }
    );

    server.tool(
        "get_browser_console_logs",
        "Get console logs from the Phoenix browser runtime. Returns last 50 entries by default. " +
        "USAGE: Start with default tail=50. Use filter (regex) to narrow results (e.g. filter='error|warn'). " +
        "Use before=N (from previous totalEntries) to page back. Avoid tail=0 unless necessary — " +
        "prefer filter + small tail to keep responses compact.",
        {
            instance: z.string().optional().describe("Target a specific Phoenix instance by name (e.g. 'Phoenix-a3f2'). Required when multiple instances are connected."),
            tail: z.number().default(50).describe("Return last N entries. 0 = all."),
            before: z.number().optional().describe("Cursor: return entries before this totalEntries position. Use the totalEntries value from a previous response to page back stably."),
            filter: z.string().optional().describe("Optional regex to filter log entries by message content. Applied before tail/before."),
            maxChars: z.number().default(DEFAULT_MAX_CHARS).describe("Max character budget for log content. Oldest entries are dropped first to fit. 0 = unlimited.")
        },
        async ({ instance, tail, before, filter, maxChars }) => {
            try {
                const result = await wsControlServer.requestLogs(instance, { tail, before, filter });
                const entries = result.entries || [];
                const totalEntries = result.totalEntries || entries.length;
                const matchedEntries = result.matchedEntries != null ? result.matchedEntries : entries.length;
                const rangeEnd = result.rangeEnd != null ? result.rangeEnd : matchedEntries;
                let lines = entries.map(e => `[${e.level}] ${e.message}`);
                let trimmed = 0;
                if (maxChars > 0) {
                    const trimResult = _trimToCharBudget(lines, maxChars);
                    lines = trimResult.lines;
                    trimmed = trimResult.trimmed;
                }
                const showing = lines.length;
                const rangeStart = rangeEnd - entries.length;
                const actualStart = rangeStart + trimmed;
                const hasMore = actualStart > 0;
                let header = `[Logs: ${totalEntries} total`;
                if (filter) {
                    header += `, ${matchedEntries} matched /${filter}/i`;
                }
                header += `, showing ${actualStart}-${rangeEnd} (${showing} entries).`;
                if (trimmed > 0) {
                    header += ` ${trimmed} entries trimmed to fit maxChars=${maxChars}.`;
                }
                if (hasMore) {
                    header += ` hasMore=true, use before=${actualStart} to page back.`;
                }
                header += `]`;
                if (showing === 0) {
                    return {
                        content: [{
                            type: "text",
                            text: "(no browser logs)"
                        }]
                    };
                }
                const text = lines.join("\n");
                return {
                    content: [{
                        type: "text",
                        text: header + "\n" + text
                    }]
                };
            } catch (err) {
                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify({ error: err.message })
                    }]
                };
            }
        }
    );

    server.tool(
        "take_screenshot",
        "Take a screenshot of the Phoenix Code app window. Returns a PNG image.",
        {
            selector: z.string().optional().describe("Optional CSS selector to capture a specific element"),
            instance: z.string().optional().describe("Target a specific Phoenix instance by name (e.g. 'Phoenix-a3f2'). Required when multiple instances are connected.")
        },
        async ({ selector, instance }) => {
            try {
                const base64Data = await wsControlServer.requestScreenshot(selector, instance);
                return {
                    content: [{
                        type: "image",
                        data: base64Data,
                        mimeType: "image/png"
                    }]
                };
            } catch (err) {
                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify({ error: err.message })
                    }]
                };
            }
        }
    );

    server.tool(
        "reload_phoenix",
        "Reload the Phoenix Code app. Closes all open files (prompting to save unsaved changes) then reloads the app.",
        {
            instance: z.string().optional().describe("Target a specific Phoenix instance by name (e.g. 'Phoenix-a3f2'). Required when multiple instances are connected.")
        },
        async ({ instance }) => {
            try {
                const result = await wsControlServer.requestReload(false, instance);
                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify({ success: true, message: "Phoenix is reloading" })
                    }]
                };
            } catch (err) {
                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify({ error: err.message })
                    }]
                };
            }
        }
    );

    server.tool(
        "force_reload_phoenix",
        "Force reload the Phoenix Code app without saving. Closes all open files without saving unsaved changes, then reloads the app.",
        {
            instance: z.string().optional().describe("Target a specific Phoenix instance by name (e.g. 'Phoenix-a3f2'). Required when multiple instances are connected.")
        },
        async ({ instance }) => {
            try {
                const result = await wsControlServer.requestReload(true, instance);
                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify({ success: true, message: "Phoenix is force reloading (unsaved changes discarded)" })
                    }]
                };
            } catch (err) {
                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify({ error: err.message })
                    }]
                };
            }
        }
    );

    server.tool(
        "exec_js",
        "Execute JavaScript in the Phoenix Code browser runtime and return the result. " +
        "Code runs async in the page context with access to: " +
        "$ (jQuery) for DOM queries/clicks, " +
        "brackets.test.CommandManager, brackets.test.EditorManager, brackets.test.ProjectManager, " +
        "brackets.test.DocumentManager, brackets.test.FileSystem, brackets.test.FileUtils, " +
        "and 50+ other modules on brackets.test.* — " +
        "supports await.",
        {
            code: z.string().describe("JavaScript code to execute in Phoenix"),
            instance: z.string().optional().describe("Target a specific Phoenix instance by name (e.g. 'Phoenix-a3f2'). Required when multiple instances are connected.")
        },
        async ({ code, instance }) => {
            try {
                const result = await wsControlServer.requestExecJs(code, instance);
                return {
                    content: [{
                        type: "text",
                        text: result !== undefined ? String(result) : "(undefined)"
                    }]
                };
            } catch (err) {
                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify({ error: err.message })
                    }]
                };
            }
        }
    );

    server.tool(
        "exec_js_in_live_preview",
        "Execute JavaScript in the live preview iframe (the page being previewed), NOT in Phoenix itself. " +
        "Auto-opens the live preview panel if it is not already visible. " +
        "Code is evaluated via eval() in the global scope of the previewed page. " +
        "Note: eval() is synchronous — async/await is NOT supported. " +
        "Only available when an HTML file is selected in the live preview — " +
        "does not work for markdown or other non-HTML file types. " +
        "Use this to inspect or manipulate the user's live-previewed web page (e.g. document.title, DOM queries).",
        {
            code: z.string().describe("JavaScript code to execute in the live preview iframe"),
            instance: z.string().optional().describe("Target a specific Phoenix instance by name (e.g. 'Phoenix-a3f2'). Required when multiple instances are connected.")
        },
        async ({ code, instance }) => {
            try {
                const result = await wsControlServer.requestExecJsLivePreview(code, instance);
                return {
                    content: [{
                        type: "text",
                        text: result !== undefined ? String(result) : "(undefined)"
                    }]
                };
            } catch (err) {
                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify({ error: err.message })
                    }]
                };
            }
        }
    );

    server.tool(
        "get_phoenix_status",
        "Check the status of the Phoenix process and WebSocket connection.",
        {},
        async () => {
            return {
                content: [{
                    type: "text",
                    text: JSON.stringify({
                        processRunning: processManager.isRunning(),
                        pid: processManager.getPid(),
                        wsConnected: wsControlServer.isClientConnected(),
                        connectedInstances: wsControlServer.getConnectedInstances(),
                        wsPort: wsControlServer.getPort()
                    })
                }]
            };
        }
    );
}
