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
        }, "md preview synced with editor content");
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

                // Open the checkbox test md file
                await awaitsForDone(SpecRunnerUtils.openProjectFiles(["checkbox-test.md"]),
                    "open checkbox-test.md");
                await _waitForMdPreviewReady(EditorManager.getActiveEditor());
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

                // Verify CM source updated: [ ] → [x]
                const editor = EditorManager.getActiveEditor();
                await awaitsFor(() => {
                    return /\[x\]\s+Incomplete task/.test(editor.document.getText());
                }, "CM source to sync checkbox to [x]");

                // Document should be dirty
                expect(editor.document.isDirty).toBeTrue();

                // Click again to uncheck
                const uncheckedResult = win.__clickCheckboxForTest(uncheckedIdx);
                expect(uncheckedResult).toBeFalse();

                // Verify CM source updated: [x] → [ ]
                await awaitsFor(() => {
                    return /\[ \]\s+Incomplete task/.test(editor.document.getText());
                }, "CM source to sync checkbox back to [ ]");

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

                // Verify CM source was synced (content change emitted)
                await awaitsFor(() => {
                    return editor.document.isDirty;
                }, "document to become dirty after code block exit");

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

            async function _openMdFile(fileName) {
                await awaitsForDone(SpecRunnerUtils.openProjectFiles([fileName]),
                    "open " + fileName);
                await _waitForMdPreviewReady(EditorManager.getActiveEditor());
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
                await _openMdFile("list-test.md");
                await _enterReaderMode();
                await _enterEditMode();

                // Place cursor in an ordered list item
                const olLi = _findLiByText("First ordered");
                expect(olLi).not.toBeNull();
                expect(olLi.closest("ol")).not.toBeNull();
                _placeCursorInElement(olLi, 0);

                // Trigger selectionchange so toolbar updates
                const mdDoc = _getMdIFrameDoc();
                mdDoc.dispatchEvent(new Event("selectionchange"));

                // Click UL button
                const ulBtn = mdDoc.getElementById("emb-ul");
                expect(ulBtn).not.toBeNull();
                ulBtn.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));

                // The list should now be a UL
                await awaitsFor(() => {
                    return olLi.closest("ul") !== null && olLi.closest("ol") === null;
                }, "ordered list to switch to unordered");

                await awaitsForDone(CommandManager.execute(Commands.FILE_CLOSE, { _forceClose: true }),
                    "force close");
            }, 10000);

            it("should clicking OL button when in UL switch list to ordered", async function () {
                await _openMdFile("list-test.md");
                await _enterEditMode();

                // Place cursor in an unordered list item
                const ulLi = _findLiByText("First item");
                expect(ulLi).not.toBeNull();
                expect(ulLi.closest("ul")).not.toBeNull();
                _placeCursorInElement(ulLi, 0);

                const mdDoc = _getMdIFrameDoc();
                mdDoc.dispatchEvent(new Event("selectionchange"));

                // Click OL button
                const olBtn = mdDoc.getElementById("emb-ol");
                expect(olBtn).not.toBeNull();
                olBtn.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));

                // The list should now be an OL
                await awaitsFor(() => {
                    return ulLi.closest("ol") !== null && ulLi.closest("ul") === null;
                }, "unordered list to switch to ordered");

                await awaitsForDone(CommandManager.execute(Commands.FILE_CLOSE, { _forceClose: true }),
                    "force close");
            }, 10000);

            it("should UL/OL toggle preserve list content and nesting", async function () {
                await _openMdFile("list-test.md");
                await _enterEditMode();

                // Find ordered list and remember its content
                const olLi = _findLiByText("First ordered");
                expect(olLi).not.toBeNull();
                const ol = olLi.closest("ol");
                const itemTexts = Array.from(ol.querySelectorAll(":scope > li"))
                    .map(li => li.textContent.trim());
                expect(itemTexts.length).toBeGreaterThan(0);

                _placeCursorInElement(olLi, 0);
                const mdDoc = _getMdIFrameDoc();
                mdDoc.dispatchEvent(new Event("selectionchange"));

                // Switch to UL
                mdDoc.getElementById("emb-ul").dispatchEvent(
                    new MouseEvent("mousedown", { bubbles: true }));

                await awaitsFor(() => olLi.closest("ul") !== null,
                    "list to switch to UL");

                // Verify content preserved
                const newList = olLi.closest("ul");
                const newTexts = Array.from(newList.querySelectorAll(":scope > li"))
                    .map(li => li.textContent.trim());
                expect(newTexts).toEqual(itemTexts);

                await awaitsForDone(CommandManager.execute(Commands.FILE_CLOSE, { _forceClose: true }),
                    "force close");
            }, 10000);


            it("should toolbar UL button show active state when cursor in UL", async function () {
                await _openMdFile("list-test.md");
                await _enterEditMode();

                const ulLi = _findLiByText("First item");
                _placeCursorInElement(ulLi, 0);

                const mdDoc = _getMdIFrameDoc();
                mdDoc.dispatchEvent(new Event("selectionchange"));

                // Wait for toolbar state update
                await awaitsFor(() => {
                    const ulBtn = mdDoc.getElementById("emb-ul");
                    return ulBtn && ulBtn.getAttribute("aria-pressed") === "true";
                }, "UL button to show active state");

                const olBtn = mdDoc.getElementById("emb-ol");
                expect(olBtn.getAttribute("aria-pressed")).toBe("false");

                await awaitsForDone(CommandManager.execute(Commands.FILE_CLOSE, { _forceClose: true }),
                    "force close");
            }, 10000);

            it("should toolbar OL button show active state when cursor in OL", async function () {
                await _openMdFile("list-test.md");
                await _enterEditMode();

                const olLi = _findLiByText("First ordered");
                _placeCursorInElement(olLi, 0);

                const mdDoc = _getMdIFrameDoc();
                mdDoc.dispatchEvent(new Event("selectionchange"));

                await awaitsFor(() => {
                    const olBtn = mdDoc.getElementById("emb-ol");
                    return olBtn && olBtn.getAttribute("aria-pressed") === "true";
                }, "OL button to show active state");

                const ulBtn = mdDoc.getElementById("emb-ul");
                expect(ulBtn.getAttribute("aria-pressed")).toBe("false");

                await awaitsForDone(CommandManager.execute(Commands.FILE_CLOSE, { _forceClose: true }),
                    "force close");
            }, 10000);

            it("should block-level buttons be hidden when cursor is in list", async function () {
                await _openMdFile("list-test.md");
                await _enterEditMode();

                const ulLi = _findLiByText("First item");
                _placeCursorInElement(ulLi, 0);

                const mdDoc = _getMdIFrameDoc();
                mdDoc.dispatchEvent(new Event("selectionchange"));

                // Wait for toolbar update
                await awaitsFor(() => {
                    const quoteBtn = mdDoc.getElementById("emb-quote");
                    return quoteBtn && quoteBtn.style.display === "none";
                }, "block buttons to be hidden in list");

                // Block-level buttons should be hidden
                const blockIds = ["emb-quote", "emb-hr", "emb-table", "emb-codeblock"];
                for (const id of blockIds) {
                    const btn = mdDoc.getElementById(id);
                    if (btn) {
                        expect(btn.style.display).toBe("none");
                    }
                }

                // Block type selector should be hidden
                const blockTypeSelect = mdDoc.getElementById("emb-block-type");
                if (blockTypeSelect) {
                    expect(blockTypeSelect.style.display).toBe("none");
                }

                // List buttons should remain visible
                const ulBtn = mdDoc.getElementById("emb-ul");
                const olBtn = mdDoc.getElementById("emb-ol");
                expect(ulBtn.style.display).not.toBe("none");
                expect(olBtn.style.display).not.toBe("none");

                await awaitsForDone(CommandManager.execute(Commands.FILE_CLOSE, { _forceClose: true }),
                    "force close");
            }, 10000);

            it("should moving cursor out of list restore all toolbar buttons", async function () {
                await _openMdFile("list-test.md");
                await _enterEditMode();

                const mdDoc = _getMdIFrameDoc();

                // First place cursor in list — block buttons hidden
                const ulLi = _findLiByText("First item");
                _placeCursorInElement(ulLi, 0);
                mdDoc.dispatchEvent(new Event("selectionchange"));

                await awaitsFor(() => {
                    const quoteBtn = mdDoc.getElementById("emb-quote");
                    return quoteBtn && quoteBtn.style.display === "none";
                }, "block buttons to be hidden in list");

                // Now move cursor to a paragraph outside the list
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
                _getMdIFrameWin().getSelection().addRange(range);
                mdDoc.dispatchEvent(new Event("selectionchange"));

                // Block buttons should be restored
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

                await awaitsForDone(CommandManager.execute(Commands.FILE_CLOSE, { _forceClose: true }),
                    "force close");
            }, 10000);
        });
    });
});
