/* eslint-env node */
const { fork } = require("node:child_process");
const path = require("node:path");

/**
 * Start the ESM hub as a child owned by the development web server.
 * @return {Object} Readiness promise and bounded cleanup for this exact child only.
 */
function startBuilderHub() {
    const child = fork(path.join(__dirname, "hub-main.js"), [], {
        stdio: ["ignore", "inherit", "inherit", "ipc"]
    });
    let stopping;
    const exited = new Promise(resolve => { child.once("exit", resolve); child.once("error", resolve); });
    const ready = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("Builder hub startup timed out")), 10000);
        child.once("error", error => { clearTimeout(timeout); reject(error); });
        child.once("exit", code => { clearTimeout(timeout); reject(new Error(`Builder hub exited (${code})`)); });
        child.on("message", message => {
            if (!message || !["ready", "error"].includes(message.type)) { return; }
            clearTimeout(timeout);
            if (message.type === "ready") { resolve(message); }
            else { reject(new Error(message.message)); }
        });
    });
    return { ready,
        /** Stop the owned child, never terminate another process occupying the Builder port. */
        stop() {
            if (stopping) { return stopping; }
            stopping = (async () => {
                if (child.connected) { child.send({ type: "shutdown" }, () => {}); }
                const killTimer = setTimeout(() => child.kill("SIGKILL"), 5000);
                await exited;
                clearTimeout(killTimer);
            })();
            return stopping;
        }
    };
}
module.exports = { startBuilderHub };
