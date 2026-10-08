/**
 * Image lightbox — shows an image on its own over a dimmed backdrop, inside the viewer frame.
 * Opens on a click in reader mode. In edit mode it opens from the expand button shown in the
 * top-right corner of a hovered image, or a double-click. Any click or Escape closes it.
 */
import { on } from "../core/events.js";
import { getState } from "../core/state.js";
import { t } from "../core/i18n.js";

// Images smaller than this get no hover expand button; it would cover them.
const EXPAND_BUTTON_MIN_IMAGE_SIZE = 96;
// Gap between the expand button and the image's top and right edges.
const EXPAND_BUTTON_INSET = 10;
const EXPAND_ICON = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3"/>' +
    '<path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/>' +
    '<path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>';

let overlay = null;
let returnFocus = null;
let expandButton = null;
let hoveredImg = null;
// Last pointer position in edit mode; null when it is outside the frame or a button is held.
let lastPointer = null;
// Moving onto a different element is handled at once. Repeated moves over the same one, and
// scrolls, are checked at most once per frame interval, whatever rate an engine sends them at (not
// all coalesce mouse moves per frame); a trailing check catches the last position.
const SYNC_INTERVAL_MS = 16;
let lastSyncAt = 0;
let trailingSync = null;

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

/**
 * The hover expand button. It lives in the viewer's scroll container, positioned in that
 * container's content coordinates, so a scroll carries it along with its image instead of it
 * being moved after each scroll event. Only an image whose top has scrolled out of view moves it,
 * to keep it on the visible part of the image.
 */
function _getExpandButton() {
    const appViewer = document.getElementById("app-viewer");
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
    }
    if (appViewer && expandButton.parentNode !== appViewer) {
        appViewer.appendChild(expandButton);
    }
    return expandButton;
}

/** In edit mode, show the expand button in the top-right corner of the hovered image. */
function _showExpandButton(img) {
    const rect = img.getBoundingClientRect();
    if (rect.width < EXPAND_BUTTON_MIN_IMAGE_SIZE || rect.height < EXPAND_BUTTON_MIN_IMAGE_SIZE) {
        _hideExpandButton();
        return;
    }
    const button = _getExpandButton();
    const host = button.parentNode;
    const hostRect = host.getBoundingClientRect();
    const half = button.offsetWidth / 2;
    // Centre of the button, in viewport coordinates: the image's top-right corner, moved down to
    // the top of the visible area when a tall image's top has scrolled out of view.
    const centreX = rect.right - EXPAND_BUTTON_INSET - half;
    let centreY = rect.top + EXPAND_BUTTON_INSET + half;
    const visibleTop = hostRect.top + host.clientTop + EXPAND_BUTTON_INSET + half;
    if (centreY < visibleTop) {
        centreY = Math.min(visibleTop, rect.bottom - EXPAND_BUTTON_INSET - half);
    }
    hoveredImg = img;
    button.style.left = (centreX - hostRect.left - host.clientLeft + host.scrollLeft) + "px";
    button.style.top = (centreY - hostRect.top - host.clientTop + host.scrollTop) + "px";
    button.classList.add("visible");
}

function _hideExpandButton() {
    hoveredImg = null;
    if (expandButton) {
        expandButton.classList.remove("visible");
    }
}

/**
 * @param {Element} el - What is under the pointer.
 * @return {?HTMLImageElement} The image the expand button belongs on for it: the image itself, or
 *     the button's own image while the pointer is on the button.
 */
function _hoverTargetFor(el) {
    if (expandButton && expandButton.contains(el)) {
        return hoveredImg;
    }
    return previewableImage(el);
}

/**
 * Show the expand button for the image under the pointer, wherever on the image it is, or hide
 * it. Checked on every pointer move and scroll, so it never depends on catching the moment the
 * pointer entered the image (a scroll or a large image could miss that).
 * @param {?Element} [underPointer] - What is under the pointer, when the caller already knows (a
 *     mouse event's target); otherwise it is looked up at the last pointer position.
 */
function _syncExpandButton(underPointer) {
    if (!lastPointer || overlay || !getState().editMode) {
        _hideExpandButton();
        return;
    }
    const el = underPointer instanceof Element ? underPointer :
        document.elementFromPoint(lastPointer.x, lastPointer.y);
    if (expandButton && el && expandButton.contains(el)) {
        // On the button itself, which sits over its image.
        if (!hoveredImg || !hoveredImg.isConnected) {
            _hideExpandButton();
        }
        return;
    }
    const img = previewableImage(el);
    if (img) {
        _showExpandButton(img);
    } else {
        _hideExpandButton();
    }
}

/**
 * Run the hover check now, or once the current frame interval has passed.
 * @param {?Element} [underPointer] - As for _syncExpandButton; ignored when the check is deferred.
 */
function _requestExpandSync(underPointer) {
    if (underPointer && _hoverTargetFor(underPointer) !== hoveredImg) {
        lastSyncAt = performance.now();
        _syncExpandButton(underPointer);
        return;
    }
    if (trailingSync) {
        return;
    }
    const wait = lastSyncAt + SYNC_INTERVAL_MS - performance.now();
    if (wait <= 0) {
        lastSyncAt = performance.now();
        _syncExpandButton(underPointer);
        return;
    }
    trailingSync = setTimeout(() => {
        trailingSync = null;
        lastSyncAt = performance.now();
        _syncExpandButton();
    }, wait);
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
        appViewer.addEventListener("scroll", () => _requestExpandSync());
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

    document.addEventListener("mousemove", (e) => {
        if (!getState().editMode) {
            return;
        }
        // Not while a button is held: selecting text or dragging an image.
        lastPointer = e.buttons ? null : { x: e.clientX, y: e.clientY };
        // The event's target is the browser's own hit test; no need for another.
        _requestExpandSync(e.target);
    });
    document.documentElement.addEventListener("mouseleave", () => {
        lastPointer = null;
        _hideExpandButton();
    });
    window.addEventListener("resize", () => _requestExpandSync());
    // A file or mode switch leaves nothing of the lightbox behind.
    const reset = () => {
        closeImageLightbox();
        _hideExpandButton();
    };
    on("file:switched", reset);
    on("file:closed", reset);
    on("state:editMode", reset);
}
