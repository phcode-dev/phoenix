/**
 * Minimal embedded toolbar for Phoenix live preview.
 * Read mode: "Edit" button
 * Edit mode: Format row + "Done" button
 */
import {
    createIcons,
    Pencil,
    Bold,
    Italic,
    Strikethrough,
    Code,
    Link,
    List,
    ListOrdered,
    ListChecks,
    Quote,
    Minus,
    Table,
    FileCode
} from "lucide";
import { on, emit } from "../core/events.js";
import { getState, setState } from "../core/state.js";
import { t, tp } from "../core/i18n.js";

let toolbar = null;

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

    if (state.editMode) {
        renderEditMode();
    } else {
        renderReadMode();
    }
}

function renderReadMode() {
    toolbar.innerHTML = `<div class="embedded-toolbar">
        <div class="toolbar-spacer"></div>
        <button class="edit-toggle-btn" id="emb-edit-btn" title="${t("toolbar.edit") || "Edit"}">
            <i data-lucide="pencil"></i>
            <span>${t("toolbar.edit") || "Edit"}</span>
        </button>
    </div>`;

    createIcons({
        icons: { Pencil },
        attrs: { class: "" }
    });

    const editBtn = document.getElementById("emb-edit-btn");
    if (editBtn) {
        editBtn.addEventListener("click", () => {
            setState({ editMode: true });
        });
    }
}

function renderEditMode() {
    const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
    const mod = isMac ? "\u2318" : "Ctrl";

    toolbar.innerHTML = `<div class="embedded-toolbar">
        <div class="format-row">
            <select class="block-type-select" id="emb-block-type" title="${t("format.block_type") || "Block type"}">
                <option value="<p>">${t("slash.paragraph") || "Paragraph"}</option>
                <option value="<h1>">${t("slash.heading1") || "Heading 1"}</option>
                <option value="<h2>">${t("slash.heading2") || "Heading 2"}</option>
                <option value="<h3>">${t("slash.heading3") || "Heading 3"}</option>
            </select>
            <div class="toolbar-divider"></div>
            <button class="toolbar-btn format-btn" id="emb-bold" data-tooltip="${tp("format.bold", { mod }) || "Bold"}" aria-pressed="false"><i data-lucide="bold"></i></button>
            <button class="toolbar-btn format-btn" id="emb-italic" data-tooltip="${tp("format.italic", { mod }) || "Italic"}" aria-pressed="false"><i data-lucide="italic"></i></button>
            <button class="toolbar-btn format-btn" id="emb-strike" data-tooltip="${tp("format.strikethrough", { mod }) || "Strikethrough"}" aria-pressed="false"><i data-lucide="strikethrough"></i></button>
            <button class="toolbar-btn format-btn" id="emb-code" data-tooltip="${t("format.code") || "Code"}" aria-pressed="false"><i data-lucide="code"></i></button>
            <button class="toolbar-btn format-btn" id="emb-link" data-tooltip="${tp("format.link", { mod }) || "Link"}" aria-pressed="false"><i data-lucide="link"></i></button>
            <div class="toolbar-divider"></div>
            <button class="toolbar-btn format-btn" id="emb-ul" data-tooltip="${t("format.bullet_list") || "Bullet list"}" aria-pressed="false"><i data-lucide="list"></i></button>
            <button class="toolbar-btn format-btn" id="emb-ol" data-tooltip="${t("format.numbered_list") || "Numbered list"}" aria-pressed="false"><i data-lucide="list-ordered"></i></button>
            <button class="toolbar-btn format-btn" id="emb-task" data-tooltip="${t("format.task_list") || "Task list"}"><i data-lucide="list-checks"></i></button>
            <div class="toolbar-divider"></div>
            <button class="toolbar-btn format-btn" id="emb-quote" data-tooltip="${t("format.blockquote") || "Quote"}"><i data-lucide="quote"></i></button>
            <button class="toolbar-btn format-btn" id="emb-hr" data-tooltip="${t("format.divider") || "Divider"}"><i data-lucide="minus"></i></button>
            <button class="toolbar-btn format-btn" id="emb-table" data-tooltip="${t("format.table") || "Table"}"><i data-lucide="table"></i></button>
            <button class="toolbar-btn format-btn" id="emb-codeblock" data-tooltip="${t("format.code_block") || "Code block"}"><i data-lucide="file-code"></i></button>
        </div>
        <div class="toolbar-spacer"></div>
        <button class="done-btn" id="emb-done-btn">
            <span>${t("toolbar.done") || "Done"}</span>
        </button>
    </div>`;

    createIcons({
        icons: { Bold, Italic, Strikethrough, Code, Link, List, ListOrdered, ListChecks, Quote, Minus, Table, FileCode },
        attrs: { class: "" }
    });

    // Wire up format buttons
    const formatBindings = [
        { id: "emb-bold", command: "bold" },
        { id: "emb-italic", command: "italic" },
        { id: "emb-strike", command: "strikethrough" },
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

    for (const binding of formatBindings) {
        const el = document.getElementById(binding.id);
        if (el) {
            el.addEventListener("mousedown", (e) => {
                e.preventDefault(); // keep selection
                emit("action:format", { command: binding.command, value: binding.value });
            });
        }
    }

    // Block type selector
    const blockTypeSelect = document.getElementById("emb-block-type");
    if (blockTypeSelect) {
        blockTypeSelect.addEventListener("change", (e) => {
            emit("action:format", { command: "formatBlock", value: e.target.value });
            e.target.blur();
        });
    }

    // Done button
    const doneBtn = document.getElementById("emb-done-btn");
    if (doneBtn) {
        doneBtn.addEventListener("click", () => {
            setState({ editMode: false });
        });
    }
}

function updateFormatState(state) {
    if (!toolbar || !getState().editMode) return;

    const mappings = [
        { id: "emb-bold", key: "bold" },
        { id: "emb-italic", key: "italic" },
        { id: "emb-strike", key: "strikethrough" },
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

    // Block type selector
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
