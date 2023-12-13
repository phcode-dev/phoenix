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

/*global describe, beforeEach, afterEach, it, expect, awaitsForDone, awaitsForFail, spyOn,
beforeAll, afterAll, jasmine, Phoenix, awaitsFor */

define(function (require, exports, module) {


    // Load dependent modules
    var CommandManager,         // loaded from brackets.test
        Commands,               // loaded from brackets.test
        DocumentCommandHandlers, // loaded from brackets.test
        DocumentManager,        // loaded from brackets.test
        MainViewManager,        // loaded from brackets.test
        Dialogs,                // loaded from brackets.test
        FileSystem,             // loaded from brackets.test
        FileViewController,     // loaded from brackets.test
        EditorManager,          // loaded from brackets.test
        SpecRunnerUtils          = require("spec/SpecRunnerUtils"),
        FileUtils                = require("file/FileUtils"),
        FileSystemError          = require("filesystem/FileSystemError");

    describe("LegacyInteg: DocumentCommandHandlers", function () {

        var testPath = SpecRunnerUtils.getTestPath("/spec/DocumentCommandHandlers-test-files"),
            testWindow,
            _$,
            promise;

        var TEST_JS_CONTENT = 'var myContent="This is awesome!";';
        var TEST_JS_NEW_CONTENT = "hello world";
        var TEST_JS_SECOND_NEW_CONTENT = "hello world 2";
        var WINDOW_TITLE_DOT = brackets.platform === "mac" ? "\u2014" : "-";

        beforeAll(async function () {
            testWindow = await SpecRunnerUtils.createTestWindowAndRun({forceReload: true});
            _$ = testWindow.$;

            // Load module instances from brackets.test
            CommandManager          = testWindow.brackets.test.CommandManager;
            Commands                = testWindow.brackets.test.Commands;
            DocumentCommandHandlers = testWindow.brackets.test.DocumentCommandHandlers;
            DocumentManager         = testWindow.brackets.test.DocumentManager;
            MainViewManager         = testWindow.brackets.test.MainViewManager;
            Dialogs                 = testWindow.brackets.test.Dialogs;
            FileSystem              = testWindow.brackets.test.FileSystem;
            FileViewController      = testWindow.brackets.test.FileViewController;
            EditorManager           = testWindow.brackets.test.EditorManager;
        }, 30000);

        afterAll(async function () {
            testWindow              = null;
            CommandManager          = null;
            Commands                = null;
            DocumentCommandHandlers = null;
            DocumentManager         = null;
            MainViewManager         = null;
            Dialogs                 = null;
            FileViewController      = null;
            EditorManager           = null;
            await SpecRunnerUtils.closeTestWindow(true);
        }, 30000);


        beforeEach(async function () {
            // Working set behavior is sensitive to whether file lives in the project or outside it, so make
            // the project root a known quantity.
            await SpecRunnerUtils.loadProjectInTestWindow(testPath);
        });

        afterEach(function () {
            promise = null;

            // Call closeAll() directly. Some tests set a spy on the save as
            // dialog preventing SpecRunnerUtils.closeAllFiles() from
            // working properly.
            testWindow.brackets.test.MainViewManager._closeAll(testWindow.brackets.test.MainViewManager.ALL_PANES);
        });

        // Helper functions for testing cursor position / selection range
        function fixPos(pos) {
            if (!("sticky" in pos)) {
                pos.sticky = null;
            }
            return pos;
        }
        function fixSel(sel) {
            fixPos(sel.start);
            fixPos(sel.end);
            if (!("reversed" in sel)) {
                sel.reversed = false;
            }
            return sel;
        }
        function fixSels(sels) {
            sels.forEach(function (sel) {
                fixSel(sel);
            });
            return sels;
        }

        /** Expect a file to exist (failing test if not) and then delete it */
        async function expectAndDelete(fullPath) {
            var promise = SpecRunnerUtils.resolveNativeFileSystemPath(fullPath);
            await awaitsForDone(promise, "Verify file exists: " + fullPath);
            var promise = SpecRunnerUtils.deletePath(fullPath);
            await awaitsForDone(promise, "Remove testfile " + fullPath, 5000);
        }


        describe("New Untitled File", function () {
            var filePath,
                newFilename,
                newFilePath;

            beforeEach(function () {
                filePath    = testPath + "/test.js";
                newFilename = "testname.js";
                newFilePath = testPath + "/" + newFilename;
            });

            /** @return {Array.<Document>} */
            function getOpenDocsFromWorkingSet() {
                return MainViewManager.getWorkingSet(MainViewManager.ALL_PANES).map(function (file) {
                    return DocumentManager.getOpenDocumentForPath(file.fullPath);
                });
            }

            /** Creates N untitled documents with distinct content (the file's creation-order index as a string) */
            async function createUntitled(count) {
                async function doCreateUntitled(content) {
                    var promise = CommandManager.execute(Commands.FILE_NEW_UNTITLED);
                    promise.done(function (untitledDoc) {
                        untitledDoc.replaceRange(content, {line: 0, ch: 0});
                    });
                    await awaitsForDone(promise, "FILE_NEW_UNTITLED");
                }

                var i;
                for (i = 0; i < count; i++) {
                    await doCreateUntitled(String(i));
                }
            }


            // Single untitled documents

            it("should create a new untitled document in the Working Set", async function () {
                promise = CommandManager.execute(Commands.FILE_NEW_UNTITLED);

                await awaitsForDone(promise, "FILE_NEW_UNTITLED");

                var untitledDocument = DocumentManager.getCurrentDocument();
                expect(untitledDocument.isDirty).toBe(false);
                expect(untitledDocument.isUntitled()).toBe(true);

                // Verify that doc is accessible through standard doc-getting APIs
                var openDoc = DocumentManager.getOpenDocumentForPath(untitledDocument.file.fullPath);
                expect(openDoc).toBe(untitledDocument);

                var asyncDocPromise = DocumentManager.getDocumentForPath(untitledDocument.file.fullPath);
                asyncDocPromise.done(function (asyncDoc) {
                    expect(asyncDoc).toBe(untitledDocument);
                });
                await awaitsForDone(asyncDocPromise);
            });

            it("should swap out untitled document in the Working Set after saving with new name", async function () {
                promise = CommandManager.execute(Commands.FILE_NEW_UNTITLED);

                await awaitsForDone(promise, "FILE_NEW_UNTITLED");

                spyOn(FileSystem, 'showSaveDialog').and.callFake(function (dialogTitle, initialPath, proposedNewName, callback) {
                    callback(undefined, newFilePath);
                });

                promise = CommandManager.execute(Commands.FILE_SAVE);
                await awaitsForDone(promise, "Provide new filename", 5000);

                var noLongerUntitledDocument = DocumentManager.getCurrentDocument();

                expect(noLongerUntitledDocument.isDirty).toBe(false);
                expect(noLongerUntitledDocument.isUntitled()).toBe(false);
                expect(noLongerUntitledDocument.file.fullPath).toEqual(newFilePath);
                expect(MainViewManager.findInWorkingSet(MainViewManager.ALL_PANES, newFilePath)).not.toEqual(-1);
                expect(MainViewManager.getWorkingSet(MainViewManager.ALL_PANES).length).toEqual(1);  // no remnant of untitled doc left

                // Verify file exists, & clean up
                await expectAndDelete(newFilePath);
            });

            // from Issue #6121
            it("should recognize that a previously untitled, but now saved, document can be saved without prompting for a filename", async function () {
                promise = CommandManager.execute(Commands.FILE_NEW_UNTITLED);

                await awaitsForDone(promise, "FILE_NEW_UNTITLED");

                spyOn(FileSystem, 'showSaveDialog').and.callFake(function (dialogTitle, initialPath, proposedNewName, callback) {
                    callback(undefined, newFilePath);
                });

                promise = CommandManager.execute(Commands.FILE_SAVE);

                await awaitsForDone(promise, "FILE_SAVE");

                expect(FileSystem.showSaveDialog).toHaveBeenCalled();   // first save should prompt user for filename

                promise = CommandManager.execute(Commands.FILE_SAVE);

                await awaitsForDone(promise, "FILE_SAVE");

                expect(FileSystem.showSaveDialog.calls.count()).toEqual(1); // second save should not prompt
            });

            it("should ask to save untitled document upon closing", async function () {
                newFilename = "testname2.js";
                newFilePath = testPath + "/" + newFilename;

                promise = CommandManager.execute(Commands.FILE_NEW_UNTITLED);

                await awaitsForDone(promise, "FILE_NEW_UNTITLED");

                // set Dirty flag
                var untitledDocument = DocumentManager.getCurrentDocument();
                untitledDocument.setText(TEST_JS_NEW_CONTENT);

                spyOn(Dialogs, 'showModalDialog').and.callFake(function (dlgClass, title, message, buttons) {
                    return {done: function (callback) { callback(Dialogs.DIALOG_BTN_OK); } };
                });

                spyOn(FileSystem, 'showSaveDialog').and.callFake(function (dialogTitle, initialPath, proposedNewName, callback) {
                    callback(undefined, newFilePath);
                });

                promise = CommandManager.execute(Commands.FILE_CLOSE);

                await awaitsForDone(promise, "FILE_CLOSE");

                expect(MainViewManager.getWorkingSet(MainViewManager.ALL_PANES).length).toEqual(0);

                // Verify file exists, & clean up
                await expectAndDelete(newFilePath);
            });

            it("should keep dirty untitled document in Working Set when close document is canceled", async function () {
                promise = CommandManager.execute(Commands.FILE_NEW_UNTITLED);

                await awaitsForDone(promise, "FILE_NEW_UNTITLED");

                // set Dirty flag
                var untitledDocument = DocumentManager.getCurrentDocument();
                untitledDocument.setText(TEST_JS_NEW_CONTENT);

                spyOn(Dialogs, 'showModalDialog').and.callFake(function (dlgClass, title, message, buttons) {
                    return {done: function (callback) { callback(Dialogs.DIALOG_BTN_CANCEL); } };
                });

                promise = CommandManager.execute(Commands.FILE_CLOSE);

                await awaitsForFail(promise, "FILE_CLOSE");

                var untitledDocument = DocumentManager.getCurrentDocument();

                expect(untitledDocument.isDirty).toBe(true);
                expect(untitledDocument.isUntitled()).toBe(true);
                expect(MainViewManager.findInWorkingSet(MainViewManager.ALL_PANES, untitledDocument.file.fullPath)).not.toEqual(-1);
            });

            it("should keep dirty untitled document in Working Set when saving during close is canceled", async function () {
                promise = CommandManager.execute(Commands.FILE_NEW_UNTITLED);

                await awaitsForDone(promise, "FILE_NEW_UNTITLED");

                // set Dirty flag
                var untitledDocument = DocumentManager.getCurrentDocument();
                untitledDocument.setText(TEST_JS_NEW_CONTENT);

                spyOn(Dialogs, 'showModalDialog').and.callFake(function (dlgClass, title, message, buttons) {
                    return {done: function (callback) { callback(Dialogs.DIALOG_BTN_OK); } };
                });

                spyOn(FileSystem, 'showSaveDialog').and.callFake(function (dialogTitle, initialPath, proposedNewName, callback) {
                    callback(undefined, "");  // "" means cancel
                });

                promise = CommandManager.execute(Commands.FILE_CLOSE);

                await awaitsForFail(promise, "FILE_CLOSE");

                var untitledDocument = DocumentManager.getCurrentDocument();

                expect(untitledDocument.isDirty).toBe(true);
                expect(untitledDocument.isUntitled()).toBe(true);
                expect(MainViewManager.findInWorkingSet(MainViewManager.ALL_PANES, untitledDocument.file.fullPath)).not.toEqual(-1);
            });

            it("should remove dirty untitled Document from Working Set when closing document is not saved", async function () {
                promise = CommandManager.execute(Commands.FILE_NEW_UNTITLED);

                await awaitsForDone(promise, "FILE_NEW_UNTITLED");

                // set Dirty flag
                var untitledDocument = DocumentManager.getCurrentDocument();
                untitledDocument.setText(TEST_JS_NEW_CONTENT);

                spyOn(Dialogs, 'showModalDialog').and.callFake(function (dlgClass, title, message, buttons) {
                    return {done: function (callback) { callback(Dialogs.DIALOG_BTN_DONTSAVE); } };
                });

                promise = CommandManager.execute(Commands.FILE_CLOSE);

                await awaitsForDone(promise, "FILE_CLOSE");

                expect(MainViewManager.getWorkingSet(MainViewManager.ALL_PANES).length).toEqual(0);
            });

            it("should remove new untitled Document from Working Set upon closing", async function () {
                promise = CommandManager.execute(Commands.FILE_NEW_UNTITLED);

                await awaitsForDone(promise, "FILE_NEW_UNTITLED");

                promise = CommandManager.execute(Commands.FILE_CLOSE);

                await awaitsForDone(promise, "FILE_CLOSE");

                expect(MainViewManager.getWorkingSet(MainViewManager.ALL_PANES).length).toEqual(0);
            });


            // Multiple untitled documents

            it("multiple untitled documents shouldn't conflict", async function () {
                await createUntitled(3);

                var workingSetListDocs = getOpenDocsFromWorkingSet();
                expect(workingSetListDocs.length).toEqual(3);

                // Expect non-conflicting dummy paths
                expect(workingSetListDocs[0].file.fullPath).not.toBe(workingSetListDocs[1].file.fullPath);
                expect(workingSetListDocs[0].file.fullPath).not.toBe(workingSetListDocs[2].file.fullPath);
                expect(workingSetListDocs[1].file.fullPath).not.toBe(workingSetListDocs[2].file.fullPath);

                // Expect separate Document objects
                expect(workingSetListDocs[0]).not.toBe(workingSetListDocs[1]);
                expect(workingSetListDocs[0]).not.toBe(workingSetListDocs[2]);
                expect(workingSetListDocs[1]).not.toBe(workingSetListDocs[2]);

                // Expect all Documents to be untitled
                workingSetListDocs.forEach(function (doc) {
                    expect(doc.isUntitled()).toBe(true);
                });

                // Expect separate, unique content
                expect(workingSetListDocs[0].getText()).toBe("0");
                expect(workingSetListDocs[1].getText()).toBe("1");
                expect(workingSetListDocs[2].getText()).toBe("2");
            });

            it("should save-all multiple untitled documents", async function () {
                function getFilename(i) {
                    return testPath + "/test_saveall_" + i + ".js";
                }

                await createUntitled(3);

                var fileI = 0;
                spyOn(FileSystem, 'showSaveDialog').and.callFake(function (dialogTitle, initialPath, proposedNewName, callback) {
                    callback(undefined, getFilename(fileI));
                    fileI++;
                });

                var promise = CommandManager.execute(Commands.FILE_SAVE_ALL);
                await awaitsForDone(promise, "FILE_SAVE_ALL", 5000);

                // Expect clean Documents with correct, unique non-dummy paths
                var workingSetListDocs = getOpenDocsFromWorkingSet();
                expect(workingSetListDocs.length).toEqual(3);

                workingSetListDocs.forEach(function (doc, i) {
                    expect(doc.isUntitled()).toBe(false);
                    expect(doc.isDirty).toBe(false);
                    expect(doc.file.fullPath).toBe(getFilename(i));
                });

                // Verify files exist & clean up
                for(let i=0; i< workingSetListDocs.length; i++){
                    await expectAndDelete(getFilename(i));
                }
            });

            it("close-all should save multiple untitled documents", async function () {
                function getFilename(i) {
                    return testPath + "/test_closeall_cancel_" + i + ".js";
                }

                await createUntitled(3);

                spyOn(Dialogs, 'showModalDialog').and.callFake(function (dlgClass, title, message, buttons) {
                    return {done: function (callback) { callback(Dialogs.DIALOG_BTN_OK); } };
                });

                var fileI = 0;
                spyOn(FileSystem, 'showSaveDialog').and.callFake(function (dialogTitle, initialPath, proposedNewName, callback) {
                    callback(undefined, getFilename(fileI));
                    fileI++;
                });

                var promise = CommandManager.execute(Commands.FILE_CLOSE_ALL);
                await awaitsForDone(promise, "FILE_CLOSE_ALL", 5000);

                expect(MainViewManager.getWorkingSet(MainViewManager.ALL_PANES).length).toEqual(0);

                // Verify files exist & clean up
                await expectAndDelete(getFilename(0));
                await expectAndDelete(getFilename(1));
                await expectAndDelete(getFilename(2));
            });

            it("canceling a save-all prompt should cancel remaining saves", async function () {
                function getFilename(i) {
                    return testPath + "/test_saveall_" + i + ".js";
                }

                await createUntitled(3);

                var fileI = 0;
                spyOn(FileSystem, 'showSaveDialog').and.callFake(function (dialogTitle, initialPath, proposedNewName, callback) {
                    if (fileI === 0) {
                        // save first file
                        callback(undefined, getFilename(fileI));
                    } else if (fileI === 1) {
                        // cancel save dialog on second file
                        callback(undefined, "");  // "" means cancel
                    } else {
                        // shouldn't get prompted for any further files
                        expect(false).toBe(true);
                    }
                    fileI++;
                });

                var promise = CommandManager.execute(Commands.FILE_SAVE_ALL);
                await awaitsForFail(promise, "FILE_SAVE_ALL");  // note: promise should fail due to cancellation

                // Expect *only* first Document was saved - others remain untitled & dirty
                let workingSetListDocs = getOpenDocsFromWorkingSet();
                expect(workingSetListDocs.length).toEqual(3);

                workingSetListDocs.forEach(function (doc, i) {
                    if (i === 0) {
                        // First file was saved when we confirmed save dialog
                        expect(doc.isUntitled()).toBe(false);
                        expect(doc.isDirty).toBe(false);
                        expect(doc.file.fullPath).toBe(getFilename(i));
                    } else {
                        // All other saves should have been canceled
                        expect(doc.isUntitled()).toBe(true);
                        expect(doc.isDirty).toBe(true);
                        expect(doc.file.fullPath).not.toBe(getFilename(i));  // should still have dummy path
                    }
                });

                // Clean up the one file we did save
                await expectAndDelete(getFilename(0));
            });

            it("canceling any close-all save should not close any documents", async function () {
                function getFilename(i) {
                    return testPath + "/test_closeall_save_" + i + ".js";
                }

                await createUntitled(3);

                spyOn(Dialogs, 'showModalDialog').and.callFake(function (dlgClass, title, message, buttons) {
                    return {done: function (callback) { callback(Dialogs.DIALOG_BTN_OK); } };
                });

                var fileI = 0;
                spyOn(FileSystem, 'showSaveDialog').and.callFake(function (dialogTitle, initialPath, proposedNewName, callback) {
                    if (fileI === 0) {
                        // save first file
                        callback(undefined, getFilename(fileI));
                    } else if (fileI === 1) {
                        // cancel save dialog on second file
                        callback(undefined, "");  // "" means cancel
                    } else {
                        // shouldn't get prompted for any further files
                        expect(false).toBe(true);
                    }
                    fileI++;
                });

                var promise = CommandManager.execute(Commands.FILE_CLOSE_ALL);
                await awaitsForFail(promise, "FILE_CLOSE_ALL");  // note: promise should fail due to cancellation

                // Expect *all* Documents still open, and *only* first Document was saved
                var workingSetListDocs = getOpenDocsFromWorkingSet();
                expect(workingSetListDocs.length).toEqual(3);

                workingSetListDocs.forEach(function (doc, i) {
                    if (i === 0) {
                        // First file was saved when we confirmed save dialog
                        expect(doc.isUntitled()).toBe(false);
                        expect(doc.isDirty).toBe(false);
                        expect(doc.file.fullPath).toBe(getFilename(i));
                    } else {
                        // All other saves should have been canceled
                        expect(doc.isUntitled()).toBe(true);
                        expect(doc.isDirty).toBe(true);
                        expect(doc.file.fullPath).not.toBe(getFilename(i));  // should still have dummy path
                    }
                });

                // Clean up the one file we did save
                await expectAndDelete(getFilename(0));
            });

        });

        // TODO (issue #115): test Commands.FILE_NEW. Current implementation of
        // ProjectManager.createNewItem() is tightly coupled to jstree UI and
        // events.


        describe("Close File", function () {
            it("should complete without error if no files are open", async function () {
                promise = CommandManager.execute(Commands.FILE_CLOSE);
                await awaitsForDone(promise, "FILE_CLOSE");
                const expectedTitle = "DocumentCommandHandlers-test-files " + WINDOW_TITLE_DOT + " " + brackets.config.app_title;
                expect(testWindow.document.title).toBe(expectedTitle);
                if(Phoenix.browser.isTauri) {
                    await awaitsFor(async ()=> {
                        const title = await Phoenix.app.getWindowTitle();
                        return title === expectedTitle;
                    }, "waiting for title to be: " + expectedTitle);
                }
            });

            it("should close a file in the editor", async function () {
                var promise;

                promise = CommandManager.execute(Commands.FILE_OPEN, {fullPath: testPath + "/test.js"});
                await awaitsForDone(promise, "FILE_OPEN");
                promise = CommandManager.execute(Commands.FILE_CLOSE);
                await awaitsForDone(promise, "FILE_CLOSE");
                const expectedTitle = "DocumentCommandHandlers-test-files " + WINDOW_TITLE_DOT + " " + brackets.config.app_title;
                expect(testWindow.document.title).toBe(expectedTitle);
                if(Phoenix.browser.isTauri) {
                    await awaitsFor(async ()=> {
                        const title = await Phoenix.app.getWindowTitle();
                        return title === expectedTitle;
                    }, "waiting for title to be: " + expectedTitle);
                }
            });
        });


        describe("Close List", function () {
            beforeEach(async function () {
                promise = CommandManager.execute(Commands.CMD_ADD_TO_WORKINGSET_AND_OPEN, {fullPath: testPath + "/test.js"});
                await awaitsForDone(promise, "CMD_ADD_TO_WORKINGSET_AND_OPEN");
                promise = CommandManager.execute(Commands.CMD_ADD_TO_WORKINGSET_AND_OPEN, {fullPath: testPath + "/test2.js"});
                await awaitsForDone(promise, "CMD_ADD_TO_WORKINGSET_AND_OPEN");
            });
            it("should not close the current view", async function () {
                var currentPath,
                    docsToClose;
                currentPath = MainViewManager.getCurrentlyViewedPath();
                docsToClose = DocumentManager.getAllOpenDocuments().filter(function (doc) {
                    return (doc !== DocumentManager.getCurrentDocument());
                });
                promise = CommandManager.execute(Commands.FILE_CLOSE_LIST, {fileList: docsToClose.map(function (doc) {
                        return doc.file;
                    })});
                await awaitsForDone(promise, "FILE_CLOSE_LIST");
                expect(MainViewManager.getCurrentlyViewedPath()).toBe(currentPath);
            });
            it("should close all views", async function () {
                var docsToClose;
                docsToClose = DocumentManager.getAllOpenDocuments();
                promise = CommandManager.execute(Commands.FILE_CLOSE_LIST, {fileList: docsToClose.map(function (doc) {
                        return doc.file;
                    })});
                await awaitsForDone(promise, "FILE_CLOSE_LIST");
                expect(MainViewManager.getCurrentlyViewedFile()).toBeFalsy();
            });
            it("should open the next view when the current view is closed", async function () {
                var currentPath,
                    docsToClose;
                currentPath = MainViewManager.getCurrentlyViewedPath();
                docsToClose = DocumentManager.getAllOpenDocuments().filter(function (doc) {
                    return (doc === DocumentManager.getCurrentDocument());
                });
                promise = CommandManager.execute(Commands.FILE_CLOSE_LIST, {fileList: docsToClose.map(function (doc) {
                        return doc.file;
                    })});
                await awaitsForDone(promise, "FILE_CLOSE_LIST");
                expect(MainViewManager.getCurrentlyViewedPath()).not.toBe(currentPath);
                expect(MainViewManager.getCurrentlyViewedPath()).toBeTruthy();
            });
        });


        describe("Open File", function () {
            it("should open a file in the editor", async function () {
                var promise;

                promise = CommandManager.execute(Commands.FILE_OPEN, {fullPath: testPath + "/test.js"});
                await awaitsForDone(promise, "FILE_OPEN");
                expect(DocumentManager.getCurrentDocument().getText()).toBe(TEST_JS_CONTENT);
            });

            it("should resolve with FileSystemError when opening fails", async function () {
                // Dismiss expected error dialog instantly so promise completes & test can proceed
                spyOn(Dialogs, "showModalDialog").and.callFake(function (dlgClass, title, message, buttons) {
                    return {done: function (callback) { callback(Dialogs.DIALOG_BTN_OK); } };
                });

                // Open nonexistent file to trigger error result
                var promise = CommandManager.execute(Commands.FILE_OPEN, {fullPath: testPath + "/doesNotExist.js"});
                await awaitsForFail(promise, "FILE_OPEN");
                promise.fail(function (err) {
                    expect(err).toEqual(FileSystemError.NOT_FOUND);
                });
                expect(DocumentManager.getCurrentDocument()).toBeFalsy();
            });
        });


        describe("Save File", function () {
            it("should save changes", async function () {
                var filePath    = testPath + "/test.js",
                    promise;

                promise = CommandManager.execute(Commands.FILE_OPEN, {fullPath: filePath});
                await awaitsForDone(promise, "FILE_OPEN");

                // modify and save
                DocumentManager.getCurrentDocument().setText(TEST_JS_NEW_CONTENT);

                promise = CommandManager.execute(Commands.FILE_SAVE);
                await awaitsForDone(promise, "FILE_SAVE");

                // confirm file contents
                promise = FileUtils.readAsText(FileSystem.getFileForPath(filePath))
                    .done(function (actualText) {
                        expect(actualText).toBe(TEST_JS_NEW_CONTENT);
                    });
                await awaitsForDone(promise, "Read test file");

                // reset file contents
                promise = FileUtils.writeText(FileSystem.getFileForPath(filePath), TEST_JS_CONTENT);
                await awaitsForDone(promise, "Revert test file");
            });

            // Regardless of platform, files with CRLF should be saved with CRLF and files with LF should be saved with LF
            it("should preserve line endings after Save", async function () {
                var crlfText = "line1\r\nline2\r\nline3",
                    lfText   = "line1\nline2\nline3",
                    crlfPath = testPath + "/crlfTest.js",
                    lfPath   = testPath + "/lfTest.js",
                    promise;

                // create test files (Git rewrites line endings, so these can't be kept in src control)
                promise = FileUtils.writeText(FileSystem.getFileForPath(crlfPath), crlfText);
                await awaitsForDone(promise, "Create CRLF test file");

                promise = FileUtils.writeText(FileSystem.getFileForPath(lfPath), lfText);
                await awaitsForDone(promise, "Create LF test file");

                // open, modify, and save file (CRLF case)
                promise = CommandManager.execute(Commands.FILE_OPEN, {fullPath: crlfPath});
                await awaitsForDone(promise, "Open CRLF test file");

                DocumentManager.getCurrentDocument().replaceRange("line2a\nline2b", {line: 1, ch: 0}, {line: 1, ch: 5});
                promise = CommandManager.execute(Commands.FILE_SAVE);
                await awaitsForDone(promise, "Save modified file");

                // open, modify, and save file (LF case)
                promise = CommandManager.execute(Commands.FILE_OPEN, {fullPath: lfPath});
                await awaitsForDone(promise, "Open LF test file");

                DocumentManager.getCurrentDocument().replaceRange("line2a\nline2b", {line: 1, ch: 0}, {line: 1, ch: 5});
                promise = CommandManager.execute(Commands.FILE_SAVE);
                await awaitsForDone(promise, "Save modified file");

                // verify files' contents
                promise = FileUtils.readAsText(FileSystem.getFileForPath(crlfPath))
                    .done(function (actualText) {
                        expect(actualText).toBe(crlfText.replace("line2", "line2a\r\nline2b"));
                    });
                await awaitsForDone(promise, "Read CRLF test file");

                promise = FileUtils.readAsText(FileSystem.getFileForPath(lfPath))
                    .done(function (actualText) {
                        expect(actualText).toBe(lfText.replace("line2", "line2a\nline2b"));
                    });
                await awaitsForDone(promise, "Read LF test file");

                // clean up
                await awaitsForDone(SpecRunnerUtils.deletePath(crlfPath), "Remove CRLF test file");
                await awaitsForDone(SpecRunnerUtils.deletePath(lfPath),   "Remove LF test file");
            });

            it("should preserve line endings after Save As", async function () {  // bug #9179
                var crlfText = "line1\r\nline2\r\nline3",
                    lfText   = "line1\nline2\nline3",
                    crlfPath = testPath + "/crlfTest.js",
                    lfPath   = testPath + "/lfTest.js",
                    crlfNewPath = testPath + "/saveAsCRLF.js",
                    lfNewPath = testPath + "/saveAsLF.js",
                    promise;

                // create test files (Git rewrites line endings, so these can't be kept in src control)
                promise = FileUtils.writeText(FileSystem.getFileForPath(crlfPath), crlfText);
                await awaitsForDone(promise, "Create CRLF test file");
                promise = FileUtils.writeText(FileSystem.getFileForPath(lfPath), lfText);
                await awaitsForDone(promise, "Create LF test file");

                // open, modify, and Save As (CRLF case)
                promise = CommandManager.execute(Commands.FILE_OPEN, {fullPath: crlfPath});
                await awaitsForDone(promise, "Open CRLF test file");
                DocumentManager.getCurrentDocument().replaceRange("line2a\nline2b", {line: 1, ch: 0}, {line: 1, ch: 5});

                spyOn(FileSystem, "showSaveDialog").and.callFake(function (dialogTitle, initialPath, proposedNewName, callback) {
                    callback(undefined, crlfNewPath);
                });
                promise = CommandManager.execute(Commands.FILE_SAVE_AS);
                await awaitsForDone(promise, "Save As modified file");

                // open, modify, and Save As (LF case)
                promise = CommandManager.execute(Commands.FILE_OPEN, {fullPath: lfPath});
                await awaitsForDone(promise, "Open LF test file");
                DocumentManager.getCurrentDocument().replaceRange("line2a\nline2b", {line: 1, ch: 0}, {line: 1, ch: 5});

                FileSystem.showSaveDialog.and.callFake(function (dialogTitle, initialPath, proposedNewName, callback) {
                    callback(undefined, lfNewPath);
                });
                promise = CommandManager.execute(Commands.FILE_SAVE_AS);
                await awaitsForDone(promise, "Save As modified file");

                // verify files' contents
                promise = FileUtils.readAsText(FileSystem.getFileForPath(crlfNewPath))
                    .done(function (actualText) {
                        expect(actualText).toBe(crlfText.replace("line2", "line2a\r\nline2b"));
                    });
                await awaitsForDone(promise, "Read CRLF save-as file");

                promise = FileUtils.readAsText(FileSystem.getFileForPath(lfNewPath))
                    .done(function (actualText) {
                        expect(actualText).toBe(lfText.replace("line2", "line2a\nline2b"));
                    });
                await awaitsForDone(promise, "Read LF save-as file");

                // clean up
                await awaitsForDone(SpecRunnerUtils.deletePath(crlfPath),    "Remove CRLF test file");
                await awaitsForDone(SpecRunnerUtils.deletePath(lfPath),      "Remove LF test file");
                await awaitsForDone(SpecRunnerUtils.deletePath(crlfNewPath), "Remove CRLF save-as file");
                await awaitsForDone(SpecRunnerUtils.deletePath(lfNewPath),   "Remove LF save-as file");
            });

        });


        describe("Save As", function () {
            var filePath,
                newFilename,
                newFilePath,
                selections = [{start: {line: 0, ch: 1}, end: {line: 0, ch: 3}, primary: false, reversed: false},
                              {start: {line: 0, ch: 6}, end: {line: 0, ch: 6}, primary: true, reversed: false},
                              {start: {line: 0, ch: 9}, end: {line: 0, ch: 12}, primary: false, reversed: true}];

            beforeEach(function () {
                filePath    = testPath + "/test.js";
                newFilename = "testname.js";
                newFilePath = testPath + "/" + newFilename;
            });

            it("should close the original file, reopen the saved file and add select the new file in the project tree", async function () {
                // Open the file, does not add to working set
                promise = CommandManager.execute(Commands.FILE_OPEN, {fullPath: filePath});
                await awaitsForDone(promise, "FILE_OPEN");

                var currentDocument = DocumentManager.getCurrentDocument(),
                    currentEditor = EditorManager.getActiveEditor();
                expect(currentDocument.file.fullPath).toEqual(filePath);
                currentEditor.setSelections(selections);

                spyOn(FileSystem, 'showSaveDialog').and.callFake(function (dialogTitle, initialPath, proposedNewName, callback) {
                    callback(undefined, newFilePath);
                });

                promise = CommandManager.execute(Commands.FILE_SAVE_AS);
                await awaitsForDone(promise, "Provide new filename");

                var currentDocument = DocumentManager.getCurrentDocument(),
                    currentEditor = EditorManager.getActiveEditor();
                expect(currentDocument.file.fullPath).toEqual(newFilePath);
                expect(fixSels(currentEditor.getSelections())).toEql(fixSels(selections));

                // New file should not appear in working set
                expect(MainViewManager.findInWorkingSet(MainViewManager.ALL_PANES, newFilePath)).toEqual(-1);

                // Verify file exists & clean it up
                await expectAndDelete(newFilePath);
            });

            it("should close the original file, reopen the saved file outside the project and add it to the Working Set", async function () {
                newFilePath = SpecRunnerUtils.getTempDirectory() + "/" + newFilename;

                await SpecRunnerUtils.createTempDirectory();

                promise = CommandManager.execute(Commands.FILE_OPEN, {fullPath: filePath});
                await awaitsForDone(promise, "FILE_OPEN");

                var currentDocument = DocumentManager.getCurrentDocument();
                expect(currentDocument.file.fullPath).toEqual(filePath);

                spyOn(FileSystem, 'showSaveDialog').and.callFake(function (dialogTitle, initialPath, proposedNewName, callback) {
                    callback(undefined, newFilePath);
                });

                promise = CommandManager.execute(Commands.FILE_SAVE_AS);
                await awaitsForDone(promise, "Provide new filename");

                var currentDocument = DocumentManager.getCurrentDocument();
                expect(currentDocument.file.fullPath).toEqual(newFilePath);

                // Only new file should appear in working set
                expect(MainViewManager.findInWorkingSet(MainViewManager.ALL_PANES, newFilePath)).not.toEqual(-1);
                expect(MainViewManager.findInWorkingSet(MainViewManager.ALL_PANES, filePath)).toEqual(-1);

                // Verify file exists & clean it up
                await expectAndDelete(newFilePath);
            });

            it("should leave Working Set untouched when operation is canceled", async function () {
                promise = CommandManager.execute(Commands.FILE_OPEN, {fullPath: filePath});

                await awaitsForDone(promise, "FILE_OPEN");

                var currentDocument = DocumentManager.getCurrentDocument();
                expect(currentDocument.file.fullPath).toEqual(filePath);

                spyOn(FileSystem, 'showSaveDialog').and.callFake(function (dialogTitle, initialPath, proposedNewName, callback) {
                    callback("Error", undefined);
                });

                promise = CommandManager.execute(Commands.FILE_SAVE_AS);
                await awaitsForFail(promise, "Provide new filename");

                var currentDocument = DocumentManager.getCurrentDocument();
                expect(currentDocument.file.fullPath).toEqual(filePath);

                expect(MainViewManager.findInWorkingSet(MainViewManager.ALL_PANES, newFilePath)).toEqual(-1);
            });

            it("should maintain order within Working Set after Save As", async function () {
                var views,
                    targetDoc;

                // open the target file
                promise = CommandManager.execute(Commands.FILE_OPEN, {fullPath: filePath});

                await awaitsForDone(promise, "FILE_OPEN");

                views = MainViewManager.findInAllWorkingSets(filePath);
                targetDoc = DocumentManager.getOpenDocumentForPath(filePath);

                // create an untitled document so that the file opened above isn't the last item in the working set list
                promise = CommandManager.execute(Commands.FILE_NEW_UNTITLED);

                await awaitsForDone(promise, "FILE_NEW_UNTITLED");

                // save the file opened above to a different filename
                MainViewManager._edit(MainViewManager.ACTIVE_PANE, targetDoc);
                spyOn(FileSystem, 'showSaveDialog').and.callFake(function (dialogTitle, initialPath, proposedNewName, callback) {
                    callback(undefined, newFilePath);
                });

                promise = CommandManager.execute(Commands.FILE_SAVE_AS);
                await awaitsForDone(promise, "Provide new filename");

                // New file should appear in working set at old file's index; old file shouldn't appear at all
                expect(MainViewManager.findInAllWorkingSets(newFilePath)).toEqual(views);
                expect(MainViewManager.findInWorkingSet(MainViewManager.ALL_PANES, filePath)).toEqual(-1);

                // Verify file exists & clean it up
                await expectAndDelete(newFilePath);
            });
        });


        describe("Dirty File Handling", function () {

            beforeEach(async function () {
                var promise;

                await SpecRunnerUtils.loadProjectInTestWindow(testPath);

                promise = CommandManager.execute(Commands.FILE_OPEN, {fullPath: testPath + "/test.js"});
                await awaitsForDone(promise, "FILE_OPEN");
            });

            it("should report clean immediately after opening a file", async function () {
                // verify Document dirty status
                expect(DocumentManager.getCurrentDocument().isDirty).toBe(false);

                // verify no dot in titlebar
                const expectedTitle = `DocumentCommandHandlers-test-files ${WINDOW_TITLE_DOT} test.js`;
                expect(testWindow.document.title).toBe(expectedTitle);
                if(Phoenix.browser.isTauri) {
                    await awaitsFor(async ()=> {
                        const title = await Phoenix.app.getWindowTitle();
                        return title === expectedTitle;
                    }, "waiting for title to be: " + expectedTitle);
                }
            });

            it("should report dirty when modified", async function () {
                var doc = DocumentManager.getCurrentDocument();

                // change editor content
                doc.setText(TEST_JS_NEW_CONTENT);

                // verify Document dirty status
                expect(doc.isDirty).toBe(true);

                // verify dot in titlebar
                const expectedTitle = `• DocumentCommandHandlers-test-files ${WINDOW_TITLE_DOT} test.js`;
                expect(testWindow.document.title).toBe(expectedTitle);
                if(Phoenix.browser.isTauri) {
                    await awaitsFor(async ()=> {
                        const title = await Phoenix.app.getWindowTitle();
                        return title === expectedTitle;
                    }, "waiting for title to be: " + expectedTitle);
                }
            });

            it("should report dirty after undo and redo", async function () {
                var doc = DocumentManager.getCurrentDocument();
                var editor = doc._masterEditor._codeMirror;

                // change editor content, followed by undo and redo
                doc.setText(TEST_JS_NEW_CONTENT);

                editor.undo();
                expect(doc.getText()).toBe(TEST_JS_CONTENT);

                editor.redo();
                expect(doc.getText()).toBe(TEST_JS_NEW_CONTENT);

                expect(doc.isDirty).toBe(true);
            });

            it("should report not dirty after explicit clean", async function () {
                var doc = DocumentManager.getCurrentDocument();

                doc.setText(TEST_JS_NEW_CONTENT);
                doc._markClean();
                expect(doc.isDirty).toBe(false);
            });

            it("should report not dirty after undo", async function () {
                // change editor content, followed by undo
                var doc = DocumentManager.getCurrentDocument();
                var editor = doc._masterEditor._codeMirror;

                doc.setText(TEST_JS_NEW_CONTENT);
                editor.undo();

                // verify Document dirty status
                expect(doc.getText()).toBe(TEST_JS_CONTENT);
                expect(DocumentManager.getCurrentDocument().isDirty).toBe(false);
            });

            it("should update dirty flag with undo/redo after explicit clean", async function () {
                var doc = DocumentManager.getCurrentDocument();
                var editor = doc._masterEditor._codeMirror;

                // Change editor content and make that the new clean state
                doc.setText(TEST_JS_NEW_CONTENT);
                doc._markClean();

                // Undo past the clean state (and back to counter == 0)
                editor.undo();
                expect(doc.isDirty).toBe(true);
                expect(doc.getText()).toBe(TEST_JS_CONTENT);

                // Redo: should be clean again
                editor.redo();
                expect(doc.isDirty).toBe(false);
                expect(doc.getText()).toBe(TEST_JS_NEW_CONTENT);

                // Add another change
                doc.setText(TEST_JS_SECOND_NEW_CONTENT);
                expect(doc.getText()).toBe(TEST_JS_SECOND_NEW_CONTENT);
                expect(doc.isDirty).toBe(true);

                // Undo back to clean state
                editor.undo();
                expect(doc.isDirty).toBe(false);
                expect(doc.getText()).toBe(TEST_JS_NEW_CONTENT);
            });

            it("should report dirty after undo past clean state, followed by new change", async function () {
                // Change editor content and make that the new clean state
                var doc = DocumentManager.getCurrentDocument();
                var editor = doc._masterEditor._codeMirror;

                doc.setText(TEST_JS_NEW_CONTENT);
                doc._markClean();

                // Undo past the clean state (and back to counter == 0)
                editor.undo();
                expect(doc.isDirty).toBe(true);

                // Make a new change - should remain dirty
                doc.setText(TEST_JS_SECOND_NEW_CONTENT);
                expect(doc.isDirty).toBe(true);

                // Should be impossible to get back to clean via undo/redo
                editor.undo();
                expect(doc.isDirty).toBe(true);
                expect(doc.getText()).toBe(TEST_JS_CONTENT);

                editor.redo();
                expect(doc.isDirty).toBe(true);
                expect(doc.getText()).toBe(TEST_JS_SECOND_NEW_CONTENT);
            });

        });


        describe("Decorated Path Parser", function () {
            it("should correctly parse decorated paths", function () {
                var path = testPath + "/test.js";

                expect(DocumentCommandHandlers._parseDecoratedPath(null)).toEqual({path: null, line: null, column: null});
                expect(DocumentCommandHandlers._parseDecoratedPath(path)).toEqual({path: path, line: null, column: null});
                expect(DocumentCommandHandlers._parseDecoratedPath(path + ":123")).toEqual({path: path, line: 123, column: null});
                expect(DocumentCommandHandlers._parseDecoratedPath(path + ":123:456")).toEqual({path: path, line: 123, column: 456});
            });
        });


        describe("Open image files", function () {
            it("document & editor should be null after opening an image", async function () {
                var path = testPath + "/couz.png",
                    promise;
                promise = CommandManager.execute(Commands.FILE_OPEN, { fullPath: path });
                await awaitsForDone(promise, Commands.FILE_OPEN);

                expect(EditorManager.getActiveEditor()).toBeFalsy();
                expect(EditorManager.getCurrentFullEditor()).toBeFalsy();
                expect(EditorManager.getFocusedEditor()).toBeFalsy();
                expect(MainViewManager.getCurrentlyViewedPath(MainViewManager.ACTIVE_PANE)).toEqual(path);
                var d = DocumentManager.getCurrentDocument();
                expect(d).toBeFalsy();
            });

            it("opening image while text file open should fire currentDocumentChange and activeEditorChange events", async function () {
                var promise,
                    docChangeListener = jasmine.createSpy(),
                    activeEditorChangeListener = jasmine.createSpy();

                DocumentManager.on("currentDocumentChange", docChangeListener);
                EditorManager.on("activeEditorChange", activeEditorChangeListener);


                promise = CommandManager.execute(Commands.FILE_OPEN, { fullPath: testPath + "/test.js" });
                await awaitsForDone(promise, Commands.FILE_OPEN);
                expect(docChangeListener.calls.count()).toBe(1);
                expect(activeEditorChangeListener.calls.count()).toBe(1);

                promise = CommandManager.execute(Commands.FILE_OPEN, { fullPath: testPath + "/couz.png" });
                await awaitsForDone(promise, Commands.FILE_OPEN);
                expect(docChangeListener.calls.count()).toBe(2);
                expect(activeEditorChangeListener.calls.count()).toBe(2);
                DocumentManager.off("currentDocumentChange", docChangeListener);
                EditorManager.off("activeEditorChange", activeEditorChangeListener);
            });

            it("opening image while nothing open should NOT fire currentDocumentChange and activeEditorChange events", async function () {
                var promise,
                    docChangeListener = jasmine.createSpy(),
                    activeEditorChangeListener = jasmine.createSpy();

                DocumentManager.on("currentDocumentChange", docChangeListener);
                EditorManager.on("activeEditorChange", activeEditorChangeListener);

                promise = CommandManager.execute(Commands.FILE_OPEN, { fullPath: testPath + "/couz.png" });
                await awaitsForDone(promise, Commands.FILE_OPEN);
                expect(docChangeListener.calls.count()).toBe(0);
                expect(activeEditorChangeListener.calls.count()).toBe(0);

                promise = CommandManager.execute(Commands.FILE_OPEN, { fullPath: testPath + "/couz2.png" });
                await awaitsForDone(promise, Commands.FILE_OPEN);
                expect(docChangeListener.calls.count()).toBe(0);
                expect(activeEditorChangeListener.calls.count()).toBe(0);
                DocumentManager.off("currentDocumentChange", docChangeListener);
                EditorManager.off("activeEditorChange", activeEditorChangeListener);

            });

            it("opening text file while other text open should fire currentDocumentChange and activeEditorChange events", async function () {
                var promise,
                    docChangeListener = jasmine.createSpy(),
                    activeEditorChangeListener = jasmine.createSpy();

                DocumentManager.on("currentDocumentChange", docChangeListener);
                EditorManager.on("activeEditorChange", activeEditorChangeListener);


                promise = CommandManager.execute(Commands.FILE_OPEN, { fullPath: testPath + "/test.js" });
                await awaitsForDone(promise, Commands.FILE_OPEN);
                expect(docChangeListener.calls.count()).toBe(1);
                expect(activeEditorChangeListener.calls.count()).toBe(1);

                promise = CommandManager.execute(Commands.FILE_OPEN, { fullPath: testPath + "/test2.js" });
                await awaitsForDone(promise, Commands.FILE_OPEN);
                expect(docChangeListener.calls.count()).toBe(2);
                expect(activeEditorChangeListener.calls.count()).toBe(2);
                DocumentManager.off("currentDocumentChange", docChangeListener);
                EditorManager.off("activeEditorChange", activeEditorChangeListener);
            });

            it("should return an editor after opening a text file", async function () {
                var path = testPath + "/test.js",
                    promise;
                promise = CommandManager.execute(Commands.FILE_OPEN, { fullPath: path });
                await awaitsForDone(promise, Commands.FILE_OPEN);

                var e = EditorManager.getActiveEditor();
                expect(e.document.file.fullPath).toBe(path);

                e = EditorManager.getCurrentFullEditor();
                expect(e.document.file.fullPath).toBe(path);

                e = EditorManager.getFocusedEditor();
                expect(e.document.file.fullPath).toBe(path);

                expect(MainViewManager.getCurrentlyViewedPath()).toEqual(path);
            });
        });


        describe("Scrolling", function () {
            it("should scroll when moving the cursor to the end of a really long line", async function () {
                promise = CommandManager.execute(Commands.FILE_NEW_UNTITLED);
                await awaitsForDone(promise, Commands.FILE_NEW_UNTITLED);

                var myEditor = EditorManager.getActiveEditor();
                // turn off word-wrap
                myEditor._codeMirror.setOption("lineWrapping", false);
                myEditor.document.setText("ddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd some really long line");
                myEditor.setCursorPos(1, 1);
                myEditor._codeMirror.execCommand("goLineEnd");

                var se = myEditor.getScrollerElement(),
                    sp = se.scrollLeft,
                    $se = _$(se);

                // really big number -- will scroll to the end of the line
                $se.scrollLeft(99999999);
                expect(sp).toEqual(se.scrollLeft);
            });
        });

    });
});
