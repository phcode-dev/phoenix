/**
 * PostMessage bridge between Phoenix parent window and mdviewr iframe.
 * Handles bidirectional communication for content sync, theme, locale, and edit mode.
 */
import { on, emit } from "./core/events.js";
import { getState, setState } from "./core/state.js";
import { setLocale } from "./core/i18n.js";
import { marked } from "marked";

let _syncId = 0;
let _lastReceivedSyncId = -1;
let _suppressContentChange = false;
let _baseURL = "";

/**
 * Check if a URL is absolute (not relative to the document).
 */
function _isAbsoluteURL(href) {
    return /^(?:https?:\/\/|data:|\/\/|#|mailto:|tel:)/.test(href);
}

/**
 * Resolve a relative URL against the current base URL.
 */
function _resolveURL(href) {
    if (!href || !_baseURL || _isAbsoluteURL(href)) {
        return href;
    }
    try {
        return new URL(href, _baseURL).href;
    } catch {
        return href;
    }
}

/**
 * Annotate top-level tokens with their source line numbers.
 * This allows mapping rendered HTML elements back to markdown source lines.
 */
function _annotateTokenLines(tokens) {
    let line = 1;
    for (const token of tokens) {
        if (token.type !== "space") {
            token._sourceLine = line;
        }
        if (token.raw) {
            line += (token.raw.match(/\n/g) || []).length;
        }
    }
}

// Custom renderer that injects data-source-line attributes into block-level elements.
// We store references to the prototype methods, then call them with the real `this`
// (which has `this.parser`) inside marked.use() renderer overrides.
const _proto = marked.Renderer.prototype;

function _withSourceLine(protoFn, tagRegex) {
    return function (token) {
        const html = protoFn.call(this, token);
        if (token._sourceLine != null) {
            return html.replace(tagRegex, `$& data-source-line="${token._sourceLine}"`);
        }
        return html;
    };
}

marked.use({
    renderer: {
        heading: _withSourceLine(_proto.heading, /^<h[1-6]/),
        paragraph: _withSourceLine(_proto.paragraph, /^<p/),
        list: _withSourceLine(_proto.list, /^<[ou]l/),
        table: _withSourceLine(_proto.table, /^<table/),
        blockquote: _withSourceLine(_proto.blockquote, /^<blockquote/),
        code: _withSourceLine(_proto.code, /^<pre/),
        hr: _withSourceLine(_proto.hr, /^<hr/)
    }
});

/**
 * Parse markdown to HTML with mermaid detection and source line annotations.
 */
function parseMarkdownToHTML(markdown) {
    const has_mermaid = /```mermaid/i.test(markdown);
    // Use lexer + manual walkTokens + parser so we can annotate source lines.
    // marked.parser() does NOT invoke walkTokens, so we resolve URLs manually.
    const tokens = marked.lexer(markdown);
    _annotateTokenLines(tokens);
    marked.walkTokens(tokens, (token) => {
        if (token.type === "image" && token.href) {
            token.href = _resolveURL(token.href);
        } else if (token.type === "link" && token.href) {
            token.href = _resolveURL(token.href);
        }
    });
    const html = marked.parser(tokens);
    return { html, has_mermaid };
}

const _isMac = /Mac|iPod|iPhone|iPad/.test(navigator.platform);

/**
 * Initialize the postMessage bridge.
 */
export function initBridge() {
    // Listen for messages from Phoenix parent
    window.addEventListener("message", (event) => {
        const data = event.data;
        if (!data || !data.type) return;

        switch (data.type) {
            case "MDVIEWR_SET_CONTENT":
                handleSetContent(data);
                break;
            case "MDVIEWR_UPDATE_CONTENT":
                handleUpdateContent(data);
                break;
            case "MDVIEWR_SET_THEME":
                handleSetTheme(data);
                break;
            case "MDVIEWR_SET_EDIT_MODE":
                handleSetEditMode(data);
                break;
            case "MDVIEWR_SET_LOCALE":
                handleSetLocale(data);
                break;
            case "MDVIEWR_SCROLL_TO_LINE":
                handleScrollToLine(data);
                break;
        }
    });

    // Intercept keyboard shortcuts in capture phase before the mdviewr editor handles them.
    // Undo/redo is routed through CM5's undo stack so both editors stay in sync.
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            sendToParent("embeddedEscapeKeyPressed", {});
            return;
        }

        const isMod = _isMac ? e.metaKey : e.ctrlKey;
        if (!isMod) return;

        if (e.key === "z" && !e.shiftKey) {
            e.preventDefault();
            e.stopImmediatePropagation();
            sendToParent("mdviewrUndo", {});
            return;
        }

        if ((e.key === "z" && e.shiftKey) || e.key === "y") {
            e.preventDefault();
            e.stopImmediatePropagation();
            sendToParent("mdviewrRedo", {});
        }
    }, true);

    // Detect source line from data-source-line attributes for scroll sync.
    // In read mode, also refocus CM5 unless the user has a text selection.
    document.addEventListener("click", (e) => {
        const sourceLine = _getSourceLineFromElement(e.target);
        if (getState().editMode) {
            // In edit mode, sync cursor position but keep focus in the iframe
            if (sourceLine != null) {
                sendToParent("mdviewrScrollSync", { sourceLine });
            }
            return;
        }
        const selection = window.getSelection();
        if (!selection || selection.toString().length === 0) {
            sendToParent("embeddedIframeFocusEditor", { sourceLine });
        }
    }, true);

    // Listen for content changes from editor (debounced by editor.js)
    on("bridge:contentChanged", ({ markdown }) => {
        if (_suppressContentChange) return;
        _syncId++;
        sendToParent("mdviewrContentChanged", { markdown, _syncId });
    });

    // Listen for edit mode changes from toolbar
    on("state:editMode", (editMode) => {
        sendToParent("mdviewrEditModeChanged", { editMode });
    });

    // Notify parent that iframe is ready
    sendToParent("mdviewrReady", {});
}

function handleSetContent(data) {
    const { markdown, baseURL, filePath } = data;

    // Store base URL for resolving relative image/link paths in markdown
    if (baseURL) {
        _baseURL = baseURL;
    }

    // Parse and render
    _suppressContentChange = true;
    const parseResult = parseMarkdownToHTML(markdown);
    setState({
        currentContent: markdown,
        parseResult: parseResult
    });
    emit("file:rendered", parseResult);
    _suppressContentChange = false;
}

function handleUpdateContent(data) {
    const { markdown, _syncId: remoteSyncId } = data;

    // Ignore stale updates (echo from our own changes)
    if (remoteSyncId !== undefined && remoteSyncId <= _lastReceivedSyncId) {
        return;
    }
    if (remoteSyncId !== undefined) {
        _lastReceivedSyncId = remoteSyncId;
    }

    _suppressContentChange = true;

    const state = getState();
    if (state.editMode) {
        // In edit mode, we need to update the content without losing cursor
        // For now, re-render (this will be improved with more granular updates)
        const parseResult = parseMarkdownToHTML(markdown);
        setState({
            currentContent: markdown,
            parseResult: parseResult
        });
        emit("file:rendered", parseResult);
    } else {
        // In read mode, just re-render
        const parseResult = parseMarkdownToHTML(markdown);
        setState({
            currentContent: markdown,
            parseResult: parseResult
        });
        emit("file:rendered", parseResult);
    }

    _suppressContentChange = false;
}

function handleSetTheme(data) {
    const { theme } = data;
    document.documentElement.setAttribute("data-theme", theme);
    if (theme === "dark") {
        document.documentElement.style.colorScheme = "dark";
    } else {
        document.documentElement.style.colorScheme = "light";
    }
    setState({ theme });
}

function handleSetEditMode(data) {
    const { editMode } = data;
    setState({ editMode });
}

function handleSetLocale(data) {
    const { locale } = data;
    if (locale) {
        setLocale(locale);
    }
}

/**
 * Walk up the DOM from an element to find the nearest data-source-line attribute.
 * Returns the line number or null.
 */
function _getSourceLineFromElement(el) {
    while (el && el !== document.body) {
        const attr = el.getAttribute && el.getAttribute("data-source-line");
        if (attr != null) {
            return parseInt(attr, 10);
        }
        el = el.parentElement;
    }
    return null;
}

/**
 * Scroll the preview to show the element nearest to the given source line.
 * Only scrolls if the target element is not already visible in the viewport.
 */
function handleScrollToLine(data) {
    const { line } = data;
    if (line == null) {
        return;
    }

    const viewer = document.getElementById("viewer-content");
    if (!viewer) {
        return;
    }

    // Find the element with data-source-line closest to (but not exceeding) the target line
    const elements = viewer.querySelectorAll("[data-source-line]");
    let bestEl = null;
    let bestLine = -1;
    for (const el of elements) {
        const srcLine = parseInt(el.getAttribute("data-source-line"), 10);
        if (srcLine <= line && srcLine > bestLine) {
            bestLine = srcLine;
            bestEl = el;
        }
    }

    if (!bestEl) {
        return;
    }

    // Only scroll if the element is not visible in the scrollable container
    const container = document.getElementById("app-viewer");
    if (!container) {
        return;
    }
    const containerRect = container.getBoundingClientRect();
    const elRect = bestEl.getBoundingClientRect();

    const isVisible = elRect.top >= containerRect.top && elRect.bottom <= containerRect.bottom;
    if (!isVisible) {
        bestEl.scrollIntoView({ behavior: "instant", block: "center" });
    }
}

function sendToParent(eventName, payload) {
    if (!window.parent || window.parent === window) return;
    window.parent.postMessage({
        type: "MDVIEWR_EVENT",
        eventName,
        ...payload
    }, "*");
}
