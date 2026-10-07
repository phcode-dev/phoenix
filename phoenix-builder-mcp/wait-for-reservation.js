import { spawn } from "node:child_process";
import { waitForReservation } from "./reservation-monitor.js";

const [url, ...args] = process.argv.slice(2);
const controller = new AbortController();
process.once("SIGINT", () => controller.abort());
process.once("SIGTERM", () => controller.abort());

/** Run an explicitly configured client wakeup executable once; peer notes are data, never shell code. */
function notify(command, commandArgs, result) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, commandArgs, { shell: false, stdio: ["ignore", "inherit", "inherit"],
            env: { ...process.env, PHOENIX_BUILDER_GRANT: JSON.stringify(result) }, timeout: 30000 });
        child.once("error", reject);
        child.once("exit", (code, signal) => code === 0 ? resolve()
            : reject(new Error(`Wakeup command failed (${code}, ${signal}); reservation remains granted`)));
    });
}

try {
    let timeoutMs = 3600000;
    let command;
    let commandArgs = [];
    for (let index = 0; index < args.length; index++) {
        if (args[index] === "--timeout-ms") { timeoutMs = Number(args[++index]); }
        else if (args[index] === "--notify") {
            command = args[++index];
            if (!command) { throw new Error("--notify requires a wakeup executable"); }
            commandArgs = args.slice(index + 1); break;
        } else { throw new Error("Unknown monitor option: " + args[index]); }
    }
    if (!url || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
        throw new Error("Usage: node wait-for-reservation.js POLL_URL [--timeout-ms N] [--notify EXECUTABLE ARGS...]");
    }
    const result = await waitForReservation({ url, timeoutMs, signal: controller.signal,
        onGranted: async grant => {
            process.stdout.write(JSON.stringify(grant) + "\n");
            if (command) { await notify(command, commandArgs, grant); }
        } });
    if (result.status !== "granted") { process.stdout.write(JSON.stringify(result) + "\n"); process.exitCode = 2; }
} catch (error) {
    console.error(error.message);
    process.exitCode = 1;
}
