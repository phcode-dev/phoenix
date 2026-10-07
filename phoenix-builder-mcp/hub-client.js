import WebSocket from "ws";

/**
 * Persistent adapter connection. Failed calls are never replayed after reconnecting.
 * @param {Object} options Hub URL, display-name supplier and optional connection/call timeouts.
 * @return {Object} Tool-call proxy, session inspection and connection cleanup.
 */
export function createHubClient({ url, name = () => "agent", connectTimeoutMs = 2500, callTimeoutMs = 90000 }) {
    let socket;
    let connecting;
    let stopped = false;
    let reconnectTimer;
    let delay = 500;
    let nextId = 0;
    let agent = null;
    const pending = new Map();

    /** Close this adapter's pending calls, never another agent's requests or Phoenix connections. */
    function failPending(error) {
        for (const item of pending.values()) { clearTimeout(item.timer); item.reject(error); }
        pending.clear();
    }

    /** Connect once; multiple tool calls share readiness and later receive independent replies. */
    function connect() {
        if (stopped) { return Promise.reject(new Error("Builder adapter closed")); }
        if (socket && socket.readyState === WebSocket.OPEN && agent) { return Promise.resolve(agent); }
        if (connecting) { return connecting; }
        clearTimeout(reconnectTimer);
        let resolveReady;
        let rejectReady;
        const ready = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
        connecting = ready;
        const ws = new WebSocket(url, { maxPayload: 32 * 1024 * 1024, perMessageDeflate: false });
        socket = ws;
        const timeout = setTimeout(() => ws.terminate(), connectTimeoutMs);
        const unavailable = () => new Error("Phoenix Builder hub is unavailable. Start npm run serve, then retry. " +
            "A disconnected call may have started; inspect the machine before repeating a mutation.");
        ws.on("open", () => ws.send(JSON.stringify({ type: "hello", version: 1, name: name() })));
        ws.on("message", data => {
            let message;
            try { message = JSON.parse(data.toString()); } catch { ws.terminate(); return; }
            if (message.type === "hello" && message.version === 1) {
                clearTimeout(timeout);
                agent = message.agent;
                connecting = null;
                delay = 500;
                resolveReady(agent);
            } else if (message.type === "result") {
                const item = pending.get(message.id);
                if (item) { clearTimeout(item.timer); pending.delete(message.id); item.resolve(message.result); }
            }
        });
        ws.on("error", () => { /* close handles readiness and pending calls together */ });
        ws.on("close", () => {
            clearTimeout(timeout);
            if (socket !== ws) { return; }
            agent = null;
            connecting = null;
            rejectReady(unavailable());
            failPending(unavailable());
            if (!stopped) {
                reconnectTimer = setTimeout(() => connect().catch(() => {}), delay);
                delay = Math.min(5000, delay * 2);
            }
        });
        return ready;
    }

    return {
        connect,
        getSession: () => agent,
        /** Forward one tool call using a connection-local ID; never retry it automatically. */
        async call(toolName, args = {}) {
            await connect();
            return new Promise((resolve, reject) => {
                const id = ++nextId;
                const timer = setTimeout(() => {
                    pending.delete(id);
                    reject(new Error("Builder call timed out; inspect its outcome before retrying"));
                }, callTimeoutMs);
                pending.set(id, { resolve, reject, timer });
                socket.send(JSON.stringify({ type: "call", id, name: toolName, args }), error => {
                    if (!error) { return; }
                    clearTimeout(timer); pending.delete(id); reject(error);
                });
            });
        },
        /** End this adapter, letting the hub release its reservations through socket close. */
        close() {
            stopped = true;
            clearTimeout(reconnectTimer);
            failPending(new Error("Builder adapter closed"));
            if (socket) { socket.terminate(); }
        }
    };
}
