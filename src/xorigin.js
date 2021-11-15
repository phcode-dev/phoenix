/*
 * GNU AGPL-3.0 License
 *
 * Modified Work Copyright (c) 2021 - present core.ai . All rights reserved.
 * Original work Copyright (c) 2013 - 2021 Adobe Systems Incorporated. All rights reserved.
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

/**
 * Function to test whether a given error represents an illegal cross origin access
 */
(function () {


    var testCrossOriginError;

    if (window.navigator.userAgent.search(" Chrome/") !== -1) {
        // Chrome support
        testCrossOriginError = function (message, url, line) {
            return url === "" && line === 0 && message === "Script error.";
        };
    } else if (window.navigator.userAgent.slice(0, 6) === 'Opera/') {
        // Opera support
        testCrossOriginError = function (message, url, line) {
            return message === "Uncaught exception: DOMException: NETWORK_ERR";
        };
    }

    // Abort if running in the shell, running on a server or not running in a supported and affected browser
    if (typeof (brackets) !== "undefined" ||
            window.document.location.href.substr(0, 7) !== "file://" ||
            !testCrossOriginError) {
        return;
    }

    // Remember the current error handler to restore it once we're done
    var previousErrorHandler = window.onerror;

    // Our error handler
    function handleError(message, url, line) {
        // Ignore this error if it does not look like the rather vague cross origin error in Chrome
        // Chrome will print it to the console anyway
        if (!testCrossOriginError(message, url, line)) {
            if (previousErrorHandler) {
                return previousErrorHandler(message, url, line);
            }
            return;
        }

        // Show an error message
        window.alert("Oops! This application doesn't run in browsers yet.\n\nIt is built in HTML, but right now it runs as a desktop app so you can use it to edit local files. Please use the application shell in the following repo to run this application:\n\ngithub.com/adobe/brackets-shell");

        // Restore the original handler for later errors
        window.onerror = previousErrorHandler;
    }

    // Install our error handler
    window.onerror = handleError;
}());
