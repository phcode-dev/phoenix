const NodeConnector = require("./node-connector");
const { exec, execFile } = require('child_process');
const fs = require('fs');
const fsPromise = require('fs').promises;
const path = require('path');
const os = require('os');
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
