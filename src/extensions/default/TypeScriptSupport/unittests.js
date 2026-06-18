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
            CodeInspection;

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
            CodeInspection.toggleEnabled(true);
            // Wait until the extension has attempted to start the language server.
            await awaitsFor(function () {
                return testWindow._TypeScriptSupportReadyToIntegTest;
            }, "TypeScript LSP server to start", 30000);
        }, 30000);

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
            }, "TypeScript type error to be reported", 20000);
        }, 30000);

        it("should report implicit-any in a JS project that opts into checkJs", async function () {
            // js-checkjs has a jsconfig.json with checkJs + noImplicitAny, so the untyped parameter
            // in implicit.js IS flagged - and our diagnostic filter keeps it (the project opted in).
            await _openInProject("js-checkjs/", "implicit.js");
            await awaitsFor(function () {
                return panelText().includes(IMPLICIT_ANY_MESSAGE);
            }, "implicit-any to be reported under checkJs", 20000);
        }, 30000);

        it("should NOT report implicit-any in a plain JS project", async function () {
            // Precondition: confirm the server actually produces implicit-any for this exact code
            // (under checkJs), so the plain-project assertion below reflects gating, not just timing.
            await _openInProject("js-checkjs/", "implicit.js");
            await awaitsFor(function () {
                return panelText().includes(IMPLICIT_ANY_MESSAGE);
            }, "implicit-any under checkJs (precondition)", 20000);

            // Same code in a plain JS project (no jsconfig / no @ts-check): the "go add types" nag
            // must not appear. Wait for inspection to settle clean, then assert it is absent.
            await _openInProject("js-plain/", "implicit.js");
            await awaitsFor(function () {
                return $("#status-inspection").hasClass("inspection-valid");
            }, "plain JS inspection to settle with no problems", 20000);
            expect(panelText().includes(IMPLICIT_ANY_MESSAGE)).toBe(false);
        }, 30000);
    });
});
