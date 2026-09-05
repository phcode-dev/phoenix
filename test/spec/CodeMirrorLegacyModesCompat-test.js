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
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero
 * General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see https://opensource.org/licenses/AGPL-3.0.
 */

/*global describe, it, expect */

define(function (require, exports, module) {

    const CodeMirror = require("editor/CodeMirrorCompat"),
        LegacyModuleLoader = require("editor/CodeMirrorLegacyModuleLoader");

    const HISTORICAL_MODE_DIRECTORIES = [
        "apl",
        "asciiarmor",
        "asn.1",
        "asterisk",
        "brainfuck",
        "clike",
        "clojure",
        "cmake",
        "cobol",
        "coffeescript",
        "commonlisp",
        "crystal",
        "css",
        "cypher",
        "d",
        "dart",
        "diff",
        "django",
        "dockerfile",
        "dtd",
        "dylan",
        "ebnf",
        "ecl",
        "eiffel",
        "elm",
        "erlang",
        "factor",
        "fcl",
        "forth",
        "fortran",
        "gas",
        "gfm",
        "gherkin",
        "go",
        "groovy",
        "haml",
        "handlebars",
        "haskell-literate",
        "haskell",
        "haxe",
        "htmlembedded",
        "htmlmixed",
        "http",
        "idl",
        "javascript",
        "jinja2",
        "jsx",
        "julia",
        "livescript",
        "lua",
        "markdown",
        "mathematica",
        "mbox",
        "mirc",
        "mllike",
        "modelica",
        "mscgen",
        "mumps",
        "nginx",
        "nsis",
        "ntriples",
        "octave",
        "oz",
        "pascal",
        "pegjs",
        "perl",
        "php",
        "pig",
        "powershell",
        "properties",
        "protobuf",
        "pug",
        "puppet",
        "python",
        "q",
        "r",
        "rpm",
        "rst",
        "ruby",
        "rust",
        "sas",
        "sass",
        "scheme",
        "shell",
        "sieve",
        "slim",
        "smalltalk",
        "smarty",
        "solr",
        "soy",
        "sparql",
        "spreadsheet",
        "sql",
        "stex",
        "stylus",
        "swift",
        "tcl",
        "textile",
        "tiddlywiki",
        "tiki",
        "toml",
        "tornado",
        "troff",
        "ttcn-cfg",
        "ttcn",
        "turtle",
        "twig",
        "vb",
        "vbscript",
        "velocity",
        "verilog",
        "vhdl",
        "vue",
        "wast",
        "webidl",
        "xml",
        "xquery",
        "yacas",
        "yaml-frontmatter",
        "yaml",
        "z80"
    ];

    const HISTORICAL_MIME_ALIASES = [
        "application/ecmascript",
        "application/edn",
        "application/vnd.coffeescript",
        "application/xml-dtd",
        "application/x-aspx",
        "application/x-javascript",
        "application/x-jsp",
        "application/x-json",
        "application/x-slim",
        "application/x-troff",
        "text/coffeescript",
        "text/ecmascript",
        "text/rust",
        "text/turtle",
        "text/vbscript",
        "text/x-coffeescript",
        "text/x-django",
        "text/x-haml",
        "text/x-ini",
        "text/x-jade",
        "text/x-literate-haskell",
        "text/x-nesc",
        "text/x-python",
        "text/x-rst",
        "text/x-ruby",
        "text/x-sass",
        "text/x-slim",
        "text/x-smarty",
        "text/x-soy",
        "text/x-squirrel",
        "text/x-swift",
        "text/x-tornado",
        "text/x-troff",
        "text/x-twig",
        "text/x-verilog",
        "text/yaml"
    ];

    function tokenize(modeSpecification, source) {
        const mode = CodeMirror.getMode(
            {indentUnit: 4, tabSize: 4},
            modeSpecification
        );
        const state = CodeMirror.startState(mode);
        const lines = source.split("\n");
        const tokens = [];

        lines.forEach(function (line) {
            if (!line.length) {
                if (mode.blankLine) {
                    mode.blankLine(state);
                }
                return;
            }
            const stream = new CodeMirror.StringStream(line, 4);
            while (!stream.eol()) {
                stream.start = stream.pos;
                let style;
                for (let attempt = 0; attempt < 10; attempt++) {
                    style = mode.token(stream, state);
                    if (stream.pos > stream.start) {
                        break;
                    }
                }
                if (stream.pos <= stream.start) {
                    throw new Error(
                        `Mode ${mode.name} did not advance at ${stream.pos}.`
                    );
                }
                tokens.push({
                    string: stream.current(),
                    style: style
                });
            }
        });

        return {
            mode: mode,
            state: state,
            tokens: tokens
        };
    }

    function tokenWithText(result, text) {
        return result.tokens.find(function (token) {
            return token.string === text;
        });
    }

    describe("CodeMirror legacy mode compatibility", function () {
        it("resolves every historical CodeMirror 5 mode module to the CM6 facade", function () {
            expect(HISTORICAL_MODE_DIRECTORIES.length).toBe(121);
            HISTORICAL_MODE_DIRECTORIES.forEach(function (modeName) {
                const moduleName = [
                    "thirdparty/CodeMirror/mode",
                    modeName,
                    modeName
                ].join("/");
                expect(
                    LegacyModuleLoader.resolveLegacyModule(moduleName)
                ).withContext(moduleName).toBe(CodeMirror);
                expect(CodeMirror.hasMode(modeName))
                    .withContext(modeName)
                    .toBeTrue();
            });
        });

        it("resolves historical MIME side effects without loading CM5", function () {
            expect(HISTORICAL_MIME_ALIASES.length).toBe(36);
            HISTORICAL_MIME_ALIASES.forEach(function (mime) {
                const resolved = CodeMirror.resolveMode(mime);
                expect(resolved).withContext(mime).toBeDefined();
                expect(CodeMirror.getMode({indentUnit: 4}, mime).name)
                    .withContext(mime)
                    .not.toBe("null");
            });
        });

        it("preserves Django, HAML, Smarty, Soy, and Tornado token behavior", function () {
            const django = tokenize(
                "django",
                "<p>{{ user.name|upper }}</p>"
            );
            expect(tokenWithText(django, "user").style).toContain("variable");
            expect(tokenWithText(django, "name").style).toContain("property");
            expect(tokenWithText(django, "upper").style)
                .toContain("variable-2");

            const haml = tokenize(
                "haml",
                "%div#main.card\n= user.name"
            );
            expect(tokenWithText(haml, "%div").style).toBe("tag");
            expect(tokenWithText(haml, "#main.card").style)
                .toBe("attribute");

            const smarty = tokenize(
                "smarty",
                "{$user.name|escape}"
            );
            expect(tokenWithText(smarty, "$user").style).toBe("variable-2");
            expect(tokenWithText(smarty, "name").style).toBe("property");
            expect(tokenWithText(smarty, "escape").style).toBe("qualifier");

            const soy = tokenize(
                "soy",
                "{template .hello}\n{@param name: string}\nHello {$name}\n" +
                    "{/template}"
            );
            expect(tokenWithText(soy, ".hello").style).toBe("def");
            expect(tokenWithText(soy, "name").style).toBe("def");
            expect(tokenWithText(soy, "$name").style).toBe("variable-2");

            const tornado = tokenize(
                "tornado",
                "<p>{{ escape(title) }}</p>"
            );
            expect(tornado.tokens.find(function (token) {
                return token.string.trim() === "escape";
            }).style)
                .toContain("keyword");
        });

        it("preserves literate Haskell and YAML front-matter inner modes", function () {
            const literate = tokenize(
                "haskell-literate",
                "Documentation\n> main = putStrLn \"hello\""
            );
            expect(literate.tokens[0].style).toBe("comment");
            expect(literate.tokens.some(function (token) {
                return token.string === ">" && token.style === "meta";
            })).toBeTrue();
            expect(CodeMirror.innerMode(literate.mode, literate.state).mode.name)
                .toBe("haskell");

            const frontmatter = tokenize(
                "yaml-frontmatter",
                "---\ntitle: Phoenix\n---\n# Heading"
            );
            expect(tokenWithText(frontmatter, "title").style)
                .toContain("atom");
            expect(frontmatter.state.state).toBe(2);
            expect(CodeMirror.innerMode(
                frontmatter.mode,
                frontmatter.state
            ).mode.name).toBe("gfm");
        });

        it("preserves RST and Slim parser behavior", function () {
            const rst = tokenize(
                "rst",
                "Heading\n=======\n\n**strong** and ``literal``"
            );
            expect(rst.tokens.some(function (token) {
                return token.style && token.style.indexOf("header") !== -1;
            })).toBeTrue();
            expect(rst.tokens.filter(function (token) {
                return token.style &&
                    token.style.indexOf("strong") !== -1;
            }).map(function (token) {
                return token.string;
            }).join("")).toContain("**strong**");
            expect(rst.tokens.filter(function (token) {
                return token.style &&
                    token.style.indexOf("string-2") !== -1;
            }).map(function (token) {
                return token.string;
            }).join("")).toContain("``literal``");

            const slim = tokenize(
                "slim",
                "div#main.card\n  = user.name"
            );
            expect(tokenWithText(slim, "div").style).toBe("tag");
            expect(tokenWithText(slim, "#main").style).toContain("attribute");
            expect(tokenWithText(slim, ".card").style).toContain("attribute");
            expect(slim.tokens.some(function (token) {
                return token.style && token.style.indexOf("variable") !== -1;
            })).toBeTrue();
        });
    });
});
