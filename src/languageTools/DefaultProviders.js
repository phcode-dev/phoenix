/*
 * Copyright (c) 2019 - present Adobe. All rights reserved.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the "Software"),
 * to deal in the Software without restriction, including without limitation
 * the rights to use, copy, modify, merge, publish, distribute, sublicense,
 * and/or sell copies of the Software, and to permit persons to whom the
 * Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
 * DEALINGS IN THE SOFTWARE.
 *
 */

/*global Map*/
/* eslint-disable indent */
/* eslint max-len: ["error", { "code": 200 }], no-invalid-this: 0*/
define(function (require, exports, module) {


    var _ = brackets.getModule("thirdparty/lodash");

    var EditorManager = require('editor/EditorManager'),
        DocumentManager = require('document/DocumentManager'),
        CommandManager = require("command/CommandManager"),
        Commands = require("command/Commands"),
        StringMatch = require("utils/StringMatch"),
        CodeInspection = require("language/CodeInspection"),
        PathConverters = require("languageTools/PathConverters"),
        TabstopManager = require("editor/TabstopManager"),
        marked = require("thirdparty/marked.min"),
        matcher = new StringMatch.StringMatcher({
            preferPrefixMatches: true
        });

    // Provider styles live in src/styles/brackets.less (core stylesheet) now that languageTools is a
    // core module - no per-extension stylesheet to load.

    // ----- LSP code-hint documentation popup ---------------------------------------------------
    // The signature (type) is shown inline in the hint list; the (potentially long) documentation
    // is shown in a separate popup beside the hint list so the list itself never reflows while
    // navigating with the arrow keys.
    var $lspDocPopup = null;

    function _hideDocPopup() {
        if ($lspDocPopup) {
            $lspDocPopup.hide().empty();
        }
    }

    function _docToHtml(documentation) {
        if (!documentation) {
            return "";
        }
        var md = (typeof documentation === "string") ? documentation : (documentation.value || "");
        if (!md.trim()) {
            return "";
        }
        try {
            return marked.parse(md);
        } catch (e) {
            return _.escape(md);
        }
    }

    function _showDocPopup($hint, docHtml) {
        var $menu = $hint.closest(".codehint-menu");
        if (!docHtml || !$menu.length) {
            _hideDocPopup();
            return;
        }
        // Make the popup a child of the hint menu so it is removed automatically when the menu is
        // removed (CodeHintList.close() always does $hintMenu.remove()). This ties its lifecycle
        // strictly to the code-hint list, regardless of which teardown path fires. It uses
        // position:fixed, so it is still placed in viewport coordinates and is never clipped.
        if (!$lspDocPopup || !$lspDocPopup.parent().is($menu)) {
            $lspDocPopup = $("<div>").addClass("lsp-hint-doc-popup").appendTo($menu);
        }
        $lspDocPopup.empty().html(docHtml);

        // Anchor to the actual visible list (ul.dropdown-menu), not the zero-width .codehint-menu
        // positioning element, so the popup sits flush beside the list without overlapping it.
        var $list = $hint.closest("ul.dropdown-menu");
        if (!$list.length) {
            $list = $menu;
        }
        var anchor = $list[0].getBoundingClientRect();

        var GAP = 6;
        // Measure, then place to the right of the hint list - flipping to the left when there
        // isn't enough room.
        $lspDocPopup.css({ display: "block", visibility: "hidden", left: 0, top: 0 });
        var winW = $(window).width(), winH = $(window).height(),
            pw = $lspDocPopup.outerWidth(), ph = $lspDocPopup.outerHeight(),
            left = anchor.right + GAP;
        if (left + pw > winW - 8) {
            left = anchor.left - pw - GAP; // not enough room on the right - flip to the left
        }
        left = Math.max(8, left);
        var top = Math.min(anchor.top, Math.max(8, winH - ph - 8));
        $lspDocPopup.css({ left: left, top: top, visibility: "visible" });
    }

    function _injectInlineSignature($labelSpan, detail) {
        if (!detail || !detail.trim() || detail.trim() === "?") {
            return;
        }
        // Append the signature as a sibling of the label (inside .codehint-item) so the flex row
        // layout (see CSS) lays out label + signature side-by-side without overlap or width change.
        var text = detail.split("->").join(":").replace(/\s+/g, " ").trim();
        var $container = $labelSpan.parent(); // .codehint-item
        if (!$container.length) {
            $container = $labelSpan;
        }
        $container.find(".lsp-hint-sig").remove();
        // title shows the full signature on hover when it's truncated.
        $("<span>").addClass("lsp-hint-sig").text(text).attr("title", text).appendTo($container);
    }

    // Characters that, when typed, implicitly trigger completion in the generic default policy
    // (identifiers across most languages). A language server config may fully replace this policy
    // with its own `shouldAutoTrigger(implicitChar, editor)` callback. Server-declared
    // `triggerCharacters` (e.g. ".", "$", "::", "->") are honored per-language in the default too.
    var DEFAULT_IDENTIFIER_CHARS = /[A-Za-z0-9_$]/;

    function setClient(client) {
        if (client) {
            this.client = client;
        }
    }

    function CodeHintsProvider(client) {
        this.client = client;
        this.query = "";
        this.ignoreQuery = ["-", "->", ">", ":", "::", "(", "()", ")", "[", "[]", "]", "{", "{}", "}"];
    }

    CodeHintsProvider.prototype.setClient = setClient;

    function filterWithQueryAndMatcher(hints, query) {
        var matchResults = $.map(hints, function (hint) {
            var searchResult = matcher.match(hint.label, query);
            if (searchResult) {
                for (var key in hint) {
                    searchResult[key] = hint[key];
                }
            }

            return searchResult;
        });

        return matchResults;
    }

    CodeHintsProvider.prototype.hasHints = function (editor, implicitChar) {
        if (!this.client) {
            return false;
        }

        var serverCapabilities = this.client.getServerCapabilities();
        if (!serverCapabilities || !serverCapabilities.completionProvider) {
            return false;
        }

        // Explicit invocation (e.g. Ctrl-Space) always shows hints.
        if (!implicitChar) {
            return true;
        }

        // A language server may fully control where hints implicitly appear by supplying a
        // `shouldAutoTrigger(implicitChar, editor)` callback (e.g. to suppress inside strings or
        // trigger on language-specific sequences). When provided, it replaces the default policy.
        var config = this.client.config || {};
        if (typeof config.shouldAutoTrigger === "function") {
            return !!config.shouldAutoTrigger(implicitChar, editor);
        }

        // Default policy: auto-trigger only on identifier characters, so the popup doesn't appear
        // aggressively on every keystroke (operators, punctuation, etc.).
        if (DEFAULT_IDENTIFIER_CHARS.test(implicitChar)) {
            return true;
        }

        // ...or on a server-declared trigger character (e.g. "." for member access). Whitespace
        // triggers (some servers list " ") are intentionally ignored - they are too aggressive.
        var triggerChars = serverCapabilities.completionProvider.triggerCharacters || [];
        if (implicitChar.trim() && triggerChars.indexOf(implicitChar) !== -1) {
            return true;
        }

        return false;
    };

    CodeHintsProvider.prototype.getHints = function (implicitChar) {
        if (!this.client) {
            return null;
        }

        var editor = EditorManager.getActiveEditor(),
            pos = editor.getCursorPos(),
            docPath = editor.document.file._path,
            $deferredHints = $.Deferred(),
            self = this;

        this.client.requestHints({
            filePath: docPath,
            cursorPos: pos
        }).done(function (msgObj) {
            var hints = [];

            // The query is the identifier prefix already typed before the cursor (empty right
            // after a trigger char such as "."). Deriving it from the raw token is wrong - after a
            // "." the token is "." itself, which would filter out every member completion.
            var lineText = editor.document.getLine(pos.line),
                queryStart = pos.ch;
            while (queryStart > 0 && /[\w$]/.test(lineText.charAt(queryStart - 1))) {
                queryStart--;
            }
            self.query = lineText.substring(queryStart, pos.ch);
            if (msgObj) {
                var res = msgObj.items,
                    filteredHints = filterWithQueryAndMatcher(res, self.query);

                StringMatch.basicMatchSort(filteredHints);
                filteredHints.forEach(function (element) {
                    var $fHint = $("<span>")
                        .addClass("brackets-hints");

                    if (element.stringRanges) {
                        element.stringRanges.forEach(function (item) {
                            if (item.matched) {
                                $fHint.append($("<span>")
                                    .append(_.escape(item.text))
                                    .addClass("matched-hint"));
                            } else {
                                $fHint.append(_.escape(item.text));
                            }
                        });
                    } else {
                        $fHint.text(element.label);
                    }

                    $fHint.data("token", element);
                    // The signature is added inline lazily on highlight (onHighlight); the
                    // documentation is shown in a side popup. See _injectInlineSignature.
                    hints.push($fHint);
                });
            }

            $deferredHints.resolve({
                "hints": hints,
                "selectInitial": true
            });
        }).fail(function () {
            $deferredHints.reject();
        });

        return $deferredHints;
    };

    /**
     * Called when a hint is highlighted. LSP completion lists are lightweight - the type detail
     * and documentation usually arrive only via `completionItem/resolve`. Resolve the highlighted
     * item lazily and render its type/docs inline (reusing formatTypeDataForToken so the look
     * matches the rest of the hint UI).
     */
    CodeHintsProvider.prototype.onHighlight = function ($hint) {
        var self = this;
        if (!self.client) {
            _hideDocPopup();
            return;
        }
        var $span = $hint.closest("li").data("hint"),
            token = $span && $span.data && $span.data("token");
        if (!token) {
            _hideDocPopup();
            return;
        }

        // Mark this menu as an LSP menu so the flex row layout + stable min-width apply (scoped so
        // other code-hint providers are unaffected). Done synchronously so it takes effect before
        // the list is shown.
        $hint.closest(".codehint-menu").addClass("lsp-hints");

        function present() {
            // Inline: the signature for the highlighted row. Re-inject every time (it is
            // idempotent) because the list DOM is rebuilt on each keystroke, which drops a
            // previously-injected signature. resolveCompletion is cached separately (_lspResolved),
            // so this does not cause extra LSP requests.
            if (token.detail) {
                _injectInlineSignature($span, token.detail);
            }
            // Beside the list: the (possibly long) documentation.
            _showDocPopup($hint, _docToHtml(token.documentation));
        }

        if (token._lspResolved || !self.client.resolveCompletion) {
            present();
            return;
        }
        self.client.resolveCompletion(token).done(function (resolved) {
            token._lspResolved = true;
            token.detail = resolved.detail || token.detail;
            token.documentation = resolved.documentation || token.documentation;
            // Auto-import edits are commonly supplied only by completionItem/resolve. Carry them (and
            // a resolve-provided textEdit, when the item lacked one) onto the token so insertHint can
            // apply them.
            if (resolved.additionalTextEdits) {
                token.additionalTextEdits = resolved.additionalTextEdits;
            }
            if (!token.textEdit && resolved.textEdit) {
                token.textEdit = resolved.textEdit;
            }
            present();
        });
    };

    CodeHintsProvider.prototype.onClose = function () {
        _hideDocPopup();
    };

    CodeHintsProvider.prototype.insertHint = function ($hint) {
        var editor = EditorManager.getActiveEditor();
        if (!editor) {
            return false;
        }
        var token = $hint.data("token") || {},
            cursor = editor.getCursorPos(),
            lineText = editor.document.getLine(cursor.line),
            textEditRange = token.textEdit && token.textEdit.range,
            startCh,
            endCh = cursor.ch;
        // Anchor the replacement start on the server-provided textEdit.range.start when it is usable.
        // That start is stable as the user types forward (word/member starts don't move) and, crucially,
        // for member completions it points AT the trigger "." while newText itself includes the dot
        // (e.g. "console." + item ".log" -> replace from the "." -> "console.log", not "console..log").
        // We deliberately end at the CURRENT cursor rather than token.textEdit.range.end: that end is
        // stale when completions are served from cache while typing continues, which would otherwise
        // replace only part of the word (e.g. "conso"+enter -> "consolenso").
        if (textEditRange && textEditRange.start.line === cursor.line &&
                textEditRange.start.character <= cursor.ch) {
            startCh = textEditRange.start.character;
        } else {
            startCh = cursor.ch;
            while (startCh > 0 && /[\w$]/.test(lineText.charAt(startCh - 1))) {
                startCh--;
            }
        }
        var rawText = (token.textEdit && token.textEdit.newText) || token.insertText || token.label || "",
            startPos = { line: cursor.line, ch: startCh },
            endPos = { line: cursor.line, ch: endCh };

        if (token.insertTextFormat === 2) {
            // Snippet completion: let TabstopManager expand $1 / ${1:x} / $0, place the caret at the
            // first stop (selecting any default placeholder) and, for multi-stop snippets, start a
            // Tab-navigable session. Its caret/markers follow the additionalTextEdits applied below.
            TabstopManager.insertSnippet(editor, rawText, startPos, endPos);
        } else {
            editor.document.replaceRange(rawText, startPos, endPos);
        }

        // Apply additionalTextEdits (e.g. the auto-import line). Bottom-to-top keeps their own
        // coordinates valid; the editor maps the caret and any snippet markers through these edits
        // automatically, so an import inserted above does not strand the cursor.
        (token.additionalTextEdits || []).slice().sort(function (a, b) {
            return (b.range.start.line - a.range.start.line) ||
                (b.range.start.character - a.range.start.character);
        }).forEach(function (te) {
            editor.document.replaceRange(te.newText,
                { line: te.range.start.line, ch: te.range.start.character },
                { line: te.range.end.line, ch: te.range.end.character });
        });

        // Return false to indicate that another hinting session is not needed
        return false;
    };

    function ParameterHintsProvider(client) {
        this.client = client;
    }

    ParameterHintsProvider.prototype.setClient = setClient;

    ParameterHintsProvider.prototype.hasParameterHints = function (editor, implicitChar) {
        if (!this.client) {
            return false;
        }

        var serverCapabilities = this.client.getServerCapabilities();
        if (!serverCapabilities || !serverCapabilities.signatureHelpProvider) {
            return false;
        }

        return true;
    };

    ParameterHintsProvider.prototype.getParameterHints = function () {
        if (!this.client) {
            return null;
        }

        var editor = EditorManager.getActiveEditor(),
            pos = editor.getCursorPos(),
            docPath = editor.document.file._path,
            $deferredHints = $.Deferred();

        this.client.requestParameterHints({
            filePath: docPath,
            cursorPos: pos
        }).done(function (msgObj) {
            let paramList = [];
            let label;
            let activeParameter;
            if (msgObj) {
                let res;
                res = msgObj.signatures;
                activeParameter = msgObj.activeParameter;
                if (res && res.length) {
                    res.forEach(function (element) {
                        label = element.documentation;
                        let param = element.parameters;
                        param.forEach(ele => {
                            paramList.push({
                                label: ele.label,
                                documentation: ele.documentation
                            });
                        });
                    });

                    $deferredHints.resolve({
                        parameters: paramList,
                        currentIndex: activeParameter,
                        functionDocumentation: label
                    });
                } else {
                    $deferredHints.reject();
                }
            } else {
                $deferredHints.reject();
            }
        }).fail(function () {
            $deferredHints.reject();
        });

        return $deferredHints;
    };

    /**
     * Utility function to make the jump
     * @param   {Object} curPos - target postion for the cursor after the jump
     */
    function setJumpPosition(curPos) {
        EditorManager.getCurrentFullEditor().setCursorPos(curPos.line, curPos.ch, true);
    }

    function JumpToDefProvider(client) {
        this.client = client;
    }

    JumpToDefProvider.prototype.setClient = setClient;

    JumpToDefProvider.prototype.canJumpToDef = function (editor, implicitChar) {
        if (!this.client) {
            return false;
        }

        var serverCapabilities = this.client.getServerCapabilities();
        if (!serverCapabilities || !serverCapabilities.definitionProvider) {
            return false;
        }

        return true;
    };

    /**
     * Method to handle jump to definition feature.
     */
    JumpToDefProvider.prototype.doJumpToDef = function (editor) {
        // JumpToDefManager passes the active editor; prefer it. Fall back to the focused/active
        // editor only if called without one. getFocusedEditor() alone is unreliable - it returns
        // null whenever the editor does not currently hold DOM focus (e.g. jump invoked from a
        // menu/command, or in tests), which previously crashed here on a null editor.
        editor = editor || EditorManager.getFocusedEditor() || EditorManager.getActiveEditor();
        if (!this.client || !editor) {
            return null;
        }

        const pos = editor.getCursorPos(),
            docPath = editor.document.file._path,
            docPathUri = PathConverters.pathToUri(docPath),
            $deferredHints = $.Deferred();

        this.client.gotoDefinition({
            filePath: docPath,
            cursorPos: pos
        }).done(function (msgObj) {
            //For Older servers
            if (Array.isArray(msgObj)) {
                msgObj = msgObj[msgObj.length - 1];
            }

            if (msgObj && msgObj.range) {
                var docUri = msgObj.uri,
                    startCurPos = {};
                startCurPos.line = msgObj.range.start.line;
                startCurPos.ch = msgObj.range.start.character;

                if (docUri !== docPathUri) {
                    let documentPath = PathConverters.uriToPath(docUri);
                    CommandManager.execute(Commands.FILE_OPEN, {
                            fullPath: documentPath
                        })
                        .done(function () {
                            setJumpPosition(startCurPos);
                            $deferredHints.resolve();
                        });
                } else { //definition is in current document
                    setJumpPosition(startCurPos);
                    $deferredHints.resolve();
                }
            }
        }).fail(function () {
            $deferredHints.reject();
        });

        return $deferredHints;
    };

    function LintingProvider() {
        this._results = new Map();
        this._promiseMap = new Map();
        this._lastSignature = new Map();
        this._validateOnType = false;
    }

    LintingProvider.prototype.setClient = setClient;

    LintingProvider.prototype.clearExistingResults = function (filePath) {
        var filePathProvided = !!filePath;

        if (filePathProvided) {
            this._results.delete(filePath);
            this._promiseMap.delete(filePath);
            this._lastSignature.delete(filePath);
        } else {
            //clear all results
            this._results.clear();
            this._promiseMap.clear();
            this._lastSignature.clear();
        }
    };

    /**
     * Publish the diagnostics information related to current document
     * @param   {Object} msgObj - json object containing information associated with 'textDocument/publishDiagnostics' notification from server
     */
    LintingProvider.prototype.setInspectionResults = function (msgObj) {
        let diagnostics = msgObj.diagnostics,
            filePath = PathConverters.uriToPath(msgObj.uri),
            errors = [];

        errors = diagnostics.map(function (obj) {
            return {
                pos: {
                    line: obj.range.start.line,
                    ch: obj.range.start.character
                },
                message: obj.message,
                type: (obj.severity === 1 ? CodeInspection.Type.ERROR : (obj.severity === 2 ? CodeInspection.Type.WARNING : CodeInspection.Type.META))
            };
        });

        this._results.set(filePath, {
            errors: errors
        });
        if(this._promiseMap.get(filePath)) {
           this._promiseMap.get(filePath).resolve(this._results.get(filePath));
           this._promiseMap.delete(filePath);
        }
        // Language servers re-publish diagnostics in waves (e.g. syntax then semantic passes) and
        // again on every edit - frequently with identical content. Re-running inspection only to
        // render the same problems rebuilds the Problems panel for nothing, which both wastes work
        // and detaches live DOM (e.g. the inline "fix" buttons a user may be clicking). Skip the
        // re-run when this file's diagnostics are unchanged from what we last surfaced.
        var signature = JSON.stringify(errors),
            changed = this._lastSignature.get(filePath) !== signature;
        this._lastSignature.set(filePath, signature);
        if (this._validateOnType && changed) {
            var editor = EditorManager.getActiveEditor(),
                docPath = editor ? editor.document.file._path : "";
            // Only nudge CodeInspection to re-pull when this LSP inspector is actually a
            // registered provider for the active file. In the app it always is, so behaviour
            // is unchanged. But tests that take manual control of the inspection pipeline call
            // CodeInspection._unregisterAll() and choreograph their own (mock) linters; a stray
            // requestRun() fired by the live server's async diagnostics would restart those
            // carefully-timed runs and flake the results.
            if (filePath === docPath && this._isRegisteredInspector(docPath)) {
                CodeInspection.requestRun();
            }
        }
    };

    /**
     * @private
     * @param {string} filePath - active document path
     * @return {boolean} true if this provider's CodeInspection registration is still active for
     *      the file (or if no registration name was recorded, preserving legacy behaviour).
     */
    LintingProvider.prototype._isRegisteredInspector = function (filePath) {
        if (!this._inspectionProviderName) {
            return true;
        }
        var name = this._inspectionProviderName;
        return CodeInspection.getProvidersForPath(filePath).some(function (provider) {
            return provider.name === name;
        });
    };

    LintingProvider.prototype.getInspectionResultsAsync = function (fileText, filePath) {
        var result = $.Deferred();

        if (this._results.get(filePath)) {
            return result.resolve(this._results.get(filePath));
        }
        this._promiseMap.set(filePath, result);
        return result;
    };

    LintingProvider.prototype.getInspectionResults = function (fileText, filePath) {
        return this._results.get(filePath);
    };

    function serverRespToSearchModelFormat(msgObj) {
        var referenceModel = {},
            result = $.Deferred();

        if(!(msgObj && msgObj.length && msgObj.cursorPos)) {
            return result.reject();
        }
        referenceModel.results = {};
        referenceModel.numFiles = 0;
        var fulfilled = 0;
        msgObj.forEach((element, i) => {
            var filePath = PathConverters.uriToPath(element.uri);
            DocumentManager.getDocumentForPath(filePath)
                .done(function(doc) {
                    var startRange = {line: element.range.start.line, ch: element.range.start.character};
                    var endRange = {line: element.range.end.line, ch: element.range.end.character};
                    var match = {
                        start: startRange,
                        end: endRange,
                        highlightOffset: 0,
                        line: doc.getLine(element.range.start.line)
                    };
                    if(!referenceModel.results[filePath]) {
                        referenceModel.numFiles = referenceModel.numFiles + 1;
                        referenceModel.results[filePath] = {"matches": []};
                    }
                    if(!referenceModel.queryInfo || msgObj.cursorPos.line === startRange.line) {
                        referenceModel.queryInfo = doc.getRange(startRange, endRange);
                    }
                    referenceModel.results[filePath]["matches"].push(match);
                }).always(function() {
                    fulfilled++;
                    if(fulfilled === msgObj.length) {
                        referenceModel.numMatches = msgObj.length;
                        referenceModel.allResultsAvailable = true;
                        result.resolve(referenceModel);
                    }
                });
        });
        return result.promise();
    }

    function ReferencesProvider(client) {
        this.client = client;
    }

    ReferencesProvider.prototype.setClient = setClient;

    ReferencesProvider.prototype.hasReferences = function() {
        if (!this.client) {
            return false;
        }

        var serverCapabilities = this.client.getServerCapabilities();
        if (!serverCapabilities || !serverCapabilities.referencesProvider) {
            return false;
        }

        return true;
    };

    ReferencesProvider.prototype.getReferences = function(hostEditor, curPos) {
        var editor = hostEditor || EditorManager.getActiveEditor(),
            pos = curPos || editor ? editor.getCursorPos() : null,
            docPath = editor.document.file._path,
            result = $.Deferred();

        if (this.client) {
            this.client.findReferences({
                filePath: docPath,
                cursorPos: pos
            }).done(function(msgObj){
                    if(msgObj && msgObj.length) {
                        msgObj.cursorPos = pos;
                        serverRespToSearchModelFormat(msgObj)
                            .done(result.resolve)
                            .fail(result.reject);
                    } else {
                        result.reject();
                    }
                }).fail(function(){
                    result.reject();
                });
            return result.promise();
        }
        return result.reject();
    };

    exports.CodeHintsProvider = CodeHintsProvider;
    exports.ParameterHintsProvider = ParameterHintsProvider;
    exports.JumpToDefProvider = JumpToDefProvider;
    exports.LintingProvider = LintingProvider;
    exports.ReferencesProvider = ReferencesProvider;
    exports.serverRespToSearchModelFormat = serverRespToSearchModelFormat;
});
