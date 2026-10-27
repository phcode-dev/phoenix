/*
 * Copyright (c) 2021 - present core.ai
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/** Node helpers for the Jasmine CLI Locator suite; assertions live in test/spec. */
const childProcess = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");
const NodeConnector = require("../node-connector");

const PROCESS_TIMEOUT_MS = 3000;

/**
 * Load the real locator with isolated platform, environment, and cache state.
 * @param {string} platform - Node platform name
 * @param {Object} env - Simulated desktop environment
 * @param {Function} [spawnImpl] - Optional probe process substitute
 * @param {{fs: Object, execFile: Function}} [stubs] - Optional file system and PATH lookup substitutes
 * @return {Object} Locator exports
 */
function _loadLocator(platform, env, spawnImpl, stubs) {
    const exported = {};
    const processStubs = {};
    if (spawnImpl) {
        processStubs.spawn = spawnImpl;
    }
    if (stubs && stubs.execFile) {
        processStubs.execFile = stubs.execFile;
    }
    const dependencies = {
        path: platform === "win32" ? path.win32 : path.posix,
        fs: (stubs && stubs.fs) || fs,
        child_process: Object.assign({}, childProcess, processStubs)
    };
    const source = fs.readFileSync(path.join(__dirname, "..", "cli-locator.js"), "utf8");
    vm.runInNewContext(source, {
        exports: exported,
        process: { platform, env },
        console: { log() {} },
        setTimeout,
        clearTimeout,
        require(name) {
            return dependencies[name];
        }
    }, { filename: "cli-locator.js" });
    return exported;
}

/**
 * Run a fixture without blocking the shared Node process.
 * @param {string} command - Executable path
 * @param {string[]} args - Command arguments
 * @param {Object} env - Complete child environment
 * @return {Promise<Object>} Serializable exit status, output, and spawn error
 */
function _runProcess(command, args, env) {
    return new Promise(function (resolve) {
        childProcess.execFile(command, args, {
            env, encoding: "utf8", timeout: PROCESS_TIMEOUT_MS, killSignal: "SIGKILL"
        }, function (error, stdout, stderr) {
            resolve({
                status: error ? (typeof error.code === "number" ? error.code : null) : 0,
                errorCode: error && typeof error.code === "string" ? error.code : null,
                stdout,
                stderr
            });
        });
    });
}

/**
 * Return a launch profile and the input environment after the locator runs.
 * @param {Object} params - Simulated platform, env, cliPath, and locate source
 * @return {Promise<Object>} Profile and environment for Jasmine assertions
 */
async function getSpawnProfile({platform, env, cliPath, source}) {
    const locator = _loadLocator(platform, env);
    return { profile: locator.getSpawnProfile(cliPath, source), env };
}

/**
 * Capture Windows probe options while running a harmless bundled-Node child.
 * @return {Promise<Object>} Probe result, captured spawn options, and terminal profile
 */
async function probeWindowsShim() {
    const env = { Path: "C:\\Windows;C:\\nodejs" };
    let captured;
    const locator = _loadLocator("win32", env, function (command, args, options) {
        captured = { command, args, options };
        return childProcess.spawn(process.execPath, ["-e", "console.log('codex-cli 1.0.0');"]);
    });
    const cliPath = "C:\\npm prefix\\codex.cmd";
    const result = await locator.spawnCli(cliPath, ["--version"], { timeout: PROCESS_TIMEOUT_MS });
    return { result, captured, profile: locator.getSpawnProfile(cliPath), env };
}

/**
 * Exercise an npm-style symlink and updater with no installation directory on PATH.
 * Uses bundled Node and a fake npm; never installs packages or contacts a server.
 * @return {Promise<Object>} Before/after process results and version validation
 */
async function runNpmFixture() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "phoenix-cli-env-"));
    try {
        const binDir = path.join(root, "node prefix with spaces", "bin");
        const packageDir = path.join(root, "node_modules", "@openai", "codex", "bin");
        fs.mkdirSync(binDir, { recursive: true });
        fs.mkdirSync(packageDir, { recursive: true });
        fs.symlinkSync(process.execPath, path.join(binDir, "node"));
        fs.writeFileSync(path.join(binDir, "npm"), "#!/usr/bin/env node\n" +
            "console.log('UPDATER_OK ' + process.argv.slice(2).join(' '));\n", { mode: 0o755 });
        const cliScript = path.join(packageDir, "codex.js");
        fs.writeFileSync(cliScript, [
            "#!/usr/bin/env node",
            "const childProcess = require('child_process');",
            "if (process.argv.includes('--version')) {",
            "    console.log('codex-cli 1.0.0');",
            "} else {",
            "    const result = childProcess.spawnSync('npm', ['install', '-g', '@openai/codex'],",
            "        { encoding: 'utf8' });",
            "    if (result.error) { console.error(result.error.code); process.exit(1); }",
            "    process.stdout.write(result.stdout);",
            "    process.exitCode = result.status;",
            "}",
            ""
        ].join("\n"), { mode: 0o755 });
        const cliPath = path.join(binDir, "codex");
        fs.symlinkSync(cliScript, cliPath);
        const env = { PATH: path.join(root, "empty-path") };
        const originalPath = env.PATH;
        const locator = _loadLocator(process.platform, env);

        // Start the script by absolute Node path to reproduce the updater's
        // missing-npm failure independently of its own node shebang.
        const before = await _runProcess(process.execPath, [cliPath], env);
        const validated = await locator.validateCliPath("codex", cliPath);
        const probe = await locator.spawnCli(cliPath, ["--version"], {
            env, encoding: "utf8", timeout: PROCESS_TIMEOUT_MS
        });
        const profile = locator.getSpawnProfile(cliPath);
        const after = await _runProcess(profile.command, profile.args, Object.assign({}, env, profile.env));
        return { before, validated, probe, after, originalPath, env };
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
}

/**
 * Run a standalone fixture with no Node/npm dependency on PATH.
 * @return {Promise<Object>} Version validation and process result
 */
async function runStandaloneFixture() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "phoenix-standalone-cli-"));
    try {
        const cliPath = path.join(root, "codex");
        fs.writeFileSync(cliPath, '#!/bin/sh\nif [ "$1" = "--version" ]; then\n' +
            "    printf 'codex-cli 1.0.0\\n'\nelse\n    printf 'STANDALONE_OK\\n'\nfi\n", { mode: 0o755 });
        const env = { PATH: path.join(root, "empty-path") };
        const locator = _loadLocator(process.platform, env);
        const validated = await locator.validateCliPath("codex", cliPath);
        const profile = locator.getSpawnProfile(cliPath);
        const result = await _runProcess(profile.command, profile.args, Object.assign({}, env, profile.env));
        return { validated, result };
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
}

/**
 * Locate Codex on a simulated Windows machine where only the standalone
 * installer's directory holds it and nothing is on PATH.
 * @return {Promise<Object>} Locator result and the path the installer uses
 */
async function locateWindowsStandaloneCodex() {
    const env = { LOCALAPPDATA: "C:\\Users\\me\\AppData\\Local", USERPROFILE: "C:\\Users\\me" };
    const installedPath = "C:\\Users\\me\\AppData\\Local\\Programs\\OpenAI\\Codex\\bin\\codex.exe";
    let pathLookups = 0;
    const locator = _loadLocator("win32", env, null, {
        fs: Object.assign({}, fs, {
            promises: Object.assign({}, fs.promises, {
                access: async function (candidate) {
                    if (candidate !== installedPath) { throw new Error("ENOENT"); }
                }
            })
        }),
        execFile: function (_command, _args, _options, callback) {
            pathLookups++;
            callback(new Error("not on PATH"), "");
        }
    });
    const located = await locator.locateCli("codex");
    return { located, installedPath, pathLookups };
}

/**
 * Locate claude with a simulated system install and bundled copy, so the
 * choice between them is checked without either being installed. Version
 * probes answer through a harmless bundled-Node child.
 * @param {{systemVersion: ?string, bundledVersion: ?string, override: ?string}} params
 * @return {Promise<Object>} The located result
 */
const BUNDLED_ROOT = "/phoenix/src-node";
const SYSTEM_CLAUDE = "/home/test/.local/bin/claude";
const BUNDLED_CLAUDE = BUNDLED_ROOT + "/node_modules/@anthropic-ai/claude-agent-sdk-linux-x64/claude";

/**
 * A Linux locator whose only executables are the paths in `versions`, each
 * answering `--version` through a harmless bundled-Node child. The map is
 * read live, so a test can remove a binary between lookups.
 * @param {Object} versions - path -> version string
 * @return {Object} Locator exports, with the bundled root set
 */
function _bundledLocator(versions) {
    const locator = _loadLocator("linux", { HOME: "/home/test", PATH: "/usr/bin" }, function (command) {
        const version = versions[command];
        return childProcess.spawn(process.execPath, ["-e", version
            ? "console.log(" + JSON.stringify(version + " (Claude Code)") + ")"
            : "process.exit(1)"]);
    }, {
        fs: Object.assign({}, fs, {
            promises: {
                access: async function (candidate) {
                    if (!versions[candidate]) { throw new Error("ENOENT"); }
                },
                readFile: async function () { throw new Error("ENOENT"); },
                readdir: async function () { return []; }
            }
        }),
        execFile: function (_command, _args, _options, callback) {
            callback(new Error("not on PATH"), "");
        }
    });
    locator.setBundledRoot(BUNDLED_ROOT);
    return locator;
}

async function locateWithBundled({systemVersion, bundledVersion, override}) {
    const versions = {};
    if (systemVersion) { versions[SYSTEM_CLAUDE] = systemVersion; }
    if (bundledVersion) { versions[BUNDLED_CLAUDE] = bundledVersion; }
    const locator = _bundledLocator(versions);
    if (override) {
        locator.setOverrides({ claude: override });
    }
    return locator.locateCli("claude");
}

/**
 * Locate claude, remove the system copy as an updater might, and locate
 * again without forcing: the cached path has to be noticed as gone.
 * @return {Promise<{before: Object, after: Object}>} both lookups
 */
async function relocateAfterRemoval() {
    const versions = {};
    versions[SYSTEM_CLAUDE] = "2.2.0";
    versions[BUNDLED_CLAUDE] = "2.1.141";
    const locator = _bundledLocator(versions);
    const before = await locator.locateCli("claude");
    delete versions[SYSTEM_CLAUDE];
    const after = await locator.locateCli("claude");
    return { before, after };
}

const WIN_NPM = "C:\\Users\\me\\AppData\\Roaming\\npm";
const WIN_SHIM = WIN_NPM + "\\claude.cmd";
const WIN_PACKAGE = WIN_NPM + "\\node_modules\\@anthropic-ai\\claude-code";
const WIN_BUNDLED_ROOT = "C:\\phoenix\\src-node";
const WIN_BUNDLED = WIN_BUNDLED_ROOT + "\\node_modules\\@anthropic-ai\\claude-agent-sdk-win32-x64\\claude.exe";

// What npm leaves behind in each case. `bin` is the package's entry; `binary`
// is what that path holds: its --version, or null for a file that won't run.
const NPM_SHIM_SCENARIOS = {
    resolved: { bin: "bin/claude.exe", binary: "2.1.280" },
    placeholder: { bin: "bin/claude.exe", binary: null },     // postinstall skipped
    otherVersion: { bin: "bin/claude.exe", binary: "2.1.279" },
    jsEntry: { bin: "cli.js", binary: "2.1.280" },
    outsidePackage: { bin: "../../evil.exe", binary: "2.1.280" },
    noPackage: { bin: null, binary: null }
};

/**
 * Locate claude on a simulated Windows machine whose only Claude Code of its
 * own is an npm shim at the bundled version, then ask what a shell-less
 * caller like the Agent SDK would run. Nothing is installed or read from disk.
 * @param {{scenario: string, override: boolean}} params - an NPM_SHIM_SCENARIOS key; whether
 *      the shim is the configured path rather than discovered
 * @return {Promise<Object>} The located result, the direct executable and the fixture paths
 */
async function locateWindowsNpmClaude({scenario, override}) {
    const fixture = NPM_SHIM_SCENARIOS[scenario];
    const target = fixture.bin ? path.win32.resolve(WIN_PACKAGE, fixture.bin) : null;
    const versions = { [WIN_SHIM]: "2.1.280", [WIN_BUNDLED]: "2.1.280" };
    const files = new Set(Object.keys(versions));
    if (target) {
        files.add(target);
        versions[target] = fixture.binary;
    }
    const env = {
        APPDATA: "C:\\Users\\me\\AppData\\Roaming", LOCALAPPDATA: "C:\\Users\\me\\AppData\\Local",
        USERPROFILE: "C:\\Users\\me", Path: "C:\\Windows"
    };
    const spawned = [];
    const locator = _loadLocator("win32", env, function (command) {
        // spawnCli quotes a shim's name for the shell it runs it in
        const file = command.replace(/^"(.*)"$/, "$1");
        spawned.push(file);
        const version = versions[file];
        return childProcess.spawn(process.execPath, ["-e", version
            ? "console.log(" + JSON.stringify(version + " (Claude Code)") + ")"
            : "process.exit(1)"]);
    }, {
        fs: Object.assign({}, fs, {
            promises: {
                access: async function (candidate) {
                    if (!files.has(candidate)) { throw new Error("ENOENT"); }
                },
                readFile: async function (file) {
                    if (fixture.bin && file === WIN_PACKAGE + "\\package.json") {
                        return JSON.stringify({ name: "@anthropic-ai/claude-code", bin: { claude: fixture.bin } });
                    }
                    throw new Error("ENOENT");
                },
                readdir: async function () { return []; }
            }
        }),
        execFile: function (_command, _args, _options, callback) {
            callback(new Error("not on PATH"), "");
        }
    });
    locator.setBundledRoot(WIN_BUNDLED_ROOT);
    if (override) {
        locator.setOverrides({ claude: WIN_SHIM });
    }
    const located = await locator.locateCli("claude");
    const direct = await locator.getDirectExecutable(located);
    return { located, direct, spawned, shim: WIN_SHIM, target, bundled: WIN_BUNDLED };
}

/**
 * Report the downloader chosen for each simulated set of installed tools.
 * @param {{installed: Array<Array<string>>}} params - Tool names on PATH, one list per scenario
 * @return {Promise<Array<?string>>} Chosen downloader per scenario
 */
async function findDownloaders({installed}) {
    return Promise.all(installed.map(function (tools) {
        const locator = _loadLocator("linux", { PATH: "/usr/bin" }, null, {
            execFile: function (_command, args, _options, callback) {
                const found = tools.find(function (tool) { return args[args.length - 1] === tool; });
                callback(found ? null : new Error("not on PATH"), found ? "/usr/bin/" + found + "\n" : "");
            }
        });
        return locator.findDownloader();
    }));
}

/**
 * Hold a real lookup child on stdin while the parent services a file read and timer.
 * @return {Promise<Object>} Responsiveness and bounded, shell-less lookup options.
 */
async function lookupWhileBusy() {
    let child, options, lookupStarted;
    const started = new Promise(resolve => { lookupStarted = resolve; });
    const locator = _loadLocator("linux", { PATH: "/usr/bin" }, null, {
        execFile: function (_command, _args, opts, callback) {
            options = opts;
            child = childProcess.execFile(process.execPath,
                ["-e", "process.stdin.once('data', () => { console.log('/usr/bin/curl'); process.exit(); });"],
                { timeout: PROCESS_TIMEOUT_MS }, callback);
            lookupStarted();
            return child;
        }
    });
    let settled = false;
    const lookup = locator.findDownloader().then(result => { settled = true; return result; });
    try {
        await started;
        const source = await fs.promises.readFile(__filename, "utf8");
        await new Promise(resolve => setImmediate(resolve));
        const pendingDuringRead = !settled;
        child.stdin.end("finish");
        return { downloader: await lookup, pendingDuringRead, readCompleted: source.length > 0,
            timeout: options.timeout, shell: !!options.shell, windowsHide: options.windowsHide };
    } finally {
        if (child) { child.kill(); }
    }
}

/**
 * Simulate which variants or a failed lookup without depending on host-installed tools.
 * @param {{failure: string}} params - unsupported, timeout, or missing.
 * @return {Promise<Object>} Downloader choice and lookup arguments/deadlines.
 */
async function lookupFailure({failure}) {
    const calls = [];
    const locator = _loadLocator("linux", {}, null, {
        execFile: function (command, args, options, callback) {
            calls.push({command, args, timeout: options.timeout});
            if (failure === "unsupported" && args.length === 1) {
                callback(null, "/usr/bin/curl\n");
            } else {
                const error = new Error(failure);
                error.code = failure === "missing" ? "ENOENT" : 1;
                error.killed = failure === "timeout";
                callback(error, "");
            }
        }
    });
    return { downloader: await locator.findDownloader(), calls };
}

/**
 * Concurrent callers share the same override, while different overrides stay independent.
 * @return {Promise<Object>} Promise identity and located paths.
 */
async function concurrentOverrides() {
    const paths = ["/test/one/codex", "/test/two/codex"];
    const locator = _loadLocator("linux", {}, function () {
        return childProcess.spawn(process.execPath, ["-e", "console.log('codex-cli 1.0.0');"]);
    }, { fs: Object.assign({}, fs, { promises: {
        access: async function (candidate) {
            if (!paths.includes(candidate)) { throw new Error("ENOENT"); }
        }
    } }) });
    const first = locator.locateCli("codex", {override: paths[0]});
    const shared = locator.locateCli("codex", {override: paths[0]});
    const second = locator.locateCli("codex", {override: paths[1]});
    return { shared: first === shared, independent: first !== second, results: await Promise.all([first, second]) };
}

exports.lookupWhileBusy = lookupWhileBusy;
exports.lookupFailure = lookupFailure;
exports.concurrentOverrides = concurrentOverrides;
exports.getSpawnProfile = getSpawnProfile;
exports.locateWindowsStandaloneCodex = locateWindowsStandaloneCodex;
exports.findDownloaders = findDownloaders;
exports.locateWithBundled = locateWithBundled;
exports.locateWindowsNpmClaude = locateWindowsNpmClaude;
exports.relocateAfterRemoval = relocateAfterRemoval;
exports.probeWindowsShim = probeWindowsShim;
exports.runNpmFixture = runNpmFixture;
exports.runStandaloneFixture = runStandaloneFixture;
NodeConnector.createNodeConnector("ph_test_cli_locator", exports);
