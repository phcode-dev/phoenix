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

/*global describe, it, expect, beforeAll, afterAll, beforeEach, awaitsForDone, awaits, awaitsFor, path, jsPromise */

define(function (require, exports, module) {


    const SpecRunnerUtils = require("spec/SpecRunnerUtils"),
        simple1_html = require("text!spec/LiveDevelopment-MultiBrowser-test-files/simple1.html"),
        test_php = require("text!spec/LiveDevelopment-MultiBrowser-test-files/htmlOther/test.php");

    describe("integration:HTML Lint", function () {
        let testProjectsFolder,
            testWindow,
            $,
            CodeInspection,
            CommandManager,
            Commands,
            EditorManager,
            PreferencesManager,
            NodeUtils,
            FileSystem;

        beforeAll(async function () {
            testWindow = await SpecRunnerUtils.createTestWindowAndRun();
            // Load module instances from brackets.test
            $ = testWindow.$;
            CodeInspection = testWindow.brackets.test.CodeInspection;
            NodeUtils = testWindow.brackets.test.NodeUtils;
            EditorManager = testWindow.brackets.test.EditorManager;
            PreferencesManager = testWindow.brackets.test.PreferencesManager;
            FileSystem = testWindow.brackets.test.FileSystem;
            CommandManager = testWindow.brackets.test.CommandManager;
            Commands = testWindow.brackets.test.Commands;
            testProjectsFolder = await SpecRunnerUtils.getTempTestDirectory(
                "/spec/LiveDevelopment-MultiBrowser-test-files/");
            const prefs = PreferencesManager.getExtensionPrefs("HTMLLint");
            const PREFS_HTML_LINT_DISABLED = "disabled";
            prefs.set(PREFS_HTML_LINT_DISABLED, false);
            await SpecRunnerUtils.loadProjectInTestWindow(testProjectsFolder);
            CodeInspection.toggleEnabled(true);
            await awaitsFor(()=>testWindow._htmlLintExtensionReadyToIntegTest,
                "html lint extension to be loaded", 10000);
        }, 30000);

        beforeEach(async function () {
            await testWindow.closeAllFiles();
            await _openProjectFile("package.json");
            await _waitForProblemsPanelVisible(false);
        }, 30000);

        afterAll(async function () {
            testWindow    = null;
            $             = null;
            NodeUtils     = null;
            CodeInspection  = null;
            FileSystem = null;
            EditorManager = null;
            CommandManager = null;
            Commands = null;
            await SpecRunnerUtils.closeTestWindow();
        }, 30000);

        async function _openProjectFile(fileName) {
            await awaitsForDone(SpecRunnerUtils.openProjectFiles([fileName]), "opening "+ fileName);
        }

        async function _waitForProblemsPanelVisible(visible) {
            await awaitsFor(()=>{
                return $("#problems-panel").is(":visible") === visible;
            }, "Problems panel to be visible");
        }

        async function _siwtchFilesTo(destinationFile) {
            await _openProjectFile("package.json");
            await _waitForProblemsPanelVisible(false);
            await _openProjectFile(destinationFile);
            await _waitForProblemsPanelVisible(true);
        }

        it("should show html lint error with no config file", async function () {
            await _openProjectFile("simple1.html");
            await awaitsFor(()=>{
                return $("#problems-panel").text().includes(
                    "<html> is missing required \"lang\" attribute (element-required-attributes)");
            }, "html default config lint error for simple1.html");
        }, 5000);

        async function _validateUnsupportedConfigError(configFileName, text, expectedError, dontDelete) {
            const configPath = path.join(testProjectsFolder, configFileName);
            await jsPromise(SpecRunnerUtils.createTextFile(configPath, text, FileSystem));
            await _openProjectFile(configFileName);
            await _openProjectFile("simple1.html");
            await awaitsFor(async ()=>{
                await _siwtchFilesTo("simple1.html");
                return $("#problems-panel").text().includes(expectedError);
            }, "html unsupported config error for "+configFileName, 50000, 3000);
            if(!dontDelete){
                await SpecRunnerUtils.deletePathAsync(configPath, true, FileSystem);
            }
            return configPath;
        }

        it("should show error for unsupported linter config", async function () {
            await _validateUnsupportedConfigError(".htmlvalidate.js", "function(){}",
                "Error: Unsupported config format `.htmlvalidate.js`. Use JSON config `.htmlvalidate.json`");
            await _validateUnsupportedConfigError(".htmlvalidate.cjs", "function(){}",
                "Error: Unsupported config format `.htmlvalidate.cjs`. Use JSON config `.htmlvalidate.json`");
        }, 500000);

        it("should show error if json config is invalid json", async function () {
            await _validateUnsupportedConfigError(".htmlvalidate.json", "{",
                "Error: HTML Validator config file `.htmlvalidate.json` is not valid JSON");
        }, 5000);

        it("should deleting invalid config file fall back to default config", async function () {
            const configPath = await _validateUnsupportedConfigError(".htmlvalidate.json", "{",
                "Error: HTML Validator config file `.htmlvalidate.json` is not valid JSON", true);
            await SpecRunnerUtils.deletePathAsync(configPath, true, FileSystem);
            await awaitsFor(async ()=>{
                await _siwtchFilesTo("simple1.html");
                return $("#problems-panel").text().includes(
                    "<html> is missing required \"lang\" attribute (element-required-attributes)");
            }, "html default config lint error for simple1.html");
        }, 5000);

        it("should fixing invalid config file load new config", async function () {
            const configPath = await _validateUnsupportedConfigError(".htmlvalidate.json", "{",
                "Error: HTML Validator config file `.htmlvalidate.json` is not valid JSON", true);
            // now fix the new config
            await jsPromise(SpecRunnerUtils.createTextFile(configPath,
                '{"extends": ["html-validate:recommended"]}', FileSystem));
            await awaitsFor(async ()=>{
                await _siwtchFilesTo("simple1.html");
                // more rules are enforced in "html-validate:recommended"
                return $("#problems-panel").text().includes("DOCTYPE should be uppercase (doctype-style)");
            }, "html new config lint error for simple1.html");
            await SpecRunnerUtils.deletePathAsync(configPath, true, FileSystem);
        }, 5000);

        it("should renaming a file to .htmlvalidate.json load new config", async function () {
            const invalidNameJSON = path.join(testProjectsFolder, ".html-unknwon-name.json");
            const validNameJSON = path.join(testProjectsFolder, ".htmlvalidate.json");
            await jsPromise(SpecRunnerUtils.createTextFile(invalidNameJSON,
                '{"extends": ["html-validate:recommended"]}', FileSystem));

            await awaitsFor(async ()=>{
                await _siwtchFilesTo("simple1.html");
                return $("#problems-panel tr").length === 2; // 1 error and 1 linter heading
            }, "should be only 1 error as using default config");

            // now rename to new file
            await jsPromise(SpecRunnerUtils.rename(invalidNameJSON, validNameJSON));
            await awaitsFor(async ()=>{
                await _siwtchFilesTo("simple1.html");
                // more rules are enforced in "html-validate:recommended"
                return $("#problems-panel tr").length === 5;
            }, ()=>`expected 5 errors but got ${$("#problems-panel tr").length}`, 4000, 100);
            await SpecRunnerUtils.deletePathAsync(invalidNameJSON, true, FileSystem);
            await SpecRunnerUtils.deletePathAsync(validNameJSON, true, FileSystem);
        }, 6000);

        const testExtensions = [".htm", ".xhtml", ".jsp", ".asp", ".aspx", ".php"];
        for(let testExtension of testExtensions) {
            // eslint-disable-next-line no-loop-func
            it(`should show html lint error in ${testExtension} files`, async function () {
                const testFile = "test_"+testExtension;
                const content = testExtension === ".php" ? simple1_html : test_php;
                await jsPromise(SpecRunnerUtils.createTextFile(testProjectsFolder + testFile, content, FileSystem));

                await awaitsFor(async ()=>{
                    await _siwtchFilesTo(testFile);
                    return $("#problems-panel").is(":visible") && $("#problems-panel").text().includes(
                        "<html> is missing required \"lang\" attribute (element-required-attributes)");
                }, "html lint error for "+testFile);
                await SpecRunnerUtils.deletePathAsync(testProjectsFolder + testFile, true, FileSystem);
            }, 5000);
        }
    });
});
