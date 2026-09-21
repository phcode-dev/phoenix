/*
 * Copyright (c) 2021 - present core.ai
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/*global describe, it, expect, beforeAll, awaitsFor */

define(function (require, exports, module) {
    const NodeConnector = require("NodeConnector");

    // The desktop unit jobs exercise Node helpers; browser jobs have no Node runtime.
    if (!Phoenix.isNativeApp) {
        return;
    }

    describe("unit:CLI Locator", function () {
        let nodeConnector;

        beforeAll(async function () {
            await awaitsFor(NodeConnector.isNodeReady, "Node runtime to be ready");
            nodeConnector = NodeConnector.createNodeConnector("ph_test_cli_locator", exports);
        });

        ["linux", "darwin"].forEach(function (platform) {
            it(platform + ": should keep the discovered nvm CLI's node/npm directory on PATH", async function () {
                const env = { PATH: "/usr/bin:/bin", SECRET: "must stay on the node side" };
                const cliPath = "/home/test/.nvm/versions/node/v24.1.0/bin/codex";
                const result = await nodeConnector.execPeer("getSpawnProfile", { platform, env, cliPath });
                expect(result.profile.command).toBe(cliPath);
                expect(result.profile.args).toEqual([]);
                expect(result.profile.env.PATH).toBe(
                    "/home/test/.nvm/versions/node/v24.1.0/bin:/usr/bin:/bin");
                expect(Object.keys(result.profile.env)).toEqual(["PATH"]);
                expect(result.env).toEqual(env);
            });
        });

        it("macOS: should make Homebrew bin available to the updater", async function () {
            const result = await nodeConnector.execPeer("getSpawnProfile", {
                platform: "darwin",
                env: { PATH: "/usr/bin:/bin:/usr/sbin:/sbin" },
                cliPath: "/opt/homebrew/bin/codex"
            });
            expect(result.profile.env.PATH).toBe("/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin");
        });

        it("should prioritize the selected installation without duplicating its directory", async function () {
            const result = await nodeConnector.execPeer("getSpawnProfile", {
                platform: "linux",
                env: { PATH: "/usr/bin:/opt/node/bin:/bin" },
                cliPath: "/opt/node/bin/codex"
            });
            expect(result.profile.env.PATH).toBe("/opt/node/bin:/usr/bin:/bin");
        });

        it("should not add the current directory when PATH is absent", async function () {
            const result = await nodeConnector.execPeer("getSpawnProfile", {
                platform: "linux", env: {}, cliPath: "/opt/node/bin/codex"
            });
            expect(result.profile.env.PATH).toBe("/opt/node/bin");
        });

        ["Path", "PATH"].forEach(function (pathKey) {
            it("Windows: should retain cmd.exe and inherited " + pathKey + " casing", async function () {
                const env = {
                    [pathKey]: "C:\\Windows\\System32;C:\\Program Files\\nodejs",
                    COMSPEC: "C:\\Windows\\System32\\cmd.exe"
                };
                const cliPath = "C:\\Users\\Test User\\AppData\\Roaming\\npm\\codex.cmd";
                const result = await nodeConnector.execPeer("getSpawnProfile", {
                    platform: "win32", env, cliPath
                });
                expect(result.profile.command).toBe(env.COMSPEC);
                expect(result.profile.args).toEqual(["/c", cliPath]);
                expect(result.profile.env[pathKey]).toBe(
                    "C:\\Users\\Test User\\AppData\\Roaming\\npm;" + env[pathKey]);
                expect(Object.keys(result.profile.env)).toEqual([pathKey]);
                expect(result.env).toEqual(env);
            });
        });

        it("Windows: should launch native executables directly and deduplicate PATH without case", async function () {
            const cliPath = "c:\\tools\\codex.exe";
            const result = await nodeConnector.execPeer("getSpawnProfile", {
                platform: "win32", env: { Path: "C:\\Windows;C:\\Tools;C:\\nodejs" }, cliPath
            });
            expect(result.profile.command).toBe(cliPath);
            expect(result.profile.args).toEqual([]);
            expect(result.profile.env.Path).toBe("c:\\tools;C:\\Windows;C:\\nodejs");
        });

        it("Windows: should give version probes the same PATH as terminal launches", async function () {
            const result = await nodeConnector.execPeer("probeWindowsShim");
            expect(result.result.status).withContext(result.result.stderr).toBe(0);
            expect(result.result.stdout.trim()).toBe("codex-cli 1.0.0");
            expect(result.captured.command).toBe('"C:\\npm prefix\\codex.cmd"');
            expect(result.captured.args).toEqual(["--version"]);
            expect(result.captured.options.shell).toBeTrue();
            expect(result.captured.options.env.Path).toBe(result.profile.env.Path);
            expect(result.env.Path).toBe("C:\\Windows;C:\\nodejs");
        });

        it("win32: should find Codex where the standalone installer puts it, without PATH", async function () {
            const result = await nodeConnector.execPeer("locateWindowsStandaloneCodex");
            expect(result.located.path).withContext(JSON.stringify(result.located)).toBe(result.installedPath);
            expect(result.located.source).toBe("native");
        });

        it("should pick curl, fall back to wget, and report when neither is installed", async function () {
            const result = await nodeConnector.execPeer("findDownloaders", {
                installed: [["curl", "wget"], ["wget"], []]
            });
            expect(result).toEqual(["curl", "wget", null]);
        });

        // These fixtures need POSIX symlinks/shebangs. Register them only there:
        // Phoenix's reporter treats Jasmine pending specs as failures.
        if (Phoenix.platform !== "win") {
            it("should run an npm-style CLI and updater with an otherwise empty desktop PATH", async function () {
                const result = await nodeConnector.execPeer("runNpmFixture");
                expect(result.before.status).withContext(JSON.stringify(result.before)).toBe(1);
                expect(result.before.stderr).toContain("ENOENT");
                expect(result.validated.ok).withContext(JSON.stringify(result.validated)).toBeTrue();
                expect(result.probe.status).withContext(result.probe.stderr).toBe(0);
                expect(result.probe.stdout.trim()).toBe("codex-cli 1.0.0");
                expect(result.after.status).withContext(JSON.stringify(result.after)).toBe(0);
                expect(result.after.stdout.trim()).toBe("UPDATER_OK install -g @openai/codex");
                expect(result.env.PATH).toBe(result.originalPath);
            }, 15000);

            it("should launch a standalone CLI without node or npm on PATH", async function () {
                const result = await nodeConnector.execPeer("runStandaloneFixture");
                expect(result.validated.ok).withContext(JSON.stringify(result.validated)).toBeTrue();
                expect(result.result.status).withContext(JSON.stringify(result.result)).toBe(0);
                expect(result.result.stdout.trim()).toBe("STANDALONE_OK");
            }, 15000);
        }
    });
});
