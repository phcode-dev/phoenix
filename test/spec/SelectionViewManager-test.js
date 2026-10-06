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

/*global describe, it, expect, beforeEach, awaitsForDone, awaitsFor, beforeAll, afterAll */

define(function (require, exports, module) {


    var SpecRunnerUtils    = require("spec/SpecRunnerUtils"),
        KeyEvent           = require("utils/KeyEvent");
    const Resizer = require("utils/Resizer");

    describe("integration:Selection View", function () {
        let testFolder = SpecRunnerUtils.getTestPath("/spec/quickview-extn-test-files");

        // load from testWindow
        let testWindow,
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
            await SpecRunnerUtils.createTestWindowAndRun();
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
                    expect(popoverInfo && popoverInfo.content.find("#blinker-fluid").length || 0).toBe(0);
                });

                it("should register and unregister preview provider for js language", async function () {
                    EditorManager.getActiveEditor().setSelection({line:0, ch:0}, {line:10, ch:0});
                    SelectionViewManager.registerSelectionViewProvider(provider, ["javascript"]);

                    let popoverInfo = await getPopoverAtPos(4, 14);
                    expect(popoverInfo && popoverInfo.content.find("#blinker-fluid").length || 0).toBe(0);

                    await awaitsForDone(SpecRunnerUtils.openProjectFiles([testFileJS]), "open test file: " + testFileJS);
                    EditorManager.getActiveEditor().setSelection({line:0, ch:0}, {line:10, ch:0});

                    popoverInfo = await getPopoverAtPos(4, 14);
                    expect(popoverInfo.content.find("#blinker-fluid").length).toBe(1);

                    SelectionViewManager.removeSelectionViewProvider(provider, ["javascript"]);
                    popoverInfo = await getPopoverAtPos(4, 14);
                    expect(popoverInfo && popoverInfo.content.find("#blinker-fluid").length || 0).toBe(0);
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
                    expect(popoverInfo && popoverInfo.content.find("#blinker-fluid2").length || 0).toBe(0);
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
                    expect(popoverInfo && popoverInfo.content.find("#blinker-fluid2").length || 0).toBe(0);
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

            [false, true].forEach(function (reversed) {
                it("stays at the far right beside the short final line of a " + (reversed ? "reversed" : "forward") +
                    " selection, close to the blue region above it", async function () {
                    SelectionViewManager.registerSelectionViewProvider(provider, ["all"]);
                    try {
                        const end = {line: 8, ch: 12};
                        editor.setSelections([{start: {line: 7, ch: 0}, end, reversed}]);
                        editor.setScrollPos(0, 0);
                        await showPopoverAtPos(8, 12);
                        const popup = getBounds(testWindow.$("#selection-view-container"));
                        const endpoint = editor.charCoords(end);
                        const root = editor.getRootElement().getBoundingClientRect();
                        expect(popup.left).toBeGreaterThan(endpoint.left);
                        expect(popup.right).toBeGreaterThan(root.left + root.width / 2);
                        expect(popup.top).toBeLessThan(endpoint.bottom);
                        expect(popup.top).toBeGreaterThan(editor.charCoords({line: 7, ch: 0}).bottom);
                        expect(boundsInsideWindow(testWindow.$("#selection-view-container"))).toBe(true);
                    } finally {
                        SelectionViewManager.hidePreview();
                        SelectionViewManager.removeSelectionViewProvider(provider, ["all"]);
                    }
                });

                it("places the toolbar below and toward the right of a " + (reversed ? "reversed" : "forward") +
                    " selection when there is room", async function () {
                    SelectionViewManager.registerSelectionViewProvider(provider, ["all"]);
                    try {
                        editor.setSelections([{start: {line: 7, ch: 0}, end: {line: 10, ch: 0}, reversed}]);
                        editor.setScrollPos(0, 0);
                        await showPopoverAtPos(7, 0);
                        const popup = getBounds(testWindow.$("#selection-view-container"));
                        const root = editor.getRootElement().getBoundingClientRect();
                        expect(popup.top).toBeGreaterThan(editor.charCoords({line: 10, ch: 0}).top);
                        expect(popup.right).toBeGreaterThan(root.left + root.width / 2);
                        expect(boundsInsideWindow(testWindow.$("#selection-view-container"))).toBe(true);
                    } finally {
                        SelectionViewManager.hidePreview();
                        SelectionViewManager.removeSelectionViewProvider(provider, ["all"]);
                    }
                });

                it("keeps the toolbar onscreen with the " + (reversed ? "start" : "end") +
                    " of the selection outside the viewport", async function () {
                    const root = editor.getRootElement();
                    const height = root.style.height;
                    const scroll = editor.getScrollPos();
                    SelectionViewManager.registerSelectionViewProvider(provider, ["all"]);
                    try {
                        editor.setSize(null, 200);
                        editor.setSelections([{start: {line: 0, ch: 0}, end: {line: 80, ch: 0}, reversed}]);
                        editor.setScrollPos(0, editor.charCoords({line: 40, ch: 0}, "local").top);
                        const popup = await getPopoverAtPos(40, 0);
                        const bounds = root.getBoundingClientRect();
                        expect(reversed ? popup.ybot < bounds.top : popup.ytop > bounds.bottom).toBe(true);
                        SelectionViewManager._forceShow(popup);
                        expect(boundsInsideWindow(testWindow.$("#selection-view-container"))).toBe(true);
                    } finally {
                        SelectionViewManager.hidePreview();
                        SelectionViewManager.removeSelectionViewProvider(provider, ["all"]);
                        editor.setSize(null, height);
                        editor.setScrollPos(scroll.x, scroll.y);
                    }
                });
            });

            it("places the toolbar above the selection when there is no space below", async function () {
                const root = editor.getRootElement();
                const height = root.style.height;
                const scroll = editor.getScrollPos();
                SelectionViewManager.registerSelectionViewProvider(provider, ["all"]);
                try {
                    editor.setSize(null, 220);
                    editor.setSelection({line: 7, ch: 0}, {line: 10, ch: 0});
                    editor.setScrollPos(0, 0);
                    await showPopoverAtPos(7, 0);
                    const popup = getBounds(testWindow.$("#selection-view-container"));
                    expect(popup.bottom).toBeLessThan(editor.charCoords({line: 7, ch: 0}).top);
                    expect(boundsInsideWindow(testWindow.$("#selection-view-container"))).toBe(true);
                } finally {
                    SelectionViewManager.hidePreview();
                    SelectionViewManager.removeSelectionViewProvider(provider, ["all"]);
                    editor.setSize(null, height);
                    editor.setScrollPos(scroll.x, scroll.y);
                }
            });

            it("uses space beside a selection before covering it in a short editor", async function () {
                const root = editor.getRootElement();
                const height = root.style.height;
                const scroll = editor.getScrollPos();
                SelectionViewManager.registerSelectionViewProvider(provider, ["all"]);
                try {
                    // Keep both vertical gaps too small for the popup, including with smaller editor fonts.
                    editor.setSize(null, 70);
                    editor.setSelection({line: 0, ch: 0}, {line: 0, ch: 6});
                    editor.setScrollPos(0, 0);
                    await showPopoverAtPos(0, 6);
                    const popup = getBounds(testWindow.$("#selection-view-container"));
                    expect(popup.left).toBeGreaterThan(editor.charCoords({line: 0, ch: 6}).left);
                    expect(boundsInsideWindow(testWindow.$("#selection-view-container"))).toBe(true);
                } finally {
                    SelectionViewManager.hidePreview();
                    SelectionViewManager.removeSelectionViewProvider(provider, ["all"]);
                    editor.setSize(null, height);
                    editor.setScrollPos(scroll.x, scroll.y);
                }
            });

            it("falls back inside when the selection fills the visible editor", async function () {
                const root = editor.getRootElement();
                const height = root.style.height;
                const scroll = editor.getScrollPos();
                SelectionViewManager.registerSelectionViewProvider(provider, ["all"]);
                try {
                    editor.setSize(null, 160);
                    editor.setSelection({line: 0, ch: 0}, {line: 80, ch: 0});
                    editor.setScrollPos(0, editor.charCoords({line: 40, ch: 0}, "local").top);
                    await showPopoverAtPos(40, 0);
                    const popup = getBounds(testWindow.$("#selection-view-container"));
                    expect(popup.top).toBeGreaterThan(editor.charCoords({line: 0, ch: 0}).top);
                    expect(popup.bottom).toBeLessThan(editor.charCoords({line: 80, ch: 0}).top);
                    expect(boundsInsideWindow(testWindow.$("#selection-view-container"))).toBe(true);
                } finally {
                    SelectionViewManager.hidePreview();
                    SelectionViewManager.removeSelectionViewProvider(provider, ["all"]);
                    editor.setSize(null, height);
                    editor.setScrollPos(scroll.x, scroll.y);
                }
            });

            it("does not race the mouseup popup with a second hover request", async function () {
                let calls = 0;
                const provider = {getSelectionView: async function () {
                    calls++;
                    return {content: "<span>Selection action</span>"};
                }};
                SelectionViewManager.registerSelectionViewProvider(provider, ["all"]);
                try {
                    editor.setSelection({line: 0, ch: 0}, {line: 10, ch: 0});
                    editor.setScrollPos(0, 0);
                    // Finish the programmatic selection's scroll before simulating the user's mouseup.
                    await new Promise(resolve => testWindow.requestAnimationFrame(resolve));
                    const point = editor.charCoords({line: 4, ch: 3});
                    const root = editor.getRootElement();
                    root.dispatchEvent(new testWindow.MouseEvent("mouseup", {bubbles: true, buttons: 0,
                        clientX: point.left, clientY: point.top + 3}));
                    root.dispatchEvent(new testWindow.MouseEvent("mousemove", {bubbles: true, buttons: 0,
                        clientX: point.left + 10, clientY: point.top + 3}));
                    expect(calls).toBe(0);
                    await awaitsFor(() => SelectionViewManager.isSelectionViewShown(), "selection popup opens");
                    expect(calls).toBe(1);
                } finally {
                    SelectionViewManager.hidePreview();
                    SelectionViewManager.removeSelectionViewProvider(provider, ["all"]);
                }
            });

            it("ignores scroll events from the hidden selection input", async function () {
                SelectionViewManager.registerSelectionViewProvider(provider, ["all"]);
                try {
                    editor.setSelection({line: 0, ch: 0}, {line: 10, ch: 0});
                    await showPopoverAtPos(4, 0);
                    editor.getRootElement().querySelector("textarea").dispatchEvent(new testWindow.Event("scroll"));
                    expect(SelectionViewManager.isSelectionViewShown()).toBe(true);
                } finally {
                    SelectionViewManager.hidePreview();
                    SelectionViewManager.removeSelectionViewProvider(provider, ["all"]);
                }
            });

            it("dismisses when the editor viewport actually scrolls", async function () {
                const scroll = editor.getScrollPos();
                SelectionViewManager.registerSelectionViewProvider(provider, ["all"]);
                try {
                    editor.setSelection({line: 0, ch: 0}, {line: 10, ch: 0});
                    editor.setScrollPos(0, 0);
                    await showPopoverAtPos(4, 0);
                    editor.setScrollPos(0, 100);
                    await awaitsFor(() => !SelectionViewManager.isSelectionViewShown(), "popup dismissed on scroll");
                } finally {
                    SelectionViewManager.hidePreview();
                    SelectionViewManager.removeSelectionViewProvider(provider, ["all"]);
                    editor.setScrollPos(scroll.x, scroll.y);
                }
            });

            it("keeps its anchor when the mouse moves and provider content updates", async function () {
                SelectionViewManager.registerSelectionViewProvider(provider, ["all"]);
                try {
                    editor.setSelection({line: 0, ch: 0}, {line: 10, ch: 0});
                    await showPopoverAtPos(3, 12);
                    const popup = testWindow.$("#selection-view-container");
                    const before = {left: popup.css("left"), top: popup.css("top")};
                    const point = editor.charCoords({line: 7, ch: 8});
                    editor.getRootElement().dispatchEvent(new testWindow.MouseEvent("mousemove", {
                        bubbles: true, buttons: 0, clientX: point.left, clientY: point.top + 3
                    }));
                    // Providers can update asynchronously after the toolbar is already visible.
                    const mutated = new Promise(resolve => SelectionViewManager.one("_popupContentMutated", resolve));
                    popup.find("#blinker-fluid").append("<span></span>");
                    await mutated;
                    expect(popup.css("left")).toBe(before.left);
                    expect(popup.css("top")).toBe(before.top);
                } finally {
                    SelectionViewManager.hidePreview();
                    SelectionViewManager.removeSelectionViewProvider(provider, ["all"]);
                }
            });

            ["opens", "resizes", "closes"].forEach(function (action) {
                it("keeps the same popup attached to the editor when a plugin panel " + action, async function () {
                    const workspace = brackets.getModule("view/WorkspaceManager");
                    const panelID = "selection-layout-" + action;
                    const $icon = testWindow.$('<a href="#"></a>').appendTo("#plugin-icons-bar");
                    const $panel = testWindow.$('<div id="' + panelID + '">Layout fixture</div>');
                    const previousPanel = workspace.getAllPanelIDs().map(id => workspace.getPanelForID(id))
                        .find(panel => panel.getPanelType() === "pluginPanel" && panel.isVisible());
                    const previousWidth = testWindow.$("#main-toolbar").width() -
                        testWindow.$("#plugin-icons-bar").outerWidth();
                    const panel = workspace.createPluginPanel(panelID, $panel, 200, $icon, 250);
                    SelectionViewManager.registerSelectionViewProvider(provider, ["all"]);
                    SelectionViewManager.hidePreview();
                    try {
                        if (action !== "opens") {
                            panel.show();
                            workspace.setPluginPanelWidth(250);
                        }
                        editor.setSelection({line: 7, ch: 0}, {line: 10, ch: 0});
                        editor.setScrollPos(0, 0);
                        await new Promise(resolve => testWindow.requestAnimationFrame(resolve));
                        await showPopoverAtPos(7, 0);
                        const popup = testWindow.$("#selection-view-container");
                        const content = popup.find("#blinker-fluid")[0];
                        const before = getBounds(popup).right;
                        const beforeEditorRight = editor.getRootElement().getBoundingClientRect().right;
                        if (action === "opens") { panel.show(); }
                        if (action === "resizes") { workspace.setPluginPanelWidth(400); }
                        if (action === "closes") { panel.hide(); }
                        expect(SelectionViewManager.isSelectionViewShown()).toBe(false);
                        await awaitsFor(() => SelectionViewManager.isSelectionViewShown(),
                            "popup restored after editor layout", 3000);
                        const bounds = getBounds(popup);
                        const root = editor.getRootElement().getBoundingClientRect();
                        expect(Math.abs(bounds.right - before)).toBeGreaterThan(30);
                        expect(Math.abs((bounds.right - before) - (root.right - beforeEditorRight))).toBeLessThan(2);
                        expect(boundsInsideWindow(popup)).toBe(true);
                        expect(popup.find("#blinker-fluid")[0]).toBe(content);
                    } finally {
                        SelectionViewManager.hidePreview();
                        SelectionViewManager.removeSelectionViewProvider(provider, ["all"]);
                        panel.hide();
                        $panel.remove();
                        $icon.remove();
                        if (previousPanel) {
                            previousPanel.show();
                            workspace.setPluginPanelWidth(previousWidth);
                        }
                    }
                });
            });

            it("hides throughout a panel drag and restores the same updated popup on resize end", async function () {
                const $panel = testWindow.$("#main-toolbar");
                const workspace = brackets.getModule("view/WorkspaceManager");
                const nextFrame = () => new Promise(resolve => testWindow.requestAnimationFrame(resolve));
                SelectionViewManager.registerSelectionViewProvider(provider, ["all"]);
                try {
                    editor.setSelection({line: 7, ch: 0}, {line: 10, ch: 0});
                    await showPopoverAtPos(7, 0);
                    const popup = testWindow.$("#selection-view-container");
                    const content = popup.find("#blinker-fluid")[0];
                    const before = {left: popup.css("left"), top: popup.css("top")};
                    // Cancel an already queued layout update when the drag begins.
                    workspace.recomputeLayout();
                    $panel.trigger(Resizer.EVENT_PANEL_RESIZE_START);
                    for (let i = 0; i < 3; i++) {
                        workspace.recomputeLayout();
                        await nextFrame();
                        expect(SelectionViewManager.isSelectionViewShown()).toBe(false);
                        expect(popup.css("visibility")).toBe("hidden");
                    }
                    // Async provider updates must not position the hidden popup either.
                    const mutated = new Promise(resolve => SelectionViewManager.one("_popupContentMutated", resolve));
                    popup.find("#blinker-fluid").append("<div>Additional action</div>");
                    await mutated;
                    expect(popup.css("left")).toBe(before.left);
                    expect(popup.css("top")).toBe(before.top);
                    $panel.trigger(Resizer.EVENT_PANEL_RESIZE_END);
                    await awaitsFor(() => SelectionViewManager.isSelectionViewShown(), "popup restored after drag");
                    expect(popup.css("visibility")).toBe("visible");
                    expect(popup.find("#blinker-fluid")[0]).toBe(content);
                    expect(boundsInsideWindow(popup)).toBe(true);
                } finally {
                    SelectionViewManager.hidePreview();
                    $panel.trigger(Resizer.EVENT_PANEL_RESIZE_END);
                    SelectionViewManager.removeSelectionViewProvider(provider, ["all"]);
                }
            });

            it("waits for all participating panels to finish resizing", async function () {
                const $panels = testWindow.$("<div></div><div></div>").appendTo(testWindow.document.body);
                SelectionViewManager.registerSelectionViewProvider(provider, ["all"]);
                try {
                    editor.setSelection({line: 7, ch: 0}, {line: 10, ch: 0});
                    await showPopoverAtPos(7, 0);
                    $panels.trigger(Resizer.EVENT_PANEL_RESIZE_START);
                    $panels.eq(0).trigger(Resizer.EVENT_PANEL_RESIZE_END);
                    await new Promise(resolve => testWindow.requestAnimationFrame(resolve));
                    expect(SelectionViewManager.isSelectionViewShown()).toBe(false);
                    $panels.eq(1).trigger(Resizer.EVENT_PANEL_RESIZE_END);
                    await awaitsFor(() => SelectionViewManager.isSelectionViewShown(), "all panels finished resizing");
                } finally {
                    SelectionViewManager.hidePreview();
                    $panels.trigger(Resizer.EVENT_PANEL_RESIZE_END).remove();
                    SelectionViewManager.removeSelectionViewProvider(provider, ["all"]);
                }
            });

            it("does not restore a popup dismissed with Escape during resizing", async function () {
                const $panel = testWindow.$("#main-toolbar");
                SelectionViewManager.registerSelectionViewProvider(provider, ["all"]);
                try {
                    editor.setSelection({line: 7, ch: 0}, {line: 10, ch: 0});
                    await showPopoverAtPos(7, 0);
                    $panel.trigger(Resizer.EVENT_PANEL_RESIZE_START);
                    SpecRunnerUtils.simulateKeyEvent(KeyEvent.DOM_VK_ESCAPE, "keydown",
                        testWindow.$("#selection-view-container")[0]);
                    $panel.trigger(Resizer.EVENT_PANEL_RESIZE_END);
                    await new Promise(resolve => testWindow.requestAnimationFrame(resolve));
                    expect(SelectionViewManager.isSelectionViewShown()).toBe(false);
                    expect(testWindow.$("#selection-view-container").css("display")).toBe("none");
                } finally {
                    SelectionViewManager.hidePreview();
                    $panel.trigger(Resizer.EVENT_PANEL_RESIZE_END);
                    SelectionViewManager.removeSelectionViewProvider(provider, ["all"]);
                }
            });

            it("does not open a popup that was absent before resizing", async function () {
                const $panel = testWindow.$("#main-toolbar");
                SelectionViewManager.hidePreview();
                $panel.trigger(Resizer.EVENT_PANEL_RESIZE_START);
                brackets.getModule("view/WorkspaceManager").recomputeLayout();
                $panel.trigger(Resizer.EVENT_PANEL_RESIZE_END);
                await new Promise(resolve => testWindow.requestAnimationFrame(resolve));
                expect(SelectionViewManager.isSelectionViewShown()).toBe(false);
            });

            it("does not reopen a dismissed popup for a pending layout update", async function () {
                SelectionViewManager.registerSelectionViewProvider(provider, ["all"]);
                try {
                    editor.setSelection({line: 7, ch: 0}, {line: 10, ch: 0});
                    await showPopoverAtPos(7, 0);
                    brackets.getModule("view/WorkspaceManager").recomputeLayout();
                    SelectionViewManager.hidePreview();
                    await new Promise(resolve => testWindow.requestAnimationFrame(resolve));
                    expect(SelectionViewManager.isSelectionViewShown()).toBe(false);
                } finally {
                    SelectionViewManager.hidePreview();
                    SelectionViewManager.removeSelectionViewProvider(provider, ["all"]);
                }
            });

            it("dismisses the popup when its editor disappears during relayout", async function () {
                const root = editor.getRootElement();
                const display = root.style.display;
                SelectionViewManager.registerSelectionViewProvider(provider, ["all"]);
                try {
                    editor.setSelection({line: 7, ch: 0}, {line: 10, ch: 0});
                    await showPopoverAtPos(7, 0);
                    root.style.display = "none";
                    brackets.getModule("view/WorkspaceManager").recomputeLayout();
                    await awaitsFor(() => testWindow.$("#selection-view-container").css("display") === "none",
                        "hidden editor dismisses popup");
                } finally {
                    root.style.display = display;
                    SelectionViewManager.hidePreview();
                    SelectionViewManager.removeSelectionViewProvider(provider, ["all"]);
                    brackets.getModule("view/WorkspaceManager").recomputeLayout();
                }
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
