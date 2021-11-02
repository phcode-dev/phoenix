/*
 * GNU AGPL-3.0 License
 *
 * Modified Work Copyright (c) 2021 - present core.ai . All rights reserved.
 * Original work Copyright (c) 2015 - 2021 Adobe Systems Incorporated. All rights reserved.
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
 * Set of utilities for working with files and text content.
 */
define(function (require, exports, module) {


    var LanguageManager = require("language/LanguageManager"),
        ProjectManager  = require("project/ProjectManager");

    /**
     * File extensions - hard-coded for now, but may want to make these preferences
     * @const {Array.<string>}
     */
    var _staticHtmlFileExts = ["htm", "html", "xhtml"],
        _serverHtmlFileExts = ["php", "php3", "php4", "php5", "phtm", "phtml", "cfm", "cfml", "asp", "aspx", "jsp", "jspx", "shtm", "shtml"];

    /**
     * Determine if file extension is a static html file extension.
     * @param {string} filePath could be a path, a file name or just a file extension
     * @return {boolean} Returns true if fileExt is in the list
     */
    function isStaticHtmlFileExt(filePath) {
        if (!filePath) {
            return false;
        }

        return (_staticHtmlFileExts.indexOf(LanguageManager.getLanguageForPath(filePath).getId()) !== -1);
    }

    /**
     * Determine if file extension is a server html file extension.
     * @param {string} filePath could be a path, a file name or just a file extension
     * @return {boolean} Returns true if fileExt is in the list
     */
    function isServerHtmlFileExt(filePath) {
        if (!filePath) {
            return false;
        }

        return (_serverHtmlFileExts.indexOf(LanguageManager.getLanguageForPath(filePath).getId()) !== -1);
    }

    /**
     * Returns true if we think the given extension is for an HTML file.
     * @param {string} ext The extension to check.
     * @return {boolean} true if this is an HTML extension.
     */
    function isHtmlFileExt(ext) {
        return (isStaticHtmlFileExt(ext) ||
                (ProjectManager.getBaseUrl() && isServerHtmlFileExt(ext)));
    }

    // Define public API
    exports.isHtmlFileExt       = isHtmlFileExt;
    exports.isStaticHtmlFileExt = isStaticHtmlFileExt;
    exports.isServerHtmlFileExt = isServerHtmlFileExt;
});
