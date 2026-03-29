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
    MoreHorizontal,
    BookOpen,
    Link2,
    Link2Off,
    Printer,
    Image as ImageIcon,
    Upload
} from "lucide";
import { on, emit } from "../core/events.js";
import { getState, setState } from "../core/state.js";
import { t, tp } from "../core/i18n.js";

let toolbar = null;
let resizeObserver = null;
let cursorSyncEnabled = true;
let collapseLevel = 0; // 0=expanded, 1=blocks, 2=blocks+lists, 3=all

// Width thresholds for progressive collapse
const THRESHOLD_BLOCKS = 640;  // collapse block elements + image first
const THRESHOLD_LISTS = 520;   // then lists
const THRESHOLD_TEXT = 500;    // finally text formatting (all dropdowns collapsed)

const allIcons = { Bold, Italic, Strikethrough, Underline, Code, Link, List, ListOrdered,
    ListChecks, Quote, Minus, Table, FileCode, ChevronDown, Type, MoreHorizontal, Pencil, BookOpen, Link2, Link2Off, Printer, Image: ImageIcon, Upload };

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
        <button class="toolbar-btn print-btn" id="emb-print-btn" data-tooltip="${t("toolbar.print") || "Print"}">
            <i data-lucide="printer"></i>
        </button>
        <button class="toolbar-btn cursor-sync-btn${cursorSyncEnabled ? " active" : ""}" id="emb-cursor-sync" data-tooltip="${t("toolbar.cursor_sync") || "Cursor sync"}" aria-pressed="${cursorSyncEnabled}">
            <i data-lucide="link-2" class="sync-on-icon"${cursorSyncEnabled ? "" : ' style="display:none"'}></i>
            <i data-lucide="link-2-off" class="sync-off-icon"${cursorSyncEnabled ? ' style="display:none"' : ""}></i>
        </button>
        <button class="edit-toggle-btn" id="emb-edit-btn" title="${t("toolbar.switch_to_edit") || "Switch to edit mode"}">
            <i data-lucide="pencil"></i>
            <span>${t("toolbar.edit") || "Edit"}</span>
        </button>
    </div>`;

    createIcons({ icons: allIcons, attrs: { class: "" } });
    // Remove data-lucide from replaced SVGs to prevent warnings on subsequent createIcons calls
    toolbar.querySelectorAll("svg[data-lucide]").forEach(svg => svg.removeAttribute("data-lucide"));

    wireCursorSyncButton();
    wirePrintButton();

    const editBtn = document.getElementById("emb-edit-btn");
    if (editBtn) {
        editBtn.addEventListener("click", () => {
            emit("request:editMode");
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
            <option value="<h4>">${t("slash.heading4") || "Heading 4"}</option>
            <option value="<h5>">${t("slash.heading5") || "Heading 5"}</option>
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

    const imageBtns = `
        <button class="toolbar-btn toolbar-menu-item" id="emb-image-url"><i data-lucide="link"></i><span>${t("format.image_url") || "Image URL"}</span></button>
        <button class="toolbar-btn toolbar-menu-item" id="emb-image-upload"><i data-lucide="upload"></i><span>${t("format.image_upload") || "Upload from Computer"}</span></button>`;

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

    // Image section is always a dropdown (two options inside)
    const imageSection = dropdown("image", "image", t("format.image") || "Image", imageBtns);

    const formatRow = `
        <div class="format-row">
            ${blockTypeSelect}
            <div class="toolbar-divider"></div>
            ${textSection}
            <div class="toolbar-divider"></div>
            ${listSection}
            <div class="toolbar-divider"></div>
            ${blockSection}
            <div class="toolbar-divider"></div>
            ${imageSection}
        </div>`;

    toolbar.innerHTML = `<div class="embedded-toolbar">
        ${formatRow}
        <div class="toolbar-spacer"></div>
        <button class="toolbar-btn print-btn" id="emb-print-btn" data-tooltip="${t("toolbar.print") || "Print"}">
            <i data-lucide="printer"></i>
        </button>
        <button class="toolbar-btn cursor-sync-btn${cursorSyncEnabled ? " active" : ""}" id="emb-cursor-sync" data-tooltip="${t("toolbar.cursor_sync") || "Cursor sync"}" aria-pressed="${cursorSyncEnabled}">
            <i data-lucide="link-2" class="sync-on-icon"${cursorSyncEnabled ? "" : ' style="display:none"'}></i>
            <i data-lucide="link-2-off" class="sync-off-icon"${cursorSyncEnabled ? ' style="display:none"' : ""}></i>
        </button>
        <button class="done-btn" id="emb-done-btn" title="${t("toolbar.switch_to_reader") || "Switch to reader mode"}">
            <i data-lucide="book-open"></i>
            <span>${t("toolbar.reader") || "Reader"}</span>
        </button>
    </div>`;

    createIcons({ icons: allIcons, attrs: { class: "" } });
    // Remove data-lucide from replaced SVGs to prevent warnings on subsequent createIcons calls
    toolbar.querySelectorAll("svg[data-lucide]").forEach(svg => svg.removeAttribute("data-lucide"));

    wireFormatButtons();
    wireBlockTypeSelect();
    wireDropdowns();
    wireCursorSyncButton();
    wirePrintButton();
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
    { id: "emb-codeblock", command: "codeBlock" },
    { id: "emb-image-url", command: "imageFromUrl" },
    { id: "emb-image-upload", command: "imageUpload" }
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

function wireCursorSyncButton() {
    const syncBtn = document.getElementById("emb-cursor-sync");
    if (syncBtn) {
        syncBtn.addEventListener("click", () => {
            cursorSyncEnabled = !cursorSyncEnabled;
            syncBtn.classList.toggle("active", cursorSyncEnabled);
            syncBtn.setAttribute("aria-pressed", String(cursorSyncEnabled));
            const onIcon = syncBtn.querySelector(".sync-on-icon");
            const offIcon = syncBtn.querySelector(".sync-off-icon");
            if (onIcon) onIcon.style.display = cursorSyncEnabled ? "" : "none";
            if (offIcon) offIcon.style.display = cursorSyncEnabled ? "none" : "";
            emit("toggle:cursorSync", { enabled: cursorSyncEnabled });
        });
    }
}

function wirePrintButton() {
    const printBtn = document.getElementById("emb-print-btn");
    if (printBtn) {
        printBtn.addEventListener("click", () => {
            window.print();
        });
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

    // Hide block-level controls when inside a table or list
    const hideBlocks = !!state.inTable || !!state.inList;
    const blockLevelIds = ["emb-quote", "emb-hr", "emb-table", "emb-codeblock"];
    const blockDropdowns = toolbar.querySelectorAll('.toolbar-dropdown[data-group="blocks"]');
    for (const id of blockLevelIds) {
        const el = document.getElementById(id);
        if (el) el.style.display = hideBlocks ? "none" : "";
    }
    for (const dd of blockDropdowns) {
        dd.style.display = hideBlocks ? "none" : "";
    }
    // Hide list buttons only in tables (they're useful in lists for switching UL/OL)
    const listIds = ["emb-ul", "emb-ol", "emb-task"];
    const listDropdowns = toolbar.querySelectorAll('.toolbar-dropdown[data-group="lists"]');
    for (const id of listIds) {
        const el = document.getElementById(id);
        if (el) el.style.display = state.inTable ? "none" : "";
    }
    for (const dd of listDropdowns) {
        dd.style.display = state.inTable ? "none" : "";
    }
    // Hide block type selector in tables and lists
    const blockTypeSelect = document.getElementById("emb-block-type");
    if (blockTypeSelect) {
        blockTypeSelect.style.display = (state.inTable || state.inList) ? "none" : "";
    }

    if (blockTypeSelect && state.blockType) {
        const tagToValue = {
            "H1": "<h1>", "H2": "<h2>", "H3": "<h3>", "H4": "<h4>", "H5": "<h5>",
            "P": "<p>", "DIV": "<p>"
        };
        const val = tagToValue[state.blockType] || "<p>";
        if (blockTypeSelect.value !== val) {
            blockTypeSelect.value = val;
        }
    }
}
