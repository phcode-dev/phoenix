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

/*global describe, it, expect, beforeAll, afterAll, beforeEach, awaitsFor */

define(function (require, exports, module) {

    const SpecRunnerUtils = require("spec/SpecRunnerUtils");

    let SidebarTabs,
        testWindow,
        brackets,
        _$;

    // Test tab constants
    const TEST_TAB_ID = "sidebar-tab-test";
    const TEST_TAB_ID_2 = "sidebar-tab-test-2";

    describe("mainview:SidebarTabs", function () {

        beforeAll(async function () {
            testWindow = await SpecRunnerUtils.createTestWindowAndRun();
            brackets = testWindow.brackets;
            SidebarTabs = brackets.test.SidebarTabs;
            _$ = testWindow.$;
        }, 30000);

        afterAll(async function () {
            // Reset to files tab
            SidebarTabs.setActiveTab(SidebarTabs.SIDEBAR_TAB_FILES);

            // Remove any test tabs that may still exist
            const allTabs = SidebarTabs.getAllTabs();
            allTabs.forEach(function (tab) {
                if (tab.id !== SidebarTabs.SIDEBAR_TAB_FILES) {
                    // Clear content first so removeTab succeeds
                    // (skip tabs that have content - they belong to other extensions)
                }
            });

            SidebarTabs = null;
            testWindow = null;
            brackets = null;
            _$ = null;
            await SpecRunnerUtils.closeTestWindow();
        }, 30000);

        beforeEach(function () {
            // Reset to files tab before each test
            SidebarTabs.setActiveTab(SidebarTabs.SIDEBAR_TAB_FILES);

            // Remove any leftover test tabs
            SidebarTabs.removeTab(TEST_TAB_ID);
            SidebarTabs.removeTab(TEST_TAB_ID_2);
        });

        describe("initial state", function () {

            it("should have #navTabBar as child of #sidebar after #mainNavBar", function () {
                const $navTabBar = _$("#navTabBar");
                expect($navTabBar.length).toBe(1);
                expect($navTabBar.parent().attr("id")).toBe("sidebar");
                // Should come after #mainNavBar
                const $mainNavBar = _$("#mainNavBar");
                expect($mainNavBar.length).toBe(1);
                expect($navTabBar.prev().attr("id")).toBe("mainNavBar");
            });

            it("should have files tab as active tab", function () {
                expect(SidebarTabs.getActiveTab()).toBe(SidebarTabs.SIDEBAR_TAB_FILES);
            });

            it("should include at least the files tab in getAllTabs", function () {
                const allTabs = SidebarTabs.getAllTabs();
                expect(allTabs.length).toBeGreaterThanOrEqual(1);
                const filesTab = allTabs.find(function (t) {
                    return t.id === SidebarTabs.SIDEBAR_TAB_FILES;
                });
                expect(filesTab).toBeDefined();
            });

            it("should have tab bar visible with has-tabs when multiple tabs exist", function () {
                const $navTabBar = _$("#navTabBar");
                const allTabs = SidebarTabs.getAllTabs();
                if (allTabs.length >= 2) {
                    expect($navTabBar.hasClass("has-tabs")).toBe(true);
                }
            });
        });

        describe("addTab and removeTab", function () {

            it("should increase tab count when adding a new tab", function () {
                const initialCount = SidebarTabs.getAllTabs().length;
                SidebarTabs.addTab(TEST_TAB_ID, "Test Tab", "fa-solid fa-flask");
                expect(SidebarTabs.getAllTabs().length).toBe(initialCount + 1);
            });

            it("should not increase count on duplicate addTab", function () {
                SidebarTabs.addTab(TEST_TAB_ID, "Test Tab", "fa-solid fa-flask");
                const countAfterFirst = SidebarTabs.getAllTabs().length;
                SidebarTabs.addTab(TEST_TAB_ID, "Test Tab Dup", "fa-solid fa-flask");
                expect(SidebarTabs.getAllTabs().length).toBe(countAfterFirst);
            });

            it("should return false when removing the built-in files tab", function () {
                const result = SidebarTabs.removeTab(SidebarTabs.SIDEBAR_TAB_FILES);
                expect(result).toBe(false);
            });

            it("should return false when removing a tab that has content", function () {
                SidebarTabs.addTab(TEST_TAB_ID, "Test Tab", "fa-solid fa-flask");
                const $content = _$('<div class="test-tab-content">Content</div>');
                SidebarTabs.addToTab(TEST_TAB_ID, $content);

                const result = SidebarTabs.removeTab(TEST_TAB_ID);
                expect(result).toBe(false);

                // Clean up
                SidebarTabs.removeFromTab(TEST_TAB_ID, $content);
            });

            it("should return true when removing an empty tab", function () {
                SidebarTabs.addTab(TEST_TAB_ID, "Test Tab", "fa-solid fa-flask");
                const result = SidebarTabs.removeTab(TEST_TAB_ID);
                expect(result).toBe(true);
            });

            it("should no longer include tab in getAllTabs after removeTab", function () {
                SidebarTabs.addTab(TEST_TAB_ID, "Test Tab", "fa-solid fa-flask");
                SidebarTabs.removeTab(TEST_TAB_ID);
                const allTabs = SidebarTabs.getAllTabs();
                const found = allTabs.find(function (t) { return t.id === TEST_TAB_ID; });
                expect(found).toBeUndefined();
            });

            it("should fire EVENT_TAB_ADDED on addTab", function () {
                let firedId = null;
                function handler(event, id) {
                    firedId = id;
                }
                SidebarTabs.on(SidebarTabs.EVENT_TAB_ADDED, handler);
                SidebarTabs.addTab(TEST_TAB_ID, "Test Tab", "fa-solid fa-flask");
                SidebarTabs.off(SidebarTabs.EVENT_TAB_ADDED, handler);

                expect(firedId).toBe(TEST_TAB_ID);
            });

            it("should fire EVENT_TAB_REMOVED on removeTab", function () {
                let firedId = null;
                function handler(event, id) {
                    firedId = id;
                }
                SidebarTabs.addTab(TEST_TAB_ID, "Test Tab", "fa-solid fa-flask");
                SidebarTabs.on(SidebarTabs.EVENT_TAB_REMOVED, handler);
                SidebarTabs.removeTab(TEST_TAB_ID);
                SidebarTabs.off(SidebarTabs.EVENT_TAB_REMOVED, handler);

                expect(firedId).toBe(TEST_TAB_ID);
            });
        });

        describe("addToTab and removeFromTab", function () {

            it("should append content node to #sidebar", function () {
                SidebarTabs.addTab(TEST_TAB_ID, "Test Tab", "fa-solid fa-flask");
                const $content = _$('<div id="test-sidebar-content">Hello</div>');
                SidebarTabs.addToTab(TEST_TAB_ID, $content);

                expect(_$("#sidebar").find("#test-sidebar-content").length).toBe(1);

                // Clean up
                SidebarTabs.removeFromTab(TEST_TAB_ID, $content);
            });

            it("should hide content added to a non-active tab", function () {
                SidebarTabs.addTab(TEST_TAB_ID, "Test Tab", "fa-solid fa-flask");
                // Active tab is FILES, so content added to TEST_TAB_ID should be hidden
                const $content = _$('<div id="test-hidden-content">Hidden</div>');
                SidebarTabs.addToTab(TEST_TAB_ID, $content);

                expect($content.hasClass("sidebar-tab-hidden")).toBe(true);

                // Clean up
                SidebarTabs.removeFromTab(TEST_TAB_ID, $content);
            });

            it("should show content added to the active tab", function () {
                SidebarTabs.addTab(TEST_TAB_ID, "Test Tab", "fa-solid fa-flask");
                SidebarTabs.setActiveTab(TEST_TAB_ID);

                const $content = _$('<div id="test-visible-content">Visible</div>');
                SidebarTabs.addToTab(TEST_TAB_ID, $content);

                expect($content.hasClass("sidebar-tab-hidden")).toBe(false);

                // Clean up
                SidebarTabs.removeFromTab(TEST_TAB_ID, $content);
                SidebarTabs.setActiveTab(SidebarTabs.SIDEBAR_TAB_FILES);
            });

            it("should remove node from DOM when removeFromTab leaves it in no tab", function () {
                SidebarTabs.addTab(TEST_TAB_ID, "Test Tab", "fa-solid fa-flask");
                const $content = _$('<div id="test-remove-content">Remove me</div>');
                SidebarTabs.addToTab(TEST_TAB_ID, $content);

                expect(_$("#sidebar").find("#test-remove-content").length).toBe(1);

                SidebarTabs.removeFromTab(TEST_TAB_ID, $content);
                expect(_$("#sidebar").find("#test-remove-content").length).toBe(0);
            });

            it("should keep node in DOM when removeFromTab still leaves it in another tab", function () {
                SidebarTabs.addTab(TEST_TAB_ID, "Test Tab", "fa-solid fa-flask");
                SidebarTabs.addTab(TEST_TAB_ID_2, "Test Tab 2", "fa-solid fa-flask");
                const $content = _$('<div id="test-multi-content">Multi</div>');
                SidebarTabs.addToTab(TEST_TAB_ID, $content);
                SidebarTabs.addToTab(TEST_TAB_ID_2, $content);

                SidebarTabs.removeFromTab(TEST_TAB_ID, $content);
                expect(_$("#sidebar").find("#test-multi-content").length).toBe(1);

                // Clean up
                SidebarTabs.removeFromTab(TEST_TAB_ID_2, $content);
            });
        });

        describe("setActiveTab", function () {

            it("should set getActiveTab to the new tab id", function () {
                SidebarTabs.addTab(TEST_TAB_ID, "Test Tab", "fa-solid fa-flask");
                SidebarTabs.setActiveTab(TEST_TAB_ID);

                expect(SidebarTabs.getActiveTab()).toBe(TEST_TAB_ID);
            });

            it("should show existing sidebar children when switching to files tab", function () {
                SidebarTabs.addTab(TEST_TAB_ID, "Test Tab", "fa-solid fa-flask");
                SidebarTabs.setActiveTab(TEST_TAB_ID);
                SidebarTabs.setActiveTab(SidebarTabs.SIDEBAR_TAB_FILES);

                // Working set and project files should be visible
                const $openFilesContainer = _$("#open-files-container");
                const $projectFilesContainer = _$("#project-files-container");
                if ($openFilesContainer.length) {
                    expect($openFilesContainer.hasClass("sidebar-tab-hidden")).toBe(false);
                }
                if ($projectFilesContainer.length) {
                    expect($projectFilesContainer.hasClass("sidebar-tab-hidden")).toBe(false);
                }
            });

            it("should hide existing sidebar children when switching to custom tab", function () {
                SidebarTabs.addTab(TEST_TAB_ID, "Test Tab", "fa-solid fa-flask");
                const $content = _$('<div id="test-custom-visible">Custom</div>');
                SidebarTabs.addToTab(TEST_TAB_ID, $content);

                SidebarTabs.setActiveTab(TEST_TAB_ID);

                // Existing sidebar children (not associated with any tab) should be hidden
                const $openFilesContainer = _$("#open-files-container");
                if ($openFilesContainer.length) {
                    expect($openFilesContainer.hasClass("sidebar-tab-hidden")).toBe(true);
                }

                // Custom tab content should be visible
                expect($content.hasClass("sidebar-tab-hidden")).toBe(false);

                // Clean up
                SidebarTabs.setActiveTab(SidebarTabs.SIDEBAR_TAB_FILES);
                SidebarTabs.removeFromTab(TEST_TAB_ID, $content);
            });

            it("should restore sidebar children when switching back to files", function () {
                SidebarTabs.addTab(TEST_TAB_ID, "Test Tab", "fa-solid fa-flask");
                const $content = _$('<div id="test-switchback">SwitchBack</div>');
                SidebarTabs.addToTab(TEST_TAB_ID, $content);

                // Switch to custom tab then back
                SidebarTabs.setActiveTab(TEST_TAB_ID);
                SidebarTabs.setActiveTab(SidebarTabs.SIDEBAR_TAB_FILES);

                // Sidebar children should be visible again
                const $openFilesContainer = _$("#open-files-container");
                if ($openFilesContainer.length) {
                    expect($openFilesContainer.hasClass("sidebar-tab-hidden")).toBe(false);
                }
                // Custom content should be hidden
                expect($content.hasClass("sidebar-tab-hidden")).toBe(true);

                // Clean up
                SidebarTabs.removeFromTab(TEST_TAB_ID, $content);
            });

            it("should fire EVENT_TAB_CHANGED with newTabId and previousTabId", function () {
                let eventArgs = null;
                function handler(event, newTabId, previousTabId) {
                    eventArgs = { newTabId: newTabId, previousTabId: previousTabId };
                }
                SidebarTabs.addTab(TEST_TAB_ID, "Test Tab", "fa-solid fa-flask");
                SidebarTabs.on(SidebarTabs.EVENT_TAB_CHANGED, handler);
                SidebarTabs.setActiveTab(TEST_TAB_ID);
                SidebarTabs.off(SidebarTabs.EVENT_TAB_CHANGED, handler);

                expect(eventArgs).not.toBeNull();
                expect(eventArgs.newTabId).toBe(TEST_TAB_ID);
                expect(eventArgs.previousTabId).toBe(SidebarTabs.SIDEBAR_TAB_FILES);
            });

            it("should do nothing when setActiveTab is called with unknown id", function () {
                const currentTab = SidebarTabs.getActiveTab();
                SidebarTabs.setActiveTab("nonexistent-tab-id");
                expect(SidebarTabs.getActiveTab()).toBe(currentTab);
            });

            it("should never hide #mainNavBar during any switch", function () {
                SidebarTabs.addTab(TEST_TAB_ID, "Test Tab", "fa-solid fa-flask");

                SidebarTabs.setActiveTab(TEST_TAB_ID);
                const $mainNavBar = _$("#mainNavBar");
                expect($mainNavBar.hasClass("sidebar-tab-hidden")).toBe(false);

                SidebarTabs.setActiveTab(SidebarTabs.SIDEBAR_TAB_FILES);
                expect($mainNavBar.hasClass("sidebar-tab-hidden")).toBe(false);
            });

            it("should never hide #navTabBar during any switch", function () {
                SidebarTabs.addTab(TEST_TAB_ID, "Test Tab", "fa-solid fa-flask");

                SidebarTabs.setActiveTab(TEST_TAB_ID);
                const $navTabBar = _$("#navTabBar");
                expect($navTabBar.hasClass("sidebar-tab-hidden")).toBe(false);

                SidebarTabs.setActiveTab(SidebarTabs.SIDEBAR_TAB_FILES);
                expect($navTabBar.hasClass("sidebar-tab-hidden")).toBe(false);
            });

            it("should never hide resizer elements during any switch", function () {
                SidebarTabs.addTab(TEST_TAB_ID, "Test Tab", "fa-solid fa-flask");

                SidebarTabs.setActiveTab(TEST_TAB_ID);
                const $horzResizers = _$("#sidebar .horz-resizer");
                const $vertResizers = _$("#sidebar .vert-resizer");
                $horzResizers.each(function (i, el) {
                    expect(_$(el).hasClass("sidebar-tab-hidden")).toBe(false);
                });
                $vertResizers.each(function (i, el) {
                    expect(_$(el).hasClass("sidebar-tab-hidden")).toBe(false);
                });

                SidebarTabs.setActiveTab(SidebarTabs.SIDEBAR_TAB_FILES);
                $horzResizers.each(function (i, el) {
                    expect(_$(el).hasClass("sidebar-tab-hidden")).toBe(false);
                });
                $vertResizers.each(function (i, el) {
                    expect(_$(el).hasClass("sidebar-tab-hidden")).toBe(false);
                });
            });
        });

        describe("multi-tab content", function () {

            it("should show node associated with two tabs when either is active", function () {
                SidebarTabs.addTab(TEST_TAB_ID, "Test Tab", "fa-solid fa-flask");
                SidebarTabs.addTab(TEST_TAB_ID_2, "Test Tab 2", "fa-solid fa-flask");
                const $content = _$('<div id="test-multi-visible">Multi</div>');
                SidebarTabs.addToTab(TEST_TAB_ID, $content);
                SidebarTabs.addToTab(TEST_TAB_ID_2, $content);

                SidebarTabs.setActiveTab(TEST_TAB_ID);
                expect($content.hasClass("sidebar-tab-hidden")).toBe(false);

                SidebarTabs.setActiveTab(TEST_TAB_ID_2);
                expect($content.hasClass("sidebar-tab-hidden")).toBe(false);

                // Clean up
                SidebarTabs.setActiveTab(SidebarTabs.SIDEBAR_TAB_FILES);
                SidebarTabs.removeFromTab(TEST_TAB_ID, $content);
                SidebarTabs.removeFromTab(TEST_TAB_ID_2, $content);
            });

            it("should keep node visible after removing from one tab if other tab is active", function () {
                SidebarTabs.addTab(TEST_TAB_ID, "Test Tab", "fa-solid fa-flask");
                SidebarTabs.addTab(TEST_TAB_ID_2, "Test Tab 2", "fa-solid fa-flask");
                const $content = _$('<div id="test-multi-remove-one">Multi</div>');
                SidebarTabs.addToTab(TEST_TAB_ID, $content);
                SidebarTabs.addToTab(TEST_TAB_ID_2, $content);

                SidebarTabs.setActiveTab(TEST_TAB_ID_2);
                SidebarTabs.removeFromTab(TEST_TAB_ID, $content);
                // Still in TEST_TAB_ID_2 which is active, so visible
                expect($content.hasClass("sidebar-tab-hidden")).toBe(false);

                // Clean up
                SidebarTabs.setActiveTab(SidebarTabs.SIDEBAR_TAB_FILES);
                SidebarTabs.removeFromTab(TEST_TAB_ID_2, $content);
            });

            it("should remove appended node from DOM when removed from all tabs", function () {
                SidebarTabs.addTab(TEST_TAB_ID, "Test Tab", "fa-solid fa-flask");
                SidebarTabs.addTab(TEST_TAB_ID_2, "Test Tab 2", "fa-solid fa-flask");
                const $content = _$('<div id="test-multi-remove-all">Multi</div>');
                SidebarTabs.addToTab(TEST_TAB_ID, $content);
                SidebarTabs.addToTab(TEST_TAB_ID_2, $content);

                SidebarTabs.removeFromTab(TEST_TAB_ID, $content);
                SidebarTabs.removeFromTab(TEST_TAB_ID_2, $content);

                // Node was appended by addToTab, so it should be removed from DOM
                expect(_$("#sidebar").find("#test-multi-remove-all").length).toBe(0);
            });
        });

        describe("tab bar visibility", function () {

            it("should have has-tabs class when >= 2 tabs exist", function () {
                const $navTabBar = _$("#navTabBar");
                // There should already be at least the files tab; add one more
                SidebarTabs.addTab(TEST_TAB_ID, "Test Tab", "fa-solid fa-flask");
                expect(SidebarTabs.getAllTabs().length).toBeGreaterThanOrEqual(2);
                expect($navTabBar.hasClass("has-tabs")).toBe(true);
            });

            it("should lose has-tabs class when only 1 tab remains", function () {
                const $navTabBar = _$("#navTabBar");
                // Add our own test tab so we have a known removable tab
                SidebarTabs.addTab(TEST_TAB_ID, "Test Tab", "fa-solid fa-flask");
                const countWithTestTab = SidebarTabs.getAllTabs().length;
                expect($navTabBar.hasClass("has-tabs")).toBe(true);

                // Remove only our test tab
                SidebarTabs.removeTab(TEST_TAB_ID);
                const countAfterRemove = SidebarTabs.getAllTabs().length;
                expect(countAfterRemove).toBe(countWithTestTab - 1);

                // has-tabs should accurately reflect whether >= 2 tabs remain
                expect($navTabBar.hasClass("has-tabs")).toBe(countAfterRemove >= 2);
            });
        });
    });
});
