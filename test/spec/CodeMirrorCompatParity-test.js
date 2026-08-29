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
 * This program is distributed in the hope that it will be useful, but WITHOUT
 * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
 * FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License
 * for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see https://opensource.org/licenses/AGPL-3.0.
 */

/*global describe, it, expect, afterEach, awaitsFor */

define(function (require, exports, module) {

    const CodeMirror = require("editor/CodeMirrorCompat"),
        CM6 = require("thirdparty/CodeMirror6/codemirror6"),
        CodeMirrorSublimeCompat = require("editor/CodeMirrorSublimeCompat");

    CodeMirrorSublimeCompat.install(CodeMirror);

    function readToken(mode, stream, state) {
        for (let attempt = 0; attempt < 10; attempt++) {
            const type = mode.token(stream, state);
            if (stream.pos > stream.start) {
                return type;
            }
        }
        throw new Error(`Mode ${mode.name || "unknown"} failed to advance.`);
    }

    function tokenizeLines(modeSpecification, source, options) {
        const mode = CodeMirror.getMode(options || {indentUnit: 4}, modeSpecification);
        const state = CodeMirror.startState(mode);
        const lines = source.split("\n");
        return {
            mode: mode,
            lines: lines.map(function (line, lineNumber) {
                if (!line.length) {
                    if (mode.blankLine) {
                        mode.blankLine(state);
                    }
                    return {
                        tokens: [],
                        state: CodeMirror.copyState(mode, state),
                        innerMode: CodeMirror.innerMode(mode, state).mode.name
                    };
                }

                const stream = new CodeMirror.StringStream(line, 4, {
                    lookAhead: function (distance) {
                        return lines[lineNumber + distance];
                    },
                    baseToken: function () {
                        return null;
                    }
                });
                const tokens = [];
                while (!stream.eol()) {
                    stream.start = stream.pos;
                    tokens.push({
                        string: stream.current(),
                        type: readToken(mode, stream, state)
                    });
                    tokens[tokens.length - 1].string = stream.current();
                }
                return {
                    tokens: tokens,
                    state: CodeMirror.copyState(mode, state),
                    innerMode: CodeMirror.innerMode(mode, state).mode.name
                };
            })
        };
    }

    function tokenFor(line, text) {
        return line.tokens.find(function (token) {
            return token.string === text;
        });
    }

    function modeInfoFingerprint(modeInfo) {
        const serialized = JSON.stringify(modeInfo, function (key, value) {
            if (value instanceof RegExp) {
                return {
                    source: value.source,
                    flags: value.flags
                };
            }
            return value;
        });
        let hashA = 0;
        let hashB = 0;
        for (let i = 0; i < serialized.length; i++) {
            const code = serialized.charCodeAt(i);
            hashA = (hashA * 31 + code) % 1000000007;
            hashB = (hashB * 131 + code) % 1000000009;
        }
        return `${serialized.length}:${hashA}:${hashB}`;
    }

    describe("CodeMirror compatibility parity", function () {
        const editors = [];
        const documents = [];
        const fixtures = [];

        afterEach(function () {
            editors.forEach(function (editor) {
                if (editor && typeof editor.destroy === "function") {
                    editor.destroy();
                }
            });
            editors.length = 0;
            documents.forEach(function (doc) {
                if (doc && doc._adapter && !doc._adapter._destroyed) {
                    doc._adapter.destroy();
                }
            });
            documents.length = 0;
            fixtures.forEach(function (fixture) {
                fixture.remove();
            });
            fixtures.length = 0;
        });

        function createEditor(value, options) {
            const holder = window.document.createElement("div");
            window.document.body.appendChild(holder);
            fixtures.push(holder);
            const editor = new CodeMirror(
                holder,
                Object.assign({value: value}, options || {})
            );
            editors.push(editor);
            return editor;
        }

        function trackDoc(doc) {
            documents.push(doc);
            return doc;
        }

        it("matches CodeMirror 5.65.16 mode metadata and lookup semantics", function () {
            expect(CodeMirror.modeInfo.length).toBe(157);
            expect(modeInfoFingerprint(CodeMirror.modeInfo))
                .toBe("13339:731755378:285343183");
            expect(CodeMirror.modeInfo[0]).toEqual({
                name: "APL",
                mime: "text/apl",
                mode: "apl",
                ext: ["dyalog", "apl"]
            });
            expect(CodeMirror.modeInfo[CodeMirror.modeInfo.length - 1]).toEqual({
                name: "WebAssembly",
                mime: "text/webassembly",
                mode: "wast",
                ext: ["wat", "wast"]
            });

            const javaScript = CodeMirror.findModeByMIME("TEXT/JAVASCRIPT");
            const json = CodeMirror.findModeByMIME("application/problem+json");
            const xml = CodeMirror.findModeByMIME("image/svg+xml");
            expect(javaScript.name).toBe("JavaScript");
            expect(javaScript.mime).toBe("text/javascript");
            expect(javaScript.mimes).toEqual([
                "text/javascript",
                "text/ecmascript",
                "application/javascript",
                "application/x-javascript",
                "application/ecmascript"
            ]);
            expect(json.name).toBe("JSON");
            expect(xml.name).toBe("XML");
            expect(CodeMirror.findModeByMIME("application/not-real"))
                .toBeUndefined();

            expect(CodeMirror.findModeByExtension("CPP").name).toBe("C++");
            expect(CodeMirror.findModeByExtension("m").name).toBe("Mathematica");
            expect(CodeMirror.findModeByExtension("BUILD")).toBeUndefined();
            expect(CodeMirror.findModeByExtension("not-real")).toBeUndefined();

            expect(CodeMirror.findModeByFileName("README.md").name)
                .toBe("GitHub Flavored Markdown");
            expect(CodeMirror.findModeByFileName("CMakeLists.txt").name)
                .toBe("CMake");
            expect(CodeMirror.findModeByFileName("component.TSX").name)
                .toBe("TypeScript-JSX");
            expect(CodeMirror.findModeByFileName("not-real")).toBeUndefined();

            expect(CodeMirror.findModeByName("NODE")).toBe(javaScript);
            expect(CodeMirror.findModeByName("diff").name).toBe("diff");
            expect(CodeMirror.findModeByName("not-real")).toBeUndefined();
        });

        it("rejects unsupported input styles before attaching an editor", function () {
            const holder = window.document.createElement("div");
            window.document.body.appendChild(holder);
            fixtures.push(holder);

            expect(function () {
                return new CodeMirror(holder, {
                    value: "alpha",
                    inputStyle: "unsupported"
                });
            }).toThrowError(
                'Unsupported CodeMirror inputStyle "unsupported"'
            );
            expect(holder.childNodes.length).toBe(0);
        });

        it("preserves PHP heredoc, nowdoc, and interpolated string tokens", function () {
            const heredoc = tokenizeLines(
                "application/x-httpd-php-open",
                "<<<TXT\nhello $name {$user->id}\nTXT;\n" +
                    "\"value $name {$user->id}\";"
            );

            expect(tokenFor(heredoc.lines[0], "<<<TXT").type).toBe("string");
            expect(tokenFor(heredoc.lines[1], "$name").type).toBe("variable-2");
            expect(tokenFor(heredoc.lines[1], "$user").type).toBe("variable-2");
            expect(tokenFor(heredoc.lines[1], "id").type).toBe("variable");
            expect(tokenFor(heredoc.lines[2], "TXT").type).toBe("string");
            expect(heredoc.lines[2].state.phpState.tokenize).toBeNull();
            expect(tokenFor(heredoc.lines[3], "$name").type).toBe("variable-2");
            expect(tokenFor(heredoc.lines[3], "$user").type).toBe("variable-2");
            expect(heredoc.lines[3].state.phpState.tokenize).toBeNull();

            const nowdoc = tokenizeLines(
                "application/x-httpd-php-open",
                "<<<'TXT'\nhello $name\nTXT;"
            );
            expect(tokenFor(nowdoc.lines[0], "<<<'TXT'").type).toBe("string");
            expect(nowdoc.lines[1].tokens).toEqual([{
                string: "hello $name",
                type: "string"
            }]);
            expect(nowdoc.lines[2].state.phpState.tokenize).toBeNull();
        });

        it("delegates Markdown fences and raw HTML to their embedded modes", function () {
            const result = tokenizeLines(
                {
                    name: "markdown",
                    fencedCodeBlockHighlighting: true
                },
                "```javascript\nconst value = 1;\n```\n" +
                    "<div class=\"example\">\n<span>hello</span>\n</div>"
            );

            expect(result.lines[0].state.fencedCode).toBe(true);
            expect(result.lines[0].innerMode).toBe("javascript");
            expect(tokenFor(result.lines[1], "const").type).toBe("keyword");
            expect(result.lines[1].innerMode).toBe("javascript");
            expect(result.lines[2].state.fencedCode).toBe(false);
            expect(result.lines[2].innerMode).toBe("markdown");

            expect(tokenFor(result.lines[3], "<").type).toBe("tag bracket");
            expect(tokenFor(result.lines[3], "div").type).toBe("tag");
            expect(tokenFor(result.lines[3], "class").type).toBe("attribute");
            expect(result.lines[3].innerMode).toBe("xml");
            expect(tokenFor(result.lines[4], "span").type).toBe("tag");
            expect(result.lines[4].innerMode).toBe("xml");
            expect(result.lines[5].innerMode).toBe("markdown");
        });

        it("preserves GFM task, emoji, issue, SHA, and URL token semantics", function () {
            const result = tokenizeLines(
                "gfm",
                "- [ ] open\n- [x] done\n" +
                    ":smile: owner/repo#123 deadbe1 https://example.com"
            );

            expect(tokenFor(result.lines[0], "[ ]").type).toContain("meta");
            expect(tokenFor(result.lines[1], "[x]").type).toContain("property");
            expect(tokenFor(result.lines[2], ":smile:").type).toBe("builtin");
            expect(tokenFor(result.lines[2], "owner/repo#123").type).toBe("link");
            expect(tokenFor(result.lines[2], "deadbe1").type).toBe("link");
            expect(tokenFor(result.lines[2], "https://example.com").type).toBe("link");
        });

        it("configures native CM6 fenced languages and GFM syntax separately", function () {
            const source = "```javascript\nconst value = 1;\n```\n- [x] ~~done~~";
            const holder = window.document.createElement("div");
            const markdownHolder = window.document.createElement("div");
            window.document.body.appendChild(holder);
            window.document.body.appendChild(markdownHolder);
            fixtures.push(holder, markdownHolder);

            const gfmEditor = new CodeMirror(holder, {
                value: source,
                mode: "gfm"
            });
            const markdownEditor = new CodeMirror(markdownHolder, {
                value: source,
                mode: "markdown"
            });
            editors.push(gfmEditor, markdownEditor);

            const gfmTree = CM6.syntaxTree(gfmEditor._view.state).toString();
            const markdownTree = CM6.syntaxTree(markdownEditor._view.state).toString();
            const gfmCodeNode = CM6.syntaxTree(gfmEditor._view.state).resolveInner(
                source.indexOf("const") + 1,
                1
            );
            const markdownCodeNode = CM6.syntaxTree(
                markdownEditor._view.state
            ).resolveInner(source.indexOf("const") + 1, 1);
            expect(gfmCodeNode.parent.name).toBe("VariableDeclaration");
            expect(gfmTree).toContain("TaskMarker");
            expect(gfmTree).toContain("Strikethrough");
            expect(markdownCodeNode.parent.name).toBe("VariableDeclaration");
            expect(markdownTree).not.toContain("TaskMarker");
            expect(markdownTree).not.toContain("Strikethrough");
        });

        it("resolves custom MIME aliases to their native CM6 language", function () {
            const mime = "application/x-phoenix-cm6-javascript";
            CodeMirror.defineMIME(mime, "javascript");
            const editor = createEditor("const answer = 42;", {
                mode: mime
            });

            expect(CM6.syntaxTree(editor._view.state).toString())
                .toContain("VariableDeclaration");
        });

        it("uses overridden legacy modes inside native HTML script regions", async function () {
            const originalJavaScriptMode = CodeMirror.modes.javascript;
            CodeMirror.modes.javascript = function () {
                return {
                    token: function (stream) {
                        stream.skipToEnd();
                        return "string";
                    }
                };
            };

            try {
                const editor = createEditor(
                    "<script type=\"text/custom-js\">const answer = 42;</script>",
                    {
                        mode: {
                            name: "htmlmixed",
                            scriptTypes: [{
                                matches: /^text\/custom-js$/i,
                                mode: "javascript"
                            }]
                        }
                    }
                );

                await awaitsFor(function () {
                    return Array.from(
                        editor.getWrapperElement().querySelectorAll(".cm-string")
                    ).some(function (element) {
                        return element.textContent.includes("const answer");
                    });
                }, "overridden JavaScript mode should render in the script region");
            } finally {
                CodeMirror.modes.javascript = originalJavaScriptMode;
            }
        });

        it("provides safe CM5 static helpers and type checks for extensions", function () {
            expect(CodeMirror.findColumn("a\tb", 4, 4)).toBe(2);
            expect(CodeMirror.wheelEventPixels({
                deltaX: 2,
                deltaY: 3,
                deltaMode: 1
            })).toEqual({x: 32, y: 48});

            const parent = window.document.createElement("div");
            const child = window.document.createElement("span");
            parent.appendChild(child);
            CodeMirror.addClass(child, "one two");
            expect(child.classList.contains("one")).toBe(true);
            expect(child.classList.contains("two")).toBe(true);
            CodeMirror.rmClass(child, "one");
            expect(child.classList.contains("one")).toBe(false);
            expect(CodeMirror.contains(parent, child)).toBe(true);

            const event = {
                prevented: false,
                stopped: false,
                preventDefault: function () {
                    this.prevented = true;
                },
                stopPropagation: function () {
                    this.stopped = true;
                }
            };
            CodeMirror.e_stop(event);
            expect(event.prevented).toBe(true);
            expect(event.stopped).toBe(true);

            CodeMirror.defineInitHook(function (editor) {
                editor._compatInitHookObserved = true;
            });
            const holder = window.document.createElement("div");
            window.document.body.appendChild(holder);
            fixtures.push(holder);
            const editor = new CodeMirror(holder, {
                value: "alpha"
            });
            editors.push(editor);
            expect(editor._compatInitHookObserved).toBe(true);
            expect(editor._lineFolds).toEqual({});
            expect(Object.keys(CodeMirror.inputStyles).sort()).toEqual([
                "contenteditable",
                "textarea"
            ]);
            expect(Object.keys(CodeMirror.scrollbarModel).sort()).toEqual([
                "native",
                "null",
                "overlay",
                "simple"
            ]);
            expect(new CodeMirror.inputStyles.textarea(editor).getField())
                .toBe(editor.getInputField());
            expect(new CodeMirror.inputStyles.textarea(editor).supportsTouch())
                .toBe(false);
            expect(new CodeMirror.inputStyles.contenteditable(editor).supportsTouch())
                .toBe(true);
            expect(new CodeMirror.scrollbarModel.native(null, null, editor).update())
                .toEqual({right: 0, bottom: 0});
            expect(new CodeMirror.scrollbarModel.null().update())
                .toEqual({right: 0, bottom: 0});
            expect(CodeMirror.defaults.autoCloseBrackets).toBe(false);
            expect(CodeMirror.defaults.matchBrackets).toBe(false);
            expect(CodeMirror.defaults.styleActiveLine).toBe(false);

            const marker = editor.markText(
                {line: 0, ch: 0},
                {line: 0, ch: 1}
            );
            const line = editor.getLineHandle(0);
            const widgetNode = window.document.createElement("div");
            const widget = editor.addLineWidget(0, widgetNode);
            expect(marker instanceof CodeMirror.TextMarker).toBe(true);
            expect(line instanceof CodeMirror.Line).toBe(true);
            expect(widget instanceof CodeMirror.LineWidget).toBe(true);
            expect(marker.doc).toBe(editor.getDoc());
            expect(marker.widgetNode).toBeUndefined();
            expect(widget.doc).toBe(editor.getDoc());
            expect(typeof widget.on).toBe("function");
            expect(typeof widget.off).toBe("function");

            const shared = new CodeMirror.SharedTextMarker([marker], marker);
            expect(shared.find()).toEqual(marker.find());
            shared.clear();
            expect(marker.find()).toBeUndefined();
        });

        it("preserves CM5 overlay state and getTokenTypeAt semantics", function () {
            const modeName = "cm6-overlay-token-parity";
            CodeMirror.defineMode(modeName, function () {
                return {
                    token: function (stream) {
                        if (stream.match("alpha")) {
                            return "keyword";
                        }
                        if (stream.match("beta")) {
                            return "string";
                        }
                        stream.next();
                        return null;
                    }
                };
            });

            const editor = createEditor("alpha beta", {
                mode: modeName
            });
            const observedBaseTokens = [];
            const transparentOverlay = {
                token: function (stream) {
                    const baseToken = stream.baseToken();
                    if (stream.sol()) {
                        observedBaseTokens.push(baseToken);
                    }
                    if (stream.match("alpha")) {
                        return "transparent-overlay";
                    }
                    stream.next();
                    return null;
                }
            };
            const opaqueOverlay = {
                token: function (stream) {
                    if (stream.match("alpha")) {
                        return "opaque-overlay";
                    }
                    stream.next();
                    return null;
                }
            };

            expect(editor.state.overlays).toBe(editor._overlays);
            expect(editor.state.overlays).toEqual([]);
            expect(editor.getTokenTypeAt({line: 0, ch: 1})).toBe("keyword");

            editor.addOverlay(transparentOverlay, {priority: 10});
            expect(editor.state.overlays).toBe(editor._overlays);
            expect(editor.state.overlays.length).toBe(1);
            expect(editor.state.overlays[0].mode).toBe(transparentOverlay);
            expect(editor.state.overlays[0].modeSpec).toBe(transparentOverlay);
            expect(editor.state.overlays[0].opaque).toBeUndefined();
            expect(editor.state.overlays[0].priority).toBe(10);
            expect(editor.getTokenTypeAt({line: 0, ch: 1})).toBe("keyword");
            expect(observedBaseTokens.some(function (token) {
                return token && token.type === "keyword" && token.size === 5;
            })).toBe(true);

            editor.addOverlay(opaqueOverlay, {
                opaque: true,
                priority: -1
            });
            expect(editor.state.overlays.map(function (overlay) {
                return overlay.modeSpec;
            })).toEqual([opaqueOverlay, transparentOverlay]);
            expect(editor.getTokenTypeAt({line: 0, ch: 1})).toBeNull();
            expect(editor.getTokenTypeAt({line: 0, ch: 7})).toBe("string");

            editor.removeOverlay(opaqueOverlay);
            expect(editor.state.overlays.length).toBe(1);
            expect(editor.state.overlays[0].modeSpec).toBe(transparentOverlay);
            expect(editor.state.overlays[0].priority).toBe(10);
            expect(editor.getTokenTypeAt({line: 0, ch: 1})).toBe("keyword");

            editor.removeOverlay(transparentOverlay);
            expect(editor.state.overlays).toEqual([]);
            expect(editor.getTokenTypeAt({line: 0, ch: 1})).toBe("keyword");
        });

        it("provides CM5-compatible bracket search results from CM6 state", function () {
            const editor = createEditor(
                "(\n    \")\"\n    [value]\n)\n(]\n<x>\n(",
                {
                    mode: "javascript",
                    matchBrackets: false
                }
            );
            const openingStyle = editor.getTokenTypeAt(
                CodeMirror.Pos(0, 1)
            );

            [
                "findMatchingBracket",
                "matchBrackets",
                "scanForBracket"
            ].forEach(function (methodName) {
                expect(typeof CodeMirror[methodName]).toBe("function");
                expect(typeof editor[methodName]).toBe("function");
            });

            const forwardMatch = editor.findMatchingBracket(
                CodeMirror.Pos(0, 1)
            );
            expect(forwardMatch).toEqual({
                from: CodeMirror.Pos(0, 0),
                to: CodeMirror.Pos(3, 0),
                match: true,
                forward: true
            });
            expect(CodeMirror.findMatchingBracket(
                editor,
                CodeMirror.Pos(3, 1)
            )).toEqual({
                from: CodeMirror.Pos(3, 0),
                to: CodeMirror.Pos(0, 0),
                match: true,
                forward: false
            });
            expect(editor.findMatchingBracket(
                CodeMirror.Pos(0, 1),
                true
            )).toBeNull();
            expect(editor.findMatchingBracket(
                CodeMirror.Pos(0, 1),
                false
            )).toEqual(forwardMatch);

            expect(editor.scanForBracket(
                CodeMirror.Pos(0, 1),
                1,
                openingStyle
            )).toEqual({
                pos: CodeMirror.Pos(3, 0),
                ch: ")"
            });
            expect(CodeMirror.scanForBracket(
                editor,
                CodeMirror.Pos(0, 1),
                1,
                openingStyle,
                {maxScanLines: 2}
            )).toBeNull();

            expect(editor.findMatchingBracket(
                CodeMirror.Pos(4, 1)
            )).toEqual({
                from: CodeMirror.Pos(4, 0),
                to: CodeMirror.Pos(4, 1),
                match: false,
                forward: true
            });
            expect(editor.findMatchingBracket(
                CodeMirror.Pos(5, 1),
                {bracketRegex: /[<>]/}
            )).toEqual({
                from: CodeMirror.Pos(5, 0),
                to: CodeMirror.Pos(5, 2),
                match: true,
                forward: true
            });

            const unmatched = editor.findMatchingBracket(
                CodeMirror.Pos(6, 1)
            );
            expect(unmatched.to).toBe(false);
            expect(unmatched.match).toBe(false);
        });

        it("highlights and clears bracket matches through CM6-backed markers", function () {
            const editor = createEditor("([value])\n(]", {
                mode: "javascript",
                matchBrackets: false
            });

            editor.setCursor(CodeMirror.Pos(0, 1));
            const clearMatch = CodeMirror.matchBrackets(editor, false);
            expect(typeof clearMatch).toBe("function");
            expect(editor.getAllMarks().map(function (marker) {
                return marker.className;
            })).toEqual([
                "CodeMirror-matchingbracket",
                "CodeMirror-matchingbracket"
            ]);
            clearMatch();
            expect(editor.getAllMarks()).toEqual([]);

            editor.setCursor(CodeMirror.Pos(1, 1));
            const clearMismatch = CodeMirror.matchBrackets(editor, false);
            expect(typeof clearMismatch).toBe("function");
            expect(editor.getAllMarks().map(function (marker) {
                return marker.className;
            })).toEqual([
                "CodeMirror-nonmatchingbracket",
                "CodeMirror-nonmatchingbracket"
            ]);
            clearMismatch();
            expect(editor.getAllMarks()).toEqual([]);

            expect(CodeMirror.matchBrackets(editor, false, {
                highlightNonMatching: false
            })).toBeUndefined();
            expect(editor.getAllMarks()).toEqual([]);
        });

        it("preserves public marker and line-widget identities across document swaps", function () {
            const firstDoc = trackDoc(new CodeMirror.Doc(
                "alpha\nbeta",
                "javascript"
            ));
            const replacementNode = window.document.createElement("strong");
            replacementNode.textContent = "replacement";
            const marker = firstDoc.markText(
                {line: 0, ch: 0},
                {line: 0, ch: 2},
                {
                    replacedWith: replacementNode,
                    doc: {},
                    handleMouseEvents: false
                }
            );
            const bookmarkNode = window.document.createElement("em");
            bookmarkNode.textContent = "bookmark";
            const bookmark = firstDoc.setBookmark(
                {line: 0, ch: 3},
                {
                    widget: bookmarkNode,
                    insertLeft: true,
                    handleMouseEvents: true
                }
            );
            const lineWidgetNode = window.document.createElement("div");
            const spoofedLine = {};
            const lineWidget = firstDoc.addLineWidget(1, lineWidgetNode, {
                doc: {},
                node: window.document.createElement("div"),
                line: spoofedLine
            });
            const firstLineHandle = firstDoc.getLineHandle(1);

            expect(marker.doc).toBe(firstDoc);
            expect(marker.replacedWith).toBe(replacementNode);
            expect(marker.widgetNode).not.toBe(replacementNode);
            expect(marker.widgetNode.tagName).toBe("SPAN");
            expect(marker.widgetNode.className).toBe("CodeMirror-widget");
            expect(marker.widgetNode.getAttribute("role")).toBe("presentation");
            expect(marker.widgetNode.getAttribute("cm-ignore-events")).toBe("true");
            expect(marker.widgetNode.firstChild).toBe(replacementNode);
            expect(bookmark.doc).toBe(firstDoc);
            expect(bookmark.replacedWith).toBe(bookmarkNode);
            expect(bookmark.widgetNode.firstChild).toBe(bookmarkNode);
            expect(bookmark.widgetNode.hasAttribute("cm-ignore-events")).toBe(false);
            expect(bookmark.widgetNode.insertLeft).toBe(true);
            expect(lineWidget.doc).toBe(firstDoc);
            expect(lineWidget.node).toBe(lineWidgetNode);
            expect(lineWidget.line).toBe(firstLineHandle);

            let probeCount = 0;
            const probe = function () {
                probeCount++;
            };
            lineWidget.on("probe", probe);
            CodeMirror.signal(lineWidget, "probe");
            lineWidget.off("probe", probe);
            CodeMirror.signal(lineWidget, "probe");
            expect(probeCount).toBe(1);

            const editor = createEditor(firstDoc);
            const secondDoc = trackDoc(new CodeMirror.Doc(
                "gamma\ndelta",
                "javascript"
            ));
            const secondMarker = secondDoc.markText(
                {line: 0, ch: 1},
                {line: 0, ch: 3}
            );
            const secondWidgetNode = window.document.createElement("div");
            const secondWidget = secondDoc.addLineWidget(1, secondWidgetNode);
            firstDoc._adapter._lineFolds.firstDocumentFold = {
                from: 0,
                to: 1
            };
            secondDoc._adapter._lineFolds.secondDocumentFold = {
                from: 1,
                to: 2
            };

            expect(editor.swapDoc(secondDoc)).toBe(firstDoc);
            expect(editor._lineFolds).toEqual({
                secondDocumentFold: {
                    from: 1,
                    to: 2
                }
            });
            expect(firstDoc._adapter._lineFolds).toEqual({
                firstDocumentFold: {
                    from: 0,
                    to: 1
                }
            });
            expect(marker.doc).toBe(firstDoc);
            expect(bookmark.doc).toBe(firstDoc);
            expect(lineWidget.doc).toBe(firstDoc);
            expect(firstDoc.getAllMarks()).toContain(marker);
            expect(firstDoc.getAllMarks()).toContain(bookmark);
            expect(firstDoc.lineInfo(1).widgets).toContain(lineWidget);
            expect(secondMarker.doc).toBe(secondDoc);
            expect(secondWidget.doc).toBe(secondDoc);
            expect(secondDoc.getAllMarks()).toEqual([secondMarker]);
            expect(secondDoc.lineInfo(1).widgets).toContain(secondWidget);

            expect(editor.swapDoc(firstDoc)).toBe(secondDoc);
            expect(editor._lineFolds).toEqual({
                firstDocumentFold: {
                    from: 0,
                    to: 1
                }
            });
            expect(secondDoc._adapter._lineFolds).toEqual({
                secondDocumentFold: {
                    from: 1,
                    to: 2
                }
            });
            expect(marker.doc).toBe(firstDoc);
            expect(marker.widgetNode.firstChild).toBe(replacementNode);
            expect(lineWidget.doc).toBe(firstDoc);
            expect(lineWidget.node).toBe(lineWidgetNode);
            marker.clear();
            lineWidget.clear();
            expect(marker.doc).toBe(firstDoc);
            expect(marker.widgetNode.firstChild).toBe(replacementNode);
            expect(lineWidget.doc).toBe(firstDoc);
            expect(lineWidget.node).toBe(lineWidgetNode);
            expect(lineWidget.line).toBe(firstLineHandle);
        });

        it("preserves CM5 marker ordering across document queries", function () {
            const holder = window.document.createElement("div");
            window.document.body.appendChild(holder);
            fixtures.push(holder);

            const editor = new CodeMirror(holder, {
                value: "zero line\none line text\ntwo line"
            });
            editors.push(editor);

            const lateOnLineOne = editor.markText(
                {line: 1, ch: 8},
                {line: 1, ch: 10}
            );
            lateOnLineOne.compatLabel = "line-one-late";
            const earlyOnLineOne = editor.markText(
                {line: 1, ch: 1},
                {line: 1, ch: 3}
            );
            earlyOnLineOne.compatLabel = "line-one-early";
            const lineZero = editor.markText(
                {line: 0, ch: 1},
                {line: 0, ch: 3}
            );
            lineZero.compatLabel = "line-zero";
            const spanning = editor.markText(
                {line: 0, ch: 4},
                {line: 2, ch: 1}
            );
            spanning.compatLabel = "spanning";

            function labels(markers) {
                return markers.map(function (marker) {
                    return marker.compatLabel;
                });
            }

            expect(labels(editor.getAllMarks())).toEqual([
                "line-zero",
                "spanning",
                "line-one-late",
                "line-one-early"
            ]);
            expect(labels(editor.findMarks(
                {line: 0, ch: 0},
                {line: 2, ch: 2}
            ))).toEqual([
                "line-zero",
                "spanning",
                "line-one-late",
                "line-one-early"
            ]);
            expect(labels(editor.findMarks(
                {line: 1, ch: 0},
                {line: 2, ch: 2}
            ))).toEqual([
                "line-one-late",
                "line-one-early",
                "spanning"
            ]);
            expect(labels(editor.findMarksAt({line: 1, ch: 9}))).toEqual([
                "line-one-late",
                "spanning"
            ]);
        });

        it("provides detached Doc identity, copying, attachment, and swapDoc", function () {
            const doc = trackDoc(new CodeMirror.Doc(
                "one",
                "javascript",
                0,
                "\n",
                "ltr"
            ));
            expect(doc instanceof CodeMirror.Doc).toBe(true);
            expect(doc.getEditor()).toBeNull();
            expect(doc.getValue()).toBe("one");

            doc.replaceRange("!", {line: 0, ch: 3});
            const copy = trackDoc(doc.copy(true));
            expect(copy).not.toBe(doc);
            expect(copy.getValue()).toBe("one!");
            expect(copy.historySize().undo).toBe(1);
            copy.undo();
            expect(copy.getValue()).toBe("one");
            expect(doc.getValue()).toBe("one!");
            expect(trackDoc(doc.copy(false)).historySize().undo).toBe(0);

            const editor = createEditor(doc);
            expect(editor instanceof CodeMirror).toBe(true);
            expect(editor.getDoc()).toBe(doc);
            expect(doc.getEditor()).toBe(editor);
            expect(function () {
                createEditor(doc);
            }).toThrow();

            const replacement = trackDoc(new CodeMirror.Doc(
                "# title",
                "markdown"
            ));
            const oldDoc = editor.swapDoc(replacement);
            expect(oldDoc).toBe(doc);
            expect(oldDoc.getEditor()).toBeNull();
            expect(editor.getDoc()).toBe(replacement);
            expect(replacement.getEditor()).toBe(editor);
            expect(editor.getValue()).toBe("# title");
            expect(editor.getMode().name).toBe("markdown");

            oldDoc.setValue("detached");
            expect(editor.getValue()).toBe("# title");
            editor.swapDoc(oldDoc);
            expect(editor.getValue()).toBe("detached");
        });

        it("propagates linked documents transitively and partitions on unlink", function () {
            const editor = createEditor("x");
            const rootDoc = editor.getDoc();
            [
                "iterLinkedDocs",
                "linkedDoc",
                "unlinkDoc"
            ].forEach(function (methodName) {
                expect(typeof editor[methodName]).toBe("function");
            });
            const linked = trackDoc(editor.linkedDoc());
            const descendant = trackDoc(linked.linkedDoc());

            editor.setValue("hello");
            expect(linked.getValue()).toBe("hello");
            expect(descendant.getValue()).toBe("hello");

            descendant.replaceRange("!", {line: 0, ch: 5});
            expect(editor.getValue()).toBe("hello!");
            expect(linked.getValue()).toBe("hello!");

            const editorVisited = [];
            editor.iterLinkedDocs(function (doc) {
                editorVisited.push(doc);
            });
            expect(editorVisited).toEqual([linked, descendant]);

            editor.unlinkDoc(linked);
            linked.setValue("detached branch");
            expect(descendant.getValue()).toBe("detached branch");
            expect(editor.getValue()).toBe("hello!");

            const visited = [];
            linked.iterLinkedDocs(function (doc, sharedHistory) {
                visited.push({
                    doc: doc,
                    sharedHistory: sharedHistory
                });
            });
            expect(visited.length).toBe(1);
            expect(visited[0].doc).toBe(descendant);
            expect(visited[0].sharedHistory).toBe(false);
        });

        it("shares history across linked docs and keeps separate history usable", function () {
            const editor = createEditor("ab\ncd\nef");
            const shared = trackDoc(editor.getDoc().linkedDoc({
                sharedHist: true
            }));

            editor.replaceRange("x", {line: 0, ch: 2});
            shared.replaceRange("y", {line: 1, ch: 2});
            editor.replaceRange("z", {line: 2, ch: 2});
            expect(shared.getValue()).toBe("abx\ncdy\nefz");
            editor.undo();
            shared.undo();
            expect(editor.getValue()).toBe("abx\ncd\nef");
            shared.redo();
            editor.redo();
            expect(editor.getValue()).toBe("abx\ncdy\nefz");

            const separate = trackDoc(editor.getDoc().linkedDoc());
            separate.replaceRange("!", {line: 2, ch: 3});
            editor.replaceRange("prefix\n", {line: 0, ch: 0});
            separate.undo();
            expect(editor.getValue()).toBe("prefix\nabx\ncdy\nefz");
        });

        it("preserves global line coordinates for linked subviews", function () {
            const editor = createEditor("1\n2\n3\n4\n5");
            const subview = trackDoc(editor.getDoc().linkedDoc({
                from: 1,
                to: 3
            }));
            expect(subview.getValue()).toBe("2\n3");
            expect(subview.firstLine()).toBe(1);
            expect(subview.lastLine()).toBe(2);

            subview.setCursor({line: 4, ch: 0});
            expect(subview.getCursor()).toEqual({line: 2, ch: 1});
            editor.replaceRange("-1\n0\n", {line: 0, ch: 0});
            expect(subview.firstLine()).toBe(3);
            expect(subview.getCursor()).toEqual({line: 4, ch: 1});
            editor.undo();
            expect(subview.firstLine()).toBe(1);
            expect(subview.getCursor()).toEqual({line: 2, ch: 1});

            subview.replaceRange("new\n", {line: 2, ch: 0});
            expect(editor.getValue()).toBe("1\n2\nnew\n3\n4\n5");
            subview.undo();
            expect(editor.getValue()).toBe("1\n2\n3\n4\n5");
        });

        it("shares and partitions shared markers across linked documents", function () {
            const editor = createEditor("abcde");
            const linked = trackDoc(editor.getDoc().linkedDoc());
            const descendant = trackDoc(linked.linkedDoc());
            const sharedMarker = linked.markText(
                {line: 0, ch: 1},
                {line: 0, ch: 3},
                {
                    className: "cm-searching",
                    shared: true
                }
            );

            expect(sharedMarker.doc).toBeUndefined();
            expect(sharedMarker.primary.doc).toBe(editor.getDoc());
            expect(linked.findMarksAt({line: 0, ch: 2})[0]).toBe(sharedMarker);
            expect(descendant.findMarksAt({line: 0, ch: 2})[0]).toBe(sharedMarker);
            const rootMarker = editor.getAllMarks()[0];
            const linkedMarker = linked.getAllMarks()[0];
            const descendantMarker = descendant.getAllMarks()[0];
            expect(rootMarker.doc).toBe(editor.getDoc());
            expect(linkedMarker.doc).toBe(linked);
            expect(descendantMarker.doc).toBe(descendant);
            expect(rootMarker.parent).toBe(sharedMarker);
            expect(linkedMarker.parent).toBe(sharedMarker);
            expect(descendantMarker.parent).toBe(sharedMarker);

            editor.getDoc().unlinkDoc(linked);
            const detachedMarker = linked.findMarksAt({line: 0, ch: 2})[0];
            const detachedDescendantMarker =
                descendant.findMarksAt({line: 0, ch: 2})[0];
            expect(detachedMarker).not.toBe(sharedMarker);
            expect(detachedDescendantMarker).not.toBe(sharedMarker);
            expect(detachedDescendantMarker).not.toBe(detachedMarker);
            expect(detachedMarker.doc).toBe(linked);
            expect(detachedDescendantMarker.doc).toBe(descendant);
            expect(detachedMarker.parent).toBeNull();
            expect(detachedDescendantMarker.parent).toBeNull();

            detachedMarker.clear();
            expect(linked.findMarksAt({line: 0, ch: 2}).length).toBe(0);
            expect(descendant.findMarksAt({line: 0, ch: 2})[0])
                .toBe(detachedDescendantMarker);
            expect(editor.findMarksAt({line: 0, ch: 2})[0]).toBe(sharedMarker);
            detachedDescendantMarker.clear();
            sharedMarker.clear();
            expect(editor.findMarksAt({line: 0, ch: 2}).length).toBe(0);
        });

        it("supports legacy instance selection, operation, movement, and widget APIs", async function () {
            const holder = window.document.createElement("div");
            holder.style.display = "block";
            holder.style.width = "600px";
            holder.style.height = "180px";
            window.document.body.appendChild(holder);
            fixtures.push(holder);

            const editor = new CodeMirror(holder, {
                value: "alpha\nbeta\ngamma",
                mode: "javascript",
                phrases: {
                    Greeting: "Hello"
                }
            });
            editors.push(editor);
            editor.setSize(600, 180);
            editor.refresh();

            editor.setOption("lineNumbers", true);
            editor.setOption("styleActiveLine", true);
            editor.setCursor({line: 0, ch: 0});
            expect(editor.getGutterElement().querySelector(".CodeMirror-linenumbers"))
                .not.toBeNull();
            expect(editor.lineInfo(0).wrapClass).toContain("CodeMirror-activeline");
            expect(editor.lineInfo(0).bgClass).toContain(
                "CodeMirror-activeline-background"
            );

            [
                "addSelection",
                "addWidget",
                "annotateScrollbar",
                "clipPos",
                "endOperation",
                "extendSelections",
                "findPosH",
                "findPosV",
                "getExtending",
                "getLineHandleVisualStart",
                "hasFocus",
                "isReadOnly",
                "phrase",
                "setDirection",
                "setExtending",
                "showMatchesOnScrollbar",
                "splitLines",
                "startOperation",
                "triggerElectric",
                "triggerOnKeyDown",
                "triggerOnKeyPress",
                "triggerOnKeyUp",
                "triggerOnMouseDown"
            ].forEach(function (methodName) {
                expect(typeof editor[methodName]).toBe("function");
            });

            expect(editor.clipPos({line: 99, ch: 99})).toEqual({
                line: 2,
                ch: 5
            });
            editor.setOption("lineSeparator", "\r\n");
            expect(editor.splitLines("one\r\ntwo")).toEqual(["one", "two"]);
            expect(editor.phrase("Greeting")).toBe("Hello");

            editor.setCursor({line: 0, ch: 0});
            editor.addSelection(
                {line: 1, ch: 0},
                {line: 1, ch: 2}
            );
            expect(editor.listSelections().length).toBe(2);
            expect(editor.getSelection()).toBe("be");

            editor.setExtending(true);
            editor.extendSelections([
                {line: 0, ch: 2},
                {line: 1, ch: 4}
            ]);
            expect(editor.getExtending()).toBe(true);
            expect(editor.listSelections()[1].to().ch).toBe(4);
            editor.setExtending(false);

            let changesEventCount = 0;
            let operationChangeCount = 0;
            editor.on("changes", function (_codeMirror, changes) {
                changesEventCount++;
                operationChangeCount = changes.length;
            });
            editor.startOperation();
            editor.replaceRange("A", {line: 0, ch: 0}, {line: 0, ch: 1}, "+input");
            editor.replaceRange("B", {line: 1, ch: 0}, {line: 1, ch: 1}, "+input");
            expect(changesEventCount).toBe(0);
            editor.endOperation();
            expect(changesEventCount).toBe(1);
            expect(operationChangeCount).toBe(2);

            expect(editor.findPosH({line: 0, ch: 0}, 1, "char")).toEqual({
                line: 0,
                ch: 1
            });
            expect(editor.getLineHandleVisualStart(1)).toBe(editor.getLineHandle(1));

            editor.setValue(Array.from({length: 80}, function (_value, index) {
                return `line ${index}`;
            }).join("\n"));
            editor.setCursor({line: 0, ch: 0});
            await awaitsFor(function () {
                return holder.getBoundingClientRect().height > 0 &&
                    editor.defaultTextHeight() > 0;
            }, "CM6 compatibility editor should be measurable");
            const pagePosition = editor.findPosV(
                {line: 0, ch: 0},
                1,
                "page"
            );
            expect(pagePosition.line).toBeGreaterThan(0);

            const widget = window.document.createElement("span");
            widget.textContent = "widget";
            editor.addWidget({line: 0, ch: 0}, widget);
            expect(widget.parentElement).toBe(editor.getScrollerElement());

            let keyUpObserved = false;
            editor.on("keyup", function (_codeMirror, event) {
                keyUpObserved = event.key === "F12";
            });
            editor.triggerOnKeyUp(new window.KeyboardEvent("keyup", {
                key: "F12",
                bubbles: true
            }));
            expect(keyUpObserved).toBe(true);

            editor.setDirection("rtl");
            expect(editor.getWrapperElement().classList.contains("CodeMirror-rtl"))
                .toBe(true);
            editor.setOption("readOnly", true);
            expect(editor.isReadOnly()).toBe(true);
            editor.setOption("readOnly", false);
            editor.focus();
            await awaitsFor(function () {
                return editor.hasFocus();
            }, "CM6 compatibility editor should receive focus");
        });

        it("streams string search cursors with CodeMirror 5 line semantics", function () {
            const editor = createEditor([
                "Alpha",
                "middle",
                "Omega",
                "alpha",
                "middle",
                "omega",
                "café"
            ].join("\n"));
            let cursor = editor.getSearchCursor(
                "ALPHA\nMIDDLE\nOMEGA",
                {line: 0, ch: 0},
                {caseFold: true}
            );

            expect(cursor.findNext()).toBe(true);
            expect(cursor.from()).toEqual({line: 0, ch: 0});
            expect(cursor.to()).toEqual({line: 2, ch: 5});
            expect(cursor.findNext()).toBe(true);
            expect(cursor.from()).toEqual({line: 3, ch: 0});
            expect(cursor.to()).toEqual({line: 5, ch: 5});
            expect(cursor.findNext()).toBe(false);

            cursor = editor.getSearchCursor(
                "ALPHA\nMIDDLE\nOMEGA",
                {line: editor.lastLine(), ch: null},
                {caseFold: true}
            );
            expect(cursor.findPrevious()).toBe(true);
            expect(cursor.from()).toEqual({line: 3, ch: 0});
            expect(cursor.to()).toEqual({line: 5, ch: 5});

            cursor = editor.getSearchCursor(
                "cafe\u0301",
                {line: 0, ch: 0}
            );
            expect(cursor.findNext()).toBe(true);
            expect(cursor.from()).toEqual({line: 6, ch: 0});
            expect(cursor.to()).toEqual({line: 6, ch: 4});
        });

        it("does not rebuild the whole document for every string match", function () {
            const lineCount = 5000;
            const editor = createEditor(
                Array.from({length: lineCount}, function (_value, index) {
                    return `line ${index} needle value`;
                }).join("\n")
            );
            const originalGetValue = editor.getValue.bind(editor);
            let wholeDocumentReads = 0;
            editor.getValue = function (separator) {
                wholeDocumentReads++;
                return originalGetValue(separator);
            };

            const cursor = editor.getSearchCursor("needle");
            let matchCount = 0;
            while (cursor.findNext()) {
                matchCount++;
            }

            expect(matchCount).toBe(lineCount);
            expect(wholeDocumentReads).toBe(0);
        });

        it("installs idempotent Sublime keymaps and their CM6-backed commands", function () {
            const selectNextOccurrence = CodeMirror.commands.selectNextOccurrence;

            expect(CodeMirrorSublimeCompat.install(CodeMirror)).toBe(CodeMirror);
            expect(CodeMirrorSublimeCompat.install(CodeMirror)).toBe(CodeMirror);
            expect(CodeMirror.commands.selectNextOccurrence)
                .toBe(selectNextOccurrence);
            expect(CodeMirror.keyMap.macSublime["Cmd-D"])
                .toBe("selectNextOccurrence");
            expect(CodeMirror.keyMap.pcSublime["Ctrl-D"])
                .toBe("selectNextOccurrence");
            expect(CodeMirror.keyMap.pcSublime["Ctrl-K"])
                .toBe("...");
            expect(CodeMirror.keyMap.pcSublime["Ctrl-K Ctrl-U"])
                .toBe("upcaseAtCursor");
            expect(CodeMirror.keyMap.macSublime.fallthrough)
                .toBe("macDefault");
            expect(CodeMirror.keyMap.pcSublime.fallthrough)
                .toBe("pcDefault");
            expect([
                CodeMirror.keyMap.macSublime,
                CodeMirror.keyMap.pcSublime
            ]).toContain(CodeMirror.keyMap.sublime);

            [
                "addCursorToNextLine",
                "clearBookmarks",
                "duplicateLine",
                "findAllUnder",
                "goSubwordRight",
                "insertLineAfter",
                "joinLines",
                "selectBetweenBrackets",
                "selectNextOccurrence",
                "smartBackspace",
                "sortLinesInsensitive",
                "swapLineUp",
                "toggleBookmark"
            ].forEach(function (commandName) {
                expect(typeof CodeMirror.commands[commandName]).toBe("function");
            });
        });

        it("dispatches Sublime single-key and chord bindings through the adapter", function () {
            const editor = createEditor("alpha beta alpha alphabet", {
                keyMap: "pcSublime"
            });

            function keyDown(keyCode, key, options) {
                const event = Object.assign({
                    altKey: false,
                    ctrlKey: false,
                    defaultPrevented: false,
                    key: key,
                    keyCode: keyCode,
                    metaKey: false,
                    shiftKey: false,
                    preventDefault: function () {
                        this.defaultPrevented = true;
                    }
                }, options || {});
                const handled = editor.triggerOnKeyDown(event);
                expect(event.defaultPrevented).toBe(true);
                expect(handled).toBe(true);
            }

            editor.setCursor({line: 0, ch: 2});
            keyDown(68, "d", {ctrlKey: true});
            expect(editor.getSelection()).toBe("alpha");
            keyDown(68, "d", {ctrlKey: true});
            expect(editor.getSelections()).toEqual(["alpha", "alpha"]);

            editor.setSelection(
                {line: 0, ch: 6},
                {line: 0, ch: 10}
            );
            keyDown(75, "k", {ctrlKey: true});
            keyDown(85, "u", {ctrlKey: true});
            expect(editor.getValue()).toBe("alpha BETA alpha alphabet");
        });

        it("executes Sublime line editing commands against the CM6 document", function () {
            const editor = createEditor("one\ntwo\nthree");

            editor.setCursor({line: 1, ch: 1});
            CodeMirror.commands.swapLineUp(editor);
            expect(editor.getValue()).toBe("two\none\nthree");
            expect(editor.getCursor().line).toBe(0);

            CodeMirror.commands.swapLineDown(editor);
            expect(editor.getValue()).toBe("one\ntwo\nthree");
            expect(editor.getCursor().line).toBe(1);

            CodeMirror.commands.duplicateLine(editor);
            expect(editor.getValue()).toBe("one\ntwo\ntwo\nthree");

            editor.setCursor({line: 1, ch: 0});
            CodeMirror.commands.joinLines(editor);
            expect(editor.getValue()).toBe("one\ntwo two\nthree");

            editor.setValue("beta\nAlpha\ncharlie");
            editor.setSelection(
                {line: 0, ch: 0},
                {line: 2, ch: 7}
            );
            CodeMirror.commands.sortLinesInsensitive(editor);
            expect(editor.getValue()).toBe("Alpha\nbeta\ncharlie");
        });

        it("supports Sublime subword, indentation, bracket, and bookmark actions", function () {
            const editor = createEditor("fooBar\n    value\n(alpha)", {
                indentUnit: 4
            });

            editor.setCursor({line: 0, ch: 0});
            CodeMirror.commands.goSubwordRight(editor);
            expect(editor.getCursor()).toEqual({line: 0, ch: 3});
            CodeMirror.commands.goSubwordRight(editor);
            expect(editor.getCursor()).toEqual({line: 0, ch: 6});

            editor.setCursor({line: 1, ch: 4});
            CodeMirror.commands.smartBackspace(editor);
            expect(editor.getLine(1)).toBe("value");

            editor.setCursor({line: 2, ch: 3});
            CodeMirror.commands.selectBetweenBrackets(editor);
            expect(editor.getSelection()).toBe("alpha");

            editor.setCursor({line: 0, ch: 1});
            CodeMirror.commands.toggleBookmark(editor);
            editor.setCursor({line: 1, ch: 1});
            CodeMirror.commands.toggleBookmark(editor);
            expect(editor.state.sublimeBookmarks.length).toBe(2);
            CodeMirror.commands.nextBookmark(editor);
            expect(editor.getCursor()).toEqual({line: 0, ch: 1});
            CodeMirror.commands.clearBookmarks(editor);
            expect(editor.state.sublimeBookmarks.length).toBe(0);
        });

        it("creates and restores editors through fromTextArea", function () {
            const form = window.document.createElement("form");
            const textArea = window.document.createElement("textarea");
            textArea.value = "before";
            textArea.style.display = "inline-block";
            textArea.tabIndex = 7;
            textArea.placeholder = "placeholder";
            form.appendChild(textArea);
            window.document.body.appendChild(form);
            fixtures.push(form);

            const editor = CodeMirror.fromTextArea(textArea, {
                mode: "javascript",
                leaveSubmitMethodAlone: true
            });
            editors.push(editor);

            expect(textArea.style.display).toBe("none");
            expect(editor.getValue()).toBe("before");
            expect(editor.getOption("tabindex")).toBe(7);
            expect(editor.getTextArea()).toBe(textArea);

            editor.setValue("after");
            editor.save();
            expect(textArea.value).toBe("after");
            editor.toTextArea();
            expect(textArea.style.display).toBe("inline-block");
            expect(textArea.value).toBe("after");
        });
    });
});
