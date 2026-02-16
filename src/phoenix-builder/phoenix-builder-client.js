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

/*globals Phoenix*/

define(function (require, exports, module) {

    const CommandManager = require("command/CommandManager");
    const Commands = require("command/Commands");

    const LOG_TO_CONSOLE_KEY = "logToConsole";
    const INSTANCE_NAME_KEY = "phoenixBuilderInstanceName";
    const FLUSH_INTERVAL = 500;
    const FLUSH_THRESHOLD = 50;
    const MAX_MESSAGE_LENGTH = 2000;
    const RECONNECT_BASE_MS = 500;
    const RECONNECT_MAX_MS = 5000;

    let ws = null;
    let logBuffer = [];
    let flushTimer = null;
    let reconnectTimer = null;
    let reconnectDelay = RECONNECT_BASE_MS;
    let currentUrl = null;
    let autoReconnect = true;
    let originalConsoleLog, originalConsoleInfo, originalConsoleWarn, originalConsoleError;
    let consoleHooked = false;
    let errorListenerAdded = false;

    function _getPlatformTag() {
        if (window.__TAURI__) {
            return "tauri";
        }
        if (window.__ELECTRON__) {
            return "electron";
        }
        var desktop = Phoenix.browser && Phoenix.browser.desktop;
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
        var name = sessionStorage.getItem(INSTANCE_NAME_KEY);
        if (!name) {
            var hex = Math.floor(Math.random() * 0x10000).toString(16).padStart(4, "0");
            name = "phoenix-" + _getPlatformTag() + "-" + hex;
            sessionStorage.setItem(INSTANCE_NAME_KEY, name);
        }
        return name;
    }

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
            const json = JSON.stringify(arg, (key, value) => {
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

    function _pushLogEntry(level, args) {
        const message = Array.from(args).map(_serializeArg).join(" ");
        logBuffer.push({
            level: level,
            message: message,
            timestamp: new Date().toISOString()
        });
        if (logBuffer.length >= FLUSH_THRESHOLD) {
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

    function _hookConsole() {
        if (consoleHooked) { return; }

        originalConsoleLog = console.log;
        originalConsoleInfo = console.info;
        originalConsoleWarn = console.warn;
        originalConsoleError = console.error;

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

        consoleHooked = true;
    }

    function _unhookConsole() {
        if (!consoleHooked) { return; }

        console.log = originalConsoleLog;
        console.info = originalConsoleInfo;
        console.warn = originalConsoleWarn;
        console.error = originalConsoleError;

        consoleHooked = false;
    }

    function _addErrorListeners() {
        if (errorListenerAdded) { return; }

        window.addEventListener("error", function (event) {
            _pushLogEntry("error", ["[Uncaught Error] " + (event.message || "") +
                (event.filename ? " at " + event.filename + ":" + event.lineno : "")]);
        });

        window.addEventListener("unhandledrejection", function (event) {
            const reason = event.reason;
            const msg = reason instanceof Error ? (reason.stack || reason.message) : String(reason);
            _pushLogEntry("error", ["[Unhandled Promise Rejection] " + msg]);
        });

        errorListenerAdded = true;
    }

    function _enableDebugLogging() {
        localStorage.setItem(LOG_TO_CONSOLE_KEY, "true");
        if (window.setupLogging) {
            window.setupLogging();
        }
    }

    function _handleScreenshotRequest(msg) {
        if (!Phoenix || !Phoenix.app || !Phoenix.app.screenShotBinary) {
            _sendMessage({
                type: "error",
                id: msg.id,
                message: "Screenshot API not available"
            });
            return;
        }

        Phoenix.app.screenShotBinary(msg.selector || undefined)
            .then(function (bytes) {
                // Convert Uint8Array to base64 in chunks to avoid call stack limits
                let binary = "";
                const chunkSize = 8192;
                for (let i = 0; i < bytes.length; i += chunkSize) {
                    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
                    binary += String.fromCharCode.apply(null, chunk);
                }
                const base64 = btoa(binary);
                _sendMessage({
                    type: "screenshot_response",
                    id: msg.id,
                    data: base64
                });
            })
            .catch(function (err) {
                _sendMessage({
                    type: "error",
                    id: msg.id,
                    message: err.message || "Screenshot failed"
                });
            });
    }

    function _handleReloadRequest(msg) {
        var closeArgs = msg.forceClose ? { _forceClose: true } : undefined;
        CommandManager.execute(Commands.FILE_CLOSE_ALL, closeArgs)
            .done(function () {
                _sendMessage({
                    type: "reload_response",
                    id: msg.id,
                    success: true
                });
                // Give the response a moment to send before reloading
                setTimeout(function () {
                    location.reload();
                }, 100);
            })
            .fail(function (err) {
                _sendMessage({
                    type: "reload_response",
                    id: msg.id,
                    success: false,
                    message: (err && err.message) || "Close cancelled by user"
                });
            });
    }

    function _sendMessage(msg) {
        if (ws && ws.readyState === WebSocket.OPEN) {
            try {
                ws.send(JSON.stringify(msg));
            } catch (e) {
                // ignore
            }
        }
    }

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

            _enableDebugLogging();
            _hookConsole();
            _addErrorListeners();

            flushTimer = setInterval(_flushLogs, FLUSH_INTERVAL);
        };

        ws.onmessage = function (event) {
            let msg;
            try {
                msg = JSON.parse(event.data);
            } catch (e) {
                return;
            }

            switch (msg.type) {
                case "screenshot_request":
                    _handleScreenshotRequest(msg);
                    break;
                case "reload_request":
                    _handleReloadRequest(msg);
                    break;
                case "ping":
                    _sendMessage({ type: "pong" });
                    break;
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

    function _cleanup() {
        if (flushTimer) {
            clearInterval(flushTimer);
            flushTimer = null;
        }
        _unhookConsole();
        ws = null;
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

    exports.connect = connect;
    exports.disconnect = disconnect;
    exports.isConnected = isConnected;
    exports.getInstanceName = getInstanceName;
});
