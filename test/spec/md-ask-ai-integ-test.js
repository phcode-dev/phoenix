/* GNU AGPL-3.0 License; Copyright (c) 2026 core.ai. */
/*global describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, awaitsFor */
define(function (require, exports, module) {
    const SpecRunnerUtils = require("spec/SpecRunnerUtils"),
        Selection = require("extensionsIntegrated/Phoenix-live-preview/MarkdownSelection");

    describe("unit:Markdown Selection References", function () {
        const source = "# Title\n\nA selected phrase here.";
        const doc = {file: {fullPath: "/project/example.md"}, getText: () => source};
        const data = {selectionId: "test-selection", context: {startLine: 3, endLine: 3},
            rendered: {startLine: 2, endLine: 2}, head: "A selected phrase here.", tail: "A selected phrase here.",
            preview: ["selected phrase"], excerpt: [{line: 2, text: "A ⟦selected phrase⟧ here."}]};
        it("derives the filename and bounded source context from the editor", function () {
            const item = Selection.capture(doc, Object.assign({fullPath: "/wrong.md"}, data));
            expect(item.fullPath).toBe("/project/example.md");
            expect(item.markdownSelection.context).toEqual({startLine: 3, endLine: 3});
            expect(item.markdownSelection.rendered).toEqual({startLine: 2, endLine: 2});
        });
        it("rejects stale or out-of-bounds context lines", function () {
            expect(Selection.capture(doc, Object.assign({}, data, {head: "wrong"}))).toBe(null);
            expect(Selection.capture(doc, Object.assign({}, data, {context: {startLine: 0, endLine: 3}}))).toBe(null);
            expect(Selection.capture(doc, Object.assign({}, data, {preview: ["x".repeat(1000)]}))).toBe(null);
        });
        it("selects source context lines and refuses changed context instead of guessing", function () {
            const item = Selection.capture(doc, data).markdownSelection;
            expect(Selection.resolve(source, item).start).toEqual({line: 3, column: 1});
            expect(Selection.resolve("New intro\n" + source, item)).toBe(null);
        });
    });

    // These browsers cannot start the nested live-preview server used by this suite.
    if (Phoenix.browser.desktop.isFirefox ||
            (Phoenix.isTestWindowPlaywright && !Phoenix.browser.desktop.isChromeBased)) { return; }
    describe("livepreview:Markdown Ask AI", function () {
        const folder = SpecRunnerUtils.getTestPath("/spec/LiveDevelopment-Markdown-test-files");
        let win, editor, sync, frame, received, commands, original;
        beforeAll(async function () {
            win = await SpecRunnerUtils.createTestWindowAndRun();
            commands = win.brackets.test.Commands;
            await SpecRunnerUtils.loadProjectInTestWindow(folder);
            if (!win.brackets.test.WorkspaceManager.isPanelVisible("live-preview-panel")) {
                await win.brackets.test.CommandManager.execute(commands.FILE_LIVE_FILE_PREVIEW);
            }
            await SpecRunnerUtils.openProjectFiles(["simple.html"]);
            win.brackets.test.LiveDevMultiBrowser.open();
            await awaitsFor(() => win.brackets.test.LiveDevMultiBrowser.status ===
                win.brackets.test.LiveDevMultiBrowser.STATUS_ACTIVE, "live preview server", 20000);
            sync = win.brackets.getModule("extensionsIntegrated/Phoenix-live-preview/MarkdownSync");
            original = win.brackets.test.AILivePreviewChat && win.brackets.test.AILivePreviewChat.attachSelection;
        }, 40000);
        beforeEach(async function () {
            received = [];
            sync.setAskAIHandler(file => received.push(file));
            await SpecRunnerUtils.openProjectFiles(["ask-ai.md"]);
            editor = win.brackets.test.EditorManager.getCurrentFullEditor();
            await awaitsFor(() => {
                frame = win.document.getElementById("panel-md-preview-frame");
                return sync._getDebugState().doc === editor.document && frame && frame.contentWindow.__getCurrentContent &&
                    frame.contentWindow.__getCurrentContent() === editor.document.getText() &&
                    !frame.contentWindow.__isSuppressingContentChange() && frame.contentDocument.getElementById("fb-ask-ai");
            },
            "Markdown selection toolbar ready");
            frame.contentWindow.__setEditModeForTest(false);
            await awaitsFor(() => !frame.contentDocument.getElementById("viewer-content").isContentEditable, "reader mode");
        });
        afterEach(async function () {
            if (frame) { frame.contentWindow.getSelection().removeAllRanges(); }
            await win.brackets.test.CommandManager.execute(commands.FILE_CLOSE_ALL, {_forceClose: true});
            // An empty working set retains the last preview; switch away to detach its document before reopening it.
            await SpecRunnerUtils.openProjectFiles(["simple.html"]);
            await awaitsFor(() => !sync.isActive(), "Markdown document detached");
        });
        afterAll(async function () {
            if (sync) { sync.setAskAIHandler(original || null); }
            if (win) { win.brackets.test.LiveDevMultiBrowser.close(); }
            await SpecRunnerUtils.closeTestWindow();
        });

        /** Select literal rendered text, then click the real selection-toolbar action. */
        async function attach(selector, text, start = 0, end = text.length, occurrence = 0) {
            const previousCount = received.length;
            const doc = frame.contentDocument;
            const element = doc.querySelectorAll("#viewer-content " + selector)[occurrence];
            // File switches and large re-renders queue scroll restoration. A real user selects
            // after that layout; otherwise its late scroll dismisses the freshly opened toolbar.
            element.scrollIntoView({block: "nearest"});
            await new Promise(resolve => frame.contentWindow.requestAnimationFrame(resolve));
            const walker = doc.createTreeWalker(element, win.NodeFilter.SHOW_TEXT);
            let node;
            while ((node = walker.nextNode())) { if (node.data.includes(text)) { break; } }
            expect(!!node).toBe(true);
            const range = doc.createRange();
            const offset = node.data.indexOf(text);
            range.setStart(node, offset + start);
            range.setEnd(node, offset + end);
            const selection = frame.contentWindow.getSelection();
            selection.removeAllRanges(); selection.addRange(range);
            doc.dispatchEvent(new win.Event("selectionchange"));
            await awaitsFor(() => doc.getElementById("format-bar").classList.contains("visible"), "selection bar visible");
            doc.getElementById("fb-ask-ai").click();
            await awaitsFor(() => received.length === previousCount + 1, "selection attached");
            return received[previousCount].markdownSelection;
        }
        it("offers only Ask AI in Reader mode and preserves a partial bold selection", async function () {
            const selection = await attach("strong", "bold words", 2, 8);
            expect(selection.excerpt[0].text).toContain("bo⟦ld wor⟧ds");
            expect(selection.preview).toEqual(["ld wor"]);
            expect(frame.contentDocument.querySelectorAll("#format-bar .format-btn").length).toBe(0);
            expect(editor.document.isDirty).toBe(false);
        });
        it("maps link text without mistaking its destination for selected content", async function () {
            const selection = await attach("a", "linked words", 3, 9);
            expect(selection.excerpt[0].text).toContain("lin⟦ked wo⟧rds");
        });
        it("distinguishes repeated paragraphs by their source location", async function () {
            const selection = await attach('p[data-source-line="11"]', "Repeated wording", 0, 8);
            expect(selection.context.startLine).toBe(11);
        });
        it("locates text inside block quotes", async function () {
            const selection = await attach("blockquote strong", "strong phrase", 0, 6);
            expect(selection.excerpt[0].text).toContain("⟦strong⟧ phrase");
            expect(selection.context.startLine).toBe(13);
        });
        it("locates nested formatting in list items", async function () {
            const selection = await attach("li strong", "list phrase");
            expect(selection.excerpt[0].text).toContain("⟦list phrase⟧");
        });
        it("distinguishes equal cells on the same table row", async function () {
            const selection = await attach("td", "repeated", 0, 8, 1);
            expect(selection.excerpt[0].text).toContain("repeated\t⟦repeated⟧");
        });
        it("offers Ask AI for a code-block selection", async function () {
            const selection = await attach("pre code", "another sample", 0, 7);
            expect(selection.excerpt[0].text).toContain("⟦another⟧ sample");
        });
        it("keeps decoded entities in rendered context", async function () {
            const selection = await attach('p[data-source-line="29"]', "fish & chips", 0, 12);
            expect(selection.excerpt[0].text).toContain("⟦fish & chips⟧");
        });
        it("preserves Unicode in rendered selection markers", async function () {
            const selection = await attach('p[data-source-line="31"]', "café 🍀 and 日本語", 0, 7);
            expect(selection.excerpt[0].text).toContain("⟦café 🍀⟧");
        });
        it("retains formatting tools alongside Ask AI in edit mode", async function () {
            frame.contentWindow.__setEditModeForTest(true);
            await awaitsFor(() => frame.contentDocument.getElementById("viewer-content").isContentEditable, "edit mode");
            await attach("strong", "bold words");
            expect(frame.contentDocument.querySelectorAll("#format-bar .format-btn").length).toBe(6);
        });
        it("restores the selected characters in the visible preview", async function () {
            const selection = await attach("strong", "bold words", 2, 8);
            frame.contentWindow.getSelection().removeAllRanges();
            sync.revealSelection(editor.document.file.fullPath, {selectionId: selection.selectionId});
            await awaitsFor(() => frame.contentWindow.getSelection().toString() === "ld wor", "exact preview selection");
        });
        it("reuses the same snapshot for repeated selections and distinguishes different character ranges", async function () {
            const first = await attach("strong", "bold words", 2, 8);
            const again = await attach("strong", "bold words", 2, 8);
            const other = await attach("strong", "bold words", 3, 8);
            expect(again.selectionId).toBe(first.selectionId);
            expect(other.selectionId).not.toBe(first.selectionId);
        });
        it("keeps attachment snapshots readable after switching to HTML and hiding Live Preview", async function () {
            const selection = await attach("strong", "bold words", 2, 8);
            const panel = win.brackets.test.WorkspaceManager.getPanelForID("live-preview-panel");
            await SpecRunnerUtils.openProjectFiles(["simple.html"]);
            await awaitsFor(() => !sync.isActive(), "HTML preview active");
            panel.hide();
            try {
                const result = await sync.getRenderedMdSelectionFollowUp({selectionId: selection.selectionId,
                    lineStart: selection.rendered.startLine, lineEnd: selection.rendered.endLine});
                expect(result.error).toBeUndefined();
                expect(result.lines.some(line => line.text.includes("⟦ld wor⟧"))).toBe(true);
                expect(panel.isVisible()).toBe(false);
            } finally { panel.show(); }
        });
        if (Phoenix.isNativeApp) {
            it("adds real Markdown selections to the shared dialog without opening the AI sidebar", async function () {
                const chat = win.brackets.test.AILivePreviewChat;
                const tabs = win.brackets.getModule("view/SidebarTabs");
                tabs.setActiveTab(tabs.SIDEBAR_TAB_FILES);
                chat.destroy();
                chat.init();
                sync.setAskAIHandler(file => { received.push(file); return chat.attachSelection(file); });
                try {
                    const first = await attach("strong", "bold words", 2, 8);
                    await attach("strong", "bold words", 2, 8);
                    expect(chat._test.getState().open).toBe(true);
                    expect(chat._test.getState().files.length).toBe(1);
                    expect(chat._test.getState().files[0].markdownSelection.selectionId).toBe(first.selectionId);
                    expect(tabs.getActiveTab()).toBe(tabs.SIDEBAR_TAB_FILES);
                    const count = chat._test.getState().files.length;
                    win.document.getElementById("live-preview-ask-ai").click();
                    expect(chat._test.getState().open).toBe(false);
                    expect(chat._test.getState().files.length).toBe(count);
                    win.document.getElementById("live-preview-ask-ai").click();
                    expect(chat._test.getState().open).toBe(true);
                    expect(chat._test.getState().files.length).toBe(count);
                } finally { chat.destroy(); }
            });
        }
        it("restores a queued selection after reopening a closed preview", async function () {
            const selection = await attach("strong", "bold words", 2, 8);
            frame.contentWindow.getSelection().removeAllRanges();
            await win.brackets.test.CommandManager.execute(commands.FILE_LIVE_FILE_PREVIEW);
            expect(win.brackets.test.WorkspaceManager.isPanelVisible("live-preview-panel")).toBe(false);
            sync.revealSelection(editor.document.file.fullPath, {selectionId: selection.selectionId});
            await win.brackets.test.CommandManager.execute(commands.FILE_LIVE_FILE_PREVIEW);
            // Test windows deliberately suppress automatic server startup in LiveDevelopment/main.
            win.brackets.test.LiveDevMultiBrowser.open();
            await awaitsFor(() => frame.contentWindow.getSelection().toString() === "ld wor",
                "selection restored after reopening", 20000);
            expect(win.brackets.test.WorkspaceManager.isPanelVisible("live-preview-panel")).toBe(true);
        });
        it("waits for the attached file when revealing a selection from another preview", async function () {
            const selection = await attach("strong", "bold words", 2, 8);
            const path = editor.document.file.fullPath;
            frame.contentWindow.getSelection().removeAllRanges();
            await SpecRunnerUtils.openProjectFiles(["simple.html"]);
            await awaitsFor(() => !sync.isActive(), "HTML preview active");
            sync.revealSelection(path, {selectionId: selection.selectionId});
            await SpecRunnerUtils.openProjectFiles(["ask-ai.md"]);
            await awaitsFor(() => frame.contentWindow.getSelection().toString() === "ld wor",
                "selection restored after switching documents");
        });
        it("restores a multi-block selection after unchanged content is rendered into new DOM nodes", async function () {
            const doc = frame.contentDocument;
            const content = doc.getElementById("viewer-content");
            const range = doc.createRange();
            range.setStart(content.querySelector("h1").firstChild, 2);
            range.setEnd(content.querySelector("p strong").firstChild, 4);
            const selection = frame.contentWindow.getSelection();
            selection.removeAllRanges(); selection.addRange(range);
            const expected = selection.toString();
            doc.getElementById("fb-ask-ai").click();
            await awaitsFor(() => received.length === 1, "multi-block selection attached");
            selection.removeAllRanges();
            content.innerHTML = content.innerHTML;
            sync.revealSelection(editor.document.file.fullPath, received[0].markdownSelection);
            await awaitsFor(() => selection.toString() === expected, "selection restored in rebuilt DOM");
        });
        it("queries the original marked snapshot after the browser selection is cleared", async function () {
            const selection = await attach("td", "repeated", 0, 8, 1);
            frame.contentWindow.getSelection().removeAllRanges();
            const result = await sync.getRenderedMdSelectionFollowUp({selectionId: selection.selectionId,
                lineStart: selection.rendered.startLine, lineEnd: selection.rendered.endLine, maxCharsClipPerLine: 100});
            expect(result.lines[0].text).toContain("repeated\t⟦repeated⟧");
            expect(result.snapshot).toBe(true);
        });
        it("rejects an expired selection rather than returning another snapshot", async function () {
            const result = await sync.getRenderedMdSelectionFollowUp({selectionId: "missing", lineStart: 1, lineEnd: 3});
            expect(result.error).toContain("expired");
        });
        ["origin", "source"].forEach(function (field) {
            it("ignores a snapshot reply from an unrelated " + field, async function () {
                const selection = await attach("strong", "bold words", 2, 8);
                const viewer = frame.contentWindow;
                const onRequest = function (event) {
                    const message = event.data;
                    if (message.type === "MDVIEWR_RENDERED_LINES") {
                        win.dispatchEvent(new win.MessageEvent("message", {
                            source: field === "source" ? win : viewer,
                            origin: field === "origin" ? "https://unrelated.invalid" : win.location.origin,
                            data: {type: "MDVIEWR_EVENT", eventName: "mdviewrRenderedLines",
                                requestId: message.requestId, result: {error: "unrelated reply"}}
                        }));
                    }
                };
                viewer.addEventListener("message", onRequest);
                try {
                    const result = await sync.getRenderedMdSelectionFollowUp({selectionId: selection.selectionId,
                        lineStart: selection.rendered.startLine, lineEnd: selection.rendered.endLine});
                    expect(result.error).toBeUndefined();
                    expect(result.lines[0].text).toContain("⟦ld wor⟧");
                } finally {
                    viewer.removeEventListener("message", onRequest);
                }
            });
        });
        /** Replace only this spec's unsaved buffer and wait for the real preview render. */
        async function setSource(source) {
            editor.document.setText(source);
            await awaitsFor(() => frame.contentWindow.__getCurrentContent() === source &&
                !frame.contentWindow.__isSuppressingContentChange(), "updated Markdown preview");
        }
        it("identifies the second repeated word from DOM position alone", async function () {
            await setSource("Hello world world!");
            const selection = await attach("p", "Hello world world!", 12, 17);
            expect(selection.excerpt[0].text).toBe("Hello world ⟦world⟧!");
        });
        it("bounds huge lines and allows the tool to expand context around a distant selection", async function () {
            await setSource("Start " + "padding ".repeat(18000) + "chosen phrase ending");
            const selection = await attach("p", "chosen phrase");
            expect(JSON.stringify(selection).length).toBeLessThan(2000);
            expect(selection.excerpt[0].text).toContain("⟦chosen phrase⟧");
            const result = await sync.getRenderedMdSelectionFollowUp({selectionId: selection.selectionId,
                lineStart: 1, lineEnd: 10000, maxCharsClipPerLine: 80});
            expect(result.lines[0].text.length).toBeLessThan(81);
            expect(result.lines[0].clipped).toBe(true);
        });
        it("keeps snapshots for multiple selections separate", async function () {
            await setSource("Hello world world!");
            const first = await attach("p", "Hello world world!", 6, 11);
            received = [];
            const second = await attach("p", "Hello world world!", 12, 17);
            const read = selection => sync.getRenderedMdSelectionFollowUp({
                selectionId: selection.selectionId, lineStart: 1, lineEnd: 1
            });
            expect((await read(first)).lines[0].text).toBe("Hello ⟦world⟧ world!");
            expect((await read(second)).lines[0].text).toBe("Hello world ⟦world⟧!");
        });
        it("returns the current selection or reports an empty explicit selection request", async function () {
            await attach("strong", "bold words");
            received = [];
            let hinted = false;
            sync.setAskAIHandler(file => received.push(file), () => { hinted = true; });
            sync.requestAskAISelection();
            await awaitsFor(() => received.length === 1, "requested attachment");
            frame.contentWindow.getSelection().removeAllRanges();
            sync.requestAskAISelection();
            await awaitsFor(() => hinted, "empty selection hint");
        });
        it("flushes a pending visual edit before collecting source context", async function () {
            frame.contentWindow.__setEditModeForTest(true);
            await awaitsFor(() => frame.contentDocument.getElementById("viewer-content").isContentEditable, "edit mode");
            const node = frame.contentDocument.querySelector("#viewer-content strong").firstChild;
            node.data = "fresh words";
            const range = frame.contentDocument.createRange();
            range.selectNodeContents(node);
            const selected = frame.contentWindow.getSelection();
            selected.removeAllRanges(); selected.addRange(range);
            frame.contentWindow.__triggerContentSync();
            frame.contentDocument.getElementById("fb-ask-ai").click();
            await awaitsFor(() => received.length === 1, "pending edit selection attached");
            expect(received[0].markdownSelection.excerpt[0].text).toContain("⟦fresh words⟧");
            expect(editor.document.getText()).toContain("fresh words");
        });
        it("caps tool output and does not include the line after a selected code block", async function () {
            await setSource("```text\n" + Array.from({length: 65}, (_, i) => "row " + i + " " + "x".repeat(300)).join("\n") +
                "\n```\n\nOutside selection");
            const doc = frame.contentDocument;
            const range = doc.createRange();
            range.selectNodeContents(doc.querySelector("#viewer-content pre code"));
            const browserSelection = frame.contentWindow.getSelection();
            browserSelection.removeAllRanges(); browserSelection.addRange(range);
            doc.getElementById("fb-ask-ai").click();
            await awaitsFor(() => received.length === 1, "whole code selection attached");
            const selection = received[0].markdownSelection;
            expect(selection.rendered.endLine).toBe(65);
            const result = await sync.getRenderedMdSelectionFollowUp({selectionId: selection.selectionId,
                lineStart: 1, lineEnd: 100, maxCharsClipPerLine: 2000});
            expect(result.lines.length).toBeLessThan(51);
            expect(result.lines.map(line => line.text).join("").length).toBeLessThan(12001);
            expect(result.truncated).toBe(true);
        });
    });
});
