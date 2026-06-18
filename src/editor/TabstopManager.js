/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 *
 * This program is free software: you can redistribute it and/or modify it under
 * the terms of the GNU Affero General Public License as published by the Free
 * Software Foundation, either version 3 of the License, or (at your option) any
 * later version.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY
 * WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A
 * PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License along
 * with this program. If not, see https://www.gnu.org/licenses/.
 *
 */

/**
 * TabstopManager - a small, reusable engine for inserting "snippet" text that carries tab-stops and
 * placeholders, and for letting the user cycle through those stops with Tab / Shift-Tab.
 *
 * It understands the LSP snippet grammar (which is the same one VS Code, Emmet and TextMate use):
 *   - `$1`, `$2`, ... ordered tab-stops, `$0` the final caret
 *   - `${1:placeholder}` a tab-stop pre-filled with default text that gets selected for type-over
 *   - `${1|a,b,c|}` a choice (we take the first option)
 *   - `${VAR}` / `${VAR:default}` variables (unresolved vars contribute nothing / their default)
 *   - the escapes `\$`, `\}`, `\\`
 *
 * Two ways to use it:
 *   - `parseSnippet(text)` -> `{ text, stops }` for callers that only need the expanded plain text
 *     and the stop offsets (e.g. to place a single caret themselves).
 *   - `insertSnippet(editor, text, from, to)` -> expands, inserts over [from, to], selects the first
 *     stop, and (when there is more than one stop) starts a Tab-navigable session backed by markers
 *     so the stops follow any later edits (e.g. an auto-import line inserted above).
 *
 * NOTE: this is currently wired only into the LSP completion path (languageTools/DefaultProviders).
 * The Emmet expander (HTMLCodeHints) and the custom-snippets feature have their own stable cursor
 * handling and were intentionally left untouched; they can migrate onto this manager in future.
 */
define(function (require, exports, module) {

    /**
     * Expand an LSP snippet into plain text plus the list of tab-stops.
     * @param {string} snippet
     * @return {{text: string, stops: Array<{number: number, start: number, end: number}>}}
     *     `stops` holds one entry per distinct stop number (first occurrence), with offsets into
     *     `text`; positive numbers come first in ascending order, then `$0` last.
     */
    function parseSnippet(snippet) {
        var out = "",
            i = 0,
            len = snippet.length,
            stops = {};   // number -> { start, end } (first occurrence wins)
        function record(num, start, end) {
            if (!(num in stops)) {
                stops[num] = { start: start, end: end };
            }
        }
        function readBraceBody(braceIdx) {
            // braceIdx points at "{"; returns { inner, next } honoring nesting and escapes.
            var j = braceIdx + 1,
                depth = 1,
                inner = "";
            while (j < len && depth > 0) {
                var c = snippet.charAt(j);
                if (c === "\\" && j + 1 < len) {
                    inner += snippet.charAt(j + 1);
                    j += 2;
                    continue;
                }
                if (c === "{") {
                    depth++;
                    inner += c;
                    j++;
                    continue;
                }
                if (c === "}") {
                    depth--;
                    if (depth === 0) {
                        j++;
                        break;
                    }
                    inner += c;
                    j++;
                    continue;
                }
                inner += c;
                j++;
            }
            return { inner: inner, next: j };
        }
        while (i < len) {
            var ch = snippet.charAt(i);
            if (ch === "\\" && i + 1 < len) {
                var esc = snippet.charAt(i + 1);
                if (esc === "$" || esc === "}" || esc === "\\") {
                    out += esc;
                    i += 2;
                    continue;
                }
                out += ch;
                i++;
                continue;
            }
            if (ch === "$") {
                var simple = /^\$(\d+)/.exec(snippet.slice(i));
                if (simple) {
                    record(parseInt(simple[1], 10), out.length, out.length);
                    i += simple[0].length;
                    continue;
                }
                if (snippet.charAt(i + 1) === "{") {
                    var body = readBraceBody(i + 1);
                    i = body.next;
                    var placeholder = /^(\d+):([\s\S]*)$/.exec(body.inner),
                        choice = /^(\d+)\|([\s\S]*)\|$/.exec(body.inner),
                        plain = /^(\d+)$/.exec(body.inner),
                        varDefault = /^[A-Za-z_][A-Za-z0-9_]*:([\s\S]*)$/.exec(body.inner);
                    if (placeholder) {
                        var sub = parseSnippet(placeholder[2]),
                            phStart = out.length;
                        out += sub.text;
                        record(parseInt(placeholder[1], 10), phStart, out.length);
                        // Preserve any tab-stops nested inside the placeholder default (e.g.
                        // ${1:a ${2:b} c}), shifted into this snippet's coordinate space.
                        for (var si = 0; si < sub.stops.length; si++) {
                            record(sub.stops[si].number,
                                phStart + sub.stops[si].start, phStart + sub.stops[si].end);
                        }
                    } else if (choice) {
                        var first = choice[2].split(",")[0] || "",
                            chStart = out.length;
                        out += first;
                        record(parseInt(choice[1], 10), chStart, out.length);
                    } else if (plain) {
                        record(parseInt(plain[1], 10), out.length, out.length);
                    } else if (varDefault) {
                        // Unknown variable with a default: emit the default (we don't resolve vars).
                        out += parseSnippet(varDefault[1]).text;
                    }
                    // A bare `${VAR}` we can't resolve contributes nothing.
                    continue;
                }
                var varName = /^\$[A-Za-z_][A-Za-z0-9_]*/.exec(snippet.slice(i));
                if (varName) {
                    i += varName[0].length;
                    continue;
                }
                out += ch;
                i++;
                continue;
            }
            out += ch;
            i++;
        }
        // Order stops: positive numbers ascending, then $0 (the final caret) last.
        var ordered = Object.keys(stops).map(Number).filter(function (x) {
            return x > 0;
        }).sort(function (a, b) {
            return a - b;
        });
        if (0 in stops) {
            ordered.push(0);
        }
        return {
            text: out,
            stops: ordered.map(function (num) {
                return { number: num, start: stops[num].start, end: stops[num].end };
            })
        };
    }

    // ---- Tab-navigation session ----------------------------------------------------------------

    var _session = null;   // { editor, markers: [marker], index, keymap }

    function _clearSession() {
        if (!_session) {
            return;
        }
        var session = _session;
        _session = null;   // null first so the handlers below become no-ops if re-entered
        session.markers.forEach(function (m) {
            m.clear();
        });
        session.editor._codeMirror.removeKeyMap(session.keymap);
        session.editor.off(".tabstop");
    }

    /**
     * Resolve a marker (markText range or bookmark) to a {from, to} document range, or null if the
     * marker no longer exists in the document.
     */
    function _markerRange(marker) {
        var found = marker.find();
        if (!found) {
            return null;
        }
        // markText -> {from, to}; setBookmark -> a single position
        if (found.from && found.to) {
            return { from: found.from, to: found.to };
        }
        return { from: found, to: found };
    }

    function _selectStop(index) {
        if (!_session || index < 0 || index >= _session.markers.length) {
            return false;
        }
        var range = _markerRange(_session.markers[index]);
        if (!range) {
            return false;
        }
        _session.index = index;
        _session.editor.setSelection(range.from, range.to);
        return true;
    }

    function _gotoNext() {
        // Move forward through the stops; leaving the last one ends the session (caret stays put).
        for (var i = _session.index + 1; i < _session.markers.length; i++) {
            if (_selectStop(i)) {
                if (i === _session.markers.length - 1) {
                    // landed on the final stop ($0 or the last placeholder) - nothing more to visit
                    _clearSession();
                }
                return;
            }
        }
        _clearSession();
    }

    function _gotoPrev() {
        for (var i = _session.index - 1; i >= 0; i--) {
            if (_selectStop(i)) {
                return;
            }
        }
    }

    /**
     * Expand a snippet, insert it over the given range, and place the caret at the first tab-stop.
     * When the snippet has more than one stop, a Tab / Shift-Tab navigable session is started; the
     * stops are tracked with markers so they follow any subsequent edits (e.g. an auto-import line
     * inserted above the snippet). Any previously active session is ended first.
     *
     * @param {Editor} editor
     * @param {string} snippet - raw snippet text (LSP snippet grammar)
     * @param {{line: number, ch: number}} from - start of the range to replace
     * @param {{line: number, ch: number}} to - end of the range to replace
     * @return {{text: string, stops: Array}} the parsed snippet (already inserted)
     */
    function insertSnippet(editor, snippet, from, to) {
        _clearSession();
        var parsed = parseSnippet(snippet);
        editor.document.replaceRange(parsed.text, from, to);

        // Translate an offset within the inserted text (which may contain newlines) to a document
        // position relative to `from`.
        function posFromOffset(off) {
            var seg = parsed.text.slice(0, off).split("\n");
            if (seg.length === 1) {
                return { line: from.line, ch: from.ch + off };
            }
            return { line: from.line + seg.length - 1, ch: seg[seg.length - 1].length };
        }

        if (!parsed.stops.length) {
            editor.setCursorPos(posFromOffset(parsed.text.length).line, posFromOffset(parsed.text.length).ch);
            return parsed;
        }

        // Single stop: just place the caret / select the placeholder, no navigation session needed.
        if (parsed.stops.length === 1) {
            var only = parsed.stops[0],
                s = posFromOffset(only.start),
                e = posFromOffset(only.end);
            if (s.line === e.line && s.ch === e.ch) {
                editor.setCursorPos(s.line, s.ch);
            } else {
                editor.setSelection(s, e);
            }
            return parsed;
        }

        // Multiple stops: lay down markers and start a Tab-navigable session.
        var markers = parsed.stops.map(function (stop) {
            var ms = posFromOffset(stop.start),
                me = posFromOffset(stop.end);
            if (ms.line === me.line && ms.ch === me.ch) {
                return editor.setBookmark("tabstop", ms, { insertLeft: true });
            }
            return editor.markText("tabstop", ms, me, {
                clearWhenEmpty: false,
                inclusiveLeft: false,
                inclusiveRight: true
            });
        });

        var keymap = {
            "name": "tabstop-session",
            "Tab": function () {
                _gotoNext();
            },
            "Shift-Tab": function () {
                _gotoPrev();
            },
            "Esc": function () {
                _clearSession();
            }
        };

        _session = { editor: editor, markers: markers, index: -1, keymap: keymap };
        editor._codeMirror.addKeyMap(keymap);
        // End the session if the editor it belongs to is destroyed (file closed). Namespaced so
        // _clearSession can remove it with a single off(".tabstop").
        editor.on("beforeDestroy.tabstop", _clearSession);

        _selectStop(0);
        return parsed;
    }

    /**
     * @return {boolean} true while a Tab-navigable snippet session is active.
     */
    function hasActiveSession() {
        return !!_session;
    }

    /** End any active session (caret is left wherever it currently is). */
    function endSession() {
        _clearSession();
    }

    exports.parseSnippet = parseSnippet;
    exports.insertSnippet = insertSnippet;
    exports.hasActiveSession = hasActiveSession;
    exports.endSession = endSession;
});
