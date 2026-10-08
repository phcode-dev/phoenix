/**
 * Image lightbox — shows an image on its own over a dimmed backdrop, inside the viewer frame.
 * Opens on a click in reader mode. In edit mode it opens from the expand button shown over a
 * hovered image, a double-click, or the image popover's view button. Any click or Escape closes it.
 */
import { on } from "../core/events.js";
import { getState } from "../core/state.js";
import { t } from "../core/i18n.js";

// Images smaller than this get no hover expand button; it would cover them.
const EXPAND_BUTTON_MIN_IMAGE_SIZE = 64;
const EXPAND_ICON = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3"/>' +
    '<path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/>' +
    '<path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>';

let overlay = null;
let returnFocus = null;
let expandButton = null;
let hoveredImg = null;

/**
 * The previewable image a pointer event landed on, if any: a loaded document image, not one
 * still uploading.
 * @param {EventTarget} target
 * @return {?HTMLImageElement}
 */
export function previewableImage(target) {
    const img = target && target.closest ? target.closest("img") : null;
    const content = document.getElementById("viewer-content");
    if (!img || !content || !content.contains(img)) {
        return null;
    }
    const src = img.getAttribute("src");
    if (!src || src.includes("uploading.svg")) {
        return null;
    }
    return img;
}

/**
 * The image a reader-mode click opens in the lightbox. A linked image follows its link instead.
 * @param {EventTarget} target
 * @return {?HTMLImageElement}
 */
export function readerClickImage(target) {
    if (getState().editMode) {
        return null;
    }
    const img = previewableImage(target);
    return img && !img.closest("a[href]") ? img : null;
}

/** @return {boolean} Whether the lightbox is showing. */
export function isImageLightboxOpen() {
    return !!overlay;
}

/**
 * Show the image on its own over a dimmed backdrop.
 * @param {HTMLImageElement} img
 */
export function openImageLightbox(img) {
    if (!img) {
        return;
    }
    closeImageLightbox();
    _hideExpandButton();
    returnFocus = document.activeElement;
    overlay = document.createElement("div");
    overlay.className = "image-lightbox";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", img.getAttribute("alt") || t("image.view"));
    overlay.tabIndex = -1;

    const view = document.createElement("img");
    view.className = "image-lightbox-img";
    view.src = img.currentSrc || img.src;
    view.alt = img.getAttribute("alt") || "";
    overlay.appendChild(view);
    overlay.addEventListener("click", closeImageLightbox);

    document.body.appendChild(overlay);
    overlay.focus({ preventScroll: true });
}

function _getExpandButton() {
    if (!expandButton) {
        expandButton = document.createElement("button");
        expandButton.type = "button";
        expandButton.className = "image-lightbox-expand";
        expandButton.setAttribute("aria-label", t("image.view"));
        expandButton.innerHTML = EXPAND_ICON;
        // Keep the editor's focus and caret where they are.
        expandButton.addEventListener("mousedown", (e) => e.preventDefault());
        expandButton.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            const img = hoveredImg;
            _hideExpandButton();
            openImageLightbox(img);
        });
        expandButton.addEventListener("mouseleave", (e) => {
            if (e.relatedTarget !== hoveredImg) {
                _hideExpandButton();
            }
        });
        document.body.appendChild(expandButton);
    }
    return expandButton;
}

/** In edit mode, show the expand button over the centre of the hovered image. */
function _showExpandButton(img) {
    const rect = img.getBoundingClientRect();
    if (rect.width < EXPAND_BUTTON_MIN_IMAGE_SIZE || rect.height < EXPAND_BUTTON_MIN_IMAGE_SIZE) {
        _hideExpandButton();
        return;
    }
    const button = _getExpandButton();
    hoveredImg = img;
    button.style.left = (rect.left + rect.width / 2) + "px";
    button.style.top = (rect.top + rect.height / 2) + "px";
    button.classList.add("visible");
}

function _hideExpandButton() {
    hoveredImg = null;
    if (expandButton) {
        expandButton.classList.remove("visible");
    }
}

/** Close the lightbox, returning focus to where it was. */
export function closeImageLightbox() {
    if (!overlay) {
        return;
    }
    overlay.remove();
    overlay = null;
    const focusTarget = returnFocus;
    returnFocus = null;
    if (focusTarget && focusTarget.isConnected && focusTarget !== document.body) {
        focusTarget.focus({ preventScroll: true });
    }
}

export function initImageLightbox() {
    const appViewer = document.getElementById("app-viewer");
    if (appViewer) {
        appViewer.addEventListener("click", (e) => {
            const img = readerClickImage(e.target);
            if (img) {
                e.preventDefault();
                openImageLightbox(img);
            }
        });
        appViewer.addEventListener("mouseover", (e) => {
            if (!getState().editMode) {
                return;
            }
            const img = previewableImage(e.target);
            if (img) {
                _showExpandButton(img);
            }
        });
        appViewer.addEventListener("mouseout", (e) => {
            // Leaving the image for anything but its expand button hides the button.
            if (hoveredImg && e.target === hoveredImg && e.relatedTarget !== expandButton) {
                _hideExpandButton();
            }
        });
        appViewer.addEventListener("scroll", _hideExpandButton);
        appViewer.addEventListener("dblclick", (e) => {
            if (!getState().editMode) {
                return;
            }
            const img = previewableImage(e.target);
            if (img) {
                e.preventDefault();
                openImageLightbox(img);
            }
        });
    }

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && overlay) {
            // Escape closes only the lightbox, not the image popover under it.
            e.preventDefault();
            e.stopImmediatePropagation();
            closeImageLightbox();
        }
    });

    window.addEventListener("resize", _hideExpandButton);
    // A file or mode switch leaves nothing of the lightbox behind.
    const reset = () => {
        closeImageLightbox();
        _hideExpandButton();
    };
    on("file:switched", reset);
    on("file:closed", reset);
    on("state:editMode", reset);
}
