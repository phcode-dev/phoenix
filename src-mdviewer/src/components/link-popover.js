import { on, off, emit } from "../core/events.js";
import { getSelectionRect } from "./editor.js";
import { t } from "../core/i18n.js";

let popover = null;
let contentEl = null;
let rafId = null;
let savedRange = null;
let editMode = false;
let currentAnchor = null; // the <a> element the popover is attached to
let createMode = false;   // true when creating a new link (no existing <a>)
let showLinkInputHandler = null;

function findAnchorAtSelection() {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return null;
  let node = sel.anchorNode;
  while (node) {
    if (node.nodeType === 1 && node.tagName === "A") return node;
    node = node.parentNode;
  }
  return null;
}

function saveSelection() {
  const sel = window.getSelection();
  if (sel && sel.rangeCount > 0) {
    savedRange = sel.getRangeAt(0).cloneRange();
  }
}

function restoreSelection() {
  if (!savedRange) return;
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(savedRange);
  savedRange = null;
}

function buildPopover() {
  popover = document.getElementById("link-popover");
  if (!popover) return;
  popover.innerHTML = "";
  // View mode
  const viewDiv = document.createElement("div");
  viewDiv.className = "link-popover-view";

  const urlText = document.createElement("a");
  urlText.className = "link-popover-url";
  urlText.target = "_blank";
  urlText.rel = "noopener noreferrer";
  urlText.addEventListener("click", (e) => {
    e.preventDefault();
    const href = urlText.getAttribute("href");
    if (href) {
      window.parent.postMessage({
        type: "MDVIEWR_EVENT",
        eventName: "embeddedIframeHrefClick",
        href: href
      }, "*");
    }
  });
  viewDiv.appendChild(urlText);

  const editBtn = document.createElement("button");
  editBtn.className = "toolbar-btn link-popover-edit-btn";
  editBtn.setAttribute("aria-label", t("link.edit_link"));
  editBtn.textContent = t("link.edit");
  editBtn.addEventListener("mousedown", (e) => e.preventDefault());
  editBtn.addEventListener("click", () => enterEditMode());
  viewDiv.appendChild(editBtn);

  const unlinkBtn = document.createElement("button");
  unlinkBtn.className = "toolbar-btn link-popover-unlink-btn";
  unlinkBtn.setAttribute("aria-label", t("link.remove_link"));
  unlinkBtn.innerHTML = "&times;";
  unlinkBtn.addEventListener("mousedown", (e) => e.preventDefault());
  unlinkBtn.addEventListener("click", () => {
    restoreSelection();
    document.execCommand("unlink", false, null);
    hide();
    contentEl?.focus({ preventScroll: true });
    contentEl?.dispatchEvent(new Event("input", { bubbles: true }));
  });
  viewDiv.appendChild(unlinkBtn);

  popover.appendChild(viewDiv);

  // Edit mode
  const editDiv = document.createElement("div");
  editDiv.className = "link-popover-edit";
  editDiv.style.display = "none";

  // Text row
  const textRow = document.createElement("div");
  textRow.className = "link-popover-edit-row";
  const textLabel = document.createElement("span");
  textLabel.className = "link-popover-label";
  textLabel.textContent = t("link.text");
  textRow.appendChild(textLabel);
  const textInput = document.createElement("input");
  textInput.type = "text";
  textInput.className = "link-popover-text-input";
  textInput.placeholder = t("link.text_placeholder");
  textInput.setAttribute("aria-label", t("link.display_text"));
  textRow.appendChild(textInput);
  editDiv.appendChild(textRow);

  // URL row
  const urlRow = document.createElement("div");
  urlRow.className = "link-popover-edit-row";
  const urlLabel = document.createElement("span");
  urlLabel.className = "link-popover-label";
  urlLabel.textContent = t("link.url");
  urlRow.appendChild(urlLabel);
  const input = document.createElement("input");
  input.type = "text";
  input.className = "link-popover-input";
  input.placeholder = t("link.url_placeholder");
  input.setAttribute("aria-label", t("link.url"));
  urlRow.appendChild(input);

  const confirmBtn = document.createElement("button");
  confirmBtn.className = "toolbar-btn link-popover-confirm-btn";
  confirmBtn.setAttribute("aria-label", t("link.apply"));
  confirmBtn.innerHTML = "&#10003;";
  confirmBtn.addEventListener("mousedown", (e) => e.preventDefault());
  confirmBtn.addEventListener("click", () => applyLink());
  urlRow.appendChild(confirmBtn);

  const cancelBtn = document.createElement("button");
  cancelBtn.className = "toolbar-btn link-popover-cancel-btn";
  cancelBtn.setAttribute("aria-label", t("link.cancel"));
  cancelBtn.innerHTML = "&times;";
  cancelBtn.addEventListener("mousedown", (e) => e.preventDefault());
  cancelBtn.addEventListener("click", () => cancelEdit());
  urlRow.appendChild(cancelBtn);

  editDiv.appendChild(urlRow);

  const handleKeydown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      applyLink();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelEdit();
    }
  };
  textInput.addEventListener("keydown", handleKeydown);
  input.addEventListener("keydown", handleKeydown);

  popover.appendChild(editDiv);
}

function escapeHTML(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function autoPrefix(url) {
  if (!url) return url;
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(url)) {
    return "https://" + url;
  }
  return url;
}

function applyLink() {
  const input = popover.querySelector(".link-popover-input");
  const textInput = popover.querySelector(".link-popover-text-input");
  const rawUrl = input ? input.value.trim() : "";
  const text = textInput ? textInput.value.trim() : "";
  if (!rawUrl) {
    cancelEdit();
    return;
  }
  const url = autoPrefix(rawUrl);
  restoreSelection();

  if (currentAnchor) {
    // Editing existing link — update DOM directly
    currentAnchor.href = url;
    if (text) currentAnchor.textContent = text;
    contentEl?.dispatchEvent(new Event("input", { bubbles: true }));
  } else if (text) {
    // Creating new link with custom display text
    const safeUrl = escapeHTML(url);
    const safeText = escapeHTML(text);
    document.execCommand("insertHTML", false, `<a href="${safeUrl}">${safeText}</a>`);
  } else {
    // Creating new link — default behavior (URL as text or wraps selection)
    emit("action:format", { command: "createLink", value: url });
  }

  hide();
  contentEl?.focus({ preventScroll: true });
}

function cancelEdit() {
  if (createMode) {
    hide();
    restoreSelection();
    contentEl?.focus({ preventScroll: true });
  } else {
    exitEditMode();
  }
}

function enterEditMode() {
  editMode = true;
  saveSelection();
  const viewDiv = popover.querySelector(".link-popover-view");
  const editDiv = popover.querySelector(".link-popover-edit");
  const textInput = popover.querySelector(".link-popover-text-input");
  const input = popover.querySelector(".link-popover-input");
  if (viewDiv) viewDiv.style.display = "none";
  if (editDiv) editDiv.style.display = "flex";
  if (textInput) {
    textInput.value = currentAnchor ? currentAnchor.textContent || "" : "";
  }
  if (input) {
    input.value = currentAnchor ? currentAnchor.getAttribute("href") || "" : "";
    input.focus();
    input.select();
  }
}

function exitEditMode() {
  editMode = false;
  createMode = false;
  const viewDiv = popover.querySelector(".link-popover-view");
  const editDiv = popover.querySelector(".link-popover-edit");
  if (viewDiv) viewDiv.style.display = "";
  if (editDiv) editDiv.style.display = "none";
}

function show(anchorEl) {
  if (!popover) return;
  currentAnchor = anchorEl;
  const href = anchorEl.getAttribute("href") || "";
  const urlText = popover.querySelector(".link-popover-url");
  if (urlText) {
    urlText.textContent = href;
    urlText.href = href;
  }
  exitEditMode();
  positionPopover(anchorEl);
  popover.classList.add("visible");
}

function showCreateMode() {
  if (!popover) return;
  createMode = true;
  currentAnchor = null;

  // Grab selected text before saving the selection
  const sel = window.getSelection();
  const selectedText = sel && !sel.isCollapsed ? sel.toString() : "";
  saveSelection();

  const viewDiv = popover.querySelector(".link-popover-view");
  const editDiv = popover.querySelector(".link-popover-edit");
  const textInput = popover.querySelector(".link-popover-text-input");
  const input = popover.querySelector(".link-popover-input");
  if (viewDiv) viewDiv.style.display = "none";
  if (editDiv) editDiv.style.display = "flex";
  if (textInput) {
    textInput.value = selectedText;
  }
  if (input) {
    input.value = "";
  }

  // Position near selection
  const rect = getSelectionRect();
  if (rect) {
    positionPopoverAtRect(rect);
  } else {
    popover.style.left = "100px";
    popover.style.top = "100px";
  }
  popover.classList.add("visible");

  // Focus after it becomes visible
  requestAnimationFrame(() => {
    if (input) {
      input.focus();
    }
  });
}

function positionPopover(anchorEl) {
  const rect = anchorEl.getBoundingClientRect();
  positionPopoverAtRect(rect);
}

function positionPopoverAtRect(rect) {
  const popW = popover.offsetWidth || 300;
  const popH = popover.offsetHeight || 36;
  let left = rect.left + rect.width / 2 - popW / 2;
  let top = rect.bottom + 6;

  // Flip above if too close to bottom
  if (top + popH > window.innerHeight - 4) {
    top = rect.top - popH - 6;
  }
  // Clamp horizontal
  left = Math.max(4, Math.min(left, window.innerWidth - popW - 4));

  popover.style.left = left + "px";
  popover.style.top = top + "px";
}

function hide() {
  if (!popover) return;
  popover.classList.remove("visible");
  editMode = false;
  createMode = false;
  currentAnchor = null;
}

function updatePosition() {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(() => {
    rafId = null;
    if (editMode || createMode) return; // don't reposition while editing

    // If format bar is visible, hide link popover
    const formatBar = document.getElementById("format-bar");
    if (formatBar && formatBar.classList.contains("visible")) {
      hide();
      return;
    }

    // If lang picker dropdown is open, hide link popover
    const langPicker = document.getElementById("lang-picker");
    if (langPicker && langPicker.classList.contains("visible") && langPicker.querySelector(".lang-picker-dropdown.open")) {
      hide();
      return;
    }

    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) {
      hide();
      return;
    }

    // Check selection is inside contentEl
    if (!contentEl || !contentEl.contains(sel.anchorNode)) {
      hide();
      return;
    }

    // If text is selected (non-collapsed), let format bar handle it
    if (!sel.isCollapsed) {
      hide();
      return;
    }

    const anchor = findAnchorAtSelection();
    if (anchor) {
      show(anchor);
    } else {
      hide();
    }
  });
}

export function initLinkPopover(editorEl) {
  contentEl = editorEl;
  buildPopover();

  document.addEventListener("selectionchange", updatePosition);
  contentEl.addEventListener("mouseup", updatePosition);
  contentEl.addEventListener("keyup", updatePosition);
  // Dismiss on scroll
  const appViewer = document.getElementById("app-viewer");
  if (appViewer) {
    appViewer.addEventListener("scroll", hide);
  }

  showLinkInputHandler = () => {
    // If cursor is inside a link, show popover in edit mode
    const anchor = findAnchorAtSelection();
    if (anchor) {
      show(anchor);
      enterEditMode();
    } else {
      // Create mode: show input for new link
      showCreateMode();
    }
  };
  on("action:show-link-input", showLinkInputHandler);

  on("state:locale", () => {
    buildPopover();
  });
}

export function destroyLinkPopover() {
  hide();
  document.removeEventListener("selectionchange", updatePosition);
  if (contentEl) {
    contentEl.removeEventListener("mouseup", updatePosition);
    contentEl.removeEventListener("keyup", updatePosition);
  }
  if (popover) popover.innerHTML = "";
  if (showLinkInputHandler) {
    off("action:show-link-input", showLinkInputHandler);
    showLinkInputHandler = null;
  }
  contentEl = null;
  savedRange = null;
  editMode = false;
  createMode = false;
  currentAnchor = null;
}
