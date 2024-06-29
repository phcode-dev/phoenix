/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 * Original work Copyright (c) 2012 - 2021 Adobe Systems Incorporated. All rights reserved.
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

/*global describe, it, expect, beforeAll, afterAll, awaitsForDone, awaitsForFail, awaits, awaitsFor */

define(function (require, exports, module) {
    // Recommended to avoid reloading the integration test window Phoenix instance for each test.

    const SpecRunnerUtils     = brackets.getModule("spec/SpecRunnerUtils"),
        StringUtils        = brackets.getModule("utils/StringUtils"),
        KeyEvent         = brackets.getModule("utils/KeyEvent");

    describe("integration:HTML Code Hints integration tests", function () {

        const testPath = SpecRunnerUtils.getTestPath("/spec/LiveDevelopment-MultiBrowser-test-files");

        let FileViewController,     // loaded from brackets.test
            ProjectManager,         // loaded from brackets.test;
            CommandManager,
            Commands,
            testWindow,
            EditorManager,
            MainViewManager,
            brackets,
            FileSystem,
            CSSUtils,
            $;


        beforeAll(async function () {
            testWindow = await SpecRunnerUtils.createTestWindowAndRun();
            brackets            = testWindow.brackets;
            $                   = testWindow.$;
            FileViewController  = brackets.test.FileViewController;
            ProjectManager      = brackets.test.ProjectManager;
            CommandManager      = brackets.test.CommandManager;
            Commands            = brackets.test.Commands;
            EditorManager       = brackets.test.EditorManager;
            MainViewManager     = brackets.test.MainViewManager;
            FileSystem          = brackets.test.FileSystem;
            CSSUtils          = brackets.test.CSSUtils;

            await SpecRunnerUtils.loadProjectInTestWindow(testPath);
        }, 30000);

        afterAll(async function () {
            FileViewController  = null;
            ProjectManager      = null;
            testWindow = null;
            CSSUtils = null;
            brackets = null;
            await SpecRunnerUtils.closeTestWindow();
        }, 30000);

        async function closeSession() {
            await awaitsForDone(CommandManager.execute(Commands.FILE_CLOSE_ALL, { _forceClose: true }),
                "closing all file");
        }

        async function openFile(fileNameInProject, workingSet) {
            await awaitsForDone(
                FileViewController.openAndSelectDocument(
                    testPath + "/" + fileNameInProject,
                    workingSet ? FileViewController.WORKING_SET_VIEW:FileViewController.PROJECT_MANAGER
                ));
        }

        it("Should jump to definition on div tag", async function () {
            await openFile("jumpToDef.html");
            const selected = ProjectManager.getSelectedItem();
            expect(selected.fullPath).toBe(testPath + "/jumpToDef.html");

            let editor = EditorManager.getActiveEditor();
            editor.setCursorPos({ line: 5, ch: 6 });

            await awaitsForDone(CommandManager.execute(Commands.NAVIGATE_JUMPTO_DEFINITION),
                "jump to def on div");

            editor = EditorManager.getFocusedInlineEditor();
            expect(editor.document.file.fullPath.endsWith("LiveDevelopment-MultiBrowser-test-files/simpleShared.css"))
                .toBeTrue();
            await closeSession();
        });

        it("Should jump to definition on css class", async function () {
            await openFile("jumpToDef.html");
            const selected = ProjectManager.getSelectedItem();
            expect(selected.fullPath).toBe(testPath + "/jumpToDef.html");

            let editor = EditorManager.getActiveEditor();
            editor.setCursorPos({ line: 6, ch: 23 });

            await awaitsForDone(CommandManager.execute(Commands.NAVIGATE_JUMPTO_DEFINITION),
                "jump to def on div");

            editor = EditorManager.getFocusedInlineEditor();
            expect(editor.document.file.fullPath.endsWith("LiveDevelopment-MultiBrowser-test-files/sub/test.css"))
                .toBeTrue();
            await closeSession();
        });

        async function verifySrcJumpToDef(location, targetFileName, jumpShouldFail) {
            await openFile("jumpToDef.html");
            const selected = ProjectManager.getSelectedItem();
            expect(selected.fullPath).toBe(testPath + "/jumpToDef.html");

            let editor = EditorManager.getActiveEditor();
            editor.setCursorPos(location);

            if(jumpShouldFail){
                await awaitsForFail(CommandManager.execute(Commands.NAVIGATE_JUMPTO_DEFINITION),
                    "jump to def on div");
            } else {
                await awaitsForDone(CommandManager.execute(Commands.NAVIGATE_JUMPTO_DEFINITION),
                    "jump to def on div");
            }

            let currentFile = MainViewManager.getCurrentlyViewedFile();
            expect(currentFile.fullPath.endsWith(targetFileName))
                .toBeTrue();
            await closeSession();
        }

        it("Should jump to files on href/src attributes", async function () {
            await verifySrcJumpToDef({ line: 3, ch: 44 }, "sub/test.css");
            await verifySrcJumpToDef({ line: 13, ch: 29 }, "blank.css");
            await verifySrcJumpToDef({ line: 11, ch: 32 }, "sub/icon_chevron.png");
            await closeSession();
        });

        it("Should not jump to files on non href/src attributes", async function () {
            await verifySrcJumpToDef({ line: 14, ch: 47 }, "jumpToDef.html", true);
            await verifySrcJumpToDef({ line: 7, ch: 20 }, "jumpToDef.html", true);
            await verifySrcJumpToDef({ line: 3, ch: 22 }, "jumpToDef.html", true);
            await closeSession();
        });

        async function _deleteFile(relativeFileName) {
            let deleted = false;
            FileSystem.getFileForPath(`${testPath}/${relativeFileName}`).unlink(()=>{
                deleted = true;
            });
            await awaitsFor(function () {
                return deleted;
            }, "extension interface registration notification");
        }

        async function createAndVerifyFileContents(fileName, firstLineOfContent) {
            await awaitsForDone(CommandManager.execute(Commands.FILE_NEW),
                "new file");
            await awaitsFor(function () {
                return !!$(".jstree-rename-input")[0];
            }, "input to come");
            let fileNameInput = $(".jstree-rename-input");
            expect(fileNameInput[0]).toBeDefined();
            await _deleteFile(fileName);
            fileNameInput.val(fileName);
            SpecRunnerUtils.simulateKeyEvent(KeyEvent.DOM_VK_RETURN, "keydown", fileNameInput[0]);

            await awaitsFor(function () {
                return !$(".jstree-rename-input")[0];
            }, "input to go away");
            await awaitsFor(function () {
                return !!EditorManager.getActiveEditor();
            }, "wait for editor to be active");
            expect(EditorManager.getActiveEditor().document.getText().split("\n")[0])
                .toBe(firstLineOfContent);
            await closeSession();
            await _deleteFile(fileName);
        }

        it("Should creating new html and xhtml file with template contents", async function () {
            await createAndVerifyFileContents("test1.html", "<!DOCTYPE html>");
            await createAndVerifyFileContents("test1.xhtml",
                "<!DOCTYPE html PUBLIC \"-//W3C//DTD XHTML 1.0 Strict//EN\" \"http://www.w3.org/TR/xhtm" +
                "l1/DTD/xhtml1-strict.dtd\">");
        });

        it("Should not put template contents for non html files creation", async function () {
            await createAndVerifyFileContents("test1.txt", "");
        });

        async function _validateCodeHints(cursor, expectedSomeHintsArray, selectItemNumber) {
            let editor = EditorManager.getActiveEditor();
            editor.setCursorPos(cursor);

            await awaitsForDone(CommandManager.execute(Commands.SHOW_CODE_HINTS),
                "show code hints");

            await awaitsFor(async function () {
                for(let hint of expectedSomeHintsArray){
                    const allSelectors = await CSSUtils.getAllCssSelectorsInProject();
                    if(!allSelectors.includes("."+hint)){
                        return false;
                    }
                }
                return true;
            }, "CSSUtils project selectors to be updated");

            await awaitsFor(function () {
                return $(".codehint-menu").is(":visible");
            }, "codehints to be shown");

            await awaitsFor(function () {
                for(let hint of expectedSomeHintsArray){
                    if(!$(".codehint-menu").text().includes(hint)){
                        return false;
                    }
                }
                return true;
            }, "expected hints to be there");

            if(selectItemNumber >= 0) {
                $(".code-hints-list-item")[selectItemNumber].click();
                return;
            }

            SpecRunnerUtils.simulateKeyEvent(KeyEvent.DOM_VK_ESCAPE, "keydown", testWindow.document.body);
            await awaitsFor(function () {
                return !$(".codehint-menu").is(":visible");
            }, "codehints to be hidden");
        }

        it("Should show css class hints in html file", async function () {
            await openFile("jumpToDef.html", true);
            await _validateCodeHints({ line: 9, ch: 21 }, ["testClass"]);
            await closeSession();
        });

        it("should show inline styles in html document", async function () {
            await openFile("htmlOther/inlineStyle.html", true);
            await _validateCodeHints({ line: 12, ch: 19 }, ["integratedStyle"]);
            await closeSession();
        });

        function setText(cursor, text) {
            let editor = EditorManager.getActiveEditor();
            editor.replaceRange(text, cursor);
        }

        it("should inline css class hint in unsaved html inline styles", async function () {
            await openFile("htmlOther/inlineStyle.html", true);
            setText({ line: 8, ch: 11 }, ".newInlineStyleYo{}");
            await _validateCodeHints({ line: 12, ch: 19 }, ["newInlineStyleYo"]);
            await closeSession();
        });

        async function _validateCssEdit(cssFileName) {
            await openFile("htmlOther/inlineStyle.html", true);
            await openFile(cssFileName, true);
            const cssClassName = StringUtils.randomString(5, "cls");
            setText({ line: 0, ch: 0 }, `.${cssClassName}{}\n`);

            await openFile("htmlOther/inlineStyle.html", true);
            await _validateCodeHints({ line: 12, ch: 16 }, [cssClassName]);
            await closeSession();
        }

        it("should CSS file edits show up in class list without saving", async function () {
            await _validateCssEdit("cssLive.css");
        });

        it("should LESS file edits show up in class list without saving", async function () {
            await _validateCssEdit("cssLive1.less");
        });

        it("should SCSS file edits show up in class list without saving", async function () {
            await _validateCssEdit("cssLive1.scss");
        });

        it("should get external https css style sheet", async function () {
            await openFile("htmlOther/externalStyle.html", true);
            await awaitsFor(async function () {
                const allSelectors = await CSSUtils.getAllCssSelectorsInProject();
                // the devicon.min.css fails to load sometimes in github actions and may fail erratically. so
                // added one more css link and only one needs to pass for this test.
                return allSelectors.includes(".devicon-aarch64-original-wordmark") ||
                    allSelectors.includes(".night");
            }, "external style sheet hints to be loaded");
        });

        async function _testCssClassHintInFile(htmlLikeFile) {
            await openFile(htmlLikeFile, true);
            await openFile("cssLive.css", true);
            // this prefix is aaa as we need it as the top code hint
            const cssClassName = StringUtils.randomString(5, "aaaaaaaaaaa");
            setText({ line: 0, ch: 0 }, `.${cssClassName}{}\n`);

            await openFile(htmlLikeFile, true);
            setText({ line: 12, ch: 31 }, ` `);
            await _validateCodeHints({ line: 12, ch: 32 }, [cssClassName], 0);
            expect(EditorManager.getActiveEditor().getToken().string).toBe(`"integratedStyle ${cssClassName}"`);
            await closeSession();
        }

        const extensions = ["html", "htm", "xhtml", "php", "asp", "aspx", "jsp", "shtml"];

        for(let extn of extensions){
            it(`should be able to add the class name by selecting the code hint in ${extn} file`, async function () {
                await _testCssClassHintInFile(`htmlOther/inlineStyle.${extn}`);
            });
        }
    });
});
