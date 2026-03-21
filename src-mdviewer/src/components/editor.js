// Adapted editor — no save/file I/O, no CM6, no recovery, emits to bridge
import Prism from "prismjs";
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";
import { on, emit } from "../core/events.js";
import { getState, setState } from "../core/state.js";
import { t, tp } from "../core/i18n.js";
import { initFormatBar, destroyFormatBar, focusFormatBar } from "./format-bar.js";
import { initSlashMenu, destroySlashMenu, isSlashMenuVisible } from "./slash-menu.js";
import { initLinkPopover, destroyLinkPopover } from "./link-popover.js";
import { initLangPicker, destroyLangPicker, isLangPickerDropdownOpen } from "./lang-picker.js";
import { highlightCode, renderAfterHTML, normalizeCodeLanguages } from "./viewer.js";
import { initMermaidEditor, destroyMermaidEditor, insertMermaidBlock, attachOverlays } from "./mermaid-editor.js";

const devLog = import.meta.env.DEV ? console.log.bind(console, "[editor]") : () => {};
let turndown = null;
let inputHandler = null;
let codeHighlightTimer = null;
let keydownHandler = null;
let pasteHandler = null;
let checkboxHandler = null;
let selectionHandler = null;
let selectionFallbackMouseUp = null;
let selectionFallbackKeyUp = null;

// Platform detection
export const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
export function isModKey(e) { return isMac ? e.metaKey : e.ctrlKey; }
export const modLabel = isMac ? "Cmd" : "Ctrl";

// ——— Undo / Redo ———
const MAX_UNDO = 200;
const MERGE_INTERVAL = 300;
let undoStack = [];
let redoStack = [];
let lastHTML = "";
let lastCursor = 0;
let beforeInputCursor = 0;
let beforeInputHandler = null;
let lastPushTime = 0;
let lastChangeType = "";
let currentInputType = "";
let isPerformingUndoRedo = false;

function getCursorOffset(el) {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return 0;
    const range = sel.getRangeAt(0);
    const pre = document.createRange();
    pre.setStart(el, 0);
    pre.setEnd(range.startContainer, range.startOffset);
    return pre.toString().length;
}

function restoreCursor(el, offset) {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let remaining = offset;
    let node;
    while ((node = walker.nextNode())) {
        if (remaining <= node.textContent.length) {
            const sel = window.getSelection();
            const r = document.createRange();
            r.setStart(node, remaining);
            r.collapse(true);
            sel.removeAllRanges();
            sel.addRange(r);
            return;
        }
        remaining -= node.textContent.length;
    }
    const sel = window.getSelection();
    if (!sel) return;
    const r = document.createRange();
    r.selectNodeContents(el);
    r.collapse(false);
    sel.removeAllRanges();
    sel.addRange(r);
}

function scrollSelectionIntoView(contentEl) {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (!rect.height && !rect.width) return;

    const ov = getComputedStyle(contentEl).overflowY;
    const viewport = (ov === "auto" || ov === "scroll")
        ? contentEl
        : contentEl.closest(".app-viewer");
    if (!viewport) return;

    const vpRect = viewport.getBoundingClientRect();
    if (rect.top >= vpRect.top && rect.bottom <= vpRect.bottom) return;

    const node = range.startContainer;
    const el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    if (el) el.scrollIntoView({ block: "center" });
}

function changeGroup(inputType) {
    if (inputType.startsWith("insert")) return "insert";
    if (inputType.startsWith("delete")) return "delete";
    return "other";
}

function pushUndoEntry(contentEl, force = false) {
    const html = contentEl.innerHTML;
    if (html === lastHTML) return;
    const now = Date.now();
    const group = changeGroup(currentInputType);
    if (force || group !== lastChangeType || now - lastPushTime > MERGE_INTERVAL || undoStack.length === 0) {
        undoStack.push({ html: lastHTML, cursor: beforeInputCursor });
        if (undoStack.length > MAX_UNDO) undoStack.shift();
        lastPushTime = now;
    }
    lastChangeType = group;
    redoStack = [];
    lastHTML = html;
    lastCursor = getCursorOffset(contentEl);
}

function performUndo(contentEl) {
    if (undoStack.length === 0) return;
    isPerformingUndoRedo = true;
    redoStack.push({ html: lastHTML, cursor: lastCursor });
    const entry = undoStack.pop();
    contentEl.innerHTML = entry.html;
    reattachAllTableHandles(contentEl);
    lastHTML = contentEl.innerHTML;
    lastCursor = entry.cursor;
    contentEl.focus({ preventScroll: true });
    restoreCursor(contentEl, entry.cursor);
    scrollSelectionIntoView(contentEl);
    isPerformingUndoRedo = false;
}

function performRedo(contentEl) {
    if (redoStack.length === 0) return;
    isPerformingUndoRedo = true;
    undoStack.push({ html: lastHTML, cursor: lastCursor });
    const entry = redoStack.pop();
    contentEl.innerHTML = entry.html;
    reattachAllTableHandles(contentEl);
    lastHTML = contentEl.innerHTML;
    lastCursor = entry.cursor;
    contentEl.focus({ preventScroll: true });
    restoreCursor(contentEl, entry.cursor);
    scrollSelectionIntoView(contentEl);
    isPerformingUndoRedo = false;
}

function resetUndoHistory(contentEl) {
    undoStack = [];
    redoStack = [];
    lastHTML = contentEl ? contentEl.innerHTML : "";
    lastCursor = 0;
    beforeInputCursor = 0;
    lastPushTime = 0;
    lastChangeType = "";
    currentInputType = "";
}

export function flushSnapshot(contentEl) {
    if (contentEl) {
        pushUndoEntry(contentEl, true);
        lastPushTime = 0;
    }
}

// ——— Selection utilities ———

export function getSelectionRect() {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return null;
    const range = sel.getRangeAt(0);
    let rect = range.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
        const span = document.createElement("span");
        span.textContent = "\u200b";
        range.insertNode(span);
        rect = span.getBoundingClientRect();
        span.parentNode.removeChild(span);
        sel.removeAllRanges();
        sel.addRange(range);
    }
    return rect;
}

function getBlockType() {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return "P";
    let node = sel.anchorNode;
    const blockTags = new Set(["H1", "H2", "H3", "H4", "H5", "H6", "P", "BLOCKQUOTE", "PRE", "LI"]);
    while (node) {
        if (node.nodeType === 1 && blockTags.has(node.tagName)) {
            return node.tagName;
        }
        node = node.parentNode;
    }
    return "P";
}

function isInsideTag(tag) {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return false;
    let node = sel.anchorNode;
    while (node) {
        if (node.nodeType === 1 && node.tagName === tag) return true;
        node = node.parentNode;
    }
    return false;
}

// ——— Selection state broadcasting ———

let rafId = null;

function broadcastSelectionState() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
        rafId = null;
        const state = {
            bold: document.queryCommandState("bold"),
            italic: document.queryCommandState("italic"),
            strikethrough: document.queryCommandState("strikethrough"),
            underline: document.queryCommandState("underline"),
            unorderedList: document.queryCommandState("insertUnorderedList"),
            orderedList: document.queryCommandState("insertOrderedList"),
            blockType: getBlockType(),
            isLink: isInsideTag("A"),
            isCode: isInsideTag("CODE")
        };
        emit("editor:selection-state", state);

        const ctxMenu = document.getElementById("table-context-menu");
        if (ctxMenu && ctxMenu.classList.contains("open")) return;

        const contentEl = document.getElementById("viewer-content");
        if (contentEl) {
            const inTable = isInsideTag("TABLE");
            contentEl.querySelectorAll(".table-wrapper.table-active").forEach((w) => {
                w.classList.remove("table-active");
            });
            if (inTable) {
                const sel2 = window.getSelection();
                if (sel2 && sel2.anchorNode) {
                    let tableEl = sel2.anchorNode;
                    while (tableEl && tableEl !== contentEl && tableEl.tagName !== "TABLE") tableEl = tableEl.parentNode;
                    if (tableEl && tableEl.tagName === "TABLE") {
                        let wp = tableEl.parentElement;
                        if (!wp || !wp.classList.contains("table-wrapper")) {
                            wp = document.createElement("div");
                            wp.className = "table-wrapper";
                            tableEl.parentNode.insertBefore(wp, tableEl);
                            wp.appendChild(tableEl);
                        }
                        wp.classList.add("table-active");
                        attachTableHandles(wp);
                    }
                }
            }
        }
    });
}

// ——— Formatting engine ———

export function executeFormat(contentEl, command, value) {
    contentEl.focus({ preventScroll: true });

    switch (command) {
        case "bold":
        case "italic":
        case "strikethrough":
        case "underline":
            document.execCommand(command, false, null);
            break;
        case "formatBlock":
            document.execCommand("formatBlock", false, value);
            break;
        case "createLink": {
            if (value) {
                document.execCommand("createLink", false, value);
            } else {
                emit("action:show-link-input");
            }
            break;
        }
        case "insertUnorderedList":
        case "insertOrderedList":
        case "insertHorizontalRule":
            document.execCommand(command, false, null);
            break;
        case "code":
            toggleInlineCode();
            break;
        case "taskList":
            insertTaskList(contentEl);
            break;
        case "codeBlock":
            insertCodeBlock(contentEl);
            break;
        case "table":
            insertTable(contentEl);
            break;
        case "mermaidBlock":
            insertMermaidBlock(contentEl);
            break;
    }

    broadcastSelectionState();
}

function toggleInlineCode() {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);

    let codeNode = null;
    let node = sel.anchorNode;
    while (node) {
        if (node.nodeType === 1 && node.tagName === "CODE" && !node.closest("pre")) {
            codeNode = node;
            break;
        }
        node = node.parentNode;
    }

    if (codeNode) {
        const text = document.createTextNode(codeNode.textContent);
        codeNode.parentNode.replaceChild(text, codeNode);
        const r = document.createRange();
        r.selectNodeContents(text);
        sel.removeAllRanges();
        sel.addRange(r);
    } else if (!range.collapsed) {
        const code = document.createElement("code");
        try {
            range.surroundContents(code);
        } catch {
            const fragment = range.extractContents();
            code.appendChild(fragment);
            range.insertNode(code);
        }
        sel.removeAllRanges();
        const r = document.createRange();
        r.selectNodeContents(code);
        sel.addRange(r);
    }
}

function insertTaskList(contentEl) {
    const html =
        '<ul class="contains-task-list">' +
        '<li class="task-list-item"><input type="checkbox" class="task-list-item-checkbox"> </li>' +
        "</ul>";
    document.execCommand("insertHTML", false, html);
}

function insertCodeBlock(contentEl) {
    const html = '<pre data-language=""><code>\n</code></pre><p><br></p>';
    document.execCommand("insertHTML", false, html);
    requestAnimationFrame(() => {
        const pre = contentEl.querySelector("pre:last-of-type code");
        if (pre) {
            const sel = window.getSelection();
            const r = document.createRange();
            r.setStart(pre, 0);
            r.collapse(true);
            sel.removeAllRanges();
            sel.addRange(r);
        }
    });
}

// ——— Table editing helpers ———

function getTableContext() {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return null;
    let node = sel.anchorNode;
    let td = null, tr = null, table = null;
    while (node) {
        if (node.nodeType === 1) {
            if (!td && (node.tagName === "TD" || node.tagName === "TH")) td = node;
            if (!tr && node.tagName === "TR") tr = node;
            if (!table && node.tagName === "TABLE") { table = node; break; }
        }
        node = node.parentNode;
    }
    if (!table || !tr || !td) return null;
    const rowIdx = [...tr.parentNode.children].indexOf(tr);
    const colIdx = [...tr.children].indexOf(td);
    return { table, tr, td, rowIdx, colIdx };
}

function addTableRow(table, afterRow, beforeRow) {
    const tbody = table.querySelector("tbody") || table;
    const refRow = afterRow || beforeRow || tbody.lastElementChild;
    const colCount = refRow ? refRow.children.length : 3;
    const newRow = document.createElement("tr");
    for (let i = 0; i < colCount; i++) {
        const td = document.createElement("td");
        td.innerHTML = "&nbsp;";
        newRow.appendChild(td);
    }
    if (beforeRow) {
        beforeRow.parentNode.insertBefore(newRow, beforeRow);
    } else if (afterRow && afterRow.nextSibling) {
        afterRow.parentNode.insertBefore(newRow, afterRow.nextSibling);
    } else {
        tbody.appendChild(newRow);
    }
    const firstCell = newRow.firstElementChild;
    focusCell(firstCell);
    return newRow;
}

function addTableColumn(table, afterColIdx) {
    const rows = table.querySelectorAll("tr");
    const insertIdx = afterColIdx != null ? afterColIdx + 1 : (rows[0]?.children.length || 0);
    rows.forEach((row) => {
        const isHeader = row.parentElement.tagName === "THEAD";
        const cell = document.createElement(isHeader ? "th" : "td");
        cell.innerHTML = isHeader ? t("table.header") : "&nbsp;";
        const refCell = row.children[insertIdx];
        if (refCell) {
            row.insertBefore(cell, refCell);
        } else {
            row.appendChild(cell);
        }
    });
}

function deleteTableRow(table, tr) {
    if (tr.parentElement.tagName === "THEAD") return;
    const tbody = table.querySelector("tbody");
    if (tbody && tbody.children.length <= 1) return;
    tr.remove();
}

function deleteTableColumn(table, colIdx) {
    const rows = table.querySelectorAll("tr");
    if (rows[0] && rows[0].children.length <= 1) return;
    rows.forEach((row) => {
        const cell = row.children[colIdx];
        if (cell) cell.remove();
    });
}

function focusCell(cell) {
    if (!cell) return;
    const range = document.createRange();
    range.selectNodeContents(cell);
    range.collapse(true);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
}

function dispatchInputEvent(el) {
    el.dispatchEvent(new Event("input", { bubbles: true }));
}

// ——— Table handle buttons (Coda-style) ———

function rebuildHandles(wrapper, table, rowHandles, colHandles, addColBtn) {
    rowHandles.innerHTML = "";
    colHandles.innerHTML = "";

    const rows = table.querySelectorAll("tr");
    const contentEl = document.getElementById("viewer-content");

    rows.forEach((row, idx) => {
        const btn = document.createElement("button");
        btn.className = "table-row-handle";
        btn.dataset.row = idx;
        btn.textContent = "\u22EE\u22EE";
        btn.setAttribute("aria-label", tp("table.row_options", { n: idx + 1 }));
        btn.style.height = row.offsetHeight + "px";
        btn.addEventListener("mousedown", (e) => {
            e.preventDefault();
            e.stopPropagation();
            const isHeader = row.parentElement.tagName === "THEAD";
            showHandleMenu(e.currentTarget, "row", { table, tr: row, rowIdx: idx, isHeader }, contentEl, wrapper, e.clientX);
        });
        btn.addEventListener("click", (e) => e.stopPropagation());
        rowHandles.appendChild(btn);
    });

    const firstRow = rows[0];
    if (firstRow) {
        Array.from(firstRow.children).forEach((cell, idx) => {
            const btn = document.createElement("button");
            btn.className = "table-col-handle";
            btn.dataset.col = idx;
            btn.textContent = "\u22EE\u22EE";
            btn.setAttribute("aria-label", tp("table.col_options", { n: idx + 1 }));
            btn.style.width = cell.offsetWidth + "px";
            btn.addEventListener("mousedown", (e) => {
                e.preventDefault();
                e.stopPropagation();
                showHandleMenu(e.currentTarget, "col", { table, colIdx: idx }, contentEl, wrapper, e.clientX);
            });
            btn.addEventListener("click", (e) => e.stopPropagation());
            colHandles.appendChild(btn);
        });
    }

    colHandles.appendChild(addColBtn);
}

function showHandleMenu(anchor, type, ctx, contentEl, wrapper, clickX) {
    const menu = document.getElementById("table-context-menu");
    if (!menu) return;

    let items;
    if (type === "row") {
        items = [
            { label: t("table.insert_row_above"), action: () => { flushSnapshot(contentEl); addTableRow(ctx.table, null, ctx.tr); dispatchInputEvent(contentEl); } },
            { label: t("table.insert_row_below"), action: () => { flushSnapshot(contentEl); addTableRow(ctx.table, ctx.tr); dispatchInputEvent(contentEl); } },
            { divider: true },
            { label: t("table.delete_row"), destructive: true, disabled: ctx.isHeader, action: () => { flushSnapshot(contentEl); deleteTableRow(ctx.table, ctx.tr); dispatchInputEvent(contentEl); } }
        ];
    } else {
        items = [
            { label: t("table.insert_col_left"), action: () => { flushSnapshot(contentEl); addTableColumn(ctx.table, ctx.colIdx - 1); dispatchInputEvent(contentEl); } },
            { label: t("table.insert_col_right"), action: () => { flushSnapshot(contentEl); addTableColumn(ctx.table, ctx.colIdx); dispatchInputEvent(contentEl); } },
            { divider: true },
            { label: t("table.delete_col"), destructive: true, action: () => { flushSnapshot(contentEl); deleteTableColumn(ctx.table, ctx.colIdx); dispatchInputEvent(contentEl); } }
        ];
    }

    menu.innerHTML = "";
    items.forEach((item) => {
        if (item.divider) {
            const div = document.createElement("div");
            div.className = "table-context-menu-divider";
            menu.appendChild(div);
            return;
        }
        const btn = document.createElement("button");
        btn.className = "table-context-menu-item" + (item.destructive ? " destructive" : "");
        btn.textContent = item.label;
        if (item.disabled) {
            btn.disabled = true;
            btn.style.opacity = "0.4";
            btn.style.cursor = "default";
        }
        btn.addEventListener("click", () => {
            hideTableContextMenu();
            if (!item.disabled) {
                item.action();
                const table = wrapper.querySelector("table");
                if (table) {
                    const rh = wrapper.querySelector(".table-row-handles");
                    const ch = wrapper.querySelector(".table-col-handles");
                    const acb = wrapper.querySelector(".table-col-add-btn");
                    if (rh && ch && acb) rebuildHandles(wrapper, table, rh, ch, acb);
                    const sel = window.getSelection();
                    if (!sel || !sel.anchorNode || !table.contains(sel.anchorNode)) {
                        const cell = table.querySelector("td") || table.querySelector("th");
                        if (cell) focusCell(cell);
                    }
                }
                wrapper.classList.add("table-active");
            }
        });
        menu.appendChild(btn);
    });

    const anchorRect = anchor.getBoundingClientRect();
    if (type === "row") {
        menu.style.left = anchorRect.right + 4 + "px";
        menu.style.top = anchorRect.top + "px";
    } else {
        menu.style.left = (clickX ?? anchorRect.left) + "px";
        menu.style.top = anchorRect.bottom + 4 + "px";
    }
    menu.classList.add("open");
    menu.dataset.openedAt = Date.now();

    requestAnimationFrame(() => {
        const rect = menu.getBoundingClientRect();
        if (rect.right > window.innerWidth) {
            menu.style.left = Math.max(0, window.innerWidth - rect.width - 4) + "px";
        }
        if (rect.bottom > window.innerHeight) {
            menu.style.top = Math.max(0, window.innerHeight - rect.height - 4) + "px";
        }
    });
}

function attachTableHandles(wrapper) {
    const table = wrapper.querySelector("table");
    if (!table || wrapper.querySelector(".table-row-handles")) return;

    const rowHandles = document.createElement("div");
    rowHandles.className = "table-row-handles";
    rowHandles.contentEditable = "false";

    const colHandles = document.createElement("div");
    colHandles.className = "table-col-handles";
    colHandles.contentEditable = "false";

    const addRowBar = document.createElement("button");
    addRowBar.className = "table-add-row-btn";
    addRowBar.textContent = t("table.new_row");
    addRowBar.contentEditable = "false";

    const addColBtn = document.createElement("button");
    addColBtn.className = "table-col-add-btn";
    addColBtn.textContent = "+";
    addColBtn.contentEditable = "false";

    rebuildHandles(wrapper, table, rowHandles, colHandles, addColBtn);

    wrapper.appendChild(rowHandles);
    wrapper.appendChild(colHandles);
    wrapper.appendChild(addRowBar);

    addRowBar.addEventListener("mousedown", (e) => {
        e.preventDefault();
        const contentEl = document.getElementById("viewer-content");
        flushSnapshot(contentEl);
        addTableRow(table, null);
        dispatchInputEvent(contentEl);
        rebuildHandles(wrapper, table, rowHandles, colHandles, addColBtn);
    });

    addColBtn.addEventListener("mousedown", (e) => {
        e.preventDefault();
        const contentEl = document.getElementById("viewer-content");
        flushSnapshot(contentEl);
        addTableColumn(table, null);
        dispatchInputEvent(contentEl);
        rebuildHandles(wrapper, table, rowHandles, colHandles, addColBtn);
    });
}

// ——— Table context menu ———

let tableContextMenuCleanup = null;

function hideTableContextMenu() {
    const menu = document.getElementById("table-context-menu");
    if (menu) menu.classList.remove("open");
}

function setupTableContextMenu(contentEl) {
    const contextHandler = (e) => {
        const td = e.target.closest("td, th");
        if (!td || !contentEl.contains(td)) return;
        const ctx = getTableContext();
        if (!ctx) return;
        e.preventDefault();
        e.stopPropagation();
        showTableContextMenu(e.clientX, e.clientY, ctx, contentEl);
    };

    const closeHandler = (e) => {
        const menu = document.getElementById("table-context-menu");
        if (!menu || !menu.classList.contains("open")) return;
        if (menu.contains(e.target)) return;
        if (e.target.closest(".table-row-handle, .table-col-handle")) return;
        hideTableContextMenu();
    };

    const escHandler = (e) => {
        if (e.key === "Escape") hideTableContextMenu();
    };

    const scrollHandler = () => {
        const menu = document.getElementById("table-context-menu");
        if (menu && menu.dataset.openedAt && Date.now() - parseInt(menu.dataset.openedAt) < 300) return;
        hideTableContextMenu();
    };

    contentEl.addEventListener("contextmenu", contextHandler);
    document.addEventListener("click", closeHandler);
    document.addEventListener("touchstart", closeHandler);
    document.addEventListener("keydown", escHandler);
    contentEl.addEventListener("scroll", scrollHandler);

    tableContextMenuCleanup = () => {
        contentEl.removeEventListener("contextmenu", contextHandler);
        document.removeEventListener("click", closeHandler);
        document.removeEventListener("touchstart", closeHandler);
        document.removeEventListener("keydown", escHandler);
        contentEl.removeEventListener("scroll", scrollHandler);
        hideTableContextMenu();
        tableContextMenuCleanup = null;
    };
}

function showTableContextMenu(x, y, ctx, contentEl) {
    const menu = document.getElementById("table-context-menu");
    if (!menu) return;

    const items = [
        { label: t("table.add_row_above"), action: () => { flushSnapshot(contentEl); addTableRow(ctx.table, null, ctx.tr); dispatchInputEvent(contentEl); } },
        { label: t("table.add_row_below"), action: () => { flushSnapshot(contentEl); addTableRow(ctx.table, ctx.tr); dispatchInputEvent(contentEl); } },
        { label: t("table.add_col_left"), action: () => { flushSnapshot(contentEl); addTableColumn(ctx.table, ctx.colIdx - 1); dispatchInputEvent(contentEl); } },
        { label: t("table.add_col_right"), action: () => { flushSnapshot(contentEl); addTableColumn(ctx.table, ctx.colIdx); dispatchInputEvent(contentEl); } },
        { divider: true },
        { label: t("table.delete_row"), destructive: true, action: () => { flushSnapshot(contentEl); deleteTableRow(ctx.table, ctx.tr); dispatchInputEvent(contentEl); } },
        { label: t("table.delete_col"), destructive: true, action: () => { flushSnapshot(contentEl); deleteTableColumn(ctx.table, ctx.colIdx); dispatchInputEvent(contentEl); } }
    ];

    menu.innerHTML = "";
    items.forEach((item) => {
        if (item.divider) {
            const div = document.createElement("div");
            div.className = "table-context-menu-divider";
            menu.appendChild(div);
            return;
        }
        const btn = document.createElement("button");
        btn.className = "table-context-menu-item" + (item.destructive ? " destructive" : "");
        btn.textContent = item.label;
        btn.addEventListener("click", () => {
            hideTableContextMenu();
            item.action();
            const wp = ctx.table.closest(".table-wrapper");
            if (wp) {
                const table = wp.querySelector("table");
                if (table) {
                    const rh = wp.querySelector(".table-row-handles");
                    const ch = wp.querySelector(".table-col-handles");
                    const acb = wp.querySelector(".table-col-add-btn");
                    if (rh && ch && acb) rebuildHandles(wp, table, rh, ch, acb);
                    const sel = window.getSelection();
                    if (!sel || !sel.anchorNode || !table.contains(sel.anchorNode)) {
                        const cell = table.querySelector("td") || table.querySelector("th");
                        if (cell) focusCell(cell);
                    }
                }
                wp.classList.add("table-active");
            }
        });
        menu.appendChild(btn);
    });

    menu.style.left = x + "px";
    menu.style.top = y + "px";
    menu.classList.add("open");
    menu.dataset.openedAt = Date.now();

    requestAnimationFrame(() => {
        const rect = menu.getBoundingClientRect();
        if (rect.right > window.innerWidth) {
            menu.style.left = Math.max(0, window.innerWidth - rect.width - 4) + "px";
        }
        if (rect.bottom > window.innerHeight) {
            menu.style.top = Math.max(0, window.innerHeight - rect.height - 4) + "px";
        }
    });
}

function reattachAllTableHandles(contentEl) {
    contentEl.querySelectorAll(".table-row-handles, .table-col-handles, .table-add-row-btn, .table-col-add-btn").forEach(el => el.remove());
    contentEl.querySelectorAll(":scope > table").forEach((table) => {
        const wrapper = document.createElement("div");
        wrapper.className = "table-wrapper";
        table.parentNode.insertBefore(wrapper, table);
        wrapper.appendChild(table);
    });
    contentEl.querySelectorAll(".table-wrapper").forEach(attachTableHandles);
}

function wrapAndAttachTables(contentEl) {
    contentEl.querySelectorAll(":scope > table").forEach((table) => {
        const wrapper = document.createElement("div");
        wrapper.className = "table-wrapper";
        table.parentNode.insertBefore(wrapper, table);
        wrapper.appendChild(table);
        if (getState().editMode) {
            attachTableHandles(wrapper);
        }
    });
}

function insertTable(contentEl) {
    const hdr = t("table.header");
    const html =
        "<table>" +
        `<thead><tr><th>${hdr}</th><th>${hdr}</th><th>${hdr}</th></tr></thead>` +
        "<tbody>" +
        "<tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>" +
        "<tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>" +
        "</tbody>" +
        "</table><p><br></p>";
    document.execCommand("insertHTML", false, html);
}

// ——— Clipboard sanitization ———

const ALLOWED_TAGS = new Set([
    "STRONG", "EM", "B", "I", "A", "UL", "OL", "LI",
    "H1", "H2", "H3", "H4", "H5", "H6", "P", "BLOCKQUOTE",
    "CODE", "PRE", "TABLE", "TR", "TD", "TH", "THEAD", "TBODY",
    "BR", "HR", "IMG", "DEL", "S", "INPUT", "DIV"
]);

function sanitizePastedHTML(html) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    doc.querySelectorAll("o\\:p, style, script, meta, link, xml").forEach((el) => el.remove());

    function walk(node) {
        if (node.nodeType === 3) return;
        if (node.nodeType !== 1) {
            node.remove();
            return;
        }

        node.removeAttribute("style");
        node.removeAttribute("class");
        const tag = node.tagName;
        if (tag !== "A" && tag !== "IMG") {
            const attrs = Array.from(node.attributes);
            for (const attr of attrs) {
                if (tag === "INPUT" && (attr.name === "type" || attr.name === "checked")) continue;
                if (tag === "PRE" && attr.name === "data-language") continue;
                if (attr.name === "href" || attr.name === "src" || attr.name === "alt") continue;
                node.removeAttribute(attr.name);
            }
        }

        if (!ALLOWED_TAGS.has(tag)) {
            const parent = node.parentNode;
            while (node.firstChild) {
                parent.insertBefore(node.firstChild, node);
            }
            parent.removeChild(node);
            return;
        }

        const children = Array.from(node.childNodes);
        for (const child of children) {
            walk(child);
        }
    }

    const body = doc.body;
    const children = Array.from(body.childNodes);
    for (const child of children) {
        walk(child);
    }

    return body.innerHTML;
}

function handlePaste(e, contentEl) {
    const mod = isModKey(e);

    if (mod && e.shiftKey) {
        e.preventDefault();
        const text = e.clipboardData.getData("text/plain");
        document.execCommand("insertText", false, text);
        return;
    }

    const sel = window.getSelection();
    if (sel && !sel.isCollapsed) {
        const text = e.clipboardData.getData("text/plain").trim();
        if (/^https?:\/\/\S+$/.test(text)) {
            e.preventDefault();
            document.execCommand("createLink", false, text);
            return;
        }
    }

    const html = e.clipboardData.getData("text/html");
    if (html) {
        e.preventDefault();
        const clean = sanitizePastedHTML(html);
        document.execCommand("insertHTML", false, clean);
    }
}

// ——— Markdown auto-shortcuts ———

function getTextInBlockBeforeCaret(contentEl) {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return { text: "", block: null };
    const range = sel.getRangeAt(0);
    let block = range.startContainer;
    const blockTags = new Set(["P", "DIV", "H1", "H2", "H3", "H4", "H5", "H6", "LI", "BLOCKQUOTE", "PRE"]);
    while (block && block !== contentEl) {
        if (block.nodeType === 1 && blockTags.has(block.tagName)) break;
        block = block.parentNode;
    }
    if (!block || block === contentEl) {
        block = range.startContainer;
        if (block.nodeType === 3) block = block.parentNode;
    }

    const preRange = document.createRange();
    preRange.setStart(block, 0);
    preRange.setEnd(range.startContainer, range.startOffset);
    return { text: preRange.toString(), block };
}

function deleteTextBeforeCaret(contentEl, count) {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    for (let i = 0; i < count; i++) {
        sel.modify("extend", "backward", "character");
    }
    document.execCommand("delete", false, null);
}

function handleMarkdownShortcutOnSpace(e, contentEl) {
    const { text, block } = getTextInBlockBeforeCaret(contentEl);
    if (!text) return false;

    const patterns = [
        { regex: /^#$/, command: "formatBlock", value: "<h1>" },
        { regex: /^##$/, command: "formatBlock", value: "<h2>" },
        { regex: /^###$/, command: "formatBlock", value: "<h3>" },
        { regex: /^[-*]$/, command: "insertUnorderedList" },
        { regex: /^1\.$/, command: "insertOrderedList" },
        { regex: /^>$/, command: "formatBlock", value: "<blockquote>" },
        { regex: /^\[\s?\]$/, command: "taskList" }
    ];

    for (const pat of patterns) {
        if (pat.regex.test(text.trim())) {
            e.preventDefault();
            deleteTextBeforeCaret(contentEl, text.length);
            flushSnapshot(contentEl);
            executeFormat(contentEl, pat.command, pat.value);
            contentEl.dispatchEvent(new Event("input", { bubbles: true }));
            return true;
        }
    }
    return false;
}

function handleMarkdownShortcutOnEnter(e, contentEl) {
    const { text, block } = getTextInBlockBeforeCaret(contentEl);
    if (!text) return false;
    const trimmed = text.trim();

    if (trimmed === "---" || trimmed === "***" || trimmed === "___") {
        e.preventDefault();
        deleteTextBeforeCaret(contentEl, text.length);
        flushSnapshot(contentEl);
        executeFormat(contentEl, "insertHorizontalRule");
        contentEl.dispatchEvent(new Event("input", { bubbles: true }));
        return true;
    }

    if (trimmed === "```") {
        e.preventDefault();
        deleteTextBeforeCaret(contentEl, text.length);
        flushSnapshot(contentEl);
        executeFormat(contentEl, "codeBlock");
        contentEl.dispatchEvent(new Event("input", { bubbles: true }));
        return true;
    }

    return false;
}

// ——— Turndown ———

function createTurndown() {
    const td = new TurndownService({
        headingStyle: "atx",
        codeBlockStyle: "fenced",
        emDelimiter: "*",
        bulletListMarker: "-",
        hr: "---"
    });

    td.use(gfm);

    td.addRule("tableWrapper", {
        filter(node) {
            return node.nodeName === "DIV" && node.classList.contains("table-wrapper");
        },
        replacement(content) {
            return content;
        }
    });

    td.addRule("tableHandles", {
        filter(node) {
            if (node.nodeName === "DIV" && (node.classList.contains("table-row-handles") || node.classList.contains("table-col-handles"))) return true;
            if (node.nodeName === "BUTTON" && (node.classList.contains("table-add-row-btn") || node.classList.contains("table-col-add-btn"))) return true;
            return false;
        },
        replacement() { return ""; }
    });

    td.addRule("copyButtons", {
        filter(node) {
            return node.nodeName === "BUTTON" && node.classList.contains("code-copy-btn");
        },
        replacement() { return ""; }
    });

    td.addRule("mermaidDiagram", {
        filter(node) {
            return node.nodeName === "DIV" && node.classList.contains("mermaid-diagram")
                && node.hasAttribute("data-mermaid-source");
        },
        replacement(content, node) {
            const source = node.getAttribute("data-mermaid-source");
            return "\n\n```mermaid\n" + source + "\n```\n\n";
        }
    });

    td.addRule("mermaidInternals", {
        filter(node) {
            return (node.classList && (
                node.classList.contains("mermaid-skeleton") ||
                node.classList.contains("mermaid-error-message") ||
                node.classList.contains("mermaid-error-source")
            ));
        },
        replacement() { return ""; }
    });

    td.addRule("mermaidEditorUI", {
        filter(node) {
            return (node.classList && (
                node.classList.contains("mermaid-editor-toolbar") ||
                node.classList.contains("mermaid-source-editor") ||
                node.classList.contains("mermaid-error-bar") ||
                node.classList.contains("mermaid-preview") ||
                node.classList.contains("mermaid-edit-overlay")
            ));
        },
        replacement() { return ""; }
    });

    td.addRule("fencedCodeWithLanguage", {
        filter(node) {
            return node.nodeName === "PRE" && node.querySelector("code") !== null;
        },
        replacement(content, node) {
            const code = node.querySelector("code");
            const lang = node.getAttribute("data-language") || "";
            const text = code.textContent || "";
            const normalizedText = text.endsWith("\n") ? text : text + "\n";
            return "\n\n```" + lang + "\n" + normalizedText + "```\n\n";
        }
    });

    td.addRule("githubAlerts", {
        filter(node) {
            return node.nodeName === "DIV" && node.classList.contains("markdown-alert");
        },
        replacement(content, node) {
            const classes = Array.from(node.classList);
            const typeClass = classes.find(c => c.startsWith("markdown-alert-") && c !== "markdown-alert");
            const type = typeClass ? typeClass.replace("markdown-alert-", "").toUpperCase() : "NOTE";

            const titleEl = node.querySelector(".markdown-alert-title");
            const bodyParts = [];
            let sibling = titleEl ? titleEl.nextElementSibling : node.firstElementChild;
            while (sibling) {
                bodyParts.push(td.turndown(sibling.innerHTML));
                sibling = sibling.nextElementSibling;
            }

            const body = bodyParts.join("\n>\n> ");
            const lines = body ? `> [!${type}]\n> ${body}` : `> [!${type}]`;
            return "\n\n" + lines + "\n\n";
        }
    });

    td.addRule("taskListCheckbox", {
        filter(node) {
            return node.nodeName === "INPUT" &&
                node.getAttribute("type") === "checkbox" &&
                node.closest("li") !== null;
        },
        replacement(content, node) {
            return node.checked ? "[x] " : "[ ] ";
        }
    });

    return td;
}

/**
 * Convert the viewer content element to markdown using Turndown.
 * Works on a clone to avoid mutating the live DOM.
 */
export function convertToMarkdown(contentEl) {
    // Sync checkbox checked property → attribute before cloning,
    // because cloneNode copies attributes but not DOM properties.
    contentEl.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        if (cb.checked) {
            cb.setAttribute("checked", "");
        } else {
            cb.removeAttribute("checked");
        }
    });
    const clone = contentEl.cloneNode(true);
    clone.querySelectorAll(".code-copy-btn").forEach((btn) => btn.remove());
    clone.querySelectorAll(".table-row-handles, .table-col-handles, .table-add-row-btn, .table-col-add-btn").forEach((el) => el.remove());
    clone.querySelectorAll(".mermaid-editor-toolbar, .mermaid-source-editor, .mermaid-error-bar, .mermaid-edit-overlay").forEach((el) => el.remove());
    clone.querySelectorAll("mark[data-markjs]").forEach((mark) => {
        const parent = mark.parentNode;
        parent.replaceChild(document.createTextNode(mark.textContent), mark);
        parent.normalize();
    });
    return turndown.turndown(clone.innerHTML);
}

// Debounced content change emitter for bridge
let contentChangeTimer = null;
const CONTENT_CHANGE_DEBOUNCE = 300;

function emitContentChange(contentEl) {
    clearTimeout(contentChangeTimer);
    contentChangeTimer = setTimeout(() => {
        const markdown = convertToMarkdown(contentEl);
        emit("bridge:contentChanged", { markdown });
    }, CONTENT_CHANGE_DEBOUNCE);
}

export function initEditor() {
    turndown = createTurndown();

    const content = document.getElementById("viewer-content");

    on("state:editMode", (editing) => {
        if (editing) {
            enterEditMode(content);
        } else {
            cleanupEditMode(content);
        }
    });

    // Handle format actions from toolbar/format-bar/slash-menu
    on("action:format", ({ command, value }) => {
        if (!getState().editMode) return;
        scrollSelectionIntoView(content);
        flushSnapshot(content);
        executeFormat(content, command, value);
        content.dispatchEvent(new Event("input", { bubbles: true }));
        content.focus({ preventScroll: true });
    });

    on("action:undo", () => {
        if (!getState().editMode) return;
        performUndo(content);
        setState({ isDirty: undoStack.length > 0 });
    });

    on("action:redo", () => {
        if (!getState().editMode) return;
        performRedo(content);
        setState({ isDirty: true });
    });
}

function enterEditMode(content) {
    content.setAttribute("contenteditable", "true");
    content.classList.add("editing");

    document.execCommand("defaultParagraphSeparator", false, "p");
    document.execCommand("styleWithCSS", false, "false");

    // Remove copy buttons
    content.querySelectorAll(".code-copy-btn").forEach((btn) => btn.remove());

    // Detach medium-zoom
    const images = content.querySelectorAll("img");
    images.forEach((img) => {
        img.classList.remove("medium-zoom-image");
        const clone = img.cloneNode(true);
        img.parentNode.replaceChild(clone, img);
    });

    resetUndoHistory(content);

    beforeInputHandler = (e) => {
        if (e.inputType === "historyUndo" || e.inputType === "historyRedo") {
            e.preventDefault();
            return;
        }
        beforeInputCursor = getCursorOffset(content);
        currentInputType = e.inputType || "";
    };
    content.addEventListener("beforeinput", beforeInputHandler);

    inputHandler = (e) => {
        if (isPerformingUndoRedo || content.innerHTML === lastHTML) return;
        pushUndoEntry(content);
        setState({ isDirty: true });

        const isDelete = e.inputType && e.inputType.startsWith("delete");
        if (isDelete) {
            const stripped = content.textContent.replace(/\u200B/g, "").trim();
            if (!stripped && content.children.length <= 1) {
                const child = content.firstElementChild;
                if (child && child.tagName !== "P") {
                    content.innerHTML = "<p><br></p>";
                    const p = content.firstElementChild;
                    const sel = window.getSelection();
                    const r = document.createRange();
                    r.setStart(p, 0);
                    r.collapse(true);
                    sel.removeAllRanges();
                    sel.addRange(r);
                    lastHTML = content.innerHTML;
                }
            }
        }

        // Debounced re-highlighting for code blocks
        const sel = window.getSelection();
        if (sel && sel.anchorNode) {
            const pre = sel.anchorNode.nodeType === 1
                ? sel.anchorNode.closest("pre")
                : sel.anchorNode.parentElement?.closest("pre");
            if (pre && content.contains(pre)) {
                clearTimeout(codeHighlightTimer);
                codeHighlightTimer = setTimeout(() => {
                    const code = pre.querySelector("code");
                    if (!code) return;
                    const lang = pre.getAttribute("data-language");
                    if (lang && !code.className.includes(`language-${lang}`)) {
                        code.className = `language-${lang}`;
                    }
                    if (code.className.includes("language-")) {
                        const off = getCursorOffset(content);
                        Prism.highlightElement(code);
                        restoreCursor(content, off);
                    }
                }, 500);
            }
        }

        // Emit content change to bridge (debounced)
        emitContentChange(content);
    };
    content.addEventListener("input", inputHandler);

    pasteHandler = (e) => handlePaste(e, content);
    content.addEventListener("paste", pasteHandler);

    // Enable task list checkboxes (marked renders them disabled by default)
    content.querySelectorAll('input[type="checkbox"][disabled]').forEach(cb => {
        cb.removeAttribute("disabled");
    });

    // Checkbox clicks don't fire 'input' on the contenteditable, so handle them explicitly
    checkboxHandler = (e) => {
        if (e.target.matches('input[type="checkbox"]')) {
            pushUndoEntry(content);
            setState({ isDirty: true });
            emitContentChange(content);
        }
    };
    content.addEventListener("click", checkboxHandler);

    keydownHandler = (e) => {
        const mod = isModKey(e);

        if (isSlashMenuVisible() || isLangPickerDropdownOpen()) {
            e.preventDefault();
            return;
        }

        if (mod && e.key === "z" && !e.shiftKey) {
            e.preventDefault();
            performUndo(content);
            setState({ isDirty: undoStack.length > 0 });
            return;
        }
        if (mod && ((e.key === "z" && e.shiftKey) || e.key === "y")) {
            e.preventDefault();
            performRedo(content);
            setState({ isDirty: true });
            return;
        }

        if (mod && !e.shiftKey) {
            if (e.key === "b") {
                e.preventDefault();
                scrollSelectionIntoView(content);
                flushSnapshot(content);
                executeFormat(content, "bold");
                content.dispatchEvent(new Event("input", { bubbles: true }));
                return;
            }
            if (e.key === "i") {
                e.preventDefault();
                scrollSelectionIntoView(content);
                flushSnapshot(content);
                executeFormat(content, "italic");
                content.dispatchEvent(new Event("input", { bubbles: true }));
                return;
            }
            if (e.key === "k") {
                e.preventDefault();
                emit("action:show-link-input");
                return;
            }
        }

        if (mod && e.shiftKey) {
            if (e.key === "x" || e.key === "X") {
                e.preventDefault();
                scrollSelectionIntoView(content);
                flushSnapshot(content);
                executeFormat(content, "strikethrough");
                content.dispatchEvent(new Event("input", { bubbles: true }));
                return;
            }
        }

        if (e.altKey && e.key === "F10") {
            e.preventDefault();
            focusFormatBar();
            return;
        }

        // Tab navigation in tables
        if (e.key === "Tab" && !mod) {
            const ctx = getTableContext();
            if (ctx) {
                e.preventDefault();
                const { table, tr, td, colIdx } = ctx;
                const isLastCol = colIdx === tr.children.length - 1;
                const tbody = table.querySelector("tbody");
                const isLastRow = tr === (tbody || table).lastElementChild;

                if (e.shiftKey) {
                    const prevCell = td.previousElementSibling
                        || tr.previousElementSibling?.lastElementChild;
                    if (prevCell) focusCell(prevCell);
                } else if (isLastCol && isLastRow) {
                    flushSnapshot(content);
                    addTableRow(table, null);
                    dispatchInputEvent(content);
                    const wrapper = table.closest(".table-wrapper");
                    if (wrapper) {
                        const rh = wrapper.querySelector(".table-row-handles");
                        const ch = wrapper.querySelector(".table-col-handles");
                        const acb = wrapper.querySelector(".table-col-add-btn");
                        if (rh && ch && acb) rebuildHandles(wrapper, table, rh, ch, acb);
                    }
                } else {
                    const nextCell = td.nextElementSibling
                        || tr.nextElementSibling?.firstElementChild;
                    if (nextCell) focusCell(nextCell);
                }
                return;
            }
        }

        if (e.key === " ") {
            handleMarkdownShortcutOnSpace(e, content);
            return;
        }

        if (e.key === "Enter" && !e.shiftKey && !mod) {
            handleMarkdownShortcutOnEnter(e, content);
            return;
        }
    };
    content.addEventListener("keydown", keydownHandler);

    selectionHandler = () => broadcastSelectionState();
    document.addEventListener("selectionchange", selectionHandler);
    selectionFallbackMouseUp = () => broadcastSelectionState();
    selectionFallbackKeyUp = () => broadcastSelectionState();
    content.addEventListener("mouseup", selectionFallbackMouseUp);
    content.addEventListener("keyup", selectionFallbackKeyUp);

    initFormatBar(content);
    initLinkPopover(content);
    initLangPicker(content);
    initSlashMenu(content);

    content.querySelectorAll(".table-wrapper").forEach(attachTableHandles);
    setupTableContextMenu(content);
    initMermaidEditor(content);
    highlightCode();
}

function cleanupEditMode(content) {
    clearTimeout(codeHighlightTimer);
    codeHighlightTimer = null;
    clearTimeout(contentChangeTimer);
    contentChangeTimer = null;

    destroyFormatBar();
    destroyLinkPopover();
    destroyLangPicker();
    destroySlashMenu();
    destroyMermaidEditor();

    if (tableContextMenuCleanup) tableContextMenuCleanup();
    content.querySelectorAll(".table-wrapper.table-active").forEach((w) => {
        w.classList.remove("table-active");
    });

    // Disable checkboxes in read mode
    content.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        cb.setAttribute("disabled", "");
    });

    content.removeAttribute("contenteditable");
    content.classList.remove("editing");
    if (beforeInputHandler) {
        content.removeEventListener("beforeinput", beforeInputHandler);
        beforeInputHandler = null;
    }
    if (inputHandler) {
        content.removeEventListener("input", inputHandler);
        inputHandler = null;
    }
    if (keydownHandler) {
        content.removeEventListener("keydown", keydownHandler);
        keydownHandler = null;
    }
    if (pasteHandler) {
        content.removeEventListener("paste", pasteHandler);
        pasteHandler = null;
    }
    if (checkboxHandler) {
        content.removeEventListener("click", checkboxHandler);
        checkboxHandler = null;
    }
    if (selectionHandler) {
        document.removeEventListener("selectionchange", selectionHandler);
        selectionHandler = null;
    }
    if (selectionFallbackMouseUp) {
        content.removeEventListener("mouseup", selectionFallbackMouseUp);
        selectionFallbackMouseUp = null;
    }
    if (selectionFallbackKeyUp) {
        content.removeEventListener("keyup", selectionFallbackKeyUp);
        selectionFallbackKeyUp = null;
    }

    resetUndoHistory(content);
    setState({ isDirty: false });
}
