const NodeConnector = require("./node-connector");

let nodeConnector;
const TEST_NODE_CONNECTOR_ID = "ph_test_connector";
NodeConnector.createNodeConnector(TEST_NODE_CONNECTOR_ID, exports)
    .then(nodeConnectorObj =>{
        nodeConnector = nodeConnectorObj;
        nodeConnector.on("hello", console.log);
        nodeConnector.on("testEventInNode", (_evt, data, buffer)=>{
            console.log(_evt, data, buffer);
            nodeConnector.triggerPeer("testEventInPhoenix", data, buffer);
        });
    });

exports.echoTest = function (data, buffer) {
    console.log("Node fn called echoTest");
    return new Promise(resolve =>{
        if(!(buffer instanceof ArrayBuffer)) {
            resolve(data);
            return;
        }
        data.buffer = buffer;
        resolve(data);
    });
};

function areVariablesDeepEqual(a, b) {
    // Check if the types of a and b are different
    if (typeof a !== typeof b) {
        return false;
    }

    // If both a and b are objects, arrays, or null
    if ((a && typeof a === 'object') || (b && typeof b === 'object')) {
        if (Array.isArray(a) !== Array.isArray(b)) {
            return false;
        }

        if (Array.isArray(a)) {
            if (a.length !== b.length) {
                return false;
            }

            for (let i = 0; i < a.length; i++) {
                if (!areVariablesDeepEqual(a[i], b[i])) {
                    return false;
                }
            }
        } else {
            const keysA = Object.keys(a);
            const keysB = Object.keys(b);

            if (keysA.length !== keysB.length) {
                return false;
            }

            for (const key of keysA) {
                if (!b.hasOwnProperty(key) || !areVariablesDeepEqual(a[key], b[key])) {
                    return false;
                }
            }
        }
    } else {
        // For primitive types and functions, use strict equality
        return a === b;
    }

    return true;
}

function expectEqual(a,b) {
    if(!areVariablesDeepEqual(a,b)){
        throw new Error(`Expected ${a} to equal ${b}`);
    }
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

exports.echoTestOnPhoenixNodeConnector = async function () {
    console.log("Calling Phoenix node connector fn called echoTest");
    let result = await nodeConnector.execPeer("echoTestPhcode");
    expectEqual(result, null);
    result = await nodeConnector.execPeer("echoTestPhcode", 23);
    expectEqual(result, 23);
    result = await nodeConnector.execPeer("echoTestPhcode", null);
    expectEqual(result, null);
    result = await nodeConnector.execPeer("echoTestPhcode", false);
    expectEqual(result, false);
    result = await nodeConnector.execPeer("echoTestPhcode", "aString");
    expectEqual(result, "aString");
    let obj = {o:"z",x:{y:23}};
    result = await nodeConnector.execPeer("echoTestPhcode", obj, null);
    expectEqual(result, obj);

    // with array buffer
    let buffer = toArrayBuffer("Hello, World!");
    result = await nodeConnector.execPeer("echoTestPhcode", {}, buffer);
    expectEqual(areArrayBuffersEqual(result.buffer, buffer), true);

    buffer = toArrayBuffer("");
    result = await nodeConnector.execPeer("echoTestPhcode", {}, buffer);
    expectEqual(areArrayBuffersEqual(result.buffer, buffer), true);

    buffer = toArrayBuffer("nice");
    result = await nodeConnector.execPeer("echoTestPhcode", {otherData: 42}, buffer);
    expectEqual(areArrayBuffersEqual(result.buffer, buffer), true);
    expectEqual(result.otherData, 42);
};

exports.testFnNotThere = async function () {
    let err;
    try{
        await nodeConnector.execPeer("noopAPI");
    } catch (e) {
        err = e;
    }
    expectEqual(err.code, "NoSuchFn");
};

async function _shouldErrorOut(a,b) {
    let err;
    try{
        await nodeConnector.execPeer("echoTest", a, b);
    } catch (e) {
        err = e;
    }
    expectEqual(typeof err.message, "string");
}

exports.testErrExecCases = async function () {
    await _shouldErrorOut(toArrayBuffer("g"));
    await _shouldErrorOut({}, 34);
    let buffer = toArrayBuffer("Hello, World!");
    await _shouldErrorOut("", buffer);
    await _shouldErrorOut(34, buffer);
    await _shouldErrorOut(null, buffer);
};
