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

/**
 * CodeMirror 6 editing surface with the compatibility contracts Phoenix
 * historically consumed from the previous editor surface.
 *
 * EditorView.state.doc is the only live text model. Compatibility state kept
 * here is metadata only (events, marks, line handles, options, and history).
 */
define(function (require, exports, module) {

    const CodeMirror = require("editor/CodeMirrorCompat"),
        CM6 = require("thirdparty/CodeMirror6/codemirror6");

    const DEFAULT_LINE_HEIGHT = 15;
    const DEFAULT_CHARACTER_WIDTH = 8;
    const HORIZONTAL_SCROLL_MARGIN = 10;
    const LEGACY_SCROLLER_GAP = 30;
    const LINE_NUMBER_GUTTER = "CodeMirror-linenumbers";
    const LEGACY_CLOSE_BRACKET_DEFAULTS = {
        pairs: "()[]{}''\"\"",
        closeBefore: ")]}'\":;>",
        triples: "",
        explode: "[]{}"
    };
    const LEGACY_SELECTION_MATCH_DEFAULTS = {
        annotateScrollbar: false,
        delay: 100,
        minChars: 2,
        showToken: false,
        style: "matchhighlight",
        trim: true,
        wordsOnly: false
    };
    const LEGACY_UPDATE_OPTIONS = new Set([
        "addModeClass",
        "direction",
        "firstLineNumber",
        "gutters",
        "indentUnit",
        "lineNumberFormatter",
        "lineNumbers",
        "lineWrapping",
        "mode",
        "scrollPastEnd",
        "styleActiveLine",
        "tabSize",
        "theme"
    ]);

    function _clamp(value, min, max) {
        return Math.max(min, Math.min(value, max));
    }

    function _indentUnitText(options) {
        const tabSize = Math.max(1, Number(options.tabSize) || 4);
        const indentUnit = Math.max(1, Number(options.indentUnit) || tabSize);
        if (!options.indentWithTabs) {
            return " ".repeat(indentUnit);
        }

        if (indentUnit % tabSize !== 0) {
            // CM6 requires an indent unit to contain only one whitespace
            // character. Spaces preserve the requested column width until a
            // matching tab size is applied.
            return " ".repeat(indentUnit);
        }
        return "\t".repeat(indentUnit / tabSize);
    }

    function _drawSelectionExtension(options) {
        const configuredBlinkRate = Number(options.cursorBlinkRate);
        return CM6.drawSelection({
            cursorBlinkRate: Number.isFinite(configuredBlinkRate) ?
                configuredBlinkRate :
                530,
            drawRangeCursor: Boolean(options.showCursorWhenSelecting)
        });
    }

    function _legacyCloseBracketOption(configuration, name) {
        if (name === "pairs" && typeof configuration === "string") {
            return configuration;
        }
        if (configuration && typeof configuration === "object" &&
                configuration[name] !== null &&
                configuration[name] !== undefined) {
            return configuration[name];
        }
        return LEGACY_CLOSE_BRACKET_DEFAULTS[name];
    }

    function _legacyCloseBracketConfigurationAt(adapter, position) {
        const configured = adapter.getOption("autoCloseBrackets");
        if (!configured ||
                typeof configured === "object" && configured.override) {
            return configured;
        }
        const mode = adapter.getModeAt(position || adapter.getCursor());
        return mode && mode.closeBrackets || configured;
    }

    function _closeBracketsExtension(adapter, value) {
        if (!value) {
            return [];
        }
        return CM6.EditorView.inputHandler.of(function (view, from, to, insert) {
            const selection = view.state.selection.main;
            if (view.composing || view.compositionStarted ||
                    view.state.readOnly ||
                    insert.length !== 1 ||
                    from !== selection.from ||
                    to !== selection.to) {
                return false;
            }
            return adapter._handleAutoCloseBracketCharacter(insert);
        });
    }

    function _selectionMatchOptions(value) {
        const supplied = value && typeof value === "object" ? value : {};
        const options = {};
        Object.keys(LEGACY_SELECTION_MATCH_DEFAULTS).forEach(function (name) {
            options[name] = Object.prototype.hasOwnProperty.call(supplied, name) ?
                supplied[name] :
                LEGACY_SELECTION_MATCH_DEFAULTS[name];
        });
        return options;
    }

    function _matchesSelectionWordCharacter(expression, character) {
        expression.lastIndex = 0;
        return expression.test(character);
    }

    function _selectionMatchQuery(state, options) {
        const range = state.selection.main;
        if (range.empty) {
            if (!options.showToken) {
                return null;
            }
            const expression = options.showToken === true ?
                /[\w$]/ :
                options.showToken;
            if (!expression || typeof expression.test !== "function") {
                return null;
            }
            const line = state.doc.lineAt(range.head);
            let start = range.head - line.from;
            let end = start;
            while (start &&
                    _matchesSelectionWordCharacter(
                        expression,
                        line.text.charAt(start - 1)
                    )) {
                start--;
            }
            while (end < line.length &&
                    _matchesSelectionWordCharacter(
                        expression,
                        line.text.charAt(end)
                    )) {
                end++;
            }
            if (start === end) {
                return null;
            }
            return {
                boundaryExpression: expression,
                text: line.text.slice(start, end)
            };
        }

        const fromLine = state.doc.lineAt(range.from);
        const toLine = state.doc.lineAt(range.to);
        if (fromLine.number !== toLine.number) {
            return null;
        }
        const selectedText = state.sliceDoc(range.from, range.to);
        if (options.wordsOnly) {
            if (!/^\w+$/.test(selectedText)) {
                return null;
            }
            if (range.from > fromLine.from &&
                    /\w/.test(state.sliceDoc(range.from - 1, range.from))) {
                return null;
            }
            if (range.to < fromLine.to &&
                    /\w/.test(state.sliceDoc(range.to, range.to + 1))) {
                return null;
            }
        }
        const query = options.trim ?
            selectedText.replace(/^\s+|\s+$/g, "") :
            selectedText;
        return query.length >= Number(options.minChars) ? {
            boundaryExpression: null,
            text: query
        } : null;
    }

    function _selectionMatchScrollbarQuery(query) {
        if (!query || !query.text || !query.boundaryExpression) {
            return query && query.text;
        }
        const escaped = query.text.replace(/[\\[\].+*?(){|^$]/g, "\\$&");
        return new RegExp(
            (/\w/.test(query.text.charAt(0)) ? "\\b" : "") +
                escaped +
                (/\w/.test(query.text.charAt(query.text.length - 1)) ?
                    "\\b" :
                    "")
        );
    }

    function _selectionMatchExtension(adapter, value) {
        if (!value) {
            return [];
        }
        const options = _selectionMatchOptions(value);
        const className = String(options.style || "matchhighlight")
            .split(/\s+/)
            .filter(Boolean)
            .map(function (style) {
                return `cm-${style}`;
            })
            .join(" ");
        const decoration = CM6.Decoration.mark({
            class: className || "cm-matchhighlight"
        });
        const refreshEffect = CM6.StateEffect["define"]();

        function decorationsForView(view, query) {
            if (!query || !query.text) {
                return CM6.Decoration.none;
            }
            const ranges = [];
            const seenLines = new Set();
            view.visibleRanges.forEach(function (visibleRange) {
                let line = view.state.doc.lineAt(visibleRange.from);
                while (line.from <= visibleRange.to) {
                    if (!seenLines.has(line.number)) {
                        seenLines.add(line.number);
                        let index = line.text.indexOf(query.text);
                        while (index !== -1) {
                            const end = index + query.text.length;
                            const beforeMatches = index > 0 &&
                                query.boundaryExpression &&
                                _matchesSelectionWordCharacter(
                                    query.boundaryExpression,
                                    line.text.charAt(index - 1)
                                );
                            const afterMatches = end < line.length &&
                                query.boundaryExpression &&
                                _matchesSelectionWordCharacter(
                                    query.boundaryExpression,
                                    line.text.charAt(end)
                                );
                            if (!beforeMatches && !afterMatches) {
                                ranges.push(decoration.range(
                                    line.from + index,
                                    line.from + end
                                ));
                            }
                            index = line.text.indexOf(
                                query.text,
                                index + query.text.length
                            );
                        }
                    }
                    if (line.number >= view.state.doc.lines) {
                        break;
                    }
                    line = view.state.doc.line(line.number + 1);
                }
            });
            return CM6.Decoration.set(ranges, true);
        }

        return CM6.ViewPlugin.fromClass(class {
            constructor(view) {
                this.active = view.hasFocus;
                this.decorations = CM6.Decoration.none;
                this.matchesOnScrollbar = null;
                this.timeout = null;
                if (this.active) {
                    this.schedule(view);
                }
            }

            refresh(view) {
                const query = _selectionMatchQuery(view.state, options);
                this.decorations = decorationsForView(view, query);
                if (this.matchesOnScrollbar) {
                    this.matchesOnScrollbar.clear();
                    this.matchesOnScrollbar = null;
                }
                if (options.annotateScrollbar && query && query.text) {
                    this.matchesOnScrollbar = adapter.showMatchesOnScrollbar(
                        _selectionMatchScrollbarQuery(query),
                        false,
                        {
                            className:
                                "CodeMirror-selection-highlight-scrollbar"
                        }
                    );
                }
            }

            schedule(view) {
                if (this.timeout !== null) {
                    window.clearTimeout(this.timeout);
                }
                const delay = Math.max(0, Number(options.delay) || 0);
                if (!delay) {
                    this.refresh(view);
                    return;
                }
                this.timeout = window.setTimeout(function () {
                    this.timeout = null;
                    if (view.dom.isConnected) {
                        view.dispatch({
                            effects: refreshEffect.of(null)
                        });
                    }
                }.bind(this), delay);
            }

            update(update) {
                const refreshRequested = update.transactions.some(function (transaction) {
                    return transaction.effects.some(function (effect) {
                        return effect.is(refreshEffect);
                    });
                });
                if (refreshRequested) {
                    this.refresh(update.view);
                    return;
                }
                if (update.focusChanged && update.view.hasFocus) {
                    this.active = true;
                }
                if ((this.active || update.view.hasFocus) && (
                    update.docChanged ||
                        update.selectionSet ||
                        update.viewportChanged ||
                        update.focusChanged
                )) {
                    this.decorations = update.docChanged ?
                        this.decorations.map(update.changes) :
                        this.decorations;
                    this.schedule(update.view);
                }
            }

            destroy() {
                if (this.timeout !== null) {
                    window.clearTimeout(this.timeout);
                    this.timeout = null;
                }
                if (this.matchesOnScrollbar) {
                    this.matchesOnScrollbar.clear();
                    this.matchesOnScrollbar = null;
                }
            }
        }, {
            decorations: function (plugin) {
                return plugin.decorations;
            }
        });
    }

    function _activeLineExtension(value) {
        if (!value) {
            return [];
        }
        const allowNonEmpty = typeof value === "object" &&
            Boolean(value.nonEmpty);
        const lineDecoration = CM6.Decoration.line({
            attributes: {
                class: "cm-activeLine"
            }
        });

        function activeLineStarts(state) {
            const starts = [];
            const seen = new Set();
            state.selection.ranges.forEach(function (range) {
                const anchorLine = state.doc.lineAt(range.anchor);
                const headLine = state.doc.lineAt(range.head);
                if (allowNonEmpty ?
                    anchorLine.number !== headLine.number :
                    !range.empty) {
                    return;
                }
                if (!seen.has(headLine.from)) {
                    seen.add(headLine.from);
                    starts.push(headLine.from);
                }
            });
            return starts;
        }

        const lineHighlighter = CM6.ViewPlugin.fromClass(class {
            constructor(view) {
                this.decorations = CM6.Decoration.set(
                    activeLineStarts(view.state).map(function (position) {
                        return lineDecoration.range(position);
                    })
                );
            }

            update(update) {
                if (update.docChanged || update.selectionSet) {
                    this.decorations = CM6.Decoration.set(
                        activeLineStarts(update.state).map(function (position) {
                            return lineDecoration.range(position);
                        })
                    );
                }
            }
        }, {
            decorations: function (plugin) {
                return plugin.decorations;
            }
        });
        const gutterHighlighter = CM6.gutterLineClass.compute(
            ["selection"],
            function (state) {
                return CM6.RangeSet.of(activeLineStarts(state).map(function (position) {
                    return new PhoenixGutterLineClass(
                        "cm-activeLineGutter"
                    ).range(position);
                }));
            }
        );
        return [lineHighlighter, gutterHighlighter];
    }

    function _bracketMatchingExtension(adapter, value) {
        if (!value) {
            return [];
        }
        const configuration = typeof value === "object" ? value : {};
        const matchingDecoration = CM6.Decoration.mark({
            class: "cm-matchingBracket CodeMirror-matchingbracket"
        });
        const nonMatchingDecoration = CM6.Decoration.mark({
            class: "cm-nonmatchingBracket CodeMirror-nonmatchingbracket"
        });

        function decorationsForView(view) {
            if (!view.hasFocus) {
                return CM6.Decoration.none;
            }
            const maxHighlightLineLength =
                configuration.maxHighlightLineLength || 1000;
            const ranges = [];
            const seen = new Set();
            view.state.selection.ranges.forEach(function (selection) {
                if (!selection.empty) {
                    return;
                }
                const match = CodeMirror.findMatchingBracket(
                    adapter,
                    adapter.posFromIndex(selection.head),
                    configuration
                );
                if (!match ||
                        !match.match &&
                            configuration.highlightNonMatching === false) {
                    return;
                }
                const decoration = match.match ?
                    matchingDecoration :
                    nonMatchingDecoration;
                [match.from, match.to].forEach(function (position) {
                    if (!position || typeof position !== "object") {
                        return;
                    }
                    const lineText = adapter.getLine(position.line);
                    if (lineText === undefined ||
                            lineText.length > maxHighlightLineLength) {
                        return;
                    }
                    const from = adapter.indexFromPos(position);
                    const key = `${from}:${match.match}`;
                    if (!seen.has(key)) {
                        seen.add(key);
                        ranges.push(decoration.range(from, from + 1));
                    }
                });
            });
            return CM6.Decoration.set(ranges, true);
        }

        return CM6.ViewPlugin.fromClass(class {
            constructor(view) {
                this.decorations = decorationsForView(view);
            }

            update(update) {
                if (update.docChanged ||
                        update.selectionSet ||
                        update.focusChanged) {
                    this.decorations = decorationsForView(update.view);
                }
            }
        }, {
            decorations: function (plugin) {
                return plugin.decorations;
            }
        });
    }

    function _normalizeGutterSpec(gutter) {
        if (typeof gutter === "string") {
            return {
                className: gutter,
                style: null
            };
        }
        return {
            className: gutter && gutter.className,
            style: gutter && gutter.style || null
        };
    }

    function _readModeToken(mode, stream, state) {
        for (let attempt = 0; attempt < 10; attempt++) {
            const style = mode.token ? mode.token(stream, state) : null;
            if (stream.pos > stream.start) {
                return style;
            }
        }
        throw new Error(`Mode ${mode.name || "unknown"} failed to advance stream.`);
    }

    function _readBlankLineStyle(mode, state) {
        if (mode && typeof mode.blankLine === "function") {
            return mode.blankLine(state);
        }
        if (!mode || typeof mode.innerMode !== "function") {
            return null;
        }
        const inner = CodeMirror.innerMode(mode, state);
        return inner && inner.mode &&
            typeof inner.mode.blankLine === "function" ?
            inner.mode.blankLine(inner.state) :
            null;
    }

    function _legacyLineOracle(adapter, lineNumber, styles) {
        return {
            lookAhead: function (distance) {
                return adapter.getLine(lineNumber + distance);
            },
            baseToken: function (position) {
                return styles ?
                    _baseTokenAtPosition(styles, position) :
                    null;
            }
        };
    }

    function _processModeLine(adapter, mode, state, lineNumber) {
        const text = adapter.getLine(lineNumber) || "";
        if (!text.length) {
            if (mode.blankLine) {
                mode.blankLine(state);
            }
            return;
        }

        const stream = new CodeMirror.StringStream(
            text,
            adapter.getOption("tabSize") || 4,
            _legacyLineOracle(adapter, lineNumber)
        );
        while (!stream.eol()) {
            stream.start = stream.pos;
            _readModeToken(mode, stream, state);
        }
    }

    function _modeStateBefore(adapter, mode, lineNumber) {
        const firstLine = adapter.firstLine();
        const lineLimit = Math.min(
            Math.max(Number(lineNumber) || firstLine, firstLine),
            adapter.lastLine() + 1
        );
        let cache = adapter._legacyModeStateCache;
        if (!cache || cache.mode !== mode ||
                cache.firstLine !== firstLine ||
                cache.tabSize !== (adapter.getOption("tabSize") || 4)) {
            cache = {
                firstLine: firstLine,
                frontier: firstLine,
                mode: mode,
                states: new Map(),
                tabSize: adapter.getOption("tabSize") || 4
            };
            cache.states.set(firstLine, CodeMirror.startState(mode));
            adapter._legacyModeStateCache = cache;
        }

        const startLine = lineLimit <= cache.frontier ?
            lineLimit :
            cache.frontier;
        const state = CodeMirror.copyState(mode, cache.states.get(startLine));
        for (let currentLine = startLine; currentLine < lineLimit; currentLine++) {
            _processModeLine(adapter, mode, state, currentLine);
            adapter._legacyModeParseCount++;
            cache.states.set(
                currentLine + 1,
                CodeMirror.copyState(mode, state)
            );
            cache.frontier = currentLine + 1;
        }
        return state;
    }

    function _copyLegacyChange(change) {
        return {
            from: _copyPosition(change.from),
            to: _copyPosition(change.to),
            text: change.text.slice(),
            removed: change.removed.slice(),
            origin: change.origin
        };
    }

    function _extractLineClasses(style, lineClasses) {
        const tokenClasses = [];
        String(style || "").trim().split(/\s+/).filter(Boolean).forEach(function (className) {
            const lineClass = className.match(/^line-(background-)?(\S+)$/);
            if (!lineClass) {
                tokenClasses.push(className);
                return;
            }
            if (lineClasses) {
                const destination = lineClass[1] ?
                    lineClasses.background :
                    lineClasses.text;
                destination.add(lineClass[2]);
            }
        });
        return tokenClasses.length ? tokenClasses.join(" ") : null;
    }

    function _stripLineClasses(style) {
        return _extractLineClasses(style);
    }

    function _stripOverlayClasses(style) {
        return style && style.replace(/( |^)overlay .*/, "");
    }

    function _styleAtPosition(styles, position) {
        if (!styles.length) {
            return null;
        }
        if (position === 0) {
            return styles[0].type;
        }
        const matchingStyle = styles.find(function (style) {
            return style.from < position && style.to >= position;
        });
        return matchingStyle ? matchingStyle.type : null;
    }

    function _baseTokenAtPosition(styles, position) {
        const matchingStyle = styles.find(function (style) {
            return style.to > position;
        });
        if (!matchingStyle) {
            return null;
        }
        return {
            type: _stripOverlayClasses(matchingStyle.type),
            size: matchingStyle.to - position
        };
    }

    function _applyOverlayStyle(styles, from, to, overlayStyle, opaque) {
        const result = [];
        styles.forEach(function (style) {
            if (style.to <= from || style.from >= to) {
                result.push(style);
                return;
            }

            if (style.from < from) {
                result.push({
                    from: style.from,
                    to: from,
                    type: style.type
                });
            }

            result.push({
                from: Math.max(style.from, from),
                to: Math.min(style.to, to),
                type: opaque ?
                    `overlay ${overlayStyle}` :
                    `${style.type ? `${style.type} ` : ""}overlay ${overlayStyle}`
            });

            if (style.to > to) {
                result.push({
                    from: to,
                    to: style.to,
                    type: style.type
                });
            }
        });
        return result;
    }

    function _lineStylesWithOverlays(adapter, lineNumber) {
        const text = adapter.getLine(lineNumber) || "";
        let styles = adapter.getLineTokens(lineNumber, true).map(function (token) {
            return {
                from: token.start,
                to: token.end,
                type: _stripLineClasses(token.type)
            };
        });
        if (!styles.length && text.length) {
            styles = [{
                from: 0,
                to: text.length,
                type: null
            }];
        }

        adapter.state.overlays.forEach(function (overlayRecord) {
            const stream = new CodeMirror.StringStream(
                text,
                adapter.getOption("tabSize") || 4,
                {
                    lookAhead: function (distance) {
                        return adapter.getLine(lineNumber + distance);
                    },
                    baseToken: function (position) {
                        return _baseTokenAtPosition(styles, position);
                    }
                }
            );
            while (!stream.eol()) {
                stream.start = stream.pos;
                const overlayStyle = _stripLineClasses(
                    _readModeToken(overlayRecord.mode, stream, true)
                );
                if (overlayStyle) {
                    styles = _applyOverlayStyle(
                        styles,
                        stream.start,
                        stream.pos,
                        overlayStyle,
                        overlayRecord.opaque
                    );
                }
            }
        });
        return styles;
    }

    function _sameSelection(left, right) {
        if (!left || !right || left.ranges.length !== right.ranges.length ||
                left.mainIndex !== right.mainIndex) {
            return false;
        }

        return left.ranges.every(function (range, index) {
            const other = right.ranges[index];
            return range.anchor === other.anchor && range.head === other.head;
        });
    }

    function _historySelection(entry) {
        return entry && entry.type === "selection" ?
            entry.afterSelection :
            null;
    }

    function _pushSelectionHistoryEntry(destination, entry) {
        const selection = _historySelection(entry);
        const previousSelection = _historySelection(
            destination[destination.length - 1]
        );
        if (!selection || previousSelection &&
                _sameSelection(previousSelection, selection)) {
            return;
        }
        destination.push(entry);
    }

    function _modeName(mode) {
        if (!mode) {
            return "text/plain";
        }
        if (typeof mode === "string") {
            return mode.toLowerCase();
        }
        if (mode.name) {
            return String(mode.name).toLowerCase();
        }
        return "text/plain";
    }

    function _prepareLegacyStream(stream) {
        if (stream._phoenixCodeMirror5Compatible) {
            return;
        }

        stream._phoenixCodeMirror5Compatible = true;
        stream.lineStart = 0;
        stream.lineOracle = null;
        [
            "sol",
            "column",
            "indentation",
            "hideFirstChars",
            "lookAhead",
            "baseToken",
            "match"
        ].forEach(function (methodName) {
            stream[methodName] = CodeMirror.StringStream.prototype[methodName];
        });
    }

    const LEGACY_STREAM_TOKEN_ALIASES = new Set([
        "attribute",
        "builtin",
        "def",
        "error",
        "header",
        "property",
        "qualifier",
        "string-2",
        "tag",
        "type",
        "variable",
        "variable-2"
    ]);

    function _isRecognizedCM6StreamToken(tokenName) {
        if (LEGACY_STREAM_TOKEN_ALIASES.has(tokenName)) {
            return true;
        }

        const tokenParts = tokenName.split(".");
        if (!tokenParts.length ||
                !CM6.tags[tokenParts[0]] ||
                typeof CM6.tags[tokenParts[0]] === "function") {
            return false;
        }
        return tokenParts.slice(1).every(function (modifierName) {
            return typeof CM6.tags[modifierName] === "function";
        });
    }

    function _cm6StreamTokenStyle(style) {
        if (!style) {
            return style;
        }
        const supportedTokens = String(style).trim().split(/\s+/)
            .filter(Boolean)
            .filter(_isRecognizedCM6StreamToken);
        return supportedTokens.length ? supportedTokens.join(" ") : null;
    }

    function _legacyLanguageExtensionForMode(mode, options) {
        if (!CodeMirror.hasMode(mode)) {
            return [];
        }

        const legacyMode = CodeMirror.getMode(options || {}, mode);
        if (!legacyMode || legacyMode.name === "null" ||
                typeof legacyMode.token !== "function") {
            return [];
        }

        const legacyToken = legacyMode.token;
        const streamParser = Object.assign({}, legacyMode, {
            token: function (stream, state) {
                _prepareLegacyStream(stream);
                return _cm6StreamTokenStyle(
                    legacyToken.call(legacyMode, stream, state)
                );
            }
        });
        return CM6.StreamLanguage["define"](streamParser);
    }

    function _nestedHTMLParserForMode(mode, options) {
        const resolvedMode = CodeMirror.resolveMode(mode);
        const name = _modeName(resolvedMode);

        if (CodeMirror.isModeOverridden &&
                CodeMirror.isModeOverridden(resolvedMode)) {
            const overriddenLanguage = _legacyLanguageExtensionForMode(
                mode,
                options
            );
            return overriddenLanguage && overriddenLanguage.parser || null;
        }

        if (name === "htmlmixed") {
            return CM6.html({
                autoCloseTags: false
            }).language.parser;
        }
        if (name === "jsx") {
            return CM6.javascript({
                jsx: true,
                typescript: Boolean(
                    resolvedMode.base && resolvedMode.base.typescript
                )
            }).language.parser;
        }
        if (name === "javascript") {
            if (resolvedMode.json || resolvedMode.jsonld) {
                return CM6.json().language.parser;
            }
            return CM6.javascript({
                typescript: Boolean(resolvedMode.typescript)
            }).language.parser;
        }

        const legacyLanguage = _legacyLanguageExtensionForMode(mode, options);
        return legacyLanguage && legacyLanguage.parser || null;
    }

    function _languageFromExtension(extension) {
        if (Array.isArray(extension)) {
            for (let index = 0; index < extension.length; index++) {
                const language = _languageFromExtension(extension[index]);
                if (language) {
                    return language;
                }
            }
            return null;
        }
        if (extension && extension.language) {
            return extension.language;
        }
        return extension && extension.parser ? extension : null;
    }

    function _markdownCodeLanguage(info, options) {
        const languageName = String(info || "").trim().toLowerCase();
        const aliases = {
            bash: "text/x-sh",
            c: "text/x-csrc",
            "c++": "text/x-c++src",
            cpp: "text/x-c++src",
            cs: "text/x-csharp",
            csharp: "text/x-csharp",
            html: "text/html",
            js: "javascript",
            javascript: "javascript",
            json: "application/json",
            jsx: "text/jsx",
            kt: "text/x-kotlin",
            kotlin: "text/x-kotlin",
            less: "text/x-less",
            mysql: "text/x-mysql",
            php: "application/x-httpd-php-open",
            py: "python",
            rb: "ruby",
            scss: "text/x-scss",
            sh: "text/x-sh",
            sql: "text/x-sql",
            ts: "application/typescript",
            tsx: "text/typescript-jsx",
            typescript: "application/typescript",
            xml: "application/xml",
            yml: "text/x-yaml"
        };
        const mode = aliases[languageName] || languageName;
        if (!mode || mode === "markdown" || mode === "gfm" || mode === "md") {
            return null;
        }
        return _languageFromExtension(_languageExtensionForMode(mode, options));
    }

    function _languageExtensionForMode(mode, options) {
        const resolvedMode = CodeMirror.resolveMode(mode);
        const resolvedName = _modeName(resolvedMode);

        if (CodeMirror.isModeOverridden &&
                CodeMirror.isModeOverridden(resolvedMode)) {
            return _legacyLanguageExtensionForMode(mode, options);
        }

        if (resolvedName === "css" &&
                (resolvedMode.variant === "scss" || resolvedMode.variant === "less")) {
            return _legacyLanguageExtensionForMode(mode, options);
        }
        if (resolvedName === "handlebars" ||
                resolvedName === "htmlhandlebars" ||
                resolvedName === "htmlembedded") {
            return _legacyLanguageExtensionForMode(mode, options);
        }

        if (resolvedName === "javascript") {
            if (resolvedMode.json || resolvedMode.jsonld) {
                return CM6.json();
            }
            return CM6.javascript({
                typescript: Boolean(resolvedMode.typescript)
            });
        }
        if (resolvedName === "jsx") {
            return CM6.javascript({
                jsx: true,
                typescript: Boolean(
                    resolvedMode.base && resolvedMode.base.typescript
                )
            });
        }
        if (resolvedName === "json") {
            return CM6.json();
        }
        if (resolvedName === "css") {
            return CM6.css();
        }
        if (resolvedName === "clike" && resolvedMode.variant === "php" ||
                resolvedName === "php" && resolvedMode.startOpen) {
            return CM6.php({
                baseLanguage: null,
                plain: true
            });
        }
        if (resolvedName === "php") {
            const htmlSupport = CM6.html({
                autoCloseTags: !options || options.autoCloseTags !== false
            });
            return [
                CM6.php({
                    baseLanguage: htmlSupport.language
                }),
                htmlSupport.support
            ];
        }
        if (resolvedName === "htmlmixed") {
            const htmlOptions = {
                autoCloseTags: !options || options.autoCloseTags !== false
            };
            if (resolvedMode.scriptTypes) {
                htmlOptions.nestedLanguages = resolvedMode.scriptTypes
                    .map(function (scriptType) {
                        const parser = _nestedHTMLParserForMode(
                            scriptType.mode,
                            options
                        );
                        if (!parser) {
                            return null;
                        }
                        return {
                            tag: "script",
                            attrs: function (attributes) {
                                scriptType.matches.lastIndex = 0;
                                return scriptType.matches.test(
                                    attributes.type || ""
                                );
                            },
                            parser: parser
                        };
                    })
                    .filter(Boolean);
            }
            return CM6.html(htmlOptions);
        }
        if (resolvedName === "xml") {
            return CM6.xml();
        }
        if (resolvedName === "markdown" || resolvedName === "gfm") {
            const markdownOptions = {
                codeLanguages: function (info) {
                    return _markdownCodeLanguage(info, options);
                }
            };
            if (resolvedName === "gfm") {
                markdownOptions.base = CM6.markdownLanguage;
            }
            return CM6.markdown(markdownOptions);
        }

        const legacyModeMap = {
            "clike": CM6.c,
            "text/x-csrc": CM6.c,
            "text/x-c++src": CM6.cpp,
            "text/x-csharp": CM6.csharp,
            "text/x-java": CM6.java,
            "text/x-kotlin": CM6.kotlin,
            "text/x-objectivec": CM6.objectiveC,
            "text/x-scala": CM6.scala,
            "clojure": CM6.clojure,
            "coffeescript": CM6.coffeeScript,
            "diff": CM6.diff,
            "dart": CM6.dart,
            "application/dart": CM6.dart,
            "erlang": CM6.erlang,
            "go": CM6.go,
            "groovy": CM6.groovy,
            "haskell": CM6.haskell,
            "haxe": CM6.haxe,
            "lua": CM6.lua,
            "pascal": CM6.pascal,
            "perl": CM6.perl,
            "properties": CM6.properties,
            "text/x-properties": CM6.properties,
            "pug": CM6.pug,
            "python": CM6.python,
            "ruby": CM6.ruby,
            "rust": CM6.rust,
            "text/x-rustsrc": CM6.rust,
            "sass": CM6.sass,
            "scheme": CM6.scheme,
            "shell": CM6.shell,
            "text/x-sh": CM6.shell,
            "sql": CM6.standardSQL,
            "text/x-sql": CM6.standardSQL,
            "text/x-mysql": CM6.mySQL,
            "stex": CM6.stex,
            "text/x-stex": CM6.stex,
            "stylus": CM6.stylus,
            "text/x-styl": CM6.stylus,
            "swift": CM6.swift,
            "toml": CM6.toml,
            "turtle": CM6.turtle,
            "vb": CM6.vb,
            "text/x-vb": CM6.vb,
            "vbscript": CM6.vbScript,
            "yaml": CM6.yaml,
            "text/x-yaml": CM6.yaml
        };
        const legacyMode = legacyModeMap[_modeName(mode)] ||
            legacyModeMap[resolvedName];
        if (legacyMode) {
            return CM6.StreamLanguage["define"](legacyMode);
        }
        return _legacyLanguageExtensionForMode(mode, options);
    }

    const phoenixHighlightStyle = CM6.HighlightStyle["define"]([
        { tag: CM6.tags.keyword, class: "cm-keyword" },
        { tag: [CM6.tags.atom, CM6.tags.bool, CM6.tags.null], class: "cm-atom" },
        { tag: [CM6.tags.number, CM6.tags.integer, CM6.tags.float], class: "cm-number" },
        { tag: [CM6.tags.definitionKeyword, CM6.tags.definitionOperator], class: "cm-def" },
        { tag: CM6.tags.variableName, class: "cm-variable" },
        { tag: CM6.tags.local(CM6.tags.variableName), class: "cm-variable-2" },
        { tag: [CM6.tags.typeName, CM6.tags.className], class: "cm-type" },
        { tag: CM6.tags.operator, class: "cm-operator" },
        { tag: [CM6.tags.comment, CM6.tags.lineComment, CM6.tags.blockComment], class: "cm-comment" },
        { tag: [CM6.tags.string, CM6.tags.special(CM6.tags.string)], class: "cm-string" },
        { tag: CM6.tags.regexp, class: "cm-string-2" },
        { tag: [CM6.tags.meta, CM6.tags.processingInstruction], class: "cm-meta" },
        { tag: CM6.tags.labelName, class: "cm-qualifier" },
        { tag: CM6.tags.standard(CM6.tags.variableName), class: "cm-builtin" },
        { tag: [CM6.tags.bracket, CM6.tags.paren, CM6.tags.squareBracket, CM6.tags.brace], class: "cm-bracket" },
        { tag: CM6.tags.tagName, class: "cm-tag" },
        { tag: CM6.tags.attributeName, class: "cm-attribute" },
        { tag: CM6.tags.heading, class: "cm-header" },
        { tag: CM6.tags.quote, class: "cm-quote" },
        { tag: CM6.tags.link, class: "cm-link" },
        { tag: CM6.tags.propertyName, class: "cm-property" },
        { tag: CM6.tags.invalid, class: "cm-error" },
        { tag: CM6.tags.emphasis, class: "cm-em" },
        { tag: CM6.tags.strong, class: "cm-strong" }
    ]);

    /**
     * Convert a CM6 offset into a Phoenix/CM5 position.
     * @param {!Text} doc
     * @param {number} offset
     * @return {{line:number, ch:number}}
     */
    function _positionFromOffset(doc, offset, firstLine) {
        const safeOffset = _clamp(offset, 0, doc.length);
        const line = doc.lineAt(safeOffset);
        return {
            line: line.number - 1 + (firstLine || 0),
            ch: safeOffset - line.from
        };
    }

    function _splitLines(text) {
        return String(text).split(/\r\n?|\n/);
    }

    function _copyPosition(position) {
        return {
            line: position.line,
            ch: position.ch
        };
    }

    function _copySelection(selection) {
        return {
            anchor: _copyPosition(selection.anchor),
            head: _copyPosition(selection.head)
        };
    }

    function _copyHistoryValue(value) {
        if (Array.isArray(value)) {
            return value.map(_copyHistoryValue);
        }
        if (!value || typeof value !== "object") {
            return value;
        }
        if (value instanceof CM6.EditorSelection) {
            return value.toJSON();
        }
        const copy = {};
        Object.keys(value).forEach(function (key) {
            copy[key] = _copyHistoryValue(value[key]);
        });
        return copy;
    }

    function _copyHistoryArray(entries, copySelections) {
        return (entries || []).map(function (entry) {
            if (!copySelections && entry && entry.type === "selection") {
                // Match CM5's copyHistoryArray contract. Selection events are
                // intentionally shared by getHistory(), which Phoenix uses to
                // attach named restore-point metadata. Change events are
                // copied so callers cannot mutate the live undo payload.
                return entry;
            }
            return _copyHistoryValue(entry);
        });
    }

    function _restoreHistorySelection(selection) {
        if (!selection || selection instanceof CM6.EditorSelection) {
            return selection;
        }
        if (Array.isArray(selection.ranges)) {
            return CM6.EditorSelection.fromJSON(selection);
        }
        return selection;
    }

    function _prepareHistoryEntry(entry) {
        if (!entry || typeof entry !== "object") {
            return entry;
        }

        entry.beforeSelection = _restoreHistorySelection(entry.beforeSelection);
        entry.afterSelection = _restoreHistorySelection(entry.afterSelection);
        if (entry.type === "change" && !entry.changes) {
            entry.changes = entry.steps && entry.steps.length ?
                entry.steps :
                [{}];
        }
        return entry;
    }

    const HISTORY_STATE_PROPERTIES = [
        "_historyDone",
        "_historyUndone",
        "_historyClosed",
        "_historyLastModTime",
        "_historyLastSelectionTime",
        "_historyLastOperationId",
        "_historyLastSelectionOperationId",
        "_historyLastOrigin",
        "_historyLastSelectionOrigin",
        "_currentGeneration",
        "_nextGeneration",
        "_cleanGeneration"
    ];

    function _createHistoryState(source) {
        const state = source || {};
        return {
            _historyDone: state._historyDone || [],
            _historyUndone: state._historyUndone || [],
            _historyClosed: state._historyClosed !== false,
            _historyLastModTime: state._historyLastModTime || 0,
            _historyLastSelectionTime: state._historyLastSelectionTime || 0,
            _historyLastOperationId: state._historyLastOperationId === undefined ?
                null :
                state._historyLastOperationId,
            _historyLastSelectionOperationId:
                state._historyLastSelectionOperationId === undefined ?
                    null :
                    state._historyLastSelectionOperationId,
            _historyLastOrigin: state._historyLastOrigin || null,
            _historyLastSelectionOrigin: state._historyLastSelectionOrigin || null,
            _currentGeneration: state._currentGeneration || 0,
            _nextGeneration: state._nextGeneration || 1,
            _cleanGeneration: state._cleanGeneration || 0
        };
    }

    function _installHistoryState(adapter) {
        adapter._historyState = _createHistoryState(adapter);
        HISTORY_STATE_PROPERTIES.forEach(function (propertyName) {
            Object.defineProperty(adapter, propertyName, {
                configurable: true,
                get: function () {
                    return this._historyState[propertyName];
                },
                set: function (value) {
                    this._historyState[propertyName] = value;
                }
            });
        });
    }

    function _selectionFromOffsets(selection, doc, firstLine) {
        const result = {
            anchor: _positionFromOffset(doc, selection.anchor, firstLine),
            head: _positionFromOffset(doc, selection.head, firstLine)
        };
        if (selection.goalColumn !== null && selection.goalColumn !== undefined) {
            result.goalColumn = selection.goalColumn;
        }
        return result;
    }

    function _normalizeStyleClasses(style) {
        return String(style || "").trim().split(/\s+/).filter(Boolean).map(function (className) {
            return className.indexOf("cm-") === 0 ? className : `cm-${className}`;
        }).join(" ");
    }

    function _legacyClassPattern(className) {
        return new RegExp(`(^|\\s)${className}(?:$|\\s)\\s*`);
    }

    function _nodeForGutterMarker(marker) {
        if (marker && marker.nodeType) {
            return marker;
        }

        const node = window.document.createElement("span");
        if (marker !== null && marker !== undefined) {
            node.textContent = String(marker);
        }
        return node;
    }

    class LegacyNodeWidget extends CM6.WidgetType {
        constructor(node, handleMouseEvents) {
            super();
            this.node = node;
            this.handleMouseEvents = Boolean(handleMouseEvents);
        }

        eq(other) {
            return other instanceof LegacyNodeWidget && other.node === this.node;
        }

        toDOM() {
            return this.node;
        }

        ignoreEvent() {
            return !this.handleMouseEvents;
        }
    }

    class LegacyLineWidget extends CM6.WidgetType {
        constructor(adapter, record) {
            super();
            this.adapter = adapter;
            this.record = record;
            this.version = record.version;
        }

        eq(other) {
            return other instanceof LegacyLineWidget &&
                other.record === this.record &&
                other.version === this.version;
        }

        toDOM() {
            const wrapper = window.document.createElement("div");
            const options = this.record.options || {};
            wrapper.className = "CodeMirror-linewidget phoenix-cm6-line-widget";
            if (options.className) {
                wrapper.classList.add(...String(options.className).split(/\s+/).filter(Boolean));
            }
            if (!options.handleMouseEvents) {
                wrapper.setAttribute("cm-ignore-events", "true");
            }
            wrapper.appendChild(this.record.node);
            this.record.renderedWrapper = wrapper;
            this.adapter._applyLineWidgetLayout(this.record);
            Promise.resolve().then(() => {
                if (!this.record.cleared && this.record.renderedWrapper === wrapper) {
                    this.adapter._measureLineWidget(this.record);
                    CodeMirror.signal(this.record.widget, "redraw");
                }
            });
            return wrapper;
        }

        destroy(dom) {
            if (this.record.renderedWrapper === dom) {
                this.record.renderedWrapper = null;
            }
        }

        ignoreEvent() {
            const options = this.record.options || {};
            return !options.handleMouseEvents;
        }
    }

    class PhoenixGutterMarker extends CM6.GutterMarker {
        constructor(record) {
            super();
            this.record = record;
        }

        eq(other) {
            return other instanceof PhoenixGutterMarker && other.record === this.record;
        }

        toDOM() {
            const wrapper = window.document.createElement("span");
            wrapper.className = "phoenix-cm6-gutter-marker-wrapper";
            wrapper.style.display = "contents";
            wrapper.appendChild(this.record.renderedNode);
            return wrapper;
        }
    }

    class PhoenixGutterLineClass extends CM6.GutterMarker {
        constructor(className) {
            super();
            this.elementClass = className;
        }

        eq(other) {
            return other instanceof PhoenixGutterLineClass &&
                other.elementClass === this.elementClass;
        }
    }

    class LegacyScrollbarAnnotation {
        constructor(adapter, suppliedOptions) {
            this.cm = adapter;
            this.options = typeof suppliedOptions === "string" ?
                {className: suppliedOptions} :
                Object.assign({}, suppliedOptions || {});
            this.buttonHeight = Number(
                this.options.scrollButtonHeight ||
                    adapter.getOption("scrollButtonHeight") ||
                    0
            );
            this.annotations = [];
            this.doRedraw = null;
            this.doUpdate = null;
            this.cleared = false;
            this.div = window.document.createElement("div");
            this.div.className = "phoenix-cm6-scrollbar-annotations";
            this.div.style.cssText =
                "position:absolute;right:0;top:0;z-index:7;pointer-events:none";
            adapter.getWrapperElement().appendChild(this.div);
            adapter._scrollbarAnnotations.add(this);

            const scheduleRedraw = delay => {
                if (this.doRedraw !== null) {
                    window.clearTimeout(this.doRedraw);
                }
                this.doRedraw = window.setTimeout(() => {
                    this.doRedraw = null;
                    this.redraw();
                }, delay);
            };
            this.resizeHandler = () => {
                if (this.doUpdate !== null) {
                    window.clearTimeout(this.doUpdate);
                }
                this.doUpdate = window.setTimeout(() => {
                    this.doUpdate = null;
                    scheduleRedraw(20);
                }, 100);
            };
            adapter.on("refresh", this.resizeHandler);
            adapter.on("markerAdded", this.resizeHandler);
            adapter.on("markerCleared", this.resizeHandler);
            if (this.options.listenForChanges !== false) {
                this.changeHandler = function () {
                    scheduleRedraw(250);
                };
                adapter.on("changes", this.changeHandler);
            }
        }

        computeScale() {
            if (this.cleared || !this.cm._view) {
                return false;
            }
            const wrapper = this.cm.getWrapperElement();
            const scroller = this.cm.getScrollerElement();
            const availableHeight = Math.max(
                0,
                (wrapper.clientHeight || scroller.clientHeight) -
                    this.buttonHeight * 2
            );
            const nextScale = scroller.scrollHeight ?
                availableHeight / scroller.scrollHeight :
                0;
            const nextWidth = Math.max(
                scroller.offsetWidth - scroller.clientWidth,
                2
            );
            const changed = nextScale !== this.hScale ||
                nextWidth !== this.scrollbarWidth;
            this.hScale = nextScale;
            this.scrollbarWidth = nextWidth;
            return changed;
        }

        update(annotations) {
            if (this.cleared) {
                return;
            }
            this.annotations = Array.isArray(annotations) ?
                annotations.slice() :
                [];
            this.redraw();
        }

        _measure() {
            this.computeScale();
            return this.annotations.map(annotation => {
                const from = this.cm.clipPos(annotation.from);
                const to = this.cm.clipPos(annotation.to);
                const fromCoordinates = this.cm.charCoords(from, "local");
                const toCoordinates = this.cm.charCoords(to, "local");
                return {
                    annotation: annotation,
                    bottom: toCoordinates.bottom * this.hScale,
                    top: fromCoordinates.top * this.hScale
                };
            }).filter(function (annotation) {
                return Number.isFinite(annotation.top) &&
                    Number.isFinite(annotation.bottom);
            }).sort(function (left, right) {
                return left.top - right.top ||
                    left.bottom - right.bottom;
            });
        }

        _draw(positionedAnnotations) {
            if (this.cleared || !this.div.isConnected) {
                return;
            }
            const fragment = window.document.createDocumentFragment();
            for (let index = 0; index < positionedAnnotations.length; index++) {
                const positioned = positionedAnnotations[index];
                let bottom = positioned.bottom;
                while (index < positionedAnnotations.length - 1 &&
                        positionedAnnotations[index + 1].top <= bottom + 0.9) {
                    index++;
                    bottom = Math.max(
                        bottom,
                        positionedAnnotations[index].bottom
                    );
                }

                const marker = window.document.createElement("div");
                marker.style.cssText =
                    `position:absolute;right:0;width:${this.scrollbarWidth}px;` +
                    `top:${positioned.top + this.buttonHeight}px;` +
                    `height:${Math.max(bottom - positioned.top, 3)}px`;
                marker.className = this.options.className || "";
                if (positioned.annotation.id) {
                    marker.setAttribute(
                        "annotation-id",
                        positioned.annotation.id
                    );
                }
                fragment.appendChild(marker);
            }
            this.div.textContent = "";
            this.div.appendChild(fragment);
        }

        redraw() {
            if (this.cleared || !this.cm._view || !this.div.isConnected) {
                return;
            }
            this.cm._view.requestMeasure({
                key: this,
                read: () => {
                    return this.cleared ? [] : this._measure();
                },
                write: positionedAnnotations => {
                    this._draw(positionedAnnotations);
                }
            });
        }

        clear() {
            if (this.cleared) {
                return;
            }
            this.cleared = true;
            if (this.doRedraw !== null) {
                window.clearTimeout(this.doRedraw);
                this.doRedraw = null;
            }
            if (this.doUpdate !== null) {
                window.clearTimeout(this.doUpdate);
                this.doUpdate = null;
            }
            this.cm.off("refresh", this.resizeHandler);
            this.cm.off("markerAdded", this.resizeHandler);
            this.cm.off("markerCleared", this.resizeHandler);
            if (this.changeHandler) {
                this.cm.off("changes", this.changeHandler);
            }
            this.div.remove();
            this.cm._scrollbarAnnotations.delete(this);
        }
    }

    class LegacySearchAnnotation {
        constructor(adapter, query, caseFold, suppliedOptions) {
            this.cm = adapter;
            this.query = query;
            this.caseFold = caseFold;
            this.options = typeof suppliedOptions === "string" ?
                {className: suppliedOptions} :
                Object.assign({}, suppliedOptions || {});
            const annotationOptions = Object.assign(
                {listenForChanges: false},
                this.options
            );
            if (!annotationOptions.className) {
                annotationOptions.className = "CodeMirror-search-match";
            }
            this.annotation = adapter.annotateScrollbar(annotationOptions);
            this.matches = [];
            this.update = null;
            this.cleared = false;
            adapter._searchAnnotations.add(this);
            this.findMatches();
            this.annotation.update(this.matches);

            this.changeHandler = () => {
                if (this.update !== null) {
                    window.clearTimeout(this.update);
                }
                this.update = window.setTimeout(() => {
                    this.update = null;
                    this.updateAfterChange();
                }, 250);
            };
            adapter.on("change", this.changeHandler);
        }

        findMatches() {
            this.matches = [];
            if (this.cleared || !this.cm._view ||
                    typeof this.query === "string" && !this.query.length) {
                return;
            }
            const cursor = this.cm.getSearchCursor(
                this.query,
                CodeMirror.Pos(this.cm.firstLine(), 0),
                {
                    caseFold: this.caseFold,
                    multiline: this.options.multiline
                }
            );
            const maxMatches = Math.max(
                1,
                Number(this.options.maxMatches) || 1000
            );
            while (this.matches.length < maxMatches && cursor.findNext()) {
                this.matches.push({
                    from: cursor.from(),
                    to: cursor.to()
                });
            }
        }

        updateAfterChange() {
            if (this.cleared) {
                return;
            }
            this.findMatches();
            this.annotation.update(this.matches);
        }

        clear() {
            if (this.cleared) {
                return;
            }
            this.cleared = true;
            if (this.update !== null) {
                window.clearTimeout(this.update);
                this.update = null;
            }
            this.cm.off("change", this.changeHandler);
            this.annotation.clear();
            this.cm._searchAnnotations.delete(this);
        }
    }

    /**
     * @constructor
     * @param {!Element} container
     * @param {!Object} options
     */
    function CodeMirror6Adapter(container, options) {
        options = options || {};
        const suppliedDoc = options._compatDoc || null;
        const suppliedDocSource = options._compatDocSource || null;
        this.isCodeMirror6 = true;
        this._detachedDoc = Boolean(options._detachedDoc);
        this._firstLine = Number.isFinite(Number(options._firstLine)) ?
            Math.floor(Number(options._firstLine)) :
            0;
        this._options = Object.assign({}, CodeMirror.defaults || {}, options);
        if (this._options.inputStyle === "textarea") {
            // CM6 always edits through its contenteditable content DOM. Keep
            // persisted CM5 preferences working without reporting a backend
            // that is not actually in use.
            this._options.inputStyle = "contenteditable";
        }
        const InputStyle = CodeMirror.inputStyles[this._options.inputStyle];
        if (typeof InputStyle !== "function") {
            throw new Error(
                `Unsupported CodeMirror inputStyle "${this._options.inputStyle}"`
            );
        }
        delete this._options._compatDoc;
        delete this._options._compatDocSource;
        delete this._options._detachedDoc;
        delete this._options._firstLine;
        this.options = this._options;
        const overlays = [];
        this.state = {
            keyMaps: [],
            keySeq: null,
            matchBrackets: null,
            overlays: overlays,
            overwrite: false,
            suppressEdits: false
        };
        this.extend = false;
        this.doc = suppliedDoc || CodeMirror.createDocumentForAdapter(this, {
            editor: this._detachedDoc ? null : this,
            mode: this._options.mode,
            lineSeparator: this._options.lineSeparator,
            direction: this._options.direction
        });
        this._listeners = new Map();
        this._markers = [];
        this._lineHandles = new Set();
        this._gutterMarkers = [];
        this._lineClasses = [];
        this._lineWidgets = [];
        this._lineFolds = {};
        this._overlays = overlays;
        this._operationDepth = 0;
        this.curOp = null;
        this.virtualSelection = null;
        this.$lastChangeEndOffset = 0;
        this._pendingChangeEvents = [];
        this._pendingMarkerVisibilityEvents = [];
        this._pendingCursorActivity = false;
        this._pendingDocumentCursorActivityCount = 0;
        this._pendingUpdate = false;
        this._historyDone = [];
        this._historyUndone = [];
        const adapter = this;
        this.history = {};
        Object.defineProperties(this.history, {
            done: {
                enumerable: true,
                get: function () {
                    return adapter._historyDone;
                }
            },
            undone: {
                enumerable: true,
                get: function () {
                    return adapter._historyUndone;
                }
            }
        });
        this._historyClosed = true;
        this._historyApplying = false;
        this._historyLastModTime = 0;
        this._historyLastSelectionTime = 0;
        this._historyLastOperationId = null;
        this._historyLastSelectionOperationId = null;
        this._historyLastOrigin = null;
        this._historyLastSelectionOrigin = null;
        this._activeOperationId = null;
        this._nextOperationId = 1;
        this._currentGeneration = 0;
        this._nextGeneration = 1;
        this._cleanGeneration = 0;
        _installHistoryState(this);
        this._nextMarkerId = 1;
        this.$mid = 1;
        this.marks = Object.create(null);
        this._legacyMode = null;
        this._legacyModeStateCache = null;
        this._legacyModeParseCount = 0;
        this._legacyDecorationsDirty = false;
        this._renderLineRefreshScheduled = false;
        this._keySequenceTimer = null;
        this._gutterRefreshScheduled = false;
        this._rulerRefreshScheduled = false;
        this._rulerElement = null;
        this._legacyDOM = null;
        this._scrollbarAnnotations = new Set();
        this._searchAnnotations = new Set();
        this._scrollbarModel = null;
        this._scrollbarModelNodes = [];
        this._scrollbarModelName = null;
        this._destroyed = false;
        this._focusState = false;
        this._lastViewport = null;
        this._renderedLineDOMState = new WeakMap();
        this._matchingBracketDOM = new WeakSet();
        this._nonmatchingBracketDOM = new WeakSet();
        this._managedRootClasses = new Set(["cm-editor", "cm-focused"]);
        this._originAnnotation = CM6.Annotation["define"]();
        this._selectionBiasAnnotation = CM6.Annotation["define"]();
        this._addToHistoryAnnotation = CM6.Annotation["define"]();
        this._bypassReadOnlyAnnotation = CM6.Annotation["define"]();
        this._linkedChangeAnnotation = CM6.Annotation["define"]();
        this._skipBeforeChangeAnnotation = CM6.Annotation["define"]();
        this._syntheticChangesAnnotation = CM6.Annotation["define"]();
        this._fullChangeAnnotation = CM6.Annotation["define"]();
        this._setValueSelectionResetAnnotation = CM6.Annotation["define"]();
        this._legacyUpdateAnnotation = CM6.Annotation["define"]();

        this._readOnlyCompartment = new CM6.Compartment();
        this._editableCompartment = new CM6.Compartment();
        this._lineNumbersCompartment = new CM6.Compartment();
        this._lineWrappingCompartment = new CM6.Compartment();
        this._activeLineCompartment = new CM6.Compartment();
        this._closeBracketsCompartment = new CM6.Compartment();
        this._bracketMatchingCompartment = new CM6.Compartment();
        this._selectionMatchesCompartment = new CM6.Compartment();
        this._drawSelectionCompartment = new CM6.Compartment();
        this._tabSizeCompartment = new CM6.Compartment();
        this._indentUnitCompartment = new CM6.Compartment();
        this._languageCompartment = new CM6.Compartment();
        this._scrollPastEndCompartment = new CM6.Compartment();
        this._smartIndentCompartment = new CM6.Compartment();
        this._dragDropCompartment = new CM6.Compartment();
        this._contentAttributesCompartment = new CM6.Compartment();
        this._placeholderCompartment = new CM6.Compartment();
        this._decorationsCompartment = new CM6.Compartment();
        this._compatHighlightCompartment = new CM6.Compartment();
        this._gutterLineClassesCompartment = new CM6.Compartment();
        this._guttersCompartment = new CM6.Compartment();

        const state = CM6.EditorState.create({
            doc: options.value || "",
            extensions: this._createExtensions()
        });

        this._view = new CM6.EditorView({
            state: state,
            parent: container,
            dispatchTransactions: this._dispatchTransactions.bind(this)
        });
        this.cm6 = this._view;
        this._wrapperElement = this._view.dom;
        this._scrollerElement = this._view.scrollDOM;
        this._contentElement = this._view.contentDOM;
        this._scrollHandler = this._handleScroll.bind(this);
        this._view.scrollDOM.addEventListener("scroll", this._scrollHandler, { passive: true });
        this._lastViewport = this.getViewport();
        this.display = {
            barHeight: 0,
            barWidth: 0,
            input: new InputStyle(this),
            scroller: this._scrollerElement,
            scrollbars: null,
            wrapper: this._wrapperElement,
            sizer: this._contentElement
        };
        Object.defineProperty(this, "inVirtualSelectionMode", {
            configurable: true,
            enumerable: true,
            get: function () {
                return Boolean(this.virtualSelection);
            }
        });
        let maxLineLengthDocument = null;
        let maxLineLength = 0;
        Object.defineProperty(this.display, "maxLineLength", {
            enumerable: true,
            get: () => {
                if (!this._view) {
                    return 0;
                }
                const document = this._view.state.doc;
                if (document !== maxLineLengthDocument) {
                    maxLineLengthDocument = document;
                    maxLineLength = 0;
                    for (let lineNumber = 1;
                            lineNumber <= document.lines;
                            lineNumber++) {
                        maxLineLength = Math.max(
                            maxLineLength,
                            document.line(lineNumber).length
                        );
                    }
                }
                return maxLineLength;
            }
        });

        if (suppliedDocSource && suppliedDocSource !== this) {
            this._restoreDocumentState(suppliedDocSource._takeDocumentState());
            suppliedDocSource._disposeDetachedBackend();
        }
        this.doc._adapter = this;
        this.doc.cm = this._detachedDoc ? null : this;
        this._syncDocumentMetadata();
        if (!this._detachedDoc && CodeMirror.registerInstance) {
            CodeMirror.registerInstance(this, this.doc);
        } else if (CodeMirror.installExtensions) {
            CodeMirror.installExtensions(
                this._detachedDoc ? null : this,
                this.doc
            );
        }
        if (CodeMirror.initOptions) {
            this._options = CodeMirror.initOptions(this, this._options);
            this.options = this._options;
        }
        this.state.matchBrackets = this._options.matchBrackets ?
            typeof this._options.matchBrackets === "object" ?
                this._options.matchBrackets :
                {} :
            null;
        this._reconfigureSilently(
            this._bracketMatchingCompartment,
            _bracketMatchingExtension(this, this._options.matchBrackets)
        );
        if (!suppliedDocSource) {
            this.clearHistory();
        }
        this._decorateDOM();
        this._applyThemeClass(this._options.theme);
        this._refreshLegacyDecorations();
        this._refreshLegacyHighlighting();
        this._refreshGutters();
        this._scheduleRulerRefresh();
        this._applyScrollbarStyle(this._options.scrollbarStyle);
        if (!this._detachedDoc && this.getOption("autofocus")) {
            this.focus();
        }

    }

    CodeMirror6Adapter.prototype._instance = function () {
        return this;
    };

    CodeMirror6Adapter.prototype._syncDocumentMetadata = function () {
        if (!this.doc) {
            return;
        }
        this.doc._modeOption = this._options.mode;
        this.doc._lineSeparator = this._options.lineSeparator;
        this.doc._direction = this._options.direction === "rtl" ? "rtl" : "ltr";
    };

    CodeMirror6Adapter.prototype._invalidateLegacyModeStateCache = function (
        recreateMode,
        fromLine
    ) {
        if (recreateMode) {
            this._legacyMode = null;
        }
        const cache = this._legacyModeStateCache;
        if (recreateMode || !cache || !Number.isFinite(Number(fromLine))) {
            this._legacyModeStateCache = null;
            return;
        }

        const frontier = Math.max(
            cache.firstLine,
            Math.floor(Number(fromLine))
        );
        if (frontier >= cache.frontier) {
            return;
        }
        cache.frontier = frontier;
        cache.states.forEach(function (_state, lineNumber) {
            if (lineNumber > frontier) {
                cache.states.delete(lineNumber);
            }
        });
    };

    CodeMirror6Adapter.prototype._signalDocument = function (eventName) {
        if (!this.doc) {
            return;
        }
        const args = Array.prototype.slice.call(arguments, 1);
        CodeMirror.signal.apply(null, [this.doc, eventName].concat(args));
    };

    CodeMirror6Adapter.prototype._signalBeforeChange = function (change) {
        this._signalDocument("beforeChange", this.doc, change);
        this._emit("beforeChange", this._instance(), change);
    };

    CodeMirror6Adapter.prototype._signalBeforeSelectionChange = function (selection) {
        this._signalDocument("beforeSelectionChange", this.doc, selection);
        this._emit("beforeSelectionChange", this._instance(), selection);
    };

    CodeMirror6Adapter.prototype._takeDocumentState = function () {
        const scrollInfo = this._view ? this.getScrollInfo() : {
            left: this.doc && this.doc._scrollLeft || 0,
            top: this.doc && this.doc._scrollTop || 0
        };
        const snapshot = {
            text: this._view ? this._view.state.doc.toString() : "",
            selection: this._view ? this._view.state.selection : CM6.EditorSelection.single(0),
            firstLine: this._firstLine,
            extend: this.extend,
            mode: this._options.mode,
            lineSeparator: this._options.lineSeparator,
            direction: this._options.direction,
            scrollLeft: scrollInfo.left,
            scrollTop: scrollInfo.top,
            markers: this._markers,
            lineHandles: this._lineHandles,
            gutterMarkers: this._gutterMarkers,
            lineClasses: this._lineClasses,
            lineWidgets: this._lineWidgets,
            lineFolds: this._lineFolds,
            historyState: this._historyState,
            nextMarkerId: this._nextMarkerId
        };

        this._markers = [];
        this._lineHandles = new Set();
        this._gutterMarkers = [];
        this._lineClasses = [];
        this._lineWidgets = [];
        this._lineFolds = {};
        this._historyState = _createHistoryState();
        this.marks = Object.create(null);
        this._resetHistoryMergeState();
        this._invalidateLegacyModeStateCache(true);
        return snapshot;
    };

    CodeMirror6Adapter.prototype._restoreDocumentState = function (snapshot) {
        if (!snapshot) {
            return;
        }

        this._firstLine = snapshot.firstLine;
        this.extend = Boolean(snapshot.extend);
        this._options.mode = snapshot.mode;
        this._options.lineSeparator = snapshot.lineSeparator;
        this._options.direction = snapshot.direction === "rtl" ? "rtl" : "ltr";
        this._markers = snapshot.markers || [];
        this._lineHandles = snapshot.lineHandles || new Set();
        this._gutterMarkers = snapshot.gutterMarkers || [];
        this._lineClasses = snapshot.lineClasses || [];
        this._lineWidgets = snapshot.lineWidgets || [];
        this._lineFolds = snapshot.lineFolds || {};
        this._historyState = snapshot.historyState ||
            _createHistoryState();
        this._nextMarkerId = snapshot.nextMarkerId || 1;
        this.$mid = this._nextMarkerId;
        this.marks = Object.create(null);
        this._invalidateLegacyModeStateCache(true);

        const text = String(snapshot.text || "");
        const maxOffset = text.length;
        const selection = snapshot.selection ?
            CM6.EditorSelection.create(snapshot.selection.ranges.map(function (range) {
                return CM6.EditorSelection.range(
                    _clamp(range.anchor, 0, maxOffset),
                    _clamp(range.head, 0, maxOffset)
                );
            }), Math.min(
                snapshot.selection.mainIndex,
                snapshot.selection.ranges.length - 1
            )) :
            CM6.EditorSelection.single(0);
        this._view.setState(CM6.EditorState.create({
            doc: text,
            selection: selection,
            extensions: this._createExtensions()
        }));
        this.state.matchBrackets = this._options.matchBrackets ?
            typeof this._options.matchBrackets === "object" ?
                this._options.matchBrackets :
                {} :
            null;
        this._reconfigureSilently(
            this._bracketMatchingCompartment,
            _bracketMatchingExtension(this, this._options.matchBrackets)
        );

        this._lineHandles.forEach(handle => {
            handle._adapter = this;
            handle.parent = this.doc;
        });
        this._markers.forEach(marker => {
            marker._adapter = this;
            marker.doc = this.doc;
            this.marks[marker.id] = marker;
        });
        this._lineWidgets.forEach(record => {
            if (record.widget) {
                record.widget.doc = this.doc;
            }
            record.renderedWrapper = null;
        });
        if (this.doc) {
            this.doc._scrollLeft = snapshot.scrollLeft || 0;
            this.doc._scrollTop = snapshot.scrollTop || 0;
        }
        this._syncDocumentMetadata();
        this._refreshLegacyDecorations();
        this._refreshLegacyHighlighting();
        this._refreshGutters();
        this.scrollTo(snapshot.scrollLeft || 0, snapshot.scrollTop || 0);
    };

    CodeMirror6Adapter.prototype._disposeDetachedBackend = function () {
        if (!this._detachedDoc) {
            throw new Error("Only detached document backends may be disposed.");
        }
        this.doc = null;
        this.destroy();
    };

    CodeMirror6Adapter.prototype._shareHistoryWith = function (otherAdapter) {
        this._historyState = otherAdapter._historyState;
    };

    CodeMirror6Adapter.prototype._splitSharedHistory = function () {
        const sourceState = this._historyState;
        const splitState = _createHistoryState({
            _historyDone: _copyHistoryValue(sourceState._historyDone),
            _historyUndone: _copyHistoryValue(sourceState._historyUndone),
            _historyClosed: sourceState._historyClosed,
            _historyLastModTime: sourceState._historyLastModTime,
            _historyLastSelectionTime: sourceState._historyLastSelectionTime,
            _historyLastOperationId: sourceState._historyLastOperationId,
            _historyLastSelectionOperationId:
                sourceState._historyLastSelectionOperationId,
            _historyLastOrigin: sourceState._historyLastOrigin,
            _historyLastSelectionOrigin: sourceState._historyLastSelectionOrigin,
            _currentGeneration: sourceState._currentGeneration,
            _nextGeneration: sourceState._nextGeneration,
            _cleanGeneration: sourceState._cleanGeneration
        });
        const visited = new Set();
        const assign = function (doc) {
            if (visited.has(doc)) {
                return;
            }
            visited.add(doc);
            if (doc._adapter) {
                doc._adapter._historyState = splitState;
            }
            doc._links.forEach(function (link) {
                if (link.sharedHist) {
                    assign(link.doc);
                }
            });
        };
        assign(this.doc);
    };

    CodeMirror6Adapter.prototype._rebaseHistoryForLinkedChange = function (change) {
        const lineDelta = change.text.length - 1 -
            (change.to.line - change.from.line);
        const rebaseStack = function (entries) {
            let conflictIndex = -1;
            entries.forEach(function (entry, entryIndex) {
                if (!entry || entry.type !== "change" || !entry.steps) {
                    return;
                }
                let conflicts = false;
                entry.steps.forEach(function (step) {
                    (step.redoChanges || []).forEach(function (storedChange) {
                        const from = storedChange.fromPos;
                        const to = storedChange.toPos;
                        if (!from || !to) {
                            return;
                        }
                        if (change.to.line < from.line) {
                            [step.redoChanges, step.undoChanges].forEach(function (changes) {
                                (changes || []).forEach(function (candidate) {
                                    if (candidate.fromPos) {
                                        candidate.fromPos.line += lineDelta;
                                    }
                                    if (candidate.toPos) {
                                        candidate.toPos.line += lineDelta;
                                    }
                                });
                            });
                            entry._linkedRebased = true;
                        } else if (change.from.line <= to.line) {
                            conflicts = true;
                        }
                    });
                });
                if (conflicts) {
                    conflictIndex = Math.max(conflictIndex, entryIndex);
                }
            });
            if (conflictIndex !== -1) {
                entries.splice(0, conflictIndex + 1);
            }
        };
        rebaseStack(this._historyDone);
        rebaseStack(this._historyUndone);
        if (!this._historyDone.length ||
                this._historyDone[0].type !== "selection") {
            const selection = this._view.state.selection;
            this._historyDone.unshift({
                type: "selection",
                beforeSelection: selection,
                afterSelection: selection,
                generationBefore: this._currentGeneration,
                generationAfter: this._currentGeneration
            });
        }
    };

    CodeMirror6Adapter.prototype._historyChangeSpecs = function (changes) {
        return (changes || []).map(change => {
            if (!change.fromPos || !change.toPos) {
                return {
                    from: change.from,
                    to: change.to,
                    insert: change.insert
                };
            }
            return {
                from: this.indexFromPos(change.fromPos),
                to: this.indexFromPos(change.toPos),
                insert: change.insert
            };
        });
    };

    CodeMirror6Adapter.prototype._historyTransaction = function (
        changes,
        selection,
        origin
    ) {
        const annotations = [
            this._originAnnotation.of(origin),
            this._addToHistoryAnnotation.of(false),
            this._bypassReadOnlyAnnotation.of(true)
        ];
        const transactionSpec = {
            changes: changes,
            annotations: annotations
        };
        if (selection) {
            transactionSpec.selection = selection;
        }

        let transaction = this._view.state.update(transactionSpec);
        if (!transaction.docChanged && changes.length) {
            transactionSpec.annotations = annotations.concat(
                this._syntheticChangesAnnotation.of(changes.map(function (change) {
                    return {
                        from: change.from,
                        to: change.to,
                        insert: change.insert,
                        origin: origin
                    };
                }))
            );
            transaction = this._view.state.update(transactionSpec);
        }
        return transaction;
    };

    CodeMirror6Adapter.prototype._createLinkedDocument = function (options) {
        const settings = options || {};
        const from = Math.max(
            this.firstLine(),
            settings.from === null || settings.from === undefined ?
                this.firstLine() :
                Math.floor(settings.from)
        );
        const to = Math.min(
            this.lastLine() + 1,
            settings.to === null || settings.to === undefined ?
                this.lastLine() + 1 :
                Math.floor(settings.to)
        );
        const lines = [];
        for (let lineNumber = from; lineNumber < to; lineNumber++) {
            const line = this.getLine(lineNumber);
            if (line !== undefined) {
                lines.push(line);
            }
        }
        if (!lines.length) {
            lines.push("");
        }

        const linkedDoc = new CodeMirror.Doc(
            lines.join(this.lineSeparator()),
            settings.mode === undefined ? this.getOption("mode") : settings.mode,
            from,
            this.getOption("lineSeparator"),
            this.getOption("direction")
        );
        const linkFromThis = {
            doc: linkedDoc,
            sharedHist: Boolean(settings.sharedHist)
        };
        const linkFromOther = {
            doc: this.doc,
            isParent: true,
            sharedHist: Boolean(settings.sharedHist)
        };
        this.doc._links.push(linkFromThis);
        linkedDoc._links.push(linkFromOther);
        if (settings.sharedHist) {
            linkedDoc._adapter._shareHistoryWith(this);
        }
        this._copySharedMarkersTo(linkedDoc);
        return linkedDoc;
    };

    CodeMirror6Adapter.prototype._unlinkDocument = function (otherDoc) {
        const ownLinkIndex = this.doc._links.findIndex(function (link) {
            return link.doc === otherDoc;
        });
        if (ownLinkIndex === -1) {
            return;
        }
        const sharedHistory = Boolean(
            this.doc._links[ownLinkIndex].sharedHist
        );
        this.doc._links.splice(ownLinkIndex, 1);
        const otherLinkIndex = otherDoc._links.findIndex(link => {
            return link.doc === this.doc;
        });
        if (otherLinkIndex !== -1) {
            otherDoc._links.splice(otherLinkIndex, 1);
        }
        if (sharedHistory && otherDoc._adapter) {
            otherDoc._adapter._splitSharedHistory();
        }
        this._partitionSharedMarkers(otherDoc);
    };

    CodeMirror6Adapter.prototype._shiftFirstLine = function (distance) {
        if (!distance) {
            return;
        }
        this._firstLine += distance;
        this._invalidateLegacyModeStateCache(false);
        this._lastViewport = null;
        this._refreshGutters();
    };

    CodeMirror6Adapter.prototype._applyLinkedChange = function (change, sharedHistory) {
        const lineDelta = change.text.length - 1 -
            (change.to.line - change.from.line);
        if (change.to.line < this.firstLine()) {
            this._shiftFirstLine(lineDelta);
            if (!sharedHistory) {
                this._rebaseHistoryForLinkedChange(change);
            }
            return;
        }
        if (change.from.line > this.lastLine()) {
            if (!sharedHistory) {
                this._rebaseHistoryForLinkedChange(change);
            }
            return;
        }

        let from = _copyPosition(change.from);
        let to = _copyPosition(change.to);
        let text = change.text.slice();
        if (from.line < this.firstLine()) {
            const shift = text.length - 1 -
                (this.firstLine() - from.line);
            this._shiftFirstLine(shift);
            from = {
                line: this.firstLine(),
                ch: 0
            };
            to = {
                line: to.line + shift,
                ch: to.ch
            };
            text = [text[text.length - 1]];
        }
        if (to.line > this.lastLine()) {
            to = {
                line: this.lastLine(),
                ch: (this.getLine(this.lastLine()) || "").length
            };
            text = [text[0]];
        }
        if (!sharedHistory) {
            this._rebaseHistoryForLinkedChange(change);
        }
        this._view.dispatch({
            changes: {
                from: this.indexFromPos(from),
                to: this.indexFromPos(to),
                insert: text.join("\n")
            },
            annotations: [
                this._originAnnotation.of(change.origin),
                this._addToHistoryAnnotation.of(false),
                this._bypassReadOnlyAnnotation.of(true),
                this._linkedChangeAnnotation.of(true)
            ]
        });
    };

    CodeMirror6Adapter.prototype._propagateLinkedChange = function (change) {
        const visited = new Set([this.doc]);
        const visit = function (doc, sharedHistory) {
            doc._links.forEach(function (link) {
                if (visited.has(link.doc)) {
                    return;
                }
                visited.add(link.doc);
                const sharesHistory = sharedHistory && Boolean(link.sharedHist);
                if (link.doc._adapter) {
                    link.doc._adapter._applyLinkedChange(change, sharesHistory);
                }
                visit(link.doc, sharesHistory);
            });
        };
        visit(this.doc, true);
    };

    CodeMirror6Adapter.prototype._dragDropExtension = function (enabled) {
        if (enabled !== false) {
            return [];
        }

        return CM6.EditorView.domEventHandlers({
            dragstart: function (event) {
                event.preventDefault();
                return true;
            },
            drop: function (event) {
                event.preventDefault();
                return true;
            }
        });
    };

    CodeMirror6Adapter.prototype._contentAttributesExtension = function () {
        return CM6.EditorView.contentAttributes.of({
            autocapitalize: this.getOption("autocapitalize") ? "on" : "off",
            autocomplete: "off",
            autocorrect: this.getOption("autocorrect") ? "on" : "off",
            spellcheck: this.getOption("spellcheck") ? "true" : "false"
        });
    };

    CodeMirror6Adapter.prototype._placeholderExtension = function () {
        const placeholder = this.getOption("placeholder");
        if (!placeholder) {
            return [];
        }
        return CM6.placeholder(function () {
            let element = placeholder;
            if (!element || !element.nodeType) {
                element = window.document.createElement("span");
                element.textContent = String(placeholder);
            }
            element.classList.add(
                "CodeMirror-placeholder",
                "CodeMirror-line-like"
            );
            return element;
        });
    };

    CodeMirror6Adapter.prototype._forwardGutterEvent = function (eventName, gutterName, view, line, event) {
        if (eventName === "gutterClick") {
            event.preventDefault();
        }

        const lineNumber = view.state.doc.lineAt(line.from).number - 1 +
            this._firstLine;
        this._emit(eventName, this, lineNumber, gutterName, event);
        return event.defaultPrevented;
    };

    CodeMirror6Adapter.prototype._gutterDomEventHandlers = function (gutterName) {
        return {
            mousedown: (view, line, event) => {
                return this._forwardGutterEvent("gutterClick", gutterName, view, line, event);
            },
            contextmenu: (view, line, event) => {
                return this._forwardGutterEvent("gutterContextMenu", gutterName, view, line, event);
            }
        };
    };

    CodeMirror6Adapter.prototype._lineNumbersExtension = function () {
        const lineNumberOptions = {
            domEventHandlers: this._gutterDomEventHandlers(LINE_NUMBER_GUTTER)
        };
        const firstLineNumber = this.getOption("firstLineNumber");
        const lineNumberFormatter = this.getOption("lineNumberFormatter");
        if (typeof lineNumberFormatter === "function") {
            lineNumberOptions.formatNumber = function (lineNumber) {
                return lineNumberFormatter(lineNumber + (firstLineNumber || 1) - 1);
            };
        } else if (firstLineNumber && firstLineNumber !== 1) {
            lineNumberOptions.formatNumber = function (lineNumber) {
                return String(lineNumber + firstLineNumber - 1);
            };
        }

        const extensions = [
            CM6.lineNumbers(lineNumberOptions)
        ];
        const markerSet = this._gutterRangeSetForName(
            this._view ? this._view.state.doc : null,
            LINE_NUMBER_GUTTER
        );
        if (CM6.lineNumberMarkers) {
            extensions.push(CM6.lineNumberMarkers.of(markerSet));
        }
        return extensions;
    };

    CodeMirror6Adapter.prototype._removeGutterMarkerRecords = function (lineNumber, gutterName) {
        const keepRecord = record => {
            return record.gutterName !== gutterName ||
                this.getLineNumber(record.lineHandle) !== lineNumber;
        };
        this._gutterMarkers = this._gutterMarkers.filter(keepRecord);
    };

    CodeMirror6Adapter.prototype._scheduleGutterRefresh = function () {
        if (this._gutterRefreshScheduled || !this._view || this._destroyed) {
            return;
        }
        this._gutterRefreshScheduled = true;
        Promise.resolve().then(() => {
            this._gutterRefreshScheduled = false;
            this._refreshGutters();
        });
    };

    CodeMirror6Adapter.prototype._createCustomGutterExtensions = function (gutters) {
        return gutters.map(gutterSpec => {
            const gutterName = gutterSpec.className;
            return CM6.gutter({
                class: gutterName,
                renderEmptyElements: true,
                markers: view => this._gutterRangeSet(view, gutterName),
                domEventHandlers: this._gutterDomEventHandlers(gutterName)
            });
        });
    };

    CodeMirror6Adapter.prototype._gutterExtensionGroups = function () {
        const configuredGutters = (this.getOption("gutters") || [])
            .map(_normalizeGutterSpec);
        const lineNumbersEnabled = Boolean(this.getOption("lineNumbers"));
        const lineNumberIndex = configuredGutters.findIndex(function (gutterSpec) {
            return gutterSpec.className === LINE_NUMBER_GUTTER;
        });
        const customGutters = configuredGutters.filter(function (gutterSpec) {
            return gutterSpec.className !== LINE_NUMBER_GUTTER;
        });

        if (!lineNumbersEnabled) {
            return {
                leading: customGutters,
                lineNumbers: null,
                trailing: []
            };
        }
        if (lineNumberIndex === -1) {
            return {
                leading: customGutters,
                lineNumbers: _normalizeGutterSpec(LINE_NUMBER_GUTTER),
                trailing: []
            };
        }
        return {
            leading: configuredGutters.slice(0, lineNumberIndex).filter(function (gutterSpec) {
                return gutterSpec.className !== LINE_NUMBER_GUTTER;
            }),
            lineNumbers: configuredGutters[lineNumberIndex],
            trailing: configuredGutters.slice(lineNumberIndex + 1).filter(function (gutterSpec) {
                return gutterSpec.className !== LINE_NUMBER_GUTTER;
            })
        };
    };

    CodeMirror6Adapter.prototype._createLeadingGutterExtensions = function () {
        const groups = this._gutterExtensionGroups();
        const extensions = this._createCustomGutterExtensions(groups.leading);
        if (groups.lineNumbers) {
            extensions.push(this._lineNumbersExtension());
        }
        return extensions;
    };

    CodeMirror6Adapter.prototype._createTrailingGutterExtensions = function () {
        return this._createCustomGutterExtensions(
            this._gutterExtensionGroups().trailing
        );
    };

    CodeMirror6Adapter.prototype._applyConfiguredGutterStyles = function () {
        if (!this._view) {
            return;
        }
        const groups = this._gutterExtensionGroups();
        const specs = groups.leading.concat(
            groups.lineNumbers ? [groups.lineNumbers] : [],
            groups.trailing
        );
        const gutters = Array.from(this._view.dom.querySelectorAll(".cm-gutter"));
        gutters.forEach(function (gutter, index) {
            const style = specs[index] && specs[index].style || "";
            const previousStyle =
                gutter.dataset.phoenixLegacyGutterStyle || "";
            if (style === previousStyle) {
                return;
            }
            gutter.style.cssText = style;
            if (style) {
                gutter.dataset.phoenixLegacyGutterStyle = style;
            } else {
                delete gutter.dataset.phoenixLegacyGutterStyle;
            }
        });
    };

    CodeMirror6Adapter.prototype._editorAttributes = function (view) {
        const currentManagedClasses = new Set(["cm-editor", "cm-focused"]);
        String(view.themeClasses || "").split(/\s+/).filter(Boolean).forEach(function (className) {
            currentManagedClasses.add(className);
        });

        const managedClasses = new Set(this._managedRootClasses);
        currentManagedClasses.forEach(function (className) {
            managedClasses.add(className);
        });
        managedClasses.add("CodeMirror-focused");

        const compatibilityClasses = new Set(["CodeMirror", "phoenix-codemirror-6"]);
        Array.from(view.dom.classList).forEach(function (className) {
            if (!managedClasses.has(className)) {
                compatibilityClasses.add(className);
            }
        });
        String(this.getOption("theme") || "default")
            .split(/\s+/)
            .filter(Boolean)
            .forEach(function (themeName) {
                compatibilityClasses.add(`cm-s-${themeName}`);
            });
        if (view.hasFocus) {
            compatibilityClasses.add("CodeMirror-focused");
        }

        this._managedRootClasses = currentManagedClasses;
        return {
            class: Array.from(compatibilityClasses).join(" "),
            "data-editor-engine": "codemirror6"
        };
    };

    CodeMirror6Adapter.prototype._setFocusState = function (focused) {
        focused = Boolean(focused);
        if (this._view) {
            this._view.dom.classList.toggle("CodeMirror-focused", focused);
        }
        if (this._focusState === focused) {
            return;
        }
        this._focusState = focused;
        this._emit(focused ? "focus" : "blur", this._instance());
    };

    CodeMirror6Adapter.prototype._captureFocusedLineWidget = function () {
        if (!this._view) {
            return null;
        }
        const activeElement = this._view.root.activeElement;
        const record = this._lineWidgets.find(function (candidate) {
            return !candidate.cleared && candidate.node &&
                (candidate.node === activeElement ||
                    candidate.node.contains(activeElement));
        });
        if (!record) {
            return null;
        }
        const editorRoot = activeElement.closest &&
            activeElement.closest(".CodeMirror");
        return {
            element: activeElement,
            editor: editorRoot && editorRoot.CodeMirror !== this ?
                editorRoot.CodeMirror :
                null
        };
    };

    CodeMirror6Adapter.prototype._restoreFocusedLineWidget = function (focusedWidget) {
        if (!focusedWidget || !this._view) {
            return;
        }
        if (focusedWidget.editor && typeof focusedWidget.editor.focus === "function") {
            const editorRoot = typeof focusedWidget.editor.getWrapperElement === "function" ?
                focusedWidget.editor.getWrapperElement() :
                null;
            const activeElement = this._view.root.activeElement;
            const focusWasDropped = !activeElement ||
                activeElement === this._view.dom.ownerDocument.body;
            const hostTookFocus = activeElement === this._contentElement;
            const editorStillHasFocus = editorRoot &&
                editorRoot.contains(activeElement);
            if (editorRoot && editorRoot.isConnected &&
                    !focusedWidget.editor._destroyed &&
                    (focusWasDropped || hostTookFocus || editorStillHasFocus)) {
                focusedWidget.editor.focus();
                return;
            }
        }
        if (!focusedWidget.element || !focusedWidget.element.isConnected) {
            return;
        }
        const activeElement = this._view.root.activeElement;
        if (activeElement && activeElement !== this._view.dom.ownerDocument.body) {
            return;
        }
        focusedWidget.element.focus({ preventScroll: true });
    };

    CodeMirror6Adapter.prototype._gutterRangeSetForName = function (doc, gutterName) {
        const ranges = [];
        const addMarkerRange = record => {
            const lineNumber = this.getLineNumber(record.lineHandle);
            if (lineNumber === null || lineNumber === undefined) {
                return false;
            }
            if (record.gutterName !== gutterName || !doc ||
                    lineNumber < this.firstLine() ||
                    lineNumber > this.lastLine()) {
                return true;
            }

            const line = doc.line(lineNumber - this._firstLine + 1);
            ranges.push(new PhoenixGutterMarker(record).range(line.from));
            return true;
        };

        this._gutterMarkers = this._gutterMarkers.filter(addMarkerRange);
        return CM6.RangeSet.of(ranges, true);
    };

    CodeMirror6Adapter.prototype._gutterRangeSet = function (view, gutterName) {
        return this._gutterRangeSetForName(view.state.doc, gutterName);
    };

    CodeMirror6Adapter.prototype._gutterLineClassRangeSet = function (doc) {
        const ranges = [];
        this._lineClasses = this._lineClasses.filter(record => {
            const lineNumber = this.getLineNumber(record.lineHandle);
            if (lineNumber === null || lineNumber === undefined ||
                    lineNumber < this.firstLine() ||
                    lineNumber > this.lastLine()) {
                return false;
            }
            if (record.where === "gutter" || record.where === "wrap") {
                const line = doc.line(lineNumber - this._firstLine + 1);
                ranges.push(new PhoenixGutterLineClass(record.className).range(line.from));
            }
            return true;
        });
        return CM6.RangeSet.of(ranges, true);
    };

    CodeMirror6Adapter.prototype._overwriteInputHandler = function () {
        return CM6.EditorView.inputHandler.of((view, _from, _to, text, insert) => {
            if (!this.state.overwrite || !text) {
                return false;
            }

            const defaultTransaction = insert();
            if (!defaultTransaction.isUserEvent("input.type")) {
                return false;
            }

            const lastInsertedLineLength = text.slice(text.lastIndexOf("\n") + 1).length;
            const replacement = view.state.changeByRange(function (range) {
                let to = range.to;
                if (range.empty) {
                    const line = view.state.doc.lineAt(range.head);
                    to = Math.min(line.to, range.head + lastInsertedLineLength);
                }
                return {
                    changes: {
                        from: range.from,
                        to: to,
                        insert: text
                    },
                    range: CM6.EditorSelection.cursor(range.from + text.length, -1)
                };
            });

            view.dispatch({
                annotations: defaultTransaction.annotations,
                changes: replacement.changes,
                effects: replacement.effects.concat(defaultTransaction.effects),
                scrollIntoView: defaultTransaction.scrollIntoView,
                selection: replacement.selection
            });
            return true;
        });
    };

    CodeMirror6Adapter.prototype._compatHighlightDecorationSet = function (view) {
        const ranges = [];
        const visibleLines = new Set();
        const lineStyleClasses = new Map();
        view.visibleRanges.forEach(function (range) {
            let line = view.state.doc.lineAt(range.from);
            while (line.from <= range.to) {
                visibleLines.add(line.number);
                if (line.number >= view.state.doc.lines) {
                    break;
                }
                line = view.state.doc.line(line.number + 1);
            }
        });

        visibleLines.forEach(lineNumber => {
            const line = view.state.doc.line(lineNumber);
            const legacyLineNumber = lineNumber - 1 + this._firstLine;
            const modeLineClasses = {
                background: new Set(),
                text: new Set()
            };
            lineStyleClasses.set(lineNumber, modeLineClasses);
            this.getLineTokens(legacyLineNumber, true).forEach(function (token) {
                const classes = _normalizeStyleClasses(
                    _extractLineClasses(token.type, modeLineClasses)
                );
                if (!classes || token.end <= token.start) {
                    return;
                }
                ranges.push(CM6.Decoration.mark({
                    class: classes
                }).range(line.from + token.start, line.from + token.end));
            });
            if (!line.length) {
                const mode = this.getMode();
                const state = _modeStateBefore(
                    this,
                    mode,
                    legacyLineNumber
                );
                _extractLineClasses(
                    _readBlankLineStyle(mode, state),
                    modeLineClasses
                );
            }
        });

        if (this.getOption("addModeClass")) {
            const modeName = _modeName(this.getOption("mode"))
                .replace(/^text\//, "")
                .replace(/^application\//, "")
                .replace(/[^a-z0-9_-]+/g, "-");
            visibleLines.forEach(function (lineNumber) {
                const line = view.state.doc.line(lineNumber);
                if (line.to > line.from) {
                    ranges.push(CM6.Decoration.mark({
                        class: `cm-m-${modeName}`
                    }).range(line.from, line.to));
                }
            });
        }

        this._overlays.forEach(overlayRecord => {
            const mode = overlayRecord.mode;
            visibleLines.forEach(lineNumber => {
                const line = view.state.doc.line(lineNumber);
                const legacyLineNumber = lineNumber - 1 + this._firstLine;
                const modeLineClasses = lineStyleClasses.get(lineNumber);
                const baseStyles = this.getLineTokens(
                    legacyLineNumber,
                    true
                ).map(function (token) {
                    return {
                        from: token.start,
                        to: token.end,
                        type: _stripLineClasses(token.type)
                    };
                });
                const stream = new CodeMirror.StringStream(
                    line.text,
                    this.getOption("tabSize") || 4,
                    _legacyLineOracle(
                        this,
                        legacyLineNumber,
                        baseStyles
                    )
                );
                while (!stream.eol()) {
                    stream.start = stream.pos;
                    const style = _readModeToken(mode, stream, true);
                    const tokenStyle = _extractLineClasses(
                        style,
                        modeLineClasses
                    );
                    if (visibleLines.has(lineNumber) && tokenStyle &&
                            stream.pos > stream.start) {
                        const classes = [
                            _normalizeStyleClasses(tokenStyle),
                            overlayRecord.opaque ? "cm-overlay-opaque" : ""
                        ].filter(Boolean).join(" ");
                        if (classes) {
                            ranges.push(CM6.Decoration.mark({
                                class: classes
                            }).range(line.from + stream.start, line.from + stream.pos));
                        }
                    }
                }
                if (line.text.length === 0) {
                    _extractLineClasses(
                        _readBlankLineStyle(mode, true),
                        modeLineClasses
                    );
                }
            });
        });

        visibleLines.forEach(function (lineNumber) {
            const modeLineClasses = lineStyleClasses.get(lineNumber);
            const classes = Array.from(new Set(
                Array.from(modeLineClasses.text)
                    .concat(Array.from(modeLineClasses.background))
            )).join(" ");
            if (!classes) {
                return;
            }
            const line = view.state.doc.line(lineNumber);
            ranges.push(CM6.Decoration.line({
                attributes: {
                    class: classes
                }
            }).range(line.from));
        });

        return CM6.Decoration.set(ranges, true);
    };

    CodeMirror6Adapter.prototype._compatHighlightExtension = function () {
        const adapter = this;
        return CM6.ViewPlugin.fromClass(class {
            constructor(view) {
                this.decorations = adapter._compatHighlightDecorationSet(view);
            }

            update(update) {
                if (update.docChanged || update.viewportChanged || update.geometryChanged) {
                    this.decorations = adapter._compatHighlightDecorationSet(update.view);
                }
            }
        }, {
            decorations: function (plugin) {
                return plugin.decorations;
            }
        });
    };

    CodeMirror6Adapter.prototype._createExtensions = function () {
        const self = this;
        const options = this._options;
        const tabSize = options.tabSize || 4;
        const indentText = _indentUnitText(options);

        return [
            CM6.EditorState.allowMultipleSelections.of(true),
            this._readOnlyCompartment.of(CM6.EditorState.readOnly.of(Boolean(options.readOnly))),
            this._editableCompartment.of(CM6.EditorView.editable.of(
                options.readOnly !== "nocursor"
            )),
            this._lineNumbersCompartment.of(this._createLeadingGutterExtensions()),
            this._lineWrappingCompartment.of(options.lineWrapping ? CM6.EditorView.lineWrapping : []),
            this._activeLineCompartment.of(
                _activeLineExtension(options.styleActiveLine)
            ),
            this._closeBracketsCompartment.of(
                _closeBracketsExtension(this, options.autoCloseBrackets)
            ),
            this._bracketMatchingCompartment.of([]),
            this._selectionMatchesCompartment.of(
                _selectionMatchExtension(
                    this,
                    options.highlightSelectionMatches
                )
            ),
            this._drawSelectionCompartment.of(_drawSelectionExtension(options)),
            this._tabSizeCompartment.of(CM6.EditorState.tabSize.of(tabSize)),
            this._indentUnitCompartment.of(CM6.indentUnit.of(indentText)),
            this._languageCompartment.of(_languageExtensionForMode(options.mode, options)),
            this._scrollPastEndCompartment.of(options.scrollPastEnd ? CM6.scrollPastEnd() : []),
            this._smartIndentCompartment.of(options.smartIndent === false ? [] : CM6.indentOnInput()),
            this._dragDropCompartment.of(this._dragDropExtension(options.dragDrop)),
            this._contentAttributesCompartment.of(this._contentAttributesExtension()),
            this._placeholderCompartment.of(this._placeholderExtension()),
            this._decorationsCompartment.of(CM6.EditorView.decorations.of(CM6.Decoration.none)),
            this._compatHighlightCompartment.of(this._compatHighlightExtension()),
            this._gutterLineClassesCompartment.of(CM6.gutterLineClass.of(CM6.RangeSet.empty)),
            this._guttersCompartment.of(this._createTrailingGutterExtensions()),
            this._overwriteInputHandler(),
            CM6.EditorView.updateListener.of(function (update) {
                if (update.focusChanged) {
                    self._setFocusState(update.view.hasFocus);
                }
            }),
            CM6.EditorState.transactionFilter.of(function (transaction) {
                if (!transaction.docChanged ||
                        transaction.annotation(self._bypassReadOnlyAnnotation)) {
                    return transaction;
                }
                if (self.getOption("disableInput") && (
                    transaction.isUserEvent("input") ||
                    transaction.isUserEvent("delete") ||
                    transaction.isUserEvent("move.drop")
                )) {
                    return [];
                }
                let blocked = false;
                transaction.changes.iterChangedRanges(function (from, to) {
                    if (blocked) {
                        return;
                    }
                    blocked = self._markers.some(function (marker) {
                        if (marker._cleared || !marker.readOnly) {
                            return false;
                        }
                        if (from === to) {
                            return from > marker._from && from < marker._to;
                        }
                        return from < marker._to && to > marker._from;
                    });
                });
                return blocked ? [] : transaction;
            }),
            CM6.highlightSpecialChars(),
            CM6.dropCursor(),
            CM6.rectangularSelection(),
            CM6.crosshairCursor(),
            CM6.syntaxHighlighting(phoenixHighlightStyle),
            CM6.EditorView.domEventHandlers({
                keydown: function (event) {
                    return self._handleKeyDown(event);
                }
            }),
            CM6.keymap.of([{
                key: "Mod-z",
                preventDefault: true,
                run: function () {
                    self.undo();
                    return true;
                }
            }, {
                key: "Shift-Mod-z",
                preventDefault: true,
                run: function () {
                    self.redo();
                    return true;
                }
            }, {
                key: "Mod-y",
                preventDefault: true,
                run: function () {
                    self.redo();
                    return true;
                }
            }].concat(CM6.defaultKeymap, CM6.searchKeymap)),
            CM6.EditorView.clickAddsSelectionRange.of(function (event) {
                return event.altKey;
            }),
            CM6.EditorView.editorAttributes.of(function (view) {
                return self._editorAttributes(view);
            }),
            CM6.EditorView.domEventHandlers({
                keypress: function (event) {
                    return self._handleKeyPress(event);
                },
                keyup: function (event) {
                    return self._handleKeyUp(event);
                },
                focus: function (_event, view) {
                    self._setFocusState(view.hasFocus);
                    return false;
                },
                blur: function (_event, view) {
                    self._setFocusState(view.hasFocus);
                    return false;
                },
                cut: function (event) {
                    return self._handleClipboardEvent("cut", event);
                },
                copy: function (event) {
                    return self._handleClipboardEvent("copy", event);
                },
                paste: function (event) {
                    self._emit("paste", self._instance(), event);
                    return event.defaultPrevented;
                },
                drop: function (event) {
                    self._emit("drop", self._instance(), event);
                    return event.defaultPrevented;
                },
                dragstart: function (event) {
                    self._emit("dragstart", self._instance(), event);
                    return event.defaultPrevented;
                },
                dragenter: function (event) {
                    self._emit("dragenter", self._instance(), event);
                    return event.defaultPrevented;
                },
                dragover: function (event) {
                    self._emit("dragover", self._instance(), event);
                    return event.defaultPrevented;
                },
                dragleave: function (event) {
                    self._emit("dragleave", self._instance(), event);
                    return event.defaultPrevented;
                },
                mousedown: function (event) {
                    return self._handleMouseDown(event);
                },
                dblclick: function (event) {
                    self._emit("dblclick", self._instance(), event);
                    return event.defaultPrevented;
                },
                contextmenu: function (event) {
                    self._emit("contextmenu", self._instance(), event);
                    return event.defaultPrevented;
                },
                touchstart: function (event) {
                    self._emit("touchstart", self._instance(), event);
                    return event.defaultPrevented;
                }
            }),
            CM6.EditorView.updateListener.of(function (update) {
                if (update.geometryChanged) {
                    self._scheduleRulerRefresh();
                    self._refreshLineWidgetLayouts();
                    self._invalidateRenderedLines();
                }
                if (update.docChanged ||
                        update.geometryChanged ||
                        update.viewportChanged) {
                    self._refreshScrollbarModel();
                    self._decorateDOM();
                    if (update.viewportChanged) {
                        self._emitViewportChange();
                    }
                    if (update.viewportChanged &&
                            !update.docChanged &&
                            !update.geometryChanged) {
                        self._scheduleRenderLines();
                    }
                } else if (update.selectionSet) {
                    self._decorateDOM();
                }
            }),
            CM6.EditorView.theme({
                "&": {
                    height: "100%"
                },
                ".cm-scroller": {
                    overflow: "auto"
                }
            })
        ];
    };

    CodeMirror6Adapter.prototype._originForTransaction = function (transaction, edit) {
        const annotatedOrigin = transaction.annotation(this._originAnnotation);
        if (annotatedOrigin !== undefined) {
            return annotatedOrigin;
        }
        if (transaction.isUserEvent("input.paste")) {
            return "paste";
        }
        if (transaction.isUserEvent("input.drop")) {
            return "paste";
        }
        if (transaction.isUserEvent("move.drop")) {
            return edit && edit.text ? "paste" : "drag";
        }
        if (transaction.isUserEvent("delete.cut")) {
            return "cut";
        }
        if (transaction.isUserEvent("delete")) {
            return "+delete";
        }
        if (transaction.isUserEvent("input")) {
            return "+input";
        }
        return undefined;
    };

    CodeMirror6Adapter.prototype._createLegacyChange = function (
        doc,
        from,
        to,
        text,
        origin
    ) {
        const change = {
            from: _positionFromOffset(
                doc,
                from,
                this._firstLine
            ),
            to: _positionFromOffset(
                doc,
                to,
                this._firstLine
            ),
            text: Array.isArray(text) ? text.slice() : _splitLines(text),
            removed: _splitLines(doc.sliceString(from, to)),
            origin: origin,
            _fromIndex: from,
            _toIndex: to,
            _cancelled: false,
            cancel: function () {
                this._cancelled = true;
            }
        };
        if (origin !== "undo" && origin !== "redo") {
            change.update = function (newFrom, newTo, newText, newOrigin) {
                if (newFrom) {
                    this.from = _copyPosition(newFrom);
                }
                if (newTo) {
                    this.to = _copyPosition(newTo);
                }
                if (newText !== undefined) {
                    this.text = Array.isArray(newText) ? newText.slice() : _splitLines(newText);
                }
                if (newOrigin !== undefined) {
                    this.origin = newOrigin;
                }
                this._updated = true;
            };
        }
        return change;
    };

    CodeMirror6Adapter.prototype._changeObjectsForTransaction = function (transaction) {
        const changes = [];
        transaction.changes.iterChanges((from, to, _newFrom, _newTo, inserted) => {
            const origin = this._originForTransaction(transaction, {
                from: from,
                to: to,
                text: inserted.toString()
            });
            changes.push(this._createLegacyChange(
                transaction.startState.doc,
                from,
                to,
                inserted.toString(),
                origin
            ));
        });
        return changes.reverse();
    };

    CodeMirror6Adapter.prototype._selectionAfterBeforeChange = function (
        selection,
        originalChanges,
        replacementChanges,
        finalDoc
    ) {
        if (!selection) {
            return null;
        }
        const maxOffset = finalDoc.length;
        const mapPosition = function (position, association) {
            const originalPosition = originalChanges.invertedDesc.mapPos(
                position,
                association
            );
            return replacementChanges.mapPos(originalPosition, association);
        };
        return CM6.EditorSelection.create(selection.ranges.map(function (range) {
            const forward = range.anchor <= range.head;
            const anchorAssociation = range.empty ? 1 : forward ? -1 : 1;
            const headAssociation = range.empty ? 1 : forward ? 1 : -1;
            return CM6.EditorSelection.range(
                _clamp(
                    mapPosition(range.anchor, anchorAssociation),
                    0,
                    maxOffset
                ),
                _clamp(
                    mapPosition(range.head, headAssociation),
                    0,
                    maxOffset
                )
            );
        }), Math.min(selection.mainIndex, selection.ranges.length - 1));
    };

    CodeMirror6Adapter.prototype._selectionAfterLegacyChange = function (
        selection,
        change,
        changeSet
    ) {
        const from = change._fromIndex;
        const to = change._toIndex;
        const changeEnd = from + change.text.join("\n").length;
        const mapPosition = function (position) {
            if (position < from) {
                return position;
            }
            if (position <= to) {
                return changeEnd;
            }
            return changeSet.mapPos(position, 1);
        };
        return CM6.EditorSelection.create(selection.ranges.map(function (range) {
            return CM6.EditorSelection.range(
                mapPosition(range.anchor),
                mapPosition(range.head)
            );
        }), selection.mainIndex);
    };

    CodeMirror6Adapter.prototype._skipAtomicSelectionOffset = function (
        offset,
        oldOffset,
        bias,
        mayClear,
        doc,
        depth
    ) {
        if (depth > this._markers.length * 2 + 2) {
            return offset;
        }

        const markers = this._markers.slice();
        for (let index = 0; index < markers.length; index++) {
            const marker = markers[index];
            if (marker._cleared || marker._hidden || marker.type !== "range") {
                continue;
            }

            const preventCursorLeft = Object.prototype.hasOwnProperty.call(marker, "selectLeft") ?
                !marker.selectLeft :
                Boolean(marker.inclusiveLeft);
            const preventCursorRight = Object.prototype.hasOwnProperty.call(marker, "selectRight") ?
                !marker.selectRight :
                Boolean(marker.inclusiveRight);
            const insideMarker =
                (offset > marker._from ||
                    preventCursorLeft && offset === marker._from) &&
                (offset < marker._to ||
                    preventCursorRight && offset === marker._to);
            if (!insideMarker) {
                continue;
            }

            if (mayClear) {
                CodeMirror.signal(marker, "beforeCursorEnter");
                if (marker._cleared) {
                    return this._skipAtomicSelectionOffset(
                        offset,
                        oldOffset,
                        bias,
                        mayClear,
                        doc,
                        depth + 1
                    );
                }
                if (marker.clearOnEnter) {
                    marker.clear();
                    return this._skipAtomicSelectionOffset(
                        offset,
                        oldOffset,
                        bias,
                        mayClear,
                        doc,
                        depth + 1
                    );
                }
            }
            if (!marker.atomic && !marker.collapsed && !marker.replacedWith) {
                continue;
            }

            let preferBefore;
            if (oldOffset < marker._from) {
                preferBefore = true;
            } else if (oldOffset > marker._to) {
                preferBefore = false;
            } else {
                preferBefore = bias < 0;
            }

            const before = preventCursorLeft ? marker._from - 1 : marker._from;
            const after = preventCursorRight ? marker._to + 1 : marker._to;
            const candidates = preferBefore ? [before, after] : [after, before];
            for (let candidateIndex = 0; candidateIndex < candidates.length; candidateIndex++) {
                const candidate = candidates[candidateIndex];
                if (candidate < 0 || candidate > doc.length || candidate === offset) {
                    continue;
                }
                const result = this._skipAtomicSelectionOffset(
                    candidate,
                    offset,
                    bias,
                    mayClear,
                    doc,
                    depth + 1
                );
                if (result !== null) {
                    return result;
                }
            }
            return null;
        }

        return offset;
    };

    CodeMirror6Adapter.prototype._applyBeforeSelectionChange = function (
        selection,
        doc,
        origin,
        bias,
        oldSelection
    ) {
        let updatedRanges = selection.ranges.map(range => {
            return _selectionFromOffsets(range, doc, this._firstLine);
        });
        let selectionUpdated = false;
        const selectionObject = {
            ranges: updatedRanges.map(_copySelection),
            origin: origin,
            update: function (ranges) {
                updatedRanges = ranges.map(_copySelection);
                selectionUpdated = true;
            }
        };
        this._signalBeforeSelectionChange(selectionObject);
        const previousSelection = oldSelection &&
            oldSelection.ranges.length === updatedRanges.length ?
            oldSelection :
            null;
        const primaryIndex = selectionUpdated ?
            updatedRanges.length - 1 :
            Math.min(selection.mainIndex, updatedRanges.length - 1);
        let selectionBias = bias;
        if (!selectionBias) {
            const primaryHead = this.indexFromPos(updatedRanges[primaryIndex].head);
            const previousHead = previousSelection ?
                previousSelection.ranges[primaryIndex].head :
                primaryHead;
            selectionBias = primaryHead < previousHead ? -1 : 1;
        }

        updatedRanges.forEach((range, index) => {
            const anchor = this.indexFromPos(range.anchor);
            const head = this.indexFromPos(range.head);
            const previousRange = previousSelection && previousSelection.ranges[index];
            const adjustedAnchor = this._skipAtomicSelectionOffset(
                anchor,
                previousRange ? previousRange.anchor : anchor,
                selectionBias,
                true,
                doc,
                0
            );
            const adjustedHead = head === anchor ?
                adjustedAnchor :
                this._skipAtomicSelectionOffset(
                    head,
                    previousRange ? previousRange.head : head,
                    selectionBias,
                    true,
                    doc,
                    0
                );
            range.anchor = _positionFromOffset(
                doc,
                adjustedAnchor === null ? 0 : adjustedAnchor,
                this._firstLine
            );
            range.head = _positionFromOffset(
                doc,
                adjustedHead === null ? 0 : adjustedHead,
                this._firstLine
            );
        });
        return CM6.EditorSelection.create(updatedRanges.map(range => {
            return CM6.EditorSelection.range(
                this.indexFromPos(range.anchor),
                this.indexFromPos(range.head)
            );
        }), primaryIndex);
    };

    CodeMirror6Adapter.prototype._prepareTransaction = function (transaction, view) {
        const linkedChange = Boolean(
            transaction.annotation(this._linkedChangeAnnotation)
        );
        const skipBeforeChange = Boolean(
            transaction.annotation(this._skipBeforeChangeAnnotation)
        );
        const syntheticChangeSpecs =
            transaction.annotation(this._syntheticChangesAnnotation) || [];
        let preparedTransaction = transaction;
        if (!transaction.docChanged) {
            if (transaction.selection) {
                const selection = this._applyBeforeSelectionChange(
                    transaction.newSelection,
                    transaction.newDoc,
                    transaction.annotation(this._originAnnotation),
                    transaction.annotation(this._selectionBiasAnnotation),
                    view.state.selection
                );
                if (!_sameSelection(selection, transaction.newSelection)) {
                    preparedTransaction = view.state.update({
                        selection: selection,
                        annotations: transaction.annotations,
                        effects: transaction.effects,
                        scrollIntoView: transaction.scrollIntoView
                    });
                }
            }
            if (!syntheticChangeSpecs.length) {
                return {
                    transaction: preparedTransaction,
                    changes: []
                };
            }
        }

        const changes = transaction.docChanged ?
            this._changeObjectsForTransaction(transaction) :
            syntheticChangeSpecs.map(change => {
                return this._createLegacyChange(
                    transaction.startState.doc,
                    change.from,
                    change.to,
                    change.insert,
                    change.origin
                );
            });
        if (linkedChange || skipBeforeChange) {
            return {
                transaction: preparedTransaction,
                changes: changes,
                forceHistory: syntheticChangeSpecs.length > 0
            };
        }
        changes.forEach(change => {
            this._signalBeforeChange(change);
        });
        const activeChanges = changes.filter(function (change) {
            return !change._cancelled;
        });
        const changedByListener = activeChanges.length !== changes.length ||
            activeChanges.some(function (change) {
                return change._updated;
            });
        if (!activeChanges.length) {
            return transaction.docChanged ? null : {
                transaction: preparedTransaction,
                changes: []
            };
        }
        if (!changedByListener) {
            return {
                transaction: preparedTransaction,
                changes: activeChanges,
                forceHistory: syntheticChangeSpecs.length > 0
            };
        }

        const changeSpecs = activeChanges.map(change => {
            return {
                from: this.indexFromPos(change.from),
                to: this.indexFromPos(change.to),
                insert: change.text.join("\n")
            };
        }).sort(function (left, right) {
            return left.from - right.from || left.to - right.to;
        });
        const preliminary = view.state.update({
            changes: changeSpecs
        });
        const selection = this._selectionAfterBeforeChange(
            transaction.selection ? transaction.newSelection : null,
            transaction.changes,
            preliminary.changes,
            preliminary.newDoc
        );
        const replacement = view.state.update({
            changes: changeSpecs,
            selection: selection || undefined,
            annotations: transaction.annotations,
            scrollIntoView: transaction.scrollIntoView
        });
        return {
            transaction: replacement,
            changes: this._changeObjectsForTransaction(replacement).map(function (change, index) {
                change.origin = activeChanges[index] ? activeChanges[index].origin : change.origin;
                return change;
            }),
            forceHistory: syntheticChangeSpecs.length > 0 && !replacement.docChanged
        };
    };

    CodeMirror6Adapter.prototype._lineHandleChangeEvents = function (
        legacyChanges,
        documentChanges,
        oldDoc
    ) {
        const firstLine = this._firstLine;
        const wholeLineUpdateBefore =
            this.getOption("wholeLineUpdateBefore") !== false;
        const eventsByChange = legacyChanges.map(function () {
            return [];
        });
        legacyChanges.forEach((change, changeIndex) => {
            const fromLineNumber = _clamp(
                change.from.line - firstLine + 1,
                1,
                oldDoc.lines
            );
            const toLineNumber = _clamp(
                change.to.line - firstLine + 1,
                1,
                oldDoc.lines
            );
            const fromLine = oldDoc.line(fromLineNumber);
            const toLine = oldDoc.line(toLineNumber);
            const wholeLineUpdate = wholeLineUpdateBefore &&
                change.from.ch === 0 &&
                change.to.ch === 0 &&
                change.text[change.text.length - 1] === "";
            const changedPositions = new Set();
            if (wholeLineUpdate) {
                changedPositions.add(toLine.from);
            } else {
                changedPositions.add(fromLine.from);
                if (fromLine.number !== toLine.number &&
                        change.text.length > 1) {
                    changedPositions.add(toLine.from);
                }
            }

            this._lineHandles.forEach(handle => {
                if (!handle._deleted &&
                        changedPositions.has(handle._position)) {
                    eventsByChange[changeIndex].push({
                        handle: handle,
                        change: documentChanges[changeIndex]
                    });
                }
            });
        });
        return eventsByChange;
    };

    CodeMirror6Adapter.prototype._mapMetadata = function (changes, oldDoc, newDoc) {
        const wholeLineUpdateBefore = this.getOption("wholeLineUpdateBefore") !== false;
        const deletedHandles = [];
        this._lineHandles.forEach(handle => {
            if (handle._deleted) {
                return;
            }
            const handlePosition = _clamp(
                handle._position,
                0,
                oldDoc.length
            );
            let deletedBoundary = false;
            changes.iterChangedRanges(function (from, to, newFrom, newTo) {
                const fromLineStart = oldDoc.lineAt(
                    _clamp(from, 0, oldDoc.length)
                ).from;
                const toLineStart = oldDoc.lineAt(
                    _clamp(to, 0, oldDoc.length)
                ).from;
                const insertedSpansMultipleLines =
                    newDoc.lineAt(_clamp(newFrom, 0, newDoc.length)).number !==
                    newDoc.lineAt(_clamp(newTo, 0, newDoc.length)).number;
                const insertedText = newDoc.sliceString(newFrom, newTo);
                const wholeLineUpdate = wholeLineUpdateBefore &&
                    from === fromLineStart &&
                    to === toLineStart &&
                    (!insertedText || insertedText.endsWith("\n"));
                const removesHandle = wholeLineUpdate ?
                    handlePosition >= fromLineStart &&
                        handlePosition < toLineStart :
                    fromLineStart !== toLineStart &&
                        handlePosition > fromLineStart &&
                        (handlePosition < toLineStart ||
                            handlePosition === toLineStart &&
                                !insertedSpansMultipleLines);
                if (removesHandle) {
                    deletedBoundary = true;
                }
            });
            if (deletedBoundary) {
                handle._deleted = true;
                handle.parent = null;
                deletedHandles.push(handle);
                return;
            }
            const mapped = changes.mapPos(handlePosition, 1);
            handle._position = newDoc.lineAt(_clamp(mapped, 0, newDoc.length)).from;
        });
        deletedHandles.sort(function (left, right) {
            return left._position - right._position;
        });

        this._markers.forEach(marker => {
            if (marker._cleared || marker._hidden) {
                return;
            }
            if (marker.type === "bookmark") {
                let deletedInterior = false;
                let association = marker.insertLeft ? 1 : -1;
                changes.iterChangedRanges(function (from, to) {
                    if (marker._from > from && marker._from < to) {
                        deletedInterior = true;
                    } else if (from !== to && marker._from === from) {
                        association = -1;
                    } else if (from !== to && marker._from === to) {
                        association = 1;
                    }
                });
                if (deletedInterior) {
                    const wasHidden = marker._hidden;
                    marker._hidden = true;
                    this._syncMarkerLines(marker);
                    if (!wasHidden && !this._historyApplying) {
                        this._pendingMarkerVisibilityEvents.push({
                            marker: marker,
                            eventName: "hide"
                        });
                    }
                    return;
                }
                marker._from = changes.mapPos(
                    marker._from,
                    association
                );
                marker._to = marker._from;
                this._syncMarkerLines(marker);
                return;
            }
            const previousFrom = marker._from;
            const previousTo = marker._to;
            const wasHidden = marker._hidden;
            marker._from = changes.mapPos(
                previousFrom,
                marker.inclusiveLeft ? -1 : 1
            );
            marker._to = changes.mapPos(
                previousTo,
                marker.inclusiveRight ? 1 : -1
            );
            changes.iterChangedRanges(function (fromA, toA, fromB, toB) {
                if (fromA === toA) {
                    return;
                }
                if (!marker.inclusiveLeft &&
                        previousFrom === fromA &&
                        previousTo > fromA) {
                    marker._from = toB;
                }
                if (!marker.inclusiveRight &&
                        previousTo === toA &&
                        previousFrom < toA) {
                    marker._to = fromB;
                }
            });
            if (marker._to < marker._from) {
                marker._to = marker._from;
            }
            marker._hidden = marker._from === marker._to &&
                marker.clearWhenEmpty !== false;
            this._syncMarkerLines(marker);
            if (wasHidden !== marker._hidden && !this._historyApplying) {
                this._pendingMarkerVisibilityEvents.push({
                    marker: marker,
                    eventName: marker._hidden ? "hide" : "unhide"
                });
            }
        });
        return deletedHandles;
    };

    CodeMirror6Adapter.prototype._replaceMetadataForFullChange = function () {
        const deletedHandles = Array.from(this._lineHandles).filter(function (handle) {
            return !handle._deleted;
        }).sort(function (left, right) {
            return left._position - right._position;
        });
        deletedHandles.forEach(function (handle) {
            handle._deleted = true;
            handle.parent = null;
        });

        this._markers.forEach(marker => {
            if (marker._cleared) {
                return;
            }
            const wasHidden = marker._hidden;
            marker._hidden = true;
            this._syncMarkerLines(marker);
            if (!wasHidden && !this._historyApplying) {
                this._pendingMarkerVisibilityEvents.push({
                    marker: marker,
                    eventName: "hide"
                });
            }
        });
        return deletedHandles;
    };

    CodeMirror6Adapter.prototype._captureMarkerSnapshot = function () {
        return this._markers.filter(function (marker) {
            return !marker._cleared;
        }).map(function (marker) {
            return {
                id: marker._id,
                from: marker._from,
                to: marker._to,
                hidden: marker._hidden
            };
        });
    };

    CodeMirror6Adapter.prototype._historyStepForTransaction = function (transaction) {
        const undoChanges = [];
        const redoChanges = [];
        transaction.changes.iterChanges(function (fromA, toA, fromB, toB, inserted) {
            undoChanges.push({
                from: fromB,
                to: toB,
                fromPos: _positionFromOffset(
                    transaction.newDoc,
                    fromB,
                    this._firstLine
                ),
                toPos: _positionFromOffset(
                    transaction.newDoc,
                    toB,
                    this._firstLine
                ),
                insert: transaction.startState.doc.sliceString(fromA, toA)
            });
            redoChanges.push({
                from: fromA,
                to: toA,
                fromPos: _positionFromOffset(
                    transaction.startState.doc,
                    fromA,
                    this._firstLine
                ),
                toPos: _positionFromOffset(
                    transaction.startState.doc,
                    toA,
                    this._firstLine
                ),
                insert: inserted.toString()
            });
        }.bind(this));
        return {
            undoChanges: undoChanges,
            redoChanges: redoChanges
        };
    };

    CodeMirror6Adapter.prototype._historyStepForLegacyChanges = function (
        changes,
        oldDoc,
        newDoc
    ) {
        const undoChanges = [];
        const redoChanges = [];
        changes.forEach(change => {
            const from = change._fromIndex;
            const to = change._toIndex;
            const inserted = change.text.join("\n");
            const removed = change.removed.join("\n");
            const newTo = from + inserted.length;
            undoChanges.push({
                from: from,
                to: newTo,
                fromPos: _positionFromOffset(
                    newDoc,
                    from,
                    this._firstLine
                ),
                toPos: _positionFromOffset(
                    newDoc,
                    newTo,
                    this._firstLine
                ),
                insert: removed
            });
            redoChanges.push({
                from: from,
                to: to,
                fromPos: _positionFromOffset(
                    oldDoc,
                    from,
                    this._firstLine
                ),
                toPos: _positionFromOffset(
                    oldDoc,
                    to,
                    this._firstLine
                ),
                insert: inserted
            });
        });
        return {
            undoChanges: undoChanges,
            redoChanges: redoChanges
        };
    };

    CodeMirror6Adapter.prototype._restoreMarkerSnapshot = function (snapshot, previousVisibility) {
        const markerStates = new Map((snapshot || []).map(function (state) {
            return [state.id, state];
        }));
        this._markers.forEach(marker => {
            const state = markerStates.get(marker._id);
            if (state && !marker._cleared) {
                marker._from = state.from;
                marker._to = state.to;
                marker._hidden = state.hidden;
                this._syncMarkerLines(marker);
            }
        });
        if (previousVisibility) {
            this._markers.forEach(marker => {
                const wasHidden = previousVisibility.get(marker);
                if (wasHidden === undefined || wasHidden === marker._hidden) {
                    return;
                }
                this._pendingMarkerVisibilityEvents.push({
                    marker: marker,
                    eventName: marker._hidden ? "hide" : "unhide"
                });
            });
        }
        this._refreshLegacyDecorations();
    };

    CodeMirror6Adapter.prototype._resetHistoryMergeState = function () {
        this._historyClosed = true;
        this._historyLastModTime = 0;
        this._historyLastSelectionTime = 0;
        this._historyLastOperationId = null;
        this._historyLastSelectionOperationId = null;
        this._historyLastOrigin = null;
        this._historyLastSelectionOrigin = null;
    };

    CodeMirror6Adapter.prototype._trimHistoryToUndoDepth = function () {
        const configuredDepth = Number(this.getOption("undoDepth"));
        const undoDepth = Number.isFinite(configuredDepth) ?
            Math.max(0, Math.floor(configuredDepth)) :
            Infinity;
        let changeCount = this._historyDone.reduce(function (count, entry) {
            return count + (entry.type === "change" ? 1 : 0);
        }, 0);

        while (changeCount > undoDepth) {
            const changeIndex = this._historyDone.findIndex(function (entry) {
                return entry.type === "change";
            });
            if (changeIndex === -1) {
                break;
            }
            this._historyDone.splice(0, changeIndex + 1);
            changeCount--;
        }

        if (!this._historyDone.length ||
                this._historyDone[0].type !== "selection") {
            const firstChange = this._historyDone.find(function (entry) {
                return entry.type === "change";
            });
            const selection = firstChange ?
                firstChange.beforeSelection :
                this._view.state.selection;
            this._historyDone.unshift({
                type: "selection",
                beforeSelection: selection,
                afterSelection: selection,
                generationBefore: this._currentGeneration,
                generationAfter: this._currentGeneration
            });
        }
    };

    CodeMirror6Adapter.prototype._recordHistory = function (
        beforeText,
        afterText,
        beforeSelection,
        afterSelection,
        origin,
        operationId,
        beforeMarkers,
        afterMarkers,
        historyStep,
        force
    ) {
        if (this._historyApplying || beforeText === afterText && !force) {
            return null;
        }
        const now = Date.now();
        const previousGeneration = this._currentGeneration;
        const nextGeneration = this._nextGeneration++;
        const steps = historyStep ? [historyStep] : [];
        const entry = {
            type: "change",
            docId: this.doc && this.doc.id,
            beforeText: beforeText,
            afterText: afterText,
            beforeSelection: beforeSelection,
            afterSelection: afterSelection,
            origin: origin,
            generationBefore: previousGeneration,
            generationAfter: nextGeneration,
            markerBefore: beforeMarkers,
            markerAfter: afterMarkers,
            steps: steps,
            changes: steps
        };
        let previousIndex = this._historyDone.length - 1;
        let trailingSelections = 0;
        while (previousIndex >= 0 &&
                this._historyDone[previousIndex].type === "selection") {
            previousIndex--;
            trailingSelections++;
        }
        const previous = this._historyDone[previousIndex];
        const sameOperation = operationId !== null &&
            operationId === this._historyLastOperationId;
        const sameOrigin = origin && this._historyLastOrigin === origin;
        const mergeByOrigin = sameOrigin && (
            origin.charAt(0) === "*" ||
            origin.charAt(0) === "+" &&
                now - this._historyLastModTime <=
                    (this.getOption("historyEventDelay") || 500)
        );
        const canMerge = !this._historyClosed && previous &&
            previous.type === "change" &&
            (sameOperation || mergeByOrigin && trailingSelections <= 1);
        if (canMerge) {
            this._historyDone.splice(previousIndex + 1);
            previous.afterText = afterText;
            previous.afterSelection = afterSelection;
            previous.generationAfter = nextGeneration;
            previous.markerAfter = afterMarkers;
            if (historyStep) {
                previous.steps = previous.steps || [];
                previous.changes = previous.steps;
                previous.steps.push(historyStep);
            }
        } else {
            this._historyDone.push(entry);
            this._trimHistoryToUndoDepth();
            this._signalDocument("historyAdded");
        }
        this._historyUndone.length = 0;
        this._historyClosed = false;
        this._historyLastModTime = now;
        this._historyLastOperationId = operationId;
        this._historyLastOrigin = origin;
        this._currentGeneration = nextGeneration;
        return canMerge ? previous : entry;
    };

    CodeMirror6Adapter.prototype._recordSelectionHistory = function (
        beforeSelection,
        afterSelection,
        origin,
        operationId,
        force
    ) {
        if (this._historyApplying ||
                !force && _sameSelection(beforeSelection, afterSelection)) {
            return;
        }
        const now = Date.now();
        const previous = this._historyDone[this._historyDone.length - 1];
        const sameOperation = operationId !== null &&
            operationId === this._historyLastSelectionOperationId;
        const mergeByOrigin = origin && previous && previous.type === "selection" &&
            this._historyLastSelectionOrigin === origin && (
            origin.charAt(0) === "*" ||
            origin.charAt(0) === "+" &&
                now - this._historyLastSelectionTime <=
                    (this.getOption("historyEventDelay") || 500)
        );
        if (!this._historyClosed && previous && previous.type === "selection" &&
                (sameOperation || mergeByOrigin)) {
            previous.afterSelection = afterSelection;
        } else {
            this._historyDone.push({
                type: "selection",
                beforeSelection: beforeSelection,
                afterSelection: afterSelection,
                generationBefore: this._currentGeneration,
                generationAfter: this._currentGeneration
            });
        }
        while (this._historyUndone.length &&
                this._historyUndone[this._historyUndone.length - 1].type === "selection") {
            this._historyUndone.pop();
        }
        this._historyClosed = false;
        this._historyLastSelectionTime = now;
        this._historyLastSelectionOperationId = operationId;
        this._historyLastSelectionOrigin = origin;
    };

    CodeMirror6Adapter.prototype._queueEvents = function (
        changes,
        documentChanges,
        lineChangeEvents,
        lineDeleteEvents,
        selectionChanged,
        inputRead,
        updateNeeded
    ) {
        if (selectionChanged) {
            this.onSelectionChange();
            this._pendingDocumentCursorActivityCount++;
        }
        if (changes.length) {
            changes.forEach((change, index) => {
                this._pendingChangeEvents.push({
                    editorChange: change,
                    documentChange: documentChanges[index],
                    inputRead: inputRead,
                    lineChangeEvents: lineChangeEvents[index] || [],
                    lineDeleteEvents: index === 0 ? lineDeleteEvents : []
                });
            });
        }
        if (updateNeeded) {
            this._pendingUpdate = true;
        }
        if (!this._operationDepth) {
            this._flushOperationEvents();
        }
    };

    CodeMirror6Adapter.prototype._flushOperationEvents = function () {
        const pendingChangeEvents = this._pendingChangeEvents;
        const pendingChanges = pendingChangeEvents.map(function (event) {
            return event.editorChange;
        });
        const pendingMarkerVisibilityEvents = this._pendingMarkerVisibilityEvents;
        const pendingCursorActivity = this._pendingCursorActivity;
        const pendingDocumentCursorActivityCount =
            this._pendingDocumentCursorActivityCount;
        const pendingUpdate = this._pendingUpdate;
        this._pendingChangeEvents = [];
        this._pendingMarkerVisibilityEvents = [];
        this._pendingCursorActivity = false;
        this._pendingDocumentCursorActivityCount = 0;
        this._pendingUpdate = false;

        let firstError;
        const runEvent = callback => {
            try {
                callback();
            } catch (error) {
                firstError = firstError || error;
            }
        };
        try {
            pendingChangeEvents.forEach(event => {
                event.lineChangeEvents.forEach(function (lineEvent) {
                    runEvent(function () {
                        CodeMirror.signal(
                            lineEvent.handle,
                            "change",
                            lineEvent.handle,
                            lineEvent.change
                        );
                    });
                });
                event.lineDeleteEvents.forEach(function (handle) {
                    runEvent(function () {
                        CodeMirror.signal(handle, "delete");
                    });
                });
                runEvent(() => {
                    this._signalDocument(
                        "change",
                        this.doc,
                        event.documentChange
                    );
                });
                runEvent(() => {
                    this._emit(
                        "change",
                        this._instance(),
                        event.editorChange
                    );
                });
                if (event.inputRead) {
                    runEvent(() => {
                        this._emit(
                            "inputRead",
                            this._instance(),
                            event.editorChange
                        );
                    });
                }
            });
            for (let index = 0;
                index < pendingDocumentCursorActivityCount;
                index++) {
                runEvent(() => {
                    this._signalDocument("cursorActivity", this.doc);
                });
            }
            if (pendingCursorActivity) {
                runEvent(() => {
                    this._emit("cursorActivity", this._instance());
                });
            }
            pendingMarkerVisibilityEvents.forEach(function (event) {
                runEvent(function () {
                    CodeMirror.signal(event.marker, event.eventName);
                });
            });
            if (pendingChanges.length) {
                runEvent(() => {
                    this._emit("changes", this._instance(), pendingChanges);
                });
            }
            if (pendingUpdate) {
                runEvent(() => {
                    this._emit("update", this._instance());
                });
            }
        } finally {
            this._decorateDOM();
            this._emitRenderLines();
            this._emitViewportChange();
        }
        if (firstError) {
            throw firstError;
        }
    };

    CodeMirror6Adapter.prototype._rebaseTransaction = function (transaction, state) {
        if (transaction.startState === state) {
            return transaction;
        }
        if (!transaction.startState.doc.eq(state.doc)) {
            throw new RangeError(
                "Cannot rebase a CodeMirror transaction after a reentrant document change."
            );
        }
        return state.update({
            changes: transaction.changes,
            selection: transaction.selection,
            effects: transaction.effects,
            annotations: transaction.annotations,
            scrollIntoView: transaction.scrollIntoView,
            filter: false
        });
    };

    CodeMirror6Adapter.prototype._dispatchTransactions = function (transactions, view) {
        if (this._destroyed) {
            return;
        }

        const operationId = this._activeOperationId !== null ?
            this._activeOperationId :
            this._nextOperationId++;
        transactions.forEach(originalTransaction => {
            const focusedLineWidget = this._captureFocusedLineWidget();
            const beforeMarkers = this._captureMarkerSnapshot();
            const prepared = this._prepareTransaction(originalTransaction, view);
            if (!prepared) {
                this._restoreFocusedLineWidget(focusedLineWidget);
                return;
            }
            const transaction = this._rebaseTransaction(prepared.transaction, view.state);
            const beforeText = view.state.doc.toString();
            const beforeSelection = view.state.selection;
            const hasLegacyChanges = prepared.changes.length > 0;
            const documentChanges = prepared.changes.map(_copyLegacyChange);
            const fullChange = Boolean(
                transaction.annotation(this._fullChangeAnnotation)
            );
            const setValueSelectionReset = transaction.docChanged && Boolean(
                transaction.annotation(this._setValueSelectionResetAnnotation)
            );
            const historyStep = transaction.docChanged ?
                this._historyStepForTransaction(transaction) :
                prepared.forceHistory ?
                    this._historyStepForLegacyChanges(
                        prepared.changes,
                        transaction.startState.doc,
                        transaction.newDoc
                    ) :
                    null;
            const setValueMappedSelection = setValueSelectionReset ?
                this._selectionAfterLegacyChange(
                    beforeSelection,
                    prepared.changes[0],
                    transaction.changes
                ) :
                null;
            const appliedTransaction = setValueSelectionReset ?
                view.state.update({
                    changes: transaction.changes,
                    selection: setValueMappedSelection,
                    effects: transaction.effects,
                    annotations: transaction.annotations,
                    scrollIntoView: transaction.scrollIntoView,
                    filter: false
                }) :
                transaction;
            view.update([appliedTransaction]);
            if (appliedTransaction.docChanged) {
                this.onChange(appliedTransaction, prepared.changes);
                if (this.virtualSelection) {
                    this.virtualSelection = CM6.EditorSelection.create(
                        this.virtualSelection.ranges.map(function (range) {
                            return range.map(appliedTransaction.changes);
                        }),
                        this.virtualSelection.mainIndex
                    );
                }
            }
            const afterText = view.state.doc.toString();
            let lineChangeEvents = prepared.changes.map(function () {
                return [];
            });
            let lineDeleteEvents = [];
            if (hasLegacyChanges && !fullChange) {
                lineChangeEvents = this._lineHandleChangeEvents(
                    prepared.changes,
                    documentChanges,
                    transaction.startState.doc
                );
            }
            if (hasLegacyChanges && fullChange) {
                lineDeleteEvents = this._replaceMetadataForFullChange();
            } else if (transaction.docChanged) {
                lineDeleteEvents = this._mapMetadata(
                    transaction.changes,
                    transaction.startState.doc,
                    view.state.doc
                );
            }
            if (transaction.docChanged) {
                // Direct EditorView.decorations values are static and are not
                // mapped through document changes. Rebuild them after legacy
                // metadata moves, before a follow-up selection-only update can
                // compare stale points against the new identity ChangeSet.
                this._refreshLegacyDecorations(true);
            }
            if (transaction.docChanged || hasLegacyChanges) {
                const firstChangedLine = prepared.changes.reduce(function (
                    earliestLine,
                    change
                ) {
                    return Math.min(earliestLine, change.from.line);
                }, Infinity);
                this._invalidateLegacyModeStateCache(
                    false,
                    firstChangedLine
                );
            }
            let recordedHistoryEntry = null;
            if (hasLegacyChanges) {
                const addToHistory =
                    transaction.annotation(this._addToHistoryAnnotation);
                if (addToHistory !== false &&
                        (beforeText !== afterText || prepared.forceHistory)) {
                    recordedHistoryEntry = this._recordHistory(
                        beforeText,
                        afterText,
                        beforeSelection,
                        view.state.selection,
                        prepared.changes[0] && prepared.changes[0].origin,
                        operationId,
                        beforeMarkers,
                        this._captureMarkerSnapshot(),
                        historyStep,
                        prepared.forceHistory
                    );
                }
            }
            if (transaction.docChanged) {
                let previousSelection = beforeSelection.map(transaction.changes);
                if (setValueSelectionReset) {
                    const mappedSelection = this._applyBeforeSelectionChange(
                        view.state.selection,
                        view.state.doc,
                        undefined,
                        transaction.annotation(this._selectionBiasAnnotation),
                        beforeSelection
                    );
                    if (!_sameSelection(mappedSelection, view.state.selection)) {
                        view.update([view.state.update({
                            selection: mappedSelection
                        })]);
                    }
                    previousSelection = view.state.selection;
                }
                const filteredSelection = this._applyBeforeSelectionChange(
                    setValueSelectionReset ?
                        transaction.newSelection :
                        view.state.selection,
                    view.state.doc,
                    undefined,
                    transaction.annotation(this._selectionBiasAnnotation),
                    previousSelection
                );
                if (!_sameSelection(filteredSelection, view.state.selection)) {
                    view.update([view.state.update({
                        selection: filteredSelection
                    })]);
                }
            }
            const selectionChanged = !_sameSelection(beforeSelection, view.state.selection);
            if (recordedHistoryEntry) {
                recordedHistoryEntry.afterSelection = view.state.selection;
                this._recordSelectionHistory(
                    beforeSelection,
                    view.state.selection,
                    transaction.annotation(this._originAnnotation),
                    operationId,
                    true
                );
            } else if (!hasLegacyChanges && selectionChanged) {
                this._recordSelectionHistory(
                    beforeSelection,
                    view.state.selection,
                    transaction.annotation(this._originAnnotation),
                    operationId
                );
            }

            const inputRead = transaction.isUserEvent("input.type") ||
                transaction.isUserEvent("input.paste") ||
                transaction.isUserEvent("delete.cut");
            if (transaction.docChanged &&
                    !transaction.annotation(this._linkedChangeAnnotation) &&
                    this.doc && this.doc._links.length) {
                prepared.changes.forEach(change => {
                    this._propagateLinkedChange(change);
                });
            }
            if (!transaction.docChanged || this._legacyDecorationsDirty) {
                this._refreshLegacyDecorations();
            }
            this._scheduleGutterRefresh();
            try {
                this._queueEvents(
                    prepared.changes,
                    documentChanges,
                    lineChangeEvents,
                    lineDeleteEvents,
                    selectionChanged || hasLegacyChanges,
                    inputRead,
                    transaction.docChanged ||
                        hasLegacyChanges ||
                        Boolean(transaction.annotation(this._legacyUpdateAnnotation))
                );
            } finally {
                // Legacy change listeners can synchronously redraw line widgets.
                this._restoreFocusedLineWidget(focusedLineWidget);
            }
        });
    };

    CodeMirror6Adapter.prototype._compatDecorationSet = function () {
        const ranges = [];

        this._markers.forEach(marker => {
            if (marker._cleared || marker._hidden) {
                return;
            }
            const found = marker.find();
            if (!found) {
                return;
            }

            const isBookmark = marker.type === "bookmark";
            const fromPosition = isBookmark ? found : found.from;
            const toPosition = isBookmark ? found : found.to;
            const from = this.indexFromPos(fromPosition);
            const to = this.indexFromPos(toPosition);
            const widgetNode = marker._widgetNode || marker.replacedWith;
            const widget = widgetNode ?
                new LegacyNodeWidget(widgetNode, marker.handleMouseEvents) :
                null;
            const inclusiveStart = marker.inclusiveLeft === true;
            const inclusiveEnd = marker.inclusiveRight === true;

            if (isBookmark) {
                if (widget) {
                    ranges.push(CM6.Decoration.widget({
                        widget: widget,
                        side: marker.insertLeft ? 1 : -1
                    }).range(from));
                }
                return;
            }

            if (marker.collapsed || widget) {
                const replaceOptions = {
                    inclusiveStart: inclusiveStart,
                    inclusiveEnd: inclusiveEnd
                };
                if (widget) {
                    replaceOptions.widget = widget;
                }
                ranges.push(CM6.Decoration.replace(replaceOptions).range(from, to));
                return;
            }

            if (from === to) {
                return;
            }

            const attributes = Object.assign({}, marker.attributes);
            if (marker.css) {
                attributes.style = attributes.style ?
                    `${attributes.style};${marker.css}` :
                    marker.css;
            }
            if (marker.title) {
                attributes.title = marker.title;
            }
            if (marker.className || Object.keys(attributes).length) {
                ranges.push(CM6.Decoration.mark({
                    class: marker.className || undefined,
                    attributes: Object.keys(attributes).length ? attributes : undefined,
                    inclusiveStart: inclusiveStart,
                    inclusiveEnd: inclusiveEnd
                }).range(from, to));
            }

            if (marker.startStyle) {
                const firstLine = this._view.state.doc.lineAt(from);
                const startStyleEnd = Math.min(to, firstLine.to);
                if (startStyleEnd > from) {
                    ranges.push(CM6.Decoration.mark({
                        class: marker.startStyle,
                        inclusiveStart: inclusiveStart
                    }).range(from, startStyleEnd));
                }
            }

            if (marker.endStyle) {
                const lastLine = this._view.state.doc.lineAt(Math.max(from, to - 1));
                const endStyleStart = Math.max(from, lastLine.from);
                if (to > endStyleStart) {
                    ranges.push(CM6.Decoration.mark({
                        class: marker.endStyle,
                        inclusiveEnd: inclusiveEnd
                    }).range(endStyleStart, to));
                }
            }
        });

        this._lineClasses = this._lineClasses.filter(record => {
            const lineNumber = this.getLineNumber(record.lineHandle);
            if (lineNumber === null || lineNumber === undefined ||
                    lineNumber < this.firstLine() ||
                    lineNumber > this.lastLine()) {
                return false;
            }

            const line = this._view.state.doc.line(
                lineNumber - this._firstLine + 1
            );
            if (record.where === "gutter") {
                return true;
            }
            ranges.push(CM6.Decoration.line({
                attributes: {
                    class: record.className
                }
            }).range(line.from));
            return true;
        });

        this._lineWidgets = this._lineWidgets.filter(record => {
            const lineNumber = this.getLineNumber(record.widget.line);
            if (lineNumber === null || lineNumber === undefined ||
                    lineNumber < this.firstLine() ||
                    lineNumber > this.lastLine()) {
                return false;
            }

            const line = this._view.state.doc.line(
                lineNumber - this._firstLine + 1
            );
            const above = Boolean(record.options && record.options.above);
            const position = above ? line.from : line.to;
            const widgets = record.widget.line.widgets || [];
            const widgetIndex = Math.max(0, widgets.indexOf(record.widget));
            ranges.push(CM6.Decoration.widget({
                widget: new LegacyLineWidget(this, record),
                block: true,
                side: above ? -10000 + widgetIndex : 1 + widgetIndex
            }).range(position));
            return true;
        });

        return CM6.Decoration.set(ranges, true);
    };

    CodeMirror6Adapter.prototype._refreshLegacyDecorations = function (force) {
        if (!this._view || this._destroyed) {
            return;
        }
        if (this._operationDepth && !force) {
            this._legacyDecorationsDirty = true;
            return;
        }
        this._legacyDecorationsDirty = false;
        this._reconfigureSilently(
            this._decorationsCompartment,
            CM6.EditorView.decorations.of(this._compatDecorationSet())
        );
        this._reconfigureSilently(
            this._gutterLineClassesCompartment,
            CM6.gutterLineClass.of(this._gutterLineClassRangeSet(this._view.state.doc))
        );
        this._refreshLineWidgetLayouts();
        this._scheduleRenderLines();
    };

    CodeMirror6Adapter.prototype._refreshLegacyHighlighting = function () {
        if (!this._view || this._destroyed) {
            return;
        }
        this._reconfigureSilently(
            this._compatHighlightCompartment,
            this._compatHighlightExtension()
        );
        this._invalidateRenderedLines();
    };

    CodeMirror6Adapter.prototype._refreshGutters = function () {
        if (!this._view || this._destroyed) {
            return;
        }
        this._reconfigureSilently(
            this._lineNumbersCompartment,
            this._createLeadingGutterExtensions()
        );
        this._reconfigureSilently(
            this._guttersCompartment,
            this._createTrailingGutterExtensions()
        );
    };

    CodeMirror6Adapter.prototype._reconfigureSilently = function (compartment, extension) {
        const transaction = this._view.state.update({
            effects: compartment.reconfigure(extension)
        });
        this._view.update([transaction]);
        this._decorateDOM();
    };

    CodeMirror6Adapter.prototype._scheduleRenderLines = function () {
        if (this._renderLineRefreshScheduled ||
                !this._view ||
                this._destroyed) {
            return;
        }
        this._renderLineRefreshScheduled = true;
        Promise.resolve().then(() => {
            this._renderLineRefreshScheduled = false;
            if (!this._view || this._destroyed) {
                return;
            }
            this._decorateDOM();
            this._emitRenderLines();
        });
    };

    CodeMirror6Adapter.prototype._invalidateRenderedLines = function () {
        this._renderedLineDOMState = new WeakMap();
        this._scheduleRenderLines();
    };

    CodeMirror6Adapter.prototype._emitRenderLines = function () {
        const listeners = this._listeners.get("renderLine");
        if (!this._view || !listeners || !listeners.length) {
            return;
        }

        const renderedLines = new Set();
        this._view.visibleRanges.forEach(range => {
            let line = this._view.state.doc.lineAt(range.from);
            while (line.from <= range.to) {
                if (!renderedLines.has(line.number)) {
                    renderedLines.add(line.number);
                    let dom;
                    try {
                        dom = this._view.domAtPos(line.from).node;
                    } catch (error) {
                        dom = null;
                    }
                    if (dom) {
                        if (dom.nodeType === window.Node.TEXT_NODE) {
                            dom = dom.parentElement;
                        }
                        if (dom && dom.nodeType === window.Node.ELEMENT_NODE &&
                                !dom.classList.contains("cm-line")) {
                            dom = dom.closest(".cm-line");
                        }
                        const lineHandle = this.getLineHandle(
                            line.number - 1 + this._firstLine
                        );
                        if (dom && lineHandle) {
                            const previousState = this._renderedLineDOMState.get(dom);
                            if (!previousState ||
                                    previousState.lineHandle !== lineHandle ||
                                    previousState.text !== line.text ||
                                    previousState.contentNode !== dom.firstChild) {
                                this._renderedLineDOMState.set(dom, {
                                    contentNode: dom.firstChild,
                                    lineHandle: lineHandle,
                                    text: line.text
                                });
                                this._emit(
                                    "renderLine",
                                    this._instance(),
                                    lineHandle,
                                    dom
                                );
                            }
                        }
                    }
                }

                if (line.number >= this._view.state.doc.lines) {
                    break;
                }
                line = this._view.state.doc.line(line.number + 1);
            }
        });
    };

    CodeMirror6Adapter.prototype._emitViewportChange = function () {
        const viewport = this.getViewport();
        if (!this._lastViewport || viewport.from !== this._lastViewport.from ||
                viewport.to !== this._lastViewport.to) {
            this._lastViewport = viewport;
            this._emit("viewportChange", this._instance(), viewport.from, viewport.to);
        }
    };

    CodeMirror6Adapter.prototype._handleScroll = function () {
        if (this.doc && this._view) {
            this.doc._scrollLeft = this._view.scrollDOM.scrollLeft;
            this.doc._scrollTop = this._view.scrollDOM.scrollTop;
        }
        if (this._scrollbarModel) {
            this._scrollbarModel.setScrollLeft(
                this._view.scrollDOM.scrollLeft
            );
            this._scrollbarModel.setScrollTop(
                this._view.scrollDOM.scrollTop
            );
        }
        this._emit("scroll", this._instance());
        this._emitViewportChange();
        this._scheduleRulerRefresh();
        this._refreshLineWidgetLayouts();
    };

    CodeMirror6Adapter.prototype._clearScrollbarModel = function () {
        if (this._scrollbarModel &&
                typeof this._scrollbarModel.clear === "function") {
            this._scrollbarModel.clear();
        }
        this._scrollbarModelNodes.forEach(function (node) {
            if (node.parentNode) {
                node.parentNode.removeChild(node);
            }
        });
        if (this._wrapperElement && this._scrollbarModel &&
                this._scrollbarModel.addClass) {
            CodeMirror.rmClass(
                this._wrapperElement,
                this._scrollbarModel.addClass
            );
        }
        if (this._wrapperElement) {
            CodeMirror.rmClass(
                this._wrapperElement,
                "phoenix-cm6-custom-scrollbars phoenix-cm6-null-scrollbars"
            );
            this._wrapperElement.style.removeProperty(
                "--phoenix-cm6-scrollbar-bottom"
            );
            this._wrapperElement.style.removeProperty(
                "--phoenix-cm6-scrollbar-right"
            );
        }
        this._scrollbarModel = null;
        this._scrollbarModelNodes = [];
        this._scrollbarModelName = null;
        if (this.display) {
            this.display.barHeight = 0;
            this.display.barWidth = 0;
            this.display.scrollbars = null;
        }
    };

    CodeMirror6Adapter.prototype._scrollbarMeasurements = function () {
        const scroller = this._view.scrollDOM;
        const gutter = this.getGutterElement();
        const gutterWidth = gutter && gutter !== this._view.dom ?
            gutter.getBoundingClientRect().width :
            0;
        return {
            barLeft: this.getOption("fixedGutter") ? gutterWidth : 0,
            clientHeight: scroller.clientHeight,
            clientWidth: scroller.clientWidth,
            docHeight: scroller.scrollHeight,
            gutterWidth: gutterWidth,
            nativeBarWidth: Math.max(
                0,
                scroller.offsetWidth - scroller.clientWidth
            ),
            scrollHeight: scroller.scrollHeight,
            scrollWidth: scroller.scrollWidth,
            viewHeight: this._view.dom.clientHeight,
            viewWidth: this._view.dom.clientWidth
        };
    };

    CodeMirror6Adapter.prototype._refreshScrollbarModel = function () {
        if (!this._view || this._destroyed || !this._scrollbarModel) {
            return;
        }
        const sizes = typeof this._scrollbarModel.update === "function" ?
            this._scrollbarModel.update(this._scrollbarMeasurements()) :
            null;
        const bottom = Math.max(0, Number(sizes && sizes.bottom) || 0);
        const right = Math.max(0, Number(sizes && sizes.right) || 0);
        this.display.barHeight = bottom;
        this.display.barWidth = right;
        this._wrapperElement.style.setProperty(
            "--phoenix-cm6-scrollbar-bottom",
            `${bottom}px`
        );
        this._wrapperElement.style.setProperty(
            "--phoenix-cm6-scrollbar-right",
            `${right}px`
        );
        if (typeof this._scrollbarModel.setScrollLeft === "function") {
            this._scrollbarModel.setScrollLeft(
                this._view.scrollDOM.scrollLeft
            );
        }
        if (typeof this._scrollbarModel.setScrollTop === "function") {
            this._scrollbarModel.setScrollTop(
                this._view.scrollDOM.scrollTop
            );
        }
    };

    CodeMirror6Adapter.prototype._applyScrollbarStyle = function (styleName) {
        if (!this._view || this._destroyed) {
            return;
        }
        const normalizedName = styleName === null ?
            "null" :
            String(styleName || "native");
        if (normalizedName === this._scrollbarModelName) {
            this._refreshScrollbarModel();
            return;
        }
        const Model = CodeMirror.scrollbarModel &&
            CodeMirror.scrollbarModel[normalizedName];
        if (typeof Model !== "function") {
            throw new Error(`Unknown scrollbar style "${normalizedName}"`);
        }

        this._clearScrollbarModel();
        const adapter = this;
        const place = function (node) {
            if (!node) {
                return;
            }
            node.setAttribute("cm-not-content", "true");
            node.setAttribute("cm-ignore-events", "true");
            node.setAttribute("aria-hidden", "true");
            node.addEventListener("mousedown", function () {
                if (adapter.hasFocus()) {
                    const ownerWindow =
                        adapter._wrapperElement.ownerDocument.defaultView ||
                        window;
                    ownerWindow.setTimeout(function () {
                        adapter.focus();
                    }, 0);
                }
            });
            adapter._wrapperElement.appendChild(node);
            adapter._scrollbarModelNodes.push(node);
        };
        const scroll = function (position, orientation) {
            if (orientation === "horizontal") {
                adapter.scrollTo(position, null);
            } else {
                adapter.scrollTo(null, position);
            }
        };
        const model = new Model(place, scroll, this);
        this._scrollbarModel = model;
        this._scrollbarModelName = normalizedName;
        this.display.scrollbars = model;

        if (normalizedName !== "native") {
            CodeMirror.addClass(
                this._wrapperElement,
                "phoenix-cm6-custom-scrollbars"
            );
        }
        if (normalizedName === "null") {
            CodeMirror.addClass(
                this._wrapperElement,
                "phoenix-cm6-null-scrollbars"
            );
        }
        if (model.addClass) {
            CodeMirror.addClass(this._wrapperElement, model.addClass);
        }
        this._refreshScrollbarModel();
    };

    CodeMirror6Adapter.prototype._applyLineWidgetLayout = function (record) {
        const wrapper = record && record.renderedWrapper;
        if (!wrapper || !this._view) {
            return;
        }

        const options = record.options || {};
        const scroller = this._view.scrollDOM;
        const gutter = this.getGutterElement();
        const gutterWidth = gutter && gutter !== this._view.dom ?
            gutter.getBoundingClientRect().width :
            0;

        wrapper.style.boxSizing = "border-box";
        wrapper.style.left = "";
        wrapper.style.marginLeft = "";
        wrapper.style.paddingLeft = "";
        wrapper.style.position = "";
        wrapper.style.width = "";
        wrapper.style.zIndex = "";

        if (options.noHScroll) {
            wrapper.style.position = "sticky";
            wrapper.style.left = options.coverGutter ? `${-gutterWidth}px` : "0px";
            wrapper.style.width = options.coverGutter ?
                `${scroller.clientWidth}px` :
                `${Math.max(0, scroller.clientWidth - gutterWidth)}px`;
            if (!options.coverGutter && gutterWidth) {
                wrapper.style.paddingLeft = `${gutterWidth}px`;
            }
        }
        if (options.coverGutter) {
            wrapper.style.zIndex = "5";
            if (!options.noHScroll && gutterWidth) {
                wrapper.style.marginLeft = `${-gutterWidth}px`;
            }
        }
    };

    CodeMirror6Adapter.prototype._measureLineWidget = function (record) {
        if (!record || record.cleared || !record.widget) {
            return 0;
        }
        const measuredNode = record.node && record.node.isConnected ?
            record.node :
            record.renderedWrapper;
        const height = measuredNode && measuredNode.isConnected ?
            measuredNode.offsetHeight :
            0;
        record.widget.height = height;
        return height;
    };

    CodeMirror6Adapter.prototype._refreshLineWidgetLayouts = function () {
        this._lineWidgets.forEach(record => {
            this._applyLineWidgetLayout(record);
            this._measureLineWidget(record);
        });
    };

    CodeMirror6Adapter.prototype._scheduleRulerRefresh = function () {
        if (this._rulerRefreshScheduled || !this._view || this._destroyed) {
            return;
        }
        this._rulerRefreshScheduled = true;
        Promise.resolve().then(() => {
            this._rulerRefreshScheduled = false;
            this._refreshRulers();
        });
    };

    CodeMirror6Adapter.prototype._refreshRulers = function () {
        if (!this._view || this._destroyed) {
            return;
        }

        const rulers = this.getOption("rulers");
        if (!rulers || !rulers.length) {
            if (this._rulerElement) {
                this._rulerElement.remove();
                this._rulerElement = null;
            }
            return;
        }

        if (!this._rulerElement) {
            this._rulerElement = window.document.createElement("div");
            this._rulerElement.className = "CodeMirror-rulers phoenix-cm6-rulers";
            this._view.dom.appendChild(this._rulerElement);
        }

        const rootRect = this._view.dom.getBoundingClientRect();
        const contentRect = this._view.contentDOM.getBoundingClientRect();
        const contentLeft = contentRect.left - rootRect.left;
        const charWidth = this.defaultCharWidth();
        this._rulerElement.textContent = "";
        this._rulerElement.style.minHeight = `${this._view.scrollDOM.clientHeight + 30}px`;

        rulers.forEach(configuration => {
            const ruler = window.document.createElement("div");
            ruler.className = "CodeMirror-ruler";
            let column = configuration;
            if (typeof configuration === "object") {
                column = configuration.column;
                if (configuration.className) {
                    ruler.classList.add(
                        ...String(configuration.className).split(/\s+/).filter(Boolean)
                    );
                }
                if (configuration.color) {
                    ruler.style.borderColor = configuration.color;
                }
                if (configuration.lineStyle) {
                    ruler.style.borderLeftStyle = configuration.lineStyle;
                }
                if (configuration.width) {
                    ruler.style.borderLeftWidth = configuration.width;
                }
            }
            ruler.style.left = `${contentLeft + (Number(column) * charWidth)}px`;
            this._rulerElement.appendChild(ruler);
        });
    };

    CodeMirror6Adapter.prototype._ensureLegacyDOM = function () {
        if (!this._view) {
            return null;
        }
        const root = this._view.dom;
        if (this._legacyDOM &&
                this._legacyDOM.sizer.parentNode === root &&
                this._legacyDOM.verticalScrollbar.parentNode === root) {
            return this._legacyDOM;
        }

        const sizer = window.document.createElement("div");
        sizer.className = "CodeMirror-sizer phoenix-cm6-legacy-sizer";
        sizer.setAttribute("aria-hidden", "true");
        sizer.dataset.phoenixCm6LegacyProxy = "sizer";

        const width = window.document.createElement("div");
        width.className = "phoenix-cm6-legacy-content-width";
        const lines = window.document.createElement("div");
        lines.className = "CodeMirror-lines phoenix-cm6-legacy-lines";
        const measurement = window.document.createElement("pre");
        measurement.className =
            "CodeMirror-line-like phoenix-cm6-legacy-measure";
        measurement.textContent = "\u200b";
        sizer.appendChild(width);
        sizer.appendChild(lines);
        sizer.appendChild(measurement);

        const verticalScrollbar = window.document.createElement("div");
        verticalScrollbar.className =
            "CodeMirror-vscrollbar phoenix-cm6-legacy-vscrollbar";
        verticalScrollbar.setAttribute("aria-hidden", "true");
        verticalScrollbar.dataset.phoenixCm6LegacyProxy = "vertical-scrollbar";

        root.insertBefore(sizer, this._view.scrollDOM);
        root.insertBefore(verticalScrollbar, this._view.scrollDOM);
        this._legacyDOM = {
            lines: lines,
            measurement: measurement,
            sizer: sizer,
            verticalScrollbar: verticalScrollbar,
            width: width
        };
        return this._legacyDOM;
    };

    CodeMirror6Adapter.prototype._syncLegacyDOMGeometry = function () {
        if (!this._view || this._destroyed) {
            return;
        }
        const legacyDOM = this._ensureLegacyDOM();
        if (!legacyDOM) {
            return;
        }

        const content = this._view.contentDOM;
        const contentBounds = content.getBoundingClientRect();
        const contentHeight = Math.max(
            Number(this._view.contentHeight) || 0,
            content.scrollHeight || 0,
            contentBounds.height || 0
        );
        const contentWidth = Math.max(
            content.scrollWidth || 0,
            contentBounds.width || 0
        );
        legacyDOM.sizer.style.height = `${Math.ceil(contentHeight)}px`;
        legacyDOM.sizer.style.width = `${Math.ceil(contentWidth)}px`;
        legacyDOM.width.style.width = `${Math.ceil(contentWidth)}px`;
    };

    CodeMirror6Adapter.prototype._decorateDOM = function () {
        if (!this._view) {
            return;
        }

        const root = this._view.dom;
        if (!root.classList.contains("CodeMirror")) {
            root.classList.add("CodeMirror");
        }
        if (!root.classList.contains("phoenix-codemirror-6")) {
            root.classList.add("phoenix-codemirror-6");
        }
        root.classList.toggle("CodeMirror-wrap", Boolean(this.getOption("lineWrapping")));
        root.classList.toggle("CodeMirror-overwrite", Boolean(this.state.overwrite));
        root.classList.toggle(
            "CodeMirror-empty",
            Boolean(this.getOption("placeholder")) &&
                this._view.state.doc.length === 0
        );
        if (root.dataset.editorEngine !== "codemirror6") {
            root.dataset.editorEngine = "codemirror6";
        }
        root.CodeMirror = this._instance();
        if (!this._view.scrollDOM.classList.contains("CodeMirror-scroll")) {
            this._view.scrollDOM.classList.add("CodeMirror-scroll");
        }
        if (!this._view.scrollDOM.classList.contains("CodeMirror-lines")) {
            this._view.scrollDOM.classList.add("CodeMirror-lines");
        }
        this._view.scrollDOM.classList.remove("CodeMirror-vscrollbar");
        if (!this._view.contentDOM.classList.contains("CodeMirror-code")) {
            this._view.contentDOM.classList.add("CodeMirror-code");
        }
        if (!this._view.contentDOM.classList.contains("CodeMirror-sizer")) {
            this._view.contentDOM.classList.add("CodeMirror-sizer");
        }
        this._syncLegacyDOMGeometry();

        const tabIndex = this.getOption("tabindex");
        if (tabIndex === null || tabIndex === undefined) {
            this._view.contentDOM.removeAttribute("tabindex");
        } else {
            this._view.contentDOM.tabIndex = tabIndex;
        }
        const screenReaderLabel = this.getOption("screenReaderLabel");
        if (screenReaderLabel) {
            this._view.contentDOM.setAttribute("aria-label", screenReaderLabel);
        } else {
            this._view.contentDOM.removeAttribute("aria-label");
        }
        const direction = this.getOption("direction");
        if (direction) {
            this._view.contentDOM.dir = direction;
        } else {
            this._view.contentDOM.removeAttribute("dir");
        }
        root.classList.toggle("CodeMirror-rtl", direction === "rtl");

        root.querySelectorAll(".cm-gutters:not(.CodeMirror-gutters)").forEach(function (element) {
            element.classList.add("CodeMirror-gutters");
        });
        root.querySelectorAll(".cm-gutter:not(.CodeMirror-gutter)").forEach(function (element) {
            element.classList.add("CodeMirror-gutter");
        });
        root.querySelectorAll(".cm-gutterElement:not(.CodeMirror-gutter-elt)").forEach(function (element) {
            element.classList.add("CodeMirror-gutter-elt");
        });
        root.querySelectorAll(".cm-lineNumbers:not(.CodeMirror-linenumbers)").forEach(function (element) {
            element.classList.add("CodeMirror-linenumbers");
        });
        this._applyConfiguredGutterStyles();
        root.querySelectorAll(
            ".cm-lineNumbers .cm-gutterElement:not(.CodeMirror-linenumber)"
        ).forEach(function (element) {
            element.classList.add("CodeMirror-linenumber");
        });
        root.querySelectorAll(".cm-cursor:not(.CodeMirror-cursor)").forEach(function (element) {
            element.classList.add("CodeMirror-cursor");
        });
        root.querySelectorAll(".cm-cursorLayer:not(.CodeMirror-cursors)").forEach(function (element) {
            element.classList.add("CodeMirror-cursors");
        });
        root.querySelectorAll(".cm-line:not(.CodeMirror-line)").forEach(function (element) {
            element.classList.add("CodeMirror-line");
        });
        root.querySelectorAll(
            ".cm-selectionBackground:not(.CodeMirror-selected)"
        ).forEach(function (element) {
            element.classList.add("CodeMirror-selected");
        });

        root.querySelectorAll(".CodeMirror-matchingbracket").forEach(element => {
            if (this._matchingBracketDOM.has(element) &&
                    !element.classList.contains("cm-matchingBracket")) {
                element.classList.remove("CodeMirror-matchingbracket");
                this._matchingBracketDOM.delete(element);
            }
        });
        root.querySelectorAll(".cm-matchingBracket").forEach(element => {
            if (!element.classList.contains("CodeMirror-matchingbracket")) {
                element.classList.add("CodeMirror-matchingbracket");
            }
            this._matchingBracketDOM.add(element);
        });
        root.querySelectorAll(".CodeMirror-nonmatchingbracket").forEach(element => {
            if (this._nonmatchingBracketDOM.has(element) &&
                    !element.classList.contains("cm-nonmatchingBracket")) {
                element.classList.remove("CodeMirror-nonmatchingbracket");
                this._nonmatchingBracketDOM.delete(element);
            }
        });
        root.querySelectorAll(".cm-nonmatchingBracket").forEach(element => {
            if (!element.classList.contains("CodeMirror-nonmatchingbracket")) {
                element.classList.add("CodeMirror-nonmatchingbracket");
            }
            this._nonmatchingBracketDOM.add(element);
        });

        root.querySelectorAll(".CodeMirror-activeline").forEach(function (element) {
            if (!element.classList.contains("cm-activeLine")) {
                element.classList.remove(
                    "CodeMirror-activeline",
                    "CodeMirror-activeline-background"
                );
            }
        });
        root.querySelectorAll(".cm-activeLine").forEach(function (element) {
            if (!element.classList.contains("CodeMirror-activeline")) {
                element.classList.add("CodeMirror-activeline");
            }
            if (!element.classList.contains("CodeMirror-activeline-background")) {
                element.classList.add("CodeMirror-activeline-background");
            }
        });
        root.querySelectorAll(".CodeMirror-activeline-gutter").forEach(function (element) {
            if (!element.classList.contains("cm-activeLineGutter")) {
                element.classList.remove("CodeMirror-activeline-gutter");
            }
        });
        root.querySelectorAll(".cm-activeLineGutter").forEach(function (element) {
            if (!element.classList.contains("CodeMirror-activeline-gutter")) {
                element.classList.add("CodeMirror-activeline-gutter");
            }
        });
    };

    CodeMirror6Adapter.prototype._handleClipboardEvent = function (eventName, event) {
        this._emit(eventName, this._instance(), event);
        if (event.defaultPrevented) {
            return true;
        }

        if (this.getOption("lineWiseCopyCut") === false &&
                !this.somethingSelected()) {
            return true;
        }
        return false;
    };

    CodeMirror6Adapter.prototype._runLegacyKeyBinding = function (binding, motionOnly) {
        let command = binding;
        if (typeof command === "string") {
            if (motionOnly && !/^go[A-Z]/.test(command)) {
                return false;
            }
            command = CodeMirror.commands[command];
        } else if (motionOnly && !command.motion) {
            return false;
        }
        if (typeof command !== "function") {
            return false;
        }

        const previousSuppressEdits = this.state.suppressEdits;
        if (this.getOption("readOnly")) {
            this.state.suppressEdits = true;
        }
        try {
            return this.operation(() => {
                return command(this._instance()) !== CodeMirror.Pass;
            });
        } finally {
            this.state.suppressEdits = previousSuppressEdits;
        }
    };

    CodeMirror6Adapter.prototype._lookupLegacyKey = function (keyName, motionOnly) {
        const keyMaps = this.state.keyMaps.slice();
        if (this.options.extraKeys) {
            keyMaps.push(this.options.extraKeys);
        }
        const configuredKeyMap = CodeMirror.keyMap[this.getOption("keyMap") || "default"];
        if (configuredKeyMap) {
            keyMaps.push(configuredKeyMap);
        }

        for (const keyMap of keyMaps) {
            const result = CodeMirror.lookupKey(keyName, keyMap, binding => {
                return this._runLegacyKeyBinding(binding, motionOnly);
            }, this._instance());
            if (result) {
                return result;
            }
        }
        return undefined;
    };

    CodeMirror6Adapter.prototype._dispatchLegacyKey = function (keyName, event, motionOnly) {
        const keySequence = this.state.keySeq;
        let result;
        if (keySequence) {
            result = this._lookupLegacyKey(`${keySequence} ${keyName}`, motionOnly);
            if (!result) {
                this.state.keySeq = null;
            }
        }
        if (!result) {
            result = this._lookupLegacyKey(keyName, motionOnly);
        }

        if (result === "multi") {
            this.state.keySeq = keyName;
            if (this._keySequenceTimer) {
                clearTimeout(this._keySequenceTimer);
            }
            this._keySequenceTimer = setTimeout(() => {
                this.state.keySeq = null;
                this._keySequenceTimer = null;
            }, 50);
        } else if (result === "handled") {
            this.state.keySeq = null;
            this._emit("keyHandled", this._instance(), keyName, event);
        }

        if (result === "handled" || result === "multi") {
            event.preventDefault();
            return true;
        }
        return result === "nothing" ? "nothing" : false;
    };

    CodeMirror6Adapter.prototype._handleAutoCloseBracketEnter = function () {
        const configuration = _legacyCloseBracketConfigurationAt(
            this,
            this.getCursor()
        );
        const explode = configuration &&
            String(_legacyCloseBracketOption(configuration, "explode") || "");
        if (!explode || this.getOption("disableInput")) {
            return false;
        }
        const selections = this.listSelections();
        for (const selection of selections) {
            if (!selection.empty()) {
                return false;
            }
            const cursor = selection.head;
            const around = this.getRange(
                CodeMirror.Pos(cursor.line, cursor.ch - 1),
                CodeMirror.Pos(cursor.line, cursor.ch + 1)
            );
            if (around.length !== 2 ||
                    explode.indexOf(around) % 2 !== 0) {
                return false;
            }
        }

        this.operation(() => {
            const separator = this.lineSeparator() || "\n";
            this.replaceSelection(separator + separator, null);
            const mainIndex = this._view.state.selection.mainIndex;
            this.setSelections(this.listSelections().map(selection => {
                const position = this.posFromIndex(
                    this.indexFromPos(selection.head) - separator.length
                );
                return {
                    anchor: position,
                    head: position
                };
            }), mainIndex);
            this.listSelections().forEach(selection => {
                this.indentLine(selection.head.line, null, true);
                this.indentLine(selection.head.line + 1, null, true);
            });
        });
        return true;
    };

    CodeMirror6Adapter.prototype._moveAutoCloseBracketSelections = function (
        direction
    ) {
        const mainIndex = this._view.state.selection.mainIndex;
        const ranges = this.listSelections().map(selection => {
            let position;
            if (selection.head.ch || direction > 0) {
                position = {
                    line: selection.head.line,
                    ch: selection.head.ch + direction
                };
            } else {
                const previousLine = Math.max(
                    this.firstLine(),
                    selection.head.line - 1
                );
                position = {
                    line: previousLine,
                    ch: (this.getLine(previousLine) || "").length
                };
            }
            return {
                anchor: position,
                head: position
            };
        });
        this.setSelections(ranges, mainIndex, {
            scroll: false
        });
    };

    CodeMirror6Adapter.prototype._stringStartsAfter = function (position) {
        const token = this.getTokenAt(CodeMirror.Pos(
            position.line,
            position.ch + 1
        ));
        return /\bstring/.test(token.type || "") &&
            token.start === position.ch &&
            (position.ch === 0 ||
                !/\bstring/.test(this.getTokenTypeAt(position) || ""));
    };

    CodeMirror6Adapter.prototype._handleAutoCloseBracketCharacter = function (
        character
    ) {
        const configuration = _legacyCloseBracketConfigurationAt(
            this,
            this.getCursor()
        );
        if (!configuration || this.getOption("disableInput")) {
            return false;
        }

        const pairs = String(
            _legacyCloseBracketOption(configuration, "pairs") || ""
        );
        const position = pairs.indexOf(character);
        if (position === -1) {
            return false;
        }

        const closeBefore = String(
            _legacyCloseBracketOption(configuration, "closeBefore") || ""
        );
        const triples = String(
            _legacyCloseBracketOption(configuration, "triples") || ""
        );
        const identical = pairs.charAt(position + 1) === character;
        const opening = position % 2 === 0;
        const selections = this.listSelections();
        let action;

        for (const selection of selections) {
            const cursor = selection.head;
            const next = this.getRange(
                cursor,
                CodeMirror.Pos(cursor.line, cursor.ch + 1)
            );
            let currentAction;
            if (opening && !selection.empty()) {
                currentAction = "surround";
            } else if ((identical || !opening) && next === character) {
                if (identical && this._stringStartsAfter(cursor)) {
                    currentAction = "both";
                } else if (triples.indexOf(character) !== -1 &&
                        this.getRange(
                            cursor,
                            CodeMirror.Pos(cursor.line, cursor.ch + 3)
                        ) === character + character + character) {
                    currentAction = "skipThree";
                } else {
                    currentAction = "skip";
                }
            } else if (identical &&
                    cursor.ch > 1 &&
                    triples.indexOf(character) !== -1 &&
                    this.getRange(
                        CodeMirror.Pos(cursor.line, cursor.ch - 2),
                        cursor
                    ) === character + character) {
                if (cursor.ch > 2 &&
                        /\bstring/.test(this.getTokenTypeAt(
                            CodeMirror.Pos(cursor.line, cursor.ch - 2)
                        ) || "")) {
                    return false;
                }
                currentAction = "addFour";
            } else if (identical) {
                const previous = cursor.ch === 0 ?
                    " " :
                    this.getRange(
                        CodeMirror.Pos(cursor.line, cursor.ch - 1),
                        cursor
                    );
                if (!CodeMirror.isWordChar(next) &&
                        previous !== character &&
                        !CodeMirror.isWordChar(previous)) {
                    currentAction = "both";
                } else {
                    return false;
                }
            } else if (opening && (
                !next.length ||
                    /\s/.test(next) ||
                    closeBefore.indexOf(next) !== -1
            )) {
                currentAction = "both";
            } else {
                return false;
            }

            if (!action) {
                action = currentAction;
            } else if (action !== currentAction) {
                return false;
            }
        }

        const left = position % 2 ?
            pairs.charAt(position - 1) :
            character;
        const right = position % 2 ?
            character :
            pairs.charAt(position + 1);
        this.operation(() => {
            if (action === "skip") {
                this._moveAutoCloseBracketSelections(1);
            } else if (action === "skipThree") {
                this._moveAutoCloseBracketSelections(3);
            } else if (action === "surround") {
                const replacements = this.getSelections().map(function (text) {
                    return left + text + right;
                });
                this.replaceSelections(replacements, "around", "+input");
                this.setSelections(
                    this.listSelections().map(function (selection) {
                        const inverted = CodeMirror.cmpPos(
                            selection.anchor,
                            selection.head
                        ) > 0;
                        return {
                            anchor: CodeMirror.Pos(
                                selection.anchor.line,
                                selection.anchor.ch + (inverted ? -1 : 1)
                            ),
                            head: CodeMirror.Pos(
                                selection.head.line,
                                selection.head.ch + (inverted ? 1 : -1)
                            )
                        };
                    }),
                    this._view.state.selection.mainIndex,
                    {scroll: false}
                );
            } else if (action === "both") {
                this.replaceSelection(left + right, null, "+input");
                this.triggerElectric(left + right);
                this._moveAutoCloseBracketSelections(-1);
            } else if (action === "addFour") {
                this.replaceSelection(
                    left + left + left + left,
                    "start",
                    "+input"
                );
                this._moveAutoCloseBracketSelections(1);
            }
        });
        return true;
    };

    CodeMirror6Adapter.prototype._handleAutoCloseBracketBackspace = function () {
        const configuration = _legacyCloseBracketConfigurationAt(
            this,
            this.getCursor()
        );
        if (!configuration || this.getOption("disableInput")) {
            return false;
        }
        const pairs = String(
            _legacyCloseBracketOption(configuration, "pairs") || ""
        );
        const selections = this.listSelections();
        for (const selection of selections) {
            if (!selection.empty()) {
                return false;
            }
            const cursor = selection.head;
            const around = this.getRange(
                CodeMirror.Pos(cursor.line, cursor.ch - 1),
                CodeMirror.Pos(cursor.line, cursor.ch + 1)
            );
            if (around.length !== 2 ||
                    pairs.indexOf(around) % 2 !== 0) {
                return false;
            }
        }

        this.operation(() => {
            for (let index = selections.length - 1; index >= 0; index--) {
                const cursor = selections[index].head;
                this.replaceRange(
                    "",
                    CodeMirror.Pos(cursor.line, cursor.ch - 1),
                    CodeMirror.Pos(cursor.line, cursor.ch + 1),
                    "+delete"
                );
            }
        });
        return true;
    };

    CodeMirror6Adapter.prototype._handleKeyDown = function (event) {
        this._emit("keydown", this._instance(), event);
        if (event.defaultPrevented) {
            return true;
        }

        this.state.shift = event.keyCode === 16 || event.shiftKey;
        const keyName = CodeMirror.keyName(event, true);
        if (!keyName) {
            return false;
        }

        if (keyName === "Enter" &&
                !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey &&
                this.getOption("autoCloseBrackets") !== false &&
                this._handleAutoCloseBracketEnter()) {
            event.preventDefault();
            return true;
        }

        if (keyName === "Backspace" &&
                !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey &&
                this.getOption("autoCloseBrackets") !== false &&
                this._handleAutoCloseBracketBackspace()) {
            event.preventDefault();
            return true;
        }

        let handled;
        if (event.shiftKey && !this.state.keySeq) {
            const shiftedResult = this._dispatchLegacyKey(`Shift-${keyName}`, event, false);
            if (shiftedResult === true) {
                return true;
            }
            if (shiftedResult === "nothing") {
                return false;
            }
            handled = this._dispatchLegacyKey(keyName, event, true) === true;
        } else {
            handled = this._dispatchLegacyKey(keyName, event, false) === true;
        }
        if (handled) {
            return true;
        }
        return false;
    };

    CodeMirror6Adapter.prototype._handleKeyPress = function (event) {
        this._emit("keypress", this._instance(), event);
        if (!event.defaultPrevented && this._handleCharacterBinding(event)) {
            return true;
        }
        const hasCommandModifier = event.ctrlKey && !event.altKey || event.metaKey;
        if (!event.defaultPrevented && !hasCommandModifier &&
                this.getOption("autoCloseBrackets") !== false) {
            const keyCode = event.charCode === null || event.charCode === undefined ?
                event.keyCode :
                event.charCode;
            const character = String.fromCharCode(keyCode);
            if (character &&
                    this._handleAutoCloseBracketCharacter(character)) {
                event.preventDefault();
                return true;
            }
        }
        return event.defaultPrevented;
    };

    CodeMirror6Adapter.prototype._handleKeyUp = function (event) {
        if (event.keyCode === 16) {
            this.state.shift = false;
        }
        this._emit("keyup", this._instance(), event);
        return event.defaultPrevented;
    };

    CodeMirror6Adapter.prototype._handleMouseDown = function (event) {
        this._emit("mousedown", this._instance(), event);
        if (event.defaultPrevented) {
            return true;
        }
        this.state.shift = Boolean(event.shiftKey);
        const configureMouse = this.getOption("configureMouse");
        if (typeof configureMouse === "function") {
            configureMouse(this._instance(), "single", event);
        }
        return event.defaultPrevented;
    };

    CodeMirror6Adapter.prototype._handleCharacterBinding = function (event) {
        if (event.ctrlKey && !event.altKey || event.metaKey) {
            return false;
        }
        const keyCode = event.charCode === null || event.charCode === undefined ?
            event.keyCode :
            event.charCode;
        const character = String.fromCharCode(keyCode);
        if (!character || character === "\b") {
            return false;
        }
        return this._dispatchLegacyKey(`'${character}'`, event, false) === true;
    };

    CodeMirror6Adapter.prototype.triggerOnKeyDown = function (event) {
        return this._handleKeyDown(event);
    };

    CodeMirror6Adapter.prototype.triggerOnKeyPress = function (event) {
        return this._handleKeyPress(event);
    };

    CodeMirror6Adapter.prototype.triggerOnKeyUp = function (event) {
        return this._handleKeyUp(event);
    };

    CodeMirror6Adapter.prototype.triggerOnMouseDown = function (event) {
        return this._handleMouseDown(event);
    };

    CodeMirror6Adapter.prototype._emit = function (eventName) {
        const listeners = this._listeners.get(eventName);
        if (!listeners || !listeners.length) {
            return;
        }
        const args = Array.prototype.slice.call(arguments, 1);
        listeners.slice().forEach(function (listener) {
            listener.apply(null, args);
        });
    };

    CodeMirror6Adapter.prototype.on = function (eventName, listener) {
        if (!this._listeners.has(eventName)) {
            this._listeners.set(eventName, []);
        }
        this._listeners.get(eventName).push(listener);
    };

    CodeMirror6Adapter.prototype.off = function (eventName, listener) {
        if (!eventName) {
            this._listeners.clear();
            return;
        }
        const listeners = this._listeners.get(eventName);
        if (!listeners) {
            return;
        }
        if (!listener) {
            listeners.length = 0;
            return;
        }
        const index = listeners.indexOf(listener);
        if (index !== -1) {
            listeners.splice(index, 1);
        }
    };

    CodeMirror6Adapter.prototype.getWrapperElement = function () {
        return this._wrapperElement;
    };

    CodeMirror6Adapter.prototype.getScrollerElement = function () {
        return this._scrollerElement;
    };

    CodeMirror6Adapter.prototype.annotateScrollbar = function (options) {
        return new LegacyScrollbarAnnotation(this, options);
    };

    CodeMirror6Adapter.prototype.showMatchesOnScrollbar = function (
        query,
        caseFold,
        options
    ) {
        return new LegacySearchAnnotation(
            this,
            query,
            caseFold,
            options
        );
    };

    CodeMirror6Adapter.prototype.getGutterElement = function () {
        if (!this._view) {
            return null;
        }
        return this._view.dom.querySelector(".cm-gutters") || this._view.dom;
    };

    CodeMirror6Adapter.prototype.getInputField = function () {
        return this._contentElement;
    };

    CodeMirror6Adapter.prototype.getLineSpaceElement = function () {
        return this._contentElement;
    };

    CodeMirror6Adapter.prototype.focus = function () {
        if (!this._view || this._destroyed ||
                this.getOption("readOnly") === "nocursor") {
            return;
        }
        this._view.focus();
        this._setFocusState(
            this._contentElement === this._view.root.activeElement ||
            this._contentElement.contains(this._view.root.activeElement)
        );
    };

    CodeMirror6Adapter.prototype.hasFocus = function () {
        return Boolean(this._view && !this._destroyed && this._view.hasFocus);
    };

    CodeMirror6Adapter.prototype.isReadOnly = function () {
        return Boolean(this.getOption("readOnly"));
    };

    CodeMirror6Adapter.prototype.refresh = function () {
        if (!this._view || this._destroyed) {
            return;
        }
        this._view.requestMeasure();
        this._decorateDOM();
        this._refreshLegacyHighlighting();
        this._refreshLegacyDecorations();
        this._refreshGutters();
        this._scheduleRulerRefresh();
        this._refreshScrollbarModel();
        this._invalidateRenderedLines();
        this._emit("refresh", this._instance());
    };

    CodeMirror6Adapter.prototype.setSize = function (width, height) {
        if (!this._view || this._destroyed) {
            return;
        }
        if (width !== null && width !== undefined) {
            this._view.dom.style.width = typeof width === "number" ? `${width}px` : width;
        }
        if (height !== null && height !== undefined) {
            this._view.dom.style.height = typeof height === "number" ? `${height}px` : height;
        }
        this.refresh();
    };

    CodeMirror6Adapter.prototype.getViewport = function () {
        if (!this._view) {
            return { from: 0, to: 0 };
        }
        if (this._view.scrollDOM.clientHeight === 0) {
            return { from: 0, to: 0 };
        }
        const doc = this._view.state.doc;
        return {
            from: doc.lineAt(this._view.viewport.from).number - 1 +
                this._firstLine,
            to: doc.lineAt(this._view.viewport.to).number +
                this._firstLine
        };
    };

    CodeMirror6Adapter.prototype.addWidget = function (position, node, scroll, vertical, horizontal) {
        if (!this._view || this._destroyed || !node) {
            return;
        }

        const coordinates = this.cursorCoords(this.clipPos(position), "local");
        const scroller = this._view.scrollDOM;
        const content = this._view.contentDOM;
        let top = content.offsetTop + coordinates.bottom;
        let left = content.offsetLeft + coordinates.left;

        node.style.position = "absolute";
        node.setAttribute("cm-ignore-events", "true");
        node.setAttribute("contenteditable", "false");
        scroller.appendChild(node);

        if (vertical === "over") {
            top = content.offsetTop + coordinates.top;
        } else if (vertical === "above" || vertical === "near") {
            const verticalSpace = Math.max(scroller.clientHeight, scroller.scrollHeight);
            const horizontalSpace = Math.max(scroller.clientWidth, scroller.scrollWidth);
            if ((vertical === "above" || top + node.offsetHeight > verticalSpace) &&
                    content.offsetTop + coordinates.top > node.offsetHeight) {
                top = content.offsetTop + coordinates.top - node.offsetHeight;
            } else if (top + node.offsetHeight <= verticalSpace) {
                top = content.offsetTop + coordinates.bottom;
            }
            if (left + node.offsetWidth > horizontalSpace) {
                left = Math.max(0, horizontalSpace - node.offsetWidth);
            }
        }

        node.style.top = `${top}px`;
        node.style.left = "";
        node.style.right = "";
        const horizontalSpace = Math.max(scroller.clientWidth, scroller.scrollWidth);
        if (horizontal === "right") {
            left = Math.max(0, horizontalSpace - node.offsetWidth);
            node.style.right = "0px";
        } else {
            if (horizontal === "left") {
                left = 0;
            } else if (horizontal === "middle") {
                left = Math.max(0, (horizontalSpace - node.offsetWidth) / 2);
            }
            node.style.left = `${left}px`;
        }

        if (scroll) {
            const widgetRectangle = {
                left: left,
                right: left + node.offsetWidth,
                top: top,
                bottom: top + node.offsetHeight
            };
            this._scrollRectIntoView(widgetRectangle, widgetRectangle, 0);
        }
    };

    CodeMirror6Adapter.prototype.getScrollInfo = function () {
        if (!this._view) {
            return {
                left: this.doc && this.doc._scrollLeft || 0,
                top: this.doc && this.doc._scrollTop || 0,
                height: 0,
                width: 0,
                clientHeight: 0,
                clientWidth: 0
            };
        }
        const scroller = this._view.scrollDOM;
        return {
            left: scroller.scrollLeft,
            top: scroller.scrollTop,
            height: scroller.scrollHeight,
            width: scroller.scrollWidth,
            clientHeight: scroller.clientHeight,
            clientWidth: scroller.clientWidth
        };
    };

    CodeMirror6Adapter.prototype.scrollTo = function (x, y) {
        if (!this._view || this._destroyed) {
            if (this.doc) {
                if (x !== null && x !== undefined) {
                    this.doc._scrollLeft = x;
                }
                if (y !== null && y !== undefined) {
                    this.doc._scrollTop = y;
                }
            }
            return;
        }
        const previousLeft = this._view.scrollDOM.scrollLeft;
        const previousTop = this._view.scrollDOM.scrollTop;
        if (x !== null && x !== undefined) {
            this._view.scrollDOM.scrollLeft = x;
            if (this.doc) {
                this.doc._scrollLeft = x;
            }
        }
        if (y !== null && y !== undefined) {
            this._view.scrollDOM.scrollTop = y;
            if (this.doc) {
                this.doc._scrollTop = y;
            }
        }
        if (this._view.scrollDOM.scrollLeft !== previousLeft ||
                this._view.scrollDOM.scrollTop !== previousTop) {
            this._refreshScrollbarModel();
            this._view.dispatch({
                effects: this._view.scrollSnapshot()
            });
        }
    };

    CodeMirror6Adapter.prototype._scrollRectIntoView = function (from, to, margin) {
        const scroller = this._view.scrollDOM;
        const safeMargin = Math.max(0, margin || 0);
        const top = Math.min(from.top, to.top) - safeMargin;
        const bottom = Math.max(from.bottom, to.bottom) + safeMargin;
        const left = Math.min(from.left, to.left) - safeMargin;
        const right = Math.max(from.right, to.right) + safeMargin;

        if (top < scroller.scrollTop) {
            scroller.scrollTop = Math.max(0, top);
        } else if (bottom > scroller.scrollTop + scroller.clientHeight) {
            scroller.scrollTop = bottom - scroller.clientHeight;
        }
        if (left < scroller.scrollLeft) {
            scroller.scrollLeft = Math.max(0, left);
        } else if (right > scroller.scrollLeft + scroller.clientWidth) {
            scroller.scrollLeft = right - scroller.clientWidth;
        }
    };

    CodeMirror6Adapter.prototype._scrollContentRectIntoView = function (from, to, margin) {
        const scroller = this._view.scrollDOM;
        const safeMargin = Math.max(0, margin || 0);
        const top = Math.min(from.top, to.top) - safeMargin;
        const bottom = Math.max(from.bottom, to.bottom) + safeMargin;
        const left = Math.min(from.left, to.left);
        const right = Math.max(from.right, to.right);
        const gutter = this.getGutterElement();
        const fixedGutterWidth = this.getOption("fixedGutter") !== false &&
            gutter && gutter !== this._view.dom ?
            gutter.offsetWidth :
            0;
        const nativeScrollbarWidth = Math.max(
            0,
            scroller.offsetWidth - scroller.clientWidth
        );
        const scrollGap = Math.max(
            0,
            LEGACY_SCROLLER_GAP - nativeScrollbarWidth
        );
        const verticalScrollbarWidth =
            scroller.scrollHeight > scroller.clientHeight + 1 ?
                nativeScrollbarWidth :
                0;
        const visibleWidth = Math.max(
            0,
            scroller.clientWidth -
                scrollGap -
                verticalScrollbarWidth -
                fixedGutterWidth
        );
        const tooWide = right - left > visibleWidth;
        const visibleRight = tooWide ? left + visibleWidth : right;

        if (top < scroller.scrollTop) {
            scroller.scrollTop = Math.max(0, top);
        } else if (bottom > scroller.scrollTop + scroller.clientHeight) {
            scroller.scrollTop = bottom - scroller.clientHeight;
        }
        if (left < HORIZONTAL_SCROLL_MARGIN) {
            scroller.scrollLeft = 0;
        } else if (left < scroller.scrollLeft) {
            scroller.scrollLeft = Math.max(
                0,
                left - (tooWide ? 0 : HORIZONTAL_SCROLL_MARGIN)
            );
        } else if (visibleRight >
                scroller.scrollLeft + visibleWidth - 3) {
            scroller.scrollLeft = visibleRight +
                (tooWide ? 0 : HORIZONTAL_SCROLL_MARGIN) -
                visibleWidth;
        }
    };

    CodeMirror6Adapter.prototype.scrollIntoView = function (range, margin) {
        if (!this._view || this._destroyed) {
            return;
        }
        if (range === null || range === undefined) {
            range = this.getCursor();
            if (margin === null || margin === undefined) {
                margin = this._options.cursorScrollMargin || 0;
            }
        } else if (typeof range === "number") {
            range = {
                line: range,
                ch: 0
            };
        } else if (range.left !== undefined) {
            range = {
                from: range,
                to: range
            };
        }

        if (range.from && range.from.line === undefined) {
            const from = range.from;
            const to = range.to || from;
            const scroller = this._view.scrollDOM;
            const previousLeft = scroller.scrollLeft;
            const previousTop = scroller.scrollTop;
            this._scrollContentRectIntoView(from, to, margin);
            if (scroller.scrollLeft !== previousLeft ||
                    scroller.scrollTop !== previousTop) {
                this._dispatchLegacyUpdate();
            }
            return;
        }

        const from = this.indexFromPos(range.from || range);
        const to = range && range.to ? this.indexFromPos(range.to) : from;
        const scroller = this._view.scrollDOM;
        const safeMargin = Math.max(0, margin || 0);
        const previousLeft = scroller.scrollLeft;
        const previousTop = scroller.scrollTop;
        this._scrollContentRectIntoView(
            this._coordsForOffset(from, "local"),
            this._coordsForOffset(to, "local"),
            safeMargin
        );
        const transactionSpec = {
            effects: CM6.EditorView.scrollIntoView(
                CM6.EditorSelection.range(from, to),
                {
                    yMargin: Math.min(safeMargin, Math.max(0, scroller.clientHeight - 1)),
                    xMargin: Math.min(safeMargin, Math.max(0, scroller.clientWidth - 1))
                }
            )
        };
        if (scroller.scrollLeft !== previousLeft ||
                scroller.scrollTop !== previousTop) {
            transactionSpec.annotations = this._legacyUpdateAnnotation.of(true);
        }
        this._view.dispatch(transactionSpec);
    };

    CodeMirror6Adapter.prototype.cursorCoords = function (start, mode) {
        if (!this._view) {
            return this._coordsForOffset(0, mode);
        }
        let position;
        if (!start) {
            position = this._view.state.selection.main.head;
        } else if (start === "start" || start === "from") {
            position = this._view.state.selection.main.from;
        } else if (start === "end" || start === "to") {
            position = this._view.state.selection.main.to;
        } else {
            position = this.indexFromPos(start);
        }
        return this._coordsForOffset(position, mode);
    };

    CodeMirror6Adapter.prototype.charCoords = function (position, mode) {
        return this._coordsForOffset(this.indexFromPos(position), mode);
    };

    CodeMirror6Adapter.prototype._coordsForOffset = function (offset, mode) {
        if (!this._view) {
            return {
                left: 0,
                right: 0,
                top: 0,
                bottom: DEFAULT_LINE_HEIGHT
            };
        }
        if (mode === true) {
            mode = "page";
        } else if (mode === false) {
            mode = "local";
        }
        mode = mode || "page";

        const coords = this._view.coordsAtPos(_clamp(offset, 0, this._view.state.doc.length));
        const line = this._view.state.doc.lineAt(
            _clamp(offset, 0, this._view.state.doc.length)
        );
        const block = this._view.lineBlockAt(line.from);
        const contentRect = this._view.contentDOM.getBoundingClientRect();
        const fallbackTop = this._view.documentTop + block.top;
        const result = coords || {
            left: contentRect.left,
            right: contentRect.left,
            top: fallbackTop,
            bottom: fallbackTop + this.defaultTextHeight()
        };

        if (mode === "local") {
            const lineTop = this._view.documentTop + block.top;
            const topWithinLine = result.top - lineTop;
            const bottomWithinLine = result.bottom - lineTop;
            return {
                left: result.left - contentRect.left,
                right: result.right - contentRect.left,
                top: this._view.documentPadding.top + block.top + topWithinLine,
                bottom: this._view.documentPadding.top + block.top + bottomWithinLine
            };
        }
        if (mode === "div") {
            return {
                left: result.left - contentRect.left,
                right: result.right - contentRect.left,
                top: result.top - contentRect.top,
                bottom: result.bottom - contentRect.top
            };
        }
        if (mode === "page" || !mode) {
            return {
                left: result.left + window.scrollX,
                right: result.right + window.scrollX,
                top: result.top + window.scrollY,
                bottom: result.bottom + window.scrollY
            };
        }
        return result;
    };

    CodeMirror6Adapter.prototype.coordsChar = function (coordinates, mode) {
        if (!this._view) {
            return {
                line: this._firstLine,
                ch: 0,
                sticky: "after",
                outside: 0,
                xRel: 0
            };
        }
        if (mode === true) {
            mode = "page";
        } else if (mode === false) {
            mode = "local";
        }
        mode = mode || "page";

        let left = coordinates.left;
        let top = coordinates.top;
        if (mode === "local") {
            const contentRect = this._view.contentDOM.getBoundingClientRect();
            left += contentRect.left;
            top += contentRect.top;
        } else if (mode === "div") {
            const contentRect = this._view.contentDOM.getBoundingClientRect();
            left += contentRect.left;
            top += contentRect.top;
        } else if (mode === "page" || !mode) {
            left -= window.scrollX;
            top -= window.scrollY;
        }
        const offset = this._view.posAtCoords({ x: left, y: top });
        const contentRect = this._view.contentDOM.getBoundingClientRect();
        let outside = 0;
        if (top < contentRect.top) {
            outside = -1;
        } else if (top >= contentRect.bottom) {
            outside = 1;
        }
        const safeOffset = offset === null ?
            (outside < 0 ? 0 : this._view.state.doc.length) :
            offset;
        const position = this.posFromIndex(safeOffset);
        const positionCoordinates = this._view.coordsAtPos(safeOffset);
        position.sticky = "after";
        position.xRel = positionCoordinates ? left - positionCoordinates.left : 0;
        if (outside) {
            position.outside = outside;
        }
        return position;
    };

    CodeMirror6Adapter.prototype.defaultTextHeight = function () {
        if (!this._view) {
            return DEFAULT_LINE_HEIGHT;
        }
        const coordinates = this._view.coordsAtPos(0);
        if (coordinates && coordinates.bottom > coordinates.top) {
            return coordinates.bottom - coordinates.top;
        }
        return this._view.defaultLineHeight || DEFAULT_LINE_HEIGHT;
    };

    CodeMirror6Adapter.prototype.defaultCharWidth = function () {
        if (!this._view) {
            return DEFAULT_CHARACTER_WIDTH;
        }
        return this._view.defaultCharacterWidth || DEFAULT_CHARACTER_WIDTH;
    };

    CodeMirror6Adapter.prototype.heightAtLine = function (lineNumber, mode) {
        if (!this._view) {
            return 0;
        }
        if (mode === true) {
            mode = "page";
        } else if (mode === false) {
            mode = "local";
        }
        mode = mode || "page";

        if (typeof lineNumber !== "number") {
            lineNumber = this.getLineNumber(lineNumber);
        }
        if (lineNumber === null || lineNumber === undefined) {
            lineNumber = this.firstLine();
        }
        const internalLineNumber = lineNumber - this._firstLine;
        const beyondDocument = internalLineNumber >= this._view.state.doc.lines;
        let blockTop;
        if (beyondDocument) {
            blockTop = this._view.contentHeight;
        } else {
            const line = this._view.state.doc.line(
                _clamp(
                    internalLineNumber + 1,
                    1,
                    this._view.state.doc.lines
                )
            );
            blockTop = this._view.lineBlockAt(line.from).top;
        }

        if (mode === "window") {
            return this._view.documentTop + blockTop;
        }
        if (mode === "page") {
            return this._view.documentTop + blockTop + window.scrollY;
        }
        return blockTop;
    };

    CodeMirror6Adapter.prototype.lineAtHeight = function (height, mode) {
        if (!this._view) {
            return this._firstLine;
        }
        if (mode === true) {
            mode = "page";
        } else if (mode === false) {
            mode = "local";
        }
        mode = mode || "page";

        let documentHeight = height;
        if (mode === "window") {
            documentHeight -= this._view.documentTop;
        } else if (mode === "page") {
            documentHeight -= this._view.documentTop + window.scrollY;
        }

        const block = this._view.lineBlockAtHeight(
            _clamp(documentHeight, 0, this._view.contentHeight)
        );
        return this._view.state.doc.lineAt(block.from).number - 1 +
            this._firstLine;
    };

    CodeMirror6Adapter.prototype.addOverlay = function (specification, options) {
        const mode = specification && typeof specification.token === "function" ?
            specification :
            CodeMirror.getMode(this._options, specification);
        if (mode.startState) {
            throw new Error("Overlays may not be stateful.");
        }
        const overlayRecord = {
            mode: mode,
            modeSpec: specification,
            opaque: options && options.opaque,
            priority: options && options.priority || 0
        };
        const overlays = this.state.overlays;
        let insertionIndex = 0;
        while (insertionIndex < overlays.length &&
                overlays[insertionIndex].priority <= overlayRecord.priority) {
            insertionIndex++;
        }
        overlays.splice(insertionIndex, 0, overlayRecord);
        this._refreshLegacyHighlighting();
    };

    CodeMirror6Adapter.prototype.removeOverlay = function (specification) {
        const overlays = this.state.overlays;
        const index = overlays.findIndex(function (record) {
            const current = record.modeSpec;
            return current === specification ||
                typeof specification === "string" &&
                    current && current.name === specification;
        });
        if (index !== -1) {
            overlays.splice(index, 1);
            this._refreshLegacyHighlighting();
        }
    };

    CodeMirror6Adapter.prototype._syncMarkerLines = function (marker) {
        marker.lines.length = 0;
        if (marker._cleared || marker._hidden || !this._view) {
            return;
        }

        const doc = this._view.state.doc;
        const fromLine = doc.lineAt(
            _clamp(marker._from, 0, doc.length)
        ).number - 1 + this._firstLine;
        const toLine = doc.lineAt(
            _clamp(marker._to, 0, doc.length)
        ).number - 1 + this._firstLine;
        for (let lineNumber = fromLine; lineNumber <= toLine; lineNumber++) {
            const lineHandle = this.getLineHandle(lineNumber);
            if (lineHandle) {
                marker.lines.push(lineHandle);
            }
        }
    };

    CodeMirror6Adapter.prototype._createMarker = function (type, from, to, options) {
        const markerId = this._nextMarkerId++;
        this.$mid = this._nextMarkerId;
        const markerOptions = options && options.nodeType ? {
            widget: options
        } : Object.assign({}, options);
        delete markerOptions._sharedInternal;
        const marker = Object.assign({
            type: type,
            _adapter: this,
            id: markerId,
            _id: markerId,
            _from: this.indexFromPos(from),
            _to: this.indexFromPos(to || from),
            _cleared: false,
            _hidden: false,
            lines: [],
            clear: function () {
                if (this._cleared) {
                    return;
                }
                if (this.parent && !this._clearingShared) {
                    this.parent.clear();
                    return;
                }
                const adapter = this._adapter;
                const found = this.find();
                this._cleared = true;
                this.explicitlyCleared = true;
                this.lines.length = 0;
                adapter._markers = adapter._markers.filter(function (candidate) {
                    return candidate !== marker;
                });
                delete adapter.marks[this.id];
                adapter._refreshLegacyDecorations();
                if (found) {
                    const clearFrom = type === "bookmark" ? found : found.from;
                    const clearTo = type === "bookmark" ? found : found.to;
                    CodeMirror.signal(marker, "clear", clearFrom, clearTo);
                }
                adapter._emit("markerCleared", adapter, marker);
            },
            find: function (side) {
                const adapter = this._adapter;
                if (this._cleared || this._hidden || !adapter._view) {
                    return undefined;
                }
                if (type === "bookmark") {
                    return adapter.posFromIndex(this._from);
                }
                if (side === -1) {
                    return adapter.posFromIndex(this._from);
                }
                if (side === 1) {
                    return adapter.posFromIndex(this._to);
                }
                return {
                    from: adapter.posFromIndex(this._from),
                    to: adapter.posFromIndex(this._to)
                };
            },
            changed: function () {
                const adapter = this._adapter;
                adapter._refreshLegacyDecorations();
                if (adapter._view) {
                    adapter._view.requestMeasure();
                }
                CodeMirror.signal(marker, "changed");
                adapter._emit("markerChanged", adapter, marker);
            },
            on: function (eventName, listener) {
                CodeMirror.on(marker, eventName, listener);
            },
            off: function (eventName, listener) {
                CodeMirror.off(marker, eventName, listener);
            }
        }, markerOptions);
        marker.doc = this.doc;
        const replacementNode = marker.replacedWith ||
            type === "bookmark" && marker.widget ||
            null;
        if (replacementNode) {
            marker.replacedWith = replacementNode;
            marker.widgetNode = window.document.createElement("span");
            marker.widgetNode.className = "CodeMirror-widget";
            marker.widgetNode.setAttribute("role", "presentation");
            marker.widgetNode.appendChild(replacementNode);
            if (!marker.handleMouseEvents) {
                marker.widgetNode.setAttribute("cm-ignore-events", "true");
            }
            if (marker.insertLeft) {
                marker.widgetNode.insertLeft = true;
            }
        }
        marker._widgetNode = marker.widgetNode || null;
        if (type === "range" && marker.clearWhenEmpty === undefined) {
            marker.clearWhenEmpty = true;
        }
        if (type === "range" && marker.replacedWith) {
            marker.collapsed = true;
        }
        if (type === "range" && marker.collapsed) {
            marker.atomic = true;
        }
        if (type === "range" && marker._from >= marker._to &&
                marker.clearWhenEmpty !== false) {
            marker._hidden = true;
        }
        this._markers.push(marker);
        this.marks[markerId] = marker;
        this._syncMarkerLines(marker);
        this._emit("markerAdded", this, marker);
        if (marker.readOnly && !marker._hidden) {
            this.clearHistory();
        }
        this._refreshLegacyDecorations();
        return marker;
    };

    CodeMirror6Adapter.prototype._sharedMarkerRange = function (type, from, to) {
        if (type === "bookmark") {
            if (from.line < this.firstLine() || from.line > this.lastLine()) {
                return null;
            }
            const position = this.clipPos(from);
            return {
                from: position,
                to: position
            };
        }
        const docFrom = {
            line: this.firstLine(),
            ch: 0
        };
        const docTo = {
            line: this.lastLine(),
            ch: (this.getLine(this.lastLine()) || "").length
        };
        if (CodeMirror.cmpPos(to, docFrom) < 0 ||
                CodeMirror.cmpPos(from, docTo) > 0) {
            return null;
        }
        return {
            from: CodeMirror.cmpPos(from, docFrom) < 0 ? docFrom : this.clipPos(from),
            to: CodeMirror.cmpPos(to, docTo) > 0 ? docTo : this.clipPos(to)
        };
    };

    CodeMirror6Adapter.prototype._markerOptionsForLinkedDoc = function (marker) {
        const optionNames = [
            "addToHistory",
            "atomic",
            "attributes",
            "className",
            "clearOnEnter",
            "clearWhenEmpty",
            "collapsed",
            "css",
            "endStyle",
            "handleMouseEvents",
            "inclusiveLeft",
            "inclusiveRight",
            "insertLeft",
            "readOnly",
            "startStyle",
            "title"
        ];
        const options = {
            shared: false,
            _sharedInternal: true
        };
        optionNames.forEach(function (name) {
            if (marker[name] !== undefined) {
                options[name] = marker[name];
            }
        });
        if (marker.replacedWith) {
            if (marker.type === "bookmark") {
                options.widget = marker.replacedWith.cloneNode(true);
            } else {
                options.replacedWith = marker.replacedWith.cloneNode(true);
            }
        }
        return options;
    };

    CodeMirror6Adapter.prototype._createSharedMarker = function (type, from, to, options) {
        const docs = [this.doc];
        this.doc.iterLinkedDocs(function (doc) {
            docs.push(doc);
        });
        const markers = [];
        let primary = null;
        docs.forEach(doc => {
            if (!doc._adapter) {
                return;
            }
            const range = doc._adapter._sharedMarkerRange(type, from, to);
            if (!range) {
                return;
            }
            const localOptions = Object.assign({}, options, {
                shared: false,
                _sharedInternal: true
            });
            const marker = doc._adapter._createMarker(
                type,
                range.from,
                range.to,
                localOptions
            );
            marker.shared = true;
            markers.push(marker);
            if (!doc._links.some(function (link) {
                return link.isParent;
            })) {
                primary = marker;
            }
        });
        const sharedMarker = new CodeMirror.SharedTextMarker(
            markers,
            primary || markers[0]
        );
        markers.forEach(function (marker) {
            marker.parent = sharedMarker;
        });
        return sharedMarker;
    };

    CodeMirror6Adapter.prototype._copySharedMarkersTo = function (targetDoc) {
        const targetAdapter = targetDoc && targetDoc._adapter;
        if (!targetAdapter) {
            return;
        }
        const sharedMarkers = [];
        this._markers.forEach(function (marker) {
            if (marker.parent && sharedMarkers.indexOf(marker.parent) === -1) {
                sharedMarkers.push(marker.parent);
            }
        });
        sharedMarkers.forEach(sharedMarker => {
            if (sharedMarker._cleared ||
                    sharedMarker.markers.some(function (marker) {
                        return marker._adapter === targetAdapter && !marker._cleared;
                    })) {
                return;
            }
            const representative = sharedMarker.markers.find(function (marker) {
                return marker && !marker._cleared && marker.find();
            });
            if (!representative) {
                return;
            }
            const found = representative.find();
            const from = representative.type === "bookmark" ? found : found.from;
            const to = representative.type === "bookmark" ? found : found.to;
            const range = targetAdapter._sharedMarkerRange(
                representative.type,
                from,
                to
            );
            if (!range) {
                return;
            }
            const marker = targetAdapter._createMarker(
                representative.type,
                range.from,
                range.to,
                this._markerOptionsForLinkedDoc(representative)
            );
            marker.shared = true;
            marker.parent = sharedMarker;
            sharedMarker.markers.push(marker);
        });
    };

    CodeMirror6Adapter.prototype._partitionSharedMarkers = function (otherDoc) {
        const docs = new Set();
        const visit = function (doc) {
            if (docs.has(doc)) {
                return;
            }
            docs.add(doc);
            doc._links.forEach(function (link) {
                visit(link.doc);
            });
        };
        visit(this.doc);
        visit(otherDoc);

        const sharedMarkers = [];
        docs.forEach(function (doc) {
            if (!doc._adapter) {
                return;
            }
            doc._adapter._markers.forEach(function (marker) {
                if (marker.parent &&
                        sharedMarkers.indexOf(marker.parent) === -1) {
                    sharedMarkers.push(marker.parent);
                }
            });
        });
        sharedMarkers.forEach(function (sharedMarker) {
            if (!sharedMarker.primary || !sharedMarker.primary.doc) {
                return;
            }
            const primaryComponent = new Set();
            const visitPrimaryComponent = function (doc) {
                if (primaryComponent.has(doc)) {
                    return;
                }
                primaryComponent.add(doc);
                doc._links.forEach(function (link) {
                    visitPrimaryComponent(link.doc);
                });
            };
            visitPrimaryComponent(sharedMarker.primary.doc);

            sharedMarker.markers = sharedMarker.markers.filter(function (marker) {
                if (marker.doc && primaryComponent.has(marker.doc)) {
                    return true;
                }
                marker.parent = null;
                return false;
            });
        });
    };

    CodeMirror6Adapter.prototype.markText = function (from, to, options) {
        if (options && options.shared && !options._sharedInternal) {
            return this._createSharedMarker("range", from, to, options);
        }
        return this._createMarker("range", from, to, options);
    };

    CodeMirror6Adapter.prototype.setBookmark = function (position, options) {
        const markerOptions = {
            replacedWith: options && (
                options.nodeType === null || options.nodeType === undefined ?
                    options.widget :
                    options
            ),
            insertLeft: options && options.insertLeft,
            clearWhenEmpty: false,
            shared: options && options.shared,
            handleMouseEvents: options && options.handleMouseEvents
        };
        if (markerOptions.shared) {
            return this._createSharedMarker(
                "bookmark",
                position,
                position,
                markerOptions
            );
        }
        return this._createMarker(
            "bookmark",
            position,
            position,
            markerOptions
        );
    };

    function _sortMarkersByFirstVisitedLine(markers, doc, fromIndex) {
        return markers.map(function (marker, insertionIndex) {
            const firstVisitedIndex = Math.max(marker._from, fromIndex);
            return {
                marker: marker,
                insertionIndex: insertionIndex,
                lineNumber: doc.lineAt(
                    _clamp(firstVisitedIndex, 0, doc.length)
                ).number
            };
        }).sort(function (left, right) {
            return left.lineNumber - right.lineNumber ||
                left.insertionIndex - right.insertionIndex;
        }).map(function (entry) {
            return entry.marker;
        });
    }

    CodeMirror6Adapter.prototype.getAllMarks = function () {
        const markers = this._markers.filter(function (marker) {
            return !marker._cleared && !marker._hidden;
        });
        if (!this._view) {
            return markers;
        }
        const sorted = _sortMarkersByFirstVisitedLine(
            markers,
            this._view.state.doc,
            0
        );
        return sorted;
    };

    CodeMirror6Adapter.prototype.findMarks = function (from, to, filter) {
        const fromIndex = this.indexFromPos(from);
        const toIndex = this.indexFromPos(to);
        const markers = this._markers.filter(function (marker) {
            if (marker._cleared || marker._hidden) {
                return false;
            }
            if (marker.type === "bookmark") {
                return marker._from > fromIndex && marker._from < toIndex;
            }
            return marker._to > fromIndex && marker._from < toIndex;
        });
        const sorted = _sortMarkersByFirstVisitedLine(
            markers,
            this._view.state.doc,
            fromIndex
        );
        return sorted.filter(function (marker) {
            return !filter || filter(marker);
        }).map(function (marker) {
            return marker.parent || marker;
        }).filter(function (marker, index, allMarkers) {
            return allMarkers.indexOf(marker) === index;
        });
    };

    CodeMirror6Adapter.prototype.findMarksAt = function (position) {
        const index = this.indexFromPos(position);
        return this._markers.filter(function (marker) {
            if (marker._cleared || marker._hidden) {
                return false;
            }
            if (marker.type === "bookmark") {
                return marker._from === index;
            }
            return marker._from <= index && marker._to >= index;
        }).map(function (marker) {
            return marker.parent || marker;
        }).filter(function (marker, markerIndex, markers) {
            return markers.indexOf(marker) === markerIndex;
        });
    };

    CodeMirror6Adapter.prototype.addLineClass = function (line, where, className) {
        const lineHandle = typeof line === "number" ? this.getLineHandle(line) : line;
        if (!lineHandle) {
            return null;
        }
        const currentClassName = this._lineClasses.filter(function (record) {
            return record.lineHandle === lineHandle && record.where === where;
        }).map(function (record) {
            return record.className;
        }).join(" ");
        if (!_legacyClassPattern(className).test(currentClassName)) {
            this._lineClasses = this._lineClasses.filter(function (record) {
                return record.lineHandle !== lineHandle || record.where !== where;
            });
            this._lineClasses.push({
                lineHandle: lineHandle,
                where: where,
                className: currentClassName ?
                    `${currentClassName} ${className}` :
                    className
            });
        }
        this._refreshLegacyDecorations();
        return lineHandle;
    };

    CodeMirror6Adapter.prototype.removeLineClass = function (line, where, className) {
        const lineHandle = typeof line === "number" ? this.getLineHandle(line) : line;
        const affectedKinds = new Set(this._lineClasses.filter(function (record) {
            return record.lineHandle === lineHandle &&
                (!where || record.where === where);
        }).map(function (record) {
            return record.where;
        }));

        affectedKinds.forEach(affectedWhere => {
            const currentClassName = this._lineClasses.filter(function (record) {
                return record.lineHandle === lineHandle &&
                    record.where === affectedWhere;
            }).map(function (record) {
                return record.className;
            }).join(" ");
            let nextClassName = "";
            if (className !== null && className !== undefined) {
                const match = currentClassName.match(_legacyClassPattern(className));
                if (!match) {
                    return;
                }
                const end = match.index + match[0].length;
                nextClassName = (
                    currentClassName.slice(0, match.index) +
                    (!match.index || end === currentClassName.length ? "" : " ") +
                    currentClassName.slice(end)
                ).trim();
            }
            this._lineClasses = this._lineClasses.filter(function (record) {
                return record.lineHandle !== lineHandle ||
                    record.where !== affectedWhere;
            });
            if (nextClassName) {
                this._lineClasses.push({
                    lineHandle: lineHandle,
                    where: affectedWhere,
                    className: nextClassName
                });
            }
        });
        this._refreshLegacyDecorations();
        return lineHandle;
    };

    CodeMirror6Adapter.prototype.addLineWidget = function (line, node, options) {
        const lineHandle = typeof line === "number" ? this.getLineHandle(line) : line;
        if (!lineHandle) {
            return null;
        }
        const widget = Object.assign({}, options || {});
        widget.doc = this.doc;
        widget.node = node;
        widget.line = lineHandle;
        widget.on = function (eventName, listener) {
            CodeMirror.on(this, eventName, listener);
        };
        widget.off = function (eventName, listener) {
            CodeMirror.off(this, eventName, listener);
        };
        const record = {
            widget: widget,
            node: node,
            options: Object.assign({}, options || {}),
            renderedWrapper: null,
            version: 0,
            cleared: false
        };
        widget.clear = function () {
            if (record.cleared) {
                return;
            }
            const adapter = widget.doc && widget.doc._adapter;
            const lineNumber = adapter ?
                adapter.getLineNumber(widget.line) :
                null;
            record.cleared = true;
            if (adapter) {
                adapter._lineWidgets = adapter._lineWidgets.filter(function (candidate) {
                    return candidate !== record;
                });
            }
            widget.line.widgets = widget.line.widgets.filter(function (candidate) {
                return candidate !== widget;
            });
            if (adapter) {
                adapter._refreshLegacyDecorations();
                adapter._emit("lineWidgetCleared", adapter, widget, lineNumber);
            }
        };
        widget.changed = function () {
            if (record.cleared) {
                return;
            }
            const adapter = widget.doc && widget.doc._adapter;
            widget.height = null;
            if (!adapter) {
                return;
            }
            adapter._applyLineWidgetLayout(record);
            adapter._measureLineWidget(record);
            if (adapter._view) {
                adapter._view.requestMeasure();
            }
            adapter._emit(
                "lineWidgetChanged",
                adapter,
                widget,
                adapter.getLineNumber(widget.line)
            );
        };
        const insertAt = Number.isInteger(record.options.insertAt) ?
            record.options.insertAt :
            lineHandle.widgets.length;
        lineHandle.widgets.splice(
            _clamp(insertAt, 0, lineHandle.widgets.length),
            0,
            widget
        );
        this._lineWidgets.push(record);
        this._refreshLegacyDecorations();
        if (widget.height === undefined) {
            widget.height = 0;
        }
        this._emit("lineWidgetAdded", this, widget, this.getLineNumber(lineHandle));
        return widget;
    };

    CodeMirror6Adapter.prototype.removeLineWidget = function (widget) {
        if (widget && typeof widget.clear === "function") {
            widget.clear();
        }
    };

    CodeMirror6Adapter.prototype.setGutterMarker = function (line, gutterName, marker) {
        const lineNumber = typeof line === "number" ? line : this.getLineNumber(line);
        this._removeGutterMarkerRecords(lineNumber, gutterName);
        const lineHandle = typeof line === "number" ? this.getLineHandle(line) : line;
        if (!lineHandle) {
            return null;
        }
        if (marker) {
            this._gutterMarkers.push({
                lineHandle: lineHandle,
                gutterName: gutterName,
                marker: marker,
                renderedNode: _nodeForGutterMarker(marker)
            });
        }
        this._scheduleGutterRefresh();
        return lineHandle;
    };

    CodeMirror6Adapter.prototype.clearGutter = function (gutterName) {
        this._gutterMarkers = this._gutterMarkers.filter(function (record) {
            return record.gutterName !== gutterName;
        });
        this._scheduleGutterRefresh();
    };

    CodeMirror6Adapter.prototype.lineInfo = function (line) {
        const lineHandle = typeof line === "number" ? this.getLineHandle(line) : line;
        const lineNumber = this.getLineNumber(lineHandle);
        if (lineNumber === null || lineNumber === undefined) {
            return null;
        }
        const gutterMarkers = {};
        this._gutterMarkers.forEach(record => {
            if (this.getLineNumber(record.lineHandle) === lineNumber) {
                gutterMarkers[record.gutterName] = record.marker;
            }
        });
        const classes = this._lineClasses.filter(function (record) {
            return record.lineHandle === lineHandle;
        });
        const activeLineOption = this.getOption("styleActiveLine");
        const isActiveLine = Boolean(activeLineOption) &&
            this._view.state.selection.ranges.some(range => {
                const anchorLine = this._view.state.doc.lineAt(
                    range.anchor
                ).number - 1 + this._firstLine;
                const headLine = this._view.state.doc.lineAt(
                    range.head
                ).number - 1 + this._firstLine;
                const allowNonEmpty = typeof activeLineOption === "object" &&
                    activeLineOption.nonEmpty;
                if (allowNonEmpty ? anchorLine !== headLine : !range.empty) {
                    return false;
                }
                const visualStart = this.getLineHandleVisualStart(headLine);
                return this.getLineNumber(visualStart) === lineNumber;
            });
        const textClasses = classes.filter(function (record) {
            return record.where === "text";
        }).map(function (record) {
            return record.className;
        });
        const backgroundClasses = classes.filter(function (record) {
            return record.where === "background";
        }).map(function (record) {
            return record.className;
        });
        const wrapperClasses = classes.filter(function (record) {
            return record.where === "wrap";
        }).map(function (record) {
            return record.className;
        });
        if (isActiveLine) {
            backgroundClasses.push("CodeMirror-activeline-background");
            wrapperClasses.push("CodeMirror-activeline");
        }
        return {
            line: lineNumber,
            handle: lineHandle,
            text: this.getLine(lineNumber),
            gutterMarkers: Object.keys(gutterMarkers).length ?
                gutterMarkers :
                undefined,
            textClass: textClasses.join(" ") || undefined,
            bgClass: backgroundClasses.join(" ") || undefined,
            wrapClass: wrapperClasses.join(" ") || undefined,
            widgets: lineHandle.widgets.length ?
                lineHandle.widgets :
                undefined
        };
    };

    CodeMirror6Adapter.prototype.getValue = function (separator) {
        if (!this._view) {
            return separator === false ? [""] : "";
        }
        const value = this._view.state.doc.toString();
        if (separator === false) {
            return _splitLines(value);
        }
        const lineSeparator = separator === undefined ?
            this.lineSeparator() :
            separator;
        return lineSeparator === "\n" ? value : value.replace(/\n/g, lineSeparator);
    };

    CodeMirror6Adapter.prototype.setValue = function (text) {
        const normalizedText = this.splitLines(String(text)).join("\n");
        this.operation(() => {
            const startState = this._view.state;
            const beforeChangeListeners = this._listeners.get("beforeChange");
            const documentBeforeChangeListeners = this.doc &&
                this.doc._handlers &&
                this.doc._handlers.beforeChange;
            const isFullChange = !(
                beforeChangeListeners && beforeChangeListeners.length ||
                documentBeforeChangeListeners && documentBeforeChangeListeners.length
            );
            const change = this._createLegacyChange(
                startState.doc,
                0,
                startState.doc.length,
                normalizedText,
                "setValue"
            );
            this._signalBeforeChange(change);

            const annotations = [
                this._originAnnotation.of(change.origin),
                this._bypassReadOnlyAnnotation.of(true),
                this._skipBeforeChangeAnnotation.of(true),
                this._setValueSelectionResetAnnotation.of(true)
            ];
            if (isFullChange) {
                annotations.push(this._fullChangeAnnotation.of(true));
            }
            const transactionSpec = {
                selection: {
                    anchor: 0
                },
                annotations: annotations
            };
            let syntheticChangeSpec;
            if (!change._cancelled) {
                const from = this.indexFromPos(change.from);
                const to = this.indexFromPos(change.to);
                const insert = change.text.join("\n");
                transactionSpec.changes = {
                    from: from,
                    to: to,
                    insert: insert
                };
                syntheticChangeSpec = {
                    from: from,
                    to: to,
                    insert: insert,
                    origin: change.origin
                };
            }

            if (syntheticChangeSpec &&
                    (syntheticChangeSpec.from !== syntheticChangeSpec.to ||
                        syntheticChangeSpec.insert)) {
                annotations.push(
                    this._syntheticChangesAnnotation.of([syntheticChangeSpec])
                );
            }
            this._view.dispatch(startState.update(transactionSpec));
            this.scrollTo(0, 0);
        });
    };

    CodeMirror6Adapter.prototype.replaceRange = function (text, from, to, origin) {
        const fromIndex = this.indexFromPos(from);
        const toIndex = this.indexFromPos(to || from);
        const changes = {
            from: fromIndex,
            to: toIndex,
            insert: String(text)
        };
        const changeSet = this._view.state.changes(changes);
        const currentSelection = this._view.state.selection;
        const mappedChangeEnd = fromIndex + String(text).length;
        function mapPosition(position) {
            if (position < fromIndex) {
                return position;
            }
            if (position <= toIndex) {
                return mappedChangeEnd;
            }
            return changeSet.mapPos(position, 1);
        }
        const mappedSelection = CM6.EditorSelection.create(
            currentSelection.ranges.map(function (range) {
                return CM6.EditorSelection.range(
                    mapPosition(range.anchor),
                    mapPosition(range.head)
                );
            }),
            currentSelection.mainIndex
        );
        this._view.dispatch({
            changes: changes,
            selection: mappedSelection,
            annotations: this._originAnnotation.of(origin)
        });
    };

    CodeMirror6Adapter.prototype.replaceSelection = function (text, select, origin) {
        this.replaceSelections([text], select, origin || "+input");
    };

    CodeMirror6Adapter.prototype.replaceSelections = function (text, select, origin) {
        const texts = Array.isArray(text) ? text : this._view.state.selection.ranges.map(function () {
            return text;
        });
        const ranges = this._view.state.selection.ranges;
        const changes = ranges.map(function (range, index) {
            return {
                from: range.from,
                to: range.to,
                insert: String(texts[index % texts.length])
            };
        });
        const preliminary = this._view.state.update({
            changes: changes
        });
        const selections = ranges.map(function (range, index) {
            const insertedText = String(texts[index % texts.length]);
            const start = preliminary.changes.mapPos(range.from, -1);
            const end = start + insertedText.length;
            if (select === "around") {
                return range.anchor > range.head ?
                    CM6.EditorSelection.range(end, start) :
                    CM6.EditorSelection.range(start, end);
            }
            if (select === "start") {
                return CM6.EditorSelection.cursor(start);
            }
            return CM6.EditorSelection.cursor(end);
        });
        this._view.dispatch({
            changes: changes,
            selection: CM6.EditorSelection.create(
                selections,
                this._view.state.selection.mainIndex
            ),
            annotations: this._originAnnotation.of(origin)
        });
    };

    CodeMirror6Adapter.prototype.getRange = function (from, to, separator) {
        if (!this._view) {
            return separator === false ? [""] : "";
        }
        const value = this._view.state.doc.sliceString(
            this.indexFromPos(from),
            this.indexFromPos(to)
        );
        if (separator === false) {
            return _splitLines(value);
        }
        const lineSeparator = separator === undefined ?
            this.lineSeparator() :
            separator;
        return lineSeparator === "\n" ? value : value.replace(/\n/g, lineSeparator);
    };

    CodeMirror6Adapter.prototype.getLine = function (lineNumber) {
        if (!this._view) {
            return undefined;
        }
        if (lineNumber < this.firstLine() || lineNumber > this.lastLine()) {
            return undefined;
        }
        return this._view.state.doc.line(
            lineNumber - this._firstLine + 1
        ).text;
    };

    CodeMirror6Adapter.prototype.lineCount = function () {
        return this._view ? this._view.state.doc.lines : 0;
    };

    CodeMirror6Adapter.prototype.firstLine = function () {
        return this._firstLine;
    };

    CodeMirror6Adapter.prototype.lastLine = function () {
        return this._firstLine + this.lineCount() - 1;
    };

    CodeMirror6Adapter.prototype.lineSeparator = function () {
        return this.getOption("lineSeparator") || "\n";
    };

    CodeMirror6Adapter.prototype.splitLines = function (text) {
        const separator = this.getOption("lineSeparator");
        return separator ?
            String(text).split(separator) :
            CodeMirror.splitLines(String(text));
    };

    CodeMirror6Adapter.prototype.indexFromPos = function (position) {
        if (!position || !this._view) {
            return 0;
        }
        const requestedLine = Number(position.line);
        if (requestedLine < this._firstLine) {
            return 0;
        }
        if (requestedLine > this.lastLine()) {
            return this._view.state.doc.length;
        }

        const lineNumber = Number.isFinite(requestedLine) ?
            Math.floor(requestedLine) - this._firstLine :
            0;
        const line = this._view.state.doc.line(lineNumber + 1);
        if (position.ch === null || position.ch === undefined) {
            return line.to;
        }

        const requestedCharacter = Number(position.ch);
        if (requestedCharacter === Infinity || requestedCharacter > line.length) {
            return line.to;
        }
        if (!Number.isFinite(requestedCharacter) || requestedCharacter < 0) {
            return line.from;
        }
        return line.from + Math.floor(requestedCharacter);
    };

    CodeMirror6Adapter.prototype.posFromIndex = function (index) {
        if (!this._view) {
            return {
                line: this._firstLine,
                ch: 0
            };
        }
        return _positionFromOffset(
            this._view.state.doc,
            index,
            this._firstLine
        );
    };

    CodeMirror6Adapter.prototype.clipPos = function (position) {
        return this.posFromIndex(this.indexFromPos(position));
    };

    CodeMirror6Adapter.prototype.getCursor = function (which) {
        if (!this._view) {
            return {
                line: this._firstLine,
                ch: 0
            };
        }
        const range = this._view.state.selection.main;
        let offset = range.head;
        if (which === "anchor") {
            offset = range.anchor;
        } else if (which === "from" || which === "start") {
            offset = range.from;
        } else if (which === "to" || which === "end") {
            offset = range.to;
        }
        return this.posFromIndex(offset);
    };

    CodeMirror6Adapter.prototype.setCursor = function (line, ch, options) {
        if (typeof line === "object" && typeof ch === "object" && options === undefined) {
            options = ch;
            ch = null;
        }
        const position = typeof line === "object" ? line : {
            line: line,
            ch: ch || 0
        };
        this.setSelection(position, position, options);
    };

    CodeMirror6Adapter.prototype.listSelections = function () {
        return this._view.state.selection.ranges.map(function (range) {
            const selection = _selectionFromOffsets(
                range,
                this._view.state.doc,
                this._firstLine
            );
            Object.defineProperties(selection, {
                from: {
                    value: function () {
                        return CodeMirror.cmpPos(this.anchor, this.head) <= 0 ?
                            this.anchor :
                            this.head;
                    }
                },
                to: {
                    value: function () {
                        return CodeMirror.cmpPos(this.anchor, this.head) <= 0 ?
                            this.head :
                            this.anchor;
                    }
                },
                empty: {
                    value: function () {
                        return CodeMirror.cmpPos(this.anchor, this.head) === 0;
                    }
                }
            });
            return selection;
        }, this);
    };

    CodeMirror6Adapter.prototype.getSelections = function (separator) {
        return this._view.state.selection.ranges.map(range => {
            const value = this._view.state.doc.sliceString(range.from, range.to);
            if (separator === false) {
                return _splitLines(value);
            }
            const lineSeparator = separator === undefined ?
                this.lineSeparator() :
                separator;
            return lineSeparator === "\n" ?
                value :
                value.replace(/\n/g, lineSeparator);
        });
    };

    CodeMirror6Adapter.prototype.setSelections = function (ranges, primary, options) {
        const selectionRanges = ranges.map(range => {
            const anchor = range.anchor || range.start;
            const head = range.head || range.end || anchor;
            return CM6.EditorSelection.range(
                this.indexFromPos(anchor),
                this.indexFromPos(head),
                range.goalColumn
            );
        });
        const mainIndex = primary === undefined ? selectionRanges.length - 1 : primary;
        this._view.dispatch({
            selection: CM6.EditorSelection.create(selectionRanges, mainIndex),
            annotations: [
                this._originAnnotation.of(options && options.origin),
                this._selectionBiasAnnotation.of(options && options.bias)
            ]
        });
        if (!options || options.scroll !== false) {
            this.scrollIntoView(this.getCursor());
        }
    };

    CodeMirror6Adapter.prototype.setSelection = function (anchor, head, options) {
        if (head && head.line === undefined && head.ch === undefined && options === undefined) {
            options = head;
            head = null;
        }
        this.setSelections([{
            anchor: anchor,
            head: head || anchor
        }], 0, options);
    };

    CodeMirror6Adapter.prototype.addSelection = function (anchor, head, options) {
        const ranges = this.listSelections();
        ranges.push({
            anchor: this.clipPos(anchor),
            head: this.clipPos(head || anchor)
        });
        this.setSelections(ranges, ranges.length - 1, options);
    };

    CodeMirror6Adapter.prototype.extendSelection = function (head, other, options) {
        const currentRange = this.listSelections()[
            this._view.state.selection.mainIndex
        ];
        let nextHead = head;
        let anchor;
        const extend = Boolean(this.state.shift || this.extend);

        if (extend) {
            anchor = currentRange.anchor;
            if (other) {
                const headBeforeAnchor = CodeMirror.cmpPos(nextHead, anchor) < 0;
                const otherBeforeAnchor = CodeMirror.cmpPos(other, anchor) < 0;
                if (headBeforeAnchor !== otherBeforeAnchor) {
                    anchor = nextHead;
                    nextHead = other;
                } else if (headBeforeAnchor !== (CodeMirror.cmpPos(nextHead, other) < 0)) {
                    nextHead = other;
                }
            }
        } else {
            anchor = other || nextHead;
        }

        this.setSelection(anchor, nextHead, options);
    };

    CodeMirror6Adapter.prototype.extendSelections = function (heads, options) {
        const currentSelection = this._view.state.selection;
        const extend = Boolean(this.state.shift || this.extend);
        const ranges = this.listSelections().map(function (range, index) {
            const head = heads[index];
            return {
                anchor: extend ? range.anchor : head,
                head: head
            };
        });
        this.setSelections(ranges, currentSelection.mainIndex, options);
    };

    CodeMirror6Adapter.prototype.extendSelectionsBy = function (mapper, options) {
        const currentSelection = this._view.state.selection;
        const currentRanges = this.listSelections();
        const extend = Boolean(this.state.shift || this.extend);
        const nextRanges = currentRanges.map(function (range) {
            const head = mapper(range);
            return {
                anchor: extend ? range.anchor : head,
                head: head
            };
        });

        this.setSelections(nextRanges, currentSelection.mainIndex, options);
    };

    CodeMirror6Adapter.prototype.getSelection = function (separator) {
        const range = this._view.state.selection.main;
        const value = this._view.state.doc.sliceString(range.from, range.to);
        if (separator === false) {
            return _splitLines(value);
        }
        const lineSeparator = separator === undefined ?
            this.lineSeparator() :
            separator;
        return lineSeparator === "\n" ?
            value :
            value.replace(/\n/g, lineSeparator);
    };

    CodeMirror6Adapter.prototype.somethingSelected = function () {
        return this._view.state.selection.ranges.some(function (range) {
            return !range.empty;
        });
    };

    CodeMirror6Adapter.prototype.getLastEditEnd = function () {
        return this.posFromIndex(this.$lastChangeEndOffset);
    };

    CodeMirror6Adapter.prototype.releaseLineHandles = function () {
        // CM5 used this internal hook to release temporary line handles after
        // :global commands. Phoenix line handles are lightweight live
        // metadata and may also be retained by extensions, so no release is
        // required.
    };

    CodeMirror6Adapter.prototype.overWriteSelection = function (text) {
        const doc = this._view.state.doc;
        const selection = this._view.state.selection;
        const ranges = selection.ranges.map(function (range) {
            if (!range.empty || range.to >= doc.length ||
                    doc.sliceString(range.to, range.to + 1) === "\n") {
                return range;
            }
            return CM6.EditorSelection.range(range.from, range.to + 1);
        });
        this._view.dispatch({
            selection: CM6.EditorSelection.create(
                ranges,
                selection.mainIndex
            )
        });
        this.replaceSelection(text, "end", "+input");
    };

    CodeMirror6Adapter.prototype.isInMultiSelectMode = function () {
        return this._view.state.selection.ranges.length > 1;
    };

    CodeMirror6Adapter.prototype.virtualSelectionMode = function () {
        return Boolean(this.virtualSelection);
    };

    CodeMirror6Adapter.prototype.forEachSelection = function (command) {
        const originalSelection = this._view.state.selection;
        this.virtualSelection = CM6.EditorSelection.create(
            originalSelection.ranges.slice(),
            originalSelection.mainIndex
        );
        try {
            for (let index = 0;
                    index < this.virtualSelection.ranges.length;
                    index++) {
                const range = this.virtualSelection.ranges[index];
                if (!range) {
                    continue;
                }
                this._view.dispatch({
                    selection: CM6.EditorSelection.create([range])
                });
                command();
                const updatedRanges = this.virtualSelection.ranges.slice();
                updatedRanges[index] = this._view.state.selection.main;
                this.virtualSelection = CM6.EditorSelection.create(
                    updatedRanges,
                    Math.min(
                        originalSelection.mainIndex,
                        updatedRanges.length - 1
                    )
                );
            }
        } finally {
            const finalSelection = this.virtualSelection;
            this.virtualSelection = null;
            if (finalSelection) {
                this._view.dispatch({
                    selection: finalSelection
                });
            }
        }
    };

    CodeMirror6Adapter.prototype.hardWrap = function (options) {
        const configuration = options || {};
        const maximum = Number(configuration.column) ||
            Number(this.getOption("textwidth")) ||
            80;
        const allowMerge = configuration.allowMerge !== false;
        let row = Math.min(configuration.from, configuration.to);
        let endRow = Math.max(configuration.from, configuration.to);

        function findSpace(line, max, minimum) {
            if (line.length < max) {
                return;
            }
            const before = line.slice(0, max);
            const after = line.slice(max);
            const spaceAfter = /^(?:(\s+)|(\S+)(\s+))/.exec(after);
            const spaceBefore = /(?:(\s+)|(\s+)(\S+))$/.exec(before);
            let start = 0;
            let end = 0;
            if (spaceBefore && !spaceBefore[2]) {
                start = max - spaceBefore[1].length;
                end = max;
            }
            if (spaceAfter && !spaceAfter[2]) {
                if (!start) {
                    start = max;
                }
                end = max + spaceAfter[1].length;
            }
            if (start) {
                return {
                    start: start,
                    end: end
                };
            }
            if (spaceBefore && spaceBefore[2] &&
                    spaceBefore.index > minimum) {
                return {
                    start: spaceBefore.index,
                    end: spaceBefore.index + spaceBefore[2].length
                };
            }
            if (spaceAfter && spaceAfter[2]) {
                start = max + spaceAfter[2].length;
                return {
                    start: start,
                    end: start + spaceAfter[3].length
                };
            }
        }

        while (row <= endRow) {
            const line = this.getLine(row) || "";
            if (line.length > maximum) {
                const space = findSpace(line, maximum, 5);
                if (space) {
                    const indentationMatch = /^\s*/.exec(line);
                    const indentation = indentationMatch ?
                        indentationMatch[0] :
                        "";
                    this.replaceRange(
                        "\n" + indentation,
                        CodeMirror.Pos(row, space.start),
                        CodeMirror.Pos(row, space.end)
                    );
                }
                endRow++;
            } else if (allowMerge && /\S/.test(line) && row !== endRow) {
                const nextLine = this.getLine(row + 1);
                if (nextLine && /\S/.test(nextLine)) {
                    const trimmedLine = line.replace(/\s+$/, "");
                    const trimmedNextLine = nextLine.replace(/^\s+/, "");
                    const mergedLine = trimmedLine + " " + trimmedNextLine;
                    const space = findSpace(mergedLine, maximum, 5);
                    if (space && space.start > trimmedLine.length ||
                            mergedLine.length < maximum) {
                        this.replaceRange(
                            " ",
                            CodeMirror.Pos(row, trimmedLine.length),
                            CodeMirror.Pos(
                                row + 1,
                                nextLine.length - trimmedNextLine.length
                            )
                        );
                        row--;
                        endRow--;
                    } else if (trimmedLine.length < line.length) {
                        this.replaceRange(
                            "",
                            CodeMirror.Pos(row, trimmedLine.length),
                            CodeMirror.Pos(row, line.length)
                        );
                    }
                }
            }
            row++;
        }
        return row;
    };

    CodeMirror6Adapter.prototype.setExtending = function (value) {
        this.extend = value;
    };

    CodeMirror6Adapter.prototype.getExtending = function () {
        return this.extend;
    };

    CodeMirror6Adapter.prototype.startOperation = function () {
        if (this._operationDepth === 0) {
            this._activeOperationId = this._nextOperationId++;
            this.curOp = {
                $d: 0,
                cursorActivity: false,
                isVimOp: false
            };
        }
        this._operationDepth++;
        this.curOp.$d = this._operationDepth;
    };

    CodeMirror6Adapter.prototype.endOperation = function () {
        if (this._operationDepth === 0) {
            return;
        }
        this._operationDepth--;
        if (this.curOp) {
            this.curOp.$d = this._operationDepth;
            this.curOp.cursorActivity =
                this.curOp.cursorActivity || this._pendingCursorActivity;
        }
        if (this._operationDepth === 0) {
            this._activeOperationId = null;
            if (this._legacyDecorationsDirty) {
                this._refreshLegacyDecorations();
            }
            this.onBeforeEndOperation();
        }
    };

    CodeMirror6Adapter.prototype.operation = function (operation) {
        this.startOperation();
        try {
            return operation();
        } finally {
            this.endOperation();
        }
    };

    CodeMirror6Adapter.prototype.onChange = function (update, legacyChanges) {
        if (!update || !update.changes) {
            return;
        }
        const curOp = this.curOp;
        let changeIndex = 0;
        update.changes.iterChanges(function (
            _fromA,
            _toA,
            fromB,
            toB,
            inserted
        ) {
            this.$lastChangeEndOffset = toB;
            if (curOp) {
                if (curOp.$changeStart === null ||
                        curOp.$changeStart === undefined ||
                        curOp.$changeStart > fromB) {
                    curOp.$changeStart = fromB;
                }
                const suppliedChange = legacyChanges && legacyChanges[changeIndex];
                const operationChange = suppliedChange ?
                    _copyLegacyChange(suppliedChange) :
                    {
                        text: inserted && typeof inserted.toJSON === "function" ?
                            inserted.toJSON() :
                            _splitLines(String(inserted || ""))
                    };
                if (!curOp.lastChange) {
                    curOp.change = operationChange;
                    curOp.lastChange = operationChange;
                } else {
                    curOp.lastChange.next = operationChange;
                    curOp.lastChange = operationChange;
                }
            }
            changeIndex++;
        }.bind(this));
        if (curOp && !curOp.changeHandlers) {
            const handlers = this._listeners.get("change");
            curOp.changeHandlers = handlers ? handlers.slice() : [];
        }
    };

    CodeMirror6Adapter.prototype.onSelectionChange = function () {
        this._pendingCursorActivity = true;
        if (this.curOp) {
            this.curOp.cursorActivity = true;
            if (!this.curOp.cursorActivityHandlers) {
                const handlers = this._listeners.get("cursorActivity");
                this.curOp.cursorActivityHandlers = handlers ?
                    handlers.slice() :
                    [];
            }
        }
    };

    CodeMirror6Adapter.prototype.onBeforeEndOperation = function () {
        if (!this._operationDepth) {
            const scrollIntoView = Boolean(
                this.curOp &&
                this.curOp.isVimOp &&
                this.curOp.cursorActivity
            );
            try {
                this._flushOperationEvents();
            } finally {
                this.curOp = null;
                if (scrollIntoView && this._view && !this._destroyed) {
                    this.scrollIntoView();
                }
            }
        }
    };

    CodeMirror6Adapter.prototype.undo = function () {
        let entry;
        const moved = [];
        while (this._historyDone.length > 1) {
            const candidate = this._historyDone.pop();
            moved.push(candidate);
            if (candidate.type === "change") {
                entry = candidate;
                break;
            }
        }
        if (!entry) {
            return;
        }
        moved.forEach(item => {
            this._historyUndone.push(item);
        });
        const previousGeneration = this._currentGeneration;
        const previousVisibility = new Map(this._markers.map(function (marker) {
            return [marker, marker._hidden];
        }));
        let applied = false;
        this._historyApplying = true;
        this._currentGeneration = entry.generationBefore;
        this._resetHistoryMergeState();
        try {
            this.operation(() => {
                const steps = entry.steps && entry.steps.length ?
                    entry.steps.slice().reverse() :
                    [{
                        undoChanges: [{
                            from: 0,
                            to: this._view.state.doc.length,
                            insert: entry.beforeText
                        }]
                    }];
                steps.forEach((step, index) => {
                    const selection = index === steps.length - 1 ?
                        entry.beforeSelection :
                        undefined;
                    this._view.dispatch(this._historyTransaction(
                        this._historyChangeSpecs(step.undoChanges),
                        selection,
                        "undo"
                    ));
                });
                if (entry.steps && entry.steps.length ||
                        this.getValue() === entry.beforeText) {
                    applied = true;
                    if (!entry.docId || entry.docId === this.doc.id) {
                        this._restoreMarkerSnapshot(
                            entry.markerBefore,
                            previousVisibility
                        );
                    }
                    this.scrollIntoView(this.getCursor());
                }
            });
        } finally {
            this._historyApplying = false;
        }
        if (!applied) {
            this._historyUndone.splice(
                this._historyUndone.length - moved.length,
                moved.length
            );
            moved.slice().reverse().forEach(item => {
                this._historyDone.push(item);
            });
            this._currentGeneration = previousGeneration;
            return;
        }
    };

    CodeMirror6Adapter.prototype.redo = function () {
        let entry;
        const moved = [];
        while (this._historyUndone.length) {
            const candidate = this._historyUndone.pop();
            moved.push(candidate);
            if (candidate.type === "change") {
                entry = candidate;
                break;
            }
        }
        if (!entry) {
            moved.slice().reverse().forEach(item => {
                this._historyUndone.push(item);
            });
            return;
        }
        const previousGeneration = this._currentGeneration;
        const previousVisibility = new Map(this._markers.map(function (marker) {
            return [marker, marker._hidden];
        }));
        let applied = false;
        this._historyApplying = true;
        this._currentGeneration = entry.generationAfter;
        this._resetHistoryMergeState();
        try {
            this.operation(() => {
                const steps = entry.steps && entry.steps.length ?
                    entry.steps :
                    [{
                        redoChanges: [{
                            from: 0,
                            to: this._view.state.doc.length,
                            insert: entry.afterText
                        }]
                    }];
                steps.forEach((step, index) => {
                    const selection = index === steps.length - 1 ?
                        entry.afterSelection :
                        undefined;
                    this._view.dispatch(this._historyTransaction(
                        this._historyChangeSpecs(step.redoChanges),
                        selection,
                        "redo"
                    ));
                });
                if (entry.steps && entry.steps.length ||
                        this.getValue() === entry.afterText) {
                    applied = true;
                    moved.slice(0, -1).forEach(item => {
                        this._historyDone.push(item);
                    });
                    this._historyDone.push(entry);
                    while (this._historyUndone.length &&
                            this._historyUndone[this._historyUndone.length - 1].type === "selection") {
                        const selectionEntry = this._historyUndone.pop();
                        this._historyDone.push(selectionEntry);
                        if (!_sameSelection(
                            this._view.state.selection,
                            selectionEntry.afterSelection
                        )) {
                            this._view.dispatch({
                                selection: selectionEntry.afterSelection,
                                annotations: this._addToHistoryAnnotation.of(false)
                            });
                        }
                    }
                    if (!entry.docId || entry.docId === this.doc.id) {
                        this._restoreMarkerSnapshot(
                            entry.markerAfter,
                            previousVisibility
                        );
                    }
                    this.scrollIntoView(this.getCursor());
                }
            });
        } finally {
            this._historyApplying = false;
        }
        if (!applied) {
            moved.slice().reverse().forEach(item => {
                this._historyUndone.push(item);
            });
            this._currentGeneration = previousGeneration;
            return;
        }
    };

    CodeMirror6Adapter.prototype.undoSelection = function () {
        const currentSelection = this._view.state.selection;
        const hasUndoEvent = this._historyDone.some(function (entry) {
            const selection = _historySelection(entry);
            return entry.type === "change" ||
                selection && !_sameSelection(selection, currentSelection);
        });
        if (!hasUndoEvent) {
            return;
        }

        while (this._historyDone.length) {
            const entry = this._historyDone[this._historyDone.length - 1];
            if (entry.type === "change") {
                this.undo();
                return;
            }

            const selection = _historySelection(entry);
            if (!_sameSelection(selection, currentSelection)) {
                _pushSelectionHistoryEntry(this._historyUndone, entry);
                this._historyApplying = true;
                this._resetHistoryMergeState();
                try {
                    this._view.dispatch({
                        selection: selection,
                        annotations: this._addToHistoryAnnotation.of(false)
                    });
                } finally {
                    this._historyApplying = false;
                }
                return;
            }

            if (this._historyDone.length === 1) {
                return;
            }
            this._historyDone.pop();
            _pushSelectionHistoryEntry(this._historyUndone, entry);
        }
    };

    CodeMirror6Adapter.prototype.redoSelection = function () {
        const currentSelection = this._view.state.selection;
        const hasRedoEvent = this._historyUndone.some(function (entry) {
            const selection = _historySelection(entry);
            return entry.type === "change" ||
                selection && !_sameSelection(selection, currentSelection);
        });
        if (!hasRedoEvent) {
            return;
        }

        while (this._historyUndone.length) {
            const entry = this._historyUndone[this._historyUndone.length - 1];
            if (entry.type === "change") {
                this.redo();
                return;
            }

            const selection = _historySelection(entry);
            if (!_sameSelection(selection, currentSelection)) {
                _pushSelectionHistoryEntry(this._historyDone, entry);
                this._historyApplying = true;
                this._resetHistoryMergeState();
                try {
                    this._view.dispatch({
                        selection: selection,
                        annotations: this._addToHistoryAnnotation.of(false)
                    });
                } finally {
                    this._historyApplying = false;
                }
                return;
            }

            this._historyUndone.pop();
            _pushSelectionHistoryEntry(this._historyDone, entry);
        }
    };

    CodeMirror6Adapter.prototype.getHistory = function () {
        return {
            done: _copyHistoryArray(this._historyDone, false),
            undone: _copyHistoryArray(this._historyUndone, false)
        };
    };

    CodeMirror6Adapter.prototype.setHistory = function (history) {
        this._historyDone = _copyHistoryArray(
            history && history.done,
            true
        )
            .map(_prepareHistoryEntry);
        this._historyUndone = _copyHistoryArray(
            history && history.undone,
            true
        )
            .map(_prepareHistoryEntry);
        const allChanges = this._historyDone.concat(this._historyUndone).filter(function (entry) {
            return entry.type === "change";
        });
        const lastChange = this._historyDone.slice().reverse().find(function (entry) {
            return entry.type === "change";
        });
        if (lastChange) {
            this._currentGeneration = lastChange.generationAfter;
        }
        const maxGeneration = allChanges.reduce(function (maximum, entry) {
            return Math.max(
                maximum,
                entry.generationBefore || 0,
                entry.generationAfter || 0
            );
        }, this._currentGeneration);
        this._nextGeneration = Math.max(this._nextGeneration, maxGeneration + 1);
        this._resetHistoryMergeState();
    };

    CodeMirror6Adapter.prototype.clearHistory = function () {
        const selection = this._view ? this._view.state.selection : CM6.EditorSelection.single(0);
        this._historyDone = [{
            type: "selection",
            beforeSelection: selection,
            afterSelection: selection,
            generationBefore: this._currentGeneration,
            generationAfter: this._currentGeneration
        }];
        this._historyUndone = [];
        this._resetHistoryMergeState();
    };

    CodeMirror6Adapter.prototype.historySize = function () {
        return {
            undo: this._historyDone.filter(function (entry) {
                return entry.type === "change";
            }).length,
            redo: this._historyUndone.filter(function (entry) {
                return entry.type === "change";
            }).length
        };
    };

    CodeMirror6Adapter.prototype.markClean = function () {
        this._cleanGeneration = this.changeGeneration(true);
        return this._cleanGeneration;
    };

    CodeMirror6Adapter.prototype.isClean = function (generation) {
        return this._currentGeneration === (
            generation === undefined ? this._cleanGeneration : generation
        );
    };

    CodeMirror6Adapter.prototype.changeGeneration = function (closeEvent) {
        if (closeEvent) {
            this._resetHistoryMergeState();
        }
        return this._currentGeneration;
    };

    CodeMirror6Adapter.prototype.getOption = function (name) {
        return (this.options || this._options)[name];
    };

    CodeMirror6Adapter.prototype.phrase = function (phraseText) {
        const phrases = this.getOption("phrases");
        return phrases && Object.prototype.hasOwnProperty.call(phrases, phraseText) ?
            phrases[phraseText] :
            phraseText;
    };

    CodeMirror6Adapter.prototype.setDirection = function (direction) {
        this.setOption("direction", direction === "rtl" ? "rtl" : "ltr");
    };

    CodeMirror6Adapter.prototype.setOption = function (name, value) {
        const oldValue = this.getOption(name);
        // Match CM5's option contract, including its intentional loose
        // comparison and the special case that always reapplies "mode".
        if (name !== "mode" && oldValue == value) { // eslint-disable-line eqeqeq
            return;
        }
        if (name === "inputStyle") {
            throw new Error(
                "inputStyle can not be changed in a running editor"
            );
        }
        this._options[name] = value;
        if (this.options && this.options !== this._options) {
            this.options[name] = value;
        }
        if (CodeMirror.runOptionHandler) {
            CodeMirror.runOptionHandler(this, name, value, oldValue);
        }
        this._syncDocumentMetadata();

        let compartment;
        let extension;
        let updateDispatched = false;
        const emitUpdate = LEGACY_UPDATE_OPTIONS.has(name);
        switch (name) {
        case "readOnly":
            this._reconfigureMany([{
                compartment: this._readOnlyCompartment,
                extension: CM6.EditorState.readOnly.of(Boolean(value))
            }, {
                compartment: this._editableCompartment,
                extension: CM6.EditorView.editable.of(value !== "nocursor")
            }], emitUpdate);
            updateDispatched = true;
            if (value === "nocursor") {
                this._contentElement.blur();
                this._setFocusState(false);
            }
            break;
        case "spellcheck":
        case "autocorrect":
        case "autocapitalize":
            compartment = this._contentAttributesCompartment;
            extension = this._contentAttributesExtension();
            break;
        case "placeholder":
            compartment = this._placeholderCompartment;
            extension = this._placeholderExtension();
            break;
        case "lineNumbers":
            this._refreshGutters();
            break;
        case "lineWrapping":
            compartment = this._lineWrappingCompartment;
            extension = value ? CM6.EditorView.lineWrapping : [];
            this._invalidateRenderedLines();
            break;
        case "styleActiveLine":
            compartment = this._activeLineCompartment;
            extension = _activeLineExtension(value);
            break;
        case "autoCloseBrackets":
            compartment = this._closeBracketsCompartment;
            extension = _closeBracketsExtension(this, value);
            break;
        case "matchBrackets":
            this.state.matchBrackets = value ?
                typeof value === "object" ? value : {} :
                null;
            compartment = this._bracketMatchingCompartment;
            extension = _bracketMatchingExtension(this, value);
            break;
        case "highlightSelectionMatches":
            compartment = this._selectionMatchesCompartment;
            extension = _selectionMatchExtension(this, value);
            break;
        case "cursorBlinkRate":
        case "showCursorWhenSelecting":
            compartment = this._drawSelectionCompartment;
            extension = _drawSelectionExtension(this._options);
            break;
        case "tabSize":
            this._invalidateLegacyModeStateCache(true);
            this._reconfigureMany([{
                compartment: this._tabSizeCompartment,
                extension: CM6.EditorState.tabSize.of(value || 4)
            }, {
                compartment: this._indentUnitCompartment,
                extension: CM6.indentUnit.of(_indentUnitText(this._options))
            }], emitUpdate);
            this._invalidateRenderedLines();
            updateDispatched = true;
            break;
        case "indentUnit":
            this._invalidateLegacyModeStateCache(true);
            compartment = this._indentUnitCompartment;
            extension = CM6.indentUnit.of(_indentUnitText(this._options));
            break;
        case "indentWithTabs":
            compartment = this._indentUnitCompartment;
            extension = CM6.indentUnit.of(_indentUnitText(this._options));
            break;
        case "mode":
            this._invalidateLegacyModeStateCache(true);
            compartment = this._languageCompartment;
            extension = _languageExtensionForMode(value, this._options);
            this._refreshLegacyHighlighting();
            break;
        case "autoCloseTags":
            compartment = this._languageCompartment;
            extension = _languageExtensionForMode(this.getOption("mode"), this._options);
            break;
        case "scrollPastEnd":
            compartment = this._scrollPastEndCompartment;
            extension = value ? CM6.scrollPastEnd() : [];
            break;
        case "scrollbarStyle":
            this._applyScrollbarStyle(value);
            break;
        case "smartIndent":
            compartment = this._smartIndentCompartment;
            extension = value ? CM6.indentOnInput() : [];
            break;
        case "dragDrop":
            compartment = this._dragDropCompartment;
            extension = this._dragDropExtension(value);
            break;
        case "gutters":
            this._refreshGutters();
            this._refreshScrollbarModel();
            break;
        case "lineWiseCopyCut":
        case "disableInput":
        case "autofocus":
        case "undoDepth":
            break;
        case "addModeClass":
            this._refreshLegacyHighlighting();
            break;
        case "rulers":
            this._scheduleRulerRefresh();
            break;
        case "firstLineNumber":
        case "lineNumberFormatter":
            this._refreshGutters();
            this._refreshScrollbarModel();
            break;
        case "tabindex":
        case "screenReaderLabel":
        case "direction":
            this._decorateDOM();
            break;
        case "theme":
            this._applyThemeClass(value);
            break;
        default:
            break;
        }
        if (compartment) {
            this._reconfigure(compartment, extension, emitUpdate);
            updateDispatched = true;
        }
        if (emitUpdate && !updateDispatched) {
            this._dispatchLegacyUpdate();
        }
        this._decorateDOM();
        this._emit("optionChange", this._instance(), name);
    };

    CodeMirror6Adapter.prototype._dispatchLegacyUpdate = function () {
        if (!this._view || this._destroyed) {
            return;
        }
        this._view.dispatch({
            annotations: this._legacyUpdateAnnotation.of(true)
        });
    };

    CodeMirror6Adapter.prototype._reconfigure = function (
        compartment,
        extension,
        emitUpdate
    ) {
        if (!this._view || this._destroyed) {
            return;
        }
        const transactionSpec = {
            effects: compartment.reconfigure(extension)
        };
        if (emitUpdate) {
            transactionSpec.annotations = this._legacyUpdateAnnotation.of(true);
        }
        this._view.dispatch(transactionSpec);
        this._decorateDOM();
    };

    CodeMirror6Adapter.prototype._reconfigureMany = function (
        configurations,
        emitUpdate
    ) {
        if (!this._view || this._destroyed) {
            return;
        }
        const transactionSpec = {
            effects: configurations.map(function (configuration) {
                return configuration.compartment.reconfigure(configuration.extension);
            })
        };
        if (emitUpdate) {
            transactionSpec.annotations = this._legacyUpdateAnnotation.of(true);
        }
        this._view.dispatch(transactionSpec);
        this._decorateDOM();
    };

    CodeMirror6Adapter.prototype._applyThemeClass = function (theme) {
        if (!this._view) {
            return;
        }
        Array.from(this._view.dom.classList).forEach(className => {
            if (className.indexOf("cm-s-") === 0) {
                this._view.dom.classList.remove(className);
            }
        });
        String(theme || "default").split(/\s+/).filter(Boolean).forEach(themeName => {
            this._view.dom.classList.add(`cm-s-${themeName}`);
        });
        this._invalidateRenderedLines();
        this._scheduleRulerRefresh();
    };

    CodeMirror6Adapter.prototype.getDoc = function () {
        return this.doc;
    };

    CodeMirror6Adapter.prototype.getEditor = function () {
        return this._detachedDoc ? null : this;
    };

    CodeMirror6Adapter.prototype._copyDocument = function (copyHistory) {
        const copy = new CodeMirror.Doc(
            this.getValue(),
            this.getOption("mode"),
            this.firstLine(),
            this.getOption("lineSeparator"),
            this.getOption("direction")
        );
        copy.setSelections(
            this.listSelections().map(function (selection) {
                return {
                    anchor: _copyPosition(selection.anchor),
                    head: _copyPosition(selection.head)
                };
            }),
            this._view.state.selection.mainIndex,
            {scroll: false}
        );
        copy.setExtending(false);
        copy._scrollLeft = this.doc && this.doc._scrollLeft || 0;
        copy._scrollTop = this.doc && this.doc._scrollTop || 0;
        if (copyHistory) {
            copy.setHistory(this.getHistory());
            copy._adapter._currentGeneration = this._currentGeneration;
            copy._adapter._nextGeneration = this._nextGeneration;
            copy._adapter._cleanGeneration = this._cleanGeneration;
        } else {
            copy.clearHistory();
        }
        return copy;
    };

    CodeMirror6Adapter.prototype.swapDoc = function (newDoc) {
        if (!(newDoc instanceof CodeMirror.Doc)) {
            throw new TypeError("swapDoc expects a CodeMirror.Doc.");
        }
        if (newDoc.getEditor()) {
            throw new Error("This document is already in use.");
        }
        if (!newDoc._adapter || !newDoc._adapter._detachedDoc) {
            throw new Error("The document has no detached CM6 state.");
        }

        const oldDoc = this.doc;
        const detachedAdapter = newDoc._adapter;
        const oldState = this._takeDocumentState();
        const newState = detachedAdapter._takeDocumentState();

        this.doc = newDoc;
        newDoc._adapter = this;
        newDoc.cm = this;
        this._detachedDoc = false;

        detachedAdapter.doc = oldDoc;
        oldDoc._adapter = detachedAdapter;
        oldDoc.cm = null;
        detachedAdapter._detachedDoc = true;

        this._restoreDocumentState(newState);
        detachedAdapter._restoreDocumentState(oldState);
        this._syncDocumentMetadata();
        detachedAdapter._syncDocumentMetadata();
        if (CodeMirror.registerInstance) {
            CodeMirror.registerInstance(this, newDoc);
        }
        this._emit("swapDoc", this, oldDoc);
        return oldDoc;
    };

    CodeMirror6Adapter.prototype.getMode = function () {
        if (!this._legacyMode) {
            this._legacyMode = CodeMirror.getMode(
                this._options,
                this.getOption("mode")
            );
        }
        return this._legacyMode;
    };

    CodeMirror6Adapter.prototype.getTokenAt = function (position, precise) {
        if (!this._view) {
            const mode = this.getMode();
            return {
                start: 0,
                end: 0,
                string: "",
                type: null,
                state: CodeMirror.startState(mode)
            };
        }
        const clippedPosition = this.posFromIndex(this.indexFromPos(position));
        const mode = this.getMode();
        const state = _modeStateBefore(this, mode, clippedPosition.line, precise);
        const line = this.getLine(clippedPosition.line) || "";
        const stream = new CodeMirror.StringStream(
            line,
            this.getOption("tabSize") || 4,
            _legacyLineOracle(this, clippedPosition.line)
        );
        let type;

        while (stream.pos < clippedPosition.ch && !stream.eol()) {
            stream.start = stream.pos;
            type = _readModeToken(mode, stream, state);
        }
        return {
            start: stream.start,
            end: stream.pos,
            string: stream.current(),
            type: type || null,
            state: state
        };
    };

    CodeMirror6Adapter.prototype.getTokenTypeAt = function (position) {
        const clippedPosition = this.posFromIndex(this.indexFromPos(position));
        const line = this.getLine(clippedPosition.line) || "";
        const tokenPosition = clippedPosition.ch === 0 && line.length ?
            {
                line: clippedPosition.line,
                ch: 1
            } :
            clippedPosition;
        const type = this.state.overlays.length ?
            _styleAtPosition(
                _lineStylesWithOverlays(this, clippedPosition.line),
                clippedPosition.ch
            ) :
            this.getTokenAt(tokenPosition).type;
        const overlayIndex = type ? type.indexOf("overlay ") : -1;
        if (overlayIndex < 0) {
            return type;
        }
        return overlayIndex === 0 ? null : type.slice(0, overlayIndex - 1);
    };

    CodeMirror6Adapter.prototype.getLineTokens = function (lineNumber, precise) {
        if (!this._view) {
            return [];
        }
        const clippedLineNumber = _clamp(
            Number(lineNumber) || 0,
            0,
            this.lastLine()
        );
        const mode = this.getMode();
        const state = _modeStateBefore(this, mode, clippedLineNumber, precise);
        const text = this.getLine(clippedLineNumber) || "";
        const stream = new CodeMirror.StringStream(
            text,
            this.getOption("tabSize") || 4,
            _legacyLineOracle(this, clippedLineNumber)
        );
        const tokens = [];

        while (!stream.eol()) {
            stream.start = stream.pos;
            const type = _readModeToken(mode, stream, state);
            tokens.push({
                start: stream.start,
                end: stream.pos,
                string: stream.current(),
                type: type || null,
                state: CodeMirror.copyState(mode, state)
            });
        }
        return tokens;
    };

    CodeMirror6Adapter.prototype.getModeAt = function (position) {
        const token = this.getTokenAt(position, true);
        return CodeMirror.innerMode(this.getMode(), token.state).mode;
    };

    CodeMirror6Adapter.prototype.getLineHandle = function (lineNumber) {
        if (lineNumber < this.firstLine() || lineNumber > this.lastLine()) {
            return null;
        }
        const line = this._view.state.doc.line(
            lineNumber - this._firstLine + 1
        );
        let handle = Array.from(this._lineHandles).find(candidate => {
            return !candidate._deleted && candidate._position === line.from;
        });
        if (!handle) {
            handle = {
                _adapter: this,
                _position: line.from,
                _deleted: false,
                parent: this.doc,
                widgets: [],
                lineNo: function () {
                    return handle._adapter.getLineNumber(handle);
                }
            };
            Object.defineProperty(handle, "text", {
                configurable: true,
                enumerable: true,
                get: function () {
                    const currentLine = handle._adapter.getLineNumber(handle);
                    return currentLine === null ? null : handle._adapter.getLine(currentLine);
                }
            });
            Object.defineProperty(handle, "height", {
                configurable: true,
                enumerable: true,
                get: function () {
                    const currentLine = handle._adapter.getLineNumber(handle);
                    if (currentLine === null) {
                        return 0;
                    }
                    const top = handle._adapter.heightAtLine(currentLine, "local");
                    const bottom = handle._adapter.heightAtLine(currentLine + 1, "local");
                    return Math.max(handle._adapter.defaultTextHeight(), bottom - top);
                }
            });
            this._lineHandles.add(handle);
        }
        return handle;
    };

    CodeMirror6Adapter.prototype.getLineHandleVisualStart = function (line) {
        let lineHandle = typeof line === "number" ? this.getLineHandle(line) : line;
        let lineNumber = this.getLineNumber(lineHandle);
        if (lineNumber === null || lineNumber === undefined) {
            return lineHandle;
        }

        for (;;) {
            const lineStart = this._view.state.doc.line(
                lineNumber - this._firstLine + 1
            ).from;
            let precedingMarker = null;
            this._markers.forEach(function (marker) {
                if (marker._cleared || marker._hidden || !marker.collapsed ||
                        marker.type !== "range" || marker._from >= lineStart ||
                        marker._to < lineStart) {
                    return;
                }
                if (!precedingMarker || marker._from < precedingMarker._from) {
                    precedingMarker = marker;
                }
            });
            if (!precedingMarker) {
                return lineHandle;
            }

            const precedingLine = this._view.state.doc.lineAt(
                precedingMarker._from
            ).number - 1 + this._firstLine;
            if (precedingLine >= lineNumber) {
                return lineHandle;
            }
            lineNumber = precedingLine;
            lineHandle = this.getLineHandle(lineNumber);
        }
    };

    CodeMirror6Adapter.prototype.getLineNumber = function (lineHandle) {
        if (!lineHandle || lineHandle._adapter !== this || lineHandle._deleted || !this._view) {
            return null;
        }
        return this._view.state.doc.lineAt(
            _clamp(lineHandle._position, 0, this._view.state.doc.length)
        ).number - 1 + this._firstLine;
    };

    CodeMirror6Adapter.prototype.eachLine = function (from, to, callback) {
        if (typeof from === "function") {
            callback = from;
            from = this.firstLine();
            to = this.lastLine() + 1;
        } else if (typeof to === "function") {
            callback = to;
            to = this.lastLine() + 1;
        }
        from = Math.max(
            this.firstLine(),
            from === undefined ? this.firstLine() : from
        );
        to = Math.min(
            this.lastLine() + 1,
            to === undefined ? this.lastLine() + 1 : to
        );
        for (let line = from; line < to; line++) {
            if (callback(this.getLineHandle(line))) {
                break;
            }
        }
    };

    CodeMirror6Adapter.prototype.findWordAt = function (position) {
        const line = this.getLine(position.line) || "";
        let start = _clamp(position.ch, 0, line.length);
        let end = start;
        while (start > 0 && CodeMirror.isWordChar(line.charAt(start - 1))) {
            start--;
        }
        while (end < line.length && CodeMirror.isWordChar(line.charAt(end))) {
            end++;
        }
        return {
            anchor: {
                line: position.line,
                ch: start,
                sticky: null
            },
            head: {
                line: position.line,
                ch: end,
                sticky: null
            }
        };
    };

    CodeMirror6Adapter.prototype.execCommand = function (commandName) {
        const nativeCommands = {
            selectAll: CM6.selectAll,
            insertTab: CM6.insertTab,
            defaultTab: CM6.indentWithTab,
            newlineAndIndent: CM6.splitLine,
            splitSelectionByLine: function () {
                return this.splitSelectionByLine();
            }.bind(this),
            undo: function () {
                return this.undo();
            }.bind(this),
            redo: function () {
                return this.redo();
            }.bind(this)
        };
        const nativeCommand = nativeCommands[commandName];
        if (nativeCommand) {
            return nativeCommand(this._view);
        }
        const command = CodeMirror.commands[commandName];
        if (command) {
            return command(this._instance());
        }
    };

    CodeMirror6Adapter.prototype._moveHorizontalRange = function (range, direction, unit) {
        if (!direction) {
            return range.head;
        }

        const forward = direction > 0;
        const doc = this._view.state.doc;
        let target = range.head;
        let currentRange = range;

        for (let step = 0; step < Math.abs(direction); step++) {
            let nextTarget;
            if (unit === "word" || unit === "group") {
                nextTarget = this._view.moveByGroup(currentRange, forward).head;
            } else if (unit !== "codepoint" && unit !== "column") {
                nextTarget = this._view.moveByChar(currentRange, forward).head;
            } else {
                const line = doc.lineAt(target);
                if (forward) {
                    if (target < line.to) {
                        const first = doc.sliceString(target, target + 1).charCodeAt(0);
                        const length = first >= 0xD800 && first <= 0xDBFF &&
                            target + 1 < line.to ?
                            2 :
                            1;
                        nextTarget = target + length;
                    } else {
                        nextTarget = unit === "column" || line.number >= doc.lines ?
                            target :
                            line.to + 1;
                    }
                } else if (target > line.from) {
                    const last = doc.sliceString(target - 1, target).charCodeAt(0);
                    const length = last >= 0xDC00 && last <= 0xDFFF &&
                        target - 1 > line.from ?
                        2 :
                        1;
                    nextTarget = target - length;
                } else {
                    nextTarget = unit === "column" || line.number <= 1 ?
                        target :
                        line.from - 1;
                }
            }

            if (nextTarget === target) {
                break;
            }
            target = nextTarget;
            currentRange = CM6.EditorSelection.cursor(target);
        }

        return target;
    };

    CodeMirror6Adapter.prototype.findPosH = function (from, amount, unit) {
        const direction = amount < 0 ? -1 : 1;
        let target = this.indexFromPos(this.clipPos(from));
        let hitSide = false;

        for (let index = 0; index < Math.abs(amount); index++) {
            const nextTarget = this._moveHorizontalRange(
                CM6.EditorSelection.cursor(target),
                direction,
                unit
            );
            if (nextTarget === target) {
                hitSide = true;
                break;
            }
            target = nextTarget;
        }

        const position = this.posFromIndex(target);
        if (hitSide) {
            position.hitSide = true;
        }
        return position;
    };

    CodeMirror6Adapter.prototype.findPosV = function (from, amount, unit, goalColumn) {
        const forward = amount >= 0;
        const pageHeight = Math.min(
            this._view.dom.clientHeight || this._view.scrollDOM.clientHeight,
            window.innerHeight || this._view.dom.ownerDocument.documentElement.clientHeight
        );
        const distance = unit === "page" ?
            Math.max(pageHeight - 0.5 * this.defaultTextHeight(), 3) :
            undefined;
        let range = CM6.EditorSelection.cursor(
            this.indexFromPos(this.clipPos(from)),
            0,
            undefined,
            goalColumn
        );
        let hitSide = false;

        for (let index = 0; index < Math.abs(amount); index++) {
            const nextRange = this._view.moveVertically(range, forward, distance);
            if (nextRange.head === range.head) {
                hitSide = true;
                break;
            }
            range = nextRange;
        }

        const position = this.posFromIndex(range.head);
        if (range.goalColumn !== null && range.goalColumn !== undefined) {
            position.goalColumn = range.goalColumn;
        }
        if (hitSide) {
            position.hitSide = true;
        }
        return position;
    };

    CodeMirror6Adapter.prototype.moveH = function (direction, unit) {
        const currentSelection = this._view.state.selection;
        const extend = Boolean(this.state.shift || this.extend);
        const ranges = currentSelection.ranges.map(range => {
            let target;
            if (!extend && !range.empty) {
                target = direction < 0 ? range.from : range.to;
            } else {
                target = this._moveHorizontalRange(range, direction, unit);
            }
            return extend ?
                CM6.EditorSelection.range(range.anchor, target) :
                CM6.EditorSelection.cursor(target);
        });

        this._view.dispatch({
            selection: CM6.EditorSelection.create(ranges, currentSelection.mainIndex),
            annotations: this._originAnnotation.of("+move"),
            scrollIntoView: true
        });
    };

    CodeMirror6Adapter.prototype.deleteH = function (direction, unit) {
        const selection = this._view.state.selection;
        const hasSelection = selection.ranges.some(function (range) {
            return !range.empty;
        });
        const changes = [];

        selection.ranges.forEach(range => {
            if (hasSelection) {
                if (range.empty) {
                    return;
                }
                changes.push({
                    from: range.from,
                    to: range.to,
                    insert: ""
                });
                return;
            }
            const target = this._moveHorizontalRange(range, direction, unit);
            if (target !== range.head) {
                changes.push({
                    from: Math.min(range.head, target),
                    to: Math.max(range.head, target),
                    insert: ""
                });
            }
        });

        if (!changes.length) {
            return false;
        }
        this._view.dispatch({
            changes: changes,
            annotations: this._originAnnotation.of("+delete")
        });
        return true;
    };

    CodeMirror6Adapter.prototype.indentSelection = function (direction) {
        const ranges = this.listSelections();
        let end = -1;

        this.operation(() => {
            ranges.forEach((range, index) => {
                if (!range.empty()) {
                    const from = range.from();
                    const to = range.to();
                    const start = Math.max(end, from.line);
                    end = Math.min(
                        this.lastLine(),
                        to.line - (to.ch ? 0 : 1)
                    ) + 1;
                    for (let line = start; line < end; line++) {
                        this.indentLine(line, direction);
                    }

                    const newRanges = this.listSelections();
                    if (from.ch === 0 && ranges.length === newRanges.length &&
                            newRanges[index].from().ch > 0) {
                        const selectionRanges = newRanges.map(function (selection, selectionIndex) {
                            if (selectionIndex === index) {
                                return {
                                    anchor: from,
                                    head: selection.to()
                                };
                            }
                            return {
                                anchor: selection.anchor,
                                head: selection.head
                            };
                        });
                        this.setSelections(
                            selectionRanges,
                            this._view.state.selection.mainIndex,
                            {scroll: false}
                        );
                    }
                } else if (range.head.line > end) {
                    this.indentLine(range.head.line, direction, true);
                    end = range.head.line;
                }
            });
        });
    };

    CodeMirror6Adapter.prototype.splitSelectionByLine = function () {
        const lineRanges = [];

        this.listSelections().forEach(range => {
            const from = range.from();
            const to = range.to();
            for (let line = from.line; line <= to.line; line++) {
                if (to.line > from.line && line === to.line && to.ch === 0) {
                    continue;
                }
                lineRanges.push({
                    anchor: line === from.line ? from : {
                        line: line,
                        ch: 0
                    },
                    head: line === to.line ? to : {
                        line: line,
                        ch: (this.getLine(line) || "").length
                    }
                });
            }
        });

        if (lineRanges.length) {
            this.setSelections(lineRanges, 0);
        }
    };

    CodeMirror6Adapter.prototype.toggleOverwrite = function (state) {
        const nextState = state === undefined ? !this.state.overwrite : Boolean(state);
        if (nextState !== this.state.overwrite) {
            this.state.overwrite = nextState;
            this._decorateDOM();
            this._emit("overwriteToggle", this, nextState);
        }
        return nextState;
    };

    CodeMirror6Adapter.prototype.addKeyMap = function (keyMap, bottom) {
        if (bottom) {
            this.state.keyMaps.push(keyMap);
        } else {
            this.state.keyMaps.unshift(keyMap);
        }
    };

    CodeMirror6Adapter.prototype.removeKeyMap = function (keyMap) {
        for (let index = 0; index < this.state.keyMaps.length; index++) {
            const candidate = this.state.keyMaps[index];
            if (candidate === keyMap || candidate && candidate.name === keyMap) {
                this.state.keyMaps.splice(index, 1);
                return true;
            }
        }
        return false;
    };

    CodeMirror6Adapter.prototype.indentLine = function (lineNumber, direction, aggressive) {
        const line = this.getLine(lineNumber);
        if (line === undefined) {
            return;
        }

        let indentationDirection = direction;
        if (typeof indentationDirection !== "string" &&
                typeof indentationDirection !== "number") {
            if (indentationDirection === null || indentationDirection === undefined) {
                indentationDirection = this.getOption("smartIndent") ?
                    "smart" :
                    "prev";
            } else {
                indentationDirection = indentationDirection ? "add" : "subtract";
            }
        }

        const mode = this.getMode();
        let state;
        if (indentationDirection === "smart") {
            if (!mode.indent) {
                indentationDirection = "prev";
            } else {
                state = this.getStateBefore(lineNumber);
            }
        }

        const tabSize = this.getOption("tabSize") || 4;
        const currentIndentation = CodeMirror.countColumn(line, null, tabSize);
        const currentIndentationString = line.match(/^\s*/)[0];
        let indentation;

        if (!aggressive && !/\S/.test(line)) {
            indentation = 0;
            indentationDirection = "not";
        } else if (indentationDirection === "smart") {
            indentation = mode.indent(
                state,
                line.slice(currentIndentationString.length),
                line
            );
            if (indentation === CodeMirror.Pass || indentation > 150) {
                if (!aggressive) {
                    return;
                }
                indentationDirection = "prev";
            }
        }

        if (indentationDirection === "prev") {
            indentation = lineNumber > this.firstLine() ?
                CodeMirror.countColumn(this.getLine(lineNumber - 1), null, tabSize) :
                0;
        } else if (indentationDirection === "add") {
            indentation = currentIndentation + (this.getOption("indentUnit") || 4);
        } else if (indentationDirection === "subtract") {
            indentation = currentIndentation - (this.getOption("indentUnit") || 4);
        } else if (typeof indentationDirection === "number") {
            indentation = currentIndentation + indentationDirection;
        }
        indentation = Math.max(0, indentation);

        let indentationString = "";
        let indentationColumn = 0;
        if (this.getOption("indentWithTabs")) {
            const tabCount = Math.floor(indentation / tabSize);
            indentationString = "\t".repeat(tabCount);
            indentationColumn = tabCount * tabSize;
        }
        if (indentationColumn < indentation) {
            indentationString += " ".repeat(indentation - indentationColumn);
        }

        if (indentationString !== currentIndentationString) {
            this.replaceRange(
                indentationString,
                { line: lineNumber, ch: 0 },
                { line: lineNumber, ch: currentIndentationString.length },
                "+input"
            );
            return true;
        }

        const currentSelection = this.listSelections();
        const rangeIndex = currentSelection.findIndex(function (range) {
            return range.head.line === lineNumber &&
                range.head.ch < currentIndentationString.length;
        });
        if (rangeIndex !== -1) {
            const ranges = currentSelection.map(function (range, index) {
                if (index === rangeIndex) {
                    const position = {
                        line: lineNumber,
                        ch: currentIndentationString.length
                    };
                    return {
                        anchor: position,
                        head: position
                    };
                }
                return {
                    anchor: range.anchor,
                    head: range.head
                };
            });
            this.setSelections(
                ranges,
                this._view.state.selection.mainIndex,
                {scroll: false}
            );
        }
    };

    CodeMirror6Adapter.prototype.triggerElectric = function (inserted) {
        if (!this.getOption("electricChars") || !this.getOption("smartIndent")) {
            return;
        }

        this.operation(() => {
            const ranges = this.listSelections();
            for (let index = ranges.length - 1; index >= 0; index--) {
                const head = ranges[index].head;
                if (head.ch > 100 ||
                        index > 0 && ranges[index - 1].head.line === head.line) {
                    continue;
                }

                const mode = this.getModeAt(head);
                let shouldIndent = false;
                if (mode.electricChars) {
                    for (let charIndex = 0; charIndex < mode.electricChars.length; charIndex++) {
                        if (String(inserted).indexOf(mode.electricChars.charAt(charIndex)) !== -1) {
                            shouldIndent = true;
                            break;
                        }
                    }
                } else if (mode.electricInput) {
                    const line = this.getLine(head.line) || "";
                    shouldIndent = mode.electricInput.test(line.slice(0, head.ch));
                }

                if (shouldIndent && this.indentLine(head.line, "smart")) {
                    this._emit("electricInput", this._instance(), head.line);
                }
            }
        });
    };

    CodeMirror6Adapter.prototype.toggleComment = function () {
        return CM6.toggleComment(this._view);
    };

    CodeMirror6Adapter.prototype.moveV = function (amount, unit) {
        const currentSelection = this._view.state.selection;
        const currentRanges = this.listSelections();
        const extend = Boolean(this.state.shift || this.extend);
        const collapse = !extend && currentRanges.some(function (range) {
            return !range.empty();
        });
        const ranges = currentRanges.map(range => {
            let target;
            if (collapse) {
                target = amount < 0 ? range.from() : range.to();
            } else {
                target = this.findPosV(
                    range.head,
                    amount,
                    unit,
                    range.goalColumn
                );
            }
            return {
                anchor: extend ? range.anchor : target,
                head: target,
                goalColumn: target.goalColumn
            };
        });
        this.setSelections(ranges, currentSelection.mainIndex, {
            origin: "+move"
        });
    };

    CodeMirror6Adapter.prototype.getHelpers = function (position, type) {
        if (CodeMirror.getHelpers) {
            return CodeMirror.getHelpers(this, position, type);
        }
        const registry = CodeMirror.helpers && CodeMirror.helpers[type];
        if (!registry) {
            return [];
        }
        const mode = this.getModeAt(position);
        const result = [];
        [mode.helperType, mode.name].filter(Boolean).forEach(function (name) {
            if (registry[name] && result.indexOf(registry[name]) === -1) {
                result.push(registry[name]);
            }
        });
        (registry._global || []).forEach(function (helper) {
            if (helper.pred(mode, this) && result.indexOf(helper.val) === -1) {
                result.push(helper.val);
            }
        }, this);
        return result;
    };

    CodeMirror6Adapter.prototype.getHelper = function (position, type) {
        return this.getHelpers(position, type)[0];
    };

    CodeMirror6Adapter.prototype.getSearchCursor = function (query, start, options) {
        const adapter = this;
        const caseFold = typeof options === "boolean" ? options :
            Boolean(options && options.caseFold);
        const expression = query instanceof RegExp ? query : null;
        const allowMultiline = !options || typeof options !== "object" ||
            options.multiline !== false;
        const sourceQuery = expression ? null : _splitLines(String(query)).join("\n");
        const normalize = typeof String.prototype.normalize === "function";
        const foldText = caseFold ?
            function (text) {
                const normalized = normalize ? text.normalize("NFD") : text;
                return normalized.toLowerCase();
            } :
            function (text) {
                return normalize ? text.normalize("NFD") : text;
            };
        const queryLines = expression ? null : foldText(sourceQuery).split("\n");
        let cachedSourceDoc = null;
        let cachedSource = "";

        function documentSource() {
            const doc = adapter._view.state.doc;
            if (doc !== cachedSourceDoc) {
                cachedSourceDoc = doc;
                cachedSource = doc.toString();
            }
            return cachedSource;
        }

        function clipPosition(position) {
            const doc = adapter._view.state.doc;
            const requestedLine = Number(position && position.line);
            const lineNumber = Number.isFinite(requestedLine) ?
                Math.floor(requestedLine) :
                adapter.firstLine();
            if (lineNumber < adapter.firstLine()) {
                return {
                    line: adapter.firstLine(),
                    ch: 0
                };
            }
            if (lineNumber > adapter.lastLine()) {
                return adapter.posFromIndex(doc.length);
            }

            const line = doc.line(
                lineNumber - adapter._firstLine + 1
            );
            let character = position && position.ch;
            if (character === null || character === undefined) {
                character = line.length;
            } else {
                character = Number(character);
                if (!Number.isFinite(character)) {
                    character = 0;
                }
            }
            return {
                line: lineNumber,
                ch: _clamp(Math.floor(character), 0, line.length)
            };
        }

        function positionIndex(position) {
            return adapter.indexFromPos(position);
        }

        function adjustFoldedOffset(original, folded, offset) {
            if (original.length === folded.length) {
                return offset;
            }

            let minimum = 0;
            let maximum = offset + Math.max(0, original.length - folded.length);
            while (minimum < maximum) {
                const middle = Math.floor((minimum + maximum) / 2);
                const length = foldText(original.slice(0, middle)).length;
                if (length === offset) {
                    return middle;
                }
                if (length > offset) {
                    maximum = middle;
                } else {
                    minimum = middle + 1;
                }
            }
            return minimum;
        }

        function addRegexpFlags(regexp, requiredFlags) {
            let flags = regexp.flags || "";
            requiredFlags.split("").forEach(function (flag) {
                if (flags.indexOf(flag) === -1) {
                    flags += flag;
                }
            });
            return flags;
        }

        function lastRegexpMatch(text, regexp, endOffset) {
            let match = null;
            let from = 0;
            while (from <= text.length) {
                regexp.lastIndex = from;
                const candidate = regexp.exec(text);
                if (!candidate) {
                    break;
                }
                const candidateEnd = candidate.index + candidate[0].length;
                if (candidateEnd > endOffset) {
                    break;
                }
                if (!match ||
                        candidateEnd > match.index + match[0].length) {
                    match = candidate;
                }
                from = Math.max(from + 1, candidate.index + 1);
            }
            return match;
        }

        function findString(reverse, headPosition) {
            if (!sourceQuery.length) {
                return null;
            }

            if (reverse) {
                const firstCandidateLine =
                    adapter.firstLine() + queryLines.length - 1;
                let character = headPosition.ch;
                for (let lineNumber = headPosition.line;
                    lineNumber >= firstCandidateLine;
                    lineNumber--, character = null) {
                    let original = adapter.getLine(lineNumber) || "";
                    if (character !== null) {
                        original = original.slice(0, character);
                    }
                    const folded = foldText(original);
                    if (queryLines.length === 1) {
                        const found = folded.lastIndexOf(queryLines[0]);
                        if (found === -1) {
                            continue;
                        }
                        return {
                            from: positionIndex({
                                line: lineNumber,
                                ch: adjustFoldedOffset(
                                    original,
                                    folded,
                                    found
                                )
                            }),
                            to: positionIndex({
                                line: lineNumber,
                                ch: adjustFoldedOffset(
                                    original,
                                    folded,
                                    found + queryLines[0].length
                                )
                            })
                        };
                    }

                    const lastQueryLine = queryLines[queryLines.length - 1];
                    if (folded.slice(0, lastQueryLine.length) !==
                            lastQueryLine) {
                        continue;
                    }
                    const startLine = lineNumber - queryLines.length + 1;
                    let matches = true;
                    for (let index = 1;
                        index < queryLines.length - 1;
                        index++) {
                        if (foldText(adapter.getLine(startLine + index) || "") !==
                                queryLines[index]) {
                            matches = false;
                            break;
                        }
                    }
                    if (!matches) {
                        continue;
                    }
                    const firstOriginal = adapter.getLine(startLine) || "";
                    const firstFolded = foldText(firstOriginal);
                    const firstQueryLine = queryLines[0];
                    const firstMatch = firstFolded.length -
                        firstQueryLine.length;
                    if (firstMatch < 0 ||
                            firstFolded.slice(firstMatch) !== firstQueryLine) {
                        continue;
                    }
                    return {
                        from: positionIndex({
                            line: startLine,
                            ch: adjustFoldedOffset(
                                firstOriginal,
                                firstFolded,
                                firstMatch
                            )
                        }),
                        to: positionIndex({
                            line: lineNumber,
                            ch: adjustFoldedOffset(
                                original,
                                folded,
                                lastQueryLine.length
                            )
                        })
                    };
                }
                return null;
            }

            const lastCandidateLine =
                adapter.lastLine() + 1 - queryLines.length;
            let character = headPosition.ch;
            for (let lineNumber = headPosition.line;
                lineNumber <= lastCandidateLine;
                lineNumber++, character = 0) {
                const fullLine = adapter.getLine(lineNumber) || "";
                const original = fullLine.slice(character);
                const folded = foldText(original);
                if (queryLines.length === 1) {
                    const found = folded.indexOf(queryLines[0]);
                    if (found === -1) {
                        continue;
                    }
                    return {
                        from: positionIndex({
                            line: lineNumber,
                            ch: character + adjustFoldedOffset(
                                original,
                                folded,
                                found
                            )
                        }),
                        to: positionIndex({
                            line: lineNumber,
                            ch: character + adjustFoldedOffset(
                                original,
                                folded,
                                found + queryLines[0].length
                            )
                        })
                    };
                }

                const firstQueryLine = queryLines[0];
                const firstMatch = folded.length - firstQueryLine.length;
                if (firstMatch < 0 ||
                        folded.slice(firstMatch) !== firstQueryLine) {
                    continue;
                }
                let matches = true;
                for (let index = 1;
                    index < queryLines.length - 1;
                    index++) {
                    if (foldText(adapter.getLine(lineNumber + index) || "") !==
                            queryLines[index]) {
                        matches = false;
                        break;
                    }
                }
                if (!matches) {
                    continue;
                }
                const lastLineNumber = lineNumber + queryLines.length - 1;
                const lastOriginal = adapter.getLine(lastLineNumber) || "";
                const lastFolded = foldText(lastOriginal);
                const lastQueryLine = queryLines[queryLines.length - 1];
                if (lastFolded.slice(0, lastQueryLine.length) !==
                        lastQueryLine) {
                    continue;
                }
                return {
                    from: positionIndex({
                        line: lineNumber,
                        ch: character + adjustFoldedOffset(
                            original,
                            folded,
                            firstMatch
                        )
                    }),
                    to: positionIndex({
                        line: lastLineNumber,
                        ch: adjustFoldedOffset(
                            lastOriginal,
                            lastFolded,
                            lastQueryLine.length
                        )
                    })
                };
            }
            return null;
        }

        function findRegexpAcrossDocument(reverse, headOffset) {
            const source = documentSource();
            const regexp = new RegExp(
                expression.source,
                addRegexpFlags(expression, "gm")
            );
            const match = reverse ?
                lastRegexpMatch(source, regexp, headOffset) :
                (function () {
                    regexp.lastIndex = headOffset;
                    return regexp.exec(source);
                }());
            if (!match) {
                return null;
            }
            return {
                from: match.index,
                to: match.index + match[0].length,
                match: match
            };
        }

        function findRegexpByLine(reverse, headOffset) {
            const doc = adapter._view.state.doc;
            const regexp = new RegExp(
                expression.source,
                addRegexpFlags(expression, "g")
            );
            let line = doc.lineAt(headOffset);
            let character = headOffset - line.from;

            while (line) {
                let match;
                if (reverse) {
                    match = lastRegexpMatch(line.text, regexp, character);
                } else {
                    regexp.lastIndex = character;
                    match = regexp.exec(line.text);
                }
                if (match) {
                    return {
                        from: line.from + match.index,
                        to: line.from + match.index + match[0].length,
                        match: match
                    };
                }
                if (reverse) {
                    if (line.number === 1) {
                        break;
                    }
                    line = doc.line(line.number - 1);
                    character = line.length;
                } else {
                    if (line.number === doc.lines) {
                        break;
                    }
                    line = doc.line(line.number + 1);
                    character = 0;
                }
            }
            return null;
        }

        const initialPosition = clipPosition(start || {
            line: adapter.firstLine(),
            ch: 0
        });
        const cursor = {
            atOccurrence: false,
            afterEmptyMatch: false,
            doc: adapter,
            pos: {
                from: initialPosition,
                to: initialPosition
            },
            find: function (reverse) {
                const doc = adapter._view.state.doc;
                const headPosition = clipPosition(
                    reverse ? cursor.pos.from : cursor.pos.to
                );
                let headOffset = positionIndex(headPosition);
                if (cursor.afterEmptyMatch && cursor.atOccurrence) {
                    headOffset += reverse ? -1 : 1;
                    if (headOffset < 0 || headOffset > doc.length) {
                        const end = reverse ? {
                            line: adapter.firstLine(),
                            ch: 0
                        } : {
                            line: adapter.lastLine() + 1,
                            ch: 0
                        };
                        cursor.pos = {
                            from: end,
                            to: end
                        };
                        cursor.atOccurrence = false;
                        cursor.afterEmptyMatch = false;
                        return false;
                    }
                }

                const result = expression ?
                    (allowMultiline ?
                        findRegexpAcrossDocument(Boolean(reverse), headOffset) :
                        findRegexpByLine(Boolean(reverse), headOffset)) :
                    findString(Boolean(reverse), headPosition);
                cursor.afterEmptyMatch = Boolean(
                    result && result.from === result.to
                );
                if (!result) {
                    const end = reverse ? {
                        line: adapter.firstLine(),
                        ch: 0
                    } : {
                        line: adapter.lastLine() + 1,
                        ch: 0
                    };
                    cursor.pos = {
                        from: end,
                        to: end
                    };
                    cursor.atOccurrence = false;
                    return false;
                }

                cursor.pos = {
                    from: adapter.posFromIndex(result.from),
                    to: adapter.posFromIndex(result.to)
                };
                if (result.match) {
                    cursor.pos.match = result.match;
                }
                cursor.atOccurrence = true;
                return result.match || true;
            },
            findNext: function () {
                return cursor.find(false);
            },
            findPrevious: function () {
                return cursor.find(true);
            },
            from: function () {
                return cursor.atOccurrence ? cursor.pos.from : undefined;
            },
            to: function () {
                return cursor.atOccurrence ? cursor.pos.to : undefined;
            },
            replace: function (replacement, origin) {
                if (!cursor.atOccurrence) {
                    return;
                }
                const replacementText = String(replacement);
                const from = cursor.pos.from;
                adapter.replaceRange(
                    replacementText,
                    from,
                    cursor.pos.to,
                    origin
                );
                cursor.pos.to = adapter.posFromIndex(
                    adapter.indexFromPos(from) + replacementText.length
                );
            }
        };
        return cursor;
    };

    CodeMirror6Adapter.prototype.scrollCursorIntoView = function () {
        this.scrollIntoView(this.getCursor());
    };

    CodeMirror6Adapter.prototype.getStateAfter = function (lineNumber, precise) {
        const targetLine = lineNumber === null || lineNumber === undefined ?
            this.lastLine() :
            _clamp(Number(lineNumber) || 0, 0, this.lastLine());
        const mode = this.getMode();
        return _modeStateBefore(this, mode, targetLine + 1, precise);
    };

    CodeMirror6Adapter.prototype.getStateBefore = function (lineNumber, precise) {
        const mode = this.getMode();
        return _modeStateBefore(this, mode, lineNumber, precise);
    };

    CodeMirror6Adapter.prototype.destroy = function () {
        if (this._destroyed) {
            return;
        }
        const activeKeyMap = CodeMirror.getKeyMap &&
            CodeMirror.getKeyMap(this.getOption("keyMap"));
        if (activeKeyMap && typeof activeKeyMap.detach === "function") {
            activeKeyMap.detach.call(activeKeyMap, this, null);
        }
        Array.from(this._searchAnnotations).forEach(function (annotation) {
            annotation.clear();
        });
        Array.from(this._scrollbarAnnotations).forEach(function (annotation) {
            annotation.clear();
        });
        this._destroyed = true;
        if (this._keySequenceTimer) {
            clearTimeout(this._keySequenceTimer);
            this._keySequenceTimer = null;
        }
        if (this._rulerElement) {
            this._rulerElement.remove();
            this._rulerElement = null;
        }
        if (this._legacyDOM) {
            this._legacyDOM.sizer.remove();
            this._legacyDOM.verticalScrollbar.remove();
            this._legacyDOM = null;
        }
        this._clearScrollbarModel();
        this._lineWidgets.forEach(function (record) {
            record.renderedWrapper = null;
        });
        this._lineHandles.forEach(function (handle) {
            handle.parent = null;
        });
        if (this._view) {
            this._view.scrollDOM.removeEventListener("scroll", this._scrollHandler);
            this._view.destroy();
        }
        this._listeners.clear();
        if (CodeMirror.unregisterInstance) {
            CodeMirror.unregisterInstance(this);
        }
        this._markers.length = 0;
        this._lineHandles.clear();
        this._overlays.length = 0;
        this._gutterMarkers.length = 0;
        this._lineClasses.length = 0;
        this._lineWidgets.length = 0;
        this.marks = Object.create(null);
        this.virtualSelection = null;
        this.curOp = null;
        this.cm6 = null;
        this._view = null;
    };

    if (CodeMirror.defineExtension) {
        CodeMirror.defineExtension(
            "annotateScrollbar",
            CodeMirror6Adapter.prototype.annotateScrollbar
        );
        CodeMirror.defineExtension(
            "showMatchesOnScrollbar",
            CodeMirror6Adapter.prototype.showMatchesOnScrollbar
        );
    }

    if (CodeMirror.registerEditorConstructor) {
        CodeMirror.registerEditorConstructor(CodeMirror6Adapter);
    }

    exports.CodeMirror6Adapter = CodeMirror6Adapter;
});
