const NodeConnector = require("./node-connector");
const { exec, execFile, spawn } = require('child_process');
const fs = require('fs');
const fsPromise = require('fs').promises;
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const zlib = require('zlib');
const { SYSTEM_SETTINGS_DIR } = require('./constants');
const { lintFile } = require("./ESLint/service");
const { addDeviceLicense, getDeviceID, isLicensedDevice, removeDeviceLicense } = require("./licence-device");
let openModule, open; // dynamic import when needed

async function _importOpen() {
    if(open){
        return open;
    }
    openModule = await import('open');
    open = openModule.default;
}

const UTILS_NODE_CONNECTOR = "ph_utils";
const utilsConnector = NodeConnector.createNodeConnector(UTILS_NODE_CONNECTOR, exports);

async function getURLContent({url, options}) {
    options = options || {
        redirect: "follow",
        headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/98.0.4758.102 Safari/537.36",
            "Cache-Control": "no-cache"
        }
    };
    const fetchResponse = await fetch(url, options);
    const bufferContents = await fetchResponse.arrayBuffer();
    return {
        buffer: bufferContents
    };
}

async function setLocaleStrings(localStrings) {
    exports.Strings = localStrings;
}

/**
 * retrieves the phoenix binary version
 * @param phoenixBinPath
 */
async function getPhoenixBinaryVersion(phoenixBinPath) {
    return new Promise((resolve, reject)=>{
        exec(`"${phoenixBinPath}" -v`, (error, stdout, stderr) => {
            if (error || stderr) {
                reject(`exec error: ${error||stderr}`);
                return;
            }
            resolve(stdout.trim());
        });
    });
}

async function getLinuxOSFlavorName() {
    const osReleaseFile = '/etc/os-release';

    try {
        const data = fs.readFileSync(osReleaseFile, 'utf8');
        const lines = data.split('\n');
        const osInfo = {};
        lines.forEach(line => {
            const [key, value] = line.split('=');
            osInfo[key.trim()] = value ? value.replace(/"/g, '') : '';
        });
        return osInfo.PRETTY_NAME;
    } catch (err) {
        console.error(`Error reading Linux OS Name ${osReleaseFile}: ${err.message}`);
        return null;
    }
}

const ALLOWED_BROWSERS_NAMES = [`chrome`, `firefox`, `safari`, `edge`, `browser`, `browserPrivate`];

/**
 * Allows opening the given url in one of the supported browsers.
 * @param url
 * @param {string} browserName one of `chrome`, `firefox`, `safari`, `edge`, `browser`, `browserPrivate`
 * @return {Promise<void>}
 */
async function openUrlInBrowser({url, browserName}) {
    if(!ALLOWED_BROWSERS_NAMES.includes(browserName)){
        throw new Error("openUrlInBrowser: unsupported browser "+browserName+" allowed: "+ALLOWED_BROWSERS_NAMES);
    }
    await _importOpen();
    const appName = browserName === "safari"? "safari":openModule.apps[browserName];
    await open(url, {
        app: {
            name: appName
        }
    });
}

/**
 * Loads a node extension module asynchronously.
 *
 * @param {string} moduleNativeDir - The path to the node extension module.
 * @return {Promise<void>} - A promise that resolves when the module has been loaded.
 * @private
 */
async function _loadNodeExtensionModule({moduleNativeDir}) {
    require(moduleNativeDir);
}

// In-flight cancellable operations - see cancelDownload / _cancelNpmInstall. Download entries
// hold an AbortController, npm entries hold the spawned ChildProcess.
const activeDownloads = new Map(); // cancelId -> AbortController
const activeNpmInstalls = new Map(); // moduleNativeDir -> ChildProcess

/**
 * Installs npm modules in the specified folder.
 *
 * @param {string} moduleNativeDir - The directory where the npm modules will be installed.
 * @return {Promise<void>} - A Promise that resolves with no value when the installation is complete.
 * @private
 */
async function _npmInstallInFolder({moduleNativeDir}) {
    if (activeNpmInstalls.has(moduleNativeDir)) {
        // two npm processes writing the same node_modules corrupt each other - callers must
        // await (or cancel) the running install before starting another. Deliberately BEFORE the
        // try/finally below: this throw must not clean up the entry the running install owns.
        throw new Error("npm install already in progress in " + moduleNativeDir);
    }
    try {
        const phnodeExePath = process.argv[0];
        const npmPath = path.resolve(path.dirname(require.resolve("npm")), "bin", "npm-cli.js");
        console.log("npm path", npmPath, "phnode path", phnodeExePath);
        // Check if the package.json file exists in the moduleNativeDir
        const packageJsonPath = path.join(moduleNativeDir, 'package.json');
        await fsPromise.access(packageJsonPath); // Throws if package.json doesn't exist

        // Check if package-lock.json exists in the moduleNativeDir
        const packageLockJsonPath = path.join(moduleNativeDir, 'package-lock.json');
        let packageLockJsonExists = false;
        try {
            await fsPromise.access(packageLockJsonPath);
            packageLockJsonExists = true;
        } catch (error) {
            console.log("package-lock.json does not exist, it is recommended to check in package-lock.json," +
                " using npm install instead of npm ci", packageLockJsonPath);
        }

        const npmInstallMode = packageLockJsonExists ? 'ci' : 'install';

        const nodeArgs = [npmPath, npmInstallMode, moduleNativeDir];
        console.log(`Running "${phnodeExePath} ${nodeArgs}" in ${moduleNativeDir}`);
        const npmInstallPromise = new Promise((resolve, reject) => {
            const child = execFile(phnodeExePath, nodeArgs, { cwd: moduleNativeDir }, (error) => {
                const wasCancelled = child.__phCancelled;
                if (error) {
                    console.error('Error:', error);
                    if (wasCancelled) {
                        error.cancelled = true;
                    }
                    reject(error);
                } else {
                    resolve();
                    console.log(`Successfully ran "${nodeArgs}" in ${moduleNativeDir}`);
                }
            });
            // Keep the handle so _cancelNpmInstall can kill a runaway/user-cancelled install.
            activeNpmInstalls.set(moduleNativeDir, child);
        });
        // awaited (not returned raw) so the finally below runs only after npm actually exits
        return await npmInstallPromise;
    } finally {
        // The entry MUST never outlive this invocation, whatever the failure path - a stale
        // entry would make the duplicate-install guard above block every retry until restart.
        activeNpmInstalls.delete(moduleNativeDir);
    }
}

/**
 * Cancel an in-flight downloadFile run by the cancelId it was started with. Idempotent -
 * unknown ids are a no-op. The cancelled download's promise rejects with an error carrying
 * `cancelled: true` and its partial file is deleted.
 *
 * @param {string} cancelId - the cancelId a downloadFile call was started with
 * @return {Promise<void>}
 */
async function cancelDownload({cancelId}) {
    if (cancelId && activeDownloads.has(cancelId)) {
        activeDownloads.get(cancelId).abort();
    }
}

/**
 * Kill an in-flight _npmInstallInFolder run by the moduleNativeDir it was started with.
 * Idempotent - unknown dirs are a no-op. The killed install's promise rejects with an error
 * carrying `cancelled: true`.
 *
 * @param {string} moduleNativeDir - the dir an _npmInstallInFolder call was started with
 * @return {Promise<void>}
 */
async function _cancelNpmInstall({moduleNativeDir}) {
    if (moduleNativeDir && activeNpmInstalls.has(moduleNativeDir)) {
        const child = activeNpmInstalls.get(moduleNativeDir);
        child.__phCancelled = true;
        child.kill();
    }
}

// no dot in the name - EventDispatcher treats anything after a "." as a listener namespace
const DOWNLOAD_PROGRESS_EVENT = "downloadProgress";

/**
 * Downloads a URL to a file on disk with node's native fetch (redirects followed), streaming
 * `downloadProgress` events carrying {url, transferred, total} to the browser side. When an
 * expected sha256 hex digest is given, a mismatch deletes the file and rejects - so a resolved
 * promise means the file on disk is exactly the bytes the caller pinned.
 *
 * @param {string} url - download URL
 * @param {string} destFile - platform path to write (parent directories created)
 * @param {string} [sha256] - expected hex digest of the downloaded bytes
 * @param {string} [cancelId] - registers the download so cancelDownload({cancelId}) can
 *        abort it mid-stream; the partial file is deleted and the rejection error carries
 *        `cancelled: true`
 * @return {Promise<void>}
 */
async function downloadFile({url, destFile, sha256, cancelId}) {
    let controller = null;
    if (cancelId) {
        if (activeDownloads.has(cancelId)) {
            throw new Error("a download with cancelId " + cancelId + " is already in progress");
        }
        controller = new AbortController();
        activeDownloads.set(cancelId, controller);
    }
    try {
        const response = await fetch(url, {
            redirect: "follow",
            signal: controller ? controller.signal : undefined
        });
        if (!response.ok) {
            throw new Error("Download failed with HTTP " + response.status + " for " + url);
        }
        const total = parseInt(response.headers.get("content-length"), 10) || 0;
        await fsPromise.mkdir(path.dirname(destFile), { recursive: true });
        const fileHandle = await fsPromise.open(destFile, "w");
        const hash = crypto.createHash("sha256");
        let transferred = 0;
        let lastReported = 0;
        try {
            for await (const chunk of response.body) {
                await fileHandle.write(chunk);
                hash.update(chunk);
                transferred += chunk.length;
                // throttle the websocket chatter: one event per 256KB is plenty for a progress bar
                if (transferred - lastReported > 262144 || transferred === total) {
                    lastReported = transferred;
                    utilsConnector.triggerPeer(DOWNLOAD_PROGRESS_EVENT, {url, transferred, total});
                }
            }
        } finally {
            await fileHandle.close();
        }
        if (sha256) {
            const actual = hash.digest("hex");
            if (actual !== sha256.toLowerCase()) {
                await fsPromise.unlink(destFile).catch(() => {});
                throw new Error("sha256 mismatch for " + url + " - expected " + sha256 + " got " + actual);
            }
        }
    } catch (err) {
        if (err && err.name === "AbortError") {
            await fsPromise.unlink(destFile).catch(() => {});
            err.cancelled = true;
        }
        throw err;
    } finally {
        if (cancelId) {
            activeDownloads.delete(cancelId);
        }
    }
}

/*
 * Minimal zip extraction on the node stdlib alone (zlib) - no external dependencies. Written for
 * installing language-server archives (e.g. Python wheels, which are plain zips): supports the
 * stored and deflate methods, restores unix executable bits from the central-directory external
 * attributes, and refuses path traversal. Does NOT support zip64, encryption or other exotic
 * compression methods - fine for our curated downloads, not a general-purpose unzipper.
 */
/* eslint-disable no-bitwise -- zip header parsing is inherently bit-twiddling */

const EOCD_SIG = 0x06054b50;   // end of central directory
const CEN_SIG = 0x02014b50;    // central directory entry
const ZIP64_MARKER = 0xffffffff;

function _findEndOfCentralDirectory(buf) {
    // EOCD is at the very end, possibly followed by a comment of up to 65535 bytes
    const earliest = Math.max(0, buf.length - 22 - 65535);
    for (let i = buf.length - 22; i >= earliest; i--) {
        if (buf.readUInt32LE(i) === EOCD_SIG) {
            return i;
        }
    }
    throw new Error("Not a zip file: end of central directory not found");
}

// Extracts a zip held in a Buffer to destDir, creating directories as needed. Entries whose
// unix mode carries any execute bit are chmod 755 after writing (except on Windows).
async function _extractZipBuffer(buf, destDir) {
    const eocd = _findEndOfCentralDirectory(buf);
    const entryCount = buf.readUInt16LE(eocd + 10);
    let offset = buf.readUInt32LE(eocd + 16);
    const destRoot = path.resolve(destDir);
    await fsPromise.mkdir(destRoot, { recursive: true });
    for (let i = 0; i < entryCount; i++) {
        if (offset + 46 > buf.length || buf.readUInt32LE(offset) !== CEN_SIG) {
            throw new Error("zip central directory corrupt");
        }
        const method = buf.readUInt16LE(offset + 10);
        const compressedSize = buf.readUInt32LE(offset + 20);
        const nameLen = buf.readUInt16LE(offset + 28);
        const extraLen = buf.readUInt16LE(offset + 30);
        const commentLen = buf.readUInt16LE(offset + 32);
        const externalAttrs = buf.readUInt32LE(offset + 38);
        const localOffset = buf.readUInt32LE(offset + 42);
        const name = buf.toString('utf8', offset + 46, offset + 46 + nameLen);
        offset += 46 + nameLen + extraLen + commentLen;

        if (compressedSize === ZIP64_MARKER || localOffset === ZIP64_MARKER) {
            throw new Error("zip64 archives are not supported: " + name);
        }
        const destPath = path.resolve(destRoot, name);
        if (destPath !== destRoot && !destPath.startsWith(destRoot + path.sep)) {
            throw new Error("zip entry escapes destination directory: " + name);
        }
        if (name.endsWith("/")) {
            await fsPromise.mkdir(destPath, { recursive: true });
            continue;
        }
        // data sits after the entry's LOCAL header, whose name/extra lengths can differ from
        // the central directory's copy - re-read them from the local header itself
        const locNameLen = buf.readUInt16LE(localOffset + 26);
        const locExtraLen = buf.readUInt16LE(localOffset + 28);
        const dataStart = localOffset + 30 + locNameLen + locExtraLen;
        const raw = buf.subarray(dataStart, dataStart + compressedSize);
        let data;
        if (method === 0) {          // stored
            data = raw;
        } else if (method === 8) {   // deflate
            data = zlib.inflateRawSync(raw);
        } else {
            throw new Error("unsupported zip compression method " + method + " in " + name);
        }
        await fsPromise.mkdir(path.dirname(destPath), { recursive: true });
        await fsPromise.writeFile(destPath, data);
        const unixMode = (externalAttrs >>> 16) & 0xFFFF;
        if ((unixMode & 0o111) && process.platform !== "win32") {
            await fsPromise.chmod(destPath, 0o755);
        }
    }
}
/* eslint-enable no-bitwise */

/**
 * Extracts a zip file into destDir using the stdlib-only extractor above (creates destDir
 * if missing, restores unix executable bits recorded in the archive). Python wheels are plain
 * zips, so this also installs those.
 *
 * @param {string} zipPath - platform path of the zip file
 * @param {string} destDir - platform path of the directory to extract into
 * @return {Promise<void>}
 */
async function extractZipFile({zipPath, destDir}) {
    const buf = await fsPromise.readFile(zipPath);
    await _extractZipBuffer(buf, destDir);
}

/**
 * Runs an executable with the given args, feeding it text on stdin and capturing its output -
 * a one-shot filter-style invocation (e.g. `ruff format -` for the Python beautifier). No shell
 * is involved; the command is spawned directly. Resolves with the exit code rather than
 * rejecting on non-zero, so callers can read stderr for the reason.
 *
 * @param {string} command - platform path of the executable (or a PATH command name)
 * @param {string[]} [args]
 * @param {string} [stdinText] - written to the process's stdin, which is then closed
 * @param {string} [cwd] - working directory (e.g. for tools that discover config upward)
 * @param {number} [timeoutMs] - kill the process and reject after this long
 * @return {Promise<{code: number, stdout: string, stderr: string}>}
 */
async function execFileWithInput({command, args, stdinText, cwd, timeoutMs}) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args || [], { cwd: cwd || undefined, stdio: ['pipe', 'pipe', 'pipe'] });
        let stdout = "", stderr = "", settled = false;
        const timer = timeoutMs ? setTimeout(() => {
            if (!settled) {
                settled = true;
                child.kill();
                reject(new Error("execFileWithInput timed out: " + command));
            }
        }, timeoutMs) : null;
        child.stdout.on('data', (data) => { stdout += data.toString(); });
        child.stderr.on('data', (data) => { stderr += data.toString(); });
        child.on('error', (err) => {
            if (!settled) {
                settled = true;
                if (timer) {
                    clearTimeout(timer);
                }
                reject(err);
            }
        });
        child.on('close', (code) => {
            if (!settled) {
                settled = true;
                if (timer) {
                    clearTimeout(timer);
                }
                resolve({ code, stdout, stderr });
            }
        });
        child.stdin.on('error', () => {}); // EPIPE if the process exits before reading stdin
        child.stdin.write(stdinText || "");
        child.stdin.end();
    });
}

/**
 * Marks a file as executable (chmod 755). No-op on Windows, where execute permission does not
 * exist. For binaries whose archives did not carry unix mode bits.
 *
 * @param {string} filePath - platform path of the file
 * @return {Promise<void>}
 */
async function setExecutableBits({filePath}) {
    if (process.platform === "win32") {
        return;
    }
    await fsPromise.chmod(filePath, 0o755);
}

/**
 * If it's a dir that exists, returns that
 * If it's a file, it returns the parent directory if it exists
 * If no parent exists, it returns the original path.
 *
 * @param {string} cwd - The path to validate.
 * @returns {string} - An existing directory or the original path.
 */
function _getValidDirectory(cwd) {
    let currentPath = path.resolve(cwd);
    const exists = fs.existsSync(currentPath);

    if (exists) {
        const isPathDir = fs.statSync(currentPath).isDirectory();
        if(isPathDir){
            return currentPath;
        }
        return path.dirname(currentPath);
    }

    currentPath = path.dirname(currentPath);
    if(fs.existsSync(currentPath)){
        return currentPath;
    }

    // If no valid directory is found, fallback to the original cwd
    return cwd;
}

/**
 * Opens a native terminal window with the specified current working directory.
 * Returns a Promise that resolves if the terminal starts successfully, or rejects if it fails.
 *
 * @param {string} cwd - The directory to open the terminal in.
 * @param {boolean} usePowerShell - Whether to use PowerShell instead of cmd on Windows.
 * @returns {Promise<void>} - Resolves if the terminal starts, rejects otherwise.
 */
function openNativeTerminal({cwd, usePowerShell = false}) {
    return new Promise((resolve, reject) => {
        const platform = os.platform();
        cwd = _getValidDirectory(cwd);
        let command;

        if (platform === 'win32') {
            if (usePowerShell) {
                command = `start powershell -NoExit -Command "Set-Location -Path '${cwd}'"`;
            } else {
                command = `start cmd /K "cd /D ${cwd}"`;
            }
        } else if (platform === 'darwin') {
            command = `open -a Terminal "${cwd}"`;
        } else {
            command = `
                if command -v gnome-terminal > /dev/null 2>&1; then
                    gnome-terminal --working-directory="${cwd}";
                elif command -v konsole > /dev/null 2>&1; then
                    konsole --workdir "${cwd}";
                elif command -v xfce4-terminal > /dev/null 2>&1; then
                    xfce4-terminal --working-directory="${cwd}";
                elif command -v xterm > /dev/null 2>&1; then
                    xterm -e "cd '${cwd}' && bash";
                else
                    echo "No supported terminal emulator found.";
                    exit 1;
                fi
            `;
        }

        // Execute the terminal command
        exec(command, (error) => {
            if (error) {
                reject(new Error(`Failed to start terminal: ${error.message}`));
            } else {
                resolve();
            }
        });
    });
}

/**
 * Opens a file in the default application for its type on Windows, macOS, and Linux.
 *
 * @param {string} fullPath - The path to the file/folder to open.
 * @returns {Promise<void>} - Resolves if the file/folder is opened successfully, rejects otherwise.
 */
function openInDefaultApp(fullPath) {
    return new Promise((resolve, reject) => {
        const platform = os.platform();
        let command;

        if (platform === 'win32') {
            // Windows: Use 'start' command
            command = `start "" "${fullPath}"`;
        } else if (platform === 'darwin') {
            // macOS: Use 'open' command
            command = `open "${fullPath}"`;
        } else {
            // Linux: Use 'xdg-open' command
            command = `xdg-open "${fullPath}"`;
        }

        // Execute the command
        exec(command, (error) => {
            if (error) {
                reject(new Error(`Failed to open file: ${error.message}`));
            } else {
                resolve();
            }
        });
    });
}



async function ESLintFile({text, fullFilePath, projectFullPath}) {
    return lintFile(text, fullFilePath, projectFullPath);
}

async function getEnvironmentVariable(varName) {
    return process.env[varName];
}

async function getOSUserName() {
    return os.userInfo().username;
}

async function getSystemSettingsDir() {
    return SYSTEM_SETTINGS_DIR;
}

exports.getURLContent = getURLContent;
exports.setLocaleStrings = setLocaleStrings;
exports.getPhoenixBinaryVersion = getPhoenixBinaryVersion;
exports.getLinuxOSFlavorName = getLinuxOSFlavorName;
exports.openUrlInBrowser = openUrlInBrowser;
exports.getEnvironmentVariable = getEnvironmentVariable;
exports.ESLintFile = ESLintFile;
exports.openNativeTerminal = openNativeTerminal;
exports.openInDefaultApp = openInDefaultApp;
exports.addDeviceLicense = addDeviceLicense;
exports.removeDeviceLicense = removeDeviceLicense;
exports.isLicensedDevice = isLicensedDevice;
exports.getDeviceID = getDeviceID;
exports.getOSUserName = getOSUserName;
exports.getSystemSettingsDir = getSystemSettingsDir;
exports._loadNodeExtensionModule = _loadNodeExtensionModule;
exports._npmInstallInFolder = _npmInstallInFolder;
exports._cancelNpmInstall = _cancelNpmInstall;
exports.cancelDownload = cancelDownload;
exports.downloadFile = downloadFile;
exports.extractZipFile = extractZipFile;
exports.setExecutableBits = setExecutableBits;
exports.execFileWithInput = execFileWithInput;
