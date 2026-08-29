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

/*global describe, it, expect, afterEach, spyOn */

define(function (require, exports, module) {

    const CodeMirror = require("editor/CodeMirrorCompat"),
        LegacyAddons = require("editor/CodeMirrorLegacyAddons"),
        ExtendedAddons = require("editor/CodeMirrorLegacyExtendedAddons");

    LegacyAddons.installAll(CodeMirror);
    ExtendedAddons.installAll(CodeMirror);

    describe("CodeMirror extended legacy addon compatibility", function () {
        const editors = [];
        const fixtures = [];
        const mergeViews = [];

        function createFixture() {
            const fixture = window.document.createElement("div");
            window.document.body.appendChild(fixture);
            fixtures.push(fixture);
            return fixture;
        }

        function createEditor(value, options) {
            const editor = new CodeMirror(
                createFixture(),
                Object.assign({value: value}, options || {})
            );
            editors.push(editor);
            return editor;
        }

        afterEach(function () {
            mergeViews.forEach(function (mergeView) {
                mergeView.destroy();
            });
            mergeViews.length = 0;
            editors.forEach(function (editor) {
                editor.setOption("autoRefresh", false);
                editor.setOption("lint", false);
                editor.setOption("selectionPointer", false);
                if (editor.getOption("fullScreen")) {
                    editor.setOption("fullScreen", false);
                }
                editor.destroy();
            });
            editors.length = 0;
            fixtures.forEach(function (fixture) {
                fixture.remove();
            });
            fixtures.length = 0;
        });

        it("recognizes all remaining canonical paths and normalizes aliases", function () {
            expect(ExtendedAddons.supportedPaths.length).toBe(32);
            ExtendedAddons.supportedPaths.forEach(function (path) {
                expect(ExtendedAddons.isSupported(path)).toBe(true);
                expect(ExtendedAddons.isSupported(
                    `thirdparty/CodeMirror/${path}.js?cache=1#test`
                )).toBe(true);
                expect(ExtendedAddons.isSupported(
                    `thirdparty/CodeMirror2/${path}`
                )).toBe(true);
                expect(ExtendedAddons.install(CodeMirror, path)).toBe(true);
            });
            expect(ExtendedAddons.isSupported(
                "thirdparty/CodeMirror/addon/not-real"
            )).toBe(false);

            const openDialog = CodeMirror.prototype.openDialog;
            expect(ExtendedAddons.install(
                CodeMirror,
                "thirdparty/CodeMirror/addon/dialog/dialog.js?again=1"
            )).toBe(true);
            expect(CodeMirror.prototype.openDialog).toBe(openDialog);
        });

        it("preserves richer Phoenix folding APIs when legacy addons load", function () {
            function FoldingFacade() {}

            const existing = {
                auto: function () {},
                combine: function () {},
                fold: function () {},
                foldAll: function () {},
                foldCode: function () {},
                foldGutter: function () {},
                foldOptions: function () {},
                getValidFolds: function () {},
                indent: function () {},
                isFolded: function () {},
                newFoldFunction: function () {},
                unfold: function () {},
                unfoldAll: function () {},
                unfoldCode: function () {}
            };

            FoldingFacade.prototype.foldCode = existing.foldCode;
            FoldingFacade.prototype.getValidFolds = existing.getValidFolds;
            FoldingFacade.prototype.isFolded = existing.isFolded;
            FoldingFacade.prototype.unfoldCode = existing.unfoldCode;
            FoldingFacade.commands = {
                fold: existing.fold,
                foldAll: existing.foldAll,
                unfold: existing.unfold,
                unfoldAll: existing.unfoldAll
            };
            FoldingFacade.fold = {
                auto: existing.auto,
                combine: existing.combine,
                indent: existing.indent
            };
            FoldingFacade.helpers = {
                fold: FoldingFacade.fold
            };
            FoldingFacade.newFoldFunction = existing.newFoldFunction;
            FoldingFacade.optionHandlers = {
                foldGutter: existing.foldGutter,
                foldOptions: existing.foldOptions
            };
            FoldingFacade.defineExtension = function (name, extension) {
                FoldingFacade.prototype[name] = extension;
            };
            FoldingFacade.defineOption = function (name, defaultValue, handler) {
                FoldingFacade.optionHandlers[name] = {
                    defaultValue: defaultValue,
                    handler: handler
                };
            };
            FoldingFacade.registerHelper = function (type, name, helper) {
                FoldingFacade.helpers[type] =
                    FoldingFacade.helpers[type] || {};
                FoldingFacade.helpers[type][name] = helper;
                FoldingFacade[type] = FoldingFacade.helpers[type];
            };

            expect(ExtendedAddons.install(
                FoldingFacade,
                "addon/fold/foldcode"
            )).toBe(true);
            expect(ExtendedAddons.install(
                FoldingFacade,
                "addon/fold/foldgutter"
            )).toBe(true);
            expect(ExtendedAddons.install(
                FoldingFacade,
                "addon/fold/indent-fold"
            )).toBe(true);

            expect(FoldingFacade.prototype.foldCode)
                .toBe(existing.foldCode);
            expect(FoldingFacade.prototype.isFolded)
                .toBe(existing.isFolded);
            expect(FoldingFacade.prototype.unfoldCode)
                .toBe(existing.unfoldCode);
            expect(FoldingFacade.prototype.getValidFolds)
                .toBe(existing.getValidFolds);
            expect(FoldingFacade.commands.fold).toBe(existing.fold);
            expect(FoldingFacade.commands.unfold).toBe(existing.unfold);
            expect(FoldingFacade.commands.foldAll).toBe(existing.foldAll);
            expect(FoldingFacade.commands.unfoldAll)
                .toBe(existing.unfoldAll);
            expect(FoldingFacade.fold.auto).toBe(existing.auto);
            expect(FoldingFacade.fold.combine).toBe(existing.combine);
            expect(FoldingFacade.fold.indent).toBe(existing.indent);
            expect(FoldingFacade.newFoldFunction)
                .toBe(existing.newFoldFunction);
            expect(FoldingFacade.optionHandlers.foldOptions)
                .toBe(existing.foldOptions);
            expect(FoldingFacade.optionHandlers.foldGutter)
                .toBe(existing.foldGutter);
            expect(typeof FoldingFacade.prototype.foldOption)
                .toBe("function");
            expect(typeof FoldingFacade.commands.toggleFold)
                .toBe("function");
        });

        it("exposes the expected extended API surface", function () {
            [
                "openConfirm",
                "openDialog",
                "openNotification",
                "addPanel",
                "foldCode",
                "foldOption",
                "isFolded",
                "performLint",
                "wrapParagraph",
                "wrapParagraphsInRange",
                "wrapRange"
            ].forEach(function (methodName) {
                expect(typeof CodeMirror.prototype[methodName])
                    .toBe("function");
            });
            [
                "autoRefresh",
                "foldGutter",
                "fullScreen",
                "lint",
                "selectionPointer"
            ].forEach(function (optionName) {
                expect(CodeMirror.optionHandlers[optionName]).toBeTruthy();
            });
            [
                "coffeescript",
                "css",
                "html",
                "javascript",
                "sql",
                "xml"
            ].forEach(function (helperName) {
                expect(typeof CodeMirror.hint[helperName]).toBe("function");
            });
            [
                "coffeescript",
                "css",
                "html",
                "javascript",
                "json",
                "yaml"
            ].forEach(function (helperName) {
                expect(typeof CodeMirror.lint[helperName]).toBe("function");
            });
            expect(typeof CodeMirror.fold.indent).toBe("function");
            expect(typeof CodeMirror.MergeView).toBe("function");
            expect(typeof CodeMirror.TernServer).toBe("function");
            expect(typeof CodeMirror.colorize).toBe("function");
            expect(typeof CodeMirror.requireMode).toBe("function");
            expect(typeof CodeMirror.autoLoadMode).toBe("function");
            expect(typeof CodeMirror.scrollbarModel.simple).toBe("function");
            expect(typeof CodeMirror.scrollbarModel.overlay).toBe("function");
            expect(CodeMirror.emacs).toBeTruthy();
            expect(CodeMirror.keyMap.emacs).toBeTruthy();
        });

        it("opens and closes dialogs, confirms, and notifications", function () {
            const editor = createEditor("", {mode: "text/plain"});
            let submitted = null;
            const close = editor.openDialog(
                "<input type=\"text\">",
                function (value) {
                    submitted = value;
                },
                {closeOnBlur: false, value: "answer"}
            );
            const wrapper = editor.getWrapperElement();
            const input = wrapper.querySelector(".CodeMirror-dialog input");

            expect(wrapper.querySelector(".CodeMirror-dialog")).not.toBeNull();
            expect(input.value).toBe("answer");
            close("updated");
            expect(input.value).toBe("updated");
            input.dispatchEvent(new window.KeyboardEvent("keydown", {
                bubbles: true,
                key: "Enter",
                keyCode: 13
            }));
            expect(submitted).toBe("updated");
            expect(wrapper.querySelector(".CodeMirror-dialog")).toBeNull();

            let confirmed = false;
            editor.openConfirm(
                "<button>OK</button>",
                [function () {
                    confirmed = true;
                }]
            );
            wrapper.querySelector(".CodeMirror-dialog button").click();
            expect(confirmed).toBe(true);

            const closeNotification = editor.openNotification(
                "Ready",
                {duration: 0}
            );
            expect(wrapper.textContent).toContain("Ready");
            const closeReplacementNotification = editor.openNotification(
                "Still ready",
                {duration: 0}
            );
            expect(wrapper.querySelectorAll(".CodeMirror-dialog").length)
                .toBe(1);
            expect(wrapper.textContent).toContain("Still ready");
            expect(wrapper.classList.contains("dialog-opened")).toBe(true);
            closeNotification();
            expect(wrapper.classList.contains("dialog-opened")).toBe(true);
            closeReplacementNotification();
            closeReplacementNotification();
            expect(wrapper.classList.contains("dialog-opened")).toBe(false);
        });

        it("adds panels in order and restores the editor wrapper", function () {
            const editor = createEditor("", {mode: "text/plain"});
            const wrapper = editor.getWrapperElement();
            const originalParent = wrapper.parentNode;
            const firstNode = window.document.createElement("div");
            const secondNode = window.document.createElement("div");
            firstNode.textContent = "first";
            secondNode.textContent = "second";

            const first = editor.addPanel(firstNode);
            const second = editor.addPanel(secondNode, {after: first});

            expect(editor.state.panels.panels.length).toBe(2);
            expect(firstNode.nextSibling).toBe(secondNode);
            first.changed();
            first.clear();
            expect(editor.state.panels.panels).toEqual([second]);
            second.clear();
            expect(editor.state.panels).toBeNull();
            expect(wrapper.parentNode).toBe(originalParent);
        });

        it("toggles display compatibility options without retaining state", function () {
            const editor = createEditor("", {mode: "text/plain"});
            const wrapper = editor.getWrapperElement();
            const oldOverflow =
                window.document.documentElement.style.overflow;

            editor.setOption("fullScreen", true);
            expect(wrapper.classList.contains("CodeMirror-fullscreen"))
                .toBe(true);
            expect(window.document.documentElement.style.overflow)
                .toBe("hidden");
            editor.setOption("fullScreen", false);
            expect(wrapper.classList.contains("CodeMirror-fullscreen"))
                .toBe(false);
            expect(window.document.documentElement.style.overflow)
                .toBe(oldOverflow);

            editor.setOption("autoRefresh", {delay: 1});
            editor.setOption("autoRefresh", false);
            expect(editor.state.autoRefresh).toBeNull();

            editor.setOption("selectionPointer", "pointer");
            expect(editor.state.selectionPointer.value).toBe("pointer");
            editor.setOption("selectionPointer", false);
            expect(editor.state.selectionPointer).toBeNull();
        });

        it("continues and renumbers Markdown lists", function () {
            const editor = createEditor(
                "1. one\n2. two",
                {mode: "markdown"}
            );
            editor.setCursor(CodeMirror.Pos(0, 6));
            CodeMirror.commands.newlineAndIndentContinueMarkdownList(editor);
            expect(editor.getValue()).toBe("1. one\n2. \n3. two");

            editor.setValue("- [x] done");
            editor.setCursor(CodeMirror.Pos(0, 10));
            CodeMirror.commands.newlineAndIndentContinueMarkdownList(editor);
            expect(editor.getValue()).toBe("- [x] done\n- [ ] ");
        });

        it("does not continue list-shaped text outside Markdown list state", function () {
            const editor = createEditor(
                "    1. indented code",
                {mode: "markdown"}
            );
            const fallback = spyOn(editor, "execCommand").and.callThrough();

            editor.setCursor(CodeMirror.Pos(0, 20));
            CodeMirror.commands.newlineAndIndentContinueMarkdownList(editor);

            expect(fallback).toHaveBeenCalledWith("newlineAndIndent");
            expect(editor.getValue()).not.toContain("\n    2. ");
        });

        it("folds custom ranges and finds indentation folds", function () {
            const editor = createEditor(
                "root\n  child\n\n  child two\nnext",
                {mode: "text/plain"}
            );
            const rangeFinder = function () {
                return {
                    from: CodeMirror.Pos(0, 4),
                    to: CodeMirror.Pos(3, 11)
                };
            };
            let folded = 0;
            let unfolded = 0;
            editor.on("fold", function () {
                folded++;
            });
            editor.on("unfold", function () {
                unfolded++;
            });

            const marker = editor.foldCode(
                CodeMirror.Pos(0, 0),
                rangeFinder
            );
            expect(marker.__isFold).toBe(true);
            expect(editor.isFolded(CodeMirror.Pos(0, 4))).toBe(true);
            editor.foldCode(CodeMirror.Pos(0, 0), rangeFinder);
            expect(editor.isFolded(CodeMirror.Pos(0, 4))).toBe(false);
            expect(folded).toBe(1);
            expect(unfolded).toBe(1);

            const indentRange = CodeMirror.fold.indent(
                editor,
                CodeMirror.Pos(0, 0)
            );
            expect(indentRange.from).toEqual(CodeMirror.Pos(0, 4));
            expect(indentRange.to).toEqual(CodeMirror.Pos(3, 11));
        });

        it("provides useful CSS, HTML, JavaScript, SQL, and XML hints", function () {
            const cssEditor = createEditor(
                ".sample { colo",
                {mode: "css"}
            );
            cssEditor.setCursor(CodeMirror.Pos(0, 14));
            expect(CodeMirror.hint.css(cssEditor).list)
                .toContain("color");

            const htmlEditor = createEditor(
                "<body><di",
                {mode: "htmlmixed"}
            );
            htmlEditor.setCursor(CodeMirror.Pos(0, 9));
            expect(CodeMirror.hint.html(htmlEditor).list)
                .toContain("<div");

            const javascriptEditor = createEditor(
                "con",
                {mode: "javascript"}
            );
            javascriptEditor.setCursor(CodeMirror.Pos(0, 3));
            expect(CodeMirror.hint.javascript(javascriptEditor).list)
                .toContain("const");

            const sqlEditor = createEditor("SEL", {mode: "sql"});
            sqlEditor.setCursor(CodeMirror.Pos(0, 3));
            expect(CodeMirror.hint.sql(sqlEditor, {}).list.map(
                function (item) {
                    return item.text;
                }
            )).toContain("SELECT");

            const xmlEditor = createEditor("<ro", {mode: "xml"});
            xmlEditor.setCursor(CodeMirror.Pos(0, 3));
            expect(CodeMirror.hint.xml(xmlEditor, {
                schemaInfo: {
                    "!top": ["root"],
                    root: {attrs: {}}
                }
            }).list).toContain("<root");
        });

        it("uses the complete legacy CSS property, value, color, and media data", function () {
            const propertySource = ".sample { alignment-bas";
            const propertyEditor = createEditor(propertySource, {mode: "css"});
            propertyEditor.setCursor(CodeMirror.Pos(0, propertySource.length));
            expect(CodeMirror.hint.css(propertyEditor).list)
                .toContain("alignment-baseline");

            const valueSource = ".sample { background: repeating-conic";
            const valueEditor = createEditor(valueSource, {mode: "css"});
            valueEditor.setCursor(CodeMirror.Pos(0, valueSource.length));
            expect(CodeMirror.hint.css(valueEditor).list)
                .toContain("repeating-conic-gradient");

            const colorSource = ".sample { color: rebeccap";
            const colorEditor = createEditor(colorSource, {mode: "css"});
            colorEditor.setCursor(CodeMirror.Pos(0, colorSource.length));
            expect(CodeMirror.hint.css(colorEditor).list)
                .toContain("rebeccapurple");

            const mediaSource = "@media (min-res";
            const mediaEditor = createEditor(mediaSource, {mode: "css"});
            mediaEditor.setCursor(CodeMirror.Pos(0, mediaSource.length));
            expect(CodeMirror.hint.css(mediaEditor).list)
                .toContain("min-resolution");
        });

        it("keeps CSS hints aligned with the legacy pseudo and value sets", function () {
            const pseudoSource = ".sample:";
            const pseudoEditor = createEditor(pseudoSource, {mode: "css"});
            pseudoEditor.setCursor(CodeMirror.Pos(0, pseudoSource.length));
            const pseudoHints = CodeMirror.hint.css(pseudoEditor).list;

            expect(pseudoHints).toContain("focus");
            expect(pseudoHints).not.toContain("focus-visible");
            expect(pseudoHints).not.toContain("any-link");

            const valueSource = ".sample { transform: rotate";
            const valueEditor = createEditor(valueSource, {mode: "css"});
            valueEditor.setCursor(CodeMirror.Pos(0, valueSource.length));
            const valueHints = CodeMirror.hint.css(valueEditor).list;

            expect(valueHints).toContain("rotatex");
            expect(valueHints).not.toContain("rotateX");
        });

        it("matches the official multiline and attribute HTML hint cases", function () {
            const htmlEditor = createEditor("<html>\n", {mode: "text/html"});
            htmlEditor.setCursor(CodeMirror.Pos(1, 0));
            expect(CodeMirror.hint.html(htmlEditor).list).toEqual([
                "<head",
                "<body",
                "</html>"
            ]);

            const languageSource = "<link hreflang='z";
            const languageEditor = createEditor(
                languageSource,
                {mode: "text/html"}
            );
            languageEditor.setCursor(CodeMirror.Pos(
                0,
                languageSource.length
            ));
            const languageHints = CodeMirror.hint.html(languageEditor);
            expect(languageHints.list).toEqual(["'zh'", "'za'", "'zu'"]);
            expect(languageHints.from).toEqual(CodeMirror.Pos(
                0,
                "<link hreflang=".length
            ));

            const multilineSource = "<a\n  hre";
            const multilineEditor = createEditor(
                multilineSource,
                {mode: "text/html"}
            );
            multilineEditor.setCursor(CodeMirror.Pos(1, 5));
            expect(CodeMirror.hint.html(multilineEditor).list)
                .toContain("hreflang");

            const quotedValueSource = "<input type=";
            const quotedValueEditor = createEditor(
                quotedValueSource,
                {mode: "text/html"}
            );
            quotedValueEditor.setCursor(CodeMirror.Pos(
                0,
                quotedValueSource.length
            ));
            expect(CodeMirror.hint.html(quotedValueEditor, {
                quoteChar: "'"
            }).list).toContain("'text'");
        });

        it("installs the exact legacy HTML schema and default tag hints", function () {
            const schema = CodeMirror.htmlSchema;
            expect(Object.keys(schema).length).toBe(124);
            expect(schema["!top"]).toBeUndefined();
            expect(schema["!attrs"]).toBeUndefined();
            expect(schema.abbr).toBe(schema.acronym);
            expect(schema.abbr.attrs.class).toBeNull();
            expect(schema.a.attrs.contenteditable).toEqual([
                "true",
                "false"
            ]);
            expect(schema.input.attrs.type).toContain("datetime");

            const editor = createEditor("", {mode: "text/html"});
            const hints = CodeMirror.hint.html(editor).list;
            expect(hints.length).toBe(124);
            expect(hints).toContain("<html");
            expect(hints).toContain("<wbr");

            function HTMLFacade() {}
            HTMLFacade.defineExtension = function () {};
            HTMLFacade.hint = {};
            HTMLFacade.registerHelper = function (type, name, helper) {
                HTMLFacade[type] = HTMLFacade[type] || {};
                HTMLFacade[type][name] = helper;
            };
            HTMLFacade.htmlSchema = {custom: {attrs: {}}};

            expect(ExtendedAddons.install(
                HTMLFacade,
                "addon/hint/html-hint"
            )).toBe(true);
            expect(Object.keys(HTMLFacade.htmlSchema).length).toBe(124);
            expect(HTMLFacade.htmlSchema.custom).toBeUndefined();
        });

        it("does not retain HTML void elements in XML hint context", function () {
            const source = "<html><body><img src='photo.png'>\n</";
            const editor = createEditor(source, {mode: "text/html"});
            editor.setCursor(CodeMirror.Pos(1, 2));

            const hints = CodeMirror.hint.html(editor).list;
            expect(hints).toContain("</body>");
            expect(hints).not.toContain("</img>");
        });

        it("uses XML parser context across lines", function () {
            const source = "<root>\n  <chi";
            const editor = createEditor(source, {mode: "xml"});
            editor.setCursor(CodeMirror.Pos(1, 6));

            const completion = CodeMirror.hint.xml(editor, {
                schemaInfo: {
                    "!top": ["root"],
                    child: {attrs: {kind: ["first", "second"]}},
                    root: {
                        attrs: {},
                        children: ["child"]
                    }
                }
            });
            expect(completion.list).toEqual(["<child"]);
            expect(completion.from).toEqual(CodeMirror.Pos(1, 2));
            expect(completion.to).toEqual(CodeMirror.Pos(1, 6));
        });

        it("accepts array-like and thenable XML attribute values", function () {
            const arrayLikeSource = "<root kind=";
            const arrayLikeEditor = createEditor(
                arrayLikeSource,
                {mode: "xml"}
            );
            arrayLikeEditor.setCursor(CodeMirror.Pos(
                0,
                arrayLikeSource.length
            ));
            const arrayLikeHints = CodeMirror.hint.xml(arrayLikeEditor, {
                schemaInfo: {
                    root: {
                        attrs: {
                            kind: {
                                0: "first",
                                1: "second",
                                length: 2
                            }
                        }
                    }
                }
            });
            expect(arrayLikeHints.list).toEqual([
                "\"first\"",
                "\"second\""
            ]);

            let thenCalled = false;
            const thenableEditor = createEditor(
                arrayLikeSource,
                {mode: "xml"}
            );
            thenableEditor.setCursor(CodeMirror.Pos(
                0,
                arrayLikeSource.length
            ));
            const thenableHints = CodeMirror.hint.xml(thenableEditor, {
                schemaInfo: {
                    root: {
                        attrs: {
                            kind: {
                                then: function (resolve) {
                                    thenCalled = true;
                                    return resolve({
                                        0: "async",
                                        length: 1
                                    });
                                }
                            }
                        }
                    }
                }
            });
            expect(thenCalled).toBe(true);
            expect(thenableHints.list).toEqual(["\"async\""]);
        });

        it("reads JavaScript parser-state locals, contexts, and globals", function () {
            const linked = function (names) {
                let result = null;
                names.slice().reverse().forEach(function (name) {
                    result = {name: name, next: result};
                });
                return result;
            };
            const state = {
                context: {
                    prev: null,
                    vars: linked(["scopeContext"])
                },
                globalVars: linked(["scopeGlobal"]),
                localVars: linked(["scopeLocal"])
            };
            const fakeEditor = {
                getCursor: function () {
                    return CodeMirror.Pos(0, 5);
                },
                getMode: function () {
                    return {};
                },
                getTokenAt: function () {
                    return {
                        end: 5,
                        start: 0,
                        state: state,
                        string: "scope",
                        type: "variable"
                    };
                }
            };
            const additionalContext = Object.create({
                scopeInherited: {}
            });
            additionalContext.scopeAdditional = {};

            expect(CodeMirror.hint.javascript(fakeEditor, {
                additionalContext: additionalContext,
                useGlobalScope: false
            }).list).toEqual([
                "scopeLocal",
                "scopeContext",
                "scopeGlobal",
                "scopeAdditional",
                "scopeInherited"
            ]);
        });

        it("provides JavaScript and CoffeeScript property completions", function () {
            const stringSource = "\"hello\".sub";
            const stringEditor = createEditor(
                stringSource,
                {mode: "javascript"}
            );
            stringEditor.setCursor(CodeMirror.Pos(0, stringSource.length));
            expect(CodeMirror.hint.javascript(stringEditor, {
                useGlobalScope: false
            }).list).toContain("substring");

            const nestedSource = "service.client.met";
            const nestedEditor = createEditor(
                nestedSource,
                {mode: "javascript"}
            );
            nestedEditor.setCursor(CodeMirror.Pos(0, nestedSource.length));
            expect(CodeMirror.hint.javascript(nestedEditor, {
                additionalContext: {
                    service: {
                        client: {
                            method: true
                        }
                    }
                },
                useGlobalScope: false
            }).list).toContain("method");

            const coffeeSource = "items.ma";
            const coffeeEditor = createEditor(
                coffeeSource,
                {mode: "coffeescript"}
            );
            coffeeEditor.setCursor(CodeMirror.Pos(0, coffeeSource.length));
            expect(CodeMirror.hint.coffeescript(coffeeEditor, {
                additionalContext: {items: []},
                useGlobalScope: false
            }).list).toContain("map");
        });

        it("matches qualified, aliased, quoted, and metadata-rich SQL hints", function () {
            const tables = {
                users: ["name", "score", "birthDate"]
            };
            const qualifiedSource = "SELECT users.";
            const qualifiedEditor = createEditor(
                qualifiedSource,
                {mode: "text/x-mysql"}
            );
            qualifiedEditor.setCursor(CodeMirror.Pos(
                0,
                qualifiedSource.length
            ));
            const qualifiedHints = CodeMirror.hint.sql(qualifiedEditor, {
                tables: tables
            });
            expect(qualifiedHints.list).toEqual([
                "users.name",
                "users.score",
                "users.birthDate"
            ]);
            expect(qualifiedHints.from).toEqual(CodeMirror.Pos(0, 7));

            const aliasSource = "SELECT t. FROM users t";
            const aliasEditor = createEditor(
                aliasSource,
                {mode: "text/x-mysql"}
            );
            aliasEditor.setCursor(CodeMirror.Pos(0, 9));
            expect(CodeMirror.hint.sql(aliasEditor, {
                tables: tables
            }).list).toEqual([
                "t.name",
                "t.score",
                "t.birthDate"
            ]);

            const schemaSource = "SELECT \"schema\".\"users\".";
            const schemaEditor = createEditor(
                schemaSource,
                {mode: "text/x-sqlite"}
            );
            schemaEditor.setCursor(CodeMirror.Pos(0, schemaSource.length));
            expect(CodeMirror.hint.sql(schemaEditor, {
                tables: {
                    "schema.users": ["name", "score"]
                }
            }).list).toEqual([
                "\"schema\".\"users\".\"name\"",
                "\"schema\".\"users\".\"score\""
            ]);

            const metadataSource = "SELECT mytable.";
            const metadataEditor = createEditor(
                metadataSource,
                {mode: "text/x-mysql"}
            );
            metadataEditor.setCursor(CodeMirror.Pos(
                0,
                metadataSource.length
            ));
            const metadataHints = CodeMirror.hint.sql(metadataEditor, {
                tables: [{
                    columns: [{
                        columnHint: "varchar(255)",
                        columnName: "name",
                        displayText: "name | varchar(255)",
                        text: "name"
                    }],
                    displayText: "mytable | Main table",
                    text: "mytable"
                }]
            });
            expect(metadataHints.list).toEqual([{
                columnHint: "varchar(255)",
                columnName: "name",
                displayText: "name | varchar(255)",
                text: "mytable.name"
            }]);
        });

        it("uses the exact legacy keyword sets for every SQL dialect", function () {
            const expectedCounts = {
                "text/x-cassandra": 80,
                "text/x-esper": 104,
                "text/x-gpsql": 457,
                "text/x-gql": 20,
                "text/x-hive": 250,
                "text/x-mariadb": 396,
                "text/x-mssql": 68,
                "text/x-mysql": 389,
                "text/x-pgsql": 798,
                "text/x-plsql": 244,
                "text/x-sparksql": 210,
                "text/x-sql": 34,
                "text/x-sqlite": 125
            };

            Object.keys(expectedCounts).forEach(function (mime) {
                expect(Object.keys(
                    CodeMirror.resolveMode(mime).keywords
                ).length).toBe(expectedCounts[mime]);
            });

            const sqlKeywords = CodeMirror.resolveMode(
                "text/x-sql"
            ).keywords;
            const mysqlKeywords = CodeMirror.resolveMode(
                "text/x-mysql"
            ).keywords;
            const sqliteSpec = CodeMirror.resolveMode("text/x-sqlite");

            expect(sqlKeywords.count).toBe(true);
            expect(mysqlKeywords.auto_increment).toBe(true);
            expect(mysqlKeywords.autoincrement).toBeUndefined();
            expect(sqliteSpec.keywords.autoincrement).toBe(true);
            expect(sqliteSpec.keywords.auto_increment).toBeUndefined();
            expect(sqliteSpec.identifierQuote).toBe("\"");
            expect(CodeMirror.getMode(
                {indentUnit: 4},
                "text/x-sqlite"
            ).config).toBe(sqliteSpec);
        });

        it("runs synchronous lint providers and renders their annotations", function () {
            const editor = createEditor("bad", {
                gutters: ["CodeMirror-lint-markers"],
                mode: "javascript"
            });
            editor.setOption("lint", {
                getAnnotations: function () {
                    return [{
                        from: CodeMirror.Pos(0, 0),
                        message: "problem",
                        severity: "warning",
                        to: CodeMirror.Pos(0, 3)
                    }];
                },
                highlightLines: true,
                lintOnChange: false
            });

            expect(editor.state.lint.annotations.length).toBe(1);
            expect(editor.state.lint.marked.length).toBe(1);
            expect(editor.lineInfo(0).gutterMarkers[
                "CodeMirror-lint-markers"
            ]).toBeTruthy();
            expect(CodeMirror.lint.json("{").length).toBe(1);

            editor.setOption("lint", false);
            expect(editor.state.lint).toBeNull();
        });

        it("invalidates pending asynchronous lint results after edits", function () {
            const editor = createEditor("bad", {
                gutters: ["CodeMirror-lint-markers"],
                mode: "javascript"
            });
            let completeLint = null;

            editor.setOption("lint", {
                async: true,
                getAnnotations: function (_text, callback) {
                    completeLint = callback;
                },
                lintOnChange: false
            });
            expect(typeof completeLint).toBe("function");

            editor.replaceRange("g", CodeMirror.Pos(0, 0));
            completeLint([{
                from: CodeMirror.Pos(0, 0),
                message: "stale problem",
                severity: "error",
                to: CodeMirror.Pos(0, 3)
            }]);

            expect(editor.state.lint.annotations).toEqual([]);
            expect(editor.state.lint.marked).toEqual([]);
            const gutterMarkers = editor.lineInfo(0).gutterMarkers;
            expect(Boolean(gutterMarkers && gutterMarkers[
                "CodeMirror-lint-markers"
            ])).toBe(false);
        });

        it("shows and cleans up lint tooltips for gutter and text marks", function () {
            const editor = createEditor("bad", {
                gutters: ["CodeMirror-lint-markers"],
                mode: "javascript"
            });
            editor.setOption("lint", {
                getAnnotations: function () {
                    return [{
                        from: CodeMirror.Pos(0, 0),
                        message: "hover problem",
                        severity: "warning",
                        to: CodeMirror.Pos(0, 3)
                    }];
                },
                lintOnChange: false,
                tooltips: true
            });

            return Promise.resolve().then(function () {
                const wrapper = editor.getWrapperElement();
                const gutterMarker = wrapper.querySelector(
                    ".CodeMirror-lint-marker-warning"
                );
                expect(gutterMarker).not.toBeNull();
                expect(gutterMarker.textContent).toBe("");
                gutterMarker.dispatchEvent(new window.MouseEvent(
                    "mouseover",
                    {
                        bubbles: true,
                        clientX: 20,
                        clientY: 20
                    }
                ));

                let tooltip = window.document.querySelector(
                    ".CodeMirror-lint-tooltip"
                );
                expect(tooltip).not.toBeNull();
                expect(tooltip.textContent).toContain("hover problem");

                gutterMarker.dispatchEvent(new window.MouseEvent(
                    "mouseout",
                    {
                        bubbles: true,
                        relatedTarget: wrapper
                    }
                ));
                expect(tooltip.style.opacity).toBe("0");

                const textMark = wrapper.querySelector(
                    ".CodeMirror-lint-mark-warning"
                );
                expect(textMark).not.toBeNull();
                textMark.dispatchEvent(new window.MouseEvent(
                    "mouseover",
                    {
                        bubbles: true,
                        clientX: 20,
                        clientY: 20
                    }
                ));
                tooltip = window.document.querySelector(
                    ".CodeMirror-lint-tooltip"
                );
                expect(tooltip).not.toBeNull();
                expect(tooltip.textContent).toContain("hover problem");

                editor.setOption("lint", false);
                expect(window.document.querySelector(
                    ".CodeMirror-lint-tooltip"
                )).toBeNull();
            });
        });

        it("constructs a bounded merge view and navigates differences", function () {
            const mergeView = CodeMirror.MergeView(createFixture(), {
                chunkClassLocation: ["background", "wrap"],
                mode: "text/plain",
                orig: "same\noriginal\nend",
                value: "same\nedited\nend"
            });
            mergeViews.push(mergeView);

            expect(mergeView.editor()).toBeTruthy();
            expect(mergeView.rightOriginal()).toBeTruthy();
            expect(mergeView.leftOriginal()).toBeNull();
            expect(mergeView.rightChunks().length).toBe(1);
            expect(mergeView.editor().lineInfo(1).bgClass)
                .toContain("CodeMirror-merge-r-chunk");
            expect(mergeView.editor().lineInfo(1).wrapClass)
                .toContain("CodeMirror-merge-r-chunk");
            expect(mergeView.wrap.querySelector(
                ".CodeMirror-merge-scrolllock-enabled"
            )).not.toBeNull();
            expect(mergeView.wrap.querySelector(
                ".CodeMirror-merge-copy"
            )).not.toBeNull();
            mergeView.editor().setCursor(CodeMirror.Pos(0, 0));
            expect(CodeMirror.commands.goNextDiff(mergeView.editor()))
                .toBe(true);
            expect(mergeView.editor().getCursor().line).toBe(1);
            mergeView.setShowDifferences(false);
            expect(mergeView.right.showDifferences).toBe(false);
        });

        it("keeps distant changes separate in large MergeView documents", function () {
            const originalLines = Array.from(
                {length: 300},
                function (unused, index) {
                    return `unchanged line ${index}`;
                }
            );
            const editedLines = originalLines.slice();
            editedLines[20] = "first replacement";
            editedLines[280] = "second replacement";
            const mergeView = CodeMirror.MergeView(createFixture(), {
                mode: "text/plain",
                orig: originalLines.join("\n"),
                value: editedLines.join("\n")
            });
            mergeViews.push(mergeView);

            expect(mergeView.rightChunks()).toEqual([
                {
                    editFrom: 20,
                    editTo: 21,
                    origFrom: 20,
                    origTo: 21
                },
                {
                    editFrom: 280,
                    editTo: 281,
                    origFrom: 280,
                    origTo: 281
                }
            ]);
        });

        it("tracks large-document insert, replace, and delete chunks", function () {
            const originalLines = Array.from(
                {length: 260},
                function (unused, index) {
                    return `unique line ${index}`;
                }
            );
            const editedLines = originalLines.slice();
            editedLines.splice(30, 0, "inserted only");
            editedLines[141] = "replaced only";
            editedLines.splice(226, 1);
            const mergeView = CodeMirror.MergeView(createFixture(), {
                mode: "text/plain",
                orig: originalLines.join("\n"),
                value: editedLines.join("\n")
            });
            mergeViews.push(mergeView);

            expect(mergeView.rightChunks()).toEqual([
                {
                    editFrom: 30,
                    editTo: 31,
                    origFrom: 30,
                    origTo: 30
                },
                {
                    editFrom: 141,
                    editTo: 142,
                    origFrom: 140,
                    origTo: 141
                },
                {
                    editFrom: 226,
                    editTo: 226,
                    origFrom: 225,
                    origTo: 226
                }
            ]);
        });

        it("honors MergeView documents, whitespace, and revert controls", function () {
            const originalDocument = new CodeMirror.Doc(
                "same\noriginal\nend",
                "text/plain"
            );
            const mergeView = CodeMirror.MergeView(createFixture(), {
                allowEditingOriginals: true,
                mode: "text/plain",
                orig: originalDocument,
                value: "same\nedited\nend"
            });
            mergeViews.push(mergeView);

            expect(mergeView.rightOriginal().getDoc())
                .toBe(originalDocument);
            const revertButton = mergeView.wrap.querySelector(
                ".CodeMirror-merge-copy"
            );
            expect(revertButton).not.toBeNull();
            revertButton.dispatchEvent(new window.MouseEvent(
                "click",
                {bubbles: true}
            ));
            expect(mergeView.editor().getValue())
                .toBe("same\noriginal\nend");
            expect(mergeView.rightChunks()).toEqual([]);

            const whitespaceView = CodeMirror.MergeView(createFixture(), {
                ignoreWhitespace: true,
                mode: "javascript",
                orig: "const value=1;",
                value: "const value = 1;"
            });
            mergeViews.push(whitespaceView);
            expect(whitespaceView.rightChunks()).toEqual([]);
        });

        it("loads bundled modes and colorizes DOM through runMode", function () {
            let loaded = false;
            expect(CodeMirror.requireMode("javascript", function (result) {
                loaded = result;
            })).toBe(true);
            expect(loaded).toBe(true);

            const fixture = createFixture();
            const pre = window.document.createElement("pre");
            pre.setAttribute("data-lang", "javascript");
            pre.textContent = "const answer = 42;";
            fixture.appendChild(pre);
            CodeMirror.colorize([pre]);
            expect(pre.classList.contains("cm-s-default")).toBe(true);
            expect(pre.querySelector(".cm-keyword").textContent)
                .toBe("const");
        });

        it("renders stock legacy themes on the CM6 editing surface", function () {
            const editor = createEditor("const answer = 42;", {
                mode: "javascript",
                theme: "monokai"
            });
            const wrapper = editor.getWrapperElement();
            const keyword = wrapper.querySelector(".cm-keyword");

            expect(wrapper.classList.contains("cm-s-monokai")).toBe(true);
            expect(window.getComputedStyle(wrapper).backgroundColor)
                .toBe("rgb(39, 40, 34)");
            expect(keyword).not.toBeNull();
            expect(window.getComputedStyle(keyword).color)
                .toBe("rgb(249, 38, 114)");
        });

        it("provides simple scrollbar models with the CM5 lifecycle", function () {
            const nodes = [];
            const positions = [];
            const model = CodeMirror.scrollbarModel.simple(
                function (node) {
                    nodes.push(node);
                },
                function (position, orientation) {
                    positions.push([position, orientation]);
                }
            );
            expect(nodes.length).toBe(2);
            expect(model.update({
                barLeft: 0,
                clientHeight: 100,
                clientWidth: 100,
                scrollHeight: 200,
                scrollWidth: 200,
                viewHeight: 100,
                viewWidth: 100
            })).toEqual({bottom: 0, right: 0});
            model.horiz.moveTo(10);
            expect(positions.length).toBe(1);
            model.clear();
        });

        it("switches CM5 scrollbar styles on the CM6 editing surface", function () {
            const editor = createEditor(
                Array(100).join("long content that can scroll\\n"),
                {
                    mode: "text/plain",
                    scrollbarStyle: "native"
                }
            );
            const wrapper = editor.getWrapperElement();

            expect(editor.display.scrollbars).toBeTruthy();
            expect(wrapper.querySelector(
                ".CodeMirror-simplescroll-horizontal"
            )).toBeNull();

            editor.setOption("scrollbarStyle", "simple");
            expect(wrapper.classList.contains(
                "phoenix-cm6-custom-scrollbars"
            )).toBe(true);
            expect(wrapper.classList.contains(
                "CodeMirror-simplescroll"
            )).toBe(true);
            expect(wrapper.querySelector(
                ".CodeMirror-simplescroll-horizontal"
            )).not.toBeNull();
            expect(wrapper.querySelector(
                ".CodeMirror-simplescroll-vertical"
            )).not.toBeNull();

            editor.setOption("scrollbarStyle", "overlay");
            expect(wrapper.classList.contains(
                "CodeMirror-simplescroll"
            )).toBe(false);
            expect(wrapper.classList.contains(
                "CodeMirror-overlayscroll"
            )).toBe(true);
            expect(wrapper.querySelector(
                ".CodeMirror-simplescroll-horizontal"
            )).toBeNull();
            expect(wrapper.querySelector(
                ".CodeMirror-overlayscroll-horizontal"
            )).not.toBeNull();

            editor.setOption("scrollbarStyle", null);
            expect(wrapper.classList.contains(
                "phoenix-cm6-null-scrollbars"
            )).toBe(true);
            expect(wrapper.querySelector(
                ".CodeMirror-overlayscroll-horizontal"
            )).toBeNull();

            editor.setOption("scrollbarStyle", "native");
            expect(wrapper.classList.contains(
                "phoenix-cm6-custom-scrollbars"
            )).toBe(false);
            expect(wrapper.classList.contains(
                "phoenix-cm6-null-scrollbars"
            )).toBe(false);
            expect(wrapper.classList.contains(
                "CodeMirror-overlayscroll"
            )).toBe(false);
            expect(editor.display.scrollbars).toBeTruthy();
        });

        it("keeps the Tern facade usable when no Tern engine is present", function () {
            const editor = createEditor("const value = 1;", {
                mode: "javascript"
            });
            const ternServer = new CodeMirror.TernServer();
            ternServer.addDoc("sample.js", editor.getDoc());
            expect(ternServer.docs["sample.js"]).toBeTruthy();
            expect(ternServer.getHint.async).toBe(true);

            let requestError = null;
            ternServer.request(editor, "type", function (error) {
                requestError = error;
            });
            expect(requestError.code).toBe("PHOENIX_TERN_UNAVAILABLE");
            ternServer.delDoc("sample.js");
            expect(ternServer.docs["sample.js"]).toBeUndefined();
            ternServer.destroy();
        });

        it("supports Tern completions, navigation, rename, and references", function () {
            const requests = [];
            const addedFiles = [];
            const fakeServer = {
                addFile: function (name, text) {
                    addedFiles.push([name, text]);
                },
                delFile: function () {},
                request: function (request, callback) {
                    requests.push(request);
                    const type = request.query && request.query.type;
                    if (type === "completions") {
                        callback(null, {
                            completions: [{
                                doc: "A value",
                                name: "value",
                                type: "number"
                            }],
                            end: CodeMirror.Pos(0, 3),
                            start: CodeMirror.Pos(0, 0)
                        });
                    } else if (type === "type") {
                        callback(null, {
                            doc: "A number",
                            type: "number"
                        });
                    } else if (type === "definition") {
                        callback(null, {
                            end: CodeMirror.Pos(0, 6),
                            file: "target.js",
                            start: CodeMirror.Pos(0, 0)
                        });
                    } else if (type === "rename") {
                        callback(null, {
                            changes: [{
                                end: CodeMirror.Pos(0, 5),
                                file: "[doc]",
                                start: CodeMirror.Pos(0, 0),
                                text: "renamed"
                            }]
                        });
                    } else if (type === "refs") {
                        callback(null, {
                            refs: [{
                                end: CodeMirror.Pos(0, 5),
                                file: "[doc]",
                                start: CodeMirror.Pos(0, 0)
                            }, {
                                end: CodeMirror.Pos(1, 5),
                                file: "[doc]",
                                start: CodeMirror.Pos(1, 0)
                            }]
                        });
                    } else {
                        callback(null, {});
                    }
                }
            };
            const switched = [];
            const editor = createEditor("value\nvalue", {
                mode: "javascript"
            });
            const target = new CodeMirror.Doc(
                "target",
                "javascript"
            );
            const ternServer = new CodeMirror.TernServer({
                server: fakeServer,
                switchToDoc: function (name, doc) {
                    switched.push([name, doc]);
                    if (editor.getDoc() !== doc) {
                        editor.swapDoc(doc);
                    }
                }
            });
            ternServer.addDoc("target.js", target);

            let hints = null;
            editor.setCursor(CodeMirror.Pos(0, 3));
            ternServer.getHint(editor, function (result) {
                hints = result;
            });
            expect(addedFiles.some(function (entry) {
                return entry[0] === "[doc]";
            })).toBe(true);
            expect(hints.list[0].text).toBe("value");
            expect(hints.list[0].className)
                .toContain("CodeMirror-Tern-completion-number");

            let typeShown = false;
            ternServer.showType(editor, null, function () {
                typeShown = true;
            });
            expect(typeShown).toBe(true);
            expect(window.document.querySelector(
                ".CodeMirror-Tern-tooltip"
            ).textContent).toContain("number");

            ternServer.jumpToDef(editor);
            expect(switched[0][0]).toBe("target.js");
            expect(target.getCursor("from").line).toBe(0);
            expect(target.getCursor("from").ch).toBe(0);
            expect(target.getCursor("to").line).toBe(0);
            expect(target.getCursor("to").ch).toBe(6);
            expect(ternServer.jumpBack(editor)).toBe(true);
            expect(switched[1][0]).toBe("[doc]");

            spyOn(editor, "openDialog").and.callFake(function (
                _template,
                callback
            ) {
                callback("renamed");
            });
            editor.setCursor(CodeMirror.Pos(0, 2));
            ternServer.rename(editor);
            expect(editor.getLine(0)).toBe("renamed");

            ternServer.selectName(editor);
            expect(editor.listSelections().length).toBe(2);
            expect(requests.some(function (request) {
                return request.query &&
                    request.query.lineCharPositions === true;
            })).toBe(true);
            ternServer.destroy();
        });

        it("hard-wraps text and supports representative Emacs commands", function () {
            const editor = createEditor(
                "one two three",
                {mode: "text/plain"}
            );
            editor.wrapRange(
                CodeMirror.Pos(0, 0),
                CodeMirror.Pos(0, editor.getLine(0).length),
                {column: 7}
            );
            expect(editor.getValue()).toBe("one two\nthree");

            editor.setValue("alpha beta");
            editor.setSelection(
                CodeMirror.Pos(0, 0),
                CodeMirror.Pos(0, 5)
            );
            CodeMirror.commands.killRegion(editor);
            expect(editor.getValue()).toBe(" beta");
            CodeMirror.commands.yank(editor);
            expect(editor.getValue()).toBe("alpha beta");
            expect(CodeMirror.keyMap.emacs["Ctrl-K"])
                .toBe("killLineEmacs");
            expect(typeof CodeMirror.emacs.kill).toBe("function");
        });
    });
});
