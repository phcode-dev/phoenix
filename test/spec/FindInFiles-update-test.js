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

    describe("FindInFiles- update", function () {
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

        describe("SearchModel update on change events", function () {
            var oldResults, gotChange, wasQuickChange;

            function fullTestPath(path) {
                return testPath + "/" + path;
            }

            function expectUnchangedExcept(paths) {
                Object.keys(FindInFiles.searchModel.results).forEach(function (path) {
                    if (paths.indexOf(path) === -1) {
                        expect(FindInFiles.searchModel.results[path]).toEqual(oldResults[path]);
                    }
                });
            }

            beforeEach(function () {
                gotChange = false;
                oldResults = null;
                wasQuickChange = false;

                FindInFiles.clearSearch(); // calls FindInFiles.searchModel.clear internally
                FindInFiles.searchModel.on("change.FindInFilesTest", function (event, quickChange) {
                    gotChange = true;
                    wasQuickChange = quickChange;
                });

                openTestProjectCopy(defaultSourcePath);
                doSearch({
                    queryInfo: {query: "foo"},
                    numMatches: 14
                });
                waitsFor(function () {
                    return FindInFiles.searchModel && FindInFiles.searchModel.results;
                }, 1000, "search completed");
                runs(function () {
                    oldResults = _.cloneDeep(FindInFiles.searchModel.results);
                });
            });

            afterEach(function () {
                FindInFiles.searchModel.off(".FindInFilesTest");
                waitsForDone(CommandManager.execute(Commands.FILE_CLOSE_ALL, { _forceClose: true }), "close all files");
            });

            describe("when filename changes", function () {
                it("should handle a filename change", function () {
                    runs(function () {
                        FindInFiles._fileNameChangeHandler(null, fullTestPath("foo.html"), fullTestPath("newfoo.html"));
                    });
                    waitsFor(function () { return gotChange; }, "model change event");
                    runs(function () {
                        expectUnchangedExcept([fullTestPath("foo.html"), fullTestPath("newfoo.html")]);
                        expect(FindInFiles.searchModel.results[fullTestPath("foo.html")]).toBeUndefined();
                        expect(FindInFiles.searchModel.results[fullTestPath("newfoo.html")]).toEqual(oldResults[fullTestPath("foo.html")]);
                        expect(FindInFiles.searchModel.countFilesMatches()).toEqual({files: 3, matches: 14});
                        expect(wasQuickChange).toBeFalsy();
                    });
                });

                it("should handle a folder change", function () {
                    runs(function () {
                        FindInFiles._fileNameChangeHandler(null, fullTestPath("css"), fullTestPath("newcss"));
                    });
                    waitsFor(function () { return gotChange; }, "model change event");
                    runs(function () {
                        expectUnchangedExcept([fullTestPath("css/foo.css"), fullTestPath("newcss/foo.css")]);
                        expect(FindInFiles.searchModel.results[fullTestPath("css/foo.css")]).toBeUndefined();
                        expect(FindInFiles.searchModel.results[fullTestPath("newcss/foo.css")]).toEqual(oldResults[fullTestPath("css/foo.css")]);
                        expect(FindInFiles.searchModel.countFilesMatches()).toEqual({files: 3, matches: 14});
                        expect(wasQuickChange).toBeFalsy();
                    });
                });
            });

            describe("when in-memory document changes", function () {
                it("should update the results when a matching line is added, updating line numbers and adding the match", function () {
                    waitms(2000);
                    runs(function () {
                        waitsForDone(CommandManager.execute(Commands.CMD_ADD_TO_WORKINGSET_AND_OPEN, { fullPath: fullTestPath("foo.html") }));
                    });
                    runs(function () {
                        var doc = DocumentManager.getOpenDocumentForPath(fullTestPath("foo.html")),
                            i;
                        expect(doc).toBeTruthy();

                        // Insert another line containing "foo" immediately above the second "foo" match.
                        doc.replaceRange("this is a foo instance\n", {line: 5, ch: 0});

                        // This should update synchronously.
                        expect(gotChange).toBe(true);

                        var oldFileResults = oldResults[fullTestPath("foo.html")],
                            newFileResults = FindInFiles.searchModel.results[fullTestPath("foo.html")];

                        // First match should be unchanged.
                        expect(newFileResults.matches[0]).toEqual(oldFileResults.matches[0]);

                        // Next match should be the new match. We just check the offsets here, not everything in the match record.
                        expect(newFileResults.matches[1].start).toEqual({line: 5, ch: 10});
                        expect(newFileResults.matches[1].end).toEqual({line: 5, ch: 13});

                        // Rest of the matches should have had their lines adjusted.
                        for (i = 2; i < newFileResults.matches.length; i++) {
                            var newMatch = newFileResults.matches[i],
                                oldMatch = oldFileResults.matches[i - 1];
                            expect(newMatch.start).toEqual({line: oldMatch.start.line + 1, ch: oldMatch.start.ch});
                            expect(newMatch.end).toEqual({line: oldMatch.end.line + 1, ch: oldMatch.end.ch});
                        }

                        // There should be one new match.
                        expect(FindInFiles.searchModel.countFilesMatches()).toEqual({files: 3, matches: 15});

                        // Make sure the model is adding the flag that will make the view debounce changes.
                        expect(wasQuickChange).toBeTruthy();
                    });
                });

                it("should update the results when a matching line is deleted, updating line numbers and removing the match", function () {
                    waitms(2000);
                    runs(function () {
                        waitsForDone(CommandManager.execute(Commands.CMD_ADD_TO_WORKINGSET_AND_OPEN, { fullPath: fullTestPath("foo.html") }));
                    });
                    runs(function () {
                        var doc = DocumentManager.getOpenDocumentForPath(fullTestPath("foo.html")),
                            i;
                        expect(doc).toBeTruthy();

                        // Remove the second "foo" match.
                        doc.replaceRange("", {line: 5, ch: 0}, {line: 6, ch: 0});

                        // This should update synchronously.
                        expect(gotChange).toBe(true);

                        var oldFileResults = oldResults[fullTestPath("foo.html")],
                            newFileResults = FindInFiles.searchModel.results[fullTestPath("foo.html")];

                        // First match should be unchanged.
                        expect(newFileResults.matches[0]).toEqual(oldFileResults.matches[0]);

                        // Second match should be deleted. The rest of the matches should have their lines adjusted.
                        for (i = 1; i < newFileResults.matches.length; i++) {
                            var newMatch = newFileResults.matches[i],
                                oldMatch = oldFileResults.matches[i + 1];
                            expect(newMatch.start).toEqual({line: oldMatch.start.line - 1, ch: oldMatch.start.ch});
                            expect(newMatch.end).toEqual({line: oldMatch.end.line - 1, ch: oldMatch.end.ch});
                        }

                        // There should be one fewer match.
                        expect(FindInFiles.searchModel.countFilesMatches()).toEqual({files: 3, matches: 13});

                        // Make sure the model is adding the flag that will make the view debounce changes.
                        expect(wasQuickChange).toBeTruthy();
                    });
                });

                it("should replace matches in a portion of the document that was edited to include a new match", function () {
                    waitms(2000);
                    runs(function () {
                        waitsForDone(CommandManager.execute(Commands.CMD_ADD_TO_WORKINGSET_AND_OPEN, { fullPath: fullTestPath("foo.html") }));
                    });
                    runs(function () {
                        var doc = DocumentManager.getOpenDocumentForPath(fullTestPath("foo.html")),
                            i;
                        expect(doc).toBeTruthy();

                        // Replace the second and third foo matches (on two adjacent lines) with a single foo match on a single line.
                        doc.replaceRange("this is a new foo match\n", {line: 5, ch: 0}, {line: 7, ch: 0});

                        // This should update synchronously.
                        expect(gotChange).toBe(true);

                        var oldFileResults = oldResults[fullTestPath("foo.html")],
                            newFileResults = FindInFiles.searchModel.results[fullTestPath("foo.html")];

                        // First match should be unchanged.
                        expect(newFileResults.matches[0]).toEqual(oldFileResults.matches[0]);

                        // Second match should be changed to reflect the new position.
                        expect(newFileResults.matches[1].start).toEqual({line: 5, ch: 14});
                        expect(newFileResults.matches[1].end).toEqual({line: 5, ch: 17});

                        // Third match should be deleted. The rest of the matches should have their lines adjusted.
                        for (i = 2; i < newFileResults.matches.length; i++) {
                            var newMatch = newFileResults.matches[i],
                                oldMatch = oldFileResults.matches[i + 1];
                            expect(newMatch.start).toEqual({line: oldMatch.start.line - 1, ch: oldMatch.start.ch});
                            expect(newMatch.end).toEqual({line: oldMatch.end.line - 1, ch: oldMatch.end.ch});
                        }

                        // There should be one fewer match.
                        expect(FindInFiles.searchModel.countFilesMatches()).toEqual({files: 3, matches: 13});

                        // Make sure the model is adding the flag that will make the view debounce changes.
                        expect(wasQuickChange).toBeTruthy();
                    });
                });

                it("should completely remove the document from the results list if all matches in the document are deleted", function () {
                    waitms(2000);
                    runs(function () {
                        waitsForDone(CommandManager.execute(Commands.CMD_ADD_TO_WORKINGSET_AND_OPEN, { fullPath: fullTestPath("foo.html") }));
                    });
                    runs(function () {
                        var doc = DocumentManager.getOpenDocumentForPath(fullTestPath("foo.html"));
                        expect(doc).toBeTruthy();

                        // Replace all matches and check that the entire file was removed from the results list.
                        doc.replaceRange("this will not match", {line: 4, ch: 0}, {line: 18, ch: 0});

                        // This should update synchronously.
                        expect(gotChange).toBe(true);
                        expect(FindInFiles.searchModel.results[fullTestPath("foo.html")]).toBeUndefined();

                        // There should be one fewer file and the matches for that file should be gone.
                        expect(FindInFiles.searchModel.countFilesMatches()).toEqual({files: 2, matches: 7});

                        // Make sure the model is adding the flag that will make the view debounce changes.
                        expect(wasQuickChange).toBeTruthy();
                    });
                });
            });

            // Unfortunately, we can't easily mock file changes, so we just do them in a copy of the project.
            // This set of tests isn't as thorough as it could be, because it's difficult to perform file
            // ops that will exercise all possible scenarios of change events (e.g. change events with
            // both added and removed files), and conversely it's difficult to mock all the filesystem stuff
            // without doing a bunch of work. So this is really just a set of basic sanity tests to make
            // sure that stuff being refactored between the change handler and the model doesn't break
            // basic update functionality.
            describe("when on-disk file or folder changes", function () {
                it("should add matches for a new file", function () {
                    var newFilePath;
                    runs(function () {
                        newFilePath = fullTestPath("newfoo.html");
                        expect(FindInFiles.searchModel.results[newFilePath]).toBeFalsy();
                        waitsForDone(promisify(FileSystem.getFileForPath(newFilePath), "write", "this is a new foo match\n"), "add new file");
                    });
                    waitsFor(function () { return gotChange; }, "model change event");
                    runs(function () {
                        var newFileResults = FindInFiles.searchModel.results[newFilePath];
                        expect(newFileResults).toBeTruthy();
                        expect(newFileResults.matches.length).toBe(1);
                        expect(newFileResults.matches[0].start).toEqual({line: 0, ch: 14});
                        expect(newFileResults.matches[0].end).toEqual({line: 0, ch: 17});

                        // There should be one new file and match.
                        expect(FindInFiles.searchModel.countFilesMatches()).toEqual({files: 4, matches: 15});
                    });
                });

                it("should remove matches for a deleted file", function () {
                    runs(function () {
                        expect(FindInFiles.searchModel.results[fullTestPath("foo.html")]).toBeTruthy();
                        waitsForDone(promisify(FileSystem.getFileForPath(fullTestPath("foo.html")), "unlink"), "delete file");
                    });
                    waitsFor(function () { return gotChange; }, "model change event");
                    runs(function () {
                        expect(FindInFiles.searchModel.results[fullTestPath("foo.html")]).toBeFalsy();

                        // There should be one fewer file and the matches should be removed.
                        expect(FindInFiles.searchModel.countFilesMatches()).toEqual({files: 2, matches: 7});
                    });
                });

                it("should remove matches for a deleted folder", function () {
                    runs(function () {
                        expect(FindInFiles.searchModel.results[fullTestPath("css/foo.css")]).toBeTruthy();
                        waitsForDone(promisify(FileSystem.getFileForPath(fullTestPath("css")), "unlink"), "delete folder");
                    });
                    waitsFor(function () { return gotChange; }, "model change event");
                    runs(function () {
                        expect(FindInFiles.searchModel.results[fullTestPath("css/foo.css")]).toBeFalsy();

                        // There should be one fewer file and the matches should be removed.
                        expect(FindInFiles.searchModel.countFilesMatches()).toEqual({files: 2, matches: 11});
                    });
                });
            });
        });
    });
});
