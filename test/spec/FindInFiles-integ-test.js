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
/*global describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, awaits, awaitsFor, awaitsForDone, spyOn */

define(function (require, exports, module) {


    var Commands        = require("command/Commands"),
        KeyEvent        = require("utils/KeyEvent"),
        SpecRunnerUtils = require("spec/SpecRunnerUtils"),
        StringUtils     = require("utils/StringUtils"),
        Strings         = require("strings");

    var PreferencesManager;

    describe("search:FindInFiles", function () {

        var defaultSourcePath = SpecRunnerUtils.getTestPath("/spec/FindReplace-test-files"),
            testPath,
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
            $;

        beforeAll(async function () {
            await SpecRunnerUtils.createTempDirectory();

            // Create a new window that will be shared by ALL tests in this spec.
            testWindow = await SpecRunnerUtils.createTestWindowAndRun();
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
        }, 30000);

        afterAll(async function () {
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
            await SpecRunnerUtils.closeTestWindow();
            await SpecRunnerUtils.removeTempDirectory();
        });

        async function openProject(sourcePath) {
            testPath = sourcePath;
            await SpecRunnerUtils.loadProjectInTestWindow(testPath);
        }


        // Note: these utilities can be called without wrapping in a runs() block, because all their top-level
        // statements are calls to runs() or await awaitsFor() (or other functions that make the same guarantee). But after
        // calling one of these, calls to other Jasmine APIs (e.g. such as expects()) *must* be wrapped in runs().

        async function waitForSearchBarClose() {
            // Make sure search bar from previous test has animated out fully
            await awaitsFor(function () {
                return $(".modal-bar").length === 0;
            }, "search bar close");
        }

        async function openSearchBar(scope, showReplace) {
            FindInFiles._searchDone = false;
            FindInFilesUI._showFindBar(scope, showReplace);
            await awaitsFor(function () {
                return $(".modal-bar").length === 1;
            }, "search bar open");
            // Reset the regexp and case-sensitivity toggles.
            ["#find-regexp", "#find-case-sensitive"].forEach(function (button) {
                if ($(button).is(".active")) {
                    $(button).click();
                    expect($(button).is(".active")).toBe(false);
                }
            });
        }

        async function closeSearchBar() {
            FindInFilesUI._closeFindBar();
            await waitForSearchBarClose();
        }

        async function executeSearch(searchString) {
            await awaitsFor(function () {
                return FindInFiles.isProjectIndexingComplete();
            }, "indexing complete", 20000);
            var $searchField = $("#find-what");
            FindInFiles._searchDone = false;
            $searchField.val(searchString).trigger("input");
            await awaitsFor(function () {
                return FindInFiles._searchDone;
            }, "Find in Files done");
        }

        beforeEach(function () {
            searchResults = null;
        });

        describe("Find", function () {
            beforeEach(async function () {
                await openProject(defaultSourcePath);
                await openSearchBar();
                await awaitsFor(function () {
                    return FindInFiles.isProjectIndexingComplete();
                }, "indexing complete", 20000);
            }, 30000);

            afterEach(async function () {
                await closeSearchBar();
            });

            it("should find all occurences in project", async function () {
                await openSearchBar();
                await executeSearch("foo");

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
            }, 10000);

            it("should ignore known binary file types", async function () {
                var $dlg, actualMessage, expectedMessage,
                    exists = false,
                    done = false,
                    imageDirPath = testPath + "/images";

                // Set project to have only images
                await SpecRunnerUtils.loadProjectInTestWindow(imageDirPath);

                // Verify an image exists in folder
                var file = FileSystem.getFileForPath(testPath + "/images/icon_twitter.png");

                file.exists(function (fileError, fileExists) {
                    exists = fileExists;
                    done = true;
                });

                await awaitsFor(function () {
                    return done;
                }, "file.exists");

                expect(exists).toBe(true);
                await openSearchBar();

                // Launch filter editor
                FileFilters.editFilter({ name: "", patterns: [] }, -1);

                // Dialog should state there are 0 files in project
                $dlg = $(".modal");
                expectedMessage = StringUtils.format(Strings.FILTER_FILE_COUNT_ALL, 0, Strings.FIND_IN_FILES_NO_SCOPE);

                // Message loads asynchronously, but dialog should eventually state: "Allows all 0 files in project"
                await awaitsFor(function () {
                    actualMessage   = $dlg.find(".exclusions-filecount").text();
                    return (actualMessage === expectedMessage);
                }, "display file count");

                // Dismiss filter dialog (OK button is disabled, have to click on Cancel)
                $dlg.find(".dialog-button[data-button-id='cancel']").click();

                // Close search bar
                var $searchField = $(".modal-bar #find-group input");
                SpecRunnerUtils.simulateKeyEvent(KeyEvent.DOM_VK_ESCAPE, "keydown", $searchField[0]);

                // Set project back to main test folder
                await SpecRunnerUtils.loadProjectInTestWindow(testPath);
            });

            it("should ignore unreadable files", async function () {
                // Add a nonexistent file to the ProjectManager.getAllFiles() result, which will force a file IO error
                // when we try to read the file later. Similar errors may arise in real-world for non-UTF files, etc.
                SpecRunnerUtils.injectIntoGetAllFiles(testWindow, testPath + "/doesNotExist.txt");

                await openSearchBar();
                await executeSearch("foo");

                expect(Object.keys(FindInFiles.searchModel.results).length).toBe(3);
            });

            it("should find all occurences in folder", async function () {
                var dirEntry = FileSystem.getDirectoryForPath(testPath + "/css/");
                await openSearchBar(dirEntry);
                await executeSearch("foo");

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

            it("should find all occurences in single file", async function () {
                var fileEntry = FileSystem.getFileForPath(testPath + "/foo.js");
                await openSearchBar(fileEntry);
                await executeSearch("foo");

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

            it("should verify the contents of searchHistory array", async function () {
                PreferencesManager.setViewState("searchHistory", []);
                var fileEntry = FileSystem.getFileForPath(testPath + "/foo.js");
                await openSearchBar(fileEntry);
                await executeSearch("foo1");
                var $searchField = $("#find-what");
                SpecRunnerUtils.simulateKeyEvent(KeyEvent.DOM_VK_RETURN, "keydown", $searchField[0]);
                await openSearchBar(fileEntry);
                await executeSearch("foo2");
                var $searchField = $("#find-what");
                SpecRunnerUtils.simulateKeyEvent(KeyEvent.DOM_VK_RETURN, "keydown", $searchField[0]);
                await openSearchBar(fileEntry);
                await executeSearch("foo3");
                var $searchField = $("#find-what");
                SpecRunnerUtils.simulateKeyEvent(KeyEvent.DOM_VK_RETURN, "keydown", $searchField[0]);
                await openSearchBar(fileEntry);
                await executeSearch("foo4");
                var $searchField = $("#find-what");
                SpecRunnerUtils.simulateKeyEvent(KeyEvent.DOM_VK_RETURN, "keydown", $searchField[0]);
                await openSearchBar(fileEntry);
                await executeSearch("foo5");

                var searchHistory = PreferencesManager.getViewState("searchHistory");
                const found = searchHistory.some(r=> ["foo4", "foo3", "foo2", "foo1"].includes(r));
                expect(found).toBeTrue();
            }, 10000);

            it("should traverse through results with arrow down/up key", async function () {
                await openSearchBar();
                await executeSearch("foo ");
                var $searchField = $("#find-what");

                let editor;
                await awaitsFor(function () {
                    editor = SearchResultsView._previewEditorForTests;
                    return (editor && editor.document.file.fullPath === "/test/spec/FindReplace-test-files/css/foo.css");
                }, "keyboard nav", 1000);
                SpecRunnerUtils.simulateKeyEvent(KeyEvent.DOM_VK_DOWN, "keydown", $searchField[0]);
                await awaitsFor(function () {
                    editor = SearchResultsView._previewEditorForTests;
                    return (editor && editor.document.file.fullPath === "/test/spec/FindReplace-test-files/foo.js");
                }, "keyboard nav", 1000);
                SpecRunnerUtils.simulateKeyEvent(KeyEvent.DOM_VK_UP, "keydown", $searchField[0]);
                await awaitsFor(function () {
                    editor = SearchResultsView._previewEditorForTests;
                    console.log(editor && editor.document.file.fullPath);
                    return (editor && editor.document.file.fullPath === "/test/spec/FindReplace-test-files/css/foo.css");
                }, "keyboard nav", 1000);
            });

            it("should find start and end positions", async function () {
                var filePath = testPath + "/foo.js",
                    fileEntry = FileSystem.getFileForPath(filePath);

                await openSearchBar(fileEntry);
                await executeSearch("callFoo");

                var fileResults = FindInFiles.searchModel.results[filePath];
                expect(fileResults).toBeTruthy();
                expect(fileResults.matches.length).toBe(1);

                var match = fileResults.matches[0];
                expect(match.start.ch).toBe(13);
                expect(match.start.line).toBe(6);
                expect(match.end.ch).toBe(20);
                expect(match.end.line).toBe(6);
                await closeSearchBar();
            });

            it("should keep dialog and show panel when there are results", async function () {
                var filePath = testPath + "/foo.js",
                    fileEntry = FileSystem.getFileForPath(filePath);

                await openSearchBar(fileEntry);
                await executeSearch("callF");

                // With instant search, the Search Bar should not close on a search
                var fileResults = FindInFiles.searchModel.results[filePath];
                expect(fileResults).toBeTruthy();
                expect($("#find-in-files-results").is(":visible")).toBeTruthy();
                expect($(".modal-bar").length).toBe(1);
            });

            it("should keep dialog and not show panel when there are no results", async function () {
                var filePath = testPath + "/bar.txt",
                    fileEntry = FileSystem.getFileForPath(filePath);

                await openSearchBar(fileEntry);
                await executeSearch("abcdefghi");

                await awaitsFor(function () {
                    return (FindInFiles._searchDone);
                }, "search complete");

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

            it("should open file in preview editor and select text when a result is clicked", async function () {
                await awaitsForDone(CommandManager.execute(Commands.FILE_CLOSE_ALL), "closing all files");
                var filePath = testPath + "/foo.html",
                    fileEntry = FileSystem.getFileForPath(filePath);

                await openSearchBar(fileEntry);
                await executeSearch("foo");

                // Verify no current document
                let editor = EditorManager.getActiveEditor();
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
                await awaitsFor(function () {
                    let editor = SearchResultsView._previewEditorForTests;
                    return (editor && editor.document.file.fullPath === filePath);
                }, "file open", 1000);

                // Verify current document
                editor = SearchResultsView._previewEditorForTests;
                expect(editor.document.file.fullPath).toEqual(filePath);

                // Verify selection
                expect(editor.getSelectedText().toLowerCase() === "foo");
                await awaitsForDone(CommandManager.execute(Commands.FILE_CLOSE_ALL), "closing all files");
            });

            it("should open file in working set when a result is double-clicked", async function () {
                var filePath = testPath + "/foo.js",
                    fileEntry = FileSystem.getFileForPath(filePath);

                await openSearchBar(fileEntry);
                await executeSearch("foo");

                // Verify document is not yet in working set
                expect(MainViewManager.findInWorkingSet(MainViewManager.ALL_PANES, filePath)).toBe(-1);

                // Get list in panel
                var $panelResults = $("#find-in-files-results table.bottom-panel-table tr");
                expect($panelResults.length).toBe(5);   // 4 hits + 1 file section

                // Double-click second item which is first hit
                var $firstHit = $($panelResults[1]);
                expect($firstHit.hasClass("file-section")).toBeFalsy();
                $firstHit.dblclick();

                await awaitsFor(function () {
                    return MainViewManager.findInWorkingSet(MainViewManager.ALL_PANES, filePath) !== -1;
                }, "indexing complete", 1000);

                await awaitsForDone(CommandManager.execute(Commands.FILE_CLOSE_ALL), "closing all files");
            });

            it("should update results when a result in a file is edited", async function () {
                var filePath = testPath + "/foo.html",
                    fileEntry = FileSystem.getFileForPath(filePath),
                    panelListLen = 8,   // 7 hits + 1 file section
                    $panelResults;

                await openSearchBar(fileEntry);
                await executeSearch("foo");

                // Verify document is not yet in working set
                expect(MainViewManager.findInWorkingSet(MainViewManager.ALL_PANES, filePath)).toBe(-1);

                // Get list in panel
                $panelResults = $("#find-in-files-results table.bottom-panel-table tr");
                expect($panelResults.length).toBe(panelListLen);

                // Click second item which is first hit
                var $firstHit = $($panelResults[1]);
                expect($firstHit.hasClass("file-section")).toBeFalsy();
                $firstHit.click();

                // Wait for file to open if not already open
                await awaitsFor(function () {
                    let editor = SearchResultsView._previewEditorForTests;
                    return (editor && editor.document.file.fullPath === filePath);
                },  "file open", 1000);

                // Wait for selection to change (this happens asynchronously after file opens)
                await awaitsFor(function () {
                    let editor = SearchResultsView._previewEditorForTests,
                        sel = editor.getSelection();
                    return (sel.start.line === 4 && sel.start.ch === 7);
                }, "selection change", 1000);

                // Verify current selection
                let editor = SearchResultsView._previewEditorForTests;
                expect(editor.getSelectedText().toLowerCase()).toBe("foo");

                // Edit text to remove hit from file
                var sel = editor.getSelection();
                editor.document.replaceRange("Bar", sel.start, sel.end);

                // Panel is updated asynchronously
                await awaitsFor(function () {
                    $panelResults = $("#find-in-files-results table.bottom-panel-table tr");
                    return ($panelResults.length < panelListLen);
                }, "Results panel updated");

                // Verify list automatically updated
                expect($panelResults.length).toBe(panelListLen - 1);

                await awaitsForDone(CommandManager.execute(Commands.FILE_CLOSE_ALL, { _forceClose: true }), "closing file");
            });

            it("should not clear the model until next search is actually committed", async function () {
                var filePath = testPath + "/foo.js",
                    fileEntry = FileSystem.getFileForPath(filePath);

                await openSearchBar(fileEntry);
                await executeSearch("foo");

                expect(Object.keys(FindInFiles.searchModel.results).length).not.toBe(0);

                await closeSearchBar();
                await openSearchBar(fileEntry);

                // Search model shouldn't be cleared from merely reopening search bar
                expect(Object.keys(FindInFiles.searchModel.results).length).not.toBe(0);

                await closeSearchBar();

                // Search model shouldn't be cleared after search bar closed without running a search
                expect(Object.keys(FindInFiles.searchModel.results).length).not.toBe(0);
            });
        });
    });
});
