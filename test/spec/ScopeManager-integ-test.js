/*
 * GNU AGPL-3.0 License
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 */

/*global describe, it, expect, beforeAll, beforeEach, afterEach, awaitsForDone, awaitsFor, spyOn */

define(function (require, exports, module) {
    const SpecRunnerUtils = require("spec/SpecRunnerUtils"),
        FileSystemError = require("filesystem/FileSystemError");

    describe("integration:JavaScript hint initialization", function () {
        let testWindow, FileSystem, ScopeManager, EditorManager, Session, testFolder;

        beforeAll(async function () {
            testWindow = await SpecRunnerUtils.createTestWindowAndRun();
            FileSystem = testWindow.brackets.test.FileSystem;
            EditorManager = testWindow.brackets.test.EditorManager;
            ScopeManager = testWindow.brackets.getModule("JSUtils/ScopeManager");
            Session = testWindow.brackets.getModule("JSUtils/Session");
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
    });
});
