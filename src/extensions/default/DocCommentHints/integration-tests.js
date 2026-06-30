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

/*global describe, it, expect, beforeAll, afterAll, awaitsForDone, awaitsFor, jsPromise */

define(function (require, exports, module) {
    const SpecRunnerUtils = brackets.getModule("spec/SpecRunnerUtils");

    // Each fixture already contains the opener; the test parks the caret on it, asks for hints,
    // accepts the hint, and asserts the real doc comment that lands in the document - including the
    // types extracted from the TS signature.
    const CASES = [
        { file: "a.js", line: 0, ch: 3, content: "/**\nfunction add(a, b) {\n}\n",
            expect: ["@param {*} a", "@param {*} b", "@returns {*}"] },
        // TypeScript: names only - the types live in the signature, so a JSDoc {type} would be
        // redundant and TS would flag it ("JSDoc types may be moved to TypeScript types").
        { file: "b.ts", line: 0, ch: 3, content: "/**\nfunction add(a: number, b: number): number {\n}\n",
            expect: ["@param a", "@param b", "@returns"], absent: ["@param {", "{number}"] },
        { file: "c.ts", line: 0, ch: 3,
            content: "/**\nfunction run(items: T[], cb: (x: T) => void): Promise<number> {\n}\n",
            expect: ["@param items", "@param cb", "@returns"], absent: ["@param {", "{T[]}", "{*}"] },
        { file: "a.php", line: 1, ch: 3, content: "<?php\n/**\nfunction f($a) {\n}\n",
            expect: ["@param mixed $a", "@return mixed"] },
        { file: "A.java", line: 1, ch: 7, content: "class T {\n    /**\n    int f(int a) {\n    }\n}\n",
            expect: ["@param a", "@return"] },
        { file: "a.cpp", line: 0, ch: 3, content: "/**\nint f(int a) {\n}\n",
            expect: ["@param a", "@return"] },
        { file: "a.py", line: 1, ch: 7, content: 'def f(a):\n    """\n',
            expect: ['"""', "Args:", "a:"] }
    ];

    describe("integration:DocCommentHints", function () {
        let testWindow, $, CommandManager, Commands, EditorManager, FileSystem, tempDir;

        beforeAll(async function () {
            testWindow = await SpecRunnerUtils.createTestWindowAndRun();
            $ = testWindow.$;
            CommandManager = testWindow.brackets.test.CommandManager;
            Commands = testWindow.brackets.test.Commands;
            EditorManager = testWindow.brackets.test.EditorManager;
            FileSystem = testWindow.brackets.test.FileSystem;

            tempDir = await SpecRunnerUtils.getTempDirectory();
            await SpecRunnerUtils.ensureExistsDirAsync(tempDir);
            for (const tc of CASES) {
                await jsPromise(SpecRunnerUtils.createTextFile(tempDir + "/" + tc.file, tc.content, FileSystem));
            }
            await SpecRunnerUtils.loadProjectInTestWindow(tempDir);
        }, 30000);

        afterAll(async function () {
            testWindow = $ = CommandManager = Commands = EditorManager = FileSystem = null;
            await SpecRunnerUtils.closeTestWindow();
        }, 30000);

        function $docHint() {
            return $(".codehint-menu:visible li a").filter(function () {
                return $(this).find(".doc-comment-hint").length > 0;
            });
        }

        CASES.forEach(function (tc) {
            it("shows the popup and inserts the right doc comment for " + tc.file, async function () {
                await awaitsForDone(SpecRunnerUtils.openProjectFiles([tc.file]), "open " + tc.file);
                const editor = EditorManager.getActiveEditor();
                editor.setCursorPos(tc.line, tc.ch);
                CommandManager.execute(Commands.SHOW_CODE_HINTS);

                // 1) the code-hints popup appears with our hint
                await awaitsFor(function () { return $docHint().length > 0; },
                    "doc-comment hint popup for " + tc.file, 5000);

                // 2) accepting it inserts that language's doc-comment convention
                const $a = $docHint();
                $a.first().trigger("mousedown");
                $a.first().trigger("click");
                await awaitsFor(function () {
                    const text = editor.document.getText();
                    return tc.expect.every(function (frag) { return text.indexOf(frag) !== -1; });
                }, "inserted doc comment for " + tc.file, 5000);

                const text = editor.document.getText();
                tc.expect.forEach(function (frag) { expect(text.indexOf(frag) !== -1).toBe(true); });
                (tc.absent || []).forEach(function (frag) { expect(text.indexOf(frag)).toBe(-1); });
            }, 15000);
        });
    });
});
