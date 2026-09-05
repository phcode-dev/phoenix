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
 *
 */

/*global describe, it, expect, afterEach */

define(function (require, exports, module) {

    const CodeMirror = require("editor/CodeMirrorCompat"),
        LegacyAddons = require("editor/CodeMirrorLegacyAddons");

    LegacyAddons.installAll(CodeMirror);

    describe("CodeMirror legacy addon compatibility", function () {
        const editors = [];
        const fixtures = [];

        function createEditor(value, options) {
            const fixture = window.document.createElement("div");
            window.document.body.appendChild(fixture);
            fixtures.push(fixture);
            const editor = new CodeMirror(
                fixture,
                Object.assign({
                    value: value
                }, options || {})
            );
            editors.push(editor);
            return editor;
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
        });

        it("installs supported addon paths idempotently", function () {
            const lineComment = CodeMirror.prototype.lineComment;

            expect(LegacyAddons.install(
                CodeMirror,
                "thirdparty/CodeMirror/addon/comment/comment.js"
            )).toBe(true);
            expect(CodeMirror.prototype.lineComment).toBe(lineComment);
            expect(LegacyAddons.install(
                CodeMirror,
                "thirdparty/CodeMirror/addon/unsupported/example"
            )).toBe(false);
            expect(LegacyAddons.install(
                CodeMirror,
                "thirdparty/CodeMirror/addon/fold/brace-fold"
            )).toBe(true);
            expect(LegacyAddons.install(
                CodeMirror,
                "thirdparty/CodeMirror/addon/fold/comment-fold"
            )).toBe(true);
            expect(LegacyAddons.install(
                CodeMirror,
                "thirdparty/CodeMirror/addon/fold/markdown-fold"
            )).toBe(true);
            expect(LegacyAddons.install(
                CodeMirror,
                "thirdparty/CodeMirror/addon/runmode/runmode"
            )).toBe(true);
            expect(LegacyAddons.install(
                CodeMirror,
                "thirdparty/CodeMirror/addon/edit/trailingspace"
            )).toBe(true);
        });

        it("comments, uncomments, and block-comments through facade APIs", function () {
            const editor = createEditor(
                "  const first = 1;\n    const second = 2;",
                {mode: "javascript"}
            );
            const from = CodeMirror.Pos(0, 0);
            const to = CodeMirror.Pos(1, editor.getLine(1).length);

            editor.lineComment(from, to, {indent: true});
            expect(editor.getValue()).toBe(
                "  // const first = 1;\n  //   const second = 2;"
            );
            expect(editor.uncomment(from, CodeMirror.Pos(1, editor.getLine(1).length)))
                .toBe(true);
            expect(editor.getValue()).toBe(
                "  const first = 1;\n    const second = 2;"
            );

            editor.setValue("value");
            editor.setSelection(CodeMirror.Pos(0, 0), CodeMirror.Pos(0, 5));
            editor.blockComment(
                CodeMirror.Pos(0, 0),
                CodeMirror.Pos(0, 5),
                {fullLines: false}
            );
            expect(editor.getValue()).toBe("/*value*/");
            expect(editor.uncomment(
                CodeMirror.Pos(0, 0),
                CodeMirror.Pos(0, editor.getLine(0).length)
            )).toBe(true);
            expect(editor.getValue()).toBe("value");
        });

        it("selects search matches within the current selection", function () {
            const editor = createEditor("one two one", {mode: "text/plain"});
            editor.setSelection(CodeMirror.Pos(0, 0), CodeMirror.Pos(0, 11));

            editor.selectMatches("one");

            expect(editor.listSelections().length).toBe(2);
            expect(editor.getSelections()).toEqual(["one", "one"]);
        });

        it("finds, highlights, and navigates matching tags", function () {
            const editor = createEditor(
                "<main><span>x</span></main>",
                {mode: "text/html"}
            );
            const enclosing = CodeMirror.findEnclosingTag(
                editor,
                CodeMirror.Pos(0, 13)
            );
            expect(enclosing.open.tag).toBe("span");
            expect(enclosing.close.tag).toBe("span");

            const closing = CodeMirror.scanForClosingTag(
                editor,
                CodeMirror.Pos(0, 6),
                "main",
                1
            );
            expect(closing.tag).toBe("main");

            editor.setCursor(CodeMirror.Pos(0, 7));
            editor.setOption("matchTags", {bothTags: true});
            expect(editor.state.tagHit).toBeTruthy();
            expect(editor.state.tagOther).toBeTruthy();

            CodeMirror.commands.toMatchingTag(editor);
            expect(editor.getSelection()).toBe("</span>");
        });

        it("inserts an explicit closing tag for the active HTML context", function () {
            const editor = createEditor(
                "<section>\n  content",
                {mode: "text/html"}
            );
            editor.setCursor(CodeMirror.Pos(1, editor.getLine(1).length));

            expect(CodeMirror.commands.closeTag(editor)).toBe(true);
            expect(editor.getValue()).toBe("<section>\n  content</section>");
        });

        it("continues line and block comments through the legacy command", function () {
            const editor = createEditor("// note", {mode: "javascript"});
            editor.setCursor(CodeMirror.Pos(0, 5));

            expect(CodeMirror.commands.continueComment(editor)).toBe(true);
            expect(editor.getValue()).toBe("// no\n// te");

            editor.setValue("/* hello */");
            editor.setCursor(CodeMirror.Pos(0, 8));
            expect(CodeMirror.commands.continueComment(editor)).toBe(true);
            expect(editor.getValue()).toBe("/* hello\n *  */");
        });

        it("marks selected text with the configured compatibility class", function () {
            const editor = createEditor("selected text", {mode: "text/plain"});
            editor.setSelection(CodeMirror.Pos(0, 0), CodeMirror.Pos(0, 8));
            editor.setOption("styleSelectedText", "extension-selection");

            expect(editor.state.markedSelection.length).toBe(1);
            expect(editor.state.markedSelection[0].className)
                .toBe("extension-selection");
            const markedRange = editor.state.markedSelection[0].find();
            expect(markedRange.from.line).toBe(0);
            expect(markedRange.from.ch).toBe(0);
            expect(markedRange.to.line).toBe(0);
            expect(markedRange.to.ch).toBe(8);

            editor.setOption("styleSelectedText", false);
            expect(editor.state.markedSelection).toBe(null);
        });

        it("provides brace, comment, and Markdown fold helpers", function () {
            const javascriptEditor = createEditor(
                "function answer() {\n    /* detail\n       line */\n    return 42;\n}",
                {mode: "javascript"}
            );
            const braceRange = CodeMirror.fold.brace(
                javascriptEditor,
                CodeMirror.Pos(0, 0)
            );
            const commentRange = CodeMirror.fold.comment(
                javascriptEditor,
                CodeMirror.Pos(1, 0)
            );

            expect(braceRange.from.line).toBe(0);
            expect(braceRange.to.line).toBe(4);
            expect(commentRange.from).toEqual(CodeMirror.Pos(1, 6));
            expect(commentRange.to).toEqual(CodeMirror.Pos(2, 12));

            const markdownEditor = createEditor(
                "# Heading\nbody\n## Nested\nnested body\n# Next",
                {mode: "markdown"}
            );
            const markdownRange = CodeMirror.fold.markdown(
                markdownEditor,
                CodeMirror.Pos(0, 0)
            );
            expect(markdownRange.from).toEqual(CodeMirror.Pos(0, 9));
            expect(markdownRange.to).toEqual(CodeMirror.Pos(3, 11));
        });

        it("tokenizes source through runMode callbacks and DOM output", function () {
            const tokens = [];
            CodeMirror.runMode(
                "const answer = 42;\nanswer;",
                "javascript",
                function (text, style, line, start, state, mode) {
                    tokens.push({
                        line: line,
                        mode: mode && mode.name,
                        start: start,
                        state: state,
                        style: style,
                        text: text
                    });
                }
            );

            expect(tokens.map(function (token) {
                return token.text;
            }).join("")).toBe("const answer = 42;\nanswer;");
            expect(tokens.some(function (token) {
                return token.text === "const" &&
                    token.style === "keyword" &&
                    token.line === 0 &&
                    token.start === 0 &&
                    token.mode === "javascript" &&
                    token.state;
            })).toBe(true);

            const output = window.document.createElement("pre");
            CodeMirror.runMode(
                "\tconst value = 1;",
                "javascript",
                output,
                {tabSize: 4}
            );
            expect(output.textContent).toBe("    const value = 1;");
            expect(output.querySelector(".cm-keyword").textContent)
                .toBe("const");
        });

        it("renders and removes trailing-space decorations", function () {
            const editor = createEditor(
                "const value = 1;  \nclean",
                {
                    mode: "javascript",
                    showTrailingSpace: true
                }
            );

            expect(editor.state.overlays.length).toBe(1);
            expect(editor.state.overlays[0].mode.name).toBe("trailingspace");
            expect(
                editor.getWrapperElement()
                    .querySelector(".cm-trailingspace")
                    .textContent
            ).toBe("  ");

            editor.setOption("showTrailingSpace", false);
            expect(editor.state.overlays).toEqual([]);
            expect(
                editor.getWrapperElement()
                    .querySelector(".cm-trailingspace")
            ).toBeNull();
        });
    });
});
