import { spawn as nodeSpawn } from "node:child_process";
import process from "node:process";
import { LogBuffer } from "./log-buffer.js";
import { terminateProcessTree } from "./process-manager.js";

const DEFAULT_STOP_GRACE_MS = 5000;
const DEFAULT_FORCE_EXIT_GRACE_MS = 1000;

function _hasExited(child) {
    return child.exitCode !== null && child.exitCode !== undefined
        || child.signalCode !== null && child.signalCode !== undefined;
}

function _now() {
    return new Date().toISOString();
}

export function createBuildManager(options = {}) {
    const spawnImpl = options.spawnImpl || nodeSpawn;
    const terminateProcessTreeImpl = options.terminateProcessTreeImpl || terminateProcessTree;
    const stopGraceMs = options.stopGraceMs ?? DEFAULT_STOP_GRACE_MS;
    const forceExitGraceMs = options.forceExitGraceMs ?? DEFAULT_FORCE_EXIT_GRACE_MS;
    const platform = options.platform || process.platform;

    let childProcess = null;
    let buildState = null;
    const buildLogs = new LogBuffer();

    function _snapshot() {
        if (!buildState) {
            return {
                status: "idle",
                running: false,
                pid: null
            };
        }

        return {
            ...buildState,
            running: childProcess !== null
        };
    }

    function _finishBuild(child, status, details = {}) {
        if (childProcess !== child || !buildState) {
            return;
        }

        childProcess = null;
        buildState = {
            ...buildState,
            status,
            finishedAt: _now(),
            ...details
        };
    }

    function start(phoenixProjectPath, npmScript) {
        if (childProcess) {
            throw new Error(
                `Phoenix build "${buildState.npmScript}" is already running (pid ${childProcess.pid})`
            );
        }

        buildLogs.clear();
        return new Promise((resolve, reject) => {
            let child;
            try {
                child = spawnImpl("npm", ["run", npmScript], {
                    cwd: phoenixProjectPath,
                    shell: platform === "win32",
                    stdio: ["ignore", "pipe", "pipe"],
                    env: { ...process.env },
                    detached: platform !== "win32",
                    windowsHide: true
                });
            } catch (error) {
                reject(error);
                return;
            }

            childProcess = child;
            buildState = {
                status: "starting",
                running: true,
                pid: child.pid,
                npmScript,
                projectPath: phoenixProjectPath,
                startedAt: _now(),
                finishedAt: null,
                exitCode: null,
                signal: null
            };

            if (child.stdout) {
                child.stdout.on("data", (data) => {
                    buildLogs.push({
                        stream: "stdout",
                        text: data.toString(),
                        timestamp: _now()
                    });
                });
            }
            if (child.stderr) {
                child.stderr.on("data", (data) => {
                    buildLogs.push({
                        stream: "stderr",
                        text: data.toString(),
                        timestamp: _now()
                    });
                });
            }

            let startupSettled = false;
            child.once("spawn", () => {
                if (buildState && childProcess === child) {
                    buildState.status = "running";
                    buildState.pid = child.pid;
                }
                startupSettled = true;
                resolve(_snapshot());
            });

            child.once("error", (error) => {
                buildLogs.push({
                    stream: "stderr",
                    text: `Build process error: ${error.message}`,
                    timestamp: _now()
                });
                _finishBuild(child, "failed", {
                    error: error.message
                });
                if (!startupSettled) {
                    startupSettled = true;
                    reject(error);
                }
            });

            child.once("exit", (code, signal) => {
                buildLogs.push({
                    stream: code === 0 ? "stdout" : "stderr",
                    text: `Build process exited with code=${code} signal=${signal}`,
                    timestamp: _now()
                });
                const status = buildState && buildState.status === "stopping"
                    ? "stopped"
                    : code === 0 ? "succeeded" : "failed";
                _finishBuild(child, status, {
                    exitCode: code,
                    signal
                });
                if (!startupSettled) {
                    startupSettled = true;
                    reject(new Error(
                        `Phoenix build exited before startup completed (code=${code}, signal=${signal})`
                    ));
                }
            });
        });
    }

    function stop() {
        if (!childProcess) {
            return Promise.resolve({
                success: true,
                message: "No Phoenix build is running",
                build: _snapshot()
            });
        }

        const child = childProcess;
        buildState.status = "stopping";
        return new Promise((resolve, reject) => {
            let settled = false;
            let forced = false;
            let forceKillTimer = null;
            let forceExitTimer = null;

            const cleanup = () => {
                clearTimeout(forceKillTimer);
                clearTimeout(forceExitTimer);
                child.off("exit", onExit);
            };
            const finish = (error) => {
                if (settled) {
                    return;
                }
                settled = true;
                cleanup();
                if (error) {
                    reject(error);
                    return;
                }
                if (childProcess === child) {
                    _finishBuild(child, "stopped", {
                        signal: forced ? "SIGKILL" : "SIGTERM"
                    });
                }
                resolve({
                    success: true,
                    forced,
                    build: _snapshot()
                });
            };
            const onExit = () => finish();

            child.once("exit", onExit);
            forceKillTimer = setTimeout(() => {
                if (settled || childProcess !== child) {
                    finish();
                    return;
                }

                forced = true;
                Promise.resolve(terminateProcessTreeImpl(child, "SIGKILL"))
                    .then((signalSent) => {
                        if (!signalSent || _hasExited(child)) {
                            finish();
                            return;
                        }
                        forceExitTimer = setTimeout(() => {
                            finish(new Error(
                                `Phoenix build process tree ${child.pid} did not exit after SIGKILL`
                            ));
                        }, forceExitGraceMs);
                    })
                    .catch(finish);
            }, stopGraceMs);

            Promise.resolve(terminateProcessTreeImpl(child, "SIGTERM"))
                .then((signalSent) => {
                    if (!signalSent || _hasExited(child)) {
                        finish();
                    }
                })
                .catch(finish);
        });
    }

    return {
        start,
        stop,
        getStatus: _snapshot,
        getLogs: (tail, before) => buildLogs.getTail(tail, before),
        clearLogs: () => buildLogs.clear(),
        getLogsTotalPushed: () => buildLogs.totalPushed()
    };
}
