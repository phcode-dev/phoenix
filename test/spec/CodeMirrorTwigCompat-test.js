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

/*global describe, it, expect*/

define(function (require, exports, module) {

    const CodeMirror = require("editor/CodeMirrorCompat"),
        LegacyModuleLoader = require("editor/CodeMirrorLegacyModuleLoader");

    function tokenize(mode, state, line) {
        const stream = new CodeMirror.StringStream(line, 4);
        const tokens = [];
        while (!stream.eol()) {
            stream.start = stream.pos;
            const type = mode.token(stream, state);
            if (stream.pos <= stream.start) {
                throw new Error("Twig mode failed to advance the stream.");
            }
            tokens.push({
                string: stream.current(),
                type: type
            });
        }
        return tokens;
    }

    describe("CodeMirror Twig compatibility", function () {
        it("resolves the historical Twig module to the CM6-backed facade", function () {
            const moduleId = "thirdparty/CodeMirror/mode/twig/twig";

            expect(LegacyModuleLoader.getModuleType(moduleId)).toBe("mode");
            expect(LegacyModuleLoader.resolveLegacyModule(moduleId)).toBe(CodeMirror);
            expect(CodeMirror.loadMode("twig")).toBe(true);
            expect(typeof CodeMirror.modes["twig:inner"]).toBe("function");
            expect(typeof CodeMirror.modes.twig).toBe("function");
            expect(CodeMirror.resolveMode("text/x-twig")).toEqual({name: "twig"});
        });

        it("preserves Twig keyword, atom, string, operator, and tag tokens", function () {
            const mode = CodeMirror.getMode({indentUnit: 4}, "twig:inner");
            const state = CodeMirror.startState(mode);
            const tokens = tokenize(
                mode,
                state,
                "{% if user.active and true %}{{ \"value\"|upper }}"
            );

            expect(tokens.some(function (token) {
                return token.type === "tag" && token.string === "{%";
            })).toBe(true);
            expect(tokens.some(function (token) {
                return token.type === "keyword" && /\bif$/.test(token.string);
            })).toBe(true);
            expect(tokens.some(function (token) {
                return token.type === "keyword" && /\band$/.test(token.string);
            })).toBe(true);
            expect(tokens.some(function (token) {
                return token.type === "atom" && /\btrue$/.test(token.string);
            })).toBe(true);
            expect(tokens.some(function (token) {
                return token.type === "string";
            })).toBe(true);
            expect(tokens.some(function (token) {
                return token.type === "operator";
            })).toBe(true);
            expect(tokens.filter(function (token) {
                return token.type === "tag";
            }).length).toBe(4);
            expect(state.intag).toBe(false);
        });

        it("retains multiline Twig comment state and closes it at the delimiter", function () {
            const mode = CodeMirror.getMode({indentUnit: 4}, "twig:inner");
            const state = CodeMirror.startState(mode);
            const firstLine = tokenize(mode, state, "{# first line");

            expect(firstLine.length).toBe(1);
            expect(firstLine[0].type).toBe("comment");
            expect(state.incomment).toBe(true);

            const secondLine = tokenize(mode, state, "second line #}");
            expect(secondLine.length).toBe(1);
            expect(secondLine[0].type).toBe("comment");
            expect(state.incomment).toBe(false);
        });

        it("multiplexes Twig expressions with an HTML base mode", function () {
            const mode = CodeMirror.getMode(
                {indentUnit: 4},
                {
                    name: "twig",
                    base: "htmlmixed"
                }
            );
            const state = CodeMirror.startState(mode);
            const tokens = tokenize(
                mode,
                state,
                "<div class=\"card\">{{ user.name }}</div>"
            );

            expect(tokens.some(function (token) {
                return token.type && token.type.indexOf("tag") !== -1;
            })).toBe(true);
            const variableText = tokens.filter(function (token) {
                return token.type === "variable";
            }).map(function (token) {
                return token.string;
            }).join("");
            expect(variableText).toContain("user.name");
        });

        it("consumes parse-delimiter openers in the first token call", function () {
            const mode = CodeMirror.getMode(
                {indentUnit: 4},
                {
                    name: "twig",
                    base: "htmlmixed"
                }
            );
            const state = CodeMirror.startState(mode);
            const stream = new CodeMirror.StringStream("{{ value }}", 4);

            stream.start = stream.pos;
            expect(mode.token(stream, state)).toBe("tag");
            expect(stream.current()).toBe("{{");
            expect(stream.pos).toBeGreaterThan(stream.start);
            expect(CodeMirror.innerMode(mode, state).mode.name).toBe("twig:inner");
        });

        it("handles zero-width parse-delimiter openers without recursion", function () {
            const mode = CodeMirror.multiplexingMode(
                {
                    name: "outer",
                    token: function (stream) {
                        stream.next();
                        return "outer";
                    }
                },
                {
                    open: /(?=x)/,
                    close: /$^/,
                    mode: {
                        name: "inner",
                        token: function (stream) {
                            stream.next();
                            return "inner";
                        }
                    },
                    parseDelimiters: true
                }
            );
            const state = CodeMirror.startState(mode);
            const stream = new CodeMirror.StringStream("x", 4);

            stream.start = stream.pos;
            expect(mode.token(stream, state)).toBe("inner");
            expect(stream.current()).toBe("x");
            expect(stream.pos).toBe(1);
        });
    });
});
