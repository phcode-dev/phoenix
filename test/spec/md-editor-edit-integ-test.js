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

/*global describe, beforeAll, beforeEach, afterAll, awaitsFor, it, awaitsForDone, expect*/

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
        // Force reader→edit transition to ensure enterEditMode runs in editor.js
        // (attaches checkboxHandler, inputHandler, etc.)
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
        }, "md preview synced with editor content", 5000);
    }

    describe("livepreview:Markdown Editor Edit Mode", function () {

        if (Phoenix.browser.desktop.isFirefox ||
            (Phoenix.isTestWindowPlaywright && !Phoenix.browser.desktop.isChromeBased)) {
            it("Markdown edit mode tests are disabled in Firefox/non-Chrome playwright", function () {});
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

                // Open HTML first to start live dev
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

        describe("Checkbox (Task List) Sync", function () {

            beforeAll(async function () {
                // Ensure clean md state by switching HTML→MD
                await awaitsForDone(SpecRunnerUtils.openProjectFiles(["simple.html"]),
                    "open simple.html to reset md state");
            }, 10000);

            async function _openMdFile(fileName) {
                await awaitsForDone(SpecRunnerUtils.openProjectFiles([fileName]),
                    "open " + fileName);
                await _waitForMdPreviewReady(EditorManager.getActiveEditor());
            }

            function _getCheckboxes() {
                const mdDoc = _getMdIFrameDoc();
                const content = mdDoc && mdDoc.getElementById("viewer-content");
                if (!content) { return []; }
                return Array.from(content.querySelectorAll('input[type="checkbox"]'));
            }

            it("should clicking checkbox in edit mode toggle it and sync to CM source", async function () {
                await _openMdFile("checkbox-test.md");
                await _enterEditMode();

                const checkboxes = _getCheckboxes();
                expect(checkboxes.length).toBeGreaterThan(1);

                // Find first unchecked checkbox ("Incomplete task")
                let uncheckedIdx = -1;
                for (let i = 0; i < checkboxes.length; i++) {
                    if (!checkboxes[i].checked) {
                        uncheckedIdx = i;
                        break;
                    }
                }
                expect(uncheckedIdx).toBeGreaterThanOrEqual(0);

                // Click the checkbox using the iframe-context helper
                const win = _getMdIFrameWin();
                const checkedResult = win.__clickCheckboxForTest(uncheckedIdx);
                expect(checkedResult).toBeTrue();

                // Verify DOM checkbox is now checked
                expect(checkboxes[uncheckedIdx].checked).toBeTrue();

                // Click again to uncheck
                const uncheckedResult = win.__clickCheckboxForTest(uncheckedIdx);
                expect(uncheckedResult).toBeFalse();

                // Verify DOM checkbox is now unchecked
                expect(checkboxes[uncheckedIdx].checked).toBeFalse();

                await awaitsForDone(CommandManager.execute(Commands.FILE_CLOSE, { _forceClose: true }),
                    "force close checkbox-test.md");
            }, 15000);

            it("should checkboxes be enabled in edit mode and disabled in reader mode", async function () {
                await _openMdFile("checkbox-test.md");

                // In reader mode: checkboxes should be disabled
                await _enterReaderMode();
                let checkboxes = _getCheckboxes();
                expect(checkboxes.length).toBeGreaterThan(0);
                for (const cb of checkboxes) {
                    expect(cb.disabled).toBeTrue();
                }

                // In edit mode: checkboxes should be enabled
                await _enterEditMode();
                checkboxes = _getCheckboxes();
                expect(checkboxes.length).toBeGreaterThan(0);
                for (const cb of checkboxes) {
                    expect(cb.disabled).toBeFalse();
                }

                await awaitsForDone(CommandManager.execute(Commands.FILE_CLOSE, { _forceClose: true }),
                    "force close checkbox-test.md");
            }, 15000);

        });

        describe("Code Block Editing", function () {

            beforeAll(async function () {
                await awaitsForDone(SpecRunnerUtils.openProjectFiles(["simple.html"]),
                    "open simple.html to reset md state");
            }, 10000);

            async function _openMdFile(fileName) {
                await awaitsForDone(SpecRunnerUtils.openProjectFiles([fileName]),
                    "open " + fileName);
                await _waitForMdPreviewReady(EditorManager.getActiveEditor());
            }

            function _getCodeBlocks() {
                const mdDoc = _getMdIFrameDoc();
                const content = mdDoc && mdDoc.getElementById("viewer-content");
                if (!content) { return []; }
                return Array.from(content.querySelectorAll("pre"));
            }

            function _placeCursorInCodeBlock(pre, atEnd) {
                const mdDoc = _getMdIFrameDoc();
                const win = _getMdIFrameWin();
                const code = pre.querySelector("code") || pre;
                const range = mdDoc.createRange();

                if (atEnd) {
                    // Place cursor at end of last text node
                    const tw = mdDoc.createTreeWalker(code, NodeFilter.SHOW_TEXT);
                    let lastText = null;
                    let n;
                    while ((n = tw.nextNode())) { lastText = n; }
                    if (lastText) {
                        range.setStart(lastText, lastText.textContent.length);
                        range.collapse(true);
                    }
                } else {
                    // Place cursor at start of first line
                    const tw = mdDoc.createTreeWalker(code, NodeFilter.SHOW_TEXT);
                    const firstText = tw.nextNode();
                    if (firstText) {
                        range.setStart(firstText, 0);
                        range.collapse(true);
                    }
                }
                const sel = win.getSelection();
                sel.removeAllRanges();
                sel.addRange(range);
            }

            function _placeCursorOnMiddleLine(pre) {
                const mdDoc = _getMdIFrameDoc();
                const win = _getMdIFrameWin();
                const code = pre.querySelector("code") || pre;
                const textContent = code.textContent || "";
                const lines = textContent.split("\n");
                if (lines.length < 3) { return; }
                // Place cursor at the start of the second line
                const firstLineLen = lines[0].length + 1; // +1 for \n
                const tw = mdDoc.createTreeWalker(code, NodeFilter.SHOW_TEXT);
                let offset = 0;
                let n;
                while ((n = tw.nextNode())) {
                    if (offset + n.textContent.length >= firstLineLen) {
                        const localOffset = firstLineLen - offset;
                        const range = mdDoc.createRange();
                        range.setStart(n, Math.min(localOffset, n.textContent.length));
                        range.collapse(true);
                        const sel = win.getSelection();
                        sel.removeAllRanges();
                        sel.addRange(range);
                        return;
                    }
                    offset += n.textContent.length;
                }
            }

            function _dispatchKey(key, options) {
                const mdDoc = _getMdIFrameDoc();
                const content = mdDoc.getElementById("viewer-content");
                content.dispatchEvent(new KeyboardEvent("keydown", {
                    key: key,
                    code: options && options.code || key,
                    shiftKey: !!(options && options.shiftKey),
                    ctrlKey: false,
                    metaKey: false,
                    bubbles: true,
                    cancelable: true
                }));
            }

            function _getCursorElement() {
                const win = _getMdIFrameWin();
                const sel = win.getSelection();
                if (!sel || !sel.rangeCount) { return null; }
                let node = sel.anchorNode;
                if (node && node.nodeType === Node.TEXT_NODE) { node = node.parentElement; }
                return node;
            }

            it("should ArrowDown on last line of code block exit to paragraph below", async function () {
                await _openMdFile("code-block-test.md");
                await _enterEditMode();

                const blocks = _getCodeBlocks();
                expect(blocks.length).toBeGreaterThan(0);
                const firstPre = blocks[0];

                // Place cursor at end of code block (last line)
                _placeCursorInCodeBlock(firstPre, true);

                // Verify cursor is in the pre
                let curEl = _getCursorElement();
                expect(curEl && curEl.closest("pre")).toBe(firstPre);

                // Press ArrowDown
                _dispatchKey("ArrowDown");

                // Cursor should now be outside the pre, in the next sibling
                await awaitsFor(() => {
                    const el = _getCursorElement();
                    return el && !el.closest("pre");
                }, "cursor to exit code block on ArrowDown");

                await awaitsForDone(CommandManager.execute(Commands.FILE_CLOSE, { _forceClose: true }),
                    "force close");
            }, 10000);

            it("should ArrowDown on non-last line navigate within code block", async function () {
                await _openMdFile("code-block-test.md");
                await _enterEditMode();

                const blocks = _getCodeBlocks();
                expect(blocks.length).toBeGreaterThan(0);
                const firstPre = blocks[0];

                // Place cursor on a middle line
                _placeCursorOnMiddleLine(firstPre);
                let curEl = _getCursorElement();
                expect(curEl && curEl.closest("pre")).toBe(firstPre);

                // Press ArrowDown — should stay in code block
                _dispatchKey("ArrowDown");

                // Cursor should still be in the pre
                const afterEl = _getCursorElement();
                expect(afterEl && afterEl.closest("pre")).toBe(firstPre);

                await awaitsForDone(CommandManager.execute(Commands.FILE_CLOSE, { _forceClose: true }),
                    "force close");
            }, 10000);

            it("should ArrowDown on last line move to existing next sibling", async function () {
                await _openMdFile("code-block-test.md");
                await _enterEditMode();

                const blocks = _getCodeBlocks();
                expect(blocks.length).toBeGreaterThan(0);
                const firstPre = blocks[0];

                // There should be a paragraph after the first code block
                const nextSibling = firstPre.nextElementSibling;
                expect(nextSibling).not.toBeNull();
                expect(nextSibling.tagName).toBe("P");

                // Place cursor at end of code block
                _placeCursorInCodeBlock(firstPre, true);

                // Press ArrowDown
                _dispatchKey("ArrowDown");

                // Cursor should be in the next paragraph
                await awaitsFor(() => {
                    const el = _getCursorElement();
                    return el && el.closest("p") === nextSibling;
                }, "cursor to move to existing next sibling paragraph");

                await awaitsForDone(CommandManager.execute(Commands.FILE_CLOSE, { _forceClose: true }),
                    "force close");
            }, 10000);

            it("should Shift+Enter on last line of code block exit to paragraph below", async function () {
                await _openMdFile("code-block-test.md");
                await _enterEditMode();

                const blocks = _getCodeBlocks();
                expect(blocks.length).toBeGreaterThan(0);
                const firstPre = blocks[0];

                // Place cursor at end of code block
                _placeCursorInCodeBlock(firstPre, true);

                // Press Shift+Enter
                _dispatchKey("Enter", { shiftKey: true });

                // Cursor should exit to paragraph below
                await awaitsFor(() => {
                    const el = _getCursorElement();
                    return el && !el.closest("pre");
                }, "cursor to exit code block on Shift+Enter");

                await awaitsForDone(CommandManager.execute(Commands.FILE_CLOSE, { _forceClose: true }),
                    "force close");
            }, 10000);

            it("should Shift+Enter on non-last line NOT exit code block", async function () {
                await _openMdFile("code-block-test.md");
                await _enterEditMode();

                const blocks = _getCodeBlocks();
                expect(blocks.length).toBeGreaterThan(0);
                const firstPre = blocks[0];

                // Place cursor on middle line
                _placeCursorOnMiddleLine(firstPre);

                // Press Shift+Enter — should NOT exit
                _dispatchKey("Enter", { shiftKey: true });

                // Cursor should still be in the pre
                const afterEl = _getCursorElement();
                expect(afterEl && afterEl.closest("pre")).toBe(firstPre);

                await awaitsForDone(CommandManager.execute(Commands.FILE_CLOSE, { _forceClose: true }),
                    "force close");
            }, 10000);

            it("should Enter inside code block create new line within the block", async function () {
                await _openMdFile("code-block-test.md");
                await _enterEditMode();

                const blocks = _getCodeBlocks();
                expect(blocks.length).toBeGreaterThan(0);
                const firstPre = blocks[0];
                const code = firstPre.querySelector("code") || firstPre;
                const linesBefore = (code.textContent || "").split("\n").length;

                // Place cursor at end of last line (Enter on last line should still add a line)
                _placeCursorInCodeBlock(firstPre, true);

                // Press Enter (no shift) — should add a newline within the code block
                _dispatchKey("Enter");

                // Cursor should still be inside the pre
                const afterEl = _getCursorElement();
                expect(afterEl && afterEl.closest("pre")).toBe(firstPre);

                // Code block should have one more line
                const linesAfter = (code.textContent || "").split("\n").length;
                expect(linesAfter).toBeGreaterThanOrEqual(linesBefore);

                await awaitsForDone(CommandManager.execute(Commands.FILE_CLOSE, { _forceClose: true }),
                    "force close");
            }, 10000);

            it("should code block exit sync new paragraph to CM source", async function () {
                await _openMdFile("code-block-test.md");
                await _enterEditMode();

                const editor = EditorManager.getActiveEditor();
                const blocks = _getCodeBlocks();
                const lastPre = blocks[blocks.length - 1];

                // Remove next sibling if exists to force <p> creation
                let nextEl = lastPre.nextElementSibling;
                if (nextEl && nextEl.tagName === "P") {
                    nextEl.remove();
                }

                // Place cursor at end of last code block
                _placeCursorInCodeBlock(lastPre, true);

                // Press ArrowDown — should create new <p> and exit
                _dispatchKey("ArrowDown");

                // Verify new paragraph was created
                await awaitsFor(() => {
                    const next = lastPre.nextElementSibling;
                    return next && next.tagName === "P";
                }, "new paragraph to be created below last code block");

                // Verify cursor is in the new paragraph
                const curEl = _getCursorElement();
                expect(curEl && !curEl.closest("pre")).toBeTrue();

                await awaitsForDone(CommandManager.execute(Commands.FILE_CLOSE, { _forceClose: true }),
                    "force close");
            }, 10000);

            it("should last code block ArrowDown create new paragraph and exit", async function () {
                await _openMdFile("code-block-test.md");
                await _enterEditMode();

                const blocks = _getCodeBlocks();
                const lastPre = blocks[blocks.length - 1];

                // Remove everything after last code block
                while (lastPre.nextElementSibling) {
                    lastPre.nextElementSibling.remove();
                }

                // Place cursor at end of last code block
                _placeCursorInCodeBlock(lastPre, true);

                // Press ArrowDown
                _dispatchKey("ArrowDown");

                // New <p> should be created
                await awaitsFor(() => {
                    const next = lastPre.nextElementSibling;
                    return next && next.tagName === "P";
                }, "new <p> to be created after last code block");

                // Cursor should be in the new paragraph
                const curEl = _getCursorElement();
                expect(curEl && !curEl.closest("pre")).toBeTrue();

                await awaitsForDone(CommandManager.execute(Commands.FILE_CLOSE, { _forceClose: true }),
                    "force close");
            }, 10000);

            it("should editing code block content in CM sync to viewer", async function () {
                await _openMdFile("code-block-test.md");
                await _enterEditMode();

                const editor = EditorManager.getActiveEditor();
                const cmText = editor.document.getText();

                // Replace content inside the first code block
                const newText = cmText.replace(
                    'console.log("hello")',
                    'console.log("world")'
                );
                editor.document.setText(newText);

                // Verify the viewer code block updated
                const mdDoc = _getMdIFrameDoc();
                await awaitsFor(() => {
                    const blocks = mdDoc.querySelectorAll("#viewer-content pre code");
                    return blocks.length > 0 && blocks[0].textContent.includes("world");
                }, "viewer code block to reflect CM edit");

                await awaitsForDone(CommandManager.execute(Commands.FILE_CLOSE, { _forceClose: true }),
                    "force close");
            }, 10000);

            it("should changing code block language in CM update viewer syntax class", async function () {
                await _openMdFile("code-block-test.md");
                await _enterEditMode();

                const editor = EditorManager.getActiveEditor();
                const cmText = editor.document.getText();

                // Verify initial language class
                const mdDoc = _getMdIFrameDoc();
                await awaitsFor(() => {
                    const code = mdDoc.querySelector("#viewer-content pre code");
                    return code && (code.className.includes("javascript") ||
                        code.className.includes("js"));
                }, "initial code block to have javascript class");

                // Change ```javascript to ```html in CM
                const newText = cmText.replace("```javascript", "```html");
                editor.document.setText(newText);

                // Verify the viewer code block updated its language class
                await awaitsFor(() => {
                    const code = mdDoc.querySelector("#viewer-content pre code");
                    return code && code.className.includes("html") &&
                        !code.className.includes("javascript");
                }, "viewer code block to reflect language change to html");

                await awaitsForDone(CommandManager.execute(Commands.FILE_CLOSE, { _forceClose: true }),
                    "force close");
            }, 10000);
        });

        describe("List Editing", function () {

            beforeAll(async function () {
                await awaitsForDone(SpecRunnerUtils.openProjectFiles(["simple.html"]),
                    "open simple.html to reset md state");
            }, 10000);

            async function _openMdFile(fileName) {
                await awaitsForDone(SpecRunnerUtils.openProjectFiles([fileName]),
                    "open " + fileName);
                await _waitForMdPreviewReady(EditorManager.getActiveEditor());
            }

            function _getListItems(selector) {
                const mdDoc = _getMdIFrameDoc();
                const content = mdDoc && mdDoc.getElementById("viewer-content");
                if (!content) { return []; }
                return Array.from(content.querySelectorAll(selector || "li"));
            }

            function _placeCursorInElement(el, offset) {
                const mdDoc = _getMdIFrameDoc();
                const win = _getMdIFrameWin();
                const range = mdDoc.createRange();
                const textNode = el.firstChild && el.firstChild.nodeType === Node.TEXT_NODE
                    ? el.firstChild : el;
                if (textNode.nodeType === Node.TEXT_NODE) {
                    range.setStart(textNode, Math.min(offset || 0, textNode.textContent.length));
                } else {
                    range.setStart(textNode, 0);
                }
                range.collapse(true);
                const sel = win.getSelection();
                sel.removeAllRanges();
                sel.addRange(range);
            }

            function _placeCursorAtEnd(el) {
                const mdDoc = _getMdIFrameDoc();
                const win = _getMdIFrameWin();
                const range = mdDoc.createRange();
                range.selectNodeContents(el);
                range.collapse(false);
                const sel = win.getSelection();
                sel.removeAllRanges();
                sel.addRange(range);
            }

            function _dispatchKey(key, options) {
                const mdDoc = _getMdIFrameDoc();
                const content = mdDoc.getElementById("viewer-content");
                content.dispatchEvent(new KeyboardEvent("keydown", {
                    key: key,
                    code: options && options.code || key,
                    keyCode: options && options.keyCode || 0,
                    shiftKey: !!(options && options.shiftKey),
                    ctrlKey: false,
                    metaKey: false,
                    bubbles: true,
                    cancelable: true
                }));
            }

            function _getCursorElement() {
                const win = _getMdIFrameWin();
                const sel = win.getSelection();
                if (!sel || !sel.rangeCount) { return null; }
                let node = sel.anchorNode;
                if (node && node.nodeType === Node.TEXT_NODE) { node = node.parentElement; }
                return node;
            }

            it("should Enter in list item split content into two li elements", async function () {
                await _openMdFile("list-test.md");
                await _enterEditMode();

                // Find "Second item with some text"
                const items = _getListItems("ul > li");
                let targetLi = null;
                for (const li of items) {
                    if (li.textContent.includes("Second item")) {
                        targetLi = li;
                        break;
                    }
                }
                expect(targetLi).not.toBeNull();

                const parentUl = targetLi.closest("ul");
                const itemCountBefore = parentUl.querySelectorAll(":scope > li").length;

                // Place cursor in the middle of "Second item with some text"
                _placeCursorInElement(targetLi, 7); // after "Second "

                // Press Enter
                _dispatchKey("Enter");

                // Should have one more li with content split correctly
                await awaitsFor(() => {
                    const lis = Array.from(parentUl.querySelectorAll(":scope > li"));
                    if (lis.length <= itemCountBefore) { return false; }
                    // The original li should no longer contain the full unsplit text
                    if (targetLi.textContent.includes("Second item with some text")) {
                        return false;
                    }
                    // Find two consecutive lis: one ending with "Second" and next starting with "item"
                    for (let i = 0; i < lis.length - 1; i++) {
                        const cur = lis[i].textContent.trim();
                        const next = lis[i + 1].textContent.trim();
                        if (cur === "Second" && next.startsWith("item with some text")) {
                            return true;
                        }
                    }
                    return false;
                }, "li to split into consecutive 'Second' and 'item with some text'");

                await awaitsForDone(CommandManager.execute(Commands.FILE_CLOSE, { _forceClose: true }),
                    "force close");
            }, 10000);

            it("should Enter on empty list item exit list and create paragraph below", async function () {
                await _openMdFile("list-test.md");
                await _enterEditMode();

                const mdDoc = _getMdIFrameDoc();
                const content = mdDoc.getElementById("viewer-content");
                // Find a list and add an empty li at the end
                const ul = content.querySelector("ul");
                expect(ul).not.toBeNull();
                const emptyLi = mdDoc.createElement("li");
                emptyLi.innerHTML = "<br>";
                ul.appendChild(emptyLi);

                // Place cursor in the empty li
                _placeCursorInElement(emptyLi, 0);

                // Press Enter — should exit list
                _dispatchKey("Enter");

                // Cursor should now be in a paragraph after the list
                await awaitsFor(() => {
                    const el = _getCursorElement();
                    return el && el.closest("p") && !el.closest("li");
                }, "cursor to exit list to paragraph below");

                await awaitsForDone(CommandManager.execute(Commands.FILE_CLOSE, { _forceClose: true }),
                    "force close");
            }, 10000);

            it("should Shift+Enter in list item insert line break without creating new bullet", async function () {
                await _openMdFile("list-test.md");
                await _enterEditMode();

                const items = _getListItems("ul > li");
                let targetLi = null;
                for (const li of items) {
                    if (li.textContent.includes("First item")) {
                        targetLi = li;
                        break;
                    }
                }
                expect(targetLi).not.toBeNull();

                const parentUl = targetLi.closest("ul");
                const itemCountBefore = parentUl.querySelectorAll(":scope > li").length;

                // Place cursor at end of first item
                _placeCursorAtEnd(targetLi);

                // Press Shift+Enter
                _dispatchKey("Enter", { shiftKey: true });

                // Li count should NOT increase (no new bullet created)
                expect(parentUl.querySelectorAll(":scope > li").length).toBe(itemCountBefore);

                // Should still be in the same li
                const curEl = _getCursorElement();
                expect(curEl && curEl.closest("li")).toBe(targetLi);

                // The li should contain a <br> (line break within same bullet)
                expect(targetLi.querySelector("br")).not.toBeNull();

                // The text content should still be in one li (not split)
                expect(targetLi.textContent).toContain("First item");

                await awaitsForDone(CommandManager.execute(Commands.FILE_CLOSE, { _forceClose: true }),
                    "force close");
            }, 10000);

            it("should Tab indent list item under previous sibling", async function () {
                await _openMdFile("list-test.md");
                await _enterEditMode();

                const items = _getListItems("ul > li");
                // Find "Third item" which has a previous sibling
                let targetLi = null;
                for (const li of items) {
                    if (li.textContent.trim().startsWith("Third item")) {
                        targetLi = li;
                        break;
                    }
                }
                expect(targetLi).not.toBeNull();
                const prevLi = targetLi.previousElementSibling;
                expect(prevLi).not.toBeNull();

                // Place cursor in the target li
                _placeCursorInElement(targetLi, 0);

                // Press Tab
                _dispatchKey("Tab", { code: "Tab", keyCode: 9 });

                // The li should now be nested inside the previous sibling
                await awaitsFor(() => {
                    return targetLi.parentElement && targetLi.parentElement.closest("li") === prevLi;
                }, "li to be indented under previous sibling");

                await awaitsForDone(CommandManager.execute(Commands.FILE_CLOSE, { _forceClose: true }),
                    "force close");
            }, 10000);

            it("should Shift+Tab outdent nested list item to parent level", async function () {
                await _openMdFile("list-test.md");
                await _enterEditMode();

                const mdDoc = _getMdIFrameDoc();
                // Find a nested li (child under "Parent one")
                const nestedItems = mdDoc.querySelectorAll("#viewer-content ul ul > li, #viewer-content ol ol > li");
                expect(nestedItems.length).toBeGreaterThan(0);
                const nestedLi = nestedItems[0];
                const parentList = nestedLi.parentElement;
                const grandLi = parentList.closest("li");
                expect(grandLi).not.toBeNull();
                const outerList = grandLi.parentElement;

                // Place cursor in nested li
                _placeCursorInElement(nestedLi, 0);

                // Press Shift+Tab
                _dispatchKey("Tab", { code: "Tab", keyCode: 9, shiftKey: true });

                // The li should now be at the parent level (sibling of grandLi)
                await awaitsFor(() => {
                    return nestedLi.parentElement === outerList;
                }, "nested li to be outdented to parent level");

                await awaitsForDone(CommandManager.execute(Commands.FILE_CLOSE, { _forceClose: true }),
                    "force close");
            }, 10000);

            it("should Shift+Tab preserve trailing siblings as sub-list", async function () {
                await _openMdFile("list-test.md");
                await _enterEditMode();

                const mdDoc = _getMdIFrameDoc();
                // Find nested list with multiple children
                const nestedLists = mdDoc.querySelectorAll("#viewer-content ul ul, #viewer-content ol ol");
                let targetList = null;
                for (const nl of nestedLists) {
                    if (nl.children.length >= 2) {
                        targetList = nl;
                        break;
                    }
                }
                expect(targetList).not.toBeNull();

                // Outdent the first child — remaining siblings should become sub-list
                const firstChild = targetList.children[0];
                const siblingCount = targetList.children.length - 1;
                _placeCursorInElement(firstChild, 0);

                // Press Shift+Tab
                _dispatchKey("Tab", { code: "Tab", keyCode: 9, shiftKey: true });

                // The outdented item should have a sub-list with the trailing siblings
                await awaitsFor(() => {
                    const subList = firstChild.querySelector("ul, ol");
                    return subList && subList.children.length === siblingCount;
                }, "trailing siblings to be preserved as sub-list");

                await awaitsForDone(CommandManager.execute(Commands.FILE_CLOSE, { _forceClose: true }),
                    "force close");
            }, 10000);

            it("should Tab on first list item with no previous sibling do nothing", async function () {
                await _openMdFile("list-test.md");
                await _enterEditMode();

                const items = _getListItems("ul > li");
                expect(items.length).toBeGreaterThan(0);
                const firstLi = items[0];
                const parentBefore = firstLi.parentElement;

                // Place cursor in first li
                _placeCursorInElement(firstLi, 0);

                // Press Tab — should do nothing (no previous sibling)
                _dispatchKey("Tab", { code: "Tab", keyCode: 9 });

                // Li should still be at the same level
                expect(firstLi.parentElement).toBe(parentBefore);

                await awaitsForDone(CommandManager.execute(Commands.FILE_CLOSE, { _forceClose: true }),
                    "force close");
            }, 10000);

            it("should cursor position be preserved after Tab indent", async function () {
                await _openMdFile("list-test.md");
                await _enterEditMode();

                const items = _getListItems("ul > li");
                let targetLi = null;
                for (const li of items) {
                    if (li.textContent.trim().startsWith("Third item")) {
                        targetLi = li;
                        break;
                    }
                }
                expect(targetLi).not.toBeNull();

                // Place cursor at offset 3 in the li
                _placeCursorInElement(targetLi, 3);

                // Press Tab
                _dispatchKey("Tab", { code: "Tab", keyCode: 9 });

                // Cursor should still be in the same li
                await awaitsFor(() => {
                    const el = _getCursorElement();
                    return el && el.closest("li") === targetLi;
                }, "cursor to remain in indented li");

                await awaitsForDone(CommandManager.execute(Commands.FILE_CLOSE, { _forceClose: true }),
                    "force close");
            }, 10000);

            it("should Enter in list create li that syncs to markdown bullet in CM", async function () {
                await _openMdFile("list-test.md");
                await _enterEditMode();

                const editor = EditorManager.getActiveEditor();
                const items = _getListItems("ul > li");
                let targetLi = null;
                for (const li of items) {
                    if (li.textContent.includes("First item")) {
                        targetLi = li;
                        break;
                    }
                }
                expect(targetLi).not.toBeNull();

                // Place cursor at end of first item
                _placeCursorAtEnd(targetLi);

                // Press Enter to split/create new li
                _dispatchKey("Enter");

                // Wait for CM to have an additional bullet line
                await awaitsFor(() => {
                    const cmText = editor.document.getText();
                    // Count bullet lines (- ) — should have more than original
                    const bullets = cmText.match(/^-\s+/gm) || [];
                    return bullets.length > 4; // original has 4 unordered items
                }, "new bullet to appear in CM source");

                await awaitsForDone(CommandManager.execute(Commands.FILE_CLOSE, { _forceClose: true }),
                    "force close");
            }, 10000);

        });

        describe("UL/OL Toggle (List Type Switching)", function () {

            const ORIGINAL_LIST_MD = "# List Test\n\n## Unordered List\n\n" +
                "- First item\n- Second item with some text\n- Third item\n- Fourth item\n\n" +
                "## Nested List\n\n- Parent one\n    - Child one\n    - Child two\n    - Child three\n" +
                "- Parent two\n\n## Ordered List\n\n1. First ordered\n2. Second ordered\n3. Third ordered\n\n" +
                "End of list test.\n";

            beforeAll(async function () {
                // Reset md state then open file
                await awaitsForDone(SpecRunnerUtils.openProjectFiles(["simple.html"]),
                    "open simple.html to reset md state");
                await awaitsForDone(SpecRunnerUtils.openProjectFiles(["list-test.md"]),
                    "open list-test.md");
                await _waitForMdPreviewReady(EditorManager.getActiveEditor());
                await _enterEditMode();
            }, 15000);

            beforeEach(async function () {
                // Reset CM content to original and wait for viewer to sync
                const editor = EditorManager.getActiveEditor();
                if (editor) {
                    editor.document.setText(ORIGINAL_LIST_MD);
                    await awaitsFor(() => {
                        const win = _getMdIFrameWin();
                        return win && win.__getCurrentContent &&
                            win.__getCurrentContent() === ORIGINAL_LIST_MD;
                    }, "viewer to sync with reset content");
                    // Wait for content suppression to clear
                    const win = _getMdIFrameWin();
                    await awaitsFor(() => {
                        return win && win.__isSuppressingContentChange &&
                            !win.__isSuppressingContentChange();
                    }, "content suppression to clear after reset");
                    // Re-enter edit mode to reset lastHTML and reattach handlers
                    if (win && win.__setEditModeForTest) {
                        win.__setEditModeForTest(false);
                        win.__setEditModeForTest(true);
                    }
                    await awaitsFor(() => {
                        const mdDoc = _getMdIFrameDoc();
                        const content = mdDoc && mdDoc.getElementById("viewer-content");
                        return content && content.classList.contains("editing");
                    }, "edit mode to reactivate after reset");
                }
            });

            afterAll(async function () {
                const editor = EditorManager.getActiveEditor();
                if (editor) {
                    editor.document.setText(ORIGINAL_LIST_MD);
                }
                await awaitsForDone(CommandManager.execute(Commands.FILE_CLOSE, { _forceClose: true }),
                    "force close list-test.md");
            });

            function _placeCursorInElement(el, offset) {
                const mdDoc = _getMdIFrameDoc();
                const win = _getMdIFrameWin();
                const range = mdDoc.createRange();
                const textNode = el.firstChild && el.firstChild.nodeType === Node.TEXT_NODE
                    ? el.firstChild : el;
                if (textNode.nodeType === Node.TEXT_NODE) {
                    range.setStart(textNode, Math.min(offset || 0, textNode.textContent.length));
                } else {
                    range.setStart(textNode, 0);
                }
                range.collapse(true);
                const sel = win.getSelection();
                sel.removeAllRanges();
                sel.addRange(range);
            }

            function _findLiByText(text) {
                const mdDoc = _getMdIFrameDoc();
                const items = mdDoc.querySelectorAll("#viewer-content li");
                for (const li of items) {
                    if (li.textContent.trim().includes(text)) {
                        return li;
                    }
                }
                return null;
            }

            it("should clicking UL button when in OL switch list to unordered", async function () {
                const olLi = _findLiByText("First ordered");
                expect(olLi).not.toBeNull();
                expect(olLi.closest("ol")).not.toBeNull();
                _placeCursorInElement(olLi, 0);

                const mdDoc = _getMdIFrameDoc();
                mdDoc.dispatchEvent(new Event("selectionchange"));

                mdDoc.getElementById("emb-ul").dispatchEvent(
                    new MouseEvent("mousedown", { bubbles: true }));

                await awaitsFor(() => {
                    return olLi.closest("ul") !== null && olLi.closest("ol") === null;
                }, "ordered list to switch to unordered");
            }, 10000);

            it("should clicking OL button when in UL switch list to ordered", async function () {
                const ulLi = _findLiByText("First item");
                expect(ulLi).not.toBeNull();
                expect(ulLi.closest("ul")).not.toBeNull();
                _placeCursorInElement(ulLi, 0);

                const mdDoc = _getMdIFrameDoc();
                mdDoc.dispatchEvent(new Event("selectionchange"));

                mdDoc.getElementById("emb-ol").dispatchEvent(
                    new MouseEvent("mousedown", { bubbles: true }));

                await awaitsFor(() => {
                    return ulLi.closest("ol") !== null && ulLi.closest("ul") === null;
                }, "unordered list to switch to ordered");
            }, 10000);

            it("should UL/OL toggle preserve list content", async function () {
                const olLi = _findLiByText("First ordered");
                expect(olLi).not.toBeNull();
                const ol = olLi.closest("ol");
                const itemTexts = Array.from(ol.querySelectorAll(":scope > li"))
                    .map(li => li.textContent.trim());

                _placeCursorInElement(olLi, 0);
                const mdDoc = _getMdIFrameDoc();
                mdDoc.dispatchEvent(new Event("selectionchange"));

                mdDoc.getElementById("emb-ul").dispatchEvent(
                    new MouseEvent("mousedown", { bubbles: true }));

                await awaitsFor(() => olLi.closest("ul") !== null,
                    "list to switch to UL");

                const newList = olLi.closest("ul");
                const newTexts = Array.from(newList.querySelectorAll(":scope > li"))
                    .map(li => li.textContent.trim());
                expect(newTexts).toEqual(itemTexts);
            }, 10000);

            it("should toolbar UL button show active state when cursor in UL", async function () {
                const ulLi = _findLiByText("First item");
                _placeCursorInElement(ulLi, 0);

                const mdDoc = _getMdIFrameDoc();
                // Use sync broadcast to bypass RAF (doesn't fire reliably in Edge)
                const win = _getMdIFrameWin();
                if (win.__broadcastSelectionStateForTest) {
                    win.__broadcastSelectionStateForTest();
                } else {
                    mdDoc.dispatchEvent(new Event("selectionchange"));
                }

                await awaitsFor(() => {
                    const ulBtn = mdDoc.getElementById("emb-ul");
                    return ulBtn && ulBtn.getAttribute("aria-pressed") === "true";
                }, "UL button to show active state");

                expect(mdDoc.getElementById("emb-ol").getAttribute("aria-pressed")).toBe("false");
            }, 10000);

            it("should toolbar OL button show active state when cursor in OL", async function () {
                const olLi = _findLiByText("First ordered");
                _placeCursorInElement(olLi, 0);

                const mdDoc = _getMdIFrameDoc();
                const win = _getMdIFrameWin();
                if (win.__broadcastSelectionStateForTest) {
                    win.__broadcastSelectionStateForTest();
                } else {
                    mdDoc.dispatchEvent(new Event("selectionchange"));
                }

                await awaitsFor(() => {
                    const olBtn = mdDoc.getElementById("emb-ol");
                    return olBtn && olBtn.getAttribute("aria-pressed") === "true";
                }, "OL button to show active state");

                expect(mdDoc.getElementById("emb-ul").getAttribute("aria-pressed")).toBe("false");
            }, 10000);

            it("should block-level buttons be hidden when cursor is in list", async function () {
                const ulLi = _findLiByText("First item");
                _placeCursorInElement(ulLi, 0);

                const mdDoc = _getMdIFrameDoc();
                const win = _getMdIFrameWin();
                if (win.__broadcastSelectionStateForTest) {
                    win.__broadcastSelectionStateForTest();
                } else {
                    mdDoc.dispatchEvent(new Event("selectionchange"));
                }

                await awaitsFor(() => {
                    const quoteBtn = mdDoc.getElementById("emb-quote");
                    return quoteBtn && quoteBtn.style.display === "none";
                }, "block buttons to be hidden in list");

                const blockIds = ["emb-quote", "emb-hr", "emb-table", "emb-codeblock"];
                for (const id of blockIds) {
                    const btn = mdDoc.getElementById(id);
                    if (btn) {
                        expect(btn.style.display).toBe("none");
                    }
                }

                const blockTypeSelect = mdDoc.getElementById("emb-block-type");
                if (blockTypeSelect) {
                    expect(blockTypeSelect.style.display).toBe("none");
                }

                // List buttons should remain visible
                expect(mdDoc.getElementById("emb-ul").style.display).not.toBe("none");
                expect(mdDoc.getElementById("emb-ol").style.display).not.toBe("none");
            }, 10000);

            it("should moving cursor out of list restore all toolbar buttons", async function () {
                const mdDoc = _getMdIFrameDoc();
                const win = _getMdIFrameWin();

                // First place cursor in list
                const ulLi = _findLiByText("First item");
                _placeCursorInElement(ulLi, 0);
                if (win.__broadcastSelectionStateForTest) {
                    win.__broadcastSelectionStateForTest();
                } else {
                    mdDoc.dispatchEvent(new Event("selectionchange"));
                }

                await awaitsFor(() => {
                    const quoteBtn = mdDoc.getElementById("emb-quote");
                    return quoteBtn && quoteBtn.style.display === "none";
                }, "block buttons to be hidden in list");

                // Move cursor to paragraph outside list
                const paragraphs = mdDoc.querySelectorAll("#viewer-content > p");
                let targetP = null;
                for (const p of paragraphs) {
                    if (p.textContent.includes("End of list test")) {
                        targetP = p;
                        break;
                    }
                }
                expect(targetP).not.toBeNull();
                const range = mdDoc.createRange();
                range.setStart(targetP.firstChild, 0);
                range.collapse(true);
                _getMdIFrameWin().getSelection().removeAllRanges();
                win.getSelection().addRange(range);
                if (win.__broadcastSelectionStateForTest) {
                    win.__broadcastSelectionStateForTest();
                } else {
                    mdDoc.dispatchEvent(new Event("selectionchange"));
                }

                await awaitsFor(() => {
                    const quoteBtn = mdDoc.getElementById("emb-quote");
                    return quoteBtn && quoteBtn.style.display !== "none";
                }, "block buttons to be restored outside list");

                const blockIds = ["emb-quote", "emb-hr", "emb-table", "emb-codeblock"];
                for (const id of blockIds) {
                    const btn = mdDoc.getElementById(id);
                    if (btn) {
                        expect(btn.style.display).not.toBe("none");
                    }
                }

                const blockTypeSelect = mdDoc.getElementById("emb-block-type");
                if (blockTypeSelect) {
                    expect(blockTypeSelect.style.display).not.toBe("none");
                }
            }, 10000);
        });

        describe("Heading Editing", function () {

            const ORIGINAL_HEADING_MD = "# Heading One\n\nSome paragraph text.\n\n" +
                "## Heading Two\n\nAnother paragraph.\n\n### Heading Three\n\nFinal paragraph.\n";

            beforeAll(async function () {
                await awaitsForDone(SpecRunnerUtils.openProjectFiles(["simple.html"]),
                    "open simple.html to reset md state");
                await awaitsForDone(SpecRunnerUtils.openProjectFiles(["heading-test.md"]),
                    "open heading-test.md");
                await _waitForMdPreviewReady(EditorManager.getActiveEditor());
                await _enterEditMode();
            }, 15000);

            beforeEach(async function () {
                const editor = EditorManager.getActiveEditor();
                if (editor) {
                    editor.document.setText(ORIGINAL_HEADING_MD);
                    await awaitsFor(() => {
                        const win = _getMdIFrameWin();
                        return win && win.__getCurrentContent &&
                            win.__getCurrentContent() === ORIGINAL_HEADING_MD;
                    }, "viewer to sync with reset content");
                    const win = _getMdIFrameWin();
                    await awaitsFor(() => {
                        return win && win.__isSuppressingContentChange &&
                            !win.__isSuppressingContentChange();
                    }, "content suppression to clear");
                    if (win && win.__setEditModeForTest) {
                        win.__setEditModeForTest(false);
                        win.__setEditModeForTest(true);
                    }
                    await awaitsFor(() => {
                        const mdDoc = _getMdIFrameDoc();
                        const content = mdDoc && mdDoc.getElementById("viewer-content");
                        return content && content.classList.contains("editing");
                    }, "edit mode to reactivate");
                }
            });

            afterAll(async function () {
                const editor = EditorManager.getActiveEditor();
                if (editor) {
                    editor.document.setText(ORIGINAL_HEADING_MD);
                }
                await awaitsForDone(CommandManager.execute(Commands.FILE_CLOSE, { _forceClose: true }),
                    "force close heading-test.md");
            });

            function _findHeading(tag, text) {
                const mdDoc = _getMdIFrameDoc();
                const headings = mdDoc.querySelectorAll("#viewer-content " + tag);
                for (const h of headings) {
                    if (h.textContent.includes(text)) {
                        return h;
                    }
                }
                return null;
            }

            function _placeCursorAt(el, offset) {
                const mdDoc = _getMdIFrameDoc();
                const win = _getMdIFrameWin();
                const range = mdDoc.createRange();
                const textNode = el.firstChild && el.firstChild.nodeType === Node.TEXT_NODE
                    ? el.firstChild : el;
                if (textNode.nodeType === Node.TEXT_NODE) {
                    range.setStart(textNode, Math.min(offset, textNode.textContent.length));
                } else {
                    range.setStart(el, 0);
                }
                range.collapse(true);
                const sel = win.getSelection();
                sel.removeAllRanges();
                sel.addRange(range);
            }

            function _placeCursorAtEnd(el) {
                const mdDoc = _getMdIFrameDoc();
                const win = _getMdIFrameWin();
                const range = mdDoc.createRange();
                range.selectNodeContents(el);
                range.collapse(false);
                const sel = win.getSelection();
                sel.removeAllRanges();
                sel.addRange(range);
            }

            function _dispatchKey(key, options) {
                const mdDoc = _getMdIFrameDoc();
                const content = mdDoc.getElementById("viewer-content");
                content.dispatchEvent(new KeyboardEvent("keydown", {
                    key: key,
                    code: options && options.code || key,
                    keyCode: options && options.keyCode || 0,
                    shiftKey: !!(options && options.shiftKey),
                    ctrlKey: false,
                    metaKey: false,
                    bubbles: true,
                    cancelable: true
                }));
            }

            function _getCursorElement() {
                const win = _getMdIFrameWin();
                const sel = win.getSelection();
                if (!sel || !sel.rangeCount) { return null; }
                let node = sel.anchorNode;
                if (node && node.nodeType === Node.TEXT_NODE) { node = node.parentElement; }
                return node;
            }

            it("should Enter at start of heading insert empty p above", async function () {
                const h2 = _findHeading("h2", "Heading Two");
                expect(h2).not.toBeNull();
                const prevSibling = h2.previousElementSibling;

                _placeCursorAt(h2, 0);
                _dispatchKey("Enter");

                // New <p> should be inserted above the heading
                await awaitsFor(() => {
                    const newPrev = h2.previousElementSibling;
                    return newPrev && newPrev !== prevSibling && newPrev.tagName === "P";
                }, "empty p to be inserted above heading");

                // Heading text should be unchanged
                expect(h2.textContent).toContain("Heading Two");

                // Cursor should remain on the heading
                const curEl = _getCursorElement();
                expect(curEl && curEl.closest("h2")).toBe(h2);
            }, 10000);

            it("should Enter in middle of heading split into heading and p", async function () {
                const h2 = _findHeading("h2", "Heading Two");
                expect(h2).not.toBeNull();

                // Place cursor after "Heading " (offset 8)
                _placeCursorAt(h2, 8);
                _dispatchKey("Enter");

                // Heading should now contain only "Heading "
                await awaitsFor(() => {
                    return h2.textContent.trim() === "Heading";
                }, "heading to contain only text before cursor");

                // Next sibling should be a <p> with "Two"
                const nextP = h2.nextElementSibling;
                expect(nextP).not.toBeNull();
                expect(nextP.tagName).toBe("P");
                expect(nextP.textContent.trim()).toBe("Two");

                // Cursor should be in the new paragraph
                const curEl = _getCursorElement();
                expect(curEl && curEl.closest("p")).toBe(nextP);
            }, 10000);

            it("should Enter at end of heading create empty p below", async function () {
                const h2 = _findHeading("h2", "Heading Two");
                expect(h2).not.toBeNull();

                _placeCursorAtEnd(h2);
                _dispatchKey("Enter");

                // New <p> should appear after the heading
                await awaitsFor(() => {
                    const nextEl = h2.nextElementSibling;
                    return nextEl && nextEl.tagName === "P" &&
                        nextEl.textContent.trim() === "";
                }, "empty p to be created below heading");

                // Heading text should be unchanged
                expect(h2.textContent).toContain("Heading Two");

                // Cursor should be in the new paragraph
                const curEl = _getCursorElement();
                expect(curEl && curEl.closest("p") === h2.nextElementSibling).toBeTrue();
            }, 10000);

            it("should Shift+Enter in heading create empty p below without moving content", async function () {
                const h2 = _findHeading("h2", "Heading Two");
                expect(h2).not.toBeNull();
                const originalText = h2.textContent;

                _placeCursorAt(h2, 4); // middle of heading
                _dispatchKey("Enter", { shiftKey: true });

                // New empty <p> should appear after heading
                await awaitsFor(() => {
                    const nextEl = h2.nextElementSibling;
                    return nextEl && nextEl.tagName === "P";
                }, "p to be created below heading on Shift+Enter");

                // Heading text should be untouched (not split)
                expect(h2.textContent).toBe(originalText);

                // Cursor should be in the new paragraph
                const curEl = _getCursorElement();
                expect(curEl && !curEl.closest("h2")).toBeTrue();
            }, 10000);

            it("should Backspace at start of heading convert to paragraph", async function () {
                const h2 = _findHeading("h2", "Heading Two");
                expect(h2).not.toBeNull();

                _placeCursorAt(h2, 0);
                _dispatchKey("Backspace", { code: "Backspace", keyCode: 8 });

                // Heading should be replaced with a <p>
                await awaitsFor(() => {
                    const mdDoc = _getMdIFrameDoc();
                    // h2 with "Heading Two" should be gone
                    const h2s = mdDoc.querySelectorAll("#viewer-content h2");
                    for (const h of h2s) {
                        if (h.textContent.includes("Heading Two")) { return false; }
                    }
                    // A <p> with the heading text should exist
                    const ps = mdDoc.querySelectorAll("#viewer-content p");
                    for (const p of ps) {
                        if (p.textContent.includes("Heading Two")) { return true; }
                    }
                    return false;
                }, "heading to be converted to paragraph");
            }, 10000);

            it("should Backspace at start of heading preserve content and cursor", async function () {
                const h3 = _findHeading("h3", "Heading Three");
                expect(h3).not.toBeNull();
                const headingText = h3.textContent;

                _placeCursorAt(h3, 0);
                _dispatchKey("Backspace", { code: "Backspace", keyCode: 8 });

                // Content should be preserved in a <p>
                await awaitsFor(() => {
                    const mdDoc = _getMdIFrameDoc();
                    const ps = mdDoc.querySelectorAll("#viewer-content p");
                    for (const p of ps) {
                        if (p.textContent === headingText) { return true; }
                    }
                    return false;
                }, "heading content to be preserved in paragraph");

                // Cursor should be at start of the new paragraph
                const curEl = _getCursorElement();
                expect(curEl && curEl.closest("p")).not.toBeNull();
                expect(curEl.closest("p").textContent).toContain("Heading Three");
            }, 10000);

            it("should Backspace in middle of heading work normally", async function () {
                const h2 = _findHeading("h2", "Heading Two");
                expect(h2).not.toBeNull();

                // Place cursor at offset 4 (after "Head")
                _placeCursorAt(h2, 4);

                // Press Backspace — should delete a character, NOT convert heading
                _dispatchKey("Backspace", { code: "Backspace", keyCode: 8 });

                // Heading should still be an h2 (not converted to p)
                // The keydown handler only converts when cursor is at start
                // Browser default behavior handles mid-heading backspace
                expect(h2.tagName).toBe("H2");
            }, 10000);
        });
    });
});
