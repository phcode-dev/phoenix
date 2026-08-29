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

/*jslint regexp: true */
/*global describe, it, spyOn, expect, beforeAll, beforeEach, afterEach, afterAll, awaitsForFail, awaitsForDone,
awaitsFor, Phoenix */

define(function (require, exports, module) {


    // Load dependent modules
    var ExtensionLoader = require("utils/ExtensionLoader"),
        FileSystemError = require("filesystem/FileSystemError"),
        ThemeManager     = require("view/ThemeManager"),
        SpecRunnerUtils = require("spec/SpecRunnerUtils");
    const CodeMirror = require("editor/CodeMirrorCompat"),
        CodeMirrorLegacyFileSystem = require("editor/CodeMirrorLegacyFileSystem"),
        CodeMirrorLegacyModuleLoader = require("editor/CodeMirrorLegacyModuleLoader"),
        CodeMirrorLegacyText = require("text");

    const testPathSrc = SpecRunnerUtils.getTestPath("/spec/ExtensionLoader-test-files");
    const testPath = Phoenix.isNativeApp ? Phoenix.VFS.getTauriAssetServeDir() + "tests": SpecRunnerUtils.getTempDirectory();

    describe("ExtensionLoader", function () {

        var origTimeout;

        async function testLoadExtension(name, promiseState, error) {
            var promise,
                config = {
                    baseUrl: Phoenix.VFS.getVirtualServingURLForPath(testPath + "/" + name)
                },
                consoleErrors = [];

            var originalConsoleErrorFn = console.error;
            spyOn(console, "error").and.callFake(function () {
                originalConsoleErrorFn.apply(console, arguments);

                if (typeof arguments[0] === "string" &&
                    arguments[0].indexOf("[Extension]") === 0) {
                    consoleErrors.push(Array.prototype.join.call(arguments));
                }
            });
            promise = ExtensionLoader.loadExtension(name, config, "main");

            if (promiseState !== "resolved") {
                await awaitsForFail(promise, "loadExtension", 10000);
            } else {
                await awaitsForDone(promise, "loadExtension");
            }

            if (error) {
                if (typeof error === "string") {
                    expect(consoleErrors[0]).toBe(error);
                } else {
                    expect(consoleErrors[0]).toMatch(error);
                }
            } else {
                expect(consoleErrors).toEqual([]);  // causes console errors to be logged in test failure message
            }

            expect(promise.state()).toBe(promiseState);
        }

        beforeAll(async function () {
            await SpecRunnerUtils.deletePathAsync(testPath, true);
            await SpecRunnerUtils.copy(testPathSrc, testPath);
        });

        afterAll(async function () {
            await SpecRunnerUtils.deletePathAsync(testPath, true);
        });

        beforeEach(function () {
            origTimeout = ExtensionLoader._getInitExtensionTimeout();
            ExtensionLoader._setInitExtensionTimeout(500);
        });

        afterEach(function () {
            ExtensionLoader._setInitExtensionTimeout(origTimeout);
            delete window.extensionLoaderLegacyCodeMirrorImports;
            delete window.extensionLoaderLegacyCodeMirrorFilesystem;
            delete window.extensionLoaderLegacyCodeMirrorAllAddons;
        });

        it("should load a basic extension", async function () {
            await testLoadExtension("NoInit", "resolved");
        });

        it("should load a basic extension with sync init", async function () {
            await testLoadExtension("InitResolved", "resolved");
        });

        it("should load a basic extension with async init", async function () {
            await testLoadExtension("InitResolvedAsync", "resolved");
        });

        it("should load a basic extension that uses requirejs-config.json", async function () {
            await testLoadExtension("RequireJSConfig", "resolved");
        });

        it("should install legacy filesystem compatibility after global initialization", function () {
            expect(window.brackets).toBeDefined();
            expect(window.brackets.metadata).toBeDefined();
            expect(typeof window.brackets.getModule).toBe("function");
            expect(CodeMirrorLegacyFileSystem.isInstalled()).toBeTrue();
        });

        it("should resolve legacy CodeMirror module IDs without loading CodeMirror 5", async function () {
            await testLoadExtension("LegacyCodeMirrorImports", "resolved");

            expect(window.extensionLoaderLegacyCodeMirrorImports).toEqual({
                addonAPIs: true,
                allUseFacade: true,
                foldHelpers: true,
                hasAdditionalModes: true,
                hasErlangMode: true,
                hasHintCompatibility: true,
                hasModeMetadata: true,
                hasPascalMode: true,
                hasSchemeMode: true,
                hasSearchCommands: true,
                hasScrollbarAnnotations: true,
                hasTwigMode: true,
                hasSublimeKeyMap: true,
                hasVimKeyMap: true,
                hasVueMode: true,
                inputStyle: "contenteditable",
                legacyCoreStylesAreVirtual: true,
                loadedLegacyAssets: [],
                trailingSpaceOption: true,
                version: "5.65.16"
            });
        });

        it("should resolve every bundled legacy CodeMirror addon through the CM6 facade", async function () {
            await testLoadExtension(
                "LegacyCodeMirrorAllAddons",
                "resolved"
            );

            expect(window.extensionLoaderLegacyCodeMirrorAllAddons).toEqual({
                allModulesUseFacade: true,
                allStylesAreVirtual: true,
                hasDialogAPI: true,
                hasDisplayAPI: true,
                hasFoldAPI: true,
                hasHintProviders: true,
                hasLintAPI: true,
                hasMergeAPI: true,
                hasModeLoaderAPI: true,
                hasRunModeAPI: true,
                hasScrollbarModels: true,
                hasSelectionPointer: true,
                hasTernAPI: true,
                hasHardWrapAPI: true,
                hasEmacsKeyMap: true
            });
        });

        it("should classify and strictly resolve legacy CodeMirror module IDs", function () {
            expect(CodeMirrorLegacyModuleLoader.getModeName(
                "thirdparty/CodeMirror2/mode/erlang/erlang"
            )).toBe("erlang");
            expect(CodeMirrorLegacyModuleLoader.getModeName(
                "thirdparty/CodeMirror/addon/mode/overlay"
            )).toBeNull();
            expect(CodeMirrorLegacyModuleLoader.isLegacyModule(
                "thirdparty/CodeMirror6/codemirror6"
            )).toBeFalse();
            expect(CodeMirrorLegacyModuleLoader.getModuleType(
                "thirdparty/CodeMirror2/addon/comment/comment"
            )).toBe("addon");
            expect(CodeMirrorLegacyModuleLoader.getModuleType(
                "thirdparty/CodeMirror/keymap/sublime"
            )).toBe("sublime-keymap");
            expect(CodeMirrorLegacyModuleLoader.getModuleType(
                "thirdparty/CodeMirror2/keymap/vim"
            )).toBe("vim-keymap");
            expect(CodeMirrorLegacyModuleLoader.getModuleType(
                "thirdparty/CodeMirror/theme/monokai"
            )).toBe("theme");
            expect(CodeMirrorLegacyModuleLoader.getModuleType(
                "thirdparty/CodeMirror/addon/fold/brace-fold"
            )).toBe("addon");
            expect(CodeMirrorLegacyModuleLoader.getModuleType(
                "thirdparty/CodeMirror/addon/runmode/runmode"
            )).toBe("addon");
            expect(CodeMirrorLegacyModuleLoader.getModuleType(
                "thirdparty/CodeMirror/addon/hint/show-hint"
            )).toBe("compat-addon");
            expect(CodeMirrorLegacyModuleLoader.getModuleType(
                "thirdparty/CodeMirror2/addon/dialog/dialog.js?cache=1"
            )).toBe("extended-addon");
            expect(CodeMirrorLegacyModuleLoader.getModuleType(
                "thirdparty/CodeMirror2/addon/search/search.js?cache=1"
            )).toBe("compat-addon");
            expect(CodeMirrorLegacyModuleLoader.getModuleType(
                "thirdparty/CodeMirror/mode/meta"
            )).toBe("mode-meta");
            expect(CodeMirrorLegacyModuleLoader.getModuleType(
                "thirdparty/CodeMirror2/mode/meta.js?cache=1"
            )).toBe("mode-meta");
            expect(CodeMirrorLegacyModuleLoader.resolveLegacyModule(
                "thirdparty/CodeMirror/theme/monokai"
            )).toBe(CodeMirror);
            expect(CodeMirrorLegacyModuleLoader.resolveLegacyModule(
                "thirdparty/CodeMirror/mode/meta"
            )).toBe(CodeMirror);
            expect(CodeMirrorLegacyModuleLoader.resolveLegacyModule(
                "thirdparty/CodeMirror2/mode/meta.js?cache=1"
            )).toBe(CodeMirror);
            expect(CodeMirrorLegacyModuleLoader.resolveLegacyModule(
                "thirdparty/CodeMirror/addon/hint/show-hint"
            )).toBe(CodeMirror);
            expect(CodeMirrorLegacyModuleLoader.resolveLegacyModule(
                "thirdparty/CodeMirror/mode/vue/vue"
            )).toBe(CodeMirror);
            expect(CodeMirror.resolveMode("script/x-vue").name).toBe("vue");
            expect(CodeMirrorLegacyModuleLoader.resolveLegacyModule(
                "thirdparty/CodeMirror/addon/search/matchesonscrollbar"
            )).toBe(CodeMirror);
            expect(CodeMirrorLegacyModuleLoader.resolveLegacyModule(
                "thirdparty/CodeMirror2/addon/scroll/annotatescrollbar.js"
            )).toBe(CodeMirror);
            expect(CodeMirrorLegacyModuleLoader.resolveLegacyModule(
                "thirdparty/CodeMirror/keymap/vim"
            )).toBe(CodeMirror);
            expect(CodeMirror.defaults.inputStyle).toBe("contenteditable");
        });

        it("should virtualize supported legacy CSS and theme imports", function () {
            const supportedStyles = [
                "addon/dialog/dialog.css",
                "addon/display/fullscreen.css",
                "addon/fold/foldgutter.css",
                "addon/hint/show-hint.css",
                "addon/lint/lint.css",
                "addon/merge/merge.css",
                "addon/scroll/simplescrollbars.css",
                "addon/search/match-highlighter.css",
                "addon/search/matchesonscrollbar.css",
                "addon/tern/tern.css",
                "lib/codemirror.css",
                "mode/tiddlywiki/tiddlywiki.css",
                "mode/tiki/tiki.css"
            ];

            supportedStyles.forEach(function (resourcePath, index) {
                const root = index % 2 ?
                    "thirdparty/CodeMirror" :
                    "thirdparty/CodeMirror2";
                const query = index === supportedStyles.length - 1 ?
                    "?cache=1" :
                    "";
                expect(CodeMirrorLegacyText.getCompatibilityContent(
                    `${root}/${resourcePath}${query}`
                )).toContain("CodeMirror 6 compatibility");
            });
            expect(CodeMirrorLegacyText.getCompatibilityContent(
                "htmlContent/deprecated-extensions-dialog.html"
            )).toBeNull();
            expect(CodeMirrorLegacyText.getCompatibilityContent(
                "thirdparty/CodeMirror/theme/monokai.css"
            )).toContain("monokai theme is bundled");
            expect(CodeMirrorLegacyText.legacyThemeNames.length).toBe(65);
            CodeMirrorLegacyText.legacyThemeNames.forEach(
                function (themeName, index) {
                    const root = index % 2 ?
                        "thirdparty/CodeMirror" :
                        "thirdparty/CodeMirror2";
                    expect(CodeMirrorLegacyText.getCompatibilityContent(
                        `${root}/theme/${themeName}.css?cache=${index}`
                    )).toContain(`${themeName} theme is bundled`);
                }
            );
            expect(function () {
                CodeMirrorLegacyText.getCompatibilityContent(
                    "thirdparty/CodeMirror/theme/not-a-stock-theme.css"
                );
            }).toThrowError(/does not ship or load CM5 assets/);
            expect(function () {
                CodeMirrorLegacyText.getCompatibilityContent(
                    "thirdparty/CodeMirror/addon/hint/show-hint.js"
                );
            }).toThrowError(/does not ship or load CM5 assets/);
        });

        it("should support legacy CodeMirror filesystem probes without CM5 files", async function () {
            await testLoadExtension("LegacyCodeMirrorFilesystem", "resolved");

            expect(window.extensionLoaderLegacyCodeMirrorFilesystem).toEqual({
                vueModeExists: true,
                vueModeIsCompatibilityModule: true,
                themeEntries: 65,
                themeEntriesAreFiles: true,
                hasMonokaiTheme: true,
                unsupportedModeExists: false,
                unrelatedPathExists: false,
                writeError: FileSystemError.NOT_WRITABLE,
                renameError: FileSystemError.NOT_WRITABLE,
                unlinkError: FileSystemError.NOT_WRITABLE,
                moveToTrashError: FileSystemError.NOT_WRITABLE,
                createDirectoryError: FileSystemError.NOT_WRITABLE,
                unlinkAsyncError: FileSystemError.NOT_WRITABLE,
                createDirectoryAsyncError: FileSystemError.NOT_WRITABLE,
                entryExistsAsync: true,
                entryStatAsyncIsFile: true,
                directoryContentsAsyncCount: 65,
                exportedExistsAsync: true,
                unsupportedExistsAsync: false,
                unrelatedExistsAsync: false,
                resolveReturnsVirtualFile: true,
                resolveAsyncReturnsVirtualDirectory: true,
                virtualFileUsesFilePrototype: true,
                virtualDirectoryUsesDirectoryPrototype: true,
                virtualEntryBackerIsInaccessible: true,
                virtualMetadataIsImmutable: true,
                unsupportedResolveError: FileSystemError.NOT_FOUND,
                unrelatedResolveAsyncError: FileSystemError.NOT_FOUND,
                wrongModeBasenameExists: false,
                wrongModeBasenameExistsAsync: false,
                wrongModeBasenameResolveError: FileSystemError.NOT_FOUND,
                traversalEntryIsCanonical: true,
                traversalEntryIsPhysical: true,
                traversalExists: false,
                traversalExistsAsync: false,
                traversalResolveError: FileSystemError.NOT_FOUND,
                traversalDelegates: true,
                virtualEntryIsCached: true,
                loadedLegacyAssets: []
            });
        });

        it("should log an error if an extension fails to init", async function () {
            await testLoadExtension("InitFail", "rejected", "[Extension] Error -- failed initExtension for InitFail");
        });

        it("should log an error with a message if an extension fails to sync init", async function () {
            await testLoadExtension("InitFailWithError", "rejected", "[Extension] Error -- failed initExtension for InitFailWithError: Didn't work");
        });

        it("should log an error with a message if an extension fails to async init", async function () {
            await testLoadExtension("InitFailWithErrorAsync", "rejected", "[Extension] Error -- failed initExtension for InitFailWithErrorAsync: Didn't work");
        });

        it("should log an error if an extension init fails with a timeout", async function () {
            await testLoadExtension("InitTimeout", "rejected", "[Extension] Error -- timeout during initExtension for InitTimeout");
        });

        it("should log an error if an extension init fails with a runtime error", async function () {
            let errorMsg = "[Extension] Error -- error thrown during initExtension for InitRuntimeError: ReferenceError: isNotDefined is not defined";
            if(window.Phoenix.browser.desktop.isSafari || window.Phoenix.browser.desktop.isWebKit || window.Phoenix.browser.mobile.isIos){
                errorMsg = "[Extension] Error -- error thrown during initExtension for InitRuntimeError: ReferenceError: Can't find variable: isNotDefined";
            }
            await testLoadExtension("InitRuntimeError", "rejected", errorMsg);
        });

        it("should log an error if an extension fails during RequireJS loading", async function () {
            await testLoadExtension("BadRequire", "rejected", /\[Extension\] failed to load.*BadRequire.* - Module does not exist: .*BadRequire\/notdefined\.js/);
        });

        it("should log an error if an extension uses an invalid requirejs-config.json", async function () {
            await testLoadExtension("BadRequireConfig", "resolved", /^\[Extension\] The require config file provided is invalid/);
        });

        it("should load a custom extension", async function () {
            await awaitsForDone(ExtensionLoader.loadExtensionFromNativeDirectory(`${testPath}/extension`));
            expect(window.extensionLoaderTestExtensionLoaded).toBeTrue();
        });

        it("should load a custom theme", async function () {
            await awaitsForDone(ExtensionLoader.loadExtensionFromNativeDirectory(`${testPath}/theme`));
            expect(window.extensionLoaderTestExtensionLoaded).toBeTrue();
            await awaitsFor(function () {
                let themes = ThemeManager.getAllThemes();
                for(let theme of themes){
                    if(theme.name === "da-theme"){
                        return true;
                    }
                }
                return false;
            }, "custom theme to be loaded");
        });
    });
});
