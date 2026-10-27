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

const { execFile, spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const isWindows = process.platform === "win32";

// Bound asynchronous PATH lookups: an unreachable network drive must not
// leave discovery pending indefinitely or block the shared Node event loop.
const PATH_LOOKUP_TIMEOUT_MS = 3000;

// How long a `--version` probe may take before we give up on a candidate.
const VERSION_PROBE_TIMEOUT_MS = 3000;

// Negative results expire so a fresh install completed during a session is
// detected on the next lookup (the install-poll flow depends on this).
// Positive results are kept for as long as the binary is still there (see
// _cacheHit): an updater that moves the install, or an uninstall, must be
// noticed by the next lookup, or a prompt goes to a path that is gone.
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
        // The package `npm i -g` installs, for following its Windows shim to the binary it runs.
        npmPackage: "@anthropic-ai/claude-code",
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
        posixExtra: async function (home) {
            return [
                "/usr/local/bin/claude",                    // System-wide / Intel Mac Homebrew
                "/usr/bin/claude",                          // Distro package
                ...await _nvmCandidates(home, "claude"),    // npm global via nvm
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
            return [
                // chatgpt.com/codex/install.ps1. Listed by full path because
                // the User PATH entry it adds never reaches this already
                // running process, so a PATH lookup misses a fresh install.
                path.join(process.env.LOCALAPPDATA || "", "Programs", "OpenAI", "Codex", "bin", "codex.exe"),
                path.join(userHome, ".local", "bin", "codex.exe")
            ];
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
        posixExtra: async function (home) {
            return [
                "/usr/local/bin/codex",
                "/usr/bin/codex",
                ...await _nvmCandidates(home, "codex"),
                "/opt/homebrew/bin/codex",                  // brew install --cask codex
                "/home/linuxbrew/.linuxbrew/bin/codex"
            ];
        }
    }
};

const CLI_IDS = Object.keys(CLI_REGISTRY);

// The Claude Code the Claude Agent SDK ships with, in a package for this OS
// and CPU beside the SDK. It pairs with the SDK version Phoenix was built
// against, and is what runs when the system has no Claude Code, or one older
// than it. A configured path still wins outright.
const BUNDLED_CLAUDE_SCOPE = "@anthropic-ai";
const BUNDLED_CLAUDE_PACKAGE = "claude-agent-sdk";
let _bundledRoot = (typeof __dirname === "string") ? __dirname : null;
let _bundledClaude = null;      // Promise<?{path, version}>: looked up once per process

// cliId -> { path, at, overrideSig, source, version, errorCode, override, searched }
const _cache = new Map();
// cliId + override signature -> in-flight discovery promise, sharing one walk
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
 * @param {string} home - User's home directory.
 * @param {string} bin - CLI executable name.
 * @return {Promise<Array<string>>} Candidate paths in preference order.
 */
async function _nvmCandidates(home, bin) {
    const nvmRoot = process.env.NVM_DIR || path.join(home, ".nvm");
    const versionsDir = path.join(nvmRoot, "versions", "node");
    const candidates = [];
    try {
        const aliasFile = path.join(nvmRoot, "alias", "default");
        const alias = (await fs.promises.readFile(aliasFile, "utf8")).trim();
        if (/^v?\d/.test(alias)) {
            const v = alias.startsWith("v") ? alias : "v" + alias;
            candidates.push(path.join(versionsDir, v, "bin", bin));
        }
    } catch { /* nvm not installed or unreadable */ }
    try {
        const versions = (await fs.promises.readdir(versionsDir))
            .filter(v => /^v\d/.test(v))
            .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
        for (const v of versions) {
            candidates.push(path.join(versionsDir, v, "bin", bin));
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
 * @param {string} bin - Executable name to find.
 * @return {Promise<Array<string>>} Matching executable paths in preference order.
 */
async function _pathLookup(bin) {
    try {
        const started = Date.now();
        const lookup = (args, timeout) => new Promise(resolve => {
            execFile(isWindows ? "where.exe" : "which", args, {
                encoding: "utf8", timeout, windowsHide: true, env: process.env
            }, (error, stdout) => resolve({error, stdout}));
        });
        let result = await lookup(isWindows ? [bin] : ["-a", bin], PATH_LOOKUP_TIMEOUT_MS);
        const remaining = PATH_LOOKUP_TIMEOUT_MS - (Date.now() - started);
        // Some which implementations do not support -a. Retain the single-match
        // fallback without retrying a timeout or exceeding the original deadline.
        if (!isWindows && result.error && !result.error.killed &&
            typeof result.error.code === "number" && remaining > 0) {
            result = await lookup([bin], remaining);
        }
        if (result.error) { return []; }
        let paths = (result.stdout || "").trim().split(/\r?\n/)
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
 * Installer locations that can be checked before starting PATH discovery.
 * @param {Object} cli - a CLI_REGISTRY entry
 * @return {Array<string>} Native candidates in preference order.
 */
function _nativeCandidates(cli) {
    const home = (isWindows ? process.env.USERPROFILE : process.env.HOME) || process.env.HOME || "";
    return _dedupe(isWindows ? cli.winNative() : cli.posixNative(home));
}

/**
 * Find PATH and other fallback candidates only after native candidates fail.
 * @param {Object} cli - CLI registry entry.
 * @param {Array<string>} nativePaths - Previously considered native paths.
 * @return {Promise<Array<string>>} Fallback paths, each requiring a version probe.
 */
async function _fallbackCandidates(cli, nativePaths) {
    const home = (isWindows ? process.env.USERPROFILE : process.env.HOME) || process.env.HOME || "";
    const [onPath, extra] = await Promise.all([
        _pathLookup(cli.bin), isWindows ? cli.winExtra() : cli.posixExtra(home)
    ]);
    // Dedupe the fallback tier against native too: `which` reports the same
    // file the native tier already listed, and a user reading searchedPaths
    // should not see it twice.
    const seenNative = new Set(nativePaths.map(p => (isWindows ? p.toLowerCase() : p)));
    return _dedupe([...onPath, ...extra])
        .filter(p => !seenNative.has(isWindows ? p.toLowerCase() : p));
}

/**
 * Check existence on Windows and executable permission on POSIX without blocking Node.
 * @param {string} p - Candidate path.
 * @return {Promise<boolean>} Whether the candidate can be used.
 */
async function canAccess(p) {
    if (!p) { return false; }
    try {
        await fs.promises.access(p, isWindows ? fs.constants.F_OK : fs.constants.X_OK);
        return true;
    } catch {
        return false;
    }
}

/**
 * Add the CLI's bin directory to PATH so sibling tools (node/npm) work even
 * when a GUI launch omits the installation directory. Keep the bin symlink's
 * directory; its target in node_modules does not contain those tools.
 * @param {string} cliPath - Resolved CLI path
 * @param {Object} env - Environment to inherit PATH from
 * @return {Object} PATH override only; excludes secrets from terminal profiles
 */
function _cliPathEnv(cliPath, env) {
    const pathKey = isWindows
        ? Object.keys(env).sort().find(key => key.toLowerCase() === "path") || "Path"
        : "PATH";
    const binDir = path.dirname(path.resolve(cliPath));
    const inheritedPath = env[pathKey];
    const entries = inheritedPath ? inheritedPath.split(path.delimiter) : [];
    return { [pathKey]: _dedupe([binDir, ...entries]).join(path.delimiter) };
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
        const baseEnv = (opts && opts.env) || process.env;
        const spawnOpts = Object.assign(isCmdShim ? { shell: true } : {}, opts, {
            env: Object.assign({}, baseEnv, _cliPathEnv(cliPath, baseEnv))
        });
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
 * The binary an npm shim runs, found without reading the shim. npm installs a
 * global package under {prefix}\node_modules and writes the shim into
 * {prefix} from the package's own `bin` entry, so follow that entry rather
 * than parse a file whose format npm is free to change.
 * @return {Promise<?string>} an existing `.exe` inside the package, or null
 */
async function _npmShimTarget(cli, shimPath) {
    if (!cli.npmPackage) { return null; }
    const pkgDir = path.join(path.dirname(shimPath), "node_modules", ...cli.npmPackage.split("/"));
    try {
        const pkg = JSON.parse(await fs.promises.readFile(path.join(pkgDir, "package.json"), "utf8"));
        const bin = pkg.bin && typeof pkg.bin === "object" ? pkg.bin[cli.bin] : null;
        if (typeof bin !== "string") { return null; }
        const target = path.resolve(pkgDir, bin);
        // Only a native binary inside the package: a JS entry point would
        // need a Node that a desktop launch's PATH may not have.
        if (!target.startsWith(pkgDir + path.sep) || !/\.exe$/i.test(target)) { return null; }
        return await canAccess(target) ? target : null;
    } catch {
        return null;
    }
}

/**
 * A path that runs without a shell. Node refuses to spawn a Windows
 * `.cmd`/`.bat` shim shell-less (spawn EINVAL, CVE-2024-27980 hardening), so
 * an npm shim is followed to the binary it runs; anything else already is one.
 * @param {Object} cli - a CLI_REGISTRY entry
 * @param {string} cliPath - a located, version-probed path
 * @param {?string} version - its `--version` output
 * @return {Promise<?string>} null for a shim with no binary of the same version behind it
 */
async function _execPathFor(cli, cliPath, version) {
    if (!isWindows || !/\.(cmd|bat)$/i.test(cliPath)) { return cliPath; }
    const target = await _npmShimTarget(cli, cliPath);
    if (!target) { return null; }
    // Same installation only: the placeholder a skipped postinstall leaves fails here.
    const probe = await _probeVersion(cli, target);
    return probe.ok && compareVersions(probe.version, version) === 0 ? target : null;
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
        const found = (await _pathLookup(raw))[0];
        if (!found) {
            return { used: true, valid: false, path: raw, errorCode: ERROR_CODES.OVERRIDE_MISSING, onPath: true };
        }
        resolved = found;
    }
    if (!await canAccess(resolved)) {
        // Split "no such file" from "there but not executable": the latter is
        // the common chmod mistake and deserves its own advice.
        const exists = !isWindows && await fs.promises.access(resolved).then(() => true, () => false);
        const code = exists
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

/** Whether this Linux runs on musl (Alpine), where the SDK's glibc build cannot load. */
function _isMusl() {
    if (process.platform !== "linux") { return false; }
    const report = (process.report && typeof process.report.getReport === "function")
        ? process.report.getReport() : null;
    return !!report && !!report.header && report.header.glibcVersionRuntime === undefined;
}

/**
 * Where the SDK's platform package puts Claude Code, likeliest first. The
 * SDK resolves it the same way.
 * @return {Array<string>}
 */
function _bundledClaudeCandidates() {
    if (!_bundledRoot) { return []; }
    const platform = process.platform;
    const prefix = BUNDLED_CLAUDE_PACKAGE + "-" + platform + "-" + (process.arch || "x64");
    let packages = [prefix];
    if (platform === "linux") {
        packages = _isMusl() ? [prefix + "-musl", prefix] : [prefix, prefix + "-musl"];
    }
    const bin = platform === "win32" ? "claude.exe" : "claude";
    return packages.map(function (pkg) {
        return path.join(_bundledRoot, "node_modules", BUNDLED_CLAUDE_SCOPE, pkg, bin);
    });
}

/**
 * The bundled Claude Code, proved by `--version`. Looked up once: it does
 * not change while Phoenix runs.
 * @return {Promise<?{path: string, version: string}>}
 */
function _locateBundledClaude() {
    if (!_bundledClaude) {
        _bundledClaude = (async function () {
            const cli = CLI_REGISTRY.claude;
            for (const p of _bundledClaudeCandidates()) {
                if (!await canAccess(p)) { continue; }
                const probe = await _probeVersion(cli, p);
                if (probe.ok) {
                    console.log("[Phoenix AI] Bundled claude CLI at:", p, probe.version);
                    return { path: p, version: probe.version };
                }
                console.log("[Phoenix AI] Bundled claude CLI unusable:", p, probe.errorCode);
            }
            return null;
        }());
    }
    return _bundledClaude;
}

/**
 * Compare two versions part by part: "2.1.141 (Claude Code)" reads as
 * 2.1.141, and a missing part counts as 0.
 * @return {number} negative when `a` is older than `b`, positive when newer, 0 when the same
 */
function compareVersions(a, b) {
    const parse = function (v) {
        const match = /\d+(?:\.\d+)*/.exec(String(v || ""));
        return match ? match[0].split(".").map(Number) : [];
    };
    const pa = parse(a);
    const pb = parse(b);
    const count = Math.max(pa.length, pb.length);
    for (let i = 0; i < count; i++) {
        const diff = (pa[i] || 0) - (pb[i] || 0);
        if (diff) { return diff; }
    }
    return 0;
}

/**
 * Where the bundled Claude Code is looked for. Set by tests; the default is
 * this module's own directory, which is where the SDK is installed.
 * @param {?string} dir
 */
function setBundledRoot(dir) {
    _bundledRoot = dir || null;
    _bundledClaude = null;
    _cache.delete("claude");
}

/**
 * Check that a cached result still matches this request and its executable exists.
 * @param {string} cliId - CLI registry ID.
 * @param {string} overrideSig - Trimmed override for this request.
 * @return {Promise<?Object>} A matching, usable cache entry.
 */
async function _cacheHit(cliId, overrideSig) {
    const entry = _cache.get(cliId);
    if (!entry || entry.overrideSig !== overrideSig) {
        return null;
    }
    if (entry.path !== null && (!await canAccess(entry.path) ||
            (entry.execPath && !await canAccess(entry.execPath)))) {
        console.log("[Phoenix AI] " + cliId + " CLI is no longer at", entry.path);
        if (_cache.get(cliId) === entry) { _cache.delete(cliId); }
        return null;
    }
    const fresh = entry.path !== null || (Date.now() - entry.at) < NULL_CACHE_TTL_MS;
    return fresh ? entry : null;
}

function _toResult(cliId, entry) {
    return {
        cli: cliId,
        path: entry.path,
        execPath: entry.execPath || null,
        source: entry.source || null,
        version: entry.version || null,
        userInstalled: !!entry.userInstalled,
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
 * @return {Promise<Object>} `{cli, path, execPath, source, version, userInstalled, errorCode,
 *      override, searchedPaths}`. `userInstalled` says the user has a CLI of their own (found or
 *      configured), even when a newer bundled copy is the one `path` points to. `execPath` is
 *      `path` made safe to spawn without a shell (see _execPathFor), or null when it cannot be.
 */
function locateCli(cliId, opts) {
    const cli = CLI_REGISTRY[cliId];
    if (!cli) {
        return Promise.reject(new Error("Unknown CLI: " + cliId));
    }
    const force = !!(opts && opts.force);
    const override = (opts && opts.override !== undefined) ? opts.override : getOverride(cliId);
    const overrideSig = (override || "").trim();
    const pendingKey = cliId + ":" + overrideSig;

    if (!force) {
        const pending = _inFlight.get(pendingKey);
        if (pending) {
            return pending;
        }
    }

    const discovery = (async function () {
        if (!force) {
            const hit = await _cacheHit(cliId, overrideSig);
            if (hit) { return _toResult(cliId, hit); }
        }
        const entry = { path: null, at: Date.now(), overrideSig, searched: [] };

        if (overrideSig) {
            const report = await _resolveOverride(cli, overrideSig);
            entry.override = report;
            if (report && report.valid) {
                entry.path = report.path;
                entry.execPath = await _execPathFor(cli, report.path, report.version);
                entry.source = "override";
                entry.version = report.version;
                entry.userInstalled = true;
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

        const native = _nativeCandidates(cli);
        entry.searched = native.slice();
        // Only claude ships with Phoenix. With a bundled copy to weigh a
        // system install against, the system install's version has to be
        // known, so the native tier is probed too.
        const bundled = cliId === "claude" ? await _locateBundledClaude() : null;
        if (bundled) {
            entry.searched.push(bundled.path);
        }
        let found = null;   // {path, source, version}
        for (const p of native) {
            if (!await canAccess(p)) { continue; }
            let version = null;
            if (bundled) {
                const probe = await _probeVersion(cli, p);
                if (!probe.ok) {
                    console.log("[Phoenix AI] Native " + cli.bin + " CLI unusable:", p, probe.errorCode);
                    continue;
                }
                version = probe.version;
            }
            console.log("[Phoenix AI] Found native " + cli.bin + " CLI at:", p);
            found = { path: p, source: "native", version: version };
            break;
        }
        if (!found) {
            const fallback = await _fallbackCandidates(cli, native);
            entry.searched.push(...fallback);
            for (const p of fallback) {
                if (!await canAccess(p)) { continue; }
                const probe = await _probeVersion(cli, p);
                if (probe.ok) {
                    console.log("[Phoenix AI] Validated " + cli.bin + " CLI at:", p);
                    found = { path: p, source: "fallback", version: probe.version };
                    break;
                }
            }
        }
        // Found before the bundled copy is weighed: the user installed one, whichever of the two runs.
        entry.userInstalled = !!found;
        if (bundled && (!found || compareVersions(found.version, bundled.version) < 0)) {
            console.log(found
                ? "[Phoenix AI] System claude " + found.version + " is older than the bundled " +
                    bundled.version + "; using the bundled one"
                : "[Phoenix AI] No system claude; using the bundled " + bundled.version);
            found = { path: bundled.path, source: "bundled", version: bundled.version };
        }
        if (found) {
            entry.path = found.path;
            entry.execPath = await _execPathFor(cli, found.path, found.version);
            entry.source = found.source;
            entry.version = found.version;
            entry.at = Date.now();
            _cache.set(cliId, entry);
            return _toResult(cliId, entry);
        }
        console.log("[Phoenix AI] Global " + cli.bin + " CLI not found");
        entry.errorCode = ERROR_CODES.NOT_FOUND;
        entry.at = Date.now();
        _cache.set(cliId, entry);
        return _toResult(cliId, entry);
    }());

    if (!force) {
        _inFlight.set(pendingKey, discovery);
        const clearPending = function () {
            if (_inFlight.get(pendingKey) === discovery) {
                _inFlight.delete(pendingKey);
            }
        };
        discovery.then(clearPending, clearPending);
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

// Fetchers an install one-liner can pipe from, in preference order. Neither
// is universal on Linux: Debian/Ubuntu desktops ship wget without curl, Arch
// and Fedora ship curl without wget.
const DOWNLOADERS = ["curl", "wget"];

/**
 * Which downloader is on PATH, so the install command offered to the user is
 * one that can actually run.
 * @return {Promise<?string>} "curl", "wget", or null when neither is installed
 */
async function findDownloader() {
    for (const bin of DOWNLOADERS) {
        if ((await _pathLookup(bin)).length) {
            return bin;
        }
    }
    return null;
}

/**
 * Env a CLI needs on top of PATH, decided by where the binary came from.
 *
 * The bundled Claude Code ships inside Phoenix and is replaced when Phoenix
 * updates, so its own auto-updater has nothing useful to do — and it cannot
 * do it anyway: it resolves the npm prefix of whatever install it thinks it
 * is and tries to write there, which is a directory Phoenix neither owns nor
 * should touch. It fails every launch and says so in red across the CLI pane
 * ("Auto-update failed: no write permission to npm prefix"). Turning the
 * updater off is the supported way out (Anthropic set the same var for their
 * own managed runs). A CLI the *user* installed keeps its updater: that copy
 * is theirs to keep current, and it is how their version eventually
 * overtakes the bundled one.
 * @param {?string} source - `source` from locateCli(): "bundled" when ours
 * @return {Object}
 */
function _cliSourceEnv(source) {
    return source === "bundled" ? { DISABLE_AUTOUPDATER: "1" } : {};
}

/**
 * How to hand a resolved binary to node-pty.
 *
 * node-pty goes through CreateProcess, which runs .exe/.com only — a
 * `.cmd`/`.bat` shim (what `npm i -g` leaves on Windows) has to be run via
 * `cmd.exe /c`. Passing the shim straight through as the PTY's shell fails
 * to spawn, so every terminal caller must resolve through here rather than
 * using the raw path.
 * `env` carries the same PATH used for probes so child tools such as npm
 * remain available in the terminal, plus whatever `source` implies. Callers
 * must forward it to the PTY.
 * @param {string} cliPath - Resolved CLI path
 * @param {?string} [source] - `source` from locateCli(), for the env above
 * @return {{command: string, args: Array<string>, env: Object}}
 */
function getSpawnProfile(cliPath, source) {
    const env = Object.assign(_cliPathEnv(cliPath, process.env), _cliSourceEnv(source));
    if (isWindows && /\.(cmd|bat)$/i.test(cliPath || "")) {
        return { command: process.env.COMSPEC || "cmd.exe", args: ["/c", cliPath], env };
    }
    return { command: cliPath, args: [], env };
}

/**
 * What a caller that spawns without a shell, such as the Claude Agent SDK,
 * should run for a locateCli result: its `execPath`, or, for a Windows shim
 * with no binary found behind it, the bundled Claude Code. A shim must never
 * reach such a caller: Node throws spawn EINVAL for it.
 * @param {Object} located - a locateCli result
 * @return {Promise<?{path: string, source: string}>} null when nothing can run
 */
async function getDirectExecutable(located) {
    if (!located || !located.path) { return null; }
    if (located.execPath) {
        return { path: located.execPath, source: located.source };
    }
    const bundled = located.cli === "claude" ? await _locateBundledClaude() : null;
    if (!bundled) { return null; }
    console.log("[Phoenix AI] No binary found behind " + located.path + "; using the bundled " +
        bundled.version);
    return { path: bundled.path, source: "bundled" };
}

exports.CLI_IDS = CLI_IDS;
exports.ERROR_CODES = ERROR_CODES;
exports.canAccess = canAccess;
exports.spawnCli = spawnCli;
exports.locateCli = locateCli;
exports.validateCliPath = validateCliPath;
exports.findDownloader = findDownloader;
exports.getSpawnProfile = getSpawnProfile;
exports.getDirectExecutable = getDirectExecutable;
exports.getSourceEnv = _cliSourceEnv;
exports.compareVersions = compareVersions;
exports.setBundledRoot = setBundledRoot;
exports.setOverrides = setOverrides;
exports.getOverride = getOverride;
