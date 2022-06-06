/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2022 - present core.ai . All rights reserved.
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

/* eslint-env node */
const documentation = require('documentation');
const through2 = require("through2");

const TAG_INCLUDE_IN_API_DOCS = "INCLUDE_IN_API_DOCS";

function generateDocs() {
    return through2.obj(function(file, _, cb) {
        if (file.isBuffer()) {
            processFile(file, cb);
            return;
        }
        cb(null, null); // omit this file
    });
}

/**
 * Generate markdown documentation for all files labelled with @INCLUDE_IN_API_DOCS into the docs folder.
 * @param file
 * @returns {*}
 */
function processFile(file, cb) {
    // For file properties https://gulpjs.com/docs/en/api/vinyl/
    const code = file.contents.toString();
    if(!code.includes("@"+ TAG_INCLUDE_IN_API_DOCS)) {
        cb(null, null); // omit this file
        return;
    }
    console.log("Generating Doc for: ", file.path);
    documentation.build(file.path,{})
        .then(documentation.formats.md)
        .then(markdownDocStr => {
            file.contents = Buffer.from(markdownDocStr);
            file.extname = ".md";
            file.stem = file.stem + "-API";
            cb(null, file);
        });
}

exports.generateDocs = generateDocs;
