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
 * Pluggable LSP Client
 *
 * This module provides a reusable LSP (Language Server Protocol) client infrastructure
 * that supports multiple language servers via a serverId-based registry.
 *
 * Browser extensions can start language servers by calling:
 *   execPeer('startServer', { serverId, command, args, rootUri })
 *
 * And communicate with them via:
 *   execPeer('sendRequest', { serverId, method, params })
 *   execPeer('sendNotification', { serverId, method, params })
 *
 * This design allows future language support (Python, Rust, Go, etc.) to be added
 * by simply creating browser-side extensions that configure their respective servers.
 */

const { spawn } = require('child_process');

const CONNECTOR_ID = "ph-lsp";  // Single connector for ALL LSP servers

// Registry of active servers: serverId -> serverState
const servers = new Map();
let nodeConnector = null;
let globalRequestId = 0;

/**
 * Encode a JSON-RPC message with LSP Content-Length header
 * @param {Object} message - The JSON-RPC message object
 * @returns {string} - The encoded message with headers
 */
function encode(message) {
    const content = JSON.stringify(message);
    return `Content-Length: ${Buffer.byteLength(content)}\r\n\r\n${content}`;
}

/**
 * Create a parser for LSP messages from a specific server
 * @param {string} serverId - The server identifier
 * @returns {Function} - Parser function that processes incoming data chunks
 */
function createParser(serverId) {
    let buffer = '';
    return (data) => {
        buffer += data.toString();
        while (true) {
            const headerEnd = buffer.indexOf('\r\n\r\n');
            if (headerEnd === -1) {
                break;
            }

            const header = buffer.slice(0, headerEnd);
            const match = header.match(/Content-Length: (\d+)/);
            if (!match) {
                break;
            }

            const length = parseInt(match[1], 10);
            const start = headerEnd + 4;
            if (buffer.length < start + length) {
                break;
            }

            const json = buffer.slice(start, start + length);
            buffer = buffer.slice(start + length);

            try {
                handleMessage(serverId, JSON.parse(json));
            } catch (e) {
                console.error(`[${serverId}] parse error:`, e);
            }
        }
    };
}

/**
 * Handle an incoming LSP message from a server
 * @param {string} serverId - The server identifier
 * @param {Object} msg - The parsed JSON-RPC message
 */
function handleMessage(serverId, msg) {
    const server = servers.get(serverId);
    if (!server) {
        return;
    }

    if (msg.id !== undefined && server.pending.has(msg.id)) {
        // This is a response to a request we sent
        const { resolve, reject } = server.pending.get(msg.id);
        server.pending.delete(msg.id);
        if (msg.error) {
            reject(msg.error);
        } else {
            resolve(msg.result);
        }
    } else if (msg.method) {
        // This is a notification or request from the server
        nodeConnector.triggerPeer('lspNotification', { serverId, ...msg });
    }
}

/**
 * Ping endpoint to verify the LSP connector is alive
 * @returns {Promise<Object>} - Status and list of active servers
 */
async function ping() {
    const activeServers = Array.from(servers.keys());
    return { status: "pong", activeServers };
}

/**
 * Start a new language server
 * @param {Object} params - Server configuration
 * @param {string} params.serverId - Unique identifier for this server instance
 * @param {string} params.command - The command to spawn the language server
 * @param {string[]} [params.args=['--stdio']] - Arguments for the command
 * @param {string} params.rootUri - The root URI of the workspace
 * @returns {Promise<Object>} - Result with success status and server info
 */
async function startServer(params) {
    const { serverId, command, args = ['--stdio'], rootUri } = params;

    if (!serverId || !command) {
        throw new Error('serverId and command are required');
    }

    if (servers.has(serverId)) {
        return { success: true, message: "already running", serverId };
    }

    const serverProcess = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    const parser = createParser(serverId);

    const serverState = {
        process: serverProcess,
        pending: new Map(),
        rootUri
    };

    serverProcess.stdout.on('data', parser);
    serverProcess.stderr.on('data', (data) => {
        console.log(`[${serverId} stderr]`, data.toString());
    });
    serverProcess.on('exit', (code) => {
        servers.delete(serverId);
        nodeConnector.triggerPeer('serverExit', { serverId, code });
    });
    serverProcess.on('error', (err) => {
        console.error(`[${serverId}] spawn error:`, err);
        servers.delete(serverId);
        nodeConnector.triggerPeer('serverError', { serverId, error: err.message });
    });

    servers.set(serverId, serverState);
    console.log(`[lsp-client] Started ${serverId} (pid: ${serverProcess.pid})`);
    return { success: true, serverId, pid: serverProcess.pid };
}

/**
 * Send an LSP request to a server and wait for response
 * @param {Object} params - Request parameters
 * @param {string} params.serverId - The target server identifier
 * @param {string} params.method - The LSP method name
 * @param {Object} params.params - The LSP request parameters
 * @returns {Promise<Object>} - The LSP response result
 */
async function sendRequest(params) {
    const { serverId, method, params: lspParams } = params;
    const server = servers.get(serverId);

    if (!server) {
        throw new Error(`Server ${serverId} not running`);
    }

    const id = ++globalRequestId;
    const msg = { jsonrpc: '2.0', id, method, params: lspParams };

    return new Promise((resolve, reject) => {
        server.pending.set(id, { resolve, reject });
        server.process.stdin.write(encode(msg));
    });
}

/**
 * Send an LSP notification to a server (no response expected)
 * @param {Object} params - Notification parameters
 * @param {string} params.serverId - The target server identifier
 * @param {string} params.method - The LSP method name
 * @param {Object} params.params - The LSP notification parameters
 * @returns {Promise<Object>} - Success confirmation
 */
async function sendNotification(params) {
    const { serverId, method, params: lspParams } = params;
    const server = servers.get(serverId);

    if (!server) {
        throw new Error(`Server ${serverId} not running`);
    }

    const msg = { jsonrpc: '2.0', method, params: lspParams };
    server.process.stdin.write(encode(msg));
    return { success: true };
}

/**
 * Stop a running language server
 * @param {Object} params - Stop parameters
 * @param {string} params.serverId - The server identifier to stop
 * @returns {Promise<Object>} - Success confirmation
 */
async function stopServer(params) {
    const { serverId } = params;
    const server = servers.get(serverId);

    if (server) {
        server.process.kill();
        servers.delete(serverId);
    }
    return { success: true, serverId };
}

/**
 * List all active language servers
 * @returns {Promise<Array>} - Array of server info objects
 */
async function listServers() {
    return Array.from(servers.entries()).map(([id, state]) => ({
        serverId: id,
        pid: state.process.pid,
        rootUri: state.rootUri
    }));
}

// Create and register the NodeConnector
nodeConnector = global.createNodeConnector(CONNECTOR_ID, {
    ping,
    startServer,
    stopServer,
    sendRequest,
    sendNotification,
    listServers
});

console.log("[lsp-client] Pluggable LSP connector registered");
