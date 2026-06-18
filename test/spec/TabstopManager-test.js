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

/*global describe, it, expect, afterEach*/

define(function (require, exports, module) {
    const TabstopManager = require("editor/TabstopManager"),
        SpecRunnerUtils  = require("spec/SpecRunnerUtils");

    describe("unit:TabstopManager", function () {

        // Convenience: stops as [number, start, end] tuples for terse comparisons.
        function tuples(stops) {
            return stops.map(function (s) {
                return [s.number, s.start, s.end];
            });
        }

        describe("parseSnippet - plain text", function () {
            it("should leave text without tab-stops untouched and report no stops", function () {
                const parsed = TabstopManager.parseSnippet("console.log");
                expect(parsed.text).toBe("console.log");
                expect(parsed.stops).toEqual([]);
            });

            it("should handle an empty snippet", function () {
                const parsed = TabstopManager.parseSnippet("");
                expect(parsed.text).toBe("");
                expect(parsed.stops).toEqual([]);
            });
        });

        describe("parseSnippet - simple tab-stops", function () {
            it("should strip a trailing $1 and record an empty stop at its offset", function () {
                const parsed = TabstopManager.parseSnippet('import { getFromIndex$1 } from "./db";');
                expect(parsed.text).toBe('import { getFromIndex } from "./db";');
                // "$1" sits right after "getFromIndex" (offset 21)
                expect(tuples(parsed.stops)).toEqual([[1, 21, 21]]);
            });

            it("should strip $0 and record it as the (only) stop", function () {
                const parsed = TabstopManager.parseSnippet("doThing()$0");
                expect(parsed.text).toBe("doThing()");
                expect(tuples(parsed.stops)).toEqual([[0, 9, 9]]);
            });

            it("should support ${0} brace form", function () {
                const parsed = TabstopManager.parseSnippet("a${0}b");
                expect(parsed.text).toBe("ab");
                expect(tuples(parsed.stops)).toEqual([[0, 1, 1]]);
            });
        });

        describe("parseSnippet - ordering", function () {
            it("should order positive stops ascending with $0 last", function () {
                const parsed = TabstopManager.parseSnippet("$2 $1 $0 $3");
                // text is "   " (each stop is empty, separated by single spaces)
                expect(parsed.text).toBe("   ");
                expect(tuples(parsed.stops)).toEqual([
                    [1, 1, 1],
                    [2, 0, 0],
                    [3, 3, 3],
                    [0, 2, 2]
                ]);
            });

            it("should keep the first occurrence offset for a repeated (mirror) stop number", function () {
                const parsed = TabstopManager.parseSnippet("$1-$1");
                expect(parsed.text).toBe("-");
                // first $1 at offset 0, second occurrence ignored for placement
                expect(tuples(parsed.stops)).toEqual([[1, 0, 0]]);
            });
        });

        describe("parseSnippet - placeholders", function () {
            it("should keep placeholder default text and span it as the stop range", function () {
                const parsed = TabstopManager.parseSnippet("connect(${1:host}, ${2:port})$0");
                expect(parsed.text).toBe("connect(host, port)");
                expect(tuples(parsed.stops)).toEqual([
                    [1, 8, 12],   // "host"
                    [2, 14, 18],  // "port"
                    [0, 19, 19]   // final caret at end
                ]);
            });

            it("should expand a nested placeholder", function () {
                const parsed = TabstopManager.parseSnippet("${1:a ${2:b} c}");
                expect(parsed.text).toBe("a b c");
                expect(tuples(parsed.stops)).toEqual([
                    [1, 0, 5],   // whole "a b c"
                    [2, 2, 3]    // inner "b"
                ]);
            });
        });

        describe("parseSnippet - choices", function () {
            it("should use the first choice as the inserted/selected text", function () {
                const parsed = TabstopManager.parseSnippet("type: ${1|number,string,boolean|}");
                expect(parsed.text).toBe("type: number");
                expect(tuples(parsed.stops)).toEqual([[1, 6, 12]]);
            });
        });

        describe("parseSnippet - variables", function () {
            it("should drop an unresolved bare variable", function () {
                const parsed = TabstopManager.parseSnippet("name: $TM_FILENAME!");
                expect(parsed.text).toBe("name: !");
                expect(parsed.stops).toEqual([]);
            });

            it("should drop an unresolved ${VAR} but keep its default", function () {
                const parsed = TabstopManager.parseSnippet("${TM_FILENAME:untitled}.txt");
                expect(parsed.text).toBe("untitled.txt");
                expect(parsed.stops).toEqual([]);
            });
        });

        describe("parseSnippet - escapes", function () {
            it("should treat \\$ as a literal dollar, not a tab-stop", function () {
                const parsed = TabstopManager.parseSnippet("cost is \\$1 today");
                expect(parsed.text).toBe("cost is $1 today");
                expect(parsed.stops).toEqual([]);
            });

            it("should unescape \\} and \\\\", function () {
                const parsed = TabstopManager.parseSnippet("a\\}b\\\\c");
                expect(parsed.text).toBe("a}b\\c");
                expect(parsed.stops).toEqual([]);
            });
        });

        describe("parseSnippet - multi-line", function () {
            it("should preserve newlines and report offsets across them", function () {
                const parsed = TabstopManager.parseSnippet("if ($1) {\n    $0\n}");
                expect(parsed.text).toBe("if () {\n    \n}");
                expect(tuples(parsed.stops)).toEqual([
                    [1, 4, 4],    // inside the parens on line 1
                    [0, 12, 12]   // indented body on line 2
                ]);
            });
        });

        // insertSnippet drives the real editor: text replacement, caret/selection placement and the
        // marker-backed Tab/Shift-Tab session. Uses a mock editor (a real Editor + CodeMirror), which
        // runs in the unit category like Editor-test.
        describe("insertSnippet - editor session", function () {
            let myDocument, myEditor;

            function createTestEditor(content) {
                const mocks = SpecRunnerUtils.createMockEditor(content || "", "javascript");
                myDocument = mocks.doc;
                myEditor = mocks.editor;
            }

            // Reach the live Tab-session keymap CodeMirror is using, so we exercise the exact
            // bindings insertSnippet installed rather than re-implementing navigation here.
            function sessionKeymap() {
                return (myEditor._codeMirror.state.keyMaps || []).filter(function (m) {
                    return m.name === "tabstop-session";
                })[0];
            }
            function pressTab() {
                sessionKeymap().Tab(myEditor._codeMirror);
            }
            function pressShiftTab() {
                sessionKeymap()["Shift-Tab"](myEditor._codeMirror);
            }

            const ORIGIN = { line: 0, ch: 0 };

            afterEach(function () {
                TabstopManager.endSession();   // before destroy so no marker ops run on a dead editor
                if (myEditor) {
                    SpecRunnerUtils.destroyMockEditor(myDocument);
                    myEditor = null;
                    myDocument = null;
                }
            });

            it("should insert plain text and place the caret at the single stop (no session)", function () {
                createTestEditor("");
                TabstopManager.insertSnippet(myEditor, "log($1)", ORIGIN, ORIGIN);
                expect(myDocument.getText()).toBe("log()");
                const cursor = myEditor.getCursorPos();
                expect([cursor.line, cursor.ch]).toEqual([0, 4]);
                expect(myEditor.getSelectedText()).toBe("");
                expect(TabstopManager.hasActiveSession()).toBe(false);
            });

            it("should select a single placeholder's default text for type-over", function () {
                createTestEditor("");
                TabstopManager.insertSnippet(myEditor, "foo(${1:bar})", ORIGIN, ORIGIN);
                expect(myDocument.getText()).toBe("foo(bar)");
                expect(myEditor.getSelectedText()).toBe("bar");
                expect(TabstopManager.hasActiveSession()).toBe(false);
            });

            it("should expand the import-completion snippet without a literal $1", function () {
                createTestEditor("import getfromi");
                TabstopManager.insertSnippet(myEditor, 'import { getFromIndex$1 } from "./db";',
                    ORIGIN, { line: 0, ch: 15 });
                expect(myDocument.getText()).toBe('import { getFromIndex } from "./db";');
                const cursor = myEditor.getCursorPos();
                expect([cursor.line, cursor.ch]).toEqual([0, 21]); // right after getFromIndex
                expect(TabstopManager.hasActiveSession()).toBe(false);
            });

            it("should start a session and navigate stops with Tab, ending at $0", function () {
                createTestEditor("");
                TabstopManager.insertSnippet(myEditor, "connect(${1:host}, ${2:port})$0", ORIGIN, ORIGIN);
                expect(myDocument.getText()).toBe("connect(host, port)");
                expect(myEditor.getSelectedText()).toBe("host");
                expect(TabstopManager.hasActiveSession()).toBe(true);

                pressTab();
                expect(myEditor.getSelectedText()).toBe("port");
                expect(TabstopManager.hasActiveSession()).toBe(true);

                pressTab();
                // landed on $0 (end of text) - caret only, session ends
                const cursor = myEditor.getCursorPos();
                expect([cursor.line, cursor.ch]).toEqual([0, 19]);
                expect(myEditor.getSelectedText()).toBe("");
                expect(TabstopManager.hasActiveSession()).toBe(false);
            });

            it("should navigate backwards with Shift-Tab", function () {
                createTestEditor("");
                TabstopManager.insertSnippet(myEditor, "${1:a} ${2:b} $0", ORIGIN, ORIGIN);
                expect(myEditor.getSelectedText()).toBe("a");
                pressTab();
                expect(myEditor.getSelectedText()).toBe("b");
                pressShiftTab();
                expect(myEditor.getSelectedText()).toBe("a");
                expect(TabstopManager.hasActiveSession()).toBe(true);
            });

            it("should end the session on Esc", function () {
                createTestEditor("");
                TabstopManager.insertSnippet(myEditor, "${1:a} ${2:b}", ORIGIN, ORIGIN);
                expect(TabstopManager.hasActiveSession()).toBe(true);
                sessionKeymap().Esc(myEditor._codeMirror);
                expect(TabstopManager.hasActiveSession()).toBe(false);
            });

            it("should keep stops correct when text is inserted above (markers follow edits)", function () {
                createTestEditor("");
                TabstopManager.insertSnippet(myEditor, "fn(${1:a}, ${2:b})", ORIGIN, ORIGIN);
                expect(myEditor.getSelectedText()).toBe("a");
                // Simulate an auto-import line being added above the snippet after insertion.
                myEditor.document.replaceRange("import x;\n", ORIGIN);
                pressTab();
                const sel = myEditor.getSelection();
                expect(myEditor.getSelectedText()).toBe("b");
                expect(sel.start.line).toBe(1);   // snippet now lives on line 1
            });

            it("should replace the given range, not just insert at the cursor", function () {
                createTestEditor("foo.barbaz");
                TabstopManager.insertSnippet(myEditor, "log($1)", { line: 0, ch: 4 }, { line: 0, ch: 7 });
                expect(myDocument.getText()).toBe("foo.log()baz");
            });
        });
    });
});
