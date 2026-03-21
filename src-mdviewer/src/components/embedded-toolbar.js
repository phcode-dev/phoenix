/**
 * Minimal embedded toolbar for Phoenix live preview.
 * Read mode: "Edit" button
 * Edit mode: Format row + "Done" button
 * Responsive: progressively collapses groups into dropdowns as width shrinks.
 *   Level 0: all expanded
 *   Level 1: block elements collapse
 *   Level 2: block elements + lists collapse
 *   Level 3: all groups collapse
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
let collapseLevel = 0; // 0=expanded, 1=blocks, 2=blocks+lists, 3=all

// Width thresholds for progressive collapse
const THRESHOLD_BLOCKS = 480;  // collapse block elements first
const THRESHOLD_LISTS = 390;   // then lists
const THRESHOLD_TEXT = 300;    // finally text formatting

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
        renderEditMode(collapseLevel);
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

function btn(id, icon, tooltip) {
    return `<button class="toolbar-btn format-btn" id="${id}" data-tooltip="${tooltip}" aria-pressed="false"><i data-lucide="${icon}"></i></button>`;
}

function dropdown(group, triggerIcon, tooltip, content) {
    return `<div class="toolbar-dropdown" data-group="${group}">
        <button class="toolbar-btn toolbar-dropdown-trigger" data-tooltip="${tooltip}"><i data-lucide="${triggerIcon}"></i><i data-lucide="chevron-down" class="dropdown-chevron"></i></button>
        <div class="toolbar-dropdown-panel">${content}</div>
    </div>`;
}

function renderEditMode(level) {
    const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
    const mod = isMac ? "\u2318" : "Ctrl";

    const blockTypeSelect = `
        <select class="block-type-select" id="emb-block-type" title="${t("format.block_type") || "Block type"}">
            <option value="<p>">${t("slash.paragraph") || "Paragraph"}</option>
            <option value="<h1>">${t("slash.heading1") || "Heading 1"}</option>
            <option value="<h2>">${t("slash.heading2") || "Heading 2"}</option>
            <option value="<h3>">${t("slash.heading3") || "Heading 3"}</option>
        </select>`;

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

    // Build the text section (inline or dropdown)
    const textSection = level >= 3
        ? dropdown("text", "type", t("format.text_formatting") || "Text formatting", textBtns)
        : textBtns;

    // Build the list section (inline or dropdown)
    const listSection = level >= 2
        ? dropdown("lists", "list", t("format.lists") || "Lists", listBtns)
        : listBtns;

    // Build the block section (inline or dropdown)
    const blockSection = level >= 1
        ? dropdown("blocks", "more-horizontal", t("format.more_elements") || "More", blockBtns)
        : blockBtns;

    const formatRow = `
        <div class="format-row">
            ${blockTypeSelect}
            <div class="toolbar-divider"></div>
            ${textSection}
            <div class="toolbar-divider"></div>
            ${listSection}
            <div class="toolbar-divider"></div>
            ${blockSection}
        </div>`;

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
    if (level > 0) {
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

function widthToCollapseLevel(width) {
    if (width < THRESHOLD_TEXT) return 3;
    if (width < THRESHOLD_LISTS) return 2;
    if (width < THRESHOLD_BLOCKS) return 1;
    return 0;
}

function setupResponsiveToggle() {
    function checkWidth() {
        const width = toolbar.offsetWidth;
        const newLevel = widthToCollapseLevel(width);
        if (newLevel !== collapseLevel) {
            collapseLevel = newLevel;
            renderEditMode(collapseLevel);
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
