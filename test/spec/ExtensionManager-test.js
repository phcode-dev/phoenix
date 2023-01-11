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
/*global describe, it, expect, beforeEach, afterEach, spyOn, jasmine, awaitsFor, awaitsForDone */
/*unittests: ExtensionManager*/

define(function (require, exports, module) {


    require("thirdparty/jquery.mockjax.js");

    var _ = require("thirdparty/lodash");

    var ExtensionManager          = require("extensibility/ExtensionManager"),
        ExtensionManagerView      = require("extensibility/ExtensionManagerView").ExtensionManagerView,
        ExtensionManagerViewModel = require("extensibility/ExtensionManagerViewModel"),
        ExtensionManagerDialog    = require("extensibility/ExtensionManagerDialog"),
        InstallExtensionDialog    = require("extensibility/InstallExtensionDialog"),
        Package                   = require("extensibility/Package"),
        ExtensionLoader           = require("utils/ExtensionLoader"),
        SpecRunnerUtils           = require("spec/SpecRunnerUtils"),
        NativeApp                 = require("utils/NativeApp"),
        Dialogs                   = require("widgets/Dialogs"),
        CommandManager            = require("command/CommandManager"),
        Commands                  = require("command/Commands"),
        FileSystem                = require("filesystem/FileSystem"),
        Strings                   = require("strings"),
        StringUtils               = require("utils/StringUtils"),
        LocalizationUtils         = require("utils/LocalizationUtils"),
        PreferencesManager        = require("preferences/PreferencesManager"),
        mockRegistryText          = require("text!spec/ExtensionManager-test-files/mockRegistry.json"),
        mockRegistryThemesText    = require("text!spec/ExtensionManager-test-files/mockRegistryThemes.json"),
        mockRegistryForSearch     = require("text!spec/ExtensionManager-test-files/mockRegistryForSearch.json"),
        mockExtensionList         = require("text!spec/ExtensionManager-test-files/mockExtensionList.json"),
        mockRegistry;

    describe("ExtensionManager", function () {
        var mockId, mockSettings, origRegistryURL, origExtensionUrl, removedPath,
            view, model, fakeLoadDeferred, modelDisposed, disabledFilePath;

        beforeEach(function () {
            // Use fake URLs for the registry (useful if the registry isn't actually currently
            // configured).
            origRegistryURL = brackets.config.extension_registry;
            origExtensionUrl = brackets.config.extension_url;
            brackets.config.extension_registry = "http://fake-registry.com/registry.json";
            brackets.config.extension_url = "http://fake-repository.com/";

            // Return a canned registry when requested. Individual tests can override this
            // at any point before the request is actually made.
            mockRegistry = JSON.parse(mockRegistryText);
            mockSettings = {
                url: brackets.config.extension_registry,
                dataType: "json",
                contentType: "application/json",
                response: function () {
                    this.responseText = mockRegistry;
                }
            };
            spyOn(mockSettings, "response").and.callThrough();
            mockId = $.mockjax(mockSettings);

            // Set a fake path for user extensions.
            var mockPath = SpecRunnerUtils.getTestPath("/spec/ExtensionManager-test-files");
            spyOn(ExtensionLoader, "getUserExtensionPath").and.callFake(function () {
                return mockPath + "/user";
            });

            // Fake package removal.
            removedPath = null;
            spyOn(Package, "remove").and.callFake(function (path) {
                removedPath = path;
                return new $.Deferred().resolve().promise();
            });

            // Fake enabling/disabling
            disabledFilePath = null;
            spyOn(Package, "disable").and.callFake(function (path) {
                disabledFilePath = path + "/.disabled";
                return new $.Deferred().resolve().promise();
            });
            spyOn(Package, "enable").and.callFake(function (path) {
                disabledFilePath = path + "/.disabled";
                return new $.Deferred().resolve().promise();
            });
        });

        afterEach(function () {
            $.mockjaxClear(mockId);
            ExtensionManager._reset();
            ExtensionManager.off(".unit-test");
            brackets.config.extension_registry = origRegistryURL;
            brackets.config.extension_url = origExtensionUrl;
        });

        async function mockLoadExtensions(names, fail) {
            var numStatusChanges = 0,
                shouldFail = false,
                shouldDisable = false;
            if (typeof fail === "boolean") {
                shouldFail = true;
            } else if (typeof fail === "string") {
                shouldDisable = true;
            }
            ExtensionManager.on("statusChange.mock-load", function () {
                numStatusChanges++;
            });
            var mockPath = window.fsServerUrl + SpecRunnerUtils.getTestPath("/spec/ExtensionManager-test-files");
            names = names || ["default/mock-extension-1", "dev/mock-extension-2", "user/mock-legacy-extension"];
            names.forEach(function (name) {
                ExtensionLoader.trigger(shouldFail ? "loadFailed" : (shouldDisable ? "disabled" : "load"), mockPath + "/" + name);
            });

            // Make sure the ExtensionManager has finished reading all the package.jsons before continuing.
            await awaitsFor(function () { return numStatusChanges === names.length; }, "ExtensionManager status changes");

            ExtensionManager.off(".mock-load");
        }

        function makeMockInstalledVersion(mockRegistryExtension, installedVersion) {
            var ref = _.find(mockRegistryExtension.versions, { version: installedVersion });
            return {
                locationType: ExtensionManager.LOCATION_USER,
                metadata: {
                    name: mockRegistryExtension.metadata.name,
                    title: mockRegistryExtension.metadata.title,
                    version: ref.version,
                    engines: { brackets: ref.brackets }
                },
                owner: mockRegistryExtension.owner
            };
        }

        function makeMockExtension(versionRequirements) {
            var FAKE_DATE = "2013-04-10T18:28:20.530Z",
                versions = [];
            versionRequirements.forEach(function (verReq, i) {
                versions.push({ version: (i + 1) + ".0.0", brackets: verReq, published: FAKE_DATE });
            });
            var latestVer = versions[versions.length - 1];
            return {
                metadata: {
                    name: "mock-extension",
                    title: "Mock Extension",
                    version: latestVer.version,
                    engines: { brackets: latestVer.brackets }
                },
                owner: "github:someuser",
                versions: versions
            };
        }

        function setupExtensionManagerViewTests(context) {
            jasmine.addMatchers({
                toHaveText: function (expected) {
                    var notText = this.isNot ? " not" : "";
                    this.message = function () {
                        return "Expected view" + notText + " to contain text " + expected;
                    };
                    return SpecRunnerUtils.findDOMText(this.actual.$el, expected);
                },
                toHaveLink: function (expected) {
                    var notText = this.isNot ? " not" : "";
                    this.message = function () {
                        return "Expected view" + notText + " to contain link " + expected;
                    };
                    return SpecRunnerUtils.findDOMText(this.actual.$el, expected, true);
                }
            });
            spyOn(InstallExtensionDialog, "installUsingDialog").and.callFake(async function (url) {
                var id = url.match(/fake-repository\.com\/([^\/]+)/)[1];
                await mockLoadExtensions(["user/" + id]);
            });
        }

        function cleanupExtensionManagerViewTests() {
            if (view) {
                view.$el.remove();
                view = null;
            }
            if (model) {
                model.dispose();
            }
        }

        // Sets up the view using the normal (mock) ExtensionManager data.
        async function setupViewWithMockData(ModelClass) {
            view = new ExtensionManagerView();
            model = new ModelClass();
            modelDisposed = false;
            await awaitsForDone(view.initialize(model), "view initializing");
            view.$el.appendTo(window.document.body);
            spyOn(view.model, "dispose").and.callThrough();
        }

        describe("ExtensionManager", function () {
            it("should download the extension list from the registry", async function () {
                await awaitsForDone(ExtensionManager.downloadRegistry(true), "fetching registry");

                expect(mockSettings.response).toHaveBeenCalled();
                Object.keys(ExtensionManager.extensions).forEach(function (id) {
                    expect(ExtensionManager.extensions[id].registryInfo).toEqual(mockRegistry[id]);
                });
            });

            it("should registry update cache registry locally", async function () {
                localStorage.removeItem(ExtensionManager.EXTENSION_REGISTRY_LOCAL_STORAGE_KEY);
                await awaitsForDone(ExtensionManager.downloadRegistry(true), "fetching registry");
                expect(localStorage.getItem(ExtensionManager.EXTENSION_REGISTRY_LOCAL_STORAGE_KEY)).not.toBeNull();
            });

            it("should fail if it can't access the registry", async function () {
                var gotDone = false, gotFail = false;
                $.mockjaxClear(mockId);
                mockId = $.mockjax({
                    url: brackets.config.extension_registry,
                    isTimeout: true
                });
                ExtensionManager.downloadRegistry(true)
                    .done(function () {
                        gotDone = true;
                    })
                    .fail(function () {
                        gotFail = true;
                    });
                await awaitsFor(function () { return gotDone || gotFail; }, "mock failure");

                expect(gotFail).toBe(true);
                expect(gotDone).toBe(false);
            });

            it("should fail if registry content is malformed", async function () {
                var gotDone = false, gotFail = false;
                mockRegistry = "{malformed json";
                ExtensionManager.downloadRegistry(true)
                    .done(function () {
                        gotDone = true;
                    })
                    .fail(function () {
                        gotFail = true;
                    });
                await awaitsFor(function () { return gotDone || gotFail; }, "bad mock data");

                expect(gotFail).toBe(true);
                expect(gotDone).toBe(false);
            });

            it("should correctly list which extensions are installed", async function () {
                await awaitsForDone(ExtensionManager.downloadRegistry(true), "loading registry");
                await mockLoadExtensions();
                Object.keys(mockRegistry).forEach(function (extId) {
                    if (extId === "mock-extension-1" || extId === "mock-extension-2") {
                        expect(ExtensionManager.extensions[extId].installInfo.status).toEqual(ExtensionManager.ENABLED);
                    } else {
                        expect(ExtensionManager.extensions[extId].installInfo).toBeUndefined();
                    }
                });
            });

            it("should list an extension that is installed but failed to load", async function () {
                await awaitsForDone(ExtensionManager.downloadRegistry(true), "loading registry");
                await mockLoadExtensions(["user/mock-extension-3"], true);
                expect(ExtensionManager.extensions["mock-extension-3"].installInfo.status).toEqual(ExtensionManager.START_FAILED);
            });

            it("should list an extension that is installed but disabled", async function () {
                await awaitsForDone(ExtensionManager.downloadRegistry(true), "loading registry");
                await mockLoadExtensions(["user/mock-extension-3"], "disabled");
                expect(ExtensionManager.extensions["mock-extension-3"].installInfo.status).toEqual(ExtensionManager.DISABLED);
            });

            it("should set the title for a legacy extension based on its folder name", async function () {
                await mockLoadExtensions();
                expect(ExtensionManager.extensions["mock-legacy-extension"].installInfo.metadata.title).toEqual("mock-legacy-extension");
            });

            it("should determine the location type for installed extensions", async function () {
                await mockLoadExtensions();
                expect(ExtensionManager.extensions["mock-extension-1"].installInfo.locationType).toEqual(ExtensionManager.LOCATION_DEFAULT);
                expect(ExtensionManager.extensions["mock-extension-2"].installInfo.locationType).toEqual(ExtensionManager.LOCATION_DEV);
                expect(ExtensionManager.extensions["mock-legacy-extension"].installInfo.locationType).toEqual(ExtensionManager.LOCATION_USER);
            });

            it("should raise a statusChange event when an extension is loaded", async function () {
                var spy = jasmine.createSpy();
                ExtensionManager.on("statusChange.unit-test", spy);
                await mockLoadExtensions(["default/mock-extension-1"]);
                expect(spy).toHaveBeenCalledWith(jasmine.any(Object), "mock-extension-1");
            });

            it("should raise a statusChange event when a legacy extension is loaded, with its path as the id", async function () {
                var spy = jasmine.createSpy();
                ExtensionManager.on("statusChange.unit-test", spy);
                await mockLoadExtensions(["user/mock-legacy-extension"]);
                expect(spy).toHaveBeenCalledWith(jasmine.any(Object), "mock-legacy-extension");
            });

            it("should remove an extension and raise a statusChange event", async function () {
                var spy = jasmine.createSpy();
                await mockLoadExtensions(["user/mock-extension-3"]);
                ExtensionManager.on("statusChange.unit-test", spy);
                await awaitsForDone(ExtensionManager.remove("mock-extension-3"));
                var mockPath = window.fsServerUrl + SpecRunnerUtils.getTestPath("/spec/ExtensionManager-test-files");
                expect(removedPath).toBe(mockPath + "/user/mock-extension-3");
                expect(spy).toHaveBeenCalledWith(jasmine.any(Object), "mock-extension-3");
                expect(ExtensionManager.extensions["mock-extension-3"].installInfo).toBeFalsy();
            });

            it("should disable an extension and raise a statusChange event", async function () {
                var spy = jasmine.createSpy();
                await mockLoadExtensions(["user/mock-extension-3"]);
                ExtensionManager.on("statusChange.unit-test", spy);
                await awaitsForDone(ExtensionManager.disable("mock-extension-3"));
                var mockPath = window.fsServerUrl + SpecRunnerUtils.getTestPath("/spec/ExtensionManager-test-files");
                expect(disabledFilePath).toBe(mockPath + "/user/mock-extension-3" + "/.disabled");
                expect(spy).toHaveBeenCalledWith(jasmine.any(Object), "mock-extension-3");
                expect(ExtensionManager.extensions["mock-extension-3"].installInfo.status).toEqual(ExtensionManager.DISABLED);
            });

            it("should enable an extension and raise a statusChange event", async function () {
                var spy = jasmine.createSpy();
                await mockLoadExtensions(["user/mock-extension-2"], "disable");
                ExtensionManager.on("statusChange.unit-test", spy);
                await awaitsForDone(ExtensionManager.enable("mock-extension-2"));
                var mockPath = window.fsServerUrl + SpecRunnerUtils.getTestPath("/spec/ExtensionManager-test-files");
                expect(disabledFilePath).toBe(mockPath + "/user/mock-extension-2" + "/.disabled");
                expect(spy).toHaveBeenCalledWith(jasmine.any(Object), "mock-extension-2");
                expect(ExtensionManager.extensions["mock-extension-2"].installInfo.status).toEqual(ExtensionManager.ENABLED);
            });

            it("should fail when trying to remove an extension that's not installed", async function () {
                var finished = false;
                ExtensionManager.remove("mock-extension-3")
                    .done(function () {
                        finished = true;
                        expect("tried to remove a nonexistent extension").toBe(false);
                    })
                    .fail(function () {
                        finished = true;
                    });
                await awaitsFor(function () { return finished; }, "finish removal");
            });

            it("should fail when trying to disable an extension that's not installed", async function () {
                var finished = false;
                ExtensionManager.disable("mock-extension-3")
                    .done(function () {
                        finished = true;
                        expect("tried to disable a nonexistent extension").toBe(false);
                    })
                    .fail(function () {
                        finished = true;
                    });
                await awaitsFor(function () { return finished; }, "finish disabling");
            });

            it("should fail when trying to enable an extension that's not installed", async function () {
                var finished = false;
                ExtensionManager.enable("mock-extension-3")
                    .done(function () {
                        finished = true;
                        expect("tried to enable a nonexistent extension").toBe(false);
                    })
                    .fail(function () {
                        finished = true;
                    });
                await awaitsFor(function () { return finished; }, "finish enabling");
            });

            it("should calculate compatibility info for installed extensions", function () {
                function fakeEntry(version) {
                    return { metadata: { engines: { brackets: version } } };
                }

                // Missing version requirement data
                expect(ExtensionManager.getCompatibilityInfo({ metadata: {} }, "1.0.0"))
                    .toEql({isCompatible: true, isLatestVersion: true});
                expect(ExtensionManager.getCompatibilityInfo(fakeEntry(null), "1.0.0"))
                    .toEql({isCompatible: true, isLatestVersion: true});

                // With version requirement data
                expect(ExtensionManager.getCompatibilityInfo(fakeEntry(">0.5.0"), "0.6.0"))
                    .toEql({isCompatible: true, isLatestVersion: true});
                expect(ExtensionManager.getCompatibilityInfo(fakeEntry(">0.6.0"), "0.6.0"))
                    .toEql({isCompatible: false, requiresNewer: true});
                expect(ExtensionManager.getCompatibilityInfo(fakeEntry(">0.7.0"), "0.6.0"))
                    .toEql({isCompatible: false, requiresNewer: true});
                expect(ExtensionManager.getCompatibilityInfo(fakeEntry("<0.5.0"), "0.4.0"))
                    .toEql({isCompatible: true, isLatestVersion: true});
                expect(ExtensionManager.getCompatibilityInfo(fakeEntry("<0.4.0"), "0.4.0"))
                    .toEql({isCompatible: false, requiresNewer: false});
                expect(ExtensionManager.getCompatibilityInfo(fakeEntry("<0.3.0"), "0.4.0"))
                    .toEql({isCompatible: false, requiresNewer: false});
                expect(ExtensionManager.getCompatibilityInfo(fakeEntry("~1.2"), "1.2.0"))
                    .toEql({isCompatible: true, isLatestVersion: true});
                expect(ExtensionManager.getCompatibilityInfo(fakeEntry("~1.2"), "1.2.1"))
                    .toEql({isCompatible: true, isLatestVersion: true});
                expect(ExtensionManager.getCompatibilityInfo(fakeEntry("~1.2"), "1.3.0"))
                    .toEql({isCompatible: false, requiresNewer: false});
                expect(ExtensionManager.getCompatibilityInfo(fakeEntry("~1.2"), "1.3.1"))
                    .toEql({isCompatible: false, requiresNewer: false});
                expect(ExtensionManager.getCompatibilityInfo(fakeEntry("~1.2"), "1.1.0"))
                    .toEql({isCompatible: false, requiresNewer: true});
            });

            it("should calculate compatibility info for registry extensions", function () {
                // Use the fakeEntry name for consistency with the tests above
                var fakeEntry = makeMockExtension;

                var curVer = "0.33.0";
                expect(ExtensionManager.getCompatibilityInfo(fakeEntry([">=0.24"]), curVer))
                    .toEqual({isCompatible: true, compatibleVersion: "1.0.0", isLatestVersion: true});
                expect(ExtensionManager.getCompatibilityInfo(fakeEntry([">=0.24", ">=0.33"]), curVer))
                    .toEqual({isCompatible: true, compatibleVersion: "2.0.0", isLatestVersion: true});
                expect(ExtensionManager.getCompatibilityInfo(fakeEntry(["<=0.24", "<=0.29", ">=0.30"]), curVer))
                    .toEqual({isCompatible: true, compatibleVersion: "3.0.0", isLatestVersion: true});
                expect(ExtensionManager.getCompatibilityInfo(fakeEntry([">=0.40", ">=0.50", ">=0.30"]), curVer))
                    .toEqual({isCompatible: true, compatibleVersion: "3.0.0", isLatestVersion: true});
                expect(ExtensionManager.getCompatibilityInfo(fakeEntry(["<=0.29", "<=0.29"]), curVer))
                    .toEqual({isCompatible: false, requiresNewer: false});
                expect(ExtensionManager.getCompatibilityInfo(fakeEntry([">=0.40", ">=0.50"]), curVer))
                    .toEqual({isCompatible: false, requiresNewer: true});
                expect(ExtensionManager.getCompatibilityInfo(fakeEntry([">=0.15", ">=0.17", "<=0.20"]), curVer))
                    .toEqual({isCompatible: true, compatibleVersion: "2.0.0", isLatestVersion: false, requiresNewer: false});
                expect(ExtensionManager.getCompatibilityInfo(fakeEntry([">=0.24", ">=0.29", ">=0.50"]), curVer))
                    .toEqual({isCompatible: true, compatibleVersion: "2.0.0", isLatestVersion: false, requiresNewer: true});
                expect(ExtensionManager.getCompatibilityInfo(fakeEntry(["<=0.20", ">=0.30", ">=0.50"]), curVer))
                    .toEqual({isCompatible: true, compatibleVersion: "2.0.0", isLatestVersion: false, requiresNewer: true});
                expect(ExtensionManager.getCompatibilityInfo(fakeEntry([">=0.50", ">=0.30", "<=0.20"]), curVer))
                    .toEqual({isCompatible: true, compatibleVersion: "2.0.0", isLatestVersion: false, requiresNewer: false});
                expect(ExtensionManager.getCompatibilityInfo(fakeEntry([">=0.25", "<=0.40", ">=0.40", "<=0.40", ">=0.42"]), curVer))
                    .toEqual({isCompatible: true, compatibleVersion: "4.0.0", isLatestVersion: false, requiresNewer: true});
                expect(ExtensionManager.getCompatibilityInfo(fakeEntry([">=0.25", "<=0.30", ">=0.30", "<=0.40", ">=0.32"]), curVer))
                    .toEqual({isCompatible: true, compatibleVersion: "5.0.0", isLatestVersion: true});
                expect(ExtensionManager.getCompatibilityInfo(fakeEntry([">=0.25", ">=0.26", ">=0.30", ">=0.32", ">=0.40", ">=0.50"]), curVer))
                    .toEqual({isCompatible: true, compatibleVersion: "4.0.0", isLatestVersion: false, requiresNewer: true});
            });

            it("should return the correct download URL for an extension", function () {
                expect(ExtensionManager.getExtensionURL("my-cool-extension", "1.2.3"))
                    .toBe("http://fake-repository.com/my-cool-extension-1.2.3.zip");
            });
        });

        describe("ExtensionManagerView Model", function () {
            describe("when initialized from registry", function () {
                var model;

                beforeEach(async function () {
                    localStorage.removeItem(ExtensionManager.EXTENSION_REGISTRY_LOCAL_STORAGE_KEY);
                    mockRegistry = JSON.parse(mockRegistryForSearch);
                    model = new ExtensionManagerViewModel.RegistryViewModel();
                    await awaitsForDone(model.initialize(), "model initialization");
                    await mockLoadExtensions();
                });

                afterEach(function () {
                    model.dispose();
                    model = null;
                });

                it("should initialize itself from the extension list", function () {
                    expect(model.extensions).toEqual(ExtensionManager.extensions);
                });

                it("should start with the full set sorted in reverse download count order", function () {
                    PreferencesManager.set("extensions.sort", "downloadCount");
                    model._setSortedExtensionList(ExtensionManager.extensions, false);
                    expect(model.filterSet).toEqual(["item-6", "item-4", "item-3", "find-uniq1-in-name", "item-2", "item-5"]);
                });

                it("should start with the full set sorted in reverse publish date order", function () {
                    PreferencesManager.set("extensions.sort", "publishedDate");
                    model._setSortedExtensionList(ExtensionManager.extensions, false);
                    expect(model.filterSet).toEqual(["item-5", "item-6", "item-2", "find-uniq1-in-name", "item-4", "item-3"]);
                });

                it("should search case-insensitively for a keyword in the metadata for a given list of registry ids", function () {
                    model.filter("uniq1");
                    expect(model.filterSet).toEqual(["find-uniq1-in-name"]);
                    model.filter("uniq2");
                    expect(model.filterSet).toEqual(["item-2"]);
                    model.filter("uniq3");
                    expect(model.filterSet).toEqual(["item-3"]);
                    model.filter("uniq4");
                    expect(model.filterSet).toEqual(["item-4"]);
                    model.filter("uniq5");
                    expect(model.filterSet).toEqual(["item-5"]);
                    model.filter("uniq6");
                    expect(model.filterSet).toEqual(["item-6"]);
                    model.filter("uniqin1and5");
                    expect(model.filterSet).toEqual(["item-5", "find-uniq1-in-name"]); // sorted in reverse publish date order
                });

                it("should 'AND' space-separated search terms", function () {
                    model.filter("UNIQ2 in author name");
                    expect(model.filterSet).toEqual(["item-2"]);
                    model.filter("UNIQ2 name");
                    expect(model.filterSet).toEqual(["item-2"]);
                    model.filter("UNIQ2 name author");
                    expect(model.filterSet).toEqual(["item-2"]);
                    model.filter("UNIQ2 uniq3");
                    expect(model.filterSet).toEqual([]);
                });

                it("should return correct results when subsequent queries are longer versions of previous queries", function () {
                    model.filter("uniqin1and5");
                    model.filter("uniqin1and5-2");
                    expect(model.filterSet).toEqual(["item-5"]);
                });

                it("should go back to the full sorted set when cleared", function () {
                    model.filter("uniq1");
                    model.filter("");
                    expect(model.filterSet).toEqual(["item-5", "item-6", "item-2", "find-uniq1-in-name", "item-4", "item-3"]);
                });

                it("longer versions of previous queries, and not, should also work with spaces", function () {
                    model.filter("name");
                    expect(model.filterSet).toEqual(["item-2", "find-uniq1-in-name"]);
                    model.filter("name uniq");
                    expect(model.filterSet).toEqual(["item-2", "find-uniq1-in-name"]);
                    model.filter("name uniq2");
                    expect(model.filterSet).toEqual(["item-2"]);
                    model.filter("name uniq");
                    expect(model.filterSet).toEqual(["item-2", "find-uniq1-in-name"]);
                    model.filter("name");
                    expect(model.filterSet).toEqual(["item-2", "find-uniq1-in-name"]);
                });

                it("should trigger filter event when filter changes", function () {
                    var gotEvent = false;
                    model.on("filter", function () {
                        gotEvent = true;
                    });
                    model.filter("uniq1");
                    expect(gotEvent).toBe(true);
                });
            });


            describe("when initialized themes from registry", function () {
                var model;

                beforeEach(async function () {
                    localStorage.removeItem(ExtensionManager.EXTENSION_REGISTRY_LOCAL_STORAGE_KEY);
                    mockRegistry = JSON.parse(mockRegistryThemesText);
                    model = new ExtensionManagerViewModel.ThemesViewModel();
                    await awaitsForDone(model.initialize(), "model initialization");
                    await mockLoadExtensions();
                });

                afterEach(function () {
                    model.dispose();
                    model = null;
                });

                it("should initialize itself from the extension list", function () {
                    expect(model.extensions).toEqual(ExtensionManager.extensions);
                });

                it("should start with the full set sorted in reverse publish date order", function () {
                    expect(model.filterSet).toEqual(["theme-1", "theme-2"]);
                });

                it("should start with the full set sorted in reverse download count order", function () {
                    PreferencesManager.set("extensions.sort", "downloadCount");
                    model._setSortedExtensionList(ExtensionManager.extensions, true);
                    expect(model.filterSet).toEqual(["theme-2", "theme-1"]);
                });
            });


            describe("when initialized from local extension list", function () {
                var model, origExtensions;

                beforeEach(async function () {
                    origExtensions = ExtensionManager.extensions;
                    ExtensionManager._setExtensions(JSON.parse(mockExtensionList));
                    model = new ExtensionManagerViewModel.InstalledViewModel();
                    await awaitsForDone(model.initialize());
                });

                afterEach(function () {
                    model.dispose();
                    model = null;
                    ExtensionManager._setExtensions(origExtensions);
                });

                it("should initialize itself from the extension list", function () {
                    expect(model.extensions).toEqual(ExtensionManager.extensions);
                });

                it("should only contain dev and user extensions, sorted case-insensitively on the extension title or name (or last segment of path name for legacy extensions)", function () {
                    expect(model.filterSet).toEqual(["registered-extension", "dev-extension", "/path/to/extensions/user/legacy-extension", "unregistered-extension", "Z-capital-extension"]);
                });

                it("should include a newly-installed extension", async function () {
                    await mockLoadExtensions(["user/install-later-extension"]);
                    expect(model.filterSet.indexOf("install-later-extension")).toBe(2);
                });

                it("should include a newly-installed disabled extension", async function () {
                    await mockLoadExtensions(["user/another-great-extension"], "disabled");
                    expect(model.filterSet.indexOf("another-great-extension")).toBe(1);
                });

                it("should raise an event when an extension is installed", async function () {
                    var calledId;
                    model.on("change", function (e, id) {
                        calledId = id;
                    });
                    await mockLoadExtensions(["user/install-later-extension"]);
                    expect(calledId).toBe("install-later-extension");
                });

                it("should raise an event when an extension is disabled", async function () {
                    var calledId;
                    model.on("change", function (e, id) {
                        calledId = id;
                    });
                    await mockLoadExtensions(["user/another-great-extension"], "disabled");
                    expect(calledId).toBe("another-great-extension");
                });

                it("should not include a removed extension", async function () {
                    await awaitsForDone(ExtensionManager.remove("registered-extension"));
                    expect(model.filterSet.indexOf("registered-extension")).toBe(-1);
                });

                it("should raise an event when an extension is removed", async function () {
                    var calledId;
                    model.on("change", function (e, id) {
                        calledId = id;
                    });
                    await awaitsForDone(ExtensionManager.remove("registered-extension"));
                    expect(calledId).toBe("registered-extension");
                });

                it("should mark an extension for removal and raise an event without actually removing it", async function () {
                    var id = "registered-extension", calledId;
                    model.on("change", function (e, id) {
                        calledId = id;
                    });
                    ExtensionManager.markForRemoval(id, true);
                    expect(calledId).toBe(id);
                    expect(ExtensionManager.isMarkedForRemoval(id)).toBe(true);
                    expect(model.filterSet.indexOf(id)).not.toBe(-1);
                    expect(ExtensionManager.hasExtensionsToRemove()).toBe(true);
                });

                it("should unmark an extension previously marked for removal and raise an event", function () {
                    var id = "registered-extension", calledId;
                    ExtensionManager.markForRemoval(id, true);
                    model.on("change", function (e, id) {
                        calledId = id;
                    });
                    ExtensionManager.markForRemoval(id, false);
                    expect(calledId).toBe(id);
                    expect(ExtensionManager.isMarkedForRemoval(id)).toBe(false);
                    expect(ExtensionManager.hasExtensionsToRemove()).toBe(false);
                });

                it("should remove extensions previously marked for removal", async function () {
                    var removedIds = {}, removedPaths = {};
                    ExtensionManager.markForRemoval("registered-extension", true);
                    ExtensionManager.markForRemoval("Z-capital-extension", false);
                    model.on("change", function (e, id) {
                        removedIds[id] = true;
                        removedPaths[removedPath] = true;
                    });
                    await awaitsForDone(ExtensionManager.removeMarkedExtensions());
                    // Test a removed extension, an extension that was unmarked for removal, and an extension that was never marked.
                    expect(removedIds["registered-extension"]).toBe(true);
                    expect(removedPaths["/path/to/extensions/user/registered-extension"]).toBe(true);
                    expect(removedIds["Z-capital-extension"]).toBeUndefined();
                    expect(removedPaths["/path/to/extensions/user/Z-capital-extension"]).toBeUndefined();
                    expect(removedIds["unregistered-extension"]).toBeUndefined();
                    expect(removedPaths["/path/to/extensions/user/unregistered-extension"]).toBeUndefined();
                });

                it("should mark an extension for disabling and raise an event", async function () {
                    var id = "registered-extension", calledId;
                    model.on("change", function (e, id) {
                        calledId = id;
                    });
                    ExtensionManager.markForDisabling(id, true);
                    expect(calledId).toBe(id);
                    expect(ExtensionManager.isMarkedForDisabling(id)).toBe(true);
                    expect(model.filterSet.indexOf(id)).not.toBe(-1);
                    expect(ExtensionManager.hasExtensionsToDisable()).toBe(true);
                });

                it("should unmark an extension previously marked for disabling and raise an event", async function () {
                    var id = "registered-extension", calledId;
                    ExtensionManager.markForDisabling(id, true);
                    model.on("change", function (e, id) {
                        calledId = id;
                    });
                    ExtensionManager.markForDisabling(id, false);
                    expect(calledId).toBe(id);
                    expect(ExtensionManager.isMarkedForRemoval(id)).toBe(false);
                    expect(ExtensionManager.hasExtensionsToRemove()).toBe(false);
                });

                it("should disable extensions previously marked for disabling and not remove them from the model", async function () {
                    var disabledIds = {}, disabledPaths = {};
                    ExtensionManager.markForDisabling("registered-extension", true);
                    ExtensionManager.markForDisabling("Z-capital-extension", false);
                    model.on("change", function (e, id) {
                        disabledIds[id] = true;
                        disabledPaths[disabledFilePath] = true;
                    });
                    await awaitsForDone(ExtensionManager.disableMarkedExtensions());
                    // Test the enabled extension, the extension that was unmarked for disabling, and an extension that was never marked.
                    expect(disabledIds["registered-extension"]).toBe(true);
                    expect(disabledPaths["/path/to/extensions/user/registered-extension/.disabled"]).toBe(true);
                    expect(model.filterSet.indexOf("registered-extension")).toBe(0);
                    expect(disabledIds["Z-capital-extension"]).toBeUndefined();
                    expect(disabledPaths["/path/to/extensions/user/Z-capital-extension/.disabled"]).toBeUndefined();
                    expect(disabledIds["unregistered-extension"]).toBeUndefined();
                    expect(disabledPaths["/path/to/extensions/user/unregistered-extension/.disabled"]).toBeUndefined();
                });

                it("should delete the .disabled file, enable the extension and raise an event", async function () {
                    var extension = "registered-extension",
                        calledId;
                    await mockLoadExtensions(["registered-extension"], "disabled");
                    model.on("change", function (e, id) {
                        calledId = id;
                    });
                    await awaitsForDone(ExtensionManager.enable(extension));
                    expect(calledId).toBe(extension);
                });

                it("should mark an extension for update and raise an event", async function () {
                    var id = "registered-extension", calledId;
                    model.on("change", function (e, id) {
                        calledId = id;
                    });
                    ExtensionManager.updateFromDownload({
                        localPath: "/path/to/downloaded/file.zip",
                        name: id,
                        installationStatus: "NEEDS_UPDATE"
                    });
                    expect(calledId).toBe(id);
                    expect(ExtensionManager.isMarkedForUpdate(id)).toBe(true);
                    expect(ExtensionManager.hasExtensionsToUpdate()).toBe(true);
                });

                it("should unmark an extension for update, deleting the package and raising an event", async function () {
                    var id = "registered-extension",
                        filename = "/path/to/downloaded/file.zip",
                        file = FileSystem.getFileForPath(filename),
                        calledId;
                    model.on("change", function (e, id) {
                        calledId = id;
                    });
                    ExtensionManager.updateFromDownload({
                        localPath: filename,
                        name: id,
                        installationStatus: "NEEDS_UPDATE"
                    });
                    calledId = null;
                    spyOn(file, "unlink");
                    ExtensionManager.removeUpdate(id);
                    expect(calledId).toBe(id);
                    expect(file.unlink).toHaveBeenCalled();
                    expect(ExtensionManager.isMarkedForUpdate()).toBe(false);
                });

                it("should change an extension marked for removal to update raise an event", async function () {
                    var id = "registered-extension", calledId;
                    model.on("change", function (e, id) {
                        calledId = id;
                    });
                    ExtensionManager.markForRemoval(id, true);
                    expect(calledId).toBe(id);
                    calledId = null;
                    ExtensionManager.updateFromDownload({
                        localPath: "/path/to/downloaded/file.zip",
                        name: id,
                        installationStatus: "NEEDS_UPDATE"
                    });
                    expect(calledId).toBe(id);
                    expect(ExtensionManager.isMarkedForRemoval()).toBe(false);
                    expect(ExtensionManager.hasExtensionsToRemove()).toBe(false);
                    expect(ExtensionManager.isMarkedForUpdate(id)).toBe(true);
                    expect(ExtensionManager.hasExtensionsToUpdate()).toBe(true);
                });

                it("should update extensions marked for update", async function () {
                    var id = "registered-extension",
                        filename = "/path/to/downloaded/file.zip",
                        file = FileSystem.getFileForPath("/path/to/downloaded/file.zip");
                    ExtensionManager.updateFromDownload({
                        localPath: filename,
                        name: id,
                        installationStatus: "NEEDS_UPDATE"
                    });
                    expect(ExtensionManager.isMarkedForUpdate()).toBe(false);
                    spyOn(file, "unlink");
                    var d = $.Deferred();
                    spyOn(Package, "installUpdate").and.returnValue(d.promise());
                    d.resolve();
                    await awaitsForDone(ExtensionManager.updateExtensions());
                    expect(file.unlink).toHaveBeenCalled();
                    expect(Package.installUpdate).toHaveBeenCalledWith(filename, id);
                });

                it("should recognize when an update is available", function () {
                    var id = "registered-extension";
                    console.log(model.extensions[id]);
                    expect(model._getEntry(id).updateAvailable).toBe(true);
                });
            });
        });

        describe("Local File Install", function () {
            var didReload;

            function clickOk() {
                var $okBtn = $(".install-extension-dialog.instance .dialog-button[data-button-id='ok']");
                $okBtn.click();
            }

            beforeEach(function () {
                // Mock reloading the app so we don't actually reload :)
                didReload = false;
                spyOn(CommandManager, "execute").and.callFake(function (id) {
                    if (id === Commands.APP_RELOAD) {
                        didReload = true;
                    } else {
                        CommandManager.execute.apply(this, arguments);
                    }
                });
            });

            it("should set flag to keep local files for new installs", async function () {
                var filename = "/path/to/downloaded/file.zip",
                    file = FileSystem.getFileForPath(filename),
                    result;

                spyOn(file, "unlink");

                // Mock install
                var d = $.Deferred().resolve({});
                spyOn(Package, "installFromPath").and.returnValue(d.promise());

                var promise = InstallExtensionDialog.installUsingDialog(file);
                promise.done(function (_result) {
                    result = _result;
                });

                clickOk();
                await awaitsForDone(promise);

                expect(Package.installFromPath).toHaveBeenCalledWith(filename);
                expect(result.keepFile).toBe(true);
                expect(file.unlink).not.toHaveBeenCalled();
            });

            it("should set flag to keep local files for updates", async function () {
                var id = "mock-extension",
                    filename = "/path/to/downloaded/file.zip",
                    file = FileSystem.getFileForPath(filename),
                    result,
                    dialogDeferred = new $.Deferred(),
                    $mockDlg,
                    didClose;

                // Mock update
                var installResult = {
                    installationStatus: Package.InstallationStatuses.NEEDS_UPDATE,
                    name: id,
                    localPath: filename
                };

                // Mock dialog
                spyOn(Dialogs, "showModalDialog").and.callFake(function () {
                    $mockDlg = $("<div/>");
                    didClose = false;

                    return {
                        getElement: function () { return $mockDlg; },
                        close: function () { didClose = true; }
                    };
                });

                spyOn(file, "unlink");

                // Mock installs to avoid calling into node ExtensionManagerDomain
                spyOn(Package, "installFromPath").and.callFake(function () {
                    return new $.Deferred().resolve(installResult).promise();
                });
                spyOn(Package, "installUpdate").and.callFake(function () {
                    return new $.Deferred().resolve(installResult).promise();
                });

                // Mimic drag and drop
                InstallExtensionDialog.updateUsingDialog(file)
                    .done(function (_result) {
                        result = _result;

                        // Mark for update
                        ExtensionManager.updateFromDownload(result);

                        dialogDeferred.resolve();
                    })
                    .fail(dialogDeferred.reject);

                clickOk();
                await awaitsForDone(dialogDeferred.promise(), "InstallExtensionDialog.updateUsingDialog");

                // InstallExtensionDialog should set keepFile=true
                expect(result.keepFile).toBe(true);

                // Run update, creates dialog DIALOG_ID_CHANGE_EXTENSIONS
                ExtensionManagerDialog._performChanges();
                $mockDlg.triggerHandler("buttonClick", Dialogs.DIALOG_BTN_OK);

                await awaitsFor(function () {
                    return didClose;
                }, "DIALOG_ID_CHANGE_EXTENSIONS closed");

                expect(file.unlink).not.toHaveBeenCalled();
                expect(didReload).toBe(true);
            });

        });

        // todo all localisation tests when we modernize in Pheonix
    });
});
