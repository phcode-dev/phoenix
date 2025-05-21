define(function (require) {
    const EventEmitter = require("src/EventEmitter");
    const Events = require("src/Events");
    const Git = require("src/git/Git");
    const Preferences = require("src/Preferences");

    // the cache of file statuses by path
    let fileStatusCache = {};

    /**
     * this function is responsible to get the Git status for a file path
     *
     * @param {string} fullPath - the file path
     * @returns {Array|null} - Array of status strings or null if no status
     */
    function getFileStatus(fullPath) {
        return fileStatusCache[fullPath] || null;
    }

    /**
     * whether the file is modified or not
     *
     * @param {string} fullPath - the file path
     * @returns {boolean} - True if the file is modified otherwise false
     */
    function isModified(fullPath) {
        const status = getFileStatus(fullPath);
        if (!status) {
            return false;
        }
        return (
            status.some(
                (statusType) =>
                    statusType === Git.FILE_STATUS.MODIFIED ||
                    statusType === Git.FILE_STATUS.RENAMED ||
                    statusType === Git.FILE_STATUS.COPIED
            ) && !status.includes(Git.FILE_STATUS.STAGED)
        );
    }

    /**
     * whether the file is untracked or not
     *
     * @param {string} fullPath - the file path
     * @returns {boolean} - True if the file is untracked otherwise false
     */
    function isUntracked(fullPath) {
        const status = getFileStatus(fullPath);
        if (!status) {
            return false;
        }

        return status.includes(Git.FILE_STATUS.UNTRACKED);
    }


    // Update file status cache when Git status results are received
    EventEmitter.on(Events.GIT_STATUS_RESULTS, function (files) {
        // reset the cache
        fileStatusCache = {};

        const gitRoot = Preferences.get("currentGitRoot");
        if (!gitRoot) {
            return;
        }

        // we need to update cache with new status results
        files.forEach(function (entry) {
            const fullPath = gitRoot + entry.file;
            fileStatusCache[fullPath] = entry.status;
        });

        // notify that file statuses have been updated
        EventEmitter.emit("GIT_FILE_STATUS_CHANGED", fileStatusCache);
    });

    // clear cache when Git is disabled
    EventEmitter.on(Events.GIT_DISABLED, function () {
        fileStatusCache = {};
        EventEmitter.emit("GIT_FILE_STATUS_CHANGED", fileStatusCache);
    });

    return {
        getFileStatus: getFileStatus,
        isModified: isModified,
        isUntracked: isUntracked
    };
});
