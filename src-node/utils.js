const NodeConnector = require("./node-connector");
const { exec } = require('child_process');
const fs = require('fs');

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
        console.error(`Error reading Linux OS Name${osReleaseFile}: ${err.message}`);
        return null;
    }
}

exports.getURLContent = getURLContent;
exports.setLocaleStrings = setLocaleStrings;
exports.getPhoenixBinaryVersion = getPhoenixBinaryVersion;
exports.getLinuxOSFlavorName = getLinuxOSFlavorName;
