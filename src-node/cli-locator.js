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
 * Locates the coding-agent CLIs Phoenix drives (`claude`, `codex`) on the
 * user's machine.
 *
 * Every CLI is described by one entry in CLI_REGISTRY — binary name, the
 * per-platform places its installers drop it, and how to recognise its
 * `--version` output. Adding a third CLI is a registry entry, not new code.
 *
 * Resolution order for each CLI is: the user's configured override path (if
 * any) → "native" candidates, whose installers are known to drop a real
 * executable so existence alone is trusted → "fallback" candidates from PATH
 * and known locations, each proved by actually running `--version`.
 */

const { execSync, spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const isWindows = process.platform === "win32";

// PATH lookups (`where`/`which`) run synchronously and block this whole Node
// process — the integrated terminal, file watchers and MCP all share it. An
// unreachable network drive on PATH can wedge them, so cap the wait.
const PATH_LOOKUP_TIMEOUT_MS = 3000;

// How long a `--version` probe may take before we give up on a candidate.
const VERSION_PROBE_TIMEOUT_MS = 3000;

// Negative results expire so a fresh install completed during a session is
// detected on the next lookup (the install-poll flow depends on this).
// Positive results are cached indefinitely — the self-heal in
// checkAvailability handles the mid-session-uninstall case by forcing.
const NULL_CACHE_TTL_MS = 15000;

// Characters that must never reach a user-supplied override path. Windows
// `.cmd`/`.bat` shims are spawned with shell:true (see spawnCli), where the
// command name is quoted but an embedded quote would break out of it.
const UNSAFE_OVERRIDE_CHARS = /["<>|\r\n]/;

/**
 * Why a lookup failed. The browser turns these into different advice, so
 * they are part of the peer contract — do not collapse them.
 */
const ERROR_CODES = {
    NOT_FOUND: "NOT_FOUND",                             // nothing on the chain worked
    OVERRIDE_MISSING: "OVERRIDE_MISSING",               // configured path does not exist
    OVERRIDE_NOT_EXECUTABLE: "OVERRIDE_NOT_EXECUTABLE", // exists but has no +x bit
    OVERRIDE_INVALID: "OVERRIDE_INVALID",               // runs, but is not this CLI
    OVERRIDE_TIMEOUT: "OVERRIDE_TIMEOUT",               // probe timed out — retry, don't repath
    OVERRIDE_REJECTED: "OVERRIDE_REJECTED"              // unsafe characters in the path
};

/**
 * The CLIs we know how to find.
 *
 * `versionPattern` recognises that CLI's own `--version` output. It cannot
 * be one shared rule: `claude --version` prints "2.1.263 (Claude Code)" but
 * `codex --version` prints "codex-cli 0.153.4", which does not start with a
 * digit. Loosening the check to "any output" instead would make any exit-0
 * binary that happens to be named `codex` on PATH a match — and `codex` is a
 * short, generic name.
 */
const CLI_REGISTRY = {
    claude: {
        id: "claude",
        bin: "claude",
        versionArgs: ["--version"],
        versionPattern: /^\d/,
        // claude.ai/install.sh and the desktop installer drop real binaries
        // here — no node/cli.js shim chain to break, so existence is enough.
        winNative: function () {
            const userHome = process.env.USERPROFILE || process.env.HOME || "";
            return [
                path.join(userHome, ".local", "bin", "claude.exe"),
                path.join(process.env.LOCALAPPDATA || "", "Programs", "claude", "claude.exe")
            ];
        },
        winExtra: function () {
            return [path.join(process.env.APPDATA || "", "npm", "claude.cmd")];
        },
        posixNative: function (home) {
            return [path.join(home, ".local", "bin", "claude")];  // claude.ai/install.sh default
        },
        posixExtra: function (home) {
            return [
                "/usr/local/bin/claude",                    // System-wide / Intel Mac Homebrew
                "/usr/bin/claude",                          // Distro package
                ..._nvmCandidates(home, "claude"),          // npm global via nvm
                "/opt/homebrew/bin/claude",                 // Homebrew on Apple Silicon
                "/home/linuxbrew/.linuxbrew/bin/claude"     // Linuxbrew
            ];
        }
    },
    codex: {
        id: "codex",
        bin: "codex",
        versionArgs: ["--version"],
        versionPattern: /^codex(-cli)?\s+v?\d/i,
        // Deliberately asymmetric with claude: only the standalone
        // installer's location is trusted without proof. Codex's other
        // Windows locations are educated guesses, and a native-tier entry
        // returns an unvalidated path straight to pty.spawn.
        winNative: function () {
            const userHome = process.env.USERPROFILE || process.env.HOME || "";
            return [path.join(userHome, ".local", "bin", "codex.exe")];
        },
        winExtra: function () {
            const userHome = process.env.USERPROFILE || process.env.HOME || "";
            return [
                path.join(process.env.APPDATA || "", "npm", "codex.cmd"),
                path.join(process.env.LOCALAPPDATA || "", "Programs", "codex", "codex.exe"),
                path.join(userHome, ".codex", "bin", "codex.exe")
            ];
        },
        posixNative: function (home) {
            return [
                path.join(home, ".local", "bin", "codex"),  // chatgpt.com/codex/install.sh
                // What that installer's symlink points at. Listed too so a
                // shell alias shadowing ~/.local/bin still resolves.
                path.join(home, ".codex", "packages", "standalone", "current", "bin", "codex")
            ];
        },
        posixExtra: function (home) {
            return [
                "/usr/local/bin/codex",
                "/usr/bin/codex",
                ..._nvmCandidates(home, "codex"),
                "/opt/homebrew/bin/codex",                  // brew install --cask codex
                "/home/linuxbrew/.linuxbrew/bin/codex"
            ];
        }
    }
};

const CLI_IDS = Object.keys(CLI_REGISTRY);

// cliId -> { path, at, overrideSig, source, version, errorCode, override, searched }
const _cache = new Map();
// cliId -> in-flight discovery promise, so concurrent callers share one walk
// of the fallback chain instead of each spawning their own --version probes.
const _inFlight = new Map();
// cliId -> user-configured override path ("" when unset)
const _overrides = new Map();

/**
 * Build candidate nvm-installed paths. The obvious `process.version` is the
 * Node that Phoenix ships, not the Node the user selected in nvm — which
 * mismatched in practice for ~every nvm user.
 *
 * Strategy: prefer the version named in `~/.nvm/alias/default` (or whatever
 * `$NVM_DIR` points at). Fall back to enumerating installed versions, newest
 * first, so we still find the CLI when the default alias is a label like
 * `lts/*` or `node` that we don't expand here.
 */
function _nvmCandidates(home, bin) {
    const nvmRoot = process.env.NVM_DIR || path.join(home, ".nvm");
    const versionsDir = path.join(nvmRoot, "versions", "node");
    const candidates = [];
    try {
        const aliasFile = path.join(nvmRoot, "alias", "default");
        if (fs.existsSync(aliasFile)) {
            const alias = fs.readFileSync(aliasFile, "utf8").trim();
            if (/^v?\d/.test(alias)) {
                const v = alias.startsWith("v") ? alias : "v" + alias;
                candidates.push(path.join(versionsDir, v, "bin", bin));
            }
        }
    } catch { /* nvm not installed or unreadable */ }
    try {
        if (fs.existsSync(versionsDir)) {
            const versions = fs.readdirSync(versionsDir)
                .filter(v => /^v\d/.test(v))
                .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
            for (const v of versions) {
                candidates.push(path.join(versionsDir, v, "bin", bin));
            }
        }
    } catch { /* ignore */ }
    return candidates;
}

/**
 * Drop duplicates, preserving order. Case-insensitive on Windows, where the
 * same file reaches us as both `C:\Users\...` and `c:\users\...` from
 * different sources and would otherwise be probed twice.
 */
function _dedupe(paths) {
    const seen = new Set();
    const out = [];
    for (const p of paths) {
        if (!p) { continue; }
        const key = isWindows ? p.toLowerCase() : p;
        if (seen.has(key)) { continue; }
        seen.add(key);
        out.push(p);
    }
    return out;
}

/**
 * Ask the OS where `bin` lives. Returns [] when the lookup tool is missing,
 * finds nothing, or takes too long.
 */
function _pathLookup(bin) {
    try {
        const cmd = isWindows
            ? "where " + bin
            : "which -a " + bin + " 2>/dev/null || which " + bin;
        const out = execSync(cmd, {
            encoding: "utf8",
            timeout: PATH_LOOKUP_TIMEOUT_MS,
            windowsHide: true
        }).trim();
        let paths = out.split(isWindows ? "\r\n" : "\n")
            .map(p => p.trim())
            .filter(p => p && !p.includes("node_modules"));
        if (isWindows) {
            // Filter to executable extensions — extensionless POSIX scripts
            // and .ps1 both come back from `where` and neither can be run by
            // our spawn path — and prefer .exe over .cmd/.bat shims.
            paths = paths.filter(p => /\.(exe|cmd|bat)$/i.test(p));
            const exes = paths.filter(p => /\.exe$/i.test(p));
            const others = paths.filter(p => !/\.exe$/i.test(p));
            paths = [...exes, ...others];
        }
        return paths;
    } catch {
        return [];
    }
}

/**
 * Ordered candidate paths for a CLI, split into two tiers:
 *   - `native`: installers known to drop a real executable. No shim chain to
 *     break, so file existence is enough confidence — we skip `--version`.
 *   - `fallback`: PATH discovery and known locations. Broken installs are
 *     common here (an orphan `.cmd` whose cli.js got deleted), so every
 *     candidate is proved by running `--version` before we return it.
 * @param {Object} cli - a CLI_REGISTRY entry
 * @return {{native: Array<string>, fallback: Array<string>}}
 */
function _candidates(cli) {
    const home = (isWindows ? process.env.USERPROFILE : process.env.HOME) || process.env.HOME || "";
    const native = isWindows ? cli.winNative() : cli.posixNative(home);
    const extra = isWindows ? cli.winExtra() : cli.posixExtra(home);
    const nativePaths = _dedupe(native);
    // Dedupe the fallback tier against native too: `which` reports the same
    // file the native tier already listed, and a user reading searchedPaths
    // should not see it twice.
    const seenNative = new Set(nativePaths.map(p => (isWindows ? p.toLowerCase() : p)));
    const fallback = _dedupe([..._pathLookup(cli.bin), ...extra])
        .filter(p => !seenNative.has(isWindows ? p.toLowerCase() : p));
    return { native: nativePaths, fallback: fallback };
}

/**
 * Existence + executability check. On Windows executability is derived from
 * extension/PATHEXT not a file attribute, so existsSync is the right test;
 * on posix we want the +x bit.
 */
function canAccess(p) {
    if (!p) { return false; }
    try {
        if (isWindows) {
            return fs.existsSync(p);
        }
        fs.accessSync(p, fs.constants.X_OK);
        return true;
    } catch {
        return false;
    }
}

/**
 * Spawn a CLI with argv and resolve to { stdout, stderr, status, error }.
 * Async so callers don't block the event loop while it runs — `claude auth
 * status` can take up to 10 s, `--version` up to 3 s, and the integrated
 * terminal and file watchers share this Node process.
 *
 * For .exe/posix binaries: shell-less spawn, paths-with-spaces and special
 * chars pass through verbatim. For Windows .cmd/.bat shims: shell:true
 * (Node refuses to spawn batch files without it per CVE-2024-27980
 * hardening) plus manual command-name quoting (Node intentionally does NOT
 * escape the command name under shell:true).
 *
 * Mimics the spawnSync result shape so callers read .status/.error/.stdout
 * unchanged. `opts.timeout` (ms) kills the process with SIGKILL on expiry
 * and surfaces an Error with message "timeout".
 */
function spawnCli(cliPath, args, opts) {
    return new Promise(function (resolve) {
        const isCmdShim = isWindows && /\.(cmd|bat)$/i.test(cliPath);
        const spawnCmd = isCmdShim ? `"${cliPath}"` : cliPath;
        const spawnOpts = isCmdShim ? Object.assign({ shell: true }, opts) : opts;
        const encoding = (opts && opts.encoding) || "utf8";
        const timeoutMs = (opts && opts.timeout) || 0;
        let child;
        try {
            child = spawn(spawnCmd, args, spawnOpts);
        } catch (err) {
            resolve({ stdout: "", stderr: "", status: null, error: err });
            return;
        }
        let stdout = "";
        let stderr = "";
        let settled = false;
        let timer = null;
        function finish(result) {
            if (settled) { return; }
            settled = true;
            if (timer) { clearTimeout(timer); }
            resolve(result);
        }
        if (child.stdout) {
            child.stdout.setEncoding(encoding);
            child.stdout.on("data", function (chunk) { stdout += chunk; });
        }
        if (child.stderr) {
            child.stderr.setEncoding(encoding);
            child.stderr.on("data", function (chunk) { stderr += chunk; });
        }
        child.on("error", function (err) {
            finish({ stdout, stderr, status: null, error: err });
        });
        child.on("close", function (code) {
            finish({ stdout, stderr, status: code, error: null });
        });
        if (timeoutMs > 0) {
            timer = setTimeout(function () {
                try { child.kill("SIGKILL"); } catch { /* already exited */ }
                finish({ stdout, stderr, status: null, error: new Error("timeout") });
            }, timeoutMs);
        }
    });
}

/**
 * Whether `--version` output belongs to this CLI. The registry pattern is
 * the primary rule; the generic floor below it ("names itself, then a
 * version number") keeps a future output change like `codex 1.0.0` working
 * without letting an unrelated binary through.
 */
function _versionOutputValid(cli, stdout) {
    const out = (stdout || "").trim();
    if (!out) { return false; }
    if (cli.versionPattern.test(out)) { return true; }
    return out.toLowerCase().startsWith(cli.bin.toLowerCase()) && /\bv?\d+\.\d+/.test(out);
}

/**
 * Run a candidate's `--version` and report what happened. Catches broken
 * installs the existence check misses — e.g. an npm `.cmd` shim whose
 * referenced cli.js was deleted by a half-completed uninstall — and, for an
 * override, tells apart "does not run" from "runs, but is a different tool".
 * @return {Promise<{ok: boolean, version: ?string, errorCode: ?string, stderr: string}>}
 */
async function _probeVersion(cli, cliPath) {
    let result;
    try {
        result = await spawnCli(cliPath, cli.versionArgs, {
            encoding: "utf8",
            timeout: VERSION_PROBE_TIMEOUT_MS
        });
    } catch (err) {
        return { ok: false, version: null, errorCode: ERROR_CODES.OVERRIDE_INVALID, stderr: err.message };
    }
    if (result.error && /timeout/i.test(result.error.message || "")) {
        return { ok: false, version: null, errorCode: ERROR_CODES.OVERRIDE_TIMEOUT, stderr: "" };
    }
    const version = (result.stdout || "").trim();
    if (result.error || result.status !== 0 || !_versionOutputValid(cli, version)) {
        return {
            ok: false,
            version: version || null,
            errorCode: ERROR_CODES.OVERRIDE_INVALID,
            stderr: (result.stderr || "").slice(0, 200)
        };
    }
    return { ok: true, version, errorCode: null, stderr: "" };
}

/**
 * Resolve and validate a user-configured override path.
 *
 * Unlike a discovered candidate, an override is ALWAYS proved by running
 * `--version` — even on Windows, even for a .exe. The whole point of the
 * setting is to tell the user when their path has gone stale.
 * @return {Promise<Object>} an override report; `.path` is set only on success
 */
async function _resolveOverride(cli, override) {
    const raw = (override || "").trim();
    if (!raw) { return null; }
    if (UNSAFE_OVERRIDE_CHARS.test(raw)) {
        return { used: true, valid: false, path: raw, errorCode: ERROR_CODES.OVERRIDE_REJECTED };
    }
    // A bare name with no separator means "find this on PATH" — the same
    // affordance the Git extension's gitPath setting allows.
    let resolved = raw;
    if (!raw.includes("/") && !raw.includes("\\")) {
        const found = _pathLookup(raw)[0];
        if (!found) {
            return { used: true, valid: false, path: raw, errorCode: ERROR_CODES.OVERRIDE_MISSING, onPath: true };
        }
        resolved = found;
    }
    if (!canAccess(resolved)) {
        // Split "no such file" from "there but not executable": the latter is
        // the common chmod mistake and deserves its own advice.
        const code = (!isWindows && fs.existsSync(resolved))
            ? ERROR_CODES.OVERRIDE_NOT_EXECUTABLE
            : ERROR_CODES.OVERRIDE_MISSING;
        return { used: true, valid: false, path: resolved, errorCode: code };
    }
    const probe = await _probeVersion(cli, resolved);
    if (!probe.ok) {
        return {
            used: true, valid: false, path: resolved,
            errorCode: probe.errorCode, version: probe.version, stderr: probe.stderr
        };
    }
    return { used: true, valid: true, path: resolved, version: probe.version };
}

/** The override currently configured for a CLI, or "". */
function getOverride(cliId) {
    return _overrides.get(cliId) || "";
}

/**
 * Record the user's configured override paths. Cache entries carry the
 * override they were built from, so changing one invalidates its entry on
 * the next lookup without any explicit cache-clearing call — which cannot
 * desync the way a separate clear step could.
 * @param {Object} paths - { claude?: string, codex?: string }
 * @return {Object} the applied overrides, by cli id
 */
function setOverrides(paths) {
    const applied = {};
    for (const cliId of CLI_IDS) {
        if (paths && Object.prototype.hasOwnProperty.call(paths, cliId)) {
            _overrides.set(cliId, (paths[cliId] || "").trim());
        }
        applied[cliId] = getOverride(cliId);
    }
    return applied;
}

function _cacheHit(cliId, overrideSig) {
    const entry = _cache.get(cliId);
    if (!entry || entry.overrideSig !== overrideSig) {
        return null;
    }
    const fresh = entry.path !== null || (Date.now() - entry.at) < NULL_CACHE_TTL_MS;
    return fresh ? entry : null;
}

function _toResult(cliId, entry) {
    return {
        cli: cliId,
        path: entry.path,
        source: entry.source || null,
        version: entry.version || null,
        errorCode: entry.errorCode || null,
        override: entry.override || null,
        searchedPaths: entry.searched || []
    };
}

/**
 * Find a CLI's executable.
 *
 * @param {string} cliId - "claude" | "codex"
 * @param {Object} [opts] - `{force}` bypasses the cache (and the in-flight
 *      share) after a runtime spawn failure; `{override}` uses that path for
 *      this call only instead of the stored one, so the settings UI can
 *      preview a path without committing it.
 * @return {Promise<Object>} `{cli, path, source, version, errorCode, override, searchedPaths}`
 */
function locateCli(cliId, opts) {
    const cli = CLI_REGISTRY[cliId];
    if (!cli) {
        return Promise.reject(new Error("Unknown CLI: " + cliId));
    }
    const force = !!(opts && opts.force);
    const override = (opts && opts.override !== undefined) ? opts.override : getOverride(cliId);
    const overrideSig = (override || "").trim();

    if (!force) {
        const hit = _cacheHit(cliId, overrideSig);
        if (hit) {
            return Promise.resolve(_toResult(cliId, hit));
        }
        const pending = _inFlight.get(cliId);
        if (pending) {
            return pending;
        }
    }

    const discovery = (async function () {
        const entry = { path: null, at: Date.now(), overrideSig, searched: [] };

        if (overrideSig) {
            const report = await _resolveOverride(cli, overrideSig);
            entry.override = report;
            if (report && report.valid) {
                entry.path = report.path;
                entry.source = "override";
                entry.version = report.version;
                console.log("[Phoenix AI] Using configured " + cli.bin + " path:", report.path);
            } else {
                // Deliberately NOT falling through to auto-discovery: quietly
                // running a different binary than the one the user configured
                // is the worst kind of bug report. Clearing the setting is how
                // you get discovery back.
                entry.errorCode = report ? report.errorCode : ERROR_CODES.NOT_FOUND;
                console.log("[Phoenix AI] Configured " + cli.bin + " path unusable:", entry.errorCode);
            }
            entry.at = Date.now();
            _cache.set(cliId, entry);
            return _toResult(cliId, entry);
        }

        const { native, fallback } = _candidates(cli);
        entry.searched = [...native, ...fallback];
        for (const p of native) {
            if (canAccess(p)) {
                console.log("[Phoenix AI] Found native " + cli.bin + " CLI at:", p);
                entry.path = p;
                entry.source = "native";
                entry.at = Date.now();
                _cache.set(cliId, entry);
                return _toResult(cliId, entry);
            }
        }
        for (const p of fallback) {
            if (!canAccess(p)) { continue; }
            const probe = await _probeVersion(cli, p);
            if (probe.ok) {
                console.log("[Phoenix AI] Validated " + cli.bin + " CLI at:", p);
                entry.path = p;
                entry.source = "fallback";
                entry.version = probe.version;
                entry.at = Date.now();
                _cache.set(cliId, entry);
                return _toResult(cliId, entry);
            }
        }
        console.log("[Phoenix AI] Global " + cli.bin + " CLI not found");
        entry.errorCode = ERROR_CODES.NOT_FOUND;
        entry.at = Date.now();
        _cache.set(cliId, entry);
        return _toResult(cliId, entry);
    }());

    if (!force) {
        _inFlight.set(cliId, discovery);
        discovery.finally(function () {
            if (_inFlight.get(cliId) === discovery) {
                _inFlight.delete(cliId);
            }
        });
    }
    return discovery;
}

/**
 * Check one specific path without touching the cache — for a "test this
 * path" affordance in settings, so the UI never reimplements validation.
 * @return {Promise<{ok: boolean, version: ?string, errorCode: ?string}>}
 */
async function validateCliPath(cliId, cliPath) {
    const cli = CLI_REGISTRY[cliId];
    if (!cli) {
        return { ok: false, version: null, errorCode: "UNKNOWN_CLI" };
    }
    const report = await _resolveOverride(cli, cliPath);
    if (!report) {
        return { ok: false, version: null, errorCode: ERROR_CODES.OVERRIDE_MISSING };
    }
    return {
        ok: !!report.valid,
        version: report.version || null,
        errorCode: report.valid ? null : report.errorCode,
        path: report.path
    };
}

/**
 * How to hand a resolved binary to node-pty.
 *
 * node-pty goes through CreateProcess, which runs .exe/.com only — a
 * `.cmd`/`.bat` shim (what `npm i -g` leaves on Windows) has to be run via
 * `cmd.exe /c`. Passing the shim straight through as the PTY's shell fails
 * to spawn, so every terminal caller must resolve through here rather than
 * using the raw path.
 * @return {{command: string, args: Array<string>}}
 */
function getSpawnProfile(cliPath) {
    if (isWindows && /\.(cmd|bat)$/i.test(cliPath || "")) {
        return { command: process.env.COMSPEC || "cmd.exe", args: ["/c", cliPath] };
    }
    return { command: cliPath, args: [] };
}

exports.CLI_IDS = CLI_IDS;
exports.ERROR_CODES = ERROR_CODES;
exports.canAccess = canAccess;
exports.spawnCli = spawnCli;
exports.locateCli = locateCli;
exports.validateCliPath = validateCliPath;
exports.getSpawnProfile = getSpawnProfile;
exports.setOverrides = setOverrides;
exports.getOverride = getOverride;
