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
 * @param {{fs: Object, execSync: Function}} [stubs] - Optional file system and PATH lookup substitutes
 * @return {Object} Locator exports
 */
function _loadLocator(platform, env, spawnImpl, stubs) {
    const exported = {};
    const processStubs = {};
    if (spawnImpl) {
        processStubs.spawn = spawnImpl;
    }
    if (stubs && stubs.execSync) {
        processStubs.execSync = stubs.execSync;
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
 * @param {Object} params - Simulated platform, env, and cliPath
 * @return {Promise<Object>} Profile and environment for Jasmine assertions
 */
async function getSpawnProfile({platform, env, cliPath}) {
    const locator = _loadLocator(platform, env);
    return { profile: locator.getSpawnProfile(cliPath), env };
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
    const locator = _loadLocator("win32", env, null, {
        fs: Object.assign({}, fs, {
            existsSync: function (candidate) { return candidate === installedPath; }
        }),
        execSync: function () { throw new Error("not on PATH"); }
    });
    return { located: await locator.locateCli("codex"), installedPath };
}

/**
 * Report the downloader chosen for each simulated set of installed tools.
 * @param {{installed: Array<Array<string>>}} params - Tool names on PATH, one list per scenario
 * @return {Promise<Array<?string>>} Chosen downloader per scenario
 */
async function findDownloaders({installed}) {
    return installed.map(function (tools) {
        const locator = _loadLocator("linux", { PATH: "/usr/bin" }, null, {
            execSync: function (command) {
                const found = tools.find(function (tool) { return command.endsWith("which " + tool); });
                if (!found) {
                    throw new Error("not on PATH");
                }
                return "/usr/bin/" + found + "\n";
            }
        });
        return locator.findDownloader();
    });
}

exports.getSpawnProfile = getSpawnProfile;
exports.locateWindowsStandaloneCodex = locateWindowsStandaloneCodex;
exports.findDownloaders = findDownloaders;
exports.probeWindowsShim = probeWindowsShim;
exports.runNpmFixture = runNpmFixture;
exports.runStandaloneFixture = runStandaloneFixture;
NodeConnector.createNodeConnector("ph_test_cli_locator", exports);
