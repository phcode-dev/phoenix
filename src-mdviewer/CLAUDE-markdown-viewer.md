# Markdown Viewer/Editor — Development & Testing Guide

## Architecture

The markdown viewer (`src-mdviewer/`) is a standalone web app loaded inside an iframe in Phoenix's Live Preview panel. It communicates with Phoenix via postMessage.

### Iframe nesting (in tests)
```
Test Runner Window
  └── Test Phoenix iframe (testWindow)
        ├── CM5 editor (CodeMirror)
        ├── Live Preview panel
        │     └── #panel-md-preview-frame (md viewer iframe)
        │           ├── #viewer-content (contenteditable in edit mode)
        │           ├── #format-bar, #link-popover
        │           └── embedded-toolbar (reader/edit toggle, cursor sync btn)
        └── MarkdownSync.js (listens for postMessage from md iframe)
```

### Key source files
- `src-mdviewer/src/bridge.js` — postMessage bridge between Phoenix and md iframe. Handles file switching, content sync, keyboard shortcuts, edit mode.
- `src-mdviewer/src/core/doc-cache.js` — Document DOM cache with LRU eviction for file switching.
- `src-mdviewer/src/components/editor.js` — Contenteditable WYSIWYG editing, Turndown HTML→Markdown conversion.
- `src-mdviewer/src/components/embedded-toolbar.js` — Reader/edit toggle, cursor sync, theme toggle, format buttons.
- `src-mdviewer/src/components/format-bar.js` — Floating format bar on text selection (bold, italic, underline, link).
- `src-mdviewer/src/components/link-popover.js` — Link popover for editing/removing links in edit mode.
- `src-mdviewer/src/components/viewer.js` — Reader mode click handling, link interception, copy buttons.
- `src/extensionsIntegrated/Phoenix-live-preview/MarkdownSync.js` — Phoenix-side sync: CM↔iframe content, cursor, scroll, selection, theme.

### Translations / i18n
- The md viewer iframe has its **own** i18n system separate from Phoenix's `src/nls/` strings.
- Root strings (English) are in `src-mdviewer/src/locales/en.json` — edit this file for new/changed strings.
- Other locale files in `src-mdviewer/src/locales/` are **auto-translated by GitHub Actions** — do not edit them manually.
- Use `t("key.subkey")` and `tp("key", { param })` from `src-mdviewer/src/core/i18n.js` for string lookups.
- Phoenix-side strings (e.g. preference descriptions) still go in `src/nls/root/strings.js` as usual.

## Communication: postMessage (reliable in both directions)

- **Phoenix → iframe**: `iframe.contentWindow.postMessage({ type: "MDVIEWR_SET_EDIT_MODE", ... })` — mode switches, file content updates
- **iframe → Phoenix**: bridge.js calls `window.parent.postMessage({ type: "MDVIEWR_EVENT", eventName: "...", ... })` — keyboard shortcuts, content changes, cursor sync, link clicks
- MarkdownSync.js listens for these messages and acts on them (scroll CM, open URLs, handle undo/redo)

### Message types (Phoenix → iframe)
| Type | Purpose |
|------|---------|
| `MDVIEWR_SET_EDIT_MODE` | Toggle edit/reader mode |
| `MDVIEWR_SWITCH_FILE` | Switch to a new file with markdown content |
| `MDVIEWR_CONTENT_UPDATE` | Update content from CM edits |
| `MDVIEWR_SCROLL_TO_LINE` | Scroll viewer to a source line (cursor sync) |
| `MDVIEWR_HIGHLIGHT_SELECTION` | Highlight blocks corresponding to CM selection |

### Event names (iframe → Phoenix via `MDVIEWR_EVENT`)
| eventName | Purpose |
|-----------|---------|
| `mdviewrContentChanged` | Editor content changed (sync to CM) |
| `mdviewrEditModeChanged` | Edit/reader mode toggled |
| `mdviewrKeyboardShortcut` | Forwarded shortcut (Ctrl+S, Ctrl+Shift+F, etc.) |
| `mdviewrUndo` / `mdviewrRedo` | Undo/redo requests |
| `mdviewrScrollSync` | Scroll sync from edit mode click |
| `mdviewrSelectionSync` | Selection sync from viewer to CM |
| `mdviewrCursorSyncToggle` | Cursor sync button toggled |
| `embeddedIframeFocusEditor` | Reader mode click — refocus CM, scroll to source line |
| `embeddedIframeHrefClick` | Link click — opens URL via `NativeApp.openURLInDefaultBrowser` |
| `embeddedEscapeKeyPressed` | Escape key — refocus Phoenix editor |

## Integration Tests

Test file: `test/spec/md-editor-integ-test.js`
Category: `livepreview`, Suite: `livepreview:Markdown Editor`

### Accessing the md iframe from tests
The md iframe is **directly DOM-accessible** (no sandbox in test mode):
```js
testWindow.document.getElementById("panel-md-preview-frame")  // iframe element
iframe.contentDocument  // query #viewer-content, #format-bar, etc.
iframe.contentWindow    // access __setEditModeForTest, __getCurrentContent, etc.
```

### Test helpers exposed on iframe window (`__` prefix)
- `win.__setEditModeForTest(bool)` — toggle edit/reader mode
- `win.__getCurrentContent()` — get the markdown source currently loaded in viewer
- `win.__getActiveFilePath()` — current file path in viewer
- `win.__isSuppressingContentChange()` — true during re-render (wait for false before asserting)
- `win.__triggerContentSync()` — force content sync after `execCommand` formatting
- `win.__getCacheKeys()` / `win.__getWorkingSetPaths()` — inspect doc cache state

### Key test patterns
- **Wait for sync**: `_waitForMdPreviewReady(editor)` — mandatory after every file switch. Verifies iframe visible, bridge initialized, content rendered, and `editor.document.getText()` matches `win.__getCurrentContent()`.
- **Formatting**: Use `_execCommandInMdIframe("bold")` — browsers reject `execCommand` from untrusted `KeyboardEvent`s, so synthetic key events don't work for formatting.
- **Keyboard shortcuts**: Use `_dispatchKeyInMdIframe(key)` — bridge.js captures these and forwards via postMessage to MarkdownSync.
- **Clicking elements**: Click directly on iframe DOM elements (e.g. `paragraph.click()`). The bridge.js click handler fires and sends the appropriate postMessage. Always test the real click flow.
- **Editor APIs**: Use `editor.document.getText()`, `editor.setCursorPos()`, `editor.setSelection()`, `editor.getSelectedText()`, `editor.replaceRange()`, `editor.lineCount()`, `editor.getLine()` — never access `editor._codeMirror` directly.

### Rules
- **Never use `awaits(number)`** — always use `awaitsFor(condition)`.
- **Tests must be independent** — no shared mutable state between `it()` blocks. Use `FILE_CLOSE` with `{ _forceClose: true }` to clean up.
- **Test real behavior** — use actual DOM clicks and CM API calls, not fabricated postMessages.
- **Negative assertions** — move state to a known position first, perform the action, then verify state didn't change.
- **Function interception** — save originals in `beforeAll`, restore in `afterAll` to guard against test failures.

### Debugging test failures
- **Stale DOM refs**: After toolbar re-render or file switch, re-query with `_getMdIFrameDoc().getElementById(...)`.
- **Dirty state**: Check if a prior test left cursor sync disabled, edit mode on, etc. Tests should clean up.
- **Fixture files**: Live in `test/spec/LiveDevelopment-Markdown-test-files/`. After modifying, run `npm run build` and reload the test runner.
- **Test checklist**: `src-mdviewer/to-create-tests.md` tracks what's covered and what's pending.
