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
 * Pluggable LSP Client Infrastructure
 *
 * This module provides a reusable Language Server Protocol (LSP) client that supports
 * multiple language servers simultaneously via a serverId-based registry. It handles
 * all the complexity of LSP communication so browser extensions only need to configure
 * their language server and make high-level API calls.
 *
 * ## Architecture Overview
 *
 * ```
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │                           BROWSER (Phoenix Editor)                          │
 * │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐              │
 * │  │ TypeScript Ext  │  │   Python Ext    │  │    Rust Ext     │  ...         │
 * │  │ (main.js)       │  │   (main.js)     │  │   (main.js)     │              │
 * │  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘              │
 * │           │                    │                    │                       │
 * │           └────────────────────┼────────────────────┘                       │
 * │                                │                                            │
 * │                    ┌───────────▼───────────┐                                │
 * │                    │    NodeConnector      │                                │
 * │                    │    (ph-lsp)           │                                │
 * │                    └───────────┬───────────┘                                │
 * └────────────────────────────────┼────────────────────────────────────────────┘
 *                                  │ WebSocket
 * ┌────────────────────────────────┼────────────────────────────────────────────┐
 * │                           NODE.JS                                           │
 * │                    ┌───────────▼───────────┐                                │
 * │                    │    lsp-client.js      │                                │
 * │                    │    (this module)      │                                │
 * │                    └───────────┬───────────┘                                │
 * │                                │                                            │
 * │              ┌─────────────────┼─────────────────┐                          │
 * │              │                 │                 │                          │
 * │      ┌───────▼───────┐ ┌───────▼───────┐ ┌───────▼───────┐                  │
 * │      │    vtsls      │ │    pylsp      │ │  rust-analyzer│  ...             │
 * │      │ (TypeScript)  │ │   (Python)    │ │    (Rust)     │                  │
 * │      └───────────────┘ └───────────────┘ └───────────────┘                  │
 * │           stdio            stdio             stdio                          │
 * └─────────────────────────────────────────────────────────────────────────────┘
 * ```
 *
 * ## Server Lifecycle
 *
 * 1. **START** - Browser extension calls `startServer({ serverId, command, args, rootUri })`
 *    - lsp-client spawns the LSP server process with stdio pipes
 *    - Server is registered in the `servers` Map by serverId
 *    - Returns { success: true, serverId, pid }
 *
 * 2. **INITIALIZE** - Browser extension sends LSP initialize request
 *    - `sendRequest({ serverId, method: 'initialize', params: {...} })`
 *    - Server responds with capabilities
 *    - Extension sends `initialized` notification
 *
 * 3. **DOCUMENT SYNC** - Browser extension notifies server of document changes
 *    - `textDocument/didOpen` - When a file is opened
 *    - `textDocument/didChange` - When content changes
 *    - `textDocument/didClose` - When file is closed
 *
 * 4. **LANGUAGE FEATURES** - Browser extension requests completions, diagnostics, etc.
 *    - `textDocument/completion` - Code completions
 *    - `textDocument/hover` - Hover information
 *    - `textDocument/definition` - Go to definition
 *    - etc.
 *
 * 5. **SHUTDOWN** - Browser extension gracefully stops the server
 *    - `sendRequest({ serverId, method: 'shutdown' })`
 *    - `sendNotification({ serverId, method: 'exit' })`
 *    - `stopServer({ serverId })`
 *
 * ## API Reference
 *
 * ### From Browser Extensions (via NodeConnector)
 *
 * ```javascript
 * const lspConnector = NodeConnector.createNodeConnector("ph-lsp", {});
 *
 * // Start a language server
 * await lspConnector.execPeer('startServer', {
 *     serverId: 'python',           // Unique ID for this server
 *     command: 'pylsp',             // LSP server binary
 *     args: ['--stdio'],            // Arguments (default: ['--stdio'])
 *     rootUri: 'file:///path/to/project'
 * });
 *
 * // Send request (waits for response)
 * const result = await lspConnector.execPeer('sendRequest', {
 *     serverId: 'python',
 *     method: 'textDocument/completion',
 *     params: { textDocument: { uri }, position: { line, character } }
 * });
 *
 * // Send notification (fire-and-forget)
 * await lspConnector.execPeer('sendNotification', {
 *     serverId: 'python',
 *     method: 'textDocument/didOpen',
 *     params: { textDocument: { uri, languageId, version, text } }
 * });
 *
 * // Stop a server
 * await lspConnector.execPeer('stopServer', { serverId: 'python' });
 *
 * // List all active servers
 * const servers = await lspConnector.execPeer('listServers', {});
 *
 * // Health check
 * const status = await lspConnector.execPeer('ping', {});
 * ```
 *
 * ### Events (from Node to Browser)
 *
 * ```javascript
 * // Server notifications (diagnostics, etc.)
 * lspConnector.on('lspNotification', (event, data) => {
 *     // data: { serverId, method, params }
 *     if (data.method === 'textDocument/publishDiagnostics') {
 *         handleDiagnostics(data.params);
 *     }
 * });
 *
 * // Server exit
 * lspConnector.on('serverExit', (event, data) => {
 *     // data: { serverId, code }
 * });
 *
 * // Server error
 * lspConnector.on('serverError', (event, data) => {
 *     // data: { serverId, error }
 * });
 * ```
 *
 * ## Adding a New Language
 *
 * To add support for a new language (e.g., Python):
 *
 * 1. **Add LSP server to src-node/package.json:**
 *    ```json
 *    "dependencies": {
 *        "python-lsp-server": "^1.x.x"
 *    }
 *    ```
 *
 * 2. **Create browser extension** at `src/extensions/default/PythonSupport/main.js`:
 *    ```javascript
 *    define(function (require, exports, module) {
 *        const NodeConnector = brackets.getModule("NodeConnector");
 *        const CodeHintManager = brackets.getModule("editor/CodeHintManager");
 *
 *        const SERVER_ID = "python";
 *        let lspConnector = null;
 *
 *        async function initialize() {
 *            lspConnector = NodeConnector.createNodeConnector("ph-lsp", {});
 *
 *            await lspConnector.execPeer('startServer', {
 *                serverId: SERVER_ID,
 *                command: 'pylsp',
 *                rootUri: getProjectRoot()
 *            });
 *
 *            await lspConnector.execPeer('sendRequest', {
 *                serverId: SERVER_ID,
 *                method: 'initialize',
 *                params: { processId: null, rootUri, capabilities: {} }
 *            });
 *
 *            await lspConnector.execPeer('sendNotification', {
 *                serverId: SERVER_ID,
 *                method: 'initialized',
 *                params: {}
 *            });
 *
 *            // Register code hint provider, etc.
 *        }
 *    });
 *    ```
 *
 * 3. **Register extension** in `src/extensions/default/DefaultExtensions.json`
 *
 * ## Server Resolution
 *
 * When starting a server, lsp-client looks for the command in this order:
 * 1. `src-node/node_modules/.bin/{command}` - Bundled with Phoenix
 * 2. System PATH - Globally installed
 *
 * This allows Phoenix to ship with built-in language servers while also
 * supporting user-installed servers.
 *
 * ## Protocol Details
 *
 * - Uses JSON-RPC 2.0 over stdio
 * - Messages are framed with `Content-Length` headers (LSP standard)
 * - Request timeout: 2 minutes (configurable via LSP_REQUEST_TIMEOUT)
 * - Multiple servers can run simultaneously with different serverIds
 */

// Create connector at module load time (like Git does)
const nodeConnector = global.createNodeConnector("ph-lsp", exports);

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Get the path to node_modules/.bin for bundled LSP servers
const NODE_MODULES_BIN = path.join(__dirname, 'node_modules', '.bin');

// Registry of active servers: serverId -> serverState
const servers = new Map();
let globalRequestId = 0;

// Timeout for LSP requests (2 minutes)
const LSP_REQUEST_TIMEOUT = 120000;

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
 * Uses Buffer operations for correct byte-length handling (Content-Length is in bytes)
 * @param {string} serverId - The server identifier
 * @returns {Function} - Parser function that processes incoming data chunks
 */
function createParser(serverId) {
    let buffer = Buffer.alloc(0);
    const HEADER_DELIMITER = Buffer.from('\r\n\r\n');

    return (data) => {
        // Append incoming data to buffer
        buffer = Buffer.concat([buffer, data]);

        while (true) {
            // Find header delimiter
            const headerEnd = buffer.indexOf(HEADER_DELIMITER);
            if (headerEnd === -1) {
                break;
            }

            // Parse Content-Length from header
            const header = buffer.slice(0, headerEnd).toString('utf8');
            const match = header.match(/Content-Length: (\d+)/i);
            if (!match) {
                // Invalid header, skip this byte and continue
                buffer = buffer.slice(1);
                continue;
            }

            const contentLength = parseInt(match[1], 10);
            const contentStart = headerEnd + 4; // After \r\n\r\n

            // Check if we have the full message
            if (buffer.length < contentStart + contentLength) {
                break; // Wait for more data
            }

            // Extract the JSON content
            const jsonBuffer = buffer.slice(contentStart, contentStart + contentLength);
            const json = jsonBuffer.toString('utf8');

            // Remove processed message from buffer
            buffer = buffer.slice(contentStart + contentLength);

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
exports.ping = async function ping() {
    console.error("[lsp-client] ping() called");
    const activeServers = Array.from(servers.keys());
    console.error("[lsp-client] ping() returning:", { status: "pong", activeServers });
    return { status: "pong", activeServers };
};

/**
 * Start a new language server
 * @param {Object} params - Server configuration
 * @param {string} params.serverId - Unique identifier for this server instance
 * @param {string} params.command - The command to spawn the language server
 * @param {string[]} [params.args=['--stdio']] - Arguments for the command
 * @param {string} params.rootUri - The root URI of the workspace
 * @returns {Promise<Object>} - Result with success status and server info
 */
exports.startServer = async function startServer(params) {
    const { serverId, command, args = ['--stdio'], rootUri } = params;

    if (!serverId || !command) {
        throw new Error('serverId and command are required');
    }

    if (servers.has(serverId)) {
        return { success: true, message: "already running", serverId };
    }

    // Check if command exists in local node_modules/.bin first
    let commandPath = command;
    const localBinPath = path.join(NODE_MODULES_BIN, command);
    console.error(`[lsp-client] Checking for bundled server at: ${localBinPath}`);
    if (fs.existsSync(localBinPath)) {
        commandPath = localBinPath;
        console.error(`[lsp-client] Using bundled ${command} from node_modules`);
    } else {
        console.error(`[lsp-client] Using system ${command}`);
    }

    return new Promise((resolve, reject) => {
        console.error(`[lsp-client] Spawning: ${commandPath} ${args.join(' ')}`);
        const serverProcess = spawn(commandPath, args, { stdio: ['pipe', 'pipe', 'pipe'] });
        const parser = createParser(serverId);

        const serverState = {
            process: serverProcess,
            pending: new Map(),
            rootUri
        };

        let hasResolved = false;

        serverProcess.stdout.on('data', parser);
        serverProcess.stderr.on('data', (data) => {
            console.error(`[${serverId} stderr]`, data.toString());
        });

        serverProcess.on('spawn', () => {
            // Process spawned successfully
            servers.set(serverId, serverState);
            console.error(`[lsp-client] Started ${serverId} (pid: ${serverProcess.pid})`);
            hasResolved = true;
            resolve({ success: true, serverId, pid: serverProcess.pid });
        });

        serverProcess.on('exit', (code) => {
            servers.delete(serverId);
            nodeConnector.triggerPeer('serverExit', { serverId, code });
            if (!hasResolved) {
                hasResolved = true;
                reject(new Error(`Server ${serverId} exited immediately with code ${code}`));
            }
        });

        serverProcess.on('error', (err) => {
            console.error(`[${serverId}] spawn error:`, err);
            servers.delete(serverId);
            nodeConnector.triggerPeer('serverError', { serverId, error: err.message });
            if (!hasResolved) {
                hasResolved = true;
                reject(new Error(`Failed to spawn ${serverId}: ${err.message}`));
            }
        });

        // Timeout in case spawn event never fires
        setTimeout(() => {
            if (!hasResolved) {
                hasResolved = true;
                reject(new Error(`Timeout waiting for ${serverId} to start`));
            }
        }, 10000);
    });
};

/**
 * Send an LSP request to a server and wait for response
 * @param {Object} params - Request parameters
 * @param {string} params.serverId - The target server identifier
 * @param {string} params.method - The LSP method name
 * @param {Object} params.params - The LSP request parameters
 * @returns {Promise<Object>} - The LSP response result
 */
exports.sendRequest = async function sendRequest(params) {
    const { serverId, method, params: lspParams } = params;
    const server = servers.get(serverId);

    if (!server) {
        throw new Error(`Server ${serverId} not running`);
    }

    const id = ++globalRequestId;
    const msg = { jsonrpc: '2.0', id, method, params: lspParams };

    return new Promise((resolve, reject) => {
        // Set up timeout to prevent hanging requests
        const timeoutId = setTimeout(() => {
            if (server.pending.has(id)) {
                server.pending.delete(id);
                reject(new Error(`Request ${method} timed out after ${LSP_REQUEST_TIMEOUT}ms`));
            }
        }, LSP_REQUEST_TIMEOUT);

        server.pending.set(id, {
            resolve: (result) => {
                clearTimeout(timeoutId);
                resolve(result);
            },
            reject: (error) => {
                clearTimeout(timeoutId);
                reject(error);
            }
        });

        server.process.stdin.write(encode(msg));
    });
};

/**
 * Send an LSP notification to a server (no response expected)
 * @param {Object} params - Notification parameters
 * @param {string} params.serverId - The target server identifier
 * @param {string} params.method - The LSP method name
 * @param {Object} params.params - The LSP notification parameters
 * @returns {Promise<Object>} - Success confirmation
 */
exports.sendNotification = async function sendNotification(params) {
    const { serverId, method, params: lspParams } = params;
    const server = servers.get(serverId);

    if (!server) {
        throw new Error(`Server ${serverId} not running`);
    }

    const msg = { jsonrpc: '2.0', method, params: lspParams };
    server.process.stdin.write(encode(msg));
    return { success: true };
};

/**
 * Stop a running language server
 * @param {Object} params - Stop parameters
 * @param {string} params.serverId - The server identifier to stop
 * @returns {Promise<Object>} - Success confirmation
 */
exports.stopServer = async function stopServer(params) {
    const { serverId } = params;
    const server = servers.get(serverId);

    if (server) {
        server.process.kill();
        servers.delete(serverId);
    }
    return { success: true, serverId };
};

/**
 * List all active language servers
 * @returns {Promise<Array>} - Array of server info objects
 */
exports.listServers = async function listServers() {
    return Array.from(servers.entries()).map(([id, state]) => ({
        serverId: id,
        pid: state.process.pid,
        rootUri: state.rootUri
    }));
};

console.error("[lsp-client] Pluggable LSP connector registered");
