import { WebSocketServer } from "ws";
import { LogBuffer } from "./log-buffer.js";

export function createWSControlServer(port) {
    const wss = new WebSocketServer({ port });
    const clients = new Map(); // name -> { ws, logs, isAlive }
    let unknownCounter = 0;
    let requestIdCounter = 0;
    const pendingRequests = new Map();
    let heartbeatInterval = null;

    wss.on("connection", (ws) => {
        // Name is assigned when the client sends a "hello" message.
        // Track the ws temporarily so we can map it back on close/error.
        let clientName = null;

        ws.on("message", (data) => {
            let msg;
            try {
                msg = JSON.parse(data.toString());
            } catch {
                return;
            }

            switch (msg.type) {
                case "hello": {
                    clientName = msg.name || ("Unknown-" + (++unknownCounter));

                    // If same name reconnects (e.g. tab reload), close old connection
                    // but preserve the existing log buffer so logs survive across reloads
                    const existing = clients.get(clientName);
                    if (existing) {
                        try {
                            existing.ws.close(1000, "Replaced by new connection");
                        } catch {
                            // ignore
                        }
                        clients.set(clientName, {
                            ws: ws,
                            logs: existing.logs,
                            isAlive: true
                        });
                    } else {
                        clients.set(clientName, {
                            ws: ws,
                            logs: new LogBuffer(),
                            isAlive: true
                        });
                    }
                    break;
                }

                case "console_log": {
                    const client = clientName && clients.get(clientName);
                    if (client && Array.isArray(msg.entries)) {
                        for (const entry of msg.entries) {
                            client.logs.push(entry);
                        }
                    }
                    break;
                }

                case "screenshot_response": {
                    const pending = pendingRequests.get(msg.id);
                    if (pending) {
                        pendingRequests.delete(msg.id);
                        pending.resolve(msg.data);
                    }
                    break;
                }

                case "get_logs_response": {
                    const pending4 = pendingRequests.get(msg.id);
                    if (pending4) {
                        pendingRequests.delete(msg.id);
                        pending4.resolve(msg.entries || []);
                    }
                    break;
                }

                case "exec_js_response": {
                    const pending5 = pendingRequests.get(msg.id);
                    if (pending5) {
                        pendingRequests.delete(msg.id);
                        if (msg.error) {
                            pending5.reject(new Error(msg.error));
                        } else {
                            pending5.resolve(msg.result);
                        }
                    }
                    break;
                }

                case "reload_response": {
                    const pending3 = pendingRequests.get(msg.id);
                    if (pending3) {
                        pendingRequests.delete(msg.id);
                        if (msg.success) {
                            pending3.resolve({ success: true });
                        } else {
                            pending3.reject(new Error(msg.message || "Reload failed"));
                        }
                    }
                    break;
                }

                case "error": {
                    const pending2 = pendingRequests.get(msg.id);
                    if (pending2) {
                        pendingRequests.delete(msg.id);
                        pending2.reject(new Error(msg.message || "Unknown error from Phoenix"));
                    }
                    break;
                }

                case "pong": {
                    const client = clientName && clients.get(clientName);
                    if (client) {
                        client.isAlive = true;
                    }
                    break;
                }
            }
        });

        ws.on("close", () => {
            if (clientName && clients.get(clientName)?.ws === ws) {
                clients.delete(clientName);
            }
        });

        ws.on("error", () => {
            if (clientName && clients.get(clientName)?.ws === ws) {
                clients.delete(clientName);
            }
        });
    });

    // Heartbeat
    heartbeatInterval = setInterval(() => {
        for (const [name, client] of clients) {
            if (!client.isAlive) {
                client.ws.terminate();
                clients.delete(name);
                continue;
            }
            client.isAlive = false;
            try {
                client.ws.send(JSON.stringify({ type: "ping" }));
            } catch {
                // ignore send errors
            }
        }
    }, 15000);

    function _resolveClient(instanceName) {
        if (clients.size === 0) {
            return { error: "No Phoenix client connected" };
        }

        if (!instanceName) {
            if (clients.size === 1) {
                const [name, client] = [...clients.entries()][0];
                return { name, client };
            }
            const names = [...clients.keys()];
            return {
                error: "Multiple Phoenix instances connected. Specify an instance name: " +
                    names.join(", ")
            };
        }

        const client = clients.get(instanceName);
        if (!client) {
            const names = [...clients.keys()];
            return {
                error: "Instance \"" + instanceName + "\" not found. Available: " +
                    names.join(", ")
            };
        }

        return { name: instanceName, client };
    }

    function requestScreenshot(selector, instanceName) {
        return new Promise((resolve, reject) => {
            const resolved = _resolveClient(instanceName);
            if (resolved.error) {
                reject(new Error(resolved.error));
                return;
            }

            const { client } = resolved;
            if (client.ws.readyState !== 1) {
                reject(new Error("Phoenix client \"" + resolved.name + "\" is not connected"));
                return;
            }

            const id = ++requestIdCounter;
            const timeout = setTimeout(() => {
                pendingRequests.delete(id);
                reject(new Error("Screenshot request timed out (30s)"));
            }, 30000);

            pendingRequests.set(id, {
                resolve: (data) => {
                    clearTimeout(timeout);
                    resolve(data);
                },
                reject: (err) => {
                    clearTimeout(timeout);
                    reject(err);
                }
            });

            const msg = { type: "screenshot_request", id };
            if (selector) {
                msg.selector = selector;
            }
            client.ws.send(JSON.stringify(msg));
        });
    }

    function requestReload(forceClose, instanceName) {
        return new Promise((resolve, reject) => {
            const resolved = _resolveClient(instanceName);
            if (resolved.error) {
                reject(new Error(resolved.error));
                return;
            }

            const { client } = resolved;
            if (client.ws.readyState !== 1) {
                reject(new Error("Phoenix client \"" + resolved.name + "\" is not connected"));
                return;
            }

            const id = ++requestIdCounter;
            const timeout = setTimeout(() => {
                pendingRequests.delete(id);
                reject(new Error("Reload request timed out (30s)"));
            }, 30000);

            pendingRequests.set(id, {
                resolve: (data) => {
                    clearTimeout(timeout);
                    resolve(data);
                },
                reject: (err) => {
                    clearTimeout(timeout);
                    reject(err);
                }
            });

            client.ws.send(JSON.stringify({
                type: "reload_request",
                id,
                forceClose: !!forceClose
            }));
        });
    }

    function requestLogs(instanceName) {
        return new Promise((resolve, reject) => {
            const resolved = _resolveClient(instanceName);
            if (resolved.error) {
                reject(new Error(resolved.error));
                return;
            }

            const { client } = resolved;
            if (client.ws.readyState !== 1) {
                reject(new Error("Phoenix client \"" + resolved.name + "\" is not connected"));
                return;
            }

            const id = ++requestIdCounter;
            const timeout = setTimeout(() => {
                pendingRequests.delete(id);
                reject(new Error("Log request timed out (10s)"));
            }, 10000);

            pendingRequests.set(id, {
                resolve: (data) => {
                    clearTimeout(timeout);
                    resolve(data);
                },
                reject: (err) => {
                    clearTimeout(timeout);
                    reject(err);
                }
            });

            client.ws.send(JSON.stringify({ type: "get_logs_request", id }));
        });
    }

    function requestExecJs(code, instanceName) {
        return new Promise((resolve, reject) => {
            const resolved = _resolveClient(instanceName);
            if (resolved.error) {
                reject(new Error(resolved.error));
                return;
            }

            const { client } = resolved;
            if (client.ws.readyState !== 1) {
                reject(new Error("Phoenix client \"" + resolved.name + "\" is not connected"));
                return;
            }

            const id = ++requestIdCounter;
            const timeout = setTimeout(() => {
                pendingRequests.delete(id);
                reject(new Error("exec_js request timed out (30s)"));
            }, 30000);

            pendingRequests.set(id, {
                resolve: (data) => {
                    clearTimeout(timeout);
                    resolve(data);
                },
                reject: (err) => {
                    clearTimeout(timeout);
                    reject(err);
                }
            });

            client.ws.send(JSON.stringify({ type: "exec_js_request", id, code }));
        });
    }

    function getBrowserLogs(sinceLast, instanceName) {
        const resolved = _resolveClient(instanceName);
        if (resolved.error) {
            return { error: resolved.error };
        }

        const { client } = resolved;
        if (sinceLast) {
            return client.logs.getSinceLastRead();
        }
        return client.logs.getAll();
    }

    function clearBrowserLogs(instanceName) {
        const resolved = _resolveClient(instanceName);
        if (resolved.error) {
            return { error: resolved.error };
        }
        resolved.client.logs.clear();
    }

    function isClientConnected() {
        return clients.size > 0;
    }

    function getConnectedInstances() {
        return [...clients.keys()];
    }

    function close() {
        clearInterval(heartbeatInterval);
        for (const [id, pending] of pendingRequests) {
            pending.reject(new Error("Server shutting down"));
        }
        pendingRequests.clear();
        for (const [name, client] of clients) {
            try {
                client.ws.close(1000, "Server shutting down");
            } catch {
                // ignore
            }
        }
        clients.clear();
        wss.close();
    }

    return {
        requestScreenshot,
        requestReload,
        requestLogs,
        requestExecJs,
        getBrowserLogs,
        clearBrowserLogs,
        isClientConnected,
        getConnectedInstances,
        close,
        getPort: () => port
    };
}
