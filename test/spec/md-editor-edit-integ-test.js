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

/*global describe, beforeAll, afterAll, awaitsFor, it, awaitsForDone, expect*/

define(function (require, exports, module) {

    const SpecRunnerUtils = require("spec/SpecRunnerUtils");

    const testFolder = SpecRunnerUtils.getTestPath("/spec/LiveDevelopment-MultiBrowser-test-files");
    const mdTestFolder = SpecRunnerUtils.getTestPath("/spec/LiveDevelopment-Markdown-test-files");

    let testWindow, brackets, CommandManager, Commands, EditorManager, WorkspaceManager,
        LiveDevMultiBrowser;

    function _getMdPreviewIFrame() {
        return testWindow.document.getElementById("panel-md-preview-frame");
    }

    function _getMdIFrameDoc() {
        const mdIFrame = _getMdPreviewIFrame();
        return mdIFrame && mdIFrame.contentDocument;
    }

    function _getMdIFrameWin() {
        const mdIFrame = _getMdPreviewIFrame();
        return mdIFrame && mdIFrame.contentWindow;
    }

    function _setMdEditMode(editMode) {
        const mdIFrame = _getMdPreviewIFrame();
        if (mdIFrame && mdIFrame.contentWindow) {
            mdIFrame.contentWindow.postMessage({
                type: "MDVIEWR_SET_EDIT_MODE",
                editMode: editMode
            }, "*");
        }
    }

    async function _enterEditMode() {
        const win = _getMdIFrameWin();
        // Force reader→edit transition to ensure enterEditMode runs in editor.js
        // (attaches checkboxHandler, inputHandler, etc.)
        if (win && win.__setEditModeForTest) {
            win.__setEditModeForTest(false);
        }
        _setMdEditMode(true);
        if (win && win.__setEditModeForTest) {
            win.__setEditModeForTest(true);
        }
        await awaitsFor(() => {
            const mdDoc = _getMdIFrameDoc();
            if (!mdDoc) { return false; }
            const content = mdDoc.getElementById("viewer-content");
            return content && content.classList.contains("editing");
        }, "edit mode to activate");
    }

    async function _enterReaderMode() {
        _setMdEditMode(false);
        const win = _getMdIFrameWin();
        if (win && win.__setEditModeForTest) {
            win.__setEditModeForTest(false);
        }
        await awaitsFor(() => {
            const mdDoc = _getMdIFrameDoc();
            if (!mdDoc) { return false; }
            const content = mdDoc.getElementById("viewer-content");
            return content && !content.classList.contains("editing");
        }, "reader mode to activate");
    }

    async function _waitForMdPreviewReady(editor) {
        const expectedSrc = editor ? editor.document.getText() : null;
        await awaitsFor(() => {
            const mdIFrame = _getMdPreviewIFrame();
            if (!mdIFrame || mdIFrame.style.display === "none") { return false; }
            if (!mdIFrame.src || !mdIFrame.src.includes("mdViewer")) { return false; }
            const win = mdIFrame.contentWindow;
            if (!win || typeof win.__setEditModeForTest !== "function") { return false; }
            if (win.__isSuppressingContentChange && win.__isSuppressingContentChange()) { return false; }
            const content = mdIFrame.contentDocument && mdIFrame.contentDocument.getElementById("viewer-content");
            if (!content || content.children.length === 0) { return false; }
            if (!EditorManager.getActiveEditor()) { return false; }
            if (expectedSrc) {
                const viewerSrc = win.__getCurrentContent && win.__getCurrentContent();
                if (viewerSrc !== expectedSrc) { return false; }
            }
            return true;
        }, "md preview synced with editor content");
    }

    describe("livepreview:Markdown Editor Edit Mode", function () {

        if (Phoenix.browser.desktop.isFirefox ||
            (Phoenix.isTestWindowPlaywright && !Phoenix.browser.desktop.isChromeBased)) {
            it("Markdown edit mode tests are disabled in Firefox/non-Chrome playwright", function () {});
            return;
        }

        beforeAll(async function () {
            if (!testWindow) {
                const useWindowInsteadOfIframe = Phoenix.browser.desktop.isFirefox;
                testWindow = await SpecRunnerUtils.createTestWindowAndRun({
                    forceReload: false, useWindowInsteadOfIframe
                });
                brackets = testWindow.brackets;
                CommandManager = brackets.test.CommandManager;
                Commands = brackets.test.Commands;
                EditorManager = brackets.test.EditorManager;
                WorkspaceManager = brackets.test.WorkspaceManager;
                LiveDevMultiBrowser = brackets.test.LiveDevMultiBrowser;

                await SpecRunnerUtils.loadProjectInTestWindow(mdTestFolder);
                await SpecRunnerUtils.deletePathAsync(mdTestFolder + "/.phcode.json", true);

                if (!WorkspaceManager.isPanelVisible("live-preview-panel")) {
                    await awaitsForDone(CommandManager.execute(Commands.FILE_LIVE_FILE_PREVIEW));
                }

                // Open HTML first to start live dev
                await awaitsForDone(SpecRunnerUtils.openProjectFiles(["simple.html"]),
                    "open simple.html");
                LiveDevMultiBrowser.open();
                await awaitsFor(() =>
                    LiveDevMultiBrowser.status === LiveDevMultiBrowser.STATUS_ACTIVE,
                "live dev to open", 20000);

                // Open the checkbox test md file
                await awaitsForDone(SpecRunnerUtils.openProjectFiles(["checkbox-test.md"]),
                    "open checkbox-test.md");
                await _waitForMdPreviewReady(EditorManager.getActiveEditor());
            }
        }, 30000);

        afterAll(async function () {
            if (LiveDevMultiBrowser) {
                LiveDevMultiBrowser.close();
            }
            if (CommandManager) {
                await awaitsForDone(CommandManager.execute(Commands.FILE_CLOSE_ALL, { _forceClose: true }),
                    "final close all files");
            }
            testWindow = null;
            brackets = null;
            CommandManager = null;
            Commands = null;
            EditorManager = null;
            WorkspaceManager = null;
            LiveDevMultiBrowser = null;
        }, 30000);

        describe("Checkbox (Task List) Sync", function () {

            async function _openMdFile(fileName) {
                await awaitsForDone(SpecRunnerUtils.openProjectFiles([fileName]),
                    "open " + fileName);
                await _waitForMdPreviewReady(EditorManager.getActiveEditor());
            }

            function _getCheckboxes() {
                const mdDoc = _getMdIFrameDoc();
                const content = mdDoc && mdDoc.getElementById("viewer-content");
                if (!content) { return []; }
                return Array.from(content.querySelectorAll('input[type="checkbox"]'));
            }

            it("should clicking checkbox in edit mode toggle it and sync to CM source", async function () {
                await _openMdFile("checkbox-test.md");
                await _enterEditMode();

                const checkboxes = _getCheckboxes();
                expect(checkboxes.length).toBeGreaterThan(1);

                // Find first unchecked checkbox ("Incomplete task")
                let uncheckedIdx = -1;
                for (let i = 0; i < checkboxes.length; i++) {
                    if (!checkboxes[i].checked) {
                        uncheckedIdx = i;
                        break;
                    }
                }
                expect(uncheckedIdx).toBeGreaterThanOrEqual(0);

                // Click the checkbox using the iframe-context helper
                const win = _getMdIFrameWin();
                const checkedResult = win.__clickCheckboxForTest(uncheckedIdx);
                expect(checkedResult).toBeTrue();

                // Verify CM source updated: [ ] → [x]
                const editor = EditorManager.getActiveEditor();
                await awaitsFor(() => {
                    return /\[x\]\s+Incomplete task/.test(editor.document.getText());
                }, "CM source to sync checkbox to [x]");

                // Document should be dirty
                expect(editor.document.isDirty).toBeTrue();

                // Click again to uncheck
                const uncheckedResult = win.__clickCheckboxForTest(uncheckedIdx);
                expect(uncheckedResult).toBeFalse();

                // Verify CM source updated: [x] → [ ]
                await awaitsFor(() => {
                    return /\[ \]\s+Incomplete task/.test(editor.document.getText());
                }, "CM source to sync checkbox back to [ ]");

                await awaitsForDone(CommandManager.execute(Commands.FILE_CLOSE, { _forceClose: true }),
                    "force close checkbox-test.md");
            }, 15000);

            it("should checkboxes be enabled in edit mode and disabled in reader mode", async function () {
                await _openMdFile("checkbox-test.md");

                // In reader mode: checkboxes should be disabled
                await _enterReaderMode();
                let checkboxes = _getCheckboxes();
                expect(checkboxes.length).toBeGreaterThan(0);
                for (const cb of checkboxes) {
                    expect(cb.disabled).toBeTrue();
                }

                // In edit mode: checkboxes should be enabled
                await _enterEditMode();
                checkboxes = _getCheckboxes();
                expect(checkboxes.length).toBeGreaterThan(0);
                for (const cb of checkboxes) {
                    expect(cb.disabled).toBeFalse();
                }

                await awaitsForDone(CommandManager.execute(Commands.FILE_CLOSE, { _forceClose: true }),
                    "force close checkbox-test.md");
            }, 15000);

        });
    });
});
