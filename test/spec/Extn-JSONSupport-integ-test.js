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

/*global describe, it, expect, beforeAll, afterAll, awaitsFor, awaitsForDone */

define(function (require, exports, module) {


    if (!Phoenix.isNativeApp) {
        // The JSON language server is a node process - desktop builds only.
        return;
    }

    const SpecRunnerUtils = require("spec/SpecRunnerUtils");

    describe("integration:JSON LSP", function () {
        const testFolder = SpecRunnerUtils.getTestPath("/spec/JSONSupport-test-files");
        let testWindow,
            $,
            CommandManager,
            Commands;

        beforeAll(async function () {
            testWindow = await SpecRunnerUtils.createTestWindowAndRun();
            $ = testWindow.$;
            CommandManager = testWindow.brackets.test.CommandManager;
            Commands = testWindow.brackets.test.Commands;
            await SpecRunnerUtils.loadProjectInTestWindow(testFolder);
        }, 100000);    // cold embedded-window boot can exceed 30s (same budget as the TS LSP suite)

        afterAll(async function () {
            testWindow = null;
            await SpecRunnerUtils.closeTestWindow();
        }, 30000);

        async function _openFile(fileName) {
            await awaitsForDone(
                CommandManager.execute(Commands.CMD_ADD_TO_WORKINGSET_AND_OPEN,
                    { fullPath: testFolder + "/" + fileName }));
        }

        function _problemsText() {
            return $("#problems-panel").text();
        }

        it("should flag JSON syntax errors via the language server", async function () {
            // First spec doubles as the server warm-up (spawn + initialize), hence the
            // larger budget. Syntax validation needs no schema download - network-free.
            await _openFile("broken.json");
            await awaitsFor(function () {
                return /json \(/.test(_problemsText());
            }, "JSON server syntax diagnostics in the problems panel", 90000);
        }, 120000);

        it("should validate against a pushed schema association (inline schema, no network)", async function () {
            const JsonLsp = testWindow.require("extensionsIntegrated/JSONSupport/JsonLsp");
            JsonLsp._setTestSchemaAssociations([{
                fileMatch: ["appsettings.json"],
                schema: {
                    type: "object",
                    properties: {
                        mode: { type: "string", enum: ["dev", "prod"] }
                    }
                }
            }]);
            await _openFile("appsettings.json");
            await awaitsFor(function () {
                // the fixture's "invalid-mode" violates the enum
                return /not accepted|allowed values|invalid-mode|dev/i.test(_problemsText());
            }, "schema enum diagnostic for appsettings.json", 30000);
            JsonLsp._setTestSchemaAssociations(null);
        }, 45000);

        it("should consume the autoclosed closing quote when inserting a key completion", async function () {
            // Regression: typing `"` autocloses to `"|"`; the server's completion textEdit range
            // covers BOTH quotes (its end is past the cursor) and newText is a full `"key": {$1}`
            // snippet. insertHint used to clamp the replacement end to the cursor, leaving the
            // closing quote dangling -> `"key": {}"` (invalid JSON).
            const JsonLsp = testWindow.require("extensionsIntegrated/JSONSupport/JsonLsp");
            const EditorManager = testWindow.brackets.test.EditorManager;
            JsonLsp._setTestSchemaAssociations([{
                fileMatch: ["appsettings.json"],
                schema: {
                    type: "object",
                    properties: {
                        serverConfig: { type: "object" }
                    }
                }
            }]);
            await _openFile("appsettings.json");
            const editor = EditorManager.getActiveEditor();
            editor.document.setText('{\n  ""\n}');
            editor.setCursorPos(1, 3);      // between the quotes: `  "|"`

            // Drive the LSP hint provider directly (the popup UI needs OS window focus that the
            // embedded test window may not have). Poll fresh requests until the schema completion
            // shows up - the pushed schema association may take a moment to apply server-side.
            await awaitsFor(function () {
                return !!JsonLsp._getClient();
            }, "JSON language client registered", 30000);
            const client = JsonLsp._getClient();
            let $targetHint = null,
                requestInFlight = false;
            await awaitsFor(function () {
                if ($targetHint) {
                    return true;
                }
                if (!requestInFlight) {
                    requestInFlight = true;
                    client._completionCache = null; // context key is stable here - don't reuse stale lists
                    client.codeHints.getHints(null).done(function (result) {
                        requestInFlight = false;
                        const hints = (result && result.hints) || [];
                        $targetHint = hints.find(function ($hint) {
                            const token = $hint.data("token");
                            return token && token.label === "serverConfig";
                        }) || null;
                    }).fail(function () {
                        requestInFlight = false;
                    });
                }
                return false;
            }, "serverConfig schema completion from the JSON server", 30000);

            client.codeHints.insertHint($targetHint); // what selecting the hint with Enter does
            await awaitsFor(function () {
                return editor.document.getLine(1).indexOf("serverConfig") !== -1;
            }, "completion inserted into the document", 30000);

            expect(editor.document.getLine(1)).toBe('  "serverConfig": {}');
            // the whole document must stay valid JSON - no dangling quote after the insert
            expect(function () { JSON.parse(editor.document.getText()); }).not.toThrow();

            JsonLsp._setTestSchemaAssociations(null);
            await awaitsForDone(CommandManager.execute(Commands.FILE_CLOSE,
                { fullPath: testFolder + "/appsettings.json", _forceClose: true }));
        }, 45000);

        it("should squiggle vulnerable dependencies using advisory data", async function () {
            const NpmRegistry = testWindow.require("extensionsIntegrated/JSONSupport/NpmRegistry");
            NpmRegistry._setFetcherForTests(function (url, options) {
                if (url.indexOf("/security/advisories/bulk") !== -1) {
                    return Promise.resolve({
                        lodash: [{
                            id: 1, url: "https://example.test/advisory",
                            title: "Fixture Prototype Pollution", severity: "high",
                            vulnerable_versions: "<4.18.0"
                        }]
                    });
                }
                // abbreviated version doc for lodash
                return Promise.resolve({
                    "dist-tags": { latest: "4.17.21" },
                    versions: { "4.17.19": {}, "4.17.21": {} }
                });
            });
            await _openFile("package.json");
            await awaitsFor(function () {
                return _problemsText().indexOf("Fixture Prototype Pollution") !== -1;
            }, "vulnerability advisory in the problems panel", 30000);
            expect(_problemsText()).toContain("lodash@4.17.21");
        }, 45000);
    });
});
