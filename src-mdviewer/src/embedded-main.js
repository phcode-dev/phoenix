/**
 * Entry point for Phoenix-embedded mdviewr.
 * Initializes components and bridge, waits for content from Phoenix.
 */
import "./styles/app.css";
import { initI18n } from "./core/i18n.js";
import { initViewer } from "./components/viewer.js";
import { initEditor } from "./components/editor.js";
import { initEmbeddedToolbar } from "./components/embedded-toolbar.js";
import { initContextMenu } from "./components/context-menu.js";
import { initBridge } from "./bridge.js";

async function init() {
    // Initialize i18n first (loads English fallback)
    await initI18n();

    // Initialize components
    initViewer();
    initEditor();
    initEmbeddedToolbar();
    initContextMenu();

    // Initialize bridge (sends ready signal to Phoenix)
    initBridge();
}

init().catch((err) => {
    console.error("[mdviewr] Failed to initialize:", err);
});
