/*
 * GNU AGPL-3.0 License
 *
 * Modified Work Copyright (c) 2021 - present core.ai . All rights reserved.
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

/*global describe, it, spyOn, expect, beforeEach, afterEach */

define(function (require, exports, module) {


    var WorkspaceManager = require("view/WorkspaceManager"),
        MainViewManager  = require("view/MainViewManager"),
        SpecRunnerUtils  = require("spec/SpecRunnerUtils");

    describe("Editor Redrawing", function () {
        var testEditor, testDoc, $root;
        beforeEach(function () {
            testDoc = SpecRunnerUtils.createMockDocument("");
            MainViewManager._edit(MainViewManager.ACTIVE_PANE, testDoc);
            testEditor = testDoc._masterEditor;
            $root = $(testEditor.getRootElement());
            WorkspaceManager._setMockDOM($("#mock-main-view"),  $root.parent(), $("#mock-main-toolbar-view"));
        });

        afterEach(function () {
            MainViewManager._closeAll(MainViewManager.ALL_PANES);
            SpecRunnerUtils.destroyMockEditor(testDoc);
            testEditor = null;
            testDoc = null;
            $root = null;
            WorkspaceManager._setMockDOM(undefined, undefined, undefined);
        });

        // force cases
        describe("Editor Redraw Perforamnce", function () {
            it("should refresh if force is specified even if no width or height change", function () {
                $root.height(200); // same as content div, so shouldn't be detected as a change
                $root.width(200);
                spyOn(testEditor, "refreshAll");
                WorkspaceManager.recomputeLayout(true);
                expect(testEditor.refreshAll).toHaveBeenCalled();
            });
            it("should refresh if force is specified when width changed but height hasn't", function () {
                $root.height(200); // same as content div, so shouldn't be detected as a change
                $root.width(200);
                WorkspaceManager.recomputeLayout();
                $root.width(300); // change the width
                spyOn(testEditor, "refreshAll");
                WorkspaceManager.recomputeLayout(true);
                expect(testEditor.refreshAll).toHaveBeenCalled();
            });
            it("should refresh if force is specified when height changed but width hasn't", function () {
                $root.height(200); // same as content div, so shouldn't be detected as a change
                $root.width(200);
                WorkspaceManager.recomputeLayout();
                $root.height(300); // change the height (to be different from content div)

                spyOn(testEditor, "refreshAll");
                WorkspaceManager.recomputeLayout(true);
                expect(testEditor.refreshAll).toHaveBeenCalled();
            });
            it("should refresh if force is specified when both height and width changed", function () {
                $root.height(200); // same as content div, so shouldn't be detected as a change
                $root.width(200);
                WorkspaceManager.recomputeLayout();
                $root.height(300); // change the height (to be different from content div)
                $root.width(300); // change the width

                spyOn(testEditor, "refreshAll");
                WorkspaceManager.recomputeLayout(true);
                expect(testEditor.refreshAll).toHaveBeenCalled();
            });
            // skip cases
            it("should NOT refresh if skip is specified if no width or height change", function () {
                $root.height(200); // same as content div, so shouldn't be detected as a change
                $root.width(200);
                WorkspaceManager.recomputeLayout();
                spyOn(testEditor, "refreshAll");
                WorkspaceManager.recomputeLayout(false);
                expect(testEditor.refreshAll).not.toHaveBeenCalled();
            });
            it("should NOT refresh if skip is specified when width changed but height hasn't", function () {
                $root.height(200); // same as content div, so shouldn't be detected as a change
                $root.width(200);
                WorkspaceManager.recomputeLayout();
                $root.width(300); // change the width

                spyOn(testEditor, "refreshAll");
                WorkspaceManager.recomputeLayout(false);
                expect(testEditor.refreshAll).not.toHaveBeenCalled();
            });
            it("should NOT refresh if skip is specified when height changed but width hasn't", function () {
                $root.height(200); // same as content div, so shouldn't be detected as a change
                $root.width(200);
                WorkspaceManager.recomputeLayout();
                $root.height(300); // change the height (to be different from content div)

                spyOn(testEditor, "refreshAll");
                WorkspaceManager.recomputeLayout(false);
                expect(testEditor.refreshAll).not.toHaveBeenCalled();
            });

            it("should NOT refresh if skip is specified when both height and width changed", function () {
                $root.height(200); // same as content div, so shouldn't be detected as a change
                $root.width(200);
                WorkspaceManager.recomputeLayout();
                $root.height(300); // change the height (to be different from content div)
                $root.width(300); // change the width

                spyOn(testEditor, "refreshAll");
                WorkspaceManager.recomputeLayout(false);
                expect(testEditor.refreshAll).not.toHaveBeenCalled();
            });

            // unspecified cases
            it("should NOT refresh if unspecified if no width or height change", function () {
                $root.height(200); // same as content div, so shouldn't be detected as a change
                $root.width(200);
                WorkspaceManager.recomputeLayout();

                spyOn(testEditor, "refreshAll");
                WorkspaceManager.recomputeLayout();
                expect(testEditor.refreshAll).not.toHaveBeenCalled();
            });

            it("should refresh if unspecified when width changed but height hasn't", function () {
                $root.height(200); // same as content div, so shouldn't be detected as a change
                $root.width(200);
                WorkspaceManager.recomputeLayout();
                $root.width(300); // change the width

                spyOn(testEditor, "refreshAll");
                WorkspaceManager.recomputeLayout();
                expect(testEditor.refreshAll).toHaveBeenCalled();
            });

            it("should refresh if unspecified when height changed but width hasn't", function () {
                $root.height(200); // same as content div, so shouldn't be detected as a change
                $root.width(200);
                WorkspaceManager.recomputeLayout();
                $root.height(300); // change the height (to be different from content div)

                spyOn(testEditor, "refreshAll");
                WorkspaceManager.recomputeLayout();
                expect(testEditor.refreshAll).toHaveBeenCalled();
            });

            it("should refresh if unspecified when both height and width changed", function () {
                $root.height(200); // same as content div, so shouldn't be detected as a change
                $root.width(200);
                WorkspaceManager.recomputeLayout();
                $root.height(300); // change the height (to be different from content div)
                $root.width(300); // change the width

                spyOn(testEditor, "refreshAll");
                WorkspaceManager.recomputeLayout();
                expect(testEditor.refreshAll).toHaveBeenCalled();
            });
        });
    });
});
