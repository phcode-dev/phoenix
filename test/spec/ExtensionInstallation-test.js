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

/*global describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, awaitsFor, awaitsForDone, jsPromise */

define(function (require, exports, module) {


    var SpecRunnerUtils  = require("spec/SpecRunnerUtils"),
        ExtensionLoader  = require("utils/ExtensionLoader"),
        FileSystem       = require("filesystem/FileSystem"),
        Package          = require("extensibility/Package");

    var testFilePath = SpecRunnerUtils.getTestPath("/spec/extension-test-files");

    var tempDirectory = SpecRunnerUtils.getTempDirectory();
    var extensionsRoot = tempDirectory + "/extensions";

    var basicValid          = testFilePath + "/basic-valid-extension.zip",
        missingNameVersion  = testFilePath + "/missing-name-version.zip",
        incompatibleVersion = testFilePath + "/incompatible-version.zip";

    describe("Extension Installation", function () {
        // The code that follows mocks out the bits of ExtensionLoader that are
        // used during installation so that the extension is not *actually*
        // loaded after it's installed.
        var realGetUserExtensionPath, realLoadExtension, lastExtensionLoad;

        function mockGetUserExtensionPath() {
            return extensionsRoot + "/user";
        }

        function mockLoadExtension(name, config, entryPoint) {
            var d = $.Deferred();
            lastExtensionLoad.name = name;
            lastExtensionLoad.config = config;
            lastExtensionLoad.entryPoint = entryPoint;
            d.resolve();
            return d.promise();
        }

        beforeAll(async function () {
            await SpecRunnerUtils.createTempDirectory();
        });

        afterAll(async function () {
            await SpecRunnerUtils.removeTempDirectory();
        });

        beforeEach(function () {
            realGetUserExtensionPath = ExtensionLoader.getUserExtensionPath;
            ExtensionLoader.getUserExtensionPath = mockGetUserExtensionPath;

            lastExtensionLoad = {};
            realLoadExtension = ExtensionLoader.loadExtension;
            ExtensionLoader.loadExtension = mockLoadExtension;
        });

        afterEach(async function () {
            ExtensionLoader.getUserExtensionPath = realGetUserExtensionPath;
            ExtensionLoader.loadExtension = realLoadExtension;
            var promise = SpecRunnerUtils.deletePath(mockGetUserExtensionPath(), true);
            await awaitsForDone(promise, "Mock Extension Removal", 2000);
        });

        it("extensions should install and load", async function () {
            let packageData = await jsPromise(Package.installFromURL(
                window.fsServerUrl + basicValid, extensionsRoot + "/custom").promise);
            expect(packageData.installationStatus).toEqual("INSTALLED");
            expect(packageData.name).toEqual("basic-valid");
            expect(packageData.installedTo).toEqual("/test/temp/extensions/custom/basic-valid");
            expect(packageData.localPath).toEqual("/test/temp/extensions/custom/basic-valid");

            let extension = await jsPromise(Package.install(packageData.installedTo, packageData.name, false));
            expect(extension.name).toEqual("basic");
        });

        it("extensions should install and load to default location", async function () {
            let packageData = await jsPromise(Package.installFromURL(
                window.fsServerUrl + basicValid).promise);
            expect(packageData.installationStatus).toEqual("INSTALLED");
            expect(packageData.name).toEqual("basic-valid");
            expect(packageData.installedTo).toEqual("/test/temp/extensions/user/basic-valid");
            expect(packageData.localPath).toEqual("/test/temp/extensions/user/basic-valid");

            let extension = await jsPromise(Package.install(packageData.installedTo, packageData.name, false));
            expect(extension.name).toEqual("basic");
        });

        it("extensions should install and load with missing name and version", async function () {
            let packageData = await jsPromise(Package.installFromURL(
                window.fsServerUrl + missingNameVersion).promise);
            expect(packageData.installationStatus).toEqual("INSTALLED");
            expect(packageData.name).toEqual("missing-name");
            expect(packageData.installedTo).toEqual("/test/temp/extensions/user/missing-name");
            expect(packageData.localPath).toEqual("/test/temp/extensions/user/missing-name");

            let extension = await jsPromise(Package.install(packageData.installedTo, packageData.name, false));
            expect(extension.name).toEqual("missing");
        });

        it("should remove an installed extension", async function () {
            let packageData = await jsPromise(Package.installFromURL(
                window.fsServerUrl + basicValid).promise);
            expect(packageData.installationStatus).toEqual("INSTALLED");
            expect(packageData.name).toEqual("basic-valid");
            expect(packageData.installedTo).toEqual("/test/temp/extensions/user/basic-valid");
            expect(packageData.localPath).toEqual("/test/temp/extensions/user/basic-valid");

            let extension = await jsPromise(Package.install(packageData.installedTo, packageData.name, false));
            expect(extension.name).toEqual("basic");

            await jsPromise(Package.remove(packageData.installedTo));
            await new Promise((resolve, reject)=>{
                FileSystem.getDirectoryForPath(packageData.installedTo).exists(function (err, isPresent) {
                    if (err || isPresent) {
                        reject();
                        return;
                    }
                    resolve();
                });
            });
        });
    });
});
