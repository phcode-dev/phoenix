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

/*global describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, awaitsFor*/

define(function (require, exports, module) {


    var MultiRangeInlineEditor  = require("editor/MultiRangeInlineEditor").MultiRangeInlineEditor,
        InlineTextEditor        = require("editor/InlineTextEditor").InlineTextEditor,
        InlineWidget            = require("editor/InlineWidget").InlineWidget,
        ProjectManager      = require("project/ProjectManager"),
        PreferencesManager = require("preferences/PreferencesManager"),
        SpecRunnerUtils         = require("spec/SpecRunnerUtils");

    // TODO: overlaps a lot with CSSInlineEdit-test integration suite
    describe("MultiRangeInlineEditor", function () {

        var inlineEditor,
            hostEditor,
            doc;

        describe("unit", function () {
            let savedGetProjectRoot;

            beforeAll(function () {
                savedGetProjectRoot = ProjectManager.getProjectRoot;
                ProjectManager.getProjectRoot = function () {
                    return {
                        fullPath: '/mock/project/root'
                    };
                };
            });

            afterAll(function () {
                ProjectManager.getProjectRoot = savedGetProjectRoot;
            });

            beforeEach(function () {
                // create dummy Document and Editor
                var mocks = SpecRunnerUtils.createMockEditor("hostEditor", "");
                doc = mocks.doc;
                hostEditor = mocks.editor;
                PreferencesManager.setViewState("inlineEditor.collapsedFiles", {}, PreferencesManager.STATE_PROJECT_CONTEXT);
            });

            afterEach(function () {
                SpecRunnerUtils.destroyMockEditor(doc);
                doc = null;
                inlineEditor = null;
                hostEditor = null;
            });

            function getRuleListItems() {
                return $(inlineEditor.htmlContent).find("li:not(.section-header)");
            }

            function getRuleListSections() {
                return $(inlineEditor.htmlContent).find("li.section-header");
            }

            function expectListItem($ruleListItem, ruleLabel, filename, lineNum) {  // TODO: duplicated with CSSInlineEdit-test
                expect($ruleListItem.text()).toBe(ruleLabel + " :" + lineNum);
                expect($ruleListItem.data("filename")).toBe(filename);
            }


            it("should initialize to a default state", function () {
                inlineEditor = new MultiRangeInlineEditor([]);

                expect(inlineEditor instanceof InlineTextEditor).toBe(true);
                expect(inlineEditor instanceof InlineWidget).toBe(true);
                expect(inlineEditor.editor).toBeNull();
                expect(inlineEditor.htmlContent instanceof HTMLElement).toBe(true);
                expect(inlineEditor.height).toBe(0);
                expect(inlineEditor.id).toBeNull();
                expect(inlineEditor.hostEditor).toBeNull();
            });

            it("should load a single rule and initialize htmlContent and editor", function () {
                var inlineDoc = SpecRunnerUtils.createMockDocument("inlineDoc\nstartLine\nendLine\n");
                var mockRange = {
                    document: inlineDoc,
                    lineStart: 1,
                    lineEnd: 2
                };

                inlineEditor = new MultiRangeInlineEditor([mockRange]);
                inlineEditor.load(hostEditor);

                expect(inlineEditor.editor).toBeTruthy();
                expect(inlineEditor.editor.document).toBe(inlineDoc);

                // Messages div should be hidden, editor holder should have a child editor.
                expect(inlineEditor.$htmlContent.find(".inline-editor-message").length).toBe(0);
                expect(inlineEditor.$htmlContent.find(".inline-editor-holder").children().length).toBe(1);

                // Rule list should be hidden with only one rule.
                expect(inlineEditor.$htmlContent.find(".related-container").length).toBe(0);
            });

            it("should contain a rule list widget displaying info for each rule", function () {
                var inlineDoc = SpecRunnerUtils.createMockDocument("div{}\n.foo{}\n"),
                    inlineDocName = inlineDoc.file.name;

                var mockRanges = [
                    {
                        document: inlineDoc,
                        name: "div",
                        lineStart: 0,
                        lineEnd: 0
                    },
                    {
                        document: inlineDoc,
                        name: ".foo",
                        lineStart: 1,
                        lineEnd: 1
                    }
                ];

                inlineEditor = new MultiRangeInlineEditor(mockRanges);
                inlineEditor.load(hostEditor);

                var $ruleListItems = getRuleListItems();
                expectListItem($ruleListItems.eq(0), "div", inlineDocName, 1);
                expectListItem($ruleListItems.eq(1), ".foo", inlineDocName, 2);

                // Messages div should be hidden, editor holder should have a child editor.
                expect(inlineEditor.$htmlContent.find(".inline-editor-message").length).toBe(0);
                expect(inlineEditor.$htmlContent.find(".inline-editor-holder").children().length).toBe(1);

                // Rule list should be visible.
                expect(inlineEditor.$htmlContent.find(".related-container").length).toBe(1);
            });

            it("should change selection to the next rule", function () {
                var inlineDoc = SpecRunnerUtils.createMockDocument("div{}\n.foo{}\n");

                var mockRanges = [
                    {
                        document: inlineDoc,
                        name: "div",
                        lineStart: 0,
                        lineEnd: 0
                    },
                    {
                        document: inlineDoc,
                        name: ".foo",
                        lineStart: 1,
                        lineEnd: 1
                    }
                ];

                inlineEditor = new MultiRangeInlineEditor(mockRanges);
                inlineEditor.load(hostEditor);
                inlineEditor._selectNextRange();

                var $selection = $(inlineEditor.htmlContent).find(".selection");
                var $ruleListItems = getRuleListItems();
                expect($selection.position().top).toBe($($ruleListItems.get(0)).position().top);
            });

            it("should change selection to the previous rule", function () {
                var inlineDoc = SpecRunnerUtils.createMockDocument("div{}\n.foo{}\n");

                var mockRanges = [
                    {
                        document: inlineDoc,
                        name: "div",
                        lineStart: 0,
                        lineEnd: 0
                    },
                    {
                        document: inlineDoc,
                        name: ".foo",
                        lineStart: 1,
                        lineEnd: 1
                    }
                ];

                inlineEditor = new MultiRangeInlineEditor(mockRanges);
                inlineEditor.load(hostEditor);

                // select .foo
                inlineEditor.setSelectedIndex(1);

                // verify selection moves
                var $selection = $(inlineEditor.htmlContent).find(".selection");
                var $ruleListItems = getRuleListItems();
                expect($selection.position().top).toBe($($ruleListItems.get(1)).position().top);

                // select div
                inlineEditor._selectPreviousRange();

                // verify selection moves again
                expect($selection.position().top).toBe($($ruleListItems.get(0)).position().top);
            });


            function setupNextPrevTest(initialSelectedIndex, collapseA, collapseB, collapseC) {
                var docA = SpecRunnerUtils.createMockDocument(".aaa{}\n",           "css", "/a.css"),
                    docB = SpecRunnerUtils.createMockDocument(".bbb1{}\n.bbb2{}\n", "css", "/b.css"),
                    docC = SpecRunnerUtils.createMockDocument(".ccc{}\n",           "css", "/c.css"),
                    mockRanges = [
                        {
                            document: docA,
                            name: ".aaa",
                            lineStart: 0,
                            lineEnd: 0
                        },
                        {
                            document: docB,
                            name: ".bbb1",
                            lineStart: 0,
                            lineEnd: 0
                        },
                        {
                            document: docB,
                            name: ".bbb2",
                            lineStart: 1,
                            lineEnd: 1
                        },
                        {
                            document: docC,
                            name: ".ccc",
                            lineStart: 0,
                            lineEnd: 0
                        }
                    ];

                inlineEditor = new MultiRangeInlineEditor(mockRanges);
                inlineEditor.load(hostEditor);

                inlineEditor.setSelectedIndex(initialSelectedIndex);

                var $ruleListSections = getRuleListSections();
                if (collapseA) { $ruleListSections.eq(0).click(); }
                if (collapseB) { $ruleListSections.eq(1).click(); }
                if (collapseC) { $ruleListSections.eq(2).click(); }

                // Selected index the testcase wanted shouldn't be affected by collapsing
                expect(inlineEditor._selectedRangeIndex).toBe(initialSelectedIndex);
            }

            it("should change selection to the next/prev rule, skipping collapsed sections", function () {
                setupNextPrevTest(0, false, true, false);

                inlineEditor._selectNextRange();
                expect(inlineEditor._selectedRangeIndex).toBe(3);

                inlineEditor._selectPreviousRange();
                expect(inlineEditor._selectedRangeIndex).toBe(0);
            });

            it("shouldn't change selection if already last", function () {
                setupNextPrevTest(3, false, false, false);

                inlineEditor._selectNextRange();
                expect(inlineEditor._selectedRangeIndex).toBe(3);
            });
            it("shouldn't change selection if already first", function () {
                setupNextPrevTest(0, false, false, false);

                inlineEditor._selectPreviousRange();
                expect(inlineEditor._selectedRangeIndex).toBe(0);
            });

            it("shouldn't change selection if everything next is collapsed", function () {
                setupNextPrevTest(2, true, false, true);

                inlineEditor._selectNextRange();
                expect(inlineEditor._selectedRangeIndex).toBe(2);
                expect(getRuleListSections().eq(2).find(".disclosure-triangle:not(.expanded)").length).toBe(1);
            });
            it("shouldn't change selection if everything prev is collapsed", function () {
                setupNextPrevTest(1, true, false, true);

                inlineEditor._selectPreviousRange();
                expect(inlineEditor._selectedRangeIndex).toBe(1);
                expect(getRuleListSections().eq(0).find(".disclosure-triangle:not(.expanded)").length).toBe(1);
            });

            it("should expand collapsed section when moving to next selection within it", function () {
                setupNextPrevTest(1, false, true, false);

                inlineEditor._selectNextRange();
                expect(inlineEditor._selectedRangeIndex).toBe(2);
                expect(getRuleListSections().eq(1).find(".disclosure-triangle.expanded").length).toBe(1);
            });
            it("should expand collapsed section when moving to prev selection within it", function () {
                setupNextPrevTest(2, false, true, false);

                inlineEditor._selectPreviousRange();
                expect(inlineEditor._selectedRangeIndex).toBe(1);
                expect(getRuleListSections().eq(1).find(".disclosure-triangle.expanded").length).toBe(1);
            });


            function expectResultItemToEqual(resultItem, mockRange) {
                expect(resultItem.name).toBe(mockRange.name);
                expect(resultItem.textRange.startLine).toBe(mockRange.lineStart);
                expect(resultItem.textRange.endLine).toBe(mockRange.lineEnd);
            }

            it("should retrieve all rules", function () {
                var inlineDoc = SpecRunnerUtils.createMockDocument("div{}\n.foo{}\n");
                var mockRanges = [
                    {
                        document: inlineDoc,
                        name: "div",
                        lineStart: 0,
                        lineEnd: 0
                    },
                    {
                        document: inlineDoc,
                        name: ".foo",
                        lineStart: 1,
                        lineEnd: 1
                    }
                ];

                inlineEditor = new MultiRangeInlineEditor(mockRanges);

                expect(inlineEditor._getRanges().length).toEqual(mockRanges.length);
                expectResultItemToEqual(inlineEditor._getRanges()[0], mockRanges[0]);
                expectResultItemToEqual(inlineEditor._getRanges()[1], mockRanges[1]);
            });

            it("should retreive the selected rule", function () {
                var inlineDoc = SpecRunnerUtils.createMockDocument("div{}\n.foo{}\n");

                var mockRanges = [
                    {
                        document: inlineDoc,
                        name: "div",
                        lineStart: 0,
                        lineEnd: 0
                    },
                    {
                        document: inlineDoc,
                        name: ".foo",
                        lineStart: 1,
                        lineEnd: 1
                    }
                ];

                inlineEditor = new MultiRangeInlineEditor(mockRanges);
                inlineEditor.load(hostEditor);

                // "div" rule should be selected by default
                expectResultItemToEqual(inlineEditor._getSelectedRange(), mockRanges[0]);

                // select ".foo" rule - should be next
                inlineEditor._selectNextRange();
                expectResultItemToEqual(inlineEditor._getSelectedRange(), mockRanges[1]);
            });

            it("should show multiple documents in sorted order", function () {
                var docZ = SpecRunnerUtils.createMockDocument("div{}\n.foo{}\n", "css", "/zzz.css"),
                    docA = SpecRunnerUtils.createMockDocument("#bar{}\n",        "css", "/aaa.css"),
                    mockRanges = [
                        {
                            document: docZ,
                            name: "div",
                            lineStart: 0,
                            lineEnd: 0
                        },
                        {
                            document: docA,
                            name: "#bar",
                            lineStart: 0,
                            lineEnd: 0
                        }
                    ];

                inlineEditor = new MultiRangeInlineEditor(mockRanges);
                inlineEditor.load(hostEditor);

                var displayedRanges = inlineEditor._getRanges();
                expect(displayedRanges.length).toBe(2);
                expectResultItemToEqual(displayedRanges[0], mockRanges[1]);
                expectResultItemToEqual(displayedRanges[1], mockRanges[0]);

                var $ruleListItems = getRuleListItems();
                expect($ruleListItems.length).toBe(2);
                expectListItem($ruleListItems.eq(0), "#bar", "aaa.css", 1);
                expectListItem($ruleListItems.eq(1), "div", "zzz.css", 1);

                var $ruleListSections = getRuleListSections();
                expect($ruleListSections.length).toBe(2);
                expect($ruleListSections.eq(0).text()).toBe("aaa.css (1)");
                expect($ruleListSections.eq(1).text()).toBe("zzz.css (1)");

                expect(inlineEditor._getSelectedRange()).toBe(displayedRanges[0]);
                expect(inlineEditor.editor.document).toBe(docA);
            });

            it("should add a new range after other ranges from the same doc, then select it", function () {
                var doc1 = SpecRunnerUtils.createMockDocument("div{}\n.foo{}\n", "css", "/a.css"),
                    doc2 = SpecRunnerUtils.createMockDocument("#bar{}\n",        "css", "/b.css"),
                    mockRanges = [
                        {
                            document: doc1,
                            name: "div",
                            lineStart: 0,
                            lineEnd: 0
                        },
                        {
                            document: doc2,
                            name: "#bar",
                            lineStart: 0,
                            lineEnd: 0
                        }
                    ];

                inlineEditor = new MultiRangeInlineEditor(mockRanges);
                inlineEditor.load(hostEditor);

                expect(getRuleListSections().eq(0).text()).toBe("a.css (1)");

                inlineEditor.addAndSelectRange(".foo", doc1, 1, 1);

                expect(getRuleListSections().eq(0).text()).toBe("a.css (2)");  // verify section header updated

                var newRanges = inlineEditor._getRanges();
                expect(newRanges.length).toBe(3);
                expect(inlineEditor._getSelectedRange()).toBe(newRanges[1]);
                expectResultItemToEqual(newRanges[0], mockRanges[0]);
                expectResultItemToEqual(newRanges[1], {
                    document: doc1,
                    name: ".foo",
                    lineStart: 1,
                    lineEnd: 1
                });
                expectResultItemToEqual(newRanges[2], mockRanges[1]);

                expect(inlineEditor.editor.document).toBe(doc1);
                expect(inlineEditor.editor.getFirstVisibleLine()).toBe(1);
                expect(inlineEditor.editor.getLastVisibleLine()).toBe(1);
            });

            it("should add a new range at proper sorted pos if there are no other ranges from the same doc", function () {
                var doc1 = SpecRunnerUtils.createMockDocument("div{}\n.foo{}\n", "css", "/a.css"),
                    doc2 = SpecRunnerUtils.createMockDocument("#bar{}\n",        "css", "/b.css"),
                    mockRanges = [
                        {
                            document: doc1,
                            name: "div",
                            lineStart: 0,
                            lineEnd: 0
                        },
                        {
                            document: doc1,
                            name: ".foo",
                            lineStart: 1,
                            lineEnd: 1
                        }
                    ];

                inlineEditor = new MultiRangeInlineEditor(mockRanges);
                inlineEditor.load(hostEditor);

                expect(getRuleListSections().length).toBe(1);

                inlineEditor.addAndSelectRange("#bar", doc2, 0, 0);

                expect(getRuleListSections().length).toBe(2);  // verify section header created

                var newRanges = inlineEditor._getRanges();
                expect(newRanges.length).toBe(3);
                expect(inlineEditor._getSelectedRange()).toBe(newRanges[2]);
                expectResultItemToEqual(newRanges[0], mockRanges[0]);
                expectResultItemToEqual(newRanges[1], mockRanges[1]);
                expectResultItemToEqual(newRanges[2], {
                    document: doc2,
                    name: "#bar",
                    lineStart: 0,
                    lineEnd: 0
                });

                expect(inlineEditor.editor.document).toBe(doc2);
                expect(inlineEditor.editor.getFirstVisibleLine()).toBe(0);
                expect(inlineEditor.editor.getLastVisibleLine()).toBe(0);
            });

            it("should properly refresh the editor if the range is inserted at the currently selected index", function () {
                var doc1 = SpecRunnerUtils.createMockDocument("div{}\n.foo{}\n", "css", "/a.css"),
                    doc2 = SpecRunnerUtils.createMockDocument("#bar{}\n",        "css", "/b.css"),
                    mockRanges = [
                        {
                            document: doc1,
                            name: "div",
                            lineStart: 0,
                            lineEnd: 0
                        },
                        {
                            document: doc2,
                            name: "#bar",
                            lineStart: 0,
                            lineEnd: 0
                        }
                    ];

                inlineEditor = new MultiRangeInlineEditor(mockRanges);
                inlineEditor.load(hostEditor);

                inlineEditor.setSelectedIndex(1);
                inlineEditor.addAndSelectRange(".foo", doc1, 1, 1);

                var newRanges = inlineEditor._getRanges();
                expect(newRanges.length).toBe(3);
                expect(inlineEditor._getSelectedRange()).toBe(newRanges[1]);
                expectResultItemToEqual(newRanges[0], mockRanges[0]);
                expectResultItemToEqual(newRanges[1], {
                    document: doc1,
                    name: ".foo",
                    lineStart: 1,
                    lineEnd: 1
                });
                expectResultItemToEqual(newRanges[2], mockRanges[1]);

                expect(inlineEditor.editor.document).toBe(doc1);
                expect(inlineEditor.editor.getFirstVisibleLine()).toBe(1);
                expect(inlineEditor.editor.getLastVisibleLine()).toBe(1);
            });

            it("should show the rule list if a range is added when only one range existed before", function () {
                var doc = SpecRunnerUtils.createMockDocument("div{}\n.foo{}\n"),
                    mockRanges = [
                        {
                            document: doc,
                            name: "div",
                            lineStart: 0,
                            lineEnd: 0
                        }
                    ];

                inlineEditor = new MultiRangeInlineEditor(mockRanges);
                inlineEditor.load(hostEditor);
                expect(inlineEditor.$htmlContent.find(".related-container").length).toBe(0);

                inlineEditor.addAndSelectRange(".foo", doc, 1, 1);
                expect(inlineEditor.$htmlContent.find(".related-container").length).toBe(1);
            });

            it("should keep collapsed sections collapsed when adding range to other section", function () {
                var doc1 = SpecRunnerUtils.createMockDocument("div{}\n.foo{}\n", "css", "/a.css"),
                    doc2 = SpecRunnerUtils.createMockDocument("#bar{}\n",        "css", "/b.css"),
                    mockRanges = [
                        {
                            document: doc1,
                            name: "div",
                            lineStart: 0,
                            lineEnd: 0
                        },
                        {
                            document: doc2,
                            name: "#bar",
                            lineStart: 0,
                            lineEnd: 0
                        }
                    ];

                inlineEditor = new MultiRangeInlineEditor(mockRanges);
                inlineEditor.load(hostEditor);

                var $ruleListSections = getRuleListSections();
                $ruleListSections.eq(1).click(); // collapse doc2 section
                expect($ruleListSections.eq(0).find(".disclosure-triangle.expanded").length).toBe(1);  // verify doc1 section still expanded
                expect($ruleListSections.eq(1).find(".disclosure-triangle:not(.expanded)").length).toBe(1); // verify doc2 section now collapsed

                inlineEditor.addAndSelectRange(".foo", doc1, 1, 1); // add new item to doc1 section

                var newRanges = inlineEditor._getRanges();
                expect(newRanges.length).toBe(3);
                expect(inlineEditor._getSelectedRange()).toBe(newRanges[1]);  // new range should be 2nd in list & be selected
                expect(inlineEditor.editor.document).toBe(doc1);

                $ruleListSections = getRuleListSections();
                expect($ruleListSections.length).toBe(2);  // still just 2 sections
                expect($ruleListSections.eq(0).find(".disclosure-triangle.expanded").length).toBe(1);  // doc1 section still expanded
                expect($ruleListSections.eq(1).find(".disclosure-triangle:not(.expanded)").length).toBe(1); // doc2 section still collapsed
            });

            it("should auto-expand collapsed section when adding new range to it", function () {
                var doc1 = SpecRunnerUtils.createMockDocument("div{}\n", "css", "/a.css"),
                    doc2 = SpecRunnerUtils.createMockDocument("#bar{}\n.foo{}\n",        "css", "/b.css"),
                    mockRanges = [
                        {
                            document: doc1,
                            name: "div",
                            lineStart: 0,
                            lineEnd: 0
                        },
                        {
                            document: doc2,
                            name: "#bar",
                            lineStart: 0,
                            lineEnd: 0
                        }
                    ];

                inlineEditor = new MultiRangeInlineEditor(mockRanges);
                inlineEditor.load(hostEditor);

                var $ruleListSections = getRuleListSections();
                $ruleListSections.eq(1).click(); // collapse doc2 section
                expect($ruleListSections.eq(0).find(".disclosure-triangle.expanded").length).toBe(1);  // verify doc1 section still expanded
                expect($ruleListSections.eq(1).find(".disclosure-triangle:not(.expanded)").length).toBe(1); // verify doc2 section now collapsed

                inlineEditor.addAndSelectRange(".foo", doc2, 1, 1); // add new item to doc2 section

                var newRanges = inlineEditor._getRanges();
                expect(newRanges.length).toBe(3);
                expect(inlineEditor._getSelectedRange()).toBe(newRanges[2]);  // new range should be 3rd in list & be selected
                expect(inlineEditor.editor.document).toBe(doc2);

                $ruleListSections = getRuleListSections();
                expect($ruleListSections.length).toBe(2);  // still just 2 sections
                expect($ruleListSections.eq(0).find(".disclosure-triangle.expanded").length).toBe(1);  // doc1 section still expanded
                expect($ruleListSections.eq(1).find(".disclosure-triangle.expanded").length).toBe(1);  // doc2 section now collapsed also
            });

            it("should be empty if no ranges are specified", function () {
                inlineEditor = new MultiRangeInlineEditor([]);
                inlineEditor.load(hostEditor);

                // There are no ranges to select.
                expect(inlineEditor._selectedRangeIndex).toBe(-1);
                expect(inlineEditor.editor).toBeNull();

                // Messages div should be visible, editors div should have no child editor.
                expect(inlineEditor.$htmlContent.find(".inline-editor-message").length).toBe(1);
                expect(inlineEditor.$htmlContent.find(".inline-editor-holder").children().length).toBe(0);

                // Rule list should be invisible.
                expect(inlineEditor.$htmlContent.find(".related-container").length).toBe(0);
            });

            // TODO: test removing a range (only occurs with TextRange "lostSync")
            // TODO: test hiding rule list when removing 2nd to last range
            // TODO: test auto-closing when removing last range
        });
    });
});
