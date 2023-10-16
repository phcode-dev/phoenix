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
    var CodeMirror          = require("thirdparty/CodeMirror/lib/codemirror"),
        LanguageManager     = require("language/LanguageManager"),
        PreferencesManager  = require("preferences/PreferencesManager");

    describe("LanguageManager", function () {

        beforeEach(async function () {
            await awaitsForDone(LanguageManager.ready, "LanguageManager ready", 10000);

            spyOn(console, "error");
        });

        afterEach(function () {
            LanguageManager._resetPathLanguageOverrides();
        });

        function defineLanguage(definition) {
            var def = $.extend({}, definition);

            if (def.blockComment) {
                def.blockComment = [def.blockComment.prefix, def.blockComment.suffix];
            }

            return LanguageManager.defineLanguage(definition.id, def);
        }

        function validateLanguage(expected, actual) {
            if (!actual) {
                actual = LanguageManager.getLanguage(expected.id);
            } else {
                expect(LanguageManager.getLanguage(expected.id)).toBe(actual);
            }

            var i = 0,
                expectedFileExtensions = expected.fileExtensions || [],
                expectedFileExtensionsLength = expectedFileExtensions.length,
                actualFileExtensions = actual.getFileExtensions();

            expect(actual.getId()).toBe(expected.id);
            expect(actual.getName()).toBe(expected.name);

            for (i; i < expectedFileExtensionsLength; i++) {
                expect(actualFileExtensions).toContain(expectedFileExtensions[i]);
            }

            expect(actual.getFileNames()).toEqual(expected.fileNames || []);

            if (expected.blockComment) {
                expect(actual.hasBlockCommentSyntax()).toBe(true);
                expect(actual.getBlockCommentPrefix()).toBe(expected.blockComment.prefix);
                expect(actual.getBlockCommentSuffix()).toBe(expected.blockComment.suffix);
            } else {
                expect(actual.hasBlockCommentSyntax()).toBe(false);
            }

            if (expected.lineComment) {
                var lineComment = Array.isArray(expected.lineComment) ? expected.lineComment : [expected.lineComment];
                expect(actual.hasLineCommentSyntax()).toBe(true);
                expect(actual.getLineCommentPrefixes().toString()).toBe(lineComment.toString());
            } else {
                expect(actual.hasLineCommentSyntax()).toBe(false);
            }
        }

        describe("built-in languages", function () {

            it("should support built-in languages", function () {
                var html   = LanguageManager.getLanguage("html"),
                    coffee = LanguageManager.getLanguage("coffeescript");

                // check basic language support
                expect(html).toBeTruthy();
                expect(LanguageManager.getLanguage("css")).toBeTruthy();
                expect(LanguageManager.getLanguage("javascript")).toBeTruthy();
                expect(LanguageManager.getLanguage("json")).toBeTruthy();

                // check html mode
                var def = {
                    "id": "html",
                    "name": "HTML",
                    "mode": ["htmlmixed", "text/x-brackets-html"],
                    "fileExtensions": ["html", "htm", "shtm", "shtml", "xhtml"],
                    "blockComment": {prefix: "<!--", suffix: "-->"}
                };

                validateLanguage(def, html);

                def = {
                    "id": "coffeescript",
                    "name": "CoffeeScript",
                    "mode": "coffeescript",
                    "fileExtensions": ["coffee", "cf", "cson"],
                    "fileNames": ["cakefile"],
                    "lineComment": ["#"],
                    "blockComment": {prefix: "###", suffix: "###"}
                };

                validateLanguage(def, coffee);
            });

        });

        describe("LanguageManager API", function () {

            it("should map identifiers to languages", function () {
                var html = LanguageManager.getLanguage("html");

                expect(html).toBeTruthy();
                expect(LanguageManager.getLanguage("DoesNotExist")).toBe(undefined);
            });

            it("should map file extensions to languages", function () {
                var html    = LanguageManager.getLanguage("html"),
                    css     = LanguageManager.getLanguage("css"),
                    unknown = LanguageManager.getLanguage("unknown");

                // Bare file names
                expect(LanguageManager.getLanguageForPath("foo.html")).toBe(html);
                expect(LanguageManager.getLanguageForPath("INDEX.HTML")).toBe(html);
                expect(LanguageManager.getLanguageForPath("foo.doesNotExist")).toBe(unknown);

                // Paths
                expect(LanguageManager.getLanguageForPath("c:/only/testing/the/path.html")).toBe(html);  // abs Windows-style
                expect(LanguageManager.getLanguageForPath("/only/testing/the/path.css")).toBe(css);      // abs Mac/Linux-style
                expect(LanguageManager.getLanguageForPath("only/testing/the/path.css")).toBe(css);       // relative

                // Unknown file types
                expect(LanguageManager.getLanguageForPath("/code/html")).toBe(unknown);
                expect(LanguageManager.getLanguageForPath("/code/foo.html.notreally")).toBe(unknown);
            });

            it("should map complex file extensions to languages", function () {
                var ruby    = LanguageManager.getLanguage("ruby"),
                    html    = LanguageManager.getLanguage("html"),
                    unknown = LanguageManager.getLanguage("unknown");

                expect(LanguageManager.getLanguageForPath("foo.html.noSuchExt")).toBe(unknown);
                expect(LanguageManager.getLanguageForPath("foo.noSuchExt")).toBe(unknown);

                html.addFileExtension("html.noSuchExt");
                ruby.addFileExtension("noSuchExt");

                expect(LanguageManager.getLanguageForPath("foo.html.noSuchExt")).toBe(html);
                expect(LanguageManager.getLanguageForPath("foo.noSuchExt")).toBe(ruby);
            });

            it("should map file names to languages", function () {
                var coffee  = LanguageManager.getLanguage("coffeescript"),
                    unknown = LanguageManager.getLanguage("unknown");

                expect(LanguageManager.getLanguageForPath("cakefile")).toBe(coffee);
                expect(LanguageManager.getLanguageForPath("CakeFiLE")).toBe(coffee);
                expect(LanguageManager.getLanguageForPath("cakefile.doesNotExist")).toBe(unknown);
                expect(LanguageManager.getLanguageForPath("Something.cakefile")).toBe(unknown);
            });

            it("should remove file extensions and add to new languages", function () {
                var html    = LanguageManager.getLanguage("html"),
                    ruby    = LanguageManager.getLanguage("ruby"),
                    unknown = LanguageManager.getLanguage("unknown");

                expect(LanguageManager.getLanguageForPath("test.html")).toBe(html);

                html.removeFileExtension("html");
                expect(LanguageManager.getLanguageForPath("test.html")).toBe(unknown);

                ruby.addFileExtension("html");
                expect(LanguageManager.getLanguageForPath("test.html")).toBe(ruby);
            });

            it("should remove file names and add to new languages", function () {
                var coffee  = LanguageManager.getLanguage("coffeescript"),
                    html    = LanguageManager.getLanguage("html"),
                    unknown = LanguageManager.getLanguage("unknown");

                expect(LanguageManager.getLanguageForPath("Cakefile")).toBe(coffee);

                coffee.removeFileName("Cakefile");
                expect(LanguageManager.getLanguageForPath("Cakefile")).toBe(unknown);

                html.addFileName("Cakefile");
                expect(LanguageManager.getLanguageForPath("Cakefile")).toBe(html);
            });

            it("should add multiple file extensions to languages", function () {
                var ruby    = LanguageManager.getLanguage("ruby"),
                    unknown = LanguageManager.getLanguage("unknown");

                expect(LanguageManager.getLanguageForPath("foo.1")).toBe(unknown);
                expect(LanguageManager.getLanguageForPath("foo.2")).toBe(unknown);

                ruby.addFileExtension(["1", "2"]);

                expect(LanguageManager.getLanguageForPath("foo.1")).toBe(ruby);
                expect(LanguageManager.getLanguageForPath("foo.2")).toBe(ruby);
            });

            it("should remove multiple file extensions from languages", function () {
                var ruby    = LanguageManager.getLanguage("ruby"),
                    unknown = LanguageManager.getLanguage("unknown");

                // Assumes test above already ran (tests in this suite are not isolated)
                expect(LanguageManager.getLanguageForPath("foo.1")).toBe(ruby);
                expect(LanguageManager.getLanguageForPath("foo.2")).toBe(ruby);

                ruby.removeFileExtension(["1", "2"]);

                expect(LanguageManager.getLanguageForPath("foo.1")).toBe(unknown);
                expect(LanguageManager.getLanguageForPath("foo.2")).toBe(unknown);
            });

            it("should add multiple file names to languages", function () {
                var ruby    = LanguageManager.getLanguage("ruby"),
                    unknown = LanguageManager.getLanguage("unknown");

                expect(LanguageManager.getLanguageForPath("rubyFile1")).toBe(unknown);
                expect(LanguageManager.getLanguageForPath("rubyFile2")).toBe(unknown);

                ruby.addFileName(["rubyFile1", "rubyFile2"]);

                expect(LanguageManager.getLanguageForPath("rubyFile1")).toBe(ruby);
                expect(LanguageManager.getLanguageForPath("rubyFile2")).toBe(ruby);
            });

            it("should remove multiple file names from languages", function () {
                var ruby    = LanguageManager.getLanguage("ruby"),
                    unknown = LanguageManager.getLanguage("unknown");

                // Assumes test above already ran (tests in this suite are not isolated)
                expect(LanguageManager.getLanguageForPath("rubyFile1")).toBe(ruby);
                expect(LanguageManager.getLanguageForPath("rubyFile2")).toBe(ruby);

                ruby.removeFileName(["rubyFile1", "rubyFile2"]);

                expect(LanguageManager.getLanguageForPath("rubyFile1")).toBe(unknown);
                expect(LanguageManager.getLanguageForPath("rubyFile2")).toBe(unknown);
            });
        });

        describe("defineLanguage", function () {

            it("should create a basic language", function () {
                var language,
                    promise,
                    def = { id: "one", name: "One", mode: ["null", "text/plain"] };

                // mode already exists, this test is completely synchronous
                promise = defineLanguage(def).done(function (lang) {
                    language = lang;
                });

                expect(promise.state() === "resolved").toBeTruthy();

                validateLanguage(def, language);
            });

            it("should log errors for invalid language id values", function () {
                defineLanguage({ id: null });
                expect(console.error).toHaveBeenCalledWith("Language ID must be a string");

                defineLanguage({ id: "HTML5" });
                expect(console.error).toHaveBeenCalledWith("Invalid language ID \"HTML5\": Only groups of lower case letters and numbers are allowed, separated by underscores.");

                defineLanguage({ id: "_underscore" });
                expect(console.error).toHaveBeenCalledWith("Invalid language ID \"_underscore\": Only groups of lower case letters and numbers are allowed, separated by underscores.");
            });

            it("should log errors for invalid language name values", function () {
                defineLanguage({ id: "two" });
                expect(console.error).toHaveBeenCalledWith("name must be a string");

                defineLanguage({ id: "three", name: "" });
                expect(console.error).toHaveBeenCalledWith("name must not be empty");
            });

            it("should log errors for missing mode value", function () {
                defineLanguage({ id: "four", name: "Four" });
                expect(console.error).toHaveBeenCalledWith("mode must be a string");

                defineLanguage({ id: "five", name: "Five", mode: "" });
                expect(console.error).toHaveBeenCalledWith("mode must not be empty");
            });

            it("should create a language with file extensions and a mode", async function () {
                var def = { id: "pascal", name: "Pascal", fileExtensions: ["pas", "p"], mode: "pascal" },
                    language;

                defineLanguage(def).done(function (lang) {
                    language = lang;
                });

                await awaitsFor(function () {
                    return Boolean(language);
                }, "The language should be resolved", 2000);

                expect(LanguageManager.getLanguageForPath("file.p")).toBe(language);
                validateLanguage(def, language);
            });

            it("should allow multiple languages to use the same mode", async function () {
                var xmlBefore,
                    def         = { id: "wix", name: "WiX", fileExtensions: ["wix"], mode: "xml" },
                    lang,
                    xmlAfter;

                xmlBefore = LanguageManager.getLanguage("xml");

                defineLanguage(def).done(function (language) {
                    lang = language;
                    xmlAfter = LanguageManager.getLanguage("xml");
                });

                await awaitsFor(function () {
                    return Boolean(lang);
                }, "The language should be resolved", 2000);

                expect(xmlBefore).toBe(xmlAfter);
                expect(LanguageManager.getLanguageForPath("file.wix")).toBe(lang);
                expect(LanguageManager.getLanguageForPath("file.xml")).toBe(xmlAfter);

                validateLanguage(def, lang);
            });

            // FIXME: Add internal LanguageManager._reset()
            // or unload a language (pascal is loaded from the previous test)
            it("should return an error if a language is already defined", async function () {
                var def = { id: "pascal", name: "Pascal", fileExtensions: ["pas", "p"], mode: "pascal" },
                    error = -1;

                defineLanguage(def).fail(function (err) {
                    error = err;
                });

                await awaitsFor(function () {
                    return error !== -1;
                }, "The promise should be rejected with an error", 2000);

                expect(error).toBe("Language \"pascal\" is already defined");
            });

            it("should validate comment prefix/suffix", async function () {
                var def = { id: "coldfusion", name: "ColdFusion", fileExtensions: ["cfml", "cfm"], mode: "xml" },
                    language;

                defineLanguage(def).done(function (lang) {
                    language = lang;
                });

                await awaitsFor(function () {
                    return Boolean(language);
                }, "The language should be resolved", 50);

                language.setLineCommentSyntax("");
                expect(console.error).toHaveBeenCalledWith("prefix must not be empty");

                language.setBlockCommentSyntax("<!---", "");
                expect(console.error).toHaveBeenCalledWith("suffix must not be empty");

                language.setBlockCommentSyntax("", "--->");
                expect(console.error).toHaveBeenCalledWith("prefix must not be empty");

                def.lineComment = "//";
                def.blockComment = {
                    prefix: "<!---",
                    suffix: "--->"
                };

                language.setLineCommentSyntax(def.lineComment);
                language.setBlockCommentSyntax(def.blockComment.prefix, def.blockComment.suffix);

                validateLanguage(def, language);
            });

            it("should validate multiple line comment prefixes", async function () {
                var def = { id: "php2", name: "PHP2", fileExtensions: ["php2"], mode: "php" },
                    language;

                defineLanguage(def).done(function (lang) {
                    language = lang;
                });

                await awaitsFor(function () {
                    return Boolean(language);
                }, "The language should be resolved", 50);

                language.setLineCommentSyntax([]);
                expect(console.error).toHaveBeenCalledWith("The prefix array should not be empty");

                language.setLineCommentSyntax([""]);
                expect(console.error).toHaveBeenCalledWith("prefix[0] must not be empty");

                language.setLineCommentSyntax(["#", ""]);
                expect(console.error).toHaveBeenCalledWith("prefix[1] must not be empty");

                def.lineComment = ["#"];

                language.setLineCommentSyntax(def.lineComment);
                validateLanguage(def, language);

                def.lineComment = ["#", "//"];

                language.setLineCommentSyntax(def.lineComment);
                validateLanguage(def, language);
            });

            it("should load a built-in CodeMirror mode", async function () {
                var id          = "erlang",
                    def         = { id: id, name: "erlang", fileExtensions: ["erlang"], mode: "erlang" },
                    language;

                // erlang is not defined in the default set of languages in languages.json
                expect(CodeMirror.modes[id]).toBe(undefined);

                defineLanguage(def).done(function (lang) {
                    language = lang;
                });

                await awaitsFor(function () {
                    return Boolean(language);
                }, "The language should be resolved", 2000);

                expect(LanguageManager.getLanguageForPath("file.erlang")).toBe(language);
                validateLanguage(def, language);

                // confirm the mode is loaded in CodeMirror
                expect(CodeMirror.modes[id]).not.toBe(undefined);
            });

        });

        describe("Preferences", function () {
            it("should be able to add extension mappings via a preference", function () {
                var language = LanguageManager.getLanguageForExtension("foobar");
                expect(language).toBeUndefined();
                PreferencesManager.set(LanguageManager._EXTENSION_MAP_PREF, {
                    foobar: "javascript"
                });
                language = LanguageManager.getLanguageForExtension("foobar");
                expect(language.getId()).toBe("javascript");
                PreferencesManager.set(LanguageManager._EXTENSION_MAP_PREF, { });
                language = LanguageManager.getLanguageForExtension("foobar");
                expect(language).toBeUndefined();
            });

            it("should manage overridden default extensions", function () {
                PreferencesManager.set(LanguageManager._EXTENSION_MAP_PREF, {
                    js: "html"
                });
                var language = LanguageManager.getLanguageForExtension("js");
                expect(language.getId()).toBe("html");
                PreferencesManager.set(LanguageManager._EXTENSION_MAP_PREF, {
                    js: "php"
                });
                language = LanguageManager.getLanguageForExtension("js");
                expect(language.getId()).toBe("php");
                PreferencesManager.set(LanguageManager._EXTENSION_MAP_PREF, { });
                language = LanguageManager.getLanguageForExtension("js");
                expect(language.getId()).toBe("javascript");
            });

            it("should be able to manage file name mappings via a preference", function () {
                var language = LanguageManager.getLanguageForPath("/bar/Foofile");
                expect(language.getId()).toBe("unknown");
                PreferencesManager.set(LanguageManager._NAME_MAP_PREF, {
                    "Foofile": "javascript"
                });
                language = LanguageManager.getLanguageForPath("/bar/Foofile");
                expect(language.getId()).toBe("javascript");
                PreferencesManager.set(LanguageManager._NAME_MAP_PREF, { });
                language = LanguageManager.getLanguageForPath("/bar/Foofile");
                expect(language.getId()).toBe("unknown");
            });

            it("should manage overridden default file names", function () {
                PreferencesManager.set(LanguageManager._NAME_MAP_PREF, {
                    Gemfile: "python"
                });
                var language = LanguageManager.getLanguageForPath("Gemfile");
                expect(language.getId()).toBe("python");
                PreferencesManager.set(LanguageManager._NAME_MAP_PREF, {
                    Gemfile: "php"
                });
                language = LanguageManager.getLanguageForPath("Gemfile");
                expect(language.getId()).toBe("php");
                PreferencesManager.set(LanguageManager._NAME_MAP_PREF, { });
                language = LanguageManager.getLanguageForPath("Gemfile");
                expect(language.getId()).toBe("ruby");
            });

            it("should manage preferences for non-default languages", function() {
                var language,
                    def = { id: "test", name: "Test", mode: ["null", "text/plain"] };
                PreferencesManager.set(LanguageManager._EXTENSION_MAP_PREF, {
                    extension: "test"
                });
                PreferencesManager.set(LanguageManager._NAME_MAP_PREF, {
                    filename: "test"
                });
                defineLanguage(def);
                language = LanguageManager.getLanguageForExtension("extension");
                expect(language.getId()).toBe("test");
                language = LanguageManager.getLanguageForPath("filename");
                expect(language.getId()).toBe("test");
            });
        });

        describe("isBinary", function () {

            it("should recognize known binary file extensions", function () {
                // image
                expect(LanguageManager.getLanguageForPath("test.gif").isBinary()).toBeTruthy();
                expect(LanguageManager.getLanguageForPath("test.png").isBinary()).toBeTruthy();

                // audio
                expect(LanguageManager.getLanguageForPath("test.mp3").isBinary()).toBeTruthy();
                expect(LanguageManager.getLanguageForPath("test.wav").isBinary()).toBeTruthy();

                // other
                expect(LanguageManager.getLanguageForPath("test.exe").isBinary()).toBeTruthy();
                expect(LanguageManager.getLanguageForPath("test.dll").isBinary()).toBeTruthy();
                expect(LanguageManager.getLanguageForPath("test.zip").isBinary()).toBeTruthy();
            });

            it("should recognize known non-binary file extensions", function () {
                expect(LanguageManager.getLanguageForPath("test.css").isBinary()).toBeFalsy();
                expect(LanguageManager.getLanguageForPath("test.html").isBinary()).toBeFalsy();
                expect(LanguageManager.getLanguageForPath("test.txt").isBinary()).toBeFalsy();
                expect(LanguageManager.getLanguageForPath("test.js").isBinary()).toBeFalsy();
                expect(LanguageManager.getLanguageForPath("test.json").isBinary()).toBeFalsy();
                expect(LanguageManager.getLanguageForPath("test.xml").isBinary()).toBeFalsy();
                expect(LanguageManager.getLanguageForPath("test.css.erb").isBinary()).toBeFalsy();
                expect(LanguageManager.getLanguageForPath("test.php.css").isBinary()).toBeFalsy();
            });

            it("should recognize unknown file extensions as non-binary", function () {
                expect(LanguageManager.getLanguageForPath("test.abcxyz").isBinary()).toBeFalsy();
            });
        });

        describe("getCompoundFileExtension", function () {

            it("should get the extension of a normalized win file path", function () {
                expect(LanguageManager.getCompoundFileExtension("C:/foo/bar/baz.txt")).toBe("txt");
            });

            it("should get the extension of a posix file path", function () {
                expect(LanguageManager.getCompoundFileExtension("/foo/bar/baz.txt")).toBe("txt");
            });

            it("should return empty extension for a normalized win directory path", function () {
                expect(LanguageManager.getCompoundFileExtension("C:/foo/bar/")).toBe("");
            });

            it("should return empty extension for a posix directory path", function () {
                expect(LanguageManager.getCompoundFileExtension("bar")).toBe("");
            });

            it("should return the extension of a filename containing .", function () {
                expect(LanguageManager.getCompoundFileExtension("C:/foo/bar/.baz/jaz.txt")).toBe("txt");
                expect(LanguageManager.getCompoundFileExtension("foo/bar/baz/.jaz.txt")).toBe("txt");
                expect(LanguageManager.getCompoundFileExtension("foo.bar.baz..jaz.txt")).toBe("txt");
            });

            it("should return no extension for files with only . as a first character", function () {
                expect(LanguageManager.getCompoundFileExtension("C:/foo/bar/.baz/.jaz")).toBe("");
            });

            it("should return the extension containing . for known types", function () {
                expect(LanguageManager.getCompoundFileExtension("C:/foo/bar/.baz/jaz.scss.erb")).toBe("scss.erb");
                expect(LanguageManager.getCompoundFileExtension("foo/bar/baz/.jaz.js.erb")).toBe("js.erb");
            });

            it("should return the extension combined from other known extensions", function () {
                expect(LanguageManager.getCompoundFileExtension("foo.bar.php.js")).toBe("php.js");
                expect(LanguageManager.getCompoundFileExtension("foo.bar.php.html.js")).toBe("php.html.js");
                expect(LanguageManager.getCompoundFileExtension("foo.bar.php.scss.erb")).toBe("php.scss.erb");
            });
        });
    });
});
