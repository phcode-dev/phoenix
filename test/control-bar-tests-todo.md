# Central Control Bar & Design Mode — Tests TODO

Planned as `mainview`-category integration tests (spawns full Phoenix iframe so
sidebar, CCB, live-preview panel, and main-toolbar are all real). Single suite:

```js
describe("mainview: central control bar + design mode", function () { … });
```

Keep this file updated as we add coverage; remove lines as suites land.

---

## 1. Layout / DOM structure

- [ ] `#centralControlBar` exists at boot, positioned between sidebar and
      `.content`, 30px wide.
- [ ] CCB groups render in order: collapse-editor, sidebar-toggle, undo/redo,
      save, nav (search / back / forward), vertical filename label.
- [ ] Sidebar's `data-minsize` is `30` (so drag can't auto-collapse below CCB).
- [ ] Sidebar's resizer handle is shifted right of the CCB via CSS
      `transform: translateX(30px)` — clicking at `sidebar.right + 30` lands
      on the resizer element.
- [ ] When the sidebar is hidden, the Resizer moves the handle to be a sibling
      of `#sidebar` inside `.main-view`; the same shift still applies.

## 2. CCB buttons

- [ ] Undo / Redo / Save buttons fire `Commands.EDIT_UNDO`, `EDIT_REDO`,
      `FILE_SAVE` respectively.
- [ ] Search / Back / Forward / Show-in-Tree buttons still trigger the
      `NavigationProvider` behaviors after being moved out of `#mainNavBarRight`.
- [ ] `#ccbSidebarToggleBtn` executes `VIEW_HIDE_SIDEBAR` and the icon flips
      `fa-angles-left` ↔ `fa-angles-right` on panelCollapsed/panelExpanded.
- [ ] The old `#sidebar-toggle-btn` in the menubar is NOT in the DOM.
- [ ] `#ccbShowInTreeBtn` is rendered in `.ccb-group-nav` directly below
      `#searchNav` and has a `title` of `Strings.CMD_SHOW_IN_TREE`.
- [ ] Clicking `#ccbShowInTreeBtn` executes `NAVIGATE_SHOW_IN_FILE_TREE` (if
      sidebar was hidden, it re-opens as part of the command).
- [ ] Binoculars `<svg>` renders and inherits `.ccb-btn` color
      (`currentColor` on the path).
- [ ] Neither `#ccbFileLabel`, `.ccb-group-file`, `.ccb-file-label`,
      `.ccb-file-name`, nor `.ccb-file-dot` exists in the DOM or in the
      compiled CSS.

## 3. Toggle Design Mode command

- [ ] `Commands.VIEW_TOGGLE_DESIGN_MODE === "view.toggleDesignMode"` is
      registered at module load, visible via `CommandManager.get`.
- [ ] Default keybinding: `Ctrl-F11` (from `base-config/keyboard.json`).
- [ ] File menu has "Toggle Design Mode" directly below "Live Preview" and
      above "Reload Live Preview".
- [ ] Command's checked state mirrors `WorkspaceManager.isInDesignMode()` on
      both entry and exit.
- [ ] Clicking `#ccbCollapseEditorBtn` routes through the command
      (verify via a spy on `CommandManager.execute`).
- [ ] Icon swap: `fa-feather` (expanded) ↔ `fa-code` (design mode). Title
      swap: "Switch to Visual Edit" ↔ "Switch to Code Editor".

## 4. Enter design mode

- [ ] With live preview closed: executing the toggle first opens LP (verify a
      single execution of `FILE_LIVE_FILE_PREVIEW`), then applies collapsed
      layout on its `.always()`.
- [ ] With live preview open: sidebar width is preserved, `.content` goes to
      `width: 0`, `#main-toolbar` gets `left: sidebarW + 30`, `width:
      innerWidth - sidebarW - 30` with `!important`, `right: auto`.
- [ ] `savedToolbarWidth` captures pre-collapse `#main-toolbar.outerWidth` for
      later restore (only when LP was already open).
- [ ] `$sidebar.data("maxsize")` is stored and replaced with `"1000%"` so
      `Resizer.updateResizeLimits` doesn't shrink the sidebar on subsequent
      window resizes.
- [ ] `#main-toolbar > .horz-resizer` gets `display: none` via CSS.
- [ ] `document.body` gets class `ccb-editor-collapsed`.
- [ ] `WorkspaceManager.isInDesignMode()` returns `true` and
      `EVENT_WORKSPACE_DESIGN_MODE_CHANGE` fires with `true`.

## 5. Exit design mode

- [ ] Before flipping the body class, `sidebar.style.width` is pinned to the
      currently rendered (max-width-capped) value so removing the cap
      doesn't cause the sidebar to snap back to the stale uncapped width.
- [ ] `Resizer.resyncSizer` runs after the pin so the handle follows.
- [ ] Normal exit restores `#main-toolbar` to `savedToolbarWidth` (LP had
      been open pre-collapse) or `innerWidth / 2.5` default (LP was opened by
      the toggle itself). Never closes LP.
- [ ] Exit clamps: sidebar + CCB + toolbar + 200 (min editor) ≤ window; if
      the pre-collapse toolbar width would overflow, trim the sidebar first
      and `data("resyncSizer")()` afterwards.
- [ ] `livePanel.minWidth + iconsBar` lower bound is honored when picking
      the restored toolbar width.
- [ ] `$sidebar.data("maxsize")` is restored to its saved percentage.
- [ ] `WorkspaceManager.isInDesignMode()` returns `false`, event fires with
      `false`.

## 6. Exit triggered by hiding live preview

- [ ] Clicking `#toolbar-go-live` while in design mode:
  - LP panel hides.
  - `_restoreExpandedLayout` is called with `skipToolbarRestore: true`.
  - `#main-toolbar` ends at the icon-bar-only width (WSM's
    `_hidePluginSidePanel` width), not the pre-collapse LP size.
  - `body.ccb-editor-collapsed` is removed.

## 7. Sidebar drag in design mode

- [ ] Dragging the sidebar resizer rightward grows the sidebar linearly
      (1:1 with mouse delta) up to the CSS max-width cap.
- [ ] CSS cap is `calc(100vw - 230px)`: on a 1500px viewport the rendered
      sidebar never exceeds ~1270px even if style.width is much larger.
- [ ] During a capped drag, `style.width` may exceed the render width (this
      is expected); no ResizeObserver warnings land in `console.error`.
- [ ] Dragging back left respects `data-minsize: 30` (no auto-collapse via
      drag — only via the sidebar-toggle button).
- [ ] During the drag, `panelResizeStart` / `panelResizeUpdate` /
      `panelResizeEnd` are re-fired on `#main-toolbar` so
      `lpedit-helper/resize-ruler-edit` activates the media-query ruler.

## 8. Window resize while in design mode

- [ ] After 20 synthetic `window.dispatchEvent(new Event("resize"))` bursts,
      sidebar width is unchanged (`"1000%"` short-circuits the Resizer
      shrink loop).
- [ ] `#main-toolbar` stays flush with the window's right edge; the
      `applyingCollapsedLayout` guard keeps our reassertion from recursing
      through `EVENT_WORKSPACE_UPDATE_LAYOUT`.
- [ ] With sidebar hidden, `main-toolbar` width tracks the full available
      width (no ~70–300px gap from WSM clamping).

## 9. Plugin toolbar resizer in design mode

- [ ] `#main-toolbar > .horz-resizer` has `display: none` while collapsed —
      user never sees / grabs it; sidebar resizer is the only splitter.
- [ ] Normal mode: main-toolbar resizer is visible and draggable as usual.

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

## 14. Theming / colors

- [ ] CCB background is `#222` regardless of theme (sanity check with a
      forced light-theme and dark-theme load).
- [ ] Icon color is `@project-panel-text-2`; hover transitions to
      `@project-panel-text-1` + `rgba(255,255,255,0.08)` overlay.
- [ ] File label has `cursor: pointer` and hover adds underline.

## 15. Accessibility / titles

- [ ] Each CCB button has a `title` attribute (collapse, sidebar toggle,
      undo, redo, save, search, back, forward).
- [ ] `ccbCollapseEditorBtn` title changes with state.
- [ ] `ccbSidebarToggleBtn` title changes with sidebar visibility.

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
