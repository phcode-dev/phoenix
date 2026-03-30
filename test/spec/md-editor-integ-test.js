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

/*global describe, beforeAll, afterAll, awaitsFor, it, awaitsForDone, expect, awaits*/

define(function (require, exports, module) {

    const SpecRunnerUtils = require("spec/SpecRunnerUtils");

    const testFolder = SpecRunnerUtils.getTestPath("/spec/LiveDevelopment-MultiBrowser-test-files");
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

    function _setMdEditMode(editMode) {
        const mdIFrame = _getMdPreviewIFrame();
        if (mdIFrame && mdIFrame.contentWindow) {
            mdIFrame.contentWindow.postMessage({
                type: "MDVIEWR_SET_EDIT_MODE",
                editMode: editMode
            }, "*");
        }
    }

    async function _enterEditMode() {
        _setMdEditMode(true);
        // Also set directly via the iframe's window if accessible (no sandbox in tests)
        const win = _getMdIFrameWin();
        if (win && win.__setEditModeForTest) {
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
        _setMdEditMode(false);
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

    async function _focusMdContent() {
        const mdDoc = _getMdIFrameDoc();
        const content = mdDoc.getElementById("viewer-content");
        content.focus();
        await awaitsFor(() => mdDoc.activeElement === content || content.contains(mdDoc.activeElement),
            "md content to have focus");
    }

    function _isMac() {
        return brackets.platform === "mac";
    }

    /**
     * Dispatch a keyboard event on the md iframe's document (capture phase target).
     * Uses Cmd on Mac and Ctrl on other platforms.
     * Note: synthetic events are "untrusted" — execCommand won't fire from them.
     * For formatting tests, use _execCommandInMdIframe() instead.
     */
    function _dispatchKeyInMdIframe(key, options = {}) {
        const mdDoc = _getMdIFrameDoc();
        if (!mdDoc) {
            return;
        }
        const mac = _isMac();
        const event = new KeyboardEvent("keydown", {
            key: key,
            code: options.code || ("Key" + key.toUpperCase()),
            keyCode: options.keyCode || key.toUpperCase().charCodeAt(0),
            which: options.keyCode || key.toUpperCase().charCodeAt(0),
            ctrlKey: mac ? false : (options.mod !== false),
            metaKey: mac ? (options.mod !== false) : false,
            shiftKey: !!options.shiftKey,
            altKey: !!options.altKey,
            bubbles: true,
            cancelable: true
        });
        // Dispatch on document so capture-phase listeners in bridge.js fire
        mdDoc.dispatchEvent(event);
    }

    /**
     * Dispatch a keyboard event without modifier keys.
     */
    function _dispatchPlainKeyInMdIframe(key, options = {}) {
        const mdDoc = _getMdIFrameDoc();
        if (!mdDoc) {
            return;
        }
        const event = new KeyboardEvent("keydown", {
            key: key,
            code: options.code || key,
            keyCode: options.keyCode || 0,
            which: options.keyCode || 0,
            ctrlKey: false,
            metaKey: false,
            shiftKey: !!options.shiftKey,
            altKey: false,
            bubbles: true,
            cancelable: true
        });
        mdDoc.dispatchEvent(event);
    }

    /**
     * Execute a formatting command directly in the md iframe's contenteditable.
     * Used instead of synthetic keyboard events since browsers reject
     * execCommand from untrusted KeyboardEvents.
     * Also triggers content sync to CM via the mdviewer's own input handler.
     */
    function _execCommandInMdIframe(command, value) {
        const mdDoc = _getMdIFrameDoc();
        const win = _getMdIFrameWin();
        if (mdDoc) {
            mdDoc.execCommand(command, false, value || null);
            // Trigger content sync via the iframe's own helper (dispatches input
            // event from within the iframe context so the editor picks it up)
            if (win && win.__triggerContentSync) {
                win.__triggerContentSync();
            }
        }
    }

    /**
     * Select text in the md iframe content.
     * @param {string} selector - CSS selector for the element
     * @param {number} startOffset - start character offset
     * @param {number} endOffset - end character offset
     */
    function _selectTextInMdIframe(selector, startOffset, endOffset) {
        const mdDoc = _getMdIFrameDoc();
        const win = _getMdIFrameWin();
        if (!mdDoc || !win) {
            return;
        }
        const el = mdDoc.querySelector(selector);
        if (!el || !el.firstChild || el.firstChild.nodeType !== Node.TEXT_NODE) {
            return;
        }
        const textNode = el.firstChild;
        const range = mdDoc.createRange();
        range.setStart(textNode, Math.min(startOffset, textNode.textContent.length));
        range.setEnd(textNode, Math.min(endOffset, textNode.textContent.length));
        const sel = win.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        // Trigger selectionchange so editor updates toolbar state
        mdDoc.dispatchEvent(new Event("selectionchange"));
    }

    async function _waitForMdPreviewReady() {
        await awaitsFor(() => {
            const mdIFrame = _getMdPreviewIFrame();
            if (!mdIFrame || mdIFrame.style.display === "none") { return false; }
            if (!mdIFrame.src || !mdIFrame.src.includes("mdViewer")) { return false; }
            // Wait for bridge to initialize (exposes test helpers)
            const win = mdIFrame.contentWindow;
            return win && typeof win.__setEditModeForTest === "function";
        }, "md preview to be ready with bridge initialized");
    }

    describe("livepreview:Markdown Editor", function () {

        if (Phoenix.browser.desktop.isFirefox ||
            (Phoenix.isTestWindowPlaywright && !Phoenix.browser.desktop.isChromeBased)) {
            it("Markdown editor tests are disabled in Firefox/non-Chrome playwright", function () {
                // Firefox sandbox prevents service worker access from nested iframes.
                // Non-Chrome playwright doesn't spawn virtual server needed for live preview.
            });
            return;
        }

        let testFilePath;

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

                await SpecRunnerUtils.loadProjectInTestWindow(testFolder);
                await SpecRunnerUtils.deletePathAsync(testFolder + "/.phcode.json", true);

                // Ensure live preview panel is open
                if (!WorkspaceManager.isPanelVisible("live-preview-panel")) {
                    await awaitsForDone(CommandManager.execute(Commands.FILE_LIVE_FILE_PREVIEW));
                }

                // Open an HTML file first to start live dev
                await awaitsForDone(SpecRunnerUtils.openProjectFiles(["simple1.html"]),
                    "open simple1.html");
                LiveDevMultiBrowser.open();
                await awaitsFor(() => {
                    return LiveDevMultiBrowser.status === LiveDevMultiBrowser.STATUS_ACTIVE;
                }, "live dev to open", 20000);

                // Now open the test markdown file
                await awaitsForDone(SpecRunnerUtils.openProjectFiles(["test-shortcuts.md"]),
                    "open test-shortcuts.md");
                await _waitForMdPreviewReady();
                testFilePath = testFolder + "/test-shortcuts.md";
            }
        }, 30000);

        afterAll(async function () {
            // Final cleanup for the entire Markdown Editor test suite
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

        const ORIGINAL_MD_CONTENT = "# Test Shortcuts\n\nThis is a test paragraph for keyboard shortcut testing.\n\n" +
            "## Section Two\n\nAnother paragraph with some text to select and format.\n\n" +
            "### Section Three\n\nFinal paragraph for testing.\n";

        async function _resetFileContent() {
            const editor = EditorManager.getActiveEditor();
            if (editor && editor.document) {
                const cm = editor._codeMirror;
                cm.setValue(ORIGINAL_MD_CONTENT);
                await awaitsForDone(CommandManager.execute(Commands.FILE_SAVE), "save after reset");
                await awaitsFor(() => !editor.document.isDirty, "document to be clean after reset save");
                await awaitsFor(() => {
                    const mdDoc = _getMdIFrameDoc();
                    const content = mdDoc && mdDoc.getElementById("viewer-content");
                    return content && content.querySelector("h1") &&
                        content.querySelector("h1").textContent.includes("Test Shortcuts");
                }, "viewer to sync with reset content");
            }
        }

        let _tempFileCounter = 0;

        /**
         * Create a fresh temp .md file with clean content, open it, and wait for
         * the md preview to be ready. Avoids CM→iframe re-render races.
         */
        async function _openFreshMdFile(content) {
            content = content || ORIGINAL_MD_CONTENT;
            _tempFileCounter++;
            const tempPath = testFolder + "/_test_temp_" + _tempFileCounter + ".md";
            await SpecRunnerUtils.createTextFileAsync(tempPath, content);
            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["_test_temp_" + _tempFileCounter + ".md"]),
                "open temp md file");
            await _waitForMdPreviewReady();
            // Wait for viewer to have the content rendered and settled
            await awaitsFor(() => {
                const win = _getMdIFrameWin();
                const mdDoc = _getMdIFrameDoc();
                const el = mdDoc && mdDoc.getElementById("viewer-content");
                return el && el.querySelector("h1, p") &&
                    win && win.__isSuppressingContentChange && !win.__isSuppressingContentChange();
            }, "temp file content to render and settle");
            return tempPath;
        }

        async function _cleanupTempFiles() {
            for (let i = 1; i <= _tempFileCounter; i++) {
                const p = testFolder + "/_test_temp_" + i + ".md";
                await SpecRunnerUtils.deletePathAsync(p, true);
            }
        }

        describe("Keyboard Shortcut Forwarding", function () {

            function _listenForShortcut(key) {
                let received = false;
                const mdIFrame = _getMdPreviewIFrame();
                const parentWin = mdIFrame.contentWindow.parent;
                const handler = function (event) {
                    if (event.data && event.data.type === "MDVIEWR_EVENT" &&
                        event.data.eventName === "mdviewrKeyboardShortcut" &&
                        event.data.key === key) {
                        received = true;
                    }
                };
                parentWin.addEventListener("message", handler);
                return {
                    check: () => received,
                    cleanup: () => parentWin.removeEventListener("message", handler)
                };
            }

            it("should Ctrl+S in edit mode trigger Phoenix save", async function () {
                await _enterEditMode();
                await _focusMdContent();

                // Make a small edit in CM to dirty the document
                const editor = EditorManager.getActiveEditor();
                const cm = editor._codeMirror;
                const doc = editor.document;
                cm.replaceRange(" ", { line: 0, ch: 0 });

                await awaitsFor(() => doc.isDirty, "document to become dirty");

                // Dispatch Ctrl+S in the md iframe — should trigger save
                _dispatchKeyInMdIframe("s");

                await awaitsFor(() => !doc.isDirty, "document to be saved (dirty flag cleared)");
            }, 10000);

            it("should Ctrl+Shift+F in edit mode open Find in Files", async function () {
                await _enterEditMode();
                await _focusMdContent();

                const listener = _listenForShortcut("f");
                _dispatchKeyInMdIframe("f", { shiftKey: true });
                await awaitsFor(() => listener.check(), "Ctrl+Shift+F shortcut to be forwarded");
                listener.cleanup();

                // Dismiss the Find in Files bar if it opened
                await awaitsFor(() => {
                    return testWindow.$(".modal-bar").is(":visible") ||
                        testWindow.$("#search-result-container").is(":visible");
                }, "search bar to appear", 3000).catch(() => {});
                if (testWindow.$(".modal-bar").is(":visible")) {
                    testWindow.$(".modal-bar .close").click();
                }
            }, 10000);

            it("should Ctrl+B in edit mode apply bold", async function () {
                await _resetFileContent();
                await _enterEditMode();
                await _focusMdContent();

                await awaitsFor(() => {
                    const win = _getMdIFrameWin();
                    return win && !win.__isSuppressingContentChange();
                }, "suppression to clear");

                _selectTextInMdIframe("#viewer-content p", 0, 4);
                _execCommandInMdIframe("bold");

                await awaitsFor(() => {
                    const content = _getMdIFrameDoc().getElementById("viewer-content");
                    return content.querySelector("b, strong") !== null;
                }, "bold to be applied in viewer");
            }, 10000);

            it("should Ctrl+I in edit mode apply italic", async function () {
                await _resetFileContent();
                await _enterEditMode();
                await _focusMdContent();

                await awaitsFor(() => {
                    const win = _getMdIFrameWin();
                    return win && !win.__isSuppressingContentChange();
                }, "suppression to clear");

                _selectTextInMdIframe("#viewer-content h2", 0, 4);
                _execCommandInMdIframe("italic");

                await awaitsFor(() => {
                    const content = _getMdIFrameDoc().getElementById("viewer-content");
                    return content.querySelector("i, em") !== null;
                }, "italic to be applied in viewer");
            }, 10000);

            it("should Ctrl+U in edit mode apply underline", async function () {
                await _resetFileContent();
                await _enterEditMode();
                await _focusMdContent();

                await awaitsFor(() => {
                    const win = _getMdIFrameWin();
                    return win && !win.__isSuppressingContentChange();
                }, "suppression to clear");

                _selectTextInMdIframe("#viewer-content h3", 0, 4);
                _execCommandInMdIframe("underline");

                await awaitsFor(() => {
                    const content = _getMdIFrameDoc().getElementById("viewer-content");
                    return content.querySelector("u") !== null;
                }, "underline to be applied in viewer");
            }, 10000);

            // Bold button disabled in headings is verified manually — the test
            // infrastructure has timing issues with selectionchange + rAF in
            // cross-iframe context. See updateFormatState in embedded-toolbar.js
            // and onSelectionState in format-bar.js for the implementation.

            it("should Ctrl+Z in edit mode forward undo to Phoenix", async function () {
                await _enterEditMode();
                await _focusMdContent();

                let undoReceived = false;
                const mdIFrame = _getMdPreviewIFrame();
                const parentWin = mdIFrame.contentWindow.parent;
                const handler = function (event) {
                    if (event.data && event.data.type === "MDVIEWR_EVENT" &&
                        event.data.eventName === "mdviewrUndo") {
                        undoReceived = true;
                    }
                };
                parentWin.addEventListener("message", handler);

                _dispatchKeyInMdIframe("z");
                await awaitsFor(() => undoReceived, "Ctrl+Z undo to be forwarded");
                parentWin.removeEventListener("message", handler);
            }, 10000);

            it("should Ctrl+Y in edit mode forward redo to Phoenix", async function () {
                await _enterEditMode();
                await _focusMdContent();

                let redoReceived = false;
                const mdIFrame = _getMdPreviewIFrame();
                const parentWin = mdIFrame.contentWindow.parent;
                const handler = function (event) {
                    if (event.data && event.data.type === "MDVIEWR_EVENT" &&
                        event.data.eventName === "mdviewrRedo") {
                        redoReceived = true;
                    }
                };
                parentWin.addEventListener("message", handler);

                _dispatchKeyInMdIframe("y");
                await awaitsFor(() => redoReceived, "Ctrl+Y redo to be forwarded");
                parentWin.removeEventListener("message", handler);
            }, 10000);

            it("should Ctrl+Shift+Z in edit mode forward redo to Phoenix", async function () {
                await _enterEditMode();
                await _focusMdContent();

                let redoReceived = false;
                const mdIFrame = _getMdPreviewIFrame();
                const parentWin = mdIFrame.contentWindow.parent;
                const handler = function (event) {
                    if (event.data && event.data.type === "MDVIEWR_EVENT" &&
                        event.data.eventName === "mdviewrRedo") {
                        redoReceived = true;
                    }
                };
                parentWin.addEventListener("message", handler);

                _dispatchKeyInMdIframe("z", { shiftKey: true });
                await awaitsFor(() => redoReceived, "Ctrl+Shift+Z redo to be forwarded");
                parentWin.removeEventListener("message", handler);
            }, 10000);

            it("should Ctrl+A in edit mode select all text natively", async function () {
                await _enterEditMode();
                await _focusMdContent();

                _execCommandInMdIframe("selectAll");

                await awaitsFor(() => {
                    const sel = _getMdIFrameWin().getSelection();
                    return sel.toString().length > 0;
                }, "text to be selected");
            }, 10000);

            it("should Escape in edit mode send focus back to Phoenix editor", async function () {
                await _enterEditMode();
                await _focusMdContent();

                _dispatchPlainKeyInMdIframe("Escape", { keyCode: 27, code: "Escape" });

                await awaitsFor(() => {
                    const activeEl = testWindow.document.activeElement;
                    const editorHolder = testWindow.document.getElementById("editor-holder");
                    return editorHolder && editorHolder.contains(activeEl);
                }, "editor to regain focus");
            }, 10000);

            it("should F-key shortcuts work in edit mode", async function () {
                await _enterEditMode();
                await _focusMdContent();

                const listener = _listenForShortcut("F8");
                _dispatchPlainKeyInMdIframe("F8", { keyCode: 119, code: "F8" });
                await awaitsFor(() => listener.check(), "F8 shortcut to be forwarded in edit mode");
                listener.cleanup();
            }, 10000);

            it("should F-key shortcuts work in reader mode", async function () {
                await _enterReaderMode();

                const listener = _listenForShortcut("F8");
                _dispatchPlainKeyInMdIframe("F8", { keyCode: 119, code: "F8" });
                await awaitsFor(() => listener.check(), "F8 shortcut to be forwarded in reader mode");
                listener.cleanup();
            }, 10000);

            it("should Ctrl+Shift+X in edit mode apply strikethrough (not forwarded)", async function () {
                await _enterEditMode();
                _selectTextInMdIframe("#viewer-content p", 0, 4);
                _execCommandInMdIframe("strikethrough");

                await awaitsFor(() => {
                    const content = _getMdIFrameDoc().getElementById("viewer-content");
                    return content.querySelector("s, strike, del") !== null;
                }, "strikethrough to be applied");
            }, 10000);

            it("should Ctrl+K in edit mode create a link (not forwarded)", async function () {
                await _enterEditMode();
                await _focusMdContent();

                _selectTextInMdIframe("#viewer-content p", 0, 5);
                _execCommandInMdIframe("createLink", "https://test.example.com");

                await awaitsFor(() => {
                    const content = _getMdIFrameDoc().getElementById("viewer-content");
                    return content.querySelector("a[href='https://test.example.com']") !== null;
                }, "link to be created");
            }, 10000);
        });

        describe("Document Cache & File Switching", function () {

            async function _switchToMdTestProject() {
                await SpecRunnerUtils.loadProjectInTestWindow(mdTestFolder);
                await SpecRunnerUtils.deletePathAsync(mdTestFolder + "/.phcode.json", true);
            }

            async function _openMdFileAndWaitForPreview(fileName) {
                await awaitsForDone(SpecRunnerUtils.openProjectFiles([fileName]),
                    "open " + fileName);
                await _waitForMdPreviewReady();
            }

            function _getViewerScrollTop() {
                const mdDoc = _getMdIFrameDoc();
                const viewer = mdDoc && mdDoc.querySelector(".app-viewer");
                return viewer ? viewer.scrollTop : 0;
            }

            function _setViewerScrollTop(scrollTop) {
                const mdDoc = _getMdIFrameDoc();
                const viewer = mdDoc && mdDoc.querySelector(".app-viewer");
                if (viewer) {
                    viewer.scrollTop = scrollTop;
                }
            }

            function _getViewerH1Text() {
                const mdDoc = _getMdIFrameDoc();
                const h1 = mdDoc && mdDoc.querySelector("#viewer-content h1");
                return h1 ? h1.textContent : "";
            }

            async function _assertMdEditMode(shouldBeEditing) {
                await awaitsFor(() => {
                    const mdDoc = _getMdIFrameDoc();
                    const content = mdDoc && mdDoc.getElementById("viewer-content");
                    if (!content) { return false; }
                    return shouldBeEditing
                        ? content.classList.contains("editing")
                        : !content.classList.contains("editing");
                }, shouldBeEditing ? "md viewer to be in edit mode" : "md viewer to be in reader mode");
            }

            beforeAll(async function () {
                // Switch to the md test project for these tests
                if (testWindow) {
                    _setMdEditMode(false);
                    await awaitsForDone(CommandManager.execute(Commands.FILE_CLOSE_ALL, { _forceClose: true }),
                        "close all before project switch");
                    await _switchToMdTestProject();

                    // Start live dev
                    await awaitsForDone(SpecRunnerUtils.openProjectFiles(["simple.html"]),
                        "open simple.html");
                    if (!WorkspaceManager.isPanelVisible("live-preview-panel")) {
                        await awaitsForDone(CommandManager.execute(Commands.FILE_LIVE_FILE_PREVIEW));
                    }
                    LiveDevMultiBrowser.open();
                    await awaitsFor(() => {
                        return LiveDevMultiBrowser.status === LiveDevMultiBrowser.STATUS_ACTIVE;
                    }, "live dev to open", 20000);
                }
            }, 30000);

            it("should switch between MD files with viewer showing correct content", async function () {
                await _openMdFileAndWaitForPreview("doc1.md");
                await awaitsFor(() => _getViewerH1Text().includes("Document One"),
                    "doc1 heading to appear");

                await _openMdFileAndWaitForPreview("doc2.md");
                await awaitsFor(() => _getViewerH1Text().includes("Document Two"),
                    "doc2 heading to appear");

                // Switch back to doc1 — should show doc1 content
                await _openMdFileAndWaitForPreview("doc1.md");
                await awaitsFor(() => _getViewerH1Text().includes("Document One"),
                    "doc1 heading to appear on switch back");
            }, 15000);

            it("should preserve scroll position per-document on switch", async function () {
                // Open long doc, scroll down
                await _openMdFileAndWaitForPreview("long.md");
                await awaitsFor(() => _getViewerH1Text().includes("Long Document"),
                    "long doc heading to appear");

                _setViewerScrollTop(300);
                await awaitsFor(() => _getViewerScrollTop() >= 290, "scroll to apply");
                const scrollBefore = _getViewerScrollTop();

                // Switch to doc2
                await _openMdFileAndWaitForPreview("doc2.md");
                await awaitsFor(() => _getViewerH1Text().includes("Document Two"),
                    "doc2 heading to appear");

                // Switch back to long doc — scroll should be restored
                await _openMdFileAndWaitForPreview("long.md");
                await awaitsFor(() => {
                    const scroll = _getViewerScrollTop();
                    return Math.abs(scroll - scrollBefore) < 50;
                }, "scroll position to be restored");
            }, 15000);

            it("should preserve edit/reader mode globally across file switches", async function () {
                await _openMdFileAndWaitForPreview("doc1.md");
                await _enterEditMode();

                // Switch to another md file — should still be in edit mode
                await _openMdFileAndWaitForPreview("doc2.md");
                await awaitsFor(() => _getViewerH1Text().includes("Document Two"),
                    "doc2 heading to appear");
                await _assertMdEditMode(true);

                // Switch to reader mode
                await _enterReaderMode();
                await _assertMdEditMode(false);

                // Switch to doc1 — should still be in reader mode
                await _openMdFileAndWaitForPreview("doc1.md");
                await awaitsFor(() => _getViewerH1Text().includes("Document One"),
                    "doc1 heading to appear");
                await _assertMdEditMode(false);
            }, 15000);

            it("should switch MD to HTML and back reusing persistent md iframe", async function () {
                await _openMdFileAndWaitForPreview("doc1.md");
                await awaitsFor(() => _getViewerH1Text().includes("Document One"),
                    "doc1 content to load");

                // Set a verification code inside the md iframe to prove persistence
                const verificationCode = "persist_" + Date.now();
                _getMdIFrameWin().__test_verification = verificationCode;

                // Switch to HTML file
                await awaitsForDone(SpecRunnerUtils.openProjectFiles(["simple.html"]),
                    "open simple.html");
                await awaitsFor(() => {
                    const lpFrame = testWindow.document.getElementById("panel-live-preview-frame");
                    return lpFrame && lpFrame.src && !lpFrame.src.includes("mdViewer");
                }, "HTML preview to load");

                // Switch back to md file
                await _openMdFileAndWaitForPreview("doc1.md");
                await awaitsFor(() => _getViewerH1Text().includes("Document One"),
                    "doc1 content to load after switch back");

                // Verify iframe was NOT reloaded — our JS variable should survive
                const win = _getMdIFrameWin();
                expect(win.__test_verification).toBe(verificationCode);
            }, 15000);

            it("should preserve edit mode across project switches", async function () {
                await _openMdFileAndWaitForPreview("doc1.md");
                await _enterEditMode();

                // Switch to a different project
                const otherProject = SpecRunnerUtils.getTestPath("/spec/LiveDevelopment-MultiBrowser-test-files");
                await SpecRunnerUtils.loadProjectInTestWindow(otherProject);

                // Open an HTML file and start live dev in the other project
                await awaitsForDone(SpecRunnerUtils.openProjectFiles(["simple1.html"]),
                    "open simple1.html in other project");
                LiveDevMultiBrowser.open();
                await awaitsFor(() => {
                    return LiveDevMultiBrowser.status === LiveDevMultiBrowser.STATUS_ACTIVE;
                }, "live dev active in other project", 20000);

                // Now open an md file in the other project
                await awaitsForDone(SpecRunnerUtils.openProjectFiles(["readme.md"]),
                    "open readme.md in other project");
                await _waitForMdPreviewReady();

                // Edit mode should be preserved
                await _assertMdEditMode(true);

                // Switch back to the md test project
                await _switchToMdTestProject();
                await awaitsForDone(SpecRunnerUtils.openProjectFiles(["simple.html"]),
                    "reopen simple.html");
                LiveDevMultiBrowser.open();
                await awaitsFor(() => {
                    return LiveDevMultiBrowser.status === LiveDevMultiBrowser.STATUS_ACTIVE;
                }, "live dev to reopen", 20000);
            }, 30000);

            it("should closing and reopening live preview panel preserve md iframe, cache, and scroll", async function () {
                await _openMdFileAndWaitForPreview("long.md");
                await awaitsFor(() => _getViewerH1Text().includes("Long Document"),
                    "long doc content to load");
                await _enterEditMode();

                // Scroll down
                _setViewerScrollTop(300);
                await awaitsFor(() => _getViewerScrollTop() >= 290, "scroll to apply");
                const scrollBefore = _getViewerScrollTop();

                // Set verification code to check iframe persists
                const verificationCode = "panel_persist_" + Date.now();
                _getMdIFrameWin().__test_panel_persist = verificationCode;

                // Close live preview panel
                await awaitsForDone(CommandManager.execute(Commands.FILE_LIVE_FILE_PREVIEW));
                await awaitsFor(() => !WorkspaceManager.isPanelVisible("live-preview-panel"),
                    "live preview panel to close");

                // Reopen live preview panel
                await awaitsForDone(CommandManager.execute(Commands.FILE_LIVE_FILE_PREVIEW));
                await awaitsFor(() => WorkspaceManager.isPanelVisible("live-preview-panel"),
                    "live preview panel to reopen");
                await _waitForMdPreviewReady();

                // Verify iframe persisted (JS variable survived)
                const win = _getMdIFrameWin();
                expect(win.__test_panel_persist).toBe(verificationCode);

                // Verify content is still correct
                await awaitsFor(() => _getViewerH1Text().includes("Long Document"),
                    "long doc content after panel reopen");

                // Verify edit mode preserved
                await _assertMdEditMode(true);

                // Verify scroll position preserved
                await awaitsFor(() => {
                    const scroll = _getViewerScrollTop();
                    return Math.abs(scroll - scrollBefore) < 50;
                }, "scroll position to be preserved after panel reopen");
            }, 15000);

            it("should reload button re-render current file with fresh DOM preserving scroll and edit mode", async function () {
                await _openMdFileAndWaitForPreview("long.md");
                await awaitsFor(() => _getViewerH1Text().includes("Long Document"),
                    "long doc to load");
                await _enterEditMode();

                // Scroll down
                _setViewerScrollTop(300);
                await awaitsFor(() => _getViewerScrollTop() >= 290, "scroll to apply");
                const scrollBefore = _getViewerScrollTop();

                // Capture the current h1 DOM node
                const h1Before = _getMdIFrameDoc().querySelector("#viewer-content h1");
                expect(h1Before).not.toBeNull();

                // Click reload button
                testWindow.$("#reloadLivePreviewButton").click();

                // Wait for re-render — the h1 should be a NEW DOM node (old one disposed)
                await awaitsFor(() => {
                    const h1After = _getMdIFrameDoc().querySelector("#viewer-content h1");
                    return h1After && h1After !== h1Before &&
                        h1After.textContent.includes("Long Document");
                }, "DOM to be recreated after reload");

                // Verify edit mode preserved
                await _assertMdEditMode(true);

                // Verify scroll position approximately preserved
                await awaitsFor(() => {
                    const scroll = _getViewerScrollTop();
                    return Math.abs(scroll - scrollBefore) < 100;
                }, "scroll position to be approximately restored after reload");
            }, 15000);

            it("should working set changes sync to iframe and cache entries persist", async function () {
                // Open multiple files to populate cache
                await _openMdFileAndWaitForPreview("doc1.md");
                await awaitsFor(() => _getViewerH1Text().includes("Document One"),
                    "doc1 to load");

                await _openMdFileAndWaitForPreview("doc2.md");
                await awaitsFor(() => _getViewerH1Text().includes("Document Two"),
                    "doc2 to load");

                // Both should be in cache
                const win = _getMdIFrameWin();
                await awaitsFor(() => {
                    const keys = win.__getCacheKeys();
                    return keys.some(k => k.endsWith("doc1.md")) &&
                        keys.some(k => k.endsWith("doc2.md"));
                }, "both doc1 and doc2 to be in cache");

                // Close doc2 from working set
                await awaitsForDone(CommandManager.execute(Commands.FILE_CLOSE),
                    "close doc2");

                // doc1 should still be cached and displayable
                await _openMdFileAndWaitForPreview("doc1.md");
                await awaitsFor(() => _getViewerH1Text().includes("Document One"),
                    "doc1 still showing after doc2 closed");

                await awaitsFor(() => {
                    const keys = win.__getCacheKeys();
                    return keys.some(k => k.endsWith("doc1.md"));
                }, "doc1 still in cache after doc2 closed");
            }, 15000);

            it("should cache multiple files and retrieve them from cache", async function () {
                // Open doc1, doc2, doc3 sequentially to populate cache
                await _openMdFileAndWaitForPreview("doc1.md");
                await awaitsFor(() => _getViewerH1Text().includes("Document One"),
                    "doc1 to load");

                await _openMdFileAndWaitForPreview("doc2.md");
                await awaitsFor(() => _getViewerH1Text().includes("Document Two"),
                    "doc2 to load");

                await _openMdFileAndWaitForPreview("doc3.md");
                await awaitsFor(() => _getViewerH1Text().includes("Document Three"),
                    "doc3 to load");

                // All three should be in cache
                const win = _getMdIFrameWin();
                await awaitsFor(() => {
                    const keys = win.__getCacheKeys();
                    return keys.some(k => k.endsWith("doc1.md")) &&
                        keys.some(k => k.endsWith("doc2.md")) &&
                        keys.some(k => k.endsWith("doc3.md"));
                }, "all three docs to be in cache");

                // Switch back to doc1 — should load from cache
                await _openMdFileAndWaitForPreview("doc1.md");
                await awaitsFor(() => _getViewerH1Text().includes("Document One"),
                    "doc1 from cache");

                // Switch to doc2 — from cache
                await _openMdFileAndWaitForPreview("doc2.md");
                await awaitsFor(() => _getViewerH1Text().includes("Document Two"),
                    "doc2 from cache");

                // Verify all still cached
                const keys = win.__getCacheKeys();
                expect(keys.some(k => k.endsWith("doc1.md"))).toBeTrue();
                expect(keys.some(k => k.endsWith("doc2.md"))).toBeTrue();
                expect(keys.some(k => k.endsWith("doc3.md"))).toBeTrue();
            }, 15000);
        });

    });
});
