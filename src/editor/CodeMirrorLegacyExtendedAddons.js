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

/*! DONT_STRIP_MINIFY: CodeMirror 5-derived compatibility implementation. See thirdparty/licences/codemirror5-derived.markdown. */

/*eslint no-invalid-this: 0*/

/**
 * CM6-backed compatibility for the remaining CodeMirror 5 addon surface.
 *
 * These installers intentionally receive the CodeMirror compatibility facade
 * instead of importing it. That keeps historical module resolution
 * idempotent and avoids a dependency cycle with CodeMirrorCompat.
 */
define(function (require, exports, module) {

    const LegacyAddons = require("editor/CodeMirrorLegacyAddons");
    const installedAddons = new WeakMap();
    const LINT_GUTTER_ID = "CodeMirror-lint-markers";
    const ADDON_PATHS = Object.freeze({
        "addon/dialog/dialog": "dialog",
        "addon/display/autorefresh": "autoRefresh",
        "addon/display/fullscreen": "fullScreen",
        "addon/display/panel": "panel",
        "addon/edit/continuelist": "continueList",
        "addon/fold/foldcode": "foldCode",
        "addon/fold/foldgutter": "foldGutter",
        "addon/fold/indent-fold": "indentFold",
        "addon/hint/css-hint": "cssHint",
        "addon/hint/html-hint": "htmlHint",
        "addon/hint/javascript-hint": "javascriptHint",
        "addon/hint/sql-hint": "sqlHint",
        "addon/hint/xml-hint": "xmlHint",
        "addon/lint/coffeescript-lint": "coffeeLint",
        "addon/lint/css-lint": "cssLint",
        "addon/lint/html-lint": "htmlLint",
        "addon/lint/javascript-lint": "javascriptLint",
        "addon/lint/json-lint": "jsonLint",
        "addon/lint/lint": "lint",
        "addon/lint/yaml-lint": "yamlLint",
        "addon/merge/merge": "merge",
        "addon/mode/loadmode": "loadMode",
        "addon/mode/multiplex_test": "multiplexTest",
        "addon/runmode/colorize": "colorize",
        "addon/runmode/runmode-standalone": "runMode",
        "addon/runmode/runmode.node": "runMode",
        "addon/scroll/simplescrollbars": "simpleScrollbars",
        "addon/selection/selection-pointer": "selectionPointer",
        "addon/tern/tern": "tern",
        "addon/tern/worker": "ternWorker",
        "addon/wrap/hardwrap": "hardWrap",
        "keymap/emacs": "emacs"
    });
    const supportedPaths = Object.freeze(Object.keys(ADDON_PATHS).sort());

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

    function _normalizePath(moduleName) {
        const normalized = String(moduleName || "")
            .replace(/[?#].*$/, "")
            .replace(/\.js$/, "")
            .replace(/^\/+/, "");
        const addonIndex = normalized.indexOf("addon/");
        const keymapIndex = normalized.indexOf("keymap/");
        let start = -1;
        if (addonIndex !== -1) {
            start = addonIndex;
        }
        if (keymapIndex !== -1 && (start === -1 || keymapIndex < start)) {
            start = keymapIndex;
        }
        return start === -1 ? normalized : normalized.slice(start);
    }

    function _documentFor(editor) {
        const wrapper = editor && editor.getWrapperElement &&
            editor.getWrapperElement();
        return wrapper && wrapper.ownerDocument || document;
    }

    function _removeNode(node) {
        if (node && node.parentNode) {
            node.parentNode.removeChild(node);
        }
    }

    function _eventKeyCode(event) {
        if (event.keyCode) {
            return event.keyCode;
        }
        if (event.key === "Escape") {
            return 27;
        }
        if (event.key === "Enter") {
            return 13;
        }
        return 0;
    }

    function _dialogNode(editor, template, bottom) {
        const ownerDocument = _documentFor(editor);
        const wrapper = editor.getWrapperElement();
        const dialog = ownerDocument.createElement("div");
        dialog.className = bottom ?
            "CodeMirror-dialog CodeMirror-dialog-bottom" :
            "CodeMirror-dialog CodeMirror-dialog-top";
        if (typeof template === "string") {
            dialog.innerHTML = template;
        } else if (template) {
            dialog.appendChild(template);
        }
        wrapper.appendChild(dialog);
        CodeMirrorSafeAddClass(wrapper, "dialog-opened");
        return dialog;
    }

    function CodeMirrorSafeAddClass(node, className) {
        if (!node) {
            return;
        }
        if (node.classList) {
            node.classList.add(className);
        } else if (!new RegExp(`(^|\\s)${className}(?:$|\\s)`).test(node.className)) {
            node.className += (node.className ? " " : "") + className;
        }
    }

    function CodeMirrorSafeRemoveClass(node, className) {
        if (!node) {
            return;
        }
        if (node.classList) {
            node.classList.remove(className);
        } else {
            node.className = String(node.className || "")
                .split(/\s+/)
                .filter(function (candidate) {
                    return candidate && candidate !== className;
                })
                .join(" ");
        }
    }

    function _closeNotification(editor, close) {
        if (editor.state.currentNotificationClose) {
            editor.state.currentNotificationClose();
        }
        editor.state.currentNotificationClose = close || null;
    }

    function installDialog(CodeMirror) {
        return _installOnce(CodeMirror, "dialog", function () {
            CodeMirror.defineExtension(
                "openDialog",
                function (template, callback, suppliedOptions) {
                    const options = suppliedOptions || {};
                    const editor = this;
                    _closeNotification(editor, null);
                    const dialog = _dialogNode(editor, template, options.bottom);
                    const input = dialog.getElementsByTagName("input")[0];
                    const button = dialog.getElementsByTagName("button")[0];
                    let closed = false;

                    const close = function (newValue) {
                        if (typeof newValue === "string" && input) {
                            input.value = newValue;
                            return;
                        }
                        if (closed) {
                            return;
                        }
                        closed = true;
                        CodeMirrorSafeRemoveClass(
                            editor.getWrapperElement(),
                            "dialog-opened"
                        );
                        _removeNode(dialog);
                        editor.focus();
                        if (typeof options.onClose === "function") {
                            options.onClose(dialog);
                        }
                    };

                    if (input) {
                        if (options.value !== undefined) {
                            input.value = options.value;
                            if (options.selectValueOnOpen !== false &&
                                    typeof input.select === "function") {
                                input.select();
                            }
                        }
                        if (typeof options.onInput === "function") {
                            CodeMirror.on(input, "input", function (event) {
                                options.onInput(event, input.value, close);
                            });
                        }
                        if (typeof options.onKeyUp === "function") {
                            CodeMirror.on(input, "keyup", function (event) {
                                options.onKeyUp(event, input.value, close);
                            });
                        }
                        CodeMirror.on(input, "keydown", function (event) {
                            if (typeof options.onKeyDown === "function" &&
                                    options.onKeyDown(
                                        event,
                                        input.value,
                                        close
                                    )) {
                                return;
                            }
                            const keyCode = _eventKeyCode(event);
                            if (keyCode === 27 ||
                                    options.closeOnEnter !== false &&
                                    keyCode === 13) {
                                input.blur();
                                CodeMirror.e_stop(event);
                                close();
                            }
                            if (keyCode === 13 &&
                                    typeof callback === "function") {
                                callback(input.value, event);
                            }
                        });
                        if (options.closeOnBlur !== false) {
                            CodeMirror.on(dialog, "focusout", function (event) {
                                if (event.relatedTarget !== null) {
                                    close();
                                }
                            });
                        }
                        input.focus();
                    } else if (button) {
                        CodeMirror.on(button, "click", function () {
                            close();
                            editor.focus();
                        });
                        if (options.closeOnBlur !== false) {
                            CodeMirror.on(button, "blur", close);
                        }
                        button.focus();
                    }
                    return close;
                }
            );

            CodeMirror.defineExtension(
                "openConfirm",
                function (template, callbacks, options) {
                    const editor = this;
                    _closeNotification(editor, null);
                    const dialog = _dialogNode(
                        editor,
                        template,
                        options && options.bottom
                    );
                    const buttons = dialog.getElementsByTagName("button");
                    let closed = false;
                    let blurring = 1;
                    const close = function () {
                        if (closed) {
                            return;
                        }
                        closed = true;
                        CodeMirrorSafeRemoveClass(
                            editor.getWrapperElement(),
                            "dialog-opened"
                        );
                        _removeNode(dialog);
                        editor.focus();
                    };

                    Array.prototype.forEach.call(buttons, function (button, index) {
                        CodeMirror.on(button, "click", function (event) {
                            CodeMirror.e_preventDefault(event);
                            close();
                            if (callbacks && callbacks[index]) {
                                callbacks[index](editor);
                            }
                        });
                        CodeMirror.on(button, "blur", function () {
                            blurring--;
                            window.setTimeout(function () {
                                if (blurring <= 0) {
                                    close();
                                }
                            }, 200);
                        });
                        CodeMirror.on(button, "focus", function () {
                            blurring++;
                        });
                    });
                    if (buttons[0]) {
                        buttons[0].focus();
                    }
                    return close;
                }
            );

            CodeMirror.defineExtension(
                "openNotification",
                function (template, options) {
                    const editor = this;
                    let closed = false;
                    let timer = null;
                    _closeNotification(editor, null);
                    const dialog = _dialogNode(
                        editor,
                        template,
                        options && options.bottom
                    );
                    const close = function () {
                        if (closed) {
                            return;
                        }
                        closed = true;
                        window.clearTimeout(timer);
                        CodeMirrorSafeRemoveClass(
                            editor.getWrapperElement(),
                            "dialog-opened"
                        );
                        _removeNode(dialog);
                        if (editor.state.currentNotificationClose === close) {
                            editor.state.currentNotificationClose = null;
                        }
                    };
                    editor.state.currentNotificationClose = close;
                    CodeMirror.on(dialog, "click", function (event) {
                        CodeMirror.e_preventDefault(event);
                        close();
                    });
                    const duration = options &&
                        options.duration !== undefined ?
                        options.duration :
                        5000;
                    if (duration) {
                        timer = window.setTimeout(close, duration);
                    }
                    return close;
                }
            );
        });
    }

    function _stopAutoRefresh(CodeMirror, state) {
        if (!state) {
            return;
        }
        window.clearTimeout(state.timeout);
        CodeMirror.off(window, "mouseup", state.hurry);
        CodeMirror.off(window, "keyup", state.hurry);
    }

    function _startAutoRefresh(CodeMirror, editor, state) {
        const check = function () {
            const wrapper = editor.getWrapperElement();
            if (!editor.state.autoRefresh || editor.state.autoRefresh !== state) {
                return;
            }
            if (wrapper.offsetHeight) {
                _stopAutoRefresh(CodeMirror, state);
                editor.state.autoRefresh = null;
                if (state.height !== wrapper.clientHeight) {
                    editor.refresh();
                }
            } else {
                state.timeout = window.setTimeout(check, state.delay);
            }
        };
        state.hurry = function () {
            window.clearTimeout(state.timeout);
            state.timeout = window.setTimeout(check, 50);
        };
        state.timeout = window.setTimeout(check, state.delay);
        CodeMirror.on(window, "mouseup", state.hurry);
        CodeMirror.on(window, "keyup", state.hurry);
    }

    function installAutoRefresh(CodeMirror) {
        return _installOnce(CodeMirror, "autoRefresh", function () {
            CodeMirror.defineOption("autoRefresh", false, function (editor, value) {
                if (editor.state.autoRefresh) {
                    _stopAutoRefresh(CodeMirror, editor.state.autoRefresh);
                }
                editor.state.autoRefresh = null;
                const wrapper = editor.getWrapperElement();
                if (value && wrapper && wrapper.offsetHeight === 0) {
                    const state = {
                        delay: typeof value === "object" && value.delay || 250,
                        height: wrapper.clientHeight,
                        hurry: null,
                        timeout: null
                    };
                    editor.state.autoRefresh = state;
                    _startAutoRefresh(CodeMirror, editor, state);
                }
            });
        });
    }

    function installFullScreen(CodeMirror) {
        return _installOnce(CodeMirror, "fullScreen", function () {
            CodeMirror.defineOption(
                "fullScreen",
                false,
                function (editor, value, oldValue) {
                    const wasEnabled = oldValue !== CodeMirror.Init &&
                        Boolean(oldValue);
                    if (wasEnabled === Boolean(value)) {
                        return;
                    }
                    const wrapper = editor.getWrapperElement();
                    const ownerDocument = _documentFor(editor);
                    if (value) {
                        editor.state.fullScreenRestore = {
                            documentOverflow:
                                ownerDocument.documentElement.style.overflow,
                            height: wrapper.style.height,
                            scrollLeft: window.pageXOffset,
                            scrollTop: window.pageYOffset,
                            width: wrapper.style.width
                        };
                        wrapper.style.width = "";
                        wrapper.style.height = "auto";
                        CodeMirror.addClass(wrapper, "CodeMirror-fullscreen");
                        ownerDocument.documentElement.style.overflow = "hidden";
                    } else {
                        const restore = editor.state.fullScreenRestore || {};
                        CodeMirror.rmClass(wrapper, "CodeMirror-fullscreen");
                        ownerDocument.documentElement.style.overflow =
                            restore.documentOverflow || "";
                        wrapper.style.width = restore.width || "";
                        wrapper.style.height = restore.height || "";
                        if (typeof window.scrollTo === "function" &&
                                Number.isFinite(restore.scrollLeft) &&
                                Number.isFinite(restore.scrollTop)) {
                            window.scrollTo(
                                restore.scrollLeft,
                                restore.scrollTop
                            );
                        }
                        editor.state.fullScreenRestore = null;
                    }
                    editor.refresh();
                }
            );
        });
    }

    function _panelIsAboveEditor(editor, node) {
        const editorWrapper = editor.getWrapperElement();
        for (let sibling = node.nextSibling; sibling; sibling = sibling.nextSibling) {
            if (sibling === editorWrapper) {
                return true;
            }
        }
        return false;
    }

    function _removePanelWrapper(editor) {
        const info = editor.state.panels;
        if (!info) {
            return;
        }
        const wrapper = editor.getWrapperElement();
        const focused = editor.hasFocus();
        const scroll = editor.getScrollInfo();
        if (info.wrapper.parentNode) {
            info.wrapper.parentNode.replaceChild(wrapper, info.wrapper);
        }
        editor.state.panels = null;
        editor.setSize = info.originalSetSize;
        wrapper.style.height = info.originalHeight;
        editor.scrollTo(scroll.left, scroll.top);
        editor.setSize();
        if (focused) {
            editor.focus();
        }
    }

    function _initializePanels(editor) {
        const wrapper = editor.getWrapperElement();
        const ownerDocument = _documentFor(editor);
        const panelWrapper = ownerDocument.createElement("div");
        panelWrapper.className = "CodeMirror-panels";
        const focused = editor.hasFocus();
        const scroll = editor.getScrollInfo();
        const computedStyle = window.getComputedStyle ?
            window.getComputedStyle(wrapper) :
            wrapper.currentStyle;
        const computedHeight = computedStyle &&
            parseFloat(computedStyle.height);
        const info = {
            explicitHeight: Number.isFinite(computedHeight) ?
                computedHeight :
                null,
            originalHeight: wrapper.style.height,
            originalSetSize: editor.setSize,
            panels: [],
            wrapper: panelWrapper
        };
        editor.state.panels = info;
        if (wrapper.parentNode) {
            wrapper.parentNode.insertBefore(panelWrapper, wrapper);
        }
        panelWrapper.appendChild(wrapper);
        editor.setSize = function (width, height) {
            let editorHeight = height;
            if (height !== null && height !== undefined) {
                let numericHeight = height;
                if (typeof height !== "number") {
                    panelWrapper.style.height = height;
                    numericHeight = panelWrapper.offsetHeight;
                }
                if (Number.isFinite(numericHeight)) {
                    const panelHeight = info.panels.reduce(
                        function (total, panel) {
                            return total +
                                panel.node.getBoundingClientRect().height;
                        },
                        0
                    );
                    editorHeight = Math.max(0, numericHeight - panelHeight);
                    info.explicitHeight = numericHeight;
                }
            } else if (info.explicitHeight !== null) {
                const panelHeight = info.panels.reduce(
                    function (total, panel) {
                        return total +
                            panel.node.getBoundingClientRect().height;
                    },
                    0
                );
                editorHeight = Math.max(0, info.explicitHeight - panelHeight);
            }
            return info.originalSetSize.call(editor, width, editorHeight);
        };
        editor.scrollTo(scroll.left, scroll.top);
        if (focused) {
            editor.focus();
        }
        return info;
    }

    function Panel(editor, node, options, height) {
        this.cm = editor;
        this.node = node;
        this.options = options;
        this.height = height;
        this.cleared = false;
    }

    Panel.prototype.clear = function (skipRemove) {
        if (this.cleared) {
            return;
        }
        this.cleared = true;
        const info = this.cm.state.panels;
        if (!info) {
            _removeNode(this.node);
            return;
        }
        const index = info.panels.indexOf(this);
        if (index !== -1) {
            info.panels.splice(index, 1);
        }
        if (this.options.stable && _panelIsAboveEditor(this.cm, this.node)) {
            this.cm.scrollTo(
                null,
                this.cm.getScrollInfo().top - this.height
            );
        }
        _removeNode(this.node);
        if (!info.panels.length && !skipRemove) {
            _removePanelWrapper(this.cm);
        } else {
            this.cm.setSize();
        }
    };

    Panel.prototype.changed = function () {
        this.height = this.node.getBoundingClientRect().height;
        this.cm.setSize();
    };

    function installPanel(CodeMirror) {
        return _installOnce(CodeMirror, "panel", function () {
            CodeMirror.defineExtension("addPanel", function (node, suppliedOptions) {
                const options = suppliedOptions || {};
                const info = this.state.panels || _initializePanels(this);
                const wrapper = info.wrapper;
                const editorWrapper = this.getWrapperElement();
                const before = options.before instanceof Panel &&
                    !options.before.cleared ?
                    options.before :
                    null;
                const after = options.after instanceof Panel &&
                    !options.after.cleared ?
                    options.after :
                    null;
                const replace = options.replace instanceof Panel &&
                    !options.replace.cleared ?
                    options.replace :
                    null;

                if (after) {
                    wrapper.insertBefore(node, after.node.nextSibling);
                } else if (before) {
                    wrapper.insertBefore(node, before.node);
                } else if (replace) {
                    wrapper.insertBefore(node, replace.node);
                    replace.clear(true);
                } else if (options.position === "bottom") {
                    wrapper.appendChild(node);
                } else if (options.position === "before-bottom") {
                    wrapper.insertBefore(node, editorWrapper.nextSibling);
                } else if (options.position === "after-top") {
                    wrapper.insertBefore(node, editorWrapper);
                } else {
                    wrapper.insertBefore(node, wrapper.firstChild);
                }

                const height = options.height ||
                    node.getBoundingClientRect().height ||
                    node.offsetHeight ||
                    0;
                const panel = new Panel(this, node, options, height);
                info.panels.push(panel);
                this.setSize();
                if (options.stable && _panelIsAboveEditor(this, node)) {
                    this.scrollTo(null, this.getScrollInfo().top + height);
                }
                return panel;
            });
        });
    }

    const LIST_PATTERN =
        /^(\s*)(>[> ]*|[*+-] \[[x ]\]\s|[*+-]\s|(\d+)([.)]))(\s*)/i;
    const EMPTY_LIST_PATTERN =
        /^(\s*)(>[> ]*|[*+-] \[[x ]\]|[*+-]|(\d+)[.)])(\s*)$/i;
    const UNORDERED_LIST_PATTERN = /[*+-]\s/;

    function _incrementMarkdownListNumbers(editor, position) {
        const startLine = position.line;
        const startItem = LIST_PATTERN.exec(editor.getLine(startLine) || "");
        if (!startItem || !startItem[3]) {
            return;
        }
        const startIndent = startItem[1];
        let lookAhead = 0;
        let skipped = 0;
        while (startLine + lookAhead < editor.lastLine()) {
            lookAhead++;
            const lineNumber = startLine + lookAhead;
            const line = editor.getLine(lineNumber) || "";
            const nextItem = LIST_PATTERN.exec(line);
            if (!nextItem) {
                break;
            }
            const nextIndent = nextItem[1];
            const nextNumber = parseInt(nextItem[3], 10);
            if (startIndent === nextIndent && Number.isFinite(nextNumber)) {
                const expected =
                    parseInt(startItem[3], 10) + lookAhead - skipped;
                let itemNumber = nextNumber;
                if (expected === nextNumber) {
                    itemNumber++;
                } else if (expected > nextNumber) {
                    itemNumber = expected + 1;
                }
                editor.replaceRange(
                    line.replace(
                        LIST_PATTERN,
                        nextIndent + itemNumber + nextItem[4] + nextItem[5]
                    ),
                    CodeMirrorPosition(editor, lineNumber, 0),
                    CodeMirrorPosition(editor, lineNumber, line.length)
                );
            } else {
                if (startIndent.length > nextIndent.length ||
                        startIndent.length < nextIndent.length &&
                        lookAhead === 1) {
                    return;
                }
                skipped++;
            }
        }
    }

    function CodeMirrorPosition(editor, line, ch) {
        const facade = editor && editor.constructor &&
            editor.constructor.Pos;
        if (typeof facade === "function") {
            return facade(line, ch);
        }
        return {line: line, ch: ch === undefined ? null : ch};
    }

    function installContinueList(CodeMirror) {
        return _installOnce(CodeMirror, "continueList", function () {
            CodeMirror.commands.newlineAndIndentContinueMarkdownList =
                function (editor) {
                    if (editor.getOption("disableInput")) {
                        return CodeMirror.Pass;
                    }
                    const ranges = editor.listSelections();
                    const replacements = [];
                    for (let index = 0; index < ranges.length; index++) {
                        const position = ranges[index].head;
                        const endOfLineState = editor.getStateAfter(
                            position.line
                        );
                        const inner = CodeMirror.innerMode(
                            editor.getMode(),
                            endOfLineState
                        );
                        const mode = inner && inner.mode;
                        if (!mode || mode.name !== "markdown" &&
                                mode.name !== "gfm" &&
                                mode.helperType !== "markdown") {
                            editor.execCommand("newlineAndIndent");
                            return;
                        }
                        const modeState = inner.state || {};
                        const inList = modeState.list !== false;
                        const inQuote = modeState.quote !== 0;
                        const line = editor.getLine(position.line) || "";
                        const match = LIST_PATTERN.exec(line);
                        const cursorBeforeBullet =
                            /^\s*$/.test(line.slice(0, position.ch));
                        if (!ranges[index].empty() ||
                                !inList && !inQuote ||
                                !match ||
                                cursorBeforeBullet) {
                            editor.execCommand("newlineAndIndent");
                            return;
                        }
                        if (EMPTY_LIST_PATTERN.test(line)) {
                            const endOfQuote =
                                inQuote && />\s*$/.test(line);
                            const endOfList = !/>\s*$/.test(line);
                            if (endOfQuote || endOfList) {
                                editor.replaceRange(
                                    "",
                                    CodeMirror.Pos(position.line, 0),
                                    CodeMirror.Pos(
                                        position.line,
                                        position.ch + 1
                                    )
                                );
                            }
                            replacements[index] = "\n";
                        } else {
                            const indent = match[1];
                            const after = match[5];
                            const numbered =
                                !UNORDERED_LIST_PATTERN.test(match[2]) &&
                                match[2].indexOf(">") === -1;
                            const bullet = numbered ?
                                `${parseInt(match[3], 10) + 1}${match[4]}` :
                                match[2].replace(/x/i, " ");
                            replacements[index] =
                                `\n${indent}${bullet}${after}`;
                            if (numbered) {
                                _incrementMarkdownListNumbers(
                                    editor,
                                    position
                                );
                            }
                        }
                    }
                    editor.replaceSelections(replacements);
                };
        });
    }

    function _foldOption(editor, options, name, defaults) {
        if (options && options[name] !== undefined) {
            return options[name];
        }
        const editorOptions = editor.getOption("foldOptions");
        if (editorOptions && editorOptions[name] !== undefined) {
            return editorOptions[name];
        }
        return defaults[name];
    }

    function installFoldCode(CodeMirror) {
        return _installOnce(CodeMirror, "foldCode", function () {
            const defaults = {
                rangeFinder: null,
                widget: "\u2194",
                minFoldSize: 0,
                scanUp: false,
                clearOnEnter: true
            };

            if (!CodeMirror.fold ||
                    typeof CodeMirror.fold.combine !== "function") {
                CodeMirror.registerHelper("fold", "combine", function () {
                    const finders = Array.prototype.slice.call(arguments);
                    return function (editor, start) {
                        for (let index = 0; index < finders.length; index++) {
                            const found = finders[index](editor, start);
                            if (found) {
                                return found;
                            }
                        }
                    };
                });
            }

            if (!CodeMirror.fold ||
                    typeof CodeMirror.fold.auto !== "function") {
                CodeMirror.registerHelper("fold", "auto", function (editor, start) {
                    const helpers = editor.getHelpers(start, "fold");
                    for (let index = 0; index < helpers.length; index++) {
                        if (helpers[index] === CodeMirror.fold.auto) {
                            continue;
                        }
                        const found = helpers[index](editor, start);
                        if (found) {
                            return found;
                        }
                    }
                });
            }
            defaults.rangeFinder = CodeMirror.fold.auto;
            if (!CodeMirror.optionHandlers.foldOptions) {
                CodeMirror.defineOption("foldOptions", null);
            }

            const makeWidget = function (editor, options, range) {
                let widget = _foldOption(
                    editor,
                    options,
                    "widget",
                    defaults
                );
                if (typeof widget === "function") {
                    widget = widget(range.from, range.to);
                }
                if (typeof widget === "string") {
                    const ownerDocument = _documentFor(editor);
                    const element = ownerDocument.createElement("span");
                    element.className = "CodeMirror-foldmarker";
                    element.appendChild(
                        ownerDocument.createTextNode(widget)
                    );
                    return element;
                }
                return widget && widget.cloneNode ?
                    widget.cloneNode(true) :
                    widget;
            };

            const doFold = function (editor, suppliedPosition, options, force) {
                let position = typeof suppliedPosition === "number" ?
                    CodeMirror.Pos(suppliedPosition, 0) :
                    suppliedPosition || editor.getCursor();
                const finder = typeof options === "function" ?
                    options :
                    _foldOption(
                        editor,
                        options,
                        "rangeFinder",
                        defaults
                    );
                const minSize = _foldOption(
                    editor,
                    options,
                    "minFoldSize",
                    defaults
                );
                if (typeof finder !== "function") {
                    return;
                }

                const getRange = function (allowFolded) {
                    const range = finder(editor, position);
                    if (!range ||
                            range.to.line - range.from.line < minSize) {
                        return null;
                    }
                    if (force === "fold") {
                        return range;
                    }
                    const marks = editor.findMarksAt(range.from);
                    for (let index = 0; index < marks.length; index++) {
                        if (marks[index].__isFold) {
                            if (!allowFolded) {
                                return null;
                            }
                            range.cleared = true;
                            marks[index].clear();
                        }
                    }
                    return range;
                };

                let range = getRange(true);
                if (_foldOption(editor, options, "scanUp", defaults)) {
                    while (!range && position.line > editor.firstLine()) {
                        position = CodeMirror.Pos(position.line - 1, 0);
                        range = getRange(false);
                    }
                }
                if (!range || range.cleared || force === "unfold") {
                    return;
                }

                const widget = makeWidget(editor, options, range);
                let marker;
                if (widget) {
                    CodeMirror.on(widget, "mousedown", function (event) {
                        marker.clear();
                        CodeMirror.e_preventDefault(event);
                    });
                }
                marker = editor.markText(range.from, range.to, {
                    replacedWith: widget,
                    clearOnEnter: _foldOption(
                        editor,
                        options,
                        "clearOnEnter",
                        defaults
                    ),
                    __isFold: true
                });
                marker.on("clear", function (from, to) {
                    CodeMirror.signal(editor, "unfold", editor, from, to);
                });
                CodeMirror.signal(
                    editor,
                    "fold",
                    editor,
                    range.from,
                    range.to
                );
                return marker;
            };

            if (typeof CodeMirror.newFoldFunction !== "function") {
                CodeMirror.newFoldFunction = function (rangeFinder, widget) {
                    return function (editor, position) {
                        return editor.foldCode(position, {
                            rangeFinder: rangeFinder,
                            widget: widget
                        });
                    };
                };
            }
            if (typeof CodeMirror.prototype.foldCode !== "function") {
                CodeMirror.defineExtension(
                    "foldCode",
                    function (position, options, force) {
                        return doFold(this, position, options, force);
                    }
                );
            }
            if (typeof CodeMirror.prototype.isFolded !== "function") {
                CodeMirror.defineExtension("isFolded", function (position) {
                    return this.findMarksAt(position).some(function (marker) {
                        return Boolean(marker.__isFold);
                    });
                });
            }
            if (typeof CodeMirror.prototype.foldOption !== "function") {
                CodeMirror.defineExtension("foldOption", function (options, name) {
                    return _foldOption(this, options, name, defaults);
                });
            }
            if (typeof CodeMirror.commands.toggleFold !== "function") {
                CodeMirror.commands.toggleFold = function (editor) {
                    return editor.foldCode(editor.getCursor());
                };
            }
            if (typeof CodeMirror.commands.fold !== "function") {
                CodeMirror.commands.fold = function (editor) {
                    return editor.foldCode(
                        editor.getCursor(),
                        null,
                        "fold"
                    );
                };
            }
            if (typeof CodeMirror.commands.unfold !== "function") {
                CodeMirror.commands.unfold = function (editor) {
                    return editor.foldCode(
                        editor.getCursor(),
                        {scanUp: false},
                        "unfold"
                    );
                };
            }
            if (typeof CodeMirror.commands.foldAll !== "function") {
                CodeMirror.commands.foldAll = function (editor) {
                    return editor.operation(function () {
                        for (let line = editor.firstLine();
                            line <= editor.lastLine();
                            line++) {
                            editor.foldCode(
                                CodeMirror.Pos(line, 0),
                                {scanUp: false},
                                "fold"
                            );
                        }
                    });
                };
            }
            if (typeof CodeMirror.commands.unfoldAll !== "function") {
                CodeMirror.commands.unfoldAll = function (editor) {
                    return editor.operation(function () {
                        editor.getAllMarks().forEach(function (marker) {
                            if (marker.__isFold) {
                                marker.clear();
                            }
                        });
                    });
                };
            }
        });
    }

    function _indentationForFold(CodeMirror, editor, lineNumber) {
        const text = editor.getLine(lineNumber);
        if (text === undefined) {
            return -1;
        }
        const firstContent = text.search(/\S/);
        if (firstContent === -1 ||
                /\bcomment\b/.test(
                    editor.getTokenTypeAt(
                        CodeMirror.Pos(lineNumber, firstContent + 1)
                    ) || ""
                )) {
            return -1;
        }
        return CodeMirror.countColumn(
            text,
            null,
            editor.getOption("tabSize")
        );
    }

    function installIndentFold(CodeMirror) {
        return _installOnce(CodeMirror, "indentFold", function () {
            if (CodeMirror.fold &&
                    typeof CodeMirror.fold.indent === "function") {
                return;
            }
            CodeMirror.registerHelper(
                "fold",
                "indent",
                function (editor, start) {
                    const baseIndent = _indentationForFold(
                        CodeMirror,
                        editor,
                        start.line
                    );
                    if (baseIndent < 0) {
                        return;
                    }
                    let lastLineInFold = null;
                    for (let line = start.line + 1;
                        line <= editor.lastLine();
                        line++) {
                        const indentation = _indentationForFold(
                            CodeMirror,
                            editor,
                            line
                        );
                        if (indentation === -1) {
                            continue;
                        }
                        if (indentation > baseIndent) {
                            lastLineInFold = line;
                        } else {
                            break;
                        }
                    }
                    if (lastLineInFold !== null) {
                        return {
                            from: CodeMirror.Pos(
                                start.line,
                                (editor.getLine(start.line) || "").length
                            ),
                            to: CodeMirror.Pos(
                                lastLineInFold,
                                (editor.getLine(lastLineInFold) || "").length
                            )
                        };
                    }
                }
            );
        });
    }

    function _foldGutterMarker(editor, specification) {
        const ownerDocument = _documentFor(editor);
        if (typeof specification === "string") {
            const marker = ownerDocument.createElement("div");
            marker.className =
                `${specification} CodeMirror-guttermarker-subtle`;
            return marker;
        }
        return specification && specification.cloneNode ?
            specification.cloneNode(true) :
            specification;
    }

    function _findFoldOnLine(CodeMirror, editor, line) {
        const from = CodeMirror.Pos(line, 0);
        const nextLine = Math.min(line + 1, editor.lastLine());
        const to = CodeMirror.Pos(
            nextLine,
            nextLine === line ?
                (editor.getLine(line) || "").length :
                0
        );
        const marks = editor.findMarks(from, to);
        for (let index = 0; index < marks.length; index++) {
            if (marks[index].__isFold) {
                const start = marks[index].find(-1);
                if (start && start.line === line) {
                    return marks[index];
                }
            }
        }
    }

    function _refreshFoldGutter(CodeMirror, editor) {
        const state = editor.state.foldGutter;
        if (!state) {
            return;
        }
        const options = state.options;
        const viewport = editor.getViewport();
        const from = Math.max(editor.firstLine(), viewport.from);
        const to = Math.min(editor.lastLine() + 1, viewport.to);
        const finder = editor.foldOption(options, "rangeFinder");
        const minimum = editor.foldOption(options, "minFoldSize");
        editor.operation(function () {
            for (let line = from; line < to; line++) {
                const folded = _findFoldOnLine(CodeMirror, editor, line);
                let marker = null;
                if (folded) {
                    marker = _foldGutterMarker(
                        editor,
                        options.indicatorFolded
                    );
                } else if (typeof finder === "function") {
                    const range = finder(editor, CodeMirror.Pos(line, 0));
                    if (range &&
                            range.to.line - range.from.line >= minimum) {
                        marker = _foldGutterMarker(
                            editor,
                            options.indicatorOpen
                        );
                    }
                }
                editor.setGutterMarker(line, options.gutter, marker);
            }
        });
        state.from = from;
        state.to = to;
    }

    function _clearFoldGutter(editor) {
        const state = editor.state.foldGutter;
        if (!state) {
            return;
        }
        window.clearTimeout(state.timeout);
        editor.clearGutter(state.options.gutter);
        Object.keys(state.listeners).forEach(function (eventName) {
            editor.off(eventName, state.listeners[eventName]);
        });
        editor.state.foldGutter = null;
    }

    function installFoldGutter(CodeMirror) {
        installFoldCode(CodeMirror);
        return _installOnce(CodeMirror, "foldGutter", function () {
            if (CodeMirror.optionHandlers.foldGutter) {
                return;
            }
            CodeMirror.defineOption(
                "foldGutter",
                false,
                function (editor, value, oldValue) {
                    if (oldValue && oldValue !== CodeMirror.Init) {
                        _clearFoldGutter(editor);
                    }
                    if (!value) {
                        return;
                    }
                    const options = Object.assign({
                        gutter: "CodeMirror-foldgutter",
                        indicatorFolded:
                            "CodeMirror-foldgutter-folded",
                        indicatorOpen: "CodeMirror-foldgutter-open"
                    }, value === true ? {} : value);
                    const schedule = function (delay) {
                        const state = editor.state.foldGutter;
                        if (!state) {
                            return;
                        }
                        window.clearTimeout(state.timeout);
                        state.timeout = window.setTimeout(function () {
                            _refreshFoldGutter(CodeMirror, editor);
                        }, delay);
                    };
                    const listeners = {
                        gutterClick: function (_editor, line, gutter) {
                            if (gutter !== options.gutter) {
                                return;
                            }
                            const folded = _findFoldOnLine(
                                CodeMirror,
                                editor,
                                line
                            );
                            if (folded) {
                                folded.clear();
                            } else {
                                editor.foldCode(
                                    CodeMirror.Pos(line, 0),
                                    options
                                );
                            }
                        },
                        changes: function () {
                            schedule(options.foldOnChangeTimeSpan || 600);
                        },
                        viewportChange: function () {
                            schedule(options.updateViewportTimeSpan || 400);
                        },
                        fold: function () {
                            _refreshFoldGutter(CodeMirror, editor);
                        },
                        unfold: function () {
                            _refreshFoldGutter(CodeMirror, editor);
                        },
                        swapDoc: function () {
                            schedule(0);
                        },
                        optionChange: function (_editor, option) {
                            if (option === "mode") {
                                schedule(0);
                            }
                        }
                    };
                    editor.state.foldGutter = {
                        from: 0,
                        listeners: listeners,
                        options: options,
                        timeout: null,
                        to: 0
                    };
                    Object.keys(listeners).forEach(function (eventName) {
                        editor.on(eventName, listeners[eventName]);
                    });
                    _refreshFoldGutter(CodeMirror, editor);
                }
            );
        });
    }

    function _findParagraph(editor, position, options) {
        const startExpression = options.paragraphStart ||
            editor.getHelper(position, "paragraphStart");
        const endExpression = options.paragraphEnd ||
            editor.getHelper(position, "paragraphEnd");
        let start = position.line;
        let end = position.line + 1;
        for (; start > editor.firstLine(); start--) {
            const line = editor.getLine(start) || "";
            if (startExpression && startExpression.test(line)) {
                break;
            }
            if (!/\S/.test(line)) {
                start++;
                break;
            }
        }
        for (; end <= editor.lastLine(); end++) {
            const line = editor.getLine(end) || "";
            if (endExpression && endExpression.test(line)) {
                end++;
                break;
            }
            if (!/\S/.test(line)) {
                break;
            }
        }
        return {from: start, to: end};
    }

    function _findWrapPoint(text, column, wrapOn, trimTrailing, forceBreak) {
        let at = column;
        while (at < text.length && text.charAt(at) === " ") {
            at++;
        }
        for (; at > 0; at--) {
            wrapOn.lastIndex = 0;
            if (wrapOn.test(text.slice(at - 1, at + 1))) {
                break;
            }
        }
        if (!forceBreak && at <= text.match(/^[ \t]*/)[0].length) {
            for (at = column + 1; at < text.length - 1; at++) {
                wrapOn.lastIndex = 0;
                if (wrapOn.test(text.slice(at - 1, at + 1))) {
                    break;
                }
            }
        }
        let first = true;
        while (true) {
            let end = at;
            if (trimTrailing) {
                while (text.charAt(end - 1) === " ") {
                    end--;
                }
            }
            if (end === 0 && first) {
                at = column;
                first = false;
            } else {
                return {from: end, to: at};
            }
        }
    }

    function _wrapRange(CodeMirror, editor, from, to, suppliedOptions) {
        const options = suppliedOptions || {};
        const clippedFrom = editor.clipPos(from);
        const clippedTo = editor.clipPos(to);
        let column = options.column || 80;
        const wrapOn = options.wrapOn || /\s\S|-[^.\d]/;
        const forceBreak = options.forceBreak !== false;
        const trimTrailing = options.killTrailingSpace !== false;
        const lines = editor.getRange(clippedFrom, clippedTo, false);
        if (!lines.length) {
            return null;
        }
        const leadingSpace = lines[0].match(/^[ \t]*/)[0];
        if (leadingSpace.length >= column) {
            column = leadingSpace.length + 1;
        }

        const changes = [];
        let currentLine = "";
        let currentLineNumber = clippedFrom.line;
        lines.forEach(function (originalText, lineIndex) {
            let text = originalText;
            const oldLength = currentLine.length;
            let insertedSpace = 0;
            wrapOn.lastIndex = 0;
            if (currentLine && text &&
                    !wrapOn.test(
                        currentLine.charAt(currentLine.length - 1) +
                        text.charAt(0)
                    )) {
                currentLine += " ";
                insertedSpace = 1;
            }
            let trimmed = "";
            if (lineIndex) {
                trimmed = text.match(/^\s*/)[0];
                text = text.slice(trimmed.length);
            }
            currentLine += text;
            if (lineIndex) {
                const firstBreak = currentLine.length > column &&
                    leadingSpace === trimmed &&
                    _findWrapPoint(
                        currentLine,
                        column,
                        wrapOn,
                        trimTrailing,
                        forceBreak
                    );
                if (!firstBreak ||
                        firstBreak.from !== oldLength ||
                        firstBreak.to !== oldLength + insertedSpace) {
                    changes.push({
                        text: insertedSpace ? " " : "",
                        from: CodeMirror.Pos(currentLineNumber, oldLength),
                        to: CodeMirror.Pos(
                            currentLineNumber + 1,
                            trimmed.length
                        )
                    });
                } else {
                    currentLine = leadingSpace + text;
                    currentLineNumber++;
                }
            }
            while (currentLine.length > column) {
                const breakPoint = _findWrapPoint(
                    currentLine,
                    column,
                    wrapOn,
                    trimTrailing,
                    forceBreak
                );
                if (breakPoint.from !== breakPoint.to ||
                        forceBreak &&
                        leadingSpace !==
                            currentLine.slice(0, breakPoint.to)) {
                    changes.push({
                        text: `\n${leadingSpace}`,
                        from: CodeMirror.Pos(
                            currentLineNumber,
                            breakPoint.from
                        ),
                        to: CodeMirror.Pos(
                            currentLineNumber,
                            breakPoint.to
                        )
                    });
                    currentLine =
                        leadingSpace + currentLine.slice(breakPoint.to);
                    currentLineNumber++;
                } else {
                    break;
                }
            }
        });

        if (!changes.length) {
            return null;
        }
        editor.operation(function () {
            changes.forEach(function (change) {
                if (change.text ||
                        CodeMirror.cmpPos(change.from, change.to)) {
                    editor.replaceRange(
                        change.text,
                        change.from,
                        change.to
                    );
                }
            });
        });
        return {
            from: changes[0].from,
            to: CodeMirror.changeEnd(changes[changes.length - 1])
        };
    }

    function installHardWrap(CodeMirror) {
        return _installOnce(CodeMirror, "hardWrap", function () {
            CodeMirror.defineExtension(
                "wrapRange",
                function (from, to, options) {
                    return _wrapRange(
                        CodeMirror,
                        this,
                        from,
                        to,
                        options
                    );
                }
            );
            CodeMirror.defineExtension(
                "wrapParagraph",
                function (position, suppliedOptions) {
                    const options = suppliedOptions || {};
                    const cursor = position || this.getCursor();
                    const paragraph = _findParagraph(
                        this,
                        cursor,
                        options
                    );
                    return _wrapRange(
                        CodeMirror,
                        this,
                        CodeMirror.Pos(paragraph.from, 0),
                        CodeMirror.Pos(paragraph.to - 1),
                        options
                    );
                }
            );
            CodeMirror.defineExtension(
                "wrapParagraphsInRange",
                function (from, to, suppliedOptions) {
                    const editor = this;
                    const options = suppliedOptions || {};
                    const paragraphs = [];
                    for (let line = from.line; line <= to.line;) {
                        const paragraph = _findParagraph(
                            editor,
                            CodeMirror.Pos(line, 0),
                            options
                        );
                        paragraphs.push(paragraph);
                        line = Math.max(line + 1, paragraph.to);
                    }
                    let changed = null;
                    editor.operation(function () {
                        for (let index = paragraphs.length - 1;
                            index >= 0;
                            index--) {
                            changed = _wrapRange(
                                CodeMirror,
                                editor,
                                CodeMirror.Pos(
                                    paragraphs[index].from,
                                    0
                                ),
                                CodeMirror.Pos(
                                    paragraphs[index].to - 1
                                ),
                                options
                            ) || changed;
                        }
                    });
                    return changed;
                }
            );
            CodeMirror.commands.wrapLines = function (editor) {
                return editor.operation(function () {
                    const ranges = editor.listSelections();
                    let previousLine = editor.lastLine() + 1;
                    for (let index = ranges.length - 1;
                        index >= 0;
                        index--) {
                        const range = ranges[index];
                        let span;
                        if (range.empty()) {
                            const paragraph = _findParagraph(
                                editor,
                                range.head,
                                {}
                            );
                            span = {
                                from: CodeMirror.Pos(paragraph.from, 0),
                                to: CodeMirror.Pos(paragraph.to - 1)
                            };
                        } else {
                            span = {
                                from: range.from(),
                                to: range.to()
                            };
                        }
                        if (span.to.line >= previousLine) {
                            continue;
                        }
                        previousLine = span.from.line;
                        _wrapRange(
                            CodeMirror,
                            editor,
                            span.from,
                            span.to,
                            {}
                        );
                    }
                });
            };
        });
    }

    const CSS_PSEUDO_CLASSES = [
        "active", "after", "before", "checked", "default", "disabled",
        "empty", "enabled", "first-child", "first-letter", "first-line",
        "first-of-type", "focus", "hover", "in-range", "indeterminate",
        "invalid", "lang", "last-child", "last-of-type", "link", "not",
        "nth-child", "nth-last-child", "nth-last-of-type", "nth-of-type",
        "only-of-type", "only-child", "optional", "out-of-range",
        "placeholder", "read-only", "read-write", "required", "root",
        "selection", "target", "valid", "visited"
    ];
    const CSS_PROPERTIES = [
        "align-content", "align-items", "align-self", "animation",
        "appearance", "aspect-ratio", "backdrop-filter", "background",
        "background-color", "background-image", "background-position",
        "background-repeat", "background-size", "border", "border-color",
        "border-radius", "border-style", "border-width", "bottom",
        "box-shadow", "box-sizing", "color", "column-count", "content",
        "cursor", "display", "filter", "flex", "flex-basis",
        "flex-direction", "flex-flow", "flex-grow", "flex-shrink",
        "flex-wrap", "float", "font", "font-family", "font-size",
        "font-style", "font-weight", "gap", "grid", "grid-area",
        "grid-auto-columns", "grid-auto-flow", "grid-auto-rows",
        "grid-column", "grid-row", "grid-template",
        "grid-template-columns", "grid-template-rows", "height",
        "inset", "justify-content", "left", "letter-spacing",
        "line-height", "list-style", "margin", "margin-bottom",
        "margin-left", "margin-right", "margin-top", "max-height",
        "max-width", "min-height", "min-width", "object-fit", "opacity",
        "order", "outline", "overflow", "overflow-x", "overflow-y",
        "padding", "padding-bottom", "padding-left", "padding-right",
        "padding-top", "pointer-events", "position", "right",
        "table-layout", "text-align", "text-decoration", "text-overflow",
        "text-transform", "top", "transform", "transform-origin",
        "transition", "user-select", "vertical-align", "visibility",
        "white-space", "width", "word-break", "word-wrap", "z-index"
    ];
    const CSS_VALUES = [
        "absolute", "auto", "baseline", "block", "bold", "border-box",
        "both", "bottom", "center", "column", "contain", "contents",
        "cover", "currentcolor", "dashed", "default", "ease", "fixed",
        "flex", "grid", "hidden", "inherit", "initial", "inline",
        "inline-block", "inline-flex", "inline-grid", "left", "none",
        "normal", "nowrap", "relative", "repeat", "right", "row",
        "scroll", "solid", "space-around", "space-between",
        "space-evenly", "sticky", "stretch", "top", "transparent",
        "unset", "visible", "wrap"
    ];
    const CSS_COLORS = [
        "aliceblue", "aqua", "black", "blue", "currentcolor", "fuchsia",
        "gray", "green", "lime", "maroon", "navy", "olive", "orange",
        "purple", "red", "silver", "teal", "transparent", "white",
        "yellow"
    ];
    const CSS_MEDIA_TYPES = [
        "all", "aural", "braille", "handheld", "print", "projection",
        "screen", "tty", "tv", "embossed"
    ];
    const CSS_MEDIA_FEATURES = [
        "width", "min-width", "max-width", "height", "min-height",
        "max-height", "device-width", "min-device-width", "max-device-width",
        "device-height", "min-device-height", "max-device-height",
        "aspect-ratio", "min-aspect-ratio", "max-aspect-ratio",
        "device-aspect-ratio", "min-device-aspect-ratio",
        "max-device-aspect-ratio", "color", "min-color", "max-color",
        "color-index", "min-color-index", "max-color-index", "monochrome",
        "min-monochrome", "max-monochrome", "resolution", "min-resolution",
        "max-resolution", "scan", "grid", "orientation",
        "device-pixel-ratio", "min-device-pixel-ratio",
        "max-device-pixel-ratio", "pointer", "any-pointer", "hover",
        "any-hover", "prefers-color-scheme", "dynamic-range",
        "video-dynamic-range"
    ];
    const cssHintDataCache = new WeakMap();

    function _cssCandidateStyle(CodeMirror, mode, prefix, candidate) {
        const state = CodeMirror.startState(mode);
        const stream = new CodeMirror.StringStream(
            prefix + candidate,
            4
        );
        let style = null;
        while (!stream.eol()) {
            stream.start = stream.pos;
            style = mode.token(stream, state);
            if (stream.pos <= stream.start) {
                stream.next();
            }
        }
        return style;
    }

    function _cssHintData(CodeMirror) {
        let cached = cssHintDataCache.get(CodeMirror);
        if (cached) {
            return cached;
        }

        const mode = CodeMirror.getMode({indentUnit: 2}, "text/css");
        const autocomplete = mode && mode.languageData &&
            mode.languageData.autocomplete;
        if (!Array.isArray(autocomplete)) {
            cached = {
                colors: CSS_COLORS,
                properties: CSS_PROPERTIES,
                values: CSS_VALUES
            };
            cssHintDataCache.set(CodeMirror, cached);
            return cached;
        }

        const allWords = Array.from(new Set(autocomplete.map(function (word) {
            return String(word).toLowerCase();
        })));
        cached = {
            colors: allWords.filter(function (candidate) {
                return _cssCandidateStyle(
                    CodeMirror,
                    mode,
                    ".CodeMirror-hint { color: ",
                    candidate
                ) === "keyword";
            }),
            properties: allWords.filter(function (candidate) {
                return _cssCandidateStyle(
                    CodeMirror,
                    mode,
                    ".CodeMirror-hint { ",
                    candidate
                ) === "property";
            }),
            values: allWords.filter(function (candidate) {
                return _cssCandidateStyle(
                    CodeMirror,
                    mode,
                    ".CodeMirror-hint { color: ",
                    candidate
                ) === "atom";
            })
        };
        cssHintDataCache.set(CodeMirror, cached);
        return cached;
    }

    function installCSSHint(CodeMirror) {
        return _installOnce(CodeMirror, "cssHint", function () {
            CodeMirror.registerHelper("hint", "css", function (editor) {
                const cursor = editor.getCursor();
                const token = editor.getTokenAt(cursor);
                const inner = CodeMirror.innerMode(
                    editor.getMode(),
                    token.state
                );
                if (!inner.mode || inner.mode.name !== "css") {
                    return;
                }
                if (token.type === "keyword" &&
                        "!important".indexOf(token.string) === 0) {
                    return {
                        from: CodeMirror.Pos(cursor.line, token.start),
                        list: ["!important"],
                        to: CodeMirror.Pos(cursor.line, token.end)
                    };
                }

                let start = token.start;
                let end = cursor.ch;
                let word = token.string.slice(0, end - start);
                if (/[^\w$_-]/.test(word)) {
                    word = "";
                    start = end;
                }
                const stateName = inner.state && inner.state.state;
                const hintData = _cssHintData(CodeMirror);
                const list = [];
                const add = function (values) {
                    values.forEach(function (name) {
                        if (!word || name.lastIndexOf(word, 0) === 0) {
                            list.push(name);
                        }
                    });
                };

                if (stateName === "pseudo" ||
                        /\bvariable-3\b/.test(token.type || "")) {
                    add(CSS_PSEUDO_CLASSES);
                } else if (stateName === "block" ||
                        stateName === "maybeprop") {
                    add(hintData.properties);
                } else if (stateName === "prop" ||
                        stateName === "parens" ||
                        stateName === "at" ||
                        stateName === "params") {
                    add(hintData.values);
                    add(hintData.colors);
                } else if (stateName === "media" ||
                        stateName === "media_parens" ||
                        stateName === "atBlock" ||
                        stateName === "atBlock_parens") {
                    add(CSS_MEDIA_TYPES);
                    add(CSS_MEDIA_FEATURES);
                }

                if (list.length) {
                    return {
                        from: CodeMirror.Pos(cursor.line, start),
                        list: list,
                        to: CodeMirror.Pos(cursor.line, end)
                    };
                }
            });
        });
    }

    const HTML_LANGUAGE_CODES = (
        "ab aa af ak sq am ar an hy as av ae ay az bm ba eu be bn bh bi bs " +
        "br bg my ca ch ce ny zh cv kw co cr hr cs da dv nl dz en eo et ee " +
        "fo fj fi fr ff gl ka de el gn gu ht ha he hz hi ho hu ia id ie ga " +
        "ig ik io is it iu ja jv kl kn kr ks kk km ki rw ky kv kg ko ku kj " +
        "la lb lg li ln lo lt lu lv gv mk mg ms ml mt mi mr mh mn na nv nb " +
        "nd ne ng nn no ii nr oc oj cu om or os pa pi fa pl ps pt qu rm rn " +
        "ro ru sa sc sd se sm sg sr gd sn si sk sl so st es su sw ss sv ta " +
        "te tg th ti bo tk tl tn to tr ts tt tw ty ug uk ur uz ve vi vo wa " +
        "cy wo fy xh yi yo za zu"
    ).split(" ");

    function _createHTMLSchema() {
        const targets = ["_blank", "_self", "_top", "_parent"];
        const charsets = ["ascii", "utf-8", "utf-16", "latin1", "latin1"];
        const methods = ["get", "post", "put", "delete"];
        const encodings = [
            "application/x-www-form-urlencoded",
            "multipart/form-data",
            "text/plain"
        ];
        const media = [
            "all", "screen", "print", "embossed", "braille", "handheld",
            "print", "projection", "screen", "tty", "tv", "speech",
            "3d-glasses", "resolution [>][<][=] [X]",
            "device-aspect-ratio: X/Y", "orientation:portrait",
            "orientation:landscape", "device-height: [X]",
            "device-width: [X]"
        ];
        const simple = {attrs: {}};
        const schema = {
            a: {
                attrs: {
                    href: null,
                    ping: null,
                    type: null,
                    media: media,
                    target: targets,
                    hreflang: HTML_LANGUAGE_CODES
                }
            },
            abbr: simple,
            acronym: simple,
            address: simple,
            applet: simple,
            area: {
                attrs: {
                    alt: null,
                    coords: null,
                    href: null,
                    target: null,
                    ping: null,
                    media: media,
                    hreflang: HTML_LANGUAGE_CODES,
                    type: null,
                    shape: ["default", "rect", "circle", "poly"]
                }
            },
            article: simple,
            aside: simple,
            audio: {
                attrs: {
                    src: null,
                    mediagroup: null,
                    crossorigin: ["anonymous", "use-credentials"],
                    preload: ["none", "metadata", "auto"],
                    autoplay: ["", "autoplay"],
                    loop: ["", "loop"],
                    controls: ["", "controls"]
                }
            },
            b: simple,
            base: {attrs: {href: null, target: targets}},
            basefont: simple,
            bdi: simple,
            bdo: simple,
            big: simple,
            blockquote: {attrs: {cite: null}},
            body: simple,
            br: simple,
            button: {
                attrs: {
                    form: null,
                    formaction: null,
                    name: null,
                    value: null,
                    autofocus: ["", "autofocus"],
                    disabled: ["", "autofocus"],
                    formenctype: encodings,
                    formmethod: methods,
                    formnovalidate: ["", "novalidate"],
                    formtarget: targets,
                    type: ["submit", "reset", "button"]
                }
            },
            canvas: {attrs: {width: null, height: null}},
            caption: simple,
            center: simple,
            cite: simple,
            code: simple,
            col: {attrs: {span: null}},
            colgroup: {attrs: {span: null}},
            command: {
                attrs: {
                    type: ["command", "checkbox", "radio"],
                    label: null,
                    icon: null,
                    radiogroup: null,
                    command: null,
                    title: null,
                    disabled: ["", "disabled"],
                    checked: ["", "checked"]
                }
            },
            data: {attrs: {value: null}},
            datagrid: {
                attrs: {
                    disabled: ["", "disabled"],
                    multiple: ["", "multiple"]
                }
            },
            datalist: {attrs: {data: null}},
            dd: simple,
            del: {attrs: {cite: null, datetime: null}},
            details: {attrs: {open: ["", "open"]}},
            dfn: simple,
            dir: simple,
            div: simple,
            dialog: {attrs: {open: null}},
            dl: simple,
            dt: simple,
            em: simple,
            embed: {
                attrs: {
                    src: null,
                    type: null,
                    width: null,
                    height: null
                }
            },
            eventsource: {attrs: {src: null}},
            fieldset: {
                attrs: {
                    disabled: ["", "disabled"],
                    form: null,
                    name: null
                }
            },
            figcaption: simple,
            figure: simple,
            font: simple,
            footer: simple,
            form: {
                attrs: {
                    action: null,
                    name: null,
                    "accept-charset": charsets,
                    autocomplete: ["on", "off"],
                    enctype: encodings,
                    method: methods,
                    novalidate: ["", "novalidate"],
                    target: targets
                }
            },
            frame: simple,
            frameset: simple,
            h1: simple,
            h2: simple,
            h3: simple,
            h4: simple,
            h5: simple,
            h6: simple,
            head: {
                attrs: {},
                children: [
                    "title", "base", "link", "style", "meta", "script",
                    "noscript", "command"
                ]
            },
            header: simple,
            hgroup: simple,
            hr: simple,
            html: {
                attrs: {manifest: null},
                children: ["head", "body"]
            },
            i: simple,
            iframe: {
                attrs: {
                    src: null,
                    srcdoc: null,
                    name: null,
                    width: null,
                    height: null,
                    sandbox: [
                        "allow-top-navigation",
                        "allow-same-origin",
                        "allow-forms",
                        "allow-scripts"
                    ],
                    seamless: ["", "seamless"]
                }
            },
            img: {
                attrs: {
                    alt: null,
                    src: null,
                    ismap: null,
                    usemap: null,
                    width: null,
                    height: null,
                    crossorigin: ["anonymous", "use-credentials"]
                }
            },
            input: {
                attrs: {
                    alt: null,
                    dirname: null,
                    form: null,
                    formaction: null,
                    height: null,
                    list: null,
                    max: null,
                    maxlength: null,
                    min: null,
                    name: null,
                    pattern: null,
                    placeholder: null,
                    size: null,
                    src: null,
                    step: null,
                    value: null,
                    width: null,
                    accept: ["audio/*", "video/*", "image/*"],
                    autocomplete: ["on", "off"],
                    autofocus: ["", "autofocus"],
                    checked: ["", "checked"],
                    disabled: ["", "disabled"],
                    formenctype: encodings,
                    formmethod: methods,
                    formnovalidate: ["", "novalidate"],
                    formtarget: targets,
                    multiple: ["", "multiple"],
                    readonly: ["", "readonly"],
                    required: ["", "required"],
                    type: [
                        "hidden", "text", "search", "tel", "url", "email",
                        "password", "datetime", "date", "month", "week",
                        "time", "datetime-local", "number", "range", "color",
                        "checkbox", "radio", "file", "submit", "image",
                        "reset", "button"
                    ]
                }
            },
            ins: {attrs: {cite: null, datetime: null}},
            kbd: simple,
            keygen: {
                attrs: {
                    challenge: null,
                    form: null,
                    name: null,
                    autofocus: ["", "autofocus"],
                    disabled: ["", "disabled"],
                    keytype: ["RSA"]
                }
            },
            label: {attrs: {"for": null, form: null}},
            legend: simple,
            li: {attrs: {value: null}},
            link: {
                attrs: {
                    href: null,
                    type: null,
                    hreflang: HTML_LANGUAGE_CODES,
                    media: media,
                    sizes: [
                        "all",
                        "16x16",
                        "16x16 32x32",
                        "16x16 32x32 64x64"
                    ]
                }
            },
            map: {attrs: {name: null}},
            mark: simple,
            menu: {
                attrs: {
                    label: null,
                    type: ["list", "context", "toolbar"]
                }
            },
            meta: {
                attrs: {
                    content: null,
                    charset: charsets,
                    name: [
                        "viewport", "application-name", "author",
                        "description", "generator", "keywords"
                    ],
                    "http-equiv": [
                        "content-language",
                        "content-type",
                        "default-style",
                        "refresh"
                    ]
                }
            },
            meter: {
                attrs: {
                    value: null,
                    min: null,
                    low: null,
                    high: null,
                    max: null,
                    optimum: null
                }
            },
            nav: simple,
            noframes: simple,
            noscript: simple,
            object: {
                attrs: {
                    data: null,
                    type: null,
                    name: null,
                    usemap: null,
                    form: null,
                    width: null,
                    height: null,
                    typemustmatch: ["", "typemustmatch"]
                }
            },
            ol: {
                attrs: {
                    reversed: ["", "reversed"],
                    start: null,
                    type: ["1", "a", "A", "i", "I"]
                }
            },
            optgroup: {
                attrs: {
                    disabled: ["", "disabled"],
                    label: null
                }
            },
            option: {
                attrs: {
                    disabled: ["", "disabled"],
                    label: null,
                    selected: ["", "selected"],
                    value: null
                }
            },
            output: {attrs: {"for": null, form: null, name: null}},
            p: simple,
            param: {attrs: {name: null, value: null}},
            pre: simple,
            progress: {attrs: {value: null, max: null}},
            q: {attrs: {cite: null}},
            rp: simple,
            rt: simple,
            ruby: simple,
            s: simple,
            samp: simple,
            script: {
                attrs: {
                    type: ["text/javascript"],
                    src: null,
                    async: ["", "async"],
                    defer: ["", "defer"],
                    charset: charsets
                }
            },
            section: simple,
            select: {
                attrs: {
                    form: null,
                    name: null,
                    size: null,
                    autofocus: ["", "autofocus"],
                    disabled: ["", "disabled"],
                    multiple: ["", "multiple"]
                }
            },
            small: simple,
            source: {attrs: {src: null, type: null, media: null}},
            span: simple,
            strike: simple,
            strong: simple,
            style: {
                attrs: {
                    type: ["text/css"],
                    media: media,
                    scoped: null
                }
            },
            sub: simple,
            summary: simple,
            sup: simple,
            table: simple,
            tbody: simple,
            td: {
                attrs: {
                    colspan: null,
                    rowspan: null,
                    headers: null
                }
            },
            textarea: {
                attrs: {
                    dirname: null,
                    form: null,
                    maxlength: null,
                    name: null,
                    placeholder: null,
                    rows: null,
                    cols: null,
                    autofocus: ["", "autofocus"],
                    disabled: ["", "disabled"],
                    readonly: ["", "readonly"],
                    required: ["", "required"],
                    wrap: ["soft", "hard"]
                }
            },
            tfoot: simple,
            th: {
                attrs: {
                    colspan: null,
                    rowspan: null,
                    headers: null,
                    scope: ["row", "col", "rowgroup", "colgroup"]
                }
            },
            thead: simple,
            time: {attrs: {datetime: null}},
            title: simple,
            tr: simple,
            track: {
                attrs: {
                    src: null,
                    label: null,
                    "default": null,
                    kind: [
                        "subtitles",
                        "captions",
                        "descriptions",
                        "chapters",
                        "metadata"
                    ],
                    srclang: HTML_LANGUAGE_CODES
                }
            },
            tt: simple,
            u: simple,
            ul: simple,
            "var": simple,
            video: {
                attrs: {
                    src: null,
                    poster: null,
                    width: null,
                    height: null,
                    crossorigin: ["anonymous", "use-credentials"],
                    preload: ["auto", "metadata", "none"],
                    autoplay: ["", "autoplay"],
                    mediagroup: ["movie"],
                    muted: ["", "muted"],
                    controls: ["", "controls"]
                }
            },
            wbr: simple
        };
        const globalAttrs = {
            accesskey: (
                "a b c d e f g h i j k l m n o p q r s t u v w x y z " +
                "0 1 2 3 4 5 6 7 8 9"
            ).split(" "),
            class: null,
            contenteditable: ["true", "false"],
            contextmenu: null,
            dir: ["ltr", "rtl", "auto"],
            draggable: ["true", "false", "auto"],
            dropzone: ["copy", "move", "link", "string:", "file:"],
            hidden: ["hidden"],
            id: null,
            inert: ["inert"],
            itemid: null,
            itemprop: null,
            itemref: null,
            itemscope: ["itemscope"],
            itemtype: null,
            lang: ["en", "es"],
            spellcheck: ["true", "false"],
            autocorrect: ["true", "false"],
            autocapitalize: ["true", "false"],
            style: null,
            tabindex: ["1", "2", "3", "4", "5", "6", "7", "8", "9"],
            title: null,
            translate: ["yes", "no"],
            onclick: null,
            rel: [
                "stylesheet", "alternate", "author", "bookmark", "help",
                "license", "next", "nofollow", "noreferrer", "prefetch",
                "prev", "search", "tag"
            ]
        };
        Object.keys(globalAttrs).forEach(function (attribute) {
            simple.attrs[attribute] = globalAttrs[attribute];
        });
        Object.keys(schema).forEach(function (tag) {
            if (schema[tag] === simple) {
                return;
            }
            Object.keys(globalAttrs).forEach(function (attribute) {
                schema[tag].attrs[attribute] = globalAttrs[attribute];
            });
        });
        return schema;
    }

    function _xmlHints(CodeMirror, editor, suppliedOptions) {
        const options = suppliedOptions || {};
        const tags = options.schemaInfo;
        const quoteOption = options.quoteChar || "\"";
        const matchInMiddle = options.matchInMiddle;
        if (!tags) {
            return;
        }

        const cursor = editor.getCursor();
        const token = editor.getTokenAt(cursor);
        if (token.end > cursor.ch) {
            token.end = cursor.ch;
            token.string = token.string.slice(0, cursor.ch - token.start);
        }
        const inner = CodeMirror.innerMode(editor.getMode(), token.state);
        if (!inner.mode || typeof inner.mode.xmlCurrentTag !== "function") {
            return;
        }

        const matches = function (candidate, typed) {
            return matchInMiddle ?
                candidate.indexOf(typed) >= 0 :
                candidate.lastIndexOf(typed, 0) === 0;
        };
        const result = [];
        let replaceToken = false;
        let prefix;
        const tag = /\btag\b/.test(token.type || "") &&
            !/>$/.test(token.string);
        const tagName = tag && /^\w/.test(token.string);
        let tagStart;
        let tagType;

        if (tagName) {
            const before = (editor.getLine(cursor.line) || "").slice(
                Math.max(0, token.start - 2),
                token.start
            );
            tagType = /<\/$/.test(before) ?
                "close" :
                /<$/.test(before) ? "open" : null;
            if (tagType) {
                tagStart = token.start - (tagType === "close" ? 2 : 1);
            }
        } else if (tag && token.string === "<") {
            tagType = "open";
        } else if (tag && token.string === "</") {
            tagType = "close";
        }

        const currentTag = inner.mode.xmlCurrentTag(inner.state);
        if ((!tag && !currentTag) || tagType) {
            if (tagName) {
                prefix = token.string;
            }
            replaceToken = Boolean(tagType);
            const context = typeof inner.mode.xmlCurrentContext ===
                "function" ?
                inner.mode.xmlCurrentContext(inner.state) :
                [];
            const parent = context.length ?
                context[context.length - 1] :
                null;
            const parentInfo = parent && tags[parent];
            const childList = parent ?
                parentInfo && parentInfo.children :
                tags["!top"];
            if (childList && tagType !== "close") {
                childList.forEach(function (name) {
                    if (!prefix || matches(name, prefix)) {
                        result.push("<" + name);
                    }
                });
            } else if (tagType !== "close") {
                Object.keys(tags).forEach(function (name) {
                    if (name !== "!top" &&
                            name !== "!attrs" &&
                            (!prefix || matches(name, prefix))) {
                        result.push("<" + name);
                    }
                });
            }
            if (parent &&
                    (!prefix ||
                    tagType === "close" && matches(parent, prefix))) {
                result.push("</" + parent + ">");
            }
        } else {
            const tagInfo = currentTag && tags[currentTag.name];
            let attrs = tagInfo && tagInfo.attrs;
            const globalAttrs = tags["!attrs"];
            if (!attrs && !globalAttrs) {
                return;
            }
            if (!attrs) {
                attrs = globalAttrs;
            } else if (globalAttrs) {
                attrs = Object.assign({}, globalAttrs, attrs);
            }

            if (token.type === "string" || token.string === "=") {
                const before = editor.getRange(
                    CodeMirror.Pos(
                        cursor.line,
                        Math.max(0, cursor.ch - 60)
                    ),
                    CodeMirror.Pos(
                        cursor.line,
                        token.type === "string" ?
                            token.start :
                            token.end
                    )
                );
                const attributeName =
                    /([^\s\u00a0=<>"']+)=$/.exec(before);
                let attributeValues;
                if (!attributeName ||
                        !Object.prototype.hasOwnProperty.call(
                            attrs,
                            attributeName[1]
                        ) ||
                        !(attributeValues = attrs[attributeName[1]])) {
                    return;
                }
                if (typeof attributeValues === "function") {
                    attributeValues = attributeValues.call(this, editor);
                }

                let quote = quoteOption;
                if (token.type === "string") {
                    prefix = token.string;
                    let openingQuoteLength = 0;
                    if (/['"]/.test(token.string.charAt(0))) {
                        quote = token.string.charAt(0);
                        prefix = token.string.slice(1);
                        openingQuoteLength++;
                    }
                    const tokenLength = token.string.length;
                    if (/['"]/.test(token.string.charAt(tokenLength - 1))) {
                        quote = token.string.charAt(tokenLength - 1);
                        prefix = token.string.substr(
                            openingQuoteLength,
                            tokenLength - 2
                        );
                    }
                    if (openingQuoteLength) {
                        const line = editor.getLine(cursor.line) || "";
                        if (line.length > token.end &&
                                line.charAt(token.end) === quote) {
                            token.end++;
                        }
                    }
                    replaceToken = true;
                }

                const finishValues = function (resolvedValues) {
                    if (resolvedValues) {
                        for (let index = 0;
                            index < resolvedValues.length;
                            index++) {
                            const value = resolvedValues[index];
                            if (!prefix || matches(value, prefix)) {
                                result.push(quote + value + quote);
                            }
                        }
                    }
                    return {
                        from: replaceToken ?
                            CodeMirror.Pos(cursor.line, token.start) :
                            cursor,
                        list: result,
                        to: replaceToken ?
                            CodeMirror.Pos(cursor.line, token.end) :
                            cursor
                    };
                };
                if (attributeValues && attributeValues.then) {
                    return attributeValues.then(finishValues);
                }
                return finishValues(attributeValues);
            }

            if (token.type === "attribute") {
                prefix = token.string;
                replaceToken = true;
            }
            Object.keys(attrs).forEach(function (name) {
                if (!prefix || matches(name, prefix)) {
                    result.push(name);
                }
            });
        }

        return {
            from: replaceToken ?
                CodeMirror.Pos(
                    cursor.line,
                    tagStart === undefined ? token.start : tagStart
                ) :
                cursor,
            list: result,
            to: replaceToken ?
                CodeMirror.Pos(cursor.line, token.end) :
                cursor
        };
    }

    function installXMLHint(CodeMirror) {
        return _installOnce(CodeMirror, "xmlHint", function () {
            CodeMirror.registerHelper("hint", "xml", function (editor, options) {
                return _xmlHints.call(this, CodeMirror, editor, options);
            });
        });
    }

    function installHTMLHint(CodeMirror) {
        installXMLHint(CodeMirror);
        return _installOnce(CodeMirror, "htmlHint", function () {
            CodeMirror.htmlSchema = _createHTMLSchema();
            CodeMirror.registerHelper("hint", "html", function (editor, options) {
                const localOptions = {
                    schemaInfo: CodeMirror.htmlSchema
                };
                if (options) {
                    for (const name in options) {
                        localOptions[name] = options[name];
                    }
                }
                return CodeMirror.hint.xml(
                    editor,
                    localOptions
                );
            });
        });
    }

    const JAVASCRIPT_KEYWORDS = (
        "break case catch class const continue debugger default delete do else " +
        "export extends false finally for function if in import instanceof " +
        "new null return super switch this throw true try typeof var void " +
        "while with yield"
    ).split(" ");
    const COFFEESCRIPT_KEYWORDS = (
        "and break catch class continue delete do else extends false finally " +
        "for if in instanceof isnt new no not null of off on or return switch " +
        "then throw true try typeof until void while with yes"
    ).split(" ");
    const STRING_PROPERTIES = (
        "charAt charCodeAt indexOf lastIndexOf substring substr slice trim " +
        "trimLeft trimRight toUpperCase toLowerCase split concat match replace " +
        "search"
    ).split(" ");
    const ARRAY_PROPERTIES = (
        "length concat join splice push pop shift unshift slice reverse sort " +
        "indexOf lastIndexOf every some filter forEach map reduce reduceRight"
    ).split(" ");
    const FUNCTION_PROPERTIES = "prototype apply call bind".split(" ");

    function _safePropertyNames(value) {
        const names = [];
        const seen = new Set();
        try {
            for (let object = value; object; object = Object.getPrototypeOf(object)) {
                Object.getOwnPropertyNames(object).forEach(function (name) {
                    if (!seen.has(name)) {
                        seen.add(name);
                        names.push(name);
                    }
                });
            }
        } catch (error) {
            return names;
        }
        return names;
    }

    function _coffeeScriptToken(editor, cursor) {
        const token = editor.getTokenAt(cursor);
        if (cursor.ch === token.start + 1 &&
                token.string.charAt(0) === ".") {
            token.end = token.start;
            token.string = ".";
            token.type = "property";
        } else if (/^\.[\w$_]*$/.test(token.string)) {
            token.type = "property";
            token.start++;
            token.string = token.string.replace(/\./, "");
        }
        return token;
    }

    function _javascriptCompletions(
        token,
        context,
        keywords,
        suppliedOptions
    ) {
        const options = suppliedOptions || {};
        const found = [];
        const start = token.string;
        const globalScope = options.globalScope ||
            (typeof window !== "undefined" ? window : {});

        const maybeAdd = function (name) {
            if (typeof name === "string" &&
                    name.lastIndexOf(start, 0) === 0 &&
                    found.indexOf(name) === -1) {
                found.push(name);
            }
        };
        const gatherCompletions = function (value) {
            if (typeof value === "string") {
                STRING_PROPERTIES.forEach(maybeAdd);
            } else if (Array.isArray(value)) {
                ARRAY_PROPERTIES.forEach(maybeAdd);
            } else if (typeof value === "function") {
                FUNCTION_PROPERTIES.forEach(maybeAdd);
            }
            _safePropertyNames(value).forEach(maybeAdd);
        };

        if (context && context.length) {
            const objectToken = context.pop();
            let base;
            if (objectToken.type &&
                    objectToken.type.indexOf("variable") === 0) {
                if (options.additionalContext) {
                    base = options.additionalContext[objectToken.string];
                }
                if (options.useGlobalScope !== false) {
                    base = base || globalScope[objectToken.string];
                }
            } else if (objectToken.type === "string") {
                base = "";
            } else if (objectToken.type === "atom") {
                base = 1;
            } else if (objectToken.type === "function") {
                if (globalScope.jQuery !== null &&
                        globalScope.jQuery !== undefined &&
                        (objectToken.string === "$" ||
                            objectToken.string === "jQuery") &&
                        typeof globalScope.jQuery === "function") {
                    base = globalScope.jQuery();
                } else if (globalScope._ !== null &&
                        globalScope._ !== undefined &&
                        objectToken.string === "_" &&
                        typeof globalScope._ === "function") {
                    base = globalScope._();
                }
            }
            while (base !== null &&
                    base !== undefined &&
                    context.length) {
                try {
                    base = base[context.pop().string];
                } catch (error) {
                    base = undefined;
                }
            }
            if (base !== null && base !== undefined) {
                gatherCompletions(base);
            }
        } else {
            let variable;
            for (variable = token.state && token.state.localVars;
                variable;
                variable = variable.next) {
                maybeAdd(variable.name);
            }
            for (let scope = token.state && token.state.context;
                scope;
                scope = scope.prev) {
                for (variable = scope.vars;
                    variable;
                    variable = variable.next) {
                    maybeAdd(variable.name);
                }
            }
            for (variable = token.state && token.state.globalVars;
                variable;
                variable = variable.next) {
                maybeAdd(variable.name);
            }
            if (options.additionalContext !== null &&
                    options.additionalContext !== undefined) {
                for (const name in options.additionalContext) {
                    maybeAdd(name);
                }
            }
            if (options.useGlobalScope !== false) {
                gatherCompletions(globalScope);
            }
            keywords.forEach(maybeAdd);
        }
        return found;
    }

    function _javascriptHint(
        CodeMirror,
        editor,
        suppliedOptions,
        coffeescript
    ) {
        const cursor = editor.getCursor();
        let token = coffeescript ?
            _coffeeScriptToken(editor, cursor) :
            editor.getTokenAt(cursor);
        if (/\b(?:string|comment)\b/.test(token.type || "")) {
            return;
        }
        const inner = CodeMirror.innerMode(editor.getMode(), token.state);
        if (inner.mode && inner.mode.helperType === "json") {
            return;
        }
        token.state = inner.state;

        if (!/^[\w$_]*$/.test(token.string)) {
            token = {
                end: cursor.ch,
                start: cursor.ch,
                state: token.state,
                string: "",
                type: token.string === "." ? "property" : null
            };
        } else if (token.end > cursor.ch) {
            token.end = cursor.ch;
            token.string = token.string.slice(
                0,
                cursor.ch - token.start
            );
        }

        let propertyToken = token;
        let context;
        while (propertyToken.type === "property") {
            propertyToken = coffeescript ?
                _coffeeScriptToken(
                    editor,
                    CodeMirror.Pos(cursor.line, propertyToken.start)
                ) :
                editor.getTokenAt(
                    CodeMirror.Pos(cursor.line, propertyToken.start)
                );
            if (propertyToken.string !== ".") {
                return;
            }
            propertyToken = coffeescript ?
                _coffeeScriptToken(
                    editor,
                    CodeMirror.Pos(cursor.line, propertyToken.start)
                ) :
                editor.getTokenAt(
                    CodeMirror.Pos(cursor.line, propertyToken.start)
                );
            if (!context) {
                context = [];
            }
            context.push(propertyToken);
        }

        return {
            from: CodeMirror.Pos(cursor.line, token.start),
            list: _javascriptCompletions(
                token,
                context,
                coffeescript ?
                    COFFEESCRIPT_KEYWORDS :
                    JAVASCRIPT_KEYWORDS,
                suppliedOptions
            ),
            to: CodeMirror.Pos(cursor.line, token.end)
        };
    }

    function installJavaScriptHint(CodeMirror) {
        return _installOnce(CodeMirror, "javascriptHint", function () {
            CodeMirror.registerHelper(
                "hint",
                "javascript",
                function (editor, options) {
                    return _javascriptHint(
                        CodeMirror,
                        editor,
                        options,
                        false
                    );
                }
            );
            CodeMirror.registerHelper(
                "hint",
                "coffeescript",
                function (editor, options) {
                    return _javascriptHint(
                        CodeMirror,
                        editor,
                        options,
                        true
                    );
                }
            );
        });
    }

    const SQL_QUERY_SEPARATOR = ";";
    const SQL_ALIAS_KEYWORD = "AS";

    function _sqlItemText(item) {
        return typeof item === "string" ?
            item :
            item && item.text || "";
    }

    function _sqlShallowClone(object) {
        return Object.assign({}, object);
    }

    function _sqlWrapTable(name, value) {
        if (Array.isArray(value)) {
            return {
                columns: value,
                text: name
            };
        }
        if (typeof value === "string") {
            return {
                columns: [],
                text: value
            };
        }
        return Object.assign(
            {columns: [], text: name},
            value || {}
        );
    }

    function _sqlTables(input) {
        const tables = {};
        if (Array.isArray(input)) {
            for (let index = input.length - 1; index >= 0; index--) {
                const item = input[index];
                const name = _sqlItemText(item);
                if (name) {
                    tables[name.toUpperCase()] = _sqlWrapTable(name, item);
                }
            }
        } else {
            Object.keys(input || {}).forEach(function (name) {
                tables[name.toUpperCase()] = _sqlWrapTable(name, input[name]);
            });
        }
        return tables;
    }

    function _sqlMatches(search, item) {
        return _sqlItemText(item).substr(0, search.length).toUpperCase() ===
            search.toUpperCase();
    }

    function _sqlAddMatches(result, search, values, formatter) {
        if (Array.isArray(values)) {
            values.forEach(function (value) {
                if (_sqlMatches(search, value)) {
                    result.push(formatter(value));
                }
            });
            return;
        }
        Object.keys(values || {}).forEach(function (name) {
            let value = values[name];
            if (!value || value === true) {
                value = name;
            } else {
                value = value.displayText ?
                    {
                        displayText: value.displayText,
                        text: value.text
                    } :
                    value.text;
            }
            if (_sqlMatches(search, value)) {
                result.push(formatter(value));
            }
        });
    }

    function _sqlModeConfig(CodeMirror, editor, field) {
        const currentMode = editor.getModeAt(editor.getCursor());
        if (currentMode && currentMode.config &&
                currentMode.config[field]) {
            return currentMode.config[field];
        }
        const genericSQL = CodeMirror.resolveMode("text/x-sql");
        return genericSQL && genericSQL[field];
    }

    function _sqlIdentifierQuote(CodeMirror, editor) {
        return _sqlModeConfig(
            CodeMirror,
            editor,
            "identifierQuote"
        ) || "`";
    }

    function _sqlCleanName(name, identifierQuote) {
        let cleaned = name;
        if (cleaned.charAt(0) === ".") {
            cleaned = cleaned.substr(1);
        }
        const escapedQuote = identifierQuote.replace(
            /[.*+?^${}()|[\]\\]/g,
            "\\$&"
        );
        const doubledQuote = identifierQuote + identifierQuote;
        return cleaned.split(doubledQuote).map(function (part) {
            return part.replace(new RegExp(escapedQuote, "g"), "");
        }).join(identifierQuote);
    }

    function _sqlInsertIdentifierQuotes(item, identifierQuote) {
        const parts = _sqlItemText(item).split(".");
        const escapedQuote = identifierQuote.replace(
            /[.*+?^${}()|[\]\\]/g,
            "\\$&"
        );
        for (let index = 0; index < parts.length; index++) {
            parts[index] = identifierQuote +
                parts[index].replace(
                    new RegExp(escapedQuote, "g"),
                    identifierQuote + identifierQuote
                ) +
                identifierQuote;
        }
        const escaped = parts.join(".");
        if (typeof item === "string") {
            return escaped;
        }
        const result = _sqlShallowClone(item);
        result.text = escaped;
        return result;
    }

    function _sqlFindTableByAlias(
        CodeMirror,
        alias,
        editor,
        tables
    ) {
        const doc = editor.doc;
        const fullQuery = doc.getValue();
        const aliasUpperCase = alias.toUpperCase();
        let previousWord = "";
        let table = "";
        const separators = [];
        let separatorIndex = fullQuery.indexOf(SQL_QUERY_SEPARATOR);
        while (separatorIndex !== -1) {
            separators.push(doc.posFromIndex(separatorIndex));
            separatorIndex = fullQuery.indexOf(
                SQL_QUERY_SEPARATOR,
                separatorIndex + 1
            );
        }
        separators.unshift(CodeMirror.Pos(0, 0));
        separators.push(CodeMirror.Pos(
            editor.lastLine(),
            (editor.getLine(editor.lastLine()) || "").length
        ));

        const current = editor.getCursor();
        let previousSeparator = null;
        let validRange = {
            end: separators[separators.length - 1],
            start: separators[0]
        };
        for (let index = 0; index < separators.length; index++) {
            const separator = separators[index];
            if ((!previousSeparator ||
                    CodeMirror.cmpPos(current, previousSeparator) > 0) &&
                    CodeMirror.cmpPos(current, separator) <= 0) {
                validRange = {
                    end: separator,
                    start: previousSeparator
                };
                break;
            }
            previousSeparator = separator;
        }

        if (validRange.start) {
            const queryLines = doc.getRange(
                validRange.start,
                validRange.end,
                false
            );
            for (let index = 0; index < queryLines.length; index++) {
                const words = queryLines[index].split(/\s+/);
                for (let wordIndex = 0;
                    wordIndex < words.length;
                    wordIndex++) {
                    const word = words[wordIndex].replace(/[`",;]/g, "");
                    if (!word) {
                        continue;
                    }
                    const upperWord = word.toUpperCase();
                    if (upperWord === aliasUpperCase &&
                            tables[previousWord.toUpperCase()]) {
                        table = previousWord;
                    }
                    if (upperWord !== SQL_ALIAS_KEYWORD) {
                        previousWord = word;
                    }
                }
                if (table) {
                    break;
                }
            }
        }
        return table;
    }

    function _sqlNameCompletion(
        CodeMirror,
        cursor,
        initialToken,
        result,
        editor,
        tables,
        defaultTable,
        identifierQuote
    ) {
        let token = initialToken;
        let useIdentifierQuotes = false;
        const nameParts = [];
        let start = token.start;
        let continueReading = true;
        while (continueReading) {
            continueReading = token.string.charAt(0) === ".";
            useIdentifierQuotes = useIdentifierQuotes ||
                token.string.charAt(0) === identifierQuote;
            start = token.start;
            nameParts.unshift(_sqlCleanName(token.string, identifierQuote));
            token = editor.getTokenAt(
                CodeMirror.Pos(cursor.line, token.start)
            );
            if (token.string === ".") {
                continueReading = true;
                token = editor.getTokenAt(
                    CodeMirror.Pos(cursor.line, token.start)
                );
            }
        }

        let search = nameParts.join(".");
        _sqlAddMatches(result, search, tables, function (item) {
            return useIdentifierQuotes ?
                _sqlInsertIdentifierQuotes(item, identifierQuote) :
                item;
        });
        _sqlAddMatches(result, search, defaultTable, function (item) {
            return useIdentifierQuotes ?
                _sqlInsertIdentifierQuotes(item, identifierQuote) :
                item;
        });

        search = nameParts.pop();
        let tableName = nameParts.join(".");
        let alias = false;
        const aliasTable = tableName;
        if (!tables[tableName.toUpperCase()]) {
            const oldTableName = tableName;
            tableName = _sqlFindTableByAlias(
                CodeMirror,
                tableName,
                editor,
                tables
            );
            alias = tableName !== oldTableName;
        }

        const table = tables[tableName.toUpperCase()];
        const columns = table && table.columns;
        if (columns) {
            _sqlAddMatches(result, search, columns, function (item) {
                const tableInsert = alias ? aliasTable : tableName;
                let completion;
                if (typeof item === "string") {
                    completion = tableInsert + "." + item;
                } else {
                    completion = _sqlShallowClone(item);
                    completion.text = tableInsert + "." + item.text;
                }
                return useIdentifierQuotes ?
                    _sqlInsertIdentifierQuotes(
                        completion,
                        identifierQuote
                    ) :
                    completion;
            });
        }
        return start;
    }

    function _sqlObjectOrClass(item, className) {
        if (typeof item === "object") {
            return Object.assign({}, item, {className: className});
        }
        return {
            className: className,
            text: item
        };
    }

    function installSQLHint(CodeMirror) {
        return _installOnce(CodeMirror, "sqlHint", function () {
            CodeMirror.registerHelper("hint", "sql", function (editor, options) {
                const settings = options || {};
                const tables = _sqlTables(settings.tables);
                const identifierQuote = _sqlIdentifierQuote(
                    CodeMirror,
                    editor
                );
                const keywords = _sqlModeConfig(
                    CodeMirror,
                    editor,
                    "keywords"
                ) || [];
                const defaultTableName = settings.defaultTable;
                let defaultTable = defaultTableName &&
                    tables[String(defaultTableName).toUpperCase()];
                if (defaultTableName && !defaultTable) {
                    const aliasTable = _sqlFindTableByAlias(
                        CodeMirror,
                        defaultTableName,
                        editor,
                        tables
                    );
                    defaultTable = tables[String(aliasTable).toUpperCase()];
                }
                defaultTable = defaultTable && defaultTable.columns || [];

                const cursor = editor.getCursor();
                const result = [];
                let token = editor.getTokenAt(cursor);
                if (token.end > cursor.ch) {
                    token.end = cursor.ch;
                    token.string = token.string.slice(
                        0,
                        cursor.ch - token.start
                    );
                }

                let start;
                let end;
                let search;
                if (/^[.`"'\w@][\w$#]*$/.test(token.string)) {
                    search = token.string;
                    start = token.start;
                    end = token.end;
                } else {
                    start = cursor.ch;
                    end = cursor.ch;
                    search = "";
                }

                if (search.charAt(0) === "." ||
                        search.charAt(0) === identifierQuote) {
                    start = _sqlNameCompletion(
                        CodeMirror,
                        cursor,
                        token,
                        result,
                        editor,
                        tables,
                        defaultTable,
                        identifierQuote
                    );
                } else {
                    _sqlAddMatches(
                        result,
                        search,
                        defaultTable,
                        function (item) {
                            return _sqlObjectOrClass(
                                item,
                                "CodeMirror-hint-table " +
                                    "CodeMirror-hint-default-table"
                            );
                        }
                    );
                    _sqlAddMatches(
                        result,
                        search,
                        tables,
                        function (item) {
                            return _sqlObjectOrClass(
                                item,
                                "CodeMirror-hint-table"
                            );
                        }
                    );
                    if (!settings.disableKeywords) {
                        _sqlAddMatches(
                            result,
                            search,
                            keywords,
                            function (keyword) {
                                return _sqlObjectOrClass(
                                    keyword.toUpperCase(),
                                    "CodeMirror-hint-keyword"
                                );
                            }
                        );
                    }
                }

                return {
                    from: CodeMirror.Pos(cursor.line, start),
                    list: result,
                    to: CodeMirror.Pos(cursor.line, end)
                };
            });
        });
    }

    function _lintAnnotationNode(editor, annotation) {
        const ownerDocument = _documentFor(editor);
        const node = ownerDocument.createElement("div");
        const severity = annotation.severity || "error";
        node.className =
            `CodeMirror-lint-message CodeMirror-lint-message-${severity}`;
        if (annotation.messageHTML !== undefined) {
            node.innerHTML = annotation.messageHTML;
        } else {
            node.appendChild(
                ownerDocument.createTextNode(
                    String(annotation.message || "")
                )
            );
        }
        return node;
    }

    function _removeLintTooltip(record, immediately) {
        if (!record || record.removed) {
            return;
        }
        record.target.removeEventListener("mouseout", record.hide);
        record.ownerDocument.removeEventListener(
            "mousemove",
            record.position
        );
        record.ownerWindow.clearInterval(record.poll);
        record.ownerWindow.clearTimeout(record.removeTimeout);
        if (immediately) {
            record.removed = true;
            _removeNode(record.node);
            record.state.tooltips.delete(record);
            if (record.state.activeTooltip === record) {
                record.state.activeTooltip = null;
            }
            return;
        }
        record.node.style.opacity = "0";
        record.removeTimeout = record.ownerWindow.setTimeout(function () {
            _removeLintTooltip(record, true);
        }, 600);
        if (record.state.activeTooltip === record) {
            record.state.activeTooltip = null;
        }
    }

    function _clearLintTooltips(state) {
        if (!state || !state.tooltips) {
            return;
        }
        Array.from(state.tooltips).forEach(function (record) {
            _removeLintTooltip(record, true);
        });
    }

    function _showLintTooltip(editor, event, annotations, target) {
        const state = editor.state.lint;
        if (!state || !annotations.length || !target) {
            return;
        }
        if (state.activeTooltip &&
                state.activeTooltip.target === target) {
            return;
        }
        _clearLintTooltips(state);

        const ownerDocument = _documentFor(editor);
        const ownerWindow = ownerDocument.defaultView || window;
        const tooltip = ownerDocument.createElement("div");
        const themeClasses = String(
            editor.getOption("theme") || "default"
        ).split(/\s+/).filter(Boolean).map(function (themeName) {
            return `cm-s-${themeName}`;
        });
        tooltip.className = ["CodeMirror-lint-tooltip"]
            .concat(themeClasses)
            .join(" ");
        annotations.forEach(function (annotation) {
            tooltip.appendChild(_lintAnnotationNode(editor, annotation));
        });
        const parent = state.options.selfContain ?
            editor.getWrapperElement() :
            ownerDocument.body;
        parent.appendChild(tooltip);

        const record = {
            hide: null,
            node: tooltip,
            ownerDocument: ownerDocument,
            ownerWindow: ownerWindow,
            poll: null,
            position: null,
            removeTimeout: null,
            removed: false,
            state: state,
            target: target
        };
        record.position = function (moveEvent) {
            if (!record.node.parentNode) {
                _removeLintTooltip(record, true);
                return;
            }
            const viewportWidth = ownerWindow.innerWidth ||
                ownerDocument.documentElement.clientWidth;
            const top = Math.max(
                0,
                moveEvent.clientY - record.node.offsetHeight - 5
            );
            const left = Math.max(
                0,
                Math.min(
                    moveEvent.clientX + 5,
                    viewportWidth - record.node.offsetWidth
                )
            );
            record.node.style.top = `${top}px`;
            record.node.style.left = `${left}px`;
        };
        record.hide = function (mouseOutEvent) {
            if (mouseOutEvent &&
                    record.target.contains(mouseOutEvent.relatedTarget)) {
                return;
            }
            _removeLintTooltip(record, false);
        };

        target.addEventListener("mouseout", record.hide);
        ownerDocument.addEventListener("mousemove", record.position);
        record.poll = ownerWindow.setInterval(function () {
            if (!record.target.isConnected) {
                _removeLintTooltip(record, true);
            }
        }, 400);
        state.tooltips.add(record);
        state.activeTooltip = record;
        record.position(event);
        record.node.style.opacity = "1";
    }

    function _lintAnnotationsForTarget(editor, event) {
        const state = editor.state.lint;
        const wrapper = editor.getWrapperElement();
        let target = event.target || event.srcElement;
        if (target && target.nodeType !== 1) {
            target = target.parentElement;
        }
        if (!state || !target || !wrapper.contains(target)) {
            return null;
        }

        for (let node = target; node && node !== wrapper;
            node = node.parentNode) {
            if (node._phoenixLintAnnotations) {
                return {
                    annotations: node._phoenixLintAnnotations,
                    target: node
                };
            }
        }
        if (state.options.tooltips === "gutter") {
            return null;
        }

        const lintMark = target.closest &&
            target.closest(".CodeMirror-lint-mark");
        if (!lintMark || !wrapper.contains(lintMark)) {
            return null;
        }
        const rectangle = lintMark.getBoundingClientRect();
        const position = editor.coordsChar({
            left: (rectangle.left + rectangle.right) / 2,
            top: (rectangle.top + rectangle.bottom) / 2
        }, "client");
        const annotations = editor.findMarksAt(position)
            .map(function (marker) {
                return marker.__annotation;
            })
            .filter(function (annotation, index, allAnnotations) {
                return annotation &&
                    allAnnotations.indexOf(annotation) === index;
            });
        return annotations.length ? {
            annotations: annotations,
            target: lintMark
        } : null;
    }

    function _handleLintMouseOver(editor, event) {
        const match = _lintAnnotationsForTarget(editor, event);
        if (match) {
            _showLintTooltip(
                editor,
                event,
                match.annotations,
                match.target
            );
        }
    }

    function _clearLint(editor) {
        const state = editor.state.lint;
        if (!state) {
            return;
        }
        _clearLintTooltips(state);
        if (state.hasGutter) {
            editor.clearGutter(LINT_GUTTER_ID);
        }
        state.marked.forEach(function (marker) {
            marker.clear();
        });
        state.marked.length = 0;
        state.errorLines.forEach(function (entry) {
            editor.removeLineClass(entry.line, "wrap", entry.className);
        });
        state.errorLines.length = 0;
    }

    function _lintSeverity(left, right) {
        const weights = {
            error: 3,
            warning: 2,
            info: 1
        };
        return (weights[right] || 3) > (weights[left] || 0) ?
            right :
            left;
    }

    function _applyLintAnnotations(CodeMirror, editor, annotations) {
        const state = editor.state.lint;
        if (!state) {
            return [];
        }
        const flat = Array.isArray(annotations) ? annotations : [];
        const grouped = [];
        _clearLint(editor);

        flat.forEach(function (originalAnnotation) {
            if (!originalAnnotation || !originalAnnotation.from) {
                return;
            }
            const annotation = state.options.formatAnnotation ?
                state.options.formatAnnotation(originalAnnotation) :
                originalAnnotation;
            annotation.severity = annotation.severity || "error";
            const line = annotation.from.line;
            if (!grouped[line]) {
                grouped[line] = [];
            }
            grouped[line].push(annotation);
            if (annotation.to) {
                state.marked.push(editor.markText(
                    annotation.from,
                    annotation.to,
                    {
                        className:
                            "CodeMirror-lint-mark " +
                            `CodeMirror-lint-mark-${annotation.severity}`,
                        __annotation: annotation
                    }
                ));
            }
        });

        grouped.forEach(function (lineAnnotations, line) {
            if (!lineAnnotations) {
                return;
            }
            let severity = "info";
            lineAnnotations.forEach(function (annotation) {
                severity = _lintSeverity(
                    severity,
                    annotation.severity || "error"
                );
            });
            if (state.hasGutter) {
                const ownerDocument = _documentFor(editor);
                const marker = ownerDocument.createElement("div");
                marker.className =
                    "CodeMirror-lint-marker " +
                    `CodeMirror-lint-marker-${severity}`;
                marker._phoenixLintAnnotations = lineAnnotations;
                marker.setAttribute("role", "img");
                marker.setAttribute("aria-label", lineAnnotations.map(
                    function (annotation) {
                        return _lintAnnotationNode(
                            editor,
                            annotation
                        ).textContent;
                    }
                ).join("\n"));
                if (lineAnnotations.length > 1) {
                    const multiple = ownerDocument.createElement("div");
                    multiple.className =
                        "CodeMirror-lint-marker " +
                        "CodeMirror-lint-marker-multiple";
                    multiple._phoenixLintAnnotations = lineAnnotations;
                    marker.appendChild(multiple);
                }
                editor.setGutterMarker(line, LINT_GUTTER_ID, marker);
            }
            if (state.options.highlightLines) {
                const className = `CodeMirror-lint-line-${severity}`;
                editor.addLineClass(line, "wrap", className);
                state.errorLines.push({
                    className: className,
                    line: line
                });
            }
        });

        state.annotations = flat;
        state.grouped = grouped;
        if (typeof state.options.onUpdateLinting === "function") {
            state.options.onUpdateLinting(flat, grouped, editor);
        }
        return flat;
    }

    function _runLint(CodeMirror, editor) {
        const state = editor.state.lint;
        if (!state) {
            return Promise.resolve([]);
        }
        const provider = state.options.getAnnotations ||
            editor.getHelper(CodeMirror.Pos(0, 0), "lint");
        if (typeof provider !== "function") {
            return Promise.resolve([]);
        }
        const requestId = ++state.waitingFor;
        const finish = function (annotations) {
            if (editor.state.lint !== state ||
                    state.waitingFor !== requestId) {
                return [];
            }
            return _applyLintAnnotations(
                CodeMirror,
                editor,
                annotations
            );
        };

        if (state.options.async || provider.async) {
            return new Promise(function (resolve, reject) {
                let completed = false;
                const callback = function (annotations, alternate) {
                    if (completed) {
                        return;
                    }
                    completed = true;
                    try {
                        resolve(finish(
                            Array.isArray(alternate) ?
                                alternate :
                                annotations
                        ));
                    } catch (error) {
                        reject(error);
                    }
                };
                try {
                    provider(
                        editor.getValue(),
                        callback,
                        state.linterOptions,
                        editor
                    );
                } catch (error) {
                    reject(error);
                }
            });
        }

        try {
            const result = provider(
                editor.getValue(),
                state.linterOptions,
                editor
            );
            if (result && typeof result.then === "function") {
                return result.then(finish);
            }
            return Promise.resolve(finish(result));
        } catch (error) {
            return Promise.reject(error);
        }
    }

    function _disableLint(CodeMirror, editor) {
        const state = editor.state.lint;
        if (!state) {
            return;
        }
        const ownerWindow = _documentFor(editor).defaultView || window;
        ownerWindow.clearTimeout(state.timeout);
        state.waitingFor++;
        _clearLint(editor);
        if (state.changeHandler) {
            editor.off("change", state.changeHandler);
        }
        if (state.mouseOverHandler) {
            editor.getWrapperElement().removeEventListener(
                "mouseover",
                state.mouseOverHandler
            );
        }
        editor.state.lint = null;
        CodeMirror.signal(editor, "lintStop", editor);
    }

    function installLint(CodeMirror) {
        return _installOnce(CodeMirror, "lint", function () {
            if (!CodeMirror.helpers.lint) {
                CodeMirror.registerHelper("lint", "_phoenixEmpty", function () {
                    return [];
                });
                delete CodeMirror.lint._phoenixEmpty;
            }
            CodeMirror.defineOption("lint", false, function (editor, value, oldValue) {
                if (oldValue && oldValue !== CodeMirror.Init) {
                    _disableLint(CodeMirror, editor);
                }
                if (!value) {
                    return;
                }
                const configuration = typeof value === "function" ?
                    {getAnnotations: value} :
                    value === true ?
                        {} :
                        value;
                const defaults = {
                    async: false,
                    delay: 500,
                    formatAnnotation: null,
                    getAnnotations: null,
                    highlightLines: false,
                    lintOnChange: true,
                    onUpdateLinting: null,
                    selfContain: null,
                    tooltips: true
                };
                const options = Object.assign({}, defaults);
                const linterOptions = Object.assign(
                    {},
                    configuration && configuration.options || {}
                );
                Object.keys(configuration || {}).forEach(function (name) {
                    if (Object.prototype.hasOwnProperty.call(
                        defaults,
                        name
                    )) {
                        if (configuration[name] !== null) {
                            options[name] = configuration[name];
                        }
                    } else if (!configuration.options) {
                        linterOptions[name] = configuration[name];
                    }
                });
                const state = {
                    annotations: [],
                    changeHandler: null,
                    errorLines: [],
                    grouped: [],
                    hasGutter: (editor.getOption("gutters") || [])
                        .indexOf(LINT_GUTTER_ID) !== -1,
                    linterOptions: linterOptions,
                    marked: [],
                    mouseOverHandler: null,
                    options: options,
                    timeout: null,
                    tooltips: new Set(),
                    waitingFor: 0
                };
                state.changeHandler = function () {
                    const ownerWindow =
                        _documentFor(editor).defaultView || window;
                    state.waitingFor++;
                    _clearLintTooltips(state);
                    ownerWindow.clearTimeout(state.timeout);
                    if (!options.lintOnChange) {
                        return;
                    }
                    state.timeout = ownerWindow.setTimeout(function () {
                        state.timeout = null;
                        _runLint(CodeMirror, editor).catch(function () {});
                    }, options.delay);
                };
                state.mouseOverHandler = function (event) {
                    _handleLintMouseOver(editor, event);
                };
                editor.state.lint = state;
                editor.on("change", state.changeHandler);
                if (options.tooltips !== false) {
                    editor.getWrapperElement().addEventListener(
                        "mouseover",
                        state.mouseOverHandler
                    );
                }
                _runLint(CodeMirror, editor).catch(function () {});
                CodeMirror.signal(editor, "lintStart", editor);
            });
            CodeMirror.defineExtension("performLint", function () {
                const state = this.state.lint;
                if (state) {
                    const ownerWindow =
                        _documentFor(this).defaultView || window;
                    ownerWindow.clearTimeout(state.timeout);
                    state.timeout = null;
                }
                return _runLint(CodeMirror, this);
            });
        });
    }

    function _globalValue(name) {
        return typeof window !== "undefined" ? window[name] : undefined;
    }

    function installCoffeeLint(CodeMirror) {
        return _installOnce(CodeMirror, "coffeeLint", function () {
            CodeMirror.registerHelper(
                "lint",
                "coffeescript",
                function (text) {
                    const engine = _globalValue("coffeelint");
                    if (!engine || typeof engine.lint !== "function") {
                        return [];
                    }
                    try {
                        return engine.lint(text).map(function (error) {
                            return {
                                from: CodeMirror.Pos(
                                    Math.max(0, error.lineNumber - 1),
                                    0
                                ),
                                message: error.message,
                                severity: error.level,
                                to: CodeMirror.Pos(
                                    Math.max(0, error.lineNumber),
                                    0
                                )
                            };
                        });
                    } catch (error) {
                        const location = error.location || {};
                        return [{
                            from: CodeMirror.Pos(
                                location.first_line || 0,
                                location.first_column || 0
                            ),
                            message: error.message,
                            severity: "error",
                            to: CodeMirror.Pos(
                                location.last_line ||
                                    location.first_line ||
                                    0,
                                location.last_column ||
                                    location.first_column ||
                                    0
                            )
                        }];
                    }
                }
            );
        });
    }

    function installCSSLint(CodeMirror) {
        return _installOnce(CodeMirror, "cssLint", function () {
            CodeMirror.registerHelper("lint", "css", function (text, options) {
                const engine = _globalValue("CSSLint");
                if (!engine || typeof engine.verify !== "function") {
                    return [];
                }
                const result = engine.verify(text, options || {});
                return (result.messages || []).map(function (message) {
                    return {
                        from: CodeMirror.Pos(
                            Math.max(0, message.line - 1),
                            Math.max(0, message.col - 1)
                        ),
                        message: message.message,
                        severity: message.type,
                        to: CodeMirror.Pos(
                            Math.max(0, message.line - 1),
                            Math.max(0, message.col)
                        )
                    };
                });
            });
        });
    }

    const HTML_LINT_DEFAULT_RULES = {
        "attr-lowercase": true,
        "attr-no-duplication": true,
        "attr-value-double-quotes": true,
        "doctype-first": false,
        "id-unique": true,
        "spec-char-escape": true,
        "src-not-empty": true,
        "tag-pair": true,
        "tagname-lowercase": true
    };

    function installHTMLLint(CodeMirror) {
        return _installOnce(CodeMirror, "htmlLint", function () {
            CodeMirror.registerHelper("lint", "html", function (text, options) {
                let engine = _globalValue("HTMLHint");
                if (engine && !engine.verify) {
                    engine = engine.default || engine.HTMLHint;
                }
                if (!engine || typeof engine.verify !== "function") {
                    return [];
                }
                const messages = engine.verify(
                    text,
                    options && options.rules || HTML_LINT_DEFAULT_RULES
                );
                return messages.map(function (message) {
                    return {
                        from: CodeMirror.Pos(
                            Math.max(0, message.line - 1),
                            Math.max(0, message.col - 1)
                        ),
                        message: message.message,
                        severity: message.type,
                        to: CodeMirror.Pos(
                            Math.max(0, message.line - 1),
                            Math.max(0, message.col)
                        )
                    };
                });
            });
        });
    }

    function installJavaScriptLint(CodeMirror) {
        return _installOnce(CodeMirror, "javascriptLint", function () {
            CodeMirror.registerHelper(
                "lint",
                "javascript",
                function (text, suppliedOptions) {
                    const engine = _globalValue("JSHINT");
                    if (typeof engine !== "function") {
                        return [];
                    }
                    const options = Object.assign({}, suppliedOptions || {});
                    if (!options.indent) {
                        options.indent = 1;
                    }
                    engine(text, options, options.globals);
                    const data = typeof engine.data === "function" ?
                        engine.data() :
                        {};
                    const errors = data.errors || engine.errors || [];
                    const result = [];
                    errors.forEach(function (error) {
                        if (!error || error.line <= 0) {
                            return;
                        }
                        const start = Math.max(0, error.character - 1);
                        let end = start + 1;
                        if (error.evidence) {
                            const extra = error.evidence
                                .substring(start)
                                .search(/.\b/);
                            if (extra > -1) {
                                end += extra;
                            }
                        }
                        result.push({
                            from: CodeMirror.Pos(error.line - 1, start),
                            message: error.reason,
                            severity: error.code &&
                                error.code.charAt(0) === "W" ?
                                "warning" :
                                "error",
                            to: CodeMirror.Pos(error.line - 1, end)
                        });
                    });
                    return result;
                }
            );
        });
    }

    function _jsonErrorPosition(CodeMirror, text, error) {
        const match = /position\s+(\d+)/i.exec(error && error.message || "");
        if (!match) {
            return CodeMirror.Pos(0, 0);
        }
        const offset = Math.max(0, Number(match[1]) || 0);
        const before = text.slice(0, offset);
        const lines = before.split(/\r\n?|\n/);
        return CodeMirror.Pos(lines.length - 1, lines[lines.length - 1].length);
    }

    function installJSONLint(CodeMirror) {
        return _installOnce(CodeMirror, "jsonLint", function () {
            CodeMirror.registerHelper("lint", "json", function (text) {
                const exported = _globalValue("jsonlint");
                const engine = exported && (exported.parser || exported);
                if (engine && typeof engine.parse === "function") {
                    const found = [];
                    const previous = engine.parseError;
                    engine.parseError = function (message, hash) {
                        const location = hash && hash.loc || {};
                        found.push({
                            from: CodeMirror.Pos(
                                Math.max(0, (location.first_line || 1) - 1),
                                location.first_column || 0
                            ),
                            message: message,
                            to: CodeMirror.Pos(
                                Math.max(0, (location.last_line || 1) - 1),
                                location.last_column ||
                                    location.first_column ||
                                    0
                            )
                        });
                    };
                    try {
                        engine.parse(text);
                    } catch (error) {
                        if (!found.length) {
                            const position = _jsonErrorPosition(
                                CodeMirror,
                                text,
                                error
                            );
                            found.push({
                                from: position,
                                message: error.message,
                                to: position
                            });
                        }
                    } finally {
                        engine.parseError = previous;
                    }
                    return found;
                }
                try {
                    JSON.parse(text);
                    return [];
                } catch (error) {
                    const position = _jsonErrorPosition(
                        CodeMirror,
                        text,
                        error
                    );
                    return [{
                        from: position,
                        message: error.message,
                        to: position
                    }];
                }
            });
        });
    }

    function installYAMLLint(CodeMirror) {
        return _installOnce(CodeMirror, "yamlLint", function () {
            CodeMirror.registerHelper("lint", "yaml", function (text) {
                const engine = _globalValue("jsyaml");
                if (!engine || typeof engine.loadAll !== "function") {
                    return [];
                }
                try {
                    engine.loadAll(text);
                    return [];
                } catch (error) {
                    const mark = error.mark || {};
                    const position = CodeMirror.Pos(
                        mark.line || 0,
                        mark.column || 0
                    );
                    return [{
                        from: position,
                        message: error.message,
                        to: position
                    }];
                }
            });
        });
    }

    function installLoadMode(CodeMirror) {
        return _installOnce(CodeMirror, "loadMode", function () {
            if (!CodeMirror.modeURL) {
                CodeMirror.modeURL = "../mode/%N/%N.js";
            }
            CodeMirror.requireMode = function (modeSpecification, callback, options) {
                const mode = typeof modeSpecification === "string" ?
                    modeSpecification :
                    modeSpecification && modeSpecification.name;
                const done = typeof callback === "function" ?
                    callback :
                    function () {};
                if (!mode) {
                    done(false);
                    return false;
                }
                if (CodeMirror.hasMode(mode) || CodeMirror.loadMode(mode)) {
                    done(true);
                    return true;
                }
                const path = options && typeof options.path === "function" ?
                    options.path(mode) :
                    CodeMirror.modeURL.replace(/%N/g, mode);
                if (options && typeof options.loadMode === "function") {
                    options.loadMode(path, function () {
                        const loaded = CodeMirror.hasMode(mode) ||
                            CodeMirror.loadMode(mode);
                        done(loaded);
                    });
                    return true;
                }
                done(false);
                return false;
            };
            CodeMirror.autoLoadMode = function (editor, mode, options) {
                if (CodeMirror.hasMode(mode) || CodeMirror.loadMode(mode)) {
                    return true;
                }
                return CodeMirror.requireMode(mode, function (loaded) {
                    if (loaded) {
                        editor.setOption(
                            "mode",
                            editor.getOption("mode")
                        );
                    }
                }, options);
            };
        });
    }

    function installMultiplexTest(CodeMirror) {
        return _installOnce(CodeMirror, "multiplexTest", function () {
            // The upstream file is a browser test script rather than an addon.
            // Recognizing it is sufficient; executing its global test harness
            // would be unsafe inside Phoenix.
        });
    }

    function installRunMode(CodeMirror) {
        return _installOnce(CodeMirror, "runModeExtended", function () {
            LegacyAddons.install(
                CodeMirror,
                "addon/runmode/runmode"
            );
        });
    }

    function _nodeText(node, output) {
        if (node.nodeType === 3) {
            output.push(node.nodeValue);
            return;
        }
        for (let child = node.firstChild; child; child = child.nextSibling) {
            _nodeText(child, output);
            if (/^(P|LI|DIV|H[1-6]|PRE|BLOCKQUOTE|TD)$/.test(
                node.nodeName
            )) {
                output.push("\n");
            }
        }
    }

    function installColorize(CodeMirror) {
        installRunMode(CodeMirror);
        return _installOnce(CodeMirror, "colorize", function () {
            CodeMirror.colorize = function (collection, defaultMode) {
                const nodes = collection ||
                    document.body.getElementsByTagName("pre");
                Array.prototype.forEach.call(nodes, function (node) {
                    const mode = node.getAttribute("data-lang") ||
                        defaultMode;
                    if (!mode) {
                        return;
                    }
                    const text = [];
                    _nodeText(node, text);
                    node.textContent = "";
                    CodeMirror.runMode(text.join(""), mode, node);
                    CodeMirror.addClass(node, "cm-s-default");
                });
            };
        });
    }

    function SimpleScrollbarBar(
        CodeMirror,
        className,
        orientation,
        scroll,
        ownerDocument
    ) {
        this.orientation = orientation;
        this.scroll = scroll;
        this.screen = 1;
        this.total = 1;
        this.size = 1;
        this.pos = 0;
        this.ownerDocument = ownerDocument;
        this.node = ownerDocument.createElement("div");
        this.node.className = `${className}-${orientation}`;
        this.inner = this.node.appendChild(
            ownerDocument.createElement("div")
        );
        const axis = orientation === "horizontal" ? "pageX" : "pageY";
        const bar = this;
        CodeMirror.on(this.inner, "mousedown", function (event) {
            if (event.which !== undefined && event.which !== 1) {
                return;
            }
            CodeMirror.e_preventDefault(event);
            const start = event[axis];
            const startPosition = bar.pos;
            const done = function () {
                CodeMirror.off(ownerDocument, "mousemove", move);
                CodeMirror.off(ownerDocument, "mouseup", done);
            };
            const move = function (moveEvent) {
                if (moveEvent.which !== undefined &&
                        moveEvent.which !== 1) {
                    done();
                    return;
                }
                bar.moveTo(
                    startPosition +
                    (moveEvent[axis] - start) * (bar.total / bar.size)
                );
            };
            CodeMirror.on(ownerDocument, "mousemove", move);
            CodeMirror.on(ownerDocument, "mouseup", done);
        });
        CodeMirror.on(this.node, "click", function (event) {
            CodeMirror.e_preventDefault(event);
            const rectangle = bar.inner.getBoundingClientRect();
            let direction = 0;
            if (orientation === "horizontal") {
                direction = event.clientX < rectangle.left ?
                    -1 :
                    event.clientX > rectangle.right ?
                        1 :
                        0;
            } else {
                direction = event.clientY < rectangle.top ?
                    -1 :
                    event.clientY > rectangle.bottom ?
                        1 :
                        0;
            }
            bar.moveTo(bar.pos + direction * bar.screen);
        });
        const onWheel = function (event) {
            const pixels = CodeMirror.wheelEventPixels(event);
            const delta = orientation === "horizontal" ?
                pixels.x :
                pixels.y;
            const oldPosition = bar.pos;
            bar.moveTo(bar.pos + delta);
            if (bar.pos !== oldPosition) {
                CodeMirror.e_preventDefault(event);
            }
        };
        CodeMirror.on(this.node, "wheel", onWheel);
        CodeMirror.on(this.node, "mousewheel", onWheel);
        CodeMirror.on(this.node, "DOMMouseScroll", onWheel);
    }

    SimpleScrollbarBar.prototype.setPos = function (position, force) {
        const maximum = Math.max(0, this.total - this.screen);
        const next = Math.max(0, Math.min(position, maximum));
        if (!force && next === this.pos) {
            return false;
        }
        this.pos = next;
        this.inner.style[
            this.orientation === "horizontal" ? "left" : "top"
        ] = `${next * (this.size / Math.max(1, this.total))}px`;
        return true;
    };

    SimpleScrollbarBar.prototype.moveTo = function (position) {
        if (this.setPos(position)) {
            this.scroll(position, this.orientation);
        }
    };

    SimpleScrollbarBar.prototype.update = function (
        scrollSize,
        clientSize,
        barSize
    ) {
        const changed = this.screen !== clientSize ||
            this.total !== scrollSize ||
            this.size !== barSize;
        this.screen = clientSize;
        this.total = Math.max(1, scrollSize);
        this.size = Math.max(0, barSize);
        let buttonSize = this.screen * (this.size / this.total);
        if (buttonSize < 10) {
            this.size = Math.max(0, this.size - (10 - buttonSize));
            buttonSize = 10;
        }
        this.inner.style[
            this.orientation === "horizontal" ? "width" : "height"
        ] = `${buttonSize}px`;
        this.setPos(this.pos, changed);
    };

    function SimpleScrollbars(
        CodeMirror,
        className,
        place,
        scroll,
        editor
    ) {
        const ownerDocument = _documentFor(editor);
        this.addClass = className;
        this.horiz = new SimpleScrollbarBar(
            CodeMirror,
            className,
            "horizontal",
            scroll,
            ownerDocument
        );
        place(this.horiz.node);
        this.vert = new SimpleScrollbarBar(
            CodeMirror,
            className,
            "vertical",
            scroll,
            ownerDocument
        );
        place(this.vert.node);
        this.width = null;
    }

    SimpleScrollbars.prototype.update = function (measure) {
        if (this.width === null) {
            const ownerWindow =
                this.horiz.ownerDocument.defaultView || window;
            const style = ownerWindow.getComputedStyle ?
                ownerWindow.getComputedStyle(this.horiz.node) :
                this.horiz.node.currentStyle;
            this.width = style ? parseInt(style.height, 10) : 0;
        }
        const width = this.width || 0;
        const needsHorizontal =
            measure.scrollWidth > measure.clientWidth + 1;
        const needsVertical =
            measure.scrollHeight > measure.clientHeight + 1;
        this.vert.node.style.display = needsVertical ? "block" : "none";
        this.horiz.node.style.display =
            needsHorizontal ? "block" : "none";
        if (needsVertical) {
            this.vert.update(
                measure.scrollHeight,
                measure.clientHeight,
                measure.viewHeight - (needsHorizontal ? width : 0)
            );
            this.vert.node.style.bottom =
                needsHorizontal ? `${width}px` : "0";
        }
        if (needsHorizontal) {
            this.horiz.update(
                measure.scrollWidth,
                measure.clientWidth,
                measure.viewWidth - (needsVertical ? width : 0) -
                    (measure.barLeft || 0)
            );
            this.horiz.node.style.right =
                needsVertical ? `${width}px` : "0";
            this.horiz.node.style.left = `${measure.barLeft || 0}px`;
        }
        return {
            bottom: needsHorizontal ? width : 0,
            right: needsVertical ? width : 0
        };
    };

    SimpleScrollbars.prototype.setScrollTop = function (position) {
        this.vert.setPos(position);
    };

    SimpleScrollbars.prototype.setScrollLeft = function (position) {
        this.horiz.setPos(position);
    };

    SimpleScrollbars.prototype.clear = function () {
        _removeNode(this.horiz.node);
        _removeNode(this.vert.node);
    };

    function installSimpleScrollbars(CodeMirror) {
        return _installOnce(CodeMirror, "simpleScrollbars", function () {
            CodeMirror.scrollbarModel.simple = function (
                place,
                scroll,
                editor
            ) {
                return new SimpleScrollbars(
                    CodeMirror,
                    "CodeMirror-simplescroll",
                    place,
                    scroll,
                    editor
                );
            };
            CodeMirror.scrollbarModel.overlay = function (
                place,
                scroll,
                editor
            ) {
                return new SimpleScrollbars(
                    CodeMirror,
                    "CodeMirror-overlayscroll",
                    place,
                    scroll,
                    editor
                );
            };
        });
    }

    function _selectionPointerRectangles(editor) {
        const wrapper = editor.getWrapperElement();
        return Array.prototype.reduce.call(
            wrapper.querySelectorAll(
                ".cm-selectionBackground, .CodeMirror-selected"
            ),
            function (rectangles, node) {
                return rectangles.concat(
                    Array.prototype.slice.call(node.getClientRects())
                );
            },
            []
        );
    }

    function _updateSelectionPointer(editor) {
        const state = editor.state.selectionPointer;
        if (!state) {
            return;
        }
        if (state.rectangles === null && state.mouseX !== null) {
            state.rectangles = editor.somethingSelected() ?
                _selectionPointerRectangles(editor) :
                [];
        }
        const inside = state.mouseX !== null &&
            (state.rectangles || []).some(function (rectangle) {
                return rectangle.left <= state.mouseX &&
                    rectangle.right >= state.mouseX &&
                    rectangle.top <= state.mouseY &&
                    rectangle.bottom >= state.mouseY;
            });
        const lineSpace = editor.getLineSpaceElement ?
            editor.getLineSpaceElement() :
            editor.getWrapperElement();
        lineSpace.style.cursor = inside ? state.value : "";
    }

    function _scheduleSelectionPointer(editor) {
        const state = editor.state.selectionPointer;
        if (!state || state.willUpdate) {
            return;
        }
        state.willUpdate = true;
        window.setTimeout(function () {
            if (editor.state.selectionPointer === state) {
                _updateSelectionPointer(editor);
                state.willUpdate = false;
            }
        }, 50);
    }

    function _resetSelectionPointer(editor) {
        const state = editor.state.selectionPointer;
        if (state) {
            state.rectangles = null;
            _scheduleSelectionPointer(editor);
        }
    }

    function installSelectionPointer(CodeMirror) {
        return _installOnce(CodeMirror, "selectionPointer", function () {
            CodeMirror.defineOption(
                "selectionPointer",
                false,
                function (editor, value) {
                    const previous = editor.state.selectionPointer;
                    const wrapper = editor.getWrapperElement();
                    const lineSpace = editor.getLineSpaceElement ?
                        editor.getLineSpaceElement() :
                        wrapper;
                    if (previous) {
                        CodeMirror.off(
                            wrapper,
                            "mousemove",
                            previous.mousemove
                        );
                        CodeMirror.off(
                            wrapper,
                            "mouseout",
                            previous.mouseout
                        );
                        CodeMirror.off(
                            window,
                            "scroll",
                            previous.windowScroll
                        );
                        editor.off(
                            "cursorActivity",
                            previous.reset
                        );
                        editor.off("scroll", previous.reset);
                        lineSpace.style.cursor = "";
                        editor.state.selectionPointer = null;
                    }
                    if (!value) {
                        return;
                    }
                    const state = {
                        mouseX: null,
                        mouseY: null,
                        rectangles: null,
                        reset: function () {
                            _resetSelectionPointer(editor);
                        },
                        value: typeof value === "string" ?
                            value :
                            "default",
                        willUpdate: false,
                        windowScroll: function () {
                            _resetSelectionPointer(editor);
                        }
                    };
                    state.mousemove = function (event) {
                        if (event.buttons === undefined ?
                            event.which :
                            event.buttons) {
                            state.mouseX = null;
                            state.mouseY = null;
                        } else {
                            state.mouseX = event.clientX;
                            state.mouseY = event.clientY;
                        }
                        _scheduleSelectionPointer(editor);
                    };
                    state.mouseout = function (event) {
                        if (!wrapper.contains(event.relatedTarget)) {
                            state.mouseX = null;
                            state.mouseY = null;
                            _scheduleSelectionPointer(editor);
                        }
                    };
                    editor.state.selectionPointer = state;
                    CodeMirror.on(wrapper, "mousemove", state.mousemove);
                    CodeMirror.on(wrapper, "mouseout", state.mouseout);
                    CodeMirror.on(window, "scroll", state.windowScroll);
                    editor.on("cursorActivity", state.reset);
                    editor.on("scroll", state.reset);
                }
            );
        });
    }

    function _mergeLineKey(line, ignoreWhitespace) {
        return ignoreWhitespace ?
            String(line).replace(/[ \t]/g, "") :
            String(line);
    }

    const MERGE_LCS_CELL_LIMIT = 50000;
    const MERGE_MYERS_TRACE_LIMIT = 50000;
    const MERGE_MYERS_WORK_LIMIT = 1000000;

    function _mergeMyersChunks(
        leftKeys,
        rightKeys,
        leftOffset,
        rightOffset
    ) {
        const trace = [];
        let frontier = new Map([[0, 0]]);
        let traceCells = 0;
        let work = 0;
        const maximumDistance = leftKeys.length + rightKeys.length;

        for (let distance = 0;
            distance <= maximumDistance;
            distance++) {
            const diagonalCount = distance + 1;
            if (traceCells + diagonalCount >
                    MERGE_MYERS_TRACE_LIMIT) {
                return null;
            }
            traceCells += diagonalCount;
            const current = new Map();
            for (let diagonal = -distance;
                diagonal <= distance;
                diagonal += 2) {
                work++;
                if (work > MERGE_MYERS_WORK_LIMIT) {
                    return null;
                }
                let leftIndex;
                if (distance === 0) {
                    leftIndex = 0;
                } else if (diagonal === -distance ||
                        (diagonal !== distance &&
                        frontier.get(diagonal - 1) <
                            frontier.get(diagonal + 1))) {
                    leftIndex = frontier.get(diagonal + 1);
                } else {
                    leftIndex = frontier.get(diagonal - 1) + 1;
                }
                let rightIndex = leftIndex - diagonal;
                while (leftIndex < leftKeys.length &&
                        rightIndex < rightKeys.length &&
                        leftKeys[leftIndex] === rightKeys[rightIndex]) {
                    leftIndex++;
                    rightIndex++;
                    work++;
                    if (work > MERGE_MYERS_WORK_LIMIT) {
                        return null;
                    }
                }
                current.set(diagonal, leftIndex);
                if (leftIndex === leftKeys.length &&
                        rightIndex === rightKeys.length) {
                    trace.push(current);
                    return _mergeMyersTraceToChunks(
                        trace,
                        distance,
                        leftKeys.length,
                        rightKeys.length,
                        leftOffset,
                        rightOffset
                    );
                }
            }
            trace.push(current);
            frontier = current;
        }
        return null;
    }

    function _mergeMyersTraceToChunks(
        trace,
        distance,
        leftLength,
        rightLength,
        leftOffset,
        rightOffset
    ) {
        const edits = [];
        let leftIndex = leftLength;
        let rightIndex = rightLength;
        for (let currentDistance = distance;
            currentDistance > 0;
            currentDistance--) {
            const previous = trace[currentDistance - 1];
            const diagonal = leftIndex - rightIndex;
            let previousDiagonal;
            if (diagonal === -currentDistance ||
                    (diagonal !== currentDistance &&
                    previous.get(diagonal - 1) <
                        previous.get(diagonal + 1))) {
                previousDiagonal = diagonal + 1;
            } else {
                previousDiagonal = diagonal - 1;
            }
            const previousLeft = previous.get(previousDiagonal);
            const previousRight = previousLeft - previousDiagonal;
            if (previousDiagonal === diagonal + 1) {
                edits.push({
                    editFrom: rightOffset + previousRight,
                    editTo: rightOffset + previousRight + 1,
                    origFrom: leftOffset + previousLeft,
                    origTo: leftOffset + previousLeft
                });
            } else {
                edits.push({
                    editFrom: rightOffset + previousRight,
                    editTo: rightOffset + previousRight,
                    origFrom: leftOffset + previousLeft,
                    origTo: leftOffset + previousLeft + 1
                });
            }
            leftIndex = previousLeft;
            rightIndex = previousRight;
        }
        edits.reverse();

        const chunks = [];
        edits.forEach(function (edit) {
            const active = chunks[chunks.length - 1];
            if (active &&
                    active.origTo === edit.origFrom &&
                    active.editTo === edit.editFrom) {
                active.origTo = edit.origTo;
                active.editTo = edit.editTo;
            } else {
                chunks.push(edit);
            }
        });
        return chunks;
    }

    function _diffChunks(leftText, rightText, ignoreWhitespace) {
        const left = String(leftText).split(/\r\n?|\n/);
        const right = String(rightText).split(/\r\n?|\n/);
        const leftKeys = left.map(function (line) {
            return _mergeLineKey(line, ignoreWhitespace);
        });
        const rightKeys = right.map(function (line) {
            return _mergeLineKey(line, ignoreWhitespace);
        });
        if (leftKeys.join("\n") === rightKeys.join("\n")) {
            return [];
        }
        const cells = (left.length + 1) * (right.length + 1);
        if (cells > MERGE_LCS_CELL_LIMIT) {
            let prefix = 0;
            while (prefix < left.length &&
                    prefix < right.length &&
                    leftKeys[prefix] === rightKeys[prefix]) {
                prefix++;
            }
            let leftSuffix = left.length;
            let rightSuffix = right.length;
            while (leftSuffix > prefix &&
                    rightSuffix > prefix &&
                    leftKeys[leftSuffix - 1] ===
                        rightKeys[rightSuffix - 1]) {
                leftSuffix--;
                rightSuffix--;
            }
            const myersChunks = _mergeMyersChunks(
                leftKeys.slice(prefix, leftSuffix),
                rightKeys.slice(prefix, rightSuffix),
                prefix,
                prefix
            );
            if (myersChunks) {
                return myersChunks;
            }
            return [{
                editFrom: prefix,
                editTo: rightSuffix,
                origFrom: prefix,
                origTo: leftSuffix
            }];
        }

        const table = Array.from({length: left.length + 1}, function () {
            return new Uint32Array(right.length + 1);
        });
        for (let leftIndex = left.length - 1; leftIndex >= 0; leftIndex--) {
            for (let rightIndex = right.length - 1;
                rightIndex >= 0;
                rightIndex--) {
                table[leftIndex][rightIndex] =
                    leftKeys[leftIndex] === rightKeys[rightIndex] ?
                        table[leftIndex + 1][rightIndex + 1] + 1 :
                        Math.max(
                            table[leftIndex + 1][rightIndex],
                            table[leftIndex][rightIndex + 1]
                        );
            }
        }

        const chunks = [];
        let leftIndex = 0;
        let rightIndex = 0;
        let active = null;
        const startChunk = function () {
            if (!active) {
                active = {
                    editFrom: rightIndex,
                    editTo: rightIndex,
                    origFrom: leftIndex,
                    origTo: leftIndex
                };
            }
        };
        const finishChunk = function () {
            if (active) {
                chunks.push(active);
                active = null;
            }
        };

        while (leftIndex < left.length || rightIndex < right.length) {
            if (leftIndex < left.length &&
                    rightIndex < right.length &&
                    leftKeys[leftIndex] === rightKeys[rightIndex]) {
                finishChunk();
                leftIndex++;
                rightIndex++;
            } else if (rightIndex < right.length &&
                    (leftIndex === left.length ||
                    table[leftIndex][rightIndex + 1] >=
                        table[leftIndex + 1][rightIndex])) {
                startChunk();
                rightIndex++;
                active.editTo = rightIndex;
            } else {
                startChunk();
                leftIndex++;
                active.origTo = leftIndex;
            }
        }
        finishChunk();
        return chunks;
    }

    function _clearElement(node) {
        if (!node) {
            return;
        }
        while (node.firstChild) {
            node.removeChild(node.firstChild);
        }
    }

    function _clearDiffClasses(diffView) {
        diffView.lineClasses.forEach(function (entry) {
            entry.editor.removeLineClass(
                entry.line,
                entry.location,
                entry.className
            );
        });
        diffView.lineClasses.length = 0;
        diffView.textMarks.forEach(function (marker) {
            marker.clear();
        });
        diffView.textMarks.length = 0;
    }

    function _recordMergeLineClass(
        diffView,
        editor,
        line,
        className
    ) {
        if (line < editor.firstLine() || line > editor.lastLine()) {
            return;
        }
        diffView.classes.classLocation.forEach(function (location) {
            const handle = editor.addLineClass(
                line,
                location,
                className
            );
            if (handle) {
                diffView.lineClasses.push({
                    className: className,
                    editor: editor,
                    line: handle,
                    location: location
                });
            }
        });
    }

    function _markMergeChunkLines(
        diffView,
        editor,
        from,
        to
    ) {
        const classes = diffView.classes;
        if (from === to) {
            const boundaryLine = Math.min(
                Math.max(from, editor.firstLine()),
                editor.lastLine()
            );
            _recordMergeLineClass(
                diffView,
                editor,
                boundaryLine,
                from > editor.firstLine() ? classes.end : classes.start
            );
            return;
        }
        for (let line = from; line < to; line++) {
            _recordMergeLineClass(
                diffView,
                editor,
                line,
                classes.chunk
            );
            if (line === from) {
                _recordMergeLineClass(
                    diffView,
                    editor,
                    line,
                    classes.start
                );
            }
            if (line === to - 1) {
                _recordMergeLineClass(
                    diffView,
                    editor,
                    line,
                    classes.end
                );
            }
        }
    }

    function _markMergeInlineChanges(diffView, chunk) {
        const pairCount = Math.min(
            chunk.editTo - chunk.editFrom,
            chunk.origTo - chunk.origFrom
        );
        for (let offset = 0; offset < pairCount; offset++) {
            const editLineNumber = chunk.editFrom + offset;
            const originalLineNumber = chunk.origFrom + offset;
            const editLine = diffView.edit.getLine(editLineNumber) || "";
            const originalLine =
                diffView.orig.getLine(originalLineNumber) || "";
            if (_mergeLineKey(
                editLine,
                diffView.mv.options.ignoreWhitespace
            ) === _mergeLineKey(
                originalLine,
                diffView.mv.options.ignoreWhitespace
            )) {
                continue;
            }
            let prefix = 0;
            while (prefix < editLine.length &&
                    prefix < originalLine.length &&
                    editLine.charAt(prefix) ===
                        originalLine.charAt(prefix)) {
                prefix++;
            }
            let editSuffix = editLine.length;
            let originalSuffix = originalLine.length;
            while (editSuffix > prefix &&
                    originalSuffix > prefix &&
                    editLine.charAt(editSuffix - 1) ===
                        originalLine.charAt(originalSuffix - 1)) {
                editSuffix--;
                originalSuffix--;
            }
            if (editSuffix > prefix) {
                diffView.textMarks.push(diffView.edit.markText(
                    CodeMirrorPosition(
                        diffView.edit,
                        editLineNumber,
                        prefix
                    ),
                    CodeMirrorPosition(
                        diffView.edit,
                        editLineNumber,
                        editSuffix
                    ),
                    {className: diffView.classes.insert}
                ));
            }
            if (originalSuffix > prefix) {
                diffView.textMarks.push(diffView.orig.markText(
                    CodeMirrorPosition(
                        diffView.orig,
                        originalLineNumber,
                        prefix
                    ),
                    CodeMirrorPosition(
                        diffView.orig,
                        originalLineNumber,
                        originalSuffix
                    ),
                    {className: diffView.classes.del}
                ));
            }
        }
    }

    function _markDiffLines(diffView) {
        _clearDiffClasses(diffView);
        if (!diffView.showDifferences) {
            return;
        }
        diffView.chunks.forEach(function (chunk) {
            _markMergeChunkLines(
                diffView,
                diffView.edit,
                chunk.editFrom,
                chunk.editTo
            );
            _markMergeChunkLines(
                diffView,
                diffView.orig,
                chunk.origFrom,
                chunk.origTo
            );
            _markMergeInlineChanges(diffView, chunk);
        });
    }

    function _mergeChunkStart(editor, from, to) {
        if (to > editor.lastLine()) {
            return CodeMirrorPosition(
                editor,
                Math.max(editor.firstLine(), from - 1)
            );
        }
        return CodeMirrorPosition(editor, from, 0);
    }

    function _copyMergeChunk(diffView, to, from, chunk) {
        if (diffView.diffOutOfDate) {
            return;
        }
        const originalStart = _mergeChunkStart(
            from,
            chunk.origFrom,
            chunk.origTo
        );
        const originalEnd = CodeMirrorPosition(
            from,
            chunk.origTo,
            0
        );
        const editStart = _mergeChunkStart(
            to,
            chunk.editFrom,
            chunk.editTo
        );
        const editEnd = CodeMirrorPosition(
            to,
            chunk.editTo,
            0
        );
        const handler = diffView.mv.options.revertChunk;
        if (typeof handler === "function") {
            handler(
                diffView.mv,
                from,
                originalStart,
                originalEnd,
                to,
                editStart,
                editEnd
            );
        } else {
            to.replaceRange(
                from.getRange(originalStart, originalEnd),
                editStart,
                editEnd
            );
        }
    }

    function _mergeChunkTop(editor, from, to) {
        const line = from === to && from > editor.lastLine() ?
            editor.lastLine() + 1 :
            from;
        return editor.heightAtLine(line, "local");
    }

    function _mergeSvgPath(diffView, chunk) {
        if (!diffView.svg || !diffView.gap) {
            return;
        }
        const ownerDocument = diffView.gap.ownerDocument;
        const width = diffView.gap.offsetWidth || 1;
        let originalTop = _mergeChunkTop(
            diffView.orig,
            chunk.origFrom,
            chunk.origTo
        );
        let originalBottom = diffView.orig.heightAtLine(
            chunk.origTo,
            "local"
        );
        let editTop = _mergeChunkTop(
            diffView.edit,
            chunk.editFrom,
            chunk.editTo
        );
        let editBottom = diffView.edit.heightAtLine(
            chunk.editTo,
            "local"
        );
        if (diffView.type === "left") {
            const top = originalTop;
            const bottom = originalBottom;
            originalTop = editTop;
            originalBottom = editBottom;
            editTop = top;
            editBottom = bottom;
        }
        const path = ownerDocument.createElementNS(
            "http://www.w3.org/2000/svg",
            "path"
        );
        path.setAttribute(
            "d",
            `M -1 ${editTop} C ${width / 2} ${editTop} ` +
                `${width / 2} ${originalTop} ${width + 2} ${originalTop} ` +
                `L ${width + 2} ${originalBottom} ` +
                `C ${width / 2} ${originalBottom} ` +
                `${width / 2} ${editBottom} -1 ${editBottom} z`
        );
        path.setAttribute("class", diffView.classes.connect);
        diffView.svg.appendChild(path);
    }

    function _mergeButton(diffView, chunk, reverse) {
        const ownerDocument = diffView.gap.ownerDocument;
        const button = ownerDocument.createElement("div");
        button.className = reverse ?
            "CodeMirror-merge-copy-reverse" :
            "CodeMirror-merge-copy";
        const pointsRight = reverse ?
            diffView.type === "right" :
            diffView.type === "left";
        button.textContent = pointsRight ? "\u21dd" : "\u21dc";
        button.chunk = chunk;
        button.mergeReverse = reverse;
        button.setAttribute("role", "button");
        button.setAttribute("tabindex", "0");
        button.title = diffView.edit.phrase(
            reverse ?
                "Push to right" :
                diffView.mv.options.allowEditingOriginals ?
                    "Push to left" :
                    "Revert chunk"
        );
        button.setAttribute("aria-label", button.title);
        const topEditor = reverse ? diffView.edit : diffView.orig;
        const topFrom = reverse ? chunk.editFrom : chunk.origFrom;
        const topTo = reverse ? chunk.editTo : chunk.origTo;
        button.style.top = `${_mergeChunkTop(
            topEditor,
            topFrom,
            topTo
        )}px`;
        if (reverse) {
            if (diffView.type === "right") {
                button.style.left = "2px";
            } else {
                button.style.right = "2px";
            }
        }
        return button;
    }

    function _renderMergeGap(diffView) {
        if (!diffView.gap) {
            return;
        }
        _clearElement(diffView.copyButtons);
        _clearElement(diffView.svg);
        if (!diffView.showDifferences) {
            return;
        }
        if (diffView.svg) {
            diffView.svg.setAttribute(
                "width",
                diffView.gap.offsetWidth || 1
            );
            diffView.svg.setAttribute(
                "height",
                diffView.gap.offsetHeight || 1
            );
        }
        diffView.chunks.forEach(function (chunk) {
            _mergeSvgPath(diffView, chunk);
            if (diffView.copyButtons) {
                diffView.copyButtons.appendChild(
                    _mergeButton(diffView, chunk, false)
                );
                if (diffView.mv.options.allowEditingOriginals) {
                    diffView.copyButtons.appendChild(
                        _mergeButton(diffView, chunk, true)
                    );
                }
            }
        });
    }

    function _clearMergeAligners(mergeView) {
        (mergeView.aligners || []).forEach(function (widget) {
            widget.clear();
        });
        mergeView.aligners = [];
    }

    function _mergeSpacer(editor, line, height) {
        if (height <= 1) {
            return null;
        }
        const ownerDocument = _documentFor(editor);
        const node = ownerDocument.createElement("div");
        node.className = "CodeMirror-merge-spacer";
        node.style.height = `${height}px`;
        node.style.minWidth = "1px";
        const above = line <= editor.lastLine();
        const targetLine = Math.min(
            Math.max(line, editor.firstLine()),
            editor.lastLine()
        );
        return editor.addLineWidget(targetLine, node, {
            above: above,
            handleMouseEvents: true,
            height: height,
            mergeSpacer: true
        });
    }

    function _alignMergeView(mergeView) {
        _clearMergeAligners(mergeView);
        if (mergeView.options.connect !== "align") {
            return;
        }
        [mergeView.left, mergeView.right].forEach(function (diffView) {
            if (!diffView) {
                return;
            }
            diffView.chunks.forEach(function (chunk) {
                const editTop = diffView.edit.heightAtLine(
                    chunk.editFrom,
                    "local"
                );
                const originalTop = diffView.orig.heightAtLine(
                    chunk.origFrom,
                    "local"
                );
                const difference = editTop - originalTop;
                const widget = difference > 1 ?
                    _mergeSpacer(
                        diffView.orig,
                        chunk.origFrom,
                        difference
                    ) :
                    difference < -1 ?
                        _mergeSpacer(
                            diffView.edit,
                            chunk.editFrom,
                            -difference
                        ) :
                        null;
                if (widget) {
                    mergeView.aligners.push(widget);
                }
            });
        });
    }

    function _syncMergeScroll(diffView, toOriginal) {
        if (!diffView.lockScroll || diffView.syncingScroll) {
            return;
        }
        const source = toOriginal ? diffView.edit : diffView.orig;
        const target = toOriginal ? diffView.orig : diffView.edit;
        const now = Date.now();
        if (source.state.mergeScrollSetBy === diffView &&
                source.state.mergeScrollSetAt + 250 > now) {
            return;
        }
        const sourceInfo = source.getScrollInfo();
        const targetInfo = target.getScrollInfo();
        const sourceRange = Math.max(
            0,
            sourceInfo.height - sourceInfo.clientHeight
        );
        const targetRange = Math.max(
            0,
            targetInfo.height - targetInfo.clientHeight
        );
        const ratio = sourceRange ?
            sourceInfo.top / sourceRange :
            0;
        diffView.syncingScroll = true;
        target.scrollTo(sourceInfo.left, ratio * targetRange);
        target.state.mergeScrollSetAt = now;
        target.state.mergeScrollSetBy = diffView;
        diffView.syncingScroll = false;
    }

    function _setMergeScrollLock(diffView, value, synchronize) {
        diffView.lockScroll = Boolean(value);
        if (diffView.lockButton) {
            const method = diffView.lockScroll ?
                CodeMirrorSafeAddClass :
                CodeMirrorSafeRemoveClass;
            method(
                diffView.lockButton,
                "CodeMirror-merge-scrolllock-enabled"
            );
        }
        if (diffView.lockScroll && synchronize !== false) {
            _syncMergeScroll(diffView, true);
        }
    }

    function _initializeMergeGap(diffView, gap) {
        const CodeMirror = diffView.mv.CodeMirror;
        const ownerDocument = gap.ownerDocument;
        diffView.gap = gap;
        const lock = ownerDocument.createElement("div");
        lock.className = "CodeMirror-merge-scrolllock";
        lock.title = diffView.edit.phrase("Toggle locked scrolling");
        lock.setAttribute("aria-label", lock.title);
        lock.setAttribute("role", "button");
        lock.setAttribute("tabindex", "0");
        const lockWrapper = ownerDocument.createElement("div");
        lockWrapper.className = "CodeMirror-merge-scrolllock-wrap";
        lockWrapper.appendChild(lock);
        gap.appendChild(lockWrapper);
        diffView.lockButton = lock;
        diffView.lockHandler = function (event) {
            if (event.type === "click" ||
                    event.key === "Enter" ||
                    event.code === "Space") {
                _setMergeScrollLock(
                    diffView,
                    !diffView.lockScroll
                );
            }
        };
        CodeMirror.on(lock, "click", diffView.lockHandler);
        CodeMirror.on(lock, "keyup", diffView.lockHandler);

        if (diffView.mv.options.revertButtons !== false) {
            const copyButtons = ownerDocument.createElement("div");
            copyButtons.className =
                `CodeMirror-merge-copybuttons-${diffView.type}`;
            diffView.copyButtons = copyButtons;
            diffView.copyHandler = function (event) {
                if (event.type === "keyup" &&
                        event.key !== "Enter" &&
                        event.code !== "Space") {
                    return;
                }
                const button = event.target;
                if (!button || !button.chunk) {
                    return;
                }
                if (button.mergeReverse) {
                    _copyMergeChunk(
                        diffView,
                        diffView.orig,
                        diffView.edit,
                        {
                            editFrom: button.chunk.origFrom,
                            editTo: button.chunk.origTo,
                            origFrom: button.chunk.editFrom,
                            origTo: button.chunk.editTo
                        }
                    );
                } else {
                    _copyMergeChunk(
                        diffView,
                        diffView.edit,
                        diffView.orig,
                        button.chunk
                    );
                }
            };
            CodeMirror.on(copyButtons, "click", diffView.copyHandler);
            CodeMirror.on(copyButtons, "keyup", diffView.copyHandler);
            gap.insertBefore(copyButtons, lockWrapper);
        }

        if (diffView.mv.options.connect !== "align" &&
                typeof ownerDocument.createElementNS === "function") {
            const svg = ownerDocument.createElementNS(
                "http://www.w3.org/2000/svg",
                "svg"
            );
            diffView.svg = svg;
            gap.appendChild(svg);
        }
        _setMergeScrollLock(diffView, true, false);
        _renderMergeGap(diffView);
    }

    function _clearMergeCollapses(mergeView) {
        const marks = mergeView.collapsedMarks || [];
        mergeView.collapsedMarks = [];
        marks.forEach(function (marker) {
            if (marker.mergeCollapsedEditor) {
                marker.mergeCollapsedEditor.removeLineClass(
                    marker.mergeCollapsedLine,
                    "wrap",
                    "CodeMirror-merge-collapsed-line"
                );
            }
            marker.clear();
        });
    }

    function _refreshDiffView(diffView) {
        const CodeMirror = diffView.mv.CodeMirror;
        diffView.chunks = _diffChunks(
            diffView.orig.getValue(),
            diffView.edit.getValue(),
            diffView.mv.options.ignoreWhitespace
        );
        diffView.diff = diffView.chunks;
        diffView.diffOutOfDate = false;
        _markDiffLines(diffView);
        _renderMergeGap(diffView);
        CodeMirror.signal(
            diffView.edit,
            "updateDiff",
            diffView.diff
        );
        if (diffView.mv.options.connect === "align") {
            _alignMergeView(diffView.mv);
        }
    }

    function CompatDiffView(mergeView, type, originalEditor) {
        const CodeMirror = mergeView.CodeMirror;
        this.mv = mergeView;
        this.type = type;
        this.edit = mergeView.edit;
        this.orig = originalEditor;
        this.chunks = [];
        this.diff = [];
        this.diffOutOfDate = false;
        this.lineClasses = [];
        this.textMarks = [];
        this.classes = type === "left" ?
            {
                chunk: "CodeMirror-merge-l-chunk",
                connect: "CodeMirror-merge-l-connect",
                del: "CodeMirror-merge-l-deleted",
                end: "CodeMirror-merge-l-chunk-end",
                insert: "CodeMirror-merge-l-inserted",
                start: "CodeMirror-merge-l-chunk-start"
            } :
            {
                chunk: "CodeMirror-merge-r-chunk",
                connect: "CodeMirror-merge-r-connect",
                del: "CodeMirror-merge-r-deleted",
                end: "CodeMirror-merge-r-chunk-end",
                insert: "CodeMirror-merge-r-inserted",
                start: "CodeMirror-merge-r-chunk-start"
            };
        const classLocation = mergeView.options.chunkClassLocation ||
            "background";
        this.classes.classLocation = Array.isArray(classLocation) ?
            classLocation.slice() :
            [classLocation];
        this.showDifferences = mergeView.options.showDifferences !== false;
        const diffView = this;
        this.changeHandler = function () {
            _clearMergeCollapses(diffView.mv);
            diffView.diffOutOfDate = true;
            _refreshDiffView(diffView);
        };
        this.editScrollHandler = function () {
            _syncMergeScroll(diffView, true);
            _renderMergeGap(diffView);
        };
        this.originalScrollHandler = function () {
            _syncMergeScroll(diffView, false);
            _renderMergeGap(diffView);
        };
        this.resizeHandler = function () {
            _renderMergeGap(diffView);
            _alignMergeView(diffView.mv);
        };
        this.edit.on("change", this.changeHandler);
        this.orig.on("change", this.changeHandler);
        this.edit.on("scroll", this.editScrollHandler);
        this.orig.on("scroll", this.originalScrollHandler);
        CodeMirror.on(
            mergeView.ownerWindow,
            "resize",
            this.resizeHandler
        );
        this.edit.state.diffViews =
            (this.edit.state.diffViews || []).concat(this);
        this.orig.state.diffViews =
            (this.orig.state.diffViews || []).concat(this);
        _refreshDiffView(this);
    }

    CompatDiffView.prototype.setShowDifferences = function (value) {
        this.showDifferences = value !== false;
        _markDiffLines(this);
        _renderMergeGap(this);
    };

    CompatDiffView.prototype.destroy = function () {
        const CodeMirror = this.mv.CodeMirror;
        this.edit.off("change", this.changeHandler);
        this.orig.off("change", this.changeHandler);
        this.edit.off("scroll", this.editScrollHandler);
        this.orig.off("scroll", this.originalScrollHandler);
        CodeMirror.off(
            this.mv.ownerWindow,
            "resize",
            this.resizeHandler
        );
        if (this.lockButton) {
            CodeMirror.off(
                this.lockButton,
                "click",
                this.lockHandler
            );
            CodeMirror.off(
                this.lockButton,
                "keyup",
                this.lockHandler
            );
        }
        if (this.copyButtons) {
            CodeMirror.off(
                this.copyButtons,
                "click",
                this.copyHandler
            );
            CodeMirror.off(
                this.copyButtons,
                "keyup",
                this.copyHandler
            );
        }
        _clearDiffClasses(this);
        this.edit.state.diffViews = (this.edit.state.diffViews || [])
            .filter(function (candidate) {
                return candidate !== this;
            }, this);
        this.orig.state.diffViews = (this.orig.state.diffViews || [])
            .filter(function (candidate) {
                return candidate !== this;
            }, this);
    };

    function _matchingOriginalLine(editLine, chunks) {
        let editStart = 0;
        let originalStart = 0;
        for (let index = 0; index < chunks.length; index++) {
            const chunk = chunks[index];
            if (chunk.editTo > editLine &&
                    chunk.editFrom <= editLine) {
                return null;
            }
            if (chunk.editFrom > editLine) {
                break;
            }
            editStart = chunk.editTo;
            originalStart = chunk.origTo;
        }
        return originalStart + editLine - editStart;
    }

    function _collapseMergeRange(
        mergeView,
        editor,
        from,
        to
    ) {
        const CodeMirror = mergeView.CodeMirror;
        const ownerDocument = _documentFor(editor);
        const widget = ownerDocument.createElement("span");
        widget.className = "CodeMirror-merge-collapsed-widget";
        widget.title = editor.phrase(
            "Identical text collapsed. Click to expand."
        );
        editor.addLineClass(
            from,
            "wrap",
            "CodeMirror-merge-collapsed-line"
        );
        const marker = editor.markText(
            CodeMirrorPosition(editor, from, 0),
            CodeMirrorPosition(editor, to - 1),
            {
                clearOnEnter: true,
                collapsed: true,
                inclusiveLeft: true,
                inclusiveRight: true,
                replacedWith: widget
            }
        );
        marker.mergeCollapsedLine = from;
        marker.mergeCollapsedEditor = editor;
        const clear = function () {
            _clearMergeCollapses(mergeView);
        };
        CodeMirror.on(widget, "click", clear);
        return marker;
    }

    function _collapseIdenticalStretches(mergeView, suppliedMargin) {
        const margin = typeof suppliedMargin === "number" ?
            suppliedMargin :
            2;
        const editor = mergeView.edit;
        const clear = [];
        for (let line = editor.firstLine();
            line <= editor.lastLine();
            line++) {
            clear[line - editor.firstLine()] = true;
        }
        [mergeView.left, mergeView.right].forEach(function (diffView) {
            if (!diffView) {
                return;
            }
            diffView.chunks.forEach(function (chunk) {
                const from = Math.max(
                    editor.firstLine(),
                    chunk.editFrom - margin
                );
                const to = Math.min(
                    editor.lastLine() + 1,
                    chunk.editTo + margin
                );
                for (let line = from; line < to; line++) {
                    clear[line - editor.firstLine()] = false;
                }
            });
        });
        for (let index = 0; index < clear.length; index++) {
            if (!clear[index]) {
                continue;
            }
            const startIndex = index;
            while (index + 1 < clear.length && clear[index + 1]) {
                index++;
            }
            const size = index - startIndex + 1;
            if (size <= margin) {
                continue;
            }
            const editLine = startIndex + editor.firstLine();
            const marks = [
                _collapseMergeRange(
                    mergeView,
                    editor,
                    editLine,
                    editLine + size
                )
            ];
            [mergeView.left, mergeView.right].forEach(function (diffView) {
                if (!diffView) {
                    return;
                }
                const originalLine = _matchingOriginalLine(
                    editLine,
                    diffView.chunks
                );
                if (originalLine !== null) {
                    marks.push(_collapseMergeRange(
                        mergeView,
                        diffView.orig,
                        originalLine,
                        originalLine + size
                    ));
                }
            });
            mergeView.collapsedMarks =
                mergeView.collapsedMarks.concat(marks);
            if (typeof mergeView.options.onCollapse === "function") {
                mergeView.options.onCollapse(
                    mergeView,
                    editLine,
                    size,
                    marks[0]
                );
            }
        }
    }

    function _mergeEditorOptions(options, value, original) {
        const omitted = new Set([
            "allowEditingOriginals",
            "chunkClassLocation",
            "collapseIdentical",
            "connect",
            "ignoreWhitespace",
            "onCollapse",
            "orig",
            "origLeft",
            "origRight",
            "revertButtons",
            "revertChunk",
            "showDifferences"
        ]);
        const result = {};
        Object.keys(options || {}).forEach(function (name) {
            if (!omitted.has(name)) {
                result[name] = options[name];
            }
        });
        result.value = value === null || value === undefined ?
            "" :
            value;
        if (original && !options.allowEditingOriginals) {
            result.readOnly = true;
        }
        return result;
    }

    function _mergePane(ownerDocument, className) {
        const pane = ownerDocument.createElement("div");
        pane.className = className;
        return pane;
    }

    function _nearbyDiff(CodeMirror, editor, direction) {
        const views = editor.state.diffViews || [];
        const start = editor.getCursor().line;
        let found = null;
        views.forEach(function (diffView) {
            if (diffView.diffOutOfDate) {
                _refreshDiffView(diffView);
            }
            const original = editor === diffView.orig;
            diffView.chunks.forEach(function (chunk) {
                const line = original ?
                    direction < 0 ?
                        chunk.origTo - 1 :
                        chunk.origFrom :
                    direction < 0 ?
                        chunk.editTo - 1 :
                        chunk.editFrom;
                if (direction < 0 && line < start &&
                        (found === null || line > found)) {
                    found = line;
                }
                if (direction > 0 && line > start &&
                        (found === null || line < found)) {
                    found = line;
                }
            });
        });
        if (found === null) {
            return CodeMirror.Pass;
        }
        editor.setCursor(found, 0);
        return true;
    }

    function installMerge(CodeMirror) {
        return _installOnce(CodeMirror, "merge", function () {
            function MergeView(node, suppliedOptions) {
                if (!(this instanceof MergeView)) {
                    return new MergeView(node, suppliedOptions);
                }
                const options = suppliedOptions || {};
                const ownerDocument = node.ownerDocument || document;
                const originalRight = options.origRight === undefined ?
                    options.orig :
                    options.origRight;
                const hasLeft = options.origLeft !== undefined &&
                    options.origLeft !== null;
                const hasRight = originalRight !== undefined &&
                    originalRight !== null;
                const paneCount = 1 + Number(hasLeft) + Number(hasRight);
                this.CodeMirror = CodeMirror;
                this.options = options;
                this.ownerWindow = ownerDocument.defaultView || window;
                this.left = null;
                this.right = null;
                this.aligners = [];
                this.collapsedMarks = [];
                this.wrap = ownerDocument.createElement("div");
                this.wrap.className =
                    `CodeMirror-merge CodeMirror-merge-${paneCount}pane`;
                node.appendChild(this.wrap);

                let leftPane;
                let rightPane;
                if (hasLeft) {
                    leftPane = _mergePane(
                        ownerDocument,
                        "CodeMirror-merge-pane CodeMirror-merge-left"
                    );
                    this.wrap.appendChild(leftPane);
                    this.leftGap = _mergePane(
                        ownerDocument,
                        "CodeMirror-merge-gap CodeMirror-merge-gap-left"
                    );
                    this.wrap.appendChild(this.leftGap);
                }
                const editPane = _mergePane(
                    ownerDocument,
                    "CodeMirror-merge-pane CodeMirror-merge-editor"
                );
                this.wrap.appendChild(editPane);
                if (hasRight) {
                    this.rightGap = _mergePane(
                        ownerDocument,
                        "CodeMirror-merge-gap CodeMirror-merge-gap-right"
                    );
                    this.wrap.appendChild(this.rightGap);
                    rightPane = _mergePane(
                        ownerDocument,
                        "CodeMirror-merge-pane CodeMirror-merge-right " +
                            "CodeMirror-merge-pane-rightmost"
                    );
                    this.wrap.appendChild(rightPane);
                } else {
                    CodeMirror.addClass(
                        editPane,
                        "CodeMirror-merge-pane-rightmost"
                    );
                }

                this.edit = CodeMirror(
                    editPane,
                    _mergeEditorOptions(options, options.value, false)
                );
                if (hasLeft) {
                    const original = CodeMirror(
                        leftPane,
                        _mergeEditorOptions(
                            options,
                            options.origLeft,
                            true
                        )
                    );
                    this.left = new CompatDiffView(
                        this,
                        "left",
                        original
                    );
                    _initializeMergeGap(this.left, this.leftGap);
                }
                if (hasRight) {
                    const original = CodeMirror(
                        rightPane,
                        _mergeEditorOptions(
                            options,
                            originalRight,
                            true
                        )
                    );
                    this.right = new CompatDiffView(
                        this,
                        "right",
                        original
                    );
                    _initializeMergeGap(this.right, this.rightGap);
                }
                if (options.collapseIdentical) {
                    this.edit.operation(function () {
                        _collapseIdenticalStretches(
                            this,
                            options.collapseIdentical
                        );
                    }.bind(this));
                }
            }

            MergeView.prototype.editor = function () {
                return this.edit;
            };
            MergeView.prototype.rightOriginal = function () {
                return this.right && this.right.orig;
            };
            MergeView.prototype.leftOriginal = function () {
                return this.left && this.left.orig;
            };
            MergeView.prototype.setShowDifferences = function (value) {
                if (this.right) {
                    this.right.setShowDifferences(value);
                }
                if (this.left) {
                    this.left.setShowDifferences(value);
                }
            };
            MergeView.prototype.rightChunks = function () {
                if (this.right) {
                    if (this.right.diffOutOfDate) {
                        _refreshDiffView(this.right);
                    }
                    return this.right.chunks;
                }
            };
            MergeView.prototype.leftChunks = function () {
                if (this.left) {
                    if (this.left.diffOutOfDate) {
                        _refreshDiffView(this.left);
                    }
                    return this.left.chunks;
                }
            };
            MergeView.prototype.destroy = function () {
                _clearMergeCollapses(this);
                _clearMergeAligners(this);
                if (this.left) {
                    this.left.destroy();
                    this.left.orig.destroy();
                }
                if (this.right) {
                    this.right.destroy();
                    this.right.orig.destroy();
                }
                this.edit.destroy();
                _removeNode(this.wrap);
            };

            CodeMirror.MergeView = MergeView;
            CodeMirror.commands.goNextDiff = function (editor) {
                return _nearbyDiff(CodeMirror, editor, 1);
            };
            CodeMirror.commands.goPrevDiff = function (editor) {
                return _nearbyDiff(CodeMirror, editor, -1);
            };
        });
    }

    function _ternDocValue(server, entry) {
        let value = entry.doc.getValue();
        if (typeof server.options.fileFilter === "function") {
            value = server.options.fileFilter(
                value,
                entry.name,
                entry.doc
            );
        }
        return value;
    }

    function _ternDocument(value) {
        return value && typeof value.getDoc === "function" ?
            value.getDoc() :
            value;
    }

    function _ternFindDoc(server, value, suppliedName) {
        const doc = _ternDocument(value);
        if (typeof value === "string") {
            return server.docs[value];
        }
        const names = Object.keys(server.docs);
        for (let index = 0; index < names.length; index++) {
            if (server.docs[names[index]].doc === doc) {
                return server.docs[names[index]];
            }
        }
        if (!doc || typeof doc.getValue !== "function") {
            return null;
        }
        let name = suppliedName;
        if (!name) {
            let suffix = 0;
            do {
                name = `[doc${suffix || ""}]`;
                suffix++;
            } while (server.docs[name]);
        }
        return server.addDoc(name, doc);
    }

    function _ternResolveDoc(server, value) {
        if (typeof value === "string") {
            return server.docs[value];
        }
        return _ternFindDoc(server, value);
    }

    function _ternCloseArgHints(server) {
        if (!server.activeArgHints) {
            return;
        }
        const tooltip = server.activeArgHints;
        if (typeof tooltip.clear === "function") {
            tooltip.clear();
        }
        server.activeArgHints = null;
        _ternRemoveTooltip(server, tooltip);
    }

    function _ternTrackChange(server, doc, change) {
        const entry = _ternFindDoc(server, doc);
        if (!entry) {
            return;
        }
        const cached = server.cachedArgHints;
        if (cached && cached.doc === doc && change &&
                CodeMirrorCmpPos(cached.start, change.to) >= 0) {
            server.cachedArgHints = null;
        }
        if (!change) {
            entry.changed = {
                from: 0,
                to: entry.doc.lineCount()
            };
            return;
        }
        const insertedLineCount = Array.isArray(change.text) ?
            change.text.length :
            String(change.text || "").split(/\r\n?|\n/).length;
        const end = change.from.line +
            Math.max(0, insertedLineCount - 1);
        if (!entry.changed) {
            entry.changed = {
                from: change.from.line,
                to: end + 1
            };
            return;
        }
        entry.changed.from = Math.min(
            entry.changed.from,
            change.from.line
        );
        entry.changed.to = Math.max(
            entry.changed.to -
                Math.max(0, change.to.line - end),
            end + 1
        );
    }

    function CodeMirrorCmpPos(left, right) {
        return left.line - right.line || left.ch - right.ch;
    }

    function _ternSendDoc(server, entry) {
        server.server.request({
            files: [{
                name: entry.name,
                text: _ternDocValue(server, entry),
                type: "full"
            }]
        }, function (error) {
            if (!error) {
                entry.changed = null;
            }
        });
    }

    function _ternUnavailableServer() {
        const files = Object.create(null);
        return {
            addFile: function (name, text) {
                files[name] = text;
            },
            delFile: function (name) {
                delete files[name];
            },
            request: function (_body, callback) {
                const error = new Error(
                    "Tern is unavailable in this Phoenix runtime."
                );
                error.code = "PHOENIX_TERN_UNAVAILABLE";
                callback(error);
            }
        };
    }

    function _ternWorkerServer(server) {
        if (typeof Worker !== "function" || !server.options.workerScript) {
            return _ternUnavailableServer();
        }
        const worker = new Worker(server.options.workerScript);
        server.worker = worker;
        let nextId = 0;
        const pending = {};
        const send = function (data, callback) {
            if (callback) {
                data.id = ++nextId;
                pending[data.id] = callback;
            }
            worker.postMessage(data);
        };
        worker.postMessage({
            defs: server.options.defs,
            plugins: server.options.plugins,
            scripts: server.options.workerDeps,
            type: "init"
        });
        worker.onmessage = function (event) {
            const data = event.data || {};
            if (data.type === "getFile") {
                const entry = server.docs[data.name];
                if (entry) {
                    send({
                        err: null,
                        id: data.id,
                        text: _ternDocValue(server, entry),
                        type: "getFile"
                    });
                } else if (typeof server.options.getFile === "function") {
                    server.options.getFile(data.name, function (
                        error,
                        text
                    ) {
                        if (arguments.length === 1) {
                            text = error;
                            error = null;
                        }
                        send({
                            err: error ? String(error) : null,
                            id: data.id,
                            text: text,
                            type: "getFile"
                        });
                    });
                } else {
                    send({
                        err: null,
                        id: data.id,
                        text: null,
                        type: "getFile"
                    });
                }
            } else if (data.id && pending[data.id]) {
                pending[data.id](data.err, data.body);
                delete pending[data.id];
            }
        };
        worker.onerror = function (error) {
            Object.keys(pending).forEach(function (id) {
                pending[id](error);
                delete pending[id];
            });
        };
        return {
            addFile: function (name, text) {
                send({name: name, text: text, type: "add"});
            },
            delFile: function (name) {
                send({name: name, type: "del"});
            },
            request: function (body, callback) {
                send({body: body, type: "req"}, callback);
            }
        };
    }

    function _ternRequestBody(server, editor, query, position) {
        const entry = _ternFindDoc(server, editor.getDoc());
        const queryObject = typeof query === "string" ?
            {type: query} :
            Object.assign({}, query || {});
        const fullDocuments = Boolean(queryObject.fullDocs);
        delete queryObject.fullDocs;
        queryObject.lineCharPositions = true;
        if (queryObject.end === null ||
                queryObject.end === undefined) {
            const cursor = position || editor.getCursor("end");
            queryObject.end = {
                ch: cursor.ch,
                line: cursor.line
            };
            if (editor.somethingSelected()) {
                const start = editor.getCursor("start");
                queryObject.start = {
                    ch: start.ch,
                    line: start.line
                };
            }
        }
        queryObject.file = entry.name;
        const files = [];
        if (entry.changed || fullDocuments) {
            files.push({
                name: entry.name,
                text: _ternDocValue(server, entry),
                type: "full"
            });
            entry.changed = null;
        }
        Object.keys(server.docs).forEach(function (name) {
            const other = server.docs[name];
            if (other !== entry && other.changed) {
                files.push({
                    name: other.name,
                    text: _ternDocValue(server, other),
                    type: "full"
                });
                other.changed = null;
            }
        });
        const request = {
            files: files,
            query: queryObject
        };
        const extra = server.options.queryOptions &&
            server.options.queryOptions[queryObject.type];
        if (extra) {
            Object.assign(queryObject, extra);
        }
        return request;
    }

    function _ternTypeClass(type) {
        let suffix;
        if (type === "?") {
            suffix = "unknown";
        } else if (type === "number" ||
                type === "string" ||
                type === "bool") {
            suffix = type;
        } else if (/^fn\(/.test(type || "")) {
            suffix = "fn";
        } else if (/^\[/.test(type || "")) {
            suffix = "array";
        } else {
            suffix = "object";
        }
        return "CodeMirror-Tern-completion " +
            `CodeMirror-Tern-completion-${suffix}`;
    }

    function _ternRemoveTooltip(server, tooltip) {
        if (!tooltip) {
            return;
        }
        if (typeof tooltip.clearActivity === "function") {
            tooltip.clearActivity();
        }
        window.clearTimeout(tooltip.removeTimer);
        _removeNode(tooltip);
        server.tooltips = server.tooltips.filter(function (candidate) {
            return candidate !== tooltip;
        });
        if (tooltip.editor &&
                tooltip.editor.state.ternTooltip === tooltip) {
            tooltip.editor.state.ternTooltip = null;
        }
    }

    function _ternOnEditorActivity(editor, callback) {
        ["cursorActivity", "blur", "scroll", "setDoc"].forEach(
            function (eventName) {
                editor.on(eventName, callback);
            }
        );
        return function () {
            ["cursorActivity", "blur", "scroll", "setDoc"].forEach(
                function (eventName) {
                    editor.off(eventName, callback);
                }
            );
        };
    }

    function _ternTooltip(server, editor, content, className) {
        const ownerDocument = _documentFor(editor);
        const node = ownerDocument.createElement("div");
        node.className = "CodeMirror-Tern-tooltip" +
            (className ? ` ${className}` : "");
        if (content && content.nodeType) {
            node.appendChild(content);
        } else {
            node.textContent = String(content || "");
        }
        const coordinates = editor.cursorCoords(null, "page");
        node.style.left = `${coordinates.right + 1}px`;
        node.style.top = `${coordinates.bottom}px`;
        const hintOptions = editor.getOption("hintOptions") || {};
        const container = hintOptions.container || ownerDocument.body;
        container.appendChild(node);
        node.editor = editor;
        server.tooltips.push(node);

        const ownerWindow = ownerDocument.defaultView || window;
        const bounds = node.getBoundingClientRect();
        if (bounds.bottom > ownerWindow.innerHeight) {
            node.style.top = `${Math.max(
                0,
                coordinates.top - bounds.height
            )}px`;
        }
        if (bounds.right > ownerWindow.innerWidth) {
            node.style.left = `${Math.max(
                0,
                coordinates.right - bounds.width
            )}px`;
        }
        return node;
    }

    function _ternTemporaryTooltip(server, editor, content) {
        if (editor.state.ternTooltip) {
            _ternRemoveTooltip(
                server,
                editor.state.ternTooltip
            );
        }
        const tooltip = _ternTooltip(
            server,
            editor,
            content
        );
        editor.state.ternTooltip = tooltip;
        let pointerInside = false;
        let expired = false;
        const clear = function () {
            if (pointerInside && expired) {
                return;
            }
            _ternRemoveTooltip(server, tooltip);
        };
        const mouseOver = function () {
            pointerInside = true;
        };
        const mouseOut = function (event) {
            if (!event.relatedTarget ||
                    !tooltip.contains(event.relatedTarget)) {
                pointerInside = false;
                if (expired) {
                    clear();
                }
            }
        };
        tooltip.addEventListener("mouseover", mouseOver);
        tooltip.addEventListener("mouseout", mouseOut);
        tooltip.clearActivity = _ternOnEditorActivity(
            editor,
            clear
        );
        tooltip.removeTimer = window.setTimeout(function () {
            expired = true;
            if (!pointerInside) {
                clear();
            }
        }, server.options.hintDelay || 1700);
        return tooltip;
    }

    function _ternShowError(server, editor, error) {
        if (typeof server.options.showError === "function") {
            server.options.showError(editor, error);
            return;
        }
        _ternTemporaryTooltip(server, editor, String(error));
    }

    function _ternHint(CodeMirror, server, editor, callback) {
        server.request(editor, {
            docs: true,
            types: true,
            type: "completions",
            urls: true
        }, function (error, data) {
            if (error || !data) {
                if (error) {
                    _ternShowError(server, editor, error);
                }
                callback(null);
                return;
            }
            const cursor = editor.getCursor();
            const from = data.start ?
                CodeMirror.Pos(data.start.line, data.start.ch) :
                cursor;
            const to = data.end ?
                CodeMirror.Pos(data.end.line, data.end.ch) :
                cursor;
            const opening = CodeMirror.Pos(
                from.line,
                Math.max(0, from.ch - 2)
            );
            const closing = CodeMirror.Pos(to.line, to.ch + 2);
            const appendClosingBracket =
                editor.getRange(opening, from) === "[\"" &&
                editor.getRange(to, closing) !== "\"]";
            const completions = data.completions || [];
            const list = completions.map(function (completion) {
                if (typeof completion === "string") {
                    return completion;
                }
                let className = _ternTypeClass(completion.type);
                if (data.guess) {
                    className += " CodeMirror-Tern-completion-guess";
                }
                return {
                    className: className,
                    data: completion,
                    displayText: completion.displayName ||
                        completion.name,
                    text: completion.name +
                        (appendClosingBracket ? "\"]" : "")
                };
            });
            const result = {
                from: from,
                list: list,
                to: to
            };
            let tooltip = null;
            CodeMirror.on(result, "close", function () {
                _ternRemoveTooltip(server, tooltip);
                tooltip = null;
            });
            CodeMirror.on(result, "update", function () {
                _ternRemoveTooltip(server, tooltip);
                tooltip = null;
            });
            CodeMirror.on(result, "select", function (
                completion,
                node
            ) {
                _ternRemoveTooltip(server, tooltip);
                tooltip = null;
                const dataItem = completion && completion.data;
                const content =
                    typeof server.options.completionTip === "function" ?
                        server.options.completionTip(dataItem) :
                        dataItem && dataItem.doc;
                if (content && node) {
                    tooltip = _ternTooltip(
                        server,
                        editor,
                        content,
                        "CodeMirror-Tern-hint-doc"
                    );
                }
            });
            callback(result);
        });
    }

    function _ternContextInfo(
        server,
        editor,
        position,
        queryName,
        callback
    ) {
        return server.request(
            editor,
            queryName,
            function (error, data) {
                if (error) {
                    _ternShowError(server, editor, error);
                    return;
                }
                const ownerDocument = _documentFor(editor);
                let content;
                if (typeof server.options.typeTip === "function") {
                    content = server.options.typeTip(data);
                } else {
                    content = ownerDocument.createElement("span");
                    const type = ownerDocument.createElement("strong");
                    type.textContent = data && data.type ||
                        editor.phrase("not found");
                    content.appendChild(type);
                    if (data && data.doc) {
                        content.appendChild(ownerDocument.createTextNode(
                            ` \u2014 ${data.doc}`
                        ));
                    }
                    if (data && data.url) {
                        content.appendChild(
                            ownerDocument.createTextNode(" ")
                        );
                        const link = ownerDocument.createElement("a");
                        link.href = data.url;
                        link.target = "_blank";
                        link.textContent = "[docs]";
                        content.appendChild(link);
                    }
                }
                if (content) {
                    _ternTemporaryTooltip(server, editor, content);
                }
                if (typeof callback === "function") {
                    callback();
                }
            },
            position
        );
    }

    function _ternParseFunctionType(text) {
        const args = [];
        let position = 3;
        const skipMatching = function (endPattern) {
            let depth = 0;
            const start = position;
            for (;;) {
                const character = text.charAt(position);
                if (!character ||
                        endPattern.test(character) && !depth) {
                    return text.slice(start, position);
                }
                if (/[{[(]/.test(character)) {
                    depth++;
                } else if (/[}\])]/.test(character)) {
                    depth--;
                }
                position++;
            }
        };
        if (text.charAt(position) !== ")") {
            for (;;) {
                let name = text.slice(position).match(
                    /^([^, ([{]+): /
                );
                if (name) {
                    position += name[0].length;
                    name = name[1];
                }
                args.push({
                    name: name || null,
                    type: skipMatching(/[),]/)
                });
                if (!text.charAt(position) ||
                        text.charAt(position) === ")") {
                    break;
                }
                position += 2;
            }
        }
        const returnType = text.slice(position).match(
            /^\) -> (.*)$/
        );
        return {
            args: args,
            rettype: returnType && returnType[1]
        };
    }

    function _ternShowArgHints(server, editor, argumentPosition) {
        _ternCloseArgHints(server);
        const cached = server.cachedArgHints;
        if (!cached) {
            return;
        }
        const ownerDocument = _documentFor(editor);
        const content = ownerDocument.createElement("span");
        if (cached.guess) {
            content.className = "CodeMirror-Tern-fhint-guess";
        }
        const name = ownerDocument.createElement("span");
        name.className = "CodeMirror-Tern-fname";
        name.textContent = cached.name;
        content.appendChild(name);
        content.appendChild(ownerDocument.createTextNode("("));
        cached.type.args.forEach(function (argument, index) {
            if (index) {
                content.appendChild(
                    ownerDocument.createTextNode(", ")
                );
            }
            const argumentName = ownerDocument.createElement("span");
            argumentName.className = "CodeMirror-Tern-farg" +
                (index === argumentPosition ?
                    " CodeMirror-Tern-farg-current" :
                    "");
            argumentName.textContent = argument.name || "?";
            content.appendChild(argumentName);
            if (argument.type !== "?") {
                content.appendChild(
                    ownerDocument.createTextNode(":\u00a0")
                );
                const type = ownerDocument.createElement("span");
                type.className = "CodeMirror-Tern-type";
                type.textContent = argument.type;
                content.appendChild(type);
            }
        });
        content.appendChild(ownerDocument.createTextNode(
            cached.type.rettype ? ") ->\u00a0" : ")"
        ));
        if (cached.type.rettype) {
            const returnType = ownerDocument.createElement("span");
            returnType.className = "CodeMirror-Tern-type";
            returnType.textContent = cached.type.rettype;
            content.appendChild(returnType);
        }
        const tooltip = _ternTooltip(
            server,
            editor,
            content
        );
        tooltip.clear = _ternOnEditorActivity(editor, function () {
            if (server.activeArgHints === tooltip) {
                _ternCloseArgHints(server);
            }
        });
        server.activeArgHints = tooltip;
    }

    function _ternUpdateArgHints(server, editor) {
        _ternCloseArgHints(server);
        if (editor.somethingSelected()) {
            return;
        }
        const token = editor.getTokenAt(editor.getCursor());
        const inner = server.CodeMirror.innerMode(
            editor.getMode(),
            token && token.state
        );
        const lexical = inner && inner.state &&
            inner.state.lexical;
        if (!inner || !inner.mode ||
                inner.mode.name !== "javascript" ||
                !lexical || lexical.info !== "call") {
            return;
        }
        const argumentPosition = lexical.pos || 0;
        const tabSize = editor.getOption("tabSize");
        let line = editor.getCursor().line;
        const minimumLine = Math.max(editor.firstLine(), line - 9);
        let character = null;
        for (; line >= minimumLine; line--) {
            const text = editor.getLine(line);
            let extra = 0;
            let searchPosition = 0;
            for (;;) {
                const tab = text.indexOf("\t", searchPosition);
                if (tab === -1) {
                    break;
                }
                extra += tabSize - (tab + extra) % tabSize - 1;
                searchPosition = tab + 1;
            }
            character = lexical.column - extra;
            if (text.charAt(character) === "(") {
                break;
            }
        }
        if (line < minimumLine) {
            return;
        }
        const start = {line: line, ch: character};
        const cached = server.cachedArgHints;
        if (cached && cached.doc === editor.getDoc() &&
                CodeMirrorCmpPos(start, cached.start) === 0) {
            _ternShowArgHints(
                server,
                editor,
                argumentPosition
            );
            return;
        }
        return server.request(
            editor,
            {
                end: start,
                preferFunction: true,
                type: "type"
            },
            function (error, data) {
                if (error || !data || !/^fn\(/.test(data.type || "")) {
                    return;
                }
                server.cachedArgHints = {
                    doc: editor.getDoc(),
                    guess: data.guess,
                    name: data.exprName || data.name || "fn",
                    start: start,
                    type: _ternParseFunctionType(data.type)
                };
                _ternShowArgHints(
                    server,
                    editor,
                    argumentPosition
                );
            }
        );
    }

    function _ternMoveTo(server, current, target, start, end) {
        target.doc.setSelection(start, end || start);
        if (current !== target &&
                typeof server.options.switchToDoc === "function") {
            _ternCloseArgHints(server);
            server.options.switchToDoc(target.name, target.doc);
        }
    }

    function _ternFindContext(doc, data) {
        if (!data.context || data.contextOffset === undefined) {
            return {
                end: data.end || data.start,
                start: data.start
            };
        }
        const before = data.context.slice(
            0,
            data.contextOffset
        ).split("\n");
        const startLine = data.start.line - (before.length - 1);
        const sourceLine = doc.getLine(startLine) || "";
        const start = {
            ch: (before.length === 1 ?
                data.start.ch :
                sourceLine.length) - before[0].length,
            line: startLine
        };
        let text = sourceLine.slice(start.ch);
        for (let line = startLine + 1;
            line < doc.lineCount() &&
                text.length < data.context.length;
            line++) {
            text += `\n${doc.getLine(line)}`;
        }
        if (text.slice(0, data.context.length) === data.context) {
            return data;
        }
        const cursor = doc.getSearchCursor(data.context, {
            ch: 0,
            line: doc.firstLine()
        }, {caseFold: false});
        let nearest = null;
        let nearestDistance = Infinity;
        while (cursor.findNext()) {
            const found = cursor.from();
            let distance = Math.abs(found.line - start.line) * 10000;
            if (!distance) {
                distance = Math.abs(found.ch - start.ch);
            }
            if (distance < nearestDistance) {
                nearest = found;
                nearestDistance = distance;
            }
        }
        if (!nearest) {
            return null;
        }
        if (before.length === 1) {
            nearest.ch += before[0].length;
        } else {
            nearest = {
                ch: before[before.length - 1].length,
                line: nearest.line + before.length - 1
            };
        }
        const end = data.start.line === data.end.line ?
            {
                ch: nearest.ch + data.end.ch - data.start.ch,
                line: nearest.line
            } :
            {
                ch: data.end.ch,
                line: nearest.line + data.end.line - data.start.line
            };
        return {end: end, start: nearest};
    }

    function _ternInterestingExpression(editor) {
        const position = editor.getCursor("end");
        const token = editor.getTokenAt(position);
        if (token.start < position.ch && token.type === "comment") {
            return false;
        }
        return /[\w)\]]/.test(
            editor.getLine(position.line).slice(
                Math.max(position.ch - 1, 0),
                position.ch + 1
            )
        );
    }

    function _ternDialog(editor, text, callback) {
        const ownerDocument = _documentFor(editor);
        const fragment = ownerDocument.createDocumentFragment();
        fragment.appendChild(
            ownerDocument.createTextNode(`${text}: `)
        );
        const input = ownerDocument.createElement("input");
        input.type = "text";
        fragment.appendChild(input);
        return editor.openDialog(fragment, callback);
    }

    function _ternApplyChanges(server, changes) {
        const byFile = Object.create(null);
        (changes || []).forEach(function (change) {
            if (!byFile[change.file]) {
                byFile[change.file] = [];
            }
            byFile[change.file].push(change);
        });
        server.renameGeneration++;
        Object.keys(byFile).forEach(function (name) {
            const entry = server.docs[name];
            if (!entry) {
                return;
            }
            const fileChanges = byFile[name].sort(
                function (left, right) {
                    return CodeMirrorCmpPos(
                        right.start,
                        left.start
                    );
                }
            );
            fileChanges.forEach(function (change) {
                entry.doc.replaceRange(
                    change.text,
                    change.start,
                    change.end,
                    `*rename${server.renameGeneration}`
                );
            });
        });
    }

    function installTern(CodeMirror) {
        installDialog(CodeMirror);
        return _installOnce(CodeMirror, "tern", function () {
            function TernServer(suppliedOptions) {
                const server = this;
                this.CodeMirror = CodeMirror;
                this.options = suppliedOptions || {};
                this.options.plugins = this.options.plugins || {};
                if (!this.options.plugins["doc_comment"]) {
                    this.options.plugins["doc_comment"] = true;
                }
                this.docs = Object.create(null);
                this.cachedArgHints = null;
                this.activeArgHints = null;
                this.jumpStack = [];
                this.renameGeneration = 0;
                this.tooltips = [];
                if (this.options.server) {
                    this.server = this.options.server;
                } else if (this.options.useWorker) {
                    this.server = _ternWorkerServer(this);
                } else {
                    const tern = _globalValue("tern");
                    this.server = tern && typeof tern.Server === "function" ?
                        new tern.Server({
                            async: true,
                            defs: this.options.defs || [],
                            getFile: function (name, callback) {
                                const entry = server.docs[name];
                                if (entry) {
                                    callback(_ternDocValue(server, entry));
                                } else if (typeof server.options.getFile ===
                                        "function") {
                                    server.options.getFile(name, callback);
                                } else {
                                    callback(null);
                                }
                            },
                            plugins: this.options.plugins
                        }) :
                        _ternUnavailableServer();
                }
                this.trackChange = function (doc, change) {
                    _ternTrackChange(server, doc, change);
                };
                this.getHint = function (editor, callback) {
                    return _ternHint(
                        CodeMirror,
                        server,
                        editor,
                        callback
                    );
                };
                this.getHint.async = true;
            }

            TernServer.prototype.addDoc = function (name, doc) {
                const document = _ternDocument(doc);
                const existing = this.docs[name];
                if (existing) {
                    CodeMirror.off(
                        existing.doc,
                        "change",
                        this.trackChange
                    );
                    this.server.delFile(name);
                }
                const entry = {
                    changed: null,
                    doc: document,
                    name: name
                };
                this.docs[name] = entry;
                this.server.addFile(name, _ternDocValue(this, entry));
                CodeMirror.on(document, "change", this.trackChange);
                return entry;
            };
            TernServer.prototype.delDoc = function (identifier) {
                const entry = _ternResolveDoc(this, identifier);
                if (!entry) {
                    return;
                }
                CodeMirror.off(entry.doc, "change", this.trackChange);
                delete this.docs[entry.name];
                this.server.delFile(entry.name);
            };
            TernServer.prototype.hideDoc = function (identifier) {
                _ternCloseArgHints(this);
                const entry = _ternResolveDoc(this, identifier);
                if (entry && entry.changed) {
                    _ternSendDoc(this, entry);
                }
            };
            TernServer.prototype.complete = function (editor) {
                return editor.showHint({hint: this.getHint});
            };
            TernServer.prototype.request = function (
                editor,
                query,
                callback,
                position
            ) {
                const entry = _ternFindDoc(this, editor.getDoc());
                const request = _ternRequestBody(
                    this,
                    editor,
                    query,
                    position
                );
                const server = this;
                this.server.request(request, function (error, data) {
                    let response = data;
                    if (!error &&
                            typeof server.options.responseFilter ===
                                "function") {
                        response = server.options.responseFilter(
                            entry,
                            query,
                            request,
                            error,
                            data
                        );
                    }
                    if (typeof callback === "function") {
                        callback(error, response);
                    }
                });
            };
            TernServer.prototype.showType = function (
                editor,
                position,
                callback
            ) {
                return _ternContextInfo(
                    this,
                    editor,
                    position,
                    "type",
                    callback
                );
            };
            TernServer.prototype.showDocs = function (
                editor,
                position,
                callback
            ) {
                return _ternContextInfo(
                    this,
                    editor,
                    position,
                    "documentation",
                    callback
                );
            };
            TernServer.prototype.updateArgHints = function (editor) {
                return _ternUpdateArgHints(this, editor);
            };
            TernServer.prototype.jumpToDef = function (editor) {
                const ternServer = this;
                const jump = function (variable) {
                    const query = {
                        type: "definition",
                        variable: variable || null
                    };
                    const current = _ternFindDoc(
                        ternServer,
                        editor.getDoc()
                    );
                    ternServer.request(editor, query, function (
                        error,
                        data
                    ) {
                        if (error) {
                            _ternShowError(
                                ternServer,
                                editor,
                                error
                            );
                            return;
                        }
                        if (data && !data.file && data.url) {
                            const ownerDocument = _documentFor(editor);
                            const ownerWindow =
                                ownerDocument.defaultView || window;
                            ownerWindow.open(data.url);
                            return;
                        }
                        const target = data && data.file &&
                            ternServer.docs[data.file];
                        const found = target && data.start ?
                            _ternFindContext(target.doc, data) :
                            null;
                        if (!target || !found) {
                            _ternShowError(
                                ternServer,
                                editor,
                                editor.phrase(
                                    "Could not find a definition."
                                )
                            );
                            return;
                        }
                        ternServer.jumpStack.push({
                            end: editor.getCursor("to"),
                            file: current.name,
                            start: editor.getCursor("from")
                        });
                        _ternMoveTo(
                            ternServer,
                            current,
                            target,
                            found.start,
                            found.end
                        );
                    });
                };
                if (!_ternInterestingExpression(editor)) {
                    return _ternDialog(
                        editor,
                        editor.phrase("Jump to variable"),
                        function (name) {
                            if (name) {
                                jump(name);
                            }
                        }
                    );
                }
                return jump();
            };
            TernServer.prototype.jumpBack = function (editor) {
                const position = this.jumpStack.pop();
                const target = position &&
                    this.docs[position.file];
                if (!target) {
                    return CodeMirror.Pass;
                }
                const current = _ternFindDoc(
                    this,
                    editor.getDoc()
                );
                _ternMoveTo(
                    this,
                    current,
                    target,
                    position.start,
                    position.end
                );
                return true;
            };
            TernServer.prototype.rename = function (editor) {
                const token = editor.getTokenAt(editor.getCursor());
                if (!token || !/\w/.test(token.string || "")) {
                    _ternShowError(
                        this,
                        editor,
                        editor.phrase("Not at a variable")
                    );
                    return;
                }
                const ternServer = this;
                return _ternDialog(
                    editor,
                    editor.phrase(`New name for ${token.string}`),
                    function (newName) {
                        ternServer.request(
                            editor,
                            {
                                fullDocs: true,
                                newName: newName,
                                type: "rename"
                            },
                            function (error, data) {
                                if (error) {
                                    _ternShowError(
                                        ternServer,
                                        editor,
                                        error
                                    );
                                    return;
                                }
                                _ternApplyChanges(
                                    ternServer,
                                    data && data.changes
                                );
                            }
                        );
                    }
                );
            };
            TernServer.prototype.selectName = function (editor) {
                const ternServer = this;
                const entry = _ternFindDoc(
                    this,
                    editor.getDoc()
                );
                return this.request(
                    editor,
                    {type: "refs"},
                    function (error, data) {
                        if (error) {
                            _ternShowError(
                                ternServer,
                                editor,
                                error
                            );
                            return;
                        }
                        const ranges = [];
                        let primary = 0;
                        const cursor = editor.getCursor();
                        (data && data.refs || []).forEach(function (ref) {
                            if (ref.file !== entry.name) {
                                return;
                            }
                            ranges.push({
                                anchor: ref.start,
                                head: ref.end
                            });
                            if (CodeMirror.cmpPos(
                                cursor,
                                ref.start
                            ) >= 0 && CodeMirror.cmpPos(
                                cursor,
                                ref.end
                            ) <= 0) {
                                primary = ranges.length - 1;
                            }
                        });
                        if (ranges.length) {
                            editor.setSelections(ranges, primary);
                        }
                    }
                );
            };
            TernServer.prototype.destroy = function () {
                const ternServer = this;
                _ternCloseArgHints(this);
                this.tooltips.slice().forEach(function (tooltip) {
                    _ternRemoveTooltip(ternServer, tooltip);
                });
                this.cachedArgHints = null;
                Object.keys(this.docs).forEach(function (name) {
                    ternServer.delDoc(name);
                });
                if (this.worker) {
                    this.worker.terminate();
                    this.worker = null;
                }
            };

            CodeMirror.TernServer = TernServer;
        });
    }

    function installTernWorker(CodeMirror) {
        installTern(CodeMirror);
        return _installOnce(CodeMirror, "ternWorker", function () {
            // The historical worker module is a worker entry point, not a
            // browser addon. TernServer's worker facade implements its wire
            // protocol without mutating the Phoenix window.
        });
    }

    function _samePosition(left, right) {
        return left.line === right.line && left.ch === right.ch;
    }

    function installEmacs(CodeMirror) {
        installDialog(CodeMirror);
        return _installOnce(CodeMirror, "emacs", function () {
            const commands = CodeMirror.commands;
            const killRing = [];
            let lastKill = null;

            const addToRing = function (text) {
                killRing.push(text);
                if (killRing.length > 50) {
                    killRing.shift();
                }
            };
            const growRing = function (text) {
                if (!killRing.length) {
                    addToRing(text);
                } else {
                    killRing[killRing.length - 1] += text;
                }
            };
            const ringValue = function (index) {
                const offset = Number(index) || 1;
                return killRing[
                    Math.max(0, killRing.length - Math.abs(offset))
                ] || "";
            };
            const popRing = function () {
                if (killRing.length > 1) {
                    killRing.pop();
                }
                return ringValue(1);
            };
            const kill = function (editor, from, to, ring, text) {
                const killed = text === null || text === undefined ?
                    editor.getRange(from, to) :
                    text;
                if (ring === "grow" && lastKill &&
                        lastKill.editor === editor &&
                        _samePosition(from, lastKill.position) &&
                        editor.isClean(lastKill.generation)) {
                    growRing(killed);
                } else if (ring !== false) {
                    addToRing(killed);
                }
                editor.replaceRange("", from, to, "+delete");
                lastKill = ring === "grow" ? {
                    editor: editor,
                    generation: editor.changeGeneration(),
                    position: from
                } : null;
            };
            const byChar = function (editor, position, direction) {
                return editor.findPosH(position, direction, "char", true);
            };
            const byWord = function (editor, position, direction) {
                return editor.findPosH(position, direction, "word", true);
            };
            const byLine = function (editor, position, direction) {
                return editor.findPosV(position, direction, "line");
            };
            const byPage = function (editor, position, direction) {
                return editor.findPosV(position, direction, "page");
            };
            const byParagraph = function (editor, position, direction) {
                let line = position.line;
                let text = editor.getLine(line) || "";
                let sawText = /\S/.test(
                    direction < 0 ?
                        text.slice(0, position.ch) :
                        text.slice(position.ch)
                );
                while (true) {
                    line += direction;
                    if (line < editor.firstLine() ||
                            line > editor.lastLine()) {
                        const edge = line - direction;
                        return CodeMirror.Pos(
                            edge,
                            direction < 0 ?
                                0 :
                                (editor.getLine(edge) || "").length
                        );
                    }
                    text = editor.getLine(line) || "";
                    if (/\S/.test(text)) {
                        sawText = true;
                    } else if (sawText) {
                        return CodeMirror.Pos(line, 0);
                    }
                }
            };
            const bySentence = function (editor, position, direction) {
                let line = position.line;
                let ch = position.ch;
                let text = editor.getLine(line) || "";
                let sawWord = false;
                while (true) {
                    const next = text.charAt(
                        ch + (direction < 0 ? -1 : 0)
                    );
                    if (!next) {
                        const edge = direction < 0 ?
                            editor.firstLine() :
                            editor.lastLine();
                        if (line === edge) {
                            return CodeMirror.Pos(line, ch);
                        }
                        text = editor.getLine(line + direction) || "";
                        if (!/\S/.test(text)) {
                            return CodeMirror.Pos(line, ch);
                        }
                        line += direction;
                        ch = direction < 0 ? text.length : 0;
                    } else {
                        if (sawWord && /[!?.]/.test(next)) {
                            return CodeMirror.Pos(
                                line,
                                ch + (direction > 0 ? 1 : 0)
                            );
                        }
                        if (!sawWord) {
                            sawWord = /\w/.test(next);
                        }
                        ch += direction;
                    }
                }
            };
            const byExpression = function (editor, position, direction) {
                const bracket = editor.findMatchingBracket &&
                    editor.findMatchingBracket(position, {strict: true});
                if (bracket && bracket.match &&
                        (bracket.forward ? 1 : -1) === direction) {
                    return direction > 0 ?
                        CodeMirror.Pos(
                            bracket.to.line,
                            bracket.to.ch + 1
                        ) :
                        bracket.to;
                }
                const token = editor.getTokenAt(position);
                const edge = CodeMirror.Pos(
                    position.line,
                    direction < 0 ? token.start : token.end
                );
                if (!_samePosition(edge, position)) {
                    return edge;
                }
                return byChar(editor, position, direction);
            };
            const clearPrefix = function (editor) {
                editor.state.emacsPrefix = null;
            };
            const prefix = function (editor, precise) {
                const value = editor.state.emacsPrefix;
                if (!value) {
                    return precise ? null : 1;
                }
                clearPrefix(editor);
                return value === "-" ? -1 : Number(value);
            };
            const repeated = function (command) {
                const operation = typeof command === "string" ?
                    function (editor) {
                        editor.execCommand(command);
                    } :
                    command;
                return function (editor) {
                    const count = prefix(editor);
                    const direction = count < 0 ? -1 : 1;
                    for (let index = 0;
                        index < Math.abs(count);
                        index++) {
                        operation(editor, direction);
                    }
                };
            };
            const findEnd = function (editor, position, boundary, direction) {
                let count = prefix(editor);
                let actualDirection = direction;
                if (count < 0) {
                    actualDirection = -actualDirection;
                    count = -count;
                }
                let current = position;
                for (let index = 0; index < count; index++) {
                    const next = boundary(
                        editor,
                        current,
                        actualDirection
                    );
                    if (_samePosition(next, current)) {
                        break;
                    }
                    current = next;
                }
                return current;
            };
            const move = function (boundary, direction) {
                const command = function (editor) {
                    editor.extendSelection(
                        findEnd(
                            editor,
                            editor.getCursor(),
                            boundary,
                            direction
                        )
                    );
                };
                command.motion = true;
                return command;
            };
            const killTo = function (editor, boundary, direction, ring) {
                const selections = editor.listSelections();
                for (let index = selections.length - 1;
                    index >= 0;
                    index--) {
                    const cursor = selections[index].head;
                    kill(
                        editor,
                        cursor,
                        findEnd(editor, cursor, boundary, direction),
                        ring
                    );
                }
            };
            const killRegion = function (editor, ring) {
                if (!editor.somethingSelected()) {
                    return false;
                }
                const selections = editor.listSelections();
                for (let index = selections.length - 1;
                    index >= 0;
                    index--) {
                    kill(
                        editor,
                        selections[index].anchor,
                        selections[index].head,
                        ring
                    );
                }
                return true;
            };
            const operateOnWord = function (editor, operation) {
                const start = editor.getCursor();
                const end = editor.findPosH(start, 1, "word");
                editor.replaceRange(
                    operation(editor.getRange(start, end)),
                    start,
                    end
                );
            };
            const addPrefix = function (editor, digit) {
                if (editor.state.emacsPrefix) {
                    if (digit !== "-") {
                        editor.state.emacsPrefix += digit;
                    }
                } else {
                    editor.state.emacsPrefix = digit;
                }
            };

            commands.setMark = function (editor) {
                editor.setCursor(editor.getCursor());
                editor.setExtending(!editor.getExtending());
            };
            commands.killRegion = function (editor) {
                return killRegion(editor, true);
            };
            commands.killLineEmacs = repeated(function (editor) {
                const start = editor.getCursor();
                let end = CodeMirror.Pos(
                    start.line,
                    (editor.getLine(start.line) || "").length
                );
                let text = editor.getRange(start, end);
                if (!/\S/.test(text) && start.line < editor.lastLine()) {
                    text += "\n";
                    end = CodeMirror.Pos(start.line + 1, 0);
                }
                kill(editor, start, end, "grow", text);
            });
            commands.killRingSave = function (editor) {
                addToRing(editor.getSelection());
                editor.setExtending(false);
                editor.setCursor(editor.getCursor());
            };
            commands.yank = function (editor) {
                const start = editor.getCursor();
                editor.replaceRange(
                    ringValue(prefix(editor)),
                    start,
                    start,
                    "paste"
                );
                editor.setSelection(start, editor.getCursor());
            };
            commands.yankPop = function (editor) {
                editor.replaceSelection(popRing(), "around", "paste");
            };
            commands.forwardChar = move(byChar, 1);
            commands.backwardChar = move(byChar, -1);
            commands.deleteChar = function (editor) {
                killTo(editor, byChar, 1, false);
            };
            commands.deleteForwardChar = function (editor) {
                if (!killRegion(editor, false)) {
                    killTo(editor, byChar, 1, false);
                }
            };
            commands.deleteBackwardChar = function (editor) {
                if (!killRegion(editor, false)) {
                    killTo(editor, byChar, -1, false);
                }
            };
            commands.forwardWord = move(byWord, 1);
            commands.backwardWord = move(byWord, -1);
            commands.killWord = function (editor) {
                killTo(editor, byWord, 1, "grow");
            };
            commands.backwardKillWord = function (editor) {
                killTo(editor, byWord, -1, "grow");
            };
            commands.nextLine = move(byLine, 1);
            commands.previousLine = move(byLine, -1);
            commands.scrollDownCommand = move(byPage, -1);
            commands.scrollUpCommand = move(byPage, 1);
            commands.backwardParagraph = move(byParagraph, -1);
            commands.forwardParagraph = move(byParagraph, 1);
            commands.backwardSentence = move(bySentence, -1);
            commands.forwardSentence = move(bySentence, 1);
            commands.killSentence = function (editor) {
                killTo(editor, bySentence, 1, "grow");
            };
            commands.backwardKillSentence = function (editor) {
                killTo(editor, bySentence, -1, "grow");
            };
            commands.killSexp = function (editor) {
                killTo(editor, byExpression, 1, "grow");
            };
            commands.backwardKillSexp = function (editor) {
                killTo(editor, byExpression, -1, "grow");
            };
            commands.forwardSexp = move(byExpression, 1);
            commands.backwardSexp = move(byExpression, -1);
            commands.markSexp = function (editor) {
                const cursor = editor.getCursor();
                editor.setSelection(
                    findEnd(editor, cursor, byExpression, 1),
                    cursor
                );
            };
            commands.transposeSexps = function (editor) {
                const leftStart = byExpression(
                    editor,
                    editor.getCursor(),
                    -1
                );
                const leftEnd = byExpression(editor, leftStart, 1);
                const rightEnd = byExpression(editor, leftEnd, 1);
                const rightStart = byExpression(editor, rightEnd, -1);
                editor.replaceRange(
                    editor.getRange(rightStart, rightEnd) +
                        editor.getRange(leftEnd, rightStart) +
                        editor.getRange(leftStart, leftEnd),
                    leftStart,
                    rightEnd
                );
            };
            commands.backwardUpList = repeated(function (editor) {
                const cursor = editor.getCursor();
                for (let line = cursor.line;
                    line >= editor.firstLine();
                    line--) {
                    const text = editor.getLine(line) || "";
                    const limit = line === cursor.line ?
                        cursor.ch :
                        text.length;
                    for (let ch = limit - 1; ch >= 0; ch--) {
                        if (/[([{]/.test(text.charAt(ch))) {
                            editor.extendSelection(
                                CodeMirror.Pos(line, ch)
                            );
                            return;
                        }
                    }
                }
            });
            commands.justOneSpace = function (editor) {
                const position = editor.getCursor();
                const text = editor.getLine(position.line) || "";
                let from = position.ch;
                let to = position.ch;
                while (from && /\s/.test(text.charAt(from - 1))) {
                    from--;
                }
                while (to < text.length && /\s/.test(text.charAt(to))) {
                    to++;
                }
                editor.replaceRange(
                    " ",
                    CodeMirror.Pos(position.line, from),
                    CodeMirror.Pos(position.line, to)
                );
            };
            commands.openLine = repeated(function (editor) {
                editor.replaceSelection("\n", "start");
            });
            commands.transposeCharsRepeatable = repeated(
                "transposeChars"
            );
            commands.capitalizeWord = repeated(function (editor) {
                operateOnWord(editor, function (word) {
                    const letter = word.search(/\w/);
                    return letter === -1 ?
                        word :
                        word.slice(0, letter) +
                            word.charAt(letter).toUpperCase() +
                            word.slice(letter + 1).toLowerCase();
                });
            });
            commands.upcaseWord = repeated(function (editor) {
                operateOnWord(editor, function (word) {
                    return word.toUpperCase();
                });
            });
            commands.downcaseWord = repeated(function (editor) {
                operateOnWord(editor, function (word) {
                    return word.toLowerCase();
                });
            });
            commands.undoRepeatable = repeated("undo");
            commands.keyboardQuit = function (editor) {
                if (commands.clearSearch) {
                    commands.clearSearch(editor);
                }
                editor.setExtending(false);
                editor.setCursor(editor.getCursor());
            };
            commands.newline = repeated(function (editor) {
                editor.replaceSelection("\n", "end");
            });
            commands.gotoLine = function (editor) {
                const line = prefix(editor, true);
                if (line !== null && line > 0) {
                    editor.setCursor(line - 1);
                    return;
                }
                const submit = function (value) {
                    const number = Number(value);
                    if (number > 0 && Number.isInteger(number)) {
                        editor.setCursor(number - 1);
                    }
                };
                if (editor.openDialog) {
                    editor.openDialog(
                        "<input type=\"text\"/>",
                        submit,
                        {bottom: true}
                    );
                } else if (typeof window.prompt === "function") {
                    submit(window.prompt("Goto line", ""));
                }
            };
            commands.indentRigidly = function (editor) {
                editor.indentSelection(
                    prefix(editor, true) ||
                        editor.getOption("indentUnit")
                );
            };
            commands.exchangePointAndMark = function (editor) {
                editor.setSelection(
                    editor.getCursor("head"),
                    editor.getCursor("anchor")
                );
            };
            commands.quotedInsertTab = repeated("insertTab");
            commands.universalArgument = function (editor) {
                addPrefix(editor, "4");
            };

            CodeMirror.emacs = {
                kill: kill,
                killRegion: killRegion,
                repeated: repeated
            };
            const keyMap = CodeMirror.keyMap.emacs =
                CodeMirror.normalizeKeyMap({
                    "Alt-/": "autocomplete",
                    "Alt-A": "backwardSentence",
                    "Alt-B": "backwardWord",
                    "Alt-Backspace": "backwardKillWord",
                    "Alt-C": "capitalizeWord",
                    "Alt-D": "killWord",
                    "Alt-E": "forwardSentence",
                    "Alt-F": "forwardWord",
                    "Alt-G G": "gotoLine",
                    "Alt-K": "killSentence",
                    "Alt-L": "downcaseWord",
                    "Alt-Left": "backwardWord",
                    "Alt-Right": "forwardWord",
                    "Alt-Space": "justOneSpace",
                    "Alt-U": "upcaseWord",
                    "Alt-V": "scrollDownCommand",
                    "Alt-W": "killRingSave",
                    "Alt-Y": "yankPop",
                    "Alt-{": "backwardParagraph",
                    "Alt-}": "forwardParagraph",
                    "Alt-;": "toggleComment",
                    "Backspace": "deleteBackwardChar",
                    "Cmd-Z": "undoRepeatable",
                    "Ctrl-/": "undoRepeatable",
                    "Ctrl-A": "goLineStart",
                    "Ctrl-Alt-B": "backwardSexp",
                    "Ctrl-Alt-Backspace": "backwardKillSexp",
                    "Ctrl-Alt-F": "forwardSexp",
                    "Ctrl-Alt-K": "killSexp",
                    "Ctrl-Alt-T": "transposeSexps",
                    "Ctrl-Alt-U": "backwardUpList",
                    "Ctrl-B": "backwardChar",
                    "Ctrl-D": "deleteChar",
                    "Ctrl-Down": "forwardParagraph",
                    "Ctrl-E": "goLineEnd",
                    "Ctrl-F": "forwardChar",
                    "Ctrl-G": "keyboardQuit",
                    "Ctrl-H": "deleteBackwardChar",
                    "Ctrl-J": "newline",
                    "Ctrl-K": "killLineEmacs",
                    "Ctrl-N": "nextLine",
                    "Ctrl-O": "openLine",
                    "Ctrl-P": "previousLine",
                    "Ctrl-Q Tab": "quotedInsertTab",
                    "Ctrl-R": "findPersistentPrev",
                    "Ctrl-S": "findPersistentNext",
                    "Ctrl-Shift-2": "setMark",
                    "Ctrl-Space": "setMark",
                    "Ctrl-T": "transposeCharsRepeatable",
                    "Ctrl-U": "universalArgument",
                    "Ctrl-Up": "backwardParagraph",
                    "Ctrl-V": "scrollUpCommand",
                    "Ctrl-W": "killRegion",
                    "Ctrl-X Ctrl-S": "save",
                    "Ctrl-X Ctrl-W": "save",
                    "Ctrl-X Ctrl-X": "exchangePointAndMark",
                    "Ctrl-X Delete": "backwardKillSentence",
                    "Ctrl-X F": "open",
                    "Ctrl-X H": "selectAll",
                    "Ctrl-X K": "close",
                    "Ctrl-X S": "saveAll",
                    "Ctrl-X Tab": "indentRigidly",
                    "Ctrl-X U": "undoRepeatable",
                    "Ctrl-Y": "yank",
                    "Ctrl-Z": "undoRepeatable",
                    "Delete": "deleteForwardChar",
                    "Down": "nextLine",
                    "End": "goLineEnd",
                    "Home": "goLineStart",
                    "Left": "backwardChar",
                    "PageDown": "scrollUpCommand",
                    "PageUp": "scrollDownCommand",
                    "Right": "forwardChar",
                    "Shift-Alt-,": "goDocStart",
                    "Shift-Alt-.": "goDocEnd",
                    "Shift-Alt-5": "replace",
                    "Shift-Ctrl--": "undoRepeatable",
                    "Shift-Ctrl-Alt-2": "markSexp",
                    "Shift-Ctrl-Z": "redo",
                    "Tab": "indentAuto",
                    "Up": "previousLine",
                    "Enter": "newlineAndIndent",
                    fallthrough: "default"
                });
            for (let digit = 0; digit < 10; digit++) {
                const text = String(digit);
                keyMap[`Ctrl-${text}`] = function (editor) {
                    addPrefix(editor, text);
                };
            }
            keyMap["Ctrl--"] = function (editor) {
                addPrefix(editor, "-");
            };
        });
    }

    function installAll(CodeMirror) {
        installDialog(CodeMirror);
        installAutoRefresh(CodeMirror);
        installFullScreen(CodeMirror);
        installPanel(CodeMirror);
        installContinueList(CodeMirror);
        installFoldCode(CodeMirror);
        installFoldGutter(CodeMirror);
        installIndentFold(CodeMirror);
        installCSSHint(CodeMirror);
        installHTMLHint(CodeMirror);
        installJavaScriptHint(CodeMirror);
        installSQLHint(CodeMirror);
        installLint(CodeMirror);
        installCoffeeLint(CodeMirror);
        installCSSLint(CodeMirror);
        installHTMLLint(CodeMirror);
        installJavaScriptLint(CodeMirror);
        installJSONLint(CodeMirror);
        installYAMLLint(CodeMirror);
        installMerge(CodeMirror);
        installLoadMode(CodeMirror);
        installMultiplexTest(CodeMirror);
        installRunMode(CodeMirror);
        installColorize(CodeMirror);
        installSimpleScrollbars(CodeMirror);
        installSelectionPointer(CodeMirror);
        installTern(CodeMirror);
        installTernWorker(CodeMirror);
        installHardWrap(CodeMirror);
        installEmacs(CodeMirror);
        return true;
    }

    function install(CodeMirror, moduleName) {
        if (!moduleName) {
            return installAll(CodeMirror);
        }
        switch (ADDON_PATHS[_normalizePath(moduleName)]) {
        case "dialog":
            return installDialog(CodeMirror);
        case "autoRefresh":
            return installAutoRefresh(CodeMirror);
        case "fullScreen":
            return installFullScreen(CodeMirror);
        case "panel":
            return installPanel(CodeMirror);
        case "continueList":
            return installContinueList(CodeMirror);
        case "foldCode":
            return installFoldCode(CodeMirror);
        case "foldGutter":
            return installFoldGutter(CodeMirror);
        case "indentFold":
            return installIndentFold(CodeMirror);
        case "cssHint":
            return installCSSHint(CodeMirror);
        case "htmlHint":
            return installHTMLHint(CodeMirror);
        case "javascriptHint":
            return installJavaScriptHint(CodeMirror);
        case "sqlHint":
            return installSQLHint(CodeMirror);
        case "xmlHint":
            return installXMLHint(CodeMirror);
        case "lint":
            return installLint(CodeMirror);
        case "coffeeLint":
            return installCoffeeLint(CodeMirror);
        case "cssLint":
            return installCSSLint(CodeMirror);
        case "htmlLint":
            return installHTMLLint(CodeMirror);
        case "javascriptLint":
            return installJavaScriptLint(CodeMirror);
        case "jsonLint":
            return installJSONLint(CodeMirror);
        case "yamlLint":
            return installYAMLLint(CodeMirror);
        case "merge":
            return installMerge(CodeMirror);
        case "loadMode":
            return installLoadMode(CodeMirror);
        case "multiplexTest":
            return installMultiplexTest(CodeMirror);
        case "runMode":
            return installRunMode(CodeMirror);
        case "colorize":
            return installColorize(CodeMirror);
        case "simpleScrollbars":
            return installSimpleScrollbars(CodeMirror);
        case "selectionPointer":
            return installSelectionPointer(CodeMirror);
        case "tern":
            return installTern(CodeMirror);
        case "ternWorker":
            return installTernWorker(CodeMirror);
        case "hardWrap":
            return installHardWrap(CodeMirror);
        case "emacs":
            return installEmacs(CodeMirror);
        default:
            return false;
        }
    }

    exports.install = install;
    exports.installAll = installAll;
    exports.isSupported = function (moduleName) {
        return Boolean(ADDON_PATHS[_normalizePath(moduleName)]);
    };
    exports.supportedPaths = supportedPaths;
});
