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

/*global describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, awaitsFor, awaitsForDone, awaits*/
/*unittests: FileFilters*/

define(function (require, exports, module) {


    let SpecRunnerUtils    = require("spec/SpecRunnerUtils"),
        Dialogs            = require("widgets/Dialogs"),
        KeyEvent           = require("utils/KeyEvent"),
        Strings            = require("strings"),
        StringUtils        = require("utils/StringUtils");

    describe("LegacyInteg: FileFilters", function () {

        let testPath = SpecRunnerUtils.getTestPath("/spec/InlineEditorProviders-test-files"),
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
            $               = testWindow.$;

            await SpecRunnerUtils.loadProjectInTestWindow(testPath);
        }

        async function teardownTestWindow() {
            testWindow = null;
            FileSystem = null;
            FileFilters = null;
            FindInFiles = null;
            FindInFilesUI = null;
            CommandManager = null;
            $ = null;
            await SpecRunnerUtils.closeTestWindow(true);
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

        describe("Find in Files filtering", function () {
            beforeAll(setupTestWindow, 30000);
            afterAll(teardownTestWindow, 30000);

            it("should search all files by default", async function () {
                await openSearchBar();
                await executeCleanSearch("{1}");
                expect(FindInFiles.searchModel.results[testPath + "/test1.css"]).toBeTruthy();
                expect(FindInFiles.searchModel.results[testPath + "/test1.html"]).toBeTruthy();
                await closeSearchBar();
            }, 30000);

            // This finishes async, since clickDialogButton() finishes async (dialogs close asynchronously)
            async function setExcludeCSSFiles() {
                // Launch filter editor
                FileFilters.editFilter({ name: "", patterns: [] }, -1);

                // Edit the filter & confirm changes
                $(".modal.instance textarea").val("*.css");
                await SpecRunnerUtils.clickDialogButton(Dialogs.DIALOG_BTN_OK, true);
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
                // Launch filter editor
                FileFilters.editFilter({ name: "", patterns: [] }, -1);

                // Edit the filter & confirm changes
                $(".modal.instance textarea").val("test1.*\n*.css");
                await SpecRunnerUtils.clickDialogButton(Dialogs.DIALOG_BTN_OK, true);
                await executeCleanSearch("{1}");
                let $modalBar = $(".modal-bar");

                // Dialog still showing
                expect($modalBar.length).toBe(1);

                // Error message displayed
                expect($modalBar.find("#find-group div.error").is(":visible")).toBeTruthy();

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
            }, 30000);
        });

        describe("Filter picker UI", function () {
            beforeAll(setupTestWindow, 30000);
            afterAll(teardownTestWindow, 30000);

            beforeEach(async function () {
                await openSearchBar();
            });

            afterEach(async ()=>{
                await closeSearchBar();
            });

            function verifyButtonLabel(expectedLabel) {
                let newButtonLabel  = StringUtils.format(Strings.EXCLUDE_FILE_FILTER, expectedLabel);

                if (expectedLabel) {
                    // Verify filter picker button label is updated with the patterns of the selected filter set.
                    expect($("button.file-filter-picker").text()).toEqual(newButtonLabel);
                } else {
                    expect($("button.file-filter-picker").text()).toEqual(Strings.NO_FILE_FILTER);
                }
            }

            // This finishes async, since clickDialogButton() finishes async (dialogs close asynchronously)
            async function setExcludeCSSFiles() {
                // Edit the filter & confirm changes
                $(".modal.instance .exclusions-name").val("CSS Files");
                $(".modal.instance .exclusions-editor").val("*.css\n*.less\n*.scss");
                await SpecRunnerUtils.clickDialogButton(Dialogs.DIALOG_BTN_OK, true);
            }

            // Trigger a mouseover event on the 'parent' and then click on the button with the given 'selector'.
            function clickOnMouseOverButton(selector, parent) {
                parent.trigger("mouseover");
                // async here?
                expect($(selector, parent).is(":visible")).toBeTruthy();
                $(selector, parent).click();
            }

            it("should show 'No files Excluded' in filter picker button by default", async function () {
                verifyButtonLabel();
            }, 10000);

            it("should show two filter commands by default", async function () {
                FileFilters.showDropdown();

                let $dropdown = $(".dropdown-menu.dropdownbutton-popup");
                expect($dropdown.is(":visible")).toBeTruthy();
                expect($dropdown.children().length).toEqual(2);
                expect($($dropdown.children()[0]).text()).toEqual(Strings.NEW_FILE_FILTER);
                expect($($dropdown.children()[1]).text()).toEqual(Strings.CLEAR_FILE_FILTER);

                FileFilters.closeDropdown();
            }, 10000);

            it("should launch filter editor and add a new filter set when invoked from new filter command", async function () {
                let $dropdown;
                FileFilters.showDropdown();

                // Invoke new filter command by pressing down arrow key once and then enter key.
                $dropdown = $(".dropdown-menu.dropdownbutton-popup");
                SpecRunnerUtils.simulateKeyEvent(KeyEvent.DOM_VK_DOWN, "keydown", $dropdown[0]);
                SpecRunnerUtils.simulateKeyEvent(KeyEvent.DOM_VK_RETURN, "keydown", $dropdown[0]);

                await setExcludeCSSFiles();

                FileFilters.showDropdown();

                let filterSuffix = StringUtils.format(Strings.FILE_FILTER_CLIPPED_SUFFIX, 1);

                // Verify filter picker button is updated with the name of the new filter.
                verifyButtonLabel("CSS Files");

                $dropdown = $(".dropdown-menu.dropdownbutton-popup");
                expect($dropdown.is(":visible")).toBeTruthy();
                expect($dropdown.children().length).toEqual(4);
                expect($($dropdown.children()[0]).text()).toEqual(Strings.NEW_FILE_FILTER);
                expect($($dropdown.children()[1]).text()).toEqual(Strings.CLEAR_FILE_FILTER);
                expect($(".recent-filter-name", $($dropdown.children()[3])).text()).toEqual("CSS Files");
                expect($(".recent-filter-patterns", $($dropdown.children()[3])).text()).toEqual(" - *.css, *.less " + filterSuffix);

                FileFilters.closeDropdown();
            }, 10000);

            it("should clear the active filter set when invoked from clear filter command", async function () {
                let $dropdown;
                FileFilters.showDropdown();

                // Invoke new filter command by pressing down arrow key twice and then enter key.
                $dropdown = $(".dropdown-menu.dropdownbutton-popup");
                await SpecRunnerUtils.simulateKeyEvent(KeyEvent.DOM_VK_DOWN, "keydown", $dropdown[0]);
                await SpecRunnerUtils.simulateKeyEvent(KeyEvent.DOM_VK_DOWN, "keydown", $dropdown[0]);
                await SpecRunnerUtils.simulateKeyEvent(KeyEvent.DOM_VK_RETURN, "keydown", $dropdown[0]);

                // Verify filter picker button is updated to show no active filter.
                verifyButtonLabel();
                expect($dropdown.is(":visible")).toBeFalsy();

                // Re-open dropdown list and verify that nothing changed.
                FileFilters.showDropdown();

                let filterSuffix = StringUtils.format(Strings.FILE_FILTER_CLIPPED_SUFFIX, 1);

                $dropdown = $(".dropdown-menu.dropdownbutton-popup");
                expect($dropdown.is(":visible")).toBeTruthy();
                expect($dropdown.children().length).toEqual(4);
                expect($($dropdown.children()[0]).text()).toEqual(Strings.NEW_FILE_FILTER);
                expect($($dropdown.children()[1]).text()).toEqual(Strings.CLEAR_FILE_FILTER);
                expect($(".recent-filter-name", $($dropdown.children()[3])).text()).toEqual("CSS Files");
                expect($(".recent-filter-patterns", $($dropdown.children()[3])).text()).toEqual(" - *.css, *.less " + filterSuffix);

                FileFilters.closeDropdown();
            }, 10000);

            it("should switch the active filter set to the selected one", async function () {
                let $dropdown;
                // Verify that there is no active filter (was set from the previous test).
                verifyButtonLabel();
                FileFilters.showDropdown();

                // Select the last filter set in the dropdown by pressing up arrow key once and then enter key.
                $dropdown = $(".dropdown-menu.dropdownbutton-popup");
                await SpecRunnerUtils.simulateKeyEvent(KeyEvent.DOM_VK_UP, "keydown", $dropdown[0]);
                await SpecRunnerUtils.simulateKeyEvent(KeyEvent.DOM_VK_RETURN, "keydown", $dropdown[0]);

                // Verify filter picker button label is updated with the name of the selected filter set.
                verifyButtonLabel("CSS Files");
                expect($dropdown.is(":visible")).toBeFalsy();
            }, 10000);

            it("should launch filter editor and fill in the text fields with selected filter info", async function () {
                let $dropdown;

                FileFilters.showDropdown();

                // Click on the edit icon that shows up in the first filter set on mouseover.
                $dropdown = $(".dropdown-menu.dropdownbutton-popup");
                clickOnMouseOverButton(".filter-edit-icon", $($dropdown.children()[3]));

                // Remove the name of the filter set and reduce the filter set to '*.css'.
                expect($(".modal.instance .exclusions-name").val()).toEqual("CSS Files");
                expect($(".modal.instance .exclusions-editor").val()).toEqual("*.css\n*.less\n*.scss");

                $(".modal.instance .exclusions-name").val("");
                $(".modal.instance .exclusions-editor").val("*.css");
                await SpecRunnerUtils.clickDialogButton(Dialogs.DIALOG_BTN_OK, true);

                // Verify filter picker button label is updated with the patterns of the selected filter set.
                verifyButtonLabel("*.css");
                expect($dropdown.is(":visible")).toBeFalsy();
            }, 10000);

            it("should remove selected filter from filter sets preferences without changing picker button label", async function () {
                let $dropdown,
                    filters = [{name: "Node Modules", patterns: ["node_module"]},
                        {name: "Mark Down Files", patterns: ["*.md"]},
                        {name: "CSS Files", patterns: ["*.css", "*.less"]}];

                // Create three filter sets and make the last one active.
                FileFilters.editFilter(filters[0], 0);
                await SpecRunnerUtils.clickDialogButton(Dialogs.DIALOG_BTN_OK, true);

                FileFilters.editFilter(filters[1], -1);
                await SpecRunnerUtils.clickDialogButton(Dialogs.DIALOG_BTN_OK, true);

                FileFilters.editFilter(filters[2], -1);
                await SpecRunnerUtils.clickDialogButton(Dialogs.DIALOG_BTN_OK, true);

                verifyButtonLabel("CSS Files");
                FileFilters.showDropdown();

                $dropdown = $(".dropdown-menu.dropdownbutton-popup");
                expect($dropdown.children().length).toEqual(6);

                // Click on the delete icon that shows up in the first filter set on mouseover.
                clickOnMouseOverButton(".filter-trash-icon", $($dropdown.children()[3]));

                expect($dropdown.is(":visible")).toBeTruthy();
                // Verify that button label is still the same since the deleted one is not the active one.
                verifyButtonLabel("CSS Files");

                // Verify that the list has one less item (from 6 to 5).
                expect($dropdown.children().length).toEqual(5);

                // Verify data-index of the two remaining filter sets.
                expect($("a", $dropdown.children()[3]).data("index")).toBe(3);
                expect($("a", $dropdown.children()[4]).data("index")).toBe(4);

                FileFilters.closeDropdown();
            }, 10000);

            it("should remove selected filter from filter sets preferences plus changing picker button label", async function () {
                let $dropdown;

                verifyButtonLabel("CSS Files");
                FileFilters.showDropdown();

                $dropdown = $(".dropdown-menu.dropdownbutton-popup");
                expect($dropdown.children().length).toEqual(5);

                // Click on the delete icon that shows up in the last filter set on mouseover.
                clickOnMouseOverButton(".filter-trash-icon", $($dropdown.children()[4]));

                expect($dropdown.is(":visible")).toBeTruthy();
                // Verify that button label is changed to "No Files Excluded".
                verifyButtonLabel();

                // Verify that the list has one less item.
                expect($dropdown.children().length).toEqual(4);

                FileFilters.closeDropdown();
            }, 10000);

            it("should also remove the divider from the dropdown list after removing the last remaining filter set", async function () {
                let $dropdown;

                verifyButtonLabel();
                FileFilters.showDropdown();

                $dropdown = $(".dropdown-menu.dropdownbutton-popup");
                expect($dropdown.children().length).toEqual(4);

                // Click on the delete icon that shows up in the last filter set on mouseover.
                clickOnMouseOverButton(".filter-trash-icon", $($dropdown.children()[3]));

                expect($dropdown.is(":visible")).toBeTruthy();
                // Verify that button label still shows "No Files Excluded".
                verifyButtonLabel();

                // Verify that the list has only two filter commands.
                expect($dropdown.children().length).toEqual(2);

                FileFilters.closeDropdown();
            }, 10000);
        });
    });
});
