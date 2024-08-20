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

/*global jasmine, describe, beforeAll, afterAll,beforeEach, afterEach, it, expect, awaitsForDone */

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
            await SpecRunnerUtils.closeTestWindow();
            testWindow = null;
        }, 30000);

        afterEach(async function () {
            await testWindow.closeAllFiles();
            expect(DocumentManager.getAllOpenDocuments().length).toBe(0);
            DocumentModule.off(".docTest");
        });

        var JS_FILE   = testPath + "/test.js",
            CSS_FILE  = testPath + "/test.css",
            HTML_FILE = testPath + "/test.html";


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

            it("should clear dirty flag AND undo when text reset", async function () {
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

                // Reset text (e.g. called by Revert command, or syncing external changes)
                doc.refreshText("New content", Date.now());
                expect(doc.isDirty).toBe(false);
                expect(doc._masterEditor._codeMirror.historySize().undo).toBe(0); // undo history GONE
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
                expect(doc._masterEditor._codeMirror.historySize().undo).toBe(0); // still no undo history
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
