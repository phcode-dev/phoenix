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

/*global jasmine, describe, beforeAll, afterAll,beforeEach, afterEach, it, expect, awaitsForDone, awaitsFor, spyOn */

define(function (require, exports, module) {


    // Load dependent modules
    var CommandManager,      // loaded from brackets.test
        Commands,            // loaded from brackets.test
        EditorManager,       // loaded from brackets.test
        DocumentModule,      // loaded from brackets.test
        DocumentManager,     // loaded from brackets.test
        Editor,     // loaded from brackets.test
        MainViewManager,     // loaded from brackets.test
        SpecRunnerUtils     = require("spec/SpecRunnerUtils");
    let FileSyncManager, FileUtils, FileSystem, Dialogs;

    describe("LegacyInteg:Document Integration", function () {

        var testPath = SpecRunnerUtils.getTestPath("/spec/Document-test-files"),
            testWindow,
            $;

        beforeAll(async function () {
            testWindow = await SpecRunnerUtils.createTestWindowAndRun({forceReload: true});
            $ = testWindow.$;

            // Load module instances from brackets.test
            CommandManager      = testWindow.brackets.test.CommandManager;
            Commands            = testWindow.brackets.test.Commands;
            EditorManager       = testWindow.brackets.test.EditorManager;
            DocumentModule      = testWindow.brackets.test.DocumentModule;
            DocumentManager     = testWindow.brackets.test.DocumentManager;
            MainViewManager     = testWindow.brackets.test.MainViewManager;
            FileSyncManager     = testWindow.brackets.test.FileSyncManager;
            FileUtils           = testWindow.brackets.test.FileUtils;
            FileSystem          = testWindow.brackets.test.FileSystem;
            Dialogs             = testWindow.brackets.test.Dialogs;
            Editor     = testWindow.brackets.test.Editor;

            await SpecRunnerUtils.loadProjectInTestWindow(testPath);
        }, 30000);

        afterAll(async function () {
            testWindow      = null;
            CommandManager  = null;
            Commands        = null;
            EditorManager   = null;
            DocumentModule  = null;
            DocumentManager = null;
            MainViewManager = null;
            FileSyncManager = null;
            FileUtils = null;
            FileSystem = null;
            Dialogs = null;
            await SpecRunnerUtils.closeTestWindow();
            testWindow = null;
        }, 30000);

        afterEach(async function () {
            await testWindow.closeAllFiles();
            await awaitsFor(() => DocumentManager.getAllOpenDocuments().length === 0,
                "background readers to release closed documents");
            DocumentModule.off(".docTest");
        });

        var JS_FILE   = testPath + "/test.js",
            CSS_FILE  = testPath + "/test.css",
            HTML_FILE = testPath + "/test.html";

        describe("External file refresh", function () {
            let pendingReads = [];
            let refreshDocuments = [];
            let temporaryFiles = [];

            afterEach(async function () {
                // Unblock FileSyncManager even if a test fails before releasing its read.
                pendingReads.forEach(read => read.reject("TEST_REFRESH_CANCELLED"));
                refreshDocuments.forEach(doc => { doc.isSaving = false; });
                pendingReads = [];
                refreshDocuments = [];
                for (const file of temporaryFiles) {
                    await awaitsForDone(CommandManager.execute(Commands.FILE_CLOSE,
                        {file, _forceClose: true}), "close refresh fixture");
                    await awaitsForDone(SpecRunnerUtils.deletePath(file.fullPath), "remove refresh fixture");
                }
                temporaryFiles = [];
            });

            /**
             * Hold a disk refresh until the test has changed the open document.
             * @param {string=} dirtyText Initial unsaved text to discard through the conflict dialog.
             * @param {Object=} options Optional classification hook or conflict-dialog choice.
             * @return {Promise<Object>} Document, read state and controls for completing or retrying the refresh.
             */
            async function startRefresh(dirtyText, options = {}) {
                const path = options.path || JS_FILE;
                await awaitsForDone(CommandManager.execute(Commands.FILE_OPEN, {fullPath: path}), "open refresh document");
                const doc = DocumentManager.getOpenDocumentForPath(path);
                refreshDocuments.push(doc);
                if (dirtyText !== undefined) {
                    doc.setText(dirtyText);
                    spyOn(Dialogs, "showModalDialog").and.returnValue(
                        $.Deferred().resolve(options.choice || Dialogs.DIALOG_BTN_DONTSAVE).promise());
                }
                const diskTime = new Date(doc.diskTimestamp.getTime() + 1000);
                const initialRefCount = doc._refCount;
                const pendingRead = new $.Deferred();
                pendingReads.push(pendingRead);
                let classified = false;
                const stat = spyOn(doc.file, "stat").and.callFake(callback => {
                    callback(null, {mtime: diskTime});
                    if (options.afterClassification) {
                        options.afterClassification(doc);
                    }
                    classified = true;
                });
                let readingDocument = false;
                const readAsText = FileUtils.readAsText;
                const read = spyOn(FileUtils, "readAsText").and.callFake(function (file) {
                    if (file.fullPath === doc.file.fullPath) {
                        readingDocument = true;
                        return pendingRead.promise();
                    }
                    return readAsText.apply(this, arguments);
                });
                FileSyncManager.syncOpenDocuments();
                try {
                    await awaitsFor(() => options.skipRead ? classified : readingDocument,
                        "external refresh to reach the expected phase");
                } finally {
                    // Restore metadata access before resolving the read so a subsequent
                    // focus event cannot start another synthetic external-change check.
                    stat.and.callThrough();
                    read.and.callThrough();
                }
                return {
                    doc,
                    diskTime,
                    initialRefCount,
                    readingDocument,
                    finish: text => pendingRead.resolve(text, diskTime),
                    fail: error => pendingRead.reject(error),
                    retry: function (text) {
                        stat.and.callFake(callback => callback(null, {mtime: diskTime}));
                        read.and.callFake(file => file === doc.file
                            ? $.Deferred().resolve(text, diskTime).promise() : readAsText(file));
                        try {
                            FileSyncManager.syncOpenDocuments();
                        } finally {
                            stat.and.callThrough();
                            read.and.callThrough();
                        }
                    }
                };
            }

            /**
             * Hold actual disk-read bytes while the normal save command writes a newer version.
             * Only delivery of the read result is delayed; file reads, writes and saves remain real.
             * @param {string=} dirtyText Unsaved text present when the user chooses to reload.
             * @return {Promise<Object>} Document, captured disk contents and a read completion callback.
             */
            async function startRealRefresh(dirtyText) {
                await SpecRunnerUtils.createTempDirectory();
                const path = SpecRunnerUtils.getTempDirectory() + "/filesync-" + Date.now() + ".txt";
                const file = FileSystem.getFileForPath(path);
                temporaryFiles.push(file);
                await awaitsForDone(FileUtils.writeText(file, "initial content", true), "create refresh fixture");
                await awaitsForDone(CommandManager.execute(Commands.FILE_OPEN, {fullPath: path}), "open refresh fixture");
                const doc = DocumentManager.getOpenDocumentForPath(path);
                refreshDocuments.push(doc);
                if (dirtyText !== undefined) {
                    doc.setText(dirtyText);
                    spyOn(Dialogs, "showModalDialog").and.returnValue(
                        $.Deferred().resolve(Dialogs.DIALOG_BTN_DONTSAVE).promise());
                }
                const pendingRead = new $.Deferred();
                pendingReads.push(pendingRead);
                const readAsText = FileUtils.readAsText;
                let captured;
                let intercepted = false;
                const read = spyOn(FileUtils, "readAsText").and.callFake(function (readFile) {
                    if (readFile === file && !intercepted) {
                        intercepted = true;
                        // Bypass File's cache so the captured bytes come from the filesystem.
                        const result = readAsText.call(this, readFile, true);
                        result.done((text, timestamp) => { captured = {text, timestamp}; });
                        result.fail(error => pendingRead.reject(error));
                        return pendingRead.promise();
                    }
                    return readAsText.apply(this, arguments);
                });
                try {
                    await awaitsForDone(FileUtils.writeText(file, "external content", true), "write external version");
                    FileSyncManager.syncOpenDocuments();
                    await awaitsFor(() => captured, "capture actual external disk contents");
                } finally {
                    read.and.callThrough();
                }
                expect(captured.text).toBe("external content");
                return {
                    doc,
                    finish: () => pendingRead.resolve(captured.text, captured.timestamp)
                };
            }

            it("should apply a disk refresh when the document has not changed", async function () {
                const refresh = await startRefresh();
                refresh.finish("external content");
                expect(refresh.doc.getText()).toBe("external content");
                expect(refresh.doc.isDirty).toBeFalse();
                // Refreshing text also starts linting, which temporarily owns a document reference.
                await awaitsFor(() => refresh.doc._refCount <= refresh.initialRefCount,
                    "the refresh and background inspection to release their references");
            });

            it("should preserve edits made while a disk refresh is pending", async function () {
                const refresh = await startRefresh();
                refresh.doc.setText("newer edit");
                refresh.finish("older disk content");
                expect(refresh.doc.getText()).toBe("newer edit");
                expect(refresh.doc.isDirty).toBeTrue();
            });

            it("should preserve a newer clean version while a disk refresh is pending", async function () {
                const refresh = await startRefresh();
                const newerTime = new Date(refresh.doc.diskTimestamp.getTime() + 2000);
                refresh.doc.refreshText("newer restored content", newerTime);
                refresh.finish("older disk content");
                expect(refresh.doc.getText()).toBe("newer restored content");
                expect(refresh.doc.diskTimestamp).toBe(newerTime);
                expect(refresh.doc.isDirty).toBeFalse();
            });

            it("should discard unsaved changes when the user chooses to reload from disk", async function () {
                const refresh = await startRefresh("unsaved changes");
                expect(Dialogs.showModalDialog).toHaveBeenCalled();
                refresh.finish("external content");
                expect(refresh.doc.getText()).toBe("external content");
                expect(refresh.doc.isDirty).toBeFalse();
            });

            it("should preserve edits made after the user chooses to reload from disk", async function () {
                const refresh = await startRefresh("unsaved changes");
                refresh.doc.setText("edit after confirming reload");
                refresh.finish("older disk content");
                expect(refresh.doc.getText()).toBe("edit after confirming reload");
                expect(refresh.doc.isDirty).toBeTrue();
            });

            it("should preserve edits made after classification but before reading", async function () {
                const refresh = await startRefresh(undefined, {
                    afterClassification: doc => doc.setText("edit after classification"),
                    skipRead: true
                });
                expect(refresh.readingDocument).toBeFalse();
                refresh.finish("older disk content");
                expect(refresh.doc.getText()).toBe("edit after classification");
                expect(refresh.doc.isDirty).toBeTrue();
            });

            it("should not start a refresh while the document is saving", async function () {
                const refresh = await startRefresh(undefined, {
                    afterClassification: doc => { doc.isSaving = true; },
                    skipRead: true
                });
                const text = refresh.doc.getText();
                expect(refresh.readingDocument).toBeFalse();
                refresh.finish("older disk content");
                expect(refresh.doc.getText()).toBe(text);
            });

            it("should protect later documents in a batch without treating their index as discard permission", async function () {
                await awaitsForDone(CommandManager.execute(Commands.CMD_ADD_TO_WORKINGSET_AND_OPEN,
                    {fullPath: HTML_FILE}), "retain first document in working set");
                const firstDoc = DocumentManager.getOpenDocumentForPath(HTML_FILE);
                firstDoc.addRef();
                let firstStat;
                let openDocuments;
                try {
                    await awaitsForDone(CommandManager.execute(Commands.FILE_OPEN,
                        {fullPath: JS_FILE}), "open second document before installing metadata spies");
                    const secondDoc = DocumentManager.getOpenDocumentForPath(JS_FILE);
                    // Document ids depend on earlier file discovery; explicitly exercise index 1.
                    openDocuments = spyOn(DocumentManager, "getAllOpenDocuments")
                        .and.returnValue([firstDoc, secondDoc]);
                    const firstTime = new Date(firstDoc.diskTimestamp.getTime() + 1000);
                    firstStat = spyOn(firstDoc.file, "stat").and.callFake(callback => {
                        callback(null, {mtime: firstTime});
                    });
                    const refresh = await startRefresh(undefined, {
                        path: JS_FILE,
                        afterClassification: doc => {
                            firstStat.and.callThrough();
                            doc.setText("newer second document");
                        },
                        skipRead: true
                    });
                    expect(FileUtils.readAsText.calls.allArgs().some(args => args[0] === firstDoc.file))
                        .withContext(JSON.stringify({
                            reads: FileUtils.readAsText.calls.allArgs().map(args => args[0].fullPath),
                            stats: firstStat.calls.count(),
                            dirty: firstDoc.isDirty,
                            saving: firstDoc.isSaving,
                            open: DocumentManager.getAllOpenDocuments().map(doc => doc.file.fullPath)
                        })).toBeTrue();
                    expect(refresh.readingDocument).toBeFalse();
                    refresh.finish("older second document");
                    expect(refresh.doc.getText()).toBe("newer second document");
                    expect(refresh.doc.isDirty).toBeTrue();
                } finally {
                    if (firstStat) {
                        firstStat.and.callThrough();
                    }
                    if (openDocuments) {
                        openDocuments.and.callThrough();
                    }
                    firstDoc.releaseRef();
                }
            });

            it("should not apply a pending refresh while the document is saving", async function () {
                const refresh = await startRefresh();
                const text = refresh.doc.getText();
                const timestamp = refresh.doc.diskTimestamp;
                refresh.doc.isSaving = true;
                refresh.finish("older disk content");
                expect(refresh.doc.getText()).toBe(text);
                expect(refresh.doc.diskTimestamp).toBe(timestamp);
            });

            it("should retain undo history when rejecting a stale read", async function () {
                const refresh = await startRefresh();
                const original = refresh.doc.getText();
                refresh.doc.replaceRange("new edit\n", {line: 0, ch: 0});
                refresh.finish("older disk content");
                EditorManager.getActiveEditor().undo();
                expect(refresh.doc.getText()).toBe(original);
            });

            it("should keep unsaved changes when the user declines a disk reload", async function () {
                const refresh = await startRefresh("keep my edits", {
                    choice: Dialogs.DIALOG_BTN_CANCEL,
                    skipRead: true
                });
                expect(Dialogs.showModalDialog).toHaveBeenCalled();
                expect(refresh.readingDocument).toBeFalse();
                expect(refresh.doc.getText()).toBe("keep my edits");
                expect(refresh.doc.isDirty).toBeTrue();
                expect(refresh.doc.keepChangesTime).toBe(refresh.diskTime.getTime());
            });

            it("should leave the document unchanged after a failed read and allow a later refresh", async function () {
                const refresh = await startRefresh();
                const text = refresh.doc.getText();
                const timestamp = refresh.doc.diskTimestamp;
                refresh.fail("NOT_READABLE");
                expect(refresh.doc.getText()).toBe(text);
                expect(refresh.doc.diskTimestamp).toBe(timestamp);
                expect(refresh.doc._refCount).toBe(refresh.initialRefCount);
                refresh.retry("successful retry");
                expect(refresh.doc.getText()).toBe("successful retry");
                expect(refresh.doc.diskTimestamp).toBe(refresh.diskTime);
            });

            it("should allow a later refresh after rejecting a stale read", async function () {
                const refresh = await startRefresh();
                refresh.doc.replaceRange("new edit\n", {line: 0, ch: 0});
                refresh.finish("older disk content");
                EditorManager.getActiveEditor().undo();
                expect(refresh.doc.isDirty).toBeFalse();
                refresh.retry("latest disk version");
                expect(refresh.doc.getText()).toBe("latest disk version");
                expect(refresh.doc.isDirty).toBeFalse();
            });

            it("should retain unsaved edits and report an error when a confirmed reload fails", async function () {
                const refresh = await startRefresh("unsaved edits");
                refresh.fail("NOT_READABLE");
                expect(Dialogs.showModalDialog.calls.count()).toBe(2);
                expect(refresh.doc.getText()).toBe("unsaved edits");
                expect(refresh.doc.isDirty).toBeTrue();
                expect(refresh.doc._refCount).toBe(refresh.initialRefCount);
            });

            it("should preserve a real save completed while an older disk read is pending", async function () {
                const refresh = await startRealRefresh();
                refresh.doc.setText("newer saved content");
                await awaitsForDone(CommandManager.execute(Commands.FILE_SAVE, {doc: refresh.doc}), "save newer edit");
                expect(refresh.doc.isDirty).toBeFalse();
                expect(refresh.doc.isSaving).toBeFalse();
                refresh.finish();
                expect(refresh.doc.getText()).toBe("newer saved content");
                expect(await FileUtils.readAsText(refresh.doc.file, true)).toBe("newer saved content");
            });

            it("should release a deleted document and ignore its pending read", async function () {
                const refresh = await startRefresh();
                const refreshText = spyOn(refresh.doc, "refreshText").and.callThrough();
                DocumentManager.notifyFileDeleted(refresh.doc.file);
                expect(DocumentManager.getOpenDocumentForPath(refresh.doc.file.fullPath)).toBeFalsy();
                refresh.finish("content from before deletion");
                expect(refreshText).not.toHaveBeenCalled();
                expect(refresh.doc._refCount).toBe(0);
            });

            it("should not resurrect a document deleted between classification and reading", async function () {
                const refresh = await startRefresh(undefined, {
                    afterClassification: doc => DocumentManager.notifyFileDeleted(doc.file),
                    skipRead: true
                });
                expect(refresh.readingDocument).toBeFalse();
                expect(DocumentManager.getOpenDocumentForPath(refresh.doc.file.fullPath)).toBeFalsy();
                expect(refresh.doc._refCount).toBe(0);
                refresh.finish("content from before deletion");
                expect(refresh.doc._refCount).toBe(0);
            });

            it("should preserve a save made after choosing reload without another text edit", async function () {
                const refresh = await startRealRefresh("edits saved after choosing reload");
                await awaitsForDone(CommandManager.execute(Commands.FILE_SAVE, {doc: refresh.doc}), "save existing edits");
                expect(refresh.doc.isDirty).toBeFalse();
                expect(refresh.doc.isSaving).toBeFalse();
                refresh.finish();
                expect(refresh.doc.getText()).toBe("edits saved after choosing reload");
                expect(await FileUtils.readAsText(refresh.doc.file, true)).toBe("edits saved after choosing reload");
            });
        });


        describe("Dirty flag and undo", function () {
            var promise;

            it("should not fire dirtyFlagChange when created", async function () {
                let dirtyFlagListener = jasmine.createSpy();
                DocumentManager.on("dirtyFlagChange", dirtyFlagListener);

                promise = DocumentManager.getDocumentForPath(JS_FILE);
                await awaitsForDone(promise);
                expect(dirtyFlagListener.calls.count()).toBe(0);
                DocumentManager.off("dirtyFlagChange", dirtyFlagListener);
            });

            it("should clear dirty flag, preserve undo when marked saved", async function () {
                let dirtyFlagListener = jasmine.createSpy();
                DocumentManager.on("dirtyFlagChange", dirtyFlagListener);

                promise = CommandManager.execute(Commands.FILE_OPEN, {fullPath: JS_FILE});
                await awaitsForDone(promise);
                let doc = DocumentManager.getOpenDocumentForPath(JS_FILE);
                expect(doc.isDirty).toBe(false);
                expect(doc._masterEditor._codeMirror.historySize().undo).toBe(0);

                // Make an edit (make dirty)
                doc.replaceRange("Foo", {line: 0, ch: 0});
                expect(doc.isDirty).toBe(true);
                expect(doc._masterEditor._codeMirror.historySize().undo).toBe(1);
                expect(dirtyFlagListener.calls.count()).toBe(1);

                // Mark saved (e.g. called by Save command)
                doc.notifySaved();
                expect(doc.isDirty).toBe(false);
                expect(doc._masterEditor._codeMirror.historySize().undo).toBe(1); // still has undo history
                expect(dirtyFlagListener.calls.count()).toBe(2);

                DocumentManager.off("dirtyFlagChange", dirtyFlagListener);
            });

            it("should clear dirty flag but preserve undo history when text reset", async function () {
                let dirtyFlagListener = jasmine.createSpy(),
                    changeListener    = jasmine.createSpy();
                DocumentManager.on("dirtyFlagChange", dirtyFlagListener);

                promise = CommandManager.execute(Commands.FILE_OPEN, {fullPath: JS_FILE});
                await awaitsForDone(promise);
                let doc = DocumentManager.getOpenDocumentForPath(JS_FILE);
                doc.on("change", changeListener);

                expect(doc.isDirty).toBe(false);
                expect(doc._masterEditor._codeMirror.historySize().undo).toBe(0);

                // Make an edit (make dirty)
                doc.replaceRange("Foo", {line: 0, ch: 0});
                expect(doc.isDirty).toBe(true);
                expect(doc._masterEditor._codeMirror.historySize().undo).toBe(1);
                expect(dirtyFlagListener.calls.count()).toBe(1);
                expect(changeListener.calls.count()).toBe(1);

                // Reset text (e.g. called by Revert command, or syncing external changes).
                // Editor._resetText now uses replaceRange instead of setValue+clearHistory
                // so the user can ctrl-z back to their pre-revert state. markClean
                // still resets the dirty flag relative to the new generation.
                doc.refreshText("New content", Date.now());
                expect(doc.isDirty).toBe(false);
                // Undo history is PRESERVED — the refreshText replaceRange adds a
                // second entry on top of the original "Foo" edit.
                expect(doc._masterEditor._codeMirror.historySize().undo).toBe(2);
                expect(dirtyFlagListener.calls.count()).toBe(2);
                expect(changeListener.calls.count()).toBe(2);

                doc.off("change", changeListener);
                DocumentManager.off("dirtyFlagChange", dirtyFlagListener);
            });

            it("should fire change but not dirtyFlagChange when clean text reset, with editor", async function () {
                // bug #502
                let dirtyFlagListener = jasmine.createSpy(),
                    changeListener    = jasmine.createSpy();
                DocumentManager.on("dirtyFlagChange", dirtyFlagListener);

                promise = CommandManager.execute(Commands.FILE_OPEN, {fullPath: JS_FILE});
                await awaitsForDone(promise, "Open file");

                let doc = DocumentManager.getOpenDocumentForPath(JS_FILE);
                doc.on("change", changeListener);

                expect(doc.isDirty).toBe(false);
                expect(doc._masterEditor._codeMirror.historySize().undo).toBe(0);

                doc.refreshText("New content", Date.now());  // e.g. syncing external changes
                expect(doc.isDirty).toBe(false);
                // The replaceRange used by Editor._resetText records one undo entry
                // so the user can ctrl-z back to the pre-reset content.
                expect(doc._masterEditor._codeMirror.historySize().undo).toBe(1);
                expect(dirtyFlagListener.calls.count()).toBe(0);  // isDirty hasn't changed
                expect(changeListener.calls.count()).toBe(1);     // but still counts as a content change

                doc.off("change", changeListener);
                DocumentManager.off("dirtyFlagChange", dirtyFlagListener);
            });

            it("should fire change but not dirtyFlagChange when clean text reset, without editor", async function () {
                let dirtyFlagListener = jasmine.createSpy(),
                    changeListener    = jasmine.createSpy(),
                    doc;
                DocumentManager.on("dirtyFlagChange", dirtyFlagListener);

                promise = DocumentManager.getDocumentForPath(JS_FILE)
                    .done(function (result) { doc = result; });
                await awaitsForDone(promise, "Create Document");
                doc.on("change", changeListener);

                expect(doc._masterEditor).toBeFalsy();
                expect(doc.isDirty).toBe(false);

                doc.refreshText("New content", Date.now());  // e.g. syncing external changes
                expect(doc.isDirty).toBe(false);
                expect(dirtyFlagListener.calls.count()).toBe(0);
                expect(changeListener.calls.count()).toBe(1);   // resetting text is still a content change

                doc.off("change", changeListener);
                DocumentManager.off("dirtyFlagChange", dirtyFlagListener);
                doc = null;
            });

            it("should not clean history when reset is called with the same text as in the editor", async function () {
                promise = CommandManager.execute(Commands.FILE_OPEN, {fullPath: JS_FILE});
                await awaitsForDone(promise, "Open file");
                var doc = DocumentManager.getOpenDocumentForPath(JS_FILE);

                // Put some text into editor
                doc.setText("Foo");
                expect(doc._masterEditor._codeMirror.historySize().undo).toBe(1);

                // Reset text with the same value, expect history not to change
                doc.refreshText("Foo", Date.now());
                expect(doc._masterEditor._codeMirror.historySize().undo).toBe(1);
            });

            it("should not clean history when reset is called with the same text with different line-endings", async function () {
                promise = CommandManager.execute(Commands.FILE_OPEN, {fullPath: JS_FILE});
                await awaitsForDone(promise, "Open file");
                var doc = DocumentManager.getOpenDocumentForPath(JS_FILE);
                var crlf = "a\r\nb\r\nc";
                var lf = "a\nb\nc";

                // Put some text into editor
                doc.setText(crlf);
                expect(doc._masterEditor._codeMirror.historySize().undo).toBe(1);

                // Reset text with the same value, expect history not to change
                doc.refreshText(lf, Date.now());
                expect(doc._masterEditor._codeMirror.historySize().undo).toBe(1);

                // Reset text with the same value, expect history not to change
                doc.refreshText(crlf, Date.now());
                expect(doc._masterEditor._codeMirror.historySize().undo).toBe(1);
            });
        });

        describe("Refresh and change events", function () {
            var promise, changeListener, docChangeListener, doc;

            beforeEach(function () {
                changeListener = jasmine.createSpy();
                docChangeListener = jasmine.createSpy();
            });

            afterEach(function () {
                promise = null;
                changeListener = null;
                docChangeListener = null;
                doc = null;
            });

            it("should fire both change and documentChange when text is refreshed if doc does not have masterEditor", async function () {
                promise = DocumentManager.getDocumentForPath(JS_FILE)
                    .done(function (result) { doc = result; });
                await awaitsForDone(promise, "Create Document");
                DocumentModule.on("documentChange.docTest", docChangeListener);
                doc.on("change", changeListener);

                expect(doc._masterEditor).toBeFalsy();

                doc.refreshText("New content", Date.now());

                expect(doc._masterEditor).toBeFalsy();
                expect(docChangeListener.calls.count()).toBe(1);
                expect(changeListener.calls.count()).toBe(1);
            });

            it("should fire both change and documentChange when text is refreshed if doc has masterEditor", async function () {
                promise = DocumentManager.getDocumentForPath(JS_FILE)
                    .done(function (result) { doc = result; });
                await awaitsForDone(promise, "Create Document");
                expect(doc._masterEditor).toBeFalsy();
                doc.setText("first edit");
                expect(doc._masterEditor).toBeTruthy();

                DocumentModule.on("documentChange.docTest", docChangeListener);
                doc.on("change", changeListener);

                doc.refreshText("New content", Date.now());

                expect(docChangeListener.calls.count()).toBe(1);
                expect(changeListener.calls.count()).toBe(1);
            });

            it("should *not* fire documentChange when a document is first created", async function () {
                DocumentModule.on("documentChange.docTest", docChangeListener);
                await awaitsForDone(DocumentManager.getDocumentForPath(JS_FILE));
                expect(docChangeListener.calls.count()).toBe(0);
            });
        });

        describe("Ref counting", function () {

            // TODO: additional, simpler ref counting test cases such as Live Development, open/close inline editor (refs from
            //  both editor & rule list TextRanges), navigate files w/o adding to working set, etc.

            async function testRef(useAutoTabSpaces) {
                var promise,
                    cssDoc,
                    cssMasterEditor;
                Editor.Editor.setAutoTabSpaces(useAutoTabSpaces);
                promise = CommandManager.execute(Commands.CMD_ADD_TO_WORKINGSET_AND_OPEN, {fullPath: HTML_FILE});
                await awaitsForDone(promise, "Open into working set");

                // Open inline editor onto test.css's ".testClass" rule
                promise = SpecRunnerUtils.toggleQuickEditAtOffset(EditorManager.getCurrentFullEditor(), {line: 8, ch: 4});
                await awaitsForDone(promise, "Open inline editor");

                expect(MainViewManager.findInWorkingSet(MainViewManager.ACTIVE_PANE, CSS_FILE)).toBe(-1);
                expect(DocumentManager.getOpenDocumentForPath(CSS_FILE)).toBeTruthy();

                // Force creation of master editor for CSS file
                cssDoc = DocumentManager.getOpenDocumentForPath(CSS_FILE);
                if(!useAutoTabSpaces){
                    // if auto tab spaces is enabled, the space detect algo will read the file contents for detecting
                    // spacing, so these 2 lines won't apply.
                    expect(cssDoc._masterEditor).toBeFalsy();
                    DocumentManager.getOpenDocumentForPath(CSS_FILE).getLine(0);
                }
                expect(cssDoc._masterEditor).toBeTruthy();

                // Close inline editor
                var hostEditor = EditorManager.getCurrentFullEditor();
                var inlineWidget = hostEditor.getInlineWidgets()[0];
                await awaitsForDone(EditorManager.closeInlineWidget(hostEditor, inlineWidget), "close inline editor");

                // Now there are no parts of Brackets that need to keep the CSS Document alive (its only ref is its own master
                // Editor and that Editor isn't accessible in the UI anywhere). It's ready to get "GCed" by DocumentManager as
                // soon as it hits a trigger point for doing so.
                expect(DocumentManager.getOpenDocumentForPath(CSS_FILE)).toBeTruthy();
                expect(cssDoc._refCount).toBe(1);
                expect(cssDoc._masterEditor).toBeTruthy();
                expect(testWindow.$(".CodeMirror").length).toBe(2);   // HTML editor (current) & CSS editor (dangling)

                // Switch to a third file - trigger point for cleanup
                promise = CommandManager.execute(Commands.FILE_OPEN, {fullPath: JS_FILE});
                await awaitsForDone(promise, "Switch to other file");

                // Creation of that third file's Document should have triggered cleanup of CSS Document and its master Editor
                expect(DocumentManager.getOpenDocumentForPath(CSS_FILE)).toBeFalsy();
                expect(cssDoc._refCount).toBe(0);
                expect(cssDoc._masterEditor).toBeFalsy();
                expect(testWindow.$(".CodeMirror").length).toBe(2);   // HTML editor (working set) & JS editor (current)

                cssDoc = cssMasterEditor = null;
            }

            it("should clean up (later) a master Editor auto-created by calling read-only Document API, if Editor not used by UI", async function () {
                await testRef(false);
            });

            it("should clean up (later) a master Editor in auto tab space detect mode, auto-created by calling read-only Document API, if Editor not used by UI", async function () {
                await testRef(true);
            });
        });
    });
});
