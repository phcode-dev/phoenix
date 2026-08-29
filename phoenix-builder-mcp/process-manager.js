import { spawn as nodeSpawn } from "child_process";
import process from "node:process";
import { LogBuffer } from "./log-buffer.js";

const DEFAULT_STARTUP_GRACE_MS = 500;
const DEFAULT_STOP_GRACE_MS = 5000;
const DEFAULT_FORCE_EXIT_GRACE_MS = 1000;

function _isMissingProcessError(error) {
    return error && error.code === "ESRCH";
}

function _hasExited(child) {
    return child.exitCode !== null && child.exitCode !== undefined
        || child.signalCode !== null && child.signalCode !== undefined;
}

function _killDirectChild(child, signal) {
    try {
        return child.kill(signal);
    } catch (error) {
        if (_isMissingProcessError(error)) {
            return false;
        }
        throw error;
    }
}

/**
 * Signal a spawned process and all descendants.
 *
 * POSIX children are launched as process-group leaders, so a negative PID
 * targets the complete group. Windows uses taskkill /T and falls back to the
 * direct child if taskkill is unavailable.
 *
 * @param {ChildProcess} child
 * @param {string} signal
 * @param {{platform?: string, spawnImpl?: Function}} options
 * @return {Promise<boolean>} Whether a signal was sent.
 */
export function terminateProcessTree(child, signal, options = {}) {
    if (!child || !Number.isInteger(child.pid) || child.pid <= 0) {
        return Promise.resolve(false);
    }

    const platform = options.platform || process.platform;
    const spawnImpl = options.spawnImpl || nodeSpawn;

    if (platform !== "win32") {
        try {
            process.kill(-child.pid, signal);
            return Promise.resolve(true);
        } catch (error) {
            if (_isMissingProcessError(error)) {
                return Promise.resolve(false);
            }
            return Promise.reject(error);
        }
    }

    return new Promise((resolve, reject) => {
        const args = ["/PID", String(child.pid), "/T"];
        if (signal === "SIGKILL") {
            args.push("/F");
        }

        let taskkill;
        try {
            taskkill = spawnImpl("taskkill.exe", args, {
                stdio: "ignore",
                windowsHide: true
            });
        } catch (error) {
            try {
                resolve(_killDirectChild(child, signal));
            } catch (fallbackError) {
                reject(fallbackError);
            }
            return;
        }

        let settled = false;
        const finishWithFallback = () => {
            if (settled) {
                return;
            }
            settled = true;
            try {
                resolve(_killDirectChild(child, signal));
            } catch (error) {
                reject(error);
            }
        };

        taskkill.once("error", finishWithFallback);
        taskkill.once("exit", (code) => {
            if (settled) {
                return;
            }
            settled = true;
            if (code === 0) {
                resolve(true);
                return;
            }
            try {
                resolve(_killDirectChild(child, signal));
            } catch (error) {
                reject(error);
            }
        });
    });
}

export function createProcessManager(options = {}) {
    const spawnImpl = options.spawnImpl || nodeSpawn;
    const terminateProcessTreeImpl = options.terminateProcessTreeImpl || terminateProcessTree;
    const startupGraceMs = options.startupGraceMs ?? DEFAULT_STARTUP_GRACE_MS;
    const stopGraceMs = options.stopGraceMs ?? DEFAULT_STOP_GRACE_MS;
    const forceExitGraceMs = options.forceExitGraceMs ?? DEFAULT_FORCE_EXIT_GRACE_MS;
    const platform = options.platform || process.platform;

    let childProcess = null;
    const terminalLogs = new LogBuffer();

    function _pushProcessError(prefix, error) {
        terminalLogs.push({
            stream: "stderr",
            text: `${prefix}: ${error.message}`,
            timestamp: new Date().toISOString()
        });
    }

    function start(phoenixDesktopPath) {
        if (childProcess) {
            throw new Error("Phoenix is already running. Stop it first.");
        }

        return new Promise((resolve, reject) => {
            const npmCommand = "npm";
            let child;
            try {
                child = spawnImpl(npmCommand, ["run", "serve:electron"], {
                    cwd: phoenixDesktopPath,
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
            let startupSettled = false;
            let startupTimer = null;

            if (child.stdout) {
                child.stdout.on("data", (data) => {
                    terminalLogs.push({
                        stream: "stdout",
                        text: data.toString(),
                        timestamp: new Date().toISOString()
                    });
                });
            }

            if (child.stderr) {
                child.stderr.on("data", (data) => {
                    terminalLogs.push({
                        stream: "stderr",
                        text: data.toString(),
                        timestamp: new Date().toISOString()
                    });
                });
            }

            child.once("error", (error) => {
                _pushProcessError("Process error", error);
                if (childProcess === child) {
                    childProcess = null;
                }
                if (!startupSettled) {
                    startupSettled = true;
                    clearTimeout(startupTimer);
                    reject(error);
                }
            });

            child.once("exit", (code, signal) => {
                terminalLogs.push({
                    stream: "stderr",
                    text: `Process exited with code=${code} signal=${signal}`,
                    timestamp: new Date().toISOString()
                });
                if (childProcess === child) {
                    childProcess = null;
                }
                if (!startupSettled) {
                    startupSettled = true;
                    clearTimeout(startupTimer);
                    reject(new Error(
                        `Phoenix exited before startup completed (code=${code}, signal=${signal})`
                    ));
                }
            });

            child.once("spawn", () => {
                startupTimer = setTimeout(() => {
                    if (startupSettled) {
                        return;
                    }
                    if (childProcess !== child || _hasExited(child)) {
                        startupSettled = true;
                        reject(new Error("Phoenix exited before startup completed"));
                        return;
                    }
                    startupSettled = true;
                    resolve({ pid: child.pid });
                }, startupGraceMs);
            });
        });
    }

    function stop() {
        if (!childProcess) {
            return Promise.resolve({ success: true, message: "No process running" });
        }

        const child = childProcess;
        return new Promise((resolve, reject) => {
            let settled = false;
            let forced = false;
            let forceKillTimer = null;
            let forceExitTimer = null;

            const cleanupTimers = () => {
                clearTimeout(forceKillTimer);
                clearTimeout(forceExitTimer);
            };

            const finish = (result, error) => {
                if (settled) {
                    return;
                }
                settled = true;
                cleanupTimers();
                child.off("exit", onExit);
                if (error) {
                    reject(error);
                    return;
                }
                if (childProcess === child) {
                    childProcess = null;
                }
                resolve(result);
            };

            const onExit = () => {
                finish({ success: true, forced });
            };

            child.once("exit", onExit);

            forceKillTimer = setTimeout(() => {
                if (settled || childProcess !== child) {
                    finish({ success: true, forced });
                    return;
                }

                forced = true;
                Promise.resolve(terminateProcessTreeImpl(child, "SIGKILL"))
                    .then((signalSent) => {
                        if (!signalSent || _hasExited(child)) {
                            finish({ success: true, forced: true });
                            return;
                        }
                        forceExitTimer = setTimeout(() => {
                            finish(
                                null,
                                new Error(
                                    `Phoenix process tree ${child.pid} did not exit after SIGKILL`
                                )
                            );
                        }, forceExitGraceMs);
                    })
                    .catch((error) => {
                        _pushProcessError("Failed to force-stop Phoenix process tree", error);
                        finish(null, error);
                    });
            }, stopGraceMs);

            Promise.resolve(terminateProcessTreeImpl(child, "SIGTERM"))
                .then((signalSent) => {
                    if (!signalSent || _hasExited(child)) {
                        finish({ success: true, forced: false });
                    }
                })
                .catch((error) => {
                    _pushProcessError("Failed to stop Phoenix process tree", error);
                    finish(null, error);
                });
        });
    }

    function isRunning() {
        return childProcess !== null;
    }

    function getPid() {
        return childProcess ? childProcess.pid : null;
    }

    function getTerminalLogs(sinceLast) {
        if (sinceLast) {
            return terminalLogs.getSinceLastRead();
        }
        return terminalLogs.getAll();
    }

    function clearTerminalLogs() {
        terminalLogs.clear();
    }

    function getTerminalLogsTotalPushed() {
        return terminalLogs.totalPushed();
    }

    return {
        start,
        stop,
        isRunning,
        getPid,
        getTerminalLogs,
        clearTerminalLogs,
        getTerminalLogsTotalPushed
    };
}
