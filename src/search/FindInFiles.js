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

/*global Phoenix*/

/*
 * The core search functionality used by Find in Files and single-file Replace Batch.
 */
define(function (require, exports, module) {


    var _                     = require("thirdparty/lodash"),
        FileFilters           = require("search/FileFilters"),
        Async                 = require("utils/Async"),
        StringUtils           = require("utils/StringUtils"),
        ProjectManager        = require("project/ProjectManager"),
        DocumentModule        = require("document/Document"),
        DocumentManager       = require("document/DocumentManager"),
        MainViewManager       = require("view/MainViewManager"),
        FileSystem            = require("filesystem/FileSystem"),
        LanguageManager       = require("language/LanguageManager"),
        SearchModel           = require("search/SearchModel").SearchModel,
        PerfUtils             = require("utils/PerfUtils"),
        FindUtils             = require("search/FindUtils"),
        Metrics               = require("utils/Metrics"),
        IndexingWorker        = require("worker/IndexingWorker");

    let projectIndexingComplete = false;

    IndexingWorker.loadScriptInWorker(`${Phoenix.baseURL}search/worker/search.js`);

    IndexingWorker.on(IndexingWorker.EVENT_CRAWL_COMPLETE, function (_evt, params) {
        workerFileCacheComplete(params);
    });

    IndexingWorker.on(IndexingWorker.EVENT_CRAWL_PROGRESS, function (_evt, params) {
        FindUtils.notifyIndexingProgress(params.processed, params.total);
    });

    let searchScopeChanged = false,
        findOrReplaceInProgress = false,
        changedFileList = {};

    /**
     * Token used to indicate a specific reason for zero search results
     * @const @type {!Object}
     */
    var ZERO_FILES_TO_SEARCH = {};

    /**
     * Maximum length of text displayed in search results panel
     * @const
     */
    var MAX_DISPLAY_LENGTH = 200;

    let CACHE_INIT_DELAY_MS = 1000;

    /**
     * The search query and results model.
     * @type {SearchModel}
     */
    var searchModel = new SearchModel();

    /* Forward declarations */
    var _documentChangeHandler,
        _fileSystemChangeHandler,
        _processCachedFileSystemEvents,
        _debouncedFileSystemChangeHandler,
        _fileNameChangeHandler,
        clearSearch;

    /**
     * Waits for FS changes to stack up until processing them
     * (scripts like npm install can do a lot of movements on the disk)
     * @const
     */
    var FILE_SYSTEM_EVENT_DEBOUNCE_TIME = 100;

    /** Remove the listeners that were tracking potential search result changes */
    function _removeListeners() {
        DocumentModule.off("documentChange", _documentChangeHandler);
        FileSystem.off("change", _debouncedFileSystemChangeHandler);
        DocumentManager.off("fileNameChange", _fileNameChangeHandler);
    }

    /** Add listeners to track events that might change the search result set */
    function _addListeners() {
        // Avoid adding duplicate listeners - e.g. if a 2nd search is run without closing the old results panel first
        _removeListeners();

        DocumentModule.on("documentChange", _documentChangeHandler);
        FileSystem.on("change", _debouncedFileSystemChangeHandler);
        DocumentManager.on("fileNameChange",  _fileNameChangeHandler);
    }

    function workerFileCacheComplete(data) {
        let numFiles = data.numFilesCached,
            cacheSize = data.cacheSizeBytes,
            crawlTime = data.crawlTimeMs;
        projectIndexingComplete = true;
        console.log(`file indexing worker cache complete: ${numFiles} files, size: ${cacheSize} B in ${crawlTime}ms`);
        if (/\/test\/SpecRunner\.html$/.test(window.location.pathname)) {
            // Ignore the event in the SpecRunner window
            return;
        }

        var projectRoot = ProjectManager.getProjectRoot(),
            projectName = projectRoot ? projectRoot.name : null;

        if (!projectName) {
            console.error("'File cache complete' event received, but no project root found");
            projectName = "noName00";
        }

        FindUtils.setInstantSearchDisabled(false);
        FindUtils.notifyIndexingFinished();
        Metrics.valueEvent(Metrics.EVENT_TYPE.SEARCH, "indexing", "numFiles", numFiles);
        Metrics.valueEvent(Metrics.EVENT_TYPE.SEARCH, "indexing", "cacheSizeKB", cacheSize/1024);
        Metrics.valueEvent(Metrics.EVENT_TYPE.SEARCH, "indexing", "crawlTimeMs", crawlTime);
    }

    /**
     * @private
     * Searches through the contents and returns an array of matches
     * @param {string} contents
     * @param {RegExp} queryExpr
     * @return {!Array.<{start: {line:number,ch:number}, end: {line:number,ch:number}, line: string}>}
     */
    function _getSearchMatches(contents, queryExpr) {
        // Quick exit if not found or if we hit the limit
        if (searchModel.foundMaximum || contents.search(queryExpr) === -1) {
            return [];
        }

        var match, lineNum, line, ch, totalMatchLength, matchedLines, numMatchedLines, lastLineLength, endCh,
            padding, leftPadding, rightPadding, highlightOffset, highlightEndCh,
            lines   = StringUtils.getLines(contents),
            matches = [];

        while ((match = queryExpr.exec(contents)) !== null) {
            lineNum          = StringUtils.offsetToLineNum(lines, match.index);
            line             = lines[lineNum];
            ch               = match.index - contents.lastIndexOf("\n", match.index - 1) - 1;  // 0-based index
            matchedLines     = match[0].split("\n");
            numMatchedLines  = matchedLines.length;
            totalMatchLength = match[0].length;
            lastLineLength   = matchedLines[matchedLines.length - 1].length;
            endCh            = (numMatchedLines === 1 ? ch + totalMatchLength : lastLineLength);
            highlightEndCh   = (numMatchedLines === 1 ? endCh : line.length);
            highlightOffset  = 0;

            if (highlightEndCh <= MAX_DISPLAY_LENGTH) {
                // Don't store more than 200 chars per line
                line = line.substr(0, MAX_DISPLAY_LENGTH);
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
            // Adds one over MAX_TOTAL_RESULTS in order to know if the search has exceeded
            // or is equal to MAX_TOTAL_RESULTS. Additional result removed in SearchModel
            if (matches.length > SearchModel.MAX_TOTAL_RESULTS) {
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
     * @private
     * Update the search results using the given list of changes for the given document
     * @param {Document} doc  The Document that changed, should be the current one
     * @param {Array.<{from: {line:number,ch:number}, to: {line:number,ch:number}, text: !Array.<string>}>} changeList
     *      An array of changes as described in the Document constructor
     */
    function _updateResults(doc, changeList) {
        var i, diff, matches, lines, start, howMany,
            resultsChanged = false,
            fullPath       = doc.file.fullPath,
            resultInfo     = searchModel.results[fullPath];

        // Remove the results before we make any changes, so the SearchModel can accurately update its count.
        searchModel.removeResults(fullPath);

        changeList.forEach(function (change) {
            lines = [];
            start = 0;
            howMany = 0;

            // There is no from or to positions, so the entire file changed, we must search all over again
            if (!change.from || !change.to) {
                // TODO: add unit test exercising timestamp logic in this case
                // We don't just call _updateSearchMatches() here because we want to continue iterating through changes in
                // the list and update at the end.
                resultInfo = {matches: _getSearchMatches(doc.getText(), searchModel.queryExpr), timestamp: doc.diskTimestamp};
                resultsChanged = true;

            } else {
                // Get only the lines that changed
                for (i = 0; i < change.text.length; i++) {
                    lines.push(doc.getLine(change.from.line + i));
                }

                // We need to know how many newlines were inserted/deleted in order to update the rest of the line indices;
                // this is the total number of newlines inserted (which is the length of the lines array minus
                // 1, since the last line in the array is inserted without a newline after it) minus the
                // number of original newlines being removed.
                diff = lines.length - 1 - (change.to.line - change.from.line);

                if (resultInfo) {
                    // Search the last match before a replacement, the amount of matches deleted and update
                    // the lines values for all the matches after the change
                    resultInfo.matches.forEach(function (item) {
                        if (item.end.line < change.from.line) {
                            start++;
                        } else if (item.end.line <= change.to.line) {
                            howMany++;
                        } else {
                            item.start.line += diff;
                            item.end.line   += diff;
                        }
                    });

                    // Delete the lines that where deleted or replaced
                    if (howMany > 0) {
                        resultInfo.matches.splice(start, howMany);
                    }
                    resultsChanged = true;
                }

                // Searches only over the lines that changed
                matches = _getSearchMatches(lines.join("\r\n"), searchModel.queryExpr);
                if (matches.length) {
                    // Updates the line numbers, since we only searched part of the file
                    matches.forEach(function (value, key) {
                        matches[key].start.line += change.from.line;
                        matches[key].end.line   += change.from.line;
                    });

                    // If the file index exists, add the new matches to the file at the start index found before
                    if (resultInfo) {
                        Array.prototype.splice.apply(resultInfo.matches, [start, 0].concat(matches));
                    // If not, add the matches to a new file index
                    } else {
                        // TODO: add unit test exercising timestamp logic in self case
                        resultInfo = {
                            matches: matches,
                            collapsed: false,
                            timestamp: doc.diskTimestamp
                        };
                    }
                    resultsChanged = true;
                }
            }
        });

        // Always re-add the results, even if nothing changed.
        if (resultInfo && resultInfo.matches.length) {
            searchModel.setResults(fullPath, resultInfo);
        }

        if (resultsChanged) {
            // Pass `true` for quickChange here. This will make listeners debounce the change event,
            // avoiding lots of updates if the user types quickly.
            searchModel.fireChanged(true);
        }
    }

    /**
     * Checks that the file matches the given subtree scope. To fully check whether the file
     * should be in the search set, use _inSearchScope() instead - a supserset of this.
     *
     * @param {!File} file
     * @param {?FileSystemEntry} scope Search scope, or null if whole project
     * @return {boolean}
     */
    function _subtreeFilter(file, scope) {
        if (scope) {
            if (scope.isDirectory) {
                // Dirs always have trailing slash, so we don't have to worry about being
                // a substring of another dir name
                return file.fullPath.indexOf(scope.fullPath) === 0;
            }
            return file.fullPath === scope.fullPath;

        }
        return true;
    }

    /**
     * Filters out files that are known binary types.
     * @param {string} fullPath
     * @return {boolean} True if the file's contents can be read as text
     */
    function _isReadableFileType(fullPath) {
        return !LanguageManager.getLanguageForPath(fullPath).isBinary();
    }

    /**
     * Finds all candidate files to search in the given scope's subtree that are not binary content. Does NOT apply
     * the current filter yet.
     * @param {?FileSystemEntry} scope Search scope, or null if whole project
     * @return {$.Promise} A promise that will be resolved with the list of files in the scope. Never rejected.
     */
    function getCandidateFiles(scope) {
        function filter(file) {
            return _subtreeFilter(file, scope) && _isReadableFileType(file.fullPath);
        }

        // If the scope is a single file, just check if the file passes the filter directly rather than
        // trying to use ProjectManager.getAllFiles(), both for performance and because an individual
        // in-memory file might be an untitled document that doesn't show up in getAllFiles().
        if (scope && scope.isFile) {
            return new $.Deferred().resolve(filter(scope) ? [scope] : []).promise();
        }
        return ProjectManager.getAllFiles(filter, true, true, {
            scope
        });

    }

    /**
     * Checks that the file is eligible for inclusion in the search (matches the user's subtree scope and
     * file exclusion filters, and isn't binary). Used when updating results incrementally - during the
     * initial search, these checks are done in bulk via getCandidateFiles() and the filterFileList() call
     * after it.
     * @param {!File} file
     * @return {boolean}
     */
    function _inSearchScope(file) {
        // Replicate the checks getCandidateFiles() does
        if (searchModel && searchModel.scope) {
            if (!_subtreeFilter(file, searchModel.scope)) {
                return false;
            }
        } else {
            // Still need to make sure it's within project or working set
            // In getCandidateFiles(), this is covered by the baseline getAllFiles() itself
            if (file.fullPath.indexOf(ProjectManager.getProjectRoot().fullPath) !== 0) {
                if (MainViewManager.findInWorkingSet(MainViewManager.ALL_PANES, file.fullPath) === -1) {
                    return false;
                }
            }
        }

        if (!_isReadableFileType(file.fullPath)) {
            return false;
        }

        // Replicate the filtering filterFileList() does
        return FileFilters.filterPath(searchModel.filter, file.fullPath);
    }


    /**
     * @private
     * Tries to update the search result on document changes
     * @param {$.Event} event
     * @param {Document} document
     * @param {<{from: {line:number,ch:number}, to: {line:number,ch:number}, text: !Array.<string>}>} change
     *      A change list as described in the Document constructor
     */
    _documentChangeHandler = function (event, document, change) {
        changedFileList[document.file.fullPath] = true;
        if (findOrReplaceInProgress && _inSearchScope(document.file)) {
            _updateResults(document, change);
        }
    };

    /**
     * @private
     * Finds search results in the given file and adds them to 'searchResults.' Resolves with
     * true if any matches found, false if none found. Errors reading the file are treated the
     * same as if no results found.
     *
     * Does not perform any filtering - assumes caller has already vetted this file as a search
     * candidate.
     *
     * @param {!File} file
     * @return {$.Promise}
     */
    function _doSearchInOneFile(file) {
        var result = new $.Deferred();

        DocumentManager.getDocumentText(file)
            .done(function (text, timestamp) {
                // Note that we don't fire a model change here, since this is always called by some outer batch
                // operation that will fire it once it's done.
                var matches = _getSearchMatches(text, searchModel.queryExpr);
                searchModel.setResults(file.fullPath, {matches: matches, timestamp: timestamp});
                result.resolve(!!matches.length);
            })
            .fail(function () {
                // Always resolve. If there is an error, this file
                // is skipped and we move on to the next file.
                result.resolve(false);
            });

        return result.promise();
    }

    /**
     * @private
     * Inform worker that the document has changed [along with its contents]
     * @param {string} docPath the path of the changed document
     */
    function _updateDocumentInWorker(docPath) {
        DocumentManager.getDocumentForPath(docPath).done(function (doc) {
            if (doc) {
                var updateObject = {
                    "filePath": docPath,
                    "docContents": doc.getText()
                };
                IndexingWorker.execPeer("documentChanged", updateObject);
            }
        });
    }

    /**
     * @private
     * sends all changed documents that we have tracked to worker
     */
    function _updateChangedDocs() {
        let key = null;
        for (key in changedFileList) {
            if (changedFileList.hasOwnProperty(key)) {
                _updateDocumentInWorker(key);
            }
        }
        changedFileList = {};
    }

    /**
     * @private
     * Executes the Find in Files search inside the current scope.
     * @param {{query: string, caseSensitive: boolean, isRegexp: boolean}} queryInfo Query info object
     * @param {!$.Promise} candidateFilesPromise Promise from getCandidateFiles(), which was called earlier
     * @param {?string} filter A "compiled" filter as returned by FileFilters.compile(), or null for no filter
     * @return {?$.Promise} A promise that's resolved with the search results (or ZERO_FILES_TO_SEARCH) or rejected when the find competes.
     *      Will be null if the query is invalid.
     */
    function _doSearch(queryInfo, candidateFilesPromise, filter) {
        searchModel.filter = filter;

        var queryResult = searchModel.setQueryInfo(queryInfo);
        if (!queryResult) {
            return null;
        }

        var scopeName = searchModel.scope ? searchModel.scope.fullPath : ProjectManager.getProjectRoot().fullPath,
            perfTimer = PerfUtils.markStart("FindIn: " + scopeName + " - " + queryInfo.query);

        findOrReplaceInProgress = true;

        return candidateFilesPromise
            .then(function (fileListResult) {
                // Filter out files/folders that match user's current exclusion filter
                fileListResult = FileFilters.filterFileList(filter, fileListResult);

                if (searchModel.isReplace) {
                    if (fileListResult.length) {
                        searchModel.allResultsAvailable = true;
                        return Async.doInParallel(fileListResult, _doSearchInOneFile);
                    }
                    return ZERO_FILES_TO_SEARCH;

                }

                var searchDeferred = new $.Deferred();

                if (fileListResult.length) {
                    var searchObject;
                    if (searchScopeChanged) {
                        var files = fileListResult
                            .filter(function (entry) {
                                return entry.isFile && _isReadableFileType(entry.fullPath);
                            })
                            .map(function (entry) {
                                return entry.fullPath;
                            });

                        /* The following line prioritizes the open Document in editor and
                         * pushes it to the top of the filelist. */
                        files = FindUtils.prioritizeOpenFile(files, FindUtils.getOpenFilePath());

                        searchObject = {
                            "files": files,
                            "queryInfo": queryInfo,
                            "queryExpr": searchModel.queryExpr
                        };
                        searchScopeChanged = false;
                    } else {
                        searchObject = {
                            "queryInfo": queryInfo,
                            "queryExpr": searchModel.queryExpr
                        };
                    }

                    if (searchModel.isReplace) {
                        searchObject.getAllResults = true;
                    }
                    _updateChangedDocs();
                    FindUtils.notifyWorkerSearchStarted();
                    let searchStatTime = Date.now();
                    IndexingWorker.execPeer("doSearch", searchObject)
                        .then(function (rcvd_object) {
                            FindUtils.notifyWorkerSearchFinished();
                            if (!rcvd_object || !rcvd_object.results) {
                                console.error('search worker failed, falling back to brackets search', rcvd_object);
                                searchDeferred.fail();
                                clearSearch();
                                return;
                            }
                            searchModel.results = rcvd_object.results;
                            searchModel.numMatches = rcvd_object.numMatches;
                            searchModel.numFiles = rcvd_object.numFiles;
                            searchModel.exceedsMaximum = rcvd_object.exceedsMaximum;
                            searchModel.allResultsAvailable = rcvd_object.allResultsAvailable;
                            searchDeferred.resolve();
                            Metrics.valueEvent(Metrics.EVENT_TYPE.SEARCH, "instantSearch",
                                "timeMs", Date.now() - searchStatTime);
                        })
                        .catch(function (err) {
                            FindUtils.notifyWorkerSearchFinished();
                            console.error('worker fails', err);
                            clearSearch();
                            searchDeferred.reject();
                        });
                    return searchDeferred.promise();
                }
                return ZERO_FILES_TO_SEARCH;

            })
            .then(function (zeroFilesToken) {
                exports._searchDone = true; // for unit tests
                PerfUtils.addMeasurement(perfTimer);

                if (zeroFilesToken === ZERO_FILES_TO_SEARCH) {
                    return zeroFilesToken;
                }
                return searchModel.results;

            }, function (err) {
                console.error("find in files failed: ", err);
                PerfUtils.finalizeMeasurement(perfTimer);

                // In jQuery promises, returning the error here propagates the rejection,
                // unlike in Promises/A, where we would need to re-throw it to do so.
                return err;
            });
    }

    /**
     * @private
     * Clears any previous search information, removing update listeners and clearing the model.
     * @param {?Entry} scope Project file/subfolder to search within; else searches whole project.
     */
    clearSearch = function () {
        findOrReplaceInProgress = false;
        searchModel.clear();
    };

    /**
     * Does a search in the given scope with the given filter. Used when you want to start a search
     * programmatically. Make sure that project indexing is complete by calling isProjectIndexingComplete()
     * Else, an empty result will be returned if search is invoked before any files are indexed.
     *
     * @param {{query: string, caseSensitive: boolean, isRegexp: boolean}} queryInfo Query info object
     * @param {?Entry} scope Project file/subfolder to search within; else searches whole project.
     * @param {?string} filter A "compiled" filter as returned by FileFilters.compile(), or null for no filter
     * @param {?string} replaceText If this is a replacement, the text to replace matches with. This is just
     *      stored in the model for later use - the replacement is not actually performed right now.
     * @param {?$.Promise} candidateFilesPromise If specified, a promise that should resolve with the same set of files that
     *      getCandidateFiles(scope) would return.
     * @return {$.Promise} A promise that's resolved with the search results or rejected when the find competes.
     */
    function doSearchInScope(queryInfo, scope, filter, replaceText, candidateFilesPromise) {
        clearSearch();
        searchModel.scope = scope;
        if (replaceText !== undefined) {
            searchModel.isReplace = true;
            searchModel.replaceText = replaceText;
        }
        candidateFilesPromise = candidateFilesPromise || getCandidateFiles(scope);
        return _doSearch(queryInfo, candidateFilesPromise, filter);
    }

    /**
     * Given a set of search results, replaces them with the given replaceText, either on disk or in memory.
     * @param {Object.<fullPath: string, {matches: Array.<{start: {line:number,ch:number}, end: {line:number,ch:number}, startOffset: number, endOffset: number, line: string}>, collapsed: boolean}>} results
     *      The list of results to replace, as returned from _doSearch..
     * @param {string} replaceText The text to replace each result with.
     * @param {?Object} options An options object:
     *      forceFilesOpen: boolean - Whether to open all files in editors and do replacements there rather than doing the
     *          replacements on disk. Note that even if this is false, files that are already open in editors will have replacements
     *          done in memory.
     *      isRegexp: boolean - Whether the original query was a regexp. If true, $-substitution is performed on the replaceText.
     * @return {$.Promise} A promise that's resolved when the replacement is finished or rejected with an array of errors
     *      if there were one or more errors. Each individual item in the array will be a {item: string, error: string} object,
     *      where item is the full path to the file that could not be updated, and error is either a FileSystem error or one
     *      of the `FindInFiles.ERROR_*` constants.
     */
    function doReplace(results, replaceText, options) {
        return FindUtils.performReplacements(results, replaceText, options).always(function () {
            // For UI integration testing only
            exports._replaceDone = true;
        });
    }

    /**
     * @private
     * Flags that the search scope has changed, so that the file list for the following search is recomputed
     */
    var _searchScopeChanged = function () {
        searchScopeChanged = true;
    };

    /**
     * Notify worker that the results should be collapsed
     */
    function _searchcollapseResults() {
        IndexingWorker.execPeer("collapseResults", FindUtils.isCollapsedResults());
    }

    /**
     * Inform worker that the list of files has changed.
     * @param {array} fileList The list of files that changed.
     */
    function filesChanged(fileList) {
        if (!fileList || fileList.length === 0) {
            return;
        }
        var updateObject = {
            "fileList": fileList
        };
        if (searchModel.filter) {
            updateObject.filesInSearchScope = FileFilters.getPathsMatchingFilter(searchModel.filter, fileList);
            _searchScopeChanged();
        }
        IndexingWorker.execPeer("filesChanged", updateObject);
    }

    /**
     * Inform worker that the list of files have been removed.
     * @param {array} fileList The list of files that was removed.
     */
    function filesRemoved(fileList) {
        if (!fileList || fileList.length === 0) {
            return;
        }
        var updateObject = {
            "fileList": fileList
        };
        if (searchModel.filter) {
            updateObject.filesInSearchScope = FileFilters.getPathsMatchingFilter(searchModel.filter, fileList);
            _searchScopeChanged();
        }
        IndexingWorker.execPeer("filesRemoved", updateObject);
    }

    /**
     * @private
     * Moves the search results from the previous path to the new one and updates the results list, if required
     * @param {$.Event} event
     * @param {string} oldName
     * @param {string} newName
     */
    _fileNameChangeHandler = function (event, oldName, newName) {
        var resultsChanged = false;
        let removedFiles = [],
            changedFiles = [];

        // Update the search results
        _.forEach(searchModel.results, function (item, fullPath) {
            if (fullPath.indexOf(oldName) === 0) {
                // worker search : inform worker about the rename
                removedFiles.push(fullPath);
                changedFiles.push(fullPath.replace(oldName, newName));

                if (findOrReplaceInProgress) {
                    searchModel.removeResults(fullPath);
                    searchModel.setResults(fullPath.replace(oldName, newName), item);
                    resultsChanged = true;
                }
            }
        });

        filesRemoved(removedFiles);
        filesChanged(changedFiles);

        if (resultsChanged) {
            searchModel.fireChanged();
        }
    };

    /**
     * @private
     * Updates search results in response to FileSystem "change" event
     * @param {$.Event} event
     * @param {FileSystemEntry} entry
     * @param {Array.<FileSystemEntry>=} added Added children
     * @param {Array.<FileSystemEntry>=} removed Removed children
     */
    _fileSystemChangeHandler = function (event, entry, added, removed) {
        var resultsChanged = false;

        /*
         * Remove existing search results that match the given entry's path
         * @param {Array.<(File|Directory)>} entries
         */
        function _removeSearchResultsForEntries(entries) {
            var fullPaths = [];
            entries.forEach(function (entry) {
                Object.keys(searchModel.results).forEach(function (fullPath) {
                    if (fullPath === entry.fullPath ||
                            (entry.isDirectory && fullPath.indexOf(entry.fullPath) === 0)) {
                        // worker search : inform worker that the file is removed
                        fullPaths.push(fullPath);
                        if (findOrReplaceInProgress) {
                            searchModel.removeResults(fullPath);
                            resultsChanged = true;
                        }
                    }
                });
            });
            // this should be called once with a large array instead of numerous calls with single items
            filesRemoved(fullPaths);
        }

        /*
         * Add new search results for these entries and all of its children
         * @param {Array.<(File|Directory)>} entries
         * @return {jQuery.Promise} Resolves when the results have been added
         */
        function _addSearchResultsForEntries(entries) {
            var fullPaths = [];
            return Async.doInParallel(entries, function (entry) {
                var addedFiles = [],
                    addedFilePaths = [],
                    deferred = new $.Deferred();

                // gather up added files
                var visitor = function (child) {
                    // Replicate filtering that getAllFiles() does
                    if (ProjectManager.shouldIndex(child)) {
                        if (child.isFile && _isReadableFileType(child.name)) {
                            // Re-check the filtering that the initial search applied
                            if (_inSearchScope(child)) {
                                addedFiles.push(child);
                                addedFilePaths.push(child.fullPath);
                            }
                        }
                        return true;
                    }
                    return false;
                };

                entry.visit(visitor, function (err) {
                    if (err) {
                        deferred.reject(err);
                        return;
                    }

                    //worker Search : inform worker about the file changes
                    //filesChanged(addedFilePaths);
                    fullPaths = fullPaths.concat(addedFilePaths);

                    if (findOrReplaceInProgress) {
                        // find additional matches in all added files
                        Async.doInParallel(addedFiles, function (file) {
                            return _doSearchInOneFile(file)
                                .done(function (foundMatches) {
                                    resultsChanged = resultsChanged || foundMatches;
                                });
                        }).always(deferred.resolve);
                    } else {
                        deferred.resolve();
                    }
                });

                return deferred.promise();
            }).always(function () {
                // this should be called once with a large array instead of numerous calls with single items
                filesChanged(fullPaths);
            });
        }

        if (!entry) {
            // TODO: re-execute the search completely?
            return;
        }

        var addPromise;
        if (entry.isDirectory) {
            if (added.length === 0 && removed.length === 0) {
                // If the added or removed sets are null, must redo the search for the entire subtree - we
                // don't know which child files/folders may have been added or removed.
                _removeSearchResultsForEntries([ entry ]);

                var deferred = $.Deferred();
                addPromise = deferred.promise();
                entry.getContents(function (err, entries) {
                    _addSearchResultsForEntries(entries).always(deferred.resolve);
                });
            } else {
                _removeSearchResultsForEntries(removed);
                addPromise = _addSearchResultsForEntries(added);
            }
        } else { // entry.isFile
            _removeSearchResultsForEntries([ entry ]);
            addPromise = _addSearchResultsForEntries([ entry ]);
        }

        addPromise.always(function () {
            // Restore the results if needed
            if (resultsChanged) {
                searchModel.fireChanged();
            }
        });
    };

    /**
     * This stores file system events emitted by watchers that were not yet processed
     */
    var _cachedFileSystemEvents = [];

    /**
     * Debounced function to process emitted file system events
     * for cases when there's a lot of fs events emitted in a very short period of time
     */
    _processCachedFileSystemEvents = _.debounce(function () {
        // we need to reduce _cachedFileSystemEvents not to contain duplicates!
        _cachedFileSystemEvents = _cachedFileSystemEvents.reduce(function (result, obj) {
            var fullPath = obj.entry ? obj.entry.fullPath : null;
            // merge added & removed
            if (result[fullPath] && obj.isDirectory) {
                obj.added = obj.added.concat(result[fullPath].added);
                obj.removed = obj.removed.concat(result[fullPath].removed);
            }
            // use the latest event as base
            result[fullPath] = obj;
            return result;
        }, {});
        _.forEach(_cachedFileSystemEvents, function (obj) {
            _fileSystemChangeHandler(obj.event, obj.entry, obj.added, obj.removed);
        });
        _cachedFileSystemEvents = [];
    }, FILE_SYSTEM_EVENT_DEBOUNCE_TIME);

    /**
     * Wrapper function for _fileSystemChangeHandler which handles all incoming fs events
     * putting them to cache and executing a debounced function
     */
    _debouncedFileSystemChangeHandler = function (event, entry, added, removed) {
        // normalize this here so we don't need to handle null later
        var isDirectory = false;
        if (entry && entry.isDirectory) {
            isDirectory = true;
            added = added || [];
            removed = removed || [];
        }
        _cachedFileSystemEvents.push({
            event: event,
            entry: entry,
            isDirectory: isDirectory,
            added: added,
            removed: removed
        });
        _processCachedFileSystemEvents();
    };

    /**
     * On project change, inform worker about the new list of files that needs to be crawled.
     * Instant search is also disabled for the time being till the crawl is complete in worker.
     *
     * This should never be called directly and only called via _scheduleCacheInit() below
     * to not affect project load performance.
     */
    var _initCache = function () {
        projectIndexingComplete = false;
        function filter(file) {
            return _isReadableFileType(file.fullPath);
        }
        FindUtils.setInstantSearchDisabled(true);

        //we always listen for filesytem changes.
        _addListeners();

        FindUtils.notifyIndexingStarted();
        ProjectManager.getAllFiles(filter, true, true)
            .done(function (fileListResult) {
                var files = fileListResult,
                    filter = FileFilters.getActiveFilter();
                if (filter && filter.patterns.length > 0) {
                    files = FileFilters.filterFileList(FileFilters.compile(filter.patterns), files);
                }
                files = files.filter(function (entry) {
                    return entry.isFile && _isReadableFileType(entry.fullPath);
                }).map(function (entry) {
                    return entry.fullPath;
                });
                IndexingWorker.execPeer("initCache", files);
            });
        _searchScopeChanged();
    };

    function _scheduleCacheInit() {
        projectIndexingComplete = false;
        setTimeout(_initCache, CACHE_INIT_DELAY_MS);
    }


    /**
     * Gets the next page of search results to append to the result set.
     * @return {object} A promise that's resolved with the search results or rejected when the find competes.
     */
    function getNextPageofSearchResults() {
        var searchDeferred = $.Deferred();
        if (searchModel.allResultsAvailable) {
            return searchDeferred.resolve().promise();
        }
        _updateChangedDocs();
        FindUtils.notifyWorkerSearchStarted();
        IndexingWorker.execPeer("nextPage")
            .then(function (rcvd_object) {
                FindUtils.notifyWorkerSearchFinished();
                if (searchModel.results) {
                    var resultEntry;
                    for (resultEntry in rcvd_object.results ) {
                        if (rcvd_object.results.hasOwnProperty(resultEntry)) {
                            searchModel.results[resultEntry.toString()] = rcvd_object.results[resultEntry];
                        }
                    }
                } else {
                    searchModel.results = rcvd_object.results;
                }
                searchModel.fireChanged();
                searchDeferred.resolve();
            })
            .catch(function (err) {
                FindUtils.notifyWorkerSearchFinished();
                console.error('search worker fails', err);
                searchDeferred.reject();
            });
        return searchDeferred.promise();
    }

    function getAllSearchResults() {
        var searchDeferred = $.Deferred();
        if (searchModel.allResultsAvailable) {
            return searchDeferred.resolve().promise();
        }
        _updateChangedDocs();
        FindUtils.notifyWorkerSearchStarted();
        IndexingWorker.execPeer("getAllResults")
            .then(function (rcvd_object) {
                FindUtils.notifyWorkerSearchFinished();
                searchModel.results = rcvd_object.results;
                searchModel.numMatches = rcvd_object.numMatches;
                searchModel.numFiles = rcvd_object.numFiles;
                searchModel.allResultsAvailable = true;
                searchModel.fireChanged();
                searchDeferred.resolve();
            })
            .catch(function (err) {
                FindUtils.notifyWorkerSearchFinished();
                console.error('search worker fails', err);
                searchDeferred.reject();
            });
        return searchDeferred.promise();
    }

    function isProjectIndexingComplete() {
        return projectIndexingComplete;
    }

    ProjectManager.on("projectOpen", _scheduleCacheInit);
    FindUtils.on(FindUtils.SEARCH_FILE_FILTERS_CHANGED, _searchScopeChanged);
    FindUtils.on(FindUtils.SEARCH_SCOPE_CHANGED, _searchScopeChanged);
    FindUtils.on(FindUtils.SEARCH_COLLAPSE_RESULTS, _searchcollapseResults);

    // Public exports
    exports.searchModel               = searchModel;
    exports.isProjectIndexingComplete = isProjectIndexingComplete;
    exports.doSearchInScope           = doSearchInScope;
    exports.doReplace                 = doReplace;
    exports.getCandidateFiles         = getCandidateFiles;
    exports.clearSearch               = clearSearch;
    exports.ZERO_FILES_TO_SEARCH      = ZERO_FILES_TO_SEARCH;
    exports.getNextPageofSearchResults          = getNextPageofSearchResults;
    exports.getAllSearchResults       = getAllSearchResults;

    // For unit tests only
    exports._documentChangeHandler = _documentChangeHandler;
    exports._fileNameChangeHandler = _fileNameChangeHandler;
    exports._fileSystemChangeHandler = _fileSystemChangeHandler;
});
