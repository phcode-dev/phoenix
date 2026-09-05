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

/*! DONT_STRIP_MINIFY: CodeMirror 5 compatibility implementations.
 *
 * Compatibility behavior in this file is based in part on CodeMirror 5
 * addons. CodeMirror is distributed under the following MIT license:
 * See thirdparty/licences/codemirror5-derived.markdown.
 *
 * Copyright (C) 2017 by Marijn Haverbeke <marijn@haverbeke.berlin> and others
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 *
 */

/**
 * CM6-backed implementations of high-value CodeMirror 5 addons.
 *
 * The installers take the compatibility facade as an argument so this module
 * can be loaded before the facade without introducing an AMD dependency
 * cycle. Each installer is safe to call repeatedly.
 */
define(function (require, exports, module) {

    const installedAddons = new WeakMap();
    const NON_WHITESPACE = /[^\s\u00a0]/;
    const HTML_VOID_TAGS = new Set([
        "area",
        "base",
        "br",
        "col",
        "command",
        "embed",
        "hr",
        "img",
        "input",
        "keygen",
        "link",
        "meta",
        "param",
        "source",
        "track",
        "wbr"
    ]);
    const TAG_PATTERN = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<![^>]*>|<\/?\s*([A-Za-z_\u00c0-\uffff][\w:.\-\u00b7-\uffff]*)(?:\s+(?:"[^"]*"|'[^']*'|[^'">])*)?\s*\/?>/g;
    const ADDON_PATHS = {
        "addon/comment/comment": "comment",
        "addon/comment/continuecomment": "continueComments",
        "addon/edit/closetag": "closeTag",
        "addon/edit/matchtags": "matchTags",
        "addon/edit/trailingspace": "trailingSpace",
        "addon/fold/brace-fold": "braceFold",
        "addon/fold/comment-fold": "commentFold",
        "addon/fold/markdown-fold": "markdownFold",
        "addon/fold/xml-fold": "tagHelpers",
        "addon/runmode/runmode": "runMode",
        "addon/search/searchcursor": "selectMatches",
        "addon/selection/mark-selection": "styleSelectedText"
    };

    function _installationSet(CodeMirror) {
        let installed = installedAddons.get(CodeMirror);
        if (!installed) {
            installed = new Set();
            installedAddons.set(CodeMirror, installed);
        }
        return installed;
    }

    function _installOnce(CodeMirror, name, installer) {
        if (!CodeMirror || typeof CodeMirror.defineExtension !== "function") {
            return false;
        }
        const installed = _installationSet(CodeMirror);
        if (installed.has(name)) {
            return true;
        }
        installer();
        installed.add(name);
        return true;
    }

    function _firstNonWhitespace(text) {
        const index = String(text).search(NON_WHITESPACE);
        return index === -1 ? String(text).length : index;
    }

    function _hasNonWhitespace(text) {
        return NON_WHITESPACE.test(String(text));
    }

    function _commentMode(editor, position) {
        const outerMode = editor.getMode();
        if (outerMode && (outerMode.useInnerComments === false || !outerMode.innerMode)) {
            return outerMode;
        }
        return editor.getModeAt(position);
    }

    function _lineCommentToken(mode, options) {
        const configured = options && options.lineComment;
        const token = configured || mode && mode.lineComment;
        return Array.isArray(token) ? token[0] : token;
    }

    function _blockCommentTokens(mode, options) {
        return {
            open: options && options.blockCommentStart ||
                mode && mode.blockCommentStart,
            close: options && options.blockCommentEnd ||
                mode && mode.blockCommentEnd,
            lead: options && options.blockCommentLead !== undefined ?
                options.blockCommentLead :
                mode && mode.blockCommentLead
        };
    }

    function _selectedLineEnd(editor, from, to) {
        const includesEndLine = from.line === to.line || to.ch !== 0;
        return Math.min(
            includesEndLine ? to.line : to.line - 1,
            editor.lastLine()
        );
    }

    function _lineComment(editor, from, to, suppliedOptions, CodeMirror) {
        const options = suppliedOptions || {};
        const mode = _commentMode(editor, from);
        const lineToken = _lineCommentToken(mode, options);
        if (!lineToken) {
            const blockTokens = _blockCommentTokens(mode, options);
            if (blockTokens.open && blockTokens.close) {
                _blockComment(
                    editor,
                    from,
                    to,
                    Object.assign({}, options, {fullLines: true}),
                    CodeMirror
                );
            }
            return;
        }

        const endLine = _selectedLineEnd(editor, from, to);
        if (endLine < from.line) {
            return;
        }
        const padding = options.padding === undefined ? " " : options.padding;
        const commentBlankLines = Boolean(options.commentBlankLines) ||
            from.line === to.line;
        let commonIndent = "";

        if (options.indent) {
            let shortestIndent = Infinity;
            for (let line = from.line; line <= endLine; line++) {
                const text = editor.getLine(line) || "";
                const indentLength = _firstNonWhitespace(text);
                if (indentLength < shortestIndent) {
                    shortestIndent = indentLength;
                    commonIndent = text.slice(0, indentLength);
                }
            }
        }

        editor.operation(function () {
            for (let line = from.line; line <= endLine; line++) {
                const text = editor.getLine(line) || "";
                if (!commentBlankLines && !_hasNonWhitespace(text)) {
                    continue;
                }
                if (!options.indent) {
                    editor.replaceRange(
                        lineToken + padding,
                        CodeMirror.Pos(line, 0),
                        null,
                        "+comment"
                    );
                    continue;
                }

                const lineIndentLength = _firstNonWhitespace(text);
                const cut = text.slice(0, commonIndent.length) === commonIndent ?
                    commonIndent.length :
                    lineIndentLength;
                editor.replaceRange(
                    commonIndent + lineToken + padding,
                    CodeMirror.Pos(line, 0),
                    CodeMirror.Pos(line, cut),
                    "+comment"
                );
            }
        });
    }

    function _blockComment(editor, from, to, suppliedOptions, CodeMirror) {
        const options = suppliedOptions || {};
        const mode = _commentMode(editor, from);
        const tokens = _blockCommentTokens(mode, options);
        if (!tokens.open || !tokens.close) {
            if (_lineCommentToken(mode, options) && options.fullLines !== false) {
                _lineComment(editor, from, to, options, CodeMirror);
            }
            return;
        }

        let endLine = Math.min(to.line, editor.lastLine());
        if (endLine !== from.line && to.ch === 0 &&
                _hasNonWhitespace(editor.getLine(endLine) || "")) {
            endLine--;
        }
        if (endLine < from.line) {
            return;
        }

        const padding = options.padding === undefined ? " " : options.padding;
        editor.operation(function () {
            if (options.fullLines !== false) {
                const lastLineHasText = _hasNonWhitespace(
                    editor.getLine(endLine) || ""
                );
                editor.replaceRange(
                    padding + tokens.close,
                    CodeMirror.Pos(endLine),
                    null,
                    "+comment"
                );
                editor.replaceRange(
                    tokens.open + padding,
                    CodeMirror.Pos(from.line, 0),
                    null,
                    "+comment"
                );
                if (tokens.lead !== null && tokens.lead !== undefined) {
                    for (let line = from.line + 1; line <= endLine; line++) {
                        if (line !== endLine || lastLineHasText) {
                            editor.replaceRange(
                                tokens.lead + padding,
                                CodeMirror.Pos(line, 0),
                                null,
                                "+comment"
                            );
                        }
                    }
                }
                return;
            }

            const selectionEndsAtTo = CodeMirror.cmpPos(
                editor.getCursor("to"),
                to
            ) === 0;
            const emptySelection = !editor.somethingSelected();
            editor.replaceRange(tokens.close, to, null, "+comment");
            if (selectionEndsAtTo) {
                editor.setSelection(
                    emptySelection ? to : editor.getCursor("from"),
                    to
                );
            }
            editor.replaceRange(tokens.open, from, null, "+comment");
        });
    }

    function _lineUncomment(editor, startLine, endLine, lineToken, padding, CodeMirror) {
        const removals = [];
        for (let line = startLine; line <= endLine; line++) {
            const text = editor.getLine(line) || "";
            const commentIndex = text.indexOf(lineToken);
            if (commentIndex === -1) {
                if (_hasNonWhitespace(text)) {
                    return false;
                }
                continue;
            }
            if (_hasNonWhitespace(text.slice(0, commentIndex))) {
                return false;
            }
            let end = commentIndex + lineToken.length;
            if (padding && text.slice(end, end + padding.length) === padding) {
                end += padding.length;
            }
            removals.push({
                from: CodeMirror.Pos(line, commentIndex),
                to: CodeMirror.Pos(line, end)
            });
        }
        if (!removals.length) {
            return false;
        }

        editor.operation(function () {
            removals.forEach(function (removal) {
                editor.replaceRange(
                    "",
                    removal.from,
                    removal.to,
                    "+comment"
                );
            });
        });
        return true;
    }

    function _blockUncomment(
        editor,
        from,
        to,
        startLine,
        endLine,
        tokens,
        padding,
        CodeMirror
    ) {
        if (!tokens.open || !tokens.close) {
            return false;
        }
        const firstText = editor.getLine(startLine) || "";
        const lastText = editor.getLine(endLine) || "";
        const openingIndex = firstText.indexOf(tokens.open);
        const closingIndex = lastText.indexOf(
            tokens.close,
            startLine === endLine ? openingIndex + tokens.open.length : 0
        );
        if (openingIndex === -1 || closingIndex === -1) {
            return false;
        }

        const previousOpening = firstText.lastIndexOf(tokens.open, from.ch);
        if (previousOpening !== -1 && previousOpening !== openingIndex) {
            const closeBeforeSelection = firstText.indexOf(
                tokens.close,
                previousOpening + tokens.open.length
            );
            if (closeBeforeSelection !== -1 &&
                    closeBeforeSelection + tokens.close.length !== from.ch) {
                return false;
            }
        }

        editor.operation(function () {
            let closeStart = closingIndex;
            if (padding && lastText.slice(
                closingIndex - padding.length,
                closingIndex
            ) === padding) {
                closeStart -= padding.length;
            }
            editor.replaceRange(
                "",
                CodeMirror.Pos(endLine, closeStart),
                CodeMirror.Pos(endLine, closingIndex + tokens.close.length),
                "+comment"
            );

            let openEnd = openingIndex + tokens.open.length;
            if (padding && firstText.slice(openEnd, openEnd + padding.length) === padding) {
                openEnd += padding.length;
            }
            editor.replaceRange(
                "",
                CodeMirror.Pos(startLine, openingIndex),
                CodeMirror.Pos(startLine, openEnd),
                "+comment"
            );

            if (tokens.lead !== null && tokens.lead !== undefined) {
                for (let line = startLine + 1; line <= endLine; line++) {
                    const text = editor.getLine(line) || "";
                    const leadIndex = text.indexOf(tokens.lead);
                    if (leadIndex === -1 ||
                            _hasNonWhitespace(text.slice(0, leadIndex))) {
                        continue;
                    }
                    let leadEnd = leadIndex + tokens.lead.length;
                    if (padding &&
                            text.slice(leadEnd, leadEnd + padding.length) === padding) {
                        leadEnd += padding.length;
                    }
                    editor.replaceRange(
                        "",
                        CodeMirror.Pos(line, leadIndex),
                        CodeMirror.Pos(line, leadEnd),
                        "+comment"
                    );
                }
            }
        });
        return true;
    }

    function _uncomment(editor, from, to, suppliedOptions, CodeMirror) {
        const options = suppliedOptions || {};
        const mode = _commentMode(editor, from);
        const startLine = Math.min(from.line, editor.lastLine());
        const endLine = Math.max(
            startLine,
            _selectedLineEnd(editor, from, to)
        );
        const padding = options.padding === undefined ? " " : options.padding;
        const lineToken = _lineCommentToken(mode, options);

        if (lineToken && _lineUncomment(
            editor,
            startLine,
            endLine,
            lineToken,
            padding,
            CodeMirror
        )) {
            return true;
        }

        return _blockUncomment(
            editor,
            from,
            to,
            startLine,
            endLine,
            _blockCommentTokens(mode, options),
            padding,
            CodeMirror
        );
    }

    function installComment(CodeMirror) {
        return _installOnce(CodeMirror, "comment", function () {
            CodeMirror.defineExtension("lineComment", function (from, to, options) {
                return _lineComment(this, from, to, options, CodeMirror);
            });
            CodeMirror.defineExtension("blockComment", function (from, to, options) {
                return _blockComment(this, from, to, options, CodeMirror);
            });
            CodeMirror.defineExtension("uncomment", function (from, to, options) {
                return _uncomment(this, from, to, options, CodeMirror);
            });
            CodeMirror.defineExtension("toggleComment", function (options) {
                const editor = this;
                const selections = editor.listSelections();
                let operation = null;
                let earliestLine = Infinity;

                for (let index = selections.length - 1; index >= 0; index--) {
                    const selection = selections[index];
                    const from = selection.from();
                    let to = selection.to();
                    if (from.line >= earliestLine) {
                        continue;
                    }
                    if (to.line >= earliestLine) {
                        to = CodeMirror.Pos(earliestLine, 0);
                    }
                    earliestLine = from.line;
                    if (operation === null) {
                        operation = editor.uncomment(from, to, options) ?
                            "uncomment" :
                            "comment";
                    } else if (operation === "uncomment") {
                        editor.uncomment(from, to, options);
                    }
                    if (operation === "comment") {
                        editor.lineComment(from, to, options);
                    }
                }
            });
            CodeMirror.commands.toggleComment = function (editor) {
                return editor.toggleComment();
            };
        });
    }

    function installSelectMatches(CodeMirror) {
        return _installOnce(CodeMirror, "selectMatches", function () {
            CodeMirror.defineExtension("selectMatches", function (query, caseFold) {
                const selectionStart = this.getCursor("from");
                const selectionEnd = this.getCursor("to");
                const cursor = this.getSearchCursor(
                    query,
                    selectionStart,
                    caseFold
                );
                const ranges = [];
                while (cursor.findNext()) {
                    if (CodeMirror.cmpPos(cursor.to(), selectionEnd) > 0) {
                        break;
                    }
                    ranges.push({
                        anchor: cursor.from(),
                        head: cursor.to()
                    });
                }
                if (ranges.length) {
                    this.setSelections(ranges, 0);
                }
            });
        });
    }

    function _clipPosition(CodeMirror, editor, position) {
        if (typeof editor.clipPos === "function") {
            return editor.clipPos(position);
        }
        const line = Math.max(
            editor.firstLine(),
            Math.min(position.line, editor.lastLine())
        );
        return CodeMirror.Pos(
            line,
            Math.max(0, Math.min(position.ch || 0, editor.getLine(line).length))
        );
    }

    function _bracketFolding(CodeMirror, pairs) {
        return function (editor, start) {
            const line = start.line;
            const lineText = editor.getLine(line);

            function findOpening(pair) {
                let tokenType;
                let at = start.ch;
                let pass = 0;

                while (true) {
                    const found = at <= 0 ?
                        -1 :
                        lineText.lastIndexOf(pair[0], at - 1);
                    if (found === -1) {
                        if (pass === 1) {
                            break;
                        }
                        pass = 1;
                        at = lineText.length;
                        continue;
                    }
                    if (pass === 1 && found < start.ch) {
                        break;
                    }
                    tokenType = editor.getTokenTypeAt(
                        CodeMirror.Pos(line, found + 1)
                    );
                    if (!/^(comment|string)/.test(tokenType || "")) {
                        return {
                            ch: found + 1,
                            pair: pair,
                            tokenType: tokenType
                        };
                    }
                    at = found - 1;
                }
            }

            function findRange(opening) {
                let count = 1;
                let end;
                let endCh;

                outer:
                for (let lineNumber = line;
                        lineNumber <= editor.lastLine();
                        lineNumber++) {
                    const text = editor.getLine(lineNumber);
                    let position = lineNumber === line ? opening.ch : 0;

                    while (true) {
                        let nextOpen = text.indexOf(
                            opening.pair[0],
                            position
                        );
                        let nextClose = text.indexOf(
                            opening.pair[1],
                            position
                        );
                        if (nextOpen < 0) {
                            nextOpen = text.length;
                        }
                        if (nextClose < 0) {
                            nextClose = text.length;
                        }
                        position = Math.min(nextOpen, nextClose);
                        if (position === text.length) {
                            break;
                        }
                        if (editor.getTokenTypeAt(
                            CodeMirror.Pos(lineNumber, position + 1)
                        ) === opening.tokenType) {
                            if (position === nextOpen) {
                                count++;
                            } else if (!--count) {
                                end = lineNumber;
                                endCh = position;
                                break outer;
                            }
                        }
                        position++;
                    }
                }

                if (end === undefined || line === end) {
                    return null;
                }
                return {
                    from: CodeMirror.Pos(line, opening.ch),
                    to: CodeMirror.Pos(end, endCh)
                };
            }

            const openings = [];
            pairs.forEach(function (pair) {
                const opening = findOpening(pair);
                if (opening) {
                    openings.push(opening);
                }
            });
            openings.sort(function (left, right) {
                return left.ch - right.ch;
            });

            for (let index = 0; index < openings.length; index++) {
                const range = findRange(openings[index]);
                if (range) {
                    return range;
                }
            }
            return null;
        };
    }

    function _hasImport(CodeMirror, editor, line) {
        if (line < editor.firstLine() || line > editor.lastLine()) {
            return null;
        }
        let start = editor.getTokenAt(CodeMirror.Pos(line, 1));
        if (!/\S/.test(start.string)) {
            start = editor.getTokenAt(CodeMirror.Pos(line, start.end + 1));
        }
        if (start.type !== "keyword" || start.string !== "import") {
            return null;
        }
        for (let lineNumber = line;
                lineNumber <= Math.min(editor.lastLine(), line + 10);
                lineNumber++) {
            const semicolon = editor.getLine(lineNumber).indexOf(";");
            if (semicolon !== -1) {
                return {
                    end: CodeMirror.Pos(lineNumber, semicolon),
                    startCh: start.end
                };
            }
        }
        return null;
    }

    function _importFold(CodeMirror, editor, start) {
        const startLine = start.line;
        const first = _hasImport(CodeMirror, editor, startLine);
        const previous = _hasImport(CodeMirror, editor, startLine - 2);
        if (!first ||
                _hasImport(CodeMirror, editor, startLine - 1) ||
                previous && previous.end.line === startLine - 1) {
            return null;
        }

        let end = first.end;
        while (true) {
            const next = _hasImport(CodeMirror, editor, end.line + 1);
            if (!next) {
                break;
            }
            end = next.end;
        }
        return {
            from: _clipPosition(
                CodeMirror,
                editor,
                CodeMirror.Pos(startLine, first.startCh + 1)
            ),
            to: end
        };
    }

    function _hasInclude(CodeMirror, editor, line) {
        if (line < editor.firstLine() || line > editor.lastLine()) {
            return null;
        }
        let start = editor.getTokenAt(CodeMirror.Pos(line, 1));
        if (!/\S/.test(start.string)) {
            start = editor.getTokenAt(CodeMirror.Pos(line, start.end + 1));
        }
        if (start.type === "meta" &&
                start.string.slice(0, 8) === "#include") {
            return start.start + 8;
        }
        return null;
    }

    function _includeFold(CodeMirror, editor, start) {
        const startLine = start.line;
        const first = _hasInclude(CodeMirror, editor, startLine);
        if (first === null ||
                _hasInclude(CodeMirror, editor, startLine - 1) !== null) {
            return null;
        }

        let end = startLine;
        while (_hasInclude(CodeMirror, editor, end + 1) !== null) {
            end++;
        }
        return {
            from: CodeMirror.Pos(startLine, first + 1),
            to: _clipPosition(CodeMirror, editor, CodeMirror.Pos(end))
        };
    }

    function installBraceFold(CodeMirror) {
        return _installOnce(CodeMirror, "braceFold", function () {
            const fold = CodeMirror.helpers.fold || {};
            if (typeof fold.brace !== "function") {
                CodeMirror.registerHelper("fold", "brace", _bracketFolding(
                    CodeMirror,
                    [
                        ["{", "}"],
                        ["[", "]"]
                    ]
                ));
            }
            if (typeof fold["brace-paren"] !== "function") {
                CodeMirror.registerHelper(
                    "fold",
                    "brace-paren",
                    _bracketFolding(
                        CodeMirror,
                        [
                            ["{", "}"],
                            ["[", "]"],
                            ["(", ")"]
                        ]
                    )
                );
            }
            if (typeof fold.import !== "function") {
                CodeMirror.registerHelper("fold", "import", function (editor, start) {
                    return _importFold(CodeMirror, editor, start);
                });
            }
            if (typeof fold.include !== "function") {
                CodeMirror.registerHelper("fold", "include", function (editor, start) {
                    return _includeFold(CodeMirror, editor, start);
                });
            }
        });
    }

    function _commentFold(CodeMirror, editor, start) {
        const mode = editor.getModeAt(start);
        const startToken = mode.blockCommentStart;
        const endToken = mode.blockCommentEnd;
        if (!startToken || !endToken) {
            return;
        }

        const line = start.line;
        const lineText = editor.getLine(line);
        let startCh;
        let at = start.ch;
        let pass = 0;

        while (true) {
            const found = at <= 0 ?
                -1 :
                lineText.lastIndexOf(startToken, at - 1);
            if (found === -1) {
                if (pass === 1) {
                    return;
                }
                pass = 1;
                at = lineText.length;
                continue;
            }
            if (pass === 1 && found < start.ch) {
                return;
            }
            if (/comment/.test(
                editor.getTokenTypeAt(
                    CodeMirror.Pos(line, found + 1)
                ) || ""
            ) && (found === 0 ||
                    lineText.slice(found - endToken.length, found) ===
                        endToken ||
                    !/comment/.test(
                        editor.getTokenTypeAt(
                            CodeMirror.Pos(line, found)
                        ) || ""
                    ))) {
                startCh = found + startToken.length;
                break;
            }
            at = found - 1;
        }

        let depth = 1;
        let end;
        let endCh;
        outer:
        for (let lineNumber = line;
                lineNumber <= editor.lastLine();
                lineNumber++) {
            const text = editor.getLine(lineNumber);
            let position = lineNumber === line ? startCh : 0;
            while (true) {
                let nextOpen = text.indexOf(startToken, position);
                let nextClose = text.indexOf(endToken, position);
                if (nextOpen < 0) {
                    nextOpen = text.length;
                }
                if (nextClose < 0) {
                    nextClose = text.length;
                }
                position = Math.min(nextOpen, nextClose);
                if (position === text.length) {
                    break;
                }
                if (position === nextOpen) {
                    depth++;
                } else if (!--depth) {
                    end = lineNumber;
                    endCh = position;
                    break outer;
                }
                position++;
            }
        }

        if (end === undefined ||
                line === end && endCh === startCh) {
            return;
        }
        return {
            from: CodeMirror.Pos(line, startCh),
            to: CodeMirror.Pos(end, endCh)
        };
    }

    function installCommentFold(CodeMirror) {
        return _installOnce(CodeMirror, "commentFold", function () {
            const fold = CodeMirror.helpers.fold || {};
            if (typeof fold.comment === "function") {
                return;
            }
            CodeMirror.registerGlobalHelper(
                "fold",
                "comment",
                function (mode) {
                    return mode.blockCommentStart && mode.blockCommentEnd;
                },
                function (editor, start) {
                    return _commentFold(CodeMirror, editor, start);
                }
            );
        });
    }

    function _markdownFold(CodeMirror, editor, start) {
        const maxDepth = 100;

        function isHeader(lineNumber) {
            const tokenType = editor.getTokenTypeAt(
                CodeMirror.Pos(lineNumber, 0)
            );
            return tokenType && /\bheader\b/.test(tokenType);
        }

        function headerLevel(lineNumber, line, nextLine) {
            let match = line && line.match(/^#+/);
            if (match && isHeader(lineNumber)) {
                return match[0].length;
            }
            match = nextLine && nextLine.match(/^[=-]+\s*$/);
            if (match && isHeader(lineNumber + 1)) {
                return nextLine[0] === "=" ? 1 : 2;
            }
            return maxDepth;
        }

        const firstLine = editor.getLine(start.line);
        let nextLine = editor.getLine(start.line + 1);
        const level = headerLevel(start.line, firstLine, nextLine);
        if (level === maxDepth) {
            return;
        }

        const lastLine = editor.lastLine();
        let end = start.line;
        let nextNextLine = editor.getLine(end + 2);
        while (end < lastLine) {
            if (headerLevel(end + 1, nextLine, nextNextLine) <= level) {
                break;
            }
            end++;
            nextLine = nextNextLine;
            nextNextLine = editor.getLine(end + 2);
        }

        return {
            from: CodeMirror.Pos(start.line, firstLine.length),
            to: CodeMirror.Pos(end, editor.getLine(end).length)
        };
    }

    function installMarkdownFold(CodeMirror) {
        return _installOnce(CodeMirror, "markdownFold", function () {
            const fold = CodeMirror.helpers.fold || {};
            if (typeof fold.markdown !== "function") {
                CodeMirror.registerHelper(
                    "fold",
                    "markdown",
                    function (editor, start) {
                        return _markdownFold(CodeMirror, editor, start);
                    }
                );
            }
        });
    }

    function _runMode(CodeMirror, source, modeSpec, suppliedCallback, options) {
        const mode = CodeMirror.getMode(CodeMirror.defaults, modeSpec);
        const tabSize = options && options.tabSize ||
            CodeMirror.defaults.tabSize;
        let callback = suppliedCallback;

        if (callback && typeof callback.appendChild === "function") {
            const node = callback;
            const ownerDocument = node.ownerDocument || window.document;
            let column = 0;
            node.textContent = "";
            callback = function (text, style) {
                if (text === "\n") {
                    node.appendChild(ownerDocument.createTextNode(text));
                    column = 0;
                    return;
                }

                let content = "";
                let position = 0;
                while (true) {
                    const tabIndex = text.indexOf("\t", position);
                    if (tabIndex === -1) {
                        content += text.slice(position);
                        column += text.length - position;
                        break;
                    }
                    column += tabIndex - position;
                    content += text.slice(position, tabIndex);
                    const size = tabSize - column % tabSize;
                    column += size;
                    content += " ".repeat(size);
                    position = tabIndex + 1;
                }

                if (style) {
                    const span = node.appendChild(
                        ownerDocument.createElement("span")
                    );
                    span.className = "cm-" +
                        style.replace(/ +/g, " cm-");
                    span.appendChild(
                        ownerDocument.createTextNode(content)
                    );
                } else {
                    node.appendChild(ownerDocument.createTextNode(content));
                }
            };
        }

        const lines = CodeMirror.splitLines(source);
        const state = options && options.state ||
            CodeMirror.startState(mode);
        for (let lineNumber = 0;
                lineNumber < lines.length;
                lineNumber++) {
            if (lineNumber) {
                callback("\n");
            }
            const stream = new CodeMirror.StringStream(
                lines[lineNumber],
                null,
                {
                    lookAhead: function (lineOffset) {
                        return lines[lineNumber + lineOffset];
                    },
                    baseToken: function () {}
                }
            );
            if (!stream.string && mode.blankLine) {
                mode.blankLine(state);
            }
            while (!stream.eol()) {
                const style = mode.token(stream, state);
                if (stream.pos <= stream.start) {
                    stream.next();
                }
                callback(
                    stream.current(),
                    style,
                    lineNumber,
                    stream.start,
                    state,
                    mode
                );
                stream.start = stream.pos;
            }
        }
    }

    function installRunMode(CodeMirror) {
        return _installOnce(CodeMirror, "runMode", function () {
            if (typeof CodeMirror.runMode !== "function") {
                CodeMirror.runMode = function (
                    source,
                    modeSpec,
                    callback,
                    options
                ) {
                    return _runMode(
                        CodeMirror,
                        source,
                        modeSpec,
                        callback,
                        options
                    );
                };
            }
        });
    }

    function installTrailingSpace(CodeMirror) {
        return _installOnce(CodeMirror, "trailingSpace", function () {
            if (Object.prototype.hasOwnProperty.call(
                CodeMirror.optionHandlers,
                "showTrailingSpace"
            )) {
                return;
            }
            CodeMirror.defineOption(
                "showTrailingSpace",
                false,
                function (editor, value, oldValue) {
                    const previousValue = oldValue === CodeMirror.Init ?
                        false :
                        oldValue;
                    if (previousValue && !value) {
                        editor.removeOverlay("trailingspace");
                    } else if (!previousValue && value) {
                        editor.addOverlay({
                            name: "trailingspace",
                            token: function (stream) {
                                const length = stream.string.length;
                                let index = length;
                                while (index &&
                                        /\s/.test(
                                            stream.string.charAt(index - 1)
                                        )) {
                                    index--;
                                }
                                if (index > stream.pos) {
                                    stream.pos = index;
                                    return null;
                                }
                                stream.pos = length;
                                return "trailingspace";
                            }
                        });
                    }
                }
            );
        });
    }

    function _tagRecords(editor, fromIndex, toIndex) {
        const text = editor.getValue();
        const start = Math.max(0, fromIndex || 0);
        const end = Math.min(
            text.length,
            toIndex === undefined ? text.length : toIndex
        );
        const expression = new RegExp(TAG_PATTERN.source, "g");
        const records = [];
        let match;

        while ((match = expression.exec(text))) {
            if (match.index >= end) {
                break;
            }
            if (!match[1] || expression.lastIndex <= start) {
                continue;
            }
            const nameOffset = match.index + match[0].indexOf(match[1]);
            const tokenType = typeof editor.getTokenTypeAt === "function" ?
                editor.getTokenTypeAt(editor.posFromIndex(nameOffset + 1)) :
                null;
            if (tokenType && !/(^|\s)tag(\s|$)/.test(tokenType)) {
                continue;
            }

            const closing = /^<\s*\//.test(match[0]);
            const selfClosing = /\/\s*>$/.test(match[0]);
            records.push({
                tag: match[1],
                key: match[1].toLowerCase(),
                opening: !closing,
                closing: closing,
                selfClosing: selfClosing,
                fromIndex: match.index,
                toIndex: expression.lastIndex,
                from: editor.posFromIndex(match.index),
                to: editor.posFromIndex(expression.lastIndex)
            });
        }
        return records;
    }

    function _pairTags(records) {
        const stack = [];
        const pairs = new Map();
        records.forEach(function (record) {
            if (record.selfClosing) {
                return;
            }
            if (record.opening) {
                stack.push(record);
                return;
            }
            let matchIndex = stack.length - 1;
            while (matchIndex >= 0 && stack[matchIndex].key !== record.key) {
                matchIndex--;
            }
            if (matchIndex < 0) {
                return;
            }
            const opening = stack[matchIndex];
            pairs.set(opening, record);
            pairs.set(record, opening);
            stack.length = matchIndex;
        });
        return pairs;
    }

    function _findTagAt(records, offset) {
        return records.find(function (record) {
            return record.fromIndex <= offset && offset <= record.toIndex;
        }) || null;
    }

    function _findMatchingTagFallback(editor, position, range, CodeMirror) {
        const firstLine = range ? Math.max(editor.firstLine(), range.from) :
            editor.firstLine();
        const lastLine = range ? Math.min(editor.lastLine() + 1, range.to) :
            editor.lastLine() + 1;
        const start = editor.indexFromPos(CodeMirror.Pos(firstLine, 0));
        const end = lastLine > editor.lastLine() ?
            editor.getValue().length :
            editor.indexFromPos(CodeMirror.Pos(lastLine, 0));
        const records = _tagRecords(editor, start, end);
        const current = _findTagAt(records, editor.indexFromPos(position));
        if (!current) {
            return;
        }
        if (current.selfClosing) {
            return {
                open: current,
                close: null,
                at: "open"
            };
        }
        const matching = _pairTags(records).get(current) || null;
        return {
            open: current.opening ? current : matching,
            close: current.closing ? current : matching,
            at: current.opening ? "open" : "close"
        };
    }

    function _findEnclosingTag(editor, position, range, CodeMirror) {
        const firstLine = range ? Math.max(editor.firstLine(), range.from) :
            editor.firstLine();
        const lastLine = range ? Math.min(editor.lastLine() + 1, range.to) :
            editor.lastLine() + 1;
        const start = editor.indexFromPos(CodeMirror.Pos(firstLine, 0));
        const end = lastLine > editor.lastLine() ?
            editor.getValue().length :
            editor.indexFromPos(CodeMirror.Pos(lastLine, 0));
        const offset = editor.indexFromPos(position);
        const records = _tagRecords(editor, start, end);
        const pairs = _pairTags(records);
        let enclosing = null;

        records.forEach(function (record) {
            if (!record.opening || record.selfClosing) {
                return;
            }
            const close = pairs.get(record);
            if (!close || record.toIndex > offset || close.fromIndex < offset) {
                return;
            }
            if (range && (record.from.line < range.from ||
                    close.to.line >= range.to)) {
                return;
            }
            if (!enclosing || record.fromIndex > enclosing.open.fromIndex) {
                enclosing = {
                    open: record,
                    close: close
                };
            }
        });
        return enclosing || undefined;
    }

    function _scanForClosingTag(editor, position, tagName, endLine, CodeMirror) {
        const start = editor.indexFromPos(position);
        const end = endLine === undefined || endLine > editor.lastLine() ?
            editor.getValue().length :
            editor.indexFromPos(CodeMirror.Pos(endLine, 0));
        const records = _tagRecords(editor, start, end).filter(function (record) {
            return record.fromIndex >= start;
        });
        const stack = [];
        const wanted = tagName && String(tagName).toLowerCase();

        for (let index = 0; index < records.length; index++) {
            const record = records[index];
            if (record.selfClosing) {
                continue;
            }
            if (record.opening) {
                stack.push(record.key);
                continue;
            }
            let matchIndex = stack.length - 1;
            while (matchIndex >= 0 && stack[matchIndex] !== record.key) {
                matchIndex--;
            }
            if (matchIndex >= 0) {
                stack.length = matchIndex;
                continue;
            }
            if (!wanted || wanted === record.key) {
                return record;
            }
        }
        return undefined;
    }

    function installTagHelpers(CodeMirror) {
        return _installOnce(CodeMirror, "tagHelpers", function () {
            if (typeof CodeMirror.findMatchingTag !== "function") {
                CodeMirror.findMatchingTag = function (editor, position, range) {
                    return _findMatchingTagFallback(
                        editor,
                        position,
                        range,
                        CodeMirror
                    );
                };
            }
            CodeMirror.findEnclosingTag = function (editor, position, range, tagName) {
                let enclosing = _findEnclosingTag(editor, position, range, CodeMirror);
                while (enclosing && tagName &&
                        enclosing.open.tag.toLowerCase() !== String(tagName).toLowerCase()) {
                    const outerPosition = enclosing.open.fromIndex > 0 ?
                        editor.posFromIndex(enclosing.open.fromIndex - 1) :
                        enclosing.open.from;
                    enclosing = _findEnclosingTag(
                        editor,
                        outerPosition,
                        range,
                        CodeMirror
                    );
                }
                return enclosing;
            };
            CodeMirror.scanForClosingTag = function (editor, position, name, endLine) {
                return _scanForClosingTag(
                    editor,
                    position,
                    name,
                    endLine,
                    CodeMirror
                );
            };
            CodeMirror.registerHelper("fold", "xml", function (editor, start) {
                const startIndex = editor.indexFromPos(
                    CodeMirror.Pos(start.line, 0)
                );
                const records = _tagRecords(
                    editor,
                    startIndex,
                    editor.getValue().length
                );
                const opening = records.find(function (record) {
                    return record.opening && !record.selfClosing &&
                        record.from.line === start.line;
                });
                if (!opening) {
                    return;
                }
                const closing = _pairTags(records).get(opening);
                if (!closing ||
                        CodeMirror.cmpPos(opening.to, closing.from) >= 0) {
                    return;
                }
                return {
                    from: opening.to,
                    to: closing.from
                };
            });
        });
    }

    function _matchingTagAtCursor(CodeMirror, editor) {
        const cursor = editor.getCursor();
        let match = CodeMirror.findMatchingTag(editor, cursor, editor.getViewport());
        if (!match && cursor.ch > 0) {
            match = CodeMirror.findMatchingTag(
                editor,
                CodeMirror.Pos(cursor.line, cursor.ch - 1),
                editor.getViewport()
            );
        }
        return match;
    }

    function _clearTagMatches(editor) {
        ["tagHit", "tagOther"].forEach(function (property) {
            if (editor.state[property]) {
                editor.state[property].clear();
            }
            editor.state[property] = null;
        });
    }

    function _updateTagMatches(CodeMirror, editor) {
        editor.state.failedTagMatch = false;
        editor.operation(function () {
            _clearTagMatches(editor);
            if (editor.somethingSelected()) {
                return;
            }
            const match = _matchingTagAtCursor(CodeMirror, editor);
            if (!match) {
                return;
            }

            if (editor.state.matchBothTags) {
                const current = match.at === "open" ? match.open : match.close;
                if (current) {
                    editor.state.tagHit = editor.markText(
                        current.from,
                        current.to,
                        {className: "CodeMirror-matchingtag"}
                    );
                }
            }
            const other = match.at === "close" ? match.open : match.close;
            if (other) {
                editor.state.tagOther = editor.markText(
                    other.from,
                    other.to,
                    {className: "CodeMirror-matchingtag"}
                );
            } else {
                editor.state.failedTagMatch = true;
            }
        });
    }

    function installMatchTags(CodeMirror) {
        installTagHelpers(CodeMirror);
        return _installOnce(CodeMirror, "matchTags", function () {
            const update = function (editor) {
                _updateTagMatches(CodeMirror, editor);
            };
            const updateFailedMatch = function (editor) {
                if (editor.state.failedTagMatch) {
                    _updateTagMatches(CodeMirror, editor);
                }
            };
            CodeMirror.defineOption("matchTags", false, function (editor, value, oldValue) {
                if (oldValue && oldValue !== CodeMirror.Init) {
                    editor.off("cursorActivity", update);
                    editor.off("viewportChange", updateFailedMatch);
                    _clearTagMatches(editor);
                }
                if (!value) {
                    return;
                }
                editor.state.matchBothTags = typeof value === "object" &&
                    Boolean(value.bothTags);
                editor.on("cursorActivity", update);
                editor.on("viewportChange", updateFailedMatch);
                _updateTagMatches(CodeMirror, editor);
            });
            CodeMirror.commands.toMatchingTag = function (editor) {
                const match = _matchingTagAtCursor(CodeMirror, editor);
                if (!match) {
                    return;
                }
                const other = match.at === "close" ? match.open : match.close;
                if (other) {
                    editor.extendSelection(other.to, other.from);
                }
            };
        });
    }

    function _isHTMLMode(editor, position) {
        const mode = editor.getModeAt(position) || {};
        const outerMode = editor.getMode() || {};
        return mode.configuration === "html" ||
            mode.helperType === "html" ||
            outerMode.name === "htmlmixed" ||
            outerMode.helperType === "html";
    }

    function _unclosedTagAt(editor, position) {
        const end = editor.indexFromPos(position);
        const htmlMode = _isHTMLMode(editor, position);
        const records = _tagRecords(editor, 0, end).filter(function (record) {
            return record.toIndex <= end;
        });
        const stack = [];
        records.forEach(function (record) {
            if (record.selfClosing ||
                    htmlMode && HTML_VOID_TAGS.has(record.key)) {
                return;
            }
            if (record.opening) {
                stack.push(record);
                return;
            }
            let matchIndex = stack.length - 1;
            while (matchIndex >= 0 && stack[matchIndex].key !== record.key) {
                matchIndex--;
            }
            if (matchIndex >= 0) {
                stack.length = matchIndex;
            }
        });
        return stack.length ? stack[stack.length - 1] : null;
    }

    function installCloseTag(CodeMirror) {
        installTagHelpers(CodeMirror);
        return _installOnce(CodeMirror, "closeTag", function () {
            CodeMirror.commands.closeTag = function (editor) {
                if (editor.getOption("disableInput")) {
                    return CodeMirror.Pass;
                }
                const selections = editor.listSelections();
                const replacements = [];
                for (let index = 0; index < selections.length; index++) {
                    const selection = selections[index];
                    if (!selection.empty()) {
                        return CodeMirror.Pass;
                    }
                    const tag = _unclosedTagAt(editor, selection.head);
                    if (!tag) {
                        return CodeMirror.Pass;
                    }
                    const existingClose = CodeMirror.scanForClosingTag(
                        editor,
                        selection.head,
                        tag.tag,
                        Math.min(editor.lastLine() + 1, selection.head.line + 500)
                    );
                    if (existingClose && existingClose.key === tag.key) {
                        return CodeMirror.Pass;
                    }
                    replacements.push(`</${tag.tag}>`);
                }
                editor.replaceSelections(replacements, "end", "+insert");
                return true;
            };
        });
    }

    function _nextNonWhitespace(text, start) {
        const suffix = String(text).slice(start);
        const index = suffix.search(NON_WHITESPACE);
        return index === -1 ? -1 : start + index;
    }

    function _blockCommentContinuation(mode) {
        if (mode && mode.blockCommentContinue !== undefined) {
            return mode.blockCommentContinue;
        }
        if (mode && mode.blockCommentStart === "/*" &&
                mode.blockCommentEnd === "*/") {
            return " * ";
        }
        return null;
    }

    function _continuedCommentText(editor, position) {
        const tokenType = editor.getTokenTypeAt(position) || "";
        if (!/(^|\s)comment(\s|$)/.test(tokenType)) {
            return null;
        }

        const mode = _commentMode(editor, position) || {};
        const text = editor.getLine(position.line) || "";
        const lineToken = _lineCommentToken(mode);
        const blockStart = mode.blockCommentStart;
        const blockEnd = mode.blockCommentEnd;
        const blockContinue = _blockCommentContinuation(mode);

        if (blockStart && blockEnd && blockContinue) {
            const closingBeforeCursor = text.lastIndexOf(
                blockEnd,
                Math.max(0, position.ch - blockEnd.length)
            );
            const lineCommentIndex = lineToken ?
                text.lastIndexOf(lineToken, Math.max(0, position.ch - 1)) :
                -1;
            if (!(closingBeforeCursor !== -1 &&
                    closingBeforeCursor + blockEnd.length === position.ch) &&
                    lineCommentIndex === -1) {
                const openingBeforeCursor = text.lastIndexOf(
                    blockStart,
                    Math.max(0, position.ch - blockStart.length)
                );
                if (openingBeforeCursor > closingBeforeCursor) {
                    const leading = text.slice(0, openingBeforeCursor);
                    const indent = _hasNonWhitespace(leading) ?
                        " ".repeat(openingBeforeCursor) :
                        leading;
                    return "\n" + indent + blockContinue;
                }

                const leader = blockContinue.replace(/\s+$/, "");
                const leaderIndex = leader ? text.indexOf(leader) : -1;
                if (leaderIndex !== -1 &&
                        leaderIndex <= position.ch &&
                        !_hasNonWhitespace(text.slice(0, leaderIndex))) {
                    return "\n" + text.slice(0, leaderIndex) + blockContinue;
                }
            }
        }

        if (!lineToken) {
            return null;
        }
        const lineCommentIndex = text.indexOf(lineToken);
        if (lineCommentIndex === -1 ||
                _hasNonWhitespace(text.slice(0, lineCommentIndex))) {
            return null;
        }
        if (position.ch === 0 && lineCommentIndex === 0) {
            return "\n";
        }

        const option = editor.getOption("continueComments");
        if (option && typeof option === "object" &&
                option.continueLineComment === false) {
            return null;
        }
        const nextLine = editor.getLine(position.line + 1) || "";
        const nextCommentIndex = nextLine.indexOf(lineToken);
        const hasTextAfterCursor = _nextNonWhitespace(text, position.ch) !== -1;
        const nextLineContinues = nextCommentIndex !== -1 &&
            !_hasNonWhitespace(nextLine.slice(0, nextCommentIndex));
        if (!hasTextAfterCursor && !nextLineContinues) {
            return null;
        }

        const trailingWhitespace = text.slice(
            lineCommentIndex + lineToken.length
        ).match(/^\s*/);
        return "\n" + text.slice(0, lineCommentIndex) + lineToken +
            (trailingWhitespace ? trailingWhitespace[0] : "");
    }

    function _continueComment(CodeMirror, editor) {
        if (editor.getOption("disableInput")) {
            return CodeMirror.Pass;
        }
        const selections = editor.listSelections();
        const inserts = [];
        for (let index = 0; index < selections.length; index++) {
            const selection = selections[index];
            const insertion = _continuedCommentText(editor, selection.head);
            if (insertion === null) {
                return CodeMirror.Pass;
            }
            inserts.push(insertion);
        }
        editor.replaceSelections(inserts, "end", "+insert");
        return true;
    }

    function installContinueComments(CodeMirror) {
        return _installOnce(CodeMirror, "continueComments", function () {
            const continueCommand = function (editor) {
                return _continueComment(CodeMirror, editor);
            };
            CodeMirror.commands.continueComment = continueCommand;
            CodeMirror.defineOption(
                "continueComments",
                null,
                function (editor, value, oldValue) {
                    if (oldValue && oldValue !== CodeMirror.Init) {
                        editor.removeKeyMap("continueComment");
                    }
                    if (!value) {
                        return;
                    }
                    let key = "Enter";
                    if (typeof value === "string") {
                        key = value;
                    } else if (typeof value === "object" && value.key) {
                        key = value.key;
                    }
                    const keyMap = {
                        name: "continueComment"
                    };
                    keyMap[key] = continueCommand;
                    editor.addKeyMap(keyMap);
                }
            );
        });
    }

    function _clearSelectedTextMarks(editor) {
        const marks = editor.state.markedSelection || [];
        marks.forEach(function (marker) {
            marker.clear();
        });
        marks.length = 0;
    }

    function _refreshSelectedTextMarks(editor) {
        _clearSelectedTextMarks(editor);
        const marks = editor.state.markedSelection;
        const className = editor.state.markedSelectionStyle;
        editor.listSelections().forEach(function (selection) {
            const from = selection.from();
            const to = selection.to();
            if (from.line === to.line && from.ch === to.ch) {
                return;
            }
            marks.push(editor.markText(from, to, {
                className: className
            }));
        });
    }

    function installStyleSelectedText(CodeMirror) {
        return _installOnce(CodeMirror, "styleSelectedText", function () {
            const refresh = function (editor) {
                if (editor.state.markedSelection) {
                    editor.operation(function () {
                        _refreshSelectedTextMarks(editor);
                    });
                }
            };
            CodeMirror.defineOption(
                "styleSelectedText",
                false,
                function (editor, value, oldValue) {
                    const wasEnabled = Boolean(
                        oldValue && oldValue !== CodeMirror.Init
                    );
                    if (wasEnabled) {
                        editor.off("cursorActivity", refresh);
                        _clearSelectedTextMarks(editor);
                    }
                    if (!value) {
                        editor.state.markedSelection = null;
                        editor.state.markedSelectionStyle = null;
                        return;
                    }

                    editor.state.markedSelection = [];
                    editor.state.markedSelectionStyle =
                        typeof value === "string" ?
                            value :
                            "CodeMirror-selectedtext";
                    _refreshSelectedTextMarks(editor);
                    editor.on("cursorActivity", refresh);
                }
            );
        });
    }

    function installAll(CodeMirror) {
        installComment(CodeMirror);
        installSelectMatches(CodeMirror);
        installBraceFold(CodeMirror);
        installCommentFold(CodeMirror);
        installMarkdownFold(CodeMirror);
        installTagHelpers(CodeMirror);
        installMatchTags(CodeMirror);
        installCloseTag(CodeMirror);
        installContinueComments(CodeMirror);
        installStyleSelectedText(CodeMirror);
        installRunMode(CodeMirror);
        installTrailingSpace(CodeMirror);
        return true;
    }

    function _addonKey(moduleName) {
        const normalized = String(moduleName || "")
            .replace(/[?#].*$/, "")
            .replace(/\.js$/, "");
        const addonIndex = normalized.indexOf("addon/");
        return addonIndex === -1 ? normalized : normalized.slice(addonIndex);
    }

    function install(CodeMirror, moduleName) {
        if (!moduleName) {
            return installAll(CodeMirror);
        }
        switch (ADDON_PATHS[_addonKey(moduleName)]) {
        case "comment":
            return installComment(CodeMirror);
        case "continueComments":
            return installContinueComments(CodeMirror);
        case "closeTag":
            return installCloseTag(CodeMirror);
        case "matchTags":
            return installMatchTags(CodeMirror);
        case "trailingSpace":
            return installTrailingSpace(CodeMirror);
        case "braceFold":
            return installBraceFold(CodeMirror);
        case "commentFold":
            return installCommentFold(CodeMirror);
        case "markdownFold":
            return installMarkdownFold(CodeMirror);
        case "tagHelpers":
            return installTagHelpers(CodeMirror);
        case "runMode":
            return installRunMode(CodeMirror);
        case "selectMatches":
            return installSelectMatches(CodeMirror);
        case "styleSelectedText":
            return installStyleSelectedText(CodeMirror);
        default:
            return false;
        }
    }

    exports.install = install;
    exports.installAll = installAll;
    exports.installBraceFold = installBraceFold;
    exports.installCloseTag = installCloseTag;
    exports.installComment = installComment;
    exports.installCommentFold = installCommentFold;
    exports.installContinueComments = installContinueComments;
    exports.installMarkdownFold = installMarkdownFold;
    exports.installMatchTags = installMatchTags;
    exports.installRunMode = installRunMode;
    exports.installSelectMatches = installSelectMatches;
    exports.installStyleSelectedText = installStyleSelectedText;
    exports.installTagHelpers = installTagHelpers;
    exports.installTrailingSpace = installTrailingSpace;
    exports.isSupported = function (moduleName) {
        return Boolean(ADDON_PATHS[_addonKey(moduleName)]);
    };
});
