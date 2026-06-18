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

/*global describe, it, expect*/

define(function (require, exports, module) {
    const TabstopManager = require("editor/TabstopManager");

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
    });
});
