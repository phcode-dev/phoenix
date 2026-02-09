var exec  = require("child_process").exec,
    fs    = require("fs"),
    Path  = require("path"),
    which = require("which");

var isWin = /^win/.test(process.platform);
var isMac = process.platform === "darwin";
var noop = function () {};

// Cache for xcode-select CLT check (null = not yet checked)
var _xcodeCliToolsInstalled = null;

function _isXcodeCliToolsInstalled(callback) {
    if (_xcodeCliToolsInstalled !== null) {
        return callback(_xcodeCliToolsInstalled);
    }
    exec("xcode-select -p", function (err) {
        _xcodeCliToolsInstalled = !err;
        callback(_xcodeCliToolsInstalled);
    });
}

function fixEOL(str) {
    if (str[str.length - 1] === "\n") {
        str = str.slice(0, -1);
    }
    return str;
}

function findChildren(arr, pid) {
    var result = [];
    arr.forEach(function (obj) {
        if (obj.parentprocessid == pid) {
            // add children pid first
            result = result.concat(findChildren(arr, obj.processid));
            result.push(obj.processid);
        }
    });
    return result;
}

function killSingleProcess(pid, callback) {
    callback = callback || noop;
    pid = pid.toString();

    if (isWin) {
        // "taskkill /F /PID 827"
        exec("taskkill /F /PID " + pid, function (err, stdout, stderr) {
            callback(err ? fixEOL(stderr) : undefined, err ? undefined : fixEOL(stdout));
        });
    } else {
        // "kill -9 2563"
        exec("kill -9 " + pid, function (err, stdout, stderr) {
            callback(err ? fixEOL(stderr) : undefined, err ? undefined : fixEOL(stdout));
        });
    }
}

function getChildrenOfPid(pid, callback) {
    callback = callback || noop;
    pid = pid.toString();

    if (isWin) {
        exec("wmic process get parentprocessid,processid", function (err, stdout, stderr) {
            if (err) {
                return callback(fixEOL(stderr));
            }
            stdout = fixEOL(stdout);

            var map = stdout.split("\n").map(function (line) {
                var parts = line.trim().split(/\s+/);
                var o = {};
                o.processid = parts.pop();
                o.parentprocessid = parts.pop();
                return o;
            });

            callback(null, findChildren(map, pid));
        });
    } else {
        exec("ps -A -o ppid,pid", function (err, stdout, stderr) {
            if (err) {
                return callback(fixEOL(stderr));
            }
            stdout = fixEOL(stdout);

            var map = stdout.split("\n").map(function (line) {
                var parts = line.trim().split(/\s+/);
                var o = {};
                o.processid = parts.pop();
                o.parentprocessid = parts.pop();
                return o;
            });

            callback(null, findChildren(map, pid));
        });
    }
}

function executableExists(filename, dir, callback) {
    if (typeof dir === "function") {
        callback = dir;
        dir = "";
    }

    which(filename, function (err, path) {
        if (err) {
            return callback(err, false);
        }

        path = Path.normalize(path);

        fs.stat(path, function (err, stats) {
            if (err) {
                return callback(err, false);
            }

            var exists = stats.isFile();
            if (!exists) { path = undefined; }

            // On macOS, /usr/bin/git is a shim that triggers an "Install Xcode CLT" dialog
            // when spawned if CLT is not installed. Check for CLT before allowing it.
            if (exists && isMac && Path.normalize(path) === "/usr/bin/git") {
                return _isXcodeCliToolsInstalled(function (installed) {
                    if (!installed) {
                        return callback(null, false, undefined);
                    }
                    return callback(null, true, path);
                });
            }

            return callback(null, exists, path);
        });
    });
}

exports.getChildrenOfPid = getChildrenOfPid;
exports.killSingleProcess = killSingleProcess;
exports.executableExists = executableExists;
