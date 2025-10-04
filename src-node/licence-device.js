const os = require('os');
const sudo = require('@expo/sudo-prompt');
const fs = require('fs');
const fsPromise = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { SYSTEM_SETTINGS_DIR_WIN, SYSTEM_SETTINGS_DIR_MAC, SYSTEM_SETTINGS_DIR_LINUX } = require('./constants');

const options = { name: 'Phoenix Code' };
const licenseFileContent = JSON.stringify({});

function getLicensePath() {
    switch (os.platform()) {
    case 'win32':
        return `${SYSTEM_SETTINGS_DIR_WIN}device-license`;
    case 'darwin':
        return `${SYSTEM_SETTINGS_DIR_MAC}device-license`;
    case 'linux':
        return `${SYSTEM_SETTINGS_DIR_LINUX}device-license`;
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
        JSON.parse(data.trim());
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

exports.addDeviceLicense = addDeviceLicense;
exports.removeDeviceLicense = removeDeviceLicense;
exports.isLicensedDevice = isLicensedDevice;
exports.getDeviceID = getDeviceID;
