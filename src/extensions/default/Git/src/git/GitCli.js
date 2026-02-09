/*globals jsPromise, fs*/

/*
    This module is used to communicate with Git through Cli
    Output string from Git should always be parsed here
    to provide more sensible outputs than just plain strings.
    Format of the output should be specified in Git.js
*/
define(function (require, exports) {

    // Brackets modules
    const _           = brackets.getModule("thirdparty/lodash"),
        FileSystem  = brackets.getModule("filesystem/FileSystem"),
        Strings     = brackets.getModule("strings"),
        FileUtils   = brackets.getModule("file/FileUtils");

    // Local modules
    const Cli           = require("src/Cli"),
        ErrorHandler  = require("src/ErrorHandler"),
        Events        = require("src/Events"),
        EventEmitter  = require("src/EventEmitter"),
        ExpectedError = require("src/ExpectedError"),
        Preferences   = require("src/Preferences"),
        Utils         = require("src/Utils");

    // Module variables
    let _gitPath = null,
        _gitQueue = [],
        _gitQueueBusy = false,
        lastGitStatusResults;

    var FILE_STATUS = {
        STAGED: "STAGED",
        UNMODIFIED: "UNMODIFIED",
        IGNORED: "IGNORED",
        UNTRACKED: "UNTRACKED",
        MODIFIED: "MODIFIED",
        ADDED: "ADDED",
        DELETED: "DELETED",
        RENAMED: "RENAMED",
        COPIED: "COPIED",
        UNMERGED: "UNMERGED"
    };

    // This SHA1 represents the empty tree. You get it using `git mktree < /dev/null`
    var EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

    // Implementation
    function getGitPath() {
        if (_gitPath) { return _gitPath; }
        _gitPath = Preferences.get("gitPath");
        return _gitPath;
    }

    Preferences.getExtensionPref().on("change", "gitPath", ()=>{
        _gitPath = Preferences.get("gitPath");
    });

    function setGitPath(path) {
        if (path === true) { path = "git"; }
        Preferences.set("gitPath", path);
        _gitPath = path;
    }

    function strEndsWith(subjectString, searchString, position) {
        if (position === undefined || position > subjectString.length) {
            position = subjectString.length;
        }
        position -= searchString.length;
        var lastIndex = subjectString.indexOf(searchString, position);
        return lastIndex !== -1 && lastIndex === position;
    }

    /*
    function fixCygwinPath(path) {
        if (typeof path === "string" && brackets.platform === "win" && path.indexOf("/cygdrive/") === 0) {
            path = path.substring("/cygdrive/".length)
                       .replace(/^([a-z]+)\//, function (a, b) {
                           return b.toUpperCase() + ":/";
                       });
        }
        return path;
    }
    */

    function _processQueue() {
        // do nothing if the queue is busy
        if (_gitQueueBusy) {
            return;
        }
        // do nothing if the queue is empty
        if (_gitQueue.length === 0) {
            _gitQueueBusy = false;
            return;
        }
        // get item from queue
        const item  = _gitQueue.shift(),
            resolve = item[0],
            reject = item[1],
            args  = item[2],
            opts  = item[3];
        // execute git command in a queue so no two commands are running at the same time
        if (opts.nonblocking !== true) { _gitQueueBusy = true; }
        Cli.spawnCommand(getGitPath(), args, opts)
            .then(function (r) {
                resolve(r);
            })
            .catch(function (e) {
                const call = "call: git " + args.join(" ");
                e.stack = [call, e.stack].join("\n");
                reject(e);
            })
            .finally(function () {
                if (opts.nonblocking !== true) { _gitQueueBusy = false; }
                _processQueue();
            });
    }

    function git(args, opts) {
        return new Promise((resolve, reject) => {
            _gitQueue.push([resolve, reject, args || [], opts || {}]);
            setTimeout(_processQueue);
        });
    }

    /*
        git branch
        -d --delete Delete a branch.
        -D Delete a branch irrespective of its merged status.
        --no-color Turn off branch colors
        -r --remotes List or delete (if used with -d) the remote-tracking branches.
        -a --all List both remote-tracking branches and local branches.
        --track When creating a new branch, set up branch.<name>.remote and branch.<name>.merge
        --set-upstream If specified branch does not exist yet or if --force has been given, acts exactly like --track
    */

    function setUpstreamBranch(remoteName, remoteBranch, progressTracker) {
        if (!remoteName) { throw new TypeError("remoteName argument is missing!"); }
        if (!remoteBranch) { throw new TypeError("remoteBranch argument is missing!"); }
        return git(["branch", "--no-color", "-u", remoteName + "/" + remoteBranch],
            {progressTracker});
    }

    function branchDelete(branchName, progressTracker) {
        return git(["branch", "--no-color", "-d", branchName], {progressTracker});
    }

    function forceBranchDelete(branchName, progressTracker) {
        return git(["branch", "--no-color", "-D", branchName], {progressTracker});
    }

    function getBranches(moreArgs, progressTracker) {
        var args = ["branch", "--no-color"];
        if (moreArgs) { args = args.concat(moreArgs); }

        return git(args, {progressTracker}).then(function (stdout) {
            if (!stdout) { return []; }
            return stdout.split("\n").reduce(function (arr, l) {
                var name = l.trim(),
                    currentBranch = false,
                    remote = null,
                    sortPrefix = "";

                if (name.indexOf("->") !== -1) {
                    return arr;
                }

                if (name.indexOf("* ") === 0) {
                    name = name.substring(2);
                    currentBranch = true;
                }

                if (name.indexOf("remotes/") === 0) {
                    name = name.substring("remotes/".length);
                    remote = name.substring(0, name.indexOf("/"));
                }

                var sortName = name.toLowerCase();
                if (remote) {
                    sortName = sortName.substring(remote.length + 1);
                }
                if (sortName.indexOf("#") !== -1) {
                    sortPrefix = sortName.slice(0, sortName.indexOf("#"));
                }

                arr.push({
                    name: name,
                    sortPrefix: sortPrefix,
                    sortName: sortName,
                    currentBranch: currentBranch,
                    remote: remote
                });
                return arr;
            }, []);
        });
    }

    function getAllBranches(progressTracker) {
        return getBranches(["-a"], progressTracker);
    }

    /*
        git fetch
        --all Fetch all remotes.
        --dry-run Show what would be done, without making any changes.
        --multiple Allow several <repository> and <group> arguments to be specified. No <refspec>s may be specified.
        --prune After fetching, remove any remote-tracking references that no longer exist on the remote.
        --progress This flag forces progress status even if the standard error stream is not directed to a terminal.
    */

    function repositoryNotFoundHandler(err) {
        var m = ErrorHandler.matches(err, /Repository (.*) not found$/gim);
        if (m) {
            throw new ExpectedError(m[0]);
        }
        throw err;
    }

    function fetchRemote(remote, progressTracker) {
        return git(["fetch", "--progress", remote], {
            progressTracker,
            timeout: false // never timeout this
        }).catch(repositoryNotFoundHandler);
    }

    function fetchAllRemotes(progressTracker) {
        return git(["fetch", "--progress", "--all"], {
            progressTracker,
            timeout: false // never timeout this
        }).catch(repositoryNotFoundHandler);
    }

    /*
        git remote
        add Adds a remote named <name> for the repository at <url>.
        rename Rename the remote named <old> to <new>.
        remove Remove the remote named <name>.
        show Gives some information about the remote <name>.
        prune Deletes all stale remote-tracking branches under <name>.

    */

    function getRemotes() {
        return git(["remote", "-v"])
            .then(function (stdout) {
                return !stdout ? [] : _.uniq(stdout.replace(/\((push|fetch)\)/g, "").split("\n")).map(function (l) {
                    var s = l.trim().split("\t");
                    return {
                        name: s[0],
                        url: s[1]
                    };
                });
            });
    }

    function createRemote(name, url) {
        return git(["remote", "add", name, url])
            .then(function () {
                // stdout is empty so just return success
                return true;
            });
    }

    function deleteRemote(name) {
        return git(["remote", "rm", name])
            .then(function () {
                // stdout is empty so just return success
                return true;
            });
    }

    /*
        git pull
        --no-commit Do not commit result after merge
        --ff-only Refuse to merge and exit with a non-zero status
                  unless the current HEAD is already up-to-date
                  or the merge can be resolved as a fast-forward.
    */

    /**
     *
     * @param remote
     * @param branch
     * @param {boolean} [ffOnly]
     * @param {boolean} [noCommit]
     * @param {object} [options]
     * @param [options.progressTracker]
     * @returns {Promise<unknown>}
     */
    function mergeRemote(remote, branch, ffOnly, noCommit, options = {}) {
        var args = ["merge"];

        if (ffOnly) { args.push("--ff-only"); }
        if (noCommit) { args.push("--no-commit", "--no-ff"); }

        args.push(remote + "/" + branch);

        var readMergeMessage = function () {
            return Utils.loadPathContent(Preferences.get("currentGitRoot") + "/.git/MERGE_MSG").then(function (msg) {
                return msg;
            });
        };

        return git(args, {progressTracker: options.progressTracker})
            .then(function (stdout) {
                // return stdout if available - usually not
                if (stdout) { return stdout; }

                return readMergeMessage().then(function (msg) {
                    if (msg) { return msg; }
                    return "Remote branch " + branch + " from " + remote + " was merged to current branch";
                });
            })
            .catch(function (error) {
                return readMergeMessage().then(function (msg) {
                    if (msg) { return msg; }
                    throw error;
                });
            });
    }

    function rebaseRemote(remote, branch, progressTracker) {
        return git(["rebase", remote + "/" + branch], {progressTracker});
    }

    function resetRemote(remote, branch, progressTracker) {
        return git(["reset", "--soft", remote + "/" + branch], {progressTracker}).then(function (stdout) {
            return stdout || "Current branch was resetted to branch " + branch + " from " + remote;
        });
    }

    function mergeBranch(branchName, mergeMessage, useNoff) {
        var args = ["merge"];
        if (useNoff) { args.push("--no-ff"); }
        if (mergeMessage && mergeMessage.trim()) { args.push("-m", mergeMessage); }
        args.push(branchName);
        return git(args);
    }

    /*
        git push
        --porcelain Produce machine-readable output.
        --delete All listed refs are deleted from the remote repository. This is the same as prefixing all refs with a colon.
        --force Usually, the command refuses to update a remote ref that is not an ancestor of the local ref used to overwrite it.
        --set-upstream For every branch that is up to date or successfully pushed, add upstream (tracking) reference
        --progress This flag forces progress status even if the standard error stream is not directed to a terminal.
    */

    /*
        returns parsed push response in this format:
        {
            flag: "="
            flagDescription: "Ref was up to date and did not need pushing"
            from: "refs/heads/rewrite-remotes"
            remoteUrl: "http://github.com/zaggino/brackets-git.git"
            status: "Done"
            summary: "[up to date]"
            to: "refs/heads/rewrite-remotes"
        }
    */
    function push(remoteName, remoteBranch, additionalArgs, progressTracker) {
        if (!remoteName) { throw new TypeError("remoteName argument is missing!"); }

        var args = ["push", "--porcelain", "--progress"];
        if (Array.isArray(additionalArgs)) {
            args = args.concat(additionalArgs);
        }
        args.push(remoteName);

        if (remoteBranch && Preferences.get("gerritPushref")) {
            return getConfig("gerrit.pushref").then(function (strGerritEnabled) {
                if (strGerritEnabled === "true") {
                    args.push("HEAD:refs/for/" + remoteBranch);
                } else {
                    args.push(remoteBranch);
                }
                return doPushWithArgs(args, progressTracker);
            });
        }

        if (remoteBranch) {
            args.push(remoteBranch);
        }

        return doPushWithArgs(args, progressTracker);
    }

    function doPushWithArgs(args, progressTracker) {
        return git(args, {progressTracker})
            .catch(repositoryNotFoundHandler)
            .then(function (stdout) {
                // this should clear lines from push hooks
                var lines = stdout.split("\n");
                while (lines.length > 0 && lines[0].match(/^To/) === null) {
                    lines.shift();
                }

                var retObj = {},
                    lineTwo = lines[1].split("\t");

                retObj.remoteUrl = lines[0].trim().split(" ")[1];
                retObj.flag = lineTwo[0];
                retObj.from = lineTwo[1].split(":")[0];
                retObj.to = lineTwo[1].split(":")[1];
                retObj.summary = lineTwo[2];
                retObj.status = lines[2];

                switch (retObj.flag) {
                    case " ":
                        retObj.flagDescription = Strings.GIT_PUSH_SUCCESS_MSG;
                        break;
                    case "+":
                        retObj.flagDescription = Strings.GIT_PUSH_FORCE_UPDATED_MSG;
                        break;
                    case "-":
                        retObj.flagDescription = Strings.GIT_PUSH_DELETED_MSG;
                        break;
                    case "*":
                        retObj.flagDescription = Strings.GIT_PUSH_NEW_REF_MSG;
                        break;
                    case "!":
                        retObj.flagDescription = Strings.GIT_PUSH_REJECTED_MSG;
                        break;
                    case "=":
                        retObj.flagDescription = Strings.GIT_PUSH_UP_TO_DATE_MSG;
                        break;
                    default:
                        retObj.flagDescription = "Unknown push flag received: " + retObj.flag; // internal error not translated
                }

                return retObj;
            });
    }

    function getCurrentBranchName() {
        return git(["branch", "--no-color"]).then(function (stdout) {
            var branchName = _.find(stdout.split("\n"), function (l) { return l[0] === "*"; });
            if (branchName) {
                branchName = branchName.substring(1).trim();

                var m = branchName.match(/^\(.*\s(\S+)\)$/); // like (detached from f74acd4)
                if (m) { return m[1]; }

                return branchName;
            }

            // no branch situation so we need to create one by doing a commit
            if (stdout.match(/^\s*$/)) {
                EventEmitter.emit(Events.GIT_NO_BRANCH_EXISTS);
                // master is the default name of the branch after git init
                return "master";
            }

            // alternative
            return git(["log", "--pretty=format:%H %d", "-1"]).then(function (stdout) {
                var m = stdout.trim().match(/^(\S+)\s+\((.*)\)$/);
                var hash = m[1].substring(0, 20);
                m[2].split(",").forEach(function (info) {
                    info = info.trim();

                    if (info === "HEAD") { return; }

                    var m = info.match(/^tag:(.+)$/);
                    if (m) {
                        hash = m[1].trim();
                        return;
                    }

                    hash = info;
                });
                return hash;
            });
        });
    }

    function getCurrentUpstreamBranch() {
        return git(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"])
            .catch(function () {
                return null;
            });
    }

    // Get list of deleted files between two branches
    function getDeletedFiles(oldBranch, newBranch) {
        return git(["diff", "--no-ext-diff", "--name-status", oldBranch + ".." + newBranch])
            .then(function (stdout) {
                var regex = /^D/;
                return stdout.split("\n").reduce(function (arr, row) {
                    if (regex.test(row)) {
                        arr.push(row.substring(1).trim());
                    }
                    return arr;
                }, []);
            });
    }

    function getConfig(key) {
        return git(["config", key.replace(/\s/g, "")]);
    }

    function setConfig(key, value, allowGlobal) {
        key = key.replace(/\s/g, "");
        return git(["config", key, value]).catch(function (err) {

            if (allowGlobal && ErrorHandler.contains(err, "No such file or directory")) {
                return git(["config", "--global", key, value]);
            }

            throw err;

        });
    }

    function getHistory(branch, skipCommits, file) {
        var separator = "_._",
            newline   = "_.nw._",
            format = [
                "%h",  // abbreviated commit hash
                "%H",  // commit hash
                "%an", // author name
                "%aI", // author date, ISO 8601 format
                "%ae", // author email
                "%s",  // subject
                "%b",  // body
                "%d"   // tags
            ].join(separator) + newline;

        var args = ["log", "-100", "--date=iso"];
        if (skipCommits) { args.push("--skip=" + skipCommits); }
        args.push("--format=" + format, branch, "--");

        // follow is too buggy - do not use
        // if (file) { args.push("--follow"); }
        if (file) { args.push(file); }

        return git(args).then(function (stdout) {
            stdout = stdout.substring(0, stdout.length - newline.length);
            return !stdout ? [] : stdout.split(newline).map(function (line) {

                var data = line.trim().split(separator),
                    commit = {};

                commit.hashShort  = data[0];
                commit.hash       = data[1];
                commit.author     = data[2];
                commit.date       = data[3];
                commit.email      = data[4];
                commit.subject    = data[5];
                commit.body       = data[6];

                if (data[7]) {
                    var tags = data[7];
                    var regex = new RegExp("tag: ([^,|\)]+)", "g");
                    tags = tags.match(regex);

                    for (var key in tags) {
                        if (tags[key] && tags[key].replace) {
                            tags[key] = tags[key].replace("tag:", "");
                        }
                    }
                    commit.tags = tags;
                }

                return commit;

            });
        });
    }

    function init() {
        return git(["init"]);
    }

    function clone(remoteGitUrl, destinationFolder, progressTracker) {
        return git(["clone", remoteGitUrl, destinationFolder, "--progress"], {
            progressTracker,
            timeout: false // never timeout this
        });
    }

    function stage(fileOrFiles, updateIndex) {
        var args = ["add"];
        if (updateIndex) { args.push("-u"); }
        return git(args.concat("--", fileOrFiles));
    }

    function stageAll() {
        return git(["add", "--all"]);
    }

    function commit(message, amend, noVerify, progressTracker) {
        var lines = message.split("\n"),
            args = ["commit"];

        if (amend) {
            args.push("--amend", "--reset-author");
        }

        if (noVerify) {
            args.push("--no-verify");
        }

        if (lines.length === 1) {
            args.push("-m", message);
            return git(args, {progressTracker});
        } else {
            return new Promise(function (resolve, reject) {
                // FUTURE: maybe use git commit --file=-
                var fileEntry = FileSystem.getFileForPath(Preferences.get("currentGitRoot") + ".phoenixGitTemp");
                jsPromise(FileUtils.writeText(fileEntry, message))
                    .then(function () {
                        args.push("-F", ".phoenixGitTemp");
                        return git(args, {progressTracker});
                    })
                    .then(function (res) {
                        fileEntry.unlink(function () {
                            resolve(res);
                        });
                    })
                    .catch(function (err) {
                        fileEntry.unlink(function () {
                            reject(err);
                        });
                    });
            });
        }
    }

    function reset(type, hash) {
        var args = ["reset", type || "--mixed"]; // mixed is the default action
        if (hash) { args.push(hash, "--"); }
        return git(args);
    }

    function unstage(file) {
        return git(["reset", "--", file]);
    }

    function checkout(hash) {
        return git(["checkout", hash], {
            timeout: false // never timeout this
        });
    }

    function createBranch(branchName, originBranch, trackOrigin) {
        var args = ["checkout", "-b", branchName];

        if (originBranch) {
            if (trackOrigin) {
                args.push("--track");
            }
            args.push(originBranch);
        }

        return git(args);
    }

    function _isquoted(str) {
        return str[0] === "\"" && str[str.length - 1] === "\"";
    }

    function _unquote(str) {
        return str.substring(1, str.length - 1);
    }

    function _isescaped(str) {
        return /\\[0-9]{3}/.test(str);
    }

    function status(type) {
        return git(["status", "-u", "--porcelain"]).then(function (stdout) {
            if (!stdout) { return []; }

            var currentSubFolder = Preferences.get("currentGitSubfolder");

            // files that are modified both in index and working tree should be resetted
            var isEscaped = false,
                needReset = [],
                results = [],
                lines = stdout.split("\n");

            lines.forEach(function (line) {
                var statusStaged = line.substring(0, 1),
                    statusUnstaged = line.substring(1, 2),
                    status = [],
                    file = line.substring(3);

                // check if the file is quoted
                if (_isquoted(file)) {
                    file = _unquote(file);
                    if (_isescaped(file)) {
                        isEscaped = true;
                    }
                }

                if (statusStaged !== " " && statusUnstaged !== " " &&
                    statusStaged !== "?" && statusUnstaged !== "?") {
                    needReset.push(file);
                    return;
                }

                var statusChar;
                if (statusStaged !== " " && statusStaged !== "?") {
                    status.push(FILE_STATUS.STAGED);
                    statusChar = statusStaged;
                } else {
                    statusChar = statusUnstaged;
                }

                switch (statusChar) {
                    case " ":
                        status.push(FILE_STATUS.UNMODIFIED);
                        break;
                    case "!":
                        status.push(FILE_STATUS.IGNORED);
                        break;
                    case "?":
                        status.push(FILE_STATUS.UNTRACKED);
                        break;
                    case "M":
                        status.push(FILE_STATUS.MODIFIED);
                        break;
                    case "A":
                        status.push(FILE_STATUS.ADDED);
                        break;
                    case "D":
                        status.push(FILE_STATUS.DELETED);
                        break;
                    case "R":
                        status.push(FILE_STATUS.RENAMED);
                        break;
                    case "C":
                        status.push(FILE_STATUS.COPIED);
                        break;
                    case "U":
                        status.push(FILE_STATUS.UNMERGED);
                        break;
                    default:
                        throw new Error("Unexpected status: " + statusChar);
                }

                var display = file,
                    io = file.indexOf("->");
                if (io !== -1) {
                    file = file.substring(io + 2).trim();
                }

                // we don't want to display paths that lead to this file outside the project
                if (currentSubFolder && display.indexOf(currentSubFolder) === 0) {
                    display = display.substring(currentSubFolder.length);
                }

                results.push({
                    status: status,
                    display: display,
                    file: file,
                    name: file.substring(file.lastIndexOf("/") + 1)
                });
            });

            if (isEscaped) {
                return setConfig("core.quotepath", "false").then(function () {
                    if (type === "SET_QUOTEPATH") {
                        throw new Error("git status is calling itself in a recursive loop!");
                    }
                    return status("SET_QUOTEPATH");
                });
            }

            if (needReset.length > 0) {
                return Promise.all(needReset.map(function (fileName) {
                    if (fileName.indexOf("->") !== -1) {
                        fileName = fileName.split("->")[1].trim();
                    }
                    return unstage(fileName);
                })).then(function () {
                    if (type === "RECURSIVE_CALL") {
                        throw new Error("git status is calling itself in a recursive loop!");
                    }
                    return status("RECURSIVE_CALL");
                });
            }

            return results.sort(function (a, b) {
                if (a.file < b.file) {
                    return -1;
                }
                if (a.file > b.file) {
                    return 1;
                }
                return 0;
            });
        }).then(function (results) {
            lastGitStatusResults = results;
            EventEmitter.emit(Events.GIT_STATUS_RESULTS, results);
            return results;
        });
    }

    // this function right now is not being used anywhere,
    // but leaving it here (we might need it in the future)
    function hasStatusChanged() {
        const prevStatus = lastGitStatusResults;
        return status().then(function (currentStatus) {
            // the results are already sorted by file name
            // Compare the current statuses with the previous ones
            if (!prevStatus || prevStatus.length !== currentStatus.length) {
                return true;
            }
            for (let i = 0; i < prevStatus.length; i++) {
                if (prevStatus[i].file !== currentStatus[i].file ||
                    prevStatus[i].status.join(", ") !== currentStatus[i].status.join(", ")) {
                    return true;
                }
            }

            return false;
        }).catch(function (error) {
            console.error("Error fetching Git status in hasStatusChanged:", error);
            return false;
        });
    }

    function _isFileStaged(file) {
        return git(["status", "-u", "--porcelain", "--", file]).then(function (stdout) {
            if (!stdout) { return false; }
            return _.any(stdout.split("\n"), function (line) {
                return line[0] !== " " && line[0] !== "?" && // first character marks staged status
                    line.lastIndexOf(" " + file) === line.length - file.length - 1; // in case another file appeared here?
            });
        });
    }

    function getDiffOfStagedFiles() {
        return git(["diff", "--no-ext-diff", "--no-color", "--staged"], {
            timeout: false // never timeout this
        });
    }

    function getDiffOfAllIndexFiles(files) {
        var args = ["diff", "--no-ext-diff", "--no-color", "--full-index"];
        if (files) {
            args = args.concat("--", files);
        }
        return git(args, {
            timeout: false // never timeout this
        });
    }

    function getListOfStagedFiles() {
        return git(["diff", "--no-ext-diff", "--no-color", "--staged", "--name-only"], {
            timeout: false // never timeout this
        });
    }

    function diffFile(file) {
        return _isFileStaged(file).then(function (staged) {
            var args = ["diff", "--no-ext-diff", "--no-color"];
            if (staged) { args.push("--staged"); }
            args.push("-U0", "--", file);
            return git(args, {
                timeout: false // never timeout this
            });
        });
    }

    function diffFileNice(file) {
        return _isFileStaged(file).then(function (staged) {
            var args = ["diff", "--no-ext-diff", "--no-color"];
            if (staged) { args.push("--staged"); }
            args.push("--", file);
            return git(args, {
                timeout: false // never timeout this
            });
        });
    }

    function difftool(file) {
        return _isFileStaged(file).then(function (staged) {
            var args = ["difftool"];
            if (staged) {
                args.push("--staged");
            }
            args.push("--", file);
            return git(args, {
                timeout: false, // never timeout this
                nonblocking: true // allow running other commands before this command finishes its work
            });
        });
    }

    function clean() {
        return git(["clean", "-f", "-d"]);
    }

    function getFilesFromCommit(hash, isInitial) {
        var args = ["diff", "--no-ext-diff", "--name-only"];
        args = args.concat((isInitial ? EMPTY_TREE : hash + "^") + ".." + hash);
        args = args.concat("--");
        return git(args).then(function (stdout) {
            return !stdout ? [] : stdout.split("\n");
        });
    }

    function getDiffOfFileFromCommit(hash, file, isInitial) {
        var args = ["diff", "--no-ext-diff", "--no-color"];
        args = args.concat((isInitial ? EMPTY_TREE : hash + "^") + ".." + hash);
        args = args.concat("--", file);
        return git(args);
    }

    function difftoolFromHash(hash, file, isInitial) {
        return git(["difftool", (isInitial ? EMPTY_TREE : hash + "^") + ".." + hash, "--", file], {
            timeout: false // never timeout this
        });
    }

    function rebaseInit(branchName) {
        return git(["rebase", "--ignore-date", branchName]);
    }

    function rebase(whatToDo) {
        return git(["rebase", "--" + whatToDo]);
    }

    function getVersion() {
        return git(["--version"]).then(function (stdout) {
            var m = stdout.match(/[0-9].*/);
            return m ? m[0] : stdout.trim();
        });
    }

    function getCommitCountsFallback() {
        return git(["rev-list", "HEAD", "--not", "--remotes"])
            .then(function (stdout) {
                var ahead = stdout ? stdout.split("\n").length : 0;
                return "-1 " + ahead;
            })
            .catch(function (err) {
                ErrorHandler.logError(err);
                return "-1 -1";
            });
    }

    function getCommitCounts() {
        var remotes = Preferences.get("defaultRemotes") || {};
        var remote = remotes[Preferences.get("currentGitRoot")];
        return getCurrentBranchName()
            .then(function (branch) {
                if (!branch || !remote) {
                    return getCommitCountsFallback();
                }
                return git(["rev-list", "--left-right", "--count", remote + "/" + branch + "...@{0}", "--"])
                    .catch(function (err) {
                        ErrorHandler.logError(err);
                        return getCommitCountsFallback();
                    })
                    .then(function (stdout) {
                        var matches = /(-?\d+)\s+(-?\d+)/.exec(stdout);
                        return matches ? {
                            behind: parseInt(matches[1], 10),
                            ahead: parseInt(matches[2], 10)
                        } : {
                            behind: -1,
                            ahead: -1
                        };
                    });
            });
    }

    function getLastCommitMessage() {
        return git(["log", "-1", "--pretty=%B"]).then(function (stdout) {
            return stdout.trim();
        });
    }

    function getBlame(file, from, to) {
        var args = ["blame", "-w", "--line-porcelain"];
        if (from || to) { args.push("-L" + from + "," + to); }
        args.push(file);

        return git(args).then(function (stdout) {
            if (!stdout) { return []; }

            var sep  = "-@-BREAK-HERE-@-",
                sep2 = "$$#-#$BREAK$$-$#";
            stdout = stdout.replace(sep, sep2)
                .replace(/^\t(.*)$/gm, function (a, b) { return b + sep; });

            return stdout.split(sep).reduce(function (arr, lineInfo) {
                lineInfo = lineInfo.replace(sep2, sep).trimLeft();
                if (!lineInfo) { return arr; }

                var obj = {},
                    lines = lineInfo.split("\n"),
                    firstLine = _.first(lines).split(" ");

                obj.hash = firstLine[0];
                obj.num = firstLine[2];
                obj.content = _.last(lines);

                // process all but first and last lines
                for (var i = 1, l = lines.length - 1; i < l; i++) {
                    var line = lines[i],
                        io = line.indexOf(" "),
                        key = line.substring(0, io),
                        val = line.substring(io + 1);
                    obj[key] = val;
                }

                arr.push(obj);
                return arr;
            }, []);
        }).catch(function (stderr) {
            var m = stderr.match(/no such path (\S+)/);
            if (m) {
                throw new Error("File is not tracked by Git: " + m[1]);
            }
            throw stderr;
        });
    }

    function getGitRoot() {
        var projectRoot = Utils.getProjectRoot();

        // Quick filesystem pre-check: if .git doesn't exist in the project root,
        // skip spawning git entirely. This avoids triggering macOS CLT shim dialogs
        // on non-git projects and is a minor optimization on all platforms.
        return new Promise(function (resolve) {
            var checkPath = projectRoot;
            if (strEndsWith(checkPath, "/")) {
                checkPath = checkPath.slice(0, -1);
            }
            if (typeof brackets !== "undefined" && brackets.fs && brackets.fs.stat) {
                brackets.fs.stat(checkPath + "/.git", function (err, result) {
                    var exists = err ? false : (result.isFile() || result.isDirectory());
                    resolve(exists);
                });
            } else {
                FileSystem.resolve(checkPath + "/.git", function (err, item, stat) {
                    var exists = err ? false : (stat.isFile || stat.isDirectory);
                    resolve(exists);
                });
            }
        }).then(function (hasGitDir) {
            if (!hasGitDir) {
                return null;
            }
            return git(["rev-parse", "--show-toplevel"], {
                cwd: fs.getTauriPlatformPath(projectRoot)
            })
            .catch(function (e) {
                if (ErrorHandler.contains(e, "Not a git repository")) {
                    return null;
                }
                throw e;
            })
            .then(function (root) {
                if (root === null) {
                    return root;
                }

                // paths on cygwin look a bit different
                // root = fixCygwinPath(root);

                // we know projectRoot is in a Git repo now
                // because --show-toplevel didn't return Not a git repository
                // we need to find closest .git

                function checkPathRecursive(path) {

                    if (strEndsWith(path, "/")) {
                        path = path.slice(0, -1);
                    }

                    Utils.consoleDebug("Checking path for .git: " + path);

                    return new Promise(function (resolve) {

                        // keep .git away from file tree for now
                        // this branch of code will not run for intel xdk
                        if (typeof brackets !== "undefined" && brackets.fs && brackets.fs.stat) {
                            brackets.fs.stat(path + "/.git", function (err, result) {
                                var exists = err ? false : (result.isFile() || result.isDirectory());
                                if (exists) {
                                    Utils.consoleDebug("Found .git in path: " + path);
                                    resolve(path);
                                } else {
                                    Utils.consoleDebug("Failed to find .git in path: " + path);
                                    path = path.split("/");
                                    path.pop();
                                    path = path.join("/");
                                    resolve(checkPathRecursive(path));
                                }
                            });
                            return;
                        }

                        FileSystem.resolve(path + "/.git", function (err, item, stat) {
                            var exists = err ? false : (stat.isFile || stat.isDirectory);
                            if (exists) {
                                Utils.consoleDebug("Found .git in path: " + path);
                                resolve(path);
                            } else {
                                Utils.consoleDebug("Failed to find .git in path: " + path);
                                path = path.split("/");
                                path.pop();
                                path = path.join("/");
                                resolve(checkPathRecursive(path));
                            }
                        });

                    });

                }

                return checkPathRecursive(projectRoot).then(function (path) {
                    return path + "/";
                });

            });
        });
    }

    function setTagName(tagname, commitHash) {
        const args = ["tag", tagname];
        if (commitHash) {
            args.push(commitHash); // Add the commit hash to the arguments if provided
        }
        return git(args).then(function (stdout) {
            return stdout.trim();
        });
    }

    // Public API
    exports._git                      = git;
    exports.setGitPath                = setGitPath;
    exports.FILE_STATUS               = FILE_STATUS;
    exports.fetchRemote               = fetchRemote;
    exports.fetchAllRemotes           = fetchAllRemotes;
    exports.getRemotes                = getRemotes;
    exports.createRemote              = createRemote;
    exports.deleteRemote              = deleteRemote;
    exports.push                      = push;
    exports.setUpstreamBranch         = setUpstreamBranch;
    exports.getCurrentBranchName      = getCurrentBranchName;
    exports.getCurrentUpstreamBranch  = getCurrentUpstreamBranch;
    exports.getConfig                 = getConfig;
    exports.setConfig                 = setConfig;
    exports.getBranches               = getBranches;
    exports.getAllBranches            = getAllBranches;
    exports.branchDelete              = branchDelete;
    exports.forceBranchDelete         = forceBranchDelete;
    exports.getDeletedFiles           = getDeletedFiles;
    exports.getHistory                = getHistory;
    exports.init                      = init;
    exports.clone                     = clone;
    exports.stage                     = stage;
    exports.unstage                   = unstage;
    exports.stageAll                  = stageAll;
    exports.commit                    = commit;
    exports.reset                     = reset;
    exports.checkout                  = checkout;
    exports.createBranch              = createBranch;
    exports.status                    = status;
    exports.hasStatusChanged          = hasStatusChanged;
    exports.diffFile                  = diffFile;
    exports.diffFileNice              = diffFileNice;
    exports.difftool                  = difftool;
    exports.clean                     = clean;
    exports.getFilesFromCommit        = getFilesFromCommit;
    exports.getDiffOfFileFromCommit   = getDiffOfFileFromCommit;
    exports.difftoolFromHash          = difftoolFromHash;
    exports.rebase                    = rebase;
    exports.rebaseInit                = rebaseInit;
    exports.mergeRemote               = mergeRemote;
    exports.rebaseRemote              = rebaseRemote;
    exports.resetRemote               = resetRemote;
    exports.getVersion                = getVersion;
    exports.getCommitCounts           = getCommitCounts;
    exports.getLastCommitMessage      = getLastCommitMessage;
    exports.mergeBranch               = mergeBranch;
    exports.getDiffOfAllIndexFiles    = getDiffOfAllIndexFiles;
    exports.getDiffOfStagedFiles      = getDiffOfStagedFiles;
    exports.getListOfStagedFiles      = getListOfStagedFiles;
    exports.getBlame                  = getBlame;
    exports.getGitRoot                = getGitRoot;
    exports.setTagName                = setTagName;
});
