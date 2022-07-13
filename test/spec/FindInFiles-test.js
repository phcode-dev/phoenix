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

    describe("FindInFiles", function () {
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
                //SpecRunnerUtils.simulateKeyEvent(KeyEvent.DOM_VK_RETURN, "keydown", $searchField[0]);
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

        describe("Find", function () {
            beforeEach(function () {
                openProject(defaultSourcePath);
            });

            afterEach(closeSearchBar);

            it("should find all occurences in project", function () {
                openSearchBar();
                executeSearch("foo");

                runs(function () {
                    var fileResults = FindInFiles.searchModel.results[testPath + "/bar.txt"];
                    expect(fileResults).toBeFalsy();

                    fileResults = FindInFiles.searchModel.results[testPath + "/foo.html"];
                    expect(fileResults).toBeTruthy();
                    expect(fileResults.matches.length).toBe(7);

                    fileResults = FindInFiles.searchModel.results[testPath + "/foo.js"];
                    expect(fileResults).toBeTruthy();
                    expect(fileResults.matches.length).toBe(4);

                    fileResults = FindInFiles.searchModel.results[testPath + "/css/foo.css"];
                    expect(fileResults).toBeTruthy();
                    expect(fileResults.matches.length).toBe(3);
                });
            });

            it("should ignore known binary file types", function () {
                var $dlg, actualMessage, expectedMessage,
                    exists = false,
                    done = false,
                    imageDirPath = testPath + "/images";

                runs(function () {
                    // Set project to have only images
                    SpecRunnerUtils.loadProjectInTestWindow(imageDirPath);

                    // Verify an image exists in folder
                    var file = FileSystem.getFileForPath(testPath + "/images/icon_twitter.png");

                    file.exists(function (fileError, fileExists) {
                        exists = fileExists;
                        done = true;
                    });
                });

                waitsFor(function () {
                    return done;
                }, "file.exists");

                runs(function () {
                    expect(exists).toBe(true);
                    openSearchBar();
                });

                runs(function () {
                    // Launch filter editor
                    FileFilters.editFilter({ name: "", patterns: [] }, -1);

                    // Dialog should state there are 0 files in project
                    $dlg = $(".modal");
                    expectedMessage = StringUtils.format(Strings.FILTER_FILE_COUNT_ALL, 0, Strings.FIND_IN_FILES_NO_SCOPE);
                });

                // Message loads asynchronously, but dialog should eventually state: "Allows all 0 files in project"
                waitsFor(function () {
                    actualMessage   = $dlg.find(".exclusions-filecount").text();
                    return (actualMessage === expectedMessage);
                }, "display file count");

                runs(function () {
                    // Dismiss filter dialog (OK button is disabled, have to click on Cancel)
                    $dlg.find(".dialog-button[data-button-id='cancel']").click();

                    // Close search bar
                    var $searchField = $(".modal-bar #find-group input");
                    SpecRunnerUtils.simulateKeyEvent(KeyEvent.DOM_VK_ESCAPE, "keydown", $searchField[0]);
                });

                runs(function () {
                    // Set project back to main test folder
                    SpecRunnerUtils.loadProjectInTestWindow(testPath);
                });
            });

            it("should ignore unreadable files", function () {
                // Add a nonexistent file to the ProjectManager.getAllFiles() result, which will force a file IO error
                // when we try to read the file later. Similar errors may arise in real-world for non-UTF files, etc.
                SpecRunnerUtils.injectIntoGetAllFiles(testWindow, testPath + "/doesNotExist.txt");

                openSearchBar();
                executeSearch("foo");

                runs(function () {
                    expect(Object.keys(FindInFiles.searchModel.results).length).toBe(3);
                });
            });

            it("should find all occurences in folder", function () {
                var dirEntry = FileSystem.getDirectoryForPath(testPath + "/css/");
                openSearchBar(dirEntry);
                executeSearch("foo");

                runs(function () {
                    var fileResults = FindInFiles.searchModel.results[testPath + "/bar.txt"];
                    expect(fileResults).toBeFalsy();

                    fileResults = FindInFiles.searchModel.results[testPath + "/foo.html"];
                    expect(fileResults).toBeFalsy();

                    fileResults = FindInFiles.searchModel.results[testPath + "/foo.js"];
                    expect(fileResults).toBeFalsy();

                    fileResults = FindInFiles.searchModel.results[testPath + "/css/foo.css"];
                    expect(fileResults).toBeTruthy();
                    expect(fileResults.matches.length).toBe(3);
                });
            });

            it("should find all occurences in single file", function () {
                var fileEntry = FileSystem.getFileForPath(testPath + "/foo.js");
                openSearchBar(fileEntry);
                executeSearch("foo");

                runs(function () {
                    var fileResults = FindInFiles.searchModel.results[testPath + "/bar.txt"];
                    expect(fileResults).toBeFalsy();

                    fileResults = FindInFiles.searchModel.results[testPath + "/foo.html"];
                    expect(fileResults).toBeFalsy();

                    fileResults = FindInFiles.searchModel.results[testPath + "/foo.js"];
                    expect(fileResults).toBeTruthy();
                    expect(fileResults.matches.length).toBe(4);

                    fileResults = FindInFiles.searchModel.results[testPath + "/css/foo.css"];
                    expect(fileResults).toBeFalsy();
                });
            });

            it("should verify the contents of searchHistory array", function () {
                var fileEntry = FileSystem.getFileForPath(testPath + "/foo.js");
                openSearchBar(fileEntry);
                executeSearch("foo1");
                runs(function () {
                    var $searchField = $("#find-what");
                    SpecRunnerUtils.simulateKeyEvent(KeyEvent.DOM_VK_RETURN, "keydown", $searchField[0]);
                });
                executeSearch("foo2");
                runs(function () {
                    var $searchField = $("#find-what");
                    SpecRunnerUtils.simulateKeyEvent(KeyEvent.DOM_VK_RETURN, "keydown", $searchField[0]);
                });
                executeSearch("foo3");
                runs(function () {
                    var $searchField = $("#find-what");
                    SpecRunnerUtils.simulateKeyEvent(KeyEvent.DOM_VK_RETURN, "keydown", $searchField[0]);
                });
                executeSearch("foo4");
                runs(function () {
                    var $searchField = $("#find-what");
                    SpecRunnerUtils.simulateKeyEvent(KeyEvent.DOM_VK_RETURN, "keydown", $searchField[0]);
                });
                executeSearch("foo5");

                runs(function () {
                    var searchHistory = PreferencesManager.getViewState("searchHistory");
                    expect(searchHistory.length).toBe(4);
                    expect(searchHistory).toEqual(["foo4", "foo3", "foo2", "foo1"]);
                });
            });

            it("should traverse through search history using arrow down key", function () {
                var fileEntry = FileSystem.getFileForPath(testPath + "/foo.js");
                openSearchBar(fileEntry);
                executeSearch("foo1");
                executeSearch("foo2");
                executeSearch("foo3");
                executeSearch("foo4");
                executeSearch("foo5");

                runs(function () {
                    var searchHistory = PreferencesManager.getViewState("searchHistory");
                    var $searchField = $("#find-what");

                    $("#find-what").val("");
                    SpecRunnerUtils.simulateKeyEvent(KeyEvent.DOM_VK_DOWN, "keydown", $searchField[0]);
                    SpecRunnerUtils.simulateKeyEvent(KeyEvent.DOM_VK_DOWN, "keydown", $searchField[0]);
                    SpecRunnerUtils.simulateKeyEvent(KeyEvent.DOM_VK_RETURN, "keydown", $searchField[0]);
                    expect($("#find-what").val()).toBe("foo5");
                });
            });

            it("should traverse through search history using arrow up key", function () {
                var fileEntry = FileSystem.getFileForPath(testPath + "/foo.js");
                openSearchBar(fileEntry);
                executeSearch("foo1");
                executeSearch("foo2");
                executeSearch("foo3");
                executeSearch("foo4");
                executeSearch("foo5");

                runs(function () {
                    var searchHistory = PreferencesManager.getViewState("searchHistory");
                    var $searchField = $("#find-what");

                    $("#find-what").val("");
                    SpecRunnerUtils.simulateKeyEvent(KeyEvent.DOM_VK_UP, "keydown", $searchField[0]);
                    SpecRunnerUtils.simulateKeyEvent(KeyEvent.DOM_VK_UP, "keydown", $searchField[0]);
                    SpecRunnerUtils.simulateKeyEvent(KeyEvent.DOM_VK_RETURN, "keydown", $searchField[0]);
                    expect($("#find-what").val()).toBe("foo1");
                });
            });

            it("should add element to search history if it is pre-filled in search bar", function () {
                var fileEntry = FileSystem.getFileForPath(testPath + "/foo.js");
                openSearchBar(fileEntry);

                runs(function () {
                    var $searchField = $("#find-what");
                    $searchField.val("some");
                    SpecRunnerUtils.simulateKeyEvent(KeyEvent.DOM_VK_RETURN, "keydown", $searchField[0]);
                    closeSearchBar();
                });

                openSearchBar(fileEntry);

                runs(function () {
                    var searchHistory = PreferencesManager.getViewState("searchHistory");
                    expect(searchHistory[0]).toBe("some");
                    var $searchField = $("#find-what");
                    SpecRunnerUtils.simulateKeyEvent(KeyEvent.DOM_VK_DOWN, "keydown", $searchField[0]);
                    SpecRunnerUtils.simulateKeyEvent(KeyEvent.DOM_VK_DOWN, "keydown", $searchField[0]);
                    SpecRunnerUtils.simulateKeyEvent(KeyEvent.DOM_VK_RETURN, "keydown", $searchField[0]);
                    expect($searchField.val()).toBe("some");
                });
            });

            it("should find start and end positions", function () {
                var filePath = testPath + "/foo.js",
                    fileEntry = FileSystem.getFileForPath(filePath);

                openSearchBar(fileEntry);
                executeSearch("callFoo");

                runs(function () {
                    var fileResults = FindInFiles.searchModel.results[filePath];
                    expect(fileResults).toBeTruthy();
                    expect(fileResults.matches.length).toBe(1);

                    var match = fileResults.matches[0];
                    expect(match.start.ch).toBe(13);
                    expect(match.start.line).toBe(6);
                    expect(match.end.ch).toBe(20);
                    expect(match.end.line).toBe(6);
                });
                closeSearchBar();
            });

            it("should keep dialog and show panel when there are results", function () {
                var filePath = testPath + "/foo.js",
                    fileEntry = FileSystem.getFileForPath(filePath);

                openSearchBar(fileEntry);
                executeSearch("callF");

                // With instant search, the Search Bar should not close on a search
                runs(function () {
                    var fileResults = FindInFiles.searchModel.results[filePath];
                    expect(fileResults).toBeTruthy();
                    expect($("#find-in-files-results").is(":visible")).toBeTruthy();
                    expect($(".modal-bar").length).toBe(1);
                });
            });

            it("should keep dialog and not show panel when there are no results", function () {
                var filePath = testPath + "/bar.txt",
                    fileEntry = FileSystem.getFileForPath(filePath);

                openSearchBar(fileEntry);
                executeSearch("abcdefghi");

                waitsFor(function () {
                    return (FindInFiles._searchDone);
                }, "search complete");

                runs(function () {
                    var result, resultFound = false;

                    // verify searchModel.results Object is empty
                    for (result in FindInFiles.searchModel.results) {
                        if (FindInFiles.searchModel.results.hasOwnProperty(result)) {
                            resultFound = true;
                        }
                    }
                    expect(resultFound).toBe(false);

                    expect($("#find-in-files-results").is(":visible")).toBeFalsy();
                    expect($(".modal-bar").length).toBe(1);

                    // Close search bar
                    var $searchField = $(".modal-bar #find-group input");
                    SpecRunnerUtils.simulateKeyEvent(KeyEvent.DOM_VK_ESCAPE, "keydown", $searchField[0]);
                });
            });

            it("should open file in editor and select text when a result is clicked", function () {
                var filePath = testPath + "/foo.html",
                    fileEntry = FileSystem.getFileForPath(filePath);

                openSearchBar(fileEntry);
                executeSearch("foo");

                runs(function () {
                    // Verify no current document
                    var editor = EditorManager.getActiveEditor();
                    expect(editor).toBeFalsy();

                    // Get panel
                    var $searchResults = $("#find-in-files-results");
                    expect($searchResults.is(":visible")).toBeTruthy();

                    // Get list in panel
                    var $panelResults = $searchResults.find("table.bottom-panel-table tr");
                    expect($panelResults.length).toBe(8);   // 7 hits + 1 file section

                    // First item in list is file section
                    expect($($panelResults[0]).hasClass("file-section")).toBeTruthy();

                    // Click second item which is first hit
                    var $firstHit = $($panelResults[1]);
                    expect($firstHit.hasClass("file-section")).toBeFalsy();
                    $firstHit.click();
                });
                waitsFor(function () {
                    let editor = SearchResultsView._previewEditorForTests;
                    return (editor && editor.document.file.fullPath === filePath);
                }, 1000, "file open");

                runs(function () {
                    // Verify current document
                    let editor = SearchResultsView._previewEditorForTests;
                    expect(editor.document.file.fullPath).toEqual(filePath);

                    // Verify selection
                    expect(editor.getSelectedText().toLowerCase() === "foo");
                    waitsForDone(CommandManager.execute(Commands.FILE_CLOSE_ALL), "closing all files");
                });
            });

            it("should open file in working set when a result is double-clicked", function () {
                var filePath = testPath + "/foo.js",
                    fileEntry = FileSystem.getFileForPath(filePath);

                openSearchBar(fileEntry);
                executeSearch("foo");

                runs(function () {
                    // Verify document is not yet in working set
                    expect(MainViewManager.findInWorkingSet(MainViewManager.ALL_PANES, filePath)).toBe(-1);

                    // Get list in panel
                    var $panelResults = $("#find-in-files-results table.bottom-panel-table tr");
                    expect($panelResults.length).toBe(5);   // 4 hits + 1 file section

                    // Double-click second item which is first hit
                    var $firstHit = $($panelResults[1]);
                    expect($firstHit.hasClass("file-section")).toBeFalsy();
                    $firstHit.dblclick();

                    waitsFor(function () {
                        return MainViewManager.findInWorkingSet(MainViewManager.ALL_PANES, filePath) !== -1;
                    }, 1000, "indexing complete");

                    waitsForDone(CommandManager.execute(Commands.FILE_CLOSE_ALL), "closing all files");
                });
            });

            it("should update results when a result in a file is edited", function () {
                var filePath = testPath + "/foo.html",
                    fileEntry = FileSystem.getFileForPath(filePath),
                    panelListLen = 8,   // 7 hits + 1 file section
                    $panelResults;

                openSearchBar(fileEntry);
                executeSearch("foo");

                runs(function () {
                    // Verify document is not yet in working set
                    expect(MainViewManager.findInWorkingSet(MainViewManager.ALL_PANES, filePath)).toBe(-1);

                    // Get list in panel
                    $panelResults = $("#find-in-files-results table.bottom-panel-table tr");
                    expect($panelResults.length).toBe(panelListLen);

                    // Click second item which is first hit
                    var $firstHit = $($panelResults[1]);
                    expect($firstHit.hasClass("file-section")).toBeFalsy();
                    $firstHit.click();
                });

                // Wait for file to open if not already open
                waitsFor(function () {
                    let editor = SearchResultsView._previewEditorForTests;
                    return (editor && editor.document.file.fullPath === filePath);
                }, 1000, "file open");

                // Wait for selection to change (this happens asynchronously after file opens)
                waitsFor(function () {
                    let editor = SearchResultsView._previewEditorForTests,
                        sel = editor.getSelection();
                    return (sel.start.line === 4 && sel.start.ch === 7);
                }, 1000, "selection change");

                runs(function () {
                    // Verify current selection
                    let editor = SearchResultsView._previewEditorForTests;
                    expect(editor.getSelectedText().toLowerCase()).toBe("foo");

                    // Edit text to remove hit from file
                    var sel = editor.getSelection();
                    editor.document.replaceRange("Bar", sel.start, sel.end);
                });

                // Panel is updated asynchronously
                waitsFor(function () {
                    $panelResults = $("#find-in-files-results table.bottom-panel-table tr");
                    return ($panelResults.length < panelListLen);
                }, "Results panel updated");

                runs(function () {
                    // Verify list automatically updated
                    expect($panelResults.length).toBe(panelListLen - 1);

                    waitsForDone(CommandManager.execute(Commands.FILE_CLOSE_ALL, { _forceClose: true }), "closing file");
                });
            });

            it("should not clear the model until next search is actually committed", function () {
                var filePath = testPath + "/foo.js",
                    fileEntry = FileSystem.getFileForPath(filePath);

                openSearchBar(fileEntry);
                executeSearch("foo");

                runs(function () {
                    expect(Object.keys(FindInFiles.searchModel.results).length).not.toBe(0);
                });

                closeSearchBar();
                openSearchBar(fileEntry);

                runs(function () {
                    // Search model shouldn't be cleared from merely reopening search bar
                    expect(Object.keys(FindInFiles.searchModel.results).length).not.toBe(0);
                });

                closeSearchBar();

                runs(function () {
                    // Search model shouldn't be cleared after search bar closed without running a search
                    expect(Object.keys(FindInFiles.searchModel.results).length).not.toBe(0);
                });
            });
        });
    });
});
