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

/*global describe, it, beforeAll, afterAll */

define(function (require, exports, module) {


    var SpecRunnerUtils = require("spec/SpecRunnerUtils");

    describe("integration:Auto space and tabs detect", function () {
        const testRootSpec = "/spec/space-detect-test-files/";
        let testProjectsFolder = SpecRunnerUtils.getTestPath(testRootSpec),
            testWindow,
            $,
            __PR; // __PR can be debugged using debug menu> phoenix code diag tools> test builder

        beforeAll(async function () {
            testWindow = await SpecRunnerUtils.createTestWindowAndRun();
            // Load module instances from brackets.test
            await SpecRunnerUtils.loadProjectInTestWindow(testProjectsFolder);
            __PR = testWindow.__PR;
            $ = testWindow.$;
        }, 30000);

        afterAll(async function () {
            await __PR.closeAll();
            testWindow    = null;
            __PR          = null;
            $             = null;
            await SpecRunnerUtils.closeTestWindow();
        }, 30000);

        function validateSpacing(type, value, autoMode) {
            __PR.validateEqual($("#indent-type").text(), type);
            __PR.validateEqual($("#indent-width-label").text(), value);
            __PR.validateEqual($("#indent-auto").text(), autoMode);
        }

        it(`should detect 1 space auto`, async function () {
            await __PR.openFile("space-1.js");
            validateSpacing("Spaces:", "1", "Auto");
            await __PR.closeFile();
        });

        it(`should detect 12 space as 10 spaces auto`, async function () {
            await __PR.openFile("space-12.js");
            validateSpacing("Spaces:", "10", "Auto");
            await __PR.closeFile();
        });

        it(`should detect no space as default 4 spaces auto`, async function () {
            await __PR.openFile("space-none.js");
            validateSpacing("Spaces:", "4", "Auto");
            await __PR.closeFile();
        });

        async function verifyIf2TabsWithEdits() {
            __PR.setCursors(["1:14"]);
            __PR.keydown(["RETURN"]);
            __PR.expectCursorsToBe(["2:3"]);
            await __PR.undo();
        }

        it(`should detect 2 tabs auto`, async function () {
            await __PR.openFile("tab-2.js");
            validateSpacing("Tab Size:", "4", "Auto"); // auto mode will always fix tab space to 4
            await verifyIf2TabsWithEdits();
            await __PR.closeFile();
        });

        it(`should detect 12 tabs as 4 tab units only`, async function () {
            await __PR.openFile("tab-12.js");
            validateSpacing("Tab Size:", "4", "Auto");
            __PR.setCursors(["1:14"]);
            __PR.keydown(["RETURN"]);
            __PR.expectCursorsToBe(["2:5"]);
            await __PR.closeFile();
        });

        it(`should be able to override individual file's tab/spacing in auto mode`, async function () {
            await __PR.openFile("space-1.js");
            validateSpacing("Spaces:", "1", "Auto");
            $("#indent-type").click();
            validateSpacing("Tab Size:", "4", "Auto");
            // now switch to another file
            await __PR.openFile("tab-2.js");
            validateSpacing("Tab Size:", "4", "Auto");
            await verifyIf2TabsWithEdits();
            // now switch back and it should remember the overridden settings
            await __PR.openFile("space-1.js");
            validateSpacing("Tab Size:", "4", "Auto");
            // now change the tab units
            __PR.EDITING.setEditorSpacing(true, 6, true);
            validateSpacing("Tab Size:", "6", "Auto");
            // now close the file and switch to another file
            await __PR.closeFile();
            await __PR.openFile("tab-2.js");
            validateSpacing("Tab Size:", "4", "Auto");
            await verifyIf2TabsWithEdits();
            // now switch back and it should remember the overridden settings
            await __PR.openFile("space-1.js");
            validateSpacing("Tab Size:", "6", "Auto");
            await __PR.closeFile();
        });

        it(`should switching to fixed mode default to 4 spaces for all files`, async function () {
            await __PR.openFile("tab-2.js");
            validateSpacing("Tab Size:", "4", "Auto");
            await verifyIf2TabsWithEdits();
            $("#indent-auto").click();
            validateSpacing("Spaces:", "4", "Fixed");
            await __PR.openFile("space-1.js");
            validateSpacing("Spaces:", "4", "Fixed");
            await __PR.closeFile();
        });

        it(`should be able to change spacing/tabs settings of fixed mode`, async function () {
            await __PR.openFile("tab-2.js");
            // now change the fixed width
            __PR.EDITING.setEditorSpacing(true, 6, false);
            validateSpacing("Tab Size:", "6", "Fixed");
            await __PR.openFile("space-12.js");
            validateSpacing("Tab Size:", "6", "Fixed");
            // revert back to defaults
            __PR.EDITING.setEditorSpacing(false, 4, false);
            await __PR.closeFile();
        });

        async function verifyIf2SpacesWithEdit() {
            __PR.setCursors(["1:14"]);
            __PR.keydown(["RETURN"]);
            __PR.expectCursorsToBe(["2:4"]);
            __PR.validateText(`   `, "2:1-2:4");
            await __PR.undo();
        }

        it(`should toggling auto mode recompute the spacing`, async function () {
            await __PR.openFile("tab-2.js");
            __PR.EDITING.setEditorSpacing(false, 3, true);
            validateSpacing("Spaces:", "3", "Auto");
            await verifyIf2SpacesWithEdit();
            // now toggle the auto to fixed and then to auto once to force recompute spacing
            $("#indent-auto").click();
            $("#indent-auto").click();
            validateSpacing("Tab Size:", "4", "Auto");
            await verifyIf2TabsWithEdits();
            await __PR.closeFile();
        });
    });
});
