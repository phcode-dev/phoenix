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

/*global describe, it, expect, beforeAll, afterAll, awaitsFor, awaitsForDone, path, jsPromise */

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

            // Discard the in-memory edits so the fixture is pristine for re-runs / other tests.
            await awaitsForDone(CommandManager.execute(Commands.FILE_CLOSE, { _forceClose: true }),
                "close incremental.ts");
        }, 90000);

        it("keeps the server in sync for a batched multi-cursor edit", async function () {
            await _openInProject("ts/", "incremental.ts");
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

            await awaitsForDone(CommandManager.execute(Commands.FILE_CLOSE, { _forceClose: true }),
                "close incremental.ts");
        }, 90000);

        // ----- embedded JavaScript in HTML <script> tags -----------------------------------------

        // embedded.html has `var arr = [1, 2, 3];` then `arr.` inside a <script>. The HTML file is
        // synced to the server as a JavaScript "view" of itself - the <script> blocks kept, everything
        // else blanked to spaces (newlines preserved) so positions stay 1:1 - so a completion at `arr.`
        // returns Array members even though the file's top-level language is HTML.
        it("provides JS completions inside an HTML <script> tag", async function () {
            await _openInProject("html/", "embedded.html");
            const editor = EditorManager.getCurrentFullEditor();
            editor.setCursorPos(6, 4); // just after `arr.`

            function hasPush() {
                return $(".codehint-menu li").text().indexOf("push") !== -1;
            }
            // Ask for hints; re-open only if the menu closed empty (the server may still be processing
            // the freshly-synced HTML view). Avoids thrashing a menu that is mid-populate.
            await awaitsFor(function () {
                if (hasPush()) {
                    return true;
                }
                if (!$(".codehint-menu:visible").length) {
                    CommandManager.execute(Commands.SHOW_CODE_HINTS);
                }
                return false;
            }, "Array-member completions at arr. inside the <script>", 30000);
            expect(hasPush()).toBe(true);

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

        // ----- incremental HTML->JS <script> view (HtmlJsView) ------------------------------------
        // The view fed to the server is maintained with CodeMirror markers so typing inside a <script>
        // does not re-tokenize the whole file; a full findBlocks build (_extractFull) is the parity
        // oracle. Uses a large, programmatically-generated HTML file (no checked-in asset).
        describe("incremental <script> view on large HTML", function () {
            let HtmlJsView, bigEditor;

            function buildLargeHtml(numBlocks, linesPerBlock) {
                const p = ["<!DOCTYPE html>", "<html>", "<head><title>big</title></head>", "<body>"];
                for (let b = 0; b < numBlocks; b++) {
                    p.push("<h2>Section " + b + "</h2>", "<p>markup words block " + b + " lorem ipsum.</p>",
                        "<script>", "var block" + b + " = {");
                    for (let l = 0; l < linesPerBlock; l++) {
                        p.push("    key" + l + ": " + l + ",");
                    }
                    p.push("};", "function fn" + b + "(x) { return block" + b + ".key0 + x; }", "</script>");
                }
                p.push("</body>", "</html>");
                return p.join("\n");
            }

            // Index of the first line containing `substr` in the (current) document.
            function lineOf(substr) {
                return bigEditor.document.getText().split("\n").findIndex(function (l) {
                    return l.indexOf(substr) !== -1;
                });
            }

            beforeAll(async function () {
                HtmlJsView = testWindow.brackets.getModule("languageTools/HtmlJsView");
                const FileSystem = testWindow.brackets.test.FileSystem;
                const bigProject = await SpecRunnerUtils.getTempTestDirectory(testRootSpec + "html");
                await jsPromise(SpecRunnerUtils.createTextFile(
                    path.join(bigProject, "big.html"), buildLargeHtml(120, 15), FileSystem));
                await SpecRunnerUtils.loadProjectInTestWindow(bigProject);
                await awaitsForDone(SpecRunnerUtils.openProjectFiles(["big.html"]), "open big.html");
                bigEditor = EditorManager.getCurrentFullEditor();
            }, 60000);

            afterAll(async function () {
                await awaitsForDone(CommandManager.execute(Commands.FILE_CLOSE, { _forceClose: true }),
                    "close big.html");
                await SpecRunnerUtils.removeTempDirectory();
            }, 30000);

            it("provides member completions inside a <script> of a large HTML file", async function () {
                const fnLine = lineOf("function fn5(");
                bigEditor.document.replaceRange("block5.\n", { line: fnLine, ch: 0 }); // safe interior edit
                bigEditor.setCursorPos(fnLine, "block5.".length);
                function hasKey() {
                    return $(".codehint-menu li").text().indexOf("key0") !== -1;
                }
                await awaitsFor(function () {
                    if (hasKey()) {
                        return true;
                    }
                    if (!$(".codehint-menu:visible").length) {
                        CommandManager.execute(Commands.SHOW_CODE_HINTS);
                    }
                    return false;
                }, "member completion inside a large-file <script>", 30000);
                expect(hasKey()).toBe(true);
            }, 45000);

            it("marker view equals a fresh full findBlocks build after edits", function () {
                HtmlJsView.extract(bigEditor); // ensure state exists
                const keyLine = lineOf("key0:");
                bigEditor.document.replaceRange(" extra", // append to a JS line (interior)
                    { line: keyLine, ch: bigEditor.document.getLine(keyLine).length });
                "abcdef".split("").forEach(function (c) { // per-char inserts, each its own record
                    const l = lineOf("key0:");
                    bigEditor.document.replaceRange(c, { line: l, ch: bigEditor.document.getLine(l).length });
                });
                const delLine = lineOf("key1:"); // a deletion inside a script (leading indent)
                bigEditor.document.replaceRange("", { line: delLine, ch: 0 }, { line: delLine, ch: 4 });
                expect(HtmlJsView.extract(bigEditor)).toBe(HtmlJsView._extractFull(bigEditor));
            });

            it("carries safe in-script keystrokes with zero recompiles", function () {
                HtmlJsView.extract(bigEditor); // ensure state, then measure only the typing below
                HtmlJsView._resetStats();
                const jsLine = lineOf("key5:");
                let ch = bigEditor.document.getLine(jsLine).length;
                "myVar.value".split("").forEach(function (c) { // no '<'/'>' -> all fast-path patches
                    bigEditor.document.replaceRange(c, { line: jsLine, ch: ch });
                    ch += 1;
                });
                const s = HtmlJsView._getStats();
                expect(s.recompiles).toBe(0);
                expect(s.mismatches).toBe(0);
                expect(s.patches).toBeGreaterThan(0);
                expect(HtmlJsView.extract(bigEditor)).toBe(HtmlJsView._extractFull(bigEditor)); // parity holds
            });

            it("recompiles on a structural </script> edit and stays correct", function () {
                HtmlJsView.extract(bigEditor);
                HtmlJsView._resetStats();
                const jsLine = lineOf("var block7");
                bigEditor.document.replaceRange("</script><script>", { line: jsLine, ch: 0 }); // has '<'/'>'
                const view = HtmlJsView.extract(bigEditor); // forces a full rebuild
                expect(HtmlJsView._getStats().recompiles).toBeGreaterThanOrEqual(1);
                expect(view).toBe(HtmlJsView._extractFull(bigEditor));
            });

            it("self-heals a forced view drift", function () {
                HtmlJsView.extract(bigEditor);
                HtmlJsView._resetStats();
                HtmlJsView._forceDrift(bigEditor);   // silently corrupt the cached view
                HtmlJsView._verifyNow(bigEditor);    // deterministic stand-in for the idle timer
                expect(HtmlJsView._getStats().mismatches).toBe(1);
                expect(HtmlJsView.extract(bigEditor)).toBe(HtmlJsView._extractFull(bigEditor)); // healed
            });

            it("keeps <script> JS verbatim and blanks markup at 1:1 columns", function () {
                const view = HtmlJsView.extract(bigEditor);
                expect(view).toBe(HtmlJsView._extractFull(bigEditor));
                const viewLines = view.split("\n");
                const src = bigEditor.document.getText().split("\n");
                expect(viewLines.length).toBe(src.length); // 1:1 line count preserved
                const pIdx = src.findIndex(function (l) { return l.indexOf("<p>markup") !== -1; });
                const jsIdx = src.findIndex(function (l) { return l.trim() === "};"; });
                expect(/^\s*$/.test(viewLines[pIdx])).toBe(true); // markup blanked to spaces
                expect(viewLines[jsIdx]).toBe(src[jsIdx]);         // JS preserved verbatim
            });
        });

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
