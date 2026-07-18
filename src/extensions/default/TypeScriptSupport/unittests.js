/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 *
 * This program is free software: you can redistribute it and/or modify it
 * under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT
 * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
 * FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License
 * for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see https://opensource.org/licenses/AGPL-3.0.
 *
 */

/*global describe, it, expect, beforeAll, afterAll, afterEach, awaitsFor, awaitsForDone, path, jsPromise */

define(function (require, exports, module) {

    const SpecRunnerUtils = brackets.getModule("spec/SpecRunnerUtils");

    const IMPLICIT_ANY_MESSAGE = "implicitly has an 'any' type";

    describe("integration:TypeScript LSP", function () {
        const testRootSpec = "/spec/TypeScriptSupport-test-files/";
        let testFolder = SpecRunnerUtils.getTestPath(testRootSpec),
            testWindow,
            $,
            EditorManager,
            CommandManager,
            Commands,
            CodeInspection,
            QuickViewManager;

        // The LSP runs only in the desktop app (it spawns the vtsls Node process), so these tests
        // are meaningless in the browser build - register a single skipped placeholder and bail.
        if (!Phoenix.isNativeApp) {
            it("is desktop-only - skipped in the browser build", function () {
                expect(Phoenix.isNativeApp).toBeFalsy();
            });
            return;
        }

        beforeAll(async function () {
            testWindow = await SpecRunnerUtils.createTestWindowAndRun();
            $ = testWindow.$;
            EditorManager = testWindow.brackets.test.EditorManager;
            CommandManager = testWindow.brackets.test.CommandManager;
            Commands = testWindow.brackets.test.Commands;
            CodeInspection = testWindow.brackets.test.CodeInspection;
            QuickViewManager = testWindow.brackets.getModule("features/QuickViewManager");
            CodeInspection.toggleEnabled(true);
            // createTestWindowAndRun already waited for the app (and so the extension's appReady, which
            // wires the lazy-start hooks) to finish loading. The server itself starts lazily on the
            // first served-language file - the warm-up below opens a .ts, which starts it; waiting for
            // its diagnostics ("not assignable") is the real readiness signal.

            // Warm up tsserver. Its very first request pays a large one-time cost - spawning node,
            // launching vtsls, and loading the TypeScript library + project - which on a slow/loaded
            // CI runner can exceed a single spec's timeout (fast dev machines never see it). Pay it
            // once here with a generous budget so every spec below talks to an already-primed server;
            // later project-switch restarts reuse the warm process and are fast.
            await SpecRunnerUtils.loadProjectInTestWindow(testFolder + "ts/");
            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["type-error.ts"]), "warm-up: open type-error.ts");
            await awaitsFor(function () {
                return $("#problems-panel").text().includes("not assignable");
            }, "tsserver to warm up on first cold start", 90000);
        }, 100000);

        afterAll(async function () {
            testWindow = null;
            $ = null;
            EditorManager = null;
            CommandManager = null;
            Commands = null;
            CodeInspection = null;
            await SpecRunnerUtils.closeTestWindow();
        }, 30000);

        function panelText() {
            return $("#problems-panel").text();
        }

        async function _openInProject(subFolder, fileName) {
            await SpecRunnerUtils.loadProjectInTestWindow(testFolder + subFolder);
            await awaitsForDone(SpecRunnerUtils.openProjectFiles([fileName]), "open " + fileName);
        }

        it("should report TypeScript type errors from the language server", async function () {
            await _openInProject("ts/", "type-error.ts");
            // type-error.ts assigns a string to a `number` -> TS2322 "... not assignable ...".
            await awaitsFor(function () {
                return panelText().includes("not assignable");
            }, "TypeScript type error to be reported", 30000);
        }, 45000);

        it("should report implicit-any in a JS project that opts into checkJs", async function () {
            // js-checkjs has a jsconfig.json with checkJs + noImplicitAny, so the untyped parameter
            // in implicit.js IS flagged - and our diagnostic filter keeps it (the project opted in).
            await _openInProject("js-checkjs/", "implicit.js");
            await awaitsFor(function () {
                return panelText().includes(IMPLICIT_ANY_MESSAGE);
            }, "implicit-any to be reported under checkJs", 30000);
        }, 45000);

        it("should NOT report implicit-any in a plain JS project", async function () {
            // Precondition: confirm the server actually produces implicit-any for this exact code
            // (under checkJs), so the plain-project assertion below reflects gating, not just timing.
            await _openInProject("js-checkjs/", "implicit.js");
            await awaitsFor(function () {
                return panelText().includes(IMPLICIT_ANY_MESSAGE);
            }, "implicit-any under checkJs (precondition)", 30000);

            // Same code in a plain JS project (no jsconfig / no @ts-check): the "go add types" nag
            // must not appear. Wait for inspection to settle clean, then assert it is absent.
            await _openInProject("js-plain/", "implicit.js");
            await awaitsFor(function () {
                return $("#status-inspection").hasClass("inspection-valid");
            }, "plain JS inspection to settle with no problems", 30000);
            expect(panelText().includes(IMPLICIT_ANY_MESSAGE)).toBe(false);
        }, 75000);

        it("defers JSHint to the language server in a plain JS project", async function () {
            // The language server is the JS linter on desktop, so the legacy JSHint linter must defer
            // to it: the file below would draw a "Missing semicolon. jshint (W033)" nag if JSHint ran,
            // but it must not appear. (No .jshintrc, so JSHint isn't explicitly opted in.)
            const FileSystem = testWindow.brackets.test.FileSystem;
            const LSPClient = await new Promise(function (resolve) {
                testWindow.brackets.getModule(["languageTools/LSPClient"], resolve);
            });
            // A plain JS project (js-plain has no jsconfig/tsconfig). Add a file JSHint would flag.
            const projectPath = await SpecRunnerUtils.getTempTestDirectory(testRootSpec + "js-plain");
            await jsPromise(SpecRunnerUtils.createTextFile(
                path.join(projectPath, "missing-semicolon.js"), 'console.log("hello")\n', FileSystem));
            await SpecRunnerUtils.loadProjectInTestWindow(projectPath);
            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["missing-semicolon.js"]),
                "open missing-semicolon.js");

            // The deferral only holds while the server is the active JS linter - wait for that.
            await awaitsFor(function () {
                return LSPClient.isLintingProviderActive("javascript");
            }, "the language server to be the active JS linter", 30000);
            // The file is valid JS, so the server reports nothing; let inspection settle clean.
            await awaitsFor(function () {
                return $("#status-inspection").hasClass("inspection-valid");
            }, "inspection to settle with no problems", 30000);
            expect(panelText().toLowerCase().includes("jshint")).toBe(false);
        }, 45000);

        // ----- incremental document sync ----------------------------------------------------------

        // DocumentSync sends incremental range edits (not the whole file) when the server advertises
        // incremental sync. These two tests use the server's OWN diagnostics as the sync oracle: a
        // type error can only appear or clear exactly on cue if the server's copy of the document
        // matches the editor after every edit. If incremental replay ever drifted, the error would
        // land on the wrong text (or not at all), failing the assertion. incremental.ts is mutated in
        // memory only and force-closed without saving, so the on-disk fixture stays clean.

        function inspectionClean() {
            return $("#status-inspection").hasClass("inspection-valid");
        }

        it("keeps the server in sync across many incremental edits", async function () {
            await _openInProject("ts/", "incremental.ts");
            try {
                const editor = EditorManager.getCurrentFullEditor();
                const doc = editor.document;
                await awaitsFor(inspectionClean, "incremental.ts to start clean", 30000);

                // 1) Many single-character inserts - each a separate change record - appending a valid
                // statement. Fed only these incremental edits, the server must still parse it as clean.
                const insert = "\nlet d: number = 4;";
                for (let i = 0; i < insert.length; i++) {
                    const line = editor.lineCount() - 1;
                    doc.replaceRange(insert[i], { line: line, ch: editor.getLine(line).length });
                }
                await awaitsFor(inspectionClean, "still clean after many single-char inserts", 30000);

                // 2) A whole-line replacement (non-empty range) that introduces a type error on line 0.
                doc.replaceRange('let a: number = "oops";',
                    { line: 0, ch: 0 }, { line: 0, ch: editor.getLine(0).length });
                await awaitsFor(function () {
                    return panelText().includes("not assignable");
                }, "type error after a mid-document line replacement", 30000);

                // 3) Fix it with another replacement -> the error must clear.
                doc.replaceRange("let a: number = 0;",
                    { line: 0, ch: 0 }, { line: 0, ch: editor.getLine(0).length });
                await awaitsFor(inspectionClean, "error clears after the fix", 30000);

                // 4) A multi-line deletion (non-empty range, empty text): drop line 1 entirely. Still valid.
                doc.replaceRange("", { line: 1, ch: 0 }, { line: 2, ch: 0 });
                await awaitsFor(inspectionClean, "still clean after a deletion", 30000);
            } finally {
                // must run even on failure - a dirty file left open hangs every later
                // project switch on the save prompt, cascading into unrelated suites
                await jsPromise(CommandManager.execute(Commands.FILE_CLOSE, { _forceClose: true }))
                    .catch(function (e) { console.error("Failed closing incremental.ts", e); });
            }
        }, 90000);

        it("keeps the server in sync for a batched multi-cursor edit", async function () {
            await _openInProject("ts/", "incremental.ts");
            try {
                const editor = EditorManager.getCurrentFullEditor();
                await awaitsFor(inspectionClean, "incremental.ts to start clean", 30000);

                // Two cursors on the SAME line, edited in one operation - the order-sensitive case, since
                // the first replacement shifts the columns of the second. CodeMirror applies and reports
                // the batch so that replaying the records in array order reproduces the result; this
                // confirms our 1:1 change-record -> LSP-range map honours that ordering.
                // "let a: number = 0;" -> "let abc: number = \"hello\";"
                editor.setSelections([
                    { start: { line: 0, ch: 4 }, end: { line: 0, ch: 5 } },     // the identifier `a`
                    { start: { line: 0, ch: 16 }, end: { line: 0, ch: 17 } }    // the literal `0`
                ]);
                editor._codeMirror.replaceSelections(["abc", '"hello"']);
                // Editor side is correct by construction; the assertion that matters is the server agreeing
                // - it can only report the error if it received the same text.
                expect(editor.getLine(0)).toBe('let abc: number = "hello";');
                await awaitsFor(function () {
                    return panelText().includes("not assignable");
                }, "type error after the multi-cursor edit", 30000);

                // Revert both cursors in one operation -> the error must clear (sync holds the other way).
                editor.setSelections([
                    { start: { line: 0, ch: 4 }, end: { line: 0, ch: 7 } },     // `abc`
                    { start: { line: 0, ch: 18 }, end: { line: 0, ch: 25 } }    // `"hello"`
                ]);
                editor._codeMirror.replaceSelections(["a", "0"]);
                expect(editor.getLine(0)).toBe("let a: number = 0;");
                await awaitsFor(inspectionClean, "error clears after reverting the multi-cursor edit", 30000);
            } finally {
                // see the incremental-edits test above
                await jsPromise(CommandManager.execute(Commands.FILE_CLOSE, { _forceClose: true }))
                    .catch(function (e) { console.error("Failed closing incremental.ts", e); });
            }
        }, 90000);

        // ----- embedded JavaScript in HTML <script> tags -----------------------------------------

        // embedded.html has `var arr = [1, 2, 3];` then `arr.` inside a <script>. HTML embedded JS is
        // served by the legacy Tern provider, NOT the language server - vtsls can't semantically
        // analyze an in-memory .html doc. With vtsls running (the suite's warm-up started it), this
        // also regression-tests that the LSP stands down for documents the server doesn't sync
        // (servesDocument) instead of claiming the request and starving Tern. Asserted at the
        // provider layer rather than through SHOW_CODE_HINTS: the hint menu UI requires a FOCUSED
        // editor (CodeHintManager._startNewSession -> getFocusedEditor), which an unfocused test
        // runner window never has.
        it("provides JS completions inside an HTML <script> tag", async function () {
            await _openInProject("html/", "embedded.html");
            const editor = EditorManager.getCurrentFullEditor();
            editor.setCursorPos(6, 4); // just after `arr.`

            // Gate 1: the LSP must not claim HTML, so Tern's session gate is open.
            const LSPClient = await new Promise(function (resolve) {
                testWindow.brackets.getModule(["languageTools/LSPClient"], resolve);
            });
            expect(LSPClient.isLintingProviderActive("html")).toBe(false);

            // Gate 2 + the completion itself: Tern's registered hint provider serves the <script>.
            const ExtensionLoader = testWindow.brackets.getModule("utils/ExtensionLoader");
            const jsCodeHints = await new Promise(function (resolve, reject) {
                ExtensionLoader.getRequireContextForExtension("JavaScriptCodeHints")(["main"], resolve, reject);
            });
            let hintText = "";
            await awaitsFor(function () {
                if (!jsCodeHints.jsHintProvider.hasHints(editor, null)) {
                    return false; // Tern session/worker may still be starting up
                }
                const response = jsCodeHints.jsHintProvider.getHints(null);
                if (!response || typeof response.done !== "function") {
                    return hintText.indexOf("push") !== -1; // sync response already captured below
                }
                response.done(function (result) {
                    hintText = ((result && result.hints) || []).map(function (h) {
                        return $(h).text();
                    }).join("|");
                });
                return hintText.indexOf("push") !== -1;
            }, "Tern Array-member completions at arr. inside the <script>", 30000, 500);
            expect(hintText).toContain("push");

            await awaitsForDone(CommandManager.execute(Commands.FILE_CLOSE, { _forceClose: true }),
                "close embedded.html");
        }, 45000);

        // The docs popup beside the hint list must stay empty when its only content would be a
        // signature that just repeats the item's label (vtsls returns the label itself as `detail`
        // for keywords/plain identifiers like `this`/`throw`) - otherwise it echoes the hint row.
        it("suppresses the docs popup that would only echo the hint label", function () {
            const docHtml = testWindow.brackets.getModule("languageTools/DefaultProviders")._docPopupHtml;
            expect(docHtml({ label: "this", detail: "this" })).toBe("");
            expect(docHtml({ label: "throw", detail: "throw", documentation: "" })).toBe("");
            expect(docHtml({ label: "x" })).toBe(""); // no detail, no docs
            // A real signature or actual documentation still renders.
            expect(docHtml({ label: "foo", detail: "function foo(): void" }).length).toBeGreaterThan(0);
            expect(docHtml({ label: "this", detail: "this", documentation: "The context." }))
                .toContain("context");
        });

        // The generated ts/jsconfig carries an autoGeneratedByPhoenixCode marker whose autoManage
        // flag is the contract letting Phoenix silently rewrite/upgrade the file. Guard the contract:
        // marker present, compilerOptions preserved across rewrites, checkJs only changed when asked,
        // and tsconfig (a real build file, unlike editor-only jsconfig) always gets allowJs + noEmit.
        it("generates managed configs per the autoManage contract", async function () {
            const ExtensionLoader = testWindow.brackets.getModule("utils/ExtensionLoader");
            const CodeIntelligence = await new Promise(function (resolve, reject) {
                ExtensionLoader.getRequireContextForExtension("TypeScriptSupport")(
                    ["CodeIntelligence"], resolve, reject);
            });
            const content = CodeIntelligence._configContent;

            const js = content("jsconfig.json", null, false);
            expect(js.autoGeneratedByPhoenixCode.autoManage).toBe(true);
            expect(js.autoGeneratedByPhoenixCode.doc.length).toBeGreaterThan(0);
            expect(js.compilerOptions.checkJs).toBe(false);
            expect(js.compilerOptions.allowJs).toBeUndefined();
            expect(js.compilerOptions.noEmit).toBeUndefined();

            // The universal template: module "preserve" resolves both import and require() with no
            // extension demands (moduleResolution is implied by it, so the key must be absent);
            // react-jsx and UMD-global access reduce flavor friction.
            expect(js.compilerOptions.module).toBe("preserve");
            expect(js.compilerOptions.moduleResolution).toBeUndefined();
            expect(js.compilerOptions.jsx).toBe("react-jsx");
            expect(js.compilerOptions.allowUmdGlobalAccess).toBe(true);

            // typeAcquisition must be explicit on BOTH file types: it defaults ON for jsconfig but
            // OFF for tsconfig, so without this the jsconfig->tsconfig upgrade would silently kill
            // Node builtin/@types IntelliSense (ATA).
            expect(js.typeAcquisition).toEqual({ enable: true });

            // upgrade: existing compilerOptions survive; checkJs preserved when not passed
            const existing = { checkJs: true, target: "es2015", module: "nodenext" };
            const ts = content("tsconfig.json", existing);
            expect(ts.compilerOptions.checkJs).toBe(true);   // preserved
            expect(ts.compilerOptions.target).toBe("es2015"); // user's edit preserved
            expect(ts.compilerOptions.module).toBe("nodenext"); // user's module choice preserved
            expect(ts.compilerOptions.allowJs).toBe(true);    // build-safety additions
            expect(ts.compilerOptions.noEmit).toBe(true);
            expect(ts.typeAcquisition).toEqual({ enable: true });

            // explicit checkJs wins over the preserved value
            expect(content("jsconfig.json", { checkJs: true }, false).compilerOptions.checkJs).toBe(false);
        });

        // ----- config settings panel (friendly UI over the root ts/jsconfig) -----
        describe("config settings panel", function () {

            async function _setupConfigProject(configText, extraFiles) {
                const FileSystem = testWindow.brackets.test.FileSystem;
                const projectPath = await SpecRunnerUtils.getTempTestDirectory(testRootSpec + "js-plain", true);
                await jsPromise(SpecRunnerUtils.createTextFile(
                    path.join(projectPath, "jsconfig.json"), configText, FileSystem));
                for (const name of Object.keys(extraFiles || {})) {
                    await jsPromise(SpecRunnerUtils.createTextFile(
                        path.join(projectPath, name), extraFiles[name], FileSystem));
                }
                await SpecRunnerUtils.loadProjectInTestWindow(projectPath);
                return projectPath;
            }

            async function _generatedConfigText() {
                const ExtensionLoader = testWindow.brackets.getModule("utils/ExtensionLoader");
                const CodeIntelligence = await new Promise(function (resolve, reject) {
                    ExtensionLoader.getRequireContextForExtension("TypeScriptSupport")(
                        ["CodeIntelligence"], resolve, reject);
                });
                return JSON.stringify(CodeIntelligence._configContent("jsconfig.json", null, false), null, 4);
            }

            function _panelVisible() {
                return $("#ts-config-settings-panel").is(":visible");
            }

            afterEach(async function () {
                await awaitsForDone(CommandManager.execute(Commands.FILE_CLOSE_ALL, { _forceClose: true }),
                    "close config panel project files");
            });

            afterAll(async function () {
                await SpecRunnerUtils.removeTempDirectory();
            }, 30000);

            it("auto-shows on the root config and hides when navigating away", async function () {
                await _setupConfigProject(await _generatedConfigText(), { "app.js": "var a = 1;\n" });
                await awaitsForDone(SpecRunnerUtils.openProjectFiles(["jsconfig.json"]), "open jsconfig");
                await awaitsFor(_panelVisible, "config panel to auto-show", 30000);
                // the generated config carries the marker, so the managed-only bits are visible
                expect($("#ts-config-settings-panel .ts-cfg-auto-manage-wrap").hasClass("forced-hidden")).toBe(false);
                expect($("#ts-config-settings-panel .ts-cfg-origin").hasClass("forced-hidden")).toBe(false);

                await awaitsForDone(SpecRunnerUtils.openProjectFiles(["app.js"]), "open app.js");
                await awaitsFor(function () {
                    return !_panelVisible();
                }, "config panel to hide on navigating away", 30000);
            }, 45000);

            it("toggling Check JavaScript edits and saves the file", async function () {
                await _setupConfigProject(await _generatedConfigText(), {});
                await awaitsForDone(SpecRunnerUtils.openProjectFiles(["jsconfig.json"]), "open jsconfig");
                await awaitsFor(_panelVisible, "config panel to auto-show", 30000);

                const DocumentManager = testWindow.brackets.test.DocumentManager;
                const doc = DocumentManager.getCurrentDocument();
                expect(doc.getText().indexOf("\"checkJs\": false")).not.toBe(-1);

                const $check = $("#ts-config-settings-panel .ts-cfg-check-js");
                $check.prop("checked", true).trigger("change");
                await awaitsFor(function () {
                    return doc.getText().indexOf("\"checkJs\": true") !== -1 && !doc.isDirty;
                }, "checkJs true to be written and saved", 30000);
            }, 45000);

            it("drops to read-only for configs with comments (JSONC)", async function () {
                await _setupConfigProject(
                    "// user's commented config\n{\n    \"compilerOptions\": { \"checkJs\": true }\n}\n", {});
                await awaitsForDone(SpecRunnerUtils.openProjectFiles(["jsconfig.json"]), "open jsconfig");
                await awaitsFor(_panelVisible, "config panel to auto-show", 30000);
                await awaitsFor(function () {
                    return !$("#ts-config-settings-panel .ts-cfg-read-only").hasClass("forced-hidden");
                }, "read-only notice to show for JSONC", 30000);
                expect($("#ts-config-settings-panel .ts-cfg-controls").hasClass("forced-hidden")).toBe(true);
            }, 45000);
        });

        // ----- module flavors: the generated config must "just work" for each -----
        // Demo projects are generated per flavor with the REAL config content our generator emits
        // (also proving vtsls accepts module "preserve"), then cross-file intelligence is asserted
        // through the live server via hover (focus-independent, unlike the code-hint menu).
        // AMD/RequireJS is deliberately absent: tsserver cannot infer those modules cross-file -
        // a documented limitation, not a config problem.
        describe("module flavors served by the generated config", function () {

            async function _setupFlavorProject(files) {
                const FileSystem = testWindow.brackets.test.FileSystem;
                const ExtensionLoader = testWindow.brackets.getModule("utils/ExtensionLoader");
                const CodeIntelligence = await new Promise(function (resolve, reject) {
                    ExtensionLoader.getRequireContextForExtension("TypeScriptSupport")(
                        ["CodeIntelligence"], resolve, reject);
                });
                // randomize: a unique project path per test. Reusing a fixed temp path collides
                // with per-project persisted state - Phoenix would try to restore files an earlier
                // suite's getTempTestDirectory() wipe already deleted ("Error Opening File" dialog).
                const projectPath = await SpecRunnerUtils.getTempTestDirectory(testRootSpec + "js-plain", true);
                const cfg = CodeIntelligence._configContent("jsconfig.json", null, false);
                await jsPromise(SpecRunnerUtils.createTextFile(
                    path.join(projectPath, "jsconfig.json"), JSON.stringify(cfg, null, 4), FileSystem));
                for (const name of Object.keys(files)) {
                    await jsPromise(SpecRunnerUtils.createTextFile(
                        path.join(projectPath, name), files[name], FileSystem));
                }
                await SpecRunnerUtils.loadProjectInTestWindow(projectPath);
                await awaitsForDone(SpecRunnerUtils.openProjectFiles(["main.js"]), "open main.js");
                return EditorManager.getCurrentFullEditor();
            }

            // Hover over (line, ch) until the popover's text contains `expected` - proves the
            // symbol resolved through the server (an unresolved symbol hovers as nothing/any).
            async function _expectHoverContains(editor, line, ch, expected) {
                await awaitsFor(async function () {
                    const popover = await _hoverPopoverAt(editor, line, ch);
                    return !!(popover && popover.content && popover.content.text().indexOf(expected) !== -1);
                }, "hover at " + line + ":" + ch + " to contain '" + expected + "'", 30000, 500);
            }

            afterEach(async function () {
                await awaitsForDone(CommandManager.execute(Commands.FILE_CLOSE_ALL, { _forceClose: true }),
                    "close flavor project files");
            });

            afterAll(async function () {
                await SpecRunnerUtils.removeTempDirectory();
            }, 30000);

            it("resolves CommonJS require() across files (Node-CJS flavor)", async function () {
                const editor = await _setupFlavorProject({
                    "local.js": "module.exports = { greetCjs: function () { return \"hi\"; } };\n",
                    "main.js": "const util = require(\"./local\");\nutil.greetCjs();\n"
                });
                // hover `greetCjs` in `util.greetCjs();` - only resolvable if require() resolved
                await _expectHoverContains(editor, 1, 8, "greetCjs");
            }, 45000);

            it("resolves extensionless ESM imports (type:module flavor)", async function () {
                const editor = await _setupFlavorProject({
                    "package.json": JSON.stringify({ name: "esm-demo", type: "module" }, null, 4),
                    "lib.js": "export function greetEsm() { return \"hi\"; }\n",
                    "main.js": "import { greetEsm } from \"./lib\";\ngreetEsm();\n"
                });
                // `./lib` has no extension - nodenext-style resolution would fail here; the
                // template's module "preserve" must resolve it.
                await _expectHoverContains(editor, 1, 3, "greetEsm");
            }, 45000);

            it("gives DOM intelligence to plain browser scripts (no lib configured)", async function () {
                const editor = await _setupFlavorProject({
                    "main.js": "const el = document.querySelector(\".x\");\nel.click();\n"
                });
                // `document` types only exist because the default lib includes DOM
                await _expectHoverContains(editor, 0, 15, "Document");
            }, 45000);
        });

        // LSP quickfixes: diagnostics and fixes are separate channels - after diagnostics land, the
        // LintingProvider idle-fetches textDocument/codeAction quickfixes, decorates the cached
        // errors, and re-runs inspection so the Fix All button appears. `consol.log(1)` produces
        // TS 2552 ("Cannot find name 'consol'") whose quickfix is a single same-file text edit
        // ("Change spelling to 'console'") - exactly the admitted shape. Fix application goes
        // through Editor.replaceMultipleRanges, so no editor focus is needed (unlike the code-hint
        // menu), making this runnable in an unfocused test window.
        it("wires LSP quickfixes into the problems panel Fix All workflow", async function () {
            const FileSystem = testWindow.brackets.test.FileSystem;
            const projectPath = await SpecRunnerUtils.getTempTestDirectory(testRootSpec + "ts");
            await jsPromise(SpecRunnerUtils.createTextFile(
                path.join(projectPath, "fixable.ts"), "consol.log(1);\n", FileSystem));
            await SpecRunnerUtils.loadProjectInTestWindow(projectPath);
            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["fixable.ts"]), "open fixable.ts");
            try {
                await awaitsFor(function () {
                    return $("#problems-panel").text().indexOf("Cannot find name 'consol'") !== -1;
                }, "the spelling diagnostic to appear in the problems panel", 30000);

                // The idle codeAction fetch (~800ms after diagnostics settle) attaches the fix and
                // nudges a re-run - the Fix All button becoming visible proves the whole chain.
                await awaitsFor(function () {
                    const $btn = $("#problems-panel .problems-fix-all-btn");
                    return $btn.length && !$btn.hasClass("forced-hidden");
                }, "the Fix All button to appear once quickfixes are fetched", 30000);

                const editor = EditorManager.getCurrentFullEditor();
                $("#problems-panel .problems-fix-all-btn").click();
                await awaitsFor(function () {
                    return editor.document.getText().indexOf("console.log(1);") !== -1;
                }, "the quickfix to change consol -> console", 10000);
            } finally {
                // see the incremental-edits test above
                await jsPromise(CommandManager.execute(Commands.FILE_CLOSE, { _forceClose: true }))
                    .catch(function (e) { console.error("Failed closing fixable.ts", e); });
                await SpecRunnerUtils.removeTempDirectory();
            }
        }, 90000);

        // ----- hover quick-actions (Go to Definition / Find Usages) -------------------------------

        // Query the hover popover at a position the same way QuickViewManager does internally.
        async function _hoverPopoverAt(editor, line, ch) {
            const pos = { line: line, ch: ch };
            const token = editor._codeMirror.getTokenAt(pos, true);
            return QuickViewManager._queryPreviewProviders(editor, pos, token);
        }

        // sample.ts/sample.js: greetUser is declared on line 1 and called on lines 5 and 6. Each
        // lives in its own project folder so the (identically named) symbols don't collide in the
        // server's inferred project.
        const DECL_LINE = 1, CALL_LINE = 5, CALL_CH = 4;

        [{ ext: "ts", folder: "hover-ts/", file: "sample.ts" },
            { ext: "js", folder: "hover-js/", file: "sample.js" }].forEach(function (tc) {

            it("hover shows quick actions and Go to Definition navigates (" + tc.ext + ")", async function () {
                await _openInProject(tc.folder, tc.file);
                const editor = EditorManager.getCurrentFullEditor();
                let popover = null;
                await awaitsFor(async function () {
                    popover = await _hoverPopoverAt(editor, CALL_LINE, CALL_CH);
                    return !!(popover && popover.content && popover.content.find(".lsp-hover-action").length === 2);
                }, "hover quick actions to appear", 30000);

                const labels = popover.content.find(".lsp-hover-action-label").map(function () {
                    return $(this).text();
                }).get();
                expect(labels).toEqual(["Go to Definition", "Find Usages"]);

                // Click "Go to Definition" to jump from the call (line 5) to the declaration (line 1).
                // Re-click through the hover until it takes effect - the server may still be indexing
                // right after the project (re)opened, so an early click can be a no-op.
                await awaitsFor(async function () {
                    if (EditorManager.getCurrentFullEditor().getCursorPos().line === DECL_LINE) {
                        return true;
                    }
                    const pop = await _hoverPopoverAt(editor, CALL_LINE, CALL_CH);
                    const $act = pop && pop.content && pop.content.find(".lsp-hover-action").eq(0);
                    if ($act && $act.length) {
                        $act.trigger("click");
                    }
                    return EditorManager.getCurrentFullEditor().getCursorPos().line === DECL_LINE;
                }, "Go to Definition to navigate to the declaration", 30000);
                expect(EditorManager.getCurrentFullEditor().getCursorPos().line).toBe(DECL_LINE);
            }, 75000);

            it("hover Find Usages opens the references panel (" + tc.ext + ")", async function () {
                await _openInProject(tc.folder, tc.file);
                const editor = EditorManager.getCurrentFullEditor();
                await awaitsFor(async function () {
                    return !!(await _hoverPopoverAt(editor, CALL_LINE, CALL_CH));
                }, "hover popover to be available", 30000);

                // "Find Usages" is the right-aligned action; clicking it opens the references panel.
                // Retry through the hover until the panel opens (the server may still be indexing).
                await awaitsFor(async function () {
                    if ($("#reference-in-files-results").is(":visible")) {
                        return true;
                    }
                    const pop = await _hoverPopoverAt(editor, CALL_LINE, CALL_CH);
                    const $end = pop && pop.content && pop.content.find(".lsp-hover-action--end");
                    if ($end && $end.length) {
                        $end.trigger("click");
                    }
                    return $("#reference-in-files-results").is(":visible");
                }, "references panel to open", 30000);
                expect($("#reference-in-files-results").is(":visible")).toBe(true);
            }, 75000);
        });
    });
});
