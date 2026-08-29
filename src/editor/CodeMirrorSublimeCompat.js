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
 * This program is distributed in the hope that it will be useful, but WITHOUT
 * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
 * FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License
 * for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see https://opensource.org/licenses/AGPL-3.0.
 */

/*! DONT_STRIP_MINIFY: CodeMirror 5 Sublime compatibility implementation.
 *
 * The command behavior and canonical key bindings are based on the CodeMirror
 * 5 Sublime keymap. CodeMirror is distributed under the following MIT license:
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
 * CM5 Sublime-keymap compatibility implemented against the CM6-backed editor
 * facade. This module intentionally takes CodeMirror as an install argument so
 * loading it cannot introduce a CodeMirrorCompat/CodeMirror6Adapter cycle.
 */
define(function (require, exports, module) {

    const installedFacades = new WeakSet();

    function _position(CodeMirror, line, character) {
        return CodeMirror.Pos(line, character);
    }

    function _samePosition(CodeMirror, left, right) {
        return CodeMirror.cmpPos(left, right) === 0;
    }

    function _wordAt(CodeMirror, editor, position) {
        const line = editor.getLine(position.line) || "";
        let start = Math.max(0, Math.min(position.ch, line.length));
        let end = start;

        while (start > 0 && CodeMirror.isWordChar(line.charAt(start - 1))) {
            start--;
        }
        while (end < line.length && CodeMirror.isWordChar(line.charAt(end))) {
            end++;
        }

        return {
            from: _position(CodeMirror, position.line, start),
            to: _position(CodeMirror, position.line, end),
            word: line.slice(start, end)
        };
    }

    function _escapeRegExp(text) {
        return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }

    function _rangeIsSelected(CodeMirror, ranges, from, to) {
        return ranges.some(function (range) {
            return _samePosition(CodeMirror, range.from(), from) &&
                _samePosition(CodeMirror, range.to(), to);
        });
    }

    function _subwordCategory(CodeMirror, character) {
        if (character === "_" || !CodeMirror.isWordChar(character)) {
            return "separator";
        }
        return character.toUpperCase() === character ? "upper" : "lower";
    }

    function _findSubword(CodeMirror, editor, start, direction) {
        if (direction < 0 && start.ch === 0) {
            return editor.clipPos(_position(CodeMirror, start.line - 1));
        }

        const text = editor.getLine(start.line) || "";
        if (direction > 0 && start.ch >= text.length) {
            return editor.clipPos(_position(CodeMirror, start.line + 1, 0));
        }

        const edge = direction < 0 ? 0 : text.length;
        let boundary = start.ch;
        let category = null;
        let inWord = false;

        for (let characterIndex = start.ch;
            characterIndex !== edge;
            characterIndex += direction) {
            const character = text.charAt(
                direction < 0 ? characterIndex - 1 : characterIndex
            );
            const nextCategory = _subwordCategory(CodeMirror, character);

            if (!inWord) {
                if (nextCategory === "separator") {
                    boundary = characterIndex + direction;
                    continue;
                }
                inWord = true;
                category = nextCategory;
                continue;
            }

            if (category === nextCategory) {
                continue;
            }

            if (category === "lower" &&
                    nextCategory === "upper" &&
                    direction < 0) {
                characterIndex--;
            } else if (category === "upper" &&
                    nextCategory === "lower" &&
                    direction > 0) {
                if (characterIndex === boundary + 1) {
                    category = "lower";
                    continue;
                }
                characterIndex--;
            }
            boundary = characterIndex;
            break;
        }

        if (inWord && boundary === start.ch) {
            boundary = edge;
        }
        return _position(CodeMirror, start.line, boundary);
    }

    function _moveSubword(CodeMirror, editor, direction) {
        const extending = Boolean(
            editor.state && editor.state.shift ||
            typeof editor.getExtending === "function" && editor.getExtending()
        );
        editor.extendSelectionsBy(function (range) {
            if (!extending && !range.empty()) {
                return direction < 0 ? range.from() : range.to();
            }
            return _findSubword(CodeMirror, editor, range.head, direction);
        }, {
            origin: "+move"
        });
    }

    function _scrollLine(editor, direction) {
        const scrollInfo = editor.getScrollInfo();
        if (!editor.somethingSelected()) {
            const boundaryLine = direction < 0 ?
                editor.lineAtHeight(
                    scrollInfo.top + scrollInfo.clientHeight,
                    "local"
                ) :
                editor.lineAtHeight(scrollInfo.top, "local") + 1;
            const cursorLine = editor.getCursor().line;
            if (direction < 0 ?
                cursorLine >= boundaryLine :
                cursorLine <= boundaryLine) {
                editor.execCommand(direction < 0 ? "goLineUp" : "goLineDown");
            }
        }
        editor.scrollTo(
            null,
            scrollInfo.top + direction * editor.defaultTextHeight()
        );
    }

    function _insertLine(CodeMirror, editor, above) {
        if (editor.isReadOnly()) {
            return CodeMirror.Pass;
        }

        const selectedLines = [];
        editor.listSelections().forEach(function (range) {
            if (selectedLines.indexOf(range.head.line) === -1) {
                selectedLines.push(range.head.line);
            }
        });
        selectedLines.sort(function (left, right) {
            return left - right;
        });

        const cursors = [];
        editor.operation(function () {
            selectedLines.forEach(function (originalLine, insertionIndex) {
                const line = originalLine + insertionIndex;
                let insertionPosition;
                let cursorPosition;

                if (above) {
                    insertionPosition = _position(CodeMirror, line, 0);
                    cursorPosition = insertionPosition;
                    editor.replaceRange(
                        "\n",
                        insertionPosition,
                        insertionPosition,
                        "+insertLine"
                    );
                } else if (line < editor.lastLine()) {
                    insertionPosition = _position(CodeMirror, line + 1, 0);
                    cursorPosition = insertionPosition;
                    editor.replaceRange(
                        "\n",
                        insertionPosition,
                        insertionPosition,
                        "+insertLine"
                    );
                } else {
                    insertionPosition = _position(
                        CodeMirror,
                        line,
                        (editor.getLine(line) || "").length
                    );
                    cursorPosition = _position(CodeMirror, line + 1, 0);
                    editor.replaceRange(
                        "\n",
                        insertionPosition,
                        insertionPosition,
                        "+insertLine"
                    );
                }
                cursors.push({
                    anchor: cursorPosition,
                    head: cursorPosition
                });
            });

            editor.setSelections(cursors, cursors.length - 1, {
                scroll: false
            });
            editor.indentSelection("smart");
        });
    }

    function _selectionLineSpan(range) {
        const from = range.from();
        const to = range.to();
        let end = to.line;
        if (!range.empty() && to.ch === 0 && end > from.line) {
            end--;
        }
        return {
            start: from.line,
            end: end
        };
    }

    function _lineBlocks(ranges) {
        const blocks = ranges.map(_selectionLineSpan).sort(function (left, right) {
            return left.start - right.start || left.end - right.end;
        });
        const merged = [];

        blocks.forEach(function (block) {
            const previous = merged[merged.length - 1];
            if (previous && block.start <= previous.end + 1) {
                previous.end = Math.max(previous.end, block.end);
            } else {
                merged.push({
                    start: block.start,
                    end: block.end
                });
            }
        });
        return merged;
    }

    function _replaceWholeLines(CodeMirror, editor, start, end, lines, origin) {
        const lastLine = editor.lastLine();
        const reachesDocumentEnd = end >= lastLine;
        const to = reachesDocumentEnd ?
            _position(
                CodeMirror,
                lastLine,
                (editor.getLine(lastLine) || "").length
            ) :
            _position(CodeMirror, end + 1, 0);
        const replacement = lines.join("\n") + (reachesDocumentEnd ? "" : "\n");
        editor.replaceRange(
            replacement,
            _position(CodeMirror, start, 0),
            to,
            origin
        );
    }

    function _swapLines(CodeMirror, editor, direction) {
        if (editor.isReadOnly()) {
            return CodeMirror.Pass;
        }

        const selections = editor.listSelections();
        const blocks = _lineBlocks(selections);
        const movableBlocks = blocks.filter(function (block) {
            return direction < 0 ?
                block.start > editor.firstLine() :
                block.end < editor.lastLine();
        });
        const orderedBlocks = direction < 0 ?
            movableBlocks :
            movableBlocks.slice().reverse();

        editor.operation(function () {
            orderedBlocks.forEach(function (block) {
                const neighborLine = direction < 0 ?
                    block.start - 1 :
                    block.end + 1;
                const blockLines = [];
                for (let line = block.start; line <= block.end; line++) {
                    blockLines.push(editor.getLine(line) || "");
                }
                const replacement = direction < 0 ?
                    blockLines.concat(editor.getLine(neighborLine) || "") :
                    [editor.getLine(neighborLine) || ""].concat(blockLines);
                _replaceWholeLines(
                    CodeMirror,
                    editor,
                    Math.min(neighborLine, block.start),
                    Math.max(neighborLine, block.end),
                    replacement,
                    "+swapLine"
                );
            });

            const movedSelections = selections.map(function (range) {
                const span = _selectionLineSpan(range);
                const block = movableBlocks.find(function (candidate) {
                    return span.start >= candidate.start &&
                        span.end <= candidate.end;
                });
                const offset = block ? direction : 0;
                return {
                    anchor: _position(
                        CodeMirror,
                        range.anchor.line + offset,
                        range.anchor.ch
                    ),
                    head: _position(
                        CodeMirror,
                        range.head.line + offset,
                        range.head.ch
                    )
                };
            });
            editor.setSelections(movedSelections, undefined, {
                scroll: false
            });
            editor.scrollIntoView();
        });
    }

    function _selectBetweenBrackets(CodeMirror, editor) {
        const matchingBracket = {
            "(": ")",
            "[": "]",
            "{": "}",
            "<": ">"
        };
        const nextSelections = [];

        for (const range of editor.listSelections()) {
            let opening = editor.scanForBracket(range.head, -1);
            if (!opening) {
                return false;
            }

            let scanPosition = range.head;
            while (opening) {
                const closing = editor.scanForBracket(scanPosition, 1);
                if (!closing) {
                    return false;
                }
                if (closing.ch === matchingBracket[opening.ch]) {
                    const start = _position(
                        CodeMirror,
                        opening.pos.line,
                        opening.pos.ch + 1
                    );
                    if (_samePosition(CodeMirror, start, range.from()) &&
                            _samePosition(CodeMirror, closing.pos, range.to())) {
                        opening = editor.scanForBracket(opening.pos, -1);
                        scanPosition = closing.pos;
                        continue;
                    }
                    nextSelections.push({
                        anchor: start,
                        head: closing.pos
                    });
                    break;
                }
                scanPosition = _position(
                    CodeMirror,
                    closing.pos.line,
                    closing.pos.ch + 1
                );
            }
            if (!opening) {
                return false;
            }
        }

        editor.setSelections(nextSelections);
        return true;
    }

    function _joinLines(CodeMirror, editor) {
        if (editor.isReadOnly()) {
            return CodeMirror.Pass;
        }

        const blocks = _lineBlocks(editor.listSelections()).reverse();
        editor.operation(function () {
            blocks.forEach(function (block) {
                const lastJoinLine = Math.min(block.end, editor.lastLine() - 1);
                for (let line = lastJoinLine; line >= block.start; line--) {
                    const nextLine = editor.getLine(line + 1) || "";
                    const indentation = (nextLine.match(/^\s*/) || [""])[0].length;
                    editor.replaceRange(
                        " ",
                        _position(
                            CodeMirror,
                            line,
                            (editor.getLine(line) || "").length
                        ),
                        _position(CodeMirror, line + 1, indentation),
                        "+joinLines"
                    );
                }
            });
        });
    }

    function _duplicateSelections(CodeMirror, editor) {
        if (editor.isReadOnly()) {
            return CodeMirror.Pass;
        }

        const selections = editor.listSelections().slice().sort(function (left, right) {
            return CodeMirror.cmpPos(right.from(), left.from());
        });
        editor.operation(function () {
            selections.forEach(function (range) {
                if (range.empty()) {
                    editor.replaceRange(
                        (editor.getLine(range.head.line) || "") + "\n",
                        _position(CodeMirror, range.head.line, 0),
                        undefined,
                        "+duplicateLine"
                    );
                } else {
                    editor.replaceRange(
                        editor.getRange(range.from(), range.to()),
                        range.from(),
                        undefined,
                        "+duplicateLine"
                    );
                }
            });
            editor.scrollIntoView();
        });
    }

    function _sortLines(CodeMirror, editor, caseSensitive, direction) {
        if (editor.isReadOnly()) {
            return CodeMirror.Pass;
        }

        const selections = editor.listSelections();
        const selectedBlocks = _lineBlocks(selections.filter(function (range) {
            return !range.empty();
        }));
        const blocks = selectedBlocks.length ? selectedBlocks : [{
            start: editor.firstLine(),
            end: editor.lastLine()
        }];

        editor.operation(function () {
            blocks.slice().reverse().forEach(function (block) {
                const start = _position(CodeMirror, block.start, 0);
                const end = _position(CodeMirror, block.end);
                const lines = editor.getRange(start, end, false);
                lines.sort(function (left, right) {
                    let comparableLeft = left;
                    let comparableRight = right;
                    if (!caseSensitive) {
                        comparableLeft = comparableLeft.toUpperCase();
                        comparableRight = comparableRight.toUpperCase();
                    }
                    if (comparableLeft < comparableRight) {
                        return -direction;
                    }
                    if (comparableLeft > comparableRight) {
                        return direction;
                    }
                    return 0;
                });
                editor.replaceRange(
                    lines.join("\n"),
                    start,
                    end,
                    "+sortLines"
                );
            });

            if (selectedBlocks.length) {
                editor.setSelections(selectedBlocks.map(function (block) {
                    return {
                        anchor: _position(CodeMirror, block.start, 0),
                        head: editor.clipPos(
                            _position(CodeMirror, block.end + 1, 0)
                        )
                    };
                }), 0);
            }
        });
    }

    function _bookmarkRanges(editor) {
        const state = editor.state;
        const marks = state.sublimeBookmarks || [];
        state.sublimeBookmarks = marks.filter(function (mark) {
            return Boolean(mark && mark.find());
        });
        return state.sublimeBookmarks;
    }

    function _modifyWordOrSelection(CodeMirror, editor, transform) {
        if (editor.isReadOnly()) {
            return CodeMirror.Pass;
        }

        const changes = editor.listSelections().map(function (range) {
            const target = range.empty() ?
                _wordAt(CodeMirror, editor, range.head) :
                {
                    from: range.from(),
                    to: range.to(),
                    word: editor.getRange(range.from(), range.to())
                };
            return {
                from: target.from,
                to: target.to,
                replacement: transform(target.word)
            };
        }).filter(function (change, index, allChanges) {
            return change.from && change.to &&
                allChanges.findIndex(function (candidate) {
                    return _samePosition(CodeMirror, candidate.from, change.from) &&
                        _samePosition(CodeMirror, candidate.to, change.to);
                }) === index;
        }).sort(function (left, right) {
            return CodeMirror.cmpPos(right.from, left.from);
        });

        editor.operation(function () {
            changes.forEach(function (change) {
                editor.replaceRange(
                    change.replacement,
                    change.from,
                    change.to,
                    "case"
                );
            });
        });
    }

    function _findTarget(CodeMirror, editor) {
        let from = editor.getCursor("from");
        let to = editor.getCursor("to");
        let word;
        if (_samePosition(CodeMirror, from, to)) {
            word = _wordAt(CodeMirror, editor, from);
            if (!word.word) {
                return null;
            }
            from = word.from;
            to = word.to;
        }
        return {
            from: from,
            to: to,
            query: editor.getRange(from, to),
            word: word
        };
    }

    function _findAndSelect(CodeMirror, editor, forward) {
        const target = _findTarget(CodeMirror, editor);
        if (!target) {
            return;
        }

        let cursor = editor.getSearchCursor(
            target.query,
            forward ? target.to : target.from
        );
        let found = forward ? cursor.findNext() : cursor.findPrevious();
        if (!found) {
            cursor = editor.getSearchCursor(
                target.query,
                forward ?
                    _position(CodeMirror, editor.firstLine(), 0) :
                    editor.clipPos(_position(CodeMirror, editor.lastLine()))
            );
            found = forward ? cursor.findNext() : cursor.findPrevious();
        }
        if (found) {
            editor.setSelection(cursor.from(), cursor.to());
        } else if (target.word) {
            editor.setSelection(target.from, target.to);
        }
    }

    function _defineCommands(CodeMirror) {
        const commands = CodeMirror.commands;

        commands.goSubwordLeft = function (editor) {
            return _moveSubword(CodeMirror, editor, -1);
        };
        commands.goSubwordRight = function (editor) {
            return _moveSubword(CodeMirror, editor, 1);
        };
        commands.scrollLineUp = function (editor) {
            return _scrollLine(editor, -1);
        };
        commands.scrollLineDown = function (editor) {
            return _scrollLine(editor, 1);
        };
        commands.splitSelectionByLine = function (editor) {
            return editor.splitSelectionByLine();
        };
        commands.singleSelectionTop = function (editor) {
            const selection = editor.listSelections()[0];
            if (selection) {
                editor.setSelection(selection.anchor, selection.head, {
                    scroll: false
                });
            }
        };
        commands.selectLine = function (editor) {
            editor.setSelections(editor.listSelections().map(function (range) {
                return {
                    anchor: _position(CodeMirror, range.from().line, 0),
                    head: editor.clipPos(
                        _position(CodeMirror, range.to().line + 1, 0)
                    )
                };
            }));
        };
        commands.insertLineAfter = function (editor) {
            return _insertLine(CodeMirror, editor, false);
        };
        commands.insertLineBefore = function (editor) {
            return _insertLine(CodeMirror, editor, true);
        };
        commands.selectNextOccurrence = function (editor) {
            let from = editor.getCursor("from");
            let to = editor.getCursor("to");
            let query = editor.getRange(from, to);
            let fullWord = editor.state.sublimeFindFullWord === query && Boolean(query);

            if (_samePosition(CodeMirror, from, to)) {
                const word = _wordAt(CodeMirror, editor, from);
                if (!word.word) {
                    return;
                }
                editor.setSelection(word.from, word.to);
                editor.state.sublimeFindFullWord = word.word;
                return;
            }

            query = editor.getRange(from, to);
            fullWord = fullWord && Boolean(query);
            const searchQuery = fullWord ?
                new RegExp("\\b" + _escapeRegExp(query) + "\\b") :
                query;
            let cursor = editor.getSearchCursor(searchQuery, to);
            let found = cursor.findNext();
            if (!found) {
                cursor = editor.getSearchCursor(
                    searchQuery,
                    _position(CodeMirror, editor.firstLine(), 0)
                );
                found = cursor.findNext();
            }
            if (!found || _rangeIsSelected(
                CodeMirror,
                editor.listSelections(),
                cursor.from(),
                cursor.to()
            )) {
                return;
            }
            editor.addSelection(cursor.from(), cursor.to());
            editor.state.sublimeFindFullWord = fullWord ? query : null;
        };
        commands.skipAndSelectNextOccurrence = function (editor) {
            const previous = {
                anchor: editor.getCursor("anchor"),
                head: editor.getCursor("head")
            };
            if (_samePosition(CodeMirror, previous.anchor, previous.head)) {
                commands.selectNextOccurrence(editor);
                return;
            }
            commands.selectNextOccurrence(editor);
            const remaining = editor.listSelections().filter(function (range) {
                return !(
                    _samePosition(CodeMirror, range.anchor, previous.anchor) &&
                    _samePosition(CodeMirror, range.head, previous.head)
                );
            });
            if (remaining.length) {
                editor.setSelections(remaining);
            }
        };

        function addCursorToLine(editor, direction) {
            const newSelections = [];
            editor.listSelections().forEach(function (range) {
                const anchor = editor.findPosV(
                    range.anchor,
                    direction,
                    "line",
                    range.anchor.goalColumn
                );
                const head = editor.findPosV(
                    range.head,
                    direction,
                    "line",
                    range.head.goalColumn
                );
                newSelections.push(range);
                newSelections.push({
                    anchor: anchor,
                    head: head
                });
            });
            editor.setSelections(newSelections);
        }

        commands.addCursorToPrevLine = function (editor) {
            return addCursorToLine(editor, -1);
        };
        commands.addCursorToNextLine = function (editor) {
            return addCursorToLine(editor, 1);
        };
        commands.selectScope = function (editor) {
            if (!_selectBetweenBrackets(CodeMirror, editor)) {
                return commands.selectAll(editor);
            }
        };
        commands.selectBetweenBrackets = function (editor) {
            if (!_selectBetweenBrackets(CodeMirror, editor)) {
                return CodeMirror.Pass;
            }
        };
        commands.goToBracket = function (editor) {
            editor.extendSelectionsBy(function (range) {
                const forward = editor.scanForBracket(range.head, 1);
                if (forward &&
                        !_samePosition(CodeMirror, forward.pos, range.head)) {
                    return forward.pos;
                }
                const backward = editor.scanForBracket(range.head, -1);
                return backward ?
                    _position(
                        CodeMirror,
                        backward.pos.line,
                        backward.pos.ch + 1
                    ) :
                    range.head;
            }, {
                origin: "+move"
            });
        };
        commands.swapLineUp = function (editor) {
            return _swapLines(CodeMirror, editor, -1);
        };
        commands.swapLineDown = function (editor) {
            return _swapLines(CodeMirror, editor, 1);
        };
        commands.toggleCommentIndented = function (editor) {
            if (editor.isReadOnly()) {
                return CodeMirror.Pass;
            }
            return editor.toggleComment({indent: true});
        };
        commands.joinLines = function (editor) {
            return _joinLines(CodeMirror, editor);
        };
        commands.duplicateLine = function (editor) {
            return _duplicateSelections(CodeMirror, editor);
        };
        commands.sortLines = function (editor) {
            return _sortLines(CodeMirror, editor, true, 1);
        };
        commands.reverseSortLines = function (editor) {
            return _sortLines(CodeMirror, editor, true, -1);
        };
        commands.sortLinesInsensitive = function (editor) {
            return _sortLines(CodeMirror, editor, false, 1);
        };
        commands.reverseSortLinesInsensitive = function (editor) {
            return _sortLines(CodeMirror, editor, false, -1);
        };
        commands.nextBookmark = function (editor) {
            const marks = _bookmarkRanges(editor);
            for (let attempt = 0; attempt < marks.length; attempt++) {
                const mark = marks.shift();
                const found = mark.find();
                if (found) {
                    marks.push(mark);
                    editor.setSelection(found.from, found.to);
                    return;
                }
            }
        };
        commands.prevBookmark = function (editor) {
            const marks = _bookmarkRanges(editor);
            for (let attempt = 0; attempt < marks.length; attempt++) {
                const mark = marks.pop();
                const found = mark.find();
                if (found) {
                    marks.unshift(mark);
                    editor.setSelection(found.from, found.to);
                    return;
                }
            }
        };
        commands.toggleBookmark = function (editor) {
            const marks = _bookmarkRanges(editor);
            editor.listSelections().forEach(function (range) {
                const found = range.empty() ?
                    editor.findMarksAt(range.from()) :
                    editor.findMarks(range.from(), range.to());
                const bookmark = found.find(function (mark) {
                    return mark.sublimeBookmark;
                });
                if (bookmark) {
                    bookmark.clear();
                    const markIndex = marks.indexOf(bookmark);
                    if (markIndex !== -1) {
                        marks.splice(markIndex, 1);
                    }
                    return;
                }
                marks.push(editor.markText(range.from(), range.to(), {
                    sublimeBookmark: true,
                    clearWhenEmpty: false
                }));
            });
        };
        commands.clearBookmarks = function (editor) {
            const marks = _bookmarkRanges(editor);
            marks.slice().forEach(function (mark) {
                mark.clear();
            });
            marks.length = 0;
        };
        commands.selectBookmarks = function (editor) {
            const ranges = _bookmarkRanges(editor).map(function (mark) {
                const found = mark.find();
                return found ? {
                    anchor: found.from,
                    head: found.to
                } : null;
            }).filter(Boolean);
            if (ranges.length) {
                editor.setSelections(ranges, 0);
            }
        };
        commands.smartBackspace = function (editor) {
            if (editor.somethingSelected()) {
                return CodeMirror.Pass;
            }
            if (editor.isReadOnly()) {
                return CodeMirror.Pass;
            }

            const indentUnit = Math.max(1, editor.getOption("indentUnit") || 4);
            const tabSize = Math.max(1, editor.getOption("tabSize") || 4);
            const cursors = editor.listSelections().map(function (range) {
                return range.head;
            }).sort(function (left, right) {
                return CodeMirror.cmpPos(right, left);
            });
            editor.operation(function () {
                cursors.forEach(function (cursor) {
                    const before = editor.getRange(
                        _position(CodeMirror, cursor.line, 0),
                        cursor
                    );
                    const column = CodeMirror.countColumn(before, null, tabSize);
                    let deleteFrom = editor.findPosH(cursor, -1, "char", false);
                    if (before && !/\S/.test(before) &&
                            column % indentUnit === 0) {
                        const previousColumn = Math.max(0, column - indentUnit);
                        const previousCharacter = CodeMirror.findColumn(
                            before,
                            previousColumn,
                            tabSize
                        );
                        if (previousCharacter !== cursor.ch) {
                            deleteFrom = _position(
                                CodeMirror,
                                cursor.line,
                                previousCharacter
                            );
                        }
                    }
                    editor.replaceRange(
                        "",
                        deleteFrom,
                        cursor,
                        "+delete"
                    );
                });
            });
        };
        commands.delLineRight = function (editor) {
            if (editor.isReadOnly()) {
                return CodeMirror.Pass;
            }
            const ranges = editor.listSelections().slice().sort(function (left, right) {
                return CodeMirror.cmpPos(right.anchor, left.anchor);
            });
            editor.operation(function () {
                ranges.forEach(function (range) {
                    const targetLine = range.to().line;
                    editor.replaceRange(
                        "",
                        range.anchor,
                        _position(
                            CodeMirror,
                            targetLine,
                            (editor.getLine(targetLine) || "").length
                        ),
                        "+delete"
                    );
                });
                editor.scrollIntoView();
            });
        };
        commands.upcaseAtCursor = function (editor) {
            return _modifyWordOrSelection(
                CodeMirror,
                editor,
                function (text) {
                    return text.toUpperCase();
                }
            );
        };
        commands.downcaseAtCursor = function (editor) {
            return _modifyWordOrSelection(
                CodeMirror,
                editor,
                function (text) {
                    return text.toLowerCase();
                }
            );
        };
        commands.setSublimeMark = function (editor) {
            if (editor.state.sublimeMark) {
                editor.state.sublimeMark.clear();
            }
            editor.state.sublimeMark = editor.setBookmark(editor.getCursor());
        };
        commands.selectToSublimeMark = function (editor) {
            const found = editor.state.sublimeMark &&
                editor.state.sublimeMark.find();
            if (found) {
                editor.setSelection(editor.getCursor(), found);
            }
        };
        commands.deleteToSublimeMark = function (editor) {
            if (editor.isReadOnly()) {
                return CodeMirror.Pass;
            }
            const found = editor.state.sublimeMark &&
                editor.state.sublimeMark.find();
            if (!found) {
                return;
            }
            let from = editor.getCursor();
            let to = found;
            if (CodeMirror.cmpPos(from, to) > 0) {
                const swap = from;
                from = to;
                to = swap;
            }
            editor.state.sublimeKilled = editor.getRange(from, to);
            editor.replaceRange("", from, to, "+delete");
        };
        commands.swapWithSublimeMark = function (editor) {
            const found = editor.state.sublimeMark &&
                editor.state.sublimeMark.find();
            if (!found) {
                return;
            }
            editor.state.sublimeMark.clear();
            editor.state.sublimeMark = editor.setBookmark(editor.getCursor());
            editor.setCursor(found);
        };
        commands.sublimeYank = function (editor) {
            if (editor.isReadOnly()) {
                return CodeMirror.Pass;
            }
            if (editor.state.sublimeKilled !== undefined) {
                editor.replaceSelection(
                    editor.state.sublimeKilled,
                    null,
                    "paste"
                );
            }
        };
        commands.showInCenter = function (editor) {
            const coordinates = editor.cursorCoords(null, "local");
            const scrollInfo = editor.getScrollInfo();
            editor.scrollTo(
                null,
                (coordinates.top + coordinates.bottom) / 2 -
                    scrollInfo.clientHeight / 2
            );
        };
        commands.findUnder = function (editor) {
            return _findAndSelect(CodeMirror, editor, true);
        };
        commands.findUnderPrevious = function (editor) {
            return _findAndSelect(CodeMirror, editor, false);
        };
        commands.findAllUnder = function (editor) {
            const target = _findTarget(CodeMirror, editor);
            if (!target) {
                return;
            }
            const cursor = editor.getSearchCursor(target.query);
            const matches = [];
            let primaryIndex = 0;
            while (cursor.findNext()) {
                const match = {
                    anchor: cursor.from(),
                    head: cursor.to()
                };
                if (CodeMirror.cmpPos(match.anchor, target.from) <= 0) {
                    primaryIndex = matches.length;
                }
                matches.push(match);
            }
            if (matches.length) {
                editor.setSelections(matches, primaryIndex);
            }
        };
    }

    function _defineKeyMaps(CodeMirror) {
        const keyMap = CodeMirror.keyMap;
        keyMap.macSublime = {
            "Cmd-Left": "goLineStartSmart",
            "Shift-Tab": "indentLess",
            "Shift-Ctrl-K": "deleteLine",
            "Alt-Q": "wrapLines",
            "Ctrl-Left": "goSubwordLeft",
            "Ctrl-Right": "goSubwordRight",
            "Ctrl-Alt-Up": "scrollLineUp",
            "Ctrl-Alt-Down": "scrollLineDown",
            "Cmd-L": "selectLine",
            "Shift-Cmd-L": "splitSelectionByLine",
            "Esc": "singleSelectionTop",
            "Cmd-Enter": "insertLineAfter",
            "Shift-Cmd-Enter": "insertLineBefore",
            "Cmd-D": "selectNextOccurrence",
            "Shift-Cmd-Space": "selectScope",
            "Shift-Cmd-M": "selectBetweenBrackets",
            "Cmd-M": "goToBracket",
            "Cmd-Ctrl-Up": "swapLineUp",
            "Cmd-Ctrl-Down": "swapLineDown",
            "Cmd-/": "toggleCommentIndented",
            "Cmd-J": "joinLines",
            "Shift-Cmd-D": "duplicateLine",
            F5: "sortLines",
            "Shift-F5": "reverseSortLines",
            "Cmd-F5": "sortLinesInsensitive",
            "Shift-Cmd-F5": "reverseSortLinesInsensitive",
            F2: "nextBookmark",
            "Shift-F2": "prevBookmark",
            "Cmd-F2": "toggleBookmark",
            "Shift-Cmd-F2": "clearBookmarks",
            "Alt-F2": "selectBookmarks",
            Backspace: "smartBackspace",
            "Cmd-K Cmd-D": "skipAndSelectNextOccurrence",
            "Cmd-K Cmd-K": "delLineRight",
            "Cmd-K Cmd-U": "upcaseAtCursor",
            "Cmd-K Cmd-L": "downcaseAtCursor",
            "Cmd-K Cmd-Space": "setSublimeMark",
            "Cmd-K Cmd-A": "selectToSublimeMark",
            "Cmd-K Cmd-W": "deleteToSublimeMark",
            "Cmd-K Cmd-X": "swapWithSublimeMark",
            "Cmd-K Cmd-Y": "sublimeYank",
            "Cmd-K Cmd-C": "showInCenter",
            "Cmd-K Cmd-G": "clearBookmarks",
            "Cmd-K Cmd-Backspace": "delLineLeft",
            "Cmd-K Cmd-1": "foldAll",
            "Cmd-K Cmd-0": "unfoldAll",
            "Cmd-K Cmd-J": "unfoldAll",
            "Ctrl-Shift-Up": "addCursorToPrevLine",
            "Ctrl-Shift-Down": "addCursorToNextLine",
            "Cmd-F3": "findUnder",
            "Shift-Cmd-F3": "findUnderPrevious",
            "Alt-F3": "findAllUnder",
            "Shift-Cmd-[": "fold",
            "Shift-Cmd-]": "unfold",
            "Cmd-I": "findIncremental",
            "Shift-Cmd-I": "findIncrementalReverse",
            "Cmd-H": "replace",
            F3: "findNext",
            "Shift-F3": "findPrev",
            fallthrough: "macDefault"
        };
        CodeMirror.normalizeKeyMap(keyMap.macSublime);

        keyMap.pcSublime = {
            "Shift-Tab": "indentLess",
            "Shift-Ctrl-K": "deleteLine",
            "Alt-Q": "wrapLines",
            "Ctrl-T": "transposeChars",
            "Alt-Left": "goSubwordLeft",
            "Alt-Right": "goSubwordRight",
            "Ctrl-Up": "scrollLineUp",
            "Ctrl-Down": "scrollLineDown",
            "Ctrl-L": "selectLine",
            "Shift-Ctrl-L": "splitSelectionByLine",
            Esc: "singleSelectionTop",
            "Ctrl-Enter": "insertLineAfter",
            "Shift-Ctrl-Enter": "insertLineBefore",
            "Ctrl-D": "selectNextOccurrence",
            "Shift-Ctrl-Space": "selectScope",
            "Shift-Ctrl-M": "selectBetweenBrackets",
            "Ctrl-M": "goToBracket",
            "Shift-Ctrl-Up": "swapLineUp",
            "Shift-Ctrl-Down": "swapLineDown",
            "Ctrl-/": "toggleCommentIndented",
            "Ctrl-J": "joinLines",
            "Shift-Ctrl-D": "duplicateLine",
            F9: "sortLines",
            "Shift-F9": "reverseSortLines",
            "Ctrl-F9": "sortLinesInsensitive",
            "Shift-Ctrl-F9": "reverseSortLinesInsensitive",
            F2: "nextBookmark",
            "Shift-F2": "prevBookmark",
            "Ctrl-F2": "toggleBookmark",
            "Shift-Ctrl-F2": "clearBookmarks",
            "Alt-F2": "selectBookmarks",
            Backspace: "smartBackspace",
            "Ctrl-K Ctrl-D": "skipAndSelectNextOccurrence",
            "Ctrl-K Ctrl-K": "delLineRight",
            "Ctrl-K Ctrl-U": "upcaseAtCursor",
            "Ctrl-K Ctrl-L": "downcaseAtCursor",
            "Ctrl-K Ctrl-Space": "setSublimeMark",
            "Ctrl-K Ctrl-A": "selectToSublimeMark",
            "Ctrl-K Ctrl-W": "deleteToSublimeMark",
            "Ctrl-K Ctrl-X": "swapWithSublimeMark",
            "Ctrl-K Ctrl-Y": "sublimeYank",
            "Ctrl-K Ctrl-C": "showInCenter",
            "Ctrl-K Ctrl-G": "clearBookmarks",
            "Ctrl-K Ctrl-Backspace": "delLineLeft",
            "Ctrl-K Ctrl-1": "foldAll",
            "Ctrl-K Ctrl-0": "unfoldAll",
            "Ctrl-K Ctrl-J": "unfoldAll",
            "Ctrl-Alt-Up": "addCursorToPrevLine",
            "Ctrl-Alt-Down": "addCursorToNextLine",
            "Ctrl-F3": "findUnder",
            "Shift-Ctrl-F3": "findUnderPrevious",
            "Alt-F3": "findAllUnder",
            "Shift-Ctrl-[": "fold",
            "Shift-Ctrl-]": "unfold",
            "Ctrl-I": "findIncremental",
            "Shift-Ctrl-I": "findIncrementalReverse",
            "Ctrl-H": "replace",
            F3: "findNext",
            "Shift-F3": "findPrev",
            fallthrough: "pcDefault"
        };
        CodeMirror.normalizeKeyMap(keyMap.pcSublime);

        keyMap.sublime = keyMap.default === keyMap.macDefault ?
            keyMap.macSublime :
            keyMap.pcSublime;
    }

    /**
     * Installs Sublime-compatible commands and keymaps on a CodeMirror facade.
     * @param {!Function} CodeMirror CM6-backed CodeMirror compatibility facade
     * @return {!Function} The installed facade
     */
    function install(CodeMirror) {
        if (!CodeMirror || !CodeMirror.commands || !CodeMirror.keyMap) {
            throw new TypeError("A CodeMirror compatibility facade is required.");
        }
        if (installedFacades.has(CodeMirror)) {
            return CodeMirror;
        }

        _defineCommands(CodeMirror);
        _defineKeyMaps(CodeMirror);
        installedFacades.add(CodeMirror);
        return CodeMirror;
    }

    module.exports = {
        install: install
    };
});
