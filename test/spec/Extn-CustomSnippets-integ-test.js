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

/*global describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, awaitsForDone, awaitsFor */

define(function (require, exports, module) {

    const SpecRunnerUtils = require("spec/SpecRunnerUtils");

    describe("integration:Custom Snippets Code Hints", function () {

        const testPath = SpecRunnerUtils.getTestPath("/spec/CustomSnippets-test-files");

        let testWindow,
            brackets,
            $,
            EditorManager,
            CommandManager,
            Commands,
            FileViewController,
            CustomSnippetsGlobal,
            CustomSnippetsHelper,
            CustomSnippetsCursorManager,
            CustomSnippetsHandler;

        // Test snippets to inject for each test
        const TEST_SNIPPETS = [
            {
                abbreviation: "clg",
                description: "Console log",
                templateText: "console.log(${1});${0}",
                fileExtension: ".js, .ts"
            },
            {
                abbreviation: "clgall",
                description: "Console log for all files",
                templateText: "console.log(${1});${0}",
                fileExtension: "all"
            },
            {
                abbreviation: "fnn",
                description: "Arrow function",
                templateText: "const ${1} = (${2}) => {\n    ${3}\n};${0}",
                fileExtension: ".js, .ts"
            },
            {
                abbreviation: "pydef",
                description: "Python function def",
                templateText: "def ${1}(${2}):\n    ${3}",
                fileExtension: ".py"
            },
            {
                abbreviation: "divbox",
                description: "HTML div box",
                templateText: "<div class=\"${1}\">\n    ${2}\n</div>${0}",
                fileExtension: ".html"
            },
            {
                abbreviation: "notabs",
                description: "Snippet without tab stops",
                templateText: "no tabs here",
                fileExtension: "all"
            },
            {
                abbreviation: "clgdup",
                description: "Another clg variant",
                templateText: "console.log('debug:', ${1});${0}",
                fileExtension: ".js"
            }
        ];

        let savedSnippetsList = [];

        beforeAll(async function () {
            testWindow = await SpecRunnerUtils.createTestWindowAndRun();
            brackets = testWindow.brackets;
            $ = testWindow.$;
            EditorManager = brackets.test.EditorManager;
            CommandManager = brackets.test.CommandManager;
            Commands = brackets.test.Commands;
            FileViewController = brackets.test.FileViewController;

            // Wait for Custom Snippets extension to be loaded
            await awaitsFor(function () {
                return brackets.test.CustomSnippetsGlobal !== undefined;
            }, "Custom Snippets to be loaded", 10000);

            CustomSnippetsGlobal = brackets.test.CustomSnippetsGlobal;
            CustomSnippetsHelper = brackets.test.CustomSnippetsHelper;
            CustomSnippetsCursorManager = brackets.test.CustomSnippetsCursorManager;
            CustomSnippetsHandler = brackets.test.CustomSnippetsCodeHintHandler;

            // Wait for snippets to finish loading from storage
            await brackets.test._customSnippetsLoadedPromise;

            await SpecRunnerUtils.loadProjectInTestWindow(testPath);
        }, 60000);

        afterAll(async function () {
            testWindow = null;
            brackets = null;
            $ = null;
            EditorManager = null;
            CommandManager = null;
            Commands = null;
            FileViewController = null;
            CustomSnippetsGlobal = null;
            CustomSnippetsHelper = null;
            CustomSnippetsCursorManager = null;
            CustomSnippetsHandler = null;
            await SpecRunnerUtils.closeTestWindow();
        }, 30000);

        function setupTestSnippets() {
            savedSnippetsList = CustomSnippetsGlobal.SnippetHintsList.slice();
            CustomSnippetsGlobal.SnippetHintsList.length = 0;
            TEST_SNIPPETS.forEach(function (snippet) {
                CustomSnippetsGlobal.SnippetHintsList.push(Object.assign({}, snippet));
            });
            CustomSnippetsHelper.rebuildOptimizedStructures();
        }

        function restoreSnippets() {
            CustomSnippetsGlobal.SnippetHintsList.length = 0;
            savedSnippetsList.forEach(function (s) {
                CustomSnippetsGlobal.SnippetHintsList.push(s);
            });
            CustomSnippetsHelper.rebuildOptimizedStructures();
            savedSnippetsList = [];
        }

        async function openFile(fileName) {
            await awaitsForDone(
                FileViewController.openAndSelectDocument(
                    testPath + "/" + fileName,
                    FileViewController.PROJECT_MANAGER
                ),
                "open file: " + fileName
            );
        }

        async function closeAllFiles() {
            await awaitsForDone(
                CommandManager.execute(Commands.FILE_CLOSE_ALL, { _forceClose: true }),
                "closing all files"
            );
        }

        /**
         * Open a file and clear its content for a clean test
         */
        async function openCleanFile(fileName) {
            await openFile(fileName);
            const editor = EditorManager.getActiveEditor();
            editor.document.setText("");
            editor.setCursorPos({line: 0, ch: 0});
            return editor;
        }

        /**
         * Type text at the current cursor position
         */
        function typeAtCursor(editor, text) {
            const pos = editor.getCursorPos();
            editor.document.replaceRange(text, pos);
        }

        // ================================================================
        // Test Suite: Hint Availability (hasHints)
        // ================================================================
        describe("Hint Availability", function () {

            beforeEach(function () {
                setupTestSnippets();
            });

            afterEach(async function () {
                if (CustomSnippetsCursorManager.isInSnippetSession()) {
                    CustomSnippetsCursorManager.endSnippetSession();
                }
                restoreSnippets();
                await closeAllFiles();
            });

            it("should have hints when exact snippet abbreviation is typed in JS file", async function () {
                const editor = await openCleanFile("test.js");
                typeAtCursor(editor, "clg");

                expect(CustomSnippetsHandler.hasHints(editor, "g")).toBeTrue();
            });

            it("should NOT have hints when implicitChar is null (explicit invocation)", async function () {
                const editor = await openCleanFile("test.js");
                typeAtCursor(editor, "clg");

                expect(CustomSnippetsHandler.hasHints(editor, null)).toBeFalse();
            });

            it("should NOT have hints for non-matching text", async function () {
                const editor = await openCleanFile("test.js");
                typeAtCursor(editor, "xyzabc");

                expect(CustomSnippetsHandler.hasHints(editor, "c")).toBeFalse();
            });

            it("should NOT have hints when word before cursor is empty", async function () {
                const editor = await openCleanFile("test.js");

                expect(CustomSnippetsHandler.hasHints(editor, " ")).toBeFalse();
            });

            it("should NOT have hints for partial match only (no exact abbreviation match)", async function () {
                const editor = await openCleanFile("test.js");
                typeAtCursor(editor, "cl");

                expect(CustomSnippetsHandler.hasHints(editor, "l")).toBeFalse();
            });

            it("should have hints for case-insensitive abbreviation matching", async function () {
                const editor = await openCleanFile("test.js");
                typeAtCursor(editor, "CLG");

                expect(CustomSnippetsHandler.hasHints(editor, "G")).toBeTrue();
            });
        });

        // ================================================================
        // Test Suite: Hint Results (getHints)
        // ================================================================
        describe("Hint Results", function () {

            beforeEach(function () {
                setupTestSnippets();
            });

            afterEach(async function () {
                if (CustomSnippetsCursorManager.isInSnippetSession()) {
                    CustomSnippetsCursorManager.endSnippetSession();
                }
                restoreSnippets();
                await closeAllFiles();
            });

            it("should return hint objects with data-isCustomSnippet attribute", async function () {
                const editor = await openCleanFile("test.js");
                typeAtCursor(editor, "clg");

                const result = CustomSnippetsHandler.getHints(editor, "g");
                expect(result).toBeTruthy();
                expect(result.hints).toBeTruthy();
                expect(result.hints.length).toBeGreaterThan(0);

                const firstHint = result.hints[0];
                expect(firstHint.attr("data-isCustomSnippet")).toBe("true");
                expect(firstHint.attr("data-val")).toBe("clg");
            });

            it("should return hints with custom-snippets-hint CSS class", async function () {
                const editor = await openCleanFile("test.js");
                typeAtCursor(editor, "clg");

                const result = CustomSnippetsHandler.getHints(editor, "g");
                expect(result.hints[0].hasClass("custom-snippets-hint")).toBeTrue();
            });

            it("should return exact match as first hint when partial matches also exist", async function () {
                const editor = await openCleanFile("test.js");
                typeAtCursor(editor, "clg");

                const result = CustomSnippetsHandler.getHints(editor, "g");
                expect(result).toBeTruthy();
                // "clg" matches: clg (exact), clgall (prefix), clgdup (prefix)
                expect(result.hints.length).toBeGreaterThan(1);
                expect(result.hints[0].attr("data-val")).toBe("clg");

                const otherVals = result.hints.slice(1).map(function (h) {
                    return h.attr("data-val");
                });
                expect(otherVals).toContain("clgall");
                expect(otherVals).toContain("clgdup");
            });

            it("should show snippet indicator label in hint items", async function () {
                const editor = await openCleanFile("test.js");
                typeAtCursor(editor, "clg");

                const result = CustomSnippetsHandler.getHints(editor, "g");
                const snippetLabel = result.hints[0].find(".custom-snippet-code-hint");
                expect(snippetLabel.length).toBe(1);
            });

            it("should show description in hint when description is provided", async function () {
                const editor = await openCleanFile("test.js");
                typeAtCursor(editor, "clg");

                const result = CustomSnippetsHandler.getHints(editor, "g");
                const descElem = result.hints[0].find(".snippet-description");
                expect(descElem.length).toBe(1);
                expect(descElem.text()).toBe("Console log");
            });

            it("should return selectInitial true in hint response", async function () {
                const editor = await openCleanFile("test.js");
                typeAtCursor(editor, "clg");

                const result = CustomSnippetsHandler.getHints(editor, "g");
                expect(result.selectInitial).toBeTrue();
            });

            it("should return null when no exact abbreviation match exists", async function () {
                const editor = await openCleanFile("test.js");
                typeAtCursor(editor, "xyz");

                const result = CustomSnippetsHandler.getHints(editor, "z");
                expect(result).toBeNull();
            });

            it("should highlight matching characters in hint text", async function () {
                const editor = await openCleanFile("test.js");
                typeAtCursor(editor, "clg");

                const result = CustomSnippetsHandler.getHints(editor, "g");
                const matchedSpans = result.hints[0].find(".matched-hint");
                expect(matchedSpans.length).toBeGreaterThan(0);
            });
        });

        // ================================================================
        // Test Suite: Language Filtering
        // ================================================================
        describe("Language Filtering", function () {

            beforeEach(function () {
                setupTestSnippets();
            });

            afterEach(async function () {
                if (CustomSnippetsCursorManager.isInSnippetSession()) {
                    CustomSnippetsCursorManager.endSnippetSession();
                }
                restoreSnippets();
                await closeAllFiles();
            });

            it("should show JS-scoped snippet in JS file", async function () {
                const editor = await openCleanFile("test.js");
                typeAtCursor(editor, "clg");

                expect(CustomSnippetsHandler.hasHints(editor, "g")).toBeTrue();

                const result = CustomSnippetsHandler.getHints(editor, "g");
                const hintValues = result.hints.map(function (h) { return h.attr("data-val"); });
                expect(hintValues).toContain("clg");
            });

            it("should NOT show JS-scoped snippet in HTML file outside script tag", async function () {
                await openFile("test.html");
                const editor = EditorManager.getActiveEditor();
                // Line 3 is an empty line inside <body> but outside <script>
                editor.setCursorPos({line: 3, ch: 0});
                typeAtCursor(editor, "clg");

                expect(CustomSnippetsHandler.hasHints(editor, "g")).toBeFalse();
            });

            it("should show 'all' scoped snippet in JS file", async function () {
                const editor = await openCleanFile("test.js");
                typeAtCursor(editor, "clgall");

                expect(CustomSnippetsHandler.hasHints(editor, "l")).toBeTrue();
            });

            it("should show 'all' scoped snippet in HTML file", async function () {
                await openFile("test.html");
                const editor = EditorManager.getActiveEditor();
                editor.setCursorPos({line: 3, ch: 0});
                typeAtCursor(editor, "clgall");

                expect(CustomSnippetsHandler.hasHints(editor, "l")).toBeTrue();
            });

            it("should NOT show Python-scoped snippet in JS file", async function () {
                const editor = await openCleanFile("test.js");
                typeAtCursor(editor, "pydef");

                expect(CustomSnippetsHandler.hasHints(editor, "f")).toBeFalse();
            });

            it("should show HTML-scoped snippet in HTML file", async function () {
                await openFile("test.html");
                const editor = EditorManager.getActiveEditor();
                editor.setCursorPos({line: 3, ch: 0});
                typeAtCursor(editor, "divbox");

                expect(CustomSnippetsHandler.hasHints(editor, "x")).toBeTrue();
            });

            it("should NOT show HTML-scoped snippet in JS file", async function () {
                const editor = await openCleanFile("test.js");
                typeAtCursor(editor, "divbox");

                expect(CustomSnippetsHandler.hasHints(editor, "x")).toBeFalse();
            });

            it("should filter hints to only include snippets matching current language", async function () {
                const editor = await openCleanFile("test.js");
                typeAtCursor(editor, "clg");

                const result = CustomSnippetsHandler.getHints(editor, "g");
                expect(result).toBeTruthy();

                const hintValues = result.hints.map(function (h) { return h.attr("data-val"); });
                expect(hintValues).toContain("clg");      // .js, .ts
                expect(hintValues).toContain("clgall");   // all
                expect(hintValues).toContain("clgdup");   // .js
                expect(hintValues).not.toContain("pydef");
            });

            it("should show 'all' scoped snippet but not HTML-scoped snippet in JS file", async function () {
                const editor = await openCleanFile("test.js");
                typeAtCursor(editor, "divbox");

                // divbox is HTML-only, should not appear in JS context
                expect(CustomSnippetsHandler.hasHints(editor, "x")).toBeFalse();

                // clear and try 'all' scoped snippet
                editor.document.setText("");
                editor.setCursorPos({line: 0, ch: 0});
                typeAtCursor(editor, "notabs");

                // 'all' scoped snippet should appear everywhere
                expect(CustomSnippetsHandler.hasHints(editor, "s")).toBeTrue();
            });
        });

        // ================================================================
        // Test Suite: Hint Insertion
        // ================================================================
        describe("Hint Insertion", function () {

            beforeEach(function () {
                setupTestSnippets();
            });

            afterEach(async function () {
                if (CustomSnippetsCursorManager.isInSnippetSession()) {
                    CustomSnippetsCursorManager.endSnippetSession();
                }
                restoreSnippets();
                await closeAllFiles();
            });

            it("should insert simple snippet without tab stops", async function () {
                const editor = await openCleanFile("test.js");
                typeAtCursor(editor, "notabs");

                const result = CustomSnippetsHandler.getHints(editor, "s");
                expect(result).toBeTruthy();

                const noTabsHint = result.hints.find(function (h) {
                    return h.attr("data-val") === "notabs";
                });
                expect(noTabsHint).toBeTruthy();

                const handled = CustomSnippetsHandler.insertHint(noTabsHint);
                expect(handled).toBeTrue();

                const lineText = editor.document.getLine(0);
                expect(lineText).toBe("no tabs here");

                expect(CustomSnippetsCursorManager.isInSnippetSession()).toBeFalsy();
            });

            it("should insert snippet with tab stops and start snippet session", async function () {
                const editor = await openCleanFile("test.js");
                typeAtCursor(editor, "clg");

                const result = CustomSnippetsHandler.getHints(editor, "g");
                const clgHint = result.hints.find(function (h) {
                    return h.attr("data-val") === "clg";
                });

                const handled = CustomSnippetsHandler.insertHint(clgHint);
                expect(handled).toBeTrue();

                const lineText = editor.document.getLine(0);
                expect(lineText).toContain("console.log(");

                expect(CustomSnippetsCursorManager.isInSnippetSession()).toBeTrue();
            });

            it("should position cursor at first tab stop after insertion", async function () {
                const editor = await openCleanFile("test.js");
                typeAtCursor(editor, "clg");

                const result = CustomSnippetsHandler.getHints(editor, "g");
                const clgHint = result.hints.find(function (h) {
                    return h.attr("data-val") === "clg";
                });
                CustomSnippetsHandler.insertHint(clgHint);

                // After insertion of "console.log(${1});${0}"
                // cursor should be selecting ${1}
                const selection = editor.getSelection();
                const selectedText = editor.document.getRange(selection.start, selection.end);
                expect(selectedText).toBe("${1}");
            });

            it("should replace only the typed abbreviation text, preserving preceding text", async function () {
                const editor = await openCleanFile("test.js");
                typeAtCursor(editor, "let x = ");
                typeAtCursor(editor, "notabs");

                const result = CustomSnippetsHandler.getHints(editor, "s");
                const noTabsHint = result.hints.find(function (h) {
                    return h.attr("data-val") === "notabs";
                });
                CustomSnippetsHandler.insertHint(noTabsHint);

                const lineText = editor.document.getLine(0);
                expect(lineText).toBe("let x = no tabs here");
            });

            it("should return true from insertHint for custom snippet hints", async function () {
                const editor = await openCleanFile("test.js");
                typeAtCursor(editor, "clg");

                const result = CustomSnippetsHandler.getHints(editor, "g");
                const handled = CustomSnippetsHandler.insertHint(result.hints[0]);
                expect(handled).toBeTrue();
            });

            it("should return false from insertHint for non-custom-snippet hints", function () {
                const fakeHint = $("<span>").text("not a snippet");
                const handled = CustomSnippetsHandler.insertHint(fakeHint);
                expect(handled).toBeFalse();
            });

            it("should return false from insertHint for null hint", function () {
                const handled = CustomSnippetsHandler.insertHint(null);
                expect(handled).toBeFalse();
            });
        });

        // ================================================================
        // Test Suite: Tab Stop Navigation
        // ================================================================
        describe("Tab Stop Navigation", function () {

            beforeEach(function () {
                setupTestSnippets();
            });

            afterEach(async function () {
                if (CustomSnippetsCursorManager.isInSnippetSession()) {
                    CustomSnippetsCursorManager.endSnippetSession();
                }
                restoreSnippets();
                await closeAllFiles();
            });

            it("should navigate to next tab stop", async function () {
                const editor = await openCleanFile("test.js");
                typeAtCursor(editor, "fnn");

                const result = CustomSnippetsHandler.getHints(editor, "n");
                const fnnHint = result.hints.find(function (h) {
                    return h.attr("data-val") === "fnn";
                });
                CustomSnippetsHandler.insertHint(fnnHint);

                // Template: "const ${1} = (${2}) => {\n    ${3}\n};${0}"
                expect(CustomSnippetsCursorManager.isInSnippetSession()).toBeTrue();

                let selection = editor.getSelection();
                let selectedText = editor.document.getRange(selection.start, selection.end);
                expect(selectedText).toBe("${1}");

                // Navigate to ${2}
                CustomSnippetsCursorManager.navigateToNextTabStop();
                expect(CustomSnippetsCursorManager.isInSnippetSession()).toBeTrue();

                selection = editor.getSelection();
                selectedText = editor.document.getRange(selection.start, selection.end);
                expect(selectedText).toBe("${2}");
            });

            it("should navigate to previous tab stop", async function () {
                const editor = await openCleanFile("test.js");
                typeAtCursor(editor, "fnn");

                const result = CustomSnippetsHandler.getHints(editor, "n");
                const fnnHint = result.hints.find(function (h) {
                    return h.attr("data-val") === "fnn";
                });
                CustomSnippetsHandler.insertHint(fnnHint);

                // Navigate forward: ${1} -> ${2}
                CustomSnippetsCursorManager.navigateToNextTabStop();
                let selection = editor.getSelection();
                let selectedText = editor.document.getRange(selection.start, selection.end);
                expect(selectedText).toBe("${2}");

                // Navigate backward: ${2} -> ${1}
                CustomSnippetsCursorManager.navigateToPreviousTabStop();
                selection = editor.getSelection();
                selectedText = editor.document.getRange(selection.start, selection.end);
                expect(selectedText).toBe("${1}");
            });

            it("should navigate to ${0} (exit point) after all numbered tab stops", async function () {
                const editor = await openCleanFile("test.js");
                typeAtCursor(editor, "clg");

                const result = CustomSnippetsHandler.getHints(editor, "g");
                const clgHint = result.hints.find(function (h) {
                    return h.attr("data-val") === "clg";
                });
                CustomSnippetsHandler.insertHint(clgHint);

                // Template: "console.log(${1});${0}"
                let selection = editor.getSelection();
                let selectedText = editor.document.getRange(selection.start, selection.end);
                expect(selectedText).toBe("${1}");

                // Navigate to ${0}
                CustomSnippetsCursorManager.navigateToNextTabStop();
                selection = editor.getSelection();
                selectedText = editor.document.getRange(selection.start, selection.end);
                expect(selectedText).toBe("${0}");
            });

            it("should end snippet session after navigating past ${0}", async function () {
                const editor = await openCleanFile("test.js");
                typeAtCursor(editor, "clg");

                const result = CustomSnippetsHandler.getHints(editor, "g");
                const clgHint = result.hints.find(function (h) {
                    return h.attr("data-val") === "clg";
                });
                CustomSnippetsHandler.insertHint(clgHint);

                // Navigate: ${1} -> ${0}
                CustomSnippetsCursorManager.navigateToNextTabStop();
                expect(CustomSnippetsCursorManager.isInSnippetSession()).toBeTrue();

                // Navigate past ${0} - should end session
                CustomSnippetsCursorManager.navigateToNextTabStop();
                expect(CustomSnippetsCursorManager.isInSnippetSession()).toBeFalsy();
            });

            it("should end session and remove all tab stop placeholders on endSnippetSession", async function () {
                const editor = await openCleanFile("test.js");
                typeAtCursor(editor, "clg");

                const result = CustomSnippetsHandler.getHints(editor, "g");
                const clgHint = result.hints.find(function (h) {
                    return h.attr("data-val") === "clg";
                });
                CustomSnippetsHandler.insertHint(clgHint);
                expect(CustomSnippetsCursorManager.isInSnippetSession()).toBeTrue();

                CustomSnippetsCursorManager.endSnippetSession();
                expect(CustomSnippetsCursorManager.isInSnippetSession()).toBeFalsy();

                const fullText = editor.document.getText();
                expect(fullText).not.toContain("${1}");
                expect(fullText).not.toContain("${0}");
                expect(fullText.trim()).toBe("console.log();");
            });

            it("should navigate through all tab stops in correct order for multi-stop snippet", async function () {
                const editor = await openCleanFile("test.js");
                typeAtCursor(editor, "fnn");

                const result = CustomSnippetsHandler.getHints(editor, "n");
                const fnnHint = result.hints.find(function (h) {
                    return h.attr("data-val") === "fnn";
                });
                CustomSnippetsHandler.insertHint(fnnHint);

                // Template: "const ${1} = (${2}) => {\n    ${3}\n};${0}"
                // Verify full navigation order: ${1} -> ${2} -> ${3} -> ${0}

                let selection = editor.getSelection();
                let selectedText = editor.document.getRange(selection.start, selection.end);
                expect(selectedText).toBe("${1}");

                CustomSnippetsCursorManager.navigateToNextTabStop();
                selection = editor.getSelection();
                selectedText = editor.document.getRange(selection.start, selection.end);
                expect(selectedText).toBe("${2}");

                CustomSnippetsCursorManager.navigateToNextTabStop();
                selection = editor.getSelection();
                selectedText = editor.document.getRange(selection.start, selection.end);
                expect(selectedText).toBe("${3}");

                CustomSnippetsCursorManager.navigateToNextTabStop();
                selection = editor.getSelection();
                selectedText = editor.document.getRange(selection.start, selection.end);
                expect(selectedText).toBe("${0}");

                // Past ${0} - session ends
                CustomSnippetsCursorManager.navigateToNextTabStop();
                expect(CustomSnippetsCursorManager.isInSnippetSession()).toBeFalsy();
            });

            it("should remove all remaining tab stop placeholders when session ends early", async function () {
                const editor = await openCleanFile("test.js");
                typeAtCursor(editor, "fnn");

                const result = CustomSnippetsHandler.getHints(editor, "n");
                const fnnHint = result.hints.find(function (h) {
                    return h.attr("data-val") === "fnn";
                });
                CustomSnippetsHandler.insertHint(fnnHint);

                // End session early at ${1}
                CustomSnippetsCursorManager.endSnippetSession();

                const fullText = editor.document.getText();
                expect(fullText).not.toContain("${1}");
                expect(fullText).not.toContain("${2}");
                expect(fullText).not.toContain("${3}");
                expect(fullText).not.toContain("${0}");
            });

            it("should handle key event for Tab navigation", async function () {
                const editor = await openCleanFile("test.js");
                typeAtCursor(editor, "fnn");

                const result = CustomSnippetsHandler.getHints(editor, "n");
                const fnnHint = result.hints.find(function (h) {
                    return h.attr("data-val") === "fnn";
                });
                CustomSnippetsHandler.insertHint(fnnHint);

                let selection = editor.getSelection();
                let selectedText = editor.document.getRange(selection.start, selection.end);
                expect(selectedText).toBe("${1}");

                // Simulate Tab key via handleKeyEvent
                const KeyEvent = testWindow.require("utils/KeyEvent");
                let prevented = false;
                const fakeTabEvent = {
                    keyCode: KeyEvent.DOM_VK_TAB,
                    shiftKey: false,
                    preventDefault: function () { prevented = true; }
                };
                CustomSnippetsCursorManager.handleKeyEvent(null, editor, fakeTabEvent);

                selection = editor.getSelection();
                selectedText = editor.document.getRange(selection.start, selection.end);
                expect(selectedText).toBe("${2}");
                expect(prevented).toBeTrue();
            });

            it("should handle key event for Shift+Tab navigation", async function () {
                const editor = await openCleanFile("test.js");
                typeAtCursor(editor, "fnn");

                const result = CustomSnippetsHandler.getHints(editor, "n");
                const fnnHint = result.hints.find(function (h) {
                    return h.attr("data-val") === "fnn";
                });
                CustomSnippetsHandler.insertHint(fnnHint);

                // Navigate forward first: ${1} -> ${2}
                CustomSnippetsCursorManager.navigateToNextTabStop();

                const KeyEvent = testWindow.require("utils/KeyEvent");
                let prevented = false;
                const fakeShiftTabEvent = {
                    keyCode: KeyEvent.DOM_VK_TAB,
                    shiftKey: true,
                    preventDefault: function () { prevented = true; }
                };
                CustomSnippetsCursorManager.handleKeyEvent(null, editor, fakeShiftTabEvent);

                const selection = editor.getSelection();
                const selectedText = editor.document.getRange(selection.start, selection.end);
                expect(selectedText).toBe("${1}");
                expect(prevented).toBeTrue();
            });

            it("should handle key event for Escape to end session", async function () {
                const editor = await openCleanFile("test.js");
                typeAtCursor(editor, "clg");

                const result = CustomSnippetsHandler.getHints(editor, "g");
                const clgHint = result.hints.find(function (h) {
                    return h.attr("data-val") === "clg";
                });
                CustomSnippetsHandler.insertHint(clgHint);
                expect(CustomSnippetsCursorManager.isInSnippetSession()).toBeTrue();

                const KeyEvent = testWindow.require("utils/KeyEvent");
                let prevented = false;
                const fakeEscEvent = {
                    keyCode: KeyEvent.DOM_VK_ESCAPE,
                    shiftKey: false,
                    preventDefault: function () { prevented = true; }
                };
                CustomSnippetsCursorManager.handleKeyEvent(null, editor, fakeEscEvent);

                expect(CustomSnippetsCursorManager.isInSnippetSession()).toBeFalsy();
                expect(prevented).toBeTrue();

                const fullText = editor.document.getText();
                expect(fullText).not.toContain("${");
            });
        });

        // ================================================================
        // Test Suite: Multi-line Snippets
        // ================================================================
        describe("Multi-line Snippets", function () {

            beforeEach(function () {
                setupTestSnippets();
            });

            afterEach(async function () {
                if (CustomSnippetsCursorManager.isInSnippetSession()) {
                    CustomSnippetsCursorManager.endSnippetSession();
                }
                restoreSnippets();
                await closeAllFiles();
            });

            it("should insert multi-line snippet with correct line structure", async function () {
                const editor = await openCleanFile("test.js");
                typeAtCursor(editor, "fnn");

                const result = CustomSnippetsHandler.getHints(editor, "n");
                const fnnHint = result.hints.find(function (h) {
                    return h.attr("data-val") === "fnn";
                });
                CustomSnippetsHandler.insertHint(fnnHint);

                // Template: "const ${1} = (${2}) => {\n    ${3}\n};${0}"
                const line0 = editor.document.getLine(0);
                const line1 = editor.document.getLine(1);
                const line2 = editor.document.getLine(2);

                expect(line0).toContain("const ");
                expect(line0).toContain(" = (");
                expect(line0).toContain(") => {");
                expect(line1).toContain("    ");
                expect(line2).toContain("};");
            });

            it("should preserve base indentation for multi-line snippet on indented line", async function () {
                const editor = await openCleanFile("test.js");
                typeAtCursor(editor, "    fnn");

                const result = CustomSnippetsHandler.getHints(editor, "n");
                const fnnHint = result.hints.find(function (h) {
                    return h.attr("data-val") === "fnn";
                });
                CustomSnippetsHandler.insertHint(fnnHint);

                const line0 = editor.document.getLine(0);
                expect(line0.startsWith("    const ")).toBeTrue();

                // Second line should have base indent (4) + snippet indent (4) = 8 spaces
                const line1 = editor.document.getLine(1);
                expect(line1.startsWith("        ")).toBeTrue();

                // Third line should have base indent (4 spaces)
                const line2 = editor.document.getLine(2);
                expect(line2.startsWith("    ")).toBeTrue();
            });

            it("should handle tab stops across multiple lines", async function () {
                await openFile("test.html");
                const editor = EditorManager.getActiveEditor();
                editor.setCursorPos({line: 3, ch: 0});
                typeAtCursor(editor, "divbox");

                const result = CustomSnippetsHandler.getHints(editor, "x");
                const divHint = result.hints.find(function (h) {
                    return h.attr("data-val") === "divbox";
                });
                CustomSnippetsHandler.insertHint(divHint);

                // Template: "<div class=\"${1}\">\n    ${2}\n</div>${0}"
                let selection = editor.getSelection();
                let selectedText = editor.document.getRange(selection.start, selection.end);
                expect(selectedText).toBe("${1}");
                const firstLine = selection.start.line;

                // Navigate to ${2} (second line)
                CustomSnippetsCursorManager.navigateToNextTabStop();
                selection = editor.getSelection();
                selectedText = editor.document.getRange(selection.start, selection.end);
                expect(selectedText).toBe("${2}");
                expect(selection.start.line).toBeGreaterThan(firstLine);

                // Navigate to ${0} (third line)
                CustomSnippetsCursorManager.navigateToNextTabStop();
                selection = editor.getSelection();
                selectedText = editor.document.getRange(selection.start, selection.end);
                expect(selectedText).toBe("${0}");
            });
        });

        // ================================================================
        // Test Suite: Edge Cases
        // ================================================================
        describe("Edge Cases", function () {

            beforeEach(function () {
                setupTestSnippets();
            });

            afterEach(async function () {
                if (CustomSnippetsCursorManager.isInSnippetSession()) {
                    CustomSnippetsCursorManager.endSnippetSession();
                }
                restoreSnippets();
                await closeAllFiles();
            });

            it("should not crash when snippet list is empty", async function () {
                CustomSnippetsGlobal.SnippetHintsList.length = 0;
                CustomSnippetsHelper.rebuildOptimizedStructures();

                const editor = await openCleanFile("test.js");
                typeAtCursor(editor, "clg");

                expect(CustomSnippetsHandler.hasHints(editor, "g")).toBeFalse();
                expect(CustomSnippetsHandler.getHints(editor, "g")).toBeNull();
            });

            it("should handle snippet insertion at end of file", async function () {
                const editor = await openCleanFile("test.js");
                typeAtCursor(editor, "notabs");

                const result = CustomSnippetsHandler.getHints(editor, "s");
                const noTabsHint = result.hints.find(function (h) {
                    return h.attr("data-val") === "notabs";
                });
                const handled = CustomSnippetsHandler.insertHint(noTabsHint);
                expect(handled).toBeTrue();

                const lineText = editor.document.getLine(0);
                expect(lineText).toBe("no tabs here");
            });

            it("should handle inserting a snippet when text exists after the abbreviation", async function () {
                const editor = await openCleanFile("test.js");
                editor.document.replaceRange("notabs some trailing text", {line: 0, ch: 0});
                editor.setCursorPos({line: 0, ch: 6});

                const result = CustomSnippetsHandler.getHints(editor, "s");
                const noTabsHint = result.hints.find(function (h) {
                    return h.attr("data-val") === "notabs";
                });
                CustomSnippetsHandler.insertHint(noTabsHint);

                const lineText = editor.document.getLine(0);
                expect(lineText).toContain("no tabs here");
                expect(lineText).toContain("some trailing text");
            });

            it("should handle multiple consecutive snippet insertions", async function () {
                const editor = await openCleanFile("test.js");

                // First insertion
                typeAtCursor(editor, "notabs");

                let result = CustomSnippetsHandler.getHints(editor, "s");
                let hint = result.hints.find(function (h) {
                    return h.attr("data-val") === "notabs";
                });
                CustomSnippetsHandler.insertHint(hint);
                expect(editor.document.getLine(0)).toBe("no tabs here");

                // Move to next line and insert another snippet
                const curPos = editor.getCursorPos();
                editor.document.replaceRange("\n", curPos);
                editor.setCursorPos({line: 1, ch: 0});
                typeAtCursor(editor, "notabs");

                result = CustomSnippetsHandler.getHints(editor, "s");
                hint = result.hints.find(function (h) {
                    return h.attr("data-val") === "notabs";
                });
                CustomSnippetsHandler.insertHint(hint);
                expect(editor.document.getLine(1)).toBe("no tabs here");
            });

            it("should handle snippet with only ${0} tab stop", async function () {
                CustomSnippetsGlobal.SnippetHintsList.push({
                    abbreviation: "onlyzero",
                    description: "Only zero stop",
                    templateText: "result${0}end",
                    fileExtension: "all"
                });
                CustomSnippetsHelper.rebuildOptimizedStructures();

                const editor = await openCleanFile("test.js");
                typeAtCursor(editor, "onlyzero");

                const result = CustomSnippetsHandler.getHints(editor, "o");
                const hint = result.hints.find(function (h) {
                    return h.attr("data-val") === "onlyzero";
                });
                CustomSnippetsHandler.insertHint(hint);

                const lineText = editor.document.getLine(0);
                expect(lineText).toContain("result");
                expect(lineText).toContain("end");
            });
        });
    });
});
