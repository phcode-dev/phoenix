/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 * Original work Copyright (c) 2012 - 2021 Adobe Systems Incorporated. All rights reserved.
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

/*global jasmine, describe, it, expect, afterEach, beforeAll, afterAll, awaitsForDone, awaitsForFail, awaitsFor */

define(function (require, exports, module) {


    // Load dependent modules
    var SpecRunnerUtils = require("spec/SpecRunnerUtils"),
        KeyEvent        = require("utils/KeyEvent"),
        Commands        = require("command/Commands"),
        EditorManager,      // loaded from brackets.test
        CommandManager,
        JumpToDefManager,   // loaded via brackets.getModule - not exposed on brackets.test
        DefaultProviders,
        PathConverters;

    var testPath = SpecRunnerUtils.getTestPath("/spec/JumpToDefinitionMultiTarget-test-files"),
        testWindow,
        $;

    // Fixture positions (0-based line/character), matching the class hierarchy from
    // https://github.com/phcode-dev/phoenix/issues/3093 - a base class method overridden by
    // several subclasses, called polymorphically via greet(person).
    var POLY_FILE = "polymorphism.js",
        ALICE_FILE = "aliceClass.js",
        BASE_SAYHELLO   = { file: POLY_FILE,  line: 3,  ch: 4 },   // MyBaseClass.sayHello
        JOHN_SAYHELLO   = { file: POLY_FILE,  line: 9,  ch: 4 },   // JohnClass.sayHello
        JANE_SAYHELLO   = { file: POLY_FILE,  line: 15, ch: 4 },   // JaneClass.sayHello
        ALICE_SAYHELLO  = { file: ALICE_FILE, line: 5,  ch: 4 },   // AliceClass.sayHello (other file)
        CALL_SITE       = { line: 21, ch: 11 };                    // person.sayHello() in greet()

    describe("LegacyInteg:Jump to Definition - multiple targets", function () {

        var mockProvider;

        beforeAll(async function () {
            testWindow = await SpecRunnerUtils.createTestWindowAndRun({forceReload: true});
            $ = testWindow.$;
            CommandManager = testWindow.brackets.test.CommandManager;
            EditorManager  = testWindow.brackets.test.EditorManager;

            var modules = await new Promise(function (resolve) {
                testWindow.brackets.getModule(
                    ["features/JumpToDefManager", "languageTools/DefaultProviders", "languageTools/PathConverters"],
                    function (jumpToDefManager, defaultProviders, pathConverters) {
                        resolve({
                            JumpToDefManager: jumpToDefManager,
                            DefaultProviders: defaultProviders,
                            PathConverters: pathConverters
                        });
                    }
                );
            });
            JumpToDefManager = modules.JumpToDefManager;
            DefaultProviders = modules.DefaultProviders;
            PathConverters   = modules.PathConverters;

            await SpecRunnerUtils.loadProjectInTestWindow(testPath);
        }, 30000);

        afterAll(async function () {
            testWindow       = null;
            $                = null;
            CommandManager   = null;
            EditorManager    = null;
            JumpToDefManager = null;
            DefaultProviders = null;
            PathConverters   = null;
            await SpecRunnerUtils.closeTestWindow();
        }, 30000);

        afterEach(async function () {
            if (mockProvider) {
                JumpToDefManager.removeJumpToDefProvider(mockProvider, ["javascript"]);
                mockProvider = null;
            }
            await awaitsForDone(CommandManager.execute(Commands.FILE_CLOSE_ALL, { _forceClose: true }),
                "close all files");
        });

        // Registers a mock jump-to-def provider at a priority above the real Tern/LSP providers,
        // so NAVIGATE_JUMPTO_DEFINITION exercises the exact production picker logic in
        // DefaultProviders.js's doJumpToDef() against a deterministic, canned response instead of
        // depending on what a real language server decides to resolve (see #3093 / PR #3098).
        //
        // `implementation` (optional) configures the textDocument/implementation fallback used
        // when gotoDefinition resolves to a single location - see #3093 comment thread: a lone
        // definition is often just the base/interface declaration for a polymorphic call, so
        // doJumpToDef additionally asks the server for implementations when it advertises the
        // implementationProvider capability.
        //   implementation.result:   array/object gotoImplementation resolves with (default: none)
        //   implementation.rejects:  true to make gotoImplementation reject instead
        //   implementation.spy:      optional fn called whenever gotoImplementation is invoked
        function registerMockProvider(definitionResult, implementation) {
            mockProvider = new DefaultProviders.JumpToDefProvider({
                servesDocument: function () { return true; },
                getServerCapabilities: function () {
                    return { definitionProvider: true, implementationProvider: !!implementation };
                },
                gotoDefinition: function () {
                    return $.Deferred().resolve(definitionResult).promise();
                },
                gotoImplementation: function () {
                    if (implementation && implementation.spy) {
                        implementation.spy();
                    }
                    var deferred = $.Deferred();
                    if (implementation && implementation.rejects) {
                        deferred.reject();
                    } else {
                        deferred.resolve(implementation && implementation.result);
                    }
                    return deferred.promise();
                },
                _metricLabel: "mockTest"
            });
            JumpToDefManager.registerJumpToDefProvider(mockProvider, ["javascript"], 1000);
        }

        function locationFor(target) {
            return {
                uri: PathConverters.pathToUri(testPath + "/" + target.file),
                range: {
                    start: { line: target.line, character: target.ch },
                    end: { line: target.line, character: target.ch + "sayHello".length }
                }
            };
        }

        async function openPolymorphismFile() {
            await awaitsForDone(
                CommandManager.execute(Commands.CMD_ADD_TO_WORKINGSET_AND_OPEN,
                    { fullPath: testPath + "/" + POLY_FILE }),
                "open " + POLY_FILE
            );
            var editor = EditorManager.getCurrentFullEditor();
            editor.setCursorPos(CALL_SITE.line, CALL_SITE.ch);
            return editor;
        }

        function getOpenMenuItems() {
            return $(".inlinemenu-menu.open .inlinemenu-item");
        }

        async function awaitPickerOpen(expectedCount) {
            await awaitsFor(function () {
                return getOpenMenuItems().length === expectedCount;
            }, "jump target picker to open with " + expectedCount + " items", 3000);
        }

        it("should show a dropdown near the cursor listing every candidate", async function () {
            registerMockProvider([locationFor(BASE_SAYHELLO), locationFor(JOHN_SAYHELLO), locationFor(JANE_SAYHELLO)]);
            await openPolymorphismFile();

            CommandManager.execute(Commands.NAVIGATE_JUMPTO_DEFINITION);
            await awaitPickerOpen(3);

            // it's a cursor-anchored dropdown, not a top-of-editor ModalBar
            expect($(".modal-bar").length).toBe(0);

            var itemsText = getOpenMenuItems().text();
            expect(itemsText).toContain("polymorphism.js");
            expect(itemsText).toContain("4:5");   // BASE_SAYHELLO, 1-based
            expect(itemsText).toContain("10:5");  // JOHN_SAYHELLO, 1-based
            expect(itemsText).toContain("16:5");  // JANE_SAYHELLO, 1-based

            // dismiss so afterEach's FILE_CLOSE_ALL doesn't hit a "save changes?" dialog concern
            SpecRunnerUtils.simulateKeyEvent(KeyEvent.DOM_VK_ESCAPE, "keydown", $(".inlinemenu-menu.open")[0]);
        });

        it("should jump to the clicked target in the current document", async function () {
            registerMockProvider([locationFor(BASE_SAYHELLO), locationFor(JOHN_SAYHELLO), locationFor(JANE_SAYHELLO)]);
            var editor = await openPolymorphismFile();

            var jumpPromise = CommandManager.execute(Commands.NAVIGATE_JUMPTO_DEFINITION);
            await awaitPickerOpen(3);

            getOpenMenuItems().eq(1).trigger("click");   // JohnClass.sayHello
            await awaitsForDone(jumpPromise, "jump to clicked target");

            expect(getOpenMenuItems().length).toBe(0);
            var pos = editor.getCursorPos();
            expect(pos.line).toBe(JOHN_SAYHELLO.line);
            expect(pos.ch).toBe(JOHN_SAYHELLO.ch);
        });

        it("should open the target file when the picked target is in a different document", async function () {
            registerMockProvider([locationFor(BASE_SAYHELLO), locationFor(ALICE_SAYHELLO)]);
            await openPolymorphismFile();

            var jumpPromise = CommandManager.execute(Commands.NAVIGATE_JUMPTO_DEFINITION);
            await awaitPickerOpen(2);

            getOpenMenuItems().eq(1).trigger("click");   // AliceClass.sayHello, in aliceClass.js
            await awaitsForDone(jumpPromise, "jump to target in a different file");

            var editor = EditorManager.getCurrentFullEditor();
            expect(editor.document.file.name).toBe(ALICE_FILE);
            var pos = editor.getCursorPos();
            expect(pos.line).toBe(ALICE_SAYHELLO.line);
            expect(pos.ch).toBe(ALICE_SAYHELLO.ch);
        });

        it("should navigate and select purely by keyboard", async function () {
            registerMockProvider([locationFor(BASE_SAYHELLO), locationFor(JOHN_SAYHELLO), locationFor(JANE_SAYHELLO)]);
            var editor = await openPolymorphismFile();

            var jumpPromise = CommandManager.execute(Commands.NAVIGATE_JUMPTO_DEFINITION);
            await awaitPickerOpen(3);

            var $menu = $(".inlinemenu-menu.open")[0];
            // selection starts on item 0 (MyBaseClass); Down, Down -> item 2 (JaneClass)
            SpecRunnerUtils.simulateKeyEvent(KeyEvent.DOM_VK_DOWN, "keydown", $menu);
            SpecRunnerUtils.simulateKeyEvent(KeyEvent.DOM_VK_DOWN, "keydown", $menu);
            SpecRunnerUtils.simulateKeyEvent(KeyEvent.DOM_VK_RETURN, "keydown", $menu);

            await awaitsForDone(jumpPromise, "jump via keyboard selection");

            expect(getOpenMenuItems().length).toBe(0);
            var pos = editor.getCursorPos();
            expect(pos.line).toBe(JANE_SAYHELLO.line);
            expect(pos.ch).toBe(JANE_SAYHELLO.ch);
        });

        it("should dismiss without navigating on Escape", async function () {
            registerMockProvider([locationFor(BASE_SAYHELLO), locationFor(JOHN_SAYHELLO), locationFor(JANE_SAYHELLO)]);
            var editor = await openPolymorphismFile();
            var posBefore = editor.getCursorPos();

            var jumpPromise = CommandManager.execute(Commands.NAVIGATE_JUMPTO_DEFINITION);
            await awaitPickerOpen(3);

            SpecRunnerUtils.simulateKeyEvent(KeyEvent.DOM_VK_ESCAPE, "keydown", $(".inlinemenu-menu.open")[0]);

            await awaitsForFail(jumpPromise, "Esc rejects the jump instead of hanging");

            expect(getOpenMenuItems().length).toBe(0);
            var posAfter = editor.getCursorPos();
            expect(posAfter.line).toBe(posBefore.line);
            expect(posAfter.ch).toBe(posBefore.ch);
        });

        it("should jump immediately with no picker when only one location is returned", async function () {
            registerMockProvider([locationFor(BASE_SAYHELLO)]);
            var editor = await openPolymorphismFile();

            await awaitsForDone(CommandManager.execute(Commands.NAVIGATE_JUMPTO_DEFINITION),
                "immediate jump for a single target");

            expect(getOpenMenuItems().length).toBe(0);
            var pos = editor.getCursorPos();
            expect(pos.line).toBe(BASE_SAYHELLO.line);
            expect(pos.ch).toBe(BASE_SAYHELLO.ch);
        });

        it("should fall back to implementations when a single definition is just the base declaration",
            async function () {
                // gotoDefinition resolves to the base declaration only (as real LSP servers do for
                // this exact polymorphic-call repro - see #3093); the server also advertises
                // implementationProvider and, when asked, knows about all 3 concrete overrides.
                registerMockProvider([locationFor(BASE_SAYHELLO)], {
                    result: [locationFor(JOHN_SAYHELLO), locationFor(JANE_SAYHELLO), locationFor(ALICE_SAYHELLO)]
                });
                await openPolymorphismFile();

                var jumpPromise = CommandManager.execute(Commands.NAVIGATE_JUMPTO_DEFINITION);
                await awaitPickerOpen(3);

                getOpenMenuItems().eq(2).trigger("click");   // AliceClass.sayHello
                await awaitsForDone(jumpPromise, "jump to an implementation after the fallback");

                var editor = EditorManager.getCurrentFullEditor();
                expect(editor.document.file.name).toBe(ALICE_FILE);
                var pos = editor.getCursorPos();
                expect(pos.line).toBe(ALICE_SAYHELLO.line);
                expect(pos.ch).toBe(ALICE_SAYHELLO.ch);
            });

        it("should jump straight to the definition when implementations adds nothing new", async function () {
            // implementationProvider is advertised, but the server has nothing extra to offer
            // (0 or 1 results) - doJumpToDef must not show an empty/single-item picker.
            registerMockProvider([locationFor(BASE_SAYHELLO)], { result: [] });
            var editor = await openPolymorphismFile();

            await awaitsForDone(CommandManager.execute(Commands.NAVIGATE_JUMPTO_DEFINITION),
                "direct jump when implementations is empty");

            expect(getOpenMenuItems().length).toBe(0);
            var pos = editor.getCursorPos();
            expect(pos.line).toBe(BASE_SAYHELLO.line);
            expect(pos.ch).toBe(BASE_SAYHELLO.ch);
        });

        it("should jump straight to the definition when the implementation request fails", async function () {
            // A failed/unsupported implementation lookup must not break or hang the ordinary
            // single-definition jump.
            registerMockProvider([locationFor(BASE_SAYHELLO)], { rejects: true });
            var editor = await openPolymorphismFile();

            await awaitsForDone(CommandManager.execute(Commands.NAVIGATE_JUMPTO_DEFINITION),
                "direct jump when the implementation request rejects");

            expect(getOpenMenuItems().length).toBe(0);
            var pos = editor.getCursorPos();
            expect(pos.line).toBe(BASE_SAYHELLO.line);
            expect(pos.ch).toBe(BASE_SAYHELLO.ch);
        });

        it("should not query implementations when the server doesn't advertise the capability",
            async function () {
                var implementationSpy = jasmine.createSpy("gotoImplementation");
                // registerMockProvider only sets implementationProvider:true when an `implementation`
                // options object is passed - omit it here to simulate a server without the capability,
                // but still wire the spy in manually to prove it's never called.
                registerMockProvider([locationFor(BASE_SAYHELLO)]);
                mockProvider.client.gotoImplementation = implementationSpy;
                var editor = await openPolymorphismFile();

                await awaitsForDone(CommandManager.execute(Commands.NAVIGATE_JUMPTO_DEFINITION),
                    "direct jump without ever consulting implementations");

                expect(implementationSpy).not.toHaveBeenCalled();
                expect(getOpenMenuItems().length).toBe(0);
                var pos = editor.getCursorPos();
                expect(pos.line).toBe(BASE_SAYHELLO.line);
                expect(pos.ch).toBe(BASE_SAYHELLO.ch);
            });

        // buildExcerpt() is pure line-array -> string logic (no editor/DOM needed), so these test
        // it directly rather than through the picker's hover UI - see
        // DefaultProviders.js showJumpTargetPicker()/showExcerptFor()/buildExcerpt(). The excerpt
        // is the enclosing declaration line (if found, via findEnclosingDeclarationLine), then the
        // target's own block (via findBlockEndLine, capped independently with its own "..." if it
        // runs long). A sibling member between the declaration and the target is never shown,
        // however small - it isn't why this target was picked. Each "..." marker - top and bottom -
        // is only ever inserted where something real is actually being hidden: a member between
        // the declaration and target for the top one, more of the block than fits for the bottom
        // one. Adjacent declaration+target (nothing real between them, blank lines included) shows
        // no top marker at all - it would be actively misleading to imply something was hidden
        // when nothing was.
        describe("excerpt building", function () {

            it("should not show a ... between declaration and target when they're directly adjacent",
                function () {
                    // JohnClass/JaneClass in the real polymorphism.js fixture are exactly this
                    // shape: sayHello() is the class's only member, right after the declaration.
                    var lines = [
                        "class MyBaseClass {",
                        "    sayHello() {",
                        "        console.log(\"Hello from MyBaseClass\");",
                        "    }",
                        "}",
                        "",
                        "class JohnClass extends MyBaseClass {",
                        "    sayHello() {",
                        "        console.log(\"Hello from JohnClass\");",
                        "    }",
                        "}"
                    ];
                    var excerpt = DefaultProviders._buildJumpToDefExcerpt(lines, 7); // "    sayHello() {"

                    expect(excerpt).toBe([
                        "class JohnClass extends MyBaseClass {",
                        "    sayHello() {",
                        "        console.log(\"Hello from JohnClass\");",
                        "    }"
                    ].join("\n"));
                    expect(excerpt).not.toContain("...");
                });

            it("should not show a ... when only a blank line sits between declaration and target",
                function () {
                    var lines = ["class Foo {", "", "  sayHello() {", "    console.log(1);", "  }", "}"];
                    var excerpt = DefaultProviders._buildJumpToDefExcerpt(lines, 2); // "  sayHello() {"

                    expect(excerpt).toBe([
                        "class Foo {",
                        "  sayHello() {",
                        "    console.log(1);",
                        "  }"
                    ].join("\n"));
                    expect(excerpt).not.toContain("...");
                });

            it("should always collapse to declaration + ... + target, even when a sibling would fit",
                function () {
                    var lines = [
                        "class AliceClass extends MyBaseClass {",
                        "  yellow() {",
                        "    console.log(\"not so soon\");",
                        "  }",
                        "  sayHello() {",
                        "    console.log(\"Hello, Alice!\");",
                        "  }",
                        "}"
                    ];
                    var excerpt = DefaultProviders._buildJumpToDefExcerpt(lines, 4); // "  sayHello() {"

                    // declaration, then "...", then just sayHello's own block - yellow() is never
                    // shown, even though there'd be plenty of room for it
                    expect(excerpt).toBe([
                        "class AliceClass extends MyBaseClass {",
                        "  ...",
                        "  sayHello() {",
                        "    console.log(\"Hello, Alice!\");",
                        "  }"
                    ].join("\n"));
                    expect(excerpt).not.toContain("yellow");
                    expect(excerpt).not.toContain("not so soon");
                });

            it("should collapse to declaration + ... + target when many members sit in between",
                function () {
                    var lines = ["class BigClass extends MyBaseClass {"];
                    for (var i = 1; i <= 9; i++) {
                        lines.push("  method" + i + "() {");
                        lines.push("    doThing" + i + "();");
                        lines.push("  }");
                    }
                    var targetLine = lines.length; // where the 10th method starts
                    lines.push("  sayHello() {");
                    lines.push("    console.log(\"Hello, Big!\");");
                    lines.push("  }");
                    lines.push("}");

                    var excerpt = DefaultProviders._buildJumpToDefExcerpt(lines, targetLine);
                    var excerptLines = excerpt.split("\n");

                    // declaration line is never lost, even though the target is far below it...
                    expect(excerptLines[0]).toBe("class BigClass extends MyBaseClass {");
                    // ...collapsed with a single marker line...
                    expect(excerptLines[1]).toBe("  ...");
                    // ...and none of the 9 unrelated sibling methods leak into the excerpt just to
                    // fill space - only the target's own lines follow the marker.
                    expect(excerpt).not.toContain("method1(");
                    expect(excerpt).not.toContain("method9(");
                    expect(excerpt).not.toContain("doThing");
                    expect(excerptLines[2]).toBe("  sayHello() {");
                    expect(excerptLines[3]).toBe("    console.log(\"Hello, Big!\");");
                });

            it("should not show a trailing ... when the target's own block ends naturally, even if " +
                "more code follows it in the file", function () {
                // sayHello's block is short and closes with its own "}" well before the file
                // ends - a sibling method (unrelated to sayHello's own block) follows right
                // after. The bottom marker must track sayHello's own natural end, not just
                // "is there more file left".
                var lines = [
                    "class Foo {",
                    "  sayHello() {",
                    "    console.log(\"hi\");",
                    "  }",
                    "  anotherMethod() {",
                    "    console.log(\"unrelated\");",
                    "  }",
                    "}"
                ];
                var excerpt = DefaultProviders._buildJumpToDefExcerpt(lines, 1); // "  sayHello() {"

                expect(excerpt).toBe([
                    "class Foo {",
                    "  sayHello() {",
                    "    console.log(\"hi\");",
                    "  }"
                ].join("\n"));
                expect(excerpt).not.toContain("...");
                expect(excerpt).not.toContain("anotherMethod");
            });

            it("should collapse a long target body to its own ... marker instead of silently cutting it",
                function () {
                    var lines = [
                        "class AliceClass extends MyBaseClass {",
                        "  yellow() {",
                        "    console.log(\"not so soon\");",
                        "  }",
                        "  sayHello() {"
                    ];
                    for (var i = 0; i < 20; i++) {
                        lines.push("    console.log(\"Hello, Alice!\");");
                    }
                    lines.push("  }");
                    lines.push("}");

                    var excerpt = DefaultProviders._buildJumpToDefExcerpt(lines, 4); // "  sayHello() {"
                    var excerptLines = excerpt.split("\n");

                    // declaration + "..." as always (yellow() is still never shown), then the
                    // target's own block, capped with its own separate "..." rather than showing
                    // all 20 repeated lines - the two markers are independent
                    expect(excerptLines[0]).toBe("class AliceClass extends MyBaseClass {");
                    expect(excerptLines[1]).toBe("  ...");
                    expect(excerptLines[2]).toBe("  sayHello() {");
                    expect(excerpt).not.toContain("yellow");
                    expect(excerpt).not.toContain("not so soon");
                    // honestly marked as cut off, not silently stopped
                    var lastLine = excerptLines[excerptLines.length - 1];
                    expect(lastLine).toBe("  ...");
                    expect(excerptLines.filter(function (l) {
                        return l.indexOf("Hello, Alice!") !== -1;
                    }).length).toBeLessThan(20);
                });

            it("should show forward from the target's own block with no collapsing when nothing encloses it",
                function () {
                    var lines = [
                        "function topLevelOne() {}",
                        "function sayHello() {",
                        "  console.log(\"top level\");",
                        "}",
                        "function topLevelThree() {}"
                    ];
                    var excerpt = DefaultProviders._buildJumpToDefExcerpt(lines, 1); // top-level, indent 0

                    expect(excerpt).not.toContain("...");
                    // sayHello's own block only - never spills into the unrelated function after it
                    expect(excerpt).toBe(lines.slice(1, 4).join("\n"));
                    expect(excerpt).not.toContain("topLevelThree");
                });
        });

        // Everything above stubs the LSP client, so the picker/excerpt logic is tested
        // deterministically regardless of what any real language server does. This one instead
        // exercises the exact #3093 repro - a real Ctrl+J at obj.sayHello() - against vtsls, the
        // actual TypeScript server Phoenix ships, so a regression can't hide behind every mocked
        // test still passing. Desktop-only: vtsls has no browser-build equivalent (Tern there
        // doesn't do multi-target resolution the same way - see EditorCommandHandlers-integ-test.js
        // for the same window.Phoenix.isNativeApp split on the single-target case).
        if (window.Phoenix.isNativeApp) {
            describe("real vtsls server (desktop only)", function () {
                // AliceClass lives in a separate file (realLspAliceClass.js, require()'d from
                // REAL_FILE) - John/Jane cover the same-file case, Alice covers a picker candidate
                // whose item/excerpt must show a different filename and whose click must actually
                // switch files, both against a real server-provided URI rather than a mock one.
                var REAL_FILE = "realLspPolymorphism.js",
                    REAL_ALICE_FILE = "realLspAliceClass.js",
                    REAL_CALL_LINE = 34; // 0-based: "  obj.sayHello();" in REAL_FILE

                beforeAll(async function () {
                    // Cold-start the language server here (spawn vtsls + tsserver loading the
                    // TypeScript library) so the actual test below only needs to budget for an
                    // already-warm request - see the identical warm-up in
                    // EditorCommandHandlers-integ-test.js.
                    await awaitsForDone(
                        CommandManager.execute(Commands.CMD_ADD_TO_WORKINGSET_AND_OPEN,
                            { fullPath: testPath + "/" + REAL_FILE }),
                        "warm-up: open " + REAL_FILE
                    );
                    var LSPClient = await new Promise(function (resolve) {
                        testWindow.brackets.getModule(["languageTools/LSPClient"], resolve);
                    });
                    await awaitsFor(function () {
                        return LSPClient.isLintingProviderActive("javascript");
                    }, "the TypeScript language server to finish its cold start", 90000);
                    await awaitsForDone(CommandManager.execute(Commands.FILE_CLOSE_ALL, { _forceClose: true }),
                        "close warm-up file");
                }, 120000);

                function itemIndexContaining(substr) {
                    var idx = -1;
                    getOpenMenuItems().each(function (i, el) {
                        if ($(el).text().indexOf(substr) !== -1) {
                            idx = i;
                        }
                    });
                    return idx;
                }

                async function excerptTextForItem(index) {
                    getOpenMenuItems().eq(index).trigger("mouseover");
                    await new Promise(function (resolve) { setTimeout(resolve, 400); });
                    // the whole popup, not just $(".lsp-hint-doc-popup pre") - the title (filename
                    // + line) is a sibling <div> outside the <pre>, not inside it
                    return $(".lsp-hint-doc-popup").text();
                }

                // One jump attempt capped at 3s (same pattern/reasoning as
                // EditorCommandHandlers-integ-test.js's attemptJumpToDefinition): a hung or
                // not-yet-ready request just counts as a failed attempt so awaitsFor can retry
                // instead of the whole budget being pinned on one slow request. Stashes the
                // command's own promise on lastJumpPromise so a successful attempt's picker can be
                // interacted with afterward without re-invoking the command (which would open a
                // second picker on top of the one already showing).
                var lastJumpPromise = null;
                function attemptOpenPicker(editor, line, ch) {
                    return new Promise(function (resolve) {
                        editor.setCursorPos(line, ch);
                        lastJumpPromise = CommandManager.execute(Commands.NAVIGATE_JUMPTO_DEFINITION);
                        setTimeout(function () { resolve(getOpenMenuItems().length); }, 3000);
                    });
                }

                it("should show the multi-target picker and correct excerpts for a real click " +
                    "on obj.sayHello()", async function () {
                    await awaitsForDone(
                        CommandManager.execute(Commands.CMD_ADD_TO_WORKINGSET_AND_OPEN,
                            { fullPath: testPath + "/" + REAL_FILE }),
                        "open " + REAL_FILE
                    );
                    var editor = EditorManager.getCurrentFullEditor(),
                        callLine = editor.document.getLine(REAL_CALL_LINE),
                        callCh = callLine.indexOf("sayHello") + 2;

                    await awaitsFor(async function () {
                        return (await attemptOpenPicker(editor, REAL_CALL_LINE, callCh)) === 3;
                    }, "vtsls to resolve obj.sayHello() to John/Jane/Alice's 3 implementations", 20000, 500);

                    var johnIdx = itemIndexContaining("17:3"), // JohnClass.sayHello, 1-based
                        janeIdx = itemIndexContaining("23:3"), // JaneClass.sayHello, 1-based
                        aliceIdx = itemIndexContaining("13:3"); // AliceClass.sayHello, 1-based
                    expect(johnIdx).toBeGreaterThan(-1);
                    expect(janeIdx).toBeGreaterThan(-1);
                    expect(aliceIdx).toBeGreaterThan(-1);

                    // Same-file candidates (John/Jane) show REAL_FILE's own name, not the other
                    // file's - and John/Jane sayHello is each class's only member, directly
                    // adjacent to the declaration, so no "..." should be implied where nothing
                    // was hidden.
                    var johnItemText = getOpenMenuItems().eq(johnIdx).text();
                    expect(johnItemText).toContain(REAL_FILE);
                    expect(johnItemText).not.toContain(REAL_ALICE_FILE);
                    var johnExcerpt = await excerptTextForItem(johnIdx);
                    expect(johnExcerpt).toContain(REAL_FILE);
                    expect(johnExcerpt).not.toContain(REAL_ALICE_FILE);
                    expect(johnExcerpt).toContain("class JohnClass extends MyBaseClass {");
                    expect(johnExcerpt).toContain("Hello, John!");
                    expect(johnExcerpt).not.toContain("...");

                    var janeExcerpt = await excerptTextForItem(janeIdx);
                    expect(janeExcerpt).toContain("class JaneClass extends MyBaseClass {");
                    expect(janeExcerpt).toContain("Hello, Jane!");
                    expect(janeExcerpt).not.toContain("...");

                    // Alice lives in a different file (REAL_ALICE_FILE) - the item/excerpt must
                    // say so using the real server-provided URI, not REAL_FILE's name. yellow()
                    // sits between the declaration and sayHello (top "..."), and sayHello's own
                    // body is 21 lines long (bottom "...") - both collapse markers should fire in
                    // the same excerpt, yellow() itself never shown.
                    var aliceItemText = getOpenMenuItems().eq(aliceIdx).text();
                    expect(aliceItemText).toContain(REAL_ALICE_FILE);
                    var aliceExcerpt = await excerptTextForItem(aliceIdx);
                    expect(aliceExcerpt).toContain(REAL_ALICE_FILE);
                    expect(aliceExcerpt).toContain("class AliceClass extends MyBaseClass {");
                    expect(aliceExcerpt).not.toContain("yellow");
                    expect(aliceExcerpt).not.toContain("not so soon");
                    expect((aliceExcerpt.match(/\.\.\./g) || []).length).toBe(2);
                    var helloAliceCount = (aliceExcerpt.match(/Hello, Alice!/g) || []).length;
                    expect(helloAliceCount).toBeGreaterThan(0);
                    expect(helloAliceCount).toBeLessThan(21);

                    // Click Alice's candidate (on the picker already open from the last
                    // successful attempt above) and confirm the jump actually switches to
                    // REAL_ALICE_FILE and lands on the right line there.
                    getOpenMenuItems().eq(aliceIdx).trigger("click");
                    await awaitsForDone(lastJumpPromise, "jump to AliceClass.sayHello");

                    expect(getOpenMenuItems().length).toBe(0);
                    var aliceEditor = EditorManager.getCurrentFullEditor();
                    expect(aliceEditor.document.file.name).toBe(REAL_ALICE_FILE);
                    var pos = aliceEditor.getCursorPos();
                    expect(pos.line).toBe(12); // "  sayHello() {" in AliceClass, 0-based
                }, 35000);
            });
        }

        it("should no-op without a picker when no definition is found", async function () {
            registerMockProvider([]);
            var editor = await openPolymorphismFile();
            var posBefore = editor.getCursorPos();

            await awaitsForFail(CommandManager.execute(Commands.NAVIGATE_JUMPTO_DEFINITION),
                "no definition found rejects instead of hanging");

            expect(getOpenMenuItems().length).toBe(0);
            var posAfter = editor.getCursorPos();
            expect(posAfter.line).toBe(posBefore.line);
            expect(posAfter.ch).toBe(posBefore.ch);
        });
    });
});
