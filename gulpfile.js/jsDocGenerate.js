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
const Comments = require('parse-comments');

const TAG_INCLUDE_IN_API_DOCS = "INCLUDE_IN_API_DOCS",
    TAG_PRIVATE ="private";

/**
 * Generate markdown documentation for all files labelled with @INCLUDE_IN_API_DOCS into the docs folder.
 * @param file
 * @returns {*}
 */
function processFile(file) {
    // For file properties https://gulpjs.com/docs/en/api/vinyl/
    const code = file.contents.toString();
    if(code.includes("@"+ TAG_INCLUDE_IN_API_DOCS)){
        console.log("Generating Doc for: ", file.relative);
        file.contents = Buffer.from(getAPIDoc(code));
        file.extname = ".md";
        return file;
    }
}

/**
 * TODO:
 * @param {string} eventType
 * @param {string} [eventType="df"]
 * @param {string} [eventType]
 * @param {string?} [eventType]
 * @param {string!} [eventType]
 * @return
 * @returns
 * @arg - same as param
 * @argument - same as param
 */

function isCommentIncludesTag(comment, tagName) {
    for(let tag of comment.tags){
        if(tag.title === tagName){
            return true;
        }
    }
    return false;
}

function processComment(comment) {
    if(comment.type !== 'BlockComment' || isCommentIncludesTag(comment, TAG_PRIVATE)){
        return '';
    }
    let output = "\n";
    let commentStr = comment.value;
    // console.log(comment);
    return output+ commentStr;
}

function getAPIDoc(srcCode) {
    const comments = new Comments();
    const ast = comments.parse(srcCode);
    let apiDocMarkDown = "";
    for(let comment of ast){
        apiDocMarkDown += processComment(comment);
    }
    return apiDocMarkDown;
}

exports.processFile = processFile;
