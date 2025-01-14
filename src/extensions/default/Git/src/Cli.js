/*globals logger, fs*/
define(function (require, exports, module) {

    const NodeConnector = brackets.getModule('NodeConnector');

    const ErrorHandler  = require("src/ErrorHandler"),
        Preferences   = require("src/Preferences"),
        Events        = require("src/Events"),
        Utils         = require("src/Utils");

    let gitTimeout        = Preferences.get("gitTimeout") * 1000,
        nextCliId         = 0,
        deferredMap       = {};

    Preferences.getExtensionPref().on("change", "gitTimeout", ()=>{
        gitTimeout = Preferences.get("gitTimeout") * 1000;
    });

    // Constants
    var MAX_COUNTER_VALUE = 4294967295; // 2^32 - 1

    let gitNodeConnector = NodeConnector.createNodeConnector("phcode-git-core", exports);
    gitNodeConnector.on(Events.GIT_PROGRESS_EVENT, (_event, evtData) => {
        const deferred = deferredMap[evtData.cliId];
        if(!deferred){
            ErrorHandler.logError("Progress sent for a non-existing process(" + evtData.cliId + "): " + evtData);
            return;
        }
        if (!deferred.isResolved && deferred.progressTracker) {
            deferred.progressTracker.trigger(Events.GIT_PROGRESS_EVENT, evtData.data);
        }
    });

    function getNextCliId() {
        if (nextCliId >= MAX_COUNTER_VALUE) {
            nextCliId = 0;
        }
        return ++nextCliId;
    }

    function normalizePathForOs(path) {
        if (brackets.platform === "win") {
            path = path.replace(/\//g, "\\");
        }
        return path;
    }

    // this functions prevents sensitive info from going further (like http passwords)
    function sanitizeOutput(str) {
        if (typeof str !== "string") {
            if (str != null) { // checks for both null & undefined
                str = str.toString();
            } else {
                str = "";
            }
        }
        return str;
    }

    function logDebug(opts, debugInfo, method, type, out) {
        if (!logger.loggingOptions.logGit) {
            return;
        }
        var processInfo = [];

        var duration = (new Date()).getTime() - debugInfo.startTime;
        processInfo.push(duration + "ms");

        if (opts.cliId) {
            processInfo.push("ID=" + opts.cliId);
        }

        var msg = "cmd-" + method + "-" + type + " (" + processInfo.join(";") + ")";
        if (out) { msg += ": \"" + out + "\""; }
        Utils.consoleDebug(msg);
    }

    function cliHandler(method, cmd, args, opts, retry) {
        const cliPromise = new Promise((resolve, reject)=>{
            const cliId     = getNextCliId();
            args = args || [];
            opts = opts || {};
            const progressTracker = opts.progressTracker;

            const savedDefer = {resolve, reject, progressTracker};
            deferredMap[cliId] = savedDefer;

            const watchProgress = !!progressTracker || (args.indexOf("--progress") !== -1);
            const startTime = (new Date()).getTime();

            // it is possible to set a custom working directory in options
            // otherwise the current project root is used to execute commands
            if (!opts.cwd) {
                opts.cwd = fs.getTauriPlatformPath(Preferences.get("currentGitRoot") || Utils.getProjectRoot());
            }

            // convert paths like c:/foo/bar to c:\foo\bar on windows
            opts.cwd = normalizePathForOs(opts.cwd);

            // log all cli communication into console when debug mode is on
            Utils.consoleDebug("cmd-" + method + (watchProgress ? "-watch" : "") + ": " +
                opts.cwd + " -> " +
                cmd + " " + args.join(" "));

            let resolved      = false,
                timeoutLength = opts.timeout ? (opts.timeout * 1000) : gitTimeout;

            const domainOpts = {
                cliId: cliId,
                watchProgress: watchProgress
            };

            const debugInfo = {
                startTime: startTime
            };

            if (watchProgress && progressTracker) {
                progressTracker.trigger(Events.GIT_PROGRESS_EVENT,
                    "Running command: git " + args.join(" "));
            }

            gitNodeConnector.execPeer(method, {directory: opts.cwd, command: cmd, args: args, opts: domainOpts})
                .catch(function (err) {
                    if (!resolved) {
                        err = sanitizeOutput(err);
                        logDebug(domainOpts, debugInfo, method, "fail", err);
                        delete deferredMap[cliId];

                        err = ErrorHandler.toError(err);

                        // spawn ENOENT error
                        var invalidCwdErr = "spawn ENOENT";
                        if (err.stack && err.stack.indexOf(invalidCwdErr)) {
                            err.message = err.message.replace(invalidCwdErr, invalidCwdErr + " (" + opts.cwd + ")");
                            err.stack = err.stack.replace(invalidCwdErr, invalidCwdErr + " (" + opts.cwd + ")");
                        }

                        // socket was closed so we should try this once again (if not already retrying)
                        if (err.stack && err.stack.indexOf("WebSocket.self._ws.onclose") !== -1 && !retry) {
                            cliHandler(method, cmd, args, opts, true)
                                .then(function (response) {
                                    savedDefer.isResolved = true;
                                    resolve(response);
                                })
                                .catch(function (err) {
                                    reject(err);
                                });
                            return;
                        }

                        reject(err);
                    }
                })
                .then(function (out) {
                    if (!resolved) {
                        out = sanitizeOutput(out);
                        logDebug(domainOpts, debugInfo, method, "out", out);
                        delete deferredMap[cliId];
                        resolve(out);
                    }
                })
                .finally(function () {
                    progressTracker && progressTracker.off(`${Events.GIT_PROGRESS_EVENT}.${cliId}`);
                    resolved = true;
                });

            function timeoutPromise() {
                logDebug(domainOpts, debugInfo, method, "timeout");
                var err = new Error("cmd-" + method + "-timeout: " + cmd + " " + args.join(" "));
                if (!opts.timeoutExpected) {
                    ErrorHandler.logError(err);
                }

                // process still lives and we need to kill it
                gitNodeConnector.execPeer("kill", domainOpts.cliId)
                    .catch(function (err) {
                        ErrorHandler.logError(err);
                    });

                delete deferredMap[cliId];
                reject(ErrorHandler.toError(err));
                resolved = true;
                progressTracker && progressTracker.off(`${Events.GIT_PROGRESS_EVENT}.${cliId}`);
            }

            var lastProgressTime = 0;
            function timeoutCall() {
                setTimeout(function () {
                    if (!resolved) {
                        if (domainOpts.watchProgress) {
                            // we are watching the promise progress
                            // so we should check if the last message was sent in more than timeout time
                            const currentTime = (new Date()).getTime();
                            const diff = currentTime - lastProgressTime;
                            if (diff > timeoutLength) {
                                Utils.consoleDebug("cmd(" + cliId + ") - last progress message was sent " + diff + "ms ago - timeout");
                                timeoutPromise();
                            } else {
                                Utils.consoleDebug("cmd(" + cliId + ") - last progress message was sent " + diff + "ms ago - delay");
                                timeoutCall();
                            }
                        } else {
                            // we don't have any custom handler, so just kill the promise here
                            // note that command WILL keep running in the background
                            // so even when timeout occurs, operation might finish after it
                            timeoutPromise();
                        }
                    }
                }, timeoutLength);
            }

            // when opts.timeout === false then never timeout the process
            if (opts.timeout !== false) {
                // if we are watching for progress events, mark the time when last progress was made
                if (domainOpts.watchProgress && progressTracker) {
                    progressTracker.off(`${Events.GIT_PROGRESS_EVENT}.${cliId}`);
                    progressTracker.on(`${Events.GIT_PROGRESS_EVENT}.${cliId}`, function () {
                        lastProgressTime = (new Date()).getTime();
                    });
                }
                // call the method which will timeout the promise after a certain period of time
                timeoutCall();
            }
        });
        return cliPromise;
    }

    function which(cmd) {
        return cliHandler("which", cmd);
    }

    function spawnCommand(cmd, args, opts) {
        return cliHandler("spawn", cmd, args, opts);
    }

    // Public API
    exports.cliHandler      = cliHandler;
    exports.which           = which;
    exports.spawnCommand    = spawnCommand;
});
