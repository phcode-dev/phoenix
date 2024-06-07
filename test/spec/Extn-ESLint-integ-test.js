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

/*global describe, it, expect, beforeAll, afterAll, awaitsForDone, awaits, awaitsFor */

define(function (require, exports, module) {


    var SpecRunnerUtils = require("spec/SpecRunnerUtils");

    describe("integration:ESLint", function () {
        const testRootSpec = "/spec/ESLintExtensionTest-files/";
        let testProjectsFolder = SpecRunnerUtils.getTestPath(testRootSpec),
            Strings     = require("strings"),
            testWindow,
            $,
            CodeInspection,
            NodeUtils;

        beforeAll(async function () {
            testWindow = await SpecRunnerUtils.createTestWindowAndRun();
            // Load module instances from brackets.test
            $ = testWindow.$;
            CodeInspection = testWindow.brackets.test.CodeInspection;
            NodeUtils = testWindow.brackets.test.NodeUtils;
            CodeInspection.toggleEnabled(true);
            await awaitsFor(()=>testWindow._JsHintExtensionReadyToIntegTest,
                "JsHint extension to be loaded", 10000);
        }, 30000);

        afterAll(async function () {
            testWindow    = null;
            $             = null;
            NodeUtils     = null;
            CodeInspection  = null;
            await SpecRunnerUtils.closeTestWindow();
        }, 30000);

        const JSHintErrorES6Error_js = "Missing semicolon. jshint (W033)",
            ESLintErrorES7Error_js = "Parsing error: Unexpected token ; ESLint (null)";

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
            }, "Problems panel to be visible");
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
            await _openSimpleES6Project();
            await _fileSwitcherroForESLintFailDetection();
            await awaitsFor(()=>{
                return $("#problems-panel").text().includes(Strings.DESCRIPTION_ESLINT_DO_NPM_INSTALL);
            }, "ESLint error to be shown");
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
                }, "ESLint v6 not supported error to be shown");
            }

            it("should ESLint v6 show unsupported version error", async function () {
                await _loadAndValidateES6Project();
            }, 5000);

            it("should show ESLint and JSHint in desktop app for es6 project or below", async function () {
                await _loadAndValidateES6Project();
                await _fileSwitcherroForESLintFailDetection();
                await awaitsFor(()=>{
                    return $("#problems-panel").text().includes(JSHintErrorES6Error_js);
                }, "JShint error to be shown");
            }, 5000);
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
                }, "ESLint v7 error to be shown");
            }

            it("should ESLint v7 work as expected", async function () {
                await _loadAndValidateES7Project();
            }, 5000);

            it("should show ESLint and JSHint in desktop app if .jshintrc Present", async function () {
                await _loadAndValidateES7Project();
                await awaitsFor(()=>{
                    return $("#problems-panel").text().includes(JSHintErrorES6Error_js);
                }, "JShint error to be shown");
            }, 5000);

            // todo eslint module test
        });
    });
});
