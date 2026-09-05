/*
 * CodeMirror, copyright (c) by Marijn Haverbeke and others
 * Distributed under an MIT license: https://codemirror.net/5/LICENSE
 *
 * Adapted for Phoenix's CodeMirror 6 compatibility layer from the CodeMirror
 * 5 brace-fold, comment-fold, and markdown-fold addons.
 */

/*! DONT_STRIP_MINIFY: CodeMirror 5-derived compatibility implementation.
 * See thirdparty/licences/codemirror5-derived.markdown.
 */

define(function (require, exports, module) {

    const CodeMirror = brackets.getModule("editor/CodeMirrorCompat"),
        CM6 = brackets.getModule("thirdparty/CodeMirror6/codemirror6");

    let initialized = false;

    function clipPosition(cm, position) {
        const line = Math.max(cm.firstLine(), Math.min(position.line, cm.lastLine()));
        return CodeMirror.Pos(
            line,
            Math.max(0, Math.min(position.ch || 0, cm.getLine(line).length))
        );
    }

    function bracketFolding(pairs) {
        return function (cm, start) {
            if (!start ||
                    start.line < cm.firstLine() ||
                    start.line > cm.lastLine()) {
                return null;
            }
            const line = start.line;
            const lineText = cm.getLine(line);
            if (typeof lineText !== "string") {
                return null;
            }

            function findOpening(pair) {
                let tokenType;
                let at = start.ch;
                let pass = 0;

                while (true) {
                    const found = at <= 0 ? -1 : lineText.lastIndexOf(pair[0], at - 1);
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
                    tokenType = cm.getTokenTypeAt(CodeMirror.Pos(line, found + 1));
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

            function findRange(found) {
                let count = 1;
                let end;
                let endCh;

                outer:
                for (let lineNumber = line; lineNumber <= cm.lastLine(); lineNumber++) {
                    const text = cm.getLine(lineNumber);
                    let position = lineNumber === line ? found.ch : 0;

                    while (true) {
                        let nextOpen = text.indexOf(found.pair[0], position);
                        let nextClose = text.indexOf(found.pair[1], position);
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
                        if (cm.getTokenTypeAt(CodeMirror.Pos(lineNumber, position + 1)) ===
                                found.tokenType) {
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
                    from: CodeMirror.Pos(line, found.ch),
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

    function hasImport(cm, line) {
        if (line < cm.firstLine() || line > cm.lastLine()) {
            return null;
        }
        let start = cm.getTokenAt(CodeMirror.Pos(line, 1));
        if (!/\S/.test(start.string)) {
            start = cm.getTokenAt(CodeMirror.Pos(line, start.end + 1));
        }
        if (start.type !== "keyword" || start.string !== "import") {
            return null;
        }
        for (let lineNumber = line;
                lineNumber <= Math.min(cm.lastLine(), line + 10);
                lineNumber++) {
            const semicolon = cm.getLine(lineNumber).indexOf(";");
            if (semicolon !== -1) {
                return {
                    end: CodeMirror.Pos(lineNumber, semicolon),
                    startCh: start.end
                };
            }
        }
        return null;
    }

    function importFold(cm, start) {
        const startLine = start.line;
        const first = hasImport(cm, startLine);
        const previous = hasImport(cm, startLine - 2);
        if (!first || hasImport(cm, startLine - 1) ||
                (previous && previous.end.line === startLine - 1)) {
            return null;
        }

        let end = first.end;
        while (true) {
            const next = hasImport(cm, end.line + 1);
            if (!next) {
                break;
            }
            end = next.end;
        }
        return {
            from: clipPosition(cm, CodeMirror.Pos(startLine, first.startCh + 1)),
            to: end
        };
    }

    function hasInclude(cm, line) {
        if (line < cm.firstLine() || line > cm.lastLine()) {
            return null;
        }
        let start = cm.getTokenAt(CodeMirror.Pos(line, 1));
        if (!/\S/.test(start.string)) {
            start = cm.getTokenAt(CodeMirror.Pos(line, start.end + 1));
        }
        if (start.type === "meta" && start.string.slice(0, 8) === "#include") {
            return start.start + 8;
        }
        return null;
    }

    function includeFold(cm, start) {
        const startLine = start.line;
        const first = hasInclude(cm, startLine);
        if (first === null || hasInclude(cm, startLine - 1) !== null) {
            return null;
        }

        let end = startLine;
        while (hasInclude(cm, end + 1) !== null) {
            end++;
        }
        return {
            from: CodeMirror.Pos(startLine, first + 1),
            to: clipPosition(cm, CodeMirror.Pos(end))
        };
    }

    function commentFold(cm, start) {
        const mode = cm.getModeAt(start);
        const startToken = mode.blockCommentStart;
        const endToken = mode.blockCommentEnd;
        if (!startToken || !endToken) {
            return;
        }

        const line = start.line;
        const lineText = cm.getLine(line);
        let startCh;
        let at = start.ch;
        let pass = 0;

        while (true) {
            const found = at <= 0 ? -1 : lineText.lastIndexOf(startToken, at - 1);
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
            if (/comment/.test(cm.getTokenTypeAt(CodeMirror.Pos(line, found + 1)) || "") &&
                    (found === 0 ||
                    lineText.slice(found - endToken.length, found) === endToken ||
                    !/comment/.test(cm.getTokenTypeAt(CodeMirror.Pos(line, found)) || ""))) {
                startCh = found + startToken.length;
                break;
            }
            at = found - 1;
        }

        let depth = 1;
        let end;
        let endCh;
        outer:
        for (let lineNumber = line; lineNumber <= cm.lastLine(); lineNumber++) {
            const text = cm.getLine(lineNumber);
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

        if (end === undefined || (line === end && endCh === startCh)) {
            return;
        }
        return {
            from: CodeMirror.Pos(line, startCh),
            to: CodeMirror.Pos(end, endCh)
        };
    }

    function markdownFold(cm, start) {
        const maxDepth = 100;

        function isHeader(lineNumber) {
            const tokenType = cm.getTokenTypeAt(CodeMirror.Pos(lineNumber, 0));
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

        const firstLine = cm.getLine(start.line);
        let nextLine = cm.getLine(start.line + 1);
        const level = headerLevel(start.line, firstLine, nextLine);
        if (level === maxDepth) {
            return;
        }

        const lastLine = cm.lastLine();
        let end = start.line;
        let nextNextLine = cm.getLine(end + 2);
        while (end < lastLine) {
            if (headerLevel(end + 1, nextLine, nextNextLine) <= level) {
                break;
            }
            end++;
            nextLine = nextNextLine;
            nextNextLine = cm.getLine(end + 2);
        }

        return {
            from: CodeMirror.Pos(start.line, firstLine.length),
            to: CodeMirror.Pos(end, cm.getLine(end).length)
        };
    }

    function syntaxFold(cm, start) {
        if (!cm._view || !CM6.foldable) {
            return;
        }
        const mode = cm.getModeAt(start);
        if (CodeMirror.fold && CodeMirror.fold.xml &&
                (mode.name === "xml" ||
                mode.helperType === "xml" ||
                mode.helperType === "html")) {
            return CodeMirror.fold.xml(cm, start);
        }
        const state = cm._view.state;
        const localLine = start.line - cm.firstLine();
        if (localLine < 0 || localLine >= state.doc.lines) {
            return;
        }
        const line = state.doc.line(localLine + 1);
        const range = CM6.foldable(state, line.from, line.to);
        if (!range) {
            return;
        }
        return {
            from: cm.posFromIndex(range.from),
            to: cm.posFromIndex(range.to)
        };
    }

    function init() {
        if (initialized) {
            return;
        }
        initialized = true;

        CodeMirror.registerHelper("fold", "brace", bracketFolding([
            ["{", "}"],
            ["[", "]"]
        ]));
        CodeMirror.registerHelper("fold", "brace-paren", bracketFolding([
            ["{", "}"],
            ["[", "]"],
            ["(", ")"]
        ]));
        CodeMirror.registerHelper("fold", "import", importFold);
        CodeMirror.registerHelper("fold", "include", includeFold);
        CodeMirror.registerHelper("fold", "markdown", markdownFold);
        CodeMirror.registerGlobalHelper("fold", "comment", function (mode) {
            return mode.blockCommentStart && mode.blockCommentEnd;
        }, commentFold);
    }

    exports.init = init;
    exports.syntaxFold = syntaxFold;
});
