/**
 * PostMessage bridge between Phoenix parent window and mdviewr iframe.
 * Handles bidirectional communication for content sync, theme, locale, and edit mode.
 * Integrates with doc-cache for instant file switching.
 */
import { on, emit } from "./core/events.js";
import { getState, setState } from "./core/state.js";
import { setLocale } from "./core/i18n.js";
import { marked } from "marked";
import * as docCache from "./core/doc-cache.js";

let _syncId = 0;
let _lastReceivedSyncId = -1;
let _suppressContentChange = false;
let _baseURL = "";
let _pendingReloadScroll = null; // { filePath, scrollPos, editMode } for scroll restore after reload

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
export function parseMarkdownToHTML(markdown) {
    const has_mermaid = /```mermaid/i.test(markdown);
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
    docCache.initDocCache();

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
            case "MDVIEWR_SWITCH_FILE":
                handleSwitchFile(data);
                break;
            case "MDVIEWR_CLEAR_CACHE":
                handleClearCache();
                break;
            case "MDVIEWR_WORKING_SET_CHANGED":
                handleWorkingSetChanged(data);
                break;
            case "MDVIEWR_CLOSE_FILE":
                handleCloseFile(data);
                break;
            case "MDVIEWR_RELOAD_FILE":
                handleReloadFile(data);
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
            case "MDVIEWR_HIGHLIGHT_SELECTION":
                handleHighlightSelection(data);
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

    // Listen for selection changes to sync selection back to CM
    document.addEventListener("selectionchange", () => {
        if (!getState().editMode) {
            return;
        }
        _sendSelectionToParent();
    });

    // Listen for content changes from editor (debounced by editor.js)
    on("bridge:contentChanged", ({ markdown }) => {
        if (_suppressContentChange) return;
        _syncId++;
        // Update the cache entry's mdSrc so it stays in sync
        const activePath = docCache.getActiveFilePath();
        if (activePath) {
            const entry = docCache.getEntry(activePath);
            if (entry) {
                entry.mdSrc = markdown;
            }
        }
        sendToParent("mdviewrContentChanged", { markdown, _syncId });
    });

    // Listen for edit mode changes from toolbar
    on("state:editMode", (editMode) => {
        sendToParent("mdviewrEditModeChanged", { editMode });
    });

    // Notify parent that iframe is ready
    sendToParent("mdviewrReady", {});
}

// --- Content handlers ---

function handleSetContent(data) {
    const { markdown, baseURL, filePath } = data;

    if (baseURL) {
        _baseURL = baseURL;
    }

    _suppressContentChange = true;
    const parseResult = parseMarkdownToHTML(markdown);

    if (filePath) {
        // Cache-aware: create/update entry and switch to it
        const existing = docCache.getEntry(filePath);
        if (existing) {
            docCache.updateEntry(filePath, markdown, parseResult);
        } else {
            docCache.createEntry(filePath, markdown, parseResult);
        }
        docCache.switchTo(filePath);
    }

    setState({
        currentContent: markdown,
        parseResult: parseResult
    });
    emit("file:rendered", parseResult);
    _suppressContentChange = false;
}

function handleUpdateContent(data) {
    const { markdown, _syncId: remoteSyncId, filePath } = data;

    if (remoteSyncId !== undefined && remoteSyncId <= _lastReceivedSyncId) {
        return;
    }
    if (remoteSyncId !== undefined) {
        _lastReceivedSyncId = remoteSyncId;
    }

    _suppressContentChange = true;

    // If update is for a background (non-active) file, just update cache
    const activePath = docCache.getActiveFilePath();
    if (filePath && activePath && filePath !== activePath) {
        const parseResult = parseMarkdownToHTML(markdown);
        docCache.updateEntry(filePath, markdown, parseResult);
        _suppressContentChange = false;
        return;
    }

    const parseResult = parseMarkdownToHTML(markdown);

    if (filePath) {
        const entry = docCache.getEntry(filePath);
        if (entry) {
            entry.mdSrc = markdown;
            entry.parseResult = parseResult;
            // Don't replace innerHTML — let file:rendered handle it
            // since the editor may be active
        }
    }

    setState({
        currentContent: markdown,
        parseResult: parseResult
    });
    emit("file:rendered", parseResult);

    _suppressContentChange = false;
}

/**
 * Cache-aware file switch. This is the core optimization:
 * - Cache hit + same content → just show cached DOM (instant)
 * - Cache hit + changed content → re-render in place
 * - Cache miss → parse, create entry, render
 */
function handleSwitchFile(data) {
    const { filePath, markdown, baseURL } = data;

    if (baseURL) {
        _baseURL = baseURL;
    }

    _suppressContentChange = true;

    // Save state for outgoing document
    const outgoingPath = docCache.getActiveFilePath();
    if (outgoingPath) {
        docCache.saveActiveScrollPos();
        // Save edit mode state in cache entry
        const outEntry = docCache.getEntry(outgoingPath);
        if (outEntry) {
            outEntry._editMode = getState().editMode;
        }
    }

    // Exit edit mode before switching DOM if currently editing
    if (getState().editMode) {
        emit("doc:beforeSwitch", { fromPath: outgoingPath, toPath: filePath });
        setState({ editMode: false });
    }

    const existing = docCache.getEntry(filePath);

    if (existing && existing.mdSrc === markdown) {
        // Cache hit, content unchanged — instant switch
        docCache.switchTo(filePath);

        setState({
            currentContent: markdown,
            parseResult: existing.parseResult
        });

        // Restore edit mode for this document
        if (existing._editMode) {
            setState({ editMode: true });
        }

        emit("file:switched", { filePath });
    } else if (existing) {
        // Cache hit, content changed — re-render in place
        const parseResult = parseMarkdownToHTML(markdown);
        docCache.updateEntry(filePath, markdown, parseResult);
        docCache.switchTo(filePath);

        setState({
            currentContent: markdown,
            parseResult: parseResult
        });

        // Restore edit mode for this document
        if (existing._editMode) {
            setState({ editMode: true });
        }

        emit("file:rendered", parseResult);
    } else {
        // Cache miss — create new entry
        const parseResult = parseMarkdownToHTML(markdown);
        docCache.createEntry(filePath, markdown, parseResult);
        docCache.switchTo(filePath);

        // Restore scroll position from reload if applicable
        if (_pendingReloadScroll && _pendingReloadScroll.filePath === filePath) {
            const entry = docCache.getEntry(filePath);
            if (entry) {
                entry._scrollSourceLine = _pendingReloadScroll.scrollSourceLine;
                entry._editMode = _pendingReloadScroll.editMode;
            }
            const restoreEditMode = _pendingReloadScroll.editMode;
            _pendingReloadScroll = null;

            setState({
                currentContent: markdown,
                parseResult: parseResult
            });
            emit("file:rendered", parseResult);

            // Scroll to source line element after render
            if (entry && entry._scrollSourceLine) {
                requestAnimationFrame(() => {
                    const els = entry.dom.querySelectorAll("[data-source-line]");
                    for (const el of els) {
                        if (parseInt(el.getAttribute("data-source-line"), 10) === entry._scrollSourceLine) {
                            el.scrollIntoView({ behavior: "instant", block: "start" });
                            break;
                        }
                    }
                });
            }

            if (restoreEditMode) {
                setState({ editMode: true });
            }
        } else {
            setState({
                currentContent: markdown,
                parseResult: parseResult
            });
            emit("file:rendered", parseResult);
        }
    }

    _suppressContentChange = false;
}

function handleClearCache() {
    // Exit edit mode if active
    if (getState().editMode) {
        setState({ editMode: false });
    }
    docCache.clearAll();
}

function handleWorkingSetChanged(data) {
    const { paths } = data;
    if (Array.isArray(paths)) {
        docCache.setWorkingSet(paths);
    }
}

function handleCloseFile(data) {
    const { filePath } = data;
    if (filePath) {
        docCache.removeEntry(filePath);
    }
}

/**
 * Reload a specific file: save scroll position, clear its cache entry,
 * so the next SWITCH_FILE will re-render from scratch.
 */
function handleReloadFile(data) {
    const { filePath } = data;
    if (!filePath) return;

    const entry = docCache.getEntry(filePath);
    const savedScrollPos = entry ? entry.scrollPos : 0;
    const wasEditMode = entry ? entry._editMode : false;

    // If this is the active file, save current scroll
    if (docCache.getActiveFilePath() === filePath) {
        docCache.saveActiveScrollPos();
        const activeEntry = docCache.getEntry(filePath);
        if (activeEntry) {
            const scrollSourceLine = activeEntry._scrollSourceLine;
            if (getState().editMode) {
                setState({ editMode: false });
            }
            docCache.removeEntry(filePath);
            _pendingReloadScroll = { filePath, scrollSourceLine, editMode: wasEditMode };
        }
    } else {
        docCache.removeEntry(filePath);
    }
}

// --- Theme, edit mode, locale ---

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

// --- Scroll sync ---

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

function handleScrollToLine(data) {
    const { line } = data;
    if (line == null) return;

    const viewer = document.getElementById("viewer-content");
    if (!viewer) return;

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

    if (!bestEl) return;

    const container = document.getElementById("app-viewer");
    if (!container) return;
    const containerRect = container.getBoundingClientRect();
    const elRect = bestEl.getBoundingClientRect();

    const isVisible = elRect.top >= containerRect.top && elRect.bottom <= containerRect.bottom;
    if (!isVisible) {
        bestEl.scrollIntoView({ behavior: "instant", block: "center" });
    }
}

// --- Selection sync ---

function _clearSelectionHighlight() {
    const viewer = document.getElementById("viewer-content");
    if (!viewer) return;
    viewer.querySelectorAll(".cm-selection-highlight").forEach(el => {
        el.classList.remove("cm-selection-highlight");
    });
}

function handleHighlightSelection(data) {
    _clearSelectionHighlight();

    const { fromLine, toLine, selectedText } = data;
    if (fromLine == null || toLine == null || !selectedText) return;

    const viewer = document.getElementById("viewer-content");
    if (!viewer) return;

    const elements = viewer.querySelectorAll("[data-source-line]");
    const matchingEls = [];

    for (const el of elements) {
        const srcLine = parseInt(el.getAttribute("data-source-line"), 10);
        if (srcLine >= fromLine && srcLine <= toLine) {
            matchingEls.push(el);
        }
    }

    if (matchingEls.length === 0) {
        let bestEl = null;
        let bestLine = -1;
        for (const el of elements) {
            const srcLine = parseInt(el.getAttribute("data-source-line"), 10);
            if (srcLine <= fromLine && srcLine > bestLine) {
                bestLine = srcLine;
                bestEl = el;
            }
        }
        if (bestEl) {
            matchingEls.push(bestEl);
        }
    }

    for (const el of matchingEls) {
        el.classList.add("cm-selection-highlight");
    }
}

let _selectionSendTimer = null;
function _sendSelectionToParent() {
    clearTimeout(_selectionSendTimer);
    _selectionSendTimer = setTimeout(() => {
        const selection = window.getSelection();
        if (!selection || !selection.rangeCount) return;

        const anchorNode = selection.anchorNode;
        const el = anchorNode && (anchorNode.nodeType === Node.ELEMENT_NODE
            ? anchorNode : anchorNode.parentElement);
        const sourceLine = _getSourceLineFromElement(el);

        if (selection.isCollapsed || selection.toString().length < 2) {
            _clearSelectionHighlight();
            if (sourceLine != null) {
                sendToParent("mdviewrSelectionSync", { sourceLine, selectedText: null });
            }
            return;
        }

        const selectedText = selection.toString();
        if (sourceLine != null) {
            sendToParent("mdviewrSelectionSync", { sourceLine, selectedText });
        }
    }, 200);
}

function sendToParent(eventName, payload) {
    if (!window.parent || window.parent === window) return;
    window.parent.postMessage({
        type: "MDVIEWR_EVENT",
        eventName,
        ...payload
    }, "*");
}
