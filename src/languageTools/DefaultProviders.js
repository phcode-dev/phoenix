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


    var _ = require("thirdparty/lodash");

    var EditorManager = require("editor/EditorManager"),
      DocumentManager = require("document/DocumentManager"),
      CommandManager = require("command/CommandManager"),
      Commands = require("command/Commands"),
      StringMatch = require("utils/StringMatch"),
      CodeInspection = require("language/CodeInspection"),
      PathConverters = require("languageTools/PathConverters"),
      TabstopManager = require("editor/TabstopManager"),
      Strings = require("strings"),
      StringUtils = require("utils/StringUtils"),
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
    // The hint list reflows after _showDocPopup runs - it flips above/below the caret near a screen
    // edge, shifts as the cursor moves, and moves on scroll. To keep the doc popup glued beside it
    // (and never overlapping it), we re-derive its position from the list's *current* rect on every
    // animation frame while it is visible, instead of positioning it once.
    var _docTrackRAF = null,   // active requestAnimationFrame handle, or null when not tracking
        _docTrackList = null,  // the ul.dropdown-menu the popup is anchored to
        _docLastPos = "";      // last applied "left,top" - skip the css write when unchanged

    function _hideDocPopup() {
        if (_docTrackRAF) {
            cancelAnimationFrame(_docTrackRAF);
            _docTrackRAF = null;
        }
        _docTrackList = null;
        _docLastPos = "";
        if ($lspDocPopup) {
            $lspDocPopup.hide().empty();
        }
    }

    /**
     * Place the doc popup flush beside the hint list's current position: to the right, flipping to
     * the left when there isn't room, and clamped vertically to stay on screen. Reads the list's
     * live rect so it stays correct no matter how the list has since moved.
     */
    function _positionDocPopup() {
        if (!$lspDocPopup || !_docTrackList || !_docTrackList.length) {
            return;
        }
        var listEl = _docTrackList[0];
        if (!listEl.isConnected) {
            // The hint menu (and this popup, its child) was torn down - stop tracking.
            _hideDocPopup();
            return;
        }
        var anchor = listEl.getBoundingClientRect();
        if (anchor.width === 0 && anchor.height === 0) {
            return; // list not laid out yet (mid-reflow) - try again next frame
        }
        var GAP = 0,
            winW = $(window).width(),
            winH = $(window).height(),
            pw = $lspDocPopup.outerWidth(),
            ph = $lspDocPopup.outerHeight(),
            left = anchor.right + GAP;
        if (left + pw > winW - 8) {
            left = anchor.left - pw - GAP; // not enough room on the right - flip to the left
        }
        left = Math.max(8, left);
        var top = Math.max(8, Math.min(anchor.top, winH - ph - 8));
        var pos = Math.round(left) + "," + Math.round(top);
        if (pos !== _docLastPos) {
            _docLastPos = pos;
            $lspDocPopup.css({ left: left, top: top });
        }
    }

    function _trackDocPopup() {
        _positionDocPopup();
        _docTrackRAF = requestAnimationFrame(_trackDocPopup);
    }

    // Syntax-highlight fenced code blocks (the signature/examples in completion docs) with the
    // globally available highlight.js, so they read like code instead of flat monospace. Theme-aware
    // token colours live in src/styles/brackets.less (.lsp-hint-doc-popup, shared with the hover).
    function _highlightCode(html) {
        var hljs = (typeof Phoenix !== "undefined") && Phoenix.libs && Phoenix.libs.hljs;
        if (!hljs) {
            return html;
        }
        var $wrap = $("<div>").html(html);
        $wrap.find("pre > code").each(function () {
            var $code = $(this);
            var match = ($code.attr("class") || "").match(/language-([\w-]+)/);
            var lang = match && match[1];
            if (lang && hljs.getLanguage(lang)) {
                try {
                    $code.html(hljs.highlight($code.text(), { language: lang }).value).addClass("hljs");
                } catch (e) {
                    // leave the block unhighlighted on any hljs error
                }
            }
        });
        return $wrap.html();
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
            return _highlightCode(marked.parse(md));
        } catch (e) {
            return _.escape(md);
        }
    }

    // Highlight.js language for the signature block, derived from the file being edited so it isn't
    // hard-wired to one language. The LSP `detail` string carries no language tag, so we use the
    // editor's. vtsls emits TypeScript-syntax signatures even in .js/.jsx (TS is a superset), so map
    // the JS family to ts/tsx; every other language uses its own id - hljs resolves many aliases, and
    // _highlightCode no-ops gracefully when the id is unknown (the block just renders as monospace).
    var SIGNATURE_HLJS_LANG = {
        javascript: "typescript",
        jsx: "tsx",
        typescript: "typescript",
        tsx: "tsx"
    };

    function _signatureLang() {
        var editor = EditorManager.getActiveEditor();
        var id = editor && editor.getLanguageForSelection && editor.getLanguageForSelection().getId();
        if (!id) {
            return "typescript";
        }
        return SIGNATURE_HLJS_LANG[id] || id;
    }

    // Build the side doc popup's content, like VS Code/WebStorm's details panel: the item's
    // signature (token.detail) as a highlighted code block - the focal point - followed by the
    // prose documentation. The signature already carries the "Add import from <module>" line for
    // auto-imports (tsserver puts it there), so we don't add our own. Shown whenever there's a
    // signature OR docs, so a doc-less item still gets its signature shown instead of nothing.
    function _docPopupHtml(token) {
        var parts = [];

        // The signature is worth a popup only when it adds something beyond the item's own name.
        // vtsls returns the label itself as `detail` for keywords/plain identifiers (`this` -> "this",
        // `throw` -> "throw"), which would make the popup a verbatim echo of the hint row - so a detail
        // that merely restates the label counts as "no signature".
        var label = (token.label || "").trim();
        var detail = (token.detail || "").trim();
        // Some servers (intelephense) split the signature across fields: labelDetails.detail holds
        // the parameter list ("($search, $replace, ...)") and `detail` only the return type. Shown
        // alone the return type reads like noise - compose the full signature instead. Only when
        // labelDetails.detail is a parameter list and `detail` isn't already a full signature
        // (vtsls puts the whole signature in `detail`, which must stay untouched).
        var paramList = (token.labelDetails && token.labelDetails.detail || "").trim();
        var signature = detail;
        if (paramList.charAt(0) === "(" && detail.indexOf("(") === -1) {
            signature = label + paramList + (detail ? ": " + detail : "");
        }
        if (signature && signature !== label) {
            try {
                parts.push(_highlightCode(marked.parse("```" + _signatureLang() + "\n" + signature + "\n```")));
            } catch (e) {
                // skip the signature block on any parse/highlight error
            }
        }

        var docHtml = _docToHtml(token.documentation);
        if (docHtml) {
            parts.push(docHtml);
        }

        // Empty -> "" so _showDocPopup hides the popup entirely instead of echoing the hint row.
        return parts.join("");
    }

    // Minimal copy glyph (stroked, inherits currentColor) for the per-code-block copy button.
    const COPY_ICON = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
        'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<rect x="9" y="9" width="13" height="13" rx="2"/>' +
        '<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';

    function _copyText(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            return navigator.clipboard.writeText(text);
        }
        return new Promise(function (resolve, reject) {
            try {
                const ta = document.createElement("textarea");
                ta.value = text;
                ta.style.cssText = "position:fixed;opacity:0;pointer-events:none;";
                document.body.appendChild(ta);
                ta.select();
                document.execCommand("copy");
                document.body.removeChild(ta);
                resolve();
            } catch (e) {
                reject(e);
            }
        });
    }

    // Give every code block in the doc popup a hover-revealed copy button.
    function _addCopyButtons($popup) {
        $popup.find("pre").each(function () {
            const $pre = $(this);
            if ($pre.children(".lsp-copy-btn").length) {
                return;
            }
            $("<button>")
                .addClass("lsp-copy-btn")
                .attr({ type: "button", title: Strings.CMD_COPY, "aria-label": Strings.CMD_COPY })
                .html(COPY_ICON)
                .appendTo($pre);
        });
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
            // Keep mouse interaction inside the popup from reaching the document-level handlers that
            // dismiss the completion (Bootstrap's "close dropdown on outside click"), so the user can
            // select and copy text/code without the popup vanishing. Crucially we do NOT preventDefault
            // here - the browser's native text selection must keep working.
            $lspDocPopup
                .on("mousedown click", function (e) {
                    e.stopPropagation();
                })
                .on("click", ".lsp-copy-btn", function (e) {
                    e.preventDefault();
                    const $btn = $(this);
                    const text = $btn.closest("pre").find("code").text();
                    if (!text) {
                        return;
                    }
                    _copyText(text).then(function () {
                        $btn.addClass("copied");
                        setTimeout(function () { $btn.removeClass("copied"); }, 1200);
                    }).catch(function () { /* clipboard unavailable - ignore */ });
                });
        }
        $lspDocPopup.empty().html(docHtml);
        _addCopyButtons($lspDocPopup);

        // Anchor to the actual visible list (ul.dropdown-menu), not the zero-width .codehint-menu
        // positioning element, so the popup sits flush beside the list without overlapping it.
        var $list = $hint.closest("ul.dropdown-menu");
        if (!$list.length) {
            $list = $menu;
        }

        // Position now, then keep re-positioning every frame so the popup follows the list wherever
        // it reflows to (and never ends up overlapping it).
        _docTrackList = $list;
        _docLastPos = "";
        $lspDocPopup.css({ display: "block" });
        _positionDocPopup();
        if (!_docTrackRAF) {
            _trackDocPopup();
        }
    }

    // Inline row details longer than this go to the side docs popup instead of the row (some
    // servers - intelephense - put whole function signatures in `detail`, which bloats the list).
    const INLINE_DETAIL_MAX_CHARS = 32;

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

    // True when a completion is an auto-import suggestion (it carries the source module in
    // labelDetails.description), as opposed to an in-scope symbol or a keyword.
    function _isAutoImport(item) {
        return !!(item.labelDetails && item.labelDetails.description);
    }

    // WebStorm-style noise control: when several modules export the SAME name, the LSP returns one
    // auto-import suggestion per module, flooding the list with near-identical rows. Collapse those
    // into a single "N imports…" row; choosing it re-opens the list filtered to just that name's
    // sources so the user picks the module (see insertHint + the _importLabel branch of getHints).
    // In-scope symbols and single-source auto-imports are left exactly as they were.
    function _clubAutoImports(items) {
        var counts = new Map();
        items.forEach(function (it) {
            if (_isAutoImport(it)) {
                counts.set(it.label, (counts.get(it.label) || 0) + 1);
            }
        });
        var seen = new Set(), result = [];
        items.forEach(function (it) {
            if (!_isAutoImport(it) || counts.get(it.label) < 2) {
                result.push(it); // in-scope, keyword, or the only import source for this name
                return;
            }
            if (seen.has(it.label)) {
                return; // already represented by the clubbed row at its best-sorted position
            }
            seen.add(it.label);
            result.push(Object.assign({}, it, {
                _clubbed: true,
                _importCount: counts.get(it.label)
            }));
        });
        return result;
    }

    // Render one completion row: the (matched-highlighted) label, plus a dimmed right-aligned tag -
    // either the source module of a single auto-import, or "N imports…" for a clubbed group.
    function _renderHint(element) {
        var $fHint = $("<span>").addClass("brackets-hints");
        var $label = $("<span>").addClass("lsp-hint-label");

        if (element.stringRanges) {
            element.stringRanges.forEach(function (item) {
                if (item.matched) {
                    $label.append($("<span>").append(_.escape(item.text)).addClass("matched-hint"));
                } else {
                    $label.append(_.escape(item.text));
                }
            });
        } else {
            $label.text(element.label);
        }
        $fHint.append($label);

        if (element._clubbed) {
            $("<span>")
                .addClass("lsp-hint-source lsp-hint-import-group")
                .text(StringUtils.format(Strings.CODE_HINT_IMPORT_FROM_N, element._importCount))
                .appendTo($fHint);
        } else if (element.labelDetails && element.labelDetails.description) {
            // VS Code-style source annotation: shows e.g. the `inspector` in a `console` auto-import
            // so same-named items from different modules read as distinct rows.
            $("<span>")
                .addClass("lsp-hint-source")
                .text(element.labelDetails.description)
                .attr("title", element.labelDetails.description)
                .appendTo($fHint);
        }

        $fHint.data("token", element);
        return $fHint;
    }

    CodeHintsProvider.prototype.hasHints = function (editor, implicitChar) {
        // Stand down when the document isn't one the server syncs (providers are selected by the
        // language at the CURSOR, so e.g. inside an HTML <script> this provider is asked even though
        // the server never sees the .html) - lets lower-priority providers (Tern) serve those.
        if (!this.client || !this.client.servesDocument(editor)) {
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

        // The query is the identifier prefix already typed before the cursor (empty right after a
        // trigger char such as "."). Deriving it from the raw token is wrong - after a "." the token
        // is "." itself, which would filter out every member completion.
        function computeQuery() {
            var lineText = editor.document.getLine(pos.line),
                queryStart = pos.ch;
            while (queryStart > 0 && /[\w$]/.test(lineText.charAt(queryStart - 1))) {
                queryStart--;
            }
            return lineText.substring(queryStart, pos.ch);
        }

        this.client.requestHints({
            filePath: docPath,
            cursorPos: pos
        }).done(function (msgObj) {
            var hints = [];
            self.query = computeQuery();
            if (msgObj) {
                var filteredHints = filterWithQueryAndMatcher(msgObj.items, self.query);
                StringMatch.basicMatchSort(filteredHints);

                // Second step of a clubbed auto-import: the user picked the "N imports…" row, so show
                // just that name's import sources (one row per module) instead of the whole list.
                if (self._importLabel) {
                    var wanted = self._importLabel;
                    self._importLabel = null;
                    filteredHints = filteredHints.filter(function (it) {
                        return it.label === wanted && _isAutoImport(it);
                    });
                } else {
                    filteredHints = _clubAutoImports(filteredHints);
                }

                hints = filteredHints.map(_renderHint);
            }

            $deferredHints.resolve({
                "hints": hints,
                "selectInitial": true
            });
        }).fail(function () {
            self._importLabel = null;
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

        // Clubbed "N imports…" row: it stands in for several modules, so resolving its (first
        // module's) docs would be misleading. Show a short hint about what selecting it does.
        if (token._clubbed) {
            _showDocPopup($hint, "<p>" + StringUtils.format(
                Strings.CODE_HINT_IMPORT_CHOOSE, token._importCount, _.escape(token.label)) + "</p>");
            return;
        }

        function present() {
            // Inline: the signature for the highlighted row. Re-inject every time (it is
            // idempotent) because the list DOM is rebuilt on each keystroke, which drops a
            // previously-injected signature. resolveCompletion is cached separately (_lspResolved),
            // so this does not cause extra LSP requests. Skip it for auto-imports - their detail is a
            // long "Add import from <module>" string that just clips uselessly; the short source-module
            // tag stays visible there instead (see CSS), and the doc popup carries the full import.
            // Also skip LONG details (some servers - intelephense - put the whole function signature
            // there, which bloats the rows): the side docs popup carries those instead.
            if (token.detail && !_isAutoImport(token) && token.detail.length <= INLINE_DETAIL_MAX_CHARS) {
                _injectInlineSignature($span, token.detail);
            }
            // Beside the list: the signature header + the (possibly long) documentation.
            _showDocPopup($hint, _docPopupHtml(token));
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
        var token = $hint.data("token") || {};

        // Clubbed "N imports…" row: don't insert anything yet. Re-open the list showing only this
        // name's import sources so the user picks the module (WebStorm's "Class to Import" flow).
        // getHints honors _importLabel on the next open; the symbol/import is inserted when a
        // concrete source is chosen there.
        if (token._clubbed) {
            this._importLabel = token.label;
            setTimeout(function () {
                CommandManager.execute(Commands.SHOW_CODE_HINTS);
            }, 0);
            return false;
        }

        var cursor = editor.getCursorPos(),
            lineText = editor.document.getLine(cursor.line),
            textEditRange = token.textEdit && token.textEdit.range,
            startCh,
            endCh = cursor.ch;
        // Anchor the replacement start on the server-provided textEdit.range.start when it is usable.
        // That start is stable as the user types forward (word/member starts don't move) and, crucially,
        // for member completions it points AT the trigger "." while newText itself includes the dot
        // (e.g. "console." + item ".log" -> replace from the "." -> "console.log", not "console..log").
        if (textEditRange && textEditRange.start.line === cursor.line &&
                textEditRange.start.character <= cursor.ch) {
            startCh = textEditRange.start.character;
            // Honor a range.end BEYOND the cursor: the server wants existing text after the caret
            // overwritten because newText includes it (e.g. JSON key completion inside autoclosed
            // quotes `"|"` - newText `"author": {$1}` covers both quotes; keeping the closing quote
            // would leave a dangling `"` behind the insert). A range.end at/before the cursor is
            // clamped TO the cursor instead: that end is stale when completions are served from
            // cache while typing continues, which would otherwise replace only part of the word
            // (e.g. "conso"+enter -> "consolenso").
            if (textEditRange.end.line === cursor.line && textEditRange.end.character > cursor.ch) {
                endCh = textEditRange.end.character;
            }
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
        // See CodeHintsProvider.hasHints - don't claim documents the server doesn't sync.
        if (!this.client || !this.client.servesDocument(editor)) {
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
            if (msgObj) {
                let res = msgObj.signatures;
                let activeParameter = msgObj.activeParameter;
                if (res && res.length) {
                    // Use the active signature (not all of them concatenated - overloads would
                    // otherwise merge their parameters into one bogus list).
                    let sig = res[msgObj.activeSignature || 0] || res[0];
                    (sig.parameters || []).forEach(function (ele) {
                        paramList.push({
                            label: ele.label,
                            documentation: ele.documentation
                        });
                    });

                    // The function name for the popup header, taken from the signature label
                    // (everything before the parameter list "("). Without this the manager falls back
                    // to the editor token at the caret - which is the just-typed "(" - producing an
                    // unbalanced "((tableName: any)".
                    let functionName = "";
                    if (typeof sig.label === "string") {
                        let paren = sig.label.indexOf("(");
                        functionName = (paren >= 0 ? sig.label.slice(0, paren) : sig.label).trim();
                    }

                    $deferredHints.resolve({
                        parameters: paramList,
                        currentIndex: activeParameter,
                        functionDocumentation: sig.documentation,
                        functionName: functionName
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
        // See CodeHintsProvider.hasHints - don't claim documents the server doesn't sync.
        if (!this.client || !this.client.servesDocument(editor)) {
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
                        })
                        .fail(function () {
                            $deferredHints.reject();
                        });
                } else { //definition is in current document
                    setJumpPosition(startCurPos);
                    $deferredHints.resolve();
                }
            } else {
                // No definition at this position (servers answer null/[] - e.g. tsserver while it
                // is still loading the project). MUST settle: an unresolved deferred here leaves
                // the NAVIGATE_JUMPTO_DEFINITION command promise pending forever.
                $deferredHints.reject();
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
        // --- quickfix (textDocument/codeAction) state ---
        this._quickFixClient = null;         // LanguageClient injected by LSPClient._registerProviders
        this._rawDiagnostics = new Map();    // filePath -> raw LSP diagnostics (setInspectionResults flattens)
        this._quickFixState = new Map();     // filePath -> {timestamp, signature} of the last fetch
        this._quickFixTimer = null;          // idle-fetch timer (cleared on every newer publish)
        // Diagnostics can arrive while their file sits in a background pane (fetches only run for
        // the active file) - when such a file becomes active, schedule the fetch it missed.
        const self = this;
        EditorManager.on("activeEditorChange", function (evt, current) {
            if (current && current.document) {
                self._scheduleQuickFixFetch(current.document.file._path);
            }
        });
    }

    LintingProvider.prototype.setClient = setClient;

    LintingProvider.prototype.clearExistingResults = function (filePath) {
        var filePathProvided = !!filePath;

        if (filePathProvided) {
            this._results.delete(filePath);
            this._promiseMap.delete(filePath);
            this._lastSignature.delete(filePath);
            this._rawDiagnostics.delete(filePath);
            this._quickFixState.delete(filePath);
        } else {
            //clear all results
            this._results.clear();
            this._promiseMap.clear();
            this._lastSignature.clear();
            this._rawDiagnostics.clear();
            this._quickFixState.clear();
        }
        if (this._quickFixTimer) {
            clearTimeout(this._quickFixTimer);
            this._quickFixTimer = null;
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
                endPos: {
                    line: obj.range.end.line,
                    ch: obj.range.end.character
                },
                message: obj.message,
                type: (obj.severity === 1 ? CodeInspection.Type.ERROR : (obj.severity === 2 ? CodeInspection.Type.WARNING : CodeInspection.Type.META))
            };
        });

        // Language servers re-publish diagnostics in waves (e.g. syntax then semantic passes) and
        // again on every edit - frequently with identical content. Re-running inspection only to
        // render the same problems rebuilds the Problems panel for nothing, which both wastes work
        // and detaches live DOM (e.g. the inline "fix" buttons a user may be clicking). Skip the
        // re-run when this file's diagnostics are unchanged from what we last surfaced. A file the
        // server has nothing to say about is first published as an EMPTY set, so treat "never
        // recorded" as already-empty - that initial empty publish must NOT count as a change, or it
        // would needlessly rebuild the panel (this was detaching fix buttons mid-click in tests).
        var signature = JSON.stringify(errors),
            previous = this._lastSignature.has(filePath) ? this._lastSignature.get(filePath) : "[]",
            changed = previous !== signature;
        this._lastSignature.set(filePath, signature);

        // Keep the EXISTING errors array when content is unchanged: the quickfix layer decorates the
        // cached errors with `fix` after an async codeAction fetch, and replacing the array on an
        // identical re-publish would silently wipe those fixes without triggering a re-fetch.
        if (changed || !this._results.has(filePath)) {
            this._results.set(filePath, {
                errors: errors
            });
        }
        if(this._promiseMap.get(filePath)) {
           this._promiseMap.get(filePath).resolve(this._results.get(filePath));
           this._promiseMap.delete(filePath);
        }
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

    // ----- quickfixes (textDocument/codeAction) ------------------------------------------------
    // Diagnostics and their fixes are separate LSP channels: fixes must be REQUESTED per range with
    // the diagnostics as context. CodeInspection needs fixes ON the errors at scan time, so the flow
    // is: retain the raw diagnostics -> idle-fetch code actions (never in the typing hot path) ->
    // decorate the cached errors with { replaceText, rangeOffset } -> requestRun() so CodeInspection
    // re-pulls and registers them (fix icons + Fix All appear). Server-agnostic: gated purely on the
    // server's codeActionProvider capability via LanguageClient.requestCodeActions.

    // Fetch this long after diagnostics settle. Typing produces a new publish per change wave, which
    // reschedules - so no codeAction traffic while the user is actively typing, and a fetched fix is
    // never dead-on-arrival (CodeInspection drops fixes whose document changed anyway).
    var QUICKFIX_IDLE_MS = 800;
    // Per-diagnostic fallback cap, for servers that don't answer a whole-file batched request.
    var MAX_QUICKFIX_REQUESTS = 20;

    /**
     * Record the raw diagnostics for a file and schedule an idle quickfix fetch. Called by the
     * publishDiagnostics handler right after setInspectionResults.
     * @param {string} filePath
     * @param {Array<Object>} rawDiagnostics - unflattened LSP diagnostics (range/code/data intact)
     */
    LintingProvider.prototype.updateQuickFixes = function (filePath, rawDiagnostics) {
        this._rawDiagnostics.set(filePath, rawDiagnostics || []);
        this._scheduleQuickFixFetch(filePath);
    };

    LintingProvider.prototype._scheduleQuickFixFetch = function (filePath) {
        var self = this;
        if (!this._quickFixClient || !this._rawDiagnostics.has(filePath)) {
            return;
        }
        var editor = EditorManager.getActiveEditor();
        if (!editor || editor.document.file._path !== filePath ||
                !this._quickFixClient.servesDocument(editor)) {
            return; // fixes are only fetched for the active, server-synced document
        }
        var state = this._quickFixState.get(filePath);
        if (state && state.timestamp === editor.document.lastChangeTimestamp &&
                state.signature === this._lastSignature.get(filePath)) {
            return; // already fetched for this exact document + diagnostics content
        }
        if (this._quickFixTimer) {
            clearTimeout(this._quickFixTimer);
        }
        this._quickFixTimer = setTimeout(function () {
            self._quickFixTimer = null;
            self._fetchQuickFixes(filePath);
        }, QUICKFIX_IDLE_MS);
    };

    /**
     * @private
     * The single admitted fix of a code action, or null. Admitted: a literal quickfix CodeAction,
     * not disabled, whose WorkspaceEdit touches EXACTLY this file with EXACTLY one TextEdit (the
     * CodeInspection fix contract is one contiguous same-document replace). Legacy bare Commands
     * (no edit to apply client-side) are skipped.
     * @return {?{replaceText:string, rangeOffset:{start:number, end:number}}}
     */
    LintingProvider.prototype._fixFromAction = function (action, editor, filePath) {
        if (!action || !action.title || action.disabled) {
            return null;
        }
        if (!action.kind || action.kind.indexOf("quickfix") !== 0) {
            return null; // not a quickfix (servers may ignore context.only), or a bare Command
        }
        var edit = action.edit;
        if (!edit) {
            return null;
        }
        var uri = null, edits = null;
        if (edit.documentChanges && edit.documentChanges.length === 1 &&
                edit.documentChanges[0].textDocument) {
            uri = edit.documentChanges[0].textDocument.uri;
            edits = edit.documentChanges[0].edits;
        } else if (edit.changes) {
            var uris = Object.keys(edit.changes);
            if (uris.length === 1) {
                uri = uris[0];
                edits = edit.changes[uri];
            }
        }
        if (!uri || !edits || edits.length !== 1 || typeof edits[0].newText !== "string") {
            return null; // multi-file / multi-edit / create-rename ops - beyond the one-replace contract
        }
        // Compare as decoded platform paths so URI encoding differences can't break the match.
        var ownUri = this._quickFixClient.uriForPath(filePath);
        if (PathConverters.uriToPath(uri) !== PathConverters.uriToPath(ownUri)) {
            return null; // edit lands in a different file
        }
        var range = edits[0].range;
        return {
            replaceText: edits[0].newText,
            // the action's human title (e.g. "Generate variable `x`") - shown as the Fix
            // button's tooltip so the user knows WHAT will be applied before clicking (servers
            // often offer generators/suppressions, not the rename the message may suggest)
            title: action.title,
            rangeOffset: {
                start: editor.indexFromPos({ line: range.start.line, ch: range.start.character }),
                end: editor.indexFromPos({ line: range.end.line, ch: range.end.character })
            }
        };
    };

    // Attach an action's fix to the cached error matching one of the action's diagnostics.
    // `forDiagnostic` pins the target in per-diagnostic fallback mode, where the request itself
    // identifies the diagnostic even when the server omits action.diagnostics.
    LintingProvider.prototype._attachFix = function (errors, action, fix, forDiagnostic) {
        var diags = (action.diagnostics && action.diagnostics.length) ? action.diagnostics
            : (forDiagnostic ? [forDiagnostic] : []);
        for (var d = 0; d < diags.length; d++) {
            var diag = diags[d];
            for (var i = 0; i < errors.length; i++) {
                var err = errors[i];
                if (err.pos.line === diag.range.start.line && err.pos.ch === diag.range.start.character &&
                        err.message === diag.message && (!err.fix || action.isPreferred)) {
                    err.fix = fix;
                    return true;
                }
            }
        }
        return false;
    };

    LintingProvider.prototype._fetchQuickFixes = async function (filePath) {
        var self = this;
        var client = this._quickFixClient;
        var editor = EditorManager.getActiveEditor();
        var diagnostics = this._rawDiagnostics.get(filePath) || [];
        var cached = this._results.get(filePath);
        if (!client || !editor || editor.document.file._path !== filePath ||
                !client.servesDocument(editor) || !diagnostics.length || !cached) {
            return;
        }
        var fetchedAt = editor.document.lastChangeTimestamp;
        // Record the fetch attempt up front so identical re-publishes don't re-fetch, even when the
        // server turns out to have no fixes for these diagnostics.
        this._quickFixState.set(filePath, {
            timestamp: fetchedAt,
            signature: this._lastSignature.get(filePath)
        });

        try {
            // One batched whole-file request first (spec-legal, one round trip for every fix)...
            var lastLine = editor.lineCount() - 1;
            var wholeFile = {
                start: { line: 0, character: 0 },
                end: { line: lastLine, character: editor.document.getLine(lastLine).length }
            };
            var actions = await client.requestCodeActions({
                filePath: filePath, range: wholeFile, diagnostics: diagnostics
            });
            var attached = 0;
            if (actions && actions.length) {
                for (var i = 0; i < actions.length; i++) {
                    var resolved = await client.resolveCodeAction(actions[i]); // no-op unless deferred
                    var fix = this._fixFromAction(resolved, editor, filePath);
                    if (fix && this._attachFix(cached.errors, resolved, fix, null)) {
                        attached++;
                    }
                }
            } else {
                // ...falling back to capped per-diagnostic requests for servers that don't answer
                // the batched form.
                var capped = diagnostics.slice(0, MAX_QUICKFIX_REQUESTS);
                for (var d = 0; d < capped.length; d++) {
                    var acts = await client.requestCodeActions({
                        filePath: filePath, range: capped[d].range, diagnostics: [capped[d]]
                    });
                    for (var a = 0; acts && a < acts.length; a++) {
                        var res = await client.resolveCodeAction(acts[a]);
                        var f = this._fixFromAction(res, editor, filePath);
                        if (f && this._attachFix(cached.errors, res, f, capped[d])) {
                            attached++;
                            break; // one fix per diagnostic
                        }
                    }
                }
            }
            // Re-render only when something changed AND the document didn't move under us (a moved
            // document gets fresh diagnostics -> a fresh fetch; its fixes would be dropped anyway).
            var activeEditor = EditorManager.getActiveEditor();
            if (attached && activeEditor && activeEditor.document.file._path === filePath &&
                    activeEditor.document.lastChangeTimestamp === fetchedAt &&
                    self._isRegisteredInspector(filePath)) {
                CodeInspection.requestRun();
            }
        } catch (err) {
            console.warn("[LSP] quickfix fetch failed:", err && (err.message || err));
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
        // See CodeHintsProvider.hasHints - don't claim documents the server doesn't sync. This
        // provider isn't handed an editor, so gate on the active one (references are always
        // requested for the focused editor).
        if (!this.client || !this.client.servesDocument(EditorManager.getActiveEditor())) {
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
    // Generic side-docs popup for code-hint lists: any hint provider's onHighlight can show
    // supplementary docs beside the list (the LSP providers' own docs use the same surface).
    // `html` is TRUSTED - escape untrusted parts before calling.
    exports.showHintDocPopup = _showDocPopup;
    exports.hideHintDocPopup = _hideDocPopup;
    exports._docPopupHtml = _docPopupHtml; // exposed for unit tests
});
