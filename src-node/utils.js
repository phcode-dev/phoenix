const NodeConnector = require("./node-connector");
const { exec } = require('child_process');
const fs = require('fs').promises;
const path = require('path');

const UTILS_NODE_CONNECTOR = "ph_utils";
NodeConnector.createNodeConnector(UTILS_NODE_CONNECTOR, exports);

async function isDirectoryAsync(path) {
    try {
        const stat = await fs.stat(path);
        return stat.isDirectory();
    } catch (e) {
        console.error(`Error accessing path "${path}":`, e);
        return false; // Path does not exist or error occurred
    }
}

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

async function openURLInDefaultLinuxBrowser(url) {
    return new Promise((resolve, reject)=>{
        if(url.toLowerCase().startsWith("http://") || url.toLowerCase().startsWith("https://")){
            const options = { cwd: '/tmp' };
            exec(`xdg-open "${url}"`, options, (error) => {
                if (error) {
                    reject(`Error opening URL: ${error}`);
                } else {
                    resolve(`URL opened successfully: ${url}`);
                }
            });
            return;
        }
        reject("Only HTTP/S protocol is supported:" + url);
    });
}

async function xdgOpenDir(dir) {
    return new Promise((resolve, reject)=>{
        const options = { cwd: '/tmp' };
        exec(`xdg-open "${dir}"`, options, (error) => {
            if (error) {
                reject(`Error opening URL: ${error}`);
            } else {
                resolve(`path opened successfully: ${dir}`);
            }
        });
        return;
    });
}

function openWithLinuxDBUS(fileOrFolderPath) {
    return new Promise((resolve, reject)=>{
        const dbusSendCommand = `dbus-send --session ` +
            `--dest=org.freedesktop.FileManager1 ` +
            `--type=method_call ` +
            `/org/freedesktop/FileManager1 ` +
            `org.freedesktop.FileManager1.ShowItems ` +
            `array:string:"file:///${fileOrFolderPath}" string:""`;
        const options = { cwd: '/tmp' };
        exec(dbusSendCommand, options, (error, stdout, stderr) => {
            if (error) {
                reject(error);
                return;
            }
            if (stderr) {
                reject(error);
                return;
            }
            resolve();
        });
    });
}

function showInLinuxFileExplorer(fileOrFolderPath) {
    return new Promise((resolve, reject)=>{
        openWithLinuxDBUS(fileOrFolderPath)
            .then(resolve)
            .catch(async ()=>{
                // dbus error, happens with appimages deosnt deal with correct versions of dbus libs
                // try xdg open
                const isDir = await isDirectoryAsync(fileOrFolderPath);
                if(isDir){
                    xdgOpenDir(fileOrFolderPath).then(resolve).catch(reject);
                    return;
                }
                // open the parent dir if file
                const parentDir = path.dirname(fileOrFolderPath);
                xdgOpenDir(parentDir).then(resolve).catch(reject);
            });
    });
}

exports.getURLContent = getURLContent;
exports.setLocaleStrings = setLocaleStrings;
exports.openURLInDefaultLinuxBrowser = openURLInDefaultLinuxBrowser;
exports.showInLinuxFileExplorer = showInLinuxFileExplorer;
