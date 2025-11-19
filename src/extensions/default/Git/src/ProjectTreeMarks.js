define(function (require) {

    var _                 = brackets.getModule("thirdparty/lodash"),
        FileSystem        = brackets.getModule("filesystem/FileSystem"),
        ProjectManager    = brackets.getModule("project/ProjectManager");

    var EventEmitter      = require("src/EventEmitter"),
        Events            = require("src/Events"),
        Git               = require("src/git/Git"),
        Preferences       = require("src/Preferences");

    var ignoreEntries = [],
        newPaths      = [],
        modifiedPaths = [];

    if (!Preferences.get("markModifiedInTree")) {
        // end here, no point in processing the code below
        return;
    }

    function loadIgnoreContents() {
        return new Promise((resolve)=>{
            let gitRoot = Preferences.get("currentGitRoot"),
                excludeContents,
                gitignoreContents;

            const finish = _.after(2, function () {
                resolve(excludeContents + "\n" + gitignoreContents);
            });

            FileSystem.getFileForPath(gitRoot + ".git/info/exclude").read(function (err, content) {
                excludeContents = err ? "" : content;
                finish();
            });

            FileSystem.getFileForPath(gitRoot + ".gitignore").read(function (err, content) {
                gitignoreContents = err ? "" : content;
                finish();
            });

        });
    }

    function refreshIgnoreEntries() {
        function regexEscape(str) {
            // NOTE: We cannot use StringUtils.regexEscape() here because we don't wanna replace *
            return str.replace(/([.?+\^$\\(){}|])/g, "\\$1");
        }

        return loadIgnoreContents().then(function (content) {
            var gitRoot = Preferences.get("currentGitRoot");

            ignoreEntries = _.compact(_.map(content.split("\n"), function (line) {
                // Rules: http://git-scm.com/docs/gitignore
                var type = "deny",
                    leadingSlash,
                    trailingSlash,
                    regex;

                line = line.trim();
                if (!line || line.indexOf("#") === 0) {
                    return;
                }

                // handle explicitly allowed files/folders with a leading !
                if (line.indexOf("!") === 0) {
                    line = line.slice(1);
                    type = "accept";
                }
                // handle lines beginning with a backslash, which is used for escaping ! or #
                if (line.indexOf("\\") === 0) {
                    line = line.slice(1);
                }
                // handle lines beginning with a slash, which only matches files/folders in the root dir
                if (line.indexOf("/") === 0) {
                    line = line.slice(1);
                    leadingSlash = true;
                }
                // handle lines ending with a slash, which only exludes dirs
                if (line.lastIndexOf("/") === line.length) {
                    // a line ending with a slash ends with **
                    line += "**";
                    trailingSlash = true;
                }

                // NOTE: /(.{0,})/ is basically the same as /(.*)/, but we can't use it because the asterisk
                // would be replaced later on

                // create the intial regexp here. We need the absolute path 'cause it could be that there
                // are external files with the same name as a project file
                regex = regexEscape(gitRoot) + (leadingSlash ? "" : "((.+)/)?") + regexEscape(line) + (trailingSlash ? "" : "(/.{0,})?");
                // replace all the possible asterisks
                regex = regex.replace(/\*\*$/g, "(.{0,})").replace(/(\*\*|\*$)/g, "(.+)").replace(/\*/g, "([^/]*)");
                regex = "^" + regex + "$";

                return {
                    regexp: new RegExp(regex),
                    type: type
                };
            }));
        });
    }

    function isIgnored(path) {
        var ignored = false;
        _.forEach(ignoreEntries, function (entry) {
            if (entry.regexp.test(path)) {
                ignored = (entry.type === "deny");
            }
        });
        return ignored;
    }

    function isNew(fullPath) {
        return newPaths.indexOf(fullPath) !== -1;
    }

    function isModified(fullPath) {
        return modifiedPaths.indexOf(fullPath) !== -1;
    }

    ProjectManager.addClassesProvider(function (data) {
        var fullPath = data.fullPath;
        if (isIgnored(fullPath)) {
            return "git-ignored";
        } else if (isNew(fullPath)) {
            return "git-new";
        } else if (isModified(fullPath)) {
            return "git-modified";
        }
    });

    function _refreshOpenFiles() {
        $("#working-set-list-container").find("li").each(function () {
            var $li = $(this),
                data = $li.data("file");
            if (data) {
                var fullPath = data.fullPath;
                $li.toggleClass("git-ignored", isIgnored(fullPath))
                   .toggleClass("git-new", isNew(fullPath))
                   .toggleClass("git-modified", isModified(fullPath));
            }
        });
    }

    var refreshOpenFiles = _.debounce(function () {
        _refreshOpenFiles();
    }, 100);

    function attachEvents() {
        $("#working-set-list-container").on("contentChanged", refreshOpenFiles).triggerHandler("contentChanged");
    }

    function detachEvents() {
        $("#working-set-list-container").off("contentChanged", refreshOpenFiles);
    }

    // this will refresh ignore entries when .gitignore is modified
    EventEmitter.on(Events.BRACKETS_FILE_CHANGED, function (file) {
        if (file.fullPath === Preferences.get("currentGitRoot") + ".gitignore") {
            refreshIgnoreEntries().finally(function () {
                refreshOpenFiles();
            });
        }
    });

    // this will refresh new/modified paths on every status results
    EventEmitter.on(Events.GIT_STATUS_RESULTS, function (files) {
        var gitRoot = Preferences.get("currentGitRoot");

        newPaths = [];
        modifiedPaths = [];

        files.forEach(function (entry) {
            var isNew = entry.status.indexOf(Git.FILE_STATUS.UNTRACKED) !== -1 ||
                        entry.status.indexOf(Git.FILE_STATUS.ADDED) !== -1;

            var fullPath = gitRoot + entry.file;
            if (isNew) {
                newPaths.push(fullPath);
            } else {
                modifiedPaths.push(fullPath);
            }
        });

        ProjectManager.rerenderTree();
        refreshOpenFiles();
    });

    // this will refresh ignore entries when git project is opened
    EventEmitter.on(Events.GIT_ENABLED, function () {
        refreshIgnoreEntries();
        attachEvents();
    });

    // this will clear entries when non-git project is opened
    EventEmitter.on(Events.GIT_DISABLED, function () {
        ignoreEntries = [];
        newPaths      = [];
        modifiedPaths = [];
        detachEvents();
    });

    return {
        isIgnored: isIgnored
    };

});
