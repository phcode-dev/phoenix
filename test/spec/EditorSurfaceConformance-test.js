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

/*global describe, it, expect, afterEach, awaitsFor, spyOn */

define(function (require, exports, module) {

    const CodeMirror = require("editor/CodeMirrorCompat"),
        CM6 = require("thirdparty/CodeMirror6/codemirror6"),
        DocumentModule = require("document/Document"),
        Editor = require("editor/Editor").Editor,
        SpecRunnerUtils = require("spec/SpecRunnerUtils");

    const ENGINE_LABEL = "CodeMirror 6";
    const CM6_GUTTER_MARKER_WRAPPER_CLASS = "phoenix-cm6-gutter-marker-wrapper";
    const EVENT_NAMESPACE = ".editorSurfaceConformance";
    const LEGACY_VISIBLE_GUTTER_CLASS = "legacy-option-visible-gutter";
    const LEGACY_VIEWPORT_GUTTER_OPTION = "editorSurfaceLegacyViewportGutter";
    const LEGACY_VIEWPORT_MARKER_CLASS = "legacy-option-gutter-marker";
    const LINE_NUMBER_GUTTER = "CodeMirror-linenumbers";
    const TEST_GUTTER = "editor-surface-conformance-gutter";

    CodeMirror.defineOption(LEGACY_VIEWPORT_GUTTER_OPTION, false, function (codeMirror, enabled) {
        const previousRefresh = codeMirror.state.editorSurfaceLegacyViewportRefresh;
        if (previousRefresh) {
            codeMirror.off("viewportChange", previousRefresh);
            delete codeMirror.state.editorSurfaceLegacyViewportRefresh;
        }

        const gutterElement = codeMirror.getGutterElement();
        gutterElement.classList.remove(LEGACY_VISIBLE_GUTTER_CLASS);
        codeMirror.clearGutter(TEST_GUTTER);
        if (!enabled) {
            return;
        }

        gutterElement.classList.add(LEGACY_VISIBLE_GUTTER_CLASS);
        const refresh = function () {
            const viewport = codeMirror.getViewport();
            codeMirror.clearGutter(TEST_GUTTER);
            codeMirror.operation(function () {
                for (let line = viewport.from; line < viewport.to; line++) {
                    const marker = window.document.createElement("span");
                    marker.className = LEGACY_VIEWPORT_MARKER_CLASS;
                    marker.dataset.line = String(line);
                    codeMirror.setGutterMarker(line, TEST_GUTTER, marker);
                }
            });
        };
        codeMirror.state.editorSurfaceLegacyViewportRefresh = refresh;
        codeMirror.on("viewportChange", refresh);
        refresh();
    }, true);

    function plainPosition(position) {
        return {
            line: position.line,
            ch: position.ch
        };
    }

    function comparableSelections(editor) {
        return editor.getSelections().map(function (selection) {
            return {
                start: {
                    line: selection.start.line,
                    ch: selection.start.ch
                },
                end: {
                    line: selection.end.line,
                    ch: selection.end.ch
                },
                reversed: selection.reversed,
                primary: selection.primary
            };
        });
    }

    function tokenTypes(mode, text) {
        const state = CodeMirror.startState(mode);
        const stream = new CodeMirror.StringStream(text, 4);
        const tokens = [];
        while (!stream.eol()) {
            stream.start = stream.pos;
            let type;
            for (let attempt = 0; attempt < 10; attempt++) {
                type = mode.token(stream, state);
                if (stream.pos > stream.start) {
                    break;
                }
            }
            expect(stream.pos).toBeGreaterThan(stream.start);
            tokens.push({
                string: stream.current(),
                type: type,
                state: CodeMirror.copyState(mode, state)
            });
        }
        return tokens;
    }

    describe("Editor Surface Conformance", function () {
        describe(ENGINE_LABEL, function () {
                let editor;
                let testDocument;
                let secondaryEditor;
                let secondaryHolder;
                let standaloneCodeMirror;
                let compatibilityStyle;

                function createEditor(content, languageId = "javascript") {
                    const mocks = SpecRunnerUtils.createMockEditor(
                        content,
                        languageId
                    );
                    editor = mocks.editor;
                    testDocument = mocks.doc;
                    return mocks;
                }

                function showEditor(width = 600, height = 180) {
                    const root = editor.getRootElement();
                    root.parentElement.style.display = "block";
                    root.parentElement.style.height = `${height}px`;
                    root.parentElement.style.left = "0";
                    root.parentElement.style.top = "0";
                    editor.setSize(width, height);
                    editor.refresh();
                    return root;
                }

                afterEach(function () {
                    DocumentModule.off(EVENT_NAMESPACE);
                    if (secondaryEditor) {
                        secondaryEditor.destroy();
                        secondaryEditor = null;
                    }
                    if (standaloneCodeMirror) {
                        standaloneCodeMirror.destroy();
                        standaloneCodeMirror = null;
                    }
                    if (secondaryHolder) {
                        secondaryHolder.remove();
                        secondaryHolder = null;
                    }
                    if (compatibilityStyle) {
                        compatibilityStyle.remove();
                        compatibilityStyle = null;
                    }
                    if (editor) {
                        SpecRunnerUtils.destroyMockEditor(testDocument);
                        editor = null;
                        testDocument = null;
                    }
                    if (Editor.isGutterRegistered(TEST_GUTTER)) {
                        Editor.unregisterGutter(TEST_GUTTER);
                    }
                });

                it("creates the CodeMirror 6 backend with a usable editor surface", function () {
                    createEditor("const answer = 42;\n");

                    const root = editor.getRootElement();
                    const scroller = editor.getScrollerElement();
                    const codeMirror = editor._codeMirror;
                    const input = codeMirror.getInputField();

                    expect(editor.getEditorEngine()).toBe("codemirror6");
                    expect(editor.document.getText()).toBe("const answer = 42;\n");
                    expect(codeMirror.getOption("inputStyle")).toBe("contenteditable");
                    expect(input.getAttribute("contenteditable")).toBe("true");
                    expect(root).toBeTruthy();
                    expect(scroller).toBeTruthy();
                    expect(root === scroller || root.contains(scroller)).toBe(true);

                    expect(root.classList.contains("cm-editor")).toBe(true);
                    expect(root.dataset.editorEngine).toBe("codemirror6");
                    expect(scroller.classList.contains("CodeMirror-scroll")).toBe(true);
                    expect(scroller.classList.contains("CodeMirror-lines")).toBe(true);
                    expect(scroller.querySelector(".CodeMirror-code"))
                        .toBe(editor._codeMirror.getLineSpaceElement());

                    showEditor();
                    expect(window.getComputedStyle(scroller).pointerEvents).toBe("auto");
                    expect(window.getComputedStyle(scroller).paddingTop).toBe("0px");
                    const rootBounds = root.getBoundingClientRect();
                    const scrollerBounds = scroller.getBoundingClientRect();
                    expect(scroller.clientHeight).toBeGreaterThan(0);
                    expect(Math.abs(scrollerBounds.height - rootBounds.height))
                        .toBeLessThan(2);
                });

                it("keeps legacy minimap and ruler DOM selectors safe", async function () {
                    createEditor(
                        "const first = 1;\n" +
                        "const longestEditorSurfaceLine = first + 2;\n" +
                        "const last = longestEditorSurfaceLine;\n"
                    );

                    const root = showEditor();
                    const scroller = editor.getScrollerElement();
                    await awaitsFor(function () {
                        const sizer = root.querySelector(
                            '[data-phoenix-cm6-legacy-proxy="sizer"]'
                        );
                        return sizer &&
                            parseFloat(sizer.style.height) > 0 &&
                            parseFloat(sizer.style.width) > 0;
                    }, `${ENGINE_LABEL} legacy geometry proxy should be measured`);

                    const sizer = root.querySelector(
                        '[data-phoenix-cm6-legacy-proxy="sizer"]'
                    );
                    const lines = sizer.querySelector(".CodeMirror-lines");
                    const measurement = root.querySelector(".CodeMirror pre");
                    const verticalScrollbar = root.querySelector(
                        '[data-phoenix-cm6-legacy-proxy="vertical-scrollbar"]'
                    );

                    expect(root.querySelector(".CodeMirror-sizer")).toBe(sizer);
                    expect(lines).toBeTruthy();
                    expect(Number.isFinite(parseFloat(
                        window.getComputedStyle(lines).paddingBottom
                    ))).toBe(true);
                    expect(measurement).toBeTruthy();
                    expect(Number.isFinite(parseFloat(
                        window.getComputedStyle(measurement).paddingLeft
                    ))).toBe(true);
                    expect(verticalScrollbar).toBeTruthy();
                    expect(verticalScrollbar).not.toBe(scroller);
                    expect(root.querySelectorAll(".CodeMirror-vscrollbar").length)
                        .toBe(1);

                    verticalScrollbar.classList.add("minimap-scrollbar-hide");
                    expect(scroller.classList.contains("minimap-scrollbar-hide"))
                        .toBe(false);
                });

                it("preserves legacy cursor and selection classes across CM6 redraws", async function () {
                    createEditor("alpha\nbeta\ngamma");
                    const root = showEditor();
                    compatibilityStyle = window.document.createElement("style");
                    compatibilityStyle.textContent = [
                        ".CodeMirror-cursor { --legacy-cursor-style: applied; }",
                        ".CodeMirror-selected { --legacy-selection-style: applied; }"
                    ].join("\n");
                    window.document.head.appendChild(compatibilityStyle);

                    editor.focus();
                    editor.setCursorPos({ line: 0, ch: 1 });
                    await awaitsFor(function () {
                        const cursor = root.querySelector(".cm-cursor");
                        return cursor &&
                            cursor.classList.contains("CodeMirror-cursor");
                    }, `${ENGINE_LABEL} cursor should receive its legacy class`);

                    let cursor = root.querySelector(".cm-cursor");
                    expect(window.getComputedStyle(cursor)
                        .getPropertyValue("--legacy-cursor-style").trim())
                        .toBe("applied");

                    editor.setCursorPos({ line: 1, ch: 2 });
                    await awaitsFor(function () {
                        const currentCursors = Array.from(
                            root.querySelectorAll(".cm-cursor")
                        );
                        return currentCursors.length > 0 &&
                            currentCursors.every(function (element) {
                                return element.classList.contains("CodeMirror-cursor");
                            });
                    }, `${ENGINE_LABEL} redrawn cursors should retain the legacy class`);

                    editor.setSelection(
                        { line: 0, ch: 1 },
                        { line: 2, ch: 3 }
                    );
                    await awaitsFor(function () {
                        const selections = Array.from(
                            root.querySelectorAll(".cm-selectionBackground")
                        );
                        return selections.length > 0 &&
                            selections.every(function (element) {
                                return element.classList.contains("CodeMirror-selected");
                            });
                    }, `${ENGINE_LABEL} selections should receive their legacy class`);

                    const selection = root.querySelector(".cm-selectionBackground");
                    expect(window.getComputedStyle(selection)
                        .getPropertyValue("--legacy-selection-style").trim())
                        .toBe("applied");
                });

                it("preserves the callable CodeMirror constructor for detached editors", function () {
                    secondaryHolder = SpecRunnerUtils.createMockElement()
                        .css({ width: "600px", height: "180px" });
                    let placedWrapper;

                    standaloneCodeMirror = new CodeMirror(function (wrapper) {
                        placedWrapper = wrapper;
                        secondaryHolder.get(0).appendChild(wrapper);
                    }, {
                        value: "a { color: red; }",
                        mode: "css"
                    });

                    expect(standaloneCodeMirror.isCodeMirror6).toBe(true);
                    expect(placedWrapper).toBe(standaloneCodeMirror.getWrapperElement());
                    expect(standaloneCodeMirror.getValue()).toBe("a { color: red; }");
                    expect(standaloneCodeMirror.getTokenAt({ line: 0, ch: 6 }).type)
                        .toContain("property");
                });

                it("maps legacy tab indentation widths to CM6 indent units", function () {
                    secondaryHolder = SpecRunnerUtils.createMockElement()
                        .css({ width: "600px", height: "180px" });

                    standaloneCodeMirror = new CodeMirror(function (wrapper) {
                        secondaryHolder.get(0).appendChild(wrapper);
                    }, {
                        value: "\t\tconsole.log();",
                        mode: "javascript",
                        tabSize: 4,
                        indentUnit: 8,
                        indentWithTabs: true
                    });

                    expect(standaloneCodeMirror._view.state.facet(CM6.indentUnit))
                        .toBe("\t\t");
                    standaloneCodeMirror.setOption("indentUnit", 6);
                    expect(standaloneCodeMirror._view.state.facet(CM6.indentUnit))
                        .toBe("      ");
                    standaloneCodeMirror.setOption("tabSize", 6);
                    expect(standaloneCodeMirror._view.state.facet(CM6.indentUnit))
                        .toBe("\t");
                    standaloneCodeMirror.setOption("tabSize", 4);
                    expect(standaloneCodeMirror._view.state.facet(CM6.indentUnit))
                        .toBe("      ");
                    standaloneCodeMirror.setOption("indentUnit", 16);
                    expect(standaloneCodeMirror._view.state.facet(CM6.indentUnit))
                        .toBe("\t\t\t\t");
                    standaloneCodeMirror.setOption("tabSize", 8);
                    expect(standaloneCodeMirror._view.state.facet(CM6.indentUnit))
                        .toBe("\t\t");
                });

                it("matches CM5 option handler and optionChange semantics", function () {
                    const optionName = "editorSurfaceOptionChangeParity";
                    let handlerCalls = 0;
                    const changedOptions = [];

                    CodeMirror.defineOption(optionName, 1, function () {
                        handlerCalls++;
                    }, true);

                    secondaryHolder = SpecRunnerUtils.createMockElement()
                        .css({ width: "600px", height: "180px" });
                    standaloneCodeMirror = new CodeMirror(function (wrapper) {
                        secondaryHolder.get(0).appendChild(wrapper);
                    }, {
                        value: "option parity",
                        mode: "javascript"
                    });
                    standaloneCodeMirror.on("optionChange", function (_codeMirror, changedOption) {
                        changedOptions.push(changedOption);
                    });

                    standaloneCodeMirror.setOption(optionName, 1);
                    standaloneCodeMirror.setOption(optionName, "1");
                    expect(handlerCalls).toBe(0);
                    expect(changedOptions).toEqual([]);
                    expect(standaloneCodeMirror.getOption(optionName)).toBe(1);

                    standaloneCodeMirror.setOption(optionName, 2);
                    expect(handlerCalls).toBe(1);
                    expect(changedOptions).toEqual([optionName]);
                    expect(standaloneCodeMirror.getOption(optionName)).toBe(2);

                    standaloneCodeMirror.setOption("mode", "javascript");
                    expect(changedOptions).toEqual([optionName, "mode"]);
                });

                it("requests one scroll for cursor and selection setters", function () {
                    createEditor("one\ntwo\nthree");

                    const codeMirror = editor._codeMirror;
                    spyOn(codeMirror, "scrollIntoView");

                    codeMirror.setCursor({ line: 1, ch: 1 });
                    expect(codeMirror.scrollIntoView.calls.count()).toBe(1);

                    codeMirror.scrollIntoView.calls.reset();
                    codeMirror.setSelection(
                        { line: 0, ch: 1 },
                        { line: 2, ch: 2 }
                    );
                    expect(codeMirror.scrollIntoView.calls.count()).toBe(1);

                    codeMirror.scrollIntoView.calls.reset();
                    codeMirror.setCursor(
                        { line: 0, ch: 0 },
                        { scroll: false }
                    );
                    expect(codeMirror.scrollIntoView).not.toHaveBeenCalled();
                });

                it("snapshots absolute scroll positions for pending CM6 layout changes", async function () {
                    createEditor(
                        Array.from({length: 80}, function (_value, index) {
                            return `line ${index}`;
                        }).join("\n")
                    );
                    showEditor(300, 90);

                    const codeMirror = editor._codeMirror;
                    const scrollSnapshot = spyOn(
                        codeMirror._view,
                        "scrollSnapshot"
                    ).and.callThrough();

                    codeMirror.scrollTo(null, 240);

                    expect(scrollSnapshot.calls.count()).toBe(1);
                    await awaitsFor(function () {
                        return Math.abs(codeMirror.getScrollInfo().top - 240) < 1;
                    }, `${ENGINE_LABEL} absolute scroll should survive pending layout`);
                });

                it("honors CM5 auto-close bracket enablement and configurations", async function () {
                    createEditor("()");

                    const codeMirror = editor._codeMirror;
                    showEditor();
                    codeMirror.focus();
                    codeMirror.setCursor({ line: 0, ch: 1 });
                    codeMirror.setOption("autoCloseBrackets", false);
                    codeMirror.getInputField().dispatchEvent(
                        new window.KeyboardEvent("keydown", {
                            bubbles: true,
                            cancelable: true,
                            code: "Backspace",
                            key: "Backspace",
                            keyCode: 8
                        })
                    );
                    await awaitsFor(function () {
                        return codeMirror.getValue() === ")";
                    }, `${ENGINE_LABEL} disabled auto-close should delete one bracket`);

                    codeMirror.setOption("mode", null);
                    codeMirror.setValue("x");
                    codeMirror.setCursor({ line: 0, ch: 0 });
                    codeMirror.setOption("autoCloseBrackets", {
                        closeBefore: "",
                        override: true,
                        pairs: "<>"
                    });
                    const blockedEvent = {
                        altKey: false,
                        charCode: "<".charCodeAt(0),
                        ctrlKey: false,
                        defaultPrevented: false,
                        keyCode: "<".charCodeAt(0),
                        metaKey: false,
                        preventDefault: function () {
                            this.defaultPrevented = true;
                        },
                        shiftKey: false
                    };
                    expect(codeMirror.triggerOnKeyPress(blockedEvent)).toBe(false);
                    expect(codeMirror.getValue()).toBe("x");

                    codeMirror.setOption("autoCloseBrackets", {
                        closeBefore: "x",
                        override: true,
                        pairs: "<>"
                    });
                    expect(codeMirror.triggerOnKeyPress(blockedEvent)).toBe(true);
                    expect(codeMirror.getValue()).toBe("<>x");

                    codeMirror.setValue("");
                    codeMirror.setCursor({ line: 0, ch: 0 });
                    codeMirror.setOption("autoCloseBrackets", "()");
                    const parenthesisEvent = Object.assign({}, blockedEvent, {
                        charCode: "(".charCodeAt(0),
                        defaultPrevented: false,
                        keyCode: "(".charCodeAt(0)
                    });
                    expect(codeMirror.triggerOnKeyPress(parenthesisEvent)).toBe(true);
                    expect(codeMirror.getValue()).toBe("()");

                    codeMirror.setValue("{}");
                    codeMirror.setCursor({ line: 0, ch: 1 });
                    codeMirror.setOption("autoCloseBrackets", {
                        explode: "{}",
                        override: true,
                        pairs: "{}"
                    });
                    const enterEvent = {
                        altKey: false,
                        ctrlKey: false,
                        defaultPrevented: false,
                        key: "Enter",
                        keyCode: 13,
                        metaKey: false,
                        preventDefault: function () {
                            this.defaultPrevented = true;
                        },
                        shiftKey: false
                    };
                    expect(codeMirror.triggerOnKeyDown(enterEvent)).toBe(true);
                    expect(codeMirror.getValue()).toBe("{\n\n}");
                    expect(codeMirror.getCursor()).toEqual({
                        line: 1,
                        ch: 0
                    });
                });

                it("supports arbitrary CM5 auto-close bracket pair mappings", function () {
                    createEditor("x");

                    const codeMirror = editor._codeMirror;
                    const keyPress = function (character) {
                        return {
                            altKey: false,
                            charCode: character.charCodeAt(0),
                            ctrlKey: false,
                            defaultPrevented: false,
                            keyCode: character.charCodeAt(0),
                            metaKey: false,
                            preventDefault: function () {
                                this.defaultPrevented = true;
                            },
                            shiftKey: false
                        };
                    };
                    codeMirror.setOption("mode", null);
                    codeMirror.setOption("autoCloseBrackets", {
                        closeBefore: "x",
                        override: true,
                        pairs: "ab"
                    });
                    codeMirror.setCursor({ line: 0, ch: 0 });

                    expect(codeMirror.triggerOnKeyPress(keyPress("a"))).toBe(true);
                    expect(codeMirror.getValue()).toBe("abx");
                    expect(codeMirror.getCursor()).toEqual({
                        line: 0,
                        ch: 1
                    });

                    expect(codeMirror.triggerOnKeyPress(keyPress("b"))).toBe(true);
                    expect(codeMirror.getValue()).toBe("abx");
                    expect(codeMirror.getCursor()).toEqual({
                        line: 0,
                        ch: 2
                    });

                    codeMirror.setValue("word");
                    codeMirror.setSelection(
                        { line: 0, ch: 0 },
                        { line: 0, ch: 4 }
                    );
                    expect(codeMirror.triggerOnKeyPress(keyPress("a"))).toBe(true);
                    expect(codeMirror.getValue()).toBe("awordb");
                    expect(codeMirror.getSelection()).toBe("word");

                    codeMirror.setValue("ab");
                    codeMirror.setCursor({ line: 0, ch: 1 });
                    const backspace = {
                        altKey: false,
                        ctrlKey: false,
                        defaultPrevented: false,
                        key: "Backspace",
                        keyCode: 8,
                        metaKey: false,
                        preventDefault: function () {
                            this.defaultPrevented = true;
                        },
                        shiftKey: false
                    };
                    expect(codeMirror.triggerOnKeyDown(backspace)).toBe(true);
                    expect(codeMirror.getValue()).toBe("");

                    codeMirror.setValue("ab");
                    codeMirror.setCursor({ line: 0, ch: 1 });
                    let keydownCount = 0;
                    const onKeydown = function () {
                        keydownCount++;
                    };
                    codeMirror.on("keydown", onKeydown);
                    codeMirror.getInputField().dispatchEvent(
                        new window.KeyboardEvent("keydown", {
                            bubbles: true,
                            cancelable: true,
                            code: "Backspace",
                            key: "Backspace",
                            keyCode: 8
                        })
                    );
                    codeMirror.off("keydown", onKeydown);
                    expect(codeMirror.getValue()).toBe("");
                    expect(keydownCount).toBe(1);
                });

                it("uses CM5 bracket matching limits and option lifecycle", async function () {
                    createEditor("(\n)");

                    const root = showEditor();
                    const codeMirror = editor._codeMirror;
                    codeMirror.focus();
                    codeMirror.setCursor({ line: 0, ch: 1 });
                    codeMirror.setOption("matchBrackets", {
                        maxScanLineLength: 50000,
                        maxScanLines: 1
                    });
                    expect(codeMirror.state.matchBrackets.maxScanLines).toBe(1);
                    expect(root.querySelector(".CodeMirror-matchingbracket")).toBeNull();

                    codeMirror.setOption("matchBrackets", {
                        maxScanLineLength: 50000,
                        maxScanLines: 2
                    });
                    await awaitsFor(function () {
                        return root.querySelectorAll(
                            ".CodeMirror-matchingbracket"
                        ).length === 2;
                    }, `${ENGINE_LABEL} bracket matcher should honor CM5 scan limits`);

                    codeMirror.getInputField().blur();
                    await awaitsFor(function () {
                        return !root.querySelector(".CodeMirror-matchingbracket");
                    }, `${ENGINE_LABEL} bracket matcher should clear on blur`);
                    codeMirror.focus();
                    await awaitsFor(function () {
                        return root.querySelectorAll(
                            ".CodeMirror-matchingbracket"
                        ).length === 2;
                    }, `${ENGINE_LABEL} bracket matcher should restore on focus`);

                    codeMirror.setOption("matchBrackets", false);
                    expect(codeMirror.state.matchBrackets).toBeNull();
                    await awaitsFor(function () {
                        return !root.querySelector(".CodeMirror-matchingbracket");
                    }, `${ENGINE_LABEL} disabled bracket matcher should clear highlights`);
                });

                it("matches CM5 selection highlighting option semantics and class names", async function () {
                    createEditor("foo food foo\nbar bar");

                    const root = showEditor();
                    const codeMirror = editor._codeMirror;
                    codeMirror.focus();
                    codeMirror.setOption("highlightSelectionMatches", true);
                    codeMirror.setSelection(
                        { line: 0, ch: 0 },
                        { line: 0, ch: 1 }
                    );
                    expect(root.querySelector(".cm-matchhighlight")).toBeNull();

                    codeMirror.setSelection(
                        { line: 0, ch: 0 },
                        { line: 0, ch: 3 }
                    );
                    await awaitsFor(function () {
                        return root.querySelectorAll(".cm-matchhighlight").length === 3;
                    }, `${ENGINE_LABEL} selected text matches should use the legacy class`);

                    codeMirror.setOption("highlightSelectionMatches", {
                        minChars: 1,
                        wordsOnly: true
                    });
                    codeMirror.setSelection(
                        { line: 0, ch: 4 },
                        { line: 0, ch: 7 }
                    );
                    await awaitsFor(function () {
                        return !root.querySelector(".cm-matchhighlight");
                    }, `${ENGINE_LABEL} wordsOnly should reject a partial word`);

                    codeMirror.setOption("highlightSelectionMatches", {
                        showToken: true
                    });
                    codeMirror.setCursor({ line: 1, ch: 1 });
                    await awaitsFor(function () {
                        return root.querySelectorAll(".cm-matchhighlight").length === 2;
                    }, `${ENGINE_LABEL} showToken should highlight the token at the cursor`);
                });

                it("supports CM5 scrollbar annotations for selection matches", async function () {
                    const lines = [];
                    for (let line = 0; line < 60; line++) {
                        lines.push(line % 10 === 0 ? "needle" : `line ${line}`);
                    }
                    createEditor(lines.join("\n"));

                    const root = showEditor(600, 100);
                    const codeMirror = editor._codeMirror;
                    const directAnnotation = codeMirror.showMatchesOnScrollbar(
                        "needle",
                        false,
                        {className: "direct-scrollbar-match"}
                    );
                    expect(directAnnotation.matches.length).toBe(6);
                    await awaitsFor(function () {
                        return Boolean(
                            root.querySelector(".direct-scrollbar-match")
                        );
                    }, `${ENGINE_LABEL} direct scrollbar annotations should render`);

                    codeMirror.replaceRange(
                        "needle\n",
                        {line: 1, ch: 0}
                    );
                    await awaitsFor(function () {
                        return directAnnotation.matches.length === 7;
                    }, `${ENGINE_LABEL} scrollbar searches should refresh after changes`);
                    directAnnotation.clear();
                    expect(root.querySelector(".direct-scrollbar-match")).toBeNull();

                    codeMirror.focus();
                    codeMirror.setOption("highlightSelectionMatches", {
                        annotateScrollbar: true,
                        delay: 0,
                        minChars: 1
                    });
                    codeMirror.setSelection(
                        {line: 0, ch: 0},
                        {line: 0, ch: 6}
                    );
                    await awaitsFor(function () {
                        return Boolean(root.querySelector(
                            ".CodeMirror-selection-highlight-scrollbar"
                        ));
                    }, `${ENGINE_LABEL} selection matches should annotate the scrollbar`);

                    codeMirror.setOption("highlightSelectionMatches", false);
                    expect(root.querySelector(
                        ".CodeMirror-selection-highlight-scrollbar"
                    )).toBeNull();
                });

                it("matches CM5 active-line rules for non-empty selections", async function () {
                    createEditor("alpha\nbeta");

                    const root = showEditor();
                    const codeMirror = editor._codeMirror;
                    codeMirror.setOption("lineNumbers", true);
                    codeMirror.setOption("styleActiveLine", false);
                    codeMirror.setSelection(
                        { line: 0, ch: 0 },
                        { line: 0, ch: 3 }
                    );
                    codeMirror.setOption("styleActiveLine", true);
                    expect(root.querySelector(".cm-activeLine")).toBeNull();
                    expect(root.querySelector(".cm-activeLineGutter")).toBeNull();

                    codeMirror.setOption("styleActiveLine", {
                        nonEmpty: true
                    });
                    await awaitsFor(function () {
                        return Boolean(
                            root.querySelector(".cm-activeLine") &&
                            root.querySelector(".cm-activeLineGutter")
                        );
                    }, `${ENGINE_LABEL} same-line selections should activate line and gutter`);
                    expect(codeMirror.lineInfo(0).wrapClass)
                        .toContain("CodeMirror-activeline");

                    codeMirror.setSelection(
                        { line: 0, ch: 1 },
                        { line: 1, ch: 1 }
                    );
                    await awaitsFor(function () {
                        return !root.querySelector(".cm-activeLine") &&
                            !root.querySelector(".cm-activeLineGutter");
                    }, `${ENGINE_LABEL} multi-line selections should not activate a line`);
                });

                it("keeps deferred compatibility reads safe after destroy", function () {
                    secondaryHolder = SpecRunnerUtils.createMockElement()
                        .css({ width: "600px", height: "180px" });

                    standaloneCodeMirror = new CodeMirror(function (wrapper) {
                        secondaryHolder.get(0).appendChild(wrapper);
                    }, {
                        value: "const answer = 42;",
                        mode: "javascript"
                    });
                    const destroyedCodeMirror = standaloneCodeMirror;
                    destroyedCodeMirror.destroy();
                    standaloneCodeMirror = null;

                    expect(destroyedCodeMirror.lineCount()).toBe(0);
                    expect(destroyedCodeMirror.indexFromPos({ line: 0, ch: 1 })).toBe(0);
                    expect(destroyedCodeMirror.getTokenAt({ line: 0, ch: 1 }).type).toBeNull();
                    expect(function () {
                        destroyedCodeMirror.getHelpers({ line: 0, ch: 0 }, "fold");
                        destroyedCodeMirror.charCoords({ line: 0, ch: 0 }, "local");
                        destroyedCodeMirror.getScrollInfo();
                    }).not.toThrow();
                });

                it("normalizes CM6 stream parsers to the CM5 mode contract", function () {
                    const javascriptMode = CodeMirror.getMode(
                        { indentUnit: 4 },
                        "javascript"
                    );
                    const javascriptTokens = tokenTypes(
                        javascriptMode,
                        "/pattern/; const fn = (local) => local;"
                    );
                    expect(javascriptMode.lineComment).toBe("//");
                    expect(javascriptMode.blockCommentStart).toBe("/*");
                    expect(javascriptMode.blockCommentEnd).toBe("*/");
                    expect(javascriptMode.helperType).toBe("javascript");
                    expect(javascriptTokens.find(function (token) {
                        return token.string === "/pattern/";
                    }).type).toBe("string-2");
                    expect(javascriptTokens.filter(function (token) {
                        return token.string === "local";
                    })[1].type).toBe("variable-2");

                    const cssMode = CodeMirror.getMode(
                        { indentUnit: 4 },
                        "css"
                    );
                    const cssTokens = tokenTypes(
                        cssMode,
                        "a { color: var(--accent); }"
                    );
                    expect(cssMode.blockCommentStart).toBe("/*");
                    expect(cssMode.blockCommentEnd).toBe("*/");
                    expect(cssTokens.find(function (token) {
                        return token.string === "var";
                    }).type).toBe("variable callee");
                    expect(cssTokens.find(function (token) {
                        return token.string === "--accent";
                    }).type).toBe("variable-2");

                    const xmlMode = CodeMirror.getMode(
                        { indentUnit: 4 },
                        "application/xml"
                    );
                    const xmlTokens = tokenTypes(xmlMode, "<tag/>");
                    expect(xmlMode.blockCommentStart).toBe("<!--");
                    expect(xmlMode.blockCommentEnd).toBe("-->");
                    expect(xmlTokens[0].type).toBe("tag bracket");
                    expect(xmlTokens[1].type).toBe("tag");
                    expect(xmlTokens[2].type).toBe("tag bracket");

                    const markdownMode = CodeMirror.getMode({}, "markdown");
                    const markdownTokens = tokenTypes(
                        markdownMode,
                        "## Heading"
                    );
                    expect(markdownMode.fold).toBe("markdown");
                    expect(markdownMode.helperType).toBe("markdown");
                    expect(markdownTokens[0].type).toContain("header");
                    expect(markdownTokens[0].type).toContain("header-2");

                    const gfmMode = CodeMirror.getMode({}, "gfm");
                    const gfmTokens = tokenTypes(
                        gfmMode,
                        "~~removed~~ https://example.com"
                    );
                    expect(gfmTokens.some(function (token) {
                        return token.type === "strikethrough";
                    })).toBe(true);
                    expect(gfmTokens.some(function (token) {
                        return token.type === "link";
                    })).toBe(true);
                });

                it("preserves JSX, TSX, and embedded script token semantics", async function () {
                    const jsxMode = CodeMirror.getMode({}, "jsx");
                    const jsxTokens = tokenTypes(
                        jsxMode,
                        "const view = <Panel title={name}>Hi</Panel>;"
                    );
                    expect(jsxTokens.filter(function (token) {
                        return token.string === "Panel";
                    }).every(function (token) {
                        return token.type === "tag";
                    })).toBe(true);
                    expect(jsxTokens.find(function (token) {
                        return token.string === "title";
                    }).type).toBe("attribute");

                    const tsxMode = CodeMirror.getMode({}, "text/typescript-jsx");
                    const tsxTokens = tokenTypes(
                        tsxMode,
                        "interface Props { value: string }"
                    );
                    expect(tsxTokens.find(function (token) {
                        return token.string === "interface";
                    }).type).toBe("keyword");

                    const mixedMime = "text/x-editor-surface-html";
                    CodeMirror.defineMIME(mixedMime, {
                        name: "htmlmixed",
                        scriptTypes: [{
                            matches: /^text\/jsx$/i,
                            mode: "jsx"
                        }]
                    });
                    const mixedMode = CodeMirror.getMode({}, mixedMime);
                    const mixedTokens = tokenTypes(
                        mixedMode,
                        "<script type=\"text/jsx\">const view = <Panel />;</script>"
                    );
                    expect(mixedTokens.find(function (token) {
                        return token.string === "Panel";
                    }).type).toBe("tag");

                    secondaryHolder = SpecRunnerUtils.createMockElement()
                        .css({ width: "600px", height: "180px" });
                    standaloneCodeMirror = new CodeMirror(secondaryHolder.get(0), {
                        value: "<script type=\"text/jsx\">const view = <Panel />;</script>",
                        mode: mixedMime
                    });
                    standaloneCodeMirror.refresh();
                    await awaitsFor(function () {
                        return Array.from(
                            standaloneCodeMirror.getWrapperElement()
                                .querySelectorAll(".cm-tag")
                        ).some(function (element) {
                            return element.textContent === "Panel";
                        });
                    }, `${ENGINE_LABEL} should render configured JSX script regions`);
                });

                it("preserves EJS and ERB embedded-language regions", async function () {
                    const ejsMode = CodeMirror.getMode({}, "application/x-ejs");
                    const ejsTokens = tokenTypes(
                        ejsMode,
                        "<div><% const total = 1; %><%= total %></div>"
                    );
                    const ejsTotal = ejsTokens.filter(function (token) {
                        return token.string === "total";
                    }).pop();
                    expect(ejsTotal.type).toContain("variable");
                    expect(CodeMirror.innerMode(
                        ejsMode,
                        ejsTotal.state
                    ).mode.name).toBe("javascript");

                    const erbMode = CodeMirror.getMode({}, "application/x-erb");
                    const erbTokens = tokenTypes(
                        erbMode,
                        "<div><% if ready %>shown<% end %></div>"
                    );
                    const erbValue = erbTokens.find(function (token) {
                        return token.string === "ready";
                    });
                    expect(erbValue.type).toContain("variable");
                    expect(CodeMirror.innerMode(
                        erbMode,
                        erbValue.state
                    ).mode.name).toBe("ruby");

                    secondaryHolder = SpecRunnerUtils.createMockElement()
                        .css({ width: "600px", height: "180px" });
                    standaloneCodeMirror = new CodeMirror(secondaryHolder.get(0), {
                        value: "<div><% const total = 1; %></div>",
                        mode: "application/x-ejs"
                    });
                    standaloneCodeMirror.refresh();
                    await awaitsFor(function () {
                        return Array.from(
                            standaloneCodeMirror.getWrapperElement()
                                .querySelectorAll(".cm-keyword")
                        ).some(function (element) {
                            return element.textContent === "const";
                        });
                    }, `${ENGINE_LABEL} should render EJS script regions`);
                });

                it("preserves PHP mixed-language regions on the CM6 surface", function () {
                    createEditor(
                        "<?php\n" +
                        "$value = \"?> stays PHP\";\n" +
                        "?>\n" +
                        "<div>html</div>\n" +
                        "<?= $value ?>\n" +
                        "<? echo $value; ?>\n",
                        "php"
                    );

                    function expectLanguageAt(position, modeName, languageId) {
                        editor.setCursorPos(position);
                        const mode = editor.getModeForSelection();
                        expect(typeof mode === "string" ? mode : mode.name).toBe(modeName);
                        expect(editor.getLanguageForSelection().getId()).toBe(languageId);
                    }

                    expect(editor.getEditorEngine()).toBe("codemirror6");
                    expectLanguageAt({ line: 1, ch: 2 }, "clike", "php");
                    expectLanguageAt({ line: 1, ch: 14 }, "clike", "php");
                    expectLanguageAt({ line: 3, ch: 6 }, "html", "html");
                    expectLanguageAt({ line: 4, ch: 5 }, "clike", "php");
                    expectLanguageAt({ line: 5, ch: 5 }, "clike", "php");
                });

                it("preserves CM5 token boundaries, parser state, and custom-mode rendering", async function () {
                    const modeName = "editor-surface-token-state";
                    const observedStreamMethods = {};
                    spyOn(window.console, "warn").and.callThrough();
                    CodeMirror.defineMode(modeName, function () {
                        return {
                            startState: function () {
                                return {
                                    blankLines: 0
                                };
                            },
                            copyState: function (state) {
                                return {
                                    blankLines: state.blankLines
                                };
                            },
                            token: function (stream) {
                                observedStreamMethods.hideFirstChars =
                                    typeof stream.hideFirstChars === "function";
                                observedStreamMethods.lookAhead =
                                    typeof stream.lookAhead === "function";
                                observedStreamMethods.baseToken =
                                    typeof stream.baseToken === "function";
                                stream.skipToEnd();
                                return stream.string === "alpha" ?
                                    "editor-surface-custom-token keyword" :
                                    "keyword";
                            },
                            blankLine: function (state) {
                                state.blankLines++;
                            }
                        };
                    });

                    secondaryHolder = SpecRunnerUtils.createMockElement()
                        .css({ width: "600px", height: "180px" });
                    standaloneCodeMirror = new CodeMirror(secondaryHolder.get(0), {
                        value: "alpha\n\nomega",
                        mode: modeName
                    });

                    const lineStartToken = standaloneCodeMirror.getTokenAt({
                        line: 0,
                        ch: 0
                    }, true);
                    expect(lineStartToken.start).toBe(0);
                    expect(lineStartToken.end).toBe(0);
                    expect(lineStartToken.string).toBe("");
                    expect(lineStartToken.type).toBeNull();
                    expect(standaloneCodeMirror.getTokenTypeAt({
                        line: 0,
                        ch: 0
                    })).toBe("editor-surface-custom-token keyword");

                    expect(standaloneCodeMirror.getLineTokens(1, true)).toEqual([]);
                    expect(standaloneCodeMirror.getTokenTypeAt({
                        line: 1,
                        ch: 0
                    })).toBeNull();
                    expect(standaloneCodeMirror.getStateAfter(1, true).blankLines).toBe(1);
                    expect(standaloneCodeMirror.getStateBefore(2, true).blankLines).toBe(1);
                    expect(standaloneCodeMirror.getTokenAt({
                        line: 2,
                        ch: 0
                    }, true).state.blankLines).toBe(1);

                    standaloneCodeMirror.refresh();
                    await awaitsFor(function () {
                        const wrapper =
                            standaloneCodeMirror.getWrapperElement();
                        return Boolean(wrapper.querySelector(".cm-keyword")) &&
                            Boolean(wrapper.querySelector(
                                ".cm-editor-surface-custom-token"
                            ));
                    }, `${ENGINE_LABEL} custom stream mode should render syntax highlighting`);
                    expect(observedStreamMethods).toEqual({
                        hideFirstChars: true,
                        lookAhead: true,
                        baseToken: true
                    });
                    expect(window.console.warn).not.toHaveBeenCalledWith(
                        "Unknown highlighting tag editor-surface-custom-token"
                    );
                });

                it("supports lookAhead and incrementally retreats the legacy mode cache", function () {
                    const modeName = "editor-surface-look-ahead-cache";
                    CodeMirror.defineMode(modeName, function () {
                        return {
                            startState: function () {
                                return {
                                    nextLine: null
                                };
                            },
                            copyState: function (state) {
                                return {
                                    nextLine: state.nextLine
                                };
                            },
                            token: function (stream, state) {
                                if (stream.sol()) {
                                    state.nextLine = stream.lookAhead(1);
                                }
                                stream.skipToEnd();
                                return state.nextLine === "sentinel" ?
                                    "keyword" :
                                    null;
                            }
                        };
                    });

                    const lines = ["before", "sentinel"];
                    for (let line = 2; line < 80; line++) {
                        lines.push(`line ${line}`);
                    }
                    secondaryHolder = SpecRunnerUtils.createMockElement()
                        .css({ width: "600px", height: "180px" });
                    standaloneCodeMirror = new CodeMirror(
                        secondaryHolder.get(0),
                        {
                            value: lines.join("\n"),
                            mode: modeName
                        }
                    );

                    expect(standaloneCodeMirror.getTokenAt({
                        line: 0,
                        ch: 1
                    }, true).type).toBe("keyword");

                    const lastLine = lines.length - 1;
                    standaloneCodeMirror.getTokenAt({
                        line: lastLine,
                        ch: 1
                    }, true);
                    const warmParseCount =
                        standaloneCodeMirror._legacyModeParseCount;
                    standaloneCodeMirror.getTokenAt({
                        line: lastLine,
                        ch: 1
                    }, true);
                    expect(standaloneCodeMirror._legacyModeParseCount)
                        .toBe(warmParseCount);

                    standaloneCodeMirror.replaceRange(
                        "changed tail",
                        { line: lastLine - 1, ch: 0 },
                        { line: lastLine - 1, ch: lines[lastLine - 1].length },
                        "+cache-retreat"
                    );
                    const beforeIncrementalParse =
                        standaloneCodeMirror._legacyModeParseCount;
                    standaloneCodeMirror.getTokenAt({
                        line: lastLine,
                        ch: 1
                    }, true);
                    expect(
                        standaloneCodeMirror._legacyModeParseCount -
                        beforeIncrementalParse
                    ).toBe(1);
                });

                it("exposes Markdown tokens and block state to legacy extensions", function () {
                    secondaryHolder = SpecRunnerUtils.createMockElement()
                        .css({ width: "600px", height: "180px" });
                    standaloneCodeMirror = new CodeMirror(secondaryHolder.get(0), {
                        value: "# Heading\n```js\nconst value = 1;\n```\n",
                        mode: "markdown"
                    });

                    expect(standaloneCodeMirror.getTokenTypeAt({
                        line: 0,
                        ch: 0
                    })).toContain("header");
                    expect(standaloneCodeMirror.getTokenAt({
                        line: 2,
                        ch: 5
                    }, true).type).toBe("keyword");
                    expect(standaloneCodeMirror.getStateAfter(
                        1,
                        true
                    ).fencedCode).toBe(true);
                    expect(standaloneCodeMirror.getStateAfter(
                        3,
                        true
                    ).fencedCode).toBe(false);
                });

                it("provides CodeMirror-compatible HTML tag matching for extensions", function () {
                    createEditor("<main><section>text</section></main>", "html");

                    const openingMatch = CodeMirror.findMatchingTag(
                        editor._codeMirror,
                        { line: 0, ch: 8 }
                    );
                    expect(openingMatch.at).toBe("open");
                    expect(openingMatch.open).toEqual({
                        tag: "section",
                        from: { line: 0, ch: 6 },
                        to: { line: 0, ch: 15 }
                    });
                    expect(openingMatch.close).toEqual({
                        tag: "section",
                        from: { line: 0, ch: 19 },
                        to: { line: 0, ch: 29 }
                    });

                    const closingMatch = CodeMirror.findMatchingTag(
                        editor._codeMirror,
                        { line: 0, ch: 21 }
                    );
                    expect(closingMatch.at).toBe("close");
                    expect(closingMatch.open).toEqual(openingMatch.open);
                    expect(closingMatch.close).toEqual(openingMatch.close);

                    expect(CodeMirror.findMatchingTag(
                        editor._codeMirror,
                        { line: 0, ch: 16 }
                    )).toBeUndefined();
                });

                it("preserves change payloads and synchronous notification order", function () {
                    createEditor("abc\ndef");

                    const eventOrder = [];
                    let observedChanges;
                    editor.on(`editorChange${EVENT_NAMESPACE}`, function (_event, changedEditor, changeList) {
                        eventOrder.push("editorChange");
                        expect(changedEditor).toBe(editor);
                        observedChanges = changeList;
                    });
                    testDocument.on(`change${EVENT_NAMESPACE}`, function (_event, changedDocument) {
                        eventOrder.push("document.change");
                        expect(changedDocument).toBe(testDocument);
                    });
                    DocumentModule.on(`documentChange${EVENT_NAMESPACE}`, function (_event, changedDocument) {
                        if (changedDocument === testDocument) {
                            eventOrder.push("Document.documentChange");
                        }
                    });

                    editor.replaceRange("X", { line: 0, ch: 1 }, { line: 0, ch: 2 }, "+input");

                    expect(editor.document.getText()).toBe("aXc\ndef");
                    expect(eventOrder).toEqual([
                        "editorChange",
                        "document.change",
                        "Document.documentChange"
                    ]);
                    expect(observedChanges.length).toBe(1);
                    expect(observedChanges[0].from).toEqual({ line: 0, ch: 1 });
                    expect(observedChanges[0].to).toEqual({ line: 0, ch: 2 });
                    expect(observedChanges[0].text).toEqual(["X"]);
                    expect(observedChanges[0].removed).toEqual(["b"]);
                    expect(observedChanges[0].origin).toBe("+input");
                });

                it("keeps rendering stable when a document replacement removes lines", function () {
                    createEditor([
                        "    first line",
                        "    second line",
                        "    third line",
                        "    fourth line"
                    ].join("\n"));

                    expect(function () {
                        testDocument.setText("    replacement");
                    }).not.toThrow();
                    expect(editor.document.getText()).toBe("    replacement");
                    expect(editor.lineCount()).toBe(1);
                });

                it("batches public edit operations into one ordered change list", function () {
                    createEditor("abc\ndef");

                    const changeLists = [];
                    editor.on(`editorChange${EVENT_NAMESPACE}`, function (_event, _changedEditor, changeList) {
                        changeLists.push(changeList);
                    });

                    editor.operation(function () {
                        editor.replaceRange("X", { line: 1, ch: 1 }, { line: 1, ch: 2 }, "+input");
                        editor.replaceRange("Y", { line: 0, ch: 1 }, { line: 0, ch: 2 }, "+input");
                    });

                    expect(editor.document.getText()).toBe("aYc\ndXf");
                    expect(changeLists.length).toBe(1);
                    expect(changeLists[0].map(function (change) {
                        return change.from.line;
                    })).toEqual([1, 0]);
                });

                it("emits per-edit CM5 change events before one aggregated changes event", function () {
                    createEditor("abc\ndef");

                    const codeMirror = editor._codeMirror;
                    const firstLine = codeMirror.getLineHandle(0);
                    const secondLine = codeMirror.getLineHandle(1);
                    const order = [];
                    const lineChanges = [];
                    const documentChanges = [];
                    const editorChanges = [];
                    let aggregatedChanges;

                    CodeMirror.on(firstLine, "change", function (_line, change) {
                        order.push("line.0");
                        lineChanges.push(change);
                    });
                    CodeMirror.on(secondLine, "change", function (_line, change) {
                        order.push("line.1");
                        lineChanges.push(change);
                    });
                    codeMirror.getDoc().on("change", function (_doc, change) {
                        order.push(`doc.${change.from.line}`);
                        documentChanges.push(change);
                    });
                    codeMirror.on("change", function (_instance, change) {
                        order.push(`editor.${change.from.line}`);
                        editorChanges.push(change);
                    });
                    codeMirror.on("changes", function (_instance, changes) {
                        order.push("changes");
                        aggregatedChanges = changes;
                    });

                    codeMirror.operation(function () {
                        codeMirror.replaceRange(
                            "X",
                            { line: 1, ch: 1 },
                            { line: 1, ch: 2 },
                            "+operation-order"
                        );
                        codeMirror.replaceRange(
                            "Y",
                            { line: 0, ch: 1 },
                            { line: 0, ch: 2 },
                            "+operation-order"
                        );
                    });

                    expect(order).toEqual([
                        "line.1",
                        "doc.1",
                        "editor.1",
                        "line.0",
                        "doc.0",
                        "editor.0",
                        "changes"
                    ]);
                    expect(lineChanges[0]).toBe(documentChanges[0]);
                    expect(lineChanges[1]).toBe(documentChanges[1]);
                    expect(editorChanges[0]).not.toBe(documentChanges[0]);
                    expect(editorChanges[1]).not.toBe(documentChanges[1]);
                    expect(editorChanges[0].next).toBeUndefined();
                    expect(editorChanges[1].next).toBeUndefined();
                    expect(aggregatedChanges[0]).toBe(editorChanges[0]);
                    expect(aggregatedChanges[1]).toBe(editorChanges[1]);
                });

                it("preserves multiple selections and descending multi-edit changes", function () {
                    createEditor("abcd\nefgh\nijkl");

                    let observedChanges;
                    editor.on(`editorChange${EVENT_NAMESPACE}`, function (_event, _changedEditor, changeList) {
                        observedChanges = changeList;
                    });

                    editor.setSelections([
                        {
                            start: { line: 0, ch: 1 },
                            end: { line: 0, ch: 3 },
                            reversed: true
                        },
                        {
                            start: { line: 1, ch: 1 },
                            end: { line: 1, ch: 3 },
                            primary: true
                        },
                        {
                            start: { line: 2, ch: 1 },
                            end: { line: 2, ch: 3 }
                        }
                    ]);

                    expect(comparableSelections(editor)).toEqual([
                        {
                            start: { line: 0, ch: 1 },
                            end: { line: 0, ch: 3 },
                            reversed: true,
                            primary: false
                        },
                        {
                            start: { line: 1, ch: 1 },
                            end: { line: 1, ch: 3 },
                            reversed: false,
                            primary: true
                        },
                        {
                            start: { line: 2, ch: 1 },
                            end: { line: 2, ch: 3 },
                            reversed: false,
                            primary: false
                        }
                    ]);

                    editor.replaceSelections(["X", "Y", "Z"], "around");

                    expect(editor.document.getText()).toBe("aXd\neYh\niZl");
                    expect(observedChanges.map(function (change) {
                        return change.from.line;
                    })).toEqual([2, 1, 0]);
                    expect(comparableSelections(editor)).toEqual([
                        {
                            start: { line: 0, ch: 1 },
                            end: { line: 0, ch: 2 },
                            reversed: true,
                            primary: false
                        },
                        {
                            start: { line: 1, ch: 1 },
                            end: { line: 1, ch: 2 },
                            reversed: false,
                            primary: true
                        },
                        {
                            start: { line: 2, ch: 1 },
                            end: { line: 2, ch: 2 },
                            reversed: false,
                            primary: false
                        }
                    ]);
                });

                it("tracks clean state through undo and redo", function () {
                    createEditor("abc");

                    expect(editor.isClean()).toBe(true);
                    expect(testDocument.isDirty).toBe(false);

                    editor.replaceRange("X", { line: 0, ch: 1 }, { line: 0, ch: 2 }, "+input");
                    expect(editor.document.getText()).toBe("aXc");
                    expect(editor.isClean()).toBe(false);
                    expect(testDocument.isDirty).toBe(true);

                    editor.undo();
                    expect(editor.document.getText()).toBe("abc");
                    expect(editor.isClean()).toBe(true);
                    expect(testDocument.isDirty).toBe(false);

                    editor.redo();
                    expect(editor.document.getText()).toBe("aXc");
                    expect(editor.isClean()).toBe(false);
                    expect(testDocument.isDirty).toBe(true);
                });

                it("treats identical setValue calls as CM5-compatible changes", async function () {
                    const content = Array.from({ length: 40 }, function (_value, index) {
                        return `line ${index}: ${"x".repeat(160)}`;
                    }).join("\n");
                    secondaryHolder = SpecRunnerUtils.createMockElement()
                        .css({ width: "240px", height: "90px" });
                    standaloneCodeMirror = new CodeMirror(function (wrapper) {
                        secondaryHolder.get(0).appendChild(wrapper);
                    }, {
                        value: content,
                        mode: "javascript"
                    });
                    standaloneCodeMirror.setSize(240, 90);
                    standaloneCodeMirror.refresh();

                    const codeMirror = standaloneCodeMirror;
                    const originalSelection = {
                        anchor: { line: 20, ch: 12 },
                        head: { line: 21, ch: 24 }
                    };
                    codeMirror.setSelection(originalSelection.anchor, originalSelection.head);
                    codeMirror.scrollTo(120, 240);
                    await awaitsFor(function () {
                        const scrollInfo = codeMirror.getScrollInfo();
                        return scrollInfo.left > 0 && scrollInfo.top > 0;
                    }, `${ENGINE_LABEL} editor should scroll before setValue parity checks`);

                    codeMirror.clearHistory();
                    const cleanGeneration = codeMirror.markClean();
                    const firstLineHandle = codeMirror.getLineHandle(0);
                    const middleLineHandle = codeMirror.getLineHandle(20);
                    const lastLineHandle = codeMirror.getLineHandle(39);
                    const lineHandleDeletes = [];
                    [firstLineHandle, middleLineHandle, lastLineHandle]
                        .forEach(function (lineHandle, index) {
                            CodeMirror.on(lineHandle, "delete", function () {
                                lineHandleDeletes.push(index);
                            });
                        });
                    const marker = codeMirror.markText(
                        { line: 10, ch: 2 },
                        { line: 11, ch: 8 }
                    );
                    const bookmark = codeMirror.setBookmark({ line: 25, ch: 4 });
                    const eventOrder = [];
                    const beforeChanges = [];
                    const beforeSelections = [];
                    const changes = [];
                    const changeLists = [];
                    marker.on("hide", function () {
                        eventOrder.push("marker.hide");
                    });
                    marker.on("unhide", function () {
                        eventOrder.push("marker.unhide");
                    });
                    bookmark.on("hide", function () {
                        eventOrder.push("bookmark.hide");
                    });
                    bookmark.on("unhide", function () {
                        eventOrder.push("bookmark.unhide");
                    });

                    codeMirror.on("beforeChange", function (instance, change) {
                        expect(instance).toBe(codeMirror);
                        eventOrder.push("beforeChange");
                        beforeChanges.push(change);
                    });
                    codeMirror.on("beforeSelectionChange", function (instance, selection) {
                        expect(instance).toBe(codeMirror);
                        eventOrder.push("beforeSelectionChange");
                        beforeSelections.push(selection.ranges.map(function (range) {
                            return {
                                anchor: plainPosition(range.anchor),
                                head: plainPosition(range.head)
                            };
                        }));
                    });
                    codeMirror.on("change", function (instance, change) {
                        expect(instance).toBe(codeMirror);
                        eventOrder.push("change");
                        changes.push(change);
                    });
                    codeMirror.on("cursorActivity", function (instance) {
                        expect(instance).toBe(codeMirror);
                        eventOrder.push("cursorActivity");
                    });
                    codeMirror.on("changes", function (instance, changeList) {
                        expect(instance).toBe(codeMirror);
                        eventOrder.push("changes");
                        changeLists.push(changeList);
                    });
                    codeMirror.on("update", function (instance) {
                        expect(instance).toBe(codeMirror);
                        eventOrder.push("update");
                    });

                    codeMirror.setValue(content);

                    const expectedChange = {
                        from: { line: 0, ch: 0 },
                        to: { line: 39, ch: content.split("\n")[39].length },
                        text: content.split("\n"),
                        removed: content.split("\n"),
                        origin: "setValue"
                    };
                    function comparableChange(change) {
                        return {
                            from: plainPosition(change.from),
                            to: plainPosition(change.to),
                            text: change.text,
                            removed: change.removed,
                            origin: change.origin
                        };
                    }

                    expect(eventOrder.filter(function (eventName) {
                        return eventName.indexOf(".") === -1;
                    })).toEqual([
                        "beforeChange",
                        "beforeSelectionChange",
                        "beforeSelectionChange",
                        "change",
                        "cursorActivity",
                        "changes",
                        "update"
                    ]);
                    expect(eventOrder.indexOf("marker.hide"))
                        .toBeGreaterThan(eventOrder.indexOf("cursorActivity"));
                    expect(eventOrder.indexOf("bookmark.hide"))
                        .toBeGreaterThan(eventOrder.indexOf("cursorActivity"));
                    expect(eventOrder.indexOf("marker.hide"))
                        .toBeLessThan(eventOrder.indexOf("changes"));
                    expect(eventOrder.indexOf("bookmark.hide"))
                        .toBeLessThan(eventOrder.indexOf("changes"));
                    expect(beforeChanges.length).toBe(1);
                    expect(beforeSelections).toEqual([
                        [{
                            anchor: expectedChange.to,
                            head: expectedChange.to
                        }],
                        [{
                            anchor: { line: 0, ch: 0 },
                            head: { line: 0, ch: 0 }
                        }]
                    ]);
                    expect(changes.length).toBe(1);
                    expect(changeLists.length).toBe(1);
                    expect(changeLists[0].length).toBe(1);
                    expect(comparableChange(beforeChanges[0])).toEqual(expectedChange);
                    expect(comparableChange(changes[0])).toEqual(expectedChange);
                    expect(comparableChange(changeLists[0][0])).toEqual(expectedChange);
                    expect(codeMirror.getValue()).toBe(content);
                    expect(plainPosition(codeMirror.getCursor())).toEqual({
                        line: 0,
                        ch: 0
                    });
                    expect(codeMirror.getScrollInfo().left).toBe(0);
                    expect(codeMirror.getScrollInfo().top).toBe(0);
                    expect(codeMirror.changeGeneration()).not.toBe(cleanGeneration);
                    expect(codeMirror.historySize()).toEqual({ undo: 1, redo: 0 });
                    expect(codeMirror.isClean()).toBe(false);
                    expect(codeMirror.getLineHandle(0)).toBe(firstLineHandle);
                    expect(codeMirror.getLineNumber(middleLineHandle)).toBeNull();
                    expect(codeMirror.getLineHandle(39)).toBe(lastLineHandle);
                    expect(lineHandleDeletes).toEqual([1]);
                    expect(marker.find()).toBeUndefined();
                    expect(bookmark.find()).toBeUndefined();

                    eventOrder.length = 0;
                    codeMirror.undo();

                    expect(eventOrder.filter(function (eventName) {
                        return eventName.indexOf(".") === -1;
                    })).toEqual([
                        "beforeChange",
                        "beforeSelectionChange",
                        "change",
                        "cursorActivity",
                        "changes",
                        "update"
                    ]);
                    expect(changes[1].origin).toBe("undo");
                    expect(codeMirror.getValue()).toBe(content);
                    expect(codeMirror.isClean()).toBe(true);
                    expect(codeMirror.historySize()).toEqual({ undo: 0, redo: 1 });
                    expect(plainPosition(codeMirror.getCursor("anchor")))
                        .toEqual(originalSelection.anchor);
                    expect(plainPosition(codeMirror.getCursor("head")))
                        .toEqual(originalSelection.head);
                    expect(marker.find()).toEqual({
                        from: { line: 10, ch: 2 },
                        to: { line: 11, ch: 8 }
                    });
                    expect(plainPosition(bookmark.find())).toEqual({
                        line: 25,
                        ch: 4
                    });

                    eventOrder.length = 0;
                    codeMirror.redo();

                    expect(eventOrder.filter(function (eventName) {
                        return eventName.indexOf(".") === -1;
                    })).toEqual([
                        "beforeChange",
                        "beforeSelectionChange",
                        "change",
                        "cursorActivity",
                        "changes",
                        "update"
                    ]);
                    expect(changes[2].origin).toBe("redo");
                    expect(codeMirror.getValue()).toBe(content);
                    expect(codeMirror.isClean()).toBe(false);
                    expect(codeMirror.historySize()).toEqual({ undo: 1, redo: 0 });
                    expect(plainPosition(codeMirror.getCursor())).toEqual({
                        line: 0,
                        ch: 0
                    });
                    expect(marker.find()).toBeUndefined();
                    expect(bookmark.find()).toBeUndefined();
                });

                it("keeps identical setValue edits visible to Document dirty tracking", function () {
                    createEditor("dirty document");

                    const codeMirror = editor._codeMirror;
                    codeMirror.clearHistory();
                    const cleanGeneration = codeMirror.markClean();

                    codeMirror.setValue("dirty document");

                    expect(codeMirror.changeGeneration()).not.toBe(cleanGeneration);
                    expect(codeMirror.historySize()).toEqual({ undo: 1, redo: 0 });
                    expect(editor.isClean()).toBe(false);
                    expect(testDocument.isDirty).toBe(true);

                    codeMirror.undo();
                    expect(editor.isClean()).toBe(true);
                    expect(testDocument.isDirty).toBe(false);
                    expect(codeMirror.historySize()).toEqual({ undo: 0, redo: 1 });

                    codeMirror.redo();
                    expect(editor.isClean()).toBe(false);
                    expect(testDocument.isDirty).toBe(true);
                    expect(codeMirror.historySize()).toEqual({ undo: 1, redo: 0 });
                });

                it("keeps empty and cancelled setValue calls as CM5 no-ops", function () {
                    secondaryHolder = SpecRunnerUtils.createMockElement()
                        .css({ width: "600px", height: "180px" });
                    standaloneCodeMirror = new CodeMirror(
                        secondaryHolder.get(0),
                        {
                            value: "",
                            mode: "javascript"
                        }
                    );

                    const codeMirror = standaloneCodeMirror;
                    const events = [];
                    const recordBeforeChange = function () {
                        events.push("beforeChange");
                    };
                    codeMirror.on("beforeChange", recordBeforeChange);
                    codeMirror.on("beforeSelectionChange", function () {
                        events.push("beforeSelectionChange");
                    });
                    codeMirror.on("change", function () {
                        events.push("change");
                    });
                    codeMirror.on("cursorActivity", function () {
                        events.push("cursorActivity");
                    });
                    codeMirror.on("changes", function () {
                        events.push("changes");
                    });
                    codeMirror.on("update", function () {
                        events.push("update");
                    });

                    codeMirror.clearHistory();
                    codeMirror.setValue("");

                    expect(events).toEqual([
                        "beforeChange",
                        "beforeSelectionChange"
                    ]);
                    expect(codeMirror.historySize()).toEqual({ undo: 0, redo: 0 });

                    events.length = 0;
                    codeMirror.off("beforeChange", recordBeforeChange);
                    codeMirror.on("beforeChange", function (_instance, change) {
                        events.push("beforeChange");
                        change.cancel();
                    });
                    codeMirror.setValue("");

                    expect(events).toEqual([
                        "beforeChange",
                        "beforeSelectionChange"
                    ]);
                    expect(codeMirror.historySize()).toEqual({ undo: 0, redo: 0 });
                });

                it("matches cancelled setValue selection and scroll update events", async function () {
                    const content = Array.from({ length: 40 }, function (_value, index) {
                        return `line ${index}: ${"x".repeat(160)}`;
                    }).join("\n");
                    secondaryHolder = SpecRunnerUtils.createMockElement()
                        .css({ width: "240px", height: "90px" });
                    standaloneCodeMirror = new CodeMirror(
                        secondaryHolder.get(0),
                        {
                            value: content,
                            mode: "javascript"
                        }
                    );
                    standaloneCodeMirror.setSize(240, 90);
                    standaloneCodeMirror.refresh();

                    const codeMirror = standaloneCodeMirror;
                    const events = [];
                    codeMirror.on("beforeChange", function (_instance, change) {
                        events.push("beforeChange");
                        change.cancel();
                    });
                    codeMirror.on("beforeSelectionChange", function () {
                        events.push("beforeSelectionChange");
                    });
                    codeMirror.on("change", function () {
                        events.push("change");
                    });
                    codeMirror.on("cursorActivity", function () {
                        events.push("cursorActivity");
                    });
                    codeMirror.on("changes", function () {
                        events.push("changes");
                    });
                    codeMirror.on("update", function () {
                        events.push("update");
                    });
                    codeMirror.on("scroll", function () {
                        events.push("scroll");
                    });

                    codeMirror.setCursor({ line: 1, ch: 2 });
                    events.length = 0;
                    codeMirror.clearHistory();
                    codeMirror.setValue("cancelled replacement");

                    expect(events).toEqual([
                        "beforeChange",
                        "beforeSelectionChange",
                        "cursorActivity"
                    ]);
                    expect(codeMirror.getValue()).toBe(content);
                    expect(codeMirror.historySize()).toEqual({ undo: 0, redo: 0 });

                    codeMirror.setCursor({ line: 20, ch: 30 });
                    codeMirror.scrollTo(120, 240);
                    await awaitsFor(function () {
                        const scrollInfo = codeMirror.getScrollInfo();
                        return scrollInfo.left > 0 &&
                            scrollInfo.top > 0 &&
                            events.indexOf("scroll") !== -1;
                    }, `${ENGINE_LABEL} editor should scroll before cancelled setValue`);

                    events.length = 0;
                    codeMirror.setValue("cancelled replacement");
                    await awaitsFor(function () {
                        const scrollInfo = codeMirror.getScrollInfo();
                        return scrollInfo.left === 0 &&
                            scrollInfo.top === 0 &&
                            events.indexOf("scroll") !== -1;
                    }, `${ENGINE_LABEL} cancelled setValue should reset scroll`);

                    expect(events.filter(function (eventName) {
                        return eventName !== "scroll";
                    })).toEqual([
                        "beforeChange",
                        "beforeSelectionChange",
                        "cursorActivity"
                    ]);
                    expect(codeMirror.getValue()).toBe(content);
                    expect(codeMirror.historySize()).toEqual({ undo: 0, redo: 0 });
                });

                it("emits legacy updates only for visible CM5 update operations", async function () {
                    createEditor(Array.from({ length: 120 }, function (_value, index) {
                        return `line ${index}: ${"x".repeat(80)}`;
                    }).join("\n"));
                    showEditor(240, 90);

                    const codeMirror = editor._codeMirror;
                    const updates = [];
                    codeMirror.on("update", function () {
                        updates.push("update");
                    });
                    await awaitsFor(function () {
                        const scrollInfo = codeMirror.getScrollInfo();
                        return scrollInfo.clientHeight > 0 &&
                            scrollInfo.height > scrollInfo.clientHeight;
                    }, `${ENGINE_LABEL} editor should have scrollable content`);

                    const internalEffect = CM6.StateEffect["define"]();
                    codeMirror._view.dispatch({
                        effects: internalEffect.of("internal")
                    });
                    expect(updates).toEqual([]);

                    codeMirror.scrollIntoView({ line: 0, ch: 0 });
                    expect(updates).toEqual([]);

                    codeMirror.scrollIntoView({ line: 119, ch: 80 });
                    expect(updates).toEqual(["update"]);

                    updates.length = 0;
                    codeMirror.setOption(
                        "lineWrapping",
                        !codeMirror.getOption("lineWrapping")
                    );
                    expect(updates).toEqual(["update"]);

                    updates.length = 0;
                    codeMirror.setOption(
                        "readOnly",
                        !codeMirror.getOption("readOnly")
                    );
                    expect(updates).toEqual([]);
                });

                it("applies CM5 input attributes, placeholders, autofocus, and nocursor", async function () {
                    secondaryHolder = SpecRunnerUtils.createMockElement()
                        .css({ width: "600px", height: "180px" });
                    standaloneCodeMirror = new CodeMirror(
                        secondaryHolder.get(0),
                        {
                            value: "",
                            mode: "javascript",
                            spellcheck: true,
                            autocorrect: true,
                            autocapitalize: true,
                            placeholder: "Start typing",
                            autofocus: true,
                            inputStyle: "textarea"
                        }
                    );

                    const codeMirror = standaloneCodeMirror;
                    const input = codeMirror.getInputField();
                    const wrapper = codeMirror.getWrapperElement();
                    expect(codeMirror.getOption("inputStyle")).toBe("contenteditable");
                    expect(codeMirror.display.wrapper).toBe(wrapper);
                    expect(codeMirror.display.sizer)
                        .toBe(codeMirror.getLineSpaceElement());
                    expect(input.getAttribute("spellcheck")).toBe("true");
                    expect(input.getAttribute("autocorrect")).toBe("on");
                    expect(input.getAttribute("autocapitalize")).toBe("on");
                    expect(wrapper.classList.contains("CodeMirror-empty")).toBe(true);
                    expect(wrapper.querySelector(".CodeMirror-placeholder").textContent)
                        .toBe("Start typing");
                    await awaitsFor(function () {
                        return codeMirror.hasFocus();
                    }, `${ENGINE_LABEL} autofocus should focus the editor`);

                    codeMirror.setValue("value");
                    expect(wrapper.classList.contains("CodeMirror-empty")).toBe(false);
                    expect(wrapper.querySelector(".CodeMirror-placeholder")).toBeNull();

                    codeMirror.setOption("spellcheck", false);
                    codeMirror.setOption("autocorrect", false);
                    codeMirror.setOption("autocapitalize", false);
                    expect(input.getAttribute("spellcheck")).toBe("false");
                    expect(input.getAttribute("autocorrect")).toBe("off");
                    expect(input.getAttribute("autocapitalize")).toBe("off");

                    codeMirror.setOption("readOnly", true);
                    codeMirror.focus();
                    await awaitsFor(function () {
                        return codeMirror.hasFocus();
                    }, `${ENGINE_LABEL} readOnly editor should remain focusable`);

                    codeMirror.setOption("readOnly", "nocursor");
                    expect(codeMirror.hasFocus()).toBe(false);
                    expect(input.getAttribute("contenteditable")).toBe("false");
                    codeMirror.focus();
                    expect(codeMirror.hasFocus()).toBe(false);

                    codeMirror.setOption("readOnly", false);
                    codeMirror.focus();
                    await awaitsFor(function () {
                        return codeMirror.hasFocus();
                    }, `${ENGINE_LABEL} editor should refocus after nocursor is cleared`);
                    expect(input.getAttribute("contenteditable")).toBe("true");
                });

                it("tracks the longest document line through the legacy display facade", function () {
                    createEditor("tiny\nlongest-line\nmid");

                    const codeMirror = editor._codeMirror;
                    const sizer = codeMirror.display.sizer;
                    expect(sizer).toBe(codeMirror.getLineSpaceElement());
                    expect(codeMirror.display.maxLineLength).toBe(12);

                    codeMirror.replaceRange("-extended", { line: 0, ch: 4 });
                    expect(codeMirror.display.sizer).toBe(sizer);
                    expect(codeMirror.display.maxLineLength).toBe(13);

                    codeMirror.replaceRange(
                        "x",
                        { line: 0, ch: 0 },
                        { line: 2, ch: 3 }
                    );
                    expect(codeMirror.display.maxLineLength).toBe(1);
                });

                it("emits attached document events once with CM5 argument ordering", function () {
                    createEditor("abc\ndef");

                    const codeMirror = editor._codeMirror;
                    const compatDoc = codeMirror.getDoc();
                    const eventOrder = [];
                    let documentBeforeChange;
                    let editorBeforeChange;
                    let documentBeforeSelection;
                    let editorBeforeSelection;
                    let documentChange;
                    let editorChange;
                    let historyAddedCount = 0;
                    let documentCursorActivityCount = 0;
                    let editorCursorActivityCount = 0;

                    compatDoc.on("beforeChange", function (doc, change) {
                        expect(doc).toBe(compatDoc);
                        documentBeforeChange = change;
                        eventOrder.push("doc.beforeChange");
                    });
                    codeMirror.on("beforeChange", function (instance, change) {
                        expect(instance).toBe(codeMirror);
                        editorBeforeChange = change;
                        eventOrder.push("editor.beforeChange");
                    });
                    compatDoc.on("beforeSelectionChange", function (doc, selection) {
                        expect(doc).toBe(compatDoc);
                        documentBeforeSelection = selection;
                        eventOrder.push("doc.beforeSelectionChange");
                    });
                    codeMirror.on("beforeSelectionChange", function (instance, selection) {
                        expect(instance).toBe(codeMirror);
                        editorBeforeSelection = selection;
                        eventOrder.push("editor.beforeSelectionChange");
                    });
                    compatDoc.on("historyAdded", function () {
                        historyAddedCount++;
                        eventOrder.push("doc.historyAdded");
                    });
                    compatDoc.on("change", function (doc, change) {
                        expect(doc).toBe(compatDoc);
                        documentChange = change;
                        eventOrder.push("doc.change");
                    });
                    codeMirror.on("change", function (instance, change) {
                        expect(instance).toBe(codeMirror);
                        editorChange = change;
                        eventOrder.push("editor.change");
                    });
                    compatDoc.on("cursorActivity", function (doc) {
                        expect(doc).toBe(compatDoc);
                        documentCursorActivityCount++;
                    });
                    codeMirror.on("cursorActivity", function () {
                        editorCursorActivityCount++;
                    });

                    codeMirror.clearHistory();
                    codeMirror.replaceRange(
                        "X",
                        { line: 0, ch: 1 },
                        { line: 0, ch: 2 },
                        "+doc-events"
                    );

                    expect(eventOrder.indexOf("doc.beforeChange"))
                        .toBeLessThan(eventOrder.indexOf("editor.beforeChange"));
                    expect(eventOrder.indexOf("doc.beforeSelectionChange"))
                        .toBeLessThan(eventOrder.indexOf("editor.beforeSelectionChange"));
                    expect(eventOrder.indexOf("editor.beforeChange"))
                        .toBeLessThan(eventOrder.indexOf("doc.historyAdded"));
                    expect(eventOrder.indexOf("doc.historyAdded"))
                        .toBeLessThan(eventOrder.indexOf("doc.beforeSelectionChange"));
                    expect(eventOrder.indexOf("doc.change"))
                        .toBeLessThan(eventOrder.indexOf("editor.change"));
                    expect(documentBeforeChange).toBe(editorBeforeChange);
                    expect(documentBeforeSelection).toBe(editorBeforeSelection);
                    expect(documentChange).not.toBe(editorChange);
                    expect(documentChange.from).toEqual({ line: 0, ch: 1 });
                    expect(documentChange.to).toEqual({ line: 0, ch: 2 });
                    expect(documentChange.text).toEqual(["X"]);
                    expect(documentChange.removed).toEqual(["b"]);
                    expect(documentChange.origin).toBe("+doc-events");
                    expect(historyAddedCount).toBe(1);
                    expect(documentCursorActivityCount).toBe(1);
                    expect(editorCursorActivityCount).toBe(1);

                    codeMirror.replaceRange("Y", { line: 0, ch: 2 }, null, "+doc-events");
                    expect(historyAddedCount).toBe(1);
                    codeMirror.changeGeneration(true);
                    codeMirror.replaceRange("Z", { line: 0, ch: 3 }, null, "+doc-events");
                    expect(historyAddedCount).toBe(2);
                });

                it("emits document events for detached CM6-backed Docs", function () {
                    const compatDoc = new CodeMirror.Doc(
                        "alpha\nbeta",
                        "javascript"
                    );
                    standaloneCodeMirror = compatDoc._adapter;
                    const events = [];
                    compatDoc.on("beforeChange", function (doc) {
                        expect(doc).toBe(compatDoc);
                        events.push("beforeChange");
                    });
                    compatDoc.on("beforeSelectionChange", function (doc) {
                        expect(doc).toBe(compatDoc);
                        events.push("beforeSelectionChange");
                    });
                    compatDoc.on("historyAdded", function () {
                        events.push("historyAdded");
                    });
                    compatDoc.on("change", function (doc) {
                        expect(doc).toBe(compatDoc);
                        events.push("change");
                    });
                    compatDoc.on("cursorActivity", function (doc) {
                        expect(doc).toBe(compatDoc);
                        events.push("cursorActivity");
                    });

                    compatDoc.replaceRange(
                        "BETA",
                        { line: 1, ch: 0 },
                        { line: 1, ch: 4 },
                        "+detached-doc"
                    );

                    expect(compatDoc.getEditor()).toBeNull();
                    expect(compatDoc.getValue()).toBe("alpha\nBETA");
                    expect(events).toEqual([
                        "beforeChange",
                        "historyAdded",
                        "beforeSelectionChange",
                        "change",
                        "cursorActivity"
                    ]);
                });

                it("signals surviving line handles for edits, multiline changes, undo, and redo", function () {
                    secondaryHolder = SpecRunnerUtils.createMockElement()
                        .css({ width: "600px", height: "180px" });
                    standaloneCodeMirror = new CodeMirror(
                        secondaryHolder.get(0),
                        {
                            value: "aa\nbb\ncc",
                            mode: "javascript"
                        }
                    );

                    const codeMirror = standaloneCodeMirror;
                    const handles = [0, 1, 2].map(function (lineNumber) {
                        return codeMirror.getLineHandle(lineNumber);
                    });
                    const labels = ["first", "middle", "last"];
                    const changed = [];
                    const deleted = [];
                    handles.forEach(function (handle, index) {
                        CodeMirror.on(handle, "change", function (lineHandle, change) {
                            expect(lineHandle).toBe(handle);
                            changed.push({
                                label: labels[index],
                                origin: change.origin
                            });
                        });
                        CodeMirror.on(handle, "delete", function () {
                            deleted.push(labels[index]);
                        });
                    });

                    codeMirror.replaceRange(
                        "X",
                        { line: 1, ch: 1 },
                        { line: 1, ch: 2 },
                        "+single-line"
                    );
                    expect(changed).toEqual([{
                        label: "middle",
                        origin: "+single-line"
                    }]);

                    changed.length = 0;
                    codeMirror.replaceRange(
                        "X\nY",
                        { line: 0, ch: 1 },
                        { line: 2, ch: 1 },
                        "+multiline"
                    );
                    expect(changed).toEqual([
                        { label: "first", origin: "+multiline" },
                        { label: "last", origin: "+multiline" }
                    ]);
                    expect(deleted).toEqual(["middle"]);

                    changed.length = 0;
                    codeMirror.undo();
                    expect(changed).toEqual([
                        { label: "first", origin: "undo" },
                        { label: "last", origin: "undo" }
                    ]);

                    changed.length = 0;
                    codeMirror.redo();
                    expect(changed).toEqual([
                        { label: "first", origin: "redo" },
                        { label: "last", origin: "redo" }
                    ]);
                });

                it("matches CM5 line-handle identity across structural replacements", function () {
                    secondaryHolder = SpecRunnerUtils.createMockElement()
                        .css({ width: "600px", height: "180px" });
                    standaloneCodeMirror = new CodeMirror(
                        secondaryHolder.get(0),
                        {
                            value: "aa\nbb\n",
                            mode: "javascript"
                        }
                    );

                    const codeMirror = standaloneCodeMirror;
                    const trailingNewlineHandles = [0, 1, 2].map(function (lineNumber) {
                        return codeMirror.getLineHandle(lineNumber);
                    });
                    const trailingNewlineDeletes = [];
                    trailingNewlineHandles.forEach(function (lineHandle, index) {
                        CodeMirror.on(lineHandle, "delete", function () {
                            trailingNewlineDeletes.push(index);
                        });
                    });
                    codeMirror.on("beforeChange", function () {});

                    codeMirror.setValue(codeMirror.getValue());

                    expect(trailingNewlineDeletes).toEqual([0, 1]);
                    expect(codeMirror.getLineNumber(trailingNewlineHandles[0])).toBeNull();
                    expect(codeMirror.getLineNumber(trailingNewlineHandles[1])).toBeNull();
                    expect(codeMirror.getLineHandle(2)).toBe(trailingNewlineHandles[2]);

                    codeMirror.setValue("aa\nbb\ncc");
                    const multilineHandles = [0, 1, 2].map(function (lineNumber) {
                        return codeMirror.getLineHandle(lineNumber);
                    });
                    const multilineDeletes = [];
                    multilineHandles.forEach(function (lineHandle, index) {
                        CodeMirror.on(lineHandle, "delete", function () {
                            multilineDeletes.push(index);
                        });
                    });

                    codeMirror.replaceRange(
                        "X",
                        { line: 0, ch: 1 },
                        { line: 2, ch: 1 },
                        "+line-handle-parity"
                    );

                    expect(codeMirror.getValue()).toBe("aXc");
                    expect(multilineDeletes).toEqual([1, 2]);
                    expect(codeMirror.getLineHandle(0)).toBe(multilineHandles[0]);
                    expect(codeMirror.getLineNumber(multilineHandles[1])).toBeNull();
                    expect(codeMirror.getLineNumber(multilineHandles[2])).toBeNull();
                });

                it("keeps bookmark sides compatible at insertion and replacement boundaries", function () {
                    secondaryHolder = SpecRunnerUtils.createMockElement()
                        .css({ width: "600px", height: "180px" });
                    standaloneCodeMirror = new CodeMirror(
                        secondaryHolder.get(0),
                        {
                            value: "abcdef",
                            mode: "javascript"
                        }
                    );

                    const codeMirror = standaloneCodeMirror;
                    const replacementStartBefore = codeMirror.setBookmark(
                        { line: 0, ch: 1 },
                        { insertLeft: false }
                    );
                    const replacementStartAfter = codeMirror.setBookmark(
                        { line: 0, ch: 1 },
                        { insertLeft: true }
                    );
                    const replacementEndBefore = codeMirror.setBookmark(
                        { line: 0, ch: 4 },
                        { insertLeft: false }
                    );
                    const replacementEndAfter = codeMirror.setBookmark(
                        { line: 0, ch: 4 },
                        { insertLeft: true }
                    );

                    codeMirror.replaceRange(
                        "Q",
                        { line: 0, ch: 1 },
                        { line: 0, ch: 4 }
                    );

                    expect(plainPosition(replacementStartBefore.find()))
                        .toEqual({ line: 0, ch: 1 });
                    expect(plainPosition(replacementStartAfter.find()))
                        .toEqual({ line: 0, ch: 1 });
                    expect(plainPosition(replacementEndBefore.find()))
                        .toEqual({ line: 0, ch: 2 });
                    expect(plainPosition(replacementEndAfter.find()))
                        .toEqual({ line: 0, ch: 2 });

                    const insertionBefore = codeMirror.setBookmark(
                        { line: 0, ch: 1 },
                        { insertLeft: false }
                    );
                    const insertionAfter = codeMirror.setBookmark(
                        { line: 0, ch: 1 },
                        { insertLeft: true }
                    );

                    codeMirror.replaceRange("XY", { line: 0, ch: 1 });

                    expect(plainPosition(insertionBefore.find()))
                        .toEqual({ line: 0, ch: 1 });
                    expect(plainPosition(insertionAfter.find()))
                        .toEqual({ line: 0, ch: 3 });
                });

                it("keeps legacy decorations valid through post-change selection updates", function () {
                    secondaryHolder = SpecRunnerUtils.createMockElement()
                        .css({ width: "600px", height: "180px" });
                    standaloneCodeMirror = new CodeMirror(
                        secondaryHolder.get(0),
                        {
                            value: "0123456789abcdefg",
                            mode: "javascript"
                        }
                    );

                    const codeMirror = standaloneCodeMirror;
                    const widgetNode = document.createElement("div");
                    widgetNode.className = "legacy-decoration-at-old-end";
                    codeMirror.addLineWidget(
                        0,
                        widgetNode,
                        { above: false }
                    );
                    codeMirror.on("beforeSelectionChange", function (_instance, selection) {
                        selection.update([{
                            anchor: { line: 0, ch: 1 },
                            head: { line: 0, ch: 1 }
                        }]);
                    });

                    expect(function () {
                        codeMirror.setValue("short content");
                    }).not.toThrow();
                    expect(codeMirror.getCursor()).toEqual({ line: 0, ch: 1 });
                });

                it("uses CM5 full-replacement metadata semantics without beforeChange hooks", function () {
                    secondaryHolder = SpecRunnerUtils.createMockElement()
                        .css({ width: "600px", height: "180px" });
                    standaloneCodeMirror = new CodeMirror(
                        secondaryHolder.get(0),
                        {
                            value: "zero\none\ntwo\nthree",
                            mode: "javascript"
                        }
                    );

                    const lineHandles = [0, 1, 2, 3].map(function (lineNumber) {
                        return standaloneCodeMirror.getLineHandle(lineNumber);
                    });
                    const deletedHandles = [];
                    lineHandles.forEach(function (lineHandle, index) {
                        CodeMirror.on(lineHandle, "delete", function () {
                            deletedHandles.push(index);
                        });
                    });
                    const marker = standaloneCodeMirror.markText(
                        { line: 1, ch: 0 },
                        { line: 2, ch: 2 }
                    );
                    const bookmark = standaloneCodeMirror.setBookmark({
                        line: 2,
                        ch: 1
                    });

                    standaloneCodeMirror.clearHistory();
                    standaloneCodeMirror.markClean();
                    standaloneCodeMirror.setValue(standaloneCodeMirror.getValue());

                    expect(deletedHandles).toEqual([0, 1, 2, 3]);
                    lineHandles.forEach(function (lineHandle, lineNumber) {
                        expect(standaloneCodeMirror.getLineHandle(lineNumber))
                            .not.toBe(lineHandle);
                        expect(standaloneCodeMirror.getLineNumber(lineHandle)).toBeNull();
                    });
                    expect(marker.find()).toBeUndefined();
                    expect(bookmark.find()).toBeUndefined();

                    const replacementLineHandles = [0, 1, 2, 3].map(function (lineNumber) {
                        return standaloneCodeMirror.getLineHandle(lineNumber);
                    });
                    const replacementHandleDeletes = [];
                    replacementLineHandles.forEach(function (lineHandle, index) {
                        CodeMirror.on(lineHandle, "delete", function () {
                            replacementHandleDeletes.push(index);
                        });
                    });

                    standaloneCodeMirror.undo();
                    expect(replacementHandleDeletes).toEqual([1, 2]);
                    expect(standaloneCodeMirror.getLineHandle(0))
                        .toBe(replacementLineHandles[0]);
                    expect(standaloneCodeMirror.getLineNumber(replacementLineHandles[1]))
                        .toBeNull();
                    expect(standaloneCodeMirror.getLineNumber(replacementLineHandles[2]))
                        .toBeNull();
                    expect(standaloneCodeMirror.getLineHandle(3))
                        .toBe(replacementLineHandles[3]);
                    expect(marker.find()).toEqual({
                        from: { line: 1, ch: 0 },
                        to: { line: 2, ch: 2 }
                    });
                    expect(plainPosition(bookmark.find())).toEqual({
                        line: 2,
                        ch: 1
                    });

                    const undoLineHandles = [0, 1, 2, 3].map(function (lineNumber) {
                        return standaloneCodeMirror.getLineHandle(lineNumber);
                    });
                    const undoHandleDeletes = [];
                    undoLineHandles.forEach(function (lineHandle, index) {
                        CodeMirror.on(lineHandle, "delete", function () {
                            undoHandleDeletes.push(index);
                        });
                    });

                    standaloneCodeMirror.redo();
                    expect(undoHandleDeletes).toEqual([1, 2]);
                    expect(standaloneCodeMirror.getLineHandle(0))
                        .toBe(replacementLineHandles[0]);
                    expect(standaloneCodeMirror.getLineHandle(3))
                        .toBe(replacementLineHandles[3]);
                    expect(marker.find()).toBeUndefined();
                    expect(bookmark.find()).toBeUndefined();
                });

                it("keeps hidden markers detached until their deleting change is undone", function () {
                    secondaryHolder = SpecRunnerUtils.createMockElement()
                        .css({ width: "600px", height: "180px" });
                    standaloneCodeMirror = new CodeMirror(
                        secondaryHolder.get(0),
                        {
                            value: "a".repeat(600),
                            mode: "javascript"
                        }
                    );

                    const marker = standaloneCodeMirror.markText(
                        { line: 0, ch: 340 },
                        { line: 0, ch: 350 }
                    );
                    const bookmark = standaloneCodeMirror.setBookmark({
                        line: 0,
                        ch: 596
                    });
                    const visibilityEvents = [];
                    marker.on("hide", function () {
                        visibilityEvents.push("marker.hide");
                    });
                    marker.on("unhide", function () {
                        visibilityEvents.push("marker.unhide");
                    });
                    bookmark.on("hide", function () {
                        visibilityEvents.push("bookmark.hide");
                    });
                    bookmark.on("unhide", function () {
                        visibilityEvents.push("bookmark.unhide");
                    });

                    standaloneCodeMirror.clearHistory();
                    standaloneCodeMirror.setValue("b".repeat(330));
                    expect(marker.find()).toBeUndefined();
                    expect(bookmark.find()).toBeUndefined();
                    expect(visibilityEvents).toEqual([
                        "marker.hide",
                        "bookmark.hide"
                    ]);

                    expect(function () {
                        standaloneCodeMirror.replaceRange(
                            "X",
                            { line: 0, ch: 0 },
                            undefined,
                            "+hidden-marker-edit"
                        );
                    }).not.toThrow();
                    expect(marker.find()).toBeUndefined();
                    expect(bookmark.find()).toBeUndefined();

                    standaloneCodeMirror.undo();
                    expect(standaloneCodeMirror.getValue()).toBe("b".repeat(330));
                    expect(marker.find()).toBeUndefined();
                    expect(bookmark.find()).toBeUndefined();
                    expect(visibilityEvents).toEqual([
                        "marker.hide",
                        "bookmark.hide"
                    ]);

                    standaloneCodeMirror.undo();
                    expect(standaloneCodeMirror.getValue()).toBe("a".repeat(600));
                    expect(marker.find()).toEqual({
                        from: { line: 0, ch: 340 },
                        to: { line: 0, ch: 350 }
                    });
                    expect(plainPosition(bookmark.find())).toEqual({
                        line: 0,
                        ch: 596
                    });
                    expect(visibilityEvents).toEqual([
                        "marker.hide",
                        "bookmark.hide",
                        "marker.unhide",
                        "bookmark.unhide"
                    ]);
                });

                it("round-trips undo history through the CodeMirror history API", function () {
                    createEditor("abc");

                    const codeMirror = editor._codeMirror;
                    codeMirror.clearHistory();
                    codeMirror.replaceRange(
                        "X",
                        { line: 0, ch: 1 },
                        { line: 0, ch: 2 },
                        "+history-round-trip"
                    );

                    const savedHistory = editor.getHistory();
                    expect(codeMirror.historySize()).toEqual({ undo: 1, redo: 0 });

                    codeMirror.clearHistory();
                    expect(codeMirror.historySize()).toEqual({ undo: 0, redo: 0 });
                    editor.setHistory(savedHistory);
                    expect(codeMirror.historySize()).toEqual({ undo: 1, redo: 0 });

                    codeMirror.undo();
                    expect(editor.document.getText()).toBe("abc");
                    expect(codeMirror.historySize()).toEqual({ undo: 0, redo: 1 });

                    codeMirror.redo();
                    expect(editor.document.getText()).toBe("aXc");
                    expect(codeMirror.historySize()).toEqual({ undo: 1, redo: 0 });
                });

                it("keeps selection history metadata live while isolating change payloads", function () {
                    createEditor("abc");

                    const codeMirror = editor._codeMirror;
                    codeMirror.clearHistory();
                    codeMirror.replaceRange(
                        "X",
                        { line: 0, ch: 1 },
                        { line: 0, ch: 2 },
                        "+history-copy"
                    );

                    const exportedHistory = codeMirror.getHistory();
                    const exportedChange = exportedHistory.done.find(function (entry) {
                        return entry.type === "change";
                    });
                    const internalChange = codeMirror.getDoc().history.done.find(function (entry) {
                        return entry.type === "change";
                    });
                    const exportedSelection =
                        exportedHistory.done[exportedHistory.done.length - 1];

                    expect(exportedChange).not.toBe(internalChange);
                    exportedChange.steps[0].undoChanges[0].insert = "corrupt";
                    exportedSelection.restorePointName = "live-restore-point";
                    expect(
                        codeMirror.getHistory().done[
                            codeMirror.getHistory().done.length - 1
                        ].restorePointName
                    ).toBe("live-restore-point");
                    expect(function () {
                        JSON.stringify(exportedHistory);
                    }).not.toThrow();

                    codeMirror.undo();
                    expect(codeMirror.getValue()).toBe("abc");
                    codeMirror.redo();
                    expect(codeMirror.getValue()).toBe("aXc");

                    const serializedHistory = JSON.parse(
                        JSON.stringify(codeMirror.getHistory())
                    );
                    codeMirror.setHistory(serializedHistory);
                    const serializedChange = serializedHistory.done.find(function (entry) {
                        return entry.type === "change";
                    });
                    serializedChange.steps[0].undoChanges[0].insert = "corrupt";
                    codeMirror.undo();
                    expect(codeMirror.getValue()).toBe("abc");
                });

                it("honors disableInput and undoDepth without blocking programmatic edits", function () {
                    createEditor("abc");

                    const codeMirror = editor._codeMirror;
                    codeMirror.setOption("disableInput", true);
                    codeMirror._view.dispatch({
                        changes: {
                            from: 0,
                            insert: "user"
                        },
                        annotations: CM6.Transaction.userEvent.of("input.type")
                    });
                    expect(codeMirror.getValue()).toBe("abc");

                    codeMirror.replaceRange(
                        "P",
                        { line: 0, ch: 0 },
                        null,
                        "+programmatic"
                    );
                    expect(codeMirror.getValue()).toBe("Pabc");

                    codeMirror.clearHistory();
                    codeMirror.setOption("undoDepth", 1);
                    codeMirror.replaceRange(
                        "X",
                        { line: 0, ch: 1 },
                        null,
                        "+depth-one"
                    );
                    codeMirror.changeGeneration(true);
                    codeMirror.replaceRange(
                        "Y",
                        { line: 0, ch: 2 },
                        null,
                        "+depth-two"
                    );
                    expect(codeMirror.historySize()).toEqual({
                        undo: 1,
                        redo: 0
                    });

                    codeMirror.undo();
                    expect(codeMirror.getValue()).toBe("PXabc");
                    expect(codeMirror.historySize()).toEqual({
                        undo: 0,
                        redo: 1
                    });
                    codeMirror.undo();
                    expect(codeMirror.getValue()).toBe("PXabc");
                });

                it("exposes live history stacks with stable change-event identity", function () {
                    createEditor("abc");

                    const codeMirror = editor._codeMirror;
                    const history = codeMirror.getDoc().history;
                    const initialDone = history.done;
                    codeMirror.clearHistory();

                    expect(codeMirror.getDoc().history).toBe(history);
                    expect(history.done).not.toBe(initialDone);
                    expect(history.done[0].changes).toBeUndefined();

                    codeMirror.replaceRange(
                        "X",
                        { line: 0, ch: 1 },
                        { line: 0, ch: 2 },
                        "*live-history"
                    );
                    const changeEvent = history.done.slice().reverse().find(function (entry) {
                        return entry.changes;
                    });

                    expect(changeEvent).toBeDefined();
                    expect(changeEvent.changes).toBe(changeEvent.steps);

                    codeMirror.replaceRange(
                        "Y",
                        { line: 0, ch: 1 },
                        { line: 0, ch: 2 },
                        "*live-history"
                    );
                    expect(history.done.indexOf(changeEvent)).not.toBe(-1);

                    codeMirror.undo();
                    expect(history.done.indexOf(changeEvent)).toBe(-1);
                    expect(history.undone.indexOf(changeEvent)).not.toBe(-1);

                    codeMirror.redo();
                    expect(history.done.indexOf(changeEvent)).not.toBe(-1);
                    expect(history.undone.indexOf(changeEvent)).toBe(-1);

                    const savedHistory = codeMirror.getHistory();
                    codeMirror.clearHistory();
                    codeMirror.setHistory(savedHistory);
                    expect(codeMirror.getDoc().history).toBe(history);
                    const restoredChangeEvent = history.done.slice().reverse()
                        .find(function (entry) {
                            return entry.changes;
                        });
                    expect(restoredChangeEvent).toBeDefined();
                    expect(restoredChangeEvent).not.toBe(changeEvent);
                    expect(restoredChangeEvent.steps).not.toBe(changeEvent.steps);
                });

                it("preserves custom origins for single and multiple selection replacements", function () {
                    createEditor("abcd\nefgh");

                    const codeMirror = editor._codeMirror;
                    const observedOrigins = [];
                    codeMirror.on("changes", function (_instance, changeList) {
                        observedOrigins.push(changeList.map(function (change) {
                            return change.origin;
                        }));
                    });

                    editor.setSelection(
                        { line: 0, ch: 1 },
                        { line: 0, ch: 2 }
                    );
                    editor.replaceSelection("X", "around", "+single-selection-origin");

                    expect(editor.document.getText()).toBe("aXcd\nefgh");
                    expect(observedOrigins[0]).toEqual(["+single-selection-origin"]);

                    editor.setSelections([
                        {
                            start: { line: 0, ch: 0 },
                            end: { line: 0, ch: 1 }
                        },
                        {
                            start: { line: 1, ch: 0 },
                            end: { line: 1, ch: 1 },
                            primary: true
                        }
                    ]);
                    editor.replaceSelections(
                        ["Y", "Z"],
                        "around",
                        "+multiple-selection-origin"
                    );

                    expect(editor.document.getText()).toBe("YXcd\nZfgh");
                    expect(observedOrigins[1].length).toBe(2);
                    expect(observedOrigins[1].every(function (origin) {
                        return origin === "+multiple-selection-origin";
                    })).toBe(true);
                });

                it("supports cancelling and updating selection replacements before change", function () {
                    createEditor("abcdef");

                    const codeMirror = editor._codeMirror;
                    const observedOrigins = [];
                    const appliedOrigins = [];
                    let action = "cancel";

                    function beforeChange(instance, change) {
                        expect(instance).toBe(codeMirror);
                        observedOrigins.push(change.origin);
                        if (action === "cancel") {
                            change.cancel();
                            return;
                        }
                        change.update(
                            change.from,
                            change.to,
                            ["LONGER"],
                            "+updated-before-change"
                        );
                    }

                    codeMirror.on("beforeChange", beforeChange);
                    codeMirror.on("changes", function (_instance, changeList) {
                        appliedOrigins.push(changeList.map(function (change) {
                            return change.origin;
                        }));
                    });

                    editor.setSelection(
                        { line: 0, ch: 1 },
                        { line: 0, ch: 4 }
                    );
                    editor.replaceSelection("XXX", "around", "+cancel-before-change");

                    expect(editor.document.getText()).toBe("abcdef");
                    expect(editor.getSelectedText()).toBe("bcd");
                    expect(observedOrigins).toEqual(["+cancel-before-change"]);
                    expect(appliedOrigins.length).toBe(0);

                    action = "update";
                    editor.replaceSelection("XXX", "around", "+update-before-change");

                    expect(editor.document.getText()).toBe("aLONGERef");
                    expect(editor.getSelectedText()).toBe("LONGER");
                    expect(observedOrigins).toEqual([
                        "+cancel-before-change",
                        "+update-before-change"
                    ]);
                    expect(appliedOrigins).toEqual([["+updated-before-change"]]);

                    codeMirror.off("beforeChange", beforeChange);
                });

                it("renders and removes legacy overlay token classes", async function () {
                    createEditor("const TODO = true;");

                    const root = showEditor();
                    const codeMirror = editor._codeMirror;
                    const overlay = {
                        token: function (stream) {
                            if (stream.match("TODO")) {
                                return "editor-surface-overlay";
                            }
                            while (stream.next() !== undefined) {
                                if (stream.match("TODO", false)) {
                                    break;
                                }
                            }
                            return null;
                        }
                    };

                    codeMirror.addOverlay(overlay);
                    await awaitsFor(function () {
                        return Boolean(root.querySelector(".cm-editor-surface-overlay"));
                    }, `${ENGINE_LABEL} overlay class should be visible`);

                    codeMirror.removeOverlay(overlay);
                    await awaitsFor(function () {
                        return !root.querySelector(".cm-editor-surface-overlay");
                    }, `${ENGINE_LABEL} overlay class should be removed`);
                });

                it("preserves legacy overlay validation, ordering, and named removal", async function () {
                    createEditor("TODO");

                    const root = showEditor();
                    const codeMirror = editor._codeMirror;
                    const lowPriorityOverlay = {
                        token: function (stream) {
                            stream.skipToEnd();
                            return "editor-surface-overlay-low";
                        }
                    };
                    CodeMirror.defineMode("editor-surface-overlay-mode", function () {
                        return {
                            token: function (stream) {
                                stream.skipToEnd();
                                return "editor-surface-overlay-high";
                            }
                        };
                    });

                    codeMirror.addOverlay("editor-surface-overlay-mode", {
                        opaque: true,
                        priority: 10
                    });
                    codeMirror.addOverlay(lowPriorityOverlay, { priority: -1 });

                    expect(codeMirror._overlays.map(function (overlay) {
                        return overlay.priority;
                    })).toEqual([-1, 10]);
                    await awaitsFor(function () {
                        return Boolean(root.querySelector(
                            ".cm-editor-surface-overlay-high.cm-overlay-opaque"
                        ));
                    }, `${ENGINE_LABEL} opaque named overlay should be visible`);

                    codeMirror.removeOverlay("editor-surface-overlay-mode");
                    await awaitsFor(function () {
                        return !root.querySelector(".cm-editor-surface-overlay-high");
                    }, `${ENGINE_LABEL} named overlay should be removed`);
                    expect(function () {
                        codeMirror.addOverlay({
                            startState: function () {
                                return {};
                            },
                            token: function (stream) {
                                stream.skipToEnd();
                            }
                        });
                    }).toThrowError("Overlays may not be stateful.");
                });

                it("resolves registered helpers through the editor instance", function () {
                    createEditor("body {};", "css");

                    const helper = function () {
                        return "helper";
                    };
                    CodeMirror.registerHelper("editorSurfaceHelper", "css", helper);

                    expect(editor._codeMirror.getHelpers(
                        { line: 0, ch: 1 },
                        "editorSurfaceHelper"
                    )).toEqual([helper]);
                    expect(editor._codeMirror.getHelper(
                        { line: 0, ch: 1 },
                        "editorSurfaceHelper"
                    )).toBe(helper);
                });

                it("renders, updates, and removes rulers", async function () {
                    createEditor("const answer = 42;");

                    const root = showEditor();
                    const codeMirror = editor._codeMirror;
                    codeMirror.setOption("rulers", [{
                        column: 4,
                        className: "editor-surface-ruler-first",
                        color: "rgb(255, 0, 0)"
                    }, {
                        column: 8,
                        className: "editor-surface-ruler-second"
                    }]);

                    await awaitsFor(function () {
                        return root.querySelectorAll(".CodeMirror-ruler").length === 2;
                    }, `${ENGINE_LABEL} rulers should be visible`);
                    expect(root.querySelector(".editor-surface-ruler-first")).toBeTruthy();
                    expect(root.querySelector(".editor-surface-ruler-second")).toBeTruthy();

                    codeMirror.setOption("rulers", [{
                        column: 2,
                        className: "editor-surface-ruler-updated"
                    }]);
                    await awaitsFor(function () {
                        return root.querySelectorAll(".CodeMirror-ruler").length === 1 &&
                            Boolean(root.querySelector(".editor-surface-ruler-updated"));
                    }, `${ENGINE_LABEL} rulers should update`);
                    expect(root.querySelector(".editor-surface-ruler-first")).toBeFalsy();
                    expect(root.querySelector(".editor-surface-ruler-second")).toBeFalsy();

                    codeMirror.setOption("rulers", null);
                    await awaitsFor(function () {
                        return !root.querySelector(".CodeMirror-rulers") &&
                            !root.querySelector(".CodeMirror-ruler");
                    }, `${ENGINE_LABEL} rulers should be removed`);
                });

                it("renders and removes legacy mode-name token classes", async function () {
                    createEditor("const answer = 42;");

                    const root = showEditor();
                    const codeMirror = editor._codeMirror;
                    codeMirror.setOption("addModeClass", true);
                    codeMirror.refresh();

                    await awaitsFor(function () {
                        return Boolean(root.querySelector(".cm-m-javascript"));
                    }, `${ENGINE_LABEL} mode-name classes should be visible`);

                    codeMirror.setOption("addModeClass", false);
                    codeMirror.refresh();
                    await awaitsFor(function () {
                        return !root.querySelector(".cm-m-javascript");
                    }, `${ENGINE_LABEL} mode-name classes should be removed`);
                });

                it("preserves line widget nodes, classes, ordering, and clear handles", async function () {
                    createEditor("first\nsecond\nthird");

                    const root = showEditor();
                    const codeMirror = editor._codeMirror;
                    codeMirror.setOption("styleActiveLine", false);
                    const untouchedLineInfo = codeMirror.lineInfo(0);
                    expect(untouchedLineInfo.gutterMarkers).toBeUndefined();
                    expect(untouchedLineInfo.textClass).toBeUndefined();
                    expect(untouchedLineInfo.bgClass).toBeUndefined();
                    expect(untouchedLineInfo.wrapClass).toBeUndefined();
                    expect(untouchedLineInfo.widgets).toBeUndefined();
                    const aboveNode = window.document.createElement("div");
                    const belowNode = window.document.createElement("div");
                    aboveNode.textContent = "above widget";
                    belowNode.textContent = "below widget";

                    const aboveWidget = codeMirror.addLineWidget(1, aboveNode, {
                        above: true,
                        className: "editor-surface-widget-above",
                        insertAt: 0
                    });
                    const belowWidget = codeMirror.addLineWidget(1, belowNode, {
                        className: "editor-surface-widget-below",
                        insertAt: 1
                    });
                    let redrawCount = 0;
                    let changedLine;
                    let clearedCount = 0;
                    CodeMirror.on(aboveWidget, "redraw", function () {
                        redrawCount++;
                    });
                    codeMirror.on("lineWidgetChanged", function (_instance, widget, line) {
                        if (widget === aboveWidget) {
                            changedLine = line;
                        }
                    });
                    codeMirror.on("lineWidgetCleared", function (_instance, widget) {
                        if (widget === aboveWidget) {
                            clearedCount++;
                        }
                    });

                    expect(aboveWidget.node).toBe(aboveNode);
                    expect(belowWidget.node).toBe(belowNode);
                    expect(aboveWidget.doc).toBe(codeMirror.getDoc());
                    expect(aboveWidget.above).toBe(true);
                    expect(aboveWidget.className).toBe("editor-surface-widget-above");
                    expect(aboveWidget.insertAt).toBe(0);
                    await awaitsFor(function () {
                        return aboveNode.isConnected && belowNode.isConnected;
                    }, `${ENGINE_LABEL} line widget nodes should be rendered`);

                    const aboveWrapper = aboveNode.closest(
                        ".CodeMirror-linewidget.editor-surface-widget-above"
                    );
                    const belowWrapper = belowNode.closest(
                        ".CodeMirror-linewidget.editor-surface-widget-below"
                    );
                    const textLine = Array.from(root.querySelectorAll(
                        ".CodeMirror-line, .cm-line"
                    )).find(function (lineElement) {
                        return lineElement.textContent === "second";
                    });

                    expect(aboveWrapper).toBeTruthy();
                    expect(belowWrapper).toBeTruthy();
                    expect(textLine).toBeTruthy();
                    if (aboveWrapper && belowWrapper && textLine) {
                        const orderedElements = Array.from(root.querySelectorAll(
                            ".CodeMirror-linewidget, .CodeMirror-line, .cm-line"
                        ));
                        expect(
                            orderedElements.indexOf(aboveWrapper) <
                            orderedElements.indexOf(textLine)
                        ).toBe(true);
                        expect(
                            orderedElements.indexOf(textLine) <
                            orderedElements.indexOf(belowWrapper)
                        ).toBe(true);
                    }

                    aboveWidget.changed();
                    await awaitsFor(function () {
                        return redrawCount > 0;
                    }, `${ENGINE_LABEL} line widget redraw should be signaled`);
                    expect(changedLine).toBe(1);

                    aboveWidget.clear();
                    aboveWidget.clear();
                    await awaitsFor(function () {
                        return !aboveNode.isConnected;
                    }, `${ENGINE_LABEL} line widget clear should remove the original node`);
                    expect(clearedCount).toBe(1);
                    expect(belowNode.isConnected).toBe(true);

                    codeMirror.removeLineWidget(belowWidget);
                    await awaitsFor(function () {
                        return !belowNode.isConnected;
                    }, `${ENGINE_LABEL} remaining line widget should be clearable`);
                });

                it("maps markers and bookmarks through edits", function () {
                    createEditor("abcdef");

                    const marker = editor.markText(
                        "conformance-range",
                        { line: 0, ch: 1 },
                        { line: 0, ch: 3 }
                    );
                    const bookmark = editor.setBookmark(
                        "conformance-bookmark",
                        { line: 0, ch: 4 }
                    );
                    expect(typeof marker.id).toBe("number");
                    expect(marker.id).toBe(marker._id);
                    expect(typeof bookmark.id).toBe("number");
                    expect(bookmark.id).toBe(bookmark._id);
                    expect(bookmark.id).not.toBe(marker.id);
                    let clearCount = 0;
                    marker.on("clear", function () {
                        clearCount++;
                    });

                    editor.replaceRange("X", { line: 0, ch: 0 });

                    const markerRange = marker.find();
                    expect({
                        from: plainPosition(markerRange.from),
                        to: plainPosition(markerRange.to)
                    }).toEqual({
                        from: { line: 0, ch: 2 },
                        to: { line: 0, ch: 4 }
                    });
                    expect(plainPosition(bookmark.find())).toEqual({ line: 0, ch: 5 });
                    expect(editor.getAllMarks("conformance-range")).toEqual([marker]);
                    expect(editor.getAllMarks("conformance-bookmark")).toEqual([bookmark]);

                    marker.clear();
                    expect(clearCount).toBe(1);
                    expect(marker.find()).toBeUndefined();
                });

                it("clips non-inclusive markers at replacement boundaries", function () {
                    createEditor("0123456789");

                    const exactMarker = editor.markText(
                        "conformance-exact-replacement",
                        { line: 0, ch: 2 },
                        { line: 0, ch: 5 }
                    );
                    const leftMarker = editor.markText(
                        "conformance-left-replacement",
                        { line: 0, ch: 0 },
                        { line: 0, ch: 5 }
                    );
                    const rightMarker = editor.markText(
                        "conformance-right-replacement",
                        { line: 0, ch: 2 },
                        { line: 0, ch: 8 }
                    );
                    const inclusiveMarker = editor.markText(
                        "conformance-inclusive-replacement",
                        { line: 0, ch: 2 },
                        { line: 0, ch: 5 },
                        {
                            inclusiveLeft: true,
                            inclusiveRight: true
                        }
                    );

                    editor.replaceRange(
                        "WXYZ",
                        { line: 0, ch: 2 },
                        { line: 0, ch: 5 }
                    );

                    expect(exactMarker.find()).toBeUndefined();
                    expect({
                        from: plainPosition(leftMarker.find().from),
                        to: plainPosition(leftMarker.find().to)
                    }).toEqual({
                        from: { line: 0, ch: 0 },
                        to: { line: 0, ch: 2 }
                    });
                    expect({
                        from: plainPosition(rightMarker.find().from),
                        to: plainPosition(rightMarker.find().to)
                    }).toEqual({
                        from: { line: 0, ch: 6 },
                        to: { line: 0, ch: 9 }
                    });
                    expect({
                        from: plainPosition(inclusiveMarker.find().from),
                        to: plainPosition(inclusiveMarker.find().to)
                    }).toEqual({
                        from: { line: 0, ch: 2 },
                        to: { line: 0, ch: 6 }
                    });
                });

                it("clips selection endpoints around inclusive collapsed ranges", function () {
                    createEditor("hidden\nvisible\nhidden");

                    editor._codeMirror.markText(
                        { line: 2, ch: 0 },
                        { line: 2, ch: null },
                        {
                            collapsed: true,
                            inclusiveLeft: true,
                            inclusiveRight: true,
                            clearWhenEmpty: false
                        }
                    );
                    editor.setSelection(
                        { line: 1, ch: 0 },
                        { line: 2, ch: 0 }
                    );

                    expect(comparableSelections(editor)).toEqual([{
                        start: { line: 1, ch: 0 },
                        end: { line: 1, ch: 7 },
                        reversed: false,
                        primary: true
                    }]);
                });

                it("keeps selection transactions current when an atomic marker clears on entry", function () {
                    createEditor("abcdef");

                    const marker = editor.markText(
                        "clear-on-enter",
                        { line: 0, ch: 1 },
                        { line: 0, ch: 4 },
                        {
                            atomic: true,
                            clearOnEnter: true
                        }
                    );

                    expect(function () {
                        editor.setCursorPos({ line: 0, ch: 2 });
                    }).not.toThrow();
                    expect(marker.find()).toBeUndefined();
                    expect(plainPosition(editor.getCursorPos())).toEqual({
                        line: 0,
                        ch: 2
                    });
                });

                it("reports CM5-compatible cursor positions and programmatic focus", function () {
                    createEditor("abcdef");
                    showEditor();

                    let focusCount = 0;
                    editor.on(`focus${EVENT_NAMESPACE}`, function () {
                        focusCount++;
                    });
                    editor.setCursorPos(0, 3);
                    editor.focus();

                    expect(editor.getCursorPos()).toEqual({
                        line: 0,
                        ch: 3,
                        sticky: null
                    });
                    expect(editor.hasFocus()).toBe(true);
                    expect(focusCount).toBe(1);
                });

                it("tracks focus independently for an editor nested in a line widget", async function () {
                    createEditor("outer");
                    showEditor();

                    const nestedHolder = window.document.createElement("div");
                    const lineWidget = editor._codeMirror.addLineWidget(0, nestedHolder, {
                        handleMouseEvents: true
                    });
                    secondaryEditor = new Editor(
                        testDocument,
                        false,
                        nestedHolder
                    );
                    secondaryEditor.setSize(300, 80);
                    secondaryEditor.refresh();

                    editor.focus();
                    expect(editor.hasFocus()).toBe(true);

                    secondaryEditor.focus();
                    await awaitsFor(function () {
                        return secondaryEditor.hasFocus() && !editor.hasFocus();
                    }, `${ENGINE_LABEL} nested editor focus should replace host focus`);

                    secondaryEditor.replaceRange(
                        "X",
                        { line: 0, ch: 0 },
                        { line: 0, ch: 1 },
                        "+input"
                    );
                    lineWidget.changed();
                    await awaitsFor(function () {
                        return secondaryEditor.hasFocus() && !editor.hasFocus();
                    }, `${ENGINE_LABEL} nested editor focus should survive edits`);

                    editor.replaceRange(
                        "prefix\n",
                        { line: 0, ch: 0 },
                        { line: 0, ch: 0 },
                        "+input"
                    );
                    await awaitsFor(function () {
                        return secondaryEditor.hasFocus() && !editor.hasFocus();
                    }, `${ENGINE_LABEL} nested editor focus should survive host edits`);
                });

                it("scrolls long lines into view synchronously", function () {
                    createEditor(`short\n${"x".repeat(300)}`);

                    showEditor(180, 120);
                    expect(editor.getScrollPos().x).toBe(0);

                    editor.setCursorPos(1, 300);

                    expect(editor.getScrollPos().x).toBeGreaterThan(0);
                    const scroller = editor.getScrollerElement();
                    expect(scroller.scrollLeft)
                        .toBe(scroller.scrollWidth - scroller.clientWidth);
                });

                it("forwards visible gutter mouse events with CodeMirror-compatible arguments", async function () {
                    createEditor("first\nsecond\nthird");
                    Editor.registerGutter(TEST_GUTTER, 10);

                    const marker = window.document.createElement("span");
                    marker.textContent = "!";
                    editor.setGutterMarker(1, TEST_GUTTER, marker);
                    let markerClickCount = 0;
                    marker.addEventListener("click", function () {
                        markerClickCount++;
                    });
                    expect(editor.getGutterMarker(1, TEST_GUTTER)).toBe(marker);

                    const observedEvents = [];
                    function recordEvent(eventName) {
                        return function (codeMirror, lineNumber, gutterName, event) {
                            observedEvents.push({
                                eventName: eventName,
                                codeMirror: codeMirror,
                                lineNumber: lineNumber,
                                gutterName: gutterName,
                                event: event
                            });
                            if (eventName === "gutterContextMenu") {
                                event.preventDefault();
                            }
                        };
                    }

                    editor._codeMirror.on("gutterClick", recordEvent("gutterClick"));
                    editor._codeMirror.on("gutterContextMenu", recordEvent("gutterContextMenu"));

                    const root = editor.getRootElement();
                    root.parentElement.style.display = "block";
                    root.parentElement.style.height = "180px";
                    root.parentElement.style.left = "0";
                    root.parentElement.style.top = "0";
                    editor.setSize(600, 180);
                    editor.refresh();

                    await awaitsFor(function () {
                        return marker.isConnected && root.querySelector(`.${TEST_GUTTER}`);
                    }, `${ENGINE_LABEL} gutter should be rendered`);

                    marker.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
                    expect(markerClickCount).toBe(1);

                    const gutter = root.querySelector(`.${TEST_GUTTER}`);
                    const gutterRect = gutter.getBoundingClientRect();
                    const lineCoordinates = editor.charCoords({ line: 1, ch: 0 }, "window");
                    const mouseDownEvent = new window.MouseEvent("mousedown", {
                        bubbles: true,
                        cancelable: true,
                        clientX: gutterRect.left + (gutterRect.width / 2),
                        clientY: lineCoordinates.top +
                            ((lineCoordinates.bottom - lineCoordinates.top) / 2)
                    });
                    const contextMenuEvent = new window.MouseEvent("contextmenu", {
                        bubbles: true,
                        cancelable: true,
                        clientX: gutterRect.left + (gutterRect.width / 2),
                        clientY: lineCoordinates.top +
                            ((lineCoordinates.bottom - lineCoordinates.top) / 2)
                    });

                    gutter.dispatchEvent(mouseDownEvent);
                    gutter.dispatchEvent(contextMenuEvent);

                    const lineNumberGutter = root.querySelector(
                        ".CodeMirror-linenumbers, .cm-lineNumbers"
                    );
                    expect(lineNumberGutter).toBeTruthy();
                    const lineNumberGutterRect = lineNumberGutter.getBoundingClientRect();
                    const lineNumberMouseDownEvent = new window.MouseEvent("mousedown", {
                        bubbles: true,
                        cancelable: true,
                        clientX: lineNumberGutterRect.left + (lineNumberGutterRect.width / 2),
                        clientY: lineCoordinates.top +
                            ((lineCoordinates.bottom - lineCoordinates.top) / 2)
                    });
                    lineNumberGutter.dispatchEvent(lineNumberMouseDownEvent);

                    expect(observedEvents.length).toBe(3);
                    expect(observedEvents[0]).toEqual({
                        eventName: "gutterClick",
                        codeMirror: editor._codeMirror,
                        lineNumber: 1,
                        gutterName: TEST_GUTTER,
                        event: mouseDownEvent
                    });
                    expect(observedEvents[1]).toEqual({
                        eventName: "gutterContextMenu",
                        codeMirror: editor._codeMirror,
                        lineNumber: 1,
                        gutterName: TEST_GUTTER,
                        event: contextMenuEvent
                    });
                    expect(observedEvents[2]).toEqual({
                        eventName: "gutterClick",
                        codeMirror: editor._codeMirror,
                        lineNumber: 1,
                        gutterName: LINE_NUMBER_GUTTER,
                        event: lineNumberMouseDownEvent
                    });
                    expect(mouseDownEvent.defaultPrevented).toBe(true);
                    expect(contextMenuEvent.defaultPrevented).toBe(true);
                    expect(lineNumberMouseDownEvent.defaultPrevented).toBe(true);
                });

                it("keeps original gutter nodes live while replacing shared markers", async function () {
                    createEditor("first\nsecond\nthird\nfourth");
                    Editor.registerGutter(TEST_GUTTER, 10);

                    const root = editor.getRootElement();
                    root.parentElement.style.display = "block";
                    root.parentElement.style.height = "180px";
                    root.parentElement.style.left = "0";
                    root.parentElement.style.top = "0";
                    editor.setSize(600, 180);
                    editor.refresh();

                    const openMarker = window.document.createElement("span");
                    openMarker.className = "conformance-gutter-open";
                    const sharedBlankMarker = window.document.createElement("span");
                    sharedBlankMarker.className = "conformance-gutter-blank";

                    editor.operation(function () {
                        editor.setGutterMarker(0, TEST_GUTTER, openMarker);
                        editor.setGutterMarker(1, TEST_GUTTER, sharedBlankMarker);
                        editor.setGutterMarker(2, TEST_GUTTER, sharedBlankMarker);
                    });

                    expect(editor.getGutterMarker(0, TEST_GUTTER)).toBe(openMarker);
                    expect(editor.getGutterMarker(1, TEST_GUTTER)).toBe(sharedBlankMarker);
                    expect(editor.getGutterMarker(2, TEST_GUTTER)).toBe(sharedBlankMarker);

                    await awaitsFor(function () {
                        return openMarker.isConnected && sharedBlankMarker.isConnected;
                    }, `${ENGINE_LABEL} original gutter markers should be rendered`);

                    const wrappers = Array.from(root.querySelectorAll(
                        `.${TEST_GUTTER} .${CM6_GUTTER_MARKER_WRAPPER_CLASS}`
                    ));
                    expect(wrappers.length).toBe(3);
                    expect(wrappers.every(function (wrapper) {
                        return wrapper.parentElement.classList.contains("cm-gutterElement");
                    })).toBe(true);
                    expect(wrappers.filter(function (wrapper) {
                        return wrapper.contains(sharedBlankMarker);
                    }).length).toBe(1);

                    const foldedMarker = window.document.createElement("span");
                    foldedMarker.className = "conformance-gutter-folded";
                    editor.setGutterMarker(0, TEST_GUTTER, foldedMarker);

                    expect(editor.getGutterMarker(0, TEST_GUTTER)).toBe(foldedMarker);
                    await awaitsFor(function () {
                        return foldedMarker.isConnected && !openMarker.isConnected;
                    }, `${ENGINE_LABEL} replacement gutter marker should be rendered`);

                    expect(root.querySelectorAll(
                        `.${TEST_GUTTER} .${CM6_GUTTER_MARKER_WRAPPER_CLASS}`
                    ).length).toBe(3);

                    editor.clearGutter(TEST_GUTTER);
                    expect(editor.getGutterMarker(0, TEST_GUTTER)).toBeUndefined();
                    expect(editor.getGutterMarker(1, TEST_GUTTER)).toBeUndefined();
                    expect(editor.getGutterMarker(2, TEST_GUTTER)).toBeUndefined();
                    await awaitsFor(function () {
                        return !foldedMarker.isConnected && !sharedBlankMarker.isConnected;
                    }, `${ENGINE_LABEL} gutter markers should be removed`);
                });

                it("supports CM5 object-form gutter classes and inline styles", function () {
                    secondaryHolder = SpecRunnerUtils.createMockElement()
                        .css({ width: "600px", height: "180px" });
                    const firstGutter = {
                        className: "editor-surface-object-gutter",
                        style: "width: 17px; background-color: rgb(1, 2, 3);"
                    };
                    const lineNumberGutter = {
                        className: LINE_NUMBER_GUTTER,
                        style: "min-width: 31px;"
                    };
                    standaloneCodeMirror = new CodeMirror(
                        secondaryHolder.get(0),
                        {
                            value: "first\nsecond",
                            lineNumbers: true,
                            gutters: [
                                firstGutter,
                                lineNumberGutter,
                                "editor-surface-string-gutter"
                            ]
                        }
                    );

                    const codeMirror = standaloneCodeMirror;
                    const gutterElements = Array.from(
                        codeMirror.getWrapperElement().querySelectorAll(".cm-gutter")
                    );
                    expect(codeMirror.getOption("gutters")).toEqual([
                        firstGutter,
                        lineNumberGutter,
                        "editor-surface-string-gutter"
                    ]);
                    expect(gutterElements.map(function (gutter) {
                        if (gutter.classList.contains("editor-surface-object-gutter")) {
                            return "editor-surface-object-gutter";
                        }
                        if (gutter.classList.contains("CodeMirror-linenumbers")) {
                            return LINE_NUMBER_GUTTER;
                        }
                        return "editor-surface-string-gutter";
                    })).toEqual([
                        "editor-surface-object-gutter",
                        LINE_NUMBER_GUTTER,
                        "editor-surface-string-gutter"
                    ]);
                    expect(gutterElements[0].style.width).toBe("17px");
                    expect(gutterElements[0].style.backgroundColor)
                        .toBe("rgb(1, 2, 3)");
                    expect(gutterElements[1].style.minWidth).toBe("31px");

                    codeMirror.setOption("gutters", [
                        "editor-surface-object-gutter",
                        LINE_NUMBER_GUTTER
                    ]);
                    const updatedGutters = Array.from(
                        codeMirror.getWrapperElement().querySelectorAll(".cm-gutter")
                    );
                    expect(updatedGutters[0].style.width).toBe("");
                    expect(updatedGutters[0].style.backgroundColor).toBe("");
                    expect(updatedGutters[1].style.minWidth).toBe("");
                });

                it("renders and refreshes gutter markers from legacy viewport handlers", async function () {
                    const content = Array.from({ length: 200 }, function (_value, index) {
                        return `line ${index}`;
                    }).join("\n");
                    createEditor(content);
                    Editor.registerGutter(TEST_GUTTER, 10);

                    const root = editor.getRootElement();
                    root.parentElement.style.display = "block";
                    root.parentElement.style.height = "180px";
                    root.parentElement.style.left = "0";
                    root.parentElement.style.top = "0";
                    editor.setSize(600, 180);
                    editor.refresh();

                    await awaitsFor(function () {
                        const rect = root.getBoundingClientRect();
                        const viewport = editor.getViewport();
                        return rect.width > 0 && rect.height > 0 &&
                            editor.getTextHeight() > 0 && viewport.to > viewport.from;
                    }, `${ENGINE_LABEL} editor should expose a visible viewport`);

                    editor.setScrollPos(0, 0);
                    await awaitsFor(function () {
                        return editor.getScrollPos().y === 0 && editor.getViewport().from === 0;
                    }, `${ENGINE_LABEL} editor should start at the first viewport`);

                    const initialViewport = editor.getViewport();
                    editor._codeMirror.setOption(LEGACY_VIEWPORT_GUTTER_OPTION, true);

                    await awaitsFor(function () {
                        return root.querySelectorAll(`.${LEGACY_VIEWPORT_MARKER_CLASS}`).length ===
                            initialViewport.to - initialViewport.from;
                    }, `${ENGINE_LABEL} legacy option handler should mark the visible viewport`);

                    expect(root.querySelector(`.${LEGACY_VISIBLE_GUTTER_CLASS}`)).toBeTruthy();
                    const initialMarkers = Array.from(
                        root.querySelectorAll(`.${LEGACY_VIEWPORT_MARKER_CLASS}`)
                    );
                    expect(initialMarkers.map(function (marker) {
                        return Number(marker.dataset.line);
                    })).toEqual(Array.from(
                        { length: initialViewport.to - initialViewport.from },
                        function (_value, index) {
                            return initialViewport.from + index;
                        }
                    ));

                    editor._codeMirror._lastViewport = null;
                    editor._codeMirror._emitViewportChange();

                    await awaitsFor(function () {
                        const refreshedMarkers = Array.from(
                            root.querySelectorAll(`.${LEGACY_VIEWPORT_MARKER_CLASS}`)
                        );
                        return refreshedMarkers.length === initialMarkers.length &&
                            refreshedMarkers.every(function (marker) {
                                return initialMarkers.indexOf(marker) === -1;
                            });
                    }, `${ENGINE_LABEL} legacy option handler should refresh on viewport changes`);

                    const refreshedMarkers = Array.from(
                        root.querySelectorAll(`.${LEGACY_VIEWPORT_MARKER_CLASS}`)
                    );
                    expect(refreshedMarkers.map(function (marker) {
                        return Number(marker.dataset.line);
                    })).toEqual(Array.from(
                        { length: initialViewport.to - initialViewport.from },
                        function (_value, index) {
                            return initialViewport.from + index;
                        }
                    ));

                    editor._codeMirror.setOption(LEGACY_VIEWPORT_GUTTER_OPTION, false);
                    await awaitsFor(function () {
                        return !root.querySelector(`.${LEGACY_VIEWPORT_MARKER_CLASS}`) &&
                            !root.querySelector(`.${LEGACY_VISIBLE_GUTTER_CLASS}`);
                    }, `${ENGINE_LABEL} legacy option gutter markers should be cleared`);
                });

                it("preserves repository-owned root classes through editor updates", function () {
                    createEditor("focus");

                    const root = editor.getRootElement();
                    const persistentClasses = [
                        "folding-enabled",
                        "over-gutter",
                        "find-highlighting"
                    ];
                    const themeClasses = String(
                        editor._codeMirror.getOption("theme") || "default"
                    ).split(/\s+/).filter(Boolean).map(function (themeName) {
                        return `cm-s-${themeName}`;
                    });
                    root.classList.add(...persistentClasses);

                    editor.setCursorPos(0, 1);
                    persistentClasses.forEach(function (className) {
                        expect(root.classList.contains(className)).toBe(true);
                    });
                    themeClasses.forEach(function (className) {
                        expect(root.classList.contains(className)).toBe(true);
                    });
                });

                it("preserves legacy line-class targets and token removal semantics", async function () {
                    createEditor("first\nsecond\nthird");

                    const root = showEditor();
                    const codeMirror = editor._codeMirror;
                    codeMirror.setOption("lineNumbers", true);
                    const lineHandle = codeMirror.addLineClass(
                        1,
                        "text",
                        "editor-surface-text-class editor-surface-text-extra"
                    );
                    codeMirror.addLineClass(
                        lineHandle,
                        "background",
                        "editor-surface-background-class"
                    );
                    codeMirror.addLineClass(
                        lineHandle,
                        "wrap",
                        "editor-surface-wrap-class"
                    );
                    codeMirror.addLineClass(
                        lineHandle,
                        "gutter",
                        "editor-surface-gutter-class"
                    );

                    await awaitsFor(function () {
                        const line = Array.from(root.querySelectorAll(".cm-line"))
                            .find(function (element) {
                                return element.textContent === "second";
                            });
                        return line &&
                            line.classList.contains("editor-surface-text-class") &&
                            line.classList.contains("editor-surface-background-class") &&
                            line.classList.contains("editor-surface-wrap-class") &&
                            root.querySelector(
                                ".cm-gutterElement.editor-surface-wrap-class"
                            ) &&
                            root.querySelector(
                                ".cm-gutterElement.editor-surface-gutter-class"
                            );
                    }, `${ENGINE_LABEL} legacy line classes should be rendered`);

                    expect(root.querySelector(
                        ".cm-gutterElement.editor-surface-background-class"
                    )).toBeNull();
                    codeMirror.removeLineClass(
                        lineHandle,
                        "text",
                        "editor-surface-text-class"
                    );
                    expect(codeMirror.lineInfo(lineHandle).textClass)
                        .toBe("editor-surface-text-extra");

                    await awaitsFor(function () {
                        const line = Array.from(root.querySelectorAll(".cm-line"))
                            .find(function (element) {
                                return element.textContent === "second";
                            });
                        return line &&
                            !line.classList.contains("editor-surface-text-class") &&
                            line.classList.contains("editor-surface-text-extra");
                    }, `${ENGINE_LABEL} one legacy line-class token should be removed`);
                });

                it("re-emits renderLine after an explicit editor refresh", async function () {
                    createEditor("first\nsecond");

                    showEditor();
                    const codeMirror = editor._codeMirror;
                    let renderCount = 0;
                    codeMirror.on("renderLine", function () {
                        renderCount++;
                    });

                    codeMirror.refresh();
                    await awaitsFor(function () {
                        return renderCount >= 2;
                    }, `${ENGINE_LABEL} refresh should render visible lines`);
                    const firstRenderCount = renderCount;

                    codeMirror.refresh();
                    await awaitsFor(function () {
                        return renderCount >= firstRenderCount + 2;
                    }, `${ENGINE_LABEL} repeated refresh should rerender visible lines`);
                });

                it("emits viewport and render-line updates after CM6 geometry changes", async function () {
                    const content = Array.from({ length: 120 }, function (_value, index) {
                        return `line ${index}`;
                    }).join("\n");
                    createEditor(content);

                    const root = showEditor(600, 180);
                    const codeMirror = editor._codeMirror;
                    await awaitsFor(function () {
                        return codeMirror.getViewport().to > codeMirror.getViewport().from;
                    }, `${ENGINE_LABEL} editor should expose an initial viewport`);

                    codeMirror._lastViewport = codeMirror.getViewport();
                    const viewportEvents = [];
                    let renderCount = 0;
                    codeMirror.on("viewportChange", function (_instance, from, to) {
                        viewportEvents.push({from: from, to: to});
                    });
                    codeMirror.on("renderLine", function () {
                        renderCount++;
                    });

                    root.style.height = "70px";
                    codeMirror._view.requestMeasure();

                    await awaitsFor(function () {
                        return viewportEvents.length > 0 && renderCount > 0;
                    }, `${ENGINE_LABEL} geometry changes should refresh viewport consumers`);
                    expect(viewportEvents[viewportEvents.length - 1])
                        .toEqual(codeMirror.getViewport());
                });

                it("keeps a secondary full editor synchronized", function () {
                    createEditor("alpha\nbeta");
                    secondaryHolder = SpecRunnerUtils.createMockElement()
                        .css({ width: "600px", height: "180px" });
                    secondaryEditor = new Editor(
                        testDocument,
                        false,
                        secondaryHolder.get(0)
                    );

                    const eventOrder = [];
                    editor.on(`editorChange${EVENT_NAMESPACE}`, function () {
                        eventOrder.push("master.editorChange");
                    });
                    testDocument.on(`change${EVENT_NAMESPACE}`, function () {
                        eventOrder.push("document.change");
                    });
                    DocumentModule.on(`documentChange${EVENT_NAMESPACE}`, function (_event, changedDocument) {
                        if (changedDocument === testDocument) {
                            eventOrder.push("Document.documentChange");
                        }
                    });
                    secondaryEditor.on(`editorChange${EVENT_NAMESPACE}`, function () {
                        eventOrder.push("secondary.editorChange");
                    });

                    secondaryEditor.replaceRange(
                        "BETA",
                        { line: 1, ch: 0 },
                        { line: 1, ch: 4 },
                        "+input"
                    );

                    expect(editor.document.getText()).toBe("alpha\nBETA");
                    expect(editor.getTextBetween(
                        { line: 0, ch: 0 },
                        { line: 1, ch: 4 }
                    )).toBe("alpha\nBETA");
                    expect(eventOrder).toEqual([
                        "master.editorChange",
                        "document.change",
                        "Document.documentChange",
                        "secondary.editorChange"
                    ]);
                });

                it("provides finite geometry and restores scroll position", async function () {
                    const content = Array.from({ length: 200 }, function (_value, index) {
                        return `line ${index}`;
                    }).join("\n");
                    createEditor(content);

                    const root = editor.getRootElement();
                    root.parentElement.style.display = "block";
                    root.parentElement.style.height = "180px";
                    editor.setSize(600, 180);
                    editor.refresh();

                    await awaitsFor(function () {
                        const rect = root.getBoundingClientRect();
                        return rect.width > 0 && rect.height > 0 && editor.getTextHeight() > 0;
                    }, `${ENGINE_LABEL} editor should have measurable geometry`);

                    const coordinates = editor.charCoords({ line: 1, ch: 1 }, "local");
                    expect(Number.isFinite(coordinates.left)).toBe(true);
                    expect(Number.isFinite(coordinates.top)).toBe(true);
                    expect(coordinates.right).toBeGreaterThanOrEqual(coordinates.left);
                    expect(coordinates.bottom).toBeGreaterThan(coordinates.top);

                    const roundTripPosition = editor.coordsChar({
                        left: coordinates.left,
                        top: (coordinates.top + coordinates.bottom) / 2
                    }, "local");
                    expect(roundTripPosition.line).toBe(1);
                    expect(Math.abs(roundTripPosition.ch - 1)).toBeLessThanOrEqual(1);

                    editor.setScrollPos(0, 120);
                    await awaitsFor(function () {
                        return editor.getScrollPos().y > 0;
                    }, `${ENGINE_LABEL} editor should scroll`);

                    const viewport = editor.getViewport();
                    expect(viewport.from).toBeLessThanOrEqual(viewport.to);
                });

                it("keeps local coordinates stable while scrolling and sizes end coordinates", async function () {
                    const content = Array.from({ length: 80 }, function (_value, index) {
                        return `line ${index}`;
                    }).join("\n");
                    createEditor(content);

                    const root = showEditor();
                    await awaitsFor(function () {
                        const rect = root.getBoundingClientRect();
                        return rect.width > 0 && rect.height > 0 && editor.getTextHeight() > 0;
                    }, `${ENGINE_LABEL} editor should have measurable geometry`);

                    const position = { line: 10, ch: 2 };
                    const coordinatesBeforeScroll = editor.charCoords(position, "local");
                    editor.setScrollPos(0, 100);
                    await awaitsFor(function () {
                        return editor.getScrollPos().y > 0;
                    }, `${ENGINE_LABEL} editor should scroll before checking local coordinates`);
                    const coordinatesAfterScroll = editor.charCoords(position, "local");

                    expect(Math.abs(
                        coordinatesAfterScroll.left - coordinatesBeforeScroll.left
                    )).toBeLessThanOrEqual(1);
                    expect(Math.abs(
                        coordinatesAfterScroll.top - coordinatesBeforeScroll.top
                    )).toBeLessThanOrEqual(1);
                    expect(Math.abs(
                        coordinatesAfterScroll.bottom - coordinatesBeforeScroll.bottom
                    )).toBeLessThanOrEqual(1);

                    const lastLine = editor.lineCount() - 1;
                    const endCoordinates = editor.charCoords({
                        line: lastLine,
                        ch: editor.getLine(lastLine).length
                    }, "local");
                    const endHeight = endCoordinates.bottom - endCoordinates.top;
                    expect(Number.isFinite(endHeight)).toBe(true);
                    expect(Math.abs(
                        endHeight - editor._codeMirror.defaultTextHeight()
                    )).toBeLessThanOrEqual(1);
                });
            });
    });
});
