// Adapted mermaid-editor — no cursor-sync dependency
import {
    ensureMermaid,
    detectTheme,
    cleanupMermaidOrphans,
    applyAccessibility,
    parseAccessibility,
    renderMermaidBlocks
} from "../core/mermaid-render.js";
import { on, off } from "../core/events.js";
import { t } from "../core/i18n.js";
import { flushSnapshot } from "./editor.js";

const devLog = import.meta.env.DEV ? console.log.bind(console, "[mermaid-editor]") : () => {};

let contentEl = null;
let activeEditor = null;
let idCounter = 0;
let themeHandler = null;

// ——— Hover overlay ———

function createOverlay(diagram) {
    const overlay = document.createElement("div");
    overlay.className = "mermaid-edit-overlay";
    overlay.contentEditable = "false";
    overlay.innerHTML = `<button class="mermaid-edit-overlay-btn" type="button">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
    <span data-i18n="mermaid.edit">${t("mermaid.edit")}</span>
  </button>`;

    const btn = overlay.querySelector(".mermaid-edit-overlay-btn");
    btn.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        openEditor(diagram);
    });

    return overlay;
}

function attachOverlayToBlock(diagram) {
    if (diagram.querySelector(".mermaid-edit-overlay")) return;
    diagram.appendChild(createOverlay(diagram));
}

export function attachOverlays() {
    if (!contentEl) return;
    const diagrams = contentEl.querySelectorAll(".mermaid-diagram");
    diagrams.forEach(attachOverlayToBlock);
}

function removeOverlayFrom(diagram) {
    const overlay = diagram.querySelector(".mermaid-edit-overlay");
    if (overlay) overlay.remove();
}

// ——— Editor ———

function openEditor(diagram) {
    if (activeEditor) {
        closeEditor(false);
    }

    if (!contentEl) return;

    flushSnapshot(contentEl);

    const source = diagram.getAttribute("data-mermaid-source") || "";
    devLog("opening editor, source length:", source.length);

    removeOverlayFrom(diagram);
    diagram.classList.add("mermaid-editing");

    const existingSvg = diagram.querySelector("svg");

    const toolbar = document.createElement("div");
    toolbar.className = "mermaid-editor-toolbar";
    toolbar.contentEditable = "false";
    toolbar.innerHTML = `<span class="mermaid-editor-label">Mermaid</span>
    <div class="mermaid-editor-toolbar-actions">
      <button class="mermaid-editor-done-btn toolbar-btn" type="button" data-i18n="mermaid.done">${t("mermaid.done")}</button>
      <button class="mermaid-editor-close-btn toolbar-btn" type="button" aria-label="${t("common.close")}">&times;</button>
    </div>`;

    const editorWrap = document.createElement("div");
    editorWrap.className = "mermaid-source-editor";
    editorWrap.contentEditable = "false";

    const textarea = document.createElement("textarea");
    textarea.className = "mermaid-source-textarea";
    textarea.value = source;
    textarea.spellcheck = false;
    textarea.setAttribute("autocorrect", "off");
    textarea.setAttribute("autocapitalize", "off");
    editorWrap.appendChild(textarea);

    const errorBar = document.createElement("div");
    errorBar.className = "mermaid-error-bar";
    errorBar.contentEditable = "false";
    errorBar.style.display = "none";

    const preview = document.createElement("div");
    preview.className = "mermaid-preview";
    preview.contentEditable = "false";

    if (existingSvg) {
        preview.appendChild(existingSvg);
    }

    diagram.innerHTML = "";
    diagram.appendChild(toolbar);
    diagram.appendChild(editorWrap);
    diagram.appendChild(errorBar);
    diagram.appendChild(preview);

    autoResizeTextarea(textarea);

    let debounceTimer = null;
    let lastValidSvg = existingSvg ? existingSvg.outerHTML : "";

    activeEditor = {
        diagram,
        textarea,
        preview,
        errorBar,
        originalSource: source,
        debounceTimer: null,
        lastValidSvg,
        cleanup: null
    };

    const onInput = () => {
        autoResizeTextarea(textarea);
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            renderPreview(textarea.value, preview, errorBar);
        }, 300);
        activeEditor.debounceTimer = debounceTimer;
    };

    const onKeydown = (e) => {
        if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            closeEditor(true);
        }
        if (e.key === "Tab") {
            e.preventDefault();
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            textarea.value = textarea.value.substring(0, start) + "  " + textarea.value.substring(end);
            textarea.selectionStart = textarea.selectionEnd = start + 2;
            onInput();
        }
    };

    const onClickOutside = (e) => {
        if (!activeEditor) return;
        if (diagram.contains(e.target)) return;
        closeEditor(true);
    };

    textarea.addEventListener("input", onInput);
    textarea.addEventListener("keydown", onKeydown);

    const doneBtn = toolbar.querySelector(".mermaid-editor-done-btn");
    const closeBtn = toolbar.querySelector(".mermaid-editor-close-btn");
    doneBtn.addEventListener("mousedown", (e) => {
        e.preventDefault();
        closeEditor(true);
    });
    closeBtn.addEventListener("mousedown", (e) => {
        e.preventDefault();
        closeEditor(true);
    });

    requestAnimationFrame(() => {
        document.addEventListener("mousedown", onClickOutside);
    });

    activeEditor.cleanup = () => {
        clearTimeout(debounceTimer);
        textarea.removeEventListener("input", onInput);
        textarea.removeEventListener("keydown", onKeydown);
        document.removeEventListener("mousedown", onClickOutside);
    };

    requestAnimationFrame(() => {
        textarea.focus();
        textarea.setSelectionRange(source.length, source.length);
    });

    renderPreview(source, preview, errorBar);
}

async function renderPreview(source, previewEl, errorBar) {
    if (!activeEditor) return;

    const trimmed = source.trim();
    if (!trimmed) {
        errorBar.textContent = `\u26A0 ${t("mermaid.error_prefix")}: Empty diagram`;
        errorBar.style.display = "";
        previewEl.classList.add("stale");
        return;
    }

    const theme = detectTheme();
    let mermaid;
    try {
        mermaid = await ensureMermaid(theme);
    } catch (err) {
        devLog("failed to load mermaid:", err);
        return;
    }

    const id = `mermaid-editor-${Date.now()}-${idCounter++}`;

    try {
        await mermaid.parse(trimmed);
        const { svg } = await mermaid.render(id, trimmed);

        const temp = document.createElement("div");
        temp.innerHTML = svg;
        const svgEl = temp.querySelector("svg");

        if (svgEl) {
            const acc = parseAccessibility(trimmed);
            applyAccessibility(svgEl, acc);

            previewEl.innerHTML = "";
            previewEl.appendChild(svgEl);
            previewEl.classList.remove("stale");
            if (activeEditor) activeEditor.lastValidSvg = svgEl.outerHTML;
        }

        errorBar.style.display = "none";
        errorBar.textContent = "";
    } catch (err) {
        const msg = err.message || String(err);
        const shortMsg = msg.split("\n")[0].replace(/^.*?(?:Syntax error|Parse error|Error)/i, (m) => m.trim());
        errorBar.textContent = `\u26A0 ${t("mermaid.error_prefix")}: ${shortMsg}`;
        errorBar.style.display = "";
        previewEl.classList.add("stale");
        devLog("render error:", msg);
    } finally {
        cleanupMermaidOrphans(id);
    }
}

function closeEditor(commit) {
    if (!activeEditor) return;

    const { diagram, textarea, preview, cleanup, lastValidSvg, originalSource } = activeEditor;
    const newSource = textarea.value.trim();
    devLog("closing editor, commit:", commit, "source changed:", newSource !== originalSource);

    if (cleanup) cleanup();

    diagram.classList.remove("mermaid-editing");
    diagram.innerHTML = "";

    if (commit && newSource) {
        diagram.setAttribute("data-mermaid-source", newSource);
    }

    if (lastValidSvg) {
        const temp = document.createElement("div");
        temp.innerHTML = lastValidSvg;
        const svgEl = temp.querySelector("svg");
        if (svgEl) {
            diagram.appendChild(svgEl);
        }
    }

    if (commit && newSource && newSource !== originalSource) {
        reRenderDiagram(diagram, newSource);
    }

    activeEditor = null;

    attachOverlayToBlock(diagram);

    if (commit && contentEl && newSource !== originalSource) {
        contentEl.dispatchEvent(new Event("input", { bubbles: true }));
    }
}

async function reRenderDiagram(diagram, source) {
    const theme = detectTheme();
    try {
        const mermaid = await ensureMermaid(theme);
        const id = `mermaid-rerender-${Date.now()}-${idCounter++}`;
        const { svg } = await mermaid.render(id, source);

        const temp = document.createElement("div");
        temp.innerHTML = svg;
        const svgEl = temp.querySelector("svg");

        if (svgEl) {
            const acc = parseAccessibility(source);
            applyAccessibility(svgEl, acc);
            diagram.innerHTML = "";
            diagram.appendChild(svgEl);
            attachOverlayToBlock(diagram);
        }
        cleanupMermaidOrphans(id);
    } catch {
        // Keep existing SVG on error
    }
}

function autoResizeTextarea(textarea) {
    textarea.style.height = "auto";
    textarea.style.height = Math.min(textarea.scrollHeight, 300) + "px";
}

// ——— Insert new mermaid block ———

export async function insertMermaidBlock(contentElRef) {
    const template = "graph TD\n  A[Start] --> B[End]";

    const html = `<pre data-language="mermaid"><code>${template}</code></pre><p><br></p>`;
    document.execCommand("insertHTML", false, html);

    await new Promise((r) => requestAnimationFrame(r));

    const el = contentElRef || contentEl;
    if (!el) return;

    await renderMermaidBlocks(el);

    await new Promise((r) => requestAnimationFrame(r));
    const diagrams = el.querySelectorAll(".mermaid-diagram");
    const newDiagram = diagrams[diagrams.length - 1];
    if (newDiagram) {
        openEditor(newDiagram);
    }
}

// ——— Lifecycle ———

function handleDblClick(e) {
    const diagram = e.target.closest(".mermaid-diagram");
    if (diagram && !diagram.classList.contains("mermaid-editing")) {
        e.preventDefault();
        e.stopPropagation();
        openEditor(diagram);
    }
}

export function initMermaidEditor(editorEl) {
    contentEl = editorEl;
    devLog("init");

    contentEl.addEventListener("dblclick", handleDblClick, true);
    attachOverlays();

    themeHandler = () => {
        if (activeEditor) {
            renderPreview(activeEditor.textarea.value, activeEditor.preview, activeEditor.errorBar);
        }
    };
    on("state:theme", themeHandler);
}

export function destroyMermaidEditor() {
    devLog("destroy");

    if (activeEditor) {
        closeEditor(false);
    }

    if (contentEl) {
        contentEl.querySelectorAll(".mermaid-edit-overlay").forEach((el) => el.remove());
        contentEl.removeEventListener("dblclick", handleDblClick, true);
    }

    if (themeHandler) {
        off("state:theme", themeHandler);
        themeHandler = null;
    }

    contentEl = null;
    activeEditor = null;
}

export function isEditorOpen() {
    return activeEditor !== null;
}
