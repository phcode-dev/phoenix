// Adapted viewer — no Tauri deps, images resolve via <base href>
import Prism from "prismjs";
Prism.manual = true;
import "../core/prism-languages.js";
import "../styles/syntax/prism-light.css";
import "../styles/syntax/prism-dark.css";
import mediumZoom from "medium-zoom";
import { on } from "../core/events.js";
import { getState } from "../core/state.js";
import { t } from "../core/i18n.js";

let zoom = null;

const devLog = import.meta.env.DEV ? console.log.bind(console, "[viewer]") : () => {};

function getContentEl() {
    return document.getElementById("viewer-content");
}

export function normalizeCodeLanguages(container) {
    let normalized = 0;
    container.querySelectorAll('pre > code[class*="language-"]').forEach((code) => {
        const pre = code.parentElement;
        if (!pre.hasAttribute("data-language")) {
            const match = code.className.match(/language-(\S+)/);
            if (match) {
                pre.setAttribute("data-language", match[1]);
                normalized++;
            }
        }
    });
    if (normalized > 0) {
        devLog("normalized", normalized, "code blocks missing data-language");
    }
}

export async function renderAfterHTML(container, parseResult) {
    normalizeCodeLanguages(container);

    if (parseResult?.has_mermaid) {
        const mermaidBlocks = container.querySelectorAll('pre[data-language="mermaid"]');
        devLog("has_mermaid, mermaid <pre> in DOM:", mermaidBlocks.length);
        try {
            const { renderMermaidBlocks } = await import("../core/mermaid-render.js");
            await renderMermaidBlocks(container);
        } catch (err) {
            console.error("[viewer] Failed to load mermaid renderer:", err);
        }
    }
    highlightCode();
}

export function initViewer() {
    // Use the #app-viewer for delegated click handling (works across cached DOMs)
    const appViewer = document.getElementById("app-viewer");

    on("file:rendered", async (parseResult) => {
        devLog("file:rendered, has_mermaid:", parseResult?.has_mermaid);
        const content = getContentEl();
        if (!content) return;

        wrapTables();
        await renderAfterHTML(content, parseResult);

        if (getState().editMode) {
            content.querySelectorAll('input[type="checkbox"][disabled]').forEach(cb => {
                cb.removeAttribute("disabled");
            });
        } else {
            addCopyButtons();
            initImageZoom();
        }
    });

    // file:switched fires when a cached DOM is shown (no re-render needed)
    on("file:switched", () => {
        const content = getContentEl();
        if (!content) return;

        if (!getState().editMode) {
            addCopyButtons();
            initImageZoom();
        }
    });

    // Intercept link clicks via delegation on the viewer container
    appViewer.addEventListener("click", (e) => {
        if (getState().editMode) return;

        const anchor = e.target.closest("a[href]");
        const content = getContentEl();
        if (!anchor || !content || !content.contains(anchor)) return;

        const href = anchor.getAttribute("href");
        if (!href) return;

        e.preventDefault();

        if (href.startsWith("#")) {
            const target = document.getElementById(href.slice(1));
            if (target) target.scrollIntoView({ behavior: "smooth" });
            return;
        }

        window.parent.postMessage({
            type: "MDVIEWR_EVENT",
            eventName: "embeddedIframeHrefClick",
            href: href
        }, "*");
    });

    on("file:closed", () => {
        const content = getContentEl();
        if (content) {
            content.style.display = "none";
            content.innerHTML = "";
        }
    });

    // Re-render mermaid diagrams on theme change
    on("state:theme", async () => {
        const content = getContentEl();
        if (!content) return;
        const diagrams = content.querySelectorAll(".mermaid-diagram[data-mermaid-source]");
        if (diagrams.length === 0) return;
        const { reRenderMermaidBlocks } = await import("../core/mermaid-render.js");
        await reRenderMermaidBlocks(content);
    });
}

function wrapTables() {
    document.querySelectorAll("#viewer-content > table").forEach((table) => {
        const wrapper = document.createElement("div");
        wrapper.className = "table-wrapper";
        table.parentNode.insertBefore(wrapper, table);
        wrapper.appendChild(table);
    });
}

export function highlightCode() {
    document.querySelectorAll('#viewer-content pre[data-language]:not([data-language="mermaid"])').forEach((pre) => {
        const lang = pre.getAttribute("data-language");
        if (!lang) return;
        const code = pre.querySelector("code");
        if (code && !code.className.includes(`language-${lang}`)) {
            code.className = `language-${lang}`;
        }
    });

    const blocks = document.querySelectorAll(
        '#viewer-content pre:not([data-language="mermaid"]) code[class*="language-"]:not(.language-mermaid)'
    );
    blocks.forEach((block) => {
        Prism.highlightElement(block);
    });
}

function addCopyButtons() {
    const pres = document.querySelectorAll("#viewer-content pre");
    pres.forEach((pre) => {
        if (pre.querySelector(".code-copy-btn")) return;

        const btn = document.createElement("button");
        btn.className = "code-copy-btn";
        btn.textContent = t("viewer.copy");
        btn.setAttribute("aria-label", t("viewer.copy"));

        btn.addEventListener("click", async () => {
            const code = pre.querySelector("code");
            if (!code) return;

            try {
                await navigator.clipboard.writeText(code.textContent);
                btn.textContent = t("viewer.copied");
                btn.classList.add("copied");
                setTimeout(() => {
                    btn.textContent = t("viewer.copy");
                    btn.classList.remove("copied");
                }, 2000);
            } catch (e) {
                console.warn("Failed to copy:", e);
            }
        });

        pre.style.position = "relative";
        pre.appendChild(btn);
    });
}

function initImageZoom() {
    if (zoom) {
        zoom.detach();
    }

    zoom = mediumZoom("#viewer-content .markdown-body img", {
        margin: 24,
        background: "var(--color-bg)"
    });
}
