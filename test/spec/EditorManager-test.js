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

/*global describe, it, spyOn, expect, beforeEach, afterEach */

define(function (require, exports, module) {


    var EditorManager    = require("editor/EditorManager"),
        ViewStateManager = require("view/ViewStateManager"),
        SpecRunnerUtils  = require("spec/SpecRunnerUtils");

    describe("EditorManager", function () {
        var pane, anotherPane, testEditor, testDoc, $fakeContentDiv, $fakeHolder;
        beforeEach(function () {
            // Normally the editor holder would be created inside a "content" div, which is
            // used in the available height calculation. We create a fake content div just to
            // hold the height, and we'll place the editor holder in it.
            $fakeContentDiv = $("<div class='content'/>")
                .css("height", "200px")
                .appendTo(window.document.body);

            $fakeHolder = SpecRunnerUtils.createMockElement()
                                        .css("width", "1000px")
                                        .attr("id", "hidden-editors")
                                        .appendTo($fakeContentDiv);

            pane = SpecRunnerUtils.createMockPane($fakeHolder, 'first-pane');
            anotherPane = SpecRunnerUtils.createMockPane($fakeHolder, 'second-pane');
            testDoc = SpecRunnerUtils.createMockDocument("");
        });
        afterEach(function () {
            $fakeHolder.remove();
            $fakeHolder = null;

            $fakeContentDiv.remove();
            $fakeContentDiv = null;

            SpecRunnerUtils.destroyMockEditor(testDoc);
            testEditor = null;
            testDoc = null;
            pane = null;
            ViewStateManager.reset();
        });

        describe("Create Editors", function () {

            it("should create a new editor for a document and add it to the requested pane", function () {
                spyOn(pane, "addView");
                EditorManager.openDocument(testDoc, pane);
                expect(pane.addView).toHaveBeenCalled();
            });
            it("should use an existing editor for a document when requested on same pane", function () {
                var editor = SpecRunnerUtils.createEditorInstance(testDoc, pane, undefined);
                spyOn(pane, "addView");
                spyOn(pane, "showView");
                EditorManager.openDocument(testDoc, pane);
                expect(pane.addView).not.toHaveBeenCalled();
                expect(pane.showView).toHaveBeenCalledWith(editor);
            });
            it("should create a new editor for a document if requested pane and existing editors pane is not same", function () {
                spyOn(pane, "addView");
                spyOn(pane, "showView");
                spyOn(anotherPane, "addView");
                spyOn(anotherPane, "showView");

                var editor = SpecRunnerUtils.createEditorInstance(testDoc, anotherPane, undefined);
                EditorManager.openDocument(testDoc, anotherPane);

                expect(pane.addView).not.toHaveBeenCalled();
                expect(pane.showView).not.toHaveBeenCalled();
                expect(anotherPane.addView).toHaveBeenCalledWith(editor);
                expect(anotherPane.showView).toHaveBeenCalledWith(editor);

                EditorManager.openDocument(testDoc, pane);

                expect(pane.addView).toHaveBeenCalled();
                expect(pane.showView).toHaveBeenCalled();
                expect(pane.addView).not.toHaveBeenCalledWith(editor);
                expect(pane.showView).not.toHaveBeenCalledWith(editor);
            });
        });
    });
    describe("ViewStateManager", function () {
        var pane, testEditor, testDoc, $fakeContentDiv, $fakeHolder;
        beforeEach(function () {
            // Normally the editor holder would be created inside a "content" div, which is
            // used in the available height calculation. We create a fake content div just to
            // hold the height, and we'll place the editor holder in it.
            $fakeContentDiv = $("<div class='content'/>")
                .css("height", "200px")
                .appendTo(window.document.body);

            $fakeHolder = SpecRunnerUtils.createMockElement()
                                        .css("width", "1000px")
                                        .attr("id", "hidden-editors")
                                        .appendTo($fakeContentDiv);

            pane = SpecRunnerUtils.createMockPane($fakeHolder);
            testDoc = SpecRunnerUtils.createMockDocument("");
        });
        afterEach(function () {
            $fakeHolder.remove();
            $fakeHolder = null;

            $fakeContentDiv.remove();
            $fakeContentDiv = null;

            SpecRunnerUtils.destroyMockEditor(testDoc);
            testEditor = null;
            testDoc = null;
            pane = null;
            ViewStateManager.reset();
        });
        describe("Save/Restore View State", function () {
            it("should remember a file's view state", function () {
                ViewStateManager.addViewStates({ a: "1234" });
                expect(ViewStateManager.getViewState({fullPath: "a"})).toEqual("1234");
                ViewStateManager.addViewStates({ b: "Jeff was here" });
                expect(ViewStateManager.getViewState({fullPath: "B"})).toBeUndefined();
                expect(ViewStateManager.getViewState({fullPath: "b"})).toEqual("Jeff was here");
            });
            it("should extend the view state cache", function () {
                ViewStateManager.addViewStates({ a: "1234" });
                ViewStateManager.addViewStates({ b: "5678" });
                expect(ViewStateManager.getViewState({fullPath: "a"})).toEqual("1234");
                expect(ViewStateManager.getViewState({fullPath: "b"})).toEqual("5678");
            });
            it("should reset the view state cache", function () {
                ViewStateManager.addViewStates({ a: "1234" });
                ViewStateManager.addViewStates({ b: "5678" });
                ViewStateManager.reset();
                expect(ViewStateManager.getViewState({fullPath: "a"})).toBeUndefined();
                expect(ViewStateManager.getViewState({fullPath: "b"})).toBeUndefined();
            });
            it("should update the view state cache", function () {
                var myView = {
                    getFile: function () {
                        return {
                            fullPath: "a"
                        };
                    },
                    getViewState: function () {
                        return "1234";
                    }
                };
                ViewStateManager.updateViewState(myView);
                expect(ViewStateManager.getViewState({fullPath: "a"})).toEqual("1234");
            });
        });
    });
});
