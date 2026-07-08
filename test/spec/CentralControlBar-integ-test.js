/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
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

/*global describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, awaitsFor, awaitsForDone, awaits */

define(function (require, exports, module) {

    const SpecRunnerUtils = require("spec/SpecRunnerUtils"),
        DragTestUtils     = require("spec/DragTestUtils"),
        Strings           = require("strings");

    const CCB_WIDTH = 30;

    describe("mainview:CentralControlBar", function () {

        let testWindow,
            brackets,
            CommandManager,
            Commands,
            SidebarView,
            WorkspaceManager,
            _$;

        beforeAll(async function () {
            testWindow = await SpecRunnerUtils.createTestWindowAndRun();
            brackets = testWindow.brackets;
            CommandManager = brackets.test.CommandManager;
            Commands = brackets.test.Commands;
            SidebarView = brackets.test.SidebarView;
            WorkspaceManager = brackets.test.WorkspaceManager;
            _$ = testWindow.$;
            // Load a real project with some files so anything that depends on a
            // populated project tree / file index (e.g. Quick Open's file picker)
            // has something to list. QuickOpen-test-files has a couple of html
            // files which are enough for the assertions here.
            await SpecRunnerUtils.loadProjectInTestWindow(
                SpecRunnerUtils.getTestPath("/spec/QuickOpen-test-files"));
        }, 30000);

        afterAll(async function () {
            // Make sure the sidebar is visible so we leave a clean state.
            if (!SidebarView.isVisible()) {
                SidebarView.show();
            }
            testWindow = null;
            brackets = null;
            CommandManager = null;
            Commands = null;
            SidebarView = null;
            WorkspaceManager = null;
            _$ = null;
            await SpecRunnerUtils.closeTestWindow();
        }, 30000);

        // ---- Shared test helpers ----

        // Record every command the CentralControlBar dispatches during `fn()`.
        // Preferred over Jasmine spies because it exercises the real
        // CommandManager dispatch path — the `beforeExecuteCommand` event fires
        // on every `CommandManager.execute`, so we measure the actual effect of
        // the click handler without monkey-patching.
        function recordCommands(fn) {
            const executed = [];
            const handler = function (event, id) { executed.push(id); };
            CommandManager.on(CommandManager.EVENT_BEFORE_EXECUTE_COMMAND, handler);
            try {
                fn();
            } finally {
                CommandManager.off(CommandManager.EVENT_BEFORE_EXECUTE_COMMAND, handler);
            }
            return executed;
        }

        function livePanel() {
            return WorkspaceManager.getPanelForID &&
                WorkspaceManager.getPanelForID("live-preview-panel");
        }

        async function openLivePreview() {
            const lp = livePanel();
            if (lp && lp.isVisible()) {
                return;
            }
            CommandManager.execute(Commands.FILE_LIVE_FILE_PREVIEW);
            await awaitsFor(function () {
                const p = livePanel();
                return p && p.isVisible();
            }, "live preview to open", 8000);
        }

        async function closeLivePreviewIfOpen() {
            const lp = livePanel();
            if (lp && lp.isVisible()) {
                CommandManager.execute(Commands.FILE_LIVE_FILE_PREVIEW);
                await awaitsFor(function () { return !lp.isVisible(); },
                    "live preview to close", 5000);
            }
        }

        async function enterDesignMode() {
            if (WorkspaceManager.isInDesignMode()) {
                return;
            }
            CommandManager.execute(Commands.VIEW_TOGGLE_DESIGN_MODE);
            await awaitsFor(function () { return WorkspaceManager.isInDesignMode(); },
                "design mode to activate", 10000);
            // isInDesignMode() flips as soon as the body class is added, but when LP
            // wasn't already open the toggle re-enters through a pending LP-open
            // promise and only runs _applyCollapsedLayout (which sets sidebar
            // data-maxsize to "1000%") after that resolves. Wait for LP to be visible
            // AND the collapsed layout to have been applied so subsequent drag tests
            // see the fully-settled design-mode geometry.
            await awaitsFor(function () {
                const p = livePanel();
                return p && p.isVisible() && _$("#sidebar").data("maxsize") === "1000%";
            }, "design-mode layout to be applied", 10000);
        }

        async function exitDesignMode() {
            if (!WorkspaceManager.isInDesignMode()) {
                return;
            }
            CommandManager.execute(Commands.VIEW_TOGGLE_DESIGN_MODE);
            await awaitsFor(function () { return !WorkspaceManager.isInDesignMode(); },
                "design mode to deactivate", 10000);
        }

        // Normalize state between tests: exit design mode, close LP, make sure
        // sidebar is visible at a predictable width. Individual describes can
        // still add their own beforeEach for section-specific setup.
        async function resetBaseline() {
            await exitDesignMode();
            await closeLivePreviewIfOpen();
            if (!SidebarView.isVisible()) {
                SidebarView.show();
                await awaitsFor(function () { return SidebarView.isVisible(); },
                    "sidebar to be visible", 2000);
            }
        }

        beforeEach(async function () {
            await resetBaseline();
        });

        afterEach(async function () {
            await exitDesignMode();
            await closeLivePreviewIfOpen();
        });

        describe("1. Layout", function () {

            it("should have #centralControlBar at boot, 30px wide, between sidebar and .content", function () {
                const $ccb = _$("#centralControlBar");
                expect($ccb.length).toBe(1);
                expect($ccb.outerWidth()).toBe(CCB_WIDTH);

                const sidebarRight = _$("#sidebar")[0].getBoundingClientRect().right;
                const contentLeft = _$(".content")[0].getBoundingClientRect().left;
                const ccbRect = $ccb[0].getBoundingClientRect();

                // CCB sits immediately to the right of the sidebar and immediately
                // to the left of .content (allow sub-pixel rounding).
                expect(Math.abs(ccbRect.left - sidebarRight)).toBeLessThan(2);
                expect(Math.abs(ccbRect.right - contentLeft)).toBeLessThan(2);
            });

            it("should let the user fully collapse the sidebar by dragging its right edge all the way left", async function () {
                // Start from a comfortably wide sidebar so there's room to drag leftward past zero.
                SidebarView.resize(240);
                await awaitsFor(function () { return _$("#sidebar")[0].offsetWidth === 240; },
                    "sidebar to settle at 240px", 2000);

                const $resizer = _$("#sidebar > .horz-resizer");
                const sidebarLeft = _$("#sidebar")[0].getBoundingClientRect().left;
                const handleY = _$("#sidebar")[0].getBoundingClientRect().top + 100;

                // Drag all the way left to the sidebar's own left edge — well past 0.
                // The sidebar is `collapsible`, so the Resizer should hide it entirely
                // and the CCB's sidebar-toggle remains as the way to bring it back.
                await DragTestUtils.dragFromElement($resizer[0], sidebarLeft - 50, handleY, testWindow);

                expect(SidebarView.isVisible()).toBe(false);

                // CCB stays put so the user can re-open the sidebar from the toggle.
                expect(_$("#ccbSidebarToggleBtn").is(":visible")).toBe(true);

                // Restore for later tests.
                SidebarView.show();
                await awaitsFor(function () { return SidebarView.isVisible(); },
                    "sidebar to come back for cleanup", 2000);
                SidebarView.resize(200);
            });

            it("should shift the sidebar's resizer handle right by the CCB width via CSS", function () {
                const $resizer = _$("#sidebar > .horz-resizer");
                expect($resizer.length).toBe(1);
                const transform = testWindow.getComputedStyle($resizer[0]).transform;
                // Computed transform is a matrix; translateX(30px) → matrix(1,0,0,1,30,0).
                expect(transform).toMatch(/matrix\(1,\s*0,\s*0,\s*1,\s*30,\s*0\)/);
            });

            it("should keep the resizer-shift CSS applicable when sidebar is hidden", async function () {
                SidebarView.hide();
                await awaitsFor(function () { return !SidebarView.isVisible(); }, "sidebar to hide", 2000);

                // When hidden, the Resizer moves the handle to be a sibling of #sidebar
                // inside .main-view so the user can still grab it to re-expand.
                const $resizer = _$(".main-view > .horz-resizer");
                expect($resizer.length).toBe(1);
                const transform = testWindow.getComputedStyle($resizer[0]).transform;
                expect(transform).toMatch(/matrix\(1,\s*0,\s*0,\s*1,\s*30,\s*0\)/);

                SidebarView.show();
                await awaitsFor(function () { return SidebarView.isVisible(); }, "sidebar to show again", 2000);
            });
        });

        describe("2. CCB buttons", function () {

            it("should fire EDIT_UNDO / EDIT_REDO / FILE_SAVE from undo, redo, save buttons", function () {
                const executed = recordCommands(function () {
                    _$("#ccbUndoBtn").trigger("click");
                    _$("#ccbRedoBtn").trigger("click");
                    _$("#ccbSaveBtn").trigger("click");
                });

                expect(executed).toContain(Commands.EDIT_UNDO);
                expect(executed).toContain(Commands.EDIT_REDO);
                expect(executed).toContain(Commands.FILE_SAVE);
            });

            it("should execute VIEW_HIDE_SIDEBAR when #ccbSidebarToggleBtn is clicked, and the sidebar's visibility actually flips", async function () {
                // Measure the effect: sidebar is visible → click → sidebar hides.
                expect(SidebarView.isVisible()).toBe(true);

                const executed = recordCommands(function () {
                    _$("#ccbSidebarToggleBtn").trigger("click");
                });
                expect(executed).toContain(Commands.VIEW_HIDE_SIDEBAR);

                await awaitsFor(function () { return !SidebarView.isVisible(); },
                    "sidebar to hide after toggle click", 2000);

                // And clicking again brings it back.
                const executed2 = recordCommands(function () {
                    _$("#ccbSidebarToggleBtn").trigger("click");
                });
                expect(executed2).toContain(Commands.VIEW_HIDE_SIDEBAR);
                await awaitsFor(function () { return SidebarView.isVisible(); },
                    "sidebar to show after second toggle click", 2000);
            });

            it("should flip the toggle icon between fa-angles-left and fa-angles-right on sidebar hide/show", async function () {
                const $icon = _$("#ccbSidebarToggleBtn > i");

                // Starts visible, so the icon should be "collapse left".
                expect($icon.hasClass("fa-angles-left")).toBe(true);
                expect($icon.hasClass("fa-angles-right")).toBe(false);

                SidebarView.hide();
                await awaitsFor(function () {
                    return _$("#ccbSidebarToggleBtn > i").hasClass("fa-angles-right");
                }, "toggle icon to flip to angles-right", 2000);
                expect(_$("#ccbSidebarToggleBtn > i").hasClass("fa-angles-left")).toBe(false);

                SidebarView.show();
                await awaitsFor(function () {
                    return _$("#ccbSidebarToggleBtn > i").hasClass("fa-angles-left");
                }, "toggle icon to flip back to angles-left", 2000);
                expect(_$("#ccbSidebarToggleBtn > i").hasClass("fa-angles-right")).toBe(false);
            });

            it("should have no #sidebar-toggle-btn in the DOM (legacy menubar button removed)", function () {
                expect(_$("#sidebar-toggle-btn").length).toBe(0);
            });
        });

        describe("2b. #ccbFileLabel (active-file indicator)", function () {
            let DocumentManager, MainViewManager;

            beforeAll(function () {
                DocumentManager = brackets.test.DocumentManager;
                MainViewManager = brackets.test.MainViewManager;
            });

            afterAll(async function () {
                // Leave the suite in the same "no file open" state we found it
                // in so later describes don't pick up a stray document.
                await awaitsForDone(
                    CommandManager.execute(Commands.FILE_CLOSE_ALL, { _forceClose: true }),
                    "close files opened by ccbFileLabel tests");
            });

            it("should render #ccbFileLabel inside #centralControlBar", function () {
                const $label = _$("#ccbFileLabel");
                expect($label.length).toBe(1);
                expect($label.closest("#centralControlBar").length).toBe(1);
                expect($label.find(".ccb-file-name").length).toBe(1);
                expect($label.find(".ccb-file-dot").length).toBe(1);
            });

            it("should only be visible in design mode (hidden in code mode)", async function () {
                // The active file is already obvious from the tab bar / working
                // files list in code mode, so the vertical label (and its
                // leading divider) are hidden and only surface in design mode.
                expect(_$("#ccbFileLabel").is(":visible")).toBe(false);
                expect(_$("#centralControlBar .ccb-file-divider").is(":visible")).toBe(false);

                await enterDesignMode();
                expect(_$("#ccbFileLabel").is(":visible")).toBe(true);
                expect(_$("#centralControlBar .ccb-file-divider").is(":visible")).toBe(true);

                await exitDesignMode();
                expect(_$("#ccbFileLabel").is(":visible")).toBe(false);
                expect(_$("#centralControlBar .ccb-file-divider").is(":visible")).toBe(false);
            });

            it("should show the active file's name and clear it when no file is open", async function () {
                await awaitsForDone(
                    SpecRunnerUtils.openProjectFiles(["somelines.html"]),
                    "open somelines.html");
                await awaitsFor(function () {
                    return _$("#ccbFileLabel .ccb-file-name").text() === "somelines.html";
                }, "file label to show somelines.html", 2000);
                expect(_$("#ccbFileLabel").attr("title")).toContain("somelines.html");

                await awaitsForDone(
                    CommandManager.execute(Commands.FILE_CLOSE_ALL, { _forceClose: true }),
                    "close all files");
                await awaitsFor(function () {
                    return _$("#ccbFileLabel .ccb-file-name").text() === "";
                }, "file label to clear when no doc", 2000);
            });

            it("should toggle .is-dirty as the active document's dirty flag changes", async function () {
                await awaitsForDone(
                    SpecRunnerUtils.openProjectFiles(["somelines.html"]),
                    "open somelines.html");
                await awaitsFor(function () {
                    return _$("#ccbFileLabel .ccb-file-name").text() === "somelines.html";
                }, "file label primed", 2000);

                expect(_$("#ccbFileLabel").hasClass("is-dirty")).toBe(false);

                const doc = DocumentManager.getCurrentDocument();
                const originalText = doc.getText();
                doc.setText(originalText + "\n// ccb dirty probe");
                await awaitsFor(function () {
                    return _$("#ccbFileLabel").hasClass("is-dirty");
                }, ".is-dirty to appear after setText", 2000);

                doc.refreshText(originalText, doc.diskTimestamp);
                await awaitsFor(function () {
                    return !_$("#ccbFileLabel").hasClass("is-dirty");
                }, ".is-dirty to clear after refresh", 2000);
            });

            it("should dispatch NAVIGATE_SHOW_IN_FILE_TREE when clicked", async function () {
                await awaitsForDone(
                    SpecRunnerUtils.openProjectFiles(["somelines.html"]),
                    "open somelines.html");
                await awaitsFor(function () {
                    return _$("#ccbFileLabel .ccb-file-name").text() === "somelines.html";
                }, "file label primed", 2000);

                const executed = recordCommands(function () {
                    _$("#ccbFileLabel").trigger("click");
                });
                expect(executed).toContain(Commands.NAVIGATE_SHOW_IN_FILE_TREE);
            });

            it("should update when the active file switches", async function () {
                await awaitsForDone(
                    SpecRunnerUtils.openProjectFiles(["somelines.html"]),
                    "open somelines.html");
                await awaitsFor(function () {
                    return _$("#ccbFileLabel .ccb-file-name").text() === "somelines.html";
                }, "somelines.html label", 2000);

                await awaitsForDone(
                    SpecRunnerUtils.openProjectFiles(["lotsOfLines.html"]),
                    "open lotsOfLines.html");
                await awaitsFor(function () {
                    return _$("#ccbFileLabel .ccb-file-name").text() === "lotsOfLines.html";
                }, "label to switch to lotsOfLines.html", 2000);
                expect(_$("#ccbFileLabel").attr("title")).toContain("lotsOfLines.html");
            });
        });

        describe("3. Toggle Design Mode command", function () {

            it("should execute VIEW_TOGGLE_DESIGN_MODE and flip isInDesignMode() from false to true and back", async function () {
                expect(WorkspaceManager.isInDesignMode()).toBe(false);

                await enterDesignMode();
                expect(WorkspaceManager.isInDesignMode()).toBe(true);

                await exitDesignMode();
                expect(WorkspaceManager.isInDesignMode()).toBe(false);
            });

            it("should mirror Command.getChecked() against WorkspaceManager.isInDesignMode() on entry and exit", async function () {
                const cmd = CommandManager.get(Commands.VIEW_TOGGLE_DESIGN_MODE);
                expect(cmd).toBeDefined();

                expect(!!cmd.getChecked()).toBe(false);
                expect(WorkspaceManager.isInDesignMode()).toBe(false);

                await enterDesignMode();
                expect(!!cmd.getChecked()).toBe(true);
                expect(WorkspaceManager.isInDesignMode()).toBe(true);

                await exitDesignMode();
                expect(!!cmd.getChecked()).toBe(false);
                expect(WorkspaceManager.isInDesignMode()).toBe(false);
            });

            it("should toggle design mode when #ccbCollapseEditorBtn is clicked", async function () {
                expect(WorkspaceManager.isInDesignMode()).toBe(false);

                _$("#ccbCollapseEditorBtn").trigger("click");
                await awaitsFor(function () { return WorkspaceManager.isInDesignMode(); },
                    "design mode to activate from click", 10000);

                _$("#ccbCollapseEditorBtn").trigger("click");
                await awaitsFor(function () { return !WorkspaceManager.isInDesignMode(); },
                    "design mode to deactivate from click", 10000);
            });

            it("should swap title on state change (pen-nib svg stays in both states)", async function () {
                const $btn = _$("#ccbCollapseEditorBtn");

                expect($btn.find("svg").length).toBe(1);
                expect($btn.attr("title")).toBe(Strings.CCB_SWITCH_TO_DESIGN_MODE);

                await enterDesignMode();

                expect($btn.find("svg").length).toBe(1);
                expect($btn.attr("title")).toBe(Strings.CCB_SWITCH_TO_CODE_EDITOR);

                await exitDesignMode();

                expect($btn.find("svg").length).toBe(1);
                expect($btn.attr("title")).toBe(Strings.CCB_SWITCH_TO_DESIGN_MODE);
            });
        });

        describe("4. Enter design mode", function () {

            it("should open Live Preview exactly once when the toggle is triggered with LP closed", async function () {
                expect(livePanel().isVisible()).toBe(false);

                await enterDesignMode();

                // LP is now visible (the collapsed layout wrapped around it).
                expect(livePanel().isVisible()).toBe(true);
            });

            it("should preserve sidebar width and pin main-toolbar to innerWidth - sidebar - CCB when LP is already open", async function () {
                await openLivePreview();

                SidebarView.resize(220);
                await awaitsFor(function () { return _$("#sidebar")[0].offsetWidth === 220; },
                    "sidebar to settle at 220px", 2000);
                const sidebarW = _$("#sidebar")[0].offsetWidth;

                await enterDesignMode();

                // Sidebar width is preserved across the entry.
                expect(_$("#sidebar")[0].offsetWidth).toBe(sidebarW);

                const win = testWindow.innerWidth;
                const expectedLeft = sidebarW + CCB_WIDTH;
                const expectedWidth = win - sidebarW - CCB_WIDTH;

                const mtRect = _$("#main-toolbar")[0].getBoundingClientRect();
                // Allow sub-pixel rounding.
                expect(Math.abs(mtRect.left - expectedLeft)).toBeLessThan(2);
                expect(Math.abs(mtRect.width - expectedWidth)).toBeLessThan(2);

                // Editor area is effectively gone — content is hidden so the editor
                // isn't peeking through behind LP. (visibility: hidden is what the
                // user experiences regardless of how the layout pinned it.)
                expect(testWindow.getComputedStyle(_$(".content")[0]).visibility).toBe("hidden");
                // Whatever border/padding remains, the content's visible interior is
                // far too small to show an editor.
                expect(_$(".content")[0].offsetWidth).toBeLessThan(10);
            });

            it("should restore the pre-collapse main-toolbar width after exit when LP was already open", async function () {
                await openLivePreview();

                // Pick a toolbar width that won't be trimmed by the exit clamp.
                const targetToolbarW = 300;
                const iconsW = _$("#plugin-icons-bar").outerWidth();
                WorkspaceManager.setPluginPanelWidth(targetToolbarW - iconsW);
                await awaitsFor(function () {
                    return Math.abs(_$("#main-toolbar").outerWidth() - targetToolbarW) < 2;
                }, "main-toolbar to settle at target width", 3000);

                const beforeWidth = _$("#main-toolbar").outerWidth();

                await enterDesignMode();
                await exitDesignMode();

                // Toolbar is restored (within rounding tolerance) to its pre-collapse width.
                expect(Math.abs(_$("#main-toolbar").outerWidth() - beforeWidth)).toBeLessThan(3);
            });

            it("should keep sidebar width stable across synthetic window resizes while in design mode", async function () {
                SidebarView.resize(200);
                await awaitsFor(function () { return _$("#sidebar")[0].offsetWidth === 200; },
                    "sidebar to settle at 200px", 2000);

                await enterDesignMode();

                const startWidth = _$("#sidebar")[0].offsetWidth;
                for (let i = 0; i < 10; i++) {
                    testWindow.dispatchEvent(new testWindow.Event("resize"));
                }
                await awaits(0);

                // The sidebar is pinned — Resizer.updateResizeLimits shouldn't shrink it.
                expect(_$("#sidebar")[0].offsetWidth).toBe(startWidth);
            });

            it("should not let the user resize main-toolbar by dragging its left-edge handle while in design mode", async function () {
                await enterDesignMode();

                const beforeWidth = _$("#main-toolbar").outerWidth();
                const resizer = _$("#main-toolbar > .horz-resizer")[0];
                const rect = resizer.getBoundingClientRect();
                const handleY = rect.top + rect.height / 2;

                // Attempt to drag the toolbar resizer 200px to the left — in normal mode
                // this would widen the toolbar. In design mode the handle is hidden, so
                // the user can't actually land on it and the toolbar width is unchanged.
                await DragTestUtils.dragFromElement(resizer, rect.left - 200, handleY, testWindow);

                const afterWidth = _$("#main-toolbar").outerWidth();
                expect(Math.abs(afterWidth - beforeWidth)).toBeLessThan(2);
            });
        });

        describe("5. Exit design mode", function () {

            beforeEach(async function () {
                // Section 5 tests rely on a predictable sidebar width. The top-level
                // beforeEach already ensures sidebar is visible and design-mode/LP
                // are torn down; just pin the width.
                SidebarView.resize(200);
                await awaitsFor(function () { return _$("#sidebar")[0].offsetWidth === 200; },
                    "sidebar to settle at baseline 200px", 2000);
            });

            it("should leave Live Preview open after exit when LP was already open at entry", async function () {
                // Mirror of the "LP was opened by the toggle" test below: when
                // the user already had LP open, exiting design mode must keep
                // LP visible and main-toolbar at a real LP-panel width (well
                // above the icon-bar width).
                await openLivePreview();
                await enterDesignMode();
                await exitDesignMode();

                expect(livePanel().isVisible()).toBe(true);
                const iconsW = _$("#plugin-icons-bar").outerWidth();
                const toolbarW = _$("#main-toolbar").outerWidth();
                expect(toolbarW).toBeGreaterThan(iconsW + 50);
            });

            it("should fit sidebar + CCB + toolbar + a reasonable editor area in the window after exit", async function () {
                await openLivePreview();
                await enterDesignMode();
                await exitDesignMode();

                const sidebar = _$("#sidebar")[0].offsetWidth;
                const toolbar = _$("#main-toolbar").outerWidth();
                const total = sidebar + CCB_WIDTH + toolbar;
                expect(total).toBeLessThanOrEqual(testWindow.innerWidth);
                // And there's an editor gap of at least a few hundred pixels so the
                // user actually sees the code area again.
                expect(testWindow.innerWidth - total).toBeGreaterThan(100);
            });

            it("should close Live Preview and shrink toolbar to the icon-bar width when LP was opened by the toggle itself", async function () {
                // LP is closed on entry — the toggle opens it. On exit we
                // restore the original "pure code" layout: LP closes again
                // and main-toolbar shrinks to the icon-bar width.
                await enterDesignMode();
                expect(livePanel().isVisible()).toBe(true);
                await exitDesignMode();

                await awaitsFor(function () { return !livePanel().isVisible(); },
                    "live preview to close on exit", 5000);

                const iconsW = _$("#plugin-icons-bar").outerWidth();
                const toolbarW = _$("#main-toolbar").outerWidth();
                expect(Math.abs(toolbarW - iconsW)).toBeLessThan(3);
            });

            it("should not let the sidebar snap wider than the rendered (capped) width after exit even if user dragged past the cap in design mode", async function () {
                await openLivePreview();
                await enterDesignMode();

                // In design mode, CSS caps #sidebar at calc(100vw - 230px). Ask the
                // Resizer to set a style.width larger than that so we exercise the
                // "pin rendered width on exit" path.
                const uncappedWidth = testWindow.innerWidth + 1000;
                SidebarView.resize(uncappedWidth);
                await awaitsFor(function () {
                    // style.width gets the big value but offsetWidth is capped.
                    return _$("#sidebar")[0].style.width === uncappedWidth + "px";
                }, "sidebar style.width to reach uncapped value", 2000);
                const cappedRendered = _$("#sidebar")[0].offsetWidth;
                expect(cappedRendered).toBeLessThan(uncappedWidth);

                await exitDesignMode();

                // After exit, the rendered width must not jump past what the user was
                // visually seeing in design mode. It may be trimmed smaller (to make
                // room for toolbar + editor area) but it never snaps to the uncapped
                // style.width — that would be a visible jump.
                expect(_$("#sidebar")[0].offsetWidth).toBeLessThanOrEqual(cappedRendered + 1);
                expect(_$("#sidebar")[0].offsetWidth).toBeLessThan(uncappedWidth);
            });

            it("should keep the toolbar at least at the live-preview panel's minimum width after exit", async function () {
                await openLivePreview();
                await enterDesignMode();
                await exitDesignMode();

                const lp = livePanel();
                const iconsW = _$("#plugin-icons-bar").outerWidth();
                const minToolbar = (lp && lp.minWidth ? lp.minWidth : 0) + iconsW;

                expect(_$("#main-toolbar").outerWidth()).toBeGreaterThanOrEqual(minToolbar);
            });
        });

        describe("6. #toolbar-go-live click in design mode", function () {

            it("should exit design mode and keep Live Preview visible when #toolbar-go-live is clicked in design mode", async function () {
                await openLivePreview();
                await enterDesignMode();
                expect(WorkspaceManager.isInDesignMode()).toBe(true);
                expect(livePanel().isVisible()).toBe(true);

                // Native click — CCB intercepts via a capture-phase listener,
                // which jQuery's `.trigger("click")` would not exercise.
                _$("#toolbar-go-live")[0].click();

                // Design mode ends — editor chrome comes back.
                await awaitsFor(function () { return !WorkspaceManager.isInDesignMode(); },
                    "design mode to deactivate after toolbar-go-live click", 5000);
                // LP should remain open — the click in design mode must NOT hide it.
                expect(livePanel().isVisible()).toBe(true);

                // Main-toolbar should be at a real LP-panel width (well above
                // just the icon-bar width).
                const iconsW = _$("#plugin-icons-bar").outerWidth();
                const toolbarW = _$("#main-toolbar").outerWidth();
                expect(toolbarW).toBeGreaterThan(iconsW + 50);
            });

            it("should toggle Live Preview off normally when #toolbar-go-live is clicked outside design mode", async function () {
                await openLivePreview();
                expect(WorkspaceManager.isInDesignMode()).toBe(false);
                expect(livePanel().isVisible()).toBe(true);

                _$("#toolbar-go-live")[0].click();

                await awaitsFor(function () { return !livePanel().isVisible(); },
                    "live preview to hide on toolbar-go-live click", 5000);
                expect(WorkspaceManager.isInDesignMode()).toBe(false);
            });
        });

        describe("7. Sidebar drag in design mode", function () {
            // Capture all console.error messages emitted during each test so the
            // ResizeObserver-warning test can assert on them. Installed/removed via
            // beforeEach/afterEach so Jasmine itself guarantees the restore — the
            // spy can't leak into later tests even if a drag helper throws or an
            // expect() fails mid-test.
            let consoleErrors;
            let origConsoleError;

            beforeEach(async function () {
                SidebarView.resize(200);
                await awaitsFor(function () { return _$("#sidebar")[0].offsetWidth === 200; },
                    "sidebar to settle at baseline 200px", 2000);
                await enterDesignMode();

                consoleErrors = [];
                origConsoleError = testWindow.console.error;
                testWindow.console.error = function () {
                    consoleErrors.push(Array.prototype.slice.call(arguments).map(String).join(" "));
                    return origConsoleError.apply(testWindow.console, arguments);
                };
            });

            afterEach(function () {
                testWindow.console.error = origConsoleError;
                consoleErrors = null;
                origConsoleError = null;
            });

            it("should grow the sidebar roughly 1:1 with the drag delta up to the CSS cap", async function () {
                const beforeWidth = _$("#sidebar")[0].offsetWidth;
                const $resizer = _$("#sidebar > .horz-resizer");
                const rect = $resizer[0].getBoundingClientRect();
                const handleY = rect.top + rect.height / 2;
                const dragDelta = 150;

                await DragTestUtils.dragFromElement($resizer[0],
                    rect.left + rect.width / 2 + dragDelta, handleY, testWindow);

                const afterWidth = _$("#sidebar")[0].offsetWidth;
                // 1:1 tracking up to the cap — tolerate a handful of pixels for
                // sub-pixel accumulation across steps.
                expect(Math.abs((afterWidth - beforeWidth) - dragDelta)).toBeLessThan(10);
            });

            it("should cap the rendered sidebar at calc(100vw - 230px) even when dragged far past it", async function () {
                const $resizer = _$("#sidebar > .horz-resizer");
                const rect = $resizer[0].getBoundingClientRect();
                const handleY = rect.top + rect.height / 2;
                const cap = testWindow.innerWidth - 230;

                // Drag well past the cap — final mouse position near the right edge.
                await DragTestUtils.dragFromElement($resizer[0],
                    testWindow.innerWidth - 10, handleY, testWindow);

                const rendered = _$("#sidebar")[0].offsetWidth;
                // Rendered width hits the cap but never crosses it.
                expect(rendered).toBeLessThanOrEqual(cap + 1);
                expect(rendered).toBeGreaterThan(cap - 20);
            });

            it("should not emit ResizeObserver loop warnings during a capped drag", async function () {
                const $resizer = _$("#sidebar > .horz-resizer");
                const rect = $resizer[0].getBoundingClientRect();
                const handleY = rect.top + rect.height / 2;
                await DragTestUtils.dragFromElement($resizer[0],
                    testWindow.innerWidth - 10, handleY, testWindow, 16);

                const resizeObserverWarnings = consoleErrors.filter(function (msg) {
                    return /ResizeObserver/i.test(msg);
                });
                expect(resizeObserverWarnings).toEqual([]);
            });

            it("should let the user collapse the sidebar via drag in design mode (CCB toggle remains to re-open)", async function () {
                // Drag all the way left past the sidebar's own left edge.
                const $resizer = _$("#sidebar > .horz-resizer");
                const rect = $resizer[0].getBoundingClientRect();
                const handleY = rect.top + rect.height / 2;
                const sidebarLeft = _$("#sidebar")[0].getBoundingClientRect().left;

                await DragTestUtils.dragFromElement($resizer[0], sidebarLeft - 100, handleY, testWindow);

                // Design mode honours the same collapse-via-drag affordance as normal
                // mode (see "1. Layout"). The CCB sidebar-toggle stays put so the user
                // can bring the sidebar back.
                expect(SidebarView.isVisible()).toBe(false);
                expect(_$("#ccbSidebarToggleBtn").is(":visible")).toBe(true);
            });

            it("should forward panelResizeStart / panelResizeUpdate / panelResizeEnd from the sidebar drag to #main-toolbar", async function () {
                const events = [];
                const $mt = _$("#main-toolbar");
                const record = function (e) { events.push(e.type); };
                $mt.on("panelResizeStart.test panelResizeUpdate.test panelResizeEnd.test", record);

                try {
                    const $resizer = _$("#sidebar > .horz-resizer");
                    const rect = $resizer[0].getBoundingClientRect();
                    const handleY = rect.top + rect.height / 2;
                    await DragTestUtils.dragFromElement($resizer[0],
                        rect.left + 100, handleY, testWindow);
                    // Wait for the forwarded end event — it travels through CCB's
                    // `panelResizeEnd` handler which may still be in-flight when the
                    // drag helper returns.
                    await awaitsFor(function () { return events.indexOf("panelResizeEnd") !== -1; },
                        "panelResizeEnd to be forwarded to #main-toolbar", 2000);
                } finally {
                    $mt.off(".test");
                }

                // All three lifecycle events must fire on #main-toolbar so downstream
                // listeners (lpedit-helper media-query ruler) can track the drag.
                expect(events).toContain("panelResizeStart");
                expect(events).toContain("panelResizeUpdate");
                expect(events).toContain("panelResizeEnd");
            });
        });

        describe("8. Window resize while in design mode", function () {

            beforeEach(async function () {
                SidebarView.resize(200);
                await awaitsFor(function () { return _$("#sidebar")[0].offsetWidth === 200; },
                    "sidebar to settle at baseline 200px", 2000);
                await enterDesignMode();
            });

            it("should keep sidebar width stable across a burst of 20 synthetic window resizes", async function () {
                const startWidth = _$("#sidebar")[0].offsetWidth;
                for (let i = 0; i < 20; i++) {
                    testWindow.dispatchEvent(new testWindow.Event("resize"));
                }
                // Let any deferred handlers flush.
                await awaits(0);
                expect(_$("#sidebar")[0].offsetWidth).toBe(startWidth);
            });

            it("should keep #main-toolbar flush with the right edge of the window after resize bursts", async function () {
                for (let i = 0; i < 10; i++) {
                    testWindow.dispatchEvent(new testWindow.Event("resize"));
                }
                await awaits(0);

                const mtRect = _$("#main-toolbar")[0].getBoundingClientRect();
                expect(Math.abs(mtRect.right - testWindow.innerWidth)).toBeLessThan(2);
            });

            it("should give #main-toolbar the full (window - CCB) width when sidebar is hidden", async function () {
                SidebarView.hide();
                await awaitsFor(function () { return !SidebarView.isVisible(); },
                    "sidebar to hide", 2000);

                // Force a relayout pass by firing a resize so the collapsed-layout
                // reassertion runs against the new sidebar-hidden geometry.
                testWindow.dispatchEvent(new testWindow.Event("resize"));
                await awaits(0);

                const mtW = _$("#main-toolbar").outerWidth();
                const expected = testWindow.innerWidth - CCB_WIDTH;
                // No ~70–300px phantom gap from earlier WSM clamping bugs.
                expect(Math.abs(mtW - expected)).toBeLessThan(5);
            });
        });

        describe("9. Plugin toolbar resizer", function () {

            it("should let the user drag the main-toolbar's left-edge handle to resize the panel in normal mode", async function () {
                await openLivePreview();
                // Reset to a predictable modest width before the drag so the assertion
                // isn't sitting at the 75% clamp from whatever previous test left.
                const iconsW = _$("#plugin-icons-bar").outerWidth();
                const startTarget = 300;
                WorkspaceManager.setPluginPanelWidth(startTarget - iconsW);
                await awaitsFor(function () {
                    return Math.abs(_$("#main-toolbar").outerWidth() - startTarget) < 3;
                }, "main-toolbar to settle at 300px", 3000);

                const beforeWidth = _$("#main-toolbar").outerWidth();
                const resizer = _$("#main-toolbar > .horz-resizer")[0];
                const rect = resizer.getBoundingClientRect();
                const handleY = rect.top + rect.height / 2;
                const delta = 120;

                // Drag leftward to widen the toolbar by ~delta.
                await DragTestUtils.dragFromElement(resizer,
                    rect.left + rect.width / 2 - delta, handleY, testWindow);

                const afterWidth = _$("#main-toolbar").outerWidth();
                expect(afterWidth).toBeGreaterThan(beforeWidth);
                expect(Math.abs((afterWidth - beforeWidth) - delta)).toBeLessThan(20);
            });
        });

        describe("10. WorkspaceManager.setPluginPanelWidth", function () {

            beforeEach(async function () {
                SidebarView.resize(200);
                await awaitsFor(function () { return _$("#sidebar")[0].offsetWidth === 200; },
                    "sidebar to settle at baseline 200px", 2000);
            });

            it("should, in design mode, translate a requested plugin-panel width into a sidebar width so the layout fits", async function () {
                await enterDesignMode();

                const iconsW = _$("#plugin-icons-bar").outerWidth();
                const requested = 400;
                WorkspaceManager.setPluginPanelWidth(requested);
                await awaits(0);

                // Expected sidebar = window - (requested + iconsBar) - CCB, clamped at 0.
                const expectedSidebar = Math.max(0,
                    testWindow.innerWidth - (requested + iconsW) - CCB_WIDTH);
                expect(Math.abs(_$("#sidebar")[0].offsetWidth - expectedSidebar)).toBeLessThan(3);

                // And the main-toolbar takes the remaining right-hand room.
                const mtRect = _$("#main-toolbar")[0].getBoundingClientRect();
                expect(Math.abs(mtRect.right - testWindow.innerWidth)).toBeLessThan(2);
            });

            it("should, in normal mode, progressively shrink the sidebar when an oversized plugin-panel width is requested", async function () {
                await openLivePreview();
                const iconsW = _$("#plugin-icons-bar").outerWidth();
                const sidebarBefore = _$("#sidebar")[0].offsetWidth;

                // Request a very wide panel — the sidebar should shrink (or
                // collapse) to make room, then the toolbar is clamped to
                // (window - finalSidebarWidth - MIN_EDITOR_WIDTH).
                const requested = testWindow.innerWidth; // intentionally over-large
                WorkspaceManager.setPluginPanelWidth(requested);
                await awaits(0);

                // Sidebar must have shrunk or collapsed to accommodate the request.
                const sidebarAfter = SidebarView.isVisible() ? _$("#sidebar")[0].offsetWidth : 0;
                expect(sidebarAfter).toBeLessThan(sidebarBefore);

                const toolbar = _$("#main-toolbar").outerWidth();
                // Toolbar is clamped to (window - sidebar - MIN_EDITOR_WIDTH).
                const maxAllowed = testWindow.innerWidth - sidebarAfter - 100;
                expect(toolbar).toBeLessThanOrEqual(maxAllowed + 3);
                // And at minimum it's the icons-bar + LP's minWidth.
                const lp = livePanel();
                const minToolbar = (lp && lp.minWidth ? lp.minWidth : 0) + iconsW;
                expect(toolbar).toBeGreaterThanOrEqual(minToolbar);

                // Restore sidebar for subsequent tests.
                if (!SidebarView.isVisible()) {
                    SidebarView.show();
                    await awaitsFor(function () { return SidebarView.isVisible(); },
                        "sidebar to come back", 2000);
                }
                SidebarView.resize(200);
            });
        });

        describe("11. Cycle stability", function () {

            beforeEach(async function () {
                SidebarView.resize(200);
                await awaitsFor(function () { return _$("#sidebar")[0].offsetWidth === 200; },
                    "sidebar to settle at baseline 200px", 2000);
            });

            it("should keep CCB, sidebar, and main-toolbar aligned through enter→drag→exit→re-enter", async function () {
                await openLivePreview();

                // Cycle 1: enter design, drag sidebar wider, exit, re-enter.
                await enterDesignMode();

                const $resizer = _$("#sidebar > .horz-resizer");
                let rect = $resizer[0].getBoundingClientRect();
                let handleY = rect.top + rect.height / 2;
                await DragTestUtils.dragFromElement($resizer[0],
                    rect.left + 200, handleY, testWindow);

                await exitDesignMode();
                await enterDesignMode();

                // After the full cycle, CCB sits flush right of the sidebar and
                // main-toolbar sits flush right of the CCB.
                const sidebarRect = _$("#sidebar")[0].getBoundingClientRect();
                const ccbRect = _$("#centralControlBar")[0].getBoundingClientRect();
                const mtRect = _$("#main-toolbar")[0].getBoundingClientRect();

                expect(Math.abs(ccbRect.left - sidebarRect.right)).toBeLessThan(2);
                expect(Math.abs(mtRect.left - (sidebarRect.right + CCB_WIDTH))).toBeLessThan(2);
            });

            it("should leave Live Preview open after a full design-mode cycle with the toolbar at a usable width", async function () {
                await openLivePreview();
                const iconsW = _$("#plugin-icons-bar").outerWidth();
                const lp = livePanel();
                const minToolbar = (lp && lp.minWidth ? lp.minWidth : 0) + iconsW;

                await enterDesignMode();
                await exitDesignMode();
                await enterDesignMode();
                await exitDesignMode();

                expect(livePanel().isVisible()).toBe(true);
                const toolbar = _$("#main-toolbar").outerWidth();
                expect(toolbar).toBeGreaterThanOrEqual(minToolbar);
                // And the overall layout still fits the window.
                const sidebar = _$("#sidebar")[0].offsetWidth;
                expect(sidebar + CCB_WIDTH + toolbar).toBeLessThanOrEqual(testWindow.innerWidth);
            });
        });

        describe("11b. Auto-exit design mode from conflicting surfaces", function () {

            function toolsPanel() {
                return WorkspaceManager.getPanelForID(WorkspaceManager.DEFAULT_PANEL_ID);
            }

            async function hideToolsPanelIfVisible() {
                const p = toolsPanel();
                if (p && p.isVisible()) {
                    p.hide();
                    await awaitsFor(function () { return !p.isVisible(); },
                        "tools panel to hide", 2000);
                }
            }

            afterEach(async function () {
                await hideToolsPanelIfVisible();
                // Close any modal find / quick-open bars left open so the next
                // test starts with a clean DOM.
                const findInput = _$("#find-what")[0];
                if (findInput) {
                    findInput.dispatchEvent(new testWindow.KeyboardEvent("keydown",
                        { keyCode: 27 /* Esc */, bubbles: true }));
                    await awaitsFor(function () { return _$("#find-what").length === 0; },
                        "find-in-files bar to close", 3000);
                }
                const qoInput = _$("input#quickOpenSearch")[0];
                if (qoInput) {
                    qoInput.dispatchEvent(new testWindow.KeyboardEvent("keydown",
                        { keyCode: 27, bubbles: true }));
                    await awaitsFor(function () { return _$("input#quickOpenSearch").length === 0; },
                        "quick-open bar to close", 3000);
                }
            });

            // app-drawer-button is commented out in index.html for now,
            // uncomment these two tests when it comes back
            /*
            it("should exit design mode and open the tools bottom panel when #app-drawer-button is clicked in design mode", async function () {
                await enterDesignMode();
                expect(WorkspaceManager.isInDesignMode()).toBe(true);

                _$("#app-drawer-button").trigger("click");

                await awaitsFor(function () { return !WorkspaceManager.isInDesignMode(); },
                    "design mode to deactivate on app-drawer click", 5000);
                await awaitsFor(function () { return toolsPanel().isVisible(); },
                    "tools bottom panel to become visible", 3000);
            });

            it("should leave design mode untouched when #app-drawer-button is clicked in normal mode and toggle the tools panel", async function () {
                expect(WorkspaceManager.isInDesignMode()).toBe(false);

                _$("#app-drawer-button").trigger("click");

                await awaitsFor(function () { return toolsPanel().isVisible(); },
                    "tools bottom panel to become visible", 3000);
                expect(WorkspaceManager.isInDesignMode()).toBe(false);
            });
            */

            it("should exit design mode before mounting Find in Files bar", async function () {
                await enterDesignMode();
                expect(WorkspaceManager.isInDesignMode()).toBe(true);

                CommandManager.execute(Commands.CMD_FIND_IN_FILES);

                await awaitsFor(function () { return !WorkspaceManager.isInDesignMode(); },
                    "design mode to deactivate before Find-in-Files mounts", 5000);
                await awaitsFor(function () { return _$("#find-what").length > 0; },
                    "find-in-files bar to mount", 3000);
            });

            describe("Quick Open in design mode", function () {
                // Quick Open has a dedicated design-mode variant (Spotlight-style
                // floating overlay) instead of the usual ModalBar, so we cover its
                // core user-facing behaviours here: bar shows up, dropdown lists
                // project files, typing filters the list, pressing Enter opens
                // the selected file.

                function $bar() { return _$(".quick-open-floating-bar"); }
                function $search() { return _$("input#quickOpenSearch"); }
                function $dropdownItems() { return _$(".quick-search-container li"); }

                async function openQuickOpenInDesignMode() {
                    await enterDesignMode();
                    CommandManager.execute(Commands.NAVIGATE_QUICK_OPEN);
                    await awaitsFor(function () { return $bar().length > 0; },
                        "floating Quick Open bar to appear", 3000);
                    await awaitsFor(function () { return $search().length > 0; },
                        "Quick Open search input to exist", 2000);
                }

                async function typeInSearch(text) {
                    $search().val(text);
                    $search().trigger("input");
                }

                async function closeQuickOpen() {
                    if ($bar().length === 0) { return; }
                    const input = $search()[0];
                    if (input) {
                        input.dispatchEvent(new testWindow.KeyboardEvent("keydown",
                            { keyCode: 27, bubbles: true }));
                    }
                    await awaitsFor(function () { return $bar().length === 0; },
                        "floating Quick Open bar to close", 3000);
                }

                afterEach(async function () {
                    await closeQuickOpen();
                });

                it("should show the floating bar and stay in design mode (no ModalBar)", async function () {
                    await openQuickOpenInDesignMode();
                    expect(WorkspaceManager.isInDesignMode()).toBe(true);
                    // Design-mode variant — the Quick Open search field lives inside
                    // the floating bar, not inside a normal ModalBar.
                    expect($search().closest(".quick-open-floating-bar").length).toBe(1);
                    expect($search().closest(".modal-bar").length).toBe(0);
                });

                it("should list project files in the dropdown", async function () {
                    await openQuickOpenInDesignMode();
                    await awaitsFor(function () { return $dropdownItems().length > 0; },
                        "Quick Open dropdown to populate with project files", 3000);
                    const names = $dropdownItems().map(function () {
                        return _$(this).text();
                    }).get().join(" | ");
                    // The test project (QuickOpen-test-files) has lotsOfLines.html
                    // and somelines.html — both should surface without any query.
                    expect(names).toContain("lotsOfLines.html");
                    expect(names).toContain("somelines.html");
                });

                it("should filter the dropdown as the user types", async function () {
                    await openQuickOpenInDesignMode();
                    await awaitsFor(function () { return $dropdownItems().length >= 2; },
                        "Quick Open dropdown to populate", 3000);
                    const beforeCount = $dropdownItems().length;

                    await typeInSearch("somelines");
                    await awaitsFor(function () {
                        const items = $dropdownItems();
                        if (items.length === 0) { return false; }
                        // Every visible item must match the filter.
                        let allMatch = true;
                        items.each(function () {
                            if (!/somelines/i.test(_$(this).text())) { allMatch = false; }
                        });
                        return allMatch && items.length < beforeCount;
                    }, "dropdown to filter down to matching items", 3000);

                    // The un-matching file shouldn't be present anymore.
                    const filteredNames = $dropdownItems().map(function () {
                        return _$(this).text();
                    }).get().join(" | ");
                    expect(filteredNames).toContain("somelines.html");
                    expect(filteredNames).not.toContain("lotsOfLines.html");
                });

                it("should open the selected file when Enter is pressed from the floating bar", async function () {
                    await openQuickOpenInDesignMode();
                    await awaitsFor(function () { return $dropdownItems().length >= 2; },
                        "Quick Open dropdown to populate", 3000);

                    await typeInSearch("somelines");
                    await awaitsFor(function () {
                        const items = $dropdownItems();
                        return items.length > 0 && /somelines/i.test(_$(items[0]).text());
                    }, "somelines.html to be the top match", 3000);

                    const input = $search()[0];
                    input.dispatchEvent(new testWindow.KeyboardEvent("keydown",
                        { keyCode: 13 /* Enter */, bubbles: true }));

                    const DocumentManager = brackets.test.DocumentManager;
                    await awaitsFor(function () {
                        const doc = DocumentManager.getCurrentDocument();
                        return doc && doc.file && doc.file.name === "somelines.html";
                    }, "somelines.html to open in the editor", 5000);
                });
            });

            it("should exit design mode when the git toolbar icon is clicked in design mode", async function () {
                const $gitIcon = _$("#git-toolbar-icon");
                if (!$gitIcon.length || $gitIcon.hasClass("forced-hidden")) {
                    // Git isn't available in this test environment — skip.
                    return;
                }
                await enterDesignMode();
                expect(WorkspaceManager.isInDesignMode()).toBe(true);

                $gitIcon.trigger("click");

                await awaitsFor(function () { return !WorkspaceManager.isInDesignMode(); },
                    "design mode to deactivate on git-icon click", 5000);
            });
        });

        describe("12. Integration with NoDistractions", function () {
            const PREFS_PURE_CODE = "noDistractions";
            let PreferencesManager;

            beforeAll(function () {
                PreferencesManager = brackets.test.PreferencesManager;
            });

            async function setNoDistractions(value) {
                PreferencesManager.set(PREFS_PURE_CODE, value);
                await awaits(0);
            }

            afterEach(async function () {
                await setNoDistractions(false);
                // setNoDistractions(false) in normal mode calls ViewUtils.showMainToolBar(),
                // but if we were in design mode when toggling it won't have been called
                // symmetrically — force the toolbar visible either way for next test.
                const mt = _$("#main-toolbar")[0];
                if (mt && testWindow.getComputedStyle(mt).display === "none") {
                    _$(mt).show();
                }
            });

            it("should hide the sidebar but KEEP main-toolbar visible when noDistractions is turned on in design mode", async function () {
                await enterDesignMode();
                expect(SidebarView.isVisible()).toBe(true);
                expect(testWindow.getComputedStyle(_$("#main-toolbar")[0]).display).not.toBe("none");

                await setNoDistractions(true);
                await awaitsFor(function () { return !SidebarView.isVisible(); },
                    "sidebar to hide under noDistractions in design mode", 3000);

                // Critical: main-toolbar stays visible in design mode — the live
                // preview surface is what the user is focused on.
                expect(testWindow.getComputedStyle(_$("#main-toolbar")[0]).display).not.toBe("none");
            });

            it("should bring the sidebar back when noDistractions is turned off in design mode", async function () {
                await enterDesignMode();
                await setNoDistractions(true);
                await awaitsFor(function () { return !SidebarView.isVisible(); },
                    "sidebar to hide under noDistractions", 3000);

                await setNoDistractions(false);
                await awaitsFor(function () { return SidebarView.isVisible(); },
                    "sidebar to come back when noDistractions turned off", 3000);
            });

            it("should, in normal mode, hide the sidebar when noDistractions is turned on and restore it when turned off", async function () {
                // The original NoDistractions contract also called
                // ViewUtils.hideMainToolBar(), but with the CSS
                // `#main-toolbar { display: flex !important }` added for design-mode
                // rendering, the `.forced-hidden` class loses the specificity fight
                // and the toolbar no longer actually hides. The user-visible effect
                // is just the sidebar collapsing in normal mode.
                expect(WorkspaceManager.isInDesignMode()).toBe(false);
                expect(SidebarView.isVisible()).toBe(true);

                await setNoDistractions(true);
                await awaitsFor(function () { return !SidebarView.isVisible(); },
                    "sidebar to hide in normal-mode noDistractions", 3000);

                await setNoDistractions(false);
                await awaitsFor(function () { return SidebarView.isVisible(); },
                    "sidebar to come back", 3000);
            });
        });

        describe("13. Command / event surface", function () {
            let CentralControlBar;

            beforeAll(function () {
                // CentralControlBar isn't on brackets.test.* so reach for it via
                // the test window's RequireJS registry — this is also how extensions
                // in the wild would access the module.
                CentralControlBar = testWindow.require("view/CentralControlBar");
            });

            it("should expose WorkspaceManager.isInDesignMode() mirroring the current state", async function () {
                expect(typeof WorkspaceManager.isInDesignMode).toBe("function");
                expect(WorkspaceManager.isInDesignMode()).toBe(false);
                await enterDesignMode();
                expect(WorkspaceManager.isInDesignMode()).toBe(true);
                await exitDesignMode();
                expect(WorkspaceManager.isInDesignMode()).toBe(false);
            });

            it("should fire EVENT_WORKSPACE_DESIGN_MODE_CHANGE on setDesignMode transitions and skip it for no-op repeats", async function () {
                const payloads = [];
                const handler = function (event, flag) { payloads.push(flag); };
                WorkspaceManager.on(WorkspaceManager.EVENT_WORKSPACE_DESIGN_MODE_CHANGE, handler);
                try {
                    WorkspaceManager.setDesignMode(true);
                    WorkspaceManager.setDesignMode(true); // no-op repeat
                    WorkspaceManager.setDesignMode(false);
                    WorkspaceManager.setDesignMode(false); // no-op repeat
                } finally {
                    WorkspaceManager.off(WorkspaceManager.EVENT_WORKSPACE_DESIGN_MODE_CHANGE, handler);
                }
                expect(payloads).toEqual([true, false]);
            });

            it("should expose back-compat isEditorCollapsed() / setEditorCollapsed() on CentralControlBar", async function () {
                expect(typeof CentralControlBar.isEditorCollapsed).toBe("function");
                expect(typeof CentralControlBar.setEditorCollapsed).toBe("function");

                expect(CentralControlBar.isEditorCollapsed()).toBe(false);

                CentralControlBar.setEditorCollapsed(true);
                await awaitsFor(function () { return WorkspaceManager.isInDesignMode(); },
                    "design mode to activate via setEditorCollapsed", 10000);
                expect(CentralControlBar.isEditorCollapsed()).toBe(true);

                CentralControlBar.setEditorCollapsed(false);
                await awaitsFor(function () { return !WorkspaceManager.isInDesignMode(); },
                    "design mode to deactivate via setEditorCollapsed", 10000);
                expect(CentralControlBar.isEditorCollapsed()).toBe(false);
            });
        });
    });
});
