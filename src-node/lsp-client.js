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
 * Pluggable LSP Client Infrastructure (Node side)
 *
 * Provides a reusable Language Server Protocol (LSP) client that supports multiple
 * language servers simultaneously via a serverId-based registry. Browser extensions only
 * configure their language server and make high-level calls; this module owns the process
 * spawning and JSON-RPC framing.
 *
 * ```
 *  BROWSER (Phoenix)                          NODE (this module)
 *  TypeScript/Python/Rust   ─NodeConnector──▶ lsp-client.js ──stdio──▶ vtsls / pylsp / rust-analyzer
 *  extensions ("ph-lsp")                       (spawn + JSON-RPC, Content-Length framing)
 * ```
 *
 * API (called from the browser via `lspConnector.execPeer(<fn>, params)`):
 *   - startServer({ serverId, command, args=['--stdio'], rootUri }) -> { success, serverId, pid }
 *   - sendRequest({ serverId, method, params })  -> LSP result (awaits response)
 *   - sendNotification({ serverId, method, params }) -> { success }   (fire and forget)
 *   - stopServer({ serverId }) -> { success, serverId }
 *   - listServers() -> [{ serverId, pid, rootUri }]
 *   - ping() -> { status: "pong", activeServers }
 *
 * Events emitted to the browser (`lspConnector.on(<event>, ...)`):
 *   - 'lspNotification' { serverId, method, params }  (e.g. textDocument/publishDiagnostics)
 *   - 'serverExit'      { serverId, code }
 *   - 'serverError'     { serverId, error }
 *
 * Server resolution order when starting: `src-node/node_modules/.bin/<command>` (bundled),
 * then the system PATH. Messages use JSON-RPC 2.0 over stdio with Content-Length headers.
 */

// Create connector at module load time (same pattern as src-node/git/cli.js)
const nodeConnector = global.createNodeConnector("ph-lsp", exports);

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Path to node_modules/.bin for bundled LSP servers
const NODE_MODULES_BIN = path.join(__dirname, 'node_modules', '.bin');

// Registry of active servers: serverId -> serverState
const servers = new Map();
let globalRequestId = 0;

// Timeout for LSP requests (2 minutes)
const LSP_REQUEST_TIMEOUT = 120000;

/**
 * Encode a JSON-RPC message with an LSP Content-Length header.
 * @param {Object} message - The JSON-RPC message object
 * @returns {string} The encoded message with headers
 */
function encode(message) {
    const content = JSON.stringify(message);
    return `Content-Length: ${Buffer.byteLength(content)}\r\n\r\n${content}`;
}

/**
 * Create a stream parser for LSP messages from a specific server.
 * Uses Buffer operations because Content-Length is measured in bytes.
 * @param {string} serverId - The server identifier
 * @returns {Function} Parser function that processes incoming data chunks
 */
function createParser(serverId) {
    let buffer = Buffer.alloc(0);
    const HEADER_DELIMITER = Buffer.from('\r\n\r\n');

    return (data) => {
        buffer = Buffer.concat([buffer, data]);

        while (true) {
            const headerEnd = buffer.indexOf(HEADER_DELIMITER);
            if (headerEnd === -1) {
                break;
            }

            const header = buffer.slice(0, headerEnd).toString('utf8');
            const match = header.match(/Content-Length: (\d+)/i);
            if (!match) {
                // Invalid header - skip a byte and resync.
                buffer = buffer.slice(1);
                continue;
            }

            const contentLength = parseInt(match[1], 10);
            const contentStart = headerEnd + HEADER_DELIMITER.length;

            if (buffer.length < contentStart + contentLength) {
                break; // Wait for more data.
            }

            const json = buffer.slice(contentStart, contentStart + contentLength).toString('utf8');
            buffer = buffer.slice(contentStart + contentLength);

            try {
                handleMessage(serverId, JSON.parse(json));
            } catch (e) {
                console.error(`[lsp-client][${serverId}] parse error:`, e.message);
            }
        }
    };
}

/**
 * Handle a single incoming LSP message from a server.
 * @param {string} serverId - The server identifier
 * @param {Object} msg - The parsed JSON-RPC message
 */
function handleMessage(serverId, msg) {
    const server = servers.get(serverId);
    if (!server) {
        return;
    }

    if (msg.id !== undefined && server.pending.has(msg.id)) {
        // Response to a request we sent.
        const { resolve, reject } = server.pending.get(msg.id);
        server.pending.delete(msg.id);
        if (msg.error) {
            reject(msg.error);
        } else {
            resolve(msg.result);
        }
    } else if (msg.method && msg.id !== undefined) {
        // Server-initiated REQUEST: answer it right here so the server never awaits a reply
        // forever (the browser side has no response path; an unanswered request can stall the
        // server's own processing - e.g. vscode-json-language-server pulling configuration).
        _respondToServerRequest(serverId, server, msg);
    } else if (msg.method) {
        // Notification - forward to the browser (e.g. textDocument/publishDiagnostics).
        nodeConnector.triggerPeer('lspNotification', { serverId, ...msg });
    }
}

/**
 * Resolve a workspace/configuration item's dotted section (e.g. "python" or "python.pyrefly")
 * inside a server's registered workspaceConfiguration object. Returns null when any path
 * segment is missing - the spec's "no config" answer.
 * @param {?Object} config - the server's workspaceConfiguration (may be undefined)
 * @param {?string} section - the requested section; no section means the whole object
 * @return {*}
 */
function _lookupConfigSection(config, section) {
    if (!config) {
        return null;
    }
    if (!section) {
        return config;
    }
    let value = config;
    for (const part of section.split('.')) {
        if (value === null || typeof value !== 'object' || !(part in value)) {
            return null;
        }
        value = value[part];
    }
    return value;
}

/**
 * Answer a server-initiated request with a benign, spec-shaped reply. We advertise minimal client
 * capabilities (no dynamic registration, workspace.configuration=false), so servers should rarely
 * send these - this is the safety net that guarantees no server hangs awaiting a reply.
 * Servers that pull configuration regardless (e.g. pyrefly) get the workspaceConfiguration
 * object registered at startServer; anything else gets the spec's null "no config".
 * @param {string} serverId - The server identifier (for logging)
 * @param {Object} server - The server state object
 * @param {Object} msg - The incoming JSON-RPC request (method + id)
 */
function _respondToServerRequest(serverId, server, msg) {
    let response;
    switch (msg.method) {
    case 'workspace/configuration':
        // Result must be an array matching params.items length; null entries mean "no config".
        response = {
            jsonrpc: '2.0', id: msg.id,
            result: ((msg.params && msg.params.items) || []).map(
                item => _lookupConfigSection(server.workspaceConfiguration, item && item.section))
        };
        break;
    case 'client/registerCapability':
    case 'client/unregisterCapability':
    case 'window/workDoneProgress/create':
    case 'window/showMessageRequest':
        response = { jsonrpc: '2.0', id: msg.id, result: null };
        break;
    default:
        response = {
            jsonrpc: '2.0', id: msg.id,
            error: { code: -32601, message: `Method not handled by Phoenix LSP client: ${msg.method}` }
        };
    }
    try {
        server.process.stdin.write(encode(response));
    } catch (e) {
        console.error(`[lsp-client][${serverId}] failed to answer ${msg.method}:`, e.message);
    }
}

/**
 * Ping endpoint to verify the LSP connector is alive.
 * @returns {Promise<Object>} Status and list of active servers
 */
exports.ping = async function ping() {
    return { status: "pong", activeServers: Array.from(servers.keys()) };
};

/**
 * Start a new language server.
 * @param {Object} params - Server configuration
 * @param {string} params.serverId - Unique identifier for this server instance
 * @param {string} params.command - Command used to spawn the language server
 * @param {string[]} [params.args=['--stdio']] - Arguments for the command
 * @param {string} params.rootUri - Root URI of the workspace
 * @param {Object} [params.workspaceConfiguration] - settings tree served to the server's
 *        workspace/configuration pulls (sections resolved by dotted path); pulls answer null
 *        without it
 * @returns {Promise<Object>} Result with success status and server info
 */
exports.startServer = async function startServer(params) {
    const { serverId, command, args = ['--stdio'], rootUri, workspaceConfiguration } = params;

    if (!serverId || !command) {
        throw new Error('serverId and command are required');
    }

    if (servers.has(serverId)) {
        return { success: true, message: "already running", serverId };
    }

    // Command resolution, in order:
    // 1. An absolute path to a .js entry (e.g. a user-installed server like intelephense living
    //    outside src-node) runs on our own node runtime - process.execPath is phnode itself, the
    //    same spawn-self pattern _npmInstallInFolder and the ESLint service use. This sidesteps
    //    node_modules/.bin shims entirely (they are sh scripts / .cmd on Windows).
    // 2. A server bundled in src-node/node_modules/.bin.
    // 3. Fall back to spawning the command as given - which also covers an absolute path to a
    //    native binary (e.g. a user-installed server like pyrefly), spawned as-is, or a PATH
    //    lookup for a bare command name.
    let commandPath = command;
    let spawnArgs = args;
    if (path.isAbsolute(command) && command.endsWith('.js')) {
        spawnArgs = [command, ...args];
        commandPath = process.execPath;
    } else {
        const localBinPath = path.join(NODE_MODULES_BIN, command);
        if (fs.existsSync(localBinPath)) {
            commandPath = localBinPath;
        }
    }

    return new Promise((resolve, reject) => {
        const serverProcess = spawn(commandPath, spawnArgs, { stdio: ['pipe', 'pipe', 'pipe'] });
        const parser = createParser(serverId);

        const serverState = {
            process: serverProcess,
            pending: new Map(),
            rootUri,
            workspaceConfiguration,
            stderrTail: [] // keep the last few stderr lines to attach to crash reports
        };

        let hasResolved = false;

        serverProcess.stdout.on('data', parser);
        serverProcess.stderr.on('data', (data) => {
            const text = data.toString();
            serverState.stderrTail.push(text);
            if (serverState.stderrTail.length > 50) {
                serverState.stderrTail.shift();
            }
            console.error(`[lsp-client][${serverId} stderr]`, text.trimEnd());
        });

        serverProcess.on('spawn', () => {
            servers.set(serverId, serverState);
            hasResolved = true;
            resolve({ success: true, serverId, pid: serverProcess.pid });
        });

        serverProcess.on('exit', (code, signal) => {
            servers.delete(serverId);
            const stderr = serverState.stderrTail.join('');
            if (code) {
                console.error(`[lsp-client][${serverId}] exited code=${code} signal=${signal || 'none'}`);
            }
            // Fail every in-flight request immediately - the dead process can never answer them, and
            // leaving them pending stalls callers until the per-request timeout (2 minutes).
            for (const { reject: rejectPending } of serverState.pending.values()) {
                rejectPending(new Error(`Server ${serverId} exited with pending request`));
            }
            serverState.pending.clear();
            nodeConnector.triggerPeer('serverExit', { serverId, code, signal, stderr });
            if (!hasResolved) {
                hasResolved = true;
                reject(new Error(`Server ${serverId} exited immediately with code ${code}` +
                    (stderr ? `\n${stderr}` : '')));
            }
        });

        serverProcess.on('error', (err) => {
            console.error(`[lsp-client][${serverId}] spawn error:`, err.message);
            servers.delete(serverId);
            nodeConnector.triggerPeer('serverError', { serverId, error: err.message });
            if (!hasResolved) {
                hasResolved = true;
                reject(new Error(`Failed to spawn ${serverId}: ${err.message}`));
            }
        });

        // Guard in case the 'spawn' event never fires.
        setTimeout(() => {
            if (!hasResolved) {
                hasResolved = true;
                reject(new Error(`Timeout waiting for ${serverId} to start`));
            }
        }, 10000);
    });
};

/**
 * Send an LSP request to a server and wait for the response.
 * @param {Object} params - Request parameters
 * @param {string} params.serverId - Target server identifier
 * @param {string} params.method - LSP method name
 * @param {Object} params.params - LSP request parameters
 * @returns {Promise<Object>} The LSP response result
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
 * Send an LSP notification to a server (no response expected).
 * @param {Object} params - Notification parameters
 * @param {string} params.serverId - Target server identifier
 * @param {string} params.method - LSP method name
 * @param {Object} params.params - LSP notification parameters
 * @returns {Promise<Object>} Success confirmation
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
 * Stop a running language server.
 * @param {Object} params - Stop parameters
 * @param {string} params.serverId - Server identifier to stop
 * @returns {Promise<Object>} Success confirmation
 */
exports.stopServer = async function stopServer(params) {
    const { serverId } = params;
    const server = servers.get(serverId);

    if (server) {
        // Reject any in-flight requests so browser-side promises do not hang.
        for (const { reject } of server.pending.values()) {
            reject(new Error(`Server ${serverId} stopped`));
        }
        server.pending.clear();
        server.process.kill();
        servers.delete(serverId);
    }
    return { success: true, serverId };
};

/**
 * List all active language servers.
 * @returns {Promise<Array>} Array of server info objects
 */
exports.listServers = async function listServers() {
    return Array.from(servers.entries()).map(([id, state]) => ({
        serverId: id,
        pid: state.process.pid,
        rootUri: state.rootUri
    }));
};
