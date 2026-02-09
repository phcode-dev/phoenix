define(function (require, exports) {

    // Brackets modules
    const _ = brackets.getModule("thirdparty/lodash"),
        Metrics = brackets.getModule("utils/Metrics");

    // Local modules
    const Cli         = require("src/Cli"),
        Git         = require("src/git/Git"),
        Preferences = require("src/Preferences");

    // Module variables
    let standardGitPathsWin = [
        "C:\\Program Files (x86)\\Git\\cmd\\git.exe",
        "C:\\Program Files\\Git\\cmd\\git.exe"
    ];

    let standardGitPathsNonWin = [
        "/opt/homebrew/bin/git",   // Apple Silicon Homebrew
        "/usr/local/git/bin/git",
        "/usr/local/bin/git",
        "/usr/bin/git"             // macOS CLT shim check handled on node side
    ];

    let extensionActivated = false;

    // Implementation
    function getGitVersion() {
        return new Promise(function (resolve, reject) {

            // User-configured path gets priority, then "git" (PATH lookup), then standard paths
            var pathsToLook = [Preferences.get("gitPath"), "git"].concat(brackets.platform === "win" ? standardGitPathsWin : standardGitPathsNonWin);
            pathsToLook = _.unique(_.compact(pathsToLook));

            var results = [],
                errors = [];
            var finish = _.after(pathsToLook.length, function () {

                var searchedPaths = "\n\nSearched paths:\n" + pathsToLook.join("\n");

                if (results.length === 0) {
                    // no git found
                    reject("No Git has been found on this computer" + searchedPaths);
                } else {
                    // at least one git is found
                    var gits = _.sortBy(results, "version").reverse(),
                        latestGit = gits[0],
                        m = latestGit.version.match(/([0-9]+)\.([0-9]+)/),
                        major = parseInt(m[1], 10),
                        minor = parseInt(m[2], 10);

                    if (major === 1 && minor < 8) {
                        return reject("Brackets Git requires Git 1.8 or later - latest version found was " + latestGit.version + searchedPaths);
                    }

                    // prefer the first defined so it doesn't change all the time and confuse people
                    latestGit = _.sortBy(_.filter(gits, function (git) { return git.version === latestGit.version; }), "index")[0];

                    // this will save the settings also
                    Git.setGitPath(latestGit.path);
                    resolve(latestGit.version);
                }

            });

            pathsToLook.forEach(function (path, index) {
                Cli.spawnCommand(path, ["--version"], {
                    cwd: "./"
                }).then(function (stdout) {
                    var m = stdout.match(/^git version\s+(.*)$/);
                    if (m) {
                        results.push({
                            path: path,
                            version: m[1],
                            index: index
                        });
                    }
                }).catch(function (err) {
                    errors.push({
                        path: path,
                        err: err
                    });
                }).finally(function () {
                    finish();
                });
            });

        });
    }

    function isExtensionActivated() {
        return extensionActivated && Preferences.get("enableGit");
    }

    /**
     * Initializes the Git extension by checking for the Git executable and returns true if active.
     *
     * @async
     * @function init
     * @returns {Promise<boolean>}
     *   A promise that resolves to a boolean indicating whether the extension was activated (`true`)
     *   or deactivated (`false`) due to a missing or inaccessible Git executable.
     * });
     */
    function init() {
        return new Promise((resolve) =>{
            if(!Preferences.get("enableGit")){
                resolve(false);
                console.log("Git is disabled in preferences.");
                return;
            }
            getGitVersion().then(function (_version) {
                extensionActivated = true;
                resolve(extensionActivated);
                Metrics.countEvent(Metrics.EVENT_TYPE.GIT, 'installed', "yes");
            }).catch(function (err) {
                extensionActivated = false;
                console.warn("Failed to launch Git executable. Deactivating Git extension. Is git installed?", err);
                resolve(extensionActivated);
                Metrics.countEvent(Metrics.EVENT_TYPE.GIT, 'installed', "no");
            });
        });
    }

    // Public API
    exports.init = init;
    exports.isExtensionActivated = isExtensionActivated;
    exports.getGitVersion = getGitVersion;

});
