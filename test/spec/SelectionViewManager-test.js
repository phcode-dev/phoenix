/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 * Original work Copyright (c) 2013 - 2021 Adobe Systems Incorporated. All rights reserved.
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

/*global describe, it, expect, beforeEach, awaitsForDone, beforeAll, afterAll */

define(function (require, exports, module) {


    var SpecRunnerUtils    = require("spec/SpecRunnerUtils"),
        KeyEvent           = require("utils/KeyEvent");

    describe("LegacyInteg:Selection View", function () {
        let testFolder = SpecRunnerUtils.getTestPath("/spec/quickview-extn-test-files");

        // load from testWindow
        var testWindow,
            brackets,
            CommandManager,
            Commands,
            EditorManager,
            SelectionViewManager,
            editor,
            testFile = "test.css",
            testFileJS = "test.js",
            oldFile;

        beforeAll(async function () {
            await SpecRunnerUtils.createTestWindowAndRun({forceReload: true});
        }, 30000);

        beforeEach(async function () {
            // Create a new window that will be shared by ALL tests in this spec.
            if (!testWindow) {
                testWindow = await SpecRunnerUtils.createTestWindowAndRun();

                await SpecRunnerUtils.loadProjectInTestWindow(testFolder);
            }

            // Load module instances from brackets.test
            brackets = testWindow.brackets;
            CommandManager = brackets.test.CommandManager;
            Commands = brackets.test.Commands;
            EditorManager = brackets.test.EditorManager;
            SelectionViewManager = brackets.test.SelectionViewManager;

            if (testFile !== oldFile) {
                await awaitsForDone(SpecRunnerUtils.openProjectFiles([testFile]), "open test file: " + testFile);

                editor  = EditorManager.getCurrentFullEditor();
                oldFile = testFile;
            }
        }, 30000);

        afterAll(async function () {
            testWindow       = null;
            brackets         = null;
            CommandManager   = null;
            Commands         = null;
            EditorManager    = null;
            SelectionViewManager = null;
            await SpecRunnerUtils.closeTestWindow();
        }, 30000);

        async function getPopoverAtPos(lineNum, columnNum) {
            editor  = EditorManager.getCurrentFullEditor();
            return SelectionViewManager._queryPreviewProviders(editor);
        }

        async function showPopoverAtPos(line, ch) {
            var popoverInfo = await getPopoverAtPos(line, ch);
            SelectionViewManager._forceShow(popoverInfo);
        }

        let selections;

        function getProvider(html, noPreview) {
            return {
                getSelectionView: function(editor, selectionsx) {
                    expect(editor).toBeDefined();
                    selections = selectionsx;
                    return new Promise((resolve, reject)=>{
                        if(noPreview){
                            reject();
                            return;
                        }
                        resolve({
                            content: html
                        });
                    });
                }
            };
        }

        let provider = getProvider("<div id='blinker-fluid'>hello world</div>");
        let provider2 = getProvider("<div id='blinker-fluid2'>hello world</div>");
        let providerNoPreview = getProvider("<div id='blinker-fluid3'>hello world</div>", true);

        describe("Selection view display", function () {
            beforeEach(async function () {
                await awaitsForDone(SpecRunnerUtils.openProjectFiles([testFile]), "open test file: " + testFile);
            });

            function getBounds(object, useOffset) {
                var left = (useOffset ? object.offset().left : parseInt(object.css("left"), 10)),
                    top = (useOffset ? object.offset().top : parseInt(object.css("top"), 10));
                return {
                    left: left,
                    top: top,
                    right: left + object.outerWidth(),
                    bottom: top + object.outerHeight()
                };
            }

            function boundsInsideWindow(object) {
                // For the popover, we can't use offset(), because jQuery gets confused by the
                // scale factor and transform origin that the animation uses. Instead, we rely
                // on the fact that its offset parent is body, and just test its explicit left/top
                // values.
                var bounds = getBounds(object, false),
                    editorBounds = getBounds(testWindow.$("#editor-holder"), true);
                return bounds.left   >= editorBounds.left   &&
                    bounds.right  <= editorBounds.right  &&
                    bounds.top    >= editorBounds.top    &&
                    bounds.bottom <= editorBounds.bottom;
            }

            async function toggleOption(commandID, text) {
                var promise = CommandManager.execute(commandID);
                await awaitsForDone(promise, text);
            }

            function isHidden(el) {
                return (el.offsetParent === null);
            }

            describe("Selection view register provider", function (){
                beforeEach(async function () {
                    await awaitsForDone(SpecRunnerUtils.openProjectFiles([testFile]), "open test file: " + testFile);
                    EditorManager.getActiveEditor().clearSelection();
                });

                it("should register and unregister preview provider for all languages", async function () {
                    EditorManager.getActiveEditor().setSelection({line:0, ch:0}, {line:10, ch:0});
                    SelectionViewManager.registerSelectionViewProvider(provider, ["all"]);
                    let popoverInfo = await getPopoverAtPos(4, 14);
                    expect(popoverInfo.content.find("#blinker-fluid").length).toBe(1);
                    expect(selections.length).toBe(1);

                    SelectionViewManager.removeSelectionViewProvider(provider, ["all"]);
                    popoverInfo = await getPopoverAtPos(4, 14);
                    expect(popoverInfo).toBe(null);
                });

                it("should register and unregister preview provider for js language", async function () {
                    EditorManager.getActiveEditor().setSelection({line:0, ch:0}, {line:10, ch:0});
                    SelectionViewManager.registerSelectionViewProvider(provider, ["javascript"]);

                    let popoverInfo = await getPopoverAtPos(4, 14);
                    expect(popoverInfo).toBe(null);

                    await awaitsForDone(SpecRunnerUtils.openProjectFiles([testFileJS]), "open test file: " + testFileJS);
                    EditorManager.getActiveEditor().setSelection({line:0, ch:0}, {line:10, ch:0});

                    popoverInfo = await getPopoverAtPos(4, 14);
                    expect(popoverInfo.content.find("#blinker-fluid").length).toBe(1);

                    SelectionViewManager.removeSelectionViewProvider(provider, ["javascript"]);
                    popoverInfo = await getPopoverAtPos(4, 14);
                    expect(popoverInfo).toBe(null);
                });

                it("should not provide preview if there is no selection", async function () {
                    SelectionViewManager.registerSelectionViewProvider(provider, ["all"]);
                    let popoverInfo = await getPopoverAtPos(4, 14);
                    expect(popoverInfo).toBe(null);
                    SelectionViewManager.removeSelectionViewProvider(provider, ["all"]);
                });

                it("should not provide preview if there is multiple selection", async function () {
                    EditorManager.getActiveEditor().setSelections([
                        {start: {line: 0, ch: 0}, end: {line: 1, ch: 0}},
                        {start: {line: 3, ch: 0}, end: {line: 4, ch: 0}}
                    ]);
                    SelectionViewManager.registerSelectionViewProvider(provider, ["all"]);
                    let popoverInfo = await getPopoverAtPos(4, 14);
                    expect(popoverInfo).toBe(null);
                    SelectionViewManager.removeSelectionViewProvider(provider, ["all"]);
                });

                it("should multiple providers all provide previews", async function () {
                    EditorManager.getActiveEditor().setSelection({line:0, ch:0}, {line:10, ch:0});
                    SelectionViewManager.registerSelectionViewProvider(provider, ["all"]);
                    SelectionViewManager.registerSelectionViewProvider(provider2, ["all"]);
                    let popoverInfo = await getPopoverAtPos(4, 14);
                    expect(popoverInfo.content.find("#blinker-fluid").length).toBe(1);
                    expect(popoverInfo.content.find("#blinker-fluid2").length).toBe(1);

                    SelectionViewManager.removeSelectionViewProvider(provider, ["all"]);
                    popoverInfo = await getPopoverAtPos(4, 14);
                    expect(popoverInfo.content.find("#blinker-fluid1").length).toBe(0);
                    expect(popoverInfo.content.find("#blinker-fluid2").length).toBe(1);

                    SelectionViewManager.removeSelectionViewProvider(provider2, ["all"]);
                    popoverInfo = await getPopoverAtPos(4, 14);
                    expect(popoverInfo).toBe(null);
                });

                it("should show preview if some providers didnt give preview", async function () {
                    EditorManager.getActiveEditor().setSelection({line:0, ch:0}, {line:10, ch:0});
                    SelectionViewManager.registerSelectionViewProvider(provider, ["all"]);
                    SelectionViewManager.registerSelectionViewProvider(provider2, ["all"]);
                    SelectionViewManager.registerSelectionViewProvider(providerNoPreview, ["all"]);
                    let popoverInfo = await getPopoverAtPos(4, 14);
                    expect(popoverInfo.content.find("#blinker-fluid").length).toBe(1);
                    expect(popoverInfo.content.find("#blinker-fluid2").length).toBe(1);
                    expect(popoverInfo.content.find("#blinker-fluid3").length).toBe(0);

                    SelectionViewManager.removeSelectionViewProvider(provider, ["all"]);
                    popoverInfo = await getPopoverAtPos(4, 14);
                    expect(popoverInfo.content.find("#blinker-fluid1").length).toBe(0);
                    expect(popoverInfo.content.find("#blinker-fluid2").length).toBe(1);
                    expect(popoverInfo.content.find("#blinker-fluid3").length).toBe(0);

                    SelectionViewManager.removeSelectionViewProvider(provider2, ["all"]);
                    popoverInfo = await getPopoverAtPos(4, 14);
                    expect(popoverInfo).toBe(null);
                    SelectionViewManager.removeSelectionViewProvider(providerNoPreview, ["all"]);
                });
            });

            it("popover is positioned within window bounds", async function () {
                EditorManager.getActiveEditor().setSelection({line:0, ch:0}, {line:10, ch:0});
                SelectionViewManager.registerSelectionViewProvider(provider, ["all"]);
                var $popover  = testWindow.$("#selection-view-container");
                expect($popover.length).toEqual(1);

                // Popover should be below item
                await showPopoverAtPos(3, 12);
                expect(boundsInsideWindow($popover)).toBeTruthy();

                // Popover should above item
                await showPopoverAtPos(20, 33);
                expect(boundsInsideWindow($popover)).toBeTruthy();

                // Turn off word wrap for next tests
                await toggleOption(Commands.TOGGLE_WORD_WRAP, "Toggle word-wrap");

                // Popover should be inside right edge
                await showPopoverAtPos(81, 36);
                expect(boundsInsideWindow($popover)).toBeTruthy();
            });

            it("popover is dismissed on escape key press", async function () {
                EditorManager.getActiveEditor().setSelection({line:0, ch:0}, {line:10, ch:0});
                var $popover  = testWindow.$("#selection-view-container");
                expect($popover.length).toEqual(1);

                // Popover should be below item
                await showPopoverAtPos(3, 12);
                expect(isHidden($popover[0])).toBeFalse();

                SpecRunnerUtils.simulateKeyEvent(KeyEvent.DOM_VK_ESCAPE, "keydown", $popover[0]);
                expect(isHidden($popover[0])).toBeTrue();
            });

            it("active editor is focussed after popover dismissed", async function () {
                EditorManager.getActiveEditor().setSelection({line:0, ch:0}, {line:10, ch:0});
                var $popover  = testWindow.$("#selection-view-container");
                expect($popover.length).toEqual(1);

                // Popover should be below item
                await showPopoverAtPos(3, 12);
                expect(isHidden($popover[0])).toBeFalse();
                $popover.focus();

                SpecRunnerUtils.simulateKeyEvent(KeyEvent.DOM_VK_ESCAPE, "keydown", $popover[0]);
                expect(isHidden($popover[0])).toBeTrue();
                // somehow we should try to get the actual focus element in future, but focus tests are hard to do.
                expect(EditorManager.getFocusedEditor()).toBeTruthy();
            });
        });
    });
});
