/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 * Original work Copyright (c) 2012 - 2021 Adobe Systems Incorporated. All rights reserved.
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

/*global describe, it, expect, beforeAll, afterAll, awaits, awaitsForDone */

define(function (require, exports, module) {
    // Recommended to avoid reloading the integration test window Phoenix instance for each test.

    const SpecRunnerUtils     = require("spec/SpecRunnerUtils"),
        PhoenixCommSpecRunner = require("utils/PhoenixComm");

    const testPath = SpecRunnerUtils.getTestPath("/spec/JSUtils-test-files");

    let FileViewController,     // loaded from brackets.test
        ProjectManager,         // loaded from brackets.test;
        MainViewManager,
        CommandManager,
        Commands,
        testWindow,
        brackets,
        PhoenixComm;


    describe("integration:PhoenixComm", function () {

        async function _initTestWindow() {
            testWindow = await SpecRunnerUtils.createTestWindowAndRun();
            brackets            = testWindow.brackets;
            FileViewController  = brackets.test.FileViewController;
            ProjectManager      = brackets.test.ProjectManager;
            MainViewManager     = brackets.test.MainViewManager;
            CommandManager      = brackets.test.CommandManager;
            Commands            = brackets.test.Commands;
            PhoenixComm         = brackets.test.PhoenixComm;
            await awaitsForDone(
                FileViewController.openAndSelectDocument(
                    testPath + "/simple.js",
                    FileViewController.PROJECT_MANAGER
                ));

            await SpecRunnerUtils.loadProjectInTestWindow(testPath);
        }

        beforeAll(async function () {
            await _initTestWindow();
        }, 30000);

        function _closeTestWindow() {
            if(testWindow){
                // comment out below line if you want to debug the test window post running tests
                SpecRunnerUtils.closeTestWindow();
            }
            FileViewController  = null;
            ProjectManager      = null;
            testWindow = null;
            brackets = null;
        }

        afterAll(function () {
            _closeTestWindow();
        });

        it("Should Not have self instance details in Phoenix comm", async function () { // #2813
            let instanceDetails = PhoenixCommSpecRunner.getAllInstanceDetails();
            expect(instanceDetails[PhoenixCommSpecRunner.PHOENIX_INSTANCE_ID]).toBeFalsy();
        });

        it("Should have the test window instance details in both instances", async function () { // #2813
            let instanceDetailsAtSpecRunner = PhoenixCommSpecRunner.getAllInstanceDetails();
            let instanceDetailsAtTestWindow = PhoenixComm.getAllInstanceDetails();
            // check if we have the instance details of the test window
            expect(instanceDetailsAtSpecRunner[PhoenixComm.PHOENIX_INSTANCE_ID]).toEqual({
                instanceID: PhoenixComm.PHOENIX_INSTANCE_ID,
                isTestWindow: true
            });
            // check if test window have the instance details of this spec runner
            expect(instanceDetailsAtTestWindow[PhoenixCommSpecRunner.PHOENIX_INSTANCE_ID]).toEqual({
                instanceID: PhoenixCommSpecRunner.PHOENIX_INSTANCE_ID,
                isTestWindow: true
            });
        });

        it("Should remove references from self once test window is closed", async function () { // #2813
            let instanceDetailsAtSpecRunner = PhoenixCommSpecRunner.getAllInstanceDetails();
            let testWindowInstanceID = PhoenixComm.PHOENIX_INSTANCE_ID;
            _closeTestWindow();
            await awaits(500);
            // check if we dont the instance details of the test window
            expect(instanceDetailsAtSpecRunner[testWindowInstanceID]).not.toBeDefined();
            await _initTestWindow();
        });

        it("Should update references from self once test window reloaded", async function () { // #2813
            let oldTestWindowInstanceID = PhoenixComm.PHOENIX_INSTANCE_ID;
            _closeTestWindow();
            await _initTestWindow();
            await awaits(500);

            let instanceDetailsAtSpecRunner = PhoenixCommSpecRunner.getAllInstanceDetails();
            let instanceDetailsAtTestWindow = PhoenixComm.getAllInstanceDetails();
            // check if we dont the instance details of the test window
            expect(instanceDetailsAtSpecRunner[oldTestWindowInstanceID]).not.toBeDefined();
            expect(instanceDetailsAtTestWindow[oldTestWindowInstanceID]).not.toBeDefined();
            // check if we have the instance details of the test window
            expect(instanceDetailsAtSpecRunner[PhoenixComm.PHOENIX_INSTANCE_ID]).toEqual({
                instanceID: PhoenixComm.PHOENIX_INSTANCE_ID,
                isTestWindow: true
            });
            // check if test window have the instance details of this spec runner
            expect(instanceDetailsAtTestWindow[PhoenixCommSpecRunner.PHOENIX_INSTANCE_ID]).toEqual({
                instanceID: PhoenixCommSpecRunner.PHOENIX_INSTANCE_ID,
                isTestWindow: true
            });
        });

    });
});
