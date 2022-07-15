/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
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

/*eslint-env node */
/*jslint node: true */
/*global getFileContentsForFile, files, crawlComplete */

var MAX_DISPLAY_LENGTH = 200,
    MAX_TOTAL_RESULTS = 100000, // only 100,000 search results are supported
    MAX_RESULTS_IN_A_FILE = MAX_TOTAL_RESULTS,
    MAX_RESULTS_TO_RETURN = 120;

var results = {},
    numMatches = 0,
    numFiles = 0,
    evaluatedMatches,
    foundMaximum = false,
    exceedsMaximum = false,
    savedSearchObject = null,
    lastSearchedIndex = 0,
    collapseResults = false;

/**
 * Copied from StringUtils.js
 * Returns a line number corresponding to an offset in some text. The text can
 * be specified as a single string or as an array of strings that correspond to
 * the lines of the string.
 *
 * Specify the text in lines when repeatedly calling the function on the same
 * text in a loop. Use getLines() to divide the text into lines, then repeatedly call
 * this function to compute a line number from the offset.
 *
 * @param {string | Array.<string>} textOrLines - string or array of lines from which
 *      to compute the line number from the offset
 * @param {number} offset
 * @return {number} line number
 */
function offsetToLineNum(textOrLines, offset) {
    if (Array.isArray(textOrLines)) {
        var lines = textOrLines,
            total = 0,
            line;
        for (line = 0; line < lines.length; line++) {
            if (total < offset) {
                // add 1 per line since /n were removed by splitting, but they needed to
                // contribute to the total offset count
                total += lines[line].length + 1;
            } else if (total === offset) {
                return line;
            } else {
                return line - 1;
            }
        }

        // if offset is NOT over the total then offset is in the last line
        if (offset <= total) {
            return line - 1;
        }
        return undefined;

    }
    return textOrLines.substr(0, offset).split("\n").length - 1;

}

/**
 * Searches through the contents and returns an array of matches
 * @param {string} contents
 * @param {RegExp} queryExpr
 * @return {!Array.<{start: {line:number,ch:number}, end: {line:number,ch:number}, line: string}>}
 */
function getSearchMatches(contents, queryExpr) {
    if (!contents) {
        return;
    }
    // Quick exit if not found or if we hit the limit
    if (foundMaximum || contents.search(queryExpr) === -1) {
        return [];
    }

    var match, lineNum, line, ch, totalMatchLength, matchedLines, numMatchedLines, lastLineLength, endCh,
        padding, leftPadding, rightPadding, highlightOffset, highlightEndCh,
        lines   = contents.split("\n"),
        matches = [];

    while ((match = queryExpr.exec(contents)) !== null) {
        lineNum          = offsetToLineNum(lines, match.index);
        line             = lines[lineNum];
        ch               = match.index - contents.lastIndexOf("\n", match.index) - 1;  // 0-based index
        matchedLines     = match[0].split("\n");
        numMatchedLines  = matchedLines.length;
        totalMatchLength = match[0].length;
        lastLineLength   = matchedLines[matchedLines.length - 1].length;
        endCh            = (numMatchedLines === 1 ? ch + totalMatchLength : lastLineLength);
        highlightEndCh   = (numMatchedLines === 1 ? endCh : line.length);
        highlightOffset  = 0;

        if (highlightEndCh <= MAX_DISPLAY_LENGTH) {
            // Don't store more than 200 chars per line
            line = line.substr(0, Math.min(MAX_DISPLAY_LENGTH, line.length));
        } else if (totalMatchLength > MAX_DISPLAY_LENGTH) {
            // impossible to display the whole match
            line = line.substr(ch, ch + MAX_DISPLAY_LENGTH);
            highlightOffset = ch;
        } else {
            // Try to have both beginning and end of match displayed
            padding = MAX_DISPLAY_LENGTH - totalMatchLength;
            rightPadding = Math.floor(Math.min(padding / 2, line.length - highlightEndCh));
            leftPadding = Math.ceil(padding - rightPadding);
            highlightOffset = ch - leftPadding;
            line = line.substring(highlightOffset, highlightEndCh + rightPadding);
        }

        matches.push({
            start: {line: lineNum, ch: ch},
            end: {line: lineNum + numMatchedLines - 1, ch: endCh},

            highlightOffset: highlightOffset,

            // Note that the following offsets from the beginning of the file are *not* updated if the search
            // results change. These are currently only used for multi-file replacement, and we always
            // abort the replace (by shutting the results panel) if we detect any result changes, so we don't
            // need to keep them up to date. Eventually, we should either get rid of the need for these (by
            // doing everything in terms of line/ch offsets, though that will require re-splitting files when
            // doing a replace) or properly update them.
            startOffset: match.index,
            endOffset: match.index + totalMatchLength,

            line: line,
            result: match,
            isChecked: true
        });

        // We have the max hits in just this 1 file. Stop searching this file.
        // This fixed issue #1829 where code hangs on too many hits.
        // Adds one over MAX_RESULTS_IN_A_FILE in order to know if the search has exceeded
        // or is equal to MAX_RESULTS_IN_A_FILE. Additional result removed in SearchModel
        if (matches.length > MAX_RESULTS_IN_A_FILE) {
            queryExpr.lastIndex = 0;
            break;
        }

        // Pathological regexps like /^/ return 0-length matches. Ensure we make progress anyway
        if (totalMatchLength === 0) {
            queryExpr.lastIndex++;
        }
    }

    return matches;
}

/**
 * Sets the list of matches for the given path, removing the previous match info, if any, and updating
 * the total match count. Note that for the count to remain accurate, the previous match info must not have
 * been mutated since it was set.
 * @param {string} fullpath Full path to the file containing the matches.
 * @param {!{matches: Object, collapsed: boolean=}} resultInfo Info for the matches to set:
 *      matches - Array of matches, in the format returned by FindInFiles.getSearchMatches()
 *      collapsed - Optional: whether the results should be collapsed in the UI (default false).
 */
function setResults(fullpath, resultInfo, maxResultsToReturn) {
    if (results[fullpath]) {
        numMatches -= results[fullpath].matches.length;
        delete results[fullpath];
    }

    if (foundMaximum || !resultInfo || !resultInfo.matches || !resultInfo.matches.length) {
        return;
    }

    // Make sure that the optional `collapsed` property is explicitly set to either true or false,
    // to avoid logic issues later with comparing values.
    resultInfo.collapsed = collapseResults;

    results[fullpath] = resultInfo;
    numMatches += resultInfo.matches.length;
    evaluatedMatches += resultInfo.matches.length;
    maxResultsToReturn = maxResultsToReturn || MAX_RESULTS_TO_RETURN;
    if (numMatches >= maxResultsToReturn || evaluatedMatches > MAX_TOTAL_RESULTS) {
        foundMaximum = true;
    }
}

/**
 * Finds search results in the given file and adds them to 'results'
 * @param {string} filepath
 * @param {string} text   contents of the file
 * @param {Object} queryExpr
 * @param {number} maxResultsToReturn the maximum of results that should be returned in the current search.
 */
function doSearchInOneFile(filepath, text, queryExpr, maxResultsToReturn) {
    var matches = getSearchMatches(text, queryExpr);
    setResults(filepath, {matches: matches}, maxResultsToReturn);
}

/**
 * Search in the list of files given and populate the results
 * @param {array} fileList           array of file paths
 * @param {Object} queryExpr
 * @param {number} startFileIndex    the start index of the array from which the search has to be done
 * @param {number} maxResultsToReturn  the maximum number of results to return in this search
 */
async function doSearchInFiles(fileList, queryExpr, startFileIndex, maxResultsToReturn) {
    var i;
    if (fileList.length === 0) {
        console.log('no files found');
        return;

    }
    startFileIndex = startFileIndex || 0;
    for (i = startFileIndex; i < fileList.length && !foundMaximum; i++) {
        let contents = await getFileContentsForFile(fileList[i]);
        doSearchInOneFile(fileList[i], contents, queryExpr, maxResultsToReturn);
    }
    lastSearchedIndex = i;

}

// Copied from StringUtils.js
function regexEscape(str) {
    return str.replace(/([.?*+\^$\[\]\\(){}|\-])/g, "\\$1");
}

/**
 * Parses the given query into a regexp, and returns whether it was valid or not.
 * @param {{query: string, caseSensitive: boolean, isRegexp: boolean}} queryInfo
 * @return {{queryExpr: RegExp, valid: boolean, empty: boolean, error: string}}
 *      queryExpr - the regexp representing the query
 *      valid - set to true if query is a nonempty string or a valid regexp.
 *      empty - set to true if query was empty.
 *      error - set to an error string if valid is false and query is nonempty.
 */
function parseQueryInfo(queryInfo) {
    var queryExpr;

    // TODO: only major difference between this one and the one in FindReplace is that
    // this always returns a regexp even for simple strings. Reconcile.
    if (!queryInfo || !queryInfo.query) {
        return {empty: true};
    }

    // For now, treat all matches as multiline (i.e. ^/$ match on every line, not the whole
    // document). This is consistent with how single-file find works. Eventually we should add
    // an option for this.
    var flags = "gm";
    if (!queryInfo.isCaseSensitive) {
        flags += "i";
    }

    // Is it a (non-blank) regex?
    if (queryInfo.isRegexp) {
        try {
            queryExpr = new RegExp(queryInfo.query, flags);
        } catch (e) {
            return {valid: false, error: e.message};
        }
    } else {
        // Query is a plain string. Turn it into a regexp
        queryExpr = new RegExp(regexEscape(queryInfo.query), flags);
    }
    return {valid: true, queryExpr: queryExpr};
}

/**
 * Counts the number of matches matching the queryExpr in the given contents
 * @param   {String} contents  The contents to search on
 * @param   {Object} queryExpr
 * @return {number} number of matches
 */
function countNumMatches(contents, queryExpr) {
    if (!contents) {
        return 0;
    }
    var matches = contents.match(queryExpr);
    return matches ? matches.length : 0;
}

/**
 * Get the total number of matches from all the files in fileList
 * @param   {array} fileList  file path array
 * @param   {Object} queryExpr
 * @return {Number} total number of matches
 */
async function getNumMatches(fileList, queryExpr) {
    let i,
        matches = 0;
    for (i = 0; i < fileList.length; i++) {
        let contents = await getFileContentsForFile(fileList[i]);
        let temp = countNumMatches(contents, queryExpr);
        if (temp) {
            numFiles++;
            matches += temp;
        }
        if (matches > MAX_TOTAL_RESULTS) {
            exceedsMaximum = true;
            break;
        }
    }
    return matches;
}

/**
 * Do a search with the searchObject context and return the results
 * @param   {Object}   searchObject
 * @param   {boolean} nextPages    set to true if to indicate that next page of an existing page is being fetched
 * @return {Object}   search results
 */
async function doSearch(searchObject, nextPages) {

    savedSearchObject = searchObject;
    if (!files) {
        console.log("file indexer: search was called before indexing or there are no files in project!");
        return {
            "results": {},
            "foundMaximum": false,
            "exceedsMaximum": false
        };
    }
    results = {};
    numMatches = 0;
    numFiles = 0;
    foundMaximum = false;
    if (!nextPages) {
        exceedsMaximum = false;
        evaluatedMatches = 0;
    }
    var queryObject = parseQueryInfo(searchObject.queryInfo);
    if (searchObject.files) {
        files = searchObject.files;
    }
    if (searchObject.getAllResults) {
        searchObject.maxResultsToReturn = MAX_TOTAL_RESULTS;
    }
    await doSearchInFiles(files, queryObject.queryExpr, searchObject.startFileIndex, searchObject.maxResultsToReturn);
    if (crawlComplete && !nextPages) {
        numMatches = await getNumMatches(files, queryObject.queryExpr);
    }
    var send_object = {
        "results": results,
        "foundMaximum": foundMaximum,
        "exceedsMaximum": exceedsMaximum
    };

    if (!nextPages) {
        send_object.numMatches = numMatches;
        send_object.numFiles = numFiles;
    }

    if (searchObject.getAllResults) {
        send_object.allResultsAvailable = true;
    }
    return send_object;
}

/**
 * Gets the next page of results of the ongoing search
 * @return {Object} search results
 */
async function getNextPage() {
    var send_object = {
        "results": {},
        "numMatches": 0,
        "foundMaximum": foundMaximum,
        "exceedsMaximum": exceedsMaximum
    };
    if (!savedSearchObject) {
        return send_object;
    }
    savedSearchObject.startFileIndex = lastSearchedIndex;
    return await doSearch(savedSearchObject, true);
}

/**
 * Gets all the results for the saved search query if present or empty search results
 * @return {Object} The results object
 */
async function getAllResults() {
    var send_object = {
        "results": {},
        "numMatches": 0,
        "foundMaximum": foundMaximum,
        "exceedsMaximum": exceedsMaximum
    };
    if (!savedSearchObject) {
        return send_object;
    }
    savedSearchObject.startFileIndex = 0;
    savedSearchObject.getAllResults = true;
    return await doSearch(savedSearchObject);
}

/**
 * Sets if the results should be collapsed
 * @param {boolean} collapse true to collapse
 */
function setCollapseResults(collapse) {
    collapseResults = collapse;
}
