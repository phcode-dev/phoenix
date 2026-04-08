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
import { broadcastSelectionStateSync } from "./components/editor.js";

let _syncId = 0;
let _lastReceivedSyncId = -1;
let _suppressContentChange = false;
let _scrollFromCM = false;
let _scrollFromViewer = false;
let _suppressScrollToLine = false;
let _baseURL = "";
let _cursorPosBeforeEdit = null; // cursor position before current edit batch
let _cursorPosDirty = false; // true after content changes, reset when emitted
let _pendingReloadScroll = null; // { filePath, scrollSourceLine } for scroll restore after reload

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
        // Recursively annotate children with their source lines
        _annotateTokenChildren(token, line);
        if (token.raw) {
            line += (token.raw.match(/\n/g) || []).length;
        }
    }
}

function _annotateTokenChildren(token, startLine) {
    // List items
    if (token.type === "list" && token.items) {
        let itemLine = startLine;
        for (const item of token.items) {
            item._sourceLine = itemLine;
            if (item.tokens) {
                _annotateNestedTokens(item.tokens, itemLine);
            }
            if (item.raw) {
                itemLine += (item.raw.match(/\n/g) || []).length;
            }
        }
    }
    // Blockquote children
    if (token.type === "blockquote" && token.tokens) {
        _annotateNestedTokens(token.tokens, startLine);
    }
    // Table rows
    if (token.type === "table") {
        if (token.header) {
            for (const cell of token.header) {
                cell._sourceLine = startLine;
            }
        }
        if (token.rows) {
            let rowLine = startLine + 2;
            for (const row of token.rows) {
                for (const cell of row) {
                    cell._sourceLine = rowLine;
                }
                rowLine++;
            }
        }
    }
}

function _annotateNestedTokens(tokens, startLine) {
    let line = startLine;
    for (const token of tokens) {
        if (token.type !== "space") {
            token._sourceLine = line;
        }
        // Recurse into nested lists
        if (token.type === "list" && token.items) {
            let itemLine = line;
            for (const item of token.items) {
                item._sourceLine = itemLine;
                if (item.tokens) {
                    _annotateNestedTokens(item.tokens, itemLine);
                }
                if (item.raw) {
                    itemLine += (item.raw.match(/\n/g) || []).length;
                }
            }
        }
        // Recurse into blockquote children
        if (token.type === "blockquote" && token.tokens) {
            _annotateNestedTokens(token.tokens, line);
        }
        // Annotate table rows
        if (token.type === "table") {
            // Header row
            if (token.header) {
                for (const cell of token.header) {
                    cell._sourceLine = line;
                }
            }
            // Body rows: each row is one line after header + separator (2 lines)
            if (token.rows) {
                let rowLine = line + 2; // skip header + separator lines
                for (const row of token.rows) {
                    for (const cell of row) {
                        cell._sourceLine = rowLine;
                    }
                    rowLine++;
                }
            }
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
        listitem: _withSourceLine(_proto.listitem, /^<li/),
        table: _withSourceLine(_proto.table, /^<table/),
        tablecell: _withSourceLine(_proto.tablecell, /^<t[dh]/),
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

    // Expose helpers for test access (test iframes have no sandbox)
    window.__getActiveFilePath = docCache.getActiveFilePath;
    window.__getCurrentContent = function () {
        return getState().currentContent;
    };
    window.__setEditModeForTest = function (editMode) {
        setState({ editMode });
    };
    window.__isSuppressingContentChange = function () {
        return _suppressContentChange;
    };
    window.__getCacheKeys = function () {
        return docCache._getCacheKeysForTest();
    };
    window.__getWorkingSetPaths = function () {
        return docCache._getWorkingSetPathsForTest();
    };
    window.__resetCacheForTest = function () {
        docCache.clearAll();
    };
    window.__toggleSearchForTest = function () {
        emit("action:toggle-search");
    };
    window.__broadcastSelectionStateForTest = function () {
        broadcastSelectionStateSync();
    };
    window.__triggerContentSync = function () {
        const content = document.getElementById("viewer-content");
        if (content) {
            content.dispatchEvent(new Event("input", { bubbles: true }));
        }
    };
    window.__clickCheckboxForTest = function (index) {
        const content = document.getElementById("viewer-content");
        if (!content) { return false; }
        const checkboxes = content.querySelectorAll('input[type="checkbox"]');
        if (index >= checkboxes.length) { return false; }
        checkboxes[index].click();
        return checkboxes[index].checked;
    };

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
            case "MDVIEWR_RERENDER_CONTENT":
                handleRerenderContent(data);
                break;
            case "MDVIEWR_SOURCE_LINES":
                emit("editor:source-lines", data.markdown);
                break;
            case "MDVIEWR_TOOLBAR_STATE":
                if (data.state) {
                    emit("editor:selection-state", data.state);
                }
                break;
            case "MDVIEWR_IMAGE_UPLOAD_RESULT":
                _handleImageUploadResult(data);
                break;
            case "_TEST_FOCUS_CLICK":
                document.body.click();
                break;
            case "_TEST_SELECT_TEXT_AND_CLICK": {
                const selection = window.getSelection();
                const range = document.createRange();
                range.selectNodeContents(document.body);
                selection.removeAllRanges();
                selection.addRange(range);
                document.body.click();
                break;
            }
            case "_TEST_UNSELECT_TEXT_AND_CLICK":
                window.getSelection().removeAllRanges();
                document.body.click();
                break;
        }
    });

    // Intercept keyboard shortcuts in capture phase before the mdviewr editor handles them.
    // Undo/redo is routed through CM5's undo stack so both editors stay in sync.
    // Unhandled modifier shortcuts are forwarded to Phoenix's keybinding manager.
    const _mdEditorHandledKeys = new Set(["b", "i", "k", "u", "z", "y", "a", "c", "v", "x"]); // Ctrl/Cmd + key
    const _mdEditorHandledShiftKeys = new Set(["x", "X", "z", "Z"]); // Ctrl/Cmd + Shift + key

    document.addEventListener("keydown", (e) => {
        // Don't intercept shortcuts when focus is in any input/textarea (except Escape)
        // This covers dialog inputs, search bar input, link popover input, etc.
        const activeEl = document.activeElement;
        if (e.key !== "Escape" && activeEl &&
            (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA") &&
            !activeEl.closest("#viewer-content")) {
            return;
        }

        if (e.key === "Escape") {
            // Don't forward Escape to Phoenix if any popup/overlay is open
            const popupSelectors = [
                "#search-bar.open",
                "#slash-menu-anchor.visible",
                "#lang-picker.visible",
                "#link-popover.visible"
            ];
            const hasOpenPopup = popupSelectors.some(sel => document.querySelector(sel));
            if (hasOpenPopup) {
                // Let the popup handle Escape, then refocus editor
                setTimeout(() => {
                    const content = document.getElementById("viewer-content");
                    if (content && getState().editMode) {
                        content.focus({ preventScroll: true });
                    }
                }, 0);
                return;
            }
            sendToParent("embeddedEscapeKeyPressed", {});
            return;
        }

        // Forward function keys to Phoenix
        if (e.key.startsWith("F") && e.key.length >= 2 && !isNaN(e.key.slice(1))) {
            e.preventDefault();
            e.stopImmediatePropagation();
            sendToParent("mdviewrKeyboardShortcut", {
                key: e.key,
                code: e.code,
                ctrlKey: e.ctrlKey,
                metaKey: e.metaKey,
                shiftKey: e.shiftKey,
                altKey: e.altKey
            });
            return;
        }

        const isMod = _isMac ? e.metaKey : e.ctrlKey;
        if (!isMod) return;

        if ((e.key === "z" || e.key === "Z") && !e.shiftKey) {
            e.preventDefault();
            e.stopImmediatePropagation();
            sendToParent("mdviewrUndo", {});
            return;
        }

        if (((e.key === "z" || e.key === "Z") && e.shiftKey) || e.key === "y") {
            e.preventDefault();
            e.stopImmediatePropagation();
            sendToParent("mdviewrRedo", {});
            return;
        }

        // Ctrl/Cmd+F — open in-document search
        if (e.key === "f" && !e.shiftKey) {
            e.preventDefault();
            e.stopImmediatePropagation();
            emit("action:toggle-search");
            return;
        }

        // Forward unhandled modifier shortcuts to Phoenix keybinding manager
        if (getState().editMode) {
            const isHandled = e.shiftKey
                ? _mdEditorHandledShiftKeys.has(e.key)
                : _mdEditorHandledKeys.has(e.key);
            if (!isHandled) {
                e.preventDefault();
                e.stopImmediatePropagation();
                sendToParent("mdviewrKeyboardShortcut", {
                    key: e.key,
                    code: e.code,
                    ctrlKey: e.ctrlKey,
                    metaKey: e.metaKey,
                    shiftKey: e.shiftKey,
                    altKey: e.altKey
                });
                // Refocus md editor after Phoenix handles the shortcut
                // (some commands like Save focus the CM editor)
                setTimeout(() => {
                    const content = document.getElementById("viewer-content");
                    if (content && getState().editMode) {
                        content.focus({ preventScroll: true });
                    }
                }, 100);
            }
        }
    }, true);

    // Detect source line from data-source-line attributes for scroll sync.
    // In read mode, also refocus CM5 unless the user has a text selection.
    // Disabled in preview mode (no cursor sync).
    document.addEventListener("click", (e) => {
        const sourceLine = _getSourceLineFromElement(e.target);
        if (getState().editMode) {
            if (sourceLine != null) {
                _scrollFromViewer = true;
                setTimeout(() => { _scrollFromViewer = false; }, 500);
                sendToParent("mdviewrScrollSync", { sourceLine });
            }
            return;
        }
        const selection = window.getSelection();
        if (!selection || selection.toString().length === 0) {
            sendToParent("embeddedIframeFocusEditor", { sourceLine });
        }
    }, true);

    // Scroll sync: when viewer scrolls, send first visible source line to CM
    let _viewerScrollRAF = null;
    const appViewer = document.getElementById("app-viewer");
    if (appViewer) {
        appViewer.addEventListener("scroll", () => {
            if (_scrollFromCM) return;
            if (_viewerScrollRAF) { cancelAnimationFrame(_viewerScrollRAF); }
            _viewerScrollRAF = requestAnimationFrame(() => {
                _viewerScrollRAF = null;
                const viewer = document.getElementById("viewer-content");
                if (!viewer) return;
                const viewerRect = appViewer.getBoundingClientRect();
                const elements = viewer.querySelectorAll("[data-source-line]");
                let bestEl = null;
                let bestDist = Infinity;
                for (const el of elements) {
                    const rect = el.getBoundingClientRect();
                    const dist = Math.abs(rect.top - viewerRect.top);
                    if (dist < bestDist) {
                        bestDist = dist;
                        bestEl = el;
                    }
                }
                if (bestEl) {
                    const sourceLine = parseInt(bestEl.getAttribute("data-source-line"), 10);
                    sendToParent("mdviewrScrollSync", { sourceLine, fromScroll: true });
                }
            });
        });
    }

    // Listen for selection changes to sync selection back to CM
    // Also track cursor position for undo/redo restore
    document.addEventListener("selectionchange", () => {
        if (!getState().editMode) {
            return;
        }
        // Only update cursor position if we're not mid-edit
        // (once content changes, freeze position until emitted)
        if (!_cursorPosDirty) {
            _cursorPosBeforeEdit = _getCursorPosition();
        }
        // Fast path: send just the source line for instant CM highlight
        _sendCursorLineToParent();
        // Full selection sync (debounced)
        _sendSelectionToParent();
    });

    // Freeze cursor position on first input (before debounce fires)
    document.addEventListener("input", () => {
        if (getState().editMode) {
            _cursorPosDirty = true;
        }
    }, true);

    // Listen for content changes from editor (debounced by editor.js)
    on("bridge:contentChanged", ({ markdown }) => {
        if (_suppressContentChange) return;
        _syncId++;
        // Keep state.currentContent in sync so edit→reader re-render has latest content
        setState({ currentContent: markdown });
        // Update the cache entry's mdSrc so it stays in sync
        const activePath = docCache.getActiveFilePath();
        if (activePath) {
            const entry = docCache.getEntry(activePath);
            if (entry) {
                entry.mdSrc = markdown;
            }
        }
        // Send cursor position BEFORE the edit for undo restore
        sendToParent("mdviewrContentChanged", { markdown, _syncId, cursorPos: _cursorPosBeforeEdit });
        _cursorPosDirty = false; // allow cursor tracking again
    });

    // Listen for edit mode changes from toolbar
    on("state:editMode", (editMode) => {
        sendToParent("mdviewrEditModeChanged", { editMode });
    });

    // Edit mode request — ask Phoenix for permission (entitlement check)
    on("request:editMode", () => {
        sendToParent("mdviewrRequestEditMode", {});
    });

    // Forward image upload request from editor to Phoenix
    on("bridge:uploadImage", async ({ blob, filename, uploadId }) => {
        const arrayBuffer = await blob.arrayBuffer();
        sendToParent("mdviewrImageUploadRequest", {
            arrayBuffer,
            mimeType: blob.type,
            filename,
            uploadId
        });
    });

    // Cursor sync toggle
    on("toggle:cursorSync", ({ enabled }) => {
        sendToParent("mdviewrCursorSyncToggle", { enabled });
    });

    // Toggle selection color class based on iframe focus
    // (::selection + :focus doesn't work in WebKit)
    window.addEventListener("focus", () => {
        const content = document.getElementById("viewer-content");
        if (content) content.classList.add("content-focused");
    });
    window.addEventListener("blur", () => {
        const content = document.getElementById("viewer-content");
        if (content) content.classList.remove("content-focused");
    });

    // Notify parent that iframe is ready
    sendToParent("mdviewrReady", {});
}

// --- Content handlers ---

function handleSetContent(data) {
    const { markdown, baseURL, filePath } = data;

    // Reset sync tracking — Phoenix resets its counter on activate
    _lastReceivedSyncId = -1;

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
    // file:rendered triggers viewer.js handler which does morphdom + renderAfterHTML
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
        }
    }

    setState({
        currentContent: markdown,
        parseResult: parseResult
    });

    emit("file:rendered", parseResult);

    // Restore cursor on undo/redo using source line + offset within block
    if (data.cursorPos && getState().editMode) {
        const content = document.getElementById("viewer-content");
        if (content) {
            _restoreCursorPosition(content, data.cursorPos);
        }
    }

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

    // Reset sync tracking — Phoenix resets its counter on activate
    _lastReceivedSyncId = -1;
    _syncId = 0;

    if (baseURL) {
        _baseURL = baseURL;
    }

    _suppressContentChange = true;

    // Suppress scroll-to-line from CM during file switch — the doc cache
    // restores the correct scroll position; CM cursor activity would override it.
    _suppressScrollToLine = true;
    setTimeout(() => { _suppressScrollToLine = false; }, 500);

    // Edit mode is global for the md editor frame — preserve it across file switches
    const wasEditMode = getState().editMode;

    // Save state for outgoing document
    const outgoingPath = docCache.getActiveFilePath();
    if (outgoingPath) {
        docCache.saveActiveScrollPos();
    }

    // Exit edit mode before switching DOM to detach handlers from outgoing element
    if (wasEditMode) {
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

        emit("file:rendered", parseResult);
    } else {
        // Cache miss — create new entry
        const parseResult = parseMarkdownToHTML(markdown);
        docCache.createEntry(filePath, markdown, parseResult);
        docCache.switchTo(filePath);

        // Restore scroll position and edit mode from reload if applicable
        if (_pendingReloadScroll && _pendingReloadScroll.filePath === filePath) {
            const entry = docCache.getEntry(filePath);
            if (entry) {
                entry._scrollSourceLine = _pendingReloadScroll.scrollSourceLine;
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

    // Re-enter edit mode on the new DOM if the frame was in edit mode
    if (wasEditMode) {
        setState({ editMode: true });
    }

    _suppressContentChange = false;
}

function handleClearCache() {
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
    if (!filePath) {
        return;
    }

    const entry = docCache.getEntry(filePath);

    // If this is the active file, save current scroll
    if (docCache.getActiveFilePath() === filePath) {
        docCache.saveActiveScrollPos();
        const activeEntry = docCache.getEntry(filePath);
        if (activeEntry) {
            const scrollSourceLine = activeEntry._scrollSourceLine;
            const wasEditMode = getState().editMode;
            if (wasEditMode) {
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
    const newScheme = theme === "dark" ? "dark" : "light";
    // Skip if already applied to avoid reflows that can reset scroll position
    if (document.documentElement.getAttribute("data-theme") === theme &&
        document.documentElement.style.colorScheme === newScheme) {
        return;
    }
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.style.colorScheme = newScheme;
    setState({ theme });
}

function handleSetEditMode(data) {
    const { editMode } = data;
    setState({ editMode });
}

/**
 * Re-render content from CM's authoritative markdown.
 * Called when switching edit→reader so data-source-line attributes are accurate.
 */
function handleRerenderContent(data) {
    const { markdown } = data;
    if (!markdown) return;
    const parseResult = parseMarkdownToHTML(markdown);
    setState({ currentContent: markdown, parseResult });
    emit("file:rendered", parseResult);
}

function _handleImageUploadResult(data) {
    const { uploadId, embedURL, error } = data;
    const content = document.getElementById("viewer-content");
    if (!content || !uploadId) return;
    const placeholder = content.querySelector(`img[data-upload-id="${uploadId}"]`);
    if (!placeholder) return;

    if (embedURL) {
        placeholder.src = embedURL;
        placeholder.alt = placeholder.alt === "Uploading..." ? "" : placeholder.alt;
        placeholder.removeAttribute("data-upload-id");
    } else {
        placeholder.remove();
    }
    content.dispatchEvent(new Event("input", { bubbles: true }));
}


function handleSetLocale(data) {
    const { locale } = data;
    if (locale) {
        setLocale(locale);
    }
}

// --- Scroll sync ---

/**
 * Get the cursor position as { sourceLine, offsetInBlock }.
 * sourceLine: the data-source-line of the containing block (stable across re-renders)
 * offsetInBlock: character offset within that block (precise within a small element)
 */
function _getCursorPosition() {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return null;
    const range = sel.getRangeAt(0);

    // Find the source-line block element
    let blockEl = sel.anchorNode;
    if (blockEl && blockEl.nodeType === Node.TEXT_NODE) blockEl = blockEl.parentElement;
    while (blockEl && !blockEl.getAttribute?.("data-source-line")) {
        blockEl = blockEl.parentElement;
    }
    if (!blockEl) return null;

    const sourceLine = parseInt(blockEl.getAttribute("data-source-line"), 10);

    // Calculate character offset within this block
    const pre = document.createRange();
    pre.setStart(blockEl, 0);
    pre.setEnd(range.startContainer, range.startOffset);
    const offsetInBlock = pre.toString().length;

    return { sourceLine, offsetInBlock };
}

/**
 * Restore cursor to a position defined by { sourceLine, offsetInBlock }.
 */
function _restoreCursorPosition(contentEl, pos) {
    if (!pos || !pos.sourceLine) return;

    // Find the block element matching the source line
    const elements = contentEl.querySelectorAll("[data-source-line]");
    let bestEl = null;
    let bestLine = -1;
    for (const el of elements) {
        const srcLine = parseInt(el.getAttribute("data-source-line"), 10);
        if (srcLine <= pos.sourceLine && srcLine > bestLine) {
            bestLine = srcLine;
            bestEl = el;
        }
    }
    if (!bestEl) return;

    // Walk text nodes within the block to find the exact offset
    const offset = pos.offsetInBlock || 0;
    const walker = document.createTreeWalker(bestEl, NodeFilter.SHOW_TEXT);
    let remaining = offset;
    let node;
    while ((node = walker.nextNode())) {
        if (remaining <= node.textContent.length) {
            const range = document.createRange();
            range.setStart(node, remaining);
            range.collapse(true);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
            return;
        }
        remaining -= node.textContent.length;
    }

    // Fallback: place at start of element
    const range = document.createRange();
    range.selectNodeContents(bestEl);
    range.collapse(true);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
}

function _getSourceLineFromElement(el) {
    // Use the current selection to determine exact position within <br> paragraphs
    const sel = window.getSelection();
    const cursorNode = sel && sel.rangeCount ? sel.getRangeAt(0).startContainer : null;

    while (el && el !== document.body) {
        const attr = el.getAttribute && el.getAttribute("data-source-line");
        if (attr != null) {
            let line = parseInt(attr, 10);
            if (cursorNode) {
                // For paragraphs with <br> (soft line breaks), count <br>
                // elements before the cursor for the exact CM line.
                if (el.tagName === "P" && el.querySelector("br")) {
                    const brs = el.querySelectorAll("br");
                    for (const br of brs) {
                        const pos = br.compareDocumentPosition(cursorNode);
                        if (pos & Node.DOCUMENT_POSITION_FOLLOWING || pos & Node.DOCUMENT_POSITION_CONTAINED_BY) {
                            line++;
                        }
                    }
                }
                // For code blocks, count \n before cursor in textContent.
                // data-source-line on <pre> points to the ``` fence line,
                // so first code line = line + 1, each \n increments.
                if (el.tagName === "PRE") {
                    const code = el.querySelector("code") || el;
                    try {
                        const range = document.createRange();
                        range.setStart(code, 0);
                        range.setEnd(sel.getRangeAt(0).startContainer, sel.getRangeAt(0).startOffset);
                        const textBefore = range.toString();
                        const newlines = (textBefore.match(/\n/g) || []).length;
                        line += 1 + newlines; // +1 for the ``` fence line
                    } catch (_e) {
                        line += 1; // fallback: first code line
                    }
                }
            }
            return line;
        }
        el = el.parentElement;
    }
    return null;
}

function handleScrollToLine(data) {
    const { line, fromScroll, tableCol } = data;
    if (line == null) return;

    // Suppress during file switch — doc cache restores the correct scroll
    if (_suppressScrollToLine) return;

    // In edit mode, ignore scroll-based sync that originated from the viewer
    // itself (feedback loop: viewer click → CM scroll → scroll sync back).
    if (fromScroll && getState().editMode && _scrollFromViewer) return;

    const viewer = document.getElementById("viewer-content");
    if (!viewer) return;

    const skipHighlight = getState().editMode && viewer.contains(document.activeElement);

    const elements = viewer.querySelectorAll("[data-source-line]");
    let bestEl = null;
    let bestLine = -1;
    for (const el of elements) {
        const srcLine = parseInt(el.getAttribute("data-source-line"), 10);
        if (srcLine <= line && srcLine >= bestLine) {
            bestLine = srcLine;
            bestEl = el;
        }
    }

    if (!bestEl) return;

    // For table cells: if tableCol is specified, find the specific cell in the row
    if (tableCol != null && bestEl.closest("tr")) {
        const tr = bestEl.closest("tr");
        const cells = tr.querySelectorAll("td, th");
        if (tableCol < cells.length) {
            bestEl = cells[tableCol];
        }
    }

    // For multi-line blocks, find the specific visual line to scroll to.
    let scrollTarget = bestEl;
    if (bestLine < line) {
        if (bestEl.tagName === "P") {
            // Paragraphs with <br>: use the <br> element as scroll target.
            const brOffset = line - bestLine;
            const brs = bestEl.querySelectorAll("br");
            if (brOffset > 0 && brOffset <= brs.length) {
                scrollTarget = brs[brOffset - 1];
            }
        } else if (bestEl.tagName === "PRE") {
            // Code blocks: find the text node containing the target \n
            // and create a temporary span to scroll to.
            const codeLineOffset = line - bestLine - 1; // -1 for ``` fence
            const code = bestEl.querySelector("code") || bestEl;
            const text = code.textContent;
            let nlCount = 0;
            let charIdx = 0;
            for (let i = 0; i < text.length; i++) {
                if (text[i] === "\n") {
                    if (nlCount === codeLineOffset) {
                        charIdx = i + 1;
                        break;
                    }
                    nlCount++;
                }
            }
            // Walk text nodes to find the one containing charIdx
            const walker = document.createTreeWalker(code, NodeFilter.SHOW_TEXT);
            let offset = 0;
            let targetNode = null;
            while (walker.nextNode()) {
                const len = walker.currentNode.textContent.length;
                if (offset + len >= charIdx) {
                    targetNode = walker.currentNode;
                    break;
                }
                offset += len;
            }
            if (targetNode) {
                // Insert a temporary marker to scroll to, then remove it
                const marker = document.createElement("span");
                const splitAt = charIdx - offset;
                if (splitAt > 0 && splitAt < targetNode.textContent.length) {
                    targetNode.splitText(splitAt);
                    targetNode.parentNode.insertBefore(marker, targetNode.nextSibling);
                } else {
                    targetNode.parentNode.insertBefore(marker, targetNode);
                }
                scrollTarget = marker;
                // Clean up after scroll
                requestAnimationFrame(() => {
                    marker.remove();
                    code.normalize();
                });
            }
        }
    }

    const container = document.getElementById("app-viewer");
    if (!container) return;
    const containerRect = container.getBoundingClientRect();
    const elRect = scrollTarget.getBoundingClientRect();

    // Suppress viewer→CM scroll feedback for any CM-initiated scroll
    _scrollFromCM = true;
    if (fromScroll) {
        // Sync scroll: always align to top, even if visible
        scrollTarget.scrollIntoView({ behavior: "instant", block: "start" });
    } else {
        // Cursor-based scroll: only scroll if not visible, center it
        const isVisible = elRect.top >= containerRect.top && elRect.bottom <= containerRect.bottom;
        if (!isVisible) {
            scrollTarget.scrollIntoView({ behavior: "instant", block: "center" });
        }
    }
    setTimeout(() => { _scrollFromCM = false; }, 200);

    // Persistent highlight on the element corresponding to the CM cursor.
    // Skip highlight when viewer has focus to avoid cursor displacement.
    if (skipHighlight) return;
    _removeCursorHighlight(viewer);

    // For <br> paragraphs, wrap only the specific line's content in a
    // highlight span instead of highlighting the whole <p>.
    if (bestEl.tagName === "P" && bestEl.querySelector("br")) {
        const brOffset = line - bestLine;
        const brs = bestEl.querySelectorAll("br");
        const span = document.createElement("span");
        span.className = "cursor-sync-highlight cursor-sync-br-line";
        if (brOffset === 0) {
            // First line: wrap nodes before the first <br>
            let node = bestEl.firstChild;
            while (node && !(node.nodeType === Node.ELEMENT_NODE && node.tagName === "BR")) {
                const toMove = node;
                node = node.nextSibling;
                span.appendChild(toMove);
            }
            bestEl.insertBefore(span, bestEl.firstChild);
        } else if (brOffset > 0 && brOffset <= brs.length) {
            // Subsequent lines: wrap nodes after the target <br>
            const targetBr = brs[brOffset - 1];
            let next = targetBr.nextSibling;
            while (next && !(next.nodeType === Node.ELEMENT_NODE && next.tagName === "BR")) {
                const toMove = next;
                next = next.nextSibling;
                span.appendChild(toMove);
            }
            targetBr.parentNode.insertBefore(span, targetBr.nextSibling);
        } else {
            bestEl.classList.add("cursor-sync-highlight");
        }
    } else if (bestEl.tagName === "PRE" && bestLine < line) {
        // Code blocks: use a positioned overlay at the target line's height.
        // We can't wrap text without breaking Prism token spans.
        const code = bestEl.querySelector("code") || bestEl;
        const codeLineOffset = line - bestLine - 1; // -1 for ``` fence
        // Find the character position of the target line
        const text = code.textContent;
        let charPos = 0;
        let nlCount = 0;
        for (let i = 0; i < text.length && nlCount < codeLineOffset; i++) {
            if (text[i] === "\n") nlCount++;
            charPos = i + 1;
        }
        // Create a range spanning the target line to get its rect
        try {
            const walker = document.createTreeWalker(code, NodeFilter.SHOW_TEXT);
            let offset = 0;
            let startNode = null, startOff = 0, endNode = null, endOff = 0;
            while (walker.nextNode()) {
                const node = walker.currentNode;
                const len = node.textContent.length;
                if (!startNode && offset + len >= charPos) {
                    startNode = node;
                    startOff = charPos - offset;
                }
                // Find end of this line (next \n or end of text)
                const lineEnd = text.indexOf("\n", charPos);
                const endPos = lineEnd === -1 ? text.length : lineEnd;
                if (!endNode && offset + len >= endPos) {
                    endNode = node;
                    endOff = endPos - offset;
                }
                if (startNode && endNode) break;
                offset += len;
            }
            if (startNode && endNode) {
                const lineRange = document.createRange();
                lineRange.setStart(startNode, startOff);
                lineRange.setEnd(endNode, endOff);
                const lineRect = lineRange.getClientRects()[0];
                if (lineRect) {
                    const preRect = bestEl.getBoundingClientRect();
                    const overlay = document.createElement("div");
                    overlay.className = "cursor-sync-highlight cursor-sync-code-line";
                    overlay.style.position = "absolute";
                    overlay.style.left = "0";
                    overlay.style.right = "0";
                    overlay.style.top = (lineRect.top - preRect.top) + "px";
                    overlay.style.height = lineRect.height + "px";
                    overlay.style.pointerEvents = "none";
                    bestEl.style.position = "relative";
                    bestEl.appendChild(overlay);
                }
            }
        } catch (_e) {
            bestEl.classList.add("cursor-sync-highlight");
        }
    } else {
        bestEl.classList.add("cursor-sync-highlight");
    }
    _lastHighlightSourceLine = bestLine;
    _lastHighlightTargetLine = line;
}

function _removeCursorHighlight(viewer) {
    const prev = viewer.querySelector(".cursor-sync-highlight");
    if (!prev) return;
    // If highlight was a code block line overlay, just remove it
    if (prev.classList.contains("cursor-sync-code-line")) {
        prev.remove();
        return;
    }
    // If highlight was a wrapper span for a <br> line, unwrap it
    if (prev.classList.contains("cursor-sync-br-line")) {
        while (prev.firstChild) {
            prev.parentNode.insertBefore(prev.firstChild, prev);
        }
        prev.remove();
    } else {
        prev.classList.remove("cursor-sync-highlight");
    }
}

// Track last highlighted source line so we can re-apply after re-renders
let _lastHighlightSourceLine = null;
let _lastHighlightTargetLine = null;

function _reapplyCursorSyncHighlight() {
    if (_lastHighlightTargetLine == null) return;
    const viewer = document.getElementById("viewer-content");
    if (!viewer) return;
    if (viewer.contains(document.activeElement)) return;
    // Re-use handleScrollToLine to apply the highlight (no scroll needed
    // since the element is already in view after a re-render).
    handleScrollToLine({ line: _lastHighlightTargetLine, fromScroll: false });
}

// Re-apply cursor sync highlight after content re-renders (e.g. typing in CM)
on("file:rendered", () => {
    // Small delay to let morphdom finish updating the DOM
    requestAnimationFrame(_reapplyCursorSyncHighlight);
});

// Clear viewer highlight when viewer gets focus (user is editing in viewer)
document.addEventListener("focusin", (e) => {
    const viewer = document.getElementById("viewer-content");
    if (viewer && viewer.contains(e.target)) {
        _removeCursorHighlight(viewer);
        _lastHighlightSourceLine = null;
    }
});

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

// Fast path: send just the cursor's source line for instant CM highlight (no debounce)
function _sendCursorLineToParent() {
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount) return;
    const anchorNode = selection.anchorNode;
    const el = anchorNode && (anchorNode.nodeType === Node.ELEMENT_NODE
        ? anchorNode : anchorNode.parentElement);
    const sourceLine = _getSourceLineFromElement(el);
    if (sourceLine != null) {
        sendToParent("mdviewrCursorLine", { sourceLine });
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
