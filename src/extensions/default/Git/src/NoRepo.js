/*globals jsPromise, fs*/
define(function (require) {

    // Brackets modules
    const FileSystem    = brackets.getModule("filesystem/FileSystem"),
        FileUtils       = brackets.getModule("file/FileUtils"),
        ProjectManager  = brackets.getModule("project/ProjectManager"),
        CommandManager  = brackets.getModule("command/CommandManager"),
        Metrics         = brackets.getModule("utils/Metrics"),
        Strings         = brackets.getModule("strings"),
        StringUtils     = brackets.getModule("utils/StringUtils");

    // Local modules
    const ErrorHandler  = require("src/ErrorHandler"),
        Events          = require("src/Events"),
        EventEmitter    = require("src/EventEmitter"),
        ExpectedError   = require("src/ExpectedError"),
        ProgressDialog  = require("src/dialogs/Progress"),
        CloneDialog     = require("src/dialogs/Clone"),
        Git             = require("src/git/Git"),
        Preferences     = require("src/Preferences"),
        Constants       = require("src/Constants"),
        Utils           = require("src/Utils");

    // Templates
    var gitignoreTemplate = require("text!templates/default-gitignore");

    // Module variables

    // Implementation

    function createGitIgnore() {
        var gitIgnorePath = Preferences.get("currentGitRoot") + ".gitignore";
        return Utils.pathExists(gitIgnorePath).then(function (exists) {
            if (!exists) {
                return jsPromise(
                    FileUtils.writeText(FileSystem.getFileForPath(gitIgnorePath), gitignoreTemplate));
            }
        });
    }

    function stageGitIgnore() {
        return createGitIgnore().then(function () {
            return Git.stage(".gitignore");
        });
    }

    function handleGitInit() {
        Utils.isProjectRootWritable().then(function (writable) {
            if (!writable) {
                const initPath = Phoenix.app.getDisplayPath(Utils.getProjectRoot());
                const errorStr = StringUtils.format(Strings.FOLDER_NOT_WRITABLE, initPath);
                throw new ExpectedError(errorStr);
            }
            return Git.init().catch(function (err) {
                return new Promise((resolve, reject)=>{
                    if (ErrorHandler.contains(err, "Please tell me who you are")) {
                        EventEmitter.emit(Events.GIT_CHANGE_USERNAME, function () {
                            EventEmitter.emit(Events.GIT_CHANGE_EMAIL, function () {
                                Git.init().then(function (result) {
                                    resolve(result);
                                }).catch(function (error) {
                                    reject(error);
                                });
                            });
                        });
                        return;
                    }

                    reject(err);
                });
            });
        }).then(function () {
            Metrics.countEvent(Metrics.EVENT_TYPE.GIT, 'init', "success");
            return stageGitIgnore("Initial staging");
        }).catch(function (err) {
            ErrorHandler.showError(err, Strings.INIT_NEW_REPO_FAILED, {dontStripError: true});
            Metrics.countEvent(Metrics.EVENT_TYPE.GIT, 'init', "fail");
        }).then(function () {
            EventEmitter.emit(Events.REFRESH_ALL);
        });
    }

    // This checks if the project root is empty (to let Git clone repositories)
    function isProjectRootEmpty() {
        return new Promise(function (resolve, reject) {
            ProjectManager.getProjectRoot().getContents(function (err, entries) {
                if (err) {
                    return reject(err);
                }
                resolve(entries.length === 0);
            });
        });
    }

    function handleGitClone(gitCloneURL, destPath) {
        var $gitPanel = $("#git-panel");
        var $cloneButton = $gitPanel.find(".git-clone");
        $cloneButton.prop("disabled", true);
        isProjectRootEmpty().then(function (isEmpty) {
            if (!isEmpty) {
                const clonePath = Phoenix.app.getDisplayPath(Utils.getProjectRoot());
                const err = new ExpectedError(
                    StringUtils.format(Strings.GIT_CLONE_ERROR_EXPLAIN, clonePath));
                ErrorHandler.showError(err, Strings.GIT_CLONE_REMOTE_FAILED, {dontStripError: true});
                return;
            }
            function _clone(cloneConfig) {
                var q = Promise.resolve();
                // put username and password into remote url
                var remoteUrl = cloneConfig.remoteUrl;
                if (cloneConfig.remoteUrlNew) {
                    remoteUrl = cloneConfig.remoteUrlNew;
                }

                // do the clone
                q = q.then(function () {
                    const tracker = ProgressDialog.newProgressTracker();
                    destPath = destPath ? fs.getTauriPlatformPath(destPath) : ".";
                    return ProgressDialog.show(Git.clone(remoteUrl, destPath, tracker), tracker);
                }).then(()=>{
                    Metrics.countEvent(Metrics.EVENT_TYPE.GIT, 'clone', "success");
                }).catch(function (err) {
                    Metrics.countEvent(Metrics.EVENT_TYPE.GIT, 'clone', "fail");
                    ErrorHandler.showError(err, Strings.GIT_CLONE_REMOTE_FAILED, {errorMetric: "clone"});
                });

                // restore original url if desired
                if (cloneConfig.remoteUrlRestore) {
                    q = q.then(function () {
                        return Git.setRemoteUrl(cloneConfig.remote, cloneConfig.remoteUrlRestore);
                    });
                }

                return q.finally(function () {
                    EventEmitter.emit(Events.REFRESH_ALL);
                });
            }
            if(gitCloneURL){
                return _clone({
                    remote: "origin",
                    remoteUrlNew: gitCloneURL
                });
            }
            CloneDialog.show().then(_clone).catch(function (err) {
                // when dialog is cancelled, there's no error
                if (err) { ErrorHandler.showError(err, Strings.GIT_CLONE_REMOTE_FAILED); }
            });
        }).catch(function (err) {
            ErrorHandler.showError(err);
        }).finally(function () {
            $cloneButton.prop("disabled", false);
        });
    }

    CommandManager.register(Strings.GIT_CLONE, Constants.CMD_GIT_CLONE_WITH_URL, handleGitClone);

    // Event subscriptions
    EventEmitter.on(Events.HANDLE_GIT_INIT, function () {
        handleGitInit();
    });
    EventEmitter.on(Events.HANDLE_GIT_CLONE, function () {
        handleGitClone();
    });
    EventEmitter.on(Events.GIT_NO_BRANCH_EXISTS, function () {
        stageGitIgnore();
    });

});
