import Prism from "prismjs";
import { t } from "../core/i18n.js";

let picker = null;
let contentEl = null;
let rafId = null;
let currentPre = null;
let dropdownOpen = false;
let selectedIndex = -1;
let filteredLangs = [];
let keydownListener = null;
let filterQuery = "";

const LANGUAGES = [
  { id: "", label: "Plain text" },
  { id: "javascript", label: "JavaScript" },
  { id: "typescript", label: "TypeScript" },
  { id: "css", label: "CSS" },
  { id: "json", label: "JSON" },
  { id: "bash", label: "Bash" },
  { id: "python", label: "Python" },
  { id: "rust", label: "Rust" },
  { id: "go", label: "Go" },
  { id: "java", label: "Java" },
  { id: "c", label: "C" },
  { id: "cpp", label: "C++" },
  { id: "yaml", label: "YAML" },
  { id: "toml", label: "TOML" },
  { id: "markdown", label: "Markdown" },
  { id: "sql", label: "SQL" },
  { id: "jsx", label: "JSX" },
  { id: "tsx", label: "TSX" },
];

function langLabel(lang) {
  return lang.id === "" ? t("lang_picker.plain_text") : lang.label;
}

function findPreAtSelection() {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return null;
  let node = sel.anchorNode;
  while (node) {
    if (node.nodeType === 1 && node.tagName === "PRE" && contentEl && contentEl.contains(node)) {
      return node;
    }
    node = node.parentNode;
  }
  return null;
}

function buildPicker() {
  picker = document.getElementById("lang-picker");
  if (!picker) return;
  picker.innerHTML = "";

  // Trigger button
  const trigger = document.createElement("button");
  trigger.className = "lang-picker-trigger";
  trigger.type = "button";
  trigger.textContent = t("lang_picker.plain_text");
  trigger.addEventListener("mousedown", (e) => e.preventDefault());
  trigger.addEventListener("click", () => {
    if (dropdownOpen) {
      closeDropdown();
    } else {
      openDropdown();
    }
  });
  picker.appendChild(trigger);

  // Dropdown container
  const dropdown = document.createElement("div");
  dropdown.className = "lang-picker-dropdown";

  // Search input (display-only, reflects filterQuery typed via captured keydown)
  const search = document.createElement("input");
  search.type = "text";
  search.className = "lang-picker-search";
  search.placeholder = t("lang_picker.filter_placeholder");
  search.setAttribute("aria-label", t("lang_picker.filter_label"));
  search.setAttribute("readonly", "");
  search.addEventListener("mousedown", (e) => e.preventDefault());
  dropdown.appendChild(search);

  // Scrollable list
  const list = document.createElement("div");
  list.className = "lang-picker-list";
  list.setAttribute("role", "listbox");
  dropdown.appendChild(list);

  picker.appendChild(dropdown);
  populateList("");
}

function populateList(filter) {
  const list = picker.querySelector(".lang-picker-list");
  if (!list) return;
  list.innerHTML = "";

  const lowerFilter = filter.toLowerCase();
  filteredLangs = LANGUAGES.filter(
    (lang) => langLabel(lang).toLowerCase().includes(lowerFilter) || lang.id.toLowerCase().includes(lowerFilter),
  );

  const currentLang = currentPre ? (currentPre.getAttribute("data-language") || "") : "";

  filteredLangs.forEach((lang, i) => {
    const item = document.createElement("div");
    item.className = "lang-picker-item";
    item.setAttribute("role", "option");
    item.textContent = langLabel(lang);
    if (lang.id === currentLang) {
      item.classList.add("active");
    }
    item.addEventListener("mousedown", (e) => e.preventDefault());
    item.addEventListener("click", () => selectLanguage(lang.id));
    item.addEventListener("mouseenter", () => {
      setSelectedIndex(i);
    });
    list.appendChild(item);
  });

  selectedIndex = filteredLangs.length > 0 ? 0 : -1;
  highlightSelected();
}

function highlightSelected() {
  const items = picker.querySelectorAll(".lang-picker-item");
  items.forEach((el, i) => {
    el.classList.toggle("selected", i === selectedIndex);
  });
  if (selectedIndex >= 0 && selectedIndex < items.length) {
    items[selectedIndex].scrollIntoView({ block: "nearest" });
  }
}

function setSelectedIndex(idx) {
  selectedIndex = idx;
  highlightSelected();
}

// Keyboard handler — attached on contentEl in capture phase (same as slash-menu)
function handleKeydown(e) {
  if (!dropdownOpen) return;

  if (e.key === "ArrowDown") {
    e.preventDefault();
    e.stopImmediatePropagation();
    const next = selectedIndex < filteredLangs.length - 1 ? selectedIndex + 1 : 0;
    setSelectedIndex(next);
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    e.stopImmediatePropagation();
    const prev = selectedIndex > 0 ? selectedIndex - 1 : filteredLangs.length - 1;
    setSelectedIndex(prev);
  } else if (e.key === "Enter") {
    e.preventDefault();
    e.stopImmediatePropagation();
    if (selectedIndex >= 0 && selectedIndex < filteredLangs.length) {
      selectLanguage(filteredLangs[selectedIndex].id);
    }
  } else if (e.key === "Escape") {
    e.preventDefault();
    e.stopImmediatePropagation();
    closeDropdown();
  } else if (e.key === "Backspace") {
    e.preventDefault();
    e.stopImmediatePropagation();
    if (filterQuery.length > 0) {
      filterQuery = filterQuery.slice(0, -1);
      updateSearchDisplay();
      populateList(filterQuery);
    }
  } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
    // Printable character — append to filter query
    e.preventDefault();
    e.stopImmediatePropagation();
    filterQuery += e.key;
    updateSearchDisplay();
    populateList(filterQuery);
  }
}

function updateSearchDisplay() {
  const search = picker.querySelector(".lang-picker-search");
  if (search) search.value = filterQuery;
}

function selectLanguage(langId) {
  if (!currentPre) return;
  currentPre.setAttribute("data-language", langId);
  // Sync class on <code> and trigger Prism highlighting
  const code = currentPre.querySelector("code");
  if (code) {
    if (langId) {
      code.className = `language-${langId}`;
      Prism.highlightElement(code);
    } else {
      code.className = "";
    }
  }
  // Update trigger text
  const lang = LANGUAGES.find((l) => l.id === langId);
  const trigger = picker.querySelector(".lang-picker-trigger");
  if (trigger) trigger.textContent = lang ? langLabel(lang) : langId || t("lang_picker.plain_text");
  // Dispatch input event to mark editor dirty
  if (contentEl) {
    contentEl.dispatchEvent(new Event("input", { bubbles: true }));
  }
  closeDropdown();
}

function openDropdown() {
  dropdownOpen = true;
  filterQuery = "";
  const dropdown = picker.querySelector(".lang-picker-dropdown");
  if (dropdown) dropdown.classList.add("open");
  updateSearchDisplay();
  populateList("");
}

function closeDropdown() {
  dropdownOpen = false;
  filterQuery = "";
  const dropdown = picker.querySelector(".lang-picker-dropdown");
  if (dropdown) dropdown.classList.remove("open");
  selectedIndex = -1;
}

function show(preEl) {
  if (!picker) return;
  currentPre = preEl;
  // Set trigger text from current language
  const lang = preEl.getAttribute("data-language") || "";
  const entry = LANGUAGES.find((l) => l.id === lang);
  const trigger = picker.querySelector(".lang-picker-trigger");
  if (trigger) trigger.textContent = entry ? langLabel(entry) : lang || t("lang_picker.plain_text");

  // Position near top-left of <pre>
  const rect = preEl.getBoundingClientRect();
  const pickerW = picker.offsetWidth || 180;
  let left = rect.left;
  let top = rect.top - (picker.offsetHeight || 32) - 6;

  // If too close to top, show below the pre's top edge
  if (top < 4) {
    top = rect.top + 4;
  }
  // Clamp horizontal
  left = Math.max(4, Math.min(left, window.innerWidth - pickerW - 4));

  picker.style.left = left + "px";
  picker.style.top = top + "px";
  picker.classList.add("visible");
}

function hide() {
  if (!picker) return;
  picker.classList.remove("visible");
  closeDropdown();
  currentPre = null;
}

function updatePosition() {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(() => {
    rafId = null;
    if (dropdownOpen) return; // don't reposition while dropdown is open

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

    // Hide if format-bar or slash-menu is visible
    const formatBar = document.getElementById("format-bar");
    if (formatBar && formatBar.classList.contains("visible")) {
      hide();
      return;
    }
    const slashMenu = document.getElementById("slash-menu");
    if (slashMenu && slashMenu.classList.contains("visible")) {
      hide();
      return;
    }

    const pre = findPreAtSelection();
    if (pre) {
      show(pre);
    } else {
      hide();
    }
  });
}

function onDocumentMousedown(e) {
  if (!picker) return;
  if (!dropdownOpen) return;
  if (picker.contains(e.target)) return;
  closeDropdown();
}

export function isLangPickerDropdownOpen() {
  return dropdownOpen;
}

export function initLangPicker(editorEl) {
  contentEl = editorEl;
  buildPicker();

  keydownListener = handleKeydown;
  contentEl.addEventListener("keydown", keydownListener, true); // capture phase

  document.addEventListener("selectionchange", updatePosition);
  contentEl.addEventListener("mouseup", updatePosition);
  contentEl.addEventListener("keyup", updatePosition);
  document.addEventListener("mousedown", onDocumentMousedown);
}

export function destroyLangPicker() {
  hide();
  if (contentEl) {
    contentEl.removeEventListener("keydown", keydownListener, true);
    contentEl.removeEventListener("mouseup", updatePosition);
    contentEl.removeEventListener("keyup", updatePosition);
  }
  document.removeEventListener("selectionchange", updatePosition);
  document.removeEventListener("mousedown", onDocumentMousedown);
  if (picker) picker.innerHTML = "";
  contentEl = null;
  currentPre = null;
  dropdownOpen = false;
  selectedIndex = -1;
  filteredLangs = [];
  keydownListener = null;
  filterQuery = "";
}
