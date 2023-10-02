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

/*global describe, jasmine, beforeEach, afterEach, it, awaitsFor, expect, awaitsForDone, spyOn */
/*unittests: LanguageManager */

define(function (require, exports, module) {


    // Load dependent modules
    var LanguageManager     = require("language/LanguageManager"),
        SpecRunnerUtils     = require("spec/SpecRunnerUtils");

    describe("LegacyInteg:LanguageManager", function () {

        beforeEach(async function () {
            await awaitsForDone(LanguageManager.ready, "LanguageManager ready", 10000);

            spyOn(console, "error");
        });

        afterEach(function () {
            LanguageManager._resetPathLanguageOverrides();
        });

        describe("Document language updating", function () {

            it("should update the document's language when a file is renamed", async function () {
                var tempDir     = SpecRunnerUtils.getTempDirectory(),
                    oldFilename = tempDir + "/foo.js",
                    newFilename = tempDir + "/dummy.html",
                    spy         = jasmine.createSpy("languageChanged event handler"),
                    dmspy       = jasmine.createSpy("currentDocumentLanguageChanged event handler"),
                    javascript,
                    html,
                    oldFile,
                    doc;

                var DocumentManager,
                    FileSystem,
                    LanguageManager,
                    MainViewManager;

                await SpecRunnerUtils.createTempDirectory();

                let w = await SpecRunnerUtils.createTestWindowAndRun({forceReload: true});
                // Load module instances from brackets.test
                FileSystem = w.brackets.test.FileSystem;
                LanguageManager = w.brackets.test.LanguageManager;
                DocumentManager = w.brackets.test.DocumentManager;
                MainViewManager = w.brackets.test.MainViewManager;

                var writeDeferred = $.Deferred();
                oldFile = FileSystem.getFileForPath(oldFilename);
                oldFile.write("", function (err) {
                    if (err) {
                        writeDeferred.reject(err);
                    } else {
                        writeDeferred.resolve();
                    }
                });
                await awaitsForDone(writeDeferred.promise(), "old file creation");

                await SpecRunnerUtils.loadProjectInTestWindow(tempDir);

                await awaitsForDone(DocumentManager.getDocumentForPath(oldFilename).done(function (_doc) {
                    doc = _doc;
                }), "get document");

                var renameDeferred = $.Deferred();
                MainViewManager._edit(MainViewManager.ACTIVE_PANE, doc);
                javascript = LanguageManager.getLanguage("javascript");

                // sanity check language
                expect(doc.getLanguage()).toBe(javascript);

                // Documents are only 'active' while referenced; they won't be maintained by DocumentManager
                // for global updates like rename otherwise.
                doc.addRef();

                // listen for event
                doc.on("languageChanged", spy);
                DocumentManager.on("currentDocumentLanguageChanged", dmspy);

                // trigger a rename
                oldFile.rename(newFilename, function (err) {
                    if (err) {
                        renameDeferred.reject(err);
                    } else {
                        renameDeferred.resolve();
                    }
                });
                await awaitsForDone(renameDeferred.promise(), "old file rename");

                html = LanguageManager.getLanguage("html");

                // language should change
                expect(doc.getLanguage()).toBe(html);
                expect(spy).toHaveBeenCalled();
                expect(spy.calls.count()).toEqual(1);
                expect(dmspy.calls.count()).toEqual(1);

                // check callback args (arg 0 is a jQuery event)
                expect(spy.calls.mostRecent().args[1]).toBe(javascript);
                expect(spy.calls.mostRecent().args[2]).toBe(html);

                // cleanup
                doc.releaseRef();

                await SpecRunnerUtils.closeTestWindow();
                await SpecRunnerUtils.removeTempDirectory();
            }, 30000);

            it("should update the document's language when a language is added", async function () {
                var unknown,
                    doc,
                    spy,
                    schemeLanguage,
                    promise;

                // Create a scheme script file
                doc = SpecRunnerUtils.createMockActiveDocument({ filename: "/file.scheme" });

                // Initial language will be unknown (scheme is not a default language)
                unknown = LanguageManager.getLanguage("unknown");

                // listen for event
                spy = jasmine.createSpy("languageChanged event handler");
                doc.on("languageChanged", spy);

                // sanity check language
                expect(doc.getLanguage()).toBe(unknown);

                // make active
                doc.addRef();

                // Add the scheme language, DocumentManager should update all open documents
                promise = LanguageManager.defineLanguage("scheme", {
                    name: "Scheme",
                    mode: "scheme",
                    fileExtensions: ["scheme"]
                }).done(function (language) {
                    schemeLanguage = language;
                });

                await awaitsForDone(promise, "loading scheme mode", 1000);

                // language should change
                expect(doc.getLanguage()).toBe(schemeLanguage);
                expect(spy).toHaveBeenCalled();
                expect(spy.calls.count()).toEqual(1);

                // check callback args (arg 0 is a jQuery event)
                expect(spy.calls.mostRecent().args[1]).toBe(unknown);
                expect(spy.calls.mostRecent().args[2]).toBe(schemeLanguage);

                // make sure LanguageManager keeps track of it
                expect(LanguageManager.getLanguageForPath(doc.file.fullPath)).toBe(schemeLanguage);

                // cleanup
                doc.releaseRef();
            });

            it("should update the document's language when a language is modified", function () {
                var unknown,
                    doc,
                    spy,
                    modifiedLanguage;

                // Create a foo script file
                doc = SpecRunnerUtils.createMockActiveDocument({ filename: "/test.foo" });

                // Initial language will be unknown (foo is not a default language)
                unknown = LanguageManager.getLanguage("unknown");

                // listen for event
                spy = jasmine.createSpy("languageChanged event handler");
                doc.on("languageChanged", spy);

                // sanity check language
                expect(doc.getLanguage()).toBe(unknown);

                // make active
                doc.addRef();

                modifiedLanguage = LanguageManager.getLanguage("html");
                modifiedLanguage.addFileExtension("foo");

                // language should change
                expect(doc.getLanguage()).toBe(modifiedLanguage);
                expect(spy).toHaveBeenCalled();
                expect(spy.calls.count()).toEqual(1);
                expect(LanguageManager.getLanguageForPath(doc.file.fullPath)).toBe(modifiedLanguage);

                // check callback args (arg 0 is a jQuery event)
                expect(spy.calls.mostRecent().args[1]).toBe(unknown);
                expect(spy.calls.mostRecent().args[2]).toBe(modifiedLanguage);

                // cleanup
                doc.releaseRef();
            });

            it("should update the document's language via setLanguageOverride(), then keep it locked", function () {
                var unknownLang = LanguageManager.getLanguage("unknown"),
                    phpLang = LanguageManager.getLanguage("php"),
                    doc,
                    modifiedLanguage,
                    spy;

                doc = SpecRunnerUtils.createMockActiveDocument({ filename: "/test.foo2" });

                // listen for event
                spy = jasmine.createSpy("languageChanged event handler");
                doc.on("languageChanged", spy);

                // sanity check language
                expect(doc.getLanguage()).toBe(unknownLang);

                // make active
                doc.addRef();

                LanguageManager.setLanguageOverrideForPath(doc.file.fullPath, phpLang);

                // language should change
                expect(doc.getLanguage()).toBe(phpLang);
                expect(spy.calls.count()).toEqual(1);
                expect(spy.calls.mostRecent().args[1]).toBe(unknownLang);
                expect(spy.calls.mostRecent().args[2]).toBe(phpLang);
                expect(LanguageManager.getLanguageForPath(doc.file.fullPath)).toBe(phpLang);

                // add 'foo2' extension to some other language
                modifiedLanguage = LanguageManager.getLanguage("html");
                modifiedLanguage.addFileExtension("foo2");

                // language should NOT change
                expect(doc.getLanguage()).toBe(phpLang);
                expect(spy.calls.count()).toEqual(1);
                expect(LanguageManager.getLanguageForPath(doc.file.fullPath)).toBe(phpLang);

                // cleanup
                doc.releaseRef();
            });

            it("should unlock the document's language for updates after setLanguageOverride(null)", function () {
                var unknownLang = LanguageManager.getLanguage("unknown"),
                    phpLang = LanguageManager.getLanguage("php"),
                    doc,
                    modifiedLanguage,
                    spy;

                doc = SpecRunnerUtils.createMockActiveDocument({ filename: "/test.foo3" });

                // listen for event
                spy = jasmine.createSpy("languageChanged event handler");
                doc.on("languageChanged", spy);

                // sanity check language
                expect(doc.getLanguage()).toBe(unknownLang);

                // make active
                doc.addRef();

                LanguageManager.setLanguageOverrideForPath(doc.file.fullPath, phpLang);

                // language should change
                expect(doc.getLanguage()).toBe(phpLang);
                expect(spy.calls.count()).toEqual(1);
                expect(spy.calls.mostRecent().args[1]).toBe(unknownLang);
                expect(spy.calls.mostRecent().args[2]).toBe(phpLang);
                expect(LanguageManager.getLanguageForPath(doc.file.fullPath)).toBe(phpLang);

                LanguageManager.setLanguageOverrideForPath(doc.file.fullPath, null);

                // language should revert
                expect(doc.getLanguage()).toBe(unknownLang);
                expect(spy.calls.count()).toEqual(2);
                expect(spy.calls.mostRecent().args[1]).toBe(phpLang);
                expect(spy.calls.mostRecent().args[2]).toBe(unknownLang);
                expect(LanguageManager.getLanguageForPath(doc.file.fullPath)).toBe(unknownLang);

                // add 'foo3' extension to some other language
                modifiedLanguage = LanguageManager.getLanguage("html");
                modifiedLanguage.addFileExtension("foo3");

                // language should change
                expect(doc.getLanguage()).toBe(modifiedLanguage);
                expect(spy.calls.count()).toEqual(3);
                expect(spy.calls.mostRecent().args[1]).toBe(unknownLang);
                expect(spy.calls.mostRecent().args[2]).toBe(modifiedLanguage);
                expect(LanguageManager.getLanguageForPath(doc.file.fullPath)).toBe(modifiedLanguage);

                // override again
                LanguageManager.setLanguageOverrideForPath(doc.file.fullPath, phpLang);

                expect(doc.getLanguage()).toBe(phpLang);
                expect(spy.calls.count()).toBe(4);
                expect(spy.calls.mostRecent().args[1]).toBe(modifiedLanguage);
                expect(spy.calls.mostRecent().args[2]).toBe(phpLang);
                expect(LanguageManager.getLanguageForPath(doc.file.fullPath)).toBe(phpLang);

                // remove override, should restore to modifiedLanguage
                LanguageManager.setLanguageOverrideForPath(doc.file.fullPath, null);

                expect(doc.getLanguage()).toBe(modifiedLanguage);
                expect(spy.calls.count()).toBe(5);
                expect(spy.calls.mostRecent().args[1]).toBe(phpLang);
                expect(spy.calls.mostRecent().args[2]).toBe(modifiedLanguage);
                expect(LanguageManager.getLanguageForPath(doc.file.fullPath)).toBe(modifiedLanguage);

                // cleanup
                doc.releaseRef();
            });

        });

    });
});
