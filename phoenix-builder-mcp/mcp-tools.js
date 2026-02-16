import { z } from "zod";

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
        "Get stdout/stderr output from the Electron process. By default returns new logs since last call; set clear=true to get all logs and clear the buffer.",
        { clear: z.boolean().default(false).describe("If true, return all logs and clear the buffer. If false, return only new logs since last read.") },
        async ({ clear }) => {
            let logs;
            if (clear) {
                logs = processManager.getTerminalLogs(false);
                processManager.clearTerminalLogs();
            } else {
                logs = processManager.getTerminalLogs(true);
            }
            const text = logs.map(e => `[${e.stream}] ${e.text}`).join("");
            return {
                content: [{
                    type: "text",
                    text: text || "(no terminal logs)"
                }]
            };
        }
    );

    server.tool(
        "get_browser_console_logs",
        "Get console logs captured from the Phoenix browser runtime from boot time. Fetches the full retained log buffer directly from the browser instance.",
        {
            instance: z.string().optional().describe("Target a specific Phoenix instance by name (e.g. 'Phoenix-a3f2'). Required when multiple instances are connected.")
        },
        async ({ instance }) => {
            try {
                const logs = await wsControlServer.requestLogs(instance);
                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify(logs.length > 0 ? logs : "(no browser logs)")
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
