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

// Configure marked to resolve relative image/link URLs against the base URL.
// This replaces <base href> which would conflict with the iframe's own asset paths.
marked.use({
    walkTokens(token) {
        if (token.type === "image" && token.href) {
            token.href = _resolveURL(token.href);
        } else if (token.type === "link" && token.href) {
            token.href = _resolveURL(token.href);
        }
    }
});

/**
 * Parse markdown to HTML with mermaid detection.
 */
function parseMarkdownToHTML(markdown) {
    const has_mermaid = /```mermaid/i.test(markdown);
    const html = marked.parse(markdown);
    return { html, has_mermaid };
}

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
        }
    });

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

function sendToParent(eventName, payload) {
    if (!window.parent || window.parent === window) return;
    window.parent.postMessage({
        type: "MDVIEWR_EVENT",
        eventName,
        ...payload
    }, "*");
}
