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

/*global describe, beforeAll, afterAll, beforeEach, afterEach, it, expect, awaitsFor, awaitsForDone, jsPromise */

define(function (require, exports, module) {

    const SpecRunnerUtils = require("spec/SpecRunnerUtils");

    const tempDir = SpecRunnerUtils.getTempDirectory();

    let AISnapshotStore,
        DocumentManager,
        CommandManager,
        Commands,
        FileSystem,
        testWindow;

    describe("integration:AISnapshotStore", function () {

        beforeAll(async function () {
            testWindow = await SpecRunnerUtils.createTestWindowAndRun();
            AISnapshotStore = testWindow.brackets.test.AISnapshotStore;
            DocumentManager = testWindow.brackets.test.DocumentManager;
            CommandManager  = testWindow.brackets.test.CommandManager;
            Commands        = testWindow.brackets.test.Commands;
            FileSystem      = testWindow.brackets.test.FileSystem;
        }, 30000);

        afterAll(async function () {
            AISnapshotStore = null;
            DocumentManager = null;
            CommandManager  = null;
            Commands        = null;
            FileSystem      = null;
            testWindow      = null;
            await SpecRunnerUtils.closeTestWindow();
        }, 30000);

        beforeEach(async function () {
            await SpecRunnerUtils.createTempDirectory();
            await SpecRunnerUtils.loadProjectInTestWindow(tempDir);
        });

        afterEach(async function () {
            await testWindow.closeAllFiles();
            AISnapshotStore.reset();
            await SpecRunnerUtils.removeTempDirectory();
        });

        // --- helpers ---

        // Convert a file name to a VFS path that matches what realToVfsPath produces.
        // In native (Tauri) builds, realToVfsPath adds /tauri/ prefix to native paths.
        // By opening docs with VFS paths, doc.file.fullPath matches what finalizeResponse
        // will look up via realToVfsPath.
        function toVfsPath(name) {
            return AISnapshotStore.realToVfsPath(tempDir + "/" + name);
        }

        async function createFile(name, content) {
            // Write through the test window's FileSystem (not the host's) so
            // the document cache stays consistent across tests.
            const path = toVfsPath(name);
            return new Promise(function (resolve, reject) {
                const file = FileSystem.getFileForPath(path);
                file.write(content, {blind: true}, function (err) {
                    if (err) { reject(err); } else { resolve(); }
                });
            });
        }

        async function openDoc(name) {
            const fullPath = toVfsPath(name);
            await awaitsForDone(
                CommandManager.execute(Commands.FILE_OPEN, { fullPath: fullPath }),
                "open " + name
            );
            return DocumentManager.getOpenDocumentForPath(fullPath);
        }

        function simulateEdit(doc, newContent, isNewFile) {
            AISnapshotStore.recordFileBeforeEdit(doc.file.fullPath, doc.getText(), isNewFile);
            doc.setText(newContent);
        }

        async function simulateCreateFile(name, content) {
            await createFile(name, "");
            const doc = await openDoc(name);
            AISnapshotStore.recordFileBeforeEdit(doc.file.fullPath, "", true);
            doc.setText(content);
            return doc;
        }

        function restoreToSnapshot(index) {
            return new Promise(function (resolve) {
                AISnapshotStore.restoreToSnapshot(index, function (errorCount) {
                    resolve(errorCount);
                });
            });
        }

        async function readFile(name) {
            // Read from the open Document to avoid FileSystem read-cache staleness.
            // _createOrUpdateFile always updates the document text before resolving.
            const path = toVfsPath(name);
            const doc = DocumentManager.getOpenDocumentForPath(path);
            if (doc) {
                return doc.getText();
            }
            return new Promise(function (resolve, reject) {
                DocumentManager.getDocumentForPath(path)
                    .done(function (d) { resolve(d.getText()); })
                    .fail(function (err) { reject(err); });
            });
        }

        async function fileExists(name) {
            return new Promise(function (resolve) {
                const file = FileSystem.getFileForPath(toVfsPath(name));
                file.exists(function (err, exists) {
                    resolve(exists);
                });
            });
        }

        async function expectFileDeleted(name) {
            let gone = false;
            await awaitsFor(function () {
                fileExists(name).then(function (e) { gone = !e; });
                return gone;
            }, name + " to be deleted", 5000);
        }

        function unlinkFile(name) {
            return new Promise(function (resolve, reject) {
                const file = FileSystem.getFileForPath(toVfsPath(name));
                file.unlink(function (err) {
                    if (err) { reject(err); } else { resolve(); }
                });
            });
        }

        function beginResponse() {
            if (AISnapshotStore.getSnapshotCount() === 0) {
                AISnapshotStore.createInitialSnapshot();
            }
        }

        // --- storeContent ---

        describe("storeContent", function () {
            it("should return same hash for identical content", function () {
                const h1 = AISnapshotStore.storeContent("hello world");
                const h2 = AISnapshotStore.storeContent("hello world");
                expect(h1).toBe(h2);
            });

            it("should return different hashes for different content", function () {
                const h1 = AISnapshotStore.storeContent("aaa");
                const h2 = AISnapshotStore.storeContent("bbb");
                expect(h1).not.toBe(h2);
            });

            it("should return a valid hash for empty string", function () {
                const h = AISnapshotStore.storeContent("");
                expect(typeof h).toBe("string");
                expect(h.length).toBeGreaterThan(0);
            });
        });

        // --- createInitialSnapshot and recordFileBeforeEdit ---

        describe("createInitialSnapshot and recordFileBeforeEdit", function () {
            it("should create initial snapshot at index 0 with count 1", function () {
                const idx = AISnapshotStore.createInitialSnapshot();
                expect(idx).toBe(0);
                expect(AISnapshotStore.getSnapshotCount()).toBe(1);
            });

            it("should back-fill snapshot 0 when recording before-edit", async function () {
                await createFile("a.txt", "original");
                const doc = await openDoc("a.txt");

                beginResponse();
                AISnapshotStore.recordFileBeforeEdit(doc.file.fullPath, "original", false);
                doc.setText("modified");

                // Snapshot 0 should now contain a hash for "original"
                const errorCount = await restoreToSnapshot(0);
                expect(errorCount).toBe(0);
                const content = await readFile("a.txt");
                expect(content).toBe("original");
            });

            it("should store null for isNewFile=true", async function () {
                await createFile("new.txt", "");
                const doc = await openDoc("new.txt");

                beginResponse();
                AISnapshotStore.recordFileBeforeEdit(doc.file.fullPath, "", true);
                doc.setText("new content");
                await AISnapshotStore.finalizeResponse();

                // Snapshot 0 has null → restore deletes file
                const errorCount = await restoreToSnapshot(0);
                expect(errorCount).toBe(0);
                await expectFileDeleted("new.txt");
            });

            it("should ignore duplicate recordFileBeforeEdit for same file", async function () {
                await createFile("a.txt", "v0");
                const doc = await openDoc("a.txt");

                beginResponse();
                AISnapshotStore.recordFileBeforeEdit(doc.file.fullPath, "v0", false);
                doc.setText("v1");
                // Second call with different content should be ignored (first-edit-wins)
                AISnapshotStore.recordFileBeforeEdit(doc.file.fullPath, "v1", false);
                await AISnapshotStore.finalizeResponse();

                // Restore to snapshot 0 should give v0, not v1
                const errorCount = await restoreToSnapshot(0);
                expect(errorCount).toBe(0);
                const content = await readFile("a.txt");
                expect(content).toBe("v0");
            });
        });

        // --- finalizeResponse ---

        describe("finalizeResponse", function () {
            it("should return -1 when no pending edits", async function () {
                beginResponse();
                const idx = await AISnapshotStore.finalizeResponse();
                expect(idx).toBe(-1);
            });

            it("should build after-snapshot from open doc content", async function () {
                await createFile("a.txt", "before");
                const doc = await openDoc("a.txt");

                beginResponse();
                simulateEdit(doc, "after", false);
                await AISnapshotStore.finalizeResponse();

                // Snapshot 1 should have "after"
                const errorCount = await restoreToSnapshot(1);
                expect(errorCount).toBe(0);
                const content = await readFile("a.txt");
                expect(content).toBe("after");
            });

            it("should increment snapshot count", async function () {
                await createFile("a.txt", "v0");
                const doc = await openDoc("a.txt");

                beginResponse();
                simulateEdit(doc, "v1", false);
                expect(AISnapshotStore.getSnapshotCount()).toBe(1);
                await AISnapshotStore.finalizeResponse();
                expect(AISnapshotStore.getSnapshotCount()).toBe(2);
            });

            it("should clear pending state (second finalize returns -1)", async function () {
                await createFile("a.txt", "v0");
                const doc = await openDoc("a.txt");

                beginResponse();
                simulateEdit(doc, "v1", false);
                const idx = await AISnapshotStore.finalizeResponse();
                expect(idx).toBe(1);
                const idx2 = await AISnapshotStore.finalizeResponse();
                expect(idx2).toBe(-1);
            });

            it("should capture closed doc content from disk", async function () {
                await createFile("a.txt", "on-disk-content");
                const doc = await openDoc("a.txt");

                beginResponse();
                simulateEdit(doc, "edited", false);

                // Save to disk then close the tab
                const file = doc.file;
                await new Promise(function (resolve) {
                    file.write("edited", function () { resolve(); });
                });
                await awaitsForDone(
                    CommandManager.execute(Commands.FILE_CLOSE,
                        { file: file, _forceClose: true }),
                    "close a.txt"
                );

                await AISnapshotStore.finalizeResponse();

                // After-snapshot should have captured "edited" from disk fallback
                const err = await restoreToSnapshot(1);
                expect(err).toBe(0);
                expect(await readFile("a.txt")).toBe("edited");
            });

            it("should capture deleted file as null in after-snapshot", async function () {
                await createFile("a.txt", "content");
                const doc = await openDoc("a.txt");

                beginResponse();
                simulateEdit(doc, "modified", false);

                // Close tab and delete the file
                await awaitsForDone(
                    CommandManager.execute(Commands.FILE_CLOSE,
                        { file: doc.file, _forceClose: true }),
                    "close a.txt"
                );
                await unlinkFile("a.txt");

                await AISnapshotStore.finalizeResponse();

                expect(AISnapshotStore.getSnapshotCount()).toBe(2);

                // snap 0 has original content; restore recreates the file
                let err = await restoreToSnapshot(0);
                expect(err).toBe(0);
                expect(await readFile("a.txt")).toBe("content");

                // snap 1 was captured as null (disk read failed → null fallback)
                // Explicitly open to ensure doc is in working set (avoids CMD_OPEN race)
                await openDoc("a.txt");
                err = await restoreToSnapshot(1);
                expect(err).toBe(0);
                await expectFileDeleted("a.txt");
            });
        });

        // --- snapshot consistency (editApplyVerification cases) ---

        describe("snapshot consistency", function () {

            // Case 1: Single response, 2 files
            it("should handle single response editing 2 files", async function () {
                await createFile("a.txt", "a0");
                await createFile("b.txt", "b0");
                const docA = await openDoc("a.txt");
                const docB = await openDoc("b.txt");

                // R1
                beginResponse();
                simulateEdit(docA, "a1", false);
                simulateEdit(docB, "b1", false);
                await AISnapshotStore.finalizeResponse();

                expect(AISnapshotStore.getSnapshotCount()).toBe(2);

                // restore(0) → a0, b0
                let err = await restoreToSnapshot(0);
                expect(err).toBe(0);
                expect(await readFile("a.txt")).toBe("a0");
                expect(await readFile("b.txt")).toBe("b0");

                // restore(1) → a1, b1
                err = await restoreToSnapshot(1);
                expect(err).toBe(0);
                expect(await readFile("a.txt")).toBe("a1");
                expect(await readFile("b.txt")).toBe("b1");
            });

            // Case 2: Two responses, same file
            it("should handle two responses editing same file", async function () {
                await createFile("a.txt", "v0");
                const doc = await openDoc("a.txt");

                // R1
                beginResponse();
                simulateEdit(doc, "v1", false);
                await AISnapshotStore.finalizeResponse();

                // R2
                simulateEdit(doc, "v2", false);
                await AISnapshotStore.finalizeResponse();

                expect(AISnapshotStore.getSnapshotCount()).toBe(3);

                let err = await restoreToSnapshot(0);
                expect(err).toBe(0);
                expect(await readFile("a.txt")).toBe("v0");

                err = await restoreToSnapshot(1);
                expect(err).toBe(0);
                expect(await readFile("a.txt")).toBe("v1");

                err = await restoreToSnapshot(2);
                expect(err).toBe(0);
                expect(await readFile("a.txt")).toBe("v2");
            });

            // Case 4: Three responses, restore middle
            it("should restore to middle snapshot", async function () {
                await createFile("a.txt", "v0");
                const doc = await openDoc("a.txt");

                // R1
                beginResponse();
                simulateEdit(doc, "v1", false);
                await AISnapshotStore.finalizeResponse();

                // R2
                simulateEdit(doc, "v2", false);
                await AISnapshotStore.finalizeResponse();

                // R3
                simulateEdit(doc, "v3", false);
                await AISnapshotStore.finalizeResponse();

                expect(AISnapshotStore.getSnapshotCount()).toBe(4);

                let err = await restoreToSnapshot(1);
                expect(err).toBe(0);
                expect(await readFile("a.txt")).toBe("v1");

                err = await restoreToSnapshot(2);
                expect(err).toBe(0);
                expect(await readFile("a.txt")).toBe("v2");
            });

            // Case 5: Different files, back-fill
            it("should back-fill when different files edited in different responses", async function () {
                await createFile("a.txt", "a0");
                await createFile("b.txt", "b0");
                const docA = await openDoc("a.txt");

                // R1: edit A only
                beginResponse();
                simulateEdit(docA, "a1", false);
                await AISnapshotStore.finalizeResponse();

                // R2: edit B only
                const docB = await openDoc("b.txt");
                simulateEdit(docB, "b1", false);
                await AISnapshotStore.finalizeResponse();

                expect(AISnapshotStore.getSnapshotCount()).toBe(3);

                // snap 0 & 1 should have been back-filled with B:b0
                let err = await restoreToSnapshot(0);
                expect(err).toBe(0);
                expect(await readFile("a.txt")).toBe("a0");
                expect(await readFile("b.txt")).toBe("b0");

                err = await restoreToSnapshot(1);
                expect(err).toBe(0);
                expect(await readFile("a.txt")).toBe("a1");
                expect(await readFile("b.txt")).toBe("b0");

                err = await restoreToSnapshot(2);
                expect(err).toBe(0);
                expect(await readFile("a.txt")).toBe("a1");
                expect(await readFile("b.txt")).toBe("b1");
            });

            // Case 6: File created in R1, edited in R2
            it("should handle file creation and subsequent edit", async function () {
                // R1: create file A
                beginResponse();
                const docA = await simulateCreateFile("a.txt", "new");
                await AISnapshotStore.finalizeResponse();

                // R2: edit A
                simulateEdit(docA, "edited", false);
                await AISnapshotStore.finalizeResponse();

                expect(AISnapshotStore.getSnapshotCount()).toBe(3);

                // snap 2 → A="edited"
                let err = await restoreToSnapshot(2);
                expect(err).toBe(0);
                expect(await readFile("a.txt")).toBe("edited");

                // snap 1 → A="new"
                err = await restoreToSnapshot(1);
                expect(err).toBe(0);
                expect(await readFile("a.txt")).toBe("new");

                // snap 0 has A:null → file deleted
                err = await restoreToSnapshot(0);
                expect(err).toBe(0);
                await expectFileDeleted("a.txt");
            });

            // Case 7: File created in R2
            it("should handle file created in second response", async function () {
                await createFile("a.txt", "a0");
                const docA = await openDoc("a.txt");

                // R1: edit A
                beginResponse();
                simulateEdit(docA, "a1", false);
                await AISnapshotStore.finalizeResponse();

                // R2: create B
                const docB = await simulateCreateFile("b.txt", "new");
                await AISnapshotStore.finalizeResponse();

                expect(AISnapshotStore.getSnapshotCount()).toBe(3);

                // snap 0 → A=a0, B deleted (back-filled null)
                let err = await restoreToSnapshot(0);
                expect(await readFile("a.txt")).toBe("a0");
                await expectFileDeleted("b.txt");

                // snap 1 → A=a1, B deleted (back-filled null)
                err = await restoreToSnapshot(1);
                expect(await readFile("a.txt")).toBe("a1");
                await expectFileDeleted("b.txt");

                // snap 2 → A=a1, B="new"
                err = await restoreToSnapshot(2);
                expect(err).toBe(0);
                expect(await readFile("a.txt")).toBe("a1");
                expect(await readFile("b.txt")).toBe("new");
            });

            // File created and document closed in same turn — disk fallback reads empty content
            it("should handle file created and closed in same turn", async function () {
                await createFile("a.txt", "a0");
                const docA = await openDoc("a.txt");

                // R1: edit A, create B then close B's document
                beginResponse();
                simulateEdit(docA, "a1", false);
                const docB = await simulateCreateFile("b.txt", "created");
                // Close B — simulates file created then removed in same turn
                await awaitsForDone(
                    CommandManager.execute(Commands.FILE_CLOSE,
                        { file: docB.file, _forceClose: true }),
                    "close b.txt"
                );
                await AISnapshotStore.finalizeResponse();

                expect(AISnapshotStore.getSnapshotCount()).toBe(2);

                // snap 0: A="a0", B=null (isNewFile). B still on disk from simulateCreateFile.
                let err = await restoreToSnapshot(0);
                expect(err).toBe(0);
                expect(await readFile("a.txt")).toBe("a0");
                await expectFileDeleted("b.txt");

                // snap 1 (after): A="a1", B read from disk fallback (createFile wrote "")
                err = await restoreToSnapshot(1);
                expect(await readFile("a.txt")).toBe("a1");
                // Disk fallback reads the empty string that createFile wrote
                expect(await readFile("b.txt")).toBe("");
            });

            // Delete → recreate → delete round-trip
            it("should handle delete-restore-delete round-trip", async function () {
                // R1: create file A
                beginResponse();
                await simulateCreateFile("a.txt", "content");
                await AISnapshotStore.finalizeResponse();

                expect(AISnapshotStore.getSnapshotCount()).toBe(2);

                // snap 0 → A=null → file deleted
                let err = await restoreToSnapshot(0);
                expect(err).toBe(0);
                await expectFileDeleted("a.txt");

                // snap 1 → A="content" → file recreated from deleted state
                err = await restoreToSnapshot(1);
                expect(err).toBe(0);
                expect(await readFile("a.txt")).toBe("content");
            });

            // Case 9: Response with no edits
            it("should return -1 for response with no edits", async function () {
                beginResponse();
                const idx = await AISnapshotStore.finalizeResponse();
                expect(idx).toBe(-1);
                expect(AISnapshotStore.getSnapshotCount()).toBe(1);
            });
        });

        // --- recordFileDeletion ---

        describe("recordFileDeletion", function () {
            it("should track explicit deletion with before-content and null after", async function () {
                await createFile("a.txt", "original");
                const doc = await openDoc("a.txt");

                beginResponse();
                // Record deletion with known previous content
                AISnapshotStore.recordFileDeletion(doc.file.fullPath, "original");
                await AISnapshotStore.finalizeResponse();

                expect(AISnapshotStore.getSnapshotCount()).toBe(2);

                // snap 1 has null — doc still open from openDoc(), close+delete works
                let err = await restoreToSnapshot(1);
                expect(err).toBe(0);
                await expectFileDeleted("a.txt");

                // snap 0 has "original" (back-filled before content) — recreates file
                err = await restoreToSnapshot(0);
                expect(err).toBe(0);
                expect(await readFile("a.txt")).toBe("original");
            });
        });

        // --- recordFileRead ---

        describe("recordFileRead", function () {
            it("should enable restore when read-tracked file is later deleted", async function () {
                await createFile("a.txt", "a0");
                await createFile("b.txt", "b-content");
                const docA = await openDoc("a.txt");

                // Record that AI has read b.txt
                AISnapshotStore.recordFileRead(toVfsPath("b.txt"), "b-content");

                beginResponse();
                // Edit a.txt (so we have at least one pending edit)
                simulateEdit(docA, "a1", false);

                // Simulate deletion of the read file by calling recordFileDeletion
                // (mirrors what _onProjectFileChanged would do after promoting from _readFiles)
                AISnapshotStore.recordFileDeletion(toVfsPath("b.txt"), "b-content");

                await AISnapshotStore.finalizeResponse();

                expect(AISnapshotStore.getSnapshotCount()).toBe(2);

                // snap 1: A="a1", B=null (deleted) — b.txt still on disk, delete first
                let err = await restoreToSnapshot(1);
                expect(err).toBe(0);
                expect(await readFile("a.txt")).toBe("a1");
                await expectFileDeleted("b.txt");

                // snap 0: A="a0", B="b-content" — recreates b.txt
                err = await restoreToSnapshot(0);
                expect(err).toBe(0);
                expect(await readFile("a.txt")).toBe("a0");
                expect(await readFile("b.txt")).toBe("b-content");
            });
        });

        // --- reset ---

        describe("reset", function () {
            it("should clear snapshot count to 0", function () {
                AISnapshotStore.createInitialSnapshot();
                expect(AISnapshotStore.getSnapshotCount()).toBe(1);
                AISnapshotStore.reset();
                expect(AISnapshotStore.getSnapshotCount()).toBe(0);
            });

            it("should allow fresh start after operations", async function () {
                await createFile("a.txt", "v0");
                const doc = await openDoc("a.txt");

                beginResponse();
                simulateEdit(doc, "v1", false);
                await AISnapshotStore.finalizeResponse();
                expect(AISnapshotStore.getSnapshotCount()).toBe(2);

                AISnapshotStore.reset();
                expect(AISnapshotStore.getSnapshotCount()).toBe(0);

                // Start fresh
                beginResponse();
                simulateEdit(doc, "v2", false);
                await AISnapshotStore.finalizeResponse();
                expect(AISnapshotStore.getSnapshotCount()).toBe(2);

                const err = await restoreToSnapshot(0);
                expect(err).toBe(0);
                expect(await readFile("a.txt")).toBe("v1");
            });
        });

        // --- realToVfsPath ---

        describe("realToVfsPath", function () {
            it("should pass through /tauri/ paths unchanged", function () {
                const p = "/tauri/some/path/file.txt";
                expect(AISnapshotStore.realToVfsPath(p)).toBe(p);
            });

            it("should pass through /mnt/ paths unchanged", function () {
                const p = "/mnt/some/path/file.txt";
                expect(AISnapshotStore.realToVfsPath(p)).toBe(p);
            });
        });
    });
});
