/*
 * Copyright (c) 2021 - present core.ai
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
/* eslint-env node */

const fs = require("fs/promises");
const path = require("path");
const readline = require("readline");
const {spawn} = require("child_process");
const {randomBytes} = require("crypto");

// Keep these paths in sync with src/utils/SystemConfigOverride.js.
const OVERRIDE_PATHS = {
    win32: "C:\\Program Files\\Phoenix Code Control\\phoenix_override_config.json",
    darwin: "/Library/Application Support/Phoenix Code Control/phoenix_override_config.json",
    linux: "/etc/phoenix-code-control/phoenix_override_config.json"
};
const DATE_KEY = "prodMCPOverrideDate";

/**
 * Match the local calendar date used by Phoenix's production boot gate.
 * @param {Date} [now] Date to format.
 * @return {string} Local date in YYYY-MM-DD form.
 */
function localDate(now = new Date()) {
    return now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-" +
        String(now.getDate()).padStart(2, "0");
}

/**
 * Inspect an existing path without following symlinks; absence is allowed.
 * @param {string} target File or directory to inspect.
 * @return {Promise<Object|null>} File stats, or null when missing.
 */
async function inspectPath(target) {
    try {
        const stat = await fs.lstat(target);
        if (stat.isSymbolicLink()) {
            throw new Error("Refusing to modify a symbolic link: " + target);
        }
        return stat;
    } catch (error) {
        if (error.code === "ENOENT") { return null; }
        throw error;
    }
}

/**
 * Change only the Builder permission, preserving other machine-wide overrides.
 * The caller must obtain admin rights first. A path parameter allows temporary-file verification.
 * @param {string} filePath Override file to update.
 * @param {string} action Either enable or disable.
 * @return {Promise<void>} Resolves after the change is on disk.
 */
async function updateOverride(filePath, action) {
    if (action !== "enable" && action !== "disable") {
        throw new Error("Choose enable or disable.");
    }
    const directory = path.dirname(filePath);
    const directoryStat = await inspectPath(directory);
    if (directoryStat && !directoryStat.isDirectory()) {
        throw new Error("Not a directory: " + directory);
    }
    const fileStat = await inspectPath(filePath);
    let config = {};
    if (fileStat) {
        if (!fileStat.isFile()) { throw new Error("Not a regular file: " + filePath); }
        const contents = await fs.readFile(filePath, "utf8");
        try {
            config = JSON.parse(contents.replace(/^\uFEFF/, ""));
        } catch (error) {
            throw new Error("The override file contains invalid JSON; it was left unchanged: " + filePath);
        }
        if (!config || typeof config !== "object" || Array.isArray(config)) {
            throw new Error("The override file must contain a JSON object; it was left unchanged: " + filePath);
        }
    }
    if (action === "disable") {
        if (!Object.prototype.hasOwnProperty.call(config, DATE_KEY)) { return; }
        delete config[DATE_KEY];
        if (Object.keys(config).length === 0) {
            await fs.unlink(filePath);
            return;
        }
    } else {
        const today = localDate();
        if (config[DATE_KEY] === today) { return; }
        config[DATE_KEY] = today;
        if (!directoryStat) {
            await fs.mkdir(directory, {recursive: true, mode: 0o755});
            if (process.platform !== "win32") { await fs.chmod(directory, 0o755); }
        }
    }

    // Write beside the destination and rename, so an interrupted write cannot truncate the policy.
    const temporaryFile = filePath + "." + randomBytes(12).toString("hex") + ".tmp";
    try {
        await fs.writeFile(temporaryFile, JSON.stringify(config, null, 4) + "\n", {flag: "wx", mode: 0o644});
        if (process.platform !== "win32") {
            // Preserve existing file permissions; make a new root-owned file readable by Phoenix.
            await fs.chmod(temporaryFile, fileStat ? fileStat.mode % 0o1000 : 0o644);
        }
        await fs.rename(temporaryFile, filePath);
    } finally {
        await fs.rm(temporaryFile, {force: true});
    }
}

/**
 * Encode a literal value for PowerShell without interpreting quotes or substitutions.
 * @param {string} value Literal argument.
 * @return {string} Single-quoted PowerShell literal.
 */
function powershellLiteral(value) {
    return "'" + value.replace(/'/g, "''") + "'";
}

/**
 * Build an admin launcher that also works when Node or the checkout path contains spaces.
 * @param {string} action Either enable or disable.
 * @param {string} [scriptPath] Absolute entry point.
 * @param {string} [nodePath] Absolute Node executable.
 * @return {string} PowerShell source, passed with -EncodedCommand rather than shell interpolation.
 */
function windowsElevationScript(action, scriptPath = __filename, nodePath = process.execPath) {
    if (action !== "enable" && action !== "disable") { throw new Error("Invalid action"); }
    const worker = "$ErrorActionPreference = 'Stop'\n" +
        "try {\n" +
        "    & " + powershellLiteral(nodePath) + " " + powershellLiteral(scriptPath) +
        " '--apply' " + powershellLiteral(action) + "\n" +
        "    $result = $LASTEXITCODE\n" +
        "} catch { Write-Host $_; $result = 1 }\n" +
        "if ($result -ne 0) { Read-Host 'Press Enter to close' | Out-Null }\n" +
        "exit $result\n";
    const encodedWorker = Buffer.from(worker, "utf16le").toString("base64");
    return "$ErrorActionPreference = 'Stop'\n" +
        "$identity = [Security.Principal.WindowsIdentity]::GetCurrent()\n" +
        "$principal = New-Object Security.Principal.WindowsPrincipal($identity)\n" +
        "if ($principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {\n" +
        "    & " + powershellLiteral(nodePath) + " " + powershellLiteral(scriptPath) +
        " '--apply' " + powershellLiteral(action) + "\n" +
        "    exit $LASTEXITCODE\n" +
        "}\n" +
        "$child = Start-Process -FilePath (Join-Path $PSHOME 'powershell.exe') " +
        "-ArgumentList @('-NoProfile', '-EncodedCommand', '" + encodedWorker + "') " +
        "-Verb RunAs -Wait -PassThru\n" +
        "exit $child.ExitCode\n";
}

/**
 * Run the writer with sudo or UAC, inheriting the terminal for authentication and errors.
 * @param {string} action Either enable or disable.
 * @return {Promise<void>} Resolves only after a successful elevated write.
 */
async function applyAsAdmin(action) {
    let command, args;
    if (process.platform === "win32") {
        command = path.join(process.env.SystemRoot || "C:\\Windows",
            "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
        args = ["-NoProfile", "-EncodedCommand",
            Buffer.from(windowsElevationScript(action), "utf16le").toString("base64")];
        console.log("Windows will request administrator approval if needed.");
    } else if (process.getuid() === 0) {
        await updateOverride(OVERRIDE_PATHS[process.platform], action);
        return;
    } else {
        command = "/usr/bin/sudo";
        args = ["--", process.execPath, __filename, "--apply", action];
        console.log("Administrator access is required. sudo may ask for your password.");
    }
    await new Promise(function (resolve, reject) {
        const child = spawn(command, args, {stdio: "inherit", shell: false});
        child.once("error", reject);
        child.once("exit", function (code, signal) {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error("Administrator update failed or was cancelled (" + (signal || code) + ")."));
            }
        });
    });
}

/** @return {Promise<string|null>} User's action, or null on Cancel, EOF or Ctrl+C. */
async function chooseAction() {
    const input = readline.createInterface({input: process.stdin, output: process.stdout});
    input.on("SIGINT", function () { input.close(); });
    try {
        process.stdout.write("[e] Enable for today / [d] Disable / [c] Cancel (default): ");
        for await (const line of input) {
            const answer = line.trim().toLowerCase();
            if (["e", "enable"].includes(answer)) { return "enable"; }
            if (["d", "disable"].includes(answer)) { return "disable"; }
            if (["", "c", "cancel"].includes(answer)) { return null; }
            process.stdout.write("Please enter e, d or c: ");
        }
        return null;
    } finally {
        input.close();
    }
}

/** @return {Promise<void>} Run the interactive command or its internal elevated writer. */
async function main() {
    const filePath = OVERRIDE_PATHS[process.platform];
    if (!filePath) { throw new Error("Unsupported platform: " + process.platform); }
    const args = process.argv.slice(2);
    if (args.length === 2 && args[0] === "--apply") {
        await updateOverride(filePath, args[1]);
        return;
    }
    if (args.length) {
        if (args.length === 1 && ["--help", "-h"].includes(args[0])) {
            console.log("Run npm run enableBuilderMcpInProd, then choose Enable, Disable or Cancel.");
            console.log("Permission lasts for today's local date. Restart Phoenix twice after changing it.");
            return;
        }
        throw new Error("Run without arguments to choose Enable, Disable or Cancel.");
    }
    console.log("Phoenix Builder MCP — production desktop builds");
    console.log("Override file: " + filePath);
    console.log("Enable permits Builder to control the app for today (" + localDate() + ").");
    const action = await chooseAction();
    if (!action) { console.log("Cancelled. No settings changed."); return; }
    await applyAsAdmin(action);
    console.log(action === "enable" ? "Builder MCP permission enabled for " + localDate() + "." :
        "Builder MCP permission disabled.");
    console.log("Restart the production app twice: the first start updates its cache, the second applies the change.");
}

// Export the file operation for verification against temporary fixtures, never the machine policy.
module.exports = {localDate, updateOverride, windowsElevationScript, OVERRIDE_PATHS};

if (require.main === module) {
    main().catch(function (error) {
        console.error("Could not update Builder MCP permission: " + error.message);
        process.exitCode = 1;
    });
}
