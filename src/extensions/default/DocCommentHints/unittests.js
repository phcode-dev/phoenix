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

/*global describe, it, expect, afterEach*/

define(function (require, exports, module) {
    const DocCommentHints = require("./main");

    describe("unit:DocCommentHints", function () {

        describe("_splitParams - top-level comma split", function () {
            const split = DocCommentHints._splitParams;
            it("splits simple params", function () {
                expect(split("a, b, c").map(s => s.trim())).toEqual(["a", "b", "c"]);
            });
            it("ignores commas inside braces/brackets/parens/angles", function () {
                expect(split("a, {x, y}, b").map(s => s.trim())).toEqual(["a", "{x, y}", "b"]);
                expect(split("a, f(b, c), d").map(s => s.trim())).toEqual(["a", "f(b, c)", "d"]);
                expect(split("a: Map<string, number>, b").map(s => s.trim()))
                    .toEqual(["a: Map<string, number>", "b"]);
            });
            it("returns nothing for an empty list", function () {
                expect(split("")).toEqual([]);
                expect(split("   ")).toEqual([]);
            });
        });

        describe("_parseParam - name, type and optional", function () {
            const parse = DocCommentHints._parseParam;
            function nt(token, conv) {
                return parse(token, conv || "first");
            }
            it("name-first: plain / typed / default / PHP / rest", function () {
                expect(nt("name")).toEqual({ name: "name", type: null, optional: false });
                expect(nt("name: string")).toEqual({ name: "name", type: "string", optional: false });
                expect(nt("count = 5")).toEqual({ name: "count", type: null, optional: false });
                expect(nt("count: number = 1")).toEqual({ name: "count", type: "number", optional: false });
                expect(nt("$user")).toEqual({ name: "$user", type: null, optional: false });
                expect(nt("...rest: number[]")).toEqual({ name: "rest", type: "number[]", optional: false });
            });
            it("marks optional params (`?`)", function () {
                expect(nt("a?: string")).toEqual({ name: "a", type: "string", optional: true });
            });
            it("extracts complex types without breaking on , : => or strings", function () {
                expect(nt("items: Array<Map<string, number>>").type).toBe("Array<Map<string, number>>");
                expect(nt("cb: (x: number, y: string) => void").type).toBe("(x: number, y: string) => void");
                expect(nt("opts: { a: number; b: string }").type).toBe("{ a: number; b: string }");
                expect(nt("t: [number, string]").type).toBe("[number, string]");
                expect(nt('mode: "on" | "off"').type).toBe('"on" | "off"');
                expect(nt("x: T extends U ? A : B").type).toBe("T extends U ? A : B");
                expect(nt("cb: () => void = () => {}").type).toBe("() => void"); // default stripped
            });
            it("falls back to a null type on an unbalanced/garbled annotation", function () {
                expect(nt("a: Array<string").type).toBeNull(); // missing '>'
            });
            it("type-first (C/Java): trailing identifier is the name, no signature type", function () {
                expect(nt("int x", "last")).toEqual({ name: "x", type: null, optional: false });
                expect(nt("const char *ptr", "last")).toEqual({ name: "ptr", type: null, optional: false });
            });
        });

        describe("_validType", function () {
            const valid = DocCommentHints._validType;
            it("accepts balanced complex types", function () {
                ["number", "Array<Map<string, number>>", "(x: T) => void", "{ a: number }",
                    "[a, b]", '"on" | "off"'].forEach(t => expect(valid(t)).toBe(true));
            });
            it("rejects empty or unbalanced types", function () {
                ["", "   ", "Array<string", "(x => void", "}{"].forEach(t => expect(valid(t)).toBe(false));
            });
        });

        describe("_parseSignature", function () {
            const parse = DocCommentHints._parseSignature;
            const names = sig => sig.params.map(p => p.name);
            const types = sig => sig.params.map(p => p.type);

            it("parses a plain JS function (name-first, returns, untyped)", function () {
                const sig = parse("function add(a, b) {", "first");
                expect(names(sig)).toEqual(["a", "b"]);
                expect(types(sig)).toEqual([null, null]);
                expect(sig.isClass).toBe(false);
                expect(sig.hasReturn).toBe(true);
            });
            it("extracts param + return types from a typed TS function", function () {
                const sig = parse("function f(name: string, count: number = 1): boolean {", "first");
                expect(names(sig)).toEqual(["name", "count"]);
                expect(types(sig)).toEqual(["string", "number"]);
                expect(sig.returnType).toBe("boolean");
                expect(sig.hasReturn).toBe(true);
            });
            it("handles a complex TS arrow (generic, function-type param, generic return)", function () {
                const sig = parse("const f = (items: T[], cb: (x: T) => void): Promise<number> => {", "first");
                expect(names(sig)).toEqual(["items", "cb"]);
                expect(types(sig)).toEqual(["T[]", "(x: T) => void"]);
                expect(sig.returnType).toBe("Promise<number>");
            });
            it("treats an explicit void return as no @returns", function () {
                expect(parse("function log(msg: string): void {", "first").hasReturn).toBe(false);
            });
            it("skips self in a Python method", function () {
                expect(names(parse("def greet(self, name):", "first"))).toEqual(["name"]);
            });
            it("parses a Java method type-first (names only, no signature type)", function () {
                const sig = parse("public int sum(int a, String b) {", "last");
                expect(names(sig)).toEqual(["a", "b"]);
                expect(types(sig)).toEqual([null, null]);
                expect(sig.hasReturn).toBe(true);
            });
            it("parses an arrow function", function () {
                expect(names(parse("const mul = (a, b) => {", "first"))).toEqual(["a", "b"]);
            });
            it("handles a rest parameter", function () {
                expect(names(parse("function f(a, ...rest) {", "first"))).toEqual(["a", "rest"]);
            });
            it("reports a class with no params/return", function () {
                const sig = parse("export class Bar extends Base {", "first");
                expect(sig.isClass).toBe(true);
                expect(names(sig)).toEqual([]);
                expect(sig.hasReturn).toBe(false);
            });
            it("treats a constructor as returning nothing", function () {
                const sig = parse("constructor(x, y) {", "first");
                expect(names(sig)).toEqual(["x", "y"]);
                expect(sig.hasReturn).toBe(false);
            });
            it("handles an empty parameter list", function () {
                expect(names(parse("function noop() {", "first"))).toEqual([]);
            });
            it("flags isDeclaration only for real declarations (gates the partial /, /* triggers)", function () {
                expect(parse("function add(a, b) {", "first").isDeclaration).toBe(true);
                expect(parse("class Bar {", "first").isDeclaration).toBe(true);
                expect(parse("const x = 5;", "first").isDeclaration).toBe(false);
                expect(parse("return total;", "first").isDeclaration).toBe(false);
            });
        });

        describe("_buildSnippet", function () {
            const build = DocCommentHints._buildSnippet;
            // Build the params array (objects now) from simple names.
            const P = (...names) => names.map(n => ({ name: n }));

            // Every generated line must be free of trailing whitespace (linters flag it - see the
            // no-trailing-spaces report that prompted this).
            function expectNoTrailingWhitespace(snippet) {
                snippet.split("\n").forEach(function (line) {
                    expect(line).toBe(line.replace(/\s+$/, ""));
                });
            }

            it("builds a JSDoc skeleton with {*} for untyped params and no trailing whitespace", function () {
                const snip = build("jsdoc", { params: P("a", "b"), isClass: false, hasReturn: true }, "");
                expect(snip.indexOf("/**")).toBe(0);
                expect(snip).toContain("${1:"); // summary tabstop (default text is localized)
                expect(snip).toContain("@param {${2:*}} a");
                expect(snip).toContain("@param {${3:*}} b");
                expect(snip).toContain("@returns {${4:*}}");
                expect(snip.trim().slice(-2)).toBe("*/");
                expectNoTrailingWhitespace(snip);
            });
            it("fills the real type as the {type} tabstop, [name] for optional, typed @returns", function () {
                const sig = {
                    params: [
                        { name: "a", type: "number" },
                        { name: "b", type: "Array<string>" },
                        { name: "c", type: "T", optional: true }
                    ],
                    returnType: "boolean", isClass: false, hasReturn: true
                };
                const snip = build("jsdoc", sig, "");
                expect(snip).toContain("@param {${2:number}} a");
                expect(snip).toContain("@param {${3:Array<string>}} b");
                expect(snip).toContain("@param {${4:T}} [c]");
                expect(snip).toContain("@returns {${5:boolean}}");
                expectNoTrailingWhitespace(snip);
            });
            it("omits @param/@returns for a class", function () {
                const snip = build("jsdoc", { params: [], isClass: true, hasReturn: false }, "");
                expect(snip).toContain("${1:"); // summary tabstop only
                expect(snip).not.toContain("@param");
                expect(snip).not.toContain("@returns");
                expectNoTrailingWhitespace(snip);
            });
            it("indents continuation lines", function () {
                const snip = build("jsdoc", { params: P("a"), isClass: false, hasReturn: false }, "    ");
                expect(snip).toContain("\n     * @param"); // 4-space indent + " * "
            });
            it("escapes $ in a PHP-style parameter name", function () {
                const snip = build("jsdoc", { params: P("$user"), isClass: false, hasReturn: false }, "");
                expect(snip).toContain("\\$user");
            });
            it("builds a PHPDoc skeleton (type before the $name, @return, no braces)", function () {
                const snip = build("phpdoc", { params: P("$a", "$b"), isClass: false, hasReturn: true }, "");
                expect(snip).toContain("@param ${2:mixed} \\$a");
                expect(snip).toContain("@param ${3:mixed} \\$b");
                expect(snip).toContain("@return ${4:mixed}");
                expect(snip).not.toContain("@param {");
                expectNoTrailingWhitespace(snip);
            });
            it("builds a Javadoc/Doxygen skeleton (no {type} braces, singular @return)", function () {
                const snip = build("tagdoc", { params: P("a", "b"), isClass: false, hasReturn: true }, "");
                expect(snip).toContain("@param a");
                expect(snip).toContain("@param b");
                expect(snip).toContain("@return");
                expect(snip).not.toContain("@returns");
                expect(snip).not.toContain("@param {");
                expectNoTrailingWhitespace(snip);
            });
            it("builds a Python docstring with Args/Returns and no trailing whitespace", function () {
                const snip = build("pydoc", { params: P("name"), isClass: false, hasReturnType: true }, "    ");
                expect(snip.indexOf('"""')).toBe(0);
                expect(snip).toContain("Args:");
                expect(snip).toContain("name: ${2:");
                expect(snip).toContain("Returns:");
                expect(snip).not.toContain("@param");
                expectNoTrailingWhitespace(snip);
            });
            it("Python omits Returns without an explicit return annotation", function () {
                const snip = build("pydoc", { params: P("name"), isClass: false, hasReturnType: false }, "    ");
                expect(snip).toContain("Args:");
                expect(snip).not.toContain("Returns:");
            });
        });

        // Drives the REAL provider (hasHints -> getHints -> insertHint) on a real editor for each
        // language: proves the hint fires for that language, shows the right label, and inserts that
        // language's doc-comment convention.
        describe("provider, per language", function () {
            const SpecRunnerUtils = brackets.getModule("spec/SpecRunnerUtils");
            const Strings = brackets.getModule("strings");
            const TabstopManager = brackets.getModule("editor/TabstopManager");
            let mockDoc = null;

            afterEach(function () {
                if (TabstopManager.hasActiveSession && TabstopManager.hasActiveSession()) {
                    TabstopManager.endSession();
                }
                if (mockDoc) {
                    SpecRunnerUtils.destroyMockEditor(mockDoc);
                    mockDoc = null;
                }
            });

            function run(langId, content, line, ch) {
                const mock = SpecRunnerUtils.createMockEditor(content, langId);
                mockDoc = mock.doc;
                mock.editor.setCursorPos(line, ch);
                const provider = new DocCommentHints._Provider();
                const has = provider.hasHints(mock.editor, null);
                const hints = has ? provider.getHints() : null;
                const label = hints && hints.hints[0].text();
                if (has) {
                    provider.insertHint();
                }
                return { has: has, label: label, text: mock.doc.getText() };
            }

            const CASES = [
                { id: "javascript", content: "/**\nfunction f(a, b) {\n}\n", line: 0, ch: 3,
                    label: "DOC_COMMENT_ADD_JSDOC", has: ["@param {*} a", "@param {*} b", "@returns {*}"], absent: [] },
                { id: "typescript", content: "/**\nfunction f(a: number, b: string): boolean {\n}\n", line: 0, ch: 3,
                    label: "DOC_COMMENT_ADD_JSDOC",
                    has: ["@param {number} a", "@param {string} b", "@returns {boolean}"], absent: ["{*}"] },
                { id: "php", content: "<?php\n/**\nfunction f($a, $b) {\n}\n", line: 1, ch: 3,
                    label: "DOC_COMMENT_ADD_PHPDOC", has: ["@param mixed $a", "@return mixed"], absent: ["{*}"] },
                { id: "java", content: "class T {\n    /**\n    int f(int a, int b) {\n    }\n}\n", line: 1, ch: 7,
                    label: "DOC_COMMENT_ADD_JAVADOC", has: ["@param a", "@param b", "@return"],
                    absent: ["{*}", "@returns"] },
                { id: "c", content: "/**\nint f(int a) {\n}\n", line: 0, ch: 3,
                    label: "DOC_COMMENT_ADD_DOXYGEN", has: ["@param a", "@return"], absent: ["{*}", "@returns"] },
                { id: "cpp", content: "/**\nint f(int a) {\n}\n", line: 0, ch: 3,
                    label: "DOC_COMMENT_ADD_DOXYGEN", has: ["@param a", "@return"], absent: ["{*}", "@returns"] },
                { id: "python", content: 'def f(a, b) -> int:\n    """\n', line: 1, ch: 7,
                    label: "DOC_COMMENT_ADD_DOCSTRING", has: ["Args:", "a:", "Returns:"], absent: ["@param", "{*}"] }
            ];

            CASES.forEach(function (tc) {
                it("offers and inserts the right doc comment for " + tc.id, function () {
                    const r = run(tc.id, tc.content, tc.line, tc.ch);
                    expect(r.has).toBe(true);
                    expect(r.label).toContain(Strings[tc.label]);
                    tc.has.forEach(function (frag) { expect(r.text).toContain(frag); });
                    tc.absent.forEach(function (frag) { expect(r.text).not.toContain(frag); });
                });
            });

            it("does NOT fire for an unsupported language (css)", function () {
                expect(run("css", "/**\n.x { color: red; }\n", 0, 3).has).toBe(false);
            });

            it("Python adds no Returns when the def has no return annotation", function () {
                const r = run("python", 'def f(a):\n    """\n', 1, 7);
                expect(r.has).toBe(true);
                expect(r.text).toContain("Args:");
                expect(r.text).not.toContain("Returns:");
            });

            it("Python fires on the auto-closed \"\" state (caret between the quotes)", function () {
                // typing " auto-closes to "" with the caret inside; the hint must still fire.
                const r = run("python", 'def f(a):\n    ""\n', 1, 5);
                expect(r.has).toBe(true);
                expect(r.text).toContain('"""');
            });
        });
    });

    // Real-window integration: confirms the code-hints POPUP actually appears for these languages.
    require("./integration-tests");
});
