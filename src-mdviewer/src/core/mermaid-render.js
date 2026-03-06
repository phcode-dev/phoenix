/**
 * Lazy-loaded mermaid rendering module.
 * Finds `pre[data-language="mermaid"]` blocks and renders them as SVG diagrams.
 */

const devLog = import.meta.env.DEV ? console.log.bind(console, "[mermaid]") : () => {};

let mermaidModule = null;
let currentTheme = null;
let idCounter = 0;

export function detectTheme() {
  const attr = document.documentElement.getAttribute("data-theme");
  return attr === "dark" ? "dark" : "default";
}

export async function ensureMermaid(theme) {
  if (!mermaidModule) {
    devLog("importing mermaid module");
    mermaidModule = (await import("mermaid")).default;
    devLog("mermaid module loaded");
  }
  if (theme !== currentTheme) {
    currentTheme = theme;
    devLog("initializing with theme:", theme);
    mermaidModule.initialize({
      startOnLoad: false,
      theme,
      securityLevel: "strict",
      fontFamily: "inherit",
    });
  }
  return mermaidModule;
}

export function parseAccessibility(source) {
  const titleMatch = source.match(/accTitle\s*:\s*(.+)/);
  const descrMatch = source.match(/accDescr\s*:\s*(.+)/);
  return {
    title: titleMatch ? titleMatch[1].trim() : null,
    description: descrMatch ? descrMatch[1].trim() : null,
  };
}

function createSkeleton() {
  const skeleton = document.createElement("div");
  skeleton.className = "mermaid-skeleton";
  skeleton.setAttribute("aria-busy", "true");
  skeleton.setAttribute("aria-label", "Loading diagram");
  return skeleton;
}

function createErrorContainer(message, source) {
  const container = document.createElement("div");
  container.className = "mermaid-diagram mermaid-error";
  container.setAttribute("data-mermaid-source", source);
  container.setAttribute("contenteditable", "false");

  const msgEl = document.createElement("div");
  msgEl.className = "mermaid-error-message";
  msgEl.textContent = "Diagram error: " + message;
  container.appendChild(msgEl);

  const details = document.createElement("details");
  details.className = "mermaid-error-source";
  const summary = document.createElement("summary");
  summary.textContent = "Source";
  details.appendChild(summary);
  const pre = document.createElement("pre");
  const code = document.createElement("code");
  code.textContent = source;
  pre.appendChild(code);
  details.appendChild(pre);
  container.appendChild(details);

  return container;
}

export function cleanupMermaidOrphans(id) {
  // Mermaid creates temporary elements with the render id (and prefixed variants)
  // Only remove direct children of document.body — not elements we deliberately
  // placed inside #viewer-content (the rendered SVGs share the same id).
  for (const selector of [`:scope > #${id}`, `:scope > #d${id}`, `:scope > #i${id}`]) {
    try {
      const orphan = document.body.querySelector(selector);
      if (orphan) orphan.remove();
    } catch { /* invalid selector — skip */ }
  }
}

export function applyAccessibility(svgEl, acc) {
  svgEl.setAttribute("role", "img");

  let titleId = null;
  let descrId = null;

  if (acc.title) {
    titleId = "mermaid-title-" + idCounter;
    let titleEl = svgEl.querySelector("title");
    if (!titleEl) {
      titleEl = document.createElementNS("http://www.w3.org/2000/svg", "title");
      svgEl.prepend(titleEl);
    }
    titleEl.textContent = acc.title;
    titleEl.id = titleId;
  }

  if (acc.description) {
    descrId = "mermaid-desc-" + idCounter;
    let descEl = svgEl.querySelector("desc");
    if (!descEl) {
      descEl = document.createElementNS("http://www.w3.org/2000/svg", "desc");
      const titleEl = svgEl.querySelector("title");
      if (titleEl) {
        titleEl.after(descEl);
      } else {
        svgEl.prepend(descEl);
      }
    }
    descEl.textContent = acc.description;
    descEl.id = descrId;
  }

  const labelParts = [titleId, descrId].filter(Boolean);
  if (titleId) svgEl.setAttribute("aria-labelledby", titleId);
  if (descrId) svgEl.setAttribute("aria-describedby", descrId);
  if (labelParts.length === 0) {
    svgEl.setAttribute("aria-label", "Mermaid diagram");
  }
}

/**
 * Render all `pre[data-language="mermaid"]` blocks in the given container.
 */
export async function renderMermaidBlocks(container) {
  const blocks = container.querySelectorAll('pre[data-language="mermaid"]');
  devLog("found", blocks.length, "mermaid blocks");
  if (blocks.length === 0) return;

  const theme = detectTheme();
  let mermaid;
  try {
    mermaid = await ensureMermaid(theme);
  } catch (err) {
    console.error("[mermaid] Failed to load mermaid module:", err);
    for (const pre of blocks) {
      const source = (pre.querySelector("code") || pre).textContent.trim();
      pre.replaceWith(createErrorContainer(err.message || String(err), source));
    }
    return;
  }

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  for (const pre of blocks) {
    const codeEl = pre.querySelector("code");
    const source = codeEl ? codeEl.textContent.trim() : pre.textContent.trim();
    if (!source) {
      const errorEl = createErrorContainer("Empty diagram", source);
      pre.replaceWith(errorEl);
      continue;
    }

    // Create wrapper
    const wrapper = document.createElement("div");
    wrapper.className = "mermaid-diagram";
    wrapper.setAttribute("data-mermaid-source", source);
    wrapper.setAttribute("contenteditable", "false");
    wrapper.setAttribute("tabindex", "0");

    // Show skeleton
    const skeleton = createSkeleton();
    wrapper.appendChild(skeleton);
    pre.replaceWith(wrapper);

    const id = `mermaid-${Date.now()}-${idCounter++}`;
    try {
      devLog("rendering block:", id, source.slice(0, 60));
      const { svg } = await mermaid.render(id, source);
      devLog("render success:", id);

      // Parse SVG and apply accessibility
      const temp = document.createElement("div");
      temp.innerHTML = svg;
      const svgEl = temp.querySelector("svg");

      if (svgEl) {
        const acc = parseAccessibility(source);
        applyAccessibility(svgEl, acc);

        if (reducedMotion) {
          skeleton.replaceWith(svgEl);
        } else {
          svgEl.style.opacity = "0";
          skeleton.replaceWith(svgEl);
          requestAnimationFrame(() => {
            svgEl.style.transition = "opacity 200ms ease-in-out";
            svgEl.style.opacity = "1";
          });
        }
      } else {
        skeleton.replaceWith(createErrorContainer("Failed to generate SVG", source).firstChild);
      }
    } catch (err) {
      const message = err.message || String(err);
      console.warn("[mermaid] render error:", id, message);

      const errorEl = createErrorContainer(message, source);
      wrapper.replaceWith(errorEl);
    } finally {
      // Clean up orphan elements mermaid may leave in document.body
      cleanupMermaidOrphans(id);
    }
  }
}

/**
 * Re-render existing mermaid diagrams after a theme change.
 */
export async function reRenderMermaidBlocks(container) {
  const diagrams = container.querySelectorAll(".mermaid-diagram[data-mermaid-source]");
  if (diagrams.length === 0) return;

  const theme = detectTheme();
  if (theme === currentTheme && mermaidModule) {
    // Theme didn't actually change — skip
    // But force re-render anyway since this is called on theme change
  }
  const mermaid = await ensureMermaid(theme);
  // Force re-initialize with new theme
  currentTheme = null;
  await ensureMermaid(theme);

  for (const wrapper of diagrams) {
    const source = wrapper.getAttribute("data-mermaid-source");
    if (!source) continue;

    const id = `mermaid-${Date.now()}-${idCounter++}`;
    try {
      const { svg } = await mermaid.render(id, source);

      const temp = document.createElement("div");
      temp.innerHTML = svg;
      const svgEl = temp.querySelector("svg");

      if (svgEl) {
        const acc = parseAccessibility(source);
        applyAccessibility(svgEl, acc);

        // Replace content but keep wrapper
        wrapper.classList.remove("mermaid-error");
        wrapper.innerHTML = "";
        wrapper.appendChild(svgEl);
      }
    } catch (err) {
      // Keep existing error/diagram — don't replace with a worse state
    } finally {
      cleanupMermaidOrphans(id);
    }
  }
}
