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
const glob = require("glob");
const path = require("path");
const fs = require('fs');

const TAG_INCLUDE_IN_API_DOCS = "INCLUDE_IN_API_DOCS";
const FILE_NAME_SUFFIX = '-API',
    MD_EXT = '.md';

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
 * @param cb
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
    documentation.build(file.path, {})
        .then(documentation.formats.md)
        .then(markdownDocStr => {
            file.contents = Buffer.from(markdownDocStr);
            file.extname = MD_EXT;
            file.stem = file.stem + FILE_NAME_SUFFIX;
            cb(null, file);
        });
}

function getIndexMarkdown(docRoot, filePaths) {
    let markdown = "# API docs\nThe list of all APIs for phoenix.\n";
    for(let filePath of filePaths){
        let relativePathToDocRoot = filePath.replace(docRoot, ''); // Eg. utils/Metrics-API.md
        let fileName = path.basename(relativePathToDocRoot); // Metrics-API.md
        let hrefName = path.parse(fileName).name; //Metrics-API
        let suffixLength = FILE_NAME_SUFFIX.length + MD_EXT.length; // len(-API.md)
        let apiFullName = relativePathToDocRoot.slice(0, -suffixLength); // utils/Metrics
        markdown += `\n1. [${apiFullName}](${hrefName})`;
        console.log("processing file: ", relativePathToDocRoot);
    }
    return markdown;
}

async function _getAllDocFiles(docRoot) {
    return new Promise((resolve, reject)=>{
        let getDirectories = function (src, callback) {
            glob(src + '/**/*.md', callback);
        };
        getDirectories(docRoot, function (err, res) {
            if (err) {
                reject(err);
            } else {
                resolve(res);
            }
        });
    });
}

async function generateDocIndex(docRoot) {
    if(!docRoot.endsWith("/")){
        docRoot = docRoot + "/";
    }
    const indexFileName = `${docRoot}gitHubIndex.md`;
    let allDocFiles = await _getAllDocFiles(docRoot);
    let indexMarkdown = getIndexMarkdown(docRoot, allDocFiles);
    console.log("creating index file: ", indexFileName);
    fs.writeFileSync(indexFileName, indexMarkdown);
}

exports.generateDocs = generateDocs;
exports.generateDocIndex = generateDocIndex;
