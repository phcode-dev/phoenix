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

define(function (require, exports, module) {
    // INDENT is templateText's own indent-unit marker (see snippetCursorManager.js INDENT_TOKEN) -
    // resolved to this specific file's actual detected/configured indent (spaces or tabs, whatever
    // width) at insertion time, instead of hardcoding a literal "    " that would look wrong the
    // moment a user's file uses 2-space indent, tabs, etc.
    const INDENT = require("./snippetCursorManager").INDENT_TOKEN;

    // These are literal code syntax shown verbatim in the hint tooltip, not natural-language prose -
    // there is nothing in them for a translator to translate, so per the i18n rule in CLAUDE.md they
    // are local constants here rather than strings.js keys (only genuinely translatable strings belong
    // in strings.js; content that must render identically in every locale - like code syntax - does
    // not, and should never be sent through the automated AI translation pass).
    const FUNCTION_DESC = "function name() {...}";
    const ARROW_DESC = "const name = () => {...}";
    const PYTHON_FUNCTION_DESC = "def name(): ...";

    /**
     * Built-in snippets shipped with Phoenix (see https://github.com/phcode-dev/phoenix/issues/618).
     *
     * These are NOT persisted to the user's customSnippets.json and NOT part of `Global.SnippetHintsList`
     * at all - they're merged into the matching engine's optimized structures directly (see helper.js
     * `rebuildOptimizedStructures`), which is also why they never appear in the Custom Snippets panel
     * (snippetsList.js/driver.js only ever read/write `Global.SnippetHintsList`, so a built-in is simply
     * invisible to add/edit/delete there) and can't be user-edited or deleted. Because they're always
     * re-derived straight from this file on every boot, template/description improvements in a later
     * Phoenix release reach every user immediately - there's nothing to keep in sync.
     *
     * `isDefault: true` marks an entry as one of these built-ins (as opposed to a user-created snippet)
     * wherever the merged/optimized snippet objects are inspected.
     *
     * `prefixTrigger: true` lets the hint pop up as soon as the user has typed a leading prefix of
     * `abbreviation` (2+ chars - see helper.js `hasExactMatchingSnippet`), not only once the whole word
     * is typed - e.g. typing "fu"/"fun"/"func" all offer the "function" entry. Regular user-created
     * snippets never get this flag, so their exact-match-only behavior is unaffected.
     */
    const DEFAULT_SNIPPETS = [
        {
            id: "default-function",
            isDefault: true,
            abbreviation: "function",
            prefixTrigger: true,
            description: FUNCTION_DESC,
            templateText:
                "function ${1:name}(${2}) {\n" +
                INDENT + "${0}\n" +
                "}",
            fileExtension: ".js, .jsx, .ts, .tsx"
        },
        {
            id: "default-arrow-function",
            isDefault: true,
            abbreviation: "arrow",
            prefixTrigger: true,
            description: ARROW_DESC,
            templateText:
                "const ${1:name} = (${2}) => {\n" +
                INDENT + "${0}\n" +
                "};",
            fileExtension: ".js, .jsx, .ts, .tsx"
        },
        {
            // PHP genuinely uses the same `function` keyword as JS - deliberately shares the same
            // abbreviation, scoped to .php only. Requires hasExactMatchingSnippet to check ALL
            // same-named candidates per language (see helper.js) rather than a single Map winner.
            id: "default-function-php",
            isDefault: true,
            abbreviation: "function",
            prefixTrigger: true,
            description: FUNCTION_DESC,
            templateText:
                "function ${1:name}(${2}) {\n" +
                INDENT + "${0}\n" +
                "}",
            fileExtension: ".php"
        },
        {
            // Python has no braces - the body is indentation-scoped under the colon-terminated
            // `def` line, so this needs its own trigger word ("def") and template shape entirely.
            // Unlike JS/PHP, an empty body here is a real syntax error (IndentationError), so the
            // final stop defaults to "pass" (selected, ready to type over) instead of being empty.
            id: "default-function-python",
            isDefault: true,
            abbreviation: "def",
            prefixTrigger: true,
            description: PYTHON_FUNCTION_DESC,
            templateText:
                "def ${1:name}(${2}):\n" +
                INDENT + "${0:pass}",
            fileExtension: ".py"
        }
    ];

    exports.DEFAULT_SNIPPETS = DEFAULT_SNIPPETS;
});
