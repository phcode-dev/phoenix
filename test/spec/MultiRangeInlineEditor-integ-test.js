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

/*global describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, awaitsForDone */

define(function (require, exports, module) {


    let SpecRunnerUtils         = require("spec/SpecRunnerUtils"),
        Commands                = require("command/Commands");

    // TODO: overlaps a lot with CSSInlineEdit-test integration suite
    describe("integration: MultiRangeInlineEditor", function () {

        var inlineEditor,
            hostEditor;


        var testWindow,
            TWCommandManager,
            TWEditorManager,
            TWMultiRangeInlineEditor;

        beforeAll(async function () {
            await SpecRunnerUtils.createTempDirectory();

            // Create a new window that will be shared by ALL tests in this spec.
            testWindow = await SpecRunnerUtils.createTestWindowAndRun();
            // Load module instances from brackets.test
            TWCommandManager         = testWindow.brackets.test.CommandManager;
            TWEditorManager          = testWindow.brackets.test.EditorManager;
            TWMultiRangeInlineEditor = testWindow.brackets.test.MultiRangeInlineEditor;

            await SpecRunnerUtils.loadProjectInTestWindow(SpecRunnerUtils.getTempDirectory());
        }, 30000);

        afterAll(async function () {
            testWindow               = null;
            TWCommandManager         = null;
            TWEditorManager          = null;
            TWMultiRangeInlineEditor = null;
            await SpecRunnerUtils.closeTestWindow();

            await SpecRunnerUtils.removeTempDirectory();
        });

        beforeEach(async function () {
            await awaitsForDone(TWCommandManager.execute(Commands.FILE_NEW_UNTITLED));

            hostEditor = TWEditorManager.getCurrentFullEditor();
        });

        afterEach(async function () {
            await awaitsForDone(TWCommandManager.execute(Commands.FILE_CLOSE, { _forceClose: true }));

            inlineEditor = null;
            hostEditor = null;
        });

        // This needs to open in a Brackets test window because it's actually relying on
        // the real Editor functions for adding an inline widget, which complete asynchronously
        // after the animation is finished. That animation doesn't actually occur in the
        // Jasmine window.
        it("should close and return focus to the host editor", async function () {
            var inlineDoc = SpecRunnerUtils.createMockDocument("div{}\n.foo{}\n");

            var mockRanges = [
                {
                    document: inlineDoc,
                    name: "div",
                    lineStart: 0,
                    lineEnd: 0
                }
            ];

            inlineEditor = new TWMultiRangeInlineEditor(mockRanges);
            inlineEditor.load(hostEditor);

            // add widget
            await awaitsForDone(hostEditor.addInlineWidget({line: 0, ch: 0}, inlineEditor));

            // verify it was added
            expect(hostEditor.hasFocus()).toBe(false);
            expect(hostEditor.getInlineWidgets().length).toBe(1);

            // close the inline editor directly, should call EditorManager and removeInlineWidget
            await awaitsForDone(inlineEditor.close());

            // verify no editors
            expect(hostEditor.getInlineWidgets().length).toBe(0);
            expect(hostEditor.hasFocus()).toBe(true);
        });

        it("should be able to add an inline editor with no ranges", async function () {
            inlineEditor = new TWMultiRangeInlineEditor([]);
            inlineEditor.load(hostEditor);
            await awaitsForDone(hostEditor.addInlineWidget({line: 0, ch: 0}, inlineEditor), "adding empty inline editor");

            // verify it was added
            expect(hostEditor.getInlineWidgets().length).toBe(1);
            await awaitsForDone(inlineEditor.close(), "closing empty inline editor");

            // verify no editors
            expect(hostEditor.getInlineWidgets().length).toBe(0);
        });
    });
});
