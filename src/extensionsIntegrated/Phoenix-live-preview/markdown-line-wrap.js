/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 *
 * This program is free software: you can redistribute it and/or modify it
 * under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at your
 * option) any later version.
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

// Line-scoped markdown reflow. Used by MarkdownSync to wrap only the lines
// the user actually edited in the md viewer, leaving everything else
// byte-identical. Turndown emits each block as one logical line regardless
// of width; this module reintroduces wrapping per line, indent-aware, so
// the editor's max-line-length guide is honored without running a full
// markdown formatter on save.
//
// Pure function module — no Phoenix dependencies. Wrap algorithm is
// deliberately conservative: when in doubt, do not touch the line.

define(function (require, exports, module) {

    // Lines matching any of these patterns are passed through unchanged.
    // The renderer treats them as structural and wrapping would corrupt
    // them (table cells, link reference definitions, hr, setext underlines).
    const RE_HR = /^[ ]{0,3}([-*_])[ \t]*(?:\1[ \t]*){2,}$/;
    const RE_ATX_HEADING = /^[ ]{0,3}#{1,6}(\s|$)/;
    const RE_SETEXT_UNDERLINE = /^[ ]{0,3}(=+|-+)\s*$/;
    const RE_LINK_REF_DEF = /^[ ]{0,3}\[[^\]]+\]:\s/;
    const RE_TABLE_LINE = /^\s*\|.*\|\s*$/;
    const RE_FENCE_OPEN = /^(\s*)(`{3,}|~{3,})/;
    const RE_HTML_BLOCK_OPEN = /^[ ]{0,3}<(?:[a-zA-Z][a-zA-Z0-9-]*|!--)/;

    // Inline atoms we must not split: image-only links, image links, inline
    // links, inline code, inline HTML tags. Greedy alternation, in priority
    // order — the image-only-link pattern must precede the plain link pattern
    // so a nested badge-row like [![a](u) ![b](u)](url) stays a single atom.
    const RE_INLINE_ATOM = new RegExp([
        "\\[(?:!\\[[^\\]\\n]*\\]\\([^)\\n]*\\)\\s*)+\\]\\([^)\\n]*\\)", // [![alt](src) ![alt](src) ...](href)
        "!\\[[^\\]\\n]*\\]\\([^)\\n]*\\)",      // image: ![alt](src)
        "\\[[^\\]\\n]*\\]\\([^)\\n]*\\)",       // link:  [text](url)
        "`+[^`\\n]+`+",                           // inline code
        "<[a-zA-Z/][^>\\n]*>"                    // inline HTML tag
    ].join("|"), "g");

    // Detect the line-leading construct that determines indent context.
    //   "- foo"     -> { indent: "", marker: "- ",   contIndent: "  " }
    //   "  - foo"   -> { indent: "  ", marker: "- ", contIndent: "    " }
    //   "1. foo"    -> { indent: "", marker: "1. ",  contIndent: "   " }
    //   "> foo"     -> { indent: "", marker: "> ",   contIndent: "> "  }
    //   "  foo"     -> { indent: "  ", marker: "",   contIndent: "  "  }
    //   "foo"       -> { indent: "", marker: "",     contIndent: ""    }
    function _detectLeading(line) {
        const m = line.match(/^([ \t]*)(?:([-*+])[ \t]+|(\d+)[.)][ \t]+|(>[ \t]?))?/);
        const indent = m[1] || "";
        if (m[2]) {
            const marker = m[2] + " ";
            return {
                indent,
                marker,
                contIndent: indent + " ".repeat(marker.length),
                contentStart: m[0].length
            };
        }
        if (m[3]) {
            const marker = m[3] + ". ";
            return {
                indent,
                marker,
                contIndent: indent + " ".repeat(marker.length),
                contentStart: m[0].length
            };
        }
        if (m[4]) {
            // Blockquote — continuation must repeat the "> " marker so the
            // renderer keeps the next line inside the quote.
            return {
                indent,
                marker: m[4],
                contIndent: indent + "> ",
                contentStart: m[0].length
            };
        }
        return {
            indent,
            marker: "",
            contIndent: indent,
            contentStart: indent.length
        };
    }

    // Split text into atoms: inline markdown constructs stay whole, the
    // rest is whitespace-separated tokens. Inter-token whitespace is collapsed
    // to a single space at join time.
    function _tokenize(text) {
        const tokens = [];
        let lastIdx = 0;
        let m;
        RE_INLINE_ATOM.lastIndex = 0;
        while ((m = RE_INLINE_ATOM.exec(text)) !== null) {
            // Words before this atom
            const pre = text.substring(lastIdx, m.index);
            for (const w of pre.split(/\s+/)) {
                if (w) { tokens.push(w); }
            }
            tokens.push(m[0]);
            lastIdx = m.index + m[0].length;
        }
        // Trailing words
        const tail = text.substring(lastIdx);
        for (const w of tail.split(/\s+/)) {
            if (w) { tokens.push(w); }
        }
        return tokens;
    }

    // Greedy packer: fill each line up to `width`, never splitting a token.
    // A single token longer than `width` (e.g. a long URL) gets its own line
    // even though it overflows — splitting it would change semantics.
    function _packTokens(tokens, width) {
        const lines = [];
        let cur = "";
        for (const tok of tokens) {
            if (cur === "") {
                cur = tok;
            } else if (cur.length + 1 + tok.length <= width) {
                cur += " " + tok;
            } else {
                lines.push(cur);
                cur = tok;
            }
        }
        if (cur) { lines.push(cur); }
        return lines;
    }

    // Balanced packer: distribute tokens so the resulting lines are roughly
    // equal length while still respecting `width` as a hard maximum. Critical
    // for cursor-sync alignment in the markdown viewer: with greedy packing,
    // the last line is a tiny remainder and the first line absorbs ~all the
    // content, so the per-source-line spans in the iframe become wildly
    // uneven and visual line N rarely matches source line N. Balancing makes
    // each span cover a comparable visual area in the rendered paragraph.
    //
    // Strategy: greedy first to learn the minimum line count N. Then binary
    // search for the smallest width that still produces exactly N lines —
    // that width gives the most even distribution (each line fills as much
    // as it can without spilling into an extra line).
    function _balancedPack(tokens, width) {
        if (tokens.length <= 1) {
            return _packTokens(tokens, width);
        }
        const greedy = _packTokens(tokens, width);
        if (greedy.length <= 1) {
            return greedy;
        }
        const N = greedy.length;
        let lo = 0;
        for (const t of tokens) {
            if (t.length > lo) { lo = t.length; }
        }
        let hi = width;
        let best = greedy;
        while (lo <= hi) {
            const mid = Math.floor((lo + hi) / 2);
            const trial = _packTokens(tokens, mid);
            if (trial.length <= N) {
                best = trial;
                hi = mid - 1;
            } else {
                lo = mid + 1;
            }
        }
        return best;
    }

    // Wrap one logical line to printWidth, respecting indent context.
    // Returns an array of physical lines (the input line replaced by these).
    function _wrapLine(line, printWidth) {
        const ctx = _detectLeading(line);
        const content = line.substring(ctx.contentStart);
        if (!content.trim()) {
            return [line];
        }
        const tokens = _tokenize(content);
        if (tokens.length <= 1) {
            // Nothing to break on
            return [line];
        }
        const firstWidth = printWidth - (ctx.indent.length + ctx.marker.length);
        const restWidth = printWidth - ctx.contIndent.length;
        if (firstWidth <= 0 || restWidth <= 0) {
            return [line];
        }
        // For a single logical line we balance across ALL output lines as one
        // unit (first + rest share the same width, since contIndent matches
        // indent + marker width for paragraph/list contexts in practice).
        // If first-line and continuation widths differ significantly we fall
        // back to greedy on the rest portion.
        if (firstWidth === restWidth) {
            const allLines = _balancedPack(tokens, firstWidth);
            if (allLines.length === 0) {
                return [line];
            }
            const out = [ctx.indent + ctx.marker + allLines[0]];
            for (let i = 1; i < allLines.length; i++) {
                out.push(ctx.contIndent + allLines[i]);
            }
            return out;
        }
        // Asymmetric first/continuation widths (e.g. ordered list "12. " marker
        // wider than continuation indent). Pack the first line greedily, then
        // balance the remainder.
        const firstLineTokens = [];
        const restTokens = [];
        let used = 0;
        let consumed = 0;
        for (const tok of tokens) {
            const extra = firstLineTokens.length === 0 ? tok.length : tok.length + 1;
            if (used + extra <= firstWidth) {
                firstLineTokens.push(tok);
                used += extra;
                consumed++;
            } else {
                break;
            }
        }
        for (let i = consumed; i < tokens.length; i++) {
            restTokens.push(tokens[i]);
        }
        if (firstLineTokens.length === 0) {
            firstLineTokens.push(tokens[0]);
            for (let i = 1; i < tokens.length; i++) { restTokens.push(tokens[i]); }
        }
        const out = [ctx.indent + ctx.marker + firstLineTokens.join(" ")];
        if (restTokens.length === 0) {
            return out;
        }
        const restLines = _balancedPack(restTokens, restWidth);
        for (const rl of restLines) {
            out.push(ctx.contIndent + rl);
        }
        return out;
    }

    // True iff the line, with its surrounding context, is a candidate for
    // wrapping. Lines inside fenced code, tables, HTML blocks etc. are not.
    function _isWrappable(line, state) {
        if (state.inFence || state.inHtmlBlock || state.inFrontmatter) {
            return false;
        }
        if (!line.trim()) {
            return false;
        }
        if (RE_HR.test(line) || RE_ATX_HEADING.test(line) ||
                RE_SETEXT_UNDERLINE.test(line) || RE_LINK_REF_DEF.test(line) ||
                RE_TABLE_LINE.test(line)) {
            return false;
        }
        return true;
    }

    // Walk lines tracking enter/exit of fenced code, HTML blocks, frontmatter.
    // Caller uses the per-line state to gate wrapping decisions.
    function _scanState(lines) {
        const state = new Array(lines.length);
        let inFence = false;
        let fenceChar = "";
        let fenceLen = 0;
        let inHtmlBlock = false;
        let inFrontmatter = false;
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (i === 0 && line.trim() === "---") {
                inFrontmatter = true;
                state[i] = { inFence, inHtmlBlock, inFrontmatter };
                continue;
            }
            if (inFrontmatter) {
                state[i] = { inFence, inHtmlBlock, inFrontmatter };
                if (line.trim() === "---" || line.trim() === "...") {
                    inFrontmatter = false;
                }
                continue;
            }
            if (inFence) {
                state[i] = { inFence, inHtmlBlock, inFrontmatter };
                const close = new RegExp("^\\s*" + fenceChar + "{" + fenceLen + ",}\\s*$");
                if (close.test(line)) {
                    inFence = false;
                    fenceChar = "";
                    fenceLen = 0;
                }
                continue;
            }
            const fm = line.match(RE_FENCE_OPEN);
            if (fm) {
                inFence = true;
                fenceChar = fm[2][0];
                fenceLen = fm[2].length;
                state[i] = { inFence: true, inHtmlBlock, inFrontmatter };
                continue;
            }
            if (inHtmlBlock) {
                state[i] = { inFence, inHtmlBlock, inFrontmatter };
                if (!line.trim()) {
                    inHtmlBlock = false;
                }
                continue;
            }
            if (RE_HTML_BLOCK_OPEN.test(line)) {
                inHtmlBlock = true;
                state[i] = { inFence, inHtmlBlock: true, inFrontmatter };
                continue;
            }
            state[i] = { inFence, inHtmlBlock, inFrontmatter };
        }
        return state;
    }

    /**
     * Wrap lines in `newText` that differ from `oldText` and exceed `printWidth`.
     * Lines that didn't change stay byte-identical. Lines inside fenced code,
     * tables, HTML blocks, frontmatter, and other structural constructs are
     * never wrapped.
     *
     * @param {string} oldText - Previous content (CM document text).
     * @param {string} newText - New content from Turndown roundtrip.
     * @param {number} printWidth - Max line length (e.g. editor guide).
     * @returns {string} Possibly modified `newText` with edited long lines wrapped.
     */
    function wrapEditedLines(oldText, newText, printWidth) {
        if (typeof printWidth !== "number" || printWidth < 20) {
            return newText;
        }
        if (oldText === newText) {
            return newText;
        }
        const oldLines = oldText.split("\n");
        const newLines = newText.split("\n");

        // Line-range diff using prefix/suffix scan — mirrors _applyDiffToEditor's
        // character-level approach but at line granularity. Lines outside this
        // range are guaranteed identical and stay untouched.
        let prefix = 0;
        const minLen = Math.min(oldLines.length, newLines.length);
        while (prefix < minLen && oldLines[prefix] === newLines[prefix]) {
            prefix++;
        }
        let oldSuf = oldLines.length;
        let newSuf = newLines.length;
        while (oldSuf > prefix && newSuf > prefix &&
                oldLines[oldSuf - 1] === newLines[newSuf - 1]) {
            oldSuf--;
            newSuf--;
        }

        if (prefix === newSuf) {
            // Only deletions — nothing to wrap.
            return newText;
        }

        // Fast path: if no changed line exceeds printWidth, skip the regex-heavy
        // state scan and the result rebuild entirely. This is the common case
        // for every keystroke that doesn't push a line past the guide.
        let anyOverflow = false;
        for (let i = prefix; i < newSuf; i++) {
            if (newLines[i].length > printWidth) {
                anyOverflow = true;
                break;
            }
        }
        if (!anyOverflow) {
            return newText;
        }

        const state = _scanState(newLines);
        const result = [];
        for (let i = 0; i < prefix; i++) {
            result.push(newLines[i]);
        }
        for (let i = prefix; i < newSuf; i++) {
            const line = newLines[i];
            if (line.length <= printWidth) {
                result.push(line);
                continue;
            }
            if (!_isWrappable(line, state[i])) {
                result.push(line);
                continue;
            }
            const wrapped = _wrapLine(line, printWidth);
            for (const w of wrapped) { result.push(w); }
        }
        for (let i = newSuf; i < newLines.length; i++) {
            result.push(newLines[i]);
        }
        return result.join("\n");
    }

    exports.wrapEditedLines = wrapEditedLines;
    // Exported for tests:
    exports._detectLeading = _detectLeading;
    exports._tokenize = _tokenize;
    exports._wrapLine = _wrapLine;
});
