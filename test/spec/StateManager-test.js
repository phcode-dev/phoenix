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

/*global describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, awaitsFor*/

define(function (require, exports, module) {
    const StateManager            = require("preferences/StateManager"),
        ProjectManager        = require("project/ProjectManager");

    describe("unit:StateManager Tests", function () {
        let savedGetProjectRoot, val = 0;

        beforeAll(function () {
            savedGetProjectRoot = ProjectManager.getProjectRoot;
            ProjectManager.getProjectRoot = function () {
                return {
                    fullPath: '/mock/project/root'
                };
            };
        });
        let testKey= "key";

        beforeEach(function () {
            val++;
            testKey = `test-key-${val}`;
        });

        afterAll(function () {
            ProjectManager.getProjectRoot = savedGetProjectRoot;
        });

        function setupStateManagerTests(stateManager, stateManagerName = "") {
            it("should be able to set and get state without context"+stateManagerName, async function () {
                stateManager.set(testKey, val);
                expect(stateManager.get(testKey)).toEqual(val);
            });

            it("should be able to set and get state in global context"+stateManagerName, async function () {
                stateManager.set(testKey, val, stateManager.GLOBAL_CONTEXT);
                expect(stateManager.get(testKey)).toEqual(val);
                expect(stateManager.get(testKey, stateManager.PROJECT_CONTEXT)).toEqual(null);
                expect(stateManager.get(testKey, stateManager.PROJECT_THEN_GLOBAL_CONTEXT)).toEqual(val);
            });

            it("should be able to set and get state in project context"+stateManagerName, async function () {
                stateManager.set(testKey, val, stateManager.PROJECT_CONTEXT);
                expect(stateManager.get(testKey)).toEqual(null);
                expect(stateManager.get(testKey, stateManager.PROJECT_CONTEXT)).toEqual(val);
                expect(stateManager.get(testKey, stateManager.PROJECT_THEN_GLOBAL_CONTEXT)).toEqual(val);
            });

            it("should be able to define preference"+stateManagerName, async function () {
                const defaultVal = "default val";
                stateManager.definePreference(testKey, "string", defaultVal);
                expect(stateManager.get(testKey)).toEqual(defaultVal);
                expect(stateManager.get(testKey, stateManager.PROJECT_CONTEXT)).toEqual(defaultVal);
                expect(stateManager.get(testKey, stateManager.PROJECT_THEN_GLOBAL_CONTEXT)).toEqual(defaultVal);
                // now set a val
                stateManager.set(testKey, val, stateManager.PROJECT_CONTEXT);
                expect(stateManager.get(testKey)).toEqual(defaultVal);
                expect(stateManager.get(testKey, stateManager.PROJECT_CONTEXT)).toEqual(val);
                expect(stateManager.get(testKey, stateManager.PROJECT_THEN_GLOBAL_CONTEXT)).toEqual(val);
            });

            it("should not be able to define a defined preference"+stateManagerName, async function () {
                const defaultVal = "default val 2";
                stateManager.definePreference(testKey, "string", defaultVal);
                let error;
                try{
                    stateManager.definePreference(testKey, "string", defaultVal);
                } catch (e) {
                    error = e;
                }
                expect(error).toBeDefined();
            });

            it("should be able to listen to changes on global preference"+stateManagerName, async function () {
                let changedVal;
                stateManager.definePreference(testKey, "string", val).on('change', ()=>{
                    changedVal = stateManager.get(testKey);
                });
                stateManager.set(testKey, val);
                await awaitsFor(()=>{return changedVal === val;}, "For changed pref state");
            });

            it("should be able to get a defined preference"+stateManagerName, async function () {
                let changedVal;
                stateManager.definePreference(testKey, "string", val);
                stateManager.getPreference(testKey, "string", val).on('change', ()=>{
                    changedVal = stateManager.get(testKey);
                });
                stateManager.set(testKey, val);
                await awaitsFor(()=>{return changedVal === val;}, "For changed pref state");
            });

            it("should be able to listen to changes on keys with . in them"+stateManagerName, async function () {
                let changedVal;
                testKey = `${testKey}.key`;
                stateManager.definePreference(testKey, "string", val).on('change', ()=>{
                    changedVal = stateManager.get(testKey);
                });
                stateManager.set(testKey, val);
                await awaitsFor(()=>{return changedVal === val;}, "For changed pref state");
            });
        }

        setupStateManagerTests(StateManager, " default");
        setupStateManagerTests(StateManager.createExtensionStateManager("extID"), " extension state manager");
        setupStateManagerTests(StateManager.createExtensionStateManager("extID"), " extension state manager duplicate should work");
        setupStateManagerTests(StateManager.createExtensionStateManager("ext.ID"), " extension state manager with dots should work");
        setupStateManagerTests(StateManager.createExtensionStateManager("ext.ID"), " extension state manager with dots x2");
        // getPrefixedSystem legacy api
        setupStateManagerTests(StateManager.getPrefixedSystem("ext.ID2"), " getPrefixedSystem legacy api");
    });
});
