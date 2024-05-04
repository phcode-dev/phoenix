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

/*global describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, awaitsFor, awaitsForDone, jsPromise, Phoenix*/

define(function (require, exports, module) {


    const SpecRunnerUtils  = require("spec/SpecRunnerUtils"),
        ExtensionLoader  = require("utils/ExtensionLoader"),
        FileSystem       = require("filesystem/FileSystem"),
        Package          = require("extensibility/Package");

    const testFilePath = SpecRunnerUtils.getTestPath("/spec/extension-test-files");

    const tempDirectory = window.__TAURI__ ? Phoenix.VFS.getTauriAssetServeDir() + "tests": SpecRunnerUtils.getTempDirectory();
    const extensionsRoot = tempDirectory + "/extensions";

    const basicValidSrc          = testFilePath + "/basic-valid-extension.zip",
        missingNameVersionSrc  = testFilePath + "/missing-name-version.zip",
        node_basic_not_installable_src   = testFilePath + "/node-ext/node-basic-not-installable.zip",
        node_basic_not_installable_no_main_src   = testFilePath + "/node-ext/node-basic-not-installable-no-main.zip",
        node_basic_not_installable_no_node_folder_src   = testFilePath + "/node-ext/node-basic-not-installable-no-node-folder.zip",
        node_basic_not_installable_pack_src   = testFilePath + "/node-ext/node-basic-not-installable-pack.zip",
        node_basic_npm_dep_no_install_src   = testFilePath + "/node-ext/node-basic-npm-dep-no-install.zip",
        node_basic_npm_install_src   = testFilePath + "/node-ext/node-basic-npm-install.zip",
        node_basic_optional_src   = testFilePath + "/node-ext/node-basic-optional.zip",
        node_basic_required_src   = testFilePath + "/node-ext/node-basic-required.zip";

    let basicValid          = basicValidSrc, // this will differ for tauri, see before all
        missingNameVersion  = missingNameVersionSrc,
        node_basic_not_installable   = node_basic_not_installable_src,
        node_basic_not_installable_no_main   = node_basic_not_installable_no_main_src,
        node_basic_not_installable_no_node_folder   = node_basic_not_installable_no_node_folder_src,
        node_basic_not_installable_pack = node_basic_not_installable_pack_src,
        node_basic_npm_dep_no_install   = node_basic_npm_dep_no_install_src,
        node_basic_npm_install   = node_basic_npm_install_src,
        node_basic_optional   = node_basic_optional_src,
        node_basic_required   = node_basic_required_src;

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
            await SpecRunnerUtils.ensureExistsDirAsync(tempDirectory);
            if(window.__TAURI__){
                basicValid          = tempDirectory + "/basic-valid-extension.zip";
                missingNameVersion  = tempDirectory + "/missing-name-version.zip";
                missingNameVersion  = tempDirectory + "/missing-name-version.zip";
                node_basic_not_installable   = tempDirectory + "/node-basic-not-installable.zip";
                node_basic_not_installable_no_main   = tempDirectory + "/node-basic-not-installable-no-main.zip";
                node_basic_not_installable_no_node_folder   = tempDirectory + "/node-basic-not-installable-no-node-folder.zip";
                node_basic_not_installable_pack   = tempDirectory + "/node-basic-not-installable-pack.zip";
                node_basic_npm_dep_no_install   = tempDirectory + "/node-basic-npm-dep-no-install.zip";
                node_basic_npm_install   = tempDirectory + "/node-basic-npm-install.zip";
                node_basic_optional   = tempDirectory + "/node-basic-optional.zip";
                node_basic_required   = tempDirectory + "/node-basic-required.zip";
                await SpecRunnerUtils.copy(basicValidSrc, basicValid);
                await SpecRunnerUtils.copy(missingNameVersionSrc, missingNameVersion);
                await SpecRunnerUtils.copy(node_basic_not_installable_src, node_basic_not_installable);
                await SpecRunnerUtils.copy(node_basic_not_installable_no_main_src, node_basic_not_installable_no_main);
                await SpecRunnerUtils.copy(node_basic_not_installable_no_node_folder_src, node_basic_not_installable_no_node_folder);
                await SpecRunnerUtils.copy(node_basic_not_installable_pack_src, node_basic_not_installable_pack);
                await SpecRunnerUtils.copy(node_basic_npm_dep_no_install_src, node_basic_npm_dep_no_install);
                await SpecRunnerUtils.copy(node_basic_npm_install_src, node_basic_npm_install);
                await SpecRunnerUtils.copy(node_basic_optional_src, node_basic_optional);
                await SpecRunnerUtils.copy(node_basic_required_src, node_basic_required);
            }
        });

        afterAll(async function () {
            await SpecRunnerUtils.deletePathAsync(tempDirectory, true);
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
                Phoenix.VFS.getVirtualServingURLForPath(basicValid), extensionsRoot + "/custom").promise);
            expect(packageData.installationStatus).toEqual("INSTALLED");
            expect(packageData.name).toEqual("basic-valid");
            expect(packageData.installedTo).toEqual(`${extensionsRoot}/custom/basic-valid`);
            expect(packageData.localPath).toEqual(`${extensionsRoot}/custom/basic-valid`);

            let extension = await jsPromise(Package.install(packageData.installedTo, packageData.name, false));
            expect(extension.name).toEqual("basic");
        });

        it("extensions should install and load node optional extensions in all platforms", async function () {
            const extPath = node_basic_optional;
            let packageData = await jsPromise(Package.installFromURL(
                Phoenix.VFS.getVirtualServingURLForPath(extPath), extensionsRoot + "/custom").promise);
            expect(packageData.installationStatus).toEqual("INSTALLED");
            expect(packageData.name).toEqual("node-basic");
            expect(packageData.installedTo).toEqual(`${extensionsRoot}/custom/node-basic`);
            expect(packageData.localPath).toEqual(`${extensionsRoot}/custom/node-basic`);

            let extension = await jsPromise(Package.install(packageData.installedTo, packageData.name, false));
            expect(extension.name).toEqual("node");
        });

        async function _validateInstallFail(extPath, errorMessage) {
            let err;
            try{
                await jsPromise(Package.installFromURL(
                    Phoenix.VFS.getVirtualServingURLForPath(extPath), extensionsRoot + "/custom").promise);
            } catch (e) {
                err = e;
            }
            expect(err).toEqual(errorMessage);
        }

        if(Phoenix.isNativeApp) {
            // node extension tests
            it("should install and load node required extension in native platforms", async function () {
                const extPath = node_basic_required;
                let packageData = await jsPromise(Package.installFromURL(
                    Phoenix.VFS.getVirtualServingURLForPath(extPath), extensionsRoot + "/custom").promise);
                expect(packageData.installationStatus).toEqual("INSTALLED");
                expect(packageData.name).toEqual("node-basic");
                expect(packageData.installedTo).toEqual(`${extensionsRoot}/custom/node-basic`);
                expect(packageData.localPath).toEqual(`${extensionsRoot}/custom/node-basic`);

                let extension = await jsPromise(Package.install(packageData.installedTo, packageData.name, false));
                expect(extension.name).toEqual("node");
            });

            it("should install node exten with no npm install execution too", async function () {
                const extPath = node_basic_npm_dep_no_install;
                let packageData = await jsPromise(Package.installFromURL(
                    Phoenix.VFS.getVirtualServingURLForPath(extPath), extensionsRoot + "/custom").promise);
                expect(packageData.installationStatus).toEqual("INSTALLED");

                let extension = await jsPromise(Package.install(packageData.installedTo, packageData.name, false));
                expect(extension.name).toEqual("node-basic-npm-dep");
            });

            it("should install node exten", async function () {
                const extPath = node_basic_npm_install;
                let packageData = await jsPromise(Package.installFromURL(
                    Phoenix.VFS.getVirtualServingURLForPath(extPath), extensionsRoot + "/custom").promise);
                expect(packageData.installationStatus).toEqual("INSTALLED");

                const nodeModulesInstalled = FileSystem.getDirectoryForPath(packageData.installedTo);
                const nodeModuleInstalled = await nodeModulesInstalled.existsAsync();
                expect(nodeModuleInstalled).toEqual(true);

                let extension = await jsPromise(Package.install(packageData.installedTo, packageData.name, false));
                expect(extension.name).toEqual("node-basic");
            }, 5000);

            it("should not install node extn if npmInstall dir contains node_modules", async function () {
                await _validateInstallFail(node_basic_not_installable,
                    "Extension is broken. (Err: cannot npm install inside extension folder as it already has node_modules)");
            });

            it("should not install node extn if npmInstall present and doesnt contain package.json", async function () {
                await _validateInstallFail(node_basic_not_installable_pack,
                    "Extension is broken, (Err: it's node package.json not found)");
            });

            it("should not install node extn if node main file not found", async function () {
                await _validateInstallFail(node_basic_not_installable_no_main,
                    "Extension is broken, (Err: node main file not found)");
            });

            it("should not install node extn if npmInstall present and doesnt contain node folder to npm install", async function () {
                await _validateInstallFail(node_basic_not_installable_no_node_folder,
                    "Extension is broken, (Err: node source folder not found)");
            });
        } else {
            it("should not install node required extension in browser", async function () {
                await _validateInstallFail(node_basic_required,
                    "Extension can only be installed in native builds!");
            });
        }

        it("extensions should install and load to default location", async function () {
            let packageData = await jsPromise(Package.installFromURL(
                Phoenix.VFS.getVirtualServingURLForPath(basicValid)).promise);
            expect(packageData.installationStatus).toEqual("INSTALLED");
            expect(packageData.name).toEqual("basic-valid");
            expect(packageData.installedTo).toEqual(`${extensionsRoot}/user/basic-valid`);
            expect(packageData.localPath).toEqual(`${extensionsRoot}/user/basic-valid`);

            let extension = await jsPromise(Package.install(packageData.installedTo, packageData.name, false));
            expect(extension.name).toEqual("basic");
        });

        it("extensions should install and load with missing name and version", async function () {
            let packageData = await jsPromise(Package.installFromURL(
                Phoenix.VFS.getVirtualServingURLForPath(missingNameVersion)).promise);
            expect(packageData.installationStatus).toEqual("INSTALLED");
            expect(packageData.name).toEqual("missing-name");
            expect(packageData.installedTo).toEqual(`${extensionsRoot}/user/missing-name`);
            expect(packageData.localPath).toEqual(`${extensionsRoot}/user/missing-name`);

            let extension = await jsPromise(Package.install(packageData.installedTo, packageData.name, false));
            expect(extension.name).toEqual("missing");
        });

        it("should remove an installed extension", async function () {
            let packageData = await jsPromise(Package.installFromURL(
                Phoenix.VFS.getVirtualServingURLForPath(basicValid)).promise);
            expect(packageData.installationStatus).toEqual("INSTALLED");
            expect(packageData.name).toEqual("basic-valid");
            expect(packageData.installedTo).toEqual(`${extensionsRoot}/user/basic-valid`);
            expect(packageData.localPath).toEqual(`${extensionsRoot}/user/basic-valid`);

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
