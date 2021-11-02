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

define(function (require, exports, module) {


    var BaseServer             = require("LiveDevelopment/Servers/BaseServer").BaseServer,
        LiveDevelopmentUtils   = require("LiveDevelopment/LiveDevelopmentUtils");

    /**
     * Live preview server for user specified server as defined with Live Preview Base Url
     * Project setting. In a clean installation of Brackets, this is the highest priority
     * server provider, if defined.
     *
     * Configuration parameters for this server:
     * - baseUrl      - Optional base URL (populated by the current project)
     * - pathResolver - Function to covert absolute native paths to project relative paths
     * - root         - Native path to the project root (and base URL)
     *
     * @constructor
     * @param {!{baseUrl: string, root: string, pathResolver: function(string)}} config
     * @extends {BaseServer}
     */
    function UserServer(config) {
        BaseServer.call(this, config);
    }

    UserServer.prototype = Object.create(BaseServer.prototype);
    UserServer.prototype.constructor = UserServer;

    /**
     * Determines whether we can serve local file.
     * @param {string} localPath A local path to file being served.
     * @return {boolean} true for yes, otherwise false.
     */
    UserServer.prototype.canServe = function (localPath) {
        // UserServer can only function when the project specifies a base URL
        if (!this._baseUrl) {
            return false;
        }

        // If we can't transform the local path to a project relative path,
        // the path cannot be served
        if (localPath === this._pathResolver(localPath)) {
            return false;
        }

        return LiveDevelopmentUtils.isStaticHtmlFileExt(localPath) ||
            LiveDevelopmentUtils.isServerHtmlFileExt(localPath);
    };

    exports.UserServer = UserServer;
});
