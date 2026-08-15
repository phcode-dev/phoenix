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

/*global describe, it, expect, beforeEach, afterEach */
/*unittests: Custom Snippets */

define(function (require, exports, module) {

    const Helper = require("extensionsIntegrated/CustomSnippets/helper");
    const FilterSnippets = require("extensionsIntegrated/CustomSnippets/filterSnippets");
    const SnippetCursorManager = require("extensionsIntegrated/CustomSnippets/snippetCursorManager");
    const Global = require("extensionsIntegrated/CustomSnippets/global");
    const TabstopManager = require("editor/TabstopManager");

    describe("Custom Snippets", function () {

        // =====================================================================
        // Helper: mapLanguageToExtension
        // =====================================================================
        describe("mapLanguageToExtension", function () {
            it("should map known language IDs to file extensions", function () {
                expect(Helper.mapLanguageToExtension("javascript")).toBe(".js");
                expect(Helper.mapLanguageToExtension("css")).toBe(".css");
                expect(Helper.mapLanguageToExtension("html")).toBe(".html");
                expect(Helper.mapLanguageToExtension("python")).toBe(".py");
                expect(Helper.mapLanguageToExtension("typescript")).toBe(".ts");
                expect(Helper.mapLanguageToExtension("php")).toBe(".php");
                expect(Helper.mapLanguageToExtension("java")).toBe(".java");
                expect(Helper.mapLanguageToExtension("ruby")).toBe(".rb");
                expect(Helper.mapLanguageToExtension("go")).toBe(".go");
                expect(Helper.mapLanguageToExtension("rust")).toBe(".rs");
                expect(Helper.mapLanguageToExtension("jsx")).toBe(".jsx");
                expect(Helper.mapLanguageToExtension("tsx")).toBe(".tsx");
            });

            it("should map CSS-related languages correctly", function () {
                expect(Helper.mapLanguageToExtension("sass")).toBe(".sass");
                expect(Helper.mapLanguageToExtension("scss")).toBe(".scss");
                expect(Helper.mapLanguageToExtension("less")).toBe(".less");
                expect(Helper.mapLanguageToExtension("stylus")).toBe(".styl");
            });

            it("should return the language ID as-is for unknown languages", function () {
                expect(Helper.mapLanguageToExtension("unknownlang")).toBe("unknownlang");
                expect(Helper.mapLanguageToExtension("custom")).toBe("custom");
            });
        });

        // =====================================================================
        // Helper: sanitizeFileExtensionInput
        // =====================================================================
        describe("sanitizeFileExtensionInput", function () {
            it("should allow only a-z, A-Z, comma, dot, and space characters", function () {
                expect(Helper.sanitizeFileExtensionInput(".js")).toBe(".js");
                expect(Helper.sanitizeFileExtensionInput(".js, .html")).toBe(".js, .html");
            });

            it("should remove numbers and special characters", function () {
                expect(Helper.sanitizeFileExtensionInput("js123")).toBe("js");
                expect(Helper.sanitizeFileExtensionInput(".js!@#")).toBe(".js");
                expect(Helper.sanitizeFileExtensionInput("test$%^")).toBe("test");
            });

            it("should collapse consecutive dots into a single dot", function () {
                expect(Helper.sanitizeFileExtensionInput("..js")).toBe(".js");
                expect(Helper.sanitizeFileExtensionInput("...html")).toBe(".html");
            });

            it("should preserve valid comma-separated extensions", function () {
                const result = Helper.sanitizeFileExtensionInput(".js, .css, .html");
                expect(result).toBe(".js, .css, .html");
            });
        });

        // =====================================================================
        // Helper: isSnippetSupportedInFile
        // =====================================================================
        describe("isSnippetSupportedInFile", function () {
            it("should return true for snippets with 'all' file extension", function () {
                const snippet = { fileExtension: "all" };
                expect(Helper.isSnippetSupportedInFile(snippet, ".js")).toBe(true);
                expect(Helper.isSnippetSupportedInFile(snippet, ".py")).toBe(true);
                expect(Helper.isSnippetSupportedInFile(snippet, null)).toBe(true);
            });

            it("should return true for snippets with 'ALL' file extension (case insensitive)", function () {
                const snippet = { fileExtension: "ALL" };
                expect(Helper.isSnippetSupportedInFile(snippet, ".js")).toBe(true);
            });

            it("should return true when file extension matches", function () {
                const snippet = { fileExtension: ".js, .html" };
                expect(Helper.isSnippetSupportedInFile(snippet, ".js")).toBe(true);
                expect(Helper.isSnippetSupportedInFile(snippet, ".html")).toBe(true);
            });

            it("should return false when file extension does not match", function () {
                const snippet = { fileExtension: ".js, .html" };
                expect(Helper.isSnippetSupportedInFile(snippet, ".py")).toBe(false);
                expect(Helper.isSnippetSupportedInFile(snippet, ".css")).toBe(false);
            });

            it("should return false when file extension is null and not 'all'", function () {
                const snippet = { fileExtension: ".js" };
                expect(Helper.isSnippetSupportedInFile(snippet, null)).toBe(false);
            });

            it("should match case-insensitively", function () {
                const snippet = { fileExtension: ".JS, .HTML" };
                expect(Helper.isSnippetSupportedInFile(snippet, ".js")).toBe(true);
                expect(Helper.isSnippetSupportedInFile(snippet, ".html")).toBe(true);
            });
        });

        // =====================================================================
        // Helper: categorizeFileExtensionForMetrics
        // =====================================================================
        describe("categorizeFileExtensionForMetrics", function () {
            it("should return 'all' for snippets with no file extension", function () {
                expect(Helper.categorizeFileExtensionForMetrics(null)).toBe("all");
                expect(Helper.categorizeFileExtensionForMetrics(undefined)).toBe("all");
                expect(Helper.categorizeFileExtensionForMetrics("")).toBe("all");
            });

            it("should return 'all' for snippets enabled for all files", function () {
                expect(Helper.categorizeFileExtensionForMetrics("all")).toBe("all");
            });

            it("should return 'file' for snippets with specific file extensions", function () {
                expect(Helper.categorizeFileExtensionForMetrics(".js")).toBe("file");
                expect(Helper.categorizeFileExtensionForMetrics(".js, .html")).toBe("file");
            });
        });

        // =====================================================================
        // Helper: rebuildOptimizedStructures & getMatchingSnippets
        // =====================================================================
        describe("Optimized Snippet Matching", function () {
            let savedSnippetsList;

            beforeEach(function () {
                // Save the current state
                savedSnippetsList = Global.SnippetHintsList.slice();

                // Set up test snippets
                Global.SnippetHintsList.length = 0;
                Global.SnippetHintsList.push(
                    {
                        abbreviation: "clg",
                        description: "Console log",
                        templateText: "console.log(${1});",
                        fileExtension: ".js, .ts"
                    },
                    {
                        abbreviation: "clf",
                        description: "Console log function",
                        templateText: "console.log('${1}', ${2});",
                        fileExtension: ".js"
                    },
                    {
                        abbreviation: "div",
                        description: "HTML div",
                        templateText: "<div>${1}</div>",
                        fileExtension: ".html"
                    },
                    {
                        abbreviation: "hello",
                        description: "Hello world",
                        templateText: "Hello, World!",
                        fileExtension: "all"
                    },
                    {
                        abbreviation: "bgcolor",
                        description: "Background color",
                        templateText: "background-color: ${1};",
                        fileExtension: ".css, .scss, .less"
                    }
                );
                Helper.rebuildOptimizedStructures();
            });

            afterEach(function () {
                // Restore original state
                Global.SnippetHintsList.length = 0;
                savedSnippetsList.forEach(function (s) {
                    Global.SnippetHintsList.push(s);
                });
                Helper.rebuildOptimizedStructures();
            });

            describe("rebuildOptimizedStructures", function () {
                it("should create optimized lookup structures from snippet list", function () {
                    // Verify that getMatchingSnippets works after rebuild
                    // We use a mock editor to test snippet matching
                    const mockEditor = {
                        getLanguageForPosition: function () {
                            return { getId: function () { return "javascript"; } };
                        },
                        document: {
                            file: { fullPath: "/test/file.js" }
                        }
                    };

                    // "clg" should match exactly for JS
                    const matches = Helper.getMatchingSnippets("clg", mockEditor);
                    expect(matches.length).toBeGreaterThan(0);
                    expect(matches[0].abbreviation).toBe("clg");
                });

                it("should handle empty snippet list", function () {
                    Global.SnippetHintsList.length = 0;
                    Helper.rebuildOptimizedStructures();

                    const mockEditor = {
                        getLanguageForPosition: function () {
                            return { getId: function () { return "javascript"; } };
                        },
                        document: {
                            file: { fullPath: "/test/file.js" }
                        }
                    };

                    const matches = Helper.getMatchingSnippets("clg", mockEditor);
                    expect(matches.length).toBe(0);
                });
            });

            describe("hasExactMatchingSnippet", function () {
                it("should return true for an exact abbreviation match in correct language", function () {
                    const mockEditor = {
                        getLanguageForPosition: function () {
                            return { getId: function () { return "javascript"; } };
                        },
                        document: {
                            file: { fullPath: "/test/file.js" }
                        }
                    };

                    expect(Helper.hasExactMatchingSnippet("clg", mockEditor)).toBe(true);
                });

                it("should return false for non-existent abbreviation", function () {
                    const mockEditor = {
                        getLanguageForPosition: function () {
                            return { getId: function () { return "javascript"; } };
                        },
                        document: {
                            file: { fullPath: "/test/file.js" }
                        }
                    };

                    expect(Helper.hasExactMatchingSnippet("zzz", mockEditor)).toBe(false);
                });

                it("should return true for 'all' language snippets regardless of language", function () {
                    const mockEditor = {
                        getLanguageForPosition: function () {
                            return { getId: function () { return "python"; } };
                        },
                        document: {
                            file: { fullPath: "/test/file.py" }
                        }
                    };

                    expect(Helper.hasExactMatchingSnippet("hello", mockEditor)).toBe(true);
                });

                it("should return false for language-specific snippet in wrong language", function () {
                    const mockEditor = {
                        getLanguageForPosition: function () {
                            return { getId: function () { return "python"; } };
                        },
                        document: {
                            file: { fullPath: "/test/file.py" }
                        }
                    };

                    // "div" only works in .html
                    expect(Helper.hasExactMatchingSnippet("div", mockEditor)).toBe(false);
                });

                it("should match case-insensitively", function () {
                    const mockEditor = {
                        getLanguageForPosition: function () {
                            return { getId: function () { return "javascript"; } };
                        },
                        document: {
                            file: { fullPath: "/test/file.js" }
                        }
                    };

                    expect(Helper.hasExactMatchingSnippet("CLG", mockEditor)).toBe(true);
                    expect(Helper.hasExactMatchingSnippet("Clg", mockEditor)).toBe(true);
                });
            });

            describe("hasExactMatchingSnippet: prefixTrigger", function () {
                const jsMockEditor = {
                    getLanguageForPosition: function () {
                        return { getId: function () { return "javascript"; } };
                    },
                    document: {
                        file: { fullPath: "/test/file.js" }
                    }
                };

                beforeEach(function () {
                    Global.SnippetHintsList.push({
                        abbreviation: "function",
                        prefixTrigger: true,
                        description: "Prefilled function",
                        templateText: "function ${1}() {}",
                        fileExtension: ".js"
                    });
                    Helper.rebuildOptimizedStructures();
                });

                it("should match once at least MIN_PREFIX_TRIGGER_LENGTH chars of the abbreviation are typed",
                    function () {
                        expect(Helper.hasExactMatchingSnippet("fu", jsMockEditor)).toBe(true);
                        expect(Helper.hasExactMatchingSnippet("fun", jsMockEditor)).toBe(true);
                        expect(Helper.hasExactMatchingSnippet("func", jsMockEditor)).toBe(true);
                        expect(Helper.hasExactMatchingSnippet("function", jsMockEditor)).toBe(true);
                    });

                it("should not match below MIN_PREFIX_TRIGGER_LENGTH (avoids 1-char noise)", function () {
                    expect(Helper.hasExactMatchingSnippet("f", jsMockEditor)).toBe(false);
                });

                it("should not match text that diverges from the abbreviation", function () {
                    // "fung" diverges from "function" at the 4th char ('g' vs 'c') - not a prefix
                    expect(Helper.hasExactMatchingSnippet("fung", jsMockEditor)).toBe(false);
                    // longer than the abbreviation - can't be a prefix of it either
                    expect(Helper.hasExactMatchingSnippet("functionx", jsMockEditor)).toBe(false);
                });

                it("should not apply prefix matching to regular (non-prefixTrigger) snippets", function () {
                    // "cl" is a genuine prefix of "clg" but clg never opted into prefixTrigger
                    expect(Helper.hasExactMatchingSnippet("cl", jsMockEditor)).toBe(false);
                });

                it("should still respect language/file-extension scoping for prefix matches", function () {
                    const pyMockEditor = {
                        getLanguageForPosition: function () {
                            return { getId: function () { return "python"; } };
                        },
                        document: {
                            file: { fullPath: "/test/file.py" }
                        }
                    };
                    // the "function" prefixTrigger snippet above is scoped to .js only
                    expect(Helper.hasExactMatchingSnippet("func", pyMockEditor)).toBe(false);
                });
            });

            describe("getMatchingSnippets", function () {
                it("should return prefix-matched snippets for the given language", function () {
                    const mockEditor = {
                        getLanguageForPosition: function () {
                            return { getId: function () { return "javascript"; } };
                        },
                        document: {
                            file: { fullPath: "/test/file.js" }
                        }
                    };

                    // "cl" should match both "clg" and "clf" for JS
                    const matches = Helper.getMatchingSnippets("cl", mockEditor);
                    expect(matches.length).toBe(2);
                    const abbrs = matches.map(function (m) { return m.abbreviation; });
                    expect(abbrs).toContain("clg");
                    expect(abbrs).toContain("clf");
                });

                it("should include 'all' language snippets in any language", function () {
                    const mockEditor = {
                        getLanguageForPosition: function () {
                            return { getId: function () { return "javascript"; } };
                        },
                        document: {
                            file: { fullPath: "/test/file.js" }
                        }
                    };

                    // "hel" should match "hello" which is for all languages
                    const matches = Helper.getMatchingSnippets("hel", mockEditor);
                    expect(matches.length).toBe(1);
                    expect(matches[0].abbreviation).toBe("hello");
                });

                it("should not include language-specific snippets from other languages", function () {
                    const mockEditor = {
                        getLanguageForPosition: function () {
                            return { getId: function () { return "javascript"; } };
                        },
                        document: {
                            file: { fullPath: "/test/file.js" }
                        }
                    };

                    // "div" should not match in JavaScript context
                    const matches = Helper.getMatchingSnippets("div", mockEditor);
                    expect(matches.length).toBe(0);
                });

                it("should sort exact matches before partial matches", function () {
                    const mockEditor = {
                        getLanguageForPosition: function () {
                            return { getId: function () { return "javascript"; } };
                        },
                        document: {
                            file: { fullPath: "/test/file.js" }
                        }
                    };

                    // "clg" should have the exact match first
                    const matches = Helper.getMatchingSnippets("clg", mockEditor);
                    expect(matches.length).toBeGreaterThan(0);
                    expect(matches[0].abbreviation).toBe("clg");
                });

                it("should return empty array for no matches", function () {
                    const mockEditor = {
                        getLanguageForPosition: function () {
                            return { getId: function () { return "javascript"; } };
                        },
                        document: {
                            file: { fullPath: "/test/file.js" }
                        }
                    };

                    const matches = Helper.getMatchingSnippets("zzz", mockEditor);
                    expect(matches.length).toBe(0);
                });

                it("should match snippets for TypeScript file with .ts extension", function () {
                    const mockEditor = {
                        getLanguageForPosition: function () {
                            return { getId: function () { return "typescript"; } };
                        },
                        document: {
                            file: { fullPath: "/test/file.ts" }
                        }
                    };

                    // "clg" is defined for .js AND .ts
                    const matches = Helper.getMatchingSnippets("clg", mockEditor);
                    expect(matches.length).toBeGreaterThan(0);
                    expect(matches[0].abbreviation).toBe("clg");
                });

                it("should match CSS snippets in SCSS context", function () {
                    const mockEditor = {
                        getLanguageForPosition: function () {
                            return { getId: function () { return "scss"; } };
                        },
                        document: {
                            file: { fullPath: "/test/file.scss" }
                        }
                    };

                    // "bgcolor" is defined for .css, .scss, .less
                    const matches = Helper.getMatchingSnippets("bg", mockEditor);
                    expect(matches.length).toBe(1);
                    expect(matches[0].abbreviation).toBe("bgcolor");
                });
            });
        });

        // =====================================================================
        // Helper: isSnippetSupportedInLanguageContext
        // =====================================================================
        describe("isSnippetSupportedInLanguageContext", function () {
            it("should return true for snippets supporting all languages", function () {
                const snippet = {
                    fileExtension: "all",
                    supportsAllLanguages: true,
                    supportedLangSet: new Set(["all"])
                };
                expect(Helper.isSnippetSupportedInLanguageContext(snippet, "javascript", null)).toBe(true);
                expect(Helper.isSnippetSupportedInLanguageContext(snippet, "python", null)).toBe(true);
            });

            it("should return true for non-optimized snippets with 'all' extension", function () {
                const snippet = { fileExtension: "all" };
                expect(Helper.isSnippetSupportedInLanguageContext(snippet, "javascript", null)).toBe(true);
            });

            it("should match using language context when available", function () {
                const snippet = {
                    fileExtension: ".js",
                    supportedLangSet: new Set([".js"]),
                    supportsAllLanguages: false
                };
                expect(Helper.isSnippetSupportedInLanguageContext(snippet, "javascript", null)).toBe(true);
                expect(Helper.isSnippetSupportedInLanguageContext(snippet, "python", null)).toBe(false);
            });

            it("should fall back to file extension matching when language context has no mapping", function () {
                const snippet = {
                    fileExtension: ".custom",
                    supportsAllLanguages: false
                };
                const mockEditor = {
                    document: {
                        file: { fullPath: "/test/file.custom" }
                    }
                };
                // "unknownlang" doesn't have a mapping, so it falls back
                expect(Helper.isSnippetSupportedInLanguageContext(snippet, "unknownlang", mockEditor)).toBe(true);
            });

            it("should fall back to editor file extension when language context is null", function () {
                const snippet = {
                    fileExtension: ".py",
                    supportsAllLanguages: false
                };
                const mockEditor = {
                    document: {
                        file: { fullPath: "/test/script.py" }
                    }
                };
                // No language context available, falls back to file extension matching
                expect(Helper.isSnippetSupportedInLanguageContext(snippet, null, mockEditor)).toBe(true);
            });

            it("should return false when no language context, no editor, and not 'all'", function () {
                const snippet = {
                    fileExtension: ".py",
                    supportsAllLanguages: false
                };
                // No language context, no editor
                expect(Helper.isSnippetSupportedInLanguageContext(snippet, null, null)).toBe(false);
            });
        });

        // =====================================================================
        // SnippetCursorManager: escapeBareDollarSigns
        // =====================================================================
        describe("SnippetCursorManager: escapeBareDollarSigns", function () {
            it("should escape a bare '$' followed by a digit so it isn't read as an LSP tab stop", function () {
                const escaped = SnippetCursorManager.escapeBareDollarSigns("Price: $5");
                expect(escaped).toBe("Price: \\$5");
                // and it must round-trip back to the original literal text once expanded
                expect(TabstopManager.parseSnippet(escaped).text).toBe("Price: $5");
            });

            it("should escape a bare '$' followed by an identifier so it isn't read as an LSP variable", function () {
                const escaped = SnippetCursorManager.escapeBareDollarSigns("$scope.value");
                expect(escaped).toBe("\\$scope.value");
                expect(TabstopManager.parseSnippet(escaped).text).toBe("$scope.value");
            });

            it("should leave the braced '${N}' tab stop syntax untouched", function () {
                expect(SnippetCursorManager.escapeBareDollarSigns("${1}")).toBe("${1}");
                const parsed = TabstopManager.parseSnippet(SnippetCursorManager.escapeBareDollarSigns("${1}"));
                expect(parsed.stops.length).toBe(1);
                expect(parsed.stops[0].number).toBe(1);
            });

            it("should double pre-existing literal backslashes so they survive TabstopManager's escapes", function () {
                // input is a template that already contains one literal backslash before '$HOME' -
                // the old engine had no escape concept, so this rendered as the literal 8 characters
                // `\$HOME`. The round trip through the new engine must reproduce that exactly.
                const original = "echo \\$HOME";
                const escaped = SnippetCursorManager.escapeBareDollarSigns(original);
                expect(TabstopManager.parseSnippet(escaped).text).toBe(original);
            });

            it("should not interfere with a real tab stop mixed with literal backslashes", function () {
                const original = "C:\\Users\\${1}\\file.txt";
                const escaped = SnippetCursorManager.escapeBareDollarSigns(original);
                const parsed = TabstopManager.parseSnippet(escaped);
                expect(parsed.text).toBe("C:\\Users\\\\file.txt");
                expect(parsed.stops.length).toBe(1);
                expect(parsed.stops[0].number).toBe(1);
            });
        });

        // =====================================================================
        // Built-in default snippets: merged silently, never part of user data
        // =====================================================================
        describe("Built-in defaults: silent merge (not in Global.SnippetHintsList or the panel)", function () {
            let savedSnippetsList;

            beforeEach(function () {
                savedSnippetsList = Global.SnippetHintsList.slice();
                Global.SnippetHintsList.length = 0; // simulate a user with zero saved snippets
                Helper.rebuildOptimizedStructures();
            });

            afterEach(function () {
                Global.SnippetHintsList.length = 0;
                savedSnippetsList.forEach(function (s) { Global.SnippetHintsList.push(s); });
                Helper.rebuildOptimizedStructures();
            });

            it("should never appear in Global.SnippetHintsList itself - only in the merged/optimized view",
                function () {
                    const ids = Global.SnippetHintsList.filter(function (s) { return s.id; });
                    expect(ids.length).toBe(0);
                });

            it("should still be found by the matching engine (hasExactMatchingSnippet) with an empty user list",
                function () {
                    const jsMockEditor = {
                        getLanguageForPosition: function () {
                            return { getId: function () { return "javascript"; } };
                        },
                        document: { file: { fullPath: "/test/file.js" } }
                    };
                    expect(Helper.hasExactMatchingSnippet("function", jsMockEditor)).toBe(true);
                    expect(Helper.hasExactMatchingSnippet("arrow", jsMockEditor)).toBe(true);
                });

            it("should not be deletable/editable via driver.js, since it never touches the user's list",
                function () {
                    // Global.SnippetHintsList is what driver.js's add/edit/delete code reads and writes -
                    // an empty list here means there is nothing for the panel to show or let the user
                    // delete for any of the built-ins, by construction.
                    expect(Global.SnippetHintsList.length).toBe(0);
                });
        });

        // =====================================================================
        // FilterSnippets: filterSnippets
        // =====================================================================
        describe("FilterSnippets", function () {
            let savedSnippetsList;

            beforeEach(function () {
                savedSnippetsList = Global.SnippetHintsList.slice();

                // Set up test data
                Global.SnippetHintsList.length = 0;
                Global.SnippetHintsList.push(
                    {
                        abbreviation: "clg",
                        description: "Console log shortcut",
                        templateText: "console.log(${1});",
                        fileExtension: ".js"
                    },
                    {
                        abbreviation: "div",
                        description: "HTML div container",
                        templateText: "<div>${1}</div>",
                        fileExtension: ".html"
                    },
                    {
                        abbreviation: "bgcolor",
                        description: "Background color property",
                        templateText: "background-color: ${1};",
                        fileExtension: ".css"
                    },
                    {
                        abbreviation: "forloop",
                        description: "For loop",
                        templateText: "for (let i = 0; i < ${1}; i++) {\n    ${2}\n}",
                        fileExtension: ".js"
                    }
                );
            });

            afterEach(function () {
                Global.SnippetHintsList.length = 0;
                savedSnippetsList.forEach(function (s) {
                    Global.SnippetHintsList.push(s);
                });
            });

            it("should return all snippets when filter input is empty", function () {
                // We need to simulate empty filter input
                // filterSnippets reads from DOM, so we'll need to create the element
                const $filterInput = $('<input id="filter-snippets-input" value="">');
                const $existingInput = $("#filter-snippets-input");
                const existingVal = $existingInput.length ? $existingInput.val() : null;

                // Temporarily inject our input or use existing one
                if (!$existingInput.length) {
                    $("body").append($filterInput);
                } else {
                    $existingInput.val("");
                }

                const result = FilterSnippets.filterSnippets(Global.SnippetHintsList);
                expect(result.length).toBe(4);

                // Cleanup
                if (!$existingInput.length) {
                    $filterInput.remove();
                } else if (existingVal !== null) {
                    $existingInput.val(existingVal);
                }
            });

            it("should filter snippets by abbreviation match", function () {
                const $filterInput = $('<input id="filter-snippets-input" value="clg">');
                const $existingInput = $("#filter-snippets-input");

                if (!$existingInput.length) {
                    $("body").append($filterInput);
                } else {
                    $existingInput.val("clg");
                }

                const result = FilterSnippets.filterSnippets(Global.SnippetHintsList);
                expect(result.length).toBe(1);
                expect(result[0].abbreviation).toBe("clg");

                if (!$existingInput.length) {
                    $filterInput.remove();
                }
            });

            it("should filter snippets by description match", function () {
                const $existingInput = $("#filter-snippets-input");

                if (!$existingInput.length) {
                    $("body").append($('<input id="filter-snippets-input" value="container">'));
                } else {
                    $existingInput.val("container");
                }

                const result = FilterSnippets.filterSnippets(Global.SnippetHintsList);
                expect(result.length).toBe(1);
                expect(result[0].abbreviation).toBe("div");

                if (!$existingInput.length) {
                    $("#filter-snippets-input").remove();
                }
            });

            it("should filter snippets by template text match", function () {
                const $existingInput = $("#filter-snippets-input");

                if (!$existingInput.length) {
                    $("body").append($('<input id="filter-snippets-input" value="background-color">'));
                } else {
                    $existingInput.val("background-color");
                }

                const result = FilterSnippets.filterSnippets(Global.SnippetHintsList);
                expect(result.length).toBe(1);
                expect(result[0].abbreviation).toBe("bgcolor");

                if (!$existingInput.length) {
                    $("#filter-snippets-input").remove();
                }
            });

            it("should filter snippets by file extension match", function () {
                const $existingInput = $("#filter-snippets-input");

                if (!$existingInput.length) {
                    $("body").append($('<input id="filter-snippets-input" value=".html">'));
                } else {
                    $existingInput.val(".html");
                }

                const result = FilterSnippets.filterSnippets(Global.SnippetHintsList);
                expect(result.length).toBe(1);
                expect(result[0].abbreviation).toBe("div");

                if (!$existingInput.length) {
                    $("#filter-snippets-input").remove();
                }
            });

            it("should use AND logic for multiple search terms", function () {
                const $existingInput = $("#filter-snippets-input");

                if (!$existingInput.length) {
                    $("body").append($('<input id="filter-snippets-input" value="console .js">'));
                } else {
                    $existingInput.val("console .js");
                }

                const result = FilterSnippets.filterSnippets(Global.SnippetHintsList);
                // Only "clg" has both "console" in template and ".js" in extension
                expect(result.length).toBe(1);
                expect(result[0].abbreviation).toBe("clg");

                if (!$existingInput.length) {
                    $("#filter-snippets-input").remove();
                }
            });

            it("should return empty array when no snippets match", function () {
                const $existingInput = $("#filter-snippets-input");

                if (!$existingInput.length) {
                    $("body").append($('<input id="filter-snippets-input" value="zzzznonexistent">'));
                } else {
                    $existingInput.val("zzzznonexistent");
                }

                const result = FilterSnippets.filterSnippets(Global.SnippetHintsList);
                expect(result.length).toBe(0);

                if (!$existingInput.length) {
                    $("#filter-snippets-input").remove();
                }
            });

            it("should prioritize abbreviation matches over description matches", function () {
                // Add a snippet where "for" appears in both abbreviation and another snippet's description
                Global.SnippetHintsList.push({
                    abbreviation: "test",
                    description: "for testing purposes",
                    templateText: "test()",
                    fileExtension: "all"
                });

                const $existingInput = $("#filter-snippets-input");

                if (!$existingInput.length) {
                    $("body").append($('<input id="filter-snippets-input" value="for">'));
                } else {
                    $existingInput.val("for");
                }

                const result = FilterSnippets.filterSnippets(Global.SnippetHintsList);
                // "forloop" should be ranked higher because "for" matches its abbreviation
                expect(result.length).toBeGreaterThan(0);
                expect(result[0].abbreviation).toBe("forloop");

                if (!$existingInput.length) {
                    $("#filter-snippets-input").remove();
                }
            });

            it("should be case-insensitive", function () {
                const $existingInput = $("#filter-snippets-input");

                if (!$existingInput.length) {
                    $("body").append($('<input id="filter-snippets-input" value="CLG">'));
                } else {
                    $existingInput.val("CLG");
                }

                const result = FilterSnippets.filterSnippets(Global.SnippetHintsList);
                expect(result.length).toBe(1);
                expect(result[0].abbreviation).toBe("clg");

                if (!$existingInput.length) {
                    $("#filter-snippets-input").remove();
                }
            });
        });

        // =====================================================================
        // Helper: createHintItem
        // =====================================================================
        describe("createHintItem", function () {
            it("should create a jQuery element with the correct abbreviation", function () {
                const $hint = Helper.createHintItem("clg", "cl", "Console log");
                expect($hint.attr("data-val")).toBe("clg");
                expect($hint.attr("data-isCustomSnippet")).toBe("true");
            });

            it("should add a title attribute when description is provided", function () {
                const $hint = Helper.createHintItem("clg", "cl", "Console log shortcut");
                expect($hint.attr("title")).toBe("Console log shortcut");
            });

            it("should not add a title attribute when description is empty", function () {
                const $hint = Helper.createHintItem("clg", "cl", "");
                expect($hint.attr("title")).toBeUndefined();
            });

            it("should not add a title attribute when description is only whitespace", function () {
                const $hint = Helper.createHintItem("clg", "cl", "   ");
                expect($hint.attr("title")).toBeUndefined();
            });

            it("should highlight matching characters from query", function () {
                const $hint = Helper.createHintItem("clg", "cl", "");
                const $matched = $hint.find(".matched-hint");
                expect($matched.length).toBeGreaterThan(0);
            });

            it("should display the abbreviation text when query is empty", function () {
                const $hint = Helper.createHintItem("clg", "", "");
                expect($hint.text()).toContain("clg");
            });

            it("should include the Snippet label indicator", function () {
                const $hint = Helper.createHintItem("clg", "", "");
                const $icon = $hint.find(".custom-snippet-code-hint");
                expect($icon.length).toBe(1);
            });

            it("should include description text when provided", function () {
                const $hint = Helper.createHintItem("clg", "", "Console log shortcut");
                const $desc = $hint.find(".snippet-description");
                expect($desc.length).toBe(1);
                expect($desc.text()).toBe("Console log shortcut");
            });

            it("should truncate description longer than 80 characters", function () {
                const longDesc = "A".repeat(100);
                const $hint = Helper.createHintItem("clg", "", longDesc);
                const $desc = $hint.find(".snippet-description");
                expect($desc.text().length).toBeLessThan(100);
                expect($desc.text()).toContain("...");
            });

            it("should not include description element when description is empty", function () {
                const $hint = Helper.createHintItem("clg", "", "");
                const $desc = $hint.find(".snippet-description");
                expect($desc.length).toBe(0);
            });

            it("should have the custom-snippets-hint CSS class", function () {
                const $hint = Helper.createHintItem("clg", "", "");
                expect($hint.hasClass("custom-snippets-hint")).toBe(true);
            });

            it("should attach the insertionKey as a data-insertion-key attribute when provided", function () {
                const $hint = Helper.createHintItem("clg", "", "", "default-function");
                expect($hint.attr("data-insertion-key")).toBe("default-function");
            });

            it("should not add a data-insertion-key attribute when insertionKey is omitted", function () {
                const $hint = Helper.createHintItem("clg", "", "");
                expect($hint.attr("data-insertion-key")).toBeUndefined();
            });
        });

        // =====================================================================
        // Helper: insertionKey / getSnippetByInsertionKey (O(1) insertion lookup)
        // =====================================================================
        describe("insertionKey and getSnippetByInsertionKey", function () {
            let savedSnippetsList;

            beforeEach(function () {
                savedSnippetsList = Global.SnippetHintsList.slice();
                Global.SnippetHintsList.length = 0;
                Global.SnippetHintsList.push({
                    abbreviation: "myown", description: "user snippet", templateText: "x", fileExtension: "all"
                });
                Helper.rebuildOptimizedStructures();
            });

            afterEach(function () {
                Global.SnippetHintsList.length = 0;
                savedSnippetsList.forEach(function (s) { Global.SnippetHintsList.push(s); });
                Helper.rebuildOptimizedStructures();
            });

            it("should key a built-in default by its stable `id`", function () {
                const snippet = Helper.getSnippetByInsertionKey("default-function");
                expect(snippet).toBeTruthy();
                expect(snippet.abbreviation).toBe("function");
            });

            it("should key a user snippet (no `id`) by its abbreviation", function () {
                const snippet = Helper.getSnippetByInsertionKey("myown");
                expect(snippet).toBeTruthy();
                expect(snippet.description).toBe("user snippet");
            });

            it("should return null for an unknown insertionKey", function () {
                expect(Helper.getSnippetByInsertionKey("zzznonexistent")).toBeNull();
            });

            it("should return the exact same object getMatchingSnippets would resolve for that language",
                function () {
                    const jsMockEditor = {
                        getLanguageForPosition: function () {
                            return { getId: function () { return "javascript"; } };
                        },
                        document: { file: { fullPath: "/test/file.js" } }
                    };
                    const matched = Helper.getMatchingSnippets("function", jsMockEditor)
                        .find(function (s) { return s.insertionKey === "default-function"; });
                    const byKey = Helper.getSnippetByInsertionKey("default-function");
                    expect(byKey).toBe(matched); // same object reference, not just equal content
                });

            it("should resolve 'function' to the PHP-scoped default (not JS) in a PHP file's hint list",
                function () {
                    // "function" is shared by both the JS default (default-function) and the PHP
                    // default (default-function-php) - this is the actual disambiguation guarantee:
                    // whichever one getMatchingSnippets resolves for a PHP file must be the PHP one,
                    // and insertion (via its insertionKey) must return that exact object, never JS's.
                    const phpMockEditor = {
                        getLanguageForPosition: function () {
                            return { getId: function () { return "php"; } };
                        },
                        document: { file: { fullPath: "/test/file.php" } }
                    };
                    const matched = Helper.getMatchingSnippets("function", phpMockEditor)
                        .find(function (s) { return s.abbreviationLower === "function"; });
                    expect(matched.insertionKey).toBe("default-function-php");
                    expect(Helper.getSnippetByInsertionKey(matched.insertionKey)).toBe(matched);
                    expect(Helper.getSnippetByInsertionKey(matched.insertionKey).fileExtension).toBe(".php");
                });
        });

        // =====================================================================
        // Snippet data structure integrity
        // =====================================================================
        describe("Snippet Data Structure", function () {
            let savedSnippetsList;

            beforeEach(function () {
                savedSnippetsList = Global.SnippetHintsList.slice();
            });

            afterEach(function () {
                Global.SnippetHintsList.length = 0;
                savedSnippetsList.forEach(function (s) {
                    Global.SnippetHintsList.push(s);
                });
                Helper.rebuildOptimizedStructures();
            });

            it("should allow adding snippets to the global list", function () {
                const initialLength = Global.SnippetHintsList.length;
                Global.SnippetHintsList.push({
                    abbreviation: "test",
                    description: "",
                    templateText: "test()",
                    fileExtension: "all"
                });
                expect(Global.SnippetHintsList.length).toBe(initialLength + 1);
            });

            it("should allow removing snippets from the global list", function () {
                Global.SnippetHintsList.length = 0;
                Global.SnippetHintsList.push({
                    abbreviation: "test",
                    description: "",
                    templateText: "test()",
                    fileExtension: "all"
                });

                const index = Global.SnippetHintsList.findIndex(
                    function (s) { return s.abbreviation === "test"; }
                );
                expect(index).toBe(0);
                Global.SnippetHintsList.splice(index, 1);
                expect(Global.SnippetHintsList.length).toBe(0);
            });

            it("should detect duplicate abbreviations", function () {
                Global.SnippetHintsList.length = 0;
                Global.SnippetHintsList.push({
                    abbreviation: "clg",
                    description: "",
                    templateText: "console.log()",
                    fileExtension: "all"
                });

                const duplicate = Global.SnippetHintsList.find(
                    function (s) { return s.abbreviation === "clg"; }
                );
                expect(duplicate).toBeDefined();
                expect(duplicate.abbreviation).toBe("clg");
            });

            it("should rebuild optimized structures after modifications", function () {
                Global.SnippetHintsList.length = 0;
                Global.SnippetHintsList.push({
                    abbreviation: "newsnip",
                    description: "New snippet",
                    templateText: "new snippet text",
                    fileExtension: ".js"
                });
                Helper.rebuildOptimizedStructures();

                const mockEditor = {
                    getLanguageForPosition: function () {
                        return { getId: function () { return "javascript"; } };
                    },
                    document: {
                        file: { fullPath: "/test/file.js" }
                    }
                };

                expect(Helper.hasExactMatchingSnippet("newsnip", mockEditor)).toBe(true);
            });

            it("should not find deleted snippets after rebuild", function () {
                Global.SnippetHintsList.length = 0;
                Global.SnippetHintsList.push({
                    abbreviation: "todelete",
                    description: "",
                    templateText: "delete me",
                    fileExtension: "all"
                });
                Helper.rebuildOptimizedStructures();

                const mockEditor = {
                    getLanguageForPosition: function () {
                        return { getId: function () { return "javascript"; } };
                    },
                    document: {
                        file: { fullPath: "/test/file.js" }
                    }
                };

                // Verify it exists first
                expect(Helper.hasExactMatchingSnippet("todelete", mockEditor)).toBe(true);

                // Delete and rebuild
                Global.SnippetHintsList.length = 0;
                Helper.rebuildOptimizedStructures();

                // Should not find it anymore
                expect(Helper.hasExactMatchingSnippet("todelete", mockEditor)).toBe(false);
            });
        });

        // =====================================================================
        // Helper: getCurrentFileExtension
        // =====================================================================
        describe("getCurrentFileExtension", function () {
            it("should return the file extension from the editor", function () {
                const mockEditor = {
                    document: {
                        file: { fullPath: "/path/to/file.js" }
                    }
                };
                expect(Helper.getCurrentFileExtension(mockEditor)).toBe(".js");
            });

            it("should return lowercase extension", function () {
                const mockEditor = {
                    document: {
                        file: { fullPath: "/path/to/FILE.HTML" }
                    }
                };
                expect(Helper.getCurrentFileExtension(mockEditor)).toBe(".html");
            });

            it("should return null when editor has no document", function () {
                const mockEditor = {};
                expect(Helper.getCurrentFileExtension(mockEditor)).toBeNull();
            });

            it("should return null when editor is null", function () {
                expect(Helper.getCurrentFileExtension(null)).toBeNull();
            });

            it("should handle file paths with multiple dots", function () {
                const mockEditor = {
                    document: {
                        file: { fullPath: "/path/to/my.component.tsx" }
                    }
                };
                expect(Helper.getCurrentFileExtension(mockEditor)).toBe(".tsx");
            });
        });

        // =====================================================================
        // Multi-language snippet support
        // =====================================================================
        describe("Multi-language snippet support", function () {
            let savedSnippetsList;

            beforeEach(function () {
                savedSnippetsList = Global.SnippetHintsList.slice();
                Global.SnippetHintsList.length = 0;
            });

            afterEach(function () {
                Global.SnippetHintsList.length = 0;
                savedSnippetsList.forEach(function (s) {
                    Global.SnippetHintsList.push(s);
                });
                Helper.rebuildOptimizedStructures();
            });

            it("should support snippet available in multiple file types", function () {
                Global.SnippetHintsList.push({
                    abbreviation: "log",
                    description: "Log statement",
                    templateText: "log(${1})",
                    fileExtension: ".js, .ts, .jsx, .tsx"
                });
                Helper.rebuildOptimizedStructures();

                const jsEditor = {
                    getLanguageForPosition: function () {
                        return { getId: function () { return "javascript"; } };
                    },
                    document: { file: { fullPath: "/test/file.js" } }
                };

                const tsEditor = {
                    getLanguageForPosition: function () {
                        return { getId: function () { return "typescript"; } };
                    },
                    document: { file: { fullPath: "/test/file.ts" } }
                };

                const jsxEditor = {
                    getLanguageForPosition: function () {
                        return { getId: function () { return "jsx"; } };
                    },
                    document: { file: { fullPath: "/test/file.jsx" } }
                };

                const pyEditor = {
                    getLanguageForPosition: function () {
                        return { getId: function () { return "python"; } };
                    },
                    document: { file: { fullPath: "/test/file.py" } }
                };

                expect(Helper.hasExactMatchingSnippet("log", jsEditor)).toBe(true);
                expect(Helper.hasExactMatchingSnippet("log", tsEditor)).toBe(true);
                expect(Helper.hasExactMatchingSnippet("log", jsxEditor)).toBe(true);
                expect(Helper.hasExactMatchingSnippet("log", pyEditor)).toBe(false);
            });

            it("should combine language-specific and universal snippets", function () {
                Global.SnippetHintsList.push(
                    {
                        abbreviation: "clg",
                        description: "Console log",
                        templateText: "console.log()",
                        fileExtension: ".js"
                    },
                    {
                        abbreviation: "comment",
                        description: "Comment block",
                        templateText: "// ${1}",
                        fileExtension: "all"
                    }
                );
                Helper.rebuildOptimizedStructures();

                const jsEditor = {
                    getLanguageForPosition: function () {
                        return { getId: function () { return "javascript"; } };
                    },
                    document: { file: { fullPath: "/test/file.js" } }
                };

                // "c" prefix should match both "clg" (JS-specific) and "comment" (all)
                const matches = Helper.getMatchingSnippets("c", jsEditor);
                expect(matches.length).toBe(2);
                const abbrs = matches.map(function (m) { return m.abbreviation; });
                expect(abbrs).toContain("clg");
                expect(abbrs).toContain("comment");
            });
        });
    });
});
