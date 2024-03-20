/*
 *  Copyright (c) 2021 - present core.ai . All rights reserved.
 *  Original work Copyright (c) 2014 - 2021 Adobe Systems Incorporated. All rights reserved.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the "Software"),
 * to deal in the Software without restriction, including without limitation
 * the rights to use, copy, modify, merge, publish, distribute, sublicense,
 * and/or sell copies of the Software, and to permit persons to whom the
 * Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
 * DEALINGS IN THE SOFTWARE.
 */

/*global describe, it, expect, beforeAll, afterAll, beforeEach, jsPromise, awaitsFor, awaitsForDone, awaits*/
/*unittests: FileFilters*/

define(function (require, exports, module) {


    let SpecRunnerUtils    = require("spec/SpecRunnerUtils"),
        KeyEvent           = require("utils/KeyEvent"),
        Strings            = require("strings");

    describe("integration: FileFilters", function () {

        let testPath = SpecRunnerUtils.getTestPath("/spec/InlineEditorProviders-test-files"),
            testPathGitIgnore,
            Commands,
            testWindow,
            FileFilters,
            FileSystem,
            FindInFiles,
            FindInFilesUI,
            CommandManager,
            $;

        // We don't directly call beforeAll/afterAll here because it appears that we need
        // separate test windows for the nested describe suites.
        async function setupTestWindow() {
            // Create a new window that will be shared by ALL tests in this spec.
            testWindow = await SpecRunnerUtils.createTestWindowAndRun();
            // Load module instances from brackets.test
            FileFilters     = testWindow.brackets.test.FileFilters;
            FileSystem      = testWindow.brackets.test.FileSystem;
            FindInFiles     = testWindow.brackets.test.FindInFiles;
            FindInFilesUI   = testWindow.brackets.test.FindInFilesUI;
            CommandManager  = testWindow.brackets.test.CommandManager;
            Commands        = testWindow.brackets.test.Commands;
            $               = testWindow.$;

            await SpecRunnerUtils.loadProjectInTestWindow(testPath);
            testPathGitIgnore = await SpecRunnerUtils.getTempTestDirectory("/spec/FindReplace-test-files");
        }

        async function teardownTestWindow() {
            testWindow = null;
            FileSystem = null;
            FileFilters = null;
            FindInFiles = null;
            FindInFilesUI = null;
            CommandManager = null;
            Commands = null;
            $ = null;
            await SpecRunnerUtils.closeTestWindow();
        }

        // These helper functions are slight variations of the ones in FindInFiles, so need to be
        // kept in sync with those. It's a bit awkward to try to share them, and as long as
        // it's just these few functions it's probably okay to just keep them in sync manually,
        // but if this gets more complicated we should probably figure out how to break them out.
        async function openSearchBar(scope) {
            FindInFiles._searchDone = false;
            FindInFilesUI._showFindBar(scope);
            await awaitsFor(function () {
                return $(".modal-bar").length === 1;
            }, "search bar open");
        }

        function closeSearchBar() {
            let $searchField = $(".modal-bar #find-group input");
            SpecRunnerUtils.simulateKeyEvent(KeyEvent.DOM_VK_ESCAPE, "keydown", $searchField[0]);
        }

        async function executeSearch(searchString) {
            await awaitsFor(function () {
                return FindInFiles.isProjectIndexingComplete();
            }, "Find in Files done", 20000);
            FindInFiles._searchDone = false;
            let $searchField = $(".modal-bar #find-group input");
            $searchField.val(searchString).trigger("input");
            //SpecRunnerUtils.simulateKeyEvent(KeyEvent.DOM_VK_RETURN, "keydown", $searchField[0]);
            await awaitsFor(function () {
                return FindInFiles._searchDone;
            }, "Find in Files done", 20000);
        }

        async function executeCleanSearch(searchString) {
            // instant search will not search for the same string twice as there is already results available.
            await executeSearch(" ");
            await executeSearch(searchString);
        }

        function _setExclusionFilter(filterString) {
            FileFilters.setActiveFilter(FileFilters.compile(filterString), FileFilters.FILTER_TYPE_EXCLUDE);
        }

        function verifyButtonLabel(expectedLabel) {
            if (expectedLabel) {
                // Verify filter picker button label is updated with the patterns of the selected filter set.
                expect($("button.file-filter-picker").text()).toEqual(expectedLabel);
            } else {
                expect($("button.file-filter-picker").text()).toEqual(Strings.NO_FILE_FILTER);
            }
        }

        function _setNoFilesExcluded() {
            let $dropdown;
            FileFilters.showDropdown();

            // Invoke new filter command by pressing down arrow key once and then enter key.
            $dropdown = $(".dropdown-menu.dropdownbutton-popup");
            expect($dropdown.is(":visible")).toBeTruthy();
            SpecRunnerUtils.simulateKeyEvent(KeyEvent.DOM_VK_DOWN, "keydown", $dropdown[0]);
            SpecRunnerUtils.simulateKeyEvent(KeyEvent.DOM_VK_RETURN, "keydown", $dropdown[0]);

            // Verify filter picker button is updated with the name of the new filter.
            verifyButtonLabel(Strings.NO_FILE_FILTER);
            expect($(".scope-group .filter-container").is(":visible")).toBeFalse();

            FileFilters.closeDropdown();
        }

        function _setSearchInFiles(filterStr) {
            let $dropdown;
            FileFilters.showDropdown();

            // Invoke new filter command by pressing down arrow key once and then enter key.
            $dropdown = $(".dropdown-menu.dropdownbutton-popup");
            expect($dropdown.is(":visible")).toBeTruthy();
            SpecRunnerUtils.simulateKeyEvent(KeyEvent.DOM_VK_DOWN, "keydown", $dropdown[0]);
            SpecRunnerUtils.simulateKeyEvent(KeyEvent.DOM_VK_DOWN, "keydown", $dropdown[0]);
            SpecRunnerUtils.simulateKeyEvent(KeyEvent.DOM_VK_RETURN, "keydown", $dropdown[0]);

            // Verify filter picker button is updated with the name of the new filter.
            verifyButtonLabel(Strings.INCLUDE_FILE_FILTER);
            expect($(".scope-group .filter-container").is(":visible")).toBeTrue();
            $("#fif-filter-input").val(filterStr);

            FileFilters.closeDropdown();
        }

        function _setExcludeFiles(filterStr) {
            let $dropdown;
            FileFilters.showDropdown();

            // Invoke new filter command by pressing down arrow key once and then enter key.
            $dropdown = $(".dropdown-menu.dropdownbutton-popup");
            expect($dropdown.is(":visible")).toBeTruthy();
            SpecRunnerUtils.simulateKeyEvent(KeyEvent.DOM_VK_DOWN, "keydown", $dropdown[0]);
            SpecRunnerUtils.simulateKeyEvent(KeyEvent.DOM_VK_DOWN, "keydown", $dropdown[0]);
            SpecRunnerUtils.simulateKeyEvent(KeyEvent.DOM_VK_DOWN, "keydown", $dropdown[0]);
            SpecRunnerUtils.simulateKeyEvent(KeyEvent.DOM_VK_RETURN, "keydown", $dropdown[0]);

            // Verify filter picker button is updated with the name of the new filter.
            verifyButtonLabel(Strings.EXCLUDE_FILE_FILTER);
            expect($(".scope-group .filter-container").is(":visible")).toBeTrue();
            $("#fif-filter-input").val(filterStr);

            FileFilters.closeDropdown();
        }

        beforeAll(setupTestWindow, 30000);
        afterAll(teardownTestWindow, 30000);

        describe("Find in Files filtering", function () {

            it("should show 'No files Excluded' in filter picker button by default", async function () {
                await openSearchBar();
                verifyButtonLabel();
                await closeSearchBar();
            }, 10000);

            it("should search all files by default", async function () {
                await openSearchBar();
                await executeCleanSearch("{1}");
                expect(FindInFiles.searchModel.results[testPath + "/test1.css"]).toBeTruthy();
                expect(FindInFiles.searchModel.results[testPath + "/test1.html"]).toBeTruthy();
                await closeSearchBar();
            }, 30000);

            // This finishes async, since clickDialogButton() finishes async (dialogs close asynchronously)
            async function setExcludeCSSFiles() {
                _setExclusionFilter("*.css");
            }

            it("should exclude files from search", async function () {
                await openSearchBar();
                await setExcludeCSSFiles();
                await openSearchBar();
                await executeCleanSearch("{1}");
                // *.css should have been excluded this time
                expect(FindInFiles.searchModel.results[testPath + "/test1.css"]).toBeFalsy();
                expect(FindInFiles.searchModel.results[testPath + "/test1.html"]).toBeTruthy();
                await closeSearchBar();
            }, 30000);

            it("should respect filter when searching folder", async function () {
                let dirEntry = FileSystem.getDirectoryForPath(testPath);
                await openSearchBar(dirEntry);
                await setExcludeCSSFiles();
                await openSearchBar(dirEntry);
                await executeCleanSearch("{1}");
                // *.css should have been excluded this time
                expect(FindInFiles.searchModel.results[testPath + "/test1.css"]).toBeFalsy();
                expect(FindInFiles.searchModel.results[testPath + "/test1.html"]).toBeTruthy();
                await closeSearchBar();
            }, 30000);

            it("should ignore filter when searching a single file", async function () {
                let fileEntry = FileSystem.getFileForPath(testPath + "/test1.css");
                await openSearchBar(fileEntry);
                // Cannot explicitly set *.css filter in dialog because button is hidden
                // (which is verified here), but filter persists from previous test
                expect($("button.file-filter-picker").is(":visible")).toBeFalsy();
                await executeCleanSearch("{1}");
                // ignore *.css exclusion since we're explicitly searching this file
                expect(FindInFiles.searchModel.results[testPath + "/test1.css"]).toBeTruthy();
            }, 30000);

            it("should show error when filter excludes all files", async function () {
                await openSearchBar();
                _setExclusionFilter("test1.*,*.css");

                await executeCleanSearch("{1}");
                let $modalBar = $(".modal-bar");

                // Dialog still showing
                expect($modalBar.length).toBe(1);

                // Error message displayed
                expect($modalBar.find(".scope-group div.error-filter").is(":visible")).toBeTruthy();

                // Search panel not showing
                expect($("#find-in-files-results").is(":visible")).toBeFalsy();

                // Close search bar
                let $searchField = $modalBar.find("#find-group input");
                await SpecRunnerUtils.simulateKeyEvent(KeyEvent.DOM_VK_ESCAPE, "keydown", $searchField[0]);
            }, 30000);

            it("should respect filter when editing code", async function () {
                await openSearchBar();
                await setExcludeCSSFiles();
                await executeCleanSearch("{1}");
                let promise = testWindow.brackets.test.DocumentManager.getDocumentForPath(testPath + "/test1.css");
                await awaitsForDone(promise);
                promise.done(function (doc) {
                    // Modify line that contains potential search result
                    expect(doc.getLine(5).indexOf("{1}")).not.toBe(-1);
                    doc.replaceRange("X", {line: 5, ch: 0});
                });
                await awaits(800);  // ensure _documentChangeHandler()'s timeout has time to run
                expect(FindInFiles.searchModel.results[testPath + "/test1.css"]).toBeFalsy();  // *.css should still be excluded
                expect(FindInFiles.searchModel.results[testPath + "/test1.html"]).toBeTruthy();
                await closeSearchBar();
            }, 30000);

            it("should show 3 filter commands by default", async function () {
                await openSearchBar();
                _setNoFilesExcluded();
                FileFilters.showDropdown();

                let $dropdown = $(".dropdown-menu.dropdownbutton-popup");
                expect($dropdown.is(":visible")).toBeTruthy();
                expect($dropdown.children().length).toEqual(4); // 3 including popup search filter
                expect($($dropdown.children()[1]).text()).toEqual(Strings.CLEAR_FILE_FILTER);
                expect($($dropdown.children()[2]).text()).toEqual(Strings.INCLUDE_FILE_FILTER);
                expect($($dropdown.children()[3]).text()).toEqual(Strings.EXCLUDE_FILE_FILTER);

                verifyButtonLabel(Strings.NO_FILE_FILTER);

                FileFilters.closeDropdown();
                await closeSearchBar();
            }, 10000);

            it("should no filter selector hide filter scope input", async function () {
                await openSearchBar();
                _setNoFilesExcluded();
                await closeSearchBar();
            }, 10000);

            it("should search in files", async function () {
                await openSearchBar();
                _setSearchInFiles("*.css");
                await executeCleanSearch("{1}");
                expect(FindInFiles.searchModel.results[testPath + "/test1.css"]).toBeTruthy();
                expect(FindInFiles.searchModel.results[testPath + "/test1.html"]).toBeFalsy();
                await closeSearchBar();
            }, 10000);

            it("should search exclude files", async function () {
                await openSearchBar();
                _setExcludeFiles("*.css");
                await executeCleanSearch("{1}");
                expect(FindInFiles.searchModel.results[testPath + "/test1.css"]).toBeFalsy();
                expect(FindInFiles.searchModel.results[testPath + "/test1.html"]).toBeTruthy();
                await closeSearchBar();
            }, 10000);

            it("should switch between various search filters", async function () {
                await openSearchBar();

                _setNoFilesExcluded();
                await executeCleanSearch("{1}");
                await awaitsFor(function () {
                    return !!FindInFiles.searchModel.results[testPath + "/test1.css"] &&
                        !!FindInFiles.searchModel.results[testPath + "/test1.html"];
                }, "none excluded");

                _setExcludeFiles("*.css");
                await awaitsFor(function () {
                    return !FindInFiles.searchModel.results[testPath + "/test1.css"] &&
                        !!FindInFiles.searchModel.results[testPath + "/test1.html"];
                }, "css files to be excluded");

                _setSearchInFiles("*.css");
                await awaitsFor(function () {
                    return !!FindInFiles.searchModel.results[testPath + "/test1.css"] &&
                        !FindInFiles.searchModel.results[testPath + "/test1.html"];
                }, "css files to be included");

                await closeSearchBar();
            }, 10000);

            it("should clicking dropdown bring up unfiltered search history", async function () {
                await openSearchBar();
                _setNoFilesExcluded();
                await executeCleanSearch("test_history");
                await closeSearchBar();
                await openSearchBar();
                await executeCleanSearch("test_history2");
                await closeSearchBar();

                await openSearchBar();
                await executeCleanSearch("test_history2");
                $(".search-input-container .dropdown-icon").click();
                expect($(".quick-search-container").is(":visible")).toBeTrue();
                expect($(".quick-search-container").text().includes("test_history")).toBeTrue();
                expect($(".quick-search-container").text().includes("test_history2")).toBeTrue();
                //now press escape to close the popup
                SpecRunnerUtils.simulateKeyEvent(KeyEvent.DOM_VK_ESCAPE, "keydown", $("#find-what")[0]);
                expect($(".quick-search-container").is(":visible")).toBeFalse();
                expect($("#find-what").is(":visible")).toBeTrue();
                await closeSearchBar();
            }, 10000);

            it("should clicking dropdown bring up unfiltered filter history", async function () {
                await openSearchBar();
                _setExcludeFiles("*.css");
                $("#fif-filter-input").val("filter_history");
                await closeSearchBar();
                await openSearchBar();
                $("#fif-filter-input").val("filter_history2");
                await closeSearchBar();

                await openSearchBar();
                $("#fif-filter-input").val("filter_history2");
                $(".filter-dropdown-icon").click();
                expect($(".quick-search-container").is(":visible")).toBeTrue();
                expect($(".quick-search-container").text().includes("filter_history")).toBeTrue();
                expect($(".quick-search-container").text().includes("filter_history2")).toBeTrue();
                //now press escape to close the popup
                SpecRunnerUtils.simulateKeyEvent(KeyEvent.DOM_VK_ESCAPE, "keydown", $("#fif-filter-input")[0]);
                expect($(".quick-search-container").is(":visible")).toBeFalse();
                expect($("#fif-filter-input").is(":visible")).toBeTrue();
                await closeSearchBar();
            }, 10000);

            async function _testFilter(input) {
                await openSearchBar();
                _setExcludeFiles("*.css");
                $(input).val("filter_history1");
                await closeSearchBar();
                await openSearchBar();
                $(input).val("filter_history2");
                await closeSearchBar();

                await openSearchBar();
                // press ctrl-space to bring up the hints and type file_history so that 2 matches
                $(input).val("filter_history");
                $(input).focus();
                SpecRunnerUtils.simulateKeyEvent(KeyEvent.DOM_VK_SPACE, "keydown", $(input)[0], {
                    ctrlKey: true,
                    metaKey: true
                });

                await awaitsFor(function () {
                    return $(".quick-search-container").text().includes("filter_history1");
                }, "filter history to show");
                expect($(".quick-search-container").text().includes("filter_history2")).toBeTrue();

                // now type 2 so that only one element is filtered
                $(input).val("filter_history2").trigger('input');
                await awaitsFor(function () {
                    return !$(".quick-search-container").text().includes("filter_history1");
                }, "filter history to be applied");
                expect($(".quick-search-container").is(":visible")).toBeTrue();
                expect($(".quick-search-container").text().includes("filter_history1")).toBeFalse();
                expect($(".quick-search-container").text().includes("filter_history2")).toBeTrue();

                //now press escape to close the popup
                SpecRunnerUtils.simulateKeyEvent(KeyEvent.DOM_VK_ESCAPE, "keydown", $(input)[0]);
                expect($(".quick-search-container").is(":visible")).toBeFalse();
                expect($(input).is(":visible")).toBeTrue();
                await closeSearchBar();
            }

            it("should pressing ctrl-space bring up filtered filter history:needs window focus", async function () {
                // focus tests, needs focus on window to work properly
                await _testFilter("#fif-filter-input");
            }, 10000);

            it("should pressing ctrl-space bring up filtered search history:needs window focus", async function () {
                // focus tests, needs focus on window to work properly
                await _testFilter("#find-what");
            }, 10000);
        });

        describe("Find in Files .gitignore filtering", function (){
            beforeAll(async function(){
                await awaitsForDone(CommandManager.execute(Commands.FILE_CLOSE_ALL, { _forceClose: true }),
                    "closing all file");
                await jsPromise(SpecRunnerUtils.createTextFile(`${testPathGitIgnore}/.gitignore`,
                    "bar.txt", FileSystem));
                await SpecRunnerUtils.loadProjectInTestWindow(testPathGitIgnore);
            });

            async function _validateBarSearch() {
                await openSearchBar();

                _setNoFilesExcluded();
                await executeCleanSearch("bar");
                await awaitsFor(function () {
                    return !!FindInFiles.searchModel.results[testPathGitIgnore + "/css/foo.css"];
                }, "search to be done");
                expect(FindInFiles.searchModel.results[testPathGitIgnore + "/bar.txt"]).toBeFalsy();
                await closeSearchBar();
            }

            it("should find in files ignore git ignored files in top dir", async function () {
                await _validateBarSearch();
            }, 10000);

            it("should editing git ignore file be honored in next search in top dir", async function () {
                await _validateBarSearch();
                await jsPromise(SpecRunnerUtils.createTextFile(`${testPathGitIgnore}/.gitignore`,
                    "foo.css", FileSystem));
                await openSearchBar();

                _setNoFilesExcluded();
                await executeCleanSearch("bar");
                await awaitsFor(function () {
                    return !!FindInFiles.searchModel.results[testPathGitIgnore + "/bar.txt"];
                }, "search to be done");
                expect(FindInFiles.searchModel.results[testPathGitIgnore + "/css/foo.css"]).toBeFalsy();
                await closeSearchBar();
            }, 10000);

            it("should find in files ignore git ignored files in nested dir", async function () {
                await jsPromise(SpecRunnerUtils.createTextFile(`${testPathGitIgnore}/.gitignore`,
                    "", FileSystem));
                await jsPromise(SpecRunnerUtils.createTextFile(`${testPathGitIgnore}/css/.gitignore`,
                    "foo.css", FileSystem));
                await openSearchBar();

                _setNoFilesExcluded();
                await executeCleanSearch("bar");
                await awaitsFor(function () {
                    return !!FindInFiles.searchModel.results[testPathGitIgnore + "/bar.txt"];
                }, "search to be done");
                expect(FindInFiles.searchModel.results[testPathGitIgnore + "/css/foo.css"]).toBeFalsy();
                await closeSearchBar();

            }, 10000);

            it("should find in files ignore git ignored files in all nested dirs", async function () {
                await jsPromise(SpecRunnerUtils.createTextFile(`${testPathGitIgnore}/.gitignore`,
                    "bar.txt", FileSystem));
                await jsPromise(SpecRunnerUtils.createTextFile(`${testPathGitIgnore}/css/.gitignore`,
                    "foo.css", FileSystem));
                await openSearchBar();

                _setNoFilesExcluded();
                await executeCleanSearch("foo");
                await awaitsFor(function () {
                    return !!FindInFiles.searchModel.results[testPathGitIgnore + "/foo.js"];
                }, "search to be done");
                expect(FindInFiles.searchModel.results[testPathGitIgnore + "/css/foo.css"]).toBeFalsy();
                expect(FindInFiles.searchModel.results[testPathGitIgnore + "/css/foo.css"]).toBeFalsy();
                await closeSearchBar();

            }, 10000);
        });
    });
});
