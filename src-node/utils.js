const NodeConnector = require("./node-connector");
const { exec, execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
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
    fs.accessSync(packageJsonPath); // this will throw if package.json doesnt exist

    // Check if package-lock.json exists in the moduleNativeDir
    const packageLockJsonPath = path.join(moduleNativeDir, 'package-lock.json');
    let packageLockJsonExists = false;
    try {
        fs.accessSync(packageLockJsonPath);
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

exports.getURLContent = getURLContent;
exports.setLocaleStrings = setLocaleStrings;
exports.getPhoenixBinaryVersion = getPhoenixBinaryVersion;
exports.getLinuxOSFlavorName = getLinuxOSFlavorName;
exports.openUrlInBrowser = openUrlInBrowser;
exports._loadNodeExtensionModule = _loadNodeExtensionModule;
exports._npmInstallInFolder = _npmInstallInFolder;
