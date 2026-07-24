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
        // The Python language server is a native binary spawned via node - desktop builds only.
        return;
    }

    const SpecRunnerUtils = brackets.getModule("spec/SpecRunnerUtils");

    describe("integration:Python LSP", function () {
        const testFolder = SpecRunnerUtils.getTestPath("/spec/PythonSupport-test-files");
        let testWindow,
            $,
            CommandManager,
            Commands,
            EditorManager,
            QuickViewManager;

        // Resolve a module from the PythonSupport extension inside the test window.
        function _pyModule(name) {
            return new Promise(function (resolve, reject) {
                const ExtensionLoader = testWindow.brackets.test.ExtensionLoader;
                const ctx = ExtensionLoader.getRequireContextForExtension("PythonSupport");
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
            // run downloads the ~13MB wheel from PyPI; local runs hit the installed copy instantly.
            const ServerInstaller = await _pyModule("ServerInstaller");
            const result = await ServerInstaller.installNow();
            if (!result) {
                throw new Error("Pyrefly install failed - network needed for the first run");
            }

            // Warm-up: opening a python file lazily starts the server; the first diagnostic is
            // the readiness signal. Generous budget for the very first start.
            await _openFile("error.py");
            await awaitsFor(function () {
                return /python \(/.test(_problemsText());
            }, "first pyrefly diagnostics in the problems panel", 120000);
        }, 240000);

        afterAll(async function () {
            testWindow = null;
            await SpecRunnerUtils.closeTestWindow();
        }, 30000);

        it("should report Python type errors from the language server", async function () {
            await _openFile("error.py");
            await awaitsFor(function () {
                // the fixture has a str-into-int assignment and an unbound name - either message
                // proves pyrefly's type diagnostics flow into the problems panel
                return /python \(/.test(_problemsText()) &&
                    /undefined_name_here|not assignable/i.test(_problemsText());
            }, "python type diagnostic", 30000);
        }, 45000);

        it("should mark the python linting provider active (and cpp untouched by it)", async function () {
            const LSPClient = testWindow.brackets.getModule("languageTools/LSPClient");
            expect(LSPClient.isLintingProviderActive("python")).toBe(true);
            expect(LSPClient.isLintingProviderActive("cpp")).toBe(false);
        }, 45000);

        it("should show hover docs for a user-defined function", async function () {
            await _openFile("funcs.py");
            const editor = EditorManager.getActiveEditor();
            const lines = editor.document.getText().split("\n");
            const callLine = lines.findIndex(function (l) { return l.indexOf("print(compute_total") !== -1; });
            const pos = { line: callLine, ch: lines[callLine].indexOf("compute_total") + 3 };
            let hoverText = null;
            await awaitsFor(function () {
                return QuickViewManager._queryPreviewProviders(editor, pos, editor.getToken(pos))
                    .then(function (popover) {
                        if (popover && popover.content) {
                            hoverText = $(popover.content).text();
                        }
                    }).then(function () {
                        return hoverText && hoverText.indexOf("compute_total") !== -1;
                    });
            }, "hover docs for compute_total", 30000);
            expect(hoverText).toContain("compute_total");
        }, 45000);

        it("should jump to definition within the file", async function () {
            await _openFile("funcs.py");
            const editor = EditorManager.getActiveEditor();
            const lines = editor.document.getText().split("\n");
            const callLine = lines.findIndex(function (l) { return l.indexOf("print(compute_total") !== -1; });
            const defLine = lines.findIndex(function (l) { return l.indexOf("def compute_total") !== -1; });
            editor.setCursorPos({ line: callLine, ch: lines[callLine].indexOf("compute_total") + 3 });
            await awaitsForDone(CommandManager.execute(Commands.NAVIGATE_JUMPTO_DEFINITION));
            await awaitsFor(function () {
                return EditorManager.getActiveEditor().getCursorPos().line === defLine;
            }, "cursor to land on the definition", 30000);
        }, 45000);

        it("should offer pyrefly completions for a partial identifier", async function () {
            await _openFile("funcs.py");
            const editor = EditorManager.getActiveEditor();
            const lines = editor.document.getText().split("\n");
            const callLine = lines.findIndex(function (l) { return l.indexOf("print(compute_total") !== -1; });
            // cursor right after the "compute_" prefix inside the call - an explicit invocation
            // there must surface compute_total from the LSP hint provider
            editor.setCursorPos({ line: callLine, ch: lines[callLine].indexOf("compute_total") + 8 });
            const pyMain = await _pyModule("main");
            const provider = pyMain._getClient().codeHints;
            let hintTexts = null;
            await awaitsFor(function () {
                if (!provider.hasHints(editor, null)) {
                    return false;
                }
                const response = provider.getHints(null);
                if (!response) {
                    return false;
                }
                response.done(function (result) {
                    hintTexts = (result && result.hints || []).map(function ($item) {
                        return $item.text ? $item.text() : String($item);
                    });
                });
                return hintTexts && hintTexts.join("|").indexOf("compute_total") !== -1;
            }, "compute_total in pyrefly completions", 30000);
        }, 45000);

        it("should attach the server's quickfix with its title on unknown-name diagnostics", async function () {
            await _openFile("error.py");
            const pyMain = await _pyModule("main");
            const provider = pyMain._getClient().lintingProvider;
            const editor = EditorManager.getActiveEditor();
            const filePath = editor.document.file.fullPath;
            // quickfixes attach on an idle timer after diagnostics publish - poll the cached
            // inspection results for a fix on the `valu` typo (pyrefly's first action for
            // unknown-name is "Generate variable `valu`"; the title must ride along so the Fix
            // button can say what it does)
            let fix = null;
            await awaitsFor(function () {
                const results = provider.getInspectionResults(null, filePath);
                const errors = (results && results.errors) || [];
                const typo = errors.find(function (err) {
                    return err.message && err.message.indexOf("`valu`") !== -1;
                });
                fix = typo && typo.fix;
                return !!fix;
            }, "server quickfix on the `valu` diagnostic", 30000);
            expect(typeof fix.replaceText).toBe("string");
            expect(fix.title).toContain("valu");
        }, 45000);

        it("should format python through the standalone ruff Beautify provider", async function () {
            const Beautifier = await _pyModule("Beautifier");
            const ugly = "x=1\ndef f( a,b ):\n  return a+b\n";
            const result = await Beautifier.beautifyTextProvider(ugly, "scratch.py");
            expect(result.originalText).toBe(ugly);
            expect(result.changedText).toContain("x = 1");
            expect(result.changedText).toContain("def f(a, b):");
            expect(result.changedText).toContain("return a + b");
        }, 45000);

        it("should never auto-install in a test window", async function () {
            // opening .py fixtures in ANY integration suite must not trigger surprise downloads -
            // suites acquire the server explicitly through installNow() instead
            const ServerInstaller = await _pyModule("ServerInstaller");
            const result = await ServerInstaller.autoInstall();
            expect(result).toBe(null);
        }, 45000);
    });
});
