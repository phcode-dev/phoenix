/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 * Original work Copyright (c) 2014 - 2021 Adobe Systems Incorporated. All rights reserved.
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

/*jslint regexp: true */
/*global describe, it, expect, beforeFirst, afterLast, beforeEach, afterEach, waits, waitsFor, waitsForDone, runs, spyOn */

define(function (require, exports, module) {


    var Commands        = require("command/Commands"),
        KeyEvent        = require("utils/KeyEvent"),
        SpecRunnerUtils = require("spec/SpecRunnerUtils"),
        FileSystemError = require("filesystem/FileSystemError"),
        FileUtils       = require("file/FileUtils"),
        FindUtils       = require("search/FindUtils"),
        Async           = require("utils/Async"),
        LanguageManager = require("language/LanguageManager"),
        StringUtils     = require("utils/StringUtils"),
        Strings         = require("strings"),
        _               = require("thirdparty/lodash");

    var PreferencesManager;

    var promisify = Async.promisify; // for convenience

    describe("FindInFiles - Paging", function () {
        function waitms(timeout) {
            let waitDone = false;
            setTimeout(()=>{
                waitDone = true;
            }, timeout);
            waitsFor(function () {
                return waitDone;
            }, timeout + 100, "wait done");
        }

        this.category = "integration";

        var defaultSourcePath = SpecRunnerUtils.getTestPath("/spec/FindReplace-test-files"),
            testPath,
            nextFolderIndex = 1,
            searchResults,
            CommandManager,
            DocumentManager,
            MainViewManager,
            EditorManager,
            FileFilters,
            FileSystem,
            File,
            FindInFiles,
            FindUtilsWin,
            FindInFilesUI,
            ProjectManager,
            SearchResultsView,
            testWindow,
            $,
            indexingComplete = false;

        beforeFirst(function () {
            SpecRunnerUtils.createTempDirectory();

            // Create a new window that will be shared by ALL tests in this spec.
            SpecRunnerUtils.createTestWindowAndRun(this, function (w) {
                testWindow = w;

                // Load module instances from brackets.test
                CommandManager      = testWindow.brackets.test.CommandManager;
                DocumentManager     = testWindow.brackets.test.DocumentManager;
                EditorManager       = testWindow.brackets.test.EditorManager;
                FileFilters         = testWindow.brackets.test.FileFilters;
                FileSystem          = testWindow.brackets.test.FileSystem;
                File                = testWindow.brackets.test.File;
                FindUtilsWin        = testWindow.brackets.test.FindUtils;
                FindInFiles         = testWindow.brackets.test.FindInFiles;
                FindInFilesUI       = testWindow.brackets.test.FindInFilesUI;
                ProjectManager      = testWindow.brackets.test.ProjectManager;
                MainViewManager     = testWindow.brackets.test.MainViewManager;
                SearchResultsView   = testWindow.brackets.test.SearchResultsView;
                $                   = testWindow.$;
                PreferencesManager  = testWindow.brackets.test.PreferencesManager;
                PreferencesManager.set("findInFiles.nodeSearch", false);
                PreferencesManager.set("findInFiles.instantSearch", false);
                PreferencesManager.set("maxSearchHistory", 5);
                FindUtilsWin.on(FindUtils.SEARCH_INDEXING_STARTED, ()=>{
                    indexingComplete = false;
                });
                FindUtilsWin.on(FindUtils.SEARCH_INDEXING_FINISHED, ()=>{
                    indexingComplete = true;
                });
            });
        });

        afterLast(function () {
            CommandManager      = null;
            DocumentManager     = null;
            EditorManager       = null;
            FileSystem          = null;
            File                = null;
            FindInFiles         = null;
            FindInFilesUI       = null;
            ProjectManager      = null;
            MainViewManager     = null;
            $                   = null;
            testWindow          = null;
            PreferencesManager  = null;
            SpecRunnerUtils.closeTestWindow();
            SpecRunnerUtils.removeTempDirectory();
        });

        function openProject(sourcePath) {
            testPath = sourcePath;
            SpecRunnerUtils.loadProjectInTestWindow(testPath);
        }


        // Note: these utilities can be called without wrapping in a runs() block, because all their top-level
        // statements are calls to runs() or waitsFor() (or other functions that make the same guarantee). But after
        // calling one of these, calls to other Jasmine APIs (e.g. such as expects()) *must* be wrapped in runs().

        function waitForSearchBarClose() {
            // Make sure search bar from previous test has animated out fully
            waitsFor(function () {
                return $(".modal-bar").length === 0;
            }, "search bar close");
        }

        function openSearchBar(scope, showReplace) {
            runs(function () {
                FindInFiles._searchDone = false;
                FindInFilesUI._showFindBar(scope, showReplace);
            });
            waitsFor(function () {
                return $(".modal-bar").length === 1;
            }, "search bar open");
            runs(function () {
                // Reset the regexp and case-sensitivity toggles.
                ["#find-regexp", "#find-case-sensitive"].forEach(function (button) {
                    if ($(button).is(".active")) {
                        $(button).click();
                        expect($(button).is(".active")).toBe(false);
                    }
                });
            });
        }

        function closeSearchBar() {
            runs(function () {
                FindInFilesUI._closeFindBar();
            });
            waitForSearchBarClose();
        }

        function executeSearch(searchString) {
            waitsFor(function () {
                return indexingComplete;
            }, "indexing complete");
            runs(function () {
                var $searchField = $("#find-what");
                $searchField.val(searchString).trigger("input");
                SpecRunnerUtils.simulateKeyEvent(KeyEvent.DOM_VK_RETURN, "keydown", $searchField[0]);
            });
            waitsFor(function () {
                return FindInFiles._searchDone;
            }, "Find in Files done");
        }

        function numMatches(results) {
            return _.reduce(_.pluck(results, "matches"), function (sum, matches) {
                return sum + matches.length;
            }, 0);
        }

        function doSearch(options) {
            waitsFor(function () {
                return indexingComplete;
            }, "indexing complete");
            runs(function () {
                FindInFiles.doSearchInScope(options.queryInfo, null, null, options.replaceText).done(function (results) {
                    searchResults = results;
                });
            });
            waitsFor(function () { return searchResults; }, 1000, "search completed");
            runs(function () {
                expect(numMatches(searchResults)).toBe(options.numMatches);
            });
            waitsFor(function () {
                return FindInFiles._searchDone;
            }, "Find in Files done");
        }


        // The functions below are *not* safe to call without wrapping in runs(), if there were any async steps previously
        // (including calls to any of the utilities above)

        function doReplace(options) {
            return FindInFiles.doReplace(searchResults, options.replaceText, {
                forceFilesOpen: options.forceFilesOpen,
                isRegexp: options.queryInfo.isRegexp
            });
        }

        /**
         * Helper function that calls the given asynchronous processor once on each file in the given subtree
         * and returns a promise that's resolved when all files are processed.
         * @param {string} rootPath The root of the subtree to search.
         * @param {function(string, string): $.Promise} processor The function that processes each file. Args are:
         *      contents: the contents of the file
         *      fullPath: the full path to the file on disk
         * @return {$.Promise} A promise that is resolved when all files are processed, or rejected if there was
         *      an error reading one of the files or one of the process steps was rejected.
         */
        function visitAndProcessFiles(rootPath, processor) {
            var rootEntry = FileSystem.getDirectoryForPath(rootPath),
                files = [];

            function visitor(file) {
                if (!file.isDirectory) {
                    // Skip binary files, since we don't care about them for these purposes and we can't read them
                    // to get their contents.
                    if (!LanguageManager.getLanguageForPath(file.fullPath).isBinary()) {
                        files.push(file);
                    }
                }
                return true;
            }
            return promisify(rootEntry, "visit", visitor).then(function () {
                return Async.doInParallel(files, function (file) {
                    return promisify(file, "read").then(function (contents) {
                        return processor(contents, file.fullPath);
                    });
                });
            });
        }

        function ensureParentExists(file) {
            var parentDir = FileSystem.getDirectoryForPath(file.parentPath);
            return promisify(parentDir, "exists").then(function (exists) {
                if (!exists) {
                    return promisify(parentDir, "create");
                }
                return null;
            });
        }

        function copyWithLineEndings(src, dest, lineEndings) {
            function copyOneFileWithLineEndings(contents, srcPath) {
                var destPath = dest + srcPath.slice(src.length),
                    destFile = FileSystem.getFileForPath(destPath),
                    newContents = FileUtils.translateLineEndings(contents, lineEndings);
                return ensureParentExists(destFile).then(function () {
                    return promisify(destFile, "write", newContents);
                });
            }

            return promisify(FileSystem.getDirectoryForPath(dest), "create").then(function () {
                return visitAndProcessFiles(src, copyOneFileWithLineEndings);
            });
        }

        // Creates a clean copy of the test project before each test. We don't delete the old
        // folders as we go along (to avoid problems with deleting the project out from under the
        // open test window); we just delete the whole temp folder at the end.
        function openTestProjectCopy(sourcePath, lineEndings) {
            testPath = SpecRunnerUtils.getTempDirectory() + "/find-in-files-test-" + (nextFolderIndex++);
            runs(function () {
                if (lineEndings) {
                    waitsForDone(copyWithLineEndings(sourcePath, testPath, lineEndings), "copy test files with line endings");
                } else {
                    // Note that we don't skip image files in this case, but it doesn't matter since we'll
                    // only compare files that have an associated file in the known goods folder.
                    waitsForDone(SpecRunnerUtils.copy(sourcePath, testPath), "copy test files");
                }
            });
            SpecRunnerUtils.loadProjectInTestWindow(testPath);
        }

        beforeEach(function () {
            searchResults = null;
        });

        describe("Find results paging", function () {
            var expectedPages = [
                {
                    totalResults: 500,
                    totalFiles: 2,
                    overallFirstIndex: 1,
                    overallLastIndex: 100,
                    matchRanges: [{file: 0, filename: "manyhits-1.txt", first: 0, firstLine: 1, last: 99, lastLine: 100, pattern: /i'm going to\s+find this\s+now/}],
                    firstPageEnabled: false,
                    lastPageEnabled: true,
                    prevPageEnabled: false,
                    nextPageEnabled: true
                },
                {
                    totalResults: 500,
                    totalFiles: 2,
                    overallFirstIndex: 101,
                    overallLastIndex: 200,
                    matchRanges: [{file: 0, filename: "manyhits-1.txt", first: 0, firstLine: 101, last: 99, lastLine: 200, pattern: /i'm going to\s+find this\s+now/}],
                    firstPageEnabled: true,
                    lastPageEnabled: true,
                    prevPageEnabled: true,
                    nextPageEnabled: true
                },
                {
                    totalResults: 500,
                    totalFiles: 2,
                    overallFirstIndex: 201,
                    overallLastIndex: 300,
                    matchRanges: [
                        {file: 0, filename: "manyhits-1.txt", first: 0, firstLine: 201, last: 49, lastLine: 250, pattern: /i'm going to\s+find this\s+now/},
                        {file: 1, filename: "manyhits-2.txt", first: 0, firstLine: 1, last: 49, lastLine: 50, pattern: /you're going to\s+find this\s+now/}
                    ],
                    firstPageEnabled: true,
                    lastPageEnabled: true,
                    prevPageEnabled: true,
                    nextPageEnabled: true
                },
                {
                    totalResults: 500,
                    totalFiles: 2,
                    overallFirstIndex: 301,
                    overallLastIndex: 400,
                    matchRanges: [{file: 0, filename: "manyhits-2.txt", first: 0, firstLine: 51, last: 99, lastLine: 150, pattern: /you're going to\s+find this\s+now/}],
                    firstPageEnabled: true,
                    lastPageEnabled: true,
                    prevPageEnabled: true,
                    nextPageEnabled: true
                },
                {
                    totalResults: 500,
                    totalFiles: 2,
                    overallFirstIndex: 401,
                    overallLastIndex: 500,
                    matchRanges: [{file: 0, filename: "manyhits-2.txt", first: 0, firstLine: 151, last: 99, lastLine: 250, pattern: /you're going to\s+find this\s+now/}],
                    firstPageEnabled: true,
                    lastPageEnabled: false,
                    prevPageEnabled: true,
                    nextPageEnabled: false
                }
            ];

            function expectPageDisplay(options) {
                // Check the title
                let match = $("#find-in-files-results .title").text().match("\\b" + options.totalResults + "\\b");
                expect(match).toBeTruthy();
                match = $("#find-in-files-results .title").text().match("\\b" + options.totalFiles + "\\b");
                expect(match).toBeTruthy();
                var paginationInfo = $("#find-in-files-results .pagination-col").text();
                match = paginationInfo.match("\\b" + options.overallFirstIndex + "\\b");
                expect(match).toBeTruthy();
                match = paginationInfo.match("\\b" + options.overallLastIndex + "\\b");
                expect(match).toBeTruthy();

                // Check for presence of file and first/last item rows within each file
                options.matchRanges.forEach(function (range) {
                    let $fileRow = $("#find-in-files-results tr.file-section[data-file-index='" + range.file + "']");
                    expect($fileRow.length).toBe(1);
                    let fileName = $fileRow.find(".dialog-filename").text();
                    expect(fileName).toEqual(range.filename);

                    let $firstMatchRow = $("#find-in-files-results tr[data-file-index='" + range.file + "'][data-item-index='" + range.first + "']");
                    expect($firstMatchRow.length).toBe(1);
                    match = $firstMatchRow.find(".line-number").text().match("\\b" + range.firstLine + "\\b");
                    expect(match).toBeTruthy();
                    match = $firstMatchRow.find(".line-text").text().match(range.pattern);
                    expect(match).toBeTruthy();

                    let $lastMatchRow = $("#find-in-files-results tr[data-file-index='" + range.file + "'][data-item-index='" + range.last + "']");
                    expect($lastMatchRow.length).toBe(1);
                    match = $lastMatchRow.find(".line-number").text().match("\\b" + range.lastLine + "\\b");
                    expect(match).toBeTruthy();
                    match = $lastMatchRow.find(".line-text").text().match(range.pattern);
                    expect(match).toBeTruthy();
                });

                // Check enablement of buttons
                let disabled = $("#find-in-files-results .first-page").hasClass("disabled");
                expect(disabled).toBe(!options.firstPageEnabled);
                disabled = $("#find-in-files-results .last-page").hasClass("disabled");
                expect(disabled).toBe(!options.lastPageEnabled);
                disabled = $("#find-in-files-results .prev-page").hasClass("disabled");
                expect(disabled).toBe(!options.prevPageEnabled);
                disabled = $("#find-in-files-results .next-page").hasClass("disabled");
                expect(disabled).toBe(!options.nextPageEnabled);
            }

            it("should page forward, then jump back to first page, displaying correct contents at each step", function () {
                openProject(SpecRunnerUtils.getTestPath("/spec/FindReplace-test-files-manyhits"));
                openSearchBar();

                // This search will find 500 hits in 2 files. Since there are 100 hits per page, there should
                // be five pages, and the third page should have 50 results from the first file and 50 results
                // from the second file.
                executeSearch("find this");

                runs(function () {
                    $("#find-in-files-results .next-page").click();
                    waitms(2000);
                });
                runs(function () {
                    expectPageDisplay(expectedPages[1]);
                });
                runs(function () {
                    $("#find-in-files-results .next-page").click();
                    waitms(2000);
                });
                runs(function () {
                    expectPageDisplay(expectedPages[2]);
                });
                runs(function () {
                    $("#find-in-files-results .first-page").click();
                    waitms(2000);
                });
                runs(function () {
                    expectPageDisplay(expectedPages[0]);
                });
            });

            it("should jump to last page, then page backward, displaying correct contents at each step", function () {
                openProject(SpecRunnerUtils.getTestPath("/spec/FindReplace-test-files-manyhits"));

                executeSearch("find this");

                runs(function () {
                    $("#find-in-files-results .last-page").click();
                    waitms(2000);
                });
                runs(function () {
                    expectPageDisplay(expectedPages[4]);
                });
                runs(function () {
                    $("#find-in-files-results .prev-page").click();
                    waitms(2000);
                });
                runs(function () {
                    expectPageDisplay(expectedPages[3]);
                });
                openProject(defaultSourcePath);
                waitms(2000);
            });
        });
    });
});
