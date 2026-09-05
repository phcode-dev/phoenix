# CodeMirror 6 Migration Review Handoff

Date: August 29, 2026

Branch: `codemirror-6-editor-surface`

Base: `5fee600cc` (`origin/main` when this work began)

## Purpose

This document is the review guide for the Phoenix editing-surface migration
from CodeMirror 5 (CM5) to CodeMirror 6 (CM6), together with the Phoenix
Builder MCP improvements used to build and verify the migration from Codex.

The migration has two simultaneous requirements:

1. Phoenix must use CM6 as its only editor engine and
   `EditorView.state.doc` as its only live text model.
2. Existing Phoenix modules and extensions must retain the historical
   CodeMirror-shaped API and import contracts they depend on, without loading
   or executing CM5.

The implementation meets those requirements by combining a native CM6 editor
adapter with a Phoenix-owned compatibility facade. Historical names remain
where they are part of public extension contracts, but no CM5 runtime,
package, original vendor tree, or fallback editor remains.

## Executive summary

- `Editor` now always constructs `CodeMirror6Adapter`.
- The adapter owns one CM6 `EditorView`; its `state.doc` is authoritative.
- `CodeMirrorCompat` recreates the historical static and instance API shape
  used by Phoenix and extensions.
- Historical `thirdparty/CodeMirror` and `thirdparty/CodeMirror2` imports are
  intercepted and resolved to CM6-backed virtual modules before RequireJS
  performs a network request.
- Legacy addons, keymaps, modes, theme imports, text-plugin imports, and
  filesystem probes have compatibility implementations.
- Unsupported historical imports fail explicitly; they never fall back to
  CM5.
- The old `codemirror` dependency and original CM5 vendor/license artifact
  were removed.
- Build validation rejects any reintroduced CM5 dependency, runtime asset, or
  original vendor tree.
- Integrated extensions and live-preview consumers were updated for CM6
  lifecycle, transaction, selection, token, gutter, and DOM behavior.
- The complete supported Phoenix Builder/Xvfb matrix passes: 4,811/4,811.
- Native Chromium, Firefox, Electron, and Tauri source-runtime smokes pass.

## Runtime architecture

```text
Phoenix Editor API and integrated/third-party extensions
                         |
          +--------------+----------------+
          |                               |
          v                               v
  Phoenix Editor methods          CodeMirrorCompat facade
          |                    historical module/API surface
          +--------------+----------------+
                         |
                         v
                 CodeMirror6Adapter
                         |
                         v
               CM6 EditorView.state.doc
                  only live text model
```

There is no CM5 fallback branch. A CM6 initialization failure must be exposed
and fixed rather than silently constructing an old editor.

## Main implementation areas

### Dependency and bundle pipeline

Key files:

- `package.json`
- `package-lock.json`
- `build/codemirror6-entry.js`
- `build/codemirror6-legacy-modes.js`
- `build/build-codemirror6.mjs`
- `gulpfile.js/index.js`
- `gulpfile.js/thirdparty-lib-copy.js`
- `gulpfile.js/validate-build.js`

Changes:

- Removed the `codemirror` version 5 package.
- Added the required `@codemirror/*`, `@lezer/*`, and Vim compatibility
  dependencies.
- Added Rollup and the narrowly scoped Babel transform required to bundle the
  Vim dependency.
- Added `npm run build:codemirror6`.
- Built one named AMD module:
  `thirdparty/CodeMirror6/codemirror6`.
- Enforced one bundled copy of CM6/Lezer singleton packages.
- Rejected external and dynamic imports from the generated bundle.
- Removed stale generated `src/thirdparty/CodeMirror` output during builds.
- Integrated CM6 generation and zero-CM5 validation into source, debug, and
  release builds.
- Generated an aggregate CM6 license notice from the exact bundled package
  versions.

The verified bundle is 2,859,015 bytes (2,792 KiB) and includes 30 runtime
packages.

### CM6 editor adapter

Primary file:

- `src/editor/CodeMirror6Adapter.js`

The adapter translates the established Phoenix editor contracts onto CM6. It
covers:

- document text, positions, ranges, line endings, and linked documents;
- transactions, change origins, before-change filtering, and operation
  batching;
- single, multiple, reversed, and primary selections;
- text history, selection history, clean generations, and named history
  restore points;
- marks, bookmarks, collapsed/replaced ranges, and marker history;
- line handles, line classes, line widgets, gutters, and folding;
- input, clipboard, drag/drop, IME/composition, overwrite mode, and keymaps;
- coordinates, scrolling, sizing, viewport reporting, and refresh behavior;
- modes, tokens, parser state, nested languages, helpers, and overlays;
- full editors, inline editors, secondary editors, detached editors, and
  document-owner editors.

Compatibility state in the adapter is metadata only. Text is not mirrored into
a second document implementation.

### Phoenix editor integration

Key files:

- `src/editor/Editor.js`
- `src/document/Document.js`
- `src/editor/EditorManager.js`
- `src/editor/InlineTextEditor.js`
- `src/editor/EditorCommandHandlers.js`
- `src/editor/EditorHelper/*`

Important changes:

- `Editor` constructs `CodeMirror6Adapter` unconditionally.
- `Editor._codeMirrorView` exposes the underlying CM6 view for tightly scoped
  internal integration.
- `Editor.getEditorEngine()` reports `codemirror6`.
- Clean-state and history operations are exposed through the Phoenix
  `Editor` API.
- Selection replacement accepts and preserves change origins.
- Editor destruction explicitly disposes the CM6 view.
- Scrolling, geometry, line-space, gutter, and focus handling use the adapter
  surface rather than CM5 DOM assumptions.

### Compatibility facade

Primary file:

- `src/editor/CodeMirrorCompat.js`

The facade preserves the CodeMirror-shaped contracts used by existing Phoenix
code and extensions, including:

- callable editor construction for detached editors;
- `commands`, `keyMap`, options, extensions, and document extensions;
- mode/MIME registration and resolution;
- `StringStream`, `Pos`, position helpers, and event helpers;
- helper registration and lookup;
- overlays, multiplex modes, simple modes, tags, brackets, and folding;
- static utilities and legacy-shaped instance detection.

The facade intentionally reports:

```js
CodeMirrorCompat.backend === "codemirror6";
CodeMirrorCompat.isCodeMirror6 === true;
CodeMirrorCompat.version === "5.65.16";
```

The version string is compatibility metadata for extensions that gate behavior
on the historical API version. It does not identify the runtime engine.

### Historical module and filesystem virtualization

Key files:

- `src/editor/CodeMirrorLegacyModuleLoader.js`
- `src/editor/CodeMirrorLegacyText.js`
- `src/editor/CodeMirrorLegacyFileSystem.js`
- `src/utils/ExtensionLoader.js`
- `src/utils/Global.js`
- `src/phoenix/virtual-server-loader.js`
- `src/main.js`
- `src/brackets.js`

Supported historical IDs include:

- `thirdparty/CodeMirror`
- `thirdparty/CodeMirror2`
- both historical `lib/codemirror` IDs;
- supported addon and keymap paths;
- bundled mode paths and `mode/meta`;
- stock theme paths;
- CSS and `text!` resource paths used by extensions.

The loader defines a virtual AMD module before RequireJS attempts a network
load. The text and filesystem layers similarly return compatibility content
and metadata without creating an old vendor tree.

Coverage currently includes:

- 62/62 historical addon and keymap JavaScript paths;
- 121/121 historical mode paths;
- 65 stock theme names and the supported legacy CSS paths.

Unsupported paths produce a
`PHOENIX_UNSUPPORTED_CODEMIRROR5_MODULE` error instead of loading CM5.

### Addons, modes, and keymaps

Key files:

- `src/editor/CodeMirrorLegacyAddons.js`
- `src/editor/CodeMirrorLegacyExtendedAddons.js`
- `src/editor/CodeMirrorLegacyModeMeta.js`
- `src/editor/CodeMirrorLegacyModesCompat.js`
- `src/editor/CodeMirrorLegacyRSTSlimCompat.js`
- `src/editor/CodeMirrorSublimeCompat.js`
- `src/editor/CodeMirrorTwigCompat.js`
- `src/editor/CodeMirrorVimCompat.js`

These files provide CM6-backed behavior for the legacy extension surface.
Major areas include:

- comment, bracket, tag, overlay, multiplex, and simple-mode helpers;
- search, hints, lint, dialogs, panels, rulers, and scroll annotations;
- folding, fold gutters, hard wrapping, trailing-space handling, and merge
  helpers;
- Sublime commands/keymaps;
- Replit Vim integration adapted to the Phoenix CM6 surface;
- legacy stream modes, metadata lookup, Twig, RST, and Slim support.

Some compatibility algorithms retain CM5 attribution because their behavior
was ported. The corresponding license notices are shipped, but the CM5 engine
and original addon/mode files are not.

### Folding, languages, and tokens

Key files:

- `src/extensions/default/CodeFolding/*`
- `src/language/CSSUtils.js`
- `src/language/HTMLUtils.js`
- `src/language/JSUtils.js`
- `src/language/LanguageManager.js`
- `src/utils/TokenUtils.js`

Changes include:

- CM6 syntax-tree folding where native language data is available;
- compatibility fold helpers and gutters for historical extension APIs;
- stream-mode fallback for registered languages not covered by native CM6
  language packages;
- parser-state compatibility for embedded CSS/HTML/JavaScript;
- mode resolution and metadata parity;
- token boundary and token-class compatibility used by hints and language
  services.

### Integrated extension updates

Updated consumers include:

- CSS color preview;
- display shortcuts;
- HTML tag sync editing;
- navigation and history;
- indentation guides;
- Quick View;
- Handlebars support;
- search and scrollbar markers;
- Markdown live preview.

These changes replace assumptions about CM5 internals with Phoenix Editor APIs
or explicit CM6-compatible adapter behavior.

### Live preview and Markdown editor

Key files:

- `src/LiveDevelopment/BrowserScripts/DocumentObserver.js`
- `src/LiveDevelopment/MultiBrowserImpl/documents/LiveDocument.js`
- `src/LiveDevelopment/MultiBrowserImpl/documents/LiveCSSDocument.js`
- `src/LiveDevelopment/MultiBrowserImpl/documents/LiveHTMLDocument.js`
- `src/extensionsIntegrated/Phoenix-live-preview/MarkdownSync.js`
- `src/extensionsIntegrated/Phoenix-live-preview/main.js`
- `src-mdviewer/src/bridge.js`
- `src-mdviewer/src/components/editor.js`
- `src-mdviewer/src/components/link-popover.js`

The migration hardened editor lifecycle checks so live-preview objects stop
using an editor as soon as its CM6 view is destroyed. It also preserves
preview scroll state, defers cursor-scroll synchronization during Markdown
file switches, prevents stale debounced edits from being replayed, and makes
Markdown popover/table behavior deterministic in the integration harness.

### Styling and themes

Key files:

- `src/styles/brackets_codemirror6.less`
- `src/styles/brackets_codemirror6_legacy_themes.less`
- `src/styles/brackets_codemirror_override.less`
- `src/styles/brackets_shared.less`
- `src/styles/brackets_theme_default.less`
- `src/extensions/default/DarkTheme/main.less`

The CM6 DOM receives the compatibility classes required by Phoenix and
extensions, including selected text, cursors, active lines, gutters, widgets,
dialogs, hints, lint markers, and fold markers. Stock historical theme names
are recreated on the CM6 surface. For example, the Monokai compatibility
theme was runtime-verified at background `rgb(39, 40, 34)` and keyword color
`rgb(249, 38, 114)`.

## Zero-CM5 enforcement

Key files:

- `build/validate-codemirror5.js`
- `build/test/validate-codemirror5.test.js`
- `gulpfile.js/validate-build.js`

The validator checks:

- dependency sections in tracked package manifests;
- npm lockfiles and installed package identities;
- source, build scripts, and optional shipped subprojects;
- generated `src`, `dist`, and `dist-test` artifacts;
- HTML script and stylesheet references;
- old vendor directories and license paths;
- high-confidence CM5 implementation signatures;
- required CM6 compatibility modules and license notices.

Intentional historical import strings, DOM class names, compatibility metadata,
ported compatibility implementations, and their attribution notices are
allowlisted narrowly. A new CM5 package, original vendor asset, fallback path,
or hidden CM5 document fails validation.

## Phoenix Builder MCP work

Key files:

- `phoenix-builder-mcp/index.js`
- `phoenix-builder-mcp/config.js`
- `phoenix-builder-mcp/build-manager.js`
- `phoenix-builder-mcp/process-manager.js`
- `phoenix-builder-mcp/ws-control-server.js`
- `phoenix-builder-mcp/mcp-tools.js`
- `phoenix-builder-mcp/test/*`
- `phoenix-builder-mcp/README.md`

Changes:

- documented and verified Codex stdio registration;
- made the WebSocket port configurable and validated its range;
- bound the control socket to `127.0.0.1`;
- prevented a second server from killing or replacing an existing owner;
- added allowlisted asynchronous Phoenix build tools and build-log/status
  inspection;
- restricted test categories to the supported matrix;
- improved process-tree termination and startup failure reporting;
- rejected pending runtime requests immediately when their Phoenix socket
  disconnects;
- made shutdown await process, build, and WebSocket cleanup;
- added isolated tests for configuration, builds, process management, and
  WebSocket behavior.

The Codex registration points at the local
`phoenix-builder-mcp/index.js` using absolute paths and a dedicated WebSocket
port. No repository-local secret or machine credential is required.

## Validation record

### Complete Phoenix test matrix

Executed through Phoenix Builder under Xvfb:

| Category | Result |
| --- | ---: |
| `unit` | 2,905/2,905 |
| `integration` | 833/833 |
| `LegacyInteg` | 510/510 |
| `livepreview` | 257/257 |
| `mainview` | 306/306 |
| **Total** | **4,811/4,811** |

Focused confirmation also includes:

- Editor Surface Conformance: 74/74;
- core Editor suite: 246/246;
- CSS Parsing: 53/53;
- inline editor providers: 55/55;
- CodeMirror compatibility parity suite;
- legacy addon, extended-addon, mode, Twig, and Vim suites;
- extension-loader compatibility and filesystem probes;
- final Code Folding regression rerun: 52/52.

### Browser and desktop runtime checks

| Runtime | Result |
| --- | --- |
| Chromium | 11/11 native smoke checks |
| Firefox | 10/10 native smoke checks |
| Electron | Five theme/runtime checks passed |
| Tauri/WebKitGTK | CM6 source-runtime smoke passed under Xvfb |

The Tauri smoke used Phoenix Builder against an isolated profile and the
current Phoenix source served at `http://localhost:8000/src/`. It verified:

- `Editor.getEditorEngine() === "codemirror6"`;
- compatibility facade `backend === "codemirror6"`;
- a live CM6 `EditorView` and `.cm-editor` DOM;
- editor input/history semantics through `replaceSelection(..., "+input")`;
- undo, redo, selection state, and compatibility selection classes;
- active-line and active-gutter compatibility classes;
- Monokai wrapper, background, and token styling;
- equality between the Phoenix document and `EditorView.state.doc`;
- historical core/addon/keymap/mode/theme imports resolving to the facade;
- no requested `/thirdparty/CodeMirror/` or
  `/thirdparty/CodeMirror2/` resource;
- no CM5 or CM6-adapter error signature in the browser log.

The disposable untitled document was force-closed, its theme/options were
restored, test globals were removed, and the isolated Tauri, source server,
Builder bridge, and ports were stopped.

### Build and static checks

- `npm run build:codemirror6`: passed.
- `npm run test:codemirror-validation`: 15/15.
- `npm run validate:codemirror`: passed.
- `npm ls codemirror --all`: prints `(empty)` and exits with npm status 1.
- Phoenix Builder MCP tests: 16/16.
- Root ESLint and MCP ESLint error checks: passed.
- JavaScript syntax and Less compilation checks: passed.
- Development release: 104.16 MB against a 107 MB limit.
- Production release: 75.36 MB against an 80 MB limit.
- `git diff --cached --check`: passed for the reviewed commit scope.

Useful temporary artifacts from the final verification session:

- full Xvfb matrix:
  `/tmp/phoenix-cm6-xvfb-authoritative.yXBshh`;
- focused Editor Surface Conformance rerun:
  `/tmp/phoenix-cm6-editor-conformance-20260829-codex/editor-surface-conformance.json`;
- Chromium:
  `/tmp/phoenix-cm6-native-chromium-authoritative.RXzymP/result.json`;
- Firefox:
  `/tmp/phoenix-cm6-native-firefox-xvfb-final.Mdq4dO/result.json`;
- Electron:
  `/tmp/phoenix-cm6-electron-theme-xvfb-final2.TAk8YF/result.json`;
- focused folding rerun:
  `/tmp/phoenix-cm6-xvfb-code-folding-final.i1Em3k/code-folding.json`;
- Tauri logs:
  `/tmp/phoenix-cm6-tauri-xvfb-final.yegYOd`.

The `/tmp` paths are evidence from this workstation and are not part of the
commit. The browser and desktop smoke harnesses were purpose-built in `/tmp`,
so those results are one-off verification evidence rather than committed test
programs and will not be reproducible on another machine unless the harnesses
are preserved separately.

## Suggested review order

1. Read `docs/CodeMirror6-Migration-Plan.md` for the required invariants.
2. Review `build/validate-codemirror5.js` to understand what the build forbids.
3. Review `build/codemirror6-entry.js` and `build/build-codemirror6.mjs` for
   bundle boundaries and singleton guarantees.
4. Review `src/editor/CodeMirror6Adapter.js`, concentrating on transactions,
   history, selections, markers, linked documents, destruction, and DOM
   compatibility.
5. Review `src/editor/CodeMirrorCompat.js` and the legacy loader/text/filesystem
   modules for extension-facing contracts.
6. Review addon, keymap, and mode compatibility modules with their focused
   tests.
7. Review integrated extension changes for accidental direct CM6 or CM5
   coupling.
8. Review live-preview and Markdown lifecycle changes.
9. Run the validators and focused tests before repeating the complete
   Phoenix Builder matrix.

## Reviewer risk checklist

- Confirm every editor creation path reaches `CodeMirror6Adapter`.
- Confirm `EditorView.state.doc` is the only mutable text source.
- Check transaction-to-change conversion and event ordering.
- Check undo grouping, clean generations, marker restoration, and selection
  history.
- Check linked-document rebasing and secondary editor synchronization.
- Check selection ordering, reversal, primary range identity, and origin
  propagation.
- Check widget, gutter, fold, and marker cleanup on editor destruction.
- Check mixed-language token state and embedded CSS/JavaScript behavior.
- Check old module IDs resolve without network requests.
- Check unsupported old module IDs fail closed.
- Check extension filesystem probes cannot mutate virtual compatibility files.
- Check theme classes and legacy DOM selectors are attached only to CM6 DOM.
- Check release builds cannot copy a stale `thirdparty/CodeMirror` tree.
- Check retained CM5-derived code carries the required attribution notice.
- Check browser and desktop logs for new adapter, lifecycle, or resource-load
  errors.

## Reproduction commands

From the repository root:

```bash
npm run build:codemirror6
npm run test:codemirror-validation
npm run validate:codemirror
# An empty tree is success even though npm exits with status 1.
npm ls codemirror --all
npm run _buildonly
npm run _buildonlyDebug
npm run release:dev
npm run release:prod
npm run validate:dist-size
git diff --cached --check
```

For the Builder server:

```bash
npm --prefix phoenix-builder-mcp test
```

Build the source, start an isolated Xvfb display and browser test runner, set
the runner's Builder URL to the dedicated MCP WebSocket port, and then use this
Phoenix Builder sequence for each category:

```text
get_phoenix_status()
run_tests(category="unit", instance="<runner>")
get_phoenix_status()
get_test_results(instance="<runner name after reload>")

run_tests(category="integration", instance="<runner>")
run_tests(category="LegacyInteg", instance="<runner>")
run_tests(category="livepreview", instance="<runner>")
run_tests(category="mainview", instance="<runner>")
```

Poll `get_test_results` until `completed` is true after each run. Re-read
`get_phoenix_status` after every `run_tests` call because a reload can change
the runner instance name. Run one category at a time and give integration
windows OS focus when a suite requires it.

Do not use the unsupported `all`, `performance`, `extension`, or
`individualrun` categories.

## Intentional legacy identifiers

Reviewers will still find the following strings:

- `CodeMirror`, `_codeMirror`, and `CodeMirror-*`;
- `thirdparty/CodeMirror` and `thirdparty/CodeMirror2`;
- facade version `5.65.16`;
- CM5 attribution and derived-code license notices.

These are compatibility identifiers or legal notices. They are acceptable only
when backed by CM6/Phoenix code. The validator distinguishes these cases from a
real CM5 package, engine, asset, or fallback.

## Known limitations and environmental observations

- A fresh Tauri 5.2.5 shell build could not be produced on this Ubuntu host
  because the Tauri v1 project requires WebKitGTK 4.0 and librsvg development
  packages that are unavailable here.
- The Tauri source-runtime smoke therefore used an existing 5.0.5 executable
  while loading the current Phoenix source. This validates the migrated web
  editor in Tauri/WebKitGTK, but not a newly compiled desktop shell.
- Native screenshot capture did not return image data from that existing Tauri
  binary. Runtime assertions were performed through Phoenix Builder
  `exec_js`.
- The isolated Tauri profile inherited a `C.UTF-8` locale and emitted an
  unrelated `invalid language tag: C` message from unchanged filename-sorting
  code. It did not affect the editor smoke and was not a CM5/CM6-adapter
  failure.

## Commit scope and intentionally excluded worktree files

The migration commit includes the CM6 editor, compatibility modules, build and
validation pipeline, affected Phoenix integrations, tests, generated
CM6-related API documentation, license notices, and Phoenix Builder MCP
improvements.

The following pre-existing or unrelated local files are intentionally excluded:

- `.aider.chat.history.md`
- `.aider.input.history`
- `.aider.tags.cache.v3/`
- `.aider.tags.cache.v4/`
- `semantic_chunks.json`
- `structure.txt`
- `tree.txt`
- `src-node/jsconsole-node.js`
- `src/extensionsIntegrated/JSConsole/`
- `src/styles/Extn-JSConsole.less`
- `src/extensions/default/TypeScriptSupport/requirejs-config.json`
- incidental generated changes in `src-node/package-lock.json`
- unrelated generated `docs/API-Reference/command/Commands.md` drift

No commit is intended to include generated `dist`, `dist-test`,
`src/cacheManifest.json`, CM6 bundle output ignored by the repository, MCP PID
files, browser profiles, or `/tmp` verification artifacts.

## Completion criteria

The migration is ready for review when:

- all relevant source and test files are committed;
- all excluded files remain outside the commit;
- the staged commit passes `git diff --cached --check`;
- the zero-CM5 validator and Builder MCP tests pass;
- the commit contains no CM5 dependency or original vendor asset;
- no push is performed unless separately requested.
