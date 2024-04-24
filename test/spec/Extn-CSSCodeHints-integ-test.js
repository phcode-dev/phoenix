/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 * Original work Copyright (c) 2013 - 2021 Adobe Systems Incorporated. All rights reserved.
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

/*global describe, it, expect, beforeAll, awaitsFor, awaitsForDone, afterAll */

define(function (require, exports, module) {


    const SpecRunnerUtils    = require("spec/SpecRunnerUtils");

    describe("integration:CSS Code Hints Language Service", function () {
        let testFolder = SpecRunnerUtils.getTestPath("/spec/LanguageTools-test-files/css-language-service");

        // load from testWindow
        let testWindow,
            brackets,
            EditorManager,
            QuickView,
            editor,
            testFile = "css-lint-errors.css";

        beforeAll(async function () {
            // Create a new window that will be shared by ALL tests in this spec.
            if (!testWindow) {
                testWindow = await SpecRunnerUtils.createTestWindowAndRun();

                await SpecRunnerUtils.loadProjectInTestWindow(testFolder);
            }

            // Load module instances from brackets.test
            brackets = testWindow.brackets;
            EditorManager = brackets.test.EditorManager;
            QuickView = brackets.test.QuickViewManager;

            await awaitsForDone(SpecRunnerUtils.openProjectFiles([testFile]), "open test file: " + testFile);

            editor  = EditorManager.getCurrentFullEditor();
        }, 30000);

        afterAll(async function () {
            testWindow       = null;
            brackets         = null;
            EditorManager    = null;
            QuickView        = null;
            await SpecRunnerUtils.closeTestWindow();
        }, 30000);

        async function getPopoverAtPos(lineNum, columnNum) {
            editor  = EditorManager.getCurrentFullEditor();
            let cm = editor._codeMirror,
                pos = { line: lineNum, ch: columnNum },
                token;

            editor.setCursorPos(pos);
            token = cm.getTokenAt(pos, true);

            return QuickView._queryPreviewProviders(editor, pos, token);
        }

        async function expectNoCSSLintQuickViewAtPos(line, ch) {
            let popoverInfo = await getPopoverAtPos(line, ch);
            if(popoverInfo){
                expect(popoverInfo.content.find(".code-inspection-item").length).toBe(0);
            }
        }

        async function checkCSSWarningAtPos(expectedWarning, line, ch) {
            await awaitsFor(async ()=>{
                return await getPopoverAtPos(line, ch);
            }, "popover to be present");
            let popoverInfo = await getPopoverAtPos(line, ch);
            expect(popoverInfo.content.find(".code-inspection-item").text().trim()).toBe(expectedWarning);
        }

        function runTests(testTyle) {
            it(`Should ${testTyle} show warning`, async function () {
                await checkCSSWarningAtPos("Do not use empty rulesets (emptyRules)", 2, 0);
            });

            it(`Should ${testTyle} show no warning for imports`, async function () {
                await expectNoCSSLintQuickViewAtPos(1, 1);
            });

            it(`Should ${testTyle} show duplicate properties warning`, async function () {
                await checkCSSWarningAtPos("Do not use duplicate style definitions (duplicateProperties)",
                    5, 8);
                await checkCSSWarningAtPos("Do not use duplicate style definitions (duplicateProperties)",
                    6, 8);
            });

            it(`Should ${testTyle} show duplicate properties warning`, async function () {
                await checkCSSWarningAtPos("No unit for zero needed (zeroUnits)",
                    10, 11);
            });

            it(`Should ${testTyle} show no warning for box model`, async function () {
                // dont use width and height when using padding
                await expectNoCSSLintQuickViewAtPos(14, 8);
                await expectNoCSSLintQuickViewAtPos(15, 8);
                await expectNoCSSLintQuickViewAtPos(16, 8);
            });

            it(`Should ${testTyle} show unknown properties warning`, async function () {
                await checkCSSWarningAtPos("Unknown property: 'doesntExist' (unknownProperties)",
                    20, 8);
            });

            it(`Should ${testTyle} show ie hack warning`, async function () {
                await checkCSSWarningAtPos("IE hacks are only necessary when supporting IE7 and older (ieHack)",
                    25, 8);
            });

            it(`Should ${testTyle} show ignored due to display warning`, async function () {
                await checkCSSWarningAtPos("inline-block is ignored due to the float. If 'float' has a value other than 'none', the box is floated and 'display' is treated as 'block' (propertyIgnoredDueToDisplay)",
                    30, 8);
            });

            it(`Should ${testTyle} show no warning on !important`, async function () {
                await expectNoCSSLintQuickViewAtPos(34, 8);
                await expectNoCSSLintQuickViewAtPos(35, 8);
            });

            it(`Should ${testTyle} show font-face warning`, async function () {
                await checkCSSWarningAtPos("@font-face rule must define 'src' and 'font-family' properties (fontFaceProperties)",
                    38, 8);
                await checkCSSWarningAtPos("@font-face rule must define 'src' and 'font-family' properties (fontFaceProperties)",
                    39, 8);
            });

            it(`Should ${testTyle} show unknown vendor prefix warning`, async function () {
                await checkCSSWarningAtPos("Unknown vendor specific property. (unknownVendorSpecificProperties)Also define the standard property 'border-radius' for compatibility (vendorPrefix)",
                    43, 8);
            });
        }

        const testFiles = ["css-lint-errors.css", "less-lint-errors.less", "less-lint-errors.scss"];

        for(let localTestFile of testFiles){
            describe("CSS warnings quick view", function () {
                beforeAll(async function () {
                    await awaitsForDone(SpecRunnerUtils.openProjectFiles([localTestFile]), "open test file: " + testFile);
                }, 30000);

                runTests(localTestFile);
            });
        }

        describe("less and scss warnings quick view", function () {
            it(`Should allow comments in less`, async function () {
                await awaitsForDone(SpecRunnerUtils.openProjectFiles(["less-lint-errors.less"]), "open test file: less-lint-errors.less");
                await expectNoCSSLintQuickViewAtPos(46, 8);
            });

            it(`Should less syntax specific show duplicate properties warning`, async function () {
                await awaitsForDone(SpecRunnerUtils.openProjectFiles(["less-lint-errors.less"]), "open test file: less-lint-errors.less");
                await checkCSSWarningAtPos("Do not use duplicate style definitions (duplicateProperties)",
                    49, 14);
                await checkCSSWarningAtPos("Do not use duplicate style definitions (duplicateProperties)",
                    50, 14);
            });

            it(`Should allow comments in scss`, async function () {
                await awaitsForDone(SpecRunnerUtils.openProjectFiles(["less-lint-errors.scss"]), "open test file: less-lint-errors.scss");
                await expectNoCSSLintQuickViewAtPos(46, 8);
            });

            it(`Should allow scss specific syntax`, async function () {
                await awaitsForDone(SpecRunnerUtils.openProjectFiles(["less-lint-errors.scss"]), "open test file: less-lint-errors.scss");
                await expectNoCSSLintQuickViewAtPos(48, 12);
            });

        });
    });
});
