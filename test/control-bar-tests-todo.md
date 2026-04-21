# Central Control Bar & Design Mode — Tests TODO

Planned as `mainview`-category integration tests (spawns full Phoenix iframe so
sidebar, CCB, live-preview panel, and main-toolbar are all real). Single suite:

```js
describe("mainview: central control bar + design mode", function () { … });
```

Keep this file updated as we add coverage; remove lines as suites land.

---

## 10. `WorkspaceManager.setPluginPanelWidth` in design mode

- [ ] Setting width W while collapsed resizes the sidebar to
      `window - W - pluginIcons - 30 (CCB)` (clamped to ≥ 0) and derives
      main-toolbar width accordingly.
- [ ] Setting width W in normal mode falls through to the original
      implementation (which clamps against 75% window / `window - sidebar
      - 100`).

## 11. Cycle stability

- [ ] Enter design → drag sidebar past cap → exit → re-enter: CCB,
      main-toolbar, sidebar all end up aligned (`ccb.left === sidebar.right`,
      `mainToolbar.left === sidebar.right + 30`).
- [ ] After the cycle, `sidebar.style.width === sidebar.offsetWidth + "px"`
      (pinned at the capped value, not the uncapped Resizer value).
- [ ] Toggle back to normal mode preserves live preview (panel stays open
      at `savedToolbarWidth` or the default).

## 11b. Auto-exit design mode from conflicting surfaces

Each of these invocations must exit design mode before running its
own behavior. Verify `WorkspaceManager.isInDesignMode()` is `true`
pre-action, then `false` post-action, and that the feature's UI
renders on the normal editor chrome (not a blank / broken region).

- [ ] Clicking `#app-drawer-button` while in design mode exits design
      mode, then toggles the default (tools) bottom panel.
- [ ] Running `Commands.CMD_FIND_IN_FILES` while in design mode exits
      design mode before the find bar / results panel mount.
- [ ] Running `Commands.NAVIGATE_QUICK_OPEN` while in design mode
      exits design mode before Quick Open's modal bar is shown.
- [ ] Clicking `#git-toolbar-icon` while in design mode exits design
      mode, then `Panel.toggle()` opens/closes the git panel.
- [ ] In the above four cases, when NOT in design mode the auto-exit
      branch is skipped and the original behavior runs unchanged.

Future follow-ups (no tests yet — track as TODOs alongside the site
comments added in the source files):

- [ ] Tools panel floats over live preview so users can peek without
      leaving design mode.
- [ ] Find in Files renders an overlay modal bar and a floating
      results surface compatible with design mode.
- [ ] Quick Open gets a spotlight-style floating picker usable in
      design mode.
- [ ] Git panel gains a floating variant for design mode.

## 12. Integration with NoDistractions

- [ ] Design mode + toggling `noDistractions` preference to `true`:
  - sidebar hides,
  - main-toolbar and bottom panels stay visible,
  - `_hidePanelsIfRequired` is NOT invoked (spy).
- [ ] Design mode + toggling `noDistractions` to `false`:
  - sidebar shows,
  - `_showPanelsIfRequired` is NOT invoked.
- [ ] Normal mode + toggling `noDistractions`: original behavior —
      `ViewUtils.hideMainToolBar()`, sidebar hide, panels hidden.

## 13. Command / event surface

- [ ] `WorkspaceManager.isInDesignMode` exists and returns the current state.
- [ ] `WorkspaceManager.setDesignMode(true/false)` triggers
      `EVENT_WORKSPACE_DESIGN_MODE_CHANGE` with the new boolean.
- [ ] Repeat calls to `setDesignMode` with the same value do NOT fire the
      event.
- [ ] `exports.isEditorCollapsed()` / `setEditorCollapsed()` on CCB still
      work (back-compat surface).

---

## Test harness notes

- The suite is expected to run under the `mainview` category (embedded
  Phoenix iframe). Use `SpecRunnerUtils.createWindowAndRun` or the existing
  mainview bootstrap.
- Never use `awaits(number)` — every "wait for X" must be `awaitsFor` on a
  boolean condition.
- Clean up between tests:
  - `_setEditorCollapsed(false)` (if currently collapsed),
  - close live preview via `FILE_LIVE_FILE_PREVIEW`,
  - reset sidebar width via `$("#sidebar").width("")`.
- Prefer `editor.*` / `WorkspaceManager.*` APIs over reading inline styles
  directly; fall back to `offsetWidth` only where CSS `max-width` can make
  `style.width` misleading.
