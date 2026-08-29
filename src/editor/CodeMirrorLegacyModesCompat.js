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

/*! DONT_STRIP_MINIFY: CodeMirror 5-derived mode compatibility.
 * See thirdparty/licences/codemirror5-derived.markdown.
 */

/**
 * Ports the CodeMirror 5.65.16 modes that are not published by
 * @codemirror/legacy-modes. The factories run against Phoenix's CM6-backed
 * CodeMirror facade and do not load the CodeMirror 5 runtime.
 */
define(function (require, exports, module) {

    const RSTSlimCompat = require("editor/CodeMirrorLegacyRSTSlimCompat");
    const installedTargets = new WeakSet();

    function installDjango(CodeMirror) {
        CodeMirror.defineMode("django:inner", function () {
            let keywords = [
                    "block", "endblock", "for", "endfor", "true", "false",
                    "filter", "endfilter", "loop", "none", "self", "super",
                    "if", "elif", "endif", "as", "else", "import", "with",
                    "endwith", "without", "context", "ifequal", "endifequal",
                    "ifnotequal", "endifnotequal", "extends", "include", "load",
                    "comment", "endcomment", "empty", "url", "static", "trans",
                    "blocktrans", "endblocktrans", "now", "regroup", "lorem",
                    "ifchanged", "endifchanged", "firstof", "debug", "cycle",
                    "csrf_token", "autoescape", "endautoescape", "spaceless",
                    "endspaceless", "ssi", "templatetag", "verbatim",
                    "endverbatim", "widthratio"
                ],
                filters = [
                    "add", "addslashes", "capfirst", "center", "cut", "date",
                    "default", "default_if_none", "dictsort",
                    "dictsortreversed", "divisibleby", "escape", "escapejs",
                    "filesizeformat", "first", "floatformat", "force_escape",
                    "get_digit", "iriencode", "join", "last", "length",
                    "length_is", "linebreaks", "linebreaksbr", "linenumbers",
                    "ljust", "lower", "make_list", "phone2numeric", "pluralize",
                    "pprint", "random", "removetags", "rjust", "safe",
                    "safeseq", "slice", "slugify", "stringformat", "striptags",
                    "time", "timesince", "timeuntil", "title", "truncatechars",
                    "truncatechars_html", "truncatewords",
                    "truncatewords_html", "unordered_list", "upper",
                    "urlencode", "urlize", "urlizetrunc", "wordcount",
                    "wordwrap", "yesno"
                ],
                operators = ["==", "!=", "<", ">", "<=", ">="],
                wordOperators = ["in", "not", "or", "and"];

            keywords = new RegExp("^\\b(" + keywords.join("|") + ")\\b");
            filters = new RegExp("^\\b(" + filters.join("|") + ")\\b");
            operators = new RegExp("^\\b(" + operators.join("|") + ")\\b");
            wordOperators = new RegExp(
                "^\\b(" + wordOperators.join("|") + ")\\b"
            );

            function tokenBase(stream, state) {
                if (stream.match("{{")) {
                    state.tokenize = inVariable;
                    return "tag";
                } else if (stream.match("{%")) {
                    state.tokenize = inTag;
                    return "tag";
                } else if (stream.match("{#")) {
                    state.tokenize = inComment;
                    return "comment";
                }

                while (!stream.eol()) {
                    stream.next();
                    if (stream.match(/\{[{%#]/, false)) {
                        break;
                    }
                }
                return null;
            }

            function inString(delimiter, previousTokenizer) {
                return function (stream, state) {
                    if (!state.escapeNext && stream.eat(delimiter)) {
                        state.tokenize = previousTokenizer;
                    } else {
                        if (state.escapeNext) {
                            state.escapeNext = false;
                        }
                        const character = stream.next();
                        if (character === "\\") {
                            state.escapeNext = true;
                        }
                    }
                    return "string";
                };
            }

            function readPropertyOrFilter(stream, state) {
                if (state.waitDot) {
                    state.waitDot = false;
                    if (stream.peek() !== ".") {
                        return "null";
                    }
                    if (stream.match(/\.\W+/)) {
                        return "error";
                    }
                    if (stream.eat(".")) {
                        state.waitProperty = true;
                        return "null";
                    }
                    throw new Error("Unexpected error while waiting for property.");
                }

                if (state.waitPipe) {
                    state.waitPipe = false;
                    if (stream.peek() !== "|") {
                        return "null";
                    }
                    if (stream.match(/\.\W+/)) {
                        return "error";
                    }
                    if (stream.eat("|")) {
                        state.waitFilter = true;
                        return "null";
                    }
                    throw new Error("Unexpected error while waiting for filter.");
                }

                if (state.waitProperty) {
                    state.waitProperty = false;
                    if (stream.match(/\b(\w+)\b/)) {
                        state.waitDot = true;
                        state.waitPipe = true;
                        return "property";
                    }
                }

                if (state.waitFilter) {
                    state.waitFilter = false;
                    if (stream.match(filters)) {
                        return "variable-2";
                    }
                }
                return undefined;
            }

            function readCommonValue(stream, state) {
                if (stream.eatSpace()) {
                    state.waitProperty = false;
                    return "null";
                }
                if (stream.match(/\b\d+(\.\d+)?\b/)) {
                    return "number";
                }
                if (stream.match("'")) {
                    state.tokenize = inString("'", state.tokenize);
                    return "string";
                }
                if (stream.match('"')) {
                    state.tokenize = inString('"', state.tokenize);
                    return "string";
                }
                return undefined;
            }

            function clearWaitingState(state) {
                state.waitProperty = null;
                state.waitFilter = null;
                state.waitDot = null;
                state.waitPipe = null;
            }

            function inVariable(stream, state) {
                const propertyOrFilter = readPropertyOrFilter(stream, state);
                if (propertyOrFilter !== undefined) {
                    return propertyOrFilter;
                }

                const commonValue = readCommonValue(stream, state);
                if (commonValue !== undefined) {
                    return commonValue;
                }

                if (stream.match(/\b(\w+)\b/) && !state.foundVariable) {
                    state.waitDot = true;
                    state.waitPipe = true;
                    return "variable";
                }

                if (stream.match("}}")) {
                    clearWaitingState(state);
                    state.tokenize = tokenBase;
                    return "tag";
                }

                stream.next();
                return "null";
            }

            function inTag(stream, state) {
                const propertyOrFilter = readPropertyOrFilter(stream, state);
                if (propertyOrFilter !== undefined) {
                    return propertyOrFilter;
                }

                const commonValue = readCommonValue(stream, state);
                if (commonValue !== undefined) {
                    return commonValue;
                }

                if (stream.match(operators)) {
                    return "operator";
                }
                if (stream.match(wordOperators)) {
                    return "keyword";
                }

                const keywordMatch = stream.match(keywords);
                if (keywordMatch) {
                    if (keywordMatch[0] === "comment") {
                        state.blockCommentTag = true;
                    }
                    return "keyword";
                }

                if (stream.match(/\b(\w+)\b/)) {
                    state.waitDot = true;
                    state.waitPipe = true;
                    return "variable";
                }

                if (stream.match("%}")) {
                    clearWaitingState(state);
                    if (state.blockCommentTag) {
                        state.blockCommentTag = false;
                        state.tokenize = inBlockComment;
                    } else {
                        state.tokenize = tokenBase;
                    }
                    return "tag";
                }

                stream.next();
                return "null";
            }

            function inComment(stream, state) {
                if (stream.match(/^.*?#\}/)) {
                    state.tokenize = tokenBase;
                } else {
                    stream.skipToEnd();
                }
                return "comment";
            }

            function inBlockComment(stream, state) {
                if (stream.match(/\{%\s*endcomment\s*%\}/, false)) {
                    state.tokenize = inTag;
                    stream.match("{%");
                    return "tag";
                }
                stream.next();
                return "comment";
            }

            return {
                startState: function () {
                    return {tokenize: tokenBase};
                },
                token: function (stream, state) {
                    return state.tokenize(stream, state);
                },
                blockCommentStart: "{% comment %}",
                blockCommentEnd: "{% endcomment %}"
            };
        });

        CodeMirror.defineMode("django", function (config) {
            const htmlBase = CodeMirror.getMode(config, "text/html");
            const djangoInner = CodeMirror.getMode(config, "django:inner");
            return CodeMirror.overlayMode(htmlBase, djangoInner);
        }, "htmlmixed");
        CodeMirror.defineMIME("text/x-django", "django");
    }

    function installHaml(CodeMirror) {
        CodeMirror.defineMode("haml", function (config) {
            const htmlMode = CodeMirror.getMode(config, {name: "htmlmixed"});
            const rubyMode = CodeMirror.getMode(config, "ruby");

            function rubyInQuote(endQuote) {
                return function (stream, state) {
                    const character = stream.peek();
                    if (character === endQuote &&
                            state.rubyState.tokenize.length === 1) {
                        stream.next();
                        state.tokenize = html;
                        return "closeAttributeTag";
                    }
                    return ruby(stream, state);
                };
            }

            function ruby(stream, state) {
                if (stream.match("-#")) {
                    stream.skipToEnd();
                    return "comment";
                }
                return rubyMode.token(stream, state.rubyState);
            }

            function html(stream, state) {
                const character = stream.peek();
                if (state.previousToken.style === "comment" &&
                        state.indented > state.previousToken.indented) {
                    stream.skipToEnd();
                    return "commentLine";
                }

                if (state.startOfLine) {
                    if (character === "!" && stream.match("!!")) {
                        stream.skipToEnd();
                        return "tag";
                    } else if (stream.match(/^%[\w:#.]+=/)) {
                        state.tokenize = ruby;
                        return "hamlTag";
                    } else if (stream.match(/^%[\w:]+/)) {
                        return "hamlTag";
                    } else if (character === "/") {
                        stream.skipToEnd();
                        return "comment";
                    }
                }

                if ((state.startOfLine ||
                        state.previousToken.style === "hamlTag") &&
                        (character === "#" || character === ".")) {
                    stream.match(/[\w-#.]+/);
                    return "hamlAttribute";
                }

                if (state.startOfLine && !stream.match("-->", false) &&
                        (character === "=" || character === "-")) {
                    state.tokenize = ruby;
                    return state.tokenize(stream, state);
                }

                if (state.previousToken.style === "hamlTag" ||
                        state.previousToken.style === "closeAttributeTag" ||
                        state.previousToken.style === "hamlAttribute") {
                    if (character === "(") {
                        state.tokenize = rubyInQuote(")");
                        return state.tokenize(stream, state);
                    } else if (character === "{" &&
                            !stream.match(/^\{%.*/)) {
                        state.tokenize = rubyInQuote("}");
                        return state.tokenize(stream, state);
                    }
                }

                return htmlMode.token(stream, state.htmlState);
            }

            return {
                startState: function () {
                    return {
                        htmlState: CodeMirror.startState(htmlMode),
                        rubyState: CodeMirror.startState(rubyMode),
                        indented: 0,
                        previousToken: {style: null, indented: 0},
                        tokenize: html
                    };
                },
                copyState: function (state) {
                    return {
                        htmlState: CodeMirror.copyState(
                            htmlMode,
                            state.htmlState
                        ),
                        rubyState: CodeMirror.copyState(
                            rubyMode,
                            state.rubyState
                        ),
                        indented: state.indented,
                        previousToken: state.previousToken,
                        tokenize: state.tokenize
                    };
                },
                token: function (stream, state) {
                    if (stream.sol()) {
                        state.indented = stream.indentation();
                        state.startOfLine = true;
                    }
                    if (stream.eatSpace()) {
                        return null;
                    }
                    let style = state.tokenize(stream, state);
                    state.startOfLine = false;
                    if (style && style !== "commentLine") {
                        state.previousToken = {
                            style: style,
                            indented: state.indented
                        };
                    }
                    if (stream.eol() && state.tokenize === ruby) {
                        stream.backUp(1);
                        const character = stream.peek();
                        stream.next();
                        if (character && character !== ",") {
                            state.tokenize = html;
                        }
                    }
                    if (style === "hamlTag") {
                        style = "tag";
                    } else if (style === "commentLine") {
                        style = "comment";
                    } else if (style === "hamlAttribute") {
                        style = "attribute";
                    } else if (style === "closeAttributeTag") {
                        style = null;
                    }
                    return style;
                }
            };
        }, "htmlmixed", "ruby");

        CodeMirror.defineMIME("text/x-haml", "haml");
    }

    function installHaskellLiterate(CodeMirror) {
        CodeMirror.defineMode(
            "haskell-literate",
            function (config, parserConfig) {
                const baseMode = CodeMirror.getMode(
                    config,
                    parserConfig && parserConfig.base || "haskell"
                );

                function currentMode(state) {
                    return state.inCode ? baseMode : null;
                }

                return {
                    startState: function () {
                        return {
                            inCode: false,
                            baseState: CodeMirror.startState(baseMode)
                        };
                    },
                    copyState: function (state) {
                        return {
                            inCode: state.inCode,
                            baseState: CodeMirror.copyState(
                                baseMode,
                                state.baseState
                            )
                        };
                    },
                    token: function (stream, state) {
                        if (stream.sol()) {
                            state.inCode = Boolean(stream.eat(">"));
                            if (state.inCode) {
                                return "meta";
                            }
                        }
                        if (state.inCode) {
                            return baseMode.token(stream, state.baseState);
                        }
                        stream.skipToEnd();
                        return "comment";
                    },
                    innerMode: function (state) {
                        const mode = currentMode(state);
                        return mode ? {
                            state: state.baseState,
                            mode: mode
                        } : null;
                    }
                };
            },
            "haskell"
        );
        CodeMirror.defineMIME(
            "text/x-literate-haskell",
            "haskell-literate"
        );
    }

    function installSmarty(CodeMirror) {
        CodeMirror.defineMode("smarty", function (config, parserConfig) {
            const rightDelimiter = parserConfig.rightDelimiter || "}";
            const leftDelimiter = parserConfig.leftDelimiter || "{";
            const version = parserConfig.version || 2;
            const baseMode = CodeMirror.getMode(
                config,
                parserConfig.baseMode || "null"
            );
            const keyFunctions = [
                "debug", "extends", "function", "include", "literal"
            ];
            const regs = {
                operatorChars: /[+\-*&%=<>!?]/,
                validIdentifier: /[a-zA-Z0-9_]/,
                stringChar: /['"]/
            };
            let last;

            function cont(style, lastType) {
                last = lastType;
                return style;
            }

            function chain(stream, state, parser) {
                state.tokenize = parser;
                return parser(stream, state);
            }

            function doesNotCount(stream, position) {
                const effectivePosition = position === null ||
                    position === undefined ?
                    stream.pos :
                    position;
                return version === 3 && leftDelimiter === "{" &&
                    (effectivePosition === stream.string.length ||
                        /\s/.test(stream.string.charAt(effectivePosition)));
            }

            function tokenTop(stream, state) {
                const string = stream.string;
                let nextMatch;
                for (let scan = stream.pos;;) {
                    nextMatch = string.indexOf(leftDelimiter, scan);
                    scan = nextMatch + leftDelimiter.length;
                    if (nextMatch === -1 ||
                            !doesNotCount(
                                stream,
                                nextMatch + leftDelimiter.length
                            )) {
                        break;
                    }
                }

                if (nextMatch === stream.pos) {
                    stream.match(leftDelimiter);
                    if (stream.eat("*")) {
                        return chain(
                            stream,
                            state,
                            tokenBlock("comment", "*" + rightDelimiter)
                        );
                    }
                    state.depth++;
                    state.tokenize = tokenSmarty;
                    last = "startTag";
                    return "tag";
                }

                if (nextMatch > -1) {
                    stream.string = string.slice(0, nextMatch);
                }
                const token = baseMode.token(stream, state.base);
                if (nextMatch > -1) {
                    stream.string = string;
                }
                return token;
            }

            function tokenSmarty(stream, state) {
                if (stream.match(rightDelimiter, true)) {
                    if (version === 3) {
                        state.depth--;
                        if (state.depth <= 0) {
                            state.tokenize = tokenTop;
                        }
                    } else {
                        state.tokenize = tokenTop;
                    }
                    return cont("tag", null);
                }

                if (stream.match(leftDelimiter, true)) {
                    state.depth++;
                    return cont("tag", "startTag");
                }

                const character = stream.next();
                if (character === "$") {
                    stream.eatWhile(regs.validIdentifier);
                    return cont("variable-2", "variable");
                } else if (character === "|") {
                    return cont("operator", "pipe");
                } else if (character === ".") {
                    return cont("operator", "property");
                } else if (regs.stringChar.test(character)) {
                    state.tokenize = tokenAttribute(character);
                    return cont("string", "string");
                } else if (regs.operatorChars.test(character)) {
                    stream.eatWhile(regs.operatorChars);
                    return cont("operator", "operator");
                } else if (character === "[" || character === "]") {
                    return cont("bracket", "bracket");
                } else if (character === "(" || character === ")") {
                    return cont("bracket", "operator");
                } else if (/\d/.test(character)) {
                    stream.eatWhile(/\d/);
                    return cont("number", "number");
                }

                if (state.last === "variable") {
                    if (character === "@") {
                        stream.eatWhile(regs.validIdentifier);
                        return cont("property", "property");
                    } else if (character === "|") {
                        stream.eatWhile(regs.validIdentifier);
                        return cont("qualifier", "modifier");
                    }
                } else if (state.last === "pipe") {
                    stream.eatWhile(regs.validIdentifier);
                    return cont("qualifier", "modifier");
                } else if (state.last === "whitespace") {
                    stream.eatWhile(regs.validIdentifier);
                    return cont("attribute", "modifier");
                } else if (state.last === "property") {
                    stream.eatWhile(regs.validIdentifier);
                    return cont("property", null);
                } else if (/\s/.test(character)) {
                    last = "whitespace";
                    return null;
                }

                let string = "";
                if (character !== "/") {
                    string += character;
                }
                let nextCharacter = null;
                while ((nextCharacter = stream.eat(regs.validIdentifier))) {
                    string += nextCharacter;
                }
                for (let index = 0; index < keyFunctions.length; index++) {
                    if (keyFunctions[index] === string) {
                        return cont("keyword", "keyword");
                    }
                }
                if (/\s/.test(character)) {
                    return null;
                }
                return cont("tag", "tag");
            }

            function tokenAttribute(quote) {
                return function (stream, state) {
                    let previousCharacter = null;
                    let currentCharacter = null;
                    while (!stream.eol()) {
                        currentCharacter = stream.peek();
                        if (stream.next() === quote &&
                                previousCharacter !== "\\") {
                            state.tokenize = tokenSmarty;
                            break;
                        }
                        previousCharacter = currentCharacter;
                    }
                    return "string";
                };
            }

            function tokenBlock(style, terminator) {
                return function (stream, state) {
                    while (!stream.eol()) {
                        if (stream.match(terminator)) {
                            state.tokenize = tokenTop;
                            break;
                        }
                        stream.next();
                    }
                    return style;
                };
            }

            return {
                startState: function () {
                    return {
                        base: CodeMirror.startState(baseMode),
                        tokenize: tokenTop,
                        last: null,
                        depth: 0
                    };
                },
                copyState: function (state) {
                    return {
                        base: CodeMirror.copyState(baseMode, state.base),
                        tokenize: state.tokenize,
                        last: state.last,
                        depth: state.depth
                    };
                },
                innerMode: function (state) {
                    if (state.tokenize === tokenTop) {
                        return {mode: baseMode, state: state.base};
                    }
                    return undefined;
                },
                token: function (stream, state) {
                    const style = state.tokenize(stream, state);
                    state.last = last;
                    return style;
                },
                indent: function (state, text) {
                    if (state.tokenize === tokenTop && baseMode.indent) {
                        return baseMode.indent(state.base, text);
                    }
                    return CodeMirror.Pass;
                },
                blockCommentStart: leftDelimiter + "*",
                blockCommentEnd: "*" + rightDelimiter
            };
        });

        CodeMirror.defineMIME("text/x-smarty", "smarty");
    }

    function installSoy(CodeMirror) {
        const indentingTags = [
            "template", "literal", "msg", "fallbackmsg", "let", "if",
            "elseif", "else", "switch", "case", "default", "foreach",
            "ifempty", "for", "call", "param", "deltemplate", "delcall",
            "log"
        ];

        CodeMirror.defineMode("soy", function (config) {
            const textMode = CodeMirror.getMode(config, "text/plain");
            const modes = {
                html: CodeMirror.getMode(config, {
                    name: "text/html",
                    multilineTagIndentFactor: 2,
                    multilineTagIndentPastTag: false
                }),
                attributes: textMode,
                text: textMode,
                uri: textMode,
                css: CodeMirror.getMode(config, "text/css"),
                js: CodeMirror.getMode(config, {
                    name: "text/javascript",
                    statementIndent: 2 * config.indentUnit
                })
            };

            function last(array) {
                return array[array.length - 1];
            }

            function tokenUntil(stream, state, untilRegExp) {
                if (stream.sol()) {
                    let indent;
                    for (indent = 0; indent < state.indent; indent++) {
                        if (!stream.eat(/\s/)) {
                            break;
                        }
                    }
                    if (indent) {
                        return null;
                    }
                }
                const oldString = stream.string;
                const match = untilRegExp.exec(oldString.substr(stream.pos));
                if (match) {
                    stream.string = oldString.substr(
                        0,
                        stream.pos + match.index
                    );
                }
                const result = stream.hideFirstChars(state.indent, function () {
                    const localState = last(state.localStates);
                    return localState.mode.token(stream, localState.state);
                });
                stream.string = oldString;
                return result;
            }

            function contains(list, element) {
                let current = list;
                while (current) {
                    if (current.element === element) {
                        return true;
                    }
                    current = current.next;
                }
                return false;
            }

            function prepend(list, element) {
                return {
                    element: element,
                    next: list
                };
            }

            function ref(list, name, loose) {
                return contains(list, name) ?
                    "variable-2" :
                    (loose ? "variable" : "variable-2 error");
            }

            function popScope(state) {
                if (state.scopes) {
                    state.variables = state.scopes.element;
                    state.scopes = state.scopes.next;
                }
            }

            return {
                startState: function () {
                    return {
                        kind: [],
                        kindTag: [],
                        soyState: [],
                        templates: null,
                        variables: prepend(null, "ij"),
                        scopes: null,
                        indent: 0,
                        quoteKind: null,
                        localStates: [{
                            mode: modes.html,
                            state: CodeMirror.startState(modes.html)
                        }]
                    };
                },
                copyState: function (state) {
                    return {
                        tag: state.tag,
                        kind: state.kind.concat([]),
                        kindTag: state.kindTag.concat([]),
                        soyState: state.soyState.concat([]),
                        templates: state.templates,
                        variables: state.variables,
                        scopes: state.scopes,
                        indent: state.indent,
                        quoteKind: state.quoteKind,
                        localStates: state.localStates.map(function (localState) {
                            return {
                                mode: localState.mode,
                                state: CodeMirror.copyState(
                                    localState.mode,
                                    localState.state
                                )
                            };
                        })
                    };
                },
                token: function (stream, state) {
                    let match;
                    switch (last(state.soyState)) {
                    case "comment":
                        if (stream.match(/^.*?\*\//)) {
                            state.soyState.pop();
                        } else {
                            stream.skipToEnd();
                        }
                        if (!state.scopes) {
                            const paramExpression = /@param\??\s+(\S+)/g;
                            const current = stream.current();
                            while ((match = paramExpression.exec(current))) {
                                state.variables = prepend(
                                    state.variables,
                                    match[1]
                                );
                            }
                        }
                        return "comment";

                    case "templ-def":
                        match = stream.match(/^\.?([\w]+(?!\.[\w]+)*)/);
                        if (match) {
                            state.templates = prepend(
                                state.templates,
                                match[1]
                            );
                            state.scopes = prepend(
                                state.scopes,
                                state.variables
                            );
                            state.soyState.pop();
                            return "def";
                        }
                        stream.next();
                        return null;

                    case "templ-ref":
                        match = stream.match(/^\.?([\w]+)/);
                        if (match) {
                            state.soyState.pop();
                            if (match[0][0] === ".") {
                                return ref(state.templates, match[1], true);
                            }
                            return "variable";
                        }
                        stream.next();
                        return null;

                    case "param-def":
                        match = stream.match(/^\w+/);
                        if (match) {
                            state.variables = prepend(
                                state.variables,
                                match[0]
                            );
                            state.soyState.pop();
                            state.soyState.push("param-type");
                            return "def";
                        }
                        stream.next();
                        return null;

                    case "param-type":
                        if (stream.peek() === "}") {
                            state.soyState.pop();
                            return null;
                        }
                        if (stream.eatWhile(/^[\w]+/)) {
                            return "variable-3";
                        }
                        stream.next();
                        return null;

                    case "var-def":
                        match = stream.match(/^\$([\w]+)/);
                        if (match) {
                            state.variables = prepend(
                                state.variables,
                                match[1]
                            );
                            state.soyState.pop();
                            return "def";
                        }
                        stream.next();
                        return null;

                    case "tag":
                        if (stream.match(/^\/?}/)) {
                            if (state.tag === "/template" ||
                                    state.tag === "/deltemplate") {
                                popScope(state);
                                state.variables = prepend(null, "ij");
                                state.indent = 0;
                            } else {
                                if (state.tag === "/for" ||
                                        state.tag === "/foreach") {
                                    popScope(state);
                                }
                                state.indent -= config.indentUnit *
                                    (stream.current() === "/}" ||
                                        indentingTags.indexOf(state.tag) === -1 ?
                                        2 :
                                        1);
                            }
                            state.soyState.pop();
                            return "keyword";
                        }

                        match = stream.match(/^([\w?]+)(?==)/);
                        if (match) {
                            if (stream.current() === "kind") {
                                const kindMatch = stream.match(
                                    /^="([^"]+)/,
                                    false
                                );
                                if (kindMatch) {
                                    const kind = kindMatch[1];
                                    state.kind.push(kind);
                                    state.kindTag.push(state.tag);
                                    const mode = modes[kind] || modes.html;
                                    const localState = last(state.localStates);
                                    if (localState.mode.indent) {
                                        state.indent += localState.mode.indent(
                                            localState.state,
                                            ""
                                        );
                                    }
                                    state.localStates.push({
                                        mode: mode,
                                        state: CodeMirror.startState(mode)
                                    });
                                }
                            }
                            return "attribute";
                        }

                        match = stream.match(/^["']/);
                        if (match) {
                            state.soyState.push("string");
                            state.quoteKind = match;
                            return "string";
                        }
                        match = stream.match(/^\$([\w]+)/);
                        if (match) {
                            return ref(state.variables, match[1]);
                        }
                        match = stream.match(/^\w+/);
                        if (match) {
                            return /^(?:as|and|or|not|in)$/.test(match[0]) ?
                                "keyword" :
                                null;
                        }
                        stream.next();
                        return null;

                    case "literal":
                        if (stream.match(/^(?=\{\/literal})/)) {
                            state.indent -= config.indentUnit;
                            state.soyState.pop();
                            return this.token(stream, state);
                        }
                        return tokenUntil(stream, state, /\{\/literal}/);

                    case "string":
                        match = stream.match(/^.*?(["']|\\[\s\S])/);
                        if (!match) {
                            stream.skipToEnd();
                        } else if (match[1] === state.quoteKind) {
                            state.quoteKind = null;
                            state.soyState.pop();
                        }
                        return "string";
                    default:
                        break;
                    }

                    if (stream.match(/^\/\*/)) {
                        state.soyState.push("comment");
                        if (!state.scopes) {
                            state.variables = prepend(null, "ij");
                        }
                        return "comment";
                    } else if (stream.match(
                        stream.sol() ? /^\s*\/\/.*/ : /^\s+\/\/.*/
                    )) {
                        if (!state.scopes) {
                            state.variables = prepend(null, "ij");
                        }
                        return "comment";
                    } else if (stream.match(/^\{literal}/)) {
                        state.indent += config.indentUnit;
                        state.soyState.push("literal");
                        return "keyword";
                    }

                    match = stream.match(
                        /^\{([/@\\]?\w+\??)(?=[\s}])/
                    );
                    if (match) {
                        if (match[1] !== "/switch") {
                            state.indent += (
                                /^(\/|(else|elseif|ifempty|case|fallbackmsg|default)$)/
                                    .test(match[1]) &&
                                    state.tag !== "switch" ?
                                    1 :
                                    2
                            ) * config.indentUnit;
                        }
                        state.tag = match[1];
                        if (state.tag === "/" + last(state.kindTag)) {
                            state.kind.pop();
                            state.kindTag.pop();
                            state.localStates.pop();
                            const localState = last(state.localStates);
                            if (localState.mode.indent) {
                                state.indent -= localState.mode.indent(
                                    localState.state,
                                    ""
                                );
                            }
                        }
                        state.soyState.push("tag");
                        if (state.tag === "template" ||
                                state.tag === "deltemplate") {
                            state.soyState.push("templ-def");
                        } else if (state.tag === "call" ||
                                state.tag === "delcall") {
                            state.soyState.push("templ-ref");
                        } else if (state.tag === "let") {
                            state.soyState.push("var-def");
                        } else if (state.tag === "for" ||
                                state.tag === "foreach") {
                            state.scopes = prepend(
                                state.scopes,
                                state.variables
                            );
                            state.soyState.push("var-def");
                        } else if (state.tag === "namespace") {
                            if (!state.scopes) {
                                state.variables = prepend(null, "ij");
                            }
                        } else if (state.tag.match(
                            /^@(?:param\??|inject)/
                        )) {
                            state.soyState.push("param-def");
                        }
                        return "keyword";
                    } else if (stream.eat("{")) {
                        state.tag = "print";
                        state.indent += 2 * config.indentUnit;
                        state.soyState.push("tag");
                        return "keyword";
                    }

                    return tokenUntil(stream, state, /\{|\s+\/\/|\/\*/);
                },
                indent: function (state, textAfter) {
                    let indent = state.indent;
                    const top = last(state.soyState);
                    if (top === "comment") {
                        return CodeMirror.Pass;
                    }

                    if (top === "literal") {
                        if (/^\{\/literal}/.test(textAfter)) {
                            indent -= config.indentUnit;
                        }
                    } else {
                        if (/^\s*\{\/(template|deltemplate)\b/.test(
                            textAfter
                        )) {
                            return 0;
                        }
                        if (/^\{(\/|(fallbackmsg|elseif|else|ifempty)\b)/
                            .test(textAfter)) {
                            indent -= config.indentUnit;
                        }
                        if (state.tag !== "switch" &&
                                /^\{(case|default)\b/.test(textAfter)) {
                            indent -= config.indentUnit;
                        }
                        if (/^\{\/switch\b/.test(textAfter)) {
                            indent -= config.indentUnit;
                        }
                    }

                    const localState = last(state.localStates);
                    if (indent && localState.mode.indent) {
                        indent += localState.mode.indent(
                            localState.state,
                            textAfter
                        );
                    }
                    return indent;
                },
                innerMode: function (state) {
                    if (state.soyState.length &&
                            last(state.soyState) !== "literal") {
                        return null;
                    }
                    return last(state.localStates);
                },
                electricInput:
                    /^\s*\{(\/|\/template|\/deltemplate|\/switch|fallbackmsg|elseif|else|case|default|ifempty|\/literal\})$/,
                lineComment: "//",
                blockCommentStart: "/*",
                blockCommentEnd: "*/",
                blockCommentContinue: " * ",
                useInnerComments: false,
                fold: "indent"
            };
        }, "htmlmixed");

        CodeMirror.registerHelper(
            "hintWords",
            "soy",
            indentingTags.concat([
                "delpackage", "namespace", "alias", "print", "css",
                "debugger"
            ])
        );
        CodeMirror.defineMIME("text/x-soy", "soy");
    }

    function installTornado(CodeMirror) {
        CodeMirror.defineMode("tornado:inner", function () {
            const keywords = new RegExp(
                "^((" + [
                    "and", "as", "assert", "autoescape", "block", "break",
                    "class", "comment", "context", "continue", "datetime",
                    "def", "del", "elif", "else", "end", "escape", "except",
                    "exec", "extends", "false", "finally", "for", "from",
                    "global", "if", "import", "in", "include", "is",
                    "json_encode", "lambda", "length", "linkify", "load",
                    "module", "none", "not", "or", "pass", "print", "put",
                    "raise", "raw", "return", "self", "set", "squeeze",
                    "super", "true", "try", "url_escape", "while", "with",
                    "without", "xhtml_escape", "yield"
                ].join(")|(") + "))\\b"
            );

            function tokenBase(stream, state) {
                stream.eatWhile(/[^{]/);
                const character = stream.next();
                if (character === "{") {
                    const close = stream.eat(/\{|%|#/);
                    if (close) {
                        state.tokenize = inTag(close);
                        return "tag";
                    }
                }
                return undefined;
            }

            function inTag(initialClose) {
                const close = initialClose === "{" ? "}" : initialClose;
                return function (stream, state) {
                    const character = stream.next();
                    if (character === close && stream.eat("}")) {
                        state.tokenize = tokenBase;
                        return "tag";
                    }
                    if (stream.match(keywords)) {
                        return "keyword";
                    }
                    return close === "#" ? "comment" : "string";
                };
            }

            return {
                startState: function () {
                    return {tokenize: tokenBase};
                },
                token: function (stream, state) {
                    return state.tokenize(stream, state);
                }
            };
        });

        CodeMirror.defineMode("tornado", function (config) {
            const htmlBase = CodeMirror.getMode(config, "text/html");
            const tornadoInner = CodeMirror.getMode(config, "tornado:inner");
            return CodeMirror.overlayMode(htmlBase, tornadoInner);
        }, "htmlmixed");
        CodeMirror.defineMIME("text/x-tornado", "tornado");
    }

    function installYAMLFrontmatter(CodeMirror) {
        const START = 0;
        const FRONTMATTER = 1;
        const BODY = 2;

        CodeMirror.defineMode(
            "yaml-frontmatter",
            function (config, parserConfig) {
                const yamlMode = CodeMirror.getMode(config, "yaml");
                const inner = CodeMirror.getMode(
                    config,
                    parserConfig && parserConfig.base || "gfm"
                );

                function currentMode(state) {
                    return state.state === BODY ? inner : yamlMode;
                }

                return {
                    startState: function () {
                        return {
                            state: START,
                            inner: CodeMirror.startState(yamlMode)
                        };
                    },
                    copyState: function (state) {
                        return {
                            state: state.state,
                            inner: CodeMirror.copyState(
                                currentMode(state),
                                state.inner
                            )
                        };
                    },
                    token: function (stream, state) {
                        if (state.state === START) {
                            if (stream.match(/---/, false)) {
                                state.state = FRONTMATTER;
                                return yamlMode.token(stream, state.inner);
                            }
                            state.state = BODY;
                            state.inner = CodeMirror.startState(inner);
                            return inner.token(stream, state.inner);
                        } else if (state.state === FRONTMATTER) {
                            const end = stream.sol() &&
                                stream.match(/---/, false);
                            const style = yamlMode.token(stream, state.inner);
                            if (end) {
                                state.state = BODY;
                                state.inner = CodeMirror.startState(inner);
                            }
                            return style;
                        }
                        return inner.token(stream, state.inner);
                    },
                    innerMode: function (state) {
                        return {
                            mode: currentMode(state),
                            state: state.inner
                        };
                    },
                    blankLine: function (state) {
                        const mode = currentMode(state);
                        if (mode.blankLine) {
                            return mode.blankLine(state.inner);
                        }
                        return undefined;
                    }
                };
            },
            "yaml",
            "gfm"
        );
    }

    function install(CodeMirror) {
        if (!CodeMirror || installedTargets.has(CodeMirror)) {
            return;
        }
        installedTargets.add(CodeMirror);

        installDjango(CodeMirror);
        installHaml(CodeMirror);
        installHaskellLiterate(CodeMirror);
        installSmarty(CodeMirror);
        installSoy(CodeMirror);
        installTornado(CodeMirror);
        installYAMLFrontmatter(CodeMirror);
        RSTSlimCompat.install(CodeMirror);
    }

    exports.install = install;
});
