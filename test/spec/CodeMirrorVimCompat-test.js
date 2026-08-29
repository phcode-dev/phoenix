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

/*global describe, it, expect, afterEach*/

define(function (require, exports, module) {

    const CodeMirror = require("editor/CodeMirrorCompat"),
        VimCompat = require("editor/CodeMirrorVimCompat");

    VimCompat.install(CodeMirror);

    describe("CodeMirror Vim compatibility", function () {
        const editors = [];
        const fixtures = [];

        function createEditor(value, options) {
            const fixture = window.document.createElement("div");
            window.document.body.appendChild(fixture);
            fixtures.push(fixture);
            const editor = new CodeMirror(
                fixture,
                Object.assign({
                    keyMap: "vim",
                    value: value
                }, options || {})
            );
            editors.push(editor);
            CodeMirror.Vim.resetVimGlobalState_();
            return editor;
        }

        function sendVimKey(editor, key) {
            const handled = CodeMirror.Vim.multiSelectHandleKey(
                editor,
                key,
                "user"
            );
            if (!handled && key.length === 1 &&
                    editor.state.vim && editor.state.vim.insertMode) {
                if (editor.state.overwrite) {
                    editor.overWriteSelection(key);
                } else {
                    editor.replaceSelection(key, "end", "+input");
                }
            }
            return handled;
        }

        function sendVimKeys(editor) {
            Array.prototype.slice.call(arguments, 1).forEach(function (key) {
                sendVimKey(editor, key);
            });
        }

        function characterEvent(character) {
            return {
                altKey: false,
                charCode: character.charCodeAt(0),
                ctrlKey: false,
                defaultPrevented: false,
                key: character,
                keyCode: character.toUpperCase().charCodeAt(0),
                metaKey: false,
                preventDefault: function () {
                    this.defaultPrevented = true;
                },
                shiftKey: character !== character.toLowerCase(),
                stopPropagation: function () {}
            };
        }

        afterEach(function () {
            editors.forEach(function (editor) {
                editor.destroy();
            });
            editors.length = 0;
            fixtures.forEach(function (fixture) {
                fixture.remove();
            });
            fixtures.length = 0;
            CodeMirror.Vim.resetVimGlobalState_();
        });

        it("dispatches normal-mode edits through the configured keymap", function () {
            const editor = createEditor("abc");
            const event = characterEvent("x");

            expect(editor.triggerOnKeyPress(event)).toBe(true);
            expect(event.defaultPrevented).toBe(true);
            expect(editor.getValue()).toBe("bc");

            sendVimKey(editor, "u");
            expect(editor.getValue()).toBe("abc");
            sendVimKey(editor, "<C-r>");
            expect(editor.getValue()).toBe("bc");
        });

        it("switches between normal, insert, and replace modes", function () {
            const editor = createEditor("abc");

            expect(editor.state.vim.insertMode).toBe(false);
            expect(editor.getOption("disableInput")).toBe(true);
            expect(editor.getWrapperElement().classList.contains("cm-vimMode"))
                .toBe(true);

            sendVimKey(editor, "i");
            expect(editor.state.vim.insertMode).toBe(true);
            expect(editor.getOption("keyMap")).toBe("vim-insert");
            sendVimKey(editor, "Z");
            sendVimKey(editor, "<Esc>");
            expect(editor.getValue()).toBe("Zabc");
            expect(editor.state.vim.insertMode).toBe(false);
            expect(editor.getOption("keyMap")).toBe("vim");

            editor.setCursor(CodeMirror.Pos(0, 0));
            sendVimKey(editor, "R");
            expect(editor.state.overwrite).toBe(true);
            expect(editor.getOption("keyMap")).toBe("vim-replace");
            sendVimKey(editor, "Q");
            sendVimKey(editor, "<Esc>");
            expect(editor.getValue()).toBe("Qabc");
            expect(editor.state.overwrite).toBe(false);
            expect(editor.getOption("keyMap")).toBe("vim");
        });

        it("preserves marks and recorded macros on the CM6 document", function () {
            const editor = createEditor("        ");

            editor.setCursor(CodeMirror.Pos(0, 2));
            sendVimKeys(editor, "m", "a", "l", "l", "`", "a");
            expect(editor.getCursor()).toEqual({line: 0, ch: 2});

            editor.setCursor(CodeMirror.Pos(0, 0));
            sendVimKeys(editor, "q", "q", "l", "l", "q");
            expect(editor.getCursor()).toEqual({line: 0, ch: 2});
            sendVimKeys(editor, "@", "q");
            expect(editor.getCursor()).toEqual({line: 0, ch: 4});
        });

        it("opens and completes Vim search dialogs", function () {
            const editor = createEditor("alpha beta alpha");

            sendVimKey(editor, "/");
            const input = editor.getWrapperElement().querySelector(
                ".CodeMirror-dialog input"
            );
            expect(input).not.toBeNull();
            input.value = "beta";
            input.dispatchEvent(new window.KeyboardEvent("keydown", {
                bubbles: true,
                key: "Enter",
                keyCode: 13,
                which: 13
            }));

            expect(editor.getWrapperElement().querySelector(".CodeMirror-dialog"))
                .toBeNull();
            expect(editor.getCursor()).toEqual({line: 0, ch: 6});
        });

        it("leaves Vim mode cleanly when the keymap changes or editor is destroyed", function () {
            const editor = createEditor("text");

            editor.setOption("keyMap", "default");
            expect(editor.state.vim).toBeNull();
            expect(editor.getOption("disableInput")).toBe(false);
            expect(editor.getWrapperElement().classList.contains("cm-vimMode"))
                .toBe(false);

            editor.setOption("keyMap", "vim");
            expect(editor.state.vim).toBeTruthy();
            editor.destroy();
            expect(editor.state.vim).toBeNull();
        });
    });
});
