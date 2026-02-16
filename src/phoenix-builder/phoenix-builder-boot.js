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

// Phoenix Builder boot-time script. Loaded synchronously before loggerSetup.js
// to capture ALL console output from the very start of boot.
// No AMD dependencies — only uses window.AppConfig and localStorage.

/*globals AppConfig*/

(function () {

    // Gate checks — exit immediately if not enabled or not a dev build
    if (localStorage.getItem("phoenixBuilderEnabled") !== "true") {
        return;
    }
    if (!window.AppConfig || AppConfig.config.environment !== "dev") {
        return;
    }

    // --- Constants ---
    const LOG_TO_CONSOLE_KEY = "logToConsole";
    const INSTANCE_NAME_KEY = "phoenixBuilderInstanceName";
    const FLUSH_INTERVAL = 500;
    const FLUSH_THRESHOLD = 50;
    const MAX_BUFFER_SIZE = 1000;
    const MAX_MESSAGE_LENGTH = 2000;
    const RECONNECT_BASE_MS = 500;
    const RECONNECT_MAX_MS = 5000;
    const DEFAULT_WS_URL = "ws://localhost:38571";

    // --- State ---
    let ws = null;
    let logBuffer = [];
    const capturedLogs = [];
    let flushTimer = null;
    let reconnectTimer = null;
    let reconnectDelay = RECONNECT_BASE_MS;
    let currentUrl = null;
    let autoReconnect = true;
    const handlers = {};

    // --- Enable logToConsole so loggerSetup.js preserves console.log ---
    localStorage.setItem(LOG_TO_CONSOLE_KEY, "true");

    // --- Save original console methods ---
    const originalConsoleLog = console.log;
    const originalConsoleInfo = console.info;
    const originalConsoleWarn = console.warn;
    const originalConsoleError = console.error;

    // --- Platform / instance helpers ---
    function _getPlatformTag() {
        if (window.__TAURI__) {
            return "tauri";
        }
        if (window.__ELECTRON__) {
            return "electron";
        }
        const desktop = Phoenix.browser && Phoenix.browser.desktop;
        if (desktop) {
            if (desktop.isFirefox) { return "firefox"; }
            if (desktop.isEdgeChromium) { return "edge"; }
            if (desktop.isOperaChromium || desktop.isOpera) { return "opera"; }
            if (desktop.isChrome) { return "chrome"; }
            if (desktop.isSafari) { return "safari"; }
            if (desktop.isChromeBased) { return "chromium"; }
        }
        return "browser";
    }

    function _getOrCreateInstanceName() {
        let name = sessionStorage.getItem(INSTANCE_NAME_KEY);
        if (!name) {
            const hex = Math.floor(Math.random() * 0x10000).toString(16).padStart(4, "0");
            name = "phoenix-" + _getPlatformTag() + "-" + hex;
            sessionStorage.setItem(INSTANCE_NAME_KEY, name);
        }
        return name;
    }

    // --- Serialization ---
    function _serializeArg(arg) {
        if (arg === null) { return "null"; }
        if (arg === undefined) { return "undefined"; }
        if (typeof arg === "string") {
            return arg.length > MAX_MESSAGE_LENGTH ? arg.substring(0, MAX_MESSAGE_LENGTH) + "..." : arg;
        }
        if (typeof arg === "number" || typeof arg === "boolean") {
            return String(arg);
        }
        if (arg instanceof Error) {
            return arg.stack || arg.message || String(arg);
        }
        try {
            const seen = new Set();
            const json = JSON.stringify(arg, function (key, value) {
                if (typeof value === "object" && value !== null) {
                    if (seen.has(value)) { return "[Circular]"; }
                    seen.add(value);
                }
                return value;
            });
            return json.length > MAX_MESSAGE_LENGTH ? json.substring(0, MAX_MESSAGE_LENGTH) + "..." : json;
        } catch (e) {
            return String(arg);
        }
    }

    // --- Log buffering ---
    function _pushLogEntry(level, args) {
        const message = Array.from(args).map(_serializeArg).join(" ");
        const entry = {
            level: level,
            message: message,
            timestamp: new Date().toISOString()
        };
        logBuffer.push(entry);
        capturedLogs.push(entry);
        // Cap buffer size — drop oldest entries to prevent unbounded memory growth
        if (logBuffer.length > MAX_BUFFER_SIZE) {
            logBuffer = logBuffer.slice(logBuffer.length - MAX_BUFFER_SIZE);
        }
        if (capturedLogs.length > MAX_BUFFER_SIZE) {
            capturedLogs.splice(0, capturedLogs.length - MAX_BUFFER_SIZE);
        }
        if (logBuffer.length >= FLUSH_THRESHOLD && ws && ws.readyState === WebSocket.OPEN) {
            _flushLogs();
        }
    }

    function _flushLogs() {
        if (!ws || ws.readyState !== WebSocket.OPEN || logBuffer.length === 0) {
            return;
        }
        const entries = logBuffer;
        logBuffer = [];
        try {
            ws.send(JSON.stringify({
                type: "console_log",
                entries: entries
            }));
        } catch (e) {
            // Put them back if send failed
            logBuffer = entries.concat(logBuffer);
        }
    }

    // --- Console hooks ---
    console.log = function () {
        _pushLogEntry("log", arguments);
        originalConsoleLog.apply(console, arguments);
    };
    console.info = function () {
        _pushLogEntry("info", arguments);
        originalConsoleInfo.apply(console, arguments);
    };
    console.warn = function () {
        _pushLogEntry("warn", arguments);
        originalConsoleWarn.apply(console, arguments);
    };
    console.error = function () {
        _pushLogEntry("error", arguments);
        originalConsoleError.apply(console, arguments);
    };

    // --- Error listeners ---
    window.addEventListener("error", function (event) {
        _pushLogEntry("error", ["[Uncaught Error] " + (event.message || "") +
            (event.filename ? " at " + event.filename + ":" + event.lineno : "")]);
    });

    window.addEventListener("unhandledrejection", function (event) {
        const reason = event.reason;
        const msg = reason instanceof Error ? (reason.stack || reason.message) : String(reason);
        _pushLogEntry("error", ["[Unhandled Promise Rejection] " + msg]);
    });

    // --- Message sending ---
    function _sendMessage(msg) {
        if (ws && ws.readyState === WebSocket.OPEN) {
            try {
                ws.send(JSON.stringify(msg));
            } catch (e) {
                // ignore
            }
        }
    }

    // --- Reconnect ---
    function _scheduleReconnect() {
        if (!autoReconnect || !currentUrl || reconnectTimer) { return; }
        reconnectTimer = setTimeout(function () {
            reconnectTimer = null;
            if (!ws && currentUrl && autoReconnect) {
                connect(currentUrl);
            }
        }, reconnectDelay);
        reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_MS);
    }

    // --- Cleanup (does NOT unhook console — keeps buffering for reconnect) ---
    function _cleanup() {
        if (flushTimer) {
            clearInterval(flushTimer);
            flushTimer = null;
        }
        ws = null;
    }

    // --- Connect / disconnect ---
    function connect(url) {
        if (ws) {
            disconnect();
        }

        currentUrl = url;
        autoReconnect = true;

        try {
            ws = new WebSocket(url);
        } catch (e) {
            ws = null;
            _scheduleReconnect();
            return;
        }

        ws.onopen = function () {
            reconnectDelay = RECONNECT_BASE_MS;
            _sendMessage({ type: "hello", version: "1.0.0", name: _getOrCreateInstanceName() });
            flushTimer = setInterval(_flushLogs, FLUSH_INTERVAL);
            _flushLogs();
        };

        ws.onmessage = function (event) {
            let msg;
            try {
                msg = JSON.parse(event.data);
            } catch (e) {
                return;
            }

            // Dispatch to registered handler, or built-in defaults
            if (msg.type && handlers[msg.type]) {
                handlers[msg.type](msg);
            } else if (msg.type === "ping") {
                _sendMessage({ type: "pong" });
            }
        };

        ws.onclose = function () {
            _cleanup();
            _scheduleReconnect();
        };

        ws.onerror = function () {
            // onclose will be called after this
        };
    }

    function disconnect() {
        autoReconnect = false;
        if (reconnectTimer) {
            clearTimeout(reconnectTimer);
            reconnectTimer = null;
        }
        if (ws) {
            try {
                ws.close(1000, "Disconnecting");
            } catch (e) {
                // ignore
            }
            _cleanup();
        }
    }

    function isConnected() {
        return ws !== null && ws.readyState === WebSocket.OPEN;
    }

    function getInstanceName() {
        return _getOrCreateInstanceName();
    }

    function sendMessage(msg) {
        _sendMessage(msg);
    }

    function registerHandler(type, fn) {
        handlers[type] = fn;
    }

    // --- Register built-in handler for get_logs_request ---
    // Returns the full capturedLogs buffer to the MCP server on demand.
    registerHandler("get_logs_request", function (msg) {
        _sendMessage({
            type: "get_logs_response",
            id: msg.id,
            entries: capturedLogs.slice()
        });
    });

    // --- Register built-in boot-time handler for reload_request ---
    // Simple fallback: just reload. The AMD module upgrades this to FILE_CLOSE_ALL + reload.
    registerHandler("reload_request", function (msg) {
        _sendMessage({
            type: "reload_response",
            id: msg.id,
            success: true
        });
        setTimeout(function () {
            location.reload();
        }, 100);
    });

    // --- Register built-in handler for exec_js_request ---
    // Evaluates arbitrary JS in the page context and returns the result.
    registerHandler("exec_js_request", function (msg) {
        const AsyncFunction = (async function () {}).constructor;
        const fn = new AsyncFunction(msg.code);
        fn().then(function (result) {
            _sendMessage({
                type: "exec_js_response",
                id: msg.id,
                result: _serializeArg(result)
            });
        }).catch(function (err) {
            _sendMessage({
                type: "exec_js_response",
                id: msg.id,
                error: (err && err.stack) || (err && err.message) || String(err)
            });
        });
    });

    // --- Expose API for AMD module ---
    window._phoenixBuilder = {
        connect: connect,
        disconnect: disconnect,
        isConnected: isConnected,
        getInstanceName: getInstanceName,
        sendMessage: sendMessage,
        registerHandler: registerHandler,
        getLogBuffer: function () { return capturedLogs.slice(); }
    };

    // --- Auto-connect ---
    const wsUrl = localStorage.getItem("phoenixBuilderWsUrl") || DEFAULT_WS_URL;
    connect(wsUrl);
}());
