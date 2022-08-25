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

    describe("integration:Quick View", function () {
        let testFolder = SpecRunnerUtils.getTestPath("/spec/quickview-extn-test-files");

        // load from testWindow
        var testWindow,
            brackets,
            CommandManager,
            Commands,
            EditorManager,
            QuickViewManager,
            editor,
            testFile = "test.css",
            testFileJS = "test.js",
            oldFile;

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
            QuickViewManager = brackets.test.QuickViewManager;

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
            QuickViewManager = null;
            await SpecRunnerUtils.closeTestWindow();
        });

        async function getPopoverAtPos(lineNum, columnNum) {
            editor  = EditorManager.getCurrentFullEditor();
            var cm = editor._codeMirror,
                pos = { line: lineNum, ch: columnNum },
                token;

            editor.setCursorPos(pos);
            token = cm.getTokenAt(pos, true);

            return QuickViewManager._queryPreviewProviders(editor, pos, token);
        }

        async function showPopoverAtPos(line, ch) {
            var popoverInfo = await getPopoverAtPos(line, ch);
            QuickViewManager._forceShow(popoverInfo);
        }

        describe("Quick view display", function () {

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

            it("popover is positioned within window bounds", async function () {
                var $popover  = testWindow.$("#quick-view-container");
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

                // Popover should be inside left edge
                var scrollX = editor._codeMirror.defaultCharWidth()  * 80,
                    scrollY = editor._codeMirror.defaultTextHeight() * 70;

                editor.setScrollPos(scrollX, scrollY);      // Scroll right
                await showPopoverAtPos(82, 136);
                expect(boundsInsideWindow($popover)).toBeTruthy();

                // restore word wrap
                await toggleOption(Commands.TOGGLE_WORD_WRAP, "Toggle word-wrap");
            });

            it("popover is dismissed on escape key press", async function () {
                let $popover  = testWindow.$("#quick-view-container");
                expect($popover.length).toEqual(1);

                // Popover should be below item
                await showPopoverAtPos(3, 12);
                expect(isHidden($popover[0])).toBeFalse();

                SpecRunnerUtils.simulateKeyEvent(KeyEvent.DOM_VK_ESCAPE, "keydown", $popover[0]);
                expect(isHidden($popover[0])).toBeTrue();
            });

            it("active editor is focussed after popover dismissed", async function () {
                let $popover  = testWindow.$("#quick-view-container");
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

            it("highlight matched text when popover shown", async function () {
                await showPopoverAtPos(4, 14);
                var markers = editor._codeMirror.findMarksAt({line: 4, ch: 14});
                let rangeMarker = null;
                for(let marker of markers){
                    if(marker.type === 'range'){
                        rangeMarker = marker;
                        break;
                    }
                }
                expect(rangeMarker).toBeDefined();
                let range = rangeMarker.find();
                expect(range.from.ch).toBe(11);
                expect(range.to.ch).toBe(18);
            });

        });

        describe("Quick view register provider", function (){
            let pos, token, line;

            function getProvider(html, noPreview) {
                return {
                    getQuickView: function(editor, posx, tokenx, linex) {
                        expect(editor).toBeDefined();
                        pos = posx; token = tokenx; line = linex;
                        return new Promise((resolve, reject)=>{
                            if(noPreview){
                                reject();
                                return;
                            }
                            resolve({
                                start: {line: posx.line, ch:tokenx.start},
                                end: {line: posx.line, ch:tokenx.end},
                                content: html
                            });
                        });
                    }
                };
            }

            let provider = getProvider("<div id='blinker-fluid'>hello world</div>");
            let provider2 = getProvider("<div id='blinker-fluid2'>hello world</div>");
            let providerNoPreview = getProvider("<div id='blinker-fluid3'>hello world</div>", true);

            beforeEach(async function () {
                await awaitsForDone(SpecRunnerUtils.openProjectFiles([testFile]), "open test file: " + testFile);
            });

            it("should register and unregister preview provider for all languages", async function () {
                QuickViewManager.registerQuickViewProvider(provider, ["all"]);
                let popoverInfo = await getPopoverAtPos(4, 14);
                expect(popoverInfo.content.find("#blinker-fluid").length).toBe(1);
                expect(line).toBe("    color: #2491F5;");
                expect(pos).toEql({ line: 4, ch: 14 });
                expect(token.string).toBe("#2491F5");

                QuickViewManager.removeQuickViewProvider(provider, ["all"]);
                popoverInfo = await getPopoverAtPos(4, 14);
                expect(popoverInfo.content.find("#blinker-fluid").length).toBe(0);
            });

            it("should register and unregister preview provider for js language", async function () {
                QuickViewManager.registerQuickViewProvider(provider, ["javascript"]);

                let popoverInfo = await getPopoverAtPos(4, 14);
                expect(popoverInfo.content.find("#blinker-fluid").length).toBe(0);

                await awaitsForDone(SpecRunnerUtils.openProjectFiles([testFileJS]), "open test file: " + testFileJS);

                popoverInfo = await getPopoverAtPos(4, 14);
                expect(popoverInfo.content.find("#blinker-fluid").length).toBe(1);
                expect(line.length > 1).toBeTrue();
                expect(pos).toEql({ line: 4, ch: 14 });

                QuickViewManager.removeQuickViewProvider(provider, ["javascript"]);
                popoverInfo = await getPopoverAtPos(4, 14);
                expect(popoverInfo).toBe(null);
            });

            it("should multiple providers all provide previews", async function () {
                QuickViewManager.registerQuickViewProvider(provider, ["all"]);
                QuickViewManager.registerQuickViewProvider(provider2, ["all"]);
                let popoverInfo = await getPopoverAtPos(4, 14);
                expect(popoverInfo.content.find("#blinker-fluid").length).toBe(1);
                expect(popoverInfo.content.find("#blinker-fluid2").length).toBe(1);

                QuickViewManager.removeQuickViewProvider(provider, ["all"]);
                popoverInfo = await getPopoverAtPos(4, 14);
                expect(popoverInfo.content.find("#blinker-fluid1").length).toBe(0);
                expect(popoverInfo.content.find("#blinker-fluid2").length).toBe(1);

                QuickViewManager.removeQuickViewProvider(provider2, ["all"]);
                popoverInfo = await getPopoverAtPos(4, 14);
                expect(popoverInfo.content.find("#blinker-fluid1").length).toBe(0);
                expect(popoverInfo.content.find("#blinker-fluid2").length).toBe(0);
            });

            it("should show preview if some providers didnt give preview", async function () {
                QuickViewManager.registerQuickViewProvider(provider, ["all"]);
                QuickViewManager.registerQuickViewProvider(provider2, ["all"]);
                QuickViewManager.registerQuickViewProvider(providerNoPreview, ["all"]);
                let popoverInfo = await getPopoverAtPos(4, 14);
                expect(popoverInfo.content.find("#blinker-fluid").length).toBe(1);
                expect(popoverInfo.content.find("#blinker-fluid2").length).toBe(1);
                expect(popoverInfo.content.find("#blinker-fluid3").length).toBe(0);

                QuickViewManager.removeQuickViewProvider(provider, ["all"]);
                popoverInfo = await getPopoverAtPos(4, 14);
                expect(popoverInfo.content.find("#blinker-fluid1").length).toBe(0);
                expect(popoverInfo.content.find("#blinker-fluid2").length).toBe(1);
                expect(popoverInfo.content.find("#blinker-fluid3").length).toBe(0);

                QuickViewManager.removeQuickViewProvider(provider2, ["all"]);
                popoverInfo = await getPopoverAtPos(4, 14);
                expect(popoverInfo.content.find("#blinker-fluid1").length).toBe(0);
                expect(popoverInfo.content.find("#blinker-fluid2").length).toBe(0);
                expect(popoverInfo.content.find("#blinker-fluid3").length).toBe(0);
            });
        });
    });
});
