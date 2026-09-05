/**
 * Codefolding unit test files
 * @author Patrick Oladimeji
 * @date 01/08/2015 18:34
 */

/*global describe, beforeAll, beforeEach, afterEach, afterAll, it, expect, awaitsForDone, awaitsFor*/

define(function (require, exports, module) {

    var SpecRunnerUtils = brackets.getModule("spec/SpecRunnerUtils");

    describe("integration:Code Folding", function () {
        var testWindow,
            testEditor,
            EditorManager,
            DocumentManager,
            CommandManager,
            ExtensionLoader,
            PreferencesManager,
            ViewStateManager,
            prefs,
            cm,
            gutterName = "CodeMirror-foldgutter",
            foldMarkerOpen = gutterName + "-open",
            foldMarkerClosed = gutterName + "-folded";
        var testDocumentDirectory = SpecRunnerUtils.getTestPath("/spec/Extension-test-project-files"),
            // The line numbers referenced below are dependent on the files in /unittest-files directory.
            // Remember to update the numbers if the files change.
            testFilesSpec = {
                js: {
                    filePath: "test.js",
                    foldableLines: [1, 11, 17, 21, 25, 27, 30],
                    sameLevelFoldableLines: [17, 21],
                    firstSelection: {start: {line: 2, ch: 0}, end: {line: 10, ch: 0}},
                    secondSelection: {start: {line: 5, ch: 0}, end: {line: 8, ch: 4}}
                },
                html: {
                    filePath: "test.html",
                    foldableLines: [1, 2, 3, 4, 8, 9, 14, 15, 16, 20, 21, 22, 23, 28, 29, 34, 37],
                    sameLevelFoldableLines: [3, 8],
                    firstSelection: {start: {line: 38, ch: 0}, end: {line: 41, ch: 0}},
                    secondSelection: {start: {line: 42, ch: 0}, end: {line: 45, ch: 4}}
                },
                hbs: {
                    filePath: "test.hbs",
                    foldableLines: [1, 7, 14, 16, 17, 21, 26, 28, 29, 32, 33, 38, 41],
                    sameLevelFoldableLines: [1, 7, 14],
                    firstSelection: {start: {line: 2, ch: 0}, end: {line: 10, ch: 0}},
                    secondSelection: {start: {line: 5, ch: 0}, end: {line: 8, ch: 4}}
                }
            },
            open = "open",
            folded = "folded";

        /**
         * Utility to temporarily set preference values in the session scope
         */
        function setPreference(key, value) {
            prefs.set(key, value, {
                locations: {
                    scope: "session"
                }
            });
        }

        /**
         * Open a test file
         * @param {String} path The path to the file to open
         */
        async function openTestFile(path) {
            var promise = SpecRunnerUtils.openProjectFiles([path]);
            promise.then(function () {
                testEditor = EditorManager.getCurrentFullEditor();
                cm = testEditor._codeMirror;
            });
            await awaitsForDone(promise, "Test file opened", 3000);
        }

        /**
         * Sets up the test window and loads the test project
         */
        async function setupWindow() {
            testWindow = await SpecRunnerUtils.createTestWindowAndRun();
            EditorManager = testWindow.brackets.test.EditorManager;
            DocumentManager = testWindow.brackets.test.DocumentManager;
            PreferencesManager = testWindow.brackets.test.PreferencesManager;
            CommandManager = testWindow.brackets.test.CommandManager;
            ExtensionLoader = testWindow.brackets.test.ExtensionLoader;
            ViewStateManager = testWindow.require("view/ViewStateManager");

            prefs = PreferencesManager.getExtensionPrefs("code-folding");
        }

        function getCodeFoldingModule(moduleName) {
            const extensionRequire = ExtensionLoader.getRequireContextForExtension("CodeFolding");
            return extensionRequire(moduleName);
        }

        function resetPreferences() {
            setPreference("enabled", true);
            setPreference("minFoldSize", 2);
            setPreference("saveFoldStates", true);
            setPreference("alwaysUseIndentFold", false);
            setPreference("hideUntilMouseover", false);
            setPreference("maxFoldLevel", 2);
            setPreference("makeSelectionsFoldable", true);
            getCodeFoldingModule("Prefs").clearAllFolds();
            ViewStateManager.reset();
        }

        /**
         * Sets up the test window and loads the test project
         */
        async function setup() {
            //setPreference("saveFoldStates", false);
            await SpecRunnerUtils.loadProjectInTestWindow(testDocumentDirectory);
        }

        /**
         * Closes the test window
         */
        async function tearDown() {
            await SpecRunnerUtils.closeTestWindow();
        }

        /**
         * Runs the specified command
         * @param   {String}  command The command to run
         * @returns {Promise} A promise that resolves after command execution is completed or failed
         */
        function runCommand(command) {
            return CommandManager.execute(command);
        }

        /**
         * Folds the code on the given line number
         * @param {Number} line The line number to fold
         */
        async function foldCodeOnLine(line) {
            cm.setCursor(line - 1);
            var promise = runCommand("codefolding.collapse");
            await awaitsForDone(promise, "Collapse code", 2000);
        }

        /**
         * Expands the code on the given line number
         * @param {Number} line The line number to fold
         */
        async function expandCodeOnLine(line) {
            cm.setCursor(line - 1);
            var promise = runCommand("codefolding.expand");
            await awaitsForDone(promise, "Expand code", 2000);
        }

        /**
         * Returns all the fold marks currently inside the editor
         * @returns {Array<TextMark>} The fold marks currently inside the editor
         */
        function getEditorFoldMarks() {
            testEditor = EditorManager.getCurrentFullEditor();
            cm = testEditor._codeMirror;

            var marks = cm.getAllMarks().filter(function (m) {
                return m.__isFold;
            });
            return marks;
        }

        /**
         * Gets information about the mark in the gutter specifically whether it is folded or open.
         * @param   {Object} lineInfo The CodeMirror lineInfo object
         * @returns {Object} an object with line and type property
         */
        function gutterMarkState(lineInfo) {
            if (!lineInfo || !lineInfo.gutterMarkers) {
                return;
            }
            const marker = lineInfo.gutterMarkers[gutterName];
            if (!marker) {
                return;
            }
            const classes = marker.classList;
            if (classes && classes.contains(foldMarkerClosed)) {
                return {line: lineInfo.line, type: folded};
            } else if (classes && classes.contains(foldMarkerOpen)) {
                return {line: lineInfo.line, type: open};
            }
            return;
        }

        /**
         * Helper function to return the fold markers on the current codeMirror instance
         *
         * @returns {Array<object>} An array of objects containing the line and the type of marker.
         */
        function getGutterFoldMarks(includeAllLines) {
            testEditor = EditorManager.getCurrentFullEditor();
            cm = testEditor._codeMirror;
            if (includeAllLines) {
                getCodeFoldingModule("foldhelpers/foldgutter").updateInViewport(
                    cm,
                    cm.firstLine(),
                    cm.lastLine() + 1
                );
            }
            var marks = [];
            cm.eachLine(function (lineHandle) {
                var lineInfo = cm.lineInfo(lineHandle);
                marks.push(gutterMarkState(lineInfo));
            });

            return marks.filter(function (m) { return m; });
        }

        /**
         * Helper function to filter out all open gutter markers
         * @param   {Object}  m the marker to filter
         * @returns {boolean} true if the marker is open or false otherwise
         */
        function filterOpen(m) {
            return m.type === open;
        }

        /**
         * Helper function to filter out all closed gutter markers.
         * @param   {Object}  m the marker to to filter
         * @returns {boolean} true if the marker is closed or false otherwise
         */
        function filterFolded(m) {
            return m.type === folded;
        }

        /*
         * Helper function to return the line number on a marker
         * @param   {Object} m the maker whose line number we want to retrieve
         * @returns {Number} the line number of the marker
         */
        function getLineNumber(m) {
            return m.line;
        }

        /**
         * Helper function to change the lines to zero-based index
         * @param   {Array<number>} lines the line numbers to change to zero base index
         * @returns {Array<number>} the zero-based index of the lines passed in
         */
        function toZeroIndex(lines) {
            return lines.map(function (l) {
                return l - 1;
            });
        }

        /**
         * Helper function to select a range of text in the editor
         * @param   {CodeMirror.Pos} start the start position of the selection
         * @param   {CodeMirror.Pos} end   the end position of the selection
         */
        async function selectTextInEditor(start, end) {
            cm.setSelection(start, end);
            await awaitsFor(function () {
                return cm.state.foldGutter &&
                    cm.state.foldGutter.changeUpdate !== null;
            }, "fold gutter refresh to be scheduled");
            await awaitsFor(function () {
                return cm.state.foldGutter &&
                    cm.state.foldGutter.changeUpdate === null;
            }, "fold gutter refresh to complete");
        }

        beforeAll(async function () {
            await setupWindow();
            await setup();
        }, 30000);

        afterAll(async function () {
            await testWindow.closeAllFiles();
            await tearDown();
        });

        it("supports standalone CM6 folding without Phoenix editor setup", function () {
            const CodeMirror = testWindow.brackets.getModule("editor/CodeMirrorCompat");
            const holder = testWindow.document.createElement("div");
            testWindow.document.body.appendChild(holder);
            const standalone = new CodeMirror(holder, {
                value: "function answer() {\n    return 42;\n}",
                mode: "javascript",
                foldGutter: true
            });
            const range = {
                from: {line: 0, ch: 19},
                to: {line: 2, ch: 0}
            };

            try {
                expect(standalone._lineFolds).toEqual({});
                expect(function () {
                    standalone.foldCode(0, {range: range});
                }).not.toThrow();
                expect(standalone.isFolded(0)).toEqual(range);
                standalone.unfoldCode(0, {range: range});
                expect(standalone.isFolded(0)).toBeFalsy();
            } finally {
                standalone.destroy();
                holder.remove();
            }
        });

        it("does not reschedule a deferred fold-gutter refresh after destroy", function () {
            const CodeMirror = testWindow.brackets.getModule("editor/CodeMirrorCompat");
            const foldGutter = getCodeFoldingModule("foldhelpers/foldgutter");
            const holder = testWindow.document.createElement("div");
            testWindow.document.body.appendChild(holder);
            const standalone = new CodeMirror(holder, {
                value: "function answer() {\n    return 42;\n}",
                mode: "javascript",
                foldGutter: true
            });
            const state = standalone.state.foldGutter;
            testWindow.clearTimeout(state.viewportRefresh);
            state.viewportRefresh = null;

            const originalSetTimeout = testWindow.setTimeout;
            const scheduledCallbacks = [];
            testWindow.setTimeout = function (callback) {
                scheduledCallbacks.push(callback);
                return scheduledCallbacks.length;
            };
            try {
                foldGutter.updateInViewport(standalone, 0, 0);
                expect(scheduledCallbacks.length).toBe(1);

                standalone.destroy();
                scheduledCallbacks.shift()();

                expect(scheduledCallbacks.length).toBe(0);
                expect(state.viewportRefresh).toBeNull();
            } finally {
                testWindow.setTimeout = originalSetTimeout;
                standalone.destroy();
                holder.remove();
            }
        });

        it("uses global line coordinates when syntax-folding linked subviews", function () {
            const CodeMirror = testWindow.brackets.getModule("editor/CodeMirrorCompat");
            const languageFold = getCodeFoldingModule("foldhelpers/languageFold");
            const rootDocument = new CodeMirror.Doc(
                "prefix\nfunction answer() {\n    return 42;\n}\nsuffix",
                "javascript"
            );
            const subview = rootDocument.linkedDoc({
                from: 1,
                to: 4
            });

            try {
                const range = languageFold.syntaxFold(
                    subview._adapter,
                    {line: 1, ch: 0}
                );

                expect(range).toBeTruthy();
                expect(range.from.line).toBe(1);
                expect(range.to.line).toBe(3);
            } finally {
                subview.unlinkDoc(rootDocument);
                subview._adapter.destroy();
                rootDocument._adapter.destroy();
            }
        });

        it("ignores a stale fold-gutter line after the document shrinks", async function () {
            const CodeMirror = testWindow.brackets.getModule("editor/CodeMirrorCompat");
            await openTestFile("test.js");
            const staleLine = cm.lastLine() + 1;

            expect(function () {
                CodeMirror.fold.brace(cm, CodeMirror.Pos(staleLine, 0));
            }).not.toThrow();
            expect(CodeMirror.fold.brace(
                cm,
                CodeMirror.Pos(staleLine, 0)
            )).toBeNull();
        });

        it("restores folding extensions before enabling a CM6 editor", async function () {
            await openTestFile("test.js");
            cm.setOption("foldGutter", false);
            delete cm.getValidFolds;

            EditorManager.trigger("activeEditorChange", testEditor, testEditor);

            expect(typeof cm.getValidFolds).toBe("function");
            expect(cm.state.foldGutter).toBeTruthy();
        });

        it("updates fold-gutter markers after vertically scrolling the CM6 viewport", async function () {
            const CodeMirror = testWindow.brackets.getModule("editor/CodeMirrorCompat");
            const holder = testWindow.document.createElement("div");
            const targetLine = 210;
            const lines = Array.from({length: 220}, function (_value, line) {
                if (line === targetLine) {
                    return "function farAwayFold() {";
                }
                if (line === targetLine + 3) {
                    return "}";
                }
                return `    const value${line} = ${line};`;
            });
            holder.style.display = "block";
            holder.style.width = "600px";
            holder.style.height = "120px";
            holder.style.position = "fixed";
            holder.style.left = "0";
            holder.style.top = "0";
            testWindow.document.body.appendChild(holder);

            const standalone = new CodeMirror(holder, {
                value: lines.join("\n"),
                mode: "javascript",
                lineNumbers: true,
                gutters: ["CodeMirror-linenumbers", gutterName],
                foldGutter: {
                    rangeFinder: function (_codeMirror, position) {
                        if (position.line !== targetLine) {
                            return;
                        }
                        return {
                            from: CodeMirror.Pos(targetLine, lines[targetLine].length),
                            to: CodeMirror.Pos(targetLine + 3, 0)
                        };
                    }
                }
            });

            try {
                standalone.setSize(600, 120);
                standalone.refresh();

                await awaitsFor(function () {
                    const viewport = standalone.getViewport();
                    const scrollInfo = standalone.getScrollInfo();
                    return scrollInfo.clientHeight > 0 &&
                        scrollInfo.height > scrollInfo.clientHeight &&
                        standalone.defaultTextHeight() > 0 &&
                        viewport.from === 0 &&
                        viewport.to > viewport.from &&
                        viewport.to < targetLine;
                }, "CM6 folding test editor to expose its initial viewport");

                expect(gutterMarkState(standalone.lineInfo(targetLine))).toBeUndefined();

                standalone.scrollTo(
                    0,
                    standalone.getScrollInfo().height
                );
                await awaitsFor(function () {
                    const viewport = standalone.getViewport();
                    return standalone.getScrollInfo().top > 0 &&
                        viewport.from <= targetLine &&
                        viewport.to > targetLine;
                }, "CM6 folding test editor to scroll to the target line");
                await awaitsFor(function () {
                    const markerState = gutterMarkState(
                        standalone.lineInfo(targetLine)
                    );
                    return markerState &&
                        markerState.line === targetLine &&
                        markerState.type === open;
                }, "fold gutter marker to update for the scrolled CM6 viewport");
                await awaitsFor(function () {
                    return Boolean(
                        standalone.getGutterElement()
                            .querySelector("." + foldMarkerOpen)
                    );
                }, "fold gutter marker to render in the scrolled CM6 viewport");
            } finally {
                standalone.destroy();
                holder.remove();
            }
        });

        it("does not accumulate gutter hover handlers when folding is toggled", async function () {
            resetPreferences();
            await openTestFile("test.js");

            const foldGutter = getCodeFoldingModule("foldhelpers/foldgutter");
            const gutterElement = cm.getGutterElement();
            const originalUpdateInViewport = foldGutter.updateInViewport;
            let updateCount = 0;

            async function setFoldingEnabled(enabled) {
                setPreference("enabled", enabled);
                await awaitsFor(function () {
                    return Boolean(cm.state.foldGutter) === enabled;
                }, `code folding to be ${enabled ? "enabled" : "disabled"}`);
            }

            try {
                setPreference("hideUntilMouseover", true);
                await setFoldingEnabled(false);
                await setFoldingEnabled(true);
                await setFoldingEnabled(false);
                await setFoldingEnabled(true);

                expect(cm.getGutterElement()).toBe(gutterElement);
                foldGutter.updateInViewport = function () {
                    updateCount++;
                };
                testWindow.$(gutterElement).trigger("mouseenter");

                expect(updateCount).toBe(1);
            } finally {
                foldGutter.updateInViewport = originalUpdateInViewport;
                setPreference("hideUntilMouseover", false);
                setPreference("enabled", true);
                await testWindow.closeAllFiles();
            }
        });

        Object.keys(testFilesSpec).forEach(function (file) {
            var testFilePath = testFilesSpec[file].filePath;
            var foldableLines = testFilesSpec[file].foldableLines;
            var testFileSpec = testFilesSpec[file];
            describe(file + " - Editor/Gutter", function () {
                beforeEach(async function () {
                    await setupWindow();
                    await setup();
                    resetPreferences();

                    await openTestFile(testFilePath);

                    testEditor = EditorManager.getCurrentFullEditor();
                    cm = testEditor._codeMirror;
                });

                afterEach(async function () {
                    await testWindow.closeAllFiles();
                });

                it("renders fold marks on startup", async function () {
                    var marks = getGutterFoldMarks(true);
                    expect(marks.length).toBeGreaterThan(0);
                    marks.map(getLineNumber).forEach(function (line) {
                        expect(toZeroIndex(foldableLines)).toContain(line);
                    });
                });

                it("creates a folded region in editor when fold marker is clicked", async function () {
                    var lineNumber = foldableLines[0];
                    await foldCodeOnLine(lineNumber);

                    var marks = getEditorFoldMarks();
                    expect(marks.length).toEqual(1);
                    expect(marks[0].lines[0].lineNo()).toEqual(lineNumber - 1);
                });

                it("clears the folded region in editor when collapsed fold marker is clicked", async function () {
                    var lineNumber = foldableLines[0];
                    await foldCodeOnLine(lineNumber);
                    await expandCodeOnLine(lineNumber);

                    var marks = getEditorFoldMarks();
                    expect(marks.length).toEqual(0);
                });

                it("expands and updates the fold gutter when text marker for a folded region in editor is cleared", async function () {
                    var lineNumber = foldableLines[0];
                    await foldCodeOnLine(lineNumber);
                    var marks = getEditorFoldMarks().filter(function (m) {
                        var range = m.find();
                        return range ? range.from.line === lineNumber - 1 : false;
                    });
                    marks[0].clear();

                    var marks = getEditorFoldMarks();
                    var gutterMark = getGutterFoldMarks().filter(function (m) {
                        return m.line === lineNumber - 1 && m.type === open;
                    });
                    expect(marks.length).toEqual(0);
                    expect(gutterMark.length).toEqual(1);
                });

                it("renders folded marker in the gutter for folded code regions", async function () {
                    var lineNumbers = testFilesSpec[file].sameLevelFoldableLines;
                    for(let l of lineNumbers){
                        await foldCodeOnLine(l);
                    }

                    var marks = getGutterFoldMarks().filter(filterFolded);
                    expect(marks.length).toEqual(lineNumbers.length);

                    var gutterNumbers = marks
                        .map(getLineNumber);
                    expect(gutterNumbers).toEqual(toZeroIndex(lineNumbers));
                });

                it("indicates foldable lines in the gutter", async function () {
                    var lineNumbers = foldableLines;
                    var marks = getGutterFoldMarks(true);
                    var gutterNumbers = marks.filter(filterOpen)
                        .map(getLineNumber);
                    expect(gutterNumbers).toEqual(toZeroIndex(lineNumbers));
                });

                describe("Preferences", function () {
                    it("persists fold states", async function () {
                        var lineNumbers = testFileSpec.sameLevelFoldableLines;
                        for(let line of lineNumbers){
                            await foldCodeOnLine(line);
                        }
                        await testWindow.closeAllFiles();

                        await openTestFile(testFilePath);

                        var marks = getEditorFoldMarks();
                        var gutterNumbers = marks.map(function (mark) {
                            return mark.lines[0].lineNo();
                        });
                        expect(gutterNumbers).toEqual(toZeroIndex(lineNumbers));
                    });

                    it("can disable persistence of fold states", async function () {
                        await setPreference("saveFoldStates", false);
                        await foldCodeOnLine(foldableLines[0]);
                        await testWindow.closeAllFiles();

                        await openTestFile(testFilePath);

                        var marks = getEditorFoldMarks();
                        expect(marks.length).toEqual(0);

                        var lineNumbers = foldableLines;
                        var marks = getGutterFoldMarks(true);
                        var gutterNumbers = marks.filter(filterOpen)
                            .map(getLineNumber);
                        expect(gutterNumbers).toEqual(toZeroIndex(lineNumbers));
                    });

                    it("can set the minimum fold size", async function () {
                        await setPreference("minFoldSize", 20000);
                        await testWindow.closeAllFiles();

                        await openTestFile(testFilePath);

                        var marks = getGutterFoldMarks();
                        expect(marks.length).toEqual(0);
                    });

                    it("can disable code folding", async function () {
                        setPreference("enabled", false);
                        var marks = getEditorFoldMarks();
                        expect(marks.length).toEqual(0);
                        expect(cm.getOption("foldGutter")).toBe(false);
                        expect(cm.state.foldGutter).toBeNull();
                        expect(testEditor.getRootElement().classList.contains("folding-enabled")).toBe(false);
                        expect(testWindow.brackets.getModule("editor/Editor").Editor
                            .isGutterRegistered(gutterName)).toBe(false);
                    });

                    describe("Fold selected region", function () {
                        it("can be enabled by setting `makeSelectionsFoldable' to true", async function () {
                            var start = testFileSpec.firstSelection.start, end = testFileSpec.firstSelection.end;
                            setPreference("makeSelectionsFoldable", true);

                            await selectTextInEditor(start, end);

                            var marks = getGutterFoldMarks().filter(filterOpen).map(getLineNumber);
                            expect(marks).toContain(start.line);
                        });

                        it("can be disabled by setting `makeSelectionsFoldable' to false", async function () {
                            await setPreference("makeSelectionsFoldable", false);
                            var start = testFileSpec.firstSelection.start, end = testFileSpec.firstSelection.end;
                            await selectTextInEditor(start, end);

                            var marks = getGutterFoldMarks().filter(filterOpen)
                                .map(getLineNumber).filter(function (d) {
                                    return d === start.line;
                                });
                            expect(marks.length).toEqual(0);
                        });

                        it("shows fold ranges for only the most recent selection", async function () {
                            var firstSelection = testFileSpec.firstSelection,
                                secondSelection = testFileSpec.secondSelection;

                            await selectTextInEditor(firstSelection.start, firstSelection.end);

                            await selectTextInEditor(secondSelection.start, secondSelection.end);

                            var marks = getGutterFoldMarks().filter(filterOpen)
                                .map(getLineNumber);
                            expect(marks).toContain(secondSelection.start.line);
                            expect(marks).not.toContain(firstSelection.start.line);
                        });
                    });

                });

                describe("Editor text changes", function () {
                    var foldableLine = foldableLines[1];

                    // add a line after folding a region preserves the region and the region can be unfolded
                    it("can unfold a folded region after a line has been added above it", async function () {
                        await foldCodeOnLine(foldableLine);
                        try {
                            cm.replaceRange("\r\n", {line: foldableLine - 1, ch: 0});

                            await expandCodeOnLine(foldableLine + 1);
                            await awaitsFor(function () {
                                return getGutterFoldMarks().filter(filterFolded).length === 0;
                            }, "fold gutter markers to update after inserting a line");

                            var marks = getGutterFoldMarks().filter(filterFolded);
                            expect(marks.length).toEqual(0);
                        } finally {
                            if (testEditor.document.isDirty) {
                                cm.undo();
                            }
                        }

                    });

                    it("can unfold a folded region even after a line has been removed above it", async function () {
                        await foldCodeOnLine(foldableLine);
                        try {
                            cm.replaceRange(
                                "",
                                {line: foldableLine - 2, ch: 0},
                                {line: foldableLine - 1, ch: 0}
                            );

                            await expandCodeOnLine(foldableLine - 1);
                            await awaitsFor(function () {
                                return getGutterFoldMarks().filter(filterFolded).length === 0;
                            }, "fold gutter markers to update after removing a line");

                            var marks = getGutterFoldMarks().filter(filterFolded);
                            expect(marks.length).toEqual(0);
                        } finally {
                            if (testEditor.document.isDirty) {
                                cm.undo();
                            }
                        }
                    });
                });
            });
        });
    });
});
