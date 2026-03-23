/**
 * In-document search for the mdviewer.
 * Uses mark.js for highlighting matches.
 * Opened via Ctrl/Cmd+F, closed via Escape.
 */
import Mark from "mark.js";
import { on } from "../core/events.js";
import { t } from "../core/i18n.js";

let markInstance = null;
let matches = [];
let currentIndex = -1;
let debounceTimer = null;
let savedRange = null;

export function initSearch() {
    const searchBar = document.getElementById("search-bar");
    const searchInput = document.getElementById("search-input");
    const searchCount = document.getElementById("search-count");
    const searchPrev = document.getElementById("search-prev");
    const searchNext = document.getElementById("search-next");
    const searchClose = document.getElementById("search-close");

    if (!searchBar || !searchInput) return;

    on("action:toggle-search", () => {
        if (searchBar.classList.contains("open")) {
            closeSearch();
        } else {
            // Pre-fill with current selection if any
            const sel = window.getSelection();
            const selectedText = sel && !sel.isCollapsed ? sel.toString().trim() : "";
            openSearch(selectedText);
        }
    });

    searchInput.addEventListener("input", () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            performSearch(searchInput.value);
        }, 300);
    });

    searchInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === "ArrowDown") {
            e.preventDefault();
            if (e.shiftKey) {
                navigatePrev();
            } else {
                navigateNext();
            }
        }
        if (e.key === "ArrowUp") {
            e.preventDefault();
            navigatePrev();
        }
        if (e.key === "Escape") {
            e.preventDefault();
            closeSearch();
        }
    });

    if (searchPrev) searchPrev.addEventListener("click", navigatePrev);
    if (searchNext) searchNext.addEventListener("click", navigateNext);
    if (searchClose) searchClose.addEventListener("click", closeSearch);

    let _selectionRect = null;

    function openSearch(prefill) {
        // Save cursor/selection before opening search
        const sel = window.getSelection();
        if (sel && sel.rangeCount) {
            savedRange = sel.getRangeAt(0).cloneRange();
            if (prefill) {
                _selectionRect = sel.getRangeAt(0).getBoundingClientRect();
            }
        }

        searchBar.classList.add("open");
        if (prefill) {
            searchInput.value = prefill;
            performSearch(prefill);
        }
        searchInput.focus();
        searchInput.select();
    }

    function closeSearch() {
        searchBar.classList.remove("open");
        clearHighlights();
        searchInput.value = "";
        searchCount.textContent = "";
        // Restore cursor/selection and focus
        const content = document.getElementById("viewer-content");
        if (content) {
            content.focus({ preventScroll: true });
            if (savedRange) {
                const sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(savedRange);
                savedRange = null;
            }
        }
    }

    function performSearch(query) {
        clearHighlights();

        if (!query || query.length < 2) {
            searchCount.textContent = "";
            return;
        }

        const content = document.getElementById("viewer-content");
        if (!content) return;

        markInstance = new Mark(content);
        markInstance.mark(query, {
            separateWordSearch: false,
            done: (count) => {
                matches = Array.from(content.querySelectorAll("mark[data-markjs]"));
                currentIndex = -1;

                if (count > 0) {
                    // If opened with a selection, find the match closest to it
                    if (_selectionRect) {
                        let bestIdx = 0;
                        let bestDist = Infinity;
                        for (let i = 0; i < matches.length; i++) {
                            const rect = matches[i].getBoundingClientRect();
                            const dist = Math.abs(rect.top - _selectionRect.top) +
                                         Math.abs(rect.left - _selectionRect.left);
                            if (dist < bestDist) {
                                bestDist = dist;
                                bestIdx = i;
                            }
                        }
                        _selectionRect = null;
                        currentIndex = bestIdx;
                        matches[currentIndex].classList.add("active");
                        updateCount();
                    } else {
                        searchCount.textContent = `${count} ${t("search.count")}`;
                        navigateNext();
                    }
                } else {
                    searchCount.textContent = t("search.no_results");
                }
            }
        });
    }

    function navigateNext() {
        if (matches.length === 0) return;

        if (currentIndex >= 0 && currentIndex < matches.length) {
            matches[currentIndex].classList.remove("active");
        }

        currentIndex = (currentIndex + 1) % matches.length;
        matches[currentIndex].classList.add("active");
        matches[currentIndex].scrollIntoView({
            behavior: "instant",
            block: "center"
        });
        updateCount();
    }

    function navigatePrev() {
        if (matches.length === 0) return;

        if (currentIndex >= 0 && currentIndex < matches.length) {
            matches[currentIndex].classList.remove("active");
        }

        currentIndex = currentIndex <= 0 ? matches.length - 1 : currentIndex - 1;
        matches[currentIndex].classList.add("active");
        matches[currentIndex].scrollIntoView({
            behavior: "instant",
            block: "center"
        });
        updateCount();
    }

    function updateCount() {
        if (matches.length > 0) {
            searchCount.textContent = `${currentIndex + 1}/${matches.length}`;
        }
    }

    function clearHighlights() {
        if (markInstance) {
            markInstance.unmark();
        }
        matches = [];
        currentIndex = -1;
    }
}
