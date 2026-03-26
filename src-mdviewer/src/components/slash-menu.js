import {
  createIcons,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  ListChecks,
  Quote,
  FileCode,
  Table,
  Minus,
  Pilcrow,
  Workflow,
} from "lucide";
import { emit } from "../core/events.js";
import { getSelectionRect } from "./editor.js";
import { t } from "../core/i18n.js";

let menu = null;
let contentEl = null;
let visible = false;
let selectedIndex = 0;
let query = "";
let slashRange = null;
let _savedSlashRect = null;
let filteredItems = [];
let overflowCount = 0;
let inputListener = null;
let keydownListener = null;
let beforeInputListener = null;
let clickOutsideListener = null;
let pendingEnterIndex = -1;

const menuItems = [
  { labelKey: "slash.paragraph", descKey: "slash.paragraph_desc", icon: "pilcrow", command: "formatBlock", value: "<p>" },
  { labelKey: "slash.heading1", descKey: "slash.heading1_desc", icon: "heading-1", command: "formatBlock", value: "<h1>" },
  { labelKey: "slash.heading2", descKey: "slash.heading2_desc", icon: "heading-2", command: "formatBlock", value: "<h2>" },
  { labelKey: "slash.heading3", descKey: "slash.heading3_desc", icon: "heading-3", command: "formatBlock", value: "<h3>" },
  { labelKey: "slash.bullet_list", descKey: "slash.bullet_list_desc", icon: "list", command: "insertUnorderedList" },
  { labelKey: "slash.numbered_list", descKey: "slash.numbered_list_desc", icon: "list-ordered", command: "insertOrderedList" },
  { labelKey: "slash.task_list", descKey: "slash.task_list_desc", icon: "list-checks", command: "taskList" },
  { labelKey: "slash.blockquote", descKey: "slash.blockquote_desc", icon: "quote", command: "formatBlock", value: "<blockquote>" },
  { labelKey: "slash.code_block", descKey: "slash.code_block_desc", icon: "file-code", command: "codeBlock" },
  { labelKey: "slash.table", descKey: "slash.table_desc", icon: "table", command: "table" },
  { labelKey: "slash.divider", descKey: "slash.divider_desc", icon: "minus", command: "insertHorizontalRule" },
  { labelKey: "slash.mermaid", descKey: "slash.mermaid_desc", icon: "workflow", command: "mermaidBlock" },
];

function fuzzyScore(query, text) {
  if (!query) return { score: 0, indices: [] };
  const q = query.toLowerCase(), t = text.toLowerCase();

  // Fast path: exact substring
  const subIdx = t.indexOf(q);
  if (subIdx !== -1) {
    const indices = Array.from({ length: q.length }, (_, i) => subIdx + i);
    let score = 100;
    if (subIdx === 0 || /[\s\-_]/.test(text[subIdx - 1])) score += 10;
    return { score, indices };
  }

  // Character-by-character fuzzy
  let qi = 0, score = 0, lastIdx = -2;
  const indices = [];
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      indices.push(ti);
      score += 1;
      if (ti === 0 || /[\s\-_]/.test(text[ti - 1])) score += 10;
      if (ti === lastIdx + 1) score += 5;
      lastIdx = ti;
      qi++;
    }
  }
  return qi < q.length ? null : { score, indices };
}

const FRECENCY_KEY = "mdviewr-slash-frecency";
const DECAY_DAYS = 7;

// In-memory frecency store (localStorage unavailable in sandboxed iframe without allow-same-origin)
let _frecencyData = {};

function loadFrecency() {
  return _frecencyData;
}
function saveFrecency(data) {
  _frecencyData = data;
}
function recordUsage(id) {
  const d = loadFrecency();
  const e = d[id] || { count: 0, lastUsed: 0 };
  e.count++; e.lastUsed = Date.now();
  d[id] = e; saveFrecency(d);
}
function getFrecencyScore(id) {
  const e = loadFrecency()[id];
  if (!e) return 0;
  return e.count * Math.pow(0.5, (Date.now() - e.lastUsed) / (864e5 * DECAY_DAYS));
}

const shortcutHints = {
  "slash.heading1": "# ", "slash.heading2": "## ", "slash.heading3": "### ",
  "slash.bullet_list": "- ", "slash.numbered_list": "1. ",
  "slash.task_list": "- [ ] ", "slash.blockquote": "> ",
  "slash.code_block": "```", "slash.divider": "---",
  "slash.mermaid": "```mermaid",
};

function escapeHTML(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function highlightMatches(text, indices) {
  if (!indices?.length) return escapeHTML(text);
  const set = new Set(indices);
  let result = "", inMark = false;
  for (let i = 0; i < text.length; i++) {
    if (set.has(i) && !inMark) { result += "<mark>"; inMark = true; }
    else if (!set.has(i) && inMark) { result += "</mark>"; inMark = false; }
    result += escapeHTML(text[i]);
  }
  return inMark ? result + "</mark>" : result;
}

function renderItems() {
  let scored;

  if (query) {
    scored = menuItems.map(item => {
      const label = t(item.labelKey);
      const desc = t(item.descKey);
      const labelResult = fuzzyScore(query, label);
      const descResult = fuzzyScore(query, desc);
      const fuzzy = Math.max(labelResult?.score || 0, (descResult?.score || 0) * 0.5);
      if (fuzzy === 0) return null;
      const frecency = getFrecencyScore(item.labelKey);
      return { item, score: fuzzy * 0.7 + frecency * 0.3, labelIndices: labelResult?.indices || [] };
    }).filter(Boolean);
    scored.sort((a, b) => b.score - a.score);
  } else {
    const hasUsage = menuItems.some(item => getFrecencyScore(item.labelKey) > 0);
    scored = menuItems.map((item, i) => ({
      item,
      score: hasUsage ? getFrecencyScore(item.labelKey) : -i,
      labelIndices: [],
    }));
    if (hasUsage) scored.sort((a, b) => b.score - a.score);
  }

  const cap = query ? 6 : scored.length;
  overflowCount = Math.max(0, scored.length - cap);
  const visible = scored.slice(0, cap);
  filteredItems = visible.map(s => s.item);

  if (filteredItems.length === 0) {
    menu.innerHTML = `<div class="slash-menu-item" style="color:var(--color-text-tertiary);cursor:default;">${t("slash.no_results")}</div>`;
    selectedIndex = -1;
    return;
  }

  selectedIndex = Math.min(selectedIndex, filteredItems.length - 1);
  if (selectedIndex < 0) selectedIndex = 0;

  let html = visible
    .map((entry, i) => {
      const item = entry.item;
      const cls = i === selectedIndex ? "slash-menu-item selected" : "slash-menu-item";
      const id = `slash-item-${i}`;
      const label = t(item.labelKey);
      const desc = t(item.descKey);
      const hint = shortcutHints[item.labelKey];
      const hintHTML = hint ? `<span class="slash-menu-item-hint"><code>${escapeHTML(hint)}</code></span>` : "";
      return `<div class="${cls}" id="${id}" role="option" aria-selected="${i === selectedIndex}" data-index="${i}">
        <i data-lucide="${item.icon}"></i>
        <div class="slash-menu-item-text">
          <span class="slash-menu-item-label">${highlightMatches(label, entry.labelIndices)}</span>
          <span class="slash-menu-item-desc">${desc}</span>
        </div>
        ${hintHTML}
      </div>`;
    })
    .join("");

  if (overflowCount > 0) {
    html += `<div class="slash-menu-overflow">+${overflowCount} more\u2026</div>`;
  }

  menu.innerHTML = html;

  createIcons({
    icons: { Pilcrow, Heading1, Heading2, Heading3, List, ListOrdered, ListChecks, Quote, FileCode, Table, Minus, Workflow },
    attrs: { class: "" },
  });

  // Click/touch handlers
  menu.querySelectorAll(".slash-menu-item[data-index]").forEach((el) => {
    const handler = (e) => {
      e.preventDefault();
      const idx = parseInt(el.dataset.index, 10);
      selectItem(idx);
    };
    el.addEventListener("mousedown", handler);
    el.addEventListener("touchend", handler);
  });

  // Update aria-activedescendant
  menu.setAttribute("aria-activedescendant", `slash-item-${selectedIndex}`);
}

function show() {
  if (!_savedSlashRect) return;
  const rect = _savedSlashRect;
  const anchor = document.getElementById("slash-menu-anchor");
  if (!anchor) return;

  // Position anchor below the cursor line with gap
  const lineHeight = rect.bottom - rect.top;
  anchor.style.left = rect.left + "px";
  anchor.style.top = rect.bottom + 4 + "px";

  anchor.classList.add("visible");
  menu.scrollTop = 0;
  visible = true;

  // Position menu below or above based on available space
  requestAnimationFrame(() => {
    const spaceBelow = window.innerHeight - rect.bottom - 4;
    const menuHeight = Math.min(300, menu.scrollHeight);

    if (spaceBelow >= menuHeight || spaceBelow >= rect.top) {
      // Below cursor
      menu.style.top = "0";
      menu.style.bottom = "";
    } else {
      // Above cursor — move anchor above the line
      anchor.style.top = (rect.top - 4) + "px";
      menu.style.top = "";
      menu.style.bottom = "0";
    }

    // Clamp horizontal
    const menuRect = menu.getBoundingClientRect();
    if (menuRect.right > window.innerWidth - 8) {
      menu.style.left = Math.max(8, window.innerWidth - menuRect.width - 8) + "px";
    }
  });
}

function hide() {
  const anchor = document.getElementById("slash-menu-anchor");
  if (anchor) {
    anchor.classList.remove("visible");
  }
  visible = false;
  query = "";
  selectedIndex = 0;
  slashRange = null;
  _savedSlashRect = null;
  pendingEnterIndex = -1;
  overflowCount = 0;
}

function selectItem(index) {
  if (index < 0 || index >= filteredItems.length) return;
  const item = filteredItems[index];
  recordUsage(item.labelKey);

  // Capture slashRange before hide() clears it
  const savedRange = slashRange;

  // Always hide first to prevent stuck visible state
  hide();

  // Delete /query from DOM using execCommand to keep the browser's editing
  // model in sync — direct DOM manipulation (deleteContents) breaks
  // subsequent execCommand calls like formatBlock.
  try {
    if (savedRange) {
      const sel = window.getSelection();
      if (sel.rangeCount) {
        const currentRange = sel.getRangeAt(0);
        const deleteRange = document.createRange();
        deleteRange.setStart(savedRange.startContainer, savedRange.startOffset);
        deleteRange.setEnd(currentRange.endContainer, currentRange.endOffset);
        sel.removeAllRanges();
        sel.addRange(deleteRange);
        document.execCommand("delete", false, null);
      }
    }
  } catch (_) {
    // On iOS the stored range may be invalid — tolerate failure
  }

  // Emit format command
  emit("action:format", { command: item.command, value: item.value });

  contentEl?.focus({ preventScroll: true });
}

function isAtBlockStart() {
  const sel = window.getSelection();
  if (!sel.rangeCount) return false;
  const range = sel.getRangeAt(0);
  const node = range.startContainer;

  // Walk up to find the block-level parent
  let block = node;
  const blockTags = new Set(["P", "DIV", "H1", "H2", "H3", "H4", "H5", "H6", "LI", "BLOCKQUOTE", "TD", "TH"]);
  while (block && block !== contentEl) {
    if (block.nodeType === 1 && blockTags.has(block.tagName)) break;
    block = block.parentNode;
  }
  if (!block || block === contentEl) block = node;

  // Check if the text before the caret (within the block) is empty or whitespace
  const textBefore = getTextBeforeCaret(block);
  return textBefore.trim() === "" || textBefore.trim() === "/";
}

function getTextBeforeCaret(container) {
  const sel = window.getSelection();
  if (!sel.rangeCount) return "";
  const range = sel.getRangeAt(0);
  const preRange = document.createRange();
  preRange.setStart(container, 0);
  preRange.setEnd(range.startContainer, range.startOffset);
  return preRange.toString();
}

function handleInput() {
  if (!contentEl) return;

  if (visible) {
    // Update query: get text between slash position and current caret
    const sel = window.getSelection();
    if (!sel.rangeCount || !slashRange) {
      hide();
      return;
    }
    const range = sel.getRangeAt(0);
    const queryRange = document.createRange();
    try {
      queryRange.setStart(slashRange.endContainer, slashRange.endOffset);
      queryRange.setEnd(range.startContainer, range.startOffset);
      query = queryRange.toString();
    } catch {
      hide();
      return;
    }

    // If query has spaces or is too long, close
    if (query.length > 20 || query.includes("\n")) {
      hide();
      return;
    }

    renderItems();
    return;
  }

  // Check if / was just typed
  const sel = window.getSelection();
  if (!sel.rangeCount) return;
  const range = sel.getRangeAt(0);
  if (!range.collapsed) return;

  let node = range.startContainer;
  let offset = range.startOffset;

  // If cursor is at an element node, resolve to the child text node
  if (node.nodeType !== 3) {
    const child = node.childNodes[offset - 1];
    if (child && child.nodeType === 3) {
      node = child;
      offset = node.textContent.length;
    } else {
      return;
    }
  }
  if (offset < 1) return;

  const char = node.textContent[offset - 1];
  if (char !== "/") return;

  // Check that it's preceded by start of block, whitespace, or <br>
  if (offset > 1) {
    const prev = node.textContent[offset - 2];
    if (prev && prev !== " " && prev !== "\n" && prev !== "\t") return;
  } else {
    // offset === 1: check if preceded by <br> (line start after Enter) or at block start
    const prevSibling = node.previousSibling;
    const afterBr = prevSibling && prevSibling.nodeName === "BR";
    if (!afterBr && !isAtBlockStart()) return;
  }

  // Save the caret rect at the / position for menu positioning.
  // Insert a temp marker, measure, remove — do this before creating slashRange.
  const marker = document.createElement("span");
  marker.textContent = "\u200b";
  range.insertNode(marker);
  const markerRect = marker.getBoundingClientRect();
  _savedSlashRect = { top: markerRect.top, bottom: markerRect.bottom, left: markerRect.left };
  marker.parentNode.removeChild(marker);
  // Restore selection after marker removal
  sel.removeAllRanges();
  const restored = document.createRange();
  restored.setStart(node, offset);
  restored.collapse(true);
  sel.addRange(restored);

  // Save the slash range
  slashRange = document.createRange();
  slashRange.setStart(node, offset - 1);
  slashRange.setEnd(node, offset);

  query = "";
  selectedIndex = 0;
  renderItems();
  show();
}

function handleKeydown(e) {
  if (!visible) return;

  if (e.key === "ArrowDown") {
    e.preventDefault();
    e.stopImmediatePropagation();
    selectedIndex = (selectedIndex + 1) % filteredItems.length;
    renderItems();
    const sel = menu.querySelector(".slash-menu-item.selected");
    if (sel) sel.scrollIntoView({ block: "nearest" });
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    e.stopImmediatePropagation();
    selectedIndex = (selectedIndex - 1 + filteredItems.length) % filteredItems.length;
    renderItems();
    const sel = menu.querySelector(".slash-menu-item.selected");
    if (sel) sel.scrollIntoView({ block: "nearest" });
  } else if (e.key === "Enter") {
    e.preventDefault();
    e.stopImmediatePropagation();
    // Don't call selectItem here — on iOS, preventDefault on keydown
    // doesn't stop the browser from inserting a paragraph break.
    // Defer to beforeinput (which CAN reliably prevent it) or a fallback.
    pendingEnterIndex = selectedIndex;
    setTimeout(() => {
      if (pendingEnterIndex >= 0) {
        const idx = pendingEnterIndex;
        pendingEnterIndex = -1;
        selectItem(idx);
      }
    }, 0);
  } else if (e.key === "Escape") {
    e.preventDefault();
    e.stopImmediatePropagation();
    hide();
  } else if (e.key === "Backspace") {
    // If query is empty and we backspace, close the menu
    // (the / itself will be deleted naturally)
    if (query === "") {
      // Let the browser handle the backspace, then hide
      requestAnimationFrame(() => hide());
    }
  }
}

function handleBeforeInput(e) {
  if (e.inputType !== "insertParagraph") return;
  // On iOS, keydown.preventDefault() doesn't stop the paragraph break.
  // beforeinput.preventDefault() DOES work reliably on all platforms.
  if (pendingEnterIndex >= 0) {
    // keydown already fired — prevent the paragraph break and select now
    e.preventDefault();
    const idx = pendingEnterIndex;
    pendingEnterIndex = -1;
    selectItem(idx);
    return;
  }
  // iOS may skip keydown "Enter" entirely (e.g. virtual keyboard IME)
  if (visible && filteredItems.length > 0 && selectedIndex >= 0) {
    e.preventDefault();
    selectItem(selectedIndex);
  }
}

function handleClickOutside(e) {
  if (!visible) return;
  if (menu.contains(e.target)) return;
  hide();
}

export function isSlashMenuVisible() {
  return visible;
}

export function initSlashMenu(editorEl) {
  contentEl = editorEl;
  menu = document.getElementById("slash-menu");
  if (!menu) return;

  inputListener = handleInput;
  keydownListener = handleKeydown;
  beforeInputListener = handleBeforeInput;
  clickOutsideListener = handleClickOutside;

  contentEl.addEventListener("input", inputListener);
  contentEl.addEventListener("keydown", keydownListener, true);
  contentEl.addEventListener("beforeinput", beforeInputListener, true);
  document.addEventListener("mousedown", clickOutsideListener);
}

export function destroySlashMenu() {
  hide();
  if (contentEl) {
    contentEl.removeEventListener("input", inputListener);
    contentEl.removeEventListener("keydown", keydownListener, true);
    contentEl.removeEventListener("beforeinput", beforeInputListener, true);
  }
  document.removeEventListener("mousedown", clickOutsideListener);
  if (menu) menu.innerHTML = "";
  contentEl = null;
  inputListener = null;
  keydownListener = null;
  beforeInputListener = null;
  clickOutsideListener = null;
}
