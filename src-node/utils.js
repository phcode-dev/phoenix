const NodeConnector = require("./node-connector");
const { exec, execFile } = require('child_process');
const fs = require('fs');
const fsPromise = require('fs').promises;
const path = require('path');
const os = require('os');
const sudo = require('@expo/sudo-prompt');
const {lintFile} = require("./ESLint/service");
let openModule, open; // dynamic import when needed

const options = { name: 'Phoenix Code' };
const licenseFileContent = JSON.stringify({});

async function _importOpen() {
    if(open){
        return open;
    }
    openModule = await import('open');
    open = openModule.default;
}

const UTILS_NODE_CONNECTOR = "ph_utils";
NodeConnector.createNodeConnector(UTILS_NODE_CONNECTOR, exports);

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

/**
 * Installs npm modules in the specified folder.
 *
 * @param {string} moduleNativeDir - The directory where the npm modules will be installed.
 * @return {Promise<void>} - A Promise that resolves with no value when the installation is complete.
 * @private
 */
async function _npmInstallInFolder({moduleNativeDir}) {
    const phnodeExePath = process.argv[0];
    const npmPath = path.resolve(path.dirname(require.resolve("npm")), "bin", "npm-cli.js");
    console.log("npm path", npmPath, "phnode path", phnodeExePath);
    // Check if the package.json file exists in the moduleNativeDir
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
    return new Promise((resolve, reject) => {
        console.log(`Running "${phnodeExePath} ${nodeArgs}" in ${moduleNativeDir}`);
        execFile(phnodeExePath, nodeArgs, { cwd: moduleNativeDir }, (error) => {
            if (error) {
                console.error('Error:', error);
                reject(error);
            } else {
                resolve();
                console.log(`Successfully ran "${nodeArgs}" in ${moduleNativeDir}`);
            }
        });
    });
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

function getLicensePath() {
    switch (os.platform()) {
    case 'win32':
        return 'C:\\Program Files\\Phoenix Code Control\\device-license';
    case 'darwin':
        return '/Library/Application Support/phoenix-code-control/device-license';
    case 'linux':
        return '/etc/phoenix-code-control/device-license';
    default:
        throw new Error(`Unsupported platform: ${os.platform()}`);
    }
}

function sudoExec(command) {
    return new Promise((resolve, reject) => {
        sudo.exec(command, options, (error, stdout, stderr) => {
            if (error) {
                return reject(error);
            }
            resolve({ stdout, stderr });
        });
    });
}

function readFileUtf8(p) {
    return new Promise((resolve, reject) => {
        fs.readFile(p, 'utf8', (err, data) => (err ? reject(err) : resolve(data)));
    });
}

/**
 * Writes the license file in a world-readable location.
 * Works on Windows, macOS, and Linux.
 */
async function addDeviceLicense() {
    const targetPath = getLicensePath();
    let command;
    // we should not store any sensitive information in this file as this is world readable. we use the
    // device id itself as license key for that machine. the device id is not associated with any cloud credits
    // and all entitlements are local to device only for this threat model to work. So stolen device IDs doesn't
    // have any meaning.

    if (os.platform() === 'win32') {
        // Windows: write file and explicitly grant Everyone read rights
        const dir = 'C:\\Program Files\\Phoenix Code Control';
        command =
            `powershell -Command "` +
            `New-Item -ItemType Directory -Force '${dir}' | Out-Null; ` +
            `Set-Content -Path '${targetPath}' -Value '${licenseFileContent}' -Encoding UTF8; ` +
            `icacls '${targetPath}' /inheritance:e /grant *S-1-1-0:RX | Out-Null"`;
    } else {
        // macOS / Linux: mkdir + write + chmod 0644 (world-readable, owner-writable)
        const dir = path.dirname(targetPath);
        command =
            `/bin/mkdir -p "${dir}"` +
            ` && printf '%s' '${licenseFileContent}' > "${targetPath}"` +
            ` && /bin/chmod 0644 "${targetPath}"`;
    }

    await sudoExec(command);
    return targetPath;
}

async function removeDeviceLicense() {
    const targetPath = getLicensePath();
    let command;

    if (os.platform() === 'win32') {
        command = `powershell -Command "if (Test-Path '${targetPath}') { Remove-Item -Path '${targetPath}' -Force }"`;
    } else {
        command = `/bin/rm -f "${targetPath}"`;
    }

    await sudoExec(command);
    return targetPath;
}

async function isLicensedDevice() {
    const targetPath = getLicensePath();
    try {
        const data = await readFileUtf8(targetPath);
        JSON.parse(data);
        return true; // currently, the existence of the file itself is flag. in future, we may choose to add more.
    } catch {
        // file missing, unreadable, or invalid JSON
        return false;
    }
}

async function _getLinuxDeviceID() {
    const data = await fsPromise.readFile("/etc/machine-id", "utf8");
    const id = data.trim();
    return id || null;
    // throw on error to main.
    // no fallback, /var/lib/dbus/machine-id may need sudo in some machines
}

/**
 * Get the macOS device ID (IOPlatformUUID).
 * @returns {Promise<string|null>}
 */
function _getMacDeviceID() {
    // to read this in mac bash, do:
    // #!/bin/bash
    // device_id=$(ioreg -rd1 -c IOPlatformExpertDevice | awk -F\" '/IOPlatformUUID/ {print $4}' | tr -d '[:space:]')
    // echo "$device_id"
    return new Promise((resolve, reject) => {
        exec(
            'ioreg -rd1 -c IOPlatformExpertDevice | grep IOPlatformUUID',
            { encoding: 'utf8' },
            (err, stdout) => {
                if (err) {
                    console.error('Failed to get Mac device ID:', err.message);
                    return reject(err);
                }

                const match = stdout.match(/"IOPlatformUUID" = "([^"]+)"/);
                if (match && match[1]) {
                    resolve(match[1]);
                } else {
                    resolve(null);
                }
            }
        );
    });
}

/**
 * Get the Windows device ID (MachineGuid).
 * @returns {Promise<string|null>}
 *
 * In a Windows batch file, you can get this with:
 *   reg query HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Cryptography /v MachineGuid
 */
function _getWindowsDeviceID() {
    return new Promise((resolve, reject) => {
        exec(
            'reg query HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Cryptography /v MachineGuid',
            { encoding: 'utf8' },
            (err, stdout) => {
                if (err) {
                    console.error('Failed to get Windows device ID:', err.message);
                    return reject(err);
                }

                // Example output:
                // HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Cryptography
                //     MachineGuid    REG_SZ    4c4c4544-0034-5a10-8051-cac04f305a31
                const match = stdout.match(/MachineGuid\s+REG_[A-Z]+\s+([a-fA-F0-9-]+)/);
                if (match && match[1]) {
                    resolve(match[1].trim());
                } else {
                    resolve(null);
                }
            }
        );
    });
}

async function getDeviceID() {
    if (process.platform === "linux") {
        return _getLinuxDeviceID();
    } else if (process.platform === "darwin") {
        return _getMacDeviceID();
    } else if (process.platform === "win32") {
        return _getWindowsDeviceID();
    }
    throw new Error(`Unsupported platform: ${process.platform}`);
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
exports._loadNodeExtensionModule = _loadNodeExtensionModule;
exports._npmInstallInFolder = _npmInstallInFolder;
