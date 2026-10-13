import { WebSocketServer } from "ws";
import http from "node:http";
import { LogBuffer } from "./log-buffer.js";

/**
 * Serve existing Phoenix messages on loopback, with explicit listener ownership.
 * @param {number} port - Local port; zero is supported for isolated test fixtures.
 * @param {Object} [options] Optional hub HTTP/upgrade handlers sharing this listener.
 * @return {Object} Existing request API plus listener readiness and cancellation.
 */
export function createWSControlServer(port, options = {}) {
    const wss = new WebSocketServer({ noServer: true, maxPayload: 32 * 1024 * 1024, perMessageDeflate: false });
    const listeners = [];
    let closing = false;
    const clients = new Map(); // name -> { ws, logs, isAlive }
    let unknownCounter = 0;
    let requestIdCounter = 0;
    const pendingRequests = new Map();
    let heartbeatInterval = null;

    /** Reject only this socket's outstanding requests when its connection ends. */
    function cancelPending(reason = "Builder connection closed", socket) {
        for (const [id, pending] of pendingRequests) {
            if (!socket || pending.ws === socket) { pendingRequests.delete(id); pending.reject(new Error(reason)); }
        }
    }

    const ready = (async () => {
        try {
            const listener = http.createServer((request, response) => {
                if (options.handleHttp && options.handleHttp(request, response)) { return; }
                response.writeHead(404); response.end();
            });
            // Builder intentionally trusts all renderer origins, including custom native protocols.
            listener.on("upgrade", (request, socket, head) => {
                try {
                    const target = new URL(`http://${request.headers.host}`);
                    if (closing || target.hostname !== "localhost") {
                        socket.destroy(); return;
                    }
                    if (options.handleUpgrade && options.handleUpgrade(request, socket, head)) { return; }
                    if (wss.clients.size >= 64) { socket.destroy(); return; }
                    wss.handleUpgrade(request, socket, head, ws => wss.emit("connection", ws, request));
                } catch { socket.destroy(); }
            });
            await new Promise((resolve, reject) => {
                listener.once("error", reject);
                listener.listen({ port, host: "localhost" }, () => {
                    listener.removeListener("error", reject); resolve();
                });
            });
            if (closing) { await new Promise(resolve => listener.close(resolve)); return; }
            port = listener.address().port;
            listeners.push(listener);
        } catch (error) { await close(); throw error; }
    })();

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

            const reply = pendingRequests.get(msg.id);
            if (reply && reply.ws !== ws) { return; }
            if (clientName && clients.get(clientName)?.ws !== ws) { return; }

            switch (msg.type) {
                case "hello": {
                    if (clientName) { ws.close(1008, "Hello already received"); return; }
                    if (msg.name !== undefined && (typeof msg.name !== "string" || !msg.name.length
                        || msg.name.length > 200 || [...msg.name].some(char => char.charCodeAt(0) < 32))) {
                        ws.close(1008, "Invalid instance name"); return;
                    }
                    clientName = msg.name || ("Unknown-" + (++unknownCounter));
                    const machineId = typeof msg.machineId === "string" && msg.machineId.trim()
                        && msg.machineId.length <= 200 ? msg.machineId : null;

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
                            machineId,
                            isAlive: true
                        });
                    } else {
                        clients.set(clientName, {
                            ws: ws,
                            logs: new LogBuffer(),
                            machineId,
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
                        pending4.resolve({
                            entries: msg.entries || [],
                            totalEntries: msg.totalEntries || (msg.entries ? msg.entries.length : 0),
                            matchedEntries: msg.matchedEntries,
                            rangeEnd: msg.rangeEnd
                        });
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

                case "exec_js_live_preview_response": {
                    const pending6 = pendingRequests.get(msg.id);
                    if (pending6) {
                        pendingRequests.delete(msg.id);
                        if (msg.error) {
                            pending6.reject(new Error(msg.error));
                        } else {
                            pending6.resolve(msg.result);
                        }
                    }
                    break;
                }

                case "exec_js_in_test_iframe_response": {
                    const pending7 = pendingRequests.get(msg.id);
                    if (pending7) {
                        pendingRequests.delete(msg.id);
                        if (msg.error) {
                            pending7.reject(new Error(msg.error));
                        } else {
                            pending7.resolve(msg.result);
                        }
                    }
                    break;
                }

                case "run_tests_response": {
                    const pendingRt = pendingRequests.get(msg.id);
                    if (pendingRt) {
                        pendingRequests.delete(msg.id);
                        if (msg.success) {
                            pendingRt.resolve({ success: true, message: msg.message });
                        } else {
                            pendingRt.reject(new Error(msg.message || "run_tests failed"));
                        }
                    }
                    break;
                }

                case "get_test_results_response": {
                    const pendingTr = pendingRequests.get(msg.id);
                    if (pendingTr) {
                        pendingRequests.delete(msg.id);
                        pendingTr.resolve(msg);
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
            cancelPending("Phoenix instance disconnected", ws);
            if (clientName && clients.get(clientName)?.ws === ws) {
                clients.delete(clientName);
            }
        });

        ws.on("error", () => {
            cancelPending("Phoenix connection failed", ws);
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

            if (pendingRequests.size >= 128 || closing) { reject(new Error("Builder is busy or closing")); return; }
            const id = ++requestIdCounter;
            const timeout = setTimeout(() => {
                pendingRequests.delete(id);
                reject(new Error("Screenshot request timed out (30s)"));
            }, 30000);

            pendingRequests.set(id, {
                ws: client.ws,
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

            if (pendingRequests.size >= 128 || closing) { reject(new Error("Builder is busy or closing")); return; }
            const id = ++requestIdCounter;
            const timeout = setTimeout(() => {
                pendingRequests.delete(id);
                reject(new Error("Reload request timed out (30s)"));
            }, 30000);

            pendingRequests.set(id, {
                ws: client.ws,
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

    function requestLogs(instanceName, { tail = 50, before, filter } = {}) {
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

            if (pendingRequests.size >= 128 || closing) { reject(new Error("Builder is busy or closing")); return; }
            const id = ++requestIdCounter;
            const timeout = setTimeout(() => {
                pendingRequests.delete(id);
                reject(new Error("Log request timed out (10s)"));
            }, 10000);

            pendingRequests.set(id, {
                ws: client.ws,
                resolve: (data) => {
                    clearTimeout(timeout);
                    resolve(data);
                },
                reject: (err) => {
                    clearTimeout(timeout);
                    reject(err);
                }
            });

            const msg = { type: "get_logs_request", id, tail };
            if (before != null) {
                msg.before = before;
            }
            if (filter) {
                msg.filter = filter;
            }
            client.ws.send(JSON.stringify(msg));
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

            if (pendingRequests.size >= 128 || closing) { reject(new Error("Builder is busy or closing")); return; }
            const id = ++requestIdCounter;
            const timeout = setTimeout(() => {
                pendingRequests.delete(id);
                reject(new Error("exec_js request timed out (30s)"));
            }, 30000);

            pendingRequests.set(id, {
                ws: client.ws,
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

    function requestExecJsLivePreview(code, instanceName) {
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

            if (pendingRequests.size >= 128 || closing) { reject(new Error("Builder is busy or closing")); return; }
            const id = ++requestIdCounter;
            const timeout = setTimeout(() => {
                pendingRequests.delete(id);
                reject(new Error("exec_js_live_preview request timed out (60s)"));
            }, 60000);

            pendingRequests.set(id, {
                ws: client.ws,
                resolve: (data) => {
                    clearTimeout(timeout);
                    resolve(data);
                },
                reject: (err) => {
                    clearTimeout(timeout);
                    reject(err);
                }
            });

            client.ws.send(JSON.stringify({ type: "exec_js_live_preview_request", id, code }));
        });
    }

    function requestExecJsInTestIframe(code, instanceName) {
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

            if (pendingRequests.size >= 128 || closing) { reject(new Error("Builder is busy or closing")); return; }
            const id = ++requestIdCounter;
            const timeout = setTimeout(() => {
                pendingRequests.delete(id);
                reject(new Error("exec_js_in_test_iframe request timed out (30s)"));
            }, 30000);

            pendingRequests.set(id, {
                ws: client.ws,
                resolve: (data) => {
                    clearTimeout(timeout);
                    resolve(data);
                },
                reject: (err) => {
                    clearTimeout(timeout);
                    reject(err);
                }
            });

            client.ws.send(JSON.stringify({ type: "exec_js_in_test_iframe_request", id, code }));
        });
    }

    function requestRunTests(category, spec, instanceName) {
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

            if (pendingRequests.size >= 128 || closing) { reject(new Error("Builder is busy or closing")); return; }
            const id = ++requestIdCounter;
            const timeout = setTimeout(() => {
                pendingRequests.delete(id);
                reject(new Error("run_tests request timed out (30s)"));
            }, 30000);

            pendingRequests.set(id, {
                ws: client.ws,
                resolve: (data) => {
                    clearTimeout(timeout);
                    resolve(data);
                },
                reject: (err) => {
                    clearTimeout(timeout);
                    reject(err);
                }
            });

            const msg = { type: "run_tests_request", id, category };
            if (spec) {
                msg.spec = spec;
            }
            client.ws.send(JSON.stringify(msg));
        });
    }

    function requestTestResults(instanceName) {
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

            if (pendingRequests.size >= 128 || closing) { reject(new Error("Builder is busy or closing")); return; }
            const id = ++requestIdCounter;
            const timeout = setTimeout(() => {
                pendingRequests.delete(id);
                reject(new Error("get_test_results request timed out (30s)"));
            }, 30000);

            pendingRequests.set(id, {
                ws: client.ws,
                resolve: (data) => {
                    clearTimeout(timeout);
                    resolve(data);
                },
                reject: (err) => {
                    clearTimeout(timeout);
                    reject(err);
                }
            });

            client.ws.send(JSON.stringify({ type: "get_test_results_request", id }));
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

    /** Return canonical machine membership without guessing from names or loopback addresses. */
    function getMachines() {
        const groups = new Map();
        for (const [name, client] of clients) {
            if (!groups.has(client.machineId)) { groups.set(client.machineId, []); }
            groups.get(client.machineId).push(name);
        }
        return [...groups].map(([machineId, instances]) => ({ machineId, instances }));
    }

    /** Close listener-owned sockets and reject pending calls without terminating user-opened apps. */
    async function close() {
        if (closing) { return; }
        closing = true;
        clearInterval(heartbeatInterval);
        cancelPending("Builder server shutting down");
        for (const socket of wss.clients) { socket.terminate(); }
        clients.clear();
        await Promise.all(listeners.map(listener => new Promise(resolve => listener.close(resolve))));
        await new Promise(resolve => wss.close(resolve));
    }

    return {
        ready,
        cancelPending,
        requestScreenshot,
        requestReload,
        requestLogs,
        requestExecJs,
        requestExecJsLivePreview,
        requestExecJsInTestIframe,
        requestRunTests,
        requestTestResults,
        getBrowserLogs,
        clearBrowserLogs,
        isClientConnected,
        getConnectedInstances,
        getMachines,
        close,
        getPort: () => port
    };
}
