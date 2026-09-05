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

/*! DONT_STRIP_MINIFY: CodeMirror 5.65.16-derived RST and Slim mode compatibility.
 * CodeMirror copyright (c) by Marijn Haverbeke and others.
 * Slim Highlighting for CodeMirror copyright (c) HicknHack Software Gmbh.
 * Distributed under the MIT license. See thirdparty/licences/codemirror5-derived.markdown.
 */

/**
 * Ports the historical CodeMirror 5.65.16 RST and Slim stream modes to
 * Phoenix's CM6-backed CodeMirror compatibility facade.
 */
define(function (require, exports, module) {

    const installedTargets = new WeakSet();

    function installRst(CodeMirror) {
        CodeMirror.defineMode("rst", function (config, options) {
            const strongPattern = /^\*\*[^\*\s](?:[^\*]*[^\*\s])?\*\*/;
            const emphasisPattern = /^\*[^\*\s](?:[^\*]*[^\*\s])?\*/;
            const literalPattern = /^``[^`\s](?:[^`]*[^`\s])``/;

            const numberPattern = /^(?:[\d]+(?:[\.,]\d+)*)/;
            const positivePattern = /^(?:\s\+[\d]+(?:[\.,]\d+)*)/;
            const negativePattern = /^(?:\s\-[\d]+(?:[\.,]\d+)*)/;

            const uriProtocolPattern = "[Hh][Tt][Tt][Pp][Ss]?://";
            const uriDomainPattern = "(?:[\\d\\w.-]+)\\.(?:\\w{2,6})";
            const uriPathPattern =
                "(?:/[\\d\\w\\#\\%\\&\\-\\.\\,\\/\\:\\=\\?\\~]+)*";
            const uriPattern = new RegExp(
                "^" + uriProtocolPattern + uriDomainPattern + uriPathPattern
            );

            const overlay = {
                token: function (stream) {
                    if (stream.match(strongPattern) &&
                            stream.match(/\W+|$/, false)) {
                        return "strong";
                    }
                    if (stream.match(emphasisPattern) &&
                            stream.match(/\W+|$/, false)) {
                        return "em";
                    }
                    if (stream.match(literalPattern) &&
                            stream.match(/\W+|$/, false)) {
                        return "string-2";
                    }
                    if (stream.match(numberPattern)) {
                        return "number";
                    }
                    if (stream.match(positivePattern)) {
                        return "positive";
                    }
                    if (stream.match(negativePattern)) {
                        return "negative";
                    }
                    if (stream.match(uriPattern)) {
                        return "link";
                    }

                    while (!stream.eol()) {
                        stream.next();
                        if (stream.match(strongPattern, false)) {
                            break;
                        }
                        if (stream.match(emphasisPattern, false)) {
                            break;
                        }
                        if (stream.match(literalPattern, false)) {
                            break;
                        }
                        if (stream.match(numberPattern, false)) {
                            break;
                        }
                        if (stream.match(positivePattern, false)) {
                            break;
                        }
                        if (stream.match(negativePattern, false)) {
                            break;
                        }
                        if (stream.match(uriPattern, false)) {
                            break;
                        }
                    }

                    return null;
                }
            };

            const mode = CodeMirror.getMode(
                config,
                options.backdrop || "rst-base"
            );

            return CodeMirror.overlayMode(mode, overlay, true);
        }, "python", "stex");

        CodeMirror.defineMode("rst-base", function (config) {
            function format(string) {
                const args = Array.prototype.slice.call(arguments, 1);
                return string.replace(/{(\d+)}/g, function (match, n) {
                    return typeof args[n] !== "undefined" ? args[n] : match;
                });
            }

            const pythonMode = CodeMirror.getMode(config, "python");
            const stexMode = CodeMirror.getMode(config, "stex");

            const SEPARATOR = "\\s+";
            const TAIL = "(?:\\s*|\\W|$)";
            const tailPattern = new RegExp(format("^{0}", TAIL));

            const NAME =
                "(?:[^\\W\\d_](?:[\\w!\"#$%&'()\\*\\+,\\-\\.\/:;<=>\\?]*[^\\W_])?)";
            const namePattern = new RegExp(format("^{0}", NAME));
            const NAME_WITH_WHITESPACE =
                "(?:[^\\W\\d_](?:[\\w\\s!\"#$%&'()\\*\\+,\\-\\.\/:;<=>\\?]*[^\\W_])?)";
            const REFERENCE_NAME = format(
                "(?:{0}|`{1}`)",
                NAME,
                NAME_WITH_WHITESPACE
            );

            const TEXT_WITHOUT_PIPE =
                "(?:[^\\s\\|](?:[^\\|]*[^\\s\\|])?)";
            const TEXT_WITHOUT_BACKTICK = "(?:[^\\`]+)";
            const textWithoutBacktickPattern = new RegExp(
                format("^{0}", TEXT_WITHOUT_BACKTICK)
            );

            const sectionPattern = new RegExp(
                "^([!'#$%&\"()*+,-./:;<=>?@\\[\\\\\\]^_`{|}~])\\1{3,}\\s*$"
            );
            const explicitPattern = new RegExp(
                format("^\\.\\.{0}", SEPARATOR)
            );
            const linkPattern = new RegExp(
                format("^_{0}:{1}|^__:{1}", REFERENCE_NAME, TAIL)
            );
            const directivePattern = new RegExp(
                format("^{0}::{1}", REFERENCE_NAME, TAIL)
            );
            const substitutionPattern = new RegExp(
                format(
                    "^\\|{0}\\|{1}{2}::{3}",
                    TEXT_WITHOUT_PIPE,
                    SEPARATOR,
                    REFERENCE_NAME,
                    TAIL
                )
            );
            const footnotePattern = new RegExp(
                format(
                    "^\\[(?:\\d+|#{0}?|\\*)]{1}",
                    REFERENCE_NAME,
                    TAIL
                )
            );
            const citationPattern = new RegExp(
                format("^\\[{0}\\]{1}", REFERENCE_NAME, TAIL)
            );

            const substitutionReferencePattern = new RegExp(
                format("^\\|{0}\\|", TEXT_WITHOUT_PIPE)
            );
            const footnoteReferencePattern = new RegExp(
                format("^\\[(?:\\d+|#{0}?|\\*)]_", REFERENCE_NAME)
            );
            const citationReferencePattern = new RegExp(
                format("^\\[{0}\\]_", REFERENCE_NAME)
            );
            const linkReferencePattern = new RegExp(
                format("^{0}__?", REFERENCE_NAME)
            );
            const quotedLinkReferencePattern = new RegExp(
                format("^`{0}`_", TEXT_WITHOUT_BACKTICK)
            );

            const prefixRolePattern = new RegExp(
                format(
                    "^:{0}:`{1}`{2}",
                    NAME,
                    TEXT_WITHOUT_BACKTICK,
                    TAIL
                )
            );
            const suffixRolePattern = new RegExp(
                format(
                    "^`{1}`:{0}:{2}",
                    NAME,
                    TEXT_WITHOUT_BACKTICK,
                    TAIL
                )
            );
            const rolePattern = new RegExp(
                format("^:{0}:{1}", NAME, TAIL)
            );

            const directiveNamePattern = new RegExp(
                format("^{0}", REFERENCE_NAME)
            );
            const directiveTailPattern = new RegExp(
                format("^::{0}", TAIL)
            );
            const substitutionTextPattern = new RegExp(
                format("^\\|{0}\\|", TEXT_WITHOUT_PIPE)
            );
            const substitutionSeparatorPattern = new RegExp(
                format("^{0}", SEPARATOR)
            );
            const substitutionNamePattern = new RegExp(
                format("^{0}", REFERENCE_NAME)
            );
            const substitutionTailPattern = new RegExp(
                format("^::{0}", TAIL)
            );
            const linkHeadPattern = new RegExp("^_");
            const linkNamePattern = new RegExp(
                format("^{0}|_", REFERENCE_NAME)
            );
            const linkTailPattern = new RegExp(format("^:{0}", TAIL));

            const verbatimPattern = new RegExp("^::\\s*$");
            const examplesPattern = new RegExp(
                "^\\s+(?:>>>|In \\[\\d+\\]:)\\s"
            );

            function context(phaseValue, stageValue, mode, local) {
                return {
                    phase: phaseValue,
                    stage: stageValue,
                    mode: mode,
                    local: local
                };
            }

            function change(state, tokenizer, ctx) {
                state.tok = tokenizer;
                state.ctx = ctx || {};
            }

            function stage(state) {
                return state.ctx.stage || 0;
            }

            function phase(state) {
                return state.ctx.phase;
            }

            function toNormal(stream, state) {
                let token = null;

                if (stream.sol() && stream.match(examplesPattern, false)) {
                    change(state, toMode, {
                        mode: pythonMode,
                        local: CodeMirror.startState(pythonMode)
                    });
                } else if (stream.sol() && stream.match(explicitPattern)) {
                    change(state, toExplicit);
                    token = "meta";
                } else if (stream.sol() && stream.match(sectionPattern)) {
                    change(state, toNormal);
                    token = "header";
                } else if (phase(state) === prefixRolePattern ||
                        stream.match(prefixRolePattern, false)) {
                    switch (stage(state)) {
                    case 0:
                        change(
                            state,
                            toNormal,
                            context(prefixRolePattern, 1)
                        );
                        stream.match(/^:/);
                        token = "meta";
                        break;
                    case 1:
                        change(
                            state,
                            toNormal,
                            context(prefixRolePattern, 2)
                        );
                        stream.match(namePattern);
                        token = "keyword";

                        if (stream.current().match(/^(?:math|latex)/)) {
                            state.tmpStex = true;
                        }
                        break;
                    case 2:
                        change(
                            state,
                            toNormal,
                            context(prefixRolePattern, 3)
                        );
                        stream.match(/^:`/);
                        token = "meta";
                        break;
                    case 3:
                        if (state.tmpStex) {
                            state.tmpStex = undefined;
                            state.tmp = {
                                mode: stexMode,
                                local: CodeMirror.startState(stexMode)
                            };
                        }

                        if (state.tmp) {
                            if (stream.peek() === "`") {
                                change(
                                    state,
                                    toNormal,
                                    context(prefixRolePattern, 4)
                                );
                                state.tmp = undefined;
                                break;
                            }

                            token = state.tmp.mode.token(
                                stream,
                                state.tmp.local
                            );
                            break;
                        }

                        change(
                            state,
                            toNormal,
                            context(prefixRolePattern, 4)
                        );
                        stream.match(textWithoutBacktickPattern);
                        token = "string";
                        break;
                    case 4:
                        change(
                            state,
                            toNormal,
                            context(prefixRolePattern, 5)
                        );
                        stream.match(/^`/);
                        token = "meta";
                        break;
                    case 5:
                        change(
                            state,
                            toNormal,
                            context(prefixRolePattern, 6)
                        );
                        stream.match(tailPattern);
                        break;
                    default:
                        change(state, toNormal);
                    }
                } else if (phase(state) === suffixRolePattern ||
                        stream.match(suffixRolePattern, false)) {
                    switch (stage(state)) {
                    case 0:
                        change(
                            state,
                            toNormal,
                            context(suffixRolePattern, 1)
                        );
                        stream.match(/^`/);
                        token = "meta";
                        break;
                    case 1:
                        change(
                            state,
                            toNormal,
                            context(suffixRolePattern, 2)
                        );
                        stream.match(textWithoutBacktickPattern);
                        token = "string";
                        break;
                    case 2:
                        change(
                            state,
                            toNormal,
                            context(suffixRolePattern, 3)
                        );
                        stream.match(/^`:/);
                        token = "meta";
                        break;
                    case 3:
                        change(
                            state,
                            toNormal,
                            context(suffixRolePattern, 4)
                        );
                        stream.match(namePattern);
                        token = "keyword";
                        break;
                    case 4:
                        change(
                            state,
                            toNormal,
                            context(suffixRolePattern, 5)
                        );
                        stream.match(/^:/);
                        token = "meta";
                        break;
                    case 5:
                        change(
                            state,
                            toNormal,
                            context(suffixRolePattern, 6)
                        );
                        stream.match(tailPattern);
                        break;
                    default:
                        change(state, toNormal);
                    }
                } else if (phase(state) === rolePattern ||
                        stream.match(rolePattern, false)) {
                    switch (stage(state)) {
                    case 0:
                        change(state, toNormal, context(rolePattern, 1));
                        stream.match(/^:/);
                        token = "meta";
                        break;
                    case 1:
                        change(state, toNormal, context(rolePattern, 2));
                        stream.match(namePattern);
                        token = "keyword";
                        break;
                    case 2:
                        change(state, toNormal, context(rolePattern, 3));
                        stream.match(/^:/);
                        token = "meta";
                        break;
                    case 3:
                        change(state, toNormal, context(rolePattern, 4));
                        stream.match(tailPattern);
                        break;
                    default:
                        change(state, toNormal);
                    }
                } else if (phase(state) === substitutionReferencePattern ||
                        stream.match(substitutionReferencePattern, false)) {
                    switch (stage(state)) {
                    case 0:
                        change(
                            state,
                            toNormal,
                            context(substitutionReferencePattern, 1)
                        );
                        stream.match(substitutionTextPattern);
                        token = "variable-2";
                        break;
                    case 1:
                        change(
                            state,
                            toNormal,
                            context(substitutionReferencePattern, 2)
                        );
                        if (stream.match(/^_?_?/)) {
                            token = "link";
                        }
                        break;
                    default:
                        change(state, toNormal);
                    }
                } else if (stream.match(footnoteReferencePattern)) {
                    change(state, toNormal);
                    token = "quote";
                } else if (stream.match(citationReferencePattern)) {
                    change(state, toNormal);
                    token = "quote";
                } else if (stream.match(linkReferencePattern)) {
                    change(state, toNormal);
                    if (!stream.peek() || stream.peek().match(/^\W$/)) {
                        token = "link";
                    }
                } else if (phase(state) === quotedLinkReferencePattern ||
                        stream.match(quotedLinkReferencePattern, false)) {
                    switch (stage(state)) {
                    case 0:
                        if (!stream.peek() ||
                                stream.peek().match(/^\W$/)) {
                            change(
                                state,
                                toNormal,
                                context(quotedLinkReferencePattern, 1)
                            );
                        } else {
                            stream.match(quotedLinkReferencePattern);
                        }
                        break;
                    case 1:
                        change(
                            state,
                            toNormal,
                            context(quotedLinkReferencePattern, 2)
                        );
                        stream.match(/^`/);
                        token = "link";
                        break;
                    case 2:
                        change(
                            state,
                            toNormal,
                            context(quotedLinkReferencePattern, 3)
                        );
                        stream.match(textWithoutBacktickPattern);
                        break;
                    case 3:
                        change(
                            state,
                            toNormal,
                            context(quotedLinkReferencePattern, 4)
                        );
                        stream.match(/^`_/);
                        token = "link";
                        break;
                    default:
                        change(state, toNormal);
                    }
                } else if (stream.match(verbatimPattern)) {
                    change(state, toVerbatim);
                } else if (stream.next()) {
                    change(state, toNormal);
                }

                return token;
            }

            function toExplicit(stream, state) {
                let token = null;

                if (phase(state) === substitutionPattern ||
                        stream.match(substitutionPattern, false)) {
                    switch (stage(state)) {
                    case 0:
                        change(
                            state,
                            toExplicit,
                            context(substitutionPattern, 1)
                        );
                        stream.match(substitutionTextPattern);
                        token = "variable-2";
                        break;
                    case 1:
                        change(
                            state,
                            toExplicit,
                            context(substitutionPattern, 2)
                        );
                        stream.match(substitutionSeparatorPattern);
                        break;
                    case 2:
                        change(
                            state,
                            toExplicit,
                            context(substitutionPattern, 3)
                        );
                        stream.match(substitutionNamePattern);
                        token = "keyword";
                        break;
                    case 3:
                        change(
                            state,
                            toExplicit,
                            context(substitutionPattern, 4)
                        );
                        stream.match(substitutionTailPattern);
                        token = "meta";
                        break;
                    default:
                        change(state, toNormal);
                    }
                } else if (phase(state) === directivePattern ||
                        stream.match(directivePattern, false)) {
                    switch (stage(state)) {
                    case 0:
                        change(
                            state,
                            toExplicit,
                            context(directivePattern, 1)
                        );
                        stream.match(directiveNamePattern);
                        token = "keyword";

                        if (stream.current().match(/^(?:math|latex)/)) {
                            state.tmpStex = true;
                        } else if (stream.current().match(/^python/)) {
                            state.tmpPy = true;
                        }
                        break;
                    case 1:
                        change(
                            state,
                            toExplicit,
                            context(directivePattern, 2)
                        );
                        stream.match(directiveTailPattern);
                        token = "meta";

                        if (stream.match(/^latex\s*$/) || state.tmpStex) {
                            state.tmpStex = undefined;
                            change(state, toMode, {
                                mode: stexMode,
                                local: CodeMirror.startState(stexMode)
                            });
                        }
                        break;
                    case 2:
                        change(
                            state,
                            toExplicit,
                            context(directivePattern, 3)
                        );
                        if (stream.match(/^python\s*$/) || state.tmpPy) {
                            state.tmpPy = undefined;
                            change(state, toMode, {
                                mode: pythonMode,
                                local: CodeMirror.startState(pythonMode)
                            });
                        }
                        break;
                    default:
                        change(state, toNormal);
                    }
                } else if (phase(state) === linkPattern ||
                        stream.match(linkPattern, false)) {
                    switch (stage(state)) {
                    case 0:
                        change(
                            state,
                            toExplicit,
                            context(linkPattern, 1)
                        );
                        stream.match(linkHeadPattern);
                        stream.match(linkNamePattern);
                        token = "link";
                        break;
                    case 1:
                        change(
                            state,
                            toExplicit,
                            context(linkPattern, 2)
                        );
                        stream.match(linkTailPattern);
                        token = "meta";
                        break;
                    default:
                        change(state, toNormal);
                    }
                } else if (stream.match(footnotePattern)) {
                    change(state, toNormal);
                    token = "quote";
                } else if (stream.match(citationPattern)) {
                    change(state, toNormal);
                    token = "quote";
                } else {
                    stream.eatSpace();
                    if (stream.eol()) {
                        change(state, toNormal);
                    } else {
                        stream.skipToEnd();
                        change(state, toComment);
                        token = "comment";
                    }
                }

                return token;
            }

            function toComment(stream, state) {
                return asBlock(stream, state, "comment");
            }

            function toVerbatim(stream, state) {
                return asBlock(stream, state, "meta");
            }

            function asBlock(stream, state, token) {
                if (stream.eol() || stream.eatSpace()) {
                    stream.skipToEnd();
                    return token;
                }
                change(state, toNormal);
                return null;
            }

            function toMode(stream, state) {
                if (state.ctx.mode && state.ctx.local) {
                    if (stream.sol()) {
                        if (!stream.eatSpace()) {
                            change(state, toNormal);
                        }
                        return null;
                    }

                    return state.ctx.mode.token(stream, state.ctx.local);
                }

                change(state, toNormal);
                return null;
            }

            return {
                startState: function () {
                    return {
                        tok: toNormal,
                        ctx: context(undefined, 0)
                    };
                },

                copyState: function (state) {
                    let ctx = state.ctx;
                    let tmp = state.tmp;
                    if (ctx.local) {
                        ctx = {
                            mode: ctx.mode,
                            local: CodeMirror.copyState(ctx.mode, ctx.local)
                        };
                    }
                    if (tmp) {
                        tmp = {
                            mode: tmp.mode,
                            local: CodeMirror.copyState(tmp.mode, tmp.local)
                        };
                    }
                    return {
                        tok: state.tok,
                        ctx: ctx,
                        tmp: tmp
                    };
                },

                innerMode: function (state) {
                    if (state.tmp) {
                        return {
                            state: state.tmp.local,
                            mode: state.tmp.mode
                        };
                    }
                    if (state.ctx.mode) {
                        return {
                            state: state.ctx.local,
                            mode: state.ctx.mode
                        };
                    }
                    return null;
                },

                token: function (stream, state) {
                    return state.tok(stream, state);
                }
            };
        }, "python", "stex");

        CodeMirror.defineMIME("text/x-rst", "rst");
    }

    function installSlim(CodeMirror) {
        CodeMirror.defineMode("slim", function (config) {
            const htmlMode = CodeMirror.getMode(config, {
                name: "htmlmixed"
            });
            const rubyMode = CodeMirror.getMode(config, "ruby");
            const modes = {
                html: htmlMode,
                ruby: rubyMode
            };
            const embedded = {
                ruby: "ruby",
                javascript: "javascript",
                css: "text/css",
                sass: "text/x-sass",
                scss: "text/x-scss",
                less: "text/x-less",
                styl: "text/x-styl",
                coffee: "coffeescript",
                asciidoc: "text/x-asciidoc",
                markdown: "text/x-markdown",
                textile: "text/x-textile",
                creole: "text/x-creole",
                wiki: "text/x-wiki",
                mediawiki: "text/x-mediawiki",
                rdoc: "text/x-rdoc",
                builder: "text/x-builder",
                nokogiri: "text/x-nokogiri",
                erb: "application/x-erb"
            };
            const embeddedRegexp = (function (map) {
                const names = [];
                for (const key in map) {
                    names.push(key);
                }
                return new RegExp("^(" + names.join("|") + "):");
            }(embedded));

            const styleMap = {
                commentLine: "comment",
                slimSwitch: "operator special",
                slimTag: "tag",
                slimId: "attribute def",
                slimClass: "attribute qualifier",
                slimAttribute: "attribute",
                slimSubmode: "keyword special",
                closeAttributeTag: null,
                slimDoctype: null,
                lineContinuation: null
            };
            const closing = {
                "{": "}",
                "[": "]",
                "(": ")"
            };

            const nameStartChar =
                "_a-zA-Z\xC0-\xD6\xD8-\xF6\xF8-\u02FF\u0370-\u037D" +
                "\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF" +
                "\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD";
            const nameChar =
                nameStartChar + "\\-0-9\xB7\u0300-\u036F\u203F-\u2040";
            const nameRegexp = new RegExp(
                "^[" + ":" + nameStartChar + "]" +
                "(?::[" + nameChar + "]|[" + nameChar + "]*)"
            );
            const attributeNameRegexp = new RegExp(
                "^[" + ":" + nameStartChar + "]" +
                "[:\\." + nameChar + "]*(?=\\s*=)"
            );
            const wrappedAttributeNameRegexp = new RegExp(
                "^[" + ":" + nameStartChar + "]" +
                "[:\\." + nameChar + "]*"
            );
            const classNameRegexp = /^\.-?[_a-zA-Z]+[\w\-]*/;
            const classIdRegexp = /^#[_a-zA-Z]+[\w\-]*/;

            function backup(pos, tokenize, style) {
                const restore = function (stream, state) {
                    state.tokenize = tokenize;
                    if (stream.pos < pos) {
                        stream.pos = pos;
                        return style;
                    }
                    return state.tokenize(stream, state);
                };
                return function (stream, state) {
                    state.tokenize = restore;
                    return tokenize(stream, state);
                };
            }

            function maybeBackup(stream, state, pattern, offset, style) {
                const current = stream.current();
                const index = current.search(pattern);
                if (index > -1) {
                    state.tokenize = backup(
                        stream.pos,
                        state.tokenize,
                        style
                    );
                    stream.backUp(current.length - index - offset);
                }
                return style;
            }

            function continueLine(state, column) {
                state.stack = {
                    parent: state.stack,
                    style: "continuation",
                    indented: column,
                    tokenize: state.line
                };
                state.line = state.tokenize;
            }

            function finishContinue(state) {
                if (state.line === state.tokenize) {
                    state.line = state.stack.tokenize;
                    state.stack = state.stack.parent;
                }
            }

            function lineContinuable(column, tokenize) {
                return function (stream, state) {
                    finishContinue(state);
                    if (stream.match(/^\\$/)) {
                        continueLine(state, column);
                        return "lineContinuation";
                    }
                    const style = tokenize(stream, state);
                    if (stream.eol() &&
                            stream.current().match(
                                /(?:^|[^\\])(?:\\\\)*\\$/
                            )) {
                        stream.backUp(1);
                    }
                    return style;
                };
            }

            function commaContinuable(column, tokenize) {
                return function (stream, state) {
                    finishContinue(state);
                    const style = tokenize(stream, state);
                    if (stream.eol() && stream.current().match(/,$/)) {
                        continueLine(state, column);
                    }
                    return style;
                };
            }

            function rubyInQuote(endQuote, tokenize) {
                return function (stream, state) {
                    const character = stream.peek();
                    if (character === endQuote &&
                            state.rubyState.tokenize.length === 1) {
                        stream.next();
                        state.tokenize = tokenize;
                        return "closeAttributeTag";
                    }
                    return ruby(stream, state);
                };
            }

            function startRubySplat(tokenize) {
                let rubyState;
                const runSplat = function (stream, state) {
                    if (state.rubyState.tokenize.length === 1 &&
                            !state.rubyState.context.prev) {
                        stream.backUp(1);
                        if (stream.eatSpace()) {
                            state.rubyState = rubyState;
                            state.tokenize = tokenize;
                            return tokenize(stream, state);
                        }
                        stream.next();
                    }
                    return ruby(stream, state);
                };
                return function (stream, state) {
                    rubyState = state.rubyState;
                    state.rubyState = CodeMirror.startState(rubyMode);
                    state.tokenize = runSplat;
                    return ruby(stream, state);
                };
            }

            function ruby(stream, state) {
                return rubyMode.token(stream, state.rubyState);
            }

            function htmlLine(stream, state) {
                if (stream.match(/^\\$/)) {
                    return "lineContinuation";
                }
                return html(stream, state);
            }

            function html(stream, state) {
                if (stream.match(/^#\{/)) {
                    state.tokenize = rubyInQuote("}", state.tokenize);
                    return null;
                }
                return maybeBackup(
                    stream,
                    state,
                    /[^\\]#\{/,
                    1,
                    htmlMode.token(stream, state.htmlState)
                );
            }

            function startHtmlLine(lastTokenize) {
                return function (stream, state) {
                    const style = htmlLine(stream, state);
                    if (stream.eol()) {
                        state.tokenize = lastTokenize;
                    }
                    return style;
                };
            }

            function startHtmlMode(stream, state, offset) {
                state.stack = {
                    parent: state.stack,
                    style: "html",
                    indented: stream.column() + offset,
                    tokenize: state.line
                };
                state.line = state.tokenize = html;
                return null;
            }

            function comment(stream, state) {
                stream.skipToEnd();
                return state.stack.style;
            }

            function commentMode(stream, state) {
                state.stack = {
                    parent: state.stack,
                    style: "comment",
                    indented: state.indented + 1,
                    tokenize: state.line
                };
                state.line = comment;
                return comment(stream, state);
            }

            function attributeWrapper(stream, state) {
                if (stream.eat(state.stack.endQuote)) {
                    state.line = state.stack.line;
                    state.tokenize = state.stack.tokenize;
                    state.stack = state.stack.parent;
                    return null;
                }
                if (stream.match(wrappedAttributeNameRegexp)) {
                    state.tokenize = attributeWrapperAssign;
                    return "slimAttribute";
                }
                stream.next();
                return null;
            }

            function attributeWrapperAssign(stream, state) {
                if (stream.match(/^==?/)) {
                    state.tokenize = attributeWrapperValue;
                    return null;
                }
                return attributeWrapper(stream, state);
            }

            function attributeWrapperValue(stream, state) {
                const character = stream.peek();
                if (character === "\"" || character === "'") {
                    state.tokenize = readQuoted(
                        character,
                        "string",
                        true,
                        false,
                        attributeWrapper
                    );
                    stream.next();
                    return state.tokenize(stream, state);
                }
                if (character === "[") {
                    return startRubySplat(attributeWrapper)(stream, state);
                }
                if (stream.match(/^(true|false|nil)\b/)) {
                    state.tokenize = attributeWrapper;
                    return "keyword";
                }
                return startRubySplat(attributeWrapper)(stream, state);
            }

            function startAttributeWrapperMode(
                state,
                endQuote,
                tokenize
            ) {
                state.stack = {
                    parent: state.stack,
                    style: "wrapper",
                    indented: state.indented + 1,
                    tokenize: tokenize,
                    line: state.line,
                    endQuote: endQuote
                };
                state.line = state.tokenize = attributeWrapper;
                return null;
            }

            function sub(stream, state) {
                if (stream.match(/^#\{/)) {
                    state.tokenize = rubyInQuote("}", state.tokenize);
                    return null;
                }
                const subStream = new CodeMirror.StringStream(
                    stream.string.slice(state.stack.indented),
                    stream.tabSize
                );
                subStream.pos = stream.pos - state.stack.indented;
                subStream.start = stream.start - state.stack.indented;
                subStream.lastColumnPos =
                    stream.lastColumnPos - state.stack.indented;
                subStream.lastColumnValue =
                    stream.lastColumnValue - state.stack.indented;
                const style = state.subMode.token(
                    subStream,
                    state.subState
                );
                stream.pos = subStream.pos + state.stack.indented;
                return style;
            }

            function firstSub(stream, state) {
                state.stack.indented = stream.column();
                state.line = state.tokenize = sub;
                return state.tokenize(stream, state);
            }

            function createMode(modeName) {
                const query = embedded[modeName];
                const spec = CodeMirror.mimeModes[query];
                if (spec) {
                    return CodeMirror.getMode(config, spec);
                }
                const factory = CodeMirror.modes[query];
                if (factory) {
                    return factory(config, {
                        name: query
                    });
                }
                return CodeMirror.getMode(config, "null");
            }

            function getMode(modeName) {
                if (!modes.hasOwnProperty(modeName)) {
                    modes[modeName] = createMode(modeName);
                }
                return modes[modeName];
            }

            function startSubMode(modeName, state) {
                const subMode = getMode(modeName);
                const subState = CodeMirror.startState(subMode);

                state.subMode = subMode;
                state.subState = subState;

                state.stack = {
                    parent: state.stack,
                    style: "sub",
                    indented: state.indented + 1,
                    tokenize: state.line
                };
                state.line = state.tokenize = firstSub;
                return "slimSubmode";
            }

            function doctypeLine(stream, state) {
                stream.skipToEnd();
                return "slimDoctype";
            }

            function startLine(stream, state) {
                const character = stream.peek();
                if (character === "<") {
                    state.tokenize = startHtmlLine(state.tokenize);
                    return state.tokenize(stream, state);
                }
                if (stream.match(/^[|']/)) {
                    return startHtmlMode(stream, state, 1);
                }
                if (stream.match(/^\/(!|\[\w+])?/)) {
                    return commentMode(stream, state);
                }
                if (stream.match(/^(-|==?[<>]?)/)) {
                    state.tokenize = lineContinuable(
                        stream.column(),
                        commaContinuable(stream.column(), ruby)
                    );
                    return "slimSwitch";
                }
                if (stream.match(/^doctype\b/)) {
                    state.tokenize = doctypeLine;
                    return "keyword";
                }

                const match = stream.match(embeddedRegexp);
                if (match) {
                    return startSubMode(match[1], state);
                }

                return slimTag(stream, state);
            }

            function slim(stream, state) {
                if (state.startOfLine) {
                    return startLine(stream, state);
                }
                return slimTag(stream, state);
            }

            function slimTag(stream, state) {
                if (stream.eat("*")) {
                    state.tokenize = startRubySplat(slimTagExtras);
                    return null;
                }
                if (stream.match(nameRegexp)) {
                    state.tokenize = slimTagExtras;
                    return "slimTag";
                }
                return slimClass(stream, state);
            }

            function slimTagExtras(stream, state) {
                if (stream.match(/^(<>?|><?)/)) {
                    state.tokenize = slimClass;
                    return null;
                }
                return slimClass(stream, state);
            }

            function slimClass(stream, state) {
                if (stream.match(classIdRegexp)) {
                    state.tokenize = slimClass;
                    return "slimId";
                }
                if (stream.match(classNameRegexp)) {
                    state.tokenize = slimClass;
                    return "slimClass";
                }
                return slimAttribute(stream, state);
            }

            function slimAttribute(stream, state) {
                if (stream.match(/^([\[\{\(])/)) {
                    return startAttributeWrapperMode(
                        state,
                        closing[RegExp.$1],
                        slimAttribute
                    );
                }
                if (stream.match(attributeNameRegexp)) {
                    state.tokenize = slimAttributeAssign;
                    return "slimAttribute";
                }
                if (stream.peek() === "*") {
                    stream.next();
                    state.tokenize = startRubySplat(slimContent);
                    return null;
                }
                return slimContent(stream, state);
            }

            function slimAttributeAssign(stream, state) {
                if (stream.match(/^==?/)) {
                    state.tokenize = slimAttributeValue;
                    return null;
                }
                return slimAttribute(stream, state);
            }

            function slimAttributeValue(stream, state) {
                const character = stream.peek();
                if (character === "\"" || character === "'") {
                    state.tokenize = readQuoted(
                        character,
                        "string",
                        true,
                        false,
                        slimAttribute
                    );
                    stream.next();
                    return state.tokenize(stream, state);
                }
                if (character === "[") {
                    return startRubySplat(slimAttribute)(stream, state);
                }
                if (character === ":") {
                    return startRubySplat(slimAttributeSymbols)(
                        stream,
                        state
                    );
                }
                if (stream.match(/^(true|false|nil)\b/)) {
                    state.tokenize = slimAttribute;
                    return "keyword";
                }
                return startRubySplat(slimAttribute)(stream, state);
            }

            function slimAttributeSymbols(stream, state) {
                stream.backUp(1);
                if (stream.match(/^[^\s],(?=:)/)) {
                    state.tokenize = startRubySplat(slimAttributeSymbols);
                    return null;
                }
                stream.next();
                return slimAttribute(stream, state);
            }

            function readQuoted(
                quote,
                style,
                embed,
                unescaped,
                nextTokenize
            ) {
                return function (stream, state) {
                    finishContinue(state);
                    const fresh = stream.current().length === 0;
                    if (stream.match(/^\\$/, fresh)) {
                        if (!fresh) {
                            return style;
                        }
                        continueLine(state, state.indented);
                        return "lineContinuation";
                    }
                    if (stream.match(/^#\{/, fresh)) {
                        if (!fresh) {
                            return style;
                        }
                        state.tokenize = rubyInQuote(
                            "}",
                            state.tokenize
                        );
                        return null;
                    }
                    let escaped = false;
                    let character;
                    while ((character = stream.next()) !== null) {
                        if (character === quote &&
                                (unescaped || !escaped)) {
                            state.tokenize = nextTokenize;
                            break;
                        }
                        if (embed && character === "#" && !escaped &&
                                stream.eat("{")) {
                            stream.backUp(2);
                            break;
                        }
                        escaped = !escaped && character === "\\";
                    }
                    if (stream.eol() && escaped) {
                        stream.backUp(1);
                    }
                    return style;
                };
            }

            function slimContent(stream, state) {
                if (stream.match(/^==?/)) {
                    state.tokenize = ruby;
                    return "slimSwitch";
                }
                if (stream.match(/^\/$/)) {
                    state.tokenize = slim;
                    return null;
                }
                if (stream.match(/^:/)) {
                    state.tokenize = slimTag;
                    return "slimSwitch";
                }
                startHtmlMode(stream, state, 0);
                return state.tokenize(stream, state);
            }

            const mode = {
                startState: function () {
                    const htmlState = CodeMirror.startState(htmlMode);
                    const rubyState = CodeMirror.startState(rubyMode);
                    return {
                        htmlState: htmlState,
                        rubyState: rubyState,
                        stack: null,
                        last: null,
                        tokenize: slim,
                        line: slim,
                        indented: 0
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
                        subMode: state.subMode,
                        subState: state.subMode &&
                            CodeMirror.copyState(
                                state.subMode,
                                state.subState
                            ),
                        stack: state.stack,
                        last: state.last,
                        tokenize: state.tokenize,
                        line: state.line
                    };
                },

                token: function (stream, state) {
                    if (stream.sol()) {
                        state.indented = stream.indentation();
                        state.startOfLine = true;
                        state.tokenize = state.line;
                        while (state.stack &&
                                state.stack.indented > state.indented &&
                                state.last !== "slimSubmode") {
                            state.line = state.tokenize =
                                state.stack.tokenize;
                            state.stack = state.stack.parent;
                            state.subMode = null;
                            state.subState = null;
                        }
                    }
                    if (stream.eatSpace()) {
                        return null;
                    }
                    const style = state.tokenize(stream, state);
                    state.startOfLine = false;
                    if (style) {
                        state.last = style;
                    }
                    return styleMap.hasOwnProperty(style) ?
                        styleMap[style] : style;
                },

                blankLine: function (state) {
                    if (state.subMode && state.subMode.blankLine) {
                        return state.subMode.blankLine(state.subState);
                    }
                    return undefined;
                },

                innerMode: function (state) {
                    if (state.subMode) {
                        return {
                            state: state.subState,
                            mode: state.subMode
                        };
                    }
                    return {
                        state: state,
                        mode: mode
                    };
                }
            };
            return mode;
        }, "htmlmixed", "ruby");

        CodeMirror.defineMIME("text/x-slim", "slim");
        CodeMirror.defineMIME("application/x-slim", "slim");
    }

    function install(CodeMirror) {
        if (!CodeMirror || installedTargets.has(CodeMirror)) {
            return;
        }
        installedTargets.add(CodeMirror);

        installRst(CodeMirror);
        installSlim(CodeMirror);
    }

    exports.install = install;
});
