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

/*global PhStore, describe, it, expect, beforeAll, afterAll, awaits, awaitsFor, beforeEach */

define(function (require, exports, module) {
    // Recommended to avoid reloading the integration test window Phoenix instance for each test.

    const SpecRunnerUtils     = require("spec/SpecRunnerUtils");

    const testPath = SpecRunnerUtils.getTestPath("/spec/JSUtils-test-files");

    let testWindow;


    describe("integration:Storage integration tests", function () {
        const testKey = "test_storage_key";

        beforeAll(async function () {
            // do not use force option in brackets core integration tests. Tests are assumed to reuse the existing
            // test window instance for fast runs.
            testWindow = await SpecRunnerUtils.createTestWindowAndRun();
            await SpecRunnerUtils.loadProjectInTestWindow(testPath);
            PhStore._setTestKey(testKey);
            testWindow.PhStore._setTestKey(testKey);
        }, 30000);

        afterAll(async function () {
            await SpecRunnerUtils.closeTestWindow();
            PhStore.unwatchExternalChanges(testKey);
            PhStore.off(testKey);
        }, 30000);

        beforeEach(async function () {
            PhStore.unwatchExternalChanges(testKey);
            PhStore.off(testKey);
            testWindow.PhStore.unwatchExternalChanges(testKey);
        });

        it("Should PhStore APIs be available", async function () {
            expect(PhStore).toBeDefined();
            expect(PhStore.setItem).toBeDefined();
            expect(PhStore.getItem).toBeDefined();
            expect(PhStore.watchExternalChanges).toBeDefined();
            expect(PhStore.unwatchExternalChanges).toBeDefined();
        });

        function expectSetGetSuccess(value) {
            PhStore.setItem(testKey, value);
            expect(PhStore.getItem(testKey)).toEql(value);
        }

        it("Should be able to get and set different value types", async function () {
            expectSetGetSuccess(1);
            expectSetGetSuccess("");
            expectSetGetSuccess(null);
            expectSetGetSuccess(0);
            expectSetGetSuccess("hello");
            expectSetGetSuccess({hello: {message: "world"}});
            expectSetGetSuccess([1, "3"]);
        });

        it("Should be able to remove item", async function () {
            const value = "hello";
            PhStore.setItem(testKey, value);
            expect(PhStore.getItem(testKey)).toEql(value);
            PhStore.removeItem(testKey);
            expect(PhStore.getItem(testKey)).toEql(null);
        });

        it("Should be able to get and set with lmdb node connector in tauri", async function () {
            if(!Phoenix.isNativeApp){
                return;
            }
            const key = "test_suite_storage_key";
            const expectedValue = {
                v: crypto.randomUUID(),
                n: 123
            };
            await window.storageNodeConnector.execPeer("putItem", {
                key,
                value: expectedValue
            });
            const val = await window.storageNodeConnector.execPeer("getItem", key);
            expect(val).toEql(expectedValue);
        });

        it("Should be able to get and set with lmdb node connector in two node processes in tauri", async function () {
            if(!Phoenix.isNativeApp){
                return;
            }
            const key = "test_suite_storage_key";
            const expectedValue = {
                v: crypto.randomUUID(),
                n: 123
            };
            // now write using the spec runners node process
            await window.storageNodeConnector.execPeer("putItem", {
                key,
                value: expectedValue
            });
            // now read using the iframe test phcode windows node process, lmdb should multi process sync.
            const val = await testWindow.storageNodeConnector.execPeer("getItem", key);
            expect(val).toEql(expectedValue);
        });

        it("Should be able to create lmdb dumps in tauri", async function () {
            if(!Phoenix.isNativeApp){
                return;
            }
            const key = "test_suite_storage_key_dump_test";
            const expectedValue = {
                v: crypto.randomUUID(),
                n: 123
            };
            await window.storageNodeConnector.execPeer("putItem", {
                key,
                value: expectedValue
            });

            const dumpFileLocation = await window.storageNodeConnector.execPeer("dumpDBToFile");
            const dumpFileText = await window.__TAURI__.fs.readTextFile(dumpFileLocation);
            const dumpObj = JSON.parse(dumpFileText);
            expect(dumpObj[key]).toEql(expectedValue);
        });

        it("Should mutating the item got from get API not change the actual object for next get", async function () {
            PhStore.setItem(testKey, {hello: "world"});
            const item = PhStore.getItem(testKey);
            item.hello = "new World";
            const itemAgain = PhStore.getItem(testKey);
            // each get should get a clone of the object, so mutations on previous get shouldn't affect the getItem call
            expect(itemAgain.hello).toEqual("world");
        });

        it("Should return cached content if we are not watching for external changes", async function () {
            const internal = "internal", external = "external";
            PhStore.setItem(testKey, internal);
            expect(PhStore.getItem(testKey)).toEql(internal); // this will cache value locally

            testWindow.PhStore.watchExternalChanges(testKey); // watch in phcode window, should not affect cache in this window
            testWindow.PhStore.setItem(testKey, external);
            await awaits(1000);
            expect(PhStore.getItem(testKey)).toEql(internal);
            expect(testWindow.PhStore.getItem(testKey)).toEql(external);
        });

        it("Should get changed notification in this window, not watching external changes", async function () {
            PhStore.setItem(testKey, 1);
            let changeType;
            PhStore.on(testKey, (_event, type)=>{
                changeType = type;
            });
            const newValue = "hello";
            PhStore.setItem(testKey, newValue);
            expect(PhStore.getItem(testKey)).toEql(newValue);
            expect(changeType).toEql("Internal"); // this event raising is synchronous
        });

        it("Should get changed notification in this window, if watching for external changes", async function () {
            const currentWinVal = "currentwindow";
            PhStore.setItem(testKey, currentWinVal);
            expect(PhStore.getItem(testKey)).toEql(currentWinVal);

            PhStore.watchExternalChanges(testKey);
            testWindow.PhStore.watchExternalChanges(testKey);

            let changeType, changedValue;
            PhStore.on(testKey, (_event, type)=>{
                changeType = type;
                changedValue = PhStore.getItem(testKey); // the new key should be updated when you get the event
            });

            const newValue = "hello";
            await awaits(500);// let time pass
            testWindow.PhStore.setItem(testKey, newValue); // set in phoenix, it should eventually come to this window
            expect(testWindow.PhStore.getItem(testKey)).toEql(newValue);
            await awaitsFor(function () {
                return changedValue === newValue;
            });
            expect(changeType).toEql("External");
            expect(changedValue).toEql(newValue);
        });

        it("Should get changed notification in this window, if removing watched item in external window", async function () {
            const currentWinVal = "externalRemove";
            PhStore.watchExternalChanges(testKey);
            testWindow.PhStore.watchExternalChanges(testKey);

            PhStore.setItem(testKey, currentWinVal);
            expect(PhStore.getItem(testKey)).toEql(currentWinVal);
            await awaitsFor(function () {
                return testWindow.PhStore.getItem(testKey) === currentWinVal;
            });

            // now both window has set the value. remove it and see if we get notifications

            let changeType, changedValue = undefined;
            PhStore.on(testKey, (_event, type)=>{
                changeType = type;
                changedValue = PhStore.getItem(testKey); // the new key should be updated when you get the event
            });

            testWindow.PhStore.removeItem(testKey); // remove in phoenix, it should eventually come to this window
            expect(testWindow.PhStore.getItem(testKey)).toEql(null);
            await awaitsFor(function () {
                return changedValue === null;
            });
            expect(changeType).toEql("External");
            expect(changedValue).toEql(null);
        });

    });
});
