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
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see https://opensource.org/licenses/AGPL-3.0.
 */

/*global define, window*/

/*! DONT_STRIP_MINIFY: Replit Vim-derived compatibility code.
 * Third-party license notice:
 * thirdparty/licences/codemirror-vim-derived.markdown.
 */

/**
 * Installs the editor-agnostic Replit Vim engine on Phoenix's CM6-backed
 * CodeMirror compatibility facade. The Phoenix adapter remains the only
 * editor object and EditorView.state.doc remains the only text model.
 */
define(function (require, exports, module) {

    const CodeMirror = require("editor/CodeMirrorCompat"),
        LegacyAddons = require("editor/CodeMirrorLegacyAddons"),
        CM6 = require("thirdparty/CodeMirror6/codemirror6");

    const INSTALL_MARKER = "__phoenixCodeMirror6VimCompat";
    const DIALOG_BRIDGE_MARKER = "__phoenixVimDialogBridge";
    const MODIFIERS = {
        Shift: "S",
        Ctrl: "C",
        Alt: "A",
        Cmd: "D",
        Mod: "A",
        CapsLock: ""
    };
    const SPECIAL_KEYS = {
        Enter: "CR",
        Backspace: "BS",
        Delete: "Del",
        Insert: "Ins"
    };

    let Vim;

    function _templateNode(template) {
        if (template && template.nodeType) {
            return template;
        }
        const holder = window.document.createElement("div");
        holder.innerHTML = String(template || "");
        if (holder.childNodes.length === 1) {
            return holder.removeChild(holder.firstChild);
        }
        const fragment = window.document.createDocumentFragment();
        while (holder.firstChild) {
            fragment.appendChild(holder.firstChild);
        }
        return fragment;
    }

    function _legacyTemplate(template) {
        if (!template || !template.nodeType) {
            return template;
        }
        const text = String(template.textContent || "");
        if (template.classList &&
                template.classList.contains("cm-vim-message") &&
                /^recording @/.test(text)) {
            return `(${text.slice(0, "recording".length)})${text.slice("recording".length)}`;
        }
        if (template.outerHTML) {
            return template.outerHTML;
        }
        const holder = window.document.createElement("div");
        holder.appendChild(template.cloneNode(true));
        return holder.innerHTML;
    }

    function _closeDialog(editor, dialog, restoreFocus) {
        if (!dialog || dialog.__phoenixClosed) {
            return;
        }
        dialog.__phoenixClosed = true;
        const wrapper = editor.getWrapperElement();
        if (dialog.parentNode) {
            dialog.parentNode.removeChild(dialog);
        }
        if (!wrapper.querySelector(".CodeMirror-dialog")) {
            CodeMirror.rmClass(wrapper, "dialog-opened");
        }
        let stateChanged = false;
        if (editor.state.dialog === dialog) {
            editor.state.dialog = null;
            stateChanged = true;
        }
        if (editor.state.vimDialog === dialog) {
            editor.state.vimDialog = null;
            editor.state.vimDialogClose = null;
            stateChanged = true;
        }
        if (stateChanged) {
            CodeMirror.signal(editor, "dialog");
        }
        if (restoreFocus && !editor.state.dialog) {
            editor.focus();
        }
    }

    function _openDialog(template, callback, suppliedOptions) {
        const editor = this;
        const options = suppliedOptions || {};
        if (editor.state.currentNotificationClose) {
            editor.state.currentNotificationClose();
        }
        if (editor.state.vimDialogClose) {
            editor.state.vimDialogClose();
        }

        const dialog = window.document.createElement("div");
        dialog.className = "CodeMirror-dialog phoenix-cm6-vim-dialog";
        if (options.bottom) {
            dialog.classList.add("CodeMirror-dialog-bottom");
        } else {
            dialog.classList.add("CodeMirror-dialog-top");
        }
        dialog.appendChild(_templateNode(template));
        const wrapper = editor.getWrapperElement();
        wrapper.appendChild(dialog);
        CodeMirror.addClass(wrapper, "dialog-opened");

        let closed = false;
        const close = function (newValue) {
            const input = dialog.querySelector("input");
            if (typeof newValue === "string" && input) {
                input.value = newValue;
                return;
            }
            if (closed) {
                return;
            }
            closed = true;
            _closeDialog(editor, dialog, true);
            if (typeof options.onClose === "function") {
                options.onClose(dialog);
            }
        };

        editor.state.dialog = dialog;
        editor.state.vimDialog = dialog;
        editor.state.vimDialogClose = close;
        CodeMirror.signal(editor, "dialog");

        const input = dialog.querySelector("input");
        if (input) {
            if (options.value !== undefined) {
                input.value = options.value;
                if (options.selectValueOnOpen !== false) {
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
                        options.onKeyDown(event, input.value, close)) {
                    return;
                }
                if (event.keyCode === 13 && typeof callback === "function") {
                    callback(input.value);
                }
                if (event.keyCode === 27 ||
                        options.closeOnEnter !== false && event.keyCode === 13) {
                    input.blur();
                    CodeMirror.e_stop(event);
                    close();
                }
            });
            if (options.closeOnBlur !== false) {
                CodeMirror.on(input, "blur", function () {
                    window.setTimeout(function () {
                        if (window.document.activeElement !== input) {
                            close();
                        }
                    }, 0);
                });
            }
            input.focus();
        }
        return close;
    }

    function _openNotification(template, suppliedOptions) {
        const editor = this;
        const options = suppliedOptions || {};
        const previousClose = editor.state.currentNotificationClose ||
            editor.state.vimNotificationClose ||
            editor.state.closeVimNotification;
        if (previousClose) {
            previousClose();
        }

        const dialog = window.document.createElement("div");
        dialog.className = "CodeMirror-dialog phoenix-cm6-vim-notification";
        dialog.classList.add(options.bottom ?
            "CodeMirror-dialog-bottom" :
            "CodeMirror-dialog-top");
        dialog.appendChild(_templateNode(template));
        const wrapper = editor.getWrapperElement();
        wrapper.appendChild(dialog);
        CodeMirror.addClass(wrapper, "dialog-opened");

        let timer;
        const close = function () {
            if (timer) {
                window.clearTimeout(timer);
                timer = null;
            }
            _closeDialog(editor, dialog, false);
            if (editor.state.currentNotificationClose === close) {
                editor.state.currentNotificationClose = null;
            }
            if (editor.state.vimNotificationClose === close) {
                editor.state.vimNotificationClose = null;
            }
            if (editor.state.closeVimNotification === close) {
                editor.state.closeVimNotification = null;
            }
        };
        editor.state.dialog = dialog;
        editor.state.currentNotificationClose = close;
        editor.state.vimNotificationClose = close;
        CodeMirror.signal(editor, "dialog");
        CodeMirror.on(dialog, "click", function (event) {
            event.preventDefault();
            close();
        });

        const duration = options.duration === undefined ? 5000 : options.duration;
        if (duration) {
            timer = window.setTimeout(close, duration);
        }
        return close;
    }

    function _installDialogBridge(editor) {
        if (!editor || editor[DIALOG_BRIDGE_MARKER]) {
            return;
        }
        editor[DIALOG_BRIDGE_MARKER] = true;

        editor.on("vim-command-done", function () {
            if (editor.state.vim) {
                editor.state.vim.status = "";
            }
        });
        editor.on("vim-mode-change", function (event) {
            if (!editor.state.vim || !event) {
                return;
            }
            editor.state.vim.mode = event.mode;
            if (event.subMode) {
                editor.state.vim.mode += event.subMode === "linewise" ?
                    " line" :
                    " block";
            }
            editor.state.vim.status = "";
        });

        const defaultOpenDialog = editor.openDialog;
        const defaultOpenNotification = editor.openNotification;
        let customOpenDialog = null;
        let customOpenNotification = null;

        Object.defineProperty(editor, "openDialog", {
            configurable: true,
            enumerable: true,
            get: function () {
                return function (template, callback, options) {
                    const handler = customOpenDialog || defaultOpenDialog;
                    return handler.call(
                        editor,
                        customOpenDialog ? _legacyTemplate(template) : template,
                        callback,
                        options
                    );
                };
            },
            set: function (handler) {
                customOpenDialog = typeof handler === "function" ? handler : null;
            }
        });

        Object.defineProperty(editor, "openNotification", {
            configurable: true,
            enumerable: true,
            get: function () {
                return function (template, options) {
                    const handler = customOpenNotification || defaultOpenNotification;
                    return handler.call(
                        editor,
                        customOpenNotification ? _legacyTemplate(template) : template,
                        options
                    );
                };
            },
            set: function (handler) {
                customOpenNotification =
                    typeof handler === "function" ? handler : null;
            }
        });
    }

    function _toVimKey(key) {
        if (key.charAt(0) === "'") {
            return key.charAt(1);
        }

        const pieces = key.split(/-(?!$)/);
        const lastPiece = pieces[pieces.length - 1];
        if (pieces.length === 1 && lastPiece.length === 1) {
            return false;
        }
        if (pieces.length === 2 && pieces[0] === "Shift" &&
                lastPiece.length === 1) {
            return false;
        }

        let hasCharacter = false;
        for (let index = 0; index < pieces.length; index++) {
            const piece = pieces[index];
            if (Object.prototype.hasOwnProperty.call(MODIFIERS, piece)) {
                pieces[index] = MODIFIERS[piece];
            } else {
                hasCharacter = true;
            }
            if (Object.prototype.hasOwnProperty.call(SPECIAL_KEYS, piece)) {
                pieces[index] = SPECIAL_KEYS[piece];
            }
        }
        if (!hasCharacter) {
            return false;
        }
        if (/^[A-Z]$/.test(lastPiece)) {
            pieces[pieces.length - 1] = lastPiece.toLowerCase();
        }
        return "<" + pieces.join("-") + ">";
    }

    function _vimKey(key, editor) {
        if (!editor) {
            return;
        }
        if (Object.prototype.hasOwnProperty.call(this, key)) {
            return this[key];
        }
        const vimKey = _toVimKey(key);
        if (!vimKey) {
            return false;
        }
        return function () {
            let vimState = Vim.maybeInitVimState_(editor);
            vimState.status = (vimState.status || "") + vimKey;

            let handled = Vim.multiSelectHandleKey(editor, vimKey, "user");
            vimState = Vim.maybeInitVimState_(editor);
            if (!handled && vimState.insertMode && editor.state.overwrite) {
                if (vimKey.length === 1 && !/\n/.test(vimKey)) {
                    editor.overWriteSelection(vimKey);
                    handled = true;
                } else if (vimKey === "<BS>") {
                    CodeMirror.commands.goCharLeft(editor);
                    handled = true;
                }
            }
            if (handled) {
                CodeMirror.signal(editor, "vim-keypress", vimKey);
                return true;
            }
            return CodeMirror.Pass;
        };
    }

    function _transformCursor(editor, range) {
        const vimState = editor.state.vim;
        if (!vimState || vimState.insertMode || !vimState.sel ||
                !vimState.sel.head) {
            return range.head;
        }
        const head = vimState.sel.head;
        if (vimState.visualBlock && range.head.line !== head.line) {
            return;
        }
        if (range.from() === range.anchor && !range.empty() &&
                range.head.line === head.line &&
                range.head.ch !== head.ch) {
            return CodeMirror.Pos(range.head.line, range.head.ch - 1);
        }
        return range.head;
    }

    function _usesFatCursor(keyMap) {
        return keyMap === CodeMirror.keyMap.vim ||
            keyMap === CodeMirror.keyMap["vim-replace"];
    }

    function _detachVimMap(editor, next) {
        if (_usesFatCursor(this) && !_usesFatCursor(next)) {
            editor.options.$customCursor = null;
            CodeMirror.rmClass(editor.getWrapperElement(), "cm-fat-cursor");
            CodeMirror.rmClass(editor.getWrapperElement(), "cm-vimMode");
        }
        if (!next || next.attach !== _attachVimMap) {
            Vim.leaveVimMode(editor);
        }
    }

    function _attachVimMap(editor, previous) {
        _installDialogBridge(editor);
        if (_usesFatCursor(this)) {
            if (editor.curOp) {
                editor.curOp.selectionChanged = true;
            }
            editor.options.$customCursor = _transformCursor;
            CodeMirror.addClass(editor.getWrapperElement(), "cm-fat-cursor");
            CodeMirror.addClass(editor.getWrapperElement(), "cm-vimMode");
        }
        if (!previous || previous.attach !== _attachVimMap) {
            Vim.enterVimMode(editor);
        }
    }

    function install(target) {
        const codeMirror = target || CodeMirror;
        if (codeMirror[INSTALL_MARKER]) {
            return codeMirror.Vim;
        }

        LegacyAddons.install(codeMirror, "addon/comment/comment");
        LegacyAddons.install(codeMirror, "addon/fold/xml-fold");
        if (!codeMirror.commands.toggleLineComment) {
            codeMirror.commands.toggleLineComment =
                codeMirror.commands.toggleComment;
        }
        Vim = CM6.initVim(codeMirror);
        codeMirror.Vim = Vim;
        codeMirror.keyMap["vim-insert"] = {
            fallthrough: ["default"],
            attach: _attachVimMap,
            detach: _detachVimMap,
            call: _vimKey
        };
        codeMirror.keyMap["vim-replace"] = {
            Backspace: "goCharLeft",
            fallthrough: ["vim-insert"],
            attach: _attachVimMap,
            detach: _detachVimMap
        };
        codeMirror.keyMap.vim = {
            attach: _attachVimMap,
            detach: _detachVimMap,
            call: _vimKey
        };

        codeMirror.defineExtension("openDialog", _openDialog);
        codeMirror.defineExtension("openNotification", _openNotification);
        codeMirror.defineInitHook(_installDialogBridge);
        codeMirror.defineOption("vimMode", false, function (editor, value, oldValue) {
            if (value && editor.getOption("keyMap") !== "vim") {
                editor.setOption("keyMap", "vim");
            } else if (!value && oldValue !== codeMirror.Init &&
                    /^vim/.test(editor.getOption("keyMap"))) {
                editor.setOption("keyMap", "default");
            }
        });

        Object.defineProperty(codeMirror, INSTALL_MARKER, {
            configurable: false,
            enumerable: false,
            value: true
        });
        return Vim;
    }

    install(CodeMirror);

    exports.install = install;
    exports.toVimKey = _toVimKey;
    exports.Vim = Vim;
});
