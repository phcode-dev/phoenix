import { spawn } from "child_process";
import { LogBuffer } from "./log-buffer.js";

export function createProcessManager() {
    let childProcess = null;
    const terminalLogs = new LogBuffer();

    function start(phoenixDesktopPath) {
        if (childProcess) {
            throw new Error("Phoenix is already running. Stop it first.");
        }

        return new Promise((resolve, reject) => {
            const child = spawn("npm", ["run", "serve:electron"], {
                cwd: phoenixDesktopPath,
                shell: true,
                stdio: ["ignore", "pipe", "pipe"],
                env: { ...process.env }
            });

            childProcess = child;

            child.stdout.on("data", (data) => {
                const text = data.toString();
                terminalLogs.push({
                    stream: "stdout",
                    text,
                    timestamp: new Date().toISOString()
                });
            });

            child.stderr.on("data", (data) => {
                const text = data.toString();
                terminalLogs.push({
                    stream: "stderr",
                    text,
                    timestamp: new Date().toISOString()
                });
            });

            child.on("error", (err) => {
                terminalLogs.push({
                    stream: "stderr",
                    text: `Process error: ${err.message}`,
                    timestamp: new Date().toISOString()
                });
                childProcess = null;
                reject(err);
            });

            child.on("exit", (code, signal) => {
                terminalLogs.push({
                    stream: "stderr",
                    text: `Process exited with code=${code} signal=${signal}`,
                    timestamp: new Date().toISOString()
                });
                childProcess = null;
            });

            // Give the process a moment to start or fail
            setTimeout(() => {
                if (childProcess) {
                    resolve({ pid: child.pid });
                }
            }, 500);
        });
    }

    function stop() {
        return new Promise((resolve) => {
            if (!childProcess) {
                resolve({ success: true, message: "No process running" });
                return;
            }

            const child = childProcess;
            let killed = false;

            const forceKillTimeout = setTimeout(() => {
                if (childProcess === child) {
                    child.kill("SIGKILL");
                    killed = true;
                }
            }, 5000);

            child.on("exit", () => {
                clearTimeout(forceKillTimeout);
                childProcess = null;
                resolve({ success: true, forced: killed });
            });

            child.kill("SIGTERM");
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
