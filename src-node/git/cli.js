const gitNodeConnector = global.createNodeConnector("phcode-git-core", exports);

const GIT_PROGRESS_EVENT = "git_progress";

let ChildProcess  = require("child_process"),
    crossSpawn    = require('cross-spawn'),
    ProcessUtils  = require("./processUtils"),
    processMap    = {},
    resolvedPaths = {};

function fixEOL(str) {
    if (str[str.length - 1] === "\n") {
        str = str.slice(0, -1);
    }
    return str;
}

// handler with ChildProcess.exec
// this won't handle cases where process outputs a large string
function execute(directory, command, args, opts, callback) {
    // execute commands have to be escaped, spawn does this automatically and will fail if cmd is escaped
    if (command[0] !== "\"" || command[command.length - 1] !== "\"") {
        command = "\"" + command + "\"";
    }
    // http://nodejs.org/api/child_process.html#child_process_child_process_exec_command_options_callback
    const toExec = command + " " + args.join(" ");
    processMap[opts.cliId] = ChildProcess.exec(toExec, {
        cwd: directory,
        maxBuffer: 20 * 1024 * 1024
    }, function (err, stdout, stderr) {
        delete processMap[opts.cliId];
        callback(err ? fixEOL(stderr) : undefined, err ? undefined : fixEOL(stdout));
    });
}

// handler with cross-spawn
function join(arr) {
    let result, index = 0, length;
    length = arr.reduce(function (l, b) {
        return l + b.length;
    }, 0);
    result = new Buffer(length);
    arr.forEach(function (b) {
        b.copy(result, index);
        index += b.length;
    });
    return fixEOL(result.toString("utf8"));
}

function spawn(directory, command, args, opts, callback) {
    // https://github.com/creationix/node-git
    const child = crossSpawn(command, args, {
        cwd: directory
    });
    child.on("error", function (err) {
        callback(err.stack, undefined);
    });

    processMap[opts.cliId] = child;

    let exitCode, stdout = [], stderr = [];
    child.stdout.addListener("data", function (text) {
        stdout[stdout.length] = text;
    });
    child.stderr.addListener("data", function (text) {
        // Git writes its informational messages (such as Successfully rebased
        // and updated) to stderr. This behavior is intentional because Git uses
        // stderr for all output that is not a direct result of the command (e.g.,
        // status updates, progress, or errors).
        if (opts.watchProgress) {
            gitNodeConnector.triggerPeer(GIT_PROGRESS_EVENT, {
                cliId: opts.cliId,
                time: (new Date()).getTime(),
                data: fixEOL(text.toString("utf8"))
            });
        }
        stderr[stderr.length] = text;
    });
    child.addListener("exit", function (code) {
        exitCode = code;
    });
    child.addListener("close", function () {
        delete processMap[opts.cliId];
        callback(exitCode > 0 ? join(stderr) : undefined,
            exitCode > 0 ? undefined : join(stdout));
    });
    child.stdin.end();
}

function doIfExists(method, directory, command, args, opts, callback) {
    // do not call executableExists if we already know it exists
    if (resolvedPaths[command]) {
        return method(directory, resolvedPaths[command], args, opts, callback);
    }

    ProcessUtils.executableExists(command, function (err, exists, resolvedPath) {
        if (exists) {
            resolvedPaths[command] = resolvedPath;
            return method(directory, resolvedPath, args, opts, callback);
        } else {
            callback("ProcessUtils can't resolve the path requested: " + command);
        }
    });
}

function executeIfExists({directory, command, args, opts}) {
    return new Promise(function (resolve, reject) {
        doIfExists(execute, directory, command, args, opts, (err, stdout)=>{
            if(err){
                reject(err);
            } else {
                resolve(stdout);
            }
        });
    });
}

function spawnIfExists({directory, command, args, opts}) {
    return new Promise(function (resolve, reject) {
        doIfExists(spawn, directory, command, args, opts, (err, stdout)=>{
            if(err){
                reject(err);
            } else {
                resolve(stdout);
            }
        });
    });
}

function kill(cliId) {
    return new Promise(function (resolve, reject) {
        const process = processMap[cliId];
        if (!process) {
            reject("Couldn't find process to kill with ID:" + cliId);
        }
        delete processMap[cliId];
        resolve(""); // at this point we resolve anyways as we cant do anything after deleting the object
        ProcessUtils.getChildrenOfPid(process.pid, function (err, children) {
            // kill also parent process
            children.push(process.pid);
            children.forEach(function (pid) {
                ProcessUtils.killSingleProcess(pid);
            });
        });
    });
}

function which({command}) {
    return new Promise(function (resolve, reject) {
        ProcessUtils.executableExists(command, function (err, exists, resolvedPath) {
            if (exists) {
                resolve(resolvedPath);
            } else {
                reject("ProcessUtils can't resolve the path requested: " + command);
            }
        });
    });
}

exports.execute = executeIfExists;
exports.spawn = spawnIfExists;
exports.kill = kill;
exports.which = which;
