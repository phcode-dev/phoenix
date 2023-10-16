/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 * Original work Copyright (c) 2013 - 2021 Adobe Systems Incorporated. All rights reserved.
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

/*global describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, awaitsFor, awaitsForDone */

define(function (require, exports, module) {


    // Modules from the SpecRunner window
    var MasterDocumentManager     = brackets.getModule("document/DocumentManager"),
        MasterMainViewManager     = brackets.getModule("view/MainViewManager"),
        FileUtils                 = brackets.getModule("file/FileUtils"),
        SpecRunnerUtils           = brackets.getModule("spec/SpecRunnerUtils"),
        UrlCodeHints              = require("main");


    describe("LegacyInteg:Url Code Hinting", function () {

        var extensionTestPath   = SpecRunnerUtils.getTestPath("/spec/extn-urlcodehints-testfiles/"),
            testHtmlPath    = extensionTestPath + "testfiles/test.html",
            testCssPath     = extensionTestPath + "testfiles/subfolder/test.css",
            testScssPath    = extensionTestPath + "testfiles/subfolder/test.scss",
            testDocument,
            testEditor,
            hintsObj;

        // IMPORTANT: By default, Mac sorts folder contents differently from other OS's,
        // so the files and folders in the "testfiles" and "subfolder" folder are named
        // strategically so that they sort the same on all OS's (i.e. folders are listed
        // first, and then files), but this is not true for UrlCodeHints folder.
        var testfilesDirHints       = [ "subfolder/", "test.html"],
            subfolderDirHints       = [ "chevron.png", "test.css", "test.js", "test.scss"],
            UrlCodeHintsDirHintsMac = [ "../testfiles/"],
            UrlCodeHintsDirHints    = [ "../testfiles/"];

        /**
         * Returns an Editor suitable for use in isolation, given a Document.
         *
         * @param {Document} doc - the document to be contained by the new Editor
         * @return {Editor} - the mock editor object
         */
        function createMockEditor(doc) {
            return SpecRunnerUtils.createMockEditorForDocument(doc);
        }

        async function setupTests(testFilePath) {
            MasterDocumentManager.getDocumentForPath(testFilePath).done(function (doc) {
                testDocument = doc;
            });

            await awaitsFor(function () {
                return (testDocument);
            }, "Unable to open test document");

            // create Editor instance (containing a CodeMirror instance)
            testEditor = createMockEditor(testDocument);
            MasterMainViewManager._edit(MasterMainViewManager.ACTIVE_PANE, testDocument);
        }

        function tearDownTests() {
            // The following call ensures that the document is reloaded
            // from disk before each test
            MasterMainViewManager._closeAll(MasterMainViewManager.ALL_PANES);
            if(testDocument){
                SpecRunnerUtils.destroyMockEditor(testDocument);
            }
            testEditor = null;
            testDocument = null;
            hintsObj = null;
        }

        // Helper method to ask provider for hints at current cursor position.
        // Provider returns either an array of hints, or a deferred promise.
        // If a promise is returned, wait for it to resolve.
        //
        // Since this may be async, it cannot return the hints list, so it depends
        // on the hintsObj variable (with module scope) to exist.
        async function expectAsyncHints(provider) {
            expect(provider.hasHints(testEditor, null)).toBe(true);
            hintsObj = provider.getHints();
            expect(hintsObj).toBeTruthy();

            if (hintsObj instanceof Object && hintsObj.hasOwnProperty("done")) {
                hintsObj.done(function (resolvedHintsObj) {
                    hintsObj = resolvedHintsObj;
                });
            }

            await awaitsFor(function () {
                return (!hintsObj || hintsObj.hints);
            }, "Unable to resolve hints");
        }

        // Ask provider for hints at current cursor position; expect it NOT to return any
        function expectNoHints(provider) {
            expect(provider.hasHints(testEditor, null)).toBeFalsy();
        }

        // Expect hintList to contain folder and file names.
        function verifyUrlHints(hintList, expectedHints) {
            expect(hintList).toEqual(expectedHints);
        }

        // Helper functions for testing cursor position / selection range
        function fixPos(pos) {
            if (!("sticky" in pos)) {
                pos.sticky = null;
            }
            return pos;
        }

        describe("HTML Url Code Hints", function () {

            beforeAll(async function () {
                await setupTests(testHtmlPath);
            });

            afterAll(function () {
                tearDownTests();
            });

            it("should hint for href attribute", async function () {
                testEditor.setCursorPos({ line: 14, ch: 12 });

                // Must reset hintsObj before every call to await expectAsyncHints()
                hintsObj = null;
                await expectAsyncHints(UrlCodeHints.hintProvider);

                verifyUrlHints(hintsObj.hints, testfilesDirHints);
            });

            it("should hint for src attribute", async function () {
                testEditor.setCursorPos({ line: 15, ch: 13 });
                hintsObj = null;
                await expectAsyncHints(UrlCodeHints.hintProvider);

                verifyUrlHints(hintsObj.hints, testfilesDirHints);
            });

            it("should hint for poster attribute", async function () {
                testEditor.setCursorPos({ line: 24, ch: 17 });
                hintsObj = null;
                await expectAsyncHints(UrlCodeHints.hintProvider);

                verifyUrlHints(hintsObj.hints, testfilesDirHints);
            });

            it("should not hint for type attribute", async function () {
                testEditor.setCursorPos({ line: 15, ch: 21 });
                expectNoHints(UrlCodeHints.hintProvider);
            });

            it("should not hint in query part of url", async function () {
                testEditor.setCursorPos({ line: 20, ch: 31 });
                expectNoHints(UrlCodeHints.hintProvider);
            });

            it("should hint up 1 folder for '../'", async function () {
                testEditor.setCursorPos({ line: 21, ch: 14 });
                hintsObj = null;
                await expectAsyncHints(UrlCodeHints.hintProvider);

                var expectedHints = (brackets.platform !== "win") ? UrlCodeHintsDirHintsMac : UrlCodeHintsDirHints;
                verifyUrlHints(hintsObj.hints, expectedHints);
            });
        });

        describe("CSS Url Code Hints", function () {

            beforeAll(async function () {
                await setupTests(testHtmlPath);
            });

            afterAll(function () {
                tearDownTests();
            });

            it("should hint for @import url()", async function () {
                testEditor.setCursorPos({ line: 4, ch: 12 });
                hintsObj = null;
                await expectAsyncHints(UrlCodeHints.hintProvider);

                verifyUrlHints(hintsObj.hints, testfilesDirHints);
            });

            it("should hint for background-image: url()", async function () {
                testEditor.setCursorPos({ line: 6, ch: 24 });
                hintsObj = null;
                await expectAsyncHints(UrlCodeHints.hintProvider);

                verifyUrlHints(hintsObj.hints, testfilesDirHints);
            });

            it("should hint for border-image: url('')", async function () {
                testEditor.setCursorPos({ line: 7, ch: 21 });
                hintsObj = null;
                await expectAsyncHints(UrlCodeHints.hintProvider);

                verifyUrlHints(hintsObj.hints, testfilesDirHints);
            });

            it("should hint for list-style-image: url(\"\")", async function () {
                testEditor.setCursorPos({ line: 8, ch: 25 });
                hintsObj = null;
                await expectAsyncHints(UrlCodeHints.hintProvider);

                verifyUrlHints(hintsObj.hints, testfilesDirHints);
            });

            it("should not hint for @import outside of url()", async function () {
                testEditor.setCursorPos({ line: 4, ch: 15 });
                expectNoHints(UrlCodeHints.hintProvider);
            });

            it("should not hint for background-image outside of url()", async function () {
                testEditor.setCursorPos({ line: 11, ch: 20 });
                expectNoHints(UrlCodeHints.hintProvider);
            });
        });

        describe("Url Code Hints in a subfolder", function () {

            afterEach(function () {
                tearDownTests();
            });

            it("should hint for background-image: url() in CSS", async function () {
                await setupTests(testCssPath);

                testEditor.setCursorPos({ line: 3, ch: 26 });
                hintsObj = null;
                await expectAsyncHints(UrlCodeHints.hintProvider);

                verifyUrlHints(hintsObj.hints, subfolderDirHints);
            });

            it("should hint for background-image: url() in SCSS", async function () {
                await setupTests(testScssPath);

                testEditor.setCursorPos({ line: 4, ch: 34 });
                hintsObj = null;
                await expectAsyncHints(UrlCodeHints.hintProvider);

                verifyUrlHints(hintsObj.hints, subfolderDirHints);
            });
        });

        describe("Project root relative Url Code Hints", function () {

            var testWindow,
                brackets,
                workingSet = [],
                CodeHintManager,
                CommandManager,
                Commands,
                DocumentManager,
                MainViewManager,
                EditorManager;

            it("should hint site root '/'", async function () {
                testWindow = await SpecRunnerUtils.createTestWindowAndRun();
                brackets        = testWindow.brackets;
                CodeHintManager = brackets.test.CodeHintManager;
                CommandManager  = brackets.test.CommandManager;
                Commands        = brackets.test.Commands;
                DocumentManager = brackets.test.DocumentManager;
                EditorManager   = brackets.test.EditorManager;
                MainViewManager = brackets.test.MainViewManager;

                await SpecRunnerUtils.loadProjectInTestWindow(extensionTestPath);

                workingSet.push(testHtmlPath);
                await awaitsForDone(SpecRunnerUtils.openProjectFiles(workingSet), "openProjectFiles");

                DocumentManager.getDocumentForPath(testHtmlPath).done(function (doc) {
                    testDocument = doc;
                });

                await awaitsFor(function () {
                    return (testDocument);
                }, "Unable to open test document");

                MainViewManager._edit(MainViewManager.ACTIVE_PANE, testDocument);
                testEditor = EditorManager.getCurrentFullEditor();
                testEditor.setCursorPos({ line: 22, ch: 12 });
                CommandManager.execute(Commands.SHOW_CODE_HINTS);

                let hintList = CodeHintManager._getCodeHintList();
                await awaitsFor(function () {
                    hintList = CodeHintManager._getCodeHintList();
                    return hintList.hints.includes("/testfiles/");
                }, "waiting for code hints to be there", 5000);
                expect(hintList).toBeTruthy();
                expect(hintList.hints).toBeTruthy();
                expect(hintList.hints).toContain("/testfiles/");

                // cleanup
                testEditor       = null;
                testDocument     = null;
                testWindow       = null;
                brackets         = null;
                CodeHintManager  = null;
                CommandManager   = null;
                Commands         = null;
                DocumentManager  = null;
                EditorManager    = null;
                MainViewManager  = null;
                await SpecRunnerUtils.closeTestWindow();
            }, 30000);
        });

        describe("Url Insertion", function () {

            // These tests edit doc, so we need to setup/tear-down for each test
            beforeEach(async function () {
                await setupTests(testHtmlPath);
            });

            afterEach(function () {
                tearDownTests();
            });

            it("should handle unclosed url(", async function () {
                var pos1    = { line: 11, ch: 20 },
                    pos2    = { line: 11, ch: 24 },
                    pos3    = { line: 11, ch: 34 };

                testEditor.setCursorPos(pos1);
                testDocument.replaceRange("url(", pos1, pos1);
                testEditor.setCursorPos(pos2);
                hintsObj = null;
                await expectAsyncHints(UrlCodeHints.hintProvider);

                expect(hintsObj).toBeTruthy();
                expect(hintsObj.hints).toBeTruthy();
                expect(hintsObj.hints.length).toBe(2);
                expect(hintsObj.hints[1]).toBe("test.html");
                expect(UrlCodeHints.hintProvider.insertHint(hintsObj.hints[1])).toBe(false);

                // hint was added with closing paren
                expect(testDocument.getRange(pos1, pos3)).toEqual("url(test.html)");

                // Cursor was moved past closing paren
                expect(fixPos(testEditor.getCursorPos())).toEql(fixPos(pos3));
            });

            it("should handle unclosed url( with unclosed single-quote", async function () {
                var pos1    = { line: 11, ch: 20 },
                    pos2    = { line: 11, ch: 25 },
                    pos3    = { line: 11, ch: 36 };

                testEditor.setCursorPos(pos1);
                testDocument.replaceRange("url('", pos1, pos1);
                testEditor.setCursorPos(pos2);
                hintsObj = null;
                await expectAsyncHints(UrlCodeHints.hintProvider);

                expect(hintsObj).toBeTruthy();
                expect(hintsObj.hints).toBeTruthy();
                expect(hintsObj.hints.length).toBe(2);
                expect(hintsObj.hints[1]).toBe("test.html");

                // False indicates hints were closed after insertion
                expect(UrlCodeHints.hintProvider.insertHint(hintsObj.hints[1])).toBe(false);

                // Hint was added with closing single-quote and closing paren
                expect(testDocument.getRange(pos1, pos3)).toEql("url('test.html')");

                // Cursor was moved past closing single-quote and closing paren
                expect(fixPos(testEditor.getCursorPos())).toEql(fixPos(pos3));
            });

            it("should keep hints open after inserting folder in HTML", async function () {
                var pos1    = { line: 18, ch: 12 },
                    pos2    = { line: 18, ch: 22 },
                    pos3    = { line: 18, ch: 33 },
                    pos4    = { line: 18, ch: 34 };

                testEditor.setCursorPos(pos1);
                hintsObj = null;
                await expectAsyncHints(UrlCodeHints.hintProvider);

                expect(hintsObj).toBeTruthy();
                expect(hintsObj.hints).toBeTruthy();
                expect(hintsObj.hints.length).toBe(2);
                expect(hintsObj.hints[0]).toBe("subfolder/");

                // True indicates hints were remain open after insertion of folder
                // (i.e. showing contents of inserted folder)
                expect(UrlCodeHints.hintProvider.insertHint(hintsObj.hints[0])).toBe(true);

                // Hint was added with closing double-quote and closing paren
                expect(testDocument.getRange(pos1, pos2)).toEqual("subfolder/");

                // Cursor remains inside quote
                expect(fixPos(testEditor.getCursorPos())).toEql(fixPos(pos2));

                // Get hints of inserted folder
                hintsObj = null;
                await expectAsyncHints(UrlCodeHints.hintProvider);

                expect(hintsObj).toBeTruthy();
                expect(hintsObj.hints).toBeTruthy();
                expect(hintsObj.hints.length).toBe(subfolderDirHints.length);

                // Complete path is displayed
                expect(hintsObj.hints[0]).toBe("subfolder/chevron.png");

                // False indicates hints were closed after insertion
                expect(UrlCodeHints.hintProvider.insertHint(hintsObj.hints[0])).toBe(false);

                // Hint was added
                expect(testDocument.getRange(pos1, pos3)).toEqual("subfolder/chevron.png");

                // Cursor was moved past closing double-quote and closing paren
                expect(fixPos(testEditor.getCursorPos())).toEql(fixPos(pos4));
            });

            it("should keep hints open after inserting folder in CSS", async function () {
                var pos1    = { line: 11, ch: 20 },
                    pos2    = { line: 11, ch: 25 },
                    pos3    = { line: 11, ch: 35 },
                    pos4    = { line: 11, ch: 37 },
                    pos5    = { line: 11, ch: 48 };

                testEditor.setCursorPos(pos1);
                testDocument.replaceRange('url("', pos1, pos1);
                testEditor.setCursorPos(pos2);
                hintsObj = null;
                await expectAsyncHints(UrlCodeHints.hintProvider);

                expect(hintsObj).toBeTruthy();
                expect(hintsObj.hints).toBeTruthy();
                expect(hintsObj.hints.length).toBe(2);
                expect(hintsObj.hints[0]).toBe("subfolder/");

                // True indicates hints were remain open after insertion of folder
                // (i.e. showing contents of inserted folder)
                expect(UrlCodeHints.hintProvider.insertHint(hintsObj.hints[0])).toBe(true);

                // Hint was added with closing double-quote and closing paren
                expect(testDocument.getRange(pos1, pos4)).toEqual('url("subfolder/")');

                // Cursor remains inside double-quote and closing paren
                expect(fixPos(testEditor.getCursorPos())).toEql(fixPos(pos3));

                // Get hints of inserted folder
                hintsObj = null;
                await expectAsyncHints(UrlCodeHints.hintProvider);

                expect(hintsObj).toBeTruthy();
                expect(hintsObj.hints).toBeTruthy();
                expect(hintsObj.hints.length).toBe(subfolderDirHints.length);

                // Complete path is displayed
                expect(hintsObj.hints[0]).toBe("subfolder/chevron.png");

                // False indicates hints were closed after insertion
                expect(UrlCodeHints.hintProvider.insertHint(hintsObj.hints[0])).toBe(false);

                // Hint was added
                expect(testDocument.getRange(pos1, pos5)).toEqual('url("subfolder/chevron.png")');

                // Cursor was moved past closing double-quote and closing paren
                expect(fixPos(testEditor.getCursorPos())).toEql(fixPos(pos5));
            });

            it("should insert folder and replace file in HTML", async function () {
                var pos1    = { line: 23, ch: 11 },
                    pos2    = { line: 23, ch: 21 },
                    pos3    = { line: 23, ch: 31 },
                    pos4    = { line: 23, ch: 32 };

                testEditor.setCursorPos(pos1);
                hintsObj = null;
                await expectAsyncHints(UrlCodeHints.hintProvider);

                expect(hintsObj).toBeTruthy();
                expect(hintsObj.hints).toBeTruthy();
                expect(hintsObj.hints.length).toBe(2);
                expect(hintsObj.hints[0]).toBe("subfolder/");

                // True indicates hints were remain open after insertion of folder
                // (i.e. showing contents of inserted folder)
                expect(UrlCodeHints.hintProvider.insertHint(hintsObj.hints[0])).toBe(true);

                // Folder was inserted (i.e. filename was not removed)
                expect(testDocument.getRange(pos1, pos3)).toEqual("subfolder/test2.html");

                // Cursor is at end of inserted folder
                expect(fixPos(testEditor.getCursorPos())).toEql(fixPos(pos2));

                // Get hints of inserted folder
                hintsObj = null;
                await expectAsyncHints(UrlCodeHints.hintProvider);

                expect(hintsObj).toBeTruthy();
                expect(hintsObj.hints).toBeTruthy();
                expect(hintsObj.hints.length).toBe(subfolderDirHints.length);

                // Complete path is displayed
                expect(hintsObj.hints[0]).toBe("subfolder/chevron.png");

                // False indicates hints were closed after insertion
                expect(UrlCodeHints.hintProvider.insertHint(hintsObj.hints[0])).toBe(false);

                // Filename was replaced
                expect(testDocument.getRange(pos1, pos4)).toEqual("subfolder/chevron.png");
            });

            it("should completely replace file in HTML", async function () {
                var pos1    = { line: 25, ch: 11 },
                    pos2    = { line: 25, ch: 27 },
                    pos3    = { line: 25, ch: 34 };

                testEditor.setCursorPos(pos2);
                hintsObj = null;
                await expectAsyncHints(UrlCodeHints.hintProvider);

                expect(hintsObj).toBeTruthy();
                expect(hintsObj.hints).toBeTruthy();
                expect(hintsObj.hints.length).toBe(1);
                expect(hintsObj.hints[0]).toBe("subfolder/chevron.png");

                // False indicates hints were closed after insertion
                expect(UrlCodeHints.hintProvider.insertHint(hintsObj.hints[0])).toBe(false);

                // File name was completely replaced, not just appended to
                expect(testDocument.getRange(pos1, pos3)).toEqual("'subfolder/chevron.png'");

                // Cursor was moved past closing single-quote
                expect(fixPos(testEditor.getCursorPos())).toEql(fixPos(pos3));
            });

            it("should insert filtered folder in HTML", async function () {
                var pos1    = { line: 23, ch: 11 },
                    pos2    = { line: 23, ch: 14 },
                    pos3    = { line: 23, ch: 31 };

                testDocument.replaceRange("sub", pos1, pos1);
                testEditor.setCursorPos(pos2);
                hintsObj = null;
                await expectAsyncHints(UrlCodeHints.hintProvider);

                expect(hintsObj).toBeTruthy();
                expect(hintsObj.hints).toBeTruthy();
                expect(hintsObj.hints.length).toBe(1);
                expect(hintsObj.hints[0]).toBe("subfolder/");

                // Partially existing folder was inserted correctly
                UrlCodeHints.hintProvider.insertHint(hintsObj.hints[0]);
                expect(testDocument.getRange(pos1, pos3)).toEqual("subfolder/test2.html");
            });

            it("should replace filtered file in HTML", async function () {
                var pos1    = { line: 23, ch: 11 },
                    pos2    = { line: 23, ch: 14 },
                    pos3    = { line: 23, ch: 21 };

                testDocument.replaceRange("tes", pos1, pos1);
                testEditor.setCursorPos(pos2);
                hintsObj = null;
                await expectAsyncHints(UrlCodeHints.hintProvider);

                expect(hintsObj).toBeTruthy();
                expect(hintsObj.hints).toBeTruthy();
                expect(hintsObj.hints.length).toBe(1);
                expect(hintsObj.hints[0]).toBe("test.html");

                // Partially existing file was replaced correctly
                UrlCodeHints.hintProvider.insertHint(hintsObj.hints[0]);
                expect(testDocument.getRange(pos1, pos3)).toEqual("test.html'");
            });

            it("should insert folder and replace file in CSS", async function () {
                var pos1    = { line: 10, ch: 24 },
                    pos2    = { line: 10, ch: 34 },
                    pos3    = { line: 10, ch: 43 },
                    pos4    = { line: 10, ch: 45 };

                testEditor.setCursorPos(pos1);
                hintsObj = null;
                await expectAsyncHints(UrlCodeHints.hintProvider);

                expect(hintsObj).toBeTruthy();
                expect(hintsObj.hints).toBeTruthy();
                expect(hintsObj.hints.length).toBe(2);
                expect(hintsObj.hints[0]).toBe("subfolder/");

                // True indicates hints were remain open after insertion of folder
                // (i.e. showing contents of inserted folder)
                expect(UrlCodeHints.hintProvider.insertHint(hintsObj.hints[0])).toBe(true);

                // Folder was inserted (i.e. filename was not removed)
                expect(testDocument.getRange(pos1, pos3)).toEqual("subfolder/dummy.jpg");

                // Cursor is at end of inserted folder
                expect(fixPos(testEditor.getCursorPos())).toEql(fixPos(pos2));

                // Get hints of inserted folder
                hintsObj = null;
                await expectAsyncHints(UrlCodeHints.hintProvider);

                expect(hintsObj).toBeTruthy();
                expect(hintsObj.hints).toBeTruthy();
                expect(hintsObj.hints.length).toBe(subfolderDirHints.length);

                // Complete path is displayed
                expect(hintsObj.hints[0]).toBe("subfolder/chevron.png");

                // False indicates hints were closed after insertion
                expect(UrlCodeHints.hintProvider.insertHint(hintsObj.hints[0])).toBe(false);

                // Filename was replaced
                expect(testDocument.getRange(pos1, pos4)).toEqual("subfolder/chevron.png");
            });

            it("should insert filtered folder in CSS", async function () {
                var pos1    = { line: 10, ch: 24 },
                    pos2    = { line: 10, ch: 27 },
                    pos3    = { line: 10, ch: 43 };

                testDocument.replaceRange("sub", pos1, pos1);
                testEditor.setCursorPos(pos2);
                hintsObj = null;
                await expectAsyncHints(UrlCodeHints.hintProvider);

                expect(hintsObj).toBeTruthy();
                expect(hintsObj.hints).toBeTruthy();
                expect(hintsObj.hints.length).toBe(1);
                expect(hintsObj.hints[0]).toBe("subfolder/");

                // Partially existing folder was inserted correctly
                UrlCodeHints.hintProvider.insertHint(hintsObj.hints[0]);
                expect(testDocument.getRange(pos1, pos3)).toEqual("subfolder/dummy.jpg");
            });

            it("should replace filtered file in CSS", async function () {
                var pos1    = { line: 10, ch: 24 },
                    pos2    = { line: 10, ch: 27 },
                    pos3    = { line: 10, ch: 34 };

                testDocument.replaceRange("tes", pos1, pos1);
                testEditor.setCursorPos(pos2);
                hintsObj = null;
                await expectAsyncHints(UrlCodeHints.hintProvider);

                expect(hintsObj).toBeTruthy();
                expect(hintsObj.hints).toBeTruthy();
                expect(hintsObj.hints.length).toBe(1);
                expect(hintsObj.hints[0]).toBe("test.html");

                // Partially existing file was replaced correctly
                UrlCodeHints.hintProvider.insertHint(hintsObj.hints[0]);
                expect(testDocument.getRange(pos1, pos3)).toEqual("test.html)");
            });

            it("should collapse consecutive path separators when inserting folder in HTML", async function () {
                var pos1    = { line: 22, ch: 11 },
                    pos2    = { line: 22, ch: 22 };

                testEditor.setCursorPos(pos1);
                hintsObj = null;
                await expectAsyncHints(UrlCodeHints.hintProvider);

                expect(hintsObj).toBeTruthy();
                expect(hintsObj.hints).toBeTruthy();
                expect(hintsObj.hints.length).toBe(2);
                expect(hintsObj.hints[0]).toBe("subfolder/");

                // True indicates hints were remain open after insertion of folder
                // (i.e. showing contents of inserted folder)
                expect(UrlCodeHints.hintProvider.insertHint(hintsObj.hints[0])).toBe(true);

                // Folder was inserted and there's only 1 slash afterwards
                expect(testDocument.getRange(pos1, pos2)).toEqual("subfolder/'");
            });

            it("should collapse consecutive path separators when inserting folder in CSS", async function () {
                var pos1    = { line: 9, ch: 15 },
                    pos2    = { line: 9, ch: 26 };

                testEditor.setCursorPos(pos1);
                hintsObj = null;
                await expectAsyncHints(UrlCodeHints.hintProvider);

                expect(hintsObj).toBeTruthy();
                expect(hintsObj.hints).toBeTruthy();
                expect(hintsObj.hints.length).toBe(2);
                expect(hintsObj.hints[0]).toBe("subfolder/");

                // True indicates hints were remain open after insertion of folder
                // (i.e. showing contents of inserted folder)
                expect(UrlCodeHints.hintProvider.insertHint(hintsObj.hints[0])).toBe(true);

                // Folder was inserted and there's only 1 slash afterwards
                expect(testDocument.getRange(pos1, pos2)).toEqual("subfolder/\"");
            });

            it("should show & insert case insensitive hints in HTML", async function () {
                var pos1    = { line: 18, ch: 12 },
                    pos2    = { line: 18, ch: 13 },
                    pos3    = { line: 18, ch: 21 };

                // Insert letter that matches filename, but with different case
                testDocument.replaceRange("T", pos1, pos1);
                testEditor.setCursorPos(pos2);
                hintsObj = null;
                await expectAsyncHints(UrlCodeHints.hintProvider);

                expect(hintsObj).toBeTruthy();
                expect(hintsObj.hints).toBeTruthy();
                expect(hintsObj.hints.length).toBe(1);
                expect(hintsObj.hints[0]).toBe("test.html");

                UrlCodeHints.hintProvider.insertHint(hintsObj.hints[0]);

                // Filename case from list was inserted (overriding case inserted in page)
                expect(testDocument.getRange(pos1, pos3)).toEqual("test.html");
            });

            it("should show & insert case insensitive hints in CSS", async function () {
                var pos1    = { line: 6, ch: 24 },
                    pos2    = { line: 6, ch: 25 },
                    pos3    = { line: 6, ch: 33 };

                // Insert letter that matches filename, but with different case
                testDocument.replaceRange("T", pos1, pos1);
                testEditor.setCursorPos(pos2);
                hintsObj = null;
                await expectAsyncHints(UrlCodeHints.hintProvider);

                expect(hintsObj).toBeTruthy();
                expect(hintsObj.hints).toBeTruthy();
                expect(hintsObj.hints.length).toBe(1);
                expect(hintsObj.hints[0]).toBe("test.html");

                UrlCodeHints.hintProvider.insertHint(hintsObj.hints[0]);

                // Filename case from list was inserted (overriding case inserted in page)
                expect(testDocument.getRange(pos1, pos3)).toEqual("test.html");
            });
        });

    }); // describe("Url Code Hinting"
});
