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
 *
 */

/*! DONT_STRIP_MINIFY: CodeMirror 5-derived compatibility implementation.
 * See thirdparty/licences/codemirror5-derived.markdown.
 */

/**
 * Static legacy CodeMirror compatibility APIs used by Phoenix and its extensions.
 *
 * This module provides the utility functions and mutable registries that
 * historically lived on the CodeMirror constructor. Calling the exported
 * function creates an editor backed by the native CodeMirror 6 adapter.
 */
define(function (require, exports, module) {

    const CM6 = require("thirdparty/CodeMirror6/codemirror6"),
        LegacyModeMeta = require("editor/CodeMirrorLegacyModeMeta"),
        LegacyModesCompat = require("editor/CodeMirrorLegacyModesCompat");
    let editorConstructor = null;

    /**
     * Preserve the legacy callable CodeMirror constructor contract while
     * creating a native CodeMirror 6-backed editor.
     *
     * @param {Element|function(Element)} place
     * @param {Object=} options
     * @return {Object}
     */
    function _resolveEditorConstructor() {
        if (!editorConstructor) {
            // Keep this module out of CodeMirror6Adapter's static dependency
            // graph. RequireJS scans literal require() calls before executing
            // the factory, which otherwise gives the adapter a partially
            // initialized compatibility facade during the cycle.
            const adapterModule = require(["editor", "CodeMirror6Adapter"].join("/"));
            editorConstructor = adapterModule.CodeMirror6Adapter;
        }
        return editorConstructor;
    }

    function CodeMirrorCompat(place, options) {
        const suppliedOptions = options || {};
        const suppliedDoc = suppliedOptions.value instanceof CompatDoc ?
            suppliedOptions.value :
            null;
        if (suppliedDoc && suppliedDoc.getEditor()) {
            throw new Error("This document is already in use.");
        }

        const placeFunction = typeof place === "function" ? place : null;
        const parent = placeFunction || !place ?
            window.document.createElement("div") :
            place;
        const editorOptions = Object.assign({}, suppliedOptions);
        if (suppliedDoc) {
            editorOptions.value = suppliedDoc.getValue();
            editorOptions.mode = suppliedDoc._modeOption;
            editorOptions.lineSeparator = suppliedDoc._lineSeparator;
            editorOptions.direction = suppliedDoc._direction;
            editorOptions._compatDoc = suppliedDoc;
            editorOptions._compatDocSource = suppliedDoc._adapter;
            editorOptions._firstLine = suppliedDoc.firstLine();
        }
        const EditorConstructor = _resolveEditorConstructor();
        const instance = new EditorConstructor(parent, editorOptions);
        if (placeFunction) {
            placeFunction(instance.getWrapperElement());
        }
        return instance;
    }

    const NO_HANDLERS = [];
    const NON_ASCII_SINGLE_CASE_WORD_CHAR =
        /[\u00df\u0587\u0590-\u05f4\u0600-\u06ff\u3040-\u309f\u30a0-\u30ff\u3400-\u4db5\u4e00-\u9fcc\uac00-\ud7af]/;

    const Pass = {
        toString: function () {
            return "CodeMirror.Pass";
        }
    };
    const Init = {
        toString: function () {
            return "CodeMirror.Init";
        }
    };

    const defaults = {};
    const optionHandlers = {};
    const extensions = {};
    const docExtensions = {};
    const helpers = {};
    const commands = {};
    const keyMap = {};
    const inputStyles = {};
    const scrollbarModel = {};
    const modes = {};
    const mimeModes = {};
    const modeExtensions = {};
    const builtInModeFactories = {};
    const registeredInstances = new Map();
    const installedLegacyCompatibilityModules = new Set();
    const initHooks = [];
    const BRACKET_INFO = {
        "(": {matching: ")", direction: 1},
        ")": {matching: "(", direction: -1},
        "[": {matching: "]", direction: 1},
        "]": {matching: "[", direction: -1},
        "{": {matching: "}", direction: 1},
        "}": {matching: "{", direction: -1},
        "<": {matching: ">", direction: 1},
        ">": {matching: "<", direction: -1}
    };
    const DEFAULT_BRACKET_REGEX = /[()[\]{}]/;
    let nextDocId = 0;
    const bundledModes = Object.assign({}, CM6.legacyModeParsers || {}, {
        erlang: CM6.erlang,
        pascal: CM6.pascal,
        scheme: CM6.scheme
    });
    const bundledModeModules = CM6.legacyModeModules || {};
    const bundledModeMIMEs = CM6.legacyModeMIMEs || {};

    const DOC_DELEGATE_METHODS = [
        "addLineClass",
        "addLineWidget",
        "addSelection",
        "changeGeneration",
        "clearGutter",
        "clearHistory",
        "clipPos",
        "eachLine",
        "extendSelection",
        "extendSelections",
        "extendSelectionsBy",
        "findMarks",
        "findMarksAt",
        "findWordAt",
        "getAllMarks",
        "getCursor",
        "getExtending",
        "getHelper",
        "getHelpers",
        "getHistory",
        "getLine",
        "getLineHandle",
        "getLineHandleVisualStart",
        "getLineNumber",
        "getLineTokens",
        "getMode",
        "getModeAt",
        "getRange",
        "getSearchCursor",
        "getSelection",
        "getSelections",
        "getStateAfter",
        "getStateBefore",
        "getTokenAt",
        "getTokenTypeAt",
        "getValue",
        "historySize",
        "indexFromPos",
        "isClean",
        "lastLine",
        "lineCount",
        "lineInfo",
        "lineSeparator",
        "listSelections",
        "markClean",
        "markText",
        "posFromIndex",
        "redo",
        "redoSelection",
        "removeLineClass",
        "removeLineWidget",
        "replaceRange",
        "replaceSelection",
        "replaceSelections",
        "setBookmark",
        "setCursor",
        "setDirection",
        "setExtending",
        "setGutterMarker",
        "setHistory",
        "setSelection",
        "setSelections",
        "setValue",
        "somethingSelected",
        "splitLines",
        "undo",
        "undoSelection"
    ];

    function _initializeDoc(doc, adapter, options) {
        const settings = options || {};
        doc.id = ++nextDocId;
        doc._adapter = adapter || null;
        doc.cm = settings.editor || null;
        doc._links = [];
        doc._modeOption = settings.mode;
        doc._lineSeparator = settings.lineSeparator;
        doc._direction = settings.direction === "rtl" ? "rtl" : "ltr";
        doc._scrollLeft = Number(settings.scrollLeft) || 0;
        doc._scrollTop = Number(settings.scrollTop) || 0;
        doc._handlers = {};
        Object.keys(docExtensions).forEach(function (name) {
            doc[name] = docExtensions[name];
        });
        return doc;
    }

    /**
     * CM5-compatible document identity backed entirely by a CM6 adapter.
     * Detached documents keep a CM6 EditorState in an off-DOM EditorView so
     * all text, selection, history, marker, and token APIs use the same engine
     * as attached editors.
     *
     * @constructor
     * @param {string|Array<string>=} text
     * @param {*=} mode
     * @param {number=} firstLine
     * @param {string=} lineSeparator
     * @param {string=} direction
     */
    function CompatDoc(text, mode, firstLine, lineSeparator, direction) {
        if (!(this instanceof CompatDoc)) {
            return new CompatDoc(text, mode, firstLine, lineSeparator, direction);
        }

        _initializeDoc(this, null, {
            mode: mode,
            lineSeparator: lineSeparator,
            direction: direction
        });
        const holder = window.document.createElement("div");
        const EditorConstructor = _resolveEditorConstructor();
        const initialText = Array.isArray(text) ?
            text.join(lineSeparator || "\n") :
            String(text || "");
        this._adapter = new EditorConstructor(holder, {
            value: initialText,
            mode: mode,
            lineSeparator: lineSeparator,
            direction: direction,
            _compatDoc: this,
            _detachedDoc: true,
            _firstLine: firstLine === null || firstLine === undefined ?
                0 :
                firstLine
        });
    }

    DOC_DELEGATE_METHODS.forEach(function (methodName) {
        CompatDoc.prototype[methodName] = function () {
            if (!this._adapter || typeof this._adapter[methodName] !== "function") {
                throw new Error(`Document method ${methodName} is unavailable.`);
            }
            return this._adapter[methodName].apply(this._adapter, arguments);
        };
    });

    CompatDoc.prototype.firstLine = function () {
        return this._adapter ? this._adapter.firstLine() : 0;
    };

    CompatDoc.prototype.getEditor = function () {
        return this.cm;
    };

    Object.defineProperty(CompatDoc.prototype, "history", {
        configurable: true,
        enumerable: true,
        get: function () {
            return this._adapter ? this._adapter.history : undefined;
        }
    });

    CompatDoc.prototype.on = function (eventName, listener) {
        on(this, eventName, listener);
    };

    CompatDoc.prototype.off = function (eventName, listener) {
        off(this, eventName, listener);
    };

    CompatDoc.prototype.copy = function (copyHistory) {
        if (!this._adapter ||
                typeof this._adapter._copyDocument !== "function") {
            throw new Error("Document copying is unavailable.");
        }
        return this._adapter._copyDocument(Boolean(copyHistory));
    };

    CompatDoc.prototype.linkedDoc = function (options) {
        if (!this._adapter ||
                typeof this._adapter._createLinkedDocument !== "function") {
            throw new Error("Linked documents are unavailable.");
        }
        return this._adapter._createLinkedDocument(options || {});
    };

    CompatDoc.prototype.unlinkDoc = function (other) {
        const otherDoc = other && typeof other.getDoc === "function" ?
            other.getDoc() :
            other;
        if (!(otherDoc instanceof CompatDoc)) {
            return;
        }
        if (this._adapter &&
                typeof this._adapter._unlinkDocument === "function") {
            this._adapter._unlinkDocument(otherDoc);
        }
    };

    CompatDoc.prototype.iterLinkedDocs = function (callback) {
        const visited = new Set([this]);
        const visit = function (doc, sharedHistory) {
            doc._links.forEach(function (link) {
                if (visited.has(link.doc)) {
                    return;
                }
                visited.add(link.doc);
                const sharesHistory = sharedHistory && Boolean(link.sharedHist);
                callback(link.doc, sharesHistory);
                visit(link.doc, sharesHistory);
            });
        };
        visit(this, true);
    };

    function createDocumentForAdapter(adapter, options) {
        return _initializeDoc(Object.create(CompatDoc.prototype), adapter, options);
    }

    function Pos(line, ch, sticky) {
        if (!(this instanceof Pos)) {
            return new Pos(line, ch, sticky);
        }
        this.line = line;
        this.ch = ch;
        this.sticky = sticky === undefined ? null : sticky;
    }

    function cmpPos(left, right) {
        return left.line - right.line || left.ch - right.ch;
    }

    function splitLines(string) {
        return String(string).split(/\r\n?|\n/);
    }

    function defineLegacyInstanceCheck(constructor, predicate) {
        if (typeof Symbol !== "undefined" && Symbol.hasInstance) {
            Object.defineProperty(constructor, Symbol.hasInstance, {
                configurable: true,
                value: predicate
            });
        }
        return constructor;
    }

    const Line = defineLegacyInstanceCheck(function Line() {}, function (value) {
        return Boolean(
            value &&
            value._adapter &&
            Number.isFinite(value._position) &&
            typeof value.lineNo === "function"
        );
    });
    const TextMarker = defineLegacyInstanceCheck(
        function TextMarker() {},
        function (value) {
            return Boolean(
                value &&
                value._adapter &&
                (value.type === "range" || value.type === "bookmark") &&
                typeof value.clear === "function" &&
                typeof value.find === "function"
            );
        }
    );
    const LineWidget = defineLegacyInstanceCheck(
        function LineWidget() {},
        function (value) {
            return Boolean(
                value &&
                value.doc &&
                value.node &&
                value.line &&
                typeof value.clear === "function" &&
                typeof value.changed === "function"
            );
        }
    );

    function SharedTextMarker(markers, primary) {
        this.markers = markers || [];
        this.primary = primary || this.markers[0] || null;
        this._handlers = {};
        this._cleared = false;
    }

    SharedTextMarker.prototype.clear = function () {
        if (this._cleared) {
            return;
        }
        const found = this.find();
        this._cleared = true;
        this.markers.forEach(function (marker) {
            if (marker && typeof marker.clear === "function") {
                marker._clearingShared = true;
                marker.clear();
                marker._clearingShared = false;
            }
        });
        if (found) {
            const from = found.from || found;
            const to = found.to || found;
            signal(this, "clear", from, to);
        }
    };

    SharedTextMarker.prototype.find = function (side, lineObj) {
        return this.primary && typeof this.primary.find === "function" ?
            this.primary.find(side, lineObj) :
            undefined;
    };

    SharedTextMarker.prototype.on = function (eventName, listener) {
        on(this, eventName, listener);
    };

    SharedTextMarker.prototype.off = function (eventName, listener) {
        off(this, eventName, listener);
    };

    SharedTextMarker.prototype.changed = function () {
        this.markers.forEach(function (marker) {
            if (marker && typeof marker.changed === "function") {
                marker.changed();
            }
        });
        signal(this, "changed");
    };

    function defineInitHook(hook) {
        return initHooks.push(hook);
    }

    function findColumn(string, goal, tabSize) {
        let position = 0;
        let column = 0;
        const configuredTabSize = tabSize || 4;

        while (true) {
            let nextTab = string.indexOf("\t", position);
            if (nextTab === -1) {
                nextTab = string.length;
            }
            const skipped = nextTab - position;
            if (nextTab === string.length || column + skipped >= goal) {
                return position + Math.min(skipped, goal - column);
            }
            column += skipped;
            column += configuredTabSize - column % configuredTabSize;
            position = nextTab + 1;
            if (column >= goal) {
                return position;
            }
        }
    }

    function wheelEventPixels(event) {
        let x = Number(event.deltaX);
        let y = Number(event.deltaY);

        if (!Number.isFinite(x)) {
            x = event.wheelDeltaX === undefined ? 0 : -event.wheelDeltaX;
        }
        if (!Number.isFinite(y)) {
            if (event.wheelDeltaY !== undefined) {
                y = -event.wheelDeltaY;
            } else if (event.wheelDelta !== undefined) {
                y = -event.wheelDelta;
            } else {
                y = Number(event.detail) || 0;
            }
        }

        if (event.deltaMode === 1) {
            x *= 16;
            y *= 16;
        } else if (event.deltaMode === 2) {
            x *= window.innerWidth || 1;
            y *= window.innerHeight || 1;
        }

        return {x: x, y: y};
    }

    function ePreventDefault(event) {
        if (event.preventDefault) {
            event.preventDefault();
        } else {
            event.returnValue = false;
        }
    }

    function eStopPropagation(event) {
        if (event.stopPropagation) {
            event.stopPropagation();
        } else {
            event.cancelBubble = true;
        }
    }

    function eStop(event) {
        ePreventDefault(event);
        eStopPropagation(event);
    }

    function addClass(node, classNames) {
        String(classNames || "").split(/\s+/).filter(Boolean).forEach(function (className) {
            if (node.classList) {
                node.classList.add(className);
            } else if (!new RegExp("(^|\\s)" + className + "(?:$|\\s)").test(node.className)) {
                node.className += (node.className ? " " : "") + className;
            }
        });
    }

    function rmClass(node, classNames) {
        String(classNames || "").split(/\s+/).filter(Boolean).forEach(function (className) {
            if (node.classList) {
                node.classList.remove(className);
            } else {
                node.className = node.className
                    .split(/\s+/)
                    .filter(function (candidate) {
                        return candidate && candidate !== className;
                    })
                    .join(" ");
            }
        });
    }

    function contains(parent, child) {
        let current = child && child.nodeType === 3 ? child.parentNode : child;
        if (!parent || !current) {
            return false;
        }
        if (parent.contains && parent.contains(current)) {
            return true;
        }
        while (current) {
            if (current === parent) {
                return true;
            }
            current = current.nodeType === 11 && current.host ?
                current.host :
                current.parentNode;
        }
        return false;
    }

    /**
     * Minimal CM5 input-style facade over the CM6 content DOM. These
     * constructors remain public because some extensions inspect or subclass
     * CodeMirror.inputStyles, but input and composition are always owned by
     * the CM6 EditorView.
     *
     * @constructor
     * @param {!Object} editor
     * @param {boolean} supportsTouch
     */
    function CompatInputStyle(editor, supportsTouch) {
        this.cm = editor;
        this._supportsTouch = supportsTouch;
    }

    CompatInputStyle.prototype.init = function () {};
    CompatInputStyle.prototype.prepareSelection = function () {
        return null;
    };
    CompatInputStyle.prototype.showSelection = function () {};
    CompatInputStyle.prototype.showPrimarySelection = function () {};
    CompatInputStyle.prototype.reset = function () {};
    CompatInputStyle.prototype.resetPosition = function () {};
    CompatInputStyle.prototype.receivedFocus = function () {};
    CompatInputStyle.prototype.selectionChanged = function () {};
    CompatInputStyle.prototype.pollSelection = function () {};
    CompatInputStyle.prototype.pollContent = function () {};
    CompatInputStyle.prototype.ensurePolled = function () {};
    CompatInputStyle.prototype.forceCompositionEnd = function () {};
    CompatInputStyle.prototype.readFromDOMSoon = function () {};
    CompatInputStyle.prototype.updateFromDOM = function () {};
    CompatInputStyle.prototype.onKeyPress = function () {};
    CompatInputStyle.prototype.onContextMenu = function () {};
    CompatInputStyle.prototype.readOnlyChanged = function () {};
    CompatInputStyle.prototype.setUneditable = function (node) {
        if (node && node.setAttribute) {
            node.setAttribute("contenteditable", "false");
        }
    };
    CompatInputStyle.prototype.getField = function () {
        return this.cm && typeof this.cm.getInputField === "function" ?
            this.cm.getInputField() :
            null;
    };
    CompatInputStyle.prototype.getSelection = function () {
        const field = this.getField();
        const ownerDocument = field && field.ownerDocument;
        return ownerDocument && typeof ownerDocument.getSelection === "function" ?
            ownerDocument.getSelection() :
            null;
    };
    CompatInputStyle.prototype.focus = function () {
        if (this.cm && typeof this.cm.focus === "function") {
            this.cm.focus();
        }
    };
    CompatInputStyle.prototype.blur = function () {
        const field = this.getField();
        if (field && typeof field.blur === "function") {
            field.blur();
        }
    };
    CompatInputStyle.prototype.supportsTouch = function () {
        return this._supportsTouch;
    };
    CompatInputStyle.prototype.screenReaderLabelChanged = function (label) {
        const field = this.getField();
        if (!field) {
            return;
        }
        if (label) {
            field.setAttribute("aria-label", label);
        } else {
            field.removeAttribute("aria-label");
        }
    };

    function TextareaInputStyle(editor) {
        CompatInputStyle.call(this, editor, false);
    }
    TextareaInputStyle.prototype = Object.create(CompatInputStyle.prototype);
    TextareaInputStyle.prototype.constructor = TextareaInputStyle;

    function ContentEditableInputStyle(editor) {
        CompatInputStyle.call(this, editor, true);
    }
    ContentEditableInputStyle.prototype = Object.create(CompatInputStyle.prototype);
    ContentEditableInputStyle.prototype.constructor = ContentEditableInputStyle;

    function NativeScrollbarModel(_place, _scroll, editor) {
        this.cm = editor || null;
    }
    NativeScrollbarModel.prototype.update = function () {
        return {right: 0, bottom: 0};
    };
    NativeScrollbarModel.prototype.setScrollLeft = function (position) {
        if (this.cm && typeof this.cm.scrollTo === "function") {
            this.cm.scrollTo(position, null);
        }
    };
    NativeScrollbarModel.prototype.setScrollTop = function (position) {
        if (this.cm && typeof this.cm.scrollTo === "function") {
            this.cm.scrollTo(null, position);
        }
    };
    NativeScrollbarModel.prototype.clear = function () {};

    function NullScrollbarModel() {}
    NullScrollbarModel.prototype.update = function () {
        return {right: 0, bottom: 0};
    };
    NullScrollbarModel.prototype.setScrollLeft = function () {};
    NullScrollbarModel.prototype.setScrollTop = function () {};
    NullScrollbarModel.prototype.clear = function () {};

    inputStyles.textarea = TextareaInputStyle;
    inputStyles.contenteditable = ContentEditableInputStyle;
    scrollbarModel.native = NativeScrollbarModel;
    scrollbarModel.null = NullScrollbarModel;

    function changeEnd(change) {
        if (!change.text) {
            return change.to;
        }

        const text = typeof change.text === "string" ? splitLines(change.text) : change.text;
        return Pos(
            change.from.line + text.length - 1,
            text[text.length - 1].length + (text.length === 1 ? change.from.ch : 0)
        );
    }

    function _findTagNodeAt(tree, offset) {
        const candidates = [
            tree.resolveInner(offset, 1),
            tree.resolveInner(offset, -1)
        ];

        for (let index = 0; index < candidates.length; index++) {
            let node = candidates[index];
            while (node) {
                if ((node.name === "OpenTag" ||
                        node.name === "CloseTag" ||
                        node.name === "SelfClosingTag" ||
                        node.name === "MismatchedCloseTag") &&
                        node.from <= offset && offset < node.to) {
                    return node;
                }
                node = node.parent;
            }
        }
        return null;
    }

    function _tagInfo(editor, node) {
        if (!node) {
            return null;
        }
        const tagNameNode = node.getChild("TagName");
        if (!tagNameNode) {
            return null;
        }
        return {
            tag: editor._view.state.doc.sliceString(tagNameNode.from, tagNameNode.to),
            from: editor.posFromIndex(node.from),
            to: editor.posFromIndex(node.to)
        };
    }

    function _tagNodeInRange(editor, node, range) {
        if (!node || !range) {
            return Boolean(node);
        }
        const line = editor.posFromIndex(node.from).line;
        return line >= Math.max(0, range.from) &&
            line < Math.min(editor.lineCount(), range.to);
    }

    /**
     * Finds the opening and closing tags associated with the tag at a position.
     * This preserves the CodeMirror 5 xml-fold result shape while using the
     * active CodeMirror 6 syntax tree.
     * @param {!Object} editor CodeMirror-compatible editor instance
     * @param {{line:number, ch:number}} position
     * @param {{from:number, to:number}=} range Optional line range
     * @return {?{open:?Object, close:?Object, at:string}}
     */
    function findMatchingTag(editor, position, range) {
        if (!editor || !editor._view || !editor._view.state ||
                typeof editor.indexFromPos !== "function" ||
                typeof editor.posFromIndex !== "function") {
            return;
        }

        const state = editor._view.state;
        const offset = editor.indexFromPos(position);
        const tagNode = _findTagNodeAt(CM6.syntaxTree(state), offset);
        if (!tagNode) {
            return;
        }

        const here = _tagInfo(editor, tagNode);
        if (!here) {
            return;
        }
        if (tagNode.name === "SelfClosingTag") {
            return {
                open: here,
                close: null,
                at: "open"
            };
        }

        let element = tagNode.parent;
        while (element && element.name !== "Element") {
            element = element.parent;
        }

        let openNode = null;
        let closeNode = null;
        if (element) {
            openNode = element.getChild("OpenTag");
            closeNode = element.getChild("CloseTag");
        }

        if (tagNode.name === "OpenTag") {
            openNode = tagNode;
        } else {
            closeNode = tagNode;
        }

        const open = _tagNodeInRange(editor, openNode, range) ?
            _tagInfo(editor, openNode) :
            null;
        const close = _tagNodeInRange(editor, closeNode, range) ?
            _tagInfo(editor, closeNode) :
            null;

        if (open && close && open.tag.toLowerCase() !== close.tag.toLowerCase()) {
            if (tagNode === openNode) {
                return {
                    open: open,
                    close: null,
                    at: "open"
                };
            }
            return {
                open: null,
                close: close,
                at: "close"
            };
        }

        return {
            open: open,
            close: close,
            at: tagNode === openNode ? "open" : "close"
        };
    }

    function _getBracketRegex(config) {
        const configuredRegex = config && config.bracketRegex;
        return configuredRegex && typeof configuredRegex.test === "function" ?
            configuredRegex :
            DEFAULT_BRACKET_REGEX;
    }

    function _matchesBracket(regex, character) {
        regex.lastIndex = 0;
        return regex.test(character);
    }

    function _getStateLine(editor, lineNumber) {
        if (!editor || !editor._view || !editor._view.state ||
                typeof editor.firstLine !== "function") {
            return null;
        }

        const stateDoc = editor._view.state.doc;
        const stateLineNumber = lineNumber - editor.firstLine() + 1;
        if (stateLineNumber < 1 || stateLineNumber > stateDoc.lines) {
            return null;
        }
        return stateDoc.line(stateLineNumber).text;
    }

    function _sameBracketStyle(editor, lineNumber, character, style) {
        if (style === undefined) {
            return true;
        }
        const tokenStyle = editor.getTokenTypeAt(
            Pos(lineNumber, character + 1)
        );
        return (tokenStyle || "") === (style || "");
    }

    /**
     * Scans through the CM6 document state for the next bracket in the
     * requested direction, preserving the CodeMirror 5 result contract.
     * @param {!Object} editor CodeMirror-compatible editor instance
     * @param {{line:number, ch:number}} position
     * @param {number} direction Either 1 or -1
     * @param {string|null|undefined} style Token style to constrain the scan
     * @param {Object=} config
     * @return {{pos: !Pos, ch: string}|boolean|null}
     */
    function scanForBracket(editor, position, direction, style, config) {
        if (!position || !editor || !editor._view || !editor._view.state ||
                typeof editor.getTokenTypeAt !== "function" ||
                typeof editor.firstLine !== "function" ||
                typeof editor.lastLine !== "function") {
            return null;
        }

        const scanDirection = direction > 0 ? 1 : -1;
        const maxScanLineLength = config && config.maxScanLineLength || 10000;
        const maxScanLines = config && config.maxScanLines || 1000;
        const bracketRegex = _getBracketRegex(config);
        const firstLine = editor.firstLine();
        const lastLine = editor.lastLine();
        if (position.line < firstLine || position.line > lastLine) {
            return null;
        }

        const lineBoundary = scanDirection > 0 ?
            Math.min(position.line + maxScanLines, lastLine + 1) :
            Math.max(firstLine - 1, position.line - maxScanLines);
        let depth = 0;
        let lineNumber = position.line;

        for (; lineNumber !== lineBoundary; lineNumber += scanDirection) {
            const lineText = _getStateLine(editor, lineNumber);
            if (lineText === null || lineText.length > maxScanLineLength) {
                continue;
            }

            let character = scanDirection > 0 ? 0 : lineText.length - 1;
            const lineEnd = scanDirection > 0 ? lineText.length : -1;
            if (lineNumber === position.line) {
                character = position.ch - (scanDirection < 0 ? 1 : 0);
            }
            character = scanDirection > 0 ?
                Math.max(0, Math.min(character, lineText.length)) :
                Math.max(-1, Math.min(character, lineText.length - 1));

            for (; character !== lineEnd; character += scanDirection) {
                const bracket = lineText.charAt(character);
                if (!_matchesBracket(bracketRegex, bracket) ||
                        !_sameBracketStyle(
                            editor,
                            lineNumber,
                            character,
                            style
                        )) {
                    continue;
                }

                const bracketInfo = BRACKET_INFO[bracket];
                if (bracketInfo &&
                        bracketInfo.direction === scanDirection) {
                    depth++;
                } else if (depth === 0) {
                    return {
                        pos: Pos(lineNumber, character),
                        ch: bracket
                    };
                } else {
                    depth--;
                }
            }
        }

        const scannedToDocumentEdge = lineNumber - scanDirection === (
            scanDirection > 0 ? lastLine : firstLine
        );
        return scannedToDocumentEdge ? false : null;
    }

    /**
     * Finds the bracket adjacent to a cursor and its partner using the CM6
     * state-backed scanner, returning the historical CM5 result shape.
     * @param {!Object} editor CodeMirror-compatible editor instance
     * @param {{line:number, ch:number}} position
     * @param {Object=} config
     * @return {?{from:!Pos, to:(!Pos|boolean), match:boolean, forward:boolean}}
     */
    function findMatchingBracket(editor, position, config) {
        if (!position || !editor ||
                typeof editor.getWrapperElement !== "function") {
            return null;
        }

        const lineText = _getStateLine(editor, position.line);
        if (lineText === null) {
            return null;
        }

        const cursorCharacter = Number.isFinite(Number(position.ch)) ?
            Number(position.ch) :
            0;
        const bracketRegex = _getBracketRegex(config);
        let bracketCharacter = cursorCharacter - 1;
        let afterCursor = config && config.afterCursor;
        if (afterCursor === null || afterCursor === undefined) {
            afterCursor = /(^| )cm-fat-cursor($| )/.test(
                editor.getWrapperElement().className
            );
        }

        let bracket = lineText.charAt(bracketCharacter);
        if (afterCursor || bracketCharacter < 0 ||
                !_matchesBracket(bracketRegex, bracket) ||
                !BRACKET_INFO[bracket]) {
            bracketCharacter++;
            bracket = lineText.charAt(bracketCharacter);
            if (!_matchesBracket(bracketRegex, bracket) ||
                    !BRACKET_INFO[bracket]) {
                return null;
            }
        }

        const bracketInfo = BRACKET_INFO[bracket];
        const direction = bracketInfo.direction;
        if (config && config.strict &&
                (direction > 0) !== (bracketCharacter === cursorCharacter)) {
            return null;
        }

        const style = editor.getTokenTypeAt(
            Pos(position.line, bracketCharacter + 1)
        );
        const found = scanForBracket(
            editor,
            Pos(
                position.line,
                bracketCharacter + (direction > 0 ? 1 : 0)
            ),
            direction,
            style,
            config
        );
        if (found === null || found === undefined) {
            return null;
        }

        return {
            from: Pos(position.line, bracketCharacter),
            to: found && found.pos,
            match: Boolean(found && found.ch === bracketInfo.matching),
            forward: direction > 0
        };
    }

    function _configuredBracketOptions(editor, config) {
        if (config) {
            return config;
        }
        const option = editor && typeof editor.getOption === "function" ?
            editor.getOption("matchBrackets") :
            null;
        return option && typeof option === "object" ? option : {};
    }

    /**
     * Highlights matching brackets through the adapter's CM6-backed marker
     * layer. With autoclear disabled, returns a cleanup function.
     * @param {!Object} editor CodeMirror-compatible editor instance
     * @param {boolean=} autoclear
     * @param {Object=} config
     * @return {function()|undefined}
     */
    function matchBrackets(editor, autoclear, config) {
        if (!editor || typeof editor.listSelections !== "function" ||
                typeof editor.markText !== "function") {
            return;
        }

        const bracketOptions = _configuredBracketOptions(editor, config);
        const maxHighlightLineLength =
            bracketOptions.maxHighlightLineLength || 1000;
        const highlightNonMatching =
            bracketOptions.highlightNonMatching !== false;
        const markers = [];

        editor.listSelections().forEach(function (selection) {
            if (!selection.empty()) {
                return;
            }
            const match = findMatchingBracket(
                editor,
                selection.head,
                bracketOptions
            );
            if (!match || !match.match && !highlightNonMatching) {
                return;
            }

            const fromLine = _getStateLine(editor, match.from.line);
            if (fromLine !== null &&
                    fromLine.length <= maxHighlightLineLength) {
                const className = match.match ?
                    "CodeMirror-matchingbracket" :
                    "CodeMirror-nonmatchingbracket";
                markers.push(editor.markText(
                    match.from,
                    Pos(match.from.line, match.from.ch + 1),
                    {className: className}
                ));
                if (match.to) {
                    const toLine = _getStateLine(editor, match.to.line);
                    if (toLine !== null &&
                            toLine.length <= maxHighlightLineLength) {
                        markers.push(editor.markText(
                            match.to,
                            Pos(match.to.line, match.to.ch + 1),
                            {className: className}
                        ));
                    }
                }
            }
        });

        if (!markers.length) {
            return;
        }

        const clear = function () {
            const clearMarkers = function () {
                markers.forEach(function (marker) {
                    marker.clear();
                });
            };
            if (typeof editor.operation === "function") {
                editor.operation(clearMarkers);
            } else {
                clearMarkers();
            }
        };

        if (autoclear) {
            window.setTimeout(clear, 800);
            return;
        }
        return clear;
    }

    function countColumn(string, end, tabSize, startIndex, startValue) {
        if (end === null || end === undefined) {
            end = string.search(/[^\s\u00a0]/);
            if (end === -1) {
                end = string.length;
            }
        }

        const effectiveTabSize = tabSize || 4;
        let index = startIndex || 0;
        let column = startValue || 0;

        for (;;) {
            const nextTab = string.indexOf("\t", index);
            if (nextTab < 0 || nextTab >= end) {
                return column + end - index;
            }
            column += nextTab - index;
            column += effectiveTabSize - column % effectiveTabSize;
            index = nextTab + 1;
        }
    }

    function isWordChar(character) {
        return /\w/.test(character) ||
            character > "\x80" &&
            (character.toUpperCase() !== character.toLowerCase() ||
                NON_ASCII_SINGLE_CASE_WORD_CHAR.test(character));
    }

    function on(emitter, type, handler) {
        if (emitter.isCodeMirror6 && typeof emitter.on === "function") {
            emitter.on(type, handler);
        } else if (emitter.addEventListener) {
            emitter.addEventListener(type, handler, false);
        } else if (emitter.attachEvent) {
            emitter.attachEvent("on" + type, handler);
        } else {
            const handlers = emitter._handlers || (emitter._handlers = {});
            handlers[type] = (handlers[type] || NO_HANDLERS).concat(handler);
        }
    }

    function off(emitter, type, handler) {
        if (emitter.isCodeMirror6 && typeof emitter.off === "function") {
            emitter.off(type, handler);
        } else if (emitter.removeEventListener) {
            emitter.removeEventListener(type, handler, false);
        } else if (emitter.detachEvent) {
            emitter.detachEvent("on" + type, handler);
        } else {
            const handlers = emitter._handlers;
            const listeners = handlers && handlers[type];
            if (!listeners) {
                return;
            }

            const index = listeners.indexOf(handler);
            if (index > -1) {
                handlers[type] = listeners.slice(0, index).concat(listeners.slice(index + 1));
            }
        }
    }

    function signal(emitter, type) {
        const args = Array.prototype.slice.call(arguments, 2);
        if (emitter.isCodeMirror6 && typeof emitter._emit === "function") {
            emitter._emit.apply(emitter, [type].concat(args));
            return;
        }

        const handlers = emitter._handlers && emitter._handlers[type] || NO_HANDLERS;
        if (!handlers.length) {
            return;
        }

        handlers.forEach(function (handler) {
            handler.apply(null, args);
        });
    }

    function defineOption(name, defaultValue, handler, notOnInit) {
        defaults[name] = defaultValue;

        const previous = optionHandlers[name];
        if (handler) {
            optionHandlers[name] = {
                defaultValue: defaultValue,
                handler: handler,
                notOnInit: Boolean(notOnInit)
            };
        } else if (previous) {
            previous.defaultValue = defaultValue;
        } else {
            optionHandlers[name] = {
                defaultValue: defaultValue,
                handler: null,
                notOnInit: Boolean(notOnInit)
            };
        }
    }

    function runOptionHandler(instance, name, value, oldValue) {
        const definition = optionHandlers[name];
        if (!definition || !definition.handler ||
                definition.notOnInit && oldValue === Init) {
            return;
        }
        return definition.handler(instance, value, oldValue);
    }

    function initOptions(instance, suppliedOptions) {
        const options = Object.assign({}, defaults, suppliedOptions || {});
        instance.options = options;

        Object.keys(optionHandlers).forEach(function (name) {
            runOptionHandler(instance, name, options[name], Init);
        });
        if (typeof options.finishInit === "function") {
            options.finishInit(instance);
        }
        initHooks.forEach(function (hook) {
            hook(instance);
        });

        return options;
    }

    function fromTextArea(textArea, suppliedOptions) {
        const options = Object.assign({}, suppliedOptions || {});
        const previousDisplay = textArea.style.display;
        let codeMirror;
        let realSubmit;
        let wrappedSubmit;

        options.value = textArea.value;
        if (!options.tabindex && textArea.tabIndex) {
            options.tabindex = textArea.tabIndex;
        }
        if (!options.placeholder && textArea.placeholder) {
            options.placeholder = textArea.placeholder;
        }
        if (options.autofocus === null || options.autofocus === undefined) {
            const root = textArea.getRootNode ? textArea.getRootNode() : textArea.ownerDocument;
            const activeElement = root.activeElement;
            options.autofocus = activeElement === textArea ||
                textArea.hasAttribute("autofocus") &&
                activeElement === textArea.ownerDocument.body;
        }

        function save() {
            textArea.value = codeMirror.getValue();
        }

        if (textArea.form) {
            textArea.form.addEventListener("submit", save);
            if (!options.leaveSubmitMethodAlone) {
                const form = textArea.form;
                realSubmit = form.submit;
                try {
                    wrappedSubmit = function () {
                        save();
                        form.submit = realSubmit;
                        form.submit();
                        form.submit = wrappedSubmit;
                    };
                    form.submit = wrappedSubmit;
                } catch (error) {
                    realSubmit = null;
                }
            }
        }

        options.finishInit = function (instance) {
            codeMirror = instance;
            instance.save = save;
            instance.getTextArea = function () {
                return textArea;
            };
            instance.toTextArea = function () {
                if (!codeMirror) {
                    return;
                }
                save();
                const wrapper = instance.getWrapperElement();
                instance.destroy();
                if (wrapper && wrapper.parentNode) {
                    wrapper.parentNode.removeChild(wrapper);
                }
                textArea.style.display = previousDisplay;
                if (textArea.form) {
                    textArea.form.removeEventListener("submit", save);
                    if (realSubmit && textArea.form.submit === wrappedSubmit) {
                        textArea.form.submit = realSubmit;
                    }
                }
                codeMirror = null;
            };
        };

        textArea.style.display = "none";
        codeMirror = CodeMirrorCompat(function (node) {
            textArea.parentNode.insertBefore(node, textArea.nextSibling);
        }, options);
        return codeMirror;
    }

    function defineExtension(name, extension) {
        extensions[name] = extension;
        CodeMirrorCompat.prototype[name] = extension;
        registeredInstances.forEach(function (_doc, instance) {
            instance[name] = extension;
        });
    }

    function defineDocExtension(name, extension) {
        docExtensions[name] = extension;
        CompatDoc.prototype[name] = extension;
        registeredInstances.forEach(function (doc) {
            if (doc) {
                doc[name] = extension;
            }
        });
    }

    function installExtensions(instance, doc) {
        if (instance) {
            Object.keys(extensions).forEach(function (name) {
                instance[name] = extensions[name];
            });
        }
        if (doc) {
            Object.keys(docExtensions).forEach(function (name) {
                doc[name] = docExtensions[name];
            });
        }
    }

    function registerInstance(instance, doc) {
        const targetDoc = doc ||
            (typeof instance.getDoc === "function" ? instance.getDoc() : null);
        registeredInstances.set(instance, targetDoc);
        installExtensions(instance, targetDoc);
        return instance;
    }

    function unregisterInstance(instance) {
        registeredInstances.delete(instance);
    }

    function registerEditorConstructor(constructor) {
        editorConstructor = constructor;
    }

    function registerHelper(type, name, value) {
        if (!helpers[type]) {
            helpers[type] = {_global: []};
            CodeMirrorCompat[type] = helpers[type];
        }
        helpers[type][name] = value;
    }

    function registerGlobalHelper(type, name, predicate, value) {
        registerHelper(type, name, value);
        helpers[type]._global.push({
            pred: predicate,
            val: value
        });
    }

    function getHelpers(editor, position, type) {
        const result = [];
        const registry = helpers[type];
        if (!registry) {
            return result;
        }
        const mode = editor.getModeAt(position);

        if (typeof mode[type] === "string") {
            if (registry[mode[type]]) {
                result.push(registry[mode[type]]);
            }
        } else if (Array.isArray(mode[type])) {
            mode[type].forEach(function (name) {
                if (registry[name]) {
                    result.push(registry[name]);
                }
            });
        } else if (mode.helperType && registry[mode.helperType]) {
            result.push(registry[mode.helperType]);
        } else if (registry[mode.name]) {
            result.push(registry[mode.name]);
        }

        registry._global.forEach(function (globalHelper) {
            if (globalHelper.pred(mode, editor) &&
                    result.indexOf(globalHelper.val) === -1) {
                result.push(globalHelper.val);
            }
        });
        return result;
    }

    function _nativeKeyMapCommand(bindings, key, shifted) {
        const binding = (bindings || []).find(function (candidate) {
            return candidate.key === key;
        });
        return binding && (shifted ? binding.shift : binding.run);
    }

    function _runNativeViewCommand(editor, command) {
        if (!editor || !editor._view || typeof command !== "function") {
            return false;
        }
        return Boolean(command(editor._view));
    }

    function _legacyHintText(completion) {
        if (typeof completion === "string") {
            return completion;
        }
        if (!completion) {
            return "";
        }
        if (completion.text !== null && completion.text !== undefined) {
            return String(completion.text);
        }
        return completion.displayText !== null &&
            completion.displayText !== undefined ?
            String(completion.displayText) :
            "";
    }

    function _requestLegacyHints(hint, editor, options) {
        return new Promise(function (resolve, reject) {
            let completed = false;
            const finish = function (result) {
                if (!completed) {
                    completed = true;
                    resolve(result || null);
                }
            };

            try {
                if (hint.async) {
                    hint(editor, finish, options);
                    return;
                }

                const result = hint(editor, options);
                if (result && typeof result.then === "function") {
                    result.then(finish, reject);
                } else {
                    finish(result);
                }
            } catch (error) {
                reject(error);
            }
        });
    }

    function _applicableHintHelpers(editor, candidates) {
        if (!editor.somethingSelected()) {
            return candidates;
        }
        return candidates.filter(function (candidate) {
            return candidate.supportsSelection;
        });
    }

    function _resolveAutoHint(editor, position) {
        const hintHelpers = editor.getHelpers(position, "hint");
        const hintWords = editor.getHelper(position, "hintWords");

        if (hintHelpers.length) {
            const resolved = function (currentEditor, callback, options) {
                const candidates = _applicableHintHelpers(
                    currentEditor,
                    hintHelpers
                );
                const tryHint = function (index) {
                    if (index >= candidates.length) {
                        callback(null);
                        return;
                    }
                    _requestLegacyHints(
                        candidates[index],
                        currentEditor,
                        options
                    ).then(function (result) {
                        if (result && result.list && result.list.length) {
                            callback(result);
                        } else {
                            tryHint(index + 1);
                        }
                    }).catch(function () {
                        tryHint(index + 1);
                    });
                };
                tryHint(0);
            };
            resolved.async = true;
            resolved.supportsSelection = true;
            return resolved;
        }
        if (hintWords) {
            return function (currentEditor) {
                return CodeMirrorCompat.hint.fromList(currentEditor, {
                    words: hintWords
                });
            };
        }
        if (CodeMirrorCompat.hint.anyword) {
            return function (currentEditor, options) {
                return CodeMirrorCompat.hint.anyword(currentEditor, options);
            };
        }
        return function () {};
    }

    function _parseLegacyHintOptions(editor, suppliedOptions) {
        const options = Object.assign({
            hint: CodeMirrorCompat.hint.auto,
            completeSingle: true,
            alignWithWord: true,
            closeCharacters: /[\s()[\]{};:>,]/,
            closeOnUnfocus: true,
            completeOnSingleClick: true,
            container: null,
            customKeys: null,
            extraKeys: null
        }, editor.getOption("hintOptions") || {}, suppliedOptions || {});

        if (options.hint && typeof options.hint.resolve === "function") {
            options.hint = options.hint.resolve(
                editor,
                editor.getCursor("start")
            );
        }
        return options;
    }

    function _closeLegacyHint(editor, completion, closeNative) {
        if (!completion || editor.state.completionActive !== completion) {
            return;
        }
        if (closeNative !== false) {
            _runNativeViewCommand(
                editor,
                _nativeKeyMapCommand(CM6.completionKeymap, "Escape")
            );
        }
        if (completion.keyMap) {
            editor.removeKeyMap(completion.keyMap);
        }
        if (completion.blurHandler) {
            editor.off("blur", completion.blurHandler);
        }
        editor.state.completionActive = null;
        if (completion.opened && completion.data) {
            signal(completion.data, "close");
        }
        signal(editor, "endCompletion", editor);
    }

    function _applyLegacyHint(editor, completion, data, item, from, to) {
        const itemOptions = typeof item === "object" && item ? item : {};
        const itemFrom = itemOptions.from || data.from ||
            editor.posFromIndex(from);
        const itemTo = itemOptions.to || data.to ||
            editor.posFromIndex(to);

        if (typeof itemOptions.hint === "function") {
            itemOptions.hint(editor, data, itemOptions);
        } else {
            editor.replaceRange(
                _legacyHintText(item),
                itemFrom,
                itemTo,
                "complete"
            );
        }
        signal(data, "pick", item);
        _closeLegacyHint(editor, completion, false);
    }

    function _convertLegacyHintResult(editor, completion, data, context) {
        if (!data || !Array.isArray(data.list) || !data.list.length) {
            return null;
        }

        const from = data.from ?
            editor.indexFromPos(editor.clipPos(data.from)) :
            context.pos;
        const to = data.to ?
            editor.indexFromPos(editor.clipPos(data.to)) :
            context.pos;
        const selectedHint = Math.max(
            0,
            Math.min(Number(data.selectedHint) || 0, data.list.length - 1)
        );
        const converted = data.list.map(function (item, index) {
            const itemOptions = typeof item === "object" && item ? item : {};
            const text = _legacyHintText(item);
            const completionItem = {
                label: text || " ",
                apply: function (_view, _selected, completionFrom, completionTo) {
                    _applyLegacyHint(
                        editor,
                        completion,
                        data,
                        item,
                        completionFrom,
                        completionTo
                    );
                },
                _legacyClassName: itemOptions.className || "",
                _legacyData: data,
                _legacyItem: item
            };

            if (itemOptions.displayText !== null &&
                    itemOptions.displayText !== undefined) {
                completionItem.displayLabel = String(itemOptions.displayText);
            }
            if (itemOptions.detail !== null && itemOptions.detail !== undefined) {
                completionItem.detail = String(itemOptions.detail);
            }
            if (itemOptions.type) {
                completionItem.type = itemOptions.type;
            }
            if (index === selectedHint) {
                completionItem.boost = 1000000;
            }
            return completionItem;
        });

        return {
            filter: false,
            from: Math.min(from, context.pos),
            options: converted,
            to: Math.max(from, to)
        };
    }

    function _legacyHintKeyMap(editor, completion) {
        const moveDown = _nativeKeyMapCommand(
            CM6.completionKeymap,
            "ArrowDown"
        );
        const moveUp = _nativeKeyMapCommand(
            CM6.completionKeymap,
            "ArrowUp"
        );
        const pageDown = _nativeKeyMapCommand(
            CM6.completionKeymap,
            "PageDown"
        );
        const pageUp = _nativeKeyMapCommand(
            CM6.completionKeymap,
            "PageUp"
        );
        const accept = _nativeKeyMapCommand(
            CM6.completionKeymap,
            "Enter"
        );
        const run = function (command) {
            return _runNativeViewCommand(editor, command) ?
                true :
                Pass;
        };

        return {
            Up: function () {
                return run(moveUp);
            },
            Down: function () {
                return run(moveDown);
            },
            PageUp: function () {
                return run(pageUp);
            },
            PageDown: function () {
                return run(pageDown);
            },
            Enter: function () {
                return run(accept);
            },
            Tab: function () {
                return run(accept);
            },
            Esc: function () {
                completion.close();
                return true;
            }
        };
    }

    function _openLegacyHint(editor, suppliedOptions) {
        const options = _parseLegacyHintOptions(editor, suppliedOptions);
        const hint = options.hint;
        const selections = editor.listSelections();

        if (typeof hint !== "function" || selections.length > 1) {
            return;
        }
        if (editor.somethingSelected()) {
            if (!hint.supportsSelection) {
                return;
            }
            for (let index = 0; index < selections.length; index++) {
                if (selections[index].head.line !==
                        selections[index].anchor.line) {
                    return;
                }
            }
        }

        if (editor.state.completionActive) {
            editor.state.completionActive.close();
        }

        const completion = {
            blurHandler: null,
            data: null,
            keyMap: null,
            opened: false,
            active: function () {
                return editor.state.completionActive === completion;
            },
            close: function () {
                _closeLegacyHint(editor, completion, true);
            }
        };
        editor.state.completionActive = completion;
        signal(editor, "startCompletion", editor);

        completion.promise = _requestLegacyHints(
            hint,
            editor,
            options
        ).then(function (initialData) {
            if (!completion.active()) {
                return;
            }
            if (!initialData || !Array.isArray(initialData.list) ||
                    !initialData.list.length) {
                _closeLegacyHint(editor, completion, false);
                return;
            }

            completion.data = initialData;
            if (options.completeSingle && initialData.list.length === 1) {
                const cursorOffset = editor.indexFromPos(editor.getCursor());
                _applyLegacyHint(
                    editor,
                    completion,
                    initialData,
                    initialData.list[0],
                    cursorOffset,
                    cursorOffset
                );
                return;
            }

            let firstResult = initialData;
            const source = function (context) {
                if (firstResult) {
                    const result = firstResult;
                    firstResult = null;
                    return _convertLegacyHintResult(
                        editor,
                        completion,
                        result,
                        context
                    );
                }
                return _requestLegacyHints(
                    hint,
                    editor,
                    options
                ).then(function (nextData) {
                    if (!completion.active()) {
                        return null;
                    }
                    if (completion.data) {
                        signal(completion.data, "update");
                    }
                    completion.data = nextData;
                    if (!nextData || !Array.isArray(nextData.list) ||
                            !nextData.list.length) {
                        window.setTimeout(function () {
                            _closeLegacyHint(editor, completion, false);
                        }, 0);
                        return null;
                    }
                    signal(nextData, "shown");
                    return _convertLegacyHintResult(
                        editor,
                        completion,
                        nextData,
                        context
                    );
                });
            };
            const autocomplete = CM6.autocompletion({
                activateOnTyping: false,
                closeOnBlur: options.closeOnUnfocus !== false,
                defaultKeymap: true,
                filterStrict: false,
                optionClass: function (item) {
                    return item._legacyClassName || "";
                },
                override: [source],
                selectOnOpen: true
            });

            if (!editor.state.legacyHintCompartment) {
                editor.state.legacyHintCompartment = new CM6.Compartment();
                editor._view.dispatch({
                    effects: CM6.StateEffect.appendConfig.of(
                        editor.state.legacyHintCompartment.of(autocomplete)
                    )
                });
            } else {
                editor._view.dispatch({
                    effects: editor.state.legacyHintCompartment.reconfigure(
                        autocomplete
                    )
                });
            }

            completion.opened = true;
            completion.keyMap = _legacyHintKeyMap(editor, completion);
            editor.addKeyMap(completion.keyMap);
            if (options.closeOnUnfocus !== false) {
                completion.blurHandler = function () {
                    completion.close();
                };
                editor.on("blur", completion.blurHandler);
            }
            signal(initialData, "shown");

            const startCompletion = _nativeKeyMapCommand(
                CM6.completionKeymap,
                "Ctrl-Space"
            );
            if (!_runNativeViewCommand(editor, startCompletion)) {
                _closeLegacyHint(editor, completion, false);
            }
        }).catch(function (error) {
            completion.error = error;
            _closeLegacyHint(editor, completion, true);
        });

        return completion;
    }

    function _installLegacyHintCompatibility() {
        if (installedLegacyCompatibilityModules.has("hint")) {
            return true;
        }
        if (!CM6.autocompletion ||
                !_nativeKeyMapCommand(CM6.completionKeymap, "Ctrl-Space")) {
            return false;
        }

        registerHelper("hint", "fromList", function (editor, options) {
            const cursor = editor.getCursor();
            const token = editor.getTokenAt(cursor);
            const tokenText = token.string || "";
            const endsWithWord = tokenText &&
                /\w/.test(tokenText.charAt(tokenText.length - 1));
            const term = endsWithWord ? tokenText : "";
            const from = endsWithWord ?
                Pos(cursor.line, token.start) :
                Pos(cursor.line, cursor.ch);
            const to = Pos(cursor.line, cursor.ch);
            const words = options && options.words || [];
            const list = words.filter(function (word) {
                return String(word).slice(0, term.length) === term;
            });
            return list.length ? {
                from: from,
                list: list,
                to: to
            } : undefined;
        });

        registerHelper("hint", "anyword", function (editor, options) {
            const word = options && options.word || /[\w$]+/;
            const range = options && options.range || 500;
            const cursor = editor.getCursor();
            const currentLine = editor.getLine(cursor.line);
            let start = cursor.ch;
            while (start) {
                word.lastIndex = 0;
                if (!word.test(currentLine.charAt(start - 1))) {
                    break;
                }
                start--;
            }
            const currentWord = start !== cursor.ch &&
                currentLine.slice(start, cursor.ch);
            const list = options && options.list ?
                options.list.slice() :
                [];
            const seen = {};
            list.forEach(function (item) {
                seen[_legacyHintText(item)] = true;
            });
            const flags = [
                word.ignoreCase ? "i" : "",
                word.multiline ? "m" : "",
                word.unicode ? "u" : ""
            ].join("");
            const expression = new RegExp(word.source, "g" + flags);

            for (let direction = -1; direction <= 1; direction += 2) {
                let line = cursor.line;
                const endLine = Math.min(
                    Math.max(line + direction * range, editor.firstLine()),
                    editor.lastLine()
                ) + direction;
                for (; line !== endLine; line += direction) {
                    const text = editor.getLine(line);
                    expression.lastIndex = 0;
                    let match;
                    while ((match = expression.exec(text))) {
                        if (line === cursor.line &&
                                match[0] === currentWord) {
                            continue;
                        }
                        if ((!currentWord ||
                                match[0].indexOf(currentWord) === 0) &&
                                !seen[match[0]]) {
                            seen[match[0]] = true;
                            list.push(match[0]);
                        }
                        if (!match[0].length) {
                            expression.lastIndex++;
                        }
                    }
                }
            }
            return {
                from: Pos(cursor.line, start),
                list: list,
                to: Pos(cursor.line, cursor.ch)
            };
        });

        registerHelper("hint", "auto", {
            resolve: _resolveAutoHint
        });
        defineOption("hintOptions", null);
        defineExtension("showHint", function (options) {
            return _openLegacyHint(this, options);
        });
        CodeMirrorCompat.showHint = function (editor, getHints, options) {
            if (!getHints) {
                return editor.showHint(options);
            }
            if (options && options.async) {
                getHints.async = true;
            }
            return editor.showHint(Object.assign({}, options || {}, {
                hint: getHints
            }));
        };
        commands.autocomplete = function (editor) {
            return editor.showHint();
        };

        installedLegacyCompatibilityModules.add("hint");
        return true;
    }

    function _installLegacySearchCompatibility() {
        if (installedLegacyCompatibilityModules.has("search")) {
            return true;
        }

        const openSearch = _nativeKeyMapCommand(
            CM6.searchKeymap,
            "Mod-f"
        );
        const findNext = _nativeKeyMapCommand(
            CM6.searchKeymap,
            "Mod-g"
        );
        const findPrevious = _nativeKeyMapCommand(
            CM6.searchKeymap,
            "Mod-g",
            true
        );
        const closeSearch = _nativeKeyMapCommand(
            CM6.searchKeymap,
            "Escape"
        );
        const goToLine = _nativeKeyMapCommand(
            CM6.searchKeymap,
            "Mod-Alt-g"
        );
        if (!openSearch || !findNext || !findPrevious ||
                !closeSearch || !goToLine) {
            return false;
        }

        const command = function (nativeCommand) {
            return function (editor) {
                return _runNativeViewCommand(editor, nativeCommand);
            };
        };
        commands.find = command(openSearch);
        commands.findPersistent = commands.find;
        commands.findNext = command(findNext);
        commands.findPersistentNext = commands.findNext;
        commands.findPrev = command(findPrevious);
        commands.findPersistentPrev = commands.findPrev;
        commands.clearSearch = command(closeSearch);
        commands.replace = commands.find;
        commands.replaceAll = commands.find;
        commands.jumpToLine = command(goToLine);

        installedLegacyCompatibilityModules.add("search");
        return true;
    }

    function installLegacyCompatibility(modulePath) {
        switch (String(modulePath || "")
            .replace(/[?#].*$/, "")
            .replace(/\.js$/, "")) {
        case "addon/hint/show-hint":
        case "addon/hint/anyword-hint":
            return _installLegacyHintCompatibility();
        case "addon/search/jump-to-line":
        case "addon/search/search":
            return _installLegacySearchCompatibility();
        default:
            return false;
        }
    }

    function defineMode(name, modeFactory) {
        if (arguments.length > 2) {
            modeFactory.dependencies = Array.prototype.slice.call(arguments, 2);
        }
        if (!defaults.mode && name !== "null") {
            defaults.mode = name;
        }
        modes[name] = modeFactory;
    }

    function defineMIME(mime, specification) {
        mimeModes[mime] = specification;
    }

    function resolveMode(specification) {
        let resolved = specification;

        if (typeof resolved === "string" &&
                Object.prototype.hasOwnProperty.call(mimeModes, resolved)) {
            resolved = mimeModes[resolved];
        } else if (resolved && typeof resolved.name === "string" &&
                Object.prototype.hasOwnProperty.call(mimeModes, resolved.name)) {
            let mimeSpec = mimeModes[resolved.name];
            if (typeof mimeSpec === "string") {
                mimeSpec = {name: mimeSpec};
            }
            resolved = Object.assign(Object.create(mimeSpec), resolved);
            resolved.name = mimeSpec.name;
        } else if (typeof resolved === "string" &&
                /^[\w-]+\/[\w-]+\+xml$/.test(resolved)) {
            return resolveMode("application/xml");
        } else if (typeof resolved === "string" &&
                /^[\w-]+\/[\w-]+\+json$/.test(resolved)) {
            return resolveMode("application/json");
        }

        if (typeof resolved === "string") {
            return {name: resolved};
        }
        return resolved || {name: "null"};
    }

    function getMode(options, specification) {
        const resolved = resolveMode(specification);
        let modeFactory = modes[resolved.name];

        if (!modeFactory && loadMode(resolved.name)) {
            modeFactory = modes[resolved.name];
        }

        if (!modeFactory) {
            if (resolved.name === "null") {
                return createNullMode();
            }
            return getMode(options, "text/plain");
        }

        const mode = modeFactory(options || {}, resolved);
        const registeredExtensions = modeExtensions[resolved.name];
        if (registeredExtensions) {
            Object.keys(registeredExtensions).forEach(function (property) {
                if (Object.prototype.hasOwnProperty.call(mode, property)) {
                    mode["_" + property] = mode[property];
                }
                mode[property] = registeredExtensions[property];
            });
        }

        mode.name = resolved.name;
        if (resolved.helperType) {
            mode.helperType = resolved.helperType;
        }
        if (resolved.modeProps) {
            Object.assign(mode, resolved.modeProps);
        }
        return mode;
    }

    function hasMode(specification) {
        return Boolean(modes[resolveMode(specification).name]);
    }

    function isModeOverridden(specification) {
        const modeName = resolveMode(specification).name;
        return Object.prototype.hasOwnProperty.call(
            builtInModeFactories,
            modeName
        ) && modes[modeName] !== builtInModeFactories[modeName];
    }

    function loadMode(modeName) {
        const requestedModes = bundledModeModules[modeName] || [modeName];
        let loaded = true;

        requestedModes.forEach(function (requestedMode) {
            if (Object.prototype.hasOwnProperty.call(modes, requestedMode)) {
                return;
            }

            const parser = bundledModes[requestedMode];
            if (parser) {
                defineMode(requestedMode, parserFactory(parser));
                return;
            }
            loaded = false;
        });

        return loaded;
    }

    function extendMode(modeName, properties) {
        if (!modeExtensions[modeName]) {
            modeExtensions[modeName] = {};
        }
        Object.assign(modeExtensions[modeName], properties);
    }

    function copyState(mode, state) {
        if (state === true) {
            return state;
        }
        if (mode.copyState) {
            return mode.copyState(state);
        }

        const copiedState = {};
        Object.keys(state || {}).forEach(function (name) {
            const value = state[name];
            copiedState[name] = Array.isArray(value) ? value.slice() : value;
        });
        return copiedState;
    }

    function startState(mode, argument1, argument2) {
        return mode.startState ? mode.startState(argument1, argument2) : true;
    }

    function innerMode(mode, state) {
        let currentMode = mode;
        let currentState = state;
        let result;

        while (currentMode.innerMode) {
            result = currentMode.innerMode(currentState);
            if (!result || result.mode === currentMode) {
                break;
            }
            currentMode = result.mode;
            currentState = result.state;
        }

        return result || {
            mode: currentMode,
            state: currentState
        };
    }

    class StringStream extends CM6.StringStream {
        constructor(string, tabSize, lineOracle) {
            super(string, tabSize || 8, 2);
            this.lineStart = 0;
            this.lineOracle = lineOracle;
        }

        sol() {
            return this.pos === this.lineStart;
        }

        column() {
            if (this.lastColumnPos < this.start) {
                this.lastColumnValue = countColumn(
                    this.string,
                    this.start,
                    this.tabSize,
                    this.lastColumnPos,
                    this.lastColumnValue
                );
                this.lastColumnPos = this.start;
            }

            return this.lastColumnValue -
                (this.lineStart ? countColumn(this.string, this.lineStart, this.tabSize) : 0);
        }

        indentation() {
            return countColumn(this.string, null, this.tabSize) -
                (this.lineStart ? countColumn(this.string, this.lineStart, this.tabSize) : 0);
        }

        hideFirstChars(count, callback) {
            this.lineStart += count;
            try {
                return callback();
            } finally {
                this.lineStart -= count;
            }
        }

        lookAhead(lineCount) {
            return this.lineOracle && this.lineOracle.lookAhead(lineCount);
        }

        baseToken() {
            return this.lineOracle && this.lineOracle.baseToken(this.pos);
        }

        match(pattern, consume, caseInsensitive) {
            if (typeof pattern === "string") {
                const normalize = function (value) {
                    return caseInsensitive ? value.toLowerCase() : value;
                };
                const candidate = this.string.substr(this.pos, pattern.length);
                if (normalize(candidate) === normalize(pattern)) {
                    if (consume !== false) {
                        this.pos += pattern.length;
                    }
                    return true;
                }
                return;
            }

            const match = this.string.slice(this.pos).match(pattern);
            if (match && match.index > 0) {
                return null;
            }
            if (match && consume !== false) {
                this.pos += match[0].length;
            }
            return match;
        }
    }

    function normalizeKeyName(nameToNormalize) {
        const parts = nameToNormalize.split(/-(?!$)/);
        let name = parts[parts.length - 1];
        let alt = false;
        let ctrl = false;
        let shift = false;
        let cmd = false;

        for (let index = 0; index < parts.length - 1; index++) {
            const modifier = parts[index];
            if (/^(cmd|meta|m)$/i.test(modifier)) {
                cmd = true;
            } else if (/^a(lt)?$/i.test(modifier)) {
                alt = true;
            } else if (/^(c|ctrl|control)$/i.test(modifier)) {
                ctrl = true;
            } else if (/^s(hift)?$/i.test(modifier)) {
                shift = true;
            } else {
                throw new Error("Unrecognized modifier name: " + modifier);
            }
        }

        if (alt) {
            name = "Alt-" + name;
        }
        if (ctrl) {
            name = "Ctrl-" + name;
        }
        if (cmd) {
            name = "Cmd-" + name;
        }
        if (shift) {
            name = "Shift-" + name;
        }
        return name;
    }

    function normalizeKeyMap(map) {
        const normalized = {};

        Object.keys(map).forEach(function (mapKeyName) {
            const value = map[mapKeyName];
            if (/^(name|fallthrough|(de|at)tach)$/.test(mapKeyName)) {
                return;
            }
            if (value === "...") {
                delete map[mapKeyName];
                return;
            }

            const keys = mapKeyName.split(" ").map(normalizeKeyName);
            keys.forEach(function (_key, index) {
                const name = keys.slice(0, index + 1).join(" ");
                const binding = index === keys.length - 1 ? value : "...";
                if (normalized[name] && normalized[name] !== binding) {
                    throw new Error("Inconsistent bindings for " + name);
                }
                normalized[name] = binding;
            });
            delete map[mapKeyName];
        });

        Object.assign(map, normalized);
        return map;
    }

    function getKeyMap(map) {
        return typeof map === "string" ? keyMap[map] : map;
    }

    function lookupKey(key, map, handle, context) {
        const resolvedMap = getKeyMap(map);
        if (!resolvedMap) {
            return;
        }

        const binding = typeof resolvedMap.call === "function" ?
            resolvedMap.call(key, context) :
            resolvedMap[key];

        if (binding === false) {
            return "nothing";
        }
        if (binding === "...") {
            return "multi";
        }
        if (binding !== null && binding !== undefined && handle(binding)) {
            return "handled";
        }

        if (resolvedMap.fallthrough) {
            const fallthrough = Array.isArray(resolvedMap.fallthrough) ?
                resolvedMap.fallthrough :
                [resolvedMap.fallthrough];
            for (let index = 0; index < fallthrough.length; index++) {
                const result = lookupKey(key, fallthrough[index], handle, context);
                if (result) {
                    return result;
                }
            }
        }
    }

    const KEY_NAMES = {
        3: "Pause",
        8: "Backspace",
        9: "Tab",
        13: "Enter",
        16: "Shift",
        17: "Ctrl",
        18: "Alt",
        19: "Pause",
        20: "CapsLock",
        27: "Esc",
        32: "Space",
        33: "PageUp",
        34: "PageDown",
        35: "End",
        36: "Home",
        37: "Left",
        38: "Up",
        39: "Right",
        40: "Down",
        44: "PrintScrn",
        45: "Insert",
        46: "Delete",
        59: ";",
        61: "=",
        91: "Mod",
        92: "Mod",
        93: "Mod",
        106: "*",
        107: "=",
        109: "-",
        110: ".",
        111: "/",
        145: "ScrollLock",
        173: "-",
        186: ";",
        187: "=",
        188: ",",
        189: "-",
        190: ".",
        191: "/",
        192: "`",
        219: "[",
        220: "\\",
        221: "]",
        222: "'",
        224: "Mod",
        63232: "Up",
        63233: "Down",
        63234: "Left",
        63235: "Right",
        63272: "Delete",
        63273: "Home",
        63275: "End",
        63276: "PageUp",
        63277: "PageDown",
        63302: "Insert"
    };

    for (let digit = 0; digit < 10; digit++) {
        KEY_NAMES[digit + 48] = String(digit);
        KEY_NAMES[digit + 96] = String(digit);
    }
    for (let letter = 65; letter <= 90; letter++) {
        KEY_NAMES[letter] = String.fromCharCode(letter);
    }
    for (let functionKey = 1; functionKey <= 12; functionKey++) {
        KEY_NAMES[functionKey + 111] = "F" + functionKey;
        KEY_NAMES[functionKey + 63235] = "F" + functionKey;
    }

    function keyName(event, noShift) {
        if (event.altGraphKey) {
            return false;
        }

        let name = KEY_NAMES[event.keyCode || event.which];
        if (!name && event.key) {
            const aliases = {
                " ": "Space",
                ArrowDown: "Down",
                ArrowLeft: "Left",
                ArrowRight: "Right",
                ArrowUp: "Up",
                Control: "Ctrl",
                Escape: "Esc",
                Meta: "Mod",
                OS: "Mod",
                PrintScreen: "PrintScrn"
            };
            name = aliases[event.key] || event.key;
            if (name.length === 1 && /[a-z]/i.test(name)) {
                name = name.toUpperCase();
            }
        }
        if (!name || name === "Unidentified" || name === "Dead") {
            return false;
        }

        const baseName = name;
        if (event.altKey && baseName !== "Alt") {
            name = "Alt-" + name;
        }
        if (event.ctrlKey && baseName !== "Ctrl") {
            name = "Ctrl-" + name;
        }
        if (event.metaKey && baseName !== "Mod") {
            name = "Cmd-" + name;
        }
        if (!noShift && event.shiftKey && baseName !== "Shift") {
            name = "Shift-" + name;
        }
        return name;
    }

    function isModifierKey(value) {
        const name = typeof value === "string" ? value : keyName(value, true);
        return name === "Ctrl" || name === "Alt" || name === "Shift" || name === "Mod";
    }

    const LEGACY_STREAM_STYLE_MAP = {
        attributeName: "attribute",
        character: "string-2",
        heading: "header",
        invalid: "error",
        modifier: "qualifier",
        propertyName: "property",
        "string.special": "string-2",
        tagName: "tag",
        typeName: "type",
        variableName: "variable",
        "variableName.constant": "variable-3",
        "variableName.definition": "def",
        "variableName.function": "variable callee",
        "variableName.local": "variable-2",
        "variableName.special": "variable-2",
        "variableName.standard": "builtin"
    };

    function translateStreamStyle(style, styleMap) {
        if (!style || typeof style !== "string") {
            return style;
        }

        return style.split(/\s+/).map(function (part) {
            return styleMap[part] || part;
        }).join(" ");
    }

    function legacyCloseBrackets(closeBrackets) {
        const closingBracket = {
            "(": ")",
            "[": "]",
            "{": "}",
            "'": "'",
            "\"": "\"",
            "`": "`"
        };
        const brackets = closeBrackets && closeBrackets.brackets;
        if (!Array.isArray(brackets)) {
            return;
        }
        return brackets.map(function (open) {
            return open + (closingBracket[open] || open);
        }).join("");
    }

    function cloneParser(parser, config, additionalStyleMap) {
        const modeConfig = config || {};
        const configuredIndentUnit = Number(modeConfig.indentUnit);
        const indentUnit = Number.isFinite(configuredIndentUnit) ?
            configuredIndentUnit :
            2;
        const styleMap = Object.assign(
            {},
            LEGACY_STREAM_STYLE_MAP,
            additionalStyleMap || {}
        );
        const clonedParser = Object.assign({}, parser);

        if (parser.startState) {
            clonedParser.startState = function () {
                return parser.startState(indentUnit);
            };
        }

        clonedParser.token = function (stream, state) {
            stream.indentUnit = indentUnit;
            return translateStreamStyle(parser.token(stream, state), styleMap);
        };

        if (parser.blankLine) {
            clonedParser.blankLine = function (state) {
                return parser.blankLine(state, indentUnit);
            };
        }

        if (parser.indent) {
            clonedParser.indent = function (state, textAfter) {
                const indentation = parser.indent(state, textAfter, {
                    unit: indentUnit
                });
                return indentation === null || indentation === undefined ?
                    Pass :
                    indentation;
            };
        }

        const languageData = parser.languageData || {};
        const commentTokens = languageData.commentTokens;
        if (commentTokens) {
            if (Object.prototype.hasOwnProperty.call(commentTokens, "line")) {
                clonedParser.lineComment = commentTokens.line;
            }
            if (commentTokens.block) {
                clonedParser.blockCommentStart = commentTokens.block.open;
                clonedParser.blockCommentEnd = commentTokens.block.close;
            }
        }
        if (languageData.indentOnInput) {
            clonedParser.electricInput = languageData.indentOnInput;
        }
        const closeBrackets = legacyCloseBrackets(languageData.closeBrackets);
        if (closeBrackets) {
            clonedParser.closeBrackets = closeBrackets;
        }

        if (parser.startState) {
            const initialState = parser.startState(indentUnit);
            const baseTokenizer = initialState && initialState.tokenize;
            if (baseTokenizer && Object.prototype.hasOwnProperty.call(initialState, "lastType")) {
                clonedParser.expressionAllowed = function (stream, state, backUp) {
                    return state.tokenize === baseTokenizer &&
                        /^(?:operator|sof|keyword [bcd]|case|new|export|default|spread|[\[{}(,;:]|=>)$/
                            .test(state.lastType) ||
                        state.lastType === "quasi" &&
                            /\{\s*$/.test(stream.string.slice(0, stream.pos - (backUp || 0)));
                };
                clonedParser.skipExpression = function (state) {
                    const stream = new StringStream("true", modeConfig.tabSize || 4);
                    clonedParser.token(stream, state);
                };
            }
        }

        return clonedParser;
    }

    function parserFactory(parser, additionalStyleMap) {
        return function (config) {
            return cloneParser(parser, config, additionalStyleMap);
        };
    }

    function createNullMode() {
        return {
            token: function (stream) {
                stream.skipToEnd();
                return null;
            }
        };
    }

    function createMarkdownMode(config, parserConfig) {
        const modeConfig = parserConfig || {};
        const githubFlavored = Boolean(modeConfig.githubFlavored);
        const highlightFormatting = Boolean(modeConfig.highlightFormatting);
        const taskLists = modeConfig.taskLists === undefined ?
            githubFlavored :
            Boolean(modeConfig.taskLists);
        const strikethrough = modeConfig.strikethrough === undefined ?
            githubFlavored :
            Boolean(modeConfig.strikethrough);
        const emoji = modeConfig.emoji === undefined ?
            githubFlavored :
            Boolean(modeConfig.emoji);
        const fencedCodeBlockHighlighting =
            modeConfig.fencedCodeBlockHighlighting !== false;
        const xmlEnabled = modeConfig.xml !== false;
        const htmlMode = xmlEnabled ? getMode(config, "text/html") : null;
        const fencedModeAliases = {
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
            md: "markdown",
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
        let mode;

        function withFormatting(type, formattingType) {
            if (!highlightFormatting || !formattingType) {
                return type;
            }
            return [
                type,
                "formatting",
                "formatting-" + formattingType
            ].filter(Boolean).join(" ");
        }

        function contextualType(state, type) {
            return [
                type,
                state.header ? "header header-" + state.header : "",
                state.quote ? "quote" : "",
                state.list ? "variable-2" : ""
            ].filter(Boolean).join(" ") || null;
        }

        function resetLineState(state) {
            state.header = 0;
            state.quote = 0;
            state.list = false;
            state.taskList = false;
        }

        function fencedMode(languageName) {
            if (!fencedCodeBlockHighlighting) {
                return null;
            }
            const requestedMode = String(
                languageName ||
                modeConfig.fencedCodeBlockDefaultMode ||
                "text/plain"
            ).toLowerCase();
            const resolvedMode = getMode(
                config,
                fencedModeAliases[requestedMode] || requestedMode
            );
            return resolvedMode.name === "null" ? null : resolvedMode;
        }

        function closeFencePattern(state) {
            const escapedCharacter = state.fenceCharacter === "`" ? "`" : "~";
            return new RegExp(
                "^ {0,3}" + escapedCharacter + "{" + state.fenceLength + ",}\\s*$"
            );
        }

        function startHTML(state) {
            state.htmlState = startState(htmlMode);
            state.htmlActive = true;
        }

        function htmlBlockIsComplete(state) {
            const inner = innerMode(htmlMode, state.htmlState);
            return inner.mode && inner.mode.name === "xml" &&
                inner.state &&
                inner.state.tagStart === null &&
                !inner.state.context &&
                inner.state.tokenize &&
                inner.state.tokenize.isInText;
        }

        function tokenHTML(stream, state) {
            const style = htmlMode.token(stream, state.htmlState);
            if (htmlBlockIsComplete(state)) {
                state.htmlActive = false;
            }
            return style;
        }

        mode = {
            startState: function () {
                return {
                    fencedCode: false,
                    fenceCharacter: null,
                    fenceLength: 0,
                    localMode: null,
                    localState: null,
                    htmlActive: false,
                    htmlState: null,
                    header: 0,
                    quote: 0,
                    list: false,
                    taskList: false
                };
            },

            copyState: function (state) {
                const copiedState = Object.assign({}, state);
                copiedState.localState = state.localMode && state.localState ?
                    copyState(state.localMode, state.localState) :
                    null;
                copiedState.htmlState = htmlMode && state.htmlState ?
                    copyState(htmlMode, state.htmlState) :
                    null;
                return copiedState;
            },

            blankLine: function (state) {
                resetLineState(state);
                if (state.localMode && state.localMode.blankLine) {
                    state.localMode.blankLine(state.localState);
                }
                if (state.htmlActive && htmlMode && htmlMode.blankLine) {
                    htmlMode.blankLine(state.htmlState);
                    if (htmlBlockIsComplete(state)) {
                        state.htmlActive = false;
                    }
                }
                return null;
            },

            token: function (stream, state) {
                if (stream.sol()) {
                    resetLineState(state);

                    if (state.fencedCode) {
                        if (stream.match(closeFencePattern(state))) {
                            state.fencedCode = false;
                            state.fenceCharacter = null;
                            state.fenceLength = 0;
                            state.localMode = null;
                            state.localState = null;
                            return withFormatting("comment", "code-block");
                        }
                        if (state.localMode) {
                            return state.localMode.token(stream, state.localState);
                        }
                        stream.skipToEnd();
                        return withFormatting("comment", "code-block");
                    }

                    if (state.htmlActive) {
                        return tokenHTML(stream, state);
                    }

                    const openingFence = stream.match(
                        /^ {0,3}(`{3,}|~{3,})[ \t]*([\w/+#-]*)[^\n`]*$/
                    );
                    if (openingFence) {
                        state.fencedCode = true;
                        state.fenceCharacter = openingFence[1].charAt(0);
                        state.fenceLength = openingFence[1].length;
                        state.localMode = fencedMode(openingFence[2]);
                        state.localState = state.localMode ?
                            startState(state.localMode) :
                            null;
                        return withFormatting("comment", "code-block");
                    }

                    const atxHeader = stream.match(/^ {0,3}(#{1,6})(?:\s+|$)/);
                    if (atxHeader) {
                        state.header = atxHeader[1].length;
                        stream.skipToEnd();
                        return withFormatting(
                            "header header-" + state.header,
                            "header"
                        );
                    }

                    const setextHeader = stream.match(/^ {0,3}(=+|-{2,})\s*$/);
                    if (setextHeader) {
                        state.header = setextHeader[1].charAt(0) === "=" ? 1 : 2;
                        return withFormatting(
                            "header header-" + state.header,
                            "header"
                        );
                    }

                    if (stream.match(/^ {0,3}(?:[*_-]\s*){3,}$/)) {
                        return "hr";
                    }

                    if (stream.match(/^(?: {4}|\t)/)) {
                        stream.skipToEnd();
                        return "comment";
                    }

                    if (stream.match(/^ {0,3}> ?/)) {
                        state.quote = 1;
                        return withFormatting("quote", "quote");
                    }

                    if (stream.match(/^(\s*)(?:[*+-]|\d+[.)])\s+/)) {
                        state.list = true;
                        state.taskList = taskLists &&
                            Boolean(stream.match(/^\[(?:x| )\](?=\s)/i, false));
                        return withFormatting("variable-2", "list");
                    }
                }

                if (state.fencedCode) {
                    if (state.localMode) {
                        return state.localMode.token(stream, state.localState);
                    }
                    stream.skipToEnd();
                    return withFormatting("comment", "code-block");
                }

                if (state.htmlActive) {
                    return tokenHTML(stream, state);
                }

                if (state.taskList) {
                    const task = stream.match(/^\[(x| )\]/i);
                    state.taskList = false;
                    if (task) {
                        return withFormatting(
                            task[1] === " " ? "meta" : "property",
                            "task"
                        );
                    }
                }

                if (stream.eatSpace()) {
                    return contextualType(state, null);
                }

                if (stream.match(/^`+[^`]*`+/)) {
                    return contextualType(state, "comment");
                }
                if (strikethrough && stream.match(/^~~(?:[^~]|~(?!~))+~~/)) {
                    return contextualType(state, "strikethrough");
                }
                if (stream.match(/^(?:\*\*|__)(?=\S)/)) {
                    stream.match(/^.*?(?:\*\*|__)/);
                    return contextualType(state, "strong");
                }
                if (stream.match(/^(?:\*|_)(?=\S)/)) {
                    stream.match(/^.*?(?:\*|_)/);
                    return contextualType(state, "em");
                }
                if (stream.match(/^!\[[^\]]*\](?:\([^)]+\)|\[[^\]]*\])/)) {
                    return contextualType(state, "image");
                }
                if (stream.match(/^\[[^\]]*\](?:\([^)]+\)|\[[^\]]*\])/)) {
                    return contextualType(state, "link");
                }
                if (stream.match(/^<(?:(?:https?:\/\/|mailto:)[^>]+|[^>]+@[^>]+)>/i)) {
                    return contextualType(state, "link");
                }
                if (githubFlavored &&
                        (stream.sol() ||
                        /\s/.test(stream.string.charAt(stream.pos - 1)))) {
                    if (stream.match(
                        /^(?:[a-zA-Z0-9_-]+\/)?(?:[a-zA-Z0-9_-]+@)?(?=.{0,6}\d)[a-f0-9]{7,40}\b/i
                    ) || stream.match(
                        /^(?:[a-zA-Z0-9_-]+\/)?[a-zA-Z0-9_-]*#[0-9]+\b/
                    )) {
                        return contextualType(state, "link");
                    }
                }
                if (githubFlavored &&
                        stream.match(/^(?:(?:https?:\/\/|www\.)[^\s<>()]+)/i)) {
                    return contextualType(state, "link");
                }
                if (emoji &&
                        stream.match(/^:(?:[a-z_\d+][a-z_\d+-]*|-[a-z_\d+][a-z_\d+-]*):/i)) {
                    return contextualType(state, "builtin");
                }
                if (htmlMode && stream.match(
                    /^<(?:!--|\?|!\[CDATA\[|\/?[A-Za-z][A-Za-z0-9-]*(?:\s|\/?>))/,
                    false
                )) {
                    startHTML(state);
                    return tokenHTML(stream, state);
                }
                if (stream.match(/^\\./)) {
                    return contextualType(state, null);
                }

                if (!stream.eatWhile(/[^\s`*_![\\<~:]/)) {
                    stream.next();
                }
                return contextualType(state, null);
            },

            indent: function (state, textAfter, line) {
                if (state.localMode && state.localMode.indent) {
                    return state.localMode.indent(state.localState, textAfter, line);
                }
                if (state.htmlActive && htmlMode && htmlMode.indent) {
                    return htmlMode.indent(state.htmlState, textAfter, line);
                }
                return Pass;
            },

            innerMode: function (state) {
                if (state.localMode && state.localState) {
                    return {
                        mode: state.localMode,
                        state: state.localState
                    };
                }
                if (state.htmlActive && htmlMode && state.htmlState) {
                    return {
                        mode: htmlMode,
                        state: state.htmlState
                    };
                }
                return {
                    mode: mode,
                    state: state
                };
            },

            blockCommentStart: "<!--",
            blockCommentEnd: "-->",
            closeBrackets: "()[]{}''\"\"``",
            fold: "markdown",
            helperType: "markdown"
        };
        return mode;
    }

    function patternIndex(string, pattern, from, returnEnd) {
        if (typeof pattern === "string") {
            const found = string.indexOf(pattern, from);
            return returnEnd && found > -1 ? found + pattern.length : found;
        }

        pattern.lastIndex = 0;
        const match = pattern.exec(from ? string.slice(from) : string);
        return match ? match.index + from + (returnEnd ? match[0].length : 0) : -1;
    }

    /**
     * Combines a base stream mode with an overlay stream mode. This is a
     * compatibility implementation of the historical CodeMirror overlay
     * contract; both parsers operate on the CM6-backed document stream.
     */
    function overlayMode(base, overlay, combine) {
        return {
            startState: function () {
                return {
                    base: startState(base),
                    overlay: startState(overlay),
                    basePos: 0,
                    baseCur: null,
                    overlayPos: 0,
                    overlayCur: null,
                    streamSeen: null
                };
            },

            copyState: function (state) {
                return {
                    base: copyState(base, state.base),
                    overlay: copyState(overlay, state.overlay),
                    basePos: state.basePos,
                    baseCur: null,
                    overlayPos: state.overlayPos,
                    overlayCur: null,
                    streamSeen: null
                };
            },

            token: function (stream, state) {
                if (stream !== state.streamSeen ||
                        Math.min(state.basePos, state.overlayPos) < stream.start) {
                    state.streamSeen = stream;
                    state.basePos = stream.start;
                    state.overlayPos = stream.start;
                }

                if (stream.start === state.basePos) {
                    state.baseCur = base.token(stream, state.base);
                    state.basePos = stream.pos;
                }
                if (stream.start === state.overlayPos) {
                    stream.pos = stream.start;
                    state.overlayCur = overlay.token(stream, state.overlay);
                    state.overlayPos = stream.pos;
                }
                stream.pos = Math.min(state.basePos, state.overlayPos);

                if (state.overlayCur === null ||
                        state.overlayCur === undefined) {
                    return state.baseCur;
                }
                const combineTokens = state.overlay &&
                    state.overlay.combineTokens;
                if (state.baseCur !== null && state.baseCur !== undefined &&
                        (combineTokens ||
                            combine && combineTokens == null)) { // eslint-disable-line eqeqeq
                    return state.baseCur + " " + state.overlayCur;
                }
                return state.overlayCur;
            },

            indent: base.indent && function (state, textAfter, line) {
                return base.indent(state.base, textAfter, line);
            },

            electricChars: base.electricChars,

            innerMode: function (state) {
                return {
                    state: state.base,
                    mode: base
                };
            },

            blankLine: function (state) {
                const baseToken = base.blankLine ?
                    base.blankLine(state.base) :
                    undefined;
                const overlayToken = overlay.blankLine ?
                    overlay.blankLine(state.overlay) :
                    undefined;
                if (overlayToken === null || overlayToken === undefined) {
                    return baseToken;
                }
                return combine && baseToken !== null &&
                    baseToken !== undefined ?
                    baseToken + " " + overlayToken :
                    overlayToken;
            }
        };
    }

    function multiplexingMode(outerMode) {
        const innerModes = Array.prototype.slice.call(arguments, 1);

        return {
            startState: function () {
                return {
                    outer: startState(outerMode),
                    innerActive: null,
                    inner: null,
                    startingInner: false
                };
            },

            copyState: function (state) {
                return {
                    outer: copyState(outerMode, state.outer),
                    innerActive: state.innerActive,
                    inner: state.innerActive ?
                        copyState(state.innerActive.mode, state.inner) :
                        null,
                    startingInner: state.startingInner
                };
            },

            token: function (stream, state) {
                if (!state.innerActive) {
                    let cutOff = Infinity;
                    const originalContent = stream.string;

                    for (let index = 0; index < innerModes.length; index++) {
                        const candidateMode = innerModes[index];
                        const found = patternIndex(
                            originalContent,
                            candidateMode.open,
                            stream.pos
                        );
                        if (found === stream.pos) {
                            if (!candidateMode.parseDelimiters) {
                                stream.match(candidateMode.open);
                            }
                            state.startingInner = Boolean(candidateMode.parseDelimiters);
                            state.innerActive = candidateMode;

                            let outerIndent = 0;
                            if (outerMode.indent) {
                                const candidate = outerMode.indent(state.outer, "", "");
                                if (candidate !== Pass) {
                                    outerIndent = candidate;
                                }
                            }
                            state.inner = startState(candidateMode.mode, outerIndent);
                            if (candidateMode.parseDelimiters) {
                                let token = candidateMode.mode.token(
                                    stream,
                                    state.inner
                                );
                                if (stream.pos > stream.start) {
                                    state.startingInner = false;
                                }
                                if (candidateMode.innerStyle) {
                                    token = token ?
                                        token + " " + candidateMode.innerStyle :
                                        candidateMode.innerStyle;
                                }
                                return token;
                            }
                            return candidateMode.delimStyle &&
                                candidateMode.delimStyle + " " +
                                candidateMode.delimStyle + "-open";
                        }
                        if (found !== -1 && found < cutOff) {
                            cutOff = found;
                        }
                    }

                    if (cutOff !== Infinity) {
                        stream.string = originalContent.slice(0, cutOff);
                    }
                    const outerToken = outerMode.token(stream, state.outer);
                    stream.string = originalContent;
                    return outerToken;
                }

                const active = state.innerActive;
                const originalContent = stream.string;
                if (!active.close && stream.sol()) {
                    state.innerActive = null;
                    state.inner = null;
                    return this.token(stream, state);
                }

                const found = active.close && !state.startingInner ?
                    patternIndex(
                        originalContent,
                        active.close,
                        stream.pos,
                        active.parseDelimiters
                    ) :
                    -1;

                if (found === stream.pos && !active.parseDelimiters) {
                    stream.match(active.close);
                    state.innerActive = null;
                    state.inner = null;
                    return active.delimStyle &&
                        active.delimStyle + " " + active.delimStyle + "-close";
                }

                if (found > -1) {
                    stream.string = originalContent.slice(0, found);
                }
                let token = active.mode.token(stream, state.inner);
                stream.string = originalContent;
                if (found === -1 && stream.pos > stream.start) {
                    state.startingInner = false;
                }
                if (found === stream.pos && active.parseDelimiters) {
                    state.innerActive = null;
                    state.inner = null;
                }
                if (active.innerStyle) {
                    token = token ? token + " " + active.innerStyle : active.innerStyle;
                }
                return token;
            },

            indent: function (state, textAfter, line) {
                const activeMode = state.innerActive ? state.innerActive.mode : outerMode;
                if (!activeMode.indent) {
                    return Pass;
                }
                return activeMode.indent(
                    state.innerActive ? state.inner : state.outer,
                    textAfter,
                    line
                );
            },

            blankLine: function (state) {
                const activeMode = state.innerActive ? state.innerActive.mode : outerMode;
                if (activeMode.blankLine) {
                    activeMode.blankLine(state.innerActive ? state.inner : state.outer);
                }

                if (!state.innerActive) {
                    innerModes.forEach(function (candidateMode) {
                        if (candidateMode.open === "\n") {
                            state.innerActive = candidateMode;
                            state.inner = startState(
                                candidateMode.mode,
                                activeMode.indent ? activeMode.indent(state.outer, "", "") : 0
                            );
                        }
                    });
                } else if (state.innerActive.close === "\n") {
                    state.innerActive = null;
                    state.inner = null;
                }
            },

            electricChars: outerMode.electricChars,

            innerMode: function (state) {
                return state.inner ? {
                    state: state.inner,
                    mode: state.innerActive.mode
                } : {
                    state: state.outer,
                    mode: outerMode
                };
            }
        };
    }

    function regexFromValue(value, anchored) {
        if (!value) {
            return /(?:)/;
        }

        let flags = "";
        let source = value;
        if (value instanceof RegExp) {
            if (value.ignoreCase) {
                flags += "i";
            }
            if (value.unicode) {
                flags += "u";
            }
            source = value.source;
        }

        return new RegExp((anchored === false ? "" : "^") + "(?:" + source + ")", flags);
    }

    function tokenValue(value) {
        if (!value) {
            return null;
        }
        if (typeof value === "function") {
            return value;
        }
        if (typeof value === "string") {
            return value.replace(/\./g, " ");
        }
        return value.map(function (token) {
            return token && token.replace(/\./g, " ");
        });
    }

    function valuesEqual(left, right) {
        if (left === right) {
            return true;
        }
        if (!left || typeof left !== "object" || !right || typeof right !== "object") {
            return false;
        }

        const leftProperties = Object.keys(left);
        const rightProperties = Object.keys(right);
        if (leftProperties.length !== rightProperties.length) {
            return false;
        }
        return leftProperties.every(function (property) {
            return Object.prototype.hasOwnProperty.call(right, property) &&
                valuesEqual(left[property], right[property]);
        });
    }

    function simpleMode(config, states) {
        if (!Object.prototype.hasOwnProperty.call(states, "start")) {
            throw new Error("Undefined state start in simple mode");
        }

        const compiledStates = {};
        const metadata = states.meta || {};
        let hasIndentation = false;

        Object.keys(states).forEach(function (stateName) {
            if (stateName === "meta") {
                return;
            }
            compiledStates[stateName] = states[stateName].map(function (data) {
                const nextState = data.next || data.push;
                if (nextState && !Object.prototype.hasOwnProperty.call(states, nextState)) {
                    throw new Error("Undefined state " + nextState + " in simple mode");
                }
                if (data.indent || data.dedent) {
                    hasIndentation = true;
                }
                return {
                    data: data,
                    regex: regexFromValue(data.regex),
                    token: tokenValue(data.token)
                };
            });
        });

        const mode = {
            startState: function () {
                return {
                    state: "start",
                    pending: null,
                    local: null,
                    localState: null,
                    indent: hasIndentation ? [] : null
                };
            },

            copyState: function (state) {
                const copiedState = {
                    state: state.state,
                    pending: state.pending && state.pending.slice(),
                    local: state.local,
                    localState: state.localState && state.local ?
                        copyState(state.local.mode, state.localState) :
                        null,
                    indent: state.indent && state.indent.slice(),
                    stack: state.stack && state.stack.slice()
                };

                for (let persistent = state.persistentStates;
                    persistent;
                    persistent = persistent.next) {
                    copiedState.persistentStates = {
                        mode: persistent.mode,
                        spec: persistent.spec,
                        state: persistent.state === state.localState ?
                            copiedState.localState :
                            copyState(persistent.mode, persistent.state),
                        next: copiedState.persistentStates
                    };
                }
                return copiedState;
            },

            token: function (stream, state) {
                if (state.pending) {
                    const pending = state.pending.shift();
                    if (!state.pending.length) {
                        state.pending = null;
                    }
                    stream.pos += pending.text.length;
                    return pending.token;
                }

                if (state.local) {
                    if (state.local.end && stream.match(state.local.end)) {
                        const endToken = state.local.endToken || null;
                        state.local = null;
                        state.localState = null;
                        return endToken;
                    }

                    const localToken = state.local.mode.token(stream, state.localState);
                    const endMatch = state.local.endScan &&
                        state.local.endScan.exec(stream.current());
                    if (endMatch) {
                        stream.pos = stream.start + endMatch.index;
                    }
                    return localToken;
                }

                const rules = compiledStates[state.state];
                for (let index = 0; index < rules.length; index++) {
                    const rule = rules[index];
                    const matches = (!rule.data.sol || stream.sol()) &&
                        stream.match(rule.regex);
                    if (!matches) {
                        continue;
                    }

                    if (rule.data.next) {
                        state.state = rule.data.next;
                    } else if (rule.data.push) {
                        (state.stack || (state.stack = [])).push(state.state);
                        state.state = rule.data.push;
                    } else if (rule.data.pop && state.stack && state.stack.length) {
                        state.state = state.stack.pop();
                    }
                    if (rule.data.mode) {
                        let persistent;
                        if (rule.data.mode.persistent) {
                            for (let candidate = state.persistentStates;
                                candidate && !persistent;
                                candidate = candidate.next) {
                                if (rule.data.mode.spec ?
                                    valuesEqual(rule.data.mode.spec, candidate.spec) :
                                    rule.data.mode.mode === candidate.mode) {
                                    persistent = candidate;
                                }
                            }
                        }

                        const localMode = persistent ?
                            persistent.mode :
                            rule.data.mode.mode ||
                                getMode(config, rule.data.mode.spec);
                        const localState = persistent ?
                            persistent.state :
                            startState(localMode);
                        if (rule.data.mode.persistent && !persistent) {
                            state.persistentStates = {
                                mode: localMode,
                                spec: rule.data.mode.spec,
                                state: localState,
                                next: state.persistentStates
                            };
                        }
                        state.localState = localState;
                        state.local = {
                            mode: localMode,
                            end: rule.data.mode.end &&
                                regexFromValue(rule.data.mode.end),
                            endScan: rule.data.mode.end &&
                                rule.data.mode.forceEnd !== false &&
                                regexFromValue(rule.data.mode.end, false),
                            endToken: rule.token && Array.isArray(rule.token) ?
                                rule.token[rule.token.length - 1] :
                                rule.token
                        };
                    }
                    if (rule.data.indent) {
                        state.indent.push(stream.indentation() + config.indentUnit);
                    }
                    if (rule.data.dedent) {
                        state.indent.pop();
                    }

                    const token = typeof rule.token === "function" ?
                        rule.token(matches) :
                        rule.token;
                    if (matches.length > 2 && rule.token &&
                            typeof rule.token !== "string") {
                        for (let group = 2; group < matches.length; group++) {
                            if (matches[group]) {
                                (state.pending || (state.pending = [])).push({
                                    text: matches[group],
                                    token: rule.token[group - 1]
                                });
                            }
                        }
                        stream.backUp(matches[0].length - (matches[1] ? matches[1].length : 0));
                        return token[0];
                    }
                    return Array.isArray(token) ? token[0] : token;
                }

                stream.next();
                return null;
            },

            innerMode: function (state) {
                return state.local && {
                    mode: state.local.mode,
                    state: state.localState
                };
            },

            indent: function (state, textAfter, line) {
                if (state.local && state.local.mode.indent) {
                    return state.local.mode.indent(state.localState, textAfter, line);
                }
                if (state.indent === null || state.local ||
                        metadata.dontIndentStates &&
                        metadata.dontIndentStates.indexOf(state.state) !== -1) {
                    return Pass;
                }

                let indentationIndex = state.indent.length - 1;
                let rules = compiledStates[state.state];
                let remainingText = textAfter;
                let shouldContinue = true;
                while (shouldContinue) {
                    shouldContinue = false;
                    for (let index = 0; index < rules.length; index++) {
                        const rule = rules[index];
                        if (rule.data.dedent && rule.data.dedentIfLineStart !== false) {
                            const match = rule.regex.exec(remainingText);
                            if (match && match[0]) {
                                indentationIndex--;
                                if (rule.data.next || rule.data.push) {
                                    rules = compiledStates[rule.data.next || rule.data.push];
                                }
                                remainingText = remainingText.slice(match[0].length);
                                shouldContinue = true;
                                break;
                            }
                        }
                    }
                }
                return indentationIndex < 0 ? 0 : state.indent[indentationIndex];
            }
        };

        Object.assign(mode, metadata);
        return mode;
    }

    function defineSimpleMode(name, states) {
        defineMode(name, function (config) {
            return simpleMode(config, states);
        });
    }

    function JSXContext(state, mode, depth, previous) {
        this.state = state;
        this.mode = mode;
        this.depth = depth;
        this.prev = previous;
    }

    function copyJSXContext(context) {
        return new JSXContext(
            copyState(context.mode, context.state),
            context.mode,
            context.depth,
            context.prev && copyJSXContext(context.prev)
        );
    }

    function createJSXMode(config, modeConfig) {
        const xmlMode = getMode(config, {
            name: "xml",
            allowMissing: true,
            multilineTagIndentPastTag: false,
            allowMissingTagName: true
        });
        const jsMode = getMode(
            config,
            modeConfig && modeConfig.base || "javascript"
        );
        const indentUnit = Number(config && config.indentUnit) || 2;

        function flatXMLIndent(state) {
            const tagName = state.tagName;
            state.tagName = null;
            const result = xmlMode.indent ? xmlMode.indent(state, "", "") : 0;
            state.tagName = tagName;
            return result === Pass ? 0 : result;
        }

        function token(stream, state) {
            if (state.context.mode === xmlMode) {
                return xmlToken(stream, state, state.context);
            }
            return jsToken(stream, state, state.context);
        }

        function xmlToken(stream, state, context) {
            if (context.depth === 2) {
                if (stream.match(/^.*?\*\//)) {
                    context.depth = 1;
                } else {
                    stream.skipToEnd();
                }
                return "comment";
            }

            if (stream.peek() === "{") {
                if (xmlMode.skipAttribute) {
                    xmlMode.skipAttribute(context.state);
                }

                let indentation = flatXMLIndent(context.state);
                let xmlContext = context.state.context;
                if (xmlContext && stream.match(/^[^>]*>\s*$/, false)) {
                    while (xmlContext.prev && !xmlContext.startOfLine) {
                        xmlContext = xmlContext.prev;
                    }
                    if (xmlContext.startOfLine) {
                        indentation -= indentUnit;
                    } else if (context.prev.state.lexical) {
                        indentation = context.prev.state.lexical.indented;
                    }
                } else if (context.depth === 1) {
                    indentation += indentUnit;
                }

                state.context = new JSXContext(
                    startState(jsMode, indentation),
                    jsMode,
                    0,
                    state.context
                );
                return null;
            }

            if (context.depth === 1) {
                if (stream.peek() === "<") {
                    if (xmlMode.skipAttribute) {
                        xmlMode.skipAttribute(context.state);
                    }
                    state.context = new JSXContext(
                        startState(xmlMode, flatXMLIndent(context.state)),
                        xmlMode,
                        0,
                        state.context
                    );
                    return null;
                }
                if (stream.match("//")) {
                    stream.skipToEnd();
                    return "comment";
                }
                if (stream.match("/*")) {
                    context.depth = 2;
                    return token(stream, state);
                }
            }

            const style = xmlMode.token(stream, context.state);
            const current = stream.current();
            let openingBrace;
            if (/\btag\b/.test(style || "")) {
                if (/>$/.test(current)) {
                    if (context.state.context) {
                        context.depth = 0;
                    } else {
                        state.context = state.context.prev;
                    }
                } else if (/^</.test(current)) {
                    context.depth = 1;
                }
            } else if (!style && (openingBrace = current.indexOf("{")) > -1) {
                stream.backUp(current.length - openingBrace);
            }
            return style;
        }

        function jsToken(stream, state, context) {
            if (stream.peek() === "<" &&
                    !stream.match(/^<([^<>]|<[^>]*>)+,\s*>/, false) &&
                    jsMode.expressionAllowed &&
                    jsMode.expressionAllowed(stream, context.state)) {
                const indentation = jsMode.indent ?
                    jsMode.indent(context.state, "", "") :
                    0;
                state.context = new JSXContext(
                    startState(xmlMode, indentation === Pass ? 0 : indentation),
                    xmlMode,
                    0,
                    state.context
                );
                if (jsMode.skipExpression) {
                    jsMode.skipExpression(context.state);
                }
                return null;
            }

            const style = jsMode.token(stream, context.state);
            if (!style && context.depth !== null && context.depth !== undefined) {
                const current = stream.current();
                if (current === "{") {
                    context.depth++;
                } else if (current === "}" && --context.depth === 0) {
                    state.context = state.context.prev;
                }
            }
            return style;
        }

        return {
            startState: function () {
                return {
                    context: new JSXContext(startState(jsMode), jsMode)
                };
            },

            copyState: function (state) {
                return {
                    context: copyJSXContext(state.context)
                };
            },

            token: token,

            indent: function (state, textAfter, line) {
                const currentMode = state.context.mode;
                return currentMode.indent ?
                    currentMode.indent(state.context.state, textAfter, line) :
                    Pass;
            },

            innerMode: function (state) {
                return state.context;
            }
        };
    }

    const DEFAULT_HTML_MIXED_TAGS = {
        script: [
            ["lang", /(javascript|babel)/i, "javascript"],
            [
                "type",
                /^(?:text|application)\/(?:x-)?(?:java|ecma)script$|^module$|^$/i,
                "javascript"
            ],
            ["type", /./, "text/plain"],
            [null, null, "javascript"]
        ],
        style: [
            ["lang", /^css$/i, "css"],
            ["type", /^(text\/)?(x-)?(stylesheet|css)$/i, "css"],
            ["type", /./, "text/plain"],
            [null, null, "css"]
        ]
    };
    const VUE_HTML_MIXED_TAGS = {
        script: [
            ["lang", /coffee(script)?/i, "coffeescript"],
            [
                "type",
                /^(?:text|application)\/(?:x-)?coffee(?:script)?$/i,
                "coffeescript"
            ],
            ["lang", /^(?:ts|typescript)$/i, {
                name: "javascript",
                typescript: true
            }],
            [
                "type",
                /^(?:text|application)\/typescript$/i,
                {
                    name: "javascript",
                    typescript: true
                }
            ],
            ["lang", /^babel$/i, "javascript"],
            ["type", /^text\/babel$/i, "javascript"],
            ["type", /^text\/ecmascript-\d+$/i, "javascript"]
        ],
        style: [
            ["lang", /^stylus$/i, "stylus"],
            ["lang", /^sass$/i, "sass"],
            ["lang", /^less$/i, "text/x-less"],
            ["lang", /^scss$/i, "text/x-scss"],
            ["type", /^(text\/)?(x-)?styl(us)?$/i, "stylus"],
            ["type", /^text\/sass/i, "sass"],
            ["type", /^(text\/)?(x-)?scss$/i, "text/x-scss"],
            ["type", /^(text\/)?(x-)?less$/i, "text/x-less"]
        ],
        template: [
            ["lang", /^vue-template$/i, "vue"],
            ["lang", /^pug$/i, "pug"],
            ["lang", /^handlebars$/i, "handlebars"],
            ["type", /^(text\/)?(x-)?pug$/i, "pug"],
            ["type", /^text\/x-handlebars-template$/i, "handlebars"],
            [null, null, "vue-template"]
        ]
    };
    const htmlAttributeRegexpCache = {};

    function getHTMLAttributeValue(text, attribute) {
        let expression = htmlAttributeRegexpCache[attribute];
        if (!expression) {
            expression = new RegExp(
                "\\s+" + attribute + "\\s*=\\s*('|\")?([^'\"]+)('|\")?\\s*"
            );
            htmlAttributeRegexpCache[attribute] = expression;
        }
        const match = text.match(expression);
        return match ? /^\s*(.*?)\s*$/.exec(match[2])[1] : "";
    }

    function addHTMLMixedTags(source, destination) {
        Object.keys(source).forEach(function (tagName) {
            const target = destination[tagName] || (destination[tagName] = []);
            for (let index = source[tagName].length - 1; index >= 0; index--) {
                target.unshift(source[tagName][index]);
            }
        });
    }

    function findHTMLMixedMode(tagInfo, tagText) {
        for (let index = 0; index < tagInfo.length; index++) {
            const specification = tagInfo[index];
            if (!specification[0]) {
                return specification[2];
            }
            specification[1].lastIndex = 0;
            if (specification[1].test(
                getHTMLAttributeValue(tagText, specification[0])
            )) {
                return specification[2];
            }
        }
    }

    function htmlClosingTagRegexp(tagName, anchored) {
        return new RegExp(
            (anchored ? "^" : "") + "<\\/\\s*" + tagName + "\\s*>",
            "i"
        );
    }

    function maybeBackUpBeforeClosingTag(stream, expression, style) {
        const current = stream.current();
        const close = current.search(expression);
        if (close > -1) {
            stream.backUp(current.length - close);
        } else if (/<\/?$/.test(current)) {
            stream.backUp(current.length);
            if (!stream.match(expression, false)) {
                stream.match(current);
            }
        }
        return style;
    }

    function createHTMLMixedMode(config, parserConfig) {
        const htmlMode = getMode(config, {
            name: "xml",
            htmlMode: true,
            multilineTagIndentFactor: parserConfig &&
                parserConfig.multilineTagIndentFactor,
            multilineTagIndentPastTag: parserConfig &&
                parserConfig.multilineTagIndentPastTag,
            allowMissingTagName: parserConfig &&
                parserConfig.allowMissingTagName
        });
        const tags = {};
        const scriptTypes = parserConfig && parserConfig.scriptTypes || [];
        addHTMLMixedTags(DEFAULT_HTML_MIXED_TAGS, tags);
        if (parserConfig && parserConfig.tags) {
            addHTMLMixedTags(parserConfig.tags, tags);
        }
        for (let index = scriptTypes.length - 1; index >= 0; index--) {
            tags.script.unshift([
                "type",
                scriptTypes[index].matches,
                scriptTypes[index].mode
            ]);
        }

        function htmlToken(stream, state) {
            const style = htmlMode.token(stream, state.htmlState);
            const current = stream.current();
            const tagName = state.htmlState.tagName &&
                String(state.htmlState.tagName).toLowerCase();

            if (/\btag\b/.test(style || "") && tagName &&
                    !/[<>\s/]/.test(current) &&
                    Object.prototype.hasOwnProperty.call(tags, tagName)) {
                state.inTag = tagName + " ";
            } else if (state.inTag && /\btag\b/.test(style || "") &&
                    />$/.test(current)) {
                const inTag = /^(\S+) (.*)/.exec(state.inTag);
                state.inTag = null;
                const modeSpec = current === ">" &&
                    findHTMLMixedMode(tags[inTag[1]], inTag[2]);
                state.localMode = getMode(config, modeSpec);
                state.localState = startState(state.localMode);
                state.token = localToken;
                state.endTagAnchored = htmlClosingTagRegexp(inTag[1], true);
                state.endTag = htmlClosingTagRegexp(inTag[1], false);
            } else if (state.inTag) {
                state.inTag += current;
                if (stream.eol()) {
                    state.inTag += " ";
                }
            }
            return style;
        }

        function localToken(stream, state) {
            if (stream.match(state.endTagAnchored, false)) {
                state.token = htmlToken;
                state.localMode = null;
                state.localState = null;
                state.endTag = null;
                state.endTagAnchored = null;
                return null;
            }
            return maybeBackUpBeforeClosingTag(
                stream,
                state.endTag,
                state.localMode.token(stream, state.localState)
            );
        }

        return {
            startState: function () {
                return {
                    token: htmlToken,
                    inTag: null,
                    localMode: null,
                    localState: null,
                    endTag: null,
                    endTagAnchored: null,
                    htmlState: startState(htmlMode)
                };
            },

            copyState: function (state) {
                return {
                    token: state.token,
                    inTag: state.inTag,
                    localMode: state.localMode,
                    localState: state.localState ?
                        copyState(state.localMode, state.localState) :
                        null,
                    endTag: state.endTag,
                    endTagAnchored: state.endTagAnchored,
                    htmlState: copyState(htmlMode, state.htmlState)
                };
            },

            token: function (stream, state) {
                return state.token(stream, state);
            },

            indent: function (state, textAfter, line) {
                if (state.localMode && !/^\s*<\//.test(textAfter) &&
                        state.localMode.indent) {
                    return state.localMode.indent(state.localState, textAfter, line);
                }
                return htmlMode.indent ?
                    htmlMode.indent(state.htmlState, textAfter, line) :
                    Pass;
            },

            innerMode: function (state) {
                return {
                    state: state.localState || state.htmlState,
                    mode: state.localMode || htmlMode
                };
            }
        };
    }

    function createVueTemplateMode(config, parserConfig) {
        const mustacheOverlay = {
            token: function (stream) {
                if (stream.match(/^\{\{.*?\}\}/)) {
                    return "meta mustache";
                }
                while (stream.next() && !stream.match("{{", false)) {
                    // Continue to the next interpolation marker.
                }
                return null;
            }
        };
        return overlayMode(
            getMode(config, parserConfig.backdrop || "text/html"),
            mustacheOverlay
        );
    }

    function createHTMLEmbeddedMode(config, parserConfig) {
        const modeConfig = parserConfig || {};
        const closeComment = modeConfig.closeComment || "--%>";
        return multiplexingMode(
            getMode(config, "htmlmixed"),
            {
                open: modeConfig.openComment || "<%--",
                close: closeComment,
                delimStyle: "comment",
                mode: {
                    token: function (stream) {
                        stream.skipTo(closeComment) || stream.skipToEnd();
                        return "comment";
                    }
                }
            },
            {
                open: modeConfig.open || modeConfig.scriptStartRegex || "<%",
                close: modeConfig.close || modeConfig.scriptEndRegex || "%>",
                mode: getMode(config, modeConfig.scriptingModeSpec)
            }
        );
    }

    function wordSet(words) {
        const result = {};
        words.split(/\s+/).filter(Boolean).forEach(function (word) {
            result[word] = true;
        });
        return result;
    }

    const SQL_DIALECT_KEYWORD_STRINGS = Object.freeze({
        sql: (
            "alter and as asc between by count create delete desc distinct " +
            "drop from group having in insert into is join like not on or " +
            "order select set table union update values where limit begin"
        ),
        mssql: (
            "alter and as asc between by count create delete desc distinct " +
            "drop from group having in insert into is join like not on or " +
            "order select set table union update values where limit begin " +
            "trigger proc view index for add constraint key primary foreign " +
            "collate clustered nonclustered declare exec go if use holdlock " +
            "nolock nowait paglock readcommitted readcommittedlock readpast " +
            "readuncommitted repeatableread rowlock serializable snapshot " +
            "tablock tablockx updlock with"
        ),
        mysql: (
            "alter and as asc between by count create delete desc distinct " +
            "drop from group having in insert into is join like not on or " +
            "order select set table union update values where limit accessible " +
            "action add after algorithm all analyze asensitive at authors " +
            "auto_increment autocommit avg avg_row_length before binary binlog " +
            "both btree cache call cascade cascaded case catalog_name chain " +
            "change changed character check checkpoint checksum class_origin " +
            "client_statistics close coalesce code collate collation " +
            "collations column columns comment commit committed completion " +
            "concurrent condition connection consistent constraint contains " +
            "continue contributors convert cross current current_date " +
            "current_time current_timestamp current_user cursor data database " +
            "databases day_hour day_microsecond day_minute day_second " +
            "deallocate dec declare default delay_key_write delayed delimiter " +
            "des_key_file describe deterministic dev_pop dev_samp deviance " +
            "diagnostics directory disable discard distinctrow div dual " +
            "dumpfile each elseif enable enclosed end ends engine engines enum " +
            "errors escape escaped even event events every execute exists exit " +
            "explain extended fast fetch field fields first flush for force " +
            "foreign found_rows full fulltext function general get global " +
            "grant grants group_concat handler hash help high_priority hosts " +
            "hour_microsecond hour_minute hour_second if ignore " +
            "ignore_server_ids import index index_statistics infile inner " +
            "innodb inout insensitive insert_method install interval invoker " +
            "isolation iterate key keys kill language last leading leave left " +
            "level linear lines list load local localtime localtimestamp lock " +
            "logs low_priority master master_heartbeat_period " +
            "master_ssl_verify_server_cert masters match max max_rows " +
            "maxvalue message_text middleint migrate min min_rows " +
            "minute_microsecond minute_second mod mode modifies modify mutex " +
            "mysql_errno natural next no no_write_to_binlog offline offset one " +
            "online open optimize option optionally out outer outfile " +
            "pack_keys parser partition partitions password phase plugin " +
            "plugins prepare preserve prev primary privileges procedure " +
            "processlist profile profiles purge query quick range read " +
            "read_write reads real rebuild recover references regexp relaylog " +
            "release remove rename reorganize repair repeatable replace " +
            "require resignal restrict resume return returns revoke right " +
            "rlike rollback rollup row row_format rtree savepoint schedule " +
            "schema schema_name schemas second_microsecond security sensitive " +
            "separator serializable server session share show signal slave " +
            "slow smallint snapshot soname spatial specific sql sql_big_result " +
            "sql_buffer_result sql_cache sql_calc_found_rows sql_no_cache " +
            "sql_small_result sqlexception sqlstate sqlwarning ssl start " +
            "starting starts status std stddev stddev_pop stddev_samp storage " +
            "straight_join subclass_origin sum suspend table_name " +
            "table_statistics tables tablespace temporary terminated to " +
            "trailing transaction trigger triggers truncate uncommitted undo " +
            "uninstall unique unlock upgrade usage use use_frm user " +
            "user_resources user_statistics using utc_date utc_time " +
            "utc_timestamp value variables varying view views warnings when " +
            "while with work write xa xor year_month zerofill begin do then " +
            "else loop repeat"
        ),
        mariadb: (
            "alter and as asc between by count create delete desc distinct " +
            "drop from group having in insert into is join like not on or " +
            "order select set table union update values where limit accessible " +
            "action add after algorithm all always analyze asensitive at " +
            "authors auto_increment autocommit avg avg_row_length before " +
            "binary binlog both btree cache call cascade cascaded case " +
            "catalog_name chain change changed character check checkpoint " +
            "checksum class_origin client_statistics close coalesce code " +
            "collate collation collations column columns comment commit " +
            "committed completion concurrent condition connection consistent " +
            "constraint contains continue contributors convert cross current " +
            "current_date current_time current_timestamp current_user cursor " +
            "data database databases day_hour day_microsecond day_minute " +
            "day_second deallocate dec declare default delay_key_write delayed " +
            "delimiter des_key_file describe deterministic dev_pop dev_samp " +
            "deviance diagnostics directory disable discard distinctrow div " +
            "dual dumpfile each elseif enable enclosed end ends engine engines " +
            "enum errors escape escaped even event events every execute exists " +
            "exit explain extended fast fetch field fields first flush for " +
            "force foreign found_rows full fulltext function general generated " +
            "get global grant grants group_concat handler hard hash help " +
            "high_priority hosts hour_microsecond hour_minute hour_second if " +
            "ignore ignore_server_ids import index index_statistics infile " +
            "inner innodb inout insensitive insert_method install interval " +
            "invoker isolation iterate key keys kill language last leading " +
            "leave left level linear lines list load local localtime " +
            "localtimestamp lock logs low_priority master " +
            "master_heartbeat_period master_ssl_verify_server_cert masters " +
            "match max max_rows maxvalue message_text middleint migrate min " +
            "min_rows minute_microsecond minute_second mod mode modifies " +
            "modify mutex mysql_errno natural next no no_write_to_binlog " +
            "offline offset one online open optimize option optionally out " +
            "outer outfile pack_keys parser partition partitions password " +
            "persistent phase plugin plugins prepare preserve prev primary " +
            "privileges procedure processlist profile profiles purge query " +
            "quick range read read_write reads real rebuild recover references " +
            "regexp relaylog release remove rename reorganize repair " +
            "repeatable replace require resignal restrict resume return " +
            "returns revoke right rlike rollback rollup row row_format rtree " +
            "savepoint schedule schema schema_name schemas second_microsecond " +
            "security sensitive separator serializable server session share " +
            "show shutdown signal slave slow smallint snapshot soft soname " +
            "spatial specific sql sql_big_result sql_buffer_result sql_cache " +
            "sql_calc_found_rows sql_no_cache sql_small_result sqlexception " +
            "sqlstate sqlwarning ssl start starting starts status std stddev " +
            "stddev_pop stddev_samp storage straight_join subclass_origin sum " +
            "suspend table_name table_statistics tables tablespace temporary " +
            "terminated to trailing transaction trigger triggers truncate " +
            "uncommitted undo uninstall unique unlock upgrade usage use " +
            "use_frm user user_resources user_statistics using utc_date " +
            "utc_time utc_timestamp value variables varying view views " +
            "virtual warnings when while with work write xa xor year_month " +
            "zerofill begin do then else loop repeat"
        ),
        sqlite: (
            "alter and as asc between by count create delete desc distinct " +
            "drop from group having in insert into is join like not on or " +
            "order select set table union update values where limit abort " +
            "action add after all analyze attach autoincrement before begin " +
            "cascade case cast check collate column commit conflict constraint " +
            "cross current_date current_time current_timestamp database default " +
            "deferrable deferred detach each else end escape except exclusive " +
            "exists explain fail for foreign full glob if ignore immediate " +
            "index indexed initially inner instead intersect isnull key left " +
            "match natural no notnull null of offset outer plan pragma primary " +
            "query raise recursive references regexp reindex release rename " +
            "replace restrict right rollback row savepoint temp temporary then " +
            "to transaction trigger unique using vacuum view virtual when with " +
            "without"
        ),
        cassandra: (
            "add all allow alter and any apply as asc authorize batch begin by " +
            "clustering columnfamily compact consistency count create custom " +
            "delete desc distinct drop each_quorum exists filtering from grant " +
            "if in index insert into key keyspace keyspaces level limit " +
            "local_one local_quorum modify nan norecursive nosuperuser not of " +
            "on one order password permission permissions primary quorum " +
            "rename revoke schema select set storage superuser table three to " +
            "token truncate ttl two type unlogged update use user users using " +
            "values where with writetime"
        ),
        plsql: (
            "abort accept access add all alter and any array arraylen as asc " +
            "assert assign at attributes audit authorization avg base_table " +
            "begin between binary_integer body boolean by case cast char " +
            "char_base check close cluster clusters colauth column comment " +
            "commit compress connect connected constant constraint crash " +
            "create current currval cursor data_base database date dba " +
            "deallocate debugoff debugon decimal declare default definition " +
            "delay delete desc digits dispose distinct do drop else elseif " +
            "elsif enable end entry escape exception exception_init exchange " +
            "exclusive exists exit external fast fetch file for force form " +
            "from function generic goto grant group having identified if " +
            "immediate in increment index indexes indicator initial initrans " +
            "insert interface intersect into is key level library like limited " +
            "local lock log logging long loop master maxextents maxtrans " +
            "member minextents minus mislabel mode modify multiset new next no " +
            "noaudit nocompress nologging noparallel not nowait number_base " +
            "object of off offline on online only open option or order out " +
            "package parallel partition pctfree pctincrease pctused " +
            "pls_integer positive positiven pragma primary prior private " +
            "privileges procedure public raise range raw read rebuild record " +
            "ref references refresh release rename replace resource restrict " +
            "return returning returns reverse revoke rollback row rowid " +
            "rowlabel rownum rows run savepoint schema segment select separate " +
            "session set share snapshot some space split sql start statement " +
            "storage subtype successful synonym tabauth table tables " +
            "tablespace task terminate then to trigger truncate type union " +
            "unique unlimited unrecoverable unusable update use using validate " +
            "value values variable view views when whenever where while with " +
            "work"
        ),
        hive: (
            "select alter $elem$ $key$ $value$ add after all analyze and " +
            "archive as asc before between binary both bucket buckets by " +
            "cascade case cast change cluster clustered clusterstatus " +
            "collection column columns comment compute concatenate continue " +
            "create cross cursor data database databases dbproperties deferred " +
            "delete delimited desc describe directory disable distinct " +
            "distribute drop else enable end escaped exclusive exists explain " +
            "export extended external fetch fields fileformat first format " +
            "formatted from full function functions grant group having " +
            "hold_ddltime idxproperties if import in index indexes inpath " +
            "inputdriver inputformat insert intersect into is items join keys " +
            "lateral left like limit lines load local location lock locks " +
            "mapjoin materialized minus msck no_drop nocompress not of offline " +
            "on option or order out outer outputdriver outputformat overwrite " +
            "partition partitioned partitions percent plus preserve procedure " +
            "purge range rcfile read readonly reads rebuild recordreader " +
            "recordwriter recover reduce regexp rename repair replace restrict " +
            "revoke right rlike row schema schemas semi sequencefile serde " +
            "serdeproperties set shared show show_database sort sorted ssl " +
            "statistics stored streamtable table tables tablesample " +
            "tblproperties temporary terminated textfile then tmp to touch " +
            "transform trigger unarchive undo union uniquejoin unlock update " +
            "use using utc utc_tmestamp view when where while with admin " +
            "authorization char compact compactions conf cube current " +
            "current_date current_timestamp day decimal defined dependency " +
            "directories elem_type exchange file following for grouping hour " +
            "ignore inner interval jar less logical macro minute month more " +
            "none noscan over owner partialscan preceding pretty principals " +
            "protection reload rewrite role roles rollup rows second server " +
            "sets skewed transactions truncate unbounded unset uri user values " +
            "window year"
        ),
        pgsql: (
            "alter and as asc between by count create delete desc distinct " +
            "drop from group having in insert into is join like not on or " +
            "order select set table union update values where limit a abort " +
            "abs absent absolute access according action ada add admin after " +
            "aggregate alias all allocate also always analyse analyze any are " +
            "array array_agg array_max_cardinality asensitive assert assertion " +
            "assignment asymmetric at atomic attach attribute attributes " +
            "authorization avg backward base64 before begin begin_frame " +
            "begin_partition bernoulli bigint binary bit bit_length blob " +
            "blocked bom boolean both breadth c cache call called cardinality " +
            "cascade cascaded case cast catalog catalog_name ceil ceiling " +
            "chain char char_length character character_length " +
            "character_set_catalog character_set_name character_set_schema " +
            "characteristics characters check checkpoint class class_origin " +
            "clob close cluster coalesce cobol collate collation " +
            "collation_catalog collation_name collation_schema collect column " +
            "column_name columns command_function command_function_code " +
            "comment comments commit committed concurrently condition " +
            "condition_number configuration conflict connect connection " +
            "connection_name constant constraint constraint_catalog " +
            "constraint_name constraint_schema constraints constructor " +
            "contains content continue control conversion convert copy corr " +
            "corresponding cost covar_pop covar_samp cross csv cube cume_dist " +
            "current current_catalog current_date " +
            "current_default_transform_group current_path current_role " +
            "current_row current_schema current_time current_timestamp " +
            "current_transform_group_for_type current_user cursor cursor_name " +
            "cycle data database datalink datatype date " +
            "datetime_interval_code datetime_interval_precision day db " +
            "deallocate debug dec decimal declare default defaults deferrable " +
            "deferred defined definer degree delimiter delimiters dense_rank " +
            "depends depth deref derived describe descriptor detach detail " +
            "deterministic diagnostics dictionary disable discard disconnect " +
            "dispatch dlnewcopy dlpreviouscopy dlurlcomplete " +
            "dlurlcompleteonly dlurlcompletewrite dlurlpath dlurlpathonly " +
            "dlurlpathwrite dlurlscheme dlurlserver dlvalue do document domain " +
            "double dump dynamic dynamic_function dynamic_function_code each " +
            "element else elseif elsif empty enable encoding encrypted end " +
            "end_frame end_partition endexec enforced enum equals errcode " +
            "error escape event every except exception exclude excluding " +
            "exclusive exec execute exists exit exp explain expression " +
            "extension external extract false family fetch file filter final " +
            "first first_value flag float floor following for force foreach " +
            "foreign fortran forward found frame_row free freeze fs full " +
            "function functions fusion g general generated get global go goto " +
            "grant granted greatest grouping groups handler header hex " +
            "hierarchy hint hold hour id identity if ignore ilike immediate " +
            "immediately immutable implementation implicit import include " +
            "including increment indent index indexes indicator info inherit " +
            "inherits initially inline inner inout input insensitive instance " +
            "instantiable instead int integer integrity intersect intersection " +
            "interval invoker isnull isolation k key key_member key_type label " +
            "lag language large last last_value lateral lead leading leakproof " +
            "least left length level library like_regex link listen ln load " +
            "local localtime localtimestamp location locator lock locked log " +
            "logged loop lower m map mapping match matched materialized max " +
            "max_cardinality maxvalue member merge message message_length " +
            "message_octet_length message_text method min minute minvalue mod " +
            "mode modifies module month more move multiset mumps name names " +
            "namespace national natural nchar nclob nesting new next nfc nfd " +
            "nfkc nfkd nil no none normalize normalized nothing notice notify " +
            "notnull nowait nth_value ntile null nullable nullif nulls number " +
            "numeric object occurrences_regex octet_length octets of off " +
            "offset oids old only open operator option options ordering " +
            "ordinality others out outer output over overlaps overlay " +
            "overriding owned owner p pad parallel parameter parameter_mode " +
            "parameter_name parameter_ordinal_position " +
            "parameter_specific_catalog parameter_specific_name " +
            "parameter_specific_schema parser partial partition pascal " +
            "passing passthrough password path percent percent_rank " +
            "percentile_cont percentile_disc perform period permission " +
            "pg_context pg_datatype_name pg_exception_context " +
            "pg_exception_detail pg_exception_hint placing plans pli policy " +
            "portion position position_regex power precedes preceding " +
            "precision prepare prepared preserve primary print_strict_params " +
            "prior privileges procedural procedure procedures program public " +
            "publication query quote raise range rank read reads real reassign " +
            "recheck recovery recursive ref references referencing refresh " +
            "regr_avgx regr_avgy regr_count regr_intercept regr_r2 regr_slope " +
            "regr_sxx regr_sxy regr_syy reindex relative release rename " +
            "repeatable replace replica requiring reset respect restart " +
            "restore restrict result result_oid return returned_cardinality " +
            "returned_length returned_octet_length returned_sqlstate " +
            "returning returns reverse revoke right role rollback rollup " +
            "routine routine_catalog routine_name routine_schema routines row " +
            "row_count row_number rows rowtype rule savepoint scale schema " +
            "schema_name schemas scope scope_catalog scope_name scope_schema " +
            "scroll search second section security selective self sensitive " +
            "sequence sequences serializable server server_name session " +
            "session_user setof sets share show similar simple size skip slice " +
            "smallint snapshot some source space specific specific_name " +
            "specifictype sql sqlcode sqlerror sqlexception sqlstate sqlwarning " +
            "sqrt stable stacked standalone start state statement static " +
            "statistics stddev_pop stddev_samp stdin stdout storage strict " +
            "strip structure style subclass_origin submultiset subscription " +
            "substring substring_regex succeeds sum symmetric sysid system " +
            "system_time system_user t table_name tables tablesample " +
            "tablespace temp template temporary text then ties time timestamp " +
            "timezone_hour timezone_minute to token top_level_count trailing " +
            "transaction transaction_active transactions_committed " +
            "transactions_rolled_back transform transforms translate " +
            "translate_regex translation treat trigger trigger_catalog " +
            "trigger_name trigger_schema trim trim_array true truncate trusted " +
            "type types uescape unbounded uncommitted under unencrypted unique " +
            "unknown unlink unlisten unlogged unnamed unnest until untyped " +
            "upper uri usage use_column use_variable user " +
            "user_defined_type_catalog user_defined_type_code " +
            "user_defined_type_name user_defined_type_schema using vacuum " +
            "valid validate validator value value_of var_pop var_samp " +
            "varbinary varchar variable_conflict variadic varying verbose " +
            "version versioning view views volatile warning when whenever " +
            "while whitespace width_bucket window with within without work " +
            "wrapper write xml xmlagg xmlattributes xmlbinary xmlcast " +
            "xmlcomment xmlconcat xmldeclaration xmldocument xmlelement " +
            "xmlexists xmlforest xmliterate xmlnamespaces xmlparse xmlpi " +
            "xmlquery xmlroot xmlschema xmlserialize xmltable xmltext " +
            "xmlvalidate year yes zone"
        ),
        gql: (
            "ancestor and asc by contains desc descendant distinct from group " +
            "has in is limit offset on order select superset where"
        ),
        gpsql: (
            "abort absolute access action active add admin after aggregate all " +
            "also alter always analyse analyze and any array as asc assertion " +
            "assignment asymmetric at authorization backward before begin " +
            "between bigint binary bit boolean both by cache called cascade " +
            "cascaded case cast chain char character characteristics check " +
            "checkpoint class close cluster coalesce codegen collate column " +
            "comment commit committed concurrency concurrently configuration " +
            "connection constraint constraints contains content continue " +
            "conversion copy cost cpu_rate_limit create createdb " +
            "createexttable createrole createuser cross csv cube current " +
            "current_catalog current_date current_role current_schema " +
            "current_time current_timestamp current_user cursor cycle data " +
            "database day deallocate dec decimal declare decode default " +
            "defaults deferrable deferred definer delete delimiter delimiters " +
            "deny desc dictionary disable discard distinct distributed do " +
            "document domain double drop dxl each else enable encoding " +
            "encrypted end enum errors escape every except exchange exclude " +
            "excluding exclusive execute exists explain extension external " +
            "extract false family fetch fields filespace fill filter first " +
            "float following for force foreign format forward freeze from full " +
            "function global grant granted greatest group group_id grouping " +
            "handler hash having header hold host hour identity if ignore " +
            "ilike immediate immutable implicit in including inclusive " +
            "increment index indexes inherit inherits initially inline inner " +
            "inout input insensitive insert instead int integer intersect " +
            "interval into invoker is isnull isolation join key language large " +
            "last leading least left level like limit list listen load local " +
            "localtime localtimestamp location lock log login mapping master " +
            "match maxvalue median merge minute minvalue missing mode modifies " +
            "modify month move name names national natural nchar new newline " +
            "next no nocreatedb nocreateexttable nocreaterole nocreateuser " +
            "noinherit nologin none noovercommit nosuperuser not nothing notify " +
            "notnull nowait null nullif nulls numeric object of off offset oids " +
            "old on only operator option options or order ordered others out " +
            "outer over overcommit overlaps overlay owned owner parser partial " +
            "partition partitions passing password percent percentile_cont " +
            "percentile_disc placing plans position preceding precision " +
            "prepare prepared preserve primary prior privileges procedural " +
            "procedure protocol queue quote randomly range read readable reads " +
            "real reassign recheck recursive ref references reindex reject " +
            "relative release rename repeatable replace replica reset resource " +
            "restart restrict returning returns revoke right role rollback " +
            "rollup rootpartition row rows rule savepoint scatter schema scroll " +
            "search second security segment select sequence serializable " +
            "session session_user set setof sets share show similar simple " +
            "smallint some split sql stable standalone start statement " +
            "statistics stdin stdout storage strict strip subpartition " +
            "subpartitions substring superuser symmetric sysid system table " +
            "tablespace temp template temporary text then threshold ties time " +
            "timestamp to trailing transaction treat trigger trim true " +
            "truncate trusted type unbounded uncommitted unencrypted union " +
            "unique unknown unlisten until update user using vacuum valid " +
            "validation validator value values varchar variadic varying " +
            "verbose version view volatile web when where whitespace window " +
            "with within without work writable write xml xmlattributes " +
            "xmlconcat xmlelement xmlexists xmlforest xmlparse xmlpi xmlroot " +
            "xmlserialize year yes zone"
        ),
        sparksql: (
            "add after all alter analyze and anti archive array as asc at " +
            "between bucket buckets by cache cascade case cast change clear " +
            "cluster clustered codegen collection column columns comment " +
            "commit compact compactions compute concatenate cost create cross " +
            "cube current current_date current_timestamp database databases " +
            "data dbproperties defined delete delimited deny desc describe dfs " +
            "directories distinct distribute drop else end escaped except " +
            "exchange exists explain export extended external false fields " +
            "fileformat first following for format formatted from full " +
            "function functions global grant group grouping having if ignore " +
            "import in index indexes inner inpath inputformat insert intersect " +
            "interval into is items join keys last lateral lazy left like " +
            "limit lines list load local location lock locks logical macro map " +
            "minus msck natural no not null nulls of on optimize option options " +
            "or order out outer outputformat over overwrite partition " +
            "partitioned partitions percent preceding principals purge range " +
            "recordreader recordwriter recover reduce refresh regexp rename " +
            "repair replace reset restrict revoke right rlike role roles " +
            "rollback rollup row rows schema schemas select semi separated " +
            "serde serdeproperties set sets show skewed sort sorted start " +
            "statistics stored stratify struct table tables tablesample " +
            "tblproperties temp temporary terminated then to touch transaction " +
            "transactions transform true truncate unarchive unbounded uncache " +
            "union unlock unset use using values view when where window with"
        ),
        esper: (
            "alter and as asc between by count create delete desc distinct " +
            "drop from group having in insert into is join like not on or " +
            "order select set table union update values where limit after all " +
            "at avedev avg case cast coalesce current_timestamp day days " +
            "define else end escape events every exists false first full hour " +
            "hours inner instanceof irstream istream last lastweekday left max " +
            "match_recognize matches median measures metadatasql min minute " +
            "minutes msec millisecond milliseconds null offset outer output " +
            "partition pattern prev prior regexp retain-union " +
            "retain-intersection right rstream sec second seconds some snapshot " +
            "sql stddev sum then true unidirectional until variable weekday " +
            "when window"
        )
    });

    function createPHPStreamParser() {
        const keywords = wordSet(
            "abstract and array as break callable case catch class clone const continue " +
            "declare default do else elseif enddeclare endfor endforeach endif endswitch " +
            "endwhile enum extends final finally fn for foreach from function global goto " +
            "if implements include include_once instanceof insteadof interface iterable " +
            "match namespace never new object or parent print private protected public " +
            "readonly require require_once return self static string switch throw trait " +
            "try unset use var while xor yield"
        );
        const atoms = wordSet("true false null TRUE FALSE NULL");
        const builtins = wordSet(
            "count define defined die echo empty eval exit isset list print_r strlen " +
            "var_dump var_export"
        );

        function phpString(closing, escapes) {
            return function (stream, state) {
                if (escapes !== false && stream.match("${", false) ||
                        stream.match("{$", false)) {
                    state.tokenize = null;
                    return "string";
                }

                if (escapes !== false &&
                        stream.match(/^\$[a-zA-Z_][a-zA-Z0-9_]*/)) {
                    if (stream.match("[", false)) {
                        state.tokenize = matchSequence([
                            [["[", null]],
                            [
                                [/\d[\w.]*/, "number"],
                                [/\$[a-zA-Z_][a-zA-Z0-9_]*/, "variable-2"],
                                [/[\w$]+/, "variable"]
                            ],
                            [["]", null]]
                        ], closing, escapes);
                    } else if (stream.match(/^->\w/, false)) {
                        state.tokenize = matchSequence([
                            [["->", null]],
                            [[/\w+/, "variable"]]
                        ], closing, escapes);
                    }
                    return "variable-2";
                }

                let escaped = false;
                while (!stream.eol() &&
                        (escaped || escapes === false ||
                        !stream.match("{$", false) &&
                        !stream.match(/^(\$[a-zA-Z_][a-zA-Z0-9_]*|\$\{)/, false))) {
                    if (!escaped && stream.match(closing)) {
                        state.tokenize = null;
                        state.tokStack.pop();
                        state.tokStack.pop();
                        break;
                    }
                    escaped = stream.next() === "\\" && !escaped;
                }
                return "string";
            };
        }

        function matchSequence(sequence, closing, escapes) {
            if (!sequence.length) {
                return phpString(closing, escapes);
            }
            return function (stream, state) {
                const patterns = sequence[0];
                for (let index = 0; index < patterns.length; index++) {
                    if (stream.match(patterns[index][0])) {
                        state.tokenize = matchSequence(
                            sequence.slice(1),
                            closing,
                            escapes
                        );
                        return patterns[index][1];
                    }
                }
                state.tokenize = phpString(closing, escapes);
                return "string";
            };
        }

        return CM6.makeLegacyCLike({
            name: "clike",
            keywords: keywords,
            blockKeywords: wordSet(
                "catch do else elseif finally for foreach if switch try while"
            ),
            defKeywords: wordSet(
                "class enum function interface namespace trait"
            ),
            atoms: atoms,
            builtin: builtins,
            multiLineStrings: true,
            namespaceSeparator: "\\",
            hooks: {
                "$": function (stream) {
                    stream.eatWhile(/[\w$_]/);
                    return "variable-2";
                },
                "<": function (stream, state) {
                    const markerPrefix = stream.match(/^<<\s*/);
                    if (!markerPrefix) {
                        return false;
                    }

                    const quote = stream.eat(/['"]/);
                    stream.eatWhile(/[\w.]/);
                    const delimiter = stream.current().slice(
                        markerPrefix[0].length + (quote ? 2 : 1)
                    );
                    if (quote) {
                        stream.eat(quote);
                    }
                    if (!delimiter) {
                        return false;
                    }

                    (state.tokStack || (state.tokStack = [])).push(delimiter, 0);
                    state.tokenize = phpString(delimiter, quote !== "'");
                    return "string";
                },
                "#": function (stream) {
                    while (!stream.eol() && !stream.match("?>", false)) {
                        stream.next();
                    }
                    return "comment";
                },
                "/": function (stream) {
                    if (!stream.eat("/")) {
                        return false;
                    }
                    while (!stream.eol() && !stream.match("?>", false)) {
                        stream.next();
                    }
                    return "comment";
                },
                "\"": function (_stream, state) {
                    (state.tokStack || (state.tokStack = [])).push("\"", 0);
                    state.tokenize = phpString("\"");
                    return "string";
                },
                "{": function (_stream, state) {
                    if (state.tokStack && state.tokStack.length) {
                        state.tokStack[state.tokStack.length - 1]++;
                    }
                    return false;
                },
                "}": function (_stream, state) {
                    if (state.tokStack && state.tokStack.length &&
                            !--state.tokStack[state.tokStack.length - 1]) {
                        state.tokenize = phpString(
                            state.tokStack[state.tokStack.length - 2]
                        );
                    }
                    return false;
                }
            },
            languageData: {
                commentTokens: {
                    line: "//",
                    block: {
                        open: "/*",
                        close: "*/"
                    }
                },
                closeBrackets: {
                    brackets: ["(", "[", "{", "'", "\""]
                }
            }
        });
    }

    function createPHPMode(config, parserConfig) {
        const htmlMode = getMode(
            config,
            parserConfig && parserConfig.htmlMode || "text/html"
        );
        const phpMode = getMode(config, {
            name: "clike",
            helperType: "php",
            variant: "php"
        });
        const openPHP = /<\?(?:php\b|=)?/i;

        function enterPHP(state) {
            state.currentMode = phpMode;
            if (!state.phpState) {
                let indentation = 0;
                if (htmlMode.indent) {
                    indentation = htmlMode.indent(state.htmlState, "", "");
                    if (indentation === Pass) {
                        indentation = 0;
                    }
                }
                state.phpState = startState(phpMode, indentation);
            }
            state.currentState = state.phpState;
        }

        function token(stream, state) {
            const isPHP = state.currentMode === phpMode;
            if (stream.sol() && state.pending &&
                    state.pending !== "\"" && state.pending !== "'") {
                state.pending = null;
            }

            if (!isPHP) {
                if (stream.match(openPHP)) {
                    enterPHP(state);
                    return "meta";
                }

                let style;
                if (state.pending === "\"" || state.pending === "'") {
                    while (!stream.eol() && stream.next() !== state.pending) {
                        // Continue through the remainder of the HTML string.
                    }
                    style = "string";
                } else if (state.pending && stream.pos < state.pending.end) {
                    stream.pos = state.pending.end;
                    style = state.pending.style;
                } else {
                    style = htmlMode.token(stream, state.currentState);
                }

                state.pending = null;
                const current = stream.current();
                const openingIndex = current.search(openPHP);
                if (openingIndex !== -1) {
                    const closingQuote = style === "string" &&
                        current.match(/['"]$/);
                    if (closingQuote && !/\?>/.test(current)) {
                        state.pending = closingQuote[0];
                    } else {
                        state.pending = {
                            end: stream.pos,
                            style: style
                        };
                    }
                    stream.backUp(current.length - openingIndex);
                }
                return style;
            }

            if (state.phpState.tokenize === null && stream.match("?>")) {
                state.currentMode = htmlMode;
                state.currentState = state.htmlState;
                if (!state.phpState.context || !state.phpState.context.prev) {
                    state.phpState = null;
                }
                return "meta";
            }
            return phpMode.token(stream, state.currentState);
        }

        return {
            startState: function () {
                const htmlState = startState(htmlMode);
                const startOpen = Boolean(parserConfig && parserConfig.startOpen);
                const phpState = startOpen ? startState(phpMode) : null;
                return {
                    htmlState: htmlState,
                    phpState: phpState,
                    currentMode: startOpen ? phpMode : htmlMode,
                    currentState: startOpen ? phpState : htmlState,
                    pending: null
                };
            },

            copyState: function (state) {
                const htmlState = copyState(htmlMode, state.htmlState);
                const phpState = state.phpState ?
                    copyState(phpMode, state.phpState) :
                    null;
                return {
                    htmlState: htmlState,
                    phpState: phpState,
                    currentMode: state.currentMode,
                    currentState: state.currentMode === phpMode ?
                        phpState :
                        htmlState,
                    pending: state.pending && typeof state.pending === "object" ?
                        Object.assign({}, state.pending) :
                        state.pending
                };
            },

            token: token,

            indent: function (state, textAfter, line) {
                if (state.currentMode === phpMode && /^\s*\?>/.test(textAfter) ||
                        state.currentMode !== phpMode && /^\s*<\//.test(textAfter)) {
                    return htmlMode.indent ?
                        htmlMode.indent(state.htmlState, textAfter, line) :
                        Pass;
                }
                return state.currentMode.indent ?
                    state.currentMode.indent(state.currentState, textAfter, line) :
                    Pass;
            },

            blockCommentStart: "/*",
            blockCommentEnd: "*/",
            lineComment: "//",

            innerMode: function (state) {
                return {
                    state: state.currentState,
                    mode: state.currentMode
                };
            }
        };
    }

    function defineCoreOptions() {
        const coreDefaults = {
            value: "",
            mode: null,
            indentUnit: 2,
            indentWithTabs: false,
            smartIndent: true,
            tabSize: 4,
            lineSeparator: null,
            specialChars: new RegExp(
                "[\\u0000-\\u001f\\u007f-\\u009f\\u00ad\\u061c\\u200b\\u200e\\u200f" +
                "\\u2028\\u2029\\u202d\\u202e\\u2066\\u2067\\u2069\\ufeff\\ufff9-\\ufffc]",
                "g"
            ),
            specialCharPlaceholder: null,
            electricChars: true,
            inputStyle: "contenteditable",
            spellcheck: false,
            autocorrect: false,
            autocapitalize: false,
            placeholder: "",
            rtlMoveVisually: true,
            wholeLineUpdateBefore: true,
            theme: "default",
            keyMap: "default",
            extraKeys: null,
            continueComments: null,
            autoCloseBrackets: false,
            autoCloseTags: false,
            matchBrackets: false,
            matchTags: false,
            highlightSelectionMatches: false,
            styleActiveLine: false,
            styleSelectedText: false,
            configureMouse: null,
            lineWrapping: false,
            gutters: [],
            fixedGutter: true,
            coverGutterNextToScrollbar: false,
            scrollbarStyle: "native",
            scrollButtonHeight: 0,
            scrollPastEnd: false,
            rulers: false,
            lineNumbers: false,
            firstLineNumber: 1,
            lineNumberFormatter: function (integer) {
                return integer;
            },
            showCursorWhenSelecting: false,
            resetSelectionOnContextMenu: true,
            lineWiseCopyCut: true,
            pasteLinesPerSelection: true,
            selectionsMayTouch: false,
            readOnly: false,
            screenReaderLabel: null,
            disableInput: false,
            dragDrop: true,
            allowDropFileTypes: null,
            cursorBlinkRate: 530,
            cursorScrollMargin: 0,
            cursorHeight: 1,
            singleCursorHeightPerLine: true,
            workTime: 100,
            workDelay: 100,
            flattenSpans: true,
            addModeClass: false,
            pollInterval: 100,
            undoDepth: 200,
            historyEventDelay: 1250,
            viewportMargin: 10,
            maxHighlightLength: 10000,
            moveInputWithCursor: true,
            tabindex: null,
            autofocus: null,
            direction: "ltr",
            phrases: null
        };

        Object.keys(coreDefaults).forEach(function (name) {
            defineOption(name, coreDefaults[name]);
        });
        defineOption("keyMap", coreDefaults.keyMap, function (editor, value, oldValue) {
            const next = getKeyMap(value);
            const previous = oldValue !== Init ? getKeyMap(oldValue) : null;
            if (previous && typeof previous.detach === "function") {
                previous.detach.call(previous, editor, next || null);
            }
            if (next && typeof next.attach === "function") {
                next.attach.call(next, editor, previous || null);
            }
        });
    }

    function defineCoreCommands() {
        function rangeStart(range) {
            if (typeof range.from === "function") {
                return range.from();
            }
            return cmpPos(range.anchor, range.head) <= 0 ? range.anchor : range.head;
        }

        function rangeEnd(range) {
            if (typeof range.to === "function") {
                return range.to();
            }
            return cmpPos(range.anchor, range.head) <= 0 ? range.head : range.anchor;
        }

        function rangeIsEmpty(range) {
            return typeof range.empty === "function" ?
                range.empty() :
                cmpPos(range.anchor, range.head) === 0;
        }

        function runOperation(editor, operation) {
            return typeof editor.operation === "function" ?
                editor.operation(operation) :
                operation();
        }

        function runNativeCommand(editor, command, fallback) {
            if (editor._view && typeof command === "function") {
                return command(editor._view);
            }
            return fallback();
        }

        function runNativeMotion(editor, cursorCommand, selectCommand, fallback) {
            const command = editor.state && editor.state.shift ?
                selectCommand :
                cursorCommand;
            return runNativeCommand(editor, command, fallback);
        }

        function extendSelection(editor, target, options) {
            if (typeof editor.extendSelection === "function") {
                return editor.extendSelection(target, undefined, options);
            }
            return editor.setSelection(editor.getCursor("anchor"), target, options);
        }

        function extendSelections(editor, mapper, options) {
            if (typeof editor.extendSelectionsBy === "function") {
                return editor.extendSelectionsBy(mapper, options);
            }
            return extendSelection(editor, mapper({
                anchor: editor.getCursor("anchor"),
                head: editor.getCursor("head")
            }), options);
        }

        function lineStart(editor, position, smart) {
            const text = editor.getLine(position.line) || "";
            if (!smart) {
                return Pos(position.line, 0);
            }
            const firstNonWhitespace = text.search(/\S/);
            const indentationEnd = firstNonWhitespace < 0 ? text.length : firstNonWhitespace;
            return Pos(position.line, position.ch > 0 && position.ch <= indentationEnd ?
                0 :
                indentationEnd);
        }

        function lineEnd(editor, position) {
            return Pos(position.line, (editor.getLine(position.line) || "").length);
        }

        function replaceComputedRanges(editor, computeRange, origin) {
            const ranges = editor.listSelections().map(function (range) {
                return computeRange(range);
            }).sort(function (left, right) {
                return cmpPos(right.from, left.from);
            });

            return runOperation(editor, function () {
                ranges.forEach(function (range) {
                    editor.replaceRange("", range.from, range.to, origin);
                });
            });
        }

        commands.selectAll = function (editor) {
            return runNativeCommand(editor, CM6.selectAll, function () {
                const lastLine = editor.lastLine();
                return editor.setSelection(
                    Pos(editor.firstLine(), 0),
                    Pos(lastLine, editor.getLine(lastLine).length)
                );
            });
        };
        commands.singleSelection = function (editor) {
            return runNativeCommand(editor, CM6.simplifySelection, function () {
                return editor.setSelection(
                    editor.getCursor("anchor"),
                    editor.getCursor("head"),
                    {scroll: false}
                );
            });
        };
        commands.undo = function (editor) {
            return editor.undo();
        };
        commands.redo = function (editor) {
            return editor.redo();
        };
        commands.undoSelection = function (editor) {
            return typeof editor.undoSelection === "function" ?
                editor.undoSelection() :
                editor.undo();
        };
        commands.redoSelection = function (editor) {
            return typeof editor.redoSelection === "function" ?
                editor.redoSelection() :
                editor.redo();
        };
        commands.goDocStart = function (editor) {
            return runNativeMotion(
                editor,
                CM6.cursorDocStart,
                CM6.selectDocStart,
                function () {
                    return extendSelection(editor, Pos(editor.firstLine(), 0));
                }
            );
        };
        commands.goDocEnd = function (editor) {
            return runNativeMotion(
                editor,
                CM6.cursorDocEnd,
                CM6.selectDocEnd,
                function () {
                    const lastLine = editor.lastLine();
                    return extendSelection(
                        editor,
                        Pos(lastLine, editor.getLine(lastLine).length)
                    );
                }
            );
        };
        commands.goLineStart = function (editor) {
            return runNativeMotion(
                editor,
                CM6.cursorLineStart,
                CM6.selectLineStart,
                function () {
                    return extendSelections(editor, function (range) {
                        return lineStart(editor, range.head, false);
                    }, {
                        origin: "+move",
                        bias: 1
                    });
                }
            );
        };
        commands.goLineStartSmart = function (editor) {
            return runNativeMotion(
                editor,
                CM6.cursorLineStart,
                CM6.selectLineStart,
                function () {
                    return extendSelections(editor, function (range) {
                        return lineStart(editor, range.head, true);
                    }, {
                        origin: "+move",
                        bias: 1
                    });
                }
            );
        };
        commands.goLineEnd = function (editor) {
            return runNativeMotion(
                editor,
                CM6.cursorLineEnd,
                CM6.selectLineEnd,
                function () {
                    return extendSelections(editor, function (range) {
                        return lineEnd(editor, range.head);
                    }, {
                        origin: "+move",
                        bias: -1
                    });
                }
            );
        };
        commands.goLineLeft = commands.goLineStart;
        commands.goLineLeftSmart = commands.goLineStartSmart;
        commands.goLineRight = commands.goLineEnd;
        commands.killLine = function (editor) {
            return runNativeCommand(editor, CM6.deleteToLineEnd, function () {
                return replaceComputedRanges(editor, function (range) {
                    const from = rangeStart(range);
                    const to = rangeEnd(range);
                    if (!rangeIsEmpty(range)) {
                        return {from: from, to: to};
                    }

                    const lineLength = (editor.getLine(to.line) || "").length;
                    return {
                        from: to,
                        to: to.ch === lineLength && to.line < editor.lastLine() ?
                            Pos(to.line + 1, 0) :
                            Pos(to.line, lineLength)
                    };
                }, "+delete");
            });
        };
        commands.deleteLine = function (editor) {
            return runNativeCommand(editor, CM6.deleteLine, function () {
                return replaceComputedRanges(editor, function (range) {
                    const from = rangeStart(range);
                    const to = rangeEnd(range);
                    const lastLine = editor.lastLine();
                    return {
                        from: Pos(from.line, 0),
                        to: to.line < lastLine ?
                            Pos(to.line + 1, 0) :
                            Pos(to.line, (editor.getLine(to.line) || "").length)
                    };
                }, "+delete");
            });
        };
        commands.delLineLeft = function (editor) {
            return runNativeCommand(editor, CM6.deleteLineBoundaryBackward, function () {
                return replaceComputedRanges(editor, function (range) {
                    const from = rangeStart(range);
                    return {
                        from: Pos(from.line, 0),
                        to: from
                    };
                }, "+delete");
            });
        };
        commands.delWrappedLineLeft = commands.delLineLeft;
        commands.delWrappedLineRight = function (editor) {
            return runNativeCommand(editor, CM6.deleteLineBoundaryForward, function () {
                return replaceComputedRanges(editor, function (range) {
                    const from = rangeStart(range);
                    return {
                        from: from,
                        to: lineEnd(editor, from)
                    };
                }, "+delete");
            });
        };
        commands.goLineUp = function (editor) {
            return runNativeMotion(
                editor,
                CM6.cursorLineUp,
                CM6.selectLineUp,
                function () {
                    return editor.moveV(-1, "line");
                }
            );
        };
        commands.goLineDown = function (editor) {
            return runNativeMotion(
                editor,
                CM6.cursorLineDown,
                CM6.selectLineDown,
                function () {
                    return editor.moveV(1, "line");
                }
            );
        };
        commands.goPageUp = function (editor) {
            return runNativeMotion(
                editor,
                CM6.cursorPageUp,
                CM6.selectPageUp,
                function () {
                    return editor.moveV(-1, "page");
                }
            );
        };
        commands.goPageDown = function (editor) {
            return runNativeMotion(
                editor,
                CM6.cursorPageDown,
                CM6.selectPageDown,
                function () {
                    return editor.moveV(1, "page");
                }
            );
        };
        commands.goCharLeft = function (editor) {
            return runNativeMotion(
                editor,
                CM6.cursorCharLeft,
                CM6.selectCharLeft,
                function () {
                    return editor.moveH(-1, "char");
                }
            );
        };
        commands.goCharRight = function (editor) {
            return runNativeMotion(
                editor,
                CM6.cursorCharRight,
                CM6.selectCharRight,
                function () {
                    return editor.moveH(1, "char");
                }
            );
        };
        commands.goColumnLeft = function (editor) {
            return commands.goCharLeft(editor);
        };
        commands.goColumnRight = function (editor) {
            return commands.goCharRight(editor);
        };
        commands.goWordLeft = function (editor) {
            return runNativeMotion(
                editor,
                CM6.cursorGroupLeft,
                CM6.selectGroupLeft,
                function () {
                    return editor.moveH(-1, "word");
                }
            );
        };
        commands.goWordRight = function (editor) {
            return runNativeMotion(
                editor,
                CM6.cursorGroupRight,
                CM6.selectGroupRight,
                function () {
                    return editor.moveH(1, "word");
                }
            );
        };
        commands.goGroupLeft = commands.goWordLeft;
        commands.goGroupRight = commands.goWordRight;
        commands.delCharBefore = function (editor) {
            return runNativeCommand(editor, CM6.deleteCharBackward, function () {
                return editor.deleteH(-1, "codepoint");
            });
        };
        commands.delCharAfter = function (editor) {
            return runNativeCommand(editor, CM6.deleteCharForward, function () {
                return editor.deleteH(1, "char");
            });
        };
        commands.delWordBefore = function (editor) {
            return runNativeCommand(editor, CM6.deleteGroupBackward, function () {
                return editor.deleteH(-1, "word");
            });
        };
        commands.delWordAfter = function (editor) {
            return runNativeCommand(editor, CM6.deleteGroupForward, function () {
                return editor.deleteH(1, "word");
            });
        };
        commands.delGroupBefore = commands.delWordBefore;
        commands.delGroupAfter = commands.delWordAfter;
        commands.indentAuto = function (editor) {
            return editor.indentSelection("smart");
        };
        commands.indentMore = function (editor) {
            return editor.indentSelection("add");
        };
        commands.indentLess = function (editor) {
            return editor.indentSelection("subtract");
        };
        commands.insertTab = function (editor) {
            return runNativeCommand(editor, CM6.insertTab, function () {
                return editor.replaceSelection("\t");
            });
        };
        commands.insertSoftTab = function (editor) {
            const tabSize = editor.getOption("tabSize");
            const spaces = editor.listSelections().map(function (range) {
                const position = range.from();
                const column = countColumn(editor.getLine(position.line), position.ch, tabSize);
                return " ".repeat(tabSize - column % tabSize);
            });
            return editor.replaceSelections(spaces);
        };
        commands.defaultTab = function (editor) {
            if (editor.somethingSelected()) {
                return editor.indentSelection("add");
            }
            return commands.insertTab(editor);
        };
        commands.newlineAndIndent = function (editor) {
            return runNativeCommand(editor, CM6.insertNewlineAndIndent, function () {
                return runOperation(editor, function () {
                    const selections = editor.listSelections();
                    editor.replaceSelections(
                        selections.map(function () {
                            return "\n";
                        }),
                        "end",
                        "+input"
                    );
                    editor.listSelections().forEach(function (selection) {
                        editor.indentLine(rangeStart(selection).line, null, true);
                    });
                });
            });
        };
        commands.openLine = function (editor) {
            return editor.replaceSelection("\n", "start");
        };
        commands.transposeChars = function (editor) {
            if (editor._view && typeof CM6.transposeChars === "function") {
                return CM6.transposeChars(editor._view);
            }
            const cursor = editor.getCursor();
            const line = cursor.line;
            let character = cursor.ch;
            const text = editor.getLine(line) || "";

            if (!text || editor.somethingSelected()) {
                return;
            }
            if (character === text.length) {
                character--;
            }
            if (character > 0) {
                editor.replaceRange(
                    text.charAt(character) + text.charAt(character - 1),
                    Pos(line, character - 1),
                    Pos(line, character + 1),
                    "+transpose"
                );
                editor.setCursor(Pos(line, character + 1));
                return;
            }
            if (line > editor.firstLine()) {
                const previous = editor.getLine(line - 1) || "";
                if (previous) {
                    editor.replaceRange(
                        text.charAt(0) + "\n" + previous.charAt(previous.length - 1),
                        Pos(line - 1, previous.length - 1),
                        Pos(line, 1),
                        "+transpose"
                    );
                    editor.setCursor(Pos(line, 1));
                }
            }
        };
        commands.toggleOverwrite = function (editor) {
            return editor.toggleOverwrite();
        };
    }

    function defineCoreKeyMaps() {
        keyMap.basic = {
            Left: "goCharLeft",
            Right: "goCharRight",
            Up: "goLineUp",
            Down: "goLineDown",
            End: "goLineEnd",
            Home: "goLineStartSmart",
            PageUp: "goPageUp",
            PageDown: "goPageDown",
            Delete: "delCharAfter",
            Backspace: "delCharBefore",
            "Shift-Backspace": "delCharBefore",
            Tab: "defaultTab",
            "Shift-Tab": "indentAuto",
            Enter: "newlineAndIndent",
            Insert: "toggleOverwrite",
            Esc: "singleSelection"
        };
        keyMap.pcDefault = {
            "Ctrl-A": "selectAll",
            "Ctrl-D": "deleteLine",
            "Ctrl-Z": "undo",
            "Shift-Ctrl-Z": "redo",
            "Ctrl-Y": "redo",
            "Ctrl-Home": "goDocStart",
            "Ctrl-End": "goDocEnd",
            "Ctrl-Up": "goLineUp",
            "Ctrl-Down": "goLineDown",
            "Ctrl-Left": "goGroupLeft",
            "Ctrl-Right": "goGroupRight",
            "Alt-Left": "goLineStart",
            "Alt-Right": "goLineEnd",
            "Ctrl-Backspace": "delGroupBefore",
            "Ctrl-Delete": "delGroupAfter",
            "Ctrl-S": "save",
            "Ctrl-F": "find",
            "Ctrl-G": "findNext",
            "Shift-Ctrl-G": "findPrev",
            "Shift-Ctrl-F": "replace",
            "Shift-Ctrl-R": "replaceAll",
            "Ctrl-[": "indentLess",
            "Ctrl-]": "indentMore",
            "Ctrl-U": "undoSelection",
            "Shift-Ctrl-U": "redoSelection",
            "Alt-U": "redoSelection",
            fallthrough: "basic"
        };
        keyMap.emacsy = {
            "Ctrl-F": "goCharRight",
            "Ctrl-B": "goCharLeft",
            "Ctrl-P": "goLineUp",
            "Ctrl-N": "goLineDown",
            "Ctrl-A": "goLineStart",
            "Ctrl-E": "goLineEnd",
            "Ctrl-V": "goPageDown",
            "Shift-Ctrl-V": "goPageUp",
            "Ctrl-D": "delCharAfter",
            "Ctrl-H": "delCharBefore",
            "Alt-Backspace": "delWordBefore",
            "Ctrl-K": "killLine",
            "Ctrl-T": "transposeChars",
            "Ctrl-O": "openLine"
        };
        keyMap.macDefault = {
            "Cmd-A": "selectAll",
            "Cmd-D": "deleteLine",
            "Cmd-Z": "undo",
            "Shift-Cmd-Z": "redo",
            "Cmd-Y": "redo",
            "Cmd-Home": "goDocStart",
            "Cmd-Up": "goDocStart",
            "Cmd-End": "goDocEnd",
            "Cmd-Down": "goDocEnd",
            "Alt-Left": "goGroupLeft",
            "Alt-Right": "goGroupRight",
            "Cmd-Left": "goLineLeft",
            "Cmd-Right": "goLineRight",
            "Alt-Backspace": "delGroupBefore",
            "Ctrl-Alt-Backspace": "delGroupAfter",
            "Alt-Delete": "delGroupAfter",
            "Cmd-S": "save",
            "Cmd-F": "find",
            "Cmd-G": "findNext",
            "Shift-Cmd-G": "findPrev",
            "Cmd-Alt-F": "replace",
            "Shift-Cmd-Alt-F": "replaceAll",
            "Cmd-[": "indentLess",
            "Cmd-]": "indentMore",
            "Cmd-Backspace": "delWrappedLineLeft",
            "Cmd-Delete": "delWrappedLineRight",
            "Cmd-U": "undoSelection",
            "Shift-Cmd-U": "redoSelection",
            "Ctrl-Up": "goDocStart",
            "Ctrl-Down": "goDocEnd",
            fallthrough: ["basic", "emacsy"]
        };

        const isMac = typeof navigator !== "undefined" && /Mac/.test(navigator.platform);
        keyMap.default = isMac ? keyMap.macDefault : keyMap.pcDefault;
    }

    function defineBuiltInModes() {
        defineMode("null", createNullMode);
        defineMIME("text/plain", "null");

        defineMode("javascript", function (config, parserConfig) {
            let parser;
            if (parserConfig.jsonld) {
                parser = CM6.legacyJSONLD;
            } else if (parserConfig.json) {
                parser = CM6.legacyJSON;
            } else if (parserConfig.typescript) {
                parser = CM6.legacyTypeScript;
            } else {
                parser = CM6.legacyJavaScript;
            }
            const mode = cloneParser(parser, config);
            mode.fold = "brace";
            mode.helperType = parserConfig.json || parserConfig.jsonld ?
                "json" :
                "javascript";
            mode.jsonldMode = Boolean(parserConfig.jsonld);
            mode.jsonMode = Boolean(parserConfig.json || parserConfig.jsonld);
            return mode;
        });
        defineMode("jsx", createJSXMode, "xml", "javascript");
        defineMIME("text/javascript", "javascript");
        defineMIME("application/javascript", "javascript");
        defineMIME("application/json", {name: "javascript", json: true});
        defineMIME("application/ld+json", {name: "javascript", jsonld: true});
        defineMIME("application/typescript", {name: "javascript", typescript: true});
        defineMIME("text/typescript", {name: "javascript", typescript: true});
        defineMIME("text/jsx", "jsx");
        defineMIME("text/typescript-jsx", {
            name: "jsx",
            base: {
                name: "javascript",
                typescript: true
            }
        });

        defineMode("css", function (config, parserConfig) {
            let parser;
            if (parserConfig.variant === "scss") {
                parser = CM6.legacySCSS;
            } else if (parserConfig.variant === "less") {
                parser = CM6.legacyLess;
            } else {
                parser = CM6.legacyCSS;
            }
            const mode = cloneParser(parser, config, {
                variableName: "variable-2"
            });
            const token = mode.token;
            mode.token = function (stream, state) {
                const style = token(stream, state);
                if (style === "error" && state.state === "maybeprop" &&
                        state.context && state.context.type === "block") {
                    return "property error";
                }
                return style;
            };
            mode.electricChars = "}";
            mode.fold = "brace";
            return mode;
        });
        defineMIME("text/css", "css");
        defineMIME("text/x-scss", {name: "css", variant: "scss", helperType: "scss"});
        defineMIME("text/x-less", {name: "css", variant: "less", helperType: "less"});

        defineMode("xml", function (config, parserConfig) {
            const mode = cloneParser(
                parserConfig.htmlMode ? CM6.legacyHTML : CM6.legacyXML,
                config,
                {
                    angleBracket: "tag bracket",
                    invalid: "tag error"
                }
            );
            const token = mode.token;
            mode.token = function (stream, state) {
                const wasInClosingTag = state._legacyClosingTag;
                const style = token(stream, state);
                const current = stream.current();

                if (current === "</") {
                    state._legacyClosingTag = true;
                } else if (wasInClosingTag && /\/?>$/.test(current)) {
                    state._legacyClosingTag = false;
                }

                if (wasInClosingTag && style === "error") {
                    return /\/?>$/.test(current) ?
                        "tag bracket error" :
                        "tag error";
                }
                return style;
            };
            mode.helperType = parserConfig.htmlMode ? "html" : "xml";
            mode.configuration = parserConfig.htmlMode ? "html" : "xml";
            return mode;
        });
        defineMIME("application/xml", "xml");
        defineMIME("text/xml", "xml");

        defineMode("htmlmixed", createHTMLMixedMode, "xml", "javascript", "css");
        defineMode("vue-template", createVueTemplateMode, "htmlmixed");
        defineMode("vue", function (config) {
            return getMode(config, {
                name: "htmlmixed",
                tags: VUE_HTML_MIXED_TAGS
            });
        }, "htmlmixed", "xml", "javascript", "coffeescript", "css",
        "sass", "stylus", "pug", "handlebars");
        defineMode("htmlembedded", createHTMLEmbeddedMode, "htmlmixed");
        defineMode("php", createPHPMode, "htmlmixed", "clike");
        defineMIME("text/html", "htmlmixed");
        defineMIME("script/x-vue", "vue");
        defineMIME("text/x-vue", "vue");
        defineMIME("application/x-ejs", {
            name: "htmlembedded",
            scriptingModeSpec: "javascript"
        });
        defineMIME("application/x-erb", {
            name: "htmlembedded",
            scriptingModeSpec: "ruby"
        });
        defineMIME("application/x-httpd-php", "php");
        defineMIME("application/x-httpd-php-open", {
            name: "php",
            startOpen: true
        });
        defineMIME("text/x-php", {
            name: "clike",
            helperType: "php",
            variant: "php"
        });

        const parsers = {
            clojure: CM6.clojure,
            coffeescript: CM6.coffeeScript,
            dart: CM6.dart,
            diff: CM6.diff,
            go: CM6.go,
            groovy: CM6.groovy,
            haskell: CM6.haskell,
            haxe: CM6.haxe,
            lua: CM6.lua,
            perl: CM6.perl,
            properties: CM6.properties,
            pug: CM6.pug,
            python: CM6.python,
            ruby: CM6.ruby,
            rust: CM6.rust,
            sass: CM6.sass,
            shell: CM6.shell,
            stex: CM6.stex,
            stylus: CM6.stylus,
            swift: CM6.swift,
            toml: CM6.toml,
            turtle: CM6.turtle,
            vb: CM6.vb,
            vbscript: CM6.vbScript,
            yaml: CM6.yaml
        };
        Object.keys(parsers).forEach(function (name) {
            defineMode(name, parserFactory(parsers[name]));
        });

        defineMode("clike", function (config, parserConfig) {
            if (parserConfig.variant === "php") {
                return cloneParser(createPHPStreamParser(), config);
            }
            const parser = {
                c: CM6.c,
                cpp: CM6.cpp,
                csharp: CM6.csharp,
                dart: CM6.dart,
                java: CM6.java,
                kotlin: CM6.kotlin,
                objectiveC: CM6.objectiveC,
                scala: CM6.scala
            }[parserConfig.variant] || CM6.c;
            return cloneParser(parser, config);
        });

        const sqlParsers = {
            cassandra: bundledModes.cassandra,
            esper: bundledModes.esper,
            gql: bundledModes.gql,
            gpsql: bundledModes.gpsql,
            hive: bundledModes.hive,
            mariadb: bundledModes.mariadb,
            mssql: bundledModes.mssql,
            mysql: bundledModes.mysql,
            pgsql: bundledModes.pgsql,
            plsql: bundledModes.plsql,
            sparksql: bundledModes.sparksql,
            sql: bundledModes.sql,
            sqlite: bundledModes.sqlite
        };
        defineMode("sql", function (config, parserConfig) {
            const parser = sqlParsers[parserConfig.variant] || sqlParsers.sql;
            const mode = cloneParser(parser, config);
            mode.config = parserConfig;
            return mode;
        });

        [
            ["text/x-csrc", {name: "clike", variant: "c"}],
            ["text/x-c++src", {name: "clike", variant: "cpp"}],
            ["text/x-csharp", {name: "clike", variant: "csharp"}],
            ["text/x-java", {name: "clike", variant: "java"}],
            ["text/x-kotlin", {name: "clike", variant: "kotlin"}],
            ["text/x-objectivec", {name: "clike", variant: "objectiveC"}],
            ["text/x-scala", {name: "clike", variant: "scala"}],
            ["application/dart", "dart"],
            ["text/x-properties", "properties"],
            ["text/x-rustsrc", "rust"],
            ["text/x-sh", "shell"],
            ["text/x-sql", {
                keywords: wordSet(SQL_DIALECT_KEYWORD_STRINGS.sql),
                name: "sql",
                variant: "sql"
            }],
            ["text/x-mssql", {
                keywords: wordSet(SQL_DIALECT_KEYWORD_STRINGS.mssql),
                name: "sql",
                variant: "mssql"
            }],
            ["text/x-mysql", {
                keywords: wordSet(SQL_DIALECT_KEYWORD_STRINGS.mysql),
                name: "sql",
                variant: "mysql"
            }],
            ["text/x-mariadb", {
                keywords: wordSet(SQL_DIALECT_KEYWORD_STRINGS.mariadb),
                name: "sql",
                variant: "mariadb"
            }],
            ["text/x-sqlite", {
                identifierQuote: "\"",
                keywords: wordSet(SQL_DIALECT_KEYWORD_STRINGS.sqlite),
                name: "sql",
                variant: "sqlite"
            }],
            ["text/x-cassandra", {
                keywords: wordSet(SQL_DIALECT_KEYWORD_STRINGS.cassandra),
                name: "sql",
                variant: "cassandra"
            }],
            ["text/x-plsql", {
                keywords: wordSet(SQL_DIALECT_KEYWORD_STRINGS.plsql),
                name: "sql",
                variant: "plsql"
            }],
            ["text/x-hive", {
                keywords: wordSet(SQL_DIALECT_KEYWORD_STRINGS.hive),
                name: "sql",
                variant: "hive"
            }],
            ["text/x-pgsql", {
                keywords: wordSet(SQL_DIALECT_KEYWORD_STRINGS.pgsql),
                name: "sql",
                variant: "pgsql"
            }],
            ["text/x-gql", {
                keywords: wordSet(SQL_DIALECT_KEYWORD_STRINGS.gql),
                name: "sql",
                variant: "gql"
            }],
            ["text/x-gpsql", {
                keywords: wordSet(SQL_DIALECT_KEYWORD_STRINGS.gpsql),
                name: "sql",
                variant: "gpsql"
            }],
            ["text/x-sparksql", {
                keywords: wordSet(SQL_DIALECT_KEYWORD_STRINGS.sparksql),
                name: "sql",
                variant: "sparksql"
            }],
            ["text/x-esper", {
                keywords: wordSet(SQL_DIALECT_KEYWORD_STRINGS.esper),
                name: "sql",
                variant: "esper"
            }],
            ["text/x-stex", "stex"],
            ["text/x-styl", "stylus"],
            ["text/x-toml", "toml"],
            ["text/x-vb", "vb"],
            ["text/x-yaml", "yaml"]
        ].forEach(function (entry) {
            defineMIME(entry[0], entry[1]);
        });

        defineMode("markdown", createMarkdownMode);
        defineMode("gfm", function (config, parserConfig) {
            return createMarkdownMode(
                config,
                Object.assign({}, parserConfig, {githubFlavored: true})
            );
        });
        defineMIME("text/markdown", "markdown");
        defineMIME("text/x-markdown", "markdown");
        defineMIME("text/x-gfm", "gfm");

        defineSimpleMode("handlebars", {
            start: [
                {regex: /\{\{\{/, push: "raw", token: "tag"},
                {regex: /\{\{!--/, push: "dashComment", token: "comment"},
                {regex: /\{\{!/, push: "comment", token: "comment"},
                {regex: /\{\{/, push: "expression", token: "tag"}
            ],
            raw: [
                {regex: /\}\}\}/, pop: true, token: "tag"}
            ],
            expression: [
                {regex: /\}\}/, pop: true, token: "tag"},
                {regex: /"(?:[^\\"]|\\.)*"?/, token: "string"},
                {regex: /'(?:[^\\']|\\.)*'?/, token: "string"},
                {regex: />|[#/]([A-Za-z_]\w*)/, token: "keyword"},
                {regex: /(?:else|this)\b/, token: "keyword"},
                {regex: /\d+/i, token: "number"},
                {regex: /=|~|@|true|false/, token: "atom"},
                {regex: /(?:\.\.\/)*(?:[A-Za-z_][\w.]*)+/, token: "variable-2"}
            ],
            dashComment: [
                {regex: /--\}\}/, pop: true, token: "comment"},
                {regex: /./, token: "comment"}
            ],
            comment: [
                {regex: /\}\}/, pop: true, token: "comment"},
                {regex: /./, token: "comment"}
            ],
            meta: {
                blockCommentStart: "{{--",
                blockCommentEnd: "--}}"
            }
        });
        defineMode("htmlhandlebars", function (config) {
            return multiplexingMode(
                getMode(config, "text/html"),
                {
                    open: "{{",
                    close: /\}\}\}?/,
                    mode: getMode(config, "handlebars"),
                    parseDelimiters: true
                }
            );
        });
        defineMIME("text/x-handlebars-template", "htmlhandlebars");

        Object.keys(bundledModeMIMEs).forEach(function (mime) {
            if (!Object.prototype.hasOwnProperty.call(mimeModes, mime)) {
                defineMIME(mime, bundledModeMIMEs[mime]);
            }
        });
    }

    defineCoreOptions();
    defineCoreCommands();
    defineCoreKeyMaps();

    Object.assign(CodeMirrorCompat, {
        Doc: CompatDoc,
        Init: Init,
        Line: Line,
        LineWidget: LineWidget,
        Pass: Pass,
        SharedTextMarker: SharedTextMarker,
        StringStream: StringStream,
        TextMarker: TextMarker,
        addClass: addClass,
        changeEnd: changeEnd,
        cmpPos: cmpPos,
        commands: commands,
        contains: contains,
        copyState: copyState,
        countColumn: countColumn,
        createDocumentForAdapter: createDocumentForAdapter,
        defaults: defaults,
        defineDocExtension: defineDocExtension,
        defineExtension: defineExtension,
        defineInitHook: defineInitHook,
        defineMIME: defineMIME,
        defineMode: defineMode,
        defineOption: defineOption,
        defineSimpleMode: defineSimpleMode,
        docExtensions: docExtensions,
        e_preventDefault: ePreventDefault,
        e_stop: eStop,
        e_stopPropagation: eStopPropagation,
        extendMode: extendMode,
        extensions: extensions,
        findColumn: findColumn,
        findMatchingBracket: findMatchingBracket,
        findMatchingTag: findMatchingTag,
        fromTextArea: fromTextArea,
        getHelpers: getHelpers,
        getKeyMap: getKeyMap,
        getMode: getMode,
        hasMode: hasMode,
        helpers: helpers,
        initOptions: initOptions,
        inputStyles: inputStyles,
        installExtensions: installExtensions,
        installLegacyCompatibility: installLegacyCompatibility,
        innerMode: innerMode,
        isMac: typeof navigator !== "undefined" && /Mac/.test(navigator.platform),
        isModeOverridden: isModeOverridden,
        isModifierKey: isModifierKey,
        isWordChar: isWordChar,
        keyMap: keyMap,
        keyNames: KEY_NAMES,
        keyName: keyName,
        loadMode: loadMode,
        lookupKey: lookupKey,
        mimeModes: mimeModes,
        modeExtensions: modeExtensions,
        modes: modes,
        multiplexingMode: multiplexingMode,
        overlayMode: overlayMode,
        normalizeKeyMap: normalizeKeyMap,
        off: off,
        on: on,
        optionHandlers: optionHandlers,
        Pos: Pos,
        prototype: extensions,
        registerGlobalHelper: registerGlobalHelper,
        registerHelper: registerHelper,
        registerEditorConstructor: registerEditorConstructor,
        registerInstance: registerInstance,
        resolveMode: resolveMode,
        rmClass: rmClass,
        runOptionHandler: runOptionHandler,
        scanForBracket: scanForBracket,
        scrollbarModel: scrollbarModel,
        signal: signal,
        simpleMode: simpleMode,
        splitLines: splitLines,
        startState: startState,
        matchBrackets: matchBrackets,
        unregisterInstance: unregisterInstance,
        backend: "codemirror6",
        isCodeMirror6: true,
        version: "5.65.16",
        wheelEventPixels: wheelEventPixels
    });

    LegacyModeMeta.install(CodeMirrorCompat);

    defineExtension("matchBrackets", function () {
        return matchBrackets(this, true);
    });
    defineExtension("findMatchingBracket", function (position, config, oldConfig) {
        let bracketConfig = config;
        if (oldConfig || typeof bracketConfig === "boolean") {
            if (!oldConfig) {
                bracketConfig = bracketConfig ? {strict: true} : null;
            } else {
                oldConfig.strict = bracketConfig;
                bracketConfig = oldConfig;
            }
        }
        return findMatchingBracket(this, position, bracketConfig);
    });
    defineExtension("scanForBracket", function (position, direction, style, config) {
        return scanForBracket(this, position, direction, style, config);
    });
    defineExtension("linkedDoc", function (options) {
        return this.getDoc().linkedDoc(options);
    });
    defineExtension("unlinkDoc", function (other) {
        return this.getDoc().unlinkDoc(other);
    });
    defineExtension("iterLinkedDocs", function (callback) {
        return this.getDoc().iterLinkedDocs(callback);
    });

    defineLegacyInstanceCheck(CodeMirrorCompat, function (value) {
        return Boolean(value && value.isCodeMirror6 && !value._detachedDoc);
    });

    defineBuiltInModes();
    LegacyModesCompat.install(CodeMirrorCompat);
    Object.keys(modes).forEach(function (modeName) {
        builtInModeFactories[modeName] = modes[modeName];
    });

    module.exports = CodeMirrorCompat;
});
