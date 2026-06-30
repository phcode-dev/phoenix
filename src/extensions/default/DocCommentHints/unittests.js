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

/*global describe, it, expect*/

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

        describe("_paramName - per-convention name extraction", function () {
            const name = DocCommentHints._paramName;
            it("name-first: plain, typed, default, PHP, rest", function () {
                expect(name("name", "first")).toBe("name");
                expect(name("name: string", "first")).toBe("name");
                expect(name("count = 5", "first")).toBe("count");
                expect(name("count: number = 1", "first")).toBe("count");
                expect(name("$user", "first")).toBe("$user");
                expect(name("...rest", "first")).toBe("rest");
            });
            it("type-first (C/Java): trailing identifier is the name", function () {
                expect(name("int x", "last")).toBe("x");
                expect(name("const char *ptr", "last")).toBe("ptr");
                expect(name("String label", "last")).toBe("label");
            });
        });

        describe("_parseSignature", function () {
            const parse = DocCommentHints._parseSignature;

            it("parses a plain JS function (name-first, returns)", function () {
                const sig = parse("function add(a, b) {", "first");
                expect(sig.params).toEqual(["a", "b"]);
                expect(sig.isClass).toBe(false);
                expect(sig.hasReturn).toBe(true);
            });
            it("parses a typed TS function and keeps return", function () {
                const sig = parse("function f(name: string, count: number = 1): boolean {", "first");
                expect(sig.params).toEqual(["name", "count"]);
                expect(sig.hasReturn).toBe(true);
            });
            it("treats an explicit void return as no @returns", function () {
                expect(parse("function log(msg: string): void {", "first").hasReturn).toBe(false);
            });
            it("skips self in a Python method", function () {
                const sig = parse("def greet(self, name):", "first");
                expect(sig.params).toEqual(["name"]);
            });
            it("parses a Java method type-first", function () {
                const sig = parse("public int sum(int a, String b) {", "last");
                expect(sig.params).toEqual(["a", "b"]);
                expect(sig.hasReturn).toBe(true);
            });
            it("parses an arrow function", function () {
                expect(parse("const mul = (a, b) => {", "first").params).toEqual(["a", "b"]);
            });
            it("handles a rest parameter", function () {
                expect(parse("function f(a, ...rest) {", "first").params).toEqual(["a", "rest"]);
            });
            it("reports a class with no params/return", function () {
                const sig = parse("export class Bar extends Base {", "first");
                expect(sig.isClass).toBe(true);
                expect(sig.params).toEqual([]);
                expect(sig.hasReturn).toBe(false);
            });
            it("treats a constructor as returning nothing", function () {
                const sig = parse("constructor(x, y) {", "first");
                expect(sig.params).toEqual(["x", "y"]);
                expect(sig.hasReturn).toBe(false);
            });
            it("handles an empty parameter list", function () {
                expect(parse("function noop() {", "first").params).toEqual([]);
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

            // Every generated line must be free of trailing whitespace (linters flag it - see the
            // no-trailing-spaces report that prompted this).
            function expectNoTrailingWhitespace(snippet) {
                snippet.split("\n").forEach(function (line) {
                    expect(line).toBe(line.replace(/\s+$/, ""));
                });
            }

            it("builds a JSDoc skeleton with type tabstops and no trailing whitespace", function () {
                const snip = build("jsdoc", { params: ["a", "b"], isClass: false, hasReturn: true }, "");
                expect(snip.indexOf("/**")).toBe(0);
                expect(snip).toContain("${1:"); // summary tabstop (default text is localized)
                expect(snip).toContain("@param {${2:*}} a");
                expect(snip).toContain("@param {${3:*}} b");
                expect(snip).toContain("@returns {${4:*}}");
                expect(snip.trim().slice(-2)).toBe("*/");
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
                const snip = build("jsdoc", { params: ["a"], isClass: false, hasReturn: false }, "    ");
                expect(snip).toContain("\n     * @param"); // 4-space indent + " * "
            });
            it("escapes $ in a PHP-style parameter name", function () {
                const snip = build("jsdoc", { params: ["$user"], isClass: false, hasReturn: false }, "");
                expect(snip).toContain("\\$user");
            });
            it("builds a Python docstring with Args/Returns and no trailing whitespace", function () {
                const snip = build("pydoc", { params: ["name"], isClass: false, hasReturn: true }, "    ");
                expect(snip.indexOf('"""')).toBe(0);
                expect(snip).toContain("Args:");
                expect(snip).toContain("name: ${2:");
                expect(snip).toContain("Returns:");
                expectNoTrailingWhitespace(snip);
            });
        });
    });
});
