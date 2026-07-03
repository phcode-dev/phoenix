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


    if (!Phoenix.isNativeApp) {
        // The PHP language server runs on node - desktop builds only.
        return;
    }

    const SpecRunnerUtils = brackets.getModule("spec/SpecRunnerUtils");

    describe("integration:PHP LSP", function () {
        const testFolder = SpecRunnerUtils.getTestPath("/spec/PHPSupport-test-files");
        let testWindow,
            $,
            CommandManager,
            Commands,
            EditorManager,
            QuickViewManager;

        // Resolve a module from the PHPSupport extension inside the test window.
        function _phpModule(name) {
            return new Promise(function (resolve, reject) {
                const ExtensionLoader = testWindow.brackets.test.ExtensionLoader;
                const ctx = ExtensionLoader.getRequireContextForExtension("PHPSupport");
                ctx([name], resolve, reject);
            });
        }

        async function _openFile(fileName) {
            await awaitsForDone(
                CommandManager.execute(Commands.CMD_ADD_TO_WORKINGSET_AND_OPEN,
                    { fullPath: testFolder + "/" + fileName }));
        }

        function _problemsText() {
            return $("#problems-panel").text();
        }

        beforeAll(async function () {
            testWindow = await SpecRunnerUtils.createTestWindowAndRun();
            $ = testWindow.$;
            CommandManager = testWindow.brackets.test.CommandManager;
            Commands = testWindow.brackets.test.Commands;
            EditorManager = testWindow.brackets.test.EditorManager;
            QuickViewManager = testWindow.brackets.getModule("features/QuickViewManager");
            await SpecRunnerUtils.loadProjectInTestWindow(testFolder);

            // Acquire the server directly (the consent UI is suppressed in test windows). First CI
            // run downloads ~9MB from npm; local runs hit the already-installed copy instantly.
            const ServerInstaller = await _phpModule("ServerInstaller");
            const result = await ServerInstaller.installNow();
            if (!result) {
                throw new Error("Intelephense install failed - network needed for the first run");
            }

            // Warm-up: opening a php file lazily starts the server; the first diagnostic is the
            // readiness signal. First-ever start also builds the stub index - generous budget.
            await _openFile("error.php");
            await awaitsFor(function () {
                return /php \(/.test(_problemsText());
            }, "first Intelephense diagnostics in the problems panel", 120000);
        }, 240000);

        afterAll(async function () {
            testWindow = null;
            await SpecRunnerUtils.closeTestWindow();
        }, 30000);

        it("should report PHP parse errors from the language server", async function () {
            await _openFile("error.php");
            await awaitsFor(function () {
                // the fixture's dangling `->` draws a syntax diagnostic from intelephense
                return /php \(/.test(_problemsText()) && /expected/i.test(_problemsText());
            }, "php parse diagnostic", 30000);
        }, 45000);

        it("should mark the php linting provider active (and html/json untouched by it)", async function () {
            const LSPClient = testWindow.brackets.getModule("languageTools/LSPClient");
            expect(LSPClient.isLintingProviderActive("php")).toBe(true);
            expect(LSPClient.isLintingProviderActive("html")).toBe(false);
        }, 45000);

        it("should show hover docs for a user-defined function", async function () {
            await _openFile("funcs.php");
            const editor = EditorManager.getActiveEditor();
            const lines = editor.document.getText().split("\n");
            const callLine = lines.findIndex(function (l) { return l.indexOf("echo computeTotal") !== -1; });
            const pos = { line: callLine, ch: lines[callLine].indexOf("computeTotal") + 3 };
            let hoverText = null;
            await awaitsFor(function () {
                return QuickViewManager._queryPreviewProviders(editor, pos, editor.getToken(pos))
                    .then(function (popover) {
                        if (popover && popover.content) {
                            hoverText = $(popover.content).text();
                        }
                    }).then(function () {
                        return hoverText && hoverText.indexOf("computeTotal") !== -1;
                    });
            }, "hover docs for computeTotal", 30000);
            expect(hoverText).toContain("computeTotal");
        }, 45000);

        it("should jump to definition within the file", async function () {
            await _openFile("funcs.php");
            const editor = EditorManager.getActiveEditor();
            const lines = editor.document.getText().split("\n");
            const callLine = lines.findIndex(function (l) { return l.indexOf("echo computeTotal") !== -1; });
            const defLine = lines.findIndex(function (l) { return l.indexOf("function computeTotal") !== -1; });
            editor.setCursorPos({ line: callLine, ch: lines[callLine].indexOf("computeTotal") + 3 });
            await awaitsForDone(CommandManager.execute(Commands.NAVIGATE_JUMPTO_DEFINITION));
            await awaitsFor(function () {
                return EditorManager.getActiveEditor().getCursorPos().line === defLine;
            }, "cursor to land on the definition", 30000);
        }, 45000);

        it("should keep Tern serving embedded <script> JS inside php files", async function () {
            await _openFile("embedded.php");
            const editor = EditorManager.getActiveEditor();
            const lines = editor.document.getText().split("\n");
            const jsLine = lines.findIndex(function (l) { return l.indexOf("items.") !== -1; });
            editor.setCursorPos({ line: jsLine, ch: lines[jsLine].indexOf("items.") + 6 });
            // provider-level: the Tern-backed JS hint provider must claim the embedded JS cursor
            // even though an LSP now serves the "php" document language (the inline-host gate fix)
            const jsHintsMain = await new Promise(function (resolve, reject) {
                const ExtensionLoader = testWindow.brackets.test.ExtensionLoader;
                const ctx = ExtensionLoader.getRequireContextForExtension("JavaScriptCodeHints");
                ctx(["main"], resolve, reject);
            });
            await awaitsFor(function () {
                return jsHintsMain.jsHintProvider.hasHints(editor, null);
            }, "Tern to claim the embedded-JS cursor in a php file", 30000);
        }, 45000);
    });
});
