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
        ThemeManager     = require("view/ThemeManager"),
        SpecRunnerUtils = require("spec/SpecRunnerUtils");

    const testPathSrc = SpecRunnerUtils.getTestPath("/spec/ExtensionLoader-test-files");
    const testPath = window.__TAURI__ ? Phoenix.VFS.getTauriAssetServeDir() + "tests": SpecRunnerUtils.getTempDirectory();

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
