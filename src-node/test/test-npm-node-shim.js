/*
 * Copyright (c) 2021 - present core.ai
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Node helpers for the Jasmine "Npm Node Shim" suite; assertions live in test/spec.
 *
 * Background: npm runs lifecycle scripts through the system shell, which resolves a bare `node`
 * from PATH. The app ships its runtime as `phnode`, so without a system Node those scripts
 * failed ("node: command not found"). utils._createNodeShimDir / _envWithNodeShim fix that;
 * these fixtures exercise them with a PATH that deliberately contains no Node at all.
 */
const childProcess = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const NodeConnector = require("../node-connector");
const utils = require("../utils");

const PROCESS_TIMEOUT_MS = 10000;
const NPM_TIMEOUT_MS = 90000;
const isWindows = process.platform === "win32";
// exit code chosen by the fixture scripts, to prove the launcher forwards it unchanged
const FIXTURE_EXIT_CODE = 7;

/**
 * A minimal child environment with no Node on PATH. Windows children still need the system
 * basics (cmd.exe itself, SystemRoot for winsock init); nothing here is a Node install dir.
 * @return {Object} environment
 */
function _envWithoutNode() {
    const env = { PATH: path.join(os.tmpdir(), "phoenix-no-node-on-path") };
    if (isWindows) {
        for (const key of ["SystemRoot", "COMSPEC", "PATHEXT", "TEMP", "TMP"]) {
            if (process.env[key]) {
                env[key] = process.env[key];
            }
        }
    }
    return env;
}

/**
 * Run a command line the way npm's run-script runs lifecycle scripts: `cmd /d /s /c` on
 * Windows, `sh -c` elsewhere, with `env` as the complete child environment.
 * @param {string} command - the script line, e.g. `node scripts/postinstall`
 * @param {Object} env - complete child environment
 * @return {Promise<{status: ?number, stdout: string, stderr: string}>}
 */
function _runLikeNpm(command, env) {
    const shell = isWindows ? (process.env.COMSPEC || "cmd.exe") : "/bin/sh";
    const args = isWindows ? ["/d", "/s", "/c", `"${command}"`] : ["-c", command];
    return new Promise(function (resolve) {
        childProcess.execFile(shell, args, {
            env, encoding: "utf8", timeout: PROCESS_TIMEOUT_MS, killSignal: "SIGKILL",
            windowsVerbatimArguments: isWindows
        }, function (error, stdout, stderr) {
            resolve({
                status: error ? (typeof error.code === "number" ? error.code : null) : 0,
                stdout,
                stderr
            });
        });
    });
}

/**
 * Pure PATH-prepend check, callable with any env shape the spec wants to try.
 * @param {{shimDir: string, baseEnv: Object}} params
 * @return {Promise<{env: Object, baseEnv: Object}>} the derived env and the (unmodified) input
 */
async function envWithNodeShim({shimDir, baseEnv}) {
    return { env: utils._envWithNodeShim(shimDir, baseEnv), baseEnv };
}

/**
 * Run `node -e ...` through the shell with a PATH holding no Node, before and after adding the
 * shim dir. Proves the shell finds `node` only through the shim, that it runs our own runtime,
 * and that args and exit code pass through unchanged.
 * @return {Promise<Object>} both results, our execPath, and whether the shim dir was cleaned up
 */
async function runNodeShimFixture() {
    const shimDir = await utils._createNodeShimDir(process.execPath);
    let result;
    try {
        const baseEnv = _envWithoutNode();
        const shimEnv = utils._envWithNodeShim(shimDir, baseEnv);
        const command = "node -e \"process.stdout.write(process.execPath + '|' + process.argv[1]);" +
            `process.exit(${FIXTURE_EXIT_CODE})" fixture-arg`;
        const without = await _runLikeNpm(command, baseEnv);
        const withShim = await _runLikeNpm(command, shimEnv);
        result = {
            without,
            withShim,
            expectedStdout: process.execPath + "|fixture-arg",
            expectedStatus: FIXTURE_EXIT_CODE
        };
    } finally {
        fs.rmSync(shimDir, { recursive: true, force: true });
    }
    result.shimRemoved = !fs.existsSync(shimDir);
    return result;
}

/**
 * End-to-end: `_npmInstallInFolder` on a dependency-free package whose postinstall calls a bare
 * `node`, exactly like protobufjs does. The script records the execPath it ran on, so the spec
 * can check the install used our runtime rather than whatever Node the machine may have.
 * No dependencies means nothing is fetched from a registry.
 * @return {Promise<Object>} install error (if any), recorded execPath, and ours
 */
async function runPostinstallFixture() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "phoenix-npm-postinstall-"));
    const marker = "postinstall-ran.txt";
    try {
        fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({
            name: "phoenix-postinstall-fixture",
            version: "1.0.0",
            private: true,
            scripts: {
                postinstall: `node -e "require('fs').writeFileSync('${marker}', process.execPath)"`
            }
        }, null, 2));
        // a lock file makes _npmInstallInFolder use `npm ci`, the path the LSP/extension installers take
        fs.writeFileSync(path.join(root, "package-lock.json"), JSON.stringify({
            name: "phoenix-postinstall-fixture",
            version: "1.0.0",
            lockfileVersion: 3,
            requires: true,
            packages: { "": { name: "phoenix-postinstall-fixture", version: "1.0.0" } }
        }, null, 2));
        let installError = null;
        let timer;
        try {
            await Promise.race([
                utils._npmInstallInFolder({ moduleNativeDir: root }),
                new Promise(function (_resolve, reject) {
                    timer = setTimeout(function () {
                        utils._cancelNpmInstall({ moduleNativeDir: root });
                        reject(new Error("npm install timed out"));
                    }, NPM_TIMEOUT_MS);
                })
            ]);
        } catch (err) {
            installError = err.message;
        } finally {
            clearTimeout(timer);
        }
        const markerPath = path.join(root, marker);
        const postinstallExecPath = fs.existsSync(markerPath) ? fs.readFileSync(markerPath, "utf8") : null;
        return { installError, postinstallExecPath, execPath: process.execPath };
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
}

exports.envWithNodeShim = envWithNodeShim;
exports.runNodeShimFixture = runNodeShimFixture;
exports.runPostinstallFixture = runPostinstallFixture;
NodeConnector.createNodeConnector("ph_test_npm_node_shim", exports);
