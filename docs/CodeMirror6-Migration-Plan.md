# CodeMirror 6 Editing Surface Migration

Status: CM6-only architecture implemented on
`codemirror-6-editor-surface`. The authoritative Phoenix Builder/Xvfb matrix
passes all five supported categories: 4,811/4,811. Clean development and
production releases, post-build runtime inspection, installed-extension
smokes, Chromium native smoke (11/11), Firefox native smoke (10/10), and the
Electron and Tauri source-runtime theme/editor smokes all pass.

## Required outcome

Phoenix must have one editing engine and one live text model: CodeMirror 6.
The migration is complete only when full editors, inline editors, secondary
editors, and document-owner editor instances all use `EditorView.state.doc`.

Compatibility with Phoenix's historical editor API is provided by Phoenix
code, not by retaining CodeMirror 5. `CodeMirrorCompat` is an API facade over
CM6 and `CodeMirror6Adapter`; it is not a second editor implementation.

## Non-negotiable zero-CM5 invariant

The finished tree and every generated distribution must satisfy all of these:

- no `codemirror` version 5 package in any dependency section;
- no CodeMirror 5 entry in a tracked project manifest or lockfile, including
  `package.json`, `package-lock.json`, and shipped subproject build inputs;
- no original CodeMirror 5 JavaScript, CSS, mode, addon, keymap, theme, or
  vendor-tree file;
- no generated `thirdparty/CodeMirror` vendor directory in source, test,
  cache, or release artifacts;
- no hidden or detached CodeMirror 5 document used for text storage,
  tokenization, history, selections, markers, or language services;
- no CM5 initialization fallback if CM6 loading or editor creation fails;
- no build step that downloads, copies, restores, or embeds CM5 runtime
  assets;
- no runtime branch that selects between CM5 and CM6;
- no extension shim that executes CM5 code.

Historical names such as `CodeMirror`, `_codeMirror`, `CodeMirror-*` CSS
classes, and old RequireJS module IDs may remain only as compatibility
identifiers backed entirely by CM6. In particular, `.CodeMirror-*` classes are
recreated on the CM6 DOM rooted at `.CodeMirror.phoenix-codemirror-6`; they are
not evidence of a CM5 runtime.

CM6-backed compatibility ports may retain historical attribution and
non-runtime license notices. They are not a CM5 engine, package, original
vendor asset, or runtime dependency.

## Runtime architecture

```text
Phoenix Editor / Document / extensions
                 |
                 | Phoenix and legacy-shaped editor contracts
                 v
       CodeMirror6Adapter + CodeMirrorCompat
                 |
                 | CM6 transactions, state, views, syntax, decorations
                 v
 thirdparty/CodeMirror6/codemirror6 (one AMD bundle)
```

### CM6 bundle

`build/codemirror6-entry.js` exports the required CM6, Lezer, language, search,
lint, autocomplete, command, and legacy-stream-mode APIs.

`build/build-codemirror6.mjs` creates one named AMD module:

`thirdparty/CodeMirror6/codemirror6`

The bundle task must:

- reject a CM5 `codemirror` dependency in tracked project manifests and npm
  lockfiles;
- remove a stale generated `src/thirdparty/CodeMirror` directory;
- emit one self-contained chunk with no external or dynamic imports;
- verify singleton CM6/Lezer packages resolve from one package root;
- reject duplicate package copies;
- regenerate the aggregate CM6 license notice.

The current bundle is 2792 KiB (2,859,015 bytes) and contains 30 runtime
packages. Its generated license notice contains the exact installed version
and license text for every bundled package. Production minification preserves
the `DONT_STRIP_MINIFY` notice that points to that aggregate license file.

`npm run build:codemirror6` regenerates the bundle, source map, and aggregate
license, but it does not regenerate `src/cacheManifest.json`. A normal Gulp
build must follow it before source-serving validation. Both release tasks
invoke the bundle task themselves.

Release validation unions tracked package metadata with on-disk source and
shipped build inputs, including an optional Phoenix Pro checkout. It also
checks installed package identities, generated vendor trees, direct
npm-package imports, HTML script and stylesheet loads, and high-confidence
CM5 implementation signatures. The reusable
`build/validate-codemirror5.js` gate runs after source and debug builds and
again after development, staging, and production release artifacts are
assembled. Intentional compatibility module IDs, DOM classes, attributed
CM6-backed compatibility ports, and their non-runtime license notices are not
treated as dependencies.
Untracked user-owned workspace files are outside the branch deliverable and
must not be modified merely to satisfy this audit.

### `CodeMirror6Adapter`

`Editor` always constructs `CodeMirror6Adapter`, which owns the CM6
`EditorView`. The adapter translates between CM6 state and the established
Phoenix contracts for:

- document text, line and position APIs, and line-ending behavior;
- transactions, change origins, operation batching, and event ordering;
- single, multiple, reversed, and primary selections;
- undo/redo, selection history, clean generations, and history restore points;
- markers, bookmarks, collapsed/replaced ranges, and mapped marker history;
- line handles, line classes, line widgets, gutters, and folding;
- options, keymaps, commands, focus, clipboard, drag/drop, and overwrite mode;
- coordinates, viewport, scrolling, sizing, and refresh behavior;
- modes, token boundaries, parser state, mixed languages, helpers, and
  overlays;
- full, inline, range-limited, secondary, and detached document-owner
  editors.

CM6 state is authoritative. Compatibility metadata may describe legacy
behavior, but it must never mirror text into a second editor model.
`CodeMirrorCompat.version = "5.65.16"` is extension-contract metadata, not the
loaded engine version. The facade also reports `backend: "codemirror6"` and
`isCodeMirror6: true`.

### `CodeMirrorCompat`

`CodeMirrorCompat` supplies the callable constructor and static API shape used
by Phoenix and existing extensions. It lazily resolves `CodeMirror6Adapter` to
avoid a RequireJS initialization cycle; the lazy lookup must not use a literal
static adapter dependency that RequireJS can pre-scan.

The facade owns legacy-shaped registries and utilities such as:

- `commands`, `keyMap`, options, extensions, and document extensions;
- `defineMode`, `defineMIME`, `getMode`, `resolveMode`, and mode state helpers;
- `StringStream`, `Pos`, position utilities, and event helpers;
- helper registration and lookup;
- multiplex and simple-mode compatibility;
- tag matching, fold helpers, and built-in stream-mode metadata.

Every implementation delegates to CM6 primitives, Phoenix compatibility code,
or CM6 legacy stream modes. No facade API may import or execute CM5.

## Extension import compatibility

Existing extensions may continue to obtain the compatibility facade through:

- `require("editor/CodeMirrorCompat")`;
- `brackets.getModule("editor/CodeMirrorCompat")`;
- the mapped historical core IDs
  `thirdparty/CodeMirror/lib/codemirror`,
  `thirdparty/CodeMirror2/lib/codemirror`;
- the historical root IDs `thirdparty/CodeMirror` and
  `thirdparty/CodeMirror2`.

The production and test RequireJS configurations map the two historical
`lib/codemirror` IDs to `editor/CodeMirrorCompat`.
`CodeMirrorLegacyModuleLoader` intercepts the historical root, addon, mode,
keymap, theme, and text-resource IDs before RequireJS attempts a network load.
These are virtual compatibility modules only; there is no file at an old
vendor path.

Extensions may use the supported legacy-shaped instance/static API exposed by
the facade and may continue requesting supported historical addon, mode,
keymap, theme, CSS, and text-resource IDs. `CodeMirrorLegacyModuleLoader`
resolves them to CM6-backed virtual modules before any network load; no old
vendor file or CM5 code executes.

The audited compatibility surface covers 62/62 addon and keymap JavaScript
paths, 121/121 mode paths, and all legacy CSS and theme paths. Theme imports
are virtual no-ops because Phoenix applies themes through CM6. Unsupported
module and resource IDs fail explicitly instead of falling back to CM5.
Phoenix Pro's retained historical module IDs have been runtime-verified to
resolve to the compatibility facade.

The downloaded extension-registry cache may contain metadata describing a
third-party extension's CM5 development dependency. That catalog text is not
installed, executed, or bundled by Phoenix and is not a Phoenix CM5
dependency.

Direct access to `thirdparty/CodeMirror6/codemirror6` is reserved for tightly
scoped Phoenix integrations that need native CM6 types, such as syntax-tree
folding. General extensions should use the Phoenix `Editor` API first and
`CodeMirrorCompat` only where the historical extension contract requires it.

## Compatibility contracts

### Changes and documents

Phoenix change records retain this shape:

```js
{
    from: { line, ch },
    to: { line, ch },
    text: [line, ...],
    removed: [line, ...],
    origin: "..."
}
```

The adapter must preserve change origins, before-change filtering, operation
batching, master/secondary synchronization, dirty-state transitions, and
synchronous notification order. A secondary editor must not echo a mapped
change back into the document.

### History

- `getHistory()`, `setHistory()`, `historySize()`, `clearHistory()`,
  `undo()`, `redo()`, `undoSelection()`, and `redoSelection()` retain their
  observable CM5-era contract.
- Every recorded text change has the surrounding selection history needed by
  Phoenix history restore points, including edits whose final selection
  offsets are unchanged.
- `changeGeneration(true)` closes the current merge group.
- Undoing to the saved generation makes the document clean; redoing away from
  it makes the document dirty.
- Marker locations and visibility round-trip with undo and redo.

### Selections

Phoenix selections remain sorted, non-overlapping ranges:

```js
{
    start: { line, ch },
    end: { line, ch },
    reversed: false,
    primary: true
}
```

Cursor association, primary-range identity, multi-range replacement, movement
units, and selection mapping through edits must match the existing Editor API.

### Markers, gutters, and layout

Marker and bookmark handles retain `clear()`, `find()`, `changed()`, `on()`,
and `off()`. The CM6 implementation must also preserve collapsed/replacement
ranges, line classes, widgets, registered gutters, original marker-node
identity, gutter mouse arguments, coordinate conversion, viewport events, and
programmatic scrolling.

### Languages and tokens

Registered Phoenix MIME and mode names resolve through `CodeMirrorCompat`.
Native CM6 language packages are used where available; CM6 legacy stream modes
cover the remaining registered languages. Token boundaries, token class names,
parser-state copies, inner modes, comments, indentation, folding, and mixed
HTML/CSS/JavaScript behavior remain extension-compatible.

## Validation matrix

Only completed, repeatable results are marked verified. A partial or currently
failing suite is not recorded with a stale pass count.

| Area | Required validation | Current status |
| --- | --- | --- |
| CM6 contract | `Editor Surface Conformance` | Verified: 74/74 |
| Compatibility facade | `CodeMirrorCompatParity` and legacy-addon suites | Verified: 27/27 and 10/10 |
| Legacy language/keymap compatibility | Twig and Vim suites | Verified: 6/6 and 5/5 |
| CSS language compatibility | `CSS Parsing` | Verified: 53/53 |
| Core editor API | Full `Editor` suite | Verified: 246/246 |
| Unit category | Complete supported unit category | Verified on final tree: 2905/2905 |
| Integration category | Complete supported integration category | Verified on final tree: 833/833 |
| Legacy integration category | Complete supported legacy category | Verified on final tree: 510/510 |
| Inline editors | `LegacyInteg:InlineEditorProviders` | Verified: 55/55 after line-widget focus restoration |
| Extension loading | Current and legacy loader suites | Verified: 16/16 and 2/2 |
| Languages | Registered language resolution in the live runtime | Verified: 51/51 |
| Document, command, search, folding, hint, and lifecycle coverage | Owning unit/integration suites | Covered by the complete passing category runs |
| Integrated extensions | Historical import virtualization and representative installed extensions | Verified across the complete import surface, Code By Code, and brackets-compare; no CM5 resource loaded |
| Live preview | Full `livepreview` category | Verified on final tree: 257/257 |
| Main view | Full `mainview` category | Verified on final tree: 306/306 |
| Complete Phoenix Builder matrix | All five supported categories under Xvfb | Verified: 4811/4811 |
| Input behavior | Keyboard maps, clipboard, drag/drop, IME/composition, overwrite | Verified by Chromium 11/11 and Firefox 10/10 native smokes; Firefox omits Chromium-only CDP IME injection |
| Accessibility | Focus, screen-reader semantics, forced colors, and keyboard-only operation | Verified by native Chromium and Firefox smokes |
| Performance | 50,000-line render, scroll, and search smoke | Verified in Chromium and Firefox |
| Browser targets | Chromium, Firefox, Electron, and Tauri source-runtime paths | Verified under Xvfb: Chromium 11/11, Firefox 10/10, Electron theme/runtime, and Tauri theme/editor runtime |
| Runtime architecture | Phoenix Builder source-runtime inspection | Verified in Electron and Tauri: CM6 adapter, CM6 DOM/state, compatibility imports, and no loaded CM5 resource |
| Runtime errors | Phoenix Builder browser and PhNode error-log audit | Verified; no CM5 resource or critical CM6 adapter signature in the final matrix/native smokes |
| Static quality | Syntax, ESLint, Less compilation, Builder MCP tests, validators, and `git diff --cached --check` | Verified |
| CM6 bundle | `npm run build:codemirror6` | Verified: 2792 KiB, 30 runtime packages |
| Dependency removal | Tracked manifests/lockfiles, installed packages, generated bundle, and vendor trees | Verified; `npm ls codemirror --all` is empty |
| Release output | Clean build; no CM5 engine, package, original vendor tree, or runtime asset in `dist` or `dist-test` | Verified: dev 104.16/107 MB; prod 75.36/80 MB |

## Build and distribution state

Fresh development and production artifacts were built from the current
migration tree. `dist` and `dist-test` each contain all 25 required CM6
compatibility artifacts and all three required CodeMirror license notices.
Source and artifact license hashes match.

`release:dev` and `release:prod` both:

1. clean `dist` and `dist-test`;
2. regenerate the CM6 AMD bundle and aggregate license;
3. copy or minify the current source modules into `dist`;
4. regenerate the appropriate cache manifest;
5. refresh `test/spec/test_folders.zip`;
6. copy the rebuilt distribution and tests into `dist-test`;
7. enforce the configured distribution-size limits.

Production removes the CM6 source map while retaining the minified AMD bundle
and aggregate license. Development retains the source map. The current
on-disk artifacts are from the production build, correctly omit the CM6 source
map, and pass size validation at 75.36 MB against the 80 MB limit. The
development build passed earlier at 104.16 MB against the 107 MB limit.

An isolated Tauri instance also loaded the current Phoenix source tree under
Xvfb through Phoenix Builder. The runtime reported `codemirror6` for the
editor and compatibility facade; historical core, addon, keymap, mode, and
theme imports resolved virtually; programmatic editor insertion using the
`+input` origin, selection, undo/redo, active-line styling, and Monokai styling
passed; the Phoenix document matched `EditorView.state.doc`; and no CM5 vendor
resource or CM5/adapter error was observed. The smoke used an existing Tauri
executable, so it validates the current web/editor source inside the Tauri
runtime rather than a newly compiled desktop shell.

Do not use `npm run clean` as a release prerequisite: it also removes
`node_modules`. For focused verification, prefer `_buildonly` and
`_buildonlyDebug` over the broader `npm run build`, which also regenerates the
`src-node` package lock and stages generated API documentation.

## Remaining work

No CM6 migration blocker remains in the source, extension, browser, Electron,
Tauri source-runtime, test, or release gates covered by this branch. A fresh
Tauri shell rebuild was not possible on this Ubuntu host because the Tauri v1
desktop project requires WebKitGTK 4.0 and librsvg development packages that
are unavailable here. That native-shell packaging build remains part of the
normal desktop release matrix. The migration commit is local only and remains
unpushed.

## Phoenix Builder runtime gate

Use Phoenix Builder against a freshly reloaded instance after each compatible
change:

1. confirm the editor reports the CM6 engine and contains a CM6 editor DOM;
2. confirm no CM5 script, stylesheet, constructor, document, or vendor path is
   loaded;
3. exercise typing, paste, delete, selections, undo/redo, save, split view,
   language changes, and external document refresh;
4. exercise markers, gutters, folding, search, hints, snippets, inline editors,
   themes, and representative installed extensions;
5. inspect browser and PhNode logs for new errors or warnings;
6. run the relevant focused suite, then its owning full suite;
7. reload again before the next suite when adapter or facade code changed.

Use only supported Phoenix Builder categories: `unit`, `integration`,
`LegacyInteg`, `livepreview`, and `mainview`. Do not use the unsupported
`all`, `performance`, `extension`, or `individualrun` categories; validate
individual behaviors through a supported suite filter and direct runtime
smoke checks.

## Release exit criteria

The migration is ready to merge only when:

1. all required compatibility suites and manual extension scenarios pass;
2. `npm run build:codemirror6` and a clean release build pass;
3. a clean dependency install contains no CM5 `codemirror` package;
4. tracked manifests, lockfiles, shipped inputs, generated source, `dist`, and
   `dist-test` contain no CM5 engine, package, original vendor-tree file, or
   runtime asset; attributed CM6-backed compatibility ports and non-runtime
   notices are permitted;
5. historical core module IDs resolve only to `CodeMirrorCompat`;
6. browser/desktop smoke tests show no fallback, duplicate editor model, or
   new console error;
7. migration documentation and extension guidance match the shipped API.

Untracked user files that predate the branch are not release inputs and are
not part of this migration's dependency audit. They must remain untouched.

## Failure behavior

There is no CM5 rollback path. If the CM6 bundle, adapter, facade, language
support, or extension compatibility layer fails, Phoenix must report and fix
that CM6 failure. It must never silently load, construct, download, or restore
CodeMirror 5.

## Primary references

- <https://codemirror.net/docs/migration/>
- <https://codemirror.net/docs/guide/>
- <https://codemirror.net/examples/bundle/>
- <https://codemirror.net/docs/ref/>
