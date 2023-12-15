const NodeConnector = require("./node-connector");

const TEST_NODE_CONNECTOR_ID = "ph_test_connector";
NodeConnector.createNodeConnector(TEST_NODE_CONNECTOR_ID, exports)
    .then(nodeConnector =>{
        nodeConnector.on("hello", console.log);
    });

exports.echoTest = function (data, buffer) {
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
