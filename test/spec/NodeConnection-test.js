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

/*global describe, it, expect, beforeAll, afterEach, waits, waitsFor, runs, ArrayBuffer, DataView, jasmine*/

define(function (require, exports, module) {

    if(!Phoenix.browser.isTauri) {
        // node is only available in desktop builds
        return;
    }

    function toArrayBuffer(text) {
        const textEncoder = new TextEncoder();
        const uint8Array = textEncoder.encode(text);
        return uint8Array.buffer;
    }

    function areArrayBuffersEqual(buffer1, buffer2) {
        if (buffer1.byteLength !== buffer2.byteLength) {
            return false;
        }

        const view1 = new Uint8Array(buffer1);
        const view2 = new Uint8Array(buffer2);

        for (let i = 0; i < buffer1.byteLength; i++) {
            if (view1[i] !== view2[i]) {
                return false;
            }
        }

        return true;
    }

    describe("Node Connection", function () {
        const TEST_NODE_CONNECTOR_ID = "ph_test_connector";
        let nodeConnector = null;

        beforeAll(async function () {
            nodeConnector = await window.PhNodeEngine.createNodeConnector(TEST_NODE_CONNECTOR_ID, exports);
            exports.echoTestPhcode = function (data, buffer) {
                console.log("Node fn called testFnCall");
                return new Promise(resolve =>{
                    if(!(buffer instanceof ArrayBuffer)) {
                        resolve(data);
                        return;
                    }
                    data.buffer = buffer;
                    resolve(data);
                });
            };
        });

        it("Should have window.PhNodeEngine", async function () {
            expect(window.PhNodeEngine).toBeDefined();
            expect(nodeConnector).toBeDefined();
        });

        it("Should be able to execute function in node and get response for normal objects", async function () {
            let result = await nodeConnector.execPeer("echoTest");
            expect(result).toEql(null);
            result = await nodeConnector.execPeer("echoTest", 23);
            expect(result).toEql(23);
            result = await nodeConnector.execPeer("echoTest", null);
            expect(result).toEql(null);
            result = await nodeConnector.execPeer("echoTest", false);
            expect(result).toEql(false);
            result = await nodeConnector.execPeer("echoTest", "aString");
            expect(result).toEql("aString");
            let obj = {o:"z",x:{y:23}};
            result = await nodeConnector.execPeer("echoTest", obj, null);
            expect(result).toEql(obj);
        });

        it("Should be able to execute function in node and get response and transfer array buffers", async function () {
            let buffer = toArrayBuffer("Hello, World!");
            let result = await nodeConnector.execPeer("echoTest", {}, buffer);
            expect(areArrayBuffersEqual(result.buffer, buffer)).toBeTrue();

            buffer = toArrayBuffer("");
            result = await nodeConnector.execPeer("echoTest", {}, buffer);
            expect(areArrayBuffersEqual(result.buffer, buffer)).toBeTrue();

            buffer = toArrayBuffer("nice");
            result = await nodeConnector.execPeer("echoTest", {otherData: 42}, buffer);
            expect(areArrayBuffersEqual(result.buffer, buffer)).toBeTrue();
            expect(result.otherData).toEql(42);
        });

        it("Should node be able to execute function in phcode and get responses", async function () {
            await nodeConnector.execPeer("echoTestOnPhoenixNodeConnector");
        });

        it("Should fail if the connector doesnt have that api in node", async function () {
            let err;
            try{
                await nodeConnector.execPeer("noopAPI");
            } catch (e) {
                err = e;
            }
            expect(err.code).toEql("NoSuchFn");
        });

        it("Should fail if the connector doesnt have that api from node to phcode", async function () {
            await nodeConnector.execPeer("testFnNotThere");
        });

        async function shouldErrorOut(a,b) {
            let err;
            try{
                await nodeConnector.execPeer("echoTest", a, b);
            } catch (e) {
                err = e;
            }
            expect(typeof err.message).toEql("string");
        }

        it("Should fail if the connector is given invalid params", async function () {
            await shouldErrorOut(toArrayBuffer("g"));
            await shouldErrorOut({}, 34);
        });

        it("Should fail if the connector is given invalid params in node side", async function () {
            await nodeConnector.execPeer("testErrExecCases");
        });
    });
});
