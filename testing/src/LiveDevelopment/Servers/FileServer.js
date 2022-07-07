/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
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

define(function (require, exports, module) {


    var BaseServer           = require("LiveDevelopment/Servers/BaseServer").BaseServer,
        LiveDevelopmentUtils = require("LiveDevelopment/LiveDevelopmentUtils");

    // The path on Windows starts with a drive letter (e.g. "C:").
    // In order to make it a valid file: URL we need to add an
    // additional slash to the prefix.
    var PREFIX = (brackets.platform === "win") ? "file:///" : "file://";

    /**
     * Server for file: URLs
     *
     * Configuration parameters for this server:
     * - baseUrl      - Optional base URL (populated by the current project)
     * - pathResolver - Function to covert absolute native paths to project relative paths
     * - root         - Native path to the project root (and base URL)
     *
     * @constructor
     * @param {!{baseUrl: string, root: string, pathResolver: function(string): string}} config
     * @extends {BaseServer}
     */
    function FileServer(config) {
        BaseServer.call(this, config);
    }

    FileServer.prototype = Object.create(BaseServer.prototype);
    FileServer.prototype.constructor = FileServer;

    /**
     * Determines whether we can serve local file.
     * @param {string} localPath A local path to file being served.
     * @return {boolean} true for yes, otherwise false.
     */
    FileServer.prototype.canServe = function (localPath) {
        // FileServer requires that the base URL is undefined and static HTML files
        return (!this._baseUrl && LiveDevelopmentUtils.isStaticHtmlFileExt(localPath));
    };

    /**
     * Convert a file: URL to a absolute file path
     * @param {string} url
     * @return {?string} The absolute path for given file: URL or null if the path is
     *  not a descendant of the project.
     */
    FileServer.prototype.urlToPath = function (url) {
        if (url.indexOf(PREFIX) === 0) {
            // Convert a file URL to local file path
            return decodeURI(url.slice(PREFIX.length));
        }

        return null;
    };

    /**
     * Returns a file: URL for a given absolute path
     * @param {string} path Absolute path to covert to a file: URL
     * @return {string} Converts an absolute path within the project root to a file: URL.
     */
    FileServer.prototype.pathToUrl = function (path) {
        return encodeURI(PREFIX + path);
    };

    exports.FileServer = FileServer;
});
