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
    const lineWrap = require("extensionsIntegrated/Phoenix-live-preview/markdown-line-wrap");

    describe("unit:markdown-line-wrap", function () {

        describe("wrapEditedLines", function () {

            it("should leave unchanged lines byte-identical", function () {
                const old = "para one\npara two\npara three\n";
                const out = lineWrap.wrapEditedLines(old, old, 80);
                expect(out).toBe(old);
            });

            it("should not touch lines that already fit", function () {
                const old = "alpha\n";
                const next = "alpha\nbeta\n";
                const out = lineWrap.wrapEditedLines(old, next, 80);
                expect(out).toBe(next);
            });

            it("should wrap a long edited paragraph at the print width", function () {
                const old = "short\n";
                const longLine = "lorem ipsum dolor sit amet consectetur adipiscing elit " +
                    "sed do eiusmod tempor incididunt ut labore et dolore magna aliqua";
                const next = longLine + "\n";
                const out = lineWrap.wrapEditedLines(old, next, 40);
                const lines = out.split("\n");
                // First line must be <= width
                expect(lines[0].length).toBeLessThanOrEqual(40);
                // All resulting lines combined must contain the original tokens
                expect(out.replace(/\s+/g, " ").trim())
                    .toBe(longLine.trim());
            });

            it("should preserve list marker and indent continuation lines", function () {
                const old = "- short item\n";
                const longItem = "- this is a much longer list item that exceeds the " +
                    "print width and needs to wrap across multiple lines cleanly";
                const out = lineWrap.wrapEditedLines(old, longItem + "\n", 40);
                const lines = out.split("\n").filter(l => l !== "");
                expect(lines.length).toBeGreaterThan(1);
                expect(lines[0].startsWith("- ")).toBe(true);
                for (let i = 1; i < lines.length; i++) {
                    // Continuation indent must be "  " (2 spaces — width of "- ")
                    expect(lines[i].startsWith("  ")).toBe(true);
                    expect(lines[i].length).toBeLessThanOrEqual(40);
                }
            });

            it("should preserve nested list indent", function () {
                const old = "  - short\n";
                const longNested = "  - nested item content that goes on and on " +
                    "past the limit and should wrap with the right indent";
                const out = lineWrap.wrapEditedLines(old, longNested + "\n", 40);
                const lines = out.split("\n").filter(l => l !== "");
                expect(lines[0].startsWith("  - ")).toBe(true);
                for (let i = 1; i < lines.length; i++) {
                    // Continuation indent for "  - " is "    " (4 spaces)
                    expect(lines[i].startsWith("    ")).toBe(true);
                }
            });

            it("should preserve ordered list marker", function () {
                const old = "1. short\n";
                const longOrdered = "1. ordered list item with enough text to need " +
                    "wrapping past the print width limit";
                const out = lineWrap.wrapEditedLines(old, longOrdered + "\n", 40);
                const lines = out.split("\n").filter(l => l !== "");
                expect(lines[0].startsWith("1. ")).toBe(true);
                for (let i = 1; i < lines.length; i++) {
                    // Continuation indent matches "1. " (3 spaces)
                    expect(lines[i].startsWith("   ")).toBe(true);
                }
            });

            it("should keep blockquote prefix on continuation lines", function () {
                const old = "> short\n";
                const longQuote = "> blockquote content that is much longer than the " +
                    "configured print width and needs to be wrapped while preserving the quote marker";
                const out = lineWrap.wrapEditedLines(old, longQuote + "\n", 40);
                const lines = out.split("\n").filter(l => l !== "");
                expect(lines.length).toBeGreaterThan(1);
                for (const l of lines) {
                    expect(l.startsWith("> ")).toBe(true);
                }
            });

            it("should not wrap inside fenced code blocks", function () {
                const old = "para\n";
                const longCode = "this line inside a code fence is intentionally " +
                    "very long because code formatting must be preserved exactly";
                const next = "```js\n" + longCode + "\n```\n";
                const out = lineWrap.wrapEditedLines(old, next, 40);
                expect(out).toBe(next);
            });

            it("should not wrap table lines", function () {
                const old = "para\n";
                const longRow = "| this is a very long table cell content that " +
                    "must not be wrapped because table syntax requires the line stay intact |";
                const next = "| header |\n| --- |\n" + longRow + "\n";
                const out = lineWrap.wrapEditedLines(old, next, 40);
                expect(out).toBe(next);
            });

            it("should not wrap ATX headings", function () {
                const old = "para\n";
                const longHeading = "## this is a really long heading that goes on " +
                    "past forty columns easily";
                const next = longHeading + "\n";
                const out = lineWrap.wrapEditedLines(old, next, 40);
                expect(out).toBe(next);
            });

            it("should not wrap link reference definitions", function () {
                const old = "para\n";
                const linkRef = "[my-ref]: https://example.com/some/very/long/path?with=query&params=here";
                const next = linkRef + "\n";
                const out = lineWrap.wrapEditedLines(old, next, 40);
                expect(out).toBe(next);
            });

            it("should not split an inline link across lines", function () {
                const old = "short\n";
                const longLinkLine = "see [the docs](https://example.com/very/long/path/here) for more details on this topic";
                const out = lineWrap.wrapEditedLines(old, longLinkLine + "\n", 40);
                // The link atom must appear intact on exactly one line
                const lines = out.split("\n");
                const linksFound = lines.filter(l => l.includes("[the docs]"));
                expect(linksFound.length).toBe(1);
                expect(linksFound[0]).toContain("[the docs](https://example.com/very/long/path/here)");
            });

            it("should not split inline code spans", function () {
                const old = "short\n";
                const next = "inline `code_with_many_underscores_inside` followed by enough words to push past the print width easily";
                const out = lineWrap.wrapEditedLines(old, next + "\n", 40);
                const lines = out.split("\n");
                const codeFound = lines.filter(l => l.includes("`code_with_many_underscores_inside`"));
                expect(codeFound.length).toBe(1);
            });

            it("should leave a single-token line that already overflows alone", function () {
                const old = "short\n";
                // One huge URL token — splitting would break it
                const next = "https://example.com/an/extremely/long/url/that/cannot/be/wrapped/without/breaking\n";
                const out = lineWrap.wrapEditedLines(old, next, 40);
                expect(out).toBe(next);
            });

            it("should skip wrapping inside YAML frontmatter", function () {
                const old = "---\ntitle: short\n---\npara\n";
                const longFm = "---\ntitle: this is a much longer frontmatter title that exceeds the print width\n---\npara\n";
                const out = lineWrap.wrapEditedLines(old, longFm, 40);
                expect(out).toBe(longFm);
            });

            it("should only touch lines in the edited range", function () {
                const old = "first\nsecond\nthird\n";
                const longMiddle = "second line is now very long and definitely exceeds " +
                    "the print width forcing it to wrap";
                const next = "first\n" + longMiddle + "\nthird\n";
                const out = lineWrap.wrapEditedLines(old, next, 40);
                const lines = out.split("\n");
                expect(lines[0]).toBe("first");
                // last non-empty line stays "third"
                expect(lines[lines.length - 2]).toBe("third");
            });

            it("should not modify when printWidth is below the safety floor", function () {
                const old = "x\n";
                const next = "this is a longer line being added at width 0\n";
                expect(lineWrap.wrapEditedLines(old, next, 0)).toBe(next);
                expect(lineWrap.wrapEditedLines(old, next, 10)).toBe(next);
            });

            it("should preserve the README sonarcloud badges line (regression)", function () {
                // The Turndown fix already guarantees this comes through clean
                // (no leading spaces). The wrap step must then leave it alone
                // because the line is one giant link atom — non-splittable.
                const old = "old\n";
                const badges = "[![Sonar code quality check](https://sonarcloud.io/api/project_badges/measure?project=phcode-dev_phoenix&metric=alert_status) ![Security rating](https://sonarcloud.io/api/project_badges/measure?project=phcode-dev_phoenix&metric=security_rating)](https://sonarcloud.io/summary/new_code?id=phcode-dev_phoenix)";
                const next = badges + "\n";
                const out = lineWrap.wrapEditedLines(old, next, 80);
                // The whole line is two link atoms with one space between them —
                // wrap may break between them but each atom stays whole.
                const lines = out.split("\n").filter(l => l !== "");
                for (const l of lines) {
                    // Both opening brackets must stay paired with their closing parens
                    const openLinks = (l.match(/\[/g) || []).length;
                    const closeLinks = (l.match(/\]\(/g) || []).length;
                    expect(openLinks).toBe(closeLinks);
                }
            });
        });

        describe("_detectLeading", function () {
            it("identifies bullet markers", function () {
                expect(lineWrap._detectLeading("- foo").marker).toBe("- ");
                expect(lineWrap._detectLeading("- foo").contIndent).toBe("  ");
            });

            it("identifies nested indent", function () {
                const ctx = lineWrap._detectLeading("    - foo");
                expect(ctx.indent).toBe("    ");
                expect(ctx.marker).toBe("- ");
                expect(ctx.contIndent).toBe("      ");
            });

            it("identifies ordered list markers", function () {
                expect(lineWrap._detectLeading("12. foo").marker).toBe("12. ");
                expect(lineWrap._detectLeading("12. foo").contIndent).toBe("    ");
            });

            it("identifies blockquote", function () {
                const ctx = lineWrap._detectLeading("> foo");
                expect(ctx.marker).toBe("> ");
                expect(ctx.contIndent).toBe("> ");
            });

            it("returns no marker for plain paragraph", function () {
                const ctx = lineWrap._detectLeading("hello world");
                expect(ctx.marker).toBe("");
                expect(ctx.contIndent).toBe("");
            });
        });

        describe("_tokenize", function () {
            it("keeps link atoms whole", function () {
                const toks = lineWrap._tokenize("see [the docs](https://e.com/p) here");
                expect(toks).toContain("[the docs](https://e.com/p)");
            });

            it("keeps image atoms whole", function () {
                const toks = lineWrap._tokenize("![alt text](https://e.com/img.png) end");
                expect(toks).toContain("![alt text](https://e.com/img.png)");
            });

            it("keeps inline code whole", function () {
                const toks = lineWrap._tokenize("use `npm install -g foo` then");
                expect(toks).toContain("`npm install -g foo`");
            });
        });
    });
});
