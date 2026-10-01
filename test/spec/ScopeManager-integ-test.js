/*
 * GNU AGPL-3.0 License
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 */

/*global describe, it, expect, beforeAll, beforeEach, afterEach, awaitsForDone, awaitsFor, spyOn */

define(function (require, exports, module) {
    const SpecRunnerUtils = require("spec/SpecRunnerUtils"),
        FileSystemError = require("filesystem/FileSystemError"),
        MessageIds = JSON.parse(require("text!JSUtils/MessageIds.json"));

    describe("integration:JavaScript hint initialization", function () {
        let testWindow, FileSystem, ScopeManager, EditorManager, Session, IndexingWorker, testFolder;

        beforeAll(async function () {
            testWindow = await SpecRunnerUtils.createTestWindowAndRun();
            FileSystem = testWindow.brackets.test.FileSystem;
            EditorManager = testWindow.brackets.test.EditorManager;
            ScopeManager = testWindow.brackets.getModule("JSUtils/ScopeManager");
            Session = testWindow.brackets.getModule("JSUtils/Session");
            IndexingWorker = testWindow.brackets.getModule("worker/IndexingWorker");
        }, 30000);

        beforeEach(async function () {
            testFolder = await SpecRunnerUtils.getTempTestDirectory("/spec/TypeScriptSupport-test-files/html", true);
            await SpecRunnerUtils.loadProjectInTestWindow(testFolder);
        });

        afterEach(async function () {
            await SpecRunnerUtils.closeTestWindow();
            await Phoenix.VFS.unlinkAsync(testFolder);
        });

        /**
         * Hold preference-file lookups to control the order of project initialization.
         * @return {{callbacks: Array<Function>, restore: Function}} Pending lookups and cleanup.
         */
        function holdPreferenceReads() {
            const callbacks = [];
            const resolve = FileSystem.resolve;
            const lookup = spyOn(FileSystem, "resolve").and.callFake(function (filePath, callback) {
                if (filePath.endsWith("/.jscodehints")) {
                    callbacks.push(callback);
                    return;
                }
                return resolve.apply(this, arguments);
            });
            return {
                callbacks,
                restore: function () {
                    lookup.and.callThrough();
                    callbacks.splice(0).forEach(callback => callback(FileSystemError.NOT_FOUND));
                }
            };
        }

        it("should ignore an obsolete project preference lookup", function () {
            const reads = holdPreferenceReads();
            try {
                ScopeManager.handleProjectOpen();
                const previous = ScopeManager._readyPromise();
                ScopeManager.handleProjectOpen();
                const current = ScopeManager._readyPromise();
                expect(previous.state()).toBe("rejected");
                reads.callbacks.shift()(FileSystemError.NOT_FOUND);
                expect(current.state()).toBe("pending");
                reads.restore();
                expect(current.state()).toBe("resolved");
            } finally {
                reads.restore();
            }
        });

        it("should provide hints after project preferences interrupt editor initialization", async function () {
            const reads = holdPreferenceReads();
            try {
                ScopeManager.handleProjectOpen();
                const onPreferencesReady = spyOn(ScopeManager._readyPromise(), "done").and.callThrough();
                await awaitsForDone(SpecRunnerUtils.openProjectFiles(["embedded.html"]), "open embedded script");
                const editor = EditorManager.getCurrentFullEditor();
                editor.setCursorPos(6, 4);
                const session = new Session(editor);
                ScopeManager.handleEditorChange(session, editor.document, null);
                await awaitsFor(() => onPreferencesReady.calls.count() > 0,
                    "editor initialization to wait for preferences");
                expect(ScopeManager._readyPromise().state()).toBe("pending");

                ScopeManager.handleProjectOpen();
                reads.restore();
                ScopeManager.handleEditorChange(session, editor.document, null);
                const hints = ScopeManager.requestHints(session, editor.document);
                await awaitsFor(() => hints.state() !== "pending", "hints after interrupted initialization", 5000);
                await awaitsForDone(hints, "hints after interrupted initialization");
                expect(session.ternHints.some(hint => hint.value === "push")).toBeTrue();
            } finally {
                reads.restore();
            }
        });

        it("should finish initialization when a background directory disappears", async function () {
            await SpecRunnerUtils.createTextFileAsync(testFolder + "/hints.js", "const arr = [1, 2, 3];\narr.");
            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["hints.js"]), "open JavaScript fixture");
            const editor = EditorManager.getCurrentFullEditor();
            editor.setCursorPos(1, 4);
            const session = new Session(editor);
            await awaitsForDone(ScopeManager.requestHints(session, editor.document), "initialize Tern");

            const directoryPath = editor.document.file.parentPath;
            const resolve = FileSystem.resolve;
            let directoryReads = 0, interruptedLookup;
            const lookup = spyOn(FileSystem, "resolve").and.callFake(function (filePath, callback) {
                if (filePath === directoryPath && ++directoryReads === 2) {
                    // The first lookup initializes Tern. The second starts its background scan,
                    // after the directory could have been deleted during a project switch.
                    interruptedLookup = callback;
                    callback(FileSystemError.NOT_FOUND);
                    return;
                }
                return resolve.apply(this, arguments);
            });
            const ready = ScopeManager._maybeReset(session, editor.document, true);
            try {
                await awaitsFor(() => !!interruptedLookup, "background directory lookup");
                await awaitsFor(() => ready.state() !== "pending", "initialization after a missing directory", 5000);
                await awaitsForDone(ready, "initialization after a missing directory");
                const hints = ScopeManager.requestHints(session, editor.document);
                await awaitsForDone(hints, "hints after a missing directory");
                expect(session.ternHints.some(hint => hint.value === "push")).toBeTrue();
            } finally {
                lookup.and.callThrough();
                if (interruptedLookup && ready.state() === "pending") {
                    // Release the injected failure even if an assertion fails, so subsequent
                    // specs are not left behind the same unfinished initialization.
                    resolve.call(FileSystem, directoryPath, interruptedLookup);
                    await awaitsForDone(ready, "finish test cleanup");
                }
            }
        });

        it("should recover from a missing initial directory before switching away from a dirty document", async function () {
            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["embedded.html"]), "open embedded script");
            const editor = EditorManager.getCurrentFullEditor();
            editor.setCursorPos(6, 4);
            const session = new Session(editor);
            await awaitsForDone(ScopeManager.requestHints(session, editor.document), "initialize Tern");

            const directoryPath = editor.document.file.parentPath;
            const resolve = FileSystem.resolve;
            const lookup = spyOn(FileSystem, "resolve").and.callFake(function (filePath, callback) {
                if (filePath === directoryPath) {
                    Promise.resolve().then(() => callback(FileSystemError.NOT_FOUND));
                    return;
                }
                return resolve.apply(this, arguments);
            });
            try {
                // A fresh module completes its failed directory lookup without creating a Tern server.
                await awaitsForDone(ScopeManager._maybeReset(session, editor.document, true), "missing initial directory");
            } finally {
                lookup.and.callThrough();
            }

            editor.document.setText(editor.document.getText() + "\n<!-- unsaved edit -->");
            editor.setCursorPos(6, 4);
            ScopeManager.handleEditorChange(session, editor.document, editor.document);
            await awaitsForDone(ScopeManager.requestHints(session, editor.document), "hints after failed initialization");
            expect(session.ternHints.some(hint => hint.value === "push")).toBeTrue();
        });

        it("should initialize HTML without parsing markup as JavaScript", async function () {
            const worker = spyOn(IndexingWorker, "execPeer").and.callThrough();
            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["embedded.html"]), "open embedded script");
            const editor = EditorManager.getCurrentFullEditor();
            editor.setCursorPos(6, 4);
            const session = new Session(editor);
            await awaitsForDone(ScopeManager.requestHints(session, editor.document), "embedded script hints");

            const reads = worker.calls.allArgs().filter(args => args[0] === "invokeTernCommand" &&
                args[1].type === MessageIds.TERN_GET_FILE_MSG && args[1].file.endsWith("/embedded.html"));
            expect(reads.length).toBeGreaterThan(0);
            reads.forEach(args => expect(args[1].text).not.toContain("<html>"));
            expect(session.ternHints.some(hint => hint.value === "push")).toBeTrue();
        });

        it("should serialize editor changes queued behind initialization", async function () {
            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["embedded.html"]), "open embedded script");
            const editor = EditorManager.getCurrentFullEditor();
            editor.setCursorPos(6, 4);
            const session = new Session(editor);
            await awaitsForDone(ScopeManager.requestHints(session, editor.document), "initialize Tern");

            const documents = [];
            for (const name of ["queued-a.html", "queued-b.html", "queued-c.html"]) {
                const path = testFolder + "/" + name;
                await SpecRunnerUtils.createTextFileAsync(path, editor.document.getText());
                documents.push(await testWindow.brackets.test.DocumentManager.getDocumentForPath(path));
            }

            const directoryPath = editor.document.file.parentPath;
            const resolve = FileSystem.resolve;
            const callbacks = [];
            const lookup = spyOn(FileSystem, "resolve").and.callFake(function (filePath, callback) {
                if (filePath === directoryPath) {
                    callbacks.push(callback);
                    return;
                }
                return resolve.apply(this, arguments);
            });
            try {
                documents.forEach(document => ScopeManager.handleEditorChange(session, document, null));
                expect(callbacks.length).toBe(1);
                resolve.call(FileSystem, directoryPath, callbacks.shift());
                await awaitsFor(() => callbacks.length > 0, "next queued editor initialization");
                // Waking several queued changes must start only the next initialization.
                // Concurrent initializations replace each other's worker-ready handler.
                expect(callbacks.length).toBe(1);
            } finally {
                // Fail held lookups before restoring them, including any cleanup queues.
                while (callbacks.length) {
                    callbacks.shift()(FileSystemError.NOT_FOUND);
                }
                lookup.and.callThrough();
            }

            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["queued-c.html"]), "open last queued editor");
            const finalEditor = EditorManager.getCurrentFullEditor();
            finalEditor.setCursorPos(6, 4);
            const finalSession = new Session(finalEditor);
            await awaitsForDone(ScopeManager.requestHints(finalSession, finalEditor.document), "hints after queued editors");
            expect(finalSession.ternHints.some(hint => hint.value === "push")).toBeTrue();
        });

        it("should exclude markup when updating a dirty HTML document before switching editors", async function () {
            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["embedded.html"]), "open embedded script");
            const previousEditor = EditorManager.getCurrentFullEditor();
            previousEditor.setCursorPos(6, 4);
            await awaitsForDone(ScopeManager.requestHints(new Session(previousEditor), previousEditor.document),
                "initialize embedded script");
            await SpecRunnerUtils.createTextFileAsync(testFolder + "/other.html", previousEditor.document.getText());

            const worker = spyOn(IndexingWorker, "execPeer").and.callThrough();
            previousEditor.document.setText(previousEditor.document.getText() + "\n<!-- unsaved edit -->");
            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["other.html"]), "switch embedded script");
            const editor = EditorManager.getCurrentFullEditor();
            editor.setCursorPos(6, 4);
            const session = new Session(editor);
            await awaitsForDone(ScopeManager.requestHints(session, editor.document), "hints after dirty HTML update");

            const updates = worker.calls.allArgs().filter(args => args[0] === "invokeTernCommand" &&
                args[1].type === MessageIds.TERN_UPDATE_FILE_MSG &&
                args[1].path === previousEditor.document.file.fullPath);
            expect(updates.length).toBeGreaterThan(0);
            updates.forEach(args => expect(args[1].text).not.toContain("<html>"));
            expect(session.ternHints.some(hint => hint.value === "push")).toBeTrue();
        });

        it("should analyze embedded JavaScript without sending PHP host code to Tern", async function () {
            const html = await SpecRunnerUtils.readTextFileAsync(testFolder + "/embedded.html");
            await SpecRunnerUtils.createTextFileAsync(testFolder + "/embedded.php", '<?php echo "header"; ?>\n' + html);
            const worker = spyOn(IndexingWorker, "execPeer").and.callThrough();
            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["embedded.php"]), "open PHP embedded script");
            const editor = EditorManager.getCurrentFullEditor();
            editor.setCursorPos(7, 4);
            const session = new Session(editor);
            await awaitsForDone(ScopeManager.requestHints(session, editor.document), "PHP embedded script hints");

            const reads = worker.calls.allArgs().filter(args => args[0] === "invokeTernCommand" &&
                args[1].type === MessageIds.TERN_GET_FILE_MSG && args[1].file.endsWith("/embedded.php"));
            expect(reads.length).toBeGreaterThan(0);
            reads.forEach(args => expect(args[1].text).not.toContain("<?php"));
            expect(session.ternHints.some(hint => hint.value === "push")).toBeTrue();
        });

    });
});
