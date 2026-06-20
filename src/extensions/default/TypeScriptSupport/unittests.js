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

/*global describe, it, expect, beforeAll, afterAll, awaitsFor, awaitsForDone */

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
            // Wait until the extension has attempted to start the language server.
            await awaitsFor(function () {
                return testWindow._TypeScriptSupportReadyToIntegTest;
            }, "TypeScript LSP server to start", 30000);

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
