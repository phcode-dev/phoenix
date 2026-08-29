/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2026 - present core.ai. All rights reserved.
 *
 * This program is free software: you can redistribute it and/or modify it
 * under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see https://opensource.org/licenses/AGPL-3.0.
 */

/*global describe, it, expect, afterEach, jasmine, spyOn, window*/

define(function (require, exports, module) {

    const EditorManager = require("editor/EditorManager"),
        MarkdownSync = require("extensionsIntegrated/Phoenix-live-preview/MarkdownSync");

    function createCodeMirrorStub() {
        return {
            addLineClass: jasmine.createSpy("addLineClass"),
            off: jasmine.createSpy("off"),
            on: jasmine.createSpy("on"),
            removeLineClass: jasmine.createSpy("removeLineClass")
        };
    }

    function dispatchMarkdownMessage(iframeWindow, data) {
        const event = new window.Event("message");
        Object.defineProperty(event, "data", { value: data });
        Object.defineProperty(event, "source", { value: iframeWindow });
        window.dispatchEvent(event);
    }

    describe("unit:MarkdownSync", function () {
        afterEach(function () {
            MarkdownSync.deactivate();
            MarkdownSync.setCursorSyncEnabled(true);
        });

        it("removes listeners from the editor captured during activation", function () {
            const activatedCodeMirror = createCodeMirrorStub();
            const currentCodeMirror = createCodeMirrorStub();
            const document = {
                _masterEditor: {
                    _codeMirror: activatedCodeMirror
                },
                file: {
                    fullPath: "/test/activated.md"
                },
                off: jasmine.createSpy("document.off"),
                on: jasmine.createSpy("document.on")
            };
            const iframe = [{
                contentWindow: {
                    postMessage: jasmine.createSpy("postMessage")
                }
            }];
            let currentEditor = null;

            spyOn(EditorManager, "getCurrentFullEditor").and.callFake(function () {
                return currentEditor;
            });
            spyOn(EditorManager, "getActiveEditor").and.callFake(function () {
                return currentEditor;
            });

            MarkdownSync.activate(document, iframe, "/test/");
            activatedCodeMirror.off.calls.reset();
            currentCodeMirror.off.calls.reset();

            document._masterEditor = null;
            currentEditor = {
                _codeMirror: currentCodeMirror
            };
            MarkdownSync.deactivate();

            expect(activatedCodeMirror.off.calls.allArgs()).toEqual([
                ["cursorActivity", jasmine.any(Function)],
                ["focus", jasmine.any(Function)],
                ["change", jasmine.any(Function)],
                ["scroll", jasmine.any(Function)]
            ]);
            expect(currentCodeMirror.off).not.toHaveBeenCalled();
            expect(document.off).toHaveBeenCalledWith(
                "change",
                jasmine.any(Function)
            );
        });

        it("replaces and clears the cursor-sync line highlight", function () {
            const codeMirror = createCodeMirrorStub();
            const firstHandle = { line: 4 };
            const secondHandle = { line: 7 };
            const document = {
                _masterEditor: {
                    _codeMirror: codeMirror
                },
                file: {
                    fullPath: "/test/highlight.md"
                },
                off: jasmine.createSpy("document.off"),
                on: jasmine.createSpy("document.on")
            };
            const iframeWindow = {
                postMessage: jasmine.createSpy("postMessage")
            };
            const iframe = [{
                contentWindow: iframeWindow
            }];

            codeMirror.addLineClass.and.returnValues(firstHandle, secondHandle);
            MarkdownSync.setCursorSyncEnabled(true);
            MarkdownSync.activate(document, iframe, "/test/");

            dispatchMarkdownMessage(iframeWindow, {
                type: "MDVIEWR_EVENT",
                eventName: "mdviewrCursorLine",
                sourceLine: 5
            });
            expect(codeMirror.addLineClass).toHaveBeenCalledWith(
                4,
                "background",
                "cm-cursor-sync-highlight"
            );

            dispatchMarkdownMessage(iframeWindow, {
                type: "MDVIEWR_EVENT",
                eventName: "mdviewrCursorLine",
                sourceLine: 8
            });
            expect(codeMirror.removeLineClass).toHaveBeenCalledWith(
                firstHandle,
                "background",
                "cm-cursor-sync-highlight"
            );
            expect(codeMirror.addLineClass).toHaveBeenCalledWith(
                7,
                "background",
                "cm-cursor-sync-highlight"
            );

            dispatchMarkdownMessage(iframeWindow, {
                type: "MDVIEWR_EVENT",
                eventName: "mdviewrCursorSyncToggle",
                enabled: false
            });
            expect(codeMirror.removeLineClass).toHaveBeenCalledWith(
                secondHandle,
                "background",
                "cm-cursor-sync-highlight"
            );
        });
    });
});
