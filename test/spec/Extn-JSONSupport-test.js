/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
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

/*global describe, it, expect, beforeEach, afterEach, awaitsFor, jasmine */

define(function (require, exports, module) {


    const SpecRunnerUtils = require("spec/SpecRunnerUtils"),
        CodeInspection = require("language/CodeInspection"),
        NpmRegistry = require("extensionsIntegrated/JSONSupport/NpmRegistry"),
        NpmHints = require("extensionsIntegrated/JSONSupport/NpmHints"),
        NpmHover = require("extensionsIntegrated/JSONSupport/NpmHover"),
        VulnerabilityInspection = require("extensionsIntegrated/JSONSupport/VulnerabilityInspection");

    describe("unit:JSONSupport npm intelligence", function () {

        describe("VulnerabilityInspection._findDependencyRanges", function () {
            const find = VulnerabilityInspection._findDependencyRanges;

            it("should locate entries in dependencies and devDependencies", function () {
                const text = '{\n' +
                    '    "dependencies": {\n' +
                    '        "lodash": "^4.17.19",\n' +
                    '        "express": "~4.18.0"\n' +
                    '    },\n' +
                    '    "devDependencies": {\n' +
                    '        "jasmine": "5.0.0"\n' +
                    '    }\n' +
                    '}\n';
                const entries = find(text);
                expect(entries.length).toBe(3);
                expect(entries[0]).toEqual(jasmine.objectContaining({
                    name: "lodash", range: "^4.17.19", section: "dependencies"
                }));
                expect(entries[0].pos).toEqual({ line: 2, ch: 8 });
                expect(entries[0].endPos).toEqual({ line: 2, ch: 28 });
                expect(entries[2]).toEqual(jasmine.objectContaining({
                    name: "jasmine", range: "5.0.0", section: "devDependencies"
                }));
            });

            it("should handle the same package in two sections and scoped names", function () {
                const text = '{"dependencies": {"@types/node": "^20.0.0", "a": "1.0.0"},' +
                    ' "peerDependencies": {"a": "2.0.0"}}';
                const entries = find(text);
                expect(entries.length).toBe(3);
                expect(entries[0].name).toBe("@types/node");
                expect(entries[1].pos.line).toBe(0);    // single-line JSON maps to line 0
                expect(entries[2]).toEqual(jasmine.objectContaining({
                    name: "a", range: "2.0.0", section: "peerDependencies"
                }));
            });

            it("should not scan outside the dependency sections or crash on missing ones", function () {
                const text = '{"scripts": {"build": "tsc"}, "dependencies": {"x": "1.0.0"}}';
                const entries = find(text);
                expect(entries.length).toBe(1);
                expect(entries[0].name).toBe("x");
                expect(find('{"name": "no-deps"}').length).toBe(0);
            });

            it("should skip past escaped quotes inside strings while brace matching", function () {
                const text = '{"dependencies": {"weird\\"pkg": "1.0.0", "ok": "2.0.0"}}';
                const entries = find(text);
                expect(entries.length).toBe(2);
                expect(entries[1].name).toBe("ok");
            });
        });

        describe("VulnerabilityInspection severity mapping and error building", function () {
            it("should map severities to CodeInspection types", function () {
                expect(VulnerabilityInspection._severityToType("critical")).toBe(CodeInspection.Type.ERROR);
                expect(VulnerabilityInspection._severityToType("high")).toBe(CodeInspection.Type.ERROR);
                expect(VulnerabilityInspection._severityToType("moderate")).toBe(CodeInspection.Type.WARNING);
                expect(VulnerabilityInspection._severityToType("low")).toBe(CodeInspection.Type.META);
            });

            it("should dedup advisories by id, sort by severity and cap the count", function () {
                const entry = { name: "p", pos: { line: 1, ch: 0 }, endPos: { line: 1, ch: 10 } };
                const advisories = [
                    { id: 1, title: "low one", severity: "low" },
                    { id: 2, title: "crit", severity: "critical" },
                    { id: 2, title: "crit dup", severity: "critical" },
                    { id: 3, title: "mod", severity: "moderate" },
                    { id: 4, title: "high", severity: "high" },
                    { id: 5, title: "low two", severity: "low" }
                ];
                const errors = VulnerabilityInspection._errorsForEntry(entry, "1.0.0", advisories);
                expect(errors.length).toBe(3);      // capped
                expect(errors[0].message).toContain("crit");
                expect(errors[0].message).toContain("p@1.0.0");
                expect(errors[1].message).toContain("high");
                expect(errors[2].message).toContain("mod");
                expect(errors[0].pos).toEqual(entry.pos);
                expect(errors[0].endPos).toEqual(entry.endPos);
            });
        });

        describe("NpmHover npm page url", function () {
            it("should link the declared version's doc page when the range anchors one", function () {
                expect(NpmHover._npmPageUrl("vite", "^5.4.11"))
                    .toBe("https://www.npmjs.com/package/vite/v/5.4.11");
                expect(NpmHover._npmPageUrl("vite", "~7.2.3"))
                    .toBe("https://www.npmjs.com/package/vite/v/7.2.3");
                expect(NpmHover._npmPageUrl("vite", "7.2.3"))
                    .toBe("https://www.npmjs.com/package/vite/v/7.2.3");
                expect(NpmHover._npmPageUrl("@types/node", ">=20.1.0"))
                    .toBe("https://www.npmjs.com/package/@types/node/v/20.1.0");
            });

            it("should fall back to the package page for anchorless ranges", function () {
                expect(NpmHover._npmPageUrl("vite", "*")).toBe("https://www.npmjs.com/package/vite");
                expect(NpmHover._npmPageUrl("vite", "")).toBe("https://www.npmjs.com/package/vite");
                expect(NpmHover._npmPageUrl("vite", "latest")).toBe("https://www.npmjs.com/package/vite");
            });
        });

        describe("NpmRegistry with injected fetcher", function () {
            let fetchCalls;

            function fakeFetcher(responder) {
                fetchCalls = [];
                NpmRegistry._setFetcherForTests(function (url, options) {
                    fetchCalls.push({ url: url, options: options || {} });
                    return Promise.resolve(responder(url, options));
                });
            }

            afterEach(function () {
                // restore a fetcher that fails loudly if any spec forgets to inject
                NpmRegistry._setFetcherForTests(function () {
                    return Promise.reject(new Error("no fetcher injected"));
                });
            });

            it("should map search results and serve repeats from cache", async function () {
                fakeFetcher(function () {
                    return { objects: [
                        { package: { name: "lodash", version: "4.18.1", description: "utils" } },
                        { package: { name: "lodash-es", version: "4.18.1" } }
                    ] };
                });
                const first = await NpmRegistry.searchPackages("loda");
                expect(first.length).toBe(2);
                expect(first[0]).toEqual({ name: "lodash", version: "4.18.1", description: "utils" });
                expect(first[1].description).toBe("");
                expect(fetchCalls[0].url).toContain("search?text=loda&size=");

                await NpmRegistry.searchPackages("loda");
                expect(fetchCalls.length).toBe(1);      // cached
            });

            it("should fetch abbreviated version docs and encode scoped names", async function () {
                fakeFetcher(function () {
                    return { "dist-tags": { latest: "20.1.0" }, versions: { "20.0.0": {}, "20.1.0": {} } };
                });
                const info = await NpmRegistry.getVersions("@types/node");
                expect(info.latest).toBe("20.1.0");
                expect(info.versions).toEqual(["20.0.0", "20.1.0"]);
                expect(fetchCalls[0].url).toBe("https://registry.npmjs.org/@types%2Fnode");
                expect(fetchCalls[0].options.headers.Accept).toBe("application/vnd.npm.install-v1+json");
            });

            it("should build the bulk advisory body, cache results and negative results", async function () {
                fakeFetcher(function () {
                    return { lodash: [{ id: 9, title: "bad", severity: "high" }] };
                });
                const pairs = [
                    { name: "lodash", version: "4.17.19" },
                    { name: "safe-pkg", version: "1.0.0" }
                ];
                const result = await NpmRegistry.getAdvisoriesBulk(pairs);
                expect(result.lodash.length).toBe(1);
                expect(result["safe-pkg"]).toBeUndefined();
                expect(JSON.parse(fetchCalls[0].options.body)).toEqual({
                    lodash: ["4.17.19"], "safe-pkg": ["1.0.0"]
                });

                const again = await NpmRegistry.getAdvisoriesBulk(pairs);
                expect(fetchCalls.length).toBe(1);      // both hits AND misses cached
                expect(again.lodash.length).toBe(1);
            });
        });

        describe("NpmHints context detection", function () {
            let mockEditor, testEditor, testDocument, provider;
            const content = '{\n' +
                '    "name": "fixture",\n' +
                '    "dependencies": {\n' +
                '        "lodash": "^4.17.19"\n' +
                '    }\n' +
                '}\n';

            beforeEach(function () {
                mockEditor = SpecRunnerUtils.createMockEditor(content, "json");
                testEditor = mockEditor.editor;
                testDocument = mockEditor.doc;
                testDocument.file._name = "package.json";
                provider = new NpmHints.NpmHints();
            });

            afterEach(function () {
                testEditor.destroy();
                testDocument = null;
            });

            it("should claim a key inside dependencies (name mode)", function () {
                testEditor.setCursorPos({ line: 3, ch: 11 });   // inside "lodash" key
                expect(provider.hasHints(testEditor, null)).toBe(true);
            });

            it("should claim a value inside dependencies (version mode)", function () {
                testEditor.setCursorPos({ line: 3, ch: 21 });   // inside "^4.17.19" value
                expect(provider.hasHints(testEditor, null)).toBe(true);
            });

            it("should decline top-level keys so schema completion serves them", function () {
                testEditor.setCursorPos({ line: 1, ch: 8 });    // inside "name" key
                expect(provider.hasHints(testEditor, null)).toBe(false);
            });

            it("should decline files that are not package.json", function () {
                testDocument.file._name = "config.json";
                testEditor.setCursorPos({ line: 3, ch: 11 });
                expect(provider.hasHints(testEditor, null)).toBe(false);
            });

            it("should serve version hints newest-first with range shortcuts on top", async function () {
                NpmRegistry._setFetcherForTests(function () {
                    return Promise.resolve({
                        "dist-tags": { latest: "4.18.1" },
                        versions: { "4.17.19": {}, "4.18.1": {}, "4.2.0": {} }
                    });
                });
                testEditor.setCursorPos({ line: 3, ch: 20 });   // just inside the value quote
                expect(provider.hasHints(testEditor, null)).toBe(true);
                const deferred = provider.getHints(null);
                let hintObj = null;
                deferred.done(function (result) { hintObj = result; });
                await awaitsFor(function () { return !!hintObj; }, "version hints to resolve");
                const texts = hintObj.hints.map(function ($item) {
                    return $item.find(".hint-obj").text();
                });
                expect(texts[0]).toBe("^4.18.1");
                expect(texts[1]).toBe("~4.18.1");
                expect(texts.indexOf("4.18.1")).toBeLessThan(texts.indexOf("4.17.19"));
                expect(texts.indexOf("4.17.19")).toBeLessThan(texts.indexOf("4.2.0"));
            });

            async function _versionHintTexts(provider, cursorCh) {
                testEditor.setCursorPos({ line: 3, ch: cursorCh });
                expect(provider.hasHints(testEditor, null)).toBe(true);
                const deferred = provider.getHints(null);
                let hintObj = null;
                deferred.done(function (result) { hintObj = result; });
                await awaitsFor(function () { return !!hintObj; }, "version hints to resolve");
                return hintObj.hints.map(function ($item) {
                    return $item.find(".hint-obj").text();
                });
            }

            it("should match a typed prefix against the FULL version list, not just the newest", async function () {
                // many 7.x versions on top; the 5.x train is old. Typing "5" must surface 5.x.
                const versions = {};
                for (let i = 0; i < 60; i++) {
                    versions["7." + i + ".0"] = {};
                }
                versions["5.4.11"] = {};
                NpmRegistry._setFetcherForTests(function () {
                    return Promise.resolve({ "dist-tags": { latest: "7.59.0" }, versions: versions });
                });
                // value is "^4.17.19": cursor after `"^` is ch 20; the doc token query becomes "^".
                // Type-sim: place cursor after the caret and 5 -> query "^5" via ch offset math is
                // brittle here, so instead exercise the provider path directly with a mock editor
                // whose value starts with ^5: reuse content by moving the cursor inside "^4" and
                // relying on the fallback assertion below for the no-match case; for the 5-prefix
                // case, use a fresh editor.
                testEditor.destroy();
                mockEditor = SpecRunnerUtils.createMockEditor(
                    '{\n    "name": "x",\n    "dependencies": {\n        "vite": "^5"\n    }\n}\n', "json");
                testEditor = mockEditor.editor;
                testDocument = mockEditor.doc;
                testDocument.file._name = "package.json";
                const texts = await _versionHintTexts(provider, 19);    // inside "^5"
                expect(texts.indexOf("5.4.11")).not.toBe(-1);
                expect(texts.indexOf("7.59.0")).toBe(-1);   // filtered out by the 5-prefix
            });

            it("should fall back to newest versions when the typed prefix matches nothing", async function () {
                NpmRegistry._setFetcherForTests(function () {
                    return Promise.resolve({
                        "dist-tags": { latest: "7.2.0" },
                        versions: { "7.1.0": {}, "7.2.0": {} }
                    });
                });
                testEditor.destroy();
                mockEditor = SpecRunnerUtils.createMockEditor(
                    '{\n    "name": "x",\n    "dependencies": {\n        "vite": "^9"\n    }\n}\n', "json");
                testEditor = mockEditor.editor;
                testDocument = mockEditor.doc;
                testDocument.file._name = "package.json";
                const texts = await _versionHintTexts(provider, 19);    // inside "^9" - no 9.x exists
                expect(texts.length).toBeGreaterThan(0);
                expect(texts.indexOf("7.2.0")).not.toBe(-1);
            });
        });
    });
});
