/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2026 - present core.ai . All rights reserved.
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

/*! DONT_STRIP_MINIFY: CodeMirror 5 Twig compatibility implementation.
 * See thirdparty/licences/codemirror5-derived.markdown.
 */

/*global define*/

/**
 * Provides the historical CodeMirror Twig stream modes on top of Phoenix's
 * CM6-backed compatibility facade. No CodeMirror 5 runtime code is loaded.
 */
define(function (require, exports, module) {

    const CodeMirror = require("editor/CodeMirrorCompat");
    const INSTALL_MARKER = "__phoenixCodeMirror6TwigCompat";
    const KEYWORDS = [
        "and",
        "as",
        "autoescape",
        "endautoescape",
        "block",
        "do",
        "endblock",
        "else",
        "elseif",
        "extends",
        "for",
        "endfor",
        "embed",
        "endembed",
        "filter",
        "endfilter",
        "flush",
        "from",
        "if",
        "endif",
        "in",
        "is",
        "include",
        "import",
        "not",
        "or",
        "set",
        "spaceless",
        "endspaceless",
        "with",
        "endwith",
        "trans",
        "endtrans",
        "blocktrans",
        "endblocktrans",
        "macro",
        "endmacro",
        "use",
        "verbatim",
        "endverbatim"
    ];
    const ATOMS = [
        "true",
        "false",
        "null",
        "empty",
        "defined",
        "divisibleby",
        "divisible by",
        "even",
        "odd",
        "iterable",
        "sameas",
        "same as"
    ];
    const KEYWORD_PATTERN = new RegExp(
        "((" + KEYWORDS.join(")|(") + "))\\b"
    );
    const ATOM_PATTERN = new RegExp(
        "((" + ATOMS.join(")|(") + "))\\b"
    );
    const OPERATOR_PATTERN = /^[+\-*&%=<>!?|~^]/;
    const SIGN_PATTERN = /^[:\[\(\{]/;
    const NUMBER_PATTERN = /^(\d[+\-*\/])?\d+(\.\d+)?/;

    function _tokenInner(stream, state) {
        const nextCharacter = stream.peek();

        if (state.incomment) {
            if (!stream.skipTo("#}")) {
                stream.skipToEnd();
            } else {
                stream.eatWhile(/[#}]/);
                state.incomment = false;
            }
            return "comment";
        }

        if (state.intag) {
            if (state.operator) {
                state.operator = false;
                if (stream.match(ATOM_PATTERN)) {
                    return "atom";
                }
                if (stream.match(NUMBER_PATTERN)) {
                    return "number";
                }
            }

            if (state.sign) {
                state.sign = false;
                if (stream.match(ATOM_PATTERN)) {
                    return "atom";
                }
                if (stream.match(NUMBER_PATTERN)) {
                    return "number";
                }
            }

            if (state.instring) {
                if (nextCharacter === state.instring) {
                    state.instring = false;
                }
                stream.next();
                return "string";
            }

            if (nextCharacter === "'" || nextCharacter === "\"") {
                state.instring = nextCharacter;
                stream.next();
                return "string";
            }

            if (stream.match(state.intag + "}") ||
                    stream.eat("-") && stream.match(state.intag + "}")) {
                state.intag = false;
                return "tag";
            }

            if (stream.match(OPERATOR_PATTERN)) {
                state.operator = true;
                return "operator";
            }

            if (stream.match(SIGN_PATTERN)) {
                state.sign = true;
            } else if (stream.eat(" ") || stream.sol()) {
                if (stream.match(KEYWORD_PATTERN)) {
                    return "keyword";
                }
                if (stream.match(ATOM_PATTERN)) {
                    return "atom";
                }
                if (stream.match(NUMBER_PATTERN)) {
                    return "number";
                }
                if (stream.sol()) {
                    stream.next();
                }
            } else {
                stream.next();
            }
            return "variable";
        }

        if (stream.eat("{")) {
            if (stream.eat("#")) {
                state.incomment = true;
                if (!stream.skipTo("#}")) {
                    stream.skipToEnd();
                } else {
                    stream.eatWhile(/[#}]/);
                    state.incomment = false;
                }
                return "comment";
            }

            const delimiter = stream.eat(/\{|%/);
            if (delimiter) {
                state.intag = delimiter === "{" ? "}" : delimiter;
                stream.eat("-");
                return "tag";
            }
        }

        stream.next();
        return null;
    }

    function _createInnerMode() {
        return {
            startState: function () {
                return {};
            },
            token: _tokenInner
        };
    }

    function install(target) {
        const codeMirror = target || CodeMirror;
        if (codeMirror[INSTALL_MARKER]) {
            return codeMirror;
        }

        codeMirror.defineMode("twig:inner", function () {
            return _createInnerMode();
        });
        codeMirror.defineMode("twig", function (config, parserConfig) {
            const twigInner = codeMirror.getMode(config, "twig:inner");
            if (!parserConfig || !parserConfig.base) {
                return twigInner;
            }
            return codeMirror.multiplexingMode(
                codeMirror.getMode(config, parserConfig.base),
                {
                    open: /\{[{#%]/,
                    close: /[}#%]\}/,
                    mode: twigInner,
                    parseDelimiters: true
                }
            );
        });
        codeMirror.defineMIME("text/x-twig", "twig");

        Object.defineProperty(codeMirror, INSTALL_MARKER, {
            configurable: false,
            enumerable: false,
            value: true
        });
        return codeMirror;
    }

    install(CodeMirror);

    exports.install = install;
});
