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

/*global describe, beforeAll, afterAll, beforeEach, afterEach, it, expect, jsPromise */

define(function (require, exports, module) {

    const SpecRunnerUtils = require("spec/SpecRunnerUtils");

    const tempDir = SpecRunnerUtils.getTempDirectory();

    // Test fixture data
    const SIMPLE_SESSION        = require("text!spec/ai-history-test-files/simple-session.json");
    const MULTI_TOOL_SESSION    = require("text!spec/ai-history-test-files/multi-tool-session.json");
    const SESSION_WITH_IMAGES   = require("text!spec/ai-history-test-files/session-with-images.json");
    const SESSION_WITH_ERRORS   = require("text!spec/ai-history-test-files/session-with-errors.json");
    const SESSION_WITH_QUESTIONS = require("text!spec/ai-history-test-files/session-with-questions.json");
    const SESSION_WITH_OTHER    = require("text!spec/ai-history-test-files/session-with-other-answer.json");

    let AIChatHistory,
        FileSystem,
        testWindow;

    describe("integration:AIChatHistory", function () {

        beforeAll(async function () {
            testWindow = await SpecRunnerUtils.createTestWindowAndRun();
            AIChatHistory = testWindow.brackets.test.AIChatHistory;
            FileSystem    = testWindow.brackets.test.FileSystem;
        }, 30000);

        afterAll(async function () {
            AIChatHistory = null;
            FileSystem    = null;
            testWindow    = null;
            await SpecRunnerUtils.closeTestWindow();
        }, 30000);

        beforeEach(async function () {
            await SpecRunnerUtils.createTempDirectory();
            await SpecRunnerUtils.loadProjectInTestWindow(tempDir);
        });

        afterEach(async function () {
            // Clean up: clear history metadata and files
            await jsPromise(new Promise(function (resolve) {
                AIChatHistory.clearAllHistory(resolve);
            }));
            await SpecRunnerUtils.removeTempDirectory();
        });

        // --- Helpers ---

        function saveChatHistory(sessionId, data) {
            return new Promise(function (resolve, reject) {
                AIChatHistory.saveChatHistory(sessionId, data, function (err) {
                    if (err) { reject(err); } else { resolve(); }
                });
            });
        }

        function loadChatHistory(sessionId) {
            return new Promise(function (resolve, reject) {
                AIChatHistory.loadChatHistory(sessionId, function (err, data) {
                    if (err) { reject(err); } else { resolve(data); }
                });
            });
        }

        function deleteSession(sessionId) {
            return new Promise(function (resolve) {
                AIChatHistory.deleteSession(sessionId, resolve);
            });
        }

        function clearAllHistory() {
            return new Promise(function (resolve) {
                AIChatHistory.clearAllHistory(resolve);
            });
        }

        function loadFixture(jsonText) {
            return JSON.parse(jsonText);
        }

        function makeSampleSession(id, title, messages) {
            return {
                id: id,
                title: title || "Test session",
                timestamp: Date.now(),
                messages: messages || [
                    { type: "user", text: title || "Hello" },
                    { type: "assistant", markdown: "Hi there!", isFirst: true },
                    { type: "complete" }
                ]
            };
        }

        // --- Session metadata (StateManager) ---

        describe("session metadata", function () {
            it("should return empty array when no history exists", function () {
                const history = AIChatHistory.loadSessionHistory();
                expect(Array.isArray(history)).toBe(true);
                expect(history.length).toBe(0);
            });

            it("should record and load session metadata", function () {
                AIChatHistory.recordSessionMetadata("sess-1", "First message");
                const history = AIChatHistory.loadSessionHistory();
                expect(history.length).toBe(1);
                expect(history[0].id).toBe("sess-1");
                expect(history[0].title).toBe("First message");
                expect(typeof history[0].timestamp).toBe("number");
            });

            it("should store most recent session first", function () {
                AIChatHistory.recordSessionMetadata("sess-1", "First");
                AIChatHistory.recordSessionMetadata("sess-2", "Second");
                const history = AIChatHistory.loadSessionHistory();
                expect(history.length).toBe(2);
                expect(history[0].id).toBe("sess-2");
                expect(history[1].id).toBe("sess-1");
            });

            it("should move existing session to top on re-record", function () {
                AIChatHistory.recordSessionMetadata("sess-1", "First");
                AIChatHistory.recordSessionMetadata("sess-2", "Second");
                AIChatHistory.recordSessionMetadata("sess-1", "First updated");
                const history = AIChatHistory.loadSessionHistory();
                expect(history.length).toBe(2);
                expect(history[0].id).toBe("sess-1");
                expect(history[0].title).toBe("First updated");
                expect(history[1].id).toBe("sess-2");
            });

            it("should truncate title to SESSION_TITLE_MAX_LEN", function () {
                const longTitle = "A".repeat(200);
                AIChatHistory.recordSessionMetadata("sess-1", longTitle);
                const history = AIChatHistory.loadSessionHistory();
                expect(history[0].title.length).toBe(AIChatHistory.SESSION_TITLE_MAX_LEN);
            });

            it("should cap history at 50 entries", function () {
                for (let i = 0; i < 55; i++) {
                    AIChatHistory.recordSessionMetadata("sess-" + i, "Session " + i);
                }
                const history = AIChatHistory.loadSessionHistory();
                expect(history.length).toBe(50);
                // Most recent should be first
                expect(history[0].id).toBe("sess-54");
            });

            it("should use 'Untitled' for null or empty title", function () {
                AIChatHistory.recordSessionMetadata("sess-1", null);
                AIChatHistory.recordSessionMetadata("sess-2", "");
                const history = AIChatHistory.loadSessionHistory();
                expect(history[0].title).toBe("Untitled");
                expect(history[1].title).toBe("Untitled");
            });
        });

        // --- Chat history file storage ---

        describe("chat history file storage", function () {
            it("should save and load a simple session from fixture", async function () {
                const fixture = loadFixture(SIMPLE_SESSION);
                await saveChatHistory(fixture.id, fixture);
                const loaded = await loadChatHistory(fixture.id);
                expect(loaded.id).toBe(fixture.id);
                expect(loaded.title).toBe("What is 2+2?");
                expect(loaded.messages.length).toBe(3);
                expect(loaded.messages[0].type).toBe("user");
                expect(loaded.messages[0].text).toBe("What is 2+2?");
                expect(loaded.messages[1].type).toBe("assistant");
                expect(loaded.messages[1].markdown).toBe("The answer is **4**.");
                expect(loaded.messages[2].type).toBe("complete");
            });

            it("should save and load a multi-tool session from fixture", async function () {
                const fixture = loadFixture(MULTI_TOOL_SESSION);
                await saveChatHistory(fixture.id, fixture);
                const loaded = await loadChatHistory(fixture.id);
                expect(loaded.id).toBe("multi-tool-sess");
                expect(loaded.messages.length).toBe(13);
                // Verify various message types survived round-trip
                expect(loaded.messages[2].type).toBe("tool");
                expect(loaded.messages[2].toolName).toBe("Glob");
                expect(loaded.messages[2].elapsed).toBe(0.2);
                expect(loaded.messages[7].type).toBe("tool_edit");
                expect(loaded.messages[7].linesAdded).toBe(15);
                expect(loaded.messages[11].type).toBe("edit_summary");
                expect(loaded.messages[11].files.length).toBe(2);
            });

            it("should preserve images through round-trip", async function () {
                const fixture = loadFixture(SESSION_WITH_IMAGES);
                await saveChatHistory(fixture.id, fixture);
                const loaded = await loadChatHistory(fixture.id);
                expect(loaded.messages[0].images.length).toBe(2);
                expect(loaded.messages[0].images[0].dataUrl).toBe("data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==");
                expect(loaded.messages[0].images[0].mediaType).toBe("image/png");
                expect(loaded.messages[0].images[1].mediaType).toBe("image/jpeg");
            });

            it("should preserve error messages through round-trip", async function () {
                const fixture = loadFixture(SESSION_WITH_ERRORS);
                await saveChatHistory(fixture.id, fixture);
                const loaded = await loadChatHistory(fixture.id);
                expect(loaded.messages[3].type).toBe("error");
                expect(loaded.messages[3].text).toBe("Process exited with code 1: Tests failed");
            });

            it("should preserve question/answer data through round-trip", async function () {
                const fixture = loadFixture(SESSION_WITH_QUESTIONS);
                await saveChatHistory(fixture.id, fixture);
                const loaded = await loadChatHistory(fixture.id);
                const q = loaded.messages[2];
                expect(q.type).toBe("question");
                expect(q.questions.length).toBe(2);
                expect(q.questions[0].question).toBe("Which auth method do you prefer?");
                expect(q.questions[0].options.length).toBe(3);
                expect(q.answers["Which auth method do you prefer?"]).toBe("JWT");
                expect(q.answers["Which database?"]).toBe("PostgreSQL");
            });

            it("should overwrite existing session file on re-save", async function () {
                const session1 = makeSampleSession("sess-overwrite", "Original");
                await saveChatHistory("sess-overwrite", session1);

                const session2 = makeSampleSession("sess-overwrite", "Updated");
                session2.messages.push({ type: "user", text: "Follow-up" });
                await saveChatHistory("sess-overwrite", session2);

                const loaded = await loadChatHistory("sess-overwrite");
                expect(loaded.title).toBe("Updated");
                expect(loaded.messages.length).toBe(4);
            });

            it("should fail gracefully when loading non-existent session", async function () {
                let error = null;
                try {
                    await loadChatHistory("does-not-exist");
                } catch (err) {
                    error = err;
                }
                expect(error).not.toBeNull();
            });

            it("should save multiple sessions independently", async function () {
                const fixture1 = loadFixture(SIMPLE_SESSION);
                const fixture2 = loadFixture(MULTI_TOOL_SESSION);
                await saveChatHistory(fixture1.id, fixture1);
                await saveChatHistory(fixture2.id, fixture2);

                const loaded1 = await loadChatHistory(fixture1.id);
                const loaded2 = await loadChatHistory(fixture2.id);
                expect(loaded1.title).toBe("What is 2+2?");
                expect(loaded2.title).toBe("Refactor the utils module");
            });
        });

        // --- Deletion ---

        describe("deletion", function () {
            it("should delete a single session (metadata + file)", async function () {
                AIChatHistory.recordSessionMetadata("sess-del", "To delete");
                await saveChatHistory("sess-del", makeSampleSession("sess-del", "To delete"));
                AIChatHistory.recordSessionMetadata("sess-keep", "Keep me");
                await saveChatHistory("sess-keep", makeSampleSession("sess-keep", "Keep me"));

                await deleteSession("sess-del");

                const history = AIChatHistory.loadSessionHistory();
                expect(history.length).toBe(1);
                expect(history[0].id).toBe("sess-keep");

                let loadError = null;
                try {
                    await loadChatHistory("sess-del");
                } catch (err) {
                    loadError = err;
                }
                expect(loadError).not.toBeNull();

                const kept = await loadChatHistory("sess-keep");
                expect(kept.id).toBe("sess-keep");
            });

            it("should clear all history (metadata + all files)", async function () {
                AIChatHistory.recordSessionMetadata("sess-1", "First");
                AIChatHistory.recordSessionMetadata("sess-2", "Second");
                await saveChatHistory("sess-1", makeSampleSession("sess-1", "First"));
                await saveChatHistory("sess-2", makeSampleSession("sess-2", "Second"));

                await clearAllHistory();

                const history = AIChatHistory.loadSessionHistory();
                expect(history.length).toBe(0);

                let err1 = null, err2 = null;
                try { await loadChatHistory("sess-1"); } catch (e) { err1 = e; }
                try { await loadChatHistory("sess-2"); } catch (e) { err2 = e; }
                expect(err1).not.toBeNull();
                expect(err2).not.toBeNull();
            });

            it("should handle deleting non-existent session gracefully", async function () {
                await deleteSession("non-existent-id");
                const history = AIChatHistory.loadSessionHistory();
                expect(Array.isArray(history)).toBe(true);
            });
        });

        // --- Visual state restoration (DOM rendering) ---

        describe("renderRestoredChat", function () {
            let $container, $panel;

            beforeEach(function () {
                $container = testWindow.$('<div class="ai-chat-messages"></div>');
                $panel = testWindow.$('<div class="ai-chat-panel"></div>');
                $panel.append($container);
                testWindow.$("body").append($panel);
            });

            afterEach(function () {
                $panel.remove();
                $container = null;
                $panel = null;
            });

            it("should render user message with correct text", function () {
                const fixture = loadFixture(SIMPLE_SESSION);
                AIChatHistory.renderRestoredChat([fixture.messages[0]], $container, $panel);
                const $msg = $container.find(".ai-msg-user");
                expect($msg.length).toBe(1);
                expect($msg.find(".ai-msg-content").text()).toContain("What is 2+2?");
                expect($msg.find(".ai-msg-label").text()).not.toBe("");
            });

            it("should render user message with image thumbnails", function () {
                const fixture = loadFixture(SESSION_WITH_IMAGES);
                AIChatHistory.renderRestoredChat([fixture.messages[0]], $container, $panel);
                const $thumbs = $container.find(".ai-user-image-thumb");
                expect($thumbs.length).toBe(2);
                expect($thumbs.eq(0).attr("src")).toBe("data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==");
                expect($thumbs.eq(1).attr("src")).toBe("data:image/jpeg;base64,/9j/4AAQSkZJRg==");
            });

            it("should render assistant message with parsed markdown", function () {
                const fixture = loadFixture(SIMPLE_SESSION);
                AIChatHistory.renderRestoredChat([fixture.messages[1]], $container, $panel);
                const $msg = $container.find(".ai-msg-assistant");
                expect($msg.length).toBe(1);
                // First assistant message should have the Claude label
                expect($msg.find(".ai-msg-label").length).toBe(1);
                // Markdown **4** should be rendered as <strong>
                expect($msg.find("strong").text()).toBe("4");
            });

            it("should show Claude label only on first assistant message", function () {
                AIChatHistory.renderRestoredChat([
                    { type: "assistant", markdown: "First response", isFirst: true },
                    { type: "assistant", markdown: "Continued response" }
                ], $container, $panel);
                const $msgs = $container.find(".ai-msg-assistant");
                expect($msgs.length).toBe(2);
                expect($msgs.eq(0).find(".ai-msg-label").length).toBe(1);
                expect($msgs.eq(1).find(".ai-msg-label").length).toBe(0);
            });

            it("should render assistant markdown with code blocks and copy buttons", function () {
                AIChatHistory.renderRestoredChat([
                    { type: "assistant", markdown: "```js\nconsole.log('hi');\n```", isFirst: true }
                ], $container, $panel);
                const $pre = $container.find("pre");
                expect($pre.length).toBe(1);
                expect($pre.find("code").text()).toContain("console.log");
                // Copy button should be injected
                expect($pre.find(".ai-copy-btn").length).toBe(1);
            });

            it("should render tool indicators with correct icon, color, and elapsed time", function () {
                const fixture = loadFixture(MULTI_TOOL_SESSION);
                // Render just the Glob tool message
                AIChatHistory.renderRestoredChat([fixture.messages[2]], $container, $panel);
                const $tool = $container.find(".ai-msg-tool");
                expect($tool.length).toBe(1);
                expect($tool.hasClass("ai-tool-done")).toBe(true);
                expect($tool.find(".ai-tool-label").text()).toBe("Finding utils files");
                expect($tool.find(".ai-tool-elapsed").text()).toBe("0.2s");
                expect($tool.find(".fa-magnifying-glass").length).toBe(1);
            });

            it("should render tool with default icon when toolName is unknown", function () {
                AIChatHistory.renderRestoredChat([
                    { type: "tool", toolName: "UnknownTool", summary: "Doing something" }
                ], $container, $panel);
                const $tool = $container.find(".ai-msg-tool");
                expect($tool.length).toBe(1);
                // Should use fallback gear icon
                expect($tool.find(".fa-gear").length).toBe(1);
                expect($tool.find(".ai-tool-label").text()).toBe("Doing something");
            });

            it("should render tool without elapsed time when not provided", function () {
                AIChatHistory.renderRestoredChat([
                    { type: "tool", toolName: "Read", summary: "Reading" }
                ], $container, $panel);
                const $elapsed = $container.find(".ai-tool-elapsed");
                expect($elapsed.length).toBe(0);
            });

            it("should render tool_edit with file name and line stats", function () {
                const fixture = loadFixture(MULTI_TOOL_SESSION);
                // tool_edit is at index 7
                AIChatHistory.renderRestoredChat([fixture.messages[7]], $container, $panel);
                const $tool = $container.find(".ai-msg-tool");
                expect($tool.length).toBe(1);
                expect($tool.find(".ai-tool-label").text()).toBe("Edit index.js");
                expect($tool.find(".ai-edit-summary-add").text()).toBe("+15");
                expect($tool.find(".ai-edit-summary-del").text()).toBe("-8");
            });

            it("should render error message with correct text", function () {
                const fixture = loadFixture(SESSION_WITH_ERRORS);
                AIChatHistory.renderRestoredChat([fixture.messages[3]], $container, $panel);
                const $err = $container.find(".ai-msg-error");
                expect($err.length).toBe(1);
                expect($err.find(".ai-msg-content").text()).toBe("Process exited with code 1: Tests failed");
            });

            it("should render question with selected answer highlighted", function () {
                const fixture = loadFixture(SESSION_WITH_QUESTIONS);
                AIChatHistory.renderRestoredChat([fixture.messages[2]], $container, $panel);
                const $question = $container.find(".ai-msg-question");
                expect($question.length).toBe(1);

                // First question block
                const $qBlocks = $question.find(".ai-question-block");
                expect($qBlocks.length).toBe(2);

                // First question: "Which auth method do you prefer?"
                const $q1Text = $qBlocks.eq(0).find(".ai-question-text");
                expect($q1Text.text()).toBe("Which auth method do you prefer?");
                const $q1Options = $qBlocks.eq(0).find(".ai-question-option");
                expect($q1Options.length).toBe(3);
                // All options should be disabled
                expect($q1Options.eq(0).prop("disabled")).toBe(true);
                expect($q1Options.eq(1).prop("disabled")).toBe(true);
                expect($q1Options.eq(2).prop("disabled")).toBe(true);
                // JWT should be selected (index 0)
                expect($q1Options.eq(0).hasClass("selected")).toBe(true);
                expect($q1Options.eq(1).hasClass("selected")).toBe(false);
                expect($q1Options.eq(2).hasClass("selected")).toBe(false);

                // Second question: "Which database?"
                const $q2Options = $qBlocks.eq(1).find(".ai-question-option");
                expect($q2Options.length).toBe(2);
                // PostgreSQL should be selected (index 0)
                expect($q2Options.eq(0).hasClass("selected")).toBe(true);
                expect($q2Options.eq(1).hasClass("selected")).toBe(false);
            });

            it("should render question with option descriptions", function () {
                const fixture = loadFixture(SESSION_WITH_QUESTIONS);
                AIChatHistory.renderRestoredChat([fixture.messages[2]], $container, $panel);
                const $descs = $container.find(".ai-question-option-desc");
                // 3 options for Q1 + 2 options for Q2 = 5 descriptions
                expect($descs.length).toBe(5);
                expect($descs.eq(0).text()).toBe("Stateless token-based auth");
            });

            it("should render question with 'Other' custom answer", function () {
                const fixture = loadFixture(SESSION_WITH_OTHER);
                AIChatHistory.renderRestoredChat([fixture.messages[1]], $container, $panel);
                const $other = $container.find(".ai-question-other-input");
                expect($other.length).toBe(1);
                expect($other.val()).toBe("Rollup with custom plugins");
                expect($other.prop("disabled")).toBe(true);
            });

            it("should render edit summary with file list and stats", function () {
                const fixture = loadFixture(MULTI_TOOL_SESSION);
                // edit_summary is at index 11
                AIChatHistory.renderRestoredChat([fixture.messages[11]], $container, $panel);
                const $summary = $container.find(".ai-msg-edit-summary");
                expect($summary.length).toBe(1);
                const $files = $summary.find(".ai-edit-summary-file");
                expect($files.length).toBe(2);
                expect($files.eq(0).find(".ai-edit-summary-name").text()).toBe("index.js");
                expect($files.eq(0).find(".ai-edit-summary-add").text()).toBe("+15");
                expect($files.eq(0).find(".ai-edit-summary-del").text()).toBe("-8");
                expect($files.eq(1).find(".ai-edit-summary-name").text()).toBe("helpers.js");
            });

            it("should skip 'complete' markers without rendering anything", function () {
                AIChatHistory.renderRestoredChat([
                    { type: "user", text: "hi" },
                    { type: "complete" }
                ], $container, $panel);
                expect($container.children().length).toBe(1);
            });

            it("should handle empty messages array", function () {
                AIChatHistory.renderRestoredChat([], $container, $panel);
                expect($container.children().length).toBe(0);
            });

            it("should handle null messages", function () {
                AIChatHistory.renderRestoredChat(null, $container, $panel);
                expect($container.children().length).toBe(0);
            });

            it("should ignore unknown message types without crashing", function () {
                AIChatHistory.renderRestoredChat([
                    { type: "user", text: "hi" },
                    { type: "some_future_type", data: "whatever" },
                    { type: "assistant", markdown: "hello", isFirst: true }
                ], $container, $panel);
                // Unknown type is skipped, user + assistant rendered
                expect($container.children().length).toBe(2);
            });
        });

        // --- End-to-end: save to disk, load, and render ---

        describe("end-to-end save and restore", function () {
            let $container, $panel;

            beforeEach(function () {
                $container = testWindow.$('<div class="ai-chat-messages"></div>');
                $panel = testWindow.$('<div class="ai-chat-panel"></div>');
                $panel.append($container);
                testWindow.$("body").append($panel);
            });

            afterEach(function () {
                $panel.remove();
                $container = null;
                $panel = null;
            });

            it("should save simple session to disk and restore visuals", async function () {
                const fixture = loadFixture(SIMPLE_SESSION);
                AIChatHistory.recordSessionMetadata(fixture.id, fixture.title);
                await saveChatHistory(fixture.id, fixture);

                // Simulate resume: load from disk and render
                const loaded = await loadChatHistory(fixture.id);
                AIChatHistory.renderRestoredChat(loaded.messages, $container, $panel);

                // Verify rendered output
                expect($container.children().length).toBe(2); // user + assistant (complete skipped)
                expect($container.find(".ai-msg-user .ai-msg-content").text()).toContain("What is 2+2?");
                expect($container.find(".ai-msg-assistant strong").text()).toBe("4");

                // Verify metadata
                const history = AIChatHistory.loadSessionHistory();
                expect(history[0].id).toBe(fixture.id);
            });

            it("should save multi-tool session and restore all message bubbles", async function () {
                const fixture = loadFixture(MULTI_TOOL_SESSION);
                AIChatHistory.recordSessionMetadata(fixture.id, fixture.title);
                await saveChatHistory(fixture.id, fixture);

                const loaded = await loadChatHistory(fixture.id);
                AIChatHistory.renderRestoredChat(loaded.messages, $container, $panel);

                // 12 visible items (complete skipped)
                expect($container.children().length).toBe(12);

                // Verify message order and types
                const children = $container.children();
                expect(children.eq(0).hasClass("ai-msg-user")).toBe(true);
                expect(children.eq(1).hasClass("ai-msg-assistant")).toBe(true);
                expect(children.eq(2).hasClass("ai-msg-tool")).toBe(true);      // Glob
                expect(children.eq(3).hasClass("ai-msg-tool")).toBe(true);      // Read
                expect(children.eq(4).hasClass("ai-msg-tool")).toBe(true);      // Read
                expect(children.eq(5).hasClass("ai-msg-assistant")).toBe(true);
                expect(children.eq(6).hasClass("ai-msg-tool")).toBe(true);      // Edit
                expect(children.eq(7).hasClass("ai-msg-tool")).toBe(true);      // tool_edit
                expect(children.eq(8).hasClass("ai-msg-tool")).toBe(true);      // Edit
                expect(children.eq(9).hasClass("ai-msg-tool")).toBe(true);      // tool_edit
                expect(children.eq(10).hasClass("ai-msg-assistant")).toBe(true);
                expect(children.eq(11).hasClass("ai-msg-edit-summary")).toBe(true);

                // All tool indicators should be in done state (5 tools + 2 tool_edits)
                expect($container.find(".ai-msg-tool.ai-tool-done").length).toBe(7);

                // Edit summary should have 2 files
                expect($container.find(".ai-edit-summary-file").length).toBe(2);
            });

            it("should save session with images and restore thumbnails", async function () {
                const fixture = loadFixture(SESSION_WITH_IMAGES);
                await saveChatHistory(fixture.id, fixture);

                const loaded = await loadChatHistory(fixture.id);
                AIChatHistory.renderRestoredChat(loaded.messages, $container, $panel);

                const $thumbs = $container.find(".ai-user-image-thumb");
                expect($thumbs.length).toBe(2);
                expect($thumbs.eq(0).attr("src")).toContain("data:image/png");
                expect($thumbs.eq(1).attr("src")).toContain("data:image/jpeg");
            });

            it("should save session with errors and restore error bubbles", async function () {
                const fixture = loadFixture(SESSION_WITH_ERRORS);
                await saveChatHistory(fixture.id, fixture);

                const loaded = await loadChatHistory(fixture.id);
                AIChatHistory.renderRestoredChat(loaded.messages, $container, $panel);

                // 6 visible items (complete skipped)
                expect($container.children().length).toBe(6);
                const $err = $container.find(".ai-msg-error");
                expect($err.length).toBe(1);
                expect($err.find(".ai-msg-content").text()).toContain("Tests failed");
            });

            it("should save session with questions and restore answered state", async function () {
                const fixture = loadFixture(SESSION_WITH_QUESTIONS);
                await saveChatHistory(fixture.id, fixture);

                const loaded = await loadChatHistory(fixture.id);
                AIChatHistory.renderRestoredChat(loaded.messages, $container, $panel);

                // Verify question block rendered with answered state
                const $question = $container.find(".ai-msg-question");
                expect($question.length).toBe(1);

                // JWT should be selected for first question
                const $q1Options = $question.find(".ai-question-block").eq(0).find(".ai-question-option");
                const selectedLabels = [];
                $q1Options.filter(".selected").each(function () {
                    selectedLabels.push(testWindow.$(this).find(".ai-question-option-label").text());
                });
                expect(selectedLabels).toEqual(["JWT"]);

                // PostgreSQL should be selected for second question
                const $q2Options = $question.find(".ai-question-block").eq(1).find(".ai-question-option");
                const selectedLabels2 = [];
                $q2Options.filter(".selected").each(function () {
                    selectedLabels2.push(testWindow.$(this).find(".ai-question-option-label").text());
                });
                expect(selectedLabels2).toEqual(["PostgreSQL"]);
            });

            it("should save and restore session with 'Other' custom answer", async function () {
                const fixture = loadFixture(SESSION_WITH_OTHER);
                await saveChatHistory(fixture.id, fixture);

                const loaded = await loadChatHistory(fixture.id);
                AIChatHistory.renderRestoredChat(loaded.messages, $container, $panel);

                // No predefined option should be selected
                const $options = $container.find(".ai-question-option.selected");
                expect($options.length).toBe(0);

                // Custom "Other" input should show the answer
                const $other = $container.find(".ai-question-other-input");
                expect($other.length).toBe(1);
                expect($other.val()).toBe("Rollup with custom plugins");
                expect($other.prop("disabled")).toBe(true);
            });

            it("should save, delete, and verify deletion end-to-end", async function () {
                const fixture = loadFixture(SIMPLE_SESSION);
                AIChatHistory.recordSessionMetadata(fixture.id, fixture.title);
                await saveChatHistory(fixture.id, fixture);

                // Verify exists
                const loaded = await loadChatHistory(fixture.id);
                expect(loaded.id).toBe(fixture.id);

                // Delete
                await deleteSession(fixture.id);

                // Verify metadata gone
                const history = AIChatHistory.loadSessionHistory();
                expect(history.some(function (h) { return h.id === fixture.id; })).toBe(false);

                // Verify file gone
                let error = null;
                try {
                    await loadChatHistory(fixture.id);
                } catch (e) {
                    error = e;
                }
                expect(error).not.toBeNull();
            });
        });

        // --- formatRelativeTime ---

        describe("formatRelativeTime", function () {
            it("should return 'just now' for recent timestamps", function () {
                const result = AIChatHistory.formatRelativeTime(Date.now());
                expect(result).toContain("just now");
            });

            it("should return minutes ago for timestamps within an hour", function () {
                const fiveMinAgo = Date.now() - (5 * 60 * 1000);
                const result = AIChatHistory.formatRelativeTime(fiveMinAgo);
                expect(result).toContain("5");
            });

            it("should return hours ago for timestamps within a day", function () {
                const threeHoursAgo = Date.now() - (3 * 60 * 60 * 1000);
                const result = AIChatHistory.formatRelativeTime(threeHoursAgo);
                expect(result).toContain("3");
            });

            it("should return days ago for timestamps older than a day", function () {
                const twoDaysAgo = Date.now() - (2 * 24 * 60 * 60 * 1000);
                const result = AIChatHistory.formatRelativeTime(twoDaysAgo);
                expect(result).toContain("2");
            });
        });
    });
});
