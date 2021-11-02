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

/*eslint-env node */
/*jslint node: true */



var fs = require("fs-extra");

function remove(path, cb) {
    fs.remove(path, cb);
}

function copy(src, dest, cb) {
    fs.copy(src, dest, cb);
}

function rename(src, dest, cb) {
    fs.rename(src, dest, cb);
}

/**
 * Initialize the "testing" domain.
 * The testing domain provides utilities for tests.
 */
function init(domainManager) {
    if (!domainManager.hasDomain("testing")) {
        domainManager.registerDomain("testing", {major: 0, minor: 1});
    }
    domainManager.registerCommand(
        "testing",
        "remove",
        remove,
        true,
        "Remove the directory at the path",
        [{
            name: "path",
            type: "string",
            description: "path to the directory to remove"
        }]
    );
    domainManager.registerCommand(
        "testing",
        "copy",
        copy,
        true,
        "Copy a file or directory. The directory can have contents. Like cp -r.",
        [
            {
                name: "src",
                type: "string",
                description: "directory source to copy"
            },
            {
                name: "dest",
                type: "string",
                description: "destination directory"
            }
        ]
    );
    domainManager.registerCommand(
        "testing",
        "rename",
        rename,
        true,
        "Rename a file or directory.",
        [
            {
                name: "src",
                type: "string",
                description: "source path"
            },
            {
                name: "dest",
                type: "string",
                description: "destination path"
            }
        ]
    );
}

exports.init = init;
