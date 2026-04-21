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

/*global describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, awaitsFor */

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
            _$;

        beforeAll(async function () {
            testWindow = await SpecRunnerUtils.createTestWindowAndRun();
            brackets = testWindow.brackets;
            CommandManager = brackets.test.CommandManager;
            Commands = brackets.test.Commands;
            SidebarView = brackets.test.SidebarView;
            _$ = testWindow.$;
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
            _$ = null;
            await SpecRunnerUtils.closeTestWindow();
        }, 30000);

        // Helper: record every command the CentralControlBar dispatches during the
        // fn() body. Preferred over Jasmine spies because it exercises the real
        // CommandManager dispatch path — the `beforeExecuteCommand` event fires on
        // every `CommandManager.execute`, so we measure the actual effect of the
        // click handler without monkey-patching.
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

        beforeEach(function () {
            // Every test starts with the sidebar visible.
            if (!SidebarView.isVisible()) {
                SidebarView.show();
            }
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

            it("should trigger CMD_FIND_IN_FILES when the search button is clicked", function () {
                const executed = recordCommands(function () {
                    _$("#searchNav").trigger("click");
                });
                // searchNav routes through NavigationProvider._findInFiles which dispatches CMD_FIND_IN_FILES.
                expect(executed).toContain(Commands.CMD_FIND_IN_FILES);
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

        describe("3. #show-in-file-tree button in sidebar", function () {

            it("should render #show-in-file-tree inside #project-files-header, before #collapse-folders, with the localized title", function () {
                const $btn = _$("#show-in-file-tree");
                expect($btn.length).toBe(1);
                expect($btn.parent().attr("id")).toBe("project-files-header");
                // #collapse-folders sits after #show-in-file-tree in DOM order.
                expect($btn.nextAll("#collapse-folders").length).toBe(1);
                expect($btn.attr("title")).toBe(Strings.CMD_SHOW_IN_TREE);
            });

            it("should execute NAVIGATE_SHOW_IN_FILE_TREE when #show-in-file-tree is clicked", function () {
                const executed = recordCommands(function () {
                    _$("#show-in-file-tree").trigger("click");
                });
                expect(executed).toContain(Commands.NAVIGATE_SHOW_IN_FILE_TREE);
            });
        });
    });
});
