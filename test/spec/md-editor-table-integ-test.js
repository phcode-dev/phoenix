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

    describe("livepreview:Markdown Editor Table Editing", function () {

        if (Phoenix.browser.desktop.isFirefox ||
            (Phoenix.isTestWindowPlaywright && !Phoenix.browser.desktop.isChromeBased)) {
            it("Markdown table tests are disabled in Firefox/non-Chrome playwright", function () {});
            return;
        }

        const ORIGINAL_TABLE_MD =
            "# Table Test\n\nSome text before the table.\n\n" +
            "| Header One | Header Two | Header Three |\n" +
            "|------------|------------|--------------|\n" +
            "| Cell A1    | Cell A2    | Cell A3      |\n" +
            "| Cell B1    | Cell B2    | Cell B3      |\n" +
            "| Cell C1    | Cell C2    | Cell C3      |\n\n" +
            "A paragraph between tables.\n\n" +
            "| Name   | Value |\n" +
            "|--------|-------|\n" +
            "| Alpha  | 100   |\n" +
            "| Beta   | 200   |\n\n" +
            "Final paragraph after tables.\n";

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

        describe("Table Editing", function () {

            beforeAll(async function () {
                // Reset md state with HTML→MD transition
                await awaitsForDone(SpecRunnerUtils.openProjectFiles(["simple.html"]),
                    "open simple.html to reset md state");
                await awaitsForDone(SpecRunnerUtils.openProjectFiles(["table-test.md"]),
                    "open table-test.md");
                await _waitForMdPreviewReady(EditorManager.getActiveEditor());
                await _enterEditMode();
            }, 15000);

            beforeEach(async function () {
                // Reset CM content to original and wait for viewer to sync
                const editor = EditorManager.getActiveEditor();
                if (editor) {
                    editor.document.setText(ORIGINAL_TABLE_MD);
                    await awaitsFor(() => {
                        const win = _getMdIFrameWin();
                        return win && win.__getCurrentContent &&
                            win.__getCurrentContent() === ORIGINAL_TABLE_MD;
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
                    }, "edit mode to reactivate after reset");
                }
            });

            afterAll(async function () {
                const editor = EditorManager.getActiveEditor();
                if (editor) {
                    editor.document.setText(ORIGINAL_TABLE_MD);
                }
                await awaitsForDone(CommandManager.execute(Commands.FILE_CLOSE, { _forceClose: true }),
                    "force close table-test.md");
            });

            // --- Helper functions ---

            function _getTables() {
                const mdDoc = _getMdIFrameDoc();
                const content = mdDoc && mdDoc.getElementById("viewer-content");
                if (!content) { return []; }
                return Array.from(content.querySelectorAll("table"));
            }

            function _getTableWrappers() {
                const mdDoc = _getMdIFrameDoc();
                const content = mdDoc && mdDoc.getElementById("viewer-content");
                if (!content) { return []; }
                return Array.from(content.querySelectorAll(".table-wrapper"));
            }

            function _getCells(table, selector) {
                return Array.from(table.querySelectorAll(selector || "td, th"));
            }

            function _placeCursorInCell(cell, offset) {
                const mdDoc = _getMdIFrameDoc();
                const win = _getMdIFrameWin();
                const range = mdDoc.createRange();
                const textNode = cell.firstChild && cell.firstChild.nodeType === Node.TEXT_NODE
                    ? cell.firstChild : cell;
                if (textNode.nodeType === Node.TEXT_NODE) {
                    range.setStart(textNode, Math.min(offset || 0, textNode.textContent.length));
                } else {
                    range.setStart(cell, 0);
                }
                range.collapse(true);
                const sel = win.getSelection();
                sel.removeAllRanges();
                sel.addRange(range);
            }

            function _placeCursorAtEndOfCell(cell) {
                const mdDoc = _getMdIFrameDoc();
                const win = _getMdIFrameWin();
                const range = mdDoc.createRange();
                range.selectNodeContents(cell);
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


            // --- Tests (to be filled in) ---

            it("should render tables in viewer from markdown source", async function () {
                const tables = _getTables();
                expect(tables.length).toBe(2);

                // First table: 3 columns, 3 body rows
                const firstTable = tables[0];
                const headers = _getCells(firstTable, "th");
                expect(headers.length).toBe(3);
                expect(headers[0].textContent.trim()).toBe("Header One");

                const bodyRows = firstTable.querySelectorAll("tbody tr");
                expect(bodyRows.length).toBe(3);
            }, 10000);

            it("should Tab navigate to next table cell", async function () {
                const table = _getTables()[0];
                const cells = _getCells(table, "td");
                _placeCursorInCell(cells[0], 0); // Cell A1

                _dispatchKey("Tab", { code: "Tab", keyCode: 9 });

                const curEl = _getCursorElement();
                expect(curEl && curEl.closest("td")).toBe(cells[1]); // Cell A2
            }, 10000);

            it("should Tab at last cell add new row", async function () {
                const table = _getTables()[0];
                const tbody = table.querySelector("tbody");
                const rowsBefore = tbody.querySelectorAll("tr").length;
                const lastCell = tbody.lastElementChild.lastElementChild;
                _placeCursorInCell(lastCell, 0);

                _dispatchKey("Tab", { code: "Tab", keyCode: 9 });

                await awaitsFor(() => {
                    return tbody.querySelectorAll("tr").length > rowsBefore;
                }, "new row to be added by Tab at last cell");
            }, 10000);

            it("should Enter be blocked in table cells", async function () {
                const table = _getTables()[0];
                const cell = _getCells(table, "td")[0];
                const textBefore = cell.textContent;
                _placeCursorInCell(cell, 2);

                _dispatchKey("Enter");

                // Cell content should not have a new paragraph/line break added
                expect(cell.querySelector("p")).toBeNull();
                expect(cell.textContent).toBe(textBefore);
            }, 10000);

            it("should Shift+Enter be blocked in table cells", async function () {
                const table = _getTables()[0];
                const cell = _getCells(table, "td")[0];
                const textBefore = cell.textContent;
                _placeCursorInCell(cell, 2);

                _dispatchKey("Enter", { shiftKey: true });

                expect(cell.textContent).toBe(textBefore);
            }, 10000);

            it("should ArrowDown from last cell exit table to paragraph below", async function () {
                const table = _getTables()[0];
                const tbody = table.querySelector("tbody");
                const lastCell = tbody.lastElementChild.lastElementChild;
                _placeCursorAtEndOfCell(lastCell);

                _dispatchKey("ArrowDown");

                await awaitsFor(() => {
                    const el = _getCursorElement();
                    return el && !el.closest("table");
                }, "cursor to exit table on ArrowDown from last cell");
            }, 10000);

            it("should ArrowRight at end of last cell exit table to paragraph below", async function () {
                const table = _getTables()[0];
                const tbody = table.querySelector("tbody");
                const lastCell = tbody.lastElementChild.lastElementChild;
                _placeCursorAtEndOfCell(lastCell);

                _dispatchKey("ArrowRight");

                await awaitsFor(() => {
                    const el = _getCursorElement();
                    return el && !el.closest("table");
                }, "cursor to exit table on ArrowRight from last cell end");
            }, 10000);

            it("should Enter in last cell exit table to paragraph below", async function () {
                const table = _getTables()[0];
                const tbody = table.querySelector("tbody");
                const lastCell = tbody.lastElementChild.lastElementChild;
                _placeCursorInCell(lastCell, 0);

                _dispatchKey("Enter");

                await awaitsFor(() => {
                    const el = _getCursorElement();
                    return el && !el.closest("table") && el.closest("p");
                }, "cursor to exit table to paragraph on Enter at last cell");
            }, 10000);

            it("should create new paragraph below table if none exists on exit", async function () {
                const tables = _getTables();
                const lastTable = tables[tables.length - 1];
                const wrapper = lastTable.closest(".table-wrapper") || lastTable;

                // Remove everything after the last table
                while (wrapper.nextElementSibling) {
                    wrapper.nextElementSibling.remove();
                }

                const tbody = lastTable.querySelector("tbody");
                const lastCell = tbody.lastElementChild.lastElementChild;
                _placeCursorAtEndOfCell(lastCell);

                _dispatchKey("ArrowDown");

                await awaitsFor(() => {
                    const next = wrapper.nextElementSibling;
                    return next && next.tagName === "P";
                }, "new paragraph to be created below table");
            }, 10000);

            it("should move cursor into existing paragraph below table on exit", async function () {
                const table = _getTables()[0];
                const wrapper = table.closest(".table-wrapper") || table;
                const nextP = wrapper.nextElementSibling;
                expect(nextP).not.toBeNull();
                expect(nextP.tagName).toBe("P");

                const tbody = table.querySelector("tbody");
                const lastCell = tbody.lastElementChild.lastElementChild;
                _placeCursorAtEndOfCell(lastCell);

                _dispatchKey("ArrowDown");

                await awaitsFor(() => {
                    const el = _getCursorElement();
                    return el && el.closest("p") === nextP;
                }, "cursor to move into existing paragraph below table");
            }, 10000);

            it("should block-level format buttons be hidden when cursor in table", async function () {
                const mdDoc = _getMdIFrameDoc();
                const content = mdDoc.getElementById("viewer-content");
                content.focus();

                const table = _getTables()[0];
                const cell = _getCells(table, "td")[0];
                _placeCursorInCell(cell, 0);
                // Dispatch keyup to trigger selection state update via RAF
                // Sync selection state bypassing RAF
                _getMdIFrameWin().__broadcastSelectionStateForTest();

                await awaitsFor(() => {
                    const quoteBtn = mdDoc.getElementById("emb-quote");
                    return quoteBtn && quoteBtn.style.display === "none";
                }, "block buttons to be hidden in table");

                const blockIds = ["emb-quote", "emb-hr", "emb-table", "emb-codeblock"];
                for (const id of blockIds) {
                    const btn = mdDoc.getElementById(id);
                    if (btn) {
                        expect(btn.style.display).toBe("none");
                    }
                }
            }, 10000);

            it("should block type selector be hidden when cursor in table", async function () {
                const mdDoc = _getMdIFrameDoc();
                const content = mdDoc.getElementById("viewer-content");
                content.focus();

                const table = _getTables()[0];
                const cell = _getCells(table, "td")[0];
                _placeCursorInCell(cell, 0);
                // Sync selection state bypassing RAF
                _getMdIFrameWin().__broadcastSelectionStateForTest();

                await awaitsFor(() => {
                    const select = mdDoc.getElementById("emb-block-type");
                    return select && select.style.display === "none";
                }, "block type selector to be hidden in table");
            }, 10000);

            it("should list dropdown groups be hidden when cursor in table", async function () {
                const mdDoc = _getMdIFrameDoc();
                const content = mdDoc.getElementById("viewer-content");
                content.focus();

                const table = _getTables()[0];
                const cell = _getCells(table, "td")[0];
                _placeCursorInCell(cell, 0);
                // Sync selection state bypassing RAF
                _getMdIFrameWin().__broadcastSelectionStateForTest();

                await awaitsFor(() => {
                    const listDropdowns = mdDoc.querySelectorAll('.toolbar-dropdown[data-group="lists"]');
                    return listDropdowns.length > 0 && listDropdowns[0].style.display === "none";
                }, "list dropdowns to be hidden in table");

                const listIds = ["emb-ul", "emb-ol", "emb-task"];
                for (const id of listIds) {
                    const btn = mdDoc.getElementById(id);
                    if (btn) {
                        expect(btn.style.display).toBe("none");
                    }
                }
            }, 10000);

            it("should moving cursor out of table restore all toolbar buttons", async function () {
                const mdDoc = _getMdIFrameDoc();
                const content = mdDoc.getElementById("viewer-content");
                content.focus();

                const table = _getTables()[0];
                const cell = _getCells(table, "td")[0];
                _placeCursorInCell(cell, 0);
                // Sync selection state bypassing RAF
                _getMdIFrameWin().__broadcastSelectionStateForTest();

                await awaitsFor(() => {
                    const quoteBtn = mdDoc.getElementById("emb-quote");
                    return quoteBtn && quoteBtn.style.display === "none";
                }, "block buttons to be hidden in table");

                // Move cursor to paragraph outside table
                const paragraphs = mdDoc.querySelectorAll("#viewer-content > p");
                let targetP = null;
                for (const p of paragraphs) {
                    if (p.textContent.includes("Final paragraph")) {
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
                _getMdIFrameWin().__broadcastSelectionStateForTest();

                await awaitsFor(() => {
                    const quoteBtn = mdDoc.getElementById("emb-quote");
                    return quoteBtn && quoteBtn.style.display !== "none";
                }, "block buttons to be restored outside table");
            }, 10000);

            it("should delete table option appear in right-click context menu", async function () {
                const table = _getTables()[0];
                const cell = _getCells(table, "td")[0];
                _placeCursorInCell(cell, 0);

                const mdDoc = _getMdIFrameDoc();

                // Dispatch contextmenu event on the cell
                cell.dispatchEvent(new MouseEvent("contextmenu", {
                    bubbles: true, clientX: 100, clientY: 100
                }));

                await awaitsFor(() => {
                    const menu = mdDoc.getElementById("table-context-menu");
                    return menu && menu.classList.contains("open");
                }, "table context menu to open");

                const menu = mdDoc.getElementById("table-context-menu");
                const menuItems = menu.querySelectorAll(".table-context-menu-item");
                expect(menuItems.length).toBeGreaterThan(0);
                // Should have destructive items including delete table
                let hasDestructive = false;
                for (const item of menuItems) {
                    if (item.classList.contains("destructive")) {
                        hasDestructive = true;
                    }
                }
                expect(hasDestructive).toBeTrue();

                // Close menu
                mdDoc.dispatchEvent(new MouseEvent("click", { bubbles: true }));
            }, 10000);

            it("should deleting table remove table-wrapper from DOM", async function () {
                const wrappers = _getTableWrappers();
                expect(wrappers.length).toBeGreaterThan(0);
                const firstWrapper = wrappers[0];
                const table = firstWrapper.querySelector("table");
                const cell = _getCells(table, "td")[0];
                _placeCursorInCell(cell, 0);

                // Open context menu and click delete table
                cell.dispatchEvent(new MouseEvent("contextmenu", {
                    bubbles: true, clientX: 100, clientY: 100
                }));

                const mdDoc = _getMdIFrameDoc();
                await awaitsFor(() => {
                    const menu = mdDoc.getElementById("table-context-menu");
                    return menu && menu.classList.contains("open");
                }, "context menu to open");

                // Find and click "Delete table" menu item
                const menu = mdDoc.getElementById("table-context-menu");
                const menuItems = menu.querySelectorAll(".table-context-menu-item");
                // Find the last destructive menu item (Delete table is always last)
                let deleteItem = null;
                for (const item of menuItems) {
                    if (item.classList && item.classList.contains("destructive")) {
                        deleteItem = item;
                    }
                }
                expect(deleteItem).not.toBeNull();
                deleteItem.click();

                // Wrapper should be removed
                await awaitsFor(() => {
                    return !firstWrapper.parentNode;
                }, "table wrapper to be removed from DOM");
            }, 10000);

            it("should deleting table place cursor outside the table", async function () {
                const tables = _getTables();
                expect(tables.length).toBeGreaterThan(0);
                const table = tables[0];
                const wrapper = table.closest(".table-wrapper") || table;
                const tablesBefore = tables.length;

                const cell = _getCells(table, "td")[0];
                _placeCursorInCell(cell, 0);

                // Delete table via context menu
                cell.dispatchEvent(new MouseEvent("contextmenu", {
                    bubbles: true, clientX: 100, clientY: 100
                }));

                const mdDoc = _getMdIFrameDoc();
                await awaitsFor(() => {
                    const menu = mdDoc.getElementById("table-context-menu");
                    return menu && menu.classList.contains("open");
                }, "context menu to open");

                const menu = mdDoc.getElementById("table-context-menu");
                const menuItems = menu.querySelectorAll(".table-context-menu-item");
                let deleteItem = null;
                for (const item of menuItems) {
                    if (item.classList && item.classList.contains("destructive")) {
                        deleteItem = item;
                    }
                }
                deleteItem.click();

                await awaitsFor(() => {
                    return _getTables().length < tablesBefore;
                }, "table to be deleted");

                // Cursor should not be in any table
                const curEl = _getCursorElement();
                if (curEl) {
                    expect(curEl.closest("table")).toBeNull();
                }
            }, 10000);

            it("should deleting last table create new empty paragraph", async function () {
                // Remove all content except the last table
                const mdDoc = _getMdIFrameDoc();
                const content = mdDoc.getElementById("viewer-content");
                const tables = _getTables();
                const lastTable = tables[tables.length - 1];
                const lastWrapper = lastTable.closest(".table-wrapper") || lastTable;

                // Remove everything after the last table
                while (lastWrapper.nextElementSibling) {
                    lastWrapper.nextElementSibling.remove();
                }

                const cell = _getCells(lastTable, "td")[0];
                _placeCursorInCell(cell, 0);

                cell.dispatchEvent(new MouseEvent("contextmenu", {
                    bubbles: true, clientX: 100, clientY: 100
                }));

                await awaitsFor(() => {
                    const menu = mdDoc.getElementById("table-context-menu");
                    return menu && menu.classList.contains("open");
                }, "context menu to open");

                const menu = mdDoc.getElementById("table-context-menu");
                const menuItems = menu.querySelectorAll(".table-context-menu-item");
                // Find the last destructive menu item (Delete table is always last)
                let deleteItem = null;
                for (const item of menuItems) {
                    if (item.classList && item.classList.contains("destructive")) {
                        deleteItem = item;
                    }
                }
                deleteItem.click();

                await awaitsFor(() => !lastWrapper.parentNode, "last table removed");

                // A new empty paragraph should be created
                const lastChild = content.lastElementChild;
                expect(lastChild).not.toBeNull();
                expect(lastChild.tagName).toBe("P");
            }, 10000);

            it("should add-column button be visible when table is active", async function () {
                const mdDoc = _getMdIFrameDoc();
                const content = mdDoc.getElementById("viewer-content");
                content.focus();

                const table = _getTables()[0];
                const wrapper = table.closest(".table-wrapper") || table.parentElement;

                const cell = _getCells(table, "td")[0];
                _placeCursorInCell(cell, 0);
                // Sync selection state bypassing RAF
                _getMdIFrameWin().__broadcastSelectionStateForTest();

                await awaitsFor(() => {
                    return wrapper.classList.contains("table-active");
                }, "table wrapper to become active");

                const addColBtn = wrapper.querySelector(".table-col-add-btn");
                expect(addColBtn).not.toBeNull();
            }, 10000);

            it("should table headers be editable in edit mode", async function () {
                const table = _getTables()[0];
                const headers = _getCells(table, "th");
                expect(headers.length).toBeGreaterThan(0);

                // Headers should be in a contenteditable context
                const content = _getMdIFrameDoc().getElementById("viewer-content");
                expect(content.getAttribute("contenteditable")).toBe("true");

                // Place cursor in header and verify it's focusable
                _placeCursorInCell(headers[0], 0);
                const curEl = _getCursorElement();
                expect(curEl && curEl.closest("th")).toBe(headers[0]);
            }, 10000);
        });
    });
});

