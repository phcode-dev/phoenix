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

/*global describe, it, expect, beforeEach, afterEach, awaitsFor, awaitsForDone, awaitsForFail, awaits */

define(function (require, exports, module) {


    var CommandManager,         // loaded from brackets.test
        EditorManager,          // loaded from brackets.test
        PerfUtils,              // loaded from brackets.test
        JSUtils,                // loaded from brackets.test
        Commands,
        SpecRunnerUtils     = brackets.getModule("spec/SpecRunnerUtils"),
        Strings             = brackets.getModule("strings"),
        UnitTestReporter    = brackets.getModule("test/UnitTestReporter");

    var extensionPath = SpecRunnerUtils.getTestPath("/spec/Extension-test-project-files/"),
        testPath = extensionPath + "/js-quickedit-unittest-files/syntax",
        tempPath = SpecRunnerUtils.getTempDirectory(),
        testWindow,
        initInlineTest;

    function rewriteProject(spec) {
        var result = new $.Deferred(),
            infos = {},
            options = {
                parseOffsets: true,
                infos: infos,
                removePrefix: true
            };

        SpecRunnerUtils.copyPath(testPath, tempPath, options).done(function () {
            spec.infos = infos;
            result.resolve();
        }).fail(function () {
            result.reject();
        });

        return result.promise();
    }

    // Helper function for testing cursor position
    function fixPos(pos) {
        if (!("sticky" in pos)) {
            pos.sticky = null;
        }
        return pos;
    }

    /**
     * Performs setup for an inline editor test. Parses offsets (saved to Spec.offsets) for all files in
     * the test project (testPath) and saves files back to disk without offset markup.
     * When finished, open an editor for the specified project relative file path
     * then attempts opens an inline editor at the given offset. Installs an after()
     * function restore all file content back to original state with offset markup.
     *
     * @param {!string} openFile Project relative file path to open in a main editor.
     * @param {!number} openOffset The offset index location within openFile to open an inline editor.
     * @param {?boolean} expectInline Use false to verify that an inline editor should not be opened. Omit otherwise.
     */
    var _initInlineTest = async function (openFile, openOffset, expectInline, filesToOpen) {
        var spec = this;

        filesToOpen = filesToOpen || [];
        expectInline = (expectInline !== undefined) ? expectInline : true;

        await awaitsForDone(rewriteProject(spec), "rewriteProject");

        await SpecRunnerUtils.loadProjectInTestWindow(tempPath);

        filesToOpen.push(openFile);
        await awaitsForDone(SpecRunnerUtils.openProjectFiles(filesToOpen), "openProjectFiles");

        if (openOffset !== undefined) {
            // open inline editor at specified offset index
            await awaitsForDone(SpecRunnerUtils.toggleQuickEditAtOffset(
                EditorManager.getCurrentFullEditor(),
                spec.infos[openFile].offsets[openOffset]
            ), "toggleQuickEditAtOffset");
        }
    };

    describe("extension:JSQuickEdit", function () {

        /*
         *
         */
        describe("javaScriptFunctionProvider", function () {

            beforeEach(async function () {
                initInlineTest = _initInlineTest.bind(this);
                testWindow  = await SpecRunnerUtils.createTestWindowAndRun();
                EditorManager       = testWindow.brackets.test.EditorManager;
                CommandManager      = testWindow.brackets.test.CommandManager;
                JSUtils             = testWindow.brackets.test.JSUtils;
            }, 30000);

            afterEach(async function () {
                // revert files to original content with offset markup
                initInlineTest      = null;
                testWindow          = null;
                EditorManager       = null;
                CommandManager      = null;
                JSUtils             = null;
                await SpecRunnerUtils.closeTestWindow();
            });

            it("should ignore tokens that are not function calls or references", async function () {
                var editor,
                    extensionRequire,
                    jsQuickEditMain,
                    tokensFile = "tokens.js",
                    promise,
                    offsets;

                await initInlineTest(tokensFile);

                extensionRequire = testWindow.brackets.getModule("utils/ExtensionLoader").getRequireContextForExtension("JavaScriptQuickEdit");
                jsQuickEditMain = extensionRequire("main");
                editor = EditorManager.getCurrentFullEditor();
                offsets = this.infos[tokensFile];

                // regexp token
                promise = jsQuickEditMain.javaScriptFunctionProvider(editor, offsets[0]);
                expect(promise).toBe(Strings.ERROR_JSQUICKEDIT_FUNCTIONNOTFOUND);

                // multi-line comment
                promise = jsQuickEditMain.javaScriptFunctionProvider(editor, offsets[1]);
                expect(promise).toBe(Strings.ERROR_JSQUICKEDIT_FUNCTIONNOTFOUND);

                // single-line comment
                promise = jsQuickEditMain.javaScriptFunctionProvider(editor, offsets[2]);
                expect(promise).toBe(Strings.ERROR_JSQUICKEDIT_FUNCTIONNOTFOUND);

                // string, double quotes
                promise = jsQuickEditMain.javaScriptFunctionProvider(editor, offsets[3]);
                expect(promise).toBe(Strings.ERROR_JSQUICKEDIT_FUNCTIONNOTFOUND);

                // string, single quotes
                promise = jsQuickEditMain.javaScriptFunctionProvider(editor, offsets[4]);
                expect(promise).toBe(Strings.ERROR_JSQUICKEDIT_FUNCTIONNOTFOUND);
            });

            it("should open a function with  form: function functionName()", async function () {
                await initInlineTest("test1main.js", 0);

                var inlineWidget = EditorManager.getCurrentFullEditor().getInlineWidgets()[0];
                var inlinePos = inlineWidget.editor.getCursorPos();

                // verify cursor position in inline editor
                expect(fixPos(inlinePos)).toEql(fixPos(this.infos["test1inline.js"].offsets[0]));
            });

            it("should open a function with  form: functionName = function()", async function () {
                await initInlineTest("test1main.js", 1);

                var inlineWidget = EditorManager.getCurrentFullEditor().getInlineWidgets()[0];
                var inlinePos = inlineWidget.editor.getCursorPos();

                // verify cursor position in inline editor
                expect(fixPos(inlinePos)).toEql(fixPos(this.infos["test1inline.js"].offsets[1]));
            });

            it("should open a function with  form: functionName: function()", async function () {
                await initInlineTest("test1main.js", 2);

                var inlineWidget = EditorManager.getCurrentFullEditor().getInlineWidgets()[0];
                var inlinePos = inlineWidget.editor.getCursorPos();

                // verify cursor position in inline editor
                expect(fixPos(inlinePos)).toEql(fixPos(this.infos["test1inline.js"].offsets[2]));
            });

            describe("Code hints tests within quick edit window ", function () {
                var JSCodeHints,
                    ParameterHintProvider;

                /*
                 * Ask provider for hints at current cursor position; expect it to
                 * return some
                 *
                 * @param {Object} provider - a CodeHintProvider object
                 * @param {string} key - the charCode of a key press that triggers the
                 *      CodeHint provider
                 * @return {boolean} - whether the provider has hints in the context of
                 *      the test editor
                 */
                function expectHints(provider, key) {
                    if (key === undefined) {
                        key = null;
                    }

                    expect(provider.hasHints(EditorManager.getActiveEditor(), key)).toBe(true);
                    return provider.getHints(null);
                }

                /*
                 * Wait for a hint response object to resolve, then apply a callback
                 * to the result
                 *
                 * @param {Object + jQuery.Deferred} hintObj - a hint response object,
                 *      possibly deferred
                 * @param {Function} callback - the callback to apply to the resolved
                 *      hint response object
                 */
                async function _waitForHints(hintObj, callback) {
                    var complete = false,
                        hintList = null;

                    if (hintObj.hasOwnProperty("hints")) {
                        complete = true;
                        hintList = hintObj.hints;
                    } else {
                        hintObj.done(function (obj) {
                            complete = true;
                            hintList = obj.hints;
                        });
                    }

                    await awaitsFor(function () {
                        return complete;
                    }, "Expected hints did not resolve", 3000);

                    callback(hintList);
                }

                /*
                 * Expect a given list of hints to be present in a given hint
                 * response object, and no more.
                 *
                 * @param {Object + jQuery.Deferred} hintObj - a hint response object,
                 *      possibly deferred
                 * @param {Array.<string>} expectedHints - a list of hints that should be
                 *      present in the hint response, and no more.
                 */
                async function hintsPresentExact(hintObj, expectedHints) {
                    await _waitForHints(hintObj, function (hintList) {
                        expect(hintList).toBeTruthy();
                        expect(hintList.length).toBe(expectedHints.length);
                        expectedHints.forEach(function (expectedHint, index) {
                            expect(hintList[index].data("token").value).toBe(expectedHint);
                        });
                    });
                }

                /**
                 * Show a function hint based on the code at the cursor. Verify the
                 * hint matches the passed in value.
                 *
                 * @param {Array<{name: string, type: string, isOptional: boolean}>}
                 * expectedParams - array of records, where each element of the array
                 * describes a function parameter. If null, then no hint is expected.
                 * @param {number} expectedParameter - the parameter at cursor.
                 */
                async function expectParameterHint(expectedParams, expectedParameter) {
                    var requestHints = undefined,
                        request = null;

                    function expectHint(hint) {
                        var params = hint.parameters,
                            n = params.length,
                            i;

                        // compare params to expected params
                        expect(params.length).toBe(expectedParams.length);
                        expect(hint.currentIndex).toBe(expectedParameter);

                        for (i = 0; i < n; i++) {

                            expect(params[i].name).toBe(expectedParams[i].name);
                            expect(params[i].type).toBe(expectedParams[i].type);
                            if (params[i].isOptional) {
                                expect(expectedParams[i].isOptional).toBeTruthy();
                            } else {
                                expect(expectedParams[i].isOptional).toBeFalsy();
                            }
                        }

                    }

                    request = ParameterHintProvider._getParameterHint();

                    if (expectedParams === null) {
                        request.fail(function (result) {
                            requestHints = result;
                        });

                        await awaitsForFail(request, "ParameterHints");
                    } else {
                        request.done(function (result) {
                            requestHints = result;
                        });

                        await awaitsForDone(request, "ParameterHints");
                    }

                    if (expectedParams === null) {
                        expect(requestHints).toBe(null);
                    } else {
                        expectHint(requestHints);
                    }
                }

                /**
                 * Wait for the editor to change positions, such as after a jump to
                 * definition has been triggered.  Will timeout after 3 seconds
                 *
                 * @param {{line:number, ch:number}} oldLocation - the original line/col
                 * @param {Function} callback - the callback to apply once the editor has changed position
                 */
                async function _waitForJump(oldLocation, callback) {
                    var cursor = null;
                    await awaitsFor(function () {
                        var activeEditor = EditorManager.getActiveEditor();
                        cursor = activeEditor.getCursorPos();
                        return (cursor.line !== oldLocation.line) ||
                            (cursor.ch !== oldLocation.ch);
                    }, "Expected jump did not occur", 3000);

                    callback(cursor);
                }

                /**
                 * Trigger a jump to definition, and verify that the editor jumped to
                 * the expected location.
                 *
                 * @param {{line:number, ch:number, file:string}} expectedLocation - the
                 *  line, column, and optionally the new file the editor should jump to.  If the
                 *  editor is expected to stay in the same file, then file may be omitted.
                 */
                async function editorJumped(jsCodeHints, testEditor, expectedLocation) {
                    var oldLocation = testEditor.getCursorPos();

                    jsCodeHints.handleJumpToDefinition();


                    await _waitForJump(oldLocation, function (newCursor) {
                        expect(newCursor.line).toBe(expectedLocation.line);
                        expect(newCursor.ch).toBe(expectedLocation.ch);
                        if (expectedLocation.file) {
                            var activeEditor = EditorManager.getActiveEditor();
                            expect(activeEditor.document.file.name).toBe(expectedLocation.file);
                        }
                    });
                }

                function initJSCodeHints() {
                    let extensionRequire = testWindow.brackets.getModule("utils/ExtensionLoader")
                        .getRequireContextForExtension("JavaScriptCodeHints");
                    JSCodeHints = extensionRequire("main");
                    ParameterHintProvider = JSCodeHints._phProvider;
                }

                beforeEach(async function () {
                    await initInlineTest("test.html");
                    initJSCodeHints();
                });

                afterEach(function () {
                    JSCodeHints = null;
                    ParameterHintProvider = null;
                });

                it("should see code hint lists in quick editor", async function () {
                    var start        = {line: 13, ch: 11 },
                        testPos      = {line: 5, ch: 29},
                        testEditor;

                    var openQuickEditor = SpecRunnerUtils.toggleQuickEditAtOffset(EditorManager.getCurrentFullEditor(), start);
                    await awaitsForDone(openQuickEditor, "Open quick editor");

                    testEditor = EditorManager.getActiveEditor();
                    testEditor.setCursorPos(testPos);
                    await awaits(1000); // wait for tern init
                    await expectParameterHint([{name: "mo", type: "Number"}], 0);
                });

                it("should see jump to definition on variable working in quick editor", async function () {
                    var start        = {line: 13, ch: 10 },
                        testPos      = {line: 6, ch: 7},
                        testJumpPos  = {line: 6, ch: 5},
                        jumpPos      = {line: 3, ch: 6},
                        testEditor;

                    var openQuickEditor = SpecRunnerUtils.toggleQuickEditAtOffset(EditorManager.getCurrentFullEditor(), start);
                    await awaitsForDone(openQuickEditor, "Open quick editor");

                    testEditor = EditorManager.getActiveEditor();
                    testEditor.setCursorPos(testPos);
                    var hintObj = expectHints(JSCodeHints.jsHintProvider);
                    await hintsPresentExact(hintObj, ["propA"]);

                    testEditor = EditorManager.getActiveEditor();
                    testEditor.setCursorPos(testJumpPos);
                    await editorJumped(JSCodeHints, testEditor, jumpPos);
                });
            });
        });
    });

    describe("performance:JS Quick Edit Extension", function () {

        var testPath = extensionPath + "/js-quickedit-unittest-files/jquery-ui";

        beforeEach(async function () {
            testWindow = await SpecRunnerUtils.createTestWindowAndRun();
            CommandManager      = testWindow.brackets.test.CommandManager;
            Commands                = testWindow.brackets.test.Commands;
            EditorManager       = testWindow.brackets.test.EditorManager;
            PerfUtils           = testWindow.brackets.test.PerfUtils;
        }, 30000);

        afterEach(async function () {
            testWindow      = null;
            CommandManager  = null;
            EditorManager   = null;
            PerfUtils       = null;
            await SpecRunnerUtils.closeTestWindow();
        });

        it("should open inline editors", async function () {
            await SpecRunnerUtils.loadProjectInTestWindow(testPath);

            var i,
                perfMeasurements;

            perfMeasurements = [
                {
                    measure: PerfUtils.JAVASCRIPT_INLINE_CREATE,
                    children: [
                        {
                            measure: PerfUtils.JAVASCRIPT_FIND_FUNCTION,
                            children: [
                                {
                                    measure: PerfUtils.JSUTILS_GET_ALL_FUNCTIONS,
                                    children: [
                                        {
                                            measure: PerfUtils.DOCUMENT_MANAGER_GET_DOCUMENT_FOR_PATH,
                                            name: "Document creation during this search",
                                            operation: "sum"
                                        },
                                        {
                                            measure: PerfUtils.JSUTILS_REGEXP,
                                            operation: "sum"
                                        }
                                    ]
                                },
                                {
                                    measure: PerfUtils.JSUTILS_END_OFFSET,
                                    operation: "sum"
                                }
                            ]
                        }
                    ]
                }
            ];

            await awaitsForDone(SpecRunnerUtils.openProjectFiles(["ui/jquery.effects.core.js"]), "openProjectFiles");

            var runCreateInlineEditor = async function () {
                var editor = EditorManager.getCurrentFullEditor();
                // Set the cursor in the middle of a call to "extend" so the JS helper function works correctly.
                editor.setCursorPos(271, 20);
                await awaitsForDone(
                    CommandManager.execute(Commands.TOGGLE_QUICK_EDIT),
                    "createInlineEditor",
                    5000
                );
            };

            function logPerf() {
                var reporter = UnitTestReporter.getActiveReporter();
                reporter.logTestWindow(perfMeasurements);
                reporter.clearTestWindow();
            }

            await awaits(5000);
            // repeat 5 times
            for (i = 0; i < 5; i++) {
                await runCreateInlineEditor();
                logPerf();
            }
        }, 30000);
    });
});
