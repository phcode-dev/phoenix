const NodeConnector = require("./node-connector");

const TEST_NODE_CONNECTOR_ID = "ph_test";
NodeConnector.createNodeConnector(TEST_NODE_CONNECTOR_ID, exports)
    .then(nodeConnector =>{
        nodeConnector.on("hello", console.log);
    });
