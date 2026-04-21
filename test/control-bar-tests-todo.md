# Central Control Bar & Design Mode — Tests TODO

Planned as `mainview`-category integration tests (spawns full Phoenix iframe so
sidebar, CCB, live-preview panel, and main-toolbar are all real). Single suite:

```js
describe("mainview: central control bar + design mode", function () { … });
```

Keep this file updated as we add coverage; remove lines as suites land.

---
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
