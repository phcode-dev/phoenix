/**
 * Minimal embedded toolbar for Phoenix live preview.
 * Read mode: "Edit" button
 * Edit mode: Format row + "Done" button
 * Responsive: collapses into dropdown groups when narrow.
 */
import {
    createIcons,
    Pencil,
    Bold,
    Italic,
    Strikethrough,
    Underline,
    Code,
    Link,
    List,
    ListOrdered,
    ListChecks,
    Quote,
    Minus,
    Table,
    FileCode,
    ChevronDown,
    Type,
    MoreHorizontal
} from "lucide";
import { on, emit } from "../core/events.js";
import { getState, setState } from "../core/state.js";
import { t, tp } from "../core/i18n.js";

let toolbar = null;
let resizeObserver = null;
let isCollapsed = false;

// Minimum width needed for the expanded toolbar (block-type-select ~90 + 15 buttons*24 + dividers + done ~50)
const COLLAPSE_WIDTH = 520;

const allIcons = { Bold, Italic, Strikethrough, Underline, Code, Link, List, ListOrdered,
    ListChecks, Quote, Minus, Table, FileCode, ChevronDown, Type, MoreHorizontal, Pencil };

export function initEmbeddedToolbar() {
    toolbar = document.getElementById("toolbar");
    if (!toolbar) return;

    render();

    on("state:editMode", () => render());
    on("editor:selection-state", updateFormatState);
    on("state:locale", () => render());
}

function render() {
    if (!toolbar) return;
    const state = getState();

    if (resizeObserver) {
        resizeObserver.disconnect();
        resizeObserver = null;
    }

    if (state.editMode) {
        renderEditMode(isCollapsed);
        setupResponsiveToggle();
    } else {
        renderReadMode();
    }
}

function renderReadMode() {
    toolbar.innerHTML = `<div class="embedded-toolbar">
        <div class="toolbar-spacer"></div>
        <button class="edit-toggle-btn" id="emb-edit-btn">
            <i data-lucide="pencil"></i>
            <span>${t("toolbar.edit") || "Edit"}</span>
        </button>
    </div>`;

    createIcons({ icons: { Pencil }, attrs: { class: "" } });

    const editBtn = document.getElementById("emb-edit-btn");
    if (editBtn) {
        editBtn.addEventListener("click", () => {
            setState({ editMode: true });
        });
    }
}

function renderEditMode(collapsed) {
    const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
    const mod = isMac ? "\u2318" : "Ctrl";

    const blockTypeSelect = `
        <select class="block-type-select" id="emb-block-type" title="${t("format.block_type") || "Block type"}">
            <option value="<p>">${t("slash.paragraph") || "Paragraph"}</option>
            <option value="<h1>">${t("slash.heading1") || "Heading 1"}</option>
            <option value="<h2>">${t("slash.heading2") || "Heading 2"}</option>
            <option value="<h3>">${t("slash.heading3") || "Heading 3"}</option>
        </select>`;

    const btn = (id, icon, tooltip) =>
        `<button class="toolbar-btn format-btn" id="${id}" data-tooltip="${tooltip}" aria-pressed="false"><i data-lucide="${icon}"></i></button>`;

    const textBtns = [
        btn("emb-bold", "bold", tp("format.bold", { mod }) || "Bold"),
        btn("emb-italic", "italic", tp("format.italic", { mod }) || "Italic"),
        btn("emb-strike", "strikethrough", tp("format.strikethrough", { mod }) || "Strikethrough"),
        btn("emb-underline", "underline", tp("format.underline", { mod }) || "Underline"),
        btn("emb-code", "code", t("format.code") || "Code"),
        btn("emb-link", "link", tp("format.link", { mod }) || "Link")
    ].join("");

    const listBtns = [
        btn("emb-ul", "list", t("format.bullet_list") || "Bullet list"),
        btn("emb-ol", "list-ordered", t("format.numbered_list") || "Numbered list"),
        btn("emb-task", "list-checks", t("format.task_list") || "Task list")
    ].join("");

    const blockBtns = [
        btn("emb-quote", "quote", t("format.blockquote") || "Quote"),
        btn("emb-hr", "minus", t("format.divider") || "Divider"),
        btn("emb-table", "table", t("format.table") || "Table"),
        btn("emb-codeblock", "file-code", t("format.code_block") || "Code block")
    ].join("");

    let formatRow;
    if (collapsed) {
        formatRow = `
        <div class="format-row">
            ${blockTypeSelect}
            <div class="toolbar-divider"></div>
            <div class="toolbar-dropdown" data-group="text">
                <button class="toolbar-btn toolbar-dropdown-trigger" data-tooltip="${t("format.text_formatting") || "Text formatting"}"><i data-lucide="type"></i><i data-lucide="chevron-down" class="dropdown-chevron"></i></button>
                <div class="toolbar-dropdown-panel">${textBtns}</div>
            </div>
            <div class="toolbar-dropdown" data-group="lists">
                <button class="toolbar-btn toolbar-dropdown-trigger" data-tooltip="${t("format.lists") || "Lists"}"><i data-lucide="list"></i><i data-lucide="chevron-down" class="dropdown-chevron"></i></button>
                <div class="toolbar-dropdown-panel">${listBtns}</div>
            </div>
            <div class="toolbar-dropdown" data-group="blocks">
                <button class="toolbar-btn toolbar-dropdown-trigger" data-tooltip="${t("format.more_elements") || "More"}"><i data-lucide="more-horizontal"></i><i data-lucide="chevron-down" class="dropdown-chevron"></i></button>
                <div class="toolbar-dropdown-panel">${blockBtns}</div>
            </div>
        </div>`;
    } else {
        formatRow = `
        <div class="format-row">
            ${blockTypeSelect}
            <div class="toolbar-divider"></div>
            ${textBtns}
            <div class="toolbar-divider"></div>
            ${listBtns}
            <div class="toolbar-divider"></div>
            ${blockBtns}
        </div>`;
    }

    toolbar.innerHTML = `<div class="embedded-toolbar">
        ${formatRow}
        <div class="toolbar-spacer"></div>
        <button class="done-btn" id="emb-done-btn">
            <span>${t("toolbar.done") || "Done"}</span>
        </button>
    </div>`;

    createIcons({ icons: allIcons, attrs: { class: "" } });

    wireFormatButtons();
    wireBlockTypeSelect();
    if (collapsed) {
        wireDropdowns();
    }
    wireDoneButton();
}

const formatBindings = [
    { id: "emb-bold", command: "bold" },
    { id: "emb-italic", command: "italic" },
    { id: "emb-strike", command: "strikethrough" },
    { id: "emb-underline", command: "underline" },
    { id: "emb-code", command: "code" },
    { id: "emb-link", command: "createLink" },
    { id: "emb-ul", command: "insertUnorderedList" },
    { id: "emb-ol", command: "insertOrderedList" },
    { id: "emb-task", command: "taskList" },
    { id: "emb-quote", command: "formatBlock", value: "<blockquote>" },
    { id: "emb-hr", command: "insertHorizontalRule" },
    { id: "emb-table", command: "table" },
    { id: "emb-codeblock", command: "codeBlock" }
];

function wireFormatButtons() {
    for (const binding of formatBindings) {
        const el = document.getElementById(binding.id);
        if (el) {
            el.addEventListener("mousedown", (e) => {
                e.preventDefault();
                emit("action:format", { command: binding.command, value: binding.value });
            });
        }
    }
}

function wireBlockTypeSelect() {
    const blockTypeSelect = document.getElementById("emb-block-type");
    if (blockTypeSelect) {
        blockTypeSelect.addEventListener("change", (e) => {
            emit("action:format", { command: "formatBlock", value: e.target.value });
            e.target.blur();
        });
    }
}

function wireDropdowns() {
    const dropdowns = toolbar.querySelectorAll(".toolbar-dropdown");
    for (const dropdown of dropdowns) {
        const trigger = dropdown.querySelector(".toolbar-dropdown-trigger");
        if (!trigger) continue;

        trigger.addEventListener("mousedown", (e) => {
            e.preventDefault();
            e.stopPropagation();
            const wasOpen = dropdown.classList.contains("open");
            closeAllDropdowns();
            if (!wasOpen) {
                dropdown.classList.add("open");
            }
        });
    }

    document.addEventListener("mousedown", (e) => {
        if (!e.target.closest(".toolbar-dropdown")) {
            closeAllDropdowns();
        }
    });
}

function closeAllDropdowns() {
    const openDropdowns = toolbar.querySelectorAll(".toolbar-dropdown.open");
    for (const d of openDropdowns) {
        d.classList.remove("open");
    }
}

function wireDoneButton() {
    const doneBtn = document.getElementById("emb-done-btn");
    if (doneBtn) {
        doneBtn.addEventListener("click", () => {
            setState({ editMode: false });
        });
    }
}

function setupResponsiveToggle() {
    // Observe the #toolbar element (grid-constrained) not .embedded-toolbar (can overflow)
    function checkWidth() {
        const width = toolbar.offsetWidth;
        const shouldCollapse = width < COLLAPSE_WIDTH;
        if (shouldCollapse !== isCollapsed) {
            isCollapsed = shouldCollapse;
            renderEditMode(isCollapsed);
            // Re-attach observer after re-render
            resizeObserver.observe(toolbar);
        }
    }

    resizeObserver = new ResizeObserver(() => checkWidth());
    resizeObserver.observe(toolbar);
}

function updateFormatState(state) {
    if (!toolbar || !getState().editMode) return;

    const mappings = [
        { id: "emb-bold", key: "bold" },
        { id: "emb-italic", key: "italic" },
        { id: "emb-strike", key: "strikethrough" },
        { id: "emb-underline", key: "underline" },
        { id: "emb-code", key: "isCode" },
        { id: "emb-link", key: "isLink" },
        { id: "emb-ul", key: "unorderedList" },
        { id: "emb-ol", key: "orderedList" }
    ];

    for (const m of mappings) {
        const el = document.getElementById(m.id);
        if (el) {
            const active = !!state[m.key];
            el.classList.toggle("active", active);
            el.setAttribute("aria-pressed", String(active));
        }
    }

    const blockTypeSelect = document.getElementById("emb-block-type");
    if (blockTypeSelect && state.blockType) {
        const tagToValue = {
            "H1": "<h1>", "H2": "<h2>", "H3": "<h3>",
            "P": "<p>", "DIV": "<p>"
        };
        const val = tagToValue[state.blockType] || "<p>";
        if (blockTypeSelect.value !== val) {
            blockTypeSelect.value = val;
        }
    }
}
