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


    var SpecRunnerUtils = require("spec/SpecRunnerUtils");

    describe("integration:ESLint", function () {
        const testRootSpec = "/spec/ESLintExtensionTest-files/";
        let testProjectsFolder = SpecRunnerUtils.getTestPath(testRootSpec),
            Strings     = require("strings"),
            testWindow,
            $,
            CodeInspection,
            CommandManager,
            Commands,
            EditorManager,
            NodeUtils,
            FileSystem;

        beforeAll(async function () {
            testWindow = await SpecRunnerUtils.createTestWindowAndRun();
            // Load module instances from brackets.test
            $ = testWindow.$;
            CodeInspection = testWindow.brackets.test.CodeInspection;
            NodeUtils = testWindow.brackets.test.NodeUtils;
            EditorManager = testWindow.brackets.test.EditorManager;
            FileSystem = testWindow.brackets.test.FileSystem;
            CommandManager = testWindow.brackets.test.CommandManager;
            Commands = testWindow.brackets.test.Commands;
            CodeInspection.toggleEnabled(true);
            await awaitsFor(()=>testWindow._JsHintExtensionReadyToIntegTest,
                "JsHint extension to be loaded", 10000);
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

        const JSHintErrorES6Error_js = "Missing semicolon. jshint (W033)",
            ESLintErrorES7Error_js = "Parsing error: Unexpected token ; ESLint (null)",
            ESLintErrorES8Error_js = "Expected '===' and instead saw '=='. ESLint (eqeqeq)",
            ESLintReactError_js = "'element' is assigned a value but never used. ESLint (no-unused-vars)";

        async function _createTempProject(esLintSpecSubFolder) {
            return await SpecRunnerUtils.getTempTestDirectory(testRootSpec + esLintSpecSubFolder);
        }

        async function _openProjectFile(fileName) {
            await awaitsForDone(SpecRunnerUtils.openProjectFiles([fileName]), "opening "+ fileName);
        }

        async function _npmInstallInFolder(folder) {
            const npmInstallPlatformPath = Phoenix.fs.getTauriPlatformPath(folder);
            await NodeUtils._npmInstallInFolder(npmInstallPlatformPath);
        }

        async function _waitForProblemsPanelVisible(visible) {
            await awaitsFor(()=>{
                return $("#problems-panel").is(":visible") === visible;
            }, "Problems panel to be visible", 15000);
        }

        async function _openSimpleES6Project() {
            await SpecRunnerUtils.loadProjectInTestWindow(testProjectsFolder + "es6");
            await _openProjectFile("error.js");
            await _waitForProblemsPanelVisible(true);
        }

        if(!Phoenix.isNativeApp) {
            it("should show download desktop app in browser for eslint project", async function () {
                await _openSimpleES6Project();

                await awaitsFor(()=>{
                    return $("#problems-panel").text().includes("ESLint is only available in the Desktop app");
                }, "ESLint is only available in Desktop app");
            });

            it("should show JSHint in browser even for ESLint project with no JSHint config", async function () {
                await _openSimpleES6Project();

                await awaitsFor(()=>{
                    return $("#problems-panel").text().includes(JSHintErrorES6Error_js);
                }, JSHintErrorES6Error_js);
            });
            return;
        }

        it("should show npm install message if eslint node module not found", async function () {
            await _openSimpleES6Project();

            await awaitsFor(()=>{
                return $("#problems-panel").text().includes(Strings.DESCRIPTION_ESLINT_DO_NPM_INSTALL);
            }, Strings.DESCRIPTION_ESLINT_DO_NPM_INSTALL);
        }, 5000);

        async function _fileSwitcherroForESLintFailDetection() {
            // at this point, ESLint will try to load and fail to load. During first load only ESLint results will
            // be shown. But upon detecting ESLint load failure, the next JSHint will be shown too to help the user.
            // so we switch to another file and switch back to show jshint.

            await _openProjectFile("package.json");
            await _waitForProblemsPanelVisible(false);
            await _openProjectFile("error.js");
            await _waitForProblemsPanelVisible(true);
        }

        it("should show JSHint in desktop app if ESLint load failed for project", async function () {
            await SpecRunnerUtils.parkProject();
            await _openSimpleES6Project();
            await awaitsFor(async ()=>{
                await _fileSwitcherroForESLintFailDetection();
                return $("#problems-panel").text().includes(Strings.DESCRIPTION_ESLINT_DO_NPM_INSTALL);
            }, "ESLint error to be shown", 3000, 300);
            await awaitsFor(()=>{
                return $("#problems-panel").text().includes(JSHintErrorES6Error_js);
            }, "JShint error to be shown");
        }, 5000);

        describe("ES6 project", function () {
            let es6ProjectPath;

            beforeAll(async function () {
                es6ProjectPath = await _createTempProject("es6");
                await _npmInstallInFolder(es6ProjectPath);
                await SpecRunnerUtils.loadProjectInTestWindow(es6ProjectPath);
            }, 30000);

            async function _loadAndValidateES6Project() {
                await _openProjectFile("error.js");
                await _waitForProblemsPanelVisible(true);
                await awaitsFor(()=>{
                    return $("#problems-panel").text().includes(Strings.DESCRIPTION_ESLINT_LOAD_FAILED);
                }, "ESLint v6 not supported error to be shown", 15000);
            }

            it("should ESLint v6 show unsupported version error", async function () {
                await _loadAndValidateES6Project();
            }, 30000);

            it("should show ESLint and JSHint in desktop app for es6 project or below", async function () {
                await _loadAndValidateES6Project();
                await awaitsFor(async ()=>{
                    await _fileSwitcherroForESLintFailDetection();
                    return $("#problems-panel").text().includes(JSHintErrorES6Error_js);
                }, "JShint error to be shown", 3000, 300);
            }, 30000);
        });

        describe("ES7 and JSHint project", function () {
            let es7ProjectPath;

            beforeAll(async function () {
                es7ProjectPath = await _createTempProject("es7_JSHint");
                await _npmInstallInFolder(es7ProjectPath);
                await SpecRunnerUtils.loadProjectInTestWindow(es7ProjectPath);
            }, 30000);

            async function _loadAndValidateES7Project() {
                await _openProjectFile("error.js");
                await _waitForProblemsPanelVisible(true);
                await awaitsFor(()=>{
                    return $("#problems-panel").text().includes(ESLintErrorES7Error_js);
                }, "ESLint v7 error to be shown", 15000);
            }

            it("should ESLint v7 work as expected", async function () {
                await _loadAndValidateES7Project();
            }, 30000);

            it("should show ESLint and JSHint in desktop app if .jshintrc Present", async function () {
                await _loadAndValidateES7Project();
                await awaitsFor(()=>{
                    return $("#problems-panel").text().includes(JSHintErrorES6Error_js);
                }, "JShint error to be shown", 10000);
                expect($("#problems-panel").text().includes("JSHint")).toBeTrue();
            }, 30000);
        });

        describe("ES8 with react js support project", function () { // this should cover es7 too
            let reactProjectPath;

            beforeAll(async function () {
                reactProjectPath = await _createTempProject("es8_react_jsx");
                await _npmInstallInFolder(reactProjectPath);
                await SpecRunnerUtils.loadProjectInTestWindow(reactProjectPath);
            }, 30000);

            it("should ESLint jsx reactjs in v8 work as expected", async function () {
                await _openProjectFile("react.jsx");
                await _waitForProblemsPanelVisible(true);
                await awaitsFor(()=>{
                    return $("#problems-panel").text().includes(ESLintReactError_js);
                }, "ESLint jsx error to be shown", 15000);
            }, 30000);
        });

        // we should have an es9 test too as above, but es9 currently doesnt support jsx
        // https://github.com/facebook/react/pull/28773  do when available.

        describe("ES8 module project", function () {
            let es7ProjectPath;

            beforeAll(async function () {
                es7ProjectPath = await _createTempProject("es8_module");
                await _npmInstallInFolder(es7ProjectPath);
                await SpecRunnerUtils.loadProjectInTestWindow(es7ProjectPath);
            }, 30000);

            async function _loadAndValidateES8Project() {
                await _openProjectFile("error.js");
                await _waitForProblemsPanelVisible(true);
                await awaitsFor(()=>{
                    return $("#problems-panel").text().includes(ESLintErrorES8Error_js);
                }, "ESLint v8 error to be shown", 15000);
            }

            it("should ESLint v8 work as expected", async function () {
                await _loadAndValidateES8Project();
            }, 30000);

            it("should not lint jsx file as ESLint v8 is not configured for react lint", async function () {
                await _openProjectFile("react.jsx");
                await awaits(100); // Just wait for some time to prevent any false linter runs
                await _waitForProblemsPanelVisible(false);
                expect($("#status-inspection").hasClass("inspection-disabled")).toBeTrue();
            }, 30000);

            it("should not show JSHint in desktop app if ESLint is active", async function () {
                await _loadAndValidateES8Project();
                await awaits(100); // give some time so that jshint has time to complete if there is any.
                expect($("#problems-panel").text().includes("JSHint")).toBeFalse();
            }, 30000);
        });

        describe("ES Latest module project", function () {
            let esLatestProjectPath, configPath;
            const CONFIG_FILE_NAME = "eslint.config.js";
            const MODULE_CONFIG_TEXT = `export default [
                {
                    rules: {
                        semi: "error",
                        "prefer-const": "error"
                    }
                }
            ];`, MODULE_CONFIG_TEXT_EQ_RULE = `export default [
                {
                    rules: {
                        semi: "error",
                        "prefer-const": "error",
                        "eqeqeq": "warn"
                    }
                }
            ];`, COMMON_JS_CONFIG_TEXT = `// eslint.config.js
            module.exports = [
                {
                    rules: {
                        semi: "error",
                        "prefer-const": "error"
                    }
                }
            ];`;

            beforeAll(async function () {
                esLatestProjectPath = await _createTempProject("es_latest_no_config");
                configPath = path.join(esLatestProjectPath, CONFIG_FILE_NAME);
                await _npmInstallInFolder(esLatestProjectPath);
                await SpecRunnerUtils.loadProjectInTestWindow(esLatestProjectPath);
            }, 30000);

            let initDone = false;
            async function _loadAndValidateESLatestProject() {
                if(initDone){
                    return;
                }
                await _openProjectFile("error.js");
                await _waitForProblemsPanelVisible(true);
                await awaitsFor(()=>{
                    return $("#problems-panel").text().includes(
                        "ESLint Failed (Could not find config file.). Make sure the project contains valid"
                    );
                }, "ESLint v8 error to be shown");

                // this Project is of type="module", so loading a common js eslint config should show an error
                await jsPromise(SpecRunnerUtils.createTextFile(configPath, COMMON_JS_CONFIG_TEXT, FileSystem));
                await _openProjectFile(CONFIG_FILE_NAME);
                await _openProjectFile("error.js");
                await awaitsFor(()=>{
                    return $("#problems-panel").text().includes(
                        "eslint.config.js: module is not defined in ES module scope"
                    );
                }, "using a requirejs config in es-module error");

                // now write the es module config and eslint should now work
                await jsPromise(SpecRunnerUtils.createTextFile(configPath, MODULE_CONFIG_TEXT, FileSystem));
                await _openProjectFile(CONFIG_FILE_NAME);
                await _openProjectFile("error.js");
                await awaitsFor(()=>{
                    return $("#problems-panel").text().includes(
                        "Missing semicolon. ESLint (semi)"
                    );
                }, "eslint valid errors to be shown");
                initDone = true;
            }

            it("should ESLint Latest work as expected", async function () {
                await _loadAndValidateESLatestProject();
            }, 5000);

            it("should be able to change eslint rules config file after its loaded", async function () {
                await _loadAndValidateESLatestProject();
                // now change the current es module config and eslint should load the new rules
                await jsPromise(SpecRunnerUtils.createTextFile(configPath, MODULE_CONFIG_TEXT_EQ_RULE, FileSystem));
                await _openProjectFile(CONFIG_FILE_NAME);
                await _openProjectFile("error.js");
                await awaitsFor(()=>{
                    return $("#problems-panel").text().includes(
                        "Expected '===' and instead saw '=='. ESLint (eqeqeq)"
                    );
                }, "eslint new eq rule added to be honored in lint");
            }, 5000);
        });

        describe("ESLint v9 with fixes project", function () {
            let esLatestProjectPath, originalErrorFile;

            beforeAll(async function () {
                esLatestProjectPath = await _createTempProject("es9_with_fixes");
                await _npmInstallInFolder(esLatestProjectPath);
                await SpecRunnerUtils.loadProjectInTestWindow(esLatestProjectPath);
                await _openProjectFile("error.js");
                const editor = EditorManager.getCurrentFullEditor();
                originalErrorFile = editor.document.getText();
            }, 30000);

            beforeEach(async function () {
                await jsPromise(SpecRunnerUtils.createTextFile(path.join(esLatestProjectPath, "error.js"),
                    originalErrorFile, FileSystem));
                await testWindow.closeAllFiles();
            });

            async function _openAndVerifyInitial() {
                await _openProjectFile("error.js");
                await _waitForProblemsPanelVisible(true);
                await awaitsFor(()=>{
                    return $("#problems-panel").find(".ph-fix-problem").length === 2;
                }, "There should be 2 fix problem button in the panel", 15000);
            }

            async function _triggerLint() {
                await _openProjectFile("package.json");
                await _openProjectFile("error.js");
            }

            it("should ESLint v9 show fix buttons", async function () {
                await _openAndVerifyInitial();
            }, 30000);

            it("should be able to fix 1 error", async function () {
                await _openAndVerifyInitial();
                // click on fix : Expected indentation of 4 spaces but found 9. ESLint (indent)
                $($("#problems-panel").find(".ph-fix-problem")[0]).click();
                await awaitsFor(()=>{
                    return $("#problems-panel").find(".ph-fix-problem").length === 1;
                }, "only 1 problem should remain", 15000);

                // it should select the edited text
                const editor = EditorManager.getCurrentFullEditor();
                expect(editor.getSelectedText()).toBe("    ");
                const selection = editor.getSelection();
                expect(selection.start).toEql({line: 3, ch: 0, sticky: null});
                expect(selection.end).toEql({line: 3, ch: 4, sticky: null});

                // undo should work
                await awaitsForDone(CommandManager.execute(Commands.EDIT_UNDO), "undo");
                expect(editor.getSelectedText()).toBe("        ");
                await _triggerLint();
                await awaitsFor(()=>{
                    return $("#problems-panel").find(".ph-fix-problem").length === 2;
                }, "2 problem should be there", 15000);
            }, 30000);

            it("should be able to fix all errors", async function () {
                await _openAndVerifyInitial();
                const editor = EditorManager.getCurrentFullEditor();
                editor.setCursorPos(0, 0); // resent any saved selections from previous run
                // click on fix : Expected indentation of 4 spaces but found 9. ESLint (indent)
                $($("#problems-panel").find(".problems-fix-all-btn")).click();
                await awaitsFor(()=>{
                    return $("#problems-panel").find(".ph-fix-problem").length === 0;
                }, "no problems should remain as all is now fixed", 15000);

                // fixing multiple should place the cursor on first fix
                expect(editor.hasSelection()).toBeFalse();
                expect(editor.getCursorPos()).toEql({line: 3, ch: 0, sticky: null});

                await awaitsForDone(CommandManager.execute(Commands.EDIT_UNDO), "undo");
                expect(editor.hasSelection()).toBeFalse();
                expect(editor.getSelections().length).toBe(1); // no multi cursor on undo

                await _triggerLint();
                await awaitsFor(()=>{
                    return $("#problems-panel").find(".ph-fix-problem").length === 2;
                }, "2 problem should be there", 15000);
            }, 30000);
        });
    });
});
