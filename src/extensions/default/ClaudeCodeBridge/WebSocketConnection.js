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
 * WebSocketConnection Module
 *
 * Manages WebSocket connections to claudecodeui with:
 * - Automatic reconnection with exponential backoff
 * - Message queuing when disconnected
 * - Request/response correlation via requestId
 */
define(function (require, exports, module) {

    // Reconnection configuration
    const INITIAL_RECONNECT_DELAY = 1000;    // 1 second
    const MAX_RECONNECT_DELAY = 30000;       // 30 seconds
    const RECONNECT_BACKOFF_MULTIPLIER = 2;
    const MAX_QUEUE_SIZE = 100;

    /**
     * WebSocketConnection class
     * @param {string} url - WebSocket server URL
     * @param {Object} options - Configuration options
     * @param {Function} options.onMessage - Callback for received messages
     * @param {Function} options.onConnect - Callback when connected
     * @param {Function} options.onDisconnect - Callback when disconnected
     * @param {Function} options.onError - Callback for errors
     */
    function WebSocketConnection(url, options) {
        this.url = url;
        this.options = options || {};
        this.ws = null;
        this.connected = false;
        this.reconnectDelay = INITIAL_RECONNECT_DELAY;
        this.reconnectTimer = null;
        this.messageQueue = [];
        this.shouldReconnect = true;

        // Start connection
        this.connect();
    }

    /**
     * Connect to the WebSocket server
     */
    WebSocketConnection.prototype.connect = function() {
        if (this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) {
            return;
        }

        console.log("[WebSocketConnection] Connecting to:", this.url);

        try {
            this.ws = new WebSocket(this.url);
            this._setupEventHandlers();
        } catch (error) {
            console.error("[WebSocketConnection] Failed to create WebSocket:", error);
            this._scheduleReconnect();
        }
    };

    /**
     * Set up WebSocket event handlers
     * @private
     */
    WebSocketConnection.prototype._setupEventHandlers = function() {
        var self = this;

        this.ws.onopen = function() {
            console.log("[WebSocketConnection] Connected");
            self.connected = true;
            self.reconnectDelay = INITIAL_RECONNECT_DELAY;

            // Flush queued messages
            self._flushMessageQueue();

            if (self.options.onConnect) {
                self.options.onConnect();
            }
        };

        this.ws.onclose = function(event) {
            console.log("[WebSocketConnection] Disconnected:", event.code, event.reason);
            self.connected = false;

            if (self.options.onDisconnect) {
                self.options.onDisconnect(event);
            }

            if (self.shouldReconnect) {
                self._scheduleReconnect();
            }
        };

        this.ws.onerror = function(error) {
            console.error("[WebSocketConnection] Error:", error);

            if (self.options.onError) {
                self.options.onError(error);
            }
        };

        this.ws.onmessage = function(event) {
            try {
                var message = JSON.parse(event.data);
                if (self.options.onMessage) {
                    self.options.onMessage(message);
                }
            } catch (error) {
                console.error("[WebSocketConnection] Failed to parse message:", error);
            }
        };
    };

    /**
     * Schedule a reconnection attempt
     * @private
     */
    WebSocketConnection.prototype._scheduleReconnect = function() {
        var self = this;

        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
        }

        console.log("[WebSocketConnection] Reconnecting in", this.reconnectDelay, "ms");

        this.reconnectTimer = setTimeout(function() {
            self.reconnectTimer = null;
            self.connect();
        }, this.reconnectDelay);

        // Exponential backoff
        this.reconnectDelay = Math.min(
            this.reconnectDelay * RECONNECT_BACKOFF_MULTIPLIER,
            MAX_RECONNECT_DELAY
        );
    };

    /**
     * Flush queued messages
     * @private
     */
    WebSocketConnection.prototype._flushMessageQueue = function() {
        while (this.messageQueue.length > 0 && this.connected) {
            var message = this.messageQueue.shift();
            this._doSend(message);
        }
    };

    /**
     * Actually send a message
     * @private
     * @param {Object} message - Message to send
     */
    WebSocketConnection.prototype._doSend = function(message) {
        try {
            this.ws.send(JSON.stringify(message));
            return true;
        } catch (error) {
            console.error("[WebSocketConnection] Failed to send message:", error);
            return false;
        }
    };

    /**
     * Send a message to the server
     * If disconnected, queues the message for later delivery
     * @param {Object} message - Message to send
     * @returns {boolean} True if sent immediately, false if queued
     */
    WebSocketConnection.prototype.send = function(message) {
        if (this.connected && this.ws && this.ws.readyState === WebSocket.OPEN) {
            return this._doSend(message);
        }

        // Queue message for later
        if (this.messageQueue.length < MAX_QUEUE_SIZE) {
            this.messageQueue.push(message);
            console.log("[WebSocketConnection] Message queued (queue size:", this.messageQueue.length + ")");
            return false;
        } else {
            console.warn("[WebSocketConnection] Message queue full, dropping message");
            return false;
        }
    };

    /**
     * Check if connected to the server
     * @returns {boolean} Connection status
     */
    WebSocketConnection.prototype.isConnected = function() {
        return this.connected && this.ws && this.ws.readyState === WebSocket.OPEN;
    };

    /**
     * Close the connection
     * @param {boolean} reconnect - Whether to attempt reconnection
     */
    WebSocketConnection.prototype.close = function(reconnect) {
        this.shouldReconnect = reconnect !== false;

        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }

        this.connected = false;
    };

    /**
     * Get the number of queued messages
     * @returns {number} Queue size
     */
    WebSocketConnection.prototype.getQueueSize = function() {
        return this.messageQueue.length;
    };

    /**
     * Clear the message queue
     */
    WebSocketConnection.prototype.clearQueue = function() {
        this.messageQueue = [];
    };

    // Export the WebSocketConnection class
    module.exports = WebSocketConnection;
});
