import {
  createIcons,
  Bold,
  Italic,
  Strikethrough,
  Code,
  Link,
} from "lucide";
import { on, emit } from "../core/events.js";
import { getSelectionRect } from "./editor.js";
import { t, tp } from "../core/i18n.js";

const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
const mod = isMac ? "\u2318" : "Ctrl";

let bar = null;
let contentEl = null;
let rafId = null;
let linkMode = false;
let savedRange = null;

const buttons = [
  { id: "fb-bold", icon: "bold", command: "bold", tooltipKey: "format.bold", stateKey: "bold" },
  { id: "fb-italic", icon: "italic", command: "italic", tooltipKey: "format.italic", stateKey: "italic" },
  { id: "fb-strike", icon: "strikethrough", command: "strikethrough", tooltipKey: "format.strikethrough", stateKey: "strikethrough" },
  null, // divider
  { id: "fb-code", icon: "code", command: "code", tooltipKey: "format.code", stateKey: "isCode" },
  { id: "fb-link", icon: "link", command: "createLink", tooltipKey: "format.link", stateKey: "isLink" },
];

function buildBar() {
  bar = document.getElementById("format-bar");
  if (!bar) return;

  let html = '<div class="format-bar-buttons">';
  for (const btn of buttons) {
    if (btn === null) {
      html += '<div class="toolbar-divider"></div>';
    } else {
      const tooltip = tp(btn.tooltipKey, { mod });
      html += `<button class="toolbar-btn format-btn" id="${btn.id}" data-tooltip="${tooltip}" aria-pressed="false" tabindex="-1"><i data-lucide="${btn.icon}"></i></button>`;
    }
  }
  html += "</div>";

  // Link input (hidden by default)
  html += `<div class="format-bar-link-input" id="fb-link-input" style="display:none">
    <input type="text" id="fb-link-url" placeholder="${t("link.url_placeholder")}" aria-label="${t("link.url")}" />
    <button class="toolbar-btn format-bar-cancel-btn" id="fb-link-cancel" aria-label="${t("link.cancel")}">&times;</button>
  </div>`;

  bar.innerHTML = html;

  createIcons({
    icons: { Bold, Italic, Strikethrough, Code, Link },
    attrs: { class: "" },
  });

  // Button click handlers
  for (const btn of buttons) {
    if (btn === null) continue;
    const el = document.getElementById(btn.id);
    if (!el) continue;
    el.addEventListener("mousedown", (e) => {
      e.preventDefault(); // keep selection
      if (btn.command === "createLink") {
        enterLinkMode();
      } else {
        emit("action:format", { command: btn.command });
      }
    });
  }

  // Link input handlers
  const linkInput = document.getElementById("fb-link-url");
  if (linkInput) {
    linkInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const url = linkInput.value.trim();
        if (url) {
          restoreSelection();
          emit("action:format", { command: "createLink", value: url });
        }
        exitLinkMode();
      } else if (e.key === "Escape") {
        e.preventDefault();
        exitLinkMode();
        contentEl?.focus({ preventScroll: true });
      }
    });
  }

  // Cancel button in link input
  const cancelBtn = document.getElementById("fb-link-cancel");
  if (cancelBtn) {
    cancelBtn.addEventListener("mousedown", (e) => e.preventDefault());
    cancelBtn.addEventListener("click", () => {
      exitLinkMode();
      contentEl?.focus({ preventScroll: true });
    });
  }

  // Roving tabindex - arrow key navigation
  bar.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      hide();
      contentEl?.focus({ preventScroll: true });
      return;
    }
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    const focusable = Array.from(bar.querySelectorAll("button:not([style*='display:none'])"));
    const idx = focusable.indexOf(document.activeElement);
    if (idx === -1) return;
    e.preventDefault();
    const next = e.key === "ArrowRight"
      ? focusable[(idx + 1) % focusable.length]
      : focusable[(idx - 1 + focusable.length) % focusable.length];
    next.focus();
  });
}

function enterLinkMode() {
  linkMode = true;
  saveSelection();
  const btns = bar.querySelector(".format-bar-buttons");
  const linkInputWrap = document.getElementById("fb-link-input");
  const linkInput = document.getElementById("fb-link-url");
  if (btns) btns.style.display = "none";
  if (linkInputWrap) linkInputWrap.style.display = "flex";
  if (linkInput) {
    linkInput.value = "";
    linkInput.focus();
  }
}

function exitLinkMode() {
  linkMode = false;
  const btns = bar.querySelector(".format-bar-buttons");
  const linkInputWrap = document.getElementById("fb-link-input");
  if (btns) btns.style.display = "";
  if (linkInputWrap) linkInputWrap.style.display = "none";
}

function saveSelection() {
  const sel = window.getSelection();
  if (sel.rangeCount > 0) {
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

function onDocumentMousedown(e) {
  if (!bar || !linkMode) return;
  if (bar.contains(e.target)) return;
  exitLinkMode();
  contentEl?.focus({ preventScroll: true });
}

function show(rect) {
  if (!bar) return;
  const barW = bar.offsetWidth || 200;
  const barH = bar.offsetHeight || 36;
  let left = rect.left + rect.width / 2 - barW / 2;
  let top = rect.top - barH - 8;

  // Flip below if too close to top
  if (top < 4) {
    top = rect.bottom + 8;
  }
  // Clamp horizontal
  left = Math.max(4, Math.min(left, window.innerWidth - barW - 4));

  bar.style.left = left + "px";
  bar.style.top = top + "px";
  bar.classList.add("visible");
}

function hide() {
  if (!bar) return;
  bar.classList.remove("visible");
  if (linkMode) exitLinkMode();
}

function isVisible() {
  return bar && bar.classList.contains("visible");
}

function updatePosition() {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(() => {
    rafId = null;
    if (linkMode) return; // don't reposition while editing link
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) {
      hide();
      return;
    }
    // Check selection is inside contentEl
    if (!contentEl || !contentEl.contains(sel.anchorNode)) {
      hide();
      return;
    }
    // Skip if slash menu is open
    const slashMenu = document.getElementById("slash-menu");
    if (slashMenu && slashMenu.classList.contains("visible")) {
      hide();
      return;
    }
    // Skip if lang picker is visible
    const langPicker = document.getElementById("lang-picker");
    if (langPicker && langPicker.classList.contains("visible")) {
      hide();
      return;
    }
    // Require some meaningful selection length
    const text = sel.toString();
    if (text.length < 2) {
      hide();
      return;
    }
    const rect = getSelectionRect();
    if (!rect) {
      hide();
      return;
    }
    show(rect);
  });
}

function onSelectionState(state) {
  if (!bar) return;
  for (const btn of buttons) {
    if (btn === null) continue;
    const el = document.getElementById(btn.id);
    if (!el) continue;
    const active = !!state[btn.stateKey];
    el.classList.toggle("active", active);
    el.setAttribute("aria-pressed", String(active));
  }
}

export function initFormatBar(editorEl) {
  contentEl = editorEl;
  buildBar();

  document.addEventListener("selectionchange", updatePosition);
  document.addEventListener("mousedown", onDocumentMousedown);
  // Fallback for WebKitGTK
  contentEl.addEventListener("mouseup", updatePosition);
  contentEl.addEventListener("keyup", updatePosition);
  on("editor:selection-state", onSelectionState);

  on("state:locale", () => {
    buildBar();
  });
}

export function destroyFormatBar() {
  hide();
  document.removeEventListener("selectionchange", updatePosition);
  document.removeEventListener("mousedown", onDocumentMousedown);
  if (contentEl) {
    contentEl.removeEventListener("mouseup", updatePosition);
    contentEl.removeEventListener("keyup", updatePosition);
  }
  if (bar) bar.innerHTML = "";
  contentEl = null;
  linkMode = false;
  savedRange = null;
}

export function focusFormatBar() {
  if (!bar || !isVisible()) return false;
  const first = bar.querySelector("button");
  if (first) { first.focus(); return true; }
  return false;
}
