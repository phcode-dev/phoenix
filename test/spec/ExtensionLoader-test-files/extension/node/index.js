console.log("hello world node extension");

global.createNodeConnector("extension_connector_1", exports);

async function echoTest(name){
    return "hello from node " + name;
}

exports.echoTest = echoTest;