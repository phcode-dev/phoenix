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

/*global describe, it, expect, beforeAll, afterAll, awaitsFor, awaitsForDone */

define(function (require, exports, module) {
    // Recommended to avoid reloading the integration test window Phoenix instance for each test.

    const SpecRunnerUtils     = require("spec/SpecRunnerUtils"),
        KeyEvent         = require("utils/KeyEvent");

    const testPath = SpecRunnerUtils.getTestPath("/spec/encoding-test-files");

    let FileViewController,     // loaded from brackets.test,
        EditorManager,
        DocumentManager,
        PreferencesManager,
        CommandManager,
        FileSystem,
        testWindow,
        brackets;


    describe("integration:File Encoding tests", function () {

        beforeAll(async function () {
            // do not use force option in brackets core integration tests. Tests are assumed to reuse the existing
            // test window instance for fast runs.
            testWindow = await SpecRunnerUtils.createTestWindowAndRun();
            brackets            = testWindow.brackets;
            FileViewController  = brackets.test.FileViewController;
            EditorManager      = brackets.test.EditorManager;
            DocumentManager    = brackets.test.DocumentManager;
            PreferencesManager = brackets.test.PreferencesManager;
            CommandManager     = brackets.test.CommandManager;
            FileSystem         = brackets.test.FileSystem;

            await SpecRunnerUtils.loadProjectInTestWindow(testPath);
        }, 30000);

        afterAll(async function () {
            FileViewController  = null;
            EditorManager      = null;
            DocumentManager    = null;
            PreferencesManager = null;
            CommandManager     = null;
            FileSystem         = null;
            testWindow = null;
            brackets = null;
            // comment out below line if you want to debug the test window post running tests
            await SpecRunnerUtils.closeTestWindow();
        }, 30000);

        function typeInEncodingPopup(text) {
            for(let char of text){
                testWindow.$(".dropdown-status-bar")[0].dispatchEvent(new KeyboardEvent("keydown", {
                    key: char,
                    bubbles: true, // Event bubbles up through the DOM
                    cancelable: true // Event can be canceled
                }));
            }
        }

        const EXPECTED_TEXT_UTF16 = "première is first\n" +
            "première is slightly different\n" +
            "Кириллица is Cyrillic\n" +
            "𐐀 am Deseret\n";

        const EXPECTED_TEXT_KOI8 = "premi?re is first\n" +
            "premie?re is slightly different\n" +
            "Кириллица is Cyrillic\n" +
            "? am Deseret\n";

        async function verifyOpenEncoding(encoding, expectedText, location = 1) {
            await awaitsForDone(
                FileViewController.openAndSelectDocument(
                    testPath + `/${encoding}.txt`,
                    FileViewController.PROJECT_MANAGER
                ));

            // now change encoding to utf16
            testWindow.$("#status-encoding .btn").click();
            typeInEncodingPopup(encoding);
            testWindow.$(`.dropdown-status-bar a.stylesheet-link:contains("${encoding}")`)[location].click();

            await awaitsFor(()=>{
                return EditorManager.getActiveEditor().document.getText() === expectedText;
            }, `${encoding} text`);
        }

        async function verifyAutoDetectedEncoding(fileName, expectedEncoding, expectedText) {
            const path = testPath + `/${fileName}`;

            // Make sure there's no leftover manually-picked encoding preference for this path from
            // a previous test/run - we want a genuinely fresh, undetected-until-now open here.
            const encodingPrefs = PreferencesManager.getViewState("encoding", PreferencesManager.STATE_PROJECT_CONTEXT) || {};
            delete encodingPrefs[path];
            PreferencesManager.setViewState("encoding", encodingPrefs, PreferencesManager.STATE_PROJECT_CONTEXT);

            const openDoc = DocumentManager.getOpenDocumentForPath(path);
            if (openDoc) {
                await awaitsForDone(CommandManager.execute("file.close", {file: openDoc.file, _forceClose: true}));
            }

            // No dropdown/manual encoding selection here - this is the whole point of the test.
            await awaitsForDone(
                FileViewController.openAndSelectDocument(path, FileViewController.PROJECT_MANAGER));

            await awaitsFor(function () {
                return EditorManager.getActiveEditor().document.getText() === expectedText;
            }, `${fileName} auto-detected as ${expectedEncoding}`);

            expect(EditorManager.getActiveEditor().document.file._encoding).toBe(expectedEncoding);
        }

        it("Should auto-detect a utf16 BOM on first open, with no manual encoding selection", async function () {
            // Regression test: BOM detection used to only kick in for markup file extensions
            // (html/htm/xhtml/...), so a plain .txt file with a real UTF-16 BOM stayed
            // force-decoded as UTF-8 (and garbled) until the user manually picked the encoding via
            // the status bar dropdown, same as koi8r.txt below. See EncodingDetector.js.
            await verifyAutoDetectedEncoding("utf16.txt", "utf16le", EXPECTED_TEXT_UTF16);
        });

        it("Should auto-detect a utf32le BOM on first open, with no manual encoding selection", async function () {
            await verifyAutoDetectedEncoding("utf32le.txt", "utf32le", EXPECTED_TEXT_UTF16);
        });

        it("Should auto-detect a utf32be BOM on first open, with no manual encoding selection", async function () {
            await verifyAutoDetectedEncoding("utf32be.txt", "utf32be", EXPECTED_TEXT_UTF16);
        });

        it("Should NOT auto-detect koi8r.txt, since single-byte legacy charsets have no BOM to detect", async function () {
            // Unlike utf16/utf32, koi8r has no byte-order-mark and koi8r.txt is plain text (not
            // markup with a <meta charset> to declare itself), so there's no signal for Phoenix to
            // detect at all here - it stays on the utf8 default until the user manually picks the
            // encoding (see "Should open file in koi8r encoding" below). This documents that
            // boundary rather than asserting a real capability.
            const path = testPath + "/koi8r.txt";
            const encodingPrefs = PreferencesManager.getViewState("encoding", PreferencesManager.STATE_PROJECT_CONTEXT) || {};
            delete encodingPrefs[path];
            PreferencesManager.setViewState("encoding", encodingPrefs, PreferencesManager.STATE_PROJECT_CONTEXT);

            const openDoc = DocumentManager.getOpenDocumentForPath(path);
            if (openDoc) {
                await awaitsForDone(CommandManager.execute("file.close", {file: openDoc.file, _forceClose: true}));
            }

            await awaitsForDone(
                FileViewController.openAndSelectDocument(path, FileViewController.PROJECT_MANAGER));

            expect(EditorManager.getActiveEditor().document.file._encoding).toBe("utf8");
        });

        it("Should open file in utf 16 encoding", async function () {
            await verifyOpenEncoding("utf16", EXPECTED_TEXT_UTF16);
        });

        it("Should open file in koi8r encoding", async function () {
            await verifyOpenEncoding("koi8r", EXPECTED_TEXT_KOI8, 2);
        });

        it("Should open file in utf32le encoding", async function () {
            await verifyOpenEncoding("utf32le", EXPECTED_TEXT_UTF16);
        });

        it("Should open file in utf32be encoding", async function () {
            await verifyOpenEncoding("utf32be", EXPECTED_TEXT_UTF16);
        });

        it("Should auto-detect a self-declared windows-1252 charset in an HTML file on first open", async function () {
            // Regression test: a legacy HTML file that declares charset=windows-1252 via a
            // <meta http-equiv="Content-Type"> tag, and is genuinely saved in that charset, used
            // to always be force-decoded as UTF-8 on open, silently and irreversibly replacing
            // every accented character with U+FFFD. See EncodingDetector.js.
            await awaitsForDone(
                FileViewController.openAndSelectDocument(
                    testPath + "/meta-charset-windows1252.html",
                    FileViewController.PROJECT_MANAGER
                ));

            await awaitsFor(function () {
                const text = EditorManager.getActiveEditor().document.getText();
                return text.indexOf("café supermarché") !== -1;
            }, "windows-1252 html auto-detected", 5000);

            const text = EditorManager.getActiveEditor().document.getText();
            expect(text.indexOf("�")).toBe(-1);
            expect(EditorManager.getActiveEditor().document.file._encoding).toBe("windows1252");
        });

        it("Should still auto-detect correctly even if the file was previously read as raw bytes (eg via Download)", async function () {
            // Regression test: several unrelated features (the project tree's "Download" command,
            // attaching a file as a chat image, etc) read a File instance with
            // {encoding: fs.BYTE_ARRAY_ENCODING} for their own non-text purposes, and - since they
            // don't pass doNotCache - that read leaves the non-text "byte_array" sentinel cached in
            // file._encoding as a side effect of File.read()'s own caching (see File.js), even
            // though the file was never opened as a document. If a file gets touched that way
            // *before* it's ever opened, detection/open logic must not mistake that sentinel for an
            // already-known real encoding - see EncodingDetector.isKnownTextEncoding and its use in
            // DocumentCommandHandlers.
            const path = testPath + "/meta-charset-windows1252.html";

            const encodingPrefs = PreferencesManager.getViewState("encoding", PreferencesManager.STATE_PROJECT_CONTEXT) || {};
            delete encodingPrefs[path];
            PreferencesManager.setViewState("encoding", encodingPrefs, PreferencesManager.STATE_PROJECT_CONTEXT);

            const openDoc = DocumentManager.getOpenDocumentForPath(path);
            if (openDoc) {
                await awaitsForDone(CommandManager.execute("file.close", {file: openDoc.file, _forceClose: true}));
            }

            // simulate the "Download" command's raw-byte read, BEFORE this file is ever opened as
            // a document - this is what poisons file._encoding with the non-text sentinel.
            const file = FileSystem.getFileForPath(path);
            await new Promise(function (resolve, reject) {
                file.read({encoding: testWindow.fs.BYTE_ARRAY_ENCODING}, function (err) {
                    err ? reject(err) : resolve();
                });
            });
            expect(file._encoding).toBe(testWindow.fs.BYTE_ARRAY_ENCODING);

            await awaitsForDone(
                FileViewController.openAndSelectDocument(path, FileViewController.PROJECT_MANAGER));

            await awaitsFor(function () {
                const text = EditorManager.getActiveEditor().document.getText();
                return text.indexOf("café supermarché") !== -1;
            }, "windows-1252 html auto-detected despite prior raw-byte read", 5000);

            const text = EditorManager.getActiveEditor().document.getText();
            expect(text.indexOf("�")).toBe(-1);
            expect(EditorManager.getActiveEditor().document.file._encoding).toBe("windows1252");
        });
    });
});
