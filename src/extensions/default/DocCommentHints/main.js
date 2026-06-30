/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
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

/**
 * DocCommentHints - a language-agnostic "generate documentation comment" code hint.
 *
 * When the caret sits on a freshly typed doc-comment opener (`/**` for the JSDoc/Javadoc family,
 * `"""` for Python) the provider offers a single hint. Accepting it reads the declaration on the
 * next line, extracts its parameters, and expands a doc-comment skeleton (with Tab-navigable fields)
 * in that language's style.
 *
 * It is NOT tied to any one language server: the parameter names come from parsing the declaration,
 * so it works wherever the editor knows the language - and degrades to a bare skeleton when the
 * declaration can't be parsed. The signature source is deliberately a single seam (_parseSignature),
 * so a future enhancement can enrich types from an LSP/Tern when one is available for the language.
 *
 * The provider registers at a high priority but claims hints ONLY in the opener context, so it never
 * shadows the normal completion providers (LSP/Tern) anywhere else.
 */
define(function (require, exports, module) {


    const AppInit         = brackets.getModule("utils/AppInit"),
        CodeHintManager   = brackets.getModule("editor/CodeHintManager"),
        EditorManager     = brackets.getModule("editor/EditorManager"),
        TabstopManager    = brackets.getModule("editor/TabstopManager"),
        Strings           = brackets.getModule("strings");

    // Above the LSP (1) and Tern (0) hint providers - safe because hasHints only claims the opener
    // context, where those providers have nothing useful to offer anyway.
    const PROVIDER_PRIORITY = 100;

    const STYLE_JSDOC = "jsdoc",
        STYLE_PYDOC   = "pydoc";

    // Per-language config: the doc-comment style, where a parameter's NAME sits in a declaration
    // ("first" -> `name: Type` / `name` / `$name`; "last" -> `Type name`, the C/Java family), and
    // which opener triggers the hint.
    const LANGUAGES = {
        javascript: { style: STYLE_JSDOC, params: "first", opener: "block" },
        typescript: { style: STYLE_JSDOC, params: "first", opener: "block" },
        jsx: { style: STYLE_JSDOC, params: "first", opener: "block" },
        tsx: { style: STYLE_JSDOC, params: "first", opener: "block" },
        php: { style: STYLE_JSDOC, params: "first", opener: "block" },
        rust: { style: STYLE_JSDOC, params: "first", opener: "block" },
        java: { style: STYLE_JSDOC, params: "last",  opener: "block" },
        c: { style: STYLE_JSDOC, params: "last",  opener: "block" },
        cpp: { style: STYLE_JSDOC, params: "last",  opener: "block" },
        python: { style: STYLE_PYDOC, params: "first", opener: "pydoc" }
    };

    // Opener: `full` is the canonical opener (offered unconditionally); `partial` also matches the
    // half-typed forms (`/`, `/*`) so the hint can appear as soon as the user starts the comment -
    // but a partial match is only offered when a documentable declaration sits next to it (see
    // _openerContext), so a stray `/` on a line never spams the list. `chars` are the keystrokes that
    // may trigger an implicit request; `dir` is where the documented declaration lives relative to the
    // opener (below it for block comments, above it for a Python docstring).
    const OPENERS = {
        block: { full: /^\s*\/\*\*$/, partial: /^\s*\/\*{0,2}$/, chars: "/*", dir: "below" },
        pydoc: { full: /^\s*"""$/, partial: /^\s*"""$/, chars: "\"", dir: "above" }
    };

    function _configFor(editor) {
        return LANGUAGES[editor.getLanguageForSelection().getId()] || null;
    }

    // ----- signature parsing -----------------------------------------------------------------

    function _delta(ch) {
        if (ch === "(" || ch === "[" || ch === "{" || ch === "<") { return 1; }
        if (ch === ")" || ch === "]" || ch === "}" || ch === ">") { return -1; }
        return 0;
    }

    // The declaration the doc comment documents, joining wrapped lines until its parameter parens
    // balance. `dir` is "below" (block comments sit above the declaration) or "above" (a Python
    // docstring sits inside, just under the `def`). Returns the declaration text, or null if none.
    function _declarationFor(editor, openerLine, dir) {
        const lastLine = editor.lineCount() - 1;
        const step = dir === "above" ? -1 : 1;
        let l = openerLine + step;
        while (l >= 0 && l <= lastLine && editor.document.getLine(l).trim() === "") {
            l += step;
        }
        if (l < 0 || l > lastLine) {
            return null;
        }
        let text = editor.document.getLine(l);
        let guard = 0;
        // A wrapped signature leaves the parens unbalanced; pull in adjacent lines until they close.
        // (Below: extra "(" to the right; above: extra ")" to the left.)
        while (_parenDepth(text) !== 0 && l > 0 && l < lastLine && guard < 30) {
            l += step;
            text = step > 0 ? text + " " + editor.document.getLine(l) : editor.document.getLine(l) + " " + text;
            guard++;
        }
        return text;
    }

    function _parenDepth(text) {
        let depth = 0;
        for (let i = 0; i < text.length; i++) {
            if (text[i] === "(") { depth++; } else if (text[i] === ")") { depth--; }
        }
        return depth;
    }

    // Split a parameter list on top-level commas, ignoring commas nested in (), [], {}, <>.
    function _splitParams(s) {
        const out = [];
        let depth = 0, start = 0;
        for (let i = 0; i < s.length; i++) {
            depth += _delta(s[i]);
            if (s[i] === "," && depth === 0) {
                out.push(s.slice(start, i));
                start = i + 1;
            }
        }
        if (s.slice(start).trim() !== "") {
            out.push(s.slice(start));
        }
        return out;
    }

    const IDENT = /[A-Za-z_][\w]*/g;
    const PARAMS_TO_SKIP = { self: true, cls: true, this: true, void: true };

    // Extract a clean parameter name from one parameter token per the language's name convention.
    function _paramName(token, convention) {
        let t = token.trim();
        if (!t) {
            return null;
        }
        // Drop a default value (top-level '=').
        let depth = 0;
        for (let i = 0; i < t.length; i++) {
            depth += _delta(t[i]);
            if (t[i] === "=" && depth === 0) {
                t = t.slice(0, i);
                break;
            }
        }
        t = t.replace(/\.\.\./g, " ").trim(); // rest/spread
        if (convention === "first") {
            // `name`, `name: Type`, `$name` (PHP). Keep a leading $ if present.
            const m = t.match(/^[*&\s]*(\$?[A-Za-z_][\w]*)/);
            return m ? m[1] : null;
        }
        // "last": C/Java `Type name`, `const char *name` -> the trailing identifier is the name.
        const ids = t.match(IDENT);
        return ids && ids.length ? ids[ids.length - 1] : null;
    }

    /**
     * Parse a declaration line into a documentable signature. `isDeclaration` is true only when the
     * text actually looks like something to document (a function/method - has a parameter list - or a
     * class), which is what gates the half-typed `/` `/*` triggers.
     * @return {?{params: string[], isClass: boolean, hasReturn: boolean, isDeclaration: boolean}}
     */
    function _parseSignature(declText, convention) {
        if (!declText) {
            return null;
        }
        const open = declText.indexOf("(");
        const classMatch = /\b(class|interface|struct|enum|trait)\b/.exec(declText);
        if (classMatch && (open === -1 || classMatch.index < open)) {
            return { params: [], isClass: true, hasReturn: false, isDeclaration: true };
        }
        if (open === -1) {
            return { params: [], isClass: false, hasReturn: false, isDeclaration: false };
        }
        let depth = 0, close = -1;
        for (let i = open; i < declText.length; i++) {
            if (declText[i] === "(") {
                depth++;
            } else if (declText[i] === ")") {
                depth--;
                if (depth === 0) { close = i; break; }
            }
        }
        const inner = close === -1 ? declText.slice(open + 1) : declText.slice(open + 1, close);
        const params = [];
        _splitParams(inner).forEach(function (tok) {
            const name = _paramName(tok, convention);
            if (name && !PARAMS_TO_SKIP[name]) {
                params.push(name);
            }
        });
        // Return: a constructor returns nothing; an explicit `void`/`None`/`-> ()` return type is void.
        const after = close === -1 ? "" : declText.slice(close + 1);
        const isCtor = /\b(constructor|__init__)\b/.test(declText) || /\bvoid\s+\w+\s*\(/.test(declText);
        const isVoid = /:\s*void\b/.test(after) || /->\s*(None|\(\s*\))/.test(after) || isCtor;
        return { params: params, isClass: false, hasReturn: !isVoid, isDeclaration: true };
    }

    // ----- snippet building ------------------------------------------------------------------

    // Escape text inserted literally into an LSP-style snippet ($ } \ are special).
    function _esc(text) {
        return String(text).replace(/[\\$}]/g, "\\$&");
    }

    function _buildJsDoc(sig, indent) {
        const star = indent + " * ";
        const out = ["/**", star + "${1:" + _escDesc(Strings.DOC_COMMENT_SUMMARY) + "}"];
        let stop = 2;
        if (sig && !sig.isClass) {
            // Tabstop on the {type} only; no trailing description stub (an empty tabstop would leave a
            // trailing space that linters flag). Descriptions are added inline by the user.
            sig.params.forEach(function (p) {
                out.push(star + "@param {${" + (stop++) + ":*}} " + _esc(p));
            });
            if (sig.hasReturn) {
                out.push(star + "@returns {${" + (stop++) + ":*}}");
            }
        }
        out.push(indent + " */");
        return out.join("\n");
    }

    function _buildPyDoc(sig, indent) {
        const out = ['"""${1:' + _escDesc(Strings.DOC_COMMENT_SUMMARY) + "}"];
        let stop = 2;
        const desc = _escDesc(Strings.DOC_COMMENT_DESC);
        if (sig && sig.params.length) {
            out.push("");
            out.push(indent + "Args:");
            // Non-empty placeholder (selected on tab) so the line carries no trailing whitespace.
            sig.params.forEach(function (p) {
                out.push(indent + "    " + _esc(p) + ": ${" + (stop++) + ":" + desc + "}");
            });
        }
        if (sig && sig.hasReturn) {
            out.push("");
            out.push(indent + "Returns:");
            out.push(indent + "    ${" + (stop++) + ":" + desc + "}");
        }
        out.push(indent + '"""');
        return out.join("\n");
    }

    // The summary placeholder is literal default text inside ${1:...} - only } and \ need escaping.
    function _escDesc(text) {
        return String(text).replace(/[\\}]/g, "\\$&");
    }

    function _buildSnippet(style, sig, indent) {
        return style === STYLE_PYDOC ? _buildPyDoc(sig, indent) : _buildJsDoc(sig, indent);
    }

    // ----- the hint provider -----------------------------------------------------------------

    // Decide whether the caret is in a doc-comment-opener context worth offering the hint for, and
    // gather the declaration it would document. The full opener (`/**`, `"""`) is always offered; a
    // half-typed opener (`/`, `/*`) is offered only when an actual declaration sits next to it.
    // `implicitChar` is the just-typed char (null for an explicit/refresh request).
    function _openerContext(editor, implicitChar) {
        const cfg = _configFor(editor);
        if (!cfg) {
            return null;
        }
        const opener = OPENERS[cfg.opener];
        if (implicitChar && opener.chars.indexOf(implicitChar) === -1) {
            return null;
        }
        const cursor = editor.getCursorPos();
        const before = editor.document.getLine(cursor.line).slice(0, cursor.ch);
        if (opener.full.test(before)) {
            return { cfg: cfg };
        }
        if (opener.partial.test(before)) {
            const sig = _parseSignature(_declarationFor(editor, cursor.line, opener.dir), cfg.params);
            if (sig && sig.isDeclaration) {
                return { cfg: cfg };
            }
        }
        return null;
    }

    function DocCommentHintProvider() {}

    DocCommentHintProvider.prototype.hasHints = function (editor, implicitChar) {
        this.editor = editor;
        const ctx = _openerContext(editor, implicitChar);
        this._style = ctx && ctx.cfg.style;
        return !!ctx;
    };

    DocCommentHintProvider.prototype.getHints = function () {
        // Re-validate: end the session if the caret moved out of the opener context (e.g. the user
        // kept typing past `/`), so the hint doesn't linger inappropriately.
        if (!this.editor || !_openerContext(this.editor, null)) {
            return null;
        }
        // A clear, language-aware action label - not a cryptic "/**/". The leading marker echoes the
        // doc-comment syntax so it reads as "insert a doc comment here".
        const isPy = this._style === STYLE_PYDOC;
        const label = isPy ? Strings.DOC_COMMENT_ADD_DOCSTRING : Strings.DOC_COMMENT_ADD_JSDOC;
        const $hint = $("<span>")
            .addClass("doc-comment-hint")
            .data("docComment", true)
            .append($("<span>").addClass("doc-comment-hint-marker").text(isPy ? '"""' : "/**"))
            .append($("<span>").addClass("doc-comment-hint-label").text(" " + label));
        return { hints: [$hint], match: null, selectInitial: true, handleWideResults: true };
    };

    DocCommentHintProvider.prototype.insertHint = function () {
        const editor = this.editor || EditorManager.getActiveEditor();
        const cfg = editor && _configFor(editor);
        if (!editor || !cfg) {
            return false;
        }
        const cursor = editor.getCursorPos();
        const line = editor.document.getLine(cursor.line);
        const indent = (line.match(/^\s*/) || [""])[0];

        const decl = _declarationFor(editor, cursor.line, OPENERS[cfg.opener].dir);
        const sig = _parseSignature(decl, cfg.params);
        const snippet = _buildSnippet(cfg.style, sig, indent);

        // Replace the opener the user typed (from the start of `/**` / `"""` up to the caret).
        const startPos = { line: cursor.line, ch: indent.length };
        const endPos = { line: cursor.line, ch: cursor.ch };
        TabstopManager.insertSnippet(editor, snippet, startPos, endPos);
        return false;
    };

    AppInit.appReady(function () {
        const provider = new DocCommentHintProvider();
        CodeHintManager.registerHintProvider(provider, Object.keys(LANGUAGES), PROVIDER_PRIORITY);
    });

    // Exposed for unit tests.
    exports._parseSignature = _parseSignature;
    exports._buildSnippet = _buildSnippet;
    exports._splitParams = _splitParams;
    exports._paramName = _paramName;
});
