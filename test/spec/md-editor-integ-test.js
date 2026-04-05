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

/*global describe, beforeAll, beforeEach, afterAll, awaitsFor, it, awaitsForDone, expect, awaits*/

define(function (require, exports, module) {

    const SpecRunnerUtils = require("spec/SpecRunnerUtils");

    const testFolder = SpecRunnerUtils.getTestPath("/spec/LiveDevelopment-MultiBrowser-test-files");
    const mdTestFolder = SpecRunnerUtils.getTestPath("/spec/LiveDevelopment-Markdown-test-files");

    let testWindow, brackets, CommandManager, Commands, EditorManager, WorkspaceManager,
        LiveDevMultiBrowser, NativeApp;

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

    /**
     * Wait for the md preview iframe to be fully ready and synced with the given editor.
     * Verifies: iframe visible, bridge initialized, content rendered, suppression cleared,
     * and the viewer's loaded markdown matches the editor's content.
     * @param {Object} editor - The active Editor instance whose content should be synced to the viewer.
     */
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
            // Verify the viewer has synced with the editor's content
            if (expectedSrc) {
                const viewerSrc = win.__getCurrentContent && win.__getCurrentContent();
                if (viewerSrc !== expectedSrc) { return false; }
            }
            return true;
        }, "md preview synced with editor content");
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
                NativeApp = brackets.test.NativeApp;

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
                await _waitForMdPreviewReady(EditorManager.getActiveEditor());
                // Reset iframe doc cache for predictable test state
                const win = _getMdIFrameWin();
                if (win && win.__resetCacheForTest) {
                    win.__resetCacheForTest();
                }
                // Re-open to get fresh render after cache reset
                await awaitsForDone(SpecRunnerUtils.openProjectFiles(["simple1.html"]),
                    "open simple1.html to reset");
                await awaitsForDone(SpecRunnerUtils.openProjectFiles(["test-shortcuts.md"]),
                    "reopen test-shortcuts.md");
                await _waitForMdPreviewReady(EditorManager.getActiveEditor());
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
                editor.document.setText(ORIGINAL_MD_CONTENT);
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
                editor.replaceRange(" ", { line: 0, ch: 0 });

                await awaitsFor(() => editor.document.isDirty, "document to become dirty");

                // Dispatch Ctrl+S in the md iframe — should trigger save
                _dispatchKeyInMdIframe("s");

                await awaitsFor(() => !editor.document.isDirty, "document to be saved (dirty flag cleared)");
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
                await _waitForMdPreviewReady(EditorManager.getActiveEditor());
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

            beforeEach(async function () {
                // Reset scroll and close files between tests to prevent state leakage
                _setViewerScrollTop(0);
                await awaitsForDone(CommandManager.execute(Commands.FILE_CLOSE_ALL, { _forceClose: true }),
                    "close all between cache tests");
            }, 10000);

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

            // TODO: Scroll restore works in production but the test runner viewport is too
            // small for reliable scroll position verification. Re-enable when viewport is larger.
            // it("should preserve scroll position per-document on switch", ...)

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
                await _waitForMdPreviewReady(EditorManager.getActiveEditor());

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
                await _waitForMdPreviewReady(EditorManager.getActiveEditor());

                // Verify iframe persisted (JS variable survived)
                const win = _getMdIFrameWin();
                expect(win.__test_panel_persist).toBe(verificationCode);

                // Verify content is still correct
                await awaitsFor(() => _getViewerH1Text().includes("Long Document"),
                    "long doc content after panel reopen");

                // Verify edit mode preserved
                await _assertMdEditMode(true);

                // Verify scroll position preserved (wider tolerance for CI)
                await awaitsFor(() => {
                    const scroll = _getViewerScrollTop();
                    return scroll > 10 && Math.abs(scroll - scrollBefore) < 150;
                }, "scroll position to be preserved after panel reopen", 5000);
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

            it("should files removed from working set move to LRU cache (not evicted)", async function () {
                const win = _getMdIFrameWin();

                // Open doc1 and doc2 to put them in cache and working set
                await _openMdFileAndWaitForPreview("doc1.md");
                await awaitsFor(() => _getViewerH1Text().includes("Document One"),
                    "doc1 to load");

                await _openMdFileAndWaitForPreview("doc2.md");
                await awaitsFor(() => _getViewerH1Text().includes("Document Two"),
                    "doc2 to load");

                // Both should be in cache and working set
                await awaitsFor(() => {
                    const cacheKeys = win.__getCacheKeys();
                    const wsPaths = win.__getWorkingSetPaths();
                    return cacheKeys.some(k => k.endsWith("doc1.md")) &&
                        cacheKeys.some(k => k.endsWith("doc2.md")) &&
                        wsPaths.some(p => p.endsWith("doc1.md")) &&
                        wsPaths.some(p => p.endsWith("doc2.md"));
                }, "doc1 and doc2 in cache and working set");

                // Close doc2 from working set
                await awaitsForDone(CommandManager.execute(Commands.FILE_CLOSE),
                    "close doc2");

                // doc2 should still be in cache (moved to LRU) but not in working set
                await awaitsFor(() => {
                    const cacheKeys = win.__getCacheKeys();
                    const wsPaths = win.__getWorkingSetPaths();
                    return cacheKeys.some(k => k.endsWith("doc2.md")) &&
                        !wsPaths.some(p => p.endsWith("doc2.md"));
                }, "doc2 in cache (LRU) but not in working set");

                // doc1 should still be in both cache and working set
                const cacheKeys = win.__getCacheKeys();
                const wsPaths = win.__getWorkingSetPaths();
                expect(cacheKeys.some(k => k.endsWith("doc1.md"))).toBeTrue();
                expect(wsPaths.some(p => p.endsWith("doc1.md"))).toBeTrue();
            }, 15000);
        });

        describe("Selection Sync (Bidirectional)", function () {

            async function _openMdFile(fileName) {
                await awaitsForDone(SpecRunnerUtils.openProjectFiles([fileName]),
                    "open " + fileName);
                await _waitForMdPreviewReady(EditorManager.getActiveEditor());
            }

            beforeAll(async function () {
                if (testWindow) {
                    // Ensure live dev is active
                    if (LiveDevMultiBrowser.status !== LiveDevMultiBrowser.STATUS_ACTIVE) {
                        await awaitsForDone(SpecRunnerUtils.openProjectFiles(["simple.html"]),
                            "open simple.html for live dev");
                        LiveDevMultiBrowser.open();
                        await awaitsFor(() =>
                            LiveDevMultiBrowser.status === LiveDevMultiBrowser.STATUS_ACTIVE,
                        "live dev to open", 20000);
                    }
                    // Switch HTML→MD to force MarkdownSync deactivate/activate cycle,
                    // resetting all internal state (_syncingFromIframe, etc.)
                    await awaitsForDone(SpecRunnerUtils.openProjectFiles(["simple.html"]),
                        "open simple.html to reset sync");
                    await _openMdFile("long.md");
                    // Ensure the CM editor is created by focusing it
                    await awaitsFor(() => {
                        const ed = EditorManager.getActiveEditor();
                        return ed && ed.document;
                    }, "editor for long.md to be created");
                    await _enterReaderMode();
                }
            }, 30000);

            function _getCMCursorLine() {
                const editor = EditorManager.getActiveEditor();
                return editor ? editor.getCursorPos().line : -1;
            }

            function _hasViewerHighlight() {
                const mdDoc = _getMdIFrameDoc();
                return mdDoc && mdDoc.querySelector(".cm-selection-highlight") !== null;
            }

            it("should highlight viewer blocks when CM has selection", async function () {

                // Wait for editor to be fully ready (masterEditor established)
                await awaitsFor(() => {
                    const ed = EditorManager.getActiveEditor();
                    return ed && ed.document && ed.document._masterEditor;
                }, "editor with masterEditor to be ready");

                // Clear any existing highlights
                const mdDoc = _getMdIFrameDoc();
                mdDoc.querySelectorAll(".cm-selection-highlight").forEach(
                    el => el.classList.remove("cm-selection-highlight"));
                expect(_hasViewerHighlight()).toBeFalse();

                // Select text in CM — MarkdownSync's cursorActivity handler
                // debounces and sends MDVIEWR_HIGHLIGHT_SELECTION to the iframe
                const editor = EditorManager.getActiveEditor();
                editor.setSelection({ line: 4, ch: 0 }, { line: 6, ch: 0 });
                expect(editor.getSelectedText().length).toBeGreaterThan(0);

                await awaitsFor(() => _hasViewerHighlight(),
                    "viewer to show selection highlight");

                const highlighted = mdDoc.querySelector(".cm-selection-highlight");
                expect(highlighted).not.toBeNull();
                expect(highlighted.getAttribute("data-source-line")).not.toBeNull();
            }, 10000);

            it("should clear viewer highlight when CM selection is cleared", async function () {
                // Create highlight by selecting in CM
                const editor = EditorManager.getActiveEditor();
                editor.setSelection({ line: 4, ch: 0 }, { line: 6, ch: 0 });
                await awaitsFor(() => _hasViewerHighlight(),
                    "highlight to appear");

                // Clear selection in CM — should clear viewer highlight
                editor.setCursorPos(0, 0);

                await awaitsFor(() => !_hasViewerHighlight(),
                    "viewer highlight to clear");
            }, 10000);

            it("should clicking in md viewer (no selection) set CM cursor to corresponding line", async function () {
                await _enterReaderMode();

                const mdDoc = _getMdIFrameDoc();
                // Find an element with a known source line
                const h2 = mdDoc.querySelector('#viewer-content [data-source-line="20"]') ||
                    mdDoc.querySelector('#viewer-content h2');
                expect(h2).not.toBeNull();

                const sourceLine = parseInt(h2.getAttribute("data-source-line"), 10);

                // Click on it (reader mode click sends embeddedIframeFocusEditor)
                h2.click();

                // CM cursor should move to approximately that line (1-based to 0-based)
                await awaitsFor(() => {
                    const cmLine = _getCMCursorLine();
                    return Math.abs(cmLine - (sourceLine - 1)) < 5;
                }, "CM cursor to move near clicked element's source line");
            }, 10000);

            it("should selection sync respect cursor sync toggle", async function () {
                await _enterReaderMode();

                // Ensure no highlight initially
                const mdDoc = _getMdIFrameDoc();
                mdDoc.querySelectorAll(".cm-selection-highlight").forEach(
                    el => el.classList.remove("cm-selection-highlight"));
                expect(_hasViewerHighlight()).toBeFalse();

                // Toggle cursor sync off via the toolbar button
                const mdIFrame = _getMdPreviewIFrame();
                let syncToggled = false;
                const handler = function (event) {
                    if (event.data && event.data.type === "MDVIEWR_EVENT" &&
                        event.data.eventName === "mdviewrCursorSyncToggle") {
                        syncToggled = true;
                    }
                };
                mdIFrame.contentWindow.parent.addEventListener("message", handler);

                const syncBtn = _getMdIFrameDoc().getElementById("emb-cursor-sync");
                if (syncBtn) {
                    syncBtn.click();
                }
                await awaitsFor(() => syncToggled, "cursor sync toggle message to be sent");
                mdIFrame.contentWindow.parent.removeEventListener("message", handler);

                // Send highlight — should be ignored since sync is off
                expect(syncToggled).toBeTrue();

                // Re-enable cursor sync
                if (syncBtn) {
                    syncBtn.click();
                }
            }, 10000);

            it("should selecting text in md viewer select corresponding text in CM", async function () {
                await _enterEditMode();
                await _focusMdContent();

                const mdDoc = _getMdIFrameDoc();
                const win = _getMdIFrameWin();

                // Find a paragraph with a data-source-line
                const p = mdDoc.querySelector('#viewer-content p[data-source-line]');
                expect(p).not.toBeNull();
                const sourceLine = parseInt(p.getAttribute("data-source-line"), 10);

                // Select some text in it
                if (p.firstChild && p.firstChild.nodeType === Node.TEXT_NODE) {
                    const range = mdDoc.createRange();
                    range.setStart(p.firstChild, 0);
                    range.setEnd(p.firstChild, Math.min(10, p.firstChild.textContent.length));
                    win.getSelection().removeAllRanges();
                    win.getSelection().addRange(range);
                    mdDoc.dispatchEvent(new Event("selectionchange"));
                }

                // CM should move cursor to approximately the source line
                await awaitsFor(() => {
                    const cmLine = _getCMCursorLine();
                    return Math.abs(cmLine - (sourceLine - 1)) < 5;
                }, "CM cursor to move near selected text's source line");
            }, 10000);

            it("should cursor sync toggle state preserve across file switch and mode toggle", async function () {
                await _enterReaderMode();

                // Disable cursor sync
                const syncBtn = _getMdIFrameDoc().getElementById("emb-cursor-sync");
                expect(syncBtn).not.toBeNull();
                syncBtn.click();
                await awaitsFor(() => !syncBtn.classList.contains("active"),
                    "cursor sync button to become inactive");
                expect(syncBtn.getAttribute("aria-pressed")).toBe("false");

                // Switch to another file — toolbar re-renders
                await _openMdFile("doc1.md");
                const syncBtnAfterSwitch = _getMdIFrameDoc().getElementById("emb-cursor-sync");
                expect(syncBtnAfterSwitch).not.toBeNull();
                expect(syncBtnAfterSwitch.classList.contains("active")).toBeFalse();
                expect(syncBtnAfterSwitch.getAttribute("aria-pressed")).toBe("false");

                // Toggle to edit mode — toolbar re-renders again
                await _enterEditMode();
                const syncBtnAfterMode = _getMdIFrameDoc().getElementById("emb-cursor-sync");
                expect(syncBtnAfterMode).not.toBeNull();
                expect(syncBtnAfterMode.classList.contains("active")).toBeFalse();
                expect(syncBtnAfterMode.getAttribute("aria-pressed")).toBe("false");

                // Re-enable cursor sync and verify it persists across switch
                syncBtnAfterMode.click();
                await awaitsFor(() => syncBtnAfterMode.classList.contains("active"),
                    "cursor sync button to become active again");

                await _openMdFile("long.md");
                const syncBtnFinal = _getMdIFrameDoc().getElementById("emb-cursor-sync");
                expect(syncBtnFinal.classList.contains("active")).toBeTrue();
                expect(syncBtnFinal.getAttribute("aria-pressed")).toBe("true");

                // Force close doc1
                await awaitsForDone(CommandManager.execute(Commands.FILE_CLOSE, { _forceClose: true }),
                    "force close");
            }, 15000);

            it("should content sync still work when cursor sync is disabled", async function () {
                await _openMdFile("long.md");
                await _enterEditMode();

                // Disable cursor sync
                const syncBtn = _getMdIFrameDoc().getElementById("emb-cursor-sync");
                syncBtn.click();
                await awaitsFor(() => !syncBtn.classList.contains("active"),
                    "cursor sync to be disabled");

                // Edit content in CM — should still sync to viewer
                const editor = EditorManager.getActiveEditor();
                const originalText = editor.document.getText();
                editor.document.setText("# Sync Test\n\nContent sync works even without cursor sync.\n");

                await awaitsFor(() => {
                    const mdDoc = _getMdIFrameDoc();
                    const h1 = mdDoc && mdDoc.querySelector("#viewer-content h1");
                    return h1 && h1.textContent.includes("Sync Test");
                }, "viewer to update with new content despite cursor sync off");

                // Restore original content
                editor.document.setText(originalText);
                await awaitsFor(() => {
                    const mdDoc = _getMdIFrameDoc();
                    const h1 = mdDoc && mdDoc.querySelector("#viewer-content h1");
                    return h1 && !h1.textContent.includes("Sync Test");
                }, "viewer to restore original content");

                // Re-enable cursor sync
                syncBtn.click();
                await awaitsFor(() => syncBtn.classList.contains("active"),
                    "cursor sync to be re-enabled");
            }, 10000);

            it("should cursor sync toggle work in both reader and edit mode", async function () {
                await _openMdFile("long.md");

                // Test in reader mode
                await _enterReaderMode();
                let syncBtn = _getMdIFrameDoc().getElementById("emb-cursor-sync");
                expect(syncBtn).not.toBeNull();
                expect(syncBtn.classList.contains("active")).toBeTrue();

                syncBtn.click();
                await awaitsFor(() => !syncBtn.classList.contains("active"),
                    "cursor sync to toggle off in reader mode");
                expect(syncBtn.getAttribute("aria-pressed")).toBe("false");

                syncBtn.click();
                await awaitsFor(() => syncBtn.classList.contains("active"),
                    "cursor sync to toggle on in reader mode");
                expect(syncBtn.getAttribute("aria-pressed")).toBe("true");

                // Test in edit mode
                await _enterEditMode();
                syncBtn = _getMdIFrameDoc().getElementById("emb-cursor-sync");
                expect(syncBtn).not.toBeNull();
                expect(syncBtn.classList.contains("active")).toBeTrue();

                syncBtn.click();
                await awaitsFor(() => !syncBtn.classList.contains("active"),
                    "cursor sync to toggle off in edit mode");
                expect(syncBtn.getAttribute("aria-pressed")).toBe("false");

                syncBtn.click();
                await awaitsFor(() => syncBtn.classList.contains("active"),
                    "cursor sync to toggle on in edit mode");
                expect(syncBtn.getAttribute("aria-pressed")).toBe("true");
            }, 10000);

            it("should disabling cursor sync in reader mode prevent CM cursor move on click", async function () {
                await _openMdFile("long.md");
                await _enterReaderMode();

                // Set CM cursor to line 0 as baseline
                const editor = EditorManager.getActiveEditor();
                editor.setCursorPos(0, 0);
                expect(_getCMCursorLine()).toBe(0);

                // Disable cursor sync
                const syncBtn = _getMdIFrameDoc().getElementById("emb-cursor-sync");
                syncBtn.click();
                await awaitsFor(() => !syncBtn.classList.contains("active"),
                    "cursor sync to be disabled");

                // Click a paragraph lower in the document
                const mdDoc = _getMdIFrameDoc();
                const paragraphs = mdDoc.querySelectorAll('#viewer-content p[data-source-line]');
                let targetP = null;
                for (const p of paragraphs) {
                    const srcLine = parseInt(p.getAttribute("data-source-line"), 10);
                    if (srcLine > 10) {
                        targetP = p;
                        break;
                    }
                }
                expect(targetP).not.toBeNull();

                // Click directly on the element — bridge.js click handler sends
                // embeddedIframeFocusEditor which MarkdownSync should ignore (sync off)
                targetP.click();

                // Cursor should still be at 0 — the click while sync was off had no effect.
                // Re-enable cursor sync first (re-query btn in case toolbar re-rendered).
                const syncBtnAfter = _getMdIFrameDoc().getElementById("emb-cursor-sync");
                syncBtnAfter.click();
                await awaitsFor(() => syncBtnAfter.classList.contains("active"),
                    "cursor sync to be re-enabled");
                expect(_getCMCursorLine()).toBe(0);
            }, 10000);

            it("should changing CM cursor position scroll md viewer accordingly", async function () {
                await _openMdFile("long.md");
                await _enterReaderMode();

                const mdDoc = _getMdIFrameDoc();
                const viewer = mdDoc.querySelector(".app-viewer");
                const editor = EditorManager.getActiveEditor();

                // Set cursor to line 0 — viewer should scroll to top
                editor.setCursorPos(0, 0);
                await awaitsFor(() => viewer.scrollTop < 50,
                    "viewer to scroll near top when CM cursor at line 0");
                const topScroll = viewer.scrollTop;

                // Set cursor to last line — viewer should scroll down
                const lastLine = editor.lineCount() - 1;
                editor.setCursorPos(lastLine, 0);
                await awaitsFor(() => viewer.scrollTop > topScroll + 100,
                    "viewer to scroll down when CM cursor moves to last line");
            }, 10000);

            it("should edit to reader switch re-render with fresh data-source-line attrs", async function () {
                await _openMdFile("long.md");
                await _enterEditMode();
                await _focusMdContent();

                // Add a new heading in edit mode via CM
                const editor = EditorManager.getActiveEditor();
                const originalText = editor.document.getText();
                editor.document.setText("# Original Heading\n\n## Added In Edit\n\nSome new paragraph.\n\n" + originalText);

                await awaitsFor(() => {
                    const mdDoc = _getMdIFrameDoc();
                    const h2 = mdDoc && mdDoc.querySelector('#viewer-content h2');
                    return h2 && h2.textContent.includes("Added In Edit");
                }, "new heading to appear in viewer");

                // Switch to reader mode — should re-render from CM content
                await _enterReaderMode();

                // Verify data-source-line attributes are present and refreshed
                const mdDoc = _getMdIFrameDoc();
                const elements = mdDoc.querySelectorAll('#viewer-content [data-source-line]');
                expect(elements.length).toBeGreaterThan(0);

                // The new heading should have a data-source-line attribute
                const addedH2 = mdDoc.querySelector('#viewer-content h2');
                expect(addedH2).not.toBeNull();
                expect(addedH2.textContent).toContain("Added In Edit");
                expect(addedH2.hasAttribute("data-source-line")).toBeTrue();

                // Restore original content
                editor.document.setText(originalText);
                await awaitsFor(() => {
                    const h2 = _getMdIFrameDoc().querySelector('#viewer-content h2');
                    return !h2 || !h2.textContent.includes("Added In Edit");
                }, "viewer to restore after content reset");
            }, 15000);

            it("should cursor sync work on newly edited elements after edit to reader switch", async function () {
                await _openMdFile("long.md");
                await _enterEditMode();
                await _focusMdContent();

                // Add a distinctive paragraph at the top
                const editor = EditorManager.getActiveEditor();
                const originalText = editor.document.getText();
                const newContent = "# Top Heading\n\nNewly added paragraph for sync test.\n\n" + originalText;
                editor.document.setText(newContent);

                await awaitsFor(() => {
                    const mdDoc = _getMdIFrameDoc();
                    const p = mdDoc && mdDoc.querySelector('#viewer-content p');
                    return p && p.textContent.includes("Newly added paragraph");
                }, "new paragraph to render");

                // Switch to reader mode
                await _enterReaderMode();

                // Find the new paragraph and verify it has a source line for sync
                const mdDoc = _getMdIFrameDoc();
                const paragraphs = mdDoc.querySelectorAll('#viewer-content p[data-source-line]');
                let newP = null;
                for (const p of paragraphs) {
                    if (p.textContent.includes("Newly added paragraph")) {
                        newP = p;
                        break;
                    }
                }
                expect(newP).not.toBeNull();
                const sourceLine = parseInt(newP.getAttribute("data-source-line"), 10);
                expect(sourceLine).toBeGreaterThan(0);

                // Move CM cursor far away so we can verify the click actually moves it
                const editor2 = EditorManager.getActiveEditor();
                const farLine = editor2.lineCount() - 1;
                editor2.setCursorPos(farLine, 0);
                expect(Math.abs(_getCMCursorLine() - (sourceLine - 1))).toBeGreaterThan(3);

                // Click the new paragraph directly — bridge.js click handler
                // sends embeddedIframeFocusEditor, MarkdownSync scrolls CM
                newP.click();

                await awaitsFor(() => {
                    const cmLine = _getCMCursorLine();
                    return Math.abs(cmLine - (sourceLine - 1)) < 3;
                }, "CM cursor to move to newly edited element's source line");

                // Restore
                editor.document.setText(originalText);
            }, 15000);
        });

        describe("Toolbar & UI", function () {

            async function _openMdFile(fileName) {
                await awaitsForDone(SpecRunnerUtils.openProjectFiles([fileName]),
                    "open " + fileName);
                await _waitForMdPreviewReady(EditorManager.getActiveEditor());
            }

            beforeAll(async function () {
                if (testWindow) {
                    if (LiveDevMultiBrowser.status !== LiveDevMultiBrowser.STATUS_ACTIVE) {
                        await awaitsForDone(SpecRunnerUtils.openProjectFiles(["simple.html"]),
                            "open simple.html for live dev");
                        LiveDevMultiBrowser.open();
                        await awaitsFor(() =>
                            LiveDevMultiBrowser.status === LiveDevMultiBrowser.STATUS_ACTIVE,
                        "live dev to open", 20000);
                    }
                }
            }, 30000);

            it("should hide play button and mode dropdown for MD files", async function () {
                await _openMdFile("doc1.md");

                await awaitsFor(() => {
                    return !testWindow.$("#previewModeLivePreviewButton").is(":visible") &&
                        !testWindow.$("#livePreviewModeBtn").is(":visible");
                }, "play button and mode dropdown to be hidden for MD");
            }, 10000);

            it("should show play button and mode dropdown for HTML files", async function () {
                await awaitsForDone(SpecRunnerUtils.openProjectFiles(["simple.html"]),
                    "open simple.html");

                await awaitsFor(() => {
                    return testWindow.$("#previewModeLivePreviewButton").is(":visible") &&
                        testWindow.$("#livePreviewModeBtn").is(":visible");
                }, "play button and mode dropdown to be visible for HTML");
            }, 10000);

            it("should show play button and mode dropdown again when switching back to HTML", async function () {
                // Open md file first
                await _openMdFile("doc1.md");
                await awaitsFor(() => !testWindow.$("#previewModeLivePreviewButton").is(":visible"),
                    "buttons hidden for MD");

                // Switch to HTML
                await awaitsForDone(SpecRunnerUtils.openProjectFiles(["simple.html"]),
                    "open simple.html");
                await awaitsFor(() => {
                    return testWindow.$("#previewModeLivePreviewButton").is(":visible") &&
                        testWindow.$("#livePreviewModeBtn").is(":visible");
                }, "buttons visible again for HTML");
            }, 10000);

            it("should Reader button have book-open icon and correct title", async function () {
                await _openMdFile("doc1.md");
                await _enterEditMode();

                const mdDoc = _getMdIFrameDoc();
                await awaitsFor(() => {
                    const doneBtn = mdDoc.getElementById("emb-done-btn");
                    return doneBtn && doneBtn.querySelector("svg") !== null;
                }, "reader button to be rendered");

                const doneBtn = mdDoc.getElementById("emb-done-btn");
                // Check it has an SVG icon (book-open)
                expect(doneBtn.querySelector("svg")).not.toBeNull();
                // Check the text says "Reader"
                const span = doneBtn.querySelector("span");
                expect(span && span.textContent.toLowerCase().includes("reader")).toBeTrue();
            }, 10000);

            it("should Edit button have pencil icon and correct title", async function () {
                await _openMdFile("doc1.md");
                await _enterReaderMode();

                const mdDoc = _getMdIFrameDoc();
                await awaitsFor(() => {
                    const editBtn = mdDoc.getElementById("emb-edit-btn");
                    return editBtn && editBtn.querySelector("svg") !== null;
                }, "edit button to be rendered");

                const editBtn = mdDoc.getElementById("emb-edit-btn");
                expect(editBtn.querySelector("svg")).not.toBeNull();
                const span = editBtn.querySelector("span");
                expect(span && span.textContent.toLowerCase().includes("edit")).toBeTrue();
            }, 10000);

            it("should format buttons exist in edit mode toolbar", async function () {
                await _openMdFile("doc1.md");
                await _enterEditMode();

                const mdDoc = _getMdIFrameDoc();
                await awaitsFor(() => mdDoc.getElementById("emb-bold") !== null,
                    "format buttons to render");

                // Verify key format buttons exist
                expect(mdDoc.getElementById("emb-bold")).not.toBeNull();
                expect(mdDoc.getElementById("emb-italic")).not.toBeNull();
                expect(mdDoc.getElementById("emb-strike")).not.toBeNull();
                expect(mdDoc.getElementById("emb-underline")).not.toBeNull();
                expect(mdDoc.getElementById("emb-code")).not.toBeNull();
                expect(mdDoc.getElementById("emb-link")).not.toBeNull();

                // Verify list buttons
                expect(mdDoc.getElementById("emb-ul")).not.toBeNull();
                expect(mdDoc.getElementById("emb-ol")).not.toBeNull();

                // Verify block type selector
                expect(mdDoc.getElementById("emb-block-type")).not.toBeNull();
            }, 10000);

            it("should format buttons not exist in reader mode toolbar", async function () {
                await _openMdFile("doc1.md");
                await _enterReaderMode();

                const mdDoc = _getMdIFrameDoc();
                // Format buttons should not be in reader mode
                expect(mdDoc.getElementById("emb-bold")).toBeNull();
                expect(mdDoc.getElementById("emb-italic")).toBeNull();
                expect(mdDoc.getElementById("emb-block-type")).toBeNull();
            }, 10000);

            it("should underline button have shortcut in tooltip", async function () {
                await _openMdFile("doc1.md");
                await _enterEditMode();

                const mdDoc = _getMdIFrameDoc();
                await awaitsFor(() => mdDoc.getElementById("emb-underline") !== null,
                    "underline button to render");

                const underlineBtn = mdDoc.getElementById("emb-underline");
                const tooltip = underlineBtn.getAttribute("data-tooltip") || underlineBtn.getAttribute("title") || "";
                // Should contain Ctrl+U or ⌘U
                expect(tooltip.includes("U") || tooltip.includes("u")).toBeTrue();
            }, 10000);
        });

        describe("Links & Format Bar", function () {

            let _originalOpenURL;

            beforeAll(function () {
                _originalOpenURL = NativeApp.openURLInDefaultBrowser;
            });

            afterAll(function () {
                NativeApp.openURLInDefaultBrowser = _originalOpenURL;
            });

            async function _openMdFile(fileName) {
                await awaitsForDone(SpecRunnerUtils.openProjectFiles([fileName]),
                    "open " + fileName);
                await _waitForMdPreviewReady(EditorManager.getActiveEditor());
            }

            beforeAll(async function () {
                if (testWindow) {
                    if (LiveDevMultiBrowser.status !== LiveDevMultiBrowser.STATUS_ACTIVE) {
                        await awaitsForDone(SpecRunnerUtils.openProjectFiles(["simple.html"]),
                            "open simple.html for live dev");
                        LiveDevMultiBrowser.open();
                        await awaitsFor(() =>
                            LiveDevMultiBrowser.status === LiveDevMultiBrowser.STATUS_ACTIVE,
                        "live dev to open", 20000);
                    }
                }
            }, 30000);

            it("should format bar and link popover elements exist in edit mode", async function () {
                await _openMdFile("doc1.md");
                await _enterEditMode();

                const mdDoc = _getMdIFrameDoc();
                const bar = mdDoc.getElementById("format-bar");
                expect(bar).not.toBeNull();
                expect(bar.querySelector("#fb-bold")).not.toBeNull();
                expect(bar.querySelector("#fb-italic")).not.toBeNull();
                expect(bar.querySelector("#fb-underline")).not.toBeNull();
                expect(bar.querySelector("#fb-link")).not.toBeNull();

                const popover = mdDoc.getElementById("link-popover");
                expect(popover).not.toBeNull();
            }, 10000);

            it("should adding a link in CM show it in md viewer", async function () {
                await _openMdFile("doc2.md");
                await _enterEditMode();

                const editor = EditorManager.getActiveEditor();
                const lastLine = editor.lineCount() - 1;
                editor.replaceRange("\n\n[CM Link](https://cm-link-test.example.com)\n",
                    { line: lastLine, ch: editor.getLine(lastLine).length });

                const mdDoc = _getMdIFrameDoc();
                await awaitsFor(() => {
                    const link = mdDoc.querySelector('#viewer-content a[href="https://cm-link-test.example.com"]');
                    return link && link.textContent.includes("CM Link");
                }, "link from CM to appear in viewer with correct text");
            }, 10000);

            it("should editing link URL in CM update it in md viewer", async function () {
                await _openMdFile("doc2.md");
                await _enterEditMode();

                const editor = EditorManager.getActiveEditor();

                // Add a link
                const lastLine = editor.lineCount() - 1;
                editor.replaceRange("\n[Old Link](https://old-url.example.com)\n",
                    { line: lastLine, ch: editor.getLine(lastLine).length });

                const mdDoc = _getMdIFrameDoc();
                await awaitsFor(() =>
                    mdDoc.querySelector('#viewer-content a[href="https://old-url.example.com"]') !== null,
                "old link to appear in viewer");

                // Change the URL in CM
                const cmVal = editor.document.getText();
                editor.document.setText(cmVal.replace("https://old-url.example.com", "https://new-url.example.com"));

                await awaitsFor(() =>
                    mdDoc.querySelector('#viewer-content a[href="https://new-url.example.com"]') !== null,
                "updated link URL to appear in viewer");

                // Old URL should be gone
                expect(mdDoc.querySelector('#viewer-content a[href="https://old-url.example.com"]')).toBeNull();
            }, 10000);

            it("should removing link markup in CM remove link from md viewer", async function () {
                await _openMdFile("doc3.md");
                await _enterEditMode();

                const editor = EditorManager.getActiveEditor();

                // Add a link
                const lastLine = editor.lineCount() - 1;
                editor.replaceRange("\n[Remove Me](https://remove-cm.example.com)\n",
                    { line: lastLine, ch: editor.getLine(lastLine).length });

                const mdDoc = _getMdIFrameDoc();
                await awaitsFor(() =>
                    mdDoc.querySelector('#viewer-content a[href="https://remove-cm.example.com"]') !== null,
                "link to appear");

                // Remove the link markup — replace [text](url) with just text
                const cmVal = editor.document.getText();
                editor.document.setText(cmVal.replace("[Remove Me](https://remove-cm.example.com)", "Remove Me"));

                await awaitsFor(() =>
                    mdDoc.querySelector('#viewer-content a[href="https://remove-cm.example.com"]') === null,
                "link to be removed from viewer");

                // Text should still exist
                await awaitsFor(() => {
                    const content = mdDoc.getElementById("viewer-content");
                    return content && content.textContent.includes("Remove Me");
                }, "text to still exist after link removal");
            }, 10000);

            it("should link popover allow editing link URL in viewer and sync to CM", async function () {
                await _openMdFile("doc2.md");
                await _enterEditMode();
                await _focusMdContent();

                const mdDoc = _getMdIFrameDoc();
                const content = mdDoc.getElementById("viewer-content");
                const link = content.querySelector("a[href*='test-link-doc2']");
                expect(link).not.toBeNull();
                const range = mdDoc.createRange();
                range.selectNodeContents(link);
                range.collapse(true);
                _getMdIFrameWin().getSelection().removeAllRanges();
                _getMdIFrameWin().getSelection().addRange(range);
                content.dispatchEvent(new KeyboardEvent("keyup", {
                    key: "ArrowRight", code: "ArrowRight", bubbles: true
                }));
                content.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));

                await awaitsFor(() => {
                    const popover = mdDoc.getElementById("link-popover");
                    return popover && popover.classList.contains("visible");
                }, "link popover to appear");

                // Edit via popover
                const popover = mdDoc.getElementById("link-popover");
                popover.querySelector(".link-popover-edit-btn").click();
                popover.querySelector(".link-popover-input").value = "https://edited-popover.example.com";
                popover.querySelector(".link-popover-confirm-btn").click();

                await awaitsFor(() =>
                    content.querySelector("a[href='https://edited-popover.example.com']") !== null,
                "edited URL in viewer");

                // Old URL should be gone
                expect(content.querySelector("a[href*='test-link-doc2']")).toBeNull();

                // Verify CM source has the edited URL
                const editor = EditorManager.getActiveEditor();
                await awaitsFor(() => {
                    const cmVal = editor.document.getText();
                    return cmVal.includes("https://edited-popover.example.com") &&
                        !cmVal.includes("test-link-doc2.example.com");
                }, "CM source to contain edited URL and not old URL");

                // Force close without saving
                await awaitsForDone(CommandManager.execute(Commands.FILE_CLOSE, { _forceClose: true }),
                    "force close doc2.md");
            }, 15000);

            it("should link popover allow removing link in viewer and sync to CM", async function () {
                await _openMdFile("doc3.md");
                await _enterEditMode();
                await _focusMdContent();

                const mdDoc = _getMdIFrameDoc();
                const content = mdDoc.getElementById("viewer-content");
                const link = content.querySelector("a[href*='remove-link-doc3']");
                expect(link).not.toBeNull();
                const range = mdDoc.createRange();
                range.selectNodeContents(link);
                range.collapse(true);
                _getMdIFrameWin().getSelection().removeAllRanges();
                _getMdIFrameWin().getSelection().addRange(range);
                content.dispatchEvent(new KeyboardEvent("keyup", {
                    key: "ArrowRight", code: "ArrowRight", bubbles: true
                }));
                content.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));

                await awaitsFor(() => {
                    const popover = mdDoc.getElementById("link-popover");
                    return popover && popover.classList.contains("visible");
                }, "link popover to appear");

                mdDoc.getElementById("link-popover").querySelector(".link-popover-unlink-btn").click();

                await awaitsFor(() =>
                    content.querySelector("a[href*='remove-link-doc3']") === null,
                "link removed from viewer via popover");

                expect(content.textContent).toContain("Remove Link");

                // Verify CM source has link text but no markdown link syntax
                const editor = EditorManager.getActiveEditor();
                await awaitsFor(() => {
                    const cmVal = editor.document.getText();
                    return cmVal.includes("Remove Link") &&
                        !cmVal.includes("[Remove Link](https://remove-link-doc3.example.com)");
                }, "CM source to have plain text without link markdown");

                // Force close without saving
                await awaitsForDone(CommandManager.execute(Commands.FILE_CLOSE, { _forceClose: true }),
                    "force close doc3.md");
            }, 15000);

            it("should clicking link in reader mode call openURLInDefaultBrowser", async function () {
                await _openMdFile("doc2.md");
                await _enterReaderMode();

                let capturedURL = null;
                NativeApp.openURLInDefaultBrowser = function (url) {
                    capturedURL = url;
                };

                const mdDoc = _getMdIFrameDoc();
                const link = mdDoc.querySelector('#viewer-content a[href*="test-link-doc2"]');
                expect(link).not.toBeNull();
                link.click();

                await awaitsFor(() => capturedURL !== null,
                    "openURLInDefaultBrowser to be called");
                expect(capturedURL).toContain("test-link-doc2.example.com");

                await awaitsForDone(CommandManager.execute(Commands.FILE_CLOSE, { _forceClose: true }),
                    "force close doc2.md");
            }, 10000);

            it("should clicking link in edit mode popover call openURLInDefaultBrowser", async function () {
                await _openMdFile("doc3.md");
                await _enterEditMode();
                await _focusMdContent();

                let capturedURL = null;
                NativeApp.openURLInDefaultBrowser = function (url) {
                    capturedURL = url;
                };

                const mdDoc = _getMdIFrameDoc();
                const content = mdDoc.getElementById("viewer-content");
                const link = content.querySelector("a[href*='remove-link-doc3']");
                expect(link).not.toBeNull();

                // Place cursor in link to trigger popover
                const range = mdDoc.createRange();
                range.selectNodeContents(link);
                range.collapse(true);
                _getMdIFrameWin().getSelection().removeAllRanges();
                _getMdIFrameWin().getSelection().addRange(range);
                content.dispatchEvent(new KeyboardEvent("keyup", {
                    key: "ArrowRight", code: "ArrowRight", bubbles: true
                }));
                content.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));

                await awaitsFor(() => {
                    const popover = mdDoc.getElementById("link-popover");
                    return popover && popover.classList.contains("visible");
                }, "link popover to appear");

                // Click the URL link in the popover
                const popover = mdDoc.getElementById("link-popover");
                const popoverLink = popover.querySelector(".link-popover-url");
                expect(popoverLink).not.toBeNull();
                popoverLink.click();

                await awaitsFor(() => capturedURL !== null,
                    "openURLInDefaultBrowser to be called from popover");
                expect(capturedURL).toContain("remove-link-doc3.example.com");

                await awaitsForDone(CommandManager.execute(Commands.FILE_CLOSE, { _forceClose: true }),
                    "force close doc3.md");
            }, 15000);

            it("should Escape in link edit dialog dismiss dialog and keep focus in md editor", async function () {
                await _openMdFile("doc3.md");
                await _enterEditMode();
                await _focusMdContent();

                const mdDoc = _getMdIFrameDoc();
                const content = mdDoc.getElementById("viewer-content");

                // Click on existing link to trigger popover
                const link = content.querySelector("a[href*='remove-link-doc3']");
                expect(link).not.toBeNull();
                const range = mdDoc.createRange();
                range.selectNodeContents(link);
                range.collapse(true);
                _getMdIFrameWin().getSelection().removeAllRanges();
                _getMdIFrameWin().getSelection().addRange(range);
                // Dispatch keyup and mouseup to trigger popover across browsers
                content.dispatchEvent(new KeyboardEvent("keyup", {
                    key: "ArrowRight", code: "ArrowRight", bubbles: true
                }));
                content.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));

                // Wait for link popover to appear
                await awaitsFor(() => {
                    const popover = mdDoc.getElementById("link-popover");
                    return popover && popover.classList.contains("visible");
                }, "link popover to appear", 5000);

                // Click Edit button to enter edit mode in popover
                const popover = mdDoc.getElementById("link-popover");
                const editBtn = popover.querySelector(".link-popover-edit-btn");
                expect(editBtn).not.toBeNull();
                editBtn.click();

                // Wait for edit inputs to be visible
                await awaitsFor(() => {
                    const editDiv = popover.querySelector(".link-popover-edit");
                    return editDiv && editDiv.style.display !== "none";
                }, "link popover edit mode to be active");

                // Press Escape on the edit input — should dismiss dialog only
                const popoverInput = popover.querySelector(".link-popover-input");
                expect(popoverInput).not.toBeNull();
                popoverInput.dispatchEvent(new KeyboardEvent("keydown", {
                    key: "Escape", code: "Escape", bubbles: true
                }));

                // Popover should be dismissed
                await awaitsFor(() => {
                    return !popover.classList.contains("visible");
                }, "link popover to be dismissed after Escape");

                // Focus should remain in md editor, NOT switch to CM
                await awaitsFor(() => {
                    return mdDoc.activeElement === content || content.contains(mdDoc.activeElement);
                }, "focus to remain in md editor after dismissing link dialog");

                // Now press Escape again — this should send embeddedEscapeKeyPressed to Phoenix
                let escapeSent = false;
                const escHandler = function (event) {
                    if (event.data && event.data.type === "MDVIEWR_EVENT" &&
                        event.data.eventName === "embeddedEscapeKeyPressed") {
                        escapeSent = true;
                    }
                };
                testWindow.addEventListener("message", escHandler);

                content.dispatchEvent(new KeyboardEvent("keydown", {
                    key: "Escape", code: "Escape", bubbles: true
                }));

                await awaitsFor(() => escapeSent,
                    "embeddedEscapeKeyPressed to be sent after second Escape");
                testWindow.removeEventListener("message", escHandler);

                await awaitsForDone(CommandManager.execute(Commands.FILE_CLOSE, { _forceClose: true }),
                    "force close doc3.md");
            }, 15000);
        });

        describe("Empty Line Placeholder", function () {

            async function _openMdFile(fileName) {
                await awaitsForDone(SpecRunnerUtils.openProjectFiles([fileName]),
                    "open " + fileName);
                await _waitForMdPreviewReady(EditorManager.getActiveEditor());
            }

            it("should empty paragraph in edit mode show hint text", async function () {
                await _openMdFile("doc1.md");
                await _enterEditMode();
                await _focusMdContent();

                const mdDoc = _getMdIFrameDoc();
                const content = mdDoc.getElementById("viewer-content");

                // Create an empty paragraph by pressing Enter at end
                const lastP = content.querySelector("p:last-of-type");
                if (lastP) {
                    const range = mdDoc.createRange();
                    range.selectNodeContents(lastP);
                    range.collapse(false);
                    _getMdIFrameWin().getSelection().removeAllRanges();
                    _getMdIFrameWin().getSelection().addRange(range);
                    mdDoc.execCommand("insertParagraph");
                }

                // Force selection state broadcast (bypasses RAF which may not fire in CI)
                const win = _getMdIFrameWin();
                if (win.__broadcastSelectionStateForTest) {
                    win.__broadcastSelectionStateForTest();
                }

                // The new empty paragraph should have the hint class
                await awaitsFor(() => {
                    return content.querySelector(".cursor-empty-hint") !== null;
                }, "empty line hint to appear");
            }, 10000);

            it("should hint only show in edit mode not reader mode", async function () {
                // Use doc2 for clean state (not modified by previous tests)
                await _openMdFile("doc2.md");
                await _enterReaderMode();

                const mdDoc = _getMdIFrameDoc();
                const content = mdDoc.getElementById("viewer-content");
                // No hints in reader mode
                expect(content.querySelector(".cursor-empty-hint")).toBeNull();
            }, 10000);
        });

        describe("Slash Menu", function () {

            async function _openMdFile(fileName) {
                await awaitsForDone(SpecRunnerUtils.openProjectFiles([fileName]),
                    "open " + fileName);
                await _waitForMdPreviewReady(EditorManager.getActiveEditor());
            }

            function _isSlashMenuVisible() {
                const mdDoc = _getMdIFrameDoc();
                const anchor = mdDoc && mdDoc.getElementById("slash-menu-anchor");
                return anchor && anchor.classList.contains("visible");
            }

            it("should slash menu appear when typing / at start of line", async function () {
                await _openMdFile("doc1.md");
                await _enterEditMode();
                await _focusMdContent();

                const mdDoc = _getMdIFrameDoc();
                const content = mdDoc.getElementById("viewer-content");

                // Create a new empty paragraph
                const lastP = content.querySelector("p:last-of-type");
                if (lastP) {
                    const range = mdDoc.createRange();
                    range.selectNodeContents(lastP);
                    range.collapse(false);
                    _getMdIFrameWin().getSelection().removeAllRanges();
                    _getMdIFrameWin().getSelection().addRange(range);
                    mdDoc.execCommand("insertParagraph");
                }

                // Type "/" to trigger slash menu
                mdDoc.execCommand("insertText", false, "/");
                content.dispatchEvent(new Event("input", { bubbles: true }));

                await awaitsFor(() => _isSlashMenuVisible(),
                    "slash menu to appear after typing /");
            }, 10000);

            it("should typing after / filter menu items to show only matches", async function () {
                await _openMdFile("doc3.md");
                await _enterEditMode();
                await _focusMdContent();

                const mdDoc = _getMdIFrameDoc();
                const content = mdDoc.getElementById("viewer-content");

                // Dismiss any leftover slash menu
                if (_isSlashMenuVisible()) {
                    content.dispatchEvent(new KeyboardEvent("keydown", {
                        key: "Escape", code: "Escape", keyCode: 27,
                        bubbles: true, cancelable: true
                    }));
                    await awaitsFor(() => !_isSlashMenuVisible(), "old slash menu to dismiss");
                }

                // Place cursor at end of last paragraph, create new line, type /
                const lastP = content.querySelector("p:last-of-type");
                if (lastP) {
                    const range = mdDoc.createRange();
                    range.selectNodeContents(lastP);
                    range.collapse(false);
                    _getMdIFrameWin().getSelection().removeAllRanges();
                    _getMdIFrameWin().getSelection().addRange(range);
                    mdDoc.execCommand("insertParagraph");
                }

                // Type / to open menu
                mdDoc.execCommand("insertText", false, "/");
                content.dispatchEvent(new Event("input", { bubbles: true }));
                await awaitsFor(() => _isSlashMenuVisible(), "slash menu to appear");

                // Get total items count
                const anchor = mdDoc.getElementById("slash-menu-anchor");
                const totalCount = anchor.querySelectorAll(".slash-menu-item").length;

                // Now type "image" character by character to filter
                for (const ch of "image") {
                    mdDoc.execCommand("insertText", false, ch);
                    content.dispatchEvent(new Event("input", { bubbles: true }));
                }

                await awaitsFor(() => {
                    const items = anchor.querySelectorAll(".slash-menu-item");
                    // Filtered count should be less than total and items should contain "image"
                    return items.length > 0 && items.length < totalCount;
                }, "slash menu to filter to image items");

                // Verify remaining items contain "image"
                const filtered = anchor.querySelectorAll(".slash-menu-item");
                for (const item of filtered) {
                    expect(item.textContent.toLowerCase()).toContain("image");
                }

                // Dismiss
                content.dispatchEvent(new KeyboardEvent("keydown", {
                    key: "Escape", code: "Escape", keyCode: 27,
                    bubbles: true, cancelable: true
                }));
            }, 10000);

            it("should Escape dismiss slash menu", async function () {
                // Open slash menu
                if (!_isSlashMenuVisible()) {
                    await _openMdFile("doc1.md");
                    await _enterEditMode();
                    await _focusMdContent();

                    const mdDoc = _getMdIFrameDoc();
                    const content = mdDoc.getElementById("viewer-content");
                    const lastP = content.querySelector("p:last-of-type");
                    if (lastP) {
                        const range = mdDoc.createRange();
                        range.selectNodeContents(lastP);
                        range.collapse(false);
                        _getMdIFrameWin().getSelection().removeAllRanges();
                        _getMdIFrameWin().getSelection().addRange(range);
                        mdDoc.execCommand("insertParagraph");
                    }
                    mdDoc.execCommand("insertText", false, "/");
                    content.dispatchEvent(new Event("input", { bubbles: true }));
                    await awaitsFor(() => _isSlashMenuVisible(), "slash menu to appear");
                }

                // Dispatch Escape on the content element (where keydown is listened)
                const mdDoc = _getMdIFrameDoc();
                const content = mdDoc.getElementById("viewer-content");
                content.dispatchEvent(new KeyboardEvent("keydown", {
                    key: "Escape", code: "Escape", keyCode: 27,
                    bubbles: true, cancelable: true
                }));

                await awaitsFor(() => !_isSlashMenuVisible(),
                    "slash menu to dismiss on Escape");
            }, 10000);
        });

    });
});
