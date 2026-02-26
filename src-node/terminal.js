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

const pty = require("node-pty");
const os = require("os");
const path = require("path");
const which = require("which");
const {execFile} = require("child_process");
const NodeConnector = require("./node-connector");

const CONNECTOR_ID = "phoenix_terminal";
const nodeConnector = NodeConnector.createNodeConnector(CONNECTOR_ID, exports);

// Active terminal instances: id -> { pty, buffer, flushTimer, paused }
const terminals = {};

// Flow control config: rate-limit data sent to browser, discard excess on overflow.
// This keeps the UI responsive even under extreme output (e.g. `yes | head -n 500000`).
const FLUSH_INTERVAL = 16;          // ms - max one send per interval
const MAX_CHUNK_SIZE = 16384;       // 16KB - max bytes sent per flush
const BUFFER_PAUSE_THRESHOLD = 65536;   // 64KB - pause PTY when buffer exceeds this
const BUFFER_RESUME_THRESHOLD = 16384;  // 16KB - resume PTY when buffer drains below this
const BUFFER_TRUNCATE_THRESHOLD = 524288; // 512KB - discard oldest data if buffer exceeds this

function _scheduleFlush(id) {
    const term = terminals[id];
    if (!term || term.flushTimer) {
        return;
    }
    term.flushTimer = setTimeout(() => {
        term.flushTimer = null;
        _flushBuffer(id);
    }, FLUSH_INTERVAL);
}

function _flushBuffer(id) {
    const term = terminals[id];
    if (!term || !term.buffer.length) {
        return;
    }

    // If buffer is way too large, discard oldest data (keep tail)
    if (term.buffer.length > BUFFER_TRUNCATE_THRESHOLD) {
        term.buffer = term.buffer.slice(-MAX_CHUNK_SIZE);
    }

    // Send at most MAX_CHUNK_SIZE bytes
    let data;
    if (term.buffer.length <= MAX_CHUNK_SIZE) {
        data = term.buffer;
        term.buffer = "";
    } else {
        data = term.buffer.slice(0, MAX_CHUNK_SIZE);
        term.buffer = term.buffer.slice(MAX_CHUNK_SIZE);
    }

    nodeConnector.triggerPeer("terminalData", {id, data});

    // Resume PTY if buffer drained enough
    if (term.paused && term.buffer.length < BUFFER_RESUME_THRESHOLD) {
        term.paused = false;
        try { term.pty.resume(); } catch (e) { /* ignore */ }
    }

    // Schedule next flush if buffer still has data
    if (term.buffer.length > 0) {
        _scheduleFlush(id);
    }
}

function _appendBuffer(id, data) {
    const term = terminals[id];
    if (!term) {
        return;
    }
    term.buffer += data;

    // Pause PTY if buffer is growing too large
    if (!term.paused && term.buffer.length >= BUFFER_PAUSE_THRESHOLD) {
        term.paused = true;
        try { term.pty.pause(); } catch (e) { /* ignore */ }
    }

    // Schedule a flush (no-op if already scheduled)
    _scheduleFlush(id);
}

/**
 * Spawn a new PTY process
 * @param {Object} params
 * @param {string} params.id - Unique terminal ID
 * @param {string} params.shell - Shell executable path
 * @param {string[]} params.args - Shell arguments
 * @param {string} params.cwd - Working directory
 * @param {number} params.cols - Column count
 * @param {number} params.rows - Row count
 * @param {Object} params.env - Additional environment variables
 * @returns {{id: string, pid: number, shell: string}}
 */
exports.createTerminal = async function ({id, shell, args, cwd, cols, rows, env}) {
    if (terminals[id]) {
        throw new Error(`Terminal with id ${id} already exists`);
    }

    // Build environment
    const termEnv = Object.assign({}, process.env, {
        TERM: "xterm-256color",
        COLORTERM: "truecolor",
        TERM_PROGRAM: "Phoenix-Code"
    }, env || {});

    // Ensure LANG is set for proper Unicode support
    if (!termEnv.LANG) {
        termEnv.LANG = "en_US.UTF-8";
    }

    let ptyProcess;
    try {
        ptyProcess = pty.spawn(shell, args || [], {
            name: "xterm-256color",
            cols: cols || 80,
            rows: rows || 24,
            cwd: cwd || process.env.HOME || os.homedir(),
            env: termEnv
        });
    } catch (spawnErr) {
        console.error("Terminal: pty.spawn failed:", spawnErr.message, spawnErr.stack);
        throw spawnErr;
    }

    terminals[id] = {
        pty: ptyProcess,
        shellPath: shell,
        buffer: "",
        flushTimer: null,
        paused: false
    };

    ptyProcess.onData(function (data) {
        _appendBuffer(id, data);
    });

    ptyProcess.onExit(function ({exitCode, signal}) {
        const exitingTerm = terminals[id];
        if (exitingTerm) {
            // Flush any remaining buffered output
            clearTimeout(exitingTerm.flushTimer);
            exitingTerm.flushTimer = null;
            _flushBuffer(id);
            delete terminals[id];
        }
        nodeConnector.triggerPeer("terminalExit", {id, exitCode, signal});
    });

    return {id, pid: ptyProcess.pid, shell};
};

/**
 * Write data to a terminal's PTY
 * @param {Object} params
 * @param {string} params.id - Terminal ID
 * @param {string} params.data - Data to write
 * @returns {{ok: boolean}}
 */
exports.writeTerminal = async function ({id, data}) {
    const term = terminals[id];
    if (!term) {
        throw new Error(`Terminal ${id} not found`);
    }
    term.pty.write(data);
    return {ok: true};
};

/**
 * Resize a terminal's PTY
 * @param {Object} params
 * @param {string} params.id - Terminal ID
 * @param {number} params.cols - New column count
 * @param {number} params.rows - New row count
 * @returns {{ok: boolean}}
 */
exports.resizeTerminal = async function ({id, cols, rows}) {
    const term = terminals[id];
    if (!term) {
        throw new Error(`Terminal ${id} not found`);
    }
    term.pty.resize(cols, rows);
    return {ok: true};
};

/**
 * Kill a terminal's PTY process
 * @param {Object} params
 * @param {string} params.id - Terminal ID
 * @returns {{ok: boolean}}
 */
exports.killTerminal = async function ({id}) {
    const term = terminals[id];
    if (!term) {
        return {ok: true}; // already dead
    }
    // Just kill the process; the onExit handler will clean up the terminal entry
    try {
        if (process.platform === "win32") {
            // On Windows, use taskkill for process tree kill
            const {execSync} = require("child_process");
            try {
                execSync(`taskkill /pid ${term.pty.pid} /T /F`, {stdio: "ignore"});
            } catch (e) {
                // Process may already be dead
            }
        } else {
            term.pty.kill();
        }
    } catch (e) {
        // Process may already be dead — ensure cleanup still happens
        clearTimeout(term.flushTimer);
        term.flushTimer = null;
        delete terminals[id];
    }
    return {ok: true};
};

/**
 * Detect available shells on this OS
 * @returns {{shells: Array<{name: string, path: string, args: string[], platform: string}>}}
 */
exports.getDefaultShells = async function () {
    const platform = process.platform;
    const shells = [];

    if (platform === "darwin") {
        // macOS
        const defaultShell = process.env.SHELL || "/bin/zsh";
        const candidates = [
            {name: "zsh", path: "/bin/zsh", args: ["--login"]},
            {name: "bash", path: "/bin/bash", args: ["--login"]},
            {name: "fish", path: "/usr/local/bin/fish", args: ["--login"]},
            {name: "fish", path: "/opt/homebrew/bin/fish", args: ["--login"]}
        ];
        // Put default shell first
        const defaultEntry = candidates.find(c => c.path === defaultShell);
        if (defaultEntry) {
            shells.push(Object.assign({}, defaultEntry, {isDefault: true, platform}));
        } else {
            shells.push({name: path.basename(defaultShell), path: defaultShell, args: ["--login"], isDefault: true, platform});
        }
        for (const c of candidates) {
            if (c.path !== defaultShell) {
                try {
                    require("fs").accessSync(c.path, require("fs").constants.X_OK);
                    shells.push(Object.assign({}, c, {platform}));
                } catch (e) {
                    // not available
                }
            }
        }
    } else if (platform === "linux") {
        // Linux
        const defaultShell = process.env.SHELL || "/bin/bash";
        const candidates = [
            {name: "bash", path: "/bin/bash", args: ["--login"]},
            {name: "zsh", path: "/usr/bin/zsh", args: ["--login"]},
            {name: "fish", path: "/usr/bin/fish", args: ["--login"]}
        ];
        const defaultEntry = candidates.find(c => c.path === defaultShell);
        if (defaultEntry) {
            shells.push(Object.assign({}, defaultEntry, {isDefault: true, platform}));
        } else {
            shells.push({name: path.basename(defaultShell), path: defaultShell, args: ["--login"], isDefault: true, platform});
        }
        for (const c of candidates) {
            if (c.path !== defaultShell) {
                try {
                    require("fs").accessSync(c.path, require("fs").constants.X_OK);
                    shells.push(Object.assign({}, c, {platform}));
                } catch (e) {
                    // not available
                }
            }
        }
    } else if (platform === "win32") {
        // Windows
        const comspec = process.env.COMSPEC || "C:\\Windows\\System32\\cmd.exe";
        shells.push({name: "Command Prompt", path: comspec, args: [], isDefault: false, platform});

        // PowerShell
        try {
            const psPath = await which("powershell.exe");
            shells.push({name: "PowerShell", path: psPath, args: ["-ExecutionPolicy", "Bypass", "-NoLogo"], isDefault: true, platform});
        } catch (e) {
            // not available
        }

        // PowerShell Core
        try {
            const pwshPath = await which("pwsh.exe");
            shells.push({name: "PowerShell Core", path: pwshPath, args: ["-ExecutionPolicy", "Bypass", "-NoLogo"], platform});
        } catch (e) {
            // not available
        }

        // Git Bash
        const gitBashPath = "C:\\Program Files\\Git\\bin\\bash.exe";
        try {
            require("fs").accessSync(gitBashPath, require("fs").constants.X_OK);
            shells.push({name: "Git Bash", path: gitBashPath, args: ["--login"], platform});
        } catch (e) {
            // not available
        }

        // WSL
        try {
            const wslPath = await which("wsl.exe");
            shells.push({name: "WSL", path: wslPath, args: [], platform});
        } catch (e) {
            // not available
        }

        // If no default was set, mark first as default
        if (!shells.find(s => s.isDefault)) {
            shells[0].isDefault = true;
        }
    }

    return {shells};
};

/**
 * On Windows, node-pty's .process returns the terminal name (e.g. "xterm-256color")
 * instead of the actual foreground process. This helper queries the process tree
 * via PowerShell's Get-CimInstance to find the deepest child process name.
 * Falls back gracefully if PowerShell is unavailable or returns unexpected output.
 * @param {number} pid - The shell PID to look up children for
 * @returns {Promise<string>} The leaf child process name, or empty string
 */
function _getWindowsForegroundProcess(pid) {
    return new Promise((resolve) => {
        const psCommand = `Get-CimInstance Win32_Process -Filter 'ParentProcessId=${pid}'` +
            ` | Select-Object Name,ProcessId | ConvertTo-Json -Compress`;
        let settled = false;
        function done(val) {
            if (!settled) {
                settled = true;
                resolve(val);
            }
        }

        // Hard 2-second deadline — don't block the UI waiting for PowerShell
        const deadline = setTimeout(() => done(""), 2000);

        let child;
        try {
            child = execFile("powershell.exe", [
                "-NoProfile", "-NoLogo", "-Command", psCommand
            ], {timeout: 2000, windowsHide: true}, (err, stdout) => {
                clearTimeout(deadline);
                if (err || !stdout || !stdout.trim()) {
                    done("");
                    return;
                }
                try {
                    let parsed = JSON.parse(stdout.trim());
                    // PowerShell returns a single object if one result, an array if multiple
                    if (!Array.isArray(parsed)) {
                        parsed = [parsed];
                    }
                    const leaf = parsed.length > 0 ? parsed[parsed.length - 1] : null;
                    done(leaf && typeof leaf.Name === "string" ? leaf.Name : "");
                } catch (e) {
                    done("");
                }
            });
        } catch (e) {
            // powershell.exe not found or execFile threw synchronously
            clearTimeout(deadline);
            done("");
            return;
        }

        child.on("error", () => {
            clearTimeout(deadline);
            done("");
        });
    });
}

/**
 * Get foreground process info for a terminal
 * @param {Object} params
 * @param {string} params.id - Terminal ID
 * @returns {{process: string, pid: number}}
 */
exports.getTerminalProcess = async function ({id}) {
    const term = terminals[id];
    if (!term) {
        throw new Error(`Terminal ${id} not found`);
    }

    // On Mac/Linux, node-pty .process returns the actual foreground process name
    if (process.platform !== "win32") {
        return {
            process: term.pty.process,
            pid: term.pty.pid
        };
    }

    // On Windows, resolve the actual process from the PID tree
    const shellPid = term.pty.pid;
    const childName = await _getWindowsForegroundProcess(shellPid);
    // If a child process exists, return it; otherwise return the shell executable name
    const processName = childName || path.basename(term.shellPath || "");
    return {
        process: processName,
        pid: shellPid
    };
};

// Clean up all terminals on process exit
process.on("exit", function () {
    for (const id of Object.keys(terminals)) {
        try {
            terminals[id].pty.kill();
        } catch (e) {
            // ignore
        }
    }
});
