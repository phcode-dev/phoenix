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

    // Doc-comment styles. The `/** */` syntax is shared, but the convention differs:
    //   jsdoc  - @param {type} name / @returns {type}            (JS/TS family)
    //   phpdoc - @param type $name / @return type                (PHP: type before the $name)
    //   tagdoc - @param name / @return                           (Javadoc & Doxygen: no {type} braces)
    //   pydoc  - """ ... Args:/Returns: ... """                  (Python docstring)
    const STYLE_JSDOC = "jsdoc",
        STYLE_PHPDOC  = "phpdoc",
        STYLE_TAGDOC  = "tagdoc",
        STYLE_PYDOC   = "pydoc";

    // Per-language config: the doc-comment style, where a parameter's NAME sits in a declaration
    // ("first" -> `name: Type` / `name` / `$name`; "last" -> `Type name`, the C/Java family), which
    // opener triggers the hint, and the (localized) label naming that language's convention. Rust is
    // intentionally absent: its doc comments are `///` markdown (# Arguments), not `/** @param */`.
    const LANGUAGES = {
        javascript: { style: STYLE_JSDOC, params: "first", opener: "block", label: "DOC_COMMENT_ADD_JSDOC" },
        typescript: { style: STYLE_JSDOC, params: "first", opener: "block", label: "DOC_COMMENT_ADD_JSDOC" },
        jsx: { style: STYLE_JSDOC, params: "first", opener: "block", label: "DOC_COMMENT_ADD_JSDOC" },
        tsx: { style: STYLE_JSDOC, params: "first", opener: "block", label: "DOC_COMMENT_ADD_JSDOC" },
        php: { style: STYLE_PHPDOC, params: "first", opener: "block", label: "DOC_COMMENT_ADD_PHPDOC" },
        java: { style: STYLE_TAGDOC, params: "last", opener: "block", label: "DOC_COMMENT_ADD_JAVADOC" },
        c: { style: STYLE_TAGDOC, params: "last", opener: "block", label: "DOC_COMMENT_ADD_DOXYGEN" },
        cpp: { style: STYLE_TAGDOC, params: "last", opener: "block", label: "DOC_COMMENT_ADD_DOXYGEN" },
        python: { style: STYLE_PYDOC, params: "first", opener: "pydoc", label: "DOC_COMMENT_ADD_DOCSTRING" }
    };

    // Opener config:
    //   full      - the canonical opener; offered unconditionally unless `alwaysGate`.
    //   partial   - also matches half-typed forms (`/`, `/*`, or `"`/`""` once auto-close kicks in) so
    //               the hint appears as the user starts the comment; only offered with an adjacent
    //               declaration (see _openerContext), so a stray `/` or empty string never spams it.
    //   chars     - keystrokes that may trigger an implicit (type-as-you-go) request.
    //   dir       - where the documented declaration lives: "below" (block comment above a function)
    //               or "above" (a Python docstring sits under its `def`/`class`).
    //   fullLine  - match the trimmed full line, not just text-before-cursor. Python needs this because
    //               typing `"` auto-closes to `""` with the caret between the quotes.
    //   alwaysGate- require a declaration even for the full opener (Python: a lone `"""`/`""` with no
    //               `def`/`class` above is just an empty string literal, not a docstring).
    //   replaceLine- on insert, replace the whole line (to swallow auto-closed quotes) vs only up to
    //               the caret.
    const OPENERS = {
        block: {
            full: /^\s*\/\*\*$/, partial: /^\s*\/\*{0,2}$/, chars: "/*", dir: "below",
            fullLine: false, alwaysGate: false, replaceLine: false
        },
        pydoc: {
            full: /^\s*"{3,6}$/, partial: /^\s*"{1,6}$/, chars: "\"", dir: "above",
            fullLine: true, alwaysGate: true, replaceLine: true
        }
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
        // `hasReturnType` is stricter - an EXPLICIT non-None return annotation (`-> Type`). Python uses
        // it (no annotation -> we can't tell, and most untyped Python returns None, so we omit Returns
        // rather than guess); the C-family/JS keep the looser `hasReturn` (their signature implies it).
        const after = close === -1 ? "" : declText.slice(close + 1);
        const isCtor = /\b(constructor|__init__)\b/.test(declText) || /\bvoid\s+\w+\s*\(/.test(declText);
        const isVoid = /:\s*void\b/.test(after) || /->\s*(None|\(\s*\))/.test(after) || isCtor;
        const hasReturnType = /->\s*(?!None\b)[A-Za-z_]/.test(after);
        return {
            params: params, isClass: false, hasReturn: !isVoid,
            hasReturnType: hasReturnType, isDeclaration: true
        };
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

    // PHPDoc: `@param type $name`, `@return type`. The type sits before the (kept) $name, no braces.
    function _buildPhpDoc(sig, indent) {
        const star = indent + " * ";
        const out = ["/**", star + "${1:" + _escDesc(Strings.DOC_COMMENT_SUMMARY) + "}"];
        let stop = 2;
        if (sig && !sig.isClass) {
            sig.params.forEach(function (p) {
                out.push(star + "@param ${" + (stop++) + ":mixed} " + _esc(p));
            });
            if (sig.hasReturn) {
                out.push(star + "@return ${" + (stop++) + ":mixed}");
            }
        }
        out.push(indent + " */");
        return out.join("\n");
    }

    // Javadoc / Doxygen: `@param name`, `@return` - no {type} braces (types come from the signature),
    // and the singular `@return`. The only tabstop is the summary; param names are pre-filled.
    function _buildTagDoc(sig, indent) {
        const star = indent + " * ";
        const out = ["/**", star + "${1:" + _escDesc(Strings.DOC_COMMENT_SUMMARY) + "}"];
        if (sig && !sig.isClass) {
            sig.params.forEach(function (p) {
                out.push(star + "@param " + _esc(p));
            });
            if (sig.hasReturn) {
                out.push(star + "@return");
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
        // Only document a return when the signature explicitly annotates one (`-> Type`); an untyped
        // Python function usually returns None, so we don't guess a Returns section.
        if (sig && sig.hasReturnType) {
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
        switch (style) {
        case STYLE_PYDOC:  return _buildPyDoc(sig, indent);
        case STYLE_PHPDOC: return _buildPhpDoc(sig, indent);
        case STYLE_TAGDOC: return _buildTagDoc(sig, indent);
        default:           return _buildJsDoc(sig, indent);
        }
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
        const lineText = editor.document.getLine(cursor.line);
        // Python matches the whole (trimmed) line so auto-closed quotes (caret inside `""`) still count;
        // block comments match only what's left of the caret.
        const text = opener.fullLine ? lineText.trim() : lineText.slice(0, cursor.ch);
        if (!opener.partial.test(text)) {
            return null;
        }
        // A full opener is offered as-is, unless this language always requires a declaration nearby
        // (Python, to tell a docstring apart from a bare empty-string literal).
        if (opener.full.test(text) && !opener.alwaysGate) {
            return { cfg: cfg };
        }
        const sig = _parseSignature(_declarationFor(editor, cursor.line, opener.dir), cfg.params);
        if (sig && sig.isDeclaration) {
            return { cfg: cfg };
        }
        return null;
    }

    function DocCommentHintProvider() {}

    DocCommentHintProvider.prototype.hasHints = function (editor, implicitChar) {
        this.editor = editor;
        const ctx = _openerContext(editor, implicitChar);
        this._cfg = ctx && ctx.cfg;
        return !!ctx;
    };

    DocCommentHintProvider.prototype.getHints = function () {
        // Re-validate: end the session if the caret moved out of the opener context (e.g. the user
        // kept typing past `/`), so the hint doesn't linger inappropriately.
        if (!this.editor || !_openerContext(this.editor, null)) {
            return null;
        }
        // A clear, language-aware action label (JSDoc / Javadoc / Doxygen / PHPDoc / docstring) - not a
        // cryptic "/**/". The leading marker echoes the doc-comment syntax for that language.
        const cfg = this._cfg;
        const marker = OPENERS[cfg.opener].dir === "above" ? '"""' : "/**";
        const $hint = $("<span>")
            .addClass("doc-comment-hint")
            .data("docComment", true)
            .append($("<span>").addClass("doc-comment-hint-marker").text(marker))
            .append($("<span>").addClass("doc-comment-hint-label").text(" " + Strings[cfg.label]));
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

        const opener = OPENERS[cfg.opener];
        const decl = _declarationFor(editor, cursor.line, opener.dir);
        const sig = _parseSignature(decl, cfg.params);
        const snippet = _buildSnippet(cfg.style, sig, indent);

        // Replace the opener the user typed: from the start of `/**` / `"""`. For Python we replace the
        // whole line (ch = line length) to swallow the quote that auto-close added after the caret;
        // for block comments we stop at the caret (anything the user typed after is left alone).
        const startPos = { line: cursor.line, ch: indent.length };
        const endPos = { line: cursor.line, ch: opener.replaceLine ? line.length : cursor.ch };
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
    exports._Provider = DocCommentHintProvider;
    exports._LANGUAGES = LANGUAGES;
});
