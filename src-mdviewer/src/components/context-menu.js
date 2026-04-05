// Adapted context-menu — stripped file-related items, no Tauri opener
import { t } from "../core/i18n.js";

const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
const modLabel = isMac ? "\u2318" : "Ctrl";

let menu = null;
let cleanupFns = [];
let savedRange = null;

// Detect clipboard API availability (blocked in Safari/Firefox sandboxed iframes)
let _clipboardApiSupported = null;
function _isClipboardApiAvailable() {
    if (_clipboardApiSupported !== null) { return _clipboardApiSupported; }
    if (!navigator.clipboard || !navigator.clipboard.readText) {
        _clipboardApiSupported = false;
        return false;
    }
    // Probe by calling readText — if permissions policy blocks it, it throws synchronously
    // or rejects immediately. Cache the result after first context menu open.
    navigator.clipboard.readText()
        .then(() => { _clipboardApiSupported = true; })
        .catch(() => { _clipboardApiSupported = false; });
    // Optimistic for first open on Chromium; will correct on next open if blocked
    _clipboardApiSupported = true;
    return _clipboardApiSupported;
}

export function initContextMenu() {
    menu = document.getElementById("context-menu");
    if (!menu) return;

    const onContextMenu = (e) => {
        if (isEditMode()) {
            const td = e.target.closest("td, th");
            const contentEl = document.getElementById("viewer-content");
            if (td && contentEl && contentEl.contains(td)) {
                return;
            }
        }

        e.preventDefault();

        const context = detectContext(e);
        const items = buildItems(context);
        if (items.length === 0) return;
        showMenu(e.clientX, e.clientY, items);
    };

    const onKeydown = (e) => {
        if (e.shiftKey && e.key === "F10") {
            e.preventDefault();
            const pos = getCaretPosition();
            const context = detectContext(null);
            const items = buildItems(context);
            if (items.length > 0) {
                showMenu(pos.x, pos.y, items, true);
            }
            return;
        }
        if (menu && menu.classList.contains("open")) {
            if (e.key === "Escape") {
                e.preventDefault();
                hideMenu();
                return;
            }
            if (["ArrowDown", "ArrowUp", "Home", "End", "Enter", " "].includes(e.key)) {
                e.preventDefault();
                handleMenuKeydown(e.key);
            }
        }
    };

    const onClickOutside = (e) => {
        if (!menu || !menu.classList.contains("open")) return;
        if (menu.contains(e.target)) return;
        hideMenu();
    };

    const onScroll = () => {
        if (!menu || !menu.classList.contains("open")) return;
        hideMenu();
    };

    const onRightMouseDown = (e) => {
        if (e.button !== 2) return;
        if (!isEditMode()) return;

        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;

        const clickRange = document.caretRangeFromPoint(e.clientX, e.clientY);
        if (!clickRange) return;

        const selRange = sel.getRangeAt(0);
        const afterStart = selRange.compareBoundaryPoints(Range.START_TO_START, clickRange) <= 0;
        const beforeEnd = selRange.compareBoundaryPoints(Range.END_TO_START, clickRange) >= 0;

        if (afterStart && beforeEnd) {
            e.preventDefault();
            savedRange = selRange.cloneRange();
        }
    };

    document.addEventListener("contextmenu", onContextMenu);
    document.addEventListener("keydown", onKeydown);
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("touchstart", onClickOutside);
    document.addEventListener("mousedown", onRightMouseDown, true);
    document.addEventListener("scroll", onScroll, true);

    cleanupFns.push(() => {
        document.removeEventListener("contextmenu", onContextMenu);
        document.removeEventListener("keydown", onKeydown);
        document.removeEventListener("mousedown", onClickOutside);
        document.removeEventListener("touchstart", onClickOutside);
        document.removeEventListener("mousedown", onRightMouseDown, true);
        document.removeEventListener("scroll", onScroll, true);
    });
}

function isEditMode() {
    const contentEl = document.getElementById("viewer-content");
    return contentEl && contentEl.isContentEditable;
}

function detectContext(e) {
    const editMode = isEditMode();
    const sel = window.getSelection();
    const hasSelection = sel && !sel.isCollapsed && sel.toString().trim().length > 0;

    let target = e ? e.target : null;
    let link = target ? target.closest("a[href]") : null;
    let image = target ? (target.tagName === "IMG" ? target : target.closest("img")) : null;
    let diagram = target ? target.closest(".mermaid-diagram[data-mermaid-source]") : null;

    const contentEl = document.getElementById("viewer-content");
    if (link && contentEl && !contentEl.contains(link)) link = null;
    if (image && contentEl && !contentEl.contains(image)) image = null;
    if (diagram && contentEl && !contentEl.contains(diagram)) diagram = null;

    return { editMode, hasSelection, link, image, diagram, sel };
}

function buildItems(ctx) {
    const items = [];

    if (ctx.editMode) {
        if (ctx.hasSelection) {
            items.push({
                label: t("context.cut"),
                shortcut: `${modLabel}+X`,
                action: () => document.execCommand("cut")
            });
            items.push({
                label: t("context.copy"),
                shortcut: `${modLabel}+C`,
                action: () => document.execCommand("copy")
            });
        }

        // Clipboard API paste only works in Chromium with permissions policy.
        // In Safari/Firefox sandboxed iframes, it's blocked. Users can still Ctrl/Cmd+V.
        if (_isClipboardApiAvailable()) {
            items.push({
                label: t("context.paste"),
                shortcut: `${modLabel}+V`,
                action: () => pasteFromClipboard(false)
            });
            items.push({
                label: t("context.paste_plain"),
                shortcut: `${modLabel}+\u21E7+V`,
                action: () => pasteFromClipboard(true)
            });
        }

        items.push({ divider: true });

        items.push({
            label: t("context.select_all"),
            shortcut: `${modLabel}+A`,
            action: () => selectAllContent()
        });
    } else {
        if (ctx.diagram) {
            items.push({
                label: t("context.copy_diagram_source") || "Copy diagram source",
                action: () => copyToClipboard(ctx.diagram.getAttribute("data-mermaid-source"))
            });
            const svgEl = ctx.diagram.querySelector("svg");
            if (svgEl) {
                items.push({
                    label: t("context.copy_as_svg") || "Copy as SVG",
                    action: () => copyToClipboard(svgEl.outerHTML)
                });
            }
            if (ctx.hasSelection || ctx.link || ctx.image) {
                items.push({ divider: true });
            }
        }

        if (ctx.link) {
            const href = ctx.link.getAttribute("href");
            items.push({
                label: t("context.copy_link"),
                action: () => copyToClipboard(href)
            });
            items.push({
                label: t("context.open_link"),
                action: () => window.open(href, "_blank", "noopener")
            });
            if (ctx.hasSelection || ctx.image) {
                items.push({ divider: true });
            }
        }

        if (ctx.image) {
            const src = ctx.image.getAttribute("src");
            items.push({
                label: t("context.copy_image_address"),
                action: () => copyToClipboard(src)
            });
            if (ctx.hasSelection) {
                items.push({ divider: true });
            }
        }

        if (ctx.hasSelection) {
            items.push({
                label: t("context.copy"),
                shortcut: `${modLabel}+C`,
                action: () => document.execCommand("copy")
            });
        }

        items.push({
            label: t("context.select_all"),
            shortcut: `${modLabel}+A`,
            action: () => selectAllContent()
        });
    }

    return items;
}

function showMenu(x, y, items, autoFocus) {
    if (!menu) return;

    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
        savedRange = sel.getRangeAt(0).cloneRange();
    }

    menu.innerHTML = "";
    let firstItem = null;

    items.forEach((item) => {
        if (item.divider) {
            const div = document.createElement("div");
            div.className = "context-menu-divider";
            div.setAttribute("role", "separator");
            menu.appendChild(div);
            return;
        }

        const btn = document.createElement("button");
        btn.className = "context-menu-item";
        btn.setAttribute("role", "menuitem");
        btn.setAttribute("tabindex", "-1");

        const labelSpan = document.createElement("span");
        labelSpan.textContent = item.label;
        btn.appendChild(labelSpan);

        if (item.shortcut) {
            const shortcutSpan = document.createElement("span");
            shortcutSpan.className = "context-menu-item-shortcut";
            shortcutSpan.textContent = item.shortcut;
            btn.appendChild(shortcutSpan);
        }

        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            const range = savedRange;
            savedRange = null;
            hideMenu();
            if (!item.disabled) {
                if (range) {
                    if (isEditMode()) {
                        const contentEl = document.getElementById("viewer-content");
                        if (contentEl) contentEl.focus({ preventScroll: true });
                    }
                    const sel = window.getSelection();
                    sel.removeAllRanges();
                    sel.addRange(range);
                }
                item.action();
            }
        });

        if (!firstItem) firstItem = btn;
        menu.appendChild(btn);
    });

    menu.style.left = x + "px";
    menu.style.top = y + "px";
    menu.classList.add("open");

    requestAnimationFrame(() => {
        const rect = menu.getBoundingClientRect();
        if (rect.right > window.innerWidth) {
            menu.style.left = Math.max(0, window.innerWidth - rect.width - 4) + "px";
        }
        if (rect.bottom > window.innerHeight) {
            menu.style.top = Math.max(0, window.innerHeight - rect.height - 4) + "px";
        }
        if (autoFocus && firstItem) firstItem.focus();
    });
}

function handleMenuKeydown(key) {
    if (!menu) return;
    const menuItems = [...menu.querySelectorAll(".context-menu-item:not([aria-disabled='true'])")];
    const current = document.activeElement;
    const idx = menuItems.indexOf(current);

    if (key === "ArrowDown") {
        const next = idx < menuItems.length - 1 ? idx + 1 : 0;
        menuItems[next]?.focus();
    } else if (key === "ArrowUp") {
        const prev = idx > 0 ? idx - 1 : menuItems.length - 1;
        menuItems[prev]?.focus();
    } else if (key === "Home") {
        menuItems[0]?.focus();
    } else if (key === "End") {
        menuItems[menuItems.length - 1]?.focus();
    } else if (key === "Enter" || key === " ") {
        if (current && current.classList.contains("context-menu-item")) {
            current.click();
        }
    }
}

function hideMenu() {
    if (!menu) return;
    menu.classList.remove("open");
    savedRange = null;
}

function getCaretPosition() {
    const sel = window.getSelection();
    if (sel && sel.rangeCount) {
        const range = sel.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        if (rect.width || rect.height) {
            return { x: rect.left, y: rect.bottom };
        }
    }
    return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
}

async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
    } catch {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
    }
}

async function pasteFromClipboard(plainOnly) {
    const contentEl = document.getElementById("viewer-content");
    if (!contentEl) return;
    contentEl.focus({ preventScroll: true });

    try {
        const text = await navigator.clipboard.readText();
        if (text) {
            document.execCommand("insertText", false, text);
        }
    } catch {
        document.execCommand("paste");
    }
}

function selectAllContent() {
    const contentEl = document.getElementById("viewer-content");
    if (!contentEl) return;
    const range = document.createRange();
    range.selectNodeContents(contentEl);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
}
