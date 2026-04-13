/**
 * Document cache for the mdviewer iframe.
 * Maintains a pool of pre-rendered DOM elements so file switches are instant (hide/show).
 *
 * Two-tier caching:
 *   - Working set files: always cached (unlimited, mirrors Phoenix working set)
 *   - Non-working-set files: LRU cache (max LRU_MAX entries)
 */

const LRU_MAX = 20;
const VIEWER_CONTENT_ID = "viewer-content";

/** @type {Map<string, CacheEntry>} */
const cache = new Map();

/** @type {Set<string>} file paths that are in the Phoenix working set */
const workingSetPaths = new Set();

/** @type {string|null} currently active file path */
let activeFilePath = null;

/** @type {HTMLElement|null} the #app-viewer container */
let viewerContainer = null;

/**
 * @typedef {Object} CacheEntry
 * @property {string} filePath
 * @property {string} mdSrc - last known markdown source
 * @property {HTMLDivElement} dom - rendered content element
 * @property {number} scrollPos - saved scrollTop of #app-viewer
 * @property {object} parseResult - { html, has_mermaid }
 * @property {number} lastAccessed - timestamp for LRU eviction
 */

export function initDocCache() {
    viewerContainer = document.getElementById("app-viewer");
}

/**
 * Get a cache entry by file path.
 */
export function getEntry(filePath) {
    return cache.get(filePath) || null;
}

/** For test access only — returns the cache keys. */
export function _getCacheKeysForTest() {
    return Array.from(cache.keys());
}

/** For test access only — returns the working set paths. */
export function _getWorkingSetPathsForTest() {
    return Array.from(workingSetPaths);
}

/**
 * Get the currently active file path.
 */
export function getActiveFilePath() {
    return activeFilePath;
}

/**
 * Create a new cache entry with a fresh DOM element.
 * The DOM element is appended to #app-viewer but hidden.
 */
export function createEntry(filePath, mdSrc, parseResult) {
    // Remove existing entry if any
    if (cache.has(filePath)) {
        removeEntry(filePath);
    }

    const dom = document.createElement("div");
    dom.className = "markdown-body";
    dom.style.display = "none";
    dom.dir = "auto";
    dom.innerHTML = parseResult.html;

    viewerContainer.appendChild(dom);

    const entry = {
        filePath,
        mdSrc,
        dom,
        scrollPos: 0,
        parseResult,
        lastAccessed: Date.now()
    };

    cache.set(filePath, entry);
    evict();
    return entry;
}

/**
 * Update an existing cache entry's content.
 */
export function updateEntry(filePath, mdSrc, parseResult) {
    const entry = cache.get(filePath);
    if (!entry) {
        return createEntry(filePath, mdSrc, parseResult);
    }

    entry.mdSrc = mdSrc;
    entry.parseResult = parseResult;
    entry.dom.innerHTML = parseResult.html;
    entry.dom.dir = "auto";
    entry.lastAccessed = Date.now();
    return entry;
}

/**
 * Remove a cache entry and detach its DOM from the document.
 */
export function removeEntry(filePath) {
    const entry = cache.get(filePath);
    if (!entry) return;

    if (entry.dom.parentNode) {
        entry.dom.parentNode.removeChild(entry.dom);
    }
    cache.delete(filePath);

    if (activeFilePath === filePath) {
        activeFilePath = null;
    }
}

/**
 * Switch to a file. Hides the current DOM, shows the target DOM.
 * Returns the cache entry (or null if not cached).
 *
 * The active DOM gets id="viewer-content" for backward compatibility.
 */
export function switchTo(filePath) {
    const entry = cache.get(filePath);
    if (!entry) return null;

    // Save scroll position of outgoing document
    if (activeFilePath && activeFilePath !== filePath) {
        const outgoing = cache.get(activeFilePath);
        if (outgoing) {
            outgoing.scrollPos = viewerContainer.scrollTop;
        }
    }

    // Hide current active DOM
    const currentActive = viewerContainer.querySelector(`#${VIEWER_CONTENT_ID}`);
    if (currentActive) {
        currentActive.removeAttribute("id");
        currentActive.style.display = "none";
    }

    // Show target DOM
    entry.dom.id = VIEWER_CONTENT_ID;
    entry.dom.style.display = "block";
    entry.lastAccessed = Date.now();

    activeFilePath = filePath;

    // Restore exact pixel scroll position — DOM is cached so no layout shift
    requestAnimationFrame(() => {
        viewerContainer.scrollTop = entry.scrollPos;
    });

    return entry;
}

/**
 * Save the current scroll position for the active document.
 * Saves pixel position for exact restore on cached DOM switch,
 * and source line for reload (where DOM is rebuilt).
 */
export function saveActiveScrollPos() {
    if (!activeFilePath) return;
    const entry = cache.get(activeFilePath);
    if (!entry) return;

    // Don't overwrite scroll position if viewer is hidden (e.g. panel closed)
    // — hidden elements report scrollTop = 0 which would destroy the saved value.
    if (!viewerContainer.offsetParent && viewerContainer.scrollTop === 0) return;

    // Don't overwrite a saved non-zero scroll position with 0 — this happens when
    // the browser resets scrollTop after hide/show and the caller hasn't scrolled yet.
    if (viewerContainer.scrollTop === 0 && entry.scrollPos > 0) return;

    entry.scrollPos = viewerContainer.scrollTop;

    // Also save source line for reload scenarios (DOM rebuilt, pixel pos unreliable)
    const elements = entry.dom.querySelectorAll("[data-source-line]");
    const containerTop = viewerContainer.getBoundingClientRect().top;
    let bestEl = null;
    let bestDist = Infinity;
    for (const el of elements) {
        const dist = Math.abs(el.getBoundingClientRect().top - containerTop);
        if (dist < bestDist) {
            bestDist = dist;
            bestEl = el;
        }
    }
    if (bestEl) {
        entry._scrollSourceLine = parseInt(bestEl.getAttribute("data-source-line"), 10);
    }
}

/**
 * Update the set of working set file paths (always cached).
 */
export function setWorkingSet(paths) {
    workingSetPaths.clear();
    for (const p of paths) {
        workingSetPaths.add(p);
    }
    evict();
}

/**
 * Evict non-working-set entries beyond LRU_MAX.
 */
export function evict() {
    // Collect non-working-set entries
    const lruEntries = [];
    for (const [path, entry] of cache) {
        if (!workingSetPaths.has(path) && path !== activeFilePath) {
            lruEntries.push(entry);
        }
    }

    if (lruEntries.length <= LRU_MAX) return;

    // Sort by lastAccessed ascending (oldest first)
    lruEntries.sort((a, b) => a.lastAccessed - b.lastAccessed);

    const toRemove = lruEntries.length - LRU_MAX;
    for (let i = 0; i < toRemove; i++) {
        removeEntry(lruEntries[i].filePath);
    }
}

/**
 * Clear all cached entries. Used on project switch.
 */
export function clearAll() {
    for (const [, entry] of cache) {
        if (entry.dom.parentNode) {
            entry.dom.parentNode.removeChild(entry.dom);
        }
    }
    cache.clear();
    workingSetPaths.clear();
    activeFilePath = null;
}

/**
 * Get the number of cached entries (for debugging).
 */
export function size() {
    return cache.size;
}
