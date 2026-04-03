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

/*global describe, beforeAll, afterAll, awaitsFor, it, awaitsForDone, expect*/

define(function (require, exports, module) {

    const SpecRunnerUtils = require("spec/SpecRunnerUtils");

    const mdTestFolder = SpecRunnerUtils.getTestPath("/spec/LiveDevelopment-Markdown-test-files");

    let testWindow, brackets, CommandManager, Commands, EditorManager, WorkspaceManager,
        LiveDevMultiBrowser;

    function _getMdPreviewIFrame() {
        return testWindow.document.getElementById("panel-md-preview-frame");
    }

    function _getMdIFrameDoc() {
        const mdIFrame = _getMdPreviewIFrame();
        return mdIFrame && mdIFrame.contentDocument;
    }

    function _getMdIFrameWin() {
        const mdIFrame = _getMdPreviewIFrame();
        return mdIFrame && mdIFrame.contentWindow;
    }

    async function _enterEditMode() {
        const win = _getMdIFrameWin();
        if (win && win.__setEditModeForTest) {
            win.__setEditModeForTest(false);
            win.__setEditModeForTest(true);
        }
        await awaitsFor(() => {
            const mdDoc = _getMdIFrameDoc();
            if (!mdDoc) { return false; }
            const content = mdDoc.getElementById("viewer-content");
            return content && content.classList.contains("editing");
        }, "edit mode to activate");
    }

    async function _enterReaderMode() {
        const win = _getMdIFrameWin();
        if (win && win.__setEditModeForTest) {
            win.__setEditModeForTest(false);
        }
        await awaitsFor(() => {
            const mdDoc = _getMdIFrameDoc();
            if (!mdDoc) { return false; }
            const content = mdDoc.getElementById("viewer-content");
            return content && !content.classList.contains("editing");
        }, "reader mode to activate");
    }

    async function _waitForMdPreviewReady(editor) {
        const expectedSrc = editor ? editor.document.getText() : null;
        await awaitsFor(() => {
            const mdIFrame = _getMdPreviewIFrame();
            if (!mdIFrame || mdIFrame.style.display === "none") { return false; }
            if (!mdIFrame.src || !mdIFrame.src.includes("mdViewer")) { return false; }
            const win = mdIFrame.contentWindow;
            if (!win || typeof win.__setEditModeForTest !== "function") { return false; }
            if (win.__isSuppressingContentChange && win.__isSuppressingContentChange()) { return false; }
            const content = mdIFrame.contentDocument && mdIFrame.contentDocument.getElementById("viewer-content");
            if (!content || content.children.length === 0) { return false; }
            if (!EditorManager.getActiveEditor()) { return false; }
            if (expectedSrc) {
                const viewerSrc = win.__getCurrentContent && win.__getCurrentContent();
                if (viewerSrc !== expectedSrc) { return false; }
            }
            return true;
        }, "md preview synced with editor content");
    }

    function _dispatchKeyInMdIframe(key, options) {
        const mdDoc = _getMdIFrameDoc();
        if (!mdDoc) { return; }
        options = options || {};
        const mac = brackets.platform === "mac";
        const useMod = options.mod !== false;
        mdDoc.dispatchEvent(new KeyboardEvent("keydown", {
            key: key,
            code: options.code || ("Key" + key.toUpperCase()),
            keyCode: options.keyCode || key.toUpperCase().charCodeAt(0),
            which: options.keyCode || key.toUpperCase().charCodeAt(0),
            ctrlKey: mac ? false : useMod,
            metaKey: mac ? useMod : false,
            shiftKey: !!options.shiftKey,
            altKey: false,
            bubbles: true,
            cancelable: true
        }));
    }

    describe("livepreview:Markdown Editor Edit More", function () {

        if (Phoenix.browser.desktop.isFirefox ||
            (Phoenix.isTestWindowPlaywright && !Phoenix.browser.desktop.isChromeBased)) {
            it("Markdown edit more tests are disabled in Firefox/non-Chrome playwright", function () {});
            return;
        }

        beforeAll(async function () {
            if (!testWindow) {
                const useWindowInsteadOfIframe = Phoenix.browser.desktop.isFirefox;
                testWindow = await SpecRunnerUtils.createTestWindowAndRun({
                    forceReload: false, useWindowInsteadOfIframe
                });
                brackets = testWindow.brackets;
                CommandManager = brackets.test.CommandManager;
                Commands = brackets.test.Commands;
                EditorManager = brackets.test.EditorManager;
                WorkspaceManager = brackets.test.WorkspaceManager;
                LiveDevMultiBrowser = brackets.test.LiveDevMultiBrowser;

                await SpecRunnerUtils.loadProjectInTestWindow(mdTestFolder);
                await SpecRunnerUtils.deletePathAsync(mdTestFolder + "/.phcode.json", true);

                if (!WorkspaceManager.isPanelVisible("live-preview-panel")) {
                    await awaitsForDone(CommandManager.execute(Commands.FILE_LIVE_FILE_PREVIEW));
                }

                await awaitsForDone(SpecRunnerUtils.openProjectFiles(["simple.html"]),
                    "open simple.html");
                LiveDevMultiBrowser.open();
                await awaitsFor(() =>
                    LiveDevMultiBrowser.status === LiveDevMultiBrowser.STATUS_ACTIVE,
                "live dev to open", 20000);
            }
        }, 30000);

        afterAll(async function () {
            if (LiveDevMultiBrowser) {
                LiveDevMultiBrowser.close();
            }
            if (CommandManager) {
                await awaitsForDone(CommandManager.execute(Commands.FILE_CLOSE_ALL, { _forceClose: true }),
                    "final close all files");
            }
            testWindow = null;
            brackets = null;
            CommandManager = null;
            Commands = null;
            EditorManager = null;
            WorkspaceManager = null;
            LiveDevMultiBrowser = null;
        }, 30000);

        describe("In-Document Search (Ctrl+F)", function () {

            beforeAll(async function () {
                await awaitsForDone(SpecRunnerUtils.openProjectFiles(["doc1.md"]),
                    "open doc1.md");
                await _waitForMdPreviewReady(EditorManager.getActiveEditor());
                // Reset cache after iframe is ready (clears stale entries from prior suites)
                const win = _getMdIFrameWin();
                if (win && win.__resetCacheForTest) {
                    win.__resetCacheForTest();
                }
                // Re-open to get a fresh render after cache reset
                await awaitsForDone(SpecRunnerUtils.openProjectFiles(["simple.html"]),
                    "open simple.html to reset");
                await awaitsForDone(SpecRunnerUtils.openProjectFiles(["doc1.md"]),
                    "reopen doc1.md");
                await _waitForMdPreviewReady(EditorManager.getActiveEditor());
                await _enterEditMode();
            }, 20000);

            afterAll(async function () {
                await awaitsForDone(CommandManager.execute(Commands.FILE_CLOSE, { _forceClose: true }),
                    "force close doc1.md");
            });

            function _isSearchOpen() {
                const bar = _getMdIFrameDoc().getElementById("search-bar");
                return bar && bar.classList.contains("open");
            }

            function _getSearchCount() {
                return _getMdIFrameDoc().getElementById("search-count");
            }

            function _getHighlightedMatches() {
                return _getMdIFrameDoc().querySelectorAll("#viewer-content mark[data-markjs]");
            }

            function _getActiveMatch() {
                return _getMdIFrameDoc().querySelector("#viewer-content mark[data-markjs].active");
            }

            function _openSearchWithCtrlF() {
                _dispatchKeyInMdIframe("f");
            }

            function _openSearch() {
                if (brackets.platform === "mac") {
                    // Mac: use direct event emit to bypass nested iframe focus issues
                    const win = _getMdIFrameWin();
                    if (win && win.__toggleSearchForTest) {
                        win.__toggleSearchForTest();
                        return;
                    }
                }
                _openSearchWithCtrlF();
            }

            function _typeInSearch(text) {
                const input = _getMdIFrameDoc().getElementById("search-input");
                input.value = text;
                input.dispatchEvent(new Event("input", { bubbles: true }));
            }

            function _pressKeyInSearch(key, options) {
                const input = _getMdIFrameDoc().getElementById("search-input");
                input.dispatchEvent(new KeyboardEvent("keydown", {
                    key: key,
                    code: options && options.code || key,
                    shiftKey: !!(options && options.shiftKey),
                    bubbles: true,
                    cancelable: true
                }));
            }

            async function _closeSearch() {
                if (_isSearchOpen()) {
                    if (brackets.platform === "mac") {
                        // Mac: use toggle to avoid focus steal from Escape
                        const win = _getMdIFrameWin();
                        if (win && win.__toggleSearchForTest) {
                            win.__toggleSearchForTest();
                        } else {
                            _pressKeyInSearch("Escape");
                        }
                    } else {
                        _pressKeyInSearch("Escape");
                    }
                    await awaitsFor(() => !_isSearchOpen(), "search bar to close");
                }
            }

            // Shared search tests run in both edit and reader mode
            function execSearchTests(modeName, enterModeFn) {
                describe("Search in " + modeName + " mode", function () {

                    beforeAll(async function () {
                        await enterModeFn();
                    }, 10000);

                    it("should Ctrl+F open search bar", async function () {
                        expect(_isSearchOpen()).toBeFalse();
                        _openSearchWithCtrlF();
                        await awaitsFor(() => _isSearchOpen(), "search bar to open");
                        await _closeSearch();
                    }, 10000);

                    it("should typing in search highlight matches", async function () {
                        _openSearch();
                        await awaitsFor(() => _isSearchOpen(), "search bar to open");

                        _typeInSearch("Document");
                        await awaitsFor(() => _getHighlightedMatches().length > 0,
                            "matches to be highlighted");
                        expect(_getActiveMatch()).not.toBeNull();

                        await _closeSearch();
                    }, 10000);

                    it("should match count show N/total format", async function () {
                        _openSearch();
                        await awaitsFor(() => _isSearchOpen(), "search bar to open");

                        _typeInSearch("Document");
                        await awaitsFor(() => {
                            const count = _getSearchCount();
                            return count && /^\d+\/\d+$/.test(count.textContent);
                        }, "match count to show N/total format");

                        expect(_getSearchCount().textContent).toMatch(/^1\/\d+$/);
                        await _closeSearch();
                    }, 10000);

                    it("should Enter navigate to next match", async function () {
                        _openSearch();
                        await awaitsFor(() => _isSearchOpen(), "search bar to open");

                        _typeInSearch("Document");
                        await awaitsFor(() => _getHighlightedMatches().length > 0,
                            "matches to appear");

                        const firstActive = _getActiveMatch();
                        expect(firstActive).not.toBeNull();

                        _pressKeyInSearch("Enter");
                        await awaitsFor(() => {
                            const active = _getActiveMatch();
                            return active && active !== firstActive;
                        }, "active match to change on Enter");

                        await _closeSearch();
                    }, 10000);

                    it("should Shift+Enter navigate to previous match", async function () {
                        _openSearch();
                        await awaitsFor(() => _isSearchOpen(), "search bar to open");

                        _typeInSearch("Document");
                        await awaitsFor(() => _getHighlightedMatches().length > 0,
                            "matches to appear");

                        _pressKeyInSearch("Enter");
                        await awaitsFor(() => {
                            const count = _getSearchCount();
                            return count && count.textContent.startsWith("2/");
                        }, "to be on match 2");

                        _pressKeyInSearch("Enter", { shiftKey: true });
                        await awaitsFor(() => {
                            const count = _getSearchCount();
                            return count && count.textContent.startsWith("1/");
                        }, "to navigate back to match 1");

                        await _closeSearch();
                    }, 10000);

                    it("should navigation wrap around", async function () {
                        _openSearch();
                        await awaitsFor(() => _isSearchOpen(), "search bar to open");

                        _typeInSearch("Document");
                        await awaitsFor(() => _getHighlightedMatches().length > 0,
                            "matches to appear");

                        const totalMatches = _getHighlightedMatches().length;
                        for (let i = 0; i < totalMatches - 1; i++) {
                            _pressKeyInSearch("Enter");
                        }
                        await awaitsFor(() => {
                            const count = _getSearchCount();
                            return count && count.textContent.startsWith(totalMatches + "/");
                        }, "to be on last match");

                        _pressKeyInSearch("Enter");
                        await awaitsFor(() => {
                            const count = _getSearchCount();
                            return count && count.textContent.startsWith("1/");
                        }, "to wrap to first match");

                        await _closeSearch();
                    }, 10000);

                    it("should Escape close search and restore focus", async function () {
                        _openSearch();
                        await awaitsFor(() => _isSearchOpen(), "search bar to open");

                        _typeInSearch("test");
                        await awaitsFor(() => _getHighlightedMatches().length > 0,
                            "matches to appear");

                        _pressKeyInSearch("Escape");
                        await awaitsFor(() => !_isSearchOpen(), "search bar to close");

                        // Focus should leave the search input
                        const mdDoc = _getMdIFrameDoc();
                        const searchInput = mdDoc.getElementById("search-input");
                        await awaitsFor(() => {
                            return mdDoc.activeElement !== searchInput;
                        }, "focus to leave search input");
                    }, 10000);

                    it("should closing search clear all highlights", async function () {
                        _openSearch();
                        await awaitsFor(() => _isSearchOpen(), "search bar to open");

                        _typeInSearch("Document");
                        await awaitsFor(() => _getHighlightedMatches().length > 0,
                            "matches to appear");

                        await _closeSearch();
                        expect(_getHighlightedMatches().length).toBe(0);
                    }, 10000);

                    it("should close button close search", async function () {
                        _openSearch();
                        await awaitsFor(() => _isSearchOpen(), "search bar to open");

                        _typeInSearch("test");
                        await awaitsFor(() => _getHighlightedMatches().length > 0,
                            "matches to appear");

                        _getMdIFrameDoc().getElementById("search-close").click();
                        await awaitsFor(() => !_isSearchOpen(), "search bar to close via × button");
                        expect(_getHighlightedMatches().length).toBe(0);
                    }, 10000);

                    it("should search start from 1 character", async function () {
                        _openSearch();
                        await awaitsFor(() => _isSearchOpen(), "search bar to open");

                        _typeInSearch("D");
                        await awaitsFor(() => _getHighlightedMatches().length > 0,
                            "matches to appear for single character");

                        await _closeSearch();
                    }, 10000);

                    it("should Escape in search NOT forward to Phoenix", async function () {
                        _openSearch();
                        await awaitsFor(() => _isSearchOpen(), "search bar to open");

                        let escapeSent = false;
                        const handler = function (event) {
                            if (event.data && event.data.type === "MDVIEWR_EVENT" &&
                                event.data.eventName === "embeddedEscapeKeyPressed") {
                                escapeSent = true;
                            }
                        };
                        testWindow.addEventListener("message", handler);

                        _pressKeyInSearch("Escape");
                        await awaitsFor(() => !_isSearchOpen(), "search bar to close");

                        testWindow.removeEventListener("message", handler);
                        expect(escapeSent).toBeFalse();
                    }, 10000);
                });
            }

            // Run all search tests in both modes
            execSearchTests("edit", _enterEditMode);
            execSearchTests("reader", _enterReaderMode);
        });
    });
});
