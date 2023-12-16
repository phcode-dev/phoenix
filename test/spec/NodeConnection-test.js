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

/*global describe, it, expect, beforeAll, awaitsFor, beforeEach, awaits*/

define(function (require, exports, module) {

    const NodeConnector = require("NodeConnector");

    if(!Phoenix.browser.isTauri) {
        describe("Node Connection", function () {
            it("Should not have node engine", async function () {
                expect(window.PhNodeEngine).not.toBeDefined();
                expect(NodeConnector.isNodeAvailable()).toBeFalse();
            });
        });
        // node is only available in desktop builds, so dont run node tests in browser
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
        let savedData, savedBuffer;

        beforeEach(()=>{
            savedBuffer = null;
            savedData = null;
        });

        beforeAll(async function () {
            nodeConnector = NodeConnector.createNodeConnector(TEST_NODE_CONNECTOR_ID, exports);
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
            exports.createNodeConnector = async function (connectorName) {
                NodeConnector.createNodeConnector(connectorName, exports)
                    .on("testEventInPhoenix", (_evt, data, buffer)=>{
                        console.log(_evt, data, buffer);
                        savedData = data;
                        savedBuffer = buffer;
                    });
            };
            nodeConnector.on("testEventInPhoenix", (_evt, data, buffer)=>{
                console.log(_evt, data, buffer);
                savedData = data;
                savedBuffer = buffer;
            });
        });

        it("Should have window.PhNodeEngine", async function () {
            expect(window.PhNodeEngine).toBeDefined();
            expect(nodeConnector).toBeDefined();
            expect(NodeConnector.isNodeAvailable()).toBeTrue();
        });

        function _verifyFailToCreateNodeConnector(id, exp) {
            let err;
            try{
                NodeConnector.createNodeConnector(id, exp);
            } catch (e) {
                err = e;
            }
            expect(err).toBeDefined();
        }

        it("Should node connector be not created for invalid args", async function () {
            _verifyFailToCreateNodeConnector(TEST_NODE_CONNECTOR_ID, exports); // already there
            _verifyFailToCreateNodeConnector("noExportsTest"); // no exports
            _verifyFailToCreateNodeConnector("invalidExports", 45); // invalid exports
            _verifyFailToCreateNodeConnector("invalidExports", null); // invalid exports
        });

        it("Should node connector be not created for invalid args in node side", async function () {
            await nodeConnector.execPeer("testInvalidArgsNodeConnector");
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

        it("Should execPeer error out if object is not second parameter while sending binary data", async function () {
            let buffer = toArrayBuffer("Hello, World!");
            await shouldErrorOut("", buffer);
            await shouldErrorOut(34, buffer);
            await shouldErrorOut(null, buffer);
        });

        it("Should fail if the connector is given invalid params in node side", async function () {
            await nodeConnector.execPeer("testErrExecCases");
        });

        it("Should be able to send events from phoenix to node and back", async function () {
            const sentText = "hello world";
            nodeConnector.triggerPeer("testEventInNode", sentText);
            await awaitsFor(function () {
                return sentText === savedData;
            }, "waiting for event reception");
        });

        it("Should be able to send events with arrayBuffer from phoenix to node and back", async function () {
            const sentText = "hello world";
            let sentBuffer = toArrayBuffer("Hello, World!");
            nodeConnector.triggerPeer("testEventInNode", sentText, sentBuffer);
            await awaitsFor(function () {
                return sentText === savedData;
            }, "waiting for event reception");
            expect(areArrayBuffersEqual(savedBuffer, sentBuffer)).toBeTrue();
        });

        const parallelism = 1000, numBatch = 10;
        it(`Should load test execute function in node and get response ${parallelism*numBatch} times`, async function () {
            let sentBuffer = toArrayBuffer("Hello, World!");
            for(let j=0;j<numBatch; j++){
                const allPromises = [];
                for(let i=0;i<parallelism;i++){
                    allPromises.push(nodeConnector.execPeer("echoTest", {hello: "world"}, sentBuffer));
                }
                await Promise.all(allPromises);
            }
        });

        it("Should be able to exec function even if node connector is created only later in node", async function () {
            const newNodeConnName = "ph_exec_Q_test";
            const newExport = {};
            const newNodeConn = NodeConnector.createNodeConnector(newNodeConnName, newExport);
            // now the newNodeConn is not yet created in node. We will send an exec message to node and it should still
            // go through and be queued.
            const expectedResult = "hello";
            const newNodeConnResult = newNodeConn.execPeer("echoTest", expectedResult);
            // now we wait for 1 seconds just to be sure that the exec wasnt rejected and is queued.
            await awaits(1000);
            await nodeConnector.execPeer("createNodeConnector", newNodeConnName);
            //now we wait for the result as the queue will likeley be drained and the result available now
            const result = await newNodeConnResult;
            expect(result).toEql(expectedResult);
        });

        it("Should be able to exec function even if node connector is created only later in phoenix side", async function () {
            await nodeConnector.execPeer("testDelayedNodeConnectorCreateExec");
        });

        it("Should be able to send events even if node connector is created only later in node", async function () {
            const newNodeConnName = "ph_event_Q_test";
            const newExport = {};
            const newNodeConn = NodeConnector.createNodeConnector(newNodeConnName, newExport);
            // now the newNodeConn is not yet created in node. We will send an exec message to node and it should still
            // go through and be queued.
            const sentText = "hello world";
            newNodeConn.triggerPeer("testEventInNode", sentText);
            // now we wait for 1 seconds just to be sure that the event wasnt rejected and is queued.
            await awaits(1000);
            await nodeConnector.execPeer("createNodeConnector", newNodeConnName);
            //now we wait for the result as the queue will likeley be drained and the result available now
            await awaitsFor(function () {
                return sentText === savedData;
            }, "waiting for event reception");
        });

        it("Should be able to raise event even if node connector is created only later in phoenix side", async function () {
            const sentText = "hello world delay";
            await nodeConnector.execPeer("testDelayedNodeConnectorCreateEvent");
            //now we wait for the result as the queue will likeley be drained and the result available now
            await awaitsFor(function () {
                return sentText === savedData;
            }, "waiting for event reception");
        });
    });
});
