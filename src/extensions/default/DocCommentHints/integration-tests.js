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

    // Opener already present in each fixture; the test just parks the caret on it and asks for hints.
    const LANGS = [
        { file: "a.js",   line: 0, ch: 3, content: "/**\nfunction f(a, b) {\n}\n" },
        { file: "a.php",  line: 1, ch: 3, content: "<?php\n/**\nfunction f($a) {\n}\n" },
        { file: "A.java", line: 1, ch: 7, content: "class T {\n    /**\n    int f(int a) {\n    }\n}\n" },
        { file: "a.cpp",  line: 0, ch: 3, content: "/**\nint f(int a) {\n}\n" },
        { file: "a.py",   line: 1, ch: 7, content: 'def f(a):\n    """\n' }
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
            for (const lang of LANGS) {
                await jsPromise(SpecRunnerUtils.createTextFile(tempDir + "/" + lang.file, lang.content, FileSystem));
            }
            await SpecRunnerUtils.loadProjectInTestWindow(tempDir);
        }, 30000);

        afterAll(async function () {
            testWindow = $ = CommandManager = Commands = EditorManager = FileSystem = null;
            await SpecRunnerUtils.closeTestWindow();
        }, 30000);

        function docCommentHintVisible() {
            return $(".codehint-menu:visible li a").filter(function () {
                return $(this).find(".doc-comment-hint").length > 0;
            }).length > 0;
        }

        LANGS.forEach(function (lang) {
            it("shows the doc-comment hint popup for " + lang.file, async function () {
                await awaitsForDone(SpecRunnerUtils.openProjectFiles([lang.file]), "open " + lang.file);
                const editor = EditorManager.getActiveEditor();
                editor.setCursorPos(lang.line, lang.ch);
                CommandManager.execute(Commands.SHOW_CODE_HINTS);
                await awaitsFor(docCommentHintVisible,
                    "doc-comment hint popup for " + lang.file, 5000);
                expect(docCommentHintVisible()).toBe(true);
                // Dismiss the popup before the next file so sessions don't bleed across specs.
                const target = $(".codehint-menu:visible")[0] || testWindow.document.body;
                SpecRunnerUtils.simulateKeyEvent(27, "keydown", target);
            }, 15000);
        });
    });
});
