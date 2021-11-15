/*
 * GNU AGPL-3.0 License
 *
 * Modified Work Copyright (c) 2021 - present core.ai . All rights reserved.
 * Original work Copyright (c) 2012 - 2021 Adobe Systems Incorporated. All rights reserved.
 *
 * This program is free software: you can redistribute it and/or modify it
 * under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT
 * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
 * FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License
 * for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see https://opensource.org/licenses/AGPL-3.0.
 *
 */

define(function (require, exports, module) {


    var Async           = require("utils/Async"),
        FileSystemError = require("filesystem/FileSystemError");

    /**
     * @private
     * Map an fs error code to a FileError.
     */
    function _browserErrToFileError(err) {
        if (err === brackets.fs.ERR_NOT_FOUND) {
            return FileSystemError.NOT_FOUND;
        }

        // All other errors are mapped to the generic "unknown" error
        return FileSystemError.UNKNOWN;
    }

    var liveBrowserOpenedPIDs = [];

    /** openLiveBrowser
     * Open the given URL in the user's system browser, optionally enabling debugging.
     * @param {string} url The URL to open.
     * @param {boolean=} enableRemoteDebugging Whether to turn on remote debugging. Default false.
     * @return {$.Promise}
     */
    function openLiveBrowser(url, enableRemoteDebugging) {
        var result = new $.Deferred();

        brackets.app.openLiveBrowser(url, !!enableRemoteDebugging, function onRun(err, pid) {
            if (!err) {
                // Undefined ids never get removed from list, so don't push them on
                if (pid !== undefined) {
                    liveBrowserOpenedPIDs.push(pid);
                }
                result.resolve(pid);
            } else {
                result.reject(_browserErrToFileError(err));
            }
        });

        return result.promise();
    }

    /** closeLiveBrowser
     *
     * @return {$.Promise}
     */
    function closeLiveBrowser(pid) {
        var result = new $.Deferred();

        if (isNaN(pid)) {
            pid = 0;
        }
        brackets.app.closeLiveBrowser(function (err) {
            if (!err) {
                var i = liveBrowserOpenedPIDs.indexOf(pid);
                if (i !== -1) {
                    liveBrowserOpenedPIDs.splice(i, 1);
                }
                result.resolve();
            } else {
                result.reject(_browserErrToFileError(err));
            }
        }, pid);

        return result.promise();
    }

    /** closeAllLiveBrowsers
     * Closes all the browsers that were tracked on open
     * TODO: does not seem to work on Windows
     * @return {$.Promise}
     */
    function closeAllLiveBrowsers() {
        //make a copy incase the array is edited as we iterate
        var closeIDs = liveBrowserOpenedPIDs.concat();
        return Async.doSequentially(closeIDs, closeLiveBrowser, false);
    }

    /**
     * Opens a URL in the system default browser
     */
    function openURLInDefaultBrowser(url) {
        brackets.app.openURLInDefaultBrowser(url);
    }


    // Define public API
    exports.openLiveBrowser = openLiveBrowser;
    exports.closeLiveBrowser = closeLiveBrowser;
    exports.closeAllLiveBrowsers = closeAllLiveBrowsers;
    exports.openURLInDefaultBrowser = openURLInDefaultBrowser;
});
