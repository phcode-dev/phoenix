const os = require('os');

exports.SYSTEM_SETTINGS_DIR_WIN = 'C:\\Program Files\\Phoenix Code Control\\';
exports.SYSTEM_SETTINGS_DIR_MAC = '/Library/Application Support/phoenix-code-control/';
exports.SYSTEM_SETTINGS_DIR_LINUX = '/etc/phoenix-code-control/';

switch (os.platform()) {
case 'win32':
    exports.SYSTEM_SETTINGS_DIR = exports.SYSTEM_SETTINGS_DIR_WIN; break;
case 'darwin':
    exports.SYSTEM_SETTINGS_DIR = exports.SYSTEM_SETTINGS_DIR_MAC; break;
case 'linux':
    exports.SYSTEM_SETTINGS_DIR = exports.SYSTEM_SETTINGS_DIR_LINUX; break;
default:
    throw new Error(`Unsupported platform: ${os.platform()}`);
}
