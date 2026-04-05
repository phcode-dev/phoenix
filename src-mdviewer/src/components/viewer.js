// Adapted viewer — no Tauri deps, images resolve via <base href>
import Prism from "prismjs";
Prism.manual = true;
import "../core/prism-languages.js";
import "../styles/syntax/prism-light.css";
import "../styles/syntax/prism-dark.css";
import morphdom from "morphdom";
import { on } from "../core/events.js";
import { getState } from "../core/state.js";
import { t } from "../core/i18n.js";

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

        // Save existing image nodes before DOM update. Replace each <img> with
        // a lightweight placeholder <span> so morphdom doesn't destroy the node.
        // After morphdom, swap saved images back in by matching src.
        const savedImgs = new Map();
        const placeholders = new Map();
        content.querySelectorAll("img").forEach(img => {
            if (img.src && !img.src.includes("uploading.svg")) {
                const placeholder = document.createElement("span");
                placeholder.dataset.savedImgSrc = img.src;
                img.replaceWith(placeholder);
                savedImgs.set(img.src, img);
                placeholders.set(img.src, placeholder);
            }
        });

        const newContent = document.createElement("div");
        newContent.innerHTML = parseResult.html;

        morphdom(content, newContent, { childrenOnly: true });

        // Restore saved image nodes — find new <img> by src and swap
        if (savedImgs.size > 0) {
            content.querySelectorAll("img").forEach(newImg => {
                const saved = savedImgs.get(newImg.src);
                if (saved) {
                    if (saved.alt !== newImg.alt) { saved.alt = newImg.alt; }
                    if (saved.title !== newImg.title) { saved.title = newImg.title; }
                    newImg.replaceWith(saved);
                    savedImgs.delete(newImg.src);
                }
            });
        }
        content.dir = "auto";

        wrapTables();
        await renderAfterHTML(content, parseResult);

        if (getState().editMode) {
            content.querySelectorAll('input[type="checkbox"][disabled]').forEach(cb => {
                cb.removeAttribute("disabled");
            });
        } else {
            addCopyButtons();
        }
    });

    // file:switched fires when a cached DOM is shown (no re-render needed)
    on("file:switched", () => {
        const content = getContentEl();
        if (!content) return;

        if (!getState().editMode) {
            addCopyButtons();
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

    // Disable spellcheck and autocomplete inside code blocks
    document.querySelectorAll("#viewer-content pre").forEach((pre) => {
        pre.spellcheck = false;
        pre.setAttribute("autocorrect", "off");
        pre.setAttribute("autocomplete", "off");
        pre.setAttribute("autocapitalize", "off");
    });

    // After Prism highlighting, add per-line data-source-line spans inside code blocks
    _annotateCodeBlockLines();
}

/**
 * Wrap each line in highlighted code blocks with a span that has data-source-line,
 * enabling per-line cursor sync for code blocks.
 * Must run AFTER Prism highlighting since Prism replaces innerHTML.
 */
export function _annotateCodeBlockLines() {
    // Process all pre elements, not just those with data-source-line
    // (morphdom may strip the attr on first render)
    const pres = document.querySelectorAll("#viewer-content pre");
    pres.forEach((pre) => {
        const code = pre.querySelector("code");
        if (!code) return;

        let preSourceLine = parseInt(pre.getAttribute("data-source-line"), 10);
        // If already annotated, check if the line numbers are still correct.
        // If pre has a data-source-line and annotations exist, compare the
        // expected first line with the actual first annotation.
        const existingSpan = code.querySelector("span[data-source-line]");
        if (existingSpan) {
            if (isNaN(preSourceLine)) return; // can't verify, keep existing
            const expectedFirst = String(preSourceLine + 1);
            if (existingSpan.getAttribute("data-source-line") === expectedFirst) {
                // Annotations are up to date — still remove data-source-line
                // from <pre> so clicks on empty space don't report the block
                // start line instead of the per-line annotation.
                pre.removeAttribute("data-source-line");
                return;
            }
            // Stale annotations — unwrap them before re-annotating
            code.querySelectorAll("span[data-source-line]").forEach((span) => {
                while (span.firstChild) {
                    span.parentNode.insertBefore(span.firstChild, span);
                }
                span.remove();
            });
            code.normalize(); // merge adjacent text nodes
        }
        if (isNaN(preSourceLine)) {
            // Fallback: find the nearest preceding sibling with data-source-line
            // and estimate this pre's line from it
            let prev = pre.previousElementSibling;
            while (prev && !prev.hasAttribute("data-source-line")) {
                prev = prev.previousElementSibling;
            }
            if (prev) {
                const prevLine = parseInt(prev.getAttribute("data-source-line"), 10);
                // Rough estimate: count text lines in the previous element
                const prevText = prev.textContent || "";
                const prevLines = (prevText.match(/\n/g) || []).length + 1;
                preSourceLine = prevLine + prevLines + 1; // +1 for blank line between
            } else {
                return; // Can't determine line, skip
            }
        }
        // Code content starts after the ``` line
        const codeStartLine = preSourceLine + 1;

        // Split the code's child nodes by newlines and wrap each line
        const fragment = document.createDocumentFragment();
        let currentLine = document.createElement("span");
        currentLine.setAttribute("data-source-line", String(codeStartLine));
        let lineIdx = 0;

        function processNode(node) {
            if (node.nodeType === Node.TEXT_NODE) {
                const text = node.textContent;
                const parts = text.split("\n");
                for (let i = 0; i < parts.length; i++) {
                    if (i > 0) {
                        // Close current line: append \n to END of current span
                        currentLine.appendChild(document.createTextNode("\n"));
                        fragment.appendChild(currentLine);
                        lineIdx++;
                        currentLine = document.createElement("span");
                        currentLine.setAttribute("data-source-line", String(codeStartLine + lineIdx));
                    }
                    if (parts[i]) {
                        currentLine.appendChild(document.createTextNode(parts[i]));
                    }
                }
            } else if (node.nodeType === Node.ELEMENT_NODE) {
                // Check if this element contains newlines
                const text = node.textContent;
                if (!text.includes("\n")) {
                    // No newlines — append the whole element to current line
                    currentLine.appendChild(node.cloneNode(true));
                } else {
                    // Element spans multiple lines — process children
                    for (const child of Array.from(node.childNodes)) {
                        processNode(child);
                    }
                }
            }
        }

        const children = Array.from(code.childNodes);
        for (const child of children) {
            processNode(child);
        }
        // Append the last line
        if (currentLine.childNodes.length > 0) {
            fragment.appendChild(currentLine);
        }

        code.innerHTML = "";
        code.appendChild(fragment);

        // Remove data-source-line from <pre> so clicking empty areas inside the
        // code block doesn't fall through to the block's start line
        pre.removeAttribute("data-source-line");
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

