/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
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

/**
 * Utilities for determining the git SHA from an optional repository or from the
 * installed copy of Brackets.
 */
define(function (require, exports, module) {


    var FileSystem  = require("filesystem/FileSystem"),
        FileUtils   = require("file/FileUtils");

    // make sure the global brackets variable is loaded
    require("utils/Global");

    /**
     * Loads a SHA from Git metadata file. If the file contains a symbolic ref name, follows the ref
     * and loads the SHA from that file in turn.
     */
    function _loadSHA(path, callback) {
        var result = new $.Deferred();

        if (brackets.inBrowser) {
            result.reject();
        } else {
            // HEAD contains a SHA in detached-head mode; otherwise it contains a relative path
            // to a file in /refs which in turn contains the SHA
            var file = FileSystem.getFileForPath(path);
            FileUtils.readAsText(file).done(function (text) {
                if (text.indexOf("ref: ") === 0) {
                    // e.g. "ref: refs/heads/branchname"
                    var basePath    = path.substr(0, path.lastIndexOf("/")),
                        refRelPath  = text.substr(5).trim(),
                        branch      = text.substr(16).trim();

                    _loadSHA(basePath + "/" + refRelPath, callback).done(function (data) {
                        result.resolve({ branch: branch, sha: data.sha.trim() });
                    }).fail(function () {
                        result.resolve({ branch: branch });
                    });
                } else {
                    result.resolve({ sha: text });
                }
            }).fail(function () {
                result.reject();
            });
        }

        return result.promise();
    }

    /**
     * @return {$.Promise} A promise resolved with the git branch and SHA
     *     of a local copy of a repository or the branch and SHA
     *     embedded at build-time in the package.json repository metadata.
     */
    function getBracketsSHA() {
        var result = new $.Deferred();

        // Look for Git metadata on disk to load the SHAs for 'brackets'. Done on
        // startup instead of on demand because the version that's currently running is what was
        // loaded at startup (the src on disk may be updated to a different version later).
        // Git metadata may be missing (e.g. in the release builds) - silently ignore if so.
        var bracketsSrc = FileUtils.getNativeBracketsDirectoryPath();

        // Assumes Brackets is a standalone repo and not a submodule (prior to brackets-shell,
        // brackets-app was setup this way)
        var bracketsGitRoot = bracketsSrc.substr(0, bracketsSrc.lastIndexOf("/")) + "/.git/HEAD";

        _loadSHA(bracketsGitRoot).done(function (data) {
            // Found a repository
            result.resolve(data.branch || "HEAD", data.sha || "unknown", true);
        }).fail(function () {
            // If package.json has repository data, Brackets is running from the installed /www folder
            result.resolve(brackets.metadata.repository.branch, brackets.metadata.repository.SHA, false);
        });

        return result.promise();
    }

    exports.getBracketsSHA      = getBracketsSHA;

    // FIXME (jasonsanjose): Since the move to brackets-shell, can't reliably get SHA for shell.
    // exports._getBracketsShellSHA = getBracketsShellSHA;
});
