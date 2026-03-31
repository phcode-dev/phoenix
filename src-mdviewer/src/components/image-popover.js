/**
 * Image popover — appears when clicking an image in edit mode.
 * Shows Edit (opens image URL dialog) and Delete buttons.
 */
import { emit, on } from "../core/events.js";
import { t } from "../core/i18n.js";
import { getState } from "../core/state.js";

const UPLOAD_PLACEHOLDER_SRC = "https://user-cdn.phcode.site/images/uploading.svg";
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml"];

let popover = null;
let currentImg = null;
let contentEl = null;

function hide() {
    if (!popover) return;
    popover.classList.remove("visible");
    if (currentImg) {
        currentImg.classList.remove("image-selected");
    }
    currentImg = null;
}

function _moveCursorBeforeImage(img) {
    const block = img.closest("p, div, li, blockquote") || img.parentNode;
    const prev = block.previousElementSibling;
    if (prev) {
        const range = document.createRange();
        range.selectNodeContents(prev);
        range.collapse(false); // end of previous element
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
    }
}

function _moveCursorAfterImage(img, content) {
    const block = img.closest("p, div, li, blockquote") || img.parentNode;
    let next = block.nextElementSibling;
    if (!next) {
        // Create a new paragraph if nothing follows
        next = document.createElement("p");
        next.innerHTML = "<br>";
        block.parentNode.insertBefore(next, block.nextSibling);
        content.dispatchEvent(new Event("input", { bubbles: true }));
    }
    const range = document.createRange();
    range.selectNodeContents(next);
    range.collapse(true); // start of next element
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
}

function _createParagraphAfterImage(img, content) {
    const block = img.closest("p, div, li, blockquote") || img.parentNode;
    const newP = document.createElement("p");
    newP.innerHTML = "<br>";
    block.parentNode.insertBefore(newP, block.nextSibling);
    const range = document.createRange();
    range.selectNodeContents(newP);
    range.collapse(true);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    content.dispatchEvent(new Event("input", { bubbles: true }));
}

function show(img) {
    if (!popover || !img) return;
    currentImg = img;

    const rect = img.getBoundingClientRect();
    const popW = popover.offsetWidth || 80;
    const popH = popover.offsetHeight || 36;

    // Position above the image, centered
    let left = rect.left + rect.width / 2 - popW / 2;
    let top = rect.top - popH - 8;

    // Flip below if too close to top
    if (top < 4) {
        top = rect.bottom + 8;
    }
    // Clamp horizontal
    left = Math.max(4, Math.min(left, window.innerWidth - popW - 4));

    popover.style.left = left + "px";
    popover.style.top = top + "px";
    popover.classList.add("visible");
}

export function initImagePopover(content) {
    contentEl = content;
    popover = document.getElementById("image-popover");
    if (!popover) return;

    popover.innerHTML = "";

    const editBtn = document.createElement("button");
    editBtn.className = "image-popover-btn";
    editBtn.setAttribute("aria-label", t("image.edit") || "Edit image");
    editBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>';
    editBtn.addEventListener("mousedown", (e) => e.preventDefault());
    editBtn.addEventListener("click", () => {
        const img = currentImg;
        const src = img ? img.getAttribute("src") || "" : "";
        const alt = img ? img.getAttribute("alt") || "" : "";
        hide();
        if (!img) return;
        showEditDialog(img, src, alt);
    });
    popover.appendChild(editBtn);

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "image-popover-btn image-popover-btn-delete";
    deleteBtn.setAttribute("aria-label", t("image.delete") || "Delete image");
    deleteBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>';
    deleteBtn.addEventListener("mousedown", (e) => e.preventDefault());
    deleteBtn.addEventListener("click", () => {
        const img = currentImg;
        hide();
        if (!img || !img.parentNode) return;
        img.remove();
        if (contentEl) {
            contentEl.dispatchEvent(new Event("input", { bubbles: true }));
        }
    });
    popover.appendChild(deleteBtn);

    // Click on images in edit mode shows the popover and selects the image
    content.addEventListener("click", (e) => {
        if (!getState().editMode) return;
        const img = e.target.closest("img");
        if (img && content.contains(img)) {
            e.preventDefault();
            show(img);
            // Add visual selection to the image
            content.querySelectorAll("img.image-selected").forEach(
                el => el.classList.remove("image-selected"));
            img.classList.add("image-selected");
        } else if (!popover.contains(e.target)) {
            hide();
            content.querySelectorAll("img.image-selected").forEach(
                el => el.classList.remove("image-selected"));
        }
    });

    // Keyboard handling when an image is selected
    content.addEventListener("keydown", (e) => {
        if (!getState().editMode || !currentImg) return;
        const img = currentImg;

        if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
            e.preventDefault();
            hide();
            _moveCursorBeforeImage(img);
        } else if (e.key === "ArrowDown" || e.key === "ArrowRight") {
            e.preventDefault();
            hide();
            _moveCursorAfterImage(img, content);
        } else if (e.key === "Enter") {
            e.preventDefault();
            hide();
            _createParagraphAfterImage(img, content);
        } else if (e.key === "Backspace" || e.key === "Delete") {
            e.preventDefault();
            hide();
            if (img.parentNode) {
                img.remove();
                content.dispatchEvent(new Event("input", { bubbles: true }));
            }
        }
    });

    // Hide on scroll
    const appViewer = document.getElementById("app-viewer");
    if (appViewer) {
        appViewer.addEventListener("scroll", hide);
    }

    // Hide on Escape
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && popover.classList.contains("visible")) {
            hide();
            content.querySelectorAll("img.image-selected").forEach(
                el => el.classList.remove("image-selected"));
        }
    });
}

function showEditDialog(imgEl, currentSrc, currentAlt) {
    const backdrop = document.createElement("div");
    backdrop.className = "confirm-dialog-backdrop";
    backdrop.innerHTML = `
        <div class="confirm-dialog">
            <h3 class="confirm-dialog-title">${t("image.edit") || "Edit Image URL"}</h3>
            <div style="margin-bottom: 12px;">
                <input type="text" id="img-edit-url-input" placeholder="${t("image_dialog.url_placeholder") || "https://example.com/image.png"}"
                    style="width: 100%; padding: 6px 8px; border: 1px solid var(--color-border); border-radius: 4px; background: var(--color-bg); color: var(--color-text); margin-bottom: 8px;" />
                <input type="text" id="img-edit-alt-input" placeholder="${t("image_dialog.alt_placeholder") || "Image description"}"
                    style="width: 100%; padding: 6px 8px; border: 1px solid var(--color-border); border-radius: 4px; background: var(--color-bg); color: var(--color-text);" />
            </div>
            <div class="confirm-dialog-buttons" style="justify-content: space-between;">
                <button class="confirm-dialog-btn" id="img-edit-upload" style="display: flex; align-items: center; gap: 4px;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>
                    ${t("format.image_upload") || "Upload"}
                </button>
                <div style="display: flex; gap: 8px;">
                    <button class="confirm-dialog-btn confirm-dialog-btn-cancel" id="img-edit-cancel">${t("dialog.cancel") || "Cancel"}</button>
                    <button class="confirm-dialog-btn confirm-dialog-btn-save" id="img-edit-save">${t("dialog.save") || "Save"}</button>
                </div>
            </div>
        </div>`;
    document.body.appendChild(backdrop);

    const urlInput = backdrop.querySelector("#img-edit-url-input");
    const altInput = backdrop.querySelector("#img-edit-alt-input");
    urlInput.value = currentSrc;
    altInput.value = currentAlt;
    urlInput.focus();
    urlInput.select();

    function close() {
        backdrop.remove();
        if (contentEl) {
            contentEl.focus({ preventScroll: true });
        }
    }

    backdrop.querySelector("#img-edit-cancel").addEventListener("click", close);
    backdrop.querySelector("#img-edit-save").addEventListener("click", () => {
        const url = urlInput.value.trim();
        const alt = altInput.value.trim();
        if (url && imgEl && imgEl.parentNode) {
            imgEl.setAttribute("src", url);
            imgEl.setAttribute("alt", alt);
            if (contentEl) {
                contentEl.dispatchEvent(new Event("input", { bubbles: true }));
            }
        }
        close();
    });

    backdrop.querySelector("#img-edit-upload").addEventListener("click", () => {
        const fileInput = document.createElement("input");
        fileInput.type = "file";
        fileInput.accept = "image/*";
        fileInput.addEventListener("change", () => {
            const file = fileInput.files && fileInput.files[0];
            if (!file || !ALLOWED_IMAGE_TYPES.includes(file.type)) {
                return;
            }
            // Show uploading placeholder on the existing image
            const origSrc = imgEl.getAttribute("src");
            const uploadId = crypto.randomUUID();
            imgEl.setAttribute("src", UPLOAD_PLACEHOLDER_SRC);
            imgEl.setAttribute("data-upload-id", uploadId);
            emit("bridge:uploadImage", { blob: file, filename: file.name, uploadId });
            close();
        });
        fileInput.click();
    });

    backdrop.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            backdrop.querySelector("#img-edit-save").click();
        } else if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            close();
        }
    });

    backdrop.addEventListener("mousedown", (e) => {
        if (e.target === backdrop) {
            close();
        }
    });
}

export function destroyImagePopover() {
    hide();
    contentEl = null;
    currentImg = null;
}
